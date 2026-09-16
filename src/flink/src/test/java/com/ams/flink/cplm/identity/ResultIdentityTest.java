package com.ams.flink.cplm.identity;

import com.ams.flink.cplm.CplmGateEngine;
import com.ams.flink.cplm.CplmGateFusionEngine;
import com.ams.flink.cplm.CplmGateResult;
import com.ams.flink.cplm.CplmLongDiagnosticsResult;
import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.CplmShortFeatureResult;
import com.ams.flink.cplm.evidence.EvidenceArtifact;
import com.ams.flink.cplm.evidence.LongEvidence;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * v2.5 Task 1G.3 (R19 / R26; NR-056): every result tier carries its run identity on the SAME
 * v1 record - 17 deterministic method_run_ids on the fused row, the stage subsets on the short
 * and long rows, the configuration hash and the dataset hash - and two runs over the same
 * fixture produce the same ids.
 */
public class ResultIdentityTest {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final long T0 = 1_756_600_000_000L;

    private static List<CplmNormalizedSample> fixture() {
        List<CplmNormalizedSample> out = new ArrayList<>();
        for (int i = 0; i < 17_280; i++) {
            CplmNormalizedSample s = new CplmNormalizedSample();
            s.loopId = "TIC20803"; s.loopType = "TIC"; s.eventTsMs = T0 + i * 5000L;
            s.pv = 50 + 2 * Math.sin(i / 60.0); s.sp = 50; s.op = 40 + 10 * Math.sin(i / 60.0);
            // OP pinned high for 40 minutes so G10 has a dwell episode to emit
            if (i >= 5000 && i < 5480) s.op = 100;
            s.mode = "AUT"; s.quality = "GOOD";
            out.add(s);
        }
        return out;
    }

    @Test
    public void everyTierCarriesItsIdentityAndTwoRunsAgree() throws Exception {
        List<CplmNormalizedSample> samples = fixture();
        CplmLoopDynamicsProfile profile = CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.TIC);
        long end = T0 + 17_280 * 5000L;

        CplmShortFeatureResult s1 = CplmGateEngine.computeShortFeatures(samples, T0, end, "24h", profile);
        CplmLongDiagnosticsResult l1 = CplmGateEngine.computeLongDiagnostics(samples, T0, end, "24h", profile);
        CplmGateResult f1 = CplmGateFusionEngine.fuse(s1, l1, false, false, profile);
        CplmGateResult f2 = CplmGateFusionEngine.fuse(
                CplmGateEngine.computeShortFeatures(samples, T0, end, "24h", profile),
                CplmGateEngine.computeLongDiagnostics(samples, T0, end, "24h", profile), false, false, profile);

        assertEquals(6, s1.methodRunIds.size());
        assertEquals(7, l1.methodRunIds.size());
        assertEquals(17, f1.methodRunIds.size());
        assertEquals(f1.methodRunIds, f2.methodRunIds);
        assertEquals(s1.methodRunIds.get("G0"), f1.methodRunIds.get("G0"));      // a stage id IS the fused id
        assertEquals(l1.methodRunIds.get("G10"), f1.methodRunIds.get("G10"));
        assertTrue(f1.bundleHash, f1.bundleHash.startsWith(ProfileHash.PREFIX));
        assertEquals(l1.bundleHash, f1.bundleHash);
        assertEquals(64, f1.datasetHash.length());
        assertEquals(l1.datasetHash, f1.datasetHash);
        assertEquals("LIVE", f1.purpose);
        assertNull(f1.analysisRunId);

        JsonNode n = MAPPER.readTree(f1.toJson());
        assertEquals(17, n.path("method_run_ids").size());
        assertEquals(f1.bundleHash, n.path("bundle_hash").asText());
        assertEquals("LIVE", n.path("purpose").asText());
        assertTrue(n.path("analysis_run_id").isNull());
        assertEquals(1, n.path("result_revision").asInt());

        // the long JSON round-trips its identity (the fusion job consumes it from Kafka)
        CplmLongDiagnosticsResult back = CplmLongDiagnosticsResult.fromJson(l1.toJson());
        assertEquals(l1.methodRunIds, back.methodRunIds);
        assertEquals(l1.datasetHash, back.datasetHash);
        assertEquals(l1.bundleHash, back.bundleHash);
    }

    @Test
    public void aDifferentConfigurationIsADifferentRun() {
        List<CplmNormalizedSample> samples = fixture();
        long end = T0 + 17_280 * 5000L;
        CplmLoopDynamicsProfile a = CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.TIC);
        CplmLoopDynamicsProfile b = a.copy();
        b.g4ActivityWarnRatio = 2.5;
        CplmGateResult ra = CplmGateFusionEngine.fuseFromSamples(samples, T0, end, "24h", false, false, a);
        CplmGateResult rb = CplmGateFusionEngine.fuseFromSamples(samples, T0, end, "24h", false, false, b);
        assertNotEquals(ra.bundleHash, rb.bundleHash);
        assertNotEquals(ra.methodRunIds.get("G4"), rb.methodRunIds.get("G4"));
        assertEquals(ra.datasetHash, rb.datasetHash);                            // same data, other configuration
    }

    @Test
    public void theLongStageEmitsItsEpisodeTablesAsEvidenceOfTheG10Run() {
        List<CplmNormalizedSample> samples = fixture();
        long end = T0 + 17_280 * 5000L;
        CplmLongDiagnosticsResult l = CplmGateEngine.computeLongDiagnostics(samples, T0, end, "24h",
                CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.TIC));
        assertTrue("dwell events " + l.dwellEvents.size(), l.dwellEvents.size() >= 1);
        List<EvidenceArtifact> arts = LongEvidence.artifacts(l);
        assertEquals(1, arts.size());
        EvidenceArtifact a = arts.get(0);
        assertEquals("DWELL_EVENTS", a.kind);
        assertEquals(l.methodRunIds.get("G10"), a.methodRunId);
        assertEquals(l.dwellEvents.size(), a.calculationSamples());
        assertEquals("ms_epoch", a.xUnit);
        assertEquals("s", a.yUnit);
        assertTrue(a.y[0] > 0);
        assertEquals(l.bundleHash, a.provenance.get("bundle_hash"));
    }
}
