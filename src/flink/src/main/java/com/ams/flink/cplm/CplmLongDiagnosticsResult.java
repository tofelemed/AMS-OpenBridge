package com.ams.flink.cplm;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ArrayNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

/** Long-window diagnostics — Gates 5–11 per reference architecture (traverse.cpa.clpm.feature.long.v1). */
public final class CplmLongDiagnosticsResult implements Serializable {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public String loopId;
    public String assetUuid = "";
    public String windowKind;
    public long windowStartMs;
    public long windowEndMs;
    public int sampleCount;
    public double samplePeriodSec;
    public boolean hasVp;

    public double acfPeriodS;
    public double acfRegularity;
    public double acfGamma0;
    public int acfZeroCrossingCount;
    public int acfPeriodCandidateCount;
    public String gate5Status = "PENDING";

    public int fftPeakBin;
    public int fftMaxBin;
    public double fftPeakAmplitude;
    public double fftPeakFreqHz;
    public double fftPeakPeriodS;
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

    public double triangularity;
    public int cycleSamples;
    public String cycleSource = "NONE";
    public int completedCycles;
    public int validCycles;
    public double firstCycleSseSine;
    public double firstCycleSseTriangle;
    public String gate7Status = "PENDING";

    public double horchOddness;
    public double horchOddSum;
    public double horchEvenSum;
    public String gate8Status = "PENDING";

    public double phaseAreaNormPerCycle;
    public double phaseBboxArea;
    public double phasePathArea;
    public double windowAreaNorm;
    /** Legacy corner score (raw, no OP-deadband filter). */
    public double cornerScore;
    public double cornerScoreRaw;
    public double cornerScoreQualified;
    public int validTurningAngles;
    public String gate9Status = "PENDING";
    public String gate9Reason = "";

    /** Period validation (calculation v2). */
    public String periodStatus = "NO_VALID_CYCLE";
    public double validatedPeriodS;
    public String periodRejectReason = "";
    public double opRangePct;
    public double effortRatio;
    public double fftPeakToMedian;

    public String calculationVersion = CplmLoopDynamicsProfile.CALCULATION_VERSION;
    public String dynamicsProfileVersion = CplmLoopDynamicsProfile.DYNAMICS_PROFILE_VERSION;
    public String dynamicsClass = "UNKNOWN";
    public String profileSource = "UNKNOWN";
    public String configurationVersion = "";

    public String gate10Status = "PENDING";
    public double saturationPct;
    public int satLimitDwellSamples;
    public boolean satCyclingPattern;
    public int freezeRunSamples;
    public double freezeIndexS;
    /** P1-1 - longest unchanged run as a share of the window (0..1). */
    public double freezeFraction;
    public int pvQuantizationCount;
    public double pvDriftPerDay;
    public double deltaPvMean;
    public double deltaPvStd;
    public int spikeCount;
    public String gate11Status = "PENDING";

    /** OP for self-regulating; PV for integrating (calc v3). */
    public String stictionSignal = "OP";
    public String gateProfileId = "";
    public String dynamicClass = "";
    public String loopType = "";
    /** Runtime-only profile attached by fusion's broadcast-connected operator. */
    public CplmLoopDynamicsProfile resolvedProfile;

    public List<String> observabilityFlags = new ArrayList<>();

    /**
     * G0–G4 short features computed over the SAME window slice as this long diagnostic.
     * Fusion must prefer this over the last-seen short-window state so the fused
     * gate result reports G0–G4 for the actual 4h/12h/24h analysis window.
     */
    public CplmShortFeatureResult alignedShort;

    public String toJson() {
        ObjectNode out = MAPPER.createObjectNode();
        out.put("schemaVersion", 1);
        out.put("eventType", "CPLM_LONG_DIAGNOSTIC");
        out.put("loop_id", loopId);
        out.put("asset_uuid", assetUuid);
        out.put("window_kind", windowKind);
        out.put("windowStartMs", windowStartMs);
        out.put("windowEndMs", windowEndMs);
        out.put("sample_count", sampleCount);
        out.put("sample_period_sec", samplePeriodSec);
        out.put("vp_available", hasVp);
        out.put("acf_period_s", acfPeriodS);
        out.put("acf_regularity", acfRegularity);
        out.put("acf_gamma0", acfGamma0);
        out.put("acf_zero_crossing_count", acfZeroCrossingCount);
        out.put("acf_period_candidate_count", acfPeriodCandidateCount);
        out.put("gate5_status", gate5Status);
        out.put("fft_peak_bin", fftPeakBin);
        out.put("fft_max_bin", fftMaxBin);
        out.put("fft_peak_amplitude", fftPeakAmplitude);
        out.put("fft_peak_freq_hz", fftPeakFreqHz);
        out.put("fft_peak_period_s", fftPeakPeriodS);
        out.put("fft_peak_ratio", fftPeakRatio);
        out.put("fft_total_energy", fftTotalEnergy);
        out.put("fft_h2_amp", fftH2Amp);
        out.put("fft_h3_amp", fftH3Amp);
        out.put("fft_h5_amp", fftH5Amp);
        out.put("harmonic_amplitude_ratio", harmonicAmplitudeRatio);
        out.put("harmonic_energy_ratio", harmonicEnergyRatio);
        out.put("spectral_entropy_bin_count", spectralEntropyBinCount);
        out.put("spectral_entropy", spectralEntropy);
        out.put("gate6_status", gate6Status);
        out.put("triangularity", triangularity);
        out.put("cycle_samples", cycleSamples);
        out.put("cycle_source", cycleSource);
        out.put("completed_cycles", completedCycles);
        out.put("valid_cycles", validCycles);
        out.put("first_cycle_sse_sine", firstCycleSseSine);
        out.put("first_cycle_sse_triangle", firstCycleSseTriangle);
        out.put("gate7_status", gate7Status);
        out.put("horch_oddness", horchOddness);
        out.put("horch_odd_sum", horchOddSum);
        out.put("horch_even_sum", horchEvenSum);
        out.put("gate8_status", gate8Status);
        out.put("phase_area_norm_per_cycle", phaseAreaNormPerCycle);
        out.put("phase_bbox_area", phaseBboxArea);
        out.put("phase_path_area", phasePathArea);
        out.put("window_area_norm", windowAreaNorm);
        out.put("corner_score", cornerScore);
        out.put("corner_score_raw", cornerScoreRaw > 0 ? cornerScoreRaw : cornerScore);
        out.put("corner_score_qualified", cornerScoreQualified);
        out.put("valid_turning_angles", validTurningAngles);
        out.put("gate9_status", gate9Status);
        out.put("gate9_reason", gate9Reason);
        out.put("period_status", periodStatus);
        out.put("validated_period_s", validatedPeriodS);
        out.put("period_reject_reason", periodRejectReason);
        out.put("op_range_pct", opRangePct);
        out.put("freeze_fraction", freezeFraction);
        out.put("effort_ratio", effortRatio);
        out.put("fft_peak_to_median", fftPeakToMedian);
        out.put("calculationVersion", calculationVersion);
        out.put("dynamicsProfileVersion", dynamicsProfileVersion);
        out.put("dynamics_class", dynamicsClass);
        out.put("profile_source", profileSource);
        if (configurationVersion != null && !configurationVersion.isEmpty()) {
            out.put("configurationVersion", configurationVersion);
        }
        out.put("gate10_valve_output", gate10Status);
        out.put("gate10_status", gate10Status); // legacy alias during UI/API migration
        out.put("saturation_pct", saturationPct);
        out.put("sat_limit_dwell_samples", satLimitDwellSamples);
        out.put("sat_cycling_pattern", satCyclingPattern);
        out.put("freeze_run_samples", freezeRunSamples);
        out.put("freeze_index_s", freezeIndexS);
        out.put("pv_quantization_count", pvQuantizationCount);
        out.put("pv_drift_per_day", pvDriftPerDay);
        out.put("delta_pv_mean", deltaPvMean);
        out.put("delta_pv_std", deltaPvStd);
        out.put("spike_count", spikeCount);
        out.put("gate11_status", gate11Status);
        out.put("stiction_signal", stictionSignal);
        out.put("gate_profile_id", gateProfileId);
        out.put("dynamic_class", dynamicClass);
        out.put("loop_type", loopType);
        ArrayNode flags = MAPPER.createArrayNode();
        for (String f : observabilityFlags) flags.add(f);
        out.set("observability_flags", flags);
        if (alignedShort != null) {
            try {
                out.set("short_features", MAPPER.readTree(alignedShort.toJson()));
                // P0-5: the long tier computes no travel/reversal statistics of
                // its own, so these keys were absent and the consumer's
                // missing-key coercion wrote 0.0 into indexed columns that the
                // KPI API serves and the UI labels "OP travel per day". The
                // window-aligned short result covers exactly this window, so
                // publish its values at the root rather than a silent zero.
                out.put("travel_per_day", alignedShort.travelPerDay);
                out.put("reversals_per_hour", alignedShort.reversalsPerHour);
            } catch (Exception ignored) {
                // aligned short features are an enrichment; never fail the long payload
            }
        }
        return out.toString();
    }

    public static CplmLongDiagnosticsResult fromJson(String json) {
        try {
            var root = MAPPER.readTree(json);
            CplmLongDiagnosticsResult r = new CplmLongDiagnosticsResult();
            r.loopId = root.path("loop_id").asText("");
            r.assetUuid = root.path("asset_uuid").asText("");
            r.windowKind = root.path("window_kind").asText("24h");
            r.windowStartMs = root.path("windowStartMs").asLong(0);
            r.windowEndMs = root.path("windowEndMs").asLong(0);
            r.sampleCount = root.path("sample_count").asInt(0);
            r.samplePeriodSec = root.path("sample_period_sec").asDouble(0);
            r.hasVp = root.path("vp_available").asBoolean(false);
            r.acfPeriodS = root.path("acf_period_s").asDouble(0);
            r.acfRegularity = root.path("acf_regularity").asDouble(0);
            r.acfGamma0 = root.path("acf_gamma0").asDouble(0);
            r.acfZeroCrossingCount = root.path("acf_zero_crossing_count").asInt(0);
            r.acfPeriodCandidateCount = root.path("acf_period_candidate_count").asInt(0);
            r.fftPeakBin = root.path("fft_peak_bin").asInt(0);
            r.fftMaxBin = root.path("fft_max_bin").asInt(0);
            r.fftPeakAmplitude = root.path("fft_peak_amplitude").asDouble(0);
            r.fftPeakFreqHz = root.path("fft_peak_freq_hz").asDouble(0);
            r.fftPeakPeriodS = root.path("fft_peak_period_s").asDouble(0);
            r.fftPeakRatio = root.path("fft_peak_ratio").asDouble(0);
            r.fftTotalEnergy = root.path("fft_total_energy").asDouble(0);
            r.fftH2Amp = root.path("fft_h2_amp").asDouble(0);
            r.fftH3Amp = root.path("fft_h3_amp").asDouble(0);
            r.fftH5Amp = root.path("fft_h5_amp").asDouble(0);
            r.harmonicAmplitudeRatio = root.path("harmonic_amplitude_ratio").asDouble(0);
            r.harmonicEnergyRatio = root.path("harmonic_energy_ratio").asDouble(0);
            r.spectralEntropyBinCount = root.path("spectral_entropy_bin_count").asInt(0);
            r.spectralEntropy = root.path("spectral_entropy").asDouble(0);
            r.triangularity = root.path("triangularity").asDouble(0);
            r.cycleSamples = root.path("cycle_samples").asInt(0);
            r.cycleSource = root.path("cycle_source").asText("NONE");
            r.completedCycles = root.path("completed_cycles").asInt(0);
            r.validCycles = root.path("valid_cycles").asInt(0);
            r.firstCycleSseSine = root.path("first_cycle_sse_sine").asDouble(0);
            r.firstCycleSseTriangle = root.path("first_cycle_sse_triangle").asDouble(0);
            r.horchOddness = root.path("horch_oddness").asDouble(0);
            r.horchOddSum = root.path("horch_odd_sum").asDouble(0);
            r.horchEvenSum = root.path("horch_even_sum").asDouble(0);
            r.phaseAreaNormPerCycle = root.path("phase_area_norm_per_cycle").asDouble(0);
            r.phaseBboxArea = root.path("phase_bbox_area").asDouble(0);
            r.phasePathArea = root.path("phase_path_area").asDouble(0);
            r.windowAreaNorm = root.path("window_area_norm").asDouble(0);
            r.cornerScore = root.path("corner_score").asDouble(0);
            r.cornerScoreRaw = root.path("corner_score_raw").asDouble(r.cornerScore);
            r.cornerScoreQualified = root.path("corner_score_qualified").asDouble(0);
            r.validTurningAngles = root.path("valid_turning_angles").asInt(0);
            r.gate5Status = root.path("gate5_status").asText("PENDING");
            r.gate6Status = root.path("gate6_status").asText("PENDING");
            r.gate7Status = root.path("gate7_status").asText("PENDING");
            r.gate8Status = root.path("gate8_status").asText("PENDING");
            r.gate9Status = root.path("gate9_status").asText("PENDING");
            r.gate9Reason = root.path("gate9_reason").asText("");
            r.periodStatus = root.path("period_status").asText("NO_VALID_CYCLE");
            r.validatedPeriodS = root.path("validated_period_s").asDouble(0);
            r.periodRejectReason = root.path("period_reject_reason").asText("");
            r.opRangePct = root.path("op_range_pct").asDouble(0);
            r.effortRatio = root.path("effort_ratio").asDouble(0);
            r.fftPeakToMedian = root.path("fft_peak_to_median").asDouble(0);
            r.calculationVersion = root.path("calculationVersion").asText(CplmLoopDynamicsProfile.CALCULATION_VERSION);
            r.dynamicsProfileVersion = root.path("dynamicsProfileVersion").asText(CplmLoopDynamicsProfile.DYNAMICS_PROFILE_VERSION);
            r.dynamicsClass = root.path("dynamics_class").asText("UNKNOWN");
            r.profileSource = root.path("profile_source").asText("UNKNOWN");
            r.configurationVersion = root.path("configurationVersion").asText("");
            r.gate10Status = root.path("gate10_valve_output").asText(
                    root.path("gate10_status").asText("PENDING"));
            if ("PENDING".equals(r.gate10Status) && root.has("saturation_pct")) {
                // Clear PENDING when long features actually computed saturation (G10 populated).
                double sat = root.path("saturation_pct").asDouble(Double.NaN);
                if (!Double.isNaN(sat)) {
                    r.gate10Status = sat < 0.05 ? "PASS" : "WARN";
                }
            }
            r.saturationPct = root.path("saturation_pct").asDouble(0);
            r.satLimitDwellSamples = root.path("sat_limit_dwell_samples").asInt(0);
            r.satCyclingPattern = root.path("sat_cycling_pattern").asBoolean(false);
            r.freezeRunSamples = root.path("freeze_run_samples").asInt(0);
            r.freezeIndexS = root.path("freeze_index_s").asDouble(0);
            r.pvQuantizationCount = root.path("pv_quantization_count").asInt(0);
            r.pvDriftPerDay = root.path("pv_drift_per_day").asDouble(0);
            r.deltaPvMean = root.path("delta_pv_mean").asDouble(0);
            r.deltaPvStd = root.path("delta_pv_std").asDouble(0);
            r.spikeCount = root.path("spike_count").asInt(0);
            r.gate11Status = root.path("gate11_status").asText("PENDING");
            r.stictionSignal = root.path("stiction_signal").asText("OP");
            r.gateProfileId = root.path("gate_profile_id").asText("");
            r.dynamicClass = root.path("dynamic_class").asText("");
            r.loopType = root.path("loop_type").asText("");
            JsonNode flags = root.path("observability_flags");
            if (flags.isArray()) {
                for (JsonNode flag : flags) {
                    r.observabilityFlags.add(flag.asText());
                }
            }
            JsonNode shortNode = root.path("short_features");
            if (shortNode.isObject()) {
                r.alignedShort = CplmShortFeatureResult.fromJson(shortNode.toString());
            }
            return r;
        } catch (Exception e) {
            return null;
        }
    }
}
