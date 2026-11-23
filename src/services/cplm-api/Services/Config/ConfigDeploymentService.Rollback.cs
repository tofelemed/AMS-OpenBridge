// Gate Configuration gaps #4 and #2a (owner, 23 Nov: all gaps in this release).
// #4: a rollback is offered and accepted only on the scope's CURRENT deployment (config_active) with no rollback of it already
//     in flight, and it re-deploys the bundle of the newest ACTIVE_VERIFIED deployment of the same scope created before it with
//     another bundle. Before: the newest other SUPERSEDED / ACTIVE_VERIFIED bundle by updated_at - a superseded deployment
//     "rolled back" to the bundle running now, a second click rolled back one more version, and a first version got 409.
// #2a: the bundle each worker really runs for a loop (its newest APPLY ACK per governing scope, most specific wins), which can
//     differ from config_active while a deployment is partial.
// CHG-223: a "use the plant-wide settings" LOOP version that verified leaves no config_active row, so nothing rolls back from it;
//     a later own version whose rollback target is that marker re-deploys the marker, and ProbeAsync deletes the row again.
using Dapper;

namespace Traverse.CplmApi.Services.Config;

public sealed partial class ConfigDeploymentService
{
    public sealed record BundleRef(Guid BundleId, int Version);
    public sealed record WorkerRuns(Guid BundleId, int Version, string ScopeKind);

    private static readonly string[] InFlight = { "SCHEDULED", "PREPARING", "PREPARED", "APPLYING", "APPLIED", "PROBING" };

    /// <summary>True when <paramref name="d"/> is the deployment its scope runs under now (config_active).</summary>
    public async Task<bool> IsCurrentAsync(DeploymentView d, CancellationToken ct)
    {
        var b = await _store.GetAsync(d.BundleId, ct);
        if (b is null) return false;
        await using var conn = await _db.OpenConnectionAsync(ct);
        var current = await conn.ExecuteScalarAsync<Guid?>("SELECT deployment_id FROM cpm.config_active WHERE site = @site AND scope_kind = @kind AND scope_ref = @ref",
            new { site = b.Site, kind = b.ScopeKind, @ref = b.ScopeRef ?? "" });
        return current == d.DeploymentId;
    }

    /// <summary>The bundle a rollback of <paramref name="d"/> would re-deploy, or null when the server would refuse it.</summary>
    public async Task<BundleRef?> RollbackTargetAsync(DeploymentView d, CancellationToken ct)
    {
        if (!await IsCurrentAsync(d, ct)) return null;
        var b = await _store.GetAsync(d.BundleId, ct);
        if (b is null) return null;
        await using var conn = await _db.OpenConnectionAsync(ct);
        var open = await conn.ExecuteScalarAsync<bool>("SELECT EXISTS (SELECT 1 FROM cpm.config_deployment WHERE rollback_of = @id AND state = ANY(@states))",
            new { id = d.DeploymentId, states = InFlight });
        if (open) return null;
        var target = (await conn.QueryAsync<(Guid BundleId, int Version)>("""
            SELECT b.bundle_id, b.version
            FROM cpm.config_deployment dep JOIN cpm.gate_config_bundle b ON b.bundle_id = dep.bundle_id
            WHERE b.site = @site AND b.scope_kind = @kind AND b.scope_ref IS NOT DISTINCT FROM @ref
              AND dep.state = 'ACTIVE_VERIFIED' AND dep.created_at < @createdAt AND dep.bundle_id <> @bundleId
            ORDER BY dep.created_at DESC LIMIT 1
            """, new { site = b.Site, kind = b.ScopeKind, @ref = b.ScopeRef, createdAt = d.CreatedAt.UtcDateTime, bundleId = b.BundleId })).ToList();
        return target.Count == 0 ? null : new BundleRef(target[0].BundleId, target[0].Version);
    }

    /// <summary>A new deployment of the bundle that was active before the scope's current one; refused otherwise (409).</summary>
    public async Task<DeploymentView> RollbackAsync(Guid deploymentId, string actor, CancellationToken ct)
    {
        var d = await GetAsync(deploymentId, ct) ?? throw new KeyNotFoundException($"deployment {deploymentId} not found");
        if (!await IsCurrentAsync(d, ct))
            throw new ConfigStateException("only the deployment the scope runs under now can be rolled back");
        var target = await RollbackTargetAsync(d, ct)
            ?? throw new ConfigStateException("nothing to roll back to: this is the scope's first active version, or a rollback of it is already running");
        // the previous bundle's content was approved when it went active; re-deploying it needs no new approval
        await _store.SetStateAsync(target.BundleId, "APPROVED", ct);
        return await CreateAsync(target.BundleId, "ROLLBACK", null, deploymentId, actor, ct);
    }

    /// <summary>
    /// Per worker, the bundle it applied last for this loop's governing scopes (LOOP over PROFILE over SITE), or no entry. CHG-223:
    /// when the newest LOOP version a worker applied uses the plant-wide settings, the worker runs its PROFILE / SITE bundle.
    /// </summary>
    public async Task<IReadOnlyDictionary<string, WorkerRuns>> WorkerRunsAsync(string site, string loopId, string profileId, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var rows = await conn.QueryAsync<(string JobName, string ScopeKind, Guid BundleId, int Version, bool Inherits)>("""
            SELECT DISTINCT ON (a.job_name, b.scope_kind) a.job_name, b.scope_kind, b.bundle_id, b.version, (b.resolved ? 'inherit') AS inherits
            FROM cpm.config_worker_ack a
            JOIN cpm.config_deployment dep ON dep.deployment_id = a.deployment_id
            JOIN cpm.gate_config_bundle b ON b.bundle_id = dep.bundle_id
            WHERE a.phase = 'APPLY' AND a.status = 'ACK' AND a.bundle_hash = dep.content_hash AND b.site = @site
              AND ((b.scope_kind = 'LOOP' AND b.scope_ref = @loopId) OR (b.scope_kind = 'PROFILE' AND b.scope_ref = @profileId) OR (b.scope_kind = 'SITE' AND b.scope_ref = ''))
            ORDER BY a.job_name, b.scope_kind, a.received_at DESC
            """, new { site, loopId, profileId });
        var rank = new Dictionary<string, int>(StringComparer.Ordinal) { ["LOOP"] = 0, ["PROFILE"] = 1, ["SITE"] = 2 };
        return rows.Where(r => !(r.ScopeKind == "LOOP" && r.Inherits)).GroupBy(r => r.JobName, StringComparer.Ordinal)
            .ToDictionary(g => g.Key, g => g.OrderBy(r => rank.GetValueOrDefault(r.ScopeKind, 9)).Select(r => new WorkerRuns(r.BundleId, r.Version, r.ScopeKind)).First(),
                StringComparer.Ordinal);
    }
}
