package com.ams.flink.cplm;

import org.junit.Assert;
import org.junit.Test;

import java.util.List;

/** Three-stage pipeline acceptance: short + long + fusion must match SYN_TIC_001 golden set. */
public class CplmPipelineSynTic001Test {

    private static final double TOL = 0.02;

    @Test
    public void threeStagePipelineMatchesGolden() {
        List<CplmNormalizedSample> samples = SynTic001ReferenceGenerator.generate();
        long start = SynTic001ReferenceGenerator.windowStartMs();
        long end = SynTic001ReferenceGenerator.windowEndMs();

        CplmShortFeatureResult shortF = CplmGateEngine.computeShortFeatures(samples, start, end, "24h");
        Assert.assertTrue(shortF.sufficientData);

        CplmLongDiagnosticsResult longD = CplmGateEngine.computeLongDiagnostics(samples, start, end, "24h");
        CplmGateResult r = CplmGateFusionEngine.fuse(shortF, longD);

        Assert.assertEquals("SYN_TIC_001", r.loopId);
        Assert.assertEquals(17280, r.sampleCount);
        Assert.assertEquals(0.375, r.mae, 0.001);
        Assert.assertEquals(0.433019, r.rmse, 0.001);
        Assert.assertEquals(32400.0, r.iae, 1.0);
        Assert.assertEquals(0.67037, r.goodErrorPct, TOL);
        Assert.assertEquals(2700.0, r.acfPeriodS, 50.0);
        Assert.assertEquals(8.0, r.effortRatio, TOL);
        Assert.assertEquals(1.0, r.triangularity, 0.01);
        Assert.assertEquals(0.999928, r.horchOddness, 0.001);
        Assert.assertEquals(0.5, r.phaseAreaNormPerCycle, 0.02);
        Assert.assertEquals(0.919676, r.cornerScore, 0.05);
        Assert.assertEquals("NOT_EVALUATED", r.gate12Status);
        Assert.assertEquals("NOT_EVALUATED", r.gate13Status);
        Assert.assertTrue(r.observabilityFlags.contains("NO_VP"));
        Assert.assertEquals("stiction", r.selectedFamily);
        Assert.assertEquals(0.89, r.confidence, 0.01);
        Assert.assertEquals("SUSPECTED_FINAL_ELEMENT_NONLINEARITY", r.diagnosis);
        Assert.assertEquals("VALID", r.periodStatus);
        Assert.assertEquals(CplmLoopDynamicsProfile.CALCULATION_VERSION, r.calculationVersion);
    }

    @Test
    public void computeDelegatesToFusionPipeline() {
        List<CplmNormalizedSample> samples = SynTic001ReferenceGenerator.generate();
        CplmGateResult direct = CplmGateEngine.compute(
                samples, SynTic001ReferenceGenerator.windowStartMs(), SynTic001ReferenceGenerator.windowEndMs());
        Assert.assertEquals("SUSPECTED_FINAL_ELEMENT_NONLINEARITY", direct.diagnosis);
    }
}
