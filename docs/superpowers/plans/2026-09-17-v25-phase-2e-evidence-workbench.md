# v2.5 Phase 2E — Gate evidence workbench (frontend)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Expands master-plan tasks 2E.1–2E.5 (R12 UI half, R13, R14; NR-031…NR-035).

**Goal:** A workbench that opens any gate cell from an **immutable selection** (loop, method run, gate, support, bundle hash) — never "latest" — and renders the engine's exact artifacts (2C.1c field names, units, masks) with the method trace beside them; a response workspace for G12; historical charts with one axis per unit group; unavailable evidence is a stated state with its reason and a reconstruction action, never an empty chart.

**Architecture:** `src/components/Cpm/evidence/` holds the infrastructure (`CpmChart`, `GateResultState`, `timezone`, `artifactCodec`), the shell (`GateEvidenceWorkspace` + header, lanes, method trace, renderer) and `views/` (one file per gate, shared `primitives/`). Hooks in `evidence/useEvidence.ts` use @tanstack/react-query with abort-on-selection-change. API modules `src/api/cpm/{evidence,response}.ts`. OpenBridge only (skill loaded): per-path React wrappers, tokens, `obi-*` icons; echarts via `cpmChartColors()` / `cpmToneColors()`.

**Tech Stack:** React 18, TypeScript, Vite, vitest + @testing-library/react, echarts-for-react, @tanstack/react-query, react-router-dom 6, `@oicl/openbridge-webcomponents-react`.

**Spec:** §3.1–3.5 (workbench: header, three columns, 17 views, method trace, states), `xlsx_Gate_evidence.tsv` ("Required views / Axes and units / Interaction / Eligibility-failure" columns), NR-031 (immutable selection), NR-033 (two axes), NR-034 (unavailable → reason), NR-035 (band meaning label).

## Global Constraints

- **Immutable selection**: the workspace never calls `useLatestGates`; "Go to latest" navigates to a new selection. URL is the source of truth (`/cpm/evidence?loop=&methodRun=&gate=`).
- **No browser math beyond presentation**: artifacts are decoded, never recomputed; the ordinate kind / units come from the manifest.
- `connectNulls: false` everywhere; held / hold_kind series render `step: 'end'`; one y axis per unit group; time axes labelled with the site zone.
- Every view degrades to `GateResultState` when its artifacts are missing (readiness ≠ COMPLETE → the reason and the reconstruct action).
- Files ≤ 300 lines (views) / 400 (infrastructure); TDD with vitest; commit per task.

---

### Task 2E.1: Chart and state infrastructure

**Files:** Create `evidence/CpmChart.tsx`, `evidence/GateResultState.tsx` (+ `classifyGateResult`), `evidence/timezone.ts`, `evidence/artifactCodec.ts`, `src/api/cpm/evidence.ts`; tests `classifyGateResult.test.ts`, `artifactCodec.test.ts`, `timezone.test.ts`, `CpmChart.test.tsx`.

- [ ] Failing tests: 9 states classified; codec reassembles chunks, gunzips, verifies sha, decodes named columns and legends, fails loudly on a checksum mismatch; tz formats a DST boundary; the chart option has one yAxis per unit group and never connects nulls.
- [ ] Implement; `npm test`; commit `feat(cpm-ui): evidence chart/state infrastructure + artifact codec (2E.1)`.

### Task 2E.2: Historical chart axes and tooltip (R14)

**Files:** Modify `historical/chartOption.ts` (PV/SP EU axis, OP/VP pp axis, tooltip with unit + value + sample/verified time + quality), `CpmHistorical.tsx` (normalise toggle); split `CpmReplay.tsx` into `replay/ReplayChart.tsx`, `replay/TransformationStepper.tsx`, `replay/LineageStrip.tsx`; test `chartOption.test.ts`.

- [ ] Failing test (400 °C PV and 0–100 pp OP → two axes) → implement → commit `fix(cpm-ui): one axis per unit group on the historical chart; replay split (2E.2)`.

### Task 2E.3: Workspace shell with an immutable selection (R13)

**Files:** Create `evidence/GateEvidenceWorkspace.tsx`, `GateEvidenceHeader.tsx`, `SignalContextLanes.tsx`, `MethodTracePanel.tsx`, `EvidenceArtifactRenderer.tsx`, `useEvidence.ts`, `selection.ts`; modify `GateEvidencePanel.tsx` (launcher with the clicked cell's `methodRunId`), `App.tsx` (route + nav "Evidence Workbench"), `GateMatrix`/fleet heatmap cells carry `methodRunId` (`FleetLatestSql.cs` + `CpmFleetController`); delete the three `GATE_ROLES` copies (catalogue roles instead).
- Test `GateEvidenceWorkspace.test.tsx` (no `/gates/latest` request ever; URL selection restored).

- [ ] Failing test → implement → commit `feat(cpm-ui): GateEvidenceWorkspace - immutable selection, method trace, artifact renderer (2E.3)`.

### Task 2E.4: The 17 gate views

**Files:** `evidence/views/G0DataQualification.tsx` … `G15Decision.tsx` (G12 → 2E.5, G13 → 2F placeholder view using the capability record), `evidence/views/primitives/{IntervalLane,MaskedLine,Markers,ScatterTrajectory,SpectrumChart,LagChart,PhaseOverlay,PolygonChart,TimelineTable}.tsx`; fixtures `evidence/__fixtures__/*.json`; one vitest per view group asserting axis units, no `connectNulls`, unavailable → `GateResultState`, band meaning labels.

- [ ] Failing tests → implement → commit `feat(cpm-ui): the 17 gate evidence views on the exact artifacts (2E.4)`.

### Task 2E.5: ResponseWorkspace (G12)

**Files:** `components/Cpm/response/{ResponseWorkspace,EventList,ResponseChart,ResidualPanel,CandidateModelsTable,BodePanel,ModelHistory,ModelReviewDialog,useResponse}.tsx`, `src/api/cpm/response.ts`; route `/cpm/response?loop=&event=`; nav "System Response"; tests `ResponseChart.test.tsx` (labelled bands; integrating fixture shows process gain as not applicable), `ModelHistory.test.tsx` (no line series).

- [ ] Failing tests → implement → commit `feat(cpm-ui): ResponseWorkspace - events, fits, residuals, candidate models, review (2E.5)`.
