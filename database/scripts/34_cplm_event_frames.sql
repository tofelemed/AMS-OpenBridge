-- ═══════════════════════════════════════════════════════════════════════════
-- 34_cplm_event_frames.sql — CPLM event frames (Phase 5 A12, decision A-A)
--
-- A frame is "loop X had diagnosis Y from time A to time B". CPLM owns this
-- store rather than delegating to the Traverse alarm tables, because that path
-- HARD-DELETES a row when the condition clears: a stiction diagnosis that
-- opened Tuesday and closed Thursday would leave no record at all, which
-- destroys the entire point of an event frame.
--
-- Frames are derived from analytics.cplm_gate_results, so they can always be
-- rebuilt; ack/shelve state is operator input and is the one thing that cannot.
-- ═══════════════════════════════════════════════════════════════════════════

-- CPLM extraction Phase 1: this schema lives in traverse_cplm (created by 29_traverse_cplm_db.sql), not ams.
\c traverse_cplm

CREATE SCHEMA IF NOT EXISTS analytics;

CREATE TABLE IF NOT EXISTS analytics.cplm_event_frames (
    id                       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    loop_id                  VARCHAR(256) NOT NULL,
    window_kind              VARCHAR(16)  NOT NULL,
    -- The fault family, not the banded verdict: DETECTED/SUSPECTED/CONFIRMED of
    -- the same family is one continuing frame whose confidence changed, not
    -- three separate events.
    family                   VARCHAR(64)  NOT NULL,
    opened_at                TIMESTAMPTZ  NOT NULL,
    closed_at                TIMESTAMPTZ,
    -- Strongest verdict seen while the frame was open; an operator cares that it
    -- reached CONFIRMED at some point, not what it happened to be at closure.
    peak_diagnosis           VARCHAR(128) NOT NULL,
    peak_confidence          DOUBLE PRECISION NOT NULL DEFAULT 0,
    last_diagnosis           VARCHAR(128),
    last_confidence          DOUBLE PRECISION,
    severity                 VARCHAR(32),
    window_count             INT NOT NULL DEFAULT 1,
    -- Operator state. Deliberately nullable: a frame with no ack is unhandled,
    -- which is different from acked-by-nobody.
    ack_state                VARCHAR(24) NOT NULL DEFAULT 'UNACKNOWLEDGED'
                             CHECK (ack_state IN ('UNACKNOWLEDGED','ACKNOWLEDGED','SHELVED')),
    acked_by                 VARCHAR(128),
    acked_at                 TIMESTAMPTZ,
    shelve_until             TIMESTAMPTZ,
    note                     TEXT,
    -- Provenance: which formula version produced this verdict. Without it a
    -- historical frame cannot be defended after an engine change.
    calculation_version      VARCHAR(32),
    dynamics_profile_version VARCHAR(32),
    mirrored_alarm_id        VARCHAR(128),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One OPEN frame per (loop, resolution, family). Postgres treats NULLs as
-- distinct, so this partial unique index is what makes "open frame" a real
-- constraint rather than a convention.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cplm_event_frames_open
    ON analytics.cplm_event_frames (loop_id, window_kind, family)
    WHERE closed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cplm_event_frames_loop_time
    ON analytics.cplm_event_frames (loop_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_cplm_event_frames_open
    ON analytics.cplm_event_frames (closed_at, ack_state) WHERE closed_at IS NULL;

COMMENT ON TABLE analytics.cplm_event_frames IS
    'Durable CPLM diagnosis episodes. Derived from cplm_gate_results and rebuildable; '
    'ack/shelve state is operator input and is not.';
