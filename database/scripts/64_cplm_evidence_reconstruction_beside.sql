-- SME review 2 #18 (CHG-099): an evidence reconstruction is stored BESIDE the evidence it rebuilds, never over it
-- (reverses CHG-076's in-place replace). A rebuilt artifact whose original is still held gets its own row:
--   reconstruction_of = the original evidence id, analysis_run_id = the operator's reconstruction run.
-- Every reconstruction row is stored beside (also when the original is EXPIRED / FAILED / never kept): the run's own
-- set only ever holds the live engine's bytes. analysis_run_id with reconstruction_of NULL marks a pre-CHG-099 (CHG-076) row
-- rebuilt in place.
-- Space: cplm-api keeps only the newest reconstruction per original and never stores identical bytes twice;
-- reconstructions are STANDARD (retention_policy days). Additive, re-runnable, online (two nullable columns, one
-- partial index). Mirrors: migration/schema/03-traverse_cplm.sql (fresh plant), scripts/cpm-15-evidence-reconstruction-beside.sql (live plant).
\c traverse_cplm

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
