# CPA function map

Completes SPEC-001 §8 for what the analysis could not reach: the 48 source overlays in `deep/surface-inventory.md` ("Source overlays not reached") and every surface in `deep/data/hidden-surfaces.md`. Homes come from SPEC §5, §6 and §8.

**Result: every overlay and hidden surface has a home. No C3 was raised.**

## 1. Source overlays not reached (48)

| # | Owner | Kind | Source | Why not reached | Home |
|---|---|---|---|---|---|
| 1 | Modal | dialog | `shared/Modal.tsx:102` | Shared component | Dialog (SPEC 6.11) |
| 2 | SessionTimeoutDialog | dialog | `shared/SessionTimeoutDialog.tsx:30` | Needs a session expiry | AppShell + Dialog |
| 3 | DialogProvider (confirm) | dialog | `shared/dialogService.tsx:84` | Needs a confirm request | Dialog |
| 4 | DialogProvider (prompt) | dialog | `shared/dialogService.tsx:87` | Needs a prompt request | Dialog |
| 5 | EffectiveConfigDrawer | drawer | `Cpm/config/EffectiveConfigDrawer.tsx:19` | Crawl limit | Evidence inspector; Setup › Loops inspector |
| 6 | ProfileAside | drawer | `Cpm/ProfileAside.tsx:115` | Crawl limit | Setup › Loops inspector |
| 7 | LoopRegistry (edit) | dialog | `Cpm/LoopRegistry.tsx:150` | Crawl limit | Setup › Loops, Add loop wizard |
| 8 | LoopRegistry (bulk import) | dialog | `Cpm/LoopRegistry.tsx:151` | Deny-listed trigger | Setup › Loops, Bulk import |
| 9 | LoopRegistry (add) | dialog | `Cpm/LoopRegistry.tsx:152` | Crawl limit | Setup › Loops, Add loop wizard |
| 10 | CpmOverview (loop drawer) | dialog | `Cpm/CpmOverview.tsx:200` | Empty queue in the lab | Overview inspector (drawer below 1280 px) |
| 11 | AttentionList sort menu | menu | `Cpm/AttentionList.tsx:73` | Crawl limit | Performance filters, sort control |
| 12 | KpiTrendChart | chart tooltip | `Cpm/kpi/KpiTrendChart.tsx:32` | Hover not sampled | Overview inspector KPI trend |
| 13 | buildCpmChartOption | chart tooltip | `Cpm/evidence/CpmChart.tsx:129` | Hover not sampled | Evidence › Gates |
| 14 | buildIntervalLaneOption | chart tooltip | `evidence/views/primitives/IntervalLane.tsx:34` | Hover not sampled | Evidence › Gates |
| 15 | buildTrajectoryOption | chart tooltip | `evidence/views/primitives/Trajectory.tsx:41` | Hover not sampled | Evidence › Gates |
| 16 | buildRelationshipGraph | chart tooltip | `evidence/views/G13Interaction.tsx:47` | Hover not sampled | Evidence › Gates (G13 panes) |
| 17 | CpmCalculations loop picker | popover | `Cpm/CpmCalculations.tsx:233` | Crawl limit | AssetPicker (SPEC 6.14) |
| 18 | CpmCalculations drawer | dialog | `Cpm/CpmCalculations.tsx:357` | Crawl limit | Evidence › Calculations inspector |
| 19 | RangeToolbar loop picker | popover | `Cpm/historical/RangeToolbar.tsx:115` | Crawl limit | AssetPicker |
| 20 | HealthLane | chart tooltip | `Cpm/health/HealthLane.tsx:48` | Hover not sampled | Loop TrendPanel, health lane |
| 21 | CpmWindows loop picker | popover | `Cpm/CpmWindows.tsx:105` | Crawl limit | AssetPicker |
| 22 | buildReplayOption (time) | chart tooltip | `Cpm/replay/ReplayChart.tsx:42` | Hover not sampled | Evidence › Replay |
| 23 | buildReplayOption (phase) | chart tooltip | `Cpm/replay/ReplayChart.tsx:58` | Hover not sampled | Evidence › Replay |
| 24 | CpmReplay loop picker | popover | `Cpm/CpmReplay.tsx:188` | Crawl limit | AssetPicker |
| 25 | EvidenceToolbar loop picker | popover | `Cpm/evidence/EvidenceToolbar.tsx:53` | Crawl limit | AssetPicker |
| 26 | ExplainPanel | drawer | `Cpm/evidence/ExplainPanel.tsx:125` | Below 1200 px only | Evidence inspector |
| 27 | ModelReviewDialog (shell) | dialog | `Cpm/response/ModelReviewDialog.tsx:34` | No candidate in the lab | Loop › Model, Review model |
| 28 | ModelReviewDialog (form) | dialog | `Cpm/response/ModelReviewDialog.tsx:35` | No candidate in the lab | Loop › Model, Review model |
| 29 | ResponseWorkspace loop picker | popover | `Cpm/response/ResponseWorkspace.tsx:91` | Crawl limit | AssetPicker |
| 30 | ResponseWorkspace review host | dialog | `Cpm/response/ResponseWorkspace.tsx:192` | No candidate in the lab | Loop › Model |
| 31 | GateConfigurationWorkspace loop picker | popover | `Cpm/config/GateConfigurationWorkspace.tsx:95` | Crawl limit | AssetPicker |
| 32 | CaseTriage loop picker | popover | `Cpm/investigation/CaseTriage.tsx:66` | Crawl limit | AssetPicker |
| 33 | CpmPipeline | chart tooltip | `Cpm/CpmPipeline.tsx:102` | Hover not sampled | System › Pipeline |
| 34 | BulkImportModal | dialog | `Administration/BulkImportModal.tsx:128` | Deny-listed trigger | `/admin/users` |
| 35 | RolesConfig (delete) | dialog | `Administration/RolesConfig.tsx:134` | Deny-listed trigger | `/admin/roles` |
| 36 | ImportDialog | dialog | `Administration/PlantModelImport.tsx:246` | Deny-listed trigger | `/admin/plant-model` |
| 37 | PlantModelConfig (delete) | dialog | `Administration/PlantModelConfig.tsx:346` | Deny-listed trigger | `/admin/plant-model` |
| 38 | PlantModelConfig (import host) | dialog | `Administration/PlantModelConfig.tsx:438` | Crawl limit | `/admin/plant-model` |
| 39 | PlantModelConfig (editor host) | dialog | `Administration/PlantModelConfig.tsx:440` | Crawl limit | `/admin/plant-model` |
| 40 | AddAliasDialog | dialog | `Administration/AliasConfig.tsx:59` | Crawl limit | `/admin/aliases` |
| 41 | ImportAliasDialog | dialog | `Administration/AliasConfig.tsx:137` | Deny-listed trigger | `/admin/aliases` |
| 42 | AliasConfig (delete) | dialog | `Administration/AliasConfig.tsx:208` | Deny-listed trigger | `/admin/aliases` |
| 43 | AliasConfig (add host) | dialog | `Administration/AliasConfig.tsx:289` | Crawl limit | `/admin/aliases` |
| 44 | AliasConfig (import host) | dialog | `Administration/AliasConfig.tsx:290` | Crawl limit | `/admin/aliases` |
| 45 | buildTrendOption | chart tooltip | `Designer/trend/trendOption.ts:90` | Hover not sampled | `/trend` tool |
| 46 | App session dialog host | dialog | `App.tsx:318` | Shell | AppShell |
| 47 | App dialog provider host | dialog | `App.tsx:319` | Shell | AppShell |
| 48 | CommandPalette host | dialog | `App.tsx:545` | Shell | AppShell header search |

## 2. Hidden surfaces

| Surface | Today | Home |
|---|---|---|
| `/cpm/kpi` (no menu entry) | Reached from an Overview tile | `/cpm?review=K` (SPEC 2.3) |
| `/trend?start`, `end`, `tz` (read, never written) | `store/timeStore.ts:112-115` | Tag trend tool; kept as URL inputs |
| `/cpm/config?tab=properties` (value never written) | Default of the tab | Setup › Configuration default |
| `/cpm/events?sort=triage` (value never written) | Default of the sort | Episodes default order |
| `/cpm/performance?view=checks` (value never written) | Default of the view | Performance default view |
| Command palette, Ctrl+K only | `CommandPalette.tsx:47` | Header search, with the hint visible |
| `location.state.from` | `Login.tsx:57` | Login, unchanged |
| `location.hash` | `App.tsx:778` | Unchanged |
| Silent redirect on a refused route (23 routes) | `App.tsx:808`, `Administration.tsx` | DataState "Not available for your role" (RD13). Guard logic unchanged |
| Guard mismatches: `ingestion.*`, `asset.view`, `/admin/audit`, `/admin/system` | `hidden-surfaces.md` "Guard mismatches" | Unchanged. Reported for the owner (RD13) |
| Legacy routes under `CPA_SLICE_ONLY` (18) | Redirect | Unchanged. Out of scope |
| Menu entries filtered by the slice (10) | Hidden | Unchanged. Out of scope |
| Dead components in the live graph (8) | Not rendered | Removed in Phase 8 once the import graph confirms |
| `useDeleteLoop` | Not wired | Not exposed (SPEC 8.1) |
