using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Dapper;
using Npgsql;
using NpgsqlTypes;
using Traverse.CplmApi.Config;

namespace Traverse.CplmApi.Services.Config;

/// <summary>A bundle row as the API serves it.</summary>
public sealed record BundleView(
    Guid BundleId, int Version, string ContentHash, string Site, string ScopeKind, string? ScopeRef, Guid? ParentBundleId, string? ParentHash,
    string CatalogueHash, string ExecutionPlanHash, string ChangeClass, string State, JsonElement Layers, JsonElement Resolved, JsonElement? Validation,
    JsonElement? Shadow, DateTimeOffset? EffectiveFrom, string CreatedBy, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, string Etag, string? Note);

public sealed class ConfigConflictException : Exception { public ConfigConflictException(string m) : base(m) { } }
public sealed class ConfigForbiddenException : Exception { public ConfigForbiddenException(string m) : base(m) { } }
public sealed class ConfigStateException : Exception { public ConfigStateException(string m) : base(m) { } }

/// <summary>
/// v2.5 Task 3B.3 (spec v6 §5.3-5.6; NR-047..050): bundles are IMMUTABLE once past DRAFT - an edit
/// re-resolves and returns the bundle to DRAFT, invalidating approvals bound to the previous
/// content hash. The store resolves layers with EffectiveConfigResolver, hashes with RFC 8785,
/// validates with BundleValidator, and records every transition. No runtime value is read from
/// here by the engine: the deployment service publishes the bundle to the control plane.
/// </summary>
public sealed class ConfigStore
{
    private readonly NpgsqlDataSource _db;
    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);

    public ConfigStore([FromKeyedServices("cplm")] NpgsqlDataSource db) => _db = db;

    public static string ProfileIdFor(string loopType) => loopType.ToUpperInvariant() switch
    {
        "FIC" => "FLOW_FAST_SELF_REG", "PIC" => "PRESSURE_LIQUID_FAST", "PIC_GAS" => "PRESSURE_GAS_INTEGRATING", "PIC_VAPOUR" => "PRESSURE_VAPOUR_SLOW",
        "LIC" => "LEVEL_INTEGRATING", "TIC" => "TEMP_SLOW_SELF_REG", _ => "UNKNOWN",
    };

    // ── reads ──────────────────────────────────────────────────────────────
    public async Task<BundleView?> GetAsync(Guid id, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var r = await conn.QueryFirstOrDefaultAsync(Select + " WHERE bundle_id = @id", new { id });
        return r is null ? null : Shape(r);
    }

    public async Task<IReadOnlyList<BundleView>> ListAsync(string site, string? scopeKind, string? scopeRef, string? state, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var rows = await conn.QueryAsync(Select + """
             WHERE site = @site AND (@scopeKind::text IS NULL OR scope_kind = @scopeKind) AND (@scopeRef::text IS NULL OR scope_ref = @scopeRef)
               AND (@state::text IS NULL OR state = @state)
             ORDER BY created_at DESC LIMIT 200
            """, new { site, scopeKind, scopeRef, state });
        return rows.Select(Shape).ToList();
    }

    /// <summary>The ACTIVE bundle for the most specific scope that has one (LOOP > PROFILE > SITE), or null.</summary>
    public async Task<BundleView?> ActiveForLoopAsync(string site, string loopId, string profileId, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        foreach (var (kind, reference) in new[] { ("LOOP", loopId), ("PROFILE", profileId), ("SITE", "") })
        {
            var r = await conn.QueryFirstOrDefaultAsync(Select + " WHERE bundle_id = (SELECT bundle_id FROM cpm.config_active WHERE site = @site AND scope_kind = @kind AND scope_ref = @ref)", new { site, kind, @ref = reference });
            if (r is not null) return Shape(r);
        }
        return null;
    }

    public sealed record ActiveRow(string ScopeKind, string ScopeRef, Guid BundleId, string ContentHash, DateTimeOffset Since, Guid? DeploymentId);

    public async Task<IReadOnlyList<ActiveRow>> ActiveAsync(string site, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var rows = await conn.QueryAsync("SELECT scope_kind, scope_ref, bundle_id, content_hash, since, deployment_id FROM cpm.config_active WHERE site = @site", new { site });
        return rows.Select(r => new ActiveRow((string)r.scope_kind, (string)r.scope_ref, (Guid)r.bundle_id, (string)r.content_hash,
            new DateTimeOffset(DateTime.SpecifyKind((DateTime)r.since, DateTimeKind.Utc)), (Guid?)r.deployment_id)).ToList();
    }

    // ── drafts ─────────────────────────────────────────────────────────────
    /// <summary>
    /// A new draft for a scope: version = previous + 1; layers = the parent's (or the factory + profile
    /// layers from the build's factory-layer.json for a fresh scope); resolved and hashed at once.
    /// </summary>
    public async Task<BundleView> CreateDraftAsync(string site, string scopeKind, string? scopeRef, Guid? parentBundleId, string? profileId, string createdBy, string? note, CancellationToken ct)
    {
        scopeKind = scopeKind.ToUpperInvariant();
        if (!EffectiveConfigResolver.Order.Contains(scopeKind) || scopeKind == "FACTORY") throw new ArgumentException("scopeKind must be SITE, PROFILE, LOOP or REGIME");
        if (scopeKind != "SITE" && string.IsNullOrWhiteSpace(scopeRef)) throw new ArgumentException("scopeRef is required for a " + scopeKind + " scope");
        var reference = scopeKind == "SITE" ? "" : scopeRef!.Trim();
        await using var conn = await _db.OpenConnectionAsync(ct);
        JsonElement layers;
        if (parentBundleId is { } pid)
        {
            var parent = await conn.QueryFirstOrDefaultAsync("SELECT layers::text AS layers, content_hash FROM cpm.gate_config_bundle WHERE bundle_id = @pid", new { pid })
                ?? throw new KeyNotFoundException($"parent bundle {pid} not found");
            layers = JsonDocument.Parse((string)parent.layers).RootElement.Clone();
        }
        else
        {
            layers = FactoryLayers.InitialLayers(site, scopeKind, reference, profileId);
        }
        var version = await conn.ExecuteScalarAsync<int>("SELECT COALESCE(MAX(version), 0) + 1 FROM cpm.gate_config_bundle WHERE site = @site AND scope_kind = @scopeKind AND scope_ref IS NOT DISTINCT FROM @ref", new { site, scopeKind, @ref = reference });
        var id = Guid.NewGuid();
        var resolved = Resolve(layers);
        var etag = NewEtag(id);
        var parentHash = parentBundleId is { } p2 ? await conn.ExecuteScalarAsync<string>("SELECT content_hash FROM cpm.gate_config_bundle WHERE bundle_id = @p2", new { p2 }) : null;
        await conn.ExecuteAsync("""
            INSERT INTO cpm.gate_config_bundle (bundle_id, version, content_hash, site, scope_kind, scope_ref, parent_bundle_id, parent_hash, catalogue_hash, execution_plan_hash,
                                                change_class, state, layers, resolved, created_by, etag, note)
            VALUES (@id, @version, @hash, @site, @scopeKind, @ref, @parent, @parentHash, @catalogue, @planHash, 'POLICY', 'DRAFT', @layers::jsonb, @resolved::jsonb, @createdBy, @etag, @note)
            """, new
        {
            id, version, hash = resolved.ContentHash, site, scopeKind, @ref = reference, parent = parentBundleId, parentHash,
            catalogue = PropertyCatalogue.Current.CatalogueHash, planHash = ExecutionPlans.InstalledHash(),
            layers = layers.GetRawText(), resolved = resolved.ResolvedJson, createdBy, etag, note,
        });
        return (await GetAsync(id, ct))!;
    }

    public sealed record PatchOp(string Op, string Property, JsonElement? Value);

    /// <summary>Requested changes only, on the scope's own layer; If-Match guards concurrent editing; the bundle returns to DRAFT.</summary>
    public async Task<BundleView> PatchAsync(Guid id, string ifMatch, IReadOnlyList<PatchOp> ops, string actor, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var current = await GetAsync(id, ct) ?? throw new KeyNotFoundException($"bundle {id} not found");
        if (!string.Equals(current.Etag, ifMatch?.Trim('"', ' '), StringComparison.Ordinal)) throw new ConfigConflictException("stale etag: the bundle changed since you read it");
        if (current.State is "ACTIVE_VERIFIED" or "SUPERSEDED" or "ROLLED_BACK" or "SCHEDULED" or "PREPARED") throw new ConfigStateException($"a bundle in state {current.State} is immutable; create a new draft from it");
        var catalogue = PropertyCatalogue.Current;
        var layers = JsonSerializer.Deserialize<List<Dictionary<string, JsonElement>>>(current.Layers.GetRawText())!;
        var own = layers.FirstOrDefault(l => l["kind"].GetString() == current.ScopeKind) ?? throw new ConfigStateException("the bundle has no layer of its own scope");
        var content = own["content"].ValueKind == JsonValueKind.Object ? own["content"].EnumerateObject().ToDictionary(p => p.Name, p => p.Value, StringComparer.Ordinal) : new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        var edited = new List<string>();
        foreach (var op in ops)
        {
            if (!catalogue.TryGet(op.Property, out _)) throw new ArgumentException($"'{op.Property}' is not a catalogue property");
            switch (op.Op.ToLowerInvariant())
            {
                case "set":
                    if (op.Value is null || op.Value.Value.ValueKind == JsonValueKind.Null) throw new ArgumentException($"'{op.Property}': set needs a value (use reset to inherit)");
                    content[op.Property] = op.Value.Value;
                    break;
                case "reset":
                    content[op.Property] = JsonDocument.Parse("\"RESET_TO_INHERITED\"").RootElement;
                    break;
                default: throw new ArgumentException($"unknown op '{op.Op}' (set | reset)");
            }
            edited.Add(op.Property);
        }
        own["content"] = JsonDocument.Parse(JsonSerializer.Serialize(content)).RootElement;
        own["content_hash"] = JsonDocument.Parse(JsonSerializer.Serialize(CanonicalJson.Sha256(own["content"]))).RootElement;
        var layersJson = JsonSerializer.Serialize(layers);
        var resolved = Resolve(JsonDocument.Parse(layersJson).RootElement);
        var changeClass = ChangeClassifier.Classify(ChangeClassifier.Diff(current.Resolved.GetProperty("properties"), resolved.Properties).Concat(edited));
        var etag = NewEtag(id);
        await conn.ExecuteAsync("""
            UPDATE cpm.gate_config_bundle SET layers = @layers::jsonb, resolved = @resolved::jsonb, content_hash = @hash, change_class = @changeClass,
                   state = 'DRAFT', validation = NULL, shadow = NULL, etag = @etag, updated_at = now()
            WHERE bundle_id = @id
            """, new { id, layers = layersJson, resolved = resolved.ResolvedJson, hash = resolved.ContentHash, changeClass, etag });
        return (await GetAsync(id, ct))!;
    }

    /// <summary>VALIDATED or REJECTED with every reason; the report is stored on the bundle.</summary>
    public async Task<BundleView> ValidateAsync(Guid id, CancellationToken ct)
    {
        var b = await GetAsync(id, ct) ?? throw new KeyNotFoundException($"bundle {id} not found");
        if (b.State is not ("DRAFT" or "VALIDATED" or "REJECTED" or "SHADOW_EVALUATED")) throw new ConfigStateException($"cannot validate a bundle in state {b.State}");
        var report = BundleValidator.Report(b.Resolved.GetProperty("properties"), b.Resolved.GetProperty("execution_plan"));
        var state = report.Errors.Count == 0 ? "VALIDATED" : "REJECTED";
        var validation = JsonSerializer.Serialize(new { errors = report.Errors, warnings = report.Warnings, notReadByBuild = report.NotReadByBuild, changeClass = report.ChangeClass, validatedAt = DateTimeOffset.UtcNow, catalogueHash = PropertyCatalogue.Current.CatalogueHash });
        await using var conn = await _db.OpenConnectionAsync(ct);
        await conn.ExecuteAsync("UPDATE cpm.gate_config_bundle SET state = @state, validation = @validation::jsonb, change_class = @cc, etag = @etag, updated_at = now() WHERE bundle_id = @id",
            new { id, state, validation, cc = report.ChangeClass, etag = NewEtag(id) });
        return (await GetAsync(id, ct))!;
    }

    /// <summary>An independent reviewer approves THIS content hash; self-approval is refused; the approval expires.</summary>
    public async Task<BundleView> ApproveAsync(Guid id, string approver, string role, string? note, TimeSpan validity, bool controlAuthorityRequired, IReadOnlyList<string> approverRoles, CancellationToken ct)
    {
        var b = await GetAsync(id, ct) ?? throw new KeyNotFoundException($"bundle {id} not found");
        if (b.State is not ("VALIDATED" or "SHADOW_EVALUATED")) throw new ConfigStateException($"only a VALIDATED or SHADOW_EVALUATED bundle can be approved (state {b.State})");
        if (string.Equals(b.CreatedBy, approver, StringComparison.OrdinalIgnoreCase)) throw new ConfigForbiddenException("self-approval is refused: the approver must differ from the author");
        if (controlAuthorityRequired && !approverRoles.Contains("ControlAuthority", StringComparer.OrdinalIgnoreCase))
            throw new ConfigForbiddenException("a site-wide or objective / test-permission change needs an approver with the ControlAuthority role");
        await using var conn = await _db.OpenConnectionAsync(ct);
        await conn.ExecuteAsync("""
            INSERT INTO cpm.config_approval (approval_id, bundle_id, content_hash, approver, role, decision, note, expires_at)
            VALUES (@aid, @id, @hash, @approver, @role, 'APPROVED', @note, @expires);
            UPDATE cpm.gate_config_bundle SET state = 'APPROVED', etag = @etag, updated_at = now() WHERE bundle_id = @id
            """, new { aid = Guid.NewGuid(), id, hash = b.ContentHash, approver, role, note, expires = DateTimeOffset.UtcNow.Add(validity).UtcDateTime, etag = NewEtag(id) });
        return (await GetAsync(id, ct))!;
    }

    /// <summary>A valid (unexpired, hash-bound) approval of the bundle's current content, or null.</summary>
    public async Task<(string Approver, DateTimeOffset? ExpiresAt)?> ValidApprovalAsync(Guid id, string contentHash, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var r = await conn.QueryFirstOrDefaultAsync("SELECT approver, expires_at FROM cpm.config_approval WHERE bundle_id = @id AND content_hash = @hash AND decision = 'APPROVED' ORDER BY created_at DESC LIMIT 1", new { id, hash = contentHash });
        if (r is null) return null;
        DateTimeOffset? expires = r.expires_at is DateTime dt ? new DateTimeOffset(DateTime.SpecifyKind(dt, DateTimeKind.Utc)) : null;
        return ((string)r.approver, expires);
    }

    public async Task SetStateAsync(Guid id, string state, CancellationToken ct, DateTimeOffset? effectiveFrom = null, string? shadowJson = null)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        await conn.ExecuteAsync("UPDATE cpm.gate_config_bundle SET state = @state, effective_from = COALESCE(@eff, effective_from), shadow = COALESCE(@shadow::jsonb, shadow), etag = @etag, updated_at = now() WHERE bundle_id = @id",
            new { id, state, eff = effectiveFrom?.UtcDateTime, shadow = shadowJson, etag = NewEtag(id) });
    }

    // ── helpers ────────────────────────────────────────────────────────────
    internal sealed record Resolution(string ContentHash, string ResolvedJson, JsonElement Properties);

    /// <summary>Resolve the layers, build the resolved block {properties, sources, execution_plan}, hash {scope-less} layers + resolved (RFC 8785).</summary>
    internal static Resolution Resolve(JsonElement layers)
    {
        var list = layers.EnumerateArray().Select(l => new ConfigLayer(l.GetProperty("kind").GetString()!, l.TryGetProperty("ref", out var r) && r.ValueKind == JsonValueKind.String ? r.GetString() : null, l.GetProperty("content"))).ToList();
        var res = EffectiveConfigResolver.Resolve(list);
        if (res.Errors.Count > 0) throw new ArgumentException("layers do not resolve: " + string.Join("; ", res.Errors));
        var resolved = new { properties = res.Properties, sources = res.Sources, execution_plan = ExecutionPlans.Installed() };
        var resolvedJson = JsonSerializer.Serialize(resolved);
        var hashInput = JsonDocument.Parse(JsonSerializer.Serialize(new { layers, resolved })).RootElement;
        return new Resolution(CanonicalJson.Sha256(hashInput), resolvedJson, res.PropertiesElement());
    }

    private static string NewEtag(Guid id) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(id + "|" + DateTime.UtcNow.Ticks + "|" + Guid.NewGuid())))[..16].ToLowerInvariant();

    private const string Select = """
        SELECT bundle_id, version, content_hash, site, scope_kind, scope_ref, parent_bundle_id, parent_hash, catalogue_hash, execution_plan_hash, change_class, state,
               layers::text AS layers, resolved::text AS resolved, validation::text AS validation, shadow::text AS shadow, effective_from, created_by, created_at, updated_at, etag, note
        FROM cpm.gate_config_bundle
        """;

    private static BundleView Shape(dynamic r) => new(
        (Guid)r.bundle_id, (int)r.version, (string)r.content_hash, (string)r.site, (string)r.scope_kind, (string?)r.scope_ref, (Guid?)r.parent_bundle_id, (string?)r.parent_hash,
        (string)r.catalogue_hash, (string)r.execution_plan_hash, (string)r.change_class, (string)r.state,
        JsonDocument.Parse((string)r.layers).RootElement.Clone(), JsonDocument.Parse((string)r.resolved).RootElement.Clone(),
        r.validation is string v ? JsonDocument.Parse(v).RootElement.Clone() : null, r.shadow is string s ? JsonDocument.Parse(s).RootElement.Clone() : null,
        r.effective_from is DateTime ef ? new DateTimeOffset(DateTime.SpecifyKind(ef, DateTimeKind.Utc)) : null,
        (string)r.created_by, new DateTimeOffset(DateTime.SpecifyKind((DateTime)r.created_at, DateTimeKind.Utc)), new DateTimeOffset(DateTime.SpecifyKind((DateTime)r.updated_at, DateTimeKind.Utc)),
        (string)r.etag, (string?)r.note);
}
