-- =====================================================================
-- CPM loop validation — full 12 h gate investigation
--
--   Database : traverse_cplm      Run in : pgAdmin Query Tool, or psql
--   Scope    : the loop list in section 0. Edit it there, nowhere else.
--   Window   : the last 12 h of results by default (section 0, v_hours).
--
-- HOW TO RUN IN pgAdmin
--   pgAdmin shows only the LAST result grid, so run ONE numbered section at a
--   time (select the section, press F5). In psql just run the whole file.
--
-- READING THE RESULTS — the questions each section answers
--   1  Are these loops configured at all, and do they declare ranges?
--   2  Did data actually arrive over the window? (engine's own view)
--   3  What is the current verdict, gate by gate?
--   4  Is the verdict stable, or flapping window to window?
--   5  WHY — one section per gate family, with the numbers behind the status
--   10 What is BLOCKING a diagnosis, if anything
--   11 Cross-checks that catch a wrong configuration rather than a bad loop
--
-- STATUS MEANINGS THAT TRIP PEOPLE UP
--   STRONG is NOT good — on G4/G7/G8/G9 it is strong evidence of a FAULT.
--   Only G0 FAIL, G1 EXCLUDED, G2r FAIL and G11 WARN(+freeze>=60s) block.
--   G2 and G3 have no FAIL path at all — they are PASS or WARN only.
-- =====================================================================


-- ─────────────────────────────────────────────────────────────────────
-- 0. SCOPE — edit the loop list and the window here
-- ─────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS tmp_scope;
CREATE TEMP TABLE tmp_scope (loop_id text PRIMARY KEY);
INSERT INTO tmp_scope VALUES
  ('FIC10409'), ('FIC10509'), ('FIC10501'), ('FIC10502'), ('LIC10501'),
  ('PIC00605'), ('PIC80143'), ('PIC80141'), ('FIC80103'), ('PIC80140');

DROP TABLE IF EXISTS tmp_win;
CREATE TEMP TABLE tmp_win AS SELECT NOW() - INTERVAL '12 hours' AS since;
-- For a fixed window instead:
--   DROP TABLE tmp_win; CREATE TEMP TABLE tmp_win AS
--   SELECT TIMESTAMPTZ '2026-09-10 06:00+00' AS since;

SELECT s.loop_id, (SELECT since FROM tmp_win) AS window_since FROM tmp_scope s ORDER BY 1;


-- ─────────────────────────────────────────────────────────────────────
-- 1. CONFIGURATION — is each loop onboarded correctly?
--    A loop missing here explains every later blank. pv_band_eu is the
--    G3 band this loop will actually use: 0.5 % of the declared PV span,
--    or 0.5 EU flat when nothing is declared.
-- ─────────────────────────────────────────────────────────────────────
SELECT s.loop_id,
       CASE WHEN r.loop_id IS NULL THEN 'NOT REGISTERED' ELSE r.loop_type END AS loop_type,
       r.is_active,
       COALESCE(r.monitoring->>'enabled', '-')                       AS monitoring,
       r.site || '/' || COALESCE(r.area,'-') || '/' || COALESCE(r.unit,'-') AS location,
       (SELECT string_agg(m.signal_role, ',' ORDER BY m.signal_role)
          FROM cpm.loop_tag_map m WHERE m.loop_id = r.loop_id)       AS roles,
       (r.engineering->>'pvMin')::numeric                            AS pv_min,
       (r.engineering->>'pvMax')::numeric                            AS pv_max,
       (r.engineering->>'opMin')::numeric                            AS op_min,
       (r.engineering->>'opMax')::numeric                            AS op_max,
       CASE WHEN r.engineering ? 'pvMin' AND r.engineering ? 'pvMax'
                 AND (r.engineering->>'pvMax')::numeric > (r.engineering->>'pvMin')::numeric
            THEN round(0.005 * ((r.engineering->>'pvMax')::numeric
                              - (r.engineering->>'pvMin')::numeric), 4)
            ELSE 0.5 END                                             AS pv_band_eu,
       CASE WHEN NOT (r.engineering ? 'pvMin') THEN 'no PV range -> flat 0.5 EU band'
            WHEN NOT (r.engineering ? 'opMin') THEN 'no OP range -> OP used raw'
            ELSE 'ranges declared' END                               AS note
FROM   tmp_scope s
LEFT   JOIN cpm.loop_registry r ON r.loop_id = s.loop_id
ORDER  BY s.loop_id;


-- ─────────────────────────────────────────────────────────────────────
-- 2. DID DATA ARRIVE? — the engine's own view of the last 12 h.
--    short_windows = 0 means nothing reached Flink: stop here and check
--    ingestion (section 12), not the gates.
-- ─────────────────────────────────────────────────────────────────────
SELECT s.loop_id,
       count(f.id) FILTER (WHERE f.window_kind = '1m')  AS win_1m,
       count(f.id) FILTER (WHERE f.window_kind = '60m') AS win_60m,
       round(avg(f.completeness)::numeric, 3)           AS avg_completeness,
       round(avg(f.sample_count)::numeric, 1)           AS avg_samples,
       round(avg((f.payload->>'sample_period_sec')::numeric), 2) AS avg_period_s,
       max(f.window_end)                                AS last_window,
       CASE WHEN count(f.id) = 0 THEN 'NO DATA IN WINDOW'
            WHEN max(f.window_end) < NOW() - INTERVAL '30 minutes' THEN 'STALE'
            ELSE 'flowing' END                          AS feed
FROM   tmp_scope s
LEFT   JOIN analytics.cplm_short_feature_results f
       ON f.loop_id = s.loop_id AND f.window_start >= (SELECT since FROM tmp_win)
GROUP  BY s.loop_id ORDER BY s.loop_id;


-- ─────────────────────────────────────────────────────────────────────
-- 3. CURRENT VERDICT — latest 12 h gate row per loop, all 16 gates.
--    This is the headline. "-" means no 12 h verdict exists yet.
-- ─────────────────────────────────────────────────────────────────────
WITH latest AS (
    SELECT DISTINCT ON (g.loop_id) g.*
    FROM   analytics.cplm_gate_results g
    JOIN   tmp_scope s ON s.loop_id = g.loop_id
    WHERE  g.window_kind = '12h'
    ORDER  BY g.loop_id, g.window_end DESC
)
SELECT s.loop_id,
       COALESCE(to_char(l.window_end, 'MM-DD HH24:MI'), '-')      AS window_end,
       COALESCE(l.payload->'gates'->>'G0','-')  AS g0,
       COALESCE(l.payload->'gates'->>'G1','-')  AS g1,
       COALESCE(l.payload->'gates'->>'G2','-')  AS g2,
       COALESCE(l.payload->'gates'->>'G2r','-') AS g2r,
       COALESCE(l.payload->'gates'->>'G3','-')  AS g3,
       COALESCE(l.payload->'gates'->>'G4','-')  AS g4,
       COALESCE(l.payload->'gates'->>'G5','-')  AS g5,
       COALESCE(l.payload->'gates'->>'G6','-')  AS g6,
       COALESCE(l.payload->'gates'->>'G7','-')  AS g7,
       COALESCE(l.payload->'gates'->>'G8','-')  AS g8,
       COALESCE(l.payload->'gates'->>'G9','-')  AS g9,
       COALESCE(l.payload->'gates'->>'G10','-') AS g10,
       COALESCE(l.payload->'gates'->>'G11','-') AS g11,
       COALESCE(l.payload->'gates'->>'G12','-') AS g12,
       COALESCE(l.payload->'gates'->>'G13','-') AS g13,
       COALESCE(l.payload->'gates'->>'G14','-') AS g14,
       COALESCE(l.payload->'gates'->>'G15','-') AS g15,
       COALESCE(l.diagnosis,'-')                AS diagnosis,
       round(l.confidence::numeric, 3)          AS confidence,
       COALESCE(l.severity,'-')                 AS severity
FROM   tmp_scope s
LEFT   JOIN latest l ON l.loop_id = s.loop_id
ORDER  BY s.loop_id;


-- ─────────────────────────────────────────────────────────────────────
-- 4. IS IT STABLE? — every 12 h verdict in the window, not just the last.
--    A gate that changes status across windows is a different problem
--    from one that is steadily bad. distinct_diagnoses > 1 = flapping.
-- ─────────────────────────────────────────────────────────────────────
SELECT g.loop_id,
       count(*)                                              AS verdicts,
       count(DISTINCT g.diagnosis)                           AS distinct_diagnoses,
       string_agg(DISTINCT g.diagnosis, ' | ')               AS diagnoses,
       round(min(g.confidence)::numeric,3)                   AS conf_min,
       round(max(g.confidence)::numeric,3)                   AS conf_max,
       count(*) FILTER (WHERE g.payload->'gates'->>'G0' = 'FAIL')      AS g0_fail,
       count(*) FILTER (WHERE g.payload->'gates'->>'G1' = 'EXCLUDED')  AS g1_excl,
       count(*) FILTER (WHERE g.payload->'gates'->>'G2r' = 'FAIL')     AS g2r_fail,
       count(*) FILTER (WHERE g.payload->'gates'->>'G3' = 'WARN')      AS g3_warn,
       count(*) FILTER (WHERE g.payload->'gates'->>'G10' = 'WARN')     AS g10_warn
FROM   analytics.cplm_gate_results g
JOIN   tmp_scope s ON s.loop_id = g.loop_id
WHERE  g.window_kind = '12h' AND g.window_start >= (SELECT since FROM tmp_win)
GROUP  BY g.loop_id ORDER BY g.loop_id;


-- ─────────────────────────────────────────────────────────────────────
-- 5. G0 DATA QUALITY — the gate that silently kills everything else.
--    PASS needs completeness >= 0.98 AND bad < 0.05 AND duplicates = 0.
--    bad_quality_pct >= 0.50 is an immediate FAIL.
-- ─────────────────────────────────────────────────────────────────────
SELECT s.loop_id,
       round(avg((f.payload->>'completeness')::numeric), 4)        AS completeness,
       round(avg((f.payload->>'bad_quality_pct')::numeric), 4)     AS bad_quality_pct,
       sum((f.payload->>'duplicate_timestamps')::int)              AS duplicate_ts,
       sum((f.payload->>'gap_count')::int)                         AS gaps,
       round(max((f.payload->>'max_gap_s')::numeric), 1)           AS max_gap_s,
       round(avg((f.payload->>'sampling_jitter')::numeric), 3)     AS jitter,
       count(*) FILTER (WHERE f.payload->>'gate0_status' = 'PASS') AS g0_pass,
       count(*) FILTER (WHERE f.payload->>'gate0_status' = 'WARN') AS g0_warn,
       count(*) FILTER (WHERE f.payload->>'gate0_status' = 'FAIL') AS g0_fail
FROM   tmp_scope s
JOIN   analytics.cplm_short_feature_results f
       ON f.loop_id = s.loop_id AND f.window_kind = '60m'
      AND f.window_start >= (SELECT since FROM tmp_win)
GROUP  BY s.loop_id ORDER BY s.loop_id;


-- ─────────────────────────────────────────────────────────────────────
-- 6. G1 MODE — auto_pct >= 0.90 PASS, >= 0.70 WARN, else EXCLUDED.
--    auto_pct at or near 0 with data present almost always means the
--    mode_value_map is wrong, not that the plant is in manual.
-- ─────────────────────────────────────────────────────────────────────
SELECT s.loop_id,
       round(avg(f.auto_pct)::numeric, 4)                            AS auto_pct,
       round(min(f.auto_pct)::numeric, 4)                            AS auto_pct_min,
       round(avg((f.payload->>'mode_changes_per_h')::numeric), 2)    AS mode_changes_per_h,
       count(*) FILTER (WHERE f.payload->>'gate1_status' = 'EXCLUDED') AS windows_excluded,
       count(*)                                                      AS windows,
       CASE WHEN avg(f.auto_pct) < 0.05 THEN 'check mode_value_map before blaming the plant'
            WHEN avg(f.auto_pct) < 0.70 THEN 'genuinely in manual for most of the window'
            ELSE 'ok' END                                            AS note
FROM   tmp_scope s
JOIN   analytics.cplm_short_feature_results f
       ON f.loop_id = s.loop_id AND f.window_kind = '60m'
      AND f.window_start >= (SELECT since FROM tmp_win)
GROUP  BY s.loop_id ORDER BY s.loop_id;


-- ─────────────────────────────────────────────────────────────────────
-- 7. G2 / G2r — setpoint stability and operating region.
--    sp_range is RAW EU against spRangePassMax (1.0, or 5.0 for LIC and
--    PIC_GAS). A wide-span loop in EU will sit at WARN permanently — that
--    is a known units issue, not a loop fault.
--    region_out_of_band_pct > 0.20 => G2r FAIL => diagnosis BLOCKED.
-- ─────────────────────────────────────────────────────────────────────
SELECT s.loop_id,
       round(avg((f.payload->>'sp_range')::numeric), 4)                AS sp_range_eu,
       round(avg((f.payload->>'sp_changes_per_h')::numeric), 2)        AS sp_changes_per_h,
       round(avg((f.payload->>'region_out_of_band_pct')::numeric), 4)  AS region_out_pct,
       bool_and((f.payload->>'operating_region_valid')::boolean)       AS region_always_valid,
       count(*) FILTER (WHERE f.payload->>'gate2_status'  = 'WARN')    AS g2_warn,
       count(*) FILTER (WHERE f.payload->>'gate2r_status' = 'FAIL')    AS g2r_fail,
       count(*)                                                        AS windows
FROM   tmp_scope s
JOIN   analytics.cplm_short_feature_results f
       ON f.loop_id = s.loop_id AND f.window_kind = '60m'
      AND f.window_start >= (SELECT since FROM tmp_win)
GROUP  BY s.loop_id ORDER BY s.loop_id;


-- ─────────────────────────────────────────────────────────────────────
-- 8. G3 / OCE — control error, and whether the declared PV range is
--    doing its job. band_eu is what the engine uses; mae is the loop's
--    actual average |SP-PV|. If mae >> band_eu, good_error_pct will be 0
--    and G3 sits at WARN — compare the two columns directly.
-- ─────────────────────────────────────────────────────────────────────
SELECT s.loop_id,
       round(avg(f.good_error_pct)::numeric, 4)                     AS good_error_pct,
       round(avg(f.mae)::numeric, 4)                                AS mae,
       round(avg(f.rmse)::numeric, 4)                               AS rmse,
       CASE WHEN r.engineering ? 'pvMin' AND r.engineering ? 'pvMax'
                 AND (r.engineering->>'pvMax')::numeric > (r.engineering->>'pvMin')::numeric
            THEN round(0.005 * ((r.engineering->>'pvMax')::numeric
                              - (r.engineering->>'pvMin')::numeric), 4)
            ELSE 0.5 END                                            AS band_eu,
       round(avg((f.payload->>'oce')::numeric), 4)                  AS oce,
       count(*) FILTER (WHERE f.payload->>'gate3_status' = 'WARN')   AS g3_warn,
       count(*)                                                      AS windows,
       CASE WHEN avg(f.good_error_pct) = 0 THEN 'never inside the band - check band_eu vs mae'
            WHEN avg(f.good_error_pct) < 0.5 THEN 'below the usual 50% pass floor'
            ELSE 'ok' END                                            AS note
FROM   tmp_scope s
JOIN   analytics.cplm_short_feature_results f
       ON f.loop_id = s.loop_id AND f.window_kind = '60m'
      AND f.window_start >= (SELECT since FROM tmp_win)
LEFT   JOIN cpm.loop_registry r ON r.loop_id = s.loop_id
GROUP  BY s.loop_id, r.engineering ORDER BY s.loop_id;


-- ─────────────────────────────────────────────────────────────────────
-- 9. G4 / G10 — effort and saturation. op_range_pct > 100 or < 0 means
--    OP normalisation is wrong (a declared OP range that does not match
--    the real signal) — that is a configuration fault, not a valve fault.
-- ─────────────────────────────────────────────────────────────────────
SELECT s.loop_id,
       round(avg(f.effort_ratio)::numeric, 3)                        AS effort_ratio,
       round(avg((f.payload->>'saturation_pct')::numeric), 4)        AS saturation_pct,
       round(avg((f.payload->>'op_std')::numeric), 3)                AS op_std,
       round(avg((f.payload->>'pv_std')::numeric), 3)                AS pv_std,
       round(avg(f.travel_per_day)::numeric, 1)                      AS travel_per_day,
       round(avg(f.reversals_per_hour)::numeric, 1)                  AS reversals_per_h,
       count(*) FILTER (WHERE f.payload->>'gate4_status' = 'STRONG') AS g4_strong,
       count(*) FILTER (WHERE f.payload->>'gate4_status' = 'WARN')   AS g4_warn
FROM   tmp_scope s
JOIN   analytics.cplm_short_feature_results f
       ON f.loop_id = s.loop_id AND f.window_kind = '60m'
      AND f.window_start >= (SELECT since FROM tmp_win)
GROUP  BY s.loop_id ORDER BY s.loop_id;


-- ─────────────────────────────────────────────────────────────────────
-- 10. LONG TIER G5–G11 — oscillation, shape, geometry, saturation, freeze.
--     NOT_EVALUATED on G7/G9 is normal when no valid oscillation cycle was
--     found; period_status and gate9_reason say which.
-- ─────────────────────────────────────────────────────────────────────
WITH latest AS (
    SELECT DISTINCT ON (g.loop_id) g.*
    FROM   analytics.cplm_gate_results g
    JOIN   tmp_scope s ON s.loop_id = g.loop_id
    WHERE  g.window_kind = '12h'
    ORDER  BY g.loop_id, g.window_end DESC
)
SELECT loop_id,
       payload->'gates'->>'G5'  AS g5,  round(acf_period_s::numeric,1)   AS acf_period_s,
       round(acf_regularity::numeric,3)                                  AS acf_regularity,
       payload->'gates'->>'G6'  AS g6,  round((payload->>'fft_peak_ratio')::numeric,3) AS fft_peak_ratio,
       payload->'gates'->>'G7'  AS g7,  round(triangularity::numeric,3)  AS triangularity,
       payload->'gates'->>'G8'  AS g8,  round(horch_oddness::numeric,3)  AS horch_oddness,
       payload->'gates'->>'G9'  AS g9,  payload->>'gate9_reason'         AS g9_reason,
       round(phase_area_norm_per_cycle::numeric,4)                       AS phase_area,
       payload->'gates'->>'G10' AS g10, round((payload->>'saturation_pct')::numeric,4) AS sat_pct,
       payload->'gates'->>'G11' AS g11, round((payload->>'freeze_index_s')::numeric,1) AS freeze_s,
       payload->>'period_status'        AS period_status,
       payload->>'period_reject_reason' AS period_reject
FROM   latest ORDER BY loop_id;


-- ─────────────────────────────────────────────────────────────────────
-- 11. WHAT IS BLOCKING? — the five exclusions, in the order the fusion
--     job checks them. blocked_by names the FIRST one that fires; that is
--     the only thing worth fixing for that loop.
-- ─────────────────────────────────────────────────────────────────────
WITH latest AS (
    SELECT DISTINCT ON (g.loop_id) g.*
    FROM   analytics.cplm_gate_results g
    JOIN   tmp_scope s ON s.loop_id = g.loop_id
    WHERE  g.window_kind = '12h'
    ORDER  BY g.loop_id, g.window_end DESC
)
SELECT s.loop_id,
       COALESCE(l.diagnosis, 'NO 12h VERDICT')                       AS diagnosis,
       CASE WHEN l.loop_id IS NULL                                   THEN 'no verdict row at all'
            WHEN (l.payload->>'sufficient_data')::boolean IS FALSE   THEN '1. INSUFFICIENT_DATA'
            WHEN l.payload->'gates'->>'G0'  = 'FAIL'                 THEN '2. G0 data quality'
            WHEN l.payload->'gates'->>'G1'  = 'EXCLUDED'             THEN '3. G1 mode/service'
            WHEN l.payload->'gates'->>'G2r' = 'FAIL'                 THEN '4. G2r operating region'
            WHEN l.payload->'gates'->>'G11' = 'WARN'
                 AND (l.payload->>'freeze_index_s')::numeric >= 60   THEN '5. G11 sensor freeze'
            ELSE 'not blocked' END                                   AS blocked_by,
       l.payload->>'selected_family'                                 AS family,
       l.payload->>'status_reason'                                   AS status_reason,
       l.payload->>'observability_flags'                             AS flags,
       l.payload->>'recommendation'                                  AS recommendation
FROM   tmp_scope s LEFT JOIN latest l ON l.loop_id = s.loop_id
ORDER  BY s.loop_id;


-- ─────────────────────────────────────────────────────────────────────
-- 12. CONFIGURATION CROSS-CHECKS — catches a wrong setup rather than a
--     bad loop. Every row returned here is a finding.
-- ─────────────────────────────────────────────────────────────────────
WITH latest AS (
    SELECT DISTINCT ON (g.loop_id) g.*
    FROM   analytics.cplm_gate_results g
    JOIN   tmp_scope s ON s.loop_id = g.loop_id
    WHERE  g.window_kind = '12h'
    ORDER  BY g.loop_id, g.window_end DESC
)
SELECT loop_id, finding, detail FROM (
    SELECT s.loop_id, 'NOT REGISTERED' AS finding, 'no row in cpm.loop_registry' AS detail
      FROM tmp_scope s LEFT JOIN cpm.loop_registry r ON r.loop_id = s.loop_id
     WHERE r.loop_id IS NULL
    UNION ALL
    SELECT r.loop_id, 'monitoring disabled', 'monitoring.enabled is not true'
      FROM cpm.loop_registry r JOIN tmp_scope s ON s.loop_id = r.loop_id
     WHERE COALESCE(r.monitoring->>'enabled','false') <> 'true'
    UNION ALL
    SELECT r.loop_id, 'incomplete signal roles',
           COALESCE((SELECT string_agg(m.signal_role, ',' ORDER BY m.signal_role)
                       FROM cpm.loop_tag_map m WHERE m.loop_id = r.loop_id), 'none')
      FROM cpm.loop_registry r JOIN tmp_scope s ON s.loop_id = r.loop_id
     WHERE (SELECT count(*) FROM cpm.loop_tag_map m
             WHERE m.loop_id = r.loop_id
               AND m.signal_role IN ('PV','SP','OP','MODE')) < 4
    UNION ALL
    SELECT r.loop_id, 'no PV range declared', 'G3 uses the flat 0.5 EU band'
      FROM cpm.loop_registry r JOIN tmp_scope s ON s.loop_id = r.loop_id
     WHERE NOT (COALESCE(r.engineering,'{}'::jsonb) ? 'pvMin')
    UNION ALL
    SELECT r.loop_id, 'half-declared range', r.engineering::text
      FROM cpm.loop_registry r JOIN tmp_scope s ON s.loop_id = r.loop_id
     WHERE (r.engineering ? 'pvMin') <> (r.engineering ? 'pvMax')
        OR (r.engineering ? 'opMin') <> (r.engineering ? 'opMax')
    UNION ALL
    -- OP outside 0-100 after normalisation = the declared OP range does not
    -- match the real signal. Saturation and G2r are meaningless until fixed.
    SELECT l.loop_id, 'OP out of range after normalisation',
           'op_range_pct = ' || round((l.payload->>'op_range_pct')::numeric, 2)
      FROM latest l
     WHERE (l.payload->>'op_range_pct')::numeric > 100
        OR (l.payload->>'op_range_pct')::numeric < 0
    UNION ALL
    SELECT l.loop_id, 'UNKNOWN dynamics profile',
           'gate_profile_id = ' || COALESCE(l.payload->>'gate_profile_id','-')
      FROM latest l WHERE l.payload->>'dynamics_class' = 'UNKNOWN'
    UNION ALL
    SELECT s.loop_id, 'no 12h verdict in window', 'check section 2 for feed'
      FROM tmp_scope s LEFT JOIN latest l ON l.loop_id = s.loop_id
     WHERE l.loop_id IS NULL
) t ORDER BY loop_id, finding;


-- ─────────────────────────────────────────────────────────────────────
-- 13. RAW PAYLOAD — full detail for ONE loop. Edit the id.
--     Use when a section above points at something and you need everything.
-- ─────────────────────────────────────────────────────────────────────
SELECT window_kind, window_end, jsonb_pretty(payload) AS payload
FROM   analytics.cplm_gate_results
WHERE  loop_id = 'FIC10409' AND window_kind = '12h'
ORDER  BY window_end DESC LIMIT 1;
