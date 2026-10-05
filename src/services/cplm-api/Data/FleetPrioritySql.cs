namespace Traverse.CplmApi.Data;

/// <summary>
/// SME review #7 (CHG-045) — the Overview priority queue: which loops need action first, and why.
///
/// The queue used to be <c>ORDER BY confidence DESC</c>; 162 lab loops share confidence 1.00, so its
/// top rows were alphabetical. Priority now follows ISA-18.2 / EEMUA 191 practice — consequence
/// severity × urgency, at most 3–4 levels (we use 3), High kept rare:
///  - consequence = the loop's registered criticality (critical / high / medium / low; unset = medium);
///  - urgency     = the finding's severity (HIGH / MEDIUM / LOW; unset = LOW, never inflated).
///
///   criticality \ severity   HIGH     MEDIUM   LOW
///   critical                 1 High   1 High   2 Medium
///   high                     1 High   2 Medium 3 Low
///   medium                   2 Medium 3 Low    3 Low
///   low                      3 Low    3 Low    3 Low
///
/// Inside a level: worst control impact first (least time in the good-error band), then the longest
/// persistence (oldest open episode), then the evidence score. Only CURRENT findings are queued (the
/// operating picture's "poor performance" rule: a CONFIRMED/SUSPECTED/DETECTED/CLASSIFIED verdict whose
/// window is not stale). An actively shelved episode leaves the queue (ISA-18.2: shelved alarms are
/// removed from the active list and listed separately); an expired shelf brings the loop back;
/// acknowledged loops stay, marked. Change the matrix here and in prod_decision.md together.
/// </summary>
public static class FleetPrioritySql
{
    private const string Current = """
        FROM cpm.loop_registry r
        JOIN LATERAL (
            SELECT g.window_end, g.diagnosis, g.severity, g.confidence,
                   g.effort_ratio, g.triangularity, g.horch_oddness, g.acf_period_s,
                   g.good_error_pct, g.mae,
                   (g.payload->'observability_flags')::text AS flags,
                   g.payload->>'leading_hypothesis' AS leading_hypothesis
            FROM analytics.cplm_gate_results g
            WHERE lower(g.loop_id) = lower(r.loop_id) AND g.window_kind = @windowKind
              AND g.diagnosis IS NOT NULL AND g.diagnosis <> 'INSUFFICIENT_DATA'
              AND g.purpose = 'LIVE'
            ORDER BY g.window_end DESC NULLS LAST, g.created_at DESC
            LIMIT 1
        ) v ON TRUE
        LEFT JOIN LATERAL (
            SELECT f.opened_at, f.window_count, f.ack_state, f.shelve_until
            FROM analytics.cplm_event_frames f
            WHERE lower(f.loop_id) = lower(r.loop_id) AND f.window_kind = @windowKind AND f.closed_at IS NULL
            ORDER BY f.opened_at DESC
            LIMIT 1
        ) e ON TRUE
        WHERE (@site::text IS NULL OR r.site = @site)
          AND (@area::text IS NULL OR r.area = @area)
          AND (@unit::text IS NULL OR r.unit = @unit)
          AND COALESCE((r.monitoring->>'enabled')::boolean, FALSE)
          AND v.window_end >= now() - make_interval(secs => @staleSeconds)
          AND v.diagnosis ~ '^(CONFIRMED|SUSPECTED|DETECTED|CLASSIFIED)_'
        """;

    private const string ActivelyShelved =
        "(e.ack_state = 'SHELVED' AND (e.shelve_until IS NULL OR e.shelve_until > now()))";

    /// <summary>1 High, 2 Medium, 3 Low — the matrix above.</summary>
    private const string Priority = """
        CASE
            WHEN lower(COALESCE(r.criticality, 'medium')) = 'critical'
                 AND upper(COALESCE(v.severity, 'LOW')) IN ('HIGH', 'MEDIUM', 'MED') THEN 1
            WHEN lower(COALESCE(r.criticality, 'medium')) = 'high'
                 AND upper(COALESCE(v.severity, 'LOW')) = 'HIGH' THEN 1
            WHEN lower(COALESCE(r.criticality, 'medium')) = 'critical' THEN 2
            WHEN lower(COALESCE(r.criticality, 'medium')) = 'high'
                 AND upper(COALESCE(v.severity, 'LOW')) IN ('MEDIUM', 'MED') THEN 2
            WHEN lower(COALESCE(r.criticality, 'medium')) = 'medium'
                 AND upper(COALESCE(v.severity, 'LOW')) = 'HIGH' THEN 2
            ELSE 3
        END
        """;

    public static string Queue(string healthWhere = "") => $"""
        SELECT r.loop_id, r.display_name, r.site, r.area, r.unit, r.loop_type, r.criticality,
               v.window_end, v.diagnosis, v.severity, v.confidence,
               v.effort_ratio, v.triangularity, v.horch_oddness, v.acf_period_s,
               v.good_error_pct, v.mae, v.flags, v.leading_hypothesis,
               {Priority} AS priority,
               e.opened_at AS episode_opened_at, e.window_count AS episode_window_count, e.ack_state
        {Current}
          AND NOT {ActivelyShelved}
        {healthWhere}
        ORDER BY priority ASC,
                 v.good_error_pct ASC NULLS LAST,
                 e.opened_at ASC NULLS LAST,
                 v.confidence DESC NULLS LAST,
                 r.loop_id
        LIMIT @limit
        """;

    /// <summary>Current findings left out of the queue because their episode is actively shelved.</summary>
    public static string ShelvedCount(string healthWhere = "") => $"""
        SELECT COUNT(*)::int
        {Current}
          AND {ActivelyShelved}
        {healthWhere}
        """;

    public static string? PriorityLabel(int? priority) => priority switch
    {
        1 => "HIGH",
        2 => "MEDIUM",
        3 => "LOW",
        _ => null,
    };
}
