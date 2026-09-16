using Dapper;
using Npgsql;

namespace Traverse.CplmApi.Services;

/// <summary>Where a method run lives: which tier's row (or response event), its gate and exact support.</summary>
public sealed record MethodRunLocation(
    string Tier, string Gate, string LoopId, string WindowKind, long FromMs, long ToMs, string BundleHash,
    int ContextRevision, int ResultRevision, string Purpose, Guid? AnalysisRunId, string? SourceCommit, string? JarSha256,
    string? DatasetHash, string Source, long RowId, string PayloadJson, DateTime CreatedAt, string? Site, int? SampleCount,
    /// <summary>The row's whole gate -> method_run_id map (the sibling runs of the same window); empty for a response event.</summary>
    IReadOnlyDictionary<string, string>? MethodRunIds = null);

/// <summary>
/// v2.5 Task 2C.2 (spec §3.2-3.3): a method_run_id names one gate of one evaluation. The fused row
/// carries every gate's id; a stage row (short / long) carries its tier's ids - the SAME ids, since
/// identity derives from loop, support, bundle hash and revisions - and a G12 run is a response
/// event. This resolver looks in all four places so the workbench can open any cell.
/// </summary>
public sealed class MethodRunResolver
{
    private static readonly string[] Gates =
        { "G0", "G1", "G2", "G2r", "G3", "G4", "G5", "G6", "G7", "G8", "G9", "G10", "G11", "G12", "G13", "G14", "G15" };
    private static readonly string[] ShortGates = { "G0", "G1", "G2", "G2r", "G3", "G4" };
    private static readonly string[] LongGates = { "G5", "G6", "G7", "G8", "G9", "G10", "G11" };
    private static readonly string[] FusionGates = { "G13", "G14", "G15" };

    private readonly NpgsqlDataSource _db;

    public MethodRunResolver([FromKeyedServices("cplm")] NpgsqlDataSource db) => _db = db;

    /// <summary>OR-chain of containment probes so the GIN index answers "which row carries this run under any gate".</summary>
    public static string ContainmentPredicate(string param) =>
        string.Join(" OR ", Gates.Select(g => $"method_run_ids @> jsonb_build_object('{g}', {param}::text)"));

    /// <summary>short | long | fusion for a rebuildable gate; null for G12 (event-keyed, owned by the response job) or unknown.</summary>
    public static string? ReconstructionTier(string gate) =>
        ShortGates.Contains(gate) ? "short" : LongGates.Contains(gate) ? "long" : FusionGates.Contains(gate) ? "fusion" : null;

    public async Task<MethodRunLocation?> ResolveAsync(Guid id, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        foreach (var (tier, table) in new[] { ("fusion", "analytics.cplm_gate_results"), ("short", "analytics.cplm_short_feature_results"), ("long", "analytics.cplm_long_feature_results") })
        {
            var row = await conn.QueryFirstOrDefaultAsync($"""
                SELECT r.id, r.loop_id, r.window_kind, r.window_start, r.window_end, r.sample_count, r.payload::text AS payload, r.created_at,
                       r.method_run_ids::text AS method_run_ids, r.bundle_hash, r.context_revision, r.result_revision, r.purpose, r.analysis_run_id,
                       r.source_commit, r.jar_sha256, r.dataset_hash, r.source, l.site
                FROM {table} r LEFT JOIN cpm.loop_registry l ON l.loop_id = r.loop_id
                WHERE {ContainmentPredicate("@id")}
                ORDER BY r.created_at DESC LIMIT 1
                """, new { id });
            if (row is null) continue;
            var gate = GateOf((string)row.method_run_ids, id) ?? "";
            return new MethodRunLocation(tier, gate,
                (string)row.loop_id, (string)row.window_kind, ToMs(row.window_start), ToMs(row.window_end), (string)row.bundle_hash,
                (int)row.context_revision, (int)row.result_revision, (string)row.purpose, (Guid?)row.analysis_run_id,
                (string?)row.source_commit, (string?)row.jar_sha256, (string?)row.dataset_hash, (string)row.source, (long)row.id,
                (string)row.payload, (DateTime)row.created_at, (string?)row.site, (int?)row.sample_count, MapOf((string)row.method_run_ids));
        }
        var ev = await conn.QueryFirstOrDefaultAsync("""
            SELECT e.event_id, e.loop_id, e.t0_ms, e.t_end_ms, e.bundle_hash, e.context_revision, e.result_revision, e.purpose, e.analysis_run_id,
                   e.source_commit, e.jar_sha256, e.dataset_hash, e.result::text AS result, e.created_at, l.site
            FROM analytics.response_event e LEFT JOIN cpm.loop_registry l ON l.loop_id = e.loop_id
            WHERE e.method_run_id = @id ORDER BY e.created_at DESC LIMIT 1
            """, new { id });
        if (ev is null) return null;
        return new MethodRunLocation("response", "G12", (string)ev.loop_id, "event", (long)ev.t0_ms, (long?)ev.t_end_ms ?? (long)ev.t0_ms,
            (string)ev.bundle_hash, (int)ev.context_revision, (int)ev.result_revision, (string)ev.purpose, (Guid?)ev.analysis_run_id,
            (string?)ev.source_commit, (string?)ev.jar_sha256, (string?)ev.dataset_hash, "flink-response", 0L, (string)ev.result,
            (DateTime)ev.created_at, (string?)ev.site, null);
    }

    public static IReadOnlyDictionary<string, string> MapOf(string methodRunIdsJson)
    {
        var map = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var p in System.Text.Json.JsonDocument.Parse(methodRunIdsJson).RootElement.EnumerateObject())
            if (p.Value.ValueKind == System.Text.Json.JsonValueKind.String) map[p.Name] = p.Value.GetString()!;
        return map;
    }

    public static string? GateOf(string methodRunIdsJson, Guid id)
    {
        var ids = System.Text.Json.JsonDocument.Parse(methodRunIdsJson).RootElement;
        foreach (var p in ids.EnumerateObject())
            if (string.Equals(p.Value.GetString(), id.ToString(), StringComparison.OrdinalIgnoreCase)) return p.Name;
        return null;
    }

    private static long ToMs(object value) => value switch
    {
        DateTime dt => new DateTimeOffset(DateTime.SpecifyKind(dt, DateTimeKind.Utc)).ToUnixTimeMilliseconds(),
        DateTimeOffset dto => dto.ToUnixTimeMilliseconds(),
        long l => l,
        _ => 0L,
    };
}
