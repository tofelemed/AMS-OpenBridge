# AVEVA PI Vision — Feature Parity Checklist

**Purpose:** Reference-product feature inventory for **Traverse AMS Edge**. PI Vision is our benchmark for the HMI designer/builder. This file is the *specification of "done"* — Claude Code reads this, then audits our codebase, and reports what is **built / partial / missing**.

**Scope of research:** AVEVA PI Vision (through the 2025 release), covering the home page, designer canvas, every native symbol and its configuration surface, the graphics library, multi-state behaviors, asset context switching, collections, dynamic search criteria, the time model, calculations, navigation/URL parameters, event frames, search, keyboard shortcuts, security roles, administration, and the extensibility framework.

**Important framing:** PI Vision is the *functional* benchmark, not the *architectural* one. Our stack differs deliberately (OpenBridge web components + DOM/SVG editor; Sparkplug B/MQTT live plane; IoTDB history; contextual UNS `root.<site>.<unit>.<device>.<measurement>`; ISA-101 controlled-vs-personal display model). Where PI Vision's approach conflicts with a recorded Traverse decision, **the Traverse decision wins** — those cases are flagged inline as `[TRAVERSE-DELTA]`. Some items are explicitly out of scope for us and marked `[N/A]`.

---

## How Claude Code should use this file

1. Read this checklist in full.
2. Audit the AMS codebase (`src/frontend-ob`, `traverse_displays`, Asset Model service, Binding Resolver/BFF, `historian-bff`, Flink jobs, `sparkplug-edge-node`, auth service).
3. For **every** line item, emit one of:
   - `✅ BUILT` — implemented and wired end-to-end. **Cite file paths + symbols/functions.**
   - `🟡 PARTIAL` — exists but incomplete. **State precisely what is missing.**
   - `❌ MISSING` — no implementation found.
   - `⛔ N/A` — deliberately out of scope (must match an `[N/A]` or `[TRAVERSE-DELTA]` tag here, or justify).
4. **Verify against code, never against docs.** If a doc claims a feature exists and the code does not implement it, report `❌ MISSING` and note the doc discrepancy.
5. Produce `/docs/migration/03-pi-vision-parity-audit.md` with: a summary scorecard (counts + % per section), the full annotated checklist, and a **prioritized gap backlog** (P0 → P2) mapped to the migration phases.
6. Do not mark an item `✅ BUILT` on the basis of a UI stub, a mock, or a TODO. A symbol that renders but cannot bind to live data is `🟡 PARTIAL`.

**Priority legend:** `P0` = required for credible HMI-builder parity (MVP). `P1` = required for full parity. `P2` = differentiator / nice-to-have.

---

## A. Home page & display management

| # | Capability | Pri | Status |
|---|---|---|---|
| A1 | Home page listing all displays the user may access | P0 | |
| A2 | Thumbnail view of displays | P0 | |
| A3 | Table/list view of displays (toggle) | P1 | |
| A4 | Create New Display action | P0 | |
| A5 | Open existing display (click thumbnail) | P0 | |
| A6 | Search displays by name | P0 | |
| A7 | Search displays by owner | P1 | |
| A8 | Search displays by keyword/tag | P1 | |
| A9 | Assign keyword labels to displays (many labels per display; many displays per label) | P1 | |
| A10 | Predefined groups: **All Displays** | P0 | |
| A11 | Predefined group: **Favorites** (star/mark a display) | P1 | |
| A12 | Predefined group: **My Displays** (owned by me) | P1 | |
| A13 | Predefined group: **Recent** (used in last N days) | P1 | |
| A14 | Sort displays by: accessed / modified / name / owner | P1 | |
| A15 | Sort ascending / descending toggle | P1 | |
| A16 | Folders: create folder | P0 | |
| A17 | Folders: nested folder hierarchy (parent/child) | P1 | |
| A18 | Folders: rename / edit folder settings | P1 | |
| A19 | Folders: move folder (with permission) | P1 | |
| A20 | Folders: delete folder (cascades: subfolders deleted, displays moved to Home) | P1 | |
| A21 | Folders: per-folder permissions | P1 | |
| A22 | Folders: permission **inheritance** from parent folder (toggleable) | P1 | |
| A23 | Folders: share folder via URL reference | P2 | |
| A24 | Bulk-select displays and **move to another folder** (admin) | P1 | |
| A25 | Show/hide **private** displays (with permission) | P1 | |
| A26 | Display settings panel (visibility, ownership, interactions) | P1 | |
| A27 | Shared/public indicator on a display | P1 | |
| A28 | "Related displays" surfacing | P2 | |
| A29 | Display thumbnail image generation | P1 | `[TRAVERSE-DELTA]` client-side capture at save (recorded decision) — **not** a server render service |
| A30 | **Recycle Bin** — deleted displays recoverable (PI Vision 2025) | P1 | |
| A31 | "Unorganized" area for displays outside the folder tree (2025) | P2 | |
| A32 | Messages/notification indicator (errors, warnings) | P2 | |
| A33 | Touch-friendly mode toggle (hybrid laptop/tablet) | P2 | |
| A34 | Connected-identity indicator | P1 | |
| A35 | Help / documentation entry point | P2 | |

---

## B. Designer — canvas, toolbar, and editing model

**`[TRAVERSE-DELTA]` Our substrate is DOM/SVG with OpenBridge web components (not Konva/canvas, not Batik). The *capabilities* below must exist; the implementation differs.**

| # | Capability | Pri | Status |
|---|---|---|---|
| B1 | **Design mode toggle** (explicit edit vs. runtime/view mode, visually indicated) | P0 | |
| B2 | Display name shown in the editor | P0 | |
| B3 | **Unsaved-changes indicator** (dirty marker, e.g. `*`) | P0 | |
| B4 | Save display | P0 | |
| B5 | Save-As / duplicate display | P1 | |
| B6 | **Undo / Redo** (command stack) | P0 | |
| B7 | **Cut** | P0 | |
| B8 | **Copy** | P0 | |
| B9 | **Paste** | P0 | |
| B10 | **Delete** selected symbol(s) | P0 | |
| B11 | **Duplicate** symbol | P1 | |
| B12 | **Select** tool (pointer) | P0 | |
| B13 | **Multi-select** via Ctrl+click | P0 | |
| B14 | **Multi-select** via marquee / rubber-band drag | P0 | |
| B15 | **Select all** | P1 | |
| B16 | **Grid** toggle on/off | P0 | |
| B17 | **Grid snapping** on placement and move | P0 | |
| B18 | **Drag and drop** a data item onto the canvas to create a bound symbol | P0 | |
| B19 | Drag a data item **onto an existing symbol** to add it (e.g. add a column to a table, add a trace to a trend) | P0 | |
| B20 | **Move** symbol by mouse drag | P0 | |
| B21 | **Move** symbol by arrow keys (nudge) | P1 | |
| B22 | **Resize** symbol via handles | P0 | |
| B23 | Resize **maintaining aspect ratio** (Shift+drag) | P1 | |
| B24 | **Rotation** of symbols/text | P1 | |
| B25 | **Arrange → Align** (top/bottom/left/right/center/middle) | P0 | |
| B26 | **Arrange → Distribute** (horizontal/vertical spacing) | P1 | |
| B27 | **Arrange → Bring Forward / Send Backward** (z-order) | P0 | |
| B28 | **Arrange → Bring to Front / Send to Back** | P0 | |
| B29 | **Multi-symbol editing** — apply a format change to several selected symbols at once | P1 | |
| B30 | Right-click **context menu** on symbols (Format / Configure / Add Multi-State / Add Navigation Link / Convert to Collection) | P0 | |
| B31 | **Format/Configuration side panel** (right pane), contextual to selection | P0 | |
| B32 | **Format Display** — display-level settings (e.g. background colour) | P0 | |
| B33 | Display **background image** | P1 | |
| B34 | **Symbol type switching** — convert an existing symbol to a compatible type, preserving matching formats (e.g. Value ↔ Gauge, Trend ↔ Table) | P1 | |
| B35 | Format copying between symbols (format map / shared format options) | P2 | |
| B36 | Alignment guides / smart snapping to other symbols | P2 | |
| B37 | Zoom / pan of the design canvas | P2 | |
| B38 | Layers concept (grouping of elements) | P2 | |

---

## C. Static symbols (drawing primitives)

| # | Capability | Pri | Status |
|---|---|---|---|
| C1 | **Text** insert + edit | P0 | |
| C2 | Text: font family selection | P1 | |
| C3 | Text: font size | P0 | |
| C4 | Text: bold / italic / underline | P1 | |
| C5 | Text: colour | P0 | |
| C6 | Text: fill / background | P1 | |
| C7 | Text: rotation | P2 | |
| C8 | Text: alignment | P1 | |
| C9 | **Shape: rectangle / square** | P0 | |
| C10 | **Shape: line** | P0 | |
| C11 | Line: snap to 45° increments (Shift constraint) | P1 | |
| C12 | **Shape: ellipse / circle** | P0 | |
| C13 | **Shape: polygon / polyline** | P1 | |
| C14 | Shape: fill colour + **transparent fill** option | P0 | |
| C15 | Shape: stroke/line colour | P0 | |
| C16 | Shape: line style — solid / **dashed** / dotted | P0 | |
| C17 | Shape: line thickness | P1 | |
| C18 | Shape: corner radius | P2 | |
| C19 | **Image insert** (upload / choose file) | P0 | |
| C20 | Image: animated GIF support | P2 | |
| C21 | Image: SVG support | P0 | `[TRAVERSE-DELTA]` core to our theme-aware SVG symbol strategy |
| C22 | Static symbols support **multi-state** binding (text, shapes, images can be multi-stated) | P0 | |

---

## D. Dynamic symbols — the native set

PI Vision ships ten core dynamic symbols. Each must (a) accept bound data, (b) be configurable, (c) support multi-state where applicable, (d) work inside collections.

| # | Symbol | Data items | Pri | Status |
|---|---|---|---|---|
| D1 | **Trend** — one or more traces over a time range | Multiple | P0 | |
| D2 | **Value** — single current value (number / string / timestamp / digital state) | Single | P0 | |
| D3 | **Vertical Gauge** | Single | P0 | |
| D4 | **Horizontal Gauge** | Single | P0 | |
| D5 | **Radial Gauge** | Single | P0 | |
| D6 | **Table** — rows of data items with summary columns | Multiple | P0 | |
| D7 | **Asset Comparison Table** — one row per asset, columns = attributes | Multiple | P0 | |
| D8 | **Time Series Table** — sequential values + timestamps for one item | Single | P1 | |
| D9 | **Bar Chart** — compare multiple values as bars | Multiple | P0 | |
| D10 | **XY Plot / Scatter** — correlate X data source(s) against Y data source(s) | Multiple | P1 | |
| D11 | **Alarm/Event list symbol** | Multiple | P0 | `[TRAVERSE-DELTA]` we already have an ISA-18.2 alarm console — must be placeable **as a display symbol** |
| D12 | Symbols support **future data** (display range extending past *now*, e.g. forecast traces rendered as staircase) | P2 | |

---

## E. Per-symbol configuration surface

### E1. Trend

| # | Capability | Pri | Status |
|---|---|---|---|
| E1.1 | Multiple traces on one trend | P0 | |
| E1.2 | Per-trace **colour** | P0 | |
| E1.3 | Per-trace **line style** (solid/dashed/etc.) | P1 | |
| E1.4 | Per-trace **data markers** (marker visibility + shape) | P2 | |
| E1.5 | **Value scale: single (shared) scale** | P0 | |
| E1.6 | **Value scale: multiple scales** (per trace) | P1 | |
| E1.7 | Scale range: **autorange** of dynamic values | P0 | |
| E1.8 | Scale range: manual/absolute min-max | P1 | |
| E1.9 | Scale range: database/attribute limits | P1 | |
| E1.10 | Scale labels **inside** vs **outside** the plot area | P1 | |
| E1.11 | **Trace grouping** to share scales (2025) | P2 | |
| E1.12 | **Regression line** on trend (2025) | P2 | |
| E1.13 | **Trend cursors** (click to inspect values at a timestamp) | P0 | |
| E1.14 | Cursor **retention** across interactions (2025) | P2 | |
| E1.15 | **Pan** across the time range (runtime) | P0 | |
| E1.16 | **Zoom** in/out (runtime) | P0 | |
| E1.17 | **Hide/show individual traces** (runtime) | P1 | |
| E1.18 | Remove a trace (right-click) | P1 | |
| E1.19 | Trend **title** (toggle + text) | P1 | |
| E1.20 | **Grid style** options (none / horizontal / vertical / both) | P1 | |
| E1.21 | Legend display and configuration | P1 | |
| E1.22 | **Stepped vs. interpolated** plotting | P1 | |
| E1.23 | Time range mode: **Display time range** (follows the display; panning the trend updates display time) | P0 | |
| E1.24 | Time range mode: **Duration + Offset** (relative to display end time) | P1 | |
| E1.25 | Time range mode: **Custom time range** (independent of display; supports relative time) | P1 | |

### E2. Value

| # | Capability | Pri | Status |
|---|---|---|---|
| E2.1 | Show/hide **Label** (with label source: attribute / asset / custom) | P0 | |
| E2.2 | Show/hide **Value** | P0 | |
| E2.3 | Show/hide **Units** | P0 | |
| E2.4 | Show/hide **Timestamp** | P0 | |
| E2.5 | Font size / family / colour / bold | P0 | |
| E2.6 | Background / fill / opacity | P1 | |
| E2.7 | Renders **digital state** and **string** values, not just numeric | P0 | |
| E2.8 | Renders a **URL attribute as an active hyperlink** | P2 | |
| E2.9 | Supports **multi-state** | P0 | |

### E3. Gauges (radial / vertical / horizontal)

| # | Capability | Pri | Status |
|---|---|---|---|
| E3.1 | Zero/span derived from the **point/attribute limits** (min/max traits) | P0 | |
| E3.2 | Manual scale override | P1 | |
| E3.3 | Gauge **type/style** variants (e.g. arc vs. full radial) | P1 | |
| E3.4 | Label visibility + label source | P0 | |
| E3.5 | Value colour / font | P1 | |
| E3.6 | Units display + **UOM switching** | P1 | |
| E3.7 | Supports **multi-state** | P0 | |

### E4. Table

| # | Capability | Pri | Status |
|---|---|---|---|
| E4.1 | Column: **Name** | P0 | |
| E4.2 | Column: **Value** | P0 | |
| E4.3 | Column: **Description** | P1 | |
| E4.4 | Column: **Units** | P1 | |
| E4.5 | Column: **Minimum** (over display time range) | P1 | |
| E4.6 | Column: **Maximum** (over display time range) | P1 | |
| E4.7 | Column: **Average** / other summaries | P1 | |
| E4.8 | Column: **sparkline / mini-trend** | P2 | |
| E4.9 | Show/hide individual columns | P0 | |
| E4.10 | Column **resize** | P1 | |
| E4.11 | Column **reorder** | P1 | |
| E4.12 | **Sort by column** (click header) | P1 | |
| E4.13 | Table **style themes** | P1 | |
| E4.14 | Summary columns respect the **display time range** | P1 | |
| E4.15 | Add data item to table by drag-drop onto it | P0 | |
| E4.16 | **Transpose** — assets as columns (2025) | P2 | |

### E5. Asset Comparison Table

| # | Capability | Pri | Status |
|---|---|---|---|
| E5.1 | One **row per asset** | P0 | |
| E5.2 | Columns = selected **asset attributes** | P0 | |
| E5.3 | Add/remove attribute columns | P0 | |
| E5.4 | Show units per column | P1 | |
| E5.5 | **Dynamic search criteria** to auto-populate rows from an asset query | P0 | |
| E5.6 | **Multi-state per column** (enable multi-state on a chosen column) | P0 | |
| E5.7 | URL-valued attribute renders as hyperlink | P2 | |
| E5.8 | Include asset-based **calculations** as columns | P1 | |
| E5.9 | Style themes | P1 | |

### E6. Bar Chart

| # | Capability | Pri | Status |
|---|---|---|---|
| E6.1 | One bar per data source | P0 | |
| E6.2 | **Orientation**: vertical / horizontal | P1 | |
| E6.3 | **Scale**: auto from combined min/max, with manual override | P1 | |
| E6.4 | Grid style options | P2 | |
| E6.5 | Bar **label** source configuration | P1 | |
| E6.6 | Show/hide value on bars | P1 | |
| E6.7 | **Hover tooltip**: label, value, units, timestamp | P1 | |
| E6.8 | **Multi-state**: applied to *bars* | P1 | |
| E6.9 | **Multi-state**: applied as coloured *background bands* | P2 | |
| E6.10 | **Dynamic search criteria** support | P1 | |
| E6.11 | Auto-adjust bar width/spacing on resize | P2 | |

### E7. XY Plot

| # | Capability | Pri | Status |
|---|---|---|---|
| E7.1 | Correlate one or more X sources against Y sources | P1 | |
| E7.2 | Configurable **value-pairing method** | P2 | |
| E7.3 | **Regression line** | P1 | |
| E7.4 | **Correlation coefficient** display | P1 | |
| E7.5 | Axis scale configuration | P1 | |
| E7.6 | Interval/sampling configuration (e.g. 10-minute interval) | P2 | |

### E8. Time Series Table

| # | Capability | Pri | Status |
|---|---|---|---|
| E8.1 | Sequential value + timestamp rows for a single item | P1 | |
| E8.2 | Configurable **fixed number of values** | P2 | |
| E8.3 | Independent time range (display / duration+offset / custom) | P1 | |
| E8.4 | Show units | P2 | |
| E8.5 | Style (e.g. striped) + font size | P2 | |
| E8.6 | Supports **multi-state** | P1 | |
| E8.7 | Admin-set **default configuration** across displays | P2 | |
| E8.8 | Renders URL values as hyperlinks | P2 | |

---

## F. Graphics library (process symbols)

**`[TRAVERSE-DELTA]` PI Vision ships a broad graphics library. OpenBridge does not cover ISA-5.1 process symbols; our decision is a theme-aware SVG symbol library (Figma-exported, palette-aware) + migrated reference `Graphics/` assets.**

| # | Capability | Pri | Status |
|---|---|---|---|
| F1 | **Graphics library pane** in the designer | P0 | |
| F2 | Symbols organized by **category** | P0 | |
| F3 | Search/filter within the library | P1 | |
| F4 | **Drag-and-drop** a graphic onto the display | P0 | |
| F5 | Graphic: **colour customization** | P0 | |
| F6 | Graphic: **fill type** customization | P1 | |
| F7 | Graphic: **orientation / flip / rotate** | P1 | |
| F8 | Graphic supports **multi-state** (auto colour change by asset state) | P0 | |
| F9 | **Tanks / vessels** category | P0 | |
| F10 | **Pumps** category | P0 | |
| F11 | **Valves** category | P0 | |
| F12 | **Motors** category | P0 | |
| F13 | **Heat exchangers** | P1 | |
| F14 | **Compressors / blowers / fans** | P1 | |
| F15 | **Piping / connectors / arrows** | P1 | |
| F16 | **Instruments / sensors** (e.g. thermometer, transmitters) | P1 | |
| F17 | **Electrical** symbols | P2 | |
| F18 | **HVAC** symbols | P2 | |
| F19 | Custom/user-uploaded symbol registration into the palette | P1 | |
| F20 | Symbol library is **theme-aware** (renders correctly across palettes) | P0 | `[TRAVERSE-DELTA]` ISA-101 day/dusk/night/bright via OpenBridge tokens |
| F21 | ISA-5.1 compliant P&ID symbol coverage | P1 | `[TRAVERSE-DELTA]` explicit standards requirement beyond PI Vision |

---

## G. Multi-state behaviors (visual alarms)

The core of PI Vision's "visual alarm" value proposition. **`[TRAVERSE-DELTA]` ours must be anchored to NAMUR NE107 (instrument/data quality status) and ISA-18.2 (alarm state), with saturated colour reserved for abnormal conditions per ISA-101.**

| # | Capability | Pri | Status |
|---|---|---|---|
| G1 | **Add Multi-State** to a symbol (right-click action) | P0 | |
| G2 | **Configure Multi-State** panel | P0 | |
| G3 | Multi-state on **Value** | P0 | |
| G4 | Multi-state on **Gauges** | P0 | |
| G5 | Multi-state on **Text** | P0 | |
| G6 | Multi-state on **Graphics/shapes/images** | P0 | |
| G7 | Multi-state on **Asset Comparison Table** (per column) | P0 | |
| G8 | Multi-state on **Bar Chart** | P1 | |
| G9 | Multi-state on **Time Series Table** | P1 | |
| G10 | The symbol's **own bound attribute** acts as the default trigger | P0 | |
| G11 | **Alternate trigger attribute** — drive multi-state from a *different* data item than the one displayed (e.g. colour a level gauge by valve state) | P0 | |
| G12 | Remove/uncouple the trigger attribute | P1 | |
| G13 | Default set of **N states** with distinct colours | P0 | |
| G14 | **Add** a state (specify a max value threshold) | P0 | |
| G15 | **Remove** a state | P0 | |
| G16 | Edit **threshold/limit values** per state | P0 | |
| G17 | Edit **colour** per state (colour palette) | P0 | |
| G18 | **Blink** option per state (attention-getting) | P1 | |
| G19 | **Bad-data / out-of-range state** — explicit state for no-data or bad quality | P0 | `[TRAVERSE-DELTA]` **mandatory**: NE107 quality-on-open. Stale/uncertain/bad must never render as a live value |
| G20 | Thresholds **inherited from asset/attribute limits** when defined (user may recolour but not re-threshold) | P1 | |
| G21 | State evaluation on **string / digital** values (not just numeric ranges) | P1 | |
| G22 | Multi-state persists correctly through **asset context switching** | P0 | |
| G23 | Multi-state persists correctly inside **collections** | P0 | |

---

## H. Asset context switching (display reuse)

The mechanism that makes one display serve hundreds of assets — PI Vision's headline capability. **Directly equivalent to our template `%Element%` context switching.**

| # | Capability | Pri | Status |
|---|---|---|---|
| H1 | **Switch Asset** dropdown on a display (runtime) | P0 | |
| H2 | System **auto-discovers related assets** (assets sharing a template/type) | P0 | |
| H3 | Switching re-binds **all symbols** on the display to the new asset | P0 | |
| H4 | Attribute-driven text (e.g. asset name as a Value symbol) updates on switch | P0 | |
| H5 | **Configure asset context switching** panel | P0 | |
| H6 | Option: **show assets of the same type** | P0 | |
| H7 | Option: **show search results** (custom query) | P1 | |
| H8 | Option: **show/hide asset paths** in the list | P2 | |
| H9 | Search criteria: **Search Root** (scope the asset query to a subtree) | P0 | |
| H10 | Search criteria: **Return All Descendants** (recursive vs. direct children only) | P0 | |
| H11 | Search criteria: **Asset Type / Template** filter | P0 | |
| H12 | Requires a **template/type model** to function (asset model dependency) | P0 | |
| H13 | Asset context carried through **navigation links** to other displays | P1 | |
| H14 | Asset context settable via **URL parameter** | P1 | |

---

## I. Collections

Convert a symbol group into a repeating set across all matching assets — the "one card per asset" pattern.

| # | Capability | Pri | Status |
|---|---|---|---|
| I1 | **Convert to Collection** — select symbols, convert into a repeating collection | P0 | |
| I2 | Collection auto-populates one instance per matching asset | P0 | |
| I3 | **Modify Collection** — edit the single "template" instance; changes propagate to all | P0 | |
| I4 | Exit collection-edit mode | P0 | |
| I5 | Resizable **collection canvas** / container | P0 | |
| I6 | **Edit Collection Criteria** panel | P0 | |
| I7 | Criteria: **Search Root** | P0 | |
| I8 | Criteria: **Return All Descendants** | P0 | |
| I9 | Criteria: **Asset Type / Template** | P0 | |
| I10 | Criteria: **filter by attribute value** with comparison operators (`>`, `<`, `=`, `≠`, …) — e.g. only tanks with Flow > 50 | P0 | |
| I11 | Collection **updates automatically** as asset state changes (assets enter/leave the filter) | P0 | |
| I12 | **Refresh** action on criteria change | P1 | |
| I13 | Collections support **multi-state** symbols inside them | P0 | |
| I14 | Collections support **navigation links** on inner symbols (with current-asset context) | P1 | |
| I15 | **Sort collection by attribute value** (2025) — e.g. "top 5 hottest assets" | P1 | |
| I16 | Layout/paging behaviour for large collections | P1 | |
| I17 | Collections work with **custom/extension symbols** (`supportsCollections`) | P1 | |

---

## J. Dynamic search criteria (data-driven symbol population)

| # | Capability | Pri | Status |
|---|---|---|---|
| J1 | **Add Dynamic Search Criteria** to a symbol | P0 | |
| J2 | Supported on **Asset Comparison Table** | P0 | |
| J3 | Supported on **Bar Chart** | P1 | |
| J4 | Supported on **Trend** (dynamic trace population) | P1 | |
| J5 | Criteria: search root, descendants, asset type | P0 | |
| J6 | Criteria: attribute-value filters | P1 | |
| J7 | Results refresh as underlying assets/values change | P1 | |

---

## K. Time model

| # | Capability | Pri | Status |
|---|---|---|---|
| K1 | **Time bar** at the bottom of the display | P0 | |
| K2 | **Start time** field | P0 | |
| K3 | **End time** field | P0 | |
| K4 | **Duration** control (with presets) | P0 | |
| K5 | **Now** button (snap end time to current) | P0 | |
| K6 | **Shift backward / forward** arrows (by the current duration) | P0 | |
| K7 | **Revert display** to its saved/original time configuration | P1 | |
| K8 | Live mode: when end time = now, symbols **auto-update** on a refresh interval | P0 | |
| K9 | Configurable **update/refresh interval** (PI Vision default ≈ 5 s) | P0 | `[TRAVERSE-DELTA]` ours caps at ~1 s via MQTT RBE; must still be bounded |
| K10 | **Relative time expressions** (e.g. `*`, `*-8h`, `t`, `y`, weekday names, month names) | P0 | |
| K11 | **Absolute/fixed timestamps** | P0 | |
| K12 | **Time offsets** with units (s/m/h/d/w/mo/y), `+`/`-` | P0 | |
| K13 | Offsets valid **alone** in a field, resolving against an implied reference (start→now; end→start) | P1 | |
| K14 | Fractional offsets for s/m/h | P2 | |
| K15 | Validation + error messaging on malformed time input | P1 | |
| K16 | **Future time ranges** supported (end time beyond now) | P2 | |
| K17 | **Per-symbol time context** (a symbol can have its own time range independent of the display) | P1 | |
| K18 | Time zone control (display in a specified zone vs. client zone) | P2 | |
| K19 | Time range settable via **URL parameters** | P1 | |

---

## L. Calculations / expressions

| # | Capability | Pri | Status |
|---|---|---|---|
| L1 | **Calculations pane** in the designer | P1 | |
| L2 | **Add Calculation** — create an ad-hoc calculated data item | P1 | |
| L3 | **Calculation editor** with expression input | P1 | |
| L4 | Calculation **name** + **description**; name unique per display, reusable across displays | P1 | |
| L5 | **Drag data items into the expression** (auto-builds the expression) | P1 | |
| L6 | Arithmetic operators (`+`, `-`, `*`, `/`) | P1 | |
| L7 | Summary functions (Min, Max, Avg, Total, …) | P1 | |
| L8 | Conditional logic (`If … Then … Else`) | P2 | |
| L9 | **Preview** the calculation result before saving | P1 | |
| L10 | Edit an existing calculation (reopen from the pane) | P1 | |
| L11 | Calculation usable as a data item on **any symbol** (drag onto trend/gauge/table) | P1 | |
| L12 | **Tag-based** calculations (evaluated against raw series) | P1 | `[TRAVERSE-DELTA]` maps to IoTDB series |
| L13 | **Asset-based** calculations (evaluated in asset context; follow asset switching) | P1 | `[TRAVERSE-DELTA]` maps to our UNS/Asset Model |
| L14 | Advanced options: **stepped plot** | P2 | |
| L15 | Advanced options: **time interval** (auto / custom) | P2 | |
| L16 | Advanced options: conversion factor for totals | P2 | |
| L17 | Calculations included as **columns** in asset comparison tables | P2 | |
| L18 | **Admin-imposed limits** on calculation cost/complexity (2025) | P2 | |
| L19 | Guidance/policy: complex reusable logic belongs in the **analysis engine**, not ad-hoc display calcs | P1 | `[TRAVERSE-DELTA]` ours = Flink (recorded decision) |

---

## M. Navigation, URLs, and embedding

| # | Capability | Pri | Status |
|---|---|---|---|
| M1 | **Add Navigation Link** to any symbol / shape / image | P0 | |
| M2 | Link target: **another display** (with display search) | P0 | |
| M3 | Link target: **external URL** | P1 | |
| M4 | Link option: **carry time context** (set start/end on the target) | P1 | |
| M5 | Link option: **carry asset context** (set asset on the target) | P0 | |
| M6 | Link option: **use current asset** | P0 | |
| M7 | Text symbol can act as a hyperlink | P1 | |
| M8 | Navigation links work **inside collections** (per-instance asset context) | P1 | |
| M9 | **URL parameters**: start/end time | P1 | |
| M10 | **URL parameters**: asset/element context switch | P1 | |
| M11 | **URL parameter: kiosk mode** — read-only, chrome-free display | P0 | |
| M12 | **URL parameter: hide toolbar** | P1 | |
| M13 | **URL parameter: hide time bar** | P1 | |
| M14 | **URL parameter: hide sidebar** | P1 | |
| M15 | **URL parameter: time zone** | P2 | |
| M16 | **Ad-hoc display via URL** — construct a temporary trend display from specified data items | P2 | |
| M17 | Deep-linkable display URLs (id + name) | P0 | |
| M18 | Programmatic open from external applications | P1 | |
| M19 | Breadcrumb / hierarchical navigation between displays | P2 | |
| M20 | **ISA-101 display hierarchy** navigation (L1 overview → L2 unit → L3 detail → L4 faceplate) | P0 | `[TRAVERSE-DELTA]` standards requirement beyond PI Vision |

---

## N. Events / event frames

**`[TRAVERSE-DELTA]` We already have an ISA-18.2 alarm state machine, lifecycle, ACK, shelving, and KPIs in Flink+PostgreSQL. PI Vision's "event frames" are the closest analogue. Audit whether these are exposed *as display symbols/panes* in the designer, not just in the standalone alarm console.**

| # | Capability | Pri | Status |
|---|---|---|---|
| N1 | **Events pane/tab** in the display (left side) | P0 | |
| N2 | Events auto-scoped by the **display time range** and **symbol asset context** | P0 | |
| N3 | **Severity colour coding** on events | P0 | |
| N4 | **Edit event search criteria** (broaden/narrow beyond default scope) | P1 | |
| N5 | **Events table symbol** placeable on the canvas | P0 | |
| N6 | Events table: configurable **columns** | P1 | |
| N7 | Events table: show **event attributes** as columns | P1 | |
| N8 | Events table: show **related asset attributes** as columns | P2 | |
| N9 | **Event details** view (right-click → details; auto trend + table of event context) | P1 | |
| N10 | **Compare similar events** (by name/type) side by side | P2 | |
| N11 | Find **related events** for an asset | P1 | |
| N12 | Event **acknowledgement** from the display | P0 | `[TRAVERSE-DELTA]` we have full ISA-18.2 ACK lifecycle — must be reachable from a designed display |
| N13 | Event **annotation / comments** | P1 | |
| N14 | Multi-state colouring driven by **event/alarm state** | P0 | |
| N15 | Event severity/priority mapping | P0 | |
| N16 | Gantt-style event visualization | P2 | |
| N17 | Alarm **shelving / suppression** reachable from a display | P1 | `[TRAVERSE-DELTA]` ISA-18.2 |
| N18 | **EEMUA 191 KPI** surfacing (alarm rates, standing alarms) as display symbols | P1 | `[TRAVERSE-DELTA]` beyond PI Vision |

---

## O. Data search & asset browsing (designer-side)

| # | Capability | Pri | Status |
|---|---|---|---|
| O1 | **Assets pane** with a navigable hierarchy tree | P0 | |
| O2 | **Drill down** through the hierarchy | P0 | |
| O3 | Select among multiple **databases/servers/scopes** | P1 | |
| O4 | **Search pane** for data items | P0 | |
| O5 | Search **assets/elements** by name | P0 | |
| O6 | Search **attributes/measurements** by name | P0 | |
| O7 | Search **raw tags/points** by name | P0 | |
| O8 | Search by **description** | P1 | |
| O9 | **Wildcard `*`** support (implicit trailing wildcard) | P1 | |
| O10 | **Single-char wildcard `?`** support | P2 | |
| O11 | **Scope/limit the search** to a subtree or a specific source | P1 | |
| O12 | **Multi-select** data items (Ctrl+click) and drag as a group | P0 | |
| O13 | Search results are **drag sources** onto the canvas | P0 | |
| O14 | Filter by attribute/tag metadata | P2 | |
| O15 | **Copy data context** — copy the datasource path from a symbol (2025) | P2 | |
| O16 | Browsing is **UNS-native** (contextual path, not raw storage path) | P0 | `[TRAVERSE-DELTA]` bind via `path + role`; never a raw IoTDB path or MQTT topic |

---

## P. Units of measure

| # | Capability | Pri | Status |
|---|---|---|---|
| P1 | UOM stored/known per attribute | P1 | |
| P2 | **Switch UOM per data item and per symbol** at design time | P1 | |
| P3 | UOM dropdown in symbol config (Style section) | P1 | |
| P4 | Conversion applied to displayed value (e.g. kPa→psi, °C→°F) | P1 | |
| P5 | Show/hide units on symbols | P0 | |
| P6 | UOM respected in tables/gauges/trends consistently | P1 | |

---

## Q. Keyboard shortcuts

| # | Shortcut | Pri | Status |
|---|---|---|---|
| Q1 | `Ctrl+C` copy | P0 | |
| Q2 | `Ctrl+V` paste | P0 | |
| Q3 | `Ctrl+X` cut | P0 | |
| Q4 | `Delete` / `Backspace` delete | P0 | |
| Q5 | Arrow keys — move/nudge object | P1 | |
| Q6 | `Ctrl+Click` — multi-select | P0 | |
| Q7 | `Ctrl+A` — select all | P1 | |
| Q8 | `Shift+Drag` — resize preserving proportions | P1 | |
| Q9 | `Ctrl+Z` — undo | P0 | |
| Q10 | `Ctrl+Y` — redo | P0 | |
| Q11 | `Ctrl+S` — save | P0 | |
| Q12 | `Shift` while drawing a line — snap to 45° | P2 | |

---

## R. Security, roles, and sharing

**`[TRAVERSE-DELTA]` Our model is recorded: admin-created users only (no signup), ISA-101 role tiers (admin/engineer/operator/viewer), JWT + Argon2id, EMQX ACLs, asset-scope filtering, and the two-tier controlled-display vs `operator_views` split.**

| # | Capability | Pri | Status |
|---|---|---|---|
| R1 | Role: **Administrator** (global settings, user access, data sources) | P0 | |
| R2 | Role: **Publisher/Engineer** (create, edit, save, share displays) | P0 | |
| R3 | Role: **Explorer/Operator** (view + interact, **cannot save**) | P0 | |
| R4 | Explorer/Operator **can** locally modify a display in-session (add a trace, change a symbol) for ad-hoc analysis… | P1 | |
| R5 | …but those changes **do not persist** and are invisible to others | P0 | `[TRAVERSE-DELTA]` our `operator_views` gives operators a *sanctioned* persistence path instead |
| R6 | Role: **Viewer** (read-only) | P1 | |
| R7 | Role: service/utility account for programmatic access | P2 | |
| R8 | Roles assigned to **groups/identities**, not individuals | P1 | |
| R9 | **Display ownership** concept (owner shown, owner transferable) | P1 | |
| R10 | **Share a display** with users/groups | P0 | |
| R11 | Share with **read** access | P0 | |
| R12 | Share with **edit/write** access (collaborative editing of one display) | P1 | |
| R13 | Per-**folder** permissions gating contained displays | P1 | |
| R14 | Permission **inheritance** from parent folder | P1 | |
| R15 | Private vs. public/shared displays | P0 | |
| R16 | Least-privilege guidance (most users are read-only) | P1 | |
| R17 | **Asset-scoped** authorization (user only sees assets in scope) | P1 | `[TRAVERSE-DELTA]` scope against contextual UNS; enforced in the Binding Resolver/BFF |
| R18 | Enforcement is **server-side**, not just UI hiding | P0 | |
| R19 | Audit trail of display changes (who/when) | P1 | `[TRAVERSE-DELTA]` MOC requirement under ISA-101 |
| R20 | **Display version history + rollback** | P1 | `[TRAVERSE-DELTA]` recorded decision (`display_versions`, diff, comments) |

---

## S. Administration

| # | Capability | Pri | Status |
|---|---|---|---|
| S1 | Admin site / admin console | P1 | |
| S2 | Manage **user access levels** / role mapping | P0 | |
| S3 | Manage **data source** configuration | P1 | |
| S4 | Set **default symbol configurations** across all displays | P2 | |
| S5 | Bulk display management (move/reassign) | P1 | |
| S6 | **Usage monitoring** (which displays are used, by whom) | P2 | |
| S7 | Recycle-bin administration / purge | P2 | |
| S8 | Limits on expensive user operations (calculation throttling) | P2 | |
| S9 | Health/diagnostics of the visualization service | P1 | |

---

## T. Extensibility

PI Vision exposes a formal custom-symbol framework — third parties ship large symbol libraries on it. **`[TRAVERSE-DELTA]` our equivalent should be a web-component/SVG symbol registration model (OpenBridge-native), not AngularJS.**

| # | Capability | Pri | Status |
|---|---|---|---|
| T1 | **Custom symbol framework** — third-party symbols registerable into the palette | P1 | |
| T2 | Symbol definition: **type name**, icon, default config | P1 | |
| T3 | Symbol definition: **datasource behaviour** (single vs. multiple data items) | P1 | |
| T4 | Symbol definition: **data shape** (value / trend / table / …) | P1 | |
| T5 | Symbol declares **`supportsCollections`** | P1 | |
| T6 | Symbol declares **state variables** (e.g. multi-state colour) participation | P1 | |
| T7 | Custom **configuration pane** per symbol | P1 | |
| T8 | Lifecycle hooks: **init**, **onDataUpdate**, **onResize** | P1 | |
| T9 | Custom symbols auto-registered/discovered at load | P1 | |
| T10 | **Custom tool panes** (left-rail extensions alongside Search/Events) | P2 | |
| T11 | Symbols appear in the palette alongside native ones | P1 | |
| T12 | Content Security Policy compatible | P1 | |
| T13 | Format-copy participation when switching symbol types | P2 | |
| T14 | Documented extension API + examples | P2 | |

---

## U. Runtime, performance, and platform

| # | Capability | Pri | Status |
|---|---|---|---|
| U1 | Runs in modern browsers, no client install | P0 | |
| U2 | **Mobile / tablet** support (iOS, Android) | P1 | |
| U3 | Responsive / touch gestures | P2 | |
| U4 | **Kiosk mode** for control-room wall displays / video walls | P0 | |
| U5 | Live auto-refresh without manual reload | P0 | |
| U6 | Efficient handling of **many symbols** on one display | P0 | |
| U7 | Bounded update rate (display refresh cap) | P0 | `[TRAVERSE-DELTA]` ~1 s cap; per-open-screen MQTT subscription only |
| U8 | **Snapshot-on-open** — display paints immediately with current values | P0 | `[TRAVERSE-DELTA]` mandatory (Redis snapshot; QoS-0/no-retain Sparkplug) |
| U9 | Decimated/aggregated history queries sized to plot width | P0 | `[TRAVERSE-DELTA]` `historian-bff /trend?width=` |
| U10 | Scales to many concurrent viewers | P0 | |
| U11 | Graceful degradation on data-source loss (quality shown, not blank/stale) | P0 | `[TRAVERSE-DELTA]` NE107 |

---

## V. Explicitly out of scope / not applicable

| # | PI Vision capability | Disposition |
|---|---|---|
| V1 | PI ProcessBook display migration utility | `[N/A]` no legacy ProcessBook estate |
| V2 | PI DataLink (Excel add-in) | `[N/A]` separate product, not the HMI designer |
| V3 | Windows/AD-integrated authentication | `[TRAVERSE-DELTA]` we use native admin-created users + JWT; AD/OIDC federation is a later seam |
| V4 | PI Web API / PI Server-specific protocol coupling | `[N/A]` our equivalents are the Binding Resolver/BFF + Sparkplug + IoTDB |
| V5 | Server-side rendered PDF/thumbnail generation | `[TRAVERSE-DELTA]` recorded decision: thumbnails client-side at save; automated report images deferred |
| V6 | AngularJS-based extensibility internals | `[TRAVERSE-DELTA]` we target web components / SVG registration |

---

## W. Traverse-only requirements (beyond PI Vision)

These are **not** PI Vision features but are mandatory for us. They must appear in the audit as first-class items.

| # | Requirement | Pri | Status |
|---|---|---|---|
| W1 | **ISA-101 controlled displays** (engineer-owned, versioned, MOC-gated, audited deploy) | P0 | |
| W2 | **`operator_views`** — operator-owned personal views (trend groups/watchlists/favourites), no MOC | P1 | |
| W3 | **Config-only persistence** — the saved display contains bindings, never process values (enforced by an automated invariant test) | P0 | |
| W4 | **Quality-on-open** — NE107/ISA-18.2 status surfaced on every reopen | P0 | |
| W5 | **UNS binding** — `path + role` resolved by the Binding Resolver/BFF to Sparkplug / IoTDB / SignalR | P0 | |
| W6 | **Contextual namespace** `root.<site>.<unit>.<device>.<measurement>` used end to end | P0 | |
| W7 | **HPHMI palette** — muted base, colour reserved for abnormal (ISA-101 / OpenBridge themes) | P0 | |
| W8 | **ISA-5.1** process symbol coverage | P1 | |
| W9 | **CQRS discipline** — designer/runtime never reads current values from the historian | P0 | |
| W10 | **Per-open-screen MQTT subscription**, unsubscribe on navigation | P0 | |

---

## Audit output requirements

Produce `/docs/migration/03-pi-vision-parity-audit.md` containing:

1. **Scorecard** — per section: `✅ / 🟡 / ❌ / ⛔` counts and % complete; plus an overall **P0 completion %** (the headline number).
2. **Annotated checklist** — every row above with a status and, for `✅`/`🟡`, the implementing file paths and symbols.
3. **Gap backlog** — all `❌` and `🟡` items, sorted P0 → P2, each mapped to a migration phase (Phase 2 designer MVP, Phase 3 templates/multi-state/personal views, Phase 4 analysis, Phase 5 hardening) and sized (S/M/L).
4. **Critical-path callout** — the P0 gaps that block a credible "PI-Vision-class HMI builder" claim.
5. **Doc-vs-code discrepancies** — anything our documentation asserts that the code does not implement.
