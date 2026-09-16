package com.ams.flink.cplm;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

/** Short-window feature payload — Gates 0–4 per reference architecture (traverse.cpa.clpm.feature.short.v1). */
public final class CplmShortFeatureResult implements Serializable {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public String loopId;
    public String windowKind;
    public long windowStartMs;
    public long windowEndMs;
    public double samplePeriodSec;
    public int expectedSampleCount;
    public int sampleCount;

    public double completeness;
    public double badQualityPct;
    /** v2.5 R04: share of the window whose quality was UNKNOWN (no usable verdict), separately from BAD. */
    public double unknownQualityPct;
    /** v2.5: "" | BAD_QUALITY | QUALITY_UNKNOWN | INCOMPLETE - why G0 failed. */
    public String gate0Reason = "";
    public int duplicateTimestamps;
    public double samplingJitter;
    public int gapCount;
    public double maxGapS;
    public String gate0Status = "PENDING";

    public double autoPct;
    public double manualPct;
    public double modeChangesPerHour;
    public String gate1Status = "PENDING";

    public double spMin;
    public double spMax;
    public double spRange;
    /** v2.5 R06: the effective G2 band (PV EU) and where it came from. */
    public double gate2BandEu;
    public String gate2BandSource = "";
    public double spChangesPerHour;
    public String gate2Status = "PENDING";

    public double mae;
    public double rmse;
    public double iae;
    public double ise;
    public double itae;
    public double goodErrorPct;
    public double oce;
    public double pvStd;
    public double opStd;
    public double freezeIndexS;
    public String gate3Status = "PENDING";

    public double effortRatio;
    /** P2-3 - (sigmaOP/opSpan)/(sigmaPV/pvSpan): unit-free, cross-loop comparable. */
    public double effortRatioNormalized;
    /** v2.5 R06: (sigma_u/span_u)/(sigma_pv/span_pv) on DECLARED spans; null with a reason when not computable. */
    public Double activityRatioNorm;
    /** NORMALIZED_DECLARED_SPAN | OBSERVED_RATIO_LEGACY - which quantity gate4Status was judged on. */
    public String activityBasis = "";
    public String activityReason = "";
    /** The effective G4 thresholds (exact effective thresholds are evidence, spec v6 s1.3). */
    public double gate4WarnRatio;
    public double gate4HighRatio;
    public double opTravel;
    public double travelPerDay;
    public int reversalCount;
    public double reversalsPerHour;
    public double saturationPct;
    public String gate4Status = "PENDING";

    /** G2r operating-region (calc v3). */
    public String gate2rStatus = "PASS";
    public double regionOutOfBandPct;
    public boolean operatingRegionValid = true;

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
    public String gateProfileId = "";
    public String loopType = "";
    public String assetUuid = "";

    public boolean sufficientData = true;


    /**
     * P1-8 - emit JSON null, not 0.0, for a metric the engine never computed.
     *
     * computeShortFeatures returns early when G0 fails or n &lt; 10, leaving every
     * performance metric at its Java default of 0.0. Persisted as 0.0 those are
     * indistinguishable from real measurements: mae = 0 reads as perfect control,
     * auto_pct = 0 reads as "loop in manual", and sp_min = sp_max = 0 reads as a
     * setpoint parked at zero. Any fleet average over the column is then dragged
     * toward zero by every window that was never evaluated.
     *
     * Null is the honest encoding: SQL aggregates skip it, charts draw a gap.
     * The in-memory field stays 0.0 so the fusion engine's arithmetic is
     * untouched - this changes only what leaves the job.
     */
    private void putMetric(ObjectNode out, String name, double value) {
        if (sufficientData) out.put(name, value); else out.putNull(name);
    }

    private void putMetric(ObjectNode out, String name, int value) {
        if (sufficientData) out.put(name, value); else out.putNull(name);
    }
    public String toJson() {
        ObjectNode out = MAPPER.createObjectNode();
        out.put("schemaVersion", 1);
        out.put("eventType", "CPLM_SHORT_FEATURE");
        out.put("loop_id", loopId);
        out.put("asset_uuid", assetUuid);
        out.put("window_kind", windowKind);
        out.put("windowStartMs", windowStartMs);
        out.put("windowEndMs", windowEndMs);
        out.put("sample_period_sec", samplePeriodSec);
        out.put("expected_sample_count", expectedSampleCount);
        out.put("sample_count", sampleCount);
        out.put("completeness", completeness);
        out.put("bad_quality_pct", badQualityPct);
        out.put("unknown_quality_pct", unknownQualityPct);
        out.put("duplicate_timestamps", duplicateTimestamps);
        out.put("sampling_jitter", samplingJitter);
        out.put("gap_count", gapCount);
        out.put("max_gap_s", maxGapS);
        out.put("gate0_status", gate0Status);
        out.put("gate0_reason", gate0Reason);
        putMetric(out, "auto_pct", autoPct);
        putMetric(out, "manual_pct", manualPct);
        putMetric(out, "mode_changes_per_h", modeChangesPerHour);
        out.put("gate1_status", gate1Status);
        putMetric(out, "sp_min", spMin);
        putMetric(out, "sp_max", spMax);
        putMetric(out, "sp_range", spRange);
        putMetric(out, "sp_changes_per_h", spChangesPerHour);
        out.put("gate2_status", gate2Status);
        putMetric(out, "gate2_band_eu", gate2BandEu);
        out.put("gate2_band_source", gate2BandSource);
        putMetric(out, "mae", mae);
        putMetric(out, "rmse", rmse);
        putMetric(out, "iae", iae);
        putMetric(out, "ise", ise);
        putMetric(out, "itae", itae);
        putMetric(out, "good_error_pct", goodErrorPct);
        putMetric(out, "oce", oce);
        putMetric(out, "pv_std", pvStd);
        putMetric(out, "op_std", opStd);
        putMetric(out, "freeze_index_s", freezeIndexS);
        out.put("gate3_status", gate3Status);
        putMetric(out, "effort_ratio", effortRatio);
        putMetric(out, "effort_ratio_normalized", effortRatioNormalized);
        if (activityRatioNorm != null && sufficientData) out.put("activity_ratio_norm", activityRatioNorm);
        else out.putNull("activity_ratio_norm");
        out.put("activity_basis", activityBasis);
        out.put("activity_reason", activityReason);
        putMetric(out, "gate4_warn_ratio", gate4WarnRatio);
        putMetric(out, "gate4_high_ratio", gate4HighRatio);
        putMetric(out, "op_travel", opTravel);
        putMetric(out, "travel_per_day", travelPerDay);
        putMetric(out, "reversal_count", reversalCount);
        putMetric(out, "reversals_per_hour", reversalsPerHour);
        putMetric(out, "saturation_pct", saturationPct);
        out.put("gate4_status", gate4Status);
        out.put("gate2r_status", gate2rStatus);
        putMetric(out, "region_out_of_band_pct", regionOutOfBandPct);
        out.put("operating_region_valid", operatingRegionValid);
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
        out.put("gate_profile_id", gateProfileId);
        out.put("loop_type", loopType);
        out.put("sufficient_data", sufficientData);
        return out.toString();
    }

    public static CplmShortFeatureResult fromJson(String json) {
        try {
            var root = MAPPER.readTree(json);
            CplmShortFeatureResult r = new CplmShortFeatureResult();
            r.loopId = root.path("loop_id").asText("");
            r.assetUuid = root.path("asset_uuid").asText("");
            r.windowKind = root.path("window_kind").asText("");
            r.windowStartMs = root.path("windowStartMs").asLong(0);
            r.windowEndMs = root.path("windowEndMs").asLong(0);
            r.samplePeriodSec = root.path("sample_period_sec").asDouble(0);
            r.expectedSampleCount = root.path("expected_sample_count").asInt(0);
            r.sampleCount = root.path("sample_count").asInt(0);
            r.completeness = root.path("completeness").asDouble(0);
            r.badQualityPct = root.path("bad_quality_pct").asDouble(0);
            r.unknownQualityPct = root.path("unknown_quality_pct").asDouble(0);
            r.gate0Reason = root.path("gate0_reason").asText("");
            r.duplicateTimestamps = root.path("duplicate_timestamps").asInt(0);
            r.samplingJitter = root.path("sampling_jitter").asDouble(0);
            r.gapCount = root.path("gap_count").asInt(0);
            r.maxGapS = root.path("max_gap_s").asDouble(0);
            r.autoPct = root.path("auto_pct").asDouble(0);
            r.manualPct = root.path("manual_pct").asDouble(0);
            r.modeChangesPerHour = root.path("mode_changes_per_h").asDouble(0);
            r.spMin = root.path("sp_min").asDouble(0);
            r.spMax = root.path("sp_max").asDouble(0);
            r.spRange = root.path("sp_range").asDouble(0);
            r.gate2BandEu = root.path("gate2_band_eu").asDouble(0);
            r.gate2BandSource = root.path("gate2_band_source").asText("");
            r.activityRatioNorm = root.has("activity_ratio_norm") && !root.get("activity_ratio_norm").isNull()
                    ? root.get("activity_ratio_norm").asDouble() : null;
            r.activityBasis = root.path("activity_basis").asText("");
            r.activityReason = root.path("activity_reason").asText("");
            r.gate4WarnRatio = root.path("gate4_warn_ratio").asDouble(0);
            r.gate4HighRatio = root.path("gate4_high_ratio").asDouble(0);
            r.spChangesPerHour = root.path("sp_changes_per_h").asDouble(0);
            r.mae = root.path("mae").asDouble(0);
            r.rmse = root.path("rmse").asDouble(0);
            r.iae = root.path("iae").asDouble(0);
            r.ise = root.path("ise").asDouble(0);
            r.itae = root.path("itae").asDouble(0);
            r.goodErrorPct = root.path("good_error_pct").asDouble(0);
            r.oce = root.path("oce").asDouble(0);
            r.pvStd = root.path("pv_std").asDouble(0);
            r.opStd = root.path("op_std").asDouble(0);
            r.freezeIndexS = root.path("freeze_index_s").asDouble(0);
            r.effortRatio = root.path("effort_ratio").asDouble(0);
            // audit-jobs.md B-F7: never parsed back, so fusion (which sources its
            // short features from the JSON-round-tripped alignedShort) published
            // the P2-3 "unit-free, cross-loop comparable" metric as a constant 0.
            r.effortRatioNormalized = root.path("effort_ratio_normalized").asDouble(0);
            r.opTravel = root.path("op_travel").asDouble(0);
            r.travelPerDay = root.path("travel_per_day").asDouble(0);
            r.reversalCount = root.path("reversal_count").asInt(0);
            r.reversalsPerHour = root.path("reversals_per_hour").asDouble(0);
            r.saturationPct = root.path("saturation_pct").asDouble(0);
            r.gate0Status = root.path("gate0_status").asText("PENDING");
            r.gate1Status = root.path("gate1_status").asText("PENDING");
            r.gate2Status = root.path("gate2_status").asText("PENDING");
            r.gate3Status = root.path("gate3_status").asText("PENDING");
            r.gate4Status = root.path("gate4_status").asText("PENDING");
            r.gate2rStatus = root.path("gate2r_status").asText("PASS");
            r.regionOutOfBandPct = root.path("region_out_of_band_pct").asDouble(0);
            r.operatingRegionValid = root.path("operating_region_valid").asBoolean(true);
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
            r.gateProfileId = root.path("gate_profile_id").asText("");
            r.loopType = root.path("loop_type").asText("");
            r.sufficientData = root.path("sufficient_data").asBoolean(true);
            return r;
        } catch (Exception e) {
            return null;
        }
    }
}
