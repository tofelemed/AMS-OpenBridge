using System.Globalization;
using Dapper;
using Npgsql;

namespace Traverse.CplmApi.Services;

/// <summary>What one maintenance pass did: partitions Created / Dropped, rows Relocated / Pruned, tables Skipped (not partitioned).</summary>
public sealed record PartitionMaintenanceResult(int Created, int Dropped, int Relocated, int Pruned, int Skipped);

/// <summary>
/// CHG-033 — retention for the plant's three result tables, which scripts/cpm-10b turned into daily
/// RANGE partitions on window_end (plain PostgreSQL; the lab keeps Timescale hypertables, and every
/// table that is not partitioned is left alone). One pass, per table: create the partitions for
/// today .. today + LookaheadDays, moving the rows parked in DEFAULT for those days first (a restart
/// after an outage longer than the lookahead would otherwise fail with "would be violated by some
/// row"); DROP the partitions whose day is before today - retention_policy days (instant; the space
/// returns to the filesystem); DELETE the DEFAULT rows below the same cutoff (replays of old windows).
/// Retention is by window day for every purpose - the lab's Timescale semantics, only shorter.
/// </summary>
public static class FeaturePartitions
{
    /// <summary>(table, retention_policy record_class, days used when the row is missing)</summary>
    public static readonly (string Table, string PolicyClass, int DefaultDays)[] Tables =
    {
        ("cplm_short_feature_results", "SHORT_FEATURES", 3),
        ("cplm_long_feature_results", "LONG_FEATURES", 30),
        ("cplm_gate_results", "GATE_RESULTS", 30),
    };

    public static async Task<PartitionMaintenanceResult> MaintainOnceAsync(NpgsqlDataSource db, DateTime utcNow, FeaturePartitionOptions opts,
        ILogger? log, CancellationToken ct)
    {
        int created = 0, dropped = 0, relocated = 0, pruned = 0, skipped = 0;
        var today = DateOnly.FromDateTime(utcNow.Kind == DateTimeKind.Utc ? utcNow : utcNow.ToUniversalTime());
        await using var conn = await db.OpenConnectionAsync(ct);
        foreach (var (table, policyClass, defaultDays) in Tables)
        {
            var kind = await conn.ExecuteScalarAsync<string?>(
                "SELECT c.relkind::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'analytics' AND c.relname = @t",
                new { t = table });
            if (kind != "p") { skipped++; continue; }
            var days = await conn.ExecuteScalarAsync<int?>("SELECT days FROM analytics.retention_policy WHERE record_class = @c", new { c = policyClass }) ?? defaultDays;
            var existing = await ExistingDaysAsync(conn, table);
            for (var d = today; d <= today.AddDays(Math.Max(0, opts.LookaheadDays)); d = d.AddDays(1))
            {
                if (existing.Contains(d)) continue;
                relocated += await CreateDayAsync(conn, table, d, opts.LockTimeoutSeconds, ct);
                created++;
            }
            var cutoff = today.AddDays(-Math.Max(1, days));
            foreach (var d in existing.Where(d => d < cutoff).OrderBy(d => d))
            {
                await DropDayAsync(conn, table, d, opts.LockTimeoutSeconds, ct);
                dropped++;
            }
            pruned += await conn.ExecuteAsync(new CommandDefinition($"DELETE FROM analytics.{table}_default WHERE window_end < @cutoff",
                new { cutoff = Midnight(cutoff) }, commandTimeout: 600, cancellationToken: ct));
            log?.LogDebug("Partitions {Table}: retention {Days} d, cutoff {Cutoff}", table, days, cutoff);
        }
        return new PartitionMaintenanceResult(created, dropped, relocated, pruned, skipped);
    }

    private static DateTime Midnight(DateOnly d) => d.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
    private static string Literal(DateOnly d) => d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) + " 00:00:00+00";
    private static string PartitionName(string table, DateOnly d) => table + "_p" + d.ToString("yyyyMMdd", CultureInfo.InvariantCulture);

    private static async Task<HashSet<DateOnly>> ExistingDaysAsync(NpgsqlConnection conn, string table)
    {
        var names = await conn.QueryAsync<string>(
            "SELECT c.relname FROM pg_inherits h JOIN pg_class c ON c.oid = h.inhrelid WHERE h.inhparent = @parent::regclass",
            new { parent = "analytics." + table });
        var prefix = table + "_p";
        var set = new HashSet<DateOnly>();
        foreach (var n in names)
            if (n.StartsWith(prefix, StringComparison.Ordinal)
                && DateOnly.TryParseExact(n[prefix.Length..], "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d))
                set.Add(d);
        return set;
    }

    /// <summary>Creates one day's partition; rows parked in DEFAULT for that day move into it. Returns the rows moved.</summary>
    private static async Task<int> CreateDayAsync(NpgsqlConnection conn, string table, DateOnly day, int lockTimeoutSeconds, CancellationToken ct)
    {
        var lo = Midnight(day); var hi = Midnight(day.AddDays(1));
        await using var tx = await conn.BeginTransactionAsync(ct);
        await conn.ExecuteAsync($"SET LOCAL lock_timeout = '{Math.Max(1, lockTimeoutSeconds)}s'", transaction: tx);
        await conn.ExecuteAsync($"CREATE TEMP TABLE relocate_rows ON COMMIT DROP AS SELECT * FROM analytics.{table}_default WHERE window_end >= @lo AND window_end < @hi",
            new { lo, hi }, tx);
        var moved = await conn.ExecuteAsync($"DELETE FROM analytics.{table}_default WHERE window_end >= @lo AND window_end < @hi", new { lo, hi }, tx);
        await conn.ExecuteAsync($"CREATE TABLE analytics.{PartitionName(table, day)} PARTITION OF analytics.{table} FOR VALUES FROM ('{Literal(day)}') TO ('{Literal(day.AddDays(1))}')",
            transaction: tx);
        if (moved > 0) await conn.ExecuteAsync($"INSERT INTO analytics.{table} SELECT * FROM relocate_rows", transaction: tx);
        await tx.CommitAsync(ct);
        return moved;
    }

    private static async Task DropDayAsync(NpgsqlConnection conn, string table, DateOnly day, int lockTimeoutSeconds, CancellationToken ct)
    {
        await using var tx = await conn.BeginTransactionAsync(ct);
        await conn.ExecuteAsync($"SET LOCAL lock_timeout = '{Math.Max(1, lockTimeoutSeconds)}s'", transaction: tx);
        await conn.ExecuteAsync($"DROP TABLE analytics.{PartitionName(table, day)}", transaction: tx);
        await tx.CommitAsync(ct);
    }
}
