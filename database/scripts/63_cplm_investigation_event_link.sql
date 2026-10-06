-- SME review #22 (CHG-058): a loop note (analytics.investigation_reference, v2.5 2D.2) can be linked to a
-- diagnosis episode — at creation or later — instead of notes existing only as the acknowledgement comment
-- of an open episode. Nullable: a note on a loop with no episode (insufficient evidence, nothing open) is
-- the point. ON DELETE SET NULL: an episode removed by retention leaves the note on the loop.
-- Additive, re-runnable, online (adds one nullable column + one index).
-- Mirrors: migration/schema/03-traverse_cplm.sql (fresh plant), scripts/cpm-12-investigation-event-link.sql (live plant).
\c traverse_cplm

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
