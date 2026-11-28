# Gate property sources - inventory for the Effective view redesign

2026-11-23 · read-only research · code: worktree `AMS-open-sr-engine`, branch `feat/sr-engine-fixes` @ `10cdee4b` · lab data: `ams-postgres` (`traverse_cplm`, `traverse_ingestion`), read only.

Goal (owner): the Effective view must stop printing "No value / unset". Every property shows the value the system really uses for the loop and where that value is set, in plain words.

## 1. Scope

| Set | Count | Notes |
|---|---|---|
| Properties that resolve `NO_VALUE` for a loop with no own settings | **60** | same 60 under all 7 class packs: 17 `Gx.evidence_retention_days` + 38 listed in `unsupported-in-build.json` + 5 read by the engine with no default (`G2.stability_band_pv_eu`, `G2r.pv_region_min`, `G2r.pv_region_max`, `G10.limit_dwell_warn_s`, `G12.lambda_s`) |
| FIC10302 on the lab | 58 | its own loop settings (LOOP layer of bundle `db9c94a9`, ACTIVE_VERIFIED) set `G2r.pv_region_min` 90 / `max` 110 |
| Properties that show a value today (FACTORY / PROFILE source) that no calculation reads | **40** | 30 mode/role + 10 others, all in `unsupported-in-build.json` |
| **In this inventory** | **100** | the other 65 properties are read as shown (exceptions in §6) |

## 2. Categories

| Category | Meaning | Count |
|---|---|---|
| GATE_CONFIG | settable in Gate Configuration and read by the engine | 2 |
| REGISTRY | the value is a Loop Registry field (or registry link) | 3 |
| RETENTION | set by the evidence retention policy (record class), the same for every loop | 17 |
| AUTOMATIC | no setting; the page shows the rule and its basis. Sub-kinds: **fixed** (a method constant), **derived** (computed from another setting or the loop's registry data), **not applied** (the behaviour does not exist) | 76 |
| NEEDS_DECISION | read by the engine, commissioning value not set, a fallback runs meanwhile | 2 |

## 3. Lab facts used (FIC10302)

- Registry (`cpm.loop_registry`): loop_type FIC → pack `FLOW_FAST_SELF_REG`; `engineering` = `{pvMin 0, pvMax 200, opMin 0, opMax 100}`, no `pvUnit`, no `vpApplicability` (= EXPECTED); `objective_type` TIGHT; `dynamic_class` FAST_SELF_REG; `classification_source` PRESET_FROM_LOOP_TYPE; `acquisition` `{"mode":"PERIODIC"}` (no grid); no rows in `cpm.loop_link`.
- Observed sample interval 5.0 s (latest short result `payload.sample_period_sec` 5.002). Short results: `gate2_band_eu` 2.0, `gate2_band_source` COMMISSIONED_SPAN_FRACTION. Long results: `limit_dwell_warn_s` 150.03.
- Latest VALIDATED system model (`analytics.system_model`, OP_TO_PV, FOPDT, 2026-11-22 22:17 UTC): dead time 3.97 s.
- Data source "OT Gateway (lab soak)": `loop_ingest.grid_seconds` 5, `mode_value_map` 1=AUT, 2=MAN, 3=CAS, 4=IMAN.
- Fleet context (lab): 243 active loops, 178 declare a PV range, **0** EXPLICIT classifications, **0** declared grids. The 65 loops without a PV range run every span rule on an assumed 0-100 range.
- Retention (`analytics.retention_policy`, lab → plant per `prod_decision.md` §3): TRANSIENT 6 h + 2 GiB (cplm-api `Cplm:EvidenceTransientHours` / `...BudgetBytes`, defaults, no env override on the lab) · EVIDENCE_ARCHIVE 30 d / 12 GiB · EPISODE 90 d → **2 d** after close · STANDARD 90 d → **3 d** · PINNED never · RESPONSE 90 d / 2 GiB · RESPONSE_CHARTS 30 d · RESPONSE_CENSORED no row (follows RESPONSE) → **3 d**.

## 4. Inventory

Column "Per loop" says whether the value differs per loop and how to compute it server-side; the FIC10302 lab value follows the arrow. "Shown today" is what `/effective` returns now.

### 4.1 Evidence retention (17) - RETENTION

No code reads any `Gx.evidence_retention_days`. Evidence is kept by record class (`EvidenceRetentionSweeper`, `EvidenceRetentionTiers`, `EvidenceArchiveRetention`, `ResponseRetention`, `ResponseEvidenceRetention`), never by gate. No UI edits it: an administrator changes `analytics.retention_policy` (ops SQL) and `Cplm__EvidenceTransientHours` / `Cplm__EvidenceTransientBudgetBytes` (`migration/.env`).

| Properties | What decides it today | Per loop | Proposed wording (plant values) |
|---|---|---|---|
| `G0`, `G1`, `G2`, `G2r`, `G3`, `G4` `.evidence_retention_days` (CFG-003, 006, 009, 012, 015, 018) | live artifacts TRANSIENT (6 h AND 2 GiB, oldest first); rebuilt / replayed evidence STANDARD (row days + 7 d grace); pinned never. The short gates are not in the daily archive or episode captures (lab: no BOUNDARY or EPISODE rows for G0-G4) | same for all loops: read rows STANDARD, PINNED + the two cplm-api settings → lab 6 h / 90 d | "Live 6 hours · rebuilt evidence 3 days - evidence retention" |
| `G5`, `G6`, `G7`, `G8`, `G9`, `G10`, `G11`, `G13`, `G14`, `G15` `.evidence_retention_days` (CFG-021, 024, 027, 030, 033, 036, 039, 045, 048, 051) | as above + EVIDENCE_ARCHIVE (12 h / 24 h boundary sets of the long and fusion jobs, day partitions, 30 d / 12 GiB) + EPISODE (runs named by the fused verdict at open / escalate / close, row days after the episode closes, never while open). Lab rows: BOUNDARY for G5, G6, G7, G9, G10, G11, G13, G14, G15; EPISODE for G5, G8, G9, G10, G11, G13, G14, G15 | same for all loops: rows EVIDENCE_ARCHIVE, EPISODE, STANDARD → lab 6 h / 30 d / 90 d after close | "Live 6 hours · daily archive 30 days · diagnosis episodes 2 days after they close - evidence retention" |
| `G12.evidence_retention_days` (CFG-042) | class RESPONSE: an accepted test's charts RESPONSE_CHARTS days; the test and its values RESPONSE days (tests a kept model was built from stay); rejected tests RESPONSE_CENSORED days; byte cap RESPONSE.max_bytes | same for all loops: rows RESPONSE, RESPONSE_CHARTS, RESPONSE_CENSORED (`CpmResponseController` already reads them) → lab 30 d / 90 d / 90 d | "Charts 30 days · test results 90 days · rejected tests 3 days - evidence retention" |

### 4.2 Mode (17) - AUTOMATIC, fixed

| Properties | Shown today | What decides it today | Per loop | Where changed | Proposed wording |
|---|---|---|---|---|---|
| `G0`, `G1`, `G2`, `G2r`, `G3` … `G15` `.mode` (CFG-001, 004, 007, 010, 013, 016, 019, 022, 025, 028, 031, 034, 037, 040, 043, 046, 049) | OPERATIONAL (FACTORY) | not read: every gate always runs; OBSERVE_ONLY / SHADOW exist only as analysis-run purposes; DISABLED is not possible | same for all | nowhere | "Always on" |

### 4.3 Role (13) - AUTOMATIC, fixed by the diagnosis logic

Not read: the role each gate plays is compiled in `CplmGateFusionEngine` / `BlockingExclusions` / `FusionEvidence` / `Confirmation`. Same for every loop; changed nowhere. (`G7.role`, `G8.role`, `G9.role`, `G10.role` are applied to the profile and are not in this list - see §6 F5.)

| Property (shown today) | What fusion really does | Proposed wording |
|---|---|---|
| `G0.role` CFG-002 (REQUIRED_CONTEXT) | G0 FAIL ends the window as EXCLUDED_DATA_QUALITY | "Required - no diagnosis while data quality fails" |
| `G1.role` CFG-005 (REQUIRED_CONTEXT) | G1 EXCLUDED (auto share below `G1.auto_fraction_min`) ends the window as EXCLUDED_MODE | "Required - no diagnosis unless the loop is in service" |
| `G2.role` CFG-008 (SUPPORTING) | status reported, not read by fusion | "Shown only - does not decide a diagnosis" |
| `G2r.role` CFG-011 (REQUIRED_CONTEXT) | region invalid (more than 20 % outside) ends the window as EXCLUDED_OPERATING_REGION | "Required - no diagnosis outside the operating region" |
| `G3.role` CFG-014 (SUPPORTING) | status reported, not read by fusion | "Shown only - does not decide a diagnosis" |
| `G4.role` CFG-017 (SUPPORTING) | actuator-stress / effort evidence | "Supporting evidence" |
| `G5.role` CFG-020 (SUPPORTING) | oscillation evidence | "Supporting evidence" |
| `G6.role` CFG-023 (SUPPORTING) | oscillation / harmonic evidence | "Supporting evidence" |
| `G11.role` CFG-038 (SUPPORTING) | freeze episodes are evidence; a material freeze (≥ 60 s and ≥ 10 % of the window) ends the window as EXCLUDED_SENSOR, an INELIGIBLE PV instrument as EXCLUDED_INSTRUMENT_HEALTH | "Supporting; no diagnosis while the PV is frozen or its instrument is faulty" |
| `G12.role` CFG-041 (SUPPORTING) | context only, shown beside the diagnosis | "Shown beside the diagnosis" |
| `G13.role` CFG-044 (SUPPORTING) | interaction evidence (peer links) | "Supporting evidence" |
| `G14.role` CFG-047 (REQUIRED_CONTEXT) | confirmation caps a valve diagnosis: confirmed 1.0, not confirmed 0.89, contradicted 0.54 | "Confirms a valve fault; without it a valve diagnosis stays suspected" |
| `G15.role` CFG-050 (REQUIRED_CONTEXT) | the decision | "Makes the diagnosis" |

### 4.4 G0 Data quality

| Property (type, unit; shown today) | What decides it today | Per loop → FIC10302 | Where changed | Category | Proposed wording |
|---|---|---|---|---|---|
| `G0.required_signal_max_age_s` CFG-054 (number, s; No value) | ingestion `LoopJoiner` never ages values out: a value counts until the source marks it bad; a loop whose signals did not advance skips the tick, so a stall shows as a gap. VP age is `G11.instrument_verified_max_age_s` (60 s, read) | same for all → no limit | nowhere | AUTOMATIC fixed | "No age limit - a value counts until the source marks it bad" |
| `G0.max_gap_s` CFG-055 (number, s; No value) | short windows count a gap when an interval exceeds 1.5 × the median sample interval (`ShortFeatureCalculator`); coverage = completeness; System Response ends an open test after 60 s without data (`ResponseJobConfig.maxGapS`, job argument not set at submission) | 1.5 × latest short `payload.sample_period_sec`; 60 s fixed → 7.5 s; 60 s | nowhere | AUTOMATIC derived | "A gap is a pause over 7.5 s (1.5 × the 5 s sample interval); a response test stops after 60 s without data" |
| `G0.alignment_tolerance_s` CFG-056 (number, s; No value) | the joiner emits one sample per grid tick of the data source (`profile_config.loop_ingest.grid_seconds`, default 5) with each signal's newest value; G13 matches peer samples within 0.75 × the loop's sample interval | grid lives in `traverse_ingestion` (not read by cplm-api today) - else the observed interval; peers 0.75 × interval → 5 s; 3.75 s | Administration → Data sources → Loop ingest → Grid | AUTOMATIC derived | "Signals joined every 5 s (data source grid); linked loops matched within 3.75 s" |
| `G0.min_samples` CFG-057 (integer, sample; 10 FACTORY) | compiled floors: 10 per short window (`n < 10`), 32 per long window (`MIN_SAMPLES`); the execution plan states 4 for 1 min and 4 per event | same for all | nowhere | AUTOMATIC fixed | "10 samples per short window, 32 per long window - fixed by the method" |
| `G0.jitter_warn_fraction` CFG-058 (number, fraction; No value) | jitter is measured and kept (`sampling_jitter`), no warning | latest short `payload.sampling_jitter` could be shown as information → 0.05 % | nowhere | AUTOMATIC not applied | "Not checked - sample timing is recorded only" |
| `G0.acquisition_mode` CFG-154 (enum, contract; No value) | registry `cpm.loop_registry.acquisition.mode` (DTO `Model.Acquisition.Mode`, broadcast `cplm.loop.model`): labels held samples; a declared grid feeds method eligibility | `loop.Model.Acquisition` → PERIODIC, no grid declared | Loop Registry → Classification → Data arrives (and Grid (s)) | REGISTRY | "Periodic - set in Loop Registry" |

### 4.5 G1 Mode / service

| Property | What decides it today | Per loop → FIC10302 | Where changed | Category | Proposed wording |
|---|---|---|---|---|---|
| `G1.transition_guard_s` CFG-060 (number, s) | no guard: a mode change ends an open response test at once (MODE_TRANSFER); short windows only count mode changes | same for all | nowhere | AUTOMATIC not applied | "No guard time - a mode change ends a response test at once" |
| `G1.authority_max_age_s` CFG-061 (number, s) | the reported mode is used as is | same for all | nowhere | AUTOMATIC not applied | "Not checked - the reported mode is used" |
| `G1.auto_tokens` CFG-155 (string_array, token) | the data source's `mode_value_map` turns the DCS number into a word; a compiled word list (`CplmNormalizedSample`, mirrored in ingestion `ModeVocabulary`) counts AUTO/AUT/A/AUTOMATIC/NORMAL/NORM/CAS/CASC/CASCADE/RSP/DDC/SUP/SUPERVISORY as in service; System Response captures only in AUT | word list same for all; the map is per data source (no loop → source link in cplm-api) → 1=AUT, 2=MAN, 3=CAS, 4=IMAN | Administration → Data sources → Loop ingest → MODE value map (word list: nowhere) | AUTOMATIC derived | "Automatic, cascade and supervisory count as in service - mode words from the data source" |

### 4.6 G2 Set-point stability

| Property | What decides it today | Per loop → FIC10302 | Where changed | Category | Proposed wording |
|---|---|---|---|---|---|
| `G2.stability_band_pv_eu` CFG-062 (number, PV_EU) | **read**. Empty → `G2.stability_band_span_fraction` (pack 0.01; 0.05 in the averaging packs) × declared PV span; no PV range → × 100 (LEGACY_DEFAULT). Results carry `gate2_band_eu` + `gate2_band_source` | resolved value if > 0, else fraction × (`engineering.pvMax` − `pvMin`), else fraction × 100 with "range not declared" → **2.0** (1 % of 0-200) | PV range: Loop Registry → Signals → PV range; fraction or an absolute band: Gate Configuration | AUTOMATIC derived (GATE_CONFIG override) | "2.0 kg/h - 1 % of the PV range"; undeclared: "1.0 - range assumed 0-100; declare the PV range in Loop Registry" |
| `G2.step_min_pv_eu` CFG-064 (number, PV_EU) | set-point steps are found by System Response: max(`G12.step_min_input_eu` × span/100, `G12.step_min_span_fraction` × span, `G12.noise_multiplier` × pre-step noise σ); unscaled when a layer sets `G12.step_min_input_eu`. G2 itself counts every SP change and judges SP range against the band | max(1.0 × k, 0.01 × span) from resolved G12 values + registry span, noise term per test → **2.0** or 4 × noise | Gate Configuration (G12 step properties); PV range in Loop Registry | AUTOMATIC derived | "2.0 kg/h or 4 × the PV noise, whichever is larger - from the response test settings" |
| `G2.ramp_min_pv_eu_per_s` CFG-065 (number, PV_EU/s) | ramp = slope ≥ 0.02 × span/100 per s for ≥ 120 s (`ResponseJobConfig`, job arguments) | 0.02 × k → 0.04 per s for 120 s | nowhere | AUTOMATIC derived | "A set-point ramp is 0.04 kg/h per s for 2 min or more - fixed rule" |
| `G2.event_dwell_s` CFG-066 (number, s) | 30 s (`ResponseJobConfig.eventDwellS`) | same for all → 30 s | nowhere | AUTOMATIC fixed | "A new set point must hold 30 s - fixed rule" |

### 4.7 G2r Operating region

| Property | What decides it today | Per loop → FIC10302 | Where changed | Category | Proposed wording |
|---|---|---|---|---|---|
| `G2r.pv_region_min` CFG-067 (number, PV_EU) | **read** by the short job (domain mask) and System Response (test dropped after 10 s outside). Empty → no PV limit (only the output region 0-100 applies) | resolved value → **90** (own loop settings); typical loop: not limited | Gate Configuration → Per-loop settings → Edit regions (Region min) | GATE_CONFIG | "90 kg/h - set for this loop"; typical: "Not limited - set a region in Per-loop settings" |
| `G2r.pv_region_max` CFG-068 (number, PV_EU) | same; empty → no upper limit | resolved value → **110** | same (Region max) | GATE_CONFIG | "110 kg/h - set for this loop" / "Not limited" |
| `G2r.out_of_domain_warn_fraction` CFG-071 (number, fraction) | compiled: pass ≤ 5 %, warn ≤ 20 %, fail above (fail blocks the diagnosis) | same for all (lab FIC10302 is 33-63 % outside → FAIL) | nowhere | AUTOMATIC fixed | "Warn above 5 % outside the region, no diagnosis above 20 % - fixed rule" |

### 4.8 G3 Control error

| Property | What decides it today | Per loop → FIC10302 | Where changed | Category | Proposed wording |
|---|---|---|---|---|---|
| `G3.error_band_abs_pv_eu` CFG-072 (number, PV_EU) | band = `G3.error_band_span_fraction` (0.005) × declared PV span; undeclared → 0.5 | fraction × span → **±1.0** | PV range in Loop Registry; fraction in Gate Configuration | AUTOMATIC derived | "±1.0 kg/h - 0.5 % of the PV range" |
| `G3.ewma_alpha` CFG-075 (number, fraction; **0.2** FACTORY) | not read by G3 (G3 uses the raw PV). The PV used for valve-corner detection (G9) is smoothed over the pack's `pvFilterWindow` (5; 7 for level and gas): alpha = 2/(window+1) = **0.33** or 0.25 | from the pack → 0.33, corners only | nowhere | AUTOMATIC derived | "Not used for the error check; corner detection smooths over 5 samples" |
| `G3.baseline_min_valid_s` CFG-076 (number, s) | no baseline interval is evaluated | same for all | nowhere | AUTOMATIC not applied | "Not checked" |
| `G3.objective_type` CFG-156 (enum, objective) | registry `objective_type` (DTO `Model.ObjectiveType`, preset from loop type). The engine copies it only when `classification_source` = EXPLICIT and only for TIGHT/AVERAGING/CONSTRAINT/QUALITY, and **no calculation reads it** (§6 F6) | `loop.Model.ObjectiveType` + `ClassificationSource` → TIGHT (from loop type) | Loop Registry → Classification → Control goal | REGISTRY | "Tight - set in Loop Registry" |

### 4.9 G4 Actuator activity

| Property | What decides it today | Per loop | Where changed | Category | Proposed wording |
|---|---|---|---|---|---|
| `G4.min_pv_excitation_pv_eu` CFG-080 (number, PV_EU) | G4 normalises by span; no PV floor | same for all | nowhere | AUTOMATIC not applied | "Not checked" |
| `G4.travel_rate_min_support_s` CFG-081 (number, s; **3600** FACTORY) | travel per day is reported from whatever support the window has; no minimum | same for all | nowhere | AUTOMATIC not applied | "Not checked - travel per day is shown for any window length" |

### 4.10 G5 / G6 Oscillation

| Property | What decides it today | Per loop → FIC10302 | Where changed | Category | Proposed wording |
|---|---|---|---|---|---|
| `G5.acf_lag_max_s` CFG-087 (number, s) | autocorrelation to min(n/2, 2000) samples; the period band is `G5.period_min_s` / `max` | min(n/2, 2000) × interval for a full 24 h window → 2000 × 5 s = 10,000 s (lab windows hold 133 samples today: 330 s) | nowhere | AUTOMATIC derived | "Up to 2.8 h (2,000 samples) - fixed by the method" |
| `G5.signal_role` CFG-157 (enum, role) | output for self-regulating, PV for integrating loops (pack, or the registry's process behaviour when EXPLICIT) | from pack / registry → OP | Loop Registry → Classification → Process behaviour | AUTOMATIC derived | "Controller output - the loop is self-regulating (Loop Registry)" |
| `G6.spectral_concentration_warn` CFG-091 (number, fraction) | spectral entropy reported, no threshold | same for all | nowhere | AUTOMATIC not applied | "Not checked" |
| `G6.harmonic_max_order` CFG-094 (integer; **5** FACTORY) | harmonics read at the 2nd, 3rd and 5th order (4th not used) | same for all | nowhere | AUTOMATIC fixed | "2nd, 3rd and 5th harmonics - fixed by the method" |
| `G6.estimator` CFG-158 (enum, method) | averaged (Welch) spectrum only | same for all | nowhere | AUTOMATIC fixed | "Averaged spectrum - fixed method" |

### 4.11 G7 / G8 / G9 Shape, asymmetry, geometry

| Property | What decides it today | Per loop → FIC10302 | Where changed | Category | Proposed wording |
|---|---|---|---|---|---|
| `G7.shape_score_warn` CFG-095 (number, fraction) | only pass / strong at `G7.shape_score_high` (0.8) | same for all | nowhere | AUTOMATIC not applied | "No warning level - strong above 0.8" |
| `G7.min_cycle_amplitude` CFG-098 (number, signal EU) | cycles accepted by regularity and completeness, no amplitude floor | same for all | nowhere | AUTOMATIC not applied | "Not checked" |
| `G7.shape_method` CFG-159 (enum, method) | sine / triangle cycle shape is the only method | same for all | nowhere | AUTOMATIC fixed | "Sine or triangle cycle shape - fixed method" |
| `G8.max_lag_s` CFG-099 (number, s) | lags to min(200, n/4) samples | min(200, n/4) × interval → 1,000 s | nowhere | AUTOMATIC derived | "Up to 1,000 s (200 samples) - fixed by the method" |
| `G8.surrogate_repetitions` CFG-101 (integer; **199** FACTORY) | surrogate test not installed | same for all | nowhere | AUTOMATIC not applied | "Not used" |
| `G8.significance_alpha` CFG-102 (number; **0.05** FACTORY) | no significance test | same for all | nowhere | AUTOMATIC not applied | "Not used" |
| `G8.method` CFG-160 (enum, method) | cross-correlation asymmetry is the only method | same for all | nowhere | AUTOMATIC fixed | "Cross-correlation asymmetry - fixed method" |
| `G9.area_display_threshold` CFG-106 (number; 0.3 FACTORY) | compiled 0.30 (`PHASE_STRONG_THRESHOLD`) - matches the shown value | same for all | nowhere | AUTOMATIC fixed | "0.30 - fixed by the method" |

### 4.12 G10 / G11 Limits, sensor

| Property | What decides it today | Per loop → FIC10302 | Where changed | Category | Proposed wording |
|---|---|---|---|---|---|
| `G10.limit_dwell_warn_s` CFG-111 (number, s) | **read**. Empty → 30 samples × the sample interval (long job: inferred period; condition job: the last interval) | resolved value if > 0, else 30 × short `sample_period_sec`, or latest long `payload.limit_dwell_warn_s` → **150 s** | Gate Configuration | NEEDS_DECISION | "Not decided - 150 s used (30 samples at 5 s)" |
| `G10.movement_noise_floor_pp` CFG-115 (number, pp) | no noise gate; tracking uses `G10.nonfollowing_error_pp` (5) | same for all | nowhere | AUTOMATIC not applied | "Not checked" |
| `G11.spike_noise_multiplier` CFG-118 (number, ratio) | a spike is a PV change more than 3 σ from the mean sample-to-sample change | same for all | nowhere | AUTOMATIC fixed | "3 × the normal sample-to-sample change - fixed rule" |
| `G11.late_health_correction_horizon_s` CFG-120 (number, s) | late instrument-health corrections revise intervals without a bound | same for all | nowhere | AUTOMATIC not applied | "Not limited" |

### 4.13 G12 System response

| Property | What decides it today | Per loop → FIC10302 | Where changed | Category | Proposed wording |
|---|---|---|---|---|---|
| `G12.validation_rmse_max_pv_eu` CFG-138 (number, PV_EU) | a model is validated when its free-run error ≤ max(3 × noise floor, 10 % of the no-model error) and its bias ≤ max(noise floor, 2 %); noise floor 0.05 × span/100 | 3 × 0.05 × span/100 → 0.3, or 10 % per test | nowhere | AUTOMATIC derived | "0.3 kg/h or 10 % of the no-model error, per test - fixed rule" |
| `G12.confidence_level` CFG-139 (number; **0.95** FACTORY) | no intervals; standard errors only | same for all | nowhere | AUTOMATIC not applied | "Not used - uncertainty is a standard error" |
| `G12.bootstrap_repetitions` CFG-140 (integer; **200** FACTORY) | not used | same for all | nowhere | AUTOMATIC not applied | "Not used" |
| `G12.model_max_age_s` CFG-141 (number, s) | no age expiry: a reviewer marks a model expired; unreviewed models age out with RESPONSE days | same for all | System Response → Review model → Expired | AUTOMATIC not applied | "No age limit - a reviewer marks a model expired" |
| `G12.lambda_s` CFG-142 (number, s) | **read**. Empty with the default rule (`g12-lambda-rule` DEAD_TIME) → advice uses the latest validated model's dead time; dead time 0 → no advice | latest VALIDATED `system_model.parameters.dead_time.value` for the loop → **4.0 s** | Gate Configuration | NEEDS_DECISION | "Not decided - advice uses the dead time (4.0 s)" |
| `G12.model_families` CFG-161 (string_array, model) | one family per loop: integrating when the declared (EXPLICIT) process behaviour is integrating, else integrating for loop type LIC, else first order with dead time | from registry → FOPDT | Loop Registry → Classification → Process behaviour | AUTOMATIC derived | "First order with dead time - from the loop's process behaviour" |
| `G12.estimator` CFG-162 (enum, method) | chosen by the test: output steps → output-error fit; set-point steps and routine data → closed-loop fit (integrating: on the PV's rate). Lab: OE_LM_DELAY_PROFILE, PEM_ARMAX_INNOVATION | same rule for all | nowhere | AUTOMATIC fixed | "Chosen by the kind of test - fixed method" |
| `G12.uncertainty_method` CFG-163 (enum, method) | covariance standard errors (stored COVARIANCE) | same for all | nowhere | AUTOMATIC fixed | "Standard error from the fit - fixed method" |

### 4.14 G13 / G14 / G15 Interaction, confirmation, decision

| Property | What decides it today | Per loop → FIC10302 | Where changed | Category | Proposed wording |
|---|---|---|---|---|---|
| `G13.peer_binding_ids` CFG-164 (string_array, binding) | registry links `cpm.loop_link` (projected from the plant model), broadcast `cplm.loop.evidence`, capped by `G13.max_peers` (12) | `loop.Links` → none | Administration → Plant model, then Loop Registry → Resend to analysis | REGISTRY | "None - link loops in the Plant model" / "FIC10401 - from the Plant model" |
| `G14.confirmation_record_max_age_s` CFG-147 (number, s) | the confirmation is recomputed every long window; no record age | same for all | nowhere | AUTOMATIC not applied | "Re-checked every window" |
| `G14.require_independent_review` CFG-148 (boolean; **true** FACTORY) | not read. Configuration approvals need a second person, but Admin / SuperAdmin may approve their own draft; site-wide and objective edits need SuperAdmin (`ConfigStore.ApproveAsync`) | same for all | nowhere (role rules) | AUTOMATIC fixed | "A second person approves changes; an admin may approve their own" |
| `G14.allowed_evidence_types` CFG-165 (string_array, record) | only a measured valve non-following period: output-position error ≥ `G10.nonfollowing_error_pp` (5) for ≥ `G10.nonfollowing_dwell_s` (60 s); a valve-position signal alone never confirms; no valve position declared → not applicable | from resolved G10 values + registry VP applicability → 5 % for 60 s | the two G10 values in Gate Configuration | AUTOMATIC derived | "Valve not following the output by 5 % for 60 s - the only proof accepted" |
| `G15.hypothesis_score_display_min` CFG-152 (number, fraction) | every hypothesis is shown, ranked | same for all | nowhere | AUTOMATIC not applied | "All shown, highest first" |
| `G15.notification_repeat_s` CFG-153 (number, s) | no notifications are sent | same for all | nowhere | AUTOMATIC not applied | "No notifications are sent" |

## 5. Summary counts

| Category | Count | Properties |
|---|---|---|
| RETENTION | 17 | all `Gx.evidence_retention_days` |
| AUTOMATIC | 76 | fixed 43 (17 mode + 13 role + 13 rules) · derived 14 · not applied 19 |
| REGISTRY | 3 | `G0.acquisition_mode`, `G3.objective_type`, `G13.peer_binding_ids` |
| GATE_CONFIG | 2 | `G2r.pv_region_min`, `G2r.pv_region_max` |
| NEEDS_DECISION | 2 | `G10.limit_dwell_warn_s`, `G12.lambda_s` |

- About 20 of the 100 have a per-loop value (span, sample interval, registry fields, latest model); the rest are the same for every loop and could be stated once per gate.
- Two AUTOMATIC values come from the data source, not the registry (`G0.alignment_tolerance_s` grid, `G1.auto_tokens` mode map); cplm-api cannot read `traverse_ingestion` today.
- Only 5 of the 100 change behaviour when edited in a bundle: the two regions, the two decisions, and `G2.stability_band_pv_eu` (optional override).

## 6. Flagged inconsistencies

**Listed consumers that are wrong**

- **F1** 17 × `Gx.evidence_retention_days` list `["api"]`; nothing reads them. Retention is per record class (`analytics.retention_policy`), not per gate. Because they are not in `unsupported-in-build.json`, a bundle that edits them validates with **no "not read" notice**: the edit is stored and changes nothing.
- **F2** "API_POLICY" entries with no API code: `G12.model_max_age_s` (models expire only by a reviewer), `G14.confirmation_record_max_age_s`, `G15.notification_repeat_s` (cplm-api sends no notifications); `G15.hypothesis_score_display_min` (UI shows all hypotheses, no floor).
- **F3** `G14.require_independent_review` lists `flink:fusion, api`; neither reads it. The approval rule is hard-coded by role, and it governs configuration approvals, not G14 records.
- **F4** Wrong owner: `G13.peer_binding_ids` (engine reads registry links), `G0.acquisition_mode` and `G3.objective_type` (registry), `G1.auto_tokens` (data source mode map + compiled list), `G2.step_min_pv_eu` / `ramp_min_pv_eu_per_s` / `event_dwell_s` and `G0.max_gap_s` (decided by the response job, not `flink:short`), `G3.ewma_alpha` (only the long job's G9 corner filter).

**The engine ignores a value the page implies it honours**

- **F5** `G7.role`, `G8.role`, `G10.role` are applied to profile fields (`shapeRole`, `horchRole`, `saturationRole`) that no calculation reads, and they are not declared as not read. Only `G9.role` is used.
- **F6** `G3.objective_type`: the registry's Control goal reaches the engine only for EXPLICIT loops (0 of 243 on the lab) and even then `serviceObjective` is read by nothing. The objective only chose the pack's starting values when the pack was built. Yet a bundle edit to it (and to `G14.allowed_evidence_types`) is treated as sensitive and needs SuperAdmin approval.
- **F7** Two or three properties feed one engine setting, so one silently wins: `G5.period_min_s` / `G6.period_min_s` (and the `max` pair) → `tauMinS` / `tauMaxS`; `G5.min_complete_cycles`, `G7.min_accepted_cycles`, `G9.min_accepted_cycles` → `minValidCycles`. Equal in every pack today; a loop setting that changes one of them overrides the others.
- **F8** 40 properties show a value with source FACTORY / PROFILE that nothing reads (30 mode/role, 10 others). Wrong or misleading values: `G3.ewma_alpha` 0.2 (real 0.33 / 0.25, G9 only), `G4.travel_rate_min_support_s` 3600, `G6.harmonic_max_order` 5 (real 2, 3, 5), `G8.surrogate_repetitions` 199, `G8.significance_alpha` 0.05, `G12.confidence_level` 0.95, `G12.bootstrap_repetitions` 200, `G14.require_independent_review` true (admins may self-approve), `G0.min_samples` 10 (32 for long windows). `G11.role` SUPPORTING hides that a material freeze blocks the diagnosis.
- **F9** Shown value ≠ used value for read properties outside this list: the engine scales `G12.step_min_input_eu` (1.0), `G12.settling_abs_band_pv_eu` (0.1) and `G12.gain_abs_max` (1000) by span/100 for loops with a declared PV range unless a layer sets them (FIC10302 runs 2.0 / 0.2 / 2000); the Effective view prints the unscaled numbers.

**Smaller mismatches**

- **F10** `G14.allowed_evidence_types` reason says "or an approved test record"; `Confirmation` accepts only the measured non-following dwell (the registry's step-test approval feeds only the G12 context status).
- **F11** `G12.model_families` reason says "tries the installed families"; the job picks exactly one, and the registry's process behaviour counts only when EXPLICIT. A gas-pressure loop (integrating pack, G5 uses PV) gets a first-order G12 model.
- **F12** `G10.limit_dwell_warn_s` fallback differs between jobs: 30 × the last sample interval (condition) vs 30 × the inferred period (long).
- **F13** Execution plan says 4 samples for the 1-min window; the short calculator needs 10. Reason texts name `EXOGENOUS_OUTPUT_ERROR` / `CLOSED_LOOP_PEM` / `QUALIFIED_COVARIANCE`; stored names are `OE_LM_DELAY_PROFILE` / `PEM_ARMAX_INNOVATION` / `COVARIANCE`.
- **F14** The engine never applies the FACTORY layer (`EffectiveBundleSelector.apply` uses SITE, PROFILE, LOOP). A FACTORY value is right only while `factory-layer.json` mirrors the compiled defaults (guarded by `FactoryLayerParityTest`).

**Remove or make read-only (owner decides)**

- Not editable in a bundle, shown read-only with their basis: 17 retention, 17 mode, 13 role, 13 fixed rules, 14 derived values, and `G7.role` / `G8.role` / `G10.role` (or declare them not read).
- Candidates to remove from the per-loop list, or to collapse under one "Not checked by this system" line: the 19 "not applied" properties.
- Registry values: read-only here, with a link to the Loop Registry field.
- Stay editable: `G2r.pv_region_min` / `max`, `G10.limit_dwell_warn_s`, `G12.lambda_s`, and `G2.stability_band_pv_eu` as an optional override.

## 7. Server-side notes

`GET /configuration/effective` already loads the registry DTO (`Engineering`, `Model`, `Links`, `LoopType`) and the resolved properties. Per-loop values need three more reads: `analytics.retention_policy` (+ the sweeper's IConfiguration values), the loop's latest VALIDATED `analytics.system_model` (index `ix_system_model_loop`), and the latest short result's `payload.sample_period_sec` (or long `payload.limit_dwell_warn_s`, index `idx_cplm_long_loop_kind_end`). The fixed wording fits one embedded JSON resource beside `unsupported-in-build.json`, so it lives in one place. That file's three synced copies and the coverage test change with it.
