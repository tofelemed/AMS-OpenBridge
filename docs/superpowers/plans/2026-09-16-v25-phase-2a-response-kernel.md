# v2.5 Phase 2A (part 1) — Response kernel: models, ZOH simulation, observed-response metrics, events and capture

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan expands master-plan tasks 2A.1–2A.3; part 2 (`…-phase-2a2-estimation-validation.md`) expands 2A.4–2A.6.

**Goal:** A pure-Java, deterministic, side-effect-free numerical kernel for G12 (`G12.SYSTEM_RESPONSE`): the model bank with exact zero-order-hold simulation (no `1/(τ1−τ2)`), the observed-response metrics of spec §2.5 with censoring, and the event detection / capture state machine of §2.4 — all unit-tested against the spec's synthetic examples (§2.11) and acceptance scenarios NR-001…NR-009, NR-013.

**Architecture:** Package `com.ams.flink.cplm.response.{model,simulation,metrics,event}` under `src/flink`. No Flink types anywhere in this plan; `CplmResponseAnalysisJob` (2B) wraps these. Matrix work uses Apache commons-math3 3.6.1 (already in the pom): `RealMatrix`, `LUDecomposition`; the matrix exponential is a Padé(6) scaling-and-squaring implemented here (commons-math3 has none). Every metric is a `Quantity {quantityId, value|null, unit, uncertainty|null, method, reasonIfNull}`; null always carries a reason from the spec's catalogue (`docs/next-release/spec/xlsx_Response_quantities.tsv`).

**Tech Stack:** Java 11, JUnit 4 (`org.junit.Test`, `assertEquals(double, double, delta)`), commons-math3 3.6.1, Flink-shaded Jackson (`org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind`) for `toJson`. Tests run in the Maven container from PowerShell: `docker run --rm -v "D:\HMI_Project_Usama\AMS-open\src\flink:/build" -v "$env:USERPROFILE\.m2:/root/.m2" -w /build maven:3.9-eclipse-temurin-11 mvn -q -Dtest=<Class> test` (Git Bash rewrites the mounts — never from Bash).

**Spec:** `docs/next-release/spec/COMPLETE_NEXT_RELEASE_SPECIFICATION.md` §2.3–2.7, §2.11; quantities `xlsx_Response_quantities.tsv`; acceptance `xlsx_Acceptance.tsv` NR-001…NR-017. Master plan: `docs/superpowers/plans/2026-09-16-v25-next-release-master-plan.md` (Subphase 2A).

## Global Constraints

- Units are never interchangeable: seconds, hertz/rad·s⁻¹, PV EU, actuator percentage point (`pp`), fraction ≠ percent. Every `Quantity` names its unit.
- `null` + reason, never `0`, for an unavailable value (spec §2.5 "No crossing yields NULL with a censor/insufficient-response reason, not zero").
- yss is a qualified robust endpoint on stable tail support — NEVER the last sample (§2.5).
- SOPDT with equal/near-equal poles simulates through state space, never through `1/(τ1−τ2)` (§2.7, NR-013).
- Simulate only on valid input support; never bridge a gap longer than `maxBridgeS` (§2.7).
- Files ≤ 400–500 lines (CLAUDE.md); one responsibility per file.
- Tests before code; commit per task; no Flink types in `response.*` (this plan).

---

## File structure

| File | Responsibility |
|---|---|
| `response/model/ModelFamily.java` | enum of families + capability state (supported / UNSUPPORTED_*) |
| `response/model/Quantity.java` | typed metric record with unit/method/reason; JSON |
| `response/model/ProcessModel.java` | immutable model instance (family + parameters as `Quantity`s), factories, ordering rule |
| `response/simulation/MatrixExp.java` | Padé(6) scaling-and-squaring `expm` |
| `response/simulation/StateSpace.java` | continuous (A,B,C) per family; ZOH discretisation for a step `dt` via the augmented exponential |
| `response/simulation/InputReconstruction.java` | held input, delayed input `u(s−θ)`, breakpoints, gap policy |
| `response/simulation/ZohSimulator.java` | exact per-interval simulation `ŷ = y0 + v0(t−t0) + C x`, mask |
| `response/metrics/EventDataset.java` | the accepted samples of one event (t, y, r, u, valid, t0, tEnd) |
| `response/metrics/Endpoints.java` | robust baseline / endpoint on stable support |
| `response/metrics/Crossings.java` | direction-normalised progress, first sustained crossing, interpolation |
| `response/metrics/ErrorIntegrals.java` | IAE / ISE / exact ITAE / MAE_time / RMSE_time / coverage over held intervals |
| `response/metrics/Settling.java` | response and target settling with OBSERVED_THROUGH_T and censoring |
| `response/metrics/Overshoot.java` | overshoot / undershoot / peak / decay ratio / servo gain / steady error |
| `response/metrics/ResponseMetricCalculator.java` | assembles the metric map for an event |
| `response/event/EventType.java`, `ResponseEvent.java` | event vocabulary and record (id = v5 uuid) |
| `response/event/InputPathResolver.java` | OP_TO_PV / VP_TO_PV / SLAVE_SP_TO_PV / EXOGENOUS_TEST + `u_applied` availability |
| `response/event/ResponseEventDetector.java` | trigger threshold, pre-support, persistence, step vs ramp |
| `response/event/CaptureStateMachine.java` | IDLE→…→COMPLETE / REJECTED / CENSORED with segmentation triggers |
| tests under `src/flink/src/test/java/com/ams/flink/cplm/response/...` | one test class per file above |

---

### Task 2A.1: Model bank, matrix exponential, state space and exact ZOH simulation

**Files:**
- Create: `src/flink/src/main/java/com/ams/flink/cplm/response/model/{ModelFamily,Quantity,ProcessModel}.java`
- Create: `src/flink/src/main/java/com/ams/flink/cplm/response/simulation/{MatrixExp,StateSpace,InputReconstruction,ZohSimulator}.java`
- Test: `src/flink/src/test/java/com/ams/flink/cplm/response/simulation/{MatrixExpTest,ZohSimulatorTest}.java`, `.../model/ProcessModelTest.java`

**Interfaces (produces):**
```java
package com.ams.flink.cplm.response.model;
public enum ModelFamily { FOPDT, SOPDT, SO_UNDERDAMPED, IPDT, INTEGRATOR_LAG, UNSUPPORTED_INVERSE, UNSUPPORTED_UNSTABLE, UNSUPPORTED_MIMO; public boolean supported(); public boolean integrating(); }
public final class Quantity { public final String quantityId, unit, method, reasonIfNull; public final Double value, uncertainty;
  public static Quantity of(String id, double value, String unit, String method); public static Quantity of(String id, double value, String unit, String method, Double uncertainty);
  public static Quantity unavailable(String id, String unit, String reason); public boolean available(); public ObjectNode toJson(ObjectMapper m); }
public final class ProcessModel { public final ModelFamily family; public final String pathId; public final double gain, theta, tau, tau2, zeta, wn; // NaN where the family has no such parameter
  public static ProcessModel fopdt(String path, double kp, double theta, double tau); sopdt(path, kp, theta, tau1, tau2) /* ordered tau1>=tau2 */; underdamped(path, kp, theta, zeta, wn); ipdt(path, ki, theta); integratorLag(path, ki, theta, tau);
  public Map<String, Quantity> parameters(); /* process_gain | integrating_gain, dead_time, time_constant[_1,_2], damping_ratio, natural_frequency with units */ public boolean integrating(); }
package com.ams.flink.cplm.response.simulation;
public final class MatrixExp { public static RealMatrix expm(RealMatrix a); }
public final class StateSpace { public final RealMatrix a, b, c; public final double theta; public static StateSpace of(ProcessModel m); public Discrete discretize(double dt); public static final class Discrete { public final RealMatrix ad, bd; } }
public final class InputReconstruction { public InputReconstruction(double[] t, double[] u, double u0, double theta); public double delayedAt(double s); /* u(s-theta) held; u0 before the first sample */ public double[] breakpointsWithin(double from, double to); }
public final class ZohSimulator {
  public static final class Result { public final double[] yHat; public final boolean[] valid; public final String stopReason; /* null | GAP_EXCEEDS_MAX_BRIDGE */ }
  public static Result simulate(ProcessModel m, double[] t, double[] u, double u0, double y0, double v0, double t0, double maxBridgeS); }
```

- [ ] **Step 1: Write the failing tests**

`src/flink/src/test/java/com/ams/flink/cplm/response/simulation/MatrixExpTest.java`:
```java
package com.ams.flink.cplm.response.simulation;

import org.apache.commons.math3.linear.Array2DRowRealMatrix;
import org.apache.commons.math3.linear.RealMatrix;
import org.junit.Test;

import static org.junit.Assert.assertEquals;

public class MatrixExpTest {
    @Test
    public void scalarExponentialMatchesMathExp() {
        RealMatrix e = MatrixExp.expm(new Array2DRowRealMatrix(new double[][] {{-0.05 * 7.0}}));
        assertEquals(Math.exp(-0.35), e.getEntry(0, 0), 1e-12);
    }

    @Test
    public void nilpotentBlockGivesExactPolynomial() {
        // exp([[0,1],[0,0]] * dt) = [[1, dt],[0, 1]] exactly
        RealMatrix e = MatrixExp.expm(new Array2DRowRealMatrix(new double[][] {{0, 3.0}, {0, 0}}));
        assertEquals(1.0, e.getEntry(0, 0), 1e-14); assertEquals(3.0, e.getEntry(0, 1), 1e-12);
        assertEquals(0.0, e.getEntry(1, 0), 1e-14); assertEquals(1.0, e.getEntry(1, 1), 1e-14);
    }

    @Test
    public void largeNormIsHandledByScalingAndSquaring() {
        RealMatrix e = MatrixExp.expm(new Array2DRowRealMatrix(new double[][] {{-40.0}}));
        assertEquals(Math.exp(-40.0), e.getEntry(0, 0), 1e-22);
    }
}
```

`src/flink/src/test/java/com/ams/flink/cplm/response/model/ProcessModelTest.java`:
```java
package com.ams.flink.cplm.response.model;

import org.junit.Test;

import static org.junit.Assert.*;

public class ProcessModelTest {
    @Test
    public void sopdtOrdersItsPolesAndExposesOnlyExistingParameters() {
        ProcessModel m = ProcessModel.sopdt("OP_TO_PV", 3.0, 4.0, 10.0, 25.0);
        assertEquals(25.0, m.tau, 0); assertEquals(10.0, m.tau2, 0);
        assertTrue(m.parameters().containsKey("time_constant_1"));
        assertFalse(m.parameters().containsKey("time_constant"));
        assertEquals("s", m.parameters().get("dead_time").unit);
        assertEquals("PV_EU/input_EU", m.parameters().get("process_gain").unit);
    }

    @Test
    public void integratingModelsHaveNoStaticGain() {
        ProcessModel m = ProcessModel.ipdt("OP_TO_PV", 0.000166667, 12.0);
        assertTrue(m.integrating());
        Quantity kp = m.parameters().get("process_gain");
        assertFalse(kp.available());
        assertEquals("INTEGRATING_OR_NOT_IDENTIFIABLE", kp.reasonIfNull);
        assertEquals("PV_EU/(input_EU*s)", m.parameters().get("integrating_gain").unit);
    }

    @Test
    public void unsupportedFamiliesAreCapabilityStatesNotModels() {
        assertFalse(ModelFamily.UNSUPPORTED_INVERSE.supported());
        assertTrue(ModelFamily.INTEGRATOR_LAG.integrating());
        assertFalse(ModelFamily.SO_UNDERDAMPED.integrating());
    }

    @Test
    public void quantityNullAlwaysCarriesAReasonAndAUnit() {
        Quantity q = Quantity.unavailable("settle_response", "s", "RIGHT_CENSORED");
        assertNull(q.value); assertEquals("RIGHT_CENSORED", q.reasonIfNull); assertEquals("s", q.unit);
        try { Quantity.unavailable("x", "s", ""); fail("empty reason must be refused"); } catch (IllegalArgumentException expected) { }
    }
}
```

`src/flink/src/test/java/com/ams/flink/cplm/response/simulation/ZohSimulatorTest.java` (the spec §2.11 numbers):
```java
package com.ams.flink.cplm.response.simulation;

import com.ams.flink.cplm.response.model.ProcessModel;
import org.junit.Test;

import static org.junit.Assert.*;

public class ZohSimulatorTest {
    /** §2.11: exogenous 40->45 pp, FOPDT Kp=3 t/h per pp, theta=4 s, tau=20 s, PV 100->115 t/h. */
    private static final ProcessModel FIC = ProcessModel.fopdt("OP_TO_PV", 3.0, 4.0, 20.0);

    private static double[] grid(double from, double to, double dt) {
        int n = (int) Math.round((to - from) / dt) + 1;
        double[] t = new double[n];
        for (int i = 0; i < n; i++) t[i] = from + i * dt;
        return t;
    }

    private static double[] step(double[] t, double t0, double before, double after) {
        double[] u = new double[t.length];
        for (int i = 0; i < t.length; i++) u[i] = t[i] < t0 ? before : after;
        return u;
    }

    private static double ideal(double t) { // ideal model after the delay
        return t <= 4.0 ? 100.0 : 100.0 + 15.0 * (1.0 - Math.exp(-(t - 4.0) / 20.0));
    }

    @Test
    public void fopdtStepMatchesTheClosedFormToTenDigits() {
        double[] t = grid(0, 120, 0.5);
        double[] u = step(t, 0.0, 40.0, 45.0);
        ZohSimulator.Result r = ZohSimulator.simulate(FIC, t, u, 40.0, 100.0, 0.0, 0.0, 60.0);
        for (int i = 0; i < t.length; i++) {
            assertTrue(r.valid[i]);
            assertEquals("t=" + t[i], ideal(t[i]), r.yHat[i], 1e-9);
        }
        assertEquals(100.0 + 15.0 * (1 - Math.exp(-1)), r.yHat[48], 1e-9);   // t = 24 = theta + tau
        assertEquals(114.99, r.yHat[t.length - 1], 0.01);
    }

    @Test
    public void irregularSamplingEqualsTheUniformReference() {
        double[] t = {0, 5, 12, 15, 22, 30, 31, 45, 60, 77, 90, 120};
        double[] u = step(t, 0.0, 40.0, 45.0);
        ZohSimulator.Result r = ZohSimulator.simulate(FIC, t, u, 40.0, 100.0, 0.0, 0.0, 60.0);
        for (int i = 0; i < t.length; i++) assertEquals("t=" + t[i], ideal(t[i]), r.yHat[i], 1e-9);
    }

    @Test
    public void fractionalDelayLandsBetweenSamples() {
        // theta = 4.3 s on a 5 s grid: the delayed input changes inside [0,5) and [5,10)
        ProcessModel m = ProcessModel.fopdt("OP_TO_PV", 3.0, 4.3, 20.0);
        double[] t = grid(0, 60, 5.0);
        double[] u = step(t, 0.0, 40.0, 45.0);
        ZohSimulator.Result r = ZohSimulator.simulate(m, t, u, 40.0, 100.0, 0.0, 0.0, 60.0);
        double expected10 = 100.0 + 15.0 * (1.0 - Math.exp(-(10 - 4.3) / 20.0));
        assertEquals(expected10, r.yHat[2], 1e-9);
    }

    @Test
    public void repeatedPolesSimulateWithoutDividingByTheirDifference() {   // NR-013
        ProcessModel m = ProcessModel.sopdt("OP_TO_PV", 2.0, 0.0, 10.0, 10.0);
        double[] t = grid(0, 100, 1.0);
        double[] u = step(t, 0.0, 0.0, 1.0);
        ZohSimulator.Result r = ZohSimulator.simulate(m, t, u, 0.0, 0.0, 0.0, 0.0, 60.0);
        for (int i = 0; i < t.length; i++) {
            double x = t[i] / 10.0;
            double critical = 2.0 * (1.0 - (1.0 + x) * Math.exp(-x));      // critically damped closed form
            assertEquals("t=" + t[i], critical, r.yHat[i], 1e-9);
            assertFalse(Double.isNaN(r.yHat[i]));
        }
    }

    @Test
    public void integratingStepChangesTheSlopeAfterTheDelay() {            // §2.11 LIC example
        double v0 = 0.010 / 60.0;                                          // 0.010 m/min pre-slope
        double ki = 0.000166667;                                           // m/(s*pp)
        ProcessModel m = ProcessModel.ipdt("OP_TO_PV", ki, 12.0);
        double[] t = grid(0, 120, 1.0);
        double[] u = step(t, 0.0, 50.0, 52.0);
        ZohSimulator.Result r = ZohSimulator.simulate(m, t, u, 50.0, 1.0, v0, 0.0, 60.0);
        for (int i = 0; i < t.length; i++) {
            double expected = 1.0 + v0 * t[i] + ki * 2.0 * Math.max(0, t[i] - 12.0);
            assertEquals("t=" + t[i], expected, r.yHat[i], 1e-9);
        }
        double slopeAfter = (r.yHat[100] - r.yHat[90]) / 10.0;
        assertEquals(0.030 / 60.0, slopeAfter, 1e-9);                      // 0.030 m/min
    }

    @Test
    public void aGapLongerThanMaxBridgeStopsTheSimulation() {
        double[] t = {0, 5, 10, 15, 200, 205, 210};
        double[] u = step(t, 0.0, 40.0, 45.0);
        ZohSimulator.Result r = ZohSimulator.simulate(FIC, t, u, 40.0, 100.0, 0.0, 0.0, 60.0);
        assertTrue(r.valid[3]);
        assertFalse(r.valid[4]); assertFalse(r.valid[6]);
        assertEquals("GAP_EXCEEDS_MAX_BRIDGE", r.stopReason);
    }

    @Test
    public void underdampedSecondOrderHitsTheClosedFormPeak() {
        double zeta = 0.3, wn = 0.2;
        ProcessModel m = ProcessModel.underdamped("OP_TO_PV", 1.0, 0.0, zeta, wn);
        double[] t = grid(0, 60, 0.05);
        double[] u = step(t, 0.0, 0.0, 1.0);
        ZohSimulator.Result r = ZohSimulator.simulate(m, t, u, 0.0, 0.0, 0.0, 0.0, 60.0);
        double wd = wn * Math.sqrt(1 - zeta * zeta);
        double tp = Math.PI / wd;
        double peak = 1.0 + Math.exp(-zeta * wn * tp);
        int ip = (int) Math.round(tp / 0.05);
        assertEquals(peak, r.yHat[ip], 1e-3);
    }
}
```

- [ ] **Step 2: Run** (PowerShell) `… mvn -q -Dtest='MatrixExpTest,ProcessModelTest,ZohSimulatorTest' test` → FAIL (classes missing).

- [ ] **Step 3: Implement**

`response/model/ModelFamily.java`:
```java
package com.ams.flink.cplm.response.model;

/** Spec v6 §2.6 model bank. Unsupported extensions are capability STATES, never silently replaced by FOPDT. */
public enum ModelFamily {
    FOPDT(true, false), SOPDT(true, false), SO_UNDERDAMPED(true, false), IPDT(true, true), INTEGRATOR_LAG(true, true),
    UNSUPPORTED_INVERSE(false, false), UNSUPPORTED_UNSTABLE(false, false), UNSUPPORTED_MIMO(false, false);

    private final boolean supported;
    private final boolean integrating;

    ModelFamily(boolean supported, boolean integrating) { this.supported = supported; this.integrating = integrating; }
    public boolean supported() { return supported; }
    public boolean integrating() { return integrating; }
}
```

`response/model/Quantity.java`:
```java
package com.ams.flink.cplm.response.model;

import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.Serializable;
import java.util.Objects;

/** One typed metric: value or null WITH a reason (spec §2.10). Units are part of the identity, never implied. */
public final class Quantity implements Serializable {
    private static final long serialVersionUID = 1L;
    public final String quantityId;
    public final Double value;
    public final String unit;
    public final Double uncertainty;
    public final String method;
    public final String reasonIfNull;

    private Quantity(String quantityId, Double value, String unit, Double uncertainty, String method, String reasonIfNull) {
        this.quantityId = Objects.requireNonNull(quantityId);
        this.value = value;
        this.unit = Objects.requireNonNull(unit);
        this.uncertainty = uncertainty;
        this.method = method == null ? "" : method;
        this.reasonIfNull = reasonIfNull == null ? "" : reasonIfNull;
    }

    public static Quantity of(String id, double value, String unit, String method) { return of(id, value, unit, method, null); }

    public static Quantity of(String id, double value, String unit, String method, Double uncertainty) {
        if (!Double.isFinite(value)) throw new IllegalArgumentException(id + ": non-finite value");
        return new Quantity(id, value, unit, uncertainty, method, "");
    }

    public static Quantity unavailable(String id, String unit, String reason) {
        if (reason == null || reason.isEmpty()) throw new IllegalArgumentException(id + ": an unavailable quantity needs a reason");
        return new Quantity(id, null, unit, null, "", reason);
    }

    public boolean available() { return value != null; }

    public ObjectNode toJson(ObjectMapper m) {
        ObjectNode n = m.createObjectNode();
        n.put("quantity_id", quantityId);
        if (value == null) n.putNull("value"); else n.put("value", value);
        n.put("unit", unit);
        if (uncertainty == null) n.putNull("uncertainty"); else n.put("uncertainty", uncertainty);
        n.put("method", method);
        if (value == null) n.put("reason_if_null", reasonIfNull);
        return n;
    }

    @Override public String toString() { return quantityId + "=" + (value == null ? "null(" + reasonIfNull + ")" : value + " " + unit); }
}
```

`response/model/ProcessModel.java`:
```java
package com.ams.flink.cplm.response.model;

import java.io.Serializable;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * An immutable path model (spec §2.6). Parameters that do not exist for the family are NaN and are
 * reported as unavailable quantities with the catalogue's reason - a static gain is never invented
 * for an integrating path. Units: gain PV_EU/input_EU (self-regulating) or PV_EU/(input_EU*s)
 * (integrating), times in seconds, wn in rad/s, zeta dimensionless.
 */
public final class ProcessModel implements Serializable {
    private static final long serialVersionUID = 1L;
    public static final String GAIN_UNIT = "PV_EU/input_EU";
    public static final String INTEGRATING_GAIN_UNIT = "PV_EU/(input_EU*s)";

    public final ModelFamily family;
    public final String pathId;
    public final double gain;    // Kp (self-regulating) or Ki_process (integrating)
    public final double theta;   // s, >= 0
    public final double tau;     // s (FOPDT tau, SOPDT slower pole tau1, integrator lag tau)
    public final double tau2;    // s (SOPDT faster pole) or NaN
    public final double zeta;    // underdamped only
    public final double wn;      // rad/s, underdamped only

    private ProcessModel(ModelFamily family, String pathId, double gain, double theta, double tau, double tau2, double zeta, double wn) {
        if (!family.supported()) throw new IllegalArgumentException(family + " has no model instance");
        if (theta < 0 || !Double.isFinite(theta)) throw new IllegalArgumentException("theta must be >= 0");
        this.family = family; this.pathId = pathId; this.gain = gain; this.theta = theta;
        this.tau = tau; this.tau2 = tau2; this.zeta = zeta; this.wn = wn;
    }

    public static ProcessModel fopdt(String path, double kp, double theta, double tau) {
        if (!(tau > 0)) throw new IllegalArgumentException("tau must be > 0");
        return new ProcessModel(ModelFamily.FOPDT, path, kp, theta, tau, Double.NaN, Double.NaN, Double.NaN);
    }

    /** Real-pole SOPDT; poles are ORDERED (tau1 >= tau2) so the label is unambiguous (§2.6). */
    public static ProcessModel sopdt(String path, double kp, double theta, double tauA, double tauB) {
        if (!(tauA > 0) || !(tauB > 0)) throw new IllegalArgumentException("time constants must be > 0");
        return new ProcessModel(ModelFamily.SOPDT, path, kp, theta, Math.max(tauA, tauB), Math.min(tauA, tauB), Double.NaN, Double.NaN);
    }

    public static ProcessModel underdamped(String path, double kp, double theta, double zeta, double wn) {
        if (!(zeta > 0 && zeta < 1) || !(wn > 0)) throw new IllegalArgumentException("need 0 < zeta < 1 and wn > 0");
        return new ProcessModel(ModelFamily.SO_UNDERDAMPED, path, kp, theta, Double.NaN, Double.NaN, zeta, wn);
    }

    public static ProcessModel ipdt(String path, double ki, double theta) {
        return new ProcessModel(ModelFamily.IPDT, path, ki, theta, Double.NaN, Double.NaN, Double.NaN, Double.NaN);
    }

    public static ProcessModel integratorLag(String path, double ki, double theta, double tau) {
        if (!(tau > 0)) throw new IllegalArgumentException("tau must be > 0");
        return new ProcessModel(ModelFamily.INTEGRATOR_LAG, path, ki, theta, tau, Double.NaN, Double.NaN, Double.NaN);
    }

    public boolean integrating() { return family.integrating(); }

    /** Order of the state-space realisation. */
    public int order() {
        switch (family) {
            case FOPDT: case IPDT: return 1;
            default: return 2;
        }
    }

    /** Catalogue-named parameters with units; missing ones are unavailable WITH the catalogue reason. */
    public Map<String, Quantity> parameters() {
        Map<String, Quantity> p = new LinkedHashMap<>();
        String method = "MODEL_" + family.name();
        if (integrating()) {
            p.put("process_gain", Quantity.unavailable("process_gain", GAIN_UNIT, "INTEGRATING_OR_NOT_IDENTIFIABLE"));
            p.put("integrating_gain", Quantity.of("integrating_gain", gain, INTEGRATING_GAIN_UNIT, method));
        } else {
            p.put("process_gain", Quantity.of("process_gain", gain, GAIN_UNIT, method));
            p.put("integrating_gain", Quantity.unavailable("integrating_gain", INTEGRATING_GAIN_UNIT, "NOT_INTEGRATING_OR_NOT_IDENTIFIABLE"));
        }
        p.put("dead_time", Quantity.of("dead_time", theta, "s", method));
        switch (family) {
            case FOPDT:
                p.put("time_constant", Quantity.of("time_constant", tau, "s", method)); break;
            case SOPDT:
                p.put("time_constant_1", Quantity.of("time_constant_1", tau, "s", method));
                p.put("time_constant_2", Quantity.of("time_constant_2", tau2, "s", method)); break;
            case SO_UNDERDAMPED:
                p.put("damping_ratio", Quantity.of("damping_ratio", zeta, "dimensionless", method));
                p.put("natural_frequency", Quantity.of("natural_frequency", wn, "rad/s", method)); break;
            case INTEGRATOR_LAG:
                p.put("time_constant", Quantity.of("time_constant", tau, "s", method)); break;
            default: break;
        }
        return p;
    }

    @Override public String toString() { return family + "(" + pathId + ": gain=" + gain + ", theta=" + theta + ", tau=" + tau + ", tau2=" + tau2 + ", zeta=" + zeta + ", wn=" + wn + ")"; }
}
```

`response/simulation/MatrixExp.java`:
```java
package com.ams.flink.cplm.response.simulation;

import org.apache.commons.math3.linear.LUDecomposition;
import org.apache.commons.math3.linear.MatrixUtils;
import org.apache.commons.math3.linear.RealMatrix;

/** Padé(6) scaling-and-squaring matrix exponential (commons-math3 3.6.1 has none). Deterministic. */
public final class MatrixExp {
    private static final int Q = 6;
    private static final double[] C = new double[Q + 1];
    static {
        C[0] = 1.0;
        for (int k = 1; k <= Q; k++) C[k] = C[k - 1] * (Q - k + 1) / (double) (k * (2 * Q - k + 1));
    }

    private MatrixExp() {}

    public static RealMatrix expm(RealMatrix a) {
        int n = a.getRowDimension();
        double norm = a.getNorm();                        // max absolute row sum
        int s = norm > 0.5 ? Math.max(0, (int) Math.ceil(Math.log(norm / 0.5) / Math.log(2))) : 0;
        RealMatrix as = a.scalarMultiply(1.0 / Math.pow(2, s));
        RealMatrix id = MatrixUtils.createRealIdentityMatrix(n);
        RealMatrix x = as;
        RealMatrix num = id.add(as.scalarMultiply(C[1]));
        RealMatrix den = id.subtract(as.scalarMultiply(C[1]));
        for (int k = 2; k <= Q; k++) {
            x = x.multiply(as);
            num = num.add(x.scalarMultiply(C[k]));
            den = den.add(x.scalarMultiply((k % 2 == 0 ? 1 : -1) * C[k]));
        }
        RealMatrix e = new LUDecomposition(den).getSolver().solve(num);
        for (int i = 0; i < s; i++) e = e.multiply(e);
        return e;
    }
}
```

`response/simulation/StateSpace.java`:
```java
package com.ams.flink.cplm.response.simulation;

import com.ams.flink.cplm.response.model.ProcessModel;
import org.apache.commons.math3.linear.Array2DRowRealMatrix;
import org.apache.commons.math3.linear.RealMatrix;

/**
 * Continuous realisation (A, B, C) of a path model in deviation variables, and its exact ZOH
 * discretisation for one hold interval (spec §2.7): A_d = exp(A dt), B_d = int exp(A s) B ds,
 * both read off exp([[A,B],[0,0]] dt). Equal poles are ordinary here - no 1/(tau1-tau2) anywhere.
 */
public final class StateSpace {
    public final RealMatrix a, b, c;
    public final double theta;

    public static final class Discrete {
        public final RealMatrix ad, bd;
        Discrete(RealMatrix ad, RealMatrix bd) { this.ad = ad; this.bd = bd; }
    }

    private StateSpace(RealMatrix a, RealMatrix b, RealMatrix c, double theta) { this.a = a; this.b = b; this.c = c; this.theta = theta; }

    public static StateSpace of(ProcessModel m) {
        double[][] a, b, c;
        switch (m.family) {
            case FOPDT:
                a = new double[][] {{-1.0 / m.tau}}; b = new double[][] {{m.gain / m.tau}}; c = new double[][] {{1.0}}; break;
            case SOPDT: {
                double p = m.tau * m.tau2;
                a = new double[][] {{0, 1}, {-1.0 / p, -(m.tau + m.tau2) / p}}; b = new double[][] {{0}, {m.gain / p}}; c = new double[][] {{1, 0}}; break;
            }
            case SO_UNDERDAMPED:
                a = new double[][] {{0, 1}, {-m.wn * m.wn, -2 * m.zeta * m.wn}}; b = new double[][] {{0}, {m.gain * m.wn * m.wn}}; c = new double[][] {{1, 0}}; break;
            case IPDT:
                a = new double[][] {{0}}; b = new double[][] {{m.gain}}; c = new double[][] {{1}}; break;
            case INTEGRATOR_LAG:
                a = new double[][] {{0, 1}, {0, -1.0 / m.tau}}; b = new double[][] {{0}, {m.gain / m.tau}}; c = new double[][] {{1, 0}}; break;
            default:
                throw new IllegalArgumentException(m.family + " is not simulable");
        }
        return new StateSpace(new Array2DRowRealMatrix(a), new Array2DRowRealMatrix(b), new Array2DRowRealMatrix(c), m.theta);
    }

    public int order() { return a.getRowDimension(); }

    public Discrete discretize(double dt) {
        int n = order();
        RealMatrix aug = new Array2DRowRealMatrix(n + 1, n + 1);
        aug.setSubMatrix(a.scalarMultiply(dt).getData(), 0, 0);
        aug.setSubMatrix(b.scalarMultiply(dt).getData(), 0, n);
        RealMatrix e = MatrixExp.expm(aug);
        return new Discrete(e.getSubMatrix(0, n - 1, 0, n - 1), e.getSubMatrix(0, n - 1, n, n));
    }
}
```

`response/simulation/InputReconstruction.java`:
```java
package com.ams.flink.cplm.response.simulation;

import java.util.ArrayList;
import java.util.List;

/**
 * The applied input as a held signal (each sample holds until the next), delayed by theta:
 * u_delayed(s) = u(s - theta); before the first sample the baseline u0 applies. Breakpoints are the
 * instants where the delayed input changes - the exact ZOH step is split there (fractional delay
 * without interpolating the STATE, spec §2.7).
 */
public final class InputReconstruction {
    private final double[] t;
    private final double[] u;
    private final double u0;
    private final double theta;

    public InputReconstruction(double[] t, double[] u, double u0, double theta) {
        if (t.length != u.length) throw new IllegalArgumentException("t and u differ in length");
        this.t = t; this.u = u; this.u0 = u0; this.theta = theta;
    }

    /** Held, delayed input value at instant s. */
    public double delayedAt(double s) {
        double src = s - theta;
        if (t.length == 0 || src < t[0]) return u0;
        int lo = 0, hi = t.length - 1;
        while (lo < hi) {                      // largest j with t[j] <= src
            int mid = (lo + hi + 1) >>> 1;
            if (t[mid] <= src) lo = mid; else hi = mid - 1;
        }
        return u[lo];
    }

    /** Instants strictly inside (from, to) at which the delayed input can change: t[j] + theta. */
    public double[] breakpointsWithin(double from, double to) {
        List<Double> out = new ArrayList<>();
        for (double tj : t) {
            double s = tj + theta;
            if (s > from && s < to) out.add(s);
            if (s >= to) break;
        }
        double[] r = new double[out.size()];
        for (int i = 0; i < r.length; i++) r[i] = out.get(i);
        return r;
    }
}
```

`response/simulation/ZohSimulator.java`:
```java
package com.ams.flink.cplm.response.simulation;

import com.ams.flink.cplm.response.model.ProcessModel;
import org.apache.commons.math3.linear.ArrayRealVector;
import org.apache.commons.math3.linear.RealMatrix;
import org.apache.commons.math3.linear.RealVector;

import java.util.HashMap;
import java.util.Map;

/**
 * Exact zero-order-hold simulation of a path model on the ACTUAL sample instants (irregular is
 * fine): y_hat(t_i) = y0 + v0 (t_i - t0) + C x(t_i), x driven by the delayed input deviation
 * (u(s - theta) - u0), stepping exactly between every sample and every delayed-input breakpoint.
 * A gap longer than maxBridgeS is not bridged: outputs from there on are invalid (spec §2.7).
 */
public final class ZohSimulator {
    public static final String GAP_EXCEEDS_MAX_BRIDGE = "GAP_EXCEEDS_MAX_BRIDGE";

    public static final class Result {
        public final double[] yHat;
        public final boolean[] valid;
        public final String stopReason;
        Result(double[] yHat, boolean[] valid, String stopReason) { this.yHat = yHat; this.valid = valid; this.stopReason = stopReason; }
    }

    private ZohSimulator() {}

    public static Result simulate(ProcessModel m, double[] t, double[] u, double u0, double y0, double v0, double t0, double maxBridgeS) {
        int n = t.length;
        double[] yHat = new double[n];
        boolean[] valid = new boolean[n];
        if (n == 0) return new Result(yHat, valid, null);
        StateSpace ss = StateSpace.of(m);
        InputReconstruction in = new InputReconstruction(t, u, u0, m.theta);
        Map<Long, StateSpace.Discrete> cache = new HashMap<>();
        RealVector x = new ArrayRealVector(ss.order());
        yHat[0] = y0 + v0 * (t[0] - t0);
        valid[0] = true;
        String stop = null;
        for (int i = 1; i < n; i++) {
            if (stop != null) { yHat[i] = Double.NaN; continue; }
            double dt = t[i] - t[i - 1];
            if (!(dt > 0)) throw new IllegalArgumentException("time must strictly increase at index " + i);
            if (dt > maxBridgeS) { stop = GAP_EXCEEDS_MAX_BRIDGE; yHat[i] = Double.NaN; continue; }
            double from = t[i - 1];
            for (double bp : in.breakpointsWithin(t[i - 1], t[i])) {
                x = step(ss, cache, x, bp - from, in.delayedAt(from) - u0);
                from = bp;
            }
            x = step(ss, cache, x, t[i] - from, in.delayedAt(from) - u0);
            yHat[i] = y0 + v0 * (t[i] - t0) + ss.c.operate(x).getEntry(0);
            valid[i] = true;
        }
        return new Result(yHat, valid, stop);
    }

    private static RealVector step(StateSpace ss, Map<Long, StateSpace.Discrete> cache, RealVector x, double h, double uDev) {
        if (h <= 0) return x;
        StateSpace.Discrete d = cache.computeIfAbsent(Double.doubleToLongBits(h), k -> ss.discretize(h));
        RealMatrix bd = d.bd;
        return d.ad.operate(x).add(bd.getColumnVector(0).mapMultiply(uDev));
    }
}
```

- [ ] **Step 4: Run** the three test classes → PASS. Then `mvn -q test` (whole suite) → 115 + 15 new, 0 failures.
- [ ] **Step 5: Commit** `git add src/flink/src/main/java/com/ams/flink/cplm/response src/flink/src/test/java/com/ams/flink/cplm/response && git commit -m "feat(response): model bank + exact ZOH simulators (Padé expm, fractional delay, gap policy) (2A.1)"`.

---

### Task 2A.2: Observed-response metrics (spec §2.5)

**Files:**
- Create: `response/metrics/{EventDataset,Endpoints,Crossings,ErrorIntegrals,Settling,Overshoot,ResponseMetricCalculator}.java`
- Test: `test/.../response/metrics/{CrossingsTest,ErrorIntegralsTest,EndpointsAndSettlingTest,ResponseMetricCalculatorTest}.java`

**Interfaces (produces):**
```java
public final class EventDataset { public final double[] t, y, r, u; public final boolean[] valid; public final double t0, tEnd;
  public EventDataset(double[] t, double[] y, double[] r, double[] u, boolean[] valid, double t0, double tEnd); public int size(); }
public final class Endpoints { public static final class Estimate { public final Double value; public final String reason; public final int samples; public final double from, to; }
  public static Estimate baseline(EventDataset d, double preSupportS, double stableBandEu, int minSamples);
  public static Estimate endpoint(EventDataset d, double tailDwellS, double stableBandEu, int minSamples); }
public final class Crossings { public static double[] progress(EventDataset d, double y0, double yss); /* NaN where invalid */
  public static Double firstSustained(EventDataset d, double[] p, double level, double dwellS); /* seconds after t0, or null */ }
public final class ErrorIntegrals { public static final class Result { public final double iae, ise, itae, validDuration, excludedDuration, coverage; }
  public static Result over(EventDataset d); }
public final class Settling { public static Double responseSettle(EventDataset d, double yss, double band, double tailDwellS, double maxGapS);
  public static Double targetSettle(EventDataset d, double r1, double targetBand, double tailDwellS, double maxGapS);
  public static double responseBand(double absBandEu, double relBand, double dy, double noiseFloorEu); }
public final class Overshoot { public static final class Peaks { public final Double overshootPct, undershootPct, peakTimeS, peakValue, decayRatio; }
  public static Peaks of(EventDataset d, double[] p, double y0, double dy, double minResponseEu); }
public final class ResponseMetricCalculator { public static final class Settings { double preSupportS=60, tailDwellS=30, stableBandEu, absSettlingBandEu, relSettlingBand=0.02, noiseFloorEu, crossingDwellS=5, maxGapS=60, minResponseEu, targetBandEu; }
  public static Map<String, Quantity> compute(EventDataset d, double r0, double r1, Double duApplied, Settings s); }
```

- [ ] **Step 1: Write the failing tests**

`CrossingsTest.java`:
```java
package com.ams.flink.cplm.response.metrics;

import org.junit.Test;

import static org.junit.Assert.*;

public class CrossingsTest {
    static EventDataset fopdt(double dt, double end, double sign) {
        int n = (int) Math.round(end / dt) + 1;
        double[] t = new double[n], y = new double[n], r = new double[n], u = new double[n];
        boolean[] v = new boolean[n];
        for (int i = 0; i < n; i++) {
            t[i] = i * dt;
            y[i] = t[i] <= 4 ? 100 : 100 + sign * 15 * (1 - Math.exp(-(t[i] - 4) / 20));
            r[i] = 100 + sign * 15; u[i] = 45; v[i] = true;
        }
        return new EventDataset(t, y, r, u, v, 0.0, end);
    }

    @Test
    public void t10AndT90MatchTheSpecToTheGridResolution() {                 // NR-001, §2.11
        EventDataset d = fopdt(0.1, 120, +1);
        double[] p = Crossings.progress(d, 100.0, 115.0);
        assertEquals(6.1072, Crossings.firstSustained(d, p, 0.10, 5.0), 0.06);
        assertEquals(50.0517, Crossings.firstSustained(d, p, 0.90, 5.0), 0.06);
        assertEquals(4 + 20 * Math.log(2), Crossings.firstSustained(d, p, 0.50, 5.0), 0.06);
        assertEquals(4 + 20.0, Crossings.firstSustained(d, p, 1 - Math.exp(-1), 5.0), 0.06);   // t63
    }

    @Test
    public void negativeGainIsDirectionNormalised() {                          // NR-002
        EventDataset d = fopdt(0.1, 120, -1);
        double[] p = Crossings.progress(d, 100.0, 85.0);
        assertEquals(6.1072, Crossings.firstSustained(d, p, 0.10, 5.0), 0.06);
        assertEquals(50.0517, Crossings.firstSustained(d, p, 0.90, 5.0), 0.06);
    }

    @Test
    public void aCrossingThatDoesNotPersistIsNotACrossing() {
        double[] t = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10};
        double[] y = {0, 0, 0.95, 0.2, 0.2, 0.2, 0.96, 0.97, 0.98, 0.99, 1.0};
        double[] r = new double[t.length]; double[] u = new double[t.length]; boolean[] v = new boolean[t.length];
        java.util.Arrays.fill(v, true);
        EventDataset d = new EventDataset(t, y, r, u, v, 0, 10);
        double[] p = Crossings.progress(d, 0, 1);
        // the spike at t=2 does not hold for 3 s; the sustained 90 % crossing is between t=5 and t=6
        Double t90 = Crossings.firstSustained(d, p, 0.9, 3.0);
        assertNotNull(t90);
        assertTrue(t90 > 5.0 && t90 < 6.0);
        assertNull("no 10 s dwell available before the record ends", Crossings.firstSustained(d, p, 0.9, 10.0));
    }
}
```

`ErrorIntegralsTest.java`:
```java
package com.ams.flink.cplm.response.metrics;

import org.junit.Test;

import static org.junit.Assert.assertEquals;

public class ErrorIntegralsTest {
    @Test
    public void heldConstantErrorIntegratesExactly() {
        // e = 2 held for 100 s from t0 = 0 on a 5 s grid: IAE = 200, ISE = 400, ITAE = 0.5*2*100^2 = 10000
        int n = 21; double[] t = new double[n], y = new double[n], r = new double[n], u = new double[n]; boolean[] v = new boolean[n];
        for (int i = 0; i < n; i++) { t[i] = 5.0 * i; y[i] = 10; r[i] = 12; v[i] = true; }
        ErrorIntegrals.Result x = ErrorIntegrals.over(new EventDataset(t, y, r, u, v, 0, 100));
        assertEquals(200.0, x.iae, 1e-9); assertEquals(400.0, x.ise, 1e-9); assertEquals(10000.0, x.itae, 1e-9);
        assertEquals(100.0, x.validDuration, 1e-9); assertEquals(1.0, x.coverage, 1e-12); assertEquals(0.0, x.excludedDuration, 1e-9);
    }

    @Test
    public void aBadQualityHoleIsExcludedNotBridged() {
        int n = 21; double[] t = new double[n], y = new double[n], r = new double[n], u = new double[n]; boolean[] v = new boolean[n];
        for (int i = 0; i < n; i++) { t[i] = 5.0 * i; y[i] = 10; r[i] = 12; v[i] = !(t[i] >= 30 && t[i] < 60); }   // 30 s hole
        ErrorIntegrals.Result x = ErrorIntegrals.over(new EventDataset(t, y, r, u, v, 0, 100));
        assertEquals(140.0, x.iae, 1e-9);
        assertEquals(70.0, x.validDuration, 1e-9); assertEquals(30.0, x.excludedDuration, 1e-9); assertEquals(0.7, x.coverage, 1e-12);
        // exact ITAE over [0,30) and [60,100): 0.5*2*(30^2) + 0.5*2*(100^2-60^2) = 900 + 6400
        assertEquals(7300.0, x.itae, 1e-9);
    }

    @Test
    public void supportIsClippedToTheEventBounds() {
        double[] t = {-10, 0, 10, 20, 30}; double[] y = {0, 0, 0, 0, 0}; double[] r = {1, 1, 1, 1, 1}; double[] u = new double[5]; boolean[] v = {true, true, true, true, true};
        ErrorIntegrals.Result x = ErrorIntegrals.over(new EventDataset(t, y, r, u, v, 5, 25));
        assertEquals(20.0, x.iae, 1e-9);            // only [5,25) counts
        assertEquals(20.0, x.validDuration, 1e-9);
    }
}
```

`EndpointsAndSettlingTest.java`:
```java
package com.ams.flink.cplm.response.metrics;

import org.junit.Test;

import static org.junit.Assert.*;

public class EndpointsAndSettlingTest {
    static EventDataset fopdt(double end) { return CrossingsTest.fopdt(0.5, end, +1); }

    @Test
    public void endpointComesFromAStableTailNeverTheLastSample() {            // NR-008
        EventDataset full = fopdt(160);
        Endpoints.Estimate e = Endpoints.endpoint(full, 30, 0.5, 5);
        assertNotNull(e.value);
        assertEquals(115.0, e.value, 0.2);
        EventDataset truncated = fopdt(40);                                    // still rising at 40 s
        Endpoints.Estimate cut = Endpoints.endpoint(truncated, 30, 0.5, 5);
        assertNull(cut.value);
        assertEquals("NO_STABLE_ENDPOINT", cut.reason);
    }

    @Test
    public void responseSettlingIsObservedThroughTheRecordAndRightCensored() { // NR-008
        EventDataset full = fopdt(160);
        double band = Settling.responseBand(0.1, 0.02, 15.0, 0.05);            // = max(0.1, 0.3, 0.05) = 0.3
        Double ts = Settling.responseSettle(full, 115.0, band, 30, 60);
        assertNotNull(ts);
        assertEquals(4 + 20 * Math.log(15.0 / 0.3), ts, 0.6);                  // ~82.2 s, the 2 % point
        assertNull(Settling.responseSettle(fopdt(40), 115.0, band, 30, 60));
    }

    @Test
    public void aBiasedResponseSettlesToItsEndpointButNotToTheTarget() {      // NR-009
        int n = 401; double[] t = new double[n], y = new double[n], r = new double[n], u = new double[n]; boolean[] v = new boolean[n];
        for (int i = 0; i < n; i++) { t[i] = 0.5 * i; y[i] = t[i] <= 4 ? 100 : 100 + 13 * (1 - Math.exp(-(t[i] - 4) / 20)); r[i] = 115; v[i] = true; }
        EventDataset d = new EventDataset(t, y, r, u, v, 0, 200);
        Endpoints.Estimate e = Endpoints.endpoint(d, 30, 0.5, 5);
        assertEquals(113.0, e.value, 0.2);
        assertNotNull(Settling.responseSettle(d, e.value, 0.3, 30, 60));
        assertNull("the approved target band (115 +/- 0.5) is never entered", Settling.targetSettle(d, 115.0, 0.5, 30, 60));
        assertEquals(2.0, 115.0 - e.value, 0.2);                               // steady_error retained
    }

    @Test
    public void baselineNeedsStablePreSupport() {
        EventDataset d = fopdt(160);
        Endpoints.Estimate b = Endpoints.baseline(new EventDataset(d.t, d.y, d.r, d.u, d.valid, 60.0, 160.0), 60, 0.5, 5);
        assertNull("the 60 s before t0=60 are not stable (the response is rising)", b.value);
        Endpoints.Estimate ok = Endpoints.baseline(new EventDataset(d.t, d.y, d.r, d.u, d.valid, 4.0, 160.0), 4, 0.5, 5);
        assertEquals(100.0, ok.value, 1e-9);
    }
}
```

`ResponseMetricCalculatorTest.java`:
```java
package com.ams.flink.cplm.response.metrics;

import com.ams.flink.cplm.response.model.Quantity;
import org.junit.Test;

import java.util.Map;

import static org.junit.Assert.*;

public class ResponseMetricCalculatorTest {
    private static ResponseMetricCalculator.Settings settings() {
        ResponseMetricCalculator.Settings s = new ResponseMetricCalculator.Settings();
        s.preSupportS = 10; s.tailDwellS = 30; s.stableBandEu = 0.5; s.absSettlingBandEu = 0.1; s.relSettlingBand = 0.02;
        s.noiseFloorEu = 0.05; s.crossingDwellS = 5; s.maxGapS = 60; s.minResponseEu = 0.5; s.targetBandEu = 0.5;
        return s;
    }

    @Test
    public void theSpecExampleProducesTheSpecNumbersWithUnits() {              // NR-001
        int n = 1601; double[] t = new double[n], y = new double[n], r = new double[n], u = new double[n]; boolean[] v = new boolean[n];
        for (int i = 0; i < n; i++) { t[i] = -20 + 0.1 * i; y[i] = t[i] <= 4 ? 100 : 100 + 15 * (1 - Math.exp(-(t[i] - 4) / 20)); r[i] = t[i] < 0 ? 100 : 115; u[i] = t[i] < 0 ? 40 : 45; v[i] = true; }
        Map<String, Quantity> q = ResponseMetricCalculator.compute(new EventDataset(t, y, r, u, v, 0, 140), 100, 115, 5.0, settings());
        assertEquals(6.1072, q.get("t10").value, 0.06);
        assertEquals(50.0517, q.get("t90").value, 0.06);
        assertEquals(43.9445, q.get("rise_time_10_90").value, 0.12);
        assertEquals("s", q.get("rise_time_10_90").unit);
        assertEquals(115.0, q.get("endpoint_pv").value, 0.2);
        assertEquals(1.0, q.get("servo_gain").value, 0.02);
        assertEquals("dimensionless", q.get("servo_gain").unit);
        assertEquals(5.0, q.get("input_step").value, 1e-9);
        assertEquals("input_EU", q.get("input_step").unit);
        assertEquals(0.0, q.get("overshoot").value, 1e-9);
        assertEquals("% of response change", q.get("overshoot").unit);
        assertEquals(0.0, q.get("steady_error").value, 0.2);
        assertFalse(q.get("decay_ratio").available());
        assertEquals("NO_QUALIFIED_PEAK_PAIR", q.get("decay_ratio").reasonIfNull);
        assertTrue(q.get("iae").available()); assertEquals("PV_EU*s", q.get("iae").unit);
        assertEquals("PV_EU*s^2", q.get("itae").unit);
        assertEquals(1.0, q.get("valid_coverage").value, 1e-12);
    }

    @Test
    public void everyQuantityIsPresentEvenWhenUnavailable() {
        double[] t = {0, 5, 10}; double[] y = {1, 1, 1}; double[] r = {1, 1, 1}; double[] u = {0, 0, 0}; boolean[] v = {true, true, true};
        Map<String, Quantity> q = ResponseMetricCalculator.compute(new EventDataset(t, y, r, u, v, 0, 10), 1, 1, null, settings());
        for (String id : ResponseMetricCalculator.QUANTITY_IDS) assertTrue(id, q.containsKey(id));
        assertEquals("NO_STEP_OR_UNKNOWN_INPUT", q.get("input_step").reasonIfNull);
        assertEquals("NO_MEANINGFUL_RESPONSE", q.get("overshoot").reasonIfNull);
        assertEquals("CENSORED_OR_NO_ENDPOINT", q.get("t10").reasonIfNull);
    }
}
```

- [ ] **Step 2: Run** → FAIL (classes missing).

- [ ] **Step 3: Implement**

`EventDataset.java`:
```java
package com.ams.flink.cplm.response.metrics;

import java.io.Serializable;

/** The accepted samples of one response event: time (s), PV, reference, applied input, validity mask, and the event bounds. */
public final class EventDataset implements Serializable {
    private static final long serialVersionUID = 1L;
    public final double[] t, y, r, u;
    public final boolean[] valid;
    public final double t0, tEnd;

    public EventDataset(double[] t, double[] y, double[] r, double[] u, boolean[] valid, double t0, double tEnd) {
        if (t.length != y.length || t.length != r.length || t.length != u.length || t.length != valid.length) throw new IllegalArgumentException("array lengths differ");
        for (int i = 1; i < t.length; i++) if (!(t[i] > t[i - 1])) throw new IllegalArgumentException("time must strictly increase");
        this.t = t; this.y = y; this.r = r; this.u = u; this.valid = valid; this.t0 = t0; this.tEnd = tEnd;
    }

    public int size() { return t.length; }
}
```

`Endpoints.java`:
```java
package com.ams.flink.cplm.response.metrics;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Robust endpoints on separately qualified STABLE support (spec §2.5): the median of the valid
 * samples in the window, accepted only when the window is covered, has enough samples and its
 * range is within the stability band. Never the last available sample.
 */
public final class Endpoints {
    public static final String NO_VALID_BASELINE = "NO_VALID_BASELINE";
    public static final String NO_STABLE_ENDPOINT = "NO_STABLE_ENDPOINT";

    public static final class Estimate {
        public final Double value;
        public final String reason;
        public final int samples;
        public final double from, to;
        Estimate(Double value, String reason, int samples, double from, double to) { this.value = value; this.reason = reason; this.samples = samples; this.from = from; this.to = to; }
    }

    private Endpoints() {}

    public static Estimate baseline(EventDataset d, double preSupportS, double stableBandEu, int minSamples) {
        return window(d, d.t0 - preSupportS, d.t0, true, stableBandEu, minSamples, NO_VALID_BASELINE);
    }

    public static Estimate endpoint(EventDataset d, double tailDwellS, double stableBandEu, int minSamples) {
        return window(d, d.tEnd - tailDwellS, d.tEnd, false, stableBandEu, minSamples, NO_STABLE_ENDPOINT);
    }

    private static Estimate window(EventDataset d, double from, double to, boolean halfOpenEnd, double band, int minSamples, String reason) {
        List<Double> vals = new ArrayList<>();
        double first = Double.NaN, last = Double.NaN;
        for (int i = 0; i < d.size(); i++) {
            boolean inside = d.t[i] >= from && (halfOpenEnd ? d.t[i] < to : d.t[i] <= to);
            if (!inside || !d.valid[i] || !Double.isFinite(d.y[i])) continue;
            if (Double.isNaN(first)) first = d.t[i];
            last = d.t[i];
            vals.add(d.y[i]);
        }
        if (vals.size() < minSamples) return new Estimate(null, reason, vals.size(), from, to);
        double span = to - from;
        if (first - from > 0.5 * span || to - last > 0.5 * span) return new Estimate(null, reason, vals.size(), from, to);   // window not covered
        double min = Collections.min(vals), max = Collections.max(vals);
        if (max - min > band) return new Estimate(null, reason, vals.size(), from, to);
        return new Estimate(median(vals), "", vals.size(), from, to);
    }

    static double median(List<Double> vals) {
        List<Double> s = new ArrayList<>(vals);
        Collections.sort(s);
        int n = s.size();
        return n % 2 == 1 ? s.get(n / 2) : 0.5 * (s.get(n / 2 - 1) + s.get(n / 2));
    }
}
```

`Crossings.java`:
```java
package com.ams.flink.cplm.response.metrics;

/**
 * Direction-normalised progress p(t) = (y - y0)/(yss - y0) and the FIRST SUSTAINED crossing of a
 * level: the crossing instant is linearly interpolated between the bracketing samples and accepted
 * only if every valid sample in the following dwell stays at or above the level, with the record
 * covering that dwell. No crossing -> null (never 0). Spec §2.5.
 */
public final class Crossings {
    private Crossings() {}

    public static double[] progress(EventDataset d, double y0, double yss) {
        double dy = yss - y0;
        double[] p = new double[d.size()];
        for (int i = 0; i < p.length; i++) p[i] = d.valid[i] && dy != 0 ? (d.y[i] - y0) / dy : Double.NaN;
        return p;
    }

    /** Seconds after t0 of the first sustained crossing of `level`, or null. */
    public static Double firstSustained(EventDataset d, double[] p, double level, double dwellS) {
        int n = d.size();
        for (int i = 1; i < n; i++) {
            if (d.t[i] < d.t0) continue;
            if (Double.isNaN(p[i]) || Double.isNaN(p[i - 1])) continue;
            if (p[i - 1] < level && p[i] >= level) {
                double frac = (level - p[i - 1]) / (p[i] - p[i - 1]);
                double tc = d.t[i - 1] + frac * (d.t[i] - d.t[i - 1]);
                if (sustained(d, p, level, i, tc + dwellS)) return tc - d.t0;
            } else if (i == 1 && p[0] >= level && d.t[0] >= d.t0 && sustained(d, p, level, 0, d.t[0] + dwellS)) {
                return d.t[0] - d.t0;                                  // direct feedthrough at t0 (spec allows it)
            }
        }
        return null;
    }

    private static boolean sustained(EventDataset d, double[] p, double level, int from, double until) {
        double lastValid = Double.NaN;
        for (int j = from; j < d.size() && d.t[j] <= until; j++) {
            if (Double.isNaN(p[j])) continue;
            if (p[j] < level) return false;
            lastValid = d.t[j];
        }
        return !Double.isNaN(lastValid) && d.tEnd >= until;             // the dwell must be observed, not assumed
    }
}
```

`ErrorIntegrals.java`:
```java
package com.ams.flink.cplm.response.metrics;

/**
 * Error integrals over VALID held half-open intervals [t_i, t_{i+1}) clipped to [t0, tEnd)
 * (spec §2.5): IAE, ISE, and the exact ITAE 0.5|e|((b-t0)^2 - (a-t0)^2). Invalid samples are
 * excluded, never bridged; the last sample is not extrapolated beyond tEnd.
 */
public final class ErrorIntegrals {
    public static final String METHOD = "HELD_INTERVAL_INTEGRALS_V1";

    public static final class Result {
        public final double iae, ise, itae, validDuration, excludedDuration, coverage;
        Result(double iae, double ise, double itae, double validDuration, double excludedDuration, double coverage) {
            this.iae = iae; this.ise = ise; this.itae = itae; this.validDuration = validDuration; this.excludedDuration = excludedDuration; this.coverage = coverage;
        }
    }

    private ErrorIntegrals() {}

    public static Result over(EventDataset d) {
        double iae = 0, ise = 0, itae = 0, dur = 0;
        for (int i = 0; i < d.size(); i++) {
            double a = Math.max(d.t[i], d.t0);
            double b = Math.min(i + 1 < d.size() ? d.t[i + 1] : d.tEnd, d.tEnd);
            if (b <= a || !d.valid[i]) continue;
            double e = d.r[i] - d.y[i];
            if (!Double.isFinite(e)) continue;
            double w = b - a;
            iae += Math.abs(e) * w;
            ise += e * e * w;
            itae += 0.5 * Math.abs(e) * ((b - d.t0) * (b - d.t0) - (a - d.t0) * (a - d.t0));
            dur += w;
        }
        double elapsed = Math.max(0, d.tEnd - d.t0);
        return new Result(iae, ise, itae, dur, Math.max(0, elapsed - dur), elapsed > 0 ? dur / elapsed : 0);
    }
}
```

`Settling.java`:
```java
package com.ams.flink.cplm.response.metrics;

/**
 * Observed settling (spec §2.5): the earliest instant after which every valid observation stays in
 * the band through the retained event end, with at least the tail dwell observed and no gap
 * longer than maxGapS inside it. OBSERVED_THROUGH_T semantics; a shorter capture is right-censored.
 */
public final class Settling {
    private Settling() {}

    public static double responseBand(double absBandEu, double relBand, double dy, double noiseFloorEu) {
        return Math.max(Math.max(absBandEu, relBand * Math.abs(dy)), noiseFloorEu);
    }

    public static Double responseSettle(EventDataset d, double yss, double band, double tailDwellS, double maxGapS) {
        return settle(d, yss, band, tailDwellS, maxGapS);
    }

    public static Double targetSettle(EventDataset d, double r1, double targetBand, double tailDwellS, double maxGapS) {
        return settle(d, r1, targetBand, tailDwellS, maxGapS);
    }

    private static Double settle(EventDataset d, double centre, double band, double tailDwellS, double maxGapS) {
        int n = d.size();
        int lastValid = -1;
        for (int i = n - 1; i >= 0; i--) if (d.valid[i] && d.t[i] >= d.t0) { lastValid = i; break; }
        if (lastValid < 0) return null;
        // walk back from the end while inside the band; stop at the first violation or an unsupported gap
        int firstInside = -1;
        double prevT = d.t[lastValid];
        for (int i = lastValid; i >= 0 && d.t[i] >= d.t0; i--) {
            if (!d.valid[i]) continue;
            if (prevT - d.t[i] > maxGapS) break;
            if (Math.abs(d.y[i] - centre) > band) break;
            firstInside = i;
            prevT = d.t[i];
        }
        if (firstInside < 0) return null;
        double entry = firstInside == 0 ? d.t[0] : d.t[firstInside];
        if (d.tEnd - entry < tailDwellS) return null;                    // right-censored: not enough observed tail
        return entry - d.t0;
    }
}
```

`Overshoot.java`:
```java
package com.ams.flink.cplm.response.metrics;

import java.util.ArrayList;
import java.util.List;

/**
 * Overshoot / undershoot from direction-normalised progress (valid only when |dy| exceeds the
 * response threshold), the applicable peak, and a decay ratio ONLY from two qualified same-side
 * successive peaks (spec §2.5 - never damping from one peak).
 */
public final class Overshoot {
    public static final class Peaks {
        public final Double overshootPct, undershootPct, peakTimeS, peakValue, decayRatio;
        Peaks(Double o, Double u, Double pt, Double pv, Double dr) { overshootPct = o; undershootPct = u; peakTimeS = pt; peakValue = pv; decayRatio = dr; }
    }

    private Overshoot() {}

    public static Peaks of(EventDataset d, double[] p, double y0, double dy, double minResponseEu) {
        if (Math.abs(dy) < minResponseEu) return new Peaks(null, null, null, null, null);
        double maxP = Double.NEGATIVE_INFINITY, minP = Double.POSITIVE_INFINITY;
        int iMax = -1;
        for (int i = 0; i < d.size(); i++) {
            if (Double.isNaN(p[i]) || d.t[i] < d.t0) continue;
            if (p[i] > maxP) { maxP = p[i]; iMax = i; }
            if (p[i] < minP) minP = p[i];
        }
        if (iMax < 0) return new Peaks(null, null, null, null, null);
        double overshoot = 100.0 * Math.max(0, maxP - 1.0);
        double undershoot = 100.0 * Math.max(0, -minP);
        Double decay = decayRatio(d, p);
        return new Peaks(overshoot, undershoot, d.t[iMax] - d.t0, d.y[iMax], decay);
    }

    /** Local maxima of p above 1 (overshoot excursions above the endpoint): second/first magnitude, if two exist. */
    static Double decayRatio(EventDataset d, double[] p) {
        List<Double> peaks = new ArrayList<>();
        for (int i = 1; i + 1 < d.size(); i++) {
            if (Double.isNaN(p[i]) || Double.isNaN(p[i - 1]) || Double.isNaN(p[i + 1]) || d.t[i] < d.t0) continue;
            if (p[i] > p[i - 1] && p[i] >= p[i + 1] && p[i] > 1.0) peaks.add(p[i] - 1.0);
        }
        if (peaks.size() < 2 || peaks.get(0) <= 0) return null;
        return peaks.get(1) / peaks.get(0);
    }
}
```

`ResponseMetricCalculator.java`:
```java
package com.ams.flink.cplm.response.metrics;

import com.ams.flink.cplm.response.model.Quantity;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Assembles the observed-response quantities of one event (spec §2.5, catalogue groups event/response/performance/qualification). */
public final class ResponseMetricCalculator {
    public static final String METHOD = "OBSERVED_RESPONSE_V1";
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
        q.put("input_step", duApplied == null ? Quantity.unavailable("input_step", "input_EU", "NO_STEP_OR_UNKNOWN_INPUT") : Quantity.of("input_step", duApplied, "input_EU", METHOD));
        boolean refStep = r1 != r0;
        q.put("sp_step", refStep ? Quantity.of("sp_step", r1 - r0, "PV_EU", METHOD) : Quantity.unavailable("sp_step", "PV_EU", "NOT_REFERENCE_STEP"));

        Endpoints.Estimate y0e = Endpoints.baseline(d, s.preSupportS, s.stableBandEu, s.minSamples);
        Endpoints.Estimate ysse = Endpoints.endpoint(d, s.tailDwellS, s.stableBandEu, s.minSamples);
        q.put("baseline_pv", y0e.value == null ? Quantity.unavailable("baseline_pv", "PV_EU", "NO_VALID_BASELINE") : Quantity.of("baseline_pv", y0e.value, "PV_EU", "ROBUST_MEDIAN_PRE_SUPPORT"));
        q.put("endpoint_pv", ysse.value == null ? Quantity.unavailable("endpoint_pv", "PV_EU", "NO_STABLE_ENDPOINT") : Quantity.of("endpoint_pv", ysse.value, "PV_EU", "ROBUST_MEDIAN_STABLE_TAIL"));

        ErrorIntegrals.Result e = ErrorIntegrals.over(d);
        boolean hasRef = e.validDuration > 0;
        q.put("iae", hasRef ? Quantity.of("iae", e.iae, "PV_EU*s", ErrorIntegrals.METHOD) : Quantity.unavailable("iae", "PV_EU*s", "NO_VALID_REFERENCE_SUPPORT"));
        q.put("ise", hasRef ? Quantity.of("ise", e.ise, "PV_EU^2*s", ErrorIntegrals.METHOD) : Quantity.unavailable("ise", "PV_EU^2*s", "NO_VALID_REFERENCE_SUPPORT"));
        q.put("itae", hasRef ? Quantity.of("itae", e.itae, "PV_EU*s^2", ErrorIntegrals.METHOD) : Quantity.unavailable("itae", "PV_EU*s^2", "NO_VALID_REFERENCE_SUPPORT"));
        q.put("mae_time", hasRef ? Quantity.of("mae_time", e.iae / e.validDuration, "PV_EU", ErrorIntegrals.METHOD) : Quantity.unavailable("mae_time", "PV_EU", "NO_VALID_DURATION"));
        q.put("rmse_time", hasRef ? Quantity.of("rmse_time", Math.sqrt(e.ise / e.validDuration), "PV_EU", ErrorIntegrals.METHOD) : Quantity.unavailable("rmse_time", "PV_EU", "NO_VALID_DURATION"));
        q.put("valid_coverage", d.tEnd > d.t0 ? Quantity.of("valid_coverage", e.coverage, "fraction", ErrorIntegrals.METHOD) : Quantity.unavailable("valid_coverage", "fraction", "NO_DECLARED_INTERVAL"));

        if (y0e.value == null || ysse.value == null || Math.abs(ysse.value - y0e.value) < s.minResponseEu) {
            String reason = (y0e.value == null || ysse.value == null) ? "CENSORED_OR_NO_ENDPOINT" : "NO_MEANINGFUL_RESPONSE";
            for (String id : new String[] {"t10", "t50", "t63", "t90", "rise_time_10_90"}) q.put(id, Quantity.unavailable(id, "s", "CENSORED_OR_NO_ENDPOINT"));
            q.put("settle_response", Quantity.unavailable("settle_response", "s", ysse.value == null ? "RIGHT_CENSORED_OR_INTEGRATING_OPEN_LOOP" : "NO_MEANINGFUL_RESPONSE"));
            q.put("settle_target", Quantity.unavailable("settle_target", "s", refStep ? "TARGET_NOT_REACHED_OR_NO_OBJECTIVE" : "TARGET_NOT_REACHED_OR_NO_OBJECTIVE"));
            q.put("overshoot", Quantity.unavailable("overshoot", "% of response change", reason));
            q.put("undershoot", Quantity.unavailable("undershoot", "% of response change", reason));
            q.put("peak_time", Quantity.unavailable("peak_time", "s", "NO_QUALIFIED_PEAK"));
            q.put("peak_pv", Quantity.unavailable("peak_pv", "PV_EU", "INSUFFICIENT_SUPPORT"));
            q.put("steady_error", ysse.value == null || !refStep ? Quantity.unavailable("steady_error", "PV_EU", "NO_STABLE_ENDPOINT") : Quantity.of("steady_error", r1 - ysse.value, "PV_EU", METHOD));
            q.put("decay_ratio", Quantity.unavailable("decay_ratio", "dimensionless", "NO_QUALIFIED_PEAK_PAIR"));
            q.put("servo_gain", Quantity.unavailable("servo_gain", "dimensionless", "NO_REFERENCE_STEP_OR_ENDPOINT"));
            return q;
        }
        double y0 = y0e.value, yss = ysse.value, dy = yss - y0;
        double[] p = Crossings.progress(d, y0, yss);
        Double t10 = Crossings.firstSustained(d, p, 0.10, s.crossingDwellS), t50 = Crossings.firstSustained(d, p, 0.50, s.crossingDwellS);
        Double t63 = Crossings.firstSustained(d, p, 1 - Math.exp(-1), s.crossingDwellS), t90 = Crossings.firstSustained(d, p, 0.90, s.crossingDwellS);
        q.put("t10", time("t10", t10)); q.put("t50", time("t50", t50)); q.put("t63", time("t63", t63)); q.put("t90", time("t90", t90));
        q.put("rise_time_10_90", t10 != null && t90 != null ? Quantity.of("rise_time_10_90", t90 - t10, "s", METHOD) : Quantity.unavailable("rise_time_10_90", "s", "CENSORED_OR_NO_ENDPOINT"));
        double band = Settling.responseBand(s.absSettlingBandEu, s.relSettlingBand, dy, s.noiseFloorEu);
        Double ts = Settling.responseSettle(d, yss, band, s.tailDwellS, s.maxGapS);
        q.put("settle_response", ts == null ? Quantity.unavailable("settle_response", "s", "RIGHT_CENSORED_OR_INTEGRATING_OPEN_LOOP") : Quantity.of("settle_response", ts, "s", "OBSERVED_THROUGH_T"));
        Double tt = refStep ? Settling.targetSettle(d, r1, s.targetBandEu, s.tailDwellS, s.maxGapS) : null;
        q.put("settle_target", tt == null ? Quantity.unavailable("settle_target", "s", "TARGET_NOT_REACHED_OR_NO_OBJECTIVE") : Quantity.of("settle_target", tt, "s", "OBSERVED_THROUGH_T"));
        Overshoot.Peaks pk = Overshoot.of(d, p, y0, dy, s.minResponseEu);
        q.put("overshoot", pk.overshootPct == null ? Quantity.unavailable("overshoot", "% of response change", "NO_MEANINGFUL_RESPONSE") : Quantity.of("overshoot", pk.overshootPct, "% of response change", METHOD));
        q.put("undershoot", pk.undershootPct == null ? Quantity.unavailable("undershoot", "% of response change", "NO_MEANINGFUL_RESPONSE") : Quantity.of("undershoot", pk.undershootPct, "% of response change", METHOD));
        q.put("peak_time", pk.peakTimeS == null ? Quantity.unavailable("peak_time", "s", "NO_QUALIFIED_PEAK") : Quantity.of("peak_time", pk.peakTimeS, "s", METHOD));
        q.put("peak_pv", pk.peakValue == null ? Quantity.unavailable("peak_pv", "PV_EU", "INSUFFICIENT_SUPPORT") : Quantity.of("peak_pv", pk.peakValue, "PV_EU", METHOD));
        q.put("steady_error", refStep ? Quantity.of("steady_error", r1 - yss, "PV_EU", METHOD) : Quantity.unavailable("steady_error", "PV_EU", "NO_STABLE_ENDPOINT"));
        q.put("decay_ratio", pk.decayRatio == null ? Quantity.unavailable("decay_ratio", "dimensionless", "NO_QUALIFIED_PEAK_PAIR") : Quantity.of("decay_ratio", pk.decayRatio, "dimensionless", METHOD));
        q.put("servo_gain", refStep ? Quantity.of("servo_gain", dy / (r1 - r0), "dimensionless", METHOD) : Quantity.unavailable("servo_gain", "dimensionless", "NO_REFERENCE_STEP_OR_ENDPOINT"));
        return q;
    }

    private static Quantity time(String id, Double v) {
        return v == null ? Quantity.unavailable(id, "s", "CENSORED_OR_NO_ENDPOINT") : Quantity.of(id, v, "s", METHOD);
    }
}
```

- [ ] **Step 4: Run** the four test classes → PASS; whole suite → PASS.
- [ ] **Step 5: Commit** `feat(response): observed-response metrics with censoring - endpoints, sustained crossings, exact held-interval integrals, settling, peaks (2A.2)`.

---

### Task 2A.3: Event detection and capture state machine (spec §2.4)

**Files:**
- Create: `response/event/{EventType,ResponseEvent,InputPathResolver,ResponseEventDetector,CaptureStateMachine}.java`
- Test: `test/.../response/event/{ResponseEventDetectorTest,CaptureStateMachineTest}.java`

**Interfaces (produces):**
```java
public enum EventType { SERVO_STEP, CASCADE_SP_STEP, LOAD_RESPONSE, UNMEASURED_DISTURBANCE_RESPONSE, INPUT_TEST, RAMP_TRACKING, ROUTINE_IDENTIFICATION }
public final class ResponseEvent { public final String eventId; public final String loopId; public final EventType type; public final String pathId; public final double t0Ms; public double tEndMs; public final double preAmplitude, postAmplitude; public final List<double[]> inputSequence /* [tMs, value] of every input change inside the capture, never collapsed */; public String captureState; public String censorReason;
  public static String idFor(String loopId, long t0Ms, EventType type, String bundleHash); /* UUID v5 */ }
public final class InputPathResolver { public enum Path { OP_TO_PV, VP_TO_PV, SLAVE_SP_TO_PV, EXOGENOUS_TEST } public static final class Resolution { public final Path path; public final boolean uAppliedAvailable; public final String reason; }
  public static Resolution resolve(String commandPath /* OP_TO_VALVE|OP_TO_VFD|OP_TO_SLAVE_SP|UNKNOWN */, boolean vpMapped, boolean approvedTestRecord); }
public final class ResponseEventDetector { public static final class Settings { double stepMinInputEu, stepMinSpanFraction, span, noiseMultiplier=4, preSupportS, eventDwellS, rampMinSlopeEuPerS, rampMinDurationS; }
  public static final class Candidate { public final EventType type; public final int index; public final double amplitude; }
  public static double trigger(double[] pre, Settings s); /* max(stepMinInputEu, stepMinSpanFraction*span, noiseMultiplier*1.4826*MAD(detrended pre)) */
  public static Candidate detect(double[] t, double[] sp, boolean[] valid, Settings s); }
public final class CaptureStateMachine { public enum State { IDLE, CANDIDATE, CAPTURING, QUALIFIED, ESTIMATING, CANDIDATE_MODEL, VALIDATING, COMPLETE, REJECTED, CENSORED }
  public CaptureStateMachine(double preSupportS, double minCaptureS, double maxCaptureS); public State state(); public String reason(); public List<ResponseEvent> events();
  public void onCandidate(ResponseEvent e, double atS); public void onSample(double atS); public void onNewEvent(ResponseEvent next, double atS) /* SUPERSEDED_BY_EVENT */; public void onModeTransfer(double atS); public void onSourceGap(double atS); public void onHealthIneligible(double atS); public void onBindingOrConfigChange(double atS); public void onRegionExit(double atS); public void onActuatorConstraint(double atS); public void qualified(double atS); public void complete(double atS); }
```

- [ ] **Step 1: Write the failing tests**

`ResponseEventDetectorTest.java`:
```java
package com.ams.flink.cplm.response.event;

import org.junit.Test;

import static org.junit.Assert.*;

public class ResponseEventDetectorTest {
    private static ResponseEventDetector.Settings settings() {
        ResponseEventDetector.Settings s = new ResponseEventDetector.Settings();
        s.stepMinInputEu = 1.0; s.stepMinSpanFraction = 0.01; s.span = 200; s.noiseMultiplier = 4; s.preSupportS = 60; s.eventDwellS = 15;
        s.rampMinSlopeEuPerS = 0.02; s.rampMinDurationS = 60;
        return s;
    }

    private static double[] grid(int n, double dt) { double[] t = new double[n]; for (int i = 0; i < n; i++) t[i] = i * dt; return t; }
    private static boolean[] all(int n) { boolean[] v = new boolean[n]; java.util.Arrays.fill(v, true); return v; }

    @Test
    public void constantInputIsNoEvent() {                                     // NR-006
        double[] t = grid(100, 5); double[] sp = new double[100]; java.util.Arrays.fill(sp, 100);
        assertNull(ResponseEventDetector.detect(t, sp, all(100), settings()));
    }

    @Test
    public void noiseBelowTheTriggerIsNoEvent() {
        double[] t = grid(120, 5); double[] sp = new double[120];
        java.util.Random rnd = new java.util.Random(7);
        for (int i = 0; i < 120; i++) sp[i] = 100 + 0.2 * rnd.nextGaussian();
        assertNull(ResponseEventDetector.detect(t, sp, all(120), settings()));
        assertTrue(ResponseEventDetector.trigger(java.util.Arrays.copyOf(sp, 12), settings()) >= 2.0);   // max(1, 2, 4*1.4826*MAD)
    }

    @Test
    public void aHeldStepIsAServoStepWithItsAmplitude() {
        double[] t = grid(60, 5); double[] sp = new double[60];
        for (int i = 0; i < 60; i++) sp[i] = t[i] < 100 ? 100 : 115;
        ResponseEventDetector.Candidate c = ResponseEventDetector.detect(t, sp, all(60), settings());
        assertNotNull(c);
        assertEquals(EventType.SERVO_STEP, c.type);
        assertEquals(20, c.index);
        assertEquals(15.0, c.amplitude, 1e-9);
    }

    @Test
    public void aStepThatDoesNotPersistIsNoEvent() {
        double[] t = grid(60, 5); double[] sp = new double[60];
        for (int i = 0; i < 60; i++) sp[i] = (t[i] >= 100 && t[i] < 110) ? 115 : 100;   // 10 s blip < 15 s dwell
        assertNull(ResponseEventDetector.detect(t, sp, all(60), settings()));
    }

    @Test
    public void aSustainedRampIsRampTrackingNotAStep() {
        double[] t = grid(120, 5); double[] sp = new double[120];
        for (int i = 0; i < 120; i++) sp[i] = t[i] < 100 ? 100 : 100 + 0.05 * (t[i] - 100);   // 0.05 EU/s for 500 s
        ResponseEventDetector.Candidate c = ResponseEventDetector.detect(t, sp, all(120), settings());
        assertNotNull(c);
        assertEquals(EventType.RAMP_TRACKING, c.type);
    }
}
```

`CaptureStateMachineTest.java`:
```java
package com.ams.flink.cplm.response.event;

import org.junit.Test;

import java.util.Collections;

import static org.junit.Assert.*;

public class CaptureStateMachineTest {
    private static ResponseEvent step(String loop, double t0S) {
        return new ResponseEvent(ResponseEvent.idFor(loop, (long) (t0S * 1000), EventType.SERVO_STEP, "profile:abc"), loop, EventType.SERVO_STEP, "OP_TO_PV",
                t0S * 1000, 100, 115, Collections.singletonList(new double[] {t0S * 1000, 115}));
    }

    @Test
    public void aSecondStepCensorsTheFirstAndKeepsBothRecords() {              // NR-007
        CaptureStateMachine m = new CaptureStateMachine(60, 120, 3600);
        m.onCandidate(step("FIC10302", 100), 100);
        m.onSample(120);
        assertEquals(CaptureStateMachine.State.CAPTURING, m.state());
        m.onNewEvent(step("FIC10302", 130), 130);
        assertEquals(2, m.events().size());
        ResponseEvent first = m.events().get(0), second = m.events().get(1);
        assertEquals("CENSORED", first.captureState);
        assertEquals("SUPERSEDED_BY_EVENT", first.censorReason);
        assertEquals(130 * 1000, first.tEndMs, 1e-9);
        assertEquals(CaptureStateMachine.State.CAPTURING, m.state());
        assertEquals(2, second.inputSequence.size());                          // the real input sequence is preserved
        assertEquals(130 * 1000, second.inputSequence.get(1)[0], 1e-9);
    }

    @Test
    public void modeTransferAndHealthIneligibilityCensorWithTheirReasons() {   // NR-043 (health), mode transfer
        CaptureStateMachine m = new CaptureStateMachine(60, 120, 3600);
        m.onCandidate(step("L", 0), 0);
        m.onModeTransfer(30);
        assertEquals(CaptureStateMachine.State.CENSORED, m.state());
        assertEquals("MODE_TRANSFER", m.events().get(0).censorReason);

        CaptureStateMachine h = new CaptureStateMachine(60, 120, 3600);
        h.onCandidate(step("L", 0), 0);
        h.onHealthIneligible(45);
        assertEquals("HEALTH_INELIGIBLE", h.events().get(0).censorReason);
    }

    @Test
    public void theMaximumCaptureGuardCensorsAndNeverTruncatesSilently() {     // NR-017
        CaptureStateMachine m = new CaptureStateMachine(60, 120, 3600);
        m.onCandidate(step("TIC", 0), 0);
        m.onSample(3599);
        assertEquals(CaptureStateMachine.State.CAPTURING, m.state());
        m.onSample(3601);
        assertEquals(CaptureStateMachine.State.CENSORED, m.state());
        assertEquals("CAPTURE_MAX", m.events().get(0).censorReason);
    }

    @Test
    public void theHappyPathReachesCompleteOnlyThroughQualification() {
        CaptureStateMachine m = new CaptureStateMachine(60, 120, 3600);
        m.onCandidate(step("L", 0), 0);
        m.onSample(200);
        m.qualified(200);
        assertEquals(CaptureStateMachine.State.QUALIFIED, m.state());
        m.complete(300);
        assertEquals(CaptureStateMachine.State.COMPLETE, m.state());
        assertEquals("COMPLETE", m.events().get(0).captureState);
        try { new CaptureStateMachine(60, 120, 3600).complete(10); fail("COMPLETE without an event is illegal"); } catch (IllegalStateException expected) { }
    }

    @Test
    public void eventIdsAreDeterministic() {
        assertEquals(ResponseEvent.idFor("L", 1000, EventType.SERVO_STEP, "b"), ResponseEvent.idFor("L", 1000, EventType.SERVO_STEP, "b"));
        assertNotEquals(ResponseEvent.idFor("L", 1000, EventType.SERVO_STEP, "b"), ResponseEvent.idFor("L", 1000, EventType.SERVO_STEP, "c"));
    }

    @Test
    public void inputPathsRequireAnAppliedInput() {
        InputPathResolver.Resolution r = InputPathResolver.resolve("OP_TO_SLAVE_SP", false, false);
        assertEquals(InputPathResolver.Path.SLAVE_SP_TO_PV, r.path);
        assertFalse("a cascade master OP is not a valve command", r.uAppliedAvailable);
        assertEquals(InputPathResolver.Path.VP_TO_PV, InputPathResolver.resolve("OP_TO_VALVE", true, false).path);
        assertEquals(InputPathResolver.Path.EXOGENOUS_TEST, InputPathResolver.resolve("OP_TO_VALVE", true, true).path);
        assertFalse(InputPathResolver.resolve("UNKNOWN", false, false).uAppliedAvailable);
    }
}
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**

`EventType.java`:
```java
package com.ams.flink.cplm.response.event;

/** Spec v6 §2.4 event vocabulary. */
public enum EventType { SERVO_STEP, CASCADE_SP_STEP, LOAD_RESPONSE, UNMEASURED_DISTURBANCE_RESPONSE, INPUT_TEST, RAMP_TRACKING, ROUTINE_IDENTIFICATION }
```

`ResponseEvent.java`:
```java
package com.ams.flink.cplm.response.event;

import com.ams.flink.cplm.identity.RunIdentity;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

/** One response event with its capture lifecycle; the input sequence inside the capture is retained, never collapsed (NR-007). */
public final class ResponseEvent implements Serializable {
    private static final long serialVersionUID = 1L;
    public final String eventId;
    public final String loopId;
    public final EventType type;
    public final String pathId;
    public final double t0Ms;
    public double tEndMs;
    public final double preAmplitude, postAmplitude;
    public final List<double[]> inputSequence;
    public String captureState = "CANDIDATE";
    public String censorReason = "";

    public ResponseEvent(String eventId, String loopId, EventType type, String pathId, double t0Ms, double preAmplitude, double postAmplitude, List<double[]> inputSequence) {
        this.eventId = eventId; this.loopId = loopId; this.type = type; this.pathId = pathId; this.t0Ms = t0Ms; this.tEndMs = Double.NaN;
        this.preAmplitude = preAmplitude; this.postAmplitude = postAmplitude; this.inputSequence = new ArrayList<>(inputSequence);
    }

    /** Deterministic: the same loop, instant, type and configuration name the same event on every run. */
    public static String idFor(String loopId, long t0Ms, EventType type, String bundleHash) {
        return RunIdentity.uuidV5(RunIdentity.NAMESPACE, "event|" + loopId + "|" + t0Ms + "|" + type + "|" + bundleHash).toString();
    }
}
```
(`RunIdentity.uuidV5(UUID, String)` and `RunIdentity.NAMESPACE` exist from 1G.2; if the names differ in the code, use the existing static v5 helper — do not add a second implementation.)

`InputPathResolver.java`:
```java
package com.ams.flink.cplm.response.event;

/** Which applied input a path model may be fitted against (spec §2.3). A cascade master's OP is a set-point for the slave, never a valve command. */
public final class InputPathResolver {
    public enum Path { OP_TO_PV, VP_TO_PV, SLAVE_SP_TO_PV, EXOGENOUS_TEST }

    public static final class Resolution {
        public final Path path;
        public final boolean uAppliedAvailable;
        public final String reason;
        Resolution(Path path, boolean uAppliedAvailable, String reason) { this.path = path; this.uAppliedAvailable = uAppliedAvailable; this.reason = reason; }
    }

    private InputPathResolver() {}

    public static Resolution resolve(String commandPath, boolean vpMapped, boolean approvedTestRecord) {
        String cp = commandPath == null ? "UNKNOWN" : commandPath;
        if (approvedTestRecord) return new Resolution(Path.EXOGENOUS_TEST, true, "APPROVED_TEST_RECORD");
        switch (cp) {
            case "OP_TO_SLAVE_SP": return new Resolution(Path.SLAVE_SP_TO_PV, false, "CASCADE_MASTER_OP_IS_NOT_AN_APPLIED_INPUT");
            case "OP_TO_VALVE": case "OP_TO_VFD":
                return vpMapped ? new Resolution(Path.VP_TO_PV, true, "VP_IS_THE_APPLIED_INPUT") : new Resolution(Path.OP_TO_PV, true, "OP_ASSUMED_APPLIED");
            default: return new Resolution(Path.OP_TO_PV, false, "COMMAND_PATH_UNKNOWN");
        }
    }
}
```

`ResponseEventDetector.java`:
```java
package com.ams.flink.cplm.response.event;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Safe triggering (spec §2.4): a reference change counts only when it exceeds
 * max(step_min_input_EU, step_min_span_fraction x span, noise_multiplier x 1.4826 x MAD(detrended pre-window)),
 * the pre-window is stable, and the new level persists for event_dwell_s. A persistent slope is a ramp, not a step.
 */
public final class ResponseEventDetector {
    public static final class Settings {
        public double stepMinInputEu = 1.0, stepMinSpanFraction = 0.01, span = 100, noiseMultiplier = 4, preSupportS = 60, eventDwellS = 15;
        public double rampMinSlopeEuPerS = 0.02, rampMinDurationS = 60;
    }

    public static final class Candidate {
        public final EventType type;
        public final int index;
        public final double amplitude;
        Candidate(EventType type, int index, double amplitude) { this.type = type; this.index = index; this.amplitude = amplitude; }
    }

    private ResponseEventDetector() {}

    public static double trigger(double[] pre, Settings s) {
        double noise = pre.length >= 4 ? 1.4826 * mad(detrend(pre)) : 0;
        return Math.max(Math.max(s.stepMinInputEu, s.stepMinSpanFraction * s.span), s.noiseMultiplier * noise);
    }

    public static Candidate detect(double[] t, double[] sp, boolean[] valid, Settings s) {
        int n = t.length;
        for (int i = 1; i < n; i++) {
            if (!valid[i] || !valid[i - 1]) continue;
            int preFrom = i - 1;
            while (preFrom > 0 && t[i - 1] - t[preFrom - 1] <= s.preSupportS) preFrom--;
            double[] pre = slice(sp, valid, preFrom, i);
            if (pre.length < 2) continue;
            double level = median(pre);
            double trig = trigger(pre, s);
            // step: the level after i exceeds the trigger and persists for eventDwellS
            double after = sp[i];
            if (Math.abs(after - level) >= trig && persists(t, sp, valid, i, after, trig / 2, s.eventDwellS)) {
                if (isRamp(t, sp, valid, i, s)) return new Candidate(EventType.RAMP_TRACKING, i, after - level);
                return new Candidate(EventType.SERVO_STEP, i, after - level);
            }
            // ramp: sustained slope from i over rampMinDurationS
            if (isRamp(t, sp, valid, i, s) && Math.abs(sp[lastWithin(t, i, s.rampMinDurationS)] - level) >= trig) {
                return new Candidate(EventType.RAMP_TRACKING, i, sp[lastWithin(t, i, s.rampMinDurationS)] - level);
            }
        }
        return null;
    }

    private static boolean persists(double[] t, double[] sp, boolean[] valid, int from, double level, double tol, double dwellS) {
        double until = t[from] + dwellS;
        boolean covered = false;
        for (int j = from; j < t.length && t[j] <= until; j++) {
            if (!valid[j]) continue;
            if (Math.abs(sp[j] - level) > tol) return false;
            covered = t[j] >= until - 1e-9 || j == t.length - 1 && t[j] >= until;
        }
        return covered || t[t.length - 1] >= until;
    }

    private static boolean isRamp(double[] t, double[] sp, boolean[] valid, int from, Settings s) {
        int last = lastWithin(t, from, s.rampMinDurationS);
        if (t[last] - t[from] < s.rampMinDurationS * 0.9) return false;
        double slope = (sp[last] - sp[from]) / (t[last] - t[from]);
        if (Math.abs(slope) < s.rampMinSlopeEuPerS) return false;
        for (int j = from + 1; j <= last; j++) {                                // monotone progress along the ramp
            if (!valid[j]) continue;
            double expected = sp[from] + slope * (t[j] - t[from]);
            if (Math.abs(sp[j] - expected) > Math.max(0.2 * Math.abs(sp[last] - sp[from]), 1e-9)) return false;
        }
        return true;
    }

    private static int lastWithin(double[] t, int from, double horizonS) {
        int last = from;
        while (last + 1 < t.length && t[last + 1] - t[from] <= horizonS) last++;
        return last;
    }

    private static double[] slice(double[] x, boolean[] valid, int from, int to) {
        List<Double> v = new ArrayList<>();
        for (int i = from; i < to; i++) if (valid[i]) v.add(x[i]);
        double[] r = new double[v.size()];
        for (int i = 0; i < r.length; i++) r[i] = v.get(i);
        return r;
    }

    static double[] detrend(double[] x) {
        int n = x.length; double sx = 0, sy = 0, sxx = 0, sxy = 0;
        for (int i = 0; i < n; i++) { sx += i; sy += x[i]; sxx += (double) i * i; sxy += i * x[i]; }
        double den = n * sxx - sx * sx;
        double b = den == 0 ? 0 : (n * sxy - sx * sy) / den, a = (sy - b * sx) / n;
        double[] r = new double[n];
        for (int i = 0; i < n; i++) r[i] = x[i] - (a + b * i);
        return r;
    }

    static double mad(double[] x) {
        double m = median(x);
        double[] dev = new double[x.length];
        for (int i = 0; i < x.length; i++) dev[i] = Math.abs(x[i] - m);
        return median(dev);
    }

    static double median(double[] x) {
        List<Double> s = new ArrayList<>();
        for (double v : x) s.add(v);
        Collections.sort(s);
        int n = s.size();
        return n % 2 == 1 ? s.get(n / 2) : 0.5 * (s.get(n / 2 - 1) + s.get(n / 2));
    }
}
```

`CaptureStateMachine.java`:
```java
package com.ams.flink.cplm.response.event;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * IDLE -> CANDIDATE -> CAPTURING -> QUALIFIED -> ESTIMATING -> CANDIDATE_MODEL -> VALIDATING -> COMPLETE,
 * or REJECTED / CENSORED (spec §2.4). Segmentation triggers censor the open capture with a named
 * reason and, for a new event, start the next capture with the real input sequence carried over.
 * The maximum-duration guard censors (CAPTURE_MAX); nothing is ever truncated silently (NR-017).
 */
public final class CaptureStateMachine {
    public enum State { IDLE, CANDIDATE, CAPTURING, QUALIFIED, ESTIMATING, CANDIDATE_MODEL, VALIDATING, COMPLETE, REJECTED, CENSORED }

    private final double preSupportS, minCaptureS, maxCaptureS;
    private final List<ResponseEvent> events = new ArrayList<>();
    private State state = State.IDLE;
    private String reason = "";
    private ResponseEvent open;

    public CaptureStateMachine(double preSupportS, double minCaptureS, double maxCaptureS) {
        this.preSupportS = preSupportS; this.minCaptureS = minCaptureS; this.maxCaptureS = maxCaptureS;
    }

    public State state() { return state; }
    public String reason() { return reason; }
    public List<ResponseEvent> events() { return Collections.unmodifiableList(events); }
    public ResponseEvent open() { return open; }

    public void onCandidate(ResponseEvent e, double atS) {
        if (open != null) { onNewEvent(e, atS); return; }
        open = e;
        e.captureState = "CANDIDATE";
        events.add(e);
        state = State.CANDIDATE;
        reason = "";
    }

    public void onSample(double atS) {
        if (open == null) return;
        double elapsed = atS - open.t0Ms / 1000.0;
        if (elapsed > maxCaptureS) { censor("CAPTURE_MAX", atS); return; }
        if (state == State.CANDIDATE && elapsed >= 0) { state = State.CAPTURING; open.captureState = "CAPTURING"; }
    }

    public void onNewEvent(ResponseEvent next, double atS) {
        List<double[]> carried = new ArrayList<>();
        if (open != null) {
            carried.addAll(open.inputSequence);
            censor("SUPERSEDED_BY_EVENT", atS);
        }
        for (double[] change : next.inputSequence) if (carried.stream().noneMatch(c -> c[0] == change[0])) carried.add(change);
        ResponseEvent merged = new ResponseEvent(next.eventId, next.loopId, next.type, next.pathId, next.t0Ms, next.preAmplitude, next.postAmplitude, carried);
        open = merged;
        merged.captureState = "CAPTURING";
        events.add(merged);
        state = State.CAPTURING;
        reason = "";
    }

    public void onModeTransfer(double atS) { censor("MODE_TRANSFER", atS); }
    public void onSourceGap(double atS) { censor("SOURCE_GAP", atS); }
    public void onHealthIneligible(double atS) { censor("HEALTH_INELIGIBLE", atS); }
    public void onBindingOrConfigChange(double atS) { censor("CONTEXT_CHANGED", atS); }
    public void onRegionExit(double atS) { censor("REGION_EXIT", atS); }
    public void onActuatorConstraint(double atS) { censor("ACTUATOR_CONSTRAINT", atS); }

    public void qualified(double atS) {
        requireOpen();
        if (atS - open.t0Ms / 1000.0 < minCaptureS) { reject("CAPTURE_TOO_SHORT", atS); return; }
        state = State.QUALIFIED; open.captureState = "QUALIFIED";
    }

    public void estimating() { requireOpen(); state = State.ESTIMATING; open.captureState = "ESTIMATING"; }
    public void candidateModel() { requireOpen(); state = State.CANDIDATE_MODEL; open.captureState = "CANDIDATE_MODEL"; }
    public void validating() { requireOpen(); state = State.VALIDATING; open.captureState = "VALIDATING"; }

    public void complete(double atS) {
        requireOpen();
        open.tEndMs = atS * 1000.0;
        open.captureState = "COMPLETE";
        state = State.COMPLETE;
        open = null;
    }

    public void reject(String why, double atS) {
        requireOpen();
        open.tEndMs = atS * 1000.0; open.captureState = "REJECTED"; open.censorReason = why;
        state = State.REJECTED; reason = why; open = null;
    }

    private void censor(String why, double atS) {
        if (open == null) return;
        open.tEndMs = atS * 1000.0; open.captureState = "CENSORED"; open.censorReason = why;
        state = State.CENSORED; reason = why; open = null;
    }

    private void requireOpen() { if (open == null) throw new IllegalStateException("no open capture"); }
}
```

- [ ] **Step 4: Run** → PASS; whole suite → PASS.
- [ ] **Step 5: Commit** `feat(response): safe event triggering and the capture state machine with named censoring (2A.3)`.

---

## Self-review

- **Spec coverage:** §2.5 equations (progress, sustained crossings, Bresp, OBSERVED_THROUGH_T, overshoot/undershoot, decay ratio from same-side peaks, Kservo, exact ITAE, coverage) → 2A.2; §2.6 model bank + ordering + integrating rules → 2A.1; §2.7 exact ZOH, fractional delay, gap policy, repeated poles → 2A.1; §2.4 triggering/persistence/ramp vs step/segmentation/max capture → 2A.3; §2.11 numbers pinned in tests (t10 6.1072, t90 50.0517, tr 43.9445, 2 % settling ≈ 82.24, LIC slope 0.010→0.030 m/min). NR-001/002/003(sim)/006/007/008/009/013/017 covered; NR-004/005/010/011/012/014/015/016 belong to part 2 and 2B/2G.
- **Placeholder scan:** none; every step has code.
- **Type consistency:** `EventDataset(t,y,r,u,valid,t0,tEnd)` used identically by all metric classes; `Quantity.of/unavailable` signatures match; `ZohSimulator.simulate(model,t,u,u0,y0,v0,t0,maxBridgeS)` used by the tests and by part 2's estimators; `ResponseEvent.idFor` relies on the 1G.2 v5 helper (verify the exact method name before Step 3 of 2A.3).
