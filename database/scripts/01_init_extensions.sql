-- ============================================================
-- AMS - PostgreSQL + TimescaleDB Initialization
-- OPC A&E 1.10 Compliant Schema Bootstrap
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create application schemas
CREATE SCHEMA IF NOT EXISTS alarms;
CREATE SCHEMA IF NOT EXISTS soe;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS configuration;
CREATE SCHEMA IF NOT EXISTS security;
CREATE SCHEMA IF NOT EXISTS notifications;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS keycloak;

-- Set search path
ALTER DATABASE ams SET search_path TO alarms, soe, analytics, configuration, security, notifications, audit, keycloak, public;

-- Create custom types
-- CREATE TYPE alarms.alarm_priority AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'DIAGNOSTIC');
-- CREATE TYPE alarms.alarm_state AS ENUM (
--     'UNACKNOWLEDGED_UNCLEARED',
--     'ACKNOWLEDGED_UNCLEARED',
--     'UNACKNOWLEDGED_CLEARED',
--     'ACKNOWLEDGED_CLEARED',
--     'SHELVED',
--     'SUPPRESSED_BY_DESIGN',
--     'OUT_OF_SERVICE',
--     'INHIBITED'
-- );
-- CREATE TYPE alarms.alarm_category AS ENUM (
--     'PROCESS',
--     'EQUIPMENT',
--     'INSTRUMENT',
--     'SAFETY',
--     'ENVIRONMENTAL',
--     'SYSTEM',
--     'OPERATOR_ACTION',
--     'COMMUNICATION'
-- );
-- CREATE TYPE alarms.event_type AS ENUM (
--     'SIMPLE',
--     'TRACKING',
--     'CONDITION'
-- );
-- CREATE TYPE alarms.condition_state AS ENUM (
--     'ACTIVE',
--     'INACTIVE',
--     'ACKNOWLEDGED',
--     'UNACKNOWLEDGED'
-- );
-- CREATE TYPE alarms.source_type AS ENUM (
--     'OPC_AE',
--     'OPC_DA',
--     'AVEVA_SYSTEM_PLATFORM',
--     'WONDERWARE',
--     'PI_SYSTEM',
--     'SQL_INTEGRATION',
--     'MODBUS',
--     'PROFIBUS',
--     'INTERNAL'
-- );
-- CREATE TYPE security.user_role AS ENUM (
--     'SYSTEM_ADMIN',
--     'ENGINEER',
--     'SUPERVISOR',
--     'OPERATOR',
--     'VIEWER',
--     'AUDITOR'
-- );
-- CREATE TYPE notifications.notification_channel AS ENUM (
--     'EMAIL',
--     'SMS',
--     'TEAMS',
--     'WEBHOOK',
--     'PAGER'
-- );
-- CREATE TYPE notifications.notification_status AS ENUM (
--     'PENDING',
--     'SENT',
--     'DELIVERED',
--     'FAILED',
--     'ACKNOWLEDGED'
-- );

COMMENT ON SCHEMA alarms IS 'Core alarm management tables';
COMMENT ON SCHEMA soe IS 'Sequence of Events engine tables';
COMMENT ON SCHEMA analytics IS 'Alarm analytics and KPI tables';
COMMENT ON SCHEMA configuration IS 'System configuration and OPC source mappings';
COMMENT ON SCHEMA security IS 'Users, roles, RBAC, and audit tables';
COMMENT ON SCHEMA notifications IS 'Notification engine tables';
COMMENT ON SCHEMA audit IS 'Full audit trail for all operator actions';
COMMENT ON SCHEMA keycloak IS 'Identity provider schema for Keycloak metadata and changelog';

-- Create implicit casts for EF Core enum text mapping
DO $$
BEGIN
    -- Only create if the types exist (they are created by EF Core migrations, so we can't create casts here directly before EF Core runs!)
END $$;
