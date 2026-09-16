# v2.5 Phase 2A (part 2) — Estimators, validation and uncertainty, controller/frequency outputs, the G12 result and its evidence

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan expands master-plan tasks 2A.4–2A.6 and builds on part 1 (`…-phase-2a-response-kernel.md`: `ProcessModel`, `Quantity`, `ZohSimulator`, `EventDataset`, `ResponseMetricCalculator`, `ResponseEvent`).

**Goal:** Bounded weighted output-error estimation with a delay profile and fractional-delay simulation (§2.7), an integrating adapter that never reports a static gain, a qualified closed-loop prediction-error adapter that abstains without excitation, validation by whole-event holdout with free-run AND one-step errors (§2.8), parameter intervals by a named method, controller-form adapters and model-domain frequency outputs that are UNAVAILABLE when the path is not fully specified (§2.9), a named SIMC advisory, and the `G12Result` with every one of the 52 catalogue quantities plus the evidence artifacts of §2.10.

**Architecture:** `com.ams.flink.cplm.response.{estimation,validation,controller,evidence}` + `response/G12Result.java`. Pure Java; commons-math3 3.6.1 `LevenbergMarquardtOptimizer` over an unconstrained vector `z` mapped to bounded parameters by a logistic transform (LM has no bounds), central-difference Jacobians, `Optimum.getCovariances` for the covariance. Every simulation goes through part 1's `ZohSimulator` (identical kernel in streaming and bounded execution).

**Tech Stack:** as part 1. Tests: JUnit 4 with seeded `java.util.Random` (deterministic noise).

**Spec:** §2.6–2.11; quantities `xlsx_Response_quantities.tsv` (52 ids); acceptance NR-001…NR-006, NR-010…NR-014.

## Global Constraints

- Never an endpoint-ratio estimate on closed-loop routine data (§2.7): `ClosedLoopPemEstimator` or abstain (`NO_EXCITATION`, `AMBIGUOUS_MODELS`).
- Include both gain signs when the sign is not established; flag near-zero gain, uncertain sign, bounds hit, flat delay (§2.6).
- `theta` uncertainty can never be smaller than half the signal time resolution when the objective is flat across it (NR-010).
- Holdout = whole events / contiguous time, both sets qualified; report free-run and one-step separately; a flexible predictor with a wrong plant fails free-run (§2.8, NR-011).
- Unknown controller form ⇒ no Kc conversion, no margins, no tuning claim (§2.9, NR-014). SIMC only on VALIDATED model + known controller + approved λ; advisory only.
- Metric record shape everywhere: `{quantity_id, value|null, unit, path_id, uncertainty|null, method, support, config_hash, reason_if_null}` (§2.10).

---

## File structure

| File | Responsibility |
|---|---|
| `response/estimation/EstimatorSettings.java` | bounds, delay grid, iterations, tolerances, weights, excitation thresholds |
| `response/estimation/EstimationResult.java` | candidates (model + nuisance + objective + diagnostics), state, reason |
| `response/estimation/ModelEstimator.java` | interface: `estimate(EventDataset, u0, family, settings)` |
| `response/estimation/BoundedLm.java` | logistic-bounded LM fit of a residual function; covariance, condition, bounds-hit |
| `response/estimation/OutputErrorEstimator.java` | delay-profile OE fit for all five families (integrating ones with `v0`) |
| `response/estimation/IntegratingEstimator.java` | slope-change seed on the delayed input, then the OE refinement; never a static Kp |
| `response/estimation/ClosedLoopPemEstimator.java` | ARMAX(n,n,1) innovation PEM over orders {1,2} × delay grid; excitation rank; stable/invertible; continuous conversion |
| `response/estimation/EstimatorRegistry.java` | legality table family × path × estimator |
| `response/validation/ModelValidator.java` | holdout free-run / one-step RMSE, fit improvement, bias, Ljung-Box whiteness, residual–input correlation (positive lags), AICc, verdict |
| `response/validation/UncertaintyEstimator.java` | COVARIANCE, PROFILE_LIKELIHOOD (delay), BLOCK_BOOTSTRAP (seeded) intervals |
| `response/controller/ControllerSnapshot.java`, `ControllerFormAdapter.java` | native settings as metadata; parallel↔ideal only |
| `response/controller/FrequencyResponse.java` | L, S, T on a log grid; crossings, GM/PM, peaks, bandwidth; UNAVAILABLE reasons |
| `response/controller/SimcAdvisor.java` | `SIMC_2003_CORRECTED` advisory {Kc, Ti, Td} |
| `response/G12Result.java` | the method result (subgates A–H, states, 52 quantities, identity) + JSON |
| `response/evidence/ResponseEvidenceWriter.java` | the §2.10 artifacts through `EvidenceArtifact.series` |

---

### Task 2A.4: Estimators

**Files:** create the eight `response/estimation/*.java` above; tests `test/.../response/estimation/{OutputErrorEstimatorTest,IntegratingEstimatorTest,ClosedLoopPemEstimatorTest}.java`.

**Interfaces (produces):**
```java
public final class EstimatorSettings { public double gainAbsMax=1e3, tauMinS=0.5, tauMaxS=7200, thetaMinS=0, thetaMaxS=600, delayGridS=5, wnMinRadS=1e-4, wnMaxRadS=10, zetaMin=0.02, zetaMax=0.98;
  public int maxIterations=200, maxEvaluations=4000; public double relTol=1e-9, flatTolerance=0.05, maxBridgeS=60, minInputEu=0.5, minInputEnergy=1.0, boundsHitFraction=0.01, illConditioned=1e6, ambiguityTolerance=0.05; public boolean includeBothSigns=true; public double[] weights; public long seed=1; }
public interface ModelEstimator { EstimationResult estimate(EventDataset d, double u0, ModelFamily family, EstimatorSettings s); Set<ModelFamily> supportedFamilies(); String methodId(); String methodVersion(); }
public final class EstimationResult { public enum State { ESTIMATED, NOT_ESTIMATED, NO_EXCITATION, AMBIGUOUS_MODELS, UNSUPPORTED }
  public static final class Candidate { public final ProcessModel model; public final double y0, v0, objective; public final int samples; public final Map<String, Double> stdErr; public final boolean boundsHit, flatDelay, signUncertain; public final double conditionNumber, thetaUncertaintyS; public final double[] delayProfileS, delayObjective; }
  public final State state; public final String reason; public final List<Candidate> candidates; public Candidate best(); }
public final class BoundedLm { public interface Residuals { double[] at(double[] p); } public static final class Fit { public final double[] p, stdErr; public final double objective, conditionNumber; public final boolean boundsHit, converged; }
  public static Fit fit(Residuals f, double[] p0, double[] lo, double[] hi, int maxIter, int maxEval, double boundsHitFraction, double illConditioned); }
public final class ClosedLoopPemEstimator implements ModelEstimator { /* estimate(d, u0, family, s) uses d.r (reference) for excitation */ }
public final class EstimatorRegistry { public static ModelEstimator forPath(InputPathResolver.Path path, EventType type, ModelFamily family); /* null + reason via legality(...) */ public static String legality(InputPathResolver.Path path, EventType type, ModelFamily family); }
```

- [ ] **Step 1: Write the failing tests**

`OutputErrorEstimatorTest.java`:
```java
package com.ams.flink.cplm.response.estimation;

import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ModelFamily;
import com.ams.flink.cplm.response.model.ProcessModel;
import com.ams.flink.cplm.response.simulation.ZohSimulator;
import org.junit.Test;

import java.util.Random;

import static org.junit.Assert.*;

public class OutputErrorEstimatorTest {
    /** §2.11 FOPDT step 40->45 pp with Gaussian noise sigma = 0.2 t/h, 5 s grid, 20 s of pre-support. */
    static EventDataset synthetic(ProcessModel truth, double noiseSigma, long seed, double dt, double end, double du) {
        int n = (int) Math.round((end + 20) / dt) + 1;
        double[] t = new double[n], u = new double[n];
        for (int i = 0; i < n; i++) { t[i] = -20 + i * dt; u[i] = t[i] < 0 ? 40 : 40 + du; }
        ZohSimulator.Result sim = ZohSimulator.simulate(truth, t, u, 40, 100, 0, 0, 60);
        Random rnd = new Random(seed);
        double[] y = new double[n], r = new double[n];
        boolean[] v = new boolean[n];
        for (int i = 0; i < n; i++) { y[i] = sim.yHat[i] + noiseSigma * rnd.nextGaussian(); r[i] = 100; v[i] = true; }
        return new EventDataset(t, y, r, u, v, 0, end);
    }

    static EstimatorSettings settings() { EstimatorSettings s = new EstimatorSettings(); s.delayGridS = 5; s.thetaMaxS = 60; s.tauMaxS = 600; return s; }

    @Test
    public void recoversTheSpecFopdtUnderNoise() {                             // NR-001
        ProcessModel truth = ProcessModel.fopdt("OP_TO_PV", 3.0, 4.0, 20.0);
        EstimationResult r = new OutputErrorEstimator().estimate(synthetic(truth, 0.2, 11, 5, 200, 5), 40, ModelFamily.FOPDT, settings());
        assertEquals(EstimationResult.State.ESTIMATED, r.state);
        ProcessModel m = r.best().model;
        assertEquals(3.0, m.gain, 0.02);
        assertEquals(4.0, m.theta, 0.2);
        assertEquals(20.0, m.tau, 0.5);
        assertFalse(r.best().boundsHit);
        assertTrue(r.best().stdErr.get("process_gain") < 0.05);
        assertEquals("OE_LM_DELAY_PROFILE", new OutputErrorEstimator().methodId());
    }

    @Test
    public void negativeGainIsRecoveredSigned() {                              // NR-002
        ProcessModel truth = ProcessModel.fopdt("OP_TO_PV", -3.0, 4.0, 20.0);
        EstimationResult r = new OutputErrorEstimator().estimate(synthetic(truth, 0.2, 5, 5, 200, 5), 40, ModelFamily.FOPDT, settings());
        assertEquals(-3.0, r.best().model.gain, 0.02);
        assertFalse(r.best().signUncertain);
    }

    @Test
    public void subGridDelayIsFlatAndUncertainNotFalselyPrecise() {           // NR-010
        ProcessModel truth = ProcessModel.fopdt("OP_TO_PV", 3.0, 0.5, 20.0);
        EstimationResult r = new OutputErrorEstimator().estimate(synthetic(truth, 0.2, 3, 5, 200, 5), 40, ModelFamily.FOPDT, settings());
        assertTrue(r.best().flatDelay);
        assertTrue("theta uncertainty must be at least half the grid", r.best().thetaUncertaintyS >= 2.5);
    }

    @Test
    public void repeatedPolesEstimateToFiniteValues() {                        // NR-013
        ProcessModel truth = ProcessModel.sopdt("OP_TO_PV", 2.0, 5.0, 10.0, 10.0);
        EstimationResult r = new OutputErrorEstimator().estimate(synthetic(truth, 0.05, 2, 2, 200, 5), 40, ModelFamily.SOPDT, settings());
        assertEquals(EstimationResult.State.ESTIMATED, r.state);
        assertTrue(Double.isFinite(r.best().model.tau) && Double.isFinite(r.best().model.tau2));
        assertEquals(2.0, r.best().model.gain, 0.05);
        assertEquals(20.0, r.best().model.tau + r.best().model.tau2, 1.5);     // the sum is well identified; the split is not
    }

    @Test
    public void noExcitationIsNotAModel() {                                    // NR-006
        ProcessModel truth = ProcessModel.fopdt("OP_TO_PV", 3.0, 4.0, 20.0);
        EstimationResult r = new OutputErrorEstimator().estimate(synthetic(truth, 0.2, 9, 5, 200, 0.0), 40, ModelFamily.FOPDT, settings());
        assertEquals(EstimationResult.State.NO_EXCITATION, r.state);
        assertTrue(r.candidates.isEmpty());
    }
}
```

`IntegratingEstimatorTest.java`:
```java
package com.ams.flink.cplm.response.estimation;

import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ModelFamily;
import com.ams.flink.cplm.response.model.ProcessModel;
import com.ams.flink.cplm.response.model.Quantity;
import com.ams.flink.cplm.response.simulation.ZohSimulator;
import org.junit.Test;

import java.util.Random;

import static org.junit.Assert.*;

public class IntegratingEstimatorTest {
    @Test
    public void recoversTheSlopeGainAndReportsNoStaticGain() {                  // NR-003, §2.11 LIC
        double ki = 0.010 / 60.0, v0 = 0.010 / 60.0;
        ProcessModel truth = ProcessModel.ipdt("OP_TO_PV", ki, 12.0);
        int n = 241; double[] t = new double[n], u = new double[n];
        for (int i = 0; i < n; i++) { t[i] = -60 + i; u[i] = t[i] < 0 ? 50 : 52; }
        ZohSimulator.Result sim = ZohSimulator.simulate(truth, t, u, 50, 1.0, v0, 0, 60);
        Random rnd = new Random(4);
        double[] y = new double[n], r = new double[n]; boolean[] v = new boolean[n];
        for (int i = 0; i < n; i++) { y[i] = sim.yHat[i] + 0.0005 * rnd.nextGaussian(); r[i] = 1; v[i] = true; }
        EstimatorSettings s = new EstimatorSettings(); s.delayGridS = 1; s.thetaMaxS = 40;
        EstimationResult res = new IntegratingEstimator().estimate(new EventDataset(t, y, r, u, v, 0, 180), 50, ModelFamily.IPDT, s);
        assertEquals(EstimationResult.State.ESTIMATED, res.state);
        assertEquals(ki, res.best().model.gain, ki * 0.05);
        assertEquals(12.0, res.best().model.theta, 1.5);
        assertEquals(v0, res.best().v0, v0 * 0.1);
        Quantity kp = res.best().model.parameters().get("process_gain");
        assertFalse(kp.available());
        assertEquals("INTEGRATING_OR_NOT_IDENTIFIABLE", kp.reasonIfNull);
    }
}
```

`ClosedLoopPemEstimatorTest.java`:
```java
package com.ams.flink.cplm.response.estimation;

import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ModelFamily;
import com.ams.flink.cplm.response.model.ProcessModel;
import com.ams.flink.cplm.response.simulation.StateSpace;
import org.apache.commons.math3.linear.ArrayRealVector;
import org.apache.commons.math3.linear.RealVector;
import org.junit.Test;

import java.util.Random;

import static org.junit.Assert.*;

public class ClosedLoopPemEstimatorTest {
    /** Discrete closed loop: FOPDT plant (Kp=2, theta=10 s, tau=30 s) under a PI controller at Ts = 5 s, output noise sigma. */
    static EventDataset closedLoop(double spStep, double sigma, long seed, int steps) {
        double ts = 5.0, kc = 0.4, ti = 40.0;
        ProcessModel plant = ProcessModel.fopdt("OP_TO_PV", 2.0, 10.0, 30.0);
        StateSpace ss = StateSpace.of(plant);
        StateSpace.Discrete d = ss.discretize(ts);
        int delaySteps = 2;                                             // theta = 10 s = 2 samples
        double[] t = new double[steps], y = new double[steps], r = new double[steps], u = new double[steps];
        boolean[] v = new boolean[steps];
        RealVector x = new ArrayRealVector(1);
        double integral = 0, uPrev = 50; Random rnd = new Random(seed);
        double[] uHist = new double[steps];
        for (int k = 0; k < steps; k++) {
            t[k] = k * ts;
            r[k] = k * ts < 300 ? 50 : 50 + spStep;
            double ySim = 50 + ss.c.operate(x).getEntry(0);
            y[k] = ySim + sigma * rnd.nextGaussian();
            double e = r[k] - y[k];
            integral += e * ts / ti;
            u[k] = 50 + kc * (e + integral);
            uHist[k] = u[k];
            double uDelayed = k - delaySteps >= 0 ? uHist[k - delaySteps] : 50;
            x = d.ad.operate(x).add(d.bd.getColumnVector(0).mapMultiply(uDelayed - 50));
            v[k] = true;
        }
        return new EventDataset(t, y, r, u, v, 0, (steps - 1) * ts);
    }

    @Test
    public void steadyReferenceRoutineNoiseAbstains() {                          // NR-005
        EstimationResult res = new ClosedLoopPemEstimator().estimate(closedLoop(0.0, 0.3, 1, 400), 50, ModelFamily.FOPDT, new EstimatorSettings());
        assertEquals(EstimationResult.State.NO_EXCITATION, res.state);
        assertTrue(res.candidates.isEmpty());
        assertTrue(res.reason.contains("REFERENCE"));
    }

    @Test
    public void aReferenceStepUnderFeedbackYieldsACandidateWithNoiseModel() {     // NR-004 shape, direct PEM
        EstimatorSettings s = new EstimatorSettings(); s.delayGridS = 5; s.thetaMaxS = 30;
        EstimationResult res = new ClosedLoopPemEstimator().estimate(closedLoop(10.0, 0.2, 2, 400), 50, ModelFamily.FOPDT, s);
        assertEquals(EstimationResult.State.ESTIMATED, res.state);
        ProcessModel m = res.best().model;
        assertEquals(2.0, m.gain, 0.3);
        assertEquals(30.0, m.tau, 8.0);
        assertEquals(10.0, m.theta, 5.0);
        assertEquals("PEM_ARMAX_INNOVATION", new ClosedLoopPemEstimator().methodId());
    }

    @Test
    public void theRegistryRefusesEndpointRatiosOnClosedLoopData() {
        assertEquals("PEM_REQUIRED_FOR_CLOSED_LOOP", EstimatorRegistry.legality(com.ams.flink.cplm.response.event.InputPathResolver.Path.OP_TO_PV, com.ams.flink.cplm.response.event.EventType.ROUTINE_IDENTIFICATION, ModelFamily.FOPDT));
        assertTrue(EstimatorRegistry.forPath(com.ams.flink.cplm.response.event.InputPathResolver.Path.EXOGENOUS_TEST, com.ams.flink.cplm.response.event.EventType.INPUT_TEST, ModelFamily.IPDT) instanceof IntegratingEstimator);
        assertNull(EstimatorRegistry.forPath(com.ams.flink.cplm.response.event.InputPathResolver.Path.SLAVE_SP_TO_PV, com.ams.flink.cplm.response.event.EventType.INPUT_TEST, ModelFamily.FOPDT));
        assertEquals("UNSUPPORTED_MODEL_FAMILY", EstimatorRegistry.legality(com.ams.flink.cplm.response.event.InputPathResolver.Path.EXOGENOUS_TEST, com.ams.flink.cplm.response.event.EventType.INPUT_TEST, ModelFamily.UNSUPPORTED_INVERSE));
    }
}
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**

`EstimatorSettings.java`:
```java
package com.ams.flink.cplm.response.estimation;

import java.io.Serializable;

/** Bounds, grids and tolerances of the fitters (spec §2.7: all declared, versioned with the method). */
public final class EstimatorSettings implements Serializable {
    private static final long serialVersionUID = 1L;
    public double gainAbsMax = 1e3, tauMinS = 0.5, tauMaxS = 7200, thetaMinS = 0, thetaMaxS = 600, delayGridS = 5;
    public double wnMinRadS = 1e-4, wnMaxRadS = 10, zetaMin = 0.02, zetaMax = 0.98;
    public int maxIterations = 200, maxEvaluations = 4000;
    public double relTol = 1e-9, flatTolerance = 0.05, maxBridgeS = 60, minInputEu = 0.5, minInputEnergy = 1.0;
    public double boundsHitFraction = 0.01, illConditioned = 1e6, ambiguityTolerance = 0.05;
    public boolean includeBothSigns = true;
    /** Optional per-sample weights (length = samples); null = uniform. */
    public double[] weights;
    public long seed = 1;
}
```

`EstimationResult.java`:
```java
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
            this.model = model; this.y0 = y0; this.v0 = v0; this.objective = objective; this.samples = samples; this.stdErr = stdErr;
            this.boundsHit = boundsHit; this.flatDelay = flatDelay; this.signUncertain = signUncertain; this.conditionNumber = conditionNumber;
            this.thetaUncertaintyS = thetaUncertaintyS; this.delayProfileS = delayProfileS; this.delayObjective = delayObjective;
        }
    }

    public final State state;
    public final String reason;
    public final List<Candidate> candidates;

    public EstimationResult(State state, String reason, List<Candidate> candidates) {
        this.state = state; this.reason = reason == null ? "" : reason; this.candidates = Collections.unmodifiableList(candidates);
    }

    public static EstimationResult none(State state, String reason) { return new EstimationResult(state, reason, Collections.emptyList()); }

    /** Lowest objective first. */
    public Candidate best() { return candidates.isEmpty() ? null : candidates.get(0); }
}
```

`ModelEstimator.java`:
```java
package com.ams.flink.cplm.response.estimation;

import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ModelFamily;

import java.util.Set;

public interface ModelEstimator {
    EstimationResult estimate(EventDataset d, double u0, ModelFamily family, EstimatorSettings s);
    Set<ModelFamily> supportedFamilies();
    String methodId();
    String methodVersion();
}
```

`BoundedLm.java`:
```java
package com.ams.flink.cplm.response.estimation;

import org.apache.commons.math3.analysis.MultivariateMatrixFunction;
import org.apache.commons.math3.analysis.MultivariateVectorFunction;
import org.apache.commons.math3.fitting.leastsquares.LeastSquaresBuilder;
import org.apache.commons.math3.fitting.leastsquares.LeastSquaresOptimizer;
import org.apache.commons.math3.fitting.leastsquares.LevenbergMarquardtOptimizer;
import org.apache.commons.math3.linear.RealMatrix;
import org.apache.commons.math3.linear.SingularValueDecomposition;

/**
 * Levenberg–Marquardt over an unconstrained vector z mapped to bounded parameters
 * p = lo + (hi - lo) * sigmoid(z) (commons-math3's LM has no bounds). Central-difference Jacobian.
 * Reports the objective sum(r^2), parameter standard errors from the covariance at the optimum
 * (chain rule through the transform), the Jacobian condition number and whether a bound is hit.
 */
public final class BoundedLm {
    public interface Residuals { double[] at(double[] p); }

    public static final class Fit {
        public final double[] p, stdErr;
        public final double objective, conditionNumber;
        public final boolean boundsHit, converged;
        Fit(double[] p, double[] stdErr, double objective, double conditionNumber, boolean boundsHit, boolean converged) {
            this.p = p; this.stdErr = stdErr; this.objective = objective; this.conditionNumber = conditionNumber; this.boundsHit = boundsHit; this.converged = converged;
        }
    }

    private BoundedLm() {}

    static double toZ(double p, double lo, double hi) {
        double f = Math.min(Math.max((p - lo) / (hi - lo), 1e-6), 1 - 1e-6);
        return Math.log(f / (1 - f));
    }

    static double toP(double z, double lo, double hi) { return lo + (hi - lo) / (1 + Math.exp(-z)); }

    public static Fit fit(Residuals f, double[] p0, double[] lo, double[] hi, int maxIter, int maxEval, double boundsHitFraction, double illConditioned) {
        int n = p0.length;
        double[] z0 = new double[n];
        for (int i = 0; i < n; i++) z0[i] = toZ(p0[i], lo[i], hi[i]);
        MultivariateVectorFunction value = z -> f.at(unmap(z, lo, hi));
        MultivariateMatrixFunction jac = z -> {
            double[] base = value.value(z);
            double[][] j = new double[base.length][n];
            for (int k = 0; k < n; k++) {
                double h = 1e-4 * Math.max(1, Math.abs(z[k]));
                double[] zp = z.clone(), zm = z.clone();
                zp[k] += h; zm[k] -= h;
                double[] rp = value.value(zp), rm = value.value(zm);
                for (int i = 0; i < base.length; i++) j[i][k] = (rp[i] - rm[i]) / (2 * h);
            }
            return j;
        };
        int m = f.at(p0).length;
        double[] target = new double[m];                       // residuals are already (y - yhat): target 0
        LeastSquaresOptimizer.Optimum opt;
        boolean converged = true;
        try {
            opt = new LevenbergMarquardtOptimizer().optimize(new LeastSquaresBuilder()
                    .start(z0).model(value, jac).target(target).lazyEvaluation(false)
                    .maxEvaluations(maxEval).maxIterations(maxIter).build());
        } catch (RuntimeException e) {
            converged = false;
            double[] r = f.at(p0);
            double obj = 0; for (double v : r) obj += v * v;
            return new Fit(p0.clone(), nan(n), obj, Double.POSITIVE_INFINITY, false, false);
        }
        double[] z = opt.getPoint().toArray();
        double[] p = unmap(z, lo, hi);
        double[] r = f.at(p);
        double obj = 0; for (double v : r) obj += v * v;
        double[] se = nan(n);
        double cond = Double.POSITIVE_INFINITY;
        try {
            RealMatrix j = opt.getJacobian();
            SingularValueDecomposition svd = new SingularValueDecomposition(j);
            double[] sv = svd.getSingularValues();
            cond = sv[sv.length - 1] > 0 ? sv[0] / sv[sv.length - 1] : Double.POSITIVE_INFINITY;
            RealMatrix cov = opt.getCovariances(1e-14);
            double sigma2 = m > n ? obj / (m - n) : obj;
            for (int i = 0; i < n; i++) {
                double dpdz = (hi[i] - lo[i]) * sig(z[i]) * (1 - sig(z[i]));
                se[i] = Math.sqrt(Math.max(0, cov.getEntry(i, i) * sigma2)) * dpdz;
            }
        } catch (RuntimeException ignored) {
            // singular Jacobian: standard errors stay NaN, condition stays infinite
        }
        boolean hit = false;
        for (int i = 0; i < n; i++) {
            double frac = (p[i] - lo[i]) / (hi[i] - lo[i]);
            if (frac < boundsHitFraction || frac > 1 - boundsHitFraction) hit = true;
        }
        return new Fit(p, se, obj, cond, hit, converged && cond < illConditioned);
    }

    private static double sig(double z) { return 1 / (1 + Math.exp(-z)); }

    private static double[] unmap(double[] z, double[] lo, double[] hi) {
        double[] p = new double[z.length];
        for (int i = 0; i < z.length; i++) p[i] = toP(z[i], lo[i], hi[i]);
        return p;
    }

    private static double[] nan(int n) { double[] a = new double[n]; java.util.Arrays.fill(a, Double.NaN); return a; }
}
```

`OutputErrorEstimator.java`:
```java
package com.ams.flink.cplm.response.estimation;

import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ModelFamily;
import com.ams.flink.cplm.response.model.ProcessModel;
import com.ams.flink.cplm.response.simulation.ZohSimulator;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Bounded weighted output-error fitting (spec §2.7): J = sum w_i (y_i - yhat_i(p))^2 with the exact
 * ZOH simulation; a profile of delays on the signal-time grid, the other parameters optimised per
 * delay seed, then the delay refined; both gain signs when the sign is not established; objective
 * versus delay and identifiability diagnostics retained. Requires an applied-input excitation.
 */
public final class OutputErrorEstimator implements ModelEstimator {
    public static final String METHOD_ID = "OE_LM_DELAY_PROFILE";
    public static final String METHOD_VERSION = "1.0.0";

    @Override public Set<ModelFamily> supportedFamilies() { return EnumSet.of(ModelFamily.FOPDT, ModelFamily.SOPDT, ModelFamily.SO_UNDERDAMPED, ModelFamily.IPDT, ModelFamily.INTEGRATOR_LAG); }
    @Override public String methodId() { return METHOD_ID; }
    @Override public String methodVersion() { return METHOD_VERSION; }

    @Override
    public EstimationResult estimate(EventDataset d, double u0, ModelFamily family, EstimatorSettings s) {
        if (!supportedFamilies().contains(family)) return EstimationResult.none(EstimationResult.State.UNSUPPORTED, "UNSUPPORTED_MODEL_FAMILY");
        Support sup = Support.of(d, u0, s);
        if (sup.n < 8) return EstimationResult.none(EstimationResult.State.NOT_ESTIMATED, "INSUFFICIENT_SUPPORT");
        if (sup.inputRange < s.minInputEu || sup.inputEnergy < s.minInputEnergy) return EstimationResult.none(EstimationResult.State.NO_EXCITATION, "NO_INPUT_EXCITATION");

        double gainSeed = seedGain(sup, family);
        List<Double> signs = new ArrayList<>();
        signs.add(1.0);
        if (s.includeBothSigns) signs.add(-1.0);
        List<Double> thetas = new ArrayList<>();
        for (double th = s.thetaMinS; th <= s.thetaMaxS + 1e-9; th += s.delayGridS) thetas.add(th);

        Trial best = null;
        double[] profile = new double[thetas.size()], objective = new double[thetas.size()];
        Map<Double, Trial> bestPerSign = new LinkedHashMap<>();
        for (int k = 0; k < thetas.size(); k++) {
            double theta = thetas.get(k);
            Trial bestAtTheta = null;
            for (double sign : signs) {
                Trial t = fitAtDelay(sup, family, theta, sign * Math.abs(gainSeed), s);
                if (t != null && (bestAtTheta == null || t.fit.objective < bestAtTheta.fit.objective)) bestAtTheta = t;
                if (t != null) {
                    Trial prev = bestPerSign.get(sign);
                    if (prev == null || t.fit.objective < prev.fit.objective) bestPerSign.put(sign, t);
                }
            }
            profile[k] = theta;
            objective[k] = bestAtTheta == null ? Double.NaN : bestAtTheta.fit.objective;
            if (bestAtTheta != null && (best == null || bestAtTheta.fit.objective < best.fit.objective)) best = bestAtTheta;
        }
        if (best == null) return EstimationResult.none(EstimationResult.State.NOT_ESTIMATED, "FIT_FAILED");

        // refine the delay continuously around the best grid seed (golden section, LM inside)
        double lo = Math.max(s.thetaMinS, best.theta - s.delayGridS), hi = Math.min(s.thetaMaxS, best.theta + s.delayGridS);
        double sign = Math.signum(best.gain());
        best = refineDelay(sup, family, lo, hi, sign * Math.abs(gainSeed), s, best);

        // flat delay: the objective within flatTolerance of the minimum over a range wider than two grid steps
        double jmin = Double.POSITIVE_INFINITY;
        for (double v : objective) if (!Double.isNaN(v)) jmin = Math.min(jmin, v);
        double flatLo = Double.POSITIVE_INFINITY, flatHi = Double.NEGATIVE_INFINITY;
        for (int k = 0; k < profile.length; k++) if (!Double.isNaN(objective[k]) && objective[k] <= jmin * (1 + s.flatTolerance)) { flatLo = Math.min(flatLo, profile[k]); flatHi = Math.max(flatHi, profile[k]); }
        boolean flat = flatHi - flatLo > 2 * s.delayGridS || best.theta < s.delayGridS;
        double thetaUnc = Math.max(0.5 * s.delayGridS, 0.5 * (flatHi - flatLo));

        boolean signUncertain = false;
        if (bestPerSign.size() == 2) {
            double a = bestPerSign.get(1.0).fit.objective, b = bestPerSign.get(-1.0).fit.objective;
            signUncertain = Math.abs(a - b) <= s.ambiguityTolerance * Math.max(a, b);
        }
        Map<String, Double> se = new LinkedHashMap<>();
        String[] names = paramNames(family);
        for (int i = 0; i < names.length; i++) se.put(names[i], best.fit.stdErr[i]);
        EstimationResult.Candidate c = new EstimationResult.Candidate(best.model(family), best.y0(), best.v0(), best.fit.objective, sup.n, se,
                best.fit.boundsHit, flat, signUncertain, best.fit.conditionNumber, thetaUnc, profile, objective);
        List<EstimationResult.Candidate> list = new ArrayList<>();
        list.add(c);
        return new EstimationResult(EstimationResult.State.ESTIMATED, signUncertain ? "SIGN_UNCERTAIN" : "", list);
    }

    // ---- internals -------------------------------------------------------------------------

    /** The valid support of the event and the excitation facts. */
    static final class Support {
        final double[] t, y, u, w;
        final int n;
        final double u0, t0, span, inputRange, inputEnergy, yFirst, vGuess, maxBridgeS, duration;

        private Support(double[] t, double[] y, double[] u, double[] w, double u0, double t0, double maxBridgeS) {
            this.t = t; this.y = y; this.u = u; this.w = w; this.n = t.length; this.u0 = u0; this.t0 = t0; this.maxBridgeS = maxBridgeS;
            double ymin = Double.POSITIVE_INFINITY, ymax = Double.NEGATIVE_INFINITY, umax = 0, energy = 0;
            for (int i = 0; i < n; i++) { ymin = Math.min(ymin, y[i]); ymax = Math.max(ymax, y[i]); umax = Math.max(umax, Math.abs(u[i] - u0)); energy += (u[i] - u0) * (u[i] - u0); }
            this.span = Math.max(ymax - ymin, 1e-9); this.inputRange = umax; this.inputEnergy = energy;
            this.yFirst = y[0]; this.duration = Math.max(t[n - 1] - t[0], 1e-9);
            this.vGuess = (y[n - 1] - y[0]) / duration;
        }

        static Support of(EventDataset d, double u0, EstimatorSettings s) {
            List<Integer> idx = new ArrayList<>();
            for (int i = 0; i < d.size(); i++) if (d.valid[i] && Double.isFinite(d.y[i]) && Double.isFinite(d.u[i])) idx.add(i);
            double[] t = new double[idx.size()], y = new double[idx.size()], u = new double[idx.size()], w = new double[idx.size()];
            for (int k = 0; k < idx.size(); k++) { int i = idx.get(k); t[k] = d.t[i]; y[k] = d.y[i]; u[k] = d.u[i]; w[k] = s.weights == null ? 1 : s.weights[i]; }
            return new Support(t, y, u, w, u0, d.t0, s.maxBridgeS);
        }
    }

    static final class Trial {
        final double theta; final double[] p; final BoundedLm.Fit fit; final ModelFamily family; final String path;
        Trial(double theta, BoundedLm.Fit fit, ModelFamily family, String path) { this.theta = theta; this.p = fit.p; this.fit = fit; this.family = family; this.path = path; }
        double gain() { return p[0]; }
        double y0() { return p[p.length - (family.integrating() ? 2 : 1)]; }
        double v0() { return family.integrating() ? p[p.length - 1] : 0.0; }
        ProcessModel model(ModelFamily f) { return build(f, path, theta, p); }
    }

    static String[] paramNames(ModelFamily f) {
        switch (f) {
            case FOPDT: return new String[] {"process_gain", "time_constant", "baseline"};
            case SOPDT: return new String[] {"process_gain", "time_constant_1", "time_constant_2", "baseline"};
            case SO_UNDERDAMPED: return new String[] {"process_gain", "damping_ratio", "natural_frequency", "baseline"};
            case IPDT: return new String[] {"integrating_gain", "baseline", "baseline_slope"};
            default: return new String[] {"integrating_gain", "time_constant", "baseline", "baseline_slope"};
        }
    }

    static ProcessModel build(ModelFamily f, String path, double theta, double[] p) {
        switch (f) {
            case FOPDT: return ProcessModel.fopdt(path, p[0], theta, p[1]);
            case SOPDT: return ProcessModel.sopdt(path, p[0], theta, p[1], p[2]);
            case SO_UNDERDAMPED: return ProcessModel.underdamped(path, p[0], theta, p[1], p[2]);
            case IPDT: return ProcessModel.ipdt(path, p[0], theta);
            default: return ProcessModel.integratorLag(path, p[0], theta, p[1]);
        }
    }

    private static double seedGain(Support sup, ModelFamily f) {
        double du = 0;
        for (int i = 0; i < sup.n; i++) if (Math.abs(sup.u[i] - sup.u0) > Math.abs(du)) du = sup.u[i] - sup.u0;
        if (du == 0) return 1.0;
        if (f.integrating()) {
            int h = sup.n / 2;
            double vBefore = (sup.y[h] - sup.y[0]) / Math.max(sup.t[h] - sup.t[0], 1e-9);
            double vAfter = (sup.y[sup.n - 1] - sup.y[h]) / Math.max(sup.t[sup.n - 1] - sup.t[h], 1e-9);
            double ki = (vAfter - vBefore) / du;
            return ki == 0 ? 1e-3 / Math.abs(du) : ki;
        }
        return (sup.y[sup.n - 1] - sup.y[0]) / du;
    }

    private static Trial fitAtDelay(Support sup, ModelFamily f, double theta, double gainSeed, EstimatorSettings s) {
        double[] p0, lo, hi;
        double g = Math.max(Math.abs(gainSeed), 1e-6);
        double gLo = gainSeed >= 0 ? 1e-9 : -s.gainAbsMax, gHi = gainSeed >= 0 ? s.gainAbsMax : -1e-9;
        double yLo = sup.yFirst - 2 * sup.span - 1, yHi = sup.yFirst + 2 * sup.span + 1;
        double vMax = Math.max(Math.abs(sup.vGuess) * 4, sup.span / sup.duration) + 1e-9;
        switch (f) {
            case FOPDT:
                p0 = new double[] {Math.copySign(g, gainSeed), Math.max(s.tauMinS * 2, sup.duration / 5), sup.yFirst};
                lo = new double[] {gLo, s.tauMinS, yLo}; hi = new double[] {gHi, s.tauMaxS, yHi}; break;
            case SOPDT:
                p0 = new double[] {Math.copySign(g, gainSeed), sup.duration / 5, sup.duration / 10, sup.yFirst};
                lo = new double[] {gLo, s.tauMinS, s.tauMinS, yLo}; hi = new double[] {gHi, s.tauMaxS, s.tauMaxS, yHi}; break;
            case SO_UNDERDAMPED:
                p0 = new double[] {Math.copySign(g, gainSeed), 0.5, 2 * Math.PI / sup.duration * 4, sup.yFirst};
                lo = new double[] {gLo, s.zetaMin, s.wnMinRadS, yLo}; hi = new double[] {gHi, s.zetaMax, s.wnMaxRadS, yHi}; break;
            case IPDT:
                p0 = new double[] {Math.copySign(g, gainSeed), sup.yFirst, sup.vGuess};
                lo = new double[] {gLo, yLo, -vMax}; hi = new double[] {gHi, yHi, vMax}; break;
            default:
                p0 = new double[] {Math.copySign(g, gainSeed), sup.duration / 10, sup.yFirst, sup.vGuess};
                lo = new double[] {gLo, s.tauMinS, yLo, -vMax}; hi = new double[] {gHi, s.tauMaxS, yHi, vMax}; break;
        }
        final double th = theta;
        BoundedLm.Residuals res = p -> {
            ProcessModel m;
            try { m = build(f, "fit", th, p); } catch (IllegalArgumentException e) { return huge(sup.n); }
            double y0 = p[p.length - (f.integrating() ? 2 : 1)], v0 = f.integrating() ? p[p.length - 1] : 0;
            ZohSimulator.Result sim = ZohSimulator.simulate(m, sup.t, sup.u, sup.u0, y0, v0, sup.t0, sup.maxBridgeS);
            double[] r = new double[sup.n];
            for (int i = 0; i < sup.n; i++) r[i] = sim.valid[i] && Double.isFinite(sim.yHat[i]) ? Math.sqrt(sup.w[i]) * (sup.y[i] - sim.yHat[i]) : 1e3;
            return r;
        };
        BoundedLm.Fit fit = BoundedLm.fit(res, p0, lo, hi, s.maxIterations, s.maxEvaluations, s.boundsHitFraction, s.illConditioned);
        return Double.isFinite(fit.objective) ? new Trial(theta, fit, f, "fit") : null;
    }

    private static double[] huge(int n) { double[] r = new double[n]; Arrays.fill(r, 1e3); return r; }

    private static Trial refineDelay(Support sup, ModelFamily f, double lo, double hi, double gainSeed, EstimatorSettings s, Trial incumbent) {
        double gr = (Math.sqrt(5) - 1) / 2;
        double a = lo, b = hi;
        double c = b - gr * (b - a), d = a + gr * (b - a);
        Trial tc = fitAtDelay(sup, f, c, gainSeed, s), td = fitAtDelay(sup, f, d, gainSeed, s);
        Trial best = incumbent;
        for (int it = 0; it < 12 && b - a > 0.05 * s.delayGridS; it++) {
            double jc = tc == null ? Double.POSITIVE_INFINITY : tc.fit.objective, jd = td == null ? Double.POSITIVE_INFINITY : td.fit.objective;
            if (tc != null && jc < best.fit.objective) best = tc;
            if (td != null && jd < best.fit.objective) best = td;
            if (jc < jd) { b = d; d = c; td = tc; c = b - gr * (b - a); tc = fitAtDelay(sup, f, c, gainSeed, s); }
            else { a = c; c = d; tc = td; d = a + gr * (b - a); td = fitAtDelay(sup, f, d, gainSeed, s); }
        }
        return best;
    }

    static List<Double> unmodifiable(List<Double> l) { return Collections.unmodifiableList(l); }
}
```

`IntegratingEstimator.java`:
```java
package com.ams.flink.cplm.response.estimation;

import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ModelFamily;

import java.util.EnumSet;
import java.util.Set;

/**
 * Integrating paths (spec §2.6): the slope change per applied-input change on the actual delayed
 * input, with the baseline drift v0 as a nuisance parameter - refined by the same bounded OE
 * machinery. A static Kp is never reported: ProcessModel.parameters() says INTEGRATING.
 */
public final class IntegratingEstimator implements ModelEstimator {
    public static final String METHOD_ID = "INTEGRATING_SLOPE_OE";
    public static final String METHOD_VERSION = "1.0.0";
    private final OutputErrorEstimator oe = new OutputErrorEstimator();

    @Override public Set<ModelFamily> supportedFamilies() { return EnumSet.of(ModelFamily.IPDT, ModelFamily.INTEGRATOR_LAG); }
    @Override public String methodId() { return METHOD_ID; }
    @Override public String methodVersion() { return METHOD_VERSION; }

    @Override
    public EstimationResult estimate(EventDataset d, double u0, ModelFamily family, EstimatorSettings s) {
        if (!supportedFamilies().contains(family)) return EstimationResult.none(EstimationResult.State.UNSUPPORTED, "NOT_AN_INTEGRATING_FAMILY");
        return oe.estimate(d, u0, family, s);
    }
}
```

`ClosedLoopPemEstimator.java`:
```java
package com.ams.flink.cplm.response.estimation;

import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ModelFamily;
import com.ams.flink.cplm.response.model.ProcessModel;
import org.apache.commons.math3.linear.Array2DRowRealMatrix;
import org.apache.commons.math3.linear.SingularValueDecomposition;

import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Qualified prediction-error adapter for closed-loop routine data (spec §2.7): ARMAX(n, n, 1)
 * y_t = sum a_i y_{t-i} + sum b_j u_{t-nk-j} + e_t + c e_{t-1}, one-step innovation minimised by
 * the bounded LM over orders {1, 2} and the delay grid; |c| < 1 (invertible), A(q) stable
 * (poles inside the unit circle) or the candidate is discarded; excitation must come from the
 * REFERENCE (the exogenous signal), never inferred from feedback-driven input motion. Competing
 * orders within the ambiguity tolerance are AMBIGUOUS_MODELS. Requires a uniform sample grid.
 */
public final class ClosedLoopPemEstimator implements ModelEstimator {
    public static final String METHOD_ID = "PEM_ARMAX_INNOVATION";
    public static final String METHOD_VERSION = "1.0.0";

    @Override public Set<ModelFamily> supportedFamilies() { return EnumSet.of(ModelFamily.FOPDT, ModelFamily.SOPDT, ModelFamily.SO_UNDERDAMPED); }
    @Override public String methodId() { return METHOD_ID; }
    @Override public String methodVersion() { return METHOD_VERSION; }

    @Override
    public EstimationResult estimate(EventDataset d, double u0, ModelFamily family, EstimatorSettings s) {
        int n = d.size();
        if (n < 40) return EstimationResult.none(EstimationResult.State.NOT_ESTIMATED, "INSUFFICIENT_SUPPORT");
        double ts = d.t[1] - d.t[0];
        for (int i = 2; i < n; i++) if (Math.abs((d.t[i] - d.t[i - 1]) - ts) > 1e-6 * ts) return EstimationResult.none(EstimationResult.State.NOT_ESTIMATED, "NON_UNIFORM_GRID");
        double rMean = 0; for (double v : d.r) rMean += v / n;
        double rEnergy = 0; for (double v : d.r) rEnergy += (v - rMean) * (v - rMean);
        if (rEnergy < s.minInputEnergy * n * 0.01) return EstimationResult.none(EstimationResult.State.NO_EXCITATION, "NO_REFERENCE_EXCITATION");

        double yMean = 0, uMean = 0;
        for (int i = 0; i < n; i++) { yMean += d.y[i] / n; uMean += d.u[i] / n; }
        int maxOrder = family == ModelFamily.FOPDT ? 1 : 2;
        List<Trial> trials = new ArrayList<>();
        int nkMax = (int) Math.max(1, Math.round(s.thetaMaxS / ts));
        for (int order = 1; order <= maxOrder; order++) {
            for (int nk = 0; nk <= nkMax; nk++) {
                Trial t = fit(d, yMean, uMean, order, nk, ts, s);
                if (t != null) trials.add(t);
            }
        }
        if (trials.isEmpty()) return EstimationResult.none(EstimationResult.State.NOT_ESTIMATED, "NO_STABLE_INVERTIBLE_FIT");
        trials.sort((a, b) -> Double.compare(a.objective, b.objective));
        Trial best = trials.get(0);
        boolean ambiguous = false;
        for (Trial t : trials) {
            if (t == best) continue;
            if (t.objective <= best.objective * (1 + s.ambiguityTolerance) && t.order != best.order) ambiguous = true;
        }
        List<EstimationResult.Candidate> out = new ArrayList<>();
        for (Trial t : trials) {
            if (t.model == null) continue;
            Map<String, Double> se = new LinkedHashMap<>();
            se.put("process_gain", t.gainSe);
            out.add(new EstimationResult.Candidate(t.model, yMean, 0, t.objective, n, se, false, false, false, t.condition, ts * 0.5, new double[0], new double[0]));
            if (out.size() >= 3) break;
        }
        if (out.isEmpty()) return EstimationResult.none(EstimationResult.State.NOT_ESTIMATED, "NO_CONTINUOUS_EQUIVALENT");
        return new EstimationResult(ambiguous ? EstimationResult.State.AMBIGUOUS_MODELS : EstimationResult.State.ESTIMATED, ambiguous ? "COMPETING_ORDERS" : "", out);
    }

    static final class Trial {
        final int order, nk; final double objective, condition, gainSe; final ProcessModel model;
        Trial(int order, int nk, double objective, double condition, double gainSe, ProcessModel model) { this.order = order; this.nk = nk; this.objective = objective; this.condition = condition; this.gainSe = gainSe; this.model = model; }
    }

    private static Trial fit(EventDataset d, double yMean, double uMean, int order, int nk, double ts, EstimatorSettings s) {
        int n = d.size();
        int start = order + nk + 1;
        // regressor condition (excitation rank) on the ARX part
        double[][] phi = new double[n - start][2 * order];
        for (int t = start; t < n; t++) {
            for (int i = 1; i <= order; i++) phi[t - start][i - 1] = d.y[t - i] - yMean;
            for (int j = 1; j <= order; j++) phi[t - start][order + j - 1] = d.u[t - nk - j] - uMean;
        }
        double cond;
        try {
            double[] sv = new SingularValueDecomposition(new Array2DRowRealMatrix(phi)).getSingularValues();
            cond = sv[sv.length - 1] > 0 ? sv[0] / sv[sv.length - 1] : Double.POSITIVE_INFINITY;
        } catch (RuntimeException e) { return null; }
        if (cond > 1e8) return null;

        int np = 2 * order + 1;
        double[] p0 = new double[np], lo = new double[np], hi = new double[np];
        for (int i = 0; i < order; i++) { p0[i] = i == 0 ? 0.8 : 0.0; lo[i] = -2; hi[i] = 2; }
        for (int j = 0; j < order; j++) { p0[order + j] = 0.1; lo[order + j] = -100; hi[order + j] = 100; }
        p0[np - 1] = 0.0; lo[np - 1] = -0.98; hi[np - 1] = 0.98;                        // c: invertible noise filter
        final int st = start;
        BoundedLm.Residuals res = p -> {
            double[] r = new double[n - st];
            double ePrev = 0;
            for (int t = st; t < n; t++) {
                double yhat = 0;
                for (int i = 1; i <= order; i++) yhat += p[i - 1] * (d.y[t - i] - yMean);
                for (int j = 1; j <= order; j++) yhat += p[order + j - 1] * (d.u[t - nk - j] - uMean);
                yhat += p[np - 1] * ePrev;
                double e = (d.y[t] - yMean) - yhat;
                r[t - st] = e;
                ePrev = e;
            }
            return r;
        };
        BoundedLm.Fit fit = BoundedLm.fit(res, p0, lo, hi, s.maxIterations, s.maxEvaluations, s.boundsHitFraction, s.illConditioned);
        if (!Double.isFinite(fit.objective)) return null;
        ProcessModel model = toContinuous(fit.p, order, nk, ts);
        double denom = 1;
        for (int i = 0; i < order; i++) denom -= fit.p[i];
        double gainSe = Double.isNaN(fit.stdErr[order]) ? Double.NaN : Math.abs(fit.stdErr[order] / denom);
        return new Trial(order, nk, fit.objective, cond, gainSe, model);
    }

    /** Discrete ARX part -> continuous family; null when unstable or not representable (never a fake FOPDT). */
    static ProcessModel toContinuous(double[] p, int order, int nk, double ts) {
        double theta = nk * ts;
        if (order == 1) {
            double a = p[0], b = p[1];
            if (!(a > 0 && a < 1)) return null;
            double tau = -ts / Math.log(a);
            return ProcessModel.fopdt("OP_TO_PV", b / (1 - a), theta, tau);
        }
        double a1 = p[0], a2 = p[1], b1 = p[2], b2 = p[3];
        double disc = a1 * a1 + 4 * a2;
        double kp = (b1 + b2) / (1 - a1 - a2);
        if (disc >= 0) {
            double z1 = (a1 + Math.sqrt(disc)) / 2, z2 = (a1 - Math.sqrt(disc)) / 2;
            if (!(z1 > 0 && z1 < 1 && z2 > 0 && z2 < 1)) return null;
            return ProcessModel.sopdt("OP_TO_PV", kp, theta, -ts / Math.log(z1), -ts / Math.log(z2));
        }
        double re = a1 / 2, im = Math.sqrt(-disc) / 2, mag = Math.hypot(re, im);
        if (!(mag < 1)) return null;
        double zetaWn = -Math.log(mag) / ts, wd = Math.atan2(im, re) / ts, wn = Math.hypot(zetaWn, wd), zeta = zetaWn / wn;
        if (!(zeta > 0 && zeta < 1)) return null;
        return ProcessModel.underdamped("OP_TO_PV", kp, theta, zeta, wn);
    }

    static List<Trial> unmodifiable(List<Trial> l) { return Collections.unmodifiableList(l); }
}
```

`EstimatorRegistry.java`:
```java
package com.ams.flink.cplm.response.estimation;

import com.ams.flink.cplm.response.event.EventType;
import com.ams.flink.cplm.response.event.InputPathResolver;
import com.ams.flink.cplm.response.model.ModelFamily;

/** Legality table family x path x estimator (spec §2.7): unsupported combinations are named, never replaced. */
public final class EstimatorRegistry {
    private EstimatorRegistry() {}

    public static String legality(InputPathResolver.Path path, EventType type, ModelFamily family) {
        if (!family.supported()) return "UNSUPPORTED_MODEL_FAMILY";
        if (path == InputPathResolver.Path.SLAVE_SP_TO_PV) return "CASCADE_MASTER_OP_IS_NOT_AN_APPLIED_INPUT";
        if (type == EventType.ROUTINE_IDENTIFICATION || type == EventType.SERVO_STEP || type == EventType.CASCADE_SP_STEP) {
            return family.integrating() ? "PEM_NOT_INSTALLED_FOR_INTEGRATING" : "PEM_REQUIRED_FOR_CLOSED_LOOP";
        }
        return "OK";
    }

    public static ModelEstimator forPath(InputPathResolver.Path path, EventType type, ModelFamily family) {
        String l = legality(path, type, family);
        if ("PEM_REQUIRED_FOR_CLOSED_LOOP".equals(l)) return new ClosedLoopPemEstimator();
        if (!"OK".equals(l)) return null;
        return family.integrating() ? new IntegratingEstimator() : new OutputErrorEstimator();
    }
}
```

- [ ] **Step 4: Run** the three classes → PASS (tolerances are those of NR-001/002/003/010/013). If `recoversTheSpecFopdtUnderNoise` misses `theta` by > 0.2, lower `EstimatorSettings.delayGridS` in the test to 2.5 — the refinement is golden-section within ± one grid step. Whole suite → PASS.
- [ ] **Step 5: Commit** `feat(response): bounded OE estimator with delay profile, integrating adapter, closed-loop ARMAX PEM, legality registry (2A.4)`.

---

### Task 2A.5: Validation, uncertainty, controller adapters, frequency response, SIMC advisory

**Files:** `response/validation/{ModelValidator,UncertaintyEstimator}.java`, `response/controller/{ControllerSnapshot,ControllerFormAdapter,FrequencyResponse,SimcAdvisor}.java`; tests `{ModelValidatorTest,UncertaintyEstimatorTest,FrequencyResponseTest,SimcAdvisorTest}.java`.

**Interfaces (produces):**
```java
public final class ModelValidator { public static final class Report { public final String verdict /* CANDIDATE|VALIDATED|REJECTED */; public final Quantity validationRmse, predictionRmse, fitImprovement, residualBias; public final double[] residuals, residualAcf; public final boolean whitenessPassed; public final double whitenessP; public final double inputResidualMaxCorr; public final String lagConvention; public final double aicc; public final String reason; }
  public static Report validate(ProcessModel m, double y0, double v0, EventDataset holdout, double u0, double noiseFloorEu, double maxBridgeS); }
public final class UncertaintyEstimator { public static final class Interval { public final String parameter, method; public final double lo, hi, level; public final int repetitions; public final long seed; }
  public static Interval covariance(String parameter, double value, double stdErr, double level);
  public static Interval profileLikelihood(double[] delayProfileS, double[] delayObjective, int samples, double level);
  public static List<Interval> blockBootstrap(ModelEstimator est, EventDataset d, double u0, ModelFamily family, EstimatorSettings s, int repetitions, int blockSamples, long seed, double level); }
public final class ControllerSnapshot { public final String form /* PARALLEL|IDEAL|SERIES|UNKNOWN */; public final Double kc, ti, td, kpC, kiC, kdC, scanS, derivativeFilter; public final String action, adapterVersion; }
public final class ControllerFormAdapter { public static ControllerSnapshot toIdeal(ControllerSnapshot s); /* throws UnsupportedFormException for SERIES/UNKNOWN */ }
public final class FrequencyResponse { public static final class Result { public final Quantity gainMarginDb, phaseMarginDeg, gainCrossover, phaseCrossover, peakS, peakT, bandwidth; public final double[] omega, magL, phaseL, magS, magT; }
  public static Result of(ProcessModel m, ControllerSnapshot c, double wMin, double wMax, int points, boolean modelValidated); }
public final class SimcAdvisor { public static final class Advice { public final Double kc, ti, td; public final String rule, reason; } public static Advice advise(ProcessModel m, boolean validated, ControllerSnapshot c, Double lambdaS); }
```

- [ ] **Step 1: Write the failing tests**

`ModelValidatorTest.java`:
```java
package com.ams.flink.cplm.response.validation;

import com.ams.flink.cplm.response.estimation.OutputErrorEstimatorTest;
import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ProcessModel;
import org.junit.Test;

import static org.junit.Assert.*;

public class ModelValidatorTest {
    @Test
    public void holdoutByEventReportsFreeRunAndPredictionSeparately() {           // NR-011
        ProcessModel truth = ProcessModel.fopdt("OP_TO_PV", 3.0, 4.0, 20.0);
        EventDataset holdout = OutputErrorEstimatorTest.synthetic(truth, 0.2, 21, 5, 200, 5);
        ModelValidator.Report r = ModelValidator.validate(truth, 100, 0, holdout, 40, 0.2, 60);
        assertEquals("VALIDATED", r.verdict);
        assertTrue(r.validationRmse.value < 0.35);
        assertTrue(r.predictionRmse.value < 0.35);
        assertTrue(r.fitImprovement.value > 0.9);
        assertEquals("PV_EU", r.validationRmse.unit);
        assertEquals("POSITIVE_LAGS_RESIDUAL_VS_PAST_INPUT", r.lagConvention);
        assertTrue(Math.abs(r.residualBias.value) < 0.1);
    }

    @Test
    public void aWrongPlantFailsFreeRunEvenIfItPredictsOneStepAhead() {
        ProcessModel truth = ProcessModel.fopdt("OP_TO_PV", 3.0, 4.0, 20.0);
        ProcessModel wrong = ProcessModel.fopdt("OP_TO_PV", 1.0, 4.0, 60.0);
        EventDataset holdout = OutputErrorEstimatorTest.synthetic(truth, 0.2, 22, 5, 200, 5);
        ModelValidator.Report r = ModelValidator.validate(wrong, 100, 0, holdout, 40, 0.2, 60);
        assertNotEquals("VALIDATED", r.verdict);
        assertTrue("free-run error must expose the wrong plant", r.validationRmse.value > 3.0);
        assertTrue("one-step prediction is flattering by construction", r.predictionRmse.value < r.validationRmse.value);
        assertFalse(r.whitenessPassed);
    }
}
```

`UncertaintyEstimatorTest.java`:
```java
package com.ams.flink.cplm.response.validation;

import com.ams.flink.cplm.response.estimation.EstimatorSettings;
import com.ams.flink.cplm.response.estimation.OutputErrorEstimator;
import com.ams.flink.cplm.response.estimation.OutputErrorEstimatorTest;
import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ModelFamily;
import com.ams.flink.cplm.response.model.ProcessModel;
import org.junit.Test;

import java.util.List;
import java.util.Random;

import static org.junit.Assert.*;

public class UncertaintyEstimatorTest {
    @Test
    public void profileLikelihoodIntervalCoversTheFlatDelayRange() {
        double[] theta = {0, 5, 10, 15, 20, 25};
        double[] j = {100.5, 100.2, 100.0, 100.3, 140, 200};
        UncertaintyEstimator.Interval iv = UncertaintyEstimator.profileLikelihood(theta, j, 200, 0.95);
        assertEquals("PROFILE_LIKELIHOOD", iv.method);
        assertTrue(iv.lo <= 0.0 + 1e-9);
        assertTrue(iv.hi >= 15.0 && iv.hi < 20.0);
    }

    @Test
    public void blockBootstrapIsWiderThanIidOnAutocorrelatedResiduals() {
        // autocorrelated noise: AR(1) with phi = 0.9 -> block bootstrap must not print a narrow i.i.d. interval
        ProcessModel truth = ProcessModel.fopdt("OP_TO_PV", 3.0, 4.0, 20.0);
        int n = 45; double[] t = new double[n], u = new double[n], y = new double[n], r = new double[n]; boolean[] v = new boolean[n];
        Random rnd = new Random(8); double e = 0;
        for (int i = 0; i < n; i++) { t[i] = -20 + 5 * i; u[i] = t[i] < 0 ? 40 : 45; }
        double[] clean = com.ams.flink.cplm.response.simulation.ZohSimulator.simulate(truth, t, u, 40, 100, 0, 0, 60).yHat;
        for (int i = 0; i < n; i++) { e = 0.9 * e + 0.3 * rnd.nextGaussian(); y[i] = clean[i] + e; r[i] = 100; v[i] = true; }
        EventDataset d = new EventDataset(t, y, r, u, v, 0, 200);
        EstimatorSettings s = new EstimatorSettings(); s.delayGridS = 5; s.thetaMaxS = 30; s.tauMaxS = 300;
        List<UncertaintyEstimator.Interval> block = UncertaintyEstimator.blockBootstrap(new OutputErrorEstimator(), d, 40, ModelFamily.FOPDT, s, 12, 8, 3, 0.9);
        List<UncertaintyEstimator.Interval> iid = UncertaintyEstimator.blockBootstrap(new OutputErrorEstimator(), d, 40, ModelFamily.FOPDT, s, 12, 1, 3, 0.9);
        UncertaintyEstimator.Interval gb = block.stream().filter(x -> x.parameter.equals("process_gain")).findFirst().get();
        UncertaintyEstimator.Interval gi = iid.stream().filter(x -> x.parameter.equals("process_gain")).findFirst().get();
        assertEquals("BLOCK_BOOTSTRAP", gb.method);
        assertEquals(12, gb.repetitions);
        assertTrue("block interval " + (gb.hi - gb.lo) + " must be at least as wide as i.i.d. " + (gi.hi - gi.lo), gb.hi - gb.lo >= 0.8 * (gi.hi - gi.lo));
    }
}
```

`FrequencyResponseTest.java`:
```java
package com.ams.flink.cplm.response.controller;

import com.ams.flink.cplm.response.model.ProcessModel;
import org.junit.Test;

import static org.junit.Assert.*;

public class FrequencyResponseTest {
    @Test
    public void pureDelayWithProportionalControlHasTheClosedFormGainMargin() {
        // L = 0.5 e^{-j w 10}: |L| = 0.5 (no gain crossover), phase crossover at w = pi/10 -> GM = 1/0.5 = 6.02 dB
        ProcessModel m = ProcessModel.fopdt("OP_TO_PV", 1.0, 10.0, 1e-6 + 0.001);
        ControllerSnapshot c = ControllerSnapshot.ideal(0.5, null, null, 1.0, "DIRECT");
        FrequencyResponse.Result r = FrequencyResponse.of(m, c, 1e-3, 10, 4000, true);
        assertEquals(6.02, r.gainMarginDb.value, 0.15);
        assertEquals(Math.PI / 10, r.phaseCrossover.value, 0.02);
        assertFalse(r.phaseMarginDeg.available());
        assertEquals("UNKNOWN_CONTROLLER_OR_NO_VALID_CROSSING", r.phaseMarginDeg.reasonIfNull);
        assertEquals("dB", r.gainMarginDb.unit);
        assertEquals("rad/s", r.phaseCrossover.unit);
    }

    @Test
    public void fopdtWithPiMatchesABruteForceCrossover() {
        ProcessModel m = ProcessModel.fopdt("OP_TO_PV", 2.0, 5.0, 30.0);
        ControllerSnapshot c = ControllerSnapshot.ideal(0.4, 40.0, null, 1.0, "DIRECT");
        FrequencyResponse.Result r = FrequencyResponse.of(m, c, 1e-4, 10, 20000, true);
        assertTrue(r.gainCrossover.available());
        double w = r.gainCrossover.value;
        double magC = 0.4 * Math.hypot(1, 1 / (40.0 * w));
        double magG = 2.0 / Math.hypot(1, 30.0 * w);
        assertEquals(1.0, magC * magG, 0.01);                                   // |L| = 1 at the reported crossover
        assertTrue(r.phaseMarginDeg.value > 0 && r.phaseMarginDeg.value < 180);
        assertTrue(r.peakS.value >= 1.0);
    }

    @Test
    public void unknownControllerFormYieldsUnavailableNotFabrication() {         // NR-014
        ProcessModel m = ProcessModel.fopdt("OP_TO_PV", 2.0, 5.0, 30.0);
        ControllerSnapshot unknown = ControllerSnapshot.unknown();
        FrequencyResponse.Result r = FrequencyResponse.of(m, unknown, 1e-4, 10, 100, true);
        assertFalse(r.gainMarginDb.available());
        assertEquals("UNKNOWN_CONTROLLER_OR_NO_VALID_CROSSING", r.gainMarginDb.reasonIfNull);
        try { ControllerFormAdapter.toIdeal(ControllerSnapshot.series(1, 10, 1, 1.0)); fail(); } catch (ControllerFormAdapter.UnsupportedFormException expected) { }
        FrequencyResponse.Result nv = FrequencyResponse.of(m, ControllerSnapshot.ideal(0.4, 40.0, null, 1.0, "DIRECT"), 1e-4, 10, 100, false);
        assertEquals("MODEL_DOMAIN_UNAVAILABLE", nv.peakS.reasonIfNull);
    }
}
```

`SimcAdvisorTest.java`:
```java
package com.ams.flink.cplm.response.controller;

import com.ams.flink.cplm.response.model.ProcessModel;
import org.junit.Test;

import static org.junit.Assert.*;

public class SimcAdvisorTest {
    @Test
    public void selfRegulatingAndIntegratingRulesAreTheNamedSimcForms() {
        ProcessModel fopdt = ProcessModel.fopdt("OP_TO_PV", 3.0, 4.0, 20.0);
        SimcAdvisor.Advice a = SimcAdvisor.advise(fopdt, true, ControllerSnapshot.ideal(1, 1, null, 1.0, "DIRECT"), 4.0);
        assertEquals("SIMC_2003_CORRECTED", a.rule);
        assertEquals((1.0 / 3.0) * 20.0 / (4.0 + 4.0), a.kc, 1e-9);
        assertEquals(Math.min(20.0, 4 * (4.0 + 4.0)), a.ti, 1e-9);
        assertNull(a.td);
        ProcessModel ipdt = ProcessModel.ipdt("OP_TO_PV", 0.01, 12.0);
        SimcAdvisor.Advice b = SimcAdvisor.advise(ipdt, true, ControllerSnapshot.ideal(1, 1, null, 1.0, "DIRECT"), 12.0);
        assertEquals((1.0 / 0.01) / (12.0 + 12.0), b.kc, 1e-9);
        assertEquals(4 * (12.0 + 12.0), b.ti, 1e-9);
    }

    @Test
    public void refusesWithoutAValidatedModelKnownControllerAndApprovedLambda() {
        ProcessModel fopdt = ProcessModel.fopdt("OP_TO_PV", 3.0, 4.0, 20.0);
        assertEquals("MODEL_NOT_VALIDATED", SimcAdvisor.advise(fopdt, false, ControllerSnapshot.ideal(1, 1, null, 1.0, "DIRECT"), 4.0).reason);
        assertEquals("CONTROLLER_FORM_UNKNOWN", SimcAdvisor.advise(fopdt, true, ControllerSnapshot.unknown(), 4.0).reason);
        assertEquals("LAMBDA_NOT_APPROVED", SimcAdvisor.advise(fopdt, true, ControllerSnapshot.ideal(1, 1, null, 1.0, "DIRECT"), null).reason);
        assertNull(SimcAdvisor.advise(fopdt, false, ControllerSnapshot.unknown(), null).kc);
    }
}
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**

`ModelValidator.java`:
```java
package com.ams.flink.cplm.response.validation;

import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ProcessModel;
import com.ams.flink.cplm.response.model.Quantity;
import com.ams.flink.cplm.response.simulation.ZohSimulator;
import org.apache.commons.math3.distribution.ChiSquaredDistribution;

/**
 * Validation on an INDEPENDENT holdout event (spec §2.8): free-run simulation RMSE and one-step
 * prediction RMSE reported separately, fit improvement against the named constant-baseline model,
 * residual bias, Ljung-Box whiteness (lags 1..10), residual-vs-PAST-input correlation (positive
 * lags only - the declared convention; feedback correlates residuals with FUTURE inputs), AICc.
 */
public final class ModelValidator {
    public static final String METHOD = "HOLDOUT_FREE_RUN_V1";
    public static final String LAG_CONVENTION = "POSITIVE_LAGS_RESIDUAL_VS_PAST_INPUT";
    public static final String BASELINE = "CONSTANT_BASELINE_Y0";
    public static final int ACF_LAGS = 10;

    public static final class Report {
        public final String verdict;
        public final Quantity validationRmse, predictionRmse, fitImprovement, residualBias;
        public final double[] residuals, residualAcf;
        public final boolean whitenessPassed;
        public final double whitenessP, inputResidualMaxCorr, aicc;
        public final String lagConvention, reason;

        Report(String verdict, Quantity vr, Quantity pr, Quantity fi, Quantity rb, double[] residuals, double[] acf, boolean white, double whiteP,
               double corr, double aicc, String reason) {
            this.verdict = verdict; validationRmse = vr; predictionRmse = pr; fitImprovement = fi; residualBias = rb; this.residuals = residuals;
            this.residualAcf = acf; whitenessPassed = white; whitenessP = whiteP; inputResidualMaxCorr = corr; this.aicc = aicc;
            lagConvention = LAG_CONVENTION; this.reason = reason;
        }
    }

    private ModelValidator() {}

    public static Report validate(ProcessModel m, double y0, double v0, EventDataset h, double u0, double noiseFloorEu, double maxBridgeS) {
        ZohSimulator.Result sim = ZohSimulator.simulate(m, h.t, h.u, u0, y0, v0, h.t0, maxBridgeS);
        int n = 0;
        for (int i = 0; i < h.size(); i++) if (h.valid[i] && sim.valid[i]) n++;
        if (n < 8) return unavailable("INSUFFICIENT_HOLDOUT_SUPPORT");
        double[] res = new double[n], resPred = new double[n], uDev = new double[n];
        double sse = 0, sseP = 0, sseB = 0, bias = 0;
        int k = 0;
        double prevErr = 0;
        for (int i = 0; i < h.size(); i++) {
            if (!(h.valid[i] && sim.valid[i])) continue;
            double e = h.y[i] - sim.yHat[i];
            res[k] = e; sse += e * e; bias += e;
            double pred = sim.yHat[i] + prevErr;                              // one-step: carry the last innovation
            double ep = h.y[i] - pred;
            resPred[k] = ep; sseP += ep * ep;
            prevErr = e;
            double eb = h.y[i] - y0; sseB += eb * eb;                          // the named baseline: constant y0
            uDev[k] = h.u[i] - u0;
            k++;
        }
        double rmse = Math.sqrt(sse / n), rmseP = Math.sqrt(sseP / n), rmseB = Math.sqrt(sseB / n);
        bias /= n;
        double improvement = rmseB > 0 ? 1 - rmse / rmseB : Double.NaN;
        double[] acf = acf(res, ACF_LAGS);
        double q = 0;
        for (int lag = 1; lag <= ACF_LAGS; lag++) q += acf[lag] * acf[lag] / (n - lag);
        q *= n * (n + 2);
        double p = 1 - new ChiSquaredDistribution(ACF_LAGS).cumulativeProbability(q);
        boolean white = p > 0.05;
        double corr = 0;
        for (int lag = 1; lag <= ACF_LAGS; lag++) corr = Math.max(corr, Math.abs(crossCorr(res, uDev, lag)));
        int params = m.order() + 2;
        double aicc = n * Math.log(Math.max(sse / n, 1e-300)) + 2 * params + (2.0 * params * (params + 1)) / Math.max(1, n - params - 1);

        String verdict, reason = "";
        if (Double.isNaN(improvement) || improvement <= 0) { verdict = "REJECTED"; reason = "NO_IMPROVEMENT_OVER_BASELINE"; }
        else if (rmse > Math.max(3 * noiseFloorEu, 0.1 * rmseB)) { verdict = "CANDIDATE"; reason = "FREE_RUN_ERROR_ABOVE_NOISE"; }
        else if (Math.abs(bias) > Math.max(noiseFloorEu, 0.02 * rmseB)) { verdict = "CANDIDATE"; reason = "RESIDUAL_BIAS"; }
        else { verdict = "VALIDATED"; reason = white ? "" : "RESIDUALS_NOT_WHITE"; }
        return new Report(verdict,
                Quantity.of("validation_rmse", rmse, "PV_EU", METHOD), Quantity.of("prediction_rmse", rmseP, "PV_EU", "ONE_STEP_INNOVATION_CARRY"),
                Double.isNaN(improvement) ? Quantity.unavailable("fit_improvement", "fraction", "DEGENERATE_OR_UNSPECIFIED_BASELINE") : Quantity.of("fit_improvement", improvement, "fraction", BASELINE),
                Quantity.of("residual_bias", bias, "PV_EU", METHOD), res, acf, white, p, corr, aicc, reason);
    }

    private static Report unavailable(String reason) {
        return new Report("CANDIDATE",
                Quantity.unavailable("validation_rmse", "PV_EU", "NO_INDEPENDENT_VALIDATION"), Quantity.unavailable("prediction_rmse", "PV_EU", "PREDICTOR_UNAVAILABLE"),
                Quantity.unavailable("fit_improvement", "fraction", "DEGENERATE_OR_UNSPECIFIED_BASELINE"), Quantity.unavailable("residual_bias", "PV_EU", "NO_RESIDUAL_SUPPORT"),
                new double[0], new double[0], false, Double.NaN, Double.NaN, Double.NaN, reason);
    }

    static double[] acf(double[] x, int lags) {
        int n = x.length;
        double mean = 0; for (double v : x) mean += v / n;
        double var = 0; for (double v : x) var += (v - mean) * (v - mean);
        double[] a = new double[lags + 1];
        a[0] = 1;
        for (int lag = 1; lag <= lags; lag++) {
            double s = 0;
            for (int i = lag; i < n; i++) s += (x[i] - mean) * (x[i - lag] - mean);
            a[lag] = var > 0 ? s / var : 0;
        }
        return a;
    }

    /** corr(res_t, u_{t-lag}) for lag >= 1. */
    static double crossCorr(double[] res, double[] u, int lag) {
        int n = res.length;
        if (n - lag < 3) return 0;
        double mr = 0, mu = 0;
        for (int i = lag; i < n; i++) { mr += res[i]; mu += u[i - lag]; }
        mr /= (n - lag); mu /= (n - lag);
        double sru = 0, srr = 0, suu = 0;
        for (int i = lag; i < n; i++) { sru += (res[i] - mr) * (u[i - lag] - mu); srr += (res[i] - mr) * (res[i] - mr); suu += (u[i - lag] - mu) * (u[i - lag] - mu); }
        return srr > 0 && suu > 0 ? sru / Math.sqrt(srr * suu) : 0;
    }
}
```

`UncertaintyEstimator.java`:
```java
package com.ams.flink.cplm.response.validation;

import com.ams.flink.cplm.response.estimation.EstimationResult;
import com.ams.flink.cplm.response.estimation.EstimatorSettings;
import com.ams.flink.cplm.response.estimation.ModelEstimator;
import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ModelFamily;
import com.ams.flink.cplm.response.model.Quantity;
import com.ams.flink.cplm.response.simulation.ZohSimulator;
import org.apache.commons.math3.distribution.ChiSquaredDistribution;
import org.apache.commons.math3.distribution.NormalDistribution;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.TreeMap;

/** Parameter intervals by a NAMED method with its assumptions recorded (spec §2.8). */
public final class UncertaintyEstimator {
    public static final class Interval {
        public final String parameter, method;
        public final double lo, hi, level;
        public final int repetitions;
        public final long seed;
        Interval(String parameter, String method, double lo, double hi, double level, int repetitions, long seed) {
            this.parameter = parameter; this.method = method; this.lo = lo; this.hi = hi; this.level = level; this.repetitions = repetitions; this.seed = seed;
        }
    }

    private UncertaintyEstimator() {}

    /** Under the local-linear Gaussian assumption of the LM covariance. */
    public static Interval covariance(String parameter, double value, double stdErr, double level) {
        double z = new NormalDistribution().inverseCumulativeProbability(0.5 + level / 2);
        return new Interval(parameter, "COVARIANCE", value - z * stdErr, value + z * stdErr, level, 0, 0);
    }

    /** The delays whose objective stays within the chi-square band of the minimum: J <= Jmin (1 + chi2_1(level)/N). */
    public static Interval profileLikelihood(double[] delayProfileS, double[] delayObjective, int samples, double level) {
        double jmin = Double.POSITIVE_INFINITY;
        for (double j : delayObjective) if (!Double.isNaN(j)) jmin = Math.min(jmin, j);
        double crit = new ChiSquaredDistribution(1).inverseCumulativeProbability(level);
        double bound = jmin * (1 + crit / Math.max(1, samples));
        double lo = Double.POSITIVE_INFINITY, hi = Double.NEGATIVE_INFINITY;
        for (int k = 0; k < delayProfileS.length; k++) if (!Double.isNaN(delayObjective[k]) && delayObjective[k] <= bound) { lo = Math.min(lo, delayProfileS[k]); hi = Math.max(hi, delayProfileS[k]); }
        return new Interval("dead_time", "PROFILE_LIKELIHOOD", lo, hi, level, 0, 0);
    }

    /** Block bootstrap of the residuals (blocks preserve temporal structure); blockSamples = 1 is the i.i.d. variant. */
    public static List<Interval> blockBootstrap(ModelEstimator est, EventDataset d, double u0, ModelFamily family, EstimatorSettings s,
                                                int repetitions, int blockSamples, long seed, double level) {
        EstimationResult base = est.estimate(d, u0, family, s);
        if (base.best() == null) return Collections.emptyList();
        EstimationResult.Candidate c = base.best();
        ZohSimulator.Result fit = ZohSimulator.simulate(c.model, d.t, d.u, u0, c.y0, c.v0, d.t0, s.maxBridgeS);
        int n = d.size();
        double[] res = new double[n];
        for (int i = 0; i < n; i++) res[i] = d.valid[i] && fit.valid[i] ? d.y[i] - fit.yHat[i] : 0;
        Random rnd = new Random(seed);
        Map<String, List<Double>> draws = new TreeMap<>();
        for (int rep = 0; rep < repetitions; rep++) {
            double[] y = new double[n];
            int i = 0;
            while (i < n) {
                int start = rnd.nextInt(n);
                for (int b = 0; b < blockSamples && i < n; b++, i++) y[i] = fit.yHat[i] + res[(start + b) % n];
            }
            EstimationResult r = est.estimate(new EventDataset(d.t, y, d.r, d.u, d.valid, d.t0, d.tEnd), u0, family, s);
            if (r.best() == null) continue;
            for (Map.Entry<String, Quantity> e : r.best().model.parameters().entrySet()) {
                if (!e.getValue().available()) continue;
                draws.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(e.getValue().value);
            }
        }
        List<Interval> out = new ArrayList<>();
        for (Map.Entry<String, List<Double>> e : draws.entrySet()) {
            List<Double> v = e.getValue();
            Collections.sort(v);
            int lo = (int) Math.floor((1 - level) / 2 * (v.size() - 1)), hi = (int) Math.ceil((1 + level) / 2 * (v.size() - 1));
            out.add(new Interval(e.getKey(), blockSamples > 1 ? "BLOCK_BOOTSTRAP" : "IID_BOOTSTRAP", v.get(Math.max(0, lo)), v.get(Math.min(v.size() - 1, hi)), level, v.size(), seed));
        }
        return out;
    }
}
```

`ControllerSnapshot.java`:
```java
package com.ams.flink.cplm.response.controller;

import java.io.Serializable;

/** Configured controller settings as READ metadata (spec §2.9): never estimated from a trace. */
public final class ControllerSnapshot implements Serializable {
    private static final long serialVersionUID = 1L;
    public final String form;          // PARALLEL | IDEAL | SERIES | UNKNOWN
    public final Double kc, ti, td, kpC, kiC, kdC, scanS, derivativeFilter;
    public final String action, adapterVersion;

    ControllerSnapshot(String form, Double kc, Double ti, Double td, Double kpC, Double kiC, Double kdC, Double scanS, Double derivativeFilter, String action, String adapterVersion) {
        this.form = form; this.kc = kc; this.ti = ti; this.td = td; this.kpC = kpC; this.kiC = kiC; this.kdC = kdC; this.scanS = scanS; this.derivativeFilter = derivativeFilter; this.action = action; this.adapterVersion = adapterVersion;
    }

    public static ControllerSnapshot ideal(double kc, Double tiS, Double tdS, double scanS, String action) { return new ControllerSnapshot("IDEAL", kc, tiS, tdS, null, null, null, scanS, null, action, "NATIVE"); }
    public static ControllerSnapshot parallel(double kp, Double ki, Double kd, double scanS, String action) { return new ControllerSnapshot("PARALLEL", null, null, null, kp, ki, kd, scanS, null, action, "NATIVE"); }
    public static ControllerSnapshot series(double kc, Double tiS, Double tdS, double scanS) { return new ControllerSnapshot("SERIES", kc, tiS, tdS, null, null, null, scanS, null, "DIRECT", "NATIVE"); }
    public static ControllerSnapshot unknown() { return new ControllerSnapshot("UNKNOWN", null, null, null, null, null, null, null, null, "UNKNOWN", "NONE"); }

    public boolean known() { return "IDEAL".equals(form) || "PARALLEL".equals(form); }
}
```

`ControllerFormAdapter.java`:
```java
package com.ams.flink.cplm.response.controller;

/** Parallel <-> ideal only, with units and signs; series/interactive has no universal identity (spec §2.9). */
public final class ControllerFormAdapter {
    public static final String VERSION = "FORM_ADAPTER_1.0";

    public static final class UnsupportedFormException extends RuntimeException {
        public UnsupportedFormException(String form) { super("UNSUPPORTED_FORM:" + form); }
    }

    private ControllerFormAdapter() {}

    /** Ideal Kc / Ti / Td from a snapshot; PARALLEL: Kc = Kp, Ti = Kp/Ki, Td = Kd/Kp. */
    public static ControllerSnapshot toIdeal(ControllerSnapshot s) {
        if ("IDEAL".equals(s.form)) return s;
        if (!"PARALLEL".equals(s.form)) throw new UnsupportedFormException(s.form);
        double kc = s.kpC;
        Double ti = s.kiC == null || s.kiC == 0 ? null : kc / s.kiC;
        Double td = s.kdC == null ? null : s.kdC / kc;
        return new ControllerSnapshot("IDEAL", kc, ti, td, s.kpC, s.kiC, s.kdC, s.scanS, s.derivativeFilter, s.action, VERSION);
    }
}
```

`FrequencyResponse.java`:
```java
package com.ams.flink.cplm.response.controller;

import com.ams.flink.cplm.response.model.ProcessModel;
import com.ams.flink.cplm.response.model.Quantity;
import org.apache.commons.math3.complex.Complex;

/**
 * Model-domain frequency outputs (spec §2.9): L = C G with the delay, S = 1/(1+L), T = L/(1+L) on a
 * log grid; ALL unity-gain and phase crossings retained (the reported one is the lowest), GM at
 * the phase crossover, PM at the gain crossover, peak |S| / |T|, closed-loop -3 dB bandwidth of T.
 * Unknown controller form or an unvalidated model -> UNAVAILABLE with the catalogue reason.
 */
public final class FrequencyResponse {
    public static final String METHOD = "MODEL_DOMAIN_FREQUENCY_V1";
    public static final String NO_CROSSING = "UNKNOWN_CONTROLLER_OR_NO_VALID_CROSSING";

    public static final class Result {
        public final Quantity gainMarginDb, phaseMarginDeg, gainCrossover, phaseCrossover, peakS, peakT, bandwidth;
        public final double[] omega, magL, phaseL, magS, magT;
        public final double[] gainCrossings, phaseCrossings;
        Result(Quantity gm, Quantity pm, Quantity gc, Quantity pc, Quantity ps, Quantity pt, Quantity bw, double[] omega, double[] magL, double[] phaseL, double[] magS, double[] magT, double[] gcs, double[] pcs) {
            gainMarginDb = gm; phaseMarginDeg = pm; gainCrossover = gc; phaseCrossover = pc; peakS = ps; peakT = pt; bandwidth = bw;
            this.omega = omega; this.magL = magL; this.phaseL = phaseL; this.magS = magS; this.magT = magT; gainCrossings = gcs; phaseCrossings = pcs;
        }
    }

    private FrequencyResponse() {}

    public static Complex process(ProcessModel m, double w) {
        Complex s = new Complex(0, w);
        Complex g;
        switch (m.family) {
            case FOPDT: g = s.multiply(m.tau).add(1).reciprocal().multiply(m.gain); break;
            case SOPDT: g = s.multiply(m.tau).add(1).multiply(s.multiply(m.tau2).add(1)).reciprocal().multiply(m.gain); break;
            case SO_UNDERDAMPED: g = s.multiply(s).add(s.multiply(2 * m.zeta * m.wn)).add(m.wn * m.wn).reciprocal().multiply(m.gain * m.wn * m.wn); break;
            case IPDT: g = s.reciprocal().multiply(m.gain); break;
            default: g = s.multiply(s.multiply(m.tau).add(1)).reciprocal().multiply(m.gain); break;
        }
        return g.multiply(new Complex(Math.cos(-w * m.theta), Math.sin(-w * m.theta)));
    }

    public static Complex controller(ControllerSnapshot c, double w) {
        ControllerSnapshot i = ControllerFormAdapter.toIdeal(c);
        Complex s = new Complex(0, w);
        Complex out = new Complex(1, 0);
        if (i.ti != null && i.ti > 0) out = out.add(s.multiply(i.ti).reciprocal());
        if (i.td != null && i.td > 0) out = out.add(s.multiply(i.td));
        return out.multiply(i.kc);
    }

    public static Result of(ProcessModel m, ControllerSnapshot c, double wMin, double wMax, int points, boolean modelValidated) {
        if (!modelValidated) return unavailable("MODEL_DOMAIN_UNAVAILABLE");
        if (c == null || !c.known()) return unavailable(NO_CROSSING);
        double[] w = new double[points], magL = new double[points], phL = new double[points], magS = new double[points], magT = new double[points];
        double logMin = Math.log10(wMin), logMax = Math.log10(wMax);
        double peakS = 0, peakT = 0, bw = Double.NaN;
        java.util.List<Double> gcs = new java.util.ArrayList<>(), pcs = new java.util.ArrayList<>();
        double prevMag = Double.NaN, prevPh = Double.NaN;
        double tAtZero = new Complex(1, 0).divide(process(m, wMin).multiply(controller(c, wMin)).add(1)).multiply(process(m, wMin).multiply(controller(c, wMin))).abs();
        for (int k = 0; k < points; k++) {
            w[k] = Math.pow(10, logMin + (logMax - logMin) * k / (points - 1));
            Complex l = process(m, w[k]).multiply(controller(c, w[k]));
            magL[k] = l.abs();
            phL[k] = unwrap(Math.toDegrees(l.getArgument()), k > 0 ? phL[k - 1] : Double.NaN);
            Complex sOne = l.add(1).reciprocal();
            magS[k] = sOne.abs(); magT[k] = l.multiply(sOne).abs();
            peakS = Math.max(peakS, magS[k]); peakT = Math.max(peakT, magT[k]);
            if (Double.isNaN(bw) && magT[k] < tAtZero / Math.sqrt(2)) bw = w[k];
            if (k > 0) {
                if ((prevMag - 1) * (magL[k] - 1) < 0) gcs.add(interp(w[k - 1], w[k], prevMag - 1, magL[k] - 1));
                if ((prevPh + 180) * (phL[k] + 180) < 0) pcs.add(interp(w[k - 1], w[k], prevPh + 180, phL[k] + 180));
            }
            prevMag = magL[k]; prevPh = phL[k];
        }
        Quantity gc = gcs.isEmpty() ? Quantity.unavailable("gain_crossover", "rad/s", "NO_VALID_CROSSING") : Quantity.of("gain_crossover", gcs.get(0), "rad/s", METHOD);
        Quantity pc = pcs.isEmpty() ? Quantity.unavailable("phase_crossover", "rad/s", "NO_VALID_CROSSING") : Quantity.of("phase_crossover", pcs.get(0), "rad/s", METHOD);
        Quantity pm = gcs.isEmpty() ? Quantity.unavailable("phase_margin", "degree", NO_CROSSING)
                : Quantity.of("phase_margin", 180 + Math.toDegrees(process(m, gcs.get(0)).multiply(controller(c, gcs.get(0))).getArgument()), "degree", METHOD);
        Quantity gm = pcs.isEmpty() ? Quantity.unavailable("gain_margin", "dB", NO_CROSSING)
                : Quantity.of("gain_margin", -20 * Math.log10(process(m, pcs.get(0)).multiply(controller(c, pcs.get(0))).abs()), "dB", METHOD);
        return new Result(gm, pm, gc, pc, Quantity.of("peak_sensitivity", peakS, "dimensionless", METHOD), Quantity.of("peak_complementary_sensitivity", peakT, "dimensionless", METHOD),
                Double.isNaN(bw) ? Quantity.unavailable("closed_loop_bandwidth", "rad/s", "NO_VALID_BANDWIDTH") : Quantity.of("closed_loop_bandwidth", bw, "rad/s", METHOD),
                w, magL, phL, magS, magT, toArray(gcs), toArray(pcs));
    }

    private static Result unavailable(String reason) {
        return new Result(Quantity.unavailable("gain_margin", "dB", reason), Quantity.unavailable("phase_margin", "degree", reason),
                Quantity.unavailable("gain_crossover", "rad/s", reason), Quantity.unavailable("phase_crossover", "rad/s", reason),
                Quantity.unavailable("peak_sensitivity", "dimensionless", reason), Quantity.unavailable("peak_complementary_sensitivity", "dimensionless", reason),
                Quantity.unavailable("closed_loop_bandwidth", "rad/s", reason), new double[0], new double[0], new double[0], new double[0], new double[0], new double[0], new double[0]);
    }

    private static double unwrap(double deg, double prev) {
        if (Double.isNaN(prev)) return deg;
        while (deg - prev > 180) deg -= 360;
        while (deg - prev < -180) deg += 360;
        return deg;
    }

    private static double interp(double w0, double w1, double f0, double f1) { return w0 + (w1 - w0) * (-f0) / (f1 - f0); }

    private static double[] toArray(java.util.List<Double> l) { double[] a = new double[l.size()]; for (int i = 0; i < a.length; i++) a[i] = l.get(i); return a; }
}
```

`SimcAdvisor.java`:
```java
package com.ams.flink.cplm.response.controller;

import com.ams.flink.cplm.response.model.ProcessModel;

/**
 * Advisory only (spec §2.9): SIMC (Skogestad 2003, corrected editions) - self-regulating
 * Kc = tau / (Kp (tau_c + theta)), Ti = min(tau, 4 (tau_c + theta)); integrating
 * Kc = 1 / (Ki (tau_c + theta)), Ti = 4 (tau_c + theta); SOPDT Td = tau2. Refuses without a
 * VALIDATED model, a known controller form and an APPROVED tau_c (lambda). Never applied.
 */
public final class SimcAdvisor {
    public static final String RULE = "SIMC_2003_CORRECTED";

    public static final class Advice {
        public final Double kc, ti, td;
        public final String rule, reason;
        Advice(Double kc, Double ti, Double td, String rule, String reason) { this.kc = kc; this.ti = ti; this.td = td; this.rule = rule; this.reason = reason; }
    }

    private SimcAdvisor() {}

    public static Advice advise(ProcessModel m, boolean validated, ControllerSnapshot c, Double lambdaS) {
        if (!validated) return new Advice(null, null, null, RULE, "MODEL_NOT_VALIDATED");
        if (c == null || !c.known()) return new Advice(null, null, null, RULE, "CONTROLLER_FORM_UNKNOWN");
        if (lambdaS == null || lambdaS <= 0) return new Advice(null, null, null, RULE, "LAMBDA_NOT_APPROVED");
        double tc = lambdaS + m.theta;
        switch (m.family) {
            case FOPDT: return new Advice(m.tau / (m.gain * tc), Math.min(m.tau, 4 * tc), null, RULE, "");
            case SOPDT: return new Advice(m.tau / (m.gain * tc), Math.min(m.tau, 4 * tc), m.tau2, RULE, "");
            case IPDT: return new Advice(1 / (m.gain * tc), 4 * tc, null, RULE, "");
            case INTEGRATOR_LAG: return new Advice(1 / (m.gain * tc), 4 * tc, m.tau, RULE, "");
            default: return new Advice(null, null, null, RULE, "NO_SIMC_RULE_FOR_FAMILY");
        }
    }
}
```

- [ ] **Step 4: Run** → PASS; whole suite → PASS.
- [ ] **Step 5: Commit** `feat(response): holdout validation, named uncertainty methods, controller adapters, model-domain frequency outputs, SIMC advisory (2A.5)`.

---

### Task 2A.6: `G12Result` and the evidence artifacts

**Files:** `response/G12Result.java`, `response/evidence/ResponseEvidenceWriter.java`; tests `G12ResultTest.java`, `ResponseEvidenceWriterTest.java`.

**Interfaces (produces):**
```java
public final class G12Result { public static final String METHOD_ID = "G12.SYSTEM_RESPONSE", METHOD_VERSION = "1.0.0";
  public static final List<String> QUANTITY_IDS; /* the 52 catalogue ids, in catalogue order */
  public String loopId, pathId, eventId, evaluationState /* WAITING|EVALUATED|CENSORED|REJECTED */, eligibility /* ELIGIBLE|LIMITED|INELIGIBLE|UNKNOWN */, finding, modelState /* NONE|CANDIDATE|VALIDATED|... */;
  public final Map<String, Subgate> subgates = new LinkedHashMap<>(); /* A..H */ public final Map<String, Quantity> metrics = new LinkedHashMap<>();
  public boolean hasApprovedTestRecord; public String controllerSnapshotRef; public final List<String> healthExclusions = new ArrayList<>();
  public String methodRunId, bundleHash, datasetHash, purpose = "LIVE", analysisRunId; public int contextRevision, resultRevision = 1; public String sourceCommit, jarSha256, contractVersion;
  public static final class Subgate { public String state = "NOT_EVALUATED"; public final Map<String, Object> outputs = new LinkedHashMap<>(); }
  public static G12Result empty(String loopId, String pathId); /* every quantity unavailable with the catalogue reason */ public void put(Quantity q); public String toJson(); public static G12Result fromJson(String json); }
public final class ResponseEvidenceWriter { public static List<EvidenceArtifact> artifacts(String methodRunId, ResponseEvent e, EventDataset d, ZohSimulator.Result fit, double[] yPredict, double[] predLo, double[] predHi, double y0, double r1, Map<String, Quantity> times, double[] residuals, double[] residualAcf, EstimationResult est, FrequencyResponse.Result freq, List<String> rejectionReasons); }
```

- [ ] **Step 1: Write the failing tests**

`G12ResultTest.java`:
```java
package com.ams.flink.cplm.response;

import com.ams.flink.cplm.response.model.ProcessModel;
import com.ams.flink.cplm.response.model.Quantity;
import org.junit.Test;

import java.io.BufferedReader;
import java.io.FileReader;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.junit.Assert.*;

public class G12ResultTest {
    private static List<String> catalogueIds() throws Exception {
        List<String> ids = new ArrayList<>();
        try (BufferedReader r = new BufferedReader(new FileReader("../../docs/next-release/spec/xlsx_Response_quantities.tsv"))) {
            String line; boolean header = false;
            while ((line = r.readLine()) != null) {
                if (line.startsWith("Quantity\t")) { header = true; continue; }
                if (!header || line.trim().isEmpty()) continue;
                ids.add(line.split("\t")[0].trim());
            }
        }
        return ids;
    }

    @Test
    public void everyCatalogueQuantityIsPresentExactlyOnce() throws Exception {
        List<String> ids = catalogueIds();
        assertEquals(52, ids.size());
        assertEquals(new HashSet<>(ids).size(), ids.size());
        G12Result g = G12Result.empty("FIC10302", "OP_TO_PV");
        for (String id : ids) assertTrue(id, g.metrics.containsKey(id));
        assertEquals(ids.size(), g.metrics.size());
        for (Quantity q : g.metrics.values()) assertFalse(q.quantityId, q.reasonIfNull.isEmpty());
        assertEquals(new HashSet<>(ids), new HashSet<>(G12Result.QUANTITY_IDS));
    }

    @Test
    public void integratingModelsReportNoStaticGainAndGainsAlwaysCarryUnitAndPath() {
        G12Result g = G12Result.empty("LIC10501", "OP_TO_PV");
        ProcessModel m = ProcessModel.ipdt("OP_TO_PV", 0.000166667, 12.0);
        for (Quantity q : m.parameters().values()) g.put(q);
        assertFalse(g.metrics.get("process_gain").available());
        assertEquals("INTEGRATING_OR_NOT_IDENTIFIABLE", g.metrics.get("process_gain").reasonIfNull);
        assertTrue(g.metrics.get("integrating_gain").available());
        String json = g.toJson();
        G12Result back = G12Result.fromJson(json);
        assertEquals("PV_EU/(input_EU*s)", back.metrics.get("integrating_gain").unit);
        assertEquals("OP_TO_PV", back.pathId);
        assertTrue(json.contains("\"path_id\":\"OP_TO_PV\""));
        assertEquals(G12Result.METHOD_ID, back.methodId());
        assertEquals("EVIDENCE_SCORE_UNCALIBRATED", back.scoreSemantics());
    }

    @Test
    public void subgatesAToHExistAndStartNotEvaluated() {
        G12Result g = G12Result.empty("L", "OP_TO_PV");
        for (String s : new String[] {"A", "B", "C", "D", "E", "F", "G", "H"}) assertEquals("NOT_EVALUATED", g.subgates.get(s).state);
        assertEquals("WAITING", g.evaluationState);
    }
}
```

`ResponseEvidenceWriterTest.java`:
```java
package com.ams.flink.cplm.response.evidence;

import com.ams.flink.cplm.evidence.EvidenceArtifact;
import com.ams.flink.cplm.response.estimation.EstimationResult;
import com.ams.flink.cplm.response.event.EventType;
import com.ams.flink.cplm.response.event.ResponseEvent;
import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.ProcessModel;
import com.ams.flink.cplm.response.model.Quantity;
import com.ams.flink.cplm.response.simulation.ZohSimulator;
import org.junit.Test;

import java.util.*;

import static org.junit.Assert.*;

public class ResponseEvidenceWriterTest {
    @Test
    public void everyRequiredArtifactKindIsWrittenWithUnitsAndMasks() {
        int n = 41; double[] t = new double[n], y = new double[n], r = new double[n], u = new double[n]; boolean[] v = new boolean[n];
        for (int i = 0; i < n; i++) { t[i] = -20 + 5 * i; u[i] = t[i] < 0 ? 40 : 45; r[i] = t[i] < 0 ? 100 : 115; v[i] = i != 10; }
        ProcessModel m = ProcessModel.fopdt("OP_TO_PV", 3, 4, 20);
        ZohSimulator.Result fit = ZohSimulator.simulate(m, t, u, 40, 100, 0, 0, 60);
        for (int i = 0; i < n; i++) y[i] = fit.yHat[i] + 0.1;
        EventDataset d = new EventDataset(t, y, r, u, v, 0, 180);
        ResponseEvent e = new ResponseEvent("evt", "FIC10302", EventType.INPUT_TEST, "OP_TO_PV", 0, 40, 45, Collections.singletonList(new double[] {0, 45}));
        Map<String, Quantity> times = new LinkedHashMap<>();
        times.put("t10", Quantity.of("t10", 6.1, "s", "m")); times.put("t90", Quantity.of("t90", 50.0, "s", "m"));
        EstimationResult.Candidate c = new EstimationResult.Candidate(m, 100, 0, 1.0, n, new HashMap<>(), false, false, false, 10, 2.5, new double[] {0, 5, 10}, new double[] {2, 1, 3});
        EstimationResult est = new EstimationResult(EstimationResult.State.ESTIMATED, "", Collections.singletonList(c));
        double[] res = new double[n]; Arrays.fill(res, 0.1);
        List<EvidenceArtifact> a = ResponseEvidenceWriter.artifacts("run-1", e, d, fit, fit.yHat, fit.yHat, fit.yHat, 100, 115, times, res, new double[] {1, 0.1}, est, null, Arrays.asList("SOPDT: NO_IMPROVEMENT"));
        Set<String> kinds = new HashSet<>();
        for (EvidenceArtifact x : a) { kinds.add(x.kind); assertEquals("G12", x.gate); assertEquals("run-1", x.methodRunId); assertNotNull(x.xUnit); assertNotNull(x.yUnit); }
        for (String k : ResponseEvidenceWriter.REQUIRED_KINDS) assertTrue(k, kinds.contains(k));
        EvidenceArtifact samples = a.stream().filter(x -> x.kind.equals("accepted_samples")).findFirst().get();
        assertNotNull(samples.mask); assertFalse(samples.mask[10]);
        assertEquals("PV_EU", samples.yUnit); assertEquals("s", samples.xUnit);
        EvidenceArtifact input = a.stream().filter(x -> x.kind.equals("input_reconstruction")).findFirst().get();
        assertEquals("input_EU", input.yUnit);
        EvidenceArtifact bode = a.stream().filter(x -> x.kind.equals("bode")).findFirst().orElse(null);
        assertNull("no frequency result -> no bode artifact (never a fabricated one)", bode);
    }
}
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**

`G12Result.java`:
```java
package com.ams.flink.cplm.response;

import com.ams.flink.cplm.response.model.Quantity;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ArrayNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The G12.SYSTEM_RESPONSE result (spec §2.2, §2.10): subgates A-H, evaluation/eligibility/model
 * states, every one of the 52 catalogue quantities (null WITH reason when not produced), the
 * evidence flag for an approved test record, health exclusions and the run identity block.
 * Flink POJO (public fields, no-arg constructor).
 */
public final class G12Result implements Serializable {
    private static final long serialVersionUID = 1L;
    private static final ObjectMapper MAPPER = new ObjectMapper();
    public static final String METHOD_ID = "G12.SYSTEM_RESPONSE";
    public static final String METHOD_VERSION = "1.0.0";
    public static final String SCORE_SEMANTICS = "EVIDENCE_SCORE_UNCALIBRATED";

    /** quantity_id -> {unit, unavailable reason} in catalogue order (xlsx_Response_quantities.tsv). */
    private static final String[][] CATALOGUE = {
        {"input_step", "input_EU", "NO_STEP_OR_UNKNOWN_INPUT"}, {"sp_step", "PV_EU", "NOT_REFERENCE_STEP"}, {"baseline_pv", "PV_EU", "NO_VALID_BASELINE"},
        {"endpoint_pv", "PV_EU", "NO_STABLE_ENDPOINT"}, {"pre_slope", "PV_EU/s", "INSUFFICIENT_SUPPORT"}, {"post_slope", "PV_EU/s", "NO_VALID_SLOPE"},
        {"process_gain", "PV_EU/input_EU", "INTEGRATING_OR_NOT_IDENTIFIABLE"}, {"process_gain_normalized", "dimensionless", "INVALID_SPAN_OR_GAIN"},
        {"integrating_gain", "PV_EU/(input_EU*s)", "NOT_INTEGRATING_OR_NOT_IDENTIFIABLE"}, {"servo_gain", "dimensionless", "NO_REFERENCE_STEP_OR_ENDPOINT"},
        {"dead_time", "s", "DELAY_UNRESOLVED"}, {"time_constant", "s", "INAPPLICABLE_MODEL"}, {"time_constant_1", "s", "INAPPLICABLE_OR_UNIDENTIFIABLE"},
        {"time_constant_2", "s", "INAPPLICABLE_OR_UNIDENTIFIABLE"}, {"damping_ratio", "dimensionless", "NOT_IDENTIFIABLE_FROM_RESPONSE"},
        {"natural_frequency", "rad/s", "INAPPLICABLE_MODEL"}, {"zero_time_constant", "s", "UNSUPPORTED_MODEL_OR_UNIDENTIFIABLE"},
        {"rise_time_10_90", "s", "CENSORED_OR_NO_ENDPOINT"}, {"settle_response", "s", "RIGHT_CENSORED_OR_INTEGRATING_OPEN_LOOP"},
        {"settle_target", "s", "TARGET_NOT_REACHED_OR_NO_OBJECTIVE"}, {"overshoot", "% of response change", "NO_MEANINGFUL_RESPONSE"},
        {"undershoot", "% of response change", "NO_MEANINGFUL_RESPONSE"}, {"peak_time", "s", "NO_QUALIFIED_PEAK"}, {"peak_pv", "PV_EU", "INSUFFICIENT_SUPPORT"},
        {"steady_error", "PV_EU", "NO_STABLE_ENDPOINT"}, {"decay_ratio", "dimensionless", "NO_QUALIFIED_PEAK_PAIR"}, {"iae", "PV_EU*s", "NO_VALID_REFERENCE_SUPPORT"},
        {"ise", "PV_EU^2*s", "NO_VALID_REFERENCE_SUPPORT"}, {"itae", "PV_EU*s^2", "NO_VALID_REFERENCE_SUPPORT"}, {"mae_time", "PV_EU", "NO_VALID_DURATION"},
        {"rmse_time", "PV_EU", "NO_VALID_DURATION"}, {"valid_coverage", "fraction", "NO_DECLARED_INTERVAL"}, {"constraint_duration", "s", "LIMITS_UNKNOWN"},
        {"validation_rmse", "PV_EU", "NO_INDEPENDENT_VALIDATION"}, {"prediction_rmse", "PV_EU", "PREDICTOR_UNAVAILABLE"},
        {"fit_improvement", "fraction", "DEGENERATE_OR_UNSPECIFIED_BASELINE"}, {"residual_bias", "PV_EU", "NO_RESIDUAL_SUPPORT"},
        {"gain_margin", "dB", "UNKNOWN_CONTROLLER_OR_NO_VALID_CROSSING"}, {"phase_margin", "degree", "UNKNOWN_CONTROLLER_OR_NO_VALID_CROSSING"},
        {"gain_crossover", "rad/s", "NO_VALID_CROSSING"}, {"phase_crossover", "rad/s", "NO_VALID_CROSSING"}, {"peak_sensitivity", "dimensionless", "MODEL_DOMAIN_UNAVAILABLE"},
        {"peak_complementary_sensitivity", "dimensionless", "MODEL_DOMAIN_UNAVAILABLE"}, {"closed_loop_bandwidth", "rad/s", "NO_VALID_BANDWIDTH"},
        {"t10", "s", "CENSORED_OR_NO_ENDPOINT"}, {"t50", "s", "CENSORED_OR_NO_ENDPOINT"}, {"t63", "s", "CENSORED_OR_NO_ENDPOINT"}, {"t90", "s", "CENSORED_OR_NO_ENDPOINT"},
        {"controller_gain", "native_units", "CONFIGURATION_UNKNOWN"}, {"controller_ti", "s", "CONFIGURATION_UNKNOWN"}, {"controller_td", "s", "CONFIGURATION_UNKNOWN"},
        {"controller_scan", "s", "CONFIGURATION_UNKNOWN"},
    };
    public static final List<String> QUANTITY_IDS;
    static {
        List<String> ids = new ArrayList<>();
        for (String[] c : CATALOGUE) ids.add(c[0]);
        QUANTITY_IDS = Collections.unmodifiableList(ids);
    }

    public static final class Subgate implements Serializable {
        private static final long serialVersionUID = 1L;
        public String state = "NOT_EVALUATED";
        public Map<String, Object> outputs = new LinkedHashMap<>();
        public Subgate() {}
    }

    public String loopId = "", pathId = "", eventId = "";
    public String evaluationState = "WAITING", eligibility = "UNKNOWN", finding = "NONE", modelState = "NONE";
    public Map<String, Subgate> subgates = new LinkedHashMap<>();
    public Map<String, Quantity> metrics = new LinkedHashMap<>();
    public boolean hasApprovedTestRecord;
    public String controllerSnapshotRef = "";
    public List<String> healthExclusions = new ArrayList<>();
    public String methodRunId = "", bundleHash = "legacy", datasetHash = "", purpose = "LIVE", analysisRunId = "";
    public int contextRevision, resultRevision = 1;
    public String sourceCommit = "", jarSha256 = "", contractVersion = "v1";
    public long windowStartMs, windowEndMs, emittedAtMs;

    public G12Result() {}

    public static G12Result empty(String loopId, String pathId) {
        G12Result g = new G12Result();
        g.loopId = loopId;
        g.pathId = pathId;
        for (String s : Arrays.asList("A", "B", "C", "D", "E", "F", "G", "H")) g.subgates.put(s, new Subgate());
        for (String[] c : CATALOGUE) g.metrics.put(c[0], Quantity.unavailable(c[0], c[1], c[2]));
        return g;
    }

    public void put(Quantity q) {
        if (!metrics.containsKey(q.quantityId)) throw new IllegalArgumentException(q.quantityId + " is not a catalogue quantity");
        metrics.put(q.quantityId, q);
    }

    public String methodId() { return METHOD_ID; }
    public String scoreSemantics() { return SCORE_SEMANTICS; }

    public String toJson() {
        ObjectNode n = MAPPER.createObjectNode();
        n.put("loop_id", loopId); n.put("path_id", pathId); n.put("event_id", eventId);
        n.put("method_id", METHOD_ID); n.put("method_version", METHOD_VERSION); n.put("score_semantics", SCORE_SEMANTICS);
        n.put("evaluation_state", evaluationState); n.put("eligibility", eligibility); n.put("finding", finding); n.put("model_state", modelState);
        ObjectNode sg = n.putObject("subgates");
        for (Map.Entry<String, Subgate> e : subgates.entrySet()) {
            ObjectNode s = sg.putObject(e.getKey());
            s.put("state", e.getValue().state);
            s.set("outputs", MAPPER.valueToTree(e.getValue().outputs));
        }
        ArrayNode m = n.putArray("metrics");
        for (Quantity q : metrics.values()) {
            ObjectNode qn = q.toJson(MAPPER);
            qn.put("path_id", pathId);
            qn.put("config_hash", bundleHash);
            m.add(qn);
        }
        ObjectNode ev = n.putObject("evidence");
        ev.put("has_approved_test_record", hasApprovedTestRecord);
        n.put("controller_snapshot_ref", controllerSnapshotRef);
        ArrayNode hx = n.putArray("health_exclusions");
        for (String h : healthExclusions) hx.add(h);
        n.put("method_run_id", methodRunId); n.put("bundle_hash", bundleHash); n.put("dataset_hash", datasetHash); n.put("purpose", purpose);
        n.put("analysis_run_id", analysisRunId); n.put("context_revision", contextRevision); n.put("result_revision", resultRevision);
        n.put("sourceCommit", sourceCommit); n.put("jarSha256", jarSha256); n.put("contractVersion", contractVersion);
        n.put("window_start_ms", windowStartMs); n.put("window_end_ms", windowEndMs); n.put("emitted_at_ms", emittedAtMs);
        return n.toString();
    }

    public static G12Result fromJson(String json) {
        try {
            JsonNode n = MAPPER.readTree(json);
            G12Result g = empty(n.path("loop_id").asText(""), n.path("path_id").asText(""));
            g.eventId = n.path("event_id").asText("");
            g.evaluationState = n.path("evaluation_state").asText("WAITING"); g.eligibility = n.path("eligibility").asText("UNKNOWN");
            g.finding = n.path("finding").asText("NONE"); g.modelState = n.path("model_state").asText("NONE");
            for (JsonNode q : n.path("metrics")) {
                String id = q.path("quantity_id").asText();
                if (!g.metrics.containsKey(id)) continue;
                String unit = q.path("unit").asText(), method = q.path("method").asText("");
                if (q.path("value").isNumber()) {
                    Double unc = q.path("uncertainty").isNumber() ? q.path("uncertainty").asDouble() : null;
                    g.metrics.put(id, Quantity.of(id, q.path("value").asDouble(), unit, method, unc));
                } else {
                    g.metrics.put(id, Quantity.unavailable(id, unit, q.path("reason_if_null").asText("UNAVAILABLE")));
                }
            }
            n.path("subgates").fields().forEachRemaining(e -> { Subgate s = g.subgates.computeIfAbsent(e.getKey(), k -> new Subgate()); s.state = e.getValue().path("state").asText("NOT_EVALUATED"); });
            g.hasApprovedTestRecord = n.path("evidence").path("has_approved_test_record").asBoolean(false);
            g.controllerSnapshotRef = n.path("controller_snapshot_ref").asText("");
            for (JsonNode h : n.path("health_exclusions")) g.healthExclusions.add(h.asText());
            g.methodRunId = n.path("method_run_id").asText(""); g.bundleHash = n.path("bundle_hash").asText("legacy"); g.datasetHash = n.path("dataset_hash").asText("");
            g.purpose = n.path("purpose").asText("LIVE"); g.analysisRunId = n.path("analysis_run_id").asText("");
            g.contextRevision = n.path("context_revision").asInt(0); g.resultRevision = n.path("result_revision").asInt(1);
            g.sourceCommit = n.path("sourceCommit").asText(""); g.jarSha256 = n.path("jarSha256").asText(""); g.contractVersion = n.path("contractVersion").asText("v1");
            g.windowStartMs = n.path("window_start_ms").asLong(0); g.windowEndMs = n.path("window_end_ms").asLong(0); g.emittedAtMs = n.path("emitted_at_ms").asLong(0);
            return g;
        } catch (Exception e) {
            throw new IllegalArgumentException("not a G12Result: " + e.getMessage(), e);
        }
    }
}
```

`ResponseEvidenceWriter.java`:
```java
package com.ams.flink.cplm.response.evidence;

import com.ams.flink.cplm.evidence.EvidenceArtifact;
import com.ams.flink.cplm.response.controller.FrequencyResponse;
import com.ams.flink.cplm.response.estimation.EstimationResult;
import com.ams.flink.cplm.response.event.ResponseEvent;
import com.ams.flink.cplm.response.metrics.EventDataset;
import com.ams.flink.cplm.response.model.Quantity;
import com.ams.flink.cplm.response.simulation.ZohSimulator;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * The G12 evidence of spec §2.10, generated by the kernel (never reconstructed from a score):
 * accepted samples with masks, input reconstruction, event markers, fitted and predicted output
 * with labelled bands, baseline/target, response-time markers, residuals and their ACF, the
 * candidate-model table, the delay-objective curve, parameter intervals, Bode data only where a
 * frequency result exists, and rejection reasons. Missing inputs yield NO artifact of that kind.
 */
public final class ResponseEvidenceWriter {
    public static final String GATE = "G12";
    public static final List<String> REQUIRED_KINDS = Arrays.asList(
            "response_event", "accepted_samples", "input_reconstruction", "y_fit", "y_predict", "prediction_interval",
            "baseline", "target", "response_times", "residuals", "residual_acf", "candidate_models", "delay_objective_curve", "rejection_reasons");

    private ResponseEvidenceWriter() {}

    public static List<EvidenceArtifact> artifacts(String methodRunId, ResponseEvent e, EventDataset d, ZohSimulator.Result fit, double[] yPredict,
                                                   double[] predLo, double[] predHi, double y0, double r1, Map<String, Quantity> times, double[] residuals,
                                                   double[] residualAcf, EstimationResult est, FrequencyResponse.Result freq, List<String> rejectionReasons) {
        List<EvidenceArtifact> out = new ArrayList<>();
        String path = e.pathId;
        double[] marker = {e.t0Ms / 1000.0, Double.isNaN(e.tEndMs) ? d.tEnd : e.tEndMs / 1000.0};
        EvidenceArtifact ev = EvidenceArtifact.series(methodRunId, GATE, "response_event", path, "time", "s", "marker", "index", marker, new double[] {0, 1}, null);
        ev.provenance.put("event_id", e.eventId); ev.provenance.put("event_type", e.type.name()); ev.provenance.put("capture_state", e.captureState);
        ev.provenance.put("censor_reason", e.censorReason); ev.provenance.put("input_sequence_count", e.inputSequence.size());
        out.add(ev);
        out.add(EvidenceArtifact.series(methodRunId, GATE, "accepted_samples", path, "time", "s", "pv", "PV_EU", d.t, d.y, d.valid));
        out.add(EvidenceArtifact.series(methodRunId, GATE, "input_reconstruction", path, "time", "s", "u_applied", "input_EU", d.t, d.u, d.valid));
        if (fit != null) out.add(EvidenceArtifact.series(methodRunId, GATE, "y_fit", path, "time", "s", "pv_fit", "PV_EU", d.t, fit.yHat, fit.valid));
        if (yPredict != null) out.add(EvidenceArtifact.series(methodRunId, GATE, "y_predict", path, "time", "s", "pv_predict", "PV_EU", d.t, yPredict, fit == null ? null : fit.valid));
        if (predLo != null && predHi != null) {
            EvidenceArtifact band = EvidenceArtifact.series(methodRunId, GATE, "prediction_interval", path, "time", "s", "pv_prediction_band", "PV_EU", d.t, predHi, null);
            band.provenance.put("lower", predLo);
            band.provenance.put("band_meaning", "PREDICTION_INTERVAL_OF_OUTPUT_NOT_PARAMETER_CONFIDENCE");
            out.add(band);
        }
        out.add(EvidenceArtifact.series(methodRunId, GATE, "baseline", path, "time", "s", "baseline_pv", "PV_EU", marker, new double[] {y0, y0}, null));
        out.add(EvidenceArtifact.series(methodRunId, GATE, "target", path, "time", "s", "reference", "PV_EU", marker, new double[] {r1, r1}, null));
        List<double[]> tm = new ArrayList<>();
        for (Quantity q : times.values()) if (q.available()) tm.add(new double[] {q.value, Double.parseDouble(q.quantityId.replaceAll("[^0-9]", "").isEmpty() ? "0" : q.quantityId.replaceAll("[^0-9]", ""))});
        double[] tx = new double[tm.size()], ty = new double[tm.size()];
        for (int i = 0; i < tm.size(); i++) { tx[i] = tm.get(i)[0]; ty[i] = tm.get(i)[1]; }
        out.add(EvidenceArtifact.series(methodRunId, GATE, "response_times", path, "time_after_t0", "s", "progress_level", "%", tx, ty, null));
        if (residuals != null) out.add(EvidenceArtifact.series(methodRunId, GATE, "residuals", path, "time", "s", "residual", "PV_EU", Arrays.copyOf(d.t, residuals.length), residuals, null));
        if (residualAcf != null) {
            double[] lags = new double[residualAcf.length];
            for (int i = 0; i < lags.length; i++) lags[i] = i;
            out.add(EvidenceArtifact.series(methodRunId, GATE, "residual_acf", path, "lag", "samples", "acf", "dimensionless", lags, residualAcf, null));
        }
        if (est != null) {
            int k = est.candidates.size();
            double[] idx = new double[k], obj = new double[k];
            EvidenceArtifact table = null;
            for (int i = 0; i < k; i++) { idx[i] = i; obj[i] = est.candidates.get(i).objective; }
            table = EvidenceArtifact.series(methodRunId, GATE, "candidate_models", path, "candidate", "index", "objective", "PV_EU^2", idx, obj, null);
            List<String> rows = new ArrayList<>();
            for (EstimationResult.Candidate c : est.candidates) rows.add(c.model.toString() + " bounds_hit=" + c.boundsHit + " flat_delay=" + c.flatDelay + " sign_uncertain=" + c.signUncertain + " cond=" + c.conditionNumber);
            table.provenance.put("rows", rows);
            table.provenance.put("state", est.state.name());
            out.add(table);
            EstimationResult.Candidate best = est.best();
            if (best != null && best.delayProfileS.length > 0) {
                out.add(EvidenceArtifact.series(methodRunId, GATE, "delay_objective_curve", path, "dead_time", "s", "objective", "PV_EU^2", best.delayProfileS, best.delayObjective, null));
            } else {
                out.add(EvidenceArtifact.series(methodRunId, GATE, "delay_objective_curve", path, "dead_time", "s", "objective", "PV_EU^2", new double[0], new double[0], null));
            }
            if (best != null) {
                List<String> names = new ArrayList<>(best.stdErr.keySet());
                double[] px = new double[names.size()], py = new double[names.size()];
                for (int i = 0; i < names.size(); i++) { px[i] = i; Double se = best.stdErr.get(names.get(i)); py[i] = se == null ? Double.NaN : se; }
                EvidenceArtifact pi = EvidenceArtifact.series(methodRunId, GATE, "parameter_intervals", path, "parameter", "index", "std_error", "parameter_units", px, py, null);
                pi.provenance.put("parameters", names);
                pi.provenance.put("method", "COVARIANCE");
                pi.provenance.put("theta_uncertainty_s", best.thetaUncertaintyS);
                out.add(pi);
            }
        }
        if (freq != null && freq.omega.length > 0 && freq.gainMarginDb.available()) {
            EvidenceArtifact bode = EvidenceArtifact.series(methodRunId, GATE, "bode", path, "omega", "rad/s", "magnitude_L", "dimensionless", freq.omega, freq.magL, null);
            bode.provenance.put("phase_deg", freq.phaseL);
            bode.provenance.put("gain_crossings", freq.gainCrossings);
            bode.provenance.put("phase_crossings", freq.phaseCrossings);
            bode.provenance.put("note", "MODEL_DOMAIN_ESTIMATE_NOT_A_SAFETY_GUARANTEE");
            out.add(bode);
        }
        double[] rx = new double[rejectionReasons == null ? 0 : rejectionReasons.size()];
        for (int i = 0; i < rx.length; i++) rx[i] = i;
        EvidenceArtifact rej = EvidenceArtifact.series(methodRunId, GATE, "rejection_reasons", path, "reason", "index", "count", "dimensionless", rx, rx.clone(), null);
        rej.provenance.put("reasons", rejectionReasons == null ? new ArrayList<String>() : rejectionReasons);
        out.add(rej);
        return out;
    }
}
```

- [ ] **Step 4: Run** → PASS; whole suite → PASS.
- [ ] **Step 5: Commit** `feat(response): G12Result with the 52 catalogue quantities and the §2.10 evidence artifacts (2A.6)`.

---

## Self-review

- **Spec coverage:** §2.7 bounded weighted OE + delay profile + both signs + identifiability + exact ZOH (2A.4 OE); integrating adapter never a static Kp (2A.4); closed-loop PEM with noise filter, stability/invertibility, excitation rank, ambiguity, no endpoint ratio (2A.4 PEM + registry); §2.8 holdout by whole event, free-run vs one-step, baseline-relative improvement, bias, whiteness with assumptions, lag convention, AICc, named uncertainty methods incl. block bootstrap (2A.5); §2.9 controller metadata, parallel↔ideal only, series unsupported, L/S/T/margins/crossings/bandwidth with UNAVAILABLE reasons, SIMC named and gated (2A.5); §2.10 metric record shape + all artifact kinds (2A.6). NR-001/002/003/005/006/010/011/012 (whiteness/lag convention)/013/014 covered; NR-004/015/016/017 belong to 2B/2G.
- **Placeholder scan:** none.
- **Type consistency:** `EstimationResult.Candidate` fields used identically by the writer and the bootstrap; `ZohSimulator.simulate(model,t,u,u0,y0,v0,t0,maxBridgeS)` signature from part 1; `EvidenceArtifact.series(methodRunId,gate,kind,roleOrPath,xQuantity,xUnit,yQuantity,yUnit,x,y,mask)` as in 1G.2; `ControllerSnapshot.ideal(kc, tiS, tdS, scanS, action)` used by all controller tests.
