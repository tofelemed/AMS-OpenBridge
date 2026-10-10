# Control-loop KPIs — calculation logic, proof and rationale

Status: **Phase 0 done — rules approved 2026-10-10 after the standards check (section 6)**. Phase 1 (server) in progress.
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

#### K1 — Performing acceptably ("No fault found")
- **Definition:** share of monitored loops whose fresh 24 h verdict found no fault, in normal mode, on qualified data.
- **Formula:** `count(loops: state = Assessed AND diagnosis ∈ {NO_CALL, INSUFFICIENT_EVIDENCE} AND auto_pct ≥ 0.95) / monitored`.
- **Inputs:** `diagnosis`, `payload.auto_pct`, `payload.gates.G0`, `window_end`.
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

## 6. Decisions — checked against standards and published practice (approved 2026-10-10)

| # | Question | Decision | Evidence |
|---|---|---|---|
| Q1 | Freshness limit | **1 h** = four missed 15-minute evaluations; older → *Stale* | OPC UA status *Uncertain – last usable value*: "whatever was updating this value has stopped"; SCADA / historian practice marks data stale after a multiple of its update interval. The interval here is fixed by the engine (15 min). |
| Q2 | Count `DETECTED_*` / `CLASSIFIED_*` as findings? | **No** — counted findings are `SUSPECTED_*` / `CONFIRMED_*` (evidence ≥ 75); weaker bands are listed as "symptom only" | ISA-18.2: raise only conditions that need action (no nuisance); Bayer's PlantTriage installation alarmed oscillation at a factor of **80 %** — the same order as our 75 / 90 bands. |
| Q3 | 24 h only, or fall back to 12 h? | **24 h** for every tile (one basis); 12 h verdict shown as context in the K7 drill-down; the daily trend (Phase 5) carries the "many batches" view | Horch (ABB, DYCOPS): a single data batch can mislead (shutdowns, unusual events) — assess over many batches; good control changes over months, not hours. |
| Q4a | Normal-mode threshold | **≥ 95 %** time in AUTO / CASCADE per loop; fleet target **< 10 %** of loops out of mode | Emerson loop-performance guidance: controllers in manual / incorrect mode < 10 %, do not count a loop that is in the incorrect mode < 5 % of the time; Bayer / PlantTriage: "more than 5 percent out of design mode → out of mode". |
| Q4b | Saturation threshold | **> 10 %** of the window fully open / closed | Bayer / PlantTriage: "should not be fully open or fully closed more than 10 percent of the time"; no published standard value — site-adjustable. |
| Q5 | Plant probe | run `sql/02-…` on the VM; it calibrates K1 and explains the plant's 141 / 34 | — |

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

## 8. Change log of this document

| Date | Phase | Change |
|---|---|---|
| 2026-10-10 | 0 | First version: principles, sources, KPI catalogue K1–K9, per-loop KPIs, proof chain, lab findings, open questions |
| 2026-10-10 | 0 | Q1–Q4 checked against standards / published practice: normal mode 90 → 95 %, saturation 5 → 10 %, fleet target < 10 % out of mode; sources listed |
