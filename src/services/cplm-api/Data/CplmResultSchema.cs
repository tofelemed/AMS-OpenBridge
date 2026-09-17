namespace Traverse.CplmApi.Data;

/// <summary>
/// The result consumer's self-heal DDL for the three CPLM result tables (mirror of
/// database/scripts/30_cplm_analytics_schema.sql + 52 + 53_cplm_v25: identity columns and the
/// bundle-aware unique key). Runs at cplm-api startup before consuming, so a fresh lab volume
/// and an upgraded plant converge on the same shape. New v2.5 tables (analysis_run, evidence,
/// condition_event) are NOT self-healed here: they ship as ops SQL applied before the swap.
/// </summary>
public static class CplmResultSchema
{
    public static readonly string Ddl = """
            CREATE SCHEMA IF NOT EXISTS analytics;
            CREATE TABLE IF NOT EXISTS analytics.cplm_gate_results (
                id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                loop_id VARCHAR(256) NOT NULL,
                window_kind VARCHAR(16) NOT NULL DEFAULT '24h',
                window_start TIMESTAMPTZ, window_end TIMESTAMPTZ, sample_count INT,
                mae DOUBLE PRECISION, rmse DOUBLE PRECISION, iae DOUBLE PRECISION,
                good_error_pct DOUBLE PRECISION, acf_period_s DOUBLE PRECISION,
                acf_regularity DOUBLE PRECISION, effort_ratio DOUBLE PRECISION,
                triangularity DOUBLE PRECISION, horch_oddness DOUBLE PRECISION,
                phase_area_norm_per_cycle DOUBLE PRECISION, corner_score DOUBLE PRECISION,
                travel_per_day DOUBLE PRECISION, reversals_per_hour DOUBLE PRECISION,
                harmonic_amplitude_ratio DOUBLE PRECISION, harmonic_energy_ratio DOUBLE PRECISION,
                diagnosis VARCHAR(128), severity VARCHAR(32), confidence DOUBLE PRECISION,
                payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                source VARCHAR(32) NOT NULL DEFAULT 'flink',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
            ALTER TABLE analytics.cplm_gate_results
                ADD COLUMN IF NOT EXISTS method_run_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
                ADD COLUMN IF NOT EXISTS bundle_hash TEXT NOT NULL DEFAULT 'legacy',
                ADD COLUMN IF NOT EXISTS context_revision INT NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS result_revision INT NOT NULL DEFAULT 1,
                ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'LIVE',
                ADD COLUMN IF NOT EXISTS analysis_run_id UUID,
                ADD COLUMN IF NOT EXISTS source_commit TEXT,
                ADD COLUMN IF NOT EXISTS jar_sha256 TEXT,
                ADD COLUMN IF NOT EXISTS dataset_hash TEXT;
            -- v2.5 (1G.1, spec §1.6): the unique key includes bundle_hash (53_cplm_v25 parity).
            CREATE UNIQUE INDEX IF NOT EXISTS uq_cplm_gate_results_window_bundle
                ON analytics.cplm_gate_results (loop_id, window_kind, window_end, source, bundle_hash);
            DROP INDEX IF EXISTS analytics.uq_cplm_gate_results_window;
            CREATE INDEX IF NOT EXISTS ix_cplm_gate_results_method_run_ids
                ON analytics.cplm_gate_results USING gin (method_run_ids);
            CREATE INDEX IF NOT EXISTS idx_cplm_gate_results_loop_time
                ON analytics.cplm_gate_results (loop_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_cplm_gate_results_loop_kind_end
                ON analytics.cplm_gate_results (loop_id, window_kind, window_end DESC);
            CREATE INDEX IF NOT EXISTS idx_cplm_gate_results_loop_lower
                ON analytics.cplm_gate_results (lower(loop_id));
            """
            // CHG-023: the two fleet "latest verdict" probe indexes come from the one
            // definition the read path is written against, so they cannot drift from it.
            + Traverse.CplmApi.Data.CplmReadIndexes.CreateAll + """
            -- P1-3: window_end must outrank "has a real diagnosis". Previously a
            -- historical-replay row with a verdict outranked EVERY live row forever,
            -- so the loop's "latest" 24h state was a week-old batch result while a
            -- current row sat in the same table. Recency first, then prefer a real
            -- verdict over INSUFFICIENT_DATA within the same window.
            DROP VIEW IF EXISTS analytics.cplm_gate_latest;
            CREATE VIEW analytics.cplm_gate_latest AS
                SELECT DISTINCT ON (loop_id, window_kind) * FROM analytics.cplm_gate_results
                ORDER BY loop_id, window_kind,
                         window_end DESC NULLS LAST,
                         (diagnosis IS NOT NULL AND diagnosis <> 'INSUFFICIENT_DATA') DESC,
                         created_at DESC;

            CREATE TABLE IF NOT EXISTS analytics.cplm_short_feature_results (
                id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                loop_id VARCHAR(256) NOT NULL, window_kind VARCHAR(16) NOT NULL,
                window_start TIMESTAMPTZ, window_end TIMESTAMPTZ, sample_count INT,
                iae DOUBLE PRECISION, ise DOUBLE PRECISION, mae DOUBLE PRECISION,
                rmse DOUBLE PRECISION, good_error_pct DOUBLE PRECISION,
                effort_ratio DOUBLE PRECISION, travel_per_day DOUBLE PRECISION,
                reversals_per_hour DOUBLE PRECISION, auto_pct DOUBLE PRECISION,
                completeness DOUBLE PRECISION,
                payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                source VARCHAR(32) NOT NULL DEFAULT 'flink',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
            ALTER TABLE analytics.cplm_short_feature_results
                ADD COLUMN IF NOT EXISTS method_run_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
                ADD COLUMN IF NOT EXISTS bundle_hash TEXT NOT NULL DEFAULT 'legacy',
                ADD COLUMN IF NOT EXISTS context_revision INT NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS result_revision INT NOT NULL DEFAULT 1,
                ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'LIVE',
                ADD COLUMN IF NOT EXISTS analysis_run_id UUID,
                ADD COLUMN IF NOT EXISTS source_commit TEXT,
                ADD COLUMN IF NOT EXISTS jar_sha256 TEXT,
                ADD COLUMN IF NOT EXISTS dataset_hash TEXT;
            CREATE UNIQUE INDEX IF NOT EXISTS uq_cplm_short_window_bundle
                ON analytics.cplm_short_feature_results (loop_id, window_kind, window_end, source, bundle_hash);
            DROP INDEX IF EXISTS analytics.uq_cplm_short_window;
            CREATE INDEX IF NOT EXISTS ix_cplm_short_feature_results_method_run_ids
                ON analytics.cplm_short_feature_results USING gin (method_run_ids);
            CREATE INDEX IF NOT EXISTS idx_cplm_short_loop_kind_time
                ON analytics.cplm_short_feature_results (loop_id, window_kind, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_cplm_short_loop_kind_end
                ON analytics.cplm_short_feature_results (loop_id, window_kind, window_end DESC);
            CREATE INDEX IF NOT EXISTS idx_cplm_short_loop_lower
                ON analytics.cplm_short_feature_results (lower(loop_id));
            -- Recency = window_end, not created_at (audit.md B-4): a replay
            -- rewriting an old window bumps created_at and would become "latest".
            CREATE OR REPLACE VIEW analytics.cplm_short_feature_latest AS
                SELECT DISTINCT ON (loop_id, window_kind) * FROM analytics.cplm_short_feature_results
                ORDER BY loop_id, window_kind,
                         (COALESCE(completeness, 0) >= 0.95 AND COALESCE(sample_count, 0) >= 10) DESC,
                         window_end DESC NULLS LAST;

            CREATE TABLE IF NOT EXISTS analytics.cplm_long_feature_results (
                id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                loop_id VARCHAR(256) NOT NULL, window_kind VARCHAR(16) NOT NULL,
                window_start TIMESTAMPTZ, window_end TIMESTAMPTZ, sample_count INT,
                acf_period_s DOUBLE PRECISION, acf_regularity DOUBLE PRECISION,
                effort_ratio DOUBLE PRECISION, triangularity DOUBLE PRECISION,
                horch_oddness DOUBLE PRECISION, corner_score DOUBLE PRECISION,
                travel_per_day DOUBLE PRECISION, reversals_per_hour DOUBLE PRECISION,
                harmonic_amplitude_ratio DOUBLE PRECISION, harmonic_energy_ratio DOUBLE PRECISION,
                payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                source VARCHAR(32) NOT NULL DEFAULT 'flink',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
            ALTER TABLE analytics.cplm_long_feature_results
                ADD COLUMN IF NOT EXISTS method_run_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
                ADD COLUMN IF NOT EXISTS bundle_hash TEXT NOT NULL DEFAULT 'legacy',
                ADD COLUMN IF NOT EXISTS context_revision INT NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS result_revision INT NOT NULL DEFAULT 1,
                ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'LIVE',
                ADD COLUMN IF NOT EXISTS analysis_run_id UUID,
                ADD COLUMN IF NOT EXISTS source_commit TEXT,
                ADD COLUMN IF NOT EXISTS jar_sha256 TEXT,
                ADD COLUMN IF NOT EXISTS dataset_hash TEXT;
            CREATE UNIQUE INDEX IF NOT EXISTS uq_cplm_long_window_bundle
                ON analytics.cplm_long_feature_results (loop_id, window_kind, window_end, source, bundle_hash);
            DROP INDEX IF EXISTS analytics.uq_cplm_long_window;
            CREATE INDEX IF NOT EXISTS ix_cplm_long_feature_results_method_run_ids
                ON analytics.cplm_long_feature_results USING gin (method_run_ids);
            CREATE INDEX IF NOT EXISTS idx_cplm_long_loop_kind_time
                ON analytics.cplm_long_feature_results (loop_id, window_kind, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_cplm_long_loop_kind_end
                ON analytics.cplm_long_feature_results (loop_id, window_kind, window_end DESC);
            CREATE INDEX IF NOT EXISTS idx_cplm_long_loop_lower
                ON analytics.cplm_long_feature_results (lower(loop_id));
            CREATE OR REPLACE VIEW analytics.cplm_long_feature_latest AS
                SELECT DISTINCT ON (loop_id, window_kind) * FROM analytics.cplm_long_feature_results
                ORDER BY loop_id, window_kind, window_end DESC NULLS LAST;
            """;
}
