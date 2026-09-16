package com.ams.flink.cplm.response.estimation;

import com.ams.flink.cplm.response.model.ProcessModel;

import java.io.Serializable;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/** What an estimator returns: candidates with diagnostics, or a legitimate non-result (spec §2.7 "emit what is supported"). */
public final class EstimationResult implements Serializable {
    private static final long serialVersionUID = 1L;

    public enum State { ESTIMATED, NOT_ESTIMATED, NO_EXCITATION, AMBIGUOUS_MODELS, UNSUPPORTED }

    public static final class Candidate implements Serializable {
        private static final long serialVersionUID = 1L;
        public final ProcessModel model;
        public final double y0, v0, objective;
        public final int samples;
        public final Map<String, Double> stdErr;
        public final boolean boundsHit, flatDelay, signUncertain;
        public final double conditionNumber, thetaUncertaintyS;
        public final double[] delayProfileS, delayObjective;

        public Candidate(ProcessModel model, double y0, double v0, double objective, int samples, Map<String, Double> stdErr,
                         boolean boundsHit, boolean flatDelay, boolean signUncertain, double conditionNumber, double thetaUncertaintyS,
                         double[] delayProfileS, double[] delayObjective) {
            this.model = model;
            this.y0 = y0;
            this.v0 = v0;
            this.objective = objective;
            this.samples = samples;
            this.stdErr = stdErr;
            this.boundsHit = boundsHit;
            this.flatDelay = flatDelay;
            this.signUncertain = signUncertain;
            this.conditionNumber = conditionNumber;
            this.thetaUncertaintyS = thetaUncertaintyS;
            this.delayProfileS = delayProfileS;
            this.delayObjective = delayObjective;
        }
    }

    public final State state;
    public final String reason;
    public final List<Candidate> candidates;

    public EstimationResult(State state, String reason, List<Candidate> candidates) {
        this.state = state;
        this.reason = reason == null ? "" : reason;
        this.candidates = Collections.unmodifiableList(candidates);
    }

    public static EstimationResult none(State state, String reason) {
        return new EstimationResult(state, reason, Collections.emptyList());
    }

    /** Lowest objective first. */
    public Candidate best() { return candidates.isEmpty() ? null : candidates.get(0); }
}
