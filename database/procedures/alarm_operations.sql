-- ============================================================
-- AMS - Stored Procedures & Functions
-- High-performance alarm operations
-- ============================================================

-- --------------------------------------------------------
-- Acknowledge alarm (atomic with audit logging)
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION alarms.acknowledge_alarm(
    p_alarm_id      UUID,
    p_user_id       UUID,
    p_username      VARCHAR,
    p_comment       TEXT,
    p_ip_address    INET,
    p_station       VARCHAR
)
RETURNS TABLE(success BOOLEAN, message TEXT) AS $$
DECLARE
    v_alarm         alarms.active_alarms%ROWTYPE;
    v_response_sec  DOUBLE PRECISION;
BEGIN
    -- Lock the row
    SELECT * INTO v_alarm FROM alarms.active_alarms 
    WHERE id = p_alarm_id FOR UPDATE NOWAIT;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Alarm not found or does not exist in active state'::TEXT;
        RETURN;
    END IF;
    
    IF v_alarm.acknowledged THEN
        RETURN QUERY SELECT FALSE, 'Alarm is already acknowledged'::TEXT;
        RETURN;
    END IF;
    
    IF v_alarm.is_shelved THEN
        RETURN QUERY SELECT FALSE, 'Cannot acknowledge a shelved alarm'::TEXT;
        RETURN;
    END IF;
    
    -- Calculate response time
    v_response_sec := EXTRACT(EPOCH FROM (NOW() - v_alarm.active_time));
    
    -- Update active alarm
    UPDATE alarms.active_alarms SET
        acknowledged    = TRUE,
        ack_time        = NOW(),
        acked_by        = p_user_id,
        ack_comment     = p_comment,
        alarm_state     = CASE 
                            WHEN condition_active THEN 'ACKNOWLEDGED_UNCLEARED'::alarms.alarm_state
                            ELSE 'ACKNOWLEDGED_CLEARED'::alarms.alarm_state
                          END,
        updated_at      = NOW()
    WHERE id = p_alarm_id;
    
    -- Record acknowledgement
    INSERT INTO alarms.alarm_acknowledgements (
        alarm_id, source_name, server_id, acknowledged_by, 
        ack_time, ack_comment, response_time_sec, operator_station, ip_address
    ) VALUES (
        p_alarm_id, v_alarm.source_name, v_alarm.server_id, p_user_id,
        NOW(), p_comment, v_response_sec, p_station, p_ip_address
    );
    
    -- Record state transition
    INSERT INTO alarms.alarm_state_transitions (
        alarm_id, server_id, source_name, from_state, to_state,
        transition_time, triggered_by, trigger_reason, comment
    ) VALUES (
        p_alarm_id, v_alarm.server_id, v_alarm.source_name,
        v_alarm.alarm_state,
        CASE WHEN v_alarm.condition_active 
             THEN 'ACKNOWLEDGED_UNCLEARED'::alarms.alarm_state 
             ELSE 'ACKNOWLEDGED_CLEARED'::alarms.alarm_state END,
        NOW(), p_user_id, 'OPERATOR_ACK', p_comment
    );
    
    -- Audit log
    INSERT INTO audit.action_log (
        user_id, username, action, resource_type, resource_id,
        description, ip_address, operator_station
    ) VALUES (
        p_user_id, p_username, 'alarm.acknowledge', 'active_alarm', p_alarm_id::TEXT,
        FORMAT('Acknowledged alarm: %s | Comment: %s | Response time: %ss', 
               v_alarm.source_name, p_comment, ROUND(v_response_sec::NUMERIC, 1)),
        p_ip_address, p_station
    );
    
    RETURN QUERY SELECT TRUE, 'Alarm acknowledged successfully'::TEXT;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------
-- Batch Acknowledge (optimized for flood situations)
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION alarms.batch_acknowledge_alarms(
    p_alarm_ids     UUID[],
    p_user_id       UUID,
    p_username      VARCHAR,
    p_comment       TEXT,
    p_ip_address    INET,
    p_station       VARCHAR
)
RETURNS TABLE(success_count INT, failed_count INT, message TEXT) AS $$
DECLARE
    v_success   INT := 0;
    v_failed    INT := 0;
    v_alarm_id  UUID;
    v_result    RECORD;
BEGIN
    FOREACH v_alarm_id IN ARRAY p_alarm_ids
    LOOP
        SELECT * INTO v_result FROM alarms.acknowledge_alarm(
            v_alarm_id, p_user_id, p_username, p_comment, p_ip_address, p_station
        );
        IF v_result.success THEN
            v_success := v_success + 1;
        ELSE
            v_failed := v_failed + 1;
        END IF;
    END LOOP;
    
    -- Batch audit entry
    INSERT INTO audit.action_log (
        user_id, username, action, resource_type, description, ip_address, operator_station
    ) VALUES (
        p_user_id, p_username, 'alarm.acknowledge_batch', 'active_alarm',
        FORMAT('Batch acknowledge: %s succeeded, %s failed out of %s total | Comment: %s',
               v_success, v_failed, array_length(p_alarm_ids, 1), p_comment),
        p_ip_address, p_station
    );
    
    RETURN QUERY SELECT v_success, v_failed, 
        FORMAT('%s alarms acknowledged, %s failed', v_success, v_failed)::TEXT;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------
-- Shelve alarm
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION alarms.shelve_alarm(
    p_alarm_id      UUID,
    p_user_id       UUID,
    p_username      VARCHAR,
    p_duration_min  INTEGER,
    p_comment       TEXT,
    p_ip_address    INET,
    p_station       VARCHAR
)
RETURNS TABLE(success BOOLEAN, message TEXT, shelve_until TIMESTAMPTZ) AS $$
DECLARE
    v_alarm         alarms.active_alarms%ROWTYPE;
    v_tag           configuration.alarm_tags%ROWTYPE;
    v_shelve_until  TIMESTAMPTZ;
BEGIN
    SELECT * INTO v_alarm FROM alarms.active_alarms WHERE id = p_alarm_id FOR UPDATE NOWAIT;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Alarm not found'::TEXT, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;
    
    -- Check shelving is allowed
    SELECT * INTO v_tag FROM configuration.alarm_tags WHERE id = v_alarm.alarm_tag_id;
    
    IF v_tag.id IS NOT NULL AND NOT v_tag.is_shelving_allowed THEN
        RETURN QUERY SELECT FALSE, 'Shelving is not permitted for this alarm tag'::TEXT, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;
    
    -- Enforce max shelve duration per ISA-18.2 (default 8 hours = 480 min)
    DECLARE v_max_min INTEGER := COALESCE(v_tag.max_shelve_time_min, 480);
    BEGIN
        IF p_duration_min > v_max_min THEN
            RETURN QUERY SELECT FALSE, 
                FORMAT('Shelve duration exceeds maximum allowed (%s minutes)', v_max_min)::TEXT, 
                NULL::TIMESTAMPTZ;
            RETURN;
        END IF;
    END;
    
    v_shelve_until := NOW() + (p_duration_min * INTERVAL '1 minute');
    
    UPDATE alarms.active_alarms SET
        is_shelved      = TRUE,
        shelved_at      = NOW(),
        shelved_by      = p_user_id,
        shelve_until    = v_shelve_until,
        shelve_comment  = p_comment,
        alarm_state     = 'SHELVED'::alarms.alarm_state,
        updated_at      = NOW()
    WHERE id = p_alarm_id;
    
    INSERT INTO alarms.shelving_actions (
        alarm_id, alarm_tag_id, source_name, server_id, action,
        shelved_by, shelve_time, duration_min, comment, operator_station
    ) VALUES (
        p_alarm_id, v_alarm.alarm_tag_id, v_alarm.source_name, v_alarm.server_id,
        'SHELVE', p_user_id, NOW(), p_duration_min, p_comment, p_station
    );
    
    INSERT INTO alarms.alarm_state_transitions (
        alarm_id, server_id, source_name, from_state, to_state,
        transition_time, triggered_by, trigger_reason, comment
    ) VALUES (
        p_alarm_id, v_alarm.server_id, v_alarm.source_name,
        v_alarm.alarm_state, 'SHELVED'::alarms.alarm_state,
        NOW(), p_user_id, 'OPERATOR_SHELVE', p_comment
    );
    
    INSERT INTO audit.action_log (
        user_id, username, action, resource_type, resource_id,
        description, ip_address, operator_station
    ) VALUES (
        p_user_id, p_username, 'alarm.shelve', 'active_alarm', p_alarm_id::TEXT,
        FORMAT('Shelved alarm: %s for %s minutes until %s | Comment: %s',
               v_alarm.source_name, p_duration_min, v_shelve_until, p_comment),
        p_ip_address, p_station
    );
    
    RETURN QUERY SELECT TRUE, 'Alarm shelved successfully'::TEXT, v_shelve_until;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------
-- Auto-expire shelved alarms (called by scheduler)
-- --------------------------------------------------------
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
                                WHEN acknowledged AND NOT condition_active THEN 'ACKNOWLEDGED_CLEARED'::alarms.alarm_state
                                WHEN acknowledged AND condition_active THEN 'ACKNOWLEDGED_UNCLEARED'::alarms.alarm_state
                                WHEN NOT acknowledged AND NOT condition_active THEN 'UNACKNOWLEDGED_CLEARED'::alarms.alarm_state
                                ELSE 'UNACKNOWLEDGED_UNCLEARED'::alarms.alarm_state
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

-- --------------------------------------------------------
-- Archive active alarm to historical (called when alarm clears)
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION alarms.archive_cleared_alarm(
    p_alarm_id      UUID,
    p_cleared_time  TIMESTAMPTZ(3)
)
RETURNS VOID AS $$
DECLARE
    v_alarm alarms.active_alarms%ROWTYPE;
BEGIN
    SELECT * INTO v_alarm FROM alarms.active_alarms WHERE id = p_alarm_id;
    IF NOT FOUND THEN RETURN; END IF;
    
    INSERT INTO alarms.historical_alarms (
        id, alarm_tag_id, server_id, source_name, event_type,
        condition_name, sub_condition_name, message, severity, priority, category,
        alarm_state, condition_active, acknowledged, quality,
        event_time, active_time, ack_time, cleared_time, acked_by, ack_comment,
        server_received_at, time_to_acknowledge_sec, time_to_clear_sec,
        is_shelved, shelved_by, shelve_duration_sec, is_suppressed,
        correlation_id, process_value, process_unit,
        kafka_offset, kafka_partition, opc_attributes, custom_attributes
    ) VALUES (
        v_alarm.id, v_alarm.alarm_tag_id, v_alarm.server_id, v_alarm.source_name,
        v_alarm.event_type, v_alarm.condition_name, v_alarm.sub_condition_name,
        v_alarm.message, v_alarm.severity, v_alarm.priority, v_alarm.category,
        CASE WHEN v_alarm.acknowledged THEN 'ACKNOWLEDGED_CLEARED'::alarms.alarm_state
             ELSE 'UNACKNOWLEDGED_CLEARED'::alarms.alarm_state END,
        FALSE, v_alarm.acknowledged, v_alarm.quality,
        v_alarm.event_time, v_alarm.active_time, v_alarm.ack_time, p_cleared_time,
        v_alarm.acked_by, v_alarm.ack_comment, v_alarm.server_received_at,
        CASE WHEN v_alarm.ack_time IS NOT NULL 
             THEN EXTRACT(EPOCH FROM (v_alarm.ack_time - v_alarm.active_time)) END,
        EXTRACT(EPOCH FROM (p_cleared_time - v_alarm.active_time)),
        v_alarm.is_shelved, v_alarm.shelved_by,
        CASE WHEN v_alarm.shelved_at IS NOT NULL AND v_alarm.shelve_until IS NOT NULL
             THEN EXTRACT(EPOCH FROM (LEAST(v_alarm.shelve_until, p_cleared_time) - v_alarm.shelved_at)) END,
        v_alarm.is_suppressed, v_alarm.correlation_id,
        v_alarm.process_value, v_alarm.process_unit,
        v_alarm.kafka_offset, v_alarm.kafka_partition,
        v_alarm.opc_attributes, v_alarm.custom_attributes
    );
    
    -- Remove from active alarms
    DELETE FROM alarms.active_alarms WHERE id = p_alarm_id;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------
-- Get current alarm statistics
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION alarms.get_alarm_statistics(p_server_id UUID DEFAULT NULL)
RETURNS TABLE(
    priority        alarms.alarm_priority,
    total           BIGINT,
    unacknowledged  BIGINT,
    shelved         BIGINT,
    suppressed      BIGINT,
    critical_unacked BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.priority,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE NOT a.acknowledged) AS unacknowledged,
        COUNT(*) FILTER (WHERE a.is_shelved) AS shelved,
        COUNT(*) FILTER (WHERE a.is_suppressed) AS suppressed,
        COUNT(*) FILTER (WHERE NOT a.acknowledged AND a.priority = 'CRITICAL') AS critical_unacked
    FROM alarms.active_alarms a
    WHERE (p_server_id IS NULL OR a.server_id = p_server_id)
      AND NOT a.is_suppressed
    GROUP BY a.priority
    ORDER BY 
        CASE a.priority 
            WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 
            WHEN 'MEDIUM' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 
        END;
END;
$$ LANGUAGE plpgsql STABLE;

-- --------------------------------------------------------
-- Detect chattering alarms (Flink supplement, runs on DB)
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics.detect_chattering_alarms(
    p_window_minutes INTEGER DEFAULT 10,
    p_threshold      INTEGER DEFAULT 2
)
RETURNS TABLE(
    source_name     TEXT,
    server_id       UUID,
    transition_count BIGINT,
    alarm_tag_id    UUID
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.source_name::TEXT,
        t.server_id,
        COUNT(*) AS transition_count,
        at2.id AS alarm_tag_id
    FROM alarms.alarm_state_transitions t
    LEFT JOIN configuration.alarm_tags at2 ON at2.source_name = t.source_name AND at2.server_id = t.server_id
    WHERE t.transition_time >= NOW() - (p_window_minutes * INTERVAL '1 minute')
      AND t.from_state IS NOT NULL
    GROUP BY t.source_name, t.server_id, at2.id
    HAVING COUNT(*) > p_threshold
    ORDER BY COUNT(*) DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- --------------------------------------------------------
-- Update bad actor rankings (scheduled function)
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics.refresh_bad_actor_rankings(
    p_window VARCHAR DEFAULT '1d'
)
RETURNS INTEGER AS $$
DECLARE
    v_interval INTERVAL;
    v_count INTEGER;
BEGIN
    v_interval := CASE p_window
        WHEN '1d' THEN INTERVAL '1 day'
        WHEN '7d' THEN INTERVAL '7 days'
        WHEN '30d' THEN INTERVAL '30 days'
        ELSE INTERVAL '1 day'
    END;
    
    INSERT INTO analytics.bad_actor_analysis (
        alarm_tag_id, analysis_period, analysis_window,
        occurrence_count, avg_duration_sec, total_duration_sec,
        standing_time_pct, ack_rate_pct, rank, is_bad_actor
    )
    SELECT
        at2.id AS alarm_tag_id,
        DATE_TRUNC('hour', NOW()) AS analysis_period,
        p_window AS analysis_window,
        COUNT(*) AS occurrence_count,
        AVG(h.time_to_clear_sec) AS avg_duration_sec,
        SUM(h.time_to_clear_sec) AS total_duration_sec,
        (SUM(h.time_to_clear_sec) / EXTRACT(EPOCH FROM v_interval) * 100)::DOUBLE PRECISION AS standing_time_pct,
        (COUNT(*) FILTER (WHERE h.acknowledged) * 100.0 / COUNT(*))::DOUBLE PRECISION AS ack_rate_pct,
        ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC)::INTEGER AS rank,
        ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC) <= 10 AS is_bad_actor
    FROM alarms.historical_alarms h
    JOIN configuration.alarm_tags at2 ON at2.id = h.alarm_tag_id
    WHERE h.event_time >= NOW() - v_interval
      AND h.alarm_tag_id IS NOT NULL
    GROUP BY at2.id
    ON CONFLICT DO NOTHING;
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------
-- ISA-18.2 Alarm rate check (alarms per 10 min)
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics.get_current_alarm_rate(
    p_server_id UUID,
    p_window_min INTEGER DEFAULT 10
)
RETURNS TABLE(
    alarms_per_10min    DOUBLE PRECISION,
    is_flood            BOOLEAN,
    flood_threshold     DOUBLE PRECISION
) AS $$
BEGIN
    RETURN QUERY
    WITH recent AS (
        SELECT COUNT(*) AS cnt
        FROM alarms.active_alarms
        WHERE server_id = p_server_id
          AND server_received_at >= NOW() - (p_window_min * INTERVAL '1 minute')
    )
    SELECT 
        (cnt * 10.0 / p_window_min)::DOUBLE PRECISION AS alarms_per_10min,
        (cnt * 10.0 / p_window_min > 10)::BOOLEAN AS is_flood,
        10.0::DOUBLE PRECISION AS flood_threshold  -- ISA-18.2 threshold
    FROM recent;
END;
$$ LANGUAGE plpgsql STABLE;
