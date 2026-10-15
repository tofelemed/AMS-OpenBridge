package com.ams.flink.cplm.fusion;

import com.ams.flink.cplm.CplmGateFusionEngine;
import com.ams.flink.cplm.CplmGateResult;
import com.ams.flink.cplm.CplmLongDiagnosticsResult;
import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import com.ams.flink.cplm.CplmShortFeatureResult;
import com.ams.flink.cplm.condition.OpenConditions;
import com.ams.flink.cplm.health.HealthEligibilityPolicy;
import com.ams.flink.cplm.health.HealthInterval;
import com.ams.flink.cplm.health.LoopHealthContext;
import com.ams.flink.cplm.health.LoopHealthContextRecord;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.Test;

import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * v2.5 Task 1H.5 (spec v6 §4.6, R15): fusion carries the Instrumental health lanes and uses them
 * in exactly two ways - a PV under a fault affecting the measurement excludes the window; LIMITED
 * and not-configured are caveats. Absence of health is flagged, never treated as a healthy device.
 */
public class FusionHealthLanesTest {
    private static final long T0 = 1_756_600_000_000L;
    private static final ObjectMapper M = new ObjectMapper();

    private static CplmShortFeatureResult shortOk() {
        CplmShortFeatureResult s = new CplmShortFeatureResult();
        s.loopId = "HEALTH_LOOP"; s.loopType = "FIC"; s.windowKind = "24h";
        s.windowStartMs = T0; s.windowEndMs = T0 + 86_400_000L;
        s.sufficientData = true; s.completeness = 1.0; s.sampleCount = 17_280; s.expectedSampleCount = 17_280;
        s.gate0Status = "PASS"; s.gate1Status = "PASS"; s.gate2Status = "PASS"; s.gate2rStatus = "PASS";
        s.operatingRegionValid = true; s.gate3Status = "PASS"; s.gate4Status = "PASS"; s.autoPct = 1.0;
        return s;
    }

    private static CplmLongDiagnosticsResult longOk() {
        CplmLongDiagnosticsResult l = new CplmLongDiagnosticsResult();
        l.loopId = "HEALTH_LOOP"; l.loopType = "FIC"; l.windowKind = "24h";
        l.windowStartMs = T0; l.windowEndMs = T0 + 86_400_000L; l.sampleCount = 17_280;
        l.gate5Status = "PASS"; l.gate6Status = "PASS"; l.gate7Status = "PASS"; l.gate8Status = "PASS";
        l.gate9Status = "PASS"; l.gate10Status = "PASS"; l.gate11Status = "PASS"; l.gate11Reason = "";
        l.periodStatus = "NO_VALID_CYCLE"; l.stictionSignal = "OP";
        l.alignedShort = shortOk();
        return l;
    }

    private static LoopHealthContextRecord ctx(String role, String eligibility, String reason, String... flags) {
        LoopHealthContextRecord r = new LoopHealthContextRecord();
        r.loopId = "HEALTH_LOOP"; r.role = role; r.deviceId = "TT-" + role; r.bindingId = "b-" + role;
        r.eligibility = eligibility; r.descriptiveEligibility = eligibility; r.reason = reason;
        r.hasInterval = true; r.fromMs = T0; r.activeFlags = Arrays.asList(flags);
        r.collectionState = "VERIFIED"; r.measurementImpact = "INELIGIBLE".equals(eligibility) ? "INVALID" : "VALID";
        r.healthStateId = "hs-" + role; r.revision = 1; r.emittedAtMs = T0;
        return r;
    }

    private static HealthLanes lanes(LoopHealthContextRecord... records) {
        Map<String, LoopHealthContextRecord> m = new HashMap<>();
        for (LoopHealthContextRecord r : records) m.put(r.role, r);
        return HealthLanes.of(m);
    }

    private static CplmGateResult fuse(HealthLanes lanes) {
        CplmLoopDynamicsProfile p = CplmLoopDynamicsProfile.resolve("HEALTH_LOOP", "FIC", null);
        return CplmGateFusionEngine.fuse(shortOk(), longOk(), false, false, p, OpenConditions.none(), lanes);
    }

    private static JsonNode json(CplmGateResult r) throws Exception {
        return M.readTree(r.toJson());
    }

    @Test
    public void pvUnderAFaultAffectingTheMeasurementExcludesTheWindow() throws Exception {
        CplmGateResult r = fuse(lanes(ctx("PV", "INELIGIBLE", "F_AFFECTS_PV", "F"), ctx("VP", "ELIGIBLE", "NO_ACTIVE_DIAGNOSTIC")));
        String out = r.toJson();
        assertTrue(out, out.contains("EXCLUDED_INSTRUMENT_HEALTH"));
        assertTrue(out, out.contains("F_AFFECTS_PV"));
        JsonNode lanes = json(r).path("health_lanes");
        assertTrue(lanes.path("configured").asBoolean());
        assertEquals("INELIGIBLE", lanes.path("pv_eligibility").asText());
        assertEquals("F", lanes.path("roles").path("PV").path("active_flags").get(0).asText());
        assertEquals("TT-VP", lanes.path("roles").path("VP").path("device_id").asText());
    }

    @Test
    public void noHealthContextIsFlaggedNotConfiguredAndNeverOk() throws Exception {
        CplmLoopDynamicsProfile p = CplmLoopDynamicsProfile.resolve("HEALTH_LOOP", "FIC", null);
        CplmGateResult r = CplmGateFusionEngine.fuse(shortOk(), longOk(), false, false, p, OpenConditions.none());
        assertTrue(r.observabilityFlags.contains("HEALTH_NOT_CONFIGURED"));
        String out = r.toJson();
        assertFalse(out, out.contains("EXCLUDED_INSTRUMENT_HEALTH"));
        JsonNode lanes = json(r).path("health_lanes");
        assertFalse(lanes.path("configured").asBoolean());
        assertEquals("NOT_CONFIGURED", lanes.path("pv_eligibility").asText());
        assertEquals(0, lanes.path("roles").size());
    }

    @Test
    public void limitedIsACaveatNotAnExclusion() throws Exception {
        CplmGateResult r = fuse(lanes(ctx("PV", "LIMITED", "S_ON_PV", "S")));
        assertTrue(r.observabilityFlags.contains("HEALTH_LIMITED"));
        assertFalse(r.observabilityFlags.contains("HEALTH_NOT_CONFIGURED"));
        String out = r.toJson();
        assertFalse(out, out.contains("EXCLUDED_INSTRUMENT_HEALTH"));
        assertEquals("S", json(r).path("health_lanes").path("roles").path("PV").path("active_flags").get(0).asText());
    }

    @Test
    public void anEligibleInstrumentLeavesTheVerdictUntouched() throws Exception {
        CplmLoopDynamicsProfile p = CplmLoopDynamicsProfile.resolve("HEALTH_LOOP", "FIC", null);
        ObjectNode without = (ObjectNode) M.readTree(
                CplmGateFusionEngine.fuse(shortOk(), longOk(), false, false, p, OpenConditions.none()).toJson());
        ObjectNode with = (ObjectNode) M.readTree(fuse(lanes(ctx("PV", "ELIGIBLE", "NO_ACTIVE_DIAGNOSTIC"))).toJson());
        // CHG-095: the SENSOR hypothesis says whether a health source was there to assess it
        assertEquals("NOT_ASSESSED", without.path("hypotheses").path("SENSOR").path("state").asText());
        assertEquals("NO_EVIDENCE", with.path("hypotheses").path("SENSOR").path("state").asText());
        for (ObjectNode n : new ObjectNode[] { without, with }) {
            ((ObjectNode) n.path("hypotheses")).remove("SENSOR");
            n.remove("health_lanes");
            n.remove("observability_flags");
            n.remove("observabilityFlags");
        }
        assertEquals(without, with);
    }

    @Test
    public void contextRecordsRoundTripFromTheWriter() {
        HealthInterval i = new HealthInterval();
        i.tenantId = "default"; i.site = "lab"; i.deviceId = "TT-1"; i.fromMs = T0; i.activeFlags = Arrays.asList("F");
        i.affectedVariableIds = Arrays.asList("HEALTH_LOOP.PV"); i.collectionState = "VERIFIED"; i.measurementImpact = "INVALID";
        i.healthStateId = "hs1"; i.fromObservationId = "o1"; i.revision = 2;
        HealthEligibilityPolicy.Result res = HealthEligibilityPolicy.evaluate(i, "HEALTH_LOOP.PV");
        String json = LoopHealthContext.loopContext(M, "HEALTH_LOOP", "PV", "b1", i, res, "NEWER_STATE", T0 + 1);

        LoopHealthContextRecord r = LoopHealthContextRecord.fromJson(json);
        assertNotNull(json, r);
        assertEquals("HEALTH_LOOP", r.loopId);
        assertEquals("PV", r.role);
        assertEquals("TT-1", r.deviceId);
        assertEquals("b1", r.bindingId);
        assertEquals(res.eligibility, r.eligibility);
        assertEquals(res.reason, r.reason);
        assertTrue(r.hasInterval);
        assertEquals(T0, r.fromMs);
        assertNull(r.toMs);
        assertEquals(Arrays.asList("F"), r.activeFlags);
        assertEquals("INVALID", r.measurementImpact);
        assertEquals(2, r.revision);
        assertEquals(T0 + 1, r.emittedAtMs);

        assertNull("device intervals are not loop contexts", LoopHealthContextRecord.fromJson(LoopHealthContext.deviceInterval(M, i, "OPEN", T0)));
        LoopHealthContextRecord nc = LoopHealthContextRecord.fromJson(LoopHealthContext.notConfigured(M, "HEALTH_LOOP", "VP", T0));
        assertNotNull(nc);
        assertTrue(nc.isNotConfigured());
        assertFalse(nc.hasInterval);
        assertFalse("a NOT_CONFIGURED record does not make the loop configured", lanes(nc).configured());
    }
}
