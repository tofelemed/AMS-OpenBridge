-- =====================================================================
-- 3/3  Move the loops parked at hdpe/unassigned/unassigned into real units
--
--   Database : traverse_cplm          Run in : pgAdmin Query Tool (or psql)
--   Follows  : cpm-01-onboard-missing-loops.sql
--   Targets  : cpm.loop_registry (site/area/unit) AND cpm.loop_tag_map (uns_path)
--
-- BOTH tables must move together. The registry row says where the loop lives;
-- cpm.loop_tag_map.uns_path is the per-role signal path the UNS projection and
-- the binding resolver actually use. Updating only the registry leaves a loop
-- filed under one unit while its four signals still point at the old location.
--
-- WHAT THE PLACEMENT AFFECTS -- read before choosing at random
--   * G13 peer links. Loops sharing a unit are peers, and with peers present the
--     fusion engine treats `oscillation AND NOT actuatorStress` as DISTURBANCE
--     context and DISQUALIFIES the stiction family. Wrong neighbours therefore
--     produce wrong diagnoses, not just a wrong-looking tree.
--   * The UNS signal paths, hence every projected asset and every trend binding.
--   * Plant-model navigation: operators find a loop by its equipment.
--
-- COST OF CORRECTING IT LATER: republish projects assets at the NEW paths; the
-- assets at the OLD paths are left behind as orphans (no cross-database FK), so
-- every relocation cycle leaks CpmLoopSignal measurements until reconciled with
-- scripts/cleanup-orphan-loop-signal-assets.ps1. Moving once, correctly, is
-- cheaper than moving twice.
--
-- MANDATORY AFTER THIS SCRIPT
--   POST /api/v1/cpm/loops/{loopId}/republish-evidence  for every moved loop.
--   SQL reaches neither the UNS (a cross-database projection) nor Flink (which
--   only hears the cplm.loop.engineering broadcast). Without it the move is
--   invisible outside this database.
--
-- DRY RUN: change the final COMMIT to ROLLBACK. Every report still prints.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Choose the placement.
--
-- DEFAULT (below): spread the parked loops evenly over the units that already
-- exist in the registry -- deterministic, so a re-run is identical, and every
-- target is a real node rather than an invented one. This is a PLACEHOLDER that
-- gets them out of `unassigned`; it is not plant knowledge.
--
-- PREFERRED: comment out the block below and use the explicit form after it.
-- ---------------------------------------------------------------------
CREATE TEMP TABLE cpa_units AS
SELECT site, area, unit, row_number() OVER (ORDER BY area, unit) AS rn
FROM  (SELECT DISTINCT site, area, unit
       FROM   cpm.loop_registry
       WHERE  unit IS NOT NULL AND unit <> 'unassigned'
         AND  area IS NOT NULL AND area <> 'unassigned') d;

CREATE TEMP TABLE cpa_relocate AS
SELECT p.loop_id, u.site, u.area, u.unit
FROM  (SELECT loop_id, row_number() OVER (ORDER BY loop_id) AS rn
       FROM   cpm.loop_registry
       WHERE  unit = 'unassigned') p
JOIN   cpa_units u
  ON   u.rn = ((p.rn - 1) % GREATEST((SELECT count(*) FROM cpa_units), 1)) + 1;

-- --- EXPLICIT FORM (preferred; delete the two CREATE TEMP TABLEs above) ------
-- CREATE TEMP TABLE cpa_relocate (loop_id text PRIMARY KEY, site text, area text, unit text);
-- INSERT INTO cpa_relocate VALUES
--   ('AIC30601',   'hdpe', 'section_300', 'u3001_<real_unit>'),
--   ('FC10711',    'hdpe', 'section_100', 'u1007_catalyst_preparation'),
--   ...  -- one row per loop; run report 1 first to see the valid unit names
-- ;
-- ----------------------------------------------------------------------------

DO $$
DECLARE n_units int; n_loops int; sample text;
BEGIN
    SELECT count(*) INTO n_units FROM cpa_units;
    SELECT count(*) INTO n_loops FROM cpa_relocate;
    IF n_units = 0 THEN
        RAISE EXCEPTION 'No real units found in cpm.loop_registry - nothing to place into.';
    END IF;
    RAISE NOTICE '1. % real unit(s) available, % loop(s) parked at unassigned.', n_units, n_loops;
    IF n_loops = 0 THEN
        RAISE NOTICE '   Nothing to move - already placed. The updates below are no-ops.';
    END IF;
    SELECT string_agg(loop_id || ' -> ' || area || '/' || unit, E'\n     ' ORDER BY loop_id)
      INTO sample FROM cpa_relocate;
    RAISE NOTICE '2. Planned placement:%', COALESCE(E'\n     ' || sample, ' (none)');
END $$;

-- ---------------------------------------------------------------------
-- 2. Move the registry row.
-- ---------------------------------------------------------------------
UPDATE cpm.loop_registry r
SET    site = x.site, area = x.area, unit = x.unit, updated_at = NOW()
FROM   cpa_relocate x
WHERE  r.loop_id = x.loop_id;

-- ---------------------------------------------------------------------
-- 3. Move the signal paths with it. Format is site/area/unit/<loopid>.<role>,
--    lower-cased, exactly as cpm-01 and the activate API write it.
-- ---------------------------------------------------------------------
UPDATE cpm.loop_tag_map m
SET    uns_path = x.site || '/' || x.area || '/' || x.unit || '/'
                  || lower(m.loop_id) || '.' || lower(m.signal_role)
FROM   cpa_relocate x
WHERE  m.loop_id = x.loop_id;

DO $$
DECLARE bad int;
BEGIN
    -- Every moved loop's paths must now agree with its registry row.
    SELECT count(*) INTO bad
    FROM   cpm.loop_tag_map m
    JOIN   cpm.loop_registry r ON r.loop_id = m.loop_id
    JOIN   cpa_relocate     x ON x.loop_id = m.loop_id
    WHERE  m.uns_path <> r.site || '/' || r.area || '/' || r.unit || '/'
                         || lower(m.loop_id) || '.' || lower(m.signal_role);
    IF bad > 0 THEN
        RAISE EXCEPTION 'Rolling back: % tag_map row(s) disagree with the registry row.', bad;
    END IF;
    RAISE NOTICE '3. Registry and tag_map agree for every moved loop.';
    RAISE NOTICE '4. NOW REPUBLISH, or this move exists only in this database:';
    RAISE NOTICE '     POST /api/v1/cpm/loops/{loopId}/republish-evidence   (one per moved loop)';
    RAISE NOTICE '   Assets at the OLD unassigned paths are left behind as orphans;';
    RAISE NOTICE '   reconcile with scripts/cleanup-orphan-loop-signal-assets.ps1 -WhatIf.';
END $$;

DROP TABLE cpa_relocate;
DROP TABLE cpa_units;

COMMIT;

-- Verification: no loop should remain at unassigned, and each moved loop keeps
-- its four signal roles.
SELECT r.loop_id, r.area, r.unit, count(m.*) AS signal_roles
FROM   cpm.loop_registry r
LEFT   JOIN cpm.loop_tag_map m ON m.loop_id = r.loop_id
GROUP  BY r.loop_id, r.area, r.unit
HAVING r.unit = 'unassigned' OR count(m.*) <> 4
ORDER  BY r.loop_id;
-- An empty result means every loop is placed and fully mapped.
