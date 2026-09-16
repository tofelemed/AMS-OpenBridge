package com.ams.flink.cplm.health;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ArrayNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

/**
 * One device status interval (spec v6 §4.5): it begins at the SUPPORTED observed time and ends
 * on an explicit newer state, a freshness expiry or a source-offline boundary. Revisions
 * (late corrections) are separate rows; the original belief is never overwritten.
 */
public final class HealthInterval implements Serializable {
    private static final long serialVersionUID = 1L;
    public static final String NO_ACTIVE_DIAGNOSTIC = "NO_ACTIVE_DIAGNOSTIC";

    public String tenantId = "";
    public String site = "";
    public String deviceId = "";
    public long fromMs;
    public Long toMs;
    /** NEWER_STATE | FRESHNESS_EXPIRED | SOURCE_OFFLINE | OPEN */
    public String boundaryKind = "OPEN";
    public List<String> activeFlags = new ArrayList<>();
    public String nativeStatus = "";
    /** VERIFIED | STALE | UNKNOWN | OFFLINE */
    public String collectionState = "UNKNOWN";
    /** VALID | INVALID | DEGRADED | UNKNOWN */
    public String measurementImpact = "UNKNOWN";
    /** NO_ACTIVE_DIAGNOSTIC, or a hash-like id of the flags+diagnostics set. */
    public String healthStateId = "";
    public List<String> affectedVariableIds = new ArrayList<>();
    public List<String> diagnosticIds = new ArrayList<>();
    public String fromObservationId = "";
    public boolean stateComplete;
    public long verifiedAtMs;
    public long producerEpoch;
    public int revision = 1;

    public HealthInterval copy() {
        HealthInterval c = new HealthInterval();
        c.tenantId = tenantId; c.site = site; c.deviceId = deviceId; c.fromMs = fromMs; c.toMs = toMs;
        c.boundaryKind = boundaryKind; c.activeFlags = new ArrayList<>(activeFlags); c.nativeStatus = nativeStatus;
        c.collectionState = collectionState; c.measurementImpact = measurementImpact; c.healthStateId = healthStateId;
        c.affectedVariableIds = new ArrayList<>(affectedVariableIds); c.diagnosticIds = new ArrayList<>(diagnosticIds);
        c.fromObservationId = fromObservationId; c.stateComplete = stateComplete; c.verifiedAtMs = verifiedAtMs;
        c.producerEpoch = producerEpoch; c.revision = revision;
        return c;
    }

    public ObjectNode toJson(ObjectMapper m) {
        ObjectNode n = m.createObjectNode();
        n.put("tenant_id", tenantId);
        n.put("site", site);
        n.put("device_id", deviceId);
        n.put("from_ms", fromMs);
        if (toMs == null) n.putNull("to_ms"); else n.put("to_ms", toMs);
        n.put("boundary_kind", boundaryKind);
        ArrayNode f = n.putArray("active_flags");
        for (String s : activeFlags) f.add(s);
        n.put("native_status", nativeStatus);
        n.put("collection_state", collectionState);
        n.put("measurement_impact", measurementImpact);
        n.put("health_state_id", healthStateId);
        ArrayNode a = n.putArray("affected_variable_ids");
        for (String s : affectedVariableIds) a.add(s);
        ArrayNode d = n.putArray("diagnostic_ids");
        for (String s : diagnosticIds) d.add(s);
        n.put("from_observation_id", fromObservationId);
        n.put("state_complete", stateComplete);
        n.put("verified_at_ms", verifiedAtMs);
        n.put("producer_epoch", producerEpoch);
        n.put("revision", revision);
        return n;
    }
}
