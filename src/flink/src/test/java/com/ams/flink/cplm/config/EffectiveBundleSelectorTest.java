package com.ams.flink.cplm.config;

import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import com.ams.flink.cplm.identity.ProfileHash;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.Before;
import org.junit.Test;

import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * v2.5 Task 3C.1 (spec v6 §5.4-5.6; NR-047, NR-052, NR-053): one bundle per loop per decision time -
 * LOOP over PROFILE over SITE, by effective time within a scope, two loops never share an override,
 * the same state selects the same hash after a restore.
 */
public class EffectiveBundleSelectorTest {
    private static final String SITE = "MARUN";
    private static final String CAT = PropertyCatalogue.current().catalogueHash();
    private TestBundles.MapBroadcastState state;
    private final Map<String, GateConfigBundle> parsed = new HashMap<>();

    @Before
    public void reset() {
        state = new TestBundles.MapBroadcastState();
        parsed.clear();
        ConfigRejections.reset();
    }

    private ObjectNode activate(String scopeKind, String ref, String changeClass, ObjectNode siteContent, ObjectNode profileOverride, ObjectNode loopContent, long effectiveFromMs, String dep) throws Exception {
        ObjectNode b = TestBundles.bundle(SITE, scopeKind, ref, "FLOW_FAST_SELF_REG", changeClass,
                TestBundles.layers(SITE, scopeKind, "FLOW_FAST_SELF_REG", siteContent, profileOverride, loopContent), CAT);
        assertEquals("ACK", TestBundles.M.readTree(BundleBroadcastHandler.handle(TestBundles.message(b, "PREPARE", dep, effectiveFromMs, TestBundles.KEY), state, TestBundles.SHORT, TestBundles.KEY).get(0)).get("record_kind").asText());
        assertEquals("ACK", TestBundles.M.readTree(BundleBroadcastHandler.handle(TestBundles.message(b, "APPLY", dep, effectiveFromMs, TestBundles.KEY), state, TestBundles.SHORT, TestBundles.KEY).get(0)).get("record_kind").asText());
        return b;
    }

    private EffectiveBundleSelector.Selected select(String loopId, long at) throws Exception {
        return EffectiveBundleSelector.select(state, SITE, loopId, "FLOW_FAST_SELF_REG", at, parsed);
    }

    @Test
    public void noActiveBundleMeansThePackGovernsUnderItsProfileHash() throws Exception {
        assertNull(select("FIC-101", 10_000L).bundle);
        assertEquals(Long.MAX_VALUE, select("FIC-101", 10_000L).validUntilMs);
        CplmLoopDynamicsProfile p = CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.FIC);
        assertTrue(ProfileHash.of(p).startsWith(ProfileHash.PREFIX));
    }

    @Test
    public void loopBeatsProfileBeatsSiteRegardlessOfAge() throws Exception {
        ObjectNode site = activate("SITE", SITE, "POLICY", TestBundles.content("G4.activity_warn_ratio", 5.0), null, null, 3_000L, "d-site");
        ObjectNode profile = activate("PROFILE", "FLOW_FAST_SELF_REG", "POLICY", null, TestBundles.content("G4.activity_warn_ratio", 6.0), null, 2_000L, "d-profile");
        ObjectNode loop = activate("LOOP", "FIC-101", "POLICY", null, null, TestBundles.content("G4.activity_warn_ratio", 7.0), 1_000L, "d-loop");

        assertEquals(loop.get("hash").asText(), select("FIC-101", 10_000L).bundle.hash);
        assertEquals(profile.get("hash").asText(), select("FIC-102", 10_000L).bundle.hash);      // NR-047: another loop never sees FIC-101's override
        assertEquals(site.get("hash").asText(), EffectiveBundleSelector.select(state, SITE, "TIC-1", "TEMP_SLOW_SELF_REG", 10_000L, parsed).bundle.hash);
        assertNull(EffectiveBundleSelector.select(state, "OTHER_SITE", "FIC-101", "FLOW_FAST_SELF_REG", 10_000L, parsed).bundle);
    }

    @Test
    public void withinAScopeTheEffectiveTimeDecidesAndNothingIsMixed() throws Exception {
        ObjectNode first = activate("LOOP", "FIC-101", "POLICY", null, null, TestBundles.content("G4.activity_warn_ratio", 4.0), 1_000L, "d-1");
        ObjectNode second = activate("LOOP", "FIC-101", "POLICY", null, null, TestBundles.content("G4.activity_warn_ratio", 4.5), 60_000L, "d-2");

        assertNull(select("FIC-101", 500L).bundle);
        assertEquals("the selection holds until the first bundle becomes effective", 1_000L, select("FIC-101", 500L).validUntilMs);
        EffectiveBundleSelector.Selected before = select("FIC-101", 59_999L);
        assertEquals(first.get("hash").asText(), before.bundle.hash);
        assertEquals(60_000L, before.validUntilMs);                                          // the selection holds until the next effective time
        EffectiveBundleSelector.Selected after = select("FIC-101", 60_000L);
        assertEquals(second.get("hash").asText(), after.bundle.hash);
        assertEquals(Long.MAX_VALUE, after.validUntilMs);

        CplmLoopDynamicsProfile p = CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.FIC);
        EffectiveBundleSelector.apply(p, after);
        assertEquals(4.5, p.g4ActivityWarnRatio, 0.0);
        assertEquals(second.get("hash").asText(), p.bundleHash);
        assertEquals(second.get("hash").asText(), ProfileHash.of(p));
        assertEquals(60_000L, p.bundleEffectiveFromMs);
        assertEquals("POLICY", p.bundleChangeClass);
    }

    @Test
    public void applyOverlaysOnlyTheLayersAndKeepsThePackWhereReset() throws Exception {
        CplmLoopDynamicsProfile pack = CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.FIC);
        ObjectNode loopContent = TestBundles.content("G4.activity_warn_ratio", 4.5, "G5.period_min_s", GateConfigBundle.RESET_TO_INHERITED,
                "G12.noise_multiplier", 5.0, "G0.mode", "OBSERVE_ONLY");
        ObjectNode b = activate("LOOP", "FIC-101", "POLICY", TestBundles.content("G10.limit_dwell_warn_s", 30.0, "G13.lag_max_s", 900.0), null, loopContent, 0L, "d-3");
        EffectiveBundleSelector.Selected s = select("FIC-101", 1L);
        assertEquals(b.get("hash").asText(), s.bundle.hash);
        CplmLoopDynamicsProfile p = pack.copy();
        EffectiveBundleSelector.apply(p, s);
        assertEquals(4.5, p.g4ActivityWarnRatio, 0.0);
        assertEquals(30.0, p.limitDwellWarnS, 0.0);                               // the SITE layer (the profile layer has no value for it)
        assertEquals(pack.g13LagMaxS, p.g13LagMaxS, 0.0);                         // the PROFILE layer overrides the SITE layer (FACTORY < SITE < PROFILE < LOOP)
        assertEquals(pack.tauMinS, p.tauMinS, 0.0);                               // RESET_TO_INHERITED: the pack value stands
        assertEquals(pack.tauMaxS, p.tauMaxS, 0.0);
        assertNotNull(p.bundleResponseValues);
        assertEquals(5.0, p.bundleResponseValues.get("G12.noise_multiplier"), 0.0);   // for the response job
        // G0.mode is a catalogue property this build declares unsupported: accepted, stated, not applied
        assertTrue(PropertyReaders.unsupportedInBuild().containsKey("G0.mode"));
    }

    @Test
    public void stateBoundaryEpochAndRestoreParity() throws Exception {
        activate("LOOP", "FIC-101", "POLICY", null, null, TestBundles.content("G4.activity_warn_ratio", 4.0), 1_000L, "d-1");
        ObjectNode boundary = activate("LOOP", "FIC-101", "STATE_BOUNDARY", null, null, TestBundles.content("G2.stability_band_span_fraction", 0.02), 50_000L, "d-2");
        EffectiveBundleSelector.Selected s = select("FIC-101", 50_000L);
        assertEquals(1, s.epoch);
        assertEquals("STATE_BOUNDARY", s.changeClass);
        assertEquals(0, select("FIC-101", 49_999L).epoch);

        // NR-052: a fresh operator restored from the same broadcast state selects the same bundle
        TestBundles.MapBroadcastState restored = new TestBundles.MapBroadcastState();
        restored.putAll(state.map);
        EffectiveBundleSelector.Selected again = EffectiveBundleSelector.select(restored, SITE, "FIC-101", "FLOW_FAST_SELF_REG", 50_000L, new HashMap<>());
        assertEquals(boundary.get("hash").asText(), again.bundle.hash);
        assertEquals(s.epoch, again.epoch);
        CplmLoopDynamicsProfile a = CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.FIC);
        CplmLoopDynamicsProfile b = CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.FIC);
        EffectiveBundleSelector.apply(a, s);
        EffectiveBundleSelector.apply(b, again);
        assertEquals(ProfileHash.of(a), ProfileHash.of(b));
        assertEquals(0.02, a.spStabilityBandSpanFraction, 0.0);
    }
}
