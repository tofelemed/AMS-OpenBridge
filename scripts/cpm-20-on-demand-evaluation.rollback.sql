-- ═══════════════════════════════════════════════════════════════════════════
-- cpm-20-on-demand-evaluation.rollback.sql — undoes scripts/cpm-20-on-demand-evaluation.sql (CHG-102 Phase 5c). ONLINE.
-- Roll the cplm-api image back FIRST (the new one would otherwise keep writing EVALUATE runs). Every EVALUATE run and
-- the gate rows it wrote are deleted; its evidence manifests are STANDARD and age out by retention (3 d).
--   docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < ops/cpm-20-on-demand-evaluation.rollback.sql
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

SET lock_timeout = '10s';
BEGIN;
DELETE FROM analytics.cplm_gate_results g
    USING analytics.analysis_run r
    WHERE g.analysis_run_id = r.analysis_run_id AND r.purpose = 'EVALUATE';
DELETE FROM analytics.analysis_run WHERE purpose = 'EVALUATE';
DROP INDEX IF EXISTS analytics.ix_analysis_run_evaluate_window;
DROP INDEX IF EXISTS analytics.ix_analysis_run_evaluate_open;
ALTER TABLE analytics.analysis_run DROP CONSTRAINT IF EXISTS analysis_run_purpose_check;
ALTER TABLE analytics.analysis_run ADD CONSTRAINT analysis_run_purpose_check
    CHECK (purpose IN ('REPLAY', 'SHADOW', 'EVIDENCE_RECONSTRUCTION'));
COMMIT;
RESET lock_timeout;
