# ROADMAP_PROGRESS — 5-Phase HMI/SCADA Buildout

Durable record of the gated roadmap. Updated after each phase gate passes.
Plan file: `~/.claude/plans/we-re-implementing-a-5-phase-ticklish-haven.md`.

**Started:** 2026-07-05 · **Environment:** full Docker stack already up (21 containers, 32h; Flink jar built).

## Decisions locked (user-confirmed)
- Gate A evidence via the real pipeline: **Python producer → Kafka `traverse.live.metrics` → sparkplug-edge-node → EMQX → frontend**, two sites.
- Sites: **houston + dallas**. Tag/asset model: **realistic 2-site plant model** (multiple devices & measurements) — this is the permanent UNS catalog the designer binds to (PI-Vision-AF style), not throwaway.
- Designer binding UI: **TagPicker/AssetBrowser browse the live asset-model catalog**.
- Test gate: **typecheck + build** (`npm run build`) + existing `dotnet test tests/integration/binding-resolver.test.csproj`. No new frontend test runner.
- Live values/tags are **real product** (edge-node generic-metric support is a genuine gap being filled, not a harness).

## The UNS → transport contract (authoritative; everything must match)
Derived deterministically by `asset-model/Models/Asset.cs` for a path `<site>/<unit>/<device>.<measurement>`:
| Field | Value | Example (`houston/crude1/pump101.discharge_press`) |
|---|---|---|
| SparkplugGroup | `<site>` | `houston` |
| SparkplugEdgeNode | `<site>_edge1` | `houston_edge1` |
| SparkplugDevice | `<device>` (3-seg path) | `pump101` |
| SparkplugMetric | `<measurement>` | `discharge_press` |
| DDATA topic | `spBv1.0/<site>/DDATA/<site>_edge1/<device>` | `spBv1.0/houston/DDATA/houston_edge1/pump101` |
| Redis snapshot key | `snapshot:metric:<site>:<site>_edge1:<device>:<measurement>` | `snapshot:metric:houston:houston_edge1:pump101:discharge_press` |
| IoTDB path | `root.<path with / → .>` | `root.houston.crude1.pump101.discharge_press` |

Seeding asset-model with the paths auto-produces all transport fields (they are computed getters, EF-ignored). The simulator stamps `{group,edge,device,metric,value,quality,ts}` to match; the edge-node generic branch builds topic + Redis key from those verbatim; the frontend subscribes per-binding using resolver-provided group/edge and keys values fully-qualified (`group/edge/device/metric`) to avoid cross-site device-name collisions.

## Phase status
| Phase | Status | Gate evidence |
|---|---|---|
| A — Live data works | ✅ GATE PASSED (2026-07-05) | cross-site live values + staleness + build + tests (below) |
| B — Standalone viewer | ✅ GATE PASSED (2026-07-05) | `/display/:id` direct, 6 live tags both sites, 0 edit affordances |
| C — Trends | ✅ GATE PASSED (2026-07-05) | 1-tag + 3-pen live+historical trends, cursor reads all pens, shared time-bar (below) |
| D — Navigation | ✅ GATE PASSED (2026-07-05) | pump→L3 detail in-context (asset in URL), breadcrumb L1›L3, back/forward (below) |
| E — Asset-relative + collections | ✅ GATE PASSED (2026-07-05) | 1 pump display swapped across 20 pumps, every binding rebinds each swap (below) |

## GATE A — evidence (PASSED 2026-07-05)
Saved display `b42de765-…` ("Gate A - 2 Site Live"): 6 readouts bound to tank level / pump speed /
valve position across **houston + dallas**, observed in a real browser (Playwright, Preview mode):
- **Cross-site live + changing** — capture t1 → t2:
  - HOUSTON Tank01 Level 80.0% → 12.6% · Pump101 Speed 2041 → 1789 RPM · Valve01 Position 74.5% → 60.6%
  - DALLAS Tank02 Level 40.5% → 30.9% · Pump201 Speed 1101 → 2619 RPM · Valve02 Position 72.8% → 20.4%
- **Staleness (NE107)** — froze `houston/crude1/tank01.level` (sim `--exclude`): that tile rendered
  greyed + ⚠ badge (`.symbol-quality-stale`, grayscale+opacity) frozen at 81.5% while the other 5 stayed
  live/changing. Screenshots: scratchpad `gateA_live_t1.png`, `gateA_live_t2.png`, `gateA_stale.png`.
- **Build**: `npm run build` (tsc + vite) ✓ built in 19.70s.
- **Tests**: `dotnet test tests/integration/binding-resolver.test.csproj` → 8/8 passed.

### Phase A changes (product + enabling)
- Frontend: `SymbolRenderer.tsx` generic multi-slot resolution (`useSlotMetrics` over all declared slots +
  primary-value fallback) so any bound symbol shows live data; NE107 `SymbolQualityWrap` (universal stale
  degrade). `openBridgeTheme.ts` +`isStale`/`isBadQuality`. `mqttStore.ts` de-hardcoded → wildcard
  subscribe (`spBv1.0/+/…`) + env-overridable group/edge. `DisplayDesigner.tsx` load/save aligned to
  backend `snapshot` contract (was broken: sent/read `content`). `vite.config.ts` +`/api/assets`→asset-model
  proxy (AssetBrowser/TagPicker now browse the live UNS catalog).
- Backend/infra: edge-node generic `traverse.live.metrics` branch (per-record group/edge). binding-resolver
  asset-model URL-encoding fix. historian-bff multi-site `/snapshot`. `database/scripts/15_*.sql` 2-site
  plant seed. `scripts/sim/process_value_sim.py`. Test expectations corrected in `BindingResolverTests.cs`
  (device `pump101` per asset-model source-of-truth; `ioTDbPath` casing).

## GATE C — evidence (PASSED 2026-07-05)
Decision: **Both** (live buffer + IoTDB). Built process-value history: edge-node now also writes
each numeric `traverse.live.metrics` sample to IoTDB via REST at `root.<site>.<unit>.<device>.<measurement>`
(sim carries the `path`). Verified: `root.houston` auto-created, 10 timeseries, historian `/trend`
returns real points (28.64/57.77/74.38). Frontend: `mqttStore` live ring-buffer + `getLiveSeries`;
`fetchTrend` gained `measurements`; new `TrendChart.tsx` (echarts) wired into `chart.trend`.
- **Single-tag** display `43af13f4…`: real tank01.level waveform (IoTDB history + live), time-bar
  (5m/15m/1h/6h, ◀/Live/⏸/▶▶), legend, autoscale, zoom slider, cursor value-at-time. (`gateC_single.png`)
- **3-pen** display `2b5f8bb5…`: tank01.level + valve01.position + tank02.level on one chart, distinct
  colours + legend; cursor at 23:30:49 reads **all three independently** (84.65 / 54.87 / 63.62); one
  shared time-bar controls all pens. (`gateC_multi.png`)
- Build: `npm run build` ✓ 34.09s.
Deferred within C: per-pen multi-Y-axis (used shared autoscaled axis; fine for similar ranges);
historian still defaults to alarm columns when `measurements` omitted.

## GATE D — evidence (PASSED 2026-07-05)
Added `NavigationLink` to `CanvasItem` (targetDisplayId/targetUrl/assetContext/openMode). Viewer
symbols with a link are clickable (replace / new-tab / popup=iframe faceplate); viewer bar gained
Home/Back/Forward + a session breadcrumb trail (append forward, trim on return). Displays: L1
`Plant Overview` (pump tile → link) + L3 `Pump101 Detail`.
- Click pump on L1 → navigates to L3 detail with **`?asset=houston/crude1/pump101`** in the URL.
- Breadcrumb: **Plant Overview (L1) › Pump101 Detail (L3) · pump101**.
- L3 detail live: Speed 3039 RPM · Pressure 303.1 PSI · Temp 70.9 °C · Current 25.7 A.
- Back → overview; Forward → detail. (`gateD_detail.png`, `gateD_overview.png`) Build ✓ 32.69s.

## GATE E — evidence (PASSED 2026-07-05)
Asset-relative bindings: `{{element}}` substituted at runtime in the viewer against the selected
asset; an Asset selector lists sibling devices (same unit) and swaps the whole display. Seeded 20
pumps `houston/pumpstation/pump01..20` (+sim). One asset-relative Pump faceplate `495535cf…`
(`{{element}}.speed/discharge_press/motor_temp/current`), swept across all 20 pumps:
- **Every binding rebound to the selected pump on every swap** (`data-resolved` = `pumpNN.*` for all
  4 readouts, all 20 pumps).
- Live values track each pump's own data band (pump01≈1142 → pump20≈3370 RPM); **20/20 distinct**
  readings, all in expected band. (`gateE_pump01/10/20.png`) Build ✓ 39.09s.
- Also fixed a real bug: `useBindingResolver` now clears the prior value on rebind (asset swap no
  longer briefly shows the previous asset's value).
Remaining Phase E scope (NOT in the gate, not built): **collections** (repeat a symbol group over N
elements) and wiring the orphaned **TemplatePalette**. Also cosmetic: `shape.label` type renders as
the unknown "?" symbol (not handled in SymbolRenderer switch).

## 🏁 Gates A–E all PASSED (2026-07-05), each with observed browser evidence.

## Phase F–I (second roadmap) — audit-first; `SYSTEM_AUDIT.md` + `PHASE_FI_PLAN.md` approved 2026-07-08.

### GATE F — Alarms & dynamic behaviors — ✅ PASSED (2026-07-09)
Real end-to-end, no mocks. **Root-cause fix:** alarm state-change commands (suppress/shelve/out-of-service)
500'd because their handlers opened a manual DB transaction incompatible with the DbContext's
`NpgsqlRetryingExecutionStrategy` — dropped the redundant transaction (SaveChanges is atomic) in
`AMS.Application/Alarms/Commands/AlarmCommands.cs`; rebuilt ams-api. (The "192.168.1.51:8010 connection
refused" was background-poller noise, not the cause.) Also fixed the vite dev proxy: `/api/v1` + `/hubs`
(SignalR) now route to ams-api:8000 (alarm REST/hub were unreachable in dev).
Built: `rules[]`/`multiStateConfig`/`alarmSource` on `CanvasItem`; `ruleEngine.ts` (color/blink/hidden/
rotate + multistate); alarm annunciators (beacon/banner/summary) + `alarm.table` wired to `alarmStore`
(`SymbolRenderer.tsx`); viewer connects the alarm hub after login (App-level init); `scripts/sim/limit_watchdog.py`
(real limit breach → real latched alarm through traverse.alarm.raw-alarms + traverse.alarm.current-alarm-state).
**Evidence** (Playwright, logged-in viewer of display `4c31517d`, source `houston/crude1/pump101`):
| Stage | alarmStore (API `/active`) | Beacon | Banner | Table |
|---|---|---|---|---|
| Baseline | 0 active | hidden | – | 0 |
| Breach (watchdog: live 205.4 ≥ HiHi 100) | 1 · `UnacknowledgedUncleared` · Critical · unacked | **present + blinking** | "CRITICAL · …pump101/HiHi" | 1 (UNACK) |
| Suppress (`POST /suppress` → 200) | removed from active | **hidden** | – | 0 |
Screenshot `gateF_active.png`: red beacon, red banner, table row, **and** the speed readout carries an
orange rule-engine outline (speed>2500). Build ✓ 18.19s. Deferred/noticed: `shape.label` still renders the
unknown "?" glyph (pre-existing; slated for Phase H icon/type cleanup).

### GATE G — Editor pro-grade UX — ✅ PASSED (2026-07-09)
Rewrote the editor interaction model. **Multi-select** (`selectedIds`) via marquee + shift/ctrl-click;
group-aware selection; **group/ungroup** (`groupId` on `CanvasItem`); **align** left/right/top/bottom/
center + same-size; **z-order** front/back; **flip** H/V; **rotate handle**; **copy/paste** clipboard;
**wheel-zoom + space-pan**; configurable canvas size. Fixed the two audited history bugs: `updateItem`
now snapshots (drag/resize commit on mouse-up via `onCommit`; property edits commit), and the ref-based
history eliminates the `slice(-50)`/index desync. Files: `DesignerCanvas.tsx` (rewritten),
`DisplayDesigner.tsx` (ref history + ops), `types.ts` (+`groupId`/`hidden`/`flipH`/`flipV`).
**Evidence** (Playwright, authenticated `/designer/<id>`, verified against `window.__designer` state):
- copy/paste → 6 items, new independent id, +20/+20 offset; undo paste → back to 5.
- marquee-select **5**; group → all 5 share one `groupId`; click one grouped item → whole group (5) selected.
- align-left → all x=80; align-top → all y=90.
- **undo×3 → positions == baseline AND ungrouped**; **redo×3 → re-grouped + aligned**. History accurate at
  every step. (`gateG_aligned.png`, `gateG_final.png`) Build ✓ 19.40s.

### GATE H — Design-system unification (OpenBridge / PI Vision) — ✅ PASSED (2026-07-09)
Created `designTokens.css` — the single source of truth for AMS semantic colors + trend-pen palette +
surfaces/typography, with `day` / `bright` / `night` variants keyed on `data-obc-theme`. Rewired the
scattered color sources onto it: `openBridgeTheme.OBC` (alarm/warn/caut/run → `var(--ams-*)`),
`TrendChart` pens + chart chrome (resolved from `--ams-pen-*`; pen-1 == `--ams-crit`, so one token
feeds alarms AND the first trend pen), and `Designer.css` raw status hex (`#dc2626`→`--ams-crit`,
`#f59e0b`→`--ams-warn`, `#22c55e`→`--ams-run`). Added `night` to the shell theme toggle + a day/night
control on the standalone viewer.
**Evidence** (Playwright, authenticated viewer of display `6bbcdcf9` = alarm beacon + live+historical trend):
- **One token drives both**: with `--ams-crit=#e10019` the alarm beacon **and** trend pen-1 are both
  `rgb(225,0,25)`; changing **only** `--ams-crit`→`#8b5cf6` turned **both purple** (`gateH_before.png`
  vs `gateH_after.png`).
- **Day↔Night respected on every screen**: switching to night shifted `--ams-crit`→`#ff5a6a`, panel bg
  `#ffffff`→`#111827`; OpenBridge chrome + alarm + trend all re-themed (`gateH_night.png`). Build ✓ 18.73s.
Scope note (honest): Phase H delivered the **color-token unification + day/night theming** (the gate's
three testable asks). The broader restructure — full emoji→OB-icon sweep and app-shell/asset-panel
re-layout — is **partial** (ops/nav still use emoji; `shape.label` still renders "?"); logged for a
follow-up styling pass, not required by Gate H.

### GATE I — PI Vision import — ✅ PASSED (2026-07-09)
Lifted + adapted the importer into `frontend-ob/src/services/import/pdixImport.ts` (JSZip → `.pdix`
`display_json` → our `CanvasItem[]`), with `mapPdixType` re-pointed to OpenBridge/AMS ids and emitting
the Phase H tokens (`backgroundColor: var(--ams-canvas-bg)`). Import UI `ImportPage.tsx` at
`/designer/import`: upload → preview (per-type counts) → **unmapped list surfaced for manual mapping**
→ save as an AMS display. Added `shape.label` (text) renderer + fixed ellipse→`shape.circle` so imports
render faithfully (also clears the old "?" glyph). Perf fix: `useBindingResolver` only subscribes bound
slots to the live map (a 720-item display mounts ~11.5k slot-hooks; unconditional subscription re-rendered
all on every MQTT tick). Installed `jszip`.
**Evidence** (Playwright, authenticated): imported bundled **`301-Kiln.pdix`** →
- **720 items** parsed (statictext 257, rectangle 204, value 149, graphic 102, line 5, ellipse 2, trend 1,
  group 1); **102 graphics surfaced in the import UI for manual mapping** with their DirectoryKey/FileKey
  refs — none silently dropped (`gateI_import.png`).
- Saved + **rendered faithfully in the designer** — real PI Vision text labels, value boxes, colored
  shapes, trend, positioned per the original Kiln HMI, in the Phase H design system (`gateI_designer.png`).
- An **imported symbol's binding resolved to live data** (remapped value → `houston/crude1/pump101.speed`
  → live **2917.6 RPM**) (`gateI_live.png`). Build ✓ 26.49s.

## 🏁🏁 SECOND ROADMAP COMPLETE — Gates F, G, H, I all PASSED (2026-07-09), each with pasted evidence.

## Phase J–L (third roadmap) — audit-first; `SYSTEM_AUDIT.md` §7–§11 + `PHASE_JL_PLAN.md` approved 2026-07-13.
Decisions locked: Operators/Viewers **can** trend · the runtime viewer **requires login** (anonymous kiosk
mode removed) · AMS.Api's `TestAuthHandler` bypass **gets replaced with real JWKS validation in K**.

### GATE J — Dedicated trend view (page + dialog) — ✅ PASSED (2026-07-13)
Reused Phase C's engine rather than rebuilding it: lifted `TrendChart`'s body into **`TrendCore.tsx`**
(pens-driven — `{path,label}[]` instead of a `CanvasItem`), leaving `TrendChart` as a thin adapter
(`item.bindings → pens`). The same core now backs three surfaces: the canvas symbol, the ad-hoc
**`TrendDialog`**, and the deep-linkable **`/trend?tags=…`** page. Added PI-Vision presentation on top:
**per-pen Y-axes** (paying down Phase C's shared-axis deferral, which would have flattened mixed units),
a legend that reads **each pen's value at the cursor** with its engineering unit, and range presets
15m/1h/8h/1d/1w + ◀/⏸/▶▶/**Now** + window timestamps + LIVE/HISTORICAL state. Trend entry points: the
designer ops toolbar (enabled when the selection has bound tags) and the runtime viewer (Operators may
trend). `/trend` was already taken by the legacy `IoTDBTrendViewer` — moved that to `/iotdb-trend` (nav kept).
**Real bug fixed (inherited from Phase C):** the historian returns `null` for empty buckets and
`Number(null) === 0` **is finite**, so every gap was being plotted as a **zero**. Now empty buckets are
dropped before the cast. (Visible in the first gate run: all three pens read `0.00`.)
**Evidence** (Playwright, authenticated designer, display `1c86cd44`, 3 mixed-type tags):
| Check | Observed |
|---|---|
| 3 pens, mixed units, distinct token colors | `tank01.level 86.27 %` `rgb(225,0,25)` · `pump101.speed 2404.46 RPM` `rgb(64,192,87)` · `pump101.discharge_press 146.60 PSI` `rgb(250,176,5)` |
| Per-pen Y-axes | `3` axes rendered |
| Cursor (reads every pen at one timestamp) | @45% → `["77.79","2963.29","279.65"]` · @75% → `["18.97","2791.97","399.18"]` |
| Zoom (dataZoom, Phase C) | window `0.0-100.0` → after wheel `3.8-94.7` |
| Live ↔ historical | `LIVE` → [◀] `HISTORICAL` (end 22:46:43) → [Now] `LIVE` (end 22:54:15) |
| Open in full page | `/trend?tags=houston%2Fcrude1%2Ftank01.level%2C…pump101.speed%2C…discharge_press` → same 3 pens live |
| Canvas untouched on return | before `{items:3, selectedIds:[gj1,gj2,gj3], histIndex:0, histLen:1}` == after |
9/9 checks pass (`gateJ_dialog.png`, `gateJ_cursor.png`, `gateJ_historical.png`, `gateJ_fullpage.png`).
Build ✓ 26.25s.
Note: the stack had to be restarted for this phase; the auth volume re-bootstrapped the admin from the
compose default, so dev login is now **`admin` / `ChangeMe123!`** (was `Admin123!` during F–I).

### GATE K — RBAC (Designer vs. published runtime) — ✅ PASSED (2026-07-13)
The audit found this was **not** "add a role check": the roles were real, but **display-service had no
authentication layer at all** (anonymous writes + publish), the permission vocabulary was **alarm-only**
(no `display.*` key existed), and **AMS.Api's `TestAuthHandler` authenticated every anonymous request
with the full 11-permission admin set**, making its `[Authorize]` policies decorative.
Built: `display.view` / `display.edit` / `display.publish` permissions + role mapping (Admin/Engineer =
all three · Operator/Viewer = view) in the auth-service seed **and** the live DB; test users
`engineer1` / `operator1` / `viewer1` (`Passw0rd!23`); **RS256 bearer validation in display-service**
(`Auth/JwksKeyCache.cs` — auth-service serves JWKS but no OIDC discovery, so keys are fetched directly
and re-fetched on an unknown `kid`) with `DisplayView`/`DisplayEdit`/`DisplayPublish` policies on all 10
endpoints; **the same in AMS.Api, replacing `TestAuthHandler`** (+ `?access_token=` support, which
SignalR WebSockets and browser CSV downloads require); `apiFetch` (the display calls previously sent
**no** Authorization header at all); a real `RequirePermission` route guard; the **Operator launcher**
`/displays` (the display list only ever opened the *designer*, so Operators had no way to reach a
published HMI); `--ams-disabled` read-only tokens.
**Real bug fixed:** refresh tokens are single-use, and App bootstrap + an `apiFetch` 401-retry could
fire two concurrent refreshes — the second presented a spent token and killed the session on reload.
`authStore.refresh` is now single-flighted. Also raised auth-service's 100-req/15-min per-IP rate limit
(a control room behind one NAT would trip it).
**Evidence — API, bypassing the frontend entirely (real tokens, pasted verbatim):**
```
PUT  /displays/{id}/content   no token   → HTTP/1.1 401 Unauthorized
PUT  /displays/{id}/content   operator1  → HTTP/1.1 403 Forbidden
POST /displays/{id}/publish   operator1  → HTTP/1.1 403 Forbidden
GET  /displays                operator1  → HTTP 200                       (reads allowed)
PUT  /displays/{id}/content   engineer1  → HTTP/1.1 200 OK  {"version":5,"status":"draft"}
--- AMS.Api (was: TestAuthHandler passed EVERYONE with full admin rights) ---
GET  /api/v1/alarms/active    no token   → HTTP 401
GET  /api/v1/alarms/active    admin      → HTTP 200
POST /api/v1/alarms/…/suppress viewer1   → HTTP 403
POST /api/v1/alarms/…/suppress admin     → HTTP 400   (reached the handler = authorized)
```
**Evidence — frontend (Playwright, two live sessions):** Engineer → Designer nav present, designer opens,
**Publish visible** (`Draft v16 · Published v16`). Operator → **no Designer nav**; typing
`/designer/<id>` **redirects to `/displays`** (designer never renders); launcher lists `Published v16`;
the runtime viewer runs with live values `["34.0","3074.9","384.1"]` and **zero edit UI**. 9/9 checks pass
(`gateK_engineer_designer.png`, `gateK_operator_redirect.png`, `gateK_operator_launcher.png`,
`gateK_operator_viewer.png`).
**Regression bar (decision 3):** the Gate F alarm path still works under real auth — SignalR negotiate
`200`, WebSocket opens carrying the RS256 token, the injected **real limit-breach alarm** (pump101
discharge_press 332.28 ≥ HiHi 100) renders as `CRITICAL`, and **no 401/403** on any alarm REST/hub call.
Builds: `npm run build` ✓ 22.01s · `dotnet build` display-service + AMS.Api ✓ 0 errors.

### GATE L — Publish workflow — ✅ PASSED (2026-07-13)
The audit found the backend **already had** draft/published versioning (`draft_version`,
`published_version`, append-only `display_versions` with `status`, and a working `POST /publish`) — it
behaved as edit-is-live for exactly one reason: `GET /content` defaulted to the **draft** and the viewer
called it with no params, so `published_version` was never read by anything. So L was small:
`?stage=published` on the content read (default stays `draft` — the Designer needs it) + a 404 when
nothing is published; the viewer now requests it; **Publish / Unpublish / Revert** in the designer header
with `Draft vN · Published vM · unpublished changes` badges (gated on `display.publish`); new
`POST /unpublish` and `POST /revert` (revert copies the published snapshot into a **new** draft — history
is never rewritten). The viewer also stops retrying a 404 and says *why* it is blank.
**Evidence** (Playwright — Engineer editing in the real Designer UI, Operator watching the runtime in a
second session; `served` = what display-service returns for `?stage=published`):
| Step | Designer | Served (live) | Operator sees |
|---|---|---|---|
| Baseline | 3 items · Draft v13 · Published v13 | v13 (published) — 3 items | **3 symbols** |
| Engineer edits + **Saves** (no publish) | 4 items · Draft v14 · Published v13 · *unpublished changes* | **v13 — 3 items** | **3 symbols** (unchanged) |
| Engineer clicks **Publish** | 4 items · Draft v14 · **Published v14** | **v14 — 4 items** | **4 symbols** |
| Engineer edits + Saves again | 5 items · Draft v15 · Published v14 · *unpublished changes* | **v14 — 4 items** | **4 symbols** (unchanged) |
| Engineer clicks **Revert** | **4 items** (back to published) · Draft v16 | v14 — 4 items | 4 symbols |
| Engineer clicks **Unpublish** | Draft v16 · **Not published** | **404 "Display has no published version"** | *"This display has no published version yet…"* |
6/6 checks pass (`gateL_1_baseline_operator.png` … `gateL_5_unpublished_operator.png`). Build ✓.

## 🏁🏁🏁 THIRD ROADMAP COMPLETE — Gates J, K, L all PASSED (2026-07-13), each with pasted evidence.

## Final status — all 12 phases (A–L)
| Phase | Status |
|---|---|
| A — Live data works | ✅ PASSED (2026-07-05) |
| B — Standalone runtime viewer | ✅ PASSED (2026-07-05) |
| C — Trends (live + historical, multi-pen) | ✅ PASSED (2026-07-05) |
| D — Navigation (HPHMI L1→L4) | ✅ PASSED (2026-07-05) |
| E — Asset-relative displays | ✅ PASSED (2026-07-05) |
| F — Alarms & dynamic behaviors | ✅ PASSED (2026-07-09) |
| G — Editor pro-grade UX | ✅ PASSED (2026-07-09) |
| H — Design-system unification | ✅ PASSED (2026-07-09) |
| I — PI Vision import | ✅ PASSED (2026-07-09) |
| J — Dedicated trend view | ✅ PASSED (2026-07-13) |
| K — RBAC (Designer vs. runtime) | ✅ PASSED (2026-07-13) |
| L — Publish workflow | ✅ PASSED (2026-07-13) |

**Dev credentials (this stack):** `admin`/`ChangeMe123!` (Admin) · `engineer1`/`operator1`/`viewer1` with
`Passw0rd!23`. **Lab runbook:** `docker compose up -d` in `infra/docker`, then the `ams-sim` container
(process values) — binding-resolver may need `--no-deps` because asset-model's healthcheck image lacks
`wget` and reports unhealthy while actually serving fine.

### PLATFORM-WIDE AUTH + RBAC — ✅ DONE (2026-07-14)
Phase K secured only display-service and AMS.Api. This closes the rest: **every service now validates
RS256 tokens and enforces a permission**, and **every page/route is permission-guarded**.

**"Admin can't access the HMI Designer" — diagnosed, not guessed.** Admin's token *did* carry
`display.edit`, and the Designer opened fine on the dev server. The cause was the **production frontend
image (`ams-frontend`, :3000), which predated Phase K** — an old bundle with no `/displays` route and no
token on display calls. Rebuilt; admin now reaches the Designer on **both** :5174 and :3000 (verified).
A stale in-browser session from before the permissions were seeded produces the same symptom — re-login.

**Built**
- `src/services/_shared/TraverseAuth.cs` — one auth module (JWKS bearer validation + a policy per
  permission key + an `X-Service-Key` service principal), copied into each service because each builds
  from its own Docker context. `scripts/sync-auth-module.ps1 [-Check]` keeps the copies from drifting.
- **Enforced in:** asset-model (10), template-service (8), binding-resolver (4), historian-bff (4),
  analysis-service (10), audit-service (1) — **37 endpoints**, on top of display-service (10) + AMS.Api.
  `/health` stays anonymous (container probes).
- **New permissions** (auth-service seed + live DB): `asset.view/edit`, `template.view/edit/publish`,
  `binding.resolve`, `historian.view`, `analysis.view/edit`. Every role gets the **read** keys — a running
  display must resolve bindings, read the UNS catalog and pull history, so withholding them would render
  an empty canvas for Operators. Only Admin/Engineer get the **edit** keys.
- **Service-to-service:** binding-resolver → asset-model has no user context; it now authenticates with
  `X-Service-Key` (`Auth__ServiceKey`, per-service compose env). Without this the live data path would
  have broken the moment asset-model started requiring a token.
- **Frontend:** the remaining 14 unauthenticated call sites (AssetBrowser, TemplatePalette,
  useBindingResolver, mqttStore ×4, iotdbPaths, historianHealth, SystemMonitor, viewer asset list) moved
  onto `apiFetch`; **every route** now carries the permission its APIs need — `/admin/*` was reachable by
  any authenticated user via direct URL; nav entries match their route guards; a role that lacks a
  permission gets an explicit "Not authorized" page instead of a redirect loop. Dropped the
  `Bearer ${token || 'dev'}` fallback in `alarmApi`.

**Bugs found and fixed along the way** (all pre-existing):
- **audit-service did not compile at all** (Worker SDK + `WebApplication`, missing
  `Serilog.Settings.Configuration`) — verified against a pristine HEAD checkout. No Dockerfile and absent
  from compose, so nothing ever caught it. Now builds.
- **Every .NET service healthcheck was a lie**: `wget -qO- .../health` in an aspnet image that has no
  `wget` → permanently "unhealthy", which is why `binding-resolver` refused to start (its `depends_on`
  waits for asset-model to be healthy). Replaced with a `bash /dev/tcp` probe; all six now report healthy.
- **No `.dockerignore` in any service** → a host `dotnet build` leaks `obj/project.assets.json` (with
  Windows nuget paths) into the image and breaks `dotnet publish --no-restore`. Added to all six.
- `/api/templates` had **no vite proxy** — TemplatePalette's calls fell through to a dead catch-all.

**Evidence — RBAC matrix (real tokens, all four roles, every service; `no token` column = anonymous):**
```
SERVICE           ENDPOINT                 KIND    none     admin engineer1 operator1   viewer1
asset-model       GET  /assets             read     401       200       200       200       200
asset-model       POST /assets             write    401       201       409*      403       403
binding-resolver  GET  /resolve            read     401       200       200       200       200
binding-resolver  POST /resolve/batch      read     401       200       200       200       200
historian-bff     GET  /snapshot           read     401       200       200       200       200
historian-bff     GET  /trend              read     401       200       200       200       200
template-service  GET  /templates          read     401       200       200       200       200
template-service  POST /templates          write    401       201       201       403       403
analysis-service  GET  /analyses           read     401       200       200       200       200
analysis-service  POST /analyses           write    401       400*      400*      403       403
display-service   GET  /displays           read     401       200       200       200       200
display-service   POST /displays           write    401       201       201       403       403
ams-api           GET  /api/v1/alarms/active read   401       200       200       200       200
health endpoints (no token) → 200 on all six services
* 409 = duplicate asset, 400 = probe body rejected: the handler RAN, i.e. authorization passed.
RBAC MATRIX: PASS
```
**Evidence — UI role walk (Playwright, all four roles, live stack):**
| Role | Designer nav | `/designer` direct | `/admin/users` direct | Runtime viewer live values | Unexpected 401/403 |
|---|---|---|---|---|---|
| admin | ✅ | opens | opens | `15.4 / 1702.0 / 263.1` | **NONE** |
| engineer1 | ✅ | opens | → `/displays` | `87.1 / 2732.7 / 218.6` | **NONE** |
| operator1 | ❌ | → `/displays` | → `/displays` | `18.5 / 1595.3 / 227.5` | **NONE** |
| viewer1 | ❌ | → `/displays` | → `/displays` | `82.5 / 2861.7 / 261.2` | **NONE** |
Live values render for **every** role — bindings, historian and assets all authenticate correctly, so
locking the platform down did not break the data path. `npm run build` ✓ 20.38s; all 6 services build ✓.
Prod frontend (:3000) re-verified as admin: Designer opens, zero 401/403.

### DESIGNER AUDIT + REDESIGN (M1–M5) — ✅ DONE (2026-07-14)
Four parallel audit agents (design-system, UX/layout, correctness, published-HMI), then fixes phase by
phase with evidence. User-approved scope: everything, migrate old data, full icon sweep.

**M1 — Why the Designer looked "not OpenBridge" (root cause, one bug, ~40 symptoms).**
`Designer.css:12-38` built a `--designer-*` layer on **OpenBridge token names that do not exist**
(`--container-background-color-alt`, `--container-surface-color`, `--container-border-color`,
`--on-container-regular-color`, `--alert-*-border-color`…). A `var()` fallback fails **silently**, so all
but one fell through to a hardcoded Tailwind-slate hex — that was the dark navy, and it is why
day/night did nothing in the Designer: **the tokens were never live.** Rewired onto 12 verified real
tokens with **no hex fallbacks** (a missing token must break loudly). Also: `styles/app.css` had 33 more
invented names (`--divider-color` ×31, `--surface-background-color`…) — defined once as aliases over real
tokens in `designTokens.css`; the inline JS palettes in `App.tsx`/`DisplayList.tsx` (which beat every
stylesheet) now hold tokens; two `@keyframes spin` de-duplicated; `--designer-danger`/`--designer-success`
were **used but never defined** (dead rules: the alarm banner had no background at all).
**The canvas was worse:** the Designer wrote `backgroundColor: '#0f172a'` **hardcoded on every save**, and
the viewer applies it as an *inline* style — un-themeable, and it silently overwrote imported displays
that had correctly stored a token. Fixed + **migrated the existing data** (`17_display_background_token_migration.sql`:
14 snapshot versions + 6 display rows → `var(--ams-canvas-bg)`).
**Evidence:** day → `header rgb(247,247,247) / text rgb(31,31,31)`; night → `rgb(0,0,0) / rgb(234,167,94)`;
viewer canvas `#f3f5f9` → `#0b1220` (was navy in every theme). `m1_designer_day/night.png`.

**M2 — Correctness bugs (all pre-existing, all now proven fixed):**
| Bug | Was | Now |
|---|---|---|
| **Every Save wiped the undo stack** — the refetch re-seeded history (`setItems + history=[loaded] + index=0`) | add 3 symbols → Ctrl+S → Ctrl+Z did nothing | seeds **once per display**; undo after save: 5 items → 4 ✓ |
| Edits during an in-flight save were reverted by the refetch | silent data loss | server is the source of truth only at load |
| **No unsaved-changes guard anywhere** (zero `beforeunload` in the frontend) | Back/refresh destroyed the work silently | `beforeunload` + confirm on Back ✓ |
| **Revert flagged the display "unpublished changes" forever** (revert bumps draft_version) | badge lied on every reverted display | revert now publishes the identical snapshot → `Draft v24 · Published v24` ✓ |
| Live-trend **zoom snapped back** on any re-render (`notMerge` re-applied an option with no start/end) | zooming into a spike was impossible | zoom held through 6 mousemoves + a live tick: `4.0-94.9` ✓ |
| **Pause didn't freeze** the window (it only stopped the interval) | "paused" chart kept scrolling | window end pinned; mode reads `PAUSED` ✓ |
| Asset-relative display opened from the launcher was **dead** (no `?asset=` → every symbol `--`) | no hint, no default | defaults to the first candidate asset |
| Save/publish failures were **completely silent** (no `onError`, no toast) | engineer walked away believing it saved | toasts on every lifecycle action |
| **Audit trail was fiction**: every save posted `userId: 'designer-user'` | `created_by` identical for every person | real user from the session — DB now shows `created_by=engineer1` |
| Import ignored **both** HTTP statuses | a failed content PUT navigated you into an empty display, import lost | both checked, real error surfaced |
| Viewer replaced a **live** screen with "Failed to load" on any refetch blip | kiosk screens blanked on a transient 500 | keeps last-good content + a non-destructive banner |
| Space key flipped the canvas to pan **while typing** in a text field | typing a space in the palette search | typing guard moved first |
| `/trend?tags=a,a` → duplicate pens (dup React keys, removing one removed both) | — | deduped |
| `resolveColor()` forced a style flush **9× per render** (every 2s tick, every mousemove) | — | memoised per theme |

**M3 — Toolbar + full-screen.** The toolbar was **31 controls in one non-wrapping 48px row** (~1600px
intrinsic in ~1420px — it already overflowed at 1920px), all unlabelled glyphs, with `⬆` meaning **two**
different things (bring-to-front *and* Publish) and align-centre-V implemented but **unreachable** (no
button). Rebuilt as `DesignerToolbar.tsx`: a **document bar** (name · mode · full-screen · Save ·
Publish▾ · version) + a **context bar** (undo/redo │ group · Align▾ (all 6 + same-size) · order · flip │
zoom −/combo/+ · **Fit** │ grid · tags · trend), with Unpublish/Revert folded into the Publish menu and a
`⋮` overflow (canvas size, fit, shortcuts). **The Designer is now a full-viewport route outside the app
shell** (it was getting ~1420px of a 1920px screen, so a 1920px artboard could never be seen at 100%).
Added **fit-to-screen** (there was none anywhere), centred + padded the artboard, removed the duplicate
zoom chip (zoom was displayed in **three** places), and fixed `.designer-canvas`'s hardcoded
`min-width:1920px` which overrode the display's real canvas size.
**Evidence:** designer width == viewport (1600px), **0 toolbar overflow** on both rows, Fit → 110%.

**M4 — Published-HMI features (both user asks).**
- **Last published time + publisher.** It **did not exist in the data model**: publish flips an existing
  draft row's status, so `created_at` is the *save* time (a draft saved Monday, published Friday, reported
  Monday) and `updated_at` is bumped by six unrelated operations. Added `published_at`/`published_by` to
  both tables (`18_display_published_at.sql`, idempotent + backfilled), stamped **from the bearer token**
  (never the request body), surfaced in the designer header and on every launcher card:
  `Published v24 · 23m ago by engineer1`.
- **Trend from published displays.** The runtime had **no selection model at all** — clicking a symbol did
  nothing unless it had a navigation link, and the Trend button silently capped the whole display at 6
  pens. Now: **ctrl/shift-click** symbols → multi-pen trend · **Pick tag** mode → click one symbol →
  single-tag trend · **Trend** with no selection → whole display (and it *says* when it caps).
  **Evidence (as operator1):** multi = 2 pens, single = 1 pen, whole = 3 pens ✓.
- Launcher also gained search, category chips, description, open-in-new-tab (real `<a href>`), and a fix
  for a **real bug**: it fetched the default `take=50` and filtered published **client-side**, so with >50
  displays published ones silently vanished.

**M5 — Icons.** Emoji chrome replaced with **verified** OpenBridge `Obi*` icons across the sidebar nav
(18), designer toolbar, symbol palette (~60, resolved from the symbol *type*), property inspector and
canvas. Where OpenBridge genuinely has **no** icon (zoom, flip, group, align, publish) the control is a
**text-labelled button** rather than an invented glyph — which also kills the undecodable `⊢ ≑ ⊣ ⊤ ⊥`.
**Evidence:** emoji scan of nav + toolbar + palette → **NONE**.

Builds ✓ (`npm run build` 30.4s, display-service 0 errors). RBAC regression re-run: all four roles still
render live values with **no unexpected 401/403**.

### DESIGNER GAP-CLOSURE (N1–N6) — ✅ DONE (2026-07-14)
Every fix benchmarked against **AVEVA PI Vision 2025** (User Guide + the real `.pdix` wire schema from
`301-Kiln.zip`), cross-checked against Ignition / WinCC / FactoryTalk / InTouch / ArchestrA, and against
**ISA-101 · ISA-18.2 · ASM**. Plan: `PHASE_N_PLAN.md`.

**The reframing finding:** `NavigationLink`, `hidden`, `locked`, `zIndex`, `groupId` and 17 named binding
slots were **already in the model and already honored by the runtime**. The gap was authoring UI.

| # | Was | Now | Benchmark |
|---|---|---|---|
| **N1** | Asset tree **replaced** the property inspector (XOR), and could only ever write `bindings.value` — so **16 of 17 slots were unreachable** | Left panel = **Symbols │ Assets │ Layers** tabs; properties pinned right; clicking a tag binds the symbol's **primary declared slot** | PI Vision/Ignition/WinCC all put sources left, properties right — for exactly this reason |
| **N2** | With 5 symbols selected the inspector **silently edited only the first** — a data-loss trap | Bulk editor: **blank = "values differ"**, never seeded from item[0]; one bulk edit = **one** undo entry; bindings/label/position stay single-only | PI Vision "Format Symbols": *"if the value is blank … set to different values"*; **bulk binding refused** for tag traceability |
| **N3** | **No navigation authoring at all** — a multi-screen HMI could not be built | **Action tab**: open display (real display picker) / URL (https-or-same-origin **validated**) ; open modes replace/new-tab/**popup**; asset context **none / this symbol's asset / as-root / explicit**; **`shape.hotspot`** for linking over imported P&ID art; link badge in design mode | PI Vision `LinkURL`/`NewTab`/`IncludeAsset`. We store a **FK, not a URL** — PI Vision stores the route, so renaming a display breaks every inbound link |
| **N4** | No rename, no duplicate, no delete. Deletes were soft but **unrecoverable through the API** | `POST /duplicate` (**Save As** — regenerates item ids so groups don't alias), `GET /deleted`, `POST /restore`; card menu + confirm + **Undo** toast + recycle bin | PI Vision: Save▾ → Save As; delete → **Recycle Bin**, retained indefinitely |
| **N5** | "Space+drag pan" was **advertised in the toolbar and did nothing**; snap was **unconditional** (nothing could be placed off-grid); `hidden`/`locked` had **no UI whatsoever**; `hidden` was **inverted** (vanished from the editor, still rendered in the runtime) | Pan (**Space+drag and middle-drag**); **Snap toggle + Alt-bypass**; **Layers panel** (z-order list, eye/lock, filter); hidden now ghosts in the editor and hides at runtime | PI Vision has a snap toggle + **Alt to bypass**; it has **no pan at all**, so we take the industry gesture instead |
| **N6** | Design mode showed **`--` for bound and unbound alike** — the one question design mode exists to answer | Three states: **`{tag}`** bound · dimmed **—** + **dashed outline** unbound · live value in preview | No vendor documents a design-mode placeholder (Ignition shows live data) — this is genuinely novel |

**Bugs found while building this (all pre-existing, all fixed):**
- **`transform: scale()` does not affect layout**, so the canvas well never overflowed — **zoomed-in content
  was simply unreachable** at any zoom above fit. A stage element now reserves the scaled footprint.
- `itemMouseDown` stopped propagation for **every** button, so middle-drag pan never fired when the pointer
  was over a symbol — i.e. anywhere useful on a dense display.
- `.designer-canvas` hardcoded `min-width:1920px`, overriding the display's real canvas size.

**Evidence (Playwright, live stack):**
- N1: asset tree **and** property inspector on screen together ✓
- N2: 4 selected → width field reads **"Mixed"** → set 150 → **[150,150,150,150]**; **one** undo → **[220,220,220,66]** ✓
- N3: picker lists real displays → authored `{targetDisplayId, assetContextMode:'current-asset'}`, link badge drawn ✓
- N4: duplicate → **fresh item ids** (`i04a7151a0d0`…), status `draft`; delete → bin (1) → restore → back in list ✓
- N5: layers lists 4 objects; eye → 1 hidden + **ghosted (still selectable)**; lock → 1 locked; snap toggles; **middle-drag pans (scrollLeft 0 → 180)** ✓
- N6: design mode shows `{tank01.level}` `{pump101.speed}` `{pump101.discharge_press}`; **1 symbol flagged unbound** ✓
Builds: frontend ✓ 32.4s · display-service ✓ 0 errors.

**Standards correction (worth recording):** an earlier draft cited "≤3 clicks from L1" as a rule. **It is
folklore** — it is in no ISA-101 clause, no Hollifield paper and no ASM guideline. The citable
requirements are **ASM 5.1/5.2/5.3** (flat, directly accessible, no menu-directory dependency) and **ASM
5.5** (call-up ≤3 s). Alarm→display jump is **ISA-18.2 §11.6.2.6(a)** (a *should*). Also note **ASM 9.3
(P1): modal dialogs are not to be used** — our popup faceplate must stay non-modal.

### DESIGNER TAIL — thumbnails · launcher hierarchy · smart guides · CSS cleanup — ✅ DONE (2026-07-14)

**Thumbnails.** The display cards rendered a **grey box containing the text "1920 × 1080"** dressed up as
a preview. Now a real one: `thumbnail.ts` serialises the display to a **schematic SVG** and it is stored
(`19_display_thumbnail_and_level.sql` → `thumbnail_svg`, `PUT/GET /displays/{id}/thumbnail`).
Three deliberate choices, all load-bearing:
- **SVG, not a raster** — we render DOM/SVG (no Konva), so a preview is a *serialization*: no
  html2canvas, no headless browser, no blobs in Postgres.
- **A schematic, not a DOM dump** — OpenBridge symbols are Web Components with **shadow DOM, which does
  not serialize**; a naive `XMLSerializer` pass would silently emit empty boxes, which is worse than an
  honest schematic. Symbols are drawn as their footprint, coloured by kind; text symbols as text.
- **Generated on PUBLISH only, from the DESIGN-MODE model** — never on autosave (you would melt the
  browser), and never from live data, so **a thumbnail can never leak a process value** into a screenshot
  of the display list. The server also rejects any SVG containing `<script`/`onload`.
No editor in the survey (Ignition, WinCC, FactoryTalk, InTouch, ArchestrA) ships display thumbnails, so
there was no prior art to copy.

**Launcher hierarchy + favourites.** Added **`level` (ISA-101 Clause 6.3: 1=overview · 2=unit control ·
3=unit detail · 4=support/diagnostic)** to the display model — `category` had been doing double duty, which
is why the launcher could not present a hierarchy — backfilled from category. The launcher now has level
chips, process-area chips (from `hierarchyPath`; ASM 1.3 "organise by the process equipment hierarchy"),
**Favourites** and **Recents**, real previews, and search. Deliberately **not** a folder tree: **ASM 5.2/5.3
(Priority 1)** require primary displays to be *directly accessible* and reachable *without depending on a
menu directory*. Favourites/Recents are flagged in-code as a **product decision, not a compliance item** —
no standard requires them.

**Smart alignment guides.** Dragging now snaps the selection's left/centre/right and top/middle/bottom to
the same six lines on every other item, and **draws the line it snapped to**. Not in PI Vision (grid snap
only) but standard in Ignition Perspective and every modern editor — and the difference between a display
that *is* aligned and one that is approximately aligned. Tolerance is in canvas units (÷ zoom), so guides
don't get stickier as you zoom in. Alt still bypasses everything.

**CSS cleanup.** 19 selectors were defined more than once (Designer.css was appended to across ~10 phases).
**Deleting the earlier blocks would have been wrong** — CSS *merges* declarations, so an earlier block can
legitimately supply properties the later one doesn't. Instead: removed only the **dead declarations** —
properties in an earlier block that a later block with the same selector re-declares — which cannot change
any computed style. **46 dead declarations removed, 8 fully-dead blocks removed.** Verified by re-running
the theme probe (day `rgb(247,247,247)` → night `rgb(0,0,0)`; canvas `#f3f5f9` → `#0b1220`) **after** the
edit: rendering unchanged.

**Evidence:** smart guides — dragged an item toward y=224, **2 guide lines shown, snapped to y=220** ✓ ·
publish → **`PUT /thumbnail 200`**, launcher card renders a **real SVG (5 shapes)** matching the layout ✓ ·
level chips `All / L1 Overview / L2 Unit / L3 Detail / L4 Diagnostic`, star → **Favourites** section,
open → **Recent** section ✓ · theme + all-four-role regression re-run after the CSS edit: **PASS, no
unexpected 401/403** ✓. Builds: frontend ✓ 33.7s · display-service ✓ 0 errors.

## Deferred items noticed (do NOT fix early — later-phase scope)
- **Device-id inconsistency**: binding-resolver FALLBACK + `/preview` derive `unit_device` (crude1_pump101)
  while asset-model (authoritative, used by the live path) derives `device` (pump101) for 3-seg paths.
  Reconcile the fallback to match asset-model. (Not exercised on the working path.)
- **nginx prod** needs an `/api/assets`→asset-model route to mirror the vite dev proxy.
- **display-service content/snapshot**: backend uses `snapshot`; frontend now adapts. Consider standardizing.
- Metric devices surface as "active alarms" in the live panel (mqttStore `buildLiveAlarmFromMetrics` treats
  any device with state as an alarm) — cosmetic; revisit when alarms-on-canvas (Phase F-ish) is done.
- SignalR alarm hub 404 in dev (ams-api negotiate) — unrelated to MQTT live data; pre-existing.
- IoTDB path literals in `utils/iotdbPaths.ts`, `IoTDbTrendViewer.tsx`, `SystemMonitor.tsx` → Phase C.
- historian-bff `/trend`/`/raw`/`/series` default to alarm schema + single-series/decimated → Phase C (needs multi-series endpoint).
- Full `Designer.css` raw-hex → OpenBridge-token sweep (70 hexes) → cleanup pass.
- `run-all.ps1`/`start-ams-docker-full.ps1` stale (missing `docker-compose.lab.yml`, wrong container names) → infra cleanup.
- ~~Still unauthenticated: asset-model, template-service, binding-resolver, historian-bff,
  analysis-service, audit-service~~ → **DONE 2026-07-14** (see "Platform-wide auth + RBAC" above).
- **notification-service is still unauthenticated** — deliberately: it is a Kafka worker whose only HTTP
  surface is `/health`, `/metrics` and `GET /` (a liveness string). Nothing to authorize; revisit if it
  ever grows a real API.
- **`PUT /analyses/executions/{id}/status` is now `analysis.edit`-gated.** It is the Flink→service
  callback, so if that job is ever wired up it must send `X-Service-Key` (or a token) — today nothing
  calls it, so nothing broke.
- **`Auth__ServiceKey` defaults to `traverse-internal-dev-key`** in compose. Set `TRAVERSE_SERVICE_KEY`
  to a real secret before any non-lab deployment — it grants a full-permission service principal.
- **audit-service still has no Dockerfile** and is absent from docker-compose (it now compiles, but it is
  not deployed, so its auth wiring is unverified at runtime).
- `scripts/sim/limit_watchdog.py` only runs on the **host** (it shells out to `docker exec ams-redis
  redis-cli`), but the host can't reach Kafka's advertised listener (`EXTERNAL://:9093` advertises an
  empty host). Make it read the snapshot over HTTP (historian-bff) so it can run in-network.
- `display-service` had no `.dockerignore`, so a host `dotnet build` leaked `obj/` into the image and
  broke `publish --no-restore`. Added there; the other services likely have the same latent trap.
- Personal Views (`13_personal_views_schema.sql`) remain schema-only — no entity, endpoint, or UI.

## Change log
- 2026-07-05: Roadmap kicked off; contract pinned from asset-model/binding-resolver; ROADMAP_PROGRESS created. Phase A started.
- 2026-07-05: Data pipeline built + VERIFIED end-to-end for houston+dallas. Seeded 36 assets (15_*.sql). Extended edge-node with generic `traverse.live.metrics` branch (per-record group/edge). New `scripts/sim/process_value_sim.py`. Fixed binding-resolver asset-model URL-encoding bug (was 404→fallback→wrong device id) + historian-bff multi-site `/snapshot`. Rebuilt+restarted edge-node, binding-resolver, historian-bff. mqttStore de-hardcoded to wildcard subscribe. Observed: houston tank01.level 53.66→58.97→63.48, dallas valve02.position 67.33→74.89→79.99; historian /snapshot returns all 8 devices both sites. Remaining Phase A: A1 generic slots, A2 NE107 staleness, TagPicker catalog, browser evidence.
