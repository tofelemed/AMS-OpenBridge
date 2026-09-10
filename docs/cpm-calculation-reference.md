# CPM Calculation Reference — as-implemented formulas, gates & constants

**Purpose:** the exact computational logic of the CPA/CPM chain end to end — the ingestion
joiner that manufactures the engine's input (§0), the four deployed CPLM Flink jobs (§1-§7),
persistence (§8), the read-time values cplm-api derives for the UI (§9) and the replay path
(§10) — extracted from source, so control engineers can audit it against real loop behaviour.
Nothing here is the textbook version: it is what the code computes, including the parts
flagged for review (§11). Calc version 3.0.0 · dynamics pack 2.0.0.

**Deployed jobs** (flink-job-supervisor.sh:104-116): `CplmShortFeatureStreamJob`,
`CplmLongDiagnosticsStreamJob`, `CplmGateFusionStreamJob`, `LoopLiveRbeJob`.
(`CplmHistoricalReplayJob` runs on demand from cplm-api recompute; `CplmGateStreamJob` is dead code.)
Source root: `src/flink/src/main/java/com/ams/flink/cplm/`.

---

## 0. Ingestion layer — what produces the input contract (`ingestion-service`)

Everything in §1 is manufactured here, from per-parameter OT MQTT messages. Source:
`src/services/ingestion-service/Pipeline/`. One MQTT message = one parameter of one loop;
the engine needs a merged PV/SP/OP tuple, so the joiner builds it.

**Topic → identity** (`OtTopicParser`): template-driven, `{site}/{fcs}/{class}/{loop}/{param}`
captures; a level-count mismatch dead-letters `TOPIC_SHAPE_MISMATCH`. Default template
`{ns}/{site}/{fcs}/{class}/{loop}/{group}/{param}`.

**Payload → value** (`OtPayloadParser`): `value` may be a number, bool (1.0/0.0) or numeric
string; `ts` may be epoch-ms or ISO-8601. Missing `value`/`ts` ⇒ `MISSING_FIELD` /
`BAD_TIMESTAMP`; `ts > now + future_skew_max_seconds` (default 300) ⇒ `FUTURE_TIMESTAMP`.

**Parameter → role** (`LoopParameterMapper`, per-source `param_roles`): built-in
`PV→pv, SP→sp, OP→op, MODE→mode, VP→vp, SV→sp, MV→op, P/I/D/GW→` numeric extension fields.
`param_roles` **overlays** that map (a `null` value removes an entry; a map that leaves
pv/sp/op/mode unreachable is refused at save time). An unmapped parameter parks
(`UNKNOWN_PARAMETER`) — it is never guessed. `vp` is optional: absent from the tuple when the
loop publishes none, and outside the GOOD/BAD verdict.

**MODE translation** (`ResolveMode`): an integral numeric keys `mode_value_map` by its integer
form (`4.0` → `"4"`); **an unmapped key passes through raw**. `mode_value_map` defaults to
**empty**, so without configuration MODE reaches the engine as `"4"`, which §1's auto
vocabulary does not recognise → `autoPct = 0` → **G1 EXCLUDED for every window** (§11 flag 23).

**Joining** (`LoopJoiner`): per-loop last-known value per role; emission on a steady grid
(`grid_seconds`, default 5 s); slower on-change signals are **forward-filled**. No tuple is
emitted until pv, sp and op have each been seen once.

- **`event_ts_ms` = OT process time** — the newest source `ts` among the tuple's members, never
  the grid boundary and never ingestion time. `ingest_ts_ms` carries the wall clock separately
  so lag and gateway clock drift stay measurable.
- **A tick where no member advanced is skipped, not re-stamped.** A repeated `event_ts_ms`
  would overwrite the previous row in IoTDB (device+timestamp is the key). Consequence: a loop
  whose gateway goes quiet produces a **gap**, not steady forward-filled data.
- **`quality` = worst-of the OT quality tags on pv/sp/op** (`GOOD` iff all three are good).
  Values are never aged out — only the source may call a value bad. VP, MODE and the PID
  extras do not affect it.
- Quality is read **only when the JSON field is a string**; a numeric `"quality": 0` is treated
  as absent and defaults to `GOOD` (§11 flag 24).

**What each gate needs from this layer**

| Gate | Ingestion-level requirement | Failure mode when unmet |
|---|---|---|
| G0 | steady cadence per loop; good `quality`; no duplicate `event_ts_ms` | sparse/irregular publishing ⇒ completeness < 0.95 ⇒ WARN/FAIL |
| G1 | `mode_value_map` translating the DCS enum into the auto vocabulary | raw enum ⇒ `autoPct = 0` ⇒ **EXCLUDED**, whole window discarded |
| G2 | SP in the EU the profile's `spRangePassMax` assumes | EU mismatch ⇒ permanent WARN |
| G2r | OP inside 0–100 after normalisation (`opEngMin/Max` evidence when OP is a fraction) | 0–1 OP without evidence ⇒ region and saturation meaningless |
| G3, OCE | a declared `pvEngMin/Max`, or PV/SP in a unit where ±0.5 EU is meaningful | undeclared EU loops ⇒ `goodErrorPct ≡ 0` ⇒ permanent WARN, OCE ≡ 0. Measured on HDPE before the fix: 0/6 temperature loops inside the band (profile needs 50 %), 3/6 level loops (needs 30 %) |
| G5–G11 | ≥ 32 samples per long slice and ≥ 12 h of continuity | gaps ⇒ INSUFFICIENT_DATA |
| G14 | a mapped VP parameter | confidence capped 0.89, CONFIRMED unreachable |

Dead letters (`traverse.ingestion.ot-dlq`) plus the parked-source inventory are the audit trail;
`ingestion_ot_deadletter_total{reason}` and `ingestion_loop_ticks_skipped_total` are the metrics
that show data never reaching the engine.

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
`goodErrorPct` counts `|err| ≤ goodErrorBand`, where
`goodErrorBand = goodErrorBandPctOfSpan × (pvEngMax − pvEngMin)` (default `0.005 × 100 = 0.5`,
i.e. identical to the old hardcoded constant for any loop that declares no PV range; an
unusable span falls back to 0.5 rather than 0). **This is the only place `pvEngMin/Max` is
read.** `spRangePassMax` is still compared to **raw-EU** SP range — see §11 flag 1.

**Saturation** (:704-730): at-limit iff `op ≤ 5.0 ∨ op ≥ 95.0` (inclusive; profile-overridable);
`occupancy = sat/n`; `cyclingPattern = exits ≥ 3 ∧ occupancy ≥ 0.02`.

**OCE** `= autoPct × goodErrorPct × (1 − saturationPct)` ∈ [0,1].
**Gate 3 base performance:** `goodErrorPct ≥ goodErrorPctPassMin` (0.50 TIGHT / 0.30 AVERAGING).

**Effort** (population std throughout): `effortRatio = std(op)/std(pv)`;
normalized variant divides each std by its span. `opTravel = Σ|Δop|`;
`travelPerDay = opTravel × 24/windowHours` (linear extrapolation — §11 flag 7);
reversal = sign flip of Δop with `|Δop| > 1e-9`; `freezeIndexS` = longest run `|Δpv| ≤ 1e-9` × Δt.
**Gate 4 effort:** `effortRatio > 8.0 → STRONG`, `> 3.0 → WARN`, else PASS (hardcoded).

## 3. Long-diagnostics job — Gates 5–11

Not a Flink window: keyed `ListState` buffer, **15-min event-time timer**, retention 24h10m.
On fire, three slices `[t−4h, t)`, `[t−12h, t)`, `[t−24h, t)`; each emits only with
**≥ 32 samples**, and each carries `alignedShort` = short features over the same slice.

**Shape signal** = PV when profile `integrating` (LIC, PIC_GAS) else OP; linear-detrended, mean-removed.

**ACF period** (:738-788) — zero-crossing, not peak-picking: `γ0 = Σx²/n`, `ρk = (Σx·x₊k/(n−k))/γ0`
(mixed estimators — §11 flag 2); period = median of `2×(crossing spacing)×Δt`;
`regularity = min(1, period/(3·std(periods)))`. **Gate 5:** period found → WARN, else PASS.

**FFT** (:799-903) — naive DFT, no window function; `amp_k = 2√(re²+im²)/n`;
band = `[tauMinS, tauMaxS] ∩ period ≤ n·Δt/3`; `peakToMedian = peak/median(in-band)`;
`peakRatio = peak² / Σ_all amp²` (**full-spectrum denominator** — §11 flag 3);
harmonics from bins ×2,×3,×5; spectral entropy over `max(3·peakBin, 32)` bins.
**Gate 6:** `peakRatio > 0.5 → WARN`.

**Period validation** — ACF-first: ACF valid iff in-band ∧ `regularity ≥ 0.10`;
FFT valid iff in-band ∧ `peakToMedian ≥ 3.0`; harmonic fold accepts `acf/fft ≈ k ∈ [2,5]`
within `0.15k`. In-band requires `≥ 8 samples/period`.

**Gate 7 triangularity** (:921-995): per validated cycle, min-max normalize to [−1,1];
LS-fit one sine harmonic vs phase-searched triangle `1−4|t−0.5|`;
`score = sseSin/(sseSin+sseTri)` averaged; `> 0.8 → STRONG` (needs VALID period).

**Gate 8 Horch oddness** (:997-1032): standardized cross-correlations `φ±(k)` to lag
`min(200, n/4)` (guard requires `n ≥ 202` — §11 flag 16);
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

**G12** = step-test evidence present ? PASS : NOT_EVALUATED (**no computational effect** — §11 flag 17).
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

**Family scores** = detector score × class prior *when qualified* (raw otherwise — §11 flag 13).
**Selection** = argmax over qualified families (tie → stiction > oscillation > effort > geometry).
**Confidence** = `min(familyScore, g14Cap)`.

**Diagnosis bands:** `<0.35 NO_CALL` · `<0.55 DETECTED…` (LOW) · `<0.75 CLASSIFIED…` (MEDIUM) ·
`<0.90 SUSPECTED…` (HIGH) · `≥0.90 ∧ VP → CONFIRMED_FINAL_ELEMENT_NONLINEARITY` (no VP → re-cap 0.89).

**Persistence:** needs the same family in ≥ 2 of the last 3 windows (per windowKind);
otherwise demoted to DETECTED/LOW and confidence capped **0.54**.

*(A weighted composite `0.15·osc+0.15·fft+0.15·effort+0.20·stiction+0.20·horch+0.15·geometry`
is published as `raw_final_element_score` but drives no decision — §11 flag 12.)*

## 5. Live RBE job

`loop.samples` (**latest offsets**) → explode to per-metric points (pv/sp/op/vp/mode/quality)
→ keyed deadband filter → `traverse.cpa.live.loop.metrics`.
Emit iff first observation, numeric `|Δ| > deadband` (strict), or any string change.
**Deadband = 0.05 absolute EU, one scalar for all roles** (`--deadband`, supervisor
`CPLM_LIVE_DEADBAND`). **No heartbeat timer exists** (§11 flags 9-10).

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
(prefix F/P/L/T, then 3-letter substring — §11 flag 18) → UNKNOWN.

## 7. Evidence gating (metadata topic `traverse.cpa.ams.metadata.updates`)

Published by cplm-api republish/activate: `cplm.loop.evidence`
(`hasStepTest` ⇐ `monitoring.evidence.stepTestApproved`; `hasPeerLinks` ⇐ `cpm.loop_link` rows)
and `cplm.loop.engineering` (`opEngMin/Max` when registry has them).

| Evidence | Without | With |
|---|---|---|
| step test | G12 NOT_EVALUATED (no numeric effect either way) | G12 PASS |
| peer links | disturbance soft-block can't fire → disturbed loops diagnosable as stiction | stiction disqualified when osc ∧ ¬stress |
| VP signal | confidence capped 0.89; CONFIRMED unreachable | cap 1.0; CONFIRMED at ≥ 0.90 |
| opEngMin/Max | OP used raw (0-1 OP makes saturation & G2r meaningless) | OP rescaled to 0-100 before all gate math (G2r, G4, G10, effort/travel/reversals, Horch, geometry) |
| pvEngMin/Max | good-error band fixed at ±0.5 EU — unreachable on a wide-span loop | band = 0.5 % of declared PV span; scales G3 and OCE |
| dynamics override | class pack | any threshold overridable per loop/class via spine |

## 8. Persistence (cplm-api)

No server-side KPI derivation — columns copy Flink JSON verbatim (+ full payload JSONB).
Upsert key `(loop_id, window_kind, window_end, source)` guarded by
`EXCLUDED.sample_count ≥ existing`. JSON `null` → SQL NULL (preserves "not computed");
absent key → 0.0 (legacy). KPI dual-write to IoTDB `…<loop>.kpi.<family>` at windowEnd,
nulls dropped. Event frames per `(loop, windowKind, family)`; `peak_confidence` ratchets;
non-`flink` sources can't rewrite the timeline. The API's window-spec table is a
hand-maintained mirror of the job constants (verified matching today).

## 9. Derived values in cplm-api (no gate maths, but they drive the UI)

Everything below is computed at read time from `analytics.cplm_*`; none of it re-derives a gate.

**Latest verdict per loop** (fleet summary, rankings, heatmap): `DISTINCT ON (loop_id)` ordered
by `window_end DESC NULLS LAST, created_at DESC`, filtered to the requested `window_kind`.
Summary additionally **excludes `INSUFFICIENT_DATA`** so the diagnosis histogram counts only
real verdicts; rankings instead sort real verdicts first and keep unevaluated loops visible at
the bottom as `NOT_EVALUATED`.

**Fleet capability counters** (`cpm.loop_registry`): `total`, `monitored`
(`monitoring.enabled`), `withPeerLinks` (`monitoring.evidence.peerLinksConfigured`), `withVp`
(`tags ? 'vp'`). These are capability caveats, not decoration — a fleet without VP can never
report CONFIRMED, and one without peer links cannot separate stiction from an upstream
disturbance.

**Ranking order** is server-side by necessity: the caller applies `LIMIT`, so re-sorting a
returned page ranks a subset chosen by a different metric. Whitelisted expressions —
`confidence DESC` · `good_error_pct ASC` (share-inside-band, so lower is worse) · `mae DESC` ·
`effort_ratio DESC`; anything else is a 400. `limit` clamped 1–200 (heatmap 1–300).

**Confidence bands** (`/events`, G15): `NO_CALL ≤ 0.35 < DETECTED ≤ 0.55 < CLASSIFIED ≤ 0.75
< SUSPECTED ≤ 0.90 < CONFIRMED ≤ 1.00`.

**Event frames** (`CplmEventFrameService`, keyed `(loop_id, window_kind, family)`): `family` =
diagnosis minus the `CONFIRMED_|SUSPECTED_|DETECTED_|CLASSIFIED_` prefix. Non-fault verdicts
(`EXCLUDED*`, `INSUFFICIENT_DATA`, `INSUFFICIENT_EVIDENCE`, `NO_CALL`) **close** an open frame
instead of opening one. `peak_confidence` only ratchets upward (`GREATEST`), and
`peak_diagnosis` follows it only when the new confidence is strictly higher — an episode is
remembered by its worst moment. `window_count` increments per contributing window. Replay rows
are ignored (`source != 'flink'` returns early), so a recompute cannot rewrite the operational
timeline.

**Readiness** (`/loops/{id}/readiness`): `ready = blockers.Count == 0`;
`degraded = ready ∧ warnings.Count > 0`. Blockers: registry row, monitoring enabled, the four
required tags, and all four CPLM jobs RUNNING. Warnings: loop type UNKNOWN, no VP, no peer
links, binding provenance ≠ `asset-model`, missing evidence.

**KPI stream** (`/loops/{id}/kpis`): a projection, not an aggregation — long resolutions select
the long-feature columns, short resolutions the short ones; `limit` clamped 1–500, `before`
paginates by `window_end`. Consistent with §8: the API never recomputes a KPI.

## 10. Historical replay / recompute (`CplmHistoricalReplayJob`)

Triggered by `POST /loops/{id}/recompute`; reads the loop's history from IoTDB rather than the
live topic and re-runs the same gate engine, tagged `source != 'flink'` and stamped with a
`replay_id`. Two consequences worth knowing before trusting a replayed number:

- It writes **gate results only** — no short/long feature rows — so `/kpis` stays empty for a
  loop that has only ever been recomputed.
- Because event frames ignore non-`flink` sources, a replay never opens or closes an episode.

This is the sanctioned path for data older than the streaming watermark (2 min): late samples on
`traverse.cpa.loop.samples.v1` are dropped by Flink, so an outage backlog must be replayed here,
never re-published to the live topic.

## 11. Review flags — for the control-engineering session

**Highest priority (unit correctness):**
1. **`spRangePassMax` is compared to a raw-EU SP range** (GateEngine:181) — `max(sp)−min(sp)`
   is never normalised, so the 1.0 default means "1 % of span" on a 0-100 loop but "1 t/h" on a
   flow loop and "1 °C" on a furnace. G2 is therefore a permanent WARN for whole equipment
   classes, and **declaring `pvEngMin/Max` does not help it** — the PV span feeds only the
   good-error band. Fixing it means either normalising SP the way OP is normalised, or
   expressing `spRangePassMax` as a fraction of the PV span (the CHG-004 shape).
   ~~`GOOD_ERROR_BAND = 0.5 absolute EU, hardcoded`~~ — **resolved 2026-09-09 (CHG-004)**: the
   band is now `goodErrorBandPctOfSpan × PV span`, verified live. G2 is the remaining half of
   this unit-correctness pair and is the larger one left.
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

**Ingestion-layer (added 2026-09-09, §0):**
23. **`mode_value_map` defaults to empty, and a wrong map inverts the fleet** — an unmapped
    MODE passes through raw, so a numeric DCS enum reaches the engine as `"4"`, fails the auto
    vocabulary, and **excludes every window of every loop on G1**. Highest-impact configuration
    trap in the chain: G0 still passes, so the data looks healthy while no verdict is ever
    produced. Hit on the HDPE plant 2026-09-09: the deployed map named `4` as AUT, while the
    SME-confirmed CENTUM enum is `1=AUT, 2=MAN, 3=CAS, 4=MAN IMAN` — so every AUT loop was
    excluded and idle IMAN loops were analysed. Note `3=CAS` must be mapped too: a cascade slave
    counts as auto. See runbook §2 "MODE enum".
24. **Numeric `quality` is ignored** — `OtPayloadParser` reads the field only when it is a JSON
    string, so `"quality": 0` (OPC Bad) is read as absent and defaults to `GOOD`. Bad process
    data would be published as good. Harmless while the gateway sends `"GOOD"`; a silent
    integrity risk the moment it sends OPC integers.
25. `IngestionMetrics.SourceLatency` discards negative values, so a gateway clock running *ahead*
    of the server is invisible in the latency histogram.
26. **Two mode classifiers, three-way vs two-way** — the engine's `isAutoMode()` is binary
    (auto / not-auto), the UI's `classifyMode()` returns auto/manual/**unknown** and adds an
    `includes('MAN')` rule the engine lacks. For an unmapped vendor value the engine silently
    counts *not-auto* while the UI shows *unknown*, so an excluded fleet does not read as
    "everything is in manual" on screen. They agree on every mapped CENTUM token.
