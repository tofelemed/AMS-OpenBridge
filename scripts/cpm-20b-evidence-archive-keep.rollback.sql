-- ═══════════════════════════════════════════════════════════════════════════
-- cpm-20b-evidence-archive-keep.rollback.sql — undoes scripts/cpm-20b-evidence-archive-keep.sql (CHG-102 Phase 5c). ONLINE.
-- The kept sets are LOST (the day partitions they came from were dropped); their run rows go too. cplm-api falls back
-- to the cpm-19 behaviour (a pinned day kept whole, episodes keep nothing).
--   docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < ops/cpm-20b-evidence-archive-keep.rollback.sql
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

SET lock_timeout = '10s';
DO $$
BEGIN
    IF to_regclass('analytics.evidence_archive_run') IS NOT NULL
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'analytics' AND table_name = 'evidence_archive_run' AND column_name = 'kept') THEN
        DELETE FROM analytics.evidence_archive_run WHERE kept;
        ALTER TABLE analytics.evidence_archive_run DROP COLUMN kept;
    END IF;
END $$;
DROP TABLE IF EXISTS analytics.evidence_archive_kept;
DELETE FROM analytics.retention_policy WHERE record_class = 'EVIDENCE_ARCHIVE_EPISODE';
RESET lock_timeout;
