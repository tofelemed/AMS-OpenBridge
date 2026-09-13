namespace Traverse.CplmApi.Data;

/// <summary>
/// The KPI stream SQL, shared by GET /loops/{id}/kpis (single resolution, cursor-paged)
/// and GET /loops/{id}/kpis/latest (CHG-024, several resolutions in one request) so the
/// two can never drift. Parameters: @loopId, @resolution, @from, @to, @before, @limit.
/// </summary>
public static class KpiSql
{
    /// <summary>G5–G11 long-diagnostics rows (4h/12h/24h).</summary>
    public const string Long = """
    SELECT window_start, window_end, sample_count, acf_period_s, acf_regularity,
           effort_ratio, triangularity, horch_oddness, corner_score,
           travel_per_day, reversals_per_hour,
           harmonic_amplitude_ratio, harmonic_energy_ratio, created_at,
           -- P1-10: false when these metrics were computed on a window
           -- that failed G0 / had insufficient samples. They are kept
           -- (they are the exclusion's decision inputs) but must not be
           -- plotted beside full-window values without a marker.
           -- audit-jobs.md BE-2: `long_metrics_qualified` only exists on
           -- GATE payloads; on long-feature rows the key was always
           -- absent, so this served TRUE unconditionally and the P1-10
           -- safeguard was silently disabled. Derive it from the
           -- embedded aligned-short slice (qualified = short passed G0).
           COALESCE((payload->>'long_metrics_qualified')::boolean,
                    (payload->'short_features'->>'sufficient_data')::boolean,
                    TRUE) AS long_metrics_qualified,
           COALESCE((payload->>'freeze_fraction')::double precision, 0) AS freeze_fraction,
           (payload->>'sample_period_sec')::double precision AS sample_period_sec,
           -- audit-jobs.md BE-3: the long payload carries this only in
           -- the nested short_features object; the flat key was NULL.
           COALESCE((payload->>'expected_sample_count')::int,
                    (payload->'short_features'->>'expected_sample_count')::int) AS expected_sample_count
    FROM analytics.cplm_long_feature_results
    WHERE lower(loop_id) = lower(@loopId) AND window_kind = @resolution
      AND (@from::timestamptz IS NULL OR window_end >= @from::timestamptz)
      AND (@to::timestamptz   IS NULL OR window_end <= @to::timestamptz)
      AND (@before::timestamptz IS NULL OR window_end < @before::timestamptz)
    ORDER BY window_end DESC NULLS LAST LIMIT @limit
    """;

    /// <summary>G0–G4 short-feature rows (1m…60m).</summary>
    public const string Short = """
    SELECT window_start, window_end, sample_count, iae, ise, mae, rmse,
           good_error_pct, effort_ratio, travel_per_day, reversals_per_hour,
           auto_pct, completeness, created_at,
           -- P1-9: the engine zeroes mae/rmse/iae when it declines to
           -- evaluate a window, and the consumer stores 0.0 (never NULL).
           -- Without this flag a KPI chart draws those windows as
           -- perfect control. It lives in the payload, not a column.
           COALESCE((payload->>'sufficient_data')::boolean, TRUE) AS sufficient_data,
           -- P2-11: the UI hardcoded a 5s sample period; the engine
           -- publishes the real per-window values - serve them.
           (payload->>'sample_period_sec')::double precision AS sample_period_sec,
           (payload->>'expected_sample_count')::int AS expected_sample_count,
           -- Short-window gate verdicts exist only in the payload (no
           -- typed columns, and no row in cplm_gate_results — fusion
           -- fires on 12h/24h only). Serve them so per-window screens
           -- can show G0–G4/G2r beside the feature values.
           payload->>'gate0_status'  AS gate0_status,
           payload->>'gate1_status'  AS gate1_status,
           payload->>'gate2_status'  AS gate2_status,
           payload->>'gate2r_status' AS gate2r_status,
           payload->>'gate3_status'  AS gate3_status,
           payload->>'gate4_status'  AS gate4_status
    FROM analytics.cplm_short_feature_results
    WHERE lower(loop_id) = lower(@loopId) AND window_kind = @resolution
      AND (@from::timestamptz IS NULL OR window_end >= @from::timestamptz)
      AND (@to::timestamptz   IS NULL OR window_end <= @to::timestamptz)
      AND (@before::timestamptz IS NULL OR window_end < @before::timestamptz)
    ORDER BY window_end DESC NULLS LAST LIMIT @limit
    """;
}
