package com.ams.flink.cplm.engine;

import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.SynTic001ReferenceGenerator;
import org.junit.Test;

import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * v2.5 Task 2C.1b: the G6 spectrum must resolve the band the profile declares. A Welch segment
 * spans at least {@code g6BandCyclesPerSegment} cycles of the longest in-band period (tauMaxS),
 * so a slow loop's oscillation is not folded onto the first bin; a fast loop keeps a short
 * segment and averages many of them.
 */
public class OscillationMathG6Test {
    private static double[] centeredShape(List<CplmNormalizedSample> samples, boolean pv) {
        int n = samples.size();
        double[] x = new double[n];
        for (int i = 0; i < n; i++) x[i] = pv ? samples.get(i).pv : samples.get(i).op;
        return SignalMath.subtractMean(SignalMath.linearDetrend(x));
    }

    @Test
    public void aSlowOscillationIsResolvedNotFoldedOntoTheFirstBin() {
        // SYN-TIC-001: a 2700 s cycle over 24 h at 5 s under the TIC band (tauMaxS 28800 -> the whole record is one segment)
        List<CplmNormalizedSample> samples = SynTic001ReferenceGenerator.generate();
        double tsSec = (samples.get(1).eventTsMs - samples.get(0).eventTsMs) / 1000.0;
        CplmLoopDynamicsProfile profile = CplmLoopDynamicsProfile.resolve("SYN_TIC_001", "TIC", null);
        OscillationMath.FftResult r = OscillationMath.computeFftBandLimited(centeredShape(samples, false), tsSec, profile);
        assertTrue("segment spans >= 4 cycles of tauMax", r.segmentSamples * tsSec >= 4 * profile.tauMaxS || r.segmentSamples == samples.size());
        double oneBinS = r.resolutionHz / (r.peakFreqHz * r.peakFreqHz);                // dT = df / f^2 (one bin, in seconds)
        assertEquals("peak period within one bin of 2700 s", 2700.0, r.peakPeriodSec, oneBinS + 1e-9);
        assertTrue("the peak is well inside the spectrum, not at bin 1", r.peakBin >= 4);
        assertTrue("a near-pure cycle: the main lobe holds the band energy", r.peakRatio > 0.9);
        assertEquals("PSD", r.ordinateKind);
    }

    @Test
    public void aFastLoopKeepsTheShortSegmentAndAveragesMany() {
        int n = 17280;                                                        // 24 h at 5 s
        double dt = 5.0;
        double[] x = new double[n];
        java.util.Random rnd = new java.util.Random(11);
        for (int i = 0; i < n; i++) x[i] = 2.0 * Math.sin(2 * Math.PI * i * dt / 100.0) + 0.5 * rnd.nextGaussian();
        CplmLoopDynamicsProfile profile = CplmLoopDynamicsProfile.resolve("FIC_TEST", "FIC", null);   // tauMaxS 900
        OscillationMath.FftResult r = OscillationMath.computeFftBandLimited(x, dt, profile);
        assertTrue("segment covers 4 x tauMax = 3600 s", r.segmentSamples * dt >= 4 * profile.tauMaxS);
        assertTrue("but stays far shorter than the record", r.segmentSamples <= n / 8);
        assertTrue("many segments averaged", r.segments >= 8);
        assertEquals(100.0, r.peakPeriodSec, r.resolutionHz / (r.peakFreqHz * r.peakFreqHz) + 1e-9);
    }
}
