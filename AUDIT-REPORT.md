# PI Vision Parity — Code Audit Report

**Subject:** Traverse AMS Edge HMI Designer, Display runtime, and Trends
**Benchmark:** [PI-Vision-Parity-Checklist.md](PI-Vision-Parity-Checklist.md) (AVEVA PI Vision through 2025)
**Method:** Code-verified only. Docs, schema files, and type declarations were **not** accepted as evidence. A symbol that renders but cannot bind to live data is `🟡`, never `✅`. A stub, mock, or hardcoded array is not `BUILT`.
**Date:** 2026-07-15

**Legend:** `✅ BUILT` · `🟡 PARTIAL` · `❌ MISSING` · `⛔ N/A` (deliberately out of scope)

---

## 1. Executive summary

**Headline P0 completion: 42%** (63 of 149 P0 items built). Overall across all 305 rows: **32% built, 17% partial, 48% missing, 3% N/A.**

The product is **not** a uniformly half-finished designer. It is a **very good canvas attached to a very thin data model**. Five findings explain nearly all of the score, and two of them are much better news than the raw number suggests.

**1. The canvas is close to parity and is the strongest asset you have.** Undo/redo, marquee select, smart-snap alignment guides, zoom/pan, layers, groups, six-way align, rotate, flip, arrow-nudge, multi-symbol bulk editing — all real, all wired. Section B scores **71% P0**. This is genuinely competitive with PI Vision's editor and should not be rebuilt.

**2. Multi-state is fully built and completely unreachable. This is the single highest-leverage finding in the audit.** The evaluation engine ([ruleEngine.ts:34-57](src/frontend-ob/src/components/Designer/ruleEngine.ts#L34-L57)) implements the operators (`> >= < <= == != between outside`) and effects (color / blink / hidden / rotate), and it is wired into rendering for **every symbol type** through the universal `SymbolFxWrap` wrapper ([SymbolRenderer.tsx:184](src/frontend-ob/src/components/Designer/SymbolRenderer.tsx#L184), invoked at [:272-273](src/frontend-ob/src/components/Designer/SymbolRenderer.tsx#L272-L273)). The blink CSS exists. The NE107 quality path exists.

But a repo-wide grep for the three fields that drive it — `multiStateConfig`, `item.rules`, `alarmSource` — returns exactly **three** files: `types.ts` (declares them), `SymbolRenderer.tsx` (reads them), and `useBindingResolver.ts`. **`PropertyInspector.tsx` is not in that list.** Nothing in the entire application ever *writes* these fields. Section G — 23 rows, mostly P0 — scores **4%**, despite the hard part being done. The same pattern hits `alarm.table`: a working, live-bound alarm grid ([SymbolRenderer.tsx:150](src/frontend-ob/src/components/Designer/SymbolRenderer.tsx#L150)) that is **absent from `SymbolPalette.tsx`** and therefore cannot be placed on a canvas.

> **An inspector tab and a palette entry — days of work, not months — would move Section G from 4% to roughly 70% and unlock the "visual alarm" capability that is PI Vision's core value proposition.** This is the first thing to build.

**3. Four sections do not exist at any layer — frontend, service, *and* database.** Collections (I), dynamic search criteria (J), calculations (L), and the time model (K) are absent, not partial. Three of them are **blocked on backend work before any UI can be written**: asset-model has no attribute table and no comparison-operator filtering (so collections are unimplementable server-side), historian-bff has no summary-aggregate endpoint (so table summary columns are unimplementable), and there is **no expression engine anywhere in the repo** (no NCalc, no Jint, no parser — verified by grep).

**4. Several palette "symbols" are hardcoded mocks whose binding slots can never resolve.** `chart.bar` plots the literal array `[15,35,25,50,40,30]`; `chart.xy` plots five literal points; `chart.pie`, `chart.sparkline`, `graph.graph-mini` and `graph.gauge-trend` likewise. Worse, this is **structural, not cosmetic**: their declared slots (`values`, `x`, `y`, `source`, `alarms`, `asset`) are not members of `KNOWN_SLOTS` ([SymbolRenderer.tsx:61](src/frontend-ob/src/components/Designer/SymbolRenderer.tsx#L61)), so even a correctly-authored binding would never receive data. A palette entry is not a symbol.

**5. `database/migrations/phase0/*.sql` is dead code, and it will inflate any audit that trusts it.** [docker-compose.yml:51](infra/docker/docker-compose.yml#L51) mounts **only** `database/scripts/` into `docker-entrypoint-initdb.d`. Nothing applies phase0, and it *conflicts* with the live schema (unqualified `display_definitions` vs. the real `displays.display_definitions`). So `operator_views`, `display_comments`, `tags TEXT[]`, `resource_permissions`, `attribute_instances`, and `uom_classes` **do not exist in the running system**. W2 (`operator_views`) is scored `❌` here even though a schema file for it exists on disk.

### What this means

You have a credible **drawing tool**. You do not yet have a credible **HMI builder**, because an HMI builder is defined by four things PI Vision does and we do not: *bind a symbol's colour to a condition* (multi-state), *repeat a display across assets* (collections + context switching), *scrub time* (the time model), and *reuse a display for many assets* (templates/asset context). Of those four, **multi-state is 90% done and needs only a UI**, and **asset context switching half-works**. The other two need real build effort.

---

## 2. Scorecard

| § | Section | ✅ | 🟡 | ❌ | ⛔ | Rows | % Built | P0 % |
|---|---|---|---|---|---|---|---|---|
| A | Home page & display management | 8 | 6 | 20 | 1 | 35 | 23% | 60% |
| B | Designer — canvas & editing | 26 | 3 | 9 | 0 | 38 | 68% | 71% |
| C | Static symbols (primitives) | 8 | 4 | 10 | 0 | 22 | 36% | 45% |
| D | Dynamic symbols — native set | 5 | 4 | 3 | 0 | 12 | 42% | 44% |
| E | Per-symbol configuration | 15 | 9 | 47 | 0 | 71 | 21% | 30% |
| F | Graphics library (process symbols) | 13 | 4 | 4 | 0 | 21 | 62% | 71% |
| G | **Multi-state behaviors** | **1** | **3** | **19** | **0** | **23** | **4%** | **0%** |
| H | Asset context switching | 3 | 5 | 6 | 0 | 14 | 21% | 22% |
| I | Collections | 0 | 0 | 17 | 0 | 17 | 0% | 0% |
| J | Dynamic search criteria | 0 | 0 | 7 | 0 | 7 | 0% | 0% |
| K | Time model | 1 | 4 | 14 | 0 | 19 | 5% | 11% |
| L | Calculations / expressions | 0 | 0 | 19 | 0 | 19 | 0% | — |
| M | Navigation, URLs, embedding | 8 | 4 | 8 | 0 | 20 | 40% | 43% |
| N | Events / event frames | 2 | 4 | 12 | 0 | 18 | 11% | 12% |
| O | Data search & asset browsing | 7 | 2 | 7 | 0 | 16 | 44% | 50% |
| P | Units of measure | 1 | 1 | 4 | 0 | 6 | 17% | 100% |
| Q | Keyboard shortcuts | 9 | 1 | 2 | 0 | 12 | 75% | 83% |
| R | Security, roles, sharing | 8 | 2 | 10 | 0 | 20 | 40% | 50% |
| S | Administration | 1 | 2 | 6 | 0 | 9 | 11% | 0% |
| T | Extensibility | 1 | 1 | 12 | 0 | 14 | 7% | — |
| U | Runtime, performance, platform | 5 | 4 | 2 | 0 | 11 | 45% | 44% |
| V | Explicitly out of scope | 0 | 0 | 0 | 6 | 6 | — | — |
| W | **Traverse-only requirements** | 5 | 2 | 3 | 0 | 10 | 50% | 50% |
| | **TOTAL** | **98** | **53** | **147** | **7** | **305** | **32%** | **42%** |

**The three sections that define an HMI builder — G (multi-state), I (collections), K (time model) — score 4%, 0%, and 5%.** That is the headline risk, and it is what the backlog in §5 is ordered around.

---

## 3. Annotated checklist

### A. Home page & display management

Two home surfaces exist: [DisplayList.tsx](src/frontend-ob/src/components/Designer/DisplayList.tsx) (authoring) and [DisplayLauncher.tsx](src/frontend-ob/src/components/Designer/DisplayLauncher.tsx) (runtime, route `/displays`).

| # | Capability | Status | Evidence / gap |
|---|---|---|---|
| A1 | Home page listing displays | ✅ | `DisplayList`, `DisplayLauncher` |
| A2 | Thumbnail view | ✅ | `DisplayThumb` [DisplayList.tsx:501](src/frontend-ob/src/components/Designer/DisplayList.tsx#L501); `GET /displays/{id}/thumbnail` |
| A3 | Table/list view toggle | ❌ | Card grid only, in both surfaces |
| A4 | Create New Display | ✅ | `createDisplay()` [DisplayList.tsx:86](src/frontend-ob/src/components/Designer/DisplayList.tsx#L86) |
| A5 | Open existing display | ✅ | → `/designer/:id`, `/display/:id` |
| A6 | Search by name | 🟡 | Launcher filters client-side only; **`DisplayList` has no search box at all**. Server `?search=` covers name+description ([display-service/Program.cs:139](src/services/display-service/Program.cs#L139)) |
| A7 | Search by owner | 🟡 | Server has `?ownerId=` ([:136](src/services/display-service/Program.cs#L136)); **no UI calls it** |
| A8 | Search by keyword/tag | ❌ | No tag concept |
| A9 | Keyword labels on displays | ❌ | No column, no UI. Only a fixed 5-value `Category` |
| A10 | All Displays group | ✅ | Both surfaces |
| A11 | Favorites | 🟡 | **localStorage only** — `FAV_KEY` [DisplayLauncher.tsx:48](src/frontend-ob/src/components/Designer/DisplayLauncher.tsx#L48). Per-browser, not per-user, not server-persisted. `displays.view_favorites` table exists with **zero endpoints** |
| A12 | My Displays | ❌ | No owner-filtered group |
| A13 | Recent | 🟡 | localStorage, capped at 6. No `last_accessed` column server-side |
| A14 | Sort by accessed/modified/name/owner | ❌ | No sort control. Server hardcodes `OrderBy(HierarchyPath).ThenBy(Name)` |
| A15 | Sort asc/desc | ❌ | — |
| A16 | Folders: create | ❌ | **No folder entity exists.** `hierarchy_path` is free text |
| A17 | Folders: nested hierarchy | ❌ | `GET /displays/hierarchy` ([:616](src/services/display-service/Program.cs#L616)) *derives* a tree by string-splitting `'/'` at request time |
| A18 | Folders: rename/edit | ❌ | — |
| A19 | Folders: move | ❌ | — |
| A20 | Folders: delete (cascade) | ❌ | — |
| A21 | Folders: per-folder permissions | ❌ | Authorization is flat global-role only |
| A22 | Folders: permission inheritance | ❌ | — |
| A23 | Folders: share via URL | ❌ | — |
| A24 | Bulk-select + move to folder | ❌ | `PUT /displays/{id}` changes `hierarchyPath` one at a time |
| A25 | Show/hide private displays | ❌ | No private/public concept |
| A26 | Display settings panel | 🟡 | Designer-side canvas settings only (W/H, grid). Not ownership/permissions/keywords |
| A27 | Shared/public indicator | ❌ | Only Draft/Published version badges |
| A28 | Related displays | ❌ | — |
| A29 | Thumbnail generation `[TRAVERSE-DELTA]` | ✅ | Client-side `renderThumbnailSvg()` [thumbnail.ts](src/frontend-ob/src/components/Designer/thumbnail.ts) → `PUT /displays/{id}/thumbnail`. **Note:** fires on *publish*, not save; it is a schematic SVG serialization, not a canvas capture. Matches the recorded decision |
| A30 | Recycle Bin | ✅ | `GET /displays/deleted` + `POST /{id}/restore` + soft-delete + Undo toast |
| A31 | "Unorganized" area | ❌ | — |
| A32 | Messages/notification indicator | ❌ | Shell has an unacked-alarm counter, not a message inbox |
| A33 | Touch-friendly toggle | ❌ | — |
| A34 | Connected-identity indicator | 🟡 | App shell shows user+role+SignalR pill ([App.tsx:418-465](src/frontend-ob/src/App.tsx#L418-L465)); not on the home page, not a data-source identity |
| A35 | Help entry point | ❌ | — |

**Extras beyond the checklist:** rename / duplicate ("Save As") / delete per card; `.pdix` import ([ImportPage.tsx](src/frontend-ob/src/components/Designer/ImportPage.tsx)).

### B. Designer — canvas, toolbar, editing model

**The strongest section. 68% built.**

| # | Capability | Status | Evidence / gap |
|---|---|---|---|
| B1 | Design mode toggle | ✅ | `mode: 'design'\|'preview'` [DisplayDesigner.tsx:131](src/frontend-ob/src/components/Designer/DisplayDesigner.tsx#L131) |
| B2 | Display name in editor | 🟡 | Shown in toolbar, **read-only**; rename lives in the display list |
| B3 | Unsaved-changes indicator | ✅ | `isDirty` [:139](src/frontend-ob/src/components/Designer/DisplayDesigner.tsx#L139) + `beforeunload` guard [:494](src/frontend-ob/src/components/Designer/DisplayDesigner.tsx#L494) |
| B4 | Save | ✅ | `saveMutation` [:201](src/frontend-ob/src/components/Designer/DisplayDesigner.tsx#L201) → `PUT /content` |
| B5 | Save-As / duplicate | 🟡 | Exists (`POST /{id}/duplicate`) but **only from the display-list card, not from inside the designer** |
| B6 | Undo / Redo | ✅ | `historyRef` [:146](src/frontend-ob/src/components/Designer/DisplayDesigner.tsx#L146), `commit`/`undo`/`redo` [:272-288](src/frontend-ob/src/components/Designer/DisplayDesigner.tsx#L272-L288), capped at 50 |
| B7 | **Cut** | ❌ | **No Ctrl+X handler anywhere** |
| B8 | Copy | ✅ | `copySelected` [:428](src/frontend-ob/src/components/Designer/DisplayDesigner.tsx#L428) (in-memory clipboard, not OS clipboard) |
| B9 | Paste | ✅ | `paste` [:429](src/frontend-ob/src/components/Designer/DisplayDesigner.tsx#L429), +20/+20 offset |
| B10 | Delete | ✅ | `deleteSelected` [:350](src/frontend-ob/src/components/Designer/DisplayDesigner.tsx#L350) |
| B11 | Duplicate symbol | ✅ | `duplicateSelected` [:360](src/frontend-ob/src/components/Designer/DisplayDesigner.tsx#L360), Ctrl+D |
| B12 | Select tool | ✅ | Implicit — canvas is always in select mode (no tool palette; shapes come from the palette by drag) |
| B13 | Ctrl+click multi-select | ✅ | [DesignerCanvas.tsx:166](src/frontend-ob/src/components/Designer/DesignerCanvas.tsx#L166) |
| B14 | Marquee / rubber-band | ✅ | [DesignerCanvas.tsx:108](src/frontend-ob/src/components/Designer/DesignerCanvas.tsx#L108), intersection test |
| B15 | Select all | ✅ | Ctrl+A [:454](src/frontend-ob/src/components/Designer/DisplayDesigner.tsx#L454) |
| B16 | Grid toggle | ✅ | Persisted in `settings.showGrid` |
| B17 | Grid snapping | ✅ | `snap` [DesignerCanvas.tsx:33](src/frontend-ob/src/components/Designer/DesignerCanvas.tsx#L33) + Alt-to-bypass |
| B18 | **Drag data item → canvas to create bound symbol** | ❌ | **Not possible.** `AssetBrowser` nodes carry no `draggable`; canvas `handleDrop` reads only `application/symbol-type`. The only binding gesture is *select symbol first, then click a tag* |
| B19 | **Drop data item onto existing symbol** | ❌ | No per-item drop target; no add-a-trace/add-a-column gesture |
| B20 | Move by drag | ✅ | Group-aware, single undo entry at mouse-up |
| B21 | Arrow-key nudge | ✅ | 1px, Shift = 10px [DesignerCanvas.tsx:130-133](src/frontend-ob/src/components/Designer/DesignerCanvas.tsx#L130-L133) |
| B22 | Resize via handles | 🟡 | 8 handles, but **single-selection only** (`selectedIds.length===1`) |
| B23 | Resize maintaining aspect ratio | ❌ | The resize branch never reads `e.shiftKey` |
| B24 | Rotation | ✅ | Rotate handle (5° increments) + numeric field |
| B25 | Align (6-way) | ✅ | `alignSelected` [:386](src/frontend-ob/src/components/Designer/DisplayDesigner.tsx#L386) |
| B26 | Distribute | ❌ | Only "Make same size" (`sameSize`) exists |
| B27 | Bring Forward / Send Backward (step) | ❌ | **Only front/back exist; no one-step z-order** |
| B28 | Bring to Front / Send to Back | ✅ | `zOrder('front'\|'back')` [:416](src/frontend-ob/src/components/Designer/DisplayDesigner.tsx#L416) |
| B29 | Multi-symbol editing | ✅ | `MultiSelectPanel` with MIXED sentinel [PropertyInspector.tsx:47](src/frontend-ob/src/components/Designer/PropertyInspector.tsx#L47); one undo entry |
| B30 | **Right-click context menu** | ❌ | **None in the Designer.** `onContextMenu` exists only in the alarm console |
| B31 | Format/config side panel | ✅ | 5 tabs: General/Data/Style/Limits/Action |
| B32 | Format Display (background colour) | 🟡 | `bgColor` is loaded and saved, **but no UI control calls `setBgColor`** — unreachable from the editor |
| B33 | Display background image | ❌ | — |
| B34 | Symbol type switching | ❌ | `item.type` is never mutated after `addItem` |
| B35 | Format copying between symbols | ❌ | — |
| B36 | Alignment guides / smart snapping | ✅ | `computeSmartSnap` [DesignerCanvas.tsx:46](src/frontend-ob/src/components/Designer/DesignerCanvas.tsx#L46), 6-line edge/centre snap with rendered guides |
| B37 | Zoom / pan | ✅ | Buttons, presets, Ctrl+wheel, fit-to-screen; Space+drag and middle-mouse pan |
| B38 | Layers | ✅ | [LayersPanel.tsx:32](src/frontend-ob/src/components/Designer/LayersPanel.tsx#L32) — z-sorted, filter, per-item hide/lock |

**Extras:** group/ungroup (Ctrl+G), flip H/V.

### C. Static symbols (drawing primitives)

| # | Capability | Status | Evidence / gap |
|---|---|---|---|
| C1 | Text insert + edit | 🟡 | `text.label`, `text.title`, `text.dynamic` placeable |
| C2 | Font family | ❌ | `ItemStyle` has no `fontFamily` |
| C3 | Font size | ✅ | [PropertyInspector.tsx:1024](src/frontend-ob/src/components/Designer/PropertyInspector.tsx#L1024) |
| C4 | Bold / italic / underline | 🟡 | **Bold only** (`fontWeight`). No italic, no underline |
| C5 | **Text colour** | ❌ | **Dead path.** The Style tab writes `style.fill`/`style.stroke`, but the `text.label`/`text.title` renderers only apply `fontSize`, `fontWeight`, `textAlign`. Colour is honoured only by `shape.label`, which is **import-only and not in the palette** |
| C6 | Text fill / background | ❌ | — |
| C7 | Text rotation | ✅ | Item-level rotation applies |
| C8 | Text alignment | ✅ | Applied for `text.label` |
| C9 | Rectangle | ✅ | `shape.rect` — fill/stroke/strokeWidth/borderRadius/opacity [CustomSymbols.tsx:220](src/frontend-ob/src/components/Designer/CustomSymbols.tsx#L220) |
| C10 | Line | 🟡 | `shape.line` renders a horizontal line scaled to its box. **No endpoint editing** |
| C11 | Line 45° snap | ❌ | — |
| C12 | Ellipse / circle | ✅ | `shape.circle` |
| C13 | **Polygon / polyline** | ❌ | **Broken.** `ShapeProps.points` exists and `pdixImport.ts:23` maps PI `polygon → 'shape.polygon'`, but **there is no renderer case and no palette entry** → imported polygons render as the `❓` unknown-symbol box |
| C14 | Fill + transparent fill | 🟡 | `style.fill` works on shapes; `'transparent'` is in `COLOR_PRESETS` but the swatch list renders only `.slice(0,8)`, so it is **not selectable** |
| C15 | Stroke colour | ✅ | Shapes only |
| C16 | **Line style dashed/dotted** | ❌ | **No `strokeDasharray` anywhere** in the model or renderers |
| C17 | Line thickness | ✅ | `style.strokeWidth` |
| C18 | Corner radius | ✅ | `style.borderRadius` → `rx` |
| C19 | **Image insert / upload** | ❌ | No image symbol type, no file input, no `<img>`, **and no backend** (§10) |
| C20 | Animated GIF | ❌ | — |
| C21 | **SVG import** `[TRAVERSE-DELTA]` | ❌ | All symbols are hand-authored inline SVG components. **No user SVG ingestion.** This is P0 and it is tagged as core to the theme-aware symbol strategy |
| C22 | Static symbols support multi-state | 🟡 | The *engine* applies to every symbol type (universal `SymbolFxWrap`), but **no authoring UI** — see §G |

### D. Dynamic symbols — the native set

Live binding path: `KNOWN_SLOTS` ([SymbolRenderer.tsx:61](src/frontend-ob/src/components/Designer/SymbolRenderer.tsx#L61)) → `useSlotMetrics` → `useBindingResolver` → `mqttStore`. **A slot not in `KNOWN_SLOTS` is never resolved.**

| # | Symbol | Status | Evidence / gap |
|---|---|---|---|
| D1 | **Trend** | ✅ | [TrendCore.tsx](src/frontend-ob/src/components/Designer/TrendCore.tsx) + [TrendChart.tsx](src/frontend-ob/src/components/Designer/TrendChart.tsx). Historian fetch + MQTT live tail, multi-pen, per-pen Y axes, dataZoom, live/paused/historical. **The one genuinely complete symbol** |
| D2 | Value | ✅ | `obc.readout`, `obc.readout-unit`, `ind.digital` — live-bound |
| D3 | Vertical Gauge | ✅ | `obc.ob.inst.gauge-vertical` — live |
| D4 | Horizontal Gauge | ✅ | `obc.ob.inst.gauge-horizontal` — live |
| D5 | Radial Gauge | ✅ | `obc.ob.inst.gauge-radial`, `ind.gauge` — live |
| D6 | **Table** | 🟡 | `obc.ob.ui.table` is placeable but renders `ObcTable` with **no rows, no columns, no bindings** ([catalogRenderer.tsx:196](src/frontend-ob/src/components/Designer/renderers/catalogRenderer.tsx#L196)); its `SymbolDefinition` declares **zero** binding slots. An empty shell |
| D7 | **Asset Comparison Table** | ❌ | Does not exist (and cannot, without asset-model attribute queries — §I) |
| D8 | Time Series Table | ❌ | Does not exist |
| D9 | **Bar Chart** | 🟡 | **Hardcoded mock** — plots `[15,35,25,50,40,30]` [CustomSymbols.tsx:344](src/frontend-ob/src/components/Designer/CustomSymbols.tsx#L344). Slot `values` is **not in `KNOWN_SLOTS`** → unbindable by construction |
| D10 | **XY Plot** | 🟡 | **Hardcoded mock** — 5 literal points [:364](src/frontend-ob/src/components/Designer/CustomSymbols.tsx#L364). Slots `x`/`y` not in `KNOWN_SLOTS` |
| D11 | **Alarm/Event list symbol** `[TRAVERSE-DELTA]` | 🟡 | `alarm.summary`/`banner`/`beacon`/`horn` are placeable and live-bound to `alarmStore`. **But `alarm.table` — the real live alarm grid ([SymbolRenderer.tsx:150](src/frontend-ob/src/components/Designer/SymbolRenderer.tsx#L150)) — is not in the palette and cannot be placed.** `obc.ob.ui.event-list` renders with no items |
| D12 | Future data | ❌ | — |

**Also mock:** `chart.pie`, `chart.sparkline`, `graph.graph-mini`, `graph.gauge-trend` (render `DEMO_GRAPH_DATA` / `DEMO_TREND_DATA` constants).

### E. Per-symbol configuration surface

#### E1. Trend — the deepest symbol, but shallow config

| # | Capability | Status | Evidence / gap |
|---|---|---|---|
| E1.1 | Multiple traces | ✅ | `PenSpec[]`; pens derived from binding slots |
| E1.2 | **Per-trace colour** | 🟡 | **Auto-assigned from a fixed 6-token palette** (`PEN_TOKENS`, [TrendCore.tsx:40](src/frontend-ob/src/components/Designer/TrendCore.tsx#L40)); no picker. Display-level trend is **silently capped at 6 pens** ([DisplayViewer.tsx:221](src/frontend-ob/src/components/Designer/DisplayViewer.tsx#L221)) |
| E1.3 | Per-trace line style | ❌ | Hardcoded `lineStyle:{width:1.5}` for every series |
| E1.4 | Data markers | ❌ | Hardcoded `showSymbol:false` |
| E1.5 | Single shared scale | ✅ | Fallback branch |
| E1.6 | Multiple scales per trace | 🟡 | `perAxis` implemented (one Y-axis per pen, offset, pen-coloured) and auto-enabled when units differ — but the `multiAxis` prop that overrides it **has no caller**, so it is not configurable |
| E1.7 | Autorange | ✅ | `scale:true` on all yAxis |
| E1.8 | Manual min/max | ❌ | No inputs |
| E1.9 | Limits from attribute | ❌ | `item.alarmLimits` is never passed into `TrendCore` |
| E1.10 | Scale labels inside/outside | ❌ | — |
| E1.11 | Trace grouping | ❌ | — |
| E1.12 | Regression line | ❌ | — |
| E1.13 | **Trend cursors** | 🟡 | **Hover-only** cross-pointer; the legend shows value-at-cursor (`valueAt()`). Not a click-placed cursor |
| E1.14 | Cursor retention | ❌ | `globalout: () => setCursorTs(null)` — the cursor is **discarded on mouse-out** |
| E1.15 | Pan | 🟡 | `dataZoom type:'inside'` drag-pan + explicit half-window step buttons |
| E1.16 | Zoom | ✅ | `dataZoom` inside + slider; zoom state survives re-render |
| E1.17 | Hide/show traces | ❌ | The legend is custom HTML, not the echarts legend — clicking a pen does nothing |
| E1.18 | Remove a trace | 🟡 | `onRemovePen` wired in `TrendDialog` and `TrendPage`; **not wired in the `chart.trend` canvas symbol** |
| E1.19 | Trend title | 🟡 | Renders the generic `item.label`; no title config |
| E1.20 | Grid style | ❌ | Hardcoded |
| E1.21 | Legend | ✅ | Custom legend: swatch + label + value-at-cursor + unit |
| E1.22 | Stepped vs interpolated | ❌ | Hardcoded `smooth:false`, `type:'line'` |
| E1.23 | Display time range mode | ❌ | **No display time range exists to inherit** (§K) |
| E1.24 | Duration + offset mode | ❌ | — |
| E1.25 | Custom independent range | ❌ | No start/end pickers. The window is always `[now - rangeMs, now]` or a stepped variant. Presets: 15m/1h/8h/1d/1w |

#### E2. Value

| # | Capability | Status | Evidence / gap |
|---|---|---|---|
| E2.1 | Show/hide Label (+ source) | 🟡 | Rendered if `item.label` is set; no explicit toggle, no label *source* (attribute/asset/custom). `FormattingOptions.showLabel` is declared but **written by nothing and read by nothing** |
| E2.2 | Show/hide Value | ❌ | No toggle |
| E2.3 | Show/hide Units | ✅ | `formatting.showUnit` checkbox, honoured at render |
| E2.4 | Show/hide Timestamp | ❌ | **No timestamp is ever rendered on a value symbol** |
| E2.5 | Font size/family/colour/bold | 🟡 | Size + bold only (see C2, C5) |
| E2.6 | Background / fill / opacity | ❌ | `FormattingOptions.backgroundColor` declared, unused |
| E2.7 | Digital state + string values | 🟡 | The renderer stringifies whatever arrives, but there is **no discrete-state/enum mapping UI** |
| E2.8 | URL attribute as hyperlink | ❌ | — |
| E2.9 | Supports multi-state | 🟡 | Engine yes, authoring no (§G) |

#### E3. Gauges

| # | Capability | Status | Evidence / gap |
|---|---|---|---|
| E3.1 | **Zero/span from attribute limits** | ❌ | `ind.gauge` uses `getPercentage()` — a **fixed 0–100 assumption**. Nothing reads `loEngLimit`/`hiEngLimit` |
| E3.2 | Manual scale override | 🟡 | `minValue`/`maxValue` exist **only for OBC catalog gauges**; the palette's own "Circular Gauge" (`ind.gauge`) fails the `isObcCatalogType` test and gets **no min/max UI at all** |
| E3.3 | Gauge type/style variants | ✅ | `gaugeType` needle/filled/bar for `gauge-radial` |
| E3.4 | Label visibility + source | 🟡 | Visibility yes, source no |
| E3.5 | Value colour / font | 🟡 | Partial |
| E3.6 | Units + UOM switching | ❌ | See §P — no UOM system exists |
| E3.7 | Supports multi-state | 🟡 | Engine yes, authoring no |

#### E4. Table — **the symbol does not exist**

E4.1–E4.16: **all ❌**, except by inference. There is no `table.*` symbol in the palette; `obc.ob.ui.table` is an empty shell (D6). No column model, no summary columns, no resize/reorder/sort, no themes, no drag-drop-to-add. **Summary columns (E4.5–E4.7, E4.14) are additionally blocked server-side** — historian-bff has no aggregate endpoint (§10).

#### E5. Asset Comparison Table — **does not exist**

E5.1–E5.9: **all ❌**. Blocked on asset-model: no attribute table, no attribute-value filtering, no descendants query, no same-type discovery.

#### E6. Bar Chart

E6.1 🟡 (mock data, unbindable slot). E6.2–E6.11: **all ❌** — no orientation, scale, grid, label source, value display, tooltip, multi-state, or dynamic criteria config.

#### E7. XY Plot

E7.1 🟡 (mock). E7.2–E7.6: **all ❌**.

#### E8. Time Series Table

E8.1–E8.8: **all ❌** — symbol absent.

### F. Graphics library (process symbols)

**Strong section — 62%.** [SymbolPalette.tsx](src/frontend-ob/src/components/Designer/SymbolPalette.tsx) + [lazyCategoryRegistry.ts](src/frontend-ob/src/components/Designer/lazyCategoryRegistry.ts).

| # | Capability | Status | Evidence / gap |
|---|---|---|---|
| F1 | Graphics library pane | ✅ | Left-rail "Symbols" tab |
| F2 | Organized by category | ✅ | **24 categories** — 10 static + 14 lazily code-split |
| F3 | Search/filter | 🟡 | Matches label/type/description, but **only within already-loaded categories** — a collapsed lazy category is invisible to search |
| F4 | Drag-and-drop onto display | ✅ | `handleDragStart` → canvas `handleDrop` |
| F5 | **Colour customization** | 🟡 | The Style tab writes `style.fill`, but **ISA equipment renderers use `currentColor`/tokens and ignore it** — recolouring a pump or valve **does not work** |
| F6 | Fill type customization | ❌ | — |
| F7 | Orientation / flip / rotate | ✅ | Item-level flip + rotate |
| F8 | Graphic supports multi-state | 🟡 | Engine yes, authoring no (§G) |
| F9 | Tanks / vessels | ✅ | `equip.tank`, `automation-tanks` |
| F10 | Pumps | ✅ | |
| F11 | Valves | ✅ | `equip.valve`, `valve-onoff`, `analog-valve`, `digital-valve`, two/three-way |
| F12 | Motors | ✅ | |
| F13 | Heat exchangers | ✅ | `equip.hx` |
| F14 | Compressors / blowers / fans | ✅ | `equip.compressor`, `equip.fan` |
| F15 | Piping / connectors | ✅ | `pipe.*`, `automation-lines` |
| F16 | Instruments / sensors | ✅ | `inst.ti/pi/fi/li/ai/tt` |
| F17 | Electrical | ✅ | capacitor, resistor, diode, MOSFET, transformer, ground, transistor, source |
| F18 | HVAC | 🟡 | Only `equip.fan`/`heater`/`cooler`/`damper` — **no HVAC category** |
| F19 | User-uploaded symbol registration | ❌ | `CustomSymbols.tsx` is a hardcoded `switch`. No upload, no registry, **no backend** |
| F20 | Theme-aware `[TRAVERSE-DELTA]` | ✅ | OBC tokens + `currentColor`; `useObcTheme` re-resolves chart colours on theme change |
| F21 | ISA-5.1 coverage `[TRAVERSE-DELTA]` | 🟡 | Equipment + instrument categories are labelled ISA-5.1; coverage is not formally verified against the standard |

**Dead code:** [TemplatePalette.tsx](src/frontend-ob/src/components/Designer/TemplatePalette.tsx) — zero importers; `onInstantiateTemplate` has no implementation.

### G. Multi-state behaviors — **4% built, and that is the story**

**Engine: complete. Authoring UI: nonexistent.** Verified by grep — `multiStateConfig` / `item.rules` / `alarmSource` appear in exactly three files (`types.ts` declares, `SymbolRenderer.tsx` reads, `useBindingResolver.ts`). **`PropertyInspector.tsx` is not among them.**

| # | Capability | Status | Evidence / gap |
|---|---|---|---|
| G1 | Add Multi-State (right-click) | ❌ | No context menu, no action |
| G2 | Configure Multi-State panel | ❌ | **No panel exists** |
| G3 | Multi-state on Value | 🟡 | Engine applies; unauthorable |
| G4 | Multi-state on Gauges | 🟡 | Engine applies; unauthorable |
| G5 | Multi-state on Text | 🟡 | Engine applies; unauthorable |
| G6 | Multi-state on Graphics/shapes/images | 🟡 | Engine applies; unauthorable |
| G7 | Multi-state on Asset Comparison Table | ❌ | Symbol absent |
| G8 | Multi-state on Bar Chart | ❌ | Symbol is a mock |
| G9 | Multi-state on Time Series Table | ❌ | Symbol absent |
| G10 | Own bound attribute as default trigger | ❌ | Engine supports it (`MultiStateConfig.slot`); no UI |
| G11 | **Alternate trigger attribute** | ❌ | Engine supports it (`VisualRule.slot`); no UI |
| G12 | Remove/uncouple trigger | ❌ | — |
| G13 | Default N states with colours | ❌ | — |
| G14 | Add a state (max-value threshold) | ❌ | Engine supports min/max ranges |
| G15 | Remove a state | ❌ | — |
| G16 | Edit thresholds per state | ❌ | — |
| G17 | Edit colour per state | ❌ | — |
| G18 | Blink per state | ❌ | **Engine + CSS both exist** (`.symbol-fx--blink`); no UI |
| G19 | **Bad-data / out-of-range state** `[TRAVERSE-DELTA]` **mandatory** | 🟡 | **Staleness only.** `isStale(metric.ts)` → grayscale + ⚠ badge. `LiveMetric.quality` (192=GOOD) is carried but **never rendered**. NE107 classification exists in `getNamurState()` and in `MultiStateSymbol.tsx` — which has **zero importers** |
| G20 | Thresholds inherited from asset limits | ❌ | `Asset` carries `loEngLimit`/`hiEngLimit`; **nothing copies them into `item.alarmLimits`** — limits are hand-typed |
| G21 | String / digital state evaluation | ✅ | `compare()` falls back to `String(v)===String(a)`; `getStatusIndicatorState` maps strings/booleans. **The one ✅ in this section** |
| G22 | Persists through asset context switching | ❌ | Unauthorable, so untestable |
| G23 | Persists inside collections | ❌ | Collections absent |

### H. Asset context switching

Works — but by **string substitution**, not a template model.

| # | Capability | Status | Evidence / gap |
|---|---|---|---|
| H1 | Switch Asset dropdown | ✅ | [DisplayViewer.tsx:322-337](src/frontend-ob/src/components/Designer/DisplayViewer.tsx#L322-L337); appears only when `hasAssetRelative` |
| H2 | **Auto-discover related assets** | 🟡 | `GET /api/assets?type=4` (all Devices) then filters by **string prefix of the parent path** ([:188-198](src/frontend-ob/src/components/Designer/DisplayViewer.tsx#L188-L198)). That is *same folder*, **not same template/type** — asset-model has no type model to query |
| H3 | Switching re-binds all symbols | ✅ | `resolvedItems` memo; `useBindingResolver` clears stale values on rebind |
| H4 | Attribute-driven text updates on switch | 🟡 | Values rebind; there is no asset-metadata-as-text binding |
| H5 | **Configure context-switching panel** | ❌ | No panel |
| H6 | Show assets of same type | ❌ | No type filter (H2) |
| H7 | Show search results (custom query) | ❌ | — |
| H8 | Show/hide asset paths | ❌ | — |
| H9 | Search Root criterion | ❌ | — |
| H10 | Return All Descendants | ❌ | **Server has no descendants query** — `/children` is one level; `/hierarchy` returns *ancestors* |
| H11 | Asset Type / Template filter | ❌ | No asset-type model exists |
| H12 | Requires a template/type model | 🟡 | **This is the blocker.** `asset_type` is a bare int enum (1..5); there is no type/template entity |
| H13 | Context carried through nav links | ✅ | `handleNav` → `params.set('asset', …)` |
| H14 | Context via URL parameter | ✅ | `?asset=`, `?assetRoot=` |

**Critical caveat:** the substitution mechanism requires the author to **hand-type a `{{element}}` token** into a binding path ([DisplayViewer.tsx:71](src/frontend-ob/src/components/Designer/DisplayViewer.tsx#L71) `substituteElement`). **No authoring UI inserts it.** So H1 works only for displays an expert hand-crafted.

### I. Collections — **0%**

**I1–I17: all ❌.** Nothing exists at any layer. Grep for `collection|criteria|repeat` across `Designer/` returns only CSS `grid-template-columns: repeat(...)` and SVG `repeatCount`.

**Blocked server-side.** I7–I10 (search root, descendants, asset type, **attribute-value filter with `>` `<` `=` `≠`**) require asset-model capabilities that **do not exist**: no attribute table, no comparison-operator filtering, no recursive descendants query, no asset-type model. Collections cannot be built as a pure frontend feature.

### J. Dynamic search criteria — **0%**

**J1–J7: all ❌.** No criteria model on `CanvasItem`. The nearest thing is `AlarmTable`'s hardcoded `sourceName.startsWith(item.alarmSource)` prefix filter — and `alarmSource` has no authoring UI. Same server-side blocker as §I.

### K. Time model — **5%**

**The display time model does not exist.** `DisplayViewer` renders a bar at the *top* with Home/Back/Fwd, breadcrumbs, tag-pick, trend, theme, asset select, auto-refresh, fullscreen. **There are no time controls on it.**

| # | Capability | Status | Evidence / gap |
|---|---|---|---|
| K1 | **Time bar** | ❌ | Does not exist |
| K2 | Start time field | ❌ | — |
| K3 | End time field | ❌ | — |
| K4 | Duration control + presets | 🟡 | **Only inside `TrendCore`** — 5 fixed presets (15m/1h/8h/1d/1w). Not a display-level concept |
| K5 | Now button | 🟡 | Only inside `TrendCore` |
| K6 | Shift back/forward arrows | 🟡 | Only inside `TrendCore` (half-window steps) |
| K7 | Revert display to saved time | ❌ | — |
| K8 | Live mode auto-update | ✅ | TrendCore 2s tick; MQTT push for symbols |
| K9 | Configurable refresh interval `[TRAVERSE-DELTA]` | 🟡 | The Off/10s/30s/1m control refetches the **display definition**, not the data. Live data cadence is fixed by MQTT push and is **not bounded** |
| K10 | **Relative time expressions** (`*`, `*-8h`, `t`, `y`) | ❌ | **No parser exists.** `utils/relativeTime.ts` is a *formatter* ("3m ago"). `utils/time.ts` is 6 lines of dayjs formatting. No grammar, no tokenizer |
| K11 | Absolute timestamps | ❌ | No time input anywhere |
| K12 | Time offsets with units | ❌ | — |
| K13 | Offsets valid alone | ❌ | — |
| K14 | Fractional offsets | ❌ | — |
| K15 | Validation + error messaging | ❌ | — |
| K16 | Future time ranges | ❌ | — |
| K17 | Per-symbol time context | ❌ | — |
| K18 | Time zone control | ❌ | **Zero occurrences of timezone/tz in the frontend.** Everything uses `toLocaleString()` (browser TZ) |
| K19 | Time range via URL params | ❌ | `/display/:id` reads only `?asset=`/`?assetRoot=` |

**Dead feature:** `NavigationLink.includeTimeRange` has an authoring checkbox ("Pass the current time range", [NavigationEditor.tsx:179](src/frontend-ob/src/components/Designer/NavigationEditor.tsx#L179)) that `handleNav()` **never reads**.

### L. Calculations / expressions — **0%**

**L1–L19: all ❌.** No calculations pane, no expression editor, no parser. **Verified by grep: `NCalc|Jint|ExpressionParser|evaluateExpression` returns zero files across the whole repo.**

Two further findings:
- `GET /analyses/types` ([analysis-service/Program.cs:331](src/services/analysis-service/Program.cs#L331)) advertises an `expression` type — it is a **hardcoded static literal**. It is documentation, not capability.
- The **analysis execution path is dead**: `POST /execute` produces to Kafka topics `traverse.analysis.executions` / `traverse.analysis.commands`, and **no Flink job consumes either** (grep across `src/flink` → 0 hits). Executions are written `pending` and stay pending forever.

**L19 (`[TRAVERSE-DELTA]`: complex logic belongs in Flink, not ad-hoc display calcs) is the recorded decision — see §4 for how this reshapes the feature.**

### M. Navigation, URLs, embedding

| # | Capability | Status | Evidence / gap |
|---|---|---|---|
| M1 | Add Navigation Link | ✅ | [NavigationEditor.tsx](src/frontend-ob/src/components/Designer/NavigationEditor.tsx), "Action" tab |
| M2 | Target another display | ✅ | Searchable picker → `targetDisplayId` |
| M3 | Target external URL | ✅ | `isSafeUrl()` — https or same-origin only, enforced at author **and** runtime |
| M4 | Carry time context | ❌ | Checkbox exists; **runtime ignores it** |
| M5 | Carry asset context | ✅ | `assetContextMode`: none / current-asset / as-root / explicit |
| M6 | Use current asset | ✅ | `resolveLinkAsset()` strips the metric off the symbol's binding |
| M7 | Text as hyperlink | 🟡 | Any symbol can carry a link; also `shape.hotspot`. No styled link rendering |
| M8 | Links inside collections | ❌ | Collections absent |
| M9 | URL params: start/end time | ❌ | — |
| M10 | URL params: asset context | ✅ | `?asset=`, `?assetRoot=` |
| M11 | **URL param: kiosk mode** | ❌ | **No `?kiosk=` param.** The viewer is chrome-free (rendered outside `AppShell`) and has a manual fullscreen button, but there is no URL-driven kiosk and no way to hide the viewer's own bar. **P0** |
| M12 | URL param: hide toolbar | ❌ | — |
| M13 | URL param: hide time bar | ❌ | No time bar to hide |
| M14 | URL param: hide sidebar | ❌ | — |
| M15 | URL param: time zone | ❌ | — |
| M16 | Ad-hoc display via URL | 🟡 | `/trend?tags=a,b,c&range=15m` gives an ad-hoc **trend**, not an ad-hoc display |
| M17 | Deep-linkable display URLs | ✅ | `/display/:id[?asset=]` |
| M18 | Programmatic open from external apps | 🟡 | Deep links work; no documented API |
| M19 | Breadcrumb navigation | ✅ | sessionStorage trail (`Crumb`/`TRAIL_KEY`) |
| M20 | **ISA-101 L1→L4 hierarchy** `[TRAVERSE-DELTA]` | 🟡 | `Display.Level` exists in the model and the launcher has L1–L4 filter chips — **but there is no UI anywhere to set `Level`**. The chips filter on a field nobody can populate. **P0** |

### N. Events / event frames

| # | Capability | Status | Evidence / gap |
|---|---|---|---|
| N1 | Events pane in the display | ❌ | None in `DisplayViewer` |
| N2 | Events scoped by time range + asset | ❌ | No display time range; alarm scoping is a `startsWith` prefix on `alarmSource`, **not wired to `?asset=`** |
| N3 | Severity colour coding | ✅ | `priorityColor()` → OBC alarm/warning/caution tokens |
| N4 | Edit event search criteria | ❌ | No UI writes `alarmSource` |
| N5 | **Events table symbol on canvas** | 🟡 | **`AlarmTable` is built but unplaceable** — not in `SymbolPalette`, not in `symbolLibraryService`, so it has no inspector tabs either. **P0, and it is a palette-registration away from working** |
| N6 | Configurable columns | ❌ | Hardcoded Time/Source/Priority/State, sliced to 100 rows |
| N7 | Event attributes as columns | ❌ | — |
| N8 | Related asset attributes as columns | ❌ | — |
| N9 | Event details view | ❌ | Exists in the standalone console only |
| N10 | Compare similar events | ❌ | — |
| N11 | Related events for an asset | ❌ | — |
| N12 | **ACK from the display** `[TRAVERSE-DELTA]` | ❌ | `AlarmTable` rows are read-only. **Full ISA-18.2 ACK lifecycle exists in the API and is unreachable from a designed display.** P0 |
| N13 | Annotation / comments | 🟡 | Ack/shelve comments exist in the **console** dialogs; no display annotations |
| N14 | Multi-state coloured by alarm state | 🟡 | `useSymbolAlarm()` gives any symbol with `alarmSource` a priority-coloured outline + blink-on-unacked — **but nothing authors `alarmSource`** |
| N15 | Severity/priority mapping | ✅ | CRITICAL/HIGH/MEDIUM → OBC alert tokens |
| N16 | Gantt-style event visualization | ❌ | — |
| N17 | Shelving/suppression from display `[TRAVERSE-DELTA]` | ❌ | Console only. (`AlarmTable` in fact *filters out* shelved/suppressed alarms) |
| N18 | **EEMUA-191 KPI symbols** `[TRAVERSE-DELTA]` | ❌ | KPIs exist as a **page** ([Analytics.tsx](src/frontend-ob/src/components/Analytics/Analytics.tsx)) — **with several hardcoded literal values** (`"14"`, `"1.2"`, `"3.1"` at :129-174). Not placeable as symbols |

**The alarm console is not reusable as a symbol.** [AlarmConsole.tsx](src/frontend-ob/src/components/AlarmConsole/AlarmConsole.tsx) is 981 LOC with no props: it reads `useAlarmStore` and context directly, imports page chrome CSS, and owns hotkeys and a `GridApi` ref. The canvas `AlarmTable` is a separate ~30-line reimplementation.

### O. Data search & asset browsing

| # | Capability | Status | Evidence / gap |
|---|---|---|---|
| O1 | Assets pane with hierarchy tree | ✅ | [AssetBrowser.tsx](src/frontend-ob/src/components/Designer/AssetBrowser.tsx) |
| O2 | Drill down | ✅ | Lazy `GET /assets/{id}/children` |
| O3 | Multiple databases/scopes | ❌ | — |
| O4 | Search pane | ✅ | `GET /assets?search=`, 2-char minimum |
| O5 | Search assets by name | ✅ | |
| O6 | Search attributes/measurements | ✅ | Measurements are assets (type 5) |
| O7 | Search raw tags/points | ✅ | Same endpoint |
| O8 | Search by description | 🟡 | Server `Contains` covers path+name; description not included |
| O9 | Wildcard `*` | ❌ | Substring `Contains` only; no glob handling client or server |
| O10 | Single-char wildcard `?` | ❌ | — |
| O11 | Scope/limit the search | 🟡 | `filterType` prop exists on `AssetBrowser` but **no caller ever passes it** — dead parameter |
| O12 | **Multi-select + drag as a group** | ❌ | No multi-select, no `draggable` |
| O13 | **Search results are drag sources** | ❌ | **Not draggable.** Binding is *select-symbol-then-click-tag* |
| O14 | Filter by metadata | ❌ | — |
| O15 | Copy data context | ❌ | — |
| O16 | **UNS-native browsing** `[TRAVERSE-DELTA]` | ✅ | Tree is `root.<site>.<area>.<unit>.<device>.<measurement>`; binding is path+role via `binding-resolver`, never a raw IoTDB path or MQTT topic |

### P. Units of measure — **the system does not exist**

| # | Capability | Status | Evidence / gap |
|---|---|---|---|
| P1 | UOM known per attribute | 🟡 | `assets.engineering_unit` **exists in the DB and in the `Asset` type — and is read by no code**. `TrendCore` comments admit "the UNS catalog carries no unit field today" |
| P2 | Switch UOM per item/symbol | ❌ | — |
| P3 | UOM dropdown in config | ❌ | It is a **free-text input** (`formatting.unit`, placeholder "PSI, °C, m³/h") |
| P4 | Conversion applied | ❌ | **No conversion code exists repo-wide** |
| P5 | Show/hide units | ✅ | `formatting.showUnit` |
| P6 | UOM respected consistently | ❌ | Trend units are **regex-guessed from the metric name** (`/press/i → 'PSI'`, `/temp/i → '°C'`) |

### Q. Keyboard shortcuts — **75%, the best-scoring section**

| # | Shortcut | Status |
|---|---|---|
| Q1 | Ctrl+C copy | ✅ |
| Q2 | Ctrl+V paste | ✅ |
| Q3 | **Ctrl+X cut** | ❌ **Not registered** |
| Q4 | Delete / Backspace | ✅ |
| Q5 | Arrow-key nudge | ✅ (+Shift ×10) |
| Q6 | Ctrl+click multi-select | ✅ |
| Q7 | Ctrl+A select all | ✅ |
| Q8 | **Shift+drag resize proportional** | ❌ Shift is a multi-select modifier only; resize ignores it |
| Q9 | Ctrl+Z undo | ✅ |
| Q10 | Ctrl+Y redo | ✅ (+Ctrl+Shift+Z) |
| Q11 | Ctrl+S save | ✅ |
| Q12 | Shift = 45° line snap | ❌ |

**Extras:** Ctrl+D duplicate, Ctrl+G/Ctrl+Shift+G group, Esc deselect, Space+drag pan, Ctrl+wheel zoom, Alt+drag snap-bypass. The toolbar's "Shortcuts" help text is accurate.

### R. Security, roles, sharing

RBAC is real. **ABAC is absent, and ownership is recorded but never enforced.**

| # | Capability | Status | Evidence / gap |
|---|---|---|---|
| R1 | Role: Administrator | ✅ | `roles.ts`, `17_traverse_auth_schema.sql` |
| R2 | Role: Publisher/Engineer | ✅ | `display.publish` policy gates publish/unpublish/revert |
| R3 | Role: Explorer/Operator | ✅ | `DisplayView` without `DisplayEdit` |
| R4 | Operator can locally modify in-session | ❌ | Viewer is strictly read-only |
| R5 | …changes don't persist `[TRAVERSE-DELTA]` | ❌ | `operator_views` **does not exist in the running DB** (see §7) |
| R6 | Role: Viewer | ✅ | |
| R7 | Service account | 🟡 | `X-Service-Key` exists — **and is a security bug**, see §8 |
| R8 | Roles on groups, not individuals | ❌ | Roles are per-user |
| R9 | **Display ownership** | ❌ | `owner_id` is **written and never read for authz**. Any token with `display.edit` can edit, delete, duplicate, or restore **anyone's** display |
| R10 | Share a display | ❌ | No sharing model |
| R11 | Share with read access | ❌ | — |
| R12 | Share with edit access | ❌ | — |
| R13 | Per-folder permissions | ❌ | No folders |
| R14 | Permission inheritance | ❌ | — |
| R15 | Private vs public displays | ❌ | No such concept |
| R16 | Least-privilege guidance | ✅ | Viewer is the default low-privilege role |
| R17 | **Asset-scoped authorization** `[TRAVERSE-DELTA]` | ❌ | **`binding.resolve` and `historian.view` are flat permissions held by Viewer.** Any authenticated user can resolve and trend **any tag in the plant**. No scope claim, no scope table, no per-asset predicate at any layer |
| R18 | Server-side enforcement | ✅ | Every .NET endpoint carries `.RequireAuthorization(...)`; RS256 JWT + JWKS |
| R19 | **Audit trail of display changes** `[TRAVERSE-DELTA]` | ❌ | audit-service consumes Kafka topic `traverse.cpa.audit-events`, which **nothing produces to**; display-service publishes to a Redis channel `display-events` that **nothing consumes**. audit-service has **no query endpoint at all** — only `POST /verify` |
| R20 | **Display version history + rollback** `[TRAVERSE-DELTA]` | 🟡 | `display_versions` is real and append-only with `created_by`/`change_note`. **But `POST /revert` only reverts to the *published* version — there is no "restore version N", no diff endpoint, and no comments** |

### S. Administration

| # | Capability | Status |
|---|---|---|
| S1 | Admin console | 🟡 User/role management exists in auth-service (incl. bulk import); no display-admin console |
| S2 | Manage user access levels | ✅ `PUT /roles/:role/permissions`, full user CRUD |
| S3 | Manage data source config | ❌ |
| S4 | Default symbol configs across displays | ❌ |
| S5 | Bulk display management | ❌ |
| S6 | Usage monitoring | ❌ No `last_accessed` tracking |
| S7 | Recycle-bin administration / purge | 🟡 Restore exists; no purge |
| S8 | Calculation throttling | ❌ N/A — no calculations |
| S9 | Health/diagnostics | ✅ `/health` + `/metrics` on every service; Prometheus/Grafana |

### T. Extensibility

**T1–T14: ❌** except **T12 (CSP-compatible) ✅** and **T2 🟡** (template-service `element_templates` carries a JSON definition + icon, which is the seed of a registry). `CustomSymbols.tsx` is a hardcoded `switch` with a `CUSTOM_SYMBOL_TYPES` set — there is no registration model, no lifecycle hooks, no custom config pane, no `supportsCollections` declaration, and no upload backend.

### U. Runtime, performance, platform

| # | Capability | Status | Evidence / gap |
|---|---|---|---|
| U1 | Modern browsers, no install | ✅ | React 18 + Vite |
| U2 | Mobile / tablet | ❌ | One CSS breakpoint hides the sidebar. Canvas and viewer are **mouse-only** (`onMouseDown`, `ctrlKey`/`shiftKey`) |
| U3 | Responsive / touch gestures | ❌ | — |
| U4 | **Kiosk mode** | 🟡 | Viewer is chrome-free and has a manual fullscreen button; **no URL-driven kiosk, no way to hide the viewer bar** |
| U5 | Live auto-refresh | ✅ | MQTT push + definition refetch |
| U6 | Many symbols on one display | 🟡 | Subscription-scoping is the only mitigation (`EMPTY_METRICS` for unbound slots); **symbol re-render is not throttled** — every DDATA writes `s.metrics` and re-renders immediately |
| U7 | **Bounded update rate** `[TRAVERSE-DELTA]` | 🟡 | Trend has a 2s tick and a 2000-sample ring buffer. **Symbol rendering has no cap** |
| U8 | **Snapshot-on-open** `[TRAVERSE-DELTA]` | ✅ | `loadAllSnapshots()` → `GET /api/hist/snapshot` (Redis), on connect **and reconnect** ([mqttStore.ts:307](src/frontend-ob/src/store/mqttStore.ts#L307)) |
| U9 | **Decimated queries sized to plot width** `[TRAVERSE-DELTA]` | 🟡 | Server-side decimation is real (`width` clamped 10–2000, IoTDB `GROUP BY` interval). **But `TrendCore` passes a hardcoded `500`, not the measured plot width** |
| U10 | Scales to many viewers | 🟡 | Untested; the blanket MQTT subscription (below) is a scaling risk |
| U11 | **Graceful degradation** `[TRAVERSE-DELTA]` | ✅ | `isStale()` → grayscale + ⚠ badge, never a stale-looking live value |

### V. Explicitly out of scope

**V1–V6: ⛔ N/A**, all confirmed consistent with the code (no ProcessBook migration, no DataLink, no AD auth, no PI Web API coupling, no server-side rendering — thumbnails are client-side per the recorded decision, no AngularJS).

### W. Traverse-only requirements

| # | Requirement | Status | Evidence / gap |
|---|---|---|---|
| W1 | **ISA-101 controlled displays** (versioned, MOC-gated, audited deploy) | 🟡 | Versioning + publish/unpublish/revert + `display.publish` permission are **real**. **But the "audited" half is missing** — there is no audit trail (R19), and revert cannot target an arbitrary version |
| W2 | **`operator_views`** (personal views) | ❌ | **The tables `displays.personal_views` and `displays.view_favorites` exist in `13_personal_views_schema.sql` with ZERO code and ZERO endpoints.** `DisplayDbContext` declares only `Displays` and `DisplayVersions`. Orphaned |
| W3 | **Config-only persistence** (automated invariant) | ✅ | **Enforced in three layers**: DB trigger `displays.validate_no_process_values()` ([11_traverse_displays_schema.sql:78-92](database/scripts/11_traverse_displays_schema.sql#L78-L92)), a second trigger for personal views, and an app check ([display-service/Program.cs:310](src/services/display-service/Program.cs#L310)). **The single best-implemented requirement in the repo.** (One bug — see §8.3) |
| W4 | **Quality-on-open** (NE107/ISA-18.2 on every reopen) | 🟡 | **Staleness only.** `LiveMetric.quality` is carried but never rendered; the NE107 component (`MultiStateSymbol.tsx`) has zero importers |
| W5 | **UNS binding** (path+role → Sparkplug/IoTDB/SignalR) | ✅ | `binding-resolver` `PathResolver.cs` resolves all three roles. (Two dead URLs — §8.1) |
| W6 | **Contextual namespace** end-to-end | ✅ | `asset_type` 1..5 = Site/Area/Unit/Device/Measurement; used in the tree, the resolver, and IoTDB paths |
| W7 | **HPHMI palette** | ✅ | OpenBridge tokens, `data-obc-theme` day/dusk/night/bright, no raw hex in symbol renderers |
| W8 | **ISA-5.1 coverage** | 🟡 | Categories are labelled ISA-5.1; coverage is not formally verified |
| W9 | **CQRS discipline** (never read current values from the historian) | ✅ | Live = MQTT/Sparkplug + Redis snapshot; history = IoTDB. The paths are distinct in `PathResolver` and `mqttStore` |
| W10 | **Per-open-screen MQTT subscription** | ❌ | **Effectively broken.** `subscribeScreen`/`unsubscribeScreen` exist and are called per-binding — **but `connect()` already blanket-subscribes `spBv1.0/+/DDATA/+/#`** ([mqttStore.ts:239](src/frontend-ob/src/store/mqttStore.ts#L239)), a full wildcard over every site/edge/device. The per-screen calls are redundant; **no traffic is actually scoped** |

---

## 4. Feasibility analysis

The question that matters is not "what's missing" but **"what does it cost *us*, given our stack?"** Every gap falls into one of four classes.

### Class 1 — Trivial unlock (the engine already exists; only UI/wiring is missing)

**These are the highest-ROI items in the entire backlog. Days of work, and they move whole sections.**

| Gap | Why it's trivial | Unlocks |
|---|---|---|
| **Multi-state authoring UI** (G1–G18) | `ruleEngine.ts` + `SymbolFxWrap` are complete and universal. Needs **one new `PropertyInspector` tab** writing `item.multiStateConfig` / `item.rules` | **19 rows in §G**, plus C22, E2.9, E3.7, F8, N14 |
| **`alarm.table` palette entry** (N5) | The component is built and live-bound. Needs a `SymbolPalette` entry + a `symbolLibraryService` definition | N5, and makes N6/N12 reachable |
| **`alarmSource` inspector field** (N4, N14) | Drives outlines, blink, annunciators, `AlarmTable`. Nothing writes it today | N4, N14, and the alarm-scoping story |
| **Add missing slots to `KNOWN_SLOTS`** (D9, D10) | `values`, `x`, `y`, `source`, `alarms`, `asset` are declared on symbols but unresolvable | Makes bar/XY/pie bindable at all — a prerequisite for fixing them |
| **`bgColor` UI control** (B32) | Value is loaded and saved; only `setBgColor` has no caller | B32 |
| **Ctrl+X cut** (B7, Q3) | Copy + delete both exist | B7, Q3 |
| **Distribute + z-order step** (B26, B27) | Align and front/back already exist; same code shape | B26, B27 |
| **`includeTimeRange` runtime read** (M4) | The authoring checkbox exists; `handleNav()` ignores it | M4 (once §K lands) |
| **Shift-to-constrain resize** (B23, Q8) | The resize branch simply never reads `e.shiftKey` | B23, Q8 |
| **`Display.Level` setter** (M20) | The field and the launcher filter chips both exist; nothing can set it | M20 (P0) |
| **Pass measured plot width to `fetchTrend`** (U9) | Server decimation already works; the client hardcodes `500` | U9 |

> **Class 1 alone would take P0 completion from 42% to roughly 60%.**

### Class 2 — Straightforward (normal feature work; no architectural conflict)

| Gap | Feasibility note |
|---|---|
| **Time model** (§K, 19 rows) | The biggest Class-2 item. Needs: a relative-time **parser** (`*`, `*-8h`, `t`, `y`), a `TimeBar` component, a display-level time context (Zustand), and per-symbol time override. `TrendCore` already has duration/step/Now logic to lift out. **No backend change needed** — historian-bff `/trend` already takes `start`/`end`. **M** |
| **Right-click context menu** (B30) | The alarm console already has one to copy. **S** |
| **Image / SVG symbol** (C19, C21, F19) | Frontend is easy; **needs a new backend** (blob storage + upload endpoint — there is none, §10). **M** |
| **Real Table symbol** (E4, D6) | Straightforward *except* summary columns, which are Class 3. **M** |
| **Trend config depth** (E1.2–E1.4, E1.8, E1.17, E1.20, E1.22) | Per-trace colour/style/markers, manual scale, clickable legend, stepped plot. All are echarts options already within reach; just not exposed. **S–M** |
| **Folders** (A16–A24) | New table + CRUD + a tree UI. `hierarchy_path` gives a migration path. **M** |
| **Favorites / Recent server-side** (A11–A13) | **The `view_favorites` table already exists** — it needs endpoints, not a schema. **S** |
| **`operator_views`** (W2, R5) | **The `personal_views` table already exists with its config-only trigger** — it needs a `DbSet` + endpoints. **S** |
| **Kiosk URL params** (M11–M14) | Read `?kiosk=1` and conditionally hide the viewer bar. **S** |
| **Line dash/dotted, polygon, text colour** (C5, C13, C16) | Renderer fixes. Polygon is *half-done* — the import path already emits it. **S** |
| **ACK from display** (N12) | The API exists (`POST /{id}/acknowledge`). Wire a button into `AlarmTable`. **S** |
| **EEMUA KPI symbols** (N18) | The KPI API exists (`GET /api/v1/analytics/kpi`); the Analytics *page* exists (with some hardcoded literals to fix). Wrap as symbols. **M** |
| **Drag tag → canvas** (B18, B19, O12, O13) | Add `draggable` to `AssetBrowser` nodes and a data-item branch to `handleDrop`. **S–M** |

### Class 3 — Backend-first (the frontend is *blocked* until a service/schema lands)

**Do not start these in the UI. They will fail.**

| Gap | The blocker | What must land first |
|---|---|---|
| **Collections** (§I, 17 rows, all P0) | asset-model has **no attribute table**, **no comparison-operator filtering**, **no descendants query**, **no asset-type model** | An attribute schema + `GET /assets/search` with `{root, descendants, type, attributeFilters[{name, op, value}]}`. **L** |
| **Dynamic search criteria** (§J, 7 rows) | Same as above | Same endpoint. **S** once collections' backend lands |
| **Asset Comparison Table** (E5, D7) | Same as above | Same endpoint. **M** |
| **Table summary columns** (E4.5–E4.7, E4.14) | historian-bff has **no aggregate endpoint**, and `/trend`'s aggregation is **hardcoded for alarm columns** (`avg(severity), last_value(state)`) — it cannot return min/max/avg of a numeric process tag | `GET /summary?series&start&end&fns=min,max,avg,total`. **M** |
| **Asset context switching, properly** (H2, H6, H11, H12) | "Related assets" is a **path-prefix hack**, not a type query. There is no asset-type model | An asset-type/template entity + `GET /assets?ofSameTypeAs={id}`. **M** |
| **UOM** (§P) | `engineering_unit` is stored but there is **no UOM class/conversion model** and nothing reads it | A UOM table + conversion service, then read it in the resolver and symbols. **M** |
| **Asset-scoped authz** (R17) | No scope claim, no scope table, **at any layer** | A scope model in auth + enforcement in binding-resolver and historian-bff. **L** |
| **Display ownership + sharing + ACL** (R9–R15) | `owner_id` is written and never read | Ownership checks in every display endpoint + an ACL table. **M** |
| **Audit trail** (R19, W1) | audit-service consumes a topic **nobody produces to**; it has **no query endpoint** | Produce `traverse.cpa.audit-events` from display-service (it already publishes to a Redis channel nobody reads — redirect it), add `GET /audit`. **S–M** |

### Class 4 — Architecturally constrained (a Traverse decision reshapes the feature; do not copy PI Vision)

| Gap | The constraint | What we should build instead |
|---|---|---|
| **Calculations** (§L, 19 rows) | **Recorded decision: Flink-only compute** (`CLAUDE.md`, and checklist **L19 itself** says complex reusable logic belongs in the analysis engine). PI Vision's model — an ad-hoc expression evaluated per-client per-display — **conflicts with CQRS discipline and with Flink-only compute** | **Do not build a client-side expression engine.** Build: (a) a *calculation registry* in analysis-service where an expression is a **named, versioned artifact**, (b) a Flink job that actually consumes `traverse.analysis.commands` (**today nothing does — the execution path is dead**), (c) publish results back onto the UNS as a derived measurement, and (d) let the designer bind to it **like any other tag**. This gives L11 (calc usable on any symbol) for free, satisfies L12/L13, and honours L19. **Larger than PI Vision's version, but it is the only version consistent with our architecture.** **L** |
| **Custom symbol framework** (§T) | `[TRAVERSE-DELTA]`: web components / SVG registration, **not AngularJS** | A manifest-driven SVG/web-component registry, resolved against `custom-elements.json` conventions. Needs the upload backend from Class 2 first. **L** |
| **Server-rendered thumbnails** (V5) | `[N/A]` — recorded decision is client-side at save | **Already done correctly.** Note: it currently fires on *publish*, not save — a one-line decision to confirm |
| **Multi-state colour semantics** (G13, G17, G19) | `[TRAVERSE-DELTA]`: must anchor to **NE107 + ISA-18.2**, with saturated colour **reserved for abnormal** per ISA-101 | When building the Class-1 multi-state UI, **do not ship a free colour picker**. Ship a *state palette* constrained to OpenBridge alert tokens, with a **mandatory bad-data/stale state** (G19). The engine and `getNamurState()` already exist; `MultiStateSymbol.tsx` (currently dead code) is the NE107 component to revive |
| **Per-open-screen MQTT** (W10, U7) | `[TRAVERSE-DELTA]`: mandatory subscription scoping | **Delete the blanket `spBv1.0/+/DDATA/+/#` subscription** in `connect()`. The per-screen machinery already exists and is correct — it is being defeated by the wildcard. **S, and it is a genuine scaling defect** |

---

## 5. Gap backlog (P0 → P2)

Phase mapping follows `MIGRATION_LOG.md`: **P2**=designer MVP, **P3**=templates/multi-state/personal views, **P4**=analysis, **P5**=hardening.

### P0 — blocks a credible HMI-builder claim

| Gap | Class | Size | Phase | Depends on |
|---|---|---|---|---|
| **Multi-state authoring UI** (G1–G18) | 1 | **S** | P3 | — |
| **NE107 bad-data state, mandatory** (G19, W4) | 1/4 | S | P3 | multi-state UI |
| **`alarm.table` palette entry + `alarmSource` field** (N5, N4, N14) | 1 | **S** | P2 | — |
| **`KNOWN_SLOTS` completion** (D9, D10 prerequisite) | 1 | **S** | P2 | — |
| **Delete blanket MQTT subscription** (W10, U7) | 4 | **S** | P5 | — |
| **`Display.Level` setter** (M20) | 1 | **S** | P2 | — |
| **Kiosk URL param** (M11) | 2 | **S** | P2 | — |
| **Ctrl+X, distribute, z-order step, Shift-resize, bgColor** (B7, B23, B26, B27, B32, Q3, Q8) | 1 | **S** | P2 | — |
| **Right-click context menu** (B30) | 2 | S | P2 | — |
| **Time model + relative-time parser** (K1–K12, K15) | 2 | **M** | P2 | — |
| **Drag tag → canvas / onto symbol** (B18, B19, O12, O13) | 2 | M | P2 | — |
| **Image + SVG symbols** (C19, C21) | 2 | M | P2 | upload backend |
| **Upload backend (blob store)** (§10) | 3 | M | P2 | — |
| **Real Table symbol** (D6, E4.1–E4.4, E4.9, E4.15) | 2 | M | P2 | — |
| **ACK from display** (N12) | 2 | S | P2 | `alarm.table` |
| **Bar chart + XY real data** (D9, D10, E6.1, E7.1) | 2 | M | P2 | `KNOWN_SLOTS` |
| **Text colour, polygon, line dash** (C5, C13, C16) | 2 | S | P2 | — |
| **Asset-model search endpoint** (attrs, descendants, type, operators) | 3 | **L** | P3 | — |
| **Collections** (I1–I17) | 3 | **L** | P3 | asset-model search |
| **Asset context: real type-based discovery** (H2, H6, H11, H12) | 3 | M | P3 | asset-type model |
| **Configure-context-switching panel + `{{element}}` authoring** (H5) | 2 | M | P3 | — |
| **Asset Comparison Table** (D7, E5) | 3 | M | P3 | asset-model search |
| **Dynamic search criteria** (J1, J2, J5) | 3 | S | P3 | asset-model search |
| **Display ownership enforcement** (R9, R15) | 3 | M | P5 | — |
| **historian-bff summary endpoint** (E4.5–E4.7, E4.14) | 3 | M | P4 | — |
| **Events pane in display** (N1, N2) | 2 | M | P2 | time model |
| **Home page: search + sort + folders** (A3, A6, A14–A17) | 2 | M | P2 | folder schema |
| **Show/hide units, UOM foundation** (P5 done; P1) | 3 | M | P4 | UOM model |

### P1 — required for full parity

Trend config depth (E1.2–E1.4, E1.6, E1.8–E1.10, E1.17–E1.22, E1.24, E1.25) · Folders full CRUD + permissions (A18–A24, R13, R14) · Favorites/Recent/My-Displays server-side (A11–A13) · `operator_views` endpoints (W2, R5) · Audit trail (R19, W1) · Asset-scoped authz (R17) · Display sharing + ACL (R10–R12) · Version restore-to-N + diff + comments (R20) · Symbol type switching (B34) · Calculations-via-Flink (§L) · Custom symbol framework (§T) · UOM conversion (P2–P4, P6) · Time Series Table (E8) · Bar-chart config (E6.2–E6.10) · XY config (E7.2–E7.5) · Multi-state on bar/TST (G8, G9) · Threshold inheritance from asset limits (G20) · Event details, related events, annotations (N9, N11, N13) · Shelving from display (N17) · EEMUA KPI symbols (N18) · Mobile/tablet (U2) · Nav links in collections (M8) · URL time params (M9) · Keyword/tag labels (A8, A9) · Wildcard search (O9) · Symbol re-render throttling (U6, U7).

### P2 — differentiators

Trace grouping, regression line, cursor retention (E1.11, E1.12, E1.14) · Table transpose + sparkline column (E4.8, E4.16) · Future data (D12) · Layers beyond the current panel (B38 extras) · Format copying (B35) · Timezone control (K18) · Ad-hoc display via URL (M16) · Gantt events (N16) · Touch mode (A33, U3) · Usage monitoring (S6) · Recycle-bin purge (S7) · Custom tool panes (T10) · Corner cases in C7/C20/O10/O14/O15.

---

## 6. Critical path

**In dependency order — this is the shortest route to a defensible "PI-Vision-class HMI builder" claim:**

1. **Multi-state authoring UI.** *(Class 1, S.)* Highest ROI in the repo. The engine is done; one inspector tab unlocks §G and the "visual alarm" story that is PI Vision's entire value proposition. **Nothing else competes with this.**
2. **Make the built-but-unreachable things reachable.** *(Class 1, S.)* `alarm.table` palette entry, `alarmSource` field, `KNOWN_SLOTS` completion, `Display.Level` setter, `bgColor` control, Ctrl+X, distribute, z-order step. A single sprint of wiring recovers ~18 points of P0.
3. **The time model.** *(Class 2, M.)* Nothing in §E1 (trend config), §K, §N (event scoping), or §M4 can be finished without a display time context. It is the second-largest structural hole and it has **no backend blocker** — start immediately.
4. **The asset-model search endpoint.** *(Class 3, L.)* Attributes, descendants, type, comparison operators. This one endpoint is the sole blocker for **Collections (17 P0 rows), Asset Comparison Table, Dynamic Search Criteria, and proper asset context switching** — ~30 P0 rows behind one piece of backend work. **Nothing in that cluster can start until it lands.**
5. **Collections + real context switching.** *(Class 3, L.)* The payoff for step 4, and the last headline PI Vision capability we lack.
6. **Fix the blanket MQTT subscription.** *(Class 4, S.)* A genuine scaling defect, and a violation of a recorded decision (W10). Cheap.

**Explicitly *not* on the critical path:** calculations (§L) — reframe as Flink-registered derived tags per L19, and schedule in Phase 4. Do not build a client-side expression engine.

---

## 7. Doc-vs-code discrepancies

1. **`database/migrations/phase0/*.sql` is dead.** [docker-compose.yml:51](infra/docker/docker-compose.yml#L51) mounts **only** `database/scripts/`. phase0 is applied by nothing except a manual script, and it *conflicts* with the live schema (unqualified `display_definitions` vs. real `displays.display_definitions`). **`operator_views`, `display_comments`, `tags TEXT[]`, `checksum`, `is_major_version`, `attribute_instances`, `attribute_templates`, `resource_permissions`, `uom_classes/uom_units`, `categories`, `user_preferences` do not exist in the running system.** Any audit that trusts phase0 will badly overcount.
2. **`displays.personal_views` and `displays.view_favorites` are orphan tables** — created by `13_personal_views_schema.sql`, but `DisplayDbContext` declares only `Displays` and `DisplayVersions`, and **zero endpoints touch them**. W2 is documented as a recorded decision and is **not implemented**.
3. **`GET /analyses/types` advertises capability that does not exist.** The response is a hardcoded static literal listing `rollup`, `threshold`, `rate_of_change`, `expression`. **No Flink job consumes `traverse.analysis.commands` or `traverse.analysis.executions`** (grep: 0 hits), so nothing it advertises can execute.
4. **historian-bff `/raw`**: the code comment and `BuildRawSql` say `maxCount` up to 10 000; **the code clamps to 1..500**.
5. **`TrendCore` unit handling contradicts the UNS claim.** Units are **regex-guessed from the metric name**; the code comment concedes "the UNS catalog carries no unit field today" — while `assets.engineering_unit` exists in the schema and is read by nothing.
6. **`MIGRATION_LOG.md` Phase-5 (decommission/hardening) is "partial" and should stay that way** — the blanket MQTT subscription (W10), the absent audit trail (R19), and the absent asset scoping (R17) are all Phase-5 items still open.
7. **`TemplatePalette.tsx` and `MultiStateSymbol.tsx` are dead code** (zero importers), and `alarm.table` is an implemented-but-unregistered symbol. A file-count-based reading of the repo overstates what ships.

---

## 8. Bugs found during the audit

Not parity items, but they should not be lost.

1. **binding-resolver hands clients two dead URLs.**
   - **SignalR:** `appsettings.json` sets `Services:SignalRHub = http://ams-api:5000/hubs/alarm`. The hub is actually mapped at **`/hubs/alarms`** ([AMS.Api/Program.cs:424](src/backend/AMS.Api/Program.cs#L424)), and compose points `Services__AmsApi` at port **8000** but **never overrides `Services__SignalRHub`**. Every alarm binding therefore returns a URL with the **wrong port and a singular path**.
   - **Alarm API:** [PathResolver.cs:236](src/services/binding-resolver/Services/PathResolver.cs#L236) emits `{amsApi}/api/alarms?source=...`. The real route is `/api/v1/alarms/active?sourceNameContains=`.
2. **Alarm `unshelve` has no endpoint.** The domain method exists ([ActiveAlarm.cs:252](src/backend/AMS.Domain/Alarms/ActiveAlarm.cs#L252)), the permission is seeded, and the policy is registered ([AMS.Api/Program.cs:291](src/backend/AMS.Api/Program.cs#L291)) — **but there is no controller action**. A shelved alarm can only leave the shelf via the SQL auto-expiry job. ISA-18.2 compliance gap.
3. **Config-only invariant returns 500 instead of 400.** The app check ([display-service/Program.cs:310-312](src/services/display-service/Program.cs#L310-L312)) tests only `currentValue` and `processValue`; the DB trigger also blocks `liveValue` and `realTimeValue`. A snapshot containing `liveValue` passes the 400 check and then dies as an **unhandled Postgres exception**.
4. **SQL injection surface in historian-bff.** `series` and `measurements` are **string-interpolated straight into IoTDB SQL** ([IoTDbClient.cs:54, :71](src/services/historian-bff/IoTDbClient.cs#L54)).
5. **`X-Service-Key` mints an unscoped superuser.** A matching header produces a principal holding **every permission in `Perms.All`** ([_shared/TraverseAuth.cs:171-187](src/services/_shared/TraverseAuth.cs#L171-L187)), from a **single shared static secret defaulting to `traverse-internal-dev-key`**. Anyone who can reach a service port with that key is a full admin. Separately, **display-service does not use `TraverseAuth` at all** — it hand-rolls its JWT setup, diverging from the other seven services.
6. **historian-bff `/snapshot` does a Redis keyspace scan per request** (`server.Keys(pattern)`) — an O(keyspace) operation on the hot open-display path.
7. **Unreachable renderer branches.** [SymbolRenderer.tsx:810](src/frontend-ob/src/components/Designer/SymbolRenderer.tsx#L810) routes `alarm.beacon|horn|banner|summary` to `AlarmAnnunciator` *before* `renderInner()`, so the corresponding cases in `CustomSymbols.tsx:293-341` are dead code.
8. **`pdixImport.ts` emits four types with no renderer** (`shape.polygon`, `ind.radial`, `ind.bar`, `ind.vbar`) → **imported PI Vision displays silently produce `❓` boxes**. The importer is the front door for migration; this is worse than it looks.
9. **`AssetBrowser.filterType` is a dead parameter** — declared and used internally, but no caller ever passes it.
10. **`Analytics.tsx` KPI tiles contain hardcoded literals** (`"14"`, `"1.2"`, `"3.1"` at :129-174) presented as live values.

---

## Appendix — audit method

Three parallel code sweeps: (1) `src/frontend-ob/src/components/Designer/` and its imports; (2) the runtime viewer, trends, home surfaces, and alarm/event UI; (3) `src/services/*`, `src/backend/AMS.Api`, `src/flink`, and `database/scripts` + `database/migrations`. `src/xmlgraphics-batik-main ScreeN Import/` was excluded as the retired reference app.

Load-bearing claims were re-verified by targeted grep before publication: the multi-state authoring gap (`multiStateConfig|item.rules|alarmSource` → 3 files, `PropertyInspector.tsx` **not** among them); the absence of any expression engine or collections (`NCalc|Jint|ExpressionParser|evaluateExpression|convertToCollection|supportsCollections` → **0 files**); the dead phase0 schema (compose initdb mount → `database/scripts` only); and `alarm.table`'s absence from `SymbolPalette.tsx`.
