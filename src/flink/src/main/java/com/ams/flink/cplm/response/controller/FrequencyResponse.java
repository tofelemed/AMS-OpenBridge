package com.ams.flink.cplm.response.controller;

import com.ams.flink.cplm.response.model.ProcessModel;
import com.ams.flink.cplm.response.model.Quantity;
import org.apache.commons.math3.complex.Complex;

import java.util.ArrayList;
import java.util.List;

/**
 * Model-domain frequency outputs (spec §2.9): L = C G with the delay, S = 1/(1+L), T = L/(1+L) on a
 * log grid; ALL unity-gain and phase crossings retained (the reported one is the lowest), GM at
 * the phase crossover, PM at the gain crossover, peak |S| / |T|, closed-loop -3 dB bandwidth of T.
 * Unknown controller form or an unvalidated model -> UNAVAILABLE with the catalogue reason.
 */
public final class FrequencyResponse {
    public static final String METHOD = "MODEL_DOMAIN_FREQUENCY_V1";
    public static final String NO_CROSSING = "UNKNOWN_CONTROLLER_OR_NO_VALID_CROSSING";

    public static final class Result {
        public final Quantity gainMarginDb, phaseMarginDeg, gainCrossover, phaseCrossover, peakS, peakT, bandwidth;
        public final double[] omega, magL, phaseL, magS, magT;
        public final double[] gainCrossings, phaseCrossings;

        Result(Quantity gm, Quantity pm, Quantity gc, Quantity pc, Quantity ps, Quantity pt, Quantity bw,
               double[] omega, double[] magL, double[] phaseL, double[] magS, double[] magT, double[] gcs, double[] pcs) {
            gainMarginDb = gm;
            phaseMarginDeg = pm;
            gainCrossover = gc;
            phaseCrossover = pc;
            peakS = ps;
            peakT = pt;
            bandwidth = bw;
            this.omega = omega;
            this.magL = magL;
            this.phaseL = phaseL;
            this.magS = magS;
            this.magT = magT;
            gainCrossings = gcs;
            phaseCrossings = pcs;
        }
    }

    private FrequencyResponse() {}

    public static Complex process(ProcessModel m, double w) {
        Complex s = new Complex(0, w);
        Complex g;
        switch (m.family) {
            case FOPDT:
                g = s.multiply(m.tau).add(1).reciprocal().multiply(m.gain);
                break;
            case SOPDT:
                g = s.multiply(m.tau).add(1).multiply(s.multiply(m.tau2).add(1)).reciprocal().multiply(m.gain);
                break;
            case SO_UNDERDAMPED:
                g = s.multiply(s).add(s.multiply(2 * m.zeta * m.wn)).add(m.wn * m.wn).reciprocal().multiply(m.gain * m.wn * m.wn);
                break;
            case IPDT:
                g = s.reciprocal().multiply(m.gain);
                break;
            default:
                g = s.multiply(s.multiply(m.tau).add(1)).reciprocal().multiply(m.gain);
                break;
        }
        return g.multiply(new Complex(Math.cos(-w * m.theta), Math.sin(-w * m.theta)));
    }

    public static Complex controller(ControllerSnapshot c, double w) {
        ControllerSnapshot i = ControllerFormAdapter.toIdeal(c);
        Complex s = new Complex(0, w);
        Complex out = new Complex(1, 0);
        if (i.ti != null && i.ti > 0) out = out.add(s.multiply(i.ti).reciprocal());
        if (i.td != null && i.td > 0) out = out.add(s.multiply(i.td));
        return out.multiply(i.kc);
    }

    public static Result of(ProcessModel m, ControllerSnapshot c, double wMin, double wMax, int points, boolean modelValidated) {
        if (!modelValidated) return unavailable("MODEL_DOMAIN_UNAVAILABLE");
        if (c == null || !c.known()) return unavailable(NO_CROSSING);
        double[] w = new double[points], magL = new double[points], phL = new double[points], magS = new double[points], magT = new double[points];
        double logMin = Math.log10(wMin), logMax = Math.log10(wMax);
        double peakS = 0, peakT = 0, bw = Double.NaN;
        List<Double> gcs = new ArrayList<>(), pcs = new ArrayList<>();
        double prevMag = Double.NaN, prevPh = Double.NaN;
        Complex l0 = process(m, wMin).multiply(controller(c, wMin));
        double tAtZero = l0.divide(l0.add(1)).abs();
        for (int k = 0; k < points; k++) {
            w[k] = Math.pow(10, logMin + (logMax - logMin) * k / (points - 1));
            Complex l = process(m, w[k]).multiply(controller(c, w[k]));
            magL[k] = l.abs();
            phL[k] = unwrap(Math.toDegrees(l.getArgument()), k > 0 ? phL[k - 1] : Double.NaN);
            Complex sOne = l.add(1).reciprocal();
            magS[k] = sOne.abs();
            magT[k] = l.multiply(sOne).abs();
            peakS = Math.max(peakS, magS[k]);
            peakT = Math.max(peakT, magT[k]);
            if (Double.isNaN(bw) && magT[k] < tAtZero / Math.sqrt(2)) bw = w[k];
            if (k > 0) {
                if ((prevMag - 1) * (magL[k] - 1) < 0) gcs.add(interp(w[k - 1], w[k], prevMag - 1, magL[k] - 1));
                if ((prevPh + 180) * (phL[k] + 180) < 0) pcs.add(interp(w[k - 1], w[k], prevPh + 180, phL[k] + 180));
            }
            prevMag = magL[k];
            prevPh = phL[k];
        }
        Quantity gc = gcs.isEmpty() ? Quantity.unavailable("gain_crossover", "rad/s", "NO_VALID_CROSSING") : Quantity.of("gain_crossover", gcs.get(0), "rad/s", METHOD);
        Quantity pc = pcs.isEmpty() ? Quantity.unavailable("phase_crossover", "rad/s", "NO_VALID_CROSSING") : Quantity.of("phase_crossover", pcs.get(0), "rad/s", METHOD);
        Quantity pm = gcs.isEmpty()
                ? Quantity.unavailable("phase_margin", "degree", NO_CROSSING)
                : Quantity.of("phase_margin", 180 + Math.toDegrees(process(m, gcs.get(0)).multiply(controller(c, gcs.get(0))).getArgument()), "degree", METHOD);
        Quantity gm = pcs.isEmpty()
                ? Quantity.unavailable("gain_margin", "dB", NO_CROSSING)
                : Quantity.of("gain_margin", -20 * Math.log10(process(m, pcs.get(0)).multiply(controller(c, pcs.get(0))).abs()), "dB", METHOD);
        return new Result(gm, pm, gc, pc,
                Quantity.of("peak_sensitivity", peakS, "dimensionless", METHOD),
                Quantity.of("peak_complementary_sensitivity", peakT, "dimensionless", METHOD),
                Double.isNaN(bw) ? Quantity.unavailable("closed_loop_bandwidth", "rad/s", "NO_VALID_BANDWIDTH") : Quantity.of("closed_loop_bandwidth", bw, "rad/s", METHOD),
                w, magL, phL, magS, magT, toArray(gcs), toArray(pcs));
    }

    private static Result unavailable(String reason) {
        return new Result(Quantity.unavailable("gain_margin", "dB", reason), Quantity.unavailable("phase_margin", "degree", reason),
                Quantity.unavailable("gain_crossover", "rad/s", reason), Quantity.unavailable("phase_crossover", "rad/s", reason),
                Quantity.unavailable("peak_sensitivity", "dimensionless", reason), Quantity.unavailable("peak_complementary_sensitivity", "dimensionless", reason),
                Quantity.unavailable("closed_loop_bandwidth", "rad/s", reason),
                new double[0], new double[0], new double[0], new double[0], new double[0], new double[0], new double[0]);
    }

    private static double unwrap(double deg, double prev) {
        if (Double.isNaN(prev)) return deg;
        while (deg - prev > 180) deg -= 360;
        while (deg - prev < -180) deg += 360;
        return deg;
    }

    private static double interp(double w0, double w1, double f0, double f1) {
        return w0 + (w1 - w0) * (-f0) / (f1 - f0);
    }

    private static double[] toArray(List<Double> l) {
        double[] a = new double[l.size()];
        for (int i = 0; i < a.length; i++) a[i] = l.get(i);
        return a;
    }
}
