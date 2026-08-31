# PHASE F–I PLAN (informed by SYSTEM_AUDIT.md)

Ground rules (from the request): investigate → plan → implement → **prove against the gate with
pasted evidence** → update `ROADMAP_PROGRESS.md` → next. Work F→G→H→I one at a time. No phase is
"done" without real observed output. Do NOT touch trend-view/RBAC/publish (separate task).

**Shared prerequisites (do once, at F start):** restart the process-value simulator
(`ams-sim` container, exited) so tags are live; Playwright logs in as `admin`/`Admin123!` for
designer gates. Reuse the existing Playwright harness in `scratchpad/pw/`.

Each phase notes **[extend]** (build on existing code the audit found) vs **[new]**.

---

## PHASE F — Alarms & dynamic behaviors on canvas

**Model additions** (also unblock Phase I): add to `CanvasItem` (`Designer/types.ts`):
`rules?: VisualRule[]` and `multiStateConfig?: MultiStateConfig` (+ `alarmSource?: string` binding
convention). Types mirror the legacy importer's shape so I fills them 1:1.

1. **Wire alarm widgets to `alarmStore`** [extend] — `alarm.banner`, `alarm.summary`, `alarm.beacon`
   (`SymbolRenderer.tsx:600`, `CustomSymbols.tsx:300,266`). Use the established selector pattern:
   `useAlarmStore(s=>s.alarms)` filtered by the symbol's `sourceName`/`alarmSource` (via
   `utils/opcAlarmFilter.ts`); summary reads `stats`. Blink while unacked, steady on ack, **hide
   when `isSuppressed`/`isShelved`** (ISA-18.2, matches `conversion.md`). Colors from
   `openBridgeTheme.OBC` (not new hex — sets up Phase H).
2. **Alarm hub in the runtime surface** [extend] — the viewer doesn't connect `/hubs/alarms`
   (audit §1). Add a shared alarm-provider so `DisplayViewer` calls `alarmStore.initialize(token)`
   when an auth session exists; otherwise the gate is proven in the authenticated designer preview
   (decision §6.2 — recommend viewer).
3. **Conditional-formatting rule engine** [new] — evaluate `rules[]` against a symbol's live
   value/limits → dynamic **color / blink / visibility / rotation**. One evaluator
   (`Designer/ruleEngine.ts`) consumed by `SymbolRenderer`; reuses `getValueColor`/`getStatusIndicatorState`.
4. **Complete `MultiStateConfig`** [extend] — replace the ad-hoc `ind.multistate` (`CustomSymbols.tsx:69`)
   + retire the orphaned `MultiStateSymbol.tsx` into a config-driven multistate (states → value ranges
   → OB token color/label), NAMUR NE107 defaults from `openBridgeTheme`.
5. **Event-frame / alarm-table symbol** [new] — `alarm.table` renders active alarms from `alarmStore`
   (time/source/priority/state), optionally filtered by area/source.
6. **Real limit→alarm source (decision §6.1, recommend A):** a small `scripts/sim/limit_watchdog.py`
   (mirrors the sim) that reads live values and, on limit breach, publishes a real alarm event to the
   alarm pipeline (`traverse.alarm.raw-alarms` → Flink → SignalR → `alarmStore`). First investigate the `traverse.alarm.raw-alarms`
   event schema Flink expects. Suppress via the real `POST /api/v1/alarms/{id}/suppress`.

**GATE F evidence:** display with an alarm-beacon/banner bound to a tag's source, opened live
(authenticated). Drive that tag past its limit → watchdog emits a real alarm → **paste the
alarmStore transition** (SignalR `OnNewAlarm` / store `alarms` entry) and a screenshot of the symbol
**red + blinking, driven by `alarmStore` state**. Call `suppress` → paste the store transition
(`isSuppressed=true`) + screenshot of the symbol **hidden**. Build green.

---

## PHASE G — Editor pro-grade UX

**Model additions:** `groupId?: string` on `CanvasItem` + a `groups: Group[]` display field;
`hidden?: boolean`. (Grouping model also unblocks Phase I import of PI Vision groups.)

- **Undo/redo correctness** [extend, highest value] — commit history on **drag-end/resize-end** and
  after inspector edits (debounced) by calling `pushHistory` from `updateItem`'s call sites
  (`DisplayDesigner.tsx:170`, `DesignerCanvas` mouseup). **Fix the index desync** (`:127-129`) — track
  index from the new array length, not a stale closure.
- **Multi-select** [new] — replace dead `selectionBox` (`DesignerCanvas.tsx:47`) with real
  `selectedIds: Set<string>` state: marquee drag on empty canvas + shift/ctrl-click toggle. Property
  inspector already stubs multi-select (`PropertyInspector.tsx:12`).
- **Group/ungroup** [new] — toolbar + context-menu; move/resize/delete operate on the group.
- **Align/distribute/same-size** [new], **z-order buttons** (bring-front/send-back — model already
  sorts by `zIndex`, `DesignerCanvas.tsx:216`) [extend], **rotate/flip handles** on-canvas [extend rotate, new flip].
- **Copy/paste** [new] clipboard (Ctrl+C/V, offset paste, new ids) — reuse duplicate logic
  (`DisplayDesigner.tsx:186`).
- **Pan + wheel-zoom** [extend] — existing zoom math already divides by `zoom`; add wheel + space-drag.
- **Guides/rulers, context menu, layers panel, lock/hide, configurable canvas size** [new/extend] —
  surface `DisplaySettings.canvasWidth/Height` (stop hardcoding `:114`).

**GATE G evidence (Playwright, authenticated designer):** marquee-select 5 symbols → group →
align-left → **undo ×3** back to ungrouped+unaligned → **redo** forward; paste the item-state
(positions/groupId) at each step showing history is accurate. Copy/paste a symbol; paste JSON proving
the copy is an independent item (new id) editable without affecting the original. Build green.

---

## PHASE H — Designer canvas redesign to OpenBridge / PI Vision UX

Visual/informational redesign of what F/G/earlier built — **restyle/restructure, not new features.**

1. **One color source of truth** [extend] — promote `openBridgeTheme.ts` to the single token module;
   **derive** the other 5 sources from it: `MultiStateSymbol/CustomSymbols` NAMUR, `Designer.css`
   semantic hex (`:1330-1333,:1392-1394,:1269-1280,:877-878,:1455`), `TrendChart.PEN_COLORS`,
   `App.tsx TB`, `PropertyInspector` swatches. Alarm (F) and trend (C) colors then share one source.
2. **Theme/token sets** [new] — real `day` / `bright` / **`night`(high-contrast)** palettes as CSS
   custom properties keyed off `data-obc-theme` (currently only day/bright exposed; no override block
   in `Designer.css`). Typography as tokens too (no inline font px).
3. **Structural model** [extend] — restructure the shell + designer to the explicit OpenBridge
   model: generic app shell (top nav / **persistent asset+context panel** / canvas / properties
   panel) separated from widget design. Wire the asset/context panel's breadcrumb into **Phase D's**
   nav (don't duplicate).
4. **PI Vision patterns** [new] — persistent asset/context panel w/ breadcrumb; **ad-hoc trend
   affordance** from a canvas symbol (right-click → trend, reusing Phase C `TrendChart`); consistent
   time-range control placement across trend-bearing displays; trend-first information density (audit
   spacing/sizing/panel proportions — tighten from whitespace defaults).
5. **Icons** [extend] — replace emoji chrome (palette/toolbar/sidebar, `App.tsx:429`,
   `DisplayDesigner.tsx:281`, `SymbolPalette.tsx:23`) with OpenBridge `Obc*`/`obi-*` icons to match
   the symbol renderers. Flag (don't silently override) any symbol/icon conflicts.

**GATE H evidence:** before/after screenshots of the **same display** — typography, color-token, and
layout structure demonstrably different and traceable to the principles above. **Change one design
token** (e.g. `--alert-alarm-color`) → paste screenshots showing **both** an alarm symbol (F) and a
trend pen (C) update from it. **Switch day↔night** → screenshots confirming every screen (shell,
designer, viewer) respects it. Build green.

---

## PHASE I — PI Vision import

Lift the confirmed importer into `frontend-ob/src/services/import/` and finish the dropped fields
(the F/G model additions make this possible).

1. **Lift** `ScreenImportService.ts` (688L) + `AFParser.ts` (267L, `utils/`) [extend/adapt]. Swap the
   3 entanglement points: type imports `:2` → frontend-ob `types.ts` (move `rotation`/`zIndex` out of
   `style`, `cornerRadius`→`borderRadius`, `points` string→`ShapeProps.points[]`); `SYMBOL_REGISTRY`
   `:4/:510-534` → frontend-ob symbol-library service; drop/replace `SymbolLibraryHydrator` `:21`.
2. **Rewrite `mapPdixType()`** (`:539-550`) RHS → **OpenBridge component ids** (e.g. `radialgauge` →
   OB radial instrument, `value` → OB value display), using the Phase H design system.
3. **Fill dropped fields** [new] into the now-richer `CanvasItem`: multi-state configs (F's
   `multiStateConfig`), trend pens/axes (add `pens`, feed Phase C `TrendChart`), conditional rules
   (F's `rules[]`), **navigation links** (D's `navigationLink`), secondary bindings, groups (G's
   `groupId`/`Group`). Keep `rawSvg`/`dangerouslySetInnerHTML` as the fallback for un-mappable graphics.
4. **Import UI** [new] — upload `.pdix` → preview → **surface any symbol that didn't map cleanly for
   manual mapping (never silently dropped)** → save as our display (display-service). AF XML import →
   binding pick-lists (from `AFParser`).

**GATE I evidence:** import the bundled `301-Kiln.zip` → renders faithfully in our OpenBridge
designer **using the Phase H design system**; paste screenshot + the imported display JSON. Bindings
resolve to live data (paste a resolved value). Paste the import-UI list of **unmapped symbols
surfaced for manual mapping**. Build green.

---

## Sequencing summary
F (alarm/rules/multistate model + engine) → G (selection/grouping/history model) → H (token/structure
redesign restyling F+G+C) → I (import, filling F/G/D model fields, rendered in H). Each gated with
pasted evidence before the next. `ROADMAP_PROGRESS.md` updated after each gate.
