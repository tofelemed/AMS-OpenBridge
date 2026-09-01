package com.ams.flink;

import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.api.common.serialization.SimpleStringSchema;
import org.apache.flink.connector.kafka.sink.KafkaSink;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.streaming.api.CheckpointingMode;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.datastream.SingleOutputStreamOperator;
import org.apache.flink.streaming.api.environment.CheckpointConfig;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

import java.time.OffsetDateTime;

/**
 * API alarm state machine: traverse.alarm.raw-alarms → validation → dedup → normalization → SOE → lifecycle
 * → KPI → projection (traverse.alarm.current-alarm-state). ACK via traverse.alarm.operator-actions / ack-results.
 * PostgreSQL is updated only by the API projection consumer — no Flink JDBC sinks.
 */
public class OpcEventStreamJob {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String HTTP_FEED_SERVER_ID = "f0af9a6d-85f6-4c9f-a8ad-6de277d1d110";

    public static void main(String[] args) throws Exception {
        PipelineConfig cfg = PipelineConfig.fromArgs(args);
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();

        env.enableCheckpointing(30_000, CheckpointingMode.EXACTLY_ONCE);
        env.getCheckpointConfig().setMinPauseBetweenCheckpoints(10_000);
        env.getCheckpointConfig().setCheckpointTimeout(120_000);
        env.getCheckpointConfig().setExternalizedCheckpointCleanup(
                CheckpointConfig.ExternalizedCheckpointCleanup.RETAIN_ON_CANCELLATION);

        // "committed" (prod default): resume from the group's committed offsets,
        // falling back to earliest only when the group has none (true first deploy).
        // A fresh submit with plain "earliest" replays the entire topic — safe but
        // a needless burst through every downstream on each JM incident.
        OffsetsInitializer rawOffsets;
        if ("latest".equalsIgnoreCase(cfg.rawAlarmsStartingOffsets)) {
            rawOffsets = OffsetsInitializer.latest();
        } else if ("committed".equalsIgnoreCase(cfg.rawAlarmsStartingOffsets)) {
            rawOffsets = OffsetsInitializer.committedOffsets(
                    org.apache.kafka.clients.consumer.OffsetResetStrategy.EARLIEST);
        } else {
            rawOffsets = OffsetsInitializer.earliest();
        }

        KafkaSource<String> rawSource = KafkaSource.<String>builder()
                .setBootstrapServers(cfg.brokers)
                .setTopics("traverse.alarm.raw-alarms")
                .setGroupId("traverse-alarm-flink-raw-alarms")
                .setStartingOffsets(rawOffsets)
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .setProperty("request.timeout.ms", "120000")
                .setProperty("default.api.timeout.ms", "120000")
                .build();

        SingleOutputStreamOperator<RawOpcAlarmEvent> validated = env
                .fromSource(rawSource, WatermarkStrategy.noWatermarks(), "raw-alarms-source")
                .setParallelism(cfg.rawSource)
                .map(new PipelineOperators.ValidationMap())
                .name("validation")
                .uid("validation")
                .setParallelism(cfg.validation)
                .filter(e -> e != null)
                .name("validation-filter")
                .uid("validation-filter");

        SingleOutputStreamOperator<RawOpcAlarmEvent> deduped = validated
                .keyBy(RawOpcAlarmEvent::getAlarmKey)
                .filter(new PipelineOperators.DedupFilter())
                .name("deduplication")
                .uid("deduplication")
                .setParallelism(cfg.dedup);

        SingleOutputStreamOperator<RawOpcAlarmEvent> normalized = deduped
                .map(new PipelineOperators.EnrichmentMap())
                .name("normalization")
                .uid("normalization")
                .setParallelism(cfg.enrichment)
                .filter(e -> e != null);

        SingleOutputStreamOperator<RawOpcAlarmEvent> soeOrdered = normalized
                .map(new PipelineOperators.SoeOrderMap())
                .name("soe-ordering")
                .uid("soe-ordering")
                .setParallelism(cfg.soe);

        SingleOutputStreamOperator<RawOpcAlarmEvent> lifecycleStream = soeOrdered
                .keyBy(RawOpcAlarmEvent::getAlarmKey)
                .map(new PipelineOperators.LifecycleMap())
                .name("lifecycle-engine")
                .uid("lifecycle-engine")
                .setParallelism(cfg.lifecycle);

        SingleOutputStreamOperator<RawOpcAlarmEvent> correlated = lifecycleStream
                .map(new PipelineOperators.CorrelationMap())
                .name("correlation-engine")
                .uid("correlation-engine")
                .setParallelism(cfg.correlation)
                .filter(e -> e != null);

        // audit-jobs.md A4: flood-band drops (severity >= 950) leave through a
        // side output to the DLQ instead of vanishing silently.
        SingleOutputStreamOperator<RawOpcAlarmEvent> floodFiltered = correlated
                .process(new PipelineOperators.FloodDetectProcess())
                .name("flood-detection")
                .uid("flood-detection")
                .setParallelism(cfg.flood);
        floodFiltered.getSideOutput(PipelineOperators.FLOOD_DROPPED)
                .sinkTo(kafkaSink(cfg.brokers, "traverse.alarm.raw-alarms-dlq"))
                .name("flood-dropped-dlq-sink")
                .uid("flood-dropped-dlq-sink")
                .setParallelism(cfg.flood);

        DataStream<String> rootCause = floodFiltered
                .map(new PipelineOperators.RootCauseMap())
                .name("root-cause-analysis")
                .uid("root-cause-analysis")
                .setParallelism(cfg.correlation)
                .filter(s -> s != null && !s.isEmpty());
        rootCause.sinkTo(kafkaSink(cfg.brokers, "traverse.alarm.root-cause-events"))
                .name("root-cause-sink")
                .uid("root-cause-sink")
                .setParallelism(cfg.correlation);

        floodFiltered
                .map(new PipelineOperators.KpiMap())
                .name("kpi-aggregation")
                .uid("kpi-aggregation")
                .setParallelism(cfg.kpi)
                .filter(s -> s != null && !s.isEmpty());

        DataStream<String> lifecycleEvents = floodFiltered
                .map(PipelineOperators::toLifecycleJson)
                .name("traverse.alarm.lifecycle-events")
                .uid("traverse.alarm.lifecycle-events");
        lifecycleEvents.sinkTo(kafkaSink(cfg.brokers, "traverse.alarm.lifecycle-events"));

        DataStream<String> currentState = floodFiltered
                .map(e -> {
                    if (!e.conditionActive) {
                        return PipelineOperators.toDeleteAlarmStateJson(e);
                    }
                    return PipelineOperators.toCurrentAlarmStateJson(e, e.acknowledged);
                })
                .name("projection-builder")
                .uid("projection-builder");
        // traverse.alarm.current-alarm-state is COMPACTED: records must be keyed (by alarmId) or the
        // broker rejects them — see docs/alarm-history-flink-sink-stuck.md.
        currentState.sinkTo(KafkaSinks.keyedByJsonField(cfg.brokers, "traverse.alarm.current-alarm-state", "alarmId"))
                .name("current-alarm-state-sink")
                .uid("current-alarm-state-sink")
                .setParallelism(cfg.projection);

        // ACK orchestration: traverse.alarm.operator-actions → traverse.alarm.ack-writeback
        KafkaSource<String> operatorSource = kafkaSource(cfg.brokers, "traverse.alarm.operator-actions", "traverse-alarm-flink-operator-actions");
        env.fromSource(operatorSource, WatermarkStrategy.noWatermarks(), "traverse.alarm.operator-actions")
                .setParallelism(cfg.ackProcessor)
                .map(OpcEventStreamJob::toAckWriteback)
                .name("ack-processor")
                .uid("ack-processor")
                .setParallelism(cfg.ackProcessor)
                .filter(s -> s != null && !s.isEmpty())
                .sinkTo(kafkaSink(cfg.brokers, "traverse.alarm.ack-writeback"));

        // ACK results → traverse.alarm.lifecycle-events + traverse.alarm.current-alarm-state projection
        KafkaSource<String> ackResultsSource = kafkaSource(cfg.brokers, "traverse.alarm.ack-results", "traverse-alarm-flink-ack-results");
        DataStream<String> ackResults = env
                .fromSource(ackResultsSource, WatermarkStrategy.noWatermarks(), "traverse.alarm.ack-results")
                .setParallelism(cfg.ackProcessor)
                .filter(s -> s != null && !s.isEmpty())
                .name("traverse.alarm.ack-results")
                .uid("traverse.alarm.ack-results");

        ackResults
                .map(OpcEventStreamJob::toAckLifecycleEvent)
                .filter(s -> s != null && !s.isEmpty())
                .sinkTo(kafkaSink(cfg.brokers, "traverse.alarm.lifecycle-events"))
                .name("ack-lifecycle-sink")
                .uid("ack-lifecycle-sink")
                .setParallelism(cfg.ackProcessor);

        ackResults
                .filter(OpcEventStreamJob::isAckConfirmed)
                .map(OpcEventStreamJob::toAckConfirmedState)
                .filter(s -> s != null && !s.isEmpty())
                .sinkTo(KafkaSinks.keyedByJsonField(cfg.brokers, "traverse.alarm.current-alarm-state", "alarmId"))
                .name("ack-projection-sink")
                .uid("ack-projection-sink")
                .setParallelism(cfg.projection);

        env.execute("AMS - Alarm State Machine");
    }

    private static KafkaSource<String> kafkaSource(String brokers, String topic, String groupId) {
        return KafkaSource.<String>builder()
                .setBootstrapServers(brokers)
                .setTopics(topic)
                .setGroupId(groupId)
                // committed-with-earliest-fallback: a fresh submit must not replay
                // every historical operator action / ack result (re-dispatching old
                // ACK writebacks), only continue where the group left off.
                .setStartingOffsets(OffsetsInitializer.committedOffsets(
                        org.apache.kafka.clients.consumer.OffsetResetStrategy.EARLIEST))
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .setProperty("request.timeout.ms", "120000")
                .setProperty("default.api.timeout.ms", "120000")
                .build();
    }

    private static KafkaSink<String> kafkaSink(String brokers, String topic) {
        return KafkaSinks.valueOnly(brokers, topic);
    }

    private static String toAckWriteback(String json) {
        try {
            JsonNode node = MAPPER.readTree(json);
            String actionType = AlarmJson.text(node, "ActionType", "actionType");
            if (!"ACKNOWLEDGE".equalsIgnoreCase(actionType)) return "";
            var out = MAPPER.createObjectNode();
            out.put("schemaVersion", 1);
            out.put("eventType", "ACK_WRITEBACK_COMMAND");
            out.put("commandId", AlarmJson.text(node, "CommandId", "commandId"));
            out.put("correlationId", AlarmJson.text(node, "CorrelationId", "correlationId"));
            out.put("lifecycleId", AlarmJson.text(node, "LifecycleId", "lifecycleId"));
            out.put("alarmId", AlarmJson.text(node, "AlarmId", "alarmId"));
            out.put("sourceAlarmId", AlarmJson.text(node, "SourceAlarmId", "sourceAlarmId"));
            out.put("sourceEventId", AlarmJson.text(node, "SourceEventId", "sourceEventId"));
            out.put("serverId", AlarmJson.text(node, "ServerId", "serverId"));
            out.put("sourceName", AlarmJson.text(node, "SourceName", "sourceName"));
            out.put("conditionName", AlarmJson.text(node, "ConditionName", "conditionName"));
            if (node.has("subConditionName") && !node.get("subConditionName").isNull())
                out.put("subConditionName", node.get("subConditionName").asText());
            out.put("username", AlarmJson.text(node, "Username", "username"));
            out.put("activeTimeEpochMs", AlarmJson.field(node, "ActiveTimeEpochMs", "activeTimeEpochMs").asLong(0));
            out.put("activeFileTime", AlarmJson.field(node, "ActiveFileTime", "activeFileTime").asLong(0));
            out.put("cookieOffset", AlarmJson.field(node, "CookieOffset", "cookieOffset").asInt(0));
            out.put("ackState", "ACK_DISPATCHED");
            out.put("lifecycleState", "ACK_DISPATCHED");
            return MAPPER.writeValueAsString(out);
        } catch (Exception e) {
            return "";
        }
    }

    private static boolean isAckConfirmed(String json) {
        try {
            JsonNode node = MAPPER.readTree(json);
            return "ACK_CONFIRMED".equalsIgnoreCase(AlarmJson.text(node, "ResultState", "resultState"));
        } catch (Exception e) {
            return false;
        }
    }

    private static String toAckLifecycleEvent(String json) {
        try {
            JsonNode node = MAPPER.readTree(json);
            String resultState = AlarmJson.text(node, "ResultState", "resultState");
            if (resultState.isEmpty()) return "";

            var out = MAPPER.createObjectNode();
            out.put("schemaVersion", 1);
            out.put("eventType", "LIFECYCLE_EVENT");
            out.put("alarmId", AlarmJson.text(node, "AlarmId", "alarmId"));
            out.put("serverId", AlarmJson.text(node, "ServerId", "serverId"));
            out.put("sourceName", AlarmJson.text(node, "SourceName", "sourceName"));
            out.put("conditionName", AlarmJson.text(node, "ConditionName", "conditionName"));
            out.put("commandId", AlarmJson.text(node, "CommandId", "commandId"));
            out.put("correlationId", AlarmJson.text(node, "CorrelationId", "correlationId"));
            out.put("lifecycleId", AlarmJson.text(node, "LifecycleId", "lifecycleId"));
            out.put("lifecycleState", resultState);
            out.put("detail", AlarmJson.text(node, "ErrorMessage", "errorMessage"));
            out.put("timestampEpochMs", AlarmJson.field(node, "TimestampEpochMs", "timestampEpochMs").asLong(System.currentTimeMillis()));
            return MAPPER.writeValueAsString(out);
        } catch (Exception e) {
            return "";
        }
    }

    private static String toAckConfirmedState(String json) {
        try {
            JsonNode node = MAPPER.readTree(json);
            var out = MAPPER.createObjectNode();
            out.put("schemaVersion", 1);
            // Use ACK_STATE_UPDATE so the consumer only updates ack fields
            // without resurrecting a cleared alarm as conditionActive=true.
            out.put("eventType", "ACK_STATE_UPDATE");
            out.put("eventId", AlarmJson.text(node, "CommandId", "commandId"));
            out.put("commandId", AlarmJson.text(node, "CommandId", "commandId"));
            out.put("correlationId", AlarmJson.text(node, "CorrelationId", "correlationId"));
            out.put("lifecycleId", AlarmJson.text(node, "LifecycleId", "lifecycleId"));
            out.put("alarmId", AlarmJson.text(node, "AlarmId", "alarmId"));
            out.put("serverId", AlarmJson.text(node, "ServerId", "serverId"));
            out.put("sourceName", AlarmJson.text(node, "SourceName", "sourceName"));
            out.put("conditionName", AlarmJson.text(node, "ConditionName", "conditionName"));
            out.put("severity", 100);
            out.put("priority", "LOW");
            out.put("category", "PROCESS");
            out.put("alarmEventKind", "CONDITION");
            // Do NOT hardcode conditionActive=true — let the consumer preserve existing state.
            out.put("acknowledged", true);
            out.put("ackLifecycleState", "ACK_CONFIRMED");
            out.put("quality", 192);
            out.put("eventTimeEpochMs", AlarmJson.field(node, "TimestampEpochMs", "timestampEpochMs").asLong(System.currentTimeMillis()));
            out.put("activeTimeEpochMs", AlarmJson.field(node, "ActiveTimeEpochMs", "activeTimeEpochMs").asLong(0));
            out.put("serverReceivedEpochMs", System.currentTimeMillis());
            var opc = out.putObject("opcAttributes");
            opc.put("feed", "http-current-alarms");
            opc.put("ackPath", "http");
            opc.put("opcAckWriteable", true);
            opc.put("alarmEventKind", "CONDITION");
            return MAPPER.writeValueAsString(out);
        } catch (Exception e) {
            return "";
        }
    }
}
