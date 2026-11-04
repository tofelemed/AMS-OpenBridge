# CPA metric discrepancies for control engineering

Input to question Q7 (docs/theme/cpa-currenttheme.md:1414). Each item states what the sources say today, with evidence. No item proposes a definition: the decision belongs to control engineering and the CPA owner. Concept IDs point at [metric-lineage.md](metric-lineage.md).

Read from source only. No server, lab API or credentials were used, so how often a case occurs on the plant is not determined.

Severity orders the list and is a reading aid, not a decision:

- **High:** the screen tells an engineer something the engine did not establish, or hides the worst state.
- **Medium:** two surfaces disagree on the same fact, or a stated rule is not the rule applied.
- **Low:** wording, unit or documentation drift.

## Index

| ID | Severity | Item | Concepts |
|---|---|---|---|
| D-01 | High | Time share is a sample share | M-078, M-080, M-088 |
| D-02 | High | Manual share counts unknown mode | M-079, M-008 |
| D-03 | Medium | "AUTO or CASCADE" understates the mode set | M-078 |
| D-04 | High | 0.95, 0.90 and 0.70 for one share | M-078, M-046 |
| D-05 | Medium | Three staleness rules | M-015, M-039, M-027 |
| D-06 | Low | Five names for time in AUTO | M-078, M-006 |
| D-07 | High | Cards say "judged by" a gate that does not read them | M-090, M-091, M-082, M-049, M-050 |
| D-08 | High | G4 STRONG renders grey on loop cards | M-050, M-090, M-091 |
| D-09 | High | Excessive effort names travel and reversals, decides on a σ ratio | M-011 |
| D-10 | High | "Fully open or closed" and two saturation computations | M-088, M-012, M-056 |
| D-11 | High | "Confirmed" valve fault: scope, test record, VP | M-060, M-062, M-035 |
| D-12 | High | Confirmed oscillation without a validated period | M-009, M-051, M-052, M-128 |
| D-13 | High | Manual-mode row compared with 0.95, exclusion at 0.70 | M-013, M-023 |
| D-14 | High | One no-fault verdict, many wordings | M-063, M-077 |
| D-15 | High | Every exclusion reads "loop not in automatic" | M-065 |
| D-16 | Medium | Priority bar colours ignore the profile floor | M-080 |
| D-17 | High | Reversal deadband documented and governed, not applied | M-091 |
| D-18 | Medium | Three completeness threshold sets | M-093 |
| D-19 | Medium | Metrics hidden on one page, shown on another | M-117, M-078 |
| D-20 | High | "No threshold configured" shown to users without config access | M-128 |
| D-21 | High | Severity is the evidence band | M-028, M-026 |
| D-22 | Medium | Queue admits more than it says | M-027 |
| D-23 | Medium | Attention ranking: basis and age | M-042, M-043 |
| D-24 | Medium | Evidence score wording | M-066 |
| D-25 | Medium | Persistence row demands 3, engine needs 2 | M-074 |
| D-26 | Medium | Effort ratio definition | M-097 |
| D-27 | Medium | "OP" shape on PV-signal classes | M-102, M-053 |
| D-28 | Medium | Effect-on-verdict text on the gate panel | M-047, M-049, M-057, M-058 |
| D-29 | Medium | Two API catalogues, two gate vocabularies | M-052, M-054, M-056, M-057, M-058, M-059, M-060, M-061 |
| D-30 | Medium | Roll-up "failed", "Evaluated", DETECTED gap | M-041, M-040 |
| D-31 | Low | Tallies over 10 of 17 gates | M-116 |
| D-32 | Low | One quantity, different scales | M-078, M-080, M-070 |
| D-33 | Medium | Version check compares a label | M-118, M-140 |
| D-34 | Low | Logic files behind the code | many |
| D-35 | Medium | Population differs under one word | M-002, M-032, M-035 |
| D-36 | Low | "Never evaluated" after retention | M-016 |
| D-37 | Medium | Episode severity is the latest, shown beside the peak | M-028, M-121 |
| D-38 | Medium | "Bad quality" wording | M-014, M-095 |
| D-39 | Low | "0 % of 0" | M-022 |
| D-40 | Medium | Tile colour rules | M-005, M-006 |
| D-41 | Low | Period and stiction score naming | M-098, M-072 |
| D-42 | Medium | Loop change "24 h earlier" has no age limit | M-078 |
| D-43 | Low | "No fault, but out of mode or at limit" | M-019 |
| D-44 | Low | Three copies of the mode list | M-108 |
| D-45 | Low | Last fused verdict age | M-138 |
| D-46 | Low | Response uncertainty and margins against the doc | M-130, M-133 |
| D-47 | Low | Shelved counts | M-031 |
| D-48 | Low | "Weak evidence" on a persistence cap | M-018 |
| D-49 | Low | Provenance fields with no help entry | M-081, M-086, M-087, M-092, M-105, M-106 |

## Known items from analysis 9.4a

### D-01 Time share is a sample share (High)

- UI: "Service factor: time in AUTO or CASCADE ÷ window time" (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:133); "AUTO % = time in AUTO or CASCADE ÷ window time" (src/frontend-ob/src/components/Cpm/kpi/kpiMeta.ts:36); "Time fraction the controller spent in AUTO." (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:27).
- Same class, added here: "Time with |PV − SP| inside the good-error band ÷ window time" (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:137) and "Time with OP fully open or closed ÷ window time" (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:147).
- Engine: autoCount ÷ n (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:72,185,193); goodErrorCount ÷ n (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:265,276); sat ÷ op.length (src/flink/src/main/java/com/ams/flink/cplm/engine/LimitMath.java:61). n = samples present, not window time. kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:76-78 records this.
- Effect: on a 95 % complete window the share is of the 95 %. kpi_calculation_logic/KPI-LOGIC.md:103 repeats the time wording.
- Decision: sample-based or time-based, and what the label says. Q7.

### D-02 Manual share counts unknown mode (High)

- UI: "MANUAL % = time in MANUAL ÷ window time" (src/frontend-ob/src/components/Cpm/kpi/kpiMeta.ts:40); "operated by hand most of the time" (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:139).
- Engine: manualPct = 1 − autoPct (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:194). isAutoMode is false for null, empty, UNKNOWN and any unknown token (src/flink/src/main/java/com/ams/flink/cplm/CplmNormalizedSample.java:234-244). The data-source panel says so: "every sample counts as not-auto" (src/frontend-ob/src/components/Administration/LoopIngestPanel.tsx:122).
- Effect: a loop with no usable MODE reads as 100 % in manual.
- Decision: does UNKNOWN count as manual. Q7.

### D-03 "AUTO or CASCADE" understates the set (Medium)

- UI: "AUTO / CASCADE" (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:132; src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:137); "AUTO" alone (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:27).
- Engine: AUTO, AUT, A, AUTOMATIC, NORMAL, NORM, CAS, CASC, CASCADE, RSP, DDC, SUP, SUPERVISORY, plus compounds containing AUTO or CASCADE (src/flink/src/main/java/com/ams/flink/cplm/CplmNormalizedSample.java:227-243).
- Decision: which modes count as auto. Q7.

### D-04 0.95, 0.90 and 0.70 for one share (High)

- Tile: server config, default 0.95 (src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:8).
- Card: hardcoded 0.95 (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:40,132), so a change to Cpm:Kpi:NormalModeMin does not reach it.
- G1: PASS at 0.90, WARN at 0.70, EXCLUDED below (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:87-88; src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:197-203).
- Effect: between 0.90 and 0.95 the card is amber beside "G1 pass"; between 0.70 and 0.90 the loop is out of mode on /cpm and still gets a full verdict. A no-fault loop at 0.92 reads "No fault, but limited".
- Decision: which limit applies where. Q7.

### D-05 Three staleness rules (Medium)

- KPI tiles: 60 min, server config (src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:7).
- Queue and loop summary: window length (src/services/cplm-api/Data/FleetPrioritySql.cs:53; src/services/cplm-api/Data/FleetLatestSql.cs:227-238; src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:110-115).
- Performance banner: 3 h, hardcoded, newest across the fleet (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:57,167-169).
- Loop cards, attention ranking, case chips: no rule (src/services/cplm-api/Controllers/CpmLoopKpiController.cs:24-31; src/services/cplm-api/Data/FleetLatestSql.cs:34-55).
- Effect: one loop can read Stale on the tile, sit in the queue, and show cards with no stale marker.
- Decision: one freshness rule or one per surface, stated. Q7.

### D-06 Five names for time in AUTO (Low)

"In auto mode" (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:136), "Time in normal mode" (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:131), "Automatic-mode fraction" (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:27), "In AUTO" (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:37), "Service factor" (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:133), and more in M-078. Decision: one name. Q7.

## New items

### D-07 Cards say "judged by" a gate that does not read them (High)

- OP travel: "valve wear, judged by G4" (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:152). OP reversals: same (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:155). MAE: "judged by G3" (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:141). Calculations column: "The verdict of the gate that judges this metric" (src/frontend-ob/src/components/Cpm/CpmCalculations.tsx:307), with MAE, RMSE, IAE, ISE under G3 and travel, reversals under G4 (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:28-35).
- Engine: G3 reads good_error_pct only (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:281). G4 reads the σ activity ratio only (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:322-348). kpi_calculation_logic/KPI-LOGIC.md:166 says the UI "never invents a threshold the engine did not apply"; the tone is copied across.
- Effect: a loop with very high travel and a low σ ratio shows G4 pass, in green, on the travel card.
- Also: "valve wear" against "OP travel is not valve travel" (src/services/cplm-api/Services/GateCatalog.cs:48).
- Decision: which quantities a gate judges, and what a card may claim. Q7.

### D-08 G4 STRONG renders grey on loop cards (High)

- The cards use a local tone map with PASS, WARN and FAIL only (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:44-45). G4 has no FAIL; its top status is STRONG (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:342-348). passTone falls through to muted (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:115,150,153).
- Elsewhere STRONG is amber (src/frontend-ob/src/components/Cpm/gateStatus.ts:76) or red through toneFor (src/frontend-ob/src/components/Cpm/shared.tsx:253-255).
- Effect: the strongest actuator state is the only one with no colour on the card, with sub-text "G4 strong".
- Decision: tone for STRONG on these cards. Owner of the mapping: Q6 with Q7.

### D-09 Excessive effort names travel and reversals, decides on a σ ratio (High)

- UI: "Suspected or confirmed excessive effort (OP travel / reversals)" (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:145); "(OP travel, reversals)" (src/frontend-ob/src/components/Cpm/kpi/kpiMeta.ts:53); "Excessive OP travel and reversals wear the final element" (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:128). kpi_calculation_logic/KPI-LOGIC.md:131 lists them as inputs.
- Engine: effort score = clamp01(effort_ratio / 8) (src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionEvidence.java:65); family qualifies on that score or G4 / G10 (src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionEvidence.java:146-149). kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:145 agrees with the engine.
- Decision: what the KPI measures. Q7.

### D-10 "Fully open or closed" and two saturation computations (High)

- UI: "OP fully open or closed" (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:147; src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:147; src/services/cplm-api/Services/Kpi/FleetKpiRows.cs:57).
- Engine: OP ≤ 5 or ≥ 95 pp (src/flink/src/main/java/com/ams/flink/cplm/engine/LimitMath.java:47; src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:201-202). A loop steady at 96 % counts as fully open.
- Two computations. Displayed saturation_pct: short stage, satLowPct and satHighPct (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:277; src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionInputs.java:65). G10 occupancy: long stage, limitTolerancePp (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:221-225). G10.limit_tolerance_pp is governed (src/flink/src/main/java/com/ams/flink/cplm/config/BundleProfileMapper.java:85); satLowPct is not in that map. A bundle changing the tolerance moves G10 and leaves the KPI and card.
- Limits: fleet and card 0.10; G10 WARN 0.05 (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:203).
- Basis name: kpi_calculation_logic/KPI-LOGIC.md:139 says REGISTRY, engine writes DECLARED_RANGE (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:224).
- Denominator wording: kpi_calculation_logic/KPI-LOGIC.md:137 "share of assessed loops", formula and UI use measured rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:146).
- Decision: what "at a limit" means and which limit. Q7.

### D-11 "Confirmed" valve fault: scope, test record, VP (High)

- Scope. Engine claim: FINAL_ELEMENT_NON_FOLLOWING, "A confirmed subtype never exceeds this scope" (src/flink/src/main/java/com/ams/flink/cplm/fusion/Confirmation.java:14-19,24). Label: "Valve nonlinearity (stiction) confirmed" (src/frontend-ob/src/components/Cpm/vocabulary.ts:176-177). The G14 view repeats the scope rule (src/frontend-ob/src/components/Cpm/evidence/views/FusionViews.tsx:49).
- Test record. UI offers it: "valve faults there need an approved test record to be confirmed" (src/frontend-ob/src/components/Cpm/overview/capabilityCopy.ts:46); "an approved stroke / bump test would confirm it" (src/frontend-ob/src/components/Cpm/causeAnalysis.ts:34); "or an approved test record" (src/services/cplm-api/Services/GateCatalog.cs:88). Engine has no such path (src/flink/src/main/java/com/ams/flink/cplm/fusion/Confirmation.java:42-74). kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:555 says no final-element fault can be CONFIRMED without measured VP.
- VP note. "CONFIRMED requires a VP signal; without it G14 caps confidence at 0.89." (src/services/cplm-api/Controllers/CpmEventsController.cs:192). The band needs G14 for valve claims only (src/flink/src/main/java/com/ams/flink/cplm/fusion/DiagnosisBands.java:62-63). With VP mapped and no dwell the cap is also 0.89 (src/flink/src/main/java/com/ams/flink/cplm/fusion/Confirmation.java:71-72,81), and the cap note still says "without valve position" (src/frontend-ob/src/components/Cpm/evidenceScore.ts:37).
- Word. "Confirmed" on oscillation and effort is the band alone (src/flink/src/main/java/com/ams/flink/cplm/fusion/DiagnosisBands.java:41). The Explorer adds "not confirmed" beside it for the cause (src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:135-137). The G14 question asks whether VP is "available" (src/services/cplm-api/Controllers/CpmEventsController.cs:153), the code comment says presence confirms nothing (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:168).
- Decision: what "confirmed" may say per family, and whether a test record is in scope. Q7.

### D-12 Confirmed oscillation without a validated period (High)

- Engine: family qualifies when max(regularity, peak ratio) ≥ 0.55 or G5 or G6 is WARN (src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionEvidence.java:78-84,167-171). G5 is WARN on any period > 0 (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:137); G6 WARN on peak ratio > 0.5 (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:157). No valid-period test on this path.
- UI on the same row: "Oscillation confirmed" (src/frontend-ob/src/components/Cpm/vocabulary.ts:174-177), "period not measured" (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:62), "No clean oscillation cycle: period and waveform shape not measured" (src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:39), and observation "Sustained oscillation" (src/frontend-ob/src/api/cpm/verdict.ts:90).
- Catalogue: "too few cycles or inadequate sampling reject the estimate" (src/services/cplm-api/Services/GateCatalog.cs:52). kpi_calculation_logic/KPI-LOGIC.md:118 records 163 of 164 lab loops in this state. kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:551 records G5.
- Explain: G5 ✓/✕ rows and the G6 "peak vs background" row are validity tests, not the rule that set the status (src/frontend-ob/src/components/Cpm/evidence/whyRules.ts:78-94; src/flink/src/main/java/com/ams/flink/cplm/engine/OscillationMath.java:265-278).
- Decision: may "confirmed" stand with no validated period. Q7.

### D-13 Manual-mode row compared with 0.95, exclusion at 0.70 (High)

- Row: "Time in AUTO / CASCADE {v} — below 95 %" for reason MANUAL_MODE (src/services/cplm-api/Services/Kpi/FleetKpiRows.cs:65; src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:15-28).
- Engine: EXCLUDED_MODE only below 0.70 (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:197-203; src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:134-136).
- The proof column names a limit that did not cause the state. "manual mode" also covers samples with no mode (D-02). The rule at src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:149 omits the sensor reason listed in the map (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:25).
- Decision: what the row should compare against. Q7.

### D-14 One no-fault verdict, many wordings (High)

For NO_CALL and INSUFFICIENT_EVIDENCE, both judged windows (src/flink/src/main/java/com/ams/flink/cplm/fusion/DiagnosisBands.java:44-47; src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:370-380):

| Surface | Reads | Evidence |
|---|---|---|
| /cpm/kpi, /cpm/performance, /cpm/investigation title | No fault identified | src/frontend-ob/src/components/Cpm/vocabulary.ts:170; src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:43 |
| /cpm/explorer header and summary, NO_CALL | Not evaluated yet | src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:25-26; src/frontend-ob/src/components/Cpm/explorer/LoopWorkspace.tsx:132 |
| /cpm/explorer, INSUFFICIENT_EVIDENCE | Not evaluated: not enough data | src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:27-28 |
| /cpm/explorer next check and button | signals are arriving; Open Window Inspector | src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:82,98 |
| /cpm/investigation score pill | no verdict | src/frontend-ob/src/components/Cpm/CpmInvestigation.tsx:227; src/frontend-ob/src/components/Cpm/metricAvailability.ts:53-56 |
| /cpm/investigation case chip | Not evaluable | src/frontend-ob/src/components/Cpm/investigation/cases.ts:18,26 |
| /cpm/calculations G15 row | Not evaluated | src/frontend-ob/src/components/Cpm/CpmCalculations.tsx:153 |
| /cpm/calculations and Explorer metrics, INSUFFICIENT_EVIDENCE | Insufficient data: too few qualified samples | src/frontend-ob/src/components/Cpm/metricAvailability.ts:64-65 |
| /cpm/investigation delta | window had insufficient data | src/frontend-ob/src/components/Cpm/investigation/WindowBrowser.tsx:47 |
| /cpm/evidence Explain | no gate on it carries a verdict | src/frontend-ob/src/components/Cpm/evidence/ExplainWhy.tsx:68 |
| Any codeLabel on NO_CALL | Not evaluated | src/frontend-ob/src/components/Cpm/vocabulary.ts:64 |

The same loop can count as Performing acceptably on /cpm. kpi_calculation_logic/KPI-LOGIC.md:287-288 records this as an open item for NO_CALL; CHG-092 fixed diagnosisLabel only (src/frontend-ob/src/components/Cpm/vocabulary.ts:168-170). "No fault found" in kpi_calculation_logic/KPI-LOGIC.md:287 is not in the code.

Decision: one wording for a judged no-fault window, and whether it carries a score. Q7.

### D-15 Every exclusion reads "loop not in automatic" (High)

- diagnosisLabel, conditionOf and metricAvailability map all EXCLUDED* to the mode text (src/frontend-ob/src/components/Cpm/vocabulary.ts:172; src/frontend-ob/src/components/Cpm/explorer/summary/summaryText.ts:29-30; src/frontend-ob/src/components/Cpm/metricAvailability.ts:62-63; src/frontend-ob/src/components/Cpm/investigation/WindowBrowser.tsx:46).
- Engine codes: EXCLUDED_MODE, EXCLUDED_OPERATING_REGION, EXCLUDED_INSTRUMENT_HEALTH, EXCLUDED_SENSOR, EXCLUDED_DATA_QUALITY (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:131-149).
- /cpm/kpi words them correctly (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:58-61). The engine next check on the same card names the real cause (src/flink/src/main/java/com/ams/flink/cplm/fusion/BlockingExclusions.java:54-75).
- Effect: a frozen transmitter is reported as a loop out of automatic.
- Decision: wording per code. Q7.

### D-16 Priority bar colours ignore the profile floor (Medium)

Bar green at 80, amber at 50, red below (src/frontend-ob/src/components/Cpm/overview/GoodErrorBar.tsx:25). G3 floor 0.50, or 0.30 on averaging loops (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:154; src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfilePacks.java:91). A LIC at 40 % passes G3 and is red. From docs/theme/cpa-currenttheme.md:795. Decision: what sets this colour. Q7.

### D-17 Reversal deadband documented and governed, not applied (High)

- Doc: "reversals = sign changes of ΔOP (|ΔOP| > deadband 0.5 pp)" (kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:83).
- Property G4.reversal_deadband_pp: "Meaningful command movement threshold", consumer flink:short (src/flink/src/main/resources/cplm/gate-config/property-catalogue.json:1589,1602).
- Engine: threshold is OP_REVERSAL_EPS = 1e-9 (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:23,201; src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:306). opDeadbandPct is read only by the corner score (src/flink/src/main/java/com/ams/flink/cplm/engine/ShapeMath.java:282).
- Effect: every sign change of a noisy OP is a reversal, the deadband setting changes nothing, and the figure feeds actuatorStress (src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionEvidence.java:95).
- Decision: which count is the intended one. Q7.

### D-18 Three completeness threshold sets (Medium)

Card 0.95 hardcoded (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:42,161). G0 PASS 0.98, WARN 0.95 (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:84-85; src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:130-136). Window list 0.9 and 0.5 (src/frontend-ob/src/components/Cpm/CpmWindows.tsx:188): a 96 % window is a green pill beside G0 WARN; below 0.95 the row reads DECLINED, so amber and red need a row with no flag (src/frontend-ob/src/components/Cpm/CpmWindows.tsx:185-191). Density 0.6 (src/frontend-ob/src/components/Cpm/windows/WindowDetail.tsx:101). The card says "declared grid"; the engine falls back to the median interval (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:85-86); kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:554 says the median only. Value can exceed 1 (kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:85).

Decision: Q7.

### D-19 Metrics hidden on one page, shown on another (Medium)

metricAvailability exists because the engine "keeps computing metrics on excluded-mode windows" and such a value "is not a measurement" (src/frontend-ob/src/components/Cpm/metricAvailability.ts:2-6,62-63). Calculations and Investigation apply it. Loop KPI cards do not: they format any stored number (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:51-65). On one EXCLUDED_MODE window the Explorer shows "Good-error time 100 %" with "G3 pass", and Calculations shows N/A.

Decision: Q7.

### D-20 "No threshold configured" shown to users without config access (High)

The effective configuration is fetched only with cpm.config.read (src/frontend-ob/src/components/Cpm/evidence/ExplainWhy.tsx:43-49). For others c() is null and rows read "no threshold configured for this profile" (src/frontend-ob/src/components/Cpm/evidence/whyRules.ts:38,51,57). The profile does configure them. The code comment says "A threshold the profile does not configure is said so, never invented" (src/frontend-ob/src/components/Cpm/evidence/whyRules.ts:6-7). SuperAdmin alone holds this permission (prod_decision.md:116). Every normal user sees a false statement on G5, G6, G7, G10.

Decision: what a user without the permission should read. Q7 with the CPA owner.

### D-21 Severity is the evidence band (High)

- Priority text: "consequence × urgency", urgency = "the finding's severity" (src/services/cplm-api/Data/FleetPrioritySql.cs:7-10); "loop criticality × finding severity" (src/frontend-ob/src/components/Cpm/overview/priorityReason.ts:14). prod_decision.md:109 repeats it.
- Engine: severity set from confidence alone (src/flink/src/main/java/com/ams/flink/cplm/fusion/DiagnosisBands.java:44-72). kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:175 states it.
- Effect: "High severity" means a strong symptom match, with no measure of process impact. Evidence therefore enters priority twice: through severity, and as the final tie-break.
- It also drives alarm colours with no site configuration (docs/theme/cpa-currenttheme.md:1424, Q12).
- Decision: what urgency is. Q7 and Q12.

### D-22 Queue admits more than it says (Medium)

Text: "current confirmed or suspected finding" (src/frontend-ob/src/components/Cpm/overview/PriorityQueue.tsx:59). SQL: also DETECTED and CLASSIFIED (src/services/cplm-api/Data/FleetPrioritySql.cs:54), which kpi_calculation_logic/KPI-LOGIC.md:52 calls not findings. The probe skips INSUFFICIENT_DATA (src/services/cplm-api/Data/FleetPrioritySql.cs:37) and allows window-length age (src/services/cplm-api/Data/FleetPrioritySql.cs:53), so the row can show an older verdict while the tile says Not assessable. From docs/theme/cpa-currenttheme.md:1125, extended. "View all" opens a filter built on another rule (src/frontend-ob/src/components/Cpm/CpmOverview.tsx:109; src/frontend-ob/src/components/Cpm/gateStatus.ts:187-192).

Decision: Q7.

### D-23 Attention ranking: basis and age (Medium)

"Loops needing attention" (src/frontend-ob/src/components/Cpm/AttentionList.tsx:71) defaults to evidence-score order (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:67), while the help says the score is "not a priority" (src/frontend-ob/src/components/Cpm/evidenceScore.ts:11). "By control error" sorts good_error_pct (src/services/cplm-api/Controllers/CpmFleetController.cs:175). Rows use the newest real verdict of any age (src/services/cplm-api/Data/FleetLatestSql.cs:34-55); the matrix on the same page uses the newest row (src/services/cplm-api/Data/FleetLatestSql.cs:136-143); "driven by" joins them (src/frontend-ob/src/components/Cpm/AttentionList.tsx:57-61). The help omits the good-error step of the queue order (src/frontend-ob/src/components/Cpm/evidenceScore.ts:11; src/frontend-ob/src/components/Cpm/overview/priorityReason.ts:14).

Decision: Q7.

### D-24 Evidence score wording (Medium)

Text: "how fully the observed symptoms match" (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:46; src/frontend-ob/src/components/Cpm/evidenceScore.ts:10). Engine: max of two detector scores × prior, or effort_ratio/8 × prior (src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionEvidence.java:140-149). One detector at 1.0 yields 100 whatever the other symptoms show. Scores are not comparable across families: a σ-ratio scale against a shape score. The Calculations question for G15 is "How confident is the final verdict?" (src/services/cplm-api/Controllers/CpmEventsController.cs:154), against the product rule (src/frontend-ob/src/components/Cpm/evidenceScore.ts:2-6).

Decision: Q7.

### D-25 Persistence row demands 3, engine needs 2 (Medium)

Row: agree against persistence_windows_required, "≥ N required to persist" (src/frontend-ob/src/components/Cpm/evidence/whyRules.ts:128-130). Engine: result.persistenceWindowsRequired = window = 3; test is agree ≥ need = 2 (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:396-398,415). At 2 of 3 the row shows ✕ while the verdict stands. kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:179 says the cap applies to SUSPECTED and CONFIRMED; the code applies it to any band (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:418). kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:550: three results span 45 min of one sliding window.

Decision: Q7.

### D-26 Effort ratio definition (Medium)

"OP travel relative to the error it corrects." (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:33). Engine: σ(OP) / σ(PV) (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:289). It has units of OP per PV. G4 compares activity_ratio_norm when a span is declared (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:324-329), so the catalogued value and the verdict beside it can be different numbers. /8 is fixed in fusion regardless of basis (src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionEvidence.java:65).

Decision: Q7.

### D-27 "OP" shape on PV-signal classes (Medium)

"OP triangularity" (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:40), "Is the OP trace triangular" (src/services/cplm-api/Controllers/CpmEventsController.cs:146), "Triangular OP waveform" (src/frontend-ob/src/api/cpm/verdict.ts:91). Engine: PV on integrating classes (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:110; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:112).

Decision: Q7.

### D-28 Effect-on-verdict text on the gate panel (Medium)

"Contributes {role} evidence to family qualification." (src/frontend-ob/src/components/Cpm/GateEvidencePanel.tsx:147) and "A failure here excludes the whole window" (src/frontend-ob/src/components/Cpm/GateEvidencePanel.tsx:144). Fusion does not read G2 or G3 (src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionEvidence.java:78-95); G12 has no effect (kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:552); G11 never fails, a material freeze excludes on another flag (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:147-149). Note G3 does enter Performing acceptably (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:80-82).

G2 catalogue precondition "otherwise NOT_EVALUATED, not PASS" (src/services/cplm-api/Services/GateCatalog.cs:37) against a default band (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:188-194).

Decision: Q7.

### D-29 Two API catalogues, two gate vocabularies (Medium)

cplm-api serves gate names twice: GateCatalog.cs (src/services/cplm-api/Services/GateCatalog.cs:27-94) and the calculations contract (src/services/cplm-api/Controllers/CpmEventsController.cs:138-154), which GATE_NAMES copies (src/frontend-ob/src/components/Cpm/gateStatus.ts:159-164).

| Gate | Contract and GATE_NAMES | GateCatalog |
|---|---|---|
| G6 | Spectral (FFT) | Spectral (PSD) |
| G8 | Horch oddness | Lag asymmetry |
| G10 | Valve / saturation | Actuator limits |
| G11 | Sensor health | Measurement health |
| G12 | Step-test evidence | System response |
| G13 | Disturbance context | Interaction |
| G14 | VP confirmation | Final-element confirmation |
| G15 | Diagnosis band | Decision |

The Evidence Workbench and Explorer detail use GateCatalog; Performance and Replay use the contract. The window panel adds "Control effort" for G4 (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:25). A status also has two word sets (M-044). Decision: one name per gate. Q7.

### D-30 Roll-up "failed", "Evaluated", DETECTED gap (Medium)

Aria text "{bad} failed" (src/frontend-ob/src/components/Cpm/GateRollup.tsx:62) counts FAIL, STRONG, EXCLUDED*, CONFIRMED (src/frontend-ob/src/components/Cpm/gateStatus.ts:187-192), which the marks separate (src/frontend-ob/src/components/Cpm/gateStatus.ts:57-63). "Evaluated" is diagnosis ≠ NOT_EVALUATED, so INSUFFICIENT_DATA counts (src/frontend-ob/src/components/Cpm/gateStatus.ts:216-217). reviewSeverity has no DETECTED or CLASSIFIED; the comment says the grouping is kept so numbers do not move (src/frontend-ob/src/components/Cpm/gateStatus.ts:183-186), yet CHG-094 moved G15 statuses from SUSPECTED to those words (src/flink/src/main/java/com/ams/flink/cplm/fusion/DiagnosisBands.java:49), so G15 bars dropped those loops.

Decision: Q7.

### D-31 Tallies over 10 of 17 gates (Low)

"Gates acceptable x/10" beside "Evidence gates in the pack 17" (src/frontend-ob/src/components/Cpm/CpmCalculations.tsx:204-215,275-280). The Explorer line puts detected and classified under "not evaluated or not usable" (src/frontend-ob/src/components/Cpm/explorer/summary/SummaryCalculations.tsx:45-52,60).

### D-32 One quantity, different scales (Low)

auto_pct: 97 % on the card, 0.97 on Calculations through fmtQuantity with unit ratio (src/frontend-ob/src/components/Cpm/CpmCalculations.tsx:330; src/frontend-ob/src/components/Cpm/evidence/format.ts:13-22). good_error_pct likewise. Evidence: 0 to 100 against 0.00 to 1.00 (src/frontend-ob/src/components/Cpm/investigation/HypothesisPanel.tsx:42; src/frontend-ob/src/components/Cpm/evidence/views/FusionViews.tsx:100), against "one format" (src/frontend-ob/src/components/Cpm/evidenceScore.ts:6). MAE: "PV units" on Calculations though the registry may hold the unit (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:28; src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:110). Queue fallback "MAE x" has no unit (src/frontend-ob/src/components/Cpm/overview/GoodErrorBar.tsx:14).

### D-33 Version check compares a label (Medium)

CalcDrawer shows a green "Is this value current?" from calculation_version (src/frontend-ob/src/components/Cpm/CalcDrawer.tsx:208-222). Server comment: "version labels do not identify behaviour" (src/services/cplm-api/Controllers/CpmEventsController.cs:161). The label is a constant from Phase 1 (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:16) and did not change with CHG-094 (src/flink/src/main/java/com/ams/flink/cplm/fusion/DiagnosisBands.java:49). "Deployed now" is the newest stored row (src/services/cplm-api/Controllers/CpmEventsController.cs:134,159). Governance copy says any verdict can be attributed to the formula (src/frontend-ob/src/components/Cpm/CpmGovernance.tsx:228-229). Fleet RuleVersion is not shown (docs/theme/cpa-currenttheme.md:1172).

Decision: Q7 with the CPA owner.

### D-34 Logic files behind the code (Low)

| Doc says | Code | Evidence |
|---|---|---|
| Fleet basis 24 h | 12h default | kpi_calculation_logic/KPI-LOGIC.md:33 against src/services/cplm-api/Services/Kpi/FleetKpiModels.cs:12 |
| Same time of day, 14 days | Day end, 1095 days | kpi_calculation_logic/KPI-LOGIC.md:292-296 and kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:286 against src/services/cplm-api/Controllers/CpmFleetKpiController.cs:141,147-153 |
| Loop card window 24 h | 12h default | kpi_calculation_logic/KPI-LOGIC.md:164 against src/services/cplm-api/Controllers/CpmLoopKpiController.cs:41 |
| Control error card shows RMS | MAE only | kpi_calculation_logic/KPI-LOGIC.md:175, kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:314 against src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:138-141 |
| limit_source REGISTRY | DECLARED_RANGE | kpi_calculation_logic/KPI-LOGIC.md:139 against src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:224 |
| Effort inputs travel, reversals | σ ratio | kpi_calculation_logic/KPI-LOGIC.md:131 against kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:145 |
| Operating picture from fleet/summary statuses | fleet/kpis | prod_decision.md:108 against src/frontend-ob/src/components/Cpm/overview/OperatingPicture.tsx:34 |
| Completeness on its own median Δt | Declared grid first | kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:554 against src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:85-86 |
| G4 inputs include travel and reversals | Not inputs | kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:99 against src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:322-348 |
| "No fault found" | "No fault identified" | kpi_calculation_logic/KPI-LOGIC.md:287 against src/frontend-ob/src/components/Cpm/vocabulary.ts:170 |
| Margins and SIMC not produced | Code path exists | kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:224 against src/flink/src/main/java/com/ams/flink/cplm/response/ResponseEvaluator.java:224-233,252 |

### D-35 Population differs under one word (Medium)

"N loop(s) in scope": every registered loop on /cpm (src/frontend-ob/src/components/Cpm/CpmOverview.tsx:99; src/services/cplm-api/Controllers/CpmFleetController.cs:66,100), monitored and capped at 200 on /cpm/investigation (src/frontend-ob/src/components/Cpm/CpmInvestigation.tsx:74,180). Readiness and Diagnostic capability count registered loops beside tiles counting monitored or assessed ones (src/services/cplm-api/Controllers/CpmFleetController.cs:65-81; src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:153).

### D-36 "Never evaluated" after retention (Low)

The test is "no row kept" (src/services/cplm-api/Data/FleetKpiSql.cs:45-52). Gate results are pruned at 30 or 14 days (prod_decision.md:53). A loop off for longer reads never evaluated. Not determined whether this occurs on the plant.

### D-37 Episode severity is the latest, shown beside the peak (Medium)

Title "Peak: …" with a severity pill beside it (src/frontend-ob/src/components/Cpm/events/EventDetail.tsx:101-102). Code comment says the episode's peak (src/frontend-ob/src/components/Cpm/events/EventDetail.tsx:32). Stored value follows the last verdict (src/services/cplm-api/Services/EventFrameLifecycle.cs:197). Column "Severity" sorts by peak evidence (src/frontend-ob/src/components/Cpm/CpmEvents.tsx:175-176; src/services/cplm-api/Data/EventPageSql.cs:62-64).

### D-38 "Bad quality" wording (Medium)

gate0_reason QUALITY_UNKNOWN maps to "bad quality" because the test is Contains("QUALITY") (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:91), though the engine separates them for a reason: "a different operator action" (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:137-141). "Bad-quality samples" includes UNCERTAIN and UNKNOWN (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:100-101). G0.bad_fraction_max 0.05 governs PASS only; the FAIL limit 0.50 is fixed (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:122,130).

### D-39 "0 % of 0" (Low)

pct returns 0 for denominator 0 (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:21-22). The trend treats the same case as no data (src/frontend-ob/src/components/Cpm/kpi/kpiTrend.ts:26). kpi_calculation_logic/KPI-LOGIC.md:20-21.

### D-40 Tile colour rules (Medium)

Performing acceptably is green at any count ≥ 1 (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:25): 1 of 175 is green. Every condition tile is amber at count ≥ 1, whatever the share (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:33). Never evaluated is grey at any count (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:32). In auto mode alone has a target (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:24,29). Fleet comment says colour only where it means something (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:5-6). Q6 and Q7.

### D-41 Period and stiction score naming (Low)

"Oscillation period" is acf_period_s on Investigation and Calculations, validated_period_s on /cpm/kpi (src/frontend-ob/src/components/Cpm/investigation/keyFacts.ts:8; src/services/cplm-api/Services/Kpi/FleetKpiRows.cs:94). "Stiction score" and "OP triangularity" are the same number (src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionEvidence.java:66; src/frontend-ob/src/components/Cpm/investigation/keyFacts.ts:5,7).

### D-42 Loop change "24 h earlier" has no age limit (Medium)

"change vs the window 24 h earlier" (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:40). Query: newest row with window_end ≤ now − 24 h, no lower bound (src/services/cplm-api/Controllers/CpmLoopKpiController.cs:24-31,63). After an outage the base can be days old with the same words. The fleet version re-applies freshness at that instant (kpi_calculation_logic/KPI-LOGIC.md:280).

### D-43 "No fault, but out of mode or at limit" (Low)

Label at src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:47 and src/frontend-ob/src/components/Cpm/CpmKpiDrilldown.tsx:39; the set includes G3 and G4 cases (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:75-85).

### D-44 Three copies of the mode list (Low)

src/flink/src/main/java/com/ams/flink/cplm/CplmNormalizedSample.java:227-232, src/frontend-ob/src/components/Cpm/shared.tsx:191-197, src/frontend-ob/src/utils/modeVocabulary.ts:14-20; ingestion holds a fourth (src/frontend-ob/src/utils/modeVocabulary.ts:4). shared.tsx adds a manual fallback the others lack (src/frontend-ob/src/components/Cpm/shared.tsx:211).

### D-45 Last fused verdict age (Low)

12h hardcoded, 200-row cap, newest real verdict, so INSUFFICIENT_DATA output does not refresh it (src/frontend-ob/src/components/Cpm/CpmPipeline.tsx:52-55,69-76; src/services/cplm-api/Data/FleetLatestSql.cs:34-55).

### D-46 Response uncertainty and margins against the doc (Low)

UI: "± 1 standard error of the estimate" (src/frontend-ob/src/components/Cpm/response/responseSupport.ts:96). Doc: "standard errors (bootstrap 200, 95 %)" (kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:220). Doc: margins and SIMC "Not produced" (kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:224); UI has a panel (src/frontend-ob/src/components/Cpm/response/BodePanel.tsx:37-47). Whether any plant event reaches it: not determined.

### D-47 Shelved counts (Low)

Queue button: current findings of this window kind (src/services/cplm-api/Data/FleetPrioritySql.cs:95-100). Tab it opens: every active shelf (src/services/cplm-api/Data/EventPageSql.cs:39).

### D-48 "Weak evidence" on a persistence cap (Low)

"Symptom only (weak evidence)" (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:46) also covers a strong result rewritten to DETECTED by persistence (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:418-431).

### D-49 Values with no entry in the catalogue (Low)

Good-error band, ITAE, PV variability, setpoint changes, phase area, freeze index and fraction are shown and absent from calcCatalogue (src/frontend-ob/src/components/Cpm/calcCatalogue.ts:24-47). Partly from docs/theme/cpa-currenttheme.md:1182-1184. A band that decides a KPI is not visible on the card that uses it (M-081).

## Hardcoded values acting as measured or judged

Extends docs/theme/cpa-currenttheme.md:791-798. "UI" rows are literals in the frontend that decide a colour or state a value. "Engine" rows are literals with no governed property; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:553 lists part of them.

### UI: values shown as if measured

| Value | Where | Acts as |
|---|---|---|
| OP "%" | src/frontend-ob/src/components/Cpm/explorer/summary/OperatingState.tsx:99-102; src/frontend-ob/src/components/Cpm/historical/chartOption.ts:246 | Unit of a raw value |
| %/day, "PV units" | src/frontend-ob/src/components/Cpm/calcCatalogue.ts:28,34 | Unit; true only for a 0-100 OP or undeclared unit |
| "Kept 3 days" | src/frontend-ob/src/components/Cpm/evidence/EvaluateWindow.tsx:62; src/frontend-ob/src/components/Cpm/evidence/evidenceBasis.ts:79 | Retention; actual in retention_policy (prod_decision.md:48) |
| "20 s cadence" | src/frontend-ob/src/components/Cpm/CpmPipeline.tsx:230 | Poll default (src/frontend-ob/src/hooks/useCpm.ts:405) |
| "detected within a minute" | src/frontend-ob/src/components/Cpm/events/ConditionsPanel.tsx:60 | Latency, not measured |
| Retention 30, 365, /mnt/backups/ams | src/frontend-ob/src/components/Administration/SystemSettingsConfig.tsx:9-11 | Illustrative, flagged on screen (docs/theme/cpa-currenttheme.md:800) |
| 5 s grid fallback | src/frontend-ob/src/components/Cpm/windows/windowMath.ts:8 | Assumed sample period, labelled "assumed" |
| "1 h (four missed 15-minute evaluations)" | src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:131 | Text copy of a configurable value |
| "5 %", "10 %" in KPI_WHY | src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:123-125,129,135 | Text copy of configurable values |
| "evidence ≥ 75" | src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:141; src/frontend-ob/src/components/Cpm/kpi/kpiMeta.ts:47; src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:126,134 | Text copy of an engine band |
| "rule ≥ 95 %", "rule ≤ 10 %", "Below 95 %" | src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:132,146,161 | Text; not read from the served basis |
| G9 "supporting-only" | src/frontend-ob/src/components/Cpm/ProfileAside.tsx:123-124 | Static claim; PRIMARY on two classes |

### UI: thresholds that judge

| Value | Where | Drives |
|---|---|---|
| 0.95, 0.10, 0.95 | src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:40-42 | Card tone and "relevant" outline |
| 80, 50 | src/frontend-ob/src/components/Cpm/overview/GoodErrorBar.tsx:25 | Bar green, amber, red |
| 0.10 out-of-mode target | src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:24 | Tile green or amber |
| count > 0 | src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:25,33 | Tile green or amber |
| never-evaluated | src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:32 | Always grey |
| ?? 0.5 | src/frontend-ob/src/components/Cpm/kpi/kpiMeta.ts:41 | Threshold text |
| '12h' fallback | src/frontend-ob/src/components/Cpm/overview/OperatingPicture.tsx:44; src/frontend-ob/src/components/Cpm/CpmPipeline.tsx:55 | Label; the Pipeline value |
| 3 h | src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:57 | Stale banner |
| 10 min | src/frontend-ob/src/components/Cpm/FacetPill.tsx:43; src/frontend-ob/src/components/Cpm/events/ConditionsPanel.tsx:16 | Stale live value and condition |
| 99 % | src/frontend-ob/src/components/Cpm/CpmPipeline.tsx:160 | Checkpoint tile |
| 0.9, 0.5 | src/frontend-ob/src/components/Cpm/CpmWindows.tsx:188 | % full pill |
| 0.6 | src/frontend-ob/src/components/Cpm/windows/WindowDetail.tsx:101,243 | Sparse bucket |
| 0.7 | src/frontend-ob/src/components/Cpm/investigation/HypothesisPanel.tsx:37 | Score bar highlight |
| caption string test | src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:231 | Amber on one tile by its caption text |
| capped > 0 | src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:238 | Capability tile amber |
| 168 h, presets | src/frontend-ob/src/components/Cpm/events/EventDetail.tsx:29; src/frontend-ob/src/components/Cpm/events/shelfState.ts:30-35 | Shelf fallback and options |
| 60 s | src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:76 | Whether a gap is reported |
| priority matrix | src/services/cplm-api/Data/FleetPrioritySql.cs:61-74 | Priority level and alarm colours; "unset = medium", "unset = LOW" |
| 75.0 | src/services/cplm-api/Services/Kpi/FleetKpiRows.cs:61 | Meter mark |
| FamilyChangeWindows 3 | src/services/cplm-api/Services/EventFrameLifecycle.cs:81 | Episode hand-over |
| LiveDays 14, MaxTrendDays 1095 | src/services/cplm-api/Controllers/CpmFleetKpiController.cs:141,144 | Trend reach; gate retention is 30 or 14 (prod_decision.md:53) |

### Engine: literals with no governed property

| Value | Where | Judges |
|---|---|---|
| bad_quality ≥ 0.50 | src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:122 | G0 FAIL |
| n < 10 | src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:150 | Window declined |
| MIN_SAMPLES 32 | src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:59 | No row emitted |
| G1 pass 0.90 | src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:88 | G1, no bundle property |
| G0 pass 0.98 | src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:85 | G0, no bundle property |
| 0.05, 0.20 | src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:224,227 | G2r |
| period > 0 | src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:137 | G5 |
| peak ratio 0.5 | src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:157 | G6 |
| 0.30 | src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:22 | G9 STRONG |
| 60 s, 10 % | src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:262 | Material freeze, exclusion |
| 0.35, 0.55, 0.75, 0.90 | src/flink/src/main/java/com/ams/flink/cplm/fusion/DiagnosisBands.java:44-57 | Bands and severity |
| 0.89, 0.54 | src/flink/src/main/java/com/ams/flink/cplm/fusion/Confirmation.java:80-81; src/flink/src/main/java/com/ams/flink/cplm/fusion/DiagnosisBands.java:68; src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:425-427 | Score caps |
| 0.55 | src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionEvidence.java:88-89,124-125,168 | Qualification |
| 8.0 | src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionEvidence.java:65 | Effort score scale |
| 0.15 | src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionEvidence.java:85 | Harmonic evidence |
| reversalCount ≥ 3 | src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionEvidence.java:95 | Actuator stress, on a window-size-dependent count |
| 1e-9, 1e-6 | src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:22-23 | Reversal and SP change counts |
| 0.5 EU minimum response | src/flink/src/main/java/com/ams/flink/cplm/response/metrics/ResponseMetricCalculator.java:21-22 | Whether a response is meaningful, absolute for any span |
| 3 × noise, 0.1, 0.02 | src/flink/src/main/java/com/ams/flink/cplm/response/validation/ModelValidator.java:91,94 | Model verdict |
