# PDIX Import — Gap Analysis

**Scope:** Why components disappear after importing an AVEVA PI Vision `.pdix` display into the AMS
HMI Designer. Verified against the importer code and the bytes of a real display export
(`301-Kiln`), reconciled with the post-import canvas screenshot.

**Sample used as ground truth:** `src/xmlgraphics-batik-main ScreeN Import/.../301-Kiln.zip`
(a `.pdix` renamed to `.zip`; `display_json` + `metadata_json`). This is the *Margoon Cement*
kiln display — the same content shown in the screenshot (Kiln Feed, Calciner, Clinker 1/2, Gypsum,
Additive, Total Feedrate). **ProductVersion `3.7`** (PI Vision 2021-era), 721 symbols.

> The dedicated source `.pdix` was not separately attached, but the repo bundles the exact display in
> the screenshot, so the "intended ground truth" below is read from the actual file bytes, not
> reconstructed.

> **⚑ Remediation landed — see [§8 Remediation status](#8-remediation-status-implemented) for what the
> backlog below now does, and how each item was verified against the real `301-Kiln` bytes.**

---

## 1. Pipeline map (file by file)

The entire import runs **client-side in the browser** — there is no server importer.

| Stage | File / function | What it does |
|---|---|---|
| Entry / upload | [ImportPage.tsx](../../src/frontend-ob/src/components/Designer/ImportPage.tsx) `parse()` | File picker / drop zone (`accept=".pdix,.zip"`) → calls `importPdix(file)`. Nothing is uploaded until Save. |
| Unzip + parse | [pdixImport.ts:73-78](../../src/frontend-ob/src/services/import/pdixImport.ts#L73-L78) `importPdix()` | `JSZip.loadAsync` → reads the `display_json` ZIP entry → `JSON.parse` → `display.Symbols[]`. |
| Symbol iteration | [pdixImport.ts:85-131](../../src/frontend-ob/src/services/import/pdixImport.ts#L85-L131) | `forEach` over `Symbols`; per symbol reads `SymbolType`, `Configuration` (Top/Left/Width/Height/…), first `DataSources` entry. |
| Type mapping | [pdixImport.ts:19-39](../../src/frontend-ob/src/services/import/pdixImport.ts#L19-L39) `TYPE_MAP` + `RENDERABLE_MAPPED_TYPES` | The coverage baseline (see §4). |
| Binding normalization | [pdixImport.ts:57-71](../../src/frontend-ob/src/services/import/pdixImport.ts#L57-L71) `normalizeBinding()` / `firstBinding()` | Strips the `pi:\\` / `af:\\` prefix + GUID query segments; makes a readable path string. **Does not resolve to the UNS.** |
| Persisted model | `ImportPage.save()` → `PUT /api/displays/:id/content` | Persists `{ items, settings }` only. |
| Canvas render | [SymbolRenderer.tsx](../../src/frontend-ob/src/components/Designer/SymbolRenderer.tsx) → [CustomSymbols.tsx](../../src/frontend-ob/src/components/Designer/CustomSymbols.tsx) | `shape.*` / `ind.gauge` render via `CustomSymbols`; `obc.readout-unit` + `chart.trend` render in `SymbolRenderer`; unknown `item.type` → a `❓` box. |

### Behaviour on an unknown type / unresolved binding

- **Unknown `SymbolType`** → *not* silently dropped in the parser: it is recorded in `unmapped[]`
  **and** a placeholder `shape.rect` is pushed with `fill:'none'`, `stroke:'var(--ams-warn)'`,
  `strokeWidth:1`, `label:'⚠ <type>'` ([pdixImport.ts:105-114](../../src/frontend-ob/src/services/import/pdixImport.ts#L105-L114)).
- **Unresolved binding** → the readout still imports; at render time an unbound `obc.readout-unit`
  shows a `{leaf}` tag placeholder, never a live value
  ([SymbolRenderer.tsx:342-347,383-387](../../src/frontend-ob/src/components/Designer/SymbolRenderer.tsx#L342-L387)).
  There is **no** UNS resolution step anywhere in the import path.

**The real silent-failure hole is downstream, not in the parser:**

1. The `unmapped[]` report is shown once in the ImportPage review card, then **discarded on Save** —
   `save()` persists only `{ items, settings }`, never `unmapped`/`stats`. Re-opening the imported
   display in the designer, there is **no record** of what was lost.
2. The placeholder that survives is a `fill:none`, **1px** warn outline. On a ~2100×880 canvas it is
   effectively invisible — including a **1862×831** empty outline for the whole-plant background SVG.
3. Nothing is logged to the console. `group` symbols are dropped with no `unmapped[]` entry at all
   ([pdixImport.ts:103](../../src/frontend-ob/src/services/import/pdixImport.ts#L103)).

So the claim in the code comments ("never silently dropped") is true *in the review dialog* and false
*on the persisted canvas*.

---

## 2. Source symbol inventory (from the file bytes)

721 symbols, 8 distinct `SymbolType` values:

| # | SymbolType | Count | DataSources | Notes |
|---|---|---:|---|---|
| 1 | `statictext` | 257 | none | Unit/tag labels (`°C`, `mbar`, `%`, `t/h`, equipment tags). All transparent fill. 16 carry `LinkURL` navigation (see below). |
| 2 | `rectangle` | 204 | none | Equipment blocks + status fills (`#868686` gray ×139, `#800080`, `#3cbf3c`, `#00b5c1`, `#ed1c24`, `#fff000` ×3 yellow nav buttons). |
| 3 | `value` | 149 | 1 each | Numeric readouts. `DataShape:"Value"`. Bindings are raw PI/AF paths (mostly `…/AI_PV_Out#Value`). |
| 4 | `graphic` | 102 | none | **External SVG library symbols** (`DirectoryKey:"Margoon Cement"`, `FileKey:"Group 486"`, `"Kiln Full svg"`, …). This is the entire P&ID: 1 full-canvas background + 101 equipment icons (pumps/valves/motors). |
| 5 | `line` | 5 | none | Connector lines. |
| 6 | `ellipse` | 2 | none | Small circles. |
| 7 | `trend` | 1 | 2 | `DataShape:"Trend"`, 2 pens (`PV`, `Pressure`), `TraceSettings`, `ValueScaleSetting`, `TrendConfig`. |
| 8 | `group` | 1 | none | Structural container; `Configuration.Children:["Symbol700","Symbol701"]` (both exist as top-level symbols). |

**Bindings:** 151 total — **145 `pi:`** (raw PI tags) + **6 `af:`** (AF asset paths). Zero already in UNS form.

**MultiState:** **136 of 721** symbols carry a `MSSymbolsIds` / `MSDataSources` multi-state definition
(93 `graphic`, 20 `statictext`, 14 `rectangle`, 9 `value`) — the dynamic colour/state behaviour that
turns a pump green-on-run, a value red-on-alarm, etc.

**Navigation:** 16 symbols carry a `Configuration.LinkURL` (e.g. `./#/Displays/189/101---Crusher-Detail`,
`https://piv.hillal-intl.com:8070/PIVision/#/…`) — the yellow "… Display" / "Detail" jump buttons.

---

## 3. Three-way reconciliation (source ↔ code ↔ screenshot)

Reconciled at the type-group level (721 rows is impractical; behaviour is uniform within a type).

| SymbolType | Cnt | Importer maps to | In screenshot? | Status | Explanation |
|---|---:|---|---|:--:|---|
| `statictext` | 257 | `shape.label` | **Yes** — the `°C`/`mbar`/`%`/tag text and equipment labels | ✅ RENDERED | Text + geometry preserved. *But* 20 lose MultiState and up to 16 lose `LinkURL` → 🟨 for those. |
| `rectangle` | 204 | `shape.rect` | **Yes** — the gray/coloured equipment blocks + 3 yellow buttons | ✅ RENDERED | Fill/geometry preserved. 14 lose MultiState; the 3 yellow nav rects lose `LinkURL` → dead buttons (🟨). |
| `value` | 149 | `obc.readout-unit` | **Yes but empty** — the `{…}` placeholder readouts ("{Pressure}"-style tokens) | 🟦 BINDING-UNRESOLVED | Imports + placed, but every binding is a raw `pi:`/`af:` path never resolved to the UNS, so no live value ever appears. |
| `graphic` | 102 | ⚠ placeholder `shape.rect` (1px, no fill) | **No** — the P&ID linework, vessel outlines, and equipment icons are absent | 🟥 DROPPED (custom SVG) | External symbol-library SVGs (`DirectoryKey`/`FileKey`) with no local equivalent. Includes the full-canvas background schematic. This is the bulk of the "missing" look. |
| `line` | 5 | `shape.line` | Yes | ✅ RENDERED | — |
| `ellipse` | 2 | `shape.circle` | Yes | ✅ RENDERED | — |
| `trend` | 1 | `chart.trend` | Partly — a chart frame, no data | 🟨 PARTIAL | Only `DataSources[0]` is kept ([pdixImport.ts:68-70,126](../../src/frontend-ob/src/services/import/pdixImport.ts#L68-L70)); the 2nd pen, `TraceSettings`, scales & `TrendConfig` are dropped, and the one binding is unresolved anyway. |
| `group` | 1 | *skipped, no placeholder* | n/a (children render) | ⬛ CONTAINER | Benign here — `Children` (`Symbol700/701`) exist as top-level symbols and render on their own. Would lose content if a group ever nested non-top-level children or carried a transform. |

**Why the screenshot looks "half empty":** the display's entire *visual structure* — background P&ID,
pipe runs, vessel/equipment iconography — lives in the **102 `graphic`** symbols, and every one is
routed to an invisible 1px placeholder. What remains visible is exactly the non-graphic layer:
`rectangle` blocks, `statictext`, and unbound `value` readouts floating without their equipment context.

---

## 4. Symbol-type coverage matrix

`TYPE_MAP` keys (lowercased `SymbolType` → AMS type), from
[pdixImport.ts:19-31](../../src/frontend-ob/src/services/import/pdixImport.ts#L19-L31):

| PI Vision type key(s) | Maps to | Renderer exists? | Seen in sample | Verdict |
|---|---|:--:|:--:|---|
| `rectangle`,`simplerectangle`,`rect` | `shape.rect` | ✅ CustomSymbols | 204 | Covered |
| `line`,`simpleline` | `shape.line` | ✅ | 5 | Covered |
| `ellipse`,`circle`,`simplecircle` | `shape.circle` | ✅ | 2 | Covered |
| `polygon` | `shape.polygon` | ✅ | 0 | Covered |
| `statictext`,`text`,`label`,`simpletext` | `shape.label` | ✅ | 257 | Covered (text only — LinkURL/MultiState dropped) |
| `value`,`numeric`,`indicator` | `obc.readout-unit` | ✅ | 149 | Covered (binding unresolved) |
| `trend`,`chart` | `chart.trend` | ✅ | 1 | Covered but lossy (single pen, no scales) |
| `radial`,`radialgauge`,`gauge`,`bargauge`,`verticalgauge` | `ind.gauge` | ✅ | 0 | Covered |
| **`graphic`** | ⚠ placeholder | n/a | **102** | **Not covered** — no external-SVG-library support (§5.1) |
| **`group`** | (skipped) | n/a | **1** | Handled as structural; no placeholder emitted |

### Native PI Vision types absent from `TYPE_MAP` but *renderable by our app*

These do **not** appear in the 301-Kiln file, but they are common in other PI Vision displays and would
each fall to the ⚠ placeholder today even though AMS already has a matching renderer — a latent coverage
gap (verify exact `SymbolType` strings against a file that contains them, as names drift by version):

| PI Vision concept | Our existing renderer | In `TYPE_MAP`? |
|---|---|:--:|
| Table / value table | `TableSymbol` (`table.value`) | ❌ |
| Time-series table | `TimeSeriesTable` (`table.timeseries`) | ❌ |
| Asset comparison table | `AssetComparisonTable` (`table.compare`) | ❌ |
| Bar chart | `BarChart` (`chart.bar`) | ❌ |
| XY / scatter plot | `XYPlot` (`chart.xy`) | ❌ |
| Collection (asset template repeater) | `CollectionRenderer` (`collection.container`) | ❌ |
| Events / alarm table | `AlarmTable` (`alarm.table`) | ❌ |

---

## 5. Root causes (grouped)

### 5.1 🟥 Custom / external-library symbols — `graphic` (102) — *the dominant gap*
`graphic` symbols reference a PI Vision **symbol-library asset** by `DirectoryKey` + `FileKey`
(e.g. `Margoon Cement / Kiln Full svg`), not inline geometry. The importer has no way to fetch that
SVG (it lives on the PI Vision server, not in the `.pdix`), so it emits an invisible placeholder.
93 of these also carry MultiState. **Evidence:** `TYPE_MAP` has no `graphic` key
([pdixImport.ts:19-31](../../src/frontend-ob/src/services/import/pdixImport.ts#L19-L31)); the `graphic`
branch pushes a `fill:none` 1px rect ([pdixImport.ts:96-101](../../src/frontend-ob/src/services/import/pdixImport.ts#L96-L101));
the largest is 1862×831 (the whole background). **These are genuinely unmappable and must be rebuilt**
from the AMS symbol catalog — not "fixed" in the importer.

### 5.2 🟦 Binding resolution stops at string-cleanup
`normalizeBinding` strips prefixes/GUIDs but never maps the PI/AF path to a UNS
`root.<site>.<unit>.<device>.<measurement>` address, and no slot is resolved against the Binding
Resolver at import time. All 151 readouts/trends therefore render as `{tag}` placeholders with no data.
**Evidence:** [pdixImport.ts:57-71](../../src/frontend-ob/src/services/import/pdixImport.ts#L57-L71),
[pdixImport.ts:126-127](../../src/frontend-ob/src/services/import/pdixImport.ts#L126-L127); the readout
placeholder path [SymbolRenderer.tsx:383-387](../../src/frontend-ob/src/components/Designer/SymbolRenderer.tsx#L383-L387).

### 5.3 🟨 Configuration-field coverage / version drift (data-bound symbols render *wrong*)
Fields the importer never reads, so behaviour is lost even when the symbol renders:
- **MultiState** (136 symbols): `MSSymbolsIds`/`MSDataSources` ignored → no colour-by-state / dynamic
  visibility. This is why "the pump doesn't turn green."
- **Navigation `LinkURL`** (16 symbols): ignored → the yellow "… Display"/"Detail" buttons render as
  inert boxes; drill-down navigation is gone.
- **Trend** keeps only `DataSources[0]`; drops the 2nd pen, `TraceSettings`, `ValueScaleSetting`,
  `TrendConfig`.
- **Text detail:** `Align`, `FontSize` for `value` is read but `statictext` `Align`, rotation on some
  shapes, `StrokeStyle`, `Arrows`/`Points` on lines are not fully carried.

### 5.4 ⬛ Container / group handling
`group` is skipped with **no** `unmapped[]` entry and no placeholder
([pdixImport.ts:103](../../src/frontend-ob/src/services/import/pdixImport.ts#L103)). Safe only because
PI Vision stores group children as top-level symbols. Collections / dynamic-search-criteria containers
(not present in this file) would import as nothing today (no `collection` key in `TYPE_MAP`).

### 5.5 Silent failure downstream (the meta-cause)
Parser-level reporting is good; **persistence and canvas visibility are not.** `unmapped`/`stats` are
dropped on Save, placeholders are near-invisible, `group` drops are unreported, and nothing is logged.
The display engineer sees a sparse canvas with no in-product explanation of what was lost.

---

## 6. Prioritized fix backlog

### P0 — make failures loud & the placeholders visible (small, high leverage)
1. **Persist the import report.** Save `unmapped[]` + `stats` with the display (e.g. a `_import` block
   on the snapshot or a note item), so re-opening it shows "102 external symbols, 151 unresolved
   bindings" instead of a mystery. (`ImportPage.save()` + display-service content payload.)
2. **Make the placeholder visible & self-describing.** Give the ⚠ placeholder a filled tint
   (`var(--ams-warn)` @ low alpha) + always-on label + hover-title with `DirectoryKey/FileKey` (or the
   unmapped reason), so a dropped symbol is obvious on the canvas. Fixes the "1px invisible box" problem
   including the full-canvas background. (`pdixImport.ts:96-114`.)
3. **Report `group` drops** (add an `unmapped`/info entry) and `console.warn` a one-line summary at the
   end of `importPdix`, so drops are never zero-trace.

### P1 — close the fixable coverage gaps
4. **Add the missing native `TYPE_MAP` entries** for types our app already renders (§4): table,
   time-series table, asset-comparison table, bar chart, XY plot, collection, events/alarm table.
   Key off `Configuration.DataShape` as well as `SymbolType` (PI Vision encodes shape there:
   `Value`/`Trend`/`Table`/`Gauge`/…).
5. **Binding resolution to UNS.** Add a mapping step (PI/AF path → UNS path+role), even a best-effort
   heuristic + a "resolve on open" pass through the Binding Resolver, so readouts light up. Until then,
   surface the count of unresolved bindings (P0-1).
6. **MultiState → conditional rules.** Translate `MSDataSources` + state definitions into the existing
   `multiStateConfig`/`ruleEngine` fields (already fillable per the importer's own header comment), at
   least colour-by-state for value/rectangle symbols.
7. **Navigation.** Map `Configuration.LinkURL` → the item's navigation field (PI Vision
   `#/Displays/<id>` → AMS display link) so drill-down buttons work.
8. **Trend fidelity.** Emit a pen per `DataSources` entry (not just `[0]`) and carry `TraceSettings`
   colours + `ValueScaleSetting`.

### P2 — external symbol library (the must-rebuild boundary)
9. **`graphic` symbols** cannot round-trip from the `.pdix` alone (the SVG lives on the PI server).
   Options, in order of effort: (a) an **import mapping table** `FileKey → AMS symbol id` so recognised
   library icons (pump/valve/motor) map to native equipment symbols; (b) a one-time export of the PI
   symbol library to SVG that the importer can embed; (c) accept manual rebuild for the background P&ID.
   **Do not present these as auto-fixable** — flag them for manual rebuild with the P0 report driving
   the worklist.

**Fixable vs must-rebuild:** P0 + P1 (types 1–8) are code fixes that recover *rendering, data, dynamics,
and navigation*. P2 (`graphic`/external SVG library) is inherently partial — the icon *positions* import,
but the artwork must be re-created or mapped to AMS symbols.

---

## 7. Doc-vs-code / version notes

- **Sample `ProductVersion` = `3.7`** (PI Vision 2021-era). `Configuration` shapes and `SymbolType`
  names drift across 2019/2021/2024/2025; the importer keys on a fixed lowercase `SymbolType` set and
  will silently placeholder anything a newer/older version renames. Cross-check the missing native types
  (§4) against a file that actually contains them before wiring their exact keys.
- The importer's own header comment says dropped fields (rules, multiState, nav, secondary bindings) are
  "fillable" — they are declared on `CanvasItem` but **not populated** today (§5.3). The scaffolding
  exists; the mapping code does not.
- `metadata_json` records the origin server (`SRV-PIVision01.Margoon.local`) — useful context for the
  P2 symbol-library export, since the `graphic` artwork lives there, not in the export.

---

## 8. Remediation status (implemented)

The backlog in §6 has been implemented and verified against the real `301-Kiln` bytes (an offline
harness runs the actual `importPdix` over the sample; synthetic fixtures cover types the sample lacks).
`npm run build` (tsc + vite) is clean. Changes are confined to the importer and its render/persist path:
[pdixImport.ts](../../src/frontend-ob/src/services/import/pdixImport.ts),
[CustomSymbols.tsx](../../src/frontend-ob/src/components/Designer/CustomSymbols.tsx),
[thumbnail.ts](../../src/frontend-ob/src/components/Designer/thumbnail.ts),
[ImportPage.tsx](../../src/frontend-ob/src/components/Designer/ImportPage.tsx),
[DisplayDesigner.tsx](../../src/frontend-ob/src/components/Designer/DisplayDesigner.tsx).

### P0 — failures are now loud
- **Visible placeholder.** Unmapped symbols emit a dedicated `import.unmapped` type rendered as a
  **dashed caution box with its type/FileKey label + a reason tooltip** — replacing the old invisible
  `fill:none` 1px outline (which never even drew its label). Shows in the canvas *and* the thumbnail/preview.
- **Persisted report.** `settings.importReport` (counts, per-type tally, unmapped list, notes) travels
  with the display. The designer **seeds it on load, re-saves it** (the save path rebuilds `settings`,
  so it would otherwise be dropped on first save), and shows a **dismissible review banner** every time
  the imported display is reopened. `ImportPage` stamps `importedAt`.
- **No silent drops.** `group` containers are recorded in the notes; a one-line summary is `console.warn`ed.
- *Verified:* 721 → 618 rendered + 102 placeholders (all with label+tooltip); the full-canvas
  `Kiln Full svg` background renders as a labelled caution box instead of vanishing.

### P1 — coverage, dynamics, navigation, bindings
- **Native types.** Mapping is keyed on `Configuration.DataShape` (stable) first, then `SymbolType`,
  and now covers table → `table.value`, time-series → `table.timeseries`, XY → `chart.xy`,
  bar → `chart.bar`, asset-comparison → `table.compare`, collection → `collection.container`,
  events → `alarm.table`, gauges → `ind.gauge`. (All target renderers degrade to an "empty — configure"
  state, so mapping is crash-safe.) *Verified via synthetic fixtures; the container types render their
  own empty state when the PDIX criteria didn't round-trip.*
- **Multi-pen trends.** A trend now emits **one pen per `DataSources` entry** (was `[0]` only).
  *Verified:* the sample trend imports 2 pens.
- **Readout fidelity.** Decimals come from `FormatType` (`N0`→0, `N2`→2), unit visibility from `ShowUOM`
  (was hardcoded `decimals:1`/`showUnit:true`). *Verified:* readout decimals now match the source
  distribution exactly (113×0, 27×1, 9×2).
- **Navigation.** `LinkURL` → `NavigationLink` (honoured by the Phase-D runtime). Absolute `https` PI
  links work as-is; internal PI routes are carried and **flagged for repointing**. *Verified:* 16 links
  imported (10 external, 6 need remap), with parsed labels.
- **Binding resolution.** `pi:`/`af:` paths are normalized to the resolver's UNS contextual-path shape
  (`site/[…/]device.measurement`, lowercase + underscored). *Verified:* all 159 unique paths are
  resolver-parseable (≥2 `/`-segments, a `.`-measurement, no invalid chars); trend pens survive the
  `/` heuristic. They resolve to live data once the referenced assets exist in the Asset Model / an
  alias row is added — surfaced honestly as "unresolved (not yet verified against the Asset Model)".

### P2 — external symbol library
- **Keyword mapping.** A library graphic whose `DirectoryKey`/`FileKey` names a known equipment kind
  (pump/valve/motor/fan/compressor/tank/HX/…) maps to the native `equip.*` symbol, with its driver tag
  bound to the `status` slot; a **size guard** keeps oversized background schematics as placeholders.
  *Verified:* recognisable names (`Centrifugal Pump`→`equip.pump`, `On/Off Valve`→`equip.valve-onoff`,
  `Centrifugal Fan`→`equip.fan`, …) map correctly; the sample's opaque custom names (`Group 486`,
  `Kiln Full svg`) correctly stay placeholders — 301-Kiln output is unchanged (618/102), which is the
  honest result.

### Still genuinely unmappable (must rebuild — unchanged)
- **`graphic` artwork** with opaque/custom library names (the bulk of 301-Kiln's 102) — the SVG lives on
  the PI server, not in the `.pdix`. Now shown as labelled caution boxes for a scoped manual rebuild.
- **PI MultiState** (colour/visibility-by-value, 136 symbols) — PI Vision does **not** export the state
  definitions (thresholds/colours) in the `.pdix` (0 `_MULTISTATE` defs present in the file); only an
  opaque `MSSymbolsIds` reference. Counted and reported; re-author in the designer.
