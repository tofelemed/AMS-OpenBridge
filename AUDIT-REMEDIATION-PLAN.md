# PI Vision Parity — Remediation Plan

**Companion to:** [AUDIT-REPORT.md](AUDIT-REPORT.md) (read that first — it has the evidence and the full annotated checklist)
**Target:** move P0 completion from **42% → ~90%** across four workstreams
**Date:** 2026-07-15

---

## The strategy in one paragraph

The audit found that our problem is **not** a half-built designer — the canvas is genuinely strong (68%). Our problem is that **the data-model half of an HMI builder is missing**, and that **several complete features are unreachable because nobody wired a UI to them**. So the plan front-loads the cheap unlocks (a whole section of ISA-18.2 visual-alarm capability is one inspector tab away), then attacks the two real structural holes — the **time model** (no backend blocker, start now) and the **asset-model search endpoint** (a single piece of backend work that ~30 P0 rows are queued behind). Calculations are deliberately deferred and **reshaped**, because copying PI Vision's client-side expression engine would violate our recorded Flink-only-compute decision.

**Sequencing rule:** Sprint 1 is pure unlock — no new subsystems. Sprint 2 starts the two long poles **in parallel** (time model is frontend-only; asset-model search is backend-only, so they don't contend). Everything else queues behind those.

---

## Sprint 1 — Unlock what we already built *(size: S · ~1 sprint · P0 42% → ~60%)*

**Every item here is wiring, not construction.** The engines exist and are tested by the fact that they render correctly when fields are hand-set.

### 1.1 Multi-state authoring UI — **the single highest-ROI task in the repo**

The evaluator ([ruleEngine.ts:34-57](src/frontend-ob/src/components/Designer/ruleEngine.ts#L34-L57)) is complete: operators `> >= < <= == != between outside`, effects color/blink/hidden/rotate. It is wired into rendering for **every symbol type** via the universal `SymbolFxWrap` ([SymbolRenderer.tsx:184](src/frontend-ob/src/components/Designer/SymbolRenderer.tsx#L184), called at [:272-273](src/frontend-ob/src/components/Designer/SymbolRenderer.tsx#L272-L273)). The blink CSS exists. **Nothing writes `item.multiStateConfig` or `item.rules`.**

**Build:** a new **"States"** tab in [PropertyInspector.tsx](src/frontend-ob/src/components/Designer/PropertyInspector.tsx), alongside the existing General/Data/Style/Limits/Action tabs.

- State list: add / remove / reorder, each with a threshold (min/max range **or** an exact `equals` match — the engine already supports both).
- **Trigger slot selector** — defaults to the symbol's own bound slot, but must allow an *alternate* attribute (G11). The engine already reads `MultiStateConfig.slot` / `VisualRule.slot`; expose it.
- **Constrained colour palette, not a free picker.** Per `[TRAVERSE-DELTA]` G19 and ISA-101: saturated colour is reserved for abnormal conditions. Offer only OpenBridge alert tokens (`alert-alarm` / `alert-critical` / `alert-caution` / normal). Read the `openbridge` skill before writing this UI.
- **A mandatory bad-data/stale state (G19).** This is non-negotiable per the checklist. `getNamurState()` exists in `openBridgeTheme.ts`, and [MultiStateSymbol.tsx](src/frontend-ob/src/components/Designer/MultiStateSymbol.tsx) is a complete NE107 component with **zero importers** — revive it rather than rewriting.
- Blink toggle per state (G18) — engine + CSS both already exist.

**Unlocks:** 19 rows in §G, plus C22, E2.9, E3.7, F8, N14. **Section G goes from 4% → ~70%.**

### 1.2 Make the built-but-unreachable things reachable

| Task | What's wrong | Fix |
|---|---|---|
| **`alarm.table` palette entry** | A working, live-bound alarm grid ([SymbolRenderer.tsx:150](src/frontend-ob/src/components/Designer/SymbolRenderer.tsx#L150)) that is **absent from `SymbolPalette.tsx`** and so cannot be placed | Add a `SymbolPalette` entry + a `symbolLibraryService` definition (which also gives it inspector tabs) |
| **`alarmSource` inspector field** | Drives symbol outlines, blink-on-unacked, all annunciators, and `AlarmTable`'s filter. **Nothing writes it** | Add a field to the Data tab (reuse `TagPicker` from `AssetBrowser`) |
| **`KNOWN_SLOTS` completion** | `values`, `x`, `y`, `source`, `alarms`, `asset`, `tempIn`/`tempOut` are declared on palette symbols but **absent from [`KNOWN_SLOTS`](src/frontend-ob/src/components/Designer/SymbolRenderer.tsx#L61)** → a correctly-authored binding still receives nothing | Add them. **Prerequisite for fixing bar/XY charts at all** |
| **`Display.Level` setter** | The launcher has L1–L4 filter chips filtering on a field **no UI can set** (M20, P0) | Add to the create-display modal + display settings |
| **`bgColor` control** | Loaded and saved; **`setBgColor` has no caller** | Add a colour control to the display-format panel |
| **Ctrl+X cut** (B7/Q3) | Copy and delete both exist; cut was never registered | One keybinding |
| **Distribute + z-order step** (B26/B27) | Align and front/back exist; same code shape | `distributeSelected()`, `zOrder('forward'\|'backward')` |
| **Shift-constrains-resize** (B23/Q8) | The resize branch never reads `e.shiftKey` | One conditional |
| **Plot-width decimation** (U9) | Server decimation works; `TrendCore` passes a hardcoded `500` | Measure the container and pass it |
| **`includeTimeRange`** (M4) | Authoring checkbox exists; `handleNav()` ignores it | Defer the read until the time model lands (Sprint 2) |

### 1.3 Fix the blanket MQTT subscription — **a real scaling defect**

`connect()` blanket-subscribes `spBv1.0/+/DDATA/+/#` ([mqttStore.ts:239](src/frontend-ob/src/store/mqttStore.ts#L239)) — every metric from every device, on every client. The per-screen `subscribeScreen`/`unsubscribeScreen` machinery **already exists and is correct**; it is simply being defeated by the wildcard.

**Fix:** delete the wildcard subscription and let the per-binding subscriptions do their job. This is required by recorded decision **W10** and materially affects U6/U7/U10.

> **Verify:** open a display, then check the MQTT client's active subscriptions — they must name only the bound devices, and must shrink on navigation away.

### 1.4 Renderer fixes (small, but they make the importer honest)

- **Text colour (C5)** — the Style tab writes `style.fill`/`stroke` but the `text.label`/`text.title` renderers only read `fontSize`/`fontWeight`/`textAlign`. Colour is silently dropped.
- **Polygon (C13)** — `pdixImport.ts` already emits `shape.polygon` and `ShapeProps.points` already exists, but **there is no renderer case and no palette entry**, so imported polygons render as `❓`. This is half-done.
- **Line dash/dotted (C16)** — no `strokeDasharray` anywhere in the model.
- **`pdixImport` orphan types** — `ind.radial`, `ind.bar`, `ind.vbar` also have no renderer. **The importer is the front door for migration; silently emitting `❓` boxes is worse than failing loudly.**

---

## Sprint 2 — The two long poles, in parallel *(size: M + L)*

These do not contend: **2A is frontend-only, 2B is backend-only.** Run them simultaneously.

### 2A. The time model *(Class 2 · M · no backend blocker — start immediately)*

**Nothing in §K, §E1 (trend config), §N (event scoping), or M4 can be finished without a display time context.** It is the second-largest structural hole and — critically — **historian-bff `/trend` already accepts `start`/`end`**, so there is nothing to wait for.

**Build:**
1. **A relative-time parser** — `*`, `*-8h`, `t`, `y`, weekday/month names, offsets with `s/m/h/d/w/mo/y`, offset-alone resolution, validation + error messaging (K10–K15). **This does not exist**: `utils/relativeTime.ts` is a *formatter* ("3m ago"), and `utils/time.ts` is six lines of dayjs. Write it as a standalone, unit-tested module — it is the sort of grammar that is cheap to test and expensive to debug in a UI.
2. **A display-level time context** (Zustand store): `{start, end, live}`, with the "end = now ⇒ live mode" rule (K8).
3. **A `TimeBar` component** at the bottom of `DisplayViewer` (K1–K7): start/end fields, duration presets, Now, shift ±, revert-to-saved. **Lift the existing logic out of `TrendCore`** — it already has duration presets, half-window stepping, Now, and live/paused/historical state. Do not write it twice.
4. **Wire symbols to it**: trend time-range modes (E1.23–E1.25), per-symbol override (K17), event scoping (N2), `includeTimeRange` on nav links (M4), URL params (K19/M9).

### 2B. The asset-model search endpoint *(Class 3 · L · ~30 P0 rows are queued behind this)*

**This one endpoint is the sole blocker for Collections (17 P0 rows), the Asset Comparison Table, Dynamic Search Criteria, and proper asset context switching.** None of them can start in the UI until it lands — attempting them frontend-first will fail.

Today [asset-model](src/services/asset-model/Program.cs) has: no attribute table (a "measurement" is a row with three columns), no comparison-operator filtering, **no descendants query** (`/children` is one level; `/hierarchy` returns *ancestors*), and **no asset-type/template model** (`asset_type` is a bare int 1..5).

**Build:**
1. **An asset-type/template entity** — so "assets of the same type" is a query, not the current path-prefix hack ([DisplayViewer.tsx:188-198](src/frontend-ob/src/components/Designer/DisplayViewer.tsx#L188-L198)).
2. **An attribute model** with real metadata: data type, UOM, min/max limits, description. (`engineering_unit`, `lo_eng_limit`, `hi_eng_limit` exist on the asset row and are **read by no code** — this is where UOM and threshold-inheritance later hang.)
3. **`POST /assets/search`** taking `{ root, returnAllDescendants, assetType, attributeFilters: [{name, op, value}] }` with operators `> >= < <= = ≠`. A recursive CTE for descendants.

> Do not build this as a bespoke collections endpoint. It is the **one** query surface that collections, dynamic criteria, asset-comparison tables, and context switching all consume.

---

## Sprint 3 — Cash in the backend work *(size: M–L)*

Everything here was blocked on Sprint 2B.

- **Collections (§I, 17 P0 rows)** — convert-to-collection, repeat-per-asset, edit-the-template-instance, criteria panel (search root / descendants / type / attribute-value filter), auto-update, sorting, paging.
- **Asset context switching, properly** (H2, H5, H6, H11, H12) — replace the path-prefix hack with a type query, and **add the configure-panel**. Also: today an author must **hand-type a `{{element}}` token** into a binding path ([DisplayViewer.tsx:71](src/frontend-ob/src/components/Designer/DisplayViewer.tsx#L71)) because no UI inserts it. Fix that — it is why H1 "works" only for hand-crafted displays.
- **Asset Comparison Table** (D7, §E5) and **Dynamic Search Criteria** (§J).
- **historian-bff summary endpoint** — `GET /summary?series&start&end&fns=min,max,avg,total`. Needed for table summary columns (E4.5–E4.7, E4.14). **Note:** `/trend`'s aggregation is currently **hardcoded for alarm columns** (`avg(severity), last_value(state)` in `IoTDbClient.cs:49-52`) and cannot return min/max/avg of a numeric process tag — so this is new work, not a parameter change.
- **Real Table symbol** (D6, §E4) — `obc.ob.ui.table` is currently an empty shell with zero binding slots.

---

## Sprint 4 — Displays as a managed asset *(size: M)*

- **Folders** (A16–A24) — new table + CRUD + tree UI. `hierarchy_path` (today free text, string-split into a fake tree at request time) gives the migration path.
- **`operator_views`** (W2, R5) — **the `displays.personal_views` table already exists with its config-only trigger.** It needs a `DbSet` and endpoints, not a schema. Same for **favorites** (`view_favorites` exists; the UI currently uses **localStorage**).
- **Ownership enforcement** (R9, R15) — `owner_id` is written and **never read**. Today any `display.edit` token can edit, delete, or restore *anyone's* display.
- **Sharing + ACL** (R10–R13), **audit trail** (R19) — display-service already publishes `display.*` events to a Redis channel **nobody consumes**, while audit-service consumes a Kafka topic **nobody produces to**. Connect them, and add a query endpoint (audit-service currently has **only** `POST /verify`).
- **Version restore-to-N + diff + comments** (R20) — `POST /revert` today only reverts to the *published* version.
- **Home page**: search, sort, list-view toggle, tags (A3, A6–A9, A14, A15).

---

## Sprint 5+ — Deferred and reshaped

### Calculations (§L) — **do not copy PI Vision**

PI Vision evaluates ad-hoc expressions client-side, per display. That **conflicts with two recorded decisions**: CQRS discipline and Flink-only compute. The checklist's own **L19** already says complex reusable logic belongs in the analysis engine.

**Build instead:** a *calculation registry* in analysis-service where an expression is a **named, versioned artifact**; a Flink job that actually consumes `traverse.analysis.commands` (**today nothing does — the execution path is dead, and executions sit `pending` forever**); results published back onto the UNS as a **derived measurement**; and the designer binds to it **like any other tag**. That yields L11 (usable on any symbol) for free and honours L12/L13/L19.

**Also fix:** `GET /analyses/types` currently returns a **hardcoded static literal** advertising an `expression` type that nothing can execute.

### Other deferred work

- **Asset-scoped authorization (R17)** — `binding.resolve` and `historian.view` are flat permissions **held by Viewer**, so any authenticated user can resolve and trend **any tag in the plant**. No scope model exists at any layer. **L**.
- **UOM (§P)** — no conversion code exists repo-wide; trend units are **regex-guessed from the metric name**. Hangs off the Sprint-2B attribute model.
- **Custom symbol framework (§T)** — web-component/SVG registration per `[TRAVERSE-DELTA]`, not AngularJS. Needs the upload backend first.
- **Mobile/touch (U2, U3)** — canvas and viewer are mouse-only today.

---

## Cross-cutting: bugs to fix regardless of sprint

Full detail in [AUDIT-REPORT.md §8](AUDIT-REPORT.md). The ones that are actively breaking things:

1. **binding-resolver hands clients a dead SignalR URL** (`:5000/hubs/alarm` vs. the real `:8000/hubs/alarms`) **and a non-existent alarm API route**. Alarm bindings cannot work as delivered.
2. **Alarm `unshelve` has a domain method, a permission, and a policy — but no controller action.** Shelved alarms can only leave the shelf via SQL auto-expiry. **ISA-18.2 compliance gap.**
3. **SQL injection surface in historian-bff** — `series` and `measurements` are string-interpolated into IoTDB SQL.
4. **`X-Service-Key` mints an unscoped superuser** from a shared static secret defaulting to `traverse-internal-dev-key`.
5. **The config-only invariant 500s instead of 400s** for `liveValue`/`realTimeValue` (the app check tests only two of the four terms the DB trigger blocks).
6. **`Analytics.tsx` KPI tiles show hardcoded literals** (`"14"`, `"1.2"`, `"3.1"`) presented as live values.

---

## Schema hygiene — do this before touching the database

**`database/migrations/phase0/*.sql` is dead code.** [docker-compose.yml:51](infra/docker/docker-compose.yml#L51) mounts **only** `database/scripts/` into `docker-entrypoint-initdb.d`. phase0 is applied by nothing except a manual script and it **conflicts** with the live schema (unqualified `display_definitions` vs. real `displays.display_definitions`).

Anything you "find" in phase0 — `operator_views`, `display_comments`, `tags TEXT[]`, `resource_permissions`, `attribute_instances`, `uom_classes` — **does not exist in the running system.** Several of these (`attribute_instances`, `uom_classes`) are things Sprint 2B and the UOM work will now build for real.

**Action:** either delete `database/migrations/phase0/` or clearly mark it superseded, before someone plans against it.

---

## How we'll know each sprint worked

- **Sprint 1** — author a multi-state on a tank in the designer, save, open in the viewer, drive the bound tag across a threshold, and **see the colour change and the blink**; then stale the tag and **see the NE107 bad-data state**, not a live-looking value. Place an `alarm.table` from the palette and ACK an alarm from it. Confirm MQTT subscriptions name only the open display's devices.
- **Sprint 2A** — set `*-8h` in the time bar and confirm every trend on the display re-ranges; navigate a link with "pass time range" and confirm the target opens in the same window.
- **Sprint 2B** — `POST /assets/search` with `{root, returnAllDescendants: true, assetType: 'Tank', attributeFilters: [{name: 'Flow', op: '>', value: 50}]}` returns exactly the matching tanks.
- **Sprint 3** — convert a symbol group to a collection and get one card per matching asset, updating live as assets cross the filter.
- **Sprint 4** — a second user cannot edit the first user's display.

Run `npm run lint` (`--max-warnings 0`) and `npm run build` in `src/frontend-ob` for every frontend change, and the E2E scripts (`scripts/run-designer-e2e.ps1`, `scripts/e2e-full-system-test.ps1`) before each sprint closes.
