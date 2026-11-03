-- CHG-102 (IoTDB + PostgreSQL plan, Phase 6): three years of Overview-KPI history with the loops behind every point.
-- analytics.cplm_kpi_daily (per UTC plant day, fused window and monitored loop: the classification GET
-- fleet/kpis/loops?asOf=<day end> returned, with its inputs and FleetKpiClassifier rule_version), its run ledger
-- analytics.cplm_kpi_daily_run, and retention_policy KPI_DAILY = 1095 days. Filled by cplm-api FleetKpiDailyJob (hourly).
-- Plain tables on the lab too (small: ~0.3 M rows over 3 years). Additive, re-runnable, online.
-- Mirrors: scripts/cpm-18-kpi-daily.sql (live plant), migration/schema/03-traverse_cplm.sql (fresh plant).
\c traverse_cplm

CREATE TABLE IF NOT EXISTS analytics.cplm_kpi_daily (
    day                  date         NOT NULL,
    window_kind          varchar(16)  NOT NULL,
    loop_id              varchar(256) NOT NULL,
    as_of                timestamptz  NOT NULL,
    site                 text,
    area                 text,
    unit                 text,
    state                varchar(24)  NOT NULL,
    reason               varchar(64),
    outcome              varchar(24)  NOT NULL,
    band                 varchar(32),
    family               varchar(64),
    diagnosis            varchar(128),
    window_end           timestamptz,
    age_seconds          double precision,
    fresh                boolean      NOT NULL,
    normal_mode_measured boolean      NOT NULL,
    in_normal_mode       boolean      NOT NULL,
    saturation_measured  boolean      NOT NULL,
    saturated            boolean      NOT NULL,
    manual_mode_measured boolean      NOT NULL,
    in_manual_mode       boolean      NOT NULL,
    limited_by           text[]       NOT NULL DEFAULT '{}',
    inputs               jsonb        NOT NULL DEFAULT '{}'::jsonb,
    rule_version         int          NOT NULL,
    computed_at          timestamptz  NOT NULL DEFAULT now(),
    PRIMARY KEY (day, window_kind, loop_id)
);
COMMENT ON TABLE analytics.cplm_kpi_daily IS
    'CHG-102: per plant day (UTC), fused window and monitored loop, the Overview-KPI classification as of the day end (00:00 UTC next day) - what GET fleet/kpis/loops?asOf returned - with its inputs and FleetKpiClassifier rule_version. Kept retention_policy KPI_DAILY days (1095). Written by cplm-api FleetKpiDailyJob.';
CREATE TABLE IF NOT EXISTS analytics.cplm_kpi_daily_run (
    day          date         NOT NULL,
    window_kind  varchar(16)  NOT NULL,
    as_of        timestamptz  NOT NULL,
    rule_version int          NOT NULL,
    loops        int          NOT NULL,
    thresholds   jsonb        NOT NULL DEFAULT '{}'::jsonb,
    computed_at  timestamptz  NOT NULL DEFAULT now(),
    PRIMARY KEY (day, window_kind)
);
COMMENT ON TABLE analytics.cplm_kpi_daily_run IS
    'CHG-102: one row per stored day and window of analytics.cplm_kpi_daily (present = stored, even with 0 loops), with the rule version and the Cpm:Kpi thresholds used.';

INSERT INTO analytics.retention_policy (record_class, days) VALUES ('KPI_DAILY', 1095)
    ON CONFLICT (record_class) DO NOTHING;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ams_user') THEN
        ALTER TABLE analytics.cplm_kpi_daily OWNER TO ams_user;
        ALTER TABLE analytics.cplm_kpi_daily_run OWNER TO ams_user;
        GRANT ALL ON analytics.cplm_kpi_daily, analytics.cplm_kpi_daily_run TO ams_user;
    END IF;
END $$;
