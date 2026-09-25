-- ═══════════════════════════════════════════════════════════════════════════
-- 60_cplm_event_shelving.sql — CHG-032: episode shelving as its own lifecycle
-- (ISA-18.2 §12 shelving, orthogonal to acknowledgement) plus the per-episode
-- operator action history.
--
-- Before this script a shelf was stored by OVERWRITING ack_state with 'SHELVED',
-- so shelving forgot whether the episode had been reviewed, nothing ever ended a
-- shelf except acknowledging it, an expired shelf stayed 'SHELVED' for ever, and
-- who shelved / why lived only on the Kafka audit trail.
--
-- Now:
--   shelf_state   NONE | SHELVED | EXPIRED   — SHELVED flips to EXPIRED by the
--                 cplm-api sweeper (CplmShelfExpirySweeper, once a minute) when
--                 shelve_until passes; EXPIRED is "returned from the shelf, not
--                 yet reviewed" and is cleared by acknowledge, unshelve or re-shelve.
--   shelved_by / shelved_at / shelve_until / shelve_reason — the shelf's own record.
--   ack_state     UNACKNOWLEDGED | ACKNOWLEDGED — 'SHELVED' is no longer written
--                 (the CHECK still admits it so nothing breaks mid-rollout).
--   analytics.cplm_event_actions — every operator action on an episode, in order.
--
-- Mirrors: src/services/cplm-api/BackgroundServices/CplmEventFrameService.cs (self-heal
-- DDL), migration/schema/03-traverse_cplm.sql (fresh plant installs),
-- scripts/cpm-09-event-shelving.sql (plant live upgrade, run before the cplm-api swap).
--
-- Idempotent: IF NOT EXISTS throughout; the data conversion only touches rows
-- still carrying the legacy ack_state = 'SHELVED'.
-- ═══════════════════════════════════════════════════════════════════════════

\c traverse_cplm

-- ── 1. The shelf's own columns ───────────────────────────────────────────────
ALTER TABLE analytics.cplm_event_frames
    ADD COLUMN IF NOT EXISTS shelf_state   VARCHAR(16) NOT NULL DEFAULT 'NONE',
    ADD COLUMN IF NOT EXISTS shelved_by    VARCHAR(128),
    ADD COLUMN IF NOT EXISTS shelved_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS shelve_reason TEXT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_cplm_event_frames_shelf_state') THEN
        ALTER TABLE analytics.cplm_event_frames
            ADD CONSTRAINT ck_cplm_event_frames_shelf_state
            CHECK (shelf_state IN ('NONE', 'SHELVED', 'EXPIRED'));
    END IF;
END $$;

-- The sweep scans only live shelves; keep the index partial so it stays tiny.
CREATE INDEX IF NOT EXISTS idx_cplm_event_frames_shelved
    ON analytics.cplm_event_frames (shelve_until)
    WHERE shelf_state = 'SHELVED';

COMMENT ON COLUMN analytics.cplm_event_frames.shelf_state IS
    'CHG-032: NONE | SHELVED | EXPIRED. Independent of ack_state: an acknowledged episode can be shelved; an unshelved one keeps its ack.';
COMMENT ON COLUMN analytics.cplm_event_frames.shelve_reason IS
    'CHG-032: why the episode was shelved (required by the API); note stays the acknowledgement note.';

-- ── 2. Operator action history ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics.cplm_event_actions (
    id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id  BIGINT      NOT NULL REFERENCES analytics.cplm_event_frames (id) ON DELETE CASCADE,
    action    VARCHAR(24) NOT NULL
              CHECK (action IN ('ACKNOWLEDGED', 'SHELVED', 'SHELVE_UPDATED', 'UNSHELVED', 'SHELVE_EXPIRED')),
    actor     VARCHAR(128) NOT NULL,
    at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    until     TIMESTAMPTZ,
    reason    TEXT
);
CREATE INDEX IF NOT EXISTS idx_cplm_event_actions_event
    ON analytics.cplm_event_actions (event_id, at DESC);
COMMENT ON TABLE analytics.cplm_event_actions IS
    'CHG-032: every operator (or sweeper) action on an episode, oldest first by at. Operator input: not rebuildable.';

-- ── 3. Convert legacy shelves (ack_state = 'SHELVED') ────────────────────────
-- The old shelve wrote the shelver into acked_by / acked_at and the reason into
-- note. Move those to the shelf's columns, record the SHELVED action, and leave
-- the episode UNACKNOWLEDGED: a shelf never meant "reviewed".
INSERT INTO analytics.cplm_event_actions (event_id, action, actor, at, until, reason)
SELECT id, 'SHELVED', COALESCE(acked_by, 'unknown'), COALESCE(acked_at, updated_at), shelve_until, note
FROM analytics.cplm_event_frames
WHERE ack_state = 'SHELVED';

UPDATE analytics.cplm_event_frames
SET shelf_state   = CASE WHEN shelve_until IS NOT NULL AND shelve_until > NOW() THEN 'SHELVED' ELSE 'EXPIRED' END,
    shelved_by    = acked_by,
    shelved_at    = acked_at,
    shelve_reason = note,
    note          = NULL,
    ack_state     = 'UNACKNOWLEDGED',
    acked_by      = NULL,
    acked_at      = NULL,
    updated_at    = NOW()
WHERE ack_state = 'SHELVED';

-- Past acknowledgements get their history row once (re-runs find it present).
INSERT INTO analytics.cplm_event_actions (event_id, action, actor, at, reason)
SELECT f.id, 'ACKNOWLEDGED', COALESCE(f.acked_by, 'unknown'), COALESCE(f.acked_at, f.updated_at), f.note
FROM analytics.cplm_event_frames f
WHERE f.ack_state = 'ACKNOWLEDGED'
  AND NOT EXISTS (SELECT 1 FROM analytics.cplm_event_actions a WHERE a.event_id = f.id AND a.action = 'ACKNOWLEDGED');
