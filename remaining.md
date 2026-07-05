# remaining.md — HMI Designer: PI Vision Parity, Design Principles & Build Plan

**Scope:** what AVEVA PI Vision does that our OpenBridge HMI Designer (`src/frontend-ob/src/components/Designer/`) does **not** yet do, whether our design/colors are truly OpenBridge-compliant, the design principles the designer must enforce, the PI Vision **import** strategy, and a phased plan to build every PI Vision capability.

Status legend: ✅ done · 🟡 partial/stub · 🟠 orphaned (built, not wired) · ❌ missing.

---

## Part 1 — Are our designs & colors according to OpenBridge?

**Mostly yes for symbols, partially no for the editor chrome.** Honest breakdown:

| Layer | Compliant? | Evidence |
|---|---|---|
| Automation/catalog symbols (~150) | ✅ Yes | Real `@oicl/openbridge-webcomponents-react` components (`renderers/automationRenderer.tsx`, `renderers/catalogRenderer.tsx`). Colors/sizing inherit OpenBridge tokens automatically. |
| Custom SVG symbols | 🟡 Token-first, imperfect fallbacks | `openBridgeTheme.ts` uses correct token names (`--alert-alarm-color`, `--element-active-color`, …) but with **fallback hexes that are not OpenBridge palette values** (`#1e293b`, `#64748b`, `#3b82f6` = Tailwind slate/blue). Token wins when the stylesheet loads, but the fallbacks drift from the design system. |
| Editor chrome CSS (`Designer.css`) | 🟠 Mixed | 257 `var(--token)` uses **and** 70 raw hexes. The offenders that matter: multistate lights, bar zones, and alarm colors are hardcoded `#dc2626 / #f59e0b / #22c55e` (`Designer.css:1330-1394`, `:877-878`) instead of `--alert-alarm/warning/caution/running-color`. These **won't theme-switch** (day/dusk/night/bright) and violate ISA-101 token discipline. |

**Action items (P1 cleanup):**
1. Replace every raw alarm/status hex in `Designer.css` and `SymbolRenderer.tsx`/`CustomSymbols.tsx` with OpenBridge alert tokens (`--alert-{alarm,warning,caution,running}-color` + `-container-background-color`).
2. Re-point `openBridgeTheme.ts` fallbacks to the real OpenBridge palette values (pull from `openbridge.css`), so token + fallback agree.
3. Add a lint guard (eslint/stylelint rule) forbidding raw hex outside `openbridge.css`, per the `openbridge` skill.

---

## Part 2 — HMI design principles the Designer must enforce

The target standard is **ISA-101 / IEC 62288 High-Performance HMI (HPHMI)**, which OpenBridge already encodes. The designer should not just *allow* good HMIs — it should *guide* toward them. `openBridgeTheme.ts:21` already states the core rule; make it systemic:

1. **Gray-scale normal, color for abnormal only.** Backgrounds and equipment at normal state are low-contrast gray; saturated color (red/amber/yellow) is reserved for alarms and out-of-limit states. No "rainbow" displays.
2. **Encode state redundantly** — shape, pattern, position, and text, **not color alone** (color-blind / accessibility; IEC 62288). E.g. a valve shows open/closed by geometry, not just fill.
3. **Context over raw numbers.** Prefer analog/deviation representations (bars, sparklines, moving indicators, setpoint deviation) so operators see *trend and normalcy band*, not just a digit. Every value symbol should optionally show its limit band.
4. **Consistency.** One symbol = one meaning across all displays; consistent placement of alarms, navigation, and time controls. Enforce via templates.
5. **Display hierarchy (HPHMI Levels 1–4):** Level 1 area overview → Level 2 unit control → Level 3 detail/loop → Level 4 diagnostic. The designer should support this via navigation + asset context (see Parts 3/5).
6. **Alarm presentation = ISA-18.2/IEC 62682:** blink-while-unacknowledged → steady-on-ack → clear-on-RTN; audible separate from visual; shelved/suppressed visually distinct. Always via OpenBridge alert components.
7. **Data quality = NAMUR NE107:** Good / Uncertain / Bad / Maintenance / OutOfService surfaced on every bound symbol (stale/bad data must be obvious). `openBridgeTheme.ts:getNamurState` already exists — wire it everywhere.
8. **Touch-first ergonomics:** 48px touch / 32px visual targets; larger size-variant class for panel deployments.
9. **Theme-aware:** every color path must survive `data-obc-theme` switching (day/dusk/night/bright). This is why Part 1's raw hexes must go.
10. **Typography:** Noto Sans + OpenBridge font tokens; no raw font sizes.

---

## Part 3 — PI Vision feature inventory → our status (the "remaining" list)

Everything PI Vision (formerly PI Coresight) offers, mapped to what we have. This is the master gap list.

### A. Canvas & editing
| PI Vision capability | Ours | Notes / target file |
|---|---|---|
| Drag to place, move, resize | ✅ | `DesignerCanvas.tsx` |
| Snap to grid | ✅ | `DesignerCanvas.tsx` |
| Multi-select (marquee + shift-click) | ❌ | dead code `DesignerCanvas.tsx:47` |
| Group / ungroup | 🟡 | model supports groups; no UI group/ungroup action |
| Align / distribute / same-size | ❌ | none |
| Order: bring-to-front/back, forward/back | 🟡 | z-index number field only, no buttons |
| Rotate / flip H-V | 🟡 | rotation prop exists; no handle/flip UI |
| Copy / paste / duplicate | 🟡 | duplicate only |
| Undo / redo (all edits) | 🟡 | **doesn't capture move/resize/property edits** `DisplayDesigner.tsx:167` |
| Zoom (buttons + mouse wheel) | 🟡 | buttons only, no wheel |
| Pan (space-drag / scroll) | ❌ | none |
| Rulers / guides / smart guides | ❌ | none |
| Layers | ❌ | none |
| Lock / hide element | 🟡 | lock flag in inspector; no hide |
| Configurable canvas size / aspect | 🟡 | hardcoded 1920×1080 on save `DisplayDesigner.tsx:111` |
| Context menu (right-click actions) | ❌ | none |
| Keyboard shortcuts (nudge/delete/copy) | 🟡 | nudge/delete only |

### B. Symbols / element types
| PI Vision symbol | Ours | Notes |
|---|---|---|
| Static shapes (rect, ellipse, line, polyline, polygon) | ✅ | plus ~150 OpenBridge symbols (superset of PI Vision) |
| Text / static label | ✅ | |
| Value / numeric display | ✅ | but see binding-key bug (Part 3-D) |
| Gauge (radial/horizontal/vertical) | ✅ | OpenBridge instruments |
| Bar | ✅ | |
| Multi-state symbol | 🟡 | renders NE107; standalone `MultiStateSymbol.tsx` orphaned |
| Image / media | 🟡 | media symbol exists |
| **Trend** | 🟡 stub | static SVG only — see Part 3-E |
| **XY / scatter plot** | 🟡 stub | demo data |
| **Table (asset/attribute)** | ❌ | none |
| **Event/alarm table** | ❌ | none |
| Symbol grouping into reusable symbol | 🟠 | template system exists but unwired |
| Custom symbol library / extensibility | ✅ | OpenBridge catalog is the big win |

### C. Data & bindings
| PI Vision capability | Ours | Notes |
|---|---|---|
| Drag tag/attribute onto symbol to bind | 🟡 | `TagPicker`/`AssetBrowser` dropdown; no drag-to-bind |
| Asset/tag search | 🟡 | asset browser; search depth unknown |
| Multiple bindings per symbol (value+status+sp…) | 🟡 | **renderer reads only `value/status/pv/sp`** — other slots silently ignored `SymbolRenderer.tsx:54` |
| Data quality / stale indication | 🟡 | NE107 helper exists; not universally applied |
| Calculated data / expressions | ❌ | none |
| Units / number format / prefix-suffix | ✅ | inspector formatting tab |
| Asset-relative displays ("element relative") | ❌ | **major PI Vision feature — build once, apply to any asset** |
| Asset swap at runtime | ❌ | none |
| Collections (repeat symbol over N elements) | ❌ | none |

### D. Live runtime & viewer
| PI Vision capability | Ours | Notes |
|---|---|---|
| Live streaming values | 🟡 | works via Sparkplug/MQTT **but only for hardcoded `ams_site1/ams_edge1`** `mqttStore.ts:42` |
| Standalone read-only viewer (operator run mode) | ❌ | only in-editor Preview toggle exists |
| Full-screen / kiosk mode | ❌ | none |
| Auto-refresh interval control | ❌ | none |
| Multi-site data fan-out | ❌ | hardcode blocks it |

### E. Trends (PI Vision's flagship)
| PI Vision capability | Ours | Notes |
|---|---|---|
| Single-tag trend from live+historian | ❌ | static SVG; `mqttStore.fetchTrend`→`/api/hist` exists but unused |
| Multi-tag / multi-pen trend | ❌ | no multi-tag selection; historian has no batch endpoint |
| Time range control / time bar | ❌ | none |
| Live vs historical toggle | ❌ | none |
| Cursor + value-at-cursor readout | ❌ | none |
| Zoom/pan on trend | ❌ | none |
| Multiple Y-axes / scales / autoscale | ❌ | none |
| Stacked vs overlay traces | ❌ | none |
| Trend legend | ❌ | none |
| Add-to-trend from a value symbol | ❌ | none |
| Annotations / event overlay on trend | ❌ | none |

### F. Navigation
| PI Vision capability | Ours | Notes |
|---|---|---|
| Symbol/button → open another display | ❌ | nav symbols inert `SymbolRenderer.tsx:298` |
| Pass asset context on navigate | ❌ | none |
| URL / external link | ❌ | none |
| Faceplate / popup on click | ❌ | none |
| Breadcrumb / asset-tree navigation | 🟡 | breadcrumb renders `href="#"` |
| Related displays / display links | ❌ | none |
| Back / forward / home | ❌ | none |

### G. Alarms & events on canvas
| PI Vision capability | Ours | Notes |
|---|---|---|
| Alarm indicator bound to live alarm | 🟡 | beacon/horn react to `status`; banner/summary hardcoded |
| Alarm banner / summary from alarm store | ❌ | `alarmStore` exists app-wide but not wired to canvas |
| Event frame overlay | ❌ | none |
| Dynamic color/blink/visibility by limits | 🟡 | color+blink partial; **visibility rules absent** |

### H. Displays management / collaboration
| PI Vision capability | Ours | Notes |
|---|---|---|
| Save / open display | ✅ | real Postgres `jsonb` via display-service |
| Version draft/published | 🟡 | DB supports; no publish button in designer |
| Thumbnails / previews | ❌ | fake gray box `DisplayList.tsx:393` |
| Folders / organization / favorites | 🟡 | hierarchy/categories in DB; UI depth unknown |
| Search displays | 🟡 | list only |
| Permissions / ownership / sharing (RBAC) | ❌ | **no auth on any service** |
| Personal vs controlled displays | 🟡 | schema exists (`13_personal_views_schema.sql`); not enforced |
| Print / export PDF | ❌ | none |
| **Export / import display file** | 🟡 | see Part 4 (PI Vision import is the priority) |
| Responsive / mobile layout | ❌ | none |
| Ad-hoc temporary display | ❌ | none |

---

## Part 4 — PI Vision import (reuse the legacy "ScreeN Import" app)

**Finding:** despite the folder name, **Batik/Java is not used**. The real, high-fidelity importer is a clean, framework-free TypeScript module:

- `…/release/industrial-vis-frontend/src/services/ScreenImportService.ts` (688 lines) — parses AVEVA PI Vision **`.pdix`** files (a ZIP containing `display_json` + `metadata_json` + `Content/` images) into a flat JSON scene graph.
- `…/release/industrial-vis-frontend/src/services/AFParser.ts` — parses PI **Asset Framework** XML into a tag/attribute tree for binding pick-lists.
- Its output model `{items:[{id,type,position,size,style,bindings,…}]}` is **~90% shape-compatible** with our `frontend-ob` display schema.

**What the legacy importer preserves:** position/size/rotation, nested groups + composed transform matrices, flip, fill/stroke/dash/corner-radius, static text + alignment, value displays, external SVG graphic symbols (`DirectoryKey`/`FileKey`), embedded images, exact line/polygon geometry, raw-SVG verbatim replay, and the primary data binding per symbol.

**What it drops (and we must add):** full multi-state configs (only 1st state captured), trend pens/axes/time-range (only 1st tag), conditional-formatting rules (`rules:[]` always empty), navigation links (field exists, never filled), tables/event-frames (explicitly skipped), and secondary bindings.

**Reuse plan:** lift `ScreenImportService.ts` + `AFParser.ts` into `frontend-ob/src/services/import/`; swap its type imports for our `types.ts`; **rewrite the `mapPdixType()` table (line ~536) to emit OpenBridge component ids** (e.g. `radialgauge → obc radial instrument`, `value → OpenBridge value display`); replace `SYMBOL_REGISTRY` graphic resolution with our symbol-library service; then fill the dropped fields (multi-state, pens, rules, navigation) into the richer `CanvasItem` fields that already exist. The `rawSvg` `dangerouslySetInnerHTML` replay is the one SVG-specific piece — keep it as a fallback for un-mappable PI Vision graphics.

---

## Part 5 — Build plan: PI Vision parity, phase by phase

Ordered so each phase yields something demonstrable. Every phase ends OpenBridge-token-clean (Part 1) and design-principle-conformant (Part 2).

### Phase A — Make live data actually work (unblocks everything)
1. **Fix binding-key consumption** — renderers read *every* declared `bindingSlot` generically, not just `value/status/pv/sp`. `SymbolRenderer.tsx:54-92` + both renderers.
2. **De-hardcode site/edge** — honor resolver-provided `sparkplugGroup`/`edgeNode`; remove `ams_site1/ams_edge1` constants in `mqttStore.ts:42` and `historian-bff/Program.cs:133`.
3. **Universal data-quality (NE107)** — apply `getNamurState` + stale-data styling to every bound symbol.
- *Acceptance:* a saved display with tank `level`, pump `speed`, valve `position` bindings shows live values across ≥2 sites.

### Phase B — Standalone runtime viewer
4. New read-only route `/display/:id` (+ optional `?asset=`) decoupled from the editor; loads published content, binds live, no edit affordances.
5. Full-screen / kiosk mode + auto-refresh control.
- *Acceptance:* operators open and run a display without the editor.

### Phase C — Trends (single → multi → interactive)
6. Replace static trend/chart SVG with echarts wired to `mqttStore.fetchTrend`→`/api/hist/trend` (`SymbolRenderer.tsx:567`, `CustomSymbols.tsx:317`, `catalogRenderer.tsx:130`).
7. Time-bar component (range presets, live "now", play/pause, back/forward) shared across trends on a display.
8. Multi-pen trends: multi-tag config in inspector + a batch/multi-series historian endpoint (`historian-bff`).
9. Trend interactions: cursor + value-at-cursor, zoom/pan, legend, multi-axis/autoscale, live↔historical toggle, stacked vs overlay.
- *Acceptance:* drag/select one or many tags → interactive live+historical trend with cursor readout.

### Phase D — Navigation & display hierarchy
10. `navigationLink` property model: target display + asset context + open-mode (replace/popup/new-tab/URL).
11. Wire nav symbols/buttons/breadcrumb to `react-router` `useNavigate`; faceplate popups.
12. Related-displays + back/forward/home; HPHMI Level 1→4 hierarchy support.
- *Acceptance:* click a pump → open its Level-3 detail display in-context.

### Phase E — Asset-relative displays & collections (PI Vision's force multiplier)
13. Asset-relative binding tokens (`{{element}}.Speed`) resolved at runtime against the selected asset — reuse template `{{param}}` substitution already in `template-service`.
14. Runtime asset swap (change asset → whole display rebinds).
15. Collections: repeat a symbol group over a set of AF elements.
16. Wire the orphaned `TemplatePalette.tsx` for authoring reusable symbols/templates.
- *Acceptance:* one "Pump" display drives 20 pumps via asset swap.

### Phase F — Alarms & dynamic behaviors on canvas
17. Bind alarm banner/summary/beacon to `alarmStore` (real active-alarm state). `SymbolRenderer.tsx:554`, `CustomSymbols.tsx:300`.
18. Conditional-formatting rule engine: dynamic color / blink / **visibility** / rotation by value/limits (fills the `rules[]` model field). Complete `MultiStateConfig`.
19. Event-frame / alarm table symbol.
- *Acceptance:* symbol turns red + blinks on limit breach, hides on suppress, all from live alarm state.

### Phase G — Editor pro-grade UX
20. Real multi-select (marquee + shift-click); group/ungroup UI.
21. Align/distribute/same-size; z-order buttons; rotation/flip handles.
22. Undo/redo captures move/resize/property edits (`pushHistory` on `updateItem`); copy/paste; pan + wheel-zoom; guides/rulers; context menu; layers.
23. Configurable canvas size; lock/hide.
- *Acceptance:* authoring feels equivalent to PI Vision's editor.

### Phase H — PI Vision import
24. Lift `ScreenImportService.ts` + `AFParser.ts` into `frontend-ob`; adapt `mapPdixType` → OpenBridge ids; replace symbol-registry + type imports (Part 4).
25. Fill dropped fields: multi-state configs, trend pens/axes, conditional rules, navigation links, secondary bindings.
26. Import UI: upload `.pdix`, preview, map unknown symbols, save as our display. AF XML import → binding pick-lists.
- *Acceptance:* import `301-Kiln.zip` (bundled sample) → renders faithfully in our OpenBridge designer, bindings resolve to live data.

### Phase I — Management, collaboration, hardening
27. **AuthN/AuthZ + RBAC** across all `src/services` (admin/engineer/operator/viewer); enforce display ownership/permissions and personal-vs-controlled displays.
28. Publish + versioning action in the designer; client-side thumbnail snapshots at save.
29. Folders/favorites/search UI; print/export PDF; responsive layout; export display file.
30. Token/lint cleanup (Part 1); remove/land orphans; E2E tests.
- *Acceptance:* multi-user, permissioned, versioned, importable, production-grade.

### Cross-cutting definition of done (per PI Vision parity)
Live multi-site data ✓ · standalone viewer ✓ · interactive single+multi trends ✓ · display navigation with asset context ✓ · asset-relative reuse ✓ · alarms/dynamic behaviors from live state ✓ · pro editor ✓ · `.pdix` import ✓ · RBAC + versioning ✓ · 100% OpenBridge-token + ISA-101 conformant.
