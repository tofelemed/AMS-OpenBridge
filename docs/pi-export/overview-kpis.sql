-- CPM Overview KPIs for AVEVA PI - one row per KPI, computed exactly like cplm-api does for the Overview page.
-- Source of truth reproduced here: src/services/cplm-api/Data/FleetKpiSql.cs (rows) and
-- src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs (classification, counts, denominators).
-- Database: traverse_cplm. Read-only. Change the four values in `params` only.
WITH params AS (
    SELECT '12h'::text AS window_kind,   -- '12h' (page default) or '24h'
           now()       AS as_of,         -- evaluation instant (UTC); a past instant back-fills (gate results are kept 14 days)
           NULL::text  AS site,          -- NULL = whole plant; or a cpm.loop_registry.site / area / unit value
           NULL::text  AS area,
           NULL::text  AS unit,
           3600        AS fresh_s,       -- KpiThresholds.FreshSeconds
           0.95        AS normal_min,    -- NormalModeMin  (AUTO / CASCADE share)
           0.10        AS sat_max,       -- SaturationMax  (share of the window at an OP limit)
           0.50        AS manual_min     -- ManualModeMin
),
loops AS (
    SELECT r.loop_id, r.display_name, r.site, r.area, r.unit,
           n.window_end,
           upper(trim(coalesce(n.diagnosis, '')))                AS d,
           n.confidence,
           (n.payload->>'auto_pct')::float8                     AS auto_pct,
           (n.payload->>'manual_pct')::float8                   AS manual_pct,
           (n.payload->>'saturation_pct')::float8               AS saturation_pct,
           upper(trim(coalesce(n.payload->'gates'->>'G3', ''))) AS g3,
           upper(trim(coalesce(n.payload->'gates'->>'G4', ''))) AS g4
    FROM cpm.loop_registry r
    CROSS JOIN params p
    LEFT JOIN LATERAL (                                   -- the loop's newest LIVE fused result of that window kind
        SELECT g.window_end, g.diagnosis, g.confidence, g.payload
        FROM analytics.cplm_gate_results g
        WHERE lower(g.loop_id) = lower(r.loop_id) AND g.window_kind = p.window_kind AND g.purpose = 'LIVE'
          AND g.window_end <= p.as_of
        ORDER BY g.window_end DESC NULLS LAST, g.created_at DESC
        LIMIT 1
    ) n ON TRUE
    WHERE COALESCE((r.monitoring->>'enabled')::boolean, FALSE)          -- "monitored" loops
      AND (p.site IS NULL OR r.site = p.site)
      AND (p.area IS NULL OR r.area = p.area)
      AND (p.unit IS NULL OR r.unit = p.unit)
),
flags AS (
    SELECT l.*,
           COALESCE(l.window_end IS NOT NULL AND extract(epoch FROM p.as_of - l.window_end) <= p.fresh_s, FALSE) AS fresh,
           p.normal_min, p.sat_max, p.manual_min
    FROM loops l CROSS JOIN params p
),
measured AS (
    SELECT f.*,
           (fresh AND auto_pct IS NOT NULL)                                  AS mode_measured,
           COALESCE(fresh AND auto_pct >= normal_min, FALSE)                AS in_mode,
           (fresh AND manual_pct IS NOT NULL)                                AS manual_measured,
           COALESCE(fresh AND manual_pct >= manual_min, FALSE)              AS in_manual,
           (fresh AND saturation_pct IS NOT NULL)                            AS sat_measured,
           COALESCE(fresh AND saturation_pct > sat_max, FALSE)              AS saturated,
           CASE WHEN window_end IS NULL THEN 'NEVER_EVALUATED'
                WHEN NOT fresh THEN 'STALE'
                WHEN d IN ('', 'PENDING', 'INSUFFICIENT_DATA') OR d LIKE 'EXCLUDED%' THEN 'NOT_ASSESSABLE'
                ELSE 'ASSESSED' END                                            AS state,
           split_part(d, '_', 1)                                             AS band,
           CASE WHEN strpos(d, '_') > 0 THEN substr(d, strpos(d, '_') + 1) END AS family
    FROM flags f
),
classified AS (
    SELECT m.*,
           CASE WHEN state <> 'ASSESSED' THEN NULL
                WHEN d IN ('NO_CALL', 'INSUFFICIENT_EVIDENCE') THEN
                     CASE WHEN in_mode AND NOT saturated AND g3 = 'PASS' AND g4 <> 'STRONG'
                          THEN 'ACCEPTABLE' ELSE 'NO_FAULT_LIMITED' END
                WHEN band IN ('SUSPECTED', 'CONFIRMED') THEN 'FINDING'
                WHEN band IN ('DETECTED', 'CLASSIFIED') THEN 'SYMPTOM_ONLY'
                ELSE 'UNRECOGNISED' END                                        AS outcome
    FROM measured m
),
counts AS (
    SELECT count(*)                                                                    AS monitored,
           count(*) FILTER (WHERE state = 'ASSESSED')                                  AS assessed,
           count(*) FILTER (WHERE mode_measured)                                       AS mode_measured,
           count(*) FILTER (WHERE manual_measured)                                     AS manual_measured,
           count(*) FILTER (WHERE sat_measured)                                        AS sat_measured,
           count(*) FILTER (WHERE outcome = 'ACCEPTABLE')                              AS acceptable,
           count(*) FILTER (WHERE in_mode)                                             AS normal_mode,
           count(*) FILTER (WHERE in_manual)                                           AS manual_mode,
           count(*) FILTER (WHERE outcome = 'FINDING' AND family = 'OSCILLATION')      AS oscillating,
           count(*) FILTER (WHERE outcome = 'FINDING' AND family = 'FINAL_ELEMENT_NONLINEARITY') AS valve,
           count(*) FILTER (WHERE outcome = 'FINDING' AND family = 'EXCESSIVE_EFFORT') AS effort,
           count(*) FILTER (WHERE saturated)                                           AS saturated,
           count(*) FILTER (WHERE state = 'NOT_ASSESSABLE')                            AS not_assessable,
           count(*) FILTER (WHERE state = 'STALE')                                     AS stale,
           count(*) FILTER (WHERE state = 'NEVER_EVALUATED')                           AS never_evaluated,
           count(*) FILTER (WHERE outcome = 'FINDING')                                 AS finding,
           count(*) FILTER (WHERE outcome = 'SYMPTOM_ONLY')                            AS symptom_only,
           count(*) FILTER (WHERE outcome = 'NO_FAULT_LIMITED')                        AS no_fault_limited
    FROM classified
)
SELECT p.as_of, p.window_kind, k.kpi_key, k.label, k.cnt AS count, k.den AS denominator,
       CASE WHEN k.den > 0 THEN round(100.0 * k.cnt / k.den, 1) END AS pct      -- the page shows round(pct)
FROM counts c CROSS JOIN params p
CROSS JOIN LATERAL (VALUES
    (1,  'acceptable',       'Performing acceptably',       c.acceptable,       c.monitored),
    (2,  'normal-mode',      'In auto mode',                c.normal_mode,      c.mode_measured),
    (3,  'manual-mode',      'In manual mode',              c.manual_mode,      c.manual_measured),
    (4,  'oscillating',      'Oscillating',                 c.oscillating,      c.assessed),
    (5,  'valve',            'Suspected valve problem',     c.valve,            c.assessed),
    (6,  'effort',           'Excessive actuator effort',   c.effort,           c.assessed),
    (7,  'saturated',        'Saturated / at limit',        c.saturated,        c.sat_measured),
    (8,  'not-assessable',   'Not assessable',              c.not_assessable,   c.monitored),
    (9,  'stale',            'Stale',                       c.stale,            c.monitored),
    (10, 'never-evaluated',  'Never evaluated',             c.never_evaluated,  c.monitored),
    (11, 'monitored',        'Monitored loops',             c.monitored,        c.monitored),
    (12, 'assessed',         'Assessed loops',              c.assessed,         c.monitored),
    (13, 'finding',          'With a finding (state bar)',  c.finding,          c.monitored),
    (14, 'symptom-only',     'Symptom only (state bar)',    c.symptom_only,     c.monitored),
    (15, 'no-fault-limited', 'No fault, limited (state bar)', c.no_fault_limited, c.monitored)
) AS k(ord, kpi_key, label, cnt, den)
ORDER BY k.ord;
