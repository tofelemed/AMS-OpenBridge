# CPM Calculation Reference — as-implemented formulas, gates & constants

**Purpose:** the exact computational logic of the four deployed CPLM Flink jobs, extracted
from source with file:line citations, so control engineers can audit it against real loop
behaviour. Nothing here is the textbook version — it is what the code computes, including
the parts flagged for review (§9). Calc version 3.0.0 · dynamics pack 2.0.0.

**Deployed jobs** (flink-job-supervisor.sh:104-116): `CplmShortFeatureStreamJob`,
`CplmLongDiagnosticsStreamJob`, `CplmGateFusionStreamJob`, `LoopLiveRbeJob`.
(`CplmHistoricalReplayJob` runs on demand from cplm-api recompute; `CplmGateStreamJob` is dead code.)
Source root: `src/flink/src/main/java/com/ams/flink/cplm/`.

---

## 1. Shared input contract (`CplmNormalizedSample.java`)

- `pv`, `sp`, `op` mandatory and numeric or the sample is **dropped** (:66-69). `vp` nullable —
  its presence drives G14. `mode` defaults `UNKNOWN`, `quality` defaults `GOOD`.
- **Good quality** (:106-117): null/empty, starts with `g`/`G`, or integer ≥ **192** (OPC).
  UNCERTAIN counts as *not* good.
- **Auto mode** (:132-149): manual tokens checked first
  (`MAN,MANUAL,M,IMAN,ROUT,LO,LOCAL,OFF,TRACK`), then auto
  (`AUTO,AUT,A,AUTOMATIC,NORMAL,NORM,CAS,CASC,CASCADE,RSP,DDC,SUP,SUPERVISORY`);
  fallback `contains("AUTO")||contains("CASCADE")`. Cascade/RSP slaves count as auto.
- Ingest (`CplmIngestPipeline.java`): Kafka `committedOffsets(EARLIEST)`, watermark
  bounded-out-of-orderness **2 min** default, idleness 1 min.
- **Error convention: `err = SP − PV`** (CplmGateEngine:156). OP is normalized to 0-100
  via engineering evidence when present, else identity (:155).

## 2. Short-feature job — Gates 0–4, 2r

Six parallel epoch-aligned branches over `traverse.cpa.loop.samples.v1` →
`traverse.cpa.clpm.feature.short.v1`:

| Window | Type | Slide | Lateness |
|---|---|---|---|
| 1m | tumbling | — | 30 s |
| 5m | sliding | 1 m | 60 s |
| 10m | sliding | 2 m | 90 s |
| 15m / 30m | sliding | 5 m | 2 m |
| 60m | sliding | 5 m | 3 m |

**Sample period** = upper-median of consecutive Δt; hardcoded 5.0 s under 2 samples (:616-624).
**Eligibility:** `n ≥ 10` and G0 ≠ FAIL, else metrics emit as JSON `null` (record still emitted).

**Gate 0 data quality** (:119-133), ordered:
`badQualityPct ≥ 0.50 → FAIL`; `completeness ≥ 0.98 ∧ badQualityPct < 0.05 ∧ dupTs = 0 → PASS`;
`completeness ≥ 0.95 → WARN`; else FAIL. `completeness = n / round(windowSec/medianΔt)` — **not clamped to 1**.
Gap = `Δt > 1.5 × medianΔt`; `samplingJitter = popStd(Δt)/median(Δt)`.

**Gate 1 mode/service:** `autoPct ≥ 0.90 → PASS`, `≥ 0.70 → WARN`, else EXCLUDED.
**Gate 2 SP stability:** `max(sp)−min(sp) < spRangePassMax → PASS` else WARN — **raw EU**.
**Gate 2r operating region:** fraction of samples outside `[regionPvMin,regionPvMax]` /
`[regionOpMin,regionOpMax]`; `≤0.05 PASS`, `≤0.20 WARN`, else FAIL(window invalid).

**Error integrals** — zero-order-hold rectangles, last sample gets median Δt (:205-216):
`IAE = Σ|err|·Δt` (EU·s) · `ISE = Σerr²·Δt` (EU²·s) · `ITAE = Σ t·|err|·Δt` with **t anchored
to window start** (EU·s²). `MAE`/`RMSE` are per-sample arithmetic, not time-weighted.
`goodErrorPct` counts `|err| ≤ 0.5` — **0.5 absolute EU, hardcoded** (§9 flag 1).

**Saturation** (:704-730): at-limit iff `op ≤ 5.0 ∨ op ≥ 95.0` (inclusive; profile-overridable);
`occupancy = sat/n`; `cyclingPattern = exits ≥ 3 ∧ occupancy ≥ 0.02`.

**OCE** `= autoPct × goodErrorPct × (1 − saturationPct)` ∈ [0,1].
**Gate 3 base performance:** `goodErrorPct ≥ goodErrorPctPassMin` (0.50 TIGHT / 0.30 AVERAGING).

**Effort** (population std throughout): `effortRatio = std(op)/std(pv)`;
normalized variant divides each std by its span. `opTravel = Σ|Δop|`;
`travelPerDay = opTravel × 24/windowHours` (linear extrapolation — §9 flag 7);
reversal = sign flip of Δop with `|Δop| > 1e-9`; `freezeIndexS` = longest run `|Δpv| ≤ 1e-9` × Δt.
**Gate 4 effort:** `effortRatio > 8.0 → STRONG`, `> 3.0 → WARN`, else PASS (hardcoded).

## 3. Long-diagnostics job — Gates 5–11

Not a Flink window: keyed `ListState` buffer, **15-min event-time timer**, retention 24h10m.
On fire, three slices `[t−4h, t)`, `[t−12h, t)`, `[t−24h, t)`; each emits only with
**≥ 32 samples**, and each carries `alignedShort` = short features over the same slice.

**Shape signal** = PV when profile `integrating` (LIC, PIC_GAS) else OP; linear-detrended, mean-removed.

**ACF period** (:738-788) — zero-crossing, not peak-picking: `γ0 = Σx²/n`, `ρk = (Σx·x₊k/(n−k))/γ0`
(mixed estimators — §9 flag 2); period = median of `2×(crossing spacing)×Δt`;
`regularity = min(1, period/(3·std(periods)))`. **Gate 5:** period found → WARN, else PASS.

**FFT** (:799-903) — naive DFT, no window function; `amp_k = 2√(re²+im²)/n`;
band = `[tauMinS, tauMaxS] ∩ period ≤ n·Δt/3`; `peakToMedian = peak/median(in-band)`;
`peakRatio = peak² / Σ_all amp²` (**full-spectrum denominator** — §9 flag 3);
harmonics from bins ×2,×3,×5; spectral entropy over `max(3·peakBin, 32)` bins.
**Gate 6:** `peakRatio > 0.5 → WARN`.

**Period validation** — ACF-first: ACF valid iff in-band ∧ `regularity ≥ 0.10`;
FFT valid iff in-band ∧ `peakToMedian ≥ 3.0`; harmonic fold accepts `acf/fft ≈ k ∈ [2,5]`
within `0.15k`. In-band requires `≥ 8 samples/period`.

**Gate 7 triangularity** (:921-995): per validated cycle, min-max normalize to [−1,1];
LS-fit one sine harmonic vs phase-searched triangle `1−4|t−0.5|`;
`score = sseSin/(sseSin+sseTri)` averaged; `> 0.8 → STRONG` (needs VALID period).

**Gate 8 Horch oddness** (:997-1032): standardized cross-correlations `φ±(k)` to lag
`min(200, n/4)` (guard requires `n ≥ 202` — §9 flag 16);
`oddness = Σ|φ₊−φ₋| / (Σ|φ₊−φ₋| + Σ|φ₊+φ₋|)`; `> 0.7 → STRONG`. Always OP vs PV.

**Gate 9 phase-portrait** — per-cycle shoelace area on (PV,OP), normalized by bounding box;
corner score = fraction of turning-angle mass at vertices with angle ≥ `cornerAngleDeg`
(qualified variant also requires `|Δop| ≥ opDeadbandPct` at the vertex; **published headline
is the RAW score**). Ladder: no valid period / cycles < `minValidCycles` / area > Hi →
NOT_EVALUATED; area < Lo → PASS; effort < floor or OP travel < floor → NOT_EVALUATED;
`areaPerCycle > 0.30 → STRONG`; else PASS.

**Gate 10 saturation:** WARN iff `occupancy ≥ 0.05 ∨ maxDwell ≥ 30 samples ∨ cyclingPattern`.
**Gate 11 freeze:** WARN iff `freezeIndexS ≥ 60 ∧ freezeFraction ≥ 0.10` (both).
Also: PV quantization (distinct `round(pv·1000)`), drift/day (OLS slope × 86400),
spikes (`|Δpv−mean| > 3σ`).

## 4. Gate-fusion job — Gates 12–15, verdict

Consumes **only** `traverse.cpa.clpm.feature.long.v1`; the embedded `alignedShort` is the
short input (no temporal join needed — same slice by construction). **Only 12h/24h slices
fuse; 4h is KPI-only.** Output `traverse.cpa.clpm.gate.results.v1` (~120 keys + gates map).

**Blocking exclusions** (ordered): G0 FAIL → `EXCLUDED_DATA_QUALITY`; G1 EXCLUDED →
`EXCLUDED_MODE`; region invalid → `EXCLUDED_OPERATING_REGION`; G11 WARN ∧ freeze ≥ 60 s →
`EXCLUDED_SENSOR`. All zero confidence.

**G12** = step-test evidence present ? PASS : NOT_EVALUATED (**no computational effect** — §9 flag 17).
**G13** = peer links ? PASS : NOT_EVALUATED — and *with* peers, `oscillation ∧ ¬actuatorStress`
**disqualifies the stiction family** (disturbance context).
**G14** = VP present ? CONFIRMED_CAPABLE (cap 1.0) : INSUFFICIENT_EVIDENCE (**confidence cap 0.89**).

**Detector scores** (clamped [0,1]): osc=acfRegularity; fft=peakRatio; effort=effortRatio/8;
stiction=triangularity; horch=oddness; geometry=cornerScoreQualified (gated).
**Qualification** (`isQualified = score ≥ 0.55 ∨ gate STRONG/WARN`):
- oscillation: `isQualified(max(osc,fft), G5, G6)` (+ SLOW_SELF_REG Horch path)
- harmonicOrShape: G6 STRONG/WARN ∧ harmonicAmpRatio > 0.15, or G7/G8 STRONG/WARN, or scores ≥ 0.55
- actuatorStress: G4/G10 STRONG/WARN, effort ≥ 2×floor, opRange ≥ floor, satCycling, or reversals ≥ 3
- **stiction requires** oscillation (per `requireOscillationForStiction`) ∧ harmonicOrShape ∧
  actuatorStress ∧ ≥ 2 non-geometry evidences ∧ a shape/horch signal
- geometry selectable only if all three prerequisite evidences met (unless profile PRIMARY),
  family enabled, role ≠ DISPLAY_ONLY, and not `cornerQualified ≤ 0 ∧ cornerRaw > 0.5` (noise floor)

**Family scores** = detector score × class prior *when qualified* (raw otherwise — §9 flag 13).
**Selection** = argmax over qualified families (tie → stiction > oscillation > effort > geometry).
**Confidence** = `min(familyScore, g14Cap)`.

**Diagnosis bands:** `<0.35 NO_CALL` · `<0.55 DETECTED…` (LOW) · `<0.75 CLASSIFIED…` (MEDIUM) ·
`<0.90 SUSPECTED…` (HIGH) · `≥0.90 ∧ VP → CONFIRMED_FINAL_ELEMENT_NONLINEARITY` (no VP → re-cap 0.89).

**Persistence:** needs the same family in ≥ 2 of the last 3 windows (per windowKind);
otherwise demoted to DETECTED/LOW and confidence capped **0.54**.

*(A weighted composite `0.15·osc+0.15·fft+0.15·effort+0.20·stiction+0.20·horch+0.15·geometry`
is published as `raw_final_element_score` but drives no decision — §9 flag 12.)*

## 5. Live RBE job

`loop.samples` (**latest offsets**) → explode to per-metric points (pv/sp/op/vp/mode/quality)
→ keyed deadband filter → `traverse.cpa.live.loop.metrics`.
Emit iff first observation, numeric `|Δ| > deadband` (strict), or any string change.
**Deadband = 0.05 absolute EU, one scalar for all roles** (`--deadband`, supervisor
`CPLM_LIVE_DEADBAND`). **No heartbeat timer exists** (§9 flags 9-10).

## 6. Loop-dynamics profiles (`cplm/loop-dynamics-profiles.yaml`, pack 2.0.0)

| Key | FIC | PIC | PIC_GAS | PIC_VAPOUR | LIC | TIC | UNKNOWN |
|---|---|---|---|---|---|---|---|
| dynamicClass | FAST_SELF_REG | FAST_SELF_REG | INTEGRATING | SLOW_SELF_REG | INTEGRATING | SLOW_SELF_REG | FAST_SELF_REG |
| objective | TIGHT | TIGHT | AVERAGING | TIGHT | AVERAGING | TIGHT | TIGHT |
| tauMin/Max s | 10/900 | 5/1800 | 120/14400 | 300/28800 | 120/14400 | 300/28800 | 5/86400 |
| minValidCycles | 5 | 5 | 3 | 3 | 3 | 3 | 5 |
| cornerAngleDeg | 65 | 60 | 50 | 45 | 50 | 45 | 65 |
| opDeadbandPct | 0.5 | 0.5 | 0.5 | 0.25 | 0.5 | 0.25 | 0.5 |
| opTravelFloorPct | 2.0 | 2.0 | 1.5 | 1.0 | 1.5 | 1.0 | 2.0 |
| effortRatioFloor | 0.05 | 0.05 | 0.04 | 0.03 | 0.04 | 0.03 | 0.05 |
| phaseArea Lo/Hi | 0.05/1.5 | 0.05/1.5 | 0.05/2.0 | 0.05/2.0 | 0.05/2.0 | 0.05/2.0 | 0.05/1.5 |
| priorGeometry | 0.5 | 0.5 | 0.3 | 1.0 | 0.3 | 1.0 | **0.0 (off)** |
| integrating | – | – | ✓ | – | ✓ | – | – |
| geometryRole | SUPPORT | SUPPORT | DISPLAY | **PRIMARY** | DISPLAY | **PRIMARY** | DISPLAY |
| spRangePassMax | 1.0 | 1.0 | 5.0 | 1.0 | 5.0 | 1.0 | 1.0 |
| goodErrorPctPassMin | 0.5 | 0.5 | 0.30 | 0.5 | 0.30 | 0.5 | 0.5 |
| pvFilter (ewma) | 5 | 5 | 7 | 5 | 7 | 5 | 5 |

Globals: `acfRegularityMin 0.10`, `fftPeakToMedianMin 3.0`, sat 5/95 %, satWarnOccupancy 0.05,
persistence 3/2, minSamplesPerPeriod 8, `requireOscillationForStiction true`,
`minNonGeometryEvidences 2`. Java-only defaults (param-set overridable):
`satLimitDwellSamplesWarn 30`, region PV ∓∞ / OP 0-100, `opEngMin/Max 0/100`.
Parser is a hand-rolled regex reader (not a YAML lib); parse failure silently falls back to
an embedded value-identical table. Class resolution: override → loopType → tag inference
(prefix F/P/L/T, then 3-letter substring — §9 flag 18) → UNKNOWN.

## 7. Evidence gating (metadata topic `traverse.cpa.ams.metadata.updates`)

Published by cplm-api republish/activate: `cplm.loop.evidence`
(`hasStepTest` ⇐ `monitoring.evidence.stepTestApproved`; `hasPeerLinks` ⇐ `cpm.loop_link` rows)
and `cplm.loop.engineering` (`opEngMin/Max` when registry has them).

| Evidence | Without | With |
|---|---|---|
| step test | G12 NOT_EVALUATED (no numeric effect either way) | G12 PASS |
| peer links | disturbance soft-block can't fire → disturbed loops diagnosable as stiction | stiction disqualified when osc ∧ ¬stress |
| VP signal | confidence capped 0.89; CONFIRMED unreachable | cap 1.0; CONFIRMED at ≥ 0.90 |
| opEngMin/Max | OP used raw (0-1 OP makes saturation & G2r meaningless) | OP rescaled to 0-100 before all gate math |
| dynamics override | class pack | any threshold overridable per loop/class via spine |

## 8. Persistence (cplm-api)

No server-side KPI derivation — columns copy Flink JSON verbatim (+ full payload JSONB).
Upsert key `(loop_id, window_kind, window_end, source)` guarded by
`EXCLUDED.sample_count ≥ existing`. JSON `null` → SQL NULL (preserves "not computed");
absent key → 0.0 (legacy). KPI dual-write to IoTDB `…<loop>.kpi.<family>` at windowEnd,
nulls dropped. Event frames per `(loop, windowKind, family)`; `peak_confidence` ratchets;
non-`flink` sources can't rewrite the timeline. The API's window-spec table is a
hand-maintained mirror of the job constants (verified matching today).

## 9. Review flags — for the control-engineering session

**Highest priority (unit correctness):**
1. **`GOOD_ERROR_BAND = 0.5 absolute EU, hardcoded** (GateEngine:23) — on a t/h flow loop
   with ±5 error, `goodErrorPct ≡ 0` → G3 always WARN, OCE ≡ 0; on 0-100 % level it means
   ±0.5 %. Same class of issue: `spRangePassMax` compared to raw-EU SP range. *The two
   largest correctness risks in the engine.*
2. **ACF mixes estimators** — `γ0/n` but `γk/(n−k)`: ρ can exceed 1, inflated at long lags;
   biases the primary period detector.
3. **`fftPeakRatio` denominator is full-spectrum**, not the band the name/method claim —
   G6 far harder to trip than intended.

**Behavioral divergences:**
4. Two disagreeing G10 code paths (engine vs `fromJson` re-derivation).
5. `freeze_fraction` never deserialized → fusion's sensor-exclusion silently dropped the
   ≥ 0.10 condition G11 itself requires.
6. G7 and G9 segment cycles differently (round(period/Δt) vs n/completedCycles) yet fuse
   as corroborating evidence.
7. `travel_per_day` on the 1m branch is a 1440× extrapolation (reversals/hour: 60×).
8. `completeness` unclamped and self-referential (measures consistency with its own median Δt).
9. **RBE has no heartbeat** + `latest()` offsets: steady loops emit once ever; edge restart
   leaves snapshots empty until a value moves past deadband.
10. RBE deadband: one absolute scalar shared by pv/sp/op/vp — no percent-of-range, no per-role.

**Cosmetic / latent:**
11. `geometryScore` ternary contains dead logic. 12. `raw_final_element_score` drives nothing.
13. Family scores published on mixed scales (prior-weighted iff qualified). 14. Persistence
caps confidence 0.54 but not family_score, and forces severity LOW. 15. History retention
`max(3,windows)` vs agreement `max(minAgree,windows)` diverge if retuned. 16. Horch guard
needs n ≥ 202 though maxLag would allow n/4. 17. **G12 step-test has zero computational
effect** — engineers will assume otherwise. 18. Tag inference: leading `P`/`T` beats the
safer substring pass. 19. Quality `g*` prefix and mode `contains("AUTO")` are unbounded
against vendor vocabularies. 20. `gate2r_status` emitted twice. 21. Two dead functions with
shadow defaults. 22. ITAE anchored to sliding-window start — five different weights for the
same sample across overlapping 5m windows; only interpretable for step-aligned windows.
