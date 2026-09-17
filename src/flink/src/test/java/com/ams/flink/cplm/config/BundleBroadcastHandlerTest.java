package com.ams.flink.cplm.config;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.Before;
import org.junit.Test;

import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * v2.5 Task 3C.1 (spec v6 §5.6, R17; NR-048, NR-050, NR-052, NR-055): a worker acknowledges only a
 * signed, valid, complete bundle; every refusal names its reason; nothing is swallowed.
 */
public class BundleBroadcastHandlerTest {
    private static final String SITE = "MARUN";
    private static final String CAT = PropertyCatalogue.current().catalogueHash();
    private TestBundles.MapBroadcastState state;

    @Before
    public void reset() {
        state = new TestBundles.MapBroadcastState();
        ConfigRejections.reset();
    }

    private static JsonNode only(List<String> records) throws Exception {
        assertEquals(1, records.size());
        return TestBundles.M.readTree(records.get(0));
    }

    private static ObjectNode loopBundle(ObjectNode loopContent, String changeClass) {
        return TestBundles.bundle(SITE, "LOOP", "FIC-101", "FLOW_FAST_SELF_REG", changeClass,
                TestBundles.layers(SITE, "LOOP", "FLOW_FAST_SELF_REG", null, null, loopContent), CAT);
    }

    @Test
    public void prepareOfASignedValidBundleIsAcknowledgedAndStored() throws Exception {
        ObjectNode b = loopBundle(TestBundles.content("G4.activity_warn_ratio", 4.5), "POLICY");
        JsonNode ack = only(BundleBroadcastHandler.handle(TestBundles.message(b, "PREPARE", "dep-1", 0L, TestBundles.KEY), state, TestBundles.SHORT, TestBundles.KEY));
        assertEquals("ACK", ack.get("record_kind").asText());
        assertEquals("PREPARE", ack.get("phase").asText());
        assertEquals("dep-1", ack.get("deployment_id").asText());
        assertEquals(b.get("hash").asText(), ack.get("bundle_hash").asText());
        assertEquals(b.get("bundle_id").asText(), ack.get("bundle_id").asText());
        assertEquals(PropertyReaders.SHORT, ack.get("job_name").asText());
        assertEquals("jar-A", ack.get("jar_sha256").asText());
        assertEquals("job-1/p1/cp0", ack.get("topology_generation").asText());
        assertTrue(state.contains(BundleBroadcastHandler.KEY_PREPARED + b.get("hash").asText()));
        assertEquals(0, ConfigRejections.total());
    }

    @Test
    public void anUnsignedOrForeignSignatureIsRefusedBeforeAnythingElse() throws Exception {
        ObjectNode b = loopBundle(TestBundles.content("G4.activity_warn_ratio", 4.5), "POLICY");
        JsonNode nack = only(BundleBroadcastHandler.handle(TestBundles.message(b, "PREPARE", "dep-1", 0L, "someone-elses-key"), state, TestBundles.SHORT, TestBundles.KEY));
        assertEquals("NACK", nack.get("record_kind").asText());
        assertTrue(nack.get("reason").asText(), nack.get("reason").asText().startsWith("UNSIGNED"));
        assertFalse(state.contains(BundleBroadcastHandler.KEY_PREPARED + b.get("hash").asText()));

        JsonNode noKey = only(BundleBroadcastHandler.handle(TestBundles.message(b, "PREPARE", "dep-1", 0L, TestBundles.KEY), state, TestBundles.SHORT, ""));
        assertTrue(noKey.get("reason").asText().startsWith("UNSIGNED"));
        assertEquals(2, ConfigRejections.total("UNSIGNED"));
    }

    @Test
    public void anUnknownPropertyIsRefusedByName() throws Exception {
        ObjectNode b = loopBundle(TestBundles.content("G4.activity_warn_ratioX", 4.5), "POLICY");
        JsonNode nack = only(BundleBroadcastHandler.handle(TestBundles.message(b, "PREPARE", "dep-2", 0L, TestBundles.KEY), state, TestBundles.SHORT, TestBundles.KEY));
        assertEquals("NACK", nack.get("record_kind").asText());
        assertTrue(nack.get("reason").asText(), nack.get("reason").asText().contains("G4.activity_warn_ratioX"));
        assertTrue(nack.get("reason").asText().contains("UNKNOWN_PROPERTY"));
    }

    @Test
    public void outOfBoundsWrongTypeAndForeignCatalogueAreRefusedByName() throws Exception {
        ObjectNode bad = loopBundle(TestBundles.content("G4.activity_warn_ratio", -1.0, "G5.min_complete_cycles", "five"), "POLICY");
        String reason = only(BundleBroadcastHandler.handle(TestBundles.message(bad, "PREPARE", "dep-3", 0L, TestBundles.KEY), state, TestBundles.SHORT, TestBundles.KEY)).get("reason").asText();
        assertTrue(reason, reason.contains("OUT_OF_BOUNDS: 'G4.activity_warn_ratio'"));
        assertTrue(reason, reason.contains("TYPE: 'G5.min_complete_cycles'"));

        ObjectNode foreign = TestBundles.bundle(SITE, "LOOP", "FIC-101", "FLOW_FAST_SELF_REG", "POLICY",
                TestBundles.layers(SITE, "LOOP", "FLOW_FAST_SELF_REG", null, null, TestBundles.content("G4.activity_warn_ratio", 4.5)), "0000stale");
        String r2 = only(BundleBroadcastHandler.handle(TestBundles.message(foreign, "PREPARE", "dep-4", 0L, TestBundles.KEY), state, TestBundles.SHORT, TestBundles.KEY)).get("reason").asText();
        assertTrue(r2, r2.startsWith("CATALOGUE_MISMATCH"));
    }

    @Test
    public void aTamperedBundleFailsItsOwnHash() throws Exception {
        ObjectNode b = loopBundle(TestBundles.content("G4.activity_warn_ratio", 4.5), "POLICY");
        ((ObjectNode) b.get("resolved").get("properties")).put("G4.activity_warn_ratio", 9.0);   // edited after hashing; re-signed by a key holder
        String reason = only(BundleBroadcastHandler.handle(TestBundles.message(b, "PREPARE", "dep-5", 0L, TestBundles.KEY), state, TestBundles.SHORT, TestBundles.KEY)).get("reason").asText();
        assertTrue(reason, reason.contains("HASH_MISMATCH"));
    }

    @Test
    public void regimeScopeAndDeploymentClassAndAnUncompiledPlanNeedADeployment() throws Exception {
        ObjectNode regime = TestBundles.bundle(SITE, "REGIME", "FIC-101@startup", "FLOW_FAST_SELF_REG", "POLICY",
                TestBundles.layers(SITE, "REGIME", "FLOW_FAST_SELF_REG", null, null, null), CAT);
        String r1 = only(BundleBroadcastHandler.handle(TestBundles.message(regime, "PREPARE", "dep-6", 0L, TestBundles.KEY), state, TestBundles.SHORT, TestBundles.KEY)).get("reason").asText();
        assertTrue(r1, r1.contains("DEPLOYMENT_REQUIRED: REGIME"));

        ObjectNode deployment = loopBundle(TestBundles.content("G4.activity_warn_ratio", 4.5), "DEPLOYMENT");
        String r2 = only(BundleBroadcastHandler.handle(TestBundles.message(deployment, "PREPARE", "dep-7", 0L, TestBundles.KEY), state, TestBundles.SHORT, TestBundles.KEY)).get("reason").asText();
        assertTrue(r2, r2.contains("DEPLOYMENT_REQUIRED: a DEPLOYMENT-class change"));

        ObjectNode plan30h = loopBundle(TestBundles.content("G4.activity_warn_ratio", 4.5), "POLICY");
        ObjectNode h = ((ObjectNode) plan30h.get("resolved").get("execution_plan")).withArray("horizons").addObject();
        h.put("horizon_id", "long_30h");
        h.put("tier", "long");
        h.put("duration_s", 108000.0);
        h.put("slide_s", 900.0);
        ObjectNode hashInput = TestBundles.M.createObjectNode();
        hashInput.set("layers", plan30h.get("layers"));
        hashInput.set("resolved", plan30h.get("resolved"));
        plan30h.put("hash", CanonicalJson.sha256(hashInput));
        String r3 = only(BundleBroadcastHandler.handle(TestBundles.message(plan30h, "PREPARE", "dep-8", 0L, TestBundles.KEY), state, TestBundles.SHORT, TestBundles.KEY)).get("reason").asText();
        assertTrue(r3, r3.contains("DEPLOYMENT_REQUIRED: horizon 'long_30h'"));
        assertEquals(3, ConfigRejections.total("REJECTED"));
    }

    @Test
    public void applyNeedsAPrepareAndAStateBoundaryOpensANewEpoch() throws Exception {
        ObjectNode b = loopBundle(TestBundles.content("G4.activity_warn_ratio", 4.5), "POLICY");
        JsonNode notPrepared = only(BundleBroadcastHandler.handle(TestBundles.message(b, "APPLY", "dep-9", 1_000L, TestBundles.KEY), state, TestBundles.SHORT, TestBundles.KEY));
        assertEquals("NACK", notPrepared.get("record_kind").asText());
        assertTrue(notPrepared.get("reason").asText().startsWith("NOT_PREPARED"));

        BundleBroadcastHandler.handle(TestBundles.message(b, "PREPARE", "dep-9", 1_000L, TestBundles.KEY), state, TestBundles.SHORT, TestBundles.KEY);
        JsonNode applied = only(BundleBroadcastHandler.handle(TestBundles.message(b, "APPLY", "dep-9", 1_000L, TestBundles.KEY), state, TestBundles.SHORT, TestBundles.KEY));
        assertEquals("ACK", applied.get("record_kind").asText());
        assertEquals("APPLY", applied.get("phase").asText());
        JsonNode active = TestBundles.M.readTree(state.get(BundleBroadcastHandler.KEY_ACTIVE + "LOOP:" + SITE + "/FIC-101"));
        assertEquals(1, active.size());
        assertEquals(1_000L, active.get(0).get("effective_from_ms").asLong());
        assertEquals(0, active.get(0).get("epoch").asInt());
        assertEquals(0, BundleBroadcastHandler.currentEpoch(state));

        // NR-053: a STATE_BOUNDARY change allocates a new epoch (keyed state before it is warm-up, never mixed)
        ObjectNode boundary = loopBundle(TestBundles.content("G2.stability_band_span_fraction", 0.02), "STATE_BOUNDARY");
        BundleBroadcastHandler.handle(TestBundles.message(boundary, "PREPARE", "dep-10", 5_000L, TestBundles.KEY), state, TestBundles.SHORT, TestBundles.KEY);
        BundleBroadcastHandler.handle(TestBundles.message(boundary, "APPLY", "dep-10", 5_000L, TestBundles.KEY), state, TestBundles.SHORT, TestBundles.KEY);
        assertEquals(1, BundleBroadcastHandler.currentEpoch(state));
        active = TestBundles.M.readTree(state.get(BundleBroadcastHandler.KEY_ACTIVE + "LOOP:" + SITE + "/FIC-101"));
        assertEquals(2, active.size());
        assertEquals(1, active.get(1).get("epoch").asInt());
        assertEquals("STATE_BOUNDARY", active.get(1).get("change_class").asText());
    }

    @Test
    public void garbageIsANackWithAReasonAndACount() throws Exception {
        JsonNode nack = only(BundleBroadcastHandler.handle("{not json", state, TestBundles.SHORT, TestBundles.KEY));
        assertEquals("NACK", nack.get("record_kind").asText());
        assertTrue(nack.get("reason").asText().startsWith("PARSE_ERROR"));
        assertEquals(1, ConfigRejections.total("PARSE_ERROR"));
        // a record of another kind on the same broadcast is simply not a bundle
        assertTrue(BundleBroadcastHandler.handle("{\"calcInstanceId\":\"FIC-101\",\"parameters\":[]}", state, TestBundles.SHORT, TestBundles.KEY).isEmpty());
    }
}
