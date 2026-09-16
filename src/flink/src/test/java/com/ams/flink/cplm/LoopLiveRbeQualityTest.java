package com.ams.flink.cplm;

import com.ams.flink.cplm.LoopLiveRbeJob.MetricPoint;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.Test;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * v2.5 Task 1C.1 (spec v6 R20 / C03; NR-022, NR-023): the live plane must never let a
 * heartbeat masquerade as a fresh measurement, and a quality transition must reach the
 * screen even when the value did not move.
 *
 * <p>The filter's decision and the record shape are pure functions so they can be tested
 * without a Flink harness: {@code shouldEmit}, {@code render}, {@code explode}.
 */
public class LoopLiveRbeQualityTest {
    private static final long T0 = 1_756_600_000_000L;
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    public void qualityChangeEmitsEvenWhenTheValueIsInsideTheDeadband() {
        MetricPoint p = MetricPoint.num("FIC1", "pv", T0 + 5000, 100.01, "BAD");
        assertTrue("same value, GOOD->BAD must emit",
                LoopLiveRbeJob.shouldEmit("100.0", "GOOD", p, 0.05));
        MetricPoint same = MetricPoint.num("FIC1", "pv", T0 + 5000, 100.01, "GOOD");
        assertFalse("same value, same quality stays suppressed",
                LoopLiveRbeJob.shouldEmit("100.0", "GOOD", same, 0.05));
        MetricPoint moved = MetricPoint.num("FIC1", "pv", T0 + 5000, 100.2, "GOOD");
        assertTrue(LoopLiveRbeJob.shouldEmit("100.0", "GOOD", moved, 0.05));
        assertTrue("first observation always emits", LoopLiveRbeJob.shouldEmit(null, null, same, 0.05));
        MetricPoint text = MetricPoint.str("FIC1", "mode", T0, "AUT", "GOOD");
        assertTrue(LoopLiveRbeJob.shouldEmit("MAN", "GOOD", text, 0.05));
        assertFalse(LoopLiveRbeJob.shouldEmit("AUT", "GOOD", text, 0.05));
    }

    @Test
    public void heartbeatKeepsSourceAndVerifiedTimeButAdvancesEmissionTime() throws Exception {
        MetricPoint p = MetricPoint.num("FIC1", "sp", T0, 42.0, "GOOD");
        p.verifiedTs = T0;
        long emission = T0 + 300_000;
        JsonNode hb = MAPPER.readTree(LoopLiveRbeJob.render(MAPPER, p, true, emission));
        assertEquals(T0, hb.get("ts").asLong());                 // 1.0 field: the SOURCE time, unchanged
        assertEquals(T0, hb.get("sourceTs").asLong());
        assertEquals(T0, hb.get("verifiedTs").asLong());
        assertEquals(emission, hb.get("emissionTs").asLong());   // only this one moves on a heartbeat
        assertTrue(hb.get("heartbeat").asBoolean());
        assertEquals("GOOD", hb.get("quality").asText());

        JsonNode fresh = MAPPER.readTree(LoopLiveRbeJob.render(MAPPER, p, false, T0 + 40));
        assertFalse(fresh.has("heartbeat"));
        assertEquals(T0 + 40, fresh.get("emissionTs").asLong());
    }

    @Test
    public void explodeUsesPerRoleSampleTimesAndQualitiesFromTheRolesBlock() {
        String v11 = "{\"loop_id\":\"FIC1\",\"event_ts_ms\":" + T0 + ",\"pv\":101.2,\"sp\":100.0,\"op\":42.1,\"vp\":41.8,"
                + "\"mode\":\"AUT\",\"quality\":\"GOOD\",\"schema_version\":\"1.1\",\"roles\":{"
                + "\"pv\":{\"value\":101.2,\"sample_ts_ms\":" + T0 + ",\"verified_ts_ms\":" + T0 + ",\"quality\":\"GOOD\",\"held\":false,\"age_ms\":0},"
                + "\"sp\":{\"value\":100.0,\"sample_ts_ms\":" + (T0 - 2000) + ",\"verified_ts_ms\":" + (T0 - 1000) + ",\"quality\":\"GOOD\",\"held\":true,\"age_ms\":2000},"
                + "\"op\":{\"value\":42.1,\"sample_ts_ms\":" + (T0 - 1000) + ",\"verified_ts_ms\":" + (T0 - 1000) + ",\"quality\":\"GOOD\",\"held\":false,\"age_ms\":1000},"
                + "\"vp\":{\"value\":41.8,\"sample_ts_ms\":" + (T0 - 93000) + ",\"verified_ts_ms\":" + (T0 - 93000) + ",\"quality\":\"BAD\",\"held\":true,\"age_ms\":93000},"
                + "\"mode\":{\"value\":\"AUT\",\"mode_native\":\"1\",\"sample_ts_ms\":" + (T0 - 3000) + ",\"verified_ts_ms\":" + (T0 - 3000) + ",\"quality\":\"GOOD\",\"held\":false,\"age_ms\":3000}"
                + "}}";
        Map<String, MetricPoint> by = index(LoopLiveRbeJob.explode(CplmNormalizedSample.fromJson(v11)));
        assertEquals(T0, by.get("pv").ts);
        assertEquals(T0 - 93000, by.get("vp").ts);              // the VP's OWN sample time, not the tuple's
        assertEquals(T0 - 93000, by.get("vp").sourceTs);
        assertEquals("BAD", by.get("vp").quality);              // the VP's OWN verdict
        assertEquals(T0 - 2000, by.get("sp").sourceTs);
        assertEquals(T0 - 1000, by.get("sp").verifiedTs);       // verified may be later than sampled
        assertEquals(T0 - 3000, by.get("mode").ts);
        assertEquals("AUT", by.get("mode").text);
        assertEquals("GOOD", by.get("quality").text);           // tuple-level verdict metric
    }

    @Test
    public void explodeOnALegacyTupleUsesTheTupleTimeForEveryRole() {
        String v10 = "{\"loop_id\":\"FIC1\",\"event_ts_ms\":" + T0 + ",\"pv\":1,\"sp\":2,\"op\":3,\"vp\":4,\"mode\":\"AUT\",\"quality\":\"GOOD\"}";
        Map<String, MetricPoint> by = index(LoopLiveRbeJob.explode(CplmNormalizedSample.fromJson(v10)));
        for (String r : new String[] {"pv", "sp", "op", "vp", "mode", "quality"}) {
            assertEquals(r, T0, by.get(r).ts);
            assertEquals(r, T0, by.get(r).sourceTs);
            assertEquals(r, T0, by.get(r).verifiedTs);
            assertEquals(r, "GOOD", by.get(r).quality);
        }
    }

    @Test
    public void absentQualityIsReportedAsUnknownNotGood() {
        String v10 = "{\"loop_id\":\"FIC1\",\"event_ts_ms\":" + T0 + ",\"pv\":1,\"sp\":2,\"op\":3}";
        Map<String, MetricPoint> by = index(LoopLiveRbeJob.explode(CplmNormalizedSample.fromJson(v10)));
        assertEquals("UNKNOWN", by.get("pv").quality);
        assertEquals("UNKNOWN", by.get("quality").text);
    }

    private static Map<String, MetricPoint> index(List<MetricPoint> points) {
        return points.stream().collect(Collectors.toMap(p -> p.metric, p -> p));
    }
}
