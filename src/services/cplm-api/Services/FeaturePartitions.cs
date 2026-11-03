using System.Globalization;
using Dapper;
using Npgsql;

namespace Traverse.CplmApi.Services;

/// <summary>What one maintenance pass did: partitions Created / Dropped, rows Relocated / Pruned, tables Skipped (not partitioned).</summary>
public sealed record PartitionMaintenanceResult(int Created, int Dropped, int Relocated, int Pruned, int Skipped);

/// <summary>How wide one partition of a table is (UTC-aligned).</summary>
public enum PartitionGrain { Day, Hour }

/// <summary>
/// CHG-033 / CHG-102 — retention for the plant's three result tables, RANGE-partitioned on window_end (plain
/// PostgreSQL; the lab keeps Timescale hypertables, and every table that is not partitioned is left alone).
/// Daily partitions <c>&lt;table&gt;_pYYYYMMDD</c> (scripts/cpm-10b) for the long features and the gate results;
/// hourly <c>&lt;table&gt;_pYYYYMMDDHH</c> (scripts/cpm-17, CHG-102) for the short features, so their 6-hour window
/// is kept by DROP and the space returns at once (the DELETE cron left 1.1 GB of dead rows in the day partitions).
///
/// One pass, per table: create the partitions for the current day/hour .. the lookahead, moving the rows parked
/// in DEFAULT for that range first (a restart after an outage longer than the lookahead would otherwise fail
/// with "would be violated by some row"); DROP every partition whose upper bound is at or before the cutoff
/// (the current day/hour minus the retention); DELETE the DEFAULT rows below the cutoff (replays of old windows).
///
/// Retention: analytics.retention_policy.hours when set, else days x 24 (the column arrives with cpm-17; a
/// database without it reads as hours NULL). The old cplm-api reads only days, so cpm-17 keeps a days value too.
///
/// Granularity: the grain to CREATE is fixed per table below; the partitions that EXIST are read from their
/// names in either form. A slot already covered by an existing partition is not created (an hour inside a
/// pre-cpm-17 day partition is simply covered), a slot that partly overlaps one is refused with a warning
/// (rows of that range go to DEFAULT until the shape is fixed), and a table whose partitions are of the other
/// grain is logged as a warning on every pass: run scripts/cpm-17 (or its rollback) to make it uniform.
/// Partitions are dropped by their own bounds, whatever their grain.
/// </summary>
public static class FeaturePartitions
{
    /// <summary>(table, retention_policy record_class, partition grain to create, hours used when the row is missing)</summary>
    public static readonly (string Table, string PolicyClass, PartitionGrain Grain, int DefaultHours)[] Tables =
    {
        ("cplm_short_feature_results", "SHORT_FEATURES", PartitionGrain.Hour, 3 * 24),
        ("cplm_long_feature_results", "LONG_FEATURES", PartitionGrain.Day, 30 * 24),
        ("cplm_gate_results", "GATE_RESULTS", PartitionGrain.Day, 30 * 24),
    };

    /// <summary>Hours ahead an hourly table is kept ready: the option, but never less than two passes' worth plus one.</summary>
    public static int EffectiveLookaheadHours(FeaturePartitionOptions opts)
    {
        var passHours = (Math.Max(5, opts.MaintenanceMinutes) + 59) / 60;
        return Math.Max(Math.Max(1, opts.LookaheadHours), 2 * passHours + 1);
    }

    /// <summary>The retention in hours: hours when set, else days x 24, else the table's fallback. Never below one hour / one day.</summary>
    public static int RetentionHours(int? days, int? hours, int fallbackHours) =>
        hours is { } h ? Math.Max(1, h) : days is { } d ? Math.Max(1, d) * 24 : fallbackHours;

    public static async Task<PartitionMaintenanceResult> MaintainOnceAsync(NpgsqlDataSource db, DateTime utcNow, FeaturePartitionOptions opts,
        ILogger? log, CancellationToken ct)
    {
        // Cplm:Partitions:Enabled=false stops every pass, the hosted loop's and the consumer's at startup alike.
        if (!opts.Enabled) return new PartitionMaintenanceResult(0, 0, 0, 0, Tables.Length);
        int created = 0, dropped = 0, relocated = 0, pruned = 0, skipped = 0;
        var now = utcNow.Kind == DateTimeKind.Utc ? utcNow : utcNow.ToUniversalTime();
        await using var conn = await db.OpenConnectionAsync(ct);
        foreach (var (table, policyClass, grain, fallbackHours) in Tables)
        {
            var kind = await conn.ExecuteScalarAsync<string?>(
                "SELECT c.relkind::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'analytics' AND c.relname = @t",
                new { t = table });
            if (kind != "p") { skipped++; continue; }
            // to_jsonb(r): reads "hours" when cpm-17 added the column and NULL before it, with one statement
            var policy = await conn.QueryFirstOrDefaultAsync<(int? days, int? hours)>(
                "SELECT days, (to_jsonb(r) ->> 'hours')::int AS hours FROM analytics.retention_policy r WHERE record_class = @c", new { c = policyClass });
            var retentionHours = RetentionHours(policy.days, policy.hours, fallbackHours);
            var existing = await ExistingAsync(conn, table);
            if (existing.Count > 0 && existing.All(p => p.Grain != grain))
                log?.LogWarning("Partitions {Table}: every partition is {Found} but this cplm-api creates {Wanted} ones - apply scripts/cpm-17 (CHG-102) or its rollback with the matching cplm-api",
                    table, existing[0].Grain, grain);

            foreach (var (lo, hi) in Slots(grain, now, opts))
            {
                if (existing.Any(p => p.Lo <= lo && hi <= p.Hi)) continue;                       // already covered
                var overlap = existing.FirstOrDefault(p => p.Lo < hi && lo < p.Hi);
                if (overlap.Name is not null)
                {
                    log?.LogWarning("Partitions {Table}: {Slot} not created, it overlaps {Existing} (mixed day / hour partitions); rows of that range go to DEFAULT",
                        table, PartitionName(table, grain, lo), overlap.Name);
                    continue;
                }
                var name = PartitionName(table, grain, lo);
                relocated += await CreateAsync(conn, table, name, lo, hi, opts.LockTimeoutSeconds, ct);
                existing.Add(new Existing(name, lo, hi, grain));
                created++;
            }
            var cutoff = Floor(grain, now).AddHours(-retentionHours);
            foreach (var p in existing.Where(p => p.Hi <= cutoff).OrderBy(p => p.Lo))
            {
                await DropAsync(conn, p.Name, opts.LockTimeoutSeconds, ct);
                dropped++;
            }
            pruned += await conn.ExecuteAsync(new CommandDefinition($"DELETE FROM analytics.{table}_default WHERE window_end < @cutoff",
                new { cutoff }, commandTimeout: 600, cancellationToken: ct));
            log?.LogDebug("Partitions {Table}: {Grain} partitions, retention {Hours} h, cutoff {Cutoff:o}", table, grain, retentionHours, cutoff);
        }
        return new PartitionMaintenanceResult(created, dropped, relocated, pruned, skipped);
    }

    private readonly record struct Existing(string Name, DateTime Lo, DateTime Hi, PartitionGrain Grain);

    private static DateTime Floor(PartitionGrain grain, DateTime utc) => grain == PartitionGrain.Hour
        ? new DateTime(utc.Year, utc.Month, utc.Day, utc.Hour, 0, 0, DateTimeKind.Utc)
        : new DateTime(utc.Year, utc.Month, utc.Day, 0, 0, 0, DateTimeKind.Utc);

    private static DateTime Next(PartitionGrain grain, DateTime lo) => grain == PartitionGrain.Hour ? lo.AddHours(1) : lo.AddDays(1);

    /// <summary>The ranges that must exist: the current day / hour and the lookahead after it.</summary>
    private static IEnumerable<(DateTime Lo, DateTime Hi)> Slots(PartitionGrain grain, DateTime now, FeaturePartitionOptions opts)
    {
        var ahead = grain == PartitionGrain.Hour ? EffectiveLookaheadHours(opts) : Math.Max(0, opts.LookaheadDays);
        var lo = Floor(grain, now);
        for (var i = 0; i <= ahead; i++, lo = Next(grain, lo)) yield return (lo, Next(grain, lo));
    }

    private static string Format(PartitionGrain grain) => grain == PartitionGrain.Hour ? "yyyyMMddHH" : "yyyyMMdd";
    private static string Literal(DateTime utc) => utc.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture) + "+00";
    public static string PartitionName(string table, PartitionGrain grain, DateTime lo) => table + "_p" + lo.ToString(Format(grain), CultureInfo.InvariantCulture);

    /// <summary>The table's day and hour partitions, from their names (DEFAULT and any foreign name are ignored, never dropped).</summary>
    private static async Task<List<Existing>> ExistingAsync(NpgsqlConnection conn, string table)
    {
        var names = await conn.QueryAsync<string>(
            "SELECT c.relname FROM pg_inherits h JOIN pg_class c ON c.oid = h.inhrelid WHERE h.inhparent = @parent::regclass",
            new { parent = "analytics." + table });
        var prefix = table + "_p";
        var list = new List<Existing>();
        foreach (var n in names)
        {
            if (!n.StartsWith(prefix, StringComparison.Ordinal)) continue;
            var suffix = n[prefix.Length..];
            foreach (var grain in new[] { PartitionGrain.Day, PartitionGrain.Hour })
                if (suffix.Length == Format(grain).Length && DateTime.TryParseExact(suffix, Format(grain), CultureInfo.InvariantCulture,
                        DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var lo))
                {
                    lo = DateTime.SpecifyKind(lo, DateTimeKind.Utc);
                    list.Add(new Existing(n, lo, Next(grain, lo), grain));
                }
        }
        return list;
    }

    /// <summary>Creates one partition; rows parked in DEFAULT for its range move into it. Returns the rows moved.</summary>
    private static async Task<int> CreateAsync(NpgsqlConnection conn, string table, string name, DateTime lo, DateTime hi, int lockTimeoutSeconds, CancellationToken ct)
    {
        await using var tx = await conn.BeginTransactionAsync(ct);
        await conn.ExecuteAsync($"SET LOCAL lock_timeout = '{Math.Max(1, lockTimeoutSeconds)}s'", transaction: tx);
        await conn.ExecuteAsync($"CREATE TEMP TABLE relocate_rows ON COMMIT DROP AS SELECT * FROM analytics.{table}_default WHERE window_end >= @lo AND window_end < @hi",
            new { lo, hi }, tx);
        var moved = await conn.ExecuteAsync($"DELETE FROM analytics.{table}_default WHERE window_end >= @lo AND window_end < @hi", new { lo, hi }, tx);
        await conn.ExecuteAsync($"CREATE TABLE analytics.{name} PARTITION OF analytics.{table} FOR VALUES FROM ('{Literal(lo)}') TO ('{Literal(hi)}')",
            transaction: tx);
        if (moved > 0) await conn.ExecuteAsync($"INSERT INTO analytics.{table} SELECT * FROM relocate_rows", transaction: tx);
        await tx.CommitAsync(ct);
        return moved;
    }

    private static async Task DropAsync(NpgsqlConnection conn, string name, int lockTimeoutSeconds, CancellationToken ct)
    {
        await using var tx = await conn.BeginTransactionAsync(ct);
        await conn.ExecuteAsync($"SET LOCAL lock_timeout = '{Math.Max(1, lockTimeoutSeconds)}s'", transaction: tx);
        await conn.ExecuteAsync($"DROP TABLE analytics.{name}", transaction: tx);
        await tx.CommitAsync(ct);
    }
}
