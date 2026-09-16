package com.ams.flink.cplm.evidence;

import com.ams.flink.cplm.CplmGateEngine;
import com.ams.flink.cplm.CplmGateFusionEngine;
import com.ams.flink.cplm.CplmGateResult;
import com.ams.flink.cplm.CplmLongDiagnosticsResult;
import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.CplmShortFeatureResult;
import com.ams.flink.cplm.SynTic001ReferenceGenerator;
import com.ams.flink.cplm.contract.RoleObservation;
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
        LONG = LongArtifacts.artifacts(longD);
        CplmGateResult fused = CplmGateFusionEngine.fuse(CplmGateEngine.computeShortFeatures(samples, start, end, "24h"), longD);
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
    public void fusionTierCoversG13ToG15AndTheHealthLanes() {
        for (String g : new String[] {"G13", "G14", "G15"}) assertCovered(FUSION, g);
        Set<String> g11 = carried(FUSION, "G11");
        for (String f : new String[] {"F", "C", "S", "M", "health_state_id", "source_verified_time", "measurement_impact", "eligibility_intervals"}) assertTrue(f, g11.contains(f));
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
    public void g13IsAnUnavailableRecordWithAReasonNotAChart() {
        EvidenceArtifact g13 = null;
        for (EvidenceArtifact a : FUSION) if ("G13".equals(a.gate)) g13 = a;
        assertNotNull(g13);
        assertEquals(0, g13.calculationSamples());
        assertEquals("UNAVAILABLE", g13.provenance.get("capability_state"));
        assertEquals(FusionArtifacts.G13_CAPABILITY_REASON, g13.provenance.get("capability_reason"));
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
}
