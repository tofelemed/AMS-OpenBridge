namespace Traverse.CplmApi.Data;

/// <summary>
/// CHG-023 — the read-path indexes on <c>analytics.cplm_gate_results</c>, defined once.
///
/// Three homes must agree, and they all derive from or mirror this text:
///   * the consumer's self-heal DDL (<see cref="CreateAll"/>, runs at cplm-api startup),
///   * migration/schema/03-traverse_cplm.sql (fresh plant installs) and
///     database/scripts/52_cplm_fleet_latest_indexes.sql (lab volumes),
///   * scripts/cpm-04-fleet-latest-indexes.sql (live plant, CONCURRENTLY, run before the swap).
///
/// What each one serves:
///   * <see cref="RealVerdictIndex"/> — newest REAL verdict per (loop, kind): fleet
///     summary/rankings/heatmap and gates/latest, first probe.
///   * <see cref="AnyRowIndex"/> — newest row of any kind per (loop, kind): the fallback
///     probe for loops that only have INSUFFICIENT_DATA so far.
///   * <see cref="CreatedAtIndex"/> — "the newest row in the table": /calculations reads
///     the engine versions from it and samples the newest 2,000 rows for observed gates.
///     Without it that endpoint detoasted every payload in the table (30 s → HTTP 500).
/// </summary>
public static class CplmReadIndexes
{
    public const string RealVerdictIndex = "idx_cplm_gate_results_latest_real";
    public const string AnyRowIndex = "idx_cplm_gate_results_latest_any";
    public const string CreatedAtIndex = "idx_cplm_gate_results_created_at";

    /// <summary>Plain CREATE INDEX (blocks writers only; the consumer is not consuming yet when this runs).</summary>
    public const string CreateAll = $"""
        CREATE INDEX IF NOT EXISTS {RealVerdictIndex}
            ON analytics.cplm_gate_results (lower(loop_id), window_kind, window_end DESC NULLS LAST, created_at DESC)
            WHERE diagnosis IS NOT NULL AND diagnosis <> 'INSUFFICIENT_DATA';
        CREATE INDEX IF NOT EXISTS {AnyRowIndex}
            ON analytics.cplm_gate_results (lower(loop_id), window_kind, window_end DESC NULLS LAST, created_at DESC);
        CREATE INDEX IF NOT EXISTS {CreatedAtIndex}
            ON analytics.cplm_gate_results (created_at DESC);
        """;
}
