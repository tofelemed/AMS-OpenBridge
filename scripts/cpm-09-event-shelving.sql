-- ═══════════════════════════════════════════════════════════════════════════
-- cpm-09-event-shelving.sql — PLANT live upgrade for CHG-032 (episode shelving lifecycle).
--
-- Run on the Marun VM BEFORE the cplm-api image swap (additive; re-runnable; metadata-only
-- ADD COLUMN, one small table, a partial index, and a data conversion that touches only rows
-- still carrying the legacy ack_state = 'SHELVED'):
--   docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < ops/cpm-09-event-shelving.sql
--
-- This is database/scripts/60_cplm_event_shelving.sql minus the \c header.
-- ═══════════════════════════════════════════════════════════════════════════

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
