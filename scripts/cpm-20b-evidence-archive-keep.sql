-- ═══════════════════════════════════════════════════════════════════════════
-- cpm-20b-evidence-archive-keep.sql — PLANT live upgrade for CHG-102 Phase 5c: episodes and pins keep ARCHIVED SETS,
-- not whole archive days.
-- Before (cpm-19): a day partition of analytics.evidence_archive holding one pinned set was kept whole (every loop of
-- that day), and an episode kept nothing. Now cplm-api, just before it drops a day partition (by age or by bytes),
-- moves only the sets that must outlive it into analytics.evidence_archive_kept:
--   * PINNED  - evidence an investigation pins; kept until unpinned;
--   * EPISODE - the loop had an episode overlapping the set's window that is still open or closed less than
--               retention_policy EVIDENCE_ARCHIVE_EPISODE days (30) ago; the episode-kept packs are capped at its
--               max_bytes (4 GiB), oldest first. Episodes reference the boundary sets - no extra copies are written.
-- The run row of a kept set stays (evidence_archive_run.kept = true), so the workbench still opens it by method run.
--
-- RUN ONLINE (no stop), BEFORE the cplm-api image swap (release step PRE_SWAP, after cpm-19 / cpm-20). Without it the
-- new image keeps the cpm-19 behaviour (a pinned day kept whole; episodes keep nothing). The old image ignores it.
--   docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < ops/cpm-20b-evidence-archive-keep.sql
-- Idempotent; the retention row is DO NOTHING (an operator's own values are kept). Needs cpm-19.
-- Rollback (online): ops/cpm-20b-evidence-archive-keep.rollback.sql - the KEPT sets are LOST (their days were dropped).
-- ═══════════════════════════════════════════════════════════════════════════

SET lock_timeout = '10s';

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

RESET lock_timeout;
