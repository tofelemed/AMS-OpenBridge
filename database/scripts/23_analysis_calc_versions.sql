-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 7 (V2): Calculation versioning for analysis-service
-- Calculations are named, versioned artifacts (Flink-only-compute decision). Adds a version pointer to
-- analysis_definitions and an append-only calculation_versions history. Idempotent; analysis-service
-- also self-heals these at startup.
-- ═══════════════════════════════════════════════════════════════════════════

\c traverse_analysis

ALTER TABLE analysis.analysis_definitions ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS analysis.calculation_versions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id   UUID NOT NULL REFERENCES analysis.analysis_definitions(id) ON DELETE CASCADE,
    version       INTEGER NOT NULL,
    configuration JSONB NOT NULL,
    change_note   TEXT,
    status        TEXT NOT NULL DEFAULT 'draft',
    created_by    TEXT NOT NULL DEFAULT 'system',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at  TIMESTAMPTZ,
    UNIQUE (analysis_id, version)
);
CREATE INDEX IF NOT EXISTS idx_calc_versions_analysis ON analysis.calculation_versions(analysis_id);

GRANT ALL ON ALL TABLES IN SCHEMA analysis TO ams_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA analysis TO ams_user;

DO $$ BEGIN RAISE NOTICE 'Calculation versioning schema created'; END $$;
