package com.ams.sparkplug;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

/**
 * v2.5 Task 1C.1 (spec v6 R20): the live snapshot and the Sparkplug metric carry the
 * source sample time, the last verified time and the emission time separately, so a
 * heartbeat can refresh the snapshot without making an old measurement look new.
 * The edge node's first unit tests: the JSON shape and the quality mapping are pure.
 */
public class LoopMetricSnapshotTest {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final long T0 = 1_756_600_000_000L;

    @Test
    public void snapshotJsonCarriesTheThreeTimestampsAndKeepsTheLegacyFields() throws Exception {
        String json = AlarmMetricPublisher.snapshotJson(42.5, 192, T0, T0, T0 + 1000, T0 + 300_000, "GOOD");
        JsonNode n = MAPPER.readTree(json);
        assertEquals(42.5, n.get("v").asDouble(), 1e-12);
        assertEquals(192, n.get("q").asInt());
        assertEquals(T0, n.get("ts").asLong());                 // legacy field = source time
        assertEquals(T0, n.get("src").asLong());
        assertEquals(T0 + 1000, n.get("ver").asLong());
        assertEquals(T0 + 300_000, n.get("emit").asLong());
        assertEquals("GOOD", n.get("qt").asText());
    }

    @Test
    public void snapshotJsonOmitsTimestampsTheRecordDidNotCarry() throws Exception {
        String json = AlarmMetricPublisher.snapshotJson("AUT", 192, T0, null, null, null, null);
        JsonNode n = MAPPER.readTree(json);
        assertEquals("AUT", n.get("v").asText());
        assertEquals(T0, n.get("ts").asLong());
        assertFalse(n.has("src"));
        assertFalse(n.has("ver"));
        assertFalse(n.has("emit"));
        assertFalse(n.has("qt"));
    }

    @Test
    public void qualityTokensMapToSparkplugCodesWithoutInventingGood() throws Exception {
        assertEquals(192, AlarmMetricPublisher.qualityCode(MAPPER.readTree("\"GOOD\"")));
        assertEquals(64, AlarmMetricPublisher.qualityCode(MAPPER.readTree("\"UNCERTAIN\"")));
        assertEquals(0, AlarmMetricPublisher.qualityCode(MAPPER.readTree("\"BAD\"")));
        assertEquals(0, AlarmMetricPublisher.qualityCode(MAPPER.readTree("\"UNKNOWN\"")));   // not good
        assertEquals(0, AlarmMetricPublisher.qualityCode(MAPPER.readTree("\"goodish\"")));   // not the old startsWith("GOOD")
        assertEquals(0, AlarmMetricPublisher.qualityCode(null));                            // absent is not good
        assertEquals(200, AlarmMetricPublisher.qualityCode(MAPPER.readTree("200")));       // numeric passes through
    }
}
