using System.Data;
using Dapper;
using Npgsql;
using NpgsqlTypes;

namespace Traverse.CplmApi.Services;

/// <summary>What one archiver pass did.</summary>
public sealed record ArchivePassResult(bool Installed, int SetsArchived, int ArtifactsArchived, int MissingArtifacts, long PackBytes,
    long SourceBytes, int Pending, int Lost, int Late, ArchiveRetentionResult? Retention);

/// <summary>A boundary set found among the live manifests.</summary>
public sealed record BoundarySet(Guid SetId, string LoopId, string WindowKind, DateTime? WindowStart, DateTime WindowEnd, string? PlantTz,
    string? BoundaryKind, string? BoundaryLocalEnd, int Manifests, DateTime FirstCreated);

/// <summary>
/// CHG-102 Phase 5b-1 — the evidence BOUNDARY ARCHIVE writer. The Flink long + fusion jobs always emit the evidence of a
/// 12 h / 24 h window ending on a plant-time boundary (provenance emission_reason = BOUNDARY, one boundary_set_id per loop /
/// kind / window end). Those rows arrive in the live TRANSIENT class (6 h / 2 GiB) like every other artifact; this pass
/// copies each set, <see cref="EvidenceArchiveOptions.SettleMinutes"/> after its window end, into ONE packed lossless row
/// (<see cref="EvidenceArchivePack"/>) before the sweeper deletes it:
///   1. find the boundary sets not yet archived among the live manifests of the lookback (partial index
///      ix_evidence_manifest_boundary_set);
///   2. per settled set read its manifests + chunks in one REPEATABLE READ snapshot (no lock: the sweeper is never
///      blocked; a row it deletes meanwhile is simply not in the snapshot or is counted missing);
///   3. keep the COMPLETE artifacts whose chunks verify against their SHA-256, count the rest as missing;
///   4. write the run row (ON CONFLICT (boundary_set_id) DO NOTHING - idempotent) and the pack in ONE transaction, into
///      the day partition of the window end (created first when it does not exist).
/// FINDING evidence (emission_reason FINDING or absent) is never archived. Reconstructions are never archived.
/// Sets seen pending that vanish unarchived were lost to the sweep (health stat); a settled set still pending after
/// two passes, or one older than the TRANSIENT lifetime minus an hour, logs "archiver behind".
/// </summary>
public sealed class EvidenceArchiver
{
    private readonly NpgsqlDataSource _db;
    private readonly EvidenceArchiveOptions _opts;
    private readonly EvidenceArchiveStats _stats;
    private readonly ILogger? _log;
    private HashSet<Guid> _pendingLastPass = new();
    private DateTime? _lastPassUtc;

    public EvidenceArchiver(NpgsqlDataSource db, EvidenceArchiveOptions opts, EvidenceArchiveStats stats, ILogger? log = null)
    {
        _db = db;
        _opts = opts;
        _stats = stats;
        _log = log;
    }

    private const string Uuid = "'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'";
    private const string IsBoundary = "m.provenance->>'emission_reason' = 'BOUNDARY'";
    /// <summary>The set id as uuid, NULL when it is not one (a cast must never fail the whole statement).</summary>
    private const string SetIdOf = "CASE WHEN m.provenance->>'boundary_set_id' ~ " + Uuid + " THEN (m.provenance->>'boundary_set_id')::uuid END";

    private static string Ms(string key) => $"CASE WHEN m.provenance->>'{key}' ~ '^[0-9]+$' THEN (m.provenance->>'{key}')::bigint END";

    private static readonly string PendingSql = $"""
        SELECT {SetIdOf} AS set_id,
               min(m.provenance->>'loop_id') AS loop_id,
               min(COALESCE(m.provenance->>'window_kind', m.provenance->>'boundary_kind')) AS window_kind,
               min({Ms("window_start_ms")}) AS start_ms,
               max({Ms("window_end_ms")}) AS end_ms,
               min(m.provenance->>'plant_tz') AS plant_tz,
               min(m.provenance->>'boundary_kind') AS boundary_kind,
               min(m.provenance->>'boundary_local_end') AS boundary_local_end,
               count(*)::int AS manifests,
               min(m.created_at) AS first_created
        FROM analytics.evidence_manifest m
        WHERE {IsBoundary} AND {SetIdOf} IS NOT NULL
          AND m.created_at > @since AND m.reconstruction_of IS NULL
          AND NOT EXISTS (SELECT 1 FROM analytics.evidence_archive_run r WHERE r.boundary_set_id = {SetIdOf})
        GROUP BY 1
        HAVING min(m.provenance->>'loop_id') IS NOT NULL
        ORDER BY max({Ms("window_end_ms")}) NULLS LAST
        """;

    /// <summary>The boundary sets among the live manifests that are not archived yet.</summary>
    public static async Task<List<BoundarySet>> PendingAsync(NpgsqlConnection conn, DateTime since, CancellationToken ct)
    {
        var rows = await conn.QueryAsync(new CommandDefinition(PendingSql, new { since }, cancellationToken: ct, commandTimeout: 120));
        return rows.Select(r =>
        {
            var created = (DateTime)r.first_created;
            DateTime? start = r.start_ms is long s ? DateTimeOffset.FromUnixTimeMilliseconds(s).UtcDateTime : null;
            // a set without a window end (outside the contract) is filed under its first arrival, never dropped
            var end = r.end_ms is long e ? DateTimeOffset.FromUnixTimeMilliseconds(e).UtcDateTime : created;
            return new BoundarySet((Guid)r.set_id, (string)r.loop_id, (string?)r.window_kind ?? "unknown", start, end,
                (string?)r.plant_tz, (string?)r.boundary_kind, (string?)r.boundary_local_end, (int)r.manifests, created);
        }).ToList();
    }

    /// <summary>One pass: archive every settled set, then retention. Never throws for one bad set (logged, retried next pass).</summary>
    public async Task<ArchivePassResult> RunOnceAsync(DateTime utcNow, CancellationToken ct)
    {
        var now = utcNow.ToUniversalTime();
        await using (var probe = await _db.OpenConnectionAsync(ct))
        {
            _stats.Installed = await EvidenceArchiveRetention.InstalledAsync(probe);
            if (!_stats.Installed) return new ArchivePassResult(false, 0, 0, 0, 0, 0, 0, 0, 0, null);
        }
        int sets = 0, artifacts = 0, missing = 0, lost = 0, late = 0;
        long packBytes = 0, sourceBytes = 0;
        List<BoundarySet> pending;
        await using (var conn = await _db.OpenConnectionAsync(ct))
        {
            pending = await PendingAsync(conn, now.AddHours(-Math.Max(1, _opts.LookbackHours)), ct);
            late = await LateArrivalsAsync(conn, _lastPassUtc ?? now.AddHours(-Math.Max(1, _opts.LookbackHours)), ct);
        }
        var settle = TimeSpan.FromMinutes(Math.Max(0, _opts.SettleMinutes));
        var stillPending = new HashSet<Guid>();
        foreach (var set in pending)
        {
            if (set.WindowEnd + settle > now || sets >= Math.Max(1, _opts.MaxSetsPerPass)) { stillPending.Add(set.SetId); continue; }
            try
            {
                var r = await ArchiveSetAsync(set, ct);
                if (r is { } done)
                {
                    sets++; artifacts += done.Artifacts; missing += done.Missing; packBytes += done.PackBytes; sourceBytes += done.SourceBytes;
                    _stats.OnArchived(done.Artifacts, done.Missing, done.PackBytes, done.SourceBytes);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                stillPending.Add(set.SetId);
                _stats.LastError = $"{set.SetId}: {ex.Message}";
                _log?.LogWarning(ex, "Evidence archive: set {Set} ({Loop} {Kind} {End:o}) not archived; retried next pass", set.SetId, set.LoopId, set.WindowKind, set.WindowEnd);
            }
        }
        // a set pending last pass that is neither pending nor archived now was deleted by the TRANSIENT sweep
        var vanished = _pendingLastPass.Where(id => !pending.Any(p => p.SetId == id)).ToArray();
        if (vanished.Length > 0)
        {
            await using var conn = await _db.OpenConnectionAsync(ct);
            var archived = (await conn.QueryAsync<Guid>("SELECT boundary_set_id FROM analytics.evidence_archive_run WHERE boundary_set_id = ANY(@ids)",
                new { ids = vanished })).ToHashSet();
            lost = vanished.Count(id => !archived.Contains(id));
            if (lost > 0)
            {
                _stats.OnLost(lost);
                _log?.LogWarning("Evidence archive: {Lost} boundary set(s) were deleted by the TRANSIENT sweep before they were archived", lost);
            }
        }
        _pendingLastPass = stillPending;
        if (late > 0) _stats.OnLate(late);
        var behindAfter = now - settle - TimeSpan.FromMinutes(2 * Math.Max(1, _opts.IntervalMinutes));
        var atRisk = now.AddHours(-Math.Max(1, _opts.TransientHours - 1));
        var behind = pending.Where(p => stillPending.Contains(p.SetId) && (p.WindowEnd < behindAfter || p.FirstCreated < atRisk)).ToList();
        _stats.Behind = behind.Count > 0;
        _stats.PendingSets = stillPending.Count;
        if (behind.Count > 0)
            _log?.LogWarning("Evidence archive behind: {Count} settled boundary set(s) still unarchived (oldest window end {Oldest:o}); the TRANSIENT sweep deletes them after {Hours} h",
                behind.Count, behind.Min(b => b.WindowEnd), _opts.TransientHours);

        ArchiveRetentionResult? retention = null;
        try
        {
            retention = await EvidenceArchiveRetention.MaintainAsync(_db, now, _opts.LookaheadDays, _opts.LockTimeoutSeconds, _log, ct);
            _stats.ArchiveBytes = retention.BytesAfter;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _stats.LastError = "retention: " + ex.Message;
            _log?.LogWarning(ex, "Evidence archive retention failed; retried next pass");
        }
        _lastPassUtc = now;
        _stats.LastPassUtc = DateTimeOffset.UtcNow;
        return new ArchivePassResult(true, sets, artifacts, missing, packBytes, sourceBytes, stillPending.Count, lost, late, retention);
    }

    private sealed record Packed(int Artifacts, int Missing, long PackBytes, long SourceBytes);

    /// <summary>Packs and writes one set; null when another pass archived it first (idempotent).</summary>
    private async Task<Packed?> ArchiveSetAsync(BoundarySet set, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        List<dynamic> rows;
        List<(Guid evidence_id, int chunk_no, string sha256, byte[] payload)> chunks;
        await using (var snap = await conn.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct))
        {
            rows = (await conn.QueryAsync($"""
                SELECT {EvidenceManifestReader.ManifestColumns}
                FROM analytics.evidence_manifest m
                WHERE {IsBoundary} AND {SetIdOf} = @set AND m.reconstruction_of IS NULL
                ORDER BY artifact_kind, role_or_path, evidence_id
                """, new { set = set.SetId }, snap)).ToList();
            var ids = rows.Select(r => (Guid)r.evidence_id).ToArray();
            chunks = (await conn.QueryAsync<(Guid evidence_id, int chunk_no, string sha256, byte[] payload)>("""
                SELECT evidence_id, chunk_no, sha256, payload FROM analytics.evidence_chunk
                WHERE evidence_id = ANY(@ids) ORDER BY evidence_id, chunk_no
                """, new { ids }, snap)).ToList();
            await snap.CommitAsync(ct);
        }
        var byId = chunks.GroupBy(c => c.evidence_id).ToDictionary(g => g.Key, g => g.Select(c => new EvidenceChunkSpec(c.chunk_no, c.sha256, c.payload)).ToList());
        var kept = new List<ArchivedArtifact>();
        var missing = 0;
        foreach (var r in rows)
        {
            ArchivedManifest m = ArchivedManifest.FromRow(r);
            var own = byId.GetValueOrDefault(m.EvidenceId) ?? new List<EvidenceChunkSpec>();
            if (m.Readiness == "COMPLETE" && EvidenceArchivePack.Verifies(m, own)) kept.Add(new ArchivedArtifact(m, own));
            else missing++;
        }
        var pack = kept.Count > 0 ? EvidenceArchivePack.Pack(kept) : null;
        var sourceBytes = kept.Sum(a => a.Chunks.Sum(c => (long)c.Payload.Length));
        if (pack is not null) await EvidenceArchiveRetention.EnsureDayAsync(conn, EvidenceArchiveRetention.DayOf(set.WindowEnd), _opts.LockTimeoutSeconds, ct);

        await using var tx = await conn.BeginTransactionAsync(ct);
        var inserted = await conn.ExecuteAsync("""
            INSERT INTO analytics.evidence_archive_run
                (boundary_set_id, loop_id, window_kind, window_start, window_end, partition_day, plant_tz, boundary_kind, boundary_local_end,
                 artifact_count, missing_count, payload_bytes, source_bytes, evidence_ids, method_run_ids, artifact_sha256)
            VALUES (@setId, @loopId, @kind, @start, @end, @day::date, @tz, @bkind, @localEnd,
                    @count, @missing, @bytes, @source, @evidence, @runs, @shas)
            ON CONFLICT (boundary_set_id) DO NOTHING
            """, new
            {
                setId = set.SetId, loopId = set.LoopId, kind = set.WindowKind, start = set.WindowStart, end = set.WindowEnd,
                day = EvidenceArchiveRetention.Iso(EvidenceArchiveRetention.DayOf(set.WindowEnd)), tz = set.PlantTz, bkind = set.BoundaryKind,
                localEnd = set.BoundaryLocalEnd, count = kept.Count, missing, bytes = (long)(pack?.Length ?? 0), source = sourceBytes,
                evidence = kept.Select(a => a.Manifest.EvidenceId).ToArray(),
                runs = kept.Select(a => a.Manifest.MethodRunId).Distinct().ToArray(),
                shas = kept.Select(a => a.Manifest.Sha256).ToArray(),
            }, tx);
        if (inserted == 0) { await tx.RollbackAsync(ct); return null; }
        if (pack is not null)
        {
            await using var cmd = new NpgsqlCommand("""
                INSERT INTO analytics.evidence_archive (boundary_set_id, window_end, loop_id, window_kind, codec, artifact_count, payload_bytes, payload_sha256, payload)
                VALUES (@setId, @end, @loopId, @kind, @codec, @count, @bytes, @sha, @payload)
                ON CONFLICT DO NOTHING
                """, conn, tx);
            cmd.Parameters.AddWithValue("setId", set.SetId);
            cmd.Parameters.AddWithValue("end", set.WindowEnd);
            cmd.Parameters.AddWithValue("loopId", set.LoopId);
            cmd.Parameters.AddWithValue("kind", set.WindowKind);
            cmd.Parameters.AddWithValue("codec", EvidenceArchivePack.Codec);
            cmd.Parameters.AddWithValue("count", kept.Count);
            cmd.Parameters.AddWithValue("bytes", pack.Length);
            cmd.Parameters.AddWithValue("sha", EvidenceArchivePack.Sha256Hex(pack));
            cmd.Parameters.Add(new NpgsqlParameter("payload", NpgsqlDbType.Bytea) { Value = pack });
            await cmd.ExecuteNonQueryAsync(ct);
        }
        await tx.CommitAsync(ct);
        if (missing > 0)
            _log?.LogInformation("Evidence archive: set {Set} ({Loop} {Kind} {End:o}) archived with {Missing} artifact(s) not complete", set.SetId, set.LoopId, set.WindowKind, set.WindowEnd, missing);
        return new Packed(kept.Count, missing, pack?.Length ?? 0, sourceBytes);
    }

    /// <summary>Boundary artifacts that arrived after their set was archived (since the last pass).</summary>
    private static async Task<int> LateArrivalsAsync(NpgsqlConnection conn, DateTime since, CancellationToken ct) =>
        await conn.ExecuteScalarAsync<int>(new CommandDefinition($"""
            SELECT count(*)::int FROM analytics.evidence_manifest m
            JOIN analytics.evidence_archive_run r ON r.boundary_set_id = {SetIdOf}
            WHERE {IsBoundary} AND m.created_at > @since AND m.created_at > r.archived_at
              AND NOT (m.evidence_id = ANY (r.evidence_ids)) AND m.reconstruction_of IS NULL
            """, new { since }, cancellationToken: ct));
}
