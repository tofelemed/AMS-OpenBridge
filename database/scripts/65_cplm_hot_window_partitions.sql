-- CHG-102 (IoTDB + PostgreSQL plan, Phase 4): feature hot windows kept by partition DROP.
-- retention_policy gains a nullable "hours" column (cplm-api partition maintenance: hours when set, else days x 24)
-- and the feature rows: SHORT_FEATURES 6 h (days 1 for an older cplm-api), LONG_FEATURES 1 day.
-- The lab's result tables are Timescale hypertables (39_timescale_policies.sql): cplm-api's partition maintenance
-- skips them and so does this script - the hourly re-partitioning of cplm_short_feature_results exists only for the
-- plant's plain partitioned tables (scripts/cpm-17-hot-window-partitions.sql, after cpm-10b). On the lab the rows
-- below are inert. Additive, re-runnable, online (DO NOTHING keeps a row an operator changed).
-- Mirrors: migration/schema/03-traverse_cplm.sql (fresh plant: the column only), scripts/cpm-17 (live plant).
\c traverse_cplm

ALTER TABLE analytics.retention_policy ADD COLUMN IF NOT EXISTS hours int;
COMMENT ON COLUMN analytics.retention_policy.hours IS
    'CHG-102: retention in hours; when set it wins over days (cplm-api partition maintenance). SHORT_FEATURES = 6 (hourly partitions dropped).';

INSERT INTO analytics.retention_policy (record_class, days, hours)
VALUES ('SHORT_FEATURES', 1, 6), ('LONG_FEATURES', 1, NULL)
ON CONFLICT (record_class) DO NOTHING;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ams_user') THEN
        GRANT ALL ON ALL TABLES IN SCHEMA analytics TO ams_user;
    END IF;
END $$;
