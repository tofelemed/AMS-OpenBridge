-- =========================================================================
-- 36 — Alarm shelving persistence + expiry  (GAP DOM-02, Plan 01 item 7)
-- =========================================================================
-- Problem this fixes:
--   ISA-18.2 shelving was exposed through the API (shelve/unshelve endpoints,
--   an IsShelved query filter) and modelled on the domain entity, but it was
--   never persisted: AmsDbContext ignored IsShelved/ShelveUntil/IsSuppressed
--   and alarms.alarm_current had no columns for them. A shelved alarm was
--   therefore forgotten on the next reload, and "shelve expiry" had nothing
--   to expire.
--
--   Separately, alarms.expire_shelved_alarms() operated on alarms.active_alarms
--   — a table the running code does not use (the EF entity is mapped to
--   alarm_current) — and inserted into alarms.shelving_actions, which no
--   script ever created, so the function failed on first call.
--
-- Idempotent: safe on a fresh bootstrap and on an existing database.
-- =========================================================================

-- ── 1. Persist the shelving state on the live projection table ──────────
ALTER TABLE alarms.alarm_current
    ADD COLUMN IF NOT EXISTS is_shelved    BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS shelve_until  TIMESTAMPTZ(3),
    ADD COLUMN IF NOT EXISTS shelved_by    VARCHAR(255),
    ADD COLUMN IF NOT EXISTS is_suppressed BOOLEAN NOT NULL DEFAULT FALSE;

-- Only shelved rows are ever scanned by the expiry sweep, so keep the index
-- partial — it stays tiny regardless of how large the projection grows.
CREATE INDEX IF NOT EXISTS idx_alarm_current_shelved
    ON alarms.alarm_current (shelve_until)
    WHERE is_shelved;

-- ── 2. Audit trail for shelve/unshelve actions ──────────────────────────
CREATE TABLE IF NOT EXISTS alarms.shelving_actions (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alarm_id          UUID NOT NULL,
    source_name       VARCHAR(1024) NOT NULL,
    server_id         UUID,
    action            VARCHAR(32) NOT NULL,     -- SHELVED | UNSHELVED | AUTO_EXPIRED
    shelve_time       TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
    shelve_until      TIMESTAMPTZ(3),
    comment           TEXT,
    operator_station  VARCHAR(255),
    created_at        TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shelving_actions_alarm
    ON alarms.shelving_actions (alarm_id, shelve_time DESC);

-- ── 3. Expiry sweep against the table the system actually uses ──────────
-- Returns the number of alarms un-shelved. Restores state from the ack flag:
-- alarm_current.state is the VARCHAR domain ('ACTIVE' | 'CLEARED' | 'SHELVED'
-- | 'SUPPRESSED' ...) produced by AmsDbContext.ConvertToDb — not the
-- alarms.alarm_state enum used by the orphaned active_alarms table.
CREATE OR REPLACE FUNCTION alarms.expire_shelved_alarms()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    WITH expired AS (
        UPDATE alarms.alarm_current SET
            is_shelved   = FALSE,
            shelve_until = NULL,
            state        = 'ACTIVE',
            last_updated = NOW()
        WHERE is_shelved = TRUE
          AND shelve_until IS NOT NULL
          AND shelve_until <= NOW()
        RETURNING id, source, server_id, shelve_until
    )
    INSERT INTO alarms.shelving_actions (
        alarm_id, source_name, server_id, action, shelve_time, comment, operator_station
    )
    SELECT id, source, server_id, 'AUTO_EXPIRED', NOW(),
           'Shelve period expired automatically', 'SYSTEM'
    FROM expired;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;
