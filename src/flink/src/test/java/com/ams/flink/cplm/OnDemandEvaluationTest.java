package com.ams.flink.cplm;

import com.ams.flink.cplm.ondemand.EvaluationSources;
import com.ams.flink.cplm.ondemand.OnDemandEvaluationFunction;
import com.ams.flink.cplm.ondemand.OnDemandEvaluator;
import com.ams.flink.cplm.replay.IotDbLoopReader;
import org.apache.flink.api.common.typeinfo.Types;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.flink.streaming.api.operators.KeyedProcessOperator;
import org.apache.flink.streaming.runtime.streamrecord.StreamRecord;
import org.apache.flink.streaming.util.KeyedOneInputStreamOperatorTestHarness;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * CHG-102 5c: the always-running on-demand evaluation answers a request with the same verdict and method run ids a
 * bounded replay of that window computes, the whole evidence set (short + long + fusion) under its analysis run, and a
 * RUNNING -> SUCCEEDED / FAILED status; every refusal is named and costs no historian read.
 */
public class OnDemandEvaluationTest {
    private static final ObjectMapper M = new ObjectMapper();
    private static final String RUN = "4f7b8a62-3d2c-4c1e-9a0b-1f2e3d4c5b6a";
    private static final long FROM = SynTic001ReferenceGenerator.windowStartMs();
    private static final long TO = SynTic001ReferenceGenerator.windowEndMs();
    private static final long NOW = TO + 60_000L;
    private static final String DEVICE = "root.hdpe.cpm.SYN_TIC_001";

    private static ObjectNode request() {
        ObjectNode o = M.createObjectNode();
        o.put("schema", "cplm.evaluation.request.v1");
        o.put("analysis_run_id", RUN);
        o.put("mode", "EVALUATE");
        o.put("loop_id", "SYN_TIC_001");
        o.put("site", "hdpe");
        o.put("window_kind", "24h");
        o.put("from_ms", FROM);
        o.put("to_ms", TO);
        o.put("iotdb_device", DEVICE);
        o.put("has_step_test", false);
        o.put("has_peer_links", false);
        o.put("requested_at_ms", NOW - 5_000L);
        return o;
    }

    @Test
    public void anEvaluationMatchesTheReplayAndCarriesTheWholeSet() throws Exception {
        List<CplmNormalizedSample> samples = SynTic001ReferenceGenerator.generate();
        com.ams.flink.cplm.ondemand.EvaluationRequest r = com.ams.flink.cplm.ondemand.EvaluationRequest.parse(request().toString());
        OnDemandEvaluator.Outcome o = OnDemandEvaluator.evaluate(r, samples,
                CplmParameterUpdateReader.lookupFrom(Collections.emptyList()), 12, DEVICE, NOW);
        CplmGateResult replay = CplmHistoricalReplayJob.computeWindow(SynTic001ReferenceGenerator.generate(), FROM, TO, false, false,
                CplmParameterUpdateReader.lookupFrom(Collections.emptyList()), null);
        assertEquals("the method run ids a replay of the same window computes", replay.methodRunIds, o.methodRunIds);
        assertEquals(17, o.methodRunIds.size());

        JsonNode result = M.readTree(o.resultJson);
        assertEquals("EVALUATE", result.path("purpose").asText());
        assertEquals(RUN, result.path("analysis_run_id").asText());
        assertEquals(RUN, result.path("replay_id").asText());
        assertEquals("flink-on-demand-evaluation", result.path("calculation_source").asText());
        assertEquals("iotdb:" + DEVICE, result.path("replay_input_topic").asText());
        assertTrue(result.path("observability_flags").toString().contains("HISTORIAN_QUALITY_ASSUMED"));
        JsonNode replayJson = M.readTree(replay.toJson());
        assertEquals("same verdict as the replay", replayJson.path("diagnosis").asText(), result.path("diagnosis").asText());

        Set<String> gates = new HashSet<>();
        int manifests = 0;
        for (String rec : o.evidenceRecords) {
            JsonNode n = M.readTree(rec);
            if (!"EVIDENCE_MANIFEST".equals(n.path("record_kind").asText())) continue;
            manifests++;
            gates.add(n.path("gate_id").asText());
            JsonNode p = n.path("provenance");
            assertEquals("EVALUATE", p.path("purpose").asText());
            assertEquals(RUN, p.path("analysis_run_id").asText());
            assertEquals("24h", p.path("evaluation_window_kind").asText());
            assertTrue("artifact attaches to a method run of this verdict", o.methodRunIds.containsValue(n.path("method_run_id").asText()));
        }
        assertEquals(o.artifacts, manifests);
        assertTrue("short tier: " + gates, gates.stream().anyMatch(g -> g.matches("G[0-4]r?")));
        assertTrue("long tier: " + gates, gates.stream().anyMatch(g -> g.matches("G(5|6|7|8|9|10|11)")));
        assertTrue("fusion tier: " + gates, gates.contains("G14") || gates.contains("G15"));
    }

    private static List<JsonNode> statuses(KeyedOneInputStreamOperatorTestHarness<String, String, String> h) throws Exception {
        List<JsonNode> out = new ArrayList<>();
        for (Object e : h.getOutput()) if (e instanceof StreamRecord) out.add(M.readTree((String) ((StreamRecord<?>) e).getValue()));
        return out;
    }

    private static KeyedOneInputStreamOperatorTestHarness<String, String, String> harness(EvaluationSources.Historian historian) throws Exception {
        OnDemandEvaluationFunction fn = new OnDemandEvaluationFunction(historian, Collections::emptyList,
                new OnDemandEvaluationFunction.Settings("root.site1.cpm", 15 * 60_000L, 5 * 60_000L, 200_000L, 12), () -> NOW);
        KeyedOneInputStreamOperatorTestHarness<String, String, String> h = new KeyedOneInputStreamOperatorTestHarness<>(
                new KeyedProcessOperator<>(fn), OnDemandEvaluationFunction::keyOf, Types.STRING);
        h.open();
        return h;
    }

    @Test
    public void theOperatorAnswersRunningThenSucceeded() throws Exception {
        AtomicInteger reads = new AtomicInteger();
        EvaluationSources.Historian historian = (device, loop, type, from, to, max) -> {
            reads.incrementAndGet();
            assertEquals(DEVICE, device);
            return SynTic001ReferenceGenerator.generate();
        };
        try (KeyedOneInputStreamOperatorTestHarness<String, String, String> h = harness(historian)) {
            h.processElement(new StreamRecord<>(request().toString()));
            List<JsonNode> s = statuses(h);
            assertEquals(2, s.size());
            assertEquals("RUNNING", s.get(0).path("state").asText());
            JsonNode done = s.get(1);
            assertEquals("SUCCEEDED", done.path("state").asText());
            assertEquals(17_280, done.path("samples").asInt());
            assertTrue(done.path("artifacts").asInt() > 0);
            assertEquals(17, done.path("method_run_ids").size());
            assertEquals(1, h.getSideOutput(OnDemandEvaluationFunction.RESULTS).size());
            assertFalse(h.getSideOutput(OnDemandEvaluationFunction.EVIDENCE).isEmpty());
            assertEquals(1, reads.get());
        }
    }

    private static JsonNode failure(EvaluationSources.Historian historian, ObjectNode req) throws Exception {
        try (KeyedOneInputStreamOperatorTestHarness<String, String, String> h = harness(historian)) {
            h.processElement(new StreamRecord<>(req.toString()));
            List<JsonNode> s = statuses(h);
            JsonNode last = s.get(s.size() - 1);
            assertEquals("FAILED", last.path("state").asText());
            assertTrue(h.getSideOutput(OnDemandEvaluationFunction.RESULTS) == null || h.getSideOutput(OnDemandEvaluationFunction.RESULTS).isEmpty());
            assertTrue(h.getSideOutput(OnDemandEvaluationFunction.EVIDENCE) == null || h.getSideOutput(OnDemandEvaluationFunction.EVIDENCE).isEmpty());
            return last;
        }
    }

    @Test
    public void everyFailureIsNamed() throws Exception {
        EvaluationSources.Historian never = (d, l, t, f, to, m) -> { throw new AssertionError("no historian read for a refused request"); };
        ObjectNode old = request();
        old.put("requested_at_ms", NOW - 16 * 60_000L);
        assertTrue(failure(never, old).path("error").asText().startsWith("REQUEST_EXPIRED"));
        ObjectNode mode = request();
        mode.put("mode", "SHADOW");
        assertEquals("UNSUPPORTED_MODE: SHADOW", failure(never, mode).path("error").asText());

        String empty = failure((d, l, t, f, to, m) -> new ArrayList<>(), request()).path("error").asText();
        assertTrue(empty, empty.startsWith("NO_HISTORIAN_DATA") && empty.contains(DEVICE));
        String down = failure((d, l, t, f, to, m) -> { throw new java.io.IOException("connection refused"); }, request()).path("error").asText();
        assertEquals("HISTORIAN_UNAVAILABLE: connection refused", down);
        String tooMany = failure((d, l, t, f, to, m) -> { throw new IotDbLoopReader.TooManyRowsException(m, d); }, request())
                .path("error").asText();
        assertTrue(tooMany, tooMany.startsWith("TOO_MANY_ROWS"));
    }

    @Test
    public void aRequestWithoutARunIdIsDroppedAndTheDeviceDefaultsToThePrefix() throws Exception {
        ObjectNode req = request();
        req.remove("analysis_run_id");
        try (KeyedOneInputStreamOperatorTestHarness<String, String, String> h = harness((d, l, t, f, to, m) -> { throw new AssertionError(); })) {
            h.processElement(new StreamRecord<>(req.toString()));
            assertTrue(statuses(h).isEmpty());
        }
        ObjectNode noDevice = request();
        noDevice.putNull("iotdb_device");
        String error = failure((d, l, t, f, to, m) -> { assertEquals("root.site1.cpm.SYN_TIC_001", d); return new ArrayList<>(); }, noDevice)
                .path("error").asText();
        assertTrue(error, error.contains("root.site1.cpm.SYN_TIC_001"));
    }
}
