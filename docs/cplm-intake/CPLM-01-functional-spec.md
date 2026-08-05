# CPLM — Functional Specification

**Doc 1 of 3** · Control-Loop Performance Monitoring (CPLM / CPA)
**Audience:** engineers mapping this capability onto the Traverse Edge AMS platform.
**Status:** describes a **working, code-verified implementation** to be ported — not a greenfield design. Every formula, threshold and status string below was read out of running Java source, not from design notes.

Companion docs: `CPLM-02-technical-contract.md` (topics, schemas, jobs, API), `CPLM-03-traverse-integration-checklist.md` (the gap-analysis worksheet).

---

## 1. What the application does

CPLM continuously answers one question per control loop, per time window:

> **Is this loop performing well, and if not, what is physically wrong with it — with evidence?**

It ingests PV / SP / OP / (VP) / MODE / quality samples at ~1 Hz, runs them through a **17-gate evidence pipeline**, and emits a diagnosis with a confidence score and a full audit trail of which gate contributed what.

The distinguishing feature versus a generic KPI dashboard: it does not just report "this loop oscillates." It runs several independent physical detectors (spectral, autocorrelation, waveform shape, cross-correlation asymmetry, phase-plane geometry, actuator saturation), then applies **multi-evidence fusion rules** that require corroboration before naming a root cause — and refuses to call one when the evidence is insufficient, saying explicitly why.

### Core design principles (must survive the port)

1. **Compute lives in Flink, never in the API or UI.** The API is fan-out and query only. The UI renders proofs from raw signals but never produces a verdict.
2. **Windows are half-open `[start, end)`**, event-time, with explicit allowed lateness.
3. **Blocking gates run first.** Bad data, wrong mode, dead sensor or out-of-region operation *excludes* a loop from diagnosis rather than producing a misleading verdict.
4. **No dead ends.** Every non-diagnosis carries a machine-readable reason code.
5. **Confidence is capped by observability.** Without valve position feedback, no diagnosis may reach CONFIRMED.
6. **Diagnoses must persist.** A single window cannot confirm a fault; agreement across consecutive windows is required.
7. **Results are immutable and versioned.** Every emitted window records the calculation and dynamics-profile version that produced it, so historical results remain interpretable after tuning changes.

---

## 2. The gate model

Seventeen gates in five roles. Gate numbering and status vocabulary are part of the contract — the UI and stored results key off them.

| Gate | Name | Role | Typical window |
|---|---|---|---|
| G0 | Data eligibility / quality | **BLOCKING** | short (1–5 min) |
| G1 | Controller mode / service | **BLOCKING** | short |
| G2 | Setpoint activity/stability | ELIGIBILITY | short |
| G2r | Operating-region validity | **BLOCKING** | short |
| G3 | Base performance (error) | PERFORMANCE | short |
| G4 | Control effort | PERFORMANCE | short |
| G5 | Autocorrelation / oscillation | PRIMARY | long (4–24 h) |
| G6 | Spectral (FFT) evidence | PRIMARY | long |
| G7 | Triangularity (stiction shape) | SUPPORTING | long |
| G8 | Horch cross-correlation oddness | SUPPORTING | long |
| G9 | Phase-plane geometry | SUPPORTING | long |
| G10 | Actuator saturation / limit cycling | PRIMARY | long |
| G11 | Sensor health | **BLOCKING** | long |
| G12 | Tuning adequacy | CONTEXT | long |
| G13 | Loop interaction / disturbance | CONTEXT | long |
| G14 | Valve-position confirmation | CONFIRMATION | long |
| G15 | Evidence fusion → diagnosis | FUSION | fused |

**Gate status vocabulary:** `PASS`, `WARN`, `STRONG`, `FAIL`, `EXCLUDED`, `CONFIRMED`, `CONFIRMED_CAPABLE`, `SUSPECTED`, `INSUFFICIENT_EVIDENCE`, `NOT_EVALUATED`, `PENDING`.

---

## 3. Algorithms — exactly as implemented

Notation: `n` = sample count in window, `ts` = sample period (median Δt), `e = sp − pv`, `σ` = population standard deviation (ddof = 0).

### Stage 1 — short-feature gates (G0–G4, G2r)

**G0 — data quality**
- `expectedSamples = round(windowSeconds / ts)` (floored at 1); `completeness = n / expectedSamples`
- `badQualityPct = badCount / n`; duplicate `eventTsMs` count via hash set
- `samplingJitter = σ(Δt) / median(Δt)`
- `gapCount` = intervals > `1.5·ts`; `maxGapS` = max Δt
- Verdict: **PASS** if `completeness ≥ 0.98 AND badQualityPct < 0.05 AND duplicates == 0`; **WARN** if `completeness ≥ 0.95`; else **FAIL**
- Short-circuits the whole window on FAIL or `n < 10`

**G1 — mode / service**
- `autoPct` = fraction of samples whose mode string uppercased contains `"AUTO"`; `manualPct = 1 − autoPct`
- `modeChangesPerHour` = mode-string transitions ÷ window hours
- Verdict: `≥0.90` PASS, `≥0.70` WARN, else **EXCLUDED**

**G2 — setpoint stability**
- `spMin/spMax/spRange`; `spChangesPerHour` = count of `|Δsp| > 1e-6` ÷ hours
- PASS if `spRange < profile.spRangePassMax`

**G2r — operating region** (blocking)
- Out-of-band fraction where `pv ∉ [regionPvMin, regionPvMax]` or `op ∉ [regionOpMin, regionOpMax]`
- `≤0.05` PASS, `≤0.20` WARN, else FAIL

**G3 — base performance**
- `MAE = mean(|e|)`, `RMSE = sqrt(mean(e²))`
- **Time-weighted** integrals: `IAE = Σ|e|·ts`, `ISE = Σe²·ts`, `ITAE = Σ (t_i − t_0)·|e|·ts`
- `goodErrorPct` = fraction with `|e| ≤ 0.5` (absolute engineering units — currently a hardcoded band)
- **`OCE = autoPct · goodErrorPct · (1 − saturationPct)`** (overall control effectiveness)
- PASS if `goodErrorPct ≥ profile.goodErrorPctPassMin` (0.5; 0.30 for AVERAGING objective)

**G4 — control effort**
- **`effortRatio = σ(OP) / σ(PV)`**
- `opTravel = Σ|Δop|`; `travelPerDay = opTravel · 24 / windowHours`
- `reversalCount` = direction-sign changes of `Δop` (eps `1e-9`, zero-delta steps ignored, direction latched); `reversalsPerHour`
- `effortRatio > 8` → STRONG, `> 3` → WARN, else PASS

**Saturation** (feeds G3's OCE and G10): occupancy = fraction of OP at/outside `[satLowPct, satHighPct]` (default 5/95); plus `maxDwellSamples` and `cyclingPattern = (exits ≥ 3 AND occupancy ≥ 0.02)`.

### Stage 2 — long-diagnostic gates (G5–G11)

**Shape-signal selection:** `profile.integrating ? PV : OP` — the first integrating component after the valve. Signal is least-squares linear-detrended, then mean-subtracted.

**G5 — autocorrelation**
- `ρ_k = (Σ x_i x_{i+k} / (n−k)) / γ_0`, `maxLag = min(n/2, 2000)`
- Zero crossings of ρ → period candidates `2·(z_{j+1} − z_j)·ts`; **period = median of candidates**
- `regularity = min(1, period / (3·σ(candidates)))`

**G6 — spectral**
- **Naive O(n²) DFT** (no FFT library), `amp_k = 2·|X_k| / n`
- Peak search **restricted to the class band** `period ∈ [tauMinS, tauMaxS]`
- `peakToMedian = peakAmp / median(in-band amps)`; `peakRatio = peakAmp² / Σamp²`
- Harmonics at bins 2k/3k/5k → `harmonicAmplitudeRatio = (a2+a3+a5)/a1`, `harmonicEnergyRatio = (a2²+a3²+a5²)/a1²`
- `spectralEntropy` = normalized Shannon entropy of amp² over the first `max(3·peakBin, 32)` bins
- WARN if `peakRatio > 0.5`

**Period arbitration** (shared by all shape gates): ACF wins if its period is in band **and** `regularity ≥ profile.acfRegularityMin`; else FFT if in band and `peakToMedian ≥ profile.fftPeakToMedianMin`; else `NO_VALID_CYCLE` with reason `PERIOD_OUT_OF_BAND`.

**G7 — triangularity (stiction waveform)**
- Per completed cycle: min-max normalise to [−1, 1]
- Least-squares sine fit `a·sin + b·cos` → `SSE_sin`
- Phase-swept, LS-scaled triangle template `1 − 4|t − 0.5|` → `min SSE_tri`
- **`triangularity = SSE_sin / (SSE_sin + SSE_tri)`**, averaged over valid cycles → triangle ≈ 1, sine ≈ 0
- STRONG if > 0.8

**G8 — Horch oddness**
- Standardised OP and PV; for lags `k = 1..min(200, n/4)`: `φ⁺ = E[u_i·y_{i+k}]`, `φ⁻ = E[u_{i+k}·y_i]`
- `oddSum = Σ|φ⁺ − φ⁻|`, `evenSum = Σ|φ⁺ + φ⁻|`
- **`oddness = oddSum / (oddSum + evenSum)`** — asymmetry indicates non-linear (sticking) actuation
- STRONG if > 0.7

**G9 — phase-plane geometry**
- **Shoelace** area of the PV–OP trajectory: `0.5·|Σ(pv_i·op_{i+1} − pv_{i+1}·op_i)|`
- Normalised by the PV×OP bounding box → `windowAreaNorm`; ÷ completed cycles → `phaseAreaNormPerCycle`
- `cornerScore` = Σ(turning angles ≥ `profile.cornerAngleDeg`) / Σ(all turning angles), angle via `acos` of consecutive segment dot products; PV optionally EWMA-filtered
- `cornerScoreQualified` additionally requires `max|Δop| ≥ profile.opDeadbandPct` at the vertex
- STRONG if `phaseAreaNormPerCycle > 0.30`
- Reason codes: `NO_VALID_CYCLE`, `AREA_OUT_OF_BAND`, `AREA_BELOW_BAND`, `EFFORT_BELOW_FLOOR`, `OP_TRAVEL_BELOW_FLOOR`

**G10 — actuator limits**: occupancy, `satLimitDwellSamples`, `satCyclingPattern`. WARN on any trip.

**G11 — sensor health**
- `freezeIndexS` = longest run of unchanged PV × ts
- `pvQuantizationCount` = distinct PV values rounded to 3 dp
- `pvDriftPerDay` = least-squares slope on (t_sec, PV) × 86400
- `deltaPvMean`, `deltaPvStd`; `spikeCount` = `|Δpv − mean| > 3σ`
- PASS if `freezeIndexS < 60`

**G12 / G13** are pass-through capability flags today: G12 reports `NOT_EVALUATED` + `NO_STEP_TEST` unless an approved step test exists; G13 reports `NOT_EVALUATED` + `NO_UPSTREAM_LINKS` unless peer/upstream loop relationships are configured. *(Real FOPDT model-fit and cross-correlation interaction are planned extensions — see §7.)*

**G14 — valve-position confirmation:** `hasVp ? cap = 1.00 : cap = 0.89`. This is the observability ceiling on confidence.

### Stage 3 — G15 fusion and diagnosis

**Blocking exclusions run first** (each short-circuits with an explicit code):

| Condition | Diagnosis |
|---|---|
| G0 FAIL | `EXCLUDED_DATA_QUALITY` |
| G1 EXCLUDED | `EXCLUDED_MODE` |
| G2r invalid | `EXCLUDED_OPERATING_REGION` |
| G11 WARN and freeze ≥ 60 s | `EXCLUDED_SENSOR` |
| insufficient samples | `INSUFFICIENT_DATA` |

**Detector scores** (each clamped to [0,1]):
`oscillation = acfRegularity` · `fft = fftPeakRatio` · `effort = effortRatio / 8` · `stiction = triangularity` · `horch = horchOddness` · `geometry = cornerScoreQualified`

**Qualification predicates:**
- *Oscillation qualified* — `max(osc, fft) ≥ 0.55`, or G5/G6 STRONG-or-WARN; for `SLOW_SELF_REG` an alternate path via G8 + a VALID period + `≥ minValidCycles`
- *Harmonic-or-shape evidence* — G6 WARN with `harmonicAmplitudeRatio > 0.15`, or G7/G8 STRONG-or-WARN, or stiction/horch ≥ 0.55
- *Actuator stress* — G4/G10 STRONG-or-WARN, or `effortRatio ≥ 2·effortRatioFloor`, or `opRangePct ≥ opTravelFloorPct`, or saturation cycling, or `reversalCount ≥ 3`

**Multi-evidence stiction rule** — stiction may only be named when **all** hold:
oscillation qualified (unless the class profile waives it) **AND** harmonic-or-shape evidence **AND** actuator stress **AND** non-geometry evidence count `≥ max(2, profile.minNonGeometryEvidences)` **AND** (G7 or G8 STRONG-or-WARN, or its score ≥ 0.55).

**Disturbance soft-block:** if peer links exist and there is oscillation *without* actuator stress, stiction is disqualified with `DISTURBANCE_CONTEXT` — an upstream disturbance is the better explanation.

**Family scoring:** each qualified family's score is multiplied by its class prior (`priorStiction`, `priorOscillation`, `priorEffort`, `priorGeometry`). Selection is `argmax` over **qualified** families only; geometry alone is rejected where the class profile forbids it being decisive.

A weighted raw score is also reported — `0.15·osc + 0.15·fft + 0.15·effort + 0.20·stiction + 0.20·horch + 0.15·geometry` — as `raw_final_element_score`. **It is diagnostic colour only and is not what decides the outcome.**

**Confidence** = `min(selectedFamilyScore, g14Cap)`.

**Diagnosis bands:**

| Confidence | Diagnosis | Severity |
|---|---|---|
| < 0.35 | `NO_CALL` / `INSUFFICIENT_EVIDENCE` | — |
| < 0.55 | `DETECTED_…` | SUSPECTED / LOW |
| < 0.75 | `CLASSIFIED_…` | SUSPECTED / MEDIUM |
| < 0.90 | `SUSPECTED_…` | SUSPECTED / HIGH |
| ≥ 0.90 | `CONFIRMED_…` | CONFIRMED / HIGH — **only with VP present**; otherwise clamped to 0.89 and SUSPECTED |

**Temporal persistence:** the selected family must agree across `profile.persistenceMinAgree` of the last `profile.persistenceWindows` emissions. If not, the result is capped at `DETECTED_…` / SUSPECTED with confidence ≤ 0.54 and flagged `PERSISTENCE_CAP`.

**Families:** `STICTION`, `OSCILLATION`, `EFFORT`, `CONSTRAINT`, `NONE`.

**Reason-code vocabulary** (surfaced to the UI verbatim): `NO_VALID_CYCLE`, `NO_VP`, `EFFORT_BELOW_FLOOR`, `OP_TRAVEL_BELOW_FLOOR`, `AREA_BELOW_BAND`, `AREA_OUT_OF_BAND`, `CORNER_NOISE_FLOOR`, `FAMILY_DISQUALIFIED`, `INSUFFICIENT_SAMPLES`, `NO_STEP_TEST`, `GEOMETRY_ALONE_FORBIDDEN`, `DISTURBANCE_CONTEXT`, `PERSISTENCE_CAP`, `PERIOD_OUT_OF_BAND`, `EXCLUDED_DATA_QUALITY`, `EXCLUDED_MODE`, `EXCLUDED_OPERATING_REGION`, `EXCLUDED_SENSOR`.

---

## 4. Loop dynamics profiles (governed tuning)

Thresholds are **not** global constants — they are resolved per loop class. Versions travel with every result: `calculationVersion = 3.0.0`, `dynamicsProfileVersion = 2.0.0`.

| Class | Dynamic class | τ min/max (s) | minValidCycles | cornerDeg | opDeadband% | opTravelFloor% | effortFloor | area lo/hi | geometry prior | integrating | geometry role |
|---|---|---|---|---|---|---|---|---|---|---|---|
| FIC | FAST_SELF_REG | 10 / 900 | 5 | 65 | 0.5 | 2.0 | 0.05 | 0.05 / 1.5 | 0.5 | no | SUPPORTING |
| PIC | FAST_SELF_REG | 5 / 1800 | 5 | 60 | 0.5 | 2.0 | 0.05 | 0.05 / 1.5 | 0.5 | no | SUPPORTING |
| PIC_GAS | INTEGRATING | 120 / 14400 | 3 | 50 | 0.5 | 1.5 | 0.04 | 0.05 / 2.0 | 0.3 | **yes** | DISPLAY_ONLY |
| PIC_VAPOUR | SLOW_SELF_REG | 300 / 28800 | 3 | 45 | 0.25 | 1.0 | 0.03 | 0.05 / 2.0 | 1.0 | no | PRIMARY |
| LIC | INTEGRATING | 120 / 14400 | 3 | 50 | 0.5 | 1.5 | 0.04 | 0.05 / 2.0 | 0.3 | **yes** | DISPLAY_ONLY |
| TIC | SLOW_SELF_REG | 300 / 28800 | 3 | 45 | 0.25 | 1.0 | 0.03 | 0.05 / 2.0 | 1.0 | no | PRIMARY |
| UNKNOWN | FAST_SELF_REG | 5 / 86400 | 5 | 65 | 0.5 | 2.0 | 0.05 | 0.05 / 1.5 | **0.0 (off)** | no | DISPLAY_ONLY |

Global defaults: `acfRegularityMin = 0.10`, `fftPeakToMedianMin = 3.0`. Service objective `AVERAGING` relaxes `spRangePassMax = 5.0` and `goodErrorPctPassMin = 0.30`.

**Class resolution order:** explicit override → declared `loopType` → ISA first-letter inference from the tag name (F→FIC, T→TIC, P→PIC, L→LIC).

**Profile delivery:** embedded Java defaults, overridden by a classpath YAML pack, optionally overridden at runtime by a broadcast parameter-set stream so thresholds can be re-governed without redeploying jobs. The resolved profile is attached to each sample at ingest, so a window's verdict never depends on task-local state.

---

## 5. Window model

Four concurrent window classes, all event-time, half-open `[start, end)`:

| Purpose | Windows | Allowed lateness |
|---|---|---|
| Short features (G0–G4) | 1 min tumbling; 5 m/1 m, 10 m/2 m, 15 m/5 m, 30 m/5 m, 60 m/5 m sliding | 30 s → 3 min by size |
| Long diagnostics (G5–G11) | 4 h, 12 h, 24 h slices emitted on a 15-minute event-time timer from a rolling buffer | buffer retained 24 h + 10 min |
| Fusion (G12–G15) | joins the matching short + long results; fires on 12 h/24 h long records | 2 min out-of-orderness + 1 min idleness |
| Historical replay | bounded batch, 24 h tumbling, **zero** out-of-orderness | n/a |

Minimum 32 samples for long diagnostics.

---

## 6. What the operator/engineer sees

Twelve screens, already prototyped as a UI (separate project) that this backend must feed:

**Operations** — fleet overview (plant health, loops in service, bad actors, data confidence); asset/loop explorer with live faceplate and 8-hour trend; performance view with a loops × time heatmap and a loops × 17-gates status matrix; event list with acknowledge/shelve.

**Engineering** — investigation workspace (live vs historical, decision trace per gate, competing hypotheses with scores, next-best-action); historical explorer (PV/SP/OP + KPI overlay + diagnosis bands + mode/quality tracks); window inspector (stored emitted windows, expected vs actual samples, late/out-of-order counts, per-window Result IDs); evidence replay (raw → normalized → detrended → windowed → transformed → calculated, with the gate's formula, threshold and fusion role); calculations catalogue (~143 named metrics with definitions, windows, versions and acceptance thresholds).

**Configuration** — loop registry with an onboarding wizard and bulk CSV import; pipeline health (Flink jobs, watermark lag, Kafka lag, checkpoint success); governance (approval queue, audit trail, separation of duties).

Two data routes are required by these screens:
- **Live** — ~1 Hz PV/SP/OP/MODE/quality per loop plus KPI badges, pushed, sub-2 s.
- **Historical** — decimated trends over arbitrary ranges, plus persisted window results and *as-of* recompute that resolves the calculation/profile version effective at that time without perturbing the live pipeline.

---

## 7. Deliberately not implemented (planned extensions)

Do not assume these exist: Harris / minimum-variance index, settling time, overshoot, rise time, decay ratio, quantitative stiction magnitude (deadband + slip-jump), Hurst exponent, bicoherence, real FOPDT model identification for G12, real cross-correlation interaction analysis for G13, and economic/savings rollups.

All are additive: new fields on existing payloads behind a schema-version bump plus profile-driven thresholds. **No existing formula changes when they are added.**

---

## 8. Non-negotiables for the port

1. The gate math, thresholds, fusion rules and diagnosis bands transfer **unchanged**. They are validated against a golden reference loop with a committed expected-output test.
2. Compute stays in Flink. Do not reimplement gates in an API, a database view, or the UI.
3. Result payloads may only be extended additively, with `schemaVersion` bumped.
4. Every stored result keeps `calculationVersion` and `dynamicsProfileVersion`.
5. Windows stay half-open; timestamps stay epoch-milliseconds on the wire.
6. Quality and mode must be visible on reopen — never paint a stale "Good".
