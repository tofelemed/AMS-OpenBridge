package com.ams.flink.cplm;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ArrayNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.List;

/**
 * CLI golden-set validator for SYN_TIC_001 — used by scripts/validate-cplm-syn-tic-001.mjs.
 * Authority: CPLM_Flink_PID_Loop_Gate_Calculation_Reference_Manual.pdf section 5.
 */
public final class SynTic001CliValidator {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private SynTic001CliValidator() {
    }

    public static void main(String[] args) throws Exception {
        List<CplmNormalizedSample> samples = SynTic001ReferenceGenerator.generate();
        CplmGateResult r = CplmGateEngine.compute(
                samples,
                SynTic001ReferenceGenerator.windowStartMs(),
                SynTic001ReferenceGenerator.windowEndMs());

        ObjectNode out = MAPPER.createObjectNode();
        out.put("loop_id", r.loopId);
        out.put("window_kind", r.windowKind);
        out.put("sample_count", r.sampleCount);
        out.put("mae", r.mae);
        out.put("rmse", r.rmse);
        out.put("iae", r.iae);
        out.put("good_error_pct", r.goodErrorPct);
        out.put("acf_period_s", r.acfPeriodS);
        out.put("acf_regularity", r.acfRegularity);
        out.put("fft_peak_bin", r.fftPeakBin);
        out.put("fft_peak_freq_hz", r.fftPeakFreqHz);
        out.put("fft_peak_period_s", r.fftPeakPeriodS);
        out.put("fft_peak_ratio", r.fftPeakRatio);
        out.put("harmonic_amplitude_ratio", r.harmonicAmplitudeRatio);
        out.put("harmonic_energy_ratio", r.harmonicEnergyRatio);
        out.put("spectral_entropy", r.spectralEntropy);
        out.put("effort_ratio", r.effortRatio);
        out.put("triangularity", r.triangularity);
        out.put("horch_oddness", r.horchOddness);
        out.put("phase_area_norm_per_cycle", r.phaseAreaNormPerCycle);
        out.put("corner_score", r.cornerScore);
        out.put("travel_per_day", r.travelPerDay);
        out.put("reversals_per_hour", r.reversalsPerHour);
        out.put("confidence", r.confidence);
        out.put("diagnosis", r.diagnosis);

        ArrayNode flags = MAPPER.createArrayNode();
        for (String f : r.observabilityFlags) {
            flags.add(f);
        }
        out.set("observability_flags", flags);

        System.out.println(MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(out));
    }
}
