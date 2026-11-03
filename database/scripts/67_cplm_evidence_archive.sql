-- CHG-102 Phase 5b-1: the evidence BOUNDARY ARCHIVE (lossless). analytics.evidence_archive (one packed row per loop per
-- 12 h / 24 h boundary evidence set, daily partitions on window_end created / dropped by cplm-api EvidenceArchiver), its
-- lookup analytics.evidence_archive_run, retention_policy.max_bytes + row EVIDENCE_ARCHIVE = 30 days / 12 GiB, and the
-- partial boundary-manifest index. Plain partitioned tables on the lab too (no hypertable). Additive, re-runnable, online.
-- Mirrors: scripts/cpm-19-evidence-archive.sql (live plant), migration/schema/03-traverse_cplm.sql (fresh plant).
\c traverse_cplm

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
