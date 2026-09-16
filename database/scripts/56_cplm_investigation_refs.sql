-- v2.5 Task 2D.2 (spec v6 §3.4, R24; NR-062): an investigation is a first-class, pinned reference to
-- evidence with an EXPLICIT outcome. "Work completed" is not "performance restored": the outcome is
-- WORK_COMPLETED | PERFORMANCE_RESTORED | INCONCLUSIVE, default INCONCLUSIVE, set by a person. The
-- referenced evidence manifests are pinned so the retention sweeper (1G.5) never expires them.
-- Replaces the note-on-acknowledge convention of the event frames.
-- Mirrors: migration/schema/03-traverse_cplm.sql (fresh plant), scripts/cpm-07-v25-schema.sql (live plant, additive).
\c traverse_cplm

CREATE TABLE IF NOT EXISTS analytics.investigation_reference (
    ref_id         uuid PRIMARY KEY,
    loop_id        VARCHAR(256) NOT NULL,
    method_run_id  uuid,
    evidence_ids   uuid[] NOT NULL DEFAULT '{}',
    note           text NOT NULL DEFAULT '',
    outcome        text NOT NULL DEFAULT 'INCONCLUSIVE'
                   CHECK (outcome IN ('WORK_COMPLETED', 'PERFORMANCE_RESTORED', 'INCONCLUSIVE')),
    created_by     text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_by     text,
    updated_at     timestamptz NOT NULL DEFAULT now(),
    pinned         boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS ix_investigation_reference_loop ON analytics.investigation_reference (lower(loop_id), created_at DESC);
CREATE INDEX IF NOT EXISTS ix_investigation_reference_run ON analytics.investigation_reference (method_run_id);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ams_user') THEN
        GRANT ALL ON ALL TABLES IN SCHEMA analytics TO ams_user;
    END IF;
END $$;
