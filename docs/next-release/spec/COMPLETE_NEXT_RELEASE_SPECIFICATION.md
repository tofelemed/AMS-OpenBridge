# Traverse CPA — Next-release engineering specification v6

16 September 2026 | Source-bound audit and proposed development contracts

# 1. Next-release decision, audit boundary and target architecture

## 1.1 Decision

Keep the CPA application, OpenBridge/ECharts UI, cplm-api boundary, Kafka/Flink calculation ownership, PostgreSQL lifecycle ledger, IoTDB history, Redis snapshot and MQTT live route. This release is an implementation delta, not a replacement application. Add a real G12 System Response and Dynamics capability, method-specific evidence for every gate, transmitter Instrumental context in G11/G12, and a governed configuration service. Correct false physical confirmation and evidence-loss behavior before these additions are allowed to produce operational diagnoses.

The release SHALL remain read-only toward DCS/SIS. Changing an analysis parameter is not changing PID tuning, moving a valve, performing a test, acknowledging an Instrumental diagnostic, or authorizing field work. Those are different authorities and workflows. This specification authorizes none of those plant actions.

## 1.2 What was reviewed and how evidence is classified

A = the new cpa-system-and-application-architecture.md. V = the new cpm-ot-validation-logic.md. Both call themselves as-built for calculation 3.0.0 and dynamics 2.0.0 but do not identify a commit. S01–S24 are exact excerpts re-read from the supplied AMS-OpenBridge-main.zip, archive-declared revision 42135ceacf83369499c5398a59e44e14900f75a6. The archive and all 1,084 source files are preserved read-only. The previous v5 package is a traceability baseline, not evidence that a fix was deployed.

D means directly documented by A/V. S means verified in that source snapshot only. I means an engineering inference/design requirement. The gap register labels these separately. The entire live application, deployment, security perimeter, integrations and load behavior have NOT been executed or certified here. The reference Python tests accompanying this specification validate selected proposed mathematics and contract rules only.

Important conflicts are retained in source_document_conflicts.json. The latest documentation now reports a span-based G3 band, a 32-sample long minimum, quiet-tick skipping with newest-member time, and a 300-second live heartbeat. The old source differs. Do not report those older behaviors as definitely current. G2/G4 unit dependence, G12 flag-only behavior, G13 topology-only behavior, G14 presence-based confirmation, and no-evidence episode closure are still explicitly described in V. V also calls G4 constants hardcoded while saying all parameters are overridable. That is an unresolved contradiction, not a completed configuration feature.

## 1.3 Existing implementation to retain

A/B and S06–S10 show twelve CPA workspaces, registry onboarding, actual dynamic-class packs, parameter broadcast scaffolding, raw and KPI trends, linked historical lanes, a replay phase-plane variant, evidence panels, event acknowledgement/shelving, audit visibility and pipeline readiness. The long job already emits alignedShort over its own support. Fast-flow geometry has safeguards in the existing profile/fusion implementation. Missing numeric metrics are not universally zeroed in the current records. None of these should be rebuilt under a new name.

The missing trend capability is NOT “there are no trends.” It is that a generic signal trend/phase plane cannot show the ACF samples, PSD bins, actual cycle fits, rejected cycles, model residuals, qualified device-health history and exact effective thresholds that produced a particular decision. Those intermediates require a backend evidence contract, not just extra frontend plots.

## 1.4 Mandatory next-release corrections

The detailed 26-row gap register is normative for remediation and evidence. P0 blocks the affected capability's operational release. P1 means complete before declaring the associated broader capability ready, not permission to mislabel it meanwhile.

The critical chain is: qualify native per-role observations; separate symptoms from physical explanations; make G14 confirmation fault-scoped; stop treating missing evidence as recovery; preserve immutable analysis identity; and close persistence/replay isolation risks. Adding a high-quality G12 to unsound G15 fusion would only produce a more elaborate wrong diagnosis.

Quality is protocol-specific. UNKNOWN is not GOOD. An OPC DA quality word is not decoded by applying its numeric thresholds to an OPC UA status code. Retain native protocol and value; use explicit supported decoders and fail unknown mappings visibly. No numeric role, including VP, accepts nonfinite numbers or numeric-looking strings without validated parsing. A tag prefix or a string beginning with “g” is not a quality standard.

Engineering range and objectives must be explicit. G2 uses an approved SP stability/step policy in engineering units or normalized span, not a universal 1 EU. G4 may report a dimensionless relative-activity feature but cannot itself identify a valve mechanism. G3 distinguishes a default suggested tolerance from an approved service objective. A missing objective cannot produce a definitive healthy-performance badge.

G10 reads time-valid applied limits, selector/override state and physical dwell seconds. G11 retains source-qualified flatness episodes, even when they occupy less than 10% of a reporting horizon. G5/G6 eligibility considers observable bandwidth, independent cycles, source filtering and support; a positive lag or a large correlation asymmetry is not a physical valve confirmation.

## 1.5 Proposed end-to-end architecture

Preserve the source route; add a versioned native observation contract before irreversible joining. The existing tuple v1 may remain for old readers during migration. A v2 tuple must include per-role sample time, verification time, quality, unit, source/acquisition metadata and binding revision. “Raw” historian storage must identify whether it holds original source observations or assembled/held tuples.

Instrumental publishes health, not process values, on a separate MQTT contract. ingestion-service validates it in a separate InstrumentalHealthSubscriber, not through numeric LoopParameterMapper. It forwards device-keyed observations to Kafka. A Flink CplmInstrumentContextJob resolves effective-dated primary device bindings and emits loop/role health-context intervals. It never runs device diagnostics independently or changes Instrumental's records.

Add CplmResponseAnalysisJob to the supervised Flink deployment. It consumes native/qualified loop observations, time-valid controller/configuration/binding context and Instrumental context; creates response events; computes G12 metrics and candidate models; publishes response results and evidence artifacts. Response capture and model computation are bounded and budgeted. Bounded replay uses the SAME numerical kernel and immutable input/context manifests.

Short/Long jobs continue their existing functions, using the new qualified context and bundle IDs. A fast measurement/constraint path emits G10/G11 condition evidence without waiting for a 12/24h verdict. Fusion consumes compatible event/model/health evidence but retains its actual support; it must not pretend an event fit covered an entire day. Model evidence can be a validated baseline valid for a domain, or a current event result; these are different relationship types.

cplm-api validates commands, manages identity/configuration/run orchestration, persists verbatim numerical results, materializes reads and enforces authority. It does not estimate gains, recompute FFT, reconstruct response models or calculate diagnostic statistics. Historical-bff continues to serve raw/decimated display trends. Browser math is limited to presentation, axis conversion and cursor formatting, never authoritative KPIs.

New proposed Kafka contracts: traverse.cpa.instrument.health.v1 (device-keyed); traverse.cpa.context.instrument-health.v1 (loop/role context); traverse.cpa.clpm.response.results.v1; traverse.cpa.clpm.gate.evidence.v1; traverse.cpa.context.gate-config.v1; and traverse.cpa.context.gate-config.acks.v1. Existing metadata/parameter topics are migration inputs, not parallel uncontrolled authorities. Final namespace/ACL registration is a platform release task.

## 1.6 Data ownership and durable evidence

Instrumental owns native NE107 mapping, diagnostic codes, explanations, event history, acknowledgement, shelving and its recovery decisions. CPA stores a read-only received mirror plus CPA-specific interpretation and source/binding provenance. Truss/asset context owns plant identity and primary source binding. Alias tags are not physical identity. There is no SQL join to alarm tables and no dependence on private Instrumental database tables.

PostgreSQL additions: analytics.analysis_run, method_run, evidence_manifest, evidence_chunk, response_event, system_model, model_validation; cpm.controller_snapshot, loop_objective_version, signal_device_binding_history, gate_config_bundle, config_deployment, config_runtime_ack; and read-only instrument_health_observation/context projections. Existing result IDs become legacy references. Composite immutable identity includes tenant/site, loop UUID, run purpose, run ID, method version, support, bundle hash and revision. Different algorithms or configurations must not overwrite each other because sample_count is larger.

Evidence chunks use a durable EvidenceBlobStore interface. For the first release, PostgreSQL bytea/compressed chunks are sufficient; do not add an object-store dependency merely to draw a chart. The manifest records encoding, lengths, checksums, source revision and all chunk IDs. Kafka carries chunk/manifest records with idempotent identities and bounded payload size. API marks an artifact COMPLETE only after all checksums/lengths match. A future object store can implement the same interface without changing method identities.

Declare retention by record class. Preserve a case's accepted model, as-found/as-left evidence and historical binding/configuration beyond raw-source TTL. Kafka retention does not define the historical replay product promise. On-demand evidence after raw expiry must say EVIDENCE_EXPIRED or use retained native evidence; it cannot create fake ACF/PSD from the summary metrics.

## 1.7 Observability and operational limits

Report acquisition age, verified-source age, broker/bridge heartbeat age, ingestion delay, watermark lag, analysis wait, computation duration, consumer backlog, projection backlog, evidence readiness and configuration acknowledgement separately. An emitted heartbeat may update emission_time but cannot update source_sample_time or last_verified_time unless the source was actually re-read/verified.

Define two latency budgets: source observation to UI, and accepted tuple to UI. A 5-second acquisition route cannot promise a universal 1–2-second source-to-screen bound. Proposed load acceptance measures both at actual native cadences and includes many steady signals, quality-only updates and source loss. Publish the loop-count/rate matrix and hardware used; do not claim “all loops” from an idle test.



# 2. G12 System Response and Dynamics — implementation specification

## 2.1 Identity, purpose and non-goals

Retain gate ID G12. Introduce method family G12.SYSTEM_RESPONSE with a new versioned result schema; the legacy step-test flag is context only and moves to evidence.has_approved_test_record. It is not converted to a passed response test. Existing v1 records keep their historical meaning and are labelled legacy flag-only. Do not add a duplicate G16 for the same response function.

The purpose is to characterize observed loop response, estimate the dynamics of a clearly identified input/output path where identifiable, assess those results against an approved objective/baseline, and support a defensible tuning or investigation decision. It must tell the engineer what is unavailable and why. It is not an automatic plant perturbation or autotuning deployment system.

Distinguish these quantities everywhere: process/path gain Kp (PV EU per input EU or input percentage point), integrator slope gain Ki_process (PV EU per input EU per second), closed-loop tracking gain Kservo (PV change/SP change), configured controller proportional gain Kc, and frequency-dependent loop transfer L(jw). Never expose one field named “gain” without quantity, path, units and method.

## 2.2 Subgates and result semantics

| Subgate | Responsibility | Required output |
|---|---|---|
| G12.A | Signal/path/control-authority eligibility | Qualified roles, excluded intervals, source fidelity, controller/installation/config versions, reasons |
| G12.B | Event detection and segmentation | Event type, exact start, input step/ramp, pre/post support, interruptions, capture state |
| G12.C | Observed response | Rise/settling/overshoot/offset/load recovery metrics with uncertainty or censoring |
| G12.D | Candidate process/path model | Family, parameters/units, path, estimator and identifiability |
| G12.E | Independent validation | Holdout results, uncertainty, residual diagnostics, alternatives, validated domain |
| G12.F | Controller/robustness analysis | Actual controller form/settings, model-domain stability/robustness estimates or explicit unavailable |
| G12.G | Objective/baseline comparison | Deterioration, improvement, no demonstrated change, or non-comparable |
| G12.H | Engineer action package | Supported recommendation, limitations, required checks and change/verification references |

Separate evaluation_state (WAITING, CAPTURING, COMPLETE, REJECTED, CENSORED, SUPERSEDED), eligibility (ELIGIBLE, LIMITED, INELIGIBLE, UNKNOWN), finding (WITHIN_OBJECTIVE, DEVIATES, NO_OBJECTIVE, NO_COMPARABLE_BASELINE), and model_state (NOT_ESTIMATED, CANDIDATE, VALIDATED, REJECTED, EXPIRED). Do not turn NOT_ESTIMATED into good control. Model validity is not confirmation of a component fault.

## 2.3 Input contract and path selection

Mandatory descriptive-response inputs: signal IDs, source sample times, numeric PV/SP, engineering units and ranges, mode/authority, quality and binding history. Input-path modeling additionally requires the actual applied plant input or a verified mapping from controller output through selection, limiting and characterization. VP-based modeling uses a separately named travel-to-PV path. A cascade master's OP is normally a slave SP, not automatically the physical valve command.

Controller context: vendor/model/firmware or algorithm family; parallel/ideal/series form; configured proportional parameter and units; action/sign convention; integral mode and time/repeats units; derivative mode/time/filter; sample interval; proportional/derivative SP weights; PV/SP filters; feedforward; output/bias/limits/rate limits; external reset/antiwindup/tracking; selected/override state; controller and measurement engineering scales. Store native values and normalized equivalents with a conversion adapter version. UNKNOWN conversion forbids gain-margin and tuning-setting outputs that require it.

Instrumental context is joined to the measured PV role at each relevant time. An affected Failure or Function Check makes physical response estimation on that interval ineligible. A status affecting a different variable cannot blindly invalidate every channel of a multivariable transmitter. Unresolved impact conservatively limits physical claims. Refer to section 4 for the exact policy.

Data captured on a grid is not necessarily native uniformly sampled data. Capture mode, anti-alias/averaging filters, source timestamp quantization, latency uncertainty and held values are part of model context. Estimates apply to the observed path INCLUDING actuator, sensor, filtering and transport effects unless those have been independently separated. A measured total delay must not automatically be attributed to the valve or process alone.

## 2.4 Event types and safe triggering

SERVO_STEP: observed change in the effective SP under stable closed-loop authority; calculates reference-to-PV performance. CASCADE_SP_STEP is separate and names the master/slave path. LOAD_RESPONSE: recovery after a measured disturbance; load-normalized metrics require its magnitude/unit. UNMEASURED_DISTURBANCE_RESPONSE is descriptive and cannot claim a disturbance transfer gain. INPUT_TEST: recorded authorized/exogenous input experiment with actual applied input. RAMP_TRACKING: moving SP evaluated with lag/tracking-error rules, not step overshoot. ROUTINE_IDENTIFICATION: sufficiently exciting operating data using an eligible closed-loop estimator.

The algorithm may observe an unlabelled manual change and compute a descriptive candidate, but must not assert test authorization from its shape. Authorized tests require retained Operations/test records; a registry checkbox alone is insufficient. Do not initiate a step, PRBS, bump, valve stroke or output hold from CPA in this release.

Trigger threshold is max(configured absolute threshold, configured fraction of usable range, noise_multiplier × robust pre-event noise). Robust noise uses a declared statistic, e.g. 1.4826 × MAD after qualified detrending; specify it in method version. A candidate requires stable pre-support, sufficient amplitude and direction persistence. Time thresholds are seconds, not sample counts. Preserve actual step sequence and step time; do not collapse several changes to one ideal step.

Capture state machine: IDLE → CANDIDATE → CAPTURING → QUALIFIED → ESTIMATING → CANDIDATE_MODEL → VALIDATING → COMPLETE. Alternative terminal states: REJECTED and CENSORED. A new SP/input event, control-mode transfer, source gap, material health change, installed-device/configuration change, region exit or actuator constraint may segment or censor the current event. It must not disappear. Last-input and maximum-duration processing-time guards report incomplete capture if event time stops; they never invent process recovery.

Pre-support, minimum post-support and maximum capture depend on commissioned dynamic bounds; they are not fixed 4/12/24h gate horizons. Streaming estimates remain provisional while support accumulates. A 10-minute flow response may complete independently of long fusion; a slow thermal event may need more than 24h. Longer support must stay in one valid regime or be segmented.

## 2.5 Observed response equations and edge cases

Let r be SP, y be PV, u the identified applied input, t0 the event start, and e = r − y. Baseline y0 and final yss are robust estimates on separately qualified stable support; NEVER define yss as the last available sample just because a chart ended. Store bounds and estimation method.

For a nonzero qualified response change dy = yss − y0, progress p(t) = (y(t) − y0)/dy supports either response direction. t10 and t90 are first sustained threshold crossings after t0; tr_10_90 = t90 − t10. The crossing interpolation convention and required persistence are versioned. A direct feedthrough crossing at t0 is possible. No crossing yields NULL with a censor/insufficient-response reason, not zero.

Observed settling to the attained endpoint uses Bresp = max(abs_settling_band_EU, relative_band × abs(dy), commissioned noise floor). t_settle_response is the earliest point after which all qualified observations stay in [yss−Bresp, yss+Bresp] through the retained event end, with at least the configured tail dwell and no unsupported gaps. This is OBSERVED_THROUGH_T, not a guarantee about the infinite future. A shorter capture is right-censored. Also compute t_settle_target against the APPROVED SP/operating band. A biased response can settle near its own endpoint while still failing its control objective.

Response overshoot = 100 × max(0, max p(t) − 1). Undershoot = 100 × max(0, −min p(t)). This normalization is valid only when abs(dy) exceeds the minimum response/noise threshold. Separately report target overshoot against r1 and signed steady offset ess = r1−yss. Peak time, peak EU and observed endpoint are retained. Define decay ratio only from qualified same-side successive peaks relative to the declared reference; do not invent damping from one peak or a non-second-order process.

Kservo = (yss−y0)/(r1−r0) for an eligible reference step. This is not process gain. Closed-loop rise, settling, damping and error responses are measured with the installed controller active. A steady Kservo near one says nothing by itself about actuator health or optimal tuning.

For valid half-open held intervals [ti, ti+1), integrate only supported portions clipped to event bounds: IAE = sum abs(ei) dti; ISE = sum ei² dti; ITAE = sum 0.5 × abs(ei) × ((bi−t0)²−(ai−t0)²), where [ai,bi) is that interval's clipped support. This ITAE integrates the time factor exactly for held error. Do not extrapolate a last value to the event end without a hold/freshness contract. Time-weighted MAE = IAE / valid_duration and RMSE = sqrt(ISE / valid_duration). Report eligible-duration coverage and excluded duration alongside every integral. This is a new explicit method version, not an unmarked rewrite of legacy per-sample MAE or rectangular ITAE.

For disturbances, recovery refers to return to the pre-disturbance approved operating band; SP constancy, region and authority must hold. IAE per disturbance magnitude is unavailable if that magnitude is missing. For ramps, report signed lag/tracking error, integral error and output constraints over the ramp, not a step settling time.

MathWorks documents step-response thresholds and endpoint dependence; the conventions above deliberately add production validity/censoring controls and are Traverse design rules, not claimed verbatim requirements of that tool or a standard. [W03]

## 2.6 Model bank and parameter applicability

| Model family | Equation (continuous-time path model) | Parameters that exist |
|---|---|---|
| FOPDT | G(s) = Kp exp(−theta s)/(tau s+1) | Signed Kp, theta ≥ 0, tau > 0 |
| SOPDT, real poles | Kp exp(−theta s)/((tau1 s+1)(tau2 s+1)) | Kp, theta, tau1/tau2; ordered tau1 ≥ tau2 to remove label ambiguity |
| Second order, underdamped | Kp wn² exp(−theta s)/(s²+2 zeta wn s+wn²) | Kp, theta, wn > 0, 0 < zeta < 1 |
| IPDT | Ki_process exp(−theta s)/s | Signed slope gain and theta; no finite steady-state process gain, no self-regulating tau |
| Integrating plus lag | Ki_process exp(−theta s)/(s(tau s+1)) | Slope gain, theta and lag tau; static Kp still inapplicable |
| Inverse-response extension | Stable base model × (1−Tz s), Tz > 0 | RHP zero only when separately identifiable and independently validated |
| General closed-loop operating-data model | y = G(q)u + H(q)epsilon | Plant/path plus independently parameterized noise model, qualified excitation and validation |

The release must implement FOPDT, SOPDT, underdamped second order, IPDT and integrating-plus-lag estimation adapters with tests. Inverse/unstable/multivariable extensions have explicit capability states; an unimplemented or unvalidated extension is UNSUPPORTED, not silently replaced with a misleading FOPDT. Descriptive monitoring remains available for those loops. To claim validated identification for them, the adapter and class-specific acceptance are release requirements. A loop family name never proves the appropriate model order or stability.

For a genuine held input step on a self-regulating path, Kp = dy/du is a candidate steady gain only when both endpoints and the input path are valid and other material disturbances are controlled/observed. Model simulation fits the entire recorded u(t), not merely this endpoint ratio. Kp_N = Kp × input_span/output_span gives a dimensionless normalized gain with valid spans. If u is 0–100 percentage points, Kp_N = Kp_pp × 100/output_span. Record “percentage point,” not an ambiguous percent-of-percent.

For integrating behavior, y(t) = y0 + v0(t−t0) + Ki_process × du × max(0,t−t0−theta) for an ideal step example. Ki_process = (vafter−vbefore)/du. Baseline drift matters; static dy/du changes with observation horizon and MUST NOT be reported as a static gain. General IPDT simulation integrates the actual delayed input relative to its baseline, including multiple segments.

PV-derived gain can include valve characteristic, differential pressure and measurement conversion. Changing installed range only changes normalization, not physics. Near zero gain, uncertain sign or parameters at their bounds must be flagged; do not force the expected sign and declare a valid fit.

## 2.7 Estimation algorithms — required contracts

For authorized/exogenous input experiments with a suitable noise assumption, use bounded weighted output-error fitting. Define the full parameter vector, baseline/initial-state nuisance parameters, objective J = sum wi(yi−yhat_i(p))², input hold/interpolation model, admissible bounds, deterministic initialization candidates, maximum iterations, stopping tolerance and numerical-library version. Enforce finite predictions and condition checks. Include both negative and positive gain candidates when sign is not independently established.

Evaluate a profile of plausible delays including fractional-delay simulation within the signal-time resolution. Optimize other parameters per delay seed, then refine. A sub-grid optimum is not proof of sub-grid physical delay accuracy. Store objective versus delay and parameter covariance/identifiability diagnostics; a broad/flat optimum may make theta unavailable or interval-valued. Equal/nearly equal SOPDT poles must use numerically stable state-space simulation rather than division by tau1−tau2.

Use exact ZOH state discretization for each actual interval where that input reconstruction is warranted: A_d = exp(A dt), B_d = integral exp(A s)B ds. For irregular or missing observations, simulate only with valid input support and do not bridge an unbounded gap. Identical preprocessing and kernels are required in streaming/bounded execution. Never detrend out a real integrator response and then fit a self-regulating model to what remains.

Closed-loop routine data must not be fed to a naive endpoint-ratio or unconditional output-error estimator. Implement a qualified prediction-error adapter with an adequate disturbance/noise model, e.g. Box-Jenkins form y = [B(q)/F(q)]u + [C(q)/D(q)]epsilon, or a validated instrumental-variable adapter. For PEM, minimize the one-step innovation residual from the joint G/H model, enforce stable/invertible noise filters as appropriate, enumerate a bounded order/delay set and retain model order/initialization. For IV, identify the actual instrument/exogenous reference, validity rationale, strength and rank tests. Merely naming SP an instrument does not prove it exogenous. Direct/indirect approaches and their feedback assumptions must be explicit. [W05, W06]

The available data may support Kservo but not Kp, or low-frequency Kp but not an identifiable second pole. Emit what is supported rather than requiring every parameter to contain a number. Passive estimation can produce CANDIDATE without becoming VALIDATED. No-excitation and ambiguous competing models are legitimate results.

## 2.8 Validation, uncertainty and model governance

Split train/validation by entire events and contiguous time support, not random overlapping samples. Qualify both sets independently. Prefer a later independent event in the same relevant operating regime; absence of one keeps the model provisional. Report free-run simulation error AND one-step prediction error. A flexible predictor can fit feedback data while having an inaccurate plant model.

Model score includes time-weighted validation RMSE/MAE, fit relative to an explicitly defined baseline, residual bias, residual whiteness where its assumptions hold, input/exogenous-reference correlation, parameter uncertainty, bounds hit, rank/conditioning and repeatability. Residual-input correlation must declare lag convention; feedback can create correlations with future inputs, so an all-lag “must be zero” rule is invalid. Use the conditional innovation/valid-instrument test appropriate to the estimator. Compare candidate families on the same accepted support. AICc/order criteria may assist, but cannot override physics or holdout failure. [W04–W06]

Parameter intervals use an identified method: profile likelihood, covariance under stated assumptions, or block/event bootstrap preserving temporal structure. Record method, repetitions/seed and confidence level. Do not print a narrow CI from i.i.d. bootstrap of strongly correlated samples. Plot parameter-confidence intervals separately from output prediction intervals; label what the shaded band means. Uncertainty is not the existing uncalibrated G15 evidence score.

Model lifecycle: CANDIDATE → REVIEWED/VALIDATED for named path/regime → ACTIVE_BASELINE → EXPIRED/SUPERSEDED. Installation changes, material controller/filter changes, signal rescaling interpretation changes, NAMUR invalid-support corrections and demonstrated domain drift trigger review or invalidation. Threshold changes alone must not be counted as physical improvement. Do not auto-learn a deteriorating loop into the healthy baseline.

## 2.9 Controller and frequency response outputs

Retain configured Kc/PB, Ti/Td, derivative filter, action, form, units, sample time, weights, filters, reset/tracking, limits and source timestamp as read metadata. Parallel Kp_controller/Ki_controller/Kd_controller and ideal Kc/Ti/Td conversion is allowed only by a tested adapter with units and signs; series/interactive form cannot be converted by a universal identity. Do not estimate actual installed settings from a PV/OP trace and label them DCS settings.

Frequency response outputs include model poles/zeros, process magnitude/phase, closed-loop reference/disturbance responses where derivable, sensitivity S = 1/(1+L), complementary sensitivity T = L/(1+L), and crossover/gain/phase margins only for a fully specified compatible feedback path. Define L with the feedback controller, actuator/process/measurement path and delays; do not double-count measurement dynamics already included in G. Reference weighting/prefilter changes the servo path and is not necessarily part of L. [W01, W07]

Margin and bandwidth values are model-domain estimates, not a safety guarantee. Report valid frequency band, all relevant crossings, no-crossing/out-of-band reasons, confidence and stability assumptions. Unknown controller form, nonlinear selector activity, unstable unvalidated plant or insufficient frequency excitation yields UNAVAILABLE for the affected outputs. No automatic tuning suggestion is issued on a poor or non-identifiable model.

Advisory PI/SIMC/lambda comparisons may be generated only after model/controller prerequisites are met and a commissioning objective/robustness setting is approved. The original SIMC literature differentiates self-regulating and integrating behavior and includes corrected editions; use a named, versioned rule, not an undocumented “best tuning.” Actual tuning deployment remains outside CPA. [W01]

## 2.10 Required outputs and evidence

Every metric record contains quantity_id, value or NULL, unit, path_id, uncertainty or NULL, estimation/evaluation method, valid support, configuration hash and reason when absent. Required metric groups: input step/ramp amplitude; baseline/post endpoints; pre/post slopes; response onset and timing resolution; t10/t50/t63/t90; rise, observed response/target settling, peak/overshoot/undershoot; bias and time-weighted errors; Kservo; applicable Kp/Kp_N/Ki_process; theta and valid tau/zeta/wn/zero fields; validation scores; model-domain frequency metrics; controller metadata; constraint exposure; source/NAMUR exclusions; baseline comparison.

Evidence artifacts include exact accepted samples/masks, input reconstruction, event markers, observed and fitted/predicted output, residual series, ACF/residual tests, excitation/rank diagnostics, candidate-model table, delay-objective curve, parameter interval table, Bode/margin data where valid, and reasons for rejected models/intervals. All are generated by the calculation kernel, not reconstructed from a summary score in JavaScript.

## 2.11 Numerical teaching examples and reference-test boundary

Example FIC — synthetic, not plant evidence: a genuinely exogenous applied-input change 40→45 percentage points produces an assumed FOPDT path from PV 100→115 t/h with Kp = 3 t/h per percentage point, theta = 4 s and tau = 20 s. Ideal model y = 100 + 15(1−exp(−(t−4)/20)) after the delay. Therefore t10 = 6.1072 s, t90 = 50.0517 s, tr = 43.9445 s and ideal 2% settling = 82.2405 s. These model values are not a closed-loop SP test and do not identify Kc. The supplied deterministic fitter recovers these parameters on a separate synthetic reference curve.

Example LIC — synthetic: an applied-input change of 2 percentage points changes level slope from 0.010 to 0.030 m/min after 12 s. Ki_process = 0.010 m/(min·percentage point) = 0.000166667 m/(s·percentage point). Static process gain and open-loop step settling are inapplicable. The response event remains useful, but must not be forced into a steady FOPDT endpoint fit.

The reference scripts exercise FOPDT/IPDT primitives and protections; they do not implement or validate the full production PEM/SOPDT/model-governance adapters, and are not a substitute for the Java/Flink implementation or labelled plant tests.


# 3. Gate evidence and trend workbench — UI and backend contracts

## 3.1 Extend the existing UI

Reuse CpmHistorical, CpmReplay, CpmInvestigation, GateEvidencePanel, CalcDrawer, CpmCalculations and explorer tabs. Reuse ECharts and OpenBridge tokens/components. Add a common GateEvidenceWorkspace rather than 17 independent charting implementations. Retain the working linked historical time axes and existing phase-plane variant; they are a foundation, not the finished gate-evidence system. [A B6; S06–S08]

The evidence panel receives an immutable selection: tenant/site, loop UUID, analysis_run_id, method_run_id, result_revision, gate_id, support interval, bundle hash, binding/controller versions and representation. It MUST NOT call useLatestGates when a historical result was selected. A separate explicit “Go to latest” action may change context. Role, thresholds, preconditions and disabled/shadow state come from the selected run, never the hardcoded GATE_ROLES map.

Header: loop/tag and installed device as-of; LIVE/FROZEN/FIXED/REPLAY/COMPARE mode; interval/timezone; source age; objective/regime; active command path; configuration/method version; evidence readiness. Left: searchable gate list with eligibility/finding. Centre: synchronized raw/support context plus gate-specific evidence. Right: metric, formula, parameters, why/not-why, exclusions, and next valid engineering action. Pinning/notes creates a versioned investigation reference, not a screenshot-only record.

## 3.2 Universal chart behavior

Time-domain panes share UTC timestamps, visible site timezone, zoom, crosshair and brushing. PV/SP in compatible EU may share a pane; OP/VP use a separate calibrated input/travel axis. Different units are never overlaid on one unlabeled scale. Normalize only by an explicit toggle that shows the conversion. Show unit, original value, source sample time, last verified time, acquisition representation and quality in the tooltip.

Source gaps break lines; held, interpolated, averaged and native samples are distinguishable. Categorical mode, NE107 and availability are intervals/step lanes, not smoothed lines. A current value is not back-projected across a historical interval. Diagnosis evidence is drawn from the actual method artifacts. Overview min/max/average decimation is for navigation; the selected method never consumes that browser series as analytic input.

Each plot has a companion accessible data table/export, keyboard selection, textual statuses, focus management and readable empty/error states. Use alert tokens for attention, not decorative rainbow gate scores. Existing native NE107 icons/labels may be used under the applicable design/licensing rules; C/F/S/M state text must remain visible without relying solely on colour.

A semantic unavailable panel says which prerequisite is missing (e.g. VP stale, no valid cycle, no controller snapshot, source filtered, insufficient excitation), which results remain valid, and the required next observation. Differentiate LOADING, NO_RESULT, NOT_EVALUATED, UNSUPPORTED_METHOD, EVIDENCE_PENDING, EVIDENCE_EXPIRED, FAILED_REQUEST, SHADOW and DISABLED. No synthetic healthy curve or default zero is acceptable.

## 3.3 Artifact transport

GET /api/v1/cpm/method-runs/{id}/evidence returns an immutable manifest, not browser-calculated diagnostics. Each artifact states artifact_id, method_run_id, kind, role/path, support, x/y quantity and unit, data type, encoding, checksum, samples/points, masks, provenance, display reduction and readiness. Artifact chunks are served by id with tenant/site authorization, bounded page size and a manifest-derived ETag. Caching keys include run/revision, method, context and representation.

Flink emits exact intermediates or a deterministic retained-input recipe plus method/container hash. On-demand computation uses the same Flink kernel with purpose EVIDENCE_RECONSTRUCTION, creates a new linked run and never changes the original verdict. Never approximate a missing spectrum from its peak ratio or fabricate a fit from scalar tau unless explicitly labelled model simulation rather than original fitted evidence.

Evidence display reduction preserves its semantics. ACF/PSD arrays are bounded according to estimator support; cycle fits retain exact selected cycles; mode/health transitions are lossless; model bands retain extrema/coverage. Distinguish display_points from calculation_samples. Max payload/point limits are commissioned through the performance profile; proposed starting transport chunk limit is 256 KiB and visible time-domain budget 2,000 points per pane, with raw cursor access. These are engineering defaults to test, not standard mandates.

Do not connect two model parameter estimates by a line implying continuous physical gain. A parameter-history point refers to an event/model/domain and uncertainty; use interval markers or a deliberately labelled trend with no interpolation assumption.

## 3.4 Gate-by-gate mandatory views

### G0 — Data qualification

**Existing basis:** A B6 general raw/history; S06 latest status.

**Required views:** Per-role sample/quality/freshness ribbons; sample gap/age trend; interval histogram; accepted/rejected masks.

**Exact artifact fields:** `sample_time, verified_time, arrival_time, value, quality_native, quality_normalized, hold_kind, age_s, delta_t_s, accepted_mask, exclusion_reason`.

**Axes:** UTC/site-time x; source age and gap seconds on separate axis; discrete qualities not interpolated.

**Interaction:** Brush interval highlights the precise accepted/rejected original points and the source contract.

**Guard:** No filled line across unsupported gaps; unknown is not good; heartbeat time cannot masquerade as sample time.

### G1 — Mode and controlling authority

**Existing basis:** Mode lane exists; S08.

**Required views:** Mode, tracking, selector and authority state lanes with applied/requested OP.

**Exact artifact fields:** `mode_native, mode_normalized, controlling_authority, selector_id, selected, tracking, op_requested, u_applied, state_intervals`.

**Axes:** Time x; separate percentage-point OP lane; categorical state intervals.

**Interaction:** Click transfer inspects vendor mapping and command-path revision.

**Guard:** Unknown mapping remains unknown; manual invalidates closed-loop metrics only, not all actuator observations.

### G2 — SP event/stability

**Existing basis:** SP trend and scalar range exist.

**Required views:** SP/PV trend; SP rate and event markers; classified step/ramp support.

**Exact artifact fields:** `sp, pv, d_sp_dt, event_id, trigger_threshold, stable_pre_mask, event_type`.

**Axes:** SP/PV in one shared EU pane; SP-rate EU/s pane.

**Interaction:** Select event opens G12 with same support, not latest loop record.

**Guard:** Noise threshold/source resolution visible; no step metrics on a ramp.

### G2r — Operating region and objective domain

**Existing basis:** Scalar region eligibility.

**Required views:** PV versus applied input scatter/trajectory with region bounds; time in/out lane.

**Exact artifact fields:** `pv, u_applied, region_vertices_or_bounds, domain_mask, operating_regime_id`.

**Axes:** PV EU versus input EU/pp; elapsed-time markers; domain not one mixed-unit axis.

**Interaction:** Select out-of-domain interval; display why chosen model is unavailable.

**Guard:** Out-of-model-domain is not a healthy process; still show actual excursions.

### G3 — Objective performance and error

**Existing basis:** PV/SP and KPI overlays exist.

**Required views:** Error with approved band; cumulative IAE/ISE/ITAE; objective compliance/support; matched-baseline comparison.

**Exact artifact fields:** `error, tolerance_band, cumulative_iae, cumulative_ise, cumulative_itae, eligible_duration, objective_id, benchmark_interval`.

**Axes:** Error EU; integrals EU·s/EU²·s/EU·s² separate selectable panes.

**Interaction:** Hover exact integration interval and excluded portions; switch benchmark without recomputing in browser.

**Guard:** Do not plot unavailable as zero; no objective means performance metrics without health pass.

### G4 — Control activity

**Existing basis:** Travel/effort scalar catalogue; general OP trend.

**Required views:** Applied OP/PV contextual trend; noise-qualified reversals; cumulative command and measured-travel variation; normalized variability comparison.

**Exact artifact fields:** `u_applied, vp, delta_u, reversal_markers, command_total_variation, measured_travel_variation, sigma_u_norm, sigma_pv_norm, baseline_activity`.

**Axes:** Separate OP/VP pp and PV EU panes; activity dimensionless only where metadata valid.

**Interaction:** Select reversal and review applied path/position response in G10.

**Guard:** OP travel is not valve travel; high activity cannot directly confirm friction.

### G5 — Time-domain oscillation

**Existing basis:** ACF period/regularity scalars; generic replay.

**Required views:** Actual detrended signal; ACF versus lag; zero-crossing/cycle markers; accepted period distribution.

**Exact artifact fields:** `preprocessed_signal, acf_lag_s, acf_value, acf_pair_count, crossing_times, accepted_cycles, regularity_method`.

**Axes:** Signal unit/normalized basis stated; lag in seconds; ACF unitless.

**Interaction:** Click ACF peak highlights its candidate cycles on raw time trend.

**Guard:** Estimator/lag support disclosed; reject too few cycles or inadequate sampling rather than inventing regularity.

### G6 — Spectral evidence

**Existing basis:** FFT score/scalars; no full PSD contract.

**Required views:** PSD or amplitude spectrum matching actual method; search band/fundamental/harmonics; optional installed time-frequency method.

**Exact artifact fields:** `frequency_hz, psd_or_amplitude, ordinate_kind, spectral_window, detrend, fft_size, resolution_hz, noise_reference, peak_indices, harmonic_indices`.

**Axes:** Frequency Hz or period s, ordered correctly; PSD units signal²/Hz, amplitude signal EU.

**Interaction:** Select peak links period/cycles and G5/G7; show acquisition bandwidth.

**Guard:** Do not relabel amplitude as PSD; no spectral estimate from browser-decimated trend.

### G7 — Waveform fits

**Existing basis:** Generic phase-plane replay for shape gates.

**Required views:** Accepted cycle overlays in phase coordinates; actual sine/triangle predictions; per-cycle SSE and rejection reasons.

**Exact artifact fields:** `cycle_id, original_indices, phase, measured_cycle, sine_fit, triangle_fit, amplitudes, phases, sse_sine, sse_triangle, cycle_score`.

**Axes:** Phase 0–1 plus source time; normalized and raw amplitude clearly selectable.

**Interaction:** Pick one accepted/rejected cycle and show original signal and fitted parameters.

**Guard:** Not generic PV–OP scatter; no displayed classifier result when selected method is not reproduced/eligible.

### G8 — Lag structure / qualified nonlinear tests

**Existing basis:** Oddness scalar and generic shape replay.

**Required views:** Signed positive/negative lag correlations; symmetry/asymmetry contributions; separate bicoherence map only for installed validated method.

**Exact artifact fields:** `lag_s, phi_positive, phi_negative, odd_contribution, even_contribution, method_id; optional f1_hz,f2_hz,bicoherence`.

**Axes:** Lag seconds and unitless correlation; bicoherence frequency axes separate.

**Interaction:** Click feature links same time support; show normal linear-delay counterexample annotation.

**Guard:** Do not call lag asymmetry odd-harmonic spectrum or display a bicoherence picture for an uncomputed method.

### G9 — Cycle geometry

**Existing basis:** PV–OP scatter replay exists.

**Required views:** Ordered per-cycle phase trajectory; direction arrows/start-end; bounding box, corners, area, gate ladder and rejected cycles.

**Exact artifact fields:** `cycle_id, pair_indices, pv, u_applied, normalized_pairs, polygon_vertices, corners, area, bbox_area, qualification_steps`.

**Axes:** PV EU versus input pp; normalized alternative labelled; time/order preserved.

**Interaction:** Click cycle/vertex synchronizes raw samples; pin current effective role/threshold.

**Guard:** Plot points actually scored, not arbitrary resampled scatter; geometry remains supporting under correct policy.

### G10 — Actuator, limits and constraints

**Existing basis:** OP trend; saturation metrics.

**Required views:** Requested/applied demand and measured travel; active-limit bands; tracking error; dwell episodes; demand–travel trajectory; pneumatic context.

**Exact artifact fields:** `u_requested,u_applied,vp,tracking_error,active_low,active_high,limit_reason,dwell_events,supply_pressure,actuator_pressure,validity`.

**Axes:** pp command/travel, pressure units separately; event duration seconds.

**Interaction:** Select non-following event opens transmitter/positioner evidence and actual command transform.

**Guard:** VP presence is not confirmation; unknown limits labelled; windup unavailable without sufficient controller/reset evidence.

### G11 — Measurement and Instrumental context

**Existing basis:** Freeze/drift/spike scalars; no contracted NAMUR lane.

**Required views:** PV/raw deltas/noise; freeze/spike intervals; four NE107 status lanes; source availability, variable impact and measurement eligibility.

**Exact artifact fields:** `pv,delta_pv,noise_band,freeze_events,spikes,quantization; F,C,S,M,health_state_id,source_verified_time,measurement_impact,eligibility_intervals`.

**Axes:** PV EU; delta EU; binary F/C/S/M intervals; source age s separate.

**Interaction:** Click status opens native causes/remedies and Instrumental deep link; time selection resolves installed device as-of.

**Guard:** Health absence != OK; no automatic biased-sensor diagnosis from one PV; quality and device status remain separate.

### G12 — System response and dynamics

**Existing basis:** Flag-only G12.

**Required views:** Event input/PV/SP/VP; fitted and holdout predicted response; threshold/timing markers; residuals/ACF; model/parameter history; Bode and margins where valid.

**Exact artifact fields:** `response_event, accepted_samples, y_fit,y_predict,prediction_interval,confidence_interval,baseline,target,response_times,residuals,candidate_models,parameters,controller_snapshot,bode`.

**Axes:** Physical time and EU; separate command pp; frequency Hz or rad/s explicitly; gains with path-specific units.

**Interaction:** Select event/model; compare before/after; inspect exact training/validation intervals and rejected candidates.

**Guard:** Never process gain from SP response alone; integrator static gain NULL; model confidence distinct from G15 score.

### G13 — Interaction and disturbances

**Existing basis:** Topology links/heuristic; no complete peer analysis.

**Required views:** Aligned peer/utility trends; candidate relationship graph; pairwise lag correlation/coherence; event propagation timeline.

**Exact artifact fields:** `peer_ids,relationship_revision,aligned_series,cross_correlation,coherence,frequency_hz,lag_s,support_mask,alternative_explanations`.

**Axes:** Time shared across peer panes; each signal keeps units or labelled normalization.

**Interaction:** Select candidate pair and see signal evidence for claimed direction; graph relation not proof.

**Guard:** Unmapped peers do not rule out disturbance; no causal certainty from pairwise correlation alone.

### G14 — Fault-scoped confirmation

**Existing basis:** VP presence and cap.

**Required views:** Applied demand/VP and source diagnostics over qualifying interval; verification/test records; support-versus-contradiction timeline.

**Exact artifact fields:** `claim_type,positive_evidence_ids,contradictions,source_validity,test_id,review_record,scope,confirmed_at`.

**Axes:** Time support plus evidence table; no fake numeric certainty curve.

**Interaction:** Open exactly the record establishing non-following, supply fault or other scoped conclusion.

**Guard:** Healthy tracking contradicts non-following; confirmed subtype cannot exceed evidence scope.

### G15 — Final decision and lifecycle

**Existing basis:** Score/verdict trends and episodes.

**Required views:** Separate symptoms/hypotheses/severity; evidence-group contribution and contradictions; condition/availability/case timelines; revision history.

**Exact artifact fields:** `observations,hypotheses,evidence_groups,score_semantics,explanations,qualified_support,condition_state,availability,case_state,result_revision`.

**Axes:** Time timeline; scores labelled evidence scores unless calibrated; categorical states distinct.

**Interaction:** Trace any decision to exact run/gates and authorizations; compare superseded/new result.

**Guard:** No fabricated additive waterfall if fusion uses argmax; missing evidence does not close condition; disabled gate reduces assessability.

## 3.5 Frontend implementation units and acceptance

Create GateEvidenceWorkspace.tsx, GateEvidenceHeader.tsx, EvidenceArtifactRenderer.tsx, SignalContextLanes.tsx, MethodTracePanel.tsx, ResponseWorkspace.tsx, TransmitterHealthPanel.tsx and GateConfigurationWorkspace.tsx under the existing components/Cpm namespace. The listed names are proposed new files; current imports/casing must be preserved on case-sensitive builds. Extend cpmApi.ts and useCpm hooks with typed method-run, evidence, model, health-history and configuration endpoints. Do not duplicate the historian BFF client or MQTT store.

Acceptance requires every G0–G15 entry plus G2r to open its matching view with the correct immutable context, correct units, actual artifacts and explicit prerequisites. For the same interval, gate matrix, trend threshold, evidence table and exported values must agree. Test browser refresh/back navigation, stale response arrival after switching loops, abort/cancel, error/empty states, historical device replacement, non-UTC timezone/DST, keyboard use and no-network continuation of previously retained artifacts. Load-test chart rendering separately from calculation throughput.


# 4. Instrumental transmitter health — MQTT, identity and gate integration

## 4.1 Contract and ownership

This is a NEW proposed integration contract; the attachments do not provide an implemented Instrumental MQTT schema. The Instrumental owner and ingestion owner must approve the namespace, identity, field semantics, poll/verification behavior and historical reconciliation contract before implementation. CPA must not scrape Instrumental UI or join private diagnostics tables.

NAMUR NE107 defines Failure (F), Function Check (C), Out of Specification (S), and Maintenance Request (M); the official revision notice identifies edition 2025-07-15. OK/NO_ACTIVE_DIAGNOSTIC, UNKNOWN, NOT_CONFIGURED and communication availability are CPA/Instrumental application states, not additional NE107 categories. Status can summarize several diagnostic conditions. Preserve all active flags and native diagnostic details; do not force a scalar code to erase concurrent evidence. Any selected primary display category has its own producer/policy version and is not a universal priority or CPA severity. [W08, W09]

Instrumental owns native state/category mapping, occurrence identity, cause/remedy, acknowledgement, shelving and recovery. CPA may display and link these; acknowledging a CPA episode does not acknowledge the transmitter condition. This release has no MQTT command topic that acknowledges, suppresses, calibrates or changes Instrumental/DCS state.

## 4.2 Primary identity and effective-dated binding

Use tenant_id/site_id, functional loop UUID, signal UUID/role and primary Instrumental device_id. Store physical installation_id, source_binding_id and validity [valid_from, valid_to). A tag/serial/name is an alias, not the primary join key. One loop may have multiple PV contributors or redundant instruments; one transmitter may feed several loops. Map diagnostic affected variables to signal IDs, including compensation variables where applicable.

A temporal replacement splits the binding; do not create a second NAMUR binding and separate history binding for the same primary device. History resolves the device installed at that time. A state for the removed device must not change current CPA PV trust after the cutover. Carry received_at separately from effective source observation time so late corrections can revise historical interpretation without masquerading as a current transition.

On binding ambiguity, missing identity or contradictory tenant/site, park/quarantine the record with an explicit reason. Do not guess by matching a substring in FT/TIC tags. Enforce uniqueness of a primary binding for a given signal and time; legitimate redundant topology is modeled explicitly rather than overlapping accidental primaries.

## 4.3 Proposed MQTT topics and transport

State snapshot: traverse/instrumental/v1/{tenant_id}/{site_id}/devices/{device_id}/state. Publish full current state, QoS 1, retained. A complete snapshot includes an explicit empty active_flags list when Instrumental has actually verified no active diagnostic. Missing fields are schema failures, not an implicit clear.

Change notification: same prefix ending /events. QoS 1, not retained; each change carries event_id, diagnostic occurrence references, source sequence/epoch and the same full post-state object so loss of one delta cannot create an impossible state. Snapshots and events share observation_id where they represent the same source observation. Availability: traverse/instrumental/v1/{tenant_id}/{site_id}/sources/{source_id}/availability, retained with authenticated online/offline state and MQTT last-will behavior. Never interpret transport availability as proof the PRM/device was refreshed.

Retained expiry, producer heartbeat and scan intervals are commissioned to actual Instrumental polling. A starting freshness policy may use max(3 × declared device scan interval, site minimum), with a bounded maximum and expected collection latency; this is a proposed rule, not an NE107 requirement. Message expiry does not replace source verified_at checks. QoS 1 permits duplicate deliveries; business idempotency remains required across MQTT→Kafka→database. [W10]

Require TLS and broker identity/ACLs. Producers publish only their allowed source/site/device scope; CPA ingestion subscribes only to its scope. Browsers never obtain credentials allowing arbitrary health publication. Match payload tenant/site/device to topic captures. Limit message size, flags, diagnostics, string lengths and timestamp skew; reject malformed/unsupported versions into a health-specific DLQ without stopping OT sample ingestion.

## 4.4 Payload fields

Required envelope: schema_version, message_kind, observation_id, tenant_id, site_id, producer_id, producer_epoch, sequence (monotonic within epoch/device), source_id, device_id, observed_at, verified_at, published_at, state_revision and state_complete. Gateway adds received_at, topic, MQTT retained indication and authenticated source identity. Never accept an arbitrary client claim as authenticated producer identity.

observed_at is when this state was observed/changed at source according to the declared clock. verified_at is the most recent successful verification of the source/device state, even if unchanged; Instrumental must state whether this is direct device verification or upstream database poll. published_at is delivery time. A heartbeat from the bridge alone may only update published_at/availability. Missing reliable verification time makes freshness unknown.

The state object contains active_flags (subset of F/C/S/M), native_status, optional producer-selected primary_flag, collection_state (VERIFIED, STALE, UNKNOWN, OFFLINE), measurement_impact (VALID, INVALID, DEGRADED, UNKNOWN), and diagnostics. The exact diagnostic schema uses diagnostic_id (an occurrence-unique identifier, not merely a reusable code), native_code, message, flags, affected_variable_ids, measurement_impact, first_observed_at, cause, remedy and source_record_ref. Optional native_category, last_observed_at and source_acknowledgement/source_shelving objects preserve additional source detail. STATE_EVENT additionally requires event_id. No undocumented aliases such as first_seen or code are accepted by the strict v1 schema. Do not invent a field's measurement impact from priority alone.

Source deep links are allowlisted application references resolved by the UI/connector; arbitrary URLs from diagnostics are not blindly followed or rendered as active HTML. All diagnostic text is escaped. Full commercial/maintenance details can be fetched through the authorized Instrumental connector on demand, while the time-valid evidence used in a decision is retained in CPA.

## 4.5 Ordering, history and interval construction

Deduplicate by tenant/site/source/observation_id; conflicting payload for the same identity is an integrity incident. Sequence detects loss within an epoch. A new epoch requires a complete verified snapshot before superseding current state. Do not compare sequence numbers from different epochs as a total time order. Persist out-of-order observations; only a policy-qualified newer revision changes current state. Late records can produce explicit historical result revisions.

A snapshot obtained at 10:00 does not prove the device was healthy before 10:00. Status intervals begin at supported observed time and end on explicit newer state or on a freshness/availability boundary. Preserve uncertainty gaps rather than carrying a known good snapshot indefinitely. A change event with a supported earlier onset can update that interval; maintain original received-time history.

On sequence gap/reconnect, perform approved snapshot/history reconciliation. Mark the interval incomplete until reconciled. A status clear requires complete source evidence at an appropriate time, not an empty MQTT tombstone, missing retained message, expired topic or local CPA acknowledgement. CPA's instrument-health mirror is rebuildable from approved source snapshots/history and a durable event ledger; Kafka retention alone must not define audit history.

## 4.6 Gate impact policy (proposal, not blanket category arithmetic)

| Source evidence | CPA presentation | Analytical consequence |
|---|---|---|
| F affecting the PV or invalid measurement | Native F plus affected measurement and freshness | Exclude affected PV from physical identification/shape and reliability claims; retain descriptive raw evidence and independent actuator checks |
| C / simulated, forced or test output affecting PV | Native C and test context | Exclude ordinary process-identification and baseline learning for that interval; preserve authorized sensor/loop test evidence separately |
| S with known degraded PV validity | Native S plus native cause | LIMITED measurement support; do not promote models/baselines without a separately approved validity decision; output does not become “sensor failed” automatically |
| M with valid PV | Native M and maintenance context | Measurements may remain eligible under quality/domain checks; maintenance priority is separate from control-performance finding |
| F/C/S on a different explicitly independent variable | State remains visible | Evaluate actual affected paths; do not automatically veto an unrelated PV or automatically ignore compensation dependencies |
| Unknown impact, stale snapshot or lost collection | UNKNOWN/STALE alongside last observed status | No implied healthy clearance. Health-required model promotion is blocked/limited; signal-only descriptive analyses may remain available |
| No configured Instrumental binding | NOT_CONFIGURED | Do not manufacture health. Signal-quality-qualified monitoring may proceed, with device-health corroboration unavailable |
| Fresh complete snapshot with no active flags | NO_ACTIVE_DIAGNOSTIC | It means no reported active device diagnostic, not proof of calibration accuracy, installation correctness or absence of all sensor faults |

No default arithmetic “NAMUR M adds 0.1 valve confidence” is permitted. A transmitter diagnostic can invalidate or explain PV behavior, but does not confirm a valve fault. Known invalid source observations cannot be made eligible by disabling the NAMUR UI tile or by a superadmin lowering a weight. Independently valid alternative/redundant measurement is a new qualified signal path, not an override of the invalid one.

G11 emits native device condition, collection validity and CPA measurement-eligibility intervals separately. G12 uses those exact intervals for model fitting and validation. G3 can continue appropriately qualified descriptive performance while showing reduced assessability; it cannot disguise excluded support in the denominator. G14 may use a native condition to confirm that a transmitter reported a condition within its scope, not claim every measurement error physically explained. G15 keeps sensor hypotheses distinct from actuator hypotheses and does not close a condition just because PV-dependent gates became unavailable.

## 4.7 UI and operational integration

Loop header: transmitter name/primary device ID, F/C/S/M indicators, native status, source freshness, active diagnostic count and affected variable. Investigation: health timeline synchronized to selected interval; detail drawer with native code/cause/remedy, mapping version, source observation/verification times and Instrumental link. G11 trend: raw PV, flatness/noise events, health and source-availability lanes. G12: shaded excluded/limited health intervals and exact effect on candidate/validated model status.

Fleet: filters for missing binding, stale collection and active affected-device conditions, separate from CLPM bad-actor severity. A device feeding several loops has one Instrumental occurrence linked to all affected loops; do not create several independent repair orders or duplicate cost savings. Case evidence retains source occurrence IDs and the as-of binding. Field acknowledgement/repair follows Instrumental/EAM ownership and the site's operating model.

## 4.8 Implementation and test responsibilities

Instrumental team implements the approved publisher and history reconciliation. Ingestion team implements isolated subscriber, schema/ACL mapping and DLQ. Context/Flink team implements temporal fanout and eligibility. cplm-api implements received mirror/history reads and identity checks. Frontend adds common TransmitterHealthPanel and health lanes. QA includes simultaneous flags, multivariable impact, duplicate/conflicting records, sequence gaps, fresh retained delivery of old data, source epoch reset, failed collection, delayed clear, device replacement and cross-tenant attacks.


# 5. Governed runtime configuration — Superadmin workbench

## 5.1 Decision: build it, but do not promise arbitrary no-code mathematics

A common gate engine with approved, typed and versioned properties is the right direction. It avoids rebuilding the Flink JAR for each commissioned loop, threshold, objective or approved model selection. The existing parameter-set topic, YAML profiles, registry and broadcast handlers are useful foundations. They are not yet proof that every property is editable, safely inherited, consumed, or reproducible.

The supplied archive recognizes 48 root parser fields, contains embedded constants/static window definitions, and uses static/unqualified cache aliases and partial override behavior. The new OT sheet simultaneously says G4 thresholds are hardcoded and everything is overridable. Treat those as an unresolved implementation/document contract, not a finished feature. See S01–S05, S09–S10, S14–S15 and conflict C05.

A configuration panel may select and parameterize INSTALLED, validated methods. It cannot create a new estimator, safely increase arbitrary state retention, change a state serializer, or make a missing signal observable. A one-time implementation release is necessary for the proposed configuration engine and system-response adapters. Subsequent compatible settings must not need a JAR change.

## 5.2 Three classes of change

| Class | Examples | Activation rule |
|---|---|---|
| POLICY | Thresholds, approved objective bands, evidence display role, alert persistence using retained evidence | Re-evaluate on a complete qualified support under one immutable bundle; never mix old/new thresholds inside one published result |
| STATE_BOUNDARY | Filter/time-base changes, event detector rules, horizon/slide within compiled capacity, estimator settings, stateful baseline policy | New configuration epoch, rebuild/warmup from qualified retained support or start clean; no immediate valid result until adequate support exists |
| DEPLOYMENT | New algorithm implementation, unsupported topology/window beyond capacity, state serializer change, connector transport, new required signals/capacity | Explicitly rejected as a hot edit; versioned software/infrastructure deployment and migration required |

Names in the property catalogue carry this classification. A dependency can promote an otherwise small edit to STATE_BOUNDARY, e.g. a threshold used in an event detector. The server computes the effective impact from the method dependency graph, not merely a client-selected label.

Existing static Flink windows cannot be changed arbitrarily through JSON. Implement a bounded keyed scheduler with compiled maximum retention, supported resolutions, maximum concurrently active horizons and per-loop resource limits. Alternatively offer only the currently installed fixed horizons. The UI must accurately show which option the deployed build supports. Increasing capacity or adding a new scheduling mode remains a deployment.

### 5.2.1 Window and trigger configuration is an execution-plan contract

Alongside the 165 diagnostic properties, the configuration panel edits a versioned execution plan: horizon IDs, duration/slide in seconds, per-gate horizon assignments, trigger type, dependency requirements and deployed capacity identity. The JSON schema and synthetic example are supplied separately. This avoids pretending that a per-gate threshold field can rewire an existing Flink window operator.

All 17 gate entries are present exactly once. Short qualification gates must cover every support consumed by dependent long methods. G12 has event-triggered capture using its pre/post/capture properties; G10/G11 may run immediate condition detection plus reporting windows; G14/G15 react to compatible evidence, not just daily timers. A disabled optional method remains visible as disabled; required qualification dependencies cannot be removed.

Validate unique horizon/gate identities, positive intervals, supported slide ratios/resolutions, complete dependency support, no dependency cycles, and retention/memory limits against the DEPLOYED capacity manifest. Unimplemented scheduler mode or capacity expansion returns DEPLOYMENT_REQUIRED. Pin the execution-plan hash in the configuration bundle and every result lineage. Prepare/apply acknowledgements cover both the property bundle and its execution plan. The supplied plan is an illustrative contract fixture, not a ready-to-activate plant profile.

## 5.3 Property and capability catalogue

The release includes a proposed catalogue with identifiers, data types, units, bounds/allowed values, default policy, change class and intended runtime consumer. It is normative for the proposed contract, not evidence that those consumers already exist. Every installed build publishes a capability manifest: method IDs/versions, supported families, readable property IDs, supported role/mode combinations, maximum state bounds, schemas and artifact types.

Every user-exposed property must have a round-trip acceptance test: edit → validate → compute effective value → publish → worker ACK → produce a pinned result → demonstrate a controlled change in the intended behavior OR show that only metadata/display changed. An accepted JSON field with no runtime reader is a release defect. A rejected edit must identify the field and reason; unknown fields are never silently ignored.

Use finite typed values. Fractions and percentages must not be interchangeable. Specify second, hertz, PV EU, actuator percentage point, normalized fraction and source timestamp precisely. Explicit engineering-unit values need the associated loop unit and conversion revision. Arrays are replaced atomically; a null value is not secretly interpreted as inherit or zero. Provide a separate RESET_TO_INHERITED operation. Missing required commissioned objectives remain unset and produce NO_OBJECTIVE, not a hidden universal default.

## 5.4 Inheritance and effective configuration

Use this deterministic total order: immutable factory capabilities → approved site policy → exactly one service/dynamics/topology profile → loop overrides → exactly one operating-regime override. Each layer references a content-addressed version. Group membership alone does not merge conflicting profiles. Multiple applicable profiles or ambiguous regimes are a validation error or explicit UNKNOWN regime; do not choose by arrival order.

Deep merge typed object properties. Arrays replace as a whole. An absent key inherits; RESET removes that layer's override; explicit null is allowed only for properties whose schema permits it. Resolve all dependencies, engineering units and forbidden combinations server-side. Store the complete resolved bundle as well as its source layers. The Flink worker consumes the complete immutable bundle rather than reconstructing inheritance differently on each task.

Keys are qualified by tenant/site/loop or profile identity plus version. Remove the static global SPINE map as authoritative runtime state and eliminate unqualified aliases. Use checkpointed operator-owned versioned state; a separately instantiated job or loop must not inherit another loop's values. Restore/rescale must preserve deterministic effective configuration. Do not swallow parse failures and silently instantiate class defaults.

## 5.5 Scientific and operational invariants

Operational display modes are OPERATIONAL, OBSERVE_ONLY, SHADOW and DISABLED. DISABLED is NOT_EVALUATED_DISABLED, never PASS. Disabling a diagnostic stops that optional method; it cannot erase source invalidity or make an incompatible method eligible. The foundational quality/identity checks still run wherever needed by another method.

The following are not optional switches, including for Superadmin: finite/valid data checks; authenticated tenant scope; time-valid identity; separation of heartbeat time from measurement time; distinction between observed and interpolated data; no confirmation from VP availability; correct gain definitions; no probability claims from uncalibrated evidence scores; immutable run/config identity; source-reported invalidity; no automatic DCS/SIS write; no historical replay side effects. Operational constraint ranges and approved test permissions cannot be invented by changing a diagnostic threshold.

Roles PRIMARY/SUPPORTING/DISPLAY_ONLY/INAPPLICABLE are allowed only where supported by the installed method and engineering profile. G9 cannot be promoted to independent physical confirmation. G8 lag asymmetry cannot become a spectral odd-harmonic estimator by renaming a property. A model family cannot be enabled outside its validated input/dynamic domain. The configuration schema applies to every gate, but not every possible setting is legal for every gate.

If a new configuration makes previously detected symptoms disappear, record POLICY_RECLASSIFICATION. It is not evidence of maintenance recovery or process improvement. Keep original results accessible; any approved re-evaluation creates new result IDs and explicit supersession relationships.

## 5.6 Deployment transaction and cross-job consistency

Control-plane lifecycle: DRAFT → VALIDATED → SHADOW_EVALUATED → APPROVED → SCHEDULED → PREPARED → ACTIVE_VERIFIED. Alternative states REJECTED, EXPIRED, PARTIALLY_ACKNOWLEDGED, ACTIVATION_FAILED, ROLLED_BACK. The steps are not collapsed into an optimistic 'Saved' toast.

The proposed bundle has bundle_id/version/hash, scope, parent hashes, method/schema/build capability requirements, change class, effective_from, approver references and constraints. Canonical JSON is serialized under a defined rule before SHA-256 calculation. Message signatures/authenticated control-plane identity establish origin; a client-supplied hash alone is not authorization.

Prepare sends the immutable full bundle to all required job groups. Each task validates capability, scope, bounds and dependency coverage and returns an ACK/NACK with bundle hash, job ID, deployed build/JAR hash, topology generation and subtask identity. The control plane checks the complete required membership for the current generation; rescaling invalidates stale membership completeness. Readiness to apply is not proof that results used it.

Activation is scheduled only after required preparation and approval. Independent Flink jobs and Kafka topics do NOT switch atomically just because a broadcast message was sent. Use deterministic event-time selection plus pinned config hashes on features/results. The fusion path accepts only compatible upstream bundle/method/context versions. Mixed/incomplete activation remains visible and quarantines affected composite results; it does not claim fleet-wide success. Confirm ACTIVE_VERIFIED only after required worker applied-ACKs and a configured set of observed pinned result probes.

For periodic gate evaluation, select one eligible bundle for the declared decision time (normally window_end) and evaluate the entire eligible support under that bundle. A threshold-only change may re-evaluate retained signals, but label it as a policy change. For G12 an event pins configuration at event start; a material stateful configuration change during capture terminates/segments the event rather than mixing settings. Bindings, DCS settings and device health remain as-of the actual observation time and are not rewritten to match the chosen policy.

State-boundary edits allocate a new epoch. Bootstrap from retained data only with a documented reconstruction method and all historical context; otherwise warm up. Old and new epochs cannot share persistence history or model state without a tested migration. Model baselines do not automatically become approved under the new epoch. Replays explicitly select historical-policy or what-if-policy mode and never masquerade as operational runs.

Rollback creates a NEW activation pointing to an earlier compatible content bundle. It does not erase the failed deployment or rewrite old results. On invalid updates, retain a verified last-known-good bundle only where safe, publish CONFIG_REJECTED/DEGRADED and its actual active version, and escalate. With no valid bundle, relevant methods are unavailable; never silently fall back while displaying the rejected profile as active.

Flink 1.18 broadcast-state documentation requires deterministic logic across parallel instances; it does not promise a shared update ordering across independent jobs. The above handshake, version selection and checkpoint rules are application requirements. [W11]

## 5.7 UI configuration panel and permissions

Extend CpmGovernance with Gate Configuration and an effective-profile drawer linked from LoopRegistry and every gate result. Navigation: scope → loop/profile/regime → gate → properties → effective values → diff/impact → shadow comparison → review/activation. Keep configuration separate from historical evidence: a result's settings drawer is read-only and shows what was used, not today's editor values.

For each property show its definition, unit, effective value, inherited value/source, default status, valid bounds, installed method version, change class, dependencies, affected loops and validation result. Missing commissioned settings are prominent. Methods unavailable in the deployed build cannot be selected. A 'configure all gates' claim requires catalogue coverage and an explicit reason for every read-only/locked property.

Server-enforced permissions: cpm.config.read, cpm.config.draft, cpm.config.validate, cpm.config.shadow, cpm.config.approve, cpm.config.activate, cpm.config.rollback. Superadmin may hold scoped permissions, but mandatory independent review for high-consequence or fleet-wide changes cannot be replaced with self-approval. Software administrators do not automatically become the control technical authority. Changes to approved objectives or test permissions require the respective owner even if the editor is a Superadmin.

UI states: pending validation, rejected field, profile conflict, shadow incomplete, approval expired, scheduled, warmup, partially acknowledged, active verified, rollback in progress and failed. Show actual active bundle per job, not only the requested bundle. Include immutable audit and before/after evidence links. Bulk changes need affected-loop preview and phased rollout; stop criteria are configured before activation.

## 5.8 Acceptance boundary

The package provides reference contract/merge tests and proposed acceptance scenarios. It does not implement the distributed Flink activation protocol. Development must test loss/reordering, malformed payloads, concurrent edits, restart, restore/rescale, partial worker failure, future/late events, expired approvals, mixed methods, resource limits and rollback on the actual stack. No promise of arbitrary no-code algorithms is part of this release.


# 6. Loop-family coverage, implementation contracts and release acceptance

## 6.1 Model the engineering dimensions independently

Loop family is not a substitute for dynamics. Store measurement/service family; dynamic class; objective; topology; actuator/command path; signal observability; acquisition contract; operating regime; control authority and approved controller configuration separately. The existing FIC/PIC/PIC_GAS/PIC_VAPOUR/LIC/TIC presets remain useful onboarding suggestions. They must not silently override an explicit engineering classification.

A level controller can regulate a self-regulating draining vessel or an integrating inventory; its approved objective can be tight or averaging. A gas pressure loop can be fast and tightly controlled. A cascade master's output can be a slave reference. A flow-controlled transport process can be slow. These are essential acceptance cases, not exceptional UI labels.

“All loop types supported” means the registry, monitoring, evidence and lifecycle can represent each supported service, with correct eligibility and explicit unavailable methods. It does NOT mean any four-column signal record can identify every possible nonlinear, unstable, multivariable or inverse-response plant. For methods beyond the installed validated domain, return DESCRIPTIVE_ONLY / MODEL_UNSUPPORTED, preserve the problem and route to specialist analysis. No generic pass or invented parameter is acceptable.

## 6.2 Required service and topology scenarios

| family | dynamics | objective | response_support | required_context | critical_guard |
|---|---|---|---|---|---|
| FLOW | Often fast self-regulating; may be slow transport/inventory or nonlinear | Tight, ratio, or constraint | FOPDT/SOPDT when identifiable; servo separate | Actual applied valve/VFD command; fast native sampling | No stiction from normal lag/geometry; 5 s sampling cannot resolve a 5–10 s waveform with 8 points/cycle |
| PRESSURE_LIQUID | Often fast, may be strongly coupled | Tight/constraint | FOPDT/SOPDT; process topology matters | Pressure taps, pumps/valves, measured load | Do not infer gas/volume dynamics from P tag alone |
| PRESSURE_GAS | Finite-gain or integrating depending on mass balance/outflow | Tight or inventory buffering | FOPDT/IPDT/integrator+lag as identified | Volume/outflow, actual manipulated flow or command | Not every gas pressure loop is averaging or integrating |
| PRESSURE_VAPOUR | Thermal/condensation delay plus inventory possible | Tight/constraint | FOPDT/SOPDT or explicit integrator | Utility/heat input, sensor/transport lag | Temperature-like default is a prior, not proof |
| LEVEL | Integrating or self-regulating draining system | Tight or averaging inventory | IPDT/integrator+lag; FOPDT if finite-gain demonstrated | Inlet/outlet topology and controller action | No static Kp/open-loop settling for IPDT; closed-loop level CAN have finite servo settling |
| TEMPERATURE | Slow, delayed, sometimes integrating/nonlinear | Tight, ramp or batch | FOPDT/SOPDT, gain scheduling by regime | Utilities, cascade slave, sensor lag, filters | Keep command dynamics separate from thermal process; quiet PV does not prove actuator fault |
| COMPOSITION_ANALYZER | Sample-and-hold, irregular lab/analyzer updates, transport delay | Quality tracking or supervisory | Only acquisition-aware validated adapters | Analyzer sample/analysis/release times and calibration | Interpolation must not create artificial excitation or delay precision |
| PH_CONDUCTIVITY | Strongly nonlinear local gain, mixing and sensor dynamics | Regime-dependent quality | Qualified local models; nonlinear adapter only if installed | Operating chemistry/regime and measurement condition | Do not extrapolate local gain across operating range |
| SPEED_POSITION_POWER | Fast actuator/drive dynamics and limits | Tracking/ramp/constraint | Installed sufficiently sampled models | Applied drive command, feedback and selection | Insufficient bandwidth must return method unavailable |
| CASCADE | Master/slave composition | Master quality and slave tracking | Individual paths and verified aggregate model | Master OP may be slave SP; actual slave demand required | No direct master-OP-to-valve comparison without command path |
| SPLIT_RANGE_OVERRIDE_RATIO | Piecewise selection and characteristic | Constraint or ratio objective | Segment-specific model only when authority stable | Selector IDs, active range, ratio denominator and feedforward | No mixed-authority identification or linear model across branch transition |
| UNKNOWN_UNSTABLE_INVERSE_MIMO | Unknown or exceptional dynamics | Explicit engineering objective | Descriptive metrics; unsupported models abstain | Additional context and validated specialist adapter | No claim of universal identification until required model/validation exists |

## 6.3 Sampling and time horizon contract

Configure sampling from the fastest phenomenon that a method claims to resolve, not merely the nominal loop class. For the existing eight-samples-per-period prerequisite, a 10-second period needs at least 1.25-second observations of adequate fidelity; a 5-second grid cannot supply them. This is a necessary sampling count, not a guarantee that eight samples establish stiction or robust identification. Anti-aliasing, noise, source filters and timing uncertainty still matter.

Conversely, a six-hour oscillation needs thirty hours for five complete cycles under that commissioning policy. That exceeds the present 24h long buffer. Reject the unsupported configuration, extend capacity with a controlled scheduler deployment, or provide an eligible bounded run with retained history. Do not silently relax cycles or infer a reliable period from a fraction of a cycle.

A 5s grid also means an advertised 1–2s browser latency can at best describe a downstream hop unless the acquisition path is changed. Measure source-observation-to-display and Kafka-tuple-to-display separately. Health/quality transitions bypass numeric value RBE suppression. Retain observed_at, verified_at, received_at and emitted_at; rendering a heartbeat does not mean that a device was re-read.

## 6.4 Service and source-level implementation map

| Existing component | Keep | Next-release change |
|---|---|---|
| ingestion-service LoopJoiner/OtPayloadParser | Registry role mapping, source management, MQTT and Kafka transport | Versioned per-role observations, strict quality/finite decoding, verified freshness, declared cadence and loss/hold masks; Instrumental bridge is separate from numeric PID tuple join |
| CplmGateEngine | Shared pure math and alignedShort on long slices | Correct G0/G2/G4/G8/G10/G11 semantics; emit method intermediates and exact masks, not only summaries |
| CplmGateFusionEngine | Explicit qualification structure and useful geometry restrictions | Separate symptoms/hypotheses/confirmation; scoped G12/G11 evidence; compatible version/support join; no VP-presence confirmation |
| CplmLoopDynamicsProfile and parameter-set support | Existing profiles and Kafka side-input concept | Typed catalogue, full resolved bundle, capability checks, operator-owned effective-time state; remove unsafe aliases and ignored edits |
| New CplmResponseAnalysisJob + response package | Reuse normalized signal/context and Kafka sinks | Event-time capture; authorized/exogenous and closed-loop estimator adapters; model validation; G12 result and evidence artifacts |
| New CplmInstrumentContextJob | Reuse governed binding/context transport | As-of health intervals and scoped signal eligibility; temporal fanout, dedupe and revision policy |
| Long/Short/Fusion supervisors | Existing deployment model and operational visibility | Compatible bundle ACKs and capability manifest; bounded dynamic scheduler only after implementation; isolated expensive fitting resources |
| cplm-api result/event consumers | Verbatim storage and source separation | Immutable result identity, projection reconciliation, explicit unavailable state, safe retry; evidence manifest and model/config/lifecycle records |
| historian-bff + raw writer | Native historian reads and display decimation | Separate source-role timestamps/quality and immutable qualified evidence; replay source beyond Kafka retention only with adequate retained context |
| GateEvidencePanel/GateMatrix/calcCatalogue | Current navigation and OpenBridge components | methodRunId-based selection, installed/runtime roles and exact artifact registry; no latest-result substitution |
| CpmHistorical/chartOption/CpmReplay | Existing linked lanes and phase plane | Correct axes; actual method evidence by gate; explicit raw/processed/held display and no browser KPI recomputation |
| CpmGovernance/LoopRegistry/AddLoopWizard | Existing audit/registry/profile selection | Configuration editor, effective values, approvals/ACKs, primary Instrumental binding, objectives/topology/controller history |

Suggested new Java package boundary: cplm.response.model, event, simulation, estimation, validation, evidence. Interfaces: ResponseEventDetector, InputPathResolver, ResponseMetricCalculator, DynamicModelSimulator, ModelEstimator, ModelValidator, EvidenceArtifactWriter. Each adapter publishes supported data/model domains and parameter keys. Unsupported adapter selection fails validation, rather than returning zero-filled models.

## 6.5 API operations and command semantics

The following operations are proposed additions/extensions, not as-built endpoints. Reuse the gateway authentication model only with protected service-network ingress and server-enforced tenant/site/loop access. Caller-controlled X-Auth fields cannot establish identity through a public bypass. Existing analytics.view is retained for read scope where appropriate; explicit new permissions must be provisioned.

| method | path | permission | purpose |
|---|---|---|---|
| GET | /api/v1/cpm/capabilities | analytics.view | Installed build/methods/schemas/config property support |
| GET | /api/v1/cpm/gate-catalogue | analytics.view | All gate definitions, actual capability and property metadata |
| GET | /api/v1/cpm/loops/{id}/analysis-context?at= | analytics.view | As-of objectives, roles, binding, controller, acquisition, health references |
| POST | /api/v1/cpm/analysis-runs | cpm.analysis.create | Create bounded historical or what-if run, pinned support/purpose/context; 202 run ID |
| GET | /api/v1/cpm/analysis-runs/{id} | analytics.view | Expected/received outputs, progress, errors and versioned manifest |
| GET | /api/v1/cpm/method-runs/{id} | analytics.view | Immutable exact gate evaluation metadata/results |
| GET | /api/v1/cpm/method-runs/{id}/evidence | analytics.view | Evidence manifest and authorized chunk references |
| GET | /api/v1/cpm/evidence/{id}/chunks/{n} | analytics.view | Immutable compressed numerical data; checksum/ETag |
| GET | /api/v1/cpm/loops/{id}/response-events?from=&to=&cursor= | analytics.view | Versioned G12 response event list including rejected/censored |
| GET | /api/v1/cpm/response-events/{id} | analytics.view | Specific G12 event and subgate/model results |
| GET | /api/v1/cpm/loops/{id}/models?at=&regime= | analytics.view | Applicable validated/candidate models, not most recent indiscriminately |
| POST | /api/v1/cpm/models/{id}/review | cpm.model.review | Server-owned decision bound to model version, evidence and domain |
| POST | /api/v1/cpm/loops/{id}/controller-snapshots | cpm.context.manage | Read/import approved native settings; no DCS write |
| GET | /api/v1/cpm/loops/{id}/instrument-health?at= | analytics.view | Effective device and latest/as-of health with observed/verified age |
| GET | /api/v1/cpm/loops/{id}/instrument-health/history?from=&to=&cursor= | analytics.view | Interval/event history including source unavailability and replacements |
| POST | /api/v1/cpm/loops/{id}/instrument-bindings | cpm.context.manage | Approved effective-dated reference to primary device; no NAMUR-specific alias binding |
| GET | /api/v1/cpm/configuration/effective?loopId=&at=&regime= | cpm.config.read | Complete resolved bundle, sources and actual worker versions |
| POST | /api/v1/cpm/configuration/drafts | cpm.config.draft | New immutable candidate with parent version and intended scope |
| PATCH | /api/v1/cpm/configuration/drafts/{id} | cpm.config.draft | If-Match guarded change or reset; no direct active mutation |
| POST | /api/v1/cpm/configuration/drafts/{id}/validate | cpm.config.validate | Field/capability/cross-parameter/resource validation |
| POST | /api/v1/cpm/configuration/drafts/{id}/shadow | cpm.config.shadow | Isolated before/after assessment with no operational actions |
| POST | /api/v1/cpm/configuration/drafts/{id}/approve | cpm.config.approve | Independent review bound to exact content and context |
| POST | /api/v1/cpm/configuration/deployments | cpm.config.activate | Prepare/schedule versioned bounded deployment |
| GET | /api/v1/cpm/configuration/deployments/{id} | cpm.config.read | Required worker membership, ACKs, active/probe status |
| POST | /api/v1/cpm/configuration/deployments/{id}/rollback | cpm.config.rollback | New versioned activation; retains all history |

Mutating requests carry a scoped Idempotency-Key, parent version/If-Match and requested changes only. The server supplies actor, authorization, approval timestamps and audit identity. Return 409 for stale parent/content conflicts, 422 for semantic/capability violations, 403 for missing authority, 202 for asynchronous runs/deployments, and explicit unavailable-data outcomes rather than 200 with invented zeros. Pagination uses stable sort/cursor and an as-of manifest version. Evidence downloads are authorized at every request.

## 6.6 Required data model and migrations

Create immutable analytics.analysis_run and method_run identities with purpose LIVE/REPLAY/SHADOW, requested/actual support, dataset hash, config bundle hash, source commit/JAR hash, method/schema versions, context revision, and result revision lineage. Do not use sample count as a substitute for calculation identity. A larger sample count is not necessarily a more valid or newer result.

Add response_event, system_model, model_validation and response_metric records linked to method runs. Store model path, estimator, parameter units, uncertainty method, training/validation support, approved domain and controller/context references. Metrics with unavailable/inapplicable reasons remain explicit nullable values. Keep candidate/rejected/censored analyses for engineering review subject to approved retention.

Add evidence_manifest and evidence_chunk storage with actual retained bytes, codec, length and checksum. The first implementation can use compressed PostgreSQL bytea with bounded chunk sizes and quotas; an EvidenceBlobStore abstraction allows a later object store without inventing a present dependency. Commit manifest COMPLETE only after all chunks verify. Never claim reproducibility from a hash of data that has been deleted. Case/model references pin evidence according to approved retention.

Add health_observation, device_health_interval, source_availability and effective device-binding references. Keep observed validity time and recorded/revised time. Raw Instrumental source observations are immutable; corrections create new interpretation versions. A complete device snapshot is not duplicated into an independent NAMUR primary binding.

Add config_bundle, config_layer, config_deployment, config_worker_ack and immutable approval records. Store complete effective bundles and their parent versions. A deployment is not active until required acknowledgement and observed execution conditions are satisfied. cpm.loop_registry records reference governed objective/acquisition/dynamics/topology/configuration versions; retire rather than erase history.

Retain existing v1 result tables/readers for history. Introduce versioned v2 result/evidence schemas side by side and backfill only metadata that is genuinely knowable. Legacy G12/G14/diagnosis records keep their historical interpretation, clearly labelled; do not convert a legacy confirmed label into verified physical evidence. Use explicit API adapters for old clients. Avoid duplicate live effects during dual-run migration; compare in SHADOW before enabling v2 operational projection.

Raw loop series stay in IoTDB; precise analysis artifacts and transactional lifecycle/configuration records stay in their declared owners. Do not add joins to alarm database tables or copy Instrumental's native diagnostic authority into CPA. SQL migration, initialization, upgrade/downgrade support and rollback testing are release deliverables.

## 6.7 Release slices and exit criteria

Slice 0 — establish current build truth: resolve seven document/source conflicts on the development commit; close applicable prior v5 defects with evidence; publish actual method/property capability manifest. No claim that document-reported changes are code-tested.

Slice 1 — qualification and safe semantics: per-role provenance, strict quality, heartbeat separation, unit/objective corrections, limits/freeze episodes, safe fusion, immutable run evidence and no-data episode handling. Instrumental ingestion and as-of health qualification must be included before enabling response-model learning on its measurements.

Slice 2 — response and investigations: implement G12 adapters for declared ordinary self-regulating/integrating domains, response metrics, validation/uncertainty, actual gate evidence plots and model lifecycle. Complete G13 aligned interaction or explicitly show unavailable, not a peer-link pass. No advanced adapter may ship as operational merely because it appears in a selector.

Slice 3 — governed configuration and operations: full property form, deterministic merge, scoped permissions, shadow, approval, prepared activation, worker ACKs, epoch/warmup and rollback. Add required lifecycle references and operational source/model/configuration health views. Bounded scheduler implementation and capacity certification precede enabling dynamic window changes.

These are dependency slices, not calendar estimates. Estimate effort only after closing the build-identity review and assigning API/Flink/frontend/Instrumental/QA owners. Features may be demonstrated early in SHADOW, but operational release requires the applicable correctness/security/retention/activation tests.

## 6.8 Acceptance, observability and no false readiness claims

The next-release register contains 62 application scenarios, plus the 55 retained v5 acceptance cases. Each needs release commit/build, fixture/data provenance, expected result, actual test evidence and reviewer. Some reference primitive tests are executed in this package; they do not substitute for these application cases.

Measure throughput and capacity under a declared target: active loops, sample interval, average and peak late-event rate, active response events per loop, retained horizon, model candidates/iterations, artifact size, Instrumental observation rate and concurrent UI investigations. No universal loop-count/latency claim is made without a benchmark. Protect live ingest/checkpoints from fitting work with bounded queues, per-loop concurrency, quotas and resource isolation. Export event capture backlog, estimate latency, model rejection causes, config mismatch/ACK state, health freshness, DLQ, replay completeness and projection lag.

Flink restart, rescale, checkpoint restore, Kafka duplicates/loss/reordering, IoTDB projection failure, Postgres unavailability, MQTT outage/retained stale state, expired approvals, unauthorized scope and browser disconnect are mandatory scenarios. A green HTTP endpoint alone does not establish a healthy analytical service.

All 94 v5 requirements and 52 research entries are retained unchanged as lineage. This release specifies focused implementation deltas, not the abandonment of the complete lifecycle target. Prior research entries that still lack exact equations or independent validation remain identified as such. No standards certification, deployed accuracy, production readiness or plant test execution is claimed by this specification.


# 7. Sources, research retention and claim boundaries

## Supplied implementation basis

A: cpa-system-and-application-architecture.md. V: cpm-ot-validation-logic.md. Both describe calculation 3.0.0 / dynamics 2.0.0, without an accompanying new source commit. S01–S24 are exact excerpts from the earlier supplied repository archive. The seven conflict records must not be silently reconciled. The v5 findings, 94 requirements, 52 research/capability entries and 55 acceptance scenarios remain retained in traceability. Reuse of their lineage is not a claim that all those methods were re-derived or executed in this review.

## External primary references checked 16 September 2026

These references support concepts and public standards scope. All concrete CPA APIs, thresholds, retention choices, approval workflows, MQTT payloads, data structures and test expectations in this release are engineering proposals unless explicitly identified as existing source behavior. No standards compliance certification is claimed.

### W01 — Skogestad / NTNU — Simple analytic rules for model reduction and PID controller tuning; corrections and later SIMC material

https://skoge.folk.ntnu.no/publications/2003/tuningPID/

Original-author source; use exact named version and corrected rules. No automatic tuning execution or universal-model guarantee inferred.

### W02 — MathWorks — idproc: continuous-time process models

https://www.mathworks.com/help/ident/ref/idproc.html

Primary product documentation on gain, delay, pole time constants, integrating and underdamped structures. Does not establish validity of a CPA estimator.

### W03 — MathWorks — stepinfo

https://www.mathworks.com/help/control/ref/dynamicsystem.stepinfo.html

Primary reference for defined response metrics, endpoints and settling conventions. CPA source qualification/censoring policies here are proposed design rules.

### W04 — MathWorks — validating models after estimation

https://www.mathworks.com/help/ident/ug/validating-models-after-estimation.html

Primary documentation for validation workflow. CPA independent-event governance and acceptance thresholds must be commissioned.

### W05 — Optimal instrumental variable method for closed-loop identification, DOI 10.1049/iet-cta.2009.0476

https://hal.science/hal-00594388

Research lineage confirmed from indexed bibliographic record; direct full-document retrieval was blocked in this review. Not claimed reproduced or independently validated here. W06/W14 support the implementation cautions.

### W06 — MathWorks — picking instrumental variables for system identification

https://www.mathworks.com/help/ident/ug/picking-instrumental-variables-for-system-identification.html

Primary documentation. Instrument relevance, validity and closed-loop assumptions must still be established for each adapter/data source.

### W07 — MathWorks — margin

https://www.mathworks.com/help/control/ref/dynamicsystem.margin.html

Primary documentation for gain and phase margin conventions. Model-domain estimate, not plant safety certification.

### W08 — NAMUR NE 107 revision notice — edition 2025-07-15

https://www.namur.net/en/publications/news-archive/ne107-self-monitoring-and-diagnostics-of-field-devices-has-been-revised.html

Official public notice confirms F/C/S/M and diagnostics intent. Licensed full recommendation not reviewed clause-by-clause.

### W09 — Endress+Hauser — NAMUR NE 107

https://www.endress.com/en/support-overview/learning-center/namur-ne-107

Manufacturer guidance on device-status meaning. Do not infer a universal single priority or replace device-specific impact with a generic score.

### W10 — OASIS MQTT version 5.0 standard

https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html

Primary protocol specification; retain, QoS and expiry do not establish source measurement freshness or cross-channel exactly-once application behavior.

### W11 — Apache Flink 1.18 — broadcast state pattern

https://nightlies.apache.org/flink/flink-docs-release-1.18/docs/dev/datastream/fault-tolerance/broadcast_state/

Version-matched primary documentation. Deterministic processing requirements; application-level activation/ACK protocol is proposed, not supplied by broadcast state automatically.

### W12 — NAMUR working group 2.2 — Process Operation; NE 152 Controller Performance Management

https://www.namur.net/en/work-areas-and-project-groups/wa-2-automation-systems-for-processes-and-plants/wg-22-process-operation.html

Official scope reference for performance monitoring and optimization. Not a source for every specific gate formula or team response SLA.

### W13 — IEC 61514-2:2026 — intelligent positioner performance evaluation

https://webstore.iec.ch/en/publication/69950

Official publication record, third edition published 2026-08-07. Public scope checked; licensed testing clauses not exhaustively reviewed; passive CPA analysis is not equivalent to a compliant test.

### W14 — MathWorks — model quality metrics / closed-loop estimation cautions

https://www.mathworks.com/help/ident/ug/model-quality-metrics.html

Primary documentation distinguishing prediction/simulation focus and need for adequate noise structures when identifying feedback-stabilized plants.

### W15 — Linkoping University — Computer exercises in system identification, closed-loop data

https://isy.gitlab-pages.liu.se/rt/assets/TSRT92/closedloop_session.pdf

Official university teaching material states feedback-correlation, excitation and noise-model requirements. Used for concepts; no figure/table reproduced or numerical exercise claimed executed.

## No hidden substitution

The system-response proposal uses established identification and validation concepts, but is not an implementation of MathWorks software and creates no requirement to buy MATLAB. The Java numerical-library choice, exact estimator adapters, licensing and benchmark tests remain development decisions that must be documented. Likewise, the Instrumental MQTT contract is newly proposed; it is not claimed to be its existing API.

The claimed future capabilities must be demonstrated on the deployed build and independent plant cases. Synthetic reference tests verify selected equations/contracts only. Missing source data, model identifiability, installed algorithm capability or licensed standard access is explicitly identified rather than replaced with a plausible number or compliance claim.
