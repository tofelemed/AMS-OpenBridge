package com.ams.flink.cplm;

import org.junit.Assert;
import org.junit.Test;

import java.util.List;

/**
 * Golden-set validation against CPLM_Flink_PID_Loop_Gate_Calculation_Reference_Manual (SYN_TIC_001).
 */
public class CplmGateEngineSynTic001Test {

    private static final double TOL = 0.02;

    @Test
    public void synTic001MatchesReferenceManual() {
        List<CplmNormalizedSample> samples = SynTic001ReferenceGenerator.generate();
        CplmGateResult r = CplmGateEngine.compute(
                samples,
                SynTic001ReferenceGenerator.windowStartMs(),
                SynTic001ReferenceGenerator.windowEndMs());

        Assert.assertEquals("SYN_TIC_001", r.loopId);
        Assert.assertEquals(17280, r.sampleCount);
        Assert.assertEquals(1.0, r.completeness, 0.001);
        Assert.assertEquals(1.0, r.autoPct, 0.001);
        Assert.assertEquals(0.0, r.spRange, 0.001);
        Assert.assertEquals(0.375, r.mae, 0.001);
        Assert.assertEquals(0.433019, r.rmse, 0.001);
        Assert.assertEquals(32400.0, r.iae, 1.0);
        Assert.assertEquals(0.67037, r.goodErrorPct, TOL);
        Assert.assertEquals(2700.0, r.acfPeriodS, 50.0);
        Assert.assertEquals(8.0, r.effortRatio, TOL);
        Assert.assertEquals(767.955556, r.travelPerDay, 1.0);
        Assert.assertEquals(2.625, r.reversalsPerHour, 0.05);
        Assert.assertEquals(1.0, r.triangularity, 0.01);
        Assert.assertEquals(0.999928, r.horchOddness, 0.001);
        Assert.assertEquals(0.5, r.phaseAreaNormPerCycle, 0.02);
        Assert.assertEquals(0.919676, r.cornerScore, 0.05);
        Assert.assertTrue(r.observabilityFlags.contains("NO_VP"));
        Assert.assertEquals(0.89, r.confidence, 0.01);
        Assert.assertEquals("SUSPECTED_FINAL_ELEMENT_NONLINEARITY", r.diagnosis);
        Assert.assertEquals("VALID", r.periodStatus);
        Assert.assertEquals(CplmLoopDynamicsProfile.CALCULATION_VERSION, r.calculationVersion);
    }
}
