-- ═══════════════════════════════════════════════════════════════════════════
-- 62_cplm_episode_debounce.sql — CHG-034: a different fault family must hold for
-- Cplm:FamilyChangeWindows consecutive windows before an episode changes hands.
-- Plant copy: scripts/cpm-11-episode-debounce.sql. Fresh installs: migration/schema/03-traverse_cplm.sql.
-- cplm-api self-heals the two columns (CplmEventFrameService.EnsureSchemaAsync).
-- ═══════════════════════════════════════════════════════════════════════════
\c traverse_cplm

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
    'CHG-034: a fault family seen instead of this episode''s, not yet settled; takes over after Cplm:FamilyChangeWindows consecutive windows.';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ams_user') THEN
        GRANT ALL ON ALL TABLES IN SCHEMA analytics TO ams_user;
    END IF;
END $$;
