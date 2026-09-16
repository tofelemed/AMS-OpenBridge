package com.ams.flink.cplm.replay;

import com.ams.flink.cplm.CplmGateEngine;
import com.ams.flink.cplm.CplmGateFusionEngine;
import com.ams.flink.cplm.CplmGateResult;
import com.ams.flink.cplm.CplmLongDiagnosticsResult;
import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.CplmShortFeatureResult;
import com.ams.flink.cplm.SynTic001ReferenceGenerator;
import com.ams.flink.cplm.evidence.EvidenceArtifact;
import org.junit.Test;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * v2.5 Task 2C.2 (NR-057): an EVIDENCE_RECONSTRUCTION run rebuilds one method run's artifacts
 * over exactly its support and under exactly its identity - the artifacts it emits carry the
 * SAME method_run_id the streaming path gave that window, so they attach to the original
 * verdict, which is never touched. A gate the job cannot rebuild (G12: event-keyed) is refused.
 */
public class EvidenceReconstructionTest {
    private static Set<String> runIds(List<EvidenceArtifact> artifacts, String gate) {
        Set<String> ids = new HashSet<>();
        for (EvidenceArtifact a : artifacts) if (gate.equals(a.gate)) ids.add(a.methodRunId);
        return ids;
    }

    @Test
    public void aLongGateIsRebuiltUnderTheStreamingRunIdentity() {
        List<CplmNormalizedSample> samples = SynTic001ReferenceGenerator.generate();
        long from = SynTic001ReferenceGenerator.windowStartMs(), to = SynTic001ReferenceGenerator.windowEndMs();
        CplmLongDiagnosticsResult streamed = CplmGateEngine.computeLongDiagnostics(samples, from, to, "24h");
        String g5 = streamed.methodRunIds.get("G5");
        EvidenceReconstruction.Target target = new EvidenceReconstruction.Target(g5, "G5", "24h", from, to);
        List<EvidenceArtifact> rebuilt = EvidenceReconstruction.rebuild(samples, target);
        assertFalse(rebuilt.isEmpty());
        assertEquals("every rebuilt G5 artifact carries the streaming run id", new HashSet<>(java.util.Collections.singletonList(g5)), runIds(rebuilt, "G5"));
        for (EvidenceArtifact a : rebuilt) {
            assertEquals("only the requested gate's tier is rebuilt", "G5", a.gate);
            assertEquals(target.methodRunId, a.provenance.get("reconstructs"));
            assertEquals("EVIDENCE_RECONSTRUCTION", a.provenance.get("purpose"));
        }
    }

    @Test
    public void aShortGateAndAFusionGateResolveToTheirTiers() {
        List<CplmNormalizedSample> samples = SynTic001ReferenceGenerator.generate();
        long from = SynTic001ReferenceGenerator.windowStartMs(), to = SynTic001ReferenceGenerator.windowEndMs();
        CplmShortFeatureResult shortF = CplmGateEngine.computeShortFeatures(samples, from, from + 3_600_000L, "60m");
        String g3 = shortF.methodRunIds.get("G3");
        List<EvidenceArtifact> rebuiltShort = EvidenceReconstruction.rebuild(samples, new EvidenceReconstruction.Target(g3, "G3", "60m", from, from + 3_600_000L));
        assertEquals(new HashSet<>(java.util.Collections.singletonList(g3)), runIds(rebuiltShort, "G3"));

        CplmLongDiagnosticsResult longD = CplmGateEngine.computeLongDiagnostics(samples, from, to, "24h");
        CplmGateResult fused = CplmGateFusionEngine.fuse(CplmGateEngine.computeShortFeatures(samples, from, to, "24h"), longD);
        String g15 = fused.methodRunIds.get("G15");
        List<EvidenceArtifact> rebuiltFusion = EvidenceReconstruction.rebuild(samples, new EvidenceReconstruction.Target(g15, "G15", "24h", from, to));
        assertEquals(new HashSet<>(java.util.Collections.singletonList(g15)), runIds(rebuiltFusion, "G15"));
        assertTrue(EvidenceReconstruction.tierOf("G2r").equals("short") && EvidenceReconstruction.tierOf("G11").equals("long") && EvidenceReconstruction.tierOf("G14").equals("fusion"));
    }

    @Test
    public void anEventKeyedGateIsRefusedNotFaked() {
        try {
            EvidenceReconstruction.tierOf("G12");
            assertTrue("G12 must be refused", false);
        } catch (IllegalArgumentException e) {
            assertTrue(e.getMessage().contains("NOT_RECONSTRUCTABLE"));
        }
    }
}
