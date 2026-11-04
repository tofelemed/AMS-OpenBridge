using Dapper;
using Npgsql;

namespace Traverse.CplmApi.Services;

/// <summary>What the keep step of one archive retention pass did.</summary>
public sealed record ArchiveKeepResult(int Moved, int Released, int ReleasedByBytes, int Kept, long KeptBytes);

/// <summary>
/// CHG-102 Phase 5c — the sets that must outlive their archive day (cpm-20b). Just before a day partition of
/// analytics.evidence_archive is dropped, the sets of that day that are
///   PINNED  - evidence an investigation pins (investigation_reference.pinned, by evidence id or method run id), or
///   EPISODE - overlapped by an episode of the same loop (cplm_event_frames: opened before the window end, and still open
///             or closed after the window start) that is open or closed less than EVIDENCE_ARCHIVE_EPISODE days ago,
/// are copied to analytics.evidence_archive_kept in the drop's transaction, and their run rows stay (kept = true): the
/// workbench still opens them by method run. Episodes reference the boundary sets; nothing extra is written while the
/// day lives. Each pass re-checks the kept sets: no longer pinned or protected -> released (pack and run row deleted);
/// the episode-kept packs together over EVIDENCE_ARCHIVE_EPISODE max_bytes -> the oldest released first. Pinned sets are
/// never released by the cap. Without cpm-20b (<see cref="InstalledAsync"/> false) retention keeps the cpm-19 behaviour.
/// </summary>
public static class EvidenceArchiveKeep
{
    public const string PolicyClass = "EVIDENCE_ARCHIVE_EPISODE";
    public const int DefaultEpisodeDays = 30;
    public const long DefaultMaxBytes = 4L * 1024 * 1024 * 1024;

    /// <summary>Pinned: an investigation pins one of the set's evidence ids or method runs (r = the run row).</summary>
    private const string PinnedExpr = """
        EXISTS (SELECT 1 FROM analytics.investigation_reference i
                WHERE i.pinned AND (i.evidence_ids && r.evidence_ids OR i.method_run_id = ANY (r.method_run_ids)))
        """;

    /// <summary>Episode: a frame of the loop overlapping the set's window, open or closed inside the keep (@epDays NULL = no age limit).</summary>
    private const string EpisodeExpr = """
        (CAST(@epDays AS int) IS NULL OR CAST(@epDays AS int) > 0) AND EXISTS (
            SELECT 1 FROM analytics.cplm_event_frames f
            WHERE f.loop_id = r.loop_id
              AND f.opened_at < r.window_end
              AND (f.closed_at IS NULL OR f.closed_at > COALESCE(r.window_start, r.window_end - interval '24 hours'))
              AND (f.closed_at IS NULL OR CAST(@epDays AS int) IS NULL OR f.closed_at > now() - make_interval(days => CAST(@epDays AS int))))
        """;

    /// <summary>True when cpm-20b has been applied.</summary>
    public static async Task<bool> InstalledAsync(NpgsqlConnection conn) =>
        await conn.ExecuteScalarAsync<bool>("""
            SELECT to_regclass('analytics.evidence_archive_kept') IS NOT NULL
               AND EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_schema = 'analytics' AND table_name = 'evidence_archive_run' AND column_name = 'kept')
            """);

    /// <summary>(days after close, max_bytes) of the EVIDENCE_ARCHIVE_EPISODE row; the defaults when it is missing.</summary>
    public static async Task<(int? Days, long? MaxBytes)> PolicyAsync(NpgsqlConnection conn)
    {
        var row = await conn.QueryFirstOrDefaultAsync(
            "SELECT days, (to_jsonb(r) ->> 'max_bytes')::bigint AS max_bytes FROM analytics.retention_policy r WHERE record_class = @c", new { c = PolicyClass });
        return row is null ? (DefaultEpisodeDays, DefaultMaxBytes) : ((int?)row.days, (long?)row.max_bytes);
    }

    /// <summary>
    /// Inside the drop's transaction: copies the day's protected sets to the keep table and marks their run rows. Returns
    /// the sets moved. The caller then deletes the day's run rows that are NOT kept and drops the partition.
    /// </summary>
    public static async Task<int> MoveDayAsync(NpgsqlConnection conn, NpgsqlTransaction tx, string isoDay, int? episodeDays)
    {
        var moved = await conn.ExecuteAsync($"""
            INSERT INTO analytics.evidence_archive_kept
                (boundary_set_id, window_end, loop_id, window_kind, codec, artifact_count, payload_bytes, payload_sha256, payload, created_at, kept_reason)
            SELECT a.boundary_set_id, a.window_end, a.loop_id, a.window_kind, a.codec, a.artifact_count, a.payload_bytes,
                   a.payload_sha256, a.payload, a.created_at, p.reason
            FROM (SELECT r.boundary_set_id, r.window_end,
                         CASE WHEN {PinnedExpr} THEN 'PINNED' ELSE 'EPISODE' END AS reason
                  FROM analytics.evidence_archive_run r
                  WHERE r.partition_day = @day::date AND NOT r.kept AND ({PinnedExpr} OR {EpisodeExpr})) p
            JOIN analytics.evidence_archive a ON a.boundary_set_id = p.boundary_set_id AND a.window_end = p.window_end
            ON CONFLICT (boundary_set_id) DO NOTHING
            """, new { day = isoDay, epDays = episodeDays }, tx);
        await conn.ExecuteAsync("""
            UPDATE analytics.evidence_archive_run r SET kept = TRUE
            FROM analytics.evidence_archive_kept k
            WHERE k.boundary_set_id = r.boundary_set_id AND r.partition_day = @day::date AND NOT r.kept
            """, new { day = isoDay }, tx);
        return moved;
    }

    private sealed record KeptRow(Guid BoundarySetId, DateTime WindowEnd, long PayloadBytes, bool Pinned, bool Episode);

    /// <summary>Re-checks every kept set: released when nothing protects it any more, then the episode cap, oldest first.</summary>
    public static async Task<ArchiveKeepResult> SweepAsync(NpgsqlConnection conn, int moved, int lockTimeoutSeconds, ILogger? log, CancellationToken ct)
    {
        var (episodeDays, maxBytes) = await PolicyAsync(conn);
        var rows = (await conn.QueryAsync<KeptRow>(new CommandDefinition($"""
            SELECT k.boundary_set_id AS BoundarySetId, k.window_end AS WindowEnd, k.payload_bytes::bigint AS PayloadBytes,
                   COALESCE({PinnedExpr}, FALSE) AS Pinned, COALESCE({EpisodeExpr}, FALSE) AS Episode
            FROM analytics.evidence_archive_kept k
            LEFT JOIN analytics.evidence_archive_run r ON r.boundary_set_id = k.boundary_set_id
            ORDER BY k.window_end
            """, new { epDays = episodeDays }, cancellationToken: ct))).ToList();

        var release = rows.Where(x => !x.Pinned && !x.Episode).Select(x => x.BoundarySetId).ToList();
        var byBytes = new List<Guid>();
        var episodeBytes = rows.Where(x => !x.Pinned && x.Episode).Sum(x => x.PayloadBytes);
        if (maxBytes is { } cap)
            foreach (var x in rows.Where(x => !x.Pinned && x.Episode))      // oldest first (ordered by window end)
            {
                if (episodeBytes <= cap) break;
                byBytes.Add(x.BoundarySetId);
                episodeBytes -= x.PayloadBytes;
            }

        var gone = release.Concat(byBytes).ToArray();
        if (gone.Length > 0)
        {
            await using var tx = await conn.BeginTransactionAsync(ct);
            await conn.ExecuteAsync($"SET LOCAL lock_timeout = '{Math.Max(1, lockTimeoutSeconds)}s'", transaction: tx);
            await conn.ExecuteAsync("DELETE FROM analytics.evidence_archive_kept WHERE boundary_set_id = ANY(@ids)", new { ids = gone }, tx);
            await conn.ExecuteAsync("DELETE FROM analytics.evidence_archive_run WHERE boundary_set_id = ANY(@ids) AND kept", new { ids = gone }, tx);
            await tx.CommitAsync(ct);
        }
        // the reason follows the current protection (an episode-kept set pinned since is PINNED, so the cap leaves it)
        await conn.ExecuteAsync($"""
            UPDATE analytics.evidence_archive_kept k
            SET kept_reason = CASE WHEN {PinnedExpr} THEN 'PINNED' ELSE 'EPISODE' END
            FROM analytics.evidence_archive_run r
            WHERE r.boundary_set_id = k.boundary_set_id
              AND k.kept_reason <> CASE WHEN {PinnedExpr} THEN 'PINNED' ELSE 'EPISODE' END
            """);
        if (byBytes.Count > 0)
            log?.LogWarning("Evidence archive: {N} episode-kept set(s) released by the {Cap} MiB cap of {Class} (oldest first)",
                byBytes.Count, (maxBytes ?? 0) >> 20, PolicyClass);
        var left = rows.Where(x => !gone.Contains(x.BoundarySetId)).ToList();
        return new ArchiveKeepResult(moved, release.Count, byBytes.Count, left.Count, left.Sum(x => x.PayloadBytes));
    }
}
