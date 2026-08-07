package com.ams.flink.cplm;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ArrayNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

/** CPLM gate fusion output — matches CPLM reference manual section 5 minimum fields. */
public class CplmGateResult implements Serializable {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public String loopId;
    public String windowKind = "24h";
    public long windowStartMs;
    public long windowEndMs;
    public double samplePeriodSec;
    public int expectedSampleCount;
    public int sampleCount;

    // Gate 0
    public double completeness;
    public double badQualityPct;
    public int duplicateTimestamps;
    public double samplingJitter;
    public int gapCount;
    public double maxGapS;
    public String gate0Status = "PENDING";

    // Gate 1
    public double autoPct;
    public double manualPct;
    public double modeChangesPerHour;
    public String gate1Status = "PENDING";

    // Gate 2
    public double spMin;
    public double spMax;
    public double spRange;
    public double spChangesPerHour;
    public String gate2Status = "PENDING";

    // Gate 3
    public double mae;
    public double rmse;
    public double iae;
    public double ise;
    public double itae;
    public double goodErrorPct;
    public double oce;
    public String gate3Status = "PENDING";

    // Gate 4
    public double pvStd;
    public double opStd;
    public double effortRatio;
    /** P2-3 - unit-free effort variant; see CplmShortFeatureResult. */
    public double effortRatioNormalized;
    public double opTravel;
    public double travelPerDay;
    public int reversalCount;
    public double reversalsPerHour;
    public double saturationPct;
    public String gate4Status = "PENDING";

    // Gate 5
    public double acfPeriodS;
    public double acfRegularity;
    public double acfGamma0;
    public int acfZeroCrossingCount;
    public int acfPeriodCandidateCount;
    public String gate5Status = "PENDING";

    // Gate 6
    public int fftPeakBin;
    public int fftMaxBin;
    public double fftPeakAmplitude;
    public double fftPeakFreqHz;
    public double fftPeakPeriodS;
    public double fftPeakToMedian;
    public double fftPeakRatio;
    public double fftTotalEnergy;
    public double fftH2Amp;
    public double fftH3Amp;
    public double fftH5Amp;
    public double harmonicAmplitudeRatio;
    public double harmonicEnergyRatio;
    public int spectralEntropyBinCount;
    public double spectralEntropy;
    public String gate6Status = "PENDING";

    // Gate 7
    public double triangularity;
    public int cycleSamples;
    public String cycleSource = "NONE";
    public int completedCycles;
    public int validCycles;
    public double firstCycleSseSine;
    public double firstCycleSseTriangle;
    public String gate7Status = "PENDING";

    // Gate 8
    public double horchOddness;
    public double horchOddSum;
    public double horchEvenSum;
    public String gate8Status = "PENDING";

    // Gate 9
    public double phaseAreaNormPerCycle;
    public double phaseBboxArea;
    public double phasePathArea;
    public double windowAreaNorm;
    public double cornerScore;
    public double cornerScoreRaw;
    public double cornerScoreQualified;
    public int validTurningAngles;
    public String gate9Status = "PENDING";
    public String gate9Reason = "";
    public String periodStatus = "NO_VALID_CYCLE";
    public double validatedPeriodS;
    public String periodRejectReason = "";
    public double opRangePct;

    public String calculationVersion = CplmLoopDynamicsProfile.CALCULATION_VERSION;
    public String dynamicsProfileVersion = CplmLoopDynamicsProfile.DYNAMICS_PROFILE_VERSION;
    public String dynamicsClass = "UNKNOWN";
    public String profileSource = "UNKNOWN";
    public String configurationVersion = "";
    public String gateProfileId = "";
    public String dynamicClass = "";
    public String stictionSignal = "OP";
    public String gate2rStatus = "PASS";
    public double regionOutOfBandPct;
    public boolean operatingRegionValid = true;
    public int persistenceAgreeCount;
    public int persistenceWindowsRequired;
    public boolean persistenceSatisfied = true;
    public List<String> familyDisqualifiers = new ArrayList<>();

    // Gate 10–11
    public String gate10Status = "PENDING";
    public int satLimitDwellSamples;
    public boolean satCyclingPattern;
    public int freezeRunSamples;
    public double freezeIndexS;
    public int pvQuantizationCount;
    public double pvDriftPerDay;
    public double deltaPvMean;
    public double deltaPvStd;
    public int spikeCount;
    public String gate11Status = "PENDING";

    // Gate 12–15
    // P3-3 - the default used to be "EXCLUDED", which survived blockDiagnosis
    // (it only remaps PENDING) and published a verdict for gates that were
    // never looked at. PENDING like every other gate; pubStatus() maps any
    // survivor to NOT_EVALUATED at emit.
    public String gate12Status = "PENDING";
    public String gate13Status = "PENDING";
    public boolean vpAvailable;
    public boolean hasStepTestEvidence;
    public boolean hasPeerLinks;
    public String gate14Status = "PENDING";
    public double g14ConfidenceCap = 0.89;
    // Weighted-path detector scores (all clamped to [0,1])
    public double oscillationScore;
    public double fftScore;
    public double effortScore;
    public double stictionScore;
    public double horchScore;
    public double geometryScore;
    public double rawFinalElementScore;
    // Selected-family path
    public double stictionFamilyScore;
    public double oscillationFamilyScore;
    public double effortFamilyScore;
    public double geometryFamilyScore;
    /**
     * P1-10 - false when the long-tier metrics on this row (ACF period, FFT,
     * triangularity, corner score, effort ratio ...) were computed on a window
     * that failed G0 or had insufficient samples. They are still published,
     * because they are the inputs to the exclusion decision, but nothing
     * downstream could previously tell them apart from full-window values.
     */
    public boolean longMetricsQualified;
    public boolean stictionQualified;
    public boolean oscillationQualified;
    public boolean effortQualified;
    public boolean geometryQualified;
    public String selectedFamily = "NONE";
    public double familyScore;
    public String gate15Status = "PENDING";
    public String statusReason = "";

    public String diagnosis = "PENDING";
    public String severity = "LOW";
    public double confidence;
    public String recommendation = "";
    public String insufficientEvidenceReason = "";
    public List<String> observabilityFlags = new ArrayList<>();


    /**
     * P1-8 - see CplmShortFeatureResult.putMetric. metricsQualified is false when
     * the window failed G0 or had too few samples, so these performance metrics
     * were never computed and 0.0 is a lie rather than a measurement.
     */
    private void putMetric(ObjectNode out, String name, double value) {
        if (longMetricsQualified) out.put(name, value); else out.putNull(name);
    }

    private void putMetric(ObjectNode out, String name, int value) {
        if (longMetricsQualified) out.put(name, value); else out.putNull(name);
    }

    /**
     * P3-6 - PENDING is an internal "not set yet" sentinel, not a verdict. It
     * is not in GateDefs, no frontend map documents it, and it leaked into
     * stored rows wherever a tier never ran for a window (e.g. gates 5-11
     * before the first long window closes). Publicly, "this gate was never
     * evaluated" is NOT_EVALUATED - one vocabulary, already mapped everywhere.
     */
    private static String pubStatus(String status) {
        return status == null || status.isEmpty() || "PENDING".equals(status)
                ? "NOT_EVALUATED" : status;
    }
    public String toJson() {
        ObjectNode out = MAPPER.createObjectNode();
        out.put("schemaVersion", 1);
        out.put("eventType", "CPLM_GATE_RESULT");
        out.put("calculationVersion", calculationVersion);
        out.put("dynamicsProfileVersion", dynamicsProfileVersion);
        out.put("dynamics_class", dynamicsClass);
        out.put("profile_source", profileSource);
        out.put("gate_profile_id", gateProfileId);
        // P3-7 - "dynamic_class" (the speed class) is no longer published on
        // the public verdict: nothing ever read it, and the near-identical
        // name invited reading the wrong field. It stays on the internal
        // long-diagnostics topic and is encoded in gate_profile_id.
        out.put("stiction_signal", stictionSignal);
        out.put("gate2r_status", pubStatus(gate2rStatus));
        out.put("operating_region_valid", operatingRegionValid);
        out.put("persistence_agree_count", persistenceAgreeCount);
        out.put("persistence_windows_required", persistenceWindowsRequired);
        out.put("persistence_satisfied", persistenceSatisfied);
        if (configurationVersion != null && !configurationVersion.isEmpty()) {
            out.put("configurationVersion", configurationVersion);
        }
        out.put("loop_id", loopId);
        out.put("tagId", loopId);
        out.put("window_kind", windowKind);
        out.put("windowStartMs", windowStartMs);
        out.put("windowEndMs", windowEndMs);
        out.put("sample_period_sec", samplePeriodSec);
        out.put("expected_sample_count", expectedSampleCount);
        out.put("sample_count", sampleCount);

        out.put("completeness", completeness);
        out.put("bad_quality_pct", badQualityPct);
        out.put("duplicate_timestamps", duplicateTimestamps);
        out.put("sampling_jitter", samplingJitter);
        out.put("gap_count", gapCount);
        out.put("max_gap_s", maxGapS);
        out.put("gate0_status", pubStatus(gate0Status));

        putMetric(out, "auto_pct", autoPct);
        putMetric(out, "manual_pct", manualPct);
        putMetric(out, "mode_changes_per_h", modeChangesPerHour);
        out.put("gate1_status", pubStatus(gate1Status));

        putMetric(out, "sp_min", spMin);
        putMetric(out, "sp_max", spMax);
        putMetric(out, "sp_range", spRange);
        putMetric(out, "sp_changes_per_h", spChangesPerHour);
        out.put("gate2_status", pubStatus(gate2Status));

        putMetric(out, "mae", mae);
        putMetric(out, "rmse", rmse);
        putMetric(out, "iae", iae);
        putMetric(out, "ise", ise);
        putMetric(out, "itae", itae);
        putMetric(out, "good_error_pct", goodErrorPct);
        putMetric(out, "oce", oce);
        out.put("gate3_status", pubStatus(gate3Status));

        putMetric(out, "pv_std", pvStd);
        putMetric(out, "op_std", opStd);
        putMetric(out, "effort_ratio", effortRatio);
        putMetric(out, "effort_ratio_normalized", effortRatioNormalized);
        putMetric(out, "op_travel", opTravel);
        putMetric(out, "travel_per_day", travelPerDay);
        putMetric(out, "reversal_count", reversalCount);
        putMetric(out, "reversals_per_hour", reversalsPerHour);
        putMetric(out, "saturation_pct", saturationPct);
        out.put("gate4_status", pubStatus(gate4Status));

        out.put("acf_period_s", acfPeriodS);
        out.put("acf_regularity", acfRegularity);
        out.put("acf_gamma0", acfGamma0);
        out.put("acf_zero_crossing_count", acfZeroCrossingCount);
        out.put("acf_period_candidate_count", acfPeriodCandidateCount);
        out.put("gate5_status", pubStatus(gate5Status));

        out.put("fft_peak_bin", fftPeakBin);
        out.put("fft_max_bin", fftMaxBin);
        out.put("fft_peak_amplitude", fftPeakAmplitude);
        out.put("fft_peak_freq_hz", fftPeakFreqHz);
        out.put("fft_peak_period_s", fftPeakPeriodS);
        out.put("fft_peak_to_median", fftPeakToMedian);
        out.put("fft_peak_ratio", fftPeakRatio);
        out.put("fft_total_energy", fftTotalEnergy);
        out.put("fft_h2_amp", fftH2Amp);
        out.put("fft_h3_amp", fftH3Amp);
        out.put("fft_h5_amp", fftH5Amp);
        out.put("harmonic_amplitude_ratio", harmonicAmplitudeRatio);
        out.put("harmonic_energy_ratio", harmonicEnergyRatio);
        out.put("spectral_entropy_bin_count", spectralEntropyBinCount);
        out.put("spectral_entropy", spectralEntropy);
        out.put("gate6_status", pubStatus(gate6Status));

        out.put("triangularity", triangularity);
        out.put("cycle_samples", cycleSamples);
        out.put("cycle_source", cycleSource);
        out.put("completed_cycles", completedCycles);
        out.put("valid_cycles", validCycles);
        out.put("first_cycle_sse_sine", firstCycleSseSine);
        out.put("first_cycle_sse_triangle", firstCycleSseTriangle);
        out.put("gate7_status", pubStatus(gate7Status));

        out.put("horch_oddness", horchOddness);
        out.put("horch_odd_sum", horchOddSum);
        out.put("horch_even_sum", horchEvenSum);
        out.put("gate8_status", pubStatus(gate8Status));

        out.put("phase_area_norm_per_cycle", phaseAreaNormPerCycle);
        out.put("phase_bbox_area", phaseBboxArea);
        out.put("phase_path_area", phasePathArea);
        out.put("window_area_norm", windowAreaNorm);
        out.put("corner_score", cornerScore);
        out.put("corner_score_raw", cornerScoreRaw > 0 ? cornerScoreRaw : cornerScore);
        out.put("corner_score_qualified", cornerScoreQualified);
        out.put("valid_turning_angles", validTurningAngles);
        out.put("gate9_status", pubStatus(gate9Status));
        out.put("gate9_reason", gate9Reason);
        out.put("period_status", periodStatus);
        out.put("validated_period_s", validatedPeriodS);
        out.put("period_reject_reason", periodRejectReason);
        out.put("gate2r_status", pubStatus(gate2rStatus));
        putMetric(out, "region_out_of_band_pct", regionOutOfBandPct);
        out.put("op_range_pct", opRangePct);
        out.put("gate10_valve_output", pubStatus(gate10Status));
        out.put("sat_limit_dwell_samples", satLimitDwellSamples);
        out.put("sat_cycling_pattern", satCyclingPattern);
        out.put("freeze_run_samples", freezeRunSamples);
        putMetric(out, "freeze_index_s", freezeIndexS);
        out.put("pv_quantization_count", pvQuantizationCount);
        out.put("pv_drift_per_day", pvDriftPerDay);
        out.put("delta_pv_mean", deltaPvMean);
        out.put("delta_pv_std", deltaPvStd);
        out.put("spike_count", spikeCount);
        out.put("gate11_status", pubStatus(gate11Status));

        out.put("gate12_status", pubStatus(gate12Status));
        out.put("gate13_status", pubStatus(gate13Status));
        out.put("vp_available", vpAvailable);
        out.put("has_step_test_evidence", hasStepTestEvidence);
        out.put("has_peer_links", hasPeerLinks);
        out.put("long_metrics_qualified", longMetricsQualified);
        out.put("gate14_status", pubStatus(gate14Status));
        out.put("g14_confidence_cap", g14ConfidenceCap);
        out.put("oscillation_score", oscillationScore);
        out.put("fft_score", fftScore);
        out.put("effort_score", effortScore);
        out.put("stiction_score", stictionScore);
        out.put("horch_score", horchScore);
        out.put("geometry_score", geometryScore);
        out.put("raw_final_element_score", rawFinalElementScore);
        out.put("stiction_family_score", stictionFamilyScore);
        out.put("oscillation_family_score", oscillationFamilyScore);
        out.put("effort_family_score", effortFamilyScore);
        out.put("geometry_family_score", geometryFamilyScore);
        out.put("stiction_qualified", stictionQualified);
        out.put("oscillation_qualified", oscillationQualified);
        out.put("effort_qualified", effortQualified);
        out.put("geometry_qualified", geometryQualified);
        out.put("selected_family", selectedFamily);
        out.put("family_score", familyScore);
        out.put("gate15_status", pubStatus(gate15Status));
        out.put("status_reason", statusReason);

        out.put("diagnosis", diagnosis);
        out.put("severity", severity);
        out.put("confidence", confidence);
        out.put("recommendation", recommendation);
        if (insufficientEvidenceReason != null && !insufficientEvidenceReason.isEmpty()) {
            out.put("insufficient_evidence_reason", insufficientEvidenceReason);
        }

        ArrayNode flags = MAPPER.createArrayNode();
        for (String f : observabilityFlags) flags.add(f);
        out.set("observability_flags", flags);

        ArrayNode disq = MAPPER.createArrayNode();
        for (String d : familyDisqualifiers) disq.add(d);
        out.set("family_disqualifiers", disq);

        ObjectNode gates = MAPPER.createObjectNode();
        gates.put("G0", pubStatus(gate0Status));
        gates.put("G1", pubStatus(gate1Status));
        gates.put("G2", pubStatus(gate2Status));
        gates.put("G2r", pubStatus(gate2rStatus));
        gates.put("G3", pubStatus(gate3Status));
        gates.put("G4", pubStatus(gate4Status));
        gates.put("G5", pubStatus(gate5Status));
        gates.put("G6", pubStatus(gate6Status));
        gates.put("G7", pubStatus(gate7Status));
        gates.put("G8", pubStatus(gate8Status));
        gates.put("G9", pubStatus(gate9Status));
        gates.put("G10", pubStatus(gate10Status));
        gates.put("G11", pubStatus(gate11Status));
        gates.put("G12", pubStatus(gate12Status));
        gates.put("G13", pubStatus(gate13Status));
        gates.put("G14", pubStatus(gate14Status));
        gates.put("G15", pubStatus(gate15Status));
        out.set("gates", gates);

        return out.toString();
    }
}
