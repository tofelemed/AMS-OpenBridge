package com.ams.flink.cplm;

import org.junit.Assert;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;

/**
 * Executable formula contract for the deployed three-stage CPLM path.
 *
 * These tests use analytically simple signals and cross the same JSON boundary
 * used between the short/long jobs and the gate-fusion job.
 */
public class CplmFormulaContractTest {

    private static final double EPS = 1e-9;

    @Test
    public void shortWindowFormulasMatchAnalyticalValues() {
        List<CplmNormalizedSample> samples = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            samples.add(sample(i * 1_000L, i, 5.0, 2.0 * i, i < 9 ? "AUTO" : "MANUAL", "GOOD", null));
        }

        CplmShortFeatureResult r = CplmGateEngine.computeShortFeatures(samples, 0, 10_000, "10s");

        Assert.assertEquals(1.0, r.samplePeriodSec, EPS);
        Assert.assertEquals(10, r.expectedSampleCount);
        Assert.assertEquals(10, r.sampleCount);
        Assert.assertEquals(1.0, r.completeness, EPS);
        Assert.assertEquals(0.0, r.badQualityPct, EPS);
        Assert.assertEquals(0, r.duplicateTimestamps);
        Assert.assertEquals(0.0, r.samplingJitter, EPS);
        Assert.assertEquals("PASS", r.gate0Status);

        Assert.assertEquals(0.9, r.autoPct, EPS);
        Assert.assertEquals(0.1, r.manualPct, EPS);
        Assert.assertEquals(360.0, r.modeChangesPerHour, EPS);
        Assert.assertEquals("PASS", r.gate1Status);

        Assert.assertEquals(5.0, r.spMin, EPS);
        Assert.assertEquals(5.0, r.spMax, EPS);
        Assert.assertEquals(0.0, r.spRange, EPS);
        Assert.assertEquals(0.0, r.spChangesPerHour, EPS);
        Assert.assertEquals("PASS", r.gate2Status);

        Assert.assertEquals(2.5, r.mae, EPS);
        Assert.assertEquals(Math.sqrt(8.5), r.rmse, EPS);
        Assert.assertEquals(25.0, r.iae, EPS);
        Assert.assertEquals(85.0, r.ise, EPS);
        Assert.assertEquals(100.0, r.itae, EPS);
        Assert.assertEquals(0.1, r.goodErrorPct, EPS);
        Assert.assertEquals(0.3, r.saturationPct, EPS);
        Assert.assertEquals(0.063, r.oce, EPS);
        Assert.assertEquals("WARN", r.gate3Status);

        Assert.assertEquals(Math.sqrt(8.25), r.pvStd, EPS);
        Assert.assertEquals(2.0 * Math.sqrt(8.25), r.opStd, EPS);
        Assert.assertEquals(2.0, r.effortRatio, EPS);
        Assert.assertEquals(155_520.0, r.travelPerDay, EPS);
        Assert.assertEquals(0.0, r.reversalsPerHour, EPS);
        Assert.assertEquals("PASS", r.gate4Status);
    }

    @Test
    public void longWindowSpectralFormulasDetectKnownSine() {
        // Period 16 s @ 1 s sampling — inside FIC band [10,900] and >= 8 samples/period.
        List<CplmNormalizedSample> samples = new ArrayList<>();
        for (int i = 0; i < 64; i++) {
            double phase = 2.0 * Math.PI * i / 16.0;
            samples.add(sample(i * 1_000L, 100.0 + Math.sin(phase - Math.PI / 4.0),
                    100.0, 50.0 + 10.0 * Math.sin(phase), "AUTO", "GOOD", null));
        }
        for (CplmNormalizedSample s : samples) s.loopId = "FIC_SINE";

        CplmLongDiagnosticsResult r = CplmGateEngine.computeLongDiagnostics(
                samples, 0, 64_000, "64s",
                CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.FIC));

        Assert.assertEquals(16.0, r.acfPeriodS, 2.0);
        Assert.assertEquals("WARN", r.gate5Status);
        Assert.assertEquals(4, r.fftPeakBin);
        Assert.assertEquals(0.0625, r.fftPeakFreqHz, EPS);
        Assert.assertEquals(16.0, r.fftPeakPeriodS, EPS);
        Assert.assertEquals(1.0, r.fftPeakRatio, 0.05);
        Assert.assertEquals(0.0, r.harmonicAmplitudeRatio, 0.1);
        Assert.assertEquals(0.0, r.harmonicEnergyRatio, 0.1);
        Assert.assertEquals(0.0, r.spectralEntropy, 0.1);
        Assert.assertEquals("WARN", r.gate6Status);
        Assert.assertEquals("VALID", r.periodStatus);
        Assert.assertEquals(0.0, r.triangularity, 0.05);
        Assert.assertEquals("PASS", r.gate7Status);
        Assert.assertEquals(0.0, r.horchOddness, 0.05);
        Assert.assertEquals("PASS", r.gate10Status);
        Assert.assertEquals("PASS", r.gate11Status);
        Assert.assertTrue(r.observabilityFlags.contains("NO_VP"));
    }

    @Test
    public void v3MultiEvidenceRequiredBeforeStictionOnFastFlow() {
        CplmShortFeatureResult shortF = populatedShortFeature();
        shortF.loopId = "FIC_V3";
        shortF.effortRatio = 0.02;
        shortF.gate4Status = "PASS";
        shortF.reversalCount = 0;

        CplmLongDiagnosticsResult longD = populatedLongDiagnostic();
        longD.loopId = "FIC_V3";
        longD.acfRegularity = 0;
        longD.fftPeakRatio = 0;
        longD.triangularity = 0;
        longD.horchOddness = 0;
        longD.cornerScoreQualified = 0.99;
        longD.gate5Status = "PASS";
        longD.gate6Status = "PASS";
        longD.gate7Status = "PASS";
        longD.gate8Status = "PASS";
        longD.gate9Status = "STRONG";
        longD.hasVp = false;

        CplmGateResult r = CplmGateFusionEngine.fuse(
                shortF, longD, false, false,
                CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.FIC));
        Assert.assertEquals("3.0.0", r.calculationVersion);
        Assert.assertEquals("NONE", r.selectedFamily);
        Assert.assertTrue(r.familyDisqualifiers.stream()
                .anyMatch(d -> d.contains("GEOMETRY") || d.contains("FAMILY_DISQUALIFIED")));
    }

    @Test
    public void featureJsonRoundTripPreservesEveryFusionInput() {
        CplmShortFeatureResult shortF = populatedShortFeature();
        CplmLongDiagnosticsResult longD = populatedLongDiagnostic();

        CplmShortFeatureResult parsedShort = CplmShortFeatureResult.fromJson(shortF.toJson());
        CplmLongDiagnosticsResult parsedLong = CplmLongDiagnosticsResult.fromJson(longD.toJson());

        Assert.assertNotNull(parsedShort);
        Assert.assertNotNull(parsedLong);
        Assert.assertEquals(shortF.samplePeriodSec, parsedShort.samplePeriodSec, EPS);
        Assert.assertEquals(shortF.expectedSampleCount, parsedShort.expectedSampleCount);
        Assert.assertEquals(shortF.badQualityPct, parsedShort.badQualityPct, EPS);
        Assert.assertEquals(shortF.duplicateTimestamps, parsedShort.duplicateTimestamps);
        Assert.assertEquals(shortF.samplingJitter, parsedShort.samplingJitter, EPS);
        Assert.assertEquals(shortF.manualPct, parsedShort.manualPct, EPS);
        Assert.assertEquals(shortF.modeChangesPerHour, parsedShort.modeChangesPerHour, EPS);
        Assert.assertEquals(shortF.spRange, parsedShort.spRange, EPS);
        Assert.assertEquals(shortF.ise, parsedShort.ise, EPS);
        Assert.assertEquals(shortF.itae, parsedShort.itae, EPS);
        Assert.assertEquals(shortF.oce, parsedShort.oce, EPS);
        Assert.assertEquals(shortF.saturationPct, parsedShort.saturationPct, EPS);

        Assert.assertEquals(longD.samplePeriodSec, parsedLong.samplePeriodSec, EPS);
        Assert.assertEquals(longD.fftPeakFreqHz, parsedLong.fftPeakFreqHz, EPS);
        Assert.assertEquals(longD.fftPeakPeriodS, parsedLong.fftPeakPeriodS, EPS);
        Assert.assertEquals(longD.fftPeakRatio, parsedLong.fftPeakRatio, EPS);
        Assert.assertEquals(longD.spectralEntropy, parsedLong.spectralEntropy, EPS);
        Assert.assertEquals(longD.windowAreaNorm, parsedLong.windowAreaNorm, EPS);
        Assert.assertEquals(longD.observabilityFlags, parsedLong.observabilityFlags);

        CplmGateResult fused = CplmGateFusionEngine.fuse(
                parsedShort, parsedLong, false, false,
                CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.TIC));
        // weighted = 0.15+0.15+0.15+0.20+0.20*0.8+0.15 = 0.96; family stiction = max(1,0.8)=1
        Assert.assertEquals(0.96, fused.rawFinalElementScore, EPS);
        Assert.assertEquals(1.0, fused.confidence, EPS);
        Assert.assertEquals("stiction", fused.selectedFamily);
        Assert.assertEquals("CONFIRMED", fused.gate15Status);
        Assert.assertEquals("NOT_EVALUATED", fused.gate12Status);
        Assert.assertEquals("NOT_EVALUATED", fused.gate13Status);
    }

    @Test
    public void fusionWeightsBandsAndNoVpCapAreDeterministic() {
        assertFusionBand(0.34, true, "NO_CALL", "INSUFFICIENT_EVIDENCE", "LOW", 0.34);
        assertFusionBand(0.40, true, "DETECTED_FINAL_ELEMENT_NONLINEARITY", "SUSPECTED", "LOW", 0.40);
        assertFusionBand(0.60, true, "CLASSIFIED_FINAL_ELEMENT_NONLINEARITY", "SUSPECTED", "MEDIUM", 0.60);
        assertFusionBand(0.80, true, "SUSPECTED_FINAL_ELEMENT_NONLINEARITY", "SUSPECTED", "HIGH", 0.80);
        assertFusionBand(0.95, true, "CONFIRMED_FINAL_ELEMENT_NONLINEARITY", "CONFIRMED", "HIGH", 0.95);
        assertFusionBand(0.95, false, "SUSPECTED_FINAL_ELEMENT_NONLINEARITY", "SUSPECTED", "HIGH", 0.89);
    }

    @Test
    public void selectedFamilyPrefersStictionWhenHorchStrongAndAcfTriangularityZero() {
        // Pilot case (TIC20803-style): Horch+geometry STRONG while ACF/triangularity zeroed.
        CplmShortFeatureResult shortF = populatedShortFeature();
        shortF.effortRatio = 1.0;
        shortF.gate4Status = "PASS";
        CplmLongDiagnosticsResult longD = populatedLongDiagnostic();
        longD.acfRegularity = 0;
        longD.fftPeakRatio = 0;
        longD.triangularity = 0;
        longD.horchOddness = 0.90;
        longD.cornerScore = 0.70;
        longD.cornerScoreRaw = 0.70;
        longD.cornerScoreQualified = 0.70;
        longD.periodStatus = "VALID";
        longD.validatedPeriodS = 600;
        longD.completedCycles = 10;
        longD.phaseAreaNormPerCycle = 0.5;
        longD.opRangePct = 8;
        longD.effortRatio = 1.0;
        longD.hasVp = false;
        longD.gate5Status = "PASS";
        longD.gate6Status = "PASS";
        longD.gate7Status = "PASS";
        longD.gate8Status = "STRONG";
        longD.gate9Status = "STRONG";

        CplmGateResult r = CplmGateFusionEngine.fuse(
                shortF, longD, false, false, CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.TIC));

        Assert.assertEquals("stiction", r.selectedFamily);
        Assert.assertEquals(0.90, r.familyScore, EPS);
        Assert.assertEquals(0.89, r.confidence, EPS); // min(0.90, 0.89)
        Assert.assertTrue(r.confidence >= 0.35);
        Assert.assertNotEquals("NO_CALL", r.diagnosis);
        Assert.assertEquals("NOT_EVALUATED", r.gate12Status);
        Assert.assertEquals("NOT_EVALUATED", r.gate13Status);
        Assert.assertEquals("INSUFFICIENT_EVIDENCE", r.gate14Status);
        // Weighted includes Horch: 0.20*0.85 + 0.15*0.9 = 0.305
        Assert.assertEquals(0.30375, r.rawFinalElementScore, EPS); // 0.15*(1/8)+0.20*0.90+0.15*0.70
    }

    @Test
    public void stepTestAndPeerEvidenceLiftG12G13FromNotEvaluated() {
        CplmShortFeatureResult shortF = populatedShortFeature();
        CplmLongDiagnosticsResult longD = populatedLongDiagnostic();
        longD.hasVp = false;

        CplmGateResult none = CplmGateFusionEngine.fuse(shortF, longD, false, false);
        Assert.assertEquals("NOT_EVALUATED", none.gate12Status);
        Assert.assertEquals("NOT_EVALUATED", none.gate13Status);
        Assert.assertTrue(none.observabilityFlags.contains("NO_STEP_TEST"));
        Assert.assertTrue(none.observabilityFlags.contains("NO_UPSTREAM_LINKS"));

        CplmGateResult both = CplmGateFusionEngine.fuse(shortF, longD, true, true);
        Assert.assertEquals("PASS", both.gate12Status);
        Assert.assertEquals("PASS", both.gate13Status);
        Assert.assertTrue(both.hasStepTestEvidence);
        Assert.assertTrue(both.hasPeerLinks);
    }

    private static void assertFusionBand(double score, boolean hasVp, String diagnosis,
                                         String gate15, String severity, double expectedConfidence) {
        CplmShortFeatureResult shortF = populatedShortFeature();
        shortF.effortRatio = score * 8.0;
        CplmLongDiagnosticsResult longD = populatedLongDiagnostic();
        longD.acfRegularity = score;
        longD.fftPeakRatio = score;
        longD.triangularity = score;
        longD.horchOddness = score;
        longD.cornerScore = score;
        longD.cornerScoreRaw = score;
        longD.cornerScoreQualified = score;
        longD.periodStatus = "VALID";
        longD.validatedPeriodS = 600;
        longD.completedCycles = 20;
        longD.phaseAreaNormPerCycle = 0.5;
        longD.opRangePct = 10;
        longD.effortRatio = score * 8.0;
        longD.hasVp = hasVp;
        if (!hasVp) longD.observabilityFlags.add("NO_VP");

        CplmGateResult r = CplmGateFusionEngine.fuse(shortF, longD,
                false, false, CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.TIC));

        Assert.assertEquals(score, r.rawFinalElementScore, EPS);
        Assert.assertEquals(expectedConfidence, r.confidence, EPS);
        Assert.assertEquals(diagnosis, r.diagnosis);
        Assert.assertEquals(gate15, r.gate15Status);
        Assert.assertEquals(severity, r.severity);
        Assert.assertEquals("NOT_EVALUATED", r.gate12Status);
        Assert.assertEquals("NOT_EVALUATED", r.gate13Status);
        Assert.assertEquals(hasVp ? "CONFIRMED_CAPABLE" : "INSUFFICIENT_EVIDENCE", r.gate14Status);
    }

    private static CplmShortFeatureResult populatedShortFeature() {
        CplmShortFeatureResult r = new CplmShortFeatureResult();
        r.loopId = "TEST_LOOP";
        r.windowKind = "60m";
        r.windowStartMs = 1;
        r.windowEndMs = 2;
        r.samplePeriodSec = 5.0;
        r.expectedSampleCount = 720;
        r.sampleCount = 720;
        r.completeness = 1.0;
        r.badQualityPct = 0.01;
        r.duplicateTimestamps = 2;
        r.samplingJitter = 0.03;
        r.autoPct = 0.95;
        r.manualPct = 0.05;
        r.modeChangesPerHour = 1.5;
        r.spMin = 10;
        r.spMax = 12;
        r.spRange = 2;
        r.spChangesPerHour = 3;
        r.mae = 1;
        r.rmse = 2;
        r.iae = 3;
        r.ise = 4;
        r.itae = 5;
        r.goodErrorPct = 0.75;
        r.oce = 0.70;
        r.pvStd = 1;
        r.opStd = 8;
        r.freezeIndexS = 6;
        r.effortRatio = 8;
        r.travelPerDay = 7;
        r.reversalsPerHour = 8;
        r.saturationPct = 0.09;
        r.gate0Status = "PASS";
        r.gate1Status = "PASS";
        r.gate2Status = "WARN";
        r.gate3Status = "PASS";
        r.gate4Status = "STRONG";
        r.sufficientData = true;
        return r;
    }

    private static CplmLongDiagnosticsResult populatedLongDiagnostic() {
        CplmLongDiagnosticsResult r = new CplmLongDiagnosticsResult();
        r.loopId = "TEST_LOOP";
        r.windowKind = "24h";
        r.windowStartMs = 1;
        r.windowEndMs = 2;
        r.sampleCount = 17_280;
        r.samplePeriodSec = 5;
        r.hasVp = true;
        r.acfPeriodS = 100;
        r.acfRegularity = 1;
        r.fftPeakBin = 2;
        r.fftPeakFreqHz = 0.1;
        r.fftPeakPeriodS = 10;
        r.fftPeakRatio = 1;
        r.harmonicAmplitudeRatio = 0.2;
        r.harmonicEnergyRatio = 0.3;
        r.spectralEntropy = 0.4;
        r.triangularity = 1;
        r.horchOddness = 0.8;
        r.phaseAreaNormPerCycle = 0.5;
        r.windowAreaNorm = 16;
        r.cornerScore = 1;
        r.cornerScoreRaw = 1;
        r.cornerScoreQualified = 1;
        r.periodStatus = "VALID";
        r.validatedPeriodS = 100;
        r.completedCycles = 20;
        r.validCycles = 20;
        r.cycleSamples = 20;
        r.cycleSource = "ACF";
        r.opRangePct = 12;
        r.effortRatio = 8;
        r.saturationPct = 0.02;
        r.freezeIndexS = 5;
        r.pvQuantizationCount = 10;
        r.pvDriftPerDay = 0.1;
        r.spikeCount = 2;
        r.gate5Status = "WARN";
        r.gate6Status = "WARN";
        r.gate7Status = "STRONG";
        r.gate8Status = "STRONG";
        r.gate9Status = "STRONG";
        r.gate10Status = "PASS";
        r.gate11Status = "PASS";
        r.observabilityFlags.add("TEST_FLAG");
        return r;
    }

    private static CplmNormalizedSample sample(long timestamp, double pv, double sp, double op,
                                                String mode, String quality, Double vp) {
        CplmNormalizedSample s = new CplmNormalizedSample();
        s.loopId = "TEST_LOOP";
        s.eventTsMs = timestamp;
        s.pv = pv;
        s.sp = sp;
        s.op = op;
        s.mode = mode;
        s.quality = quality;
        s.vp = vp;
        return s;
    }
}
