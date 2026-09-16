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
    // v2.5 R26/C07: build identity stamped on every result (see identity/BuildIdentity).
    public String sourceCommit = com.ams.flink.cplm.identity.BuildIdentity.current().sourceCommit;
    public String jarSha256 = com.ams.flink.cplm.identity.BuildIdentity.current().jarSha256;
    public String contractVersion = com.ams.flink.cplm.identity.BuildIdentity.CONTRACT_VERSION;
    public int resultRevision = 1;
    // v2.5 R19: run identity (identity/ResultIdentity). LIVE rows have no analysis run.
    public java.util.Map<String, String> methodRunIds = new java.util.LinkedHashMap<>();
    public String bundleHash = com.ams.flink.cplm.identity.ProfileHash.LEGACY;
    public int contextRevision = 0;
    public String purpose = "LIVE";
    public String analysisRunId = null;
    public String datasetHash = com.ams.flink.cplm.identity.DatasetHash.EMPTY;
    public String dynamicsClass = "UNKNOWN";
    public String profileSource = "UNKNOWN";
    public String configurationVersion = "";

    public String gate10Status = "PENDING";
    public double saturationPct;
    public int satLimitDwellSamples;
    public boolean satCyclingPattern;
    /** v2.5 R08: limit dwell in seconds, the limits used (pp), where they came from, the warning dwell, and the episodes. */
    public double satLimitDwellS;
    public double limitLowPp;
    public double limitHighPp;
    public String limitSource = "";
    public double limitDwellWarnS;
    public List<com.ams.flink.cplm.engine.LimitMath.DwellEvent> dwellEvents = new ArrayList<>();
    public int freezeRunSamples;
    public double freezeIndexS;
    /** v2.5 R08: freeze episodes (>= freezeDwellS) - always retained; materiality separately. */
    public List<com.ams.flink.cplm.engine.LimitMath.FreezeEvent> freezeEvents = new ArrayList<>();
    public boolean freezeMaterial;
    public String gate11Reason = "";
    public double freezeDwellS;
    public double freezeToleranceEu;
    /** v2.5 R02: how the valve position followed the demand (eligible VP samples only). */
    public int vpEligibleSamples;
    public double vpTrackingErrorMeanPp;
    public double vpTrackingErrorP95Pp;
    public double vpNonFollowingDwellS;
    public boolean vpTrackingHealthy;
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
        out.put("sourceCommit", sourceCommit);
        out.put("jarSha256", jarSha256);
        out.put("contractVersion", contractVersion);
        ObjectNode runIds = out.putObject("method_run_ids");
        for (java.util.Map.Entry<String, String> e : methodRunIds.entrySet()) runIds.put(e.getKey(), e.getValue());
        out.put("bundle_hash", bundleHash);
        out.put("context_revision", contextRevision);
        out.put("purpose", purpose);
        if (analysisRunId == null) out.putNull("analysis_run_id"); else out.put("analysis_run_id", analysisRunId);
        out.put("dataset_hash", datasetHash);
        out.put("result_revision", resultRevision);
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
        out.put("sat_limit_dwell_s", satLimitDwellS);
        out.put("limit_low_pp", limitLowPp);
        out.put("limit_high_pp", limitHighPp);
        out.put("limit_source", limitSource);
        out.put("limit_dwell_warn_s", limitDwellWarnS);
        ArrayNode dwell = MAPPER.createArrayNode();
        for (com.ams.flink.cplm.engine.LimitMath.DwellEvent e : dwellEvents) {
            ObjectNode o = MAPPER.createObjectNode();
            o.put("start_ms", e.startMs); o.put("end_ms", e.endMs); o.put("duration_s", e.durationS);
            o.put("side", e.side); o.put("samples", e.samples);
            dwell.add(o);
        }
        out.set("dwell_events", dwell);
        ArrayNode freezes = MAPPER.createArrayNode();
        for (com.ams.flink.cplm.engine.LimitMath.FreezeEvent f : freezeEvents) {
            ObjectNode o = MAPPER.createObjectNode();
            o.put("start_ms", f.startMs); o.put("end_ms", f.endMs); o.put("duration_s", f.durationS); o.put("samples", f.samples);
            freezes.add(o);
        }
        out.set("freeze_events", freezes);
        out.put("freeze_material", freezeMaterial);
        out.put("gate11_reason", gate11Reason);
        out.put("freeze_dwell_s", freezeDwellS);
        out.put("freeze_tolerance_eu", freezeToleranceEu);
        out.put("vp_eligible_samples", vpEligibleSamples);
        out.put("vp_tracking_error_mean_pp", vpTrackingErrorMeanPp);
        out.put("vp_tracking_error_p95_pp", vpTrackingErrorP95Pp);
        out.put("vp_nonfollowing_dwell_s", vpNonFollowingDwellS);
        out.put("vp_tracking_healthy", vpTrackingHealthy);
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
            r.sourceCommit = root.path("sourceCommit").asText(com.ams.flink.cplm.identity.BuildIdentity.UNKNOWN);
            r.jarSha256 = root.path("jarSha256").asText(com.ams.flink.cplm.identity.BuildIdentity.UNKNOWN);
            r.contractVersion = root.path("contractVersion").asText(com.ams.flink.cplm.identity.BuildIdentity.CONTRACT_VERSION);
            if (root.path("method_run_ids").isObject()) {
                java.util.Iterator<java.util.Map.Entry<String, JsonNode>> it = root.path("method_run_ids").fields();
                while (it.hasNext()) { java.util.Map.Entry<String, JsonNode> e = it.next(); r.methodRunIds.put(e.getKey(), e.getValue().asText()); }
            }
            r.bundleHash = root.path("bundle_hash").asText(com.ams.flink.cplm.identity.ProfileHash.LEGACY);
            r.contextRevision = root.path("context_revision").asInt(0);
            r.resultRevision = root.path("result_revision").asInt(1);
            r.purpose = root.path("purpose").asText("LIVE");
            r.analysisRunId = root.path("analysis_run_id").isNull() || root.path("analysis_run_id").isMissingNode()
                    ? null : root.path("analysis_run_id").asText();
            r.datasetHash = root.path("dataset_hash").asText(com.ams.flink.cplm.identity.DatasetHash.EMPTY);
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
            r.satLimitDwellS = root.path("sat_limit_dwell_s").asDouble(0);
            r.limitLowPp = root.path("limit_low_pp").asDouble(0);
            r.limitHighPp = root.path("limit_high_pp").asDouble(0);
            r.limitSource = root.path("limit_source").asText("");
            r.limitDwellWarnS = root.path("limit_dwell_warn_s").asDouble(0);
            for (JsonNode e : root.path("dwell_events")) {
                com.ams.flink.cplm.engine.LimitMath.DwellEvent d = new com.ams.flink.cplm.engine.LimitMath.DwellEvent();
                d.startMs = e.path("start_ms").asLong(); d.endMs = e.path("end_ms").asLong();
                d.durationS = e.path("duration_s").asDouble(); d.side = e.path("side").asText(""); d.samples = e.path("samples").asInt();
                r.dwellEvents.add(d);
            }
            for (JsonNode e : root.path("freeze_events")) {
                com.ams.flink.cplm.engine.LimitMath.FreezeEvent f = new com.ams.flink.cplm.engine.LimitMath.FreezeEvent();
                f.startMs = e.path("start_ms").asLong(); f.endMs = e.path("end_ms").asLong();
                f.durationS = e.path("duration_s").asDouble(); f.samples = e.path("samples").asInt();
                r.freezeEvents.add(f);
            }
            r.freezeMaterial = root.path("freeze_material").asBoolean(false);
            r.gate11Reason = root.path("gate11_reason").asText("");
            r.freezeDwellS = root.path("freeze_dwell_s").asDouble(0);
            r.freezeToleranceEu = root.path("freeze_tolerance_eu").asDouble(0);
            r.vpEligibleSamples = root.path("vp_eligible_samples").asInt(0);
            r.vpTrackingErrorMeanPp = root.path("vp_tracking_error_mean_pp").asDouble(0);
            r.vpTrackingErrorP95Pp = root.path("vp_tracking_error_p95_pp").asDouble(0);
            r.vpNonFollowingDwellS = root.path("vp_nonfollowing_dwell_s").asDouble(0);
            r.vpTrackingHealthy = root.path("vp_tracking_healthy").asBoolean(false);
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
