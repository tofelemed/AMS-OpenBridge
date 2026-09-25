# CPA UI and navigation fix plan (Overview · Performance · Explorer · Historical · Events · Trends · System Response)

Date: 2026-09-20. Status: **approved and implemented (Phases 1–7 code complete; CHG-030)**.
Verification: lint / tsc / 272 unit tests / build green. Browser passes on the lab: Phases 1–4 done,
Phases 5–7 pending (the lab Docker engine failed with C: full before they could run; the box-zoom
mechanism was proven with a real drag on a standalone chart). The Phase 8 journey pass is due once the lab is back.
Inputs: `docs/cpa-application-flow-audit.md` (F1–F12, R1–R10, A1–A7), `openbridge-agent-rules.md`, the `openbridge` skill,
the user's first assignment, and a live inspection of the Vite dev build (`http://localhost:5174`, lab data, 1440×900 and 1036×647).

Working-tree note: the tree currently **reverts** the CPA part of commit `7f9ae1d5` (deletes `components/Cpm/navigation.ts`,
`CpaAuditProbe.tsx`, `docs/cpa-navigation-fix-plan.md`, restores the native sidebar buttons). This plan treats the reverted
tree as the baseline and does not touch the sidebar (per the assignment).

---

## 1. Root causes found (with evidence)

| # | Page | Symptom (seen) | Root cause | Where |
|---|---|---|---|---|
| O1 | Overview | "Open analysis" dialog renders under the top bar (screenshot supplied; reproduced) | `.cpm-modal-backdrop` z-index 60 and `.cpm-inspector--modal` z-index 61; `.app-topbar` is a **grid item with z-index 100**, and grid items honour z-index without positioning, so it paints above the fixed modal. App dialogs use 1000 (`.dialog-overlay`), command palette 1200 | `styles/cpm.css:212-216, 510-516`; `styles/app.css:50-52, 818-820` |
| O2 | Overview | The dialog's only action "Continue in Performance →" sits at the bottom of the scroll body (y≈1045 in a 647 px viewport) and lands on the fleet matrix, not the loop | Action inside `.cpm-inspector__body`; `onExplore` navigates to `/cpm/performance?loop=` | `overview/FocusedLoopDrawer.tsx:133-135`; `CpmOverview.tsx:204` |
| O3 | Overview | "Live Flink runtime" panel occupies the fold; costs 2 requests + a 15 s poll | `<PipelinePanel />` (`/pipeline-status` polled, `/resolutions`) | `CpmOverview.tsx:18, 98`; `overview/PipelinePanel.tsx` |
| O4 | Overview | Queue rows / event-trail loop ids are not routes (row = clickable div that only previews) | `div role=button` writes `?loop=` (replace); loop id is text | `CpmOverview.tsx:112-134, 188-192` |
| P1 | Performance | Loop cell only selects the row | `onSelectLoop` → `?loop=` (replace); no route | `GateMatrix.tsx:228-240`; `CpmPerformance.tsx:94-96` |
| P2 | Performance | "Open in workbench" disabled | Disabled when `cell.methodRunId` is null: (a) **while `gates/latest` loads**, (b) rows written before v2.5 (no run identity; lab: `B2_027PIC`, verdict 41 d old; **prod v2: every row**), (c) gate absent from the served row. The title says "predates run identity" in all three cases (observed on B2_027PIC while LOADING). On lab FIC10301 every gate carries a run id and the button is enabled | `GateEvidencePanel.tsx:57-73, 155-161` |
| P3 | Performance | "Open full loop ›" opens Explorer on Summary, not Calculations | sends `tab=calculations`; Explorer validates against `['Summary',…,'Calculations']` and falls back silently | `GateEvidencePanel.tsx:169-172`; `CpmExplorer.tsx:36-38` |
| P4 | Performance | Text links / passive text where routes belong | `Window Inspector ›` is a `<Link>`; the freshness line ("Stale · 38.9 h") is a `<p>` with no route to Pipeline Health | `CpmPerformance.tsx:208-211, 285-289` |
| E1 | Explorer | Loop rail stays open after selection and on deep links (280 px lost) | `useState(true)`; `selectLoop` never collapses | `CpmExplorer.tsx:39, 59-63` |
| E2 | Explorer | Summary has no gate strip, no gate detail/trends, no calculations | Summary = operating state + 8 h trend + loop model; gates only on the Calculations tab | `explorer/SummaryTab.tsx`; `explorer/CalculationsTab.tsx` |
| E3 | Explorer | "Evidence workbench ›" / "System response ›" are underlined text links | `<Link className="cpm-link">` | `explorer/LoopModelCard.tsx:50-52` |
| H1 | Historical (and every PV/SP/OP chart) | Tooltip markers / legend swatches are yellow-red-blue while lines are green-grey-amber (reproduced: markers `#fac858 #ee6666 #73c0de`) | Series set `lineStyle.color` only; ECharts legend and tooltip markers read the series `color`/`itemStyle.color`, which defaults to the palette | `historical/chartOption.ts:241-254`; `overview/LoopFocus.tsx:85-90`; `explorer/SummaryTab.tsx:110-115`; `replay/ReplayChart.tsx:63-71`; `CpmInvestigation.tsx` (~150) |
| V1 | Events | No shelve management: no "Shelved" view, an **expired** shelf still reads "Shelved" (EVT-833: shelved until 9/17 12:22, viewed 9/20), 4 fixed durations, no update/unshelve, loop id is text, page ignores `?loop=` | `stateOf` uses `ack_state` only; filters have no shelved key; `SHELVE_CHOICES` fixed; API has only `acknowledge` (clears `shelve_until`) and `shelve` | `CpmEvents.tsx:46-57, 238, 270-275, 300, 345-372`; `events/eventsState.ts:59-82`; `cplm-api/Controllers/CpmEventsController.cs:100-146` |
| T1 | All trends | No drag-rectangle zoom; only slider/wheel (Historical, TrendCore) or nothing (LoopFocus, Summary, Replay, Investigation, CpmChart) | No ECharts `toolbox.dataZoom` / `dataZoomSelect` cursor anywhere; live charts re-apply the option with `notMerge` on every tick, which would discard a zoom | `historical/chartOption.ts:170-177`; `Designer/TrendCore.tsx:421-428` (583 lines, over the file limit); other charts have no `dataZoom` |
| R1 | System Response | Expanded outputs / "All 52 quantities" escape the right column (measured: aside 284 px, table 515 px, right edge 248 px past the column); event-list timestamps wrap to 3 lines; "Hide 48 censored candidates" wraps; Workbench is a text link; censored events leave "Decoding …" skeletons | 3-column grid `minmax(220px,.9fr) minmax(0,2.6fr) minmax(280px,1.2fr)`; `.cpm-table` has no scroll wrapper; `.cpm-kv__value` wrapping rules exist only under `.cpm-inspector`; `<Link className="cpm-link">` | `styles/cpm-evidence.css:8-16, 216-228, 245-265`; `response/EventAside.tsx:37-45, 55-60, 76-90`; `response/EventList.tsx:49-57`; `response/ResponseWorkspace.tsx:130-136` |

Initial-load baselines recorded (lab, cached loops): Overview 8 API calls (`sites, pipeline-status ×poll, resolutions, fleet/summary, fleet/rankings, events limit 3, hist/trend, hist/snapshot ×2`); Performance 5 (`sites, resolutions, fleet/summary, fleet/rankings, fleet/heatmap`); a gate click adds `gates/latest, calculations, gate-catalogue`; Explorer 9 (`loops, hist/trend, hist/last, gates/latest, readiness, events(loop,50), instrument-health, hist/snapshot ×2`).

---

## 2. Context contract (all phases)

- Every in-page navigation carries `loop=`; window-scoped targets add `kind=` (duration, e.g. `24h`) and `window=` (evaluated window **end**, ISO) and `gate=`; Workbench links use the exact `methodRun=` + `mode=FIXED` (`evidence/selection.ts`).
- Legacy readers stay compatible: Performance reads `window=` as a kind, Historical/Replay read it as an end timestamp. New links never send a timestamp where a kind is read. `profile=` for Window Inspector stays.
- `push` for real navigation and detail visits; `replace: true` only for in-page filters and selections (existing pattern).
- One tiny pure helper `components/Cpm/cpaHref.ts` (`explorerHref(loop, tab?, gate?)`, `performanceHref(loop, gate?, kind?)`, `eventsHref({loop?, event?, filter?})`, `replayHref`, `windowsHref`) + a unit test. No store, no localStorage.
- Buttons: `ObcButton` raised = primary, normal = secondary, flat = tertiary; `useNavigate` in `onClick`; disabled with a `title` reason, never hidden; unknown values render `—`.

---

## 3. Phases (one page per phase; lint + build + UI check after each)

### Phase 1 · Overview (files: `CpmOverview.tsx`, `overview/FocusedLoopDrawer.tsx`, `overview/LoopFocus.tsx`, `styles/cpm.css`; delete `overview/PipelinePanel.tsx`)

| Change | Detail |
|---|---|
| Remove Live Flink runtime | Drop `<PipelinePanel />` + import; delete the file (only consumer). **−2 initial requests and −1 poll**; Pipeline Health page unchanged |
| Dialog layering | `.cpm-modal-backdrop` → z-index 1000, `.cpm-inspector--modal` → 1001 (app dialog layer; palette stays 1200). Actions move to a sticky `.cpm-inspector__foot` under the scroll body |
| Dialog actions | raised **Open loop ›** → `/cpm/explorer?loop=L&tab=Summary`; normal **Fleet matrix ›** → `/cpm/performance?loop=L`; gate rows become flat buttons → `/cpm/performance?loop=L&gate=Gx` (cache hit: same `gates/latest` key) |
| Priority queue rows | Row click keeps the in-page preview (replace). Loop id becomes flat **FIC10301 ›** → Explorer Summary (push). "View all ›" → `/cpm/performance?loop=L` when a loop is selected, else bare |
| "Need attention" tile | Gets a flat **Show in Performance ›** → `/cpm/performance?rows=attention` (KpiTile stays; action rendered beside it) |
| Event trail | `loop_id` text → flat button → Explorer; the row itself → `/cpm/events?event=ID&loop=L`; "All events ›" → `/cpm/events?loop=L` (Events honours `loop` in Phase 6; harmless until then) |
| Open analysis button | `PanelHead` action keeps `ObcButton raised`; label "Open analysis ›" (no literal arrow glyph) |

Validation: dialog above the top bar at 1036×647 and 1440×900 in Day/Bright/Night; Escape/focus restore; Network tab shows 6 initial calls; Back from Explorer returns to Overview with `?loop=` intact.

### Phase 2 · Performance (files: `GateMatrix.tsx`, `GateEvidencePanel.tsx`, `CpmPerformance.tsx`, `AttentionList.tsx`)

| Change | Detail |
|---|---|
| Loop cell routes | Loop cell → `ObcButton flat` inside the row header; click = **navigate** `/cpm/explorer?loop=L&tab=Summary` (push). Row selection stays on gate cells and on the attention list. Roving `data-r/data-c` focus verified on the custom element; if `obc-button` cannot take programmatic focus, report back before falling back |
| Workbench button states | `LOADING` → disabled "Loading the latest result…"; `UNAVAILABLE`/`NO WINDOW YET` → disabled with that reason; **legacy row** (no `methodRunId`) → disabled "This row predates run identity (v2.5); open Evidence Replay or the Window Inspector instead", and **Open in Evidence Replay** becomes the raised primary; run id present → enabled "Open method run …" |
| Links carry context | Replay: `/cpm/replay?loop=L&gate=G&window=<end>&kind=K`; Explorer: `tab=Calculations` (fix the case bug); new normal **Window Inspector ›** → `/cpm/windows?loop=L&profile=K` (replaces the `<Link>`) |
| Freshness | "Stale ·" line gains flat **Pipeline Health ›** → `/cpm/pipeline` (A5 partial) |
| Attention list | Loop button keeps select+jump; add flat **Open loop ›** per row → Explorer |

UX suggestions for this page (not implemented unless you pick them): (a) at 1440 px the docked panel leaves the matrix a 671 px viewport for 1040 px of columns; narrow the loop column and cells so G0–G15 fit, or let the panel overlay below 1500 px; (b) the selected-row strip gains **Open loop ›**; (c) the gate legend chips become clickable filters (same as the roll-up); (d) the health-filter chips show their counts.

Validation: click B2_027PIC G0 (legacy) → disabled with reason + Replay primary; FIC10301 G9 → enabled, opens run `7f9d4475…`; keyboard arrows still move the grid cursor; no new initial calls (5).

### Phase 3 · Loop Explorer (files: `CpmExplorer.tsx`, `explorer/SummaryTab.tsx` → split into `explorer/summary/*`: `OperatingState.tsx`, `SummaryGateStrip.tsx`, `SummaryGateDetail.tsx` (lazy), `SummaryCalculations.tsx` (lazy); `explorer/LoopModelCard.tsx`)

| Change | Detail |
|---|---|
| Rail auto-collapse | Initial state `!params.get('loop')`; collapse after a successful selection; expand when the loop is cleared; an effect on `requestedId` handles Back/Forward and deep links; the chevron toggle stays |
| Gate strip on Summary | Reuse `evidence/GateChipStrip` (`chipsOf`) fed by the `useLatestGates(loop,'24h')` query `LoopWorkspace` already runs (**zero new requests**). Selected gate → `?gate=Gx` (replace) |
| Gate detail under the strip (lazy) | Must-have: status + reason, one-line verdict sentence (`verdictCopy`), window from/to, samples, role/purpose, plant meaning (`gateFacts`), and the gate's **primary evidence plot** rendered with `EvidenceArtifactRenderer` for that gate only (manifest + artifact fetched **only on click**, via `useEvidenceManifest(methodRunId)`); raised **Open in Evidence Workbench ›** with the exact run; normal **Evidence Replay ›**. Not here (stay in the Workbench): explain column, signal-context lanes, reconstruct/compare, flags, window picker. Legacy rows: detail + disabled Workbench (reason) + Replay |
| Calculations on Summary (lazy) | Section "Calculations" with an `ObcToggleButtonGroup` **Long / Short** drawn from `/resolutions` (`fusion.firesOn` = long; `tier==='short'`). Long = fused gate outcomes from the cached `gates/latest`; Short = `useCpmKpis(loop, kind, 1)` fetched **only when the section is expanded/toggled**; buttons normal **Window history ›** → `/cpm/windows?loop=L&profile=K`, flat **Full catalogue ›** → `/cpm/calculations?loop=L`. The Calculations tab keeps the full view |
| Context card | `<Link>`s → raised **Evidence workbench ›** (`/cpm/evidence?loop=L&kind=24h` + `methodRun/gate=G15/mode=FIXED` when the cached latest row carries run ids) and normal **System response ›** (`/cpm/response?loop=L`) |
| Live vs evaluated | The operating-state trend keeps its "Trend range …" caption; the gate detail is captioned with its evaluated window so the two are never confused |

Validation: `/cpm/explorer?loop=FIC10301` lands collapsed; search → select → collapses; Back restores; the strip shows 17 gates from cache; the first gate click adds only that run's manifest/artifact calls; the Short toggle adds exactly one `kpis` call; initial calls stay at 9.

### Phase 4 · Historical + signal colours on every PV/SP/OP chart (files: `historical/chartOption.ts`, `overview/LoopFocus.tsx`, `explorer/SummaryTab.tsx` (or its split), `replay/ReplayChart.tsx`, `CpmInvestigation.tsx`)

| Change | Detail |
|---|---|
| One pen per signal | Add `color: <pen>` (and `itemStyle.color`) to every PV/SP/OP/VP series so line, legend swatch, tooltip marker and the toolbar chips agree (PV pen-2 green, SP neutral dashed, OP pen-3 amber, VP pen-4 pink). Small shared helper `signalPen(name)` in `shared.tsx` |
| Historical exits | The selected-window panel gains normal **Evidence Workbench ›** (exact run when the window carries `methodRunIds`, else disabled with reason) beside "Replay this period ›"; "Open in Trend ›" keeps its params and adds `loop=` |

Validation: hover markers match line colours in Day/Bright/Night on Historical, Overview focus, Explorer Summary, Replay; no request changes.

### Phase 5 · Rectangle (box) zoom on all trends (files: new `components/charts/boxZoom.ts` + `ChartZoomBar.tsx`; `Designer/TrendCore.tsx` split into `TrendCore.tsx` + `trend/useTrendData.ts` + `trend/trendOption.ts` + `trend/TrendTimeBar.tsx` before adding behaviour; then each chart)

| Change | Detail |
|---|---|
| Mechanism | ECharts' built-in box zoom: option fragment `toolbox: { show: false, feature: { dataZoom: { xAxisIndex, yAxisIndex } } }` + `dataZoom` inside components; activated by `chart.dispatchAction({ type: 'takeGlobalCursor', key: 'dataZoomSelect', dataZoomSelectActive: true })`. Toolbox icons stay hidden so the controls are OpenBridge buttons, not ECharts SVGs |
| Controls | `ChartZoomBar`: flat **Zoom area** (toggle, `aria-pressed`), flat **Undo**, flat **Reset**; Escape cancels the box mode; disabled with reason when there is nothing plotted. Zoom history kept per chart (stack of `{start,end}`); no route change, no refetch, no recompute |
| Per chart | Time-series (Historical multi-lane: x across all lanes, y only on the signals grid; LoopFocus/Summary category axis: x only; Investigation; Replay time view; `CpmChart` in Workbench/Response/Model history; Pipeline telemetry) and Cartesian diagnostics (Replay phase plane, `Trajectory`, CpmChart `xKind='value'`): x+y. Lanes (`IntervalLane`, `HealthLane`) follow x only. Not a trend: G13 network graph, Analytics bar charts (excluded) |
| Live charts | While zoomed, the rolling refetch keeps the option's `dataZoom start/end` (as TrendCore already does with `zoomPct`) and shows "live · zoomed, Reset to follow"; Reset restores the full domain without a request. Historical keeps its explicit **Apply zoom to range ›** (box zoom fires the same `dataZoom` event) |

Validation: drag a rectangle on each listed chart → zoomed; Undo/Reset; wheel/slider still work; the live tick does not reset the zoom; zero requests during zoom; each `TrendCore` file ≤ 400 lines.

### Phase 6 · Loop Events shelve management (files: `CpmEvents.tsx` split → `events/EventDetail.tsx`, `events/ShelvePanel.tsx` (lazy), `events/shelfState.ts` + test; `events/eventsState.ts`)

| Change | Detail |
|---|---|
| Shelf state | `shelfState(e, now)`: `ACTIVE` (`SHELVED` and `shelve_until > now`), `EXPIRED` (`SHELVED` and past) → row/aside pill "Shelf expired · unreviewed" (warn), never "Shelved"; countdown "expires in 3 h" on active shelves |
| Filters | Add **Shelved** (active shelves) and **Shelf expired**; expired shelves also count under Unacknowledged; counts describe the loaded slice (existing note) |
| Loop context | Page reads `?loop=` → passes `loopId` to the existing `useCpmEvents` (replaces the fleet request, adds none) with a clearable **Loop: FIC10301 ×** input chip (`ObcInputChip`); row and aside loop id → flat button → Explorer Summary |
| Shelve panel (lazy) | Presets 1 h / 8 h / 24 h / 7 d + custom **until** (`datetime-local`, must be future) + reason note; shows the resulting expiry; **Shelve** / **Update shelf** (re-POST `shelve` with the new `until`); pending/error states; `cpm.manage` gating as today |
| Unshelve | Visible, disabled: "Needs `POST /api/v1/cpm/events/{id}/unshelve` (not in the API); acknowledging clears the shelf" (see §5) |

Validation: EVT-833 reads "Shelf expired"; the Shelved filter lists EVT-819 only if still active; `?loop=FIC10301` narrows the request; selection survives Back; no added initial calls. Mutation tests only on an event you designate.

### Phase 7 · System Response layout repair (files: `styles/cpm-evidence.css`, `response/EventList.tsx`, `response/EventAside.tsx` → split `response/SubgateSteps.tsx`, `response/QuantityCatalogue.tsx` (lazy, centre column), `response/ResponseWorkspace.tsx`, `response/ModelHistory.tsx`)

Proposed arrangement (for your approval before building):

| Area | Proposal |
|---|---|
| Columns | events `minmax(260px, 1fr)` · centre `minmax(0, 3fr)` · context `minmax(320px, 1.4fr)`; below 1400 px the context column stacks under the centre; below 1200 px one column (already) |
| Event list | one-line mono timestamp (`white-space: nowrap`) + state pill; type · path; finding; censored toggle as a full-width flat `ObcButton`; rows keep selection tokens |
| Identity | Window as two rows (from / to) + duration; ids row wraps with `overflow-wrap: anywhere`; raised **Open in Evidence Workbench ›** (disabled with reason when no run) replaces the text link; "unknown" instead of an epoch when a timestamp is missing |
| Steps A–H | name · state · reason in the column; the **N outputs** disclosure stays inline but contained (`min-width:0; overflow-wrap:anywhere`, mono values wrap) |
| Quantities | key results stay in the column; **All 52 quantities** opens a wide lazily-loaded card in the centre column (data already held, no fetch) with a contained, horizontally scrollable table; muted not-applicable rows kept |
| Candidate models / model history | 6- and 8-column tables get a scroll wrapper; long parameter strings wrap per token; model history moves to the bottom of the centre column (wide) |
| Censored / no-model events | when the manifest is COMPLETE and a kind is absent, panels say "Not available for this event (censored)" instead of a permanent "Decoding …" skeleton |
| Charts | keep; zoom bar from Phase 5 |

Validation: with FIC10301 → Show censored → event `ca1d45b1…` → all outputs + all quantities expanded: no element's right edge exceeds its column; the document has no horizontal scroll at 1440 and 1200; Day/Bright/Night; keyboard; a complete-model event still renders (lab fixture or a suitable loop, to be found).

### Phase 8 · Cross-page verification and records

Journeys: Overview → Explorer → gate → Workbench → Back; Performance → gate → Workbench → Back; Explorer Short calc → Window Inspector; Historical → Replay/Workbench; Events → loop; Response → G12 Workbench. Compare initial request lists per page with the §1 baselines (no additions; no fleet prefetch). Update audit §6 honestly; add `CHG-030` to `changes_tracker.md` (changed components, validation, request deltas) and list the frontend image under the Release v3 build list (only `ams-frontend` changes; no service or migration changes in this work).

---

## 4. Performance rules applied

No new eager fetches on any page. Phase 1 removes two. Gate detail, short calculations, the quantity catalogue and the shelve panel are `React.lazy` and fetch (if at all) only on explicit interaction. Optional hover/focus prefetch of `gates/latest` / `readiness` via the existing query keys is offered only if a measured benefit shows up in Phase 8; fleet summary/rankings/heatmap are never prefetched (CHG-023).

## 5. API gaps (the frontend cannot close these)

1. **Unshelve** — **closed by CHG-032 (2026-09-20)**: `POST /api/v1/cpm/events/{id}/unshelve`, `GET /events/{id}/actions`, the shelf as its own lifecycle (`shelf_state`) and the expiry sweeper; see [cpa-event-shelving.md](cpa-event-shelving.md). The Unshelve button is live.
2. **Episode → evaluated window / run** (A2): event frames carry `loop_id`, `window_kind`, times, but no evaluated-window end or run map; one-click "open this episode's evidence" needs it in the event contract.
3. **Legacy run identity** (P2): rows without `method_run_id` (all prod v2 rows) cannot open the immutable Workbench; Replay/Inspector are the supported fallbacks.

## 6. Audit §6 expectations after this plan

A1 partial (sidebar excluded by assignment), A2 partial (data-blocked), A3 progress (Events, Calculations-on-Summary; Replay/Pipeline/Governance untouched), A4 progress (Summary calculations → Inspector/trend), A5 partial (stale → Pipeline Health), A6 not included, A7 required pass on every changed journey.
