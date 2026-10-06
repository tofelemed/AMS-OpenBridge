package com.ams.flink.cplm.evidence;

import com.ams.flink.cplm.CplmGateEngine;
import com.ams.flink.cplm.CplmGateFusionEngine;
import com.ams.flink.cplm.CplmGateResult;
import com.ams.flink.cplm.CplmLongDiagnosticsResult;
import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.CplmShortFeatureResult;
import com.ams.flink.cplm.SynTic001ReferenceGenerator;
import com.ams.flink.cplm.contract.RoleObservation;
import com.ams.flink.cplm.fusion.HealthLanes;
import com.ams.flink.cplm.health.LoopHealthContextRecord;
import org.junit.BeforeClass;
import org.junit.Test;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * v2.5 Task 2C.1c (NR-032): every engine gate emits its exact intermediates as artifacts whose
 * field names are the workbook's (xlsx_Gate_evidence.tsv, column "Artifact fields"). A field is
 * carried by an artifact kind, an axis quantity, a column, or a provenance key; masks are boolean
 * and aligned; units are present; G13 is an UNAVAILABLE record with a reason; G8's bicoherence is
 * declared absent; G7 keeps rejected cycles with their reason.
 */
public class GateArtifactsTest {
    private static Map<String, List<String>> WORKBOOK;
    private static List<EvidenceArtifact> SHORT, LONG, FUSION;
    private static CplmShortFeatureResult SHORT_RESULT;
    private static CplmLongDiagnosticsResult LONG_RESULT;
    private static CplmGateResult FUSED;

    @BeforeClass
    public static void build() throws Exception {
        WORKBOOK = workbook();
        List<CplmNormalizedSample> samples = SynTic001ReferenceGenerator.generate();
        long start = SynTic001ReferenceGenerator.windowStartMs(), end = SynTic001ReferenceGenerator.windowEndMs();
        // give the 1.0 fixture a roles block so G0's per-role provenance is exercised as on the plant
        for (CplmNormalizedSample s : samples) {
            if (s.roles.isEmpty()) {
                s.roles.put("pv", obs("pv", s.pv, null, s.eventTsMs, "192", "GOOD", false));
                s.roles.put("sp", obs("sp", s.sp, null, s.eventTsMs, "192", "GOOD", false));
                s.roles.put("op", obs("op", s.op, null, s.eventTsMs, "192", "GOOD", false));
                s.roles.put("mode", obs("mode", null, s.mode, s.eventTsMs, "192", "GOOD", false));
            }
            s.ingestTsMs = s.eventTsMs + 150;
        }
        SHORT_RESULT = CplmGateEngine.computeShortFeatures(samples, start, start + 3_600_000L, "60m");
        SHORT = ShortArtifacts.artifacts(SHORT_RESULT);
        CplmLongDiagnosticsResult longD = CplmGateEngine.computeLongDiagnostics(samples, start, end, "24h");
        LONG_RESULT = longD;
        LONG = LongArtifacts.artifacts(longD);
        CplmGateResult fused = CplmGateFusionEngine.fuse(CplmGateEngine.computeShortFeatures(samples, start, end, "24h"), longD);
        FUSED = fused;
        FUSION = FusionArtifacts.artifacts(fused);
    }

    private static RoleObservation obs(String role, Double value, String str, long ts, String qn, String q, boolean held) {
        RoleObservation o = new RoleObservation();
        o.role = role;
        o.value = value;
        o.stringValue = str;
        o.modeNative = str == null ? null : "1";
        o.sampleTsMs = ts;
        o.verifiedTsMs = ts;
        o.qualityNative = qn;
        o.quality = q;
        o.held = held;
        return o;
    }

    /** gate -> workbook field list (the optional bicoherence trio of G8 is split off). */
    private static Map<String, List<String>> workbook() throws Exception {
        Map<String, List<String>> out = new LinkedHashMap<>();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(GateArtifactsTest.class.getResourceAsStream("/spec/xlsx_Gate_evidence.tsv"), StandardCharsets.UTF_8))) {
            String line;
            int fieldCol = -1;
            while ((line = r.readLine()) != null) {
                String[] c = line.split("\t", -1);
                if (fieldCol < 0) {
                    for (int i = 0; i < c.length; i++) if ("Artifact fields".equals(c[i].trim())) fieldCol = i;
                    continue;
                }
                if (c.length <= fieldCol || c[0].trim().isEmpty() || !c[0].trim().startsWith("G")) continue;
                String fields = c[fieldCol].split(";")[0];                     // "; optional f1_hz,f2_hz,bicoherence" (G8)
                List<String> names = new ArrayList<>();
                for (String f : fields.split(",")) if (!f.trim().isEmpty()) names.add(f.trim());
                out.put(c[0].trim(), names);
            }
        }
        return out;
    }

    private static Set<String> carried(List<EvidenceArtifact> all, String gate) {
        Set<String> names = new HashSet<>();
        for (EvidenceArtifact a : all) {
            if (!gate.equals(a.gate)) continue;
            names.add(a.kind.toLowerCase(Locale.ROOT));
            names.add(a.xQuantity);
            names.add(a.yQuantity);
            names.addAll(a.columns.keySet());
            names.addAll(a.provenance.keySet());
        }
        return names;
    }

    private static void assertCovered(List<EvidenceArtifact> all, String gate) {
        List<String> expected = WORKBOOK.get(gate);
        assertNotNull("workbook lists " + gate, expected);
        Set<String> got = carried(all, gate);
        List<String> missing = new ArrayList<>();
        for (String f : expected) if (!got.contains(f)) missing.add(f);
        assertTrue(gate + " artifacts lack workbook fields " + missing + " (carried: " + got + ")", missing.isEmpty());
    }

    @Test
    public void workbookLoadedEveryGate() {
        assertEquals(17, WORKBOOK.size());
        assertTrue(WORKBOOK.get("G8").contains("method_id"));
        assertFalse("the optional bicoherence trio is not required", WORKBOOK.get("G8").contains("bicoherence"));
    }

    @Test
    public void shortTierCoversG0ToG4() {
        for (String g : new String[] {"G0", "G1", "G2", "G2r", "G3", "G4"}) assertCovered(SHORT, g);
        int roleArtifacts = 0;
        for (EvidenceArtifact a : SHORT) if ("G0".equals(a.gate) && "role_qualification".equals(a.kind)) roleArtifacts++;
        assertEquals("one G0 artifact per mapped role (pv, sp, op, mode; no VP on SYN-TIC-001)", 4, roleArtifacts);
    }

    @Test
    public void longTierCoversG5ToG11() {
        for (String g : new String[] {"G5", "G6", "G7", "G8", "G9", "G10", "G11"}) assertCovered(LONG, g);
    }

    @Test
    public void fusionTierCoversG14G15AndTheHealthLanesAndG13RidesTheLongTierUnderTheSameRunId() {
        for (String g : new String[] {"G14", "G15"}) assertCovered(FUSION, g);
        // v2.5 (2F.1): G13's record and series are the long tier's; the fused row names the same run id
        assertCovered(LONG, "G13");
        assertEquals(LONG_RESULT.methodRunIds.get("G13"), FUSED.methodRunIds.get("G13"));
        assertNotNull(FUSED.methodRunIds.get("G13"));
        int fusedG13 = 0;
        for (EvidenceArtifact a : FUSION) if ("G13".equals(a.gate)) fusedG13++;
        assertEquals("the fused row adds no second G13 record when the long tier analysed", 0, fusedG13);
        Set<String> g11 = carried(FUSION, "G11");
        for (String f : new String[] {"F", "C", "S", "M", "health_state_id", "source_verified_time", "measurement_impact", "eligibility_intervals"}) assertTrue(f, g11.contains(f));
    }

    @Test
    public void cycleArtifactsAreCappedAndEveryCycleIsInTheSummary() {
        List<EvidenceArtifact> capped = LongArtifacts.artifacts(LONG_RESULT, 2);
        long fits = capped.stream().filter(a -> "cycle_fit".equals(a.kind)).count();
        long polys = capped.stream().filter(a -> "cycle_polygon".equals(a.kind)).count();
        assertTrue(fits <= 2 && polys <= 2);
        EvidenceArtifact summary = capped.stream().filter(a -> "cycle_scores".equals(a.kind)).findFirst().orElseThrow(() -> new AssertionError("no cycle_scores"));
        assertEquals(LONG_RESULT.intermediates.triangularity.cycles.size(), summary.calculationSamples());
        assertEquals(LONG_RESULT.intermediates.triangularity.cycles.size(), ((Number) summary.provenance.get("cycles_total")).intValue());
    }

    @Test
    public void everyArtifactHasUnitsAlignedMasksAndProvenance() {
        List<EvidenceArtifact> all = new ArrayList<>();
        all.addAll(SHORT);
        all.addAll(LONG);
        all.addAll(FUSION);
        assertTrue(all.size() > 20);
        for (EvidenceArtifact a : all) {
            assertNotNull(a.kind + " x unit", a.xUnit);
            assertNotNull(a.kind + " y unit", a.yUnit);
            assertEquals(a.kind + " x/y length", a.x.length, a.y.length);
            if (a.mask != null) assertEquals(a.kind + " mask aligned", a.x.length, a.mask.length);
            for (Map.Entry<String, double[]> c : a.columns.entrySet()) {
                assertEquals(a.kind + " column " + c.getKey() + " aligned", a.x.length, c.getValue().length);
                assertNotNull(a.kind + " column unit " + c.getKey(), a.columnUnits.get(c.getKey()));
            }
            for (String coded : a.legends.keySet()) assertTrue(a.kind + " legend for a real column " + coded, a.columns.containsKey(coded) || "value".equals(coded) || "y".equals(coded) || a.yQuantity.equals(coded));
            assertEquals(a.kind + " method run id", 36, a.methodRunId.length());
            assertTrue(a.kind + " window provenance", a.provenance.containsKey("window_kind") && a.provenance.containsKey("bundle_hash"));
        }
    }

    @Test
    public void g7KeepsRejectedCyclesWithTheirReasonAndG8DeclaresBicoherenceAbsent() {
        int cycles = 0;
        for (EvidenceArtifact a : LONG) if ("cycle_fit".equals(a.kind)) {
            cycles++;
            assertTrue(a.provenance.containsKey("accepted"));
            assertTrue(a.provenance.containsKey("reject_reason"));
            assertTrue(a.columns.containsKey("sine_fit") && a.columns.containsKey("triangle_fit"));
        }
        assertTrue("SYN-TIC-001 has cycles", cycles > 0);
        EvidenceArtifact lag = null;
        for (EvidenceArtifact a : LONG) if ("lag_structure".equals(a.kind)) lag = a;
        assertNotNull(lag);
        assertEquals(LongArtifacts.G8_METHOD_ID, lag.provenance.get("method_id"));
        assertEquals("NOT_INSTALLED", lag.provenance.get("bicoherence"));
    }

    @Test
    public void g13WithoutPeersIsANotConfiguredRecordWithAReasonNotAChart() {
        EvidenceArtifact g13 = null;
        for (EvidenceArtifact a : LONG) if ("G13".equals(a.gate)) g13 = a;
        assertNotNull(g13);
        assertEquals("interaction", g13.kind);
        assertEquals(0, g13.calculationSamples());
        assertEquals("NOT_CONFIGURED", g13.provenance.get("capability_state"));
        assertEquals("NO_PEER_LINKS", g13.provenance.get("capability_reason"));
        assertEquals("G13.ALIGNED_PEER_ANALYSIS_V1", g13.provenance.get("method_id"));
        assertEquals("NOT_EVALUATED", FUSED.gate13Status);
        assertEquals("G13.ALIGNED_PEER_ANALYSIS_V1", FUSED.gate13Method);
    }

    @Test
    public void g13WithAnAnalysedPeerWritesAlignedSeriesXcorrAndCoherenceUnderTheLongRunId() {
        List<CplmNormalizedSample> samples = SynTic001ReferenceGenerator.generate();
        long start = SynTic001ReferenceGenerator.windowStartMs(), end = SynTic001ReferenceGenerator.windowEndMs();
        // a peer that is the loop's own PV delayed by two samples - detectable by construction
        List<CplmNormalizedSample> peer = new ArrayList<>();
        for (int i = 2; i < samples.size(); i++) {
            CplmNormalizedSample c = samples.get(i - 2).peerCopy(samples.get(0).loopId);
            c.loopId = "PEER-1";
            c.eventTsMs = samples.get(i).eventTsMs;
            peer.add(c);
        }
        java.util.Map<String, List<CplmNormalizedSample>> byPeer = new java.util.HashMap<>();
        byPeer.put("PEER-1", peer);
        com.ams.flink.cplm.engine.LongDiagnosticsCalculator.PeerContext ctx =
                new com.ams.flink.cplm.engine.LongDiagnosticsCalculator.PeerContext(java.util.Collections.singletonList("PEER-1"), byPeer, 7);
        CplmLongDiagnosticsResult longD = CplmGateEngine.computeLongDiagnostics(samples, start, end, "24h", null, ctx);
        assertNotNull(longD.interaction);
        assertEquals("INTERACTION_DETECTED", longD.interaction.state);
        assertEquals(7, longD.interaction.relationshipRevision);
        List<EvidenceArtifact> arts = LongArtifacts.artifacts(longD);
        Set<String> kinds = new HashSet<>();
        for (EvidenceArtifact a : arts) if ("G13".equals(a.gate)) { kinds.add(a.kind); assertEquals(longD.methodRunIds.get("G13"), a.methodRunId); }
        assertTrue(kinds.containsAll(java.util.Arrays.asList("interaction", "aligned_series", "cross_correlation", "coherence")));
        EvidenceArtifact aligned = null;
        for (EvidenceArtifact a : arts) if ("aligned_series".equals(a.kind)) aligned = a;
        assertNotNull(aligned);
        assertEquals("PEER-1", aligned.roleOrPath);
        assertNotNull(aligned.mask);
        assertTrue(aligned.columns.containsKey("own_pv"));
        // the fused row inherits the analysis and the SAME run id, and writes no second record
        CplmGateResult fused = CplmGateFusionEngine.fuse(CplmGateEngine.computeShortFeatures(samples, start, end, "24h"), longD);
        assertEquals("WARN", fused.gate13Status);
        assertEquals(longD.methodRunIds.get("G13"), fused.methodRunIds.get("G13"));
        for (EvidenceArtifact a : FusionArtifacts.artifacts(fused)) assertFalse("G13".equals(a.gate));
        // the results-topic JSON round-trips the summary the fusion job reads
        CplmLongDiagnosticsResult back = CplmLongDiagnosticsResult.fromJson(longD.toJson());
        assertNotNull(back.interaction);
        assertEquals("INTERACTION_DETECTED", back.interaction.state);
        assertEquals(1, back.interaction.peers.size());
        assertTrue(back.interaction.peers.get(0).associated);
    }

    @Test
    public void g0CodesQualityHoldAndExclusionWithLegends() {
        EvidenceArtifact pv = null;
        for (EvidenceArtifact a : SHORT) if ("G0".equals(a.gate) && "PV".equals(a.roleOrPath)) pv = a;
        assertNotNull(pv);
        assertTrue(pv.legends.get("quality_normalized").contains("GOOD"));
        assertTrue(pv.legends.get("hold_kind").contains("NONE"));
        assertTrue(pv.legends.get("exclusion_reason").contains("NONE"));
        assertEquals("ms_epoch", pv.columnUnits.get("arrival_time"));
        assertEquals(pv.x[0] + 150, pv.columns.get("arrival_time")[0], 0.0);
        for (boolean accepted : pv.mask) assertTrue(accepted);
    }

    @Test
    public void g0MarksAnOverAgeHeldVpAsExcludedNotAccepted() {
        // lab manifest (FIC10302): a positioner value held for two hours read hold_kind=HELD_PREVIOUS, exclusion=NONE, accepted
        List<CplmNormalizedSample> samples = SynTic001ReferenceGenerator.generate();
        long start = SynTic001ReferenceGenerator.windowStartMs();
        int i = 0;
        for (CplmNormalizedSample s : samples) {
            if (s.roles.isEmpty()) {
                s.roles.put("pv", obs("pv", s.pv, null, s.eventTsMs, "192", "GOOD", false));
                s.roles.put("sp", obs("sp", s.sp, null, s.eventTsMs, "192", "GOOD", false));
                s.roles.put("op", obs("op", s.op, null, s.eventTsMs, "192", "GOOD", false));
                s.roles.put("mode", obs("mode", null, s.mode, s.eventTsMs, "192", "GOOD", false));
            }
            boolean stale = i++ % 2 == 1;                                       // every other sample: held for two hours
            s.vp = 29.33;
            RoleObservation vp = obs("vp", 29.33, null, s.eventTsMs - (stale ? 7_000_000L : 0L), "192", "GOOD", stale);
            vp.ageMs = stale ? 7_000_000L : 0L;
            s.roles.put("vp", vp);
        }
        CplmShortFeatureResult r = CplmGateEngine.computeShortFeatures(samples, start, start + 3_600_000L, "60m");
        EvidenceArtifact vpArt = null;
        for (EvidenceArtifact a : ShortArtifacts.artifacts(r)) if ("G0".equals(a.gate) && "VP".equals(a.roleOrPath)) vpArt = a;
        assertNotNull(vpArt);
        assertTrue(vpArt.legends.get("exclusion_reason").contains("HELD_OVER_AGE"));
        assertTrue(vpArt.legends.get("hold_kind").contains("HELD_PREVIOUS"));
        int excluded = 0, accepted = 0;
        for (boolean m : vpArt.mask) if (m) accepted++; else excluded++;
        assertEquals("every stale sample is excluded", vpArt.mask.length / 2, excluded);
        assertEquals(vpArt.mask.length - vpArt.mask.length / 2, accepted);
    }

    @Test
    public void thePolicyPushesFindingsLiveAndLeavesTheRestToReconstruction() {
        EvidencePolicy episodes = new EvidencePolicy(EvidencePolicy.Mode.EPISODES);
        CplmShortFeatureResult clean = new CplmShortFeatureResult();
        clean.gate0Status = "PASS";
        clean.gate1Status = "PASS";
        clean.gate2Status = "PASS";
        clean.gate3Status = "PASS";
        clean.gate4Status = "PASS";
        assertFalse(episodes.emit(clean));
        clean.gate4Status = "WARN";
        assertTrue(episodes.emit(clean));
        assertTrue("SYN-TIC-001 carries findings", episodes.emit(SHORT_RESULT));
        assertTrue(new EvidencePolicy(EvidencePolicy.Mode.ALL).emit(clean));
        assertFalse(new EvidencePolicy(EvidencePolicy.Mode.NONE).emit(clean));
        assertEquals(EvidencePolicy.Mode.ALL, EvidencePolicy.fromArgs(new String[] {"--evidence-emit", "all"}).mode);
        assertEquals(EvidencePolicy.Mode.EPISODES, EvidencePolicy.fromArgs(new String[] {}).mode);
    }

    // CHG-049: G5/G6 alone and a configured-but-healthy bound lane are context, not a finding
    private static HealthLanes pvLane(String eligibility) {
        LoopHealthContextRecord r = new LoopHealthContextRecord();
        r.loopId = "L"; r.role = "PV"; r.deviceId = "TT-1"; r.bindingId = "b-1";
        r.eligibility = eligibility; r.descriptiveEligibility = eligibility; r.reason = "";
        r.activeFlags = new ArrayList<>();
        Map<String, LoopHealthContextRecord> m = new LinkedHashMap<>();
        m.put("PV", r);
        return HealthLanes.of(m);
    }

    @Test
    public void g5g6AloneAreNotAFindingAndConfiguredHealthIsNot() {
        EvidencePolicy p = new EvidencePolicy(EvidencePolicy.Mode.EPISODES);
        CplmLongDiagnosticsResult l = new CplmLongDiagnosticsResult();
        l.gate5Status = "WARN"; l.gate6Status = "WARN";
        l.gate7Status = l.gate8Status = l.gate9Status = l.gate10Status = l.gate11Status = "PASS";
        assertFalse(p.emit(l));
        l.gate9Status = "WARN";
        assertTrue(p.emit(l));
        CplmGateResult g = new CplmGateResult();
        g.gate14Status = "PASS"; g.diagnosis = "PASS";
        g.healthLanes = pvLane("ELIGIBLE");
        assertTrue(g.healthLanes.configured());
        assertFalse(p.emit(g));
        g.healthLanes = pvLane("LIMITED");
        assertTrue(p.emit(g));
        g.healthLanes = pvLane("INELIGIBLE");
        assertTrue(p.emit(g));
    }
}
