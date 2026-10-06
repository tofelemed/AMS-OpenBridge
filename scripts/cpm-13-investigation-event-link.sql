-- ═══════════════════════════════════════════════════════════════════════════
-- cpm-13-investigation-event-link.sql — PLANT live upgrade for CHG-058 (loop notes linkable to an episode).
--
-- Run on the plant VM BEFORE the cplm-api image swap (additive; re-runnable; one nullable column + one index):
--   docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < ops/cpm-13-investigation-event-link.sql
--   bash migration/02-apply-schemas.sh      # ownership -> ams_user
--
-- This is database/scripts/63_cplm_investigation_event_link.sql minus the connect line.
-- ═══════════════════════════════════════════════════════════════════════════


ALTER TABLE analytics.investigation_reference
    ADD COLUMN IF NOT EXISTS event_id BIGINT NULL REFERENCES analytics.cplm_event_frames (id) ON DELETE SET NULL;
COMMENT ON COLUMN analytics.investigation_reference.event_id IS
    'CHG-058: the diagnosis episode this loop note is about, linked at creation or later; NULL = a note on the loop only.';
CREATE INDEX IF NOT EXISTS ix_investigation_reference_event ON analytics.investigation_reference (event_id) WHERE event_id IS NOT NULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ams_user') THEN
        GRANT ALL ON ALL TABLES IN SCHEMA analytics TO ams_user;
    END IF;
END $$;
