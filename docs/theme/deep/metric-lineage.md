# CPA metric lineage register

One row per concept for every value, KPI, verdict, score, count and band in the live UI. Machine copy: [metric-lineage.json](metric-lineage.json). Check: `node docs/theme/tools/lineage.mjs`.

Rules used: records what is implemented, read from the source at branch feat/v25-next-release. No server, lab API or credentials were used, so plant values are not determined here. Open decisions stay open: see [discrepancies.md](discrepancies.md), question Q7.

Status words: **Consistent** same meaning on every surface. **Label only** same value under different names. **Definition conflict** the stated definitions or surfaces disagree. **Engine-UI conflict** the UI states something the engine does not do. **Undocumented** shown in the UI with no entry in the logic files.

Concept text in the definitions is verbatim; `{…}` marks a template slot.

## Index

| ID | Concept | Family | Status |
|---|---|---|---|
| [M-001](#m-001) | Monitored loops | Fleet population | Consistent |
| [M-002](#m-002) | Loops in scope (registered population) | Fleet population | Definition conflict |
| [M-003](#m-003) | Assessed loops | Fleet state | Consistent |
| [M-004](#m-004) | Fleet state bar | Fleet state | Definition conflict |
| [M-005](#m-005) | Performing acceptably | Fleet KPI | Consistent |
| [M-006](#m-006) | Loops in normal mode (fleet) | Fleet KPI | Definition conflict |
| [M-007](#m-007) | Loops out of normal mode | Fleet KPI | Label only |
| [M-008](#m-008) | Loops in manual | Fleet KPI | Engine-UI conflict |
| [M-009](#m-009) | Oscillating loops | Fleet KPI | Definition conflict |
| [M-010](#m-010) | Suspected valve problem | Fleet KPI | Label only |
| [M-011](#m-011) | Excessive actuator effort | Fleet KPI | Engine-UI conflict |
| [M-012](#m-012) | Saturated loops | Fleet KPI | Engine-UI conflict |
| [M-013](#m-013) | Not assessable loops | Fleet state | Engine-UI conflict |
| [M-014](#m-014) | Not-assessable reason | Fleet state | Definition conflict |
| [M-015](#m-015) | Stale loops | Fleet state | Definition conflict |
| [M-016](#m-016) | Never evaluated loops | Fleet state | Definition conflict |
| [M-017](#m-017) | Loops with a finding | Fleet state | Consistent |
| [M-018](#m-018) | Symptom-only loops | Fleet state | Definition conflict |
| [M-019](#m-019) | No fault, but limited | Fleet state | Definition conflict |
| [M-020](#m-020) | Fleet KPI change since 24 h ago | Fleet KPI | Consistent |
| [M-021](#m-021) | KPI daily trend point | Fleet KPI | Definition conflict |
| [M-022](#m-022) | Share of denominator | Fleet KPI | Definition conflict |
| [M-023](#m-023) | Deciding value against the rule | Fleet KPI | Definition conflict |
| [M-024](#m-024) | KPI computed time | Fleet KPI | Consistent |
| [M-025](#m-025) | KPI basis and threshold cards | Fleet KPI | Definition conflict |
| [M-026](#m-026) | Priority level | Priority queue | Definition conflict |
| [M-027](#m-027) | Priority queue membership | Priority queue | Definition conflict |
| [M-028](#m-028) | Severity | Priority queue | Definition conflict |
| [M-029](#m-029) | Loop criticality | Priority queue | Consistent |
| [M-030](#m-030) | Episode age in queue | Priority queue | Label only |
| [M-031](#m-031) | Shelved count | Priority queue | Definition conflict |
| [M-032](#m-032) | Valve position expected but not mapped | Readiness | Undocumented |
| [M-033](#m-033) | Peer links expected but missing | Readiness | Undocumented |
| [M-034](#m-034) | Plant facts counts | Readiness | Undocumented |
| [M-035](#m-035) | Diagnostic capability | Readiness | Engine-UI conflict |
| [M-036](#m-036) | Fleet good-error time | Performance headline | Label only |
| [M-037](#m-037) | Median error as share of span | Performance headline | Consistent |
| [M-038](#m-038) | Loops with periodic diagnosis | Performance headline | Consistent |
| [M-039](#m-039) | Newest fused window age | Performance page | Undocumented |
| [M-040](#m-040) | Gate matrix row filters | Performance page | Definition conflict |
| [M-041](#m-041) | Gate roll-up counts | Performance page | Definition conflict |
| [M-042](#m-042) | Attention ranking | Performance page | Definition conflict |
| [M-043](#m-043) | Driving gates | Performance page | Definition conflict |
| [M-044](#m-044) | Gate result word and mark | Gate | Label only |
| [M-045](#m-045) | G0 data quality | Gate | Consistent |
| [M-046](#m-046) | G1 mode and service | Gate | Definition conflict |
| [M-047](#m-047) | G2 setpoint activity | Gate | Engine-UI conflict |
| [M-048](#m-048) | G2r operating region | Gate | Label only |
| [M-049](#m-049) | G3 base performance | Gate | Engine-UI conflict |
| [M-050](#m-050) | G4 actuator effort | Gate | Engine-UI conflict |
| [M-051](#m-051) | G5 oscillation ACF | Gate | Definition conflict |
| [M-052](#m-052) | G6 spectrum | Gate | Engine-UI conflict |
| [M-053](#m-053) | G7 shape | Gate | Engine-UI conflict |
| [M-054](#m-054) | G8 lag asymmetry | Gate | Definition conflict |
| [M-055](#m-055) | G9 phase geometry | Gate | Definition conflict |
| [M-056](#m-056) | G10 actuator limits | Gate | Definition conflict |
| [M-057](#m-057) | G11 measurement health | Gate | Definition conflict |
| [M-058](#m-058) | G12 on the fused row | Gate | Definition conflict |
| [M-059](#m-059) | G13 interaction | Gate | Label only |
| [M-060](#m-060) | G14 valve confirmation | Gate | Engine-UI conflict |
| [M-061](#m-061) | G15 decision | Gate | Definition conflict |
| [M-062](#m-062) | Diagnosis band | Verdict | Definition conflict |
| [M-063](#m-063) | No fault identified verdict | Verdict | Definition conflict |
| [M-064](#m-064) | Not enough data verdict | Verdict | Label only |
| [M-065](#m-065) | Excluded window | Verdict | Engine-UI conflict |
| [M-066](#m-066) | Evidence score | Verdict | Definition conflict |
| [M-067](#m-067) | Evidence-score band in the drawer | Verdict | Engine-UI conflict |
| [M-068](#m-068) | Evidence score cap note | Verdict | Engine-UI conflict |
| [M-069](#m-069) | Leading hypothesis | Verdict | Label only |
| [M-070](#m-070) | Hypothesis score and state | Verdict | Definition conflict |
| [M-071](#m-071) | Observation score | Verdict | Definition conflict |
| [M-072](#m-072) | Detector scores | Verdict | Label only |
| [M-073](#m-073) | Selected family | Verdict | Label only |
| [M-074](#m-074) | Persistence agreement | Verdict | Engine-UI conflict |
| [M-075](#m-075) | Analysis cases | Verdict | Definition conflict |
| [M-076](#m-076) | Last verdict | Verdict | Consistent |
| [M-077](#m-077) | Next check | Verdict | Definition conflict |
| [M-078](#m-078) | Time in AUTO share | Loop metric | Engine-UI conflict |
| [M-079](#m-079) | Manual share | Loop metric | Engine-UI conflict |
| [M-080](#m-080) | Good-error share | Loop metric | Engine-UI conflict |
| [M-081](#m-081) | Good-error band | Loop metric | Undocumented |
| [M-082](#m-082) | Control error MAE | Loop metric | Engine-UI conflict |
| [M-083](#m-083) | RMS control error | Loop metric | Definition conflict |
| [M-084](#m-084) | Integral absolute error | Loop metric | Label only |
| [M-085](#m-085) | Integral squared error | Loop metric | Consistent |
| [M-086](#m-086) | ITAE | Loop metric | Undocumented |
| [M-087](#m-087) | PV variability | Loop metric | Undocumented |
| [M-088](#m-088) | Time at an OP limit | Loop metric | Engine-UI conflict |
| [M-089](#m-089) | Longest dwell at a limit | Loop metric | Label only |
| [M-090](#m-090) | OP travel per day | Loop metric | Engine-UI conflict |
| [M-091](#m-091) | OP reversals per hour | Loop metric | Engine-UI conflict |
| [M-092](#m-092) | Setpoint changes per hour | Loop metric | Undocumented |
| [M-093](#m-093) | Data coverage | Loop metric | Definition conflict |
| [M-094](#m-094) | Sample counts | Loop metric | Label only |
| [M-095](#m-095) | Bad-quality share | Loop metric | Label only |
| [M-096](#m-096) | Longest gap | Loop metric | Consistent |
| [M-097](#m-097) | Actuator effort ratio | Loop metric | Engine-UI conflict |
| [M-098](#m-098) | Oscillation period | Loop metric | Definition conflict |
| [M-099](#m-099) | Oscillation regularity | Loop metric | Consistent |
| [M-100](#m-100) | Period validity | Loop metric | Consistent |
| [M-101](#m-101) | Harmonic ratios | Loop metric | Consistent |
| [M-102](#m-102) | Triangularity | Loop metric | Engine-UI conflict |
| [M-103](#m-103) | Horch oddness | Loop metric | Label only |
| [M-104](#m-104) | Corner score | Loop metric | Label only |
| [M-105](#m-105) | Cycle phase area | Loop metric | Undocumented |
| [M-106](#m-106) | PV freeze index | Loop metric | Undocumented |
| [M-107](#m-107) | Live and last-stored PV, SP, OP | Live signal | Engine-UI conflict |
| [M-108](#m-108) | Controller mode now | Live signal | Definition conflict |
| [M-109](#m-109) | Signal quality | Live signal | Label only |
| [M-110](#m-110) | Instrument health | Live signal | Consistent |
| [M-111](#m-111) | Trend series | Live signal | Label only |
| [M-112](#m-112) | KPI overlay series | Live signal | Label only |
| [M-113](#m-113) | Window contract | Windows page | Consistent |
| [M-114](#m-114) | Sample density | Windows page | Undocumented |
| [M-115](#m-115) | Across window sizes statistics | Windows page | Undocumented |
| [M-116](#m-116) | Calculations page tallies | Calculations page | Definition conflict |
| [M-117](#m-117) | Gate result column on a metric | Calculations page | Engine-UI conflict |
| [M-118](#m-118) | Calculation and profile version | Provenance | Definition conflict |
| [M-119](#m-119) | Gate observed in stored results | Provenance | Undocumented |
| [M-120](#m-120) | Episode counts by state | Events | Consistent |
| [M-121](#m-121) | Episode peak and current result | Events | Consistent |
| [M-122](#m-122) | Episode windows and qualified support | Events | Consistent |
| [M-123](#m-123) | Episode condition | Events | Consistent |
| [M-124](#m-124) | Episode availability | Events | Consistent |
| [M-125](#m-125) | Acknowledgement and shelf state | Events | Consistent |
| [M-126](#m-126) | Fast conditions | Events | Undocumented |
| [M-127](#m-127) | Evidence readiness and basis | Evidence | Undocumented |
| [M-128](#m-128) | Measured against required | Evidence | Engine-UI conflict |
| [M-129](#m-129) | Response event state | System response | Consistent |
| [M-130](#m-130) | Process model parameters | System response | Definition conflict |
| [M-131](#m-131) | Observed response timing | System response | Label only |
| [M-132](#m-132) | Model validation | System response | Label only |
| [M-133](#m-133) | Frequency-response margins | System response | Definition conflict |
| [M-134](#m-134) | Quantity catalogue | System response | Consistent |
| [M-135](#m-135) | Required jobs running | Pipeline | Undocumented |
| [M-136](#m-136) | Checkpoint figures | Pipeline | Undocumented |
| [M-137](#m-137) | Metrics stated as unavailable | Pipeline | Undocumented |
| [M-138](#m-138) | Last fused verdict age | Pipeline | Definition conflict |
| [M-139](#m-139) | Audit trail figures | Governance and admin | Definition conflict |
| [M-140](#m-140) | Governance provenance figures | Governance and admin | Definition conflict |
| [M-141](#m-141) | Configuration lifecycle figures | Governance and admin | Consistent |
| [M-142](#m-142) | Loop readiness | Registry | Consistent |
| [M-143](#m-143) | Administration counts | Governance and admin | Undocumented |
| [M-144](#m-144) | System settings shown | Governance and admin | Definition conflict |
| [M-145](#m-145) | Login status strip | Governance and admin | Label only |

## Fleet population

### M-001

**Monitored loops.** Status: **Consistent**

- **Labels:** "N loop(s) monitored", "monitored loops", "N monitored loop(s) in scope", "of monitored"
- **Surfaces:**
  - /cpm: panel title and denominator (src/frontend-ob/src/components/Cpm/overview/OperatingPicture.tsx:45,63)
  - /cpm/kpi: scope line (src/frontend-ob/src/components/Cpm/CpmKpiDrilldown.tsx:94)
  - /cpm/performance: scope line (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:205)
- **Displayed definitions:**
  - KPI_WHY.all: "Every monitored loop in scope." (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:137)
  - Server figure: "monitored loops" (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:132)
- **Engine calculation:** No engine calculation. Registry filter COALESCE((r.monitoring->>'enabled')::boolean, FALSE) (src/services/cplm-api/Data/FleetKpiSql.cs:65); count = loops.Count (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:62). Performance reads the same flag through COUNT FILTER (src/services/cplm-api/Controllers/CpmFleetController.cs:67).
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:30 (registry says which loops are monitored); kpi_calculation_logic/KPI-LOGIC.md:33 (each monitored loop counted once).
- **Window and boundary:** Current registry. UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34).
- **Eligibility:** monitoring.enabled true, in plant scope.
- **Denominator:** stated: Is the denominator it names. Computed: Same.
- **Unit and scale:** displayed: count. Computed: count.
- **Thresholds:** none.
- **Staleness:** None; registry state.
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** Same on all three surfaces.

### M-002

**Loops in scope (registered population).** Status: **Definition conflict**

- **Labels:** "N loop(s) in scope", "Registered loops", "N control-loop records", "N of M loops", "N of M loop(s) in scope"
- **Surfaces:**
  - /cpm: scope line (src/frontend-ob/src/components/Cpm/CpmOverview.tsx:99)
  - /cpm/investigation: scope line (src/frontend-ob/src/components/Cpm/CpmInvestigation.tsx:180)
  - /cpm/explorer: scope line (src/frontend-ob/src/components/Cpm/CpmExplorer.tsx:96)
  - /cpm/historical: scope row (src/frontend-ob/src/components/Cpm/historical/RangeToolbar.tsx:110)
  - /cpm/registry: panel title (src/frontend-ob/src/components/Cpm/LoopRegistry.tsx:77,83)
  - /cpm/governance: row (src/frontend-ob/src/components/Cpm/CpmGovernance.tsx:219)
- **Displayed definitions:**
  - None displayed.
- **Engine calculation:** /cpm: COUNT(*) of the registry in scope, unmonitored included (src/services/cplm-api/Controllers/CpmFleetController.cs:66,100). /cpm/investigation: rankings.count, monitored only and capped at limit 200 (src/frontend-ob/src/components/Cpm/CpmInvestigation.tsx:74,180; src/services/cplm-api/Controllers/CpmFleetController.cs:155,247).
- **Documented logic:** Not determined: neither logic file defines "in scope".
- **Window and boundary:** Current registry; rankings polled 60 s.
- **Eligibility:** Differs: all registered on /cpm, monitored and at most 200 on /cpm/investigation.
- **Denominator:** stated: None stated. Computed: Two different populations under one label.
- **Unit and scale:** displayed: count. Computed: count.
- **Thresholds:** none.
- **Staleness:** None.
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** Conflicts: the same words "N loop(s) in scope" count different populations on /cpm and /cpm/investigation.

## Fleet state

### M-003

**Assessed loops.** Status: **Consistent**

- **Labels:** "assessed loops", "Assessed", "N of M assessed loop(s)"
- **Surfaces:**
  - /cpm: denominator of condition tiles (src/frontend-ob/src/components/Cpm/overview/OperatingPicture.tsx:28)
  - /cpm/performance: basis line of every headline tile (src/frontend-ob/src/components/Cpm/performanceHeadline.ts:20)
  - /cpm/kpi: drill key "assessed" (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:102)
- **Displayed definitions:**
  - KPI_WHY.assessed: "Loops whose fresh window was judged." (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:136)
- **Engine calculation:** Classifier state: fresh, diagnosis not empty, not PENDING, not INSUFFICIENT_DATA, not EXCLUDED* (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:44-51,57-71).
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:66 (state partition); kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:253 (basis).
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34).
- **Eligibility:** Newest LIVE row of the window kind, fresh, and a verdict.
- **Denominator:** stated: Is a denominator. Computed: count(state = Assessed) (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:125).
- **Unit and scale:** displayed: count. Computed: count.
- **Thresholds:**
  - 3600 s. Source: server config Cpm:Kpi:FreshSeconds (src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:7). Colour: none.
- **Staleness:** /cpm and /cpm/kpi: Fresh = (now − window_end) ≤ Cpm:Kpi:FreshSeconds, default 3600 s (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:30-31; src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:7).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172).
- **Consistency:** Same. Partial on presence only: no headline figure (docs/theme/cpa-currenttheme.md:1157).

### M-004

**Fleet state bar.** Status: **Definition conflict**

- **Labels:** "Every monitored loop, one state each", "Monitored loops by state"
- **Surfaces:**
  - /cpm: stacked bar and legend (src/frontend-ob/src/components/Cpm/overview/OperatingPicture.tsx:68-85)
- **Displayed definitions:**
  - Code comment: "The state bar: every monitored loop in exactly one segment (sums to `monitored`)." (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:41)
- **Engine calculation:** Segments from server counts (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:42-51). Server also returns assessed.unrecognised (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:74), which has no segment.
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:191 (Σ states = monitored loops); kpi_calculation_logic/KPI-LOGIC.md:279.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34).
- **Eligibility:** Every monitored loop.
- **Denominator:** stated: monitored. Computed: monitored minus any Unrecognised outcome, because that outcome has no segment.
- **Unit and scale:** displayed: count and % in bar title. Computed: count.
- **Thresholds:** none.
- **Staleness:** /cpm and /cpm/kpi: Fresh = (now − window_end) ≤ Cpm:Kpi:FreshSeconds, default 3600 s (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:30-31; src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:7).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172).
- **Consistency:** Differs: "exactly one segment" holds only while no verdict is Unrecognised (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:69).

## Fleet KPI

### M-005

**Performing acceptably.** Status: **Consistent**

- **Labels:** "Performing acceptably", "Acceptable outcome pill"
- **Surfaces:**
  - /cpm: headline tile and bar segment (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:16,44)
  - /cpm/kpi: page (src/frontend-ob/src/components/Cpm/CpmKpiDrilldown.tsx:45)
- **Displayed definitions:**
  - Server rule: "No fault identified (NO_CALL / INSUFFICIENT_EVIDENCE), in normal mode ≥ {NormalModeMin:P0}, not at an OP limit > {SaturationMax:P0}, good-error share at or above the profile floor (G3 pass), actuator activity not strong (G4), {fresh}" (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:133-134)
  - KPI_META formula: "count(no fault identified ∧ AUTO ≥ normal-mode limit ∧ time at OP limit ≤ saturation limit ∧ G3 pass ∧ G4 not strong) ÷ monitored loops" (src/frontend-ob/src/components/Cpm/kpi/kpiMeta.ts:33)
  - KPI_META threshold: "No fault · AUTO ≥ {normalModeMin} · at limit ≤ {saturationMax} · good-error share ≥ floor (G3) · effort not strong (G4)" (src/frontend-ob/src/components/Cpm/kpi/kpiMeta.ts:34)
  - KPI_WHY: "The headline of control-loop monitoring: loops judged with no fault, on qualified data, in their normal mode, not at an OP limit, with the good-error share at or above the profile floor (G3) and no strong actuator activity (G4). No fault identified is a diagnosis; acceptable control needs its own performance criteria (Desborough & Miller 2002; Bauer et al. 2016)." (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:122)
- **Engine calculation:** count(Assessed ∧ diagnosis ∈ {NO_CALL, INSUFFICIENT_EVIDENCE} ∧ PerformanceLimits empty) (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:57-60,75-85,103).
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:82-98 (K1); kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:273.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34).
- **Eligibility:** Assessed loops; a G3 that was not evaluated is not a pass (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:81-82). G4 WARN is allowed (kpi_calculation_logic/KPI-LOGIC.md:93).
- **Denominator:** stated: monitored loops. Computed: monitored (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:132).
- **Unit and scale:** displayed: count + "N % of M monitored loops". Computed: count over count.
- **Thresholds:**
  - AUTO ≥ 0.95. Source: server config Cpm:Kpi:NormalModeMin (src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:8). Colour: none directly.
  - saturation ≤ 0.10. Source: server config Cpm:Kpi:SaturationMax (src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:9). Colour: none directly.
  - G3 floor 0.50, 0.30 averaging. Source: profile (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:154; src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfilePacks.java:91). Colour: none directly.
  - count > 0 turns the tile green. Source: hardcoded (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:25). Colour: green at any count from 1.
- **Staleness:** /cpm and /cpm/kpi: Fresh = (now − window_end) ≤ Cpm:Kpi:FreshSeconds, default 3600 s (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:30-31; src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:7).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172).
- **Consistency:** Same rule in server, KPI_META, KPI_WHY and logic docs. Inherits M-078 and M-088 definition problems. The tile is green at 1 of N (D-40). The drill-down row shows AUTO only (M-023).

### M-006

**Loops in normal mode (fleet).** Status: **Definition conflict**

- **Labels:** "In auto mode", "normal mode", "K2 Service factor (in normal mode)", "K2 In auto mode"
- **Surfaces:**
  - /cpm: headline tile (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:16)
  - /cpm/kpi: page; card picker (src/frontend-ob/src/components/Cpm/CpmKpiDrilldown.tsx:68-71)
- **Displayed definitions:**
  - Server rule: "AUTO / CASCADE ≥ {NormalModeMin:P0} of the {WindowKind} window (> {1 - NormalModeMin:P0} out of design mode = out of mode), {fresh}" (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:136-137)
  - KPI_META formula: "count(AUTO % ≥ limit) ÷ loops with a measured mode;  AUTO % = time in AUTO or CASCADE ÷ window time" (src/frontend-ob/src/components/Cpm/kpi/kpiMeta.ts:36)
  - KPI_META threshold: "AUTO / CASCADE ≥ {normalModeMin} of the window" (src/frontend-ob/src/components/Cpm/kpi/kpiMeta.ts:37)
  - KPI_WHY: "A loop out of its normal mode is not controlling. More than 5 % of the time out of design mode counts as out of mode; target: fewer than 10 % of loops out of mode (Emerson loop-performance guidance; Bayer / PlantTriage)." (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:123)
- **Engine calculation:** count(fresh ∧ auto_pct ≥ NormalModeMin) ÷ count(fresh ∧ auto_pct measured) (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:33-35,136). Field: M-078.
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:100-109 (K2); kpi_calculation_logic/KPI-LOGIC.md:231 (Q4a); kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:274.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34).
- **Eligibility:** Fresh rows with a non-null auto_pct. Null when the window failed G0 or had n < 10 (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:19-21).
- **Denominator:** stated: loops with a measured mode. Computed: fresh rows with auto_pct not null; excluded windows count, declined windows do not.
- **Unit and scale:** displayed: count + % of denominator. Computed: count over count.
- **Thresholds:**
  - 0.95 per loop. Source: server config Cpm:Kpi:NormalModeMin (src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:8). Colour: decides membership.
  - out-of-mode share < 0.10. Source: hardcoded default argument (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:24,29). Colour: green below, amber at or above.
- **Staleness:** /cpm and /cpm/kpi: Fresh = (now − window_end) ≤ Cpm:Kpi:FreshSeconds, default 3600 s (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:30-31; src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:7).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172).
- **Consistency:** See D-01 to D-06. Tile says "AUTO / CASCADE"; drill says "Out of normal mode"; doc says "Service factor".

### M-007

**Loops out of normal mode.** Status: **Label only**

- **Labels:** "Out of normal mode", "out of normal mode", "OUT_OF_MODE"
- **Surfaces:**
  - /cpm/kpi: drill-only entry (src/frontend-ob/src/components/Cpm/CpmKpiDrilldown.tsx:36)
- **Displayed definitions:**
  - KPI_META formula: "count(AUTO % < limit) ÷ loops with a measured mode" (src/frontend-ob/src/components/Cpm/kpi/kpiMeta.ts:43)
  - KPI_META threshold: "AUTO / CASCADE < {normalModeMin} of the window" (src/frontend-ob/src/components/Cpm/kpi/kpiMeta.ts:44)
  - KPI_WHY: "Loops that spent more than 5 % of the window outside AUTO / CASCADE (Emerson; Bayer / PlantTriage)." (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:124)
- **Engine calculation:** NormalModeMeasured ∧ ¬InNormalMode (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:111). The server returns no figure for it (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:130-154), so the page falls back to the list total (src/frontend-ob/src/components/Cpm/CpmKpiDrilldown.tsx:103).
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:272-273 (drill key).
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34).
- **Eligibility:** As M-006.
- **Denominator:** stated: loops with a measured mode (formula). Computed: No figure served; total of the list.
- **Unit and scale:** displayed: count. Computed: count.
- **Thresholds:**
  - 0.95. Source: server config (src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:8). Colour: none.
- **Staleness:** /cpm and /cpm/kpi: Fresh = (now − window_end) ≤ Cpm:Kpi:FreshSeconds, default 3600 s (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:30-31; src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:7).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172).
- **Consistency:** Same rule as M-006 under a different name.

### M-008

**Loops in manual.** Status: **Engine-UI conflict**

- **Labels:** "In manual mode", "Time in MANUAL", "MANUAL %", "manual"
- **Surfaces:**
  - /cpm: headline tile (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:16)
  - /cpm/kpi: page (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:83-84)
- **Displayed definitions:**
  - Server rule: "MANUAL ≥ {ManualModeMin:P0} of the {WindowKind} window (operated by hand most of the time), {fresh}" (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:139)
  - KPI_META formula: "count(MANUAL % ≥ limit) ÷ loops with a measured manual share;  MANUAL % = time in MANUAL ÷ window time" (src/frontend-ob/src/components/Cpm/kpi/kpiMeta.ts:40)
  - KPI_WHY: "Loops run by hand for half the window or more: the controller is not in charge, so its tuning cannot be judged and the operator carries the load (service factor, Emerson; Bayer / PlantTriage). A loop in MANUAL for a short task is not counted." (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:125)
- **Engine calculation:** count(fresh ∧ manual_pct ≥ ManualModeMin) ÷ count(fresh ∧ manual_pct measured) (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:37-38,138). manual_pct = 1 − auto_pct (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:194), so every non-auto sample counts: UNKNOWN, null and unmapped tokens included (src/flink/src/main/java/com/ams/flink/cplm/CplmNormalizedSample.java:234-244).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:275. Not in kpi_calculation_logic/KPI-LOGIC.md: the drill-key list at kpi_calculation_logic/KPI-LOGIC.md:272-273 omits it.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34).
- **Eligibility:** Fresh rows with non-null manual_pct.
- **Denominator:** stated: loops with a measured manual share. Computed: fresh rows with manual_pct not null.
- **Unit and scale:** displayed: count + % of denominator. Computed: count over count.
- **Thresholds:**
  - 0.50. Source: server config Cpm:Kpi:ManualModeMin (src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:13). Colour: decides membership; tile amber when count > 0 (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:33).
  - ?? 0.5. Source: hardcoded fallback (src/frontend-ob/src/components/Cpm/kpi/kpiMeta.ts:41). Colour: text only.
- **Staleness:** /cpm and /cpm/kpi: Fresh = (now − window_end) ≤ Cpm:Kpi:FreshSeconds, default 3600 s (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:30-31; src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:7).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172).
- **Consistency:** Conflicts with the engine: "operated by hand" and "time in MANUAL" also count samples with no usable mode (D-02). A loop with an unmapped MODE reads 100 % manual; the data-source panel states this as "every sample counts as not-auto" (src/frontend-ob/src/components/Administration/LoopIngestPanel.tsx:122).

### M-009

**Oscillating loops.** Status: **Definition conflict**

- **Labels:** "Oscillating", "K3 Oscillating"
- **Surfaces:**
  - /cpm: condition tile (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:17)
  - /cpm/kpi: page with period and regularity (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:61-63)
- **Displayed definitions:**
  - Server rule: "Suspected or confirmed oscillation (evidence ≥ 75), {fresh}" (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:141)
  - KPI_META formula: "count(diagnosis ∈ {SUSPECTED, CONFIRMED}_OSCILLATION) ÷ assessed loops" (src/frontend-ob/src/components/Cpm/kpi/kpiMeta.ts:46)
  - KPI_META threshold: "Suspected or confirmed (evidence ≥ 75)" (src/frontend-ob/src/components/Cpm/kpi/kpiMeta.ts:47)
  - KPI_WHY: "Oscillation is among the most common loop defects (Ender 1993; Hägglund 1995). Counted only when suspected or confirmed (evidence ≥ 75), as an alarm would be (ISA-18.2)." (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:126)
- **Engine calculation:** Outcome Finding ∧ family OSCILLATION (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:65-71,107). Family qualifies when max(acf_regularity, fft_peak_ratio) ≥ 0.55 or G5/G6 is WARN/STRONG, with no valid-period requirement on that path (src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionEvidence.java:78-84,167-171).
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:111-119 (K3), including the lab finding of confirmed oscillation with NO_VALID_CYCLE (kpi_calculation_logic/KPI-LOGIC.md:118); kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:276.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34).
- **Eligibility:** Assessed loops. Persistence 2 of 3 windows, else capped to DETECTED (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:396-431).
- **Denominator:** stated: assessed loops. Computed: assessed (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:140).
- **Unit and scale:** displayed: count + % of denominator. Computed: count over count.
- **Thresholds:**
  - evidence ≥ 75. Source: hardcoded text and row threshold (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:141; src/services/cplm-api/Services/Kpi/FleetKpiRows.cs:61); engine band 0.75 hardcoded (src/flink/src/main/java/com/ams/flink/cplm/fusion/DiagnosisBands.java:53-57). Colour: tile amber when count > 0 (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:33).
- **Staleness:** /cpm and /cpm/kpi: Fresh = (now − window_end) ≤ Cpm:Kpi:FreshSeconds, default 3600 s (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:30-31; src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:7).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172).
- **Consistency:** Rule text is exact. Conflicts in meaning: the same row can read "Oscillation confirmed" and "period not measured" (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:62), and "No clean oscillation cycle: period and waveform shape not measured" (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:39). See D-12.

### M-010

**Suspected valve problem.** Status: **Label only**

- **Labels:** "Suspected valve problem", "K4", "Valve / final element", "Stiction / final element", "Valve stiction / nonlinearity", "Valve nonlinearity (stiction)"
- **Surfaces:**
  - /cpm: condition tile (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:17)
  - /cpm/kpi: page with G14 state (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:71-72)
- **Displayed definitions:**
  - Server rule: "Suspected or confirmed final-element nonlinearity (stiction / backlash), {fresh}" (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:143)
  - KPI_META formula: "count(diagnosis ∈ {SUSPECTED, CONFIRMED}_FINAL_ELEMENT_NONLINEARITY) ÷ assessed loops" (src/frontend-ob/src/components/Cpm/kpi/kpiMeta.ts:49)
  - KPI_META threshold: "Suspected or confirmed stiction / backlash" (src/frontend-ob/src/components/Cpm/kpi/kpiMeta.ts:50)
  - KPI_WHY: "Valve stiction / backlash is a frequent root cause of oscillation and the one maintenance acts on (Horch 1999; Choudhury, Shah & Thornhill 2008). Without valve position it stops at suspected." (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:127)
- **Engine calculation:** Outcome Finding ∧ family FINAL_ELEMENT_NONLINEARITY (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:108). Families stiction and geometry both map to this label (src/flink/src/main/java/com/ams/flink/cplm/fusion/DiagnosisBands.java:20-21).
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:121-126 (K4); kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:277.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34).
- **Eligibility:** Assessed loops.
- **Denominator:** stated: assessed loops. Computed: assessed (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:142).
- **Unit and scale:** displayed: count + % of denominator. Computed: count over count.
- **Thresholds:**
  - count > 0 amber. Source: hardcoded (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:33). Colour: amber.
- **Staleness:** /cpm and /cpm/kpi: Fresh = (now − window_end) ≤ Cpm:Kpi:FreshSeconds, default 3600 s (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:30-31; src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:7).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172).
- **Consistency:** The tile name says "Suspected" and the count includes confirmed. See M-060 for what "confirmed" establishes.

### M-011

**Excessive actuator effort.** Status: **Engine-UI conflict**

- **Labels:** "Excessive actuator effort", "K5", "Actuator effort", "Excessive actuator effort finding"
- **Surfaces:**
  - /cpm: condition tile (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:17)
  - /cpm/kpi: page with effort ratio, OP travel, reversals (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:67-70)
- **Displayed definitions:**
  - Server rule: "Suspected or confirmed excessive effort (OP travel / reversals), {fresh}" (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:145)
  - KPI_META threshold: "Suspected or confirmed (OP travel, reversals)" (src/frontend-ob/src/components/Cpm/kpi/kpiMeta.ts:53)
  - KPI_WHY: "Excessive OP travel and reversals wear the final element (standard CPM wear indicators)." (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:128)
- **Engine calculation:** Family score = clamp01(effort_ratio / 8) × priorEffort; qualified when score ≥ 0.55 or G4/G10 is WARN/STRONG (src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionEvidence.java:65,146-149). effort_ratio = σ(OP)/σ(PV) (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:289). travel_per_day and reversals_per_hour are not inputs to this family.
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:128-134 lists travel and reversals as inputs (kpi_calculation_logic/KPI-LOGIC.md:131); kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:154 gives the score from effort_ratio only.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34).
- **Eligibility:** Assessed loops.
- **Denominator:** stated: assessed loops. Computed: assessed (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:144).
- **Unit and scale:** displayed: count + % of denominator. Computed: count over count.
- **Thresholds:**
  - / 8.0. Source: hardcoded (src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionEvidence.java:65). Colour: indirect.
  - count > 0 amber. Source: hardcoded (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:33). Colour: amber.
- **Staleness:** /cpm and /cpm/kpi: Fresh = (now − window_end) ≤ Cpm:Kpi:FreshSeconds, default 3600 s (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:30-31; src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:7).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172).
- **Consistency:** Conflicts: rule, threshold card and KPI_WHY name OP travel and reversals; the engine decides on the σ ratio. kpi_calculation_logic/KPI-LOGIC.md:131 also disagrees with kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:154 (D-09).

### M-012

**Saturated loops.** Status: **Engine-UI conflict**

- **Labels:** "Saturated / at limit", "K6", "at an OP limit", "SATURATED"
- **Surfaces:**
  - /cpm: condition tile (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:17)
  - /cpm/kpi: page with limit basis and dwell (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:64-66)
- **Displayed definitions:**
  - Server rule: "OP fully open or closed > {SaturationMax:P0} of the window, {fresh}" (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:147)
  - KPI_META formula: "count(time with OP fully open or closed ÷ window time > limit) ÷ loops with a measured OP" (src/frontend-ob/src/components/Cpm/kpi/kpiMeta.ts:55)
  - KPI_META threshold: "> {saturationMax} of the window at an OP limit" (src/frontend-ob/src/components/Cpm/kpi/kpiMeta.ts:56)
  - KPI_WHY: "A loop at its OP limit has no authority, whatever its tuning. More than 10 % of the time fully open or closed (Bayer / PlantTriage)." (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:129)
- **Engine calculation:** count(fresh ∧ saturation_pct > SaturationMax) ÷ count(fresh ∧ saturation_pct measured) (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:34-36,146). Field: M-088.
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:136-144 (K6): definition says "share of assessed loops" (kpi_calculation_logic/KPI-LOGIC.md:137), formula says measured rows (kpi_calculation_logic/KPI-LOGIC.md:138); kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:279.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34).
- **Eligibility:** Fresh rows with non-null saturation_pct, excluded windows included.
- **Denominator:** stated: loops with a measured OP. Computed: fresh rows with saturation_pct not null. kpi_calculation_logic/KPI-LOGIC.md:137 says assessed loops..
- **Unit and scale:** displayed: count + % of denominator. Computed: count over count.
- **Thresholds:**
  - > 0.10. Source: server config Cpm:Kpi:SaturationMax (src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:9). Colour: decides membership; tile amber when count > 0.
- **Staleness:** /cpm and /cpm/kpi: Fresh = (now − window_end) ≤ Cpm:Kpi:FreshSeconds, default 3600 s (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:30-31; src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:7).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172).
- **Consistency:** Conflicts: "fully open or closed" is OP ≤ 5 or ≥ 95 pp, and the share is of samples (D-10, D-01).

## Fleet state

### M-013

**Not assessable loops.** Status: **Engine-UI conflict**

- **Labels:** "Not assessable", "K7", "Not assessable — {reason}"
- **Surfaces:**
  - /cpm: coverage tile and bar segment (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:18,48)
  - /cpm/kpi: page with reason chips (src/frontend-ob/src/components/Cpm/CpmKpiDrilldown.tsx:155-164)
  - /cpm/performance: exclusion in basis line (src/frontend-ob/src/components/Cpm/performanceHeadline.ts:16)
- **Displayed definitions:**
  - Server rule: "Fresh window could not be judged: incomplete data (< {G0CompletenessMin:P0}), bad quality, manual mode, outside region or instrument fault" (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:149)
  - KPI_META formula: "count(fresh window INSUFFICIENT_DATA or EXCLUDED_*) ÷ monitored;  completeness = samples ÷ (window ÷ grid)" (src/frontend-ob/src/components/Cpm/kpi/kpiMeta.ts:58)
  - KPI_META threshold: "Completeness < {g0CompletenessMin}, bad quality ≥ {g0BadQualityMax}, or excluded" (src/frontend-ob/src/components/Cpm/kpi/kpiMeta.ts:59)
  - KPI_WHY: "The window could not be judged — reported with its cause, never as 0 (NAMUR NE 107; GUM)." (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:130)
- **Engine calculation:** State NotAssessable when fresh and diagnosis is empty, PENDING, INSUFFICIENT_DATA or EXCLUDED* (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:47-51). Exclusions come from fusion (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:126-149).
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:146-155 (K7); kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:280.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34).
- **Eligibility:** Fresh rows only; a stale excluded loop reads M-015.
- **Denominator:** stated: monitored loops. Computed: monitored (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:148).
- **Unit and scale:** displayed: count; sub-line reason counts or "N % of monitored". Computed: count.
- **Thresholds:**
  - 0.95, 0.50. Source: server config used for reason text only (src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:10-11). Colour: none.
  - count > 0 amber. Source: hardcoded (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:33). Colour: amber.
- **Staleness:** /cpm and /cpm/kpi: Fresh = (now − window_end) ≤ Cpm:Kpi:FreshSeconds, default 3600 s (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:30-31; src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:7).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172).
- **Consistency:** The MANUAL_MODE row is compared with 0.95 but the exclusion fires below 0.70 (D-13). The rule omits the sensor-freeze exclusion.

### M-014

**Not-assessable reason.** Status: **Definition conflict**

- **Labels:** "incomplete data", "bad quality", "data not qualified", "manual mode", "outside operating region", "instrument fault", "sensor fault", "not yet judged", "excluded"
- **Surfaces:**
  - /cpm: tile sub-line (src/frontend-ob/src/components/Cpm/overview/OperatingPicture.tsx:63)
  - /cpm/kpi: reason chips and rows (src/frontend-ob/src/components/Cpm/CpmKpiDrilldown.tsx:160-163)
- **Displayed definitions:**
  - REASON map: "INCOMPLETE_DATA: incomplete data; BAD_QUALITY: bad quality; DATA_QUALIFICATION: data not qualified; MANUAL_MODE: manual mode; OUTSIDE_OPERATING_REGION: outside operating region; INSTRUMENT_HEALTH: instrument fault; SENSOR_FAULT: sensor fault; NOT_YET_JUDGED: not yet judged; EXCLUDED_OTHER: excluded" (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:54-64)
- **Engine calculation:** EXCLUDED_* maps by table (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:19-26). INSUFFICIENT_DATA maps through gate0_reason, then inputs (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:88-96). gate0_reason is QUALITY_UNKNOWN, BAD_QUALITY or INCOMPLETE (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:139-147). A declined window sets sufficientData false, so fusion returns INSUFFICIENT_DATA before the G0 block (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:150-158; src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:126-133).
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:148-151.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34).
- **Eligibility:** Not-assessable loops.
- **Denominator:** stated: None. Computed: Sums to Not assessable.
- **Unit and scale:** displayed: count per reason. Computed: count.
- **Thresholds:** none.
- **Staleness:** /cpm and /cpm/kpi: Fresh = (now − window_end) ≤ Cpm:Kpi:FreshSeconds, default 3600 s (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:30-31; src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:7).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172).
- **Consistency:** Differs: QUALITY_UNKNOWN contains "QUALITY" and reads "bad quality" (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:91), although the engine separates the two (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:137-141). EXCLUDED_DATA_QUALITY is mapped but the G0-failed path never reaches it.

### M-015

**Stale loops.** Status: **Definition conflict**

- **Labels:** "Stale", "Newest result N ago", "Age of the newest result", "Stale ·", "ended N ago", "STALE"
- **Surfaces:**
  - /cpm: coverage tile and bar segment (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:18,49)
  - /cpm/kpi: page (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:33)
  - /cpm/performance: exclusion (src/frontend-ob/src/components/Cpm/performanceHeadline.ts:17) and page banner (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:265)
  - /cpm/explorer: summary eyebrow (src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:110)
- **Displayed definitions:**
  - Server rule: "Newest {WindowKind} result older than {FreshSeconds/60} min — the pipeline or feed stopped producing" (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:151)
  - KPI_META threshold: "No result for > {freshSeconds/60} min" (src/frontend-ob/src/components/Cpm/kpi/kpiMeta.ts:62)
  - KPI_WHY: "No new result for more than 1 h (four missed 15-minute evaluations): the pipeline or the feed stopped (OPC UA "last usable value")." (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:131)
- **Engine calculation:** Window exists and not fresh (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:44-45). Note a slice below 32 samples is not emitted at all (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:41-43,59).
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:68; kpi_calculation_logic/KPI-LOGIC.md:157-160 (K8); kpi_calculation_logic/KPI-LOGIC.md:228 (Q1); kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:281.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34).
- **Eligibility:** Newest LIVE row exists.
- **Denominator:** stated: monitored loops. Computed: monitored.
- **Unit and scale:** displayed: count. Computed: count.
- **Thresholds:**
  - 3600 s. Source: server config Cpm:Kpi:FreshSeconds (src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:7). Colour: tile and bar amber when count > 0.
  - window length. Source: code (src/services/cplm-api/Data/FleetLatestSql.cs:227-238; src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:110-115). Colour: queue membership; summary note.
  - 3 h. Source: hardcoded (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:57). Colour: banner class cpm-freshness--stale.
  - "1 h" in KPI_WHY. Source: hardcoded text (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:131). Colour: none.
- **Staleness:** /cpm and /cpm/kpi: Fresh = (now − window_end) ≤ Cpm:Kpi:FreshSeconds, default 3600 s (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:30-31; src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:7). /cpm/performance: page banner only, newest window across loops older than 3 h reads "Stale" (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:57,167-169,265). /cpm/explorer summary: window end older than the window size adds "ended … ago" (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:110-115; src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:87,110). Priority queue: window length, on the newest real verdict (src/services/cplm-api/Data/FleetPrioritySql.cs:53).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172).
- **Consistency:** Three rules (D-05). KPI_WHY keeps "1 h" when the limit is configured to another value.

### M-016

**Never evaluated loops.** Status: **Definition conflict**

- **Labels:** "Never evaluated", "No result yet", "none yet", "Not evaluated", "Not evaluated yet"
- **Surfaces:**
  - /cpm: coverage tile and bar segment (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:18,50)
  - /cpm/kpi: page (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:32)
  - /cpm/performance: filter "Not evaluated" (src/frontend-ob/src/components/Cpm/gateStatus.ts:225)
- **Displayed definitions:**
  - Server rule: "No {WindowKind} result yet — onboarding or mapping gap" (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:153)
  - KPI_META formula: "count(no result at all) ÷ monitored loops" (src/frontend-ob/src/components/Cpm/kpi/kpiMeta.ts:64)
  - KPI_WHY: "Monitored but never evaluated: an onboarding or signal-mapping gap." (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:132)
- **Engine calculation:** No LIVE row of the kind with window_end ≤ asOf among the rows kept (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:44; src/services/cplm-api/Data/FleetKpiSql.cs:45-52). Gate results are kept 30 days, or 14 under the headroom rule (prod_decision.md:53).
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:69; kpi_calculation_logic/KPI-LOGIC.md:157-158 (K9); kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:282.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34).
- **Eligibility:** Monitored loops.
- **Denominator:** stated: monitored loops. Computed: monitored.
- **Unit and scale:** displayed: count. Computed: count.
- **Thresholds:**
  - always muted. Source: hardcoded (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:32). Colour: grey at any count.
- **Staleness:** Not applicable.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172).
- **Consistency:** Differs: a loop whose rows were pruned by retention reads "never evaluated" although it was. The 24h and 12h pictures can differ for one loop. Not determined whether this occurs on the plant.

### M-017

**Loops with a finding.** Status: **Consistent**

- **Labels:** "With a finding", "finding"
- **Surfaces:**
  - /cpm: bar segment (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:45)
  - /cpm/kpi: drill-only (src/frontend-ob/src/components/Cpm/CpmKpiDrilldown.tsx:37)
- **Displayed definitions:**
  - KPI_WHY: "Suspected or confirmed findings of any family." (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:133)
  - Basis text: "findings = suspected or confirmed" (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:77)
- **Engine calculation:** Outcome Finding when band is SUSPECTED or CONFIRMED (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:65-70).
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:52-54; kpi_calculation_logic/KPI-LOGIC.md:71; kpi_calculation_logic/KPI-LOGIC.md:229 (Q2).
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34).
- **Eligibility:** Assessed loops.
- **Denominator:** stated: Bar: monitored. Computed: monitored.
- **Unit and scale:** displayed: count. Computed: count.
- **Thresholds:**
  - evidence ≥ 75. Source: engine band, hardcoded (src/flink/src/main/java/com/ams/flink/cplm/fusion/DiagnosisBands.java:57). Colour: row pill red (src/frontend-ob/src/components/Cpm/kpi/KpiRowsTable.tsx:23).
- **Staleness:** /cpm and /cpm/kpi: Fresh = (now − window_end) ≤ Cpm:Kpi:FreshSeconds, default 3600 s (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:30-31; src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:7).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172).
- **Consistency:** Same on /cpm and /cpm/kpi; the priority queue uses a wider set (M-027).

### M-018

**Symptom-only loops.** Status: **Definition conflict**

- **Labels:** "Symptom only (weak evidence)", "Symptom only", "symptom"
- **Surfaces:**
  - /cpm: bar segment (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:46)
  - /cpm/kpi: drill-only (src/frontend-ob/src/components/Cpm/CpmKpiDrilldown.tsx:38)
- **Displayed definitions:**
  - KPI_WHY: "Detected or classified symptoms: evidence below 75, listed but not counted as findings." (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:134)
  - Gate mark: "condition detected (weak evidence); condition classified (moderate evidence)" (src/frontend-ob/src/components/Cpm/gateStatus.ts:78-79)
- **Engine calculation:** Outcome SymptomOnly for DETECTED or CLASSIFIED (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:68). A strong result that fails persistence is rewritten to DETECTED at 0.54 (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:418-431), and a contradicted valve claim is capped at 0.54 (src/flink/src/main/java/com/ams/flink/cplm/fusion/Confirmation.java:80).
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:52-54; kpi_calculation_logic/KPI-LOGIC.md:72.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34).
- **Eligibility:** Assessed loops.
- **Denominator:** stated: Bar: monitored. Computed: monitored.
- **Unit and scale:** displayed: count. Computed: count.
- **Thresholds:**
  - 0.35 to 0.75. Source: engine bands, hardcoded (src/flink/src/main/java/com/ams/flink/cplm/fusion/DiagnosisBands.java:44-53). Colour: row pill amber (src/frontend-ob/src/components/Cpm/kpi/KpiRowsTable.tsx:23).
- **Staleness:** /cpm and /cpm/kpi: Fresh = (now − window_end) ≤ Cpm:Kpi:FreshSeconds, default 3600 s (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:30-31; src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:7).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172).
- **Consistency:** Differs: "weak evidence" also labels a strong result held back by persistence. Doc kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:179 says the cap applies to SUSPECTED/CONFIRMED; code applies it to every band (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:418).

### M-019

**No fault, but limited.** Status: **Definition conflict**

- **Labels:** "No fault, but out of mode or at limit", "No fault, but limited", "limited by: …", "out of normal mode", "at an OP limit", "good-error share below the floor (G3)", "good-error share not evaluated (G3)", "strong actuator activity (G4)"
- **Surfaces:**
  - /cpm: bar segment (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:47)
  - /cpm/kpi: drill-only and context column (src/frontend-ob/src/components/Cpm/CpmKpiDrilldown.tsx:39; src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:78-82)
- **Displayed definitions:**
  - Segment label: "No fault, but out of mode or at limit" (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:47)
  - KPI_WHY: "No fault identified, but a performance criterion was missed — out of normal mode more than 5 % of the window, at an OP limit more than 10 %, good-error share below the floor or not evaluated (G3), or strong actuator activity (G4) — so not counted as performing acceptably." (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:135)
- **Engine calculation:** Outcome NoFaultLimited when PerformanceLimits is not empty: OUT_OF_MODE, SATURATED, G3_BELOW_FLOOR, G3_NOT_EVALUATED, G4_STRONG (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:60,75-85).
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:85-89; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:273.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34).
- **Eligibility:** Assessed, no-fault diagnosis.
- **Denominator:** stated: Bar: monitored. Computed: monitored.
- **Unit and scale:** displayed: count. Computed: count.
- **Thresholds:**
  - As M-005. Source: server config and profile. Colour: bar segment class outOfMode.
- **Staleness:** /cpm and /cpm/kpi: Fresh = (now − window_end) ≤ Cpm:Kpi:FreshSeconds, default 3600 s (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:30-31; src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:7).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172).
- **Consistency:** Label narrower than the set: the bar and drill option name only mode and limit, the set also holds G3 and G4 cases.

## Fleet KPI

### M-020

**Fleet KPI change since 24 h ago.** Status: **Consistent**

- **Labels:** "+N pp", "−N pp", "±0 pp", "change vs 24 h ago", "the change compares with 24 h earlier"
- **Surfaces:**
  - /cpm: delta chip on each tile (src/frontend-ob/src/components/Cpm/kpi/KpiCard.tsx:31-39; src/frontend-ob/src/components/Cpm/overview/OperatingPicture.tsx:46)
  - /cpm/kpi: large card (src/frontend-ob/src/components/Cpm/CpmKpiDrilldown.tsx:100-102,108)
- **Displayed definitions:**
  - Tooltip: "Change since 24 h ago: {then} % ({count} of {denominator}) → {now} % now ({count} of {denominator}), {N} percentage points {direction}" (src/frontend-ob/src/components/Cpm/kpi/kpiMeta.ts:89-90)
- **Engine calculation:** Round(share now − share then), shares in % (src/frontend-ob/src/components/Cpm/kpi/kpiMeta.ts:80-82). Then = same classifier as of now − 24 h (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:56,257).
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:280-284.
- **Window and boundary:** Two classifications 24 h apart, each on the page's fused window. Registry membership is today's (kpi_calculation_logic/KPI-LOGIC.md:283-284).
- **Eligibility:** Hidden when either denominator is 0 (src/frontend-ob/src/components/Cpm/kpi/kpiMeta.ts:79).
- **Denominator:** stated: Named in tooltip. Computed: Each picture's own denominator.
- **Unit and scale:** displayed: pp, integer. Computed: pp.
- **Thresholds:**
  - higherIsBetter per KPI. Source: hardcoded (src/frontend-ob/src/components/Cpm/kpi/kpiMeta.ts:31-65). Colour: green right way, red wrong way, grey flat (src/frontend-ob/src/components/Cpm/kpi/KpiCard.tsx:32).
- **Staleness:** /cpm and /cpm/kpi: Fresh = (now − window_end) ≤ Cpm:Kpi:FreshSeconds, default 3600 s (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:30-31; src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:7).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172).
- **Consistency:** Same on both surfaces.

### M-021

**KPI daily trend point.** Status: **Definition conflict**

- **Labels:** "How this number has moved", "Last 14 d", "each UTC day at its end, same rules", "Between N % and M % over the days with data", "no data (nothing to judge)", "matches that day"
- **Surfaces:**
  - /cpm/kpi: bar chart (src/frontend-ob/src/components/Cpm/kpi/KpiTrendChart.tsx:37,45; src/frontend-ob/src/components/Cpm/CpmKpiDrilldown.tsx:122,136-137)
- **Displayed definitions:**
  - Eyebrow: "Last {range} · each {plant day} at its end, same rules" (src/frontend-ob/src/components/Cpm/CpmKpiDrilldown.tsx:122)
  - Caption: "Click a day to list the loops it counted. Days with nothing kept read "no data", not 0 %." (src/frontend-ob/src/components/Cpm/CpmKpiDrilldown.tsx:137)
- **Engine calculation:** One point per plant day as of the day end, read from analytics.cplm_kpi_daily when stored, else classified live inside 14 days, else empty (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:147-153,164-193). Share rounded to 0.1 (src/frontend-ob/src/components/Cpm/kpi/kpiTrend.ts:26).
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:292-295 and kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:286 say same time of day, limit 14 days. Code: day end, up to 1095 days (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:141).
- **Window and boundary:** Plant day from Cpm:PlantTimeZone (src/services/cplm-api/Services/Kpi/PlantClock.cs:1-8; compose default local: infra/docker/docker-compose.yml:1446). Last point is the live snapshot.
- **Eligibility:** A day with denominator 0 is no data (src/frontend-ob/src/components/Cpm/kpi/kpiTrend.ts:26).
- **Denominator:** stated: Tooltip: N of M. Computed: That day's denominator.
- **Unit and scale:** displayed: % rounded to 0.1, axis 0–100. Computed: share.
- **Thresholds:** none.
- **Staleness:** Past days: 10 min cache (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:164); UI staleTime 5 min (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:35).
- **Version:** Stamped: rule_version on each stored day (src/services/cplm-api/Services/Kpi/FleetKpiDaily.cs:21). Shown: no.
- **Consistency:** Docs out of date against CHG-102 code.

### M-022

**Share of denominator.** Status: **Definition conflict**

- **Labels:** "N % of M {denominator}", "N % of monitored", "N % of {denominatorLabel}"
- **Surfaces:**
  - /cpm: tile sub-line (src/frontend-ob/src/components/Cpm/overview/OperatingPicture.tsx:28,63)
  - /cpm/kpi: card label (src/frontend-ob/src/components/Cpm/CpmKpiDrilldown.tsx:101)
- **Displayed definitions:**
  - Code comment: ""of 160 assessed loops" — the denominator is always named, so a % can be checked." (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:36)
- **Engine calculation:** denominator > 0 ? round(count/denominator × 100) : 0 (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:21-22).
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:20-21: a value that could not be established is never shown as 0.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34).
- **Eligibility:** Any figure.
- **Denominator:** stated: Named. Computed: Figure denominator.
- **Unit and scale:** displayed: integer %. Computed: integer %.
- **Thresholds:** none.
- **Staleness:** /cpm and /cpm/kpi: Fresh = (now − window_end) ≤ Cpm:Kpi:FreshSeconds, default 3600 s (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:30-31; src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:7).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172).
- **Consistency:** Differs: with denominator 0 the tile reads "0 % of 0 …", while the trend for the same case reads "no data" (src/frontend-ob/src/components/Cpm/kpi/kpiTrend.ts:26).

### M-023

**Deciding value against the rule.** Status: **Definition conflict**

- **Labels:** "Measured against the rule", "Time in AUTO / CASCADE", "Time with OP fully open or closed", "Time in MANUAL", "Evidence score", "Sample completeness", "Bad-quality samples", "Age of the newest result", "State"
- **Surfaces:**
  - /cpm/kpi: table column with meter (src/frontend-ob/src/components/Cpm/kpi/KpiRowsTable.tsx:41,57-58)
- **Displayed definitions:**
  - Code comment: "the value that put this loop here, against its threshold" (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:14)
- **Engine calculation:** Server chooses one value per KPI (src/services/cplm-api/Services/Kpi/FleetKpiRows.cs:48-70); client words the comparison (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:15-28).
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:18; kpi_calculation_logic/KPI-LOGIC.md:268.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34).
- **Eligibility:** Rows of the selected KPI.
- **Denominator:** stated: None. Computed: None.
- **Unit and scale:** displayed: % to 0.1, score, or duration. Computed: fraction, score, seconds.
- **Thresholds:**
  - 75.0. Source: hardcoded (src/services/cplm-api/Services/Kpi/FleetKpiRows.cs:61). Colour: meter mark.
  - NormalModeMin. Source: server config. Colour: meter mark.
- **Staleness:** /cpm and /cpm/kpi: Fresh = (now − window_end) ≤ Cpm:Kpi:FreshSeconds, default 3600 s (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:30-31; src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:7).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172).
- **Consistency:** Differs: "acceptable" and "no-fault-limited" show AUTO only, though five criteria decide (src/services/cplm-api/Services/Kpi/FleetKpiRows.cs:55-56). MANUAL_MODE compares with the fleet limit, not the exclusion limit (src/services/cplm-api/Services/Kpi/FleetKpiRows.cs:65).

### M-024

**KPI computed time.** Status: **Consistent**

- **Labels:** "updated", "Computed"
- **Surfaces:**
  - /cpm: panel right text (src/frontend-ob/src/components/Cpm/overview/OperatingPicture.tsx:46)
  - /cpm/kpi: card (src/frontend-ob/src/components/Cpm/CpmKpiDrilldown.tsx:107-108)
- **Displayed definitions:**
  - None displayed.
- **Engine calculation:** computedAt = time of the classification, cached up to 15 s (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:257-258).
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:15-16.
- **Window and boundary:** Server clock UTC, shown in the browser zone (src/frontend-ob/src/components/Cpm/shared.tsx:62-63).
- **Eligibility:** n/a
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: date time with zone name. Computed: instant.
- **Thresholds:** none.
- **Staleness:** Not a data age; the newest window end is not shown on the tile.
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** Same on both surfaces.

### M-025

**KPI basis and threshold cards.** Status: **Definition conflict**

- **Labels:** "Basis", "Threshold", "Operating picture · latest 12h results"
- **Surfaces:**
  - /cpm: eyebrow and footer (src/frontend-ob/src/components/Cpm/overview/OperatingPicture.tsx:44,88)
  - /cpm/kpi: cards (src/frontend-ob/src/components/Cpm/CpmKpiDrilldown.tsx:104-106)
- **Displayed definitions:**
  - basisText: "Each monitored loop counted once from its newest {windowKind} result, at most {freshSeconds/60} min old · normal mode ≥ {normalModeMin} % · at limit > {saturationMax} % · findings = suspected or confirmed" (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:73-78)
  - basisShort: "{windowKind} window · newest {windowKind} result ≤ {min} min old" (src/frontend-ob/src/components/Cpm/kpi/kpiMeta.ts:28,68)
- **Engine calculation:** Text from server basis object (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:238-247).
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:33-35 says 24 h basis; code default 12h (src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:12). kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:253 says 12h default.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34).
- **Eligibility:** n/a
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: text. Computed: text.
- **Thresholds:**
  - '12h' loading fallback. Source: hardcoded (src/frontend-ob/src/components/Cpm/overview/OperatingPicture.tsx:44). Colour: none.
- **Staleness:** /cpm and /cpm/kpi: Fresh = (now − window_end) ≤ Cpm:Kpi:FreshSeconds, default 3600 s (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:30-31; src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:7).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172).
- **Consistency:** UI matches code. kpi_calculation_logic/KPI-LOGIC.md:33 is out of date.

## Priority queue

### M-026

**Priority level.** Status: **Definition conflict**

- **Labels:** "High priority", "Medium priority", "Low priority", "Not prioritised", "top-priority loop", "Top-priority finding"
- **Surfaces:**
  - /cpm: badge on each queue row (src/frontend-ob/src/components/Cpm/overview/PriorityQueue.tsx:73)
  - /cpm: top finding sentence (src/frontend-ob/src/components/Cpm/CpmOverview.tsx:137-145)
  - /cpm: loop focus label (src/frontend-ob/src/components/Cpm/CpmOverview.tsx:114-116)
- **Displayed definitions:**
  - PRIORITY_RULE: "Ordered by priority (loop criticality × finding severity), then time outside the good-error band, then how long the condition has persisted, then evidence score. Shelved loops are listed in Loop Events." (src/frontend-ob/src/components/Cpm/overview/priorityReason.ts:13-14)
  - Server doc comment: "consequence = the loop's registered criticality (critical / high / medium / low; unset = medium); urgency = the finding's severity (HIGH / MEDIUM / LOW; unset = LOW, never inflated)." (src/services/cplm-api/Data/FleetPrioritySql.cs:9-10)
- **Engine calculation:** CASE matrix over criticality and severity (src/services/cplm-api/Data/FleetPrioritySql.cs:61-74). Order: priority, good_error_pct ASC, opened_at ASC, confidence DESC, loop_id (src/services/cplm-api/Data/FleetPrioritySql.cs:86-90). Severity is only the evidence band (M-028).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:301-310; prod_decision.md:109.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/hooks/useCpm.ts:194,203); API cache 15 s (src/services/cplm-api/Controllers/CpmFleetController.cs:42).
- **Eligibility:** M-027.
- **Denominator:** stated: None. Computed: None.
- **Unit and scale:** displayed: three levels. Computed: 1, 2, 3.
- **Thresholds:**
  - critical HIGH/MEDIUM → High; high HIGH → High; critical LOW, high MEDIUM, medium HIGH → Medium; else Low. Source: hardcoded SQL (src/services/cplm-api/Data/FleetPrioritySql.cs:61-74). Colour: High red, Medium amber, Low grey (src/frontend-ob/src/components/Cpm/overview/priorityReason.ts:18-20).
- **Staleness:** Priority queue: verdict window end within the window length (src/services/cplm-api/Data/FleetPrioritySql.cs:53; src/services/cplm-api/Data/FleetLatestSql.cs:227-238).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: no.
- **Consistency:** Text says consequence × urgency; urgency carries no process impact because severity follows the evidence band. Unset defaults are not shown (docs/theme/cpa-currenttheme.md:1125).

### M-027

**Priority queue membership.** Status: **Definition conflict**

- **Labels:** "Priority queue", "Loops requiring review", "No current findings", "View all"
- **Surfaces:**
  - /cpm: panel (src/frontend-ob/src/components/Cpm/overview/PriorityQueue.tsx:40,65)
- **Displayed definitions:**
  - Empty state: "No loop has a current confirmed or suspected finding. The operating picture above shows the rest of the fleet." (src/frontend-ob/src/components/Cpm/overview/PriorityQueue.tsx:59)
  - Basis text: "findings = suspected or confirmed" (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:77)
  - Server doc comment: "Only CURRENT findings are queued (the operating picture's "poor performance" rule: a CONFIRMED/SUSPECTED/DETECTED/CLASSIFIED verdict whose window is not stale)." (src/services/cplm-api/Data/FleetPrioritySql.cs:19-20)
- **Engine calculation:** Newest real LIVE verdict per loop, window end within the window length, diagnosis matches ^(CONFIRMED|SUSPECTED|DETECTED|CLASSIFIED)_, not actively shelved (src/services/cplm-api/Data/FleetPrioritySql.cs:30-41,53-54,84). Rows 6 of up to 50 shown (src/frontend-ob/src/components/Cpm/overview/PriorityQueue.tsx:25,65).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:301 says "finding diagnosis"; kpi_calculation_logic/KPI-LOGIC.md:52 says DETECTED and CLASSIFIED are not findings.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/hooks/useCpm.ts:194,203); API cache 15 s (src/services/cplm-api/Controllers/CpmFleetController.cs:42).
- **Eligibility:** Monitored; verdict not older than the window length; the newest row itself may be INSUFFICIENT_DATA.
- **Denominator:** stated: None; no total shown (docs/theme/cpa-currenttheme.md:1158). Computed: Limit 50 by default (src/services/cplm-api/Controllers/CpmFleetController.cs:149).
- **Unit and scale:** displayed: rows. Computed: rows.
- **Thresholds:** none.
- **Staleness:** Priority queue: verdict window end within the window length (src/services/cplm-api/Data/FleetPrioritySql.cs:53; src/services/cplm-api/Data/FleetLatestSql.cs:227-238).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: no.
- **Consistency:** Conflicts: empty state says confirmed or suspected, the query also admits detected and classified (docs/theme/cpa-currenttheme.md:1125). A loop can read Not assessable or Stale on the tiles and still queue, because the probe skips INSUFFICIENT_DATA rows and uses a longer age limit.

### M-028

**Severity.** Status: **Definition conflict**

- **Labels:** "High severity", "Medium severity", "Low severity", "Severity high", "Severity", "HIGH", "MEDIUM", "LOW", "Peak: {band}"
- **Surfaces:**
  - /cpm: reason line (src/frontend-ob/src/components/Cpm/overview/priorityReason.ts:35)
  - /cpm/explorer: summary pill (src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:114-118)
  - /cpm/investigation: row (src/frontend-ob/src/components/Cpm/CpmInvestigation.tsx:261)
  - /cpm/events: column and detail pill (src/frontend-ob/src/components/Cpm/CpmEvents.tsx:175,237; src/frontend-ob/src/components/Cpm/events/EventDetail.tsx:102)
- **Displayed definitions:**
  - Code comment, events: "The episode's peak, in the engine's own bands (CHG-092, SME review 2 #6/#20): the engine's severity when it wrote one, otherwise the band of the peak diagnosis — never a second set of score thresholds of our own." (src/frontend-ob/src/components/Cpm/events/EventDetail.tsx:32-33)
- **Engine calculation:** Set from the confidence band only: < 0.55 LOW, < 0.75 MEDIUM, ≥ 0.75 HIGH (src/flink/src/main/java/com/ams/flink/cplm/fusion/DiagnosisBands.java:44-72); LOW on every blocked row (src/flink/src/main/java/com/ams/flink/cplm/fusion/BlockingExclusions.java:17,34); LOW after the persistence cap (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:422). Episode severity = last verdict's severity (src/services/cplm-api/Services/EventFrameLifecycle.cs:197).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:175: "Severity follows the band only."
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55).
- **Eligibility:** Shown on findings on the loop summary (src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:114).
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: word. Computed: enum.
- **Thresholds:**
  - 0.55, 0.75. Source: hardcoded (src/flink/src/main/java/com/ams/flink/cplm/fusion/DiagnosisBands.java:48,53,57). Colour: toneFor: HIGH red, MEDIUM amber, LOW grey (src/frontend-ob/src/components/Cpm/shared.tsx:253-258).
- **Staleness:** Inherits the surface.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: no.
- **Consistency:** Conflicts: the word implies process impact, the value is the evidence band. Events: the code comment and "Peak:" title beside it say peak, the stored value is the latest window's. Sorting the "Severity" column orders by peak evidence score (src/frontend-ob/src/components/Cpm/CpmEvents.tsx:175-176; src/services/cplm-api/Data/EventPageSql.cs:62-64).

### M-029

**Loop criticality.** Status: **Consistent**

- **Labels:** "Critical loop", "High-criticality loop", "loop criticality {x}", "Criticality", "criticality {x}"
- **Surfaces:**
  - /cpm: reason line (src/frontend-ob/src/components/Cpm/overview/priorityReason.ts:34)
  - /cpm/explorer: summary (src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:117); model card (src/frontend-ob/src/components/Cpm/explorer/LoopModelCard.tsx:59)
  - /cpm/registry: aside (src/frontend-ob/src/components/Cpm/ProfileAside.tsx:95)
- **Displayed definitions:**
  - None displayed.
- **Engine calculation:** Registry value. No engine calculation. Unset = medium in the priority matrix (src/services/cplm-api/Data/FleetPrioritySql.cs:63,70).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:303-308; kpi_calculation_logic/KPI-LOGIC.md:30.
- **Window and boundary:** Registry, on change.
- **Eligibility:** Registry loops.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: word. Computed: text.
- **Thresholds:** none.
- **Staleness:** None.
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** Same word; the default for unset is not shown.

### M-030

**Episode age in queue.** Status: **Label only**

- **Labels:** "persisting {age} (N windows)"
- **Surfaces:**
  - /cpm: reason line (src/frontend-ob/src/components/Cpm/overview/priorityReason.ts:38-45)
- **Displayed definitions:**
  - Code comment: ""Critical loop · High severity · 21% in band · persisting 3 days (12 windows) · evidence score 100". Missing facts are left out, never shown as zero." (src/frontend-ob/src/components/Cpm/overview/priorityReason.ts:28-30)
- **Engine calculation:** Now − opened_at of the newest open frame of this window kind; window_count counts disjoint windows only (src/services/cplm-api/Data/FleetPrioritySql.cs:43-47; src/services/cplm-api/Services/EventFrameLifecycle.cs:198).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:310; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:243.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/hooks/useCpm.ts:194,203); API cache 15 s (src/services/cplm-api/Controllers/CpmFleetController.cs:42).
- **Eligibility:** Loop has an open frame.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: age words + windows. Computed: duration, count.
- **Thresholds:** none.
- **Staleness:** Priority queue: verdict window end within the window length (src/services/cplm-api/Data/FleetPrioritySql.cs:53; src/services/cplm-api/Data/FleetLatestSql.cs:227-238).
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** The word "persistence" also names the 2-of-3 agreement rule (M-074), a different quantity.

### M-031

**Shelved count.** Status: **Definition conflict**

- **Labels:** "N shelved", "Shelved"
- **Surfaces:**
  - /cpm: queue button (src/frontend-ob/src/components/Cpm/overview/PriorityQueue.tsx:43-46)
  - /cpm/events: tab count (src/frontend-ob/src/components/Cpm/CpmEvents.tsx:129-133)
- **Displayed definitions:**
  - Button title: "Shelved loops are left out of the queue; review them in Loop Events" (src/frontend-ob/src/components/Cpm/overview/PriorityQueue.tsx:44)
- **Engine calculation:** /cpm: current findings of this window kind with an active shelf (src/services/cplm-api/Data/FleetPrioritySql.cs:27-55,95-100). /cpm/events: every episode with an active shelf, any kind, any age (src/services/cplm-api/Data/EventPageSql.cs:39).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:248; prod_decision.md:117.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/hooks/useCpm.ts:194,203); API cache 15 s (src/services/cplm-api/Controllers/CpmFleetController.cs:42).
- **Eligibility:** Differs by surface.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: count. Computed: count.
- **Thresholds:** none.
- **Staleness:** Priority queue: verdict window end within the window length (src/services/cplm-api/Data/FleetPrioritySql.cs:53; src/services/cplm-api/Data/FleetLatestSql.cs:227-238).
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** Differs: the button opens the Shelved tab, whose count can be larger.

## Readiness

### M-032

**Valve position expected but not mapped.** Status: **Undocumented**

- **Labels:** "Valve position expected but not mapped", "loopsCappedByMissingVp", "N loop(s) have no VP signal"
- **Surfaces:**
  - /cpm: readiness strip (src/frontend-ob/src/components/Cpm/overview/ReadinessStrip.tsx:17,35)
  - /cpm/performance: guide (src/frontend-ob/src/components/Cpm/GateEvidencePanel.tsx:339)
- **Displayed definitions:**
  - Caption: "Valve position expected but not mapped" (src/frontend-ob/src/components/Cpm/overview/capabilityCopy.ts:11)
  - Sub: "map the VP tag so non-following evidence can confirm a valve fault (G14)" (src/frontend-ob/src/components/Cpm/overview/capabilityCopy.ts:13)
  - Guide: "{count} loop(s) have no VP signal, so a final-element fault on them can be suspected at most, never confirmed." (src/frontend-ob/src/components/Cpm/investigation/confirmationCopy.ts:24)
- **Engine calculation:** COUNT FILTER no vp tag and VP applicability EXPECTED, over all registered loops in scope, no monitoring filter (src/services/cplm-api/Controllers/CpmFleetController.cs:65-81).
- **Documented logic:** Not determined: not in KL or KA tables; prod_decision.md:112 describes applicability.
- **Window and boundary:** Registry. UI poll 60 s (src/frontend-ob/src/hooks/useCpm.ts:170).
- **Eligibility:** Registered, not only monitored.
- **Denominator:** stated: None. Computed: None.
- **Unit and scale:** displayed: count. Computed: count.
- **Thresholds:** none.
- **Staleness:** None.
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** Differs: counted over registered loops while the tiles above count monitored loops.

### M-033

**Peer links expected but missing.** Status: **Undocumented**

- **Labels:** "Peer links expected but missing", "loopsWithoutDisturbanceContext", "N have no peer links"
- **Surfaces:**
  - /cpm: readiness strip (src/frontend-ob/src/components/Cpm/overview/ReadinessStrip.tsx:18,35)
  - /cpm/performance: guide (src/frontend-ob/src/components/Cpm/GateEvidencePanel.tsx:340)
- **Displayed definitions:**
  - Caption: "Peer links expected but missing" (src/frontend-ob/src/components/Cpm/overview/capabilityCopy.ts:20)
  - Sub: "interaction analysis unavailable (G13) until peers are configured" (src/frontend-ob/src/components/Cpm/overview/capabilityCopy.ts:22)
- **Engine calculation:** COUNT FILTER no peer links configured and peer applicability EXPECTED (src/services/cplm-api/Controllers/CpmFleetController.cs:73-74).
- **Documented logic:** Not determined; prod_decision.md:112.
- **Window and boundary:** Registry. UI poll 60 s (src/frontend-ob/src/hooks/useCpm.ts:170).
- **Eligibility:** Registered loops.
- **Denominator:** stated: None. Computed: None.
- **Unit and scale:** displayed: count. Computed: count.
- **Thresholds:** none.
- **Staleness:** None.
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** Same value, undocumented; same population caveat as M-032.

### M-034

**Plant facts counts.** Status: **Undocumented**

- **Labels:** "N without positioner feedback installed", "N without a valve", "N without interacting loops", "Plant facts, nothing to fix"
- **Surfaces:**
  - /cpm: readiness strip (src/frontend-ob/src/components/Cpm/overview/ReadinessStrip.tsx:40)
- **Displayed definitions:**
  - Text: "Plant facts, nothing to fix: {n} without positioner feedback installed (valve cause suspected, not confirmed) · {n} without a valve (valve diagnosis does not apply) · {n} without interacting loops (G13 does not apply)." (src/frontend-ob/src/components/Cpm/overview/capabilityCopy.ts:28-35)
- **Engine calculation:** COUNT FILTER by applicability (src/services/cplm-api/Controllers/CpmFleetController.cs:71-72,75-76).
- **Documented logic:** Not determined; prod_decision.md:112.
- **Window and boundary:** Registry.
- **Eligibility:** Registered loops.
- **Denominator:** stated: None. Computed: None.
- **Unit and scale:** displayed: count. Computed: count.
- **Thresholds:** none.
- **Staleness:** None.
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** Single surface.

### M-035

**Diagnostic capability.** Status: **Engine-UI conflict**

- **Labels:** "Diagnostic capability", "x/y"
- **Surfaces:**
  - /cpm/performance: headline tile (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:237-240)
- **Displayed definitions:**
  - Sub: "{n} valve loop(s) with VP expected but not mapped — valve faults there need an approved test record to be confirmed" (src/frontend-ob/src/components/Cpm/overview/capabilityCopy.ts:46)
  - Sub: "{n} valve loop(s) without positioner feedback installed" (src/frontend-ob/src/components/Cpm/overview/capabilityCopy.ts:47)
  - Sub: "every valve loop can confirm a valve fault from non-following evidence" (src/frontend-ob/src/components/Cpm/overview/capabilityCopy.ts:47)
- **Engine calculation:** valves = registered − vpNotApplicable; withVp = valves − expectedUnmapped − vpNotInstalled (src/frontend-ob/src/components/Cpm/overview/capabilityCopy.ts:41-42). fleetTotal = loops.total, unmonitored included (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:153). G14 has no approved-test path (src/flink/src/main/java/com/ams/flink/cplm/fusion/Confirmation.java:42-74).
- **Documented logic:** Not determined: not in KL or KA.
- **Window and boundary:** Registry.
- **Eligibility:** Registered loops.
- **Denominator:** stated: y = valve loops. Computed: Registered, not monitored.
- **Unit and scale:** displayed: x/y. Computed: counts.
- **Thresholds:**
  - expectedUnmapped > 0. Source: hardcoded (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:238). Colour: amber, else grey.
- **Staleness:** None.
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** Conflicts: "approved test record" can confirm nothing in the engine (D-11). Population differs from the tiles beside it, which count assessed loops.

## Performance headline

### M-036

**Fleet good-error time.** Status: **Label only**

- **Labels:** "Good-error time"
- **Surfaces:**
  - /cpm/performance: headline tile (src/frontend-ob/src/components/Cpm/performanceHeadline.ts:28-34)
- **Displayed definitions:**
  - Tile title: "Mean share of the window with |PV − SP| inside the good band, over every assessed loop in this scope (median {x})" (src/frontend-ob/src/components/Cpm/performanceHeadline.ts:33-34)
  - Tile sub: "mean · {counted} of {assessed} assessed loop(s) · excluded: …" (src/frontend-ob/src/components/Cpm/performanceHeadline.ts:32)
- **Engine calculation:** 100 × mean(good_error_pct) over assessed loops with a value; median in title (src/services/cplm-api/Services/Kpi/FleetKpiPerformance.cs:16,33-34).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:295; kpi_calculation_logic/KPI-LOGIC.md:314.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34).
- **Eligibility:** Assessed; health filter not applied (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:225-232).
- **Denominator:** stated: N of M assessed loop(s). Computed: assessed with non-null good_error_pct.
- **Unit and scale:** displayed: % to 0.1. Computed: mean of fractions × 100.
- **Thresholds:**
  - none. Source: neutral tone by design (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:225). Colour: grey.
- **Staleness:** /cpm and /cpm/kpi: Fresh = (now − window_end) ≤ Cpm:Kpi:FreshSeconds, default 3600 s (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:30-31; src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:7). /cpm/performance: page banner only, newest window across loops older than 3 h reads "Stale" (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:57,167-169,265).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172).
- **Consistency:** Same caption as the per-loop M-080 card and a different quantity (mean across loops). Inherits sample-based share.

### M-037

**Median error as share of span.** Status: **Consistent**

- **Labels:** "Median error (% of span)", "MAE ÷ PV span"
- **Surfaces:**
  - /cpm/performance: headline tile (src/frontend-ob/src/components/Cpm/performanceHeadline.ts:37-43)
- **Displayed definitions:**
  - Tile title: "Mean absolute error of each loop divided by its registered PV range (pvMax − pvMin), median across loops. Loops in different engineering units are never averaged directly; a loop without a registered range is left out." (src/frontend-ob/src/components/Cpm/performanceHeadline.ts:42-43)
- **Engine calculation:** 100 × MAE / PvSpan per loop, then median (src/services/cplm-api/Services/Kpi/FleetKpiPerformance.cs:10-11,18,40).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:296; kpi_calculation_logic/KPI-LOGIC.md:314.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34).
- **Eligibility:** Assessed with MAE and a positive span.
- **Denominator:** stated: N of M assessed loop(s), exclusions named. Computed: Same.
- **Unit and scale:** displayed: % of span to 0.1. Computed: % of span.
- **Thresholds:** none.
- **Staleness:** /cpm and /cpm/kpi: Fresh = (now − window_end) ≤ Cpm:Kpi:FreshSeconds, default 3600 s (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:30-31; src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:7). /cpm/performance: page banner only, newest window across loops older than 3 h reads "Stale" (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:57,167-169,265).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172).
- **Consistency:** Same in code, UI and doc.

### M-038

**Loops with periodic diagnosis.** Status: **Consistent**

- **Labels:** "Loops with periodic diagnosis"
- **Surfaces:**
  - /cpm/performance: headline tile (src/frontend-ob/src/components/Cpm/performanceHeadline.ts:46-49)
- **Displayed definitions:**
  - Tile title: "Assessed loops whose current diagnosis is an oscillation or final-element family at any band" (src/frontend-ob/src/components/Cpm/performanceHeadline.ts:49)
  - Tile sub: "oscillation or valve nonlinearity, detected or stronger · …" (src/frontend-ob/src/components/Cpm/performanceHeadline.ts:48)
- **Engine calculation:** Assessed ∧ family ∈ {OSCILLATION, FINAL_ELEMENT_NONLINEARITY} (src/services/cplm-api/Services/Kpi/FleetKpiPerformance.cs:20).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:297.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34).
- **Eligibility:** Assessed.
- **Denominator:** stated: of M assessed. Computed: Same.
- **Unit and scale:** displayed: count. Computed: count.
- **Thresholds:**
  - value ≠ 0. Source: hardcoded string match on caption (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:231). Colour: amber.
- **Staleness:** /cpm and /cpm/kpi: Fresh = (now − window_end) ≤ Cpm:Kpi:FreshSeconds, default 3600 s (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:30-31; src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:7). /cpm/performance: page banner only, newest window across loops older than 3 h reads "Stale" (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:57,167-169,265).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172).
- **Consistency:** Same rule in UI and doc; a wider band than the /cpm tiles by statement, so the two pages do not reconcile.

## Performance page

### M-039

**Newest fused window age.** Status: **Undocumented**

- **Labels:** "Newest fused window emitted N ago", "Stale ·"
- **Surfaces:**
  - /cpm/performance: freshness line (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:263-266)
- **Displayed definitions:**
  - Code comment: "A fused window older than this is called out rather than shown as current." (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:56)
- **Engine calculation:** max(window_end) over served rows, age against the browser clock (src/frontend-ob/src/components/Cpm/gateStatus.ts:301-309; src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:167-169). The text says "emitted", the value is the window end, not created_at.
- **Documented logic:** Not determined: not in KL or KA.
- **Window and boundary:** Newest row per loop at the page window.
- **Eligibility:** Any row.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: min or h. Computed: ms.
- **Thresholds:**
  - 3 h. Source: hardcoded (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:57). Colour: class cpm-freshness--stale.
- **Staleness:** /cpm/performance: page banner only, newest window across loops older than 3 h reads "Stale" (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:57,167-169,265).
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** Differs from the 60-min KPI rule (D-05); one fresh loop clears the banner for a fleet of stale loops.

### M-040

**Gate matrix row filters.** Status: **Definition conflict**

- **Labels:** "Needs attention", "Evaluated", "Not evaluated", "All"
- **Surfaces:**
  - /cpm/performance: filter chips with counts (src/frontend-ob/src/components/Cpm/GateMatrix.tsx:91-92; src/frontend-ob/src/components/Cpm/gateStatus.ts:222-227)
- **Displayed definitions:**
  - Code comment: "Counts for the segmented filter. These are the honest denominators the page shows: a "Needs attention 3" chip beside "Not evaluated 51" is the single fastest way to see that most of the fleet has no verdict yet." (src/frontend-ob/src/components/Cpm/gateStatus.ts:263-267)
- **Engine calculation:** attention: any gate with reviewSeverity non-null; evaluated: diagnosis ≠ NOT_EVALUATED (src/frontend-ob/src/components/Cpm/gateStatus.ts:216-217,240-247,268-277). Rows are the newest LIVE row, of any diagnosis (src/services/cplm-api/Data/FleetLatestSql.cs:130-157).
- **Documented logic:** Not determined: not in KL or KA.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/hooks/useCpm.ts:194,203); API cache 15 s (src/services/cplm-api/Controllers/CpmFleetController.cs:42).
- **Eligibility:** Monitored loops, up to 2000 (src/frontend-ob/src/hooks/useCpm.ts:201).
- **Denominator:** stated: None. Computed: Rows loaded.
- **Unit and scale:** displayed: count. Computed: count.
- **Thresholds:** none.
- **Staleness:** /cpm/performance: page banner only, newest window across loops older than 3 h reads "Stale" (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:57,167-169,265).
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** Differs: "Evaluated" counts INSUFFICIENT_DATA rows, which /cpm calls Not assessable. reviewSeverity has no case for DETECTED or CLASSIFIED (src/frontend-ob/src/components/Cpm/gateStatus.ts:187-192), so since G15 names those bands (src/flink/src/main/java/com/ams/flink/cplm/fusion/DiagnosisBands.java:51,55) G15 alone no longer flags them.

### M-041

**Gate roll-up counts.** Status: **Definition conflict**

- **Labels:** "Loops held back, by gate", "N failed, M need attention", "No gate is holding back any loop in scope for this window."
- **Surfaces:**
  - /cpm/performance: bars per gate (src/frontend-ob/src/components/Cpm/GateRollup.tsx:42-76)
- **Displayed definitions:**
  - Bar aria-label: "{key} {name}: {bad} failed, {warn} need attention." (src/frontend-ob/src/components/Cpm/GateRollup.tsx:62)
  - Code comment: "Does this result hold the loop back — for the fleet filters and roll-up counts ("Needs attention", the bars per gate). Deliberately the pre-CHG-052 grouping so those numbers do not move with the new marks: a rejected window, a symptom, a failed check and a confirmed condition all count; "bad" = the old red set." (src/frontend-ob/src/components/Cpm/gateStatus.ts:183-186)
- **Engine calculation:** bad: FAIL, STRONG, EXCLUDED*, CONFIRMED. warn: WARN, REVIEW, SUSPECTED (src/frontend-ob/src/components/Cpm/gateStatus.ts:187-192,286-298).
- **Documented logic:** Not determined: not in KL or KA.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/hooks/useCpm.ts:194,203); API cache 15 s (src/services/cplm-api/Controllers/CpmFleetController.cs:42).
- **Eligibility:** Rows in scope.
- **Denominator:** stated: None. Computed: Bar height scaled to the tallest bar.
- **Unit and scale:** displayed: count. Computed: count.
- **Thresholds:** none.
- **Staleness:** /cpm/performance: page banner only, newest window across loops older than 3 h reads "Stale" (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:57,167-169,265).
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** Conflicts with the gate marks: "failed" here counts strong symptoms, exclusions and confirmed conditions, while the marks separate them deliberately (src/frontend-ob/src/components/Cpm/gateStatus.ts:57-63).

### M-042

**Attention ranking.** Status: **Definition conflict**

- **Labels:** "Opportunity ranking", "Loops needing attention", "By evidence score", "By control error", "#N", "N% in band"
- **Surfaces:**
  - /cpm/performance: ranked list (src/frontend-ob/src/components/Cpm/AttentionList.tsx:29-32,70-71,121)
- **Displayed definitions:**
  - Server doc comment: "A11 — bad-actor ranking. Ordered by confidence within a real diagnosis, so the loops most likely to reward an engineer's time come first." (src/services/cplm-api/Controllers/CpmFleetController.cs:133-136)
  - Evidence help: "Not a probability, and not a priority — the queue ranks by criticality, severity and persistence." (src/frontend-ob/src/components/Cpm/evidenceScore.ts:10-11)
- **Engine calculation:** Rows from LatestProbe: newest real verdict of any age, else newest row (src/services/cplm-api/Data/FleetLatestSql.cs:34-55,98-118). "error" order = good_error_pct ASC (src/services/cplm-api/Controllers/CpmFleetController.cs:175). No freshness filter.
- **Documented logic:** Not determined: not in KL or KA.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/hooks/useCpm.ts:194,203); API cache 15 s (src/services/cplm-api/Controllers/CpmFleetController.cs:42).
- **Eligibility:** Monitored; rows with diagnosis NOT_EVALUATED are dropped client side (src/frontend-ob/src/components/Cpm/AttentionList.tsx:63-64).
- **Denominator:** stated: None. Computed: 12 rows (src/frontend-ob/src/components/Cpm/useBadActors.ts:18).
- **Unit and scale:** displayed: rank; score or % in band. Computed: order.
- **Thresholds:** none.
- **Staleness:** No freshness rule: a verdict of any age can rank.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: no.
- **Consistency:** Conflicts: "Loops needing attention" is ordered by a score the help text calls "not a priority"; "control error" sorts good-error share; rows can be older than the matrix row of the same loop on the same page (docs/theme/cpa-currenttheme.md:1124).

### M-043

**Driving gates.** Status: **Definition conflict**

- **Labels:** "driven by", "no gate flagged", "Checks behind the result", "no other check moved this result"
- **Surfaces:**
  - /cpm/performance: attention row (src/frontend-ob/src/components/Cpm/AttentionList.tsx:133-153)
  - /cpm/performance: default checks view (src/frontend-ob/src/components/Cpm/GateMatrixChecks.tsx:53,91)
- **Displayed definitions:**
  - Code comment: "Which gates on this row are warn or fail — i.e. why the verdict is what it is." (src/frontend-ob/src/components/Cpm/gateStatus.ts:209)
  - Code comment: "the gates behind a row's current result — every gate whose mark says something (failed, attention, not usable, excluded, symptom, ruled out, band) plus G15, which gives the verdict." (src/frontend-ob/src/components/Cpm/gateStatus.ts:171-172)
- **Engine calculation:** drivingGates uses reviewSeverity; resultGates uses the mark meaning (src/frontend-ob/src/components/Cpm/gateStatus.ts:174-176,210-214). The attention row joins ranked rows to heatmap rows by loop id (src/frontend-ob/src/components/Cpm/AttentionList.tsx:57-61).
- **Documented logic:** Not determined: not in KL or KA.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/hooks/useCpm.ts:194,203); API cache 15 s (src/services/cplm-api/Controllers/CpmFleetController.cs:42).
- **Eligibility:** Rows in scope.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: gate keys. Computed: list.
- **Thresholds:** none.
- **Staleness:** /cpm/performance: page banner only, newest window across loops older than 3 h reads "Stale" (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:57,167-169,265).
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** Differs: two rules name "the gates behind the result". The attention row can pair a verdict with gates of a newer window.

## Gate

### M-044

**Gate result word and mark.** Status: **Label only**

- **Labels:** "OK", "OK on available data", "Attention", "Failed", "Not usable", "Excluded", "Not seen", "Not seen on available data", "Seen", "Strong", "Detected", "Classified", "Suspected", "Confirmed", "Ruled out", "Not evaluated", "N/A", "Pending", "Pass", "Warning", "Fail", "Strong evidence"
- **Surfaces:**
  - /cpm/performance and /cpm/explorer: marks (src/frontend-ob/src/components/Cpm/gateStatus.ts:64-88)
  - /cpm drawer, Explorer Calculations, Evidence verdict card, Explain: code words (src/frontend-ob/src/components/Cpm/overview/FocusedLoopDrawer.tsx:131; src/frontend-ob/src/components/Cpm/explorer/CalculationsTab.tsx:72; src/frontend-ob/src/components/Cpm/evidence/VerdictCard.tsx:29; src/frontend-ob/src/components/Cpm/evidence/ExplainPanel.tsx:77)
- **Displayed definitions:**
  - Code comment: "THE gate mark. One symbol per MEANING, never per colour" (src/frontend-ob/src/components/Cpm/gateStatus.ts:57)
  - Legend: "check OK; OK on available data (an input missing); check needs attention; check failed; window not usable; excluded on purpose (mode / region); symptom not seen; symptom seen; strong symptom; detected / classified / suspected; confirmed; ruled out; not evaluated; not applicable; pending" (src/frontend-ob/src/components/Cpm/gateStatus.ts:145-151)
- **Engine calculation:** Meaning derived from status and gate tier (src/frontend-ob/src/components/Cpm/gateStatus.ts:95-116); vocabulary words derived from the status alone (src/frontend-ob/src/components/Cpm/vocabulary.ts:30-31).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:90; prod_decision.md:122.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26).
- **Eligibility:** Any gate cell.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: mark, word, tone. Computed: status enum.
- **Thresholds:**
  - Tone per meaning. Source: hardcoded (src/frontend-ob/src/components/Cpm/gateStatus.ts:64-88). Colour: ok green; attention, seen, strong, detected, classified, suspected amber; failed, confirmed red; ruled out green; rest grey.
- **Staleness:** /cpm/explorer summary: window end older than the window size adds "ended … ago" (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:110-115; src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:87,110). /cpm/performance: page banner only, newest window across loops older than 3 h reads "Stale" (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:57,167-169,265).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown in Explain and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/ExplainPanel.tsx:98; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111).
- **Consistency:** Two vocabularies for one status: a diagnostic WARN reads "Seen" on the matrix and "Warning" in the drawer; PASS reads "Not seen" and "Pass".

### M-045

**G0 data quality.** Status: **Consistent**

- **Labels:** "G0", "Data quality", "DATA_QUALITY", "Data qualification"
- **Surfaces:**
  - /cpm/performance: chip and matrix cell (src/frontend-ob/src/components/Cpm/GateMatrixChecks.tsx:75-88)
  - /cpm/explorer: gate strip (src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateStrip.tsx:76-84)
  - /cpm: drawer row (src/frontend-ob/src/components/Cpm/overview/FocusedLoopDrawer.tsx:127-133)
  - /cpm/evidence: chip and verdict card (src/frontend-ob/src/components/Cpm/evidence/VerdictCard.tsx:29)
  - /cpm/replay: result row (src/frontend-ob/src/components/Cpm/CpmReplay.tsx:292-294)
- **Displayed definitions:**
  - GATE_NAMES: "Data quality" (src/frontend-ob/src/components/Cpm/gateStatus.ts:160)
  - GateCatalog: "Completeness, per-role quality (UNKNOWN is never GOOD), duplicate timestamps and gaps over the window; a FAIL blocks every other gate." (src/services/cplm-api/Services/GateCatalog.cs:28)
  - Calculations contract: "Is the sample stream complete and trustworthy?" (src/services/cplm-api/Controllers/CpmEventsController.cs:138)
- **Engine calculation:** FAIL if bad_quality_pct ≥ 0.50; PASS if completeness ≥ 0.98 ∧ bad < 0.05 ∧ no duplicate; WARN if completeness ≥ 0.95; else FAIL (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:122-136). FAIL or n < 10 declines the window (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:150-158).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:94; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:553 (0.98 and 0.50 fixed in code).
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26).
- **Eligibility:** Any window with samples.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: mark, word, tone. Computed: status enum.
- **Thresholds:**
  - 0.98, 0.05. Source: profile defaults (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:84-86); 0.98 has no bundle property (src/flink/src/main/java/com/ams/flink/cplm/config/BundleProfileMapper.java:41-42). Colour: PASS green.
  - 0.95. Source: profile G0.coverage_min (src/flink/src/main/java/com/ams/flink/cplm/config/BundleProfileMapper.java:41). Colour: WARN amber below 0.98.
  - 0.50. Source: hardcoded (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:122,140). Colour: FAIL grey "Not usable" (src/frontend-ob/src/components/Cpm/gateStatus.ts:114).
- **Staleness:** /cpm/explorer summary: window end older than the window size adds "ended … ago" (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:110-115; src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:87,110). /cpm/performance: page banner only, newest window across loops older than 3 h reads "Stale" (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:57,167-169,265).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown in Explain and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/ExplainPanel.tsx:98; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111).
- **Consistency:** Same rule in doc and engine. G0 FAIL has an eligibility mark, grey; the roll-up counts it as "failed" (M-041).

### M-046

**G1 mode and service.** Status: **Definition conflict**

- **Labels:** "G1", "Mode / service", "MODE_AUTHORITY", "Mode authority"
- **Surfaces:**
  - /cpm/performance: chip and matrix cell (src/frontend-ob/src/components/Cpm/GateMatrixChecks.tsx:75-88)
  - /cpm/explorer: gate strip (src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateStrip.tsx:76-84)
  - /cpm: drawer row (src/frontend-ob/src/components/Cpm/overview/FocusedLoopDrawer.tsx:127-133)
  - /cpm/evidence: chip and verdict card (src/frontend-ob/src/components/Cpm/evidence/VerdictCard.tsx:29)
  - /cpm/replay: result row (src/frontend-ob/src/components/Cpm/CpmReplay.tsx:292-294)
- **Displayed definitions:**
  - GATE_NAMES: "Mode / service" (src/frontend-ob/src/components/Cpm/gateStatus.ts:160)
  - GateCatalog: "Time in automatic control and the controlling authority; manual invalidates closed-loop metrics, not actuator observations." (src/services/cplm-api/Services/GateCatalog.cs:32)
  - Calculations contract: "Was the loop in automatic long enough to judge?" (src/services/cplm-api/Controllers/CpmEventsController.cs:139)
- **Engine calculation:** PASS ≥ 0.90, WARN ≥ 0.70, else EXCLUDED on auto_pct (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:197-203). EXCLUDED blocks fusion as EXCLUDED_MODE (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:134-136).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:95.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26).
- **Eligibility:** G0 not failed, n ≥ 10.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: mark, word, tone. Computed: status enum.
- **Thresholds:**
  - 0.90. Source: profile field, no bundle property (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:88; src/flink/src/main/java/com/ams/flink/cplm/config/BundleProfileMapper.java:43; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:553). Colour: PASS green.
  - 0.70. Source: profile G1.auto_fraction_min (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:87). Colour: WARN amber; below it EXCLUDED grey (src/frontend-ob/src/components/Cpm/gateStatus.ts:72).
- **Staleness:** /cpm/explorer summary: window end older than the window size adds "ended … ago" (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:110-115; src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:87,110). /cpm/performance: page banner only, newest window across loops older than 3 h reads "Stale" (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:57,167-169,265).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown in Explain and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/ExplainPanel.tsx:98; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111).
- **Consistency:** Three limits for one share: card 0.95, gate pass 0.90, exclusion 0.70 (D-04, D-13).

### M-047

**G2 setpoint activity.** Status: **Engine-UI conflict**

- **Labels:** "G2", "Setpoint activity", "SP activity", "Setpoint stability band", "SP stability"
- **Surfaces:**
  - /cpm/performance: chip and matrix cell (src/frontend-ob/src/components/Cpm/GateMatrixChecks.tsx:75-88)
  - /cpm/explorer: gate strip (src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateStrip.tsx:76-84)
  - /cpm: drawer row (src/frontend-ob/src/components/Cpm/overview/FocusedLoopDrawer.tsx:127-133)
  - /cpm/evidence: chip and verdict card (src/frontend-ob/src/components/Cpm/evidence/VerdictCard.tsx:29)
  - /cpm/replay: result row (src/frontend-ob/src/components/Cpm/CpmReplay.tsx:292-294)
- **Displayed definitions:**
  - GATE_NAMES: "Setpoint activity" (src/frontend-ob/src/components/Cpm/gateStatus.ts:160)
  - GateCatalog: "Set-point stability against a declared EU band or a fraction of the declared span; SP changes are events, never noise." (src/services/cplm-api/Services/GateCatalog.cs:36)
  - GateCatalog preconditions: "SP role; a stability band (EU objective or declared span) - otherwise NOT_EVALUATED, not PASS." (src/services/cplm-api/Services/GateCatalog.cs:37)
  - Calculations contract: "Did the setpoint move enough to confound the analysis?" (src/services/cplm-api/Controllers/CpmEventsController.cs:140)
- **Engine calculation:** PASS if sp_range < band, else WARN; band always resolves, LEGACY_DEFAULT when no span is declared (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:211-213; src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:188-200).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:96.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26).
- **Eligibility:** G0 not failed, n ≥ 10.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: mark, word, tone. Computed: status enum.
- **Thresholds:**
  - 0.01 of span, 0.05 averaging. Source: profile (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:150; src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfilePacks.java:90). Colour: PASS green, WARN amber.
- **Staleness:** /cpm/explorer summary: window end older than the window size adds "ended … ago" (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:110-115; src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:87,110). /cpm/performance: page banner only, newest window across loops older than 3 h reads "Stale" (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:57,167-169,265).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown in Explain and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/ExplainPanel.tsx:98; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111).
- **Consistency:** Conflicts: the catalogue says NOT_EVALUATED without a declared band; the engine uses a default band and passes or warns. Fusion does not read G2; the panel says it contributes evidence (src/frontend-ob/src/components/Cpm/GateEvidencePanel.tsx:147).

### M-048

**G2r operating region.** Status: **Label only**

- **Labels:** "G2r", "Operating region", "OPERATING_REGION", "domain_mask", "N of M out of region"
- **Surfaces:**
  - /cpm/performance: chip and matrix cell (src/frontend-ob/src/components/Cpm/GateMatrixChecks.tsx:75-88)
  - /cpm/explorer: gate strip (src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateStrip.tsx:76-84)
  - /cpm: drawer row (src/frontend-ob/src/components/Cpm/overview/FocusedLoopDrawer.tsx:127-133)
  - /cpm/evidence: chip and verdict card (src/frontend-ob/src/components/Cpm/evidence/VerdictCard.tsx:29)
  - /cpm/replay: result row (src/frontend-ob/src/components/Cpm/CpmReplay.tsx:292-294)
- **Displayed definitions:**
  - GateCatalog: "Fraction of the window inside the declared PV / input operating region; out-of-domain is not a healthy process." (src/services/cplm-api/Services/GateCatalog.cs:40)
  - Calculations contract: "Was the loop inside its valid operating band?" (src/services/cplm-api/Controllers/CpmEventsController.cs:141)
- **Engine calculation:** Out-of-band share of samples: PASS ≤ 0.05, WARN ≤ 0.20, else FAIL (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:223-233). FAIL blocks as EXCLUDED_OPERATING_REGION (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:137-139).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:97; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:553.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26).
- **Eligibility:** G0 not failed, n ≥ 10.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: mark, word, tone. Computed: status enum.
- **Thresholds:**
  - 0.05, 0.20. Source: hardcoded (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:224,227). Colour: PASS green, WARN amber, FAIL grey.
- **Staleness:** /cpm/explorer summary: window end older than the window size adds "ended … ago" (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:110-115; src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:87,110). /cpm/performance: page banner only, newest window across loops older than 3 h reads "Stale" (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:57,167-169,265).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown in Explain and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/ExplainPanel.tsx:98; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111).
- **Consistency:** Catalogue says "inside", engine stores the share outside; same fact.

### M-049

**G3 base performance.** Status: **Engine-UI conflict**

- **Labels:** "G3", "Base performance", "Error against the objective", "OBJECTIVE_ERROR", "Control error vs objective"
- **Surfaces:**
  - /cpm/performance: chip and matrix cell (src/frontend-ob/src/components/Cpm/GateMatrixChecks.tsx:75-88)
  - /cpm/explorer: gate strip (src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateStrip.tsx:76-84)
  - /cpm: drawer row (src/frontend-ob/src/components/Cpm/overview/FocusedLoopDrawer.tsx:127-133)
  - /cpm/evidence: chip and verdict card (src/frontend-ob/src/components/Cpm/evidence/VerdictCard.tsx:29)
  - /cpm/replay: result row (src/frontend-ob/src/components/Cpm/CpmReplay.tsx:292-294)
- **Displayed definitions:**
  - GATE_NAMES: "Base performance" (src/frontend-ob/src/components/Cpm/gateStatus.ts:160)
  - GateCatalog: "Error against the objective: MAE, RMSE, IAE / ISE / ITAE over held intervals, fraction of time inside the tolerance band." (src/services/cplm-api/Services/GateCatalog.cs:44)
  - Calculations contract: "How large is the control error?" (src/services/cplm-api/Controllers/CpmEventsController.cs:142)
  - Evidence view: "no objective means performance without a health pass" (src/frontend-ob/src/components/Cpm/evidence/views/ShortViews.tsx:137)
- **Engine calculation:** PASS if good_error_pct ≥ goodErrorPctPassMin, else WARN; MAE and the integrals do not enter the status (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:281). Objective id is the constant PROFILE_GOOD_ERROR_BAND (src/flink/src/main/java/com/ams/flink/cplm/evidence/ShortArtifacts.java:236).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:98.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26).
- **Eligibility:** G0 not failed, n ≥ 10.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: mark, word, tone. Computed: status enum.
- **Thresholds:**
  - 0.50, 0.30 averaging. Source: profile G3.objective_compliance_min (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:154; src/flink/src/main/java/com/ams/flink/cplm/config/BundleProfileMapper.java:54). Colour: PASS green, WARN amber.
- **Staleness:** /cpm/explorer summary: window end older than the window size adds "ended … ago" (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:110-115; src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:87,110). /cpm/performance: page banner only, newest window across loops older than 3 h reads "Stale" (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:57,167-169,265).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown in Explain and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/ExplainPanel.tsx:98; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111).
- **Consistency:** Conflicts: "How large is the control error?" and the card text "judged by G3" on MAE (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:141); G3 reads only the good-error share. No FAIL branch exists; the classifier handles WARN or FAIL (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:81).

### M-050

**G4 actuator effort.** Status: **Engine-UI conflict**

- **Labels:** "G4", "Actuator effort", "Control effort", "Control activity", "ACTUATOR_ACTIVITY", "controller effort"
- **Surfaces:**
  - /cpm/performance: chip and matrix cell (src/frontend-ob/src/components/Cpm/GateMatrixChecks.tsx:75-88)
  - /cpm/explorer: gate strip (src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateStrip.tsx:76-84)
  - /cpm: drawer row (src/frontend-ob/src/components/Cpm/overview/FocusedLoopDrawer.tsx:127-133)
  - /cpm/evidence: chip and verdict card (src/frontend-ob/src/components/Cpm/evidence/VerdictCard.tsx:29)
  - /cpm/replay: result row (src/frontend-ob/src/components/Cpm/CpmReplay.tsx:292-294)
- **Displayed definitions:**
  - GATE_NAMES: "Actuator effort" (src/frontend-ob/src/components/Cpm/gateStatus.ts:161)
  - Window panel: "Control effort" (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:25)
  - GateCatalog: "Control activity: applied-input variation, reversals, dimensionless activity where both spans are declared. OP travel is not valve travel." (src/services/cplm-api/Services/GateCatalog.cs:48)
  - GateCatalog preconditions: "Applied input (VP when mapped and fresh, else OP); PV span for the dimensionless ratio." (src/services/cplm-api/Services/GateCatalog.cs:49)
  - Calculations contract: "How hard is the actuator working for that error?" (src/services/cplm-api/Controllers/CpmEventsController.cs:143)
- **Engine calculation:** activity = (σOP/100)/(σPV/declared span) when the span is declared, else σOP/σPV; > high STRONG, > warn WARN, else PASS (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:320-348). Computed on OP (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:183,285). Travel and reversals do not enter.
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:99 lists travel/day and reversals/h as inputs.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26).
- **Eligibility:** G0 not failed, n ≥ 10.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: mark, word, tone. Computed: status enum.
- **Thresholds:**
  - warn 3, high 8. Source: profile (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:156-157). Colour: matrix: WARN Attention amber, STRONG amber; loop cards: STRONG grey (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:44-45,115).
- **Staleness:** /cpm/explorer summary: window end older than the window size adds "ended … ago" (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:110-115; src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:87,110). /cpm/performance: page banner only, newest window across loops older than 3 h reads "Stale" (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:57,167-169,265).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown in Explain and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/ExplainPanel.tsx:98; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111).
- **Consistency:** Conflicts: OP travel and reversals cards say "judged by G4"; the local tone map on loop cards has no STRONG case, so the strongest status renders grey (D-07, D-08). Catalogue says VP when mapped; the ratio uses OP.

### M-051

**G5 oscillation ACF.** Status: **Definition conflict**

- **Labels:** "G5", "Oscillation (ACF)", "Autocorrelation (oscillation)", "ACF_OSCILLATION"
- **Surfaces:**
  - /cpm/performance: chip and matrix cell (src/frontend-ob/src/components/Cpm/GateMatrixChecks.tsx:75-88)
  - /cpm/explorer: gate strip (src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateStrip.tsx:76-84)
  - /cpm: drawer row (src/frontend-ob/src/components/Cpm/overview/FocusedLoopDrawer.tsx:127-133)
  - /cpm/evidence: chip and verdict card (src/frontend-ob/src/components/Cpm/evidence/VerdictCard.tsx:29)
  - /cpm/replay: result row (src/frontend-ob/src/components/Cpm/CpmReplay.tsx:292-294)
- **Displayed definitions:**
  - GateCatalog: "Dominant period and regularity from the autocorrelation of the detrended shape signal; too few cycles or inadequate sampling reject the estimate." (src/services/cplm-api/Services/GateCatalog.cs:52)
  - GateCatalog preconditions: "Enough cycles of the candidate period inside the window (>= 3) at >= 8 samples per period." (src/services/cplm-api/Services/GateCatalog.cs:53)
  - Calculations contract: "Is there a regular oscillation, and at what period?" (src/services/cplm-api/Controllers/CpmEventsController.cs:144)
- **Engine calculation:** WARN when any ACF period > 0, else PASS (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:137). Band, regularity and cycle checks act on validity, not on this status (src/flink/src/main/java/com/ams/flink/cplm/engine/OscillationMath.java:265-270).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:100; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:551.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26).
- **Eligibility:** n ≥ 10 in the long tier (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:77-80).
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: mark, word, tone. Computed: status enum.
- **Thresholds:**
  - period > 0. Source: hardcoded (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:137). Colour: WARN "Seen" amber; PASS "Not seen" grey (src/frontend-ob/src/components/Cpm/gateStatus.ts:73,75).
- **Staleness:** /cpm/explorer summary: window end older than the window size adds "ended … ago" (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:110-115; src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:87,110). /cpm/performance: page banner only, newest window across loops older than 3 h reads "Stale" (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:57,167-169,265).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown in Explain and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/ExplainPanel.tsx:98; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111).
- **Consistency:** Differs: the catalogue says the estimate is rejected; the status still reads "Seen". "Measured vs required" shows ✓/✕ rows that did not set this status (src/frontend-ob/src/components/Cpm/evidence/whyRules.ts:78-89). Known limitation kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:551. Cycle floor text says ≥ 3; class floors are 3 or 5 (kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:323).

### M-052

**G6 spectrum.** Status: **Engine-UI conflict**

- **Labels:** "G6", "Spectral (FFT)", "Spectral (PSD)", "Spectrum (FFT)", "FFT_SPECTRAL", "Spectrum"
- **Surfaces:**
  - /cpm/performance: chip and matrix cell (src/frontend-ob/src/components/Cpm/GateMatrixChecks.tsx:75-88)
  - /cpm/explorer: gate strip (src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateStrip.tsx:76-84)
  - /cpm: drawer row (src/frontend-ob/src/components/Cpm/overview/FocusedLoopDrawer.tsx:127-133)
  - /cpm/evidence: chip and verdict card (src/frontend-ob/src/components/Cpm/evidence/VerdictCard.tsx:29)
  - /cpm/replay: result row (src/frontend-ob/src/components/Cpm/CpmReplay.tsx:292-294)
- **Displayed definitions:**
  - GATE_NAMES: "Spectral (FFT)" (src/frontend-ob/src/components/Cpm/gateStatus.ts:161)
  - GateCatalog: "Welch power spectral density (Hann, declared overlap, segment spanning the declared band) with peak, harmonic and entropy scalars derived from it." (src/services/cplm-api/Services/GateCatalog.cs:56)
  - Calculations contract: "Does the spectrum show a dominant peak and harmonics?" (src/services/cplm-api/Controllers/CpmEventsController.cs:145)
- **Engine calculation:** WARN when fft_peak_ratio > 0.5, else PASS (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:157). Peak ratio = peak-lobe energy ÷ band energy (src/flink/src/main/java/com/ams/flink/cplm/engine/OscillationMath.java:190).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:101; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:553.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26).
- **Eligibility:** n ≥ 10 in the long tier.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: mark, word, tone. Computed: status enum.
- **Thresholds:**
  - 0.5. Source: hardcoded (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:157). Colour: WARN "Seen" amber.
- **Staleness:** /cpm/explorer summary: window end older than the window size adds "ended … ago" (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:110-115; src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:87,110). /cpm/performance: page banner only, newest window across loops older than 3 h reads "Stale" (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:57,167-169,265).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown in Explain and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/ExplainPanel.tsx:98; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111).
- **Consistency:** Conflicts: Explain shows "Spectral peak vs background ≥ G6.peak_to_background_min required" (src/frontend-ob/src/components/Cpm/evidence/whyRules.ts:92-94), which is the period-validity test (src/flink/src/main/java/com/ams/flink/cplm/engine/OscillationMath.java:276-278), not the rule that set G6. Names FFT and PSD both in use.

### M-053

**G7 shape.** Status: **Engine-UI conflict**

- **Labels:** "G7", "Stiction shape", "Sine vs triangle shape", "Per-cycle sine versus triangle fits", "Triangular OP waveform"
- **Surfaces:**
  - /cpm/performance: chip and matrix cell (src/frontend-ob/src/components/Cpm/GateMatrixChecks.tsx:75-88)
  - /cpm/explorer: gate strip (src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateStrip.tsx:76-84)
  - /cpm: drawer row (src/frontend-ob/src/components/Cpm/overview/FocusedLoopDrawer.tsx:127-133)
  - /cpm/evidence: chip and verdict card (src/frontend-ob/src/components/Cpm/evidence/VerdictCard.tsx:29)
  - /cpm/replay: result row (src/frontend-ob/src/components/Cpm/CpmReplay.tsx:292-294)
- **Displayed definitions:**
  - GateCatalog: "Per-cycle sine versus triangle fits of the shape signal; rejected cycles are kept with their reason." (src/services/cplm-api/Services/GateCatalog.cs:60)
  - Calculations contract: "Is the OP trace triangular, as stiction produces?" (src/services/cplm-api/Controllers/CpmEventsController.cs:146)
- **Engine calculation:** NOT_EVALUATED without a valid period; STRONG if triangularity > shape_score_high, else PASS (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:187-191). Shape signal is PV on integrating classes, OP otherwise (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:110).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:102.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26).
- **Eligibility:** Valid period and complete cycles.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: mark, word, tone. Computed: status enum.
- **Thresholds:**
  - 0.8. Source: profile G7.shape_score_high (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:89). Colour: STRONG amber.
  - G7.shape_score_warn. Source: property marked NOT_COMPUTED_IN_BUILD (src/flink/src/main/resources/cplm/gate-config/unsupported-in-build.json:54). Colour: shown as an attention level (src/frontend-ob/src/components/Cpm/evidence/whyRules.ts:100).
- **Staleness:** /cpm/explorer summary: window end older than the window size adds "ended … ago" (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:110-115; src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:87,110). /cpm/performance: page banner only, newest window across loops older than 3 h reads "Stale" (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:57,167-169,265).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown in Explain and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/ExplainPanel.tsx:98; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111).
- **Consistency:** Conflicts: "OP trace" is false on LIC and PIC gas, where the signal is PV. Explain reads G7.shape_score_warn as an attention level; the build computes none. Whether a value is ever served: not determined.

### M-054

**G8 lag asymmetry.** Status: **Definition conflict**

- **Labels:** "G8", "Horch oddness", "Lag asymmetry", "Cross-correlation asymmetry", "G8 Horch asymmetry", "XCORR_ASYMMETRY_V1"
- **Surfaces:**
  - /cpm/performance: chip and matrix cell (src/frontend-ob/src/components/Cpm/GateMatrixChecks.tsx:75-88)
  - /cpm/explorer: gate strip (src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateStrip.tsx:76-84)
  - /cpm: drawer row (src/frontend-ob/src/components/Cpm/overview/FocusedLoopDrawer.tsx:127-133)
  - /cpm/evidence: chip and verdict card (src/frontend-ob/src/components/Cpm/evidence/VerdictCard.tsx:29)
  - /cpm/replay: result row (src/frontend-ob/src/components/Cpm/CpmReplay.tsx:292-294)
- **Displayed definitions:**
  - GATE_NAMES: "Horch oddness" (src/frontend-ob/src/components/Cpm/gateStatus.ts:161)
  - GateCatalog: "Cross-correlation non-reciprocity between the applied input and PV over positive and negative lags (XCORR_ASYMMETRY_V1). It is a lag asymmetry index, not an odd-harmonic spectrum, and never decisive on its own; bicoherence is not installed." (src/services/cplm-api/Services/GateCatalog.cs:64)
  - Calculations contract: "Does the cross-correlation show the odd symmetry of stiction?" (src/services/cplm-api/Controllers/CpmEventsController.cs:147)
- **Engine calculation:** STRONG if oddness > 0.7, else PASS (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:193-198). Fusion: asymmetry alone never qualifies stiction (src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionEvidence.java:118-128).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:103.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26).
- **Eligibility:** n ≥ 10 in the long tier.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: mark, word, tone. Computed: status enum.
- **Thresholds:**
  - 0.7. Source: profile G8.asymmetry_display_threshold (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:90). Colour: STRONG amber.
- **Staleness:** /cpm/explorer summary: window end older than the window size adds "ended … ago" (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:110-115; src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:87,110). /cpm/performance: page banner only, newest window across loops older than 3 h reads "Stale" (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:57,167-169,265).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown in Explain and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/ExplainPanel.tsx:98; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111).
- **Consistency:** One gate, two served names from two API catalogues; the contract question calls it the signature of stiction, the catalogue says never decisive.

### M-055

**G9 phase geometry.** Status: **Definition conflict**

- **Labels:** "G9", "Phase geometry", "Phase-portrait geometry", "Cycle geometry", "PHASE_GEOMETRY"
- **Surfaces:**
  - /cpm/performance: chip and matrix cell (src/frontend-ob/src/components/Cpm/GateMatrixChecks.tsx:75-88)
  - /cpm/explorer: gate strip (src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateStrip.tsx:76-84)
  - /cpm: drawer row (src/frontend-ob/src/components/Cpm/overview/FocusedLoopDrawer.tsx:127-133)
  - /cpm/evidence: chip and verdict card (src/frontend-ob/src/components/Cpm/evidence/VerdictCard.tsx:29)
  - /cpm/replay: result row (src/frontend-ob/src/components/Cpm/CpmReplay.tsx:292-294)
- **Displayed definitions:**
  - GateCatalog: "PV versus applied-input cycle polygons: area, bounding box, corners and turning angles on the points actually scored; supporting under the correct policy." (src/services/cplm-api/Services/GateCatalog.cs:68)
  - Calculations contract: "Does the PV-OP phase plot show sharp corners?" (src/services/cplm-api/Controllers/CpmEventsController.cs:148)
  - Registry note: "G9 geometry is supporting-only. It cannot create a stiction suspect without qualified independent evidence." (src/frontend-ob/src/components/Cpm/ProfileAside.tsx:123-124)
- **Engine calculation:** NOT_EVALUATED without valid period, cycles, floors, or above band; PASS below band; STRONG if area > 0.30 (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:319-348). The status reads area, the question reads corners. Role is PRIMARY on PIC vapour and TIC (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfilePacks.java:114-117,126-129).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:104; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:328 (role by class).
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26).
- **Eligibility:** Valid period, minimum cycles, area in band, effort and OP range floors.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: mark, word, tone. Computed: status enum.
- **Thresholds:**
  - 0.30. Source: hardcoded (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:22,346). Colour: STRONG amber.
  - area band, floors. Source: profile class pack. Colour: NOT_EVALUATED grey.
- **Staleness:** /cpm/explorer summary: window end older than the window size adds "ended … ago" (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:110-115; src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:87,110). /cpm/performance: page banner only, newest window across loops older than 3 h reads "Stale" (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:57,167-169,265).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown in Explain and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/ExplainPanel.tsx:98; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111).
- **Consistency:** Conflicts: the registry note says supporting-only for every loop; on PIC vapour and TIC the role is PRIMARY. The contract question names corners; STRONG is decided on area.

### M-056

**G10 actuator limits.** Status: **Definition conflict**

- **Labels:** "G10", "Valve / saturation", "Actuator limits", "SATURATION", "Time at a limit", "LIMIT_DWELL", "G10 limit dwell"
- **Surfaces:**
  - /cpm/performance: chip and matrix cell (src/frontend-ob/src/components/Cpm/GateMatrixChecks.tsx:75-88)
  - /cpm/explorer: gate strip (src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateStrip.tsx:76-84)
  - /cpm: drawer row (src/frontend-ob/src/components/Cpm/overview/FocusedLoopDrawer.tsx:127-133)
  - /cpm/evidence: chip and verdict card (src/frontend-ob/src/components/Cpm/evidence/VerdictCard.tsx:29)
  - /cpm/replay: result row (src/frontend-ob/src/components/Cpm/CpmReplay.tsx:292-294)
- **Displayed definitions:**
  - GATE_NAMES: "Valve / saturation" (src/frontend-ob/src/components/Cpm/gateStatus.ts:162)
  - GateCatalog: "Time at the actual applied limits from the engineering range (fallback 0-100 flagged), dwell episodes in seconds, VP tracking error where VP is mapped; VP presence is not confirmation." (src/services/cplm-api/Services/GateCatalog.cs:72)
  - Calculations contract: "Is the actuator saturated or cycling at a limit?" (src/services/cplm-api/Controllers/CpmEventsController.cs:149)
- **Engine calculation:** WARN if occupancy ≥ satWarnOccupancy or longest dwell ≥ warn or cycling pattern, else PASS (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:221-244). An open fast limit condition raises it to WARN (src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionInputs.java:151-155).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:105.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26).
- **Eligibility:** n ≥ 10 in the long tier.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: mark, word, tone. Computed: status enum.
- **Thresholds:**
  - occupancy 0.05. Source: profile G10.occupancy_warn_fraction (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:203). Colour: WARN "Seen" amber.
  - dwell 30 samples × Ts unless set. Source: profile (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:176,204; src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:237). Colour: WARN.
- **Staleness:** /cpm/explorer summary: window end older than the window size adds "ended … ago" (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:110-115; src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:87,110). /cpm/performance: page banner only, newest window across loops older than 3 h reads "Stale" (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:57,167-169,265).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown in Explain and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/ExplainPanel.tsx:98; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111).
- **Consistency:** Differs: G10 warns at 0.05 while the fleet KPI and card use 0.10. G10.limit_tolerance_pp moves G10 only; displayed saturation_pct uses satLowPct/satHighPct (D-10). PASS reads "Not seen" although this is a limit check.

### M-057

**G11 measurement health.** Status: **Definition conflict**

- **Labels:** "G11", "Sensor health", "Measurement health", "Sensor freeze", "G11 sensor freeze", "SENSOR_FREEZE"
- **Surfaces:**
  - /cpm/performance: chip and matrix cell (src/frontend-ob/src/components/Cpm/GateMatrixChecks.tsx:75-88)
  - /cpm/explorer: gate strip (src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateStrip.tsx:76-84)
  - /cpm: drawer row (src/frontend-ob/src/components/Cpm/overview/FocusedLoopDrawer.tsx:127-133)
  - /cpm/evidence: chip and verdict card (src/frontend-ob/src/components/Cpm/evidence/VerdictCard.tsx:29)
  - /cpm/replay: result row (src/frontend-ob/src/components/Cpm/CpmReplay.tsx:292-294)
- **Displayed definitions:**
  - GATE_NAMES: "Sensor health" (src/frontend-ob/src/components/Cpm/gateStatus.ts:162)
  - GateCatalog: "PV freeze episodes, spikes and quantisation, with the transmitter's NE107 lanes (F/C/S/M) and eligibility intervals per role; absence of health is NOT_CONFIGURED, never OK." (src/services/cplm-api/Services/GateCatalog.cs:76)
  - Calculations contract: "Is the measurement frozen, quantised or drifting?" (src/services/cplm-api/Controllers/CpmEventsController.cs:150)
- **Engine calculation:** WARN on material freeze (≥ 60 s and ≥ 10 %) or any freeze episode, else PASS (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:262,270-278). Material freeze blocks as EXCLUDED_SENSOR (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:147-149). Spikes, quantisation and health lanes do not set the status.
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:106; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:553.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26).
- **Eligibility:** n ≥ 10 in the long tier.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: mark, word, tone. Computed: status enum.
- **Thresholds:**
  - 60 s, 10 %. Source: hardcoded (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:262). Colour: WARN "Seen" amber.
  - freeze dwell 60 s. Source: profile (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:180). Colour: WARN.
- **Staleness:** /cpm/explorer summary: window end older than the window size adds "ended … ago" (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:110-115; src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:87,110). /cpm/performance: page banner only, newest window across loops older than 3 h reads "Stale" (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:57,167-169,265).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown in Explain and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/ExplainPanel.tsx:98; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111).
- **Consistency:** API role BLOCKING (src/services/cplm-api/Services/GateCatalog.cs:75) and panel text "A failure here excludes the whole window" (src/frontend-ob/src/components/Cpm/GateEvidencePanel.tsx:144), while the matrix tier is Diagnostic evidence (src/frontend-ob/src/components/Cpm/gateStatus.ts:17) and the status never fails.

### M-058

**G12 on the fused row.** Status: **Definition conflict**

- **Labels:** "G12", "Step-test evidence", "System response", "Step test"
- **Surfaces:**
  - /cpm/performance: chip and matrix cell (src/frontend-ob/src/components/Cpm/GateMatrixChecks.tsx:75-88)
  - /cpm/explorer: gate strip (src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateStrip.tsx:76-84)
  - /cpm: drawer row (src/frontend-ob/src/components/Cpm/overview/FocusedLoopDrawer.tsx:127-133)
  - /cpm/evidence: chip and verdict card (src/frontend-ob/src/components/Cpm/evidence/VerdictCard.tsx:29)
  - /cpm/replay: result row (src/frontend-ob/src/components/Cpm/CpmReplay.tsx:292-294)
- **Displayed definitions:**
  - GATE_NAMES: "Step-test evidence" (src/frontend-ob/src/components/Cpm/gateStatus.ts:162)
  - GateCatalog: "Event-keyed response analysis: eligibility, event capture, observed metrics with censoring, bounded estimation on the actual applied input, holdout validation, model-domain controller outputs; no process gain from set-point response alone." (src/services/cplm-api/Services/GateCatalog.cs:80)
  - Calculations contract: "Is there an approved step test to support tuning claims?" (src/services/cplm-api/Controllers/CpmEventsController.cs:151)
- **Engine calculation:** PASS if the sample flags carry HAS_STEP_TEST, else NOT_EVALUATED (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:342-351; src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionStreamJob.java:248-250). No effect on scores.
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:107; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:552.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26).
- **Eligibility:** Any fused row past the exclusions.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: mark, word, tone. Computed: status enum.
- **Thresholds:** none.
- **Staleness:** /cpm/explorer summary: window end older than the window size adds "ended … ago" (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:110-115; src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:87,110). /cpm/performance: page banner only, newest window across loops older than 3 h reads "Stale" (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:57,167-169,265).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown in Explain and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/ExplainPanel.tsx:98; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111).
- **Consistency:** Conflicts: the panel text says it contributes evidence (src/frontend-ob/src/components/Cpm/GateEvidencePanel.tsx:147), kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:552 says no computational effect. Two served names for one key. See M-129 for the event analysis.

### M-059

**G13 interaction.** Status: **Label only**

- **Labels:** "G13", "Disturbance context", "Interaction", "Aligned peer analysis", "Interaction and disturbances"
- **Surfaces:**
  - /cpm/performance: chip and matrix cell (src/frontend-ob/src/components/Cpm/GateMatrixChecks.tsx:75-88)
  - /cpm/explorer: gate strip (src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateStrip.tsx:76-84)
  - /cpm: drawer row (src/frontend-ob/src/components/Cpm/overview/FocusedLoopDrawer.tsx:127-133)
  - /cpm/evidence: chip and verdict card (src/frontend-ob/src/components/Cpm/evidence/VerdictCard.tsx:29)
  - /cpm/replay: result row (src/frontend-ob/src/components/Cpm/CpmReplay.tsx:292-294)
- **Displayed definitions:**
  - GATE_NAMES: "Disturbance context" (src/frontend-ob/src/components/Cpm/gateStatus.ts:163)
  - GateCatalog: "Aligned peer analysis over the loop's accepted support: per configured peer the nearest-sample alignment with a shared support mask, normalised cross-correlation over +/- lag_max_s and Welch magnitude-squared coherence in the loop's band. A peer is associated only when coherence and |xcorr| both clear their floors on enough shared support; an unobserved peer is UNAVAILABLE, no peers is NOT_CONFIGURED. Pairwise association is not causal direction." (src/services/cplm-api/Services/GateCatalog.cs:84)
  - Calculations contract: "Could an upstream loop be causing this oscillation?" (src/services/cplm-api/Controllers/CpmEventsController.cs:152)
- **Engine calculation:** INTERACTION_DETECTED WARN, NO_INTERACTION PASS, else NOT_EVALUATED (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:318-333).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:108.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26).
- **Eligibility:** Configured peers with compatible support.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: mark, word, tone. Computed: status enum.
- **Thresholds:**
  - coherence 0.6, |xcorr| 0.5, lag 600 s, support 1800 s, peers 12. Source: profile (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:91-95); xcorr fixed per kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:553. Colour: WARN amber "Attention".
- **Staleness:** /cpm/explorer summary: window end older than the window size adds "ended … ago" (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:110-115; src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:87,110). /cpm/performance: page banner only, newest window across loops older than 3 h reads "Stale" (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:57,167-169,265).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown in Explain and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/ExplainPanel.tsx:98; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111).
- **Consistency:** Two served names. Contract question implies direction; the catalogue says pairwise association is not causal.

### M-060

**G14 valve confirmation.** Status: **Engine-UI conflict**

- **Labels:** "G14", "VP confirmation", "Final-element confirmation", "Valve confirmation", "G14 confirmation", "Confirmed", "Not confirmed", "Contradicted"
- **Surfaces:**
  - /cpm/performance: chip and matrix cell (src/frontend-ob/src/components/Cpm/GateMatrixChecks.tsx:75-88)
  - /cpm/explorer: gate strip (src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateStrip.tsx:76-84)
  - /cpm: drawer row (src/frontend-ob/src/components/Cpm/overview/FocusedLoopDrawer.tsx:127-133)
  - /cpm/evidence: chip and verdict card (src/frontend-ob/src/components/Cpm/evidence/VerdictCard.tsx:29)
  - /cpm/replay: result row (src/frontend-ob/src/components/Cpm/CpmReplay.tsx:292-294)
- **Displayed definitions:**
  - GATE_NAMES: "VP confirmation" (src/frontend-ob/src/components/Cpm/gateStatus.ts:163)
  - GateCatalog: "Fault-scoped confirmation: CONFIRMED only from a positive non-following record (VP tracking error over a dwell with valid VP quality, or an approved test record); healthy tracking contradicts; the subtype cannot exceed the evidence scope." (src/services/cplm-api/Services/GateCatalog.cs:88)
  - Calculations contract: "Is valve position available to confirm the diagnosis?" (src/services/cplm-api/Controllers/CpmEventsController.cs:153)
  - confirmationProse: "Measured valve position did not follow the controller output for {dwell} (p95 tracking error {x} pp): the final-element claim is confirmed." (src/frontend-ob/src/components/Cpm/investigation/confirmationCopy.ts:39-40)
  - Catalogue note: "CONFIRMED requires a VP signal; without it G14 caps confidence at 0.89." (src/services/cplm-api/Controllers/CpmEventsController.cs:192)
- **Engine calculation:** No VP: NOT_CONFIRMED, or NOT_APPLICABLE when declared absent. Non-following dwell ≥ 60 s: CONFIRMED. Healthy tracking: CONTRADICTED. Else NOT_CONFIRMED (src/flink/src/main/java/com/ams/flink/cplm/fusion/Confirmation.java:42-74). Caps 1.0, 0.54, 0.89 (src/flink/src/main/java/com/ams/flink/cplm/fusion/Confirmation.java:77-83). Claim = FINAL_ELEMENT_NON_FOLLOWING (src/flink/src/main/java/com/ams/flink/cplm/fusion/Confirmation.java:24).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:109; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:181-190.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26).
- **Eligibility:** Final-element claim only; NOT_APPLICABLE on symptom families (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:239).
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: mark, word, tone. Computed: status enum.
- **Thresholds:**
  - 5 pp, 60 s, 30 samples. Source: profile and code (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:182-183; src/flink/src/main/java/com/ams/flink/cplm/engine/VpTrackingMath.java:73-75). Colour: CONFIRMED red, CONTRADICTED green on Investigation (src/frontend-ob/src/components/Cpm/CpmInvestigation.tsx:268-269).
  - 0.89, 0.54. Source: hardcoded (src/flink/src/main/java/com/ams/flink/cplm/fusion/Confirmation.java:80-81). Colour: band.
- **Staleness:** /cpm/explorer summary: window end older than the window size adds "ended … ago" (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:110-115; src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:87,110). /cpm/performance: page banner only, newest window across loops older than 3 h reads "Stale" (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:57,167-169,265).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown in Explain and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/ExplainPanel.tsx:98; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111).
- **Consistency:** Conflicts: no approved-test path exists in the engine, yet three surfaces offer one. The confirmed claim is non-following, the label reads "Valve nonlinearity (stiction) confirmed". The note ties CONFIRMED to VP for every family (D-11).

### M-061

**G15 decision.** Status: **Definition conflict**

- **Labels:** "G15", "Diagnosis band", "Decision", "EVIDENCE_FUSION", "Evidence fusion"
- **Surfaces:**
  - /cpm/performance: chip and matrix cell (src/frontend-ob/src/components/Cpm/GateMatrixChecks.tsx:75-88)
  - /cpm/explorer: gate strip (src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateStrip.tsx:76-84)
  - /cpm: drawer row (src/frontend-ob/src/components/Cpm/overview/FocusedLoopDrawer.tsx:127-133)
  - /cpm/evidence: chip and verdict card (src/frontend-ob/src/components/Cpm/evidence/VerdictCard.tsx:29)
  - /cpm/replay: result row (src/frontend-ob/src/components/Cpm/CpmReplay.tsx:292-294)
- **Displayed definitions:**
  - GATE_NAMES: "Diagnosis band" (src/frontend-ob/src/components/Cpm/gateStatus.ts:163)
  - GateCatalog: "Observations, hypotheses and the leading hypothesis by ranked selection (argmax, not an additive waterfall), with evidence scores labelled uncalibrated, condition and availability states, revision history." (src/services/cplm-api/Services/GateCatalog.cs:92)
  - Calculations contract: "How confident is the final verdict?" (src/services/cplm-api/Controllers/CpmEventsController.cs:154)
- **Engine calculation:** Status from the band (src/flink/src/main/java/com/ams/flink/cplm/fusion/DiagnosisBands.java:43-74); INSUFFICIENT_EVIDENCE on no family and NO_CALL (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:370-380). A shim for rows written before CHG-094 exists but has no caller (src/frontend-ob/src/components/Cpm/vocabulary.ts:156-162).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:110; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:165-175.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26).
- **Eligibility:** Row past the exclusions.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: mark, word, tone. Computed: status enum.
- **Thresholds:**
  - 0.35, 0.55, 0.75, 0.90. Source: hardcoded (src/flink/src/main/java/com/ams/flink/cplm/fusion/DiagnosisBands.java:44-57). Colour: CONFIRMED red, others amber (src/frontend-ob/src/components/Cpm/gateStatus.ts:78-81).
- **Staleness:** /cpm/explorer summary: window end older than the window size adds "ended … ago" (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:110-115; src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:87,110). /cpm/performance: page banner only, newest window across loops older than 3 h reads "Stale" (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:57,167-169,265).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown in Explain and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/ExplainPanel.tsx:98; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111).
- **Consistency:** The contract question asks "How confident", and the product rule is that the score is not confidence (src/frontend-ob/src/components/Cpm/evidenceScore.ts:2-6). Status INSUFFICIENT_EVIDENCE on NO_CALL reads "Insufficient" or "Not evaluated" (src/frontend-ob/src/components/Cpm/gateStatus.ts:91; src/frontend-ob/src/components/Cpm/CpmCalculations.tsx:153).

## Verdict

### M-062

**Diagnosis band.** Status: **Definition conflict**

- **Labels:** "Oscillation confirmed", "Oscillation suspected", "Valve nonlinearity (stiction) confirmed", "Excessive effort classified", "Confirmed", "Suspected", "Classified", "Detected", "Primary diagnosis", "Final diagnosis", "Final conclusion", "Verdict", "Result", "Diagnosis", "Peak: …", "Now: …"
- **Surfaces:**
  - /cpm: queue pill and drawer (src/frontend-ob/src/components/Cpm/overview/PriorityQueue.tsx:83; src/frontend-ob/src/components/Cpm/overview/FocusedLoopDrawer.tsx:113)
  - /cpm/performance: result column (src/frontend-ob/src/components/Cpm/GateMatrixChecks.tsx:26)
  - /cpm/explorer: summary headline (src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:112)
  - /cpm/investigation: conclusion (src/frontend-ob/src/components/Cpm/CpmInvestigation.tsx:225)
  - /cpm/historical: verdict lane and panel (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:87-90)
  - /cpm/events: title (src/frontend-ob/src/components/Cpm/CpmEvents.tsx:226)
- **Displayed definitions:**
  - Code comment: "ONE band per result, read from the diagnosis prefix, on every screen (summary, matrix, G15 cell, Investigation, Events, Historical, export)." (src/frontend-ob/src/components/Cpm/vocabulary.ts:135-136)
  - Facet hint: "Diagnosis: the engine's conclusion about the loop on its latest evaluated window" (src/frontend-ob/src/components/Cpm/FacetPill.tsx:31)
  - Gate marks: "condition detected (weak evidence); condition classified (moderate evidence); condition suspected; condition confirmed" (src/frontend-ob/src/components/Cpm/gateStatus.ts:78-81)
- **Engine calculation:** Band from confidence: < 0.35 NO_CALL, < 0.55 DETECTED, < 0.75 CLASSIFIED, < 0.90 SUSPECTED, else CONFIRMED; final-element claim needs G14 CONFIRMED, else SUSPECTED at 0.89 (src/flink/src/main/java/com/ams/flink/cplm/fusion/DiagnosisBands.java:43-74). Persistence 2 of 3 or capped to DETECTED at 0.54 (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:388-433).
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:37-50; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:165-175; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:177-179.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55).
- **Eligibility:** Row past the blocking exclusions (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:126-149).
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: band word + family. Computed: diagnosis code.
- **Thresholds:**
  - 0.35, 0.55, 0.75, 0.90. Source: hardcoded (src/flink/src/main/java/com/ams/flink/cplm/fusion/DiagnosisBands.java:44-57). Colour: CONFIRMED red, others amber (src/frontend-ob/src/components/Cpm/shared.tsx:253-258).
- **Staleness:** /cpm/explorer summary: window end older than the window size adds "ended … ago" (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:110-115; src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:87,110). /cpm/performance: page banner only, newest window across loops older than 3 h reads "Stale" (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:57,167-169,265).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Evidence workbench header and Explain identity (src/frontend-ob/src/components/Cpm/evidence/gateFacts.ts:71-83); Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** Band words are the same on findings. "Confirmed" on oscillation and effort means the band alone (src/flink/src/main/java/com/ams/flink/cplm/fusion/DiagnosisBands.java:41,62-63); on the valve family it means non-following, while the label names stiction (D-11). The Explorer "Main reason" adds "not confirmed" beside "Oscillation confirmed" (src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:135-137).

### M-063

**No fault identified verdict.** Status: **Definition conflict**

- **Labels:** "No fault identified", "No fault found", "Not evaluated yet", "Not evaluated: not enough data", "Not evaluated", "Not evaluable", "no verdict", "Insufficient", "Insufficient evidence", "Insufficient data", "No problem found"
- **Surfaces:**
  - /cpm/kpi: verdict column (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:35,43)
  - /cpm/performance: result pill (src/frontend-ob/src/components/Cpm/GateMatrixChecks.tsx:26)
  - /cpm/explorer: header pill and summary headline (src/frontend-ob/src/components/Cpm/explorer/LoopWorkspace.tsx:132; src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:76,112)
  - /cpm/investigation: conclusion, score pill, case chip, delta table (src/frontend-ob/src/components/Cpm/CpmInvestigation.tsx:225-228; src/frontend-ob/src/components/Cpm/investigation/cases.ts:26; src/frontend-ob/src/components/Cpm/investigation/WindowBrowser.tsx:47)
  - /cpm/calculations: row values and status (src/frontend-ob/src/components/Cpm/metricAvailability.ts:64-65; src/frontend-ob/src/components/Cpm/CpmCalculations.tsx:153)
  - /cpm/evidence: Explain (src/frontend-ob/src/components/Cpm/evidence/ExplainWhy.tsx:68)
- **Displayed definitions:**
  - diagnosisLabel: "No fault identified" (src/frontend-ob/src/components/Cpm/vocabulary.ts:170)
  - Code comment: "NO_CALL and INSUFFICIENT_EVIDENCE are verdicts — judged, no fault reached the evidence threshold. INSUFFICIENT_EVIDENCE used to read "not enough data", which is INSUFFICIENT_DATA's meaning." (src/frontend-ob/src/components/Cpm/vocabulary.ts:168-169)
  - conditionOf: "Not evaluated yet" (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:26)
  - conditionOf: "Not evaluated: not enough data" (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:28)
  - REASON map: "NO_CALL: 'Not evaluated'" (src/frontend-ob/src/components/Cpm/vocabulary.ts:64)
  - CASE_LABEL: "Not evaluable" (src/frontend-ob/src/components/Cpm/investigation/cases.ts:18)
  - hasVerdict: "A window carries a verdict (and so a confidence) only when it was judged — not excluded, not short of data." (src/frontend-ob/src/components/Cpm/metricAvailability.ts:52)
  - Explain: "The whole window: {label} — no gate on it carries a verdict." (src/frontend-ob/src/components/Cpm/evidence/ExplainWhy.tsx:68)
- **Engine calculation:** NO_CALL: confidence < 0.35 (src/flink/src/main/java/com/ams/flink/cplm/fusion/DiagnosisBands.java:44-47). INSUFFICIENT_EVIDENCE: no family qualified, confidence 0 (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:196-205,370-380). Both are Clear for episodes (src/services/cplm-api/Services/EventFrameLifecycle.cs:88) and Assessed for KPIs (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:57-60).
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:43-44; kpi_calculation_logic/KPI-LOGIC.md:287-288 (open item for NO_CALL wording); kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:169.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55).
- **Eligibility:** Window judged, past exclusions.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: word. Computed: diagnosis code.
- **Thresholds:**
  - 0.35. Source: hardcoded (src/flink/src/main/java/com/ams/flink/cplm/fusion/DiagnosisBands.java:44). Colour: grey by design (src/frontend-ob/src/components/Cpm/vocabulary.ts:138-139).
- **Staleness:** /cpm/explorer summary: window end older than the window size adds "ended … ago" (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:110-115; src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:87,110). /cpm/performance: page banner only, newest window across loops older than 3 h reads "Stale" (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:57,167-169,265).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Evidence workbench header and Explain identity (src/frontend-ob/src/components/Cpm/evidence/gateFacts.ts:71-83); Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** Conflicts: one verdict counted Performing acceptably on /cpm reads "Not evaluated yet" or "Not evaluated: not enough data" on /cpm/explorer, with next check "signals are arriving", and "no verdict" on /cpm/investigation. See D-14.

### M-064

**Not enough data verdict.** Status: **Label only**

- **Labels:** "Not enough data", "Not evaluated: not enough data", "INSUFFICIENT_DATA", "DECLINED", "DECLINED — insufficient data", "UNQUALIFIED — failed G0", "Insufficient data"
- **Surfaces:**
  - /cpm/windows: pill (src/frontend-ob/src/components/Cpm/CpmWindows.tsx:186; src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:119)
  - /cpm/explorer: summary (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:28)
  - /cpm/calculations: cells (src/frontend-ob/src/components/Cpm/metricAvailability.ts:65)
- **Displayed definitions:**
  - Window panel: "The engine declined to evaluate this window (G0 failed or fewer than 10 samples). Metric fields are “not computed”, not zero." (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:130-132)
  - STATUS map: "INSUFFICIENT_DATA: 'Not enough data'" (src/frontend-ob/src/components/Cpm/vocabulary.ts:34)
- **Engine calculation:** Short stage sets sufficientData false when G0 FAIL or n < 10 (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:150-158); fusion returns INSUFFICIENT_DATA with confidence 0 (src/flink/src/main/java/com/ams/flink/cplm/fusion/BlockingExclusions.java:15-26). A slice under 32 samples produces no row at all (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:41-43,59).
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:41; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:54.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55).
- **Eligibility:** G0 FAIL or n < 10.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: word. Computed: diagnosis code.
- **Thresholds:**
  - n < 10. Source: hardcoded (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:150). Colour: grey.
  - MIN_SAMPLES 32. Source: hardcoded (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:59). Colour: no row.
- **Staleness:** /cpm/explorer summary: window end older than the window size adds "ended … ago" (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:110-115; src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:87,110).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Evidence workbench header and Explain identity (src/frontend-ob/src/components/Cpm/evidence/gateFacts.ts:71-83); Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** Words differ by page. Tone: DECLINED is red on /cpm/windows (src/frontend-ob/src/components/Cpm/CpmWindows.tsx:186), grey elsewhere (src/frontend-ob/src/components/Cpm/shared.tsx:262-265).

### M-065

**Excluded window.** Status: **Engine-UI conflict**

- **Labels:** "Excluded: loop not in automatic", "Excluded", "N/A", "Not assessable — manual mode", "loop not in automatic — the window was excluded"
- **Surfaces:**
  - /cpm/performance: result pill (src/frontend-ob/src/components/Cpm/vocabulary.ts:172)
  - /cpm/explorer: headline (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:30)
  - /cpm/calculations and /cpm/investigation: metric cells (src/frontend-ob/src/components/Cpm/metricAvailability.ts:62-63)
  - /cpm/investigation: delta note (src/frontend-ob/src/components/Cpm/investigation/WindowBrowser.tsx:46)
- **Displayed definitions:**
  - diagnosisLabel: "Excluded: loop not in automatic" (src/frontend-ob/src/components/Cpm/vocabulary.ts:172)
  - Next check: "Nothing to assess while the loop is out of automatic; Historical shows when it ran in AUT or CASCADE." (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:83)
  - Gate mark: "excluded on purpose (mode or operating region)" (src/frontend-ob/src/components/Cpm/gateStatus.ts:72)
- **Engine calculation:** Five codes: EXCLUDED_DATA_QUALITY, EXCLUDED_MODE, EXCLUDED_OPERATING_REGION, EXCLUDED_INSTRUMENT_HEALTH, EXCLUDED_SENSOR (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:131-149). Engine text per code (src/flink/src/main/java/com/ams/flink/cplm/fusion/BlockingExclusions.java:54-75).
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:42; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:120-126 (flow).
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55).
- **Eligibility:** Blocking condition met.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: word. Computed: diagnosis code.
- **Thresholds:** none.
- **Staleness:** /cpm/explorer summary: window end older than the window size adds "ended … ago" (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:110-115; src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:87,110).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Evidence workbench header and Explain identity (src/frontend-ob/src/components/Cpm/evidence/gateFacts.ts:71-83); Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** Conflicts: every EXCLUDED* code reads "loop not in automatic", also a sensor freeze, an operating-region exit or an instrument fault. /cpm/kpi uses the correct reason words for the same rows (D-15). The next check on the same card comes from the engine and names the real cause (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:78-80), so headline and next check can disagree.

### M-066

**Evidence score.** Status: **Definition conflict**

- **Labels:** "Evidence score", "evidence score N", "Fused evidence score", "N / 100", "N of 100", "Evidence score (selected family)", "evidence N", "peak evidence score N", "Peak evidence score", "confidence", "Score"
- **Surfaces:**
  - /cpm: reason line (src/frontend-ob/src/components/Cpm/overview/priorityReason.ts:47)
  - /cpm/kpi: verdict column (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:44)
  - /cpm/explorer: main reason (src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:139-141)
  - /cpm/investigation: conclusion pill and note (src/frontend-ob/src/components/Cpm/CpmInvestigation.tsx:226-229)
  - /cpm/calculations: CPLM-090 (src/frontend-ob/src/components/Cpm/CpmCalculations.tsx:330)
  - /cpm/events: peak (src/frontend-ob/src/components/Cpm/events/EventDetail.tsx:143)
  - /cpm/historical: panel (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:92-94)
- **Displayed definitions:**
  - calcCatalogue: "How fully the observed symptoms match the selected family (0–1; shown 0–100). Uncalibrated — not a probability." (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:46)
  - EVIDENCE_SCORE_HELP: "Evidence score: how fully the observed symptoms match this finding’s signature (0–100). Not a probability, and not a priority — the queue ranks by criticality, severity and persistence." (src/frontend-ob/src/components/Cpm/evidenceScore.ts:10-11)
  - Hypothesis panel: "Scores are uncalibrated evidence scores, not probabilities: they rank the mechanisms, they do not measure certainty." (src/frontend-ob/src/components/Cpm/investigation/HypothesisPanel.tsx:119)
- **Engine calculation:** confidence = min(family score, G14 cap on a valve claim) (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:237). Family score = max of two detector scores × prior, or effort_ratio/8 × prior (src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionEvidence.java:140-149). Selected family = highest qualified (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:207-217). Capped at 0.54 by persistence (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:425-427).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:157; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:175; prod_decision.md:119.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55).
- **Eligibility:** Shown only with a verdict: hasVerdict excludes EXCLUDED*, INSUFFICIENT*, NO_CALL (src/frontend-ob/src/components/Cpm/metricAvailability.ts:53-56). Queue row omits only null.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: 0 to 100, integer, no %. Computed: fraction 0 to 1 × 100, rounded (src/frontend-ob/src/components/Cpm/evidenceScore.ts:14-16).
- **Thresholds:**
  - 75 for findings. Source: hardcoded (src/services/cplm-api/Services/Kpi/FleetKpiRows.cs:61). Colour: meter mark.
  - bar ≥ 0.7. Source: hardcoded (src/frontend-ob/src/components/Cpm/investigation/HypothesisPanel.tsx:37). Colour: class cpm-hypo__fill--high.
- **Staleness:** /cpm/explorer summary: window end older than the window size adds "ended … ago" (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:110-115; src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:87,110).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Evidence workbench header and Explain identity (src/frontend-ob/src/components/Cpm/evidence/gateFacts.ts:71-83); Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** Differs: "how fully the symptoms match" describes a fraction of a signature; the engine takes one detector's maximum × a prior, so one strong detector gives 100. The help says the queue ranks by criticality, severity and persistence and omits the good-error step in PRIORITY_RULE. It says "not a priority" while /cpm/performance ranks loops by it by default. Row "Score" and "evidence score" scale the same.

### M-067

**Evidence-score band in the drawer.** Status: **Engine-UI conflict**

- **Labels:** "Evidence-score band", "(evidence score ≤ N)"
- **Surfaces:**
  - /cpm/calculations: drawer Validation (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:246-252)
- **Displayed definitions:**
  - Catalogue note: "CONFIRMED requires a VP signal; without it G14 caps confidence at 0.89." (src/services/cplm-api/Controllers/CpmEventsController.cs:192)
- **Engine calculation:** First band with value ≤ maxConfidence (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:185-189); bands 0.35, 0.55, 0.75, 0.90, 1.00 (src/services/cplm-api/Controllers/CpmEventsController.cs:184-191). Engine compares with < (src/flink/src/main/java/com/ams/flink/cplm/fusion/DiagnosisBands.java:44-57).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:169-173.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55).
- **Eligibility:** CPLM-090 with a value.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: band word, score. Computed: fraction.
- **Thresholds:**
  - As served. Source: hardcoded list (src/services/cplm-api/Controllers/CpmEventsController.cs:186-190). Colour: none.
- **Staleness:** No staleness rule on this surface; the window end is shown.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Evidence workbench header and Explain identity (src/frontend-ob/src/components/Cpm/evidence/gateFacts.ts:71-83); Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** Differs at the exact boundaries (≤ against <). The note ties CONFIRMED to VP for all families; the engine needs it for valve claims only, and VP alone does not confirm.

### M-068

**Evidence score cap note.** Status: **Engine-UI conflict**

- **Labels:** "capped at 54: not yet persistent (x of y windows agree)", "capped at N: a valve cause cannot be confirmed without valve position (G14)", "This score is …"
- **Surfaces:**
  - /cpm/investigation: note (src/frontend-ob/src/components/Cpm/EvidenceScoreNote.tsx:12)
  - /cpm/evidence: Explain row (src/frontend-ob/src/components/Cpm/evidence/whyRules.ts:127)
- **Displayed definitions:**
  - evidenceScoreCap: "capped at 54: not yet persistent ({a} of {b} windows agree)" (src/frontend-ob/src/components/Cpm/evidenceScore.ts:33)
  - evidenceScoreCap: "capped at {cap}: a valve cause cannot be confirmed without valve position (G14)" (src/frontend-ob/src/components/Cpm/evidenceScore.ts:37)
- **Engine calculation:** Regex over status_reason (src/frontend-ob/src/components/Cpm/evidenceScore.ts:28-39). Reason strings written at src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:252-255,428-429. Engine cap of 0.89 also applies with VP mapped and no positive evidence (src/flink/src/main/java/com/ams/flink/cplm/fusion/Confirmation.java:71-72,81), and 0.54 when tracking is healthy (src/flink/src/main/java/com/ams/flink/cplm/fusion/Confirmation.java:80).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:183-189.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55).
- **Eligibility:** Score equals the cap.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: text. Computed: text.
- **Thresholds:** none.
- **Staleness:** No staleness rule on this surface; the window end is shown.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Evidence workbench header and Explain identity (src/frontend-ob/src/components/Cpm/evidence/gateFacts.ts:71-83); Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** Differs: with VP mapped and no dwell the text still says "without valve position". At 54 from a healthy-tracking contradiction, cap text names G14 with the same wording.

### M-069

**Leading hypothesis.** Status: **Label only**

- **Labels:** "Main reason", "Possible cause", "Leading", "Leading: …", "Controller tuning", "Valve stiction / nonlinearity", "External disturbance", "Excessive actuator effort", "No mechanism qualified"
- **Surfaces:**
  - /cpm/explorer: main reason (src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:133-137)
  - /cpm/investigation: cause breakdown and comparison (src/frontend-ob/src/components/Cpm/CpmInvestigation.tsx:265,346-348)
  - /cpm/evidence: G15 view (src/frontend-ob/src/components/Cpm/evidence/views/FusionViews.tsx:89)
- **Displayed definitions:**
  - G15 view: "the leading explanation, not confirmed" (src/frontend-ob/src/components/Cpm/evidence/views/FusionViews.tsx:89)
  - Code comment: ""Oscillation confirmed" confirms the symptom; the leading hypothesis ("controller tuning") is the engine's highest-scoring explanation — qualified, not confirmed (G14 confirms valve claims only)." (src/frontend-ob/src/components/Cpm/causeAnalysis.ts:2-5)
- **Engine calculation:** stiction or geometry → STICTION; oscillation → OSCILLATION_TUNING, or EXTERNAL_DISTURBANCE under disturbance context; effort → EXCESSIVE_EFFORT (src/flink/src/main/java/com/ams/flink/cplm/fusion/DiagnosisBands.java:28-37).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:191-209.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55).
- **Eligibility:** A family selected.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: label. Computed: enum.
- **Thresholds:** none.
- **Staleness:** /cpm/explorer summary: window end older than the window size adds "ended … ago" (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:110-115; src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:87,110).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Evidence workbench header and Explain identity (src/frontend-ob/src/components/Cpm/evidence/gateFacts.ts:71-83); Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** OSCILLATION_TUNING is assigned to any oscillation not under disturbance context, with no tuning measurement behind it (docs/theme/cpa-currenttheme.md:1130). Same concept, two captions: "Main reason" and "Possible cause".

### M-070

**Hypothesis score and state.** Status: **Definition conflict**

- **Labels:** "Mechanisms and the evidence for each", "Evidence against", "Not seen", "Not assessed", "Qualified", "Ruled out", "evidence score N from …", "Ranked by evidence score — the highest leads; scores do not add up"
- **Surfaces:**
  - /cpm/investigation: comparison (src/frontend-ob/src/components/Cpm/investigation/HypothesisPanel.tsx:87-117)
  - /cpm/evidence: G15 ranked list (src/frontend-ob/src/components/Cpm/evidence/views/FusionViews.tsx:95-105)
- **Displayed definitions:**
  - Comparison note: "Scores are uncalibrated evidence scores, not probabilities: they rank the mechanisms, they do not measure certainty." (src/frontend-ob/src/components/Cpm/investigation/HypothesisPanel.tsx:119)
- **Engine calculation:** Hypothesis score from family scores; state settled by evidence and disqualifiers (src/flink/src/main/java/com/ams/flink/cplm/fusion/VerdictAssembly.java:60-85). ACTUATOR_LIMIT and SENSOR are scored, never leading (kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:200).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:191-198.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55).
- **Eligibility:** Fusion v2 rows.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: 0 to 100 on Investigation; 0.00 to 1.00 on G15 view. Computed: fraction.
- **Thresholds:** none.
- **Staleness:** No staleness rule on this surface; the window end is shown.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Evidence workbench header and Explain identity (src/frontend-ob/src/components/Cpm/evidence/gateFacts.ts:71-83); Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** Scale differs: integer 0 to 100 on Investigation (src/frontend-ob/src/components/Cpm/investigation/HypothesisPanel.tsx:42), two decimals on the G15 view (src/frontend-ob/src/components/Cpm/evidence/views/FusionViews.tsx:100), against the one-format rule (src/frontend-ob/src/components/Cpm/evidenceScore.ts:6).

### M-071

**Observation score.** Status: **Definition conflict**

- **Labels:** "Observations", "Symptoms as observed", "What was seen, and by which method", "Sustained oscillation", "Triangular OP waveform", "Cross-correlation asymmetry", "Phase-portrait geometry", "Actuator stress", "Output at a limit", "PV freeze", "Peer links declared"
- **Surfaces:**
  - /cpm/investigation: table (src/frontend-ob/src/components/Cpm/investigation/HypothesisPanel.tsx:133-158)
  - /cpm/evidence: G15 table (src/frontend-ob/src/components/Cpm/evidence/views/FusionViews.tsx:106-113)
  - /cpm/explorer: Evidence seen (src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:184-193)
- **Displayed definitions:**
  - OBSERVATION_LABEL: "OSCILLATION: 'Sustained oscillation'; SHAPE_TRIANGULARITY: 'Triangular OP waveform'; LAG_ASYMMETRY: 'Cross-correlation asymmetry'; PHASE_GEOMETRY: 'Phase-portrait geometry'; ACTUATOR_STRESS: 'Actuator stress'; LIMIT_OCCUPANCY: 'Output at a limit'; FREEZE: 'PV freeze'; PEER_LINKS: 'Peer links declared'" (src/frontend-ob/src/api/cpm/verdict.ts:89-98)
- **Engine calculation:** Observations assembled from fusion evidence (src/flink/src/main/java/com/ams/flink/cplm/fusion/VerdictAssembly.java:60-85; src/flink/src/main/java/com/ams/flink/cplm/fusion/Observation.java:1-50).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:191.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55).
- **Eligibility:** Fusion v2 rows.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: integer on Investigation; 0.00 on G15. Computed: fraction.
- **Thresholds:** none.
- **Staleness:** No staleness rule on this surface; the window end is shown.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Evidence workbench header and Explain identity (src/frontend-ob/src/components/Cpm/evidence/gateFacts.ts:71-83); Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** "Sustained oscillation" is reported from the same qualification as M-009, valid cycle or not. Scale differs as in M-070.

### M-072

**Detector scores.** Status: **Label only**

- **Labels:** "Stiction score", "Stiction family", "Actuator effort", "Spectral (FFT)", "Phase-portrait corners", "ACF regularity", "Weighted final-element"
- **Surfaces:**
  - /cpm/investigation: key fact "Stiction score" (src/frontend-ob/src/components/Cpm/investigation/keyFacts.ts:5)
  - /cpm/investigation: legacy rows (src/frontend-ob/src/components/Cpm/investigation/HypothesisPanel.tsx:18-25)
- **Displayed definitions:**
  - None displayed.
- **Engine calculation:** oscillation = acf_regularity; fft = fft_peak_ratio; effort = effort_ratio/8; stiction = triangularity; horch = oddness; geometry = corner_score_qualified, each clamped to 0 to 1 (src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionEvidence.java:63-70). raw_final_element_score = weighted sum (src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionEvidence.java:151-158).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:141-148.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55).
- **Eligibility:** Row past exclusions.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: 0.00 on key fact; integer on legacy bars. Computed: fraction.
- **Thresholds:**
  - 0.55 qualification. Source: hardcoded (src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionEvidence.java:168). Colour: none.
  - weights .15, .15, .15, .20, .20, .15. Source: hardcoded (src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionEvidence.java:152-157). Colour: none.
- **Staleness:** No staleness rule on this surface; the window end is shown.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Evidence workbench header and Explain identity (src/frontend-ob/src/components/Cpm/evidence/gateFacts.ts:71-83); Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** "Stiction score" and "OP triangularity" are one number under two tiles on Investigation (src/frontend-ob/src/components/Cpm/investigation/keyFacts.ts:5,7; src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionEvidence.java:66).

### M-073

**Selected family.** Status: **Label only**

- **Labels:** "Selected family", "Fault family", "family"
- **Surfaces:**
  - /cpm/investigation: row (src/frontend-ob/src/components/Cpm/CpmInvestigation.tsx:262)
  - /cpm/events: row (src/frontend-ob/src/components/Cpm/events/EventDetail.tsx:142)
- **Displayed definitions:**
  - Catalogue families: "FINAL_ELEMENT_NONLINEARITY: Stiction / final element; OSCILLATION: Oscillation; EXCESSIVE_EFFORT: Excessive actuator effort; GEOMETRY: Phase geometry" (src/services/cplm-api/Controllers/CpmEventsController.cs:179-182)
- **Engine calculation:** argmax over qualified families stiction, oscillation, effort, geometry (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:184-217). Event family = diagnosis suffix (src/services/cplm-api/Services/EventFrameLifecycle.cs:96-102).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:156.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55).
- **Eligibility:** A family qualified.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: word. Computed: enum.
- **Thresholds:** none.
- **Staleness:** No staleness rule on this surface; the window end is shown.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Evidence workbench header and Explain identity (src/frontend-ob/src/components/Cpm/evidence/gateFacts.ts:71-83); Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** selected_family on the row is engine vocabulary (stiction), Events family is the label (FINAL_ELEMENT_NONLINEARITY); both render through codeLabel.

### M-074

**Persistence agreement.** Status: **Engine-UI conflict**

- **Labels:** "Agreeing windows (persistence)", "N of M windows agree", "≥ N required to persist"
- **Surfaces:**
  - /cpm/evidence: Explain row on G15 (src/frontend-ob/src/components/Cpm/evidence/whyRules.ts:128-130)
- **Displayed definitions:**
  - Engine doc: "Apply temporal persistence: SUSPECTED/CONFIRMED require multi-window agreement. Single-window evidence is capped at DETECTED unless persistence is satisfied." (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:383-384)
- **Engine calculation:** agree = 1 + prior results with the same family among the last windows − 1; need = persistenceMinAgree 2, window = 3 (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:396-416).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:179; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:550 (three 15-min results, not independent windows).
- **Window and boundary:** Three consecutive fused results of one kind, 15 min apart, on overlapping windows.
- **Eligibility:** A family selected.
- **Denominator:** stated: ≥ persistence_windows_required. Computed: Needs persistenceMinAgree of persistenceWindows.
- **Unit and scale:** displayed: count. Computed: count.
- **Thresholds:**
  - 2 of 3. Source: profile (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:249-250). Colour: ✓ or ✕ (src/frontend-ob/src/components/Cpm/evidence/ExplainWhy.tsx:82).
- **Staleness:** No staleness rule on this surface; the window end is shown.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Evidence workbench header and Explain identity (src/frontend-ob/src/components/Cpm/evidence/gateFacts.ts:71-83); Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** Differs: the Explain row compares agree with persistence_windows_required (3) as a requirement (src/frontend-ob/src/components/Cpm/evidence/whyRules.ts:128-130); the engine needs persistenceMinAgree (2). At 2 of 3 the row shows ✕ though persistence was met.

### M-075

**Analysis cases.** Status: **Definition conflict**

- **Labels:** "Analysis cases", "What the fleet's verdicts contain", "Valve / final element", "Controller tuning", "External disturbance", "Actuator effort", "Not evaluable", "Healthy", "Other"
- **Surfaces:**
  - /cpm/investigation: chips with counts (src/frontend-ob/src/components/Cpm/investigation/CaseTriage.tsx:35,51-55)
- **Displayed definitions:**
  - CASE_LABEL: "STICTION: 'Valve / final element'; OSCILLATION_TUNING: 'Controller tuning'; EXTERNAL_DISTURBANCE: 'External disturbance'; EXCESSIVE_EFFORT: 'Actuator effort'; ACTUATOR_LIMIT: 'Actuator at limit'; SENSOR: 'Sensor / measurement'; NOT_EVALUABLE: 'Not evaluable'; HEALTHY: 'Healthy'; OTHER: 'Other'" (src/frontend-ob/src/components/Cpm/investigation/cases.ts:11-21)
- **Engine calculation:** Client count over up to 200 ranked loops (src/frontend-ob/src/components/Cpm/CpmInvestigation.tsx:74; src/frontend-ob/src/components/Cpm/investigation/cases.ts:24-35,41-48).
- **Documented logic:** Not determined: not in KL or KA.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s.
- **Eligibility:** Rows from LatestProbe: newest real verdict of any age.
- **Denominator:** stated: None. Computed: At most 200 loops.
- **Unit and scale:** displayed: count per case. Computed: count.
- **Thresholds:** none.
- **Staleness:** No freshness rule.
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** NO_CALL and INSUFFICIENT_EVIDENCE read "Not evaluable"; "Healthy" tests codes the engine never writes (src/frontend-ob/src/components/Cpm/investigation/cases.ts:27; kpi_calculation_logic/KPI-LOGIC.md:75). Past 200 loops the counts undercount (src/frontend-ob/src/components/Cpm/CpmInvestigation.tsx:67-70).

### M-076

**Last verdict.** Status: **Consistent**

- **Labels:** "Last verdict", "last verdict {label} · evidence score N · age", "The newest window has no verdict. Last verdict:"
- **Surfaces:**
  - /cpm/performance: result cell (src/frontend-ob/src/components/Cpm/GateMatrixChecks.tsx:23-30)
  - /cpm/explorer: summary note (src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:122-127)
  - /cpm/investigation: row (src/frontend-ob/src/components/Cpm/CpmInvestigation.tsx:251-255)
  - /cpm/kpi: context (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:87-89)
- **Displayed definitions:**
  - Code comment: "the page shows the loop's NEWEST evaluated window; a verdict from an older window is named beside it with its age - stated as older, never presented as current." (src/frontend-ob/src/components/Cpm/verdictAge.ts:5-6)
- **Engine calculation:** Newest row with diagnosis not INSUFFICIENT_DATA and older than the shown row (src/services/cplm-api/Data/FleetLatestSql.cs:144-152; src/services/cplm-api/Data/FleetKpiSql.cs:53-61).
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:153.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55).
- **Eligibility:** An older real verdict exists.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: label, score, age. Computed: row.
- **Thresholds:** none.
- **Staleness:** Age always stated.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Evidence workbench header and Explain identity (src/frontend-ob/src/components/Cpm/evidence/gateFacts.ts:71-83); Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** Same intent. /cpm/kpi hides it for EXCLUDED verdicts (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:88); the other surfaces do not.

### M-077

**Next check.** Status: **Definition conflict**

- **Labels:** "Next check", "Next-best action", "Engine recommendation"
- **Surfaces:**
  - /cpm/explorer: summary (src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:147-149)
  - /cpm/investigation: conclusion (src/frontend-ob/src/components/Cpm/CpmInvestigation.tsx:286-290)
- **Displayed definitions:**
  - Fallback: "Check that the loop’s signals are arriving: the Window Inspector shows the samples each window received." (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:82)
- **Engine calculation:** Engine recommendation by hypothesis and band (src/flink/src/main/java/com/ams/flink/cplm/fusion/Recommendations.java:1-63), by exclusion code (src/flink/src/main/java/com/ams/flink/cplm/fusion/BlockingExclusions.java:54-75); no-family text (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:198-200).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:202-209.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55).
- **Eligibility:** Row carries a recommendation, else client fallback by condition kind.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: text. Computed: text.
- **Thresholds:** none.
- **Staleness:** No staleness rule on this surface; the window end is shown.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Evidence workbench header and Explain identity (src/frontend-ob/src/components/Cpm/evidence/gateFacts.ts:71-83); Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** The primary action follows conditionOf, so an INSUFFICIENT_EVIDENCE row is sent to the Window Inspector (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:98).

## Loop metric

### M-078

**Time in AUTO share.** Status: **Engine-UI conflict**

- **Labels:** "Time in normal mode", "In AUTO", "In AUTO (%)", "Automatic-mode fraction", "Service factor", "AUTO %", "Time in AUTO / CASCADE", "AUTO / CASCADE", "Time in auto", "counts as AUTO"
- **Surfaces:**
  - /cpm/explorer: card (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:131)
  - /cpm/calculations: CPLM-003 (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:27)
  - /cpm/windows: panel and comparison (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:37; src/frontend-ob/src/components/Cpm/windows/CompareAcrossKinds.tsx:23)
  - /cpm/replay: G1 row (src/frontend-ob/src/components/Cpm/CpmReplay.tsx:47)
  - /cpm/kpi: deciding column (src/services/cplm-api/Services/Kpi/FleetKpiRows.cs:56)
- **Displayed definitions:**
  - Card sub: "AUTO / CASCADE · rule ≥ 95 % · {G1 status}" (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:132)
  - Card title: "Service factor: time in AUTO or CASCADE ÷ window time (G1, CPLM-003). More than 5 % out of design mode counts as out of mode." (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:133)
  - calcCatalogue: "Time fraction the controller spent in AUTO." (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:27)
  - KPI_META: "AUTO % = time in AUTO or CASCADE ÷ window time" (src/frontend-ob/src/components/Cpm/kpi/kpiMeta.ts:36)
  - Data source panel: "every sample counts as not-auto" (src/frontend-ob/src/components/Administration/LoopIngestPanel.tsx:122)
- **Engine calculation:** autoCount ÷ n, n = samples present (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:72,185,193). isAutoMode tokens: AUTO, AUT, A, AUTOMATIC, NORMAL, NORM, CAS, CASC, CASCADE, RSP, DDC, SUP, SUPERVISORY; manual tokens first; null, empty, UNKNOWN false (src/flink/src/main/java/com/ams/flink/cplm/CplmNormalizedSample.java:227-244).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:77 (count / n); kpi_calculation_logic/KPI-LOGIC.md:103 (÷ window time).
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24).
- **Eligibility:** Short stage ran: G0 not failed and n ≥ 10; else null (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:19-21).
- **Denominator:** stated: window time. Computed: samples present in the window.
- **Unit and scale:** displayed: % integer on card, 0.00 ratio on Calculations, % to 0.1 on Windows. Computed: fraction.
- **Thresholds:**
  - 0.95. Source: hardcoded (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:40,132). Colour: card green at or above, amber below.
  - 0.90, 0.70. Source: profile via G1 (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:87-88). Colour: G1 pill on Calculations.
- **Staleness:** /cpm/explorer cards: no freshness rule; the newest row of any age is shown, the eyebrow names its end (src/services/cplm-api/Controllers/CpmLoopKpiController.cs:24-31; src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:38). No staleness rule on this surface; the window end is shown.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: only in CalcDrawer (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:148-153,209-216) and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** Conflicts on four counts: denominator, mode set, thresholds, names (D-01, D-03, D-04, D-06). Compare-across-kinds shows the same field on short windows. No proof link to CPLM-003 from the card (docs/theme/cpa-currenttheme.md:1180).

### M-079

**Manual share.** Status: **Engine-UI conflict**

- **Labels:** "manual N %", "Time in MANUAL", "MANUAL %", "manual"
- **Surfaces:**
  - /cpm/kpi: Also check column (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:82,84)
- **Displayed definitions:**
  - KPI_META: "MANUAL % = time in MANUAL ÷ window time" (src/frontend-ob/src/components/Cpm/kpi/kpiMeta.ts:40)
- **Engine calculation:** 1 − auto_pct (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:194).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:275; kpi_calculation_logic/KPI-LOGIC.md:109.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24).
- **Eligibility:** Short stage ran: G0 not failed and n ≥ 10; else null (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:19-21).
- **Denominator:** stated: window time. Computed: samples present.
- **Unit and scale:** displayed: % to 0.1. Computed: fraction.
- **Thresholds:**
  - 0.50. Source: server config (src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:13). Colour: as M-008.
- **Staleness:** /cpm and /cpm/kpi: Fresh = (now − window_end) ≤ Cpm:Kpi:FreshSeconds, default 3600 s (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:30-31; src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:7).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: only in CalcDrawer (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:148-153,209-216) and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** Not a measure of MANUAL: it is the complement of auto (D-02).

### M-080

**Good-error share.** Status: **Engine-UI conflict**

- **Labels:** "Good-error time", "Good-error time (%)", "N% in band", "Control performance", "Time within the error band", "good-error share", "good-error"
- **Surfaces:**
  - /cpm: bar on queue row (src/frontend-ob/src/components/Cpm/overview/GoodErrorBar.tsx:34)
  - /cpm/performance: attention metric (src/frontend-ob/src/components/Cpm/AttentionList.tsx:105-107)
  - /cpm/explorer: card (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:135)
  - /cpm/calculations: CPLM-014 (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:32)
  - /cpm/windows: panel (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:33)
  - /cpm/investigation: key fact (src/frontend-ob/src/components/Cpm/investigation/keyFacts.ts:11)
  - /cpm/historical: overlay at 15m (src/frontend-ob/src/components/Cpm/CpmHistorical.tsx:52)
  - /cpm/evidence: Explain row (src/frontend-ob/src/components/Cpm/evidence/whyRules.ts:120)
- **Displayed definitions:**
  - Card sub: "|PV − SP| inside the good band · {G3 status}" (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:136)
  - Card title: "Time with |PV − SP| inside the good-error band ÷ window time (CPLM-014), judged by G3." (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:137)
  - calcCatalogue: "Time fraction (0-1) the error stayed inside the good band." (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:32)
  - Facet hint: "Control performance: share of the evaluated window inside the good-error band" (src/frontend-ob/src/components/Cpm/FacetPill.tsx:30)
- **Engine calculation:** count(|SP − PV| ≤ band) ÷ n (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:265,276). band = goodErrorBandPctOfSpan × declared span, 0.005 default, 0.5 EU if span unusable (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:226,234-239).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:75-76 (count / n); kpi_calculation_logic/KPI-LOGIC.md:174 ("time with"); kpi_calculation_logic/KPI-LOGIC.md:90-92.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24). Historical overlay reads the 15m tier (src/frontend-ob/src/components/Cpm/CpmHistorical.tsx:52).
- **Eligibility:** Short stage ran: G0 not failed and n ≥ 10; else null (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:19-21).
- **Denominator:** stated: window time. Computed: samples present.
- **Unit and scale:** displayed: % integer on bar and card; 0.00 fraction on Calculations; % to 0.1 on Windows and Investigation. Computed: fraction.
- **Thresholds:**
  - 0.50, 0.30 averaging. Source: profile via G3 (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:154). Colour: card tone follows G3.
  - 80, 50. Source: hardcoded (src/frontend-ob/src/components/Cpm/overview/GoodErrorBar.tsx:25). Colour: bar green, amber, red.
- **Staleness:** /cpm/explorer cards: no freshness rule; the newest row of any age is shown, the eyebrow names its end (src/services/cplm-api/Controllers/CpmLoopKpiController.cs:24-31; src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:38). Queue: as M-027.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: only in CalcDrawer (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:148-153,209-216) and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** Conflicts: UI says time, engine counts samples (same class as D-01). The bar turns red at 49 % on a LIC whose G3 passes at 30 % (D-16). Name "in band" against "Good-error time" against "Control performance".

### M-081

**Good-error band.** Status: **Undocumented**

- **Labels:** "tolerance band", "Tolerance band", "good band", "good-error band", "band {x}", "objective"
- **Surfaces:**
  - /cpm/evidence: G3 chart, tile and Explain (src/frontend-ob/src/components/Cpm/evidence/views/ShortViews.tsx:124-127; src/frontend-ob/src/components/Cpm/evidence/views/headlines.ts:60; src/frontend-ob/src/components/Cpm/evidence/whyRules.ts:120)
- **Displayed definitions:**
  - Chart meaning: "|error| <= {band} EU ({objective})" (src/frontend-ob/src/components/Cpm/evidence/views/ShortViews.tsx:126)
- **Engine calculation:** goodErrorBand() (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:234-239). Provenance objective_id = PROFILE_GOOD_ERROR_BAND (src/flink/src/main/java/com/ams/flink/cplm/evidence/ShortArtifacts.java:234-236).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:75.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24).
- **Eligibility:** G3 evidence retained.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: EU. Computed: EU.
- **Thresholds:**
  - 0.005 of span; 0.5 EU fallback. Source: profile G3.error_band_span_fraction (src/flink/src/main/java/com/ams/flink/cplm/config/BundleProfileMapper.java:53). Colour: none.
- **Staleness:** No staleness rule on this surface; the window end is shown.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: only in CalcDrawer (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:148-153,209-216) and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** The band width is not shown on the card or bar that use it; only in the Workbench. On an undeclared span 0.5 EU applies whatever the unit.

### M-082

**Control error MAE.** Status: **Engine-UI conflict**

- **Labels:** "Control error (MAE)", "MAE", "Mean absolute error", "MAE {x}", "errorPctOfSpan"
- **Surfaces:**
  - /cpm/explorer: card as % of span (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:138)
  - /cpm: fallback and tooltip (src/frontend-ob/src/components/Cpm/overview/GoodErrorBar.tsx:14,28)
  - /cpm/calculations: CPLM-010 (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:28)
  - /cpm/windows: panel (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:29)
- **Displayed definitions:**
  - Card sub: "of PV span · {mae} {unit} · {G3 status}" (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:140)
  - Card title: "Mean |PV − SP| over the window (CPLM-010) as % of the registered PV span (pvMax − pvMin), judged by G3." (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:141)
  - calcCatalogue: "Mean |PV − SP| over the window." (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:28)
- **Engine calculation:** mean(|SP − PV|) over samples, not time-weighted (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:184,235; src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:226-231).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:72; kpi_calculation_logic/KPI-LOGIC.md:175.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24).
- **Eligibility:** Short stage ran: G0 not failed and n ≥ 10; else null (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:19-21). Card needs a registered span (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:109,120).
- **Denominator:** stated: of PV span. Computed: pvMax − pvMin from the registry.
- **Unit and scale:** displayed: % of span on card; "PV units" on Calculations; raw with no unit in the queue fallback. Computed: PV EU.
- **Thresholds:**
  - none on MAE. Source: G3 reads good_error_pct only (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:281). Colour: card tone copied from G3 (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:138).
- **Staleness:** /cpm/explorer cards: no freshness rule; the newest row of any age is shown, the eyebrow names its end (src/services/cplm-api/Controllers/CpmLoopKpiController.cs:24-31; src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:38). No staleness rule on this surface; the window end is shown.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: only in CalcDrawer (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:148-153,209-216) and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** Conflicts: "judged by G3" and the catalogue gate G3; no gate reads MAE (D-07).

### M-083

**RMS control error.** Status: **Definition conflict**

- **Labels:** "RMSE", "Root-mean-square error", "RMS"
- **Surfaces:**
  - /cpm/calculations: CPLM-011 (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:29)
  - /cpm/windows: panel and comparison (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:30; src/frontend-ob/src/components/Cpm/windows/CompareAcrossKinds.tsx:19)
- **Displayed definitions:**
  - calcCatalogue: "RMS control error." (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:29)
- **Engine calculation:** sqrt(mean(e²)) over samples (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:236).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:72; kpi_calculation_logic/KPI-LOGIC.md:175 says the Control error card shows RMS too; the card shows MAE only (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:138-141).
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24).
- **Eligibility:** Short stage ran: G0 not failed and n ≥ 10; else null (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:19-21).
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: PV units. Computed: PV EU.
- **Thresholds:** none.
- **Staleness:** /cpm/explorer cards: no freshness rule; the newest row of any age is shown, the eyebrow names its end (src/services/cplm-api/Controllers/CpmLoopKpiController.cs:24-31; src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:38). No staleness rule on this surface; the window end is shown.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: only in CalcDrawer (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:148-153,209-216) and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** kpi_calculation_logic/KPI-LOGIC.md:175 and kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:314 describe a card value that is fetched (src/services/cplm-api/Controllers/CpmLoopKpiController.cs:35) and not rendered.

### M-084

**Integral absolute error.** Status: **Label only**

- **Labels:** "IAE", "Integral absolute error", "cumulative IAE"
- **Surfaces:**
  - /cpm/calculations: CPLM-012 (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:30)
  - /cpm/windows (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:31)
  - /cpm/historical: overlay at 15m (src/frontend-ob/src/components/Cpm/CpmHistorical.tsx:51)
  - /cpm/evidence: G3 chart (src/frontend-ob/src/components/Cpm/evidence/views/ShortViews.tsx:133)
- **Displayed definitions:**
  - calcCatalogue: "Accumulated absolute error." (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:30)
- **Engine calculation:** Σ|e|·Δt, zero-order hold across gaps, last sample one median interval (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:237-246,257-264).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:73.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24).
- **Eligibility:** Short stage ran: G0 not failed and n ≥ 10; else null (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:19-21).
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: PV·s on Calculations; EU·s on Historical. Computed: PV EU × s.
- **Thresholds:** none.
- **Staleness:** /cpm/explorer cards: no freshness rule; the newest row of any age is shown, the eyebrow names its end (src/services/cplm-api/Controllers/CpmLoopKpiController.cs:24-31; src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:38). No staleness rule on this surface; the window end is shown.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: only in CalcDrawer (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:148-153,209-216) and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** Unit string differs; same value.

### M-085

**Integral squared error.** Status: **Consistent**

- **Labels:** "ISE", "Integral squared error", "cumulative ISE"
- **Surfaces:**
  - /cpm/calculations: CPLM-013 (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:31)
  - /cpm/windows (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:32)
  - /cpm/evidence: G3 chart (src/frontend-ob/src/components/Cpm/evidence/views/ShortViews.tsx:134)
- **Displayed definitions:**
  - calcCatalogue: "Accumulated squared error." (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:31)
- **Engine calculation:** Σe²·Δt (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:263).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:73.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24).
- **Eligibility:** Short stage ran: G0 not failed and n ≥ 10; else null (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:19-21).
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: PV²·s. Computed: PV EU² × s.
- **Thresholds:** none.
- **Staleness:** /cpm/explorer cards: no freshness rule; the newest row of any age is shown, the eyebrow names its end (src/services/cplm-api/Controllers/CpmLoopKpiController.cs:24-31; src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:38). No staleness rule on this surface; the window end is shown.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: only in CalcDrawer (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:148-153,209-216) and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** Same.

### M-086

**ITAE.** Status: **Undocumented**

- **Labels:** "cumulative ITAE", "cumulative_itae"
- **Surfaces:**
  - /cpm/evidence: G3 chart (src/frontend-ob/src/components/Cpm/evidence/views/ShortViews.tsx:135)
- **Displayed definitions:**
  - None displayed.
- **Engine calculation:** Σ(t − windowStart)·|e|·Δt (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:261,264).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:74.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24).
- **Eligibility:** Short stage ran: G0 not failed and n ≥ 10; else null (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:19-21).
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: chart unit from artifact. Computed: PV EU × s².
- **Thresholds:** none.
- **Staleness:** No staleness rule on this surface; the window end is shown.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: only in CalcDrawer (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:148-153,209-216) and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** Shown only as an unlabelled raw column name; not in calcCatalogue.

### M-087

**PV variability.** Status: **Undocumented**

- **Labels:** "PV variability (2σ)", "σ {x}"
- **Surfaces:**
  - /cpm/explorer: card (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:142)
- **Displayed definitions:**
  - Card title: "2 × standard deviation of PV over the window as % of the PV span. Context, not pass / fail: level loops absorb swings by design." (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:144)
- **Engine calculation:** pv_std = population σ of PV (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:286-287; src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:252-260). Card: 2σ ÷ registered span × 100 (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:57).
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:176; kpi_calculation_logic/KPI-LOGIC.md:167-168.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24).
- **Eligibility:** Short stage ran: G0 not failed and n ≥ 10; else null (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:19-21). Needs a registered span.
- **Denominator:** stated: of PV span. Computed: pvMax − pvMin.
- **Unit and scale:** displayed: % of span. Computed: PV EU.
- **Thresholds:**
  - none. Source: context by design (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:142). Colour: grey.
- **Staleness:** /cpm/explorer cards: no freshness rule; the newest row of any age is shown, the eyebrow names its end (src/services/cplm-api/Controllers/CpmLoopKpiController.cs:24-31; src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:38). No staleness rule on this surface; the window end is shown.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: only in CalcDrawer (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:148-153,209-216) and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** Same. Not in calcCatalogue (docs/theme/cpa-currenttheme.md:1182).

### M-088

**Time at an OP limit.** Status: **Engine-UI conflict**

- **Labels:** "Time at an OP limit", "Time with OP fully open or closed", "Saturated samples", "limits: registered OP range", "limits: 0–100 % fallback", "Limit source", "saturation"
- **Surfaces:**
  - /cpm/explorer: card (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:145)
  - /cpm/kpi: deciding column (src/services/cplm-api/Services/Kpi/FleetKpiRows.cs:57)
  - /cpm/evidence: Explain row "Saturated samples" (src/frontend-ob/src/components/Cpm/evidence/whyRules.ts:107-108)
- **Displayed definitions:**
  - Card sub: "rule ≤ 10 % · limits: {basis}" (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:146)
  - Card title: "Time with OP fully open or closed ÷ window time. More than 10 % = no control authority (Bayer / PlantTriage)." (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:147)
- **Engine calculation:** Shown value: short stage, share of samples with OP ≤ satLowPct or ≥ satHighPct, 5 and 95 (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:277; src/flink/src/main/java/com/ams/flink/cplm/engine/LimitMath.java:47,61; src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionInputs.java:65). G10 uses a second computation on limitTolerancePp (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:221-225,233).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:78; kpi_calculation_logic/KPI-LOGIC.md:139 calls the source value REGISTRY, engine writes DECLARED_RANGE (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:224); kpi_calculation_logic/KPI-LOGIC.md:177.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24).
- **Eligibility:** Short stage ran, else the long value (src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionInputs.java:65).
- **Denominator:** stated: window time. Computed: samples.
- **Unit and scale:** displayed: % integer; deciding to 0.1. Computed: fraction.
- **Thresholds:**
  - 0.10. Source: hardcoded (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:41,146); server config for KPI (src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:9). Colour: amber above, grey at or below.
  - 5 and 95 pp. Source: profile satLowPct, satHighPct, not in the bundle map (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:201-202; src/flink/src/main/java/com/ams/flink/cplm/config/BundleProfileMapper.java:85). Colour: indirect.
- **Staleness:** /cpm/explorer cards: no freshness rule; the newest row of any age is shown, the eyebrow names its end (src/services/cplm-api/Controllers/CpmLoopKpiController.cs:24-31; src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:38). No staleness rule on this surface; the window end is shown.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: only in CalcDrawer (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:148-153,209-216) and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** Conflicts: "fully open or closed" against within 5 pp of either end, time against samples, two computations (D-10). Not in calcCatalogue (docs/theme/cpa-currenttheme.md:1183).

### M-089

**Longest dwell at a limit.** Status: **Label only**

- **Labels:** "longest dwell N min", "Time at an output limit", "dwell_events", "Dwell events"
- **Surfaces:**
  - /cpm/kpi: Also check (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:66)
  - /cpm/evidence: Explain row and G10 view (src/frontend-ob/src/components/Cpm/evidence/whyRules.ts:104-106; src/frontend-ob/src/components/Cpm/evidence/views/LongViews.tsx:204)
- **Displayed definitions:**
  - None displayed.
- **Engine calculation:** max episode duration at a limit (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:230-235).
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:139,144; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:105.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Long tier; recomputed from the rolling buffer.
- **Eligibility:** n ≥ 10 in the long tier (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:77-80).
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: min, or duration. Computed: s.
- **Thresholds:**
  - attention at G10.limit_dwell_warn_s. Source: config; effective default is 30 samples × Ts (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:237). Colour: none.
- **Staleness:** No staleness rule on this surface; the window end is shown.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: only in CalcDrawer (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:148-153,209-216) and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** Label clash: "Time at an output limit" here is the longest dwell in seconds; "Time at an OP limit" on the card is the share of the window.

### M-090

**OP travel per day.** Status: **Engine-UI conflict**

- **Labels:** "OP travel", "OP travel per day", "OP travel / day", "total OP movement per day", "OP travel N %/day", "command_total_variation"
- **Surfaces:**
  - /cpm/explorer: card (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:150)
  - /cpm/kpi: Also check (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:69)
  - /cpm/calculations: CPLM-021 (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:34)
  - /cpm/windows (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:35)
- **Displayed definitions:**
  - Card sub: "total OP movement per day · {G4 status}" (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:151)
  - Card title: "Sum of |ΔOP| scaled to one day (CPLM-021): valve wear, judged by G4." (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:152)
  - calcCatalogue: "Total actuator travel extrapolated to a day." (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:34)
  - GateCatalog: "OP travel is not valve travel." (src/services/cplm-api/Services/GateCatalog.cs:48)
- **Engine calculation:** Σ|ΔOP| × 24 ÷ window hours (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:182-194). OP normalised to 0-100 only when a range is declared (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:242-246).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:82; kpi_calculation_logic/KPI-LOGIC.md:178; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:554 (extrapolation on short windows).
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24).
- **Eligibility:** Short stage ran: G0 not failed and n ≥ 10; else null (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:19-21).
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: %/day. Computed: OP units per day; pp only with a declared or 0-100 range.
- **Thresholds:**
  - none on travel. Source: G4 ratio only (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:342-348). Colour: card tone copied from G4; STRONG grey (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:44-45,150).
- **Staleness:** /cpm/explorer cards: no freshness rule; the newest row of any age is shown, the eyebrow names its end (src/services/cplm-api/Controllers/CpmLoopKpiController.cs:24-31; src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:38). No staleness rule on this surface; the window end is shown.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: only in CalcDrawer (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:148-153,209-216) and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** Conflicts: "judged by G4" and "valve wear" (D-07); the engine says OP travel is not valve travel. Catalogue source says long, value comes from the aligned short stage (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsResult.java:305).

### M-091

**OP reversals per hour.** Status: **Engine-UI conflict**

- **Labels:** "OP reversals", "OP reversals per hour", "Reversals / h", "Reversals/h", "direction changes per hour", "N reversals/h", "reversal markers"
- **Surfaces:**
  - /cpm/explorer: card (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:153)
  - /cpm/kpi: Also check (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:70)
  - /cpm/calculations: CPLM-022 (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:35)
  - /cpm/windows (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:36)
  - /cpm/evidence: G4 view (src/frontend-ob/src/components/Cpm/evidence/views/ShortViews.tsx:153)
- **Displayed definitions:**
  - Card sub: "direction changes per hour · {G4 status}" (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:154)
  - Card title: "OP direction changes per hour (CPLM-022): valve wear, judged by G4." (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:155)
  - calcCatalogue: "Direction changes of the actuator." (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:35)
- **Engine calculation:** Sign changes of ΔOP with |ΔOP| > 1e-9 ÷ window hours (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:23,196-216). G4.reversal_deadband_pp maps to opDeadbandPct (src/flink/src/main/java/com/ams/flink/cplm/config/BundleProfileMapper.java:58), read only by the corner score (src/flink/src/main/java/com/ams/flink/cplm/engine/ShapeMath.java:282).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:83 says deadband 0.5 pp. The property says "Meaningful command movement threshold", consumer flink:short (src/flink/src/main/resources/cplm/gate-config/property-catalogue.json:1589,1602).
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24).
- **Eligibility:** Short stage ran: G0 not failed and n ≥ 10; else null (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:19-21).
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: /h. Computed: count per h.
- **Thresholds:**
  - 1e-9. Source: hardcoded (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:23). Colour: none.
  - none on reversals. Source: G4 ratio only. Colour: card tone copied from G4.
- **Staleness:** /cpm/explorer cards: no freshness rule; the newest row of any age is shown, the eyebrow names its end (src/services/cplm-api/Controllers/CpmLoopKpiController.cs:24-31; src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:38). No staleness rule on this surface; the window end is shown.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: only in CalcDrawer (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:148-153,209-216) and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** Conflicts: doc and property name a deadband the count does not use, so noise on OP counts as reversals (D-17). "judged by G4" as M-090.

### M-092

**Setpoint changes per hour.** Status: **Undocumented**

- **Labels:** "Setpoint changes", "operator / cascade setpoint activity", "SP change events"
- **Surfaces:**
  - /cpm/explorer: card (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:156)
  - /cpm/evidence: G2 view counts events (src/frontend-ob/src/components/Cpm/evidence/views/ShortViews.tsx:72-75)
- **Displayed definitions:**
  - Card title: "Setpoint changes per hour in the window. Context: frequent changes point at an operator compensating or a cascade master." (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:158)
- **Engine calculation:** count(|ΔSP| > 1e-6) ÷ window hours (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:22,173-180).
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:179.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24).
- **Eligibility:** Short stage ran: G0 not failed and n ≥ 10; else null (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:19-21).
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: /h. Computed: count per h.
- **Thresholds:**
  - 1e-6. Source: hardcoded (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:22). Colour: grey, context.
- **Staleness:** /cpm/explorer cards: no freshness rule; the newest row of any age is shown, the eyebrow names its end (src/services/cplm-api/Controllers/CpmLoopKpiController.cs:24-31; src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:38). No staleness rule on this surface; the window end is shown.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: only in CalcDrawer (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:148-153,209-216) and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** On a cascade slave every sample with a moving SP counts. Not in calcCatalogue (docs/theme/cpa-currenttheme.md:1184). G2 view counts events by another rule.

### M-093

**Data coverage.** Status: **Definition conflict**

- **Labels:** "Data coverage", "Completeness", "Completeness (%)", "Sample completeness", "N% full", "N of M samples"
- **Surfaces:**
  - /cpm/explorer: card (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:159)
  - /cpm/calculations: CPLM-001 (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:25)
  - /cpm/windows: list pill and detail (src/frontend-ob/src/components/Cpm/CpmWindows.tsx:188-189; src/frontend-ob/src/components/Cpm/windows/WindowDetail.tsx:177-178)
  - /cpm/kpi: deciding column (src/services/cplm-api/Services/Kpi/FleetKpiRows.cs:63)
- **Displayed definitions:**
  - Card title: "Samples received ÷ samples expected on the declared grid (CPLM-001). Below 95 % the window cannot be judged (G0)." (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:161)
  - calcCatalogue: "Fraction of expected samples present in the window." (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:25)
  - KPI_META: "completeness = samples ÷ (window ÷ grid)" (src/frontend-ob/src/components/Cpm/kpi/kpiMeta.ts:58)
- **Engine calculation:** n ÷ round(window s ÷ declared grid), falling back to the median observed period; not clamped (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:85-93).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:85; kpi_calculation_logic/KPI-LOGIC.md:149. kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:554 says measured against its own median Δt, code prefers the declared grid (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:77-86).
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24).
- **Eligibility:** Always written (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:81).
- **Denominator:** stated: samples expected on the declared grid. Computed: declared grid, else median of observed intervals.
- **Unit and scale:** displayed: % integer on card; "ratio" on Calculations; % on Windows. Computed: ratio, can exceed 1.
- **Thresholds:**
  - 0.95. Source: hardcoded card (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:42); profile G0.coverage_min. Colour: grey at or above, amber below.
  - 0.98. Source: profile (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:85). Colour: G0 PASS.
  - 0.9, 0.5. Source: hardcoded (src/frontend-ob/src/components/Cpm/CpmWindows.tsx:188). Colour: pill green, amber, red; declined windows show DECLINED instead.
- **Staleness:** /cpm/explorer cards: no freshness rule; the newest row of any age is shown, the eyebrow names its end (src/services/cplm-api/Controllers/CpmLoopKpiController.cs:24-31; src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:38). No staleness rule on this surface; the window end is shown.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: only in CalcDrawer (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:148-153,209-216) and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** Three threshold sets. A 96 % window reads a green "96% full" pill on /cpm/windows beside G0 WARN. The amber and red branches of the pill are reachable only on rows with no qualification flag, because a window below 0.95 is declined first (src/frontend-ob/src/components/Cpm/CpmWindows.tsx:185-191) (D-18).

### M-094

**Sample counts.** Status: **Label only**

- **Labels:** "Samples", "Sample count", "Actual samples", "Expected samples", "Samples in window", "N samples", "Accepted samples", "Samples evaluated in the window."
- **Surfaces:**
  - /cpm/calculations: CPLM-002 (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:26)
  - /cpm/windows: metadata (src/frontend-ob/src/components/Cpm/windows/WindowDetail.tsx:160-176)
  - /cpm/historical: panel (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:95)
  - /cpm/evidence: tile (src/frontend-ob/src/components/Cpm/evidence/views/headlines.ts:55)
- **Displayed definitions:**
  - calcCatalogue: "Samples evaluated in the window." (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:26)
- **Engine calculation:** n after half-open filter and dedupe (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:52,72,92). Fused row: long count, else short (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:283).
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:153; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:61.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24).
- **Eligibility:** Any row.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: count. Computed: count.
- **Thresholds:** none.
- **Staleness:** /cpm/explorer cards: no freshness rule; the newest row of any age is shown, the eyebrow names its end (src/services/cplm-api/Controllers/CpmLoopKpiController.cs:24-31; src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:38). No staleness rule on this surface; the window end is shown.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: only in CalcDrawer (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:148-153,209-216) and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** Same value. "Accepted samples" on G0 is a different count of mask-accepted points across roles.

### M-095

**Bad-quality share.** Status: **Label only**

- **Labels:** "bad quality N %", "Bad-quality samples"
- **Surfaces:**
  - /cpm/kpi: Also check and deciding (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:77; src/services/cplm-api/Services/Kpi/FleetKpiRows.cs:64)
- **Displayed definitions:**
  - Engine comment: "not-good share (UNKNOWN included, v2.5 R04)" (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:101)
- **Engine calculation:** count(quality ≠ GOOD) ÷ n, UNCERTAIN and UNKNOWN included (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:99-105).
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:150; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:62.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24).
- **Eligibility:** Always written (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:82).
- **Denominator:** stated: None. Computed: samples.
- **Unit and scale:** displayed: % to 0.1. Computed: fraction.
- **Thresholds:**
  - ≥ 0.50. Source: hardcoded (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:122); server text config (src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:11). Colour: none.
- **Staleness:** /cpm and /cpm/kpi: Fresh = (now − window_end) ≤ Cpm:Kpi:FreshSeconds, default 3600 s (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:30-31; src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:7).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: only in CalcDrawer (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:148-153,209-216) and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** "Bad" includes uncertain and unknown samples.

### M-096

**Longest gap.** Status: **Consistent**

- **Labels:** "longest gap N min"
- **Surfaces:**
  - /cpm/kpi: Also check when ≥ 60 s (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:76)
- **Displayed definitions:**
  - None displayed.
- **Engine calculation:** max Δt between samples (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:113-119).
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:153.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24).
- **Eligibility:** Always written.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: min. Computed: s.
- **Thresholds:**
  - 60 s to show. Source: hardcoded (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:76). Colour: none.
- **Staleness:** /cpm and /cpm/kpi: Fresh = (now − window_end) ≤ Cpm:Kpi:FreshSeconds, default 3600 s (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:30-31; src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:7).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: only in CalcDrawer (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:148-153,209-216) and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** Same.

### M-097

**Actuator effort ratio.** Status: **Engine-UI conflict**

- **Labels:** "Actuator effort ratio", "Effort ratio", "effort ratio N", "Actuator activity (effort ratio)", "Actuator activity (normalised to the PV span)"
- **Surfaces:**
  - /cpm/calculations: CPLM-020 (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:33)
  - /cpm/windows (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:34)
  - /cpm/kpi: Also check (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:68)
  - /cpm/investigation: key fact (src/frontend-ob/src/components/Cpm/investigation/keyFacts.ts:6)
  - /cpm/historical: overlay (src/frontend-ob/src/components/Cpm/CpmHistorical.tsx:50)
  - /cpm/evidence: Explain (src/frontend-ob/src/components/Cpm/evidence/whyRules.ts:71-74)
- **Displayed definitions:**
  - calcCatalogue: "OP travel relative to the error it corrects." (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:33)
- **Engine calculation:** σ(OP)/σ(PV), 0 when σPV ≤ 1e-12 (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:285-289). G4 judges activity_ratio_norm when a span is declared (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:324-335).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:80-81.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24).
- **Eligibility:** Short stage ran: G0 not failed and n ≥ 10; else null (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:19-21).
- **Denominator:** stated: "the error it corrects". Computed: σ(PV), not error.
- **Unit and scale:** displayed: ratio. Computed: OP units per PV unit, not dimensionless.
- **Thresholds:**
  - warn 3, high 8. Source: profile (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:156-157). Colour: via G4.
  - floor 0.03 to 0.05. Source: class pack (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfilePacks.java:96-139). Colour: indirect.
- **Staleness:** /cpm/explorer cards: no freshness rule; the newest row of any age is shown, the eyebrow names its end (src/services/cplm-api/Controllers/CpmLoopKpiController.cs:24-31; src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:38). No staleness rule on this surface; the window end is shown.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: only in CalcDrawer (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:148-153,209-216) and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** Conflicts: neither travel nor error enters. When a span is declared G4 compares a different number than the one catalogued under it, and CPLM-020 shows the raw ratio beside that verdict.

### M-098

**Oscillation period.** Status: **Definition conflict**

- **Labels:** "Oscillation period (ACF)", "Oscillation period", "ACF period", "ACF period (s)", "period N s", "period not measured (…)", "Not calculated"
- **Surfaces:**
  - /cpm/calculations: CPLM-030 (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:36)
  - /cpm/kpi: Also check (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:62)
  - /cpm/investigation: key fact (src/frontend-ob/src/components/Cpm/investigation/keyFacts.ts:8)
  - /cpm/evidence: G5 view (src/frontend-ob/src/components/Cpm/evidence/views/LongViews.tsx:52)
- **Displayed definitions:**
  - calcCatalogue: "Dominant period from the autocorrelation." (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:36)
  - metricAvailability: "A period of 0 s is never a measurement: no period was found (regularity 0 is a real "not regular")." (src/frontend-ob/src/components/Cpm/metricAvailability.ts:45)
- **Engine calculation:** Median of 2 × zero-crossing spacing × Ts (src/flink/src/main/java/com/ams/flink/cplm/engine/OscillationMath.java:70-79). validated_period_s = ACF if regular and in band, else FFT with fold (src/flink/src/main/java/com/ams/flink/cplm/engine/OscillationMath.java:265-300). /cpm/kpi serves validated period; Calculations and Investigation serve acf_period_s (src/services/cplm-api/Services/Kpi/FleetKpiRows.cs:94; src/frontend-ob/src/components/Cpm/calcCatalogue.ts:36).
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:118; kpi_calculation_logic/KPI-LOGIC.md:205; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:100.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Long tier; recomputed from the rolling buffer.
- **Eligibility:** n ≥ 10 in the long tier (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:77-80).
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: s or duration. Computed: s.
- **Thresholds:**
  - tauMin to tauMax. Source: class pack (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfilePacks.java:96-139). Colour: none.
- **Staleness:** No staleness rule on this surface; the window end is shown.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: only in CalcDrawer (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:148-153,209-216) and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** Differs: the label "Oscillation period" shows the raw ACF period on some pages and the validated period on /cpm/kpi; a raw period can show with status NO_VALID_CYCLE. Engine writes 0 not null (kpi_calculation_logic/KPI-LOGIC.md:205).

### M-099

**Oscillation regularity.** Status: **Consistent**

- **Labels:** "Oscillation regularity", "ACF regularity", "Regularity", "regularity N"
- **Surfaces:**
  - /cpm/calculations: CPLM-031 (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:37)
  - /cpm/kpi: Also check (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:63)
  - /cpm/evidence: Explain requirement (src/frontend-ob/src/components/Cpm/evidence/whyRules.ts:79)
- **Displayed definitions:**
  - calcCatalogue: "How regular the oscillation is (0–1)." (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:37)
- **Engine calculation:** min(1, median period ÷ 3σ(periods)), 1.0 when σ ≈ 0 (src/flink/src/main/java/com/ams/flink/cplm/engine/OscillationMath.java:82).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:100.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Long tier; recomputed from the rolling buffer.
- **Eligibility:** n ≥ 10 in the long tier (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:77-80).
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: 0 to 1, 2 dp. Computed: ratio.
- **Thresholds:**
  - 0.10. Source: profile G5.regularity_min (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:125). Colour: ✓ or ✕ in Explain.
- **Staleness:** No staleness rule on this surface; the window end is shown.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: only in CalcDrawer (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:148-153,209-216) and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** Same value everywhere.

### M-100

**Period validity.** Status: **Consistent**

- **Labels:** "No clean oscillation cycle", "NO_VALID_CYCLE", "period not measured", "Period outside the expected range"
- **Surfaces:**
  - /cpm/kpi: Also check (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:62)
  - /cpm/explorer: limitation (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:39)
- **Displayed definitions:**
  - LIMITATION: "No clean oscillation cycle: period and waveform shape not measured" (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:39)
- **Engine calculation:** VALID when ACF or FFT passes band and quality tests (src/flink/src/main/java/com/ams/flink/cplm/engine/OscillationMath.java:265-280); flag NO_VALID_CYCLE (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:163-165).
- **Documented logic:** kpi_calculation_logic/KPI-LOGIC.md:114,118-119.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Long tier; recomputed from the rolling buffer.
- **Eligibility:** n ≥ 10 in the long tier (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:77-80).
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: word. Computed: enum.
- **Thresholds:**
  - peak-to-median 3.0. Source: profile G6.peak_to_background_min (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:126). Colour: none.
- **Staleness:** No staleness rule on this surface; the window end is shown.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: only in CalcDrawer (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:148-153,209-216) and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** Same words on both surfaces; see M-009 for the meaning clash.

### M-101

**Harmonic ratios.** Status: **Consistent**

- **Labels:** "Harmonic amplitude ratio", "Harmonic energy ratio", "Harmonic amp ratio"
- **Surfaces:**
  - /cpm/calculations: CPLM-040, 041 (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:38-39)
  - /cpm/windows: long panel (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:47-48)
  - /cpm/historical: overlay (src/frontend-ob/src/components/Cpm/CpmHistorical.tsx:54)
- **Displayed definitions:**
  - calcCatalogue: "Harmonics vs fundamental amplitude." (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:38)
  - calcCatalogue: "Spectral energy in harmonics." (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:39)
- **Engine calculation:** (A2+A3+A5)/A1 and energy equivalent on the band spectrum (src/flink/src/main/java/com/ams/flink/cplm/engine/OscillationMath.java:199-200; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:101).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:101.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Long tier; recomputed from the rolling buffer.
- **Eligibility:** n ≥ 10 in the long tier (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:77-80).
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: ratio. Computed: ratio.
- **Thresholds:**
  - 0.15 amplitude ratio. Source: hardcoded (src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionEvidence.java:85). Colour: indirect.
- **Staleness:** No staleness rule on this surface; the window end is shown.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: only in CalcDrawer (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:148-153,209-216) and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** Same.

### M-102

**Triangularity.** Status: **Engine-UI conflict**

- **Labels:** "OP triangularity", "Triangularity", "OP triangularity (stiction)", "Triangular OP waveform (shape score)", "Stiction score", "cycle_score"
- **Surfaces:**
  - /cpm/calculations: CPLM-050 (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:40)
  - /cpm/windows (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:44)
  - /cpm/investigation: key fact (src/frontend-ob/src/components/Cpm/investigation/keyFacts.ts:7)
  - /cpm/historical: overlay (src/frontend-ob/src/components/Cpm/CpmHistorical.tsx:53)
  - /cpm/evidence: G7 view (src/frontend-ob/src/components/Cpm/evidence/views/LongViews.tsx:131)
- **Displayed definitions:**
  - calcCatalogue: "Triangular-wave similarity of the actuator trace (stiction shape)." (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:40)
- **Engine calculation:** Mean per-cycle score SSE_sine/(SSE_sine + SSE_tri) on the shape signal (src/flink/src/main/java/com/ams/flink/cplm/engine/ShapeMath.java:152,156; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:102). Shape signal = PV on integrating classes (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:110).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:102; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:112.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Long tier; recomputed from the rolling buffer.
- **Eligibility:** Valid period and enough samples per period.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: score. Computed: fraction.
- **Thresholds:**
  - 0.8. Source: profile (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:89). Colour: via G7.
  - 0.55. Source: hardcoded (src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionEvidence.java:88,124). Colour: indirect.
- **Staleness:** No staleness rule on this surface; the window end is shown.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: only in CalcDrawer (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:148-153,209-216) and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** Conflicts: labelled OP and "actuator trace"; on LIC and PIC gas the trace is PV.

### M-103

**Horch oddness.** Status: **Label only**

- **Labels:** "Horch oddness", "Lag asymmetry", "phi_positive / phi_negative"
- **Surfaces:**
  - /cpm/calculations: CPLM-060 (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:41)
  - /cpm/windows (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:45)
  - /cpm/evidence: G8 view (src/frontend-ob/src/components/Cpm/evidence/views/LongViews.tsx:147-151)
- **Displayed definitions:**
  - calcCatalogue: "Odd-symmetry of the PV–OP cross-correlation." (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:41)
  - G8 view: "This is a lag asymmetry index, not an odd-harmonic spectrum; it is supporting evidence and never decisive on its own." (src/frontend-ob/src/components/Cpm/evidence/views/LongViews.tsx:150)
- **Engine calculation:** oddSum/(oddSum + evenSum) (src/flink/src/main/java/com/ams/flink/cplm/engine/ShapeMath.java:203; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:103).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:103.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Long tier; recomputed from the rolling buffer.
- **Eligibility:** n ≥ 10 in the long tier (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:77-80).
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: score. Computed: fraction.
- **Thresholds:**
  - 0.7. Source: profile (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:90). Colour: via G8.
- **Staleness:** No staleness rule on this surface; the window end is shown.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: only in CalcDrawer (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:148-153,209-216) and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** Same value; name differs with G8 (M-054).

### M-104

**Corner score.** Status: **Label only**

- **Labels:** "Phase-portrait corner score (raw)", "Corner score", "Phase-portrait corners"
- **Surfaces:**
  - /cpm/calculations: CPLM-070 (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:45)
  - /cpm/windows (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:46)
  - /cpm/replay: G9 row (src/frontend-ob/src/components/Cpm/CpmReplay.tsx:54)
- **Displayed definitions:**
  - calcCatalogue: "Sharp-corner evidence in the PV–OP phase plot. CAUTION: the raw statistic reads high (~0.9) even on healthy noisy data; treat it only alongside the G9 verdict and phase-area band, never alone." (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:45)
- **Engine calculation:** Share of turning angle at corners; raw stored, qualified used by fusion (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:206-209; src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionEvidence.java:68-70).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:104.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Long tier; recomputed from the rolling buffer.
- **Eligibility:** n ≥ 10 in the long tier (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:77-80).
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: score. Computed: fraction.
- **Thresholds:**
  - 0.5 shape. Source: hardcoded (src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionEvidence.java:19). Colour: indirect.
- **Staleness:** No staleness rule on this surface; the window end is shown.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: only in CalcDrawer (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:148-153,209-216) and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** Calculations carries the caution; /cpm/windows and /cpm/replay show "Corner score" with no caution or "raw". The score fusion reads is not shown.

### M-105

**Cycle phase area.** Status: **Undocumented**

- **Labels:** "area", "Mean area", "bbox_area", "Cycle polygons", "Phase area outside the expected range"
- **Surfaces:**
  - /cpm/evidence: G9 view and tile (src/frontend-ob/src/components/Cpm/evidence/views/LongViews.tsx:171-174; src/frontend-ob/src/components/Cpm/evidence/views/headlines.ts:75)
- **Displayed definitions:**
  - None displayed.
- **Engine calculation:** Per-cycle shoelace area ÷ bounding box, normalised per cycle (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:200-205; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:104).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:104; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:327.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Long tier; recomputed from the rolling buffer.
- **Eligibility:** Valid cycles.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: fraction. Computed: ratio.
- **Thresholds:**
  - 0.05 to 1.5 or 2.0; 0.30 strong. Source: class pack and hardcoded (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:22). Colour: via G9.
- **Staleness:** No staleness rule on this surface; the window end is shown.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: only in CalcDrawer (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:148-153,209-216) and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** Not in calcCatalogue; the status-driving number of G9.

### M-106

**PV freeze index.** Status: **Undocumented**

- **Labels:** "Freeze index", "Freeze fraction", "PV freeze", "freeze_events", "Freeze events"
- **Surfaces:**
  - /cpm/investigation: key fact (src/frontend-ob/src/components/Cpm/investigation/keyFacts.ts:9)
  - /cpm/windows: long panel (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:50)
  - /cpm/evidence: Explain and G11 view (src/frontend-ob/src/components/Cpm/evidence/whyRules.ts:112-113; src/frontend-ob/src/components/Cpm/evidence/views/LongViews.tsx:229)
- **Displayed definitions:**
  - None displayed.
- **Engine calculation:** freeze_index_s = longest flat run samples × Ts; freeze_fraction = run ÷ n (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:246-247,261).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:84; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:106.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Long tier; recomputed from the rolling buffer.
- **Eligibility:** n ≥ 10 in the long tier (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:77-80).
- **Denominator:** stated: None stated. Computed: n samples.
- **Unit and scale:** displayed: duration; %. Computed: s; fraction.
- **Thresholds:**
  - 60 s and 10 %. Source: hardcoded (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:262). Colour: via G11.
- **Staleness:** No staleness rule on this surface; the window end is shown.
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: only in CalcDrawer (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:148-153,209-216) and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107).
- **Consistency:** Not in calcCatalogue. COALESCE to 0 in the long read makes a missing value a zero (src/services/cplm-api/Data/KpiSql.cs:28).

## Live signal

### M-107

**Live and last-stored PV, SP, OP.** Status: **Engine-UI conflict**

- **Labels:** "PV", "SP", "OP", "live", "from historian", "last stored N ago", "last received N ago", "no live publisher for this loop", "Live operating state", "Last stored samples"
- **Surfaces:**
  - /cpm: pills (src/frontend-ob/src/components/Cpm/overview/LoopFocus.tsx:51-53)
  - /cpm/explorer: tiles (src/frontend-ob/src/components/Cpm/explorer/summary/OperatingState.tsx:82-110)
- **Displayed definitions:**
  - Code comment: "OP is a percentage of span by definition in this engine. PV/SP carry no engineering unit in the registry." (src/frontend-ob/src/components/Cpm/explorer/summary/OperatingState.tsx:99-100)
- **Engine calculation:** Raw live value, else newest trend bucket, else last stored (src/frontend-ob/src/components/Cpm/explorer/summary/OperatingState.tsx:82-94). Engine normalises OP only when a range is declared (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:242-246); live and stored values are not normalised.
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:558 (no heartbeat on RBE); docs/theme/cpa-currenttheme.md:793.
- **Window and boundary:** Live RBE plus 8 h rolling trend, tick 60 s (src/frontend-ob/src/components/Cpm/shared.tsx:92-93).
- **Eligibility:** Live publisher or stored samples.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: OP shown with "%"; PV and SP without unit though the registry has pvUnit. Computed: raw engineering value.
- **Thresholds:**
  - 10 min. Source: hardcoded (src/frontend-ob/src/components/Cpm/FacetPill.tsx:43). Colour: none on tiles.
- **Staleness:** Older than 10 min reads "last received N ago" (src/frontend-ob/src/components/Cpm/explorer/summary/OperatingState.tsx:34-35).
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** Conflicts: "%" is hardcoded on a raw value (docs/theme/cpa-currenttheme.md:793); the comment claiming a percentage holds only for 0-100 sources. The comment also says the registry has no PV unit; the chart reads one (src/frontend-ob/src/components/Cpm/historical/chartOption.ts:66).

### M-108

**Controller mode now.** Status: **Definition conflict**

- **Labels:** "MODE", "MODE {x}", "mode never published · excluded at G1", "no live value, none stored"
- **Surfaces:**
  - /cpm: pill (src/frontend-ob/src/components/Cpm/overview/LoopFocus.tsx:54)
  - /cpm/explorer: tile (src/frontend-ob/src/components/Cpm/explorer/summary/OperatingState.tsx:114-131)
  - /cpm/historical: mode lane (src/frontend-ob/src/components/Cpm/CpmHistorical.tsx:145-156)
- **Displayed definitions:**
  - Mode note: "mode never published · excluded at G1" (src/frontend-ob/src/utils/modeVocabulary.ts:48)
- **Engine calculation:** Token as published; classification mirrors the engine in two client copies (src/frontend-ob/src/components/Cpm/shared.tsx:191-213; src/frontend-ob/src/utils/modeVocabulary.ts:14-33; src/flink/src/main/java/com/ams/flink/cplm/CplmNormalizedSample.java:227-244).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:63; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:556.
- **Window and boundary:** Live; lane on the selected range.
- **Eligibility:** MODE role mapped.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: token. Computed: token.
- **Thresholds:**
  - auto / manual / unknown. Source: hardcoded lists. Colour: lane: auto green, manual amber, unknown grey (src/frontend-ob/src/components/Cpm/CpmHistorical.tsx:148-149).
- **Staleness:** As M-107.
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** Three copies of one list. They differ on compound tokens: shared.tsx treats a *MAN* compound as manual, modeVocabulary as unrecognised. "excluded at G1" fires only below 0.70.

### M-109

**Signal quality.** Status: **Label only**

- **Labels:** "Signal quality", "Good", "Uncertain", "Bad", "Maintenance", "Out of service", "No signal", "Unknown", "Uncertain · last value N ago", "No live publisher"
- **Surfaces:**
  - /cpm: facet pill (src/frontend-ob/src/components/Cpm/overview/LoopFocus.tsx:55)
  - /cpm/explorer: source line (src/frontend-ob/src/components/Cpm/explorer/summary/OperatingState.tsx:138-142)
- **Displayed definitions:**
  - Facet hint: "Signal quality: whether the live PV measurement is trustworthy right now (OPC / NAMUR NE107 quality)" (src/frontend-ob/src/components/Cpm/FacetPill.tsx:28)
- **Engine calculation:** String tokens, else OPC numeric ≥ 192 good, ≥ 64 uncertain, else bad (src/frontend-ob/src/hooks/useLoopLive.ts:82-100). Stale GOOD becomes Uncertain (src/frontend-ob/src/components/Cpm/FacetPill.tsx:50-58).
- **Documented logic:** prod_decision.md:110; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:557 (numeric quality ignored by ingestion).
- **Window and boundary:** Live.
- **Eligibility:** Live value present.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: word. Computed: word.
- **Thresholds:**
  - 192, 64. Source: hardcoded (src/frontend-ob/src/hooks/useLoopLive.ts:99-100). Colour: green, amber, red, grey.
  - 10 min. Source: hardcoded (src/frontend-ob/src/components/Cpm/FacetPill.tsx:43). Colour: amber.
- **Staleness:** 10 min (src/frontend-ob/src/components/Cpm/FacetPill.tsx:43).
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** Same on both pages. Hint merges two vocabularies (docs/theme/cpa-currenttheme.md:787).

### M-110

**Instrument health.** Status: **Consistent**

- **Labels:** "Instrument health", "OK", "Limited", "Fault", "Not configured · not checked", "Unknown · not checked", "INSTRUMENTS OK", "INSTRUMENT FAULT", "HEALTH NOT CONFIGURED", "F", "C", "S", "M", "Eligibility since", "Collection", "Measurement impact"
- **Surfaces:**
  - /cpm/explorer: facet and panel (src/frontend-ob/src/components/Cpm/health/TransmitterHealthPanel.tsx:53-60,102-109)
  - /cpm/investigation: lane (src/frontend-ob/src/components/Cpm/CpmInvestigation.tsx:256-260)
  - /cpm/historical: lane (src/frontend-ob/src/components/Cpm/health/HealthLane.tsx:26-27)
  - /cpm/performance: filters (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:48-52)
- **Displayed definitions:**
  - Facet hint: "Instrument health: what the transmitter diagnostics report (NAMUR NE107). No source means not checked — missing diagnostics are not OK" (src/frontend-ob/src/components/Cpm/FacetPill.tsx:29)
  - Empty state: "No health data for this window — not checked (NE107: missing diagnostics are not OK)" (src/frontend-ob/src/components/Cpm/CpmInvestigation.tsx:259)
- **Engine calculation:** Per-role eligibility from the context job (src/flink/src/main/java/com/ams/flink/cplm/health/HealthEligibilityPolicy.java:1-63). INELIGIBLE PV excludes the window (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:141-144). Fleet filters (src/services/cplm-api/Data/FleetLatestSql.cs:71-96).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:226-236.
- **Window and boundary:** Health intervals; freshness timer 60 s (kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:236).
- **Eligibility:** Instrument bound.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: word, flags. Computed: enum.
- **Thresholds:**
  - INELIGIBLE, LIMITED, UNKNOWN. Source: engine policy. Colour: bad, warn, muted (src/frontend-ob/src/components/Cpm/health/TransmitterHealthPanel.tsx:57-60).
- **Staleness:** Collection state STALE stated (src/frontend-ob/src/components/Cpm/health/TransmitterHealthPanel.tsx:42,47).
- **Version:** Stamped: interpretation version. Shown: "NE107 interpretation v{n}" (src/frontend-ob/src/components/Cpm/health/TransmitterHealthPanel.tsx:109).
- **Consistency:** Same words across pages.

### M-111

**Trend series.** Status: **Label only**

- **Labels:** "Trend range", "rolling 8 h", "fixed period", "not an evaluated window", "envelope {from} → {to}", "N pens", "Normalised (÷ own span)", "PV keeps its min–max envelope", "OP / VP (%)"
- **Surfaces:**
  - /trend: TrendCore (src/frontend-ob/src/components/Designer/TrendPage.tsx:117-120)
  - /cpm: envelope (src/frontend-ob/src/components/Cpm/overview/LoopFocus.tsx:63)
  - /cpm/explorer (src/frontend-ob/src/components/Cpm/explorer/summary/OperatingState.tsx:145-146)
  - /cpm/historical (src/frontend-ob/src/components/Cpm/historical/RangeToolbar.tsx:186,210)
- **Displayed definitions:**
  - Toolbar title: "Show every signal as a fraction of its own observed span (the tooltip keeps the original values and units)" (src/frontend-ob/src/components/Cpm/historical/RangeToolbar.tsx:184)
- **Engine calculation:** Historian buckets: PV and OP averages, SP last value (src/frontend-ob/src/components/Cpm/explorer/summary/OperatingState.tsx:85-89). 240 to 300 buckets (src/frontend-ob/src/components/Cpm/overview/LoopFocus.tsx:33; src/frontend-ob/src/components/Cpm/CpmHistorical.tsx:118).
- **Documented logic:** Not determined: no metric definition; not a calculation.
- **Window and boundary:** Default 8 h rolling; Historical default 3 days (src/frontend-ob/src/components/Cpm/CpmHistorical.tsx:99).
- **Eligibility:** Stored samples.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: pvUnit or EU; OP/VP axis "%". Computed: raw.
- **Thresholds:** none.
- **Staleness:** Rolling; tick 60 s.
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** OP axis "%" as M-107 (docs/theme/cpa-currenttheme.md:793).

### M-112

**KPI overlay series.** Status: **Label only**

- **Labels:** "KPI overlay", "Actuator effort ratio · 15m", "Integral absolute error · 15m", "Good-error time · 15m", "OP triangularity (stiction) · 12h", "Harmonic energy ratio · 12h"
- **Surfaces:**
  - /cpm/historical: overlay lane (src/frontend-ob/src/components/Cpm/CpmHistorical.tsx:49-55; src/frontend-ob/src/components/Cpm/historical/RangeToolbar.tsx:190-197)
- **Displayed definitions:**
  - None displayed.
- **Engine calculation:** Stored short or long row series (src/frontend-ob/src/components/Cpm/CpmHistorical.tsx:119). Capped at 500 rows (src/frontend-ob/src/components/Cpm/CpmHistorical.tsx:58).
- **Documented logic:** Not determined.
- **Window and boundary:** 15m sliding or 12h, by overlay; not the page fused window.
- **Eligibility:** Rows in range.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: as declared on overlay. Computed: as stored.
- **Thresholds:** none.
- **Staleness:** No staleness rule on this surface; the window end is shown.
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** The 12h overlays stay 12h when the verdict lane is switched to 24h (src/frontend-ob/src/components/Cpm/CpmHistorical.tsx:53-54,68).

## Windows page

### M-113

**Window contract.** Status: **Consistent**

- **Labels:** "Size / slide", "Allowed lateness", "Minimum samples", "Late events", "Out-of-order events", "Watermark lag", "1 min tumbling", "5 min / 1 min slide", "24 h slice · 15 min cadence", "Verdicts fuse on 12h / 24h rolling windows (recomputed every 15 min)"
- **Surfaces:**
  - /cpm/windows: metadata (src/frontend-ob/src/components/Cpm/windows/WindowDetail.tsx:155-193)
  - /cpm/performance: note (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:186-191)
- **Displayed definitions:**
  - WindowCatalog note: "Gate results are produced only for 12h and 24h windows: fusion fires on long records." (src/services/cplm-api/Services/WindowCatalog.cs:75)
  - Row: "— (DG-4: not recorded by the jobs)" (src/frontend-ob/src/components/Cpm/windows/WindowDetail.tsx:192)
- **Engine calculation:** Hand-kept mirror of job specs (src/services/cplm-api/Services/WindowCatalog.cs:3-13,25-40; src/flink/src/main/java/com/ams/flink/cplm/ShortWindowSpecs.java:54-60).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:41-49.
- **Window and boundary:** n/a
- **Eligibility:** n/a
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: duration. Computed: ms.
- **Thresholds:** none.
- **Staleness:** None.
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** Same values in catalogue, engine and doc at this commit. Mirror is manual.

### M-114

**Sample density.** Status: **Undocumented**

- **Labels:** "Sample density", "Raw historian coverage across the window", "N raw points", "amber = sparse", "grey = empty", "hatched = not fetched"
- **Surfaces:**
  - /cpm/windows: strip (src/frontend-ob/src/components/Cpm/windows/WindowDetail.tsx:222-255)
- **Displayed definitions:**
  - Legend: "{n} buckets · full-height = 100% of the {grid} s-grid budget (engine-reported) · amber = sparse · grey = empty" (src/frontend-ob/src/components/Cpm/windows/WindowDetail.tsx:251-252)
- **Engine calculation:** Client count of raw PV points into 24 buckets ÷ expected (src/frontend-ob/src/components/Cpm/windows/WindowDetail.tsx:69-94). Page cap 5000 points (src/frontend-ob/src/components/Cpm/windows/WindowDetail.tsx:58).
- **Documented logic:** Not determined: not in KL or KA.
- **Window and boundary:** Selected window; browser computed.
- **Eligibility:** Raw samples.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: % of grid budget. Computed: ratio.
- **Thresholds:**
  - 0.6 sparse. Source: hardcoded (src/frontend-ob/src/components/Cpm/windows/WindowDetail.tsx:101,243). Colour: amber.
  - 5 s fallback. Source: hardcoded (src/frontend-ob/src/components/Cpm/windows/windowMath.ts:8). Colour: none.
- **Staleness:** No staleness rule on this surface; the window end is shown.
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** Uses the measured sample_period_sec, while completeness uses the declared grid, so the two can disagree on one window (src/frontend-ob/src/components/Cpm/windows/WindowDetail.tsx:65; src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:75-86).

### M-115

**Across window sizes statistics.** Status: **Undocumented**

- **Labels:** "Latest {metric}", "Median (last 12)", "Range (last 12)", "Windows", "N declined"
- **Surfaces:**
  - /cpm/windows: table (src/frontend-ob/src/components/Cpm/windows/CompareAcrossKinds.tsx:98-102)
- **Displayed definitions:**
  - Note: "Statistics are per window kind over its latest 12 emitted windows; declined windows are excluded. Kinds other than 1m are sliding windows whose samples overlap — values are comparable side by side but must never be summed across rows." (src/frontend-ob/src/components/Cpm/windows/CompareAcrossKinds.tsx:116-119)
- **Engine calculation:** Client statistics over 12 short rows; median takes the upper-middle element (src/frontend-ob/src/components/Cpm/windows/CompareAcrossKinds.tsx:38-43).
- **Documented logic:** Not determined.
- **Window and boundary:** Latest 12 rows of each short kind.
- **Eligibility:** Rows not declined.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: per metric. Computed: per metric.
- **Thresholds:** none.
- **Staleness:** No staleness rule on this surface; the window end is shown.
- **Version:** Stamped: not determined; no version field on this value. Shown: no.
- **Consistency:** Single surface. Median differs from the server median on even counts (src/services/cplm-api/Services/Kpi/FleetKpiPerformance.cs:49-55).

## Calculations page

### M-116

**Calculations page tallies.** Status: **Definition conflict**

- **Labels:** "Metrics stored for {loop}", "Evidence gates in the pack", "Gates acceptable", "Gates needing review", "Gates not evaluated", "N findings or attention · N checks failed · N clear · N not evaluated or not usable"
- **Surfaces:**
  - /cpm/calculations: tiles (src/frontend-ob/src/components/Cpm/CpmCalculations.tsx:272-280)
  - /cpm/explorer: fused line (src/frontend-ob/src/components/Cpm/explorer/summary/SummaryCalculations.tsx:60)
- **Displayed definitions:**
  - None displayed.
- **Engine calculation:** Tally over gates that appear in METRICS: G0, G1, G3 to G9, G15 = 10 gates (src/frontend-ob/src/components/Cpm/CpmCalculations.tsx:204-215; src/frontend-ob/src/components/Cpm/calcCatalogue.ts:24-47). "In the pack" comes from the served catalogue of 17 (src/frontend-ob/src/components/Cpm/CpmCalculations.tsx:275). Explorer counts by mark meaning; detected and classified fall into the last bucket (src/frontend-ob/src/components/Cpm/explorer/summary/SummaryCalculations.tsx:45-52).
- **Documented logic:** Not determined.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55).
- **Eligibility:** Selected loop.
- **Denominator:** stated: x/y beside "17 in the pack". Computed: y = 10.
- **Unit and scale:** displayed: count. Computed: count.
- **Thresholds:**
  - review > 0. Source: hardcoded (src/frontend-ob/src/components/Cpm/CpmCalculations.tsx:279). Colour: amber.
- **Staleness:** No staleness rule on this surface; the window end is shown.
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** Differs: seven gates never enter the tally. A DETECTED G15 counts under "not evaluated or not usable".

### M-117

**Gate result column on a metric.** Status: **Engine-UI conflict**

- **Labels:** "Gate result", "G3 attention · this value not measured", "Not evaluated", "Not measured — …", "Insufficient data", "N/A", "Not calculated", "Not qualified", "Not scored"
- **Surfaces:**
  - /cpm/calculations: column (src/frontend-ob/src/components/Cpm/CpmCalculations.tsx:307,338)
  - /cpm/calculations: value column (src/frontend-ob/src/components/Cpm/CpmCalculations.tsx:329-331)
  - /cpm/investigation: key facts (src/frontend-ob/src/components/Cpm/CpmInvestigation.tsx:310-315)
- **Displayed definitions:**
  - Column title: "The verdict of the gate that judges this metric, on the same window. Sorts needing attention first." (src/frontend-ob/src/components/Cpm/CpmCalculations.tsx:307)
  - Excluded reason: "loop not in automatic — the window was excluded" (src/frontend-ob/src/components/Cpm/metricAvailability.ts:63)
  - Insufficient reason: "too few qualified samples in the window" (src/frontend-ob/src/components/Cpm/metricAvailability.ts:65)
- **Engine calculation:** metricAvailability decides from diagnosis, gate, flags (src/frontend-ob/src/components/Cpm/metricAvailability.ts:60-97). Replicates the gate cell per metric (src/frontend-ob/src/components/Cpm/CpmCalculations.tsx:145-158).
- **Documented logic:** prod_decision.md:121.
- **Window and boundary:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55).
- **Eligibility:** Selected loop.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: word. Computed: word.
- **Thresholds:** none.
- **Staleness:** No staleness rule on this surface; the window end is shown.
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** Conflicts: startsWith("INSUFFICIENT") treats INSUFFICIENT_EVIDENCE as "too few qualified samples" (src/frontend-ob/src/components/Cpm/metricAvailability.ts:64). Loop KPI cards do not apply this logic, so a value hidden as N/A on Calculations shows as a number on the Explorer card for the same row (D-19). "judges this metric" is false for MAE, travel, reversals.

## Provenance

### M-118

**Calculation and profile version.** Status: **Definition conflict**

- **Labels:** "Calculation version", "Stamped on this value", "Deployed now", "Dynamics profile", "Calculation", "Calculation engine", "Is this value current?", "calc {v}"
- **Surfaces:**
  - /cpm/calculations: drawer (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:148-153,208-222)
  - /cpm/historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107)
  - /cpm/events (src/frontend-ob/src/components/Cpm/events/EventDetail.tsx:145-146)
  - /cpm/replay (src/frontend-ob/src/components/Cpm/CpmReplay.tsx:301-304)
  - /cpm/explorer: Relationships (src/frontend-ob/src/components/Cpm/explorer/RelationshipsTab.tsx:43)
  - /cpm/governance (src/frontend-ob/src/components/Cpm/CpmGovernance.tsx:203-206)
- **Displayed definitions:**
  - Stale note: "This value was produced by v{stamped}, but the engine now deployed is v{deployed} — recompute the window before citing it as current evidence." (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:219-220)
  - Server comment: "v2.5 R26/C07: version labels do not identify behaviour; the newest row's build identity rides along" (src/services/cplm-api/Controllers/CpmEventsController.cs:161)
- **Engine calculation:** Constant 3.0.0 and 2.0.0, or the pack value (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:16-17; src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfilePacks.java:155-158). "Deployed now" = version on the newest stored row (src/services/cplm-api/Controllers/CpmEventsController.cs:134,159).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:90 not applicable; prod_decision.md:34 records jar per release.
- **Window and boundary:** Per row.
- **Eligibility:** Stamped rows.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: v{x}. Computed: string.
- **Thresholds:**
  - stamped ≠ deployed. Source: client compare (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:172). Colour: amber pill, else green.
- **Staleness:** Compare to the newest row.
- **Version:** This is the version field.
- **Consistency:** Differs: the green "current" pill compares a label the server comment says does not identify behaviour. The constant has stayed 3.0.0 while fusion code changed (CHG-094 band change at src/flink/src/main/java/com/ams/flink/cplm/fusion/DiagnosisBands.java:49). "Deployed now" reads stored rows, not the running job. Build identity is on the Workbench only.

### M-119

**Gate observed in stored results.** Status: **Undocumented**

- **Labels:** "Observed", "Never observed", "NOT YET OBSERVED", "N gates (M observed)", "Gate G in stored results"
- **Surfaces:**
  - /cpm/calculations: drawer (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:231-237)
  - /cpm/performance: panel (src/frontend-ob/src/components/Cpm/GateEvidencePanel.tsx:129-134)
  - /cpm/explorer: Relationships (src/frontend-ob/src/components/Cpm/explorer/RelationshipsTab.tsx:23-25)
- **Displayed definitions:**
  - None displayed.
- **Engine calculation:** Keys seen in the newest 2000 rows (src/services/cplm-api/Controllers/CpmEventsController.cs:124-126,175).
- **Documented logic:** Not determined.
- **Window and boundary:** Newest 2000 gate rows.
- **Eligibility:** n/a
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: word. Computed: boolean.
- **Thresholds:** none.
- **Staleness:** None.
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** Same on all surfaces.

## Events

### M-120

**Episode counts by state.** Status: **Consistent**

- **Labels:** "All", "Open", "Unobservable", "Unacknowledged", "Acknowledged", "Shelved", "Shelf expired", "Closed", "N event(s)", "N matching event(s)"
- **Surfaces:**
  - /cpm/events: tabs (src/frontend-ob/src/components/Cpm/CpmEvents.tsx:129-133,165)
- **Displayed definitions:**
  - Page copy: "One row is one episode of one fault family — a change in its evidence score extends it rather than duplicating it." (src/frontend-ob/src/components/Cpm/CpmEvents.tsx:111)
- **Engine calculation:** Server predicates per tab (src/services/cplm-api/Data/EventPageSql.cs:33-44), mirrored by the client (src/frontend-ob/src/components/Cpm/events/shelfState.ts:92-104).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:240-249; prod_decision.md:117.
- **Window and boundary:** All retained episodes. UI poll 30 s (src/frontend-ob/src/components/Cpm/events/useEventPage.ts:10,14).
- **Eligibility:** Scope, loop, search.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: count. Computed: count.
- **Thresholds:** none.
- **Staleness:** None.
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** Tabs overlap by design. A second filter list with fewer tabs remains in the code (src/frontend-ob/src/components/Cpm/events/eventsState.ts:61-68); not rendered.

### M-121

**Episode peak and current result.** Status: **Consistent**

- **Labels:** "Peak: {label}", "Now: {label}", "Peak evidence score", "peak evidence score N", "Fault family"
- **Surfaces:**
  - /cpm/events: row and detail (src/frontend-ob/src/components/Cpm/CpmEvents.tsx:226,239; src/frontend-ob/src/components/Cpm/events/EventDetail.tsx:101-103)
  - /cpm/explorer: History (src/frontend-ob/src/components/Cpm/explorer/HistoryTab.tsx:155-161)
  - /cpm: event trail (src/frontend-ob/src/components/Cpm/CpmOverview.tsx:186)
- **Displayed definitions:**
  - None displayed.
- **Engine calculation:** peak ratchets up on the episode family only (src/services/cplm-api/Services/EventFrameLifecycle.cs:190-194); last_diagnosis follows (src/services/cplm-api/Services/EventFrameLifecycle.cs:195-196).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:244.
- **Window and boundary:** Episode life.
- **Eligibility:** Fault verdict opened a frame.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: label, 0 to 100. Computed: fraction.
- **Thresholds:** none.
- **Staleness:** Availability state (M-124).
- **Version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown in detail (src/frontend-ob/src/components/Cpm/events/EventDetail.tsx:145-146).
- **Consistency:** Same words on the three surfaces.

### M-122

**Episode windows and qualified support.** Status: **Consistent**

- **Labels:** "N non-overlapping window(s) · X h of qualified support", "N evaluation window(s)", "N × 12h window(s)", "Qualified support", "N runs from M episodes"
- **Surfaces:**
  - /cpm/events: sentence (src/frontend-ob/src/components/Cpm/events/eventsState.ts:52-57)
  - /cpm/explorer: History (src/frontend-ob/src/components/Cpm/explorer/HistoryTab.tsx:160)
  - /cpm/evidence: G15 row (src/frontend-ob/src/components/Cpm/evidence/views/FusionViews.tsx:94)
- **Displayed definitions:**
  - Lifecycle comment: "Overlapping windows add only their non-overlapping support and do not bump the window count, so a sliding window reported every 15 minutes cannot inflate persistence." (src/services/cplm-api/Services/EventFrameLifecycle.cs:72-73)
- **Engine calculation:** Window count +1 when the window starts after support end; support adds the non-overlapping part × support fraction (src/services/cplm-api/Services/EventFrameLifecycle.cs:183-202). qualified_support = samples × period, bounded (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:284-287).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:243-246.
- **Window and boundary:** Episode life.
- **Eligibility:** Open or closed frame.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: count, h or d. Computed: count, ms.
- **Thresholds:** none.
- **Staleness:** None.
- **Version:** Stamped: not determined; no version field on this value. Shown: no.
- **Consistency:** Same. History multiplies runs of frames by adding counts.

### M-123

**Episode condition.** Status: **Consistent**

- **Labels:** "Condition", "OPEN", "CLOSED", "still open", "closed {t}", "Closed · unacked", "Recovered", "Family changed"
- **Surfaces:**
  - /cpm/events: detail (src/frontend-ob/src/components/Cpm/events/EventDetail.tsx:132-135)
  - /cpm/explorer: History span text (src/frontend-ob/src/components/Cpm/explorer/HistoryTab.tsx:101-104)
- **Displayed definitions:**
  - Copy: "Closed by an evaluable, fault-free result with enough qualified support." (src/frontend-ob/src/components/Cpm/events/eventsState.ts:42)
  - Copy: "Closed because a different fault family took over the loop." (src/frontend-ob/src/components/Cpm/events/eventsState.ts:44)
- **Engine calculation:** Close RECOVERED when a clear result rests on ≥ recovery support, FAMILY_CHANGED after 3 windows (src/services/cplm-api/Services/EventFrameLifecycle.cs:81-83,122-136,151).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:246-247.
- **Window and boundary:** Episode life.
- **Eligibility:** n/a
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: word. Computed: enum.
- **Thresholds:**
  - 21600 s. Source: profile G15.recovery_support_s (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:185). Colour: none.
  - 3 windows. Source: hardcoded default (src/services/cplm-api/Services/EventFrameLifecycle.cs:81). Colour: none.
- **Staleness:** None.
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** Same.

### M-124

**Episode availability.** Status: **Consistent**

- **Labels:** "Availability", "Observed", "Unobservable", "Availability unknown", "open, unobservable"
- **Surfaces:**
  - /cpm/events: pill and detail (src/frontend-ob/src/components/Cpm/CpmEvents.tsx:241; src/frontend-ob/src/components/Cpm/events/EventDetail.tsx:136-139)
  - /cpm/calculations: drawer history (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:284)
- **Displayed definitions:**
  - Copy: "Still open: the newest window could not be judged (excluded or insufficient data), so the condition has NOT recovered." (src/frontend-ob/src/components/Cpm/events/eventsState.ts:48)
- **Engine calculation:** UNOBSERVABLE when the newest result is EXCLUDED*, INSUFFICIENT_DATA or empty (src/services/cplm-api/Services/EventFrameLifecycle.cs:85-87,112-120).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:245.
- **Window and boundary:** Newest result.
- **Eligibility:** Open frame.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: word. Computed: enum.
- **Thresholds:**
  - state. Source: code. Colour: Unobservable amber, unknown grey (src/frontend-ob/src/components/Cpm/events/eventsState.ts:30-31).
- **Staleness:** None.
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** Same.

### M-125

**Acknowledgement and shelf state.** Status: **Consistent**

- **Labels:** "Acknowledged", "Unacknowledged", "Not yet reviewed", "Shelved · expires in N", "Shelf expired", "Shelf expired · unreviewed", "Returned", "Closed · unacked", "site limit N h"
- **Surfaces:**
  - /cpm/events: state pill and detail (src/frontend-ob/src/components/Cpm/events/shelfState.ts:58-68; src/frontend-ob/src/components/Cpm/events/EventDetail.tsx:150-160)
  - /cpm: Acknowledged pill (src/frontend-ob/src/components/Cpm/overview/PriorityQueue.tsx:82)
- **Displayed definitions:**
  - None displayed.
- **Engine calculation:** ack_state and shelf_state stored separately; expiry judged against the clock (src/frontend-ob/src/components/Cpm/events/shelfState.ts:19-26). Limit from server policy (src/services/cplm-api/Services/ShelvingOptions.cs:8).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:248.
- **Window and boundary:** Now. Sweep 60 s.
- **Eligibility:** Open frame for a shelf.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: word, duration. Computed: enum.
- **Thresholds:**
  - 168 h fallback. Source: hardcoded (src/frontend-ob/src/components/Cpm/events/EventDetail.tsx:29). Colour: none.
  - presets 1, 8, 24, 168 h. Source: hardcoded (src/frontend-ob/src/components/Cpm/events/shelfState.ts:30-35). Colour: none.
- **Staleness:** None.
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** Same. Acknowledged is green (src/frontend-ob/src/components/Cpm/shared.tsx:259), a guide-status question for Q6.

### M-126

**Fast conditions.** Status: **Undocumented**

- **Labels:** "Conditions · N open", "Freeze", "Limit low", "Limit high", "Since", "Duration", "Close reason", "stale · last update N ago", "detected within a minute, before the next fused window"
- **Surfaces:**
  - /cpm/events: table (src/frontend-ob/src/components/Cpm/events/ConditionsPanel.tsx:59-90)
- **Displayed definitions:**
  - None displayed.
- **Engine calculation:** Condition engine events (src/flink/src/main/java/com/ams/flink/cplm/condition/ConditionDetector.java:1-167), fed to G10 and G11 (src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionInputs.java:149-162).
- **Documented logic:** Not determined in KL; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:571 lists the file.
- **Window and boundary:** Live. UI poll 30 s (src/frontend-ob/src/components/Cpm/events/useConditions.ts:6).
- **Eligibility:** Scope.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: count, age, duration. Computed: ms.
- **Thresholds:**
  - 10 min. Source: hardcoded (src/frontend-ob/src/components/Cpm/events/ConditionsPanel.tsx:16). Colour: OPEN amber; stale grey.
- **Staleness:** Open with no update for 10 min reads stale (src/frontend-ob/src/components/Cpm/events/ConditionsPanel.tsx:15-16,43).
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** Single surface. Text "within a minute" not measured.

## Evidence

### M-127

**Evidence readiness and basis.** Status: **Undocumented**

- **Labels:** "Evidence", "COMPLETE", "PENDING", "FAILED", "EXPIRED", "Retained proof", "Rebuilt evidence", "Reconstructed evidence", "Evaluated from the historian", "No arrays held", "N artifact(s) differ from the retained proof", "Kept 3 days", "Age computed N ago", "Mode"
- **Surfaces:**
  - /cpm/evidence: header facts (src/frontend-ob/src/components/Cpm/evidence/EvidenceHeaderStrip.tsx:58-69)
  - /cpm/evidence: basis bar (src/frontend-ob/src/components/Cpm/evidence/EvidenceBasisBar.tsx:28-41)
  - /cpm/evidence: evaluate hint (src/frontend-ob/src/components/Cpm/evidence/EvaluateWindow.tsx:62)
- **Displayed definitions:**
  - Basis: "The live engine's own arrays for this run, kept by the retention policy." (src/frontend-ob/src/components/Cpm/evidence/evidenceBasis.ts:94)
  - Basis: "Verdicts come only from the live engine; a rebuild re-creates the arrays, not the verdict." (src/frontend-ob/src/components/Cpm/evidence/evidenceBasis.ts:83)
- **Engine calculation:** Manifest readiness from cplm-api; basis derived client side (src/frontend-ob/src/components/Cpm/evidence/evidenceBasis.ts:72-95).
- **Documented logic:** prod_decision.md:47-49,69.
- **Window and boundary:** Per run.
- **Eligibility:** Run with artifacts.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: word. Computed: enum.
- **Thresholds:**
  - readiness. Source: code. Colour: COMPLETE green, FAILED red, else grey (src/frontend-ob/src/components/Cpm/evidence/EvidenceHeaderStrip.tsx:43).
  - "Kept 3 days". Source: hardcoded text (src/frontend-ob/src/components/Cpm/evidence/EvaluateWindow.tsx:62; src/frontend-ob/src/components/Cpm/evidence/evidenceBasis.ts:79); actual value in retention_policy (prod_decision.md:48). Colour: none.
- **Staleness:** "computed N ago" (src/frontend-ob/src/components/Cpm/evidence/EvidenceHeaderStrip.tsx:68).
- **Version:** Stamped: run identity. Shown: Explain identity (src/frontend-ob/src/components/Cpm/evidence/gateFacts.ts:71-83).
- **Consistency:** Same. The retention text is hardcoded against a configurable row.

### M-128

**Measured against required.** Status: **Engine-UI conflict**

- **Labels:** "Measured vs required", "no threshold configured for this profile", "attention at N · high at M", "below the attention level", "≥ N required", "Thresholds: {profile} profile"
- **Surfaces:**
  - /cpm/evidence: Explain (src/frontend-ob/src/components/Cpm/evidence/ExplainWhy.tsx:75-94)
- **Displayed definitions:**
  - Code comment: "A threshold the profile does not configure is said so, never invented." (src/frontend-ob/src/components/Cpm/evidence/whyRules.ts:6-7)
  - Fallback: "no threshold configured for this profile" (src/frontend-ob/src/components/Cpm/evidence/whyRules.ts:38)
- **Engine calculation:** Rows from the fused row and the effective config (src/frontend-ob/src/components/Cpm/evidence/whyRules.ts:63-135). The effective config is fetched only with cpm.config.read (src/frontend-ob/src/components/Cpm/evidence/ExplainWhy.tsx:43-49).
- **Documented logic:** prod_decision.md:120.
- **Window and boundary:** Selected run.
- **Eligibility:** Fusion tier row.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: per row. Computed: per row.
- **Thresholds:**
  - Per gate. Source: row copy, else effective config. Colour: ✓ green, ✕ red (src/frontend-ob/src/components/Cpm/evidence/ExplainWhy.tsx:82).
- **Staleness:** Thresholds as in force at the run time.
- **Version:** Stamped: bundle version in the source line, for permitted users only (src/frontend-ob/src/components/Cpm/evidence/ExplainWhy.tsx:92-94).
- **Consistency:** Conflicts: without cpm.config.read, c() returns null and a configured threshold reads "no threshold configured for this profile" (D-20). Rows for G5, G6, G15 are not the rule that set the status (D-12, M-052, M-074).

## System response

### M-129

**Response event state.** Status: **Consistent**

- **Labels:** "Response events (N)", "Show N censored candidates", "Candidate censored", "Rejected", "Ineligible", "WAITING", "CENSORED", "Steps A–H", "Eligibility", "Event capture", "Observed metrics", "Estimation", "Validation", "Controller / frequency", "Model comparison", "Advisory"
- **Surfaces:**
  - /cpm/response: list and aside (src/frontend-ob/src/components/Cpm/response/EventList.tsx:33-38; src/frontend-ob/src/components/Cpm/response/EventAside.tsx:73-90)
- **Displayed definitions:**
  - List title: "Censored candidates were superseded by a later change or hit a source gap" (src/frontend-ob/src/components/Cpm/response/EventList.tsx:36)
- **Engine calculation:** Capture state machine and subgates (src/flink/src/main/java/com/ams/flink/cplm/response/event/CaptureStateMachine.java:1-153; src/flink/src/main/java/com/ams/flink/cplm/response/ResponseEvaluator.java:224-268). Trigger per kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:214.
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:211-224.
- **Window and boundary:** Event-keyed, not window-keyed. Capture ≥ 180 s, ≤ 4 h (src/flink/src/main/java/com/ams/flink/cplm/response/ResponseJobConfig.java:16-18). Site zone on the page (src/frontend-ob/src/components/Cpm/response/ResponseWorkspace.tsx:147).
- **Eligibility:** Qualified step in AUTO.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: word. Computed: enum.
- **Thresholds:**
  - state. Source: hardcoded (src/frontend-ob/src/components/Cpm/response/responseSupport.ts:112-119). Colour: COMPLETE, VALIDATED, ACTIVE_BASELINE, ELIGIBLE green; CENSORED, CANDIDATE, LIMITED, WAITING amber; REJECTED, INELIGIBLE, FAILED red.
- **Staleness:** None.
- **Version:** Stamped: method id and version, bundle hash (src/frontend-ob/src/components/Cpm/response/EventAside.tsx:55-59). Shown: yes in the event aside.
- **Consistency:** Same.

### M-130

**Process model parameters.** Status: **Definition conflict**

- **Labels:** "Process gain K", "Process gain", "Integrating gain", "Dead time θ", "Dead time", "Time constant τ", "Second time constant τ₂", "Damping ratio ζ", "Natural frequency ωₙ", "± 1 standard error of the estimate", "{FAMILY} model · {state}"
- **Surfaces:**
  - /cpm/response: result card, key results, model history (src/frontend-ob/src/components/Cpm/response/ResultCard.tsx:27-30; src/frontend-ob/src/components/Cpm/response/responseCopy.ts:34-37; src/frontend-ob/src/components/Cpm/response/ModelHistory.tsx:32-41)
- **Displayed definitions:**
  - Uncertainty meaning: "± 1 standard error, or half the range of equally good delays" (src/frontend-ob/src/components/Cpm/response/responseSupport.ts:95-96)
- **Engine calculation:** Estimators with standard errors (src/flink/src/main/java/com/ams/flink/cplm/response/ResponseEvaluator.java:177-180; src/flink/src/main/java/com/ams/flink/cplm/response/estimation/OutputErrorEstimator.java:1-306).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:220: "FOPDT (IPDT for level): Kp, θ, τ with standard errors (bootstrap 200, 95 %)".
- **Window and boundary:** Event-keyed, not window-keyed. Capture ≥ 180 s, ≤ 4 h (src/flink/src/main/java/com/ams/flink/cplm/response/ResponseJobConfig.java:16-18). Site zone on the page (src/frontend-ob/src/components/Cpm/response/ResponseWorkspace.tsx:147).
- **Eligibility:** Accepted event, estimation ran.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: value ± unc, unit from kernel, PV_EU replaced by pvUnit. Computed: per quantity.
- **Thresholds:** none.
- **Staleness:** None.
- **Version:** Stamped: method id and version, bundle hash (src/frontend-ob/src/components/Cpm/response/EventAside.tsx:55-59). Shown: yes in the event aside.
- **Consistency:** Differs: UI says ±1 standard error, doc says 95 % bootstrap. The rest of the 52 quantities are in M-134.

### M-131

**Observed response timing.** Status: **Label only**

- **Labels:** "t63", "Rise time 10–90 %", "Settling (response band)", "Settling (target band)", "Overshoot", "Steady-state error", "IAE", "ISE", "ITAE"
- **Surfaces:**
  - /cpm/response: key results (src/frontend-ob/src/components/Cpm/response/responseCopy.ts:36-38; src/frontend-ob/src/components/Cpm/response/EventAside.tsx:95-103)
- **Displayed definitions:**
  - None displayed.
- **Engine calculation:** p(t) progress; crossings held ≥ dwell; rise = t90 − t10; settling inside max(abs, rel × |Δy|) for tail dwell; overshoot = 100 × (max p − 1) above the band; steady error = r1 − yss (src/flink/src/main/java/com/ams/flink/cplm/response/metrics/ResponseMetricCalculator.java:51-118; src/flink/src/main/java/com/ams/flink/cplm/response/metrics/Overshoot.java:35-52; src/flink/src/main/java/com/ams/flink/cplm/response/metrics/Settling.java:23-47).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:217-219.
- **Window and boundary:** Event-keyed, not window-keyed. Capture ≥ 180 s, ≤ 4 h (src/flink/src/main/java/com/ams/flink/cplm/response/ResponseJobConfig.java:16-18). Site zone on the page (src/frontend-ob/src/components/Cpm/response/ResponseWorkspace.tsx:147).
- **Eligibility:** Baseline and endpoint found, response ≥ minResponseEu.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: s, % of response change, EU. Computed: same.
- **Thresholds:**
  - 0.1 EU, 2 %, 120 s tail. Source: job config (src/flink/src/main/java/com/ams/flink/cplm/response/ResponseJobConfig.java:22,36). Colour: none.
  - minResponseEu 0.5 EU. Source: Settings default (src/flink/src/main/java/com/ams/flink/cplm/response/metrics/ResponseMetricCalculator.java:22). Colour: absolute for any loop.
- **Staleness:** None.
- **Version:** Stamped: method id and version, bundle hash (src/frontend-ob/src/components/Cpm/response/EventAside.tsx:55-59). Shown: yes in the event aside.
- **Consistency:** Same formulas as doc. Event IAE, ISE, ITAE use the same names as window metrics with a different base (event span, valid reference) (src/flink/src/main/java/com/ams/flink/cplm/response/metrics/ResponseMetricCalculator.java:47-53).

### M-132

**Model validation.** Status: **Label only**

- **Labels:** "Validation", "free_run_rmse", "prediction_rmse", "fit_improvement", "residual_bias", "whiteness", "input_residual_correlation", "REJECTED", "CANDIDATE", "VALIDATED"
- **Surfaces:**
  - /cpm/response: result card and residual panel (src/frontend-ob/src/components/Cpm/response/ResultCard.tsx:32-34; src/frontend-ob/src/components/Cpm/response/ResidualPanel.tsx:24-29)
- **Displayed definitions:**
  - Panel: "Free-run and one-step prediction errors are reported separately: a flexible predictor with the wrong plant can pass one-step and fail free-r…" (src/frontend-ob/src/components/Cpm/response/ResidualPanel.tsx:39)
- **Engine calculation:** improvement = 1 − RMSE/RMSE_baseline; ≤ 0 REJECTED; RMSE above noise or bias above limit CANDIDATE; else VALIDATED (src/flink/src/main/java/com/ams/flink/cplm/response/validation/ModelValidator.java:73-99).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:221.
- **Window and boundary:** Event-keyed, not window-keyed. Capture ≥ 180 s, ≤ 4 h (src/flink/src/main/java/com/ams/flink/cplm/response/ResponseJobConfig.java:16-18). Site zone on the page (src/frontend-ob/src/components/Cpm/response/ResponseWorkspace.tsx:147).
- **Eligibility:** Fitted model and an independent event.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: raw key labels. Computed: per quantity.
- **Thresholds:**
  - 3 × noise, 0.1, 0.02, p > 0.05. Source: hardcoded (src/flink/src/main/java/com/ams/flink/cplm/response/validation/ModelValidator.java:81,91,94). Colour: via state tone.
- **Staleness:** None.
- **Version:** Stamped: method id and version, bundle hash (src/frontend-ob/src/components/Cpm/response/EventAside.tsx:55-59). Shown: yes in the event aside.
- **Consistency:** Same. Keys are shown raw.

### M-133

**Frequency-response margins.** Status: **Definition conflict**

- **Labels:** "Frequency response", "Gain margin", "Phase margin", "Gain crossover", "Phase crossover", "model-domain estimate", "gain crossings (rad/s)", "phase crossings (rad/s)"
- **Surfaces:**
  - /cpm/response: Bode panel (src/frontend-ob/src/components/Cpm/response/BodePanel.tsx:18,37-47)
- **Displayed definitions:**
  - Empty detail: "the kernel writes a Bode artifact only from a validated model with a known controller form and a crossing in band." (src/frontend-ob/src/components/Cpm/response/BodePanel.tsx:27)
- **Engine calculation:** FrequencyResponse.of on the validated model and controller form (src/flink/src/main/java/com/ams/flink/cplm/response/ResponseEvaluator.java:224-233); SIMC advisor (src/flink/src/main/java/com/ams/flink/cplm/response/ResponseEvaluator.java:252).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:224: "Not produced: stability margins, SIMC tuning advice".
- **Window and boundary:** Event-keyed, not window-keyed. Capture ≥ 180 s, ≤ 4 h (src/flink/src/main/java/com/ams/flink/cplm/response/ResponseJobConfig.java:16-18). Site zone on the page (src/frontend-ob/src/components/Cpm/response/ResponseWorkspace.tsx:147).
- **Eligibility:** Validated model, known controller form.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: dB, degree, rad/s. Computed: same.
- **Thresholds:** none.
- **Staleness:** None.
- **Version:** Stamped: method id and version, bundle hash (src/frontend-ob/src/components/Cpm/response/EventAside.tsx:55-59). Shown: yes in the event aside.
- **Consistency:** Doc says not produced, code and page have a path. Whether any plant event reaches it: not determined (no lab or API use in this analysis).

### M-134

**Quantity catalogue.** Status: **Consistent**

- **Labels:** "All N quantities", "N reported, M not applicable", "not applicable (…)", "not reported"
- **Surfaces:**
  - /cpm/response: catalogue card (src/frontend-ob/src/components/Cpm/response/QuantityCatalogue.tsx:17-21; src/frontend-ob/src/components/Cpm/response/EventAside.tsx:105-109)
- **Displayed definitions:**
  - Code comment: "A null quantity is stated with its reason ("not applicable (integrating)"), never shown as 0." (src/frontend-ob/src/components/Cpm/response/responseSupport.ts:9)
- **Engine calculation:** Fixed list with units and null reasons (src/flink/src/main/java/com/ams/flink/cplm/response/G12Result.java:40-60; src/flink/src/main/java/com/ams/flink/cplm/response/metrics/ResponseMetricCalculator.java:13-16).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:211-224 (subset).
- **Window and boundary:** Event-keyed, not window-keyed. Capture ≥ 180 s, ≤ 4 h (src/flink/src/main/java/com/ams/flink/cplm/response/ResponseJobConfig.java:16-18). Site zone on the page (src/frontend-ob/src/components/Cpm/response/ResponseWorkspace.tsx:147).
- **Eligibility:** Event selected.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: per quantity. Computed: per quantity.
- **Thresholds:** none.
- **Staleness:** None.
- **Version:** Stamped: method id and version, bundle hash (src/frontend-ob/src/components/Cpm/response/EventAside.tsx:55-59). Shown: yes in the event aside.
- **Consistency:** Same.

## Pipeline

### M-135

**Required jobs running.** Status: **Undocumented**

- **Labels:** "Required jobs", "N/M REQUIRED JOBS RUNNING", "One row per supervised job", "Uptime", "Status", "Role", "CPLM job(s) running", "CHECKING RUNTIME…"
- **Surfaces:**
  - /cpm/pipeline: tile, table (src/frontend-ob/src/components/Cpm/CpmPipeline.tsx:144-148,154-159,209-219)
  - /cpm/windows: header pill (src/frontend-ob/src/components/Cpm/CpmWindows.tsx:89-97)
- **Displayed definitions:**
  - None displayed.
- **Engine calculation:** pipeline-status job list; running count client side (src/frontend-ob/src/components/Cpm/CpmPipeline.tsx:59-60).
- **Documented logic:** Not determined in KL or KA.
- **Window and boundary:** Now. Poll 15 s and 20 s (src/frontend-ob/src/hooks/useCpm.ts:174,405).
- **Eligibility:** system.manage (docs/theme/cpa-currenttheme.md:480).
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: x/y, duration. Computed: count, s.
- **Thresholds:**
  - allRequiredRunning. Source: server. Colour: green, else red.
- **Staleness:** None.
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** Same.

### M-136

**Checkpoint figures.** Status: **Undocumented**

- **Labels:** "Checkpoint success", "Ckpts ok/failed", "Last ckpt age", "Last ckpt duration", "State size", "Managed state", "Max checkpoint age", "Max checkpoint duration", "ckpt Ns ago"
- **Surfaces:**
  - /cpm/pipeline: tiles, table, chart (src/frontend-ob/src/components/Cpm/CpmPipeline.tsx:160-165,215-218,110-113)
  - /cpm/windows: pill (src/frontend-ob/src/components/Cpm/CpmWindows.tsx:93-94)
- **Displayed definitions:**
  - Sub: "sum of last completed checkpoints" (src/frontend-ob/src/components/Cpm/CpmPipeline.tsx:165)
  - Copy: "There is no server-side history for these metrics; the chart accumulates live snapshots from the moment this page opened — it does not pretend to know the past." (src/frontend-ob/src/components/Cpm/CpmPipeline.tsx:232-233)
- **Engine calculation:** completed ÷ (completed + failed) since job start (src/frontend-ob/src/components/Cpm/CpmPipeline.tsx:62-66). Managed state = sum of last checkpoint sizes (src/frontend-ob/src/components/Cpm/CpmPipeline.tsx:66).
- **Documented logic:** Not determined.
- **Window and boundary:** Since job start; chart while the page is open, 20 s cadence.
- **Eligibility:** Job has checkpoints.
- **Denominator:** stated: N ok · M failed. Computed: Same.
- **Unit and scale:** displayed: % to 0.1, MB, s. Computed: count, bytes, ms.
- **Thresholds:**
  - 99 %. Source: hardcoded (src/frontend-ob/src/components/Cpm/CpmPipeline.tsx:160). Colour: green, else amber.
- **Staleness:** None.
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** Single surface. Text "20 s cadence" hardcoded (src/frontend-ob/src/components/Cpm/CpmPipeline.tsx:230). Null success reads amber with "—".

### M-137

**Metrics stated as unavailable.** Status: **Undocumented**

- **Labels:** "Watermark lag", "Kafka consumer lag", "not exposed by the metrics proxy", "Late events", "Out-of-order events"
- **Surfaces:**
  - /cpm/pipeline: tiles (src/frontend-ob/src/components/Cpm/CpmPipeline.tsx:166-169)
  - /cpm/windows: note (src/frontend-ob/src/components/Cpm/CpmWindows.tsx:130-133)
- **Displayed definitions:**
  - Tile: "not exposed by the metrics proxy" (src/frontend-ob/src/components/Cpm/CpmPipeline.tsx:167)
- **Engine calculation:** None; constant "—".
- **Documented logic:** Not determined.
- **Window and boundary:** n/a
- **Eligibility:** n/a
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: —. Computed: none.
- **Thresholds:** none.
- **Staleness:** None.
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** Honest placeholders.

### M-138

**Last fused verdict age.** Status: **Definition conflict**

- **Labels:** "Last fused verdict", "window ended N min ago", "none stored yet", "Round trip", "Completed in Ns", "VERIFIED"
- **Surfaces:**
  - /cpm/pipeline: lineage node and verification (src/frontend-ob/src/components/Cpm/CpmPipeline.tsx:271-276,294-297)
- **Displayed definitions:**
  - None displayed.
- **Engine calculation:** max(window_end) over up to 200 rankings at 12h, newest real verdict per loop (src/frontend-ob/src/components/Cpm/CpmPipeline.tsx:55,69-76; src/services/cplm-api/Data/FleetLatestSql.cs:34-55). Round trip = client timer around a recompute (src/frontend-ob/src/components/Cpm/CpmPipeline.tsx:131-135).
- **Documented logic:** Not determined.
- **Window and boundary:** 12h hardcoded (src/frontend-ob/src/components/Cpm/CpmPipeline.tsx:55). Poll 60 s.
- **Eligibility:** Monitored loops; 200 cap.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: min or h. Computed: ms.
- **Thresholds:** none.
- **Staleness:** None.
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** Differs: reads the newest real verdict, so INSUFFICIENT_DATA rows do not refresh it while the pipeline is producing them. 24h results are not seen.

## Governance and admin

### M-139

**Audit trail figures.** Status: **Definition conflict**

- **Labels:** "N total · showing M", "Total records", "CHAIN OK", "VERIFY FAILED", "Chain verified just now.", "Immutable cryptographically-chained record of all operator and system actions."
- **Surfaces:**
  - /cpm/governance (src/frontend-ob/src/components/Cpm/CpmGovernance.tsx:112-121,140-145)
  - /admin/audit (src/frontend-ob/src/components/Administration/AuditExplorer.tsx:47,93-96,192)
- **Displayed definitions:**
  - Heading: "Immutable cryptographically-chained record of all operator and system actions." (src/frontend-ob/src/components/Administration/AuditExplorer.tsx:47)
- **Engine calculation:** Audit service events and chain verifier (docs/theme/cpa-currenttheme.md:784).
- **Documented logic:** docs/theme/cpa-currenttheme.md:784.
- **Window and boundary:** Newest 200 rows fetched (src/frontend-ob/src/components/Cpm/CpmGovernance.tsx:30).
- **Eligibility:** admin.audit.view.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: count. Computed: count.
- **Thresholds:** none.
- **Staleness:** None.
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** See docs/theme/cpa-currenttheme.md:784: "all actions" not supported.

### M-140

**Governance provenance figures.** Status: **Definition conflict**

- **Labels:** "cplm-api build", "Engine builds observed", "Threshold profiles in use", "N role(s) · live", "As enforced by the permission model"
- **Surfaces:**
  - /cpm/governance (src/frontend-ob/src/components/Cpm/CpmGovernance.tsx:207-226,250)
- **Displayed definitions:**
  - Copy: "Every stored window carries these versions in its payload (A13), so any historical verdict can be attributed to the formula that produced it." (src/frontend-ob/src/components/Cpm/CpmGovernance.tsx:228-229)
- **Engine calculation:** Capabilities endpoint; registry; RBAC API.
- **Documented logic:** Not determined.
- **Window and boundary:** Now.
- **Eligibility:** system.manage.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: text. Computed: text.
- **Thresholds:** none.
- **Staleness:** None.
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** Copy overreaches the version label: see M-118.

### M-141

**Configuration lifecycle figures.** Status: **Consistent**

- **Labels:** "N of M loops run a governed bundle", "N loop(s)", "Bundles in progress", "v{n} · hash", "N of M PREPARE · N of M APPLY", "N refused", "N required worker(s)", "N propert(y/ies) differ", "N error(s)", "shadowRows", "symptomsRemoved", "symptomsAdded"
- **Surfaces:**
  - /cpm/config: overview (src/frontend-ob/src/components/Cpm/config/ConfigOverview.tsx:49)
  - /cpm/config: deployment (src/frontend-ob/src/components/Cpm/config/DeploymentStatus.tsx:49-50; src/frontend-ob/src/components/Cpm/config/lifecycle.ts:81-87)
  - /cpm/config: diff and shadow (src/frontend-ob/src/components/Cpm/config/DiffImpactPanel.tsx:29; src/frontend-ob/src/components/Cpm/config/ShadowComparison.tsx:17)
- **Displayed definitions:**
  - None displayed.
- **Engine calculation:** Server control plane; ack summary client side (src/frontend-ob/src/components/Cpm/config/lifecycle.ts:81-87).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:490-502 (journey).
- **Window and boundary:** Now. Shadow polled 10 s while running.
- **Eligibility:** cpm.config.read.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: count. Computed: count.
- **Thresholds:**
  - change class. Source: hardcoded (src/frontend-ob/src/components/Cpm/config/ConfigOverview.tsx:107). Colour: DEPLOYMENT red, STATE_BOUNDARY amber, else grey.
- **Staleness:** None.
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** Same.

## Registry

### M-142

**Loop readiness.** Status: **Consistent**

- **Labels:** "N to fix", "N blocking", "N plant fact(s)", "Not producing verdicts", "Configuration limits", "What this loop can be checked for", "Active", "Degraded", "Registered", "Inactive", "N role(s) mapped", "RESOLVED", "PATH FALLBACK", "UNCHECKED", "CLEAR"
- **Surfaces:**
  - /cpm/explorer: bar (src/frontend-ob/src/components/Cpm/explorer/ReadinessBar.tsx:35-40)
  - /cpm/registry: state column (src/frontend-ob/src/components/Cpm/registryShared.ts:20-28; src/frontend-ob/src/components/Cpm/LoopRegistry.tsx:131)
  - /cpm/explorer: Signals (src/frontend-ob/src/components/Cpm/explorer/SignalsTab.tsx:59-66)
- **Displayed definitions:**
  - Code comment: "Nothing blocking means the loop IS evaluated; what remains limits what the evidence can claim (SME review #4/#6) - a configuration limit, not a fault, so it is not worded as one." (src/frontend-ob/src/components/Cpm/explorer/readinessCauses.ts:103-104)
- **Engine calculation:** Server checks (src/services/cplm-api/Controllers/CpmReadinessController.cs:152-248); blocking set mirrored on the client (src/frontend-ob/src/components/Cpm/explorer/readinessCauses.ts:17-21).
- **Documented logic:** kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:475-489 (journey).
- **Window and boundary:** Now.
- **Eligibility:** Registry loop.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: count, word. Computed: boolean per check.
- **Thresholds:**
  - flags NO_VP, NO_UPSTREAM_LINKS. Source: hardcoded (src/frontend-ob/src/components/Cpm/registryShared.ts:25). Colour: Degraded amber.
- **Staleness:** None.
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** Client mirror of the blocking list must be kept in step by hand.

## Governance and admin

### M-143

**Administration counts.** Status: **Undocumented**

- **Labels:** "N users · N active · N inactive", "sites / areas / units", "devices / measurements", "DCS tag → UNS path", "N (M monitored)", "Ingestion sources", "Showing N of M"
- **Surfaces:**
  - /admin/users (src/frontend-ob/src/components/Administration/UserManagementConfig.tsx:198)
  - /admin/plant-model: stage strip (src/frontend-ob/src/components/Administration/PlantModelStatus.tsx:88-123)
  - /admin/aliases (src/frontend-ob/src/components/Administration/AliasConfig.tsx:283-285)
- **Displayed definitions:**
  - None displayed.
- **Engine calculation:** Service totals (src/frontend-ob/src/components/Administration/PlantModelStatus.tsx:20-23,62-68).
- **Documented logic:** Not determined.
- **Window and boundary:** Now; staleTime 60 s.
- **Eligibility:** Per tab permission.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: count. Computed: count.
- **Thresholds:**
  - count > 0. Source: hardcoded (src/frontend-ob/src/components/Administration/PlantModelStatus.tsx:98-104). Colour: green, else amber.
- **Staleness:** None.
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** Same.

### M-144

**System settings shown.** Status: **Definition conflict**

- **Labels:** "Active Alarm TTL (Days)", "Historical Log Retention (Days)", "Backup Path Volume", "Backend Log Level", "Global Default Theme"
- **Surfaces:**
  - /admin/system (src/frontend-ob/src/components/Administration/SystemSettingsConfig.tsx:58-105)
- **Displayed definitions:**
  - Notice: "Not functional yet — these settings are not connected to the backend and cannot be saved. Values shown are illustrative defaults, not the running configuration." (src/frontend-ob/src/components/Administration/SystemSettingsConfig.tsx:27-28)
- **Engine calculation:** Client constants 30, 365, /mnt/backups/ams (src/frontend-ob/src/components/Administration/SystemSettingsConfig.tsx:9-11). Real retention: prod_decision.md:44-73.
- **Documented logic:** docs/theme/cpa-currenttheme.md:800; Q10.
- **Window and boundary:** n/a
- **Eligibility:** SuperAdmin.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: days, text. Computed: none.
- **Thresholds:** none.
- **Staleness:** None.
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** Values are illustrative; the page says so. Conflicts with the real retention table.

### M-145

**Login status strip.** Status: **Label only**

- **Labels:** "Build", "Network online", "Network offline", "UTC clock"
- **Surfaces:**
  - /login (src/frontend-ob/src/components/Login/Login.tsx:261-264)
- **Displayed definitions:**
  - None displayed.
- **Engine calculation:** package version at build, navigator.onLine, browser clock (docs/theme/cpa-currenttheme.md:783).
- **Documented logic:** docs/theme/cpa-currenttheme.md:783.
- **Window and boundary:** Now.
- **Eligibility:** None.
- **Denominator:** stated: n/a. Computed: n/a.
- **Unit and scale:** displayed: text. Computed: text.
- **Thresholds:**
  - online. Source: browser. Colour: running, else alarm indicator.
- **Staleness:** None.
- **Version:** Not applicable: operational or registry value, no calculation version.
- **Consistency:** "Network online" is browser state, not a service check.
