-- ═══════════════════════════════════════════════════════════════════════════
-- cpm-19-evidence-archive.sql — PLANT live upgrade for CHG-102 Phase 5b-1: the evidence BOUNDARY ARCHIVE (lossless).
-- The live evidence path (TRANSIENT, 6 h / 2 GiB) is unchanged. The Flink long + fusion jobs now always emit the
-- evidence of the 12 h / 24 h windows that end on a plant-time boundary (provenance emission_reason = BOUNDARY, one
-- boundary_set_id per loop / kind / window end). cplm-api's EvidenceArchiver copies each such set, 15 min after its
-- window end, into ONE packed row before the TRANSIENT sweep deletes it:
--   * analytics.evidence_archive (new): RANGE-partitioned by DAY on window_end (UTC); one row per boundary set =
--     every complete artifact's manifest (Brotli JSON index) + its original chunk bytes, verbatim (pack codec cpax1).
--     Lossless: the served chunks and the SHA-256 are the originals; the frontend decoder does not change.
--     Partitions evidence_archive_pYYYYMMDD are created ahead by cplm-api (no DEFAULT partition).
--   * analytics.evidence_archive_run (new): the lookup - one row per archived set (loop, kind, window, plant zone,
--     artifact / missing counts, bytes, per-artifact SHA-256, evidence ids and method run ids, GIN-indexed so the
--     workbench still opens evidence by method run id or evidence id once the live rows are gone).
--   * retention_policy gains a nullable max_bytes column; row EVIDENCE_ARCHIVE = 30 days, 12 GiB. cplm-api drops whole
--     day partitions older than days, then the oldest ones while the archive is over max_bytes; a partition holding
--     evidence an investigation pins is never dropped. NULL days = keep forever, NULL max_bytes = no cap.
--   * a partial index on evidence_manifest (provenance->>'boundary_set_id') for the boundary manifests only (none exist
--     before the new Flink jar, so it stays tiny; its build reads the table once - seconds, evidence inserts wait).
--
-- RUN ONLINE (no stop), BEFORE the cplm-api image swap (release step PRE_SWAP 4g), so the new image archives from its
-- first pass. The old cplm-api ignores the tables (its evidence sweeper reads EVIDENCE_ARCHIVE as an evidence class no
-- manifest carries - a no-op). Applied after the swap instead, the new image logs "apply cpm-19" and archives nothing
-- until it is applied (the boundary sets age out as TRANSIENT, as today):
--   docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < ops/cpm-19-evidence-archive.sql
-- Idempotent: IF NOT EXISTS everywhere, the retention row is DO NOTHING (an operator's own values are kept). If the
-- lock_timeout below fires (a long evidence read held the table), re-run the file.
-- Ownership: the tables go to ams_user (as 02-apply-schemas.sh normalises).
--
-- Rollback (online): ops/cpm-19-evidence-archive.rollback.sql (drops both tables, every partition, the index, the row
-- and the column; the archived sets are LOST). Either cplm-api keeps working: the new one logs "apply cpm-19".
-- ═══════════════════════════════════════════════════════════════════════════

SET lock_timeout = '10s';

ALTER TABLE analytics.retention_policy ADD COLUMN IF NOT EXISTS max_bytes bigint;
COMMENT ON COLUMN analytics.retention_policy.max_bytes IS
    'CHG-102: byte cap of a class kept by partition DROP; when the class is larger, its oldest partitions go first. EVIDENCE_ARCHIVE = 12 GiB. NULL = no cap.';

CREATE TABLE IF NOT EXISTS analytics.evidence_archive (
    boundary_set_id uuid         NOT NULL,
    window_end      timestamptz  NOT NULL,
    loop_id         varchar(256) NOT NULL,
    window_kind     varchar(16)  NOT NULL,
    codec           varchar(16)  NOT NULL DEFAULT 'cpax1',
    artifact_count  int          NOT NULL,
    payload_bytes   int          NOT NULL,
    payload_sha256  text         NOT NULL,
    payload         bytea        NOT NULL,
    created_at      timestamptz  NOT NULL DEFAULT now(),
    PRIMARY KEY (boundary_set_id, window_end)
) PARTITION BY RANGE (window_end);
-- the pack is already compressed: no TOAST compression attempt (cplm-api repeats this on every partition it creates)
ALTER TABLE analytics.evidence_archive ALTER COLUMN payload SET STORAGE EXTERNAL;
COMMENT ON TABLE analytics.evidence_archive IS
    'CHG-102 Phase 5b-1: one packed, lossless row per loop per 12 h / 24 h boundary evidence set (codec cpax1: Brotli JSON index of the manifests + the original chunk bytes). Daily partitions evidence_archive_pYYYYMMDD on window_end (UTC), created and dropped by cplm-api EvidenceArchiver (retention_policy EVIDENCE_ARCHIVE days + max_bytes; pinned partitions kept).';

CREATE TABLE IF NOT EXISTS analytics.evidence_archive_run (
    boundary_set_id    uuid         PRIMARY KEY,
    loop_id            varchar(256) NOT NULL,
    window_kind        varchar(16)  NOT NULL,
    window_start       timestamptz,
    window_end         timestamptz  NOT NULL,
    partition_day      date         NOT NULL,
    plant_tz           text,
    boundary_kind      varchar(16),
    boundary_local_end text,
    artifact_count     int          NOT NULL,
    missing_count      int          NOT NULL DEFAULT 0,
    payload_bytes      bigint       NOT NULL DEFAULT 0,
    source_bytes       bigint       NOT NULL DEFAULT 0,
    evidence_ids       uuid[]       NOT NULL DEFAULT '{}',
    method_run_ids     uuid[]       NOT NULL DEFAULT '{}',
    artifact_sha256    text[]       NOT NULL DEFAULT '{}',
    archived_at        timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON TABLE analytics.evidence_archive_run IS
    'CHG-102 Phase 5b-1: one row per archived boundary set (lookup for analytics.evidence_archive). evidence_ids / method_run_ids / artifact_sha256 are in pack order; missing_count = manifests of the set that were not COMPLETE (or failed their checksum) at archive time; source_bytes = the live chunk bytes packed. Rows go with their partition_day partition.';
CREATE INDEX IF NOT EXISTS ix_evidence_archive_run_loop ON analytics.evidence_archive_run (loop_id, window_end DESC);
CREATE INDEX IF NOT EXISTS ix_evidence_archive_run_day ON analytics.evidence_archive_run (partition_day);
CREATE INDEX IF NOT EXISTS ix_evidence_archive_run_method_runs ON analytics.evidence_archive_run USING gin (method_run_ids);
CREATE INDEX IF NOT EXISTS ix_evidence_archive_run_evidence ON analytics.evidence_archive_run USING gin (evidence_ids);

-- the archiver's side: the boundary manifests only (a partial index; empty until the new Flink jar emits boundaries)
CREATE INDEX IF NOT EXISTS ix_evidence_manifest_boundary_set
    ON analytics.evidence_manifest ((provenance->>'boundary_set_id'))
    WHERE provenance->>'emission_reason' = 'BOUNDARY';

INSERT INTO analytics.retention_policy (record_class, days, max_bytes) VALUES ('EVIDENCE_ARCHIVE', 30, 12884901888)
    ON CONFLICT (record_class) DO NOTHING;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ams_user') THEN
        ALTER TABLE analytics.evidence_archive OWNER TO ams_user;
        ALTER TABLE analytics.evidence_archive_run OWNER TO ams_user;
        GRANT ALL ON analytics.evidence_archive, analytics.evidence_archive_run TO ams_user;
    END IF;
END $$;

RESET lock_timeout;
