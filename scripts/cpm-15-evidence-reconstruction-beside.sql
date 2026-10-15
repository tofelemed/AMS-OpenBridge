-- ═══════════════════════════════════════════════════════════════════════════
-- cpm-15-evidence-reconstruction-beside.sql — PLANT live upgrade for CHG-099 (SME review 2 #18: a reconstruction is
-- stored beside the original evidence, never over it).
--
-- Run on the plant VM BEFORE the cplm-api image swap (additive; re-runnable; two nullable columns + one partial index):
--   docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < ops/cpm-15-evidence-reconstruction-beside.sql
--   bash migration/02-apply-schemas.sh      # ownership -> ams_user
-- The new cplm-api image REQUIRES these columns (its evidence writes and reads name them).
--
-- This is database/scripts/64_cplm_evidence_reconstruction_beside.sql minus the connect line.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE analytics.evidence_manifest
    ADD COLUMN IF NOT EXISTS reconstruction_of UUID NULL,
    ADD COLUMN IF NOT EXISTS analysis_run_id UUID NULL;
COMMENT ON COLUMN analytics.evidence_manifest.reconstruction_of IS
    'CHG-099: the original evidence id this row reconstructs (stored beside it); NULL = an original (or a revived lost original).';
COMMENT ON COLUMN analytics.evidence_manifest.analysis_run_id IS
    'CHG-099: the EVIDENCE_RECONSTRUCTION analysis run that produced these bytes; NULL = produced by the live engine.';
CREATE INDEX IF NOT EXISTS ix_evidence_manifest_reconstruction_of
    ON analytics.evidence_manifest (reconstruction_of) WHERE reconstruction_of IS NOT NULL;
-- every evidence read lists the reconstruction runs of its method run
CREATE INDEX IF NOT EXISTS ix_analysis_run_reconstructs
    ON analytics.analysis_run ((manifest->>'reconstructs')) WHERE purpose = 'EVIDENCE_RECONSTRUCTION';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ams_user') THEN
        GRANT ALL ON ALL TABLES IN SCHEMA analytics TO ams_user;
    END IF;
END $$;
