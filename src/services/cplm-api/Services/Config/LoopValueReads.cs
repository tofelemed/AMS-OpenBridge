// CHG-224: the three small reads behind the per-loop values of GET /configuration/effective - the retention policy rows (with the
// sweeper's TRANSIENT settings), the loop's latest VALIDATED system model's dead time and the latest short result's sample interval.
// Each read uses an existing index (retention_policy is a handful of rows; ix_system_model_loop; idx_cplm_short_loop_kind_end per
// window kind, bounded to two days so only recent partitions are opened - the plant keeps short results 6 h anyway). The data
// source's grid and mode words are described in words, never read (owner decision D3).
using Dapper;
using Npgsql;

namespace Traverse.CplmApi.Services.Config;

/// <summary>What evidence retention keeps: the TRANSIENT hours and byte budget (cplm-api settings) and each retention_policy row's days
/// (a row with null days is kept with a null value; a missing row is absent).</summary>
public sealed record RetentionFacts(int TransientHours, long TransientBudgetBytes, IReadOnlyDictionary<string, int?> Days)
{
    public static readonly RetentionFacts Defaults = new(6, 2L * 1024 * 1024 * 1024, new Dictionary<string, int?>());
}

/// <summary>The per-loop facts the effective entries need beyond the registry and the resolved properties.</summary>
public sealed record LoopValueFacts(double? SampleIntervalS, double? DeadTimeS, RetentionFacts Retention)
{
    public static readonly LoopValueFacts None = new(null, null, RetentionFacts.Defaults);
}

public sealed class LoopValueReads
{
    /// <summary>The short job's window kinds; the newest result of any of them gives the interval.</summary>
    private static readonly string[] ShortWindowKinds = { "1m", "5m", "10m", "15m", "30m", "60m" };
    private readonly NpgsqlDataSource _db;
    private readonly int _transientHours;
    private readonly long _transientBudgetBytes;

    public LoopValueReads([FromKeyedServices("cplm")] NpgsqlDataSource db, IConfiguration config)
    {
        _db = db;
        // the same settings and floors EvidenceRetentionSweeper applies
        _transientHours = Math.Max(1, config.GetValue("Cplm:EvidenceTransientHours", 6));
        _transientBudgetBytes = Math.Max(1L << 20, config.GetValue("Cplm:EvidenceTransientBudgetBytes", 2L * 1024 * 1024 * 1024));
    }

    public async Task<LoopValueFacts> ReadAsync(string loopId, CancellationToken ct)
    {
        await using var conn = await _db.OpenConnectionAsync(ct);
        var days = (await conn.QueryAsync<(string RecordClass, int? Days)>(new CommandDefinition(
            "SELECT record_class, days FROM analytics.retention_policy", cancellationToken: ct)))
            .ToDictionary(r => r.RecordClass, r => r.Days, StringComparer.Ordinal);
        var deadTime = await conn.ExecuteScalarAsync<double?>(new CommandDefinition("""
            SELECT (parameters -> 'dead_time' ->> 'value')::float8
            FROM analytics.system_model
            WHERE lower(loop_id) = lower(@loopId) AND model_state = 'VALIDATED'
            ORDER BY created_at DESC LIMIT 1
            """, new { loopId }, cancellationToken: ct));
        var interval = await conn.ExecuteScalarAsync<double?>(new CommandDefinition("""
            SELECT (r.payload ->> 'sample_period_sec')::float8
            FROM unnest(@kinds::text[]) AS k(kind)
            CROSS JOIN LATERAL (
                SELECT s.payload, s.window_end FROM analytics.cplm_short_feature_results s
                WHERE s.loop_id = @loopId AND s.window_kind = k.kind AND s.purpose = 'LIVE' AND s.payload ? 'sample_period_sec'
                  AND s.window_end > now() - interval '2 days'
                ORDER BY s.window_end DESC LIMIT 1) r
            ORDER BY r.window_end DESC LIMIT 1
            """, new { loopId, kinds = ShortWindowKinds }, cancellationToken: ct));
        return new LoopValueFacts(Positive(interval), Positive(deadTime), new RetentionFacts(_transientHours, _transientBudgetBytes, days));
    }

    private static double? Positive(double? v) => v is { } d && double.IsFinite(d) && d > 0 ? d : null;
}
