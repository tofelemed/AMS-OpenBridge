# Task 2 (CHG-184): removals — report

Owner review 2026-11-14 items 0, 1, 9 (run id), 11.3 (Identity & raw, CONFIGURATION), 12 ("unit not set"), 15 (Run UUID);
owner decisions Q1 (Pipeline Health and Administration too) and Q6 (Record details removed everywhere).

The page-by-page sweep table (removed · kept and why) and the owner questions are in
`docs/theme/redesign/owner-review-2026-11-14/item0-sweep.md`. Every visible text change is in
`docs/theme/redesign/text-changes.md` under `## CHG-184`.

## What changed, per area and file

### Evidence Workbench (`components/Cpm/evidence`)
- `selection.ts`: `WORKBENCH_TABS` is `proof | rules | signal`; `tabOf('identity')` is `proof`, so an old `?sub=identity`
  link opens Proof (a `?tab=identity` parameter is not read by the Workbench and also lands on Proof).
- `GateEvidenceWorkspace.tsx`: the Identity & raw tab entry and render, the versions string, the run id in
  "Reconstruction accepted (run …)", "predate v2.5" in the empty state; no `selection` prop to `RunSummaryBar`, no `runId`
  to `ReconstructDialog`.
- `RunSummaryBar.tsx`: the "Run" label and `CopyableId` went (item 9). `CopyableId` stays: Administration › Plant model
  uses it for the node's path (Copy is the approved CHG-172 behaviour there).
- `ReconstructDialog.tsx`: the Run (UUID) row and the `runId` prop (item 15).
- `tabs/RulesTab.tsx`: CONFIGURATION section (bundle hash, copy, "Configuration used by this run ↗", its drawer),
  method version and code-on-hover, Tier, Capability, "bundle v4" in the thresholds line, "in this build" (11.3).
  Plain "Needs", role casing and the profile's name are left to Task 5 (CHG-187) as planned.
- `tabs/IdentityTab.tsx` + its test: `git rm`.
- `gateFacts.ts`: `identityOf` removed (only Identity & raw used it); method code / version / capability keys no
  longer listed as "Parameters used".
- `VerdictCard.tsx`: `WindowFlags` removed (only Identity & raw used it; the flags are on Investigation, Performance
  and Replay).
- `tabs/ProofTab.tsx`: the Metric (CPLM-0xx) column of the inputs table. The 19 names are unique, so no code is needed
  to tell two apart; Task 5 puts the code in each row's ? tip (spec 11.1).
- `GateResultState.tsx`: "Method not installed in this build" + method code/state → "Method not available" + reason in
  words; "The method run id does not resolve…" → "No stored evaluation matches this run."
- `evidenceBasis.ts` (build commit), `evaluationState.ts` ("Flink", "(Kafka)"), `verdictCopy.ts` ("predates v2.5").
- CSS (`cpm-workbench.css`): rules for the run label, raw record and identity links removed.

### Calculations, Run details, Replay
- `calc/CalcPanel.tsx`: metric code beside the title, Record details, Identity & raw ↗, the `record` prop; the stale
  warning names no versions. `calc/CalcRecordDialog.tsx`, `calc/recordRows.ts` (+ test): `git rm`.
- `calc/CalcList.tsx`: row sub "CPLM-010 · G3" → "G3". `CpmCalculations.tsx`: no `record` prop.
- `calc/CalcFoot.tsx`, `CpmReplay.tsx`: "Re-run <id>" → "Re-run".
- `replay/RunDetailsDialog.tsx`: decision run id, bundle hash, versions, engine build rows removed.
- `replay/WindowResultSelect.tsx`: re-runs read "Re-run" (or "Re-run 1/2…" in computed order); the id stays the value.
- `replay/RerunDialog.tsx`: "engine build" and "this release" wording. `replay/ReplayChart.tsx`: phase-plane axis "PV".

### "unit not set" (item 12)
- `trend/trendOption.ts` `pvAxisName`: "PV / SP" with no unit (Overview, Loop Explorer, Investigation, Replay).
- `ui/trend/*` (the shared TrendPanel, used only in the design gallery today): axis names, value cells, table headings
  and the chart description print the label alone; README updated.

### Loop Events, Window Inspector, Loop Registry, Historical, Loop Explorer, Investigation, Performance
- `events/EventDetail.tsx`: Record details removed; `events/EventRecordDialog.tsx`: `git rm` (item 1). "v2.5" texts in
  `eventsState.ts`, `EventsHowToRead.tsx`.
- `windows/SelectedWindow.tsx`, `windows/WindowDialogs.tsx`: Record details and `RecordDetailsDialog` removed.
- `registry/LoopPanel.tsx`: Record details removed; `registry/LoopRecordDialog.tsx`: `git rm`; `recordRows`,
  `acquisitionText`, `RecordRow` removed from `loopPanelFacts.ts` (the facts are on the Loop Explorer's model card).
- `historical/SelectedWindowPanel.tsx`: Technical details → a Samples row (calculation version gone), run id out of the
  tooltip, "(before v2.5)"; `useWindowKpis.ts`: the `calculation` field went. `ui/TechnicalDetails` stays (gallery uses it).
- `explorer/RelationshipsTab.tsx`: lineage without engine name and calc version (and no longer reads the latest gates);
  `LoopWorkspace.tsx` no longer passes `windowKind` to it.
- `health/TransmitterHealthPanel.tsx`, `health/HealthLane.tsx`: NE107 mapping version and "rev N" removed.
- `explorer/summary/SummaryGateDetail.tsx`, `investigation/GateProofDialog.tsx`, `GateEvidencePanel.tsx`: "(before v2.5)";
  the Workbench tooltip names no run id. `investigation/HypothesisPanel.tsx`, `confirmationCopy.ts`: "predates v2.5".

### System Response
- `response/StepsDataTab.tsx`: Method (code + version), Run, Bundle rows and "· rev N" removed; `EventPanes.tsx` and
  `ResponseWorkspace.tsx` no longer pass `methodRunId` / `resultRevision` to it.
- `response/ModelReviewDialog.tsx`: model id and "created from event" id rows removed (new test file).

### Gate Configuration (`components/Cpm/config`)
- `GateConfigurationWorkspace.tsx`: band Record details and `recordRows` removed.
- `EffectiveLoops.tsx`: Build details (and the now unused `catalogue` prop) removed.
- `BundleVersionPanel.tsx`: content hash row. `ApprovalTab.tsx`: content column in words. `ShadowComparison.tsx`: run id.
- `DeploymentStatus.tsx`: rolled back id, jars, bundle hashes → words; "different software releases".
- `WorkersDialog.tsx`: Build part and hash columns removed. `DetailsDialog.tsx`: reduced to a plain dialog (its row and
  copy support served only removed dialogs).
- `configSupport.ts`: `bundleLabel` without hash; `workerAlignment` without "jar".
- `EffectiveView.tsx`, `EffectiveConfigDrawer.tsx`: run-bundle note and the `runBundleHash` / `at` / `gateFilter` /
  `initialGate` props (only the removed Workbench section passed them); hash columns removed.
- `LoopEffective.tsx`, `EffectivePropertyDialog.tsx`, `PropertiesTab.tsx`, `PropertyTable.tsx`, `PropertyForm.tsx`,
  `DiffImpactPanel.tsx`, `ConfigHowToRead.tsx`, `EditorView.tsx`: catalogue ids (CFG-0xx), "Read by" engine job codes,
  "build" wording.
- Bundle versions ("LOOP v6", "v7") are kept: they are the names of the objects users manage on this page.

### Pipeline Health (Q1)
- `pipeline/JobPanel.tsx`: Record details removed. `pipeline/JobList.tsx`: Engine details and the `engine` prop
  removed (`CpmPipeline.tsx` updated). `pipeline/VerificationCard.tsx`: Record details and the `analysisRunId` prop.
- `pipeline/PipelineHowToRead.tsx`: no engine state codes, no "Not exposed" part, no infrastructure names.
- CSS (`cpm-pipeline.css`): the list foot strip rules removed (the foot is gone, so the list keeps the panel's padding).

### Governance and Administration
- `governance/ApprovalPanel.tsx`: Record details removed; the primary exit stays right-aligned (`cpm-admin-foot--end`).
- Kept and listed: the audit trail's Record details (`AuditRecordDialog`) and Change traceability (versions, Build
  details) — the audit content itself.
- `Administration/DataSourceDetail.tsx`: Record details removed.

## Decisions I made
- **Record details dialogs held a few non-technical facts** that are now gone from those panels (Q6 removes them
  everywhere): Calculations — window qualification and the evidence-score band; Loop Events — fault family and support
  until; Pipeline Health — job start time (uptime stays); Window Inspector — the window's metric values (reachable
  through "Inspect this window →": Workbench proof table or Replay); Loop Registry — objective / topology / command,
  acquisition and "model set by" (on the Loop Explorer's model card).
- **Wording, not values**: where a removed hash or jar carried a meaning, a word replaces it ("for another bundle",
  "another bundle", "Current / Previous content", "different software releases", "Re-run 1/2"). Concept mentions such as
  "an approval is bound to the content hash" in How to read texts were left.
- **Epoch** (deployments) and **Historian device** (Loop Explorer) were kept and put to the owner.
- **Governance Change traceability** kept as audit content, put to the owner.
- **Workers summary helper** `workersSummary` in `configSupport.ts` is not shown anywhere (only its test uses it) and was
  left as it was.
- G5–G15 gate views (G8 method / capability tiles, G13 legacy text, the G15 engine trace) are Task 5's; listed in the
  sweep file, not changed here.

## Not done / limits
- No browser screenshots for this task (the plan asks for them only in Task 1); no lab access.
- Server-served wording that names the engine (readiness label "CPLM Flink jobs running", property reason codes such as
  `DIAGNOSTIC_MODE_NOT_GOVERNED_IN_BUILD`, deployment semantics) is unchanged: it comes from the server.
- The metric help registry's "Source and version" ? text is generated and verbatim until Q7: not edited.
- Alarm feed / Alarm rules / Notifications (outside the CPA slice) not changed.

## Checks (from `src/frontend-ob`)
- `npx vitest run src/components/Cpm src/components/Administration src/ui/trend`: 261 files, 1941 tests, 1 failure on the
  first run (SummaryGateDetail asserted the old "before v2.5" text), fixed; then the full suite.
- `npx vitest run` (full): `Test Files 325 passed (325)` · `Tests 2639 passed (2639)` · Duration 150 s.
- `npx tsc --noEmit -p tsconfig.json`: exit 0, no output.
- `npm run lint`: clean (max-warnings 0).
- `npm run lint:theme`: `lint:theme phase 3: 633 live files, gates T1 T2 T3 T4 T5 T6 T7 T8 T9 T10 T11 T13, matches 0`.
- No touched `.tsx` file is over 400 lines.
