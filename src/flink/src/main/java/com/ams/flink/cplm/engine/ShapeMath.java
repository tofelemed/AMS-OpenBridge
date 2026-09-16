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
 * G7 sine/triangle cycle shape, G8 cross-correlation asymmetry (published as horch_oddness) and G9 PV-OP phase-plane geometry.
 *
 * Moved verbatim out of CplmGateEngine in v2.5 (Task 1D.1, 400-line file rule);
 * no formula changed - the SYN-TIC-001 golden tests pin the numbers.
 */
public final class ShapeMath {
    public static final int HORCH_MAX_LAG = 200;
    /** Legacy default; dynamics-aware path uses profile.cornerAngleDeg. */
    public static final double CORNER_ANGLE_THRESHOLD = Math.toRadians(45);

    private ShapeMath() {
    }

    /**
     * Gate 7 — OP-cycle triangularity (stiction shape).
     *
     * Previous win-rate ({@code SSE_tri < SSE_sin} per cycle) was brittle: noisy but clearly
     * triangular OP cycles often lost to the sine LS fit and scored 0, so visible triangles
     * in the stream produced near-zero triangularity.
     *
     * Corrected continuous score per valid cycle (then averaged):
     * <pre>
     *   s[i]     = min-max normalize OP cycle to [-1, 1]
     *   SSE_sin  = LS fit of a·sin(2πt)+b·cos(2πt)
     *   SSE_tri  = min over phase of LS-scaled template 1-4|t-0.5|
     *   score    = SSE_sin / (SSE_sin + SSE_tri)   ∈ [0,1]
     * </pre>
     * Perfect triangle → score ≈ 1; perfect sine → score ≈ 0.
     */
    public static TriangularityResult computeTriangularity(double[] op, int cycleSamples) {
        TriangularityResult r = new TriangularityResult();
        if (cycleSamples < 4 || op.length < cycleSamples) {
            r.triangularity = 0;
            return r;
        }
        int cycles = op.length / cycleSamples;
        r.completedCycles = cycles;
        double scoreSum = 0;
        int validCycles = 0;
        for (int c = 0; c < cycles; c++) {
            int start = c * cycleSamples;
            double min = Double.POSITIVE_INFINITY, max = Double.NEGATIVE_INFINITY;
            for (int i = 0; i < cycleSamples; i++) {
                double v = op[start + i];
                min = Math.min(min, v);
                max = Math.max(max, v);
            }
            double span = max - min;
            if (span < 1e-12) {
                CycleFit rejected = new CycleFit();
                rejected.cycleId = c;
                rejected.startIndex = start;
                rejected.length = cycleSamples;
                rejected.accepted = false;
                rejected.rejectReason = "FLAT_CYCLE";
                r.cycles.add(rejected);
                continue;
            }

            double[] s = new double[cycleSamples];
            for (int i = 0; i < cycleSamples; i++) {
                s[i] = 2.0 * (op[start + i] - min) / span - 1.0;
            }

            double sinA = 0, sinB = 0;
            for (int i = 0; i < cycleSamples; i++) {
                double t = (double) i / cycleSamples;
                sinA += s[i] * Math.sin(2 * Math.PI * t);
                sinB += s[i] * Math.cos(2 * Math.PI * t);
            }
            sinA *= 2.0 / cycleSamples;
            sinB *= 2.0 / cycleSamples;
            double sseSin = 0;
            for (int i = 0; i < cycleSamples; i++) {
                double t = (double) i / cycleSamples;
                double sinFit = sinA * Math.sin(2 * Math.PI * t) + sinB * Math.cos(2 * Math.PI * t);
                double e = s[i] - sinFit;
                sseSin += e * e;
            }

            double minSseTri = Double.POSITIVE_INFINITY;
            int bestShift = 0;
            double bestScale = 0;
            for (int shift = 0; shift < cycleSamples; shift++) {
                double dot = 0, energy = 0;
                for (int i = 0; i < cycleSamples; i++) {
                    double t = (double) ((i + shift) % cycleSamples) / cycleSamples;
                    double tri = 1.0 - 4.0 * Math.abs(t - 0.5);
                    dot += s[i] * tri;
                    energy += tri * tri;
                }
                double scale = energy > 1e-15 ? dot / energy : 0;
                double currentSseTri = 0;
                for (int i = 0; i < cycleSamples; i++) {
                    double t = (double) ((i + shift) % cycleSamples) / cycleSamples;
                    double tri = scale * (1.0 - 4.0 * Math.abs(t - 0.5));
                    double e = s[i] - tri;
                    currentSseTri += e * e;
                }
                if (currentSseTri < minSseTri) {
                    minSseTri = currentSseTri;
                    bestShift = shift;
                    bestScale = scale;
                }
            }

            double denom = sseSin + minSseTri;
            double cycleScore = denom > 1e-15 ? sseSin / denom : 0.5;
            scoreSum += cycleScore;
            if (validCycles == 0) {
                r.firstCycleSseSine = sseSin;
                r.firstCycleSseTriangle = minSseTri;
            }
            validCycles++;

            // v2.5 (2C.1a): the G7 evidence - the normalised cycle, both fits, and the score, per cycle
            CycleFit fit = new CycleFit();
            fit.cycleId = c;
            fit.startIndex = start;
            fit.length = cycleSamples;
            fit.accepted = true;
            fit.measured = s;
            fit.phase = new double[cycleSamples];
            fit.sineFit = new double[cycleSamples];
            fit.triangleFit = new double[cycleSamples];
            for (int i = 0; i < cycleSamples; i++) {
                double t = (double) i / cycleSamples;
                fit.phase[i] = t;
                fit.sineFit[i] = sinA * Math.sin(2 * Math.PI * t) + sinB * Math.cos(2 * Math.PI * t);
                double tt = (double) ((i + bestShift) % cycleSamples) / cycleSamples;
                fit.triangleFit[i] = bestScale * (1.0 - 4.0 * Math.abs(tt - 0.5));
            }
            fit.amplitude = Math.hypot(sinA, sinB);
            fit.phaseRad = Math.atan2(sinB, sinA);
            fit.sseSine = sseSin;
            fit.sseTriangle = minSseTri;
            fit.score = cycleScore;
            r.cycles.add(fit);
        }
        r.validCycles = validCycles;
        r.triangularity = validCycles > 0 ? scoreSum / validCycles : 0;
        return r;
    }

    public static HorchResult computeHorch(double[] op, double[] pv) {
        HorchResult r = new HorchResult();
        int n = Math.min(op.length, pv.length);
        if (n < HORCH_MAX_LAG + 2) return r;

        double opMean = SignalMath.mean(op);
        double pvMean = SignalMath.mean(pv);
        double opStd = SignalMath.popStd(op, opMean);
        double pvStd = SignalMath.popStd(pv, pvMean);
        if (opStd < 1e-12 || pvStd < 1e-12) return r;

        double oddSum = 0, evenSum = 0;
        int maxLag = Math.min(HORCH_MAX_LAG, n / 4);
        r.lagIndex = new double[maxLag];
        r.phiPositive = new double[maxLag];
        r.phiNegative = new double[maxLag];
        r.oddContribution = new double[maxLag];
        r.evenContribution = new double[maxLag];
        for (int k = 1; k <= maxLag; k++) {
            double phiPos = 0, phiNeg = 0;
            int countPos = n - k;
            int countNeg = n - k;
            for (int i = 0; i < n - k; i++) {
                double u = (op[i] - opMean) / opStd;
                double y = (pv[i] - pvMean) / pvStd;
                double uL = (op[i + k] - opMean) / opStd;
                double yL = (pv[i + k] - pvMean) / pvStd;
                phiPos += u * yL;
                phiNeg += uL * y;
            }
            phiPos /= countPos;
            phiNeg /= countNeg;
            oddSum += Math.abs(phiPos - phiNeg);
            evenSum += Math.abs(phiPos + phiNeg);
            r.lagIndex[k - 1] = k;                               // lag in samples; the caller scales by the period
            r.phiPositive[k - 1] = phiPos;
            r.phiNegative[k - 1] = phiNeg;
            r.oddContribution[k - 1] = Math.abs(phiPos - phiNeg);
            r.evenContribution[k - 1] = Math.abs(phiPos + phiNeg);
        }
        r.oddSum = oddSum;
        r.evenSum = evenSum;
        double denom = oddSum + evenSum;
        r.oddness = denom > 1e-15 ? oddSum / denom : 0;
        return r;
    }

    public static GeometryResult computeGeometry(
            double[] pv, double[] op, int completedCycles, CplmLoopDynamicsProfile profile) {
        GeometryResult r = new GeometryResult();
        int n = Math.min(pv.length, op.length);
        if (n < 3) return r;

        double pvMin = SignalMath.min(pv), pvMax = SignalMath.max(pv);
        double opMin = SignalMath.min(op), opMax = SignalMath.max(op);
        double bbox = (pvMax - pvMin) * (opMax - opMin);
        r.bboxArea = bbox;
        if (bbox < 1e-12) return r;

        // P3-1 - the old shoelace summed signed cross-products over the whole
        // window and took abs AFTER summation, with no closure edge: counter-
        // rotating sub-loops cancelled toward zero, and multiply-wound
        // trajectories summed past the bounding box (window_area_norm hit
        // 1.17 on live data - impossible for a fraction). With a validated
        // period, each completed cycle is shoelaced as its own CLOSED polygon
        // and the magnitudes averaged: opposite-handed cycles no longer
        // cancel, extra windings cannot exceed the bbox, and on a clean
        // single-handed oscillation the value matches the old formula.
        // window_area_norm and the per-cycle norm are then the same [0,1]
        // fraction; without a validated period the whole path is closed and
        // shoelaced as one polygon (per-cycle stays 0, as before).
        if (completedCycles > 0 && n / completedCycles >= 3) {
            int len = n / completedCycles;
            double absSum = 0;
            for (int c = 0; c < completedCycles; c++) {
                int s = c * len;
                int e = (c == completedCycles - 1) ? n : s + len; // last chunk absorbs remainder
                double a = 0;
                for (int i = s; i < e - 1; i++) {
                    a += pv[i] * op[i + 1] - pv[i + 1] * op[i];
                }
                a += pv[e - 1] * op[s] - pv[s] * op[e - 1]; // closure edge
                absSum += 0.5 * Math.abs(a);
                // v2.5 (2C.1a): the G9 evidence - each closed cycle polygon in normalised coordinates
                CyclePolygon poly = new CyclePolygon();
                poly.cycleId = c;
                poly.startIndex = s;
                poly.endIndex = e;
                poly.pvNorm = new double[e - s];
                poly.uNorm = new double[e - s];
                for (int i = s; i < e; i++) {
                    poly.pvNorm[i - s] = (pv[i] - pvMin) / (pvMax - pvMin);
                    poly.uNorm[i - s] = (op[i] - opMin) / (opMax - opMin);
                }
                poly.area = 0.5 * Math.abs(a);
                poly.bboxArea = bbox;
                r.polygons.add(poly);
            }
            double perCycleArea = absSum / completedCycles;
            r.pathArea = absSum;
            r.windowAreaNorm = perCycleArea / bbox;
            r.cycleNormalizedArea = perCycleArea / bbox;
        } else {
            double area = 0;
            for (int i = 0; i < n - 1; i++) {
                area += pv[i] * op[i + 1] - pv[i + 1] * op[i];
            }
            area += pv[n - 1] * op[0] - pv[0] * op[n - 1]; // closure edge
            area = 0.5 * Math.abs(area);
            r.pathArea = area;
            r.windowAreaNorm = area / bbox;
            r.cycleNormalizedArea = 0;
        }

        double[] pvForCorners = pv;
        if (profile != null && "ewma".equalsIgnoreCase(profile.pvFilterType) && profile.pvFilterWindow > 1) {
            pvForCorners = SignalMath.ewma(pv, profile.pvFilterWindow);
        }

        double cornerRad = profile != null
                ? Math.toRadians(profile.cornerAngleDeg)
                : CORNER_ANGLE_THRESHOLD;
        double opDeadband = profile != null ? profile.opDeadbandPct : 0;

        double sumAngleRaw = 0, sumSharpRaw = 0;
        double sumAngleQual = 0, sumSharpQual = 0;
        int validAngles = 0;
        int validQual = 0;
        r.turningAngleRad = new double[n];
        r.cornerMask = new boolean[n];
        r.qualifiedMask = new boolean[n];
        for (int i = 1; i < n - 1; i++) {
            double dx1 = pvForCorners[i] - pvForCorners[i - 1];
            double dy1 = op[i] - op[i - 1];
            double dx2 = pvForCorners[i + 1] - pvForCorners[i];
            double dy2 = op[i + 1] - op[i];
            double mag1 = Math.hypot(dx1, dy1);
            double mag2 = Math.hypot(dx2, dy2);
            if (mag1 < 1e-12 || mag2 < 1e-12) continue;
            double dot = dx1 * dx2 + dy1 * dy2;
            double cos = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
            double angle = Math.acos(cos);
            sumAngleRaw += angle;
            validAngles++;
            if (angle >= cornerRad) sumSharpRaw += angle;
            r.turningAngleRad[i] = angle;
            r.cornerMask[i] = angle >= cornerRad;

            // Qualified vertex: |ΔOP| at this step must exceed deadband (flat-OP zigzags score zero).
            double dOp = Math.max(Math.abs(dy1), Math.abs(dy2));
            if (dOp < opDeadband) continue;
            r.qualifiedMask[i] = true;
            sumAngleQual += angle;
            validQual++;
            if (angle >= cornerRad) sumSharpQual += angle;
        }
        r.validTurningAngles = validAngles;
        r.cornerScoreRaw = sumAngleRaw > 1e-15 ? sumSharpRaw / sumAngleRaw : 0;
        r.cornerScoreQualified = sumAngleQual > 1e-15 ? sumSharpQual / sumAngleQual : 0;
        if (validQual == 0 && opDeadband > 0) {
            // Explicit noise-floor signal when OP never moves through a vertex.
            r.cornerScoreQualified = 0;
        }
        // P2-4 REVERTED after the golden gate caught it: cornerScoreQualified
        // is 0.0 on the SYN_TIC_001 stiction REFERENCE loop (the OP-deadband
        // vertex gate discards even genuine corners there), so promoting it to
        // the headline would blind the metric on exactly the case it exists to
        // catch. Raw stays the published corner_score (noise-sensitive - see
        // the catalogue caveat); both variants remain published for diagnosis.
        // A calibrated corner statistic is backlog work, not an alias swap.
        r.cornerScore = r.cornerScoreRaw;
        return r;
    }

    /** v2.5 (2C.1a): one G7 cycle - the normalised measured cycle, both fits and the score; rejected cycles carry a reason. */
    public static final class CycleFit implements java.io.Serializable {
        private static final long serialVersionUID = 1L;
        public int cycleId, startIndex, length;
        public boolean accepted;
        public String rejectReason = "";
        public double[] phase = new double[0], measured = new double[0], sineFit = new double[0], triangleFit = new double[0];
        public double amplitude, phaseRad, sseSine, sseTriangle, score;
    }

    /** v2.5 (2C.1a): one G9 closed cycle polygon in normalised PV / applied-input coordinates. */
    public static final class CyclePolygon implements java.io.Serializable {
        private static final long serialVersionUID = 1L;
        public int cycleId, startIndex, endIndex;
        public double[] pvNorm = new double[0], uNorm = new double[0];
        public double area, bboxArea;
    }

    public static class TriangularityResult {
        int completedCycles;
        int validCycles;
        double firstCycleSseSine;
        double firstCycleSseTriangle;
        double triangularity;
        /** v2.5 (2C.1a) retained evidence: every cycle, accepted or rejected. */
        public java.util.List<CycleFit> cycles = new java.util.ArrayList<>();
    }

    public static class HorchResult {
        double oddness;
        double oddSum;
        double evenSum;
        /** v2.5 (2C.1a) retained evidence per lag (lag in samples; multiply by the period for seconds). */
        public double[] lagIndex = new double[0], phiPositive = new double[0], phiNegative = new double[0], oddContribution = new double[0], evenContribution = new double[0];
    }

    public static class GeometryResult {
        double windowAreaNorm;
        double cycleNormalizedArea;
        double bboxArea;
        double pathArea;
        int validTurningAngles;
        double cornerScore;
        double cornerScoreRaw;
        double cornerScoreQualified;
        /** v2.5 (2C.1a) retained evidence: per-cycle polygons; per-sample turning angle, corner and qualification masks. */
        public java.util.List<CyclePolygon> polygons = new java.util.ArrayList<>();
        public double[] turningAngleRad = new double[0];
        public boolean[] cornerMask = new boolean[0], qualifiedMask = new boolean[0];
    }
}
