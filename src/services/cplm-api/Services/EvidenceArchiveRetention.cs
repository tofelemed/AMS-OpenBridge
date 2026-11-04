using System.Globalization;
using Dapper;
using Npgsql;

namespace Traverse.CplmApi.Services;

/// <summary>What one archive retention pass did.</summary>
/// <summary>KeptPinned = whole days kept past retention (cpm-19 behaviour, without cpm-20b); Keep = the per-set keep (cpm-20b), else null.</summary>
public sealed record ArchiveRetentionResult(int Created, int DroppedByAge, int DroppedByBytes, int KeptPinned, long BytesAfter,
    ArchiveKeepResult? Keep = null);

/// <summary>
/// CHG-102 Phase 5b-1 — the day partitions of analytics.evidence_archive (<c>evidence_archive_pYYYYMMDD</c>, UTC days of
/// window_end; no DEFAULT partition: the archiver creates the day of every set it writes before writing it).
/// Retention (retention_policy EVIDENCE_ARCHIVE): DROP every partition whose day ended more than <c>days</c> ago; then,
/// while the partitions together exceed <c>max_bytes</c>, DROP the oldest one (never today's or a future day's). A
/// partition holding evidence an investigation pins (investigation_reference.pinned, by evidence id or method run id) is
/// never dropped, by age or by bytes - unless cpm-20b is applied: then only the sets that must outlive the day (pinned, or
/// overlapping an episode) are moved to analytics.evidence_archive_kept in the drop's transaction and the day is dropped
/// (<see cref="EvidenceArchiveKeep"/>, CHG-102 Phase 5c). The run rows of a dropped day go in the same transaction (a
/// kept set's run row stays). NULL days = keep forever,
/// NULL max_bytes = no cap; a missing row = the defaults (30 d, 12 GiB).
/// </summary>
public static class EvidenceArchiveRetention
{
    public const string Table = "evidence_archive";
    public const string PolicyClass = "EVIDENCE_ARCHIVE";
    public const int DefaultDays = 30;
    public const long DefaultMaxBytes = 12L * 1024 * 1024 * 1024;

    public static string PartitionName(DateOnly day) => Table + "_p" + day.ToString("yyyyMMdd", CultureInfo.InvariantCulture);

    /// <summary>A day as the yyyy-MM-dd text the SQL casts with ::date (no DateOnly type handler is assumed).</summary>
    public static string Iso(DateOnly day) => day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static string Literal(DateOnly day) => day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) + " 00:00:00+00";

    /// <summary>The UTC day a window end is filed under.</summary>
    public static DateOnly DayOf(DateTime windowEndUtc) => DateOnly.FromDateTime(windowEndUtc.ToUniversalTime());

    /// <summary>True when cpm-19 has been applied (both tables exist).</summary>
    public static async Task<bool> InstalledAsync(NpgsqlConnection conn) =>
        await conn.ExecuteScalarAsync<bool>("""
            SELECT to_regclass('analytics.evidence_archive') IS NOT NULL AND to_regclass('analytics.evidence_archive_run') IS NOT NULL
            """);

    /// <summary>The existing day partitions, oldest first (a foreign name is ignored, never dropped).</summary>
    public static async Task<List<DateOnly>> ExistingDaysAsync(NpgsqlConnection conn)
    {
        var names = await conn.QueryAsync<string>(
            "SELECT c.relname FROM pg_inherits h JOIN pg_class c ON c.oid = h.inhrelid WHERE h.inhparent = 'analytics.evidence_archive'::regclass");
        var days = new List<DateOnly>();
        foreach (var n in names)
            if (n.StartsWith(Table + "_p", StringComparison.Ordinal) && n.Length == Table.Length + 10
                && DateOnly.TryParseExact(n[(Table.Length + 2)..], "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d))
                days.Add(d);
        days.Sort();
        return days;
    }

    /// <summary>Creates the day's partition when it does not exist. Returns true when it was created.</summary>
    public static async Task<bool> EnsureDayAsync(NpgsqlConnection conn, DateOnly day, int lockTimeoutSeconds, CancellationToken ct)
    {
        var name = PartitionName(day);
        if (await conn.ExecuteScalarAsync<bool>("SELECT to_regclass(@n) IS NOT NULL", new { n = "analytics." + name })) return false;
        await using var tx = await conn.BeginTransactionAsync(ct);
        await conn.ExecuteAsync($"SET LOCAL lock_timeout = '{Math.Max(1, lockTimeoutSeconds)}s'", transaction: tx);
        await conn.ExecuteAsync($"""
            CREATE TABLE IF NOT EXISTS analytics.{name} PARTITION OF analytics.{Table}
                FOR VALUES FROM ('{Literal(day)}') TO ('{Literal(day.AddDays(1))}')
            """, transaction: tx);
        // the pack is already compressed: no TOAST compression attempt (a partition does not inherit the parent's setting)
        await conn.ExecuteAsync($"ALTER TABLE analytics.{name} ALTER COLUMN payload SET STORAGE EXTERNAL", transaction: tx);
        await tx.CommitAsync(ct);
        return true;
    }

    /// <summary>(days, max_bytes) of the EVIDENCE_ARCHIVE row; the defaults when the row is missing.</summary>
    public static async Task<(int? Days, long? MaxBytes)> PolicyAsync(NpgsqlConnection conn)
    {
        var row = await conn.QueryFirstOrDefaultAsync(
            "SELECT days, (to_jsonb(r) ->> 'max_bytes')::bigint AS max_bytes FROM analytics.retention_policy r WHERE record_class = @c", new { c = PolicyClass });
        return row is null ? (DefaultDays, DefaultMaxBytes) : ((int?)row.days, (long?)row.max_bytes);
    }

    private const string PinnedSql = """
        SELECT EXISTS (
            SELECT 1 FROM analytics.evidence_archive_run r
            JOIN analytics.investigation_reference i
              ON i.pinned AND (i.evidence_ids && r.evidence_ids OR i.method_run_id = ANY (r.method_run_ids))
            WHERE r.partition_day = @day::date)
        """;

    /// <summary>One pass: today .. today + lookahead created, then retention by age and by bytes.</summary>
    public static async Task<ArchiveRetentionResult> MaintainAsync(NpgsqlDataSource db, DateTime utcNow, int lookaheadDays,
        int lockTimeoutSeconds, ILogger? log, CancellationToken ct)
    {
        await using var conn = await db.OpenConnectionAsync(ct);
        var today = DateOnly.FromDateTime(utcNow.ToUniversalTime());
        var created = 0;
        for (var i = 0; i <= Math.Max(0, lookaheadDays); i++)
            if (await EnsureDayAsync(conn, today.AddDays(i), lockTimeoutSeconds, ct)) created++;

        var (days, maxBytes) = await PolicyAsync(conn);
        var keep = await EvidenceArchiveKeep.InstalledAsync(conn);
        int? episodeDays = keep ? (await EvidenceArchiveKeep.PolicyAsync(conn)).Days : null;
        var moved = 0;
        var existing = await ExistingDaysAsync(conn);
        int byAge = 0, byBytes = 0, pinned = 0;
        var keptPinned = new HashSet<DateOnly>();
        if (days is { } d)
        {
            var cutoff = today.AddDays(-Math.Max(1, d));                 // a day whose end (day + 1) is at or before the cutoff
            foreach (var day in existing.Where(x => x.AddDays(1) <= cutoff).ToList())
            {
                if (!keep && await IsPinnedAsync(conn, day)) { keptPinned.Add(day); continue; }
                moved += await DropAsync(conn, day, lockTimeoutSeconds, keep, episodeDays, ct);
                existing.Remove(day);
                byAge++;
            }
        }
        var sizes = new Dictionary<DateOnly, long>();
        foreach (var day in existing)
            sizes[day] = await conn.ExecuteScalarAsync<long>("SELECT pg_total_relation_size(@n::regclass)", new { n = "analytics." + PartitionName(day) });
        var total = sizes.Values.Sum();
        if (maxBytes is { } cap && total > cap)
        {
            foreach (var day in existing.Where(x => x < today).ToList())
            {
                if (total <= cap) break;
                if (!keep && (keptPinned.Contains(day) || await IsPinnedAsync(conn, day))) { keptPinned.Add(day); continue; }
                moved += await DropAsync(conn, day, lockTimeoutSeconds, keep, episodeDays, ct);
                total -= sizes[day];
                byBytes++;
            }
            if (total > cap)
                log?.LogWarning("Evidence archive: {Mb} MiB is still over its cap of {Cap} MiB (only today's, future or pinned partitions are left)",
                    total >> 20, cap >> 20);
        }
        pinned = keptPinned.Count;
        if (pinned > 0) log?.LogInformation("Evidence archive: {Pinned} day partition(s) past retention kept - they hold pinned investigation evidence", pinned);
        var kept = keep ? await EvidenceArchiveKeep.SweepAsync(conn, moved, lockTimeoutSeconds, log, ct) : null;
        if (kept is { Moved: > 0 } or { Released: > 0 })
            log?.LogInformation("Evidence archive: {Moved} set(s) kept past their day (pinned or episode), {Released} released; {Kept} kept, {Mb} MiB",
                kept.Moved, kept.Released + kept.ReleasedByBytes, kept.Kept, kept.KeptBytes >> 20);
        return new ArchiveRetentionResult(created, byAge, byBytes, pinned, total, kept);
    }

    private static async Task<bool> IsPinnedAsync(NpgsqlConnection conn, DateOnly day) =>
        await conn.ExecuteScalarAsync<bool>(PinnedSql, new { day = Iso(day) });

    /// <summary>Drops one day partition and its run rows; with the keep (cpm-20b) its protected sets are moved out first. Returns the sets moved.</summary>
    private static async Task<int> DropAsync(NpgsqlConnection conn, DateOnly day, int lockTimeoutSeconds, bool keep, int? episodeDays, CancellationToken ct)
    {
        await using var tx = await conn.BeginTransactionAsync(ct);
        await conn.ExecuteAsync($"SET LOCAL lock_timeout = '{Math.Max(1, lockTimeoutSeconds)}s'", transaction: tx);
        var moved = keep ? await EvidenceArchiveKeep.MoveDayAsync(conn, tx, Iso(day), episodeDays) : 0;
        await conn.ExecuteAsync(keep
            ? "DELETE FROM analytics.evidence_archive_run WHERE partition_day = @day::date AND NOT kept"
            : "DELETE FROM analytics.evidence_archive_run WHERE partition_day = @day::date", new { day = Iso(day) }, tx);
        await conn.ExecuteAsync($"DROP TABLE IF EXISTS analytics.{PartitionName(day)}", transaction: tx);
        await tx.CommitAsync(ct);
        return moved;
    }
}
