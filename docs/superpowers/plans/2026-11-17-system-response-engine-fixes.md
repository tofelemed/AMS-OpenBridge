# System Response engine fixes (no SME needed) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the System Response engine gaps that need no SME decision: PV-range scaling, even time grid for
closed-loop identification, textbook decay ratio, valve-at-limit and region censors, model family from the declared
behaviour, and the 95 % prediction band.

**Architecture:** All engine changes live in the Flink job `CplmResponseAnalysisJob` (package
`com.ams.flink.cplm.response`). Range-dependent tolerances move into one helper, `ResponseScale`, fed by the loop's
declared ranges carried on `ResponseJobConfig`. Only Task 4 touches the frontend (two censor-reason labels).

**Tech Stack:** Java 11, Flink 1.18, JUnit 4 (existing tests), Maven in Docker; React/TypeScript labels in
`src/frontend-ob`.

**Spec:** `docs/system-response-fixes-for-sme.md` (items 2, 3, 5a, 6, 7). Background rules:
`docs/system-response-concepts.md`.

## Global Constraints

- Worktree `D:/HMI_Project_Usama/AMS-open-sr-engine`, branch `feat/sr-engine-fixes` (from `feat/cpa-redesign` 4ba3204a).
- Test command (the only docker command an implementer may run), from Git Bash:
  `MSYS_NO_PATHCONV=1 docker run --rm -v "D:/HMI_Project_Usama/AMS-open-sr-engine/src/flink:/build" -v ams-m2:/root/.m2 -w /build maven:3.9-eclipse-temurin-11 mvn -q test -Dtest='<Class>' -Dsurefire.failIfNoSpecifiedTests=false`
  Whole response package: `-Dtest='com.ams.flink.cplm.response.**.*Test'` (baseline: 87 tests, 0 failures).
- A loop with no declared PV range, or with no new input, behaves exactly as today (same events, same values).
- Values set explicitly by a governing bundle (`G12.step_min_input_eu`, `G12.settling_abs_band_pv_eu`,
  `G12.gain_abs_max`) are in the loop's own units and are never scaled.
- Files stay under 500 lines (CLAUDE.md); new logic goes into small helpers, not into `ResponseCapture`.
- One CHG per task: Task 1 CHG-204, Task 2 CHG-205, Task 3 CHG-206, Task 4 CHG-207, Task 5 CHG-208, Task 6 CHG-209.
  Commit subject `feat(cplm): CHG-20N <summary>`, body ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never stage `prod_decision.md` or `changes_tracker.md` (the controller writes them in Task 7).
- No change to any other gate or job.

## Review Focus

1. A declared range with span ≤ 0, NaN or infinite (bad registry data) must fall back to today's values — Task 1 test `invalidSpanFallsBackToTodaysValues`.
2. A range edit while an event is open must not drop that event; the new ranges apply from the next event — Task 1 test `rangeChangeWhileEventOpenKeepsCapture`.
3. A region with only one finite bound must still censor on that bound — Task 4 test `regionWithOneFiniteBoundCensors`.
4. An event with no usable pre-step samples (noise unknown) must still get metrics; the noise term is then ignored — Task 1 test `noPreStepSamplesIgnoresNoiseTerm`, Task 3 test `unknownNoiseUsesBandOnly`.
5. Flink state: `ResponseCapture` and `ResponseJobConfig` sit in keyed state (Kryo). New fields change the
   serialized form, so the jar is deployed by cancelling and resubmitting the job without state, as every engine
   release is. Task 7 records this in the release notes; no test.

---

### Task 1: Scale PV-side tolerances with the loop's PV range (CHG-204, spec item 3)

**Files:**
- Create: `src/flink/src/main/java/com/ams/flink/cplm/response/ResponseScale.java`
- Modify: `src/flink/src/main/java/com/ams/flink/cplm/response/ResponseJobConfig.java` (fields, `copy()`, `underBundle()`, `bundleHash()`)
- Modify: `src/flink/src/main/java/com/ams/flink/cplm/response/CplmResponseAnalysisJob.java` (`captureFor`)
- Modify: `src/flink/src/main/java/com/ams/flink/cplm/response/ResponseCapture.java` (`detectorSettings`, `supersedeOnChange`, `settled`)
- Modify: `src/flink/src/main/java/com/ams/flink/cplm/response/ResponseEvaluator.java` (metric settings, validator noise floor, estimator gain bound)
- Test: `src/flink/src/test/java/com/ams/flink/cplm/response/ResponseScaleTest.java` (new), `ResponseCaptureEvaluatorTest.java`, `CplmResponseAnalysisJobTest.java`

**Interfaces:**
- Produces on `ResponseJobConfig`: `public double pvSpanEu = Double.NaN;` `public double settleNoiseMultiplier = 1.5;`
  `public java.util.Set<String> bundleEuKeys` (bundle keys among the three EU keys above that the bundle set; empty by default);
  `public ResponseJobConfig withProfileRanges(CplmLoopDynamicsProfile p)` (copy; `p == null` → copy unchanged; `pvSpanEu` = `pvEngMax − pvEngMin` when `p.pvRangeDeclared` and the span is finite and > 0, else NaN);
  `public boolean sameRanges(ResponseJobConfig other)`.
- Produces `ResponseScale`:
  `static ResponseScale of(ResponseJobConfig cfg)`; `double k()` (span/100 when declared, else 1);
  `double refStepFloorEu()`; `double rampMinSlopeEuPerS()`; `double stableBandEu(double preRangeEu)`;
  `double noiseFloorEu(double preRangeEu)`; `double absSettlingBandEu()`; `double minResponseEu()`;
  `double targetBandEu()`; `double gainAbsMax()`;
  `static double preStepRange(double[] t, double[] y, boolean[] valid, double t0S, double windowS)` (max − min of valid y in `[t0S − windowS, t0S)`, NaN when fewer than 3 valid samples).
- Values (k as above; a NaN `preRangeEu` contributes nothing):

| Method | Declared span | Undeclared |
|---|---|---|
| `refStepFloorEu()` | `stepMinSpanFraction × span` | `max(stepMinInputEu, stepMinSpanFraction × fallbackSpanEu)` (today) |
| `rampMinSlopeEuPerS()` | `rampMinSlopeEuPerS × k` | today |
| `stableBandEu(pre)` | `max(stableBandEu × k, settleNoiseMultiplier × pre)` | `max(stableBandEu, settleNoiseMultiplier × pre)` |
| `noiseFloorEu(pre)` | `max(noiseFloorEu × k, 0.5 × settleNoiseMultiplier × pre)` | `max(noiseFloorEu, 0.5 × settleNoiseMultiplier × pre)` |
| `absSettlingBandEu()`, `minResponseEu()`, `targetBandEu()`, `gainAbsMax()` | value × k | today |

  A field whose key is in `bundleEuKeys` is returned unscaled (`step_min_input_eu` → the floor stays
  `max(stepMinInputEu, stepMinSpanFraction × span)`; `settling_abs_band_pv_eu` → abs band; `gain_abs_max` → gain bound).
- The noise term in `stableBandEu`/`noiseFloorEu` applies whether or not a span is declared: it is the spec's
  "or within its normal noise band, if that is wider". Ruling recorded here: undeclared loops on a quiet signal
  (pre-step range below 0.33) are unchanged; noisy undeclared loops become able to settle.

- [ ] **Step 1: Write the failing tests** in `ResponseScaleTest`:
  `undeclaredSpanKeepsTodaysValues` (refStep 1.0, ramp 0.02, stableBandEu(NaN) 0.5, noiseFloorEu(NaN) 0.05, abs 0.1, minResponse 0.5, target 0.5, gain 1e3);
  `span100EqualsToday` (same values with pvSpanEu 100);
  `span6ScalesDown` (refStep 0.06, ramp 0.0012, stableBandEu(NaN) 0.03, minResponse 0.03, abs 0.006);
  `span1800ScalesUp` (refStep 18.0, stableBandEu(NaN) 9.0, gain 18000);
  `noiseBandWidensSettle` (span 1800, pre 20 → stableBandEu 30.0, noiseFloorEu 15.0);
  `invalidSpanFallsBackToTodaysValues` (profile pvRangeDeclared with spans 0, −5, NaN → pvSpanEu NaN, values as undeclared);
  `noPreStepSamplesIgnoresNoiseTerm` (`preStepRange` of 2 samples is NaN; stableBandEu(NaN) = stableBandEu × k);
  `bundleEuValueIsNotScaled` (bundle sets `G12.settling_abs_band_pv_eu` = 0.2, span 1800 → abs 0.2).
- [ ] **Step 2: Write the failing capture tests** in `ResponseCaptureEvaluatorTest`, using the file's existing sample builders:
  `smallSpanLoopCapturesSetpointStepBelowOneUnit` (span 0–6, SP 3.0→3.5 after 150 s quiet, PV follows → a SERVO_STEP event opens; today none);
  `inputStepThresholdUnchangedBySpan` (span 0–6, OP 40.0→40.8 → no INPUT_TEST; OP 40→41.5 → INPUT_TEST);
  `largeSpanNoisyFlowLoopSettles` (span 0–1800, PV noise uniform ±3, OP step 40→50 giving a first-order PV rise of 100 with τ 60 s → the capture closes COMPLETE; today it never settles);
  `rangeChangeWhileEventOpenKeepsCapture` (in `CplmResponseAnalysisJobTest`: `captureFor` with a changed span while the capture is not idle returns the same capture; when idle it returns a new capture with the new `pvSpanEu`).
- [ ] **Step 3: Run the tests to see them fail.** `-Dtest='ResponseScaleTest,ResponseCaptureEvaluatorTest,CplmResponseAnalysisJobTest'` → compilation failure / assertion failures on the new tests only.
- [ ] **Step 4: Implement.** `ResponseScale` per the table. `ResponseJobConfig`: the new fields, `copy()` copies them, `underBundle` records `bundleEuKeys` from the `g12Values` keys, and `bundleHash()` appends `"|" + pvSpanEu + "|" + settleNoiseMultiplier` to the canonical string. `captureFor`: `settings = (hash == null ? cfg : cfg.underBundle(...)).withProfileRanges(s.resolvedProfile)`; keep the current capture when it is not idle; replace an idle capture when the bundle hash differs **or** `!sameRanges`. `ResponseCapture`: two detector settings, reference (span = PV span when declared, floor and ramp from `ResponseScale`) and input (today's values, span `fallbackSpanEu`); `supersedeOnChange` uses the reference floor for reference events and today's threshold for input tests; `settled()` computes `preStepRange` from the ring's good PV samples in `[t0 − preSupportS, t0)` and uses `stableBandEu(pre)` for the tail range and `noiseFloorEu(pre)` in `Settling.responseBand`. `ResponseEvaluator`: metric settings take `absSettlingBandEu()`, `minResponseEu()`, `targetBandEu()` and `noiseFloorEu(pre)` (pre from the event dataset, same window), `ModelValidator.validate` takes `noiseFloorEu(NaN)`, estimator settings take `gainAbsMax()`.
- [ ] **Step 5: Run the whole response package.** Expected: all tests pass, 87 old plus the new ones.
- [ ] **Step 6: Commit.** `git add` the six files and three test files; message `feat(cplm): CHG-204 scale System Response tolerances with the loop's PV range`.

### Task 2: Even time grid before the closed-loop method (CHG-205, spec item 5a)

**Files:**
- Modify: `src/flink/src/main/java/com/ams/flink/cplm/response/metrics/EventDataset.java`
- Modify: `src/flink/src/main/java/com/ams/flink/cplm/response/estimation/ModelEstimator.java` (interface) and `ClosedLoopPemEstimator.java`
- Modify: `src/flink/src/main/java/com/ams/flink/cplm/response/ResponseEvaluator.java` (resample before estimating; D output)
- Test: `src/flink/src/test/java/com/ams/flink/cplm/response/metrics/EventDatasetTest.java` (new or existing), `estimation/ClosedLoopPemEstimatorTest.java`, `ResponseCaptureEvaluatorTest.java`

**Interfaces:**
- Produces on `EventDataset`: `boolean isUniform(double relTol)`; `double medianDt()`;
  `EventDataset resampledUniform(double ts)`: grid `t0Grid = t[0]`, step `ts`, up to `t[n−1]`; **y linear**
  interpolation; **r, u, v zero-order hold** (they are piecewise-constant DCS commands); `valid` true only when
  both neighbours are valid; `t0` and `tEnd` unchanged.
- Produces on `ModelEstimator`: `default boolean requiresUniformGrid() { return false; }`; `ClosedLoopPemEstimator` returns true.
- Evaluator: when `estimator.requiresUniformGrid() && !c.data.isUniform(1e-6)`, estimate on
  `c.data.resampledUniform(c.data.medianDt())` and write `resampled_grid_s` (the ts) into subgate D outputs. Metrics,
  evidence and validation keep the original samples. `NON_UNIFORM_GRID` stays in the estimator as a guard.

- [ ] **Step 1: Failing tests.** `resampleUniformInterpolatesPvAndHoldsInputs` (t 0,4,10,15; y 0,4,10,15; u 1,1,2,2 → ts 5: t 0,5,10,15; y 0,5,10,15; u 1,1,2,2); `medianDtOfJitteredGrid` (Δt 4,6,5,5,4 → 5.0); `jitteredServoStepIsEstimated` (an FOPDT servo-step event from the existing closed-loop simulation helper, timestamps jittered uniformly 4–6 s → D state `ESTIMATED`, gain within 20 % of truth, `resampled_grid_s` ≈ the median spacing); `uniformServoStepIsNotResampled` (no `resampled_grid_s`).
- [ ] **Step 2: Run, expect failures** on the new tests only.
- [ ] **Step 3: Implement** per the Interfaces block.
- [ ] **Step 4: Run the response package.** All pass.
- [ ] **Step 5: Commit** `feat(cplm): CHG-205 put servo-step samples on an even time grid before closed-loop identification`.

### Task 3: Decay ratio by the textbook definition (CHG-206, spec item 7a)

**Files:**
- Modify: `src/flink/src/main/java/com/ams/flink/cplm/response/metrics/Overshoot.java`
- Modify: `src/flink/src/main/java/com/ams/flink/cplm/response/ResponseScale.java` (noise helper)
- Modify: the `Overshoot.of` caller in `ResponseEvaluator` (or the metrics class that calls it)
- Test: `src/flink/src/test/java/com/ams/flink/cplm/response/metrics/OvershootTest.java` (new or existing)

**Interfaces:**
- Consumes: `ResponseScale` (Task 1).
- Produces: `static double ResponseScale.preStepNoiseSigma(double[] t, double[] y, boolean[] valid, double t0S, double windowS)` = 1.4826 × MAD of valid y in the window, NaN when fewer than 3 samples;
  `Overshoot.of(EventDataset d, double[] p, double y0, double dy, double minResponseEu, double bandEu, double noiseEu)` (old overloads delegate with `noiseEu = 0`);
  `static Double decayRatio(EventDataset d, double[] p, double bandP, double noiseP)`.
- Algorithm: after t0, an excursion is a run of samples with p > 1 (p is normalised, the final value = 1); it ends at
  the first sample with p ≤ 1. a = max(p) − 1 of the first excursion, c = the same for the second. Threshold
  `thr = max(bandP, 4 × noiseP)` (NaN noise counts as 0). Return c / a when a > thr and c > thr, else null.

- [ ] **Step 1: Failing tests.** `underdampedSecondOrderGivesTextbookDecayRatio` (unit step, ζ 0.3, ωn 0.1 rad/s, 1 s sampling, 600 s → 0.139 ± 0.02); `wigglesOnFirstOvershootAreNotASecondPeak` (single 10 % overshoot carrying a 1 % 0.5 Hz ripple, no return below 1 → null; today ≈ 1); `peaksBelowFourTimesNoiseIgnored` (second peak 2 %, noiseP 1 % → null); `unknownNoiseUsesBandOnly` (noise NaN, clean ζ 0.3 response → 0.139 ± 0.02).
- [ ] **Step 2: Run, expect failures.**
- [ ] **Step 3: Implement**; the caller passes `preStepNoiseSigma` of the event's pre-step window.
- [ ] **Step 4: Run the response package.** All pass.
- [ ] **Step 5: Commit** `feat(cplm): CHG-206 decay ratio counts a second peak only after a full oscillation`.

### Task 4: Valve-at-limit and PV-left-region censors (CHG-207, spec item 6)

**Files:**
- Create: `src/flink/src/main/java/com/ams/flink/cplm/response/EventGuards.java` (limit and region dwell tracking)
- Modify: `ResponseJobConfig.java` (fields, `withProfileRanges`, `sameRanges`, `copy`, `bundleHash`), `ResponseCapture.java` (call the guards while an event is open)
- Modify: `src/frontend-ob/src/components/Cpm/vocabulary.ts`, `src/frontend-ob/src/components/Cpm/evidence/verdictCopy.ts`
- Test: `src/flink/src/test/java/com/ams/flink/cplm/response/EventGuardsTest.java` (new), `ResponseCaptureEvaluatorTest.java`; the frontend's existing vocabulary test if one covers censor reasons

**Interfaces:**
- Consumes: `withProfileRanges` / `sameRanges` (Task 1), extended here.
- Produces on `ResponseJobConfig`: `actuatorLimitBandFraction = 0.01`, `actuatorLimitDwellS = 10`, `regionExitDwellS = 10`,
  `opLowEu = 0`, `opHighEu = 100` (from `opEngMin/opEngMax` when `opRangeDeclared`), `regionPvMin = −∞`, `regionPvMax = +∞` (from the profile).
- Produces `EventGuards` (serializable, one per capture): `void reset()` (on event open/close);
  `String onSample(double tS, double u, double pv, boolean good)` → `"ACTUATOR_CONSTRAINT"`, `"REGION_EXIT"` or null.
  At limit: `u ≤ opLowEu + f × span` or `u ≥ opHighEu − f × span` (span = opHighEu − opLowEu, f = actuatorLimitBandFraction).
  Outside region: `pv < regionPvMin` or `pv > regionPvMax`. Each condition must hold continuously on good samples for
  its dwell; a bad sample neither starts nor breaks a dwell.
- `ResponseCapture`: while an event is open, a non-null guard result calls `machine.onActuatorConstraint(tS)` or
  `machine.onRegionExit(tS)` and closes the event, before the supersede/settle checks. u is the applied input (VP when usable, else OP).
- Frontend labels: `ACTUATOR_CONSTRAINT: 'Valve at its limit'`, `REGION_EXIT: 'PV left its operating region'` in the
  censor-reason map of `vocabulary.ts`; lower-case clauses `'the valve sat at its limit'`,
  `'the PV left its operating region'` in `verdictCopy.ts`.

- [ ] **Step 1: Failing tests.** `outputAtLimitTenSecondsCensors` (OP at 99.5 for 12 s while open → CENSORED `ACTUATOR_CONSTRAINT`); `outputAtLimitUnderTenSecondsDoesNot` (8 s, then back to 60); `declaredOpRangeUsedForLimit` (0–200: 198.5 at limit, 99.5 not); `pvOutsideRegionTenSecondsCensors` (region 40–60, PV 65 for 12 s → `REGION_EXIT`); `regionWithOneFiniteBoundCensors` (only max 60 set); `noRegionNoRegionCensor`; `badSamplesDoNotCountTowardDwell`.
- [ ] **Step 2: Run, expect failures.**
- [ ] **Step 3: Implement** the guards, wiring and labels.
- [ ] **Step 4: Run the response package**, then the frontend checks from `src/frontend-ob`: `npx tsc --noEmit -p tsconfig.json` and `npx vitest run src/components/Cpm` (node_modules is a junction to the AMS-open-redesign copy; create it with `cmd //c mklink /J src\\frontend-ob\\node_modules D:\\HMI_Project_Usama\\AMS-open-redesign\\src\\frontend-ob\\node_modules` if missing).
- [ ] **Step 5: Commit** `feat(cplm): CHG-207 censor System Response events on valve at limit and PV out of region`.

### Task 5: Model family from the declared process behaviour (CHG-208, spec item 2)

**Files:**
- Modify: `src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java` (flag + `copy()`)
- Modify: `src/flink/src/main/java/com/ams/flink/cplm/CplmDynamicsParameterSetSupport.java` (set the flag where an EXPLICIT `dynamic_class` is applied), and `CplmProfileJsonParser.java` if that path can carry a declaration
- Modify: `src/flink/src/main/java/com/ams/flink/cplm/response/CplmResponseAnalysisJob.java` (`familyFor`)
- Test: `CplmResponseAnalysisJobTest.java`, the existing parameter-set support test

**Interfaces:**
- Produces: `public boolean dynamicClassDeclared = false;` on `CplmLoopDynamicsProfile`, true exactly when the class
  came from an EXPLICIT registry declaration (trace every population path; `copy()` keeps it).
- `familyFor(s)`: when `s.resolvedProfile != null && s.resolvedProfile.dynamicClassDeclared`, IPDT if
  `dynamicClass.integrating()` else FOPDT; otherwise today's tag rule (LIC → IPDT, else FOPDT).

- [ ] **Step 1: Failing tests.** `declaredIntegratingPressureLoopIsIpdt`; `declaredSelfRegulatingLevelLoopIsFopdt`; `undeclaredKeepsTagRule` (LIC → IPDT; PIC with an undeclared integrating preset → FOPDT); `explicitDynamicClassSetsDeclared` and `presetDoesNotSetDeclared` (parameter-set support).
- [ ] **Step 2: Run, expect failures.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the response package plus the parameter-set support test.** All pass.
- [ ] **Step 5: Commit** `feat(cplm): CHG-208 choose the System Response model family from the declared behaviour`.

### Task 6: 95 % prediction band on the model check (CHG-209, spec item 7b)

**Files:**
- Create: `src/flink/src/main/java/com/ams/flink/cplm/response/validation/PredictionBand.java`
- Modify: `src/flink/src/main/java/com/ams/flink/cplm/response/ResponseEvaluator.java` (lines ~280–292: build the band next to `y_predict`)
- Test: `src/flink/src/test/java/com/ams/flink/cplm/response/validation/PredictionBandTest.java` (new); the frontend model-fit trend test if the band does not show (see Step 4)

**Interfaces:**
- Produces `PredictionBand.Result compute(ProcessModel model, Map<String, Double> stdErr, double residualSigma, EventDataset holdout, double u0, double y0, double v0, double maxGapS)` with `double[] lower, upper` aligned to `holdout.t` and `double coverage` (share of valid holdout y inside the band).
- Half-width at each sample: `1.96 × sqrt(Σ_j g_j(t)² · se_j² + residualSigma²)`, where
  `g_j = (ŷ(θ + δ_j) − ŷ(θ − δ_j)) / (2 δ_j)` from `ZohSimulator.simulate`, with `δ_j = max(1e-3 × |θ_j|, 1e-6)`, over each parameter that has a standard
  error (missing standard errors are skipped). `residualSigma = sqrt(objective / max(1, samples − parameters))` of the best candidate.
- Evaluator: when `y_predict` is produced, add one artifact
  `EvidenceArtifact.series(methodRunId, "G12", "prediction_interval", pathId, "time", "s", "pv_prediction_upper", "PV_EU", holdout.t, upper, null)`
  with `column("lower", "PV_EU", lower)` and provenance `band_meaning` = `PREDICTION_INTERVAL_OF_OUTPUT_NOT_PARAMETER_CONFIDENCE`
  (the shape `ResponseEvidenceWriter` already defines), plus provenance `coverage`.

- [ ] **Step 1: Failing tests.** `bandContainsTruthForWellIdentifiedModel` (FOPDT, se 5 % per parameter, noise σ 0.1 → coverage ≥ 0.9 on a noisy holdout from the same model); `bandWidensWithParameterUncertainty` (mean half-width with se 20 % > with se 2 %); `noStdErrGivesResidualOnlyBand` (half-width = 1.96 × σ everywhere); `artifactEmittedWithYPredict` (evaluator: an accepted event with a prior holdout emits `prediction_interval` with `upper`, column `lower`, equal lengths to `y_predict`).
- [ ] **Step 2: Run, expect failures.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the response package.** Then check the page: `src/frontend-ob/src/components/Cpm/response/trends/modelFitTrend.ts` draws `f.band` only when `insideWindow(f.band, f)`. If a band on the holdout's times would be hidden while `y_predict` on the same times is shown, apply the same rule to both and add a vitest case `drawsBandAlongsideHoldoutPrediction`.
- [ ] **Step 5: Commit** `feat(cplm): CHG-209 95 % prediction band on the System Response model check`.

### Task 7: Release records (controller)

- [ ] Write `changes_tracker.md` entries CHG-204..209 (services: Flink jar `CplmResponseAnalysisJob`; ams-frontend labels from CHG-207; no migration).
- [ ] Update `prod_decision.md`: the new defaults (scaling rule, settle noise multiplier 1.5, limit 1 % / 10 s, region dwell 10 s); censored events from the new rules keep charts 6 h (TRANSIENT, CHG-105); the "Response charts" sizing row grows by the band (two holdout-length arrays per accepted event with a prior event); deploy by cancel + resubmit without state.
- [ ] Update `docs/system-response-concepts.md` and mark items 2, 3, 5a, 6 (limit, region), 7 as done in `docs/system-response-fixes-for-sme.md`.
- [ ] Final whole-branch review (most capable model), fix pass, then report.

## Not in this plan

- Item 1 (capture in Manual) and the operating regions: SME decisions.
- Item 4 (controller tuning from the DCS) and item 6 "tuning changed": wait for I&C to confirm the CENTUM P, I, D items on the OPC server.
- Item 5b (servo-step models for integrating loops): engine owner's method choice; after Task 2.
