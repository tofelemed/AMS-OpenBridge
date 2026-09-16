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
import com.ams.flink.cplm.response.validation.ModelValidator;

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

    public ResponseEvaluator(ResponseJobConfig cfg) {
        this.cfg = cfg;
        this.bundleHash = cfg.bundleHash();
    }

    public Outcome evaluate(ResponseCapture.Closed c, ModelFamily family, EventDataset priorHoldout, double priorU0,
                            ControllerSnapshot controller, long nowMs, String purpose, String analysisRunId, int contextRevision) {
        G12Result g = G12Result.empty(c.event.loopId, c.event.pathId);
        g.eventId = c.event.eventId;
        g.windowStartMs = (long) c.data.t0 * 1000L;
        g.windowEndMs = (long) c.data.tEnd * 1000L;
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
        ResponseMetricCalculator.Settings ms = metricSettings();
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
            est = estimator.estimate(c.data, c.u0, family, estimatorSettings());
            long took = System.currentTimeMillis() - started;
            d.outputs.put("method_id", estimator.methodId());
            d.outputs.put("method_version", estimator.methodVersion());
            d.outputs.put("fit_ms", took);
            if (took > cfg.fitBudgetMs) {
                est = EstimationResult.none(EstimationResult.State.NOT_ESTIMATED, "BUDGET_EXCEEDED");
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

        // E - validation on the PRIOR event (independent support); this event becomes the next holdout
        G12Result.Subgate e = g.subgates.get("E");
        ModelValidator.Report report = null;
        boolean validated = false;
        if (est != null && est.best() != null && priorHoldout != null) {
            EstimationResult.Candidate best = est.best();
            report = ModelValidator.validate(best.model, best.y0, best.v0, priorHoldout, priorU0, cfg.noiseFloorEu, cfg.maxGapS);
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

        // G - governance state; H - advisory (never without a validated model + approved lambda: Phase 3 supplies lambda)
        g.subgates.get("G").state = "EVALUATED";
        g.subgates.get("G").outputs.put("model_state", g.modelState);
        g.subgates.get("H").state = validated ? "WAITING" : "NOT_EVALUATED";
        g.subgates.get("H").outputs.put("reason", validated ? "LAMBDA_NOT_APPROVED" : "MODEL_NOT_VALIDATED");
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
        // y_predict is the model's free-run on the INDEPENDENT holdout (report != null); the fit on the
        // training event is y_fit. Prediction bands need a noise model - none installed yet (null).
        double[] yPredict = null;
        if (report != null && priorHoldout != null && est != null && est.best() != null) {
            yPredict = ZohSimulator.simulate(est.best().model, priorHoldout.t, priorHoldout.u, priorU0, est.best().y0, est.best().v0, priorHoldout.t0, cfg.maxGapS).yHat;
        }
        List<EvidenceArtifact> artifacts = ResponseEvidenceWriter.artifacts(g.methodRunId, c.event, c.data, fit,
                null, null, null, y0, c.r1, times, residuals, resAcf, est, freq, rejections);
        if (yPredict != null) {
            artifacts.add(EvidenceArtifact.series(g.methodRunId, "G12", "y_predict", c.event.pathId, "time", "s", "pv_predict_holdout", "PV_EU",
                    priorHoldout.t, yPredict, priorHoldout.valid));
        }
        EventDataset holdout = !censored && c.uAppliedAvailable ? c.data : null;
        return new Outcome(g, artifacts, holdout, c.u0);
    }

    private ResponseMetricCalculator.Settings metricSettings() {
        ResponseMetricCalculator.Settings s = new ResponseMetricCalculator.Settings();
        s.preSupportS = cfg.preSupportS;
        s.tailDwellS = cfg.tailDwellS;
        s.stableBandEu = cfg.stableBandEu;
        s.absSettlingBandEu = cfg.absSettlingBandEu;
        s.relSettlingBand = cfg.relSettlingBand;
        s.noiseFloorEu = cfg.noiseFloorEu;
        s.crossingDwellS = cfg.crossingDwellS;
        s.maxGapS = cfg.maxGapS;
        s.minResponseEu = cfg.minResponseEu;
        s.targetBandEu = cfg.targetBandEu;
        return s;
    }

    private EstimatorSettings estimatorSettings() {
        EstimatorSettings s = new EstimatorSettings();
        s.delayGridS = cfg.delayGridS;
        s.thetaMaxS = cfg.thetaMaxS;
        s.tauMaxS = cfg.tauMaxS;
        s.maxBridgeS = cfg.maxGapS;
        s.minInputEu = cfg.stepMinInputEu;
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
