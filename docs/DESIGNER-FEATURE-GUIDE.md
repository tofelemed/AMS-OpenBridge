# HMI Designer — Feature Guide

A plain-language guide to **every feature actually built** into the Traverse HMI Designer, for reviewers, operators, and new team members who want to open the app and confirm each feature works by hand.

Everything below was verified against the code (not the parity checklist). Where a symbol or feature only *looks* done but is a stub, mock, or backend-only endpoint with no UI, it is flagged honestly — see **Partially implemented** notes and the **Known gaps** section at the end.

> **Reading tip:** each feature entry ends with a **How to test it manually** step you can run in the live app. Example tags come from the built-in 2-site simulator plant (`houston/crude1/*`, `dallas/blend1/*`).

---

## 1. What the Designer is

The HMI Designer is a browser-based, drag-and-drop editor for building **operator displays** (mimics/schematics) for a process plant. You place symbols (gauges, valves, trends, tables, alarms…) on a canvas, bind them to plant tags through the UNS (Unified Namespace), and publish a versioned display that operators open at runtime with live values. It follows ISA-101 / ISA-18.2 / NAMUR NE107 conventions — colour is reserved for abnormal states, displays are change-managed artifacts, and no live values are ever stored in a saved display (config-only).

Two surfaces:
- **Designer** (`/designer`, `/designer/:id`) — authoring, for Engineers/Admins.
- **Runtime viewer** (`/display/:id`) and the **operator launcher** (`/displays`) — read-only live displays, for everyone.

---

## 2. How to launch it

| Environment | URL |
|---|---|
| Local dev (Vite) | `http://localhost:5174` |
| Docker stack (nginx) | `http://localhost:3000` |

Routes (`src/frontend-ob/src/App.tsx`):

| Route | Screen | Permission |
|---|---|---|
| `/login` | Login | — |
| `/designer` | Designer home / display list | `display.edit` |
| `/designer/:id` | **Canvas editor** (full-screen) | `display.edit` |
| `/designer/import` | Import a PI Vision `.pdix` | `display.edit` |
| `/displays` | Operator launcher (published displays) | `display.view` |
| `/display/:id` | **Runtime viewer** (chrome-free) | `display.view` |

Steps:
1. Open the URL above → you land on `/login`.
2. Sign in (default bootstrap admin is `admin` / `ChangeMe123!` on the compose stack). Login is `POST /api/auth/login`; the token is held in memory, refresh is an httpOnly cookie.
3. Click **HMI Designer** in the sidebar (or go to `/designer`).
4. Click **+ New Display**, or open an existing card → the canvas editor opens at `/designer/:id`.

> Login is required for every screen — the runtime viewer is **not** anonymous (`RequireAuth` redirects to `/login`; `RequirePermission` blocks the wrong role). — `App.tsx:581-617`, `authStore.ts:102`.

---

## 3. Roles — who can do what

Roles come from auth-service and are enforced by the Display service policies (`display.view` / `display.edit` / `display.publish`, `display-service/Program.cs:72-74`) and mirrored in the UI (`authStore.hasPermission`).

| Role | View runtime displays | Create / edit in Designer | Publish / unpublish / revert |
|---|---|---|---|
| **Admin** | ✅ | ✅ | ✅ |
| **Engineer** | ✅ | ✅ | ✅ |
| **Operator** | ✅ | ❌ | ❌ |
| **Viewer** | ✅ | ❌ | ❌ |

*(Seed: `src/services/auth-service/database/schema.sql:131-162`.)* Ownership is also enforced server-side: a non-owner, non-Admin cannot edit someone else's display even with `display.edit` (returns 403).

---

## 4. Table of contents

- [5. Canvas & editing](#5-canvas--editing)
- [6. Static elements](#6-static-elements-text-shapes-images)
- [7. Dynamic symbols (data-bound)](#7-dynamic-symbols-data-bound)
- [8. Data binding](#8-data-binding)
- [9. Multi-state & visual alarms](#9-multi-state--visual-alarms)
- [10. Data fidelity — units & quality](#10-data-fidelity--units--quality)
- [11. Time](#11-time)
- [12. Navigation](#12-navigation)
- [13. Alarms & events in a display](#13-alarms--events-in-a-display)
- [14. Saving, versioning & management](#14-saving-versioning--management)
- [15. Custom symbols](#15-custom-symbols)
- [16. Import (PI Vision .pdix)](#16-import-pi-vision-pdix)
- [17. Quick 15-minute smoke-test checklist](#17-quick-15-minute-smoke-test-checklist)
- [18. Known gaps / not yet built](#18-known-gaps--not-yet-built)

---

## 5. Canvas & editing

All handlers live in `src/frontend-ob/src/components/Designer/` — `DisplayDesigner.tsx` (DD), `DesignerCanvas.tsx` (DC), `DesignerToolbar.tsx` (DT), `LayersPanel.tsx` (LP), `ContextMenu.tsx` (CM).

### Design ↔ Preview mode

**What it is:** A toggle that flips the canvas between editing (design) and a live preview.

**Why it's useful:** Build with static placeholders, then flip to Preview to see the symbols pull real values before you publish.

**How to use it:** Click **Design** / **Preview** in the top document bar.

**Where it lives (code):** `DisplayDesigner.tsx:132` (`setMode`), toolbar buttons `DesignerToolbar.tsx:150-160`. Side panels hide in Preview (`DD:699,785`).

**How to test it manually:** Place a Numeric Readout bound to `houston/crude1/pump101.discharge_press`. In **Design** it shows `{discharge_press}`; switch to **Preview** — within ~1 s it shows a live number.

---

### Grid + snap-to-grid (with Alt bypass)

**What it is:** A background grid; dragged items snap to it. Hold **Alt** to move freely.

**Why it's useful:** Fast, tidy alignment without fiddling.

**How to use it:** Toggle **Grid** and **Snap** checkboxes in the toolbar. Drag an item — it jumps to grid points. Hold **Alt** while dragging to bypass.

**Where it lives (code):** `DesignerCanvas.tsx:36` (`snap()`), applied at `DC:224` with `snapEnabled && !e.altKey`; grid render `DC:365`; toolbar `DT:333-346`. Grid size defaults to 10 px.

**How to test it manually:** Enable Snap, drag a shape — it lands on grid multiples of 10. Hold Alt and drag — it moves pixel-by-pixel.

---

### Smart alignment guides

**What it is:** Pink guide lines that appear while dragging when an item lines up with another's edge or centre.

**Why it's useful:** Align symbols to each other, not just the grid.

**How to use it:** Just drag near another symbol; the guide snaps you into alignment (tolerance 6 canvas units). Suppressed by Alt or by unchecking Snap.

**Where it lives (code):** `DesignerCanvas.tsx:49-97` (`computeSmartSnap`), guides at `DC:368-377`.

**How to test it manually:** Place two gauges; drag the second so its centre nears the first's — a guide line appears and it snaps aligned.

---

### Select, multi-select, marquee, select-all

**What it is:** Click to select; Ctrl/Shift-click to add; drag a rubber-band box on empty canvas to select many; Ctrl+A for all.

**How to use it:** Click a symbol (handles appear). Ctrl-click another to add it. Drag on blank canvas to lasso. Press **Ctrl+A**.

**Where it lives (code):** `DC:178` (`itemMouseDown`), `DC:185`→`DD:523` (`toggleSelect`), marquee `DC:209,273-280`, select-all `DD:553`.

**How to test it manually:** Drop three shapes, drag a box around two — both get selection outlines; Ctrl+A selects all three.

---

### Move & nudge

**What it is:** Drag to move; arrow keys nudge 1 px, **Shift+Arrow** nudges 10 px.

**Where it lives (code):** drag `DC:178,226`; nudge `DC:132-137`→`DD:396`.

**How to test it manually:** Select a symbol, press **→** five times (moves 5 px), then **Shift+→** (jumps 10 px).

---

### Resize (8 handles, Shift-aspect)

**What it is:** Eight square handles resize a single selected symbol; hold **Shift** to keep aspect ratio.

**Where it lives (code):** `DC:197` (`resizeMouseDown`), 8 handles `DC:402-404`, Shift-aspect `DC:251-257`.

**How to test it manually:** Select an image, drag its corner handle with **Shift** held — width/height scale together.

---

### Rotate & flip

**What it is:** A rotate handle above the symbol (snaps to 5°); Flip H / Flip V buttons.

**Where it lives (code):** rotate `DC:202,263-266`; flip `DD:500-503`; toolbar Flip H/V `DT:312-313`.

**How to test it manually:** Select a valve, drag the rotate handle — it rotates in 5° steps. Click **Flip H** — it mirrors.

---

### Z-order, align, distribute

**What it is:** Layer ordering (front/back/forward/backward), 6-way align, and even-spacing distribute.

**How to use it:** Toolbar has bring-to-front / **Fwd** / **Bwd** / send-to-back. The **Align** dropdown has left/centre/right/top/middle/bottom and Distribute horizontally/vertically.

**Where it lives (code):** z-order `DD:472-482` + toolbar `DT:304-309`; align `DD:442-462` (needs ≥2); distribute `DD:485-499` (needs ≥3).

**How to test it manually:** Overlap two shapes, select the back one, click bring-to-front — it comes forward. Select 3 shapes, **Align → Distribute horizontally** — gaps equalise.

---

### Cut / copy / paste / delete / duplicate

**Where it lives (code):** copy `DD:506`, cut `DD:507`, paste `DD:515` (+20,+20 offset), delete `DD:378`, duplicate `DD:388`. Shortcuts: **Ctrl+C/X/V**, **Ctrl+D**, **Delete/Backspace**. Also in the right-click menu.

**How to test it manually:** Select a symbol, **Ctrl+C** then **Ctrl+V** — a copy appears offset by 20 px. **Delete** removes it.

---

### Undo / redo

**What it is:** Full undo/redo history (depth 50).

**Where it lives (code):** `DD:276-292` (`commit`/`undo`/`redo`, `.slice(-50)`). Shortcuts **Ctrl+Z**, **Ctrl+Shift+Z** / **Ctrl+Y**; toolbar buttons `DT:273-278`.

**How to test it manually:** Move a symbol, press **Ctrl+Z** — it returns; **Ctrl+Y** — it moves again.

---

### Group / ungroup

**Where it lives (code):** `DD:402/408`; **Ctrl+G** / **Ctrl+Shift+G**; toolbar `DT:282-283`.

**How to test it manually:** Select two shapes, **Ctrl+G** — clicking either now selects both.

---

### Zoom & pan

**What it is:** Zoom in/out/fit; pan with **Space+drag** or **middle-mouse drag**; **Ctrl+wheel** zooms.

**Where it lives (code):** zoom `DD:524,580`; toolbar −/+/Fit `DT:317-329`; pan `DC:303-330`; Ctrl+wheel `DC:290-292`.

**How to test it manually:** **Ctrl+wheel** up to zoom in; hold **Space** and drag to pan; click **Fit** to frame the whole display.

---

### Right-click context menu

**What it is:** A menu on any symbol with edit + shortcut actions.

**Items:** Cut, Copy, Paste, Duplicate, Delete, Bring to front/forward, Send backward/to back, **Convert to collection**, **Format…** (opens Style tab), **Edit states…** (opens the multi-state tab), **Add navigation link…**.

**Where it lives (code):** `DD:532` (`handleItemContextMenu`), items `DD:804-818`, `ContextMenu.tsx`.

**How to test it manually:** Right-click a symbol → choose **Edit states…** — the inspector jumps to the States tab.

---

### Layers panel

**What it is:** A list of every item, front-most first, with search, select, and per-item hide/lock.

**Why it's useful:** Find and toggle items on a busy display.

**Where it lives (code):** `LayersPanel.tsx` — filter `LP:45-50`, select `LP:60-63`, hide eye `LP:65-72`, lock `LP:73-80`.

**How to test it manually:** In the Layers list, click the eye on an item — it disappears from the canvas; click again to restore. **Limitation:** the panel is view/toggle only — no drag-to-reorder or rename.

---

### Background colour

**What it is:** Set the canvas background colour (or reset to the theme token so it follows day/night).

**Where it lives (code):** `DD:143` (`bgColor`), toolbar **BG** colour input + **Theme** reset `DT:349-358`.

**How to test it manually:** Click **BG**, pick a colour — the canvas background changes; click **Theme** to revert to the token.

**Notes / limitations:** Background **image** is **not** implemented — background is colour/token only.

---

### Dirty indicator & unsaved-changes guard

**What it is:** A dot marks unsaved edits; leaving warns you.

**Where it lives (code):** `isDirty` `DD:140`, dot `DT:144`; `beforeunload` guard `DD:593-601`, in-app confirm `DD:603-606`.

**How to test it manually:** Move a symbol (dot appears), try to close the tab — the browser warns about unsaved changes.

---

## 6. Static elements (text, shapes, images)

### Text (label, title, dynamic text)

**What it is:** Static **Label** and **Section Title** text, plus **Dynamic Text** that shows a live string tag.

**How to use it:** Drag Text → set the label in the inspector. In the **Style** tab set size, weight, alignment, **font family, italic, underline, colour, and text background**.

**Where it lives (code):** `SymbolRenderer.tsx:828-859`; text styling helper `SymbolRenderer.tsx:220-227` (`textStyle`), inspector controls `PropertyInspector.tsx` (Text section).

**How to test it manually:** Place a Label "Crude Unit", set it **bold + underline + centre** — the on-canvas text updates immediately.

---

### Shapes

**What it is:** Rectangle, circle/ellipse, line, polygon, divider, card, hotspot.

**How to use it:** Drag from **Shapes & Layout**; set fill, stroke, stroke width, **dash pattern**, corner radius in the Style tab.

**Where it lives (code):** `CustomSymbols.tsx:214-326`, styling `SymbolRenderer` Style tab. `strokeDasharray` supported on rect/circle/line.

**How to test it manually:** Draw a rectangle, set stroke to dashed and fill to a token colour — the outline renders dashed.

**Notes:** `shape.hotspot` is an invisible-at-runtime clickable region (pair it with a navigation link).

---

### Images / uploaded media

**What it is:** An image symbol (`image.static`) that shows an uploaded PNG/JPG/GIF/WEBP/SVG.

**How to use it:** Drag **Image**, use the inspector upload — the file is stored server-side and referenced by id (config-only, never inlined).

**Where it lives (code):** `CustomSymbols.tsx:222-231` (renders `<img>` from `mediaId`); upload `api/mediaApi.ts` → `POST /displays/media` (content-type allow-list, 2 MB cap, SVG sanitised); fetch `GET /displays/media/{id}`.

**How to test it manually:** Upload a PNG, place it, resize with Shift — it scales proportionally and survives save/reopen. Try uploading a `.exe` — it's rejected.

---

## 7. Dynamic symbols (data-bound)

The palette has ~60 symbol types across categories. Most render **real** live/historical data; a handful are static decoration or stubs. This table is the honest inventory — see per-symbol entries below for the main data symbols.

| Category | Real (live/historical) | Static (decoration) | Stub / mock (renders but ignores its binding) |
|---|---|---|---|
| **Indicators** | readout, readout+unit, status, vertical/horizontal bar, badge, circular gauge, digital, multi-state, PV/SP | — | — |
| **Controls** | toggle, sliders, numeric input, check, selector *(all read-only)* | command button | — |
| **Equipment** | pump, valve, valve-onoff, motor, tank, compressor, fan, heater, cooler, conveyor, agitator | — | **heat exchanger** (bindable but static art) |
| **Instruments** | TI/PI/FI/LI/AI/TT readouts | — | — |
| **Piping / Flow** | — | pipes, elbow, tee, reducer, flow arrow | — |
| **Trends & Charts** | **trend, bar chart, XY plot, value table, asset-comparison table, time-series table** | — | **sparkline, pie chart** |
| **Alarms** | alert-icon, banner, beacon, horn, summary, **alarm table** | — | alert-button (no count) |
| **Navigation** | — | nav-item, faceplate button | breadcrumb (hardcoded path) |
| **Text** | dynamic text | label, title, clock | — |

*(Verdicts from `SymbolPalette.tsx:54-199`, `SymbolRenderer.tsx`, `CustomSymbols.tsx`, `catalogRenderer.tsx`.)*

> **Controls are display-only.** Toggles/sliders/inputs show the live value but there is **no write-back / command path** — clicking them does not send anything to the plant. Document them as indicators, not controls.

---

### Trend chart

**What it is:** A multi-pen time-series chart with live tailing, history, zoom, and a cursor-reading legend.

**Why it's useful:** The core tool for watching and diagnosing process behaviour over time.

**How to use it:**
1. Drag **Trend Chart** onto the canvas.
2. In the **Data** tab, bind one or more tags (e.g. `houston/crude1/pump101.speed`, `…discharge_press`).
3. It follows the display **time bar** by default; set **Own range** in the inspector to give it independent controls.
4. In the trend inspector set per-trace **colour / line style / width / markers**, **manual Y-scale**, **stepped**, and a **regression line**.

**Where it lives (code):** `TrendChart.tsx` → `TrendCore.tsx`. History via `historian-bff /trend`; live tail via the MQTT ring buffer; per-pen axes when units differ. Regression `TrendCore.tsx` (`regressionLine`).

**How to test it manually:** Bind speed + discharge_press, Preview — two pens draw and advance every ~2 s; drag-select to zoom; hover to read values at the cursor; click a legend entry to hide that trace; enable **Regression** and a dashed best-fit line appears.

---

### Value readout (Numeric / Readout+Unit)

**What it is:** A single live number, optionally with its engineering unit, coloured by alarm limits.

**How to use it:** Drag **Numeric Readout**, bind `value` to a tag, set decimals/unit in Format, optionally switch the **display unit** (UOM) and turn on the **quality badge** / **timestamp**.

**Where it lives (code):** `SymbolRenderer.tsx:437-451`; UOM/limits/quality `SymbolRenderer.tsx:335-361`.

**How to test it manually:** Bind `houston/crude1/pump101.discharge_press`, Preview — the number tracks the sim; set alarm limits below the live value and the text turns to the alarm colour.

---

### Circular gauge

**What it is:** An analog dial with a needle, scaled to the tag's limits.

**How to use it:** Drag **Circular Gauge**, bind `value`. Turn on **Inherit alarm thresholds from the asset** so its zero/span follow the catalog limits instead of a fixed 0–100.

**Where it lives (code):** `CustomSymbols.tsx:39-68`; limit inheritance `SymbolRenderer.tsx:346-353`.

**How to test it manually:** Bind `pump101.discharge_press` (asset unit PSI, hi-limit 500) — the gauge span matches the asset, and the needle moves live.

---

### Bar chart

**What it is:** One bar per bound tag (or one bar per asset via a dynamic search), coloured by value.

**How to use it:** Drag **Bar Chart**, bind several tags; **or** in the inspector set a **dynamic search** (root/template + attribute) to make one bar per matching asset.

**Where it lives (code):** `BarChart.tsx` (batch resolver + live metrics; `useAssetSearch` for dynamic mode).

**How to test it manually:** Bind speed of three pumps — three live bars; or set search template `Pump` + attribute `speed` and get one bar per pump.

---

### XY plot

**What it is:** A scatter/line of one tag (X) against another (Y) from live samples.

**Where it lives (code):** `XYPlot.tsx` (pairs live ring-buffer samples of the `x` and `y` slots).

**How to test it manually:** Bind `x`=`pump101.speed`, `y`=`pump101.discharge_press`, Preview — points accumulate as the sim runs.

---

### Value table

**What it is:** A table with one row per bound tag: Name / Value / Units, plus optional Min/Max/Avg summary columns over the display time range.

**How to use it:** Drag **Table**, bind tags to `value`, `value2`, …; tick **Min/Max/Avg** and **Transpose** (tags across the top) in the inspector.

**Where it lives (code):** `TableSymbol.tsx`; summaries via `historian-bff /summary` (`fetchSummary`).

**How to test it manually:** Bind three pump tags, enable Avg — a live Avg column fills from history; tick **Transpose** and rows/columns swap.

---

### Asset comparison table

**What it is:** One row per asset (from a dynamic search), one column per attribute, with live cells.

**How to use it:** Drag **Asset Comparison**, set the **row search** (root + template, e.g. `Tank`) and the **attribute columns** (e.g. `level, temperature`).

**Where it lives (code):** `AssetComparisonTable.tsx` (asset search × attributes → live values).

**How to test it manually:** Search template `Pump`, attributes `speed, discharge_press` — a row per pump with live values that update.

---

### Time-series table

**What it is:** A grid of timestamped values — evenly-spaced sample times down the side, tags across the top — over the display time range.

**Where it lives (code):** `TimeSeriesTable.tsx`; reads `historian-bff /trend`, nearest sample per row; respects the time-bar timezone.

**How to test it manually:** Bind two tags, Preview — 15 rows of historical values at even timestamps; change the time bar to `*-8h` and the rows re-range.

---

### Equipment & instruments

**What it is:** ISA-5.1 symbols — pump, valve, motor, tank, fan, compressor, etc. — that animate/colour from a live status or level.

**Where it lives (code):** `SymbolRenderer.tsx:613-751`, `CustomSymbols.tsx:123-181`.

**How to test it manually:** Place a **Pump**, bind `status`/`running` to `houston/crude1/pump101.running` — in Preview it spins while running; place a **Tank**, bind `level` to `tank01.level` — the fill rises/falls live.

**Notes / limitations:** **Heat exchanger (`equip.hx`)** is bindable but its art is static — it will not show live temps. Some equipment uses only the status slot (extra slots like `pressure`/`temperature` are not drawn).

---

## 8. Data binding

### Binding a tag to a symbol

**What it is:** Connecting a symbol's slot (value, status, pv…) to a plant tag by its **UNS path + role** (live / history / alarm).

**Why it's useful:** This is what makes a symbol show real data. Binding is by path+role and resolved to a transport by the Binding Resolver — you never hardcode an MQTT topic or IoTDB path.

**How to use it:** Three ways —
1. **Data tab (primary):** select the symbol → **Data** tab → for each slot click the **TagPicker**, type a path or press **📂** to browse/search the asset tree, pick a measurement.
2. **Drag a tag onto a symbol:** in the **Assets** tab, drag a measurement onto an existing symbol → it fills the next free slot.
3. **Drag a tag onto empty canvas:** creates a bound Readout automatically.

**Where it lives (code):** Data tab `PropertyInspector.tsx:577-582,1531-1556` (`setBinding`); `TagPicker`/browse `AssetBrowser.tsx:277-354`; drag-bind `DesignerCanvas.tsx:163-174` → `DD:356-376`. Resolution: `useBindingResolver` → `binding-resolver /resolve` (single) and `/resolve/batch` (charts/tables), roles `live|history|alarm|all` (`useBindingResolver.ts:35-121`).

**How to test it manually:** Add a Readout, open **Data**, browse to `houston/crude1/pump101` → pick `discharge_press`; Preview shows the live value. In DevTools → Network you'll see a `/resolve` call and a SignalR/MQTT subscription for that device only.

---

### Snapshot-on-open + live updates

**What it is:** When a display opens, current values load immediately from a snapshot; after that, live MQTT (Sparkplug B) updates stream in.

**Why it's useful:** No blank/“--” gap on open — the screen is populated instantly, then stays live.

**Where it lives (code):** snapshot `mqttStore.loadAllSnapshots()` → `historian-bff /snapshot?assets=*` (`mqttStore.ts:347-356`), fired on connect and reconnect; live decode `mqttStore.ts:438-501` (DBIRTH/DDATA → `metrics` map + ring buffer).

**How to test it manually:** Open a display with bound symbols — values appear at once (from the snapshot), then tick every ~2 s (from the sim). Reconnect the network and they re-seed, not freeze.

---

### Quality-on-open (NE107)

**What it is:** A per-symbol data-quality badge mapping the tag's OPC/Sparkplug quality (+ staleness) to ISA-18.2 / NAMUR NE107 (Good / Uncertain / Bad / Maintenance / Out-of-Service).

**How to use it:** Tick **Show data-quality badge** on the symbol (it's **off by default**).

**Where it lives (code):** `qualityFrom(...)` `SymbolRenderer.tsx:359-361` + `utils/quality.ts`; badge `SymbolFxWrap` `SymbolRenderer.tsx:268-277`; opt-in flag `item.showQuality` (`:967`).

**How to test it manually:** Enable the badge on a Readout, then freeze its tag in the sim (`--exclude houston/crude1/pump101.discharge_press`) — after the staleness window a coloured NE107 badge appears instead of a frozen-looking number.

**Notes:** Because it's opt-in, symbols without the flag only show the legacy stale `⚠`.

---

## 9. Multi-state & visual alarms

### Multi-state "States" tab

**What it is:** Drive a symbol's colour/blink from value ranges or discrete values — e.g. green below 80, amber 80–90, red above 90 — with a mandatory bad-data state.

**Why it's useful:** Turns any symbol into an at-a-glance status indicator, ISA-101 style (colour only for abnormal).

**How to use it:**
1. Select a symbol → **States** tab (or right-click → **Edit states…**).
2. Click **+ Add Multi-State** — you get two states plus a required **No data / bad quality** state.
3. Set each state's label + **min/max** threshold (or an equals value), pick a colour from the **constrained alert palette** (Normal/Advisory/Caution/Warning/Alarm — no free colour picker), and tick **Blink** if it should blink while unacknowledged.
4. Optionally set the **trigger slot** (use the primary value or an alternate bound attribute).

**Where it lives (code):** `PropertyInspector.tsx:260-400` (`MultiStateEditor`), palette `:224-253`. Rendered by the **shared** rule engine `ruleEngine.ts:57-75` (`evaluateMultiState`) via `SymbolFxWrap` — no second evaluator.

**How to test it manually:** On a tank bound to `tank01.level`, add states 0–80 green, 80–95 amber, 95–100 red (blink). Preview and watch the sim drive the level across thresholds — the colour changes and the red state blinks. Freeze the tag → the **No data** state shows.

---

### Conditional-format rules & alarm outline

**What it is:** A symbol can also carry rules (value/limit → colour/blink/hidden/rotate) and bind to an **alarm source** so it outlines/blinks while an alarm on that source is unacknowledged.

**How to use it:** Set **Alarm source** (a source-name prefix, e.g. `houston:crude1:pump101`) in the General tab.

**Where it lives (code):** `ruleEngine.ts:34-52` (`evaluateRules`); `alarmSource` field `PropertyInspector.tsx:695-711`; alarm state from `alarmStore`.

**How to test it manually:** Set a symbol's alarm source to a device with an active unacked alarm — the symbol gains a priority-coloured outline and blinks until acknowledged.

---

## 10. Data fidelity — units & quality

### Unit of measure (display unit switch)

**What it is:** Symbols show the tag's real engineering unit from the asset catalog, and you can convert the displayed value to another compatible unit.

**How to use it:** On a value symbol, the inspector **Display unit** dropdown lists units of the same dimension (e.g. kPa → psi, °C → °F). Alarm thresholds stay in the native unit.

**Where it lives (code):** native unit `useAssetMetadata` → `/api/assets/by-path` (`SymbolRenderer.tsx:335`), conversion `utils/uom.ts` (`convert`), inspector `PropertyInspector.tsx` (`uom-select`).

**How to test it manually:** Bind a pressure tag (native PSI), switch the display unit to bar — the number converts; the alarm colour (native-unit thresholds) is unchanged.

**Notes:** The **value tables** show `formatting.unit` but do **not** run unit conversion — only the single-value symbols and gauges convert.

---

## 11. Time

### Display time bar

**What it is:** One time context every time-aware symbol on the display follows — start/end, presets, live vs fixed, and a timezone.

**Why it's useful:** Change one control and every trend/table/time-series on the screen re-ranges together.

**How to use it (bottom bar):** type **Start**/**End** expressions (`*-8h`, `t`, `y`, `mon`, ISO dates…), or click a preset (**15m / 1h / 8h / 1d / 1w**); **‹ ›** shift by the current span; **Now** snaps back to live; **Revert** returns to the saved range; the **LIVE/FIXED** badge shows the mode; the **timezone** dropdown (Local/UTC/US zones/London/Dubai/Karachi) reformats all times.

**Where it lives (code):** `TimeBar.tsx`, store `store/timeStore.ts`, grammar `utils/timeExpression.ts`. Live mode re-ticks every 2 s; `?start=&end=&tz=` seed the bar from the URL.

**How to test it manually:** Put a trend on a display, type `*-8h` in Start — the trend (and any time-series table) re-ranges to the last 8 h; click **Now** — it returns to a live window and starts tailing; change timezone to UTC — the timestamps shift.

---

### Per-symbol time context

**What it is:** A trend can follow the display time bar (default) or keep its **own** independent range.

**Where it lives (code):** `item.timeMode` `'display'` / `'own'`, inspector `PropertyInspector.tsx:1069-1082`; honoured in `TrendChart.tsx`.

**How to test it manually:** Set a trend to **Own range** — changing the display time bar no longer affects it; it shows its own range controls.

---

## 12. Navigation

### Navigation links

**What it is:** Make a symbol clickable to open another display or a URL, optionally passing the current asset and/or time range.

**Why it's useful:** Build a drill-down hierarchy (overview → unit → faceplate).

**How to use it (Action tab / right-click → Add navigation link):**
1. Choose the action: **Nothing / Open a display / Open a URL**.
2. For a display, pick the target from the searchable list.
3. Choose the open mode: **this tab / new tab / popup faceplate**.
4. Choose how the asset is passed: none / **current asset** / current-asset-as-root / explicit.
5. Tick **Pass the current time range** to carry the time window.

**Where it lives (code):** `NavigationEditor.tsx:82-186`; runtime `DisplayViewer.tsx:139-166` (`handleNav`). URLs are restricted to `https:` or same-origin (`isSafeUrl`, enforced at author and runtime).

**How to test it manually:** On an overview pump symbol, add a link to a faceplate display, open mode **popup**, asset **current asset**, **Pass time range** on. Publish, open the overview, click the pump — the faceplate opens in a popup, pre-scoped to that pump and the same time window.

---

### Kiosk mode & URL parameters

**What it is:** Open a display chrome-free for a wall panel, via URL flags.

**How to use it:** append to the viewer URL — `?kiosk=1` (hide all chrome), `?hideBar=1` (hide the nav bar), `?hideTimebar=1` (hide the time bar); `?asset=…` scopes the asset; `?start=&end=&tz=` set the time window.

**Where it lives (code):** `DisplayViewer.tsx:93-96`, applied `:319,472`.

**How to test it manually:** Open `http://localhost:3000/display/<id>?kiosk=1` — the display fills the screen with no toolbar or time bar.

---

### Touch (tablets / panels)

**What it is:** Pinch-to-zoom and one-finger pan on the runtime display; double-tap resets.

**Where it lives (code):** `hooks/useTouchZoomPan.ts`, applied to the viewer stage in `DisplayViewer.tsx`.

**How to test it manually:** On a touch device (or browser touch emulation), pinch the display to zoom, drag one finger to pan, double-tap to reset.

**Notes:** Touch zoom/pan is on the **runtime viewer**; the design canvas is still mouse-first.

---

## 13. Alarms & events in a display

### Alarm table symbol (with acknowledge)

**What it is:** A live alarm grid you can place on a display, filtered to an alarm source, with an **Ack** button per row and expandable event details.

**How to use it:** Drag **Alarm Table**, set **Alarm source** to a prefix (e.g. `houston:crude1`). In the runtime, click a row to expand its details; click **Ack** to acknowledge.

**Where it lives (code):** `SymbolRenderer.tsx:165-236` (`AlarmTable`), ack via the existing batch-ack API (`acknowledgeAlarmsBatch`), details expansion `SymbolRenderer.tsx` (`expandedId`).

**How to test it manually:** With an active alarm on `houston/crude1/*`, place an Alarm Table scoped to it — the alarm appears; click the row to see condition/state/severity/message/time; click **Ack** — the row flips to ACK and the acknowledgement persists (verify in the Alarm Console).

---

### Alarm annunciators

**What it is:** Banner / beacon / horn / summary symbols driven live by the alarm store (blink-while-unacked → steady-on-ack).

**Where it lives (code):** `SymbolRenderer.tsx:126-162` (`AlarmAnnunciator`), intercepted `:957-963`.

**How to test it manually:** Place an **Alarm Banner**; raise an alarm — it blinks; acknowledge it — it goes steady.

**Notes:** annotations on events, and "related/compare events" views, are **not** built. Alarm annotations need a persistence backend.

---

## 14. Saving, versioning & management

Backend: Display service (`traverse_displays`), `src/services/display-service/Program.cs`.

### Save draft / Publish / Unpublish / Revert

**What it is:** Editing saves **drafts**; **Publish** makes a version live for operators; you can **Unpublish** or **Revert** unpublished work.

**Why it's useful:** Displays are change-managed — operators only ever see published versions; drafts never go live by accident.

**How to use it:** In the editor, **Save** (draft), then **Publish**. The runtime viewer always loads the **published** version (`?stage=published`); a never-published display 404s for operators.

**Where it lives (code):** save `PUT /displays/{id}/content` (`:411`), publish `POST …/publish` (`:463`), unpublish `…/unpublish` (`:518`), revert `…/revert` (`:547`).

**How to test it manually:** Edit + Save — the operator launcher still shows the old published version. Publish — now the operator sees your change. Revert — the draft is discarded back to published.

---

### Version history

**What it is:** Every save is a numbered version; you can list them, fetch a snapshot, restore an arbitrary prior version into a new draft, and attach comments.

**Where it lives (code):** `GET /displays/{id}/versions` (`:1141`), `…/versions/{n}` (`:1153`), restore `POST …/versions/{n}/restore` (`:1163`), comments `…/comments` (`:1188/1197`).

**How to test it manually:** *(API-level today.)* `GET /api/displays/{id}/versions` returns ≥2 after two saves; `POST …/versions/1/restore` creates a new draft byte-identical to v1.

**Notes / limitations:** **No version-history UI yet** — these are endpoints only.

---

### Thumbnails

**What it is:** Each published display gets an auto-generated SVG preview (rendered from the design view, so it never leaks live values).

**Where it lives (code):** `PUT/GET /displays/{id}/thumbnail` (`:697/720`); shown on cards `DisplayList.tsx:662-685`.

**How to test it manually:** Publish a display — its card shows a schematic thumbnail (not a grey box).

---

### Home page: create, rename, duplicate, delete, restore

**What it is:** Full lifecycle management on the Designer home.

**How to use it:** **+ New Display** (name, category, ISA-101 level, tags); per-card **Rename**, **Duplicate** ("Save As" → new unpublished copy), **Delete** (to a recycle bin, with an Undo toast); the **Recycle bin** panel restores deleted displays.

**Where it lives (code):** `DisplayList.tsx:206-252,466-526`; endpoints rename `PUT /displays/{id}`, duplicate `POST …/duplicate`, soft-delete `DELETE …`, bin `GET /displays/deleted`, restore `POST …/restore`.

**How to test it manually:** Duplicate a display — a new "(copy)" opens, unpublished; delete it — it moves to the recycle bin; click **Restore** — it returns as a draft.

---

### Search, sort, view, tags, favorites, recent

**What it is:** Home-page organisation.

**How to use it:** Search box, **Sort** (name/updated/created/owner), **grid⇄list** toggle (remembered), **tag chips** to filter, a **★ favourite** star per card, and a **Recently opened** strip.

**Where it lives (code):** `DisplayList.tsx:381-443,697-731`; endpoints `?search/&sort/&tag`, `/me/favorites`, `/me/recent`.

**How to test it manually:** Tag a display `crude`, click the `#crude` chip — the list filters; star it — it appears under favourites; open its runtime — it shows under **Recently opened**.

---

### Ownership, sharing, folders, personal views

**What it is:** Server-side governance — ownership enforcement (a non-owner/non-Admin gets 403 on edit), per-display/folder ACLs, folder tree, and per-user personal views.

**Where it lives (code):** enforcement `display-service` `CanEditDisplayAsync`; ACLs `/displays|folders/{id}/permissions`; folders `/folders`; personal views `/me/views`.

**How to test it manually:** As a second Engineer, `PUT /api/displays/{someone-elses-id}` → **403 Forbidden**.

**Notes / limitations:** **Backend-only — no UI yet** for the folder tree, the ACL/sharing editor, and the personal-views editor. Ownership enforcement and all endpoints work; the authoring UI is a follow-up.

---

## 15. Custom symbols

**What it is:** Define your own reusable symbol as an SVG template with named binding slots, then place it like any built-in.

**Why it's useful:** Add symbols without editing source code.

**How to use it:** In the palette's **Custom Symbols** panel, click **＋ New**, give it a name/category, paste SVG using `{{slot}}` / `{{slot:fixed1}}` placeholders, declare the binding slots, save. It appears in the panel — drag it onto the canvas and bind its slots like any symbol.

**Where it lives (code):** `customSymbolRegistry.ts`, editor `CustomSymbolPanel.tsx`, renderer `CustomSymbolInstance.tsx`, palette hook `SymbolPalette.tsx`, definition fallback `symbolLibraryService.ts`.

**How to test it manually:** Create a custom symbol with `<text>{{value:fixed1}}</text>`, place it, bind `value` to `pump101.speed` — Preview shows the live speed. The SVG is sanitised on save (script/`on…=` handlers are rejected).

**Notes / limitations:** Custom-symbol definitions persist **client-side (localStorage)** per browser — a shared server-side registry is a follow-up.

---

## 16. Import (PI Vision .pdix)

**What it is:** Import an AVEVA PI Vision `.pdix` display and convert its elements to Traverse symbols.

**How to use it:** Designer home → **Import HMI**, or go to `/designer/import`, choose a `.pdix`.

**Where it lives (code):** `ImportPage.tsx`, `services/import/pdixImport.ts` / `ScreenImportService.ts`.

**How to test it manually:** Import a `.pdix` — mapped elements become symbols; unmappable elements are listed as **unmapped** (not silently dropped as broken `❓` boxes).

---

## 17. Quick 15-minute smoke-test checklist

Open `/designer`, create a display, and tick these:

**Canvas & editing**
- [ ] Design ↔ Preview toggle works
- [ ] Grid + snap on; Alt bypasses snap
- [ ] Marquee-select two items; Ctrl+A selects all
- [ ] Arrow nudges 1 px, Shift+Arrow 10 px
- [ ] Resize a single item with 8 handles; Shift keeps aspect
- [ ] Rotate (5° steps) + Flip H/V
- [ ] Bring-to-front / send-to-back; Align + Distribute (≥3)
- [ ] Ctrl+C/V duplicate; Delete removes; Ctrl+Z / Ctrl+Y undo/redo
- [ ] Ctrl+G group; right-click menu opens; Layers panel hides an item
- [ ] BG colour changes; unsaved-changes warning on close

**Symbols & binding**
- [ ] Drag a tag onto empty canvas → a bound readout appears live
- [ ] Bind a gauge to `houston/crude1/pump101.discharge_press` → needle moves in ~1 s
- [ ] Trend with 2 pens tails live; zoom + cursor legend + hide-a-trace work
- [ ] Value table with Min/Max/Avg + Transpose
- [ ] Bar chart / XY plot / time-series table show live/historical data
- [ ] Alarm table scoped to a source; Ack a row → it goes ACK

**Multi-state / fidelity / time / nav / save**
- [ ] Multi-state on a tank changes colour + blinks across thresholds; No-data state on freeze
- [ ] Quality badge (opt-in) shows NE107 state on a frozen tag
- [ ] Display unit switch converts a value; asset limits inherit into a gauge
- [ ] Time bar `*-8h` re-ranges all trends; **Now** returns to live; tz reformats
- [ ] Nav link opens a target (popup faceplate) passing asset + time range
- [ ] `?kiosk=1` opens chrome-free
- [ ] Save → Publish → operator sees it; Duplicate → Delete → Restore from bin
- [ ] Ownership: a non-owner Engineer gets 403 editing another's display

---

## 18. Known gaps / not yet built

Honest list so reviewers aren't surprised (PI-Vision-parity items that are **not** implemented or only partial):

**Not implemented**
- **Controls write nothing** — buttons/sliders/toggles/inputs display live values but have **no command/write-back** path.
- **Background image** for a display (colour/token only).
- **Version-history browser UI** (endpoints exist; no in-app diff/restore screen).
- **Folder tree UI**, **sharing/ACL editor UI**, **personal-views editor UI** — all backend-only.
- **Event annotations** and **related/compare-events** views.
- **Timezone** does not yet reformat the in-trend axis clock or value-symbol timestamps (only the time bar + time-series table).

**Stubs (render but ignore their binding — avoid using for live data)**
- `chart.sparkline` (hardcoded polyline), `chart.pie` (3 fixed slices).
- `equip.hx` heat exchanger (static art), `obc.breadcrumb` (hardcoded path), `obc.alert-button` (no count).
- OpenBridge `graph-mini` (mock series) and `gauge-trend` (live needle, mock history).

**Partial**
- **Quality badge** is real but **off by default** (per-symbol opt-in).
- **UOM conversion** applies to single-value symbols/gauges, **not** to the value tables.
- **Touch** zoom/pan is on the runtime viewer only; the design canvas is mouse-first.
- **Custom symbols** persist client-side (localStorage), not shared server-side.
- **ISA-101 level** is settable on create and filters in the **operator launcher**, but the Designer list does not filter by level.

---

*Generated 2026-07-15. Verified against `src/frontend-ob` (designer, stores, canvas, palette, property panels) and the Display / Asset Model / Binding Resolver / historian-bff / auth services. Where this guide and any older audit disagree, trust this guide — it was written from the code.*
