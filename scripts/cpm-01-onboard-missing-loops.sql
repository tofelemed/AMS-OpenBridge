-- =====================================================================
-- 1/2  Onboard the 14 CPA loops that are not in the registry
--
--   Database : traverse_cplm          Run in : pgAdmin Query Tool (or psql)
--   Loops    : 14   (TIC30206OLD is not a loop - see the note below)
--   Generated: 2026-09-10
--
-- Reports print to the pgAdmin **Messages** tab; the final grid is the
-- verification result. No psql meta-commands are used.
--
-- WHY THESE 14
--   They appear in "Loops Data for CPA.xlsx" but in no registry, in
--   hdpe-all-loops.csv, or in the asset model - they were never part of the
--   plant onboarding set.
--
-- LOCATION - hdpe/unassigned/unassigned
--   A real node in the plant tree, not a guess. The tag number does not predict
--   the unit (27 of 33 digit prefixes map to more than one unit), so a derived
--   placement would be an invention. Relocate with the registry wizard once the
--   plant confirms each one.
--
-- loop_type mirrors the engine's own inferFromTag so the registry row and the
-- dynamics profile agree:  FQIC/FC -> FIC,  PDIC -> PIC,
--                          AIC/IIC/NIC -> UNKNOWN.
--   UNKNOWN is accepted by the CHECK constraint, but that profile pack has
--   priorGeometry 0.0, so geometry-based diagnosis stays OFF for AIC30601,
--   IIC20101A/B/C and NIC51101 until a real class is assigned.
--
-- TIC30206OLD is deliberately NOT onboarded as a new loop. The plant confirmed on
-- 2026-09-10 that only TIC30206 is in service - "OLD" is its superseded name - and
-- TIC30206 is already registered AND modelled at
-- hdpe/section_100/u1001_polymerization_reactor_1. Script 2 therefore loads that
-- workbook row's ranges onto TIC30206; creating a second loop here would have split
-- one instrument across two registry rows.
--
-- WHAT THIS SCRIPT CANNOT DO  (see the follow-up at the bottom - it is required)
--   * cpm.loop_signal_asset + the matching rows in the traverse_assets database.
--     Those are a cross-database projection; this script only touches
--     traverse_cplm, so the loops exist but their signals are not in the UNS tree.
--   * The cplm.loop.engineering / cplm.loop.evidence broadcast to Kafka, which is
--     how Flink learns about a loop at all.
--   ONE call per loop fixes both: POST /api/v1/cpm/loops/{loopId}/republish-evidence
--
-- SAFETY: idempotent (ON CONFLICT DO NOTHING), transactional. For a DRY RUN
-- change the final COMMIT to ROLLBACK - the reports still print.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Staging. Plain TEMP table (not ON COMMIT DROP) so it behaves the same
-- whether pgAdmin is in autocommit or not; dropped explicitly below.
-- ---------------------------------------------------------------------
CREATE TEMP TABLE cpa_new_loops (
    loop_id      text PRIMARY KEY,
    display_name text NOT NULL,
    loop_type    text NOT NULL,
    op_min numeric NOT NULL, op_max numeric NOT NULL,
    pv_min numeric NOT NULL, pv_max numeric NOT NULL
);

INSERT INTO cpa_new_loops
    (loop_id, display_name, loop_type, op_min, op_max, pv_min, pv_max) VALUES
  ('AIC30601', 'Analyser controller AIC30601', 'UNKNOWN', 0, 100, 4, 12),
  ('FC10711', 'Flow controller FC10711', 'FIC', 0, 100, 0, 600),
  ('FC10712', 'Flow controller FC10712', 'FIC', 0, 100, 0, 300),
  ('FQIC10103', 'Flow totaliser controller FQIC10103', 'FIC', 0, 100, 0, 16000),
  ('FQIC10104', 'Flow totaliser controller FQIC10104', 'FIC', 0, 100, 0, 2000),
  ('FQIC10304', 'Flow totaliser controller FQIC10304', 'FIC', 0, 100, 0, 200),
  ('FQIC40302', 'Flow totaliser controller FQIC40302', 'FIC', 0, 100, 0, 2000),
  ('FQIC50102C', 'Flow totaliser controller FQIC50102C', 'FIC', 0, 40, 0, 400),
  ('IIC20101A', 'Current controller IIC20101A', 'UNKNOWN', 0, 63, 0, 50),
  ('IIC20101B', 'Current controller IIC20101B', 'UNKNOWN', 0, 65, 0, 50),
  ('IIC20101C', 'Current controller IIC20101C', 'UNKNOWN', 0, 58, 0, 50),
  ('NIC51101', 'Speed controller NIC51101', 'UNKNOWN', 0, 100, 0, 252),
  ('PDIC10407', 'Differential pressure controller PDIC10407', 'PIC', 0, 100, 0, 25),
  ('PDIC10418', 'Differential pressure controller PDIC10418', 'PIC', 25, 100, 0, 100);

-- ---------------------------------------------------------------------
-- Pre-flight: anything here already? (idempotent re-run, or a name clash)
-- ---------------------------------------------------------------------
DO $$
DECLARE existing int; conflicting text;
BEGIN
    SELECT count(*) INTO existing
      FROM cpa_new_loops n JOIN cpm.loop_registry r ON r.loop_id = n.loop_id;
    IF existing > 0 THEN
        SELECT string_agg(n.loop_id, ', ' ORDER BY n.loop_id) INTO conflicting
          FROM cpa_new_loops n JOIN cpm.loop_registry r ON r.loop_id = n.loop_id;
        RAISE NOTICE 'ALREADY REGISTERED (left untouched): % -> %', existing, conflicting;
    ELSE
        RAISE NOTICE 'None of the 14 exist yet - all will be inserted.';
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1. cpm.loop_registry
--    monitoring/tags JSONB reproduce exactly what POST /loops/activate writes.
--    UNS paths are derived, never hand-typed: {site}/{area}/{unit}/{loop_id lower}.{role}
-- ---------------------------------------------------------------------
INSERT INTO cpm.loop_registry (
    loop_id, asset_id, display_name, site, area, unit, loop_type, criticality,
    is_active, monitoring, tags, engineering, threshold_profile_id, timezone,
    created_at, updated_at)
SELECT n.loop_id,
       NULL,
       n.display_name,
       'hdpe', 'unassigned', 'unassigned',
       n.loop_type,
       'medium',
       true,
       jsonb_build_object(
           'enabled', true,
           'cplmPipeline', 'cplm-three-stage-system',
           'evidence', jsonb_build_object('stepTestApproved', false,
                                          'peerLinksConfigured', false)),
       jsonb_build_object(
           'pv',   'hdpe/unassigned/unassigned/' || lower(n.loop_id) || '.pv',
           'sp',   'hdpe/unassigned/unassigned/' || lower(n.loop_id) || '.sp',
           'op',   'hdpe/unassigned/unassigned/' || lower(n.loop_id) || '.op',
           'mode', 'hdpe/unassigned/unassigned/' || lower(n.loop_id) || '.mode'),
       jsonb_build_object('opMin', n.op_min, 'opMax', n.op_max,
                          'pvMin', n.pv_min, 'pvMax', n.pv_max),
       NULL,
       'UTC',
       NOW(), NOW()
FROM   cpa_new_loops n
ON CONFLICT (loop_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. cpm.loop_tag_map - one row per signal role.
--    PV/SP/OP/MODE are all four required for monitoring; VP is omitted because
--    none of these loops has positioner feedback mapped.
-- ---------------------------------------------------------------------
INSERT INTO cpm.loop_tag_map
    (loop_id, signal_role, uns_path, source_system, source_tag, is_active, created_at)
SELECT n.loop_id,
       role,
       'hdpe/unassigned/unassigned/' || lower(n.loop_id) || '.' || lower(role),
       'ot-gateway',
       NULL,          -- source_tag: fill FCSxxxx.<TAG>.PV/SV/MV/MODE when the
                      -- controller assignment is known. Ingestion does NOT need
                      -- it - a loop resolves by loop_id = the OT topic loop level.
       true,
       NOW()
FROM   cpa_new_loops n
CROSS  JOIN unnest(ARRAY['PV', 'SP', 'OP', 'MODE']) AS role
ON CONFLICT (loop_id, signal_role, uns_path) DO NOTHING;

DO $$
DECLARE reg int; tags int;
BEGIN
    SELECT count(*) INTO reg FROM cpa_new_loops n
      JOIN cpm.loop_registry r ON r.loop_id = n.loop_id;
    SELECT count(*) INTO tags FROM cpa_new_loops n
      JOIN cpm.loop_tag_map m ON m.loop_id = n.loop_id;
    RAISE NOTICE 'registry rows for these loops: % of 14', reg;
    RAISE NOTICE 'tag_map rows for these loops : % (expect 56 = 14 x 4)', tags;
    IF reg <> 14 OR tags <> 56 THEN
        RAISE EXCEPTION 'Unexpected counts - rolling back. registry=% tag_map=%', reg, tags;
    END IF;
END $$;

DROP TABLE cpa_new_loops;

-- Change to ROLLBACK for a dry run.
COMMIT;

-- ---------------------------------------------------------------------
-- Verification grid (pgAdmin shows this one). roles must read PV,SP,OP,MODE
-- and signal_assets must be 0 until the republish below is run.
-- ---------------------------------------------------------------------
SELECT r.loop_id,
       r.loop_type,
       r.site || '/' || r.area || '/' || r.unit AS location,
       r.engineering,
       (SELECT string_agg(m.signal_role, ',' ORDER BY m.signal_role)
          FROM cpm.loop_tag_map m WHERE m.loop_id = r.loop_id)      AS roles,
       (SELECT count(*) FROM cpm.loop_signal_asset a
         WHERE a.loop_id = r.loop_id)                               AS signal_assets
FROM   cpm.loop_registry r
WHERE  r.loop_id IN ('AIC30601', 'FC10711', 'FC10712', 'FQIC10103', 'FQIC10104', 'FQIC10304', 'FQIC40302', 'FQIC50102C', 'IIC20101A', 'IIC20101B', 'IIC20101C', 'NIC51101', 'PDIC10407', 'PDIC10418')
ORDER  BY r.loop_id;

-- =====================================================================
-- REQUIRED FOLLOW-UP - run for EACH of the 14
--
--   POST /api/v1/cpm/loops/{loopId}/republish-evidence      (needs cpm.manage)
--
-- That single call does the two things SQL cannot:
--   1. projects cpm.loop_signal_asset + the assets in the traverse_assets
--      database, so the signals appear in the UNS tree (the endpoint is
--      explicitly the backfill path for loops onboarded without projection);
--   2. publishes cplm.loop.evidence + cplm.loop.engineering to
--      traverse.cpa.ams.metadata.updates, which is the only way Flink learns
--      these loops and their ranges exist.
--
-- Re-run the verification grid afterwards: signal_assets should be 5 per loop
-- (PV, SP, OP, MODE + DEVICE).
-- =====================================================================
