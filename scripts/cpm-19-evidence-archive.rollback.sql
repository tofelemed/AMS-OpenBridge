-- ═══════════════════════════════════════════════════════════════════════════
-- cpm-19-evidence-archive.rollback.sql — undoes scripts/cpm-19-evidence-archive.sql (CHG-102 Phase 5b-1). ONLINE.
-- Every archived boundary set is LOST (the live TRANSIENT rows they were copied from are long gone). Either cplm-api
-- image keeps working: the new one logs "apply cpm-19" and archives nothing; the workbench serves live evidence only.
--   docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < ops/cpm-19-evidence-archive.rollback.sql
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

SET lock_timeout = '10s';
DROP TABLE IF EXISTS analytics.evidence_archive;          -- its day partitions go with it
DROP TABLE IF EXISTS analytics.evidence_archive_run;
DROP INDEX IF EXISTS analytics.ix_evidence_manifest_boundary_set;
DELETE FROM analytics.retention_policy WHERE record_class = 'EVIDENCE_ARCHIVE';
ALTER TABLE analytics.retention_policy DROP COLUMN IF EXISTS max_bytes;
RESET lock_timeout;
