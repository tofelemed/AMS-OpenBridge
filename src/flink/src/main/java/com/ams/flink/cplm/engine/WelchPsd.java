package com.ams.flink.cplm.engine;

import org.apache.commons.math3.complex.Complex;
import org.apache.commons.math3.transform.DftNormalization;
import org.apache.commons.math3.transform.FastFourierTransformer;
import org.apache.commons.math3.transform.TransformType;

import java.io.Serializable;

/**
 * v2.5 (2C.1b, spec §3.2 / R12): a real power spectral density in signal^2/Hz by Welch's method -
 * Hann-windowed segments with the declared overlap, each zero-padded to the next power of two,
 * one-sided, window-power corrected, averaged. Parseval holds to within the windowing loss
 * (asserted in the test at 2 %). The ordinate kind, window, FFT size and resolution are reported
 * with the spectrum so a chart can never present amplitudes as densities or vice versa.
 */
public final class WelchPsd {
    public static final String ORDINATE_KIND = "PSD";
    public static final String UNIT = "signal^2/Hz";
    public static final String WINDOW = "HANN";

    public static final class Result implements Serializable {
        private static final long serialVersionUID = 1L;
        public double[] freqHz = new double[0];
        public double[] psd = new double[0];
        public int fftSize, segments, segmentSamples;
        public double resolutionHz, overlapFraction;
        /** sum(psd) * df / mean(x^2): 1 when Parseval holds exactly. */
        public double parsevalRatio;
    }

    private WelchPsd() {}

    public static Result compute(double[] x, double tsSec, int segmentSamples, double overlapFraction) {
        Result r = new Result();
        int n = x.length;
        if (n < 8 || tsSec <= 0) return r;
        int seg = Math.max(8, Math.min(segmentSamples, n));
        int fftSize = Integer.highestOneBit(seg);
        if (fftSize < seg) fftSize <<= 1;
        double fs = 1.0 / tsSec;
        double df = fs / fftSize;
        int bins = fftSize / 2 + 1;
        double[] window = new double[seg];
        double windowPower = 0;
        for (int i = 0; i < seg; i++) {
            window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (seg - 1)));
            windowPower += window[i] * window[i];
        }
        int step = Math.max(1, (int) Math.round(seg * (1 - Math.max(0, Math.min(0.9, overlapFraction)))));
        FastFourierTransformer fft = new FastFourierTransformer(DftNormalization.STANDARD);
        double[] acc = new double[bins];
        int segments = 0;
        for (int start = 0; start + seg <= n; start += step) {
            double[] buf = new double[fftSize];
            for (int i = 0; i < seg; i++) buf[i] = x[start + i] * window[i];
            Complex[] spec = fft.transform(buf, TransformType.FORWARD);
            for (int k = 0; k < bins; k++) {
                double mag2 = spec[k].abs() * spec[k].abs();
                double scale = (k == 0 || k == bins - 1) ? 1.0 : 2.0;          // one-sided
                acc[k] += scale * mag2 / (fs * windowPower);
            }
            segments++;
        }
        if (segments == 0) return r;
        r.freqHz = new double[bins];
        r.psd = new double[bins];
        double energy = 0;
        for (int k = 0; k < bins; k++) {
            r.freqHz[k] = k * df;
            r.psd[k] = acc[k] / segments;
            energy += r.psd[k] * df;
        }
        double meanSquare = 0;
        for (double v : x) meanSquare += v * v;
        meanSquare /= n;
        r.parsevalRatio = meanSquare > 0 ? energy / meanSquare : Double.NaN;
        r.fftSize = fftSize;
        r.segments = segments;
        r.segmentSamples = seg;
        r.resolutionHz = df;
        r.overlapFraction = overlapFraction;
        return r;
    }
}
