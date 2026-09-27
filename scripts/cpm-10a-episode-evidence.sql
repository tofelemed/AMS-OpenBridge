-- ═══════════════════════════════════════════════════════════════════════════
-- cpm-10a-episode-evidence.sql — PLANT live upgrade for CHG-033 (evidence bounded by class).
--
-- Run on the Marun VM BEFORE the cplm-api image swap (additive; re-runnable; online: one
-- metadata-only ADD COLUMN, one small table, two indexes, one policy row):
--   docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < ops/cpm-10a-episode-evidence.sql
--   bash migration/02-apply-schemas.sh      # ownership -> ams_user (the go-live 42501 trap)
--
-- This is database/scripts/61_cplm_episode_capture.sql minus the \c header.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. How many automatic captures the episode has taken ─────────────────────
ALTER TABLE analytics.cplm_event_frames
    ADD COLUMN IF NOT EXISTS capture_count INT NOT NULL DEFAULT 0;
COMMENT ON COLUMN analytics.cplm_event_frames.capture_count IS
    'CHG-033: automatic evidence captures taken for this episode. OPEN and ESCALATE count against Cplm:EpisodeCaptureMax (3); CLOSE always captures.';

-- ── 2. The capture ledger: which method runs a transition selected ───────────
CREATE TABLE IF NOT EXISTS analytics.cplm_episode_capture (
    episode_id    BIGINT      NOT NULL REFERENCES analytics.cplm_event_frames (id) ON DELETE CASCADE,
    method_run_id UUID        NOT NULL,
    kind          VARCHAR(16) NOT NULL CHECK (kind IN ('OPEN', 'ESCALATE', 'CLOSE')),
    captured_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (episode_id, method_run_id)
);
COMMENT ON TABLE analytics.cplm_episode_capture IS
    'CHG-033: the method runs an episode transition (OPEN / ESCALATE / CLOSE) selected for retention. Written in the frame transaction; the evidence sweeper promotes matching TRANSIENT manifests to EPISODE (late arrivals included) and expires EPISODE manifests only after the frame closed.';
CREATE INDEX IF NOT EXISTS ix_cplm_episode_capture_run ON analytics.cplm_episode_capture (method_run_id);
CREATE INDEX IF NOT EXISTS ix_cplm_episode_capture_at  ON analytics.cplm_episode_capture (captured_at);

-- ── 3. The EPISODE record class (days after the linked episode CLOSED) ────────
INSERT INTO analytics.retention_policy (record_class, days) VALUES ('EPISODE', 90)
ON CONFLICT (record_class) DO NOTHING;
COMMENT ON TABLE analytics.retention_policy IS
    'Evidence retention by record class (days; NULL = never). STANDARD: reconstructions. EPISODE: captured at an episode transition, counted from the episode close. PINNED: never. TRANSIENT (every live artifact) is bounded by cplm-api Cplm:EvidenceTransientHours / Cplm:EvidenceTransientBudgetBytes, not by a row here. SHORT_FEATURES / LONG_FEATURES / GATE_RESULTS: result-table partition retention (cpm-10b).';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ams_user') THEN
        GRANT ALL ON ALL TABLES IN SCHEMA analytics TO ams_user;
    END IF;
END $$;
