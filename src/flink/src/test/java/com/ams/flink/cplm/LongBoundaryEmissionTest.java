package com.ams.flink.cplm;

import com.ams.flink.cplm.evidence.EvidencePolicy;
import com.ams.flink.cplm.evidence.PlantClock;
import org.apache.flink.api.common.typeinfo.Types;
import org.apache.flink.runtime.state.hashmap.HashMapStateBackend;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.streaming.api.operators.KeyedProcessOperator;
import org.apache.flink.streaming.api.watermark.Watermark;
import org.apache.flink.streaming.runtime.streamrecord.StreamRecord;
import org.apache.flink.streaming.util.KeyedOneInputStreamOperatorTestHarness;
import org.junit.Test;

import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * CHG-102 phase 5a: in the real Long process function, a plant-boundary tick emits its 12h and 24h evidence
 * even though the 60-min throttle would hold it (the previous emission was 45 min earlier), stamps it
 * BOUNDARY, and leaves the throttled 4h window silent.
 */
public class LongBoundaryEmissionTest {
    private static final long MIN = 60_000L;
    private static final long MIDNIGHT = Instant.parse("2026-11-03T00:00:00Z").toEpochMilli();
    private static final ObjectMapper M = new ObjectMapper();

    private static CplmNormalizedSample sample(long ts, int i) {
        CplmNormalizedSample s = new CplmNormalizedSample();
        s.loopId = "L1";
        s.site = "hdpe";
        s.gridSeconds = 10;
        s.eventTsMs = ts;
        s.ingestTsMs = ts + 300;
        s.sp = 50;
        s.pv = 50 + Math.sin(i * 2 * Math.PI / 12.0) * 4;   // a 2-min oscillation: long-tier gates have something to show
        s.op = 40 + Math.sin(i * 2 * Math.PI / 12.0 + 0.8) * 3;
        s.mode = "AUTO";
        s.quality = "GOOD";
        return s;
    }

    /** emitted_at (min after 22:00) -> window kinds, separately for FINDING and BOUNDARY manifests. */
    private static Map<String, Map<Long, Set<String>>> run(EvidencePolicy policy) throws Exception {
        CplmLongDiagnosticsStreamJob.LongDiagnosticsProcessFunction fn = new CplmLongDiagnosticsStreamJob.LongDiagnosticsProcessFunction(policy);
        Map<String, Map<Long, Set<String>>> out = new TreeMap<>();
        try (KeyedOneInputStreamOperatorTestHarness<String, CplmNormalizedSample, CplmLongDiagnosticsResult> h =
                     new KeyedOneInputStreamOperatorTestHarness<>(new KeyedProcessOperator<>(fn), x -> x.loopId, Types.STRING)) {
            h.setStateBackend(new HashMapStateBackend());
            h.open();
            long start = MIDNIGHT - 120 * MIN;
            int i = 0;
            for (long ts = start; ts <= MIDNIGHT + MIN; ts += 10_000L, i++) {
                h.processElement(new StreamRecord<>(sample(ts, i), ts));
                h.processWatermark(new Watermark(ts - 1));
            }
            for (StreamRecord<String> e : h.getSideOutput(CplmLongDiagnosticsStreamJob.LongDiagnosticsProcessFunction.EVIDENCE)) {
                JsonNode n = M.readTree(e.getValue());
                if (!"EVIDENCE_MANIFEST".equals(n.path("record_kind").asText())) continue;
                JsonNode p = n.path("provenance");
                long minute = (n.path("emitted_at_ms").asLong() - start) / MIN;
                out.computeIfAbsent(p.path("emission_reason").asText(), k -> new TreeMap<>())
                        .computeIfAbsent(minute, k -> new TreeSet<>()).add(p.path("window_kind").asText());
                if ("BOUNDARY".equals(p.path("emission_reason").asText())) {
                    assertEquals(p.path("window_kind").asText(), p.path("boundary_kind").asText());
                    assertEquals("Z", p.path("plant_tz").asText());
                    assertEquals("2026-11-03T00:00:00Z", p.path("boundary_local_end").asText());
                    assertEquals(36, p.path("boundary_set_id").asText().length());
                }
            }
        }
        return out;
    }

    @Test
    public void boundaryTickEmitsWhileThrottled() throws Exception {
        Map<String, Map<Long, Set<String>>> out = run(new EvidencePolicy(EvidencePolicy.Mode.ALL, 12, 60 * MIN,
                PlantClock.parse("UTC"), EvidencePolicy.parseKinds("12h,24h")));
        Map<Long, Set<String>> finding = out.get("FINDING");
        Map<Long, Set<String>> boundary = out.get("BOUNDARY");
        // ticks every 15 min from 22:15; findings at 22:15 and 23:15 (the 60-min throttle holds the rest)
        assertEquals(new TreeSet<>(java.util.Arrays.asList(15L, 75L)), finding.keySet());
        assertEquals(new TreeSet<>(java.util.Arrays.asList("4h", "12h", "24h")), finding.get(15L));
        // 00:00 is 45 min after 23:15: 4h stays throttled, 12h and 24h emit as the boundary record
        assertEquals(1, boundary.size());
        assertEquals(new TreeSet<>(java.util.Arrays.asList("12h", "24h")), boundary.get(120L));
        assertFalse(finding.containsKey(120L));
    }

    @Test
    public void boundaryOffMeansThrottleOnly() throws Exception {
        Map<String, Map<Long, Set<String>>> out = run(new EvidencePolicy(EvidencePolicy.Mode.ALL, 12, 60 * MIN,
                PlantClock.parse("UTC"), EvidencePolicy.parseKinds("")));
        assertFalse(out.containsKey("BOUNDARY"));
        assertTrue(out.get("FINDING").keySet().equals(new TreeSet<>(java.util.Arrays.asList(15L, 75L))));
    }
}
