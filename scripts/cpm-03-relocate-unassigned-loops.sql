-- =====================================================================
-- 3/3  Move the loops parked at hdpe/unassigned/unassigned into real units
--
--   Database : traverse_cplm          Run in : pgAdmin Query Tool
--   Follows  : cpm-01-onboard-missing-loops.sql
--   Targets  : cpm.loop_registry (site/area/unit) AND cpm.loop_tag_map (uns_path)
--
-- THREE INDEPENDENT STATEMENTS. Run STEP 1, read it, then STEP 2, then STEP 3.
-- No temp tables, no BEGIN/COMMIT, nothing left behind if you stop halfway -- so a
-- re-run always behaves the same. (The earlier temp-table version broke exactly
-- there: a half-run left cpa_units behind and the retry died on "already exists".)
-- STEP 2 is ONE statement and therefore atomic: both tables move or neither does.
--
-- IN PGADMIN: select the one step you want and press F5. pgAdmin executes the
-- SELECTION when there is one and the whole editor when there is not -- which is
-- why a stray partial selection reports a syntax error on a line that looks fine.
--
-- BOTH TABLES MOVE TOGETHER. The registry row says where the loop lives;
-- cpm.loop_tag_map.uns_path is the per-role signal path the UNS projection and the
-- binding resolver actually use. Updating only the registry files a loop under one
-- unit while its four signals still point at the old location.
--
-- WHAT THE PLACEMENT AFFECTS -- read before choosing at random
--   * G13 peer links. Loops sharing a unit are peers, and with peers present the
--     fusion engine treats `oscillation AND NOT actuatorStress` as DISTURBANCE
--     context and DISQUALIFIES the stiction family. Wrong neighbours therefore
--     produce wrong diagnoses, not just a wrong-looking tree.
--   * The UNS signal paths, hence every projected asset and every trend binding.
--   * Plant-model navigation: operators find a loop by its equipment.
--
-- MANDATORY AFTER STEP 2
--   POST /api/v1/cpm/loops/{loopId}/republish-evidence   for every moved loop.
--   SQL reaches neither the UNS (a cross-database projection) nor Flink (which only
--   hears the cplm.loop.engineering broadcast). Without it the move is invisible
--   outside this database. Re-projection also creates assets at the NEW paths and
--   leaves the old ones behind as orphans -- reconcile with
--   scripts/cleanup-orphan-loop-signal-assets.ps1 -WhatIf. Move once, correctly.
-- =====================================================================


-- =====================================================================
-- STEP 1 -- PREVIEW. Read-only. Shows exactly what STEP 2 would do.
-- =====================================================================
WITH units AS (
    SELECT site, area, unit, row_number() OVER (ORDER BY area, unit) AS rn
    FROM  (SELECT DISTINCT site, area, unit
           FROM   cpm.loop_registry
           WHERE  unit IS NOT NULL AND unit <> 'unassigned'
             AND  area IS NOT NULL AND area <> 'unassigned') d
), parked AS (
    SELECT loop_id, row_number() OVER (ORDER BY loop_id) AS rn
    FROM   cpm.loop_registry
    WHERE  unit = 'unassigned'
)
SELECT p.loop_id,
       u.site, u.area, u.unit,
       u.site || '/' || u.area || '/' || u.unit || '/' || lower(p.loop_id) || '.pv'
           AS example_new_signal_path
FROM   parked p
JOIN   units  u ON u.rn = ((p.rn - 1) % GREATEST((SELECT count(*) FROM units), 1)) + 1
ORDER  BY p.loop_id;
-- No rows = nothing is parked at unassigned; you are already done.


-- =====================================================================
-- STEP 2 -- APPLY. One statement, atomic: registry and tag_map move together.
--
-- `moved_registry` is a data-modifying CTE: PostgreSQL always runs it to
-- completion even though the outer query never reads it. Both updates draw on the
-- SAME `relocate` set, so the two tables cannot diverge.
-- =====================================================================
WITH units AS (
    SELECT site, area, unit, row_number() OVER (ORDER BY area, unit) AS rn
    FROM  (SELECT DISTINCT site, area, unit
           FROM   cpm.loop_registry
           WHERE  unit IS NOT NULL AND unit <> 'unassigned'
             AND  area IS NOT NULL AND area <> 'unassigned') d
), parked AS (
    SELECT loop_id, row_number() OVER (ORDER BY loop_id) AS rn
    FROM   cpm.loop_registry
    WHERE  unit = 'unassigned'
), relocate AS (
    SELECT p.loop_id, u.site, u.area, u.unit
    FROM   parked p
    JOIN   units  u ON u.rn = ((p.rn - 1) % GREATEST((SELECT count(*) FROM units), 1)) + 1
), moved_registry AS (
    UPDATE cpm.loop_registry r
    SET    site = x.site, area = x.area, unit = x.unit, updated_at = NOW()
    FROM   relocate x
    WHERE  r.loop_id = x.loop_id
    RETURNING r.loop_id
)
UPDATE cpm.loop_tag_map m
SET    uns_path = x.site || '/' || x.area || '/' || x.unit || '/'
                  || lower(m.loop_id) || '.' || lower(m.signal_role)
FROM   relocate x
WHERE  m.loop_id = x.loop_id;
-- Expect "UPDATE 56" for 14 loops x 4 roles. The registry update is silent (it is
-- the CTE); STEP 3 proves both landed.


-- =====================================================================
-- STEP 2-ALT -- EXPLICIT PLACEMENT (preferred once the plant confirms units).
-- Run this INSTEAD of STEP 2. Edit the VALUES rows; STEP 1 lists the valid unit
-- names. Any loop you leave out simply stays where it is.
-- =====================================================================
-- WITH relocate (loop_id, site, area, unit) AS (VALUES
--     ('AIC30601', 'hdpe', 'section_300', 'u3001_hexane_purification_i_distillation'),
--     ('FC10711',  'hdpe', 'section_100', 'u1007_catalyst_preparation')
--     -- ... one row per loop
-- ), moved_registry AS (
--     UPDATE cpm.loop_registry r
--     SET    site = x.site, area = x.area, unit = x.unit, updated_at = NOW()
--     FROM   relocate x
--     WHERE  r.loop_id = x.loop_id
--     RETURNING r.loop_id
-- )
-- UPDATE cpm.loop_tag_map m
-- SET    uns_path = x.site || '/' || x.area || '/' || x.unit || '/'
--                   || lower(m.loop_id) || '.' || lower(m.signal_role)
-- FROM   relocate x
-- WHERE  m.loop_id = x.loop_id;


-- =====================================================================
-- STEP 3 -- VERIFY. Read-only. AN EMPTY RESULT IS THE PASS.
-- RUN THIS BEFORE STEP 2 TOO, as a baseline: it checks the whole registry, so a
-- loop it flags on the first run carries pre-existing drift and is not something
-- this script caused. (On the lab, B2_027PIC reports 4 mismatched paths -- it was
-- imported with dotted IoTDB-style paths instead of slash paths, long before this.)
-- Flags any loop still parked, any loop missing signal roles, and -- the failure
-- that actually matters -- any loop whose stored signal path disagrees with its
-- registry row, which is what you get if only one of the two tables was updated.
-- =====================================================================
SELECT r.loop_id,
       r.area, r.unit,
       count(m.*) AS signal_roles,
       count(*) FILTER (
           WHERE r.area IS NOT NULL AND r.area <> ''
             AND r.site IS NOT NULL AND r.unit IS NOT NULL
             AND m.uns_path IS DISTINCT FROM
                 r.site || '/' || r.area || '/' || r.unit || '/'
                 || lower(m.loop_id) || '.' || lower(m.signal_role)
       ) AS mismatched_paths
FROM   cpm.loop_registry r
LEFT   JOIN cpm.loop_tag_map m ON m.loop_id = r.loop_id
GROUP  BY r.loop_id, r.site, r.area, r.unit
HAVING r.unit = 'unassigned'
    OR count(m.*) < 4
    OR count(*) FILTER (
           WHERE r.area IS NOT NULL AND r.area <> ''
             AND r.site IS NOT NULL AND r.unit IS NOT NULL
             AND m.uns_path IS DISTINCT FROM
                 r.site || '/' || r.area || '/' || r.unit || '/'
                 || lower(m.loop_id) || '.' || lower(m.signal_role)
       ) > 0
ORDER  BY r.loop_id;
-- `< 4` not `<> 4`: a loop with positioner feedback mapped has FIVE roles
-- (PV/SP/OP/MODE/VP) and is correct, not suspect.
--
-- The path check is skipped where site/area/unit is blank. A NULL anywhere in the
-- concatenation makes the whole expression NULL, so without this guard every such
-- loop reports as mismatched -- 52 false positives on the lab's older demo loops,
-- which predate the site/area/unit convention and are not this script's business.
