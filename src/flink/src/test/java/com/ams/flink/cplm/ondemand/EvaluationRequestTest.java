package com.ams.flink.cplm.ondemand;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.Test;

import java.util.Collections;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/** CHG-102 5c: the request contract cplm-api writes, as the on-demand evaluation job reads and refuses it. */
public class EvaluationRequestTest {
    static final ObjectMapper M = new ObjectMapper();
    static final String RUN = "4f7b8a62-3d2c-4c1e-9a0b-1f2e3d4c5b6a";
    static final long FROM = 1_762_128_000_000L, TO = FROM + 12 * 3_600_000L, AT = TO + 60_000L;

    static ObjectNode valid() {
        ObjectNode o = M.createObjectNode();
        o.put("schema", "cplm.evaluation.request.v1");
        o.put("analysis_run_id", RUN);
        o.put("mode", "EVALUATE");
        o.put("loop_id", "FIC-101");
        o.put("site", "hdpe");
        o.putNull("loop_type");
        o.put("window_kind", "12h");
        o.put("from_ms", FROM);
        o.put("to_ms", TO);
        o.putNull("iotdb_device");
        o.put("has_step_test", true);
        o.put("has_peer_links", false);
        o.putNull("bundle_hash");
        o.putNull("bundle_properties_b64");
        o.put("requested_at_ms", AT);
        return o;
    }

    @Test
    public void aValidRequestParses() {
        EvaluationRequest r = EvaluationRequest.parse(valid().toString());
        assertNull(r.rejection);
        assertEquals(RUN, r.analysisRunId);
        assertEquals("FIC-101", r.loopId);
        assertEquals("12h", r.windowKind);
        assertEquals(FROM, r.fromMs);
        assertEquals(TO, r.toMs);
        assertTrue(r.hasStepTest);
        assertFalse(r.hasPeerLinks);
        assertNull(r.loopType);
        assertNull(r.iotdbDevice);
        assertNull(r.bundleHash);
        assertEquals(AT, r.requestedAtMs);
    }

    @Test
    public void withoutARunIdThereIsNothingToAnswer() {
        ObjectNode o = valid();
        o.remove("analysis_run_id");
        assertNull(EvaluationRequest.parse(o.toString()).analysisRunId);
        o.put("analysis_run_id", "not-a-uuid");
        assertNull(EvaluationRequest.parse(o.toString()).analysisRunId);
        EvaluationRequest garbage = EvaluationRequest.parse("{not json");
        assertNull(garbage.analysisRunId);
        assertTrue(garbage.rejection.startsWith("INVALID_REQUEST"));
    }

    @Test
    public void anotherModeIsUnsupported() {
        ObjectNode o = valid();
        o.put("mode", "RECONSTRUCT");
        assertEquals("UNSUPPORTED_MODE: RECONSTRUCT", EvaluationRequest.parse(o.toString()).rejection);
        o.remove("mode");
        assertTrue(EvaluationRequest.parse(o.toString()).rejection.startsWith("UNSUPPORTED_MODE"));
    }

    @Test
    public void missingOrBadFieldsAreInvalid() {
        assertInvalid(without("loop_id"), "loop_id");
        assertInvalid(with("window_kind", "60m"), "window_kind");
        assertInvalid(with("to_ms", FROM), "from_ms < to_ms");
        assertInvalid(without("from_ms"), "from_ms < to_ms");
        assertInvalid(with("to_ms", FROM + 25 * 3_600_000L), "24 h");
        assertInvalid(without("requested_at_ms"), "requested_at_ms");
        assertInvalid(with("schema", "cplm.evaluation.request.v9"), "schema");
        assertInvalid(with("bundle_hash", "abc"), "come together");
    }

    @Test
    public void aRequestThatWaitedTooLongExpires() {
        EvaluationRequest r = EvaluationRequest.parse(valid().toString());
        assertNull(r.expiry(AT + 14 * 60_000L, 15 * 60_000L));
        String e = r.expiry(AT + 16 * 60_000L, 15 * 60_000L);
        assertTrue(e, e.startsWith("REQUEST_EXPIRED: requested 960 s ago"));
        assertNull("0 = no limit", r.expiry(AT + 999 * 60_000L, 0));
    }

    @Test
    public void theStatusRecordCarriesEveryField() throws Exception {
        EvaluationRequest r = EvaluationRequest.parse(valid().toString());
        JsonNode ok = M.readTree(EvaluationStatus.json(r, "SUCCEEDED", 8640, 37, Collections.singletonMap("G5", "run-5"), null, 2_300, AT + 3_000));
        for (String f : new String[]{"schema", "analysis_run_id", "loop_id", "state", "window_kind", "window_start_ms", "window_end_ms",
                "samples", "artifacts", "method_run_ids", "error", "elapsed_ms", "at_ms"}) {
            assertTrue("status has " + f, ok.has(f));
        }
        assertEquals("cplm.evaluation.status.v1", ok.path("schema").asText());
        assertEquals(RUN, ok.path("analysis_run_id").asText());
        assertEquals(FROM, ok.path("window_start_ms").asLong());
        assertEquals(TO, ok.path("window_end_ms").asLong());
        assertEquals("run-5", ok.path("method_run_ids").path("G5").asText());
        assertTrue(ok.path("error").isNull());
        JsonNode failed = M.readTree(EvaluationStatus.failed(r, "NO_HISTORIAN_DATA: x", 0, 10, AT));
        assertEquals("FAILED", failed.path("state").asText());
        assertEquals("NO_HISTORIAN_DATA: x", failed.path("error").asText());
        assertTrue(failed.path("method_run_ids").isObject() && failed.path("method_run_ids").size() == 0);
        assertEquals("RUNNING", M.readTree(EvaluationStatus.running(r, AT)).path("state").asText());
    }

    private static void assertInvalid(ObjectNode o, String fragment) {
        String rejection = EvaluationRequest.parse(o.toString()).rejection;
        assertTrue(rejection, rejection != null && rejection.startsWith("INVALID_REQUEST") && rejection.contains(fragment));
    }

    private static ObjectNode without(String f) {
        ObjectNode o = valid();
        o.remove(f);
        return o;
    }

    private static ObjectNode with(String f, Object v) {
        ObjectNode o = valid();
        if (v instanceof Long) o.put(f, (Long) v); else o.put(f, String.valueOf(v));
        return o;
    }
}
