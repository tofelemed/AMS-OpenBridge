-- ═══════════════════════════════════════════════════════════════════════════
-- cpm-11-episode-debounce.sql — PLANT live upgrade for CHG-034 (family-change debounce).
--
-- Run on the Marun VM BEFORE the cplm-api image swap (additive; re-runnable; two metadata-only columns):
--   docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < ops/cpm-11-episode-debounce.sql
--   bash migration/02-apply-schemas.sh      # ownership -> ams_user
--
-- This is database/scripts/62_cplm_episode_debounce.sql minus the connect line.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── CHG-034: a different fault family is a candidate until it has held ───────
-- Marun 2026-10-02: fused verdicts flipped fault family between consecutive 15-min windows on many
-- loops (580 episodes opened / 481 closed a day, 348 closes FAMILY_CHANGED, 413 episodes under an
-- hour), and every flip captured ~95 evidence artifacts. The lifecycle now keeps the episode open
-- under its family and counts the other family; after Cplm:FamilyChangeWindows (3) consecutive
-- windows the episode closes FAMILY_CHANGED and the new one opens, as before.
ALTER TABLE analytics.cplm_event_frames
    ADD COLUMN IF NOT EXISTS candidate_family  VARCHAR(64),
    ADD COLUMN IF NOT EXISTS candidate_windows INT NOT NULL DEFAULT 0;
COMMENT ON COLUMN analytics.cplm_event_frames.candidate_family IS
    'CHG-034: a fault family seen instead of this episode''s, not yet settled; takes over after Cplm:FamilyChangeWindows consecutive fault windows (unjudged windows neither count nor reset).';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ams_user') THEN
        GRANT ALL ON ALL TABLES IN SCHEMA analytics TO ams_user;
    END IF;
END $$;
