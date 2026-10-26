-- CPM Overview KPIs - 12h and 24h in one run: 15 rows per window kind, always (zeros when the scope matches no loop).
-- Computed exactly like cplm-api does for the Overview page:
--   src/services/cplm-api/Data/FleetKpiSql.cs (rows) and Services/Kpi/FleetKpiClassifier.cs (classification, counts, denominators).
-- Database: traverse_cplm. Read-only. Change only the values in `kinds` and `params`.
WITH kinds AS (
    SELECT unnest(ARRAY['12h', '24h']) AS window_kind         -- the two windows of the page
),
params AS (
    SELECT k.window_kind,
           now()       AS as_of,         -- evaluation instant (UTC); one value for the whole statement
           NULL::text  AS site,          -- NULL = whole plant; or a cpm.loop_registry site / area / unit value
           NULL::text  AS area,
           NULL::text  AS unit,
           3600        AS fresh_s,       -- newest result must be at most 1 h old
           0.95        AS normal_min,    -- in auto mode: AUTO / CASCADE share >= 0.95
           0.10        AS sat_max,       -- saturated: share at an OP limit > 0.10
           0.50        AS manual_min     -- in manual mode: MANUAL share >= 0.50
    FROM kinds k
),
loops AS (
    SELECT p.window_kind,
           r.loop_id,
           n.window_end,
           upper(trim(coalesce(n.diagnosis, '')))                AS d,
           (n.payload->>'auto_pct')::float8                     AS auto_pct,
           (n.payload->>'manual_pct')::float8                   AS manual_pct,
           (n.payload->>'saturation_pct')::float8               AS saturation_pct,
           upper(trim(coalesce(n.payload->'gates'->>'G3', ''))) AS g3,
           upper(trim(coalesce(n.payload->'gates'->>'G4', ''))) AS g4
    FROM cpm.loop_registry r
    CROSS JOIN params p                                           -- each monitored loop once per window kind
    LEFT JOIN LATERAL (                                           -- its newest LIVE result of that window kind
        SELECT g.window_end, g.diagnosis, g.payload
        FROM analytics.cplm_gate_results g
        WHERE lower(g.loop_id) = lower(r.loop_id) AND g.window_kind = p.window_kind AND g.purpose = 'LIVE'
          AND g.window_end <= p.as_of
        ORDER BY g.window_end DESC NULLS LAST, g.created_at DESC
        LIMIT 1
    ) n ON TRUE
    WHERE COALESCE((r.monitoring->>'enabled')::boolean, FALSE)   -- "monitored" loops only
      AND (p.site IS NULL OR r.site = p.site)
      AND (p.area IS NULL OR r.area = p.area)
      AND (p.unit IS NULL OR r.unit = p.unit)
),
measured AS (
    SELECT l.*, x.fresh,
           (x.fresh AND l.auto_pct IS NOT NULL)                              AS mode_measured,
           COALESCE(x.fresh AND l.auto_pct >= p.normal_min, FALSE)          AS in_mode,
           (x.fresh AND l.manual_pct IS NOT NULL)                            AS manual_measured,
           COALESCE(x.fresh AND l.manual_pct >= p.manual_min, FALSE)        AS in_manual,
           (x.fresh AND l.saturation_pct IS NOT NULL)                        AS sat_measured,
           COALESCE(x.fresh AND l.saturation_pct > p.sat_max, FALSE)        AS saturated,
           CASE WHEN l.window_end IS NULL THEN 'NEVER_EVALUATED'
                WHEN NOT x.fresh THEN 'STALE'
                WHEN l.d IN ('', 'PENDING', 'INSUFFICIENT_DATA') OR l.d LIKE 'EXCLUDED%' THEN 'NOT_ASSESSABLE'
                ELSE 'ASSESSED' END                                            AS state,
           split_part(l.d, '_', 1)                                           AS band,
           CASE WHEN strpos(l.d, '_') > 0 THEN substr(l.d, strpos(l.d, '_') + 1) END AS family
    FROM loops l
    JOIN params p ON p.window_kind = l.window_kind
    CROSS JOIN LATERAL (SELECT COALESCE(l.window_end IS NOT NULL
                                        AND extract(epoch FROM p.as_of - l.window_end) <= p.fresh_s, FALSE) AS fresh) x
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
counts AS (                                                       -- from `params`, so every window kind gets a row
    SELECT p.window_kind, p.as_of,
           count(c.loop_id)                                                              AS monitored,
           count(c.loop_id) FILTER (WHERE c.state = 'ASSESSED')                          AS assessed,
           count(c.loop_id) FILTER (WHERE c.mode_measured)                               AS mode_measured,
           count(c.loop_id) FILTER (WHERE c.manual_measured)                             AS manual_measured,
           count(c.loop_id) FILTER (WHERE c.sat_measured)                                AS sat_measured,
           count(c.loop_id) FILTER (WHERE c.outcome = 'ACCEPTABLE')                      AS acceptable,
           count(c.loop_id) FILTER (WHERE c.in_mode)                                     AS normal_mode,
           count(c.loop_id) FILTER (WHERE c.in_manual)                                   AS manual_mode,
           count(c.loop_id) FILTER (WHERE c.outcome = 'FINDING' AND c.family = 'OSCILLATION')                AS oscillating,
           count(c.loop_id) FILTER (WHERE c.outcome = 'FINDING' AND c.family = 'FINAL_ELEMENT_NONLINEARITY') AS valve,
           count(c.loop_id) FILTER (WHERE c.outcome = 'FINDING' AND c.family = 'EXCESSIVE_EFFORT')           AS effort,
           count(c.loop_id) FILTER (WHERE c.saturated)                                   AS saturated,
           count(c.loop_id) FILTER (WHERE c.state = 'NOT_ASSESSABLE')                    AS not_assessable,
           count(c.loop_id) FILTER (WHERE c.state = 'STALE')                             AS stale,
           count(c.loop_id) FILTER (WHERE c.state = 'NEVER_EVALUATED')                   AS never_evaluated,
           count(c.loop_id) FILTER (WHERE c.outcome = 'FINDING')                         AS finding,
           count(c.loop_id) FILTER (WHERE c.outcome = 'SYMPTOM_ONLY')                    AS symptom_only,
           count(c.loop_id) FILTER (WHERE c.outcome = 'NO_FAULT_LIMITED')                AS no_fault_limited
    FROM params p
    LEFT JOIN classified c ON c.window_kind = p.window_kind
    GROUP BY p.window_kind, p.as_of
)
SELECT c.as_of, c.window_kind, k.kpi_key, k.label, k.cnt AS count, k.den AS denominator,
       CASE WHEN k.den > 0 THEN round(100.0 * k.cnt / k.den, 1) END AS pct      -- NULL when the denominator is 0; the page rounds to a whole number
FROM counts c
CROSS JOIN LATERAL (VALUES
    (1,  'acceptable',       'Performing acceptably',         c.acceptable,       c.monitored),
    (2,  'normal-mode',      'In auto mode',                  c.normal_mode,      c.mode_measured),
    (3,  'manual-mode',      'In manual mode',                c.manual_mode,      c.manual_measured),
    (4,  'oscillating',      'Oscillating',                   c.oscillating,      c.assessed),
    (5,  'valve',            'Suspected valve problem',       c.valve,            c.assessed),
    (6,  'effort',           'Excessive actuator effort',     c.effort,           c.assessed),
    (7,  'saturated',        'Saturated / at limit',          c.saturated,        c.sat_measured),
    (8,  'not-assessable',   'Not assessable',                c.not_assessable,   c.monitored),
    (9,  'stale',            'Stale',                         c.stale,            c.monitored),
    (10, 'never-evaluated',  'Never evaluated',               c.never_evaluated,  c.monitored),
    (11, 'monitored',        'Monitored loops',               c.monitored,        c.monitored),
    (12, 'assessed',         'Assessed loops',                c.assessed,         c.monitored),
    (13, 'finding',          'With a finding (state bar)',    c.finding,          c.monitored),
    (14, 'symptom-only',     'Symptom only (state bar)',      c.symptom_only,     c.monitored),
    (15, 'no-fault-limited', 'No fault, limited (state bar)', c.no_fault_limited, c.monitored)
) AS k(ord, kpi_key, label, cnt, den)
ORDER BY c.window_kind, k.ord;
