# Frontend Audit — `src/frontend-ob`

**Date:** 2026-08-12 · **Method:** 8 parallel code auditors (read-only) over every page +
one live latency-measurement pass against the running stack (43 containers). No code was
changed. Every claim below is cited `file:line`; the raw per-agent findings live in the
workflow journal.

**Scope covered:** all 35 page-level components — Dashboard, AlarmConsole (+3 dialogs),
LiveEvents, SOE, Historical, Analytics, IoTDB Trend, all 12 CPM/loop-performance screens,
Designer (DisplayList/Launcher/Viewer/Import/Canvas), Login, all 7 Administration tabs,
EdgeNodeMonitor — plus `apiFetch`, `authStore`, `alarmStore`, `mqttStore`, `useCpm`,
`useLoopLive`, `useBindingResolver`, the shared UX layer, `vite.config`, and the built bundle.

---

## 1. Executive summary

The codebase is **two generations in one app**:

- **The "new generation"** — the CPM/loop-performance suite and the Designer/Viewer — is
  genuinely good: OpenBridge tokens (works in all 4 themes), honest empty states, react-query
  with sensible cache keys, URL-driven state, ref-counted MQTT, 100 ms DDATA coalescing,
  incremental AG-Grid sync. Preserve these patterns; they are the target the rest should reach.
- **The "old generation"** — Dashboard, LiveEvents, SOE, Analytics, Historical, IoTDB Trend,
  Edge, and the whole Admin section — predates that standard: **398 raw-hex color literals
  across 36 files** that ignore the theme, emoji-as-icons, hand-rolled tables, raw-axios that
  breaks the session clock, and in several cases **fabricated data presented as live plant KPIs.**

**The five things to fix first** (detail in §5):

1. **No error boundary anywhere** → any render error or a stale lazy-chunk after redeploy = permanent white screen in a 24/7 control room.
2. **Two HTTP stacks with inverted session semantics** → operators acking alarms all shift get logged out as "idle"; admins editing users get logged out mid-task; background polls keep dead tabs alive forever.
3. **Fabricated data shown as real** → the Analytics page and 3 Admin tabs (Alarm Rules, Notifications, System Settings) fake success with `setTimeout` and hardcoded numbers.
4. **CPM per-loop API latency ~700–950 ms warm** (measured) — the one real performance hotspot; the list endpoint is 62 ms.
5. **Night theme is unusable on most non-CPM pages** — the raw-hex palette.

---

## 2. Measured API latency (live, via gateway, `127.0.0.1:8081`)

Cold = first call (cache miss); Warm = best of 2 repeats. All returned 200.

| Endpoint | Page | Cold | Warm | Note |
|---|---|---|---|---|
| `GET /api/v1/alarms/active` | Alarms/Dashboard | 285 ms | 59 ms | not cached (by design) |
| `GET /api/v1/alarms/active/statistics` | Dashboard KPIs | 78 ms | 39 ms | fast |
| `GET /api/v1/analytics/kpi` | Analytics | 101 ms | 71 ms | jittered to 576 ms once |
| `GET /api/v1/cpm/loops` | CPM list | 165 ms | 62 ms | fast |
| **`GET /api/v1/cpm/loops/{id}/kpis`** | **CPM loop detail** | **1150 ms** | **748 ms** | ⚠ **warm >500 ms consistently** |
| **`GET /api/v1/cpm/loops/{id}`** | CPM loop | — | **683 ms** | ⚠ 683 ms for a **418-byte** body |
| **`GET /api/v1/cpm/loops/{id}/gates/latest`** | CPM gates | — | **952 ms** | ⚠ per-request cost, never cached |
| `GET /api/hist/snapshot?assets=*` | Live bootstrap | 437 ms | 37 ms | 28 devices |
| `GET /api/hist/series` | Trend discovery | 66 ms | 56 ms | 19,701 series in 66 ms |
| **`GET /api/hist/trend` (1h, width 300)** | Trend/CPM | **2350 ms** | 96 ms | ⚠ cold = real IoTDB decimation; gateway 10 s cache masks repeats |
| `GET /api/displays` | Designer | 956 ms | 34 ms | miss→hit (30 s TTL) |
| `GET /api/assets?type=1` | Designer assets | 561 ms | 33 ms | miss→hit (60 s TTL) |
| `GET /api/audit?take=50` | Audit | 90 ms | 60 ms | not cached |
| `GET /api/auth/me` | Bootstrap | 98 ms | 58 ms | stable |

**Latency conclusions**

- **CPM `cplm-api` per-loop endpoints are the one true backend hotspot:** `/loops/{id}` 683 ms
  for 418 bytes, `/kpis` ~750 ms, `/gates/latest` 952 ms — all **warm**, while the fleet list is
  62 ms. Cost is per-request in the handler (a per-call registry/IoTDB/readiness round-trip is
  the likely cause), and **CPM is deliberately never gateway-cached**, so the UI pays it on every
  refetch and every 60 s poll. This is a `cplm-api` server-side fix, not a frontend one — but the
  frontend amplifies it with per-visit double-fetches (§4).
- **`/api/hist/trend` cold is ~2.35 s per fresh window** (real IoTDB query). The gateway's 10 s
  cache makes repeats ~96 ms, but every new time window or user pays the full query. Charts that
  re-key on every filter change (Historical, CPM Historical) feel this.
- **First-touch-after-idle** (one-time, .NET JIT + DB-pool warmup): displays 14.3 s, assets 8.6 s,
  audit 8.7 s. The first user of the day sees it; steady-state is fine. Consider a warmup ping.
- **Measurement artifact worth knowing:** on this Windows host `localhost:8081` adds a flat
  **~215 ms/request** vs `127.0.0.1:8081` (IPv6 `::1` fallback). The Vite dev proxy and any tooling
  using `localhost` inherit this — prefer `127.0.0.1` in dev configs.

---

## 3. Page inventory — API cost & necessity

`mount` = REST calls fired on first render (excludes the session-level alarm hydration paid
once at login: `alarm-feed` + `statistics` + `active` paged + optional `purge-lab-data`).

### Alarm / monitoring suite
| Page | Route | Mount | Realtime | Necessity | Note |
|---|---|---|---|---|---|
| Dashboard | `/dashboard` | 0 | SignalR + MQTT firehose | **must** | MQTT panel duplicates LiveEvents + side rail |
| Alarm Console | `/alarms` | 0 | SignalR | **must** | store-fed AG-Grid; well built |
| Historical Viewer | `/historical` | 1 | — | **must** | refetches per keystroke (no debounce) |
| Analytics | `/analytics` | 1 (+60 s poll) | store stats | **nice** | ~half the page is fabricated data |
| Live Events | `/live-events` | 1 | MQTT + SignalR SOE | **nice** | superset of Dashboard panel + side rail |
| Sequence of Events | `/soe` | 0 | SignalR | **questionable** | live-only subset of LiveEvents' SOE tab |

### Loop performance (CPM) — 12 pages
| Page | Route | Mount | Poll (steady) | Necessity |
|---|---|---|---|---|
| Overview | `/cpm` | 6 (2-deep waterfall) | ~7 req/min | **must** |
| Performance | `/cpm/performance` | 3 (parallel) | 3 req/min | **must** |
| Explorer | `/cpm/explorer` | 4 | history tab 30 s | **must** |
| Events | `/cpm/events` | 1 | 30 s | **must** |
| Calculations | `/cpm/calculations` | 5 | — | **questionable** (static catalogue + 2 KPI rows) |
| Registry | `/cpm/registry` | 1 | — | **must** |
| Historical | `/cpm/historical` | 5 | — | **nice** (fold into Investigation) |
| Windows | `/cpm/windows` | 5 (3-hop) | 20 s | **questionable** (fold into Pipeline) |
| Replay | `/cpm/replay` | 8 (2 wasted) | 60 s + 5 s while running | **must** |
| Investigation | `/cpm/investigation` | 8 (2 wasted) | 60 s | **must** |
| Pipeline | `/cpm/pipeline` | 4 | 15+20+60 s ≈ 8 req/min | **must** |
| Governance | `/cpm/governance` | 3 | audit 30 s | **questionable** (dup of admin Audit) |

*No per-loop-row N+1 anywhere in CPM — fleet endpoints are server-aggregated. Cross-page cache
reuse (`/loops`, fleet summary/rankings, gates, calculations) is genuinely good. The only write
N+1 is bulk CSV import.* **Correction:** there is **no SignalR in CPM** — replay is HTTP polling
(`useRecompute`, 5 s until finished), lifecycle clean, no leak.

### Designer / displays
| Page | Route | Mount | Necessity | Note |
|---|---|---|---|---|
| Designer home | `/designer` (DisplayList) | 5 + N thumbs | **must** | search no-debounce; thumbnail N+1 |
| Launcher | `/displays` | 1 + N thumbs | **nice** | dup of DisplayList, different favorites backend |
| Canvas editor | `/designer/:id` | 2 | **must** | keep full-viewport |
| Runtime viewer | `/display/:id` | 2 + heavy fan-out | **must** | ~120 req for a 50-symbol/20-device display (§4) |
| Import | `/designer/import` | 0 | **nice** | local parse |

### Administration + shell + infra
| Page | Route | Mount | Necessity | Note |
|---|---|---|---|---|
| User Management | `/admin/users` | 2 | **must** | the quality benchmark of the app |
| Roles & Permissions | `/admin/roles` | 3 | **must** | not in sidebar; guard mismatch; race |
| Alarm Feed | `/admin/alarm-feed` | 1 (+10 s poll) | **nice** | test button gives no feedback |
| Audit Log | `/admin/audit` | 1 (+30 s poll) | **must** | real; per-keystroke refetch |
| **Alarm Rules** | `/admin/alarm-rules` | **0** | **questionable** | **fake save** |
| **Notifications** | `/admin/notifications` | **0** | **questionable** | **fake save** |
| **System Settings** | `/admin/system` | **0** | **questionable** | **fake save** |
| Edge Node Monitor | `/edge` | 1 (+15 s poll) | **questionable** | stale hardcoded facts; dup of Pipeline |
| Login | `/login` | 0 | **must** | clean |

---

## 4. Findings — HIGH severity (fix first)

### Correctness / data-integrity bugs

**H1 — No ErrorBoundary anywhere in the app.** ✅ **FIXED 2026-08-12** (root + route boundary keyed by pathname, chunk-error wording, unhandledrejection toast). `grep ErrorBoundary|componentDidCatch|
getDerivedStateFromError` = 0 hits; no `window.onerror`/`unhandledrejection`. A failed lazy-chunk
load (routine after a redeploy invalidates hashed chunks) or any render throw unmounts the whole
tree to a **permanent white screen**. The one `ErrorScreen` is dead code — `App.tsx:132`'s error
state has no setter. *Fix:* root boundary around `<App/>` + a route-level boundary in `AppShell`
whose fallback offers Reload; add an `unhandledrejection` listener that toasts + logs.
(`App.tsx:132,189,726`)

**H2 — Two HTTP stacks invert the idle-session clock.** ✅ **FIXED 2026-08-12** (`api/http.ts` authedAxios: activity + 401 replay; hydration/polls exempted via `skipActivity`/`backgroundPoll`). Only `apiFetch` calls `markApiActivity`.
`alarmApi.ts:8`, `usersApi.ts:5`, `rolesApi.ts:6`, `AlarmFeedConfig`, `Analytics`, `HistoricalViewer`
use raw axios and mark **nothing** — so an operator whose whole shift is acking/shelving alarms, or
an admin editing users, generates zero activity and is force-logged-out as "idle" (`App.tsx:152`).
Meanwhile background pollers (`useAudit` 30 s, CPM 15–60 s, Edge 15 s) ride `apiFetch` and **mark
activity forever**, so a parked tab never idles. Same split also means the axios paths get no
401→refresh→replay. *Fix:* converge on `apiFetch`, or an axios interceptor that marks activity +
does the refresh-once; exempt `refetchInterval` polls from activity marking. (`apiFetch.ts:19`)

**H3 — `jwtExpMs` uses `atob` on a base64url JWT → proactive refresh is silently dead.** ✅ **FIXED 2026-08-12** (base64url normalize + pad; proven on real + synthetic tokens). `atob`
throws on `-`/`_`, present in virtually every real JWT, so `scheduleProactiveRefresh` never
schedules and every session limps on reactive 401-retries — which the axios paths (H2) don't have.
*Fix:* base64url-normalize before `atob`; add a unit test with a real token. (`authStore.ts:61`)

**H4 — Token rotation tears down MQTT permanently.** ✅ **FIXED 2026-08-12** (effect keyed on authStatus only; hub accessTokenFactory reads the current token). The live-services effect is keyed on
`accessToken`, so every ~1 h rotation runs `mqttStore.disconnect()` in cleanup but the re-run body
only re-inits the alarm hub — **MQTT never reconnects** until some component remounts. The Live
Events rail and any open HMI display silently freeze. *Fix:* key the effect on `authStatus` only;
read the current token inside `initialize` and the hub's `accessTokenFactory`. (`App.tsx:187`)

**H5 — Analytics presents fabricated numbers as live ISA-18.2 KPIs.** ✅ **FIXED 2026-08-12** (donut/bar consume real payload+store; '—' for unserved; MOCK_RCA_ROWS deleted). Priority donut ignores its
`data` prop and renders hardcoded 12/45/120/240; "Bad Behaviours" is hardcoded 34/89/12/156;
"Safety Latency 12 ms" / "Data Loss 0%" are literals stamped `status="pass"`; missing API fields
fall back to invented values (`chattering ?? 34` …); the RCA drill-down shows 25 `Math.random()`
rows and stamps fake `priorityMix`/`mtta: 14.2s` onto real rows. *Fix:* render `—`/empty states for
unserved metrics, delete `MOCK_RCA_ROWS`, make the donut consume the payload. (`Analytics.tsx:486,509,627`)

**H6 — Three Admin tabs fake persistence.** ✅ **FIXED 2026-08-12** (honest 'Not functional yet' banners, saves disabled, fake sample policies removed — wiring to real endpoints stays open as a feature). Alarm Rules, System Settings, Notifications each do
`await new Promise(r => setTimeout(r, 800)); setSaved(true)` with **no API call** and lose all edits
on tab switch — a green "✓ Saved" for a write that never happened. In an alarm-management product a
fake-saved flood threshold is safety-adjacent. A real `notification-service` exists and is never
called. *Fix:* wire to real endpoints or remove/stamp "Not yet functional".
(`AlarmRulesConfig.tsx:22`, `SystemSettingsConfig.tsx:23`, `NotificationsConfig.tsx:36`)

**H7 — `opcAlarmFilter` ignores its argument and hardcodes one server GUID.** ✅ **FIXED 2026-08-12** (set membership with GUID fallback when the set is empty). Alarms from any OPC
server whose ID ≠ `f0af9a6d-…` are silently dropped from console, dashboard, and stats; the whole
`syncConnectedOpcServers`/`VITE_OPC_SERVER_ID` machinery is dead code nothing consults. *Fix:*
restore the set-membership test with the GUID as fallback. (`opcAlarmFilter.ts:21`)

**H8 — Stats reset to zero on every alarm event.** ✅ **FIXED 2026-08-12** (recalc preserves prior rate/flood; threaded through all 9 call sites). `recalcStatsFromAlarms` returns
`alarmsPerTenMin: 0, floodActive: false` and is assigned wholesale on every SignalR message, wiping
the real rate/flood values from `/statistics`/`OnAnalyticsUpdate` — the Dashboard "Alarm Rate" KPI
flickers to 0.0 after each alarm. *Fix:* preserve prior rate/flood in the recalc. (`alarmStore.ts:186`)

**H9 — Historical Viewer AG-Grid is unstyled when opened directly.** ✅ **FIXED 2026-08-12** (own CSS imports + compound theme classes). Wrapper carries only
`ag-theme-openbridge` (the override needs the compound `.ag-theme-alpine.ag-theme-openbridge`) and
the file imports **none** of the three required AG-Grid CSS files — so `/historical` renders an
unstyled grid unless the AlarmConsole chunk loaded first. *Fix:* import the CSS and use both classes,
as `AlarmConsole.tsx:15` does. (`HistoricalViewer.tsx:193`)

### Performance (HIGH)

**H10 — Viewer per-symbol fan-out (N+1 × 3).** For a bound display the runtime viewer fires, per
symbol: one `GET /bindings/resolve` (25 `useBindingResolver` hooks/symbol), one
`GET /assets/by-path`, and per device one `GET /hist/snapshot?assets=<device>` — **~120 requests for
a 50-symbol/20-device display**, on top of a whole-plant `?assets=*` snapshot. **Batch endpoints
already exist** (`useBatchBindingResolver` → `/resolve/batch`, `useAssetMetadataBatch`) and the
renderer uses none of them. *Fix:* resolve all bindings/metadata once at the page level via the
batch endpoints, prime the query cache keyed `['binding',path,role]`, let per-slot hooks read it.
(`SymbolRenderer.tsx:92`, `useAssetMetadata.ts:18`, `mqttStore.ts:341`)

**H11 — Every symbol subscribes to the entire alarms Map.** `useAlarmStore(s => s.alarms)` inside
each symbol (even in design mode, even when `sourceName` is undefined) means every SignalR delta
re-renders every symbol — a 300-symbol display re-renders 300 symbols per event, and `alarmStore`
does one `set()` per hub message with **no coalescing** (unlike MQTT's 100 ms batch). `React.memo`
can't help — the subscription is inside the component. *Fix:* a per-source alarm index with equality
check + batch hub deltas like MQTT; skip the subscription for unbound non-annunciator symbols.
(`SymbolRenderer.tsx:109`, `alarmStore.ts:377`)

**H12 — ag-grid + mqtt ship in the entry bundle to everyone.** `dist/index.html` module-preloads
`vendor-aggrid` (1.25 MB) and `vendor-mqtt` (482 KB), so **every first paint including `/login`**
downloads ~2 MB JS (+713 KB CSS) before interactive. ag-grid is used only by two lazy routes; the
object-form `manualChunks` hoisted it into the entry graph. (Designer weight is fine — `catalogRenderer`
1.6 MB / `automationRenderer` 668 KB load only via dynamic import, so alarm-only operators don't
download designer code.) *Fix:* function-form `manualChunks` that only groups modules actually in the
dynamic graph; lazy-init `mqttStore` via dynamic import inside `connect()`. (`vite.config.ts:40`)

---

## 5. Findings — MEDIUM (grouped by theme)

**Error-as-empty-state (a whole class).** Fetch errors render as "nothing here" across most non-CPM
pages and 4 of 6 CPM pages: CpmOverview shows "No monitored loops — onboard in Registry" on a
rankings **error** (sends operators to re-onboard during an outage, `CpmOverview.tsx:83`); CpmPerformance,
CpmHistorical, CpmWindows, CpmReplay, CpmInvestigation all show "No data" on error
(`CpmHistorical.tsx:217`); HistoricalViewer shows "No alarms found" on API-down and never shows a
loading overlay (`HistoricalViewer.tsx:197`); ShareDialog/PersonalViewsDialog/VersionHistoryDialog
show their empty copy on error (`ShareDialog.tsx:84`); FolderTree has no loading/error state
(`FolderTree.tsx:41`). `CpmGovernance`, `CpmEvents`, `LoopRegistry`, `UserManagement` do it right —
copy their `isError` branch everywhere.

**Untyped API errors leak internals.** `apiJson` throws `Error("GET /api/... → 500")` — method + raw
URL + status, discarding the server's problem-detail body — and pages render it via `String(error)`
to operators (`CpmEvents.tsx:99`, `LoopRegistry.tsx:104`). Worse, `CpmGovernance` detects 403 by
**substring-matching "403" in that string** (`CpmGovernance.tsx:57`), which breaks the moment a URL
contains "403". *Fix:* a typed `ApiError { status, message }` that parses the JSON body; pages branch
on `err.status`, not string content. (`apiFetch.ts:33`)

**Raw-hex theme (398 occurrences, 36 files).** Dashboard, LiveEvents, SOE, Analytics, Historical,
IoTDB Trend, Edge, and the whole Admin section inline a light-only `const T = {…hex…}` palette applied
via inline style (beats every stylesheet), so they render white-on-light in night mode. Plus emoji as
icons and a hardcoded `<ToastContainer theme="dark">`. The shell and DisplayList already converted the
same palette to tokens ("Real tokens now"). *Fix:* one shared token module; delete the per-file clones.
CPM proves the token pipeline works in all four themes. (`Dashboard.tsx:11`, +35 files)

**ECharts colors go stale on theme switch (CPM).** Tokens are resolved to literals inside a `useMemo`
keyed only on chart data, so flipping day↔night leaves every CPM chart in the old theme's colors until
the next refetch. *Fix:* add the active theme to the memo deps. (`CpmOverview.tsx:260` + 5 CPM charts)

**Waterfalls & wasted fetches (CPM).** Replay and Investigation each fire **8 requests on mount, 2
wasted**: a fleet-wide `/events` before `loopId` resolves (`useCpm.ts:81` has no `enabled` gate), and a
default-range `/trend` or `/kpis` that's discarded when the real window bounds arrive
(`CpmInvestigation.tsx:131`, `CpmReplay.tsx:87`). Overview/Explorer/Calculations are 2-deep waterfalls
because the selected loop defaults to `loops[0]` — when `?loop=` is in the URL the dependent calls
*could* start at t0 but don't. *Fix:* `enabled` gates on `loopId`/window; start dependent queries from
the URL param.

**Idle/rotation session issues beyond H2/H3** — see also: SignalR connection kept alive after logout
if logout races the initial connect (`alarmStore.ts:495`); `mqttStore.connect()` guards only
`connected` not `connecting`, so two mounts during the WS handshake create a second orphaned client
(`mqttStore.ts:241`); hub `accessTokenFactory` captures a stale token (`alarmStore.ts:357`).

**Per-message O(n) stats storm.** Every SignalR alarm triggers a full recompute over the entire alarms
Map with ~9 filter passes, no coalescing — a CPU/render storm exactly during a flood (`alarmStore.ts:377`).
`useLoopLive` and EdgeNodeMonitor subscribe to the whole metrics Map, re-rendering on every 100 ms
flush (`useLoopLive.ts:44`, `EdgeNodeMonitor.tsx:77` also has a dead `prevMetricSize` state).

**Alarm audio likely silent.** `AudioContext` is built at module load → browsers start it `suspended`;
`playAlarmSound` never calls `resume()`, and it runs inside an immer `set()` producer. For ISA-18.2
audible annunciation this must be deterministic. *Fix:* lazily create/resume on first user gesture,
hoist the call out of the producer. (`alarmStore.ts:647`)

**Undebounced search re-fetches (3 places).** Historical Source/Tag (`HistoricalViewer.tsx:159` — ~9
sequential 500-row queries typing "Unit1.FIC"), DisplayList search (`DisplayList.tsx:165`), Audit user
filter (`AuditExplorer.tsx:30`). `useDebounce` exists and is used correctly elsewhere. Historical also
never resets `page` on filter change → false "No alarms found" from page 3 (`HistoricalViewer.tsx:59`),
and its "Run Query" button is a no-op since queries already auto-run.

**RBAC / nav mismatches.** "Audit Log" nav shows to `admin.audit.view` but `/admin/*` guard demands
`admin.users.edit` → auditors bounced to `/displays` (`App.tsx:332` vs `621`); `rbac.manage`-only users
can never reach the Roles tab (also absent from the sidebar). Bare `/admin` renders an empty pane (no
index route). Sidebar double-highlights every `/cpm/*` page (prefix match keeps `/cpm` active). Deep-link
redirect after login drops the query string (`?loop=…` lost). Theme choice isn't persisted (reverts to
`day` every reload — hostile to night shift).

**Fake/misleading affordances.** Analytics "Export ISA-18.2 Report" button has no `onClick`
(`Analytics.tsx:127`); Alarm Feed "Test GET" gives zero feedback + leaks an unhandled rejection on
failure (`AlarmFeedConfig.tsx:60`); AlarmConsole "Refresh (F5)" only repaints cells, never re-fetches
(`AlarmConsole.tsx:713`); context-menu "Unshelve/Unsuppress/Return to Service" don't exist as APIs —
operators **cannot reverse a shelve/suppress from the UI at all** (`AlarmContextMenu.tsx:71`); Audit rows
show a green "Hash verified" dot that never verified (`AuditExplorer.tsx:167`).

**Forms & inputs.** Shelve/suppress/OOS confirm handlers swallow API errors → dialog closes as if it
worked, the inline error UI is dead code (`AlarmConsole.tsx:199`); batch shelve is an N+1 that reports
whole-command failure on partial success (`AlarmConsole.tsx:194`); CpmEvents note input isn't keyed by
event id → a note typed for one event submits with another's ack (`CpmEvents.tsx:130`); LoopRegistry CSV
parse splits on commas with no quoting → a description with a comma shifts every column
(`LoopRegistry.tsx:443`); bulk import is 100–200 serial POSTs with a per-row list refetch and no progress
(`LoopRegistry.tsx:484`); User Management has no pagination past 100 and no password-reset
(`UserManagementConfig.tsx:73,55`); Roles has a switch race + silent discard of unsaved edits + `window.prompt`
delete (`RolesConfig.tsx:58,46,131`).

**Designer.** Revert can leave discarded edits on canvas when the server draft already equals published
(`DisplayDesigner.tsx:209`); Ctrl+S saves even when nothing changed → version-history churn
(`DisplayDesigner.tsx:561`); the keydown effect re-registers every render (incl. every drag frame) because
`saveMutation` is in its deps (`DisplayDesigner.tsx:573`); Import leaves an orphan display if the content
PUT fails after create (`ImportPage.tsx:96`); favorites implemented twice (server vs localStorage) so a
star in Designer doesn't show in Launcher (`DisplayLauncher.tsx:48`); thumbnail N+1 (one GET/card, up to
200) (`DisplayList.tsx:756`).

**Accessibility.** No CPM drawer/modal (gate evidence, focus-loop, calc, wizard, bulk import) has focus
trap, autofocus, or Escape-to-close (`GateEvidenceDrawer.tsx:44` + 4 more); shared `Modal` has no focus
trap and doesn't restore focus on close (`Modal.tsx:46`); icon-only buttons lack aria labels.

**Security (lower-frequency).** SOE d3 tooltip interpolates plant/OPC event text into `innerHTML`
unescaped → stored-XSS via the alarm pipeline (`SoePanel.tsx:168`); Historical NDJSON export puts the
bearer token in the URL query string of `window.open` → leaks into history/proxy logs
(`HistoricalViewer.tsx:99`); the MQTT token rides the WS URL query (documented tradeoff — worth a
server-side log-scrub check).

---

## 6. LOW severity (batch cleanup)

d3/render churn on SOE (full rebuild per event, resets zoom — `SoePanel.tsx:52`); index-keyed SOE rows
force remount per event (`LiveEventsPage.tsx:251`); `window.__designer` exposed in prod
(`DisplayDesigner.tsx:625`); `encodeURI` vs per-segment encode (`useAssetMetadata.ts:19`); faceplate popup
boots a whole SPA in an iframe (`DisplayViewer.tsx:539`); viewer theme switcher offers only 2 of 4 themes
(`DisplayViewer.tsx:394`); stale hardcoded infra facts + LAN-IP placeholder in Edge/AlarmFeed
(`EdgeNodeMonitor.tsx:172`, `AlarmFeedConfig.tsx:155`); `me/recent` has no writer so the ribbon is always
empty (`DisplayList.tsx:188`); double-firing context-menu handlers (`AlarmContextMenu.tsx:134`); AbortSignal
not threaded through CPM/asset/audit queries (`cpmApi.ts:150`); `liveSeries`/`metrics` map keys never
evicted → slow memory growth over a long session (`mqttStore.ts:197`); duplicate `?assets=*` snapshot on
first connect (`mqttStore.ts:279`); `google fonts` pulled from the network — dead on an air-gapped plant.
Full list with `file:line` in the agent journal.

---

## 7. Page consolidation proposal

The user asked which pages are must / unnecessary and what can be grouped. The sidebar has ~25 entries
for an admin; two groups break the IA.

**Live-alarm surfaces (3 → keep 2).** Dashboard's MQTT panel, LiveEvents' MQTT tab, and the always-mounted
side rail all render the same `mqttStore` map with three different row components. **Fold `/soe` into
`/live-events` as a third tab** (it's a live-only subset + a d3 timeline; LiveEvents already links to it),
drop the Dashboard MQTT panel to a link, keep the side rail as the ambient view.

**Loop Performance (12 → 8–9).** This group is **half the entire sidebar as 12 flat entries.** Nest them
under one collapsible "Loop Performance" section with an in-page tab bar (they already share the `/cpm/*`
prefix and the `analytics.view` permission — exactly the Administration hub pattern). Merges:
`/cpm/calculations` → Explorer's Calculations tab (its catalogue is a static in-file array);
`/cpm/historical` → Investigation as a timeline tab (duplicate window browser + evidence chart);
`/cpm/windows` → `/cpm/pipeline` (both are commissioning-engineer runtime internals);
`/cpm/governance` provenance → `/cpm/calculations`, and point its audit view at the admin Audit page.
Consider fusing Replay + Investigation into one tabbed "Diagnose" workspace (shared note widget, shared
chart, mutual links).

**Administration (double-navigated).** 6 sidebar entries duplicate the hub's own 7-tab bar. **Keep one
"Administration" sidebar entry**, let the hub tabs do the rest (also fixes the invisible Roles tab). Add an
index redirect for bare `/admin`.

**System health (3 scattered → 1).** EdgeNodeMonitor (`/edge`), the Alarm Feed status tab, and
`/cpm/pipeline` all answer "is the plumbing up?" in different silos. A single **"System Health"** page
(gateway upstreams + BFF/IoTDB/MQTT/alarm-feed status) would replace three surfaces and let Edge's stale
hardcoded facts die.

**Diagnostics.** IoTDB Trend (`/iotdb-trend`) and its "run `live_events_feed.py`" empty state are a dev/E2E
tool sitting in the primary Historical nav — move under an engineer-gated diagnostics section.

**Designer home vs Launcher.** `/designer` (DisplayList) and `/displays` (Launcher) hit the same list
endpoint, share the thumbnail component, and duplicate favorites with two different backends — merge into
one page with a role-conditional card action.

---

## 8. Design / UX improvement opportunities

- **Migrate the "old generation" pages onto the CPM token layer** (`styles/cpm.css` + OpenBridge tokens).
  Single highest-leverage design fix — restores night theme app-wide and kills the 398 raw-hex clones.
- **Swap emoji for `obi-*` icons** everywhere (alarm toolbar inline SVG magnifier, Dashboard KPIs, admin
  tabs, display categories, share button, `AlarmStateIcon`, `Modal` close ✕).
- **Route alarm/flood feedback through OpenBridge alert components** (`ObcAlertFrame`/alert tokens with
  blink-until-ack) instead of the hand-rolled `FloodAlertBanner` and `react-toastify` (which is hardcoded
  `theme="dark"`); keep toastify only for mundane CRUD confirmations, themed from `useTheme()`.
- **Dashboard upgrades (zero new endpoints):** feed MTTA from `/analytics/kpi` (share the react-query key);
  make KPI cards drill into `/alarms` with the matching filter preset; add a 24-bucket alarm-rate sparkline
  with the ISA target line from the `hourlyRates` the Analytics page already fetches; rebuild Priority
  Distribution on the OpenBridge donut so it themes correctly; drive the "Updated" stamp from
  `alarmStore.lastUpdated` instead of a render-time clock.
- **CPM Overview upgrades (zero new endpoints):** add a good-error%/MAE micro-bar to priority-queue rows
  from the rankings payload already in hand; collapse the static "how this works" window rows behind a
  disclosure; derive the PV pill tone from `qualityLabel(live.quality)` so a bad-quality PV reads bad.
- **Replace `window.prompt`/`confirm`** (Designer rename/duplicate/delete/save-as-view, folder ops, Roles
  delete, Notifications delete) with the shared `Modal`/`FormField` already imported on those pages.
- **Add a real error page** (H1) with a Reload action — the answer to "do we have error pages or just
  throw?" is currently *just throw*.

---

## 9. What's demonstrably clean (preserve these)

`apiFetch` single-flight 401 replay; `authStore` single-flight refresh; `alarmStore` hydration-overlap
guard + hub-init single-flight; the 30 s fallback poll (guarded, only while hub down); AG-Grid incremental
transaction sync with diffing + debounced quick filter + hydrated-aware empty states; `mqttStore` 100 ms
DDATA coalescing + ref-counted screen/firehose subscriptions + snapshot-on-open + token refresh on
reconnect; react-query defaults (`staleTime 30s`, `refetchOnWindowFocus:false` → no tab-switch storm);
CPM cross-page cache reuse; the viewer's keep-last-good-content-with-stale-banner (never blanks a kiosk);
version-diff parallel fetch; Designer undo-seed guard + double-layer unsaved-work protection + rAF-coalesced
drag; zero hand-written `<obc-*>` tags, zero second UI/icon library, per-path imports; `shared.tsx`
timezone-labelled formatter; Login, SessionTimeoutDialog, PriorityBadge, CommandPalette (lazy,
permission-gated). CPM `useCpm` is a model hook layer — its only sins are the wasted-fetch gates above.

---

## 10. Suggested fix sequencing (when we start — not done here)

1. **Safety/integrity first:** H1 error boundary, H5+H6 fabricated data (wire or remove), H7 alarm filter,
   the shelve/suppress error-swallowing, the missing unshelve/unsuppress APIs.
2. **Session correctness:** H2+H3+H4 (converge HTTP stacks, fix `atob`, key the effect on `authStatus`) —
   one coordinated change; add regression tests.
3. **Error-as-empty-state class + typed `ApiError`** — one shared change, then apply the `isError` branch
   across CPM + dialogs + Historical.
4. **Perf:** H10 viewer batch resolves, H11 alarm-index + hub coalescing, H12 bundle split; the CPM
   wasted-fetch `enabled` gates; the `cplm-api` per-loop latency is a **backend** ticket (700–950 ms warm).
5. **Theme migration** (398 raw-hex → tokens) + emoji→`obi-*` — mechanical, high visible payoff.
6. **IA / consolidation** (§7) — nest Loop Performance, single Admin entry, merge System Health, fold SOE.
7. **LOW batch** (§6) + accessibility (focus traps, Escape, aria).

Nothing above was changed in code — this document is the analysis deliverable; implementation is a
separate, sequenced effort.
