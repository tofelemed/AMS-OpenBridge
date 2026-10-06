package com.ams.flink.cplm.evidence;

import com.ams.flink.cplm.CplmLongDiagnosticsResult;
import com.ams.flink.cplm.engine.LimitMath;
import com.ams.flink.cplm.engine.LongIntermediates;
import com.ams.flink.cplm.engine.OscillationMath;
import com.ams.flink.cplm.engine.ShapeMath;

import java.util.ArrayList;
import java.util.List;

/**
 * v2.5 Task 2C.1c (spec §3.1, xlsx_Gate_evidence.tsv): the exact intermediates of the long tier
 * (G5-G11) as evidence artifacts with the workbook's field names, read from the calculator's
 * retained {@link LongIntermediates} (2C.1a) - the ACF with its lags and pair counts, the Welch
 * PSD with how it was made, every cycle fit including the rejected ones, the lag structure, the
 * cycle polygons, the limit and freeze episodes with their per-sample flags. G8's bicoherence is
 * absent with a capability reason, never a picture of an uncomputed method.
 */
public final class LongArtifacts {
    public static final String G8_METHOD_ID = "XCORR_ASYMMETRY_V1";

    private LongArtifacts() {}

    public static List<EvidenceArtifact> artifacts(CplmLongDiagnosticsResult r) { return artifacts(r, 0); }

    /** CHG-049: maxCycles caps the G7/G9 per-cycle artifacts (evenly spaced, ends kept); <= 0 = every cycle. */
    public static List<EvidenceArtifact> artifacts(CplmLongDiagnosticsResult r, int maxCycles) {
        List<EvidenceArtifact> out = new ArrayList<>();
        if (r == null || r.methodRunIds == null) return out;
        out.addAll(LongEvidence.artifacts(r));                                  // G10 dwell_events / G11 freeze_events tables (1G.3)
        LongIntermediates k = r.intermediates;
        if (k == null || k.tsMs.length == 0) return out;
        String g5 = r.methodRunIds.get("G5");
        if (g5 != null && k.acf != null) {
            out.add(stamp(acfSeries(g5, k), r));
            out.add(stamp(preprocessed(g5, "G5", k), r));
            out.add(stamp(crossingTimes(g5, k), r));
        }
        String g6 = r.methodRunIds.get("G6");
        if (g6 != null && k.fft != null && k.fft.psd.length > 0) out.add(stamp(psd(g6, k), r));
        String g7 = r.methodRunIds.get("G7");
        if (g7 != null && k.triangularity != null && !k.triangularity.cycles.isEmpty()) {
            List<ShapeMath.CycleFit> cs = k.triangularity.cycles;
            int[] pick = CycleSampling.pick(cs.size(), maxCycles);
            for (int i : pick) out.add(stamp(cycleFit(g7, cs.get(i)), r));
            out.add(stamp(cycleScores(g7, cs, pick.length), r));      // CHG-049: every cycle's score survives the cap
        }
        String g8 = r.methodRunIds.get("G8");
        if (g8 != null && k.horch != null && k.horch.lagIndex.length > 0) out.add(stamp(lagStructure(g8, k), r));
        String g9 = r.methodRunIds.get("G9");
        if (g9 != null && k.geometry != null) {
            List<ShapeMath.CyclePolygon> ps = k.geometry.polygons;
            for (int i : CycleSampling.pick(ps.size(), maxCycles)) {
                out.add(stamp(cyclePolygon(g9, ps.get(i), k), r));
                out.add(stamp(normalizedPairs(g9, ps.get(i)), r));
            }
            if (k.geometry.turningAngleRad.length > 0) out.add(stamp(corners(g9, k), r));
        }
        String g10 = r.methodRunIds.get("G10");
        if (g10 != null && k.saturation != null) out.add(stamp(actuatorLimits(g10, k, r), r));
        String g11 = r.methodRunIds.get("G11");
        if (g11 != null && k.deltaPv != null) out.add(stamp(measurement(g11, k, r), r));
        // v2.5 (2F.1): G13 lives on the long tier - the record plus per-peer aligned series, xcorr, coherence
        String g13 = r.methodRunIds.get("G13");
        if (g13 != null && k.interaction != null) for (EvidenceArtifact a : InteractionArtifacts.artifacts(g13, k.interaction, r.interaction)) out.add(stamp(a, r));
        return out;
    }

    private static EvidenceArtifact stamp(EvidenceArtifact a, CplmLongDiagnosticsResult r) {
        ArtifactSupport.stamp(a, r.loopId, r.windowKind, r.windowStartMs, r.windowEndMs, r.bundleHash, r.datasetHash);
        return a;
    }

    private static String shapeRole(LongIntermediates k) {
        return k.shapeRole == null ? "OP" : k.shapeRole;
    }

    /** G5: acf_lag_s, acf_value, acf_pair_count (+ accepted_cycles, regularity_method). */
    static EvidenceArtifact acfSeries(String runId, LongIntermediates k) {
        OscillationMath.AcfResult acf = k.acf;
        EvidenceArtifact a = EvidenceArtifact.series(runId, "G5", "acf_series", shapeRole(k), "acf_lag_s", "s", "acf_value", "1", acf.acfLagS, acf.acf, null);
        a.column("acf_pair_count", "count", ArtifactSupport.of(acf.acfPairCount));
        a.provenance.put("accepted_cycles", acf.periodCandidateCount());
        a.provenance.put("regularity_method", "ACF_PEAK_REGULARITY_V1");
        a.provenance.put("period_s", acf.periodSec());
        a.provenance.put("regularity", acf.regularity());
        return a;
    }

    /** G5: preprocessed_signal - the detrended, centred shape signal the oscillation gates ran on. */
    static EvidenceArtifact preprocessed(String runId, String gate, LongIntermediates k) {
        EvidenceArtifact a = EvidenceArtifact.series(runId, gate, "preprocessed_signal", shapeRole(k), "sample_time", ArtifactSupport.MS_EPOCH,
                "preprocessed_signal", "EU_centred", ArtifactSupport.times(k.tsMs), k.shapeCentered, null);
        a.provenance.put("preprocessing", "LINEAR_DETREND;SUBTRACT_MEAN");
        a.provenance.put("basis", "shape signal (OP, or PV on integrating loops)");
        return a;
    }

    /** G5: crossing_times - the zero-crossing instants (s from window start) the period estimate used. */
    static EvidenceArtifact crossingTimes(String runId, LongIntermediates k) {
        double[] x = k.acf.crossingTimesS;
        return EvidenceArtifact.series(runId, "G5", "crossing_times", shapeRole(k), "crossing_times", "s", "ordinal", "1", x, ArtifactSupport.ordinal(x.length), null);
    }

    /** G6: frequency_hz, psd_or_amplitude, ordinate_kind, spectral_window, detrend, fft_size, resolution_hz, noise_reference, peak_indices, harmonic_indices. */
    static EvidenceArtifact psd(String runId, LongIntermediates k) {
        OscillationMath.FftResult f = k.fft;
        boolean[] marked = new boolean[f.psd.length];
        for (int i : f.peakIndices) if (i < marked.length) marked[i] = true;
        for (int i : f.harmonicIndices) if (i < marked.length) marked[i] = true;
        EvidenceArtifact a = EvidenceArtifact.series(runId, "G6", "psd", shapeRole(k), "frequency_hz", "Hz", "psd_or_amplitude", com.ams.flink.cplm.engine.WelchPsd.UNIT, f.freqHz, f.psd, marked);
        a.provenance.put("ordinate_kind", f.ordinateKind);
        a.provenance.put("spectral_window", f.spectralWindow);
        a.provenance.put("detrend", "LINEAR");
        a.provenance.put("fft_size", f.fftSize);
        a.provenance.put("resolution_hz", f.resolutionHz);
        a.provenance.put("noise_reference", f.noiseReference);
        a.provenance.put("peak_indices", ArtifactSupport.join(f.peakIndices));
        a.provenance.put("harmonic_indices", ArtifactSupport.join(f.harmonicIndices));
        a.provenance.put("segment_samples", f.segmentSamples);
        a.provenance.put("overlap_fraction", f.overlapFraction);
        a.provenance.put("segments", f.segments);
        a.provenance.put("mask", "peak_or_harmonic_bin");
        return a;
    }

    /** CHG-049 G7: one row per cycle (all of them, accepted and rejected) so capping the per-cycle artifacts loses no score. */
    static EvidenceArtifact cycleScores(String runId, List<ShapeMath.CycleFit> cs, int emitted) {
        int n = cs.size();
        double[] id = new double[n], score = new double[n], sine = new double[n], tri = new double[n], acc = new double[n];
        for (int i = 0; i < n; i++) {
            ShapeMath.CycleFit c = cs.get(i);
            id[i] = c.cycleId; score[i] = c.score; sine[i] = c.sseSine; tri[i] = c.sseTriangle; acc[i] = c.accepted ? 1 : 0;
        }
        EvidenceArtifact a = EvidenceArtifact.series(runId, "G7", "cycle_scores", "ALL_CYCLES", "cycle_id", "ordinal", "cycle_score", "1", id, score, null);
        a.column("sse_sine", "EU2", sine);
        a.column("sse_triangle", "EU2", tri);
        a.column("accepted", "boolean", acc);
        a.provenance.put("cycles_total", n);
        a.provenance.put("cycles_emitted", emitted);
        a.provenance.put("cycle_selection", "EVEN_SPACED_ENDS_KEPT");
        return a;
    }

    /** G7 per cycle (accepted AND rejected): cycle_id, original_indices, phase, measured_cycle, sine_fit, triangle_fit, amplitudes, phases, sse_sine, sse_triangle, cycle_score. */
    static EvidenceArtifact cycleFit(String runId, ShapeMath.CycleFit c) {
        int n = c.phase.length;
        double[] original = new double[n];
        for (int i = 0; i < n; i++) original[i] = c.startIndex + i;
        EvidenceArtifact a = EvidenceArtifact.series(runId, "G7", "cycle_fit", "CYCLE_" + c.cycleId, "phase", "cycle_fraction", "measured_cycle", "EU_centred", c.phase, c.measured, null);
        a.column("sine_fit", "EU_centred", c.sineFit.length == n ? c.sineFit : ArtifactSupport.nan(n));
        a.column("triangle_fit", "EU_centred", c.triangleFit.length == n ? c.triangleFit : ArtifactSupport.nan(n));
        a.column("original_indices", "sample_index", original);
        a.provenance.put("cycle_id", c.cycleId);
        a.provenance.put("amplitudes", c.amplitude);
        a.provenance.put("phases", c.phaseRad);
        a.provenance.put("sse_sine", c.sseSine);
        a.provenance.put("sse_triangle", c.sseTriangle);
        a.provenance.put("cycle_score", c.score);
        a.provenance.put("accepted", c.accepted);
        a.provenance.put("reject_reason", c.rejectReason == null ? "" : c.rejectReason);
        return a;
    }

    /** G8: lag_s, phi_positive, phi_negative, odd_contribution, even_contribution, method_id; bicoherence absent with a reason. */
    static EvidenceArtifact lagStructure(String runId, LongIntermediates k) {
        ShapeMath.HorchResult h = k.horch;
        int n = h.lagIndex.length;
        double[] lagS = new double[n];
        for (int i = 0; i < n; i++) lagS[i] = h.lagIndex[i] * k.tsSec;
        EvidenceArtifact a = EvidenceArtifact.series(runId, "G8", "lag_structure", "OP_TO_PV", "lag_s", "s", "phi_positive", "1", lagS, h.phiPositive, null);
        a.column("phi_negative", "1", h.phiNegative);
        a.column("odd_contribution", "1", h.oddContribution);
        a.column("even_contribution", "1", h.evenContribution);
        a.provenance.put("method_id", G8_METHOD_ID);
        a.provenance.put("bicoherence", "NOT_INSTALLED");
        a.provenance.put("f1_hz", "NOT_INSTALLED");
        a.provenance.put("f2_hz", "NOT_INSTALLED");
        a.provenance.put("capability_reason", "bispectral estimator not installed in this build; the lag asymmetry is not an odd-harmonic spectrum");
        return a;
    }

    /** G9 per cycle: cycle_id, pair_indices, pv, u_applied, corners, area, bbox_area, qualification_steps. */
    static EvidenceArtifact cyclePolygon(String runId, ShapeMath.CyclePolygon p, LongIntermediates k) {
        int from = Math.max(0, p.startIndex), to = Math.min(k.pv.length, p.endIndex);
        int n = Math.max(0, to - from);
        double[] pv = new double[n], u = new double[n], idx = new double[n], corner = new double[n];
        for (int i = 0; i < n; i++) {
            pv[i] = k.pv[from + i];
            u[i] = k.op[from + i];
            idx[i] = from + i;
            corner[i] = k.geometry.cornerMask.length > from + i && k.geometry.cornerMask[from + i] ? 1 : 0;
        }
        EvidenceArtifact a = EvidenceArtifact.series(runId, "G9", "cycle_polygon", "CYCLE_" + p.cycleId, "pv", "EU", "u_applied", "pp", pv, u, null);
        a.column("pair_indices", "sample_index", idx);
        a.column("corners", "boolean", corner);
        a.provenance.put("cycle_id", p.cycleId);
        a.provenance.put("area", p.area);
        a.provenance.put("bbox_area", p.bboxArea);
        a.provenance.put("qualification_steps", "CYCLE_SEGMENTATION;NORMALISE_TO_CYCLE_RANGE;POLYGON_AREA;BBOX_AREA;CORNER_TURNING_ANGLE");
        a.provenance.put("polygon_vertices", "the ordered (pv, u_applied) pairs of this artifact");
        return a;
    }

    /** G9 normalized_pairs per cycle: the cycle-normalised (pv, u) pairs the area was scored on. */
    static EvidenceArtifact normalizedPairs(String runId, ShapeMath.CyclePolygon p) {
        return EvidenceArtifact.series(runId, "G9", "normalized_pairs", "CYCLE_" + p.cycleId, "pv_norm", "fraction_of_cycle_range", "u_norm", "fraction_of_cycle_range", p.pvNorm, p.uNorm, null);
    }

    /** G9 corners over the whole window: turning angle per sample with the corner and qualified masks. */
    static EvidenceArtifact corners(String runId, LongIntermediates k) {
        ShapeMath.GeometryResult g = k.geometry;
        int n = g.turningAngleRad.length;
        double[] t = new double[n];
        for (int i = 0; i < n; i++) t[i] = i < k.tsMs.length ? k.tsMs[i] : Double.NaN;
        EvidenceArtifact a = EvidenceArtifact.series(runId, "G9", "corners", "PV_VS_U", "sample_time", ArtifactSupport.MS_EPOCH, "turning_angle", "rad", t, g.turningAngleRad, g.cornerMask.length == n ? g.cornerMask : null);
        if (g.qualifiedMask.length == n) a.column("qualified", "boolean", ArtifactSupport.flags(g.qualifiedMask));
        a.provenance.put("mask", "corner");
        return a;
    }

    /** G10: u_requested, u_applied, vp, tracking_error, active_low, active_high, limit_reason, supply_pressure, actuator_pressure, validity (+ dwell_events table). */
    static EvidenceArtifact actuatorLimits(String runId, LongIntermediates k, CplmLongDiagnosticsResult r) {
        int n = k.op.length;
        double[] uApplied = new double[n], vp = new double[n], tracking = new double[n], validity = new double[n];
        boolean vpMapped = k.vp != null && k.vp.length == n;
        for (int i = 0; i < n; i++) {
            vp[i] = vpMapped && Double.isFinite(k.vp[i]) ? k.vp[i] : Double.NaN;
            uApplied[i] = Double.isNaN(vp[i]) ? k.op[i] : vp[i];
            tracking[i] = Double.isNaN(vp[i]) ? Double.NaN : k.op[i] - vp[i];
            validity[i] = Double.isFinite(k.op[i]) ? 1 : 0;
        }
        LimitMath.SaturationStats s = k.saturation;
        EvidenceArtifact a = EvidenceArtifact.series(runId, "G10", "actuator_limits", "OP", "sample_time", ArtifactSupport.MS_EPOCH, "u_applied", "pp", ArtifactSupport.times(k.tsMs), uApplied, null);
        a.column("u_requested", "pp", k.op);
        a.column("vp", "pp", vp);
        a.column("tracking_error", "pp", tracking);
        a.column("active_low", "boolean", s.activeLow.length == n ? ArtifactSupport.flags(s.activeLow) : ArtifactSupport.nan(n));
        a.column("active_high", "boolean", s.activeHigh.length == n ? ArtifactSupport.flags(s.activeHigh) : ArtifactSupport.nan(n));
        a.column("validity", "boolean", validity);
        a.provenance.put("limit_reason", r.limitSource == null || r.limitSource.isEmpty() ? "FALLBACK_0_100" : r.limitSource);
        a.provenance.put("supply_pressure", ArtifactSupport.NOT_MAPPED);
        a.provenance.put("actuator_pressure", ArtifactSupport.NOT_MAPPED);
        a.provenance.put("dwell_events", "artifact:dwell_events");
        a.provenance.put("limit_dwell_warn_s", r.limitDwellWarnS);
        return a;
    }

    /** G11: pv, delta_pv, noise_band, spikes, quantization (+ freeze_events table; health lanes come with the fused verdict). */
    static EvidenceArtifact measurement(String runId, LongIntermediates k, CplmLongDiagnosticsResult r) {
        int n = k.pv.length;
        LimitMath.DeltaPvResult d = k.deltaPv;
        double[] deltaPv = new double[n], spikes = new double[n];
        for (int i = 0; i < n; i++) {
            deltaPv[i] = i == 0 || d.deltaPv.length < n - 1 ? Double.NaN : d.deltaPv[i - 1];
            spikes[i] = k.spikeMask.length == n ? (k.spikeMask[i] ? 1 : 0) : i > 0 && d.spikeMask.length == n - 1 && d.spikeMask[i - 1] ? 1 : 0;
        }
        EvidenceArtifact a = EvidenceArtifact.series(runId, "G11", "measurement", "PV", "sample_time", ArtifactSupport.MS_EPOCH, "pv", "EU", ArtifactSupport.times(k.tsMs), k.pv, null);
        a.column("delta_pv", "EU", deltaPv);
        a.column("spikes", "boolean", spikes);
        a.provenance.put("noise_band", d.noiseBand);
        a.provenance.put("quantization", r.pvQuantizationCount);
        a.provenance.put("freeze_events", "artifact:freeze_events");
        a.provenance.put("health_lanes", "artifact:eligibility_intervals (fused verdict)");
        return a;
    }
}
