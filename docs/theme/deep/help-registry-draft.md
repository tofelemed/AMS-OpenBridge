# Help registry draft

One entry per concept in [metric-lineage.md](metric-lineage.md). Every field is marked **as implemented, pending approval (Q7)**. Nothing here is an approved definition, and a field that carries a known conflict says so by pointing at its discrepancy. Do not publish this text to users before control engineering answers Q7.

Link target is the place a user can reach the value's proof today.


## Fleet population

### M-001 Monitored loops

- **What it measures:** Every monitored loop in scope. (as implemented, pending approval (Q7))
- **Formula:** No engine calculation. Registry filter COALESCE((r.monitoring->>'enabled')::boolean, FALSE) (src/services/cplm-api/Data/FleetKpiSql.cs:65); count = loops.Count (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:62). Performance reads the same flag through COUNT FILTER (src/services/cplm-api/Controllers/CpmFleetController.cs:67). (as implemented, pending approval (Q7))
- **Window and eligibility:** Current registry. UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34). Eligibility: monitoring.enabled true, in plant scope. (as implemented, pending approval (Q7))
- **Unit:** count; computed as count. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Consistent. See M-001 in the register before using this text. (as implemented, pending approval (Q7))

### M-002 Loops in scope (registered population)

- **What it measures:** No definition is displayed for Loops in scope (registered population). (as implemented, pending approval (Q7))
- **Formula:** /cpm: COUNT(*) of the registry in scope, unmonitored included (src/services/cplm-api/Controllers/CpmFleetController.cs:66,100). /cpm/investigation: rankings.count, monitored only and capped at limit 200 (src/frontend-ob/src/components/Cpm/CpmInvestigation.tsx:74,180; src/services/cplm-api/Controllers/CpmFleetController.cs:155,247). (as implemented, pending approval (Q7))
- **Window and eligibility:** Current registry; rankings polled 60 s. Eligibility: Differs: all registered on /cpm, monitored and at most 200 on /cpm/investigation. (as implemented, pending approval (Q7))
- **Unit:** count; computed as count. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-002 in the register before using this text. (as implemented, pending approval (Q7))

## Fleet state

### M-003 Assessed loops

- **What it measures:** Loops whose fresh window was judged. (as implemented, pending approval (Q7))
- **Formula:** Classifier state: fresh, diagnosis not empty, not PENDING, not INSUFFICIENT_DATA, not EXCLUDED* (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:44-51,57-71). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34). Eligibility: Newest LIVE row of the window kind, fresh, and a verdict. (as implemented, pending approval (Q7))
- **Unit:** count; computed as count. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172). (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Consistent. See M-003 in the register before using this text. (as implemented, pending approval (Q7))

### M-004 Fleet state bar

- **What it measures:** The state bar: every monitored loop in exactly one segment (sums to `monitored`). (as implemented, pending approval (Q7))
- **Formula:** Segments from server counts (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:42-51). Server also returns assessed.unrecognised (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:74), which has no segment. (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34). Eligibility: Every monitored loop. (as implemented, pending approval (Q7))
- **Unit:** count and % in bar title; computed as count. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172). (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-004 in the register before using this text. (as implemented, pending approval (Q7))

## Fleet KPI

### M-005 Performing acceptably

- **What it measures:** No fault identified (NO_CALL / INSUFFICIENT_EVIDENCE), in normal mode ≥ {NormalModeMin:P0}, not at an OP limit > {SaturationMax:P0}, good-error share at or above the profile floor (G3 pass), actuator activity not strong (G4), {fresh}. (as implemented, pending approval (Q7))
- **Formula:** count(Assessed ∧ diagnosis ∈ {NO_CALL, INSUFFICIENT_EVIDENCE} ∧ PerformanceLimits empty) (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:57-60,75-85,103). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34). Eligibility: Assessed loops; a G3 that was not evaluated is not a pass (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:81-82). G4 WARN is allowed (kpi_calculation_logic/KPI-LOGIC.md:93). (as implemented, pending approval (Q7))
- **Unit:** count + "N % of M monitored loops"; computed as count over count. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172). (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Consistent. See M-005 in the register before using this text. (as implemented, pending approval (Q7))

### M-006 Loops in normal mode (fleet)

- **What it measures:** AUTO / CASCADE ≥ {NormalModeMin:P0} of the {WindowKind} window (> {1 - NormalModeMin:P0} out of design mode = out of mode), {fresh}. (as implemented, pending approval (Q7))
- **Formula:** count(fresh ∧ auto_pct ≥ NormalModeMin) ÷ count(fresh ∧ auto_pct measured) (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:33-35,136). Field: M-078. (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34). Eligibility: Fresh rows with a non-null auto_pct. Null when the window failed G0 or had n < 10 (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:19-21). (as implemented, pending approval (Q7))
- **Unit:** count + % of denominator; computed as count over count. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172). (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-006 in the register before using this text. (as implemented, pending approval (Q7))

### M-007 Loops out of normal mode

- **What it measures:** count(AUTO % < limit) ÷ loops with a measured mode. (as implemented, pending approval (Q7))
- **Formula:** NormalModeMeasured ∧ ¬InNormalMode (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:111). The server returns no figure for it (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:130-154), so the page falls back to the list total (src/frontend-ob/src/components/Cpm/CpmKpiDrilldown.tsx:103). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34). Eligibility: As M-006. (as implemented, pending approval (Q7))
- **Unit:** count; computed as count. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172). (as implemented, pending approval (Q7))
- **Link target:** /cpm/kpi (as implemented, pending approval (Q7))
- **Register status:** Label only. See M-007 in the register before using this text. (as implemented, pending approval (Q7))

### M-008 Loops in manual

- **What it measures:** MANUAL ≥ {ManualModeMin:P0} of the {WindowKind} window (operated by hand most of the time), {fresh}. (as implemented, pending approval (Q7))
- **Formula:** count(fresh ∧ manual_pct ≥ ManualModeMin) ÷ count(fresh ∧ manual_pct measured) (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:37-38,138). manual_pct = 1 − auto_pct (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:194), so every non-auto sample counts: UNKNOWN, null and unmapped tokens included (src/flink/src/main/java/com/ams/flink/cplm/CplmNormalizedSample.java:234-244). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34). Eligibility: Fresh rows with non-null manual_pct. (as implemented, pending approval (Q7))
- **Unit:** count + % of denominator; computed as count over count. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172). (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Engine-UI conflict. See M-008 in the register before using this text. (as implemented, pending approval (Q7))

### M-009 Oscillating loops

- **What it measures:** Suspected or confirmed oscillation (evidence ≥ 75), {fresh}. (as implemented, pending approval (Q7))
- **Formula:** Outcome Finding ∧ family OSCILLATION (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:65-71,107). Family qualifies when max(acf_regularity, fft_peak_ratio) ≥ 0.55 or G5/G6 is WARN/STRONG, with no valid-period requirement on that path (src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionEvidence.java:78-84,167-171). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34). Eligibility: Assessed loops. Persistence 2 of 3 windows, else capped to DETECTED (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:396-431). (as implemented, pending approval (Q7))
- **Unit:** count + % of denominator; computed as count over count. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172). (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-009 in the register before using this text. (as implemented, pending approval (Q7))

### M-010 Suspected valve problem

- **What it measures:** Suspected or confirmed final-element nonlinearity (stiction / backlash), {fresh}. (as implemented, pending approval (Q7))
- **Formula:** Outcome Finding ∧ family FINAL_ELEMENT_NONLINEARITY (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:108). Families stiction and geometry both map to this label (src/flink/src/main/java/com/ams/flink/cplm/fusion/DiagnosisBands.java:20-21). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34). Eligibility: Assessed loops. (as implemented, pending approval (Q7))
- **Unit:** count + % of denominator; computed as count over count. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172). (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Label only. See M-010 in the register before using this text. (as implemented, pending approval (Q7))

### M-011 Excessive actuator effort

- **What it measures:** Suspected or confirmed excessive effort (OP travel / reversals), {fresh}. (as implemented, pending approval (Q7))
- **Formula:** Family score = clamp01(effort_ratio / 8) × priorEffort; qualified when score ≥ 0.55 or G4/G10 is WARN/STRONG (src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionEvidence.java:65,146-149). effort_ratio = σ(OP)/σ(PV) (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:289). travel_per_day and reversals_per_hour are not inputs to this family. (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34). Eligibility: Assessed loops. (as implemented, pending approval (Q7))
- **Unit:** count + % of denominator; computed as count over count. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172). (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Engine-UI conflict. See M-011 in the register before using this text. (as implemented, pending approval (Q7))

### M-012 Saturated loops

- **What it measures:** OP fully open or closed > {SaturationMax:P0} of the window, {fresh}. (as implemented, pending approval (Q7))
- **Formula:** count(fresh ∧ saturation_pct > SaturationMax) ÷ count(fresh ∧ saturation_pct measured) (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:34-36,146). Field: M-088. (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34). Eligibility: Fresh rows with non-null saturation_pct, excluded windows included. (as implemented, pending approval (Q7))
- **Unit:** count + % of denominator; computed as count over count. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172). (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Engine-UI conflict. See M-012 in the register before using this text. (as implemented, pending approval (Q7))

## Fleet state

### M-013 Not assessable loops

- **What it measures:** Fresh window could not be judged: incomplete data (< {G0CompletenessMin:P0}), bad quality, manual mode, outside region or instrument fault. (as implemented, pending approval (Q7))
- **Formula:** State NotAssessable when fresh and diagnosis is empty, PENDING, INSUFFICIENT_DATA or EXCLUDED* (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:47-51). Exclusions come from fusion (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:126-149). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34). Eligibility: Fresh rows only; a stale excluded loop reads M-015. (as implemented, pending approval (Q7))
- **Unit:** count; sub-line reason counts or "N % of monitored"; computed as count. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172). (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Engine-UI conflict. See M-013 in the register before using this text. (as implemented, pending approval (Q7))

### M-014 Not-assessable reason

- **What it measures:** INCOMPLETE_DATA: incomplete data; BAD_QUALITY: bad quality; DATA_QUALIFICATION: data not qualified; MANUAL_MODE: manual mode; OUTSIDE_OPERATING_REGION: outside operating region; INSTRUMENT_HEALTH: instrument fault; SENSOR_FAULT: sensor fault; NOT_YET_JUDGED: not yet judged; EXCLUDED_OTHER: excluded. (as implemented, pending approval (Q7))
- **Formula:** EXCLUDED_* maps by table (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:19-26). INSUFFICIENT_DATA maps through gate0_reason, then inputs (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:88-96). gate0_reason is QUALITY_UNKNOWN, BAD_QUALITY or INCOMPLETE (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:139-147). A declined window sets sufficientData false, so fusion returns INSUFFICIENT_DATA before the G0 block (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:150-158; src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:126-133). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34). Eligibility: Not-assessable loops. (as implemented, pending approval (Q7))
- **Unit:** count per reason; computed as count. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172). (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-014 in the register before using this text. (as implemented, pending approval (Q7))

### M-015 Stale loops

- **What it measures:** Newest {WindowKind} result older than {FreshSeconds/60} min — the pipeline or feed stopped producing. (as implemented, pending approval (Q7))
- **Formula:** Window exists and not fresh (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:44-45). Note a slice below 32 samples is not emitted at all (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:41-43,59). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34). Eligibility: Newest LIVE row exists. (as implemented, pending approval (Q7))
- **Unit:** count; computed as count. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172). (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-015 in the register before using this text. (as implemented, pending approval (Q7))

### M-016 Never evaluated loops

- **What it measures:** No {WindowKind} result yet — onboarding or mapping gap. (as implemented, pending approval (Q7))
- **Formula:** No LIVE row of the kind with window_end ≤ asOf among the rows kept (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:44; src/services/cplm-api/Data/FleetKpiSql.cs:45-52). Gate results are kept 30 days, or 14 under the headroom rule (prod_decision.md:53). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34). Eligibility: Monitored loops. (as implemented, pending approval (Q7))
- **Unit:** count; computed as count. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172). (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-016 in the register before using this text. (as implemented, pending approval (Q7))

### M-017 Loops with a finding

- **What it measures:** Suspected or confirmed findings of any family. (as implemented, pending approval (Q7))
- **Formula:** Outcome Finding when band is SUSPECTED or CONFIRMED (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:65-70). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34). Eligibility: Assessed loops. (as implemented, pending approval (Q7))
- **Unit:** count; computed as count. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172). (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Consistent. See M-017 in the register before using this text. (as implemented, pending approval (Q7))

### M-018 Symptom-only loops

- **What it measures:** Detected or classified symptoms: evidence below 75, listed but not counted as findings. (as implemented, pending approval (Q7))
- **Formula:** Outcome SymptomOnly for DETECTED or CLASSIFIED (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:68). A strong result that fails persistence is rewritten to DETECTED at 0.54 (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:418-431), and a contradicted valve claim is capped at 0.54 (src/flink/src/main/java/com/ams/flink/cplm/fusion/Confirmation.java:80). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34). Eligibility: Assessed loops. (as implemented, pending approval (Q7))
- **Unit:** count; computed as count. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172). (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-018 in the register before using this text. (as implemented, pending approval (Q7))

### M-019 No fault, but limited

- **What it measures:** No fault, but out of mode or at limit. (as implemented, pending approval (Q7))
- **Formula:** Outcome NoFaultLimited when PerformanceLimits is not empty: OUT_OF_MODE, SATURATED, G3_BELOW_FLOOR, G3_NOT_EVALUATED, G4_STRONG (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:60,75-85). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34). Eligibility: Assessed, no-fault diagnosis. (as implemented, pending approval (Q7))
- **Unit:** count; computed as count. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172). (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-019 in the register before using this text. (as implemented, pending approval (Q7))

## Fleet KPI

### M-020 Fleet KPI change since 24 h ago

- **What it measures:** Change since 24 h ago: {then} % ({count} of {denominator}) → {now} % now ({count} of {denominator}), {N} percentage points {direction}. (as implemented, pending approval (Q7))
- **Formula:** Round(share now − share then), shares in % (src/frontend-ob/src/components/Cpm/kpi/kpiMeta.ts:80-82). Then = same classifier as of now − 24 h (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:56,257). (as implemented, pending approval (Q7))
- **Window and eligibility:** Two classifications 24 h apart, each on the page's fused window. Registry membership is today's (kpi_calculation_logic/KPI-LOGIC.md:283-284). Eligibility: Hidden when either denominator is 0 (src/frontend-ob/src/components/Cpm/kpi/kpiMeta.ts:79). (as implemented, pending approval (Q7))
- **Unit:** pp, integer; computed as pp. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172). (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Consistent. See M-020 in the register before using this text. (as implemented, pending approval (Q7))

### M-021 KPI daily trend point

- **What it measures:** Last {range} · each {plant day} at its end, same rules. (as implemented, pending approval (Q7))
- **Formula:** One point per plant day as of the day end, read from analytics.cplm_kpi_daily when stored, else classified live inside 14 days, else empty (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:147-153,164-193). Share rounded to 0.1 (src/frontend-ob/src/components/Cpm/kpi/kpiTrend.ts:26). (as implemented, pending approval (Q7))
- **Window and eligibility:** Plant day from Cpm:PlantTimeZone (src/services/cplm-api/Services/Kpi/PlantClock.cs:1-8; compose default local: infra/docker/docker-compose.yml:1446). Last point is the live snapshot. Eligibility: A day with denominator 0 is no data (src/frontend-ob/src/components/Cpm/kpi/kpiTrend.ts:26). (as implemented, pending approval (Q7))
- **Unit:** % rounded to 0.1, axis 0–100; computed as share. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: rule_version on each stored day (src/services/cplm-api/Services/Kpi/FleetKpiDaily.cs:21). Shown: no. (as implemented, pending approval (Q7))
- **Link target:** /cpm/kpi (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-021 in the register before using this text. (as implemented, pending approval (Q7))

### M-022 Share of denominator

- **What it measures:** "of 160 assessed loops" — the denominator is always named, so a % can be checked. (as implemented, pending approval (Q7))
- **Formula:** denominator > 0 ? round(count/denominator × 100) : 0 (src/frontend-ob/src/components/Cpm/kpi/fleetKpiView.ts:21-22). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34). Eligibility: Any figure. (as implemented, pending approval (Q7))
- **Unit:** integer %; computed as integer %. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172). (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-022 in the register before using this text. (as implemented, pending approval (Q7))

### M-023 Deciding value against the rule

- **What it measures:** the value that put this loop here, against its threshold. (as implemented, pending approval (Q7))
- **Formula:** Server chooses one value per KPI (src/services/cplm-api/Services/Kpi/FleetKpiRows.cs:48-70); client words the comparison (src/frontend-ob/src/components/Cpm/kpi/kpiProof.ts:15-28). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34). Eligibility: Rows of the selected KPI. (as implemented, pending approval (Q7))
- **Unit:** % to 0.1, score, or duration; computed as fraction, score, seconds. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172). (as implemented, pending approval (Q7))
- **Link target:** /cpm/kpi (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-023 in the register before using this text. (as implemented, pending approval (Q7))

### M-024 KPI computed time

- **What it measures:** No definition is displayed for KPI computed time. (as implemented, pending approval (Q7))
- **Formula:** computedAt = time of the classification, cached up to 15 s (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:257-258). (as implemented, pending approval (Q7))
- **Window and eligibility:** Server clock UTC, shown in the browser zone (src/frontend-ob/src/components/Cpm/shared.tsx:62-63). Eligibility: n/a (as implemented, pending approval (Q7))
- **Unit:** date time with zone name; computed as instant. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Consistent. See M-024 in the register before using this text. (as implemented, pending approval (Q7))

### M-025 KPI basis and threshold cards

- **What it measures:** Each monitored loop counted once from its newest {windowKind} result, at most {freshSeconds/60} min old · normal mode ≥ {normalModeMin} % · at limit > {saturationMax} % · findings = suspected or confirmed. (as implemented, pending approval (Q7))
- **Formula:** Text from server basis object (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:238-247). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34). Eligibility: n/a (as implemented, pending approval (Q7))
- **Unit:** text; computed as text. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172). (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-025 in the register before using this text. (as implemented, pending approval (Q7))

## Priority queue

### M-026 Priority level

- **What it measures:** Ordered by priority (loop criticality × finding severity), then time outside the good-error band, then how long the condition has persisted, then evidence score. Shelved loops are listed in Loop Events. (as implemented, pending approval (Q7))
- **Formula:** CASE matrix over criticality and severity (src/services/cplm-api/Data/FleetPrioritySql.cs:61-74). Order: priority, good_error_pct ASC, opened_at ASC, confidence DESC, loop_id (src/services/cplm-api/Data/FleetPrioritySql.cs:86-90). Severity is only the evidence band (M-028). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/hooks/useCpm.ts:194,203); API cache 15 s (src/services/cplm-api/Controllers/CpmFleetController.cs:42). Eligibility: M-027. (as implemented, pending approval (Q7))
- **Unit:** three levels; computed as 1, 2, 3. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: no. (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-026 in the register before using this text. (as implemented, pending approval (Q7))

### M-027 Priority queue membership

- **What it measures:** No loop has a current confirmed or suspected finding. The operating picture above shows the rest of the fleet. (as implemented, pending approval (Q7))
- **Formula:** Newest real LIVE verdict per loop, window end within the window length, diagnosis matches ^(CONFIRMED|SUSPECTED|DETECTED|CLASSIFIED)_, not actively shelved (src/services/cplm-api/Data/FleetPrioritySql.cs:30-41,53-54,84). Rows 6 of up to 50 shown (src/frontend-ob/src/components/Cpm/overview/PriorityQueue.tsx:25,65). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/hooks/useCpm.ts:194,203); API cache 15 s (src/services/cplm-api/Controllers/CpmFleetController.cs:42). Eligibility: Monitored; verdict not older than the window length; the newest row itself may be INSUFFICIENT_DATA. (as implemented, pending approval (Q7))
- **Unit:** rows; computed as rows. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: no. (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-027 in the register before using this text. (as implemented, pending approval (Q7))

### M-028 Severity

- **What it measures:** The episode's peak, in the engine's own bands (CHG-092, SME review 2 #6/#20): the engine's severity when it wrote one, otherwise the band of the peak diagnosis — never a second set of score thresholds of our own. (as implemented, pending approval (Q7))
- **Formula:** Set from the confidence band only: < 0.55 LOW, < 0.75 MEDIUM, ≥ 0.75 HIGH (src/flink/src/main/java/com/ams/flink/cplm/fusion/DiagnosisBands.java:44-72); LOW on every blocked row (src/flink/src/main/java/com/ams/flink/cplm/fusion/BlockingExclusions.java:17,34); LOW after the persistence cap (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:422). Episode severity = last verdict's severity (src/services/cplm-api/Services/EventFrameLifecycle.cs:197). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Eligibility: Shown on findings on the loop summary (src/frontend-ob/src/components/Cpm/explorer/summary/LoopSummaryCard.tsx:114). (as implemented, pending approval (Q7))
- **Unit:** word; computed as enum. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: no. (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-028 in the register before using this text. (as implemented, pending approval (Q7))

### M-029 Loop criticality

- **What it measures:** No definition is displayed for Loop criticality. (as implemented, pending approval (Q7))
- **Formula:** Registry value. No engine calculation. Unset = medium in the priority matrix (src/services/cplm-api/Data/FleetPrioritySql.cs:63,70). (as implemented, pending approval (Q7))
- **Window and eligibility:** Registry, on change. Eligibility: Registry loops. (as implemented, pending approval (Q7))
- **Unit:** word; computed as text. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Consistent. See M-029 in the register before using this text. (as implemented, pending approval (Q7))

### M-030 Episode age in queue

- **What it measures:** "Critical loop · High severity · 21% in band · persisting 3 days (12 windows) · evidence score 100". Missing facts are left out, never shown as zero. (as implemented, pending approval (Q7))
- **Formula:** Now − opened_at of the newest open frame of this window kind; window_count counts disjoint windows only (src/services/cplm-api/Data/FleetPrioritySql.cs:43-47; src/services/cplm-api/Services/EventFrameLifecycle.cs:198). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/hooks/useCpm.ts:194,203); API cache 15 s (src/services/cplm-api/Controllers/CpmFleetController.cs:42). Eligibility: Loop has an open frame. (as implemented, pending approval (Q7))
- **Unit:** age words + windows; computed as duration, count. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Label only. See M-030 in the register before using this text. (as implemented, pending approval (Q7))

### M-031 Shelved count

- **What it measures:** Shelved loops are left out of the queue; review them in Loop Events. (as implemented, pending approval (Q7))
- **Formula:** /cpm: current findings of this window kind with an active shelf (src/services/cplm-api/Data/FleetPrioritySql.cs:27-55,95-100). /cpm/events: every episode with an active shelf, any kind, any age (src/services/cplm-api/Data/EventPageSql.cs:39). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/hooks/useCpm.ts:194,203); API cache 15 s (src/services/cplm-api/Controllers/CpmFleetController.cs:42). Eligibility: Differs by surface. (as implemented, pending approval (Q7))
- **Unit:** count; computed as count. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-031 in the register before using this text. (as implemented, pending approval (Q7))

## Readiness

### M-032 Valve position expected but not mapped

- **What it measures:** Valve position expected but not mapped. (as implemented, pending approval (Q7))
- **Formula:** COUNT FILTER no vp tag and VP applicability EXPECTED, over the monitored loops in scope (src/services/cplm-api/Data/FleetRegistrySummarySql.cs). (as implemented, pending approval (Q7))
- **Window and eligibility:** Registry. UI poll 60 s (src/frontend-ob/src/hooks/useCpm.ts:170). Eligibility: Monitored loops. (as implemented, pending approval (Q7))
- **Unit:** count; computed as count. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Undocumented. See M-032 in the register before using this text. (as implemented, pending approval (Q7))

### M-033 Peer links expected but missing

- **What it measures:** Peer links expected but missing. (as implemented, pending approval (Q7))
- **Formula:** COUNT FILTER monitored, no peer links configured and peer applicability EXPECTED (src/services/cplm-api/Data/FleetRegistrySummarySql.cs). (as implemented, pending approval (Q7))
- **Window and eligibility:** Registry. UI poll 60 s (src/frontend-ob/src/hooks/useCpm.ts:170). Eligibility: Monitored loops. (as implemented, pending approval (Q7))
- **Unit:** count; computed as count. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Undocumented. See M-033 in the register before using this text. (as implemented, pending approval (Q7))

### M-034 Plant facts counts

- **What it measures:** Plant facts, nothing to fix: {n} without positioner feedback installed (valve cause suspected, not confirmed) · {n} without a valve (valve diagnosis does not apply) · {n} without interacting loops (G13 does not apply). (as implemented, pending approval (Q7))
- **Formula:** COUNT FILTER by applicability (src/services/cplm-api/Controllers/CpmFleetController.cs:71-72,75-76). (as implemented, pending approval (Q7))
- **Window and eligibility:** Registry. Eligibility: Registered loops. (as implemented, pending approval (Q7))
- **Unit:** count; computed as count. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Undocumented. See M-034 in the register before using this text. (as implemented, pending approval (Q7))

### M-035 Diagnostic capability

- **What it measures:** {n} valve loop(s) with VP expected but not mapped — valve faults there need an approved test record to be confirmed. (as implemented, pending approval (Q7))
- **Formula:** valves = monitored − vpNotApplicable; withVp = valves − expectedUnmapped − vpNotInstalled (src/frontend-ob/src/components/Cpm/overview/capabilityCopy.ts:41-42). fleetTotal = loops.monitored, the monitored loops its drill-down lists (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx). G14 has no approved-test path (src/flink/src/main/java/com/ams/flink/cplm/fusion/Confirmation.java:42-74). (as implemented, pending approval (Q7))
- **Window and eligibility:** Registry. Eligibility: Registered loops. (as implemented, pending approval (Q7))
- **Unit:** x/y; computed as counts. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm/performance (as implemented, pending approval (Q7))
- **Register status:** Engine-UI conflict. See M-035 in the register before using this text. (as implemented, pending approval (Q7))

## Performance headline

### M-036 Fleet good-error time

- **What it measures:** Mean share of the window with |PV − SP| inside the good band, over every assessed loop in this scope (median {x}). (as implemented, pending approval (Q7))
- **Formula:** 100 × mean(good_error_pct) over assessed loops with a value; median in title (src/services/cplm-api/Services/Kpi/FleetKpiPerformance.cs:16,33-34). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34). Eligibility: Assessed; health filter not applied (src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:225-232). (as implemented, pending approval (Q7))
- **Unit:** % to 0.1; computed as mean of fractions × 100. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172). (as implemented, pending approval (Q7))
- **Link target:** /cpm/performance (as implemented, pending approval (Q7))
- **Register status:** Label only. See M-036 in the register before using this text. (as implemented, pending approval (Q7))

### M-037 Median error as share of span

- **What it measures:** Mean absolute error of each loop divided by its registered PV range (pvMax − pvMin), median across loops. Loops in different engineering units are never averaged directly; a loop without a registered range is left out. (as implemented, pending approval (Q7))
- **Formula:** 100 × MAE / PvSpan per loop, then median (src/services/cplm-api/Services/Kpi/FleetKpiPerformance.cs:10-11,18,40). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34). Eligibility: Assessed with MAE and a positive span. (as implemented, pending approval (Q7))
- **Unit:** % of span to 0.1; computed as % of span. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172). (as implemented, pending approval (Q7))
- **Link target:** /cpm/performance (as implemented, pending approval (Q7))
- **Register status:** Consistent. See M-037 in the register before using this text. (as implemented, pending approval (Q7))

### M-038 Loops with periodic diagnosis

- **What it measures:** Assessed loops whose current diagnosis is an oscillation or final-element family at any band. (as implemented, pending approval (Q7))
- **Formula:** Assessed ∧ family ∈ {OSCILLATION, FINAL_ELEMENT_NONLINEARITY} (src/services/cplm-api/Services/Kpi/FleetKpiPerformance.cs:20). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/components/Cpm/kpi/useFleetKpis.ts:16); API cache 15 s default (src/services/cplm-api/Controllers/CpmFleetKpiController.cs:34). Eligibility: Assessed. (as implemented, pending approval (Q7))
- **Unit:** count; computed as count. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Fleet rule version RuleVersion=1 is stored only on daily rows (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:10). Shown: no (docs/theme/cpa-currenttheme.md:1172). (as implemented, pending approval (Q7))
- **Link target:** /cpm/performance (as implemented, pending approval (Q7))
- **Register status:** Consistent. See M-038 in the register before using this text. (as implemented, pending approval (Q7))

## Performance page

### M-039 Newest fused window age

- **What it measures:** A fused window older than this is called out rather than shown as current. (as implemented, pending approval (Q7))
- **Formula:** max(window_end) over served rows, age against the browser clock (src/frontend-ob/src/components/Cpm/gateStatus.ts:301-309; src/frontend-ob/src/components/Cpm/CpmPerformance.tsx:167-169). The text says "emitted", the value is the window end, not created_at. (as implemented, pending approval (Q7))
- **Window and eligibility:** Newest row per loop at the page window. Eligibility: Any row. (as implemented, pending approval (Q7))
- **Unit:** min or h; computed as ms. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm/performance (as implemented, pending approval (Q7))
- **Register status:** Undocumented. See M-039 in the register before using this text. (as implemented, pending approval (Q7))

### M-040 Gate matrix row filters

- **What it measures:** Counts for the segmented filter. These are the honest denominators the page shows: a "Needs attention 3" chip beside "Not evaluated 51" is the single fastest way to see that most of the fleet has no verdict yet. (as implemented, pending approval (Q7))
- **Formula:** attention: any gate with reviewSeverity non-null; evaluated: diagnosis ≠ NOT_EVALUATED (src/frontend-ob/src/components/Cpm/gateStatus.ts:216-217,240-247,268-277). Rows are the newest LIVE row, of any diagnosis (src/services/cplm-api/Data/FleetLatestSql.cs:130-157). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/hooks/useCpm.ts:194,203); API cache 15 s (src/services/cplm-api/Controllers/CpmFleetController.cs:42). Eligibility: Monitored loops, up to 2000 (src/frontend-ob/src/hooks/useCpm.ts:201). (as implemented, pending approval (Q7))
- **Unit:** count; computed as count. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm/performance (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-040 in the register before using this text. (as implemented, pending approval (Q7))

### M-041 Gate roll-up counts

- **What it measures:** {key} {name}: {bad} failed, {warn} need attention. (as implemented, pending approval (Q7))
- **Formula:** bad: FAIL, STRONG, EXCLUDED*, CONFIRMED. warn: WARN, REVIEW, SUSPECTED (src/frontend-ob/src/components/Cpm/gateStatus.ts:187-192,286-298). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/hooks/useCpm.ts:194,203); API cache 15 s (src/services/cplm-api/Controllers/CpmFleetController.cs:42). Eligibility: Rows in scope. (as implemented, pending approval (Q7))
- **Unit:** count; computed as count. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm/performance (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-041 in the register before using this text. (as implemented, pending approval (Q7))

### M-042 Attention ranking

- **What it measures:** A11 — bad-actor ranking. Ordered by confidence within a real diagnosis, so the loops most likely to reward an engineer's time come first. (as implemented, pending approval (Q7))
- **Formula:** Rows from LatestProbe: newest real verdict of any age, else newest row (src/services/cplm-api/Data/FleetLatestSql.cs:34-55,98-118). "error" order = good_error_pct ASC (src/services/cplm-api/Controllers/CpmFleetController.cs:175). No freshness filter. (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/hooks/useCpm.ts:194,203); API cache 15 s (src/services/cplm-api/Controllers/CpmFleetController.cs:42). Eligibility: Monitored; rows with diagnosis NOT_EVALUATED are dropped client side (src/frontend-ob/src/components/Cpm/AttentionList.tsx:63-64). (as implemented, pending approval (Q7))
- **Unit:** rank; score or % in band; computed as order. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: no. (as implemented, pending approval (Q7))
- **Link target:** /cpm/performance (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-042 in the register before using this text. (as implemented, pending approval (Q7))

### M-043 Driving gates

- **What it measures:** Which gates on this row are warn or fail — i.e. why the verdict is what it is. (as implemented, pending approval (Q7))
- **Formula:** drivingGates uses reviewSeverity; resultGates uses the mark meaning (src/frontend-ob/src/components/Cpm/gateStatus.ts:174-176,210-214). The attention row joins ranked rows to heatmap rows by loop id (src/frontend-ob/src/components/Cpm/AttentionList.tsx:57-61). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s (src/frontend-ob/src/hooks/useCpm.ts:194,203); API cache 15 s (src/services/cplm-api/Controllers/CpmFleetController.cs:42). Eligibility: Rows in scope. (as implemented, pending approval (Q7))
- **Unit:** gate keys; computed as list. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm/performance (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-043 in the register before using this text. (as implemented, pending approval (Q7))

## Gate

### M-044 Gate result word and mark

- **What it measures:** THE gate mark. One symbol per MEANING, never per colour. (as implemented, pending approval (Q7))
- **Formula:** Meaning derived from status and gate tier (src/frontend-ob/src/components/Cpm/gateStatus.ts:95-116); vocabulary words derived from the status alone (src/frontend-ob/src/components/Cpm/vocabulary.ts:30-31). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26). Eligibility: Any gate cell. (as implemented, pending approval (Q7))
- **Unit:** mark, word, tone; computed as status enum. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown on Rules & parameters and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/tabs/RulesTab.tsx:51; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111). (as implemented, pending approval (Q7))
- **Link target:** /cpm/performance (as implemented, pending approval (Q7))
- **Register status:** Label only. See M-044 in the register before using this text. (as implemented, pending approval (Q7))

### M-045 G0 data quality

- **What it measures:** Data quality. (as implemented, pending approval (Q7))
- **Formula:** FAIL if bad_quality_pct ≥ 0.50; PASS if completeness ≥ 0.98 ∧ bad < 0.05 ∧ no duplicate; WARN if completeness ≥ 0.95; else FAIL (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:122-136). FAIL or n < 10 declines the window (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:150-158). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26). Eligibility: Any window with samples. (as implemented, pending approval (Q7))
- **Unit:** mark, word, tone; computed as status enum. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown on Rules & parameters and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/tabs/RulesTab.tsx:51; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111). (as implemented, pending approval (Q7))
- **Link target:** /cpm/performance (as implemented, pending approval (Q7))
- **Register status:** Consistent. See M-045 in the register before using this text. (as implemented, pending approval (Q7))

### M-046 G1 mode and service

- **What it measures:** Mode / service. (as implemented, pending approval (Q7))
- **Formula:** PASS ≥ 0.90, WARN ≥ 0.70, else EXCLUDED on auto_pct (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:197-203). EXCLUDED blocks fusion as EXCLUDED_MODE (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:134-136). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26). Eligibility: G0 not failed, n ≥ 10. (as implemented, pending approval (Q7))
- **Unit:** mark, word, tone; computed as status enum. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown on Rules & parameters and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/tabs/RulesTab.tsx:51; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111). (as implemented, pending approval (Q7))
- **Link target:** /cpm/performance (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-046 in the register before using this text. (as implemented, pending approval (Q7))

### M-047 G2 setpoint activity

- **What it measures:** Setpoint activity. (as implemented, pending approval (Q7))
- **Formula:** PASS if sp_range < band, else WARN; band always resolves, LEGACY_DEFAULT when no span is declared (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:211-213; src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:188-200). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26). Eligibility: G0 not failed, n ≥ 10. (as implemented, pending approval (Q7))
- **Unit:** mark, word, tone; computed as status enum. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown on Rules & parameters and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/tabs/RulesTab.tsx:51; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111). (as implemented, pending approval (Q7))
- **Link target:** /cpm/performance (as implemented, pending approval (Q7))
- **Register status:** Engine-UI conflict. See M-047 in the register before using this text. (as implemented, pending approval (Q7))

### M-048 G2r operating region

- **What it measures:** Fraction of the window inside the declared PV / input operating region; out-of-domain is not a healthy process. (as implemented, pending approval (Q7))
- **Formula:** Out-of-band share of samples: PASS ≤ 0.05, WARN ≤ 0.20, else FAIL (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:223-233). FAIL blocks as EXCLUDED_OPERATING_REGION (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:137-139). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26). Eligibility: G0 not failed, n ≥ 10. (as implemented, pending approval (Q7))
- **Unit:** mark, word, tone; computed as status enum. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown on Rules & parameters and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/tabs/RulesTab.tsx:51; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111). (as implemented, pending approval (Q7))
- **Link target:** /cpm/performance (as implemented, pending approval (Q7))
- **Register status:** Label only. See M-048 in the register before using this text. (as implemented, pending approval (Q7))

### M-049 G3 base performance

- **What it measures:** Base performance. (as implemented, pending approval (Q7))
- **Formula:** PASS if good_error_pct ≥ goodErrorPctPassMin, else WARN; MAE and the integrals do not enter the status (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:281). Objective id is the constant PROFILE_GOOD_ERROR_BAND (src/flink/src/main/java/com/ams/flink/cplm/evidence/ShortArtifacts.java:236). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26). Eligibility: G0 not failed, n ≥ 10. (as implemented, pending approval (Q7))
- **Unit:** mark, word, tone; computed as status enum. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown on Rules & parameters and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/tabs/RulesTab.tsx:51; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111). (as implemented, pending approval (Q7))
- **Link target:** /cpm/performance (as implemented, pending approval (Q7))
- **Register status:** Engine-UI conflict. See M-049 in the register before using this text. (as implemented, pending approval (Q7))

### M-050 G4 actuator effort

- **What it measures:** Actuator effort. (as implemented, pending approval (Q7))
- **Formula:** activity = (σOP/100)/(σPV/declared span) when the span is declared, else σOP/σPV; > high STRONG, > warn WARN, else PASS (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:320-348). Computed on OP (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:183,285). Travel and reversals do not enter. (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26). Eligibility: G0 not failed, n ≥ 10. (as implemented, pending approval (Q7))
- **Unit:** mark, word, tone; computed as status enum. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown on Rules & parameters and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/tabs/RulesTab.tsx:51; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111). (as implemented, pending approval (Q7))
- **Link target:** /cpm/performance (as implemented, pending approval (Q7))
- **Register status:** Engine-UI conflict. See M-050 in the register before using this text. (as implemented, pending approval (Q7))

### M-051 G5 oscillation ACF

- **What it measures:** Dominant period and regularity from the autocorrelation of the detrended shape signal; too few cycles or inadequate sampling reject the estimate. (as implemented, pending approval (Q7))
- **Formula:** WARN when any ACF period > 0, else PASS (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:137). Band, regularity and cycle checks act on validity, not on this status (src/flink/src/main/java/com/ams/flink/cplm/engine/OscillationMath.java:265-270). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26). Eligibility: n ≥ 10 in the long tier (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:77-80). (as implemented, pending approval (Q7))
- **Unit:** mark, word, tone; computed as status enum. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown on Rules & parameters and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/tabs/RulesTab.tsx:51; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111). (as implemented, pending approval (Q7))
- **Link target:** /cpm/performance (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-051 in the register before using this text. (as implemented, pending approval (Q7))

### M-052 G6 spectrum

- **What it measures:** Spectral (FFT). (as implemented, pending approval (Q7))
- **Formula:** WARN when fft_peak_ratio > 0.5, else PASS (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:157). Peak ratio = peak-lobe energy ÷ band energy (src/flink/src/main/java/com/ams/flink/cplm/engine/OscillationMath.java:190). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26). Eligibility: n ≥ 10 in the long tier. (as implemented, pending approval (Q7))
- **Unit:** mark, word, tone; computed as status enum. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown on Rules & parameters and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/tabs/RulesTab.tsx:51; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111). (as implemented, pending approval (Q7))
- **Link target:** /cpm/performance (as implemented, pending approval (Q7))
- **Register status:** Engine-UI conflict. See M-052 in the register before using this text. (as implemented, pending approval (Q7))

### M-053 G7 shape

- **What it measures:** Per-cycle sine versus triangle fits of the shape signal; rejected cycles are kept with their reason. (as implemented, pending approval (Q7))
- **Formula:** NOT_EVALUATED without a valid period; STRONG if triangularity > shape_score_high, else PASS (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:187-191). Shape signal is PV on integrating classes, OP otherwise (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:110). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26). Eligibility: Valid period and complete cycles. (as implemented, pending approval (Q7))
- **Unit:** mark, word, tone; computed as status enum. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown on Rules & parameters and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/tabs/RulesTab.tsx:51; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111). (as implemented, pending approval (Q7))
- **Link target:** /cpm/performance (as implemented, pending approval (Q7))
- **Register status:** Engine-UI conflict. See M-053 in the register before using this text. (as implemented, pending approval (Q7))

### M-054 G8 lag asymmetry

- **What it measures:** Horch oddness. (as implemented, pending approval (Q7))
- **Formula:** STRONG if oddness > 0.7, else PASS (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:193-198). Fusion: asymmetry alone never qualifies stiction (src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionEvidence.java:118-128). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26). Eligibility: n ≥ 10 in the long tier. (as implemented, pending approval (Q7))
- **Unit:** mark, word, tone; computed as status enum. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown on Rules & parameters and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/tabs/RulesTab.tsx:51; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111). (as implemented, pending approval (Q7))
- **Link target:** /cpm/performance (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-054 in the register before using this text. (as implemented, pending approval (Q7))

### M-055 G9 phase geometry

- **What it measures:** PV versus applied-input cycle polygons: area, bounding box, corners and turning angles on the points actually scored; supporting under the correct policy. (as implemented, pending approval (Q7))
- **Formula:** NOT_EVALUATED without valid period, cycles, floors, or above band; PASS below band; STRONG if area > 0.30 (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:319-348). The status reads area, the question reads corners. Role is PRIMARY on PIC vapour and TIC (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfilePacks.java:114-117,126-129). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26). Eligibility: Valid period, minimum cycles, area in band, effort and OP range floors. (as implemented, pending approval (Q7))
- **Unit:** mark, word, tone; computed as status enum. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown on Rules & parameters and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/tabs/RulesTab.tsx:51; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111). (as implemented, pending approval (Q7))
- **Link target:** /cpm/performance (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-055 in the register before using this text. (as implemented, pending approval (Q7))

### M-056 G10 actuator limits

- **What it measures:** Valve / saturation. (as implemented, pending approval (Q7))
- **Formula:** WARN if occupancy ≥ satWarnOccupancy or longest dwell ≥ warn or cycling pattern, else PASS (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:221-244). An open fast limit condition raises it to WARN (src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionInputs.java:151-155). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26). Eligibility: n ≥ 10 in the long tier. (as implemented, pending approval (Q7))
- **Unit:** mark, word, tone; computed as status enum. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown on Rules & parameters and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/tabs/RulesTab.tsx:51; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111). (as implemented, pending approval (Q7))
- **Link target:** /cpm/performance (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-056 in the register before using this text. (as implemented, pending approval (Q7))

### M-057 G11 measurement health

- **What it measures:** Sensor health. (as implemented, pending approval (Q7))
- **Formula:** WARN on material freeze (≥ 60 s and ≥ 10 %) or any freeze episode, else PASS (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:262,270-278). Material freeze blocks as EXCLUDED_SENSOR (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:147-149). Spikes, quantisation and health lanes do not set the status. (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26). Eligibility: n ≥ 10 in the long tier. (as implemented, pending approval (Q7))
- **Unit:** mark, word, tone; computed as status enum. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown on Rules & parameters and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/tabs/RulesTab.tsx:51; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111). (as implemented, pending approval (Q7))
- **Link target:** /cpm/performance (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-057 in the register before using this text. (as implemented, pending approval (Q7))

### M-058 G12 on the fused row

- **What it measures:** Step-test evidence. (as implemented, pending approval (Q7))
- **Formula:** PASS if the sample flags carry HAS_STEP_TEST, else NOT_EVALUATED (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:342-351; src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionStreamJob.java:248-250). No effect on scores. (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26). Eligibility: Any fused row past the exclusions. (as implemented, pending approval (Q7))
- **Unit:** mark, word, tone; computed as status enum. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown on Rules & parameters and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/tabs/RulesTab.tsx:51; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111). (as implemented, pending approval (Q7))
- **Link target:** /cpm/performance (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-058 in the register before using this text. (as implemented, pending approval (Q7))

### M-059 G13 interaction

- **What it measures:** Disturbance context. (as implemented, pending approval (Q7))
- **Formula:** INTERACTION_DETECTED WARN, NO_INTERACTION PASS, else NOT_EVALUATED (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:318-333). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26). Eligibility: Configured peers with compatible support. (as implemented, pending approval (Q7))
- **Unit:** mark, word, tone; computed as status enum. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown on Rules & parameters and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/tabs/RulesTab.tsx:51; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111). (as implemented, pending approval (Q7))
- **Link target:** /cpm/performance (as implemented, pending approval (Q7))
- **Register status:** Label only. See M-059 in the register before using this text. (as implemented, pending approval (Q7))

### M-060 G14 valve confirmation

- **What it measures:** VP confirmation. (as implemented, pending approval (Q7))
- **Formula:** No VP: NOT_CONFIRMED, or NOT_APPLICABLE when declared absent. Non-following dwell ≥ 60 s: CONFIRMED. Healthy tracking: CONTRADICTED. Else NOT_CONFIRMED (src/flink/src/main/java/com/ams/flink/cplm/fusion/Confirmation.java:42-74). Caps 1.0, 0.54, 0.89 (src/flink/src/main/java/com/ams/flink/cplm/fusion/Confirmation.java:77-83). Claim = FINAL_ELEMENT_NON_FOLLOWING (src/flink/src/main/java/com/ams/flink/cplm/fusion/Confirmation.java:24). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26). Eligibility: Final-element claim only; NOT_APPLICABLE on symptom families (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:239). (as implemented, pending approval (Q7))
- **Unit:** mark, word, tone; computed as status enum. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown on Rules & parameters and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/tabs/RulesTab.tsx:51; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111). (as implemented, pending approval (Q7))
- **Link target:** /cpm/performance (as implemented, pending approval (Q7))
- **Register status:** Engine-UI conflict. See M-060 in the register before using this text. (as implemented, pending approval (Q7))

### M-061 G15 decision

- **What it measures:** Diagnosis band. (as implemented, pending approval (Q7))
- **Formula:** Status from the band (src/flink/src/main/java/com/ams/flink/cplm/fusion/DiagnosisBands.java:43-74); INSUFFICIENT_EVIDENCE on no family and NO_CALL (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:370-380). A shim for rows written before CHG-094 exists but has no caller (src/frontend-ob/src/components/Cpm/vocabulary.ts:156-162). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Short kinds 1m to 60m carry G0 to G4 and G2r on the Window Inspector (src/frontend-ob/src/components/Cpm/windows/WindowResults.tsx:19-26). Eligibility: Row past the exclusions. (as implemented, pending approval (Q7))
- **Unit:** mark, word, tone; computed as status enum. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Method id and version shown on Rules & parameters and on the gate detail (src/frontend-ob/src/components/Cpm/evidence/tabs/RulesTab.tsx:51; src/frontend-ob/src/components/Cpm/explorer/summary/SummaryGateDetail.tsx:111). (as implemented, pending approval (Q7))
- **Link target:** /cpm/performance (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-061 in the register before using this text. (as implemented, pending approval (Q7))

## Verdict

### M-062 Diagnosis band

- **What it measures:** ONE band per result, read from the diagnosis prefix, on every screen (summary, matrix, G15 cell, Investigation, Events, Historical, export). (as implemented, pending approval (Q7))
- **Formula:** Band from confidence: < 0.35 NO_CALL, < 0.55 DETECTED, < 0.75 CLASSIFIED, < 0.90 SUSPECTED, else CONFIRMED; final-element claim needs G14 CONFIRMED, else SUSPECTED at 0.89 (src/flink/src/main/java/com/ams/flink/cplm/fusion/DiagnosisBands.java:43-74). Persistence 2 of 3 or capped to DETECTED at 0.54 (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:388-433). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Eligibility: Row past the blocking exclusions (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:126-149). (as implemented, pending approval (Q7))
- **Unit:** band word + family; computed as diagnosis code. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Evidence workbench header and Identity & raw (src/frontend-ob/src/components/Cpm/evidence/gateFacts.ts:71-83); Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-062 in the register before using this text. (as implemented, pending approval (Q7))

### M-063 No fault identified verdict

- **What it measures:** No fault identified. (as implemented, pending approval (Q7))
- **Formula:** NO_CALL: confidence < 0.35 (src/flink/src/main/java/com/ams/flink/cplm/fusion/DiagnosisBands.java:44-47). INSUFFICIENT_EVIDENCE: no family qualified, confidence 0 (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:196-205,370-380). Both are Clear for episodes (src/services/cplm-api/Services/EventFrameLifecycle.cs:88) and Assessed for KPIs (src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:57-60). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Eligibility: Window judged, past exclusions. (as implemented, pending approval (Q7))
- **Unit:** word; computed as diagnosis code. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Evidence workbench header and Identity & raw (src/frontend-ob/src/components/Cpm/evidence/gateFacts.ts:71-83); Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/kpi (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-063 in the register before using this text. (as implemented, pending approval (Q7))

### M-064 Not enough data verdict

- **What it measures:** The engine declined to evaluate this window (G0 failed or fewer than 10 samples). Metric fields are “not computed”, not zero. (as implemented, pending approval (Q7))
- **Formula:** Short stage sets sufficientData false when G0 FAIL or n < 10 (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:150-158); fusion returns INSUFFICIENT_DATA with confidence 0 (src/flink/src/main/java/com/ams/flink/cplm/fusion/BlockingExclusions.java:15-26). A slice under 32 samples produces no row at all (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:41-43,59). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Eligibility: G0 FAIL or n < 10. (as implemented, pending approval (Q7))
- **Unit:** word; computed as diagnosis code. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Evidence workbench header and Identity & raw (src/frontend-ob/src/components/Cpm/evidence/gateFacts.ts:71-83); Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/windows (as implemented, pending approval (Q7))
- **Register status:** Label only. See M-064 in the register before using this text. (as implemented, pending approval (Q7))

### M-065 Excluded window

- **What it measures:** Excluded: loop not in automatic. (as implemented, pending approval (Q7))
- **Formula:** Five codes: EXCLUDED_DATA_QUALITY, EXCLUDED_MODE, EXCLUDED_OPERATING_REGION, EXCLUDED_INSTRUMENT_HEALTH, EXCLUDED_SENSOR (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:131-149). Engine text per code (src/flink/src/main/java/com/ams/flink/cplm/fusion/BlockingExclusions.java:54-75). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Eligibility: Blocking condition met. (as implemented, pending approval (Q7))
- **Unit:** word; computed as diagnosis code. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Evidence workbench header and Identity & raw (src/frontend-ob/src/components/Cpm/evidence/gateFacts.ts:71-83); Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/performance (as implemented, pending approval (Q7))
- **Register status:** Engine-UI conflict. See M-065 in the register before using this text. (as implemented, pending approval (Q7))

### M-066 Evidence score

- **What it measures:** How fully the observed symptoms match the selected family (0–1; shown 0–100). Uncalibrated — not a probability. (as implemented, pending approval (Q7))
- **Formula:** confidence = min(family score, G14 cap on a valve claim) (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:237). Family score = max of two detector scores × prior, or effort_ratio/8 × prior (src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionEvidence.java:140-149). Selected family = highest qualified (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:207-217). Capped at 0.54 by persistence (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:425-427). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Eligibility: Shown only with a verdict: hasVerdict excludes EXCLUDED*, INSUFFICIENT*, NO_CALL (src/frontend-ob/src/components/Cpm/metricAvailability.ts:53-56). Queue row omits only null. (as implemented, pending approval (Q7))
- **Unit:** 0 to 100, integer, no %; computed as fraction 0 to 1 × 100, rounded (src/frontend-ob/src/components/Cpm/evidenceScore.ts:14-16). (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Evidence workbench header and Identity & raw (src/frontend-ob/src/components/Cpm/evidence/gateFacts.ts:71-83); Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-066 in the register before using this text. (as implemented, pending approval (Q7))

### M-067 Evidence-score band in the drawer

- **What it measures:** CONFIRMED requires a VP signal; without it G14 caps confidence at 0.89. (as implemented, pending approval (Q7))
- **Formula:** First band with value ≤ maxConfidence (src/frontend-ob/src/components/Cpm/calc/recordRows.ts:26-28); bands 0.35, 0.55, 0.75, 0.90, 1.00 (src/services/cplm-api/Controllers/CpmEventsController.cs:184-191). Engine compares with < (src/flink/src/main/java/com/ams/flink/cplm/fusion/DiagnosisBands.java:44-57). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Eligibility: CPLM-090 with a value. (as implemented, pending approval (Q7))
- **Unit:** band word, score; computed as fraction. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Evidence workbench header and Identity & raw (src/frontend-ob/src/components/Cpm/evidence/gateFacts.ts:71-83); Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/calculations (as implemented, pending approval (Q7))
- **Register status:** Engine-UI conflict. See M-067 in the register before using this text. (as implemented, pending approval (Q7))

### M-068 Evidence score cap note

- **What it measures:** capped at 54: not yet persistent ({a} of {b} windows agree). (as implemented, pending approval (Q7))
- **Formula:** Regex over status_reason (src/frontend-ob/src/components/Cpm/evidenceScore.ts:28-39). Reason strings written at src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:252-255,428-429. Engine cap of 0.89 also applies with VP mapped and no positive evidence (src/flink/src/main/java/com/ams/flink/cplm/fusion/Confirmation.java:71-72,81), and 0.54 when tracking is healthy (src/flink/src/main/java/com/ams/flink/cplm/fusion/Confirmation.java:80). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Eligibility: Score equals the cap. (as implemented, pending approval (Q7))
- **Unit:** text; computed as text. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Evidence workbench header and Identity & raw (src/frontend-ob/src/components/Cpm/evidence/gateFacts.ts:71-83); Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/investigation (as implemented, pending approval (Q7))
- **Register status:** Engine-UI conflict. See M-068 in the register before using this text. (as implemented, pending approval (Q7))

### M-069 Leading hypothesis

- **What it measures:** the leading explanation, not confirmed. (as implemented, pending approval (Q7))
- **Formula:** stiction or geometry → STICTION; oscillation → OSCILLATION_TUNING, or EXTERNAL_DISTURBANCE under disturbance context; effort → EXCESSIVE_EFFORT (src/flink/src/main/java/com/ams/flink/cplm/fusion/DiagnosisBands.java:28-37). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Eligibility: A family selected. (as implemented, pending approval (Q7))
- **Unit:** label; computed as enum. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Evidence workbench header and Identity & raw (src/frontend-ob/src/components/Cpm/evidence/gateFacts.ts:71-83); Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/explorer (as implemented, pending approval (Q7))
- **Register status:** Label only. See M-069 in the register before using this text. (as implemented, pending approval (Q7))

### M-070 Hypothesis score and state

- **What it measures:** Scores are uncalibrated evidence scores, not probabilities: they rank the mechanisms, they do not measure certainty. (as implemented, pending approval (Q7))
- **Formula:** Hypothesis score from family scores; state settled by evidence and disqualifiers (src/flink/src/main/java/com/ams/flink/cplm/fusion/VerdictAssembly.java:60-85). ACTUATOR_LIMIT and SENSOR are scored, never leading (kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:200). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Eligibility: Fusion v2 rows. (as implemented, pending approval (Q7))
- **Unit:** 0 to 100 on Investigation; 0.00 to 1.00 on G15 view; computed as fraction. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Evidence workbench header and Identity & raw (src/frontend-ob/src/components/Cpm/evidence/gateFacts.ts:71-83); Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/investigation (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-070 in the register before using this text. (as implemented, pending approval (Q7))

### M-071 Observation score

- **What it measures:** OSCILLATION: 'Sustained oscillation'; SHAPE_TRIANGULARITY: 'Triangular OP waveform'; LAG_ASYMMETRY: 'Cross-correlation asymmetry'; PHASE_GEOMETRY: 'Phase-portrait geometry'; ACTUATOR_STRESS: 'Actuator stress'; LIMIT_OCCUPANCY: 'Output at a limit'; FREEZE: 'PV freeze'; PEER_LINKS: 'Peer links declared'. (as implemented, pending approval (Q7))
- **Formula:** Observations assembled from fusion evidence (src/flink/src/main/java/com/ams/flink/cplm/fusion/VerdictAssembly.java:60-85; src/flink/src/main/java/com/ams/flink/cplm/fusion/Observation.java:1-50). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Eligibility: Fusion v2 rows. (as implemented, pending approval (Q7))
- **Unit:** integer on Investigation; 0.00 on G15; computed as fraction. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Evidence workbench header and Identity & raw (src/frontend-ob/src/components/Cpm/evidence/gateFacts.ts:71-83); Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/investigation (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-071 in the register before using this text. (as implemented, pending approval (Q7))

### M-072 Detector scores

- **What it measures:** No definition is displayed for Detector scores. (as implemented, pending approval (Q7))
- **Formula:** oscillation = acf_regularity; fft = fft_peak_ratio; effort = effort_ratio/8; stiction = triangularity; horch = oddness; geometry = corner_score_qualified, each clamped to 0 to 1 (src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionEvidence.java:63-70). raw_final_element_score = weighted sum (src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionEvidence.java:151-158). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Eligibility: Row past exclusions. (as implemented, pending approval (Q7))
- **Unit:** 0.00 on key fact; integer on legacy bars; computed as fraction. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Evidence workbench header and Identity & raw (src/frontend-ob/src/components/Cpm/evidence/gateFacts.ts:71-83); Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/investigation (as implemented, pending approval (Q7))
- **Register status:** Label only. See M-072 in the register before using this text. (as implemented, pending approval (Q7))

### M-073 Selected family

- **What it measures:** FINAL_ELEMENT_NONLINEARITY: Stiction / final element; OSCILLATION: Oscillation; EXCESSIVE_EFFORT: Excessive actuator effort; GEOMETRY: Phase geometry. (as implemented, pending approval (Q7))
- **Formula:** argmax over qualified families stiction, oscillation, effort, geometry (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:184-217). Event family = diagnosis suffix (src/services/cplm-api/Services/EventFrameLifecycle.cs:96-102). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Eligibility: A family qualified. (as implemented, pending approval (Q7))
- **Unit:** word; computed as enum. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Evidence workbench header and Identity & raw (src/frontend-ob/src/components/Cpm/evidence/gateFacts.ts:71-83); Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/investigation (as implemented, pending approval (Q7))
- **Register status:** Label only. See M-073 in the register before using this text. (as implemented, pending approval (Q7))

### M-074 Persistence agreement

- **What it measures:** Apply temporal persistence: SUSPECTED/CONFIRMED require multi-window agreement. Single-window evidence is capped at DETECTED unless persistence is satisfied. (as implemented, pending approval (Q7))
- **Formula:** agree = 1 + prior results with the same family among the last windows − 1; need = persistenceMinAgree 2, window = 3 (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:396-416). (as implemented, pending approval (Q7))
- **Window and eligibility:** Three consecutive fused results of one kind, 15 min apart, on overlapping windows. Eligibility: A family selected. (as implemented, pending approval (Q7))
- **Unit:** count; computed as count. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Evidence workbench header and Identity & raw (src/frontend-ob/src/components/Cpm/evidence/gateFacts.ts:71-83); Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/evidence (as implemented, pending approval (Q7))
- **Register status:** Engine-UI conflict. See M-074 in the register before using this text. (as implemented, pending approval (Q7))

### M-075 Analysis cases

- **What it measures:** STICTION: 'Valve / final element'; OSCILLATION_TUNING: 'Controller tuning'; EXTERNAL_DISTURBANCE: 'External disturbance'; EXCESSIVE_EFFORT: 'Actuator effort'; ACTUATOR_LIMIT: 'Actuator at limit'; SENSOR: 'Sensor / measurement'; NOT_EVALUABLE: 'Not evaluable'; HEALTHY: 'Healthy'; OTHER: 'Other'. (as implemented, pending approval (Q7))
- **Formula:** Client count over up to 200 ranked loops (src/frontend-ob/src/components/Cpm/CpmInvestigation.tsx:74; src/frontend-ob/src/components/Cpm/investigation/cases.ts:24-35,41-48). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). UI poll 60 s. Eligibility: Rows from LatestProbe: newest real verdict of any age. (as implemented, pending approval (Q7))
- **Unit:** count per case; computed as count. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm/investigation (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-075 in the register before using this text. (as implemented, pending approval (Q7))

### M-076 Last verdict

- **What it measures:** the page shows the loop's NEWEST evaluated window; a verdict from an older window is named beside it with its age - stated as older, never presented as current. (as implemented, pending approval (Q7))
- **Formula:** Newest row with diagnosis not INSUFFICIENT_DATA and older than the shown row (src/services/cplm-api/Data/FleetLatestSql.cs:144-152; src/services/cplm-api/Data/FleetKpiSql.cs:53-61). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Eligibility: An older real verdict exists. (as implemented, pending approval (Q7))
- **Unit:** label, score, age; computed as row. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Evidence workbench header and Identity & raw (src/frontend-ob/src/components/Cpm/evidence/gateFacts.ts:71-83); Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/performance (as implemented, pending approval (Q7))
- **Register status:** Consistent. See M-076 in the register before using this text. (as implemented, pending approval (Q7))

### M-077 Next check

- **What it measures:** Check that the loop’s signals are arriving: the Window Inspector shows the samples each window received. (as implemented, pending approval (Q7))
- **Formula:** Engine recommendation by hypothesis and band (src/flink/src/main/java/com/ams/flink/cplm/fusion/Recommendations.java:1-63), by exclusion code (src/flink/src/main/java/com/ams/flink/cplm/fusion/BlockingExclusions.java:54-75); no-family text (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:198-200). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Eligibility: Row carries a recommendation, else client fallback by condition kind. (as implemented, pending approval (Q7))
- **Unit:** text; computed as text. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Evidence workbench header and Identity & raw (src/frontend-ob/src/components/Cpm/evidence/gateFacts.ts:71-83); Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/explorer (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-077 in the register before using this text. (as implemented, pending approval (Q7))

## Loop metric

### M-078 Time in AUTO share

- **What it measures:** AUTO / CASCADE · rule ≥ 95 % · {G1 status}. (as implemented, pending approval (Q7))
- **Formula:** autoCount ÷ n, n = samples present (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:72,185,193). isAutoMode tokens: AUTO, AUT, A, AUTOMATIC, NORMAL, NORM, CAS, CASC, CASCADE, RSP, DDC, SUP, SUPERVISORY; manual tokens first; null, empty, UNKNOWN false (src/flink/src/main/java/com/ams/flink/cplm/CplmNormalizedSample.java:227-244). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24). Eligibility: Short stage ran: G0 not failed and n ≥ 10; else null (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:19-21). (as implemented, pending approval (Q7))
- **Unit:** % integer on card, 0.00 ratio on Calculations, % to 0.1 on Windows; computed as fraction. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Run details on Calculations (src/frontend-ob/src/components/Cpm/replay/RunDetailsDialog.tsx:35), the Calculations right column when it differs from the deployed version (src/frontend-ob/src/components/Cpm/calc/CalcPanel.tsx:43-77), and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/explorer (as implemented, pending approval (Q7))
- **Register status:** Engine-UI conflict. See M-078 in the register before using this text. (as implemented, pending approval (Q7))

### M-079 Manual share

- **What it measures:** MANUAL % = time in MANUAL ÷ window time. (as implemented, pending approval (Q7))
- **Formula:** 1 − auto_pct (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:194). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24). Eligibility: Short stage ran: G0 not failed and n ≥ 10; else null (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:19-21). (as implemented, pending approval (Q7))
- **Unit:** % to 0.1; computed as fraction. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Run details on Calculations (src/frontend-ob/src/components/Cpm/replay/RunDetailsDialog.tsx:35), the Calculations right column when it differs from the deployed version (src/frontend-ob/src/components/Cpm/calc/CalcPanel.tsx:43-77), and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/kpi (as implemented, pending approval (Q7))
- **Register status:** Engine-UI conflict. See M-079 in the register before using this text. (as implemented, pending approval (Q7))

### M-080 Good-error share

- **What it measures:** |PV − SP| inside the good band · {G3 status}. (as implemented, pending approval (Q7))
- **Formula:** count(|SP − PV| ≤ band) ÷ n (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:265,276). band = goodErrorBandPctOfSpan × declared span, 0.005 default, 0.5 EU if span unusable (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:226,234-239). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24). Historical overlay reads the 15m tier (src/frontend-ob/src/components/Cpm/CpmHistorical.tsx:52). Eligibility: Short stage ran: G0 not failed and n ≥ 10; else null (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:19-21). (as implemented, pending approval (Q7))
- **Unit:** % integer on bar and card; 0.00 fraction on Calculations; % to 0.1 on Windows and Investigation; computed as fraction. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Run details on Calculations (src/frontend-ob/src/components/Cpm/replay/RunDetailsDialog.tsx:35), the Calculations right column when it differs from the deployed version (src/frontend-ob/src/components/Cpm/calc/CalcPanel.tsx:43-77), and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Engine-UI conflict. See M-080 in the register before using this text. (as implemented, pending approval (Q7))

### M-081 Good-error band

- **What it measures:** |error| <= {band} EU ({objective}). (as implemented, pending approval (Q7))
- **Formula:** goodErrorBand() (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:234-239). Provenance objective_id = PROFILE_GOOD_ERROR_BAND (src/flink/src/main/java/com/ams/flink/cplm/evidence/ShortArtifacts.java:234-236). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24). Eligibility: G3 evidence retained. (as implemented, pending approval (Q7))
- **Unit:** EU; computed as EU. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Run details on Calculations (src/frontend-ob/src/components/Cpm/replay/RunDetailsDialog.tsx:35), the Calculations right column when it differs from the deployed version (src/frontend-ob/src/components/Cpm/calc/CalcPanel.tsx:43-77), and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/evidence (as implemented, pending approval (Q7))
- **Register status:** Undocumented. See M-081 in the register before using this text. (as implemented, pending approval (Q7))

### M-082 Control error MAE

- **What it measures:** of PV span · {mae} {unit} · {G3 status}. (as implemented, pending approval (Q7))
- **Formula:** mean(|SP − PV|) over samples, not time-weighted (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:184,235; src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:226-231). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24). Eligibility: Short stage ran: G0 not failed and n ≥ 10; else null (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:19-21). Card needs a registered span (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:109,120). (as implemented, pending approval (Q7))
- **Unit:** % of span on card; "PV units" on Calculations; raw with no unit in the queue fallback; computed as PV EU. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Run details on Calculations (src/frontend-ob/src/components/Cpm/replay/RunDetailsDialog.tsx:35), the Calculations right column when it differs from the deployed version (src/frontend-ob/src/components/Cpm/calc/CalcPanel.tsx:43-77), and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/explorer (as implemented, pending approval (Q7))
- **Register status:** Engine-UI conflict. See M-082 in the register before using this text. (as implemented, pending approval (Q7))

### M-083 RMS control error

- **What it measures:** RMS control error. (as implemented, pending approval (Q7))
- **Formula:** sqrt(mean(e²)) over samples (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:236). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24). Eligibility: Short stage ran: G0 not failed and n ≥ 10; else null (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:19-21). (as implemented, pending approval (Q7))
- **Unit:** PV units; computed as PV EU. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Run details on Calculations (src/frontend-ob/src/components/Cpm/replay/RunDetailsDialog.tsx:35), the Calculations right column when it differs from the deployed version (src/frontend-ob/src/components/Cpm/calc/CalcPanel.tsx:43-77), and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/calculations (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-083 in the register before using this text. (as implemented, pending approval (Q7))

### M-084 Integral absolute error

- **What it measures:** Accumulated absolute error. (as implemented, pending approval (Q7))
- **Formula:** Σ|e|·Δt, zero-order hold across gaps, last sample one median interval (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:237-246,257-264). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24). Eligibility: Short stage ran: G0 not failed and n ≥ 10; else null (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:19-21). (as implemented, pending approval (Q7))
- **Unit:** PV·s on Calculations; EU·s on Historical; computed as PV EU × s. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Run details on Calculations (src/frontend-ob/src/components/Cpm/replay/RunDetailsDialog.tsx:35), the Calculations right column when it differs from the deployed version (src/frontend-ob/src/components/Cpm/calc/CalcPanel.tsx:43-77), and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/calculations (as implemented, pending approval (Q7))
- **Register status:** Label only. See M-084 in the register before using this text. (as implemented, pending approval (Q7))

### M-085 Integral squared error

- **What it measures:** Accumulated squared error. (as implemented, pending approval (Q7))
- **Formula:** Σe²·Δt (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:263). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24). Eligibility: Short stage ran: G0 not failed and n ≥ 10; else null (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:19-21). (as implemented, pending approval (Q7))
- **Unit:** PV²·s; computed as PV EU² × s. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Run details on Calculations (src/frontend-ob/src/components/Cpm/replay/RunDetailsDialog.tsx:35), the Calculations right column when it differs from the deployed version (src/frontend-ob/src/components/Cpm/calc/CalcPanel.tsx:43-77), and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/calculations (as implemented, pending approval (Q7))
- **Register status:** Consistent. See M-085 in the register before using this text. (as implemented, pending approval (Q7))

### M-086 ITAE

- **What it measures:** No definition is displayed for ITAE. (as implemented, pending approval (Q7))
- **Formula:** Σ(t − windowStart)·|e|·Δt (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:261,264). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24). Eligibility: Short stage ran: G0 not failed and n ≥ 10; else null (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:19-21). (as implemented, pending approval (Q7))
- **Unit:** chart unit from artifact; computed as PV EU × s². (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Run details on Calculations (src/frontend-ob/src/components/Cpm/replay/RunDetailsDialog.tsx:35), the Calculations right column when it differs from the deployed version (src/frontend-ob/src/components/Cpm/calc/CalcPanel.tsx:43-77), and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/evidence (as implemented, pending approval (Q7))
- **Register status:** Undocumented. See M-086 in the register before using this text. (as implemented, pending approval (Q7))

### M-087 PV variability

- **What it measures:** 2 × standard deviation of PV over the window as % of the PV span. Context, not pass / fail: level loops absorb swings by design. (as implemented, pending approval (Q7))
- **Formula:** pv_std = population σ of PV (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:286-287; src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:252-260). Card: 2σ ÷ registered span × 100 (src/frontend-ob/src/components/Cpm/kpi/loopKpiView.ts:57). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24). Eligibility: Short stage ran: G0 not failed and n ≥ 10; else null (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:19-21). Needs a registered span. (as implemented, pending approval (Q7))
- **Unit:** % of span; computed as PV EU. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Run details on Calculations (src/frontend-ob/src/components/Cpm/replay/RunDetailsDialog.tsx:35), the Calculations right column when it differs from the deployed version (src/frontend-ob/src/components/Cpm/calc/CalcPanel.tsx:43-77), and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/explorer (as implemented, pending approval (Q7))
- **Register status:** Undocumented. See M-087 in the register before using this text. (as implemented, pending approval (Q7))

### M-088 Time at an OP limit

- **What it measures:** rule ≤ 10 % · limits: {basis}. (as implemented, pending approval (Q7))
- **Formula:** Shown value: short stage, share of samples with OP ≤ satLowPct or ≥ satHighPct, 5 and 95 (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:277; src/flink/src/main/java/com/ams/flink/cplm/engine/LimitMath.java:47,61; src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionInputs.java:65). G10 uses a second computation on limitTolerancePp (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:221-225,233). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24). Eligibility: Short stage ran, else the long value (src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionInputs.java:65). (as implemented, pending approval (Q7))
- **Unit:** % integer; deciding to 0.1; computed as fraction. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Run details on Calculations (src/frontend-ob/src/components/Cpm/replay/RunDetailsDialog.tsx:35), the Calculations right column when it differs from the deployed version (src/frontend-ob/src/components/Cpm/calc/CalcPanel.tsx:43-77), and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/explorer (as implemented, pending approval (Q7))
- **Register status:** Engine-UI conflict. See M-088 in the register before using this text. (as implemented, pending approval (Q7))

### M-089 Longest dwell at a limit

- **What it measures:** No definition is displayed for Longest dwell at a limit. (as implemented, pending approval (Q7))
- **Formula:** max episode duration at a limit (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:230-235). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Long tier; recomputed from the rolling buffer. Eligibility: n ≥ 10 in the long tier (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:77-80). (as implemented, pending approval (Q7))
- **Unit:** min, or duration; computed as s. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Run details on Calculations (src/frontend-ob/src/components/Cpm/replay/RunDetailsDialog.tsx:35), the Calculations right column when it differs from the deployed version (src/frontend-ob/src/components/Cpm/calc/CalcPanel.tsx:43-77), and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/kpi (as implemented, pending approval (Q7))
- **Register status:** Label only. See M-089 in the register before using this text. (as implemented, pending approval (Q7))

### M-090 OP travel per day

- **What it measures:** total OP movement per day · {G4 status}. (as implemented, pending approval (Q7))
- **Formula:** Σ|ΔOP| × 24 ÷ window hours (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:182-194). OP normalised to 0-100 only when a range is declared (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:242-246). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24). Eligibility: Short stage ran: G0 not failed and n ≥ 10; else null (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:19-21). (as implemented, pending approval (Q7))
- **Unit:** %/day; computed as OP units per day; pp only with a declared or 0-100 range. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Run details on Calculations (src/frontend-ob/src/components/Cpm/replay/RunDetailsDialog.tsx:35), the Calculations right column when it differs from the deployed version (src/frontend-ob/src/components/Cpm/calc/CalcPanel.tsx:43-77), and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/explorer (as implemented, pending approval (Q7))
- **Register status:** Engine-UI conflict. See M-090 in the register before using this text. (as implemented, pending approval (Q7))

### M-091 OP reversals per hour

- **What it measures:** direction changes per hour · {G4 status}. (as implemented, pending approval (Q7))
- **Formula:** Sign changes of ΔOP with |ΔOP| > 1e-9 ÷ window hours (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:23,196-216). G4.reversal_deadband_pp maps to opDeadbandPct (src/flink/src/main/java/com/ams/flink/cplm/config/BundleProfileMapper.java:58), read only by the corner score (src/flink/src/main/java/com/ams/flink/cplm/engine/ShapeMath.java:282). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24). Eligibility: Short stage ran: G0 not failed and n ≥ 10; else null (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:19-21). (as implemented, pending approval (Q7))
- **Unit:** /h; computed as count per h. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Run details on Calculations (src/frontend-ob/src/components/Cpm/replay/RunDetailsDialog.tsx:35), the Calculations right column when it differs from the deployed version (src/frontend-ob/src/components/Cpm/calc/CalcPanel.tsx:43-77), and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/explorer (as implemented, pending approval (Q7))
- **Register status:** Engine-UI conflict. See M-091 in the register before using this text. (as implemented, pending approval (Q7))

### M-092 Setpoint changes per hour

- **What it measures:** Setpoint changes per hour in the window. Context: frequent changes point at an operator compensating or a cascade master. (as implemented, pending approval (Q7))
- **Formula:** count(|ΔSP| > 1e-6) ÷ window hours (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:22,173-180). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24). Eligibility: Short stage ran: G0 not failed and n ≥ 10; else null (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:19-21). (as implemented, pending approval (Q7))
- **Unit:** /h; computed as count per h. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Run details on Calculations (src/frontend-ob/src/components/Cpm/replay/RunDetailsDialog.tsx:35), the Calculations right column when it differs from the deployed version (src/frontend-ob/src/components/Cpm/calc/CalcPanel.tsx:43-77), and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/explorer (as implemented, pending approval (Q7))
- **Register status:** Undocumented. See M-092 in the register before using this text. (as implemented, pending approval (Q7))

### M-093 Data coverage

- **What it measures:** Samples received ÷ samples expected on the declared grid (CPLM-001). Below 95 % the window cannot be judged (G0). (as implemented, pending approval (Q7))
- **Formula:** n ÷ round(window s ÷ declared grid), falling back to the median observed period; not clamped (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:85-93). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24). Eligibility: Always written (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:81). (as implemented, pending approval (Q7))
- **Unit:** % integer on card; "ratio" on Calculations; % on Windows; computed as ratio, can exceed 1. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Run details on Calculations (src/frontend-ob/src/components/Cpm/replay/RunDetailsDialog.tsx:35), the Calculations right column when it differs from the deployed version (src/frontend-ob/src/components/Cpm/calc/CalcPanel.tsx:43-77), and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/explorer (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-093 in the register before using this text. (as implemented, pending approval (Q7))

### M-094 Sample counts

- **What it measures:** Samples evaluated in the window. (as implemented, pending approval (Q7))
- **Formula:** n after half-open filter and dedupe (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:52,72,92). Fused row: long count, else short (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:283). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24). Eligibility: Any row. (as implemented, pending approval (Q7))
- **Unit:** count; computed as count. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Run details on Calculations (src/frontend-ob/src/components/Cpm/replay/RunDetailsDialog.tsx:35), the Calculations right column when it differs from the deployed version (src/frontend-ob/src/components/Cpm/calc/CalcPanel.tsx:43-77), and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/calculations (as implemented, pending approval (Q7))
- **Register status:** Label only. See M-094 in the register before using this text. (as implemented, pending approval (Q7))

### M-095 Bad-quality share

- **What it measures:** not-good share (UNKNOWN included, v2.5 R04). (as implemented, pending approval (Q7))
- **Formula:** count(quality ≠ GOOD) ÷ n, UNCERTAIN and UNKNOWN included (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:99-105). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24). Eligibility: Always written (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:82). (as implemented, pending approval (Q7))
- **Unit:** % to 0.1; computed as fraction. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Run details on Calculations (src/frontend-ob/src/components/Cpm/replay/RunDetailsDialog.tsx:35), the Calculations right column when it differs from the deployed version (src/frontend-ob/src/components/Cpm/calc/CalcPanel.tsx:43-77), and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/kpi (as implemented, pending approval (Q7))
- **Register status:** Label only. See M-095 in the register before using this text. (as implemented, pending approval (Q7))

### M-096 Longest gap

- **What it measures:** No definition is displayed for Longest gap. (as implemented, pending approval (Q7))
- **Formula:** max Δt between samples (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:113-119). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24). Eligibility: Always written. (as implemented, pending approval (Q7))
- **Unit:** min; computed as s. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Run details on Calculations (src/frontend-ob/src/components/Cpm/replay/RunDetailsDialog.tsx:35), the Calculations right column when it differs from the deployed version (src/frontend-ob/src/components/Cpm/calc/CalcPanel.tsx:43-77), and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/kpi (as implemented, pending approval (Q7))
- **Register status:** Consistent. See M-096 in the register before using this text. (as implemented, pending approval (Q7))

### M-097 Actuator effort ratio

- **What it measures:** OP travel relative to the error it corrects. (as implemented, pending approval (Q7))
- **Formula:** σ(OP)/σ(PV), 0 when σPV ≤ 1e-12 (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:285-289). G4 judges activity_ratio_norm when a span is declared (src/flink/src/main/java/com/ams/flink/cplm/engine/ShortFeatureCalculator.java:324-335). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Same row on Calculations (vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48). Loop cards poll every 5 min (src/frontend-ob/src/components/Cpm/explorer/summary/LoopKpiCards.tsx:24). Eligibility: Short stage ran: G0 not failed and n ≥ 10; else null (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:19-21). (as implemented, pending approval (Q7))
- **Unit:** ratio; computed as OP units per PV unit, not dimensionless. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Run details on Calculations (src/frontend-ob/src/components/Cpm/replay/RunDetailsDialog.tsx:35), the Calculations right column when it differs from the deployed version (src/frontend-ob/src/components/Cpm/calc/CalcPanel.tsx:43-77), and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/calculations (as implemented, pending approval (Q7))
- **Register status:** Engine-UI conflict. See M-097 in the register before using this text. (as implemented, pending approval (Q7))

### M-098 Oscillation period

- **What it measures:** Dominant period from the autocorrelation. (as implemented, pending approval (Q7))
- **Formula:** Median of 2 × zero-crossing spacing × Ts (src/flink/src/main/java/com/ams/flink/cplm/engine/OscillationMath.java:70-79). validated_period_s = ACF if regular and in band, else FFT with fold (src/flink/src/main/java/com/ams/flink/cplm/engine/OscillationMath.java:265-300). /cpm/kpi serves validated period; Calculations and Investigation serve acf_period_s (src/services/cplm-api/Services/Kpi/FleetKpiRows.cs:94; src/frontend-ob/src/components/Cpm/calcCatalogue.ts:36). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Long tier; recomputed from the rolling buffer. Eligibility: n ≥ 10 in the long tier (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:77-80). (as implemented, pending approval (Q7))
- **Unit:** s or duration; computed as s. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Run details on Calculations (src/frontend-ob/src/components/Cpm/replay/RunDetailsDialog.tsx:35), the Calculations right column when it differs from the deployed version (src/frontend-ob/src/components/Cpm/calc/CalcPanel.tsx:43-77), and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/calculations (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-098 in the register before using this text. (as implemented, pending approval (Q7))

### M-099 Oscillation regularity

- **What it measures:** How regular the oscillation is (0–1). (as implemented, pending approval (Q7))
- **Formula:** min(1, median period ÷ 3σ(periods)), 1.0 when σ ≈ 0 (src/flink/src/main/java/com/ams/flink/cplm/engine/OscillationMath.java:82). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Long tier; recomputed from the rolling buffer. Eligibility: n ≥ 10 in the long tier (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:77-80). (as implemented, pending approval (Q7))
- **Unit:** 0 to 1, 2 dp; computed as ratio. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Run details on Calculations (src/frontend-ob/src/components/Cpm/replay/RunDetailsDialog.tsx:35), the Calculations right column when it differs from the deployed version (src/frontend-ob/src/components/Cpm/calc/CalcPanel.tsx:43-77), and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/calculations (as implemented, pending approval (Q7))
- **Register status:** Consistent. See M-099 in the register before using this text. (as implemented, pending approval (Q7))

### M-100 Period validity

- **What it measures:** No clean oscillation cycle: period and waveform shape not measured. (as implemented, pending approval (Q7))
- **Formula:** VALID when ACF or FFT passes band and quality tests (src/flink/src/main/java/com/ams/flink/cplm/engine/OscillationMath.java:265-280); flag NO_VALID_CYCLE (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:163-165). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Long tier; recomputed from the rolling buffer. Eligibility: n ≥ 10 in the long tier (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:77-80). (as implemented, pending approval (Q7))
- **Unit:** word; computed as enum. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Run details on Calculations (src/frontend-ob/src/components/Cpm/replay/RunDetailsDialog.tsx:35), the Calculations right column when it differs from the deployed version (src/frontend-ob/src/components/Cpm/calc/CalcPanel.tsx:43-77), and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/kpi (as implemented, pending approval (Q7))
- **Register status:** Consistent. See M-100 in the register before using this text. (as implemented, pending approval (Q7))

### M-101 Harmonic ratios

- **What it measures:** Harmonics vs fundamental amplitude. (as implemented, pending approval (Q7))
- **Formula:** (A2+A3+A5)/A1 and energy equivalent on the band spectrum (src/flink/src/main/java/com/ams/flink/cplm/engine/OscillationMath.java:199-200; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:101). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Long tier; recomputed from the rolling buffer. Eligibility: n ≥ 10 in the long tier (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:77-80). (as implemented, pending approval (Q7))
- **Unit:** ratio; computed as ratio. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Run details on Calculations (src/frontend-ob/src/components/Cpm/replay/RunDetailsDialog.tsx:35), the Calculations right column when it differs from the deployed version (src/frontend-ob/src/components/Cpm/calc/CalcPanel.tsx:43-77), and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/calculations (as implemented, pending approval (Q7))
- **Register status:** Consistent. See M-101 in the register before using this text. (as implemented, pending approval (Q7))

### M-102 Triangularity

- **What it measures:** Triangular-wave similarity of the actuator trace (stiction shape). (as implemented, pending approval (Q7))
- **Formula:** Mean per-cycle score SSE_sine/(SSE_sine + SSE_tri) on the shape signal (src/flink/src/main/java/com/ams/flink/cplm/engine/ShapeMath.java:152,156; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:102). Shape signal = PV on integrating classes (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:110). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Long tier; recomputed from the rolling buffer. Eligibility: Valid period and enough samples per period. (as implemented, pending approval (Q7))
- **Unit:** score; computed as fraction. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Run details on Calculations (src/frontend-ob/src/components/Cpm/replay/RunDetailsDialog.tsx:35), the Calculations right column when it differs from the deployed version (src/frontend-ob/src/components/Cpm/calc/CalcPanel.tsx:43-77), and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/calculations (as implemented, pending approval (Q7))
- **Register status:** Engine-UI conflict. See M-102 in the register before using this text. (as implemented, pending approval (Q7))

### M-103 Horch oddness

- **What it measures:** Odd-symmetry of the PV–OP cross-correlation. (as implemented, pending approval (Q7))
- **Formula:** oddSum/(oddSum + evenSum) (src/flink/src/main/java/com/ams/flink/cplm/engine/ShapeMath.java:203; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:103). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Long tier; recomputed from the rolling buffer. Eligibility: n ≥ 10 in the long tier (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:77-80). (as implemented, pending approval (Q7))
- **Unit:** score; computed as fraction. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Run details on Calculations (src/frontend-ob/src/components/Cpm/replay/RunDetailsDialog.tsx:35), the Calculations right column when it differs from the deployed version (src/frontend-ob/src/components/Cpm/calc/CalcPanel.tsx:43-77), and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/calculations (as implemented, pending approval (Q7))
- **Register status:** Label only. See M-103 in the register before using this text. (as implemented, pending approval (Q7))

### M-104 Corner score

- **What it measures:** Sharp-corner evidence in the PV–OP phase plot. CAUTION: the raw statistic reads high (~0.9) even on healthy noisy data; treat it only alongside the G9 verdict and phase-area band, never alone. (as implemented, pending approval (Q7))
- **Formula:** Share of turning angle at corners; raw stored, qualified used by fusion (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:206-209; src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionEvidence.java:68-70). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Long tier; recomputed from the rolling buffer. Eligibility: n ≥ 10 in the long tier (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:77-80). (as implemented, pending approval (Q7))
- **Unit:** score; computed as fraction. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Run details on Calculations (src/frontend-ob/src/components/Cpm/replay/RunDetailsDialog.tsx:35), the Calculations right column when it differs from the deployed version (src/frontend-ob/src/components/Cpm/calc/CalcPanel.tsx:43-77), and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/calculations (as implemented, pending approval (Q7))
- **Register status:** Label only. See M-104 in the register before using this text. (as implemented, pending approval (Q7))

### M-105 Cycle phase area

- **What it measures:** No definition is displayed for Cycle phase area. (as implemented, pending approval (Q7))
- **Formula:** Per-cycle shoelace area ÷ bounding box, normalised per cycle (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:200-205; kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:104). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Long tier; recomputed from the rolling buffer. Eligibility: Valid cycles. (as implemented, pending approval (Q7))
- **Unit:** fraction; computed as ratio. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Run details on Calculations (src/frontend-ob/src/components/Cpm/replay/RunDetailsDialog.tsx:35), the Calculations right column when it differs from the deployed version (src/frontend-ob/src/components/Cpm/calc/CalcPanel.tsx:43-77), and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/evidence (as implemented, pending approval (Q7))
- **Register status:** Undocumented. See M-105 in the register before using this text. (as implemented, pending approval (Q7))

### M-106 PV freeze index

- **What it measures:** No definition is displayed for PV freeze index. (as implemented, pending approval (Q7))
- **Formula:** freeze_index_s = longest flat run samples × Ts; freeze_fraction = run ÷ n (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:246-247,261). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Long tier; recomputed from the rolling buffer. Eligibility: n ≥ 10 in the long tier (src/flink/src/main/java/com/ams/flink/cplm/engine/LongDiagnosticsCalculator.java:77-80). (as implemented, pending approval (Q7))
- **Unit:** duration; %; computed as s; fraction. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown: Run details on Calculations (src/frontend-ob/src/components/Cpm/replay/RunDetailsDialog.tsx:35), the Calculations right column when it differs from the deployed version (src/frontend-ob/src/components/Cpm/calc/CalcPanel.tsx:43-77), and Historical (src/frontend-ob/src/components/Cpm/historical/SelectedWindowPanel.tsx:104-107). (as implemented, pending approval (Q7))
- **Link target:** /cpm/investigation (as implemented, pending approval (Q7))
- **Register status:** Undocumented. See M-106 in the register before using this text. (as implemented, pending approval (Q7))

## Live signal

### M-107 Live and last-stored PV, SP, OP

- **What it measures:** OP is a percentage of span by definition in this engine. PV/SP carry no engineering unit in the registry. (as implemented, pending approval (Q7))
- **Formula:** Raw live value, else newest trend bucket, else last stored (src/frontend-ob/src/components/Cpm/explorer/summary/OperatingState.tsx:82-94). Engine normalises OP only when a range is declared (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:242-246); live and stored values are not normalised. (as implemented, pending approval (Q7))
- **Window and eligibility:** Live RBE plus 8 h rolling trend, tick 60 s (src/frontend-ob/src/components/Cpm/shared.tsx:92-93). Eligibility: Live publisher or stored samples. (as implemented, pending approval (Q7))
- **Unit:** OP shown with "%"; PV and SP without unit though the registry has pvUnit; computed as raw engineering value. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Engine-UI conflict. See M-107 in the register before using this text. (as implemented, pending approval (Q7))

### M-108 Controller mode now

- **What it measures:** mode never published · excluded at G1. (as implemented, pending approval (Q7))
- **Formula:** Token as published; classification mirrors the engine in two client copies (src/frontend-ob/src/components/Cpm/shared.tsx:191-213; src/frontend-ob/src/utils/modeVocabulary.ts:14-33; src/flink/src/main/java/com/ams/flink/cplm/CplmNormalizedSample.java:227-244). (as implemented, pending approval (Q7))
- **Window and eligibility:** Live; lane on the selected range. Eligibility: MODE role mapped. (as implemented, pending approval (Q7))
- **Unit:** token; computed as token. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-108 in the register before using this text. (as implemented, pending approval (Q7))

### M-109 Signal quality

- **What it measures:** Signal quality: whether the live PV measurement is trustworthy right now (OPC / NAMUR NE107 quality). (as implemented, pending approval (Q7))
- **Formula:** String tokens, else OPC numeric ≥ 192 good, ≥ 64 uncertain, else bad (src/frontend-ob/src/hooks/useLoopLive.ts:82-100). Stale GOOD becomes Uncertain (src/frontend-ob/src/components/Cpm/FacetPill.tsx:50-58). (as implemented, pending approval (Q7))
- **Window and eligibility:** Live. Eligibility: Live value present. (as implemented, pending approval (Q7))
- **Unit:** word; computed as word. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm (as implemented, pending approval (Q7))
- **Register status:** Label only. See M-109 in the register before using this text. (as implemented, pending approval (Q7))

### M-110 Instrument health

- **What it measures:** Instrument health: what the transmitter diagnostics report (NAMUR NE107). No source means not checked — missing diagnostics are not OK. (as implemented, pending approval (Q7))
- **Formula:** Per-role eligibility from the context job (src/flink/src/main/java/com/ams/flink/cplm/health/HealthEligibilityPolicy.java:1-63). INELIGIBLE PV excludes the window (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:141-144). Fleet filters (src/services/cplm-api/Data/FleetLatestSql.cs:71-96). (as implemented, pending approval (Q7))
- **Window and eligibility:** Health intervals; freshness timer 60 s (kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:236). Eligibility: Instrument bound. (as implemented, pending approval (Q7))
- **Unit:** word, flags; computed as enum. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: interpretation version. Shown: "NE107 interpretation v{n}" (src/frontend-ob/src/components/Cpm/health/TransmitterHealthPanel.tsx:109). (as implemented, pending approval (Q7))
- **Link target:** /cpm/explorer (as implemented, pending approval (Q7))
- **Register status:** Consistent. See M-110 in the register before using this text. (as implemented, pending approval (Q7))

### M-111 Trend series

- **What it measures:** Show every signal as a fraction of its own observed span (the tooltip keeps the original values and units). (as implemented, pending approval (Q7))
- **Formula:** Historian buckets: PV and OP averages, SP last value (src/frontend-ob/src/components/Cpm/explorer/summary/OperatingState.tsx:85-89). 240 to 300 buckets (src/frontend-ob/src/components/Cpm/overview/LoopFocus.tsx:33; src/frontend-ob/src/components/Cpm/CpmHistorical.tsx:118). (as implemented, pending approval (Q7))
- **Window and eligibility:** Default 8 h rolling; Historical default 3 days (src/frontend-ob/src/components/Cpm/CpmHistorical.tsx:99). Eligibility: Stored samples. (as implemented, pending approval (Q7))
- **Unit:** pvUnit or EU; OP/VP axis "%"; computed as raw. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /trend (as implemented, pending approval (Q7))
- **Register status:** Label only. See M-111 in the register before using this text. (as implemented, pending approval (Q7))

### M-112 KPI overlay series

- **What it measures:** No definition is displayed for KPI overlay series. (as implemented, pending approval (Q7))
- **Formula:** Stored short or long row series (src/frontend-ob/src/components/Cpm/CpmHistorical.tsx:119). Capped at 500 rows (src/frontend-ob/src/components/Cpm/CpmHistorical.tsx:58). (as implemented, pending approval (Q7))
- **Window and eligibility:** 15m sliding or 12h, by overlay; not the page fused window. Eligibility: Rows in range. (as implemented, pending approval (Q7))
- **Unit:** as declared on overlay; computed as as stored. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm/historical (as implemented, pending approval (Q7))
- **Register status:** Label only. See M-112 in the register before using this text. (as implemented, pending approval (Q7))

## Windows page

### M-113 Window contract

- **What it measures:** Gate results are produced only for 12h and 24h windows: fusion fires on long records. (as implemented, pending approval (Q7))
- **Formula:** Hand-kept mirror of job specs (src/services/cplm-api/Services/WindowCatalog.cs:3-13,25-40; src/flink/src/main/java/com/ams/flink/cplm/ShortWindowSpecs.java:54-60). (as implemented, pending approval (Q7))
- **Window and eligibility:** n/a Eligibility: n/a (as implemented, pending approval (Q7))
- **Unit:** duration; computed as ms. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm/windows (as implemented, pending approval (Q7))
- **Register status:** Consistent. See M-113 in the register before using this text. (as implemented, pending approval (Q7))

### M-114 Sample density

- **What it measures:** {n} buckets · full-height = 100% of the {grid} s-grid budget (engine-reported) · amber = sparse · grey = empty. (as implemented, pending approval (Q7))
- **Formula:** Client count of raw PV points into 24 buckets ÷ expected (src/frontend-ob/src/components/Cpm/windows/WindowDetail.tsx:69-94). Page cap 5000 points (src/frontend-ob/src/components/Cpm/windows/WindowDetail.tsx:58). (as implemented, pending approval (Q7))
- **Window and eligibility:** Selected window; browser computed. Eligibility: Raw samples. (as implemented, pending approval (Q7))
- **Unit:** % of grid budget; computed as ratio. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm/windows (as implemented, pending approval (Q7))
- **Register status:** Undocumented. See M-114 in the register before using this text. (as implemented, pending approval (Q7))

### M-115 Across window sizes statistics

- **What it measures:** Statistics are per window kind over its latest 12 emitted windows; declined windows are excluded. Kinds other than 1m are sliding windows whose samples overlap — values are comparable side by side but must never be summed across rows. (as implemented, pending approval (Q7))
- **Formula:** Client statistics over 12 short rows; median takes the upper-middle element (src/frontend-ob/src/components/Cpm/windows/CompareAcrossKinds.tsx:38-43). (as implemented, pending approval (Q7))
- **Window and eligibility:** Latest 12 rows of each short kind. Eligibility: Rows not declined. (as implemented, pending approval (Q7))
- **Unit:** per metric; computed as per metric. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: not determined; no version field on this value. Shown: no. (as implemented, pending approval (Q7))
- **Link target:** /cpm/windows (as implemented, pending approval (Q7))
- **Register status:** Undocumented. See M-115 in the register before using this text. (as implemented, pending approval (Q7))

## Calculations page

### M-116 Calculations page tallies

- **What it measures:** No definition is displayed for Calculations page tallies. (as implemented, pending approval (Q7))
- **Formula:** Tally over gates that appear in METRICS: G0, G1, G3 to G9, G15 = 10 gates (src/frontend-ob/src/components/Cpm/CpmCalculations.tsx:204-215; src/frontend-ob/src/components/Cpm/calcCatalogue.ts:24-47). "In the pack" comes from the served catalogue of 17 (src/frontend-ob/src/components/Cpm/CpmCalculations.tsx:275). Explorer counts by mark meaning; detected and classified fall into the last bucket (src/frontend-ob/src/components/Cpm/explorer/summary/SummaryCalculations.tsx:45-52). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Eligibility: Selected loop. (as implemented, pending approval (Q7))
- **Unit:** count; computed as count. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm/calculations (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-116 in the register before using this text. (as implemented, pending approval (Q7))

### M-117 Gate result column on a metric

- **What it measures:** The verdict of the gate that judges this metric, on the same window. Sorts needing attention first. (as implemented, pending approval (Q7))
- **Formula:** metricAvailability decides from diagnosis, gate, flags (src/frontend-ob/src/components/Cpm/metricAvailability.ts:60-97). Replicates the gate cell per metric (src/frontend-ob/src/components/Cpm/CpmCalculations.tsx:145-158). (as implemented, pending approval (Q7))
- **Window and eligibility:** Fused rolling window: 12h default, 24h by switch (src/frontend-ob/src/components/Cpm/useWindowKind.ts:13-14). Half-open [end − size, end) (src/flink/src/main/java/com/ams/flink/cplm/engine/SignalMath.java:116-124). End sits on a 15-min epoch boundary, so UTC-aligned (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:206-213,311-315). Recomputed every 15 min (src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:55). Eligibility: Selected loop. (as implemented, pending approval (Q7))
- **Unit:** word; computed as word. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm/calculations (as implemented, pending approval (Q7))
- **Register status:** Engine-UI conflict. See M-117 in the register before using this text. (as implemented, pending approval (Q7))

## Provenance

### M-118 Calculation and profile version

- **What it measures:** This value was produced by v{stamped}, but the engine now deployed is v{deployed} — recompute the window before citing it as current evidence. (as implemented, pending approval (Q7))
- **Formula:** Constant 3.0.0 and 2.0.0, or the pack value (src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfile.java:16-17; src/flink/src/main/java/com/ams/flink/cplm/CplmLoopDynamicsProfilePacks.java:155-158). "Deployed now" = version on the newest stored row (src/services/cplm-api/Controllers/CpmEventsController.cs:134,159). (as implemented, pending approval (Q7))
- **Window and eligibility:** Per row. Eligibility: Stamped rows. (as implemented, pending approval (Q7))
- **Unit:** v{x}; computed as string. (as implemented, pending approval (Q7))
- **Source and version:** This is the version field. (as implemented, pending approval (Q7))
- **Link target:** /cpm/calculations (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-118 in the register before using this text. (as implemented, pending approval (Q7))

### M-119 Gate observed in stored results

- **What it measures:** No definition is displayed for Gate observed in stored results. (as implemented, pending approval (Q7))
- **Formula:** Keys seen in the newest 2000 rows (src/services/cplm-api/Controllers/CpmEventsController.cs:124-126,175). (as implemented, pending approval (Q7))
- **Window and eligibility:** Newest 2000 gate rows. Eligibility: n/a (as implemented, pending approval (Q7))
- **Unit:** word; computed as boolean. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm/calculations (as implemented, pending approval (Q7))
- **Register status:** Undocumented. See M-119 in the register before using this text. (as implemented, pending approval (Q7))

## Events

### M-120 Episode counts by state

- **What it measures:** One row is one episode of one fault family — a change in its evidence score extends it rather than duplicating it. (as implemented, pending approval (Q7))
- **Formula:** Server predicates per tab (src/services/cplm-api/Data/EventPageSql.cs:33-44), mirrored by the client (src/frontend-ob/src/components/Cpm/events/shelfState.ts:92-104). (as implemented, pending approval (Q7))
- **Window and eligibility:** All retained episodes. UI poll 30 s (src/frontend-ob/src/components/Cpm/events/useEventPage.ts:10,14). Eligibility: Scope, loop, search. (as implemented, pending approval (Q7))
- **Unit:** count; computed as count. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm/events (as implemented, pending approval (Q7))
- **Register status:** Consistent. See M-120 in the register before using this text. (as implemented, pending approval (Q7))

### M-121 Episode peak and current result

- **What it measures:** No definition is displayed for Episode peak and current result. (as implemented, pending approval (Q7))
- **Formula:** peak ratchets up on the episode family only (src/services/cplm-api/Services/EventFrameLifecycle.cs:190-194); last_diagnosis follows (src/services/cplm-api/Services/EventFrameLifecycle.cs:195-196). (as implemented, pending approval (Q7))
- **Window and eligibility:** Episode life. Eligibility: Fault verdict opened a frame. (as implemented, pending approval (Q7))
- **Unit:** label, 0 to 100; computed as fraction. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: calculationVersion, dynamicsProfileVersion, sourceCommit, jarSha256 on every gate row (src/flink/src/main/java/com/ams/flink/cplm/CplmGateResult.java:42-45). Shown in detail (src/frontend-ob/src/components/Cpm/events/EventDetail.tsx:145-146). (as implemented, pending approval (Q7))
- **Link target:** /cpm/events (as implemented, pending approval (Q7))
- **Register status:** Consistent. See M-121 in the register before using this text. (as implemented, pending approval (Q7))

### M-122 Episode windows and qualified support

- **What it measures:** Overlapping windows add only their non-overlapping support and do not bump the window count, so a sliding window reported every 15 minutes cannot inflate persistence. (as implemented, pending approval (Q7))
- **Formula:** Window count +1 when the window starts after support end; support adds the non-overlapping part × support fraction (src/services/cplm-api/Services/EventFrameLifecycle.cs:183-202). qualified_support = samples × period, bounded (src/flink/src/main/java/com/ams/flink/cplm/CplmGateFusionEngine.java:284-287). (as implemented, pending approval (Q7))
- **Window and eligibility:** Episode life. Eligibility: Open or closed frame. (as implemented, pending approval (Q7))
- **Unit:** count, h or d; computed as count, ms. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: not determined; no version field on this value. Shown: no. (as implemented, pending approval (Q7))
- **Link target:** /cpm/events (as implemented, pending approval (Q7))
- **Register status:** Consistent. See M-122 in the register before using this text. (as implemented, pending approval (Q7))

### M-123 Episode condition

- **What it measures:** Closed by an evaluable, fault-free result with enough qualified support. (as implemented, pending approval (Q7))
- **Formula:** Close RECOVERED when a clear result rests on ≥ recovery support, FAMILY_CHANGED after 3 windows (src/services/cplm-api/Services/EventFrameLifecycle.cs:81-83,122-136,151). (as implemented, pending approval (Q7))
- **Window and eligibility:** Episode life. Eligibility: n/a (as implemented, pending approval (Q7))
- **Unit:** word; computed as enum. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm/events (as implemented, pending approval (Q7))
- **Register status:** Consistent. See M-123 in the register before using this text. (as implemented, pending approval (Q7))

### M-124 Episode availability

- **What it measures:** Still open: the newest window could not be judged (excluded or insufficient data), so the condition has NOT recovered. (as implemented, pending approval (Q7))
- **Formula:** UNOBSERVABLE when the newest result is EXCLUDED*, INSUFFICIENT_DATA or empty (src/services/cplm-api/Services/EventFrameLifecycle.cs:85-87,112-120). (as implemented, pending approval (Q7))
- **Window and eligibility:** Newest result. Eligibility: Open frame. (as implemented, pending approval (Q7))
- **Unit:** word; computed as enum. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm/events (as implemented, pending approval (Q7))
- **Register status:** Consistent. See M-124 in the register before using this text. (as implemented, pending approval (Q7))

### M-125 Acknowledgement and shelf state

- **What it measures:** No definition is displayed for Acknowledgement and shelf state. (as implemented, pending approval (Q7))
- **Formula:** ack_state and shelf_state stored separately; expiry judged against the clock (src/frontend-ob/src/components/Cpm/events/shelfState.ts:19-26). Limit from server policy (src/services/cplm-api/Services/ShelvingOptions.cs:8). (as implemented, pending approval (Q7))
- **Window and eligibility:** Now. Sweep 60 s. Eligibility: Open frame for a shelf. (as implemented, pending approval (Q7))
- **Unit:** word, duration; computed as enum. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm/events (as implemented, pending approval (Q7))
- **Register status:** Consistent. See M-125 in the register before using this text. (as implemented, pending approval (Q7))

### M-126 Fast conditions

- **What it measures:** No definition is displayed for Fast conditions. (as implemented, pending approval (Q7))
- **Formula:** Condition engine events (src/flink/src/main/java/com/ams/flink/cplm/condition/ConditionDetector.java:1-167), fed to G10 and G11 (src/flink/src/main/java/com/ams/flink/cplm/fusion/FusionInputs.java:149-162). (as implemented, pending approval (Q7))
- **Window and eligibility:** Live. UI poll 30 s (src/frontend-ob/src/components/Cpm/events/useConditions.ts:6). Eligibility: Scope. (as implemented, pending approval (Q7))
- **Unit:** count, age, duration; computed as ms. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm/events (as implemented, pending approval (Q7))
- **Register status:** Undocumented. See M-126 in the register before using this text. (as implemented, pending approval (Q7))

## Evidence

### M-127 Evidence readiness and basis

- **What it measures:** The live engine's own arrays for this run, kept by the retention policy. (as implemented, pending approval (Q7))
- **Formula:** Manifest readiness from cplm-api; basis derived client side (src/frontend-ob/src/components/Cpm/evidence/evidenceBasis.ts:72-95). (as implemented, pending approval (Q7))
- **Window and eligibility:** Per run. Eligibility: Run with artifacts. (as implemented, pending approval (Q7))
- **Unit:** word; computed as enum. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: run identity. Shown: Identity & raw (src/frontend-ob/src/components/Cpm/evidence/gateFacts.ts:71-83). (as implemented, pending approval (Q7))
- **Link target:** /cpm/evidence (as implemented, pending approval (Q7))
- **Register status:** Undocumented. See M-127 in the register before using this text. (as implemented, pending approval (Q7))

### M-128 Measured against required

- **What it measures:** A threshold the profile does not configure is said so, never invented. (as implemented, pending approval (Q7))
- **Formula:** Rows from the fused row and the effective config (src/frontend-ob/src/components/Cpm/evidence/whyRules.ts:63-135). The effective config is fetched only with cpm.config.read (src/frontend-ob/src/components/Cpm/evidence/ExplainWhy.tsx:43-49). (as implemented, pending approval (Q7))
- **Window and eligibility:** Selected run. Eligibility: Fusion tier row. (as implemented, pending approval (Q7))
- **Unit:** per row; computed as per row. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: bundle version in the source line, for permitted users only (src/frontend-ob/src/components/Cpm/evidence/ExplainWhy.tsx:92-94). (as implemented, pending approval (Q7))
- **Link target:** /cpm/evidence (as implemented, pending approval (Q7))
- **Register status:** Engine-UI conflict. See M-128 in the register before using this text. (as implemented, pending approval (Q7))

## System response

### M-129 Response event state

- **What it measures:** Censored candidates were superseded by a later change or hit a source gap. (as implemented, pending approval (Q7))
- **Formula:** Capture state machine and subgates (src/flink/src/main/java/com/ams/flink/cplm/response/event/CaptureStateMachine.java:1-153; src/flink/src/main/java/com/ams/flink/cplm/response/ResponseEvaluator.java:224-268). Trigger per kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:214. (as implemented, pending approval (Q7))
- **Window and eligibility:** Event-keyed, not window-keyed. Capture ≥ 180 s, ≤ 4 h (src/flink/src/main/java/com/ams/flink/cplm/response/ResponseJobConfig.java:16-18). Site zone on the page (src/frontend-ob/src/components/Cpm/response/ResponseWorkspace.tsx:147). Eligibility: Qualified step in AUTO. (as implemented, pending approval (Q7))
- **Unit:** word; computed as enum. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: method id and version, bundle hash (src/frontend-ob/src/components/Cpm/response/EventAside.tsx:55-59). Shown: yes in the event aside. (as implemented, pending approval (Q7))
- **Link target:** /cpm/response (as implemented, pending approval (Q7))
- **Register status:** Consistent. See M-129 in the register before using this text. (as implemented, pending approval (Q7))

### M-130 Process model parameters

- **What it measures:** ± 1 standard error, or half the range of equally good delays. (as implemented, pending approval (Q7))
- **Formula:** Estimators with standard errors (src/flink/src/main/java/com/ams/flink/cplm/response/ResponseEvaluator.java:177-180; src/flink/src/main/java/com/ams/flink/cplm/response/estimation/OutputErrorEstimator.java:1-306). (as implemented, pending approval (Q7))
- **Window and eligibility:** Event-keyed, not window-keyed. Capture ≥ 180 s, ≤ 4 h (src/flink/src/main/java/com/ams/flink/cplm/response/ResponseJobConfig.java:16-18). Site zone on the page (src/frontend-ob/src/components/Cpm/response/ResponseWorkspace.tsx:147). Eligibility: Accepted event, estimation ran. (as implemented, pending approval (Q7))
- **Unit:** value ± unc, unit from kernel, PV_EU replaced by pvUnit; computed as per quantity. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: method id and version, bundle hash (src/frontend-ob/src/components/Cpm/response/EventAside.tsx:55-59). Shown: yes in the event aside. (as implemented, pending approval (Q7))
- **Link target:** /cpm/response (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-130 in the register before using this text. (as implemented, pending approval (Q7))

### M-131 Observed response timing

- **What it measures:** No definition is displayed for Observed response timing. (as implemented, pending approval (Q7))
- **Formula:** p(t) progress; crossings held ≥ dwell; rise = t90 − t10; settling inside max(abs, rel × |Δy|) for tail dwell; overshoot = 100 × (max p − 1) above the band; steady error = r1 − yss (src/flink/src/main/java/com/ams/flink/cplm/response/metrics/ResponseMetricCalculator.java:51-118; src/flink/src/main/java/com/ams/flink/cplm/response/metrics/Overshoot.java:35-52; src/flink/src/main/java/com/ams/flink/cplm/response/metrics/Settling.java:23-47). (as implemented, pending approval (Q7))
- **Window and eligibility:** Event-keyed, not window-keyed. Capture ≥ 180 s, ≤ 4 h (src/flink/src/main/java/com/ams/flink/cplm/response/ResponseJobConfig.java:16-18). Site zone on the page (src/frontend-ob/src/components/Cpm/response/ResponseWorkspace.tsx:147). Eligibility: Baseline and endpoint found, response ≥ minResponseEu. (as implemented, pending approval (Q7))
- **Unit:** s, % of response change, EU; computed as same. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: method id and version, bundle hash (src/frontend-ob/src/components/Cpm/response/EventAside.tsx:55-59). Shown: yes in the event aside. (as implemented, pending approval (Q7))
- **Link target:** /cpm/response (as implemented, pending approval (Q7))
- **Register status:** Label only. See M-131 in the register before using this text. (as implemented, pending approval (Q7))

### M-132 Model validation

- **What it measures:** Free-run and one-step prediction errors are reported separately: a flexible predictor with the wrong plant can pass one-step and fail free-r…. (as implemented, pending approval (Q7))
- **Formula:** improvement = 1 − RMSE/RMSE_baseline; ≤ 0 REJECTED; RMSE above noise or bias above limit CANDIDATE; else VALIDATED (src/flink/src/main/java/com/ams/flink/cplm/response/validation/ModelValidator.java:73-99). (as implemented, pending approval (Q7))
- **Window and eligibility:** Event-keyed, not window-keyed. Capture ≥ 180 s, ≤ 4 h (src/flink/src/main/java/com/ams/flink/cplm/response/ResponseJobConfig.java:16-18). Site zone on the page (src/frontend-ob/src/components/Cpm/response/ResponseWorkspace.tsx:147). Eligibility: Fitted model and an independent event. (as implemented, pending approval (Q7))
- **Unit:** raw key labels; computed as per quantity. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: method id and version, bundle hash (src/frontend-ob/src/components/Cpm/response/EventAside.tsx:55-59). Shown: yes in the event aside. (as implemented, pending approval (Q7))
- **Link target:** /cpm/response (as implemented, pending approval (Q7))
- **Register status:** Label only. See M-132 in the register before using this text. (as implemented, pending approval (Q7))

### M-133 Frequency-response margins

- **What it measures:** the kernel writes a Bode artifact only from a validated model with a known controller form and a crossing in band. (as implemented, pending approval (Q7))
- **Formula:** FrequencyResponse.of on the validated model and controller form (src/flink/src/main/java/com/ams/flink/cplm/response/ResponseEvaluator.java:224-233); SIMC advisor (src/flink/src/main/java/com/ams/flink/cplm/response/ResponseEvaluator.java:252). (as implemented, pending approval (Q7))
- **Window and eligibility:** Event-keyed, not window-keyed. Capture ≥ 180 s, ≤ 4 h (src/flink/src/main/java/com/ams/flink/cplm/response/ResponseJobConfig.java:16-18). Site zone on the page (src/frontend-ob/src/components/Cpm/response/ResponseWorkspace.tsx:147). Eligibility: Validated model, known controller form. (as implemented, pending approval (Q7))
- **Unit:** dB, degree, rad/s; computed as same. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: method id and version, bundle hash (src/frontend-ob/src/components/Cpm/response/EventAside.tsx:55-59). Shown: yes in the event aside. (as implemented, pending approval (Q7))
- **Link target:** /cpm/response (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-133 in the register before using this text. (as implemented, pending approval (Q7))

### M-134 Quantity catalogue

- **What it measures:** A null quantity is stated with its reason ("not applicable (integrating)"), never shown as 0. (as implemented, pending approval (Q7))
- **Formula:** Fixed list with units and null reasons (src/flink/src/main/java/com/ams/flink/cplm/response/G12Result.java:40-60; src/flink/src/main/java/com/ams/flink/cplm/response/metrics/ResponseMetricCalculator.java:13-16). (as implemented, pending approval (Q7))
- **Window and eligibility:** Event-keyed, not window-keyed. Capture ≥ 180 s, ≤ 4 h (src/flink/src/main/java/com/ams/flink/cplm/response/ResponseJobConfig.java:16-18). Site zone on the page (src/frontend-ob/src/components/Cpm/response/ResponseWorkspace.tsx:147). Eligibility: Event selected. (as implemented, pending approval (Q7))
- **Unit:** per quantity; computed as per quantity. (as implemented, pending approval (Q7))
- **Source and version:** Stamped: method id and version, bundle hash (src/frontend-ob/src/components/Cpm/response/EventAside.tsx:55-59). Shown: yes in the event aside. (as implemented, pending approval (Q7))
- **Link target:** /cpm/response (as implemented, pending approval (Q7))
- **Register status:** Consistent. See M-134 in the register before using this text. (as implemented, pending approval (Q7))

## Pipeline

### M-135 Required jobs running

- **What it measures:** No definition is displayed for Required jobs running. (as implemented, pending approval (Q7))
- **Formula:** pipeline-status job list; running count client side (src/frontend-ob/src/components/Cpm/CpmPipeline.tsx:59-60). (as implemented, pending approval (Q7))
- **Window and eligibility:** Now. Poll 15 s and 20 s (src/frontend-ob/src/hooks/useCpm.ts:174,405). Eligibility: system.manage (docs/theme/cpa-currenttheme.md:480). (as implemented, pending approval (Q7))
- **Unit:** x/y, duration; computed as count, s. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm/pipeline (as implemented, pending approval (Q7))
- **Register status:** Undocumented. See M-135 in the register before using this text. (as implemented, pending approval (Q7))

### M-136 Checkpoint figures

- **What it measures:** sum of last completed checkpoints. (as implemented, pending approval (Q7))
- **Formula:** completed ÷ (completed + failed) since job start (src/frontend-ob/src/components/Cpm/CpmPipeline.tsx:62-66). Managed state = sum of last checkpoint sizes (src/frontend-ob/src/components/Cpm/CpmPipeline.tsx:66). (as implemented, pending approval (Q7))
- **Window and eligibility:** Since job start; chart while the page is open, 20 s cadence. Eligibility: Job has checkpoints. (as implemented, pending approval (Q7))
- **Unit:** % to 0.1, MB, s; computed as count, bytes, ms. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm/pipeline (as implemented, pending approval (Q7))
- **Register status:** Undocumented. See M-136 in the register before using this text. (as implemented, pending approval (Q7))

### M-137 Metrics stated as unavailable

- **What it measures:** not exposed by the metrics proxy. (as implemented, pending approval (Q7))
- **Formula:** None; constant "—". (as implemented, pending approval (Q7))
- **Window and eligibility:** n/a Eligibility: n/a (as implemented, pending approval (Q7))
- **Unit:** —; computed as none. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm/pipeline (as implemented, pending approval (Q7))
- **Register status:** Undocumented. See M-137 in the register before using this text. (as implemented, pending approval (Q7))

### M-138 Last fused verdict age

- **What it measures:** No definition is displayed for Last fused verdict age. (as implemented, pending approval (Q7))
- **Formula:** max(window_end) over up to 200 rankings at 12h, newest real verdict per loop (src/frontend-ob/src/components/Cpm/CpmPipeline.tsx:55,69-76; src/services/cplm-api/Data/FleetLatestSql.cs:34-55). Round trip = client timer around a recompute (src/frontend-ob/src/components/Cpm/CpmPipeline.tsx:131-135). (as implemented, pending approval (Q7))
- **Window and eligibility:** 12h hardcoded (src/frontend-ob/src/components/Cpm/CpmPipeline.tsx:55). Poll 60 s. Eligibility: Monitored loops; 200 cap. (as implemented, pending approval (Q7))
- **Unit:** min or h; computed as ms. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm/pipeline (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-138 in the register before using this text. (as implemented, pending approval (Q7))

## Governance and admin

### M-139 Audit trail figures

- **What it measures:** Immutable cryptographically-chained record of all operator and system actions. (as implemented, pending approval (Q7))
- **Formula:** Audit service events and chain verifier (docs/theme/cpa-currenttheme.md:784). (as implemented, pending approval (Q7))
- **Window and eligibility:** Newest 200 rows fetched (src/frontend-ob/src/components/Cpm/CpmGovernance.tsx:30). Eligibility: admin.audit.view. (as implemented, pending approval (Q7))
- **Unit:** count; computed as count. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm/governance (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-139 in the register before using this text. (as implemented, pending approval (Q7))

### M-140 Governance provenance figures

- **What it measures:** Every stored window carries these versions in its payload (A13), so any historical verdict can be attributed to the formula that produced it. (as implemented, pending approval (Q7))
- **Formula:** Capabilities endpoint; registry; RBAC API. (as implemented, pending approval (Q7))
- **Window and eligibility:** Now. Eligibility: system.manage. (as implemented, pending approval (Q7))
- **Unit:** text; computed as text. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm/governance (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-140 in the register before using this text. (as implemented, pending approval (Q7))

### M-141 Configuration lifecycle figures

- **What it measures:** No definition is displayed for Configuration lifecycle figures. (as implemented, pending approval (Q7))
- **Formula:** Server control plane; ack summary client side (src/frontend-ob/src/components/Cpm/config/lifecycle.ts:81-87). (as implemented, pending approval (Q7))
- **Window and eligibility:** Now. Shadow polled 10 s while running. Eligibility: cpm.config.read. (as implemented, pending approval (Q7))
- **Unit:** count; computed as count. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm/config (as implemented, pending approval (Q7))
- **Register status:** Consistent. See M-141 in the register before using this text. (as implemented, pending approval (Q7))

## Registry

### M-142 Loop readiness

- **What it measures:** Nothing blocking means the loop IS evaluated; what remains limits what the evidence can claim (SME review #4/#6) - a configuration limit, not a fault, so it is not worded as one. (as implemented, pending approval (Q7))
- **Formula:** Server checks (src/services/cplm-api/Controllers/CpmReadinessController.cs:152-248); blocking set mirrored on the client (src/frontend-ob/src/components/Cpm/explorer/readinessCauses.ts:17-21). (as implemented, pending approval (Q7))
- **Window and eligibility:** Now. Eligibility: Registry loop. (as implemented, pending approval (Q7))
- **Unit:** count, word; computed as boolean per check. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /cpm/explorer (as implemented, pending approval (Q7))
- **Register status:** Consistent. See M-142 in the register before using this text. (as implemented, pending approval (Q7))

## Governance and admin

### M-143 Administration counts

- **What it measures:** No definition is displayed for Administration counts. (as implemented, pending approval (Q7))
- **Formula:** Service totals (src/frontend-ob/src/components/Administration/PlantModelStatus.tsx:20-23,62-68). (as implemented, pending approval (Q7))
- **Window and eligibility:** Now; staleTime 60 s. Eligibility: Per tab permission. (as implemented, pending approval (Q7))
- **Unit:** count; computed as count. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /admin/users (as implemented, pending approval (Q7))
- **Register status:** Undocumented. See M-143 in the register before using this text. (as implemented, pending approval (Q7))

### M-144 System settings shown

- **What it measures:** Not functional yet — these settings are not connected to the backend and cannot be saved. Values shown are illustrative defaults, not the running configuration. (as implemented, pending approval (Q7))
- **Formula:** Client constants 30, 365, /mnt/backups/ams (src/frontend-ob/src/components/Administration/SystemSettingsConfig.tsx:9-11). Real retention: prod_decision.md:44-73. (as implemented, pending approval (Q7))
- **Window and eligibility:** n/a Eligibility: SuperAdmin. (as implemented, pending approval (Q7))
- **Unit:** days, text; computed as none. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /admin/system (as implemented, pending approval (Q7))
- **Register status:** Definition conflict. See M-144 in the register before using this text. (as implemented, pending approval (Q7))

### M-145 Login status strip

- **What it measures:** No definition is displayed for Login status strip. (as implemented, pending approval (Q7))
- **Formula:** package version at build, navigator.onLine, browser clock (docs/theme/cpa-currenttheme.md:783). (as implemented, pending approval (Q7))
- **Window and eligibility:** Now. Eligibility: None. (as implemented, pending approval (Q7))
- **Unit:** text; computed as text. (as implemented, pending approval (Q7))
- **Source and version:** Not applicable: operational or registry value, no calculation version. (as implemented, pending approval (Q7))
- **Link target:** /login (as implemented, pending approval (Q7))
- **Register status:** Label only. See M-145 in the register before using this text. (as implemented, pending approval (Q7))
