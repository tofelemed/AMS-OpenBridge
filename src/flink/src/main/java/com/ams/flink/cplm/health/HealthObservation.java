package com.ams.flink.cplm.health;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;

import java.io.Serializable;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * v2.5 Task 1H.4: one record of traverse.cpa.instrument.health.v1 as published by the
 * ingestion gateway - {@code {"gateway": {...}, "observation": {...}}} - parsed into the fields
 * the device state machine needs. Diagnostics are kept (id, flags, affected variables, impact);
 * everything else stays in the ledger row cplm-api mirrors.
 */
public final class HealthObservation implements Serializable {
    private static final long serialVersionUID = 1L;
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public static final class Diagnostic implements Serializable {
        private static final long serialVersionUID = 1L;
        public String diagnosticId = "";
        public String nativeCode = "";
        public List<String> flags = new ArrayList<>();
        public List<String> affectedVariableIds = new ArrayList<>();
        public String measurementImpact = "UNKNOWN";
        public long firstObservedAtMs;
    }

    public String tenantId = "";
    public String site = "";
    public String sourceId = "";
    public String deviceId = "";
    public String messageKind = "";
    public String observationId = "";
    public String producerId = "";
    public long producerEpoch;
    public long sequence;
    public long stateRevision;
    public boolean stateComplete;
    public long observedAtMs;
    public long verifiedAtMs;
    public long publishedAtMs;
    public long receivedAtMs;
    public double scanIntervalS;
    public List<String> activeFlags = new ArrayList<>();
    public String nativeStatus = "";
    public String collectionState = "UNKNOWN";
    public String measurementImpact = "UNKNOWN";
    public List<Diagnostic> diagnostics = new ArrayList<>();
    public List<String> gatewayFlags = new ArrayList<>();
    /** SOURCE_AVAILABILITY only: ONLINE | OFFLINE | DEGRADED, and its since time. */
    public String availabilityState;
    public long sinceMs;
    /** STATE_EVENT only. */
    public String changeKind;
    public String correctsObservationId;

    public boolean isAvailability() {
        return "SOURCE_AVAILABILITY".equals(messageKind);
    }

    public String deviceKey() {
        return tenantId + "|" + site + "|" + deviceId;
    }

    public static HealthObservation fromJson(String json) {
        try {
            JsonNode root = MAPPER.readTree(json);
            JsonNode gw = root.path("gateway");
            JsonNode o = root.has("observation") ? root.path("observation") : root;
            HealthObservation h = new HealthObservation();
            h.tenantId = o.path("tenant_id").asText("");
            h.site = o.path("site_id").asText("");
            h.sourceId = o.path("source_id").asText("");
            h.deviceId = o.path("device_id").asText("");
            h.messageKind = o.path("message_kind").asText("");
            h.observationId = o.path("observation_id").asText("");
            h.producerId = o.path("producer_id").asText("");
            h.producerEpoch = o.path("producer_epoch").asLong(0);
            h.sequence = o.path("sequence").asLong(0);
            h.stateRevision = o.path("state_revision").asLong(0);
            h.stateComplete = o.path("state_complete").asBoolean(false);
            h.observedAtMs = ts(o.path("observed_at").asText(null));
            h.verifiedAtMs = ts(o.path("verified_at").asText(null));
            h.publishedAtMs = ts(o.path("published_at").asText(null));
            h.receivedAtMs = ts(gw.path("received_at").asText(null));
            if (h.receivedAtMs == 0) h.receivedAtMs = h.publishedAtMs;
            h.scanIntervalS = o.path("scan_interval_s").asDouble(0);
            for (JsonNode f : gw.path("flags")) h.gatewayFlags.add(f.asText());
            if (h.isAvailability()) {
                h.availabilityState = o.path("state").asText("UNKNOWN");
                h.sinceMs = ts(o.path("since").asText(null));
                return h;
            }
            JsonNode st = o.path("state");
            for (JsonNode f : st.path("active_flags")) h.activeFlags.add(f.asText());
            h.nativeStatus = st.path("native_status").asText("");
            h.collectionState = st.path("collection_state").asText("UNKNOWN");
            h.measurementImpact = st.path("measurement_impact").asText("UNKNOWN");
            for (JsonNode d : st.path("diagnostics")) {
                Diagnostic x = new Diagnostic();
                x.diagnosticId = d.path("diagnostic_id").asText("");
                x.nativeCode = d.path("native_code").asText("");
                for (JsonNode f : d.path("flags")) x.flags.add(f.asText());
                for (JsonNode v : d.path("affected_variable_ids")) x.affectedVariableIds.add(v.asText());
                x.measurementImpact = d.path("measurement_impact").asText("UNKNOWN");
                x.firstObservedAtMs = ts(d.path("first_observed_at").asText(null));
                h.diagnostics.add(x);
            }
            h.changeKind = o.path("change_kind").asText(null);
            h.correctsObservationId = o.path("corrects_observation_id").asText(null);
            return h;
        } catch (Exception e) {
            return null;
        }
    }

    static long ts(String iso) {
        if (iso == null || iso.isEmpty()) return 0;
        try {
            return Instant.parse(iso).toEpochMilli();
        } catch (Exception e) {
            return 0;
        }
    }
}
