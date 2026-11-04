using System.Collections.Concurrent;
using Dapper;
using Npgsql;

namespace Traverse.CplmApi.Services;

/// <summary>One archived boundary set as listed for a loop (no payload).</summary>
public sealed record ArchivedSetView(Guid BoundarySetId, string LoopId, string WindowKind, DateTime? WindowStart, DateTime WindowEnd,
    string? PlantTz, string? BoundaryKind, string? BoundaryLocalEnd, int ArtifactCount, int MissingCount, long PayloadBytes,
    long SourceBytes, Guid[] MethodRunIds, DateTime ArchivedAt);

/// <summary>
/// CHG-102 Phase 5b-1 — the read side of the evidence boundary archive: when a method run or an evidence id is no longer
/// in the live tables, its archived set is found through analytics.evidence_archive_run (GIN on method_run_ids /
/// evidence_ids), the one packed row is read from its day partition and unpacked to the original manifests and chunk
/// bytes. A database without cpm-19 reads as "not archived" (never an error on the evidence read path).
/// </summary>
public static class EvidenceArchiveReader
{
    private const string UndefinedTable = "42P01";

    /// <summary>
    /// The archived artifacts of one method run (pack order), or an empty list. CHG-102 Phase 5b-2: trace-form artifacts
    /// are rebuilt from the historian through <paramref name="traces"/> (or come back unavailable without one).
    /// </summary>
    public static async Task<IReadOnlyList<ArchivedArtifact>> ForMethodRunAsync(NpgsqlConnection conn, Guid methodRunId, CancellationToken ct,
        EvidenceTraceRehydrator? traces = null)
    {
        var set = await LocateAsync(conn, "method_run_ids", methodRunId, ct);
        if (set is null) return Array.Empty<ArchivedArtifact>();
        var all = await LoadCachedAsync(conn, set.Value.SetId, set.Value.WindowEnd, ct);
        return await ResolveAsync(all.Where(a => a.Manifest.MethodRunId == methodRunId).ToList(), traces, ct);
    }

    /// <summary>One archived artifact by evidence id, or null (a trace-form one rebuilt, or marked unavailable).</summary>
    public static async Task<ArchivedArtifact?> ArtifactAsync(NpgsqlConnection conn, Guid evidenceId, CancellationToken ct,
        EvidenceTraceRehydrator? traces = null)
    {
        var set = await LocateAsync(conn, "evidence_ids", evidenceId, ct);
        if (set is null) return null;
        var all = await LoadCachedAsync(conn, set.Value.SetId, set.Value.WindowEnd, ct);
        var one = all.FirstOrDefault(a => a.Manifest.EvidenceId == evidenceId);
        return one is null ? null : (await ResolveAsync(new List<ArchivedArtifact> { one }, traces, ct))[0];
    }

    // CHG-102 perf: an archived set is immutable (its pack carries its own SHA-256), and a Workbench window reads it 3+ times
    // (manifest, bundle, every chunk of the per-chunk route) - each read decompressed the whole pack again. Unpacked sets are
    // kept CacheFor, newest first, within CacheBytes. A set dropped by retention loses its run row first, so LocateAsync
    // stops finding it and a cached copy is never served after a drop. Trace-form artifacts are cached un-rebuilt (the
    // rehydrator keeps its own short cache: the historian decides each time whether the trace is still servable).
    private static readonly ConcurrentDictionary<Guid, (DateTime At, long Bytes, List<ArchivedArtifact> Set)> SetCache = new();
    public static TimeSpan CacheFor { get; set; } = TimeSpan.FromMinutes(10);
    public static long CacheBytes { get; set; } = 64L * 1024 * 1024;

    /// <summary>LoadAsync through the unpacked-set cache.</summary>
    public static async Task<List<ArchivedArtifact>> LoadCachedAsync(NpgsqlConnection conn, Guid setId, DateTime windowEnd, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        if (SetCache.TryGetValue(setId, out var hit) && now - hit.At < CacheFor) return hit.Set;
        var set = await LoadAsync(conn, setId, windowEnd, ct);
        if (set.Count == 0) return set;                     // "not archived any more": never cached
        var bytes = set.Sum(a => a.Chunks.Sum(c => (long)c.Payload.Length) + 2048);
        if (bytes > CacheBytes / 4) return set;             // one huge set must not flush the rest
        SetCache[setId] = (now, bytes, set);
        var total = SetCache.Values.Sum(v => v.Bytes);
        foreach (var old in SetCache.Where(kv => now - kv.Value.At >= CacheFor).ToList()) { SetCache.TryRemove(old.Key, out _); total -= old.Value.Bytes; }
        foreach (var old in SetCache.OrderBy(kv => kv.Value.At).ToList())
        {
            if (total <= CacheBytes) break;
            if (SetCache.TryRemove(old.Key, out var gone)) total -= gone.Bytes;
        }
        return set;
    }

    /// <summary>Empties the unpacked-set cache (tests that alter a pack in place).</summary>
    public static void ClearCache() => SetCache.Clear();

    private static async Task<IReadOnlyList<ArchivedArtifact>> ResolveAsync(List<ArchivedArtifact> list, EvidenceTraceRehydrator? traces,
        CancellationToken ct) =>
        traces is null ? list.Select(EvidenceTraceRehydrator.NotConfigured).ToList() : await traces.ResolveAllAsync(list, ct);

    /// <summary>The site of the loop an archived method run / evidence id belongs to (null when not archived or unsited).</summary>
    public static async Task<string?> SiteOfAsync(NpgsqlConnection conn, Guid id, bool byEvidenceId, CancellationToken ct)
    {
        var column = byEvidenceId ? "evidence_ids" : "method_run_ids";
        try
        {
            return await conn.ExecuteScalarAsync<string?>(new CommandDefinition($"""
                SELECT l.site FROM analytics.evidence_archive_run r JOIN cpm.loop_registry l ON l.loop_id = r.loop_id
                WHERE r.{column} @> ARRAY[@id]::uuid[] LIMIT 1
                """, new { id }, cancellationToken: ct));
        }
        catch (PostgresException ex) when (ex.SqlState == UndefinedTable) { return null; }
    }

    /// <summary>The archived sets of a loop, newest first.</summary>
    public static async Task<IReadOnlyList<ArchivedSetView>> ListForLoopAsync(NpgsqlConnection conn, string loopId, DateTime from, DateTime to,
        string? windowKind, int limit, CancellationToken ct)
    {
        try
        {
            var rows = await conn.QueryAsync(new CommandDefinition("""
                SELECT boundary_set_id, loop_id, window_kind, window_start, window_end, plant_tz, boundary_kind, boundary_local_end,
                       artifact_count, missing_count, payload_bytes, source_bytes, method_run_ids, archived_at
                FROM analytics.evidence_archive_run
                WHERE lower(loop_id) = lower(@loopId) AND window_end >= @from AND window_end <= @to
                  AND (@kind::text IS NULL OR window_kind = @kind)
                ORDER BY window_end DESC, window_kind
                LIMIT @limit
                """, new { loopId, from, to, kind = windowKind, limit }, cancellationToken: ct));
            return rows.Select(r => new ArchivedSetView((Guid)r.boundary_set_id, (string)r.loop_id, (string)r.window_kind,
                (DateTime?)r.window_start, (DateTime)r.window_end, (string?)r.plant_tz, (string?)r.boundary_kind, (string?)r.boundary_local_end,
                (int)r.artifact_count, (int)r.missing_count, (long)r.payload_bytes, (long)r.source_bytes, (Guid[])r.method_run_ids,
                (DateTime)r.archived_at)).ToList();
        }
        catch (PostgresException ex) when (ex.SqlState == UndefinedTable) { return Array.Empty<ArchivedSetView>(); }
    }

    private static async Task<(Guid SetId, DateTime WindowEnd)?> LocateAsync(NpgsqlConnection conn, string column, Guid id, CancellationToken ct)
    {
        try
        {
            var r = await conn.QueryFirstOrDefaultAsync(new CommandDefinition($"""
                SELECT boundary_set_id, window_end FROM analytics.evidence_archive_run
                WHERE {column} @> ARRAY[@id]::uuid[] AND artifact_count > 0
                ORDER BY archived_at DESC LIMIT 1
                """, new { id }, cancellationToken: ct));
            return r is null ? null : ((Guid)r.boundary_set_id, (DateTime)r.window_end);
        }
        catch (PostgresException ex) when (ex.SqlState == UndefinedTable) { return null; }
    }

    private static async Task<dynamic?> KeptAsync(NpgsqlConnection conn, Guid setId, CancellationToken ct)
    {
        try
        {
            return await conn.QueryFirstOrDefaultAsync(new CommandDefinition(
                "SELECT codec, payload, payload_sha256 FROM analytics.evidence_archive_kept WHERE boundary_set_id = @setId",
                new { setId }, cancellationToken: ct));
        }
        catch (PostgresException ex) when (ex.SqlState == UndefinedTable) { return null; }
    }

    /// <summary>Every artifact of one archived set; the pack's own SHA-256 is checked before it is unpacked.</summary>
    public static async Task<List<ArchivedArtifact>> LoadAsync(NpgsqlConnection conn, Guid setId, DateTime windowEnd, CancellationToken ct)
    {
        var r = await conn.QueryFirstOrDefaultAsync(new CommandDefinition("""
            SELECT codec, payload, payload_sha256 FROM analytics.evidence_archive
            WHERE boundary_set_id = @setId AND window_end = @windowEnd
            """, new { setId, windowEnd }, cancellationToken: ct));
        // CHG-102 Phase 5c: a set kept past its day (pinned / episode, cpm-20b) is served from the keep table
        if (r is null) r = await KeptAsync(conn, setId, ct);
        if (r is null) return new();       // the run row outlived its partition (a drop in progress): not archived any more
        // CHG-102 Phase 5b-2: cpax2 trace-form artifacts come back un-rebuilt (EvidenceTraceRehydrator serves them)
        if ((string)r.codec is not (EvidenceArchivePack.Codec or EvidenceArchivePack.Codec2)) throw new InvalidDataException($"evidence archive codec {(string)r.codec} is not supported");
        var payload = (byte[])r.payload;
        if (!string.Equals(EvidenceArchivePack.Sha256Hex(payload), (string)r.payload_sha256, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException($"evidence archive pack {setId} does not match its checksum");
        return EvidenceArchivePack.Unpack(payload);
    }
}
