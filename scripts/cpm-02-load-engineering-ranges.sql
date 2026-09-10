-- =====================================================================
-- 2/2  Load the engineering ranges from "Loops Data for CPA.xlsx"
--
--   Database : traverse_cplm          Run in : pgAdmin Query Tool (or psql)
--   Rows     : 171 loops  (sheet "SH&SL Final" = pvMin/pvMax,
--                           sheet "Loop Parameters" = opMin/opMax)
--   Target   : cpm.loop_registry.engineering (jsonb)
--   Generated: 2026-09-10
--
-- RUN SCRIPT 1 FIRST. Without it 15 rows have no loop to attach to; with it,
-- only TIC30206OLD stays unmatched (deliberately - see script 1).
--
-- Reports print to the pgAdmin **Messages** tab. The final grid is the
-- verification result. No psql meta-commands are used.
--
-- WHAT THIS CHANGES IN THE ENGINE
--   opMin/opMax -> normalizeOp() rescales OP to 0-100 before G2r, G4, G9, G10,
--                  effort ratio, OP travel, reversals, Horch and geometry.
--   pvMin/pvMax -> goodErrorBand() = 0.005 * (pvMax - pvMin); G3 and OCE only.
--   G2 is NOT affected - spRange is still compared in raw EU.
--
-- NOT A ONE-WAY LOOSENING. Today every loop uses a flat 0.5 EU band. Once
-- script 1 has run, the split is 57 tighter / 59 looser / 54 unchanged - the
-- tighter ones (down to 0.005 EU on PIC80150, PV 0-1) can move G3 PASS -> WARN.
--
-- SAFETY: merges with || so other keys survive; only touches loops that exist;
-- never creates one; idempotent; transactional. For a DRY RUN change the final
-- COMMIT to ROLLBACK - every report still prints.
-- =====================================================================

BEGIN;

CREATE TEMP TABLE cpm_eng_import (
    loop_id text PRIMARY KEY,
    pv_min numeric NOT NULL, pv_max numeric NOT NULL,
    op_min numeric NOT NULL, op_max numeric NOT NULL
);

INSERT INTO cpm_eng_import (loop_id, pv_min, pv_max, op_min, op_max) VALUES
  ('AIC30601', 4, 12, 0, 100),
  ('FC10711', 0, 600, 0, 100),
  ('FC10712', 0, 300, 0, 100),
  ('FIC00701', 0, 4000, 0, 100),
  ('FIC10301', 0, 140, 0, 100),
  ('FIC10302', 0, 140, 0, 100),
  ('FIC10303A', 0, 100, 0, 100),
  ('FIC10303B', 0, 100, 5, 80),
  ('FIC10401', 0, 2500, 0, 100),
  ('FIC10402', 0, 100000, 2, 100),
  ('FIC10403', 0, 100, 0, 100),
  ('FIC10404', 0, 600, 0, 100),
  ('FIC10405', 0, 6, 0, 100),
  ('FIC10406', 0, 40, 0, 100),
  ('FIC10409', 0, 25000, 0, 100),
  ('FIC10501', 0, 2000, 0, 100),
  ('FIC10502', 0, 100000, 0, 100),
  ('FIC10503', 0, 100, 0, 100),
  ('FIC10504', 0, 1800, 0, 100),
  ('FIC10505', 0, 6, 0, 100),
  ('FIC10506', 0, 30, 0, 100),
  ('FIC10509', 0, 25000, 0, 100),
  ('FIC10513', 0, 400, 0, 100),
  ('FIC10710', 0, 300, 10, 100),
  ('FIC20209', 0, 40000, 0, 100),
  ('FIC20301', 0, 18000, 0, 100),
  ('FIC20404', 0, 300, 0, 100),
  ('FIC30102', 0, 70000, 0, 80),
  ('FIC30201', 0, 1500, 0, 100),
  ('FIC30202', 0, 800, 0, 100),
  ('FIC30203', 0, 600, 0, 100),
  ('FIC30303', 0, 3000, 0, 100),
  ('FIC30501', 0, 36, 5, 100),
  ('FIC30502', 0, 14, 0, 100),
  ('FIC30603', 0, 2200, 0, 100),
  ('FIC30701', 0, 500, 0, 100),
  ('FIC50201', 0, 50, 0, 100),
  ('FIC60210', 0, 80, 0, 100),
  ('FIC80103', 0, 400, 0, 100),
  ('FIC80104', 0, 400, 0, 100),
  ('FQIC10103', 0, 16000, 0, 100),
  ('FQIC10104', 0, 2000, 0, 100),
  ('FQIC10304', 0, 200, 0, 100),
  ('FQIC40302', 0, 2000, 0, 100),
  ('FQIC50102C', 0, 400, 0, 40),
  ('IIC20101A', 0, 50, 0, 63),
  ('IIC20101B', 0, 50, 0, 65),
  ('IIC20101C', 0, 50, 0, 58),
  ('LIC10401', 0, 100, 5, 100),
  ('LIC10404', 0, 100, 0, 100),
  ('LIC10501', 0, 100, 11, 100),
  ('LIC10601', 0, 100, 0, 300),
  ('LIC10704', 0, 100, 0, 100),
  ('LIC10719', 0, 100, 0, 100),
  ('LIC20202', 0, 100, 0, 70),
  ('LIC20401', 0, 100, 0, 60),
  ('LIC20402', 0, 100, 0, 33),
  ('LIC20541', 0, 100, 0, 100),
  ('LIC20601', 0, 100, 0, 22),
  ('LIC20602', 0, 100, 0, 100),
  ('LIC30101', 0, 100, 0, 10),
  ('LIC30102', 0, 100, 0, 100),
  ('LIC30103', 0, 100, 0, 77),
  ('LIC30104', 0, 100, 0, 100),
  ('LIC30206', 0, 100, 0, 100),
  ('LIC30302', 0, 100, 0, 100),
  ('LIC30307', 0, 100, 0, 100),
  ('LIC30310', 0, 100, 1, 100),
  ('LIC30320', 0, 100, 0, 100),
  ('LIC30501', 0, 100, 0, 25),
  ('LIC30601', 0, 100, 0, 100),
  ('LIC30608', 0, 100, 0, 100),
  ('LIC50303', 0, 100, 0, 100),
  ('LIC80101', 0, 100, 0, 50),
  ('LIC80102', 0, 100, 0, 100),
  ('NIC51101', 0, 252, 0, 100),
  ('PDIC10407', 0, 25, 0, 100),
  ('PDIC10418', 0, 100, 25, 100),
  ('PIC00521', 0, 6, 0, 100),
  ('PIC00551', 0, 6, 0, 20),
  ('PIC00605', 0, 25, 0, 80),
  ('PIC00609', 0, 25, 0, 100),
  ('PIC00610', 0, 25, 0, 100),
  ('PIC00620', 0, 40, 0, 100),
  ('PIC10101', 0, 10, 0, 50),
  ('PIC10104', 0, 10, 0, 100),
  ('PIC10116', 0, 25, 0, 100),
  ('PIC10201A', 0, 2.5, 0, 100),
  ('PIC10201B', 0, 2.5, 0, 100),
  ('PIC10201C', 0, 2.5, 0, 100),
  ('PIC10320', 0, 4, 0, 100),
  ('PIC10323', 0, 4, 0, 100),
  ('PIC10411', 0, 26, 0, 140),
  ('PIC10412', 0, 26, 0, 100),
  ('PIC10413', 0, 26, 0, 100),
  ('PIC10511', 0, 26, 0, 140),
  ('PIC10512', 0, 26, 0, 100),
  ('PIC10513', 0, 26, 0, 100),
  ('PIC10603', 0, 6, 0, 100),
  ('PIC10703', 0, 4, 0, 100),
  ('PIC10704', 0, 2.5, 0, 100),
  ('PIC20120', 0, 200, 0, 100),
  ('PIC20203', 0, 25, 0, 100),
  ('PIC20204', 0, 2, 0, 100),
  ('PIC20317', 0, 200, 0, 32),
  ('PIC20406', 0, 160, 0, 100),
  ('PIC20501', -20, 80, 0, 100),
  ('PIC20603', 0, 1.60000002384186, 0, 100),
  ('PIC30102', 0, 10, 0, 100),
  ('PIC30104', 0, 10, 0, 100),
  ('PIC30108', 0, 1.60000002384186, 0, 100),
  ('PIC30204', -100, 300, 0, 100),
  ('PIC30305', 0, 10, 0, 100),
  ('PIC30306', 0, 10, 0, 100),
  ('PIC30307', 0, 10, 0, 100),
  ('PIC30322', -1, 6, 0, 100),
  ('PIC30323', 0, 6, 0, 100),
  ('PIC30325', 0, 6, 0, 100),
  ('PIC30601', 0, 500, 0, 100),
  ('PIC30611', 0, 600, 0, 100),
  ('PIC40101', -20, 80, 0, 100),
  ('PIC40102', -20, 80, 0, 100),
  ('PIC40108', 0, 4, 0, 100),
  ('PIC40201', 0, 1.60000002384186, 0, 100),
  ('PIC40202', 0, 1.60000002384186, 0, 100),
  ('PIC50206', -100, 200, 0, 100),
  ('PIC50216', -100, 200, 0, 100),
  ('PIC51208', 0, 100, 0, 100),
  ('PIC80103', 0, 100, 0, 100),
  ('PIC80105', 0, 10, 0, 100),
  ('PIC80140', 0, 100, 0, 100),
  ('PIC80141', 0, 60, 0, 100),
  ('PIC80142', 0, 10, 0, 100),
  ('PIC80143', 0, 25, 0, 100),
  ('PIC80150', 0, 1, 0, 100),
  ('TIC00705', 0, 300, 0, 100),
  ('TIC10101', 0, 160, 0, 124),
  ('TIC10102', 0, 140, 0, 65),
  ('TIC10403', 0, 200, 0, 100),
  ('TIC10503', 0, 200, 3, 100),
  ('TIC10603', 0, 200, 0, 100),
  ('TIC10608', 0, 100, 0, 100),
  ('TIC10704', 0, 100, 3, 5),
  ('TIC20305', 0, 160, 0, 65),
  ('TIC20405', -40, 60, 0, 50),
  ('TIC20601', -40, 60, 0, 40),
  ('TIC20607', -40, 60, 0, 10),
  ('TIC30104', 0, 200, 15, 100),
  ('TIC30107', 0, 200, 0, 100),
  ('TIC30109', 0, 200, 10, 100),
  ('TIC30110', 0, 160, 20, 85),
  ('TIC30206OLD', 0, 400, 0, 35),
  ('TIC30304', 0, 200, 100, 155),
  ('TIC30306', 0, 200, 0, 100),
  ('TIC30309', 0, 300, 0, 100),
  ('TIC30320', 0, 100, 0, 100),
  ('TIC30325', -20, 80, 0, 100),
  ('TIC30401', 0, 100, 0, 100),
  ('TIC30501', -40, 60, 0, 20),
  ('TIC30502', -20, 60, 0, 100),
  ('TIC30603', 0, 100, 25, 50),
  ('TIC30604', 0, 100, 0, 100),
  ('TIC31001', 0, 100, 0, 100),
  ('TIC31002', 0, 100, 0, 100),
  ('TIC31003', 0, 100, 0, 100),
  ('TIC50302', 0, 100, 0, 100),
  ('TIC51402', 0, 100, 0, 100),
  ('TIC51406', 0, 300, 0, 100),
  ('TIC80104', 0, 300, 10, 100),
  ('TIC80105', 0, 200, 30, 100),
  ('TIC80150', 0, 200, 0, 100);

DO $$
DECLARE
    v_skipped text; v_n_skipped int;
    v_diff    text; v_n_diff    int;
    v_tight int; v_loose int; v_same int;
    v_review text; v_n_op int;
BEGIN
    -- 1. workbook rows with no registered loop -> SKIPPED
    SELECT count(*), string_agg(i.loop_id, ', ' ORDER BY i.loop_id)
      INTO v_n_skipped, v_skipped
      FROM cpm_eng_import i
      LEFT JOIN cpm.loop_registry r ON r.loop_id = i.loop_id
     WHERE r.loop_id IS NULL;
    IF v_n_skipped > 0 THEN
        RAISE NOTICE '1. SKIPPED - no such loop (%): %', v_n_skipped, v_skipped;
    ELSE
        RAISE NOTICE '1. SKIPPED - none, every workbook row matched a loop.';
    END IF;

    -- 2. loops already carrying a DIFFERENT value (this script overwrites them)
    SELECT count(*), string_agg(r.loop_id, ', ' ORDER BY r.loop_id)
      INTO v_n_diff, v_diff
      FROM cpm_eng_import i
      JOIN cpm.loop_registry r ON r.loop_id = i.loop_id
     WHERE COALESCE(r.engineering, '{}'::jsonb) <> '{}'::jsonb
       AND NOT (COALESCE(r.engineering, '{}'::jsonb) @> jsonb_build_object(
                 'pvMin', i.pv_min, 'pvMax', i.pv_max,
                 'opMin', i.op_min, 'opMax', i.op_max));
    IF v_n_diff > 0 THEN
        RAISE NOTICE '2. OVERWRITING a different stored range on % loop(s): %',
                     v_n_diff, v_diff;
    ELSE
        RAISE NOTICE '2. No loop carries a conflicting range.';
    END IF;

    -- 3. G3 band impact vs today's flat 0.5 EU
    SELECT count(*) FILTER (WHERE 0.005 * (i.pv_max - i.pv_min) < 0.5),
           count(*) FILTER (WHERE 0.005 * (i.pv_max - i.pv_min) > 0.5),
           count(*) FILTER (WHERE 0.005 * (i.pv_max - i.pv_min) = 0.5)
      INTO v_tight, v_loose, v_same
      FROM cpm_eng_import i JOIN cpm.loop_registry r ON r.loop_id = i.loop_id;
    RAISE NOTICE '3. G3 band vs 0.5 EU today -> tighter: %, looser: %, unchanged: %',
                 v_tight, v_loose, v_same;
    RAISE NOTICE '   The tighter ones can move G3 PASS -> WARN. Expected, not a fault.';

    -- 4. OP ranges where normalisation becomes active, and the risky ones
    SELECT count(*) INTO v_n_op
      FROM cpm_eng_import i JOIN cpm.loop_registry r ON r.loop_id = i.loop_id
     WHERE NOT (i.op_min = 0 AND i.op_max = 100);
    SELECT string_agg(i.loop_id || ' (' || i.op_min || '..' || i.op_max || ')',
                      ', ' ORDER BY i.loop_id)
      INTO v_review
      FROM cpm_eng_import i JOIN cpm.loop_registry r ON r.loop_id = i.loop_id
     WHERE (i.op_max - i.op_min) < 10 OR i.op_min > 50;
    RAISE NOTICE '4. % loop(s) have a non 0-100 OP range - normalisation becomes active.',
                 v_n_op;
    IF v_review IS NOT NULL THEN
        RAISE WARNING '   VERIFY AGAINST THE DCS BEFORE COMMITTING: %', v_review;
        RAISE WARNING '   normalizeOp is unconditional. If the OP signal really arrives as';
        RAISE WARNING '   0-100 pct, a narrow or offset range explodes it (3..5 with op 50';
        RAISE WARNING '   -> 2350 pct), G10 reads permanently saturated, G2r invalidates the';
        RAISE WARNING '   window, and the diagnosis is BLOCKED. Wrong is worse than absent.';
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- APPLY. Merge the four keys, preserve anything else already stored.
-- The IS DISTINCT FROM guard keeps updated_at honest on a re-run.
-- ---------------------------------------------------------------------
WITH merged AS (
    SELECT r.loop_id,
           COALESCE(r.engineering, '{}'::jsonb)
             || jsonb_build_object('pvMin', i.pv_min, 'pvMax', i.pv_max,
                                   'opMin', i.op_min, 'opMax', i.op_max) AS eng
    FROM   cpm_eng_import i
    JOIN   cpm.loop_registry r ON r.loop_id = i.loop_id
)
UPDATE cpm.loop_registry r
SET    engineering = m.eng,
       updated_at  = NOW()
FROM   merged m
WHERE  r.loop_id = m.loop_id
  AND  COALESCE(r.engineering, '{}'::jsonb) IS DISTINCT FROM m.eng;

DO $$
DECLARE v_bad int; v_ok int;
BEGIN
    SELECT count(*) INTO v_bad FROM cpm_eng_import i
      JOIN cpm.loop_registry r ON r.loop_id = i.loop_id
     WHERE NOT (r.engineering @> jsonb_build_object(
             'pvMin', i.pv_min, 'pvMax', i.pv_max,
             'opMin', i.op_min, 'opMax', i.op_max));
    IF v_bad > 0 THEN
        RAISE EXCEPTION '5. % loop(s) did not take the range - rolling back.', v_bad;
    END IF;
    SELECT count(*) INTO v_ok FROM cpm_eng_import i
      JOIN cpm.loop_registry r ON r.loop_id = i.loop_id;
    RAISE NOTICE '5. Applied. All % matched loop(s) carry the four bounds.', v_ok;
END $$;

DROP TABLE cpm_eng_import;

-- Change to ROLLBACK for a dry run.
COMMIT;

-- ---------------------------------------------------------------------
-- Verification grid (pgAdmin shows this one).
-- ---------------------------------------------------------------------
SELECT count(*)                                       AS registered_loops,
       count(*) FILTER (WHERE engineering ? 'pvMin')  AS with_pv_range,
       count(*) FILTER (WHERE engineering ? 'opMin')  AS with_op_range,
       count(*) FILTER (WHERE COALESCE(engineering, '{}'::jsonb) = '{}'::jsonb)
                                                      AS still_undeclared
FROM   cpm.loop_registry;

-- =====================================================================
-- REQUIRED FOLLOW-UP - this UPDATE does not reach the engine.
--
-- Flink reads the ranges from the compacted cplm.loop.engineering broadcast on
-- traverse.cpa.ams.metadata.updates. cplm-api publishes it on activate and on
-- republish-evidence; nothing re-reads this table. Skip this and every loop
-- keeps opEng 0-100 and a 0.5 EU band - the load looks like a no-op.
--
--   for each loop:  POST /api/v1/cpm/loops/{loopId}/republish-evidence
--
-- Confirm ONE loop end-to-end before trusting the fleet - pick one from report 4
-- so both halves are visible:
--   1. the broadcast carries it (topic traverse.cpa.ams.metadata.updates):
--      expect  "name":"cplm.loop.engineering","value":"{...pvEngMin...pvEngMax...}"
--   2. good_error_pct on that loop moves within one 1m window
--      (topic traverse.cpa.clpm.feature.short.v1)
--
-- Cancelling and resubmitting the CPLM Flink jobs is NOT required - this is data,
-- not code. The broadcast topic is compacted and read from earliest.
-- =====================================================================
