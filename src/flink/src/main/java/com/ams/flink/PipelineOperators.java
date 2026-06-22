package com.ams.flink;

import org.apache.flink.api.common.functions.RichFilterFunction;
import org.apache.flink.api.common.functions.RichMapFunction;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.metrics.Counter;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.Set;

/** Named Flink operators with Flink metric counters for UI throughput validation. */
public final class PipelineOperators {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private PipelineOperators() {}

    public static class ValidationMap extends RichMapFunction<String, RawOpcAlarmEvent> {
        private transient Counter recordsIn;
        private transient Counter recordsOut;

        @Override
        public void open(Configuration parameters) {
            recordsIn = getRuntimeContext().getMetricGroup().counter("records_in");
            recordsOut = getRuntimeContext().getMetricGroup().counter("records_out");
        }

        @Override
        public RawOpcAlarmEvent map(String json) throws Exception {
            recordsIn.inc();
            try {
                JsonNode root = MAPPER.readTree(json);
                String source = text(root, "sourceName", "sourcePath");
                String condition = text(root, "conditionName", "condition");
                if (source.isEmpty() || condition.isEmpty()) return null;

                boolean httpFeed = root.has("alarmId") && root.has("state");
                String serverId = text(root, "serverId", "opcServer");
                if (serverId.isEmpty()) {
                    serverId = httpFeed ? "f0af9a6d-85f6-4c9f-a8ad-6de277d1d110"
                            : "7ce5ecbf-70c9-498d-b899-5c8bb7add383";
                }
                String subCondition = root.has("subConditionName") && !root.get("subConditionName").isNull()
                        ? root.get("subConditionName").asText() : "";

                RawOpcAlarmEvent evt = new RawOpcAlarmEvent();
                evt.serverId = serverId;
                evt.source = source;
                evt.condition = condition;
                evt.subCondition = subCondition;
                evt.alarmKey = AlarmKeys.alarmKey(serverId, source, condition, subCondition);
                String explicitAlarmId = text(root, "alarmId", null);
                evt.alarmId = explicitAlarmId.isEmpty()
                        ? AlarmKeys.stableAlarmId(evt.alarmKey)
                        : explicitAlarmId;
                evt.message = text(root, "message", null);
                if (httpFeed) {
                    evt.severity = priorityToSeverity(text(root, "priority", null));
                    String state = text(root, "state", "ACTIVE");
                    evt.conditionActive = !"CLEARED".equalsIgnoreCase(state);
                } else {
                    evt.severity = root.has("severity") ? root.get("severity").asInt(300) : 300;
                    evt.conditionActive = !root.has("conditionActive") || root.get("conditionActive").asBoolean(true);
                }
                evt.ackRequired = httpFeed || (root.has("ackRequired") && root.get("ackRequired").asBoolean());
                evt.opcDcsAcknowledged = root.has("acknowledged") && root.get("acknowledged").asBoolean();
                // OPC A&E is authoritative for acknowledgment — accept for ALL sources, not just httpFeed.
                // An external HMI/SCADA acknowledging via the OPC server will push acknowledged=true
                // through the same raw-alarms pipeline; we must not discard it.
                evt.acknowledged = evt.opcDcsAcknowledged;
                evt.cookieOffset = cookie(root);
                evt.eventTimeEpochMs = eventTimeMs(root);
                evt.activeTimeEpochMs = root.has("activeTimeEpochMs")
                        ? root.get("activeTimeEpochMs").asLong(evt.eventTimeEpochMs) : evt.eventTimeEpochMs;
                evt.activeFileTime = root.has("activeFileTime") ? root.get("activeFileTime").asLong(0) : 0L;
                evt.sourceEventId = text(root, "sourceEventId", "source_event_id");
                evt.httpFeed = httpFeed;
                evt.transitionType = evt.conditionActive ? "ACTIVE" : "CLEARED";
                evt.lifecycleState = evt.conditionActive ? "ACTIVE" : "CLEARED";
                recordsOut.inc();
                return evt;
            } catch (Exception e) {
                return null;
            }
        }
    }

    public static class DedupFilter extends RichFilterFunction<RawOpcAlarmEvent> {
        private transient Counter recordsIn;
        private transient Counter recordsOut;
        private transient ValueState<Long> lastEventTime;
        /** Track last conditionActive state so state transitions with same timestamp pass through. */
        private transient ValueState<Boolean> lastConditionActive;
        /**
         * Track last acknowledged state so external acknowledgment updates (same timestamp,
         * same conditionActive) pass through — OPC A&E is the authoritative ack source.
         */
        private transient ValueState<Boolean> lastAcknowledged;

        @Override
        public void open(Configuration parameters) {
            recordsIn = getRuntimeContext().getMetricGroup().counter("records_in");
            recordsOut = getRuntimeContext().getMetricGroup().counter("records_out");
            lastEventTime    = getRuntimeContext().getState(new ValueStateDescriptor<>("lastEventTime", Long.class));
            lastConditionActive = getRuntimeContext().getState(new ValueStateDescriptor<>("lastConditionActive", Boolean.class));
            lastAcknowledged = getRuntimeContext().getState(new ValueStateDescriptor<>("lastAcknowledged", Boolean.class));
        }

        @Override
        public boolean filter(RawOpcAlarmEvent evt) throws Exception {
            recordsIn.inc();
            if (evt == null) return false;
            Long prev = lastEventTime.value();
            Boolean prevActive = lastConditionActive.value();
            Boolean prevAcked  = lastAcknowledged.value();

            // Pass through if conditionActive changed (clear/restore transition).
            boolean activeChanged = (prevActive != null && prevActive != evt.conditionActive);
            // Pass through if acknowledged bit changed — this covers external OPC A&E acknowledgments
            // from any client (another HMI, Experion, engineering workstation, etc.).
            boolean ackChanged = (prevAcked != null && prevAcked != evt.acknowledged);

            if (prev != null && prev >= evt.eventTimeEpochMs && !activeChanged && !ackChanged) {
                evt.duplicate = true;
                return false;
            }
            lastEventTime.update(evt.eventTimeEpochMs);
            lastConditionActive.update(evt.conditionActive);
            lastAcknowledged.update(evt.acknowledged);
            recordsOut.inc();
            return true;
        }
    }

    public static class EnrichmentMap extends RichMapFunction<RawOpcAlarmEvent, RawOpcAlarmEvent> {
        private transient Counter recordsIn;
        private transient Counter recordsOut;

        @Override
        public void open(Configuration parameters) {
            recordsIn = getRuntimeContext().getMetricGroup().counter("records_in");
            recordsOut = getRuntimeContext().getMetricGroup().counter("records_out");
        }

        @Override
        public RawOpcAlarmEvent map(RawOpcAlarmEvent evt) {
            recordsIn.inc();
            if (evt == null) return null;
            evt.priority = evt.severity >= 900 ? "CRITICAL"
                    : evt.severity >= 700 ? "HIGH"
                    : evt.severity >= 400 ? "MEDIUM"
                    : evt.severity >= 100 ? "LOW" : "DIAGNOSTIC";
            evt.category = "PROCESS";
            ObjectNode opc = MAPPER.createObjectNode();
            opc.put("cookieOffset", evt.cookieOffset);
            opc.put("activeTimeEpochMs", evt.activeTimeEpochMs);
            opc.put("activeFileTime", evt.activeFileTime);
            opc.put("ackRequired", evt.ackRequired);
            opc.put("opcDcsAcknowledged", evt.opcDcsAcknowledged);
            opc.put("acknowledged", evt.acknowledged);
            boolean httpAck = evt.httpFeed && evt.conditionActive && !evt.opcDcsAcknowledged;
            opc.put("opcAckWriteable", httpAck || (evt.cookieOffset > 0 && evt.ackRequired && !evt.opcDcsAcknowledged));
            if (evt.httpFeed) {
                opc.put("feed", "http-current-alarms");
                opc.put("ackPath", "http");
            }
            if (evt.sourceEventId != null && !evt.sourceEventId.isEmpty()) {
                opc.put("sourceEventId", evt.sourceEventId);
            }
            opc.put("alarmEventKind", "CONDITION");
            try {
                evt.opcAttributesJson = MAPPER.writeValueAsString(opc);
            } catch (Exception e) {
                evt.opcAttributesJson = "{}";
            }
            recordsOut.inc();
            return evt;
        }
    }

    public static class SoeOrderMap extends RichMapFunction<RawOpcAlarmEvent, RawOpcAlarmEvent> {
        private transient Counter recordsIn;
        private transient Counter recordsOut;

        @Override
        public void open(Configuration parameters) {
            recordsIn = getRuntimeContext().getMetricGroup().counter("records_in");
            recordsOut = getRuntimeContext().getMetricGroup().counter("records_out");
        }

        @Override
        public RawOpcAlarmEvent map(RawOpcAlarmEvent evt) {
            recordsIn.inc();
            recordsOut.inc();
            return evt;
        }
    }

    public static class LifecycleMap extends RichMapFunction<RawOpcAlarmEvent, RawOpcAlarmEvent> {
        private transient Counter recordsIn;
        private transient Counter recordsOut;
        private transient ValueState<String>  prevState;
        /**
         * Persisted acknowledged state for this alarm key.
         * Updated on every event so the projection always emits the latest OPC ack value,
         * even when multiple events arrive for the same alarm (external ack from any client).
         */
        private transient ValueState<Boolean> prevAcknowledged;

        @Override
        public void open(Configuration parameters) {
            recordsIn  = getRuntimeContext().getMetricGroup().counter("records_in");
            recordsOut = getRuntimeContext().getMetricGroup().counter("records_out");
            prevState        = getRuntimeContext().getState(new ValueStateDescriptor<>("prevLifecycle", String.class));
            prevAcknowledged = getRuntimeContext().getState(new ValueStateDescriptor<>("prevAcknowledged", Boolean.class));
        }

        @Override
        public RawOpcAlarmEvent map(RawOpcAlarmEvent evt) throws Exception {
            recordsIn.inc();
            if (evt == null) return null;

            String  prev      = prevState.value();
            Boolean prevAcked = prevAcknowledged.value();

            // Lifecycle state transition
            if (prev == null) {
                evt.transitionType = "NEW";
                evt.lifecycleState = "ACTIVE";
            } else if (evt.conditionActive) {
                evt.transitionType = "ACTIVE";
                evt.lifecycleState = "ACTIVE";
            } else {
                evt.transitionType = "CLEARED";
                evt.lifecycleState = "CLEARED";
            }

            // OPC A&E is the authoritative source for acknowledgment.
            // Once acknowledged=true is confirmed by OPC, preserve it in keyed state
            // so subsequent events (e.g. an updated severity) do not accidentally reset it.
            // acknowledged=false from a new activation correctly overrides a prior true.
            boolean effectiveAck = evt.acknowledged;
            if (!effectiveAck && prevAcked != null && prevAcked && evt.conditionActive && prev != null) {
                // Incoming event does not carry ack=true but prior state was acknowledged.
                // Only preserve if conditionActive is still true (no reactivation).
                // A new activation (prev==null) intentionally resets acknowledgment.
                effectiveAck = true;
            }
            evt.acknowledged = effectiveAck;

            // Clear keyed state after CLEARED to prevent unbounded state growth.
            // If the alarm reactivates later, it will be treated as NEW (ack reset).
            if (!evt.conditionActive) {
                prevState.clear();
                prevAcknowledged.clear();
            } else {
                prevState.update(evt.lifecycleState);
                prevAcknowledged.update(evt.acknowledged);
            }
            recordsOut.inc();
            return evt;
        }
    }

    /** Correlation pass-through with metrics (feeds root-cause CEP). */
    public static class CorrelationMap extends RichMapFunction<RawOpcAlarmEvent, RawOpcAlarmEvent> {
        private transient Counter recordsIn;
        private transient Counter recordsOut;

        @Override
        public void open(Configuration parameters) {
            recordsIn = getRuntimeContext().getMetricGroup().counter("records_in");
            recordsOut = getRuntimeContext().getMetricGroup().counter("records_out");
        }

        @Override
        public RawOpcAlarmEvent map(RawOpcAlarmEvent evt) {
            recordsIn.inc();
            if (evt == null) return null;
            recordsOut.inc();
            return evt;
        }
    }

    public static class RootCauseMap extends RichMapFunction<RawOpcAlarmEvent, String> {
        private static final Set<String> CRUSHER_FAMILY = new HashSet<>();
        static {
            CRUSHER_FAMILY.add("CRUSHER");
            CRUSHER_FAMILY.add("CONVEYOR");
            CRUSHER_FAMILY.add("FEEDER");
            CRUSHER_FAMILY.add("MOTOR");
        }

        private transient Counter recordsIn;
        private transient Counter recordsOut;

        @Override
        public void open(Configuration parameters) {
            recordsIn = getRuntimeContext().getMetricGroup().counter("records_in");
            recordsOut = getRuntimeContext().getMetricGroup().counter("records_out");
        }

        @Override
        public String map(RawOpcAlarmEvent evt) throws Exception {
            recordsIn.inc();
            if (evt == null || !evt.conditionActive) return "";
            String src = evt.source.toUpperCase();
            if (!src.contains("CRUSHER") && !src.contains("CONVEYOR") && !src.contains("FEEDER") && !src.contains("MOTOR")) {
                return "";
            }
            ObjectNode out = MAPPER.createObjectNode();
            out.put("alarmId", evt.alarmId);
            out.put("rootCause", src.contains("CRUSHER") ? "Crusher" : evt.source);
            var suppressed = out.putArray("suppressed");
            for (String tag : CRUSHER_FAMILY) {
                if (!src.contains(tag)) suppressed.add(tag);
            }
            out.put("eventTime", OffsetDateTime.now().toString());
            recordsOut.inc();
            return MAPPER.writeValueAsString(out);
        }
    }

    public static class KpiMap extends RichMapFunction<RawOpcAlarmEvent, String> {
        private transient Counter recordsIn;
        private transient Counter recordsOut;

        @Override
        public void open(Configuration parameters) {
            recordsIn = getRuntimeContext().getMetricGroup().counter("records_in");
            recordsOut = getRuntimeContext().getMetricGroup().counter("records_out");
        }

        @Override
        public String map(RawOpcAlarmEvent evt) throws Exception {
            recordsIn.inc();
            if (evt == null || !evt.conditionActive) return "";
            ObjectNode out = MAPPER.createObjectNode();
            out.put("source", evt.source);
            out.put("severity", evt.severity);
            out.put("priority", evt.priority);
            out.put("eventTimeEpochMs", evt.eventTimeEpochMs);
            recordsOut.inc();
            return MAPPER.writeValueAsString(out);
        }
    }

    public static class FloodDetectFilter extends RichFilterFunction<RawOpcAlarmEvent> {
        private transient Counter recordsIn;
        private transient Counter recordsOut;

        @Override
        public void open(Configuration parameters) {
            recordsIn = getRuntimeContext().getMetricGroup().counter("records_in");
            recordsOut = getRuntimeContext().getMetricGroup().counter("records_out");
        }

        @Override
        public boolean filter(RawOpcAlarmEvent evt) {
            recordsIn.inc();
            if (evt == null) return false;
            recordsOut.inc();
            return evt.severity < 950;
        }
    }

    public static String toAlarmTopicJson(RawOpcAlarmEvent evt, String state, boolean ack) throws Exception {
        ObjectNode out = MAPPER.createObjectNode();
        out.put("AlarmId", evt.alarmId);
        out.put("Source", evt.source);
        out.put("Severity", evt.severity);
        out.put("Message", evt.message != null ? evt.message : "");
        out.put("Condition", evt.condition);
        out.put("SubCondition", evt.subCondition != null ? evt.subCondition : "");
        out.put("EventTime", OffsetDateTime.ofInstant(
                java.time.Instant.ofEpochMilli(evt.eventTimeEpochMs), java.time.ZoneOffset.UTC).toString());
        out.put("State", state);
        out.put("AckStatus", ack);
        return MAPPER.writeValueAsString(out);
    }

    public static String toLifecycleJson(RawOpcAlarmEvent evt) throws Exception {
        ObjectNode out = MAPPER.createObjectNode();
        out.put("schemaVersion", 1);
        out.put("alarmId", evt.alarmId);
        out.put("serverId", evt.serverId);
        out.put("sourceName", evt.source);
        out.put("conditionName", evt.condition);
        out.put("lifecycleState", evt.lifecycleState);
        out.put("transitionType", evt.transitionType);
        out.put("timestampEpochMs", evt.eventTimeEpochMs);
        return MAPPER.writeValueAsString(out);
    }

    public static String toCurrentAlarmStateJson(RawOpcAlarmEvent evt, boolean ack) throws Exception {
        ObjectNode out = MAPPER.createObjectNode();
        out.put("schemaVersion", 1);
        out.put("eventType", "ALARM_STATE_UPSERT");
        out.put("eventId", evt.alarmId + ":" + evt.eventTimeEpochMs);
        out.put("alarmId", evt.alarmId);
        out.put("serverId", evt.serverId);
        out.put("sourceName", evt.source);
        out.put("conditionName", evt.condition);
        if (evt.subCondition != null && !evt.subCondition.isEmpty())
            out.put("subConditionName", evt.subCondition);
        out.put("message", evt.message != null ? evt.message : "");
        out.put("severity", evt.severity);
        out.put("priority", evt.priority != null ? evt.priority : "LOW");
        out.put("category", evt.category != null ? evt.category : "PROCESS");
        out.put("alarmEventKind", "CONDITION");
        out.put("conditionActive", evt.conditionActive);
        out.put("acknowledged", ack);
        out.put("quality", 192);
        out.put("eventTimeEpochMs", evt.eventTimeEpochMs);
        out.put("activeTimeEpochMs", evt.activeTimeEpochMs);
        out.put("serverReceivedEpochMs", System.currentTimeMillis());
        out.put("cookieOffset", evt.cookieOffset);
        if (evt.opcAttributesJson != null && !evt.opcAttributesJson.isEmpty()) {
            out.set("opcAttributes", MAPPER.readTree(evt.opcAttributesJson));
        }
        return MAPPER.writeValueAsString(out);
    }

    /** Emit a DELETE projection for cleared (inactive) alarms — consumed by NormalizedAlarmIngestor to remove from alarm_current. */
    public static String toDeleteAlarmStateJson(RawOpcAlarmEvent evt) throws Exception {
        ObjectNode out = MAPPER.createObjectNode();
        out.put("schemaVersion", 1);
        out.put("eventType", "ALARM_STATE_DELETE");
        out.put("alarmId", evt.alarmId);
        out.put("serverId", evt.serverId);
        out.put("sourceName", evt.source);
        out.put("conditionName", evt.condition);
        out.put("conditionActive", false);
        out.put("acknowledged", evt.acknowledged);
        out.put("eventTimeEpochMs", evt.eventTimeEpochMs);
        out.put("serverReceivedEpochMs", System.currentTimeMillis());
        return MAPPER.writeValueAsString(out);
    }

    private static String text(JsonNode root, String primary, String fallback) {
        if (root.has(primary) && !root.get(primary).isNull()) return root.get(primary).asText("");
        if (fallback != null && root.has(fallback) && !root.get(fallback).isNull()) return root.get(fallback).asText("");
        return "";
    }

    private static int cookie(JsonNode root) {
        if (root.has("cookieOffset")) return root.get("cookieOffset").asInt(0);
        if (root.has("opcAttributes") && root.get("opcAttributes").has("cookieOffset"))
            return root.get("opcAttributes").get("cookieOffset").asInt(0);
        return 0;
    }

    private static long eventTimeMs(JsonNode root) {
        if (root.has("eventTimeEpochMs")) return root.get("eventTimeEpochMs").asLong();
        if (root.has("timestamp")) {
            try {
                return OffsetDateTime.parse(root.get("timestamp").asText()).toInstant().toEpochMilli();
            } catch (Exception ignored) { }
        }
        if (root.has("eventTime")) {
            try {
                return OffsetDateTime.parse(root.get("eventTime").asText()).toInstant().toEpochMilli();
            } catch (Exception ignored) { }
        }
        return System.currentTimeMillis();
    }

    private static int priorityToSeverity(String priority) {
        if (priority == null) return 300;
        switch (priority.toUpperCase()) {
            case "CRITICAL": return 900;
            case "HIGH": return 700;
            case "MEDIUM": return 400;
            case "LOW": return 100;
            default: return 300;
        }
    }
}
