-- Align expire_shelved_alarms with EF migration enum labels (AckedActive, UnackedActive, etc.)
CREATE OR REPLACE FUNCTION alarms.expire_shelved_alarms()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    WITH expired AS (
        UPDATE alarms.active_alarms SET
            is_shelved      = FALSE,
            shelve_until    = NULL,
            alarm_state     = CASE
                                WHEN acknowledged AND NOT condition_active THEN 'UnackedCleared'::alarms.alarm_state
                                WHEN acknowledged AND condition_active THEN 'AckedActive'::alarms.alarm_state
                                WHEN NOT acknowledged AND NOT condition_active THEN 'UnackedCleared'::alarms.alarm_state
                                ELSE 'UnackedActive'::alarms.alarm_state
                              END,
            updated_at      = NOW()
        WHERE is_shelved = TRUE AND shelve_until <= NOW()
        RETURNING id, source_name, server_id, alarm_state
    )
    INSERT INTO alarms.shelving_actions (
        alarm_id, source_name, server_id, action, shelve_time, comment, operator_station
    )
    SELECT id, source_name, server_id, 'AUTO_EXPIRED', NOW(),
           'Shelve period expired automatically', 'SYSTEM'
    FROM expired;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;
