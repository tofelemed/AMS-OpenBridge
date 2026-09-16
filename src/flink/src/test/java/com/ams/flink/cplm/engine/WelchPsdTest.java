package com.ams.flink.cplm.engine;

import org.junit.Test;

import java.util.Random;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/** v2.5 Task 2C.1b: the G6 spectrum is a real PSD in signal^2/Hz with its resolution and window declared. */
public class WelchPsdTest {
    @Test
    public void aPureSinePeaksAtItsFrequencyWithinOneBinAndParsevalHolds() {
        int n = 2880;                                                        // 4 h at 5 s
        double dt = 5.0, period = 100.0, amp = 2.0;
        double[] x = new double[n];
        for (int i = 0; i < n; i++) x[i] = amp * Math.sin(2 * Math.PI * i * dt / period);
        WelchPsd.Result r = WelchPsd.compute(x, dt, 256, 0.5);
        assertEquals(256, r.fftSize);
        assertEquals(1.0 / (256 * dt), r.resolutionHz, 1e-12);
        int peak = 0;
        for (int k = 1; k < r.psd.length; k++) if (r.psd[k] > r.psd[peak]) peak = k;
        assertEquals(0.01, r.freqHz[peak], r.resolutionHz);
        assertEquals("Parseval within 2 %", 1.0, r.parsevalRatio, 0.02);
        // the energy under the PSD equals the mean square (amp^2/2 for a sine)
        double energy = 0;
        for (double v : r.psd) energy += v * r.resolutionHz;
        assertEquals(amp * amp / 2, energy, 0.02 * amp * amp / 2);
        assertEquals("PSD", WelchPsd.ORDINATE_KIND);
        assertEquals("signal^2/Hz", WelchPsd.UNIT);
    }

    @Test
    public void whiteNoiseIsFlatAndItsLevelIsTheVarianceOverTheBandwidth() {
        int n = 20000;
        double dt = 1.0, sigma = 1.5;
        Random rnd = new Random(3);
        double[] x = new double[n];
        for (int i = 0; i < n; i++) x[i] = sigma * rnd.nextGaussian();
        WelchPsd.Result r = WelchPsd.compute(x, dt, 256, 0.5);
        double expected = sigma * sigma / (0.5 / dt);                        // variance spread over the Nyquist bandwidth (one-sided)
        double mean = 0;
        int count = 0;
        for (int k = 1; k < r.psd.length - 1; k++) {
            mean += r.psd[k];
            count++;
        }
        mean /= count;
        assertEquals(expected, mean, 0.1 * expected);
        assertEquals(1.0, r.parsevalRatio, 0.05);
        assertTrue(r.segments > 100);
    }

    @Test
    public void tooShortARecordYieldsNoSpectrumNotAFabricatedOne() {
        WelchPsd.Result r = WelchPsd.compute(new double[5], 5.0, 256, 0.5);
        assertEquals(0, r.psd.length);
        assertEquals(0, r.segments);
    }
}
