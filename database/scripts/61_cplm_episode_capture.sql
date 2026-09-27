-- ═══════════════════════════════════════════════════════════════════════════
-- 61_cplm_episode_capture.sql — CHG-033: evidence bounded by class.
--
-- Before this script every live artifact was a STANDARD manifest kept for retention_policy
-- days, i.e. every window of every loop (at Marun ~1.4 GB/h). Now the evidence consumer
-- writes live artifacts as TRANSIENT (hours + a byte budget, cplm-api config) and an episode
-- transition — OPEN, ESCALATE (severity band rose), CLOSE — records the fused verdict's method
-- runs here; the sweeper promotes their manifests to EPISODE, kept retention_policy.EPISODE
-- days after the episode closed and never while it is open.
--
-- Plant copy: scripts/cpm-10a-episode-evidence.sql (no \c). Fresh installs:
-- migration/schema/03-traverse_cplm.sql. cplm-api self-heals the DDL (not the policy row).
-- ═══════════════════════════════════════════════════════════════════════════
\c traverse_cplm

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
