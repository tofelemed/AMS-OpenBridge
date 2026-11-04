-- CHG-102 Phase 5c: episodes and pins keep archived SETS past their day partition (analytics.evidence_archive_kept,
-- evidence_archive_run.kept, retention_policy EVIDENCE_ARCHIVE_EPISODE = 30 days after close / 4 GiB). Additive,
-- re-runnable, online. Needs 67_. Mirrors: scripts/cpm-20b-evidence-archive-keep.sql (live plant),
-- migration/schema/03-traverse_cplm.sql (fresh plant).
\c traverse_cplm

ALTER TABLE analytics.evidence_archive_run ADD COLUMN IF NOT EXISTS kept boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN analytics.evidence_archive_run.kept IS
    'CHG-102 Phase 5c: the set outlived its day partition - its pack was moved to analytics.evidence_archive_kept (pinned, or overlapping an episode). The row stays until the keep is released.';

CREATE TABLE IF NOT EXISTS analytics.evidence_archive_kept (
    boundary_set_id uuid         PRIMARY KEY,
    window_end      timestamptz  NOT NULL,
    loop_id         varchar(256) NOT NULL,
    window_kind     varchar(16)  NOT NULL,
    codec           varchar(16)  NOT NULL,
    artifact_count  int          NOT NULL,
    payload_bytes   int          NOT NULL,
    payload_sha256  text         NOT NULL,
    payload         bytea        NOT NULL,
    created_at      timestamptz  NOT NULL,
    kept_reason     varchar(16)  NOT NULL CHECK (kept_reason IN ('PINNED', 'EPISODE')),
    kept_at         timestamptz  NOT NULL DEFAULT now()
);
ALTER TABLE analytics.evidence_archive_kept ALTER COLUMN payload SET STORAGE EXTERNAL;
CREATE INDEX IF NOT EXISTS ix_evidence_archive_kept_end ON analytics.evidence_archive_kept (window_end);
COMMENT ON TABLE analytics.evidence_archive_kept IS
    'CHG-102 Phase 5c: archived boundary sets kept past their day partition - pinned by an investigation (until unpinned) or overlapping an episode (open, or closed less than retention_policy EVIDENCE_ARCHIVE_EPISODE days ago; those rows are capped by its max_bytes, oldest first). Same columns as analytics.evidence_archive; moved there by cplm-api just before the partition is dropped.';

-- days after the episode closes (NULL = while the episode row exists, 0 = episodes keep nothing); max_bytes caps the episode-kept packs
INSERT INTO analytics.retention_policy (record_class, days, max_bytes) VALUES ('EVIDENCE_ARCHIVE_EPISODE', 30, 4294967296)
    ON CONFLICT (record_class) DO NOTHING;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ams_user') THEN
        ALTER TABLE analytics.evidence_archive_kept OWNER TO ams_user;
        GRANT ALL ON analytics.evidence_archive_kept TO ams_user;
    END IF;
END $$;
