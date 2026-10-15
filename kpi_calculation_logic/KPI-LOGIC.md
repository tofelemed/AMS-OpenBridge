# Control-loop KPIs — calculation logic, proof and rationale

Status: rules approved 2026-10-10 (section 6). Phases 1–5 built and lab-checked (sections 3.3, 8, 10, 11). Open: plant probe (Q5).
Owner: CPA (cplm-api + frontend). Engine values come from the Flink CPLM jobs and are not changed by this work.

This file is the single reference for every Overview / Performance KPI: what it means, the exact formula, the data it is built
from, why it is the standard choice, how a user proves the number on screen (drill-down), and what is still open.

---

## 1. Principles

1. **One query behind each number.** A tile's count and its drill-down list come from the same server classification, so the
   count always equals the rows listed. A test enforces it.
2. **Every number explains itself.** The rule in words, the threshold, the window it was judged on and when it was computed are
   shown with the number.
3. **Proof chain, three clicks deep.**
   Tile (count, %, rule) → loop list (each loop's deciding value vs the threshold) → the loop's evidence
   (Calculations row with formula and history, Window Inspector for the evaluated window, trend with that window marked).
4. **No silent gaps.** A loop that cannot be judged is counted as *not assessable* with its reason. It is never dropped and never
   shown as 0. A value the engine could not compute is "not measured", never 0.
5. **Standard-based.** Each rule cites where it comes from. Thresholds are recorded in `prod_decision.md` and are configurable.

## 2. Where the numbers come from

| Source | Content | Cadence |
|---|---|---|
| `analytics.cplm_gate_results` (LIVE, `window_kind = 24h`) | one fused result per loop per evaluation: diagnosis, evidence score (`confidence`), gate statuses G0–G15, and the window metrics in `payload` | every 15 min per loop (24 h sliding window, 15 min step — `CplmLongDiagnosticsStreamJob` timer) |
| `analytics.cplm_gate_latest` | the newest of those rows per loop and window kind (fast read) | same |
| `cpm.loop_registry` | which loops are monitored; engineering ranges (`engineering.pvMin/pvMax/opMin/opMax`), VP declaration, criticality | on change |
| `analytics.cplm_event_frames` | episodes (opened / closed findings) | on change |

**Basis of every fleet KPI:** each monitored loop counted **once**, from its **newest LIVE 24 h result**, which must be **fresh**
(window end within the last **1 h** = four missed 15-minute evaluations). The 24 h window is the CPM industry default for a daily
performance verdict (long enough to contain several disturbance / oscillation cycles, short enough to follow the plant day to day).

### Diagnosis codes the engine writes (fusion, `DiagnosisBands.java`)

| Code | Meaning | Evidence score band |
|---|---|---|
| `INSUFFICIENT_DATA` | window failed data qualification (G0) — nothing judged | — |
| `EXCLUDED_MODE`, `EXCLUDED_OPERATING_REGION`, `EXCLUDED_INSTRUMENT_HEALTH`, `EXCLUDED_DATA_QUALITY`, `EXCLUDED_SENSOR` | window not judged on purpose (manual mode, outside the operating region, instrument fault) | — |
| `NO_CALL` | judged; evidence for any fault family below 0.35 | < 35 |
| `INSUFFICIENT_EVIDENCE` | judged; no fault family qualified | — |
| `DETECTED_<family>` | weak evidence | 35–55 |
| `CLASSIFIED_<family>` | moderate evidence | 55–75 |
| `SUSPECTED_<family>` | strong evidence | 75–90 (a valve claim without VP confirmation stops here) |
| `CONFIRMED_<family>` | established | ≥ 90 (valve claims also need G14) |

Families: `OSCILLATION`, `FINAL_ELEMENT_NONLINEARITY` (valve stiction / backlash), `EXCESSIVE_EFFORT`.

**Finding = `SUSPECTED_*` or `CONFIRMED_*`** (established). `DETECTED_*` / `CLASSIFIED_*` are *symptoms seen, not established*:
listed in drill-downs, not counted as findings (they would make the plant look worse on weak evidence — ISA-18.2's principle that
only actionable conditions are raised).

## 3. The KPIs

The fleet KPIs come in two kinds:
- **State (one per loop, sums to 100 % of monitored loops)** — where each loop stands now.
- **Condition (share of assessed loops, may overlap)** — what is wrong with the loops that could be judged.

### 3.1 State partition — every monitored loop in exactly one

| State | Rule (newest LIVE 24 h row of any diagnosis = *N*) | Why it is separate |
|---|---|---|
| **Assessed** | *N* fresh (≤ 1 h) and diagnosis is a verdict (`NO_CALL`, `INSUFFICIENT_EVIDENCE`, or any family band) | the loops a performance number can be computed for |
| **Not assessable** | *N* fresh and `INSUFFICIENT_DATA` or `EXCLUDED_*`, with the reason | the system works but this window cannot be judged — a **data / operation** fact, not a pipeline fault |
| **Stale** | *N* exists but is older than 1 h | the **pipeline / feed** stopped producing — normally 0; any value is an operations alarm |
| **Never evaluated** | no LIVE 24 h row at all | onboarding or mapping gap |

Assessed is then split: **Performing acceptably** (no finding) / **With a finding** (`SUSPECTED_*` / `CONFIRMED_*`) /
**Symptom only** (`DETECTED_*` / `CLASSIFIED_*`).

> Today's Overview mixes these: STALE = "newest *real* verdict older than 24 h", so a loop whose data has been insufficient for a
> day (a data fact) reads the same as a stopped pipeline, and HEALTHY counts `NORMAL / NONE / HEALTHY`, codes the engine never
> writes — Healthy is always 0. See section 5.

### 3.2 KPI catalogue

Each entry: definition · formula · inputs (stored field) · threshold · denominator · why (reference) · drill-down columns (proof).

#### K1 — Performing acceptably
- **Definition:** share of monitored loops whose fresh fused verdict identified no fault AND that meet the performance criteria:
  in normal mode, not at an OP limit, good-error share at or above the profile floor, actuator activity not strong.
- **Formula:** `count(loops: state = Assessed AND diagnosis ∈ {NO_CALL, INSUFFICIENT_EVIDENCE} AND auto_pct ≥ 0.95 AND
  saturation_pct ≤ 0.10 AND gates.G3 = PASS AND gates.G4 ≠ STRONG) / monitored`.
  A no-fault loop that misses any criterion is outcome *No fault, but limited*, and the drill-down names each one missed
  (`limitedBy`: OUT_OF_MODE, SATURATED, G3_BELOW_FLOOR, G3_NOT_EVALUATED, G4_STRONG). Lab finding 2026-10-10: a loop 27 % of
  the time at its OP limit had a NO_CALL verdict — no authority, so not acceptable.
- **Why the performance gates (CHG-093, SME review 2 #12; user decision 2026-10-14):** "no fault identified" is a DIAGNOSTIC
  result (no family reached the evidence threshold); it does not say the loop controls well. G3 (good-error share vs the
  profile's class-aware floor, CPLM-014) and G4 (actuator activity vs the profile's warn / high ratios, CPLM-020) are the
  engine's own performance gates on the same window. A G3 that was not evaluated is not a pass; G4 WARN is allowed (only
  STRONG excludes), so ordinary activity is not penalised.
- **Inputs:** `diagnosis`, `payload.auto_pct`, `payload.saturation_pct`, `payload.gates.G3`, `payload.gates.G4`, `window_end`.
- **Why:** the headline number of CPM tools and field surveys ("share of loops performing acceptably"; Desborough & Miller 2002,
  Bauer et al. 2016). Denominator is *all monitored loops*, so un-assessed loops pull it down visibly instead of hiding.
- **Drill-down:** loop · verdict word · evidence score · AUTO % · window end · links (Explorer, Calculations G15 row).

#### K2 — Service factor (in normal mode)
- **Definition:** share of loops spending at least **95 %** of the window in their normal mode (AUTO / CASCADE).
- **Formula:** `count(fresh rows with auto_pct ≥ 0.95) / count(fresh rows where auto_pct is measured)`.
  `auto_pct` = time in AUTO or CASCADE ÷ window time (G1, CPLM-003). Rows without a measured `auto_pct` (insufficient data) are
  listed as "not measured", outside the denominator.
- **Why:** the first KPI of CPM systems; a loop in manual is not controlling at all. Field surveys (Ender 1993; Desborough &
  Miller 2002) report a large share of industrial loops — on the order of a third — in manual or performing poorly. **95 %**:
  a loop more than 5 % of the time out of its design mode counts as out of mode (Emerson loop-performance guidance; Bayer's
  PlantTriage rule). **Fleet target:** fewer than 10 % of loops out of mode (Emerson).
- **Drill-down:** loop · AUTO % vs 95 % · manual % · window · link to the trend with the MODE lane.

#### K3 — Oscillating
- **Definition:** share of assessed loops with an established oscillation finding.
- **Formula:** `count(Assessed AND diagnosis ∈ {SUSPECTED_OSCILLATION, CONFIRMED_OSCILLATION}) / Assessed`.
- **Inputs:** `diagnosis`, G5 / G7 statuses, `payload.oscillation_score`, `payload.period_status`, `payload.validated_period_s`.
- **Why:** oscillation is among the most common performance defects (Ender 1993; Hägglund 1995; Bauer et al. 2016).
- **Drill-down:** loop · band · evidence score · period (or "not measured — no valid cycle") · regularity · links (Explorer
  summary, Calculations G5 rows, trend with the window).
- **Lab finding:** 163 of 164 lab loops have `acf_period_s = 0` with `period_status = NO_VALID_CYCLE` while confirmed oscillating —
  the period is *not measured*, not 0 s. Show the status, never "0 s".

#### K4 — Suspected valve problem (final element)
- **Definition:** share of assessed loops with an established final-element finding (stiction / backlash).
- **Formula:** `count(Assessed AND diagnosis ∈ {SUSPECTED_FINAL_ELEMENT_NONLINEARITY, CONFIRMED_FINAL_ELEMENT_NONLINEARITY}) / Assessed`.
- **Inputs:** `diagnosis`, G6–G9 (harmonics, Horch oddness, phase-portrait corners), G14 confirmation (needs a VP).
- **Why:** a frequent root cause of oscillation, and the one maintenance acts on (Choudhury, Shah & Thornhill 2008; Horch 1999). Without a VP signal it stops at *suspected* — shown in the list.
- **Drill-down:** loop · band · VP declared / mapped · G14 state · links (Investigation, Calculations G6–G9).

#### K5 — Excessive actuator effort
- **Definition:** share of assessed loops with an established excessive-effort finding.
- **Formula:** `count(Assessed AND diagnosis ∈ {SUSPECTED_EXCESSIVE_EFFORT, CONFIRMED_EXCESSIVE_EFFORT}) / Assessed`.
- **Inputs:** `diagnosis`, `effort_ratio` (CPLM-020), `travel_per_day` (CPLM-021), `reversals_per_hour` (CPLM-022).
- **Why:** valve travel and reversals are the standard wear indicators (CPM tools report "valve travel" and "valve reversals");
  aggressive tuning wears the final element.
- **Drill-down:** loop · effort ratio · OP travel per day · reversals per hour · links.

#### K6 — Saturated / at limit
- **Definition:** share of assessed loops whose OP sat at a limit (fully open / fully closed) for more than **10 %** of the window.
- **Formula:** `count(fresh rows with saturation_pct > 0.10) / count(fresh rows where saturation_pct is measured)`.
- **Inputs:** `payload.saturation_pct`, `payload.limit_source` (`REGISTRY` OP range, or `FALLBACK_0_100`), `payload.sat_limit_dwell_s`.
- **Why:** a loop at its limit has no authority — no tuning can fix it (equipment sizing / operating point). "Time at limits"
  is a standard CPM KPI. **10 %**: "it should not be fully open or fully closed more than 10 percent of the time" (Bayer's
  PlantTriage rule); site-adjustable.
- **Drill-down:** loop · saturation % vs 10 % · **limit basis** (registered OP range or the 0–100 % fallback — shown, because a wrong
  basis makes the number wrong) · longest dwell · link to the trend.

#### K7 — Not assessable (with reasons)
- **Definition:** monitored loops whose fresh window could not be judged.
- **Formula:** `count(fresh N with diagnosis = INSUFFICIENT_DATA or EXCLUDED_*)`, split by reason:
  - *Incomplete data* — `completeness < 0.95` (G0 coverage minimum; `completeness = samples ÷ (window ÷ grid)`)
  - *Bad quality* — `bad_quality_pct ≥ 0.50`
  - *Manual mode* — `EXCLUDED_MODE`; *outside operating region*; *instrument fault* — the other `EXCLUDED_*`
- **Why:** NAMUR NE 107 / GUM: a value that could not be established is reported as such, with its cause.
- **Drill-down:** loop · reason · completeness (samples / expected) · longest gap · last real verdict and its age (context).
- **Lab finding:** one 5.7 h feed gap gives a 24 h window 66 % completeness → every loop `INSUFFICIENT_DATA` for a whole day; any
  gap longer than ~72 min in 24 h does this. Today these loops read STALE.

#### K8 — Stale (pipeline) and K9 — Never evaluated
- **Formulas:** K8 `count(N exists AND window_end < now − 1 h)`; K9 `count(no LIVE 24 h row)`.
- **Why:** separates "the system stopped" (an operations alarm, should be 0) from "the data could not be judged" (K7).
- **Drill-down:** loop · newest row time · newest real verdict time · link to Pipeline Health (SuperAdmin) / Loop Registry readiness.

### 3.3 Per-loop KPIs (Loop Explorer card, Phase 4)

Built (CHG-086): `GET /api/v1/cpm/loops/{id}/kpi-summary` serves the loop's newest LIVE 24 h window and the one that existed 24 h
earlier (stored metrics, the engine gates G0 / G1 / G3 / G4 / G10, registry spans); `components/Cpm/kpi/loopKpiView.ts` turns it into
nine cards. Each card is **judged by the engine's own gate** where one exists (the UI never invents a threshold the engine did not
apply) or by the fleet rule (AUTO ≥ 95 %, at limit ≤ 10 %, completeness ≥ 95 %); a value not stored reads "not measured"; MAE and 2σ
are shown as % of the PV span (no span registered → no %); the change compares with the window 24 h earlier. Each card links to its
proof: Calculations (G3 / G4 metrics), the trend over the window (mode, saturation, variability, SP), the Window Inspector (coverage).

| KPI | Formula / field | Threshold shown | Proof link |
|---|---|---|---|
| Service factor | `auto_pct` (CPLM-003) | ≥ 95 % | trend MODE lane |
| Good-error time | `good_error_pct` (CPLM-014): time with \|PV − SP\| inside the good band | profile G3 threshold | Calculations CPLM-014 |
| Control error | MAE (CPLM-010) and RMS (CPLM-011) as **% of PV span** = value ÷ (pvMax − pvMin) × 100 | profile G3 | Calculations CPLM-010/011 |
| PV variability | `pv_std` as % of span; 2σ band | context: Emerson guidance 2σ < 1 % of mean (< 0.5 % critical loops); not a pass/fail here — level loops absorb swings by design | Historical |
| OP saturation | `saturation_pct`, with limit basis | ≤ 10 % | trend OP lane |
| Valve travel / reversals | CPLM-021 / CPLM-022 | profile G4 | Calculations |
| SP activity | `sp_changes_per_h` | — | trend SP lane |
| Data coverage | `completeness` (CPLM-001) | 95 % | Window Inspector |

## 4. Proof chain (what the user clicks)

```
Overview tile "Oscillating 23 % (37 of 160 assessed)"  [rule on hover: SUSPECTED/CONFIRMED oscillation, newest 24 h verdict ≤ 1 h old]
  └─ Show loops ›  /cpm/kpi?kpi=oscillating&site=…   (header repeats rule, reference, count; 37 rows)
       FIC10403 · CONFIRMED · evidence 100 · period not measured (no valid cycle) · window ends 10 Oct 12:45
         └─ Explorer summary · Calculations G5 rows (formula, value, history) · Window Inspector (that window) · Historical (window band)
```

Reconciliation rules (tested): Σ states = monitored loops; Assessed = acceptable + finding + symptom-only; each condition KPI's
count = rows in its drill-down; every listed value is the stored value of the listed window.

## 5. Phase 0 findings (lab, 2026-10-10)

Probes: [`sql/01-kpi-input-coverage.sql`](sql/01-kpi-input-coverage.sql) (`-v basis=latest|real`),
[`sql/02-plant-freshness-and-data-probe.sql`](sql/02-plant-freshness-and-data-probe.sql) (read-only, 13 s on the lab).

| Finding | Evidence | Consequence for the KPIs |
|---|---|---|
| Lab feed stopped ~2 days ago | 0 loops with a row newer than 24 h; newest rows 164 × `INSUFFICIENT_DATA`, G0 FAIL | lab tiles would read all "Stale" today; under the new rules: K7 Not assessable (incomplete data) once fresh rows arrive, K8 Stale while none do |
| Data gaps make whole days unjudgeable | completeness 0.66 (max gap 20,511 s) → G0 FAIL at the 0.95 minimum | K7 must show completeness and the longest gap; consider also showing the **12 h** window's verdict (recovers in half the time) — open question Q3 |
| Core inputs are present on real verdicts | on each loop's newest real verdict: AUTO %, MAE, good-error %, PV σ, OP travel, reversals, completeness on 163–164 of 164 | K2, K5, per-loop card computable |
| Zero values are genuine where checked | SP range 0 → SP changes 0; AUTO 100 % → manual 0; B2_027PIC (manual) shows non-zero saturation / SP changes / manual | stored zeros of saturation / SP / manual can be shown as measured |
| Oscillation period "0" means not measured | 163 / 164: `acf_period_s = 0`, `period_status = NO_VALID_CYCLE` | show the status; **engine follow-up** (gates owner): write null, not 0 |
| Insufficient rows carry `confidence = 0` | 164 newest rows | never show an evidence score without a verdict (already the UI rule) |
| No "no fault found" code on the lab | last 3 days: only `INSUFFICIENT_DATA`; real verdicts: `CONFIRMED_OSCILLATION` 162 | the simulator only oscillates — **K1 can only be calibrated on plant data** (probe section D) |
| Saturation basis is a fallback on most loops | `limit_source = FALLBACK_0_100` | K6 drill-down shows the basis; registry OP ranges improve it |

### 5.1 Plant evidence (Marun, probe `sql/02-…`, 2026-10-10 evening, 175 monitored loops)

| Section | Result | Meaning |
|---|---|---|
| A. newest row | 142 loops < 1 h old, all `INSUFFICIENT_DATA`; 32 never; 1 older than 24 h | the pipeline **is producing** — under the new rules these are *not assessable (incomplete data)*, not stale; only 1 is stale |
| C. why insufficient | 140 loops: completeness 0.42, 7,263 of 17,280 samples, sample period 4.1 s, **max gap 16 s** | the feed is continuous; the 24 h window is not yet full: 7,263 × 4.1 s ≈ 8.4 h = time since the v2.7.0 Flink swap (jobs RUNNING since 09:17 UTC, fresh state). 12 h verdicts return ≈ 11.4 h after the restart, 24 h verdicts ≈ 22.8 h after (0.95 × 24 h) — about 08:00–09:00 UTC on 11 Oct if the feed stays continuous. One loop has a 22.5 h gap (broken feed) |
| D. codes, last 3 days | only `INSUFFICIENT_DATA` | consistent with the 7–10 Oct feed outage / disk incidents and the restart |
| B. newest real verdict (3–7 days old) | `NO_CALL` 17 + `INSUFFICIENT_EVIDENCE` 8 = **25 no-fault**; `EXCLUDED_MODE` **65**; excessive effort confirmed 26 + suspected 1; oscillation confirmed 11 + suspected 1; valve suspected 1; weak symptoms 9; never 34 | **K1 is confirmed on plant data:** the engine writes the no-fault codes — the old "Healthy" (NORMAL / NONE / HEALTHY) read 0 while 25 loops had no fault. 65 of 175 loops (≈ 37 %) were last judged in manual — the service-factor KPI's first real finding. Excessive effort is the most common fault family |
| E. acquisition | `{}` on all 175 loops | no grid declared in the registry; the expected count (17,280 = 24 h ÷ 5 s) comes from the source grid |

Consequences: (1) every Flink restart without saved state costs ≈ 23 h of 24 h verdicts — record it in each release's deploy notes;
(2) the 32 never-evaluated loops and the one 22.5 h gap are onboarding / feed items, not KPI defects; (3) re-run the probe after
≈ 09:00 UTC on 11 Oct: section A should then show real verdicts and the performance cards fill.

## 6. Decisions — checked against standards and published practice (approved 2026-10-10)

| # | Question | Decision | Evidence |
|---|---|---|---|
| Q1 | Freshness limit | **1 h** = four missed 15-minute evaluations; older → *Stale* | OPC UA status *Uncertain – last usable value*: "whatever was updating this value has stopped"; SCADA / historian practice marks data stale after a multiple of its update interval. The interval here is fixed by the engine (15 min). |
| Q2 | Count `DETECTED_*` / `CLASSIFIED_*` as findings? | **No** — counted findings are `SUSPECTED_*` / `CONFIRMED_*` (evidence ≥ 75); weaker bands are listed as "symptom only" | ISA-18.2: raise only conditions that need action (no nuisance); Bayer's PlantTriage installation alarmed oscillation at a factor of **80 %** — the same order as our 75 / 90 bands. |
| Q3 | 24 h only, or fall back to 12 h? | **24 h** for every tile (one basis); 12 h verdict shown as context in the K7 drill-down; the daily trend (Phase 5) carries the "many batches" view | Horch (ABB, DYCOPS): a single data batch can mislead (shutdowns, unusual events) — assess over many batches; good control changes over months, not hours. |
| Q4a | Normal-mode threshold | **≥ 95 %** time in AUTO / CASCADE per loop; fleet target **< 10 %** of loops out of mode | Emerson loop-performance guidance: controllers in manual / incorrect mode < 10 %, do not count a loop that is in the incorrect mode < 5 % of the time; Bayer / PlantTriage: "more than 5 percent out of design mode → out of mode". |
| Q4b | Saturation threshold | **> 10 %** of the window fully open / closed | Bayer / PlantTriage: "should not be fully open or fully closed more than 10 percent of the time"; no published standard value — site-adjustable. |
| Q5 | Plant probe | **done 2026-10-10** — section 5.1: no-fault codes exist (K1 confirmed); the 141 "stale" were a buffer refill after the restart | `sql/02-…` |

No international standard (ISA / IEC) fixes CPM thresholds; the values above are the published practice. All are configurable
(cplm-api `Cpm:Kpi:*`) and recorded in `prod_decision.md` — a site changes them there, not in code.

Sources checked (2026-10-10):
[Emerson — process control loop performance guidance](http://www.emersonautomationexperts.com/2016/services-consulting-training/process-control-loop-performance-guidance/) ·
[Automation World — Bayer / PlantTriage KPIs](https://automationworld.com/products/networks/article/13303706/teamwork-software-show-results) ·
[Horch — DYCOPS paper (ABB)](https://library.e.abb.com/public/24d56839eca60be285256f9b0057aa2f/Dycops_Horch.pdf) ·
[OPC UA Uncertain_LastUsableValue](https://opclabs.com/files/onlinedocs/OPCLabs-OpcStudio/Latest/User's%20Guide%20and%20Reference-OPC%20Studio/OpcLabs.EasyOpcUA~OpcLabs.EasyOpc.UA.UACodeBits~UncertainLastUsableValue.html) ·
[ControlStation — percent time in normal](https://controlstation.com/percent-time-in-normal/) ·
[ISA-18.2 alarm definition (Emerson alarm management)](https://www.emerson.com/documents/automation/alarm-management-en-57058.pdf).

## 7. References

- Ender, D. B. (1993). *Process control performance: not as good as you think.* Control Engineering 40(10).
- Desborough, L. & Miller, R. (2002). *Increasing customer value of industrial control performance monitoring — Honeywell's
  experience.* CPC VI, AIChE Symposium Series 98(326).
- Jelali, M. (2006). *An overview of control performance assessment technology and industrial applications.* Control
  Engineering Practice 14(5).
- Bauer, M., Horch, A., Xie, L., Jelali, M. & Thornhill, N. (2016). *The current state of control loop performance monitoring —
  a survey of application in industry.* Journal of Process Control 38.
- Harris, T. J. (1989). *Assessment of control loop performance.* Canadian Journal of Chemical Engineering 67(5).
- Hägglund, T. (1995). *A control-loop performance monitor.* Control Engineering Practice 3(11).
- Horch, A. (1999). *A simple method for detection of stiction in control valves.* Control Engineering Practice 7(10).
- Choudhury, M. A. A. S., Shah, S. L. & Thornhill, N. F. (2008). *Diagnosis of Process Nonlinearities and Valve Stiction.* Springer.
- NAMUR NE 107 (status signals); ISA-18.2 / EEMUA 191 (prioritisation principles); ISA-101 (HMI colour use).

## 8. Implementation map (where each rule lives)

| Piece | File | What it holds |
|---|---|---|
| The one read | `src/services/cplm-api/Data/FleetKpiSql.cs` | per monitored loop in scope: newest LIVE 24 h row of any diagnosis + newest real verdict (two per-loop index probes) and the payload fields every KPI needs |
| The rules | `src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs` | `Classify` (state, reason, outcome, band, family, mode / saturation flags), `Matches` (one predicate per drill-down key), `Figures` (count, denominator, rule text) |
| Thresholds | `Services/Kpi/FleetKpiModels.cs` `KpiThresholds`; config `Cpm:Kpi:FreshSeconds` (3600), `Cpm:Kpi:NormalModeMin` (0.95), `Cpm:Kpi:SaturationMax` (0.10), `Cpm:Kpi:G0CompletenessMin` (0.95), `Cpm:Kpi:G0BadQualityMax` (0.50) | section 6 decisions |
| The proof row | `Services/Kpi/FleetKpiRows.cs` | deciding value vs threshold per KPI, the window, the inputs to reproduce it, last real verdict |
| API | `Controllers/CpmFleetKpiController.cs` | `GET /api/v1/cpm/fleet/kpis?site&area&unit` (figures + state partition + reasons) and `GET /api/v1/cpm/fleet/kpis/loops?kpi=&reason=&q=&site&area&unit&page&pageSize` (drill-down; `total` = the tile's count) — `analytics.view`, fleet cache 15 s |
| Tests | `tests/cplm-api.Tests/FleetKpiClassifierTests.cs`, `FleetKpiEndpointTests.cs` | every rule edge (95 % exactly, 10 % exactly, 1 h exactly, each reason, each band); reconciliation (states sum to monitored, outcomes sum to assessed, each figure = its list) |

Drill-down keys: `all`, `assessed`, `acceptable`, `no-fault-limited`, `finding`, `symptom`, `oscillating`, `valve`, `effort`,
`normal-mode`, `out-of-mode`, `saturated`, `not-assessable` (+ `reason=`), `stale`, `never-evaluated`.

## 10. Presentation (CHG-085) and the change since yesterday

- **Overview:** six compact cards (performing acceptably, in normal mode, oscillating, valve, effort, saturated) — icon, change,
  count, label, share of a named denominator; the whole card opens the drill-down. A coverage row holds not assessable / stale /
  never evaluated and the state bar (every monitored loop in one segment; legend links to each state's list).
- **Change since 24 h ago:** cplm-api classifies a second snapshot *as of* now − 24 h (`FleetKpiSql @asOf`: each loop's newest rows
  with `window_end ≤ asOf`, freshness judged against that instant) with the same rules. The card shows the change of the **share**
  in percentage points (a growing fleet is not a change); green when it moved the right way for that KPI (up for acceptable /
  normal mode, down for every problem KPI), red otherwise, grey when flat; hidden when there is no earlier picture. Registry
  membership is today's (a loop added today reads "never evaluated" yesterday).
- **Detail page:** summary cards (number + change, threshold, basis, computed), proof panel (rule, formula, why, reference), the
  loops with the measured value on a bar against the threshold marker, verdict, window, inputs and proof links.
- **Vocabulary:** on these pages `NO_CALL` / `INSUFFICIENT_EVIDENCE` read **"No fault found"** — the shared vocabulary still says
  "Not evaluated yet" for `NO_CALL` elsewhere in the app (open item: decide app-wide).

## 11. The 14-day trend (Phase 5, CHG-087)

- `GET /api/v1/cpm/fleet/kpis/trend?days=14&site&area&unit`: one point per day — every figure as it stood at the **same time of day**
  on that day, from the **same classification** applied to the rows that existed at that instant (`FleetKpiSql @asOf`). Past days sit
  at the anchor rounded down to 15 min (the engine's evaluation step) and are cached 10 min; **today's point is the cards' live
  snapshot** (`isNow`), so today's bar always equals the card.
- Each point carries its exact `asOf`; `GET /fleet/kpis/loops?asOf=` lists the loops that point counted (tested: every point = its
  own day's list for every KPI). Limit: 14 days — the plant keeps the gate results 14 days (cpm-10b retention).
- On the detail page the bar chart "How this number has moved" sits between the proof panel and the list; clicking a day switches the
  list to that day ("matches that day"), "Back to now" returns. A day with nothing to judge is **no data**, never 0 %; the tooltip
  states count and denominator (a 100 % from 1 of 1 is visible as such).
- Cost (lab, 240 loops): the whole-plant trend 2.9 s cold, 0.23 s cached (14 classifications, four at a time).

## 9. Change log of this document

| Date | Phase | Change |
|---|---|---|
| 2026-10-10 | 0 | First version: principles, sources, KPI catalogue K1–K9, per-loop KPIs, proof chain, lab findings, open questions |
| 2026-10-10 | 0 | Q1–Q4 checked against standards / published practice: normal mode 90 → 95 %, saturation 5 → 10 %, fleet target < 10 % out of mode; sources listed |
| 2026-10-10 | 1 | Implementation map: one read, one classifier, two endpoints, tests |
| 2026-10-10 | 2–3 | Overview cards + drill-down; acceptable also requires not saturated; change vs 24 h ago; redesign (section 10) |
| 2026-10-10 | 4 | Per-loop KPI cards on the Explorer (`/loops/{id}/kpi-summary`); route-uniqueness guard after a route collision |
| 2026-10-10 | 5 | 14-day trend with day drill-down (section 11) |
| 2026-10-10 | — | Plant probe results (section 5.1): K1 confirmed, stale explained by the restart refill |
| 2026-10-14 | CHG-093 | K1 also needs G3 pass and G4 not strong (SME review 2 #12); the Performance headline is computed over every assessed loop in scope, with exclusions, and error as % of PV span (SME review 2 #10 / #11) |
