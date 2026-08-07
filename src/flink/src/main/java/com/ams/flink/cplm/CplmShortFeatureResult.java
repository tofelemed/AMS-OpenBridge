package com.ams.flink.cplm;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

/** Short-window feature payload — Gates 0–4 per reference architecture (clpm.feature.short.v1). */
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
        out.put("duplicate_timestamps", duplicateTimestamps);
        out.put("sampling_jitter", samplingJitter);
        out.put("gap_count", gapCount);
        out.put("max_gap_s", maxGapS);
        out.put("gate0_status", gate0Status);
        putMetric(out, "auto_pct", autoPct);
        putMetric(out, "manual_pct", manualPct);
        putMetric(out, "mode_changes_per_h", modeChangesPerHour);
        out.put("gate1_status", gate1Status);
        putMetric(out, "sp_min", spMin);
        putMetric(out, "sp_max", spMax);
        putMetric(out, "sp_range", spRange);
        putMetric(out, "sp_changes_per_h", spChangesPerHour);
        out.put("gate2_status", gate2Status);
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
