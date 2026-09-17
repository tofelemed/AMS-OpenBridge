using System.Text.Json;
using Confluent.Kafka;
using Dapper;
using Microsoft.Extensions.Options;
using Npgsql;
using Traverse.CplmApi.BackgroundServices;

namespace Traverse.CplmApi.Services.Config;

public sealed record DeploymentView(Guid DeploymentId, Guid BundleId, string ContentHash, string Kind, Guid? RollbackOf, DateTimeOffset? ScheduledFor, string State,
    JsonElement RequiredMembers, IReadOnlyList<WorkerAckView> Acks, JsonElement? ProbeResults, int? Epoch, string? Error, string CreatedBy, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);

public sealed record WorkerAckView(string JobName, int SubtaskIndex, string Phase, string Status, string BundleHash, string JarSha256, string? SourceCommit, string? TopologyGeneration, string? Reason, DateTimeOffset ReceivedAt);

/// <summary>What the message producer needs; abstracted so tests drive the lifecycle without Kafka.</summary>
public interface IGateConfigPublisher
{
    Task PublishAsync(string bundleId, string message, CancellationToken ct);
}

public sealed class KafkaGateConfigPublisher : IGateConfigPublisher, IDisposable
{
    private readonly IProducer<string, string> _producer;
    private readonly string _topic;

    public KafkaGateConfigPublisher(IOptions<Traverse.CplmApi.Infrastructure.KafkaOptions> kafka, IOptions<CplmOptions> cplm)
    {
        _producer = new ProducerBuilder<string, string>(new ProducerConfig { BootstrapServers = kafka.Value.BootstrapServers, Acks = Acks.All, EnableIdempotence = true }).Build();
        _topic = cplm.Value.GateConfigTopic;
    }

    public async Task PublishAsync(string bundleId, string message, CancellationToken ct) =>
        await _producer.ProduceAsync(_topic, new Message<string, string> { Key = bundleId, Value = message }, ct);

    public void Dispose() => _producer.Dispose();
}

/// <summary>
/// v2.5 Task 3B.3 (spec v6 §5.6; NR-051, NR-054): the deployment state machine. SCHEDULED → PREPARE
/// broadcast → every required member ACKs PREPARE with the same bundle hash and one jar sha →
/// PREPARED → APPLY broadcast at effective_from → APPLY ACKs → PROBING (results carrying the
/// hash appear) → ACTIVE_VERIFIED (config_active updated, the previous bundle SUPERSEDED). Any
/// NACK → ACTIVATION_FAILED (audited CONFIG_REJECTED). A rollback is a new deployment of the
/// previously active bundle; history is kept. Membership = the jobs that announced a capability.
/// </summary>
public sealed class ConfigDeploymentService
{
    private readonly NpgsqlDataSource _db;
    private readonly ConfigStore _store;
    private readonly IGateConfigPublisher _publisher;
    private readonly ICplmAuditEmitter _audit;
    private readonly string _serviceKey;
    private readonly ILogger<ConfigDeploymentService> _logger;
    /// <summary>How long a deployment waits for every required worker before it is PARTIALLY_ACKNOWLEDGED.</summary>
    public TimeSpan AckWindow { get; }
    /// <summary>How long the probe waits for a result pinned to the hash before complete APPLY ACKs alone verify the deployment.</summary>
    public TimeSpan ProbeWindow { get; }

    public ConfigDeploymentService([FromKeyedServices("cplm")] NpgsqlDataSource db, ConfigStore store, IGateConfigPublisher publisher, ICplmAuditEmitter audit,
        IConfiguration config, ILogger<ConfigDeploymentService> logger)
    {
        _db = db; _store = store; _publisher = publisher; _audit = audit; _logger = logger;
        _serviceKey = config["Auth:ServiceKey"] ?? "traverse-internal-dev-key";
        AckWindow = TimeSpan.FromMinutes(Math.Clamp(config.GetValue("Cpm:ConfigAckWindowMinutes", 5.0), 0.0, 120.0));
        ProbeWindow = TimeSpan.FromMinutes(Math.Clamp(config.GetValue("Cpm:ConfigProbeWindowMinutes", 5.0), 0.0, 120.0));
    }

    /// <summary>The jobs that announced a capability (the membership the ACK matrix must cover), with the catalogue hash each runs.</summary>
    public async Task<IReadOnlyList<(string JobName, string JarSha256, string CatalogueHash)>> MembershipAsync(CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var rows = await conn.QueryAsync("SELECT job_name, jar_sha256, catalogue_hash FROM cpm.config_worker_capability ORDER BY job_name");
        return rows.Select(r => ((string)r.job_name, (string)r.jar_sha256, (string)r.catalogue_hash)).ToList();
    }

    public async Task<DeploymentView> CreateAsync(Guid bundleId, string kind, DateTimeOffset? scheduledFor, Guid? rollbackOf, string actor, CancellationToken ct)
    {
        var b = await _store.GetAsync(bundleId, ct) ?? throw new KeyNotFoundException($"bundle {bundleId} not found");
        if (kind == "ACTIVATE")
        {
            // the approval binds to the content hash, so a bundle whose previous deployment went partial or failed may be deployed again
            // (after the fleet was fixed) without a new approval - as long as that approval has not expired
            if (b.State is not ("APPROVED" or "PARTIALLY_ACKNOWLEDGED" or "ACTIVATION_FAILED")) throw new ConfigStateException($"only an APPROVED bundle can be deployed (state {b.State})");
            var approval = await _store.ValidApprovalAsync(bundleId, b.ContentHash, ct) ?? throw new ConfigStateException("no approval binds to the bundle's current content hash");
            if (approval.ExpiresAt is { } exp && exp < DateTimeOffset.UtcNow) throw new ConfigConflictException($"the approval expired at {exp:O}; approve again");
        }
        var members = await MembershipAsync(ct);
        if (members.Count == 0) throw new ConfigStateException("no CPLM job has announced a capability yet: nothing can acknowledge the bundle");
        var foreign = members.Where(m => m.CatalogueHash != b.CatalogueHash).Select(m => m.JobName).ToList();
        if (foreign.Count > 0) throw new ConfigStateException("the bundle was validated against catalogue " + b.CatalogueHash[..12] + " but these jobs run another: " + string.Join(", ", foreign));
        var id = Guid.NewGuid();
        var effective = scheduledFor ?? DateTimeOffset.UtcNow;
        var required = JsonSerializer.Serialize(members.Select(m => new { job_name = m.JobName, parallelism = 1, jar_sha256 = m.JarSha256 }));
        await using var conn = await _db.OpenConnectionAsync(ct);
        await conn.ExecuteAsync("""
            INSERT INTO cpm.config_deployment (deployment_id, bundle_id, content_hash, kind, rollback_of, scheduled_for, required_members, state, created_by)
            VALUES (@id, @bundleId, @hash, @kind, @rollbackOf, @scheduled, @required::jsonb, 'SCHEDULED', @actor)
            """, new { id, bundleId, hash = b.ContentHash, kind, rollbackOf, scheduled = effective.UtcDateTime, required, actor });
        await _store.SetStateAsync(bundleId, "SCHEDULED", ct, effective);
        await BroadcastAsync(id, b, "PREPARE", effective, ct);
        await conn.ExecuteAsync("UPDATE cpm.config_deployment SET state = 'PREPARING', updated_at = now() WHERE deployment_id = @id", new { id });
        _audit.Emit("CONFIG_DEPLOYMENT_SCHEDULED", actor, "config_deployment", id.ToString(), new { bundleId, kind, contentHash = b.ContentHash, effectiveFrom = effective });
        return (await GetAsync(id, ct))!;
    }

    private async Task BroadcastAsync(Guid deploymentId, BundleView b, string phase, DateTimeOffset effective, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var approvals = (await conn.QueryAsync("SELECT approver, role, content_hash, decision, created_at, expires_at, note FROM cpm.config_approval WHERE bundle_id = @id ORDER BY created_at", new { id = b.BundleId }))
            .Select(a => ((string)a.approver, (string)a.role, (string)a.content_hash, (string)a.decision, new DateTimeOffset(DateTime.SpecifyKind((DateTime)a.created_at, DateTimeKind.Utc)),
                a.expires_at is DateTime e ? new DateTimeOffset(DateTime.SpecifyKind(e, DateTimeKind.Utc)) : (DateTimeOffset?)null, (string?)a.note)).ToList();
        var bundle = BundleEnvelope.Bundle(b, approvals);
        var message = BundleEnvelope.Message(bundle, phase, deploymentId, effective, null, _serviceKey);
        await _publisher.PublishAsync(b.BundleId.ToString(), message, ct);
    }

    /// <summary>A worker's PREPARE / APPLY ACK or NACK (from the ACK consumer, or a test): recorded, then the deployment advances.</summary>
    public async Task RecordAckAsync(Guid deploymentId, string jobName, int subtaskIndex, string phase, string status, string bundleHash, string jarSha256, string? sourceCommit, string? topologyGeneration, string? reason, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        await conn.ExecuteAsync("""
            INSERT INTO cpm.config_worker_ack (deployment_id, job_name, subtask_index, phase, status, bundle_hash, jar_sha256, source_commit, topology_generation, reason)
            VALUES (@deploymentId, @jobName, @subtaskIndex, @phase, @status, @bundleHash, @jarSha256, @sourceCommit, @topologyGeneration, @reason)
            ON CONFLICT (deployment_id, job_name, subtask_index, phase) DO UPDATE SET status = EXCLUDED.status, bundle_hash = EXCLUDED.bundle_hash, jar_sha256 = EXCLUDED.jar_sha256,
                source_commit = EXCLUDED.source_commit, topology_generation = EXCLUDED.topology_generation, reason = EXCLUDED.reason, received_at = now()
            """, new { deploymentId, jobName, subtaskIndex, phase, status, bundleHash, jarSha256, sourceCommit, topologyGeneration, reason });
        await AdvanceAsync(deploymentId, ct);
    }

    /// <summary>Evaluates the ACK matrix and moves the deployment; also called by the probe timer.</summary>
    public async Task<DeploymentView?> AdvanceAsync(Guid deploymentId, CancellationToken ct)
    {
        var d = await GetAsync(deploymentId, ct);
        if (d is null) return null;
        var required = d.RequiredMembers.EnumerateArray().Select(m => m.GetProperty("job_name").GetString()!).ToList();
        var b = await _store.GetAsync(d.BundleId, ct);
        if (b is null) return d;
        await using var conn = await _db.OpenConnectionAsync(ct);
        switch (d.State)
        {
            case "PREPARING":
            {
                var nacks = d.Acks.Where(a => a.Phase == "PREPARE" && a.Status == "NACK").ToList();
                if (nacks.Count > 0) { await FailAsync(conn, d, b, "PREPARE NACK: " + string.Join("; ", nacks.Select(n => n.JobName + ": " + n.Reason)), ct); break; }
                var acks = d.Acks.Where(a => a.Phase == "PREPARE" && a.Status == "ACK").ToList();
                var wrongHash = acks.Where(a => a.BundleHash != d.ContentHash).ToList();
                if (wrongHash.Count > 0) { await FailAsync(conn, d, b, "PREPARE ACK for another hash: " + string.Join(", ", wrongHash.Select(a => a.JobName + "=" + a.BundleHash[..Math.Min(12, a.BundleHash.Length)])), ct); break; }
                // NR-051: two jars answering one deployment is a definite failure, whatever the coverage
                if (acks.Select(a => a.JarSha256).Distinct().Count() > 1) { await FailAsync(conn, d, b, "PREPARE ACKs from mixed jars: " + string.Join(", ", acks.Select(a => a.JobName + "=" + a.JarSha256[..Math.Min(12, a.JarSha256.Length)])), ct); break; }
                var covered = acks.Select(a => a.JobName).Distinct().ToHashSet(StringComparer.Ordinal);
                if (!required.All(covered.Contains)) { await PartialIfLateAsync(conn, d, required.Where(r => !covered.Contains(r)).ToList(), ct); break; }
                await conn.ExecuteAsync("UPDATE cpm.config_deployment SET state = 'PREPARED', updated_at = now() WHERE deployment_id = @id", new { id = d.DeploymentId });
                await _store.SetStateAsync(b.BundleId, "PREPARED", ct);
                await BroadcastAsync(d.DeploymentId, b, "APPLY", d.ScheduledFor ?? DateTimeOffset.UtcNow, ct);
                await conn.ExecuteAsync("UPDATE cpm.config_deployment SET state = 'APPLYING', updated_at = now() WHERE deployment_id = @id", new { id = d.DeploymentId });
                break;
            }
            case "APPLYING":
            {
                var nacks = d.Acks.Where(a => a.Phase == "APPLY" && a.Status == "NACK").ToList();
                if (nacks.Count > 0) { await FailAsync(conn, d, b, "APPLY NACK: " + string.Join("; ", nacks.Select(n => n.JobName + ": " + n.Reason)), ct); break; }
                var covered = d.Acks.Where(a => a.Phase == "APPLY" && a.Status == "ACK" && a.BundleHash == d.ContentHash).Select(a => a.JobName).Distinct().ToHashSet(StringComparer.Ordinal);
                if (!required.All(covered.Contains)) { await PartialIfLateAsync(conn, d, required.Where(r => !covered.Contains(r)).ToList(), ct); break; }
                await conn.ExecuteAsync("UPDATE cpm.config_deployment SET state = 'PROBING', updated_at = now() WHERE deployment_id = @id", new { id = d.DeploymentId });
                await ProbeAsync(conn, d, b, ct);
                break;
            }
            case "PROBING":
                await ProbeAsync(conn, d, b, ct);
                break;
        }
        return await GetAsync(deploymentId, ct);
    }

    private async Task PartialIfLateAsync(NpgsqlConnection conn, DeploymentView d, List<string> missing, CancellationToken ct)
    {
        if (DateTimeOffset.UtcNow - d.UpdatedAt > AckWindow)
        {
            await conn.ExecuteAsync("UPDATE cpm.config_deployment SET state = 'PARTIALLY_ACKNOWLEDGED', error = @err, updated_at = now() WHERE deployment_id = @id",
                new { id = d.DeploymentId, err = "no acknowledgement from " + string.Join(", ", missing) + " within " + AckWindow.TotalMinutes + " min" });
            await _store.SetStateAsync(d.BundleId, "PARTIALLY_ACKNOWLEDGED", ct);
        }
    }

    private async Task FailAsync(NpgsqlConnection conn, DeploymentView d, BundleView b, string reason, CancellationToken ct)
    {
        await conn.ExecuteAsync("UPDATE cpm.config_deployment SET state = 'ACTIVATION_FAILED', error = @reason, updated_at = now() WHERE deployment_id = @id", new { id = d.DeploymentId, reason });
        await _store.SetStateAsync(b.BundleId, "ACTIVATION_FAILED", ct);
        _audit.Emit("CONFIG_REJECTED", "system", "config_deployment", d.DeploymentId.ToString(), new { bundleId = b.BundleId, contentHash = b.ContentHash, reason });
        _logger.LogWarning("Configuration deployment {Deployment} failed: {Reason}", d.DeploymentId, reason);
    }

    /// <summary>ACTIVE_VERIFIED once a result pinned to the bundle hash exists (or, for a scope with no eligible loop yet, once the APPLY ACKs are complete and the probe window passed).</summary>
    private async Task ProbeAsync(NpgsqlConnection conn, DeploymentView d, BundleView b, CancellationToken ct)
    {
        var pinned = await conn.ExecuteScalarAsync<int>("""
            SELECT (SELECT count(*) FROM analytics.cplm_short_feature_results WHERE bundle_hash = @hash)
                 + (SELECT count(*) FROM analytics.cplm_long_feature_results WHERE bundle_hash = @hash)
                 + (SELECT count(*) FROM analytics.cplm_gate_results WHERE bundle_hash = @hash)
            """, new { hash = d.ContentHash });
        var probe = JsonSerializer.Serialize(new { pinnedResults = pinned, checkedAt = DateTimeOffset.UtcNow, rule = "ACTIVE_VERIFIED once a result carries the bundle hash, or after the probe window with complete APPLY ACKs" });
        var verified = pinned > 0 || DateTimeOffset.UtcNow - d.UpdatedAt >= ProbeWindow;
        if (!verified)
        {
            await conn.ExecuteAsync("UPDATE cpm.config_deployment SET probe_results = @probe::jsonb WHERE deployment_id = @id", new { id = d.DeploymentId, probe });
            return;
        }
        await conn.ExecuteAsync("""
            UPDATE cpm.config_deployment SET state = 'ACTIVE_VERIFIED', probe_results = @probe::jsonb, updated_at = now() WHERE deployment_id = @id;
            UPDATE cpm.gate_config_bundle SET state = 'SUPERSEDED', updated_at = now()
             WHERE bundle_id IN (SELECT bundle_id FROM cpm.config_active WHERE site = @site AND scope_kind = @kind AND scope_ref = @ref) AND bundle_id <> @bundleId;
            INSERT INTO cpm.config_active (site, scope_kind, scope_ref, bundle_id, content_hash, since, deployment_id)
            VALUES (@site, @kind, @ref, @bundleId, @hash, now(), @id)
            ON CONFLICT (site, scope_kind, scope_ref) DO UPDATE SET bundle_id = EXCLUDED.bundle_id, content_hash = EXCLUDED.content_hash, since = EXCLUDED.since, deployment_id = EXCLUDED.deployment_id
            """, new { id = d.DeploymentId, probe, site = b.Site, kind = b.ScopeKind, @ref = b.ScopeRef ?? "", bundleId = b.BundleId, hash = b.ContentHash });
        await _store.SetStateAsync(b.BundleId, "ACTIVE_VERIFIED", ct);
        if (d.Kind == "ROLLBACK" && d.RollbackOf is { } prev)
        {
            await conn.ExecuteAsync("UPDATE cpm.config_deployment SET state = 'ROLLED_BACK', updated_at = now() WHERE deployment_id = @prev", new { prev });
            var prevBundle = await conn.ExecuteScalarAsync<Guid?>("SELECT bundle_id FROM cpm.config_deployment WHERE deployment_id = @prev", new { prev });
            if (prevBundle is { } pb) await _store.SetStateAsync(pb, "ROLLED_BACK", ct);
        }
        _audit.Emit("CONFIG_ACTIVE_VERIFIED", "system", "config_deployment", d.DeploymentId.ToString(), new { bundleId = b.BundleId, contentHash = b.ContentHash, pinnedResults = pinned });
    }

    /// <summary>A new deployment of the previously active bundle of the same scope; the current one is marked ROLLED_BACK once the previous is verified again.</summary>
    public async Task<DeploymentView> RollbackAsync(Guid deploymentId, string actor, CancellationToken ct)
    {
        var d = await GetAsync(deploymentId, ct) ?? throw new KeyNotFoundException($"deployment {deploymentId} not found");
        var b = await _store.GetAsync(d.BundleId, ct) ?? throw new KeyNotFoundException("bundle missing");
        await using var conn = await _db.OpenConnectionAsync(ct);
        var previous = await conn.ExecuteScalarAsync<Guid?>("""
            SELECT bundle_id FROM cpm.gate_config_bundle
             WHERE site = @site AND scope_kind = @kind AND scope_ref IS NOT DISTINCT FROM @ref AND bundle_id <> @bundleId AND state IN ('SUPERSEDED', 'ACTIVE_VERIFIED')
             ORDER BY updated_at DESC LIMIT 1
            """, new { site = b.Site, kind = b.ScopeKind, @ref = b.ScopeRef, bundleId = b.BundleId })
            ?? throw new ConfigStateException("no previously active bundle of this scope to roll back to");
        await _store.SetStateAsync(previous, "APPROVED", ct);            // the previous bundle's content was approved when it went active; re-deploying it needs no new approval
        return await CreateAsync(previous, "ROLLBACK", null, deploymentId, actor, ct);
    }

    public async Task<DeploymentView?> GetAsync(Guid id, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var r = await conn.QueryFirstOrDefaultAsync("""
            SELECT deployment_id, bundle_id, content_hash, kind, rollback_of, scheduled_for, required_members::text AS required_members, state, probe_results::text AS probe_results, epoch, error, created_by, created_at, updated_at
            FROM cpm.config_deployment WHERE deployment_id = @id
            """, new { id });
        if (r is null) return null;
        var acks = (await conn.QueryAsync("SELECT job_name, subtask_index, phase, status, bundle_hash, jar_sha256, source_commit, topology_generation, reason, received_at FROM cpm.config_worker_ack WHERE deployment_id = @id ORDER BY received_at", new { id }))
            .Select(a => new WorkerAckView((string)a.job_name, (int)a.subtask_index, (string)a.phase, (string)a.status, (string)a.bundle_hash, (string)a.jar_sha256, (string?)a.source_commit, (string?)a.topology_generation, (string?)a.reason,
                new DateTimeOffset(DateTime.SpecifyKind((DateTime)a.received_at, DateTimeKind.Utc)))).ToList();
        return new DeploymentView((Guid)r.deployment_id, (Guid)r.bundle_id, (string)r.content_hash, (string)r.kind, (Guid?)r.rollback_of,
            r.scheduled_for is DateTime s ? new DateTimeOffset(DateTime.SpecifyKind(s, DateTimeKind.Utc)) : null, (string)r.state,
            JsonDocument.Parse((string)r.required_members).RootElement.Clone(), acks, r.probe_results is string p ? JsonDocument.Parse(p).RootElement.Clone() : null, (int?)r.epoch, (string?)r.error,
            (string)r.created_by, new DateTimeOffset(DateTime.SpecifyKind((DateTime)r.created_at, DateTimeKind.Utc)), new DateTimeOffset(DateTime.SpecifyKind((DateTime)r.updated_at, DateTimeKind.Utc)));
    }

    /// <summary>The deployments of a bundle (or of a site, through its bundles), newest first - the workspace lists them without knowing their ids.</summary>
    public async Task<IReadOnlyList<DeploymentView>> ListAsync(Guid? bundleId, string? site, int limit, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var ids = (await conn.QueryAsync<Guid>("""
            SELECT d.deployment_id FROM cpm.config_deployment d JOIN cpm.gate_config_bundle b ON b.bundle_id = d.bundle_id
             WHERE (@bundleId::uuid IS NULL OR d.bundle_id = @bundleId) AND (@site::text IS NULL OR b.site = @site)
             ORDER BY d.created_at DESC LIMIT @limit
            """, new { bundleId, site, limit = Math.Clamp(limit, 1, 200) })).ToList();
        var views = new List<DeploymentView>();
        foreach (var id in ids) { var v = await GetAsync(id, ct); if (v is not null) views.Add(v); }
        return views;
    }

    public async Task<IReadOnlyList<Guid>> OpenDeploymentIdsAsync(CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        return (await conn.QueryAsync<Guid>("SELECT deployment_id FROM cpm.config_deployment WHERE state IN ('PREPARING','APPLYING','PROBING')")).ToList();
    }
}
