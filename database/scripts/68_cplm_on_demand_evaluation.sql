-- CHG-102 Phase 5c: on-demand EVALUATE analysis runs (purpose EVALUATE on analytics.analysis_run + the reuse / in-flight
-- indexes). Additive, re-runnable, online.
-- Mirrors: scripts/cpm-20-on-demand-evaluation.sql (live plant), migration/schema/03-traverse_cplm.sql (fresh plant).
\c traverse_cplm

-- analysis_run.purpose gains EVALUATE. The inline CHECK of cpm-07 / 53_ has a generated name; every CHECK on the table
-- that names purpose is replaced by ONE named constraint (NOT VALID, then VALIDATE: no long lock on a busy table).
DO $$
DECLARE c record;
BEGIN
    FOR c IN SELECT conname FROM pg_constraint
             WHERE conrelid = 'analytics.analysis_run'::regclass AND contype = 'c'
               AND pg_get_constraintdef(oid) LIKE '%purpose%'
               AND pg_get_constraintdef(oid) NOT LIKE '%EVALUATE%'
    LOOP
        EXECUTE format('ALTER TABLE analytics.analysis_run DROP CONSTRAINT %I', c.conname);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conrelid = 'analytics.analysis_run'::regclass AND conname = 'analysis_run_purpose_check') THEN
        ALTER TABLE analytics.analysis_run ADD CONSTRAINT analysis_run_purpose_check
            CHECK (purpose IN ('REPLAY', 'SHADOW', 'EVIDENCE_RECONSTRUCTION', 'EVALUATE')) NOT VALID;
    END IF;
END $$;
ALTER TABLE analytics.analysis_run VALIDATE CONSTRAINT analysis_run_purpose_check;

-- the reuse probe of POST EVALUATE (same loop and window: finished with evidence held, or in flight)
CREATE INDEX IF NOT EXISTS ix_analysis_run_evaluate_window
    ON analytics.analysis_run (lower(loop_id), requested_from_ms, requested_to_ms) WHERE purpose = 'EVALUATE';
-- the per-user in-flight count and the timeout sweep (a handful of rows)
CREATE INDEX IF NOT EXISTS ix_analysis_run_evaluate_open
    ON analytics.analysis_run (created_by) WHERE purpose = 'EVALUATE' AND state IN ('QUEUED', 'RUNNING');

COMMENT ON COLUMN analytics.analysis_run.purpose IS
    'REPLAY | SHADOW | EVIDENCE_RECONSTRUCTION | EVALUATE (CHG-102 5c: one loop over one window, evaluated from the historian by the always-running on-demand Flink job; states QUEUED -> RUNNING -> FINISHED | FAILED).';
