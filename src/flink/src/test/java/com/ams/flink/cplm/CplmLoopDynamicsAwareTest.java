package com.ams.flink.cplm;

import org.junit.Assert;
import org.junit.Before;
import org.junit.Test;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Calc v3.0.0 - loop-type / dynamic-class aware decision grammar. */
public class CplmLoopDynamicsAwareTest {

    @Before
    public void clearSpine() {
        CplmDynamicsParameterSetSupport.clear();
    }

    @Test
    public void ficFastNoiseYieldsInsufficientEvidenceNotGeometry() {
        List<CplmNormalizedSample> samples = fastNoise("FIC122405", 256);
        CplmLoopDynamicsProfile fic = CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.FIC);
        CplmGateResult r = CplmGateFusionEngine.fuseFromSamples(
                samples, 0, samples.size() * 1000L, "24h", false, false, fic);

        Assert.assertEquals("3.0.0", r.calculationVersion);
        Assert.assertEquals("FIC", r.dynamicsClass);
        Assert.assertEquals("FLOW_FAST_SELF_REG", r.gateProfileId);
        Assert.assertNotEquals("geometry", r.selectedFamily);
        Assert.assertNotEquals("stiction", r.selectedFamily);
        Assert.assertFalse(r.stictionQualified);
        // Idle/noise may surface weak effort/oscillation display families; must not be a valve suspect.
        Assert.assertTrue(
                "NONE".equals(r.selectedFamily)
                        || "effort".equals(r.selectedFamily)
                        || "oscillation".equals(r.selectedFamily)
                        || "INSUFFICIENT_EVIDENCE".equals(r.gate15Status)
                        || "NO_CALL".equals(r.diagnosis)
                        || r.confidence < 0.55);
    }

    @Test
    public void geometryAloneCannotSelectOnFic() {
        CplmShortFeatureResult shortF = baseShort("FIC_GEO");
        shortF.effortRatio = 0.01;
        shortF.gate4Status = "PASS";
        shortF.reversalCount = 0;

        CplmLongDiagnosticsResult longD = baseLong("FIC_GEO");
        longD.acfRegularity = 0;
        longD.fftPeakRatio = 0;
        longD.triangularity = 0;
        longD.horchOddness = 0;
        longD.cornerScoreQualified = 0.95;
        longD.cornerScoreRaw = 0.95;
        longD.phaseAreaNormPerCycle = 0.4;
        longD.opRangePct = 5;
        longD.effortRatio = 0.01;
        longD.periodStatus = "VALID";
        longD.completedCycles = 10;
        longD.gate5Status = "PASS";
        longD.gate6Status = "PASS";
        longD.gate7Status = "PASS";
        longD.gate8Status = "PASS";
        longD.gate9Status = "STRONG";
        longD.gate10Status = "PASS";
        longD.hasVp = false;

        CplmGateResult r = CplmGateFusionEngine.fuse(
                shortF, longD, false, false,
                CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.FIC));

        Assert.assertEquals("NONE", r.selectedFamily);
        Assert.assertEquals("INSUFFICIENT_EVIDENCE", r.gate15Status);
        Assert.assertTrue(r.familyDisqualifiers.stream()
                .anyMatch(d -> d.contains("GEOMETRY_ALONE_FORBIDDEN") || d.contains("FAMILY_DISQUALIFIED")));
    }

    @Test
    public void ficMultiEvidenceStickSlipSuspectsWithoutVp() {
        CplmShortFeatureResult shortF = baseShort("FIC_STICK");
        shortF.effortRatio = 6.0;
        shortF.gate4Status = "WARN";
        shortF.reversalCount = 12;

        CplmLongDiagnosticsResult longD = baseLong("FIC_STICK");
        longD.acfRegularity = 0.8;
        longD.fftPeakRatio = 0.7;
        longD.harmonicAmplitudeRatio = 0.25;
        longD.triangularity = 0.85;
        longD.horchOddness = 0.75;
        longD.cornerScoreQualified = 0.6;
        longD.phaseAreaNormPerCycle = 0.4;
        longD.opRangePct = 8;
        longD.effortRatio = 6.0;
        longD.periodStatus = "VALID";
        longD.completedCycles = 10;
        longD.gate5Status = "WARN";
        longD.gate6Status = "WARN";
        longD.gate7Status = "STRONG";
        longD.gate8Status = "STRONG";
        longD.gate9Status = "STRONG";
        longD.gate10Status = "PASS";
        longD.hasVp = false;

        CplmGateResult r = CplmGateFusionEngine.fuse(
                shortF, longD, false, false,
                CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.FIC));

        Assert.assertEquals("stiction", r.selectedFamily);
        Assert.assertTrue(r.stictionQualified);
        Assert.assertEquals("SUSPECTED", r.gate15Status);
        Assert.assertTrue(r.confidence <= 0.89);
        Assert.assertNotEquals("CONFIRMED", r.gate15Status);
    }

    @Test
    public void ficMultiEvidenceWithVpCanConfirm() {
        CplmShortFeatureResult shortF = baseShort("FIC_STICK_VP");
        shortF.effortRatio = 8.0;
        shortF.gate4Status = "STRONG";
        shortF.reversalCount = 20;

        CplmLongDiagnosticsResult longD = baseLong("FIC_STICK_VP");
        longD.acfRegularity = 1.0;
        longD.fftPeakRatio = 1.0;
        longD.triangularity = 1.0;
        longD.horchOddness = 0.9;
        longD.cornerScoreQualified = 0.8;
        longD.phaseAreaNormPerCycle = 0.5;
        longD.opRangePct = 15;
        longD.effortRatio = 8.0;
        longD.periodStatus = "VALID";
        longD.completedCycles = 20;
        longD.gate5Status = "WARN";
        longD.gate6Status = "WARN";
        longD.gate7Status = "STRONG";
        longD.gate8Status = "STRONG";
        longD.gate9Status = "STRONG";
        longD.hasVp = true;

        CplmGateResult r = CplmGateFusionEngine.fuse(
                shortF, longD, false, false,
                CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.FIC));

        Assert.assertEquals("stiction", r.selectedFamily);
        Assert.assertEquals("CONFIRMED", r.gate15Status);
        Assert.assertEquals("CONFIRMED_FINAL_ELEMENT_NONLINEARITY", r.diagnosis);
    }

    @Test
    public void ticSlowProfileRetainsHorchStictionPath() {
        CplmShortFeatureResult shortF = baseShort("TIC20803");
        shortF.effortRatio = 1.0;
        shortF.gate4Status = "PASS";

        CplmLongDiagnosticsResult longD = baseLong("TIC20803");
        longD.acfRegularity = 0;
        longD.fftPeakRatio = 0;
        longD.triangularity = 0;
        longD.horchOddness = 0.90;
        longD.cornerScoreQualified = 0.70;
        longD.phaseAreaNormPerCycle = 0.5;
        longD.opRangePct = 8;
        longD.effortRatio = 1.0;
        longD.periodStatus = "VALID";
        longD.completedCycles = 10;
        longD.gate5Status = "PASS";
        longD.gate6Status = "PASS";
        longD.gate7Status = "PASS";
        longD.gate8Status = "STRONG";
        longD.gate9Status = "STRONG";
        longD.hasVp = false;

        CplmGateResult r = CplmGateFusionEngine.fuse(
                shortF, longD, false, false,
                CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.TIC));

        Assert.assertEquals("TEMP_SLOW_SELF_REG", r.gateProfileId);
        Assert.assertEquals("stiction", r.selectedFamily);
        Assert.assertEquals(0.89, r.confidence, 1e-9);
    }

    @Test
    public void licIntegratingUsesPvStictionSignal() {
        List<CplmNormalizedSample> samples = new ArrayList<>();
        for (int i = 0; i < 128; i++) {
            double phase = 2.0 * Math.PI * i / 32.0;
            CplmNormalizedSample s = sample("LIC_TANK", i * 1000L,
                    50 + 5 * Math.sin(phase), 50, 40 + 0.2 * Math.sin(phase), null);
            s.loopType = "LEVEL";
            samples.add(s);
        }
        CplmLoopDynamicsProfile lic = CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.LIC);
        Assert.assertTrue(lic.integrating);
        Assert.assertEquals("PV", lic.stictionSignal());
        Assert.assertEquals(CplmLoopDynamicsProfile.GateRole.DISPLAY_ONLY, lic.geometryRole);

        CplmLongDiagnosticsResult longD = CplmGateEngine.computeLongDiagnostics(
                samples, 0, 128_000, "24h", lic);
        Assert.assertEquals("PV", longD.stictionSignal);
        Assert.assertEquals("LIC", longD.dynamicsClass);
    }

    @Test
    public void pressureLiquidFastMirrorsGeometryDemotion() {
        CplmLoopDynamicsProfile pic = CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.PIC);
        Assert.assertEquals("PRESSURE_LIQUID_FAST", pic.gateProfileId);
        Assert.assertTrue(pic.geometryAloneForbidden);
        Assert.assertEquals(CplmLoopDynamicsProfile.DynamicClass.FAST_SELF_REG, pic.dynamicClass);

        CplmShortFeatureResult shortF = baseShort("PIC100");
        shortF.effortRatio = 0.01;
        shortF.gate4Status = "PASS";
        CplmLongDiagnosticsResult longD = baseLong("PIC100");
        longD.cornerScoreQualified = 0.9;
        longD.phaseAreaNormPerCycle = 0.4;
        longD.opRangePct = 5;
        longD.effortRatio = 0.01;
        longD.periodStatus = "VALID";
        longD.completedCycles = 10;
        longD.acfRegularity = 0;
        longD.triangularity = 0;
        longD.horchOddness = 0;
        longD.gate5Status = "PASS";
        longD.gate6Status = "PASS";
        longD.gate7Status = "PASS";
        longD.gate8Status = "PASS";
        longD.gate9Status = "STRONG";
        longD.hasVp = false;

        CplmGateResult r = CplmGateFusionEngine.fuse(shortF, longD, false, false, pic);
        Assert.assertEquals("NONE", r.selectedFamily);
    }

    @Test
    public void pressureGasIntegratingMirrorsLevel() {
        CplmLoopDynamicsProfile gas = CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.PIC_GAS);
        Assert.assertEquals("PRESSURE_GAS_INTEGRATING", gas.gateProfileId);
        Assert.assertTrue(gas.integrating);
        Assert.assertEquals("PV", gas.stictionSignal());
        Assert.assertEquals(CplmLoopDynamicsProfile.GateRole.DISPLAY_ONLY, gas.geometryRole);
        Assert.assertEquals(
                CplmLoopDynamicsProfile.LoopClass.PIC_GAS,
                CplmLoopDynamicsProfile.parseClass("PRESSURE_GAS_INTEGRATING"));
    }

    @Test
    public void unknownClassDisablesGeometry() {
        CplmLoopDynamicsProfile u = CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.UNKNOWN);
        Assert.assertFalse(u.geometryFamilyEnabled);
        Assert.assertEquals(0.0, u.priorGeometry, 1e-12);
    }

    @Test
    public void persistenceCapsSingleWindowSuspect() {
        CplmShortFeatureResult shortF = baseShort("FIC_PERS");
        shortF.effortRatio = 8;
        shortF.gate4Status = "STRONG";
        shortF.reversalCount = 10;

        CplmLongDiagnosticsResult longD = baseLong("FIC_PERS");
        longD.acfRegularity = 1;
        longD.fftPeakRatio = 1;
        longD.triangularity = 1;
        longD.horchOddness = 0.9;
        longD.cornerScoreQualified = 0.8;
        longD.phaseAreaNormPerCycle = 0.5;
        longD.opRangePct = 12;
        longD.effortRatio = 8;
        longD.periodStatus = "VALID";
        longD.completedCycles = 20;
        longD.gate5Status = "WARN";
        longD.gate6Status = "WARN";
        longD.gate7Status = "STRONG";
        longD.gate8Status = "STRONG";
        longD.hasVp = true;

        CplmLoopDynamicsProfile fic = CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.FIC);
        CplmGateResult r = CplmGateFusionEngine.fuse(shortF, longD, false, false, fic);
        Assert.assertEquals("CONFIRMED", r.gate15Status);

        CplmGateFusionEngine.applyPersistence(r, new ArrayList<>(), fic);
        Assert.assertFalse(r.persistenceSatisfied);
        Assert.assertEquals("DETECTED_FINAL_ELEMENT_NONLINEARITY", r.diagnosis);
        Assert.assertTrue(r.observabilityFlags.contains("PERSISTENCE_CAP"));

        CplmGateResult r2 = CplmGateFusionEngine.fuse(shortF, longD, false, false, fic);
        CplmGateFusionEngine.applyPersistence(r2, Arrays.asList("stiction", "stiction"), fic);
        Assert.assertTrue(r2.persistenceSatisfied);
        Assert.assertEquals("CONFIRMED", r2.gate15Status);
    }

    @Test
    public void persistenceHistoryRetainsElevatedFamilyAfterDisplayCap() {
        CplmGateResult result = new CplmGateResult();
        result.selectedFamily = "stiction";
        result.gate15Status = "SUSPECTED";
        result.confidence = 0.80;

        Assert.assertEquals(
                "stiction",
                CplmGateFusionStreamJob.GateFusionCoProcess.elevatedFamilyForHistory(result));

        CplmLoopDynamicsProfile profile =
                CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.FIC);
        CplmGateFusionEngine.applyPersistence(result, new ArrayList<>(), profile);
        Assert.assertEquals(0.54, result.confidence, 1e-12);
        Assert.assertEquals(
                "stiction",
                CplmGateFusionStreamJob.GateFusionCoProcess.elevatedFamilyForHistory(result));
    }

    @Test
    public void g9TriStateBelowBandIsPassAboveBandIsNotEvaluated() {
        CplmLoopDynamicsProfile fic = CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.FIC);
        Assert.assertEquals(CplmLoopDynamicsProfile.PhaseAreaBand.BELOW_BAND, fic.classifyPhaseArea(0.01));
        Assert.assertEquals(CplmLoopDynamicsProfile.PhaseAreaBand.IN_BAND, fic.classifyPhaseArea(0.5));
        Assert.assertEquals(CplmLoopDynamicsProfile.PhaseAreaBand.ABOVE_BAND, fic.classifyPhaseArea(2.0));
    }

    @Test
    public void loopTypeOnSampleSelectsLicOverTagInference() {
        List<CplmNormalizedSample> samples = new ArrayList<>();
        for (int i = 0; i < 64; i++) {
            CplmNormalizedSample s = sample("X99_MISC", i * 1000L, 10, 10, 50, null);
            s.loopType = "LEVEL";
            samples.add(s);
        }
        CplmLongDiagnosticsResult r = CplmGateEngine.computeLongDiagnostics(samples, 0, 64_000, "24h");
        Assert.assertEquals("LIC", r.dynamicsClass);
        Assert.assertEquals("PV", r.stictionSignal);
    }

    @Test
    public void spineClassPackHydratesPicGas() {
        CplmDynamicsParameterSetSupport.putRaw(
                "cplm.dynamics.class.PIC_GAS",
                "{\"class\":\"PIC_GAS\",\"geometryPrior\":0.25,\"integrating\":true}");
        CplmLoopDynamicsProfile p = CplmDynamicsParameterSetSupport.resolveFromSpine(
                "VESSEL_P1", "PRESSURE_GAS_INTEGRATING", null);
        Assert.assertEquals(CplmLoopDynamicsProfile.LoopClass.PIC_GAS, p.loopClass);
        Assert.assertTrue(p.integrating);
        Assert.assertEquals(0.25, p.priorGeometry, 1e-9);
    }

    @Test
    public void spineProfileParsesNestedGovernedFields() {
        CplmLoopDynamicsProfile p = CplmDynamicsParameterSetSupport.parseProfileJson(
                "{\"class\":\"TIC\",\"serviceObjective\":\"QUALITY\","
                        + "\"familyPriors\":{\"stiction\":0.7,\"oscillation\":0.8,\"effort\":0.9,\"geometry\":0.6},"
                        + "\"pvFilter\":{\"type\":\"ewma\",\"window\":11}}",
                CplmLoopDynamicsProfile.ProfileSource.OVERRIDE);
        Assert.assertNotNull(p);
        Assert.assertEquals(CplmLoopDynamicsProfile.ServiceObjective.QUALITY, p.serviceObjective);
        Assert.assertEquals(0.7, p.priorStiction, 1e-12);
        Assert.assertEquals(0.8, p.priorOscillation, 1e-12);
        Assert.assertEquals(0.9, p.priorEffort, 1e-12);
        Assert.assertEquals(0.6, p.priorGeometry, 1e-12);
        Assert.assertEquals("ewma", p.pvFilterType);
        Assert.assertEquals(11, p.pvFilterWindow);
    }

    @Test
    public void broadcastResolvedProfileTravelsWithSamples() {
        List<CplmNormalizedSample> samples = new ArrayList<>();
        CplmLoopDynamicsProfile lic =
                CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.LIC);
        lic.profileSource = CplmLoopDynamicsProfile.ProfileSource.OVERRIDE;
        for (int i = 0; i < 64; i++) {
            CplmNormalizedSample s = sample("FIC_CARRIED", i * 1000L, 10, 10, 50, null);
            s.loopType = "FLOW";
            s.resolvedProfile = lic;
            samples.add(s);
        }
        CplmLongDiagnosticsResult result =
                CplmGateEngine.computeLongDiagnostics(samples, 0, 64_000, "24h");
        Assert.assertEquals("LIC", result.dynamicsClass);
        Assert.assertEquals("PV", result.stictionSignal);
        Assert.assertEquals("OVERRIDE", result.profileSource);
    }

    @Test
    public void insufficientFusionPreservesDecisionInputsInPayload() {
        CplmShortFeatureResult shortF = baseShort("FIC_EARLY");
        shortF.sufficientData = false;
        shortF.regionOutOfBandPct = 0.42;
        shortF.gate2rStatus = "FAIL";
        shortF.operatingRegionValid = false;

        CplmLongDiagnosticsResult longD = baseLong("FIC_EARLY");
        longD.satLimitDwellSamples = 44;
        longD.satCyclingPattern = true;
        longD.periodRejectReason = "PERIOD_OUT_OF_BAND";

        CplmGateResult result = CplmGateFusionEngine.fuse(
                shortF, longD, false, false,
                CplmLoopDynamicsProfile.forClass(CplmLoopDynamicsProfile.LoopClass.FIC));
        Assert.assertEquals(0.42, result.regionOutOfBandPct, 1e-12);
        Assert.assertEquals(44, result.satLimitDwellSamples);
        Assert.assertTrue(result.satCyclingPattern);
        Assert.assertTrue(result.toJson().contains("\"period_reject_reason\":\"PERIOD_OUT_OF_BAND\""));
    }

    @Test
    public void broadcastProfileOperatorProducesSerializableJobPlan() {
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        env.setParallelism(2);
        CplmJobConfig cfg = new CplmJobConfig(
                "kafka:9092", "profile-plan-test", "profile-plan-test",
                "samples", "gates", "short", "long", 24, 2);
        CplmNormalizedSample input = sample("FIC_PLAN", 1_000L, 10, 10, 50, null);
        CplmParameterSetBroadcastSupport
                .connectSampleProfiles(env.fromElements(input), env, cfg)
                .map(s -> s.loopId)
                .print();
        String plan = env.getExecutionPlan();
        Assert.assertTrue(plan.contains("cplm-sample-profile-broadcast"));
    }

    @Test
    public void historicalReplayUsesTheNativeFusionEngineWithoutChangingResults() {
        List<CplmNormalizedSample> samples = fastNoise("FIC_REPLAY", 128);
        List<CplmNormalizedSample> evaluationSamples =
                CplmHistoricalReplayJob.materializeEvaluationSamples(
                        samples, 0, 128_000, 5_000);
        CplmLoopDynamicsProfile profile =
                CplmDynamicsParameterSetSupport.resolveFromSpine("FIC_REPLAY", null, null);

        CplmGateResult expected = CplmGateFusionEngine.fuseFromSamples(
                evaluationSamples, 0, 128_000, "24h", false, false, profile);
        CplmGateResult replay = CplmHistoricalReplayJob.computeWindow(
                new ArrayList<>(samples), 0, 128_000);

        Assert.assertEquals(expected.toJson(), replay.toJson());
    }

    @Test
    public void exceptionEventsMaterializeToTheFiveSecondDesignTimeline() {
        long dayMs = 86_400_000L;
        List<CplmNormalizedSample> events = Arrays.asList(
                sample("PIC_EXCEPTION", 0, 35.0, 35.0, 28.0, null),
                sample("PIC_EXCEPTION", 21_600_000L, 34.5, 35.0, 31.0, null),
                sample("PIC_EXCEPTION", 43_200_000L, 35.5, 35.0, 29.0, null),
                sample("PIC_EXCEPTION", 64_800_000L, 34.8, 35.0, 33.0, null),
                sample("PIC_EXCEPTION", dayMs - 1, 35.2, 35.0, 30.0, null));

        List<CplmNormalizedSample> evaluation =
                CplmHistoricalReplayJob.materializeEvaluationSamples(
                        events, 0, dayMs, 5_000);
        Assert.assertEquals(17_280, evaluation.size());
        Assert.assertEquals(35.0, evaluation.get(0).pv, 1e-12);
        Assert.assertEquals(33.0, evaluation.get(evaluation.size() - 1).op, 1e-12);

        CplmGateResult result = CplmHistoricalReplayJob.computeWindow(
                new ArrayList<>(events), 0, dayMs);
        Assert.assertEquals(17_280, result.sampleCount);
        Assert.assertEquals(5.0, result.samplePeriodSec, 1e-12);
        Assert.assertEquals("PASS", result.gate0Status);
        Assert.assertTrue(result.mae > 0.0);
        Assert.assertTrue(result.rmse > 0.0);
        Assert.assertTrue(result.opStd > 0.0);
    }

    private static List<CplmNormalizedSample> fastNoise(String loopId, int n) {
        List<CplmNormalizedSample> samples = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            double noise = ((i * 37) % 17) / 17.0 - 0.5;
            samples.add(sample(loopId, i * 1000L, 100 + noise, 100, 50 + 0.1 * noise, null));
        }
        return samples;
    }

    private static CplmShortFeatureResult baseShort(String loopId) {
        CplmShortFeatureResult r = new CplmShortFeatureResult();
        r.loopId = loopId;
        r.windowKind = "60m";
        r.sampleCount = 720;
        r.expectedSampleCount = 720;
        r.completeness = 1.0;
        r.autoPct = 0.99;
        r.gate0Status = "PASS";
        r.gate1Status = "PASS";
        r.gate2Status = "PASS";
        r.gate2rStatus = "PASS";
        r.operatingRegionValid = true;
        r.gate3Status = "PASS";
        r.gate4Status = "PASS";
        r.sufficientData = true;
        r.goodErrorPct = 0.8;
        return r;
    }

    private static CplmLongDiagnosticsResult baseLong(String loopId) {
        CplmLongDiagnosticsResult r = new CplmLongDiagnosticsResult();
        r.loopId = loopId;
        r.windowKind = "24h";
        r.sampleCount = 1000;
        r.samplePeriodSec = 1;
        r.gate10Status = "PASS";
        r.gate11Status = "PASS";
        r.freezeIndexS = 0;
        return r;
    }

    private static CplmNormalizedSample sample(
            String loopId, long ts, double pv, double sp, double op, Double vp) {
        CplmNormalizedSample s = new CplmNormalizedSample();
        s.loopId = loopId;
        s.eventTsMs = ts;
        s.pv = pv;
        s.sp = sp;
        s.op = op;
        s.vp = vp;
        s.mode = "AUTO";
        s.quality = "GOOD";
        return s;
    }
}
