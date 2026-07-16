# HMI Designer — Gap Remediation Plan (phase-by-phase)

**Purpose.** Close the "Known gaps / not yet built" list from `docs/DESIGNER-FEATURE-GUIDE.md`, plus the concrete UX complaints raised in review (favorites, Assets/Data-tab search). Every item below was re-verified against the running code and the live stack (26 containers up) before planning — several "stubs" in the guide are now **already real** and are struck from the work.

**Ground rules (unchanged from the audit):** config-only persistence, CQRS discipline, bind-through-UNS, OpenBridge-only UI, colour reserved for the abnormal, server-side ownership/authz, SVG sanitization. Implementation is the source of truth.

---

## What changed since the feature guide was written (verified 2026-07-16)

The guide's stub list was partly stale. Code-verified current state:

| Guide said "stub" | Actual state now | Evidence |
|---|---|---|
| `chart.bar` | **REAL** — live via `useBatchBindingResolver` | `BarChart.tsx:54-81` |
| `chart.xy` | **REAL** — live sample ring-buffers | `XYPlot.tsx:41-68` |
| `table.value` | **REAL** — live + historian summaries | `TableSymbol.tsx:50-77` |
| `table.timeseries` | **REAL** — historian trend | `TimeSeriesTable.tsx:51-63` |
| `collection` | **REAL** — asset-search + `{{element}}` | `CollectionRenderer.tsx:36-82` |
| `asset-comparison-table` | **REAL** — live cells | `AssetComparisonTable.tsx:37-42` |

**Still genuinely stubbed** (render but ignore bindings): `chart.pie`, `chart.sparkline`, `graph.graph-mini`, `equip.hx`, `obc.alert-button`, `obc.breadcrumb` (static by design), and `graph.gauge-trend` (needle live, trend line mock). These are the real Phase 3 targets.

**All backend endpoints for the "backend-only" features already exist** in `display-service/Program.cs` — version history, folders, ACL, personal views, comments. They have **zero frontend callers**. Phase 4 is therefore pure frontend wiring, not backend work.

---

## Phase 1 — Reviewer's concrete complaints (frontend + 1 DDL) · **IN PROGRESS**

Highest irritation, fastest payoff. All grounded in code.

| # | Item | Fix | Files |
|---|---|---|---|
| 1.1 | **Data-tab tag search is clumsy** — must click 📂 folder first, then search; no browse | Rewrote `TagPicker`: main input is now a live **typeahead** (≥2 chars → dropdown of matches, wildcard-aware); 📂 now opens a full **browse tree** (AssetBrowser picker); added inline clear | `AssetBrowser.tsx`, `Designer.css` |
| 1.2 | **Assets tab (left pane) has search but browse is weak** | Search results are now **draggable** onto the canvas (parity with tree nodes) | `AssetBrowser.tsx` |
| 1.3 | **"Add to favorite" isn't working** | Root cause: the star *does* persist (3 rows in DB) but nothing **surfaces** favorites. Added a **★ Favorites filter** + count + empty-state; self-healing `ALTER`s for older governance tables | `DisplayList.tsx`, `display-service/Program.cs` |
| 1.4 | **ISA-101 level not filterable in Designer list** | Added a **Level** filter (L1–L4) to the display list | `DisplayList.tsx` |

**Verify:** typecheck + build clean; in the app: type "pump" in a Data-tab slot → suggestions; 📂 → tree; star a display → ★ Favorites shows it; Level=L4 filters.

---

## Phase 2 — Frontend partials → complete (frontend-only)

No backend or architectural blockers; finishes half-wired features.

| # | Item | Approach |
|---|---|---|
| 2.1 | **Background image** for a display (today: colour/token only) | Add `backgroundImage` (data-URI, sanitized, size-capped) to display config + a Style-tab control + canvas/viewer render. Config-only (no process values). |
| 2.2 | **Quality badge off by default** | Keep per-symbol opt-in but default **on for bound value/gauge symbols**; ensure Bad/Uncertain always shows regardless of the toggle (safety). |
| 2.3 | **UOM not applied in tables** | Extend the dimension-aware `convert()` path (already in `utils/uom.ts`) into `TableSymbol`/`TimeSeriesTable`/`AssetComparisonTable` cell rendering. |
| 2.4 | **Timezone doesn't reformat trend axis / value-symbol timestamps** | Thread `timeStore.tz` + `formatInZone` into the trend axis label formatter and the value-symbol timestamp renderer (time bar already does this). |
| 2.5 | *(deferred)* **Designer-canvas touch** | Extend `useTouchZoomPan` to the design canvas (currently viewer-only). Lower priority — authoring is mouse-first. |

---

## Phase 3 — Stub symbols → live-bound (frontend-only)

Turn the remaining mock renderers into real bound symbols. Slot plumbing mostly exists; the renderers just ignore it.

| # | Symbol | Fix | Renders at |
|---|---|---|---|
| 3.1 | `chart.sparkline` | Read `value` slot history (ring-buffer of live samples, like `XYPlot`) and draw the polyline from it | `SymbolRenderer.tsx:896-908` |
| 3.2 | `chart.pie` | Read `values` slot(s) → proportional wedges; abnormal slice uses alert token | `CustomSymbols.tsx:404-415` |
| 3.3 | `graph.graph-mini` | Replace `DEMO_GRAPH_DATA` with live ring-buffer from `value` | `catalogRenderer.tsx:252` |
| 3.4 | `graph.gauge-trend` | Replace `DEMO_TREND_DATA` trend series with live ring-buffer (needle already live) | `catalogRenderer.tsx:254` |
| 3.5 | `equip.hx` | Render `tempIn`/`tempOut` slot values (already resolved into `slots.*`, just not drawn) | `SymbolRenderer.tsx:708-717` |
| 3.6 | `obc.alert-button` | Read `alarms` slot / `useAlarmStore` → live unacked count badge | `SymbolRenderer.tsx:596-601` |
| 3.7 | `obc.breadcrumb` | Derive path from the display's asset context instead of hardcoded `Site/Area/label` (or clearly mark as decorative) | `SymbolRenderer.tsx:575-584` |

Where a slot is missing from `KNOWN_SLOTS` (`SymbolRenderer.tsx:73-80`), add it.

---

## Phase 4 — Surface backend-only features in the UI (frontend-only wiring)

Every endpoint exists and is auth-gated; build the screens. **Owner-or-Admin is enforced server-side** on ACL/folder writes (`Program.cs:944/968/985`) — plan disabled/hidden states for non-owners.

| # | Feature | Endpoints to wire | UI |
|---|---|---|---|
| 4.1 | **Version history browser** | `GET /displays/{id}/versions`, `GET …/versions/{n}`, `POST …/versions/{n}/restore` | Versions list drawer in the Designer; client-side diff by fetching two snapshots; restore button |
| 4.2 | **Folder tree** | `GET/POST/PUT/DELETE /folders`, move via `PUT /displays/{id}` `FolderId` | Folder sidebar in `DisplayList`; drag display → folder |
| 4.3 | **Sharing / ACL editor** | `GET/POST/DELETE /displays/{id}/permissions`, `POST /folders/{id}/permissions` | "Share" modal (user/role → read/edit); show inherited grants read-only |
| 4.4 | **Personal views editor** | `GET/POST/PUT/DELETE /me/views` | "Save as Personal View" from viewer; "My Views" list |
| 4.5 | **Comments** (bonus, cheap) | `GET/POST /displays/{id}/comments` | Comments panel in version history drawer |

---

## Phase 5 — Backend-first / bigger features

Require new backend surface or an architectural decision; sequenced last.

| # | Item | Why backend-first | Approach |
|---|---|---|---|
| 5.1 | **Controls write nothing** (buttons/sliders/toggles/inputs) | No command/write-back path exists. Safety-critical: needs authz, confirm, audit, and an OPC write channel | Add a guarded write endpoint (binding-resolver or a new command service) → Kafka `operator-actions` → OPC Gateway (the ACK path already exists); gate on a `command.write` permission + confirm dialog + audit event |
| 5.2 | **Event annotations + related/compare-events** | Needs an annotations store + query API | New `annotations` table/endpoints in a service; trend overlay + events pane |

---

## Sequencing & status

- **Phase 1 — ✅ DONE.** TagPicker typeahead + browse tree; Assets-tab draggable search results; Favorites filter/section + count + empty-state (root cause: favorites persisted but were never surfaced) + self-healing governance DDL; ISA-101 level filter. `tsc` + `vite build` green.
- **Phase 2 — ✅ DONE.** Quality badge now default-on for Bad/Uncertain (safety), opt-in for maintenance/OoS; per-row UOM in the value table (each tag shows its own native unit, converted when a display unit is set); timezone now reformats the trend clock, the echarts time axis, and value-symbol timestamps; display **background image** end-to-end (upload → sanitising media store → id in config → canvas + viewer render).
- **Phase 3 — ✅ DONE.** All seven stubs wired: `chart.sparkline` (new `Sparkline.tsx`, live ring-buffer), `chart.pie` (new `PieChart.tsx`, proportional live slices), `graph.graph-mini` + `graph.gauge-trend` (live trend series via a per-item ring buffer in `LazyObcSymbol`), `equip.hx` (live tempIn/tempOut), `obc.alert-button` (live scoped/plant-wide alarm count + priority colour + blink), `obc.breadcrumb` (derived from the label, no longer hardcoded).
- **Phase 4 — ✅ DONE (frontend-only wiring).** All four backend-only features now have UI, wired to the existing endpoints. `tsc` + `vite build` green.
  - **4a Version history** — `VersionHistoryDialog` (🕓 History in the Designer toolbar): version list, pick-two client-side **diff** (added/changed/removed items), **restore** any version into a new draft (re-seeds the canvas), and change-note comments.
  - **4b Folder tree** — `FolderTree` sidebar in the display list: create/rename/delete folders, filter by folder (All / Unfiled / specific), and **drag a display card onto a folder** to move it (`PUT /displays/{id}` FolderId).
  - **4c Sharing / ACL** — `ShareDialog` (🔗 on each card): shows owner + direct grants + inherited-from-folder grants (read-only), add/remove user/role → read/edit. Owner-or-Admin gated (mirrors the server's 403).
  - **4d Personal views** — `PersonalViewsDialog` + "Save as view" in the runtime viewer + a new `/my-view/:id` route (the viewer renders a personal view via a `source` branch in its fetch). Config-only.
- **Phase 5 — DESIGN ONLY (not implemented).** See **`HMI-PHASE-5-DESIGN.md`**. Covers 5.1 controls write-back (reusing the proven ACK write-back spine: `operator-commands` → Flink → `command-writeback` → gateway → OPC-UA write → `command-results` → SignalR; full security model) and 5.2 event annotations. 5.1 ships only after an explicit **security sign-off** (open decisions listed in the doc).

Rebuild gate after every phase: `tsc --noEmit` clean + `npm run build` (vite) green + a manual smoke check against the running stack. (Repo note: `npm run lint` currently errors — no eslint config is present in `src/frontend-ob` — a pre-existing condition, so `tsc` is the correctness gate.)

**Backend note:** the display-service DDL self-heal (`ALTER … ADD COLUMN IF NOT EXISTS` for `view_favorites`) is defensive for older deployments; the currently-running DB already has the columns, so it takes effect on the next display-service image rebuild.
