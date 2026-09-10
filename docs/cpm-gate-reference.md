# CPM Gate Reference

Source of truth: `CplmGateEngine.java` (G0–G11), `CplmGateFusionEngine.java` (G12–G15),
`CplmLoopDynamicsProfile.java` (thresholds). Line numbers are from the current branch.

Tuple fields available to every gate: `loop_id, event_ts_ms, pv, sp, op, vp?, mode, quality,
loop_type`. `op[]` is normalised to 0–100 before use; `pv[]` and `sp[]` stay in raw EU.

---

## 1. Gate index

| Gate | Tier | Window | Decides | Possible statuses |
|---|---|---|---|---|
| G0 | short | 1/5/10/15/30/60m | data quality | PASS · WARN · **FAIL** |
| G1 | short | 1/5/10/15/30/60m | mode / service | PASS · WARN · **EXCLUDED** |
| G2 | short | 1/5/10/15/30/60m | SP stability | PASS · WARN |
| G2r | short | 1/5/10/15/30/60m | operating region | PASS · WARN · **FAIL** |
| G3 | short | 1/5/10/15/30/60m | control error | PASS · WARN |
| G4 | short | 1/5/10/15/30/60m | control effort | PASS · WARN · STRONG |
| G5 | long | 4/12/24h | oscillation (ACF) | PASS · WARN |
| G6 | long | 4/12/24h | oscillation (FFT) | PASS · WARN |
| G7 | long | 4/12/24h | waveform shape | PASS · STRONG · NOT_EVALUATED |
| G8 | long | 4/12/24h | Horch odd harmonics | PASS · STRONG |
| G9 | long | 4/12/24h | phase-plane geometry | PASS · STRONG · NOT_EVALUATED |
| G10 | long | 4/12/24h | OP saturation | PASS · WARN |
| G11 | long | 4/12/24h | sensor freeze | PASS · **WARN** |
| G12 | fusion | — | step-test evidence | PASS · NOT_EVALUATED |
| G13 | fusion | — | peer/upstream links | PASS · NOT_EVALUATED |
| G14 | fusion | — | VP availability | CONFIRMED_CAPABLE · INSUFFICIENT_EVIDENCE |
| G15 | fusion | — | final diagnosis | CONFIRMED · SUSPECTED · INSUFFICIENT_EVIDENCE |

**STRONG is not good.** On G4/G7/G8/G9 it means strong *evidence of a fault*, and it feeds the
fusion confidence upward. Only PASS is "healthy".

Bold statuses block the diagnosis — see §5.

---

## 2. Short-tier gates (G0–G4)

Preconditions, evaluated in this order:

| Condition | Effect |
|---|---|
| `G0 == FAIL` **or** `n < 10` | `sufficientData = false`; G2–G4 never computed; metrics zeroed |
| otherwise | all short gates evaluated, `sufficientData = true` |

### G0 — data quality

**Needs:** `event_ts_ms`, `quality`

```
tsSec           = median(Δt)                          // inferred sample period
expectedSamples = max(1, round(windowSec / tsSec))
completeness    = n / expectedSamples
badQualityPct   = count(quality != GOOD) / n
duplicateTs     = count of repeated event_ts_ms
```

Evaluated top-down, first match wins:

| # | Condition | Status |
|---|---|---|
| 1 | `badQualityPct ≥ 0.50` | **FAIL** |
| 2 | `completeness ≥ 0.98` **and** `badQualityPct < 0.05` **and** `duplicateTs == 0` | PASS |
| 3 | `completeness ≥ 0.95` | WARN |
| 4 | else | **FAIL** |

Evidence only (no effect on status): `gapCount` = intervals `> 1.5 × tsSec`, `maxGapS`,
`samplingJitter = popStd(Δt) / median(Δt)`.

### G1 — mode / service

**Needs:** `mode`, translated to the auto vocabulary (`AUT`, `CAS`) by `mode_value_map`

```
autoPct = count(isAutoMode) / n
```

| Condition | Status |
|---|---|
| `autoPct ≥ 0.90` | PASS |
| `autoPct ≥ 0.70` | WARN |
| else | **EXCLUDED** |

An unmapped DCS enum passes through raw, matches no token, counts as not-auto → `autoPct = 0`
→ EXCLUDED → the whole window is discarded.

### G2 — SP stability

**Needs:** `sp`

```
spRange = max(sp) − min(sp)              // RAW EU, never normalised
```

| Condition | Status |
|---|---|
| `spRange < profile.spRangePassMax` | PASS |
| else | WARN |

`spChangesPerHour = count(|sp[i]−sp[i−1]| > 1e−6) / hours` is reported but does **not** affect
the status. Declaring `pvMin/pvMax` does **not** help this gate — see §7.

### G2r — operating region

**Needs:** `pv`, `op`, `profile.regionPvMin/Max`, `profile.regionOpMin/Max`

```
outOfBand[i] = pv[i] ∉ [regionPvMin, regionPvMax]  OR  op[i] ∉ [regionOpMin, regionOpMax]
regionOutOfBandPct = count(outOfBand) / n
```

| Condition | Status | `operatingRegionValid` |
|---|---|---|
| `≤ 0.05` | PASS | true |
| `≤ 0.20` | WARN | true |
| else | **FAIL** | false |

Defaults: `regionPv = ±∞` (off unless configured), `regionOp = 0–100`.

### G3 — control error

**Needs:** `pv`, `sp`, and the loop's declared `pvEngMin/pvEngMax`

```
span          = pvEngMax − pvEngMin                       // default 100 − 0
goodErrorBand = goodErrorBandPctOfSpan × span             // default 0.005 × 100 = 0.5 EU
                → 0.5 when span is unusable (≤0, NaN, ∞) or the product underflows
goodErrorPct  = count(|sp[i] − pv[i]| ≤ goodErrorBand) / n
```

| Condition | Status |
|---|---|
| `goodErrorPct ≥ profile.goodErrorPctPassMin` | PASS |
| else | WARN |

Also emitted here:

```
OCE  = autoPct × goodErrorPct × (1 − saturationPct)
MAE  = mean(|err|)                RMSE = √mean(err²)          // per-sample, not time-weighted
IAE  = Σ|err|·Δt                  ISE  = Σerr²·Δt             // zero-order hold
ITAE = Σ t·|err|·Δt               // t anchored to window start
```

### G4 — control effort

**Needs:** `pv`, `op`

```
effortRatio = std(op) / std(pv)                           // population std, ddof=0
```

| Condition | Status |
|---|---|
| `effortRatio > 8.0` | STRONG |
| `effortRatio > 3.0` | WARN |
| else | PASS |

Scale-free variant reported alongside, not used for the status:
`effortRatioNormalized = (stdOp/opSpan) / (stdPv/pvSpan)`.

---

## 3. Long-tier gates (G5–G11)

Precondition: `n < 10` → returns immediately, no gate evaluated.
Windows are rolling 4h / 12h / 24h slices held in keyed state, not built-in Flink windows.

`shapeSignal = profile.integrating ? pv : op` — **PV** for the integrating classes (PIC_GAS,
LIC), **OP** for everything else. G5/G6 run on it after `linearDetrend` then mean-subtraction.

### G5 — oscillation, autocorrelation

**Needs:** detrended shape signal, `profile.tauMin/tauMax`

| Condition | Status |
|---|---|
| `acfPeriodS > 0` | WARN |
| else | PASS |

### G6 — oscillation, spectral

**Needs:** detrended shape signal (band-limited FFT, periods `> tauMax` excluded)

| Condition | Status |
|---|---|
| `fftPeakRatio > 0.5` | WARN |
| else | PASS |

### G7 — waveform shape (triangularity)

**Needs:** a VALID period, `cycleSamples ≥ profile.minSamplesPerPeriod`

| Condition | Status |
|---|---|
| `periodStatus != VALID` | NOT_EVALUATED |
| `triangularity > 0.8` | STRONG |
| else | PASS |

### G8 — Horch odd-harmonic index

**Needs:** `op`, `pv`

```
per lag k ≤ min(200, n/4), on standardised op/pv:
  phiPos = mean(u[i]·y[i+k])        phiNeg = mean(u[i+k]·y[i])
  oddSum  += |phiPos − phiNeg|      evenSum += |phiPos + phiNeg|
horchOddness = oddSum / (oddSum + evenSum)
```

| Condition | Status |
|---|---|
| `horchOddness > 0.7` | STRONG |
| else | PASS |

### G9 — phase-plane geometry

**Needs:** `pv`, `op`, a VALID period, `completedCycles`

Evaluated top-down, first match wins:

| # | Condition | Status | `gate9Reason` |
|---|---|---|---|
| 1 | `periodStatus != VALID` | NOT_EVALUATED | `NO_VALID_CYCLE` |
| 2 | `completedCycles < profile.minValidCycles` | NOT_EVALUATED | `NO_VALID_CYCLE` |
| 3 | phase area **above** `phaseAreaPerCycleHi` | NOT_EVALUATED | `AREA_OUT_OF_BAND` |
| 4 | phase area **below** `phaseAreaPerCycleLo` | PASS | `AREA_BELOW_BAND` |
| 5 | `effortRatio < profile.effortRatioFloor` | NOT_EVALUATED | `EFFORT_BELOW_FLOOR` |
| 6 | `opRangePct < profile.opTravelFloorPct` | NOT_EVALUATED | `OP_TRAVEL_BELOW_FLOOR` |
| 7 | `phaseAreaNormPerCycle > 0.30` | STRONG | — |
| 8 | else | PASS | — |

`opRangePct = max(op) − min(op)` on the normalised OP.

### G10 — OP saturation

**Needs:** `op` (normalised), `profile.satLowPct/satHighPct`

```
atLimit[i]     = op[i] ≤ satLowPct  OR  op[i] ≥ satHighPct       // 5 / 95, inclusive
occupancy      = count(atLimit) / n
maxDwellSamples= longest consecutive atLimit run
cyclingPattern = exits ≥ 3  AND  occupancy ≥ 0.02
```

| Condition | Status |
|---|---|
| `occupancy ≥ satWarnOccupancy (0.05)` **or** `maxDwellSamples ≥ satLimitDwellSamplesWarn (30)` **or** `cyclingPattern` | WARN |
| else | PASS |

### G11 — sensor freeze

**Needs:** `pv`, `tsSec`

```
freezeRunSamples = longest run of unchanged pv
freezeIndexS     = freezeRunSamples × tsSec
freezeFraction   = freezeRunSamples / n
materialFreeze   = freezeIndexS ≥ 60  AND  freezeFraction ≥ 0.10
```

| Condition | Status |
|---|---|
| `materialFreeze` | **WARN** |
| else | PASS |

Both conditions are required: a compressed historian makes long unchanged runs normal, so
absolute seconds alone excluded whole days.

---

## 4. Fusion gates (G12–G15)

If `shortF.sufficientData == false`: diagnosis `INSUFFICIENT_DATA`, confidence 0,
G12/G13 `NOT_EVALUATED`, G14/G15 `INSUFFICIENT_EVIDENCE`, `selectedFamily = NONE`.

### G12 — step-test evidence

**Needs:** `cplm.loop.evidence.hasStepTest` from the registry broadcast

| Condition | Status |
|---|---|
| `hasStepTestEvidence` | PASS |
| else | NOT_EVALUATED + flag `NO_STEP_TEST` |

No numeric effect on confidence either way.

### G13 — peer / upstream links

**Needs:** `cplm.loop.evidence.peers` from the registry broadcast

| Condition | Status |
|---|---|
| `hasPeerLinks` | PASS |
| else | NOT_EVALUATED + flag `NO_UPSTREAM_LINKS` |

With links present, oscillation without actuator stress soft-blocks a stiction call
(disturbance victim rather than culprit).

### G14 — valve position availability

**Needs:** a mapped `vp` on the tuple

| Condition | Status | Confidence cap |
|---|---|---|
| `hasVp` | CONFIRMED_CAPABLE | 1.00 |
| else | INSUFFICIENT_EVIDENCE + flag `NO_VP` | **0.89** |

### G15 — final diagnosis band

**Needs:** fused `confidence`, `hasVp`

| Confidence | Diagnosis | G15 | Severity |
|---|---|---|---|
| `< 0.35` | `NO_CALL` | INSUFFICIENT_EVIDENCE | LOW |
| `< 0.55` | `DETECTED_FINAL_ELEMENT_NONLINEARITY` | SUSPECTED | LOW |
| `< 0.75` | `CLASSIFIED_FINAL_ELEMENT_NONLINEARITY` | SUSPECTED | MEDIUM |
| `< 0.90` | `SUSPECTED_FINAL_ELEMENT_NONLINEARITY` | SUSPECTED | HIGH |
| `≥ 0.90` **and** `hasVp` | `CONFIRMED_FINAL_ELEMENT_NONLINEARITY` | **CONFIRMED** | HIGH |
| `≥ 0.90` **and** `!hasVp` | `SUSPECTED_FINAL_ELEMENT_NONLINEARITY`, confidence clamped to 0.89 | SUSPECTED | HIGH |

CONFIRMED is unreachable without VP.

---

## 5. Blocking rules

Checked in this order in the fusion job; the first match ends the diagnosis.

| # | Condition | Diagnosis | Confidence |
|---|---|---|---|
| 1 | `!sufficientData` | `INSUFFICIENT_DATA` | 0.0 |
| 2 | `G0 == FAIL` | `EXCLUDED_DATA_QUALITY` | blocked |
| 3 | `G1 == EXCLUDED` | `EXCLUDED_MODE` | blocked |
| 4 | `G2r == FAIL` or `!operatingRegionValid` | `EXCLUDED_OPERATING_REGION` | blocked |
| 5 | `G11 == WARN` **and** `freezeIndexS ≥ 60` | `EXCLUDED_SENSOR` | blocked |

G2, G3, G4, G5–G10 never block on their own — they contribute evidence weight only.

---

## 6. Per-class thresholds (pack 2.0.0)

| Key | FIC | PIC | PIC_GAS | PIC_VAPOUR | LIC | TIC | UNKNOWN |
|---|---|---|---|---|---|---|---|
| objective | TIGHT | TIGHT | AVERAGING | TIGHT | AVERAGING | TIGHT | TIGHT |
| `spRangePassMax` (G2) | 1.0 | 1.0 | **5.0** | 1.0 | **5.0** | 1.0 | 1.0 |
| `goodErrorPctPassMin` (G3) | 0.5 | 0.5 | **0.30** | 0.5 | **0.30** | 0.5 | 0.5 |
| `minValidCycles` (G9) | 5 | 5 | 3 | 3 | 3 | 3 | 5 |
| `effortRatioFloor` (G9) | 0.05 | 0.05 | 0.04 | 0.03 | 0.04 | 0.03 | 0.05 |
| `opTravelFloorPct` (G9) | 2.0 | 2.0 | 1.5 | 1.0 | 1.5 | 1.0 | 2.0 |
| `phaseArea` Lo/Hi (G9) | 0.05/1.5 | 0.05/1.5 | 0.05/2.0 | 0.05/2.0 | 0.05/2.0 | 0.05/2.0 | 0.05/1.5 |
| `minSamplesPerPeriod` (G7) | 8 | 8 | 8 | 8 | 8 | 8 | 8 |
| `tauMin/Max` s (G5/G6) | 10/900 | 5/1800 | 120/14400 | 300/28800 | 120/14400 | 300/28800 | 5/86400 |

Global, all classes: `satLowPct 5.0`, `satHighPct 95.0`, `satWarnOccupancy 0.05`,
`satLimitDwellSamplesWarn 30`, `goodErrorBandPctOfSpan 0.005`, `regionPv ±∞`, `regionOp 0–100`,
`opEngMin/Max 0/100`, `pvEngMin/Max 0/100`.

Every value above is overridable per loop or class through the parameter-set spine.

---

## 7. Where the declared engineering ranges land

| Range | Read by | Affects |
|---|---|---|
| `opMin`/`opMax` | `normalizeOp(op) = (op − opEngMin)/(opEngMax − opEngMin) × 100` | rewrites `op[]` before every consumer: **G2r, G4, G9, G10**, effort ratio, OP travel, reversals, Horch, geometry |
| `pvMin`/`pvMax` | `goodErrorBand() = goodErrorBandPctOfSpan × (pvEngMax − pvEngMin)` | **G3 and OCE only** |

Both are identity when undeclared: `normalizeOp` returns `op` unchanged for a 0–100 range, and
`goodErrorBand()` returns 0.5.

**G2 is not covered.** `spRange` is compared to `spRangePassMax` in raw EU and SP is never
normalised, so the 1.0 default means "1 % of span" on a 0–100 loop but "1 t/h" on a flow loop
and "1 °C" on a furnace — a permanent WARN for whole equipment classes. Declaring a PV range
does not change it. Open issue; see `cpm-calculation-reference.md` §11 flag 1.
