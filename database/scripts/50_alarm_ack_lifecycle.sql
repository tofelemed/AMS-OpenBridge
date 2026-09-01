-- 50 — Persist the ACK lifecycle on alarms.alarm_current (audit-jobs.md C2/F-3).
--
-- ActiveAlarm.ApplyAckLifecycle wrote everything into CustomAttributes, which
-- AmsDbContext IGNORED — so ack lifecycle state, ack time, comment and the
-- correlation ids survived only in memory: every REST rehydrate (30 s poll,
-- reconnect, refresh) wiped the ACK column back to "—", and AlarmEnricher
-- fabricated AckTime as now() on every read.
--
-- custom_attributes mirrors opc_attributes (JSONB map, EF value-converted);
-- ack_time / acked_by / ack_comment get first-class columns because queries
-- and EEMUA KPIs (mean-time-to-ack) need them typed.

\c ams

ALTER TABLE alarms.alarm_current
    ADD COLUMN IF NOT EXISTS custom_attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS ack_time    TIMESTAMPTZ(3),
    ADD COLUMN IF NOT EXISTS acked_by    UUID,
    ADD COLUMN IF NOT EXISTS ack_comment TEXT;

COMMENT ON COLUMN alarms.alarm_current.custom_attributes IS
    'Ack-lifecycle projection (ackLifecycleState, pendingAckCommandId, ackCorrelationId, …) — written by LifecycleEventConsumerService / command handlers.';
COMMENT ON COLUMN alarms.alarm_current.ack_time IS
    'When the ACK was confirmed (DCS write-back), NOT fabricated at read time.';
