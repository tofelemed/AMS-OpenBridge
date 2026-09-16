package com.ams.flink.cplm.contract;

import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import com.ams.flink.cplm.CplmNormalizedSample;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * v2.5 Task 1A.2 (spec v6 R03 / C02): the samples tuple, schema 1.1. The 1.0 top-level
 * fields keep driving the engine unchanged; the roles{} block carries per-role provenance.
 * A 1.0 message (older ingestion image) is still accepted, with roles synthesised from the
 * top-level fields and labelled LEGACY_TUPLE so nothing downstream mistakes it for real
 * per-role evidence.
 */
public class TupleCodecTest {
    private static final long T0 = 1_756_600_000_000L;

    private static final String V11 = "{"
            + "\"loop_id\":\"FIC10302\",\"event_ts_ms\":" + T0 + ",\"ingest_ts_ms\":" + (T0 + 120)
            + ",\"pv\":101.2,\"sp\":100.0,\"op\":42.1,\"vp\":41.8,\"mode\":\"AUT\",\"quality\":\"GOOD\",\"loop_type\":\"FIC\","
            + "\"site\":\"hdpe\",\"schema_version\":\"1.1\",\"binding_revision\":17,\"grid_seconds\":5,"
            + "\"roles\":{"
            + "\"pv\":{\"value\":101.2,\"sample_ts_ms\":" + T0 + ",\"verified_ts_ms\":" + T0 + ",\"quality_native\":\"192\",\"quality\":\"GOOD\",\"unit\":\"t/h\",\"held\":false,\"age_ms\":0},"
            + "\"sp\":{\"value\":100.0,\"sample_ts_ms\":" + (T0 - 2000) + ",\"verified_ts_ms\":" + (T0 - 2000) + ",\"quality_native\":\"GOOD\",\"quality\":\"GOOD\",\"unit\":\"t/h\",\"held\":true,\"age_ms\":2000},"
            + "\"op\":{\"value\":42.1,\"sample_ts_ms\":" + (T0 - 1000) + ",\"verified_ts_ms\":" + (T0 - 1000) + ",\"quality_native\":\"GOOD\",\"quality\":\"GOOD\",\"unit\":\"pp\",\"held\":false,\"age_ms\":1000},"
            + "\"vp\":{\"value\":41.8,\"sample_ts_ms\":" + (T0 - 93000) + ",\"verified_ts_ms\":" + (T0 - 93000) + ",\"quality_native\":\"BAD\",\"quality\":\"BAD\",\"unit\":\"pp\",\"held\":true,\"age_ms\":93000},"
            + "\"mode\":{\"value\":\"AUT\",\"mode_native\":\"1\",\"sample_ts_ms\":" + (T0 - 3000) + ",\"verified_ts_ms\":" + (T0 - 3000) + ",\"quality_native\":\"GOOD\",\"quality\":\"GOOD\",\"held\":false,\"age_ms\":3000}"
            + "}}";

    private static final String V10 = "{\"loop_id\":\"FIC10302\",\"event_ts_ms\":" + T0
            + ",\"pv\":101.2,\"sp\":100.0,\"op\":42.1,\"vp\":41.8,\"mode\":\"AUT\",\"quality\":\"GOOD\",\"loop_type\":\"FIC\"}";

    @Test
    public void schema11RolesAreParsedPerRole() {
        CplmNormalizedSample s = TupleCodec.fromJson(V11);
        assertTrue(s.isValid);
        assertEquals("1.1", s.schemaVersion);
        assertEquals(17L, s.bindingRevision);
        assertEquals(5, s.gridSeconds);
        // 1.0 fields untouched
        assertEquals(101.2, s.pv, 1e-12);
        assertEquals(T0, s.eventTsMs);

        RoleObservation vp = s.role("vp");
        assertNotNull(vp);
        assertEquals(41.8, vp.value, 1e-12);
        assertEquals(T0 - 93000, vp.sampleTsMs);
        assertEquals(93000L, vp.ageMs);
        assertTrue(vp.held);
        assertEquals("BAD", vp.quality);
        assertEquals("BAD", vp.qualityNative);
        assertEquals("pp", vp.unit);

        RoleObservation mode = s.role("mode");
        assertNotNull(mode);
        assertEquals("AUT", mode.stringValue);
        assertEquals("1", mode.modeNative);
        assertEquals(RoleObservation.SOURCE_ROLES_BLOCK, mode.provenance);
    }

    @Test
    public void schema10IsSynthesisedAndLabelledLegacy() {
        CplmNormalizedSample s = TupleCodec.fromJson(V10);
        assertTrue(s.isValid);
        assertEquals("1.0", s.schemaVersion);
        RoleObservation pv = s.role("pv");
        assertNotNull(pv);
        assertEquals(RoleObservation.SOURCE_LEGACY_TUPLE, pv.provenance);
        assertEquals(T0, pv.sampleTsMs);          // the only time a 1.0 tuple has
        assertEquals(T0, pv.verifiedTsMs);
        assertFalse(pv.held);                      // unknown on 1.0 - never claimed
        assertEquals(0L, pv.ageMs);
        assertEquals("GOOD", pv.quality);
        assertNull(pv.unit);
        assertNotNull(s.role("vp"));
        assertNull(s.role("missing"));
    }

    @Test
    public void heldVpBeyondProfileMaxAgeIsNotEligible() {
        CplmLoopDynamicsProfile profile = CplmLoopDynamicsProfile.resolve("FIC10302", "FIC", null);
        assertEquals(60.0, profile.vpMaxAgeS, 1e-9);               // default: one minute

        CplmNormalizedSample s = TupleCodec.fromJson(V11);           // vp held, 93 s old, BAD
        assertFalse(s.vpEligible(profile));

        CplmNormalizedSample fresh = TupleCodec.fromJson(V11.replace("\"held\":true,\"age_ms\":93000", "\"held\":false,\"age_ms\":0")
                .replace("\"quality_native\":\"BAD\",\"quality\":\"BAD\"", "\"quality_native\":\"GOOD\",\"quality\":\"GOOD\""));
        assertTrue(fresh.vpEligible(profile));

        CplmNormalizedSample legacy = TupleCodec.fromJson(V10);      // 1.0: vp present, age unknown -> eligible as before
        assertTrue(legacy.vpEligible(profile));
    }

    @Test
    public void topicCatalogueNamesTheLiveContracts() {
        assertEquals("traverse.cpa.loop.samples.v1", CplmTopics.LOOP_SAMPLES);
        assertEquals("traverse.cpa.clpm.gate.results.v1", CplmTopics.GATE_RESULTS);
        assertEquals("traverse.cpa.context.parameter-set.v1", CplmTopics.PARAMETER_SET);
    }
}
