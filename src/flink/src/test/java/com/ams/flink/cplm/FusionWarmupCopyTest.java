package com.ams.flink.cplm;

import com.ams.flink.cplm.fusion.FusionSideInput;
import org.apache.flink.api.common.typeinfo.Types;
import org.apache.flink.runtime.state.hashmap.HashMapStateBackend;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.streaming.api.operators.co.KeyedCoProcessOperator;
import org.apache.flink.streaming.runtime.streamrecord.StreamRecord;
import org.apache.flink.streaming.util.KeyedTwoInputStreamOperatorTestHarness;
import org.junit.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * CHG-226: the Gate Fusion job copies {@code warming_up} / {@code coverage_from_ms} from the long result it fuses
 * (as it arrives over the long topic) into the gate result; the verdict itself is unchanged (a refill window is still
 * INSUFFICIENT_DATA, G0 INCOMPLETE). A long row without the fields (an older jar) and the On-Demand Evaluation /
 * Historical Replay path (WindowEvaluation) publish neither field.
 */
public class FusionWarmupCopyTest {
    private static final long HOUR = 3_600_000L;
    private static final long GRID_MS = 120_000L;
    private static final long T0 = Instant.parse("2026-11-13T12:18:20Z").toEpochMilli();
    private static final long END = T0 + 2 * HOUR + 11 * 60_000L + 40_000L;          // 14:30, a 15-min tick
    private static final ObjectMapper M = new ObjectMapper();

    private static List<CplmNormalizedSample> samples(long from, long to) {
        List<CplmNormalizedSample> out = new ArrayList<>();
        int i = 0;
        for (long ts = from; ts < to; ts += GRID_MS, i++) {
            CplmNormalizedSample s = new CplmNormalizedSample();
            s.loopId = "L1";
            s.site = "hdpe";
            s.gridSeconds = (int) (GRID_MS / 1000);
            s.eventTsMs = ts;
            s.ingestTsMs = ts + 300;
            s.sp = 50;
            s.pv = 50 + Math.sin(i * 2 * Math.PI / 15.0) * 4;
            s.op = 40 + Math.sin(i * 2 * Math.PI / 15.0 + 0.8) * 3;
            s.mode = "AUTO";
            s.quality = "GOOD";
            out.add(s);
        }
        return out;
    }

    /** A long result as the Long job publishes it, read back the way the fusion job's source parses it. */
    private static CplmLongDiagnosticsResult longOverTheTopic(String kind, long windowMs, Long coverageFromMs) {
        List<CplmNormalizedSample> s = samples(T0, END);
        CplmLongDiagnosticsResult r = CplmGateEngine.computeLongDiagnostics(s, END - windowMs, END, kind);
        r.alignedShort = CplmGateEngine.computeShortFeatures(s, END - windowMs, END, kind);
        LongBufferCoverage.stamp(r, coverageFromMs);
        return CplmLongDiagnosticsResult.fromJson(r.toJson());
    }

    private static List<CplmGateResult> fuse(CplmLongDiagnosticsResult... longs) throws Exception {
        try (KeyedTwoInputStreamOperatorTestHarness<String, CplmLongDiagnosticsResult, FusionSideInput, CplmGateResult> h =
                     new KeyedTwoInputStreamOperatorTestHarness<>(new KeyedCoProcessOperator<>(new CplmGateFusionStreamJob.GateFusionProcess()),
                             l -> l.loopId, s -> s.loopId(), Types.STRING)) {
            h.setStateBackend(new HashMapStateBackend());
            h.open();
            for (CplmLongDiagnosticsResult l : longs) h.processElement1(new StreamRecord<>(l, l.windowEndMs));
            return new ArrayList<>(h.extractOutputValues());
        }
    }

    @Test
    public void fusionCopiesTheRefillMarkIntoTheGateResult() throws Exception {
        List<CplmGateResult> out = fuse(
                longOverTheTopic("12h", 12 * HOUR, T0),
                longOverTheTopic("24h", 24 * HOUR, T0));
        assertEquals(2, out.size());
        for (CplmGateResult g : out) {
            assertTrue(g.windowKind, g.warmingUp);
            assertEquals(T0, g.coverageFromMs.longValue());
            JsonNode n = M.readTree(g.toJson());
            assertTrue(g.windowKind + " payload says warming_up", n.path("warming_up").asBoolean(false));
            assertEquals(T0, n.path("coverage_from_ms").asLong());
            // the verdict is exactly what it was: not enough data, G0 INCOMPLETE
            assertEquals("INSUFFICIENT_DATA", n.path("diagnosis").asText());
            assertEquals("FAIL", n.path("gate0_status").asText());
            assertEquals("INCOMPLETE", n.path("gate0_reason").asText());
        }
    }

    @Test
    public void aCoveredWindowSaysNotWarmingUp() throws Exception {
        CplmGateResult g = fuse(longOverTheTopic("12h", 12 * HOUR, END - 13 * HOUR)).get(0);
        JsonNode n = M.readTree(g.toJson());
        assertTrue(n.has("warming_up"));
        assertFalse(n.path("warming_up").asBoolean(true));
        assertEquals(END - 13 * HOUR, n.path("coverage_from_ms").asLong());
    }

    @Test
    public void aLongRowWithoutTheFieldsAndEvaluationsPublishNeither() throws Exception {
        CplmGateResult older = fuse(longOverTheTopic("12h", 12 * HOUR, null)).get(0);
        assertNull(older.coverageFromMs);
        String json = older.toJson();
        assertFalse(json.contains("warming_up"));
        assertFalse(json.contains("coverage_from_ms"));

        // the On-Demand Evaluation and Historical Replay jobs fuse through WindowEvaluation: no Long buffer, no fields
        WindowEvaluation ev = WindowEvaluation.evaluate(samples(T0, END), END - 12 * HOUR, END, "12h", false, false, null, null);
        String evaluated = ev.fused.toJson();
        assertFalse(evaluated.contains("warming_up"));
        assertFalse(evaluated.contains("coverage_from_ms"));
        assertFalse(ev.longDiagnostics.toJson().contains("warming_up"));
    }
}
