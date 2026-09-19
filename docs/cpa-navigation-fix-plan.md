# CPA navigation and UI repair plan

Date: 2026-09-20. Status: approved by the user; implementing and verifying one phase at a time.

This plan covers the assigned Overview, Performance, Explorer, Historical, Events, shared trends, and System Response work. No application source or backend changes have been made. The flow audit is evidence and background; its recommendations are not additional implementation authorization.

## 1. Inspection and baseline

Read `docs/cpa-application-flow-audit.md` first, then `openbridge-agent-rules.md`, then `.claude/skills/openbridge/SKILL.md`. Also reviewed the architecture/performance documents and CHG-023. Inspected the running application in Chrome at `http://localhost:3000`, including the reported dialog and expanded System Response content. No acknowledgement, shelving, model-review, or recomputation action was submitted.

Baseline validation:

- `npm run lint`: passed with the existing `--max-warnings 0` script.
- `npm run build`: passed after allowing esbuild to launch outside the restricted process environment. The first attempt failed with Windows `spawn EPERM`; TypeScript was not the cause. Successful build reported dependency annotation and large-chunk warnings.
- Browser screenshots and interactions establish the visual findings below. Cached first-content timing and initial request counts have **not** been measured. The connected browser interface did not expose a Network request-list facility; tool execution duration is not a render-time measurement. A Network/HAR and browser Performance capture remain required implementation acceptance evidence.
- No initial-load changes or prefetch have been introduced. Only this planning document has been added.

## 2. Findings and causes

| Area | Finding | Evidence / consequence |
|---|---|---|
| Overview | Analysis dialog is under the application header; its primary button wraps awkwardly. | Reproduced visually. `styles/cpm.css:215,516` places the backdrop/modal at 60/61; `styles/app.css:52` places the topbar at 100. `overview/LoopFocus.tsx:99` puts text plus a literal arrow in the constrained header action. |
| Overview | Attention count is passive, queue loop IDs select a preview, and several exits discard selection. | `CpmOverview.tsx:86,103,111,125,196`. The queue uses a clickable div. Live runtime is mounted at line 98. |
| Performance | Loop cells only select the row. | `GateMatrix.tsx:228` and `CpmPerformance.tsx:95`. Engineers cannot use the ID to enter Explorer. Gate cells also use native buttons. |
| Performance | Workbench is not universally broken: inspected FIC10301 G0/G5 results had enabled actions; G0 opened an immutable run successfully. | `GateEvidencePanel.tsx:154` disables the action when `methodRunId` is absent. Its title incorrectly assumes every missing ID is a legacy result, including loading or unavailable states. Removing the guard could open unrelated evidence. |
| Context | `window` has incompatible meanings across pages. | `CpmPerformance.tsx:64` reads a duration such as `24h`; Historical/Replay read an evaluated end timestamp. Workbench links carry run/gate but omit kind/window. `GateEvidencePanel.tsx:173` also sends lowercase `tab=calculations`, while Explorer expects `Calculations`. |
| Context | Some destinations select a different/latest window when an explicit one is unavailable. | Historical and Replay have fallback behavior; Workbench's default landing selects a run-bearing window and does not resolve an explicit timestamp first. Retaining query text alone will not make these handoffs correct. |
| Explorer | The loop rail remains expanded after selection and on entry with a selected loop. | Reproduced. `CpmExplorer.tsx:39` initializes it to true; selection does not collapse it. |
| Explorer | Summary has live context but no requested gate strip or short/long calculations; Workbench is a subdued text link. | `explorer/SummaryTab.tsx`, `explorer/LoopModelCard.tsx:52`. Parent `LoopWorkspace` already loads latest gates and readiness; those can supply the initial gate summary. |
| Historical | Labels/lines and hover markers disagree on PV/SP/OP colors. | Reproduced. `historical/chartOption.ts` sets series `lineStyle.color` without corresponding `itemStyle.color`, allowing default palette markers. The same construction occurs in other CPA charts. |
| Trends | Existing sliders/inside zoom do not provide the requested drag rectangle. | Historical drag did not zoom. `Designer/TrendCore.tsx` and Historical have existing dataZoom handling; shared `evidence/CpmChart.tsx` lacks rectangle controls. Different chart implementations require adapters. |
| Events | There is no Shelved filter or unshelve action; expired shelving is still presented as active shelving. | EVT-833 was labelled Shelved despite an expiry on September 17. `CpmEvents.tsx`/`events/eventsState.ts` use stored state without deriving expiry. Selecting an event writes `event` without its known loop. |
| System Response | Expanded outputs escape the narrow right column and cause page overflow. | Reproduced with FIC10301, Show censored, event `ca1d45b1-c13d-504f-bf4e-cbeaf6ce3208`. Expanded quantity table measured about 515 CSS pixels in a 276-pixel parent; its right edge was about 1718 in a 1536-pixel viewport. These are observations, not proposed styling values. |
| System Response | Dense identity, A–H outputs, and the full quantity catalogue compete for the right column. | `response/EventAside.tsx:38,55,79`; table and long values lack containment. `styles/cpm-evidence.css` defines the three-column workspace. `response/ResponseWorkspace.tsx:33` builds event links that discard other context. |

System Response live data in the inspected loop contained 48 censored events and no complete events. Expanded censored results were checked directly. Successful fitted-model, residual, Bode, and candidate-model states were reviewed in source and still need a suitable existing lab record or test fixture for visual verification.

## 3. Context contract and exact buttons

Use one small URL parser/builder, backed by React Router. No loop store is currently necessary. Keep plant scope and page filters on the source URL so browser Back restores them.

Canonical parameters:

- `loop=L`: selected loop ID.
- `kind=K`: served duration/window kind; never hardcode the list of available kinds.
- `window=W`: evaluated window end, ISO timestamp, when the source knows it.
- `gate=G`: selected gate key.
- `methodRun=M`: immutable run ID where available; Workbench also uses `mode=FIXED`.
- `event=E`: page-specific event identity. Response events and loop-event frames have different IDs and must not be interchanged.
- `from=F&to=T`: known trend range when applicable. Preserve the existing trend signal/path encoding as well.

In the table, substitute actual values using `URLSearchParams`. Omit only genuinely unknown optional fields. Never invent a window timestamp, copy a run from another loop/gate, or turn a missing ID into a latest-run selection. For an explicitly requested unavailable window, show a missing-window state instead of silently displaying another one.

Read legacy `window=24h` and Window Inspector's `profile=...` for compatibility; emit canonical `kind` and timestamp-valued `window` in updated links. Migrate the target readers in the same phase before enabling those links. Preserve contextual fields on loop-level destinations too, so subsequent drilling retains them. Validate that run, gate, and window agree before presenting evidence.

| Source / button | Variant | Target or in-page operation |
|---|---|---|
| Overview: **Loops requiring attention** / **View all** | normal | `/cpm/performance?loop=L&kind=K&window=W&gate=G&rows=attention`, plus existing plant scope; omit unknown selection fields. |
| Overview queue and event loop IDs | flat | `/cpm/explorer?loop=L&kind=K&window=W&gate=G&tab=Summary`. |
| Overview queue: **Preview** | flat | Existing Overview URL, replacing loop selection and clearing incompatible old run/window/gate identity. This preserves the current preview workflow without a clickable div around another button. |
| Overview: **Open analysis** | raised | Open the lazy analysis dialog for the selected URL loop; carry the loaded evaluated context into its actions. Use the supported icon slot instead of a literal trailing arrow. |
| Analysis dialog: **Open loop** | raised | Explorer Summary URL above, replacing the current Performance exit. |
| Overview: **All events** | normal | `/cpm/events?loop=L&kind=K&window=W&gate=G`, when selected. |
| Performance matrix/list loop ID | flat | Explorer Summary URL above, using the clicked row's loop and valid available context. |
| Performance gate cell | flat | Select that loop/gate in the current Performance URL; preserve kind and loaded window identity, other filters and page. Open the existing details panel. |
| Gate details: **Open in Evidence Workbench** | raised | `/cpm/evidence?loop=L&kind=K&window=W&gate=G&methodRun=M&mode=FIXED`. Disabled with a precise reason if no immutable run exists. |
| Gate details: **Open in Evidence Replay** | normal | `/cpm/replay?loop=L&kind=K&window=W&gate=G`; only when the existing replay data path supports this exact kind/window. |
| Gate details: **Open loop** | normal | Explorer Summary URL above. A calculations-specific exit must use `tab=Calculations`. |
| Explorer Summary gate button | flat | Same Explorer URL with `tab=Summary&gate=G&kind=K&window=W`; expand its lazy details beneath the strip. |
| Explorer Context / selected gate: **Evidence Workbench** | raised | Exact immutable Workbench URL when a run is known. Loop-only entry remains possible when no evaluated selection is requested; an explicit window must never be replaced by the default latest landing. |
| Explorer: **System Response** | normal | `/cpm/response?loop=L&kind=K&window=W&gate=G`; when a known G12 response event exists, also carry its `event=E` and `methodRun=M`. Do not add a lookup to manufacture an event link. |
| Explorer calculation result: **Inspect window** | normal | `/cpm/windows?loop=L&kind=K&window=W&gate=G`. |
| Calculation / evaluated result: **View trend** | normal | `/cpm/historical?loop=L&kind=K&window=W&gate=G&from=F&to=T`, using served window bounds. |
| Historical: **Evidence Replay** | normal | Exact Replay URL above. Existing **Open in Trend** retains its signal/path/range parameters and additionally carries loop and known CPA context. |
| Events row/details loop ID | flat | Explorer Summary URL, using the event's loop and known kind. No fabricated evaluated window. |
| Events: **All / Shelved / Expired shelves** | normal | Replace the Events filter in the URL, retaining loop and selected event when valid. Counts explicitly describe the loaded slice. |
| Events: **Shelve / Update shelf** | normal | Existing shelving action, entered through a lazy management panel; no route change. **Unshelve** remains disabled with an API explanation until separately authorized backend support exists. |
| Response event button | flat | `/cpm/response?loop=L&event=E&kind=K&window=W&gate=G&methodRun=M`, using selected-event identity where present and retaining only compatible origin context. |
| Response: **Open in Evidence Workbench** | raised | Exact Workbench URL with `gate=G12`, valid run and corresponding window. Visible disabled state when unavailable. |
| All eligible trend views: **Zoom area / Pan / Undo zoom / Reset zoom** | normal / flat | Chart viewport operations; no route change, recomputation, or historian fetch. Disabled explanation when there is no plottable data. |

All added/replaced navigation controls use `ObcButton` from the prescribed React module and `useNavigate` for route changes. Preserve keyboard grid navigation and accessible names when converting matrix cells. Use push for actual page/detail navigation, including event/window detail visits; use replace only for in-page filters, preview selections, and chart viewport changes. Preserve legitimate browser history rather than simulating Back with a bare destination route.

## 4. Phases and acceptance gates

### Phase 0 — Context foundation and measurable baseline

1. Capture initial request lists and cached first-content timings for each assigned page before editing. Define first content as useful cached loop/result content, not only the shell or a skeleton. Record loop, kind, window, viewport, cache state and polling during each sample.
2. Add the shared context parser/builders and canonical kind/window compatibility readers. Update immutable Workbench selection serialization without weakening run identity.
3. Preserve context on existing CPA sidebar destinations. This requires a narrow change in `src/frontend-ob/src/App.tsx`; it does not regroup or redesign the sidebar.
4. Fix target-side interpretation for touched handoffs in Explorer, Performance, Workbench, Window Inspector, Historical, Replay and Response. Use existing queries/cache, and show an explicit unavailable state when an exact window cannot be resolved from the supported data path. Do not fan out through older pages or fetch every gate to satisfy a link.
5. Focused tests: legacy duration versus ISO timestamp, URI encoding, incompatible identity on loop/kind change, correct Explorer tab names, unavailable exact window, and Back/Forward preserving selection.

Acceptance: no bare CPA destination from a selected loop; no timestamp passed as a fleet window kind; no added initial requests or cache-key duplication. Run lint and build.

### Phase 1 — Overview and Performance

- Remove `PipelinePanel` from Overview and its import. Leave the separate Pipeline Health page intact. This should remove Overview's pipeline-status and resolutions subscriptions where no remaining Overview component needs them; verify the actual request delta.
- Add the attention and loop navigation buttons listed above. Preserve queue preview with its own tertiary button. Confirm the attention destination uses the same eligibility meaning as the count and clearly labels any loaded/ranked subset.
- Make Open analysis fit its header using OpenBridge layout tokens. Lazy-load the dialog. Use the installed OpenBridge modal-window wrapper and its supported top-layer behavior, after checking its API; provide a bounded scrolling body, visible header/close/actions, focus containment, Escape, and focus return. Resolve stacking at the overlay boundary rather than lowering the application header.
- Convert matrix loop/gate and attention-list affordances to OpenBridge controls. Keep the matrix, its filters and the docked panel layout; clarify selected loop/gate/window and action priority, with contained overflow at narrow widths.
- Fix Workbench action state messaging: loading, failed/unavailable data, not evaluated, and legacy/missing run identity are different states. A valid loaded run enables the action. Missing identity must not open a different run. Keep legacy fallback actions only where exact Replay/Inspector support exists.

Acceptance: reproduce the supplied dialog scenario without overlap; loop IDs reach Explorer; a valid gate reaches the same Workbench run; missing runs remain understandable and disabled. Verify keyboard focus and all three themes. Zero new initial calls; no new fleet calls or per-cell queries. Run lint and build.

### Phase 2 — Explorer Summary, gate evidence and calculations

- Initialize the loop rail collapsed when a loop is in the URL; collapse after a successful loop selection. Keep an explicit expand button. Clearing selection reopens the rail. Collapse behavior must also work on Back/Forward arrival.
- Share already-loaded parent gate/readiness data with a Summary gate-strip component. Show the served gate order, status and evaluated kind/end. Keep unavailable/not-evaluated gates visible with their reasons; do not manufacture values or results for unsupported kinds.
- Below the strip, the selected gate shows its plant meaning, state/reason, computed metrics with units and applicable limits, data sufficiency, window bounds, and run provenance available in the response.
- Add lazy gate-specific evidence on explicit gate selection. Include the time-aligned PV/SP/OP/VP evidence and diagnostic plots actually supported by that gate: for example oscillation/ACF, spectral/PSD, valve phase behavior, or response evidence. Synchronize their selected time range. Show absent evidence explicitly. Reuse extracted presentation components; do not embed the full Workbench with all of its data hooks.
- Retain the existing live operating trend and clearly distinguish it from the evaluated-window trend. On initial arrival, metadata and the current trend render using existing data; new evidence requests occur only after an explicit user expansion/selection.
- Add a compact **Calculations** section with Short/Long choices drawn from the served resolution contract. Lazy-load it on expansion, and load only the selected kind. Reuse existing KPI/window-result data and hooks; show results, units, status/reason and window links. Do not compute substitute gate values in the frontend or request every duration.
- Put a visible raised Evidence Workbench button in Context and the selected-gate footer. Keep run reconstruction, full artifacts/manifests, replay/recompute, comparisons and governance/review in their existing destinations.
- Split Summary components into `explorer/` files before growth approaches the file limit.

Acceptance: rail behavior works for search, deep links and Back; the selected gate and its details agree on the window; short/long calculations route to their actual source window. Initial requests remain at or below baseline. A cold explicit expansion may request its selected evidence, never all gate artifacts. Run lint and build.

The proposed lazy expansion is necessary to satisfy the no-new-eager-fetch rule. Automatically loading every diagnostic plot and every short/long calculation on Summary entry would conflict with that rule and is not included.

### Phase 3 — Signal colors and rectangle zoom across trends

- Centralize signal color assignment using existing OpenBridge pen tokens. Set both line and item/marker colors so the curve, legend, hover value and label match. Preserve separate alarm/severity colors and signal units; verify Day, Bright and Night.
- Implement a small ECharts zoom controller with per-chart adapters. Activate rectangle selection through an OpenBridge Zoom area control, and provide Pan, Undo zoom, Reset zoom and Escape cancellation. Retain existing slider/wheel behavior and cursor interactions.
- For time-series charts, synchronize the selected X interval across associated lanes. Apply Y zoom within the dragged value panel's axes, respecting separate engineering units; categorical status lanes follow time only. For Cartesian diagnostic plots, use X/Y selection. Non-Cartesian dependency/network diagrams are not trends.
- Zoom only the already loaded data. Do not automatically apply the zoom as an analysis window, change query range keys, request finer data, or recompute. Keep Historical's explicit range-application action separate.
- Freeze the displayed live viewport while inspecting a zoom; make return to live explicit so polling does not reset the engineer's view. Reset restores the original displayed domain without a request.
- Cover the shared TrendCore consumers (Trend page, trend dialogs/designer charts), CPA Historical, Overview/Explorer trends, Investigation, Replay, Workbench and Response charts. Audit the separate IoTDB trend viewer and temporal Pipeline charts for the same controller where active. This necessarily touches shared chart files outside `components/cpm`.
- Split the existing over-500-line `Designer/TrendCore.tsx` before adding behavior. Keep lightweight helpers instead of adding a chart library or migrating all charts to a heavier page component.

Acceptance: rectangle selection, undo/reset, multi-axis behavior, gaps, cursor compatibility, empty data and live updates work without new requests. Use focused controller tests plus browser interactions; then lint and build.

### Phase 4 — Events shelving management

- Extract event details and shelving controls from the nearly full-size Events file.
- Add Shelved and Expired shelves views alongside acknowledgement filters, retaining event/loop/filter selection in the URL. Use the existing events response and clearly mark the loaded-record limit rather than claiming fleet totals.
- Distinguish active shelf, expired shelf, acknowledgement and event closure. Do not infer that expiry means acknowledged. Display expiry, note, actor information actually returned, and an unambiguous expired state.
- Add a lazy shelving management panel using the existing `until` and `note` contract: duration/date-time, reason in the existing note field, resulting review/expiry time, validation and pending/error states. Permit expiry updates through the existing shelving action where authorized. Enforce the existing permission model in the controls.
- Make loop IDs actionable and retain their loop when selecting event details. Use the existing loop-filtered events capability when loop scoped, replacing the current request rather than adding another list request.
- Keep true Unshelve visibly disabled with a precise explanation until the API gap below is separately authorized. Do not use Acknowledge as a surrogate for Unshelve.

Acceptance: expiry/filter behavior is correct, selection survives Back, and shelf management adds no read calls on initial load. Mutation verification must use an explicitly designated test event; existing production-like event state should not be changed just to test the layout. Run lint and build.

### Phase 5 — System Response layout repair

Proposed arrangement for approval: keep the event-list / central-analysis / context structure, make the event rail collapsible, and keep compact identity plus A–H status summaries in the right context column. Put bulky expanded outputs and the full quantity catalogue in the central analysis area, where they have enough width. Use a stacked layout when the available workspace width cannot support three columns.

- Event list: readable event time/type/state, clear selection and distinct censored status with adequate contrast. Preserve existing Show censored and pagination behavior; no extra list fetching on entry.
- Identity: separate window start/end into readable fields; wrap long method/path names and retain copyable IDs. Missing timestamps display an unknown state rather than an epoch fallback.
- A–H steps: retain state, plant meaning/reason and output counts in the context summary. Open selected outputs in a wide, lazy presentation panel; use already-held event data.
- Quantities: preserve all quantity/value/method columns, units and applicability. Provide a contained table in the central area, readable wrapping for machine identifiers, and horizontal scrolling only inside a table when necessary. Never clip values to make the page appear to fit.
- Candidate models: review all six columns (rank, family, path, parameters, objective, identifiability). Keep compact scalar summaries in rows and show long parameter/uncertainty details in a wide disclosure. Preserve precision and units; absent estimates remain `—`.
- Charts: allow the response plot, residuals and frequency plots sufficient width, with the common zoom interaction where applicable. Distinguish not available, not applicable, pending artifacts and genuine loading; a missing run must not create a permanent skeleton.
- Keep model review and operational actions in their existing workflow. Improve containment and readability; do not change modeling semantics or API polling contracts.
- Replace the hidden/text Workbench link with the visible OpenBridge action, preserving the selected response run and known CPA context.

Acceptance: no document-level horizontal overflow with A–H outputs and all quantities expanded; full values remain accessible at lab viewport sizes and higher browser zoom. Validate both censored and complete-model records, keyboard use and all themes. Presentation expansion adds no requests for data already held. Run lint and build.

### Phase 6 — Cross-page verification and documentation

- Verify journeys: Overview → Explorer → selected gate → Workbench → Back; Performance → gate → exact Workbench → Back; Explorer calculation → Inspector/Historical; Historical → Replay; Events → loop; Response event → G12 Workbench. Include 12h and 24h, one supported short window, missing/legacy run, cold expansion and cached return.
- For each changed page, compare initial request endpoint/parameter counts and first useful cached content against Phase 0. Required result: no added initial calls and first useful cached content under one second on the lab. Identify existing polling separately without excluding an actual navigation-triggered request. Do not prefetch fleet summary, rankings or heatmap.
- Prefetch is optional, not a default. If it provides measurable benefit, restrict it to hover/focus for gates/latest and readiness using the exact existing query keys/options in `hooks/useCpm.ts`; never prefetch an artifact bundle or all rows. Report it explicitly.
- Confirm all touched source files stay within the agreed size limit and all added styling uses existing OpenBridge tokens. Run lint and build after each phase, not only at the end.
- Update audit §6 with evidence and honest partial/completed status. Add a CHG entry to `changes_tracker.md` at implementation completion, listing actual changed components, validation and measured request/prefetch impact. Do not record planned work as completed.

## 5. API gaps and approval boundaries

1. **True unshelving:** the frontend uses `/api/v1/cpm/events/{id}/shelve` with a future `until`; the controller also has acknowledgement, which changes acknowledgement state and clears shelving. It has no unshelve operation. A separately approved action such as `POST /api/v1/cpm/events/{id}/unshelve` is needed, with defined restoration of acknowledgement state and audit semantics. That route is a proposal, not an existing endpoint. No backend change is in the frontend phases.
2. **Exact episode-to-evidence navigation:** the event frame exposes `loopId`, `windowKind`, event times and summaries, but not an authoritative evaluated-window end or gate run mapping. Episode opening time is not an evaluated-window ID. A2 requires a separately agreed episode-to-evaluated-window/run relationship, supplied in the event contract or by a dedicated endpoint. Do not add speculative per-row lookup calls.
3. **Immutable legacy evidence:** a cell without `methodRunId` cannot safely open an immutable Workbench run. Use supported exact-window Replay/Inspector alternatives; otherwise retain the disabled action. Fixing historical run identity would require explicit backend/data work.
4. **All plots on Summary entry:** this would add eager evidence fetches. This plan instead shows already-loaded gate metadata immediately and loads additional gate evidence/calculations only on explicit interaction, including on a cold deep link.
5. **Broader audit completion:** a new global destination toolbar, sidebar regrouping, full dead-end cleanup, new stale/freshness data, and an episode note thread are separate assignments. The current plan repairs existing navigation and the assigned pages; it does not silently implement every audit recommendation.

## 6. Audit acceptance coverage

| Criterion | Expected coverage from this assignment |
|---|---|
| A1 | Partial: context-safe existing sidebar/actions and assigned-page exits. Do not mark complete until every required one-click loop destination is available and tested from every CPA page. |
| A2 | Partial and data-blocked: loop navigation improves; exact episode window/run identity is missing from the current event contract. |
| A3 | Partial: assigned pages gain useful exits. Pipeline, Governance and the complete standalone Calculations/Replay dead-end audit need their own explicit scope. |
| A4 | Progress: new Explorer calculation source-window/trend actions and touched Inspector handoffs. Full numeric-value coverage on standalone Calculations/Windows must be verified before completion. |
| A5 | Existing freshness retained; not completed by layout/navigation repairs. No new freshness polling or pipeline calls are proposed. |
| A6 | Not included: current note/ack behavior is not a shared append-only episode thread. Requires a separate design and API decision. |
| A7 | Required pass for every changed journey; global completion only after all CPA routes are checked. |

The existing audit checklist remains unchanged during planning because no acceptance criterion has been newly implemented or verified as complete.
