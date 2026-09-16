package com.ams.flink.cplm.engine;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * v2.5 Task 2C.1a: the calculators retain the exact intermediates the gates used (spec §3.1),
 * with no change to any published scalar - the SYN-TIC-001 golden test pins those separately.
 */
public class RetainedIntermediatesTest {
    private static double[] sine(int n, double dt, double periodS, double amp) {
        double[] x = new double[n];
        for (int i = 0; i < n; i++) x[i] = amp * Math.sin(2 * Math.PI * i * dt / periodS);
        return x;
    }

    @Test
    public void acfRetainsEveryLagWithSecondsAndPairCounts() {
        double[] x = sine(720, 5, 100, 2.0);
        OscillationMath.AcfResult r = OscillationMath.computeAcfPeriod(x, 5.0);
        int maxLag = Math.min(720 / 2, 2000);
        assertEquals(maxLag + 1, r.acf.length);
        assertEquals(maxLag + 1, r.acfLagS.length);
        assertEquals(1.0, r.acf[0], 1e-12);
        assertEquals(5.0, r.acfLagS[1], 1e-12);
        assertEquals(720, r.acfPairCount[0]);
        assertEquals(720 - 20, r.acfPairCount[20]);
        assertTrue("zero crossings are retained as times", r.crossingTimesS.length >= 2);
        assertEquals(100.0, r.periodSec, 5.0);                               // the scalar is untouched
        assertEquals(r.acf[20], 1.0, 0.05);                                  // lag 100 s = one period of rho ~ 1
    }

    @Test
    public void triangularityRetainsEveryCycleIncludingRejectedOnes() {
        int cycleSamples = 20;
        double[] op = new double[100];
        for (int i = 0; i < 60; i++) op[i] = 50 + 10 * Math.sin(2 * Math.PI * i / cycleSamples);
        // cycles 4 and 5 are flat -> rejected with a reason, never silently dropped
        for (int i = 60; i < 100; i++) op[i] = 50;
        ShapeMath.TriangularityResult r = ShapeMath.computeTriangularity(op, cycleSamples);
        assertEquals(5, r.completedCycles);
        assertEquals(3, r.validCycles);
        assertEquals(5, r.cycles.size());
        ShapeMath.CycleFit first = r.cycles.get(0);
        assertTrue(first.accepted);
        assertEquals(cycleSamples, first.measured.length);
        assertEquals(cycleSamples, first.sineFit.length);
        assertEquals(cycleSamples, first.triangleFit.length);
        assertEquals(first.sseSine, r.firstCycleSseSine, 1e-12);
        assertEquals(first.sseTriangle, r.firstCycleSseTriangle, 1e-12);
        assertTrue("a sine cycle fits the sine far better than the triangle", first.sseSine < first.sseTriangle);
        assertFalse(r.cycles.get(4).accepted);
        assertEquals("FLAT_CYCLE", r.cycles.get(4).rejectReason);
    }

    @Test
    public void horchRetainsTheLagStructure() {
        int n = 1200;
        double[] op = sine(n, 5, 100, 1.0), pv = new double[n];
        for (int i = 0; i < n; i++) pv[i] = op[Math.max(0, i - 3)];         // pv lags op by 3 samples
        ShapeMath.HorchResult r = ShapeMath.computeHorch(op, pv);
        int maxLag = Math.min(ShapeMath.HORCH_MAX_LAG, n / 4);
        assertEquals(maxLag, r.phiPositive.length);
        assertEquals(maxLag, r.phiNegative.length);
        assertEquals(maxLag, r.oddContribution.length);
        double odd = 0, even = 0;
        for (int k = 0; k < maxLag; k++) {
            odd += r.oddContribution[k];
            even += r.evenContribution[k];
        }
        assertEquals(r.oddSum, odd, 1e-9);                                   // the scalars are the sums of the retained series
        assertEquals(r.evenSum, even, 1e-9);
        assertEquals(1.0, r.lagIndex[0], 0);
    }

    @Test
    public void geometryRetainsPolygonsAndCornerMasks() {
        int n = 200;
        double[] pv = new double[n], op = new double[n];
        for (int i = 0; i < n; i++) {
            pv[i] = 50 + 5 * Math.sin(2 * Math.PI * i / 50.0);
            op[i] = 40 + 5 * Math.cos(2 * Math.PI * i / 50.0);
        }
        ShapeMath.GeometryResult r = ShapeMath.computeGeometry(pv, op, 4, null);
        assertEquals(4, r.polygons.size());
        ShapeMath.CyclePolygon p0 = r.polygons.get(0);
        assertEquals(50, p0.pvNorm.length);
        for (double v : p0.pvNorm) assertTrue(v >= 0 && v <= 1);
        double sum = 0;
        for (ShapeMath.CyclePolygon p : r.polygons) sum += p.area;
        assertEquals(r.pathArea, sum, 1e-9);                                 // the scalar is the sum of the retained polygons
        assertEquals(n, r.turningAngleRad.length);
        assertEquals(n, r.cornerMask.length);
        assertNotNull(r.qualifiedMask);
    }

    @Test
    public void limitAndDeltaPvRetainPerSampleFlags() {
        double[] op = {0, 0, 50, 100, 100, 50, 0};
        LimitMath.SaturationStats s = LimitMath.computeSaturationStats(op, 5, 95);
        assertTrue(s.activeLow[0] && s.activeLow[1] && !s.activeLow[2]);
        assertTrue(s.activeHigh[3] && s.activeHigh[4] && !s.activeHigh[5]);
        double[] pv = {10, 10.1, 10, 10.1, 10, 25, 10, 10.1, 10, 10.1, 10};
        LimitMath.DeltaPvResult d = LimitMath.computeDeltaPvStats(pv);
        assertEquals(pv.length - 1, d.deltaPv.length);
        assertEquals(3 * d.std, d.noiseBand, 1e-12);
        int spikes = 0;
        for (boolean b : d.spikeMask) if (b) spikes++;
        assertEquals("the spike mask agrees with computeSpikeCount", LimitMath.computeSpikeCount(pv), spikes);
    }
}
