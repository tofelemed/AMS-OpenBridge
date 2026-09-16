using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Traverse.CplmApi.Config;

namespace Traverse.CplmApi.Services.Config;

/// <summary>
/// v2.5 Task 3B.3 / 3C.1 (spec v6 §5.6): the message on traverse.cpa.context.gate-config.v1 - the
/// complete immutable bundle (bundle.schema.json) plus the deployment phase (PREPARE | APPLY), the
/// deployment id, the effective-from instant (event time) and an HMAC-SHA256 over the RFC 8785
/// canonical bundle with the service key, so a worker can refuse a bundle it cannot attribute to
/// the control plane (NACK UNSIGNED). Keyed by bundle_id: compaction keeps the latest phase.
/// </summary>
public static class BundleEnvelope
{
    public static JsonElement Bundle(BundleView b, IReadOnlyList<(string Approver, string Role, string ContentHash, string Decision, DateTimeOffset At, DateTimeOffset? ExpiresAt, string? Note)> approvals)
    {
        var doc = new
        {
            bundle_id = b.BundleId, version = b.Version, hash = b.ContentHash,
            scope = new { tenant = "default", site = b.Site, kind = b.ScopeKind, profile_id = b.ScopeKind == "PROFILE" ? b.ScopeRef : null, loop_id = b.ScopeKind is "LOOP" or "REGIME" ? b.ScopeRef?.Split('@')[0] : null, regime_id = b.ScopeKind == "REGIME" ? b.ScopeRef : null },
            parent_hashes = b.ParentHash is null ? Array.Empty<string>() : new[] { b.ParentHash },
            requires = new { catalogue_hash = b.CatalogueHash, schema_version = "1.0.0", method_versions = new Dictionary<string, string>(), build_capability = (string?)null },
            change_class = b.ChangeClass, effective_from = b.EffectiveFrom,
            approvals = approvals.Select(a => new { approver = a.Approver, role = a.Role, content_hash = a.ContentHash, decision = a.Decision, at = a.At, expires_at = a.ExpiresAt, note = a.Note }),
            constraints = new { }, layers = b.Layers, resolved = b.Resolved,
        };
        return JsonDocument.Parse(JsonSerializer.Serialize(doc)).RootElement.Clone();
    }

    public static string Signature(JsonElement bundle, string serviceKey)
    {
        var canonical = CanonicalJson.Canonicalize(bundle);
        return Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(serviceKey), Encoding.UTF8.GetBytes(canonical))).ToLowerInvariant();
    }

    public static string Message(JsonElement bundle, string phase, Guid deploymentId, DateTimeOffset? effectiveFrom, string? topologyGeneration, string serviceKey)
    {
        var msg = new
        {
            record_kind = "GATE_CONFIG_BUNDLE", phase, deployment_id = deploymentId, bundle_id = bundle.GetProperty("bundle_id").GetGuid(), hash = bundle.GetProperty("hash").GetString(),
            effective_from_ms = effectiveFrom?.ToUnixTimeMilliseconds(), topology_generation = topologyGeneration, bundle, signature = Signature(bundle, serviceKey), emitted_at_ms = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
        };
        return JsonSerializer.Serialize(msg);
    }
}
