-- ============================================================================
-- 30_cplm_analytics_schema.sql — CPLM result tables (Phase 3, intake decision N-A)
--
-- Persists the three CPLM Kafka result streams:
--   clpm.gate.results.v1    -> analytics.cplm_gate_results
--   clpm.feature.short.v1   -> analytics.cplm_short_feature_results
--   clpm.feature.long.v1    -> analytics.cplm_long_feature_results
--
-- Ported from CPA (15_cplm_gate_results.sql + 21_clpm_feature_results.sql) with
-- deliberate changes:
--   * clpm_ table prefix normalized to cplm_ everywhere (decision N-A; the
--     Kafka topic names keep clpm. — that is a wire contract, not a table name)
--   * UNIQUE (loop_id, window_kind, window_end, source) so replays/redeliveries
--     upsert instead of appending duplicates (CPA was append-only; its _latest
--     views only masked the duplicates)
--   * _latest views are DISTINCT ON (loop_id, window_kind) — CPA's gate view
--     was DISTINCT ON (loop_id) only, which dropped loops whose newest row was
--     a different window kind when callers filtered by window_kind afterwards
--   * (loop_id, window_kind, window_end DESC) indexes: the hot read shapes
--     filter/order by window_end, not created_at
--   * lower(loop_id) functional indexes: readiness checks probe case-insensitively
--
-- NOTE: this file only runs on a FRESH postgres volume (docker-entrypoint-initdb.d).
-- The consumer (CplmResultConsumerService) applies the same DDL idempotently on
-- startup — the self-healing pattern — so existing volumes converge too.
-- ============================================================================

-- CPLM extraction Phase 1: this schema lives in traverse_cplm (created by 29_traverse_cplm_db.sql), not ams.
\c traverse_cplm

CREATE SCHEMA IF NOT EXISTS analytics;

-- ── Gate results (fused diagnosis per loop per window) ──────────────────────
CREATE TABLE IF NOT EXISTS analytics.cplm_gate_results (
    id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    loop_id                     VARCHAR(256) NOT NULL,
    window_kind                 VARCHAR(16)  NOT NULL DEFAULT '24h',
    window_start                TIMESTAMPTZ,
    window_end                  TIMESTAMPTZ,
    sample_count                INT,
    mae                         DOUBLE PRECISION,
    rmse                        DOUBLE PRECISION,
    iae                         DOUBLE PRECISION,
    good_error_pct              DOUBLE PRECISION,
    acf_period_s                DOUBLE PRECISION,
    acf_regularity              DOUBLE PRECISION,
    effort_ratio                DOUBLE PRECISION,
    triangularity               DOUBLE PRECISION,
    horch_oddness               DOUBLE PRECISION,
    phase_area_norm_per_cycle   DOUBLE PRECISION,
    corner_score                DOUBLE PRECISION,
    travel_per_day              DOUBLE PRECISION,
    reversals_per_hour          DOUBLE PRECISION,
    harmonic_amplitude_ratio    DOUBLE PRECISION,
    harmonic_energy_ratio       DOUBLE PRECISION,
    diagnosis                   VARCHAR(128),
    severity                    VARCHAR(32),
    confidence                  DOUBLE PRECISION,
    -- Full raw Kafka message. The 17 gate statuses (gates{}, gate0..gate15,
    -- G2r), calculationVersion, dynamicsProfileVersion, observability flags
    -- etc. live ONLY here; the gate-matrix UI reconstructs from this column.
    payload                     JSONB NOT NULL DEFAULT '{}'::jsonb,
    source                      VARCHAR(32) NOT NULL DEFAULT 'flink',
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotency: one row per (loop, window kind, window end, source); replays
-- update in place. Rows with NULL window_end (degenerate) still append —
-- Postgres treats NULLs as distinct — which is acceptable.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cplm_gate_results_window
    ON analytics.cplm_gate_results (loop_id, window_kind, window_end, source);
CREATE INDEX IF NOT EXISTS idx_cplm_gate_results_loop_time
    ON analytics.cplm_gate_results (loop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cplm_gate_results_loop_kind_end
    ON analytics.cplm_gate_results (loop_id, window_kind, window_end DESC);
CREATE INDEX IF NOT EXISTS idx_cplm_gate_results_loop_lower
    ON analytics.cplm_gate_results (lower(loop_id));

-- "Latest" prefers a real verdict over degenerate trailing windows
-- (INSUFFICIENT_DATA rows emitted past the data end), then the newest window —
-- NOT created_at, which during a replay/reprocess points at whatever window was
-- most recently rewritten rather than the newest one.
CREATE OR REPLACE VIEW analytics.cplm_gate_latest AS
SELECT DISTINCT ON (loop_id, window_kind) *
FROM analytics.cplm_gate_results
ORDER BY loop_id, window_kind,
         (diagnosis IS NOT NULL AND diagnosis <> 'INSUFFICIENT_DATA') DESC,
         window_end DESC NULLS LAST,
         created_at DESC;

-- ── Short features (G0–G4 per short window) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics.cplm_short_feature_results (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    loop_id             VARCHAR(256) NOT NULL,
    window_kind         VARCHAR(16)  NOT NULL,
    window_start        TIMESTAMPTZ,
    window_end          TIMESTAMPTZ,
    sample_count        INT,
    iae                 DOUBLE PRECISION,
    ise                 DOUBLE PRECISION,
    mae                 DOUBLE PRECISION,
    rmse                DOUBLE PRECISION,
    good_error_pct      DOUBLE PRECISION,
    effort_ratio        DOUBLE PRECISION,
    travel_per_day      DOUBLE PRECISION,
    reversals_per_hour  DOUBLE PRECISION,
    auto_pct            DOUBLE PRECISION,
    completeness        DOUBLE PRECISION,
    payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
    source              VARCHAR(32) NOT NULL DEFAULT 'flink',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cplm_short_window
    ON analytics.cplm_short_feature_results (loop_id, window_kind, window_end, source);
CREATE INDEX IF NOT EXISTS idx_cplm_short_loop_kind_time
    ON analytics.cplm_short_feature_results (loop_id, window_kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cplm_short_loop_kind_end
    ON analytics.cplm_short_feature_results (loop_id, window_kind, window_end DESC);
CREATE INDEX IF NOT EXISTS idx_cplm_short_loop_lower
    ON analytics.cplm_short_feature_results (lower(loop_id));

-- Completeness-first tiebreak is load-bearing (kept verbatim from CPA):
-- trailing partial windows fired by watermark advance carry all-zero metrics
-- and would otherwise mask real values in "latest" tiles.
-- Recency = window_end, NOT created_at (audit.md B-4, same bug class as the
-- P1-3 gate-view fix): a replay REWRITING an old window bumps created_at, and
-- with the old ordering that historical window became "latest".
CREATE OR REPLACE VIEW analytics.cplm_short_feature_latest AS
SELECT DISTINCT ON (loop_id, window_kind) *
FROM analytics.cplm_short_feature_results
ORDER BY loop_id, window_kind,
         (COALESCE(completeness, 0) >= 0.95 AND COALESCE(sample_count, 0) >= 10) DESC,
         window_end DESC NULLS LAST;

-- ── Long diagnostics (G5–G11 per 4h/12h/24h slice) ──────────────────────────
CREATE TABLE IF NOT EXISTS analytics.cplm_long_feature_results (
    id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    loop_id                     VARCHAR(256) NOT NULL,
    window_kind                 VARCHAR(16)  NOT NULL,
    window_start                TIMESTAMPTZ,
    window_end                  TIMESTAMPTZ,
    sample_count                INT,
    acf_period_s                DOUBLE PRECISION,
    acf_regularity              DOUBLE PRECISION,
    effort_ratio                DOUBLE PRECISION,
    triangularity               DOUBLE PRECISION,
    horch_oddness               DOUBLE PRECISION,
    corner_score                DOUBLE PRECISION,
    travel_per_day              DOUBLE PRECISION,
    reversals_per_hour          DOUBLE PRECISION,
    harmonic_amplitude_ratio    DOUBLE PRECISION,
    harmonic_energy_ratio       DOUBLE PRECISION,
    payload                     JSONB NOT NULL DEFAULT '{}'::jsonb,
    source                      VARCHAR(32) NOT NULL DEFAULT 'flink',
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cplm_long_window
    ON analytics.cplm_long_feature_results (loop_id, window_kind, window_end, source);
CREATE INDEX IF NOT EXISTS idx_cplm_long_loop_kind_time
    ON analytics.cplm_long_feature_results (loop_id, window_kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cplm_long_loop_kind_end
    ON analytics.cplm_long_feature_results (loop_id, window_kind, window_end DESC);
CREATE INDEX IF NOT EXISTS idx_cplm_long_loop_lower
    ON analytics.cplm_long_feature_results (lower(loop_id));

-- Recency = window_end, NOT created_at (audit.md B-4 — see the short view).
CREATE OR REPLACE VIEW analytics.cplm_long_feature_latest AS
SELECT DISTINCT ON (loop_id, window_kind) *
FROM analytics.cplm_long_feature_results
ORDER BY loop_id, window_kind, window_end DESC NULLS LAST;
