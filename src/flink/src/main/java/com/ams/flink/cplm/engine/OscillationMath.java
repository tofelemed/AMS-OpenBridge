package com.ams.flink.cplm.engine;

import com.ams.flink.cplm.CplmDynamicsParameterSetSupport;
import com.ams.flink.cplm.CplmLongDiagnosticsResult;
import com.ams.flink.cplm.CplmLoopDynamicsProfile;
import com.ams.flink.cplm.CplmNormalizedSample;
import com.ams.flink.cplm.CplmShortFeatureResult;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * G5 autocorrelation period/regularity, G6 band-limited spectrum and the ACF/FFT period validation (harmonic fold).
 *
 * Moved verbatim out of CplmGateEngine in v2.5 (Task 1D.1, 400-line file rule);
 * no formula changed - the SYN-TIC-001 golden tests pin the numbers.
 */
public final class OscillationMath {
    private OscillationMath() {
    }

    public static AcfResult computeAcfPeriod(double[] x, double tsSec) {
        AcfResult r = new AcfResult();
        int n = x.length;
        if (n < 4) return r;

        double gamma0 = 0;
        for (double v : x) gamma0 += v * v;
        gamma0 /= n;
        r.gamma0 = gamma0;
        if (gamma0 < 1e-15) return r;

        int maxLag = Math.min(n / 2, 2000);
        double[] rho = new double[maxLag + 1];
        int[] pairs = new int[maxLag + 1];
        rho[0] = 1.0;
        pairs[0] = n;
        for (int k = 1; k <= maxLag; k++) {
            double gk = 0;
            for (int i = 0; i < n - k; i++) gk += x[i] * x[i + k];
            gk /= (n - k);
            rho[k] = gk / gamma0;
            pairs[k] = n - k;
        }
        // v2.5 (2C.1a): the ACF is the G5 evidence - retained verbatim (lags in seconds, pair counts)
        r.acf = rho;
        r.acfPairCount = pairs;
        r.acfLagS = new double[maxLag + 1];
        for (int k = 0; k <= maxLag; k++) r.acfLagS[k] = k * tsSec;

        List<Integer> zeroCrossings = new ArrayList<>();
        double lastSign = Math.signum(rho[0]);
        for (int k = 1; k < maxLag; k++) {
            if (Math.abs(rho[k]) > 1e-9) {
                double currentSign = Math.signum(rho[k]);
                if (lastSign != 0 && currentSign != lastSign) {
                    zeroCrossings.add(k);
                }
                lastSign = currentSign;
            }
        }

        List<Double> periods = new ArrayList<>();
        for (int j = 0; j + 1 < zeroCrossings.size(); j++) {
            int z1 = zeroCrossings.get(j);
            int z2 = zeroCrossings.get(j + 1);
            periods.add(2.0 * (z2 - z1) * tsSec);
        }
        r.zeroCrossingCount = zeroCrossings.size();
        r.periodCandidateCount = periods.size();
        r.crossingTimesS = new double[zeroCrossings.size()];
        for (int j = 0; j < zeroCrossings.size(); j++) r.crossingTimesS[j] = zeroCrossings.get(j) * tsSec;

        if (!periods.isEmpty()) {
            Collections.sort(periods);
            r.periodSec = periods.get(periods.size() / 2);
            double mean = SignalMath.mean(periods.stream().mapToDouble(d -> d).toArray());
            double std = SignalMath.popStd(periods.stream().mapToDouble(d -> d).toArray(), mean);
            r.regularity = std > 1e-9 ? Math.min(1.0, r.periodSec / (3.0 * std)) : 1.0;
        }
        return r;
    }

    public static FftResult computeFft(double[] x, double tsSec) {
        CplmLoopDynamicsProfile wide = CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.UNKNOWN);
        return computeFftBandLimited(x, tsSec, wide);
    }

    /**
     * FFT peak search restricted to periods in {@code [tauMinS, tauMaxS]} with peak-to-median quality.
     * Near-DC bins (period &gt; tauMax) are excluded by construction.
     */
    /**
     * v2.5 (2C.1b, spec §3.2): the band-limited spectrum is a Welch PSD in signal^2/Hz (Hann,
     * declared segment / overlap, zero-padded to a power of two). Every legacy scalar keeps its
     * name and meaning, derived from the PSD: bin "amplitude" = sqrt(psd * df) (the RMS in the bin),
     * peak ratio = peak bin energy / in-band energy, harmonic ratios from those amplitudes, entropy
     * over the normalised in-band energy. The spectrum itself is retained for the G6 evidence.
     */
    public static FftResult computeFftBandLimited(double[] x, double tsSec, CplmLoopDynamicsProfile profile) {
        FftResult r = new FftResult();
        int n = x.length;
        if (n < 8) return r;
        int segment = segmentSamplesForBand(n, tsSec, profile);
        double overlap = profile != null ? profile.g6OverlapFraction : 0.5;
        WelchPsd.Result w = WelchPsd.compute(x, tsSec, segment, overlap);
        if (w.psd.length == 0) return r;
        r.freqHz = w.freqHz;
        r.psd = w.psd;
        r.ordinateKind = WelchPsd.ORDINATE_KIND;
        r.spectralWindow = WelchPsd.WINDOW;
        r.fftSize = w.fftSize;
        r.resolutionHz = w.resolutionHz;
        r.segments = w.segments;
        r.segmentSamples = w.segmentSamples;
        r.overlapFraction = w.overlapFraction;
        // a Hann line occupies +-1 bin at native resolution; zero-padding to fftSize widens it by the same factor
        int lobe = (int) Math.ceil(1.0 * w.fftSize / w.segmentSamples);
        r.lobeHalfWidthBins = lobe;
        double df = w.resolutionHz;
        int kMax = w.psd.length - 1;
        double[] amplitudes = new double[kMax + 1];
        double bandEnergy = 0;
        int unboundedPeakBin = 1;
        double unboundedPeakAmp = 0;
        for (int k = 1; k <= kMax; k++) {
            double amp = Math.sqrt(Math.max(0, w.psd[k]) * df);
            amplitudes[k] = amp;
            bandEnergy += amp * amp;
            if (amp > unboundedPeakAmp) {
                unboundedPeakAmp = amp;
                unboundedPeakBin = k;
            }
        }
        double unboundedPeriod = (unboundedPeakBin * df) > 1e-15 ? 1.0 / (unboundedPeakBin * df) : 0;
        r.unboundedPeakPeriodSec = unboundedPeriod;

        // P2-1 (kept): a period must complete >= 3 cycles inside the record to be a candidate.
        double maxObservablePeriod = (n * tsSec) / 3.0;
        java.util.ArrayList<Double> inBandAmps = new java.util.ArrayList<>();
        java.util.ArrayList<Integer> inBandBins = new java.util.ArrayList<>();
        int peakBin = -1;
        double peakAmp = 0;
        double tauMin = profile != null ? profile.tauMinS : 0, tauMax = profile != null ? profile.tauMaxS : Double.POSITIVE_INFINITY;
        for (int k = 1; k <= kMax; k++) {
            double period = (k * df) > 1e-15 ? 1.0 / (k * df) : Double.POSITIVE_INFINITY;
            if (period < tauMin || period > tauMax) continue;
            if (period > maxObservablePeriod) continue;
            inBandAmps.add(amplitudes[k]);
            inBandBins.add(k);
            if (amplitudes[k] > peakAmp) {
                peakAmp = amplitudes[k];
                peakBin = k;
            }
        }
        double median = 0;
        if (!inBandAmps.isEmpty()) {
            java.util.ArrayList<Double> sorted = new java.util.ArrayList<>(inBandAmps);
            java.util.Collections.sort(sorted);
            median = sorted.get(sorted.size() / 2);
        }
        r.peakToMedian = median > 1e-15 ? peakAmp / median : 0;
        r.noiseReference = median * median / Math.max(df, 1e-15);      // the in-band median PSD level

        if (peakBin < 1) {
            r.peakBin = unboundedPeakBin;
            r.maxBin = kMax;
            r.peakAmplitude = unboundedPeakAmp;
            r.peakFreqHz = unboundedPeakBin * df;
            r.peakPeriodSec = 0;
            r.totalEnergy = bandEnergy;
            r.peakRatio = bandEnergy > 1e-15 ? (unboundedPeakAmp * unboundedPeakAmp) / bandEnergy : 0;
            r.peakIndices = new int[] {unboundedPeakBin};
            r.harmonicIndices = new int[0];
            return r;
        }

        r.peakBin = peakBin;
        r.maxBin = kMax;
        r.peakAmplitude = peakAmp;
        r.peakFreqHz = peakBin * df;
        r.peakPeriodSec = r.peakFreqHz > 1e-15 ? 1.0 / r.peakFreqHz : 0;
        // A Hann-windowed peak occupies a main lobe, not one bin: the oscillation's energy is the lobe's,
        // so the ratio (the oscillation's share of the band energy) sums the lobe.
        double peakEnergy = lobeEnergy(amplitudes, peakBin, kMax, lobe);
        r.totalEnergy = bandEnergy;
        r.peakRatio = bandEnergy > 1e-15 ? Math.min(1.0, peakEnergy / bandEnergy) : 0;

        double a1 = amplitudes[peakBin];
        double a2 = peakBin * 2 <= kMax ? amplitudes[peakBin * 2] : 0;
        double a3 = peakBin * 3 <= kMax ? amplitudes[peakBin * 3] : 0;
        double a5 = peakBin * 5 <= kMax ? amplitudes[peakBin * 5] : 0;
        r.h2Amp = a2;
        r.h3Amp = a3;
        r.h5Amp = a5;
        r.harmonicAmplitudeRatio = a1 > 1e-15 ? (a2 + a3 + a5) / a1 : 0;
        r.harmonicEnergyRatio = a1 > 1e-15 ? (a2 * a2 + a3 * a3 + a5 * a5) / (a1 * a1) : 0;
        r.peakIndices = new int[] {peakBin};
        java.util.ArrayList<Integer> harmonics = new java.util.ArrayList<>();
        for (int m : new int[] {2, 3, 5}) if (peakBin * m <= kMax) harmonics.add(peakBin * m);
        r.harmonicIndices = new int[harmonics.size()];
        for (int i = 0; i < harmonics.size(); i++) r.harmonicIndices[i] = harmonics.get(i);

        // Entropy over the normalised band energy with each main lobe merged into its centre bin
        // (a windowed line is ONE component, not three): a pure sine stays near 0, noise near 1.
        int kBand = Math.min(kMax, Math.max(peakBin * 3, 32));
        r.entropyBinCount = kBand;
        double[] comp = new double[kBand + 1];
        for (int k = 1; k <= kBand; k++) comp[k] = amplitudes[k] * amplitudes[k];
        for (int centre : lobeCentres(peakBin, kMax, kBand)) {
            for (int k = centre - lobe; k <= centre + lobe; k++) {
                if (k < 1 || k > kBand || k == centre) continue;
                comp[centre] += comp[k];
                comp[k] = 0;
            }
        }
        double sumE = 0;
        for (int k = 1; k <= kBand; k++) sumE += comp[k];
        double entropy = 0;
        if (sumE > 1e-15) {
            for (int k = 1; k <= kBand; k++) {
                double p = comp[k] / sumE;
                if (p > 1e-15) entropy -= p * Math.log(p);
            }
            entropy /= Math.log(kBand);
        }
        r.spectralEntropy = entropy;
        return r;
    }

    private static double lobeEnergy(double[] amplitudes, int centre, int kMax, int lobe) {
        double e = 0;
        for (int k = Math.max(1, centre - lobe); k <= Math.min(kMax, centre + lobe); k++) e += amplitudes[k] * amplitudes[k];
        return e;
    }

    /**
     * The Welch segment: at least the profile floor, raised so one segment spans g6BandCyclesPerSegment
     * cycles of the longest in-band period (tauMaxS) - a spectrum that cannot resolve its own band is not
     * a spectrum of that band - rounded up to a power of two while that fits, and never longer than the record
     * (then it is one Hann periodogram of the whole record).
     */
    static int segmentSamplesForBand(int n, double tsSec, CplmLoopDynamicsProfile profile) {
        int floor = profile != null && profile.g6SegmentSamples > 0 ? profile.g6SegmentSamples : 256;
        double cycles = profile != null && profile.g6BandCyclesPerSegment > 0 ? profile.g6BandCyclesPerSegment : 4;
        double tauMax = profile != null && Double.isFinite(profile.tauMaxS) && profile.tauMaxS > 0 ? profile.tauMaxS : 0;
        int needed = tauMax > 0 && tsSec > 0 ? (int) Math.ceil(cycles * tauMax / tsSec) : floor;
        int segment = Math.max(floor, needed);
        if (segment >= n) return n;
        int pow2 = Integer.highestOneBit(segment);
        if (pow2 < segment) pow2 <<= 1;
        return pow2 <= n ? pow2 : n;
    }

    /** The fundamental and its 2nd/3rd/5th harmonics inside the entropy band, each treated as one component. */
    private static java.util.List<Integer> lobeCentres(int peakBin, int kMax, int kBand) {
        java.util.List<Integer> c = new java.util.ArrayList<>();
        for (int m : new int[] {1, 2, 3, 5}) if (peakBin * m <= Math.min(kMax, kBand)) c.add(peakBin * m);
        return c;
    }

    public static ValidPeriod resolveValidPeriod(
            AcfResult acf, FftResult fft, double tsSec, CplmLoopDynamicsProfile profile) {
        ValidPeriod out = new ValidPeriod();
        boolean acfOk = acf.periodSec > 0
                && profile.isPeriodInBand(acf.periodSec, tsSec)
                && acf.regularity >= profile.acfRegularityMin;
        if (acfOk) {
            out.status = "VALID";
            out.periodS = acf.periodSec;
            out.source = "ACF";
            return out;
        }
        boolean fftOk = fft.peakPeriodSec > 0
                && profile.isPeriodInBand(fft.peakPeriodSec, tsSec)
                && fft.peakToMedian >= profile.fftPeakToMedianMin;
        if (fftOk) {
            out.status = "VALID";
            out.periodS = fft.peakPeriodSec;
            out.source = "FFT";
            // P3-4 (partial) - adjacent windows flipped 1200 -> 430 -> 3520 s on
            // the same signal: when ACF regularity dips below its gate for one
            // window, the fallback FFT peak is often a HARMONIC of the real
            // cycle (430 ~= 1290/3), which then flips G9 between bands on pure
            // noise. If the weakly-regular ACF cycle is an (approximate) small-
            // integer multiple of the FFT peak, the two estimators corroborate
            // one fundamental - publish that instead of the harmonic. The
            // ACF-regular path above is untouched. Cross-window period
            // persistence (like the family-level applyPersistence) is the full
            // fix and stays backlog.
            if (acf.periodSec > fft.peakPeriodSec
                    && profile.isPeriodInBand(acf.periodSec, tsSec)) {
                double ratio = acf.periodSec / fft.peakPeriodSec;
                long k = Math.round(ratio);
                if (k >= 2 && k <= 5 && Math.abs(ratio - k) <= 0.15 * k) {
                    double folded = fft.peakPeriodSec * k;
                    if (profile.isPeriodInBand(folded, tsSec)) {
                        out.periodS = folded;
                        out.source = "FFT_HARMONIC_FOLD";
                    }
                }
            }
            return out;
        }
        out.status = "NO_VALID_CYCLE";
        if (acf.periodSec > 0 && !profile.isPeriodInBand(acf.periodSec, tsSec)) {
            out.rejectReason = "PERIOD_OUT_OF_BAND";
        } else if (fft.unboundedPeakPeriodSec > profile.tauMaxS) {
            out.rejectReason = "PERIOD_OUT_OF_BAND";
        } else {
            out.rejectReason = "NO_VALID_CYCLE";
        }
        return out;
    }

    public static class AcfResult {
        double periodSec;
        double regularity;
        double gamma0;
        int zeroCrossingCount;
        int periodCandidateCount;
        /** v2.5 (2C.1a) retained evidence: rho[k] at lag k (seconds in acfLagS), pairs per lag, zero-crossing times. */
        public double[] acf = new double[0];
        public double[] acfLagS = new double[0];
        public int[] acfPairCount = new int[0];
        public double[] crossingTimesS = new double[0];
    }

    public static class FftResult {
        int peakBin;
        int maxBin;
        double peakAmplitude;
        double peakFreqHz;
        double peakPeriodSec;
        double peakRatio;
        double totalEnergy;
        double h2Amp;
        double h3Amp;
        double h5Amp;
        int entropyBinCount;
        double harmonicAmplitudeRatio;
        double harmonicEnergyRatio;
        double spectralEntropy;
        double peakToMedian;
        double unboundedPeakPeriodSec;
        /** v2.5 (2C.1b) retained evidence: the PSD itself and how it was made (spec §3.2 G6 artifact fields). */
        public double[] freqHz = new double[0], psd = new double[0];
        public String ordinateKind = "NONE", spectralWindow = "NONE";
        public int fftSize, segments, segmentSamples, lobeHalfWidthBins;
        public double resolutionHz, noiseReference, overlapFraction;
        public int[] peakIndices = new int[0], harmonicIndices = new int[0];
    }

    public static class ValidPeriod {
        String status = "NO_VALID_CYCLE";
        double periodS;
        String source = "NONE";
        String rejectReason = "NO_VALID_CYCLE";
    }
}
