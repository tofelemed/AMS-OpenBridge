-- ═══════════════════════════════════════════════════════════════════════════
-- cpm-20-on-demand-evaluation.sql — PLANT live upgrade for CHG-102 Phase 5c: on-demand EVALUATE analysis runs.
-- POST /api/v1/cpm/analysis-runs {purpose: "EVALUATE", loopId, windowKind 4h|12h|24h, endMs} registers an
-- analysis_run (purpose EVALUATE, state QUEUED) and puts a request on traverse.cpa.clpm.evaluation.requests.v1; the
-- always-running Flink on-demand job evaluates the loop over [endMs - windowKind, endMs) from the historian and reports
-- on traverse.cpa.clpm.evaluation.status.v1 (cplm-api EvaluationStatusConsumerService: RUNNING -> FINISHED | FAILED).
-- Its gate row is stored under its own source (flink-on-demand-evaluation) and purpose EVALUATE - never read as live;
-- its evidence is STANDARD (3 d) and stored beside any live evidence of the same window (CHG-099 path).
--   * analysis_run.purpose CHECK allows EVALUATE (the generated-name CHECK of cpm-07 is replaced by a named one);
--   * two partial indexes on analysis_run for the reuse probe and the in-flight count.
--
-- RUN ONLINE (no stop), BEFORE the cplm-api image swap (release step PRE_SWAP 4h). The old cplm-api never writes
-- EVALUATE, so it is unaffected. Applied after the swap instead, POST EVALUATE fails with a CHECK violation (500) until
-- it is applied; nothing else changes.
--   docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < ops/cpm-20-on-demand-evaluation.sql
-- Idempotent (re-run safe). If the lock_timeout below fires (a long reader held analysis_run), re-run the file.
-- Kafka: the two topics are in migration/kafka/topics.txt (04-create-kafka-topics.sh creates them --if-not-exists).
--
-- Rollback (online): ops/cpm-20-on-demand-evaluation.rollback.sql (EVALUATE runs and their gate rows deleted, the
-- CHECK back to the three v2.5 purposes; their STANDARD evidence ages out in 3 d).
-- ═══════════════════════════════════════════════════════════════════════════

SET lock_timeout = '10s';

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

RESET lock_timeout;
