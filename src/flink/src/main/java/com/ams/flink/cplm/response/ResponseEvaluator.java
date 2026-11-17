package com.ams.flink.cplm.response;

import com.ams.flink.cplm.evidence.EvidenceArtifact;
import com.ams.flink.cplm.identity.BuildIdentity;
import com.ams.flink.cplm.identity.ProfileHash;
import com.ams.flink.cplm.identity.RunIdentity;
import com.ams.flink.cplm.response.controller.ControllerSnapshot;
import com.ams.flink.cplm.response.controller.FrequencyResponse;
import com.ams.flink.cplm.response.estimation.EstimationResult;
import com.ams.flink.cplm.response.estimation.EstimatorRegistry;
import com.ams.flink.cplm.response.estimation.EstimatorSettings;
import com.ams.flink.cplm.response.estimation.FitBudgetExceeded;
import com.ams.flink.cplm.response.estimation.ModelEstimator;
import com.ams.flink.cplm.response.event.EventType;
import com.ams.flink.cplm.response.event.InputPathResolver;
import com.ams.flink.cplm.response.evidence.ResponseEvidenceWriter;
import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.metrics.ResponseMetricCalculator;
import com.ams.flink.cplm.response.model.ModelFamily;
import com.ams.flink.cplm.response.model.ProcessModel;
import com.ams.flink.cplm.response.model.Quantity;
import com.ams.flink.cplm.response.simulation.ZohSimulator;
import com.ams.flink.cplm.response.validation.HoldoutStart;
import com.ams.flink.cplm.response.validation.ModelValidator;
import com.ams.flink.cplm.response.validation.PredictionBand;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * Turns one closed capture into a {@link G12Result} plus its evidence (spec §2.2 subgates A-H):
 * A eligibility (path + applied input), B the event, C observed-response metrics, D estimation
 * through the legal adapter within a wall-clock budget (BUDGET_EXCEEDED censors, never a partial
 * model), E validation on the loop's previous COMPLETE event when one is held (else CANDIDATE),
 * F controller / frequency outputs (UNAVAILABLE without a known controller), G model governance
 * state, H the advisory package (absent without a validated model). Pure: no Flink types.
 */
public final class ResponseEvaluator implements Serializable {
    private static final long serialVersionUID = 1L;

    public static final class Outcome implements Serializable {
        private static final long serialVersionUID = 1L;
        public final G12Result result;
        public final List<EvidenceArtifact> artifacts;
        /** The dataset to hold as the next validation holdout for this loop (null when not usable). */
        public final EventDataset holdoutCandidate;
        public final double holdoutU0;

        Outcome(G12Result result, List<EvidenceArtifact> artifacts, EventDataset holdoutCandidate, double holdoutU0) {
            this.result = result;
            this.artifacts = artifacts;
            this.holdoutCandidate = holdoutCandidate;
            this.holdoutU0 = holdoutU0;
        }
    }

    private final ResponseJobConfig cfg;
    private final String bundleHash;
    /** CHG-209: the prediction band's wall-clock budget, apart from the fit's (ms); package-private so a test can force an overrun. */
    long bandBudgetMs = BAND_BUDGET_MS;
    static final long BAND_BUDGET_MS = 2_000;

    public ResponseEvaluator(ResponseJobConfig cfg) {
        this.cfg = cfg;
        this.bundleHash = cfg.bundleHash();
    }

    /** The median sample interval of the event (s); 0 when fewer than two samples. */
    static double medianStep(double[] t) {
        if (t == null || t.length < 2) return 0;
        double[] d = new double[t.length - 1];
        for (int i = 1; i < t.length; i++) d[i - 1] = t[i] - t[i - 1];
        java.util.Arrays.sort(d);
        int m = d.length / 2;
        return d.length % 2 == 1 ? d[m] : 0.5 * (d[m - 1] + d[m]);
    }

    public Outcome evaluate(ResponseCapture.Closed c, ModelFamily family, EventDataset priorHoldout, double priorU0,
                            ControllerSnapshot controller, long nowMs, String purpose, String analysisRunId, int contextRevision) {
        G12Result g = G12Result.empty(c.event.loopId, c.event.pathId);
        g.eventId = c.event.eventId;
        g.windowStartMs = Math.round(c.data.t0 * 1000.0);                    // to the millisecond: (long) t0 * 1000 truncated to whole seconds
        g.windowEndMs = Math.round(c.data.tEnd * 1000.0);
        g.emittedAtMs = nowMs;
        g.bundleHash = bundleHash;
        g.purpose = purpose;
        g.analysisRunId = analysisRunId == null ? "" : analysisRunId;
        g.contextRevision = contextRevision;
        g.datasetHash = "ds:" + ProfileHash.sha256Prefix(datasetText(c.data), 16);
        g.methodRunId = RunIdentity.methodRunId(c.event.loopId, "G12", G12Result.METHOD_ID, G12Result.METHOD_VERSION,
                g.windowStartMs, g.windowEndMs, bundleHash, contextRevision, 1);
        BuildIdentity id = BuildIdentity.current();
        g.sourceCommit = id.sourceCommit;
        g.jarSha256 = id.jarSha256;
        g.contractVersion = BuildIdentity.CONTRACT_VERSION;
        List<String> rejections = new ArrayList<>();

        // A - eligibility
        G12Result.Subgate a = g.subgates.get("A");
        a.outputs.put("path_id", c.event.pathId);
        a.outputs.put("path_reason", c.pathReason);
        a.outputs.put("u_applied_available", c.uAppliedAvailable);
        boolean censored = "CENSORED".equals(c.event.captureState) || "REJECTED".equals(c.event.captureState);
        g.eligibility = c.uAppliedAvailable ? "ELIGIBLE" : "LIMITED";
        // v2.5 (2G.1, NR-016): the sample grid bounds the dead time this event can resolve
        double gridS = medianStep(c.data.t);
        a.outputs.put("sample_grid_s", gridS);
        if (cfg.delayMinS > 0 && gridS > cfg.delayMinS) {
            g.eligibility = "LIMITED";
            a.outputs.put("bandwidth", "LIMITED");
            a.outputs.put("bandwidth_reason", "BANDWIDTH: grid " + gridS + " s > delay_min_s " + cfg.delayMinS + " - dead times below the grid cannot be resolved");
        } else {
            a.outputs.put("bandwidth", cfg.delayMinS > 0 ? "ELIGIBLE" : "NOT_ASSESSED");
        }
        a.state = "EVALUATED";

        // B - the event
        G12Result.Subgate b = g.subgates.get("B");
        b.outputs.put("event_type", c.event.type.name());
        b.outputs.put("capture_state", c.event.captureState);
        b.outputs.put("censor_reason", c.event.censorReason);
        b.outputs.put("input_sequence", c.event.inputSequence.size());
        b.state = "EVALUATED";
        if (censored) {
            g.evaluationState = "CENSORED";
            g.finding = c.event.censorReason;
            rejections.add("EVENT:" + c.event.censorReason);
        } else {
            g.evaluationState = "EVALUATED";
        }

        // C - observed response
        ResponseMetricCalculator.Settings ms = metricSettings(c.event.preNoiseSigmaEu);
        Map<String, Quantity> observed = ResponseMetricCalculator.compute(c.data, c.r0, c.r1, c.duApplied, ms);
        for (Quantity q : observed.values()) g.put(q);
        g.subgates.get("C").state = "EVALUATED";
        g.subgates.get("C").outputs.put("method", ResponseMetricCalculator.METHOD);

        // D - estimation
        EstimationResult est = null;
        ZohSimulator.Result fit = null;
        double y0 = observed.get("baseline_pv").available() ? observed.get("baseline_pv").value : c.data.y[0];
        G12Result.Subgate d = g.subgates.get("D");
        InputPathResolver.Path path = InputPathResolver.Path.valueOf(c.event.pathId);
        String legality = EstimatorRegistry.legality(path, c.event.type, family);
        ModelEstimator estimator = censored ? null : EstimatorRegistry.forPath(path, c.event.type, family);
        d.outputs.put("legality", legality);
        if (estimator == null) {
            d.state = censored ? "NOT_EVALUATED" : "UNSUPPORTED";
            rejections.add("ESTIMATION:" + (censored ? c.event.censorReason : legality));
        } else {
            long started = System.currentTimeMillis();
            // CHG-205: the historian's grid is uneven; a method that needs an even one gets a resampled copy (metrics, evidence and validation keep the raw samples)
            EventDataset fitData = c.data;
            if (estimator.requiresUniformGrid() && !c.data.isUniform(1e-6)) {
                double gridStep = c.data.medianDt();
                fitData = c.data.resampledUniform(gridStep);
                d.outputs.put("resampled_grid_s", gridStep);
            }
            // CHG-075: the budget is a deadline the fit honours (it used to be checked only after a fit that could run an hour)
            String budgetStage = null;
            try {
                est = estimator.estimate(fitData, c.u0, family, estimatorSettings(System.nanoTime() + cfg.fitBudgetMs * 1_000_000L));
            } catch (FitBudgetExceeded x) {
                if (x.interrupted()) throw x;     // a cancel, not a budget: no result; the event is re-evaluated after restore
                budgetStage = x.stage().isEmpty() ? x.getMessage() : x.stage();
            }
            long took = System.currentTimeMillis() - started;
            d.outputs.put("method_id", estimator.methodId());
            d.outputs.put("method_version", estimator.methodVersion());
            d.outputs.put("fit_ms", took);
            if (budgetStage != null || took > cfg.fitBudgetMs) {
                est = EstimationResult.none(EstimationResult.State.NOT_ESTIMATED, "BUDGET_EXCEEDED");
                d.outputs.put("budget_ms", cfg.fitBudgetMs);
                d.outputs.put("budget_stage", budgetStage != null ? budgetStage : "AFTER_FIT");
                d.state = "CENSORED";
                g.evaluationState = "CENSORED";
                g.finding = "BUDGET_EXCEEDED";
                rejections.add("ESTIMATION:BUDGET_EXCEEDED");
            } else {
                d.state = est.state.name();
                d.outputs.put("reason", est.reason);
                if (est.best() != null) {
                    EstimationResult.Candidate best = est.best();
                    for (Quantity q : best.model.parameters().values()) {
                        Double se = best.stdErr.get(q.quantityId);
                        g.put(q.available() && se != null && Double.isFinite(se) ? Quantity.of(q.quantityId, q.value, q.unit, q.method, se) : q);
                    }
                    if (best.flatDelay) g.put(Quantity.of("dead_time", best.model.theta, "s", estimator.methodId(), best.thetaUncertaintyS));
                    fit = ZohSimulator.simulate(best.model, c.data.t, c.data.u, c.u0, best.y0, best.v0, c.data.t0, cfg.maxGapS);
                    g.modelState = "CANDIDATE";
                } else {
                    rejections.add("ESTIMATION:" + est.state + (est.reason.isEmpty() ? "" : ":" + est.reason));
                }
            }
        }

        // post_slope: the robust post-event rate, meaningful on integrating / ramp paths only (catalogue)
        boolean integratingOrRamp = family == ModelFamily.IPDT || family == ModelFamily.INTEGRATOR_LAG
                || c.event.type == com.ams.flink.cplm.response.event.EventType.RAMP_TRACKING;
        if (!censored && integratingOrRamp) {
            double theta = est != null && est.best() != null ? Math.max(0, est.best().model.theta) : 0;
            Double postSlope = com.ams.flink.cplm.response.metrics.Slopes.theilSen(c.data, c.data.t0 + theta, c.data.tEnd, true, 3);
            if (postSlope != null) g.put(Quantity.of("post_slope", postSlope, "PV_EU/s", com.ams.flink.cplm.response.metrics.Slopes.METHOD));
        }

        // E - validation on the PRIOR event (independent support); this event becomes the next holdout
        G12Result.Subgate e = g.subgates.get("E");
        ModelValidator.Report report = null;
        HoldoutStart start = null;
        boolean validated = false;
        if (est != null && est.best() != null && priorHoldout != null) {
            EstimationResult.Candidate best = est.best();
            // CHG-211: the prior event is replayed from its OWN pre-step state (else this fit's y0 / v0) - its level, and for an
            // integrating model its pre-step line - the check, its flat baseline, y_predict and the band all take this one start
            start = HoldoutStart.of(priorHoldout, best.model.family, cfg.preSupportS, best.y0, best.v0);
            report = ModelValidator.validate(best.model, start, priorHoldout, priorU0, ResponseScale.of(cfg).noiseFloorEu(Double.NaN), cfg.maxGapS);
            e.outputs.put("holdout_start", start.provenance());
            e.outputs.put("baseline", report.baseline);                          // final review M4: the pre-step line, else constant y0
            g.put(report.validationRmse);
            g.put(report.predictionRmse);
            g.put(report.fitImprovement);
            g.put(report.residualBias);
            e.outputs.put("verdict", report.verdict);
            e.outputs.put("reason", report.reason);
            e.outputs.put("whiteness_p", report.whitenessP);
            e.outputs.put("lag_convention", report.lagConvention);
            e.state = "EVALUATED";
            validated = "VALIDATED".equals(report.verdict);
            g.modelState = validated ? "VALIDATED" : ("REJECTED".equals(report.verdict) ? "REJECTED" : "CANDIDATE");
            if (!validated) rejections.add("VALIDATION:" + report.verdict + ":" + report.reason);
        } else {
            e.state = est != null && est.best() != null ? "WAITING" : "NOT_EVALUATED";
            e.outputs.put("reason", est != null && est.best() != null ? "NO_INDEPENDENT_EVENT_YET" : "NO_MODEL");
        }

        // F - controller / frequency (model-domain; UNAVAILABLE without a known form or a validated model)
        G12Result.Subgate f = g.subgates.get("F");
        FrequencyResponse.Result freq = null;
        if (controller != null && controller.known()) {
            ControllerSnapshot ideal = com.ams.flink.cplm.response.controller.ControllerFormAdapter.toIdeal(controller);
            g.put(Quantity.of("controller_gain", ideal.kc, "native_units", "CONFIGURED"));
            if (ideal.ti != null) g.put(Quantity.of("controller_ti", ideal.ti, "s", "CONFIGURED"));
            if (ideal.td != null) g.put(Quantity.of("controller_td", ideal.td, "s", "CONFIGURED"));
            if (ideal.scanS != null) g.put(Quantity.of("controller_scan", ideal.scanS, "s", "CONFIGURED"));
        }
        if (est != null && est.best() != null) {
            freq = FrequencyResponse.of(est.best().model, controller, 1e-4, 10, 2000, validated);
            g.put(freq.gainMarginDb);
            g.put(freq.phaseMarginDeg);
            g.put(freq.gainCrossover);
            g.put(freq.phaseCrossover);
            g.put(freq.peakS);
            g.put(freq.peakT);
            g.put(freq.bandwidth);
            f.state = "EVALUATED";
        } else {
            f.state = "NOT_EVALUATED";
        }

        // G - governance state; H - advisory: only a VALIDATED model, a known controller form and an APPROVED
        // lambda (G12.lambda_s from the governed configuration, 3A.2) yield SIMC numbers - advisory, never applied
        g.subgates.get("G").state = "EVALUATED";
        g.subgates.get("G").outputs.put("model_state", g.modelState);
        G12Result.Subgate h = g.subgates.get("H");
        if (validated && est != null && est.best() != null) {
            com.ams.flink.cplm.response.controller.SimcAdvisor.Advice adv = com.ams.flink.cplm.response.controller.SimcAdvisor.advise(
                    est.best().model, true, controller, cfg.lambdaS > 0 ? cfg.lambdaS : null);
            h.outputs.put("rule", adv.rule);
            h.outputs.put("lambda_s", cfg.lambdaS > 0 ? cfg.lambdaS : null);
            if (adv.kc != null) {
                h.state = "EVALUATED";
                h.outputs.put("kc", adv.kc);
                h.outputs.put("ti_s", adv.ti);
                h.outputs.put("td_s", adv.td);
                h.outputs.put("reason", "ADVISORY_ONLY_NEVER_APPLIED");
            } else {
                h.state = "WAITING";
                h.outputs.put("reason", adv.reason);
            }
        } else {
            h.state = "NOT_EVALUATED";
            h.outputs.put("reason", "MODEL_NOT_VALIDATED");
        }
        if (!censored && g.finding.equals("NONE")) g.finding = est != null && est.best() != null ? "RESPONSE_CHARACTERISED" : "OBSERVED_ONLY";

        // evidence
        double[] residuals = null, resAcf = null;
        if (fit != null) {
            residuals = new double[c.data.size()];
            for (int i = 0; i < residuals.length; i++) residuals[i] = fit.valid[i] && c.data.valid[i] ? c.data.y[i] - fit.yHat[i] : Double.NaN;
            resAcf = report != null ? report.residualAcf : null;
        }
        Map<String, Quantity> times = new java.util.LinkedHashMap<>();
        for (String k : new String[] {"t10", "t50", "t63", "t90"}) times.put(k, observed.get(k));
        List<EvidenceArtifact> artifacts = ResponseEvidenceWriter.artifacts(g.methodRunId, c.event, c.data, fit,
                null, null, null, y0, c.r1, times, residuals, resAcf, est, freq, rejections);
        if (report != null && priorHoldout != null && est != null && est.best() != null) {
            artifacts.addAll(modelCheckEvidence(g.methodRunId, c.event.pathId, est.best(), residuals, priorHoldout, priorU0, start));
        }
        EventDataset holdout = !censored && c.uAppliedAvailable ? c.data : null;
        return new Outcome(g, artifacts, holdout, c.u0);
    }

    /**
     * y_predict - the model's free run on the INDEPENDENT holdout (the fit on the training event is y_fit) - then, CHG-209, its 95 %
     * prediction band on the same times: the parameter standard errors, the delay profile's half-width and the training fit's
     * free-run residual noise. The band is best effort: it runs after y_predict, under its own deadline (bandBudgetMs); on any
     * failure or overrun no band artifact is written and y_predict records why. A cancel is re-thrown, as in the fit.
     * CHG-211: both start where the model check started (start); y_predict records which start that was ("holdout_start") and,
     * on an integrating model's pre-step line, its slope ("holdout_start_slope", PV_EU/s).
     */
    private List<EvidenceArtifact> modelCheckEvidence(String methodRunId, String pathId, EstimationResult.Candidate best, double[] residuals,
                                                      EventDataset holdout, double holdoutU0, HoldoutStart start) {
        List<EvidenceArtifact> out = new ArrayList<>();
        ZohSimulator.Result nominal = ZohSimulator.simulate(best.model, holdout.t, holdout.u, holdoutU0, start.y0, start.v0, holdout.t0, cfg.maxGapS);
        EvidenceArtifact predict = EvidenceArtifact.series(methodRunId, "G12", "y_predict", pathId, "time", "s", "pv_predict_holdout", "PV_EU",
                holdout.t, nominal.yHat, holdout.valid);
        predict.provenance.put("holdout_start", start.provenance());
        if (start.onLine) predict.provenance.put("holdout_start_slope", start.v0);
        out.add(predict);
        try {
            long deadline = System.nanoTime() + bandBudgetMs * 1_000_000L;
            // a free-run band takes its noise from the free-run residuals (a PEM objective is the one-step innovation SSE)
            double sigma = PredictionBand.noiseSigma(residuals, best.stdErr.size(), best.objective, best.samples);
            PredictionBand.Result band = PredictionBand.compute(best.model, best.stdErr, best.thetaUncertaintyS, sigma, holdout, holdoutU0,
                    start, cfg.maxGapS, nominal, deadline == 0 ? 1 : deadline);
            EvidenceArtifact pi = ResponseEvidenceWriter.predictionInterval(methodRunId, pathId, holdout.t, band.lower, band.upper);
            pi.provenance.put("coverage", band.coverage);
            pi.provenance.put("residual_sigma", sigma);
            pi.provenance.put("parameters", String.join(";", band.parameters));
            if (Double.isFinite(band.deadTimeHalfWidthS)) pi.provenance.put("dead_time_half_width_s", band.deadTimeHalfWidthS);
            out.add(pi);
        } catch (FitBudgetExceeded x) {
            if (x.interrupted()) throw x;                                   // a cancel, not an overrun
            predict.provenance.put("prediction_band", "NOT_COMPUTED:BUDGET_EXCEEDED");
        } catch (RuntimeException x) {
            predict.provenance.put("prediction_band", "NOT_COMPUTED:" + x.getClass().getSimpleName());
        }
        return out;
    }

    /**
     * CHG-204: the PV-side bands in the loop's units (ResponseScale), widened by the noise sigma stored on the event
     * at detection (never recomputed here) - the value ResponseCapture.settled() uses - so settle_response and the
     * stable baseline and endpoint use the band of the capture's settled decision.
     */
    private ResponseMetricCalculator.Settings metricSettings(double noiseSigmaEu) {
        ResponseScale scale = ResponseScale.of(cfg);
        ResponseMetricCalculator.Settings s = new ResponseMetricCalculator.Settings();
        s.preSupportS = cfg.preSupportS;
        s.tailDwellS = cfg.tailDwellS;
        s.stableBandEu = scale.stableBandEu(noiseSigmaEu);
        s.absSettlingBandEu = scale.absSettlingBandEu();
        s.relSettlingBand = cfg.relSettlingBand;
        s.noiseFloorEu = scale.noiseFloorEu(noiseSigmaEu);
        s.crossingDwellS = cfg.crossingDwellS;
        s.maxGapS = cfg.maxGapS;
        s.minResponseEu = scale.minResponseEu();
        s.targetBandEu = scale.targetBandEu();
        s.preNoiseSigmaEu = noiseSigmaEu;
        return s;
    }

    private EstimatorSettings estimatorSettings(long deadlineNanos) {
        EstimatorSettings s = new EstimatorSettings();
        s.deadlineNanos = deadlineNanos == 0 ? 1 : deadlineNanos;          // 0 would mean no deadline
        s.delayGridS = cfg.delayGridS;
        s.thetaMaxS = cfg.thetaMaxS;
        s.tauMaxS = cfg.tauMaxS;
        s.maxBridgeS = cfg.maxGapS;
        s.minInputEu = cfg.stepMinInputEu;
        s.maxIterations = cfg.fitMaxIterations;
        s.relTol = cfg.fitRelativeTolerance;
        s.tauMinS = cfg.tauMinS;
        s.gainAbsMax = ResponseScale.of(cfg).gainAbsMax();
        return s;
    }

    private static String datasetText(EventDataset d) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < d.size(); i++) {
            sb.append(d.t[i]).append(',').append(d.y[i]).append(',').append(d.r[i]).append(',').append(d.u[i]).append(',').append(d.valid[i] ? 1 : 0).append('\n');
        }
        return sb.toString();
    }

    static List<String> none() { return Collections.emptyList(); }
}
