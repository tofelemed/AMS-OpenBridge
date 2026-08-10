-- ═══════════════════════════════════════════════════════════════════════════
-- 39_timescale_policies.sql — Plan 05 item 1 (DATA-02)
--
-- REAL hypertables + compression + retention. Until this script, the stack ran
-- the TimescaleDB image but no table was actually a hypertable: the EF
-- hypertable migration is pre-marked as applied by 03_apply_ef_migrations.sql
-- (deliberately — THIS script is the authoritative implementation now), so
-- nothing was ever chunked, compressed, or expired. Alarm history grew forever.
--
-- Conversion facts this script relies on (verified against the live schema):
--   • alarms.alarm_history            PK (id)               → widened to (id, event_time)
--   • alarms.historical_alarms        PK (id, "timestamp")  → already composite, untouched
--   • alarms.alarm_state_transitions  PK (id, transition_time) → already composite, untouched
--   • analytics.cplm_*_results        PK (id) → (id, window_end); the writers upsert
--     ON CONFLICT (loop_id, window_kind, window_end, source), whose unique index
--     already contains the partition column — upserts keep working unchanged.
--   • AppendHistoryAsync / the COPY bulk path are plain inserts (no ON CONFLICT (id)),
--     so widening those PKs breaks nothing.
--
-- DELIBERATE EXCLUSIONS
--   • analytics.cplm_event_frames — a LIFECYCLE table (rows are UPDATEd on close and
--     deduped through a partial unique index without a time column). Not append-only,
--     not hypertable material. Bounded by its nature (~one row per open excursion).
--   • audit.immutable_events — HASH-CHAINED (each row carries prev_hash; the verifier
--     walks the chain). A retention policy would delete chain links and break
--     verification, so it gets NO Timescale policies until a compliance-approved
--     archival design exists (Plan 09). It is also created by the audit-service at
--     startup, not by these scripts.
--
-- RETENTION values below are the plan defaults (alarm history: 2 years per the
-- remediation plan). Confirm with compliance/audit owners before go-live; adjust with
-- remove_retention_policy()/add_retention_policy() at any time.
--
-- Idempotent: safe to re-run (if_not_exists everywhere; PK widening is guarded).
-- Existing data is carried into chunks with migrate_data => TRUE.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- ams — alarm time series
-- ─────────────────────────────────────────────────────────────────────────────
\c ams

-- alarm_history: PK (id) must include the partition column before conversion.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint c
        WHERE c.conname = 'alarm_history_pkey'
          AND c.conrelid = 'alarms.alarm_history'::regclass
          AND array_length(c.conkey, 1) = 1
    ) THEN
        ALTER TABLE alarms.alarm_history DROP CONSTRAINT alarm_history_pkey;
        ALTER TABLE alarms.alarm_history ADD CONSTRAINT alarm_history_pkey
            PRIMARY KEY (id, event_time);
    END IF;
END $$;

SELECT create_hypertable('alarms.alarm_history', 'event_time',
       chunk_time_interval => INTERVAL '1 day',
       if_not_exists => TRUE, migrate_data => TRUE);
ALTER TABLE alarms.alarm_history SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'source',
    timescaledb.compress_orderby   = 'event_time DESC');
SELECT add_compression_policy('alarms.alarm_history', INTERVAL '7 days', if_not_exists => TRUE);
SELECT add_retention_policy  ('alarms.alarm_history', INTERVAL '730 days', if_not_exists => TRUE);

-- historical_alarms (bulk COPY path): PK is already (id, "timestamp").
SELECT create_hypertable('alarms.historical_alarms', 'timestamp',
       chunk_time_interval => INTERVAL '1 day',
       if_not_exists => TRUE, migrate_data => TRUE);
ALTER TABLE alarms.historical_alarms SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'source_name',
    timescaledb.compress_orderby   = '"timestamp" DESC');
SELECT add_compression_policy('alarms.historical_alarms', INTERVAL '7 days', if_not_exists => TRUE);
SELECT add_retention_policy  ('alarms.historical_alarms', INTERVAL '730 days', if_not_exists => TRUE);

-- alarm_state_transitions: PK is already (id, transition_time).
SELECT create_hypertable('alarms.alarm_state_transitions', 'transition_time',
       chunk_time_interval => INTERVAL '1 day',
       if_not_exists => TRUE, migrate_data => TRUE);
ALTER TABLE alarms.alarm_state_transitions SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'alarm_id',
    timescaledb.compress_orderby   = 'transition_time DESC');
SELECT add_compression_policy('alarms.alarm_state_transitions', INTERVAL '7 days', if_not_exists => TRUE);
SELECT add_retention_policy  ('alarms.alarm_state_transitions', INTERVAL '730 days', if_not_exists => TRUE);

-- ─────────────────────────────────────────────────────────────────────────────
-- traverse_analysis — calculation execution log
-- ─────────────────────────────────────────────────────────────────────────────
\c traverse_analysis

CREATE EXTENSION IF NOT EXISTS timescaledb;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint c
        WHERE c.conname = 'analysis_executions_pkey'
          AND c.conrelid = 'analysis.analysis_executions'::regclass
          AND array_length(c.conkey, 1) = 1
    ) THEN
        ALTER TABLE analysis.analysis_executions DROP CONSTRAINT analysis_executions_pkey;
        ALTER TABLE analysis.analysis_executions ADD CONSTRAINT analysis_executions_pkey
            PRIMARY KEY (id, started_at);
    END IF;
END $$;

SELECT create_hypertable('analysis.analysis_executions', 'started_at',
       chunk_time_interval => INTERVAL '7 days',
       if_not_exists => TRUE, migrate_data => TRUE);
ALTER TABLE analysis.analysis_executions SET (
    timescaledb.compress,
    timescaledb.compress_orderby = 'started_at DESC');
SELECT add_compression_policy('analysis.analysis_executions', INTERVAL '30 days', if_not_exists => TRUE);
SELECT add_retention_policy  ('analysis.analysis_executions', INTERVAL '180 days', if_not_exists => TRUE);

-- ─────────────────────────────────────────────────────────────────────────────
-- traverse_cplm — loop-performance result series (the fastest-growing tables)
-- ─────────────────────────────────────────────────────────────────────────────
\c traverse_cplm

CREATE EXTENSION IF NOT EXISTS timescaledb;

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['cplm_short_feature_results','cplm_long_feature_results','cplm_gate_results']
    LOOP
        IF EXISTS (
            SELECT 1 FROM pg_constraint c
            WHERE c.conname = t || '_pkey'
              AND c.conrelid = ('analytics.' || t)::regclass
              AND array_length(c.conkey, 1) = 1
        ) THEN
            EXECUTE format('ALTER TABLE analytics.%I DROP CONSTRAINT %I', t, t || '_pkey');
            EXECUTE format('ALTER TABLE analytics.%I ADD CONSTRAINT %I PRIMARY KEY (id, window_end)', t, t || '_pkey');
        END IF;
    END LOOP;
END $$;

SELECT create_hypertable('analytics.cplm_short_feature_results', 'window_end',
       chunk_time_interval => INTERVAL '7 days',
       if_not_exists => TRUE, migrate_data => TRUE);
ALTER TABLE analytics.cplm_short_feature_results SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'loop_id',
    timescaledb.compress_orderby   = 'window_end DESC');
SELECT add_compression_policy('analytics.cplm_short_feature_results', INTERVAL '30 days', if_not_exists => TRUE);
SELECT add_retention_policy  ('analytics.cplm_short_feature_results', INTERVAL '365 days', if_not_exists => TRUE);

SELECT create_hypertable('analytics.cplm_long_feature_results', 'window_end',
       chunk_time_interval => INTERVAL '7 days',
       if_not_exists => TRUE, migrate_data => TRUE);
ALTER TABLE analytics.cplm_long_feature_results SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'loop_id',
    timescaledb.compress_orderby   = 'window_end DESC');
SELECT add_compression_policy('analytics.cplm_long_feature_results', INTERVAL '30 days', if_not_exists => TRUE);
SELECT add_retention_policy  ('analytics.cplm_long_feature_results', INTERVAL '730 days', if_not_exists => TRUE);

SELECT create_hypertable('analytics.cplm_gate_results', 'window_end',
       chunk_time_interval => INTERVAL '7 days',
       if_not_exists => TRUE, migrate_data => TRUE);
ALTER TABLE analytics.cplm_gate_results SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'loop_id',
    timescaledb.compress_orderby   = 'window_end DESC');
SELECT add_compression_policy('analytics.cplm_gate_results', INTERVAL '30 days', if_not_exists => TRUE);
SELECT add_retention_policy  ('analytics.cplm_gate_results', INTERVAL '730 days', if_not_exists => TRUE);
