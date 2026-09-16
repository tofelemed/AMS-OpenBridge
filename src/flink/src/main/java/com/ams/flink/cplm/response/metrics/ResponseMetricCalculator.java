package com.ams.flink.cplm.response.metrics;

import com.ams.flink.cplm.response.model.Quantity;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Assembles the observed-response quantities of one event (spec §2.5, catalogue groups event/response/performance/qualification). */
public final class ResponseMetricCalculator {
    public static final String METHOD = "OBSERVED_RESPONSE_V1";
    public static final String PCT_OF_RESPONSE = "% of response change";
    public static final List<String> QUANTITY_IDS = Arrays.asList(
            "input_step", "sp_step", "baseline_pv", "endpoint_pv", "servo_gain", "rise_time_10_90", "settle_response", "settle_target",
            "overshoot", "undershoot", "peak_time", "peak_pv", "steady_error", "decay_ratio", "iae", "ise", "itae", "mae_time", "rmse_time",
            "valid_coverage", "t10", "t50", "t63", "t90");

    public static final class Settings {
        public double preSupportS = 60, tailDwellS = 30, stableBandEu = 0.5, absSettlingBandEu = 0.1, relSettlingBand = 0.02;
        public double noiseFloorEu = 0.05, crossingDwellS = 5, maxGapS = 60, minResponseEu = 0.5, targetBandEu = 0.5;
        public int minSamples = 3;
    }

    private ResponseMetricCalculator() {}

    public static Map<String, Quantity> compute(EventDataset d, double r0, double r1, Double duApplied, Settings s) {
        Map<String, Quantity> q = new LinkedHashMap<>();
        q.put("input_step", duApplied == null
                ? Quantity.unavailable("input_step", "input_EU", "NO_STEP_OR_UNKNOWN_INPUT")
                : Quantity.of("input_step", duApplied, "input_EU", METHOD));
        boolean refStep = r1 != r0;
        q.put("sp_step", refStep ? Quantity.of("sp_step", r1 - r0, "PV_EU", METHOD) : Quantity.unavailable("sp_step", "PV_EU", "NOT_REFERENCE_STEP"));

        Endpoints.Estimate y0e = Endpoints.baseline(d, s.preSupportS, s.stableBandEu, s.minSamples);
        Endpoints.Estimate ysse = Endpoints.endpoint(d, s.tailDwellS, s.stableBandEu, s.minSamples);
        q.put("baseline_pv", y0e.value == null
                ? Quantity.unavailable("baseline_pv", "PV_EU", Endpoints.NO_VALID_BASELINE)
                : Quantity.of("baseline_pv", y0e.value, "PV_EU", "ROBUST_MEDIAN_PRE_SUPPORT"));
        q.put("endpoint_pv", ysse.value == null
                ? Quantity.unavailable("endpoint_pv", "PV_EU", Endpoints.NO_STABLE_ENDPOINT)
                : Quantity.of("endpoint_pv", ysse.value, "PV_EU", "ROBUST_MEDIAN_STABLE_TAIL"));

        ErrorIntegrals.Result e = ErrorIntegrals.over(d);
        boolean hasRef = e.validDuration > 0;
        q.put("iae", hasRef ? Quantity.of("iae", e.iae, "PV_EU*s", ErrorIntegrals.METHOD) : Quantity.unavailable("iae", "PV_EU*s", "NO_VALID_REFERENCE_SUPPORT"));
        q.put("ise", hasRef ? Quantity.of("ise", e.ise, "PV_EU^2*s", ErrorIntegrals.METHOD) : Quantity.unavailable("ise", "PV_EU^2*s", "NO_VALID_REFERENCE_SUPPORT"));
        q.put("itae", hasRef ? Quantity.of("itae", e.itae, "PV_EU*s^2", ErrorIntegrals.METHOD) : Quantity.unavailable("itae", "PV_EU*s^2", "NO_VALID_REFERENCE_SUPPORT"));
        q.put("mae_time", hasRef ? Quantity.of("mae_time", e.iae / e.validDuration, "PV_EU", ErrorIntegrals.METHOD) : Quantity.unavailable("mae_time", "PV_EU", "NO_VALID_DURATION"));
        q.put("rmse_time", hasRef ? Quantity.of("rmse_time", Math.sqrt(e.ise / e.validDuration), "PV_EU", ErrorIntegrals.METHOD) : Quantity.unavailable("rmse_time", "PV_EU", "NO_VALID_DURATION"));
        q.put("valid_coverage", d.tEnd > d.t0
                ? Quantity.of("valid_coverage", e.coverage, "fraction", ErrorIntegrals.METHOD)
                : Quantity.unavailable("valid_coverage", "fraction", "NO_DECLARED_INTERVAL"));

        if (y0e.value == null || ysse.value == null || Math.abs(ysse.value - y0e.value) < s.minResponseEu) {
            for (String id : new String[] {"t10", "t50", "t63", "t90", "rise_time_10_90"}) q.put(id, Quantity.unavailable(id, "s", "CENSORED_OR_NO_ENDPOINT"));
            q.put("settle_response", Quantity.unavailable("settle_response", "s",
                    ysse.value == null ? "RIGHT_CENSORED_OR_INTEGRATING_OPEN_LOOP" : "NO_MEANINGFUL_RESPONSE"));
            q.put("settle_target", Quantity.unavailable("settle_target", "s", "TARGET_NOT_REACHED_OR_NO_OBJECTIVE"));
            q.put("overshoot", Quantity.unavailable("overshoot", PCT_OF_RESPONSE, "NO_MEANINGFUL_RESPONSE"));
            q.put("undershoot", Quantity.unavailable("undershoot", PCT_OF_RESPONSE, "NO_MEANINGFUL_RESPONSE"));
            q.put("peak_time", Quantity.unavailable("peak_time", "s", "NO_QUALIFIED_PEAK"));
            q.put("peak_pv", Quantity.unavailable("peak_pv", "PV_EU", "INSUFFICIENT_SUPPORT"));
            q.put("steady_error", ysse.value == null || !refStep
                    ? Quantity.unavailable("steady_error", "PV_EU", Endpoints.NO_STABLE_ENDPOINT)
                    : Quantity.of("steady_error", r1 - ysse.value, "PV_EU", METHOD));
            q.put("decay_ratio", Quantity.unavailable("decay_ratio", "dimensionless", "NO_QUALIFIED_PEAK_PAIR"));
            q.put("servo_gain", Quantity.unavailable("servo_gain", "dimensionless", "NO_REFERENCE_STEP_OR_ENDPOINT"));
            return q;
        }
        double y0 = y0e.value, yss = ysse.value, dy = yss - y0;
        double[] p = Crossings.progress(d, y0, yss);
        Double t10 = Crossings.firstSustained(d, p, 0.10, s.crossingDwellS);
        Double t50 = Crossings.firstSustained(d, p, 0.50, s.crossingDwellS);
        Double t63 = Crossings.firstSustained(d, p, 1 - Math.exp(-1), s.crossingDwellS);
        Double t90 = Crossings.firstSustained(d, p, 0.90, s.crossingDwellS);
        q.put("t10", time("t10", t10));
        q.put("t50", time("t50", t50));
        q.put("t63", time("t63", t63));
        q.put("t90", time("t90", t90));
        q.put("rise_time_10_90", t10 != null && t90 != null
                ? Quantity.of("rise_time_10_90", t90 - t10, "s", METHOD)
                : Quantity.unavailable("rise_time_10_90", "s", "CENSORED_OR_NO_ENDPOINT"));
        double band = Settling.responseBand(s.absSettlingBandEu, s.relSettlingBand, dy, s.noiseFloorEu);
        Double ts = Settling.responseSettle(d, yss, band, s.tailDwellS, s.maxGapS);
        q.put("settle_response", ts == null
                ? Quantity.unavailable("settle_response", "s", "RIGHT_CENSORED_OR_INTEGRATING_OPEN_LOOP")
                : Quantity.of("settle_response", ts, "s", "OBSERVED_THROUGH_T"));
        Double tt = refStep ? Settling.targetSettle(d, r1, s.targetBandEu, s.tailDwellS, s.maxGapS) : null;
        q.put("settle_target", tt == null
                ? Quantity.unavailable("settle_target", "s", "TARGET_NOT_REACHED_OR_NO_OBJECTIVE")
                : Quantity.of("settle_target", tt, "s", "OBSERVED_THROUGH_T"));
        Overshoot.Peaks pk = Overshoot.of(d, p, y0, dy, s.minResponseEu, band);
        q.put("overshoot", pk.overshootPct == null
                ? Quantity.unavailable("overshoot", PCT_OF_RESPONSE, "NO_MEANINGFUL_RESPONSE")
                : Quantity.of("overshoot", pk.overshootPct, PCT_OF_RESPONSE, METHOD));
        q.put("undershoot", pk.undershootPct == null
                ? Quantity.unavailable("undershoot", PCT_OF_RESPONSE, "NO_MEANINGFUL_RESPONSE")
                : Quantity.of("undershoot", pk.undershootPct, PCT_OF_RESPONSE, METHOD));
        q.put("peak_time", pk.peakTimeS == null ? Quantity.unavailable("peak_time", "s", "NO_QUALIFIED_PEAK") : Quantity.of("peak_time", pk.peakTimeS, "s", METHOD));
        q.put("peak_pv", pk.peakValue == null ? Quantity.unavailable("peak_pv", "PV_EU", "INSUFFICIENT_SUPPORT") : Quantity.of("peak_pv", pk.peakValue, "PV_EU", METHOD));
        q.put("steady_error", refStep ? Quantity.of("steady_error", r1 - yss, "PV_EU", METHOD) : Quantity.unavailable("steady_error", "PV_EU", Endpoints.NO_STABLE_ENDPOINT));
        q.put("decay_ratio", pk.decayRatio == null
                ? Quantity.unavailable("decay_ratio", "dimensionless", "NO_QUALIFIED_PEAK_PAIR")
                : Quantity.of("decay_ratio", pk.decayRatio, "dimensionless", METHOD));
        q.put("servo_gain", refStep
                ? Quantity.of("servo_gain", dy / (r1 - r0), "dimensionless", METHOD)
                : Quantity.unavailable("servo_gain", "dimensionless", "NO_REFERENCE_STEP_OR_ENDPOINT"));
        return q;
    }

    private static Quantity time(String id, Double v) {
        return v == null ? Quantity.unavailable(id, "s", "CENSORED_OR_NO_ENDPOINT") : Quantity.of(id, v, "s", METHOD);
    }
}
