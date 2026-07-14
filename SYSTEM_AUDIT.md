# SYSTEM_AUDIT.md — pre-F–I audit of the HMI Designer

**Audited:** 2026-07-08, by reading the current code (not from prior-session memory).
**Environment now:** full Docker stack up (~22 containers). **New since the A–E work:** a
`traverse-auth-service` (Node/Express, RS256 JWT + RBAC) + a login gate — `/designer/*` is behind
`RequireAuth`; `/login` and `/display/:id` are outside it. My process-value simulator container
`ams-sim` is **exited** (needs restart before any live-data gate). Dev login: `admin` / `Admin123!`.

Legend: ✅ implemented · 🟡 partial · 🟠 dead/orphaned code · ❌ absent.

---

## 1. Alarm handling

**`alarmStore` is real and rich; canvas symbols are NOT wired to it; no client-side limit→alarm exists.**

- **Store** `src/frontend-ob/src/store/alarmStore.ts`: `alarms: Map<string, ActiveAlarm>` keyed by alarm **id** (state `:126-140`); `ActiveAlarm` (`:12-53`) carries `sourceName` (the tag/source), `severity`, `priority`, `state`, `acknowledged`, **`isShelved`**, **`isSuppressed`**, `isOutOfService`, `processValue`, ack-lifecycle. Plus `stats` (counts). **No per-tag index** — you filter `alarms.values()` by `sourceName` (as `AlarmConsole.tsx:85-90` does).
- **Population is server-side only:** SignalR hub `/hubs/alarms` (`initialize()` `:338`, handlers `OnNewAlarm/OnAlarmUpdated/OnAlarmCleared/…`) + REST snapshot `GET /api/v1/alarms/active` (`api/alarmApi.ts:41`). Commands exist: `acknowledge/batch`, `/{id}/shelve`, **`/{id}/suppress`** (`alarmApi.ts:75,89,101`). **There is no client-side "limit breach → ActiveAlarm"** — `alarmLimits` on symbols only drive *visual* color, never create an alarm.
- **Auth-gated:** the hub is only `initialize`d when `authStatus==='authenticated'` (`App.tsx:99-121`). **The standalone viewer `/display/:id` does NOT init the alarm hub** (it's outside the shell; only MQTT connects).
- **Canvas alarm/dynamic symbols today** (none read `alarmStore`):

| Symbol | file:line | Current source |
|---|---|---|
| `alarm.banner` | `SymbolRenderer.tsx:600-608` | 🟡 hardcoded `'High Temperature - Tank T-101'`; class toggles on `statusState` from a `status` binding |
| `alarm.summary` | `CustomSymbols.tsx:300-314` | 🟡 hardcoded counts `2/5/3` |
| `alarm.beacon` / `alarm.horn` | `CustomSymbols.tsx:266-298` | 🟡 bound to a live `status` MQTT slot (not alarmStore) |
| `ind.multistate` (NAMUR) | `CustomSymbols.tsx:69-90` | 🟡 `getNamurState(statusValue ?? liveValue)`, visual only |

- **Model gaps:** `CanvasItem` (`types.ts:8-31`) has **no `rules[]`, no `multiStateConfigs`** — only `alarmLimits` (`:16,52-58`). `MultiStateSymbol.tsx` exists but is **🟠 dead code** (zero imports). No data-driven blink/visibility logic anywhere (blink is preview-only SVG `<animate>`).
- **Reuse pattern** for wiring a symbol to alarms: `useAlarmStore(s => s.alarms)` + filter by `sourceName` (helpers in `utils/opcAlarmFilter.ts`); `useAlarmStore(s => s.stats)` for a summary. Store is a singleton; `App.tsx` already manages init/teardown.

**→ Phase F consequences:** to prove "actual alarmStore state" I must (a) get a **real** alarm into the store for a symbol's `sourceName` — via the existing alarm pipeline, not a mock — and (b) make the surface that shows it (viewer and/or designer preview) actually connect the alarm hub. See "Decisions" §6.

---

## 2. Editor interaction model

**Foundation is sound but selection is single-only, and undo does not capture edits.**

| Capability | Status | Ref |
|---|---|---|
| Selection (single) | ✅ | `DisplayDesigner.tsx:80` `selectedId` |
| Marquee / multi-select | 🟠 dead code | `DesignerCanvas.tsx:47` (`useState` no setter), `:304` |
| Undo/redo history | 🟡 add/delete/duplicate only | `pushHistory` `:123-130`; **`updateItem` does NOT snapshot** `:170-176` |
| Move / resize | ✅ via `onUpdateItem` | `DesignerCanvas.tsx:121-196`; **no history at drag-end** |
| Duplicate | ✅ Ctrl+D | `DisplayDesigner.tsx:186-204` |
| Copy / paste | ❌ | no clipboard / Ctrl+C-V |
| Zoom | 🟡 buttons only | `:291-296`; no wheel-zoom |
| Pan | ❌ | none |
| Group / ungroup | ❌ (no model field) | `types.ts` has no `groupId`/`Group` |
| Align / distribute | ❌ | — |
| Z-order | 🟡 numeric field only | `PropertyInspector.tsx:260-268` |
| Rotate / flip | 🟡 rotate numeric; flip ❌ | `PropertyInspector.tsx:246-259` |
| Guides / rulers / context-menu / layers | ❌ | grid dots only |
| Lock / hide | 🟡 lock only | `types.ts:19`, enforced in drag/resize/keys |
| Canvas size | ❌ hardcoded 1920×1080 | `DisplayDesigner.tsx:114`; `DisplaySettings` type exists, unused |

- **Undo bug:** `updateItem` (`:170-176`) mutates without `pushHistory`, so every move/resize/property edit is invisible to undo; undo jumps across add/delete boundaries dropping intermediate edits. **History index desync**: `slice(-50)` on the array vs `Math.min(prev+1,49)` on the index (`:127-129`) can point at the wrong snapshot once the buffer slides.
- **Keyboard:** two handlers — `DisplayDesigner.tsx:207-234` (Ctrl+S/Z/Shift-Z/Y/D), `DesignerCanvas.tsx:50-89` (Delete, arrow-nudge, Esc; respects `locked`).

**→ Phase G:** *extend* (history for `updateItem` via drag-end/edit commit + fix the index bug; wheel/pan on existing zoom math; z-order/rotate/canvas-size use existing model). *Build fresh* (real `selectedIds` multi-select + marquee; clipboard; `groupId`/`Group` model + group/ungroup; align/distribute; layers; guides; context menu; flip; hidden flag).

---

## 3. Visual / theming system

**Mostly token-based, but every *semantic industrial color* falls back to raw Tailwind-ish hex, split across ≥5 sources.** This determines how disruptive Phase H is: the structure is close to OpenBridge's model, so H is mostly a *color-token unification + emoji→OB-icon + panel-restructure* effort, not a rebuild.

- **`Designer.css`** (2374 lines): ~282 `var(--token)` vs ~95 hex lines (most are `var(--token,#fallback)`). **Raw (untokenized) semantic-color hotspots:** alarm-limit focus `:877-878`; digital faceplate `:1269-1280,:1366`; bar-graph alarm zones `:1330-1333`; NAMUR lights `:1392-1394`; equipment running fill `:1445,:1455`. **No `[data-obc-theme]`/day/bright override block** — theme relies entirely on OpenBridge token values shifting.
- **`openBridgeTheme.ts` `OBC`** (`:5-33`): the *correct* pattern — `var(--alert-alarm-color, #e10019)` etc. with **real OpenBridge palette fallbacks**; owns semantic logic (`getNamurState`, `getValueColor`, `isStale`). **This is the natural single source of truth.**
- **Color sources to unify (Phase H):** (1) `OBC` [correct], (2) `MultiStateSymbol.tsx` `NAMUR_COLORS` `:22-59` [raw-hex duplicate of NAMUR], (3) `Designer.css` raw hex [3rd status source], (4) `TrendChart.tsx` `PEN_COLORS` `:27` [separate pen palette], (5) `App.tsx` `TB` `:48-56` [shell], (6) `PropertyInspector` swatches `:26-27`. **Alarm colors (OBC) and trend colors (PEN_COLORS) are entirely separate** — exactly the split Gate H ("one token feeds both") targets.
- **App shell** (`App.tsx`): custom hand-rolled (NOT `ObcTopBar`) — `.app-topbar` brand + `.app-sidebar` grouped nav + `.app-main` + toggleable `.app-events`. Emoji nav icons (`:429-449`). `data-obc-theme` set only at `:90`; **only `day`/`bright` themes exposed** (`:40,:313`) — night/dusk not surfaced. App-level styles: `styles/app.css`, `styles/hmi-dialogs.css`.
- **Designer layout** (`DisplayDesigner.tsx`): ad-hoc flex — `header` toolbar + `.display-designer__body` (`SymbolPalette` aside / `DesignerCanvas` main / `AssetBrowser`↔`PropertyInspector` aside) + footer. **Loosely mirrors** OpenBridge's shell→context-panel→canvas→properties model but hand-built with local classes + emoji toolbar (`✏️▶️↩️💾`).
- **Icons:** OpenBridge `Obc*Icon` used *inside symbol renderers* (`SymbolRenderer.tsx:21`, `renderers/*`); **emoji everywhere for chrome** (palette, toolbar, sidebar); one emoji-in-SVG (`SymbolRenderer.tsx:642`). Inconsistent, not theme-aware.

**→ Phase H:** promote `openBridgeTheme.ts` to the single token source; derive `NAMUR_COLORS`, `Designer.css` semantic colors, and `PEN_COLORS` from it; add real `day/bright/night(high-contrast)` token sets driven by `data-obc-theme`; replace emoji chrome with OB icons; restructure the shell/panels to the explicit OpenBridge structural model + wire the persistent asset/context panel to Phase D's breadcrumb.

---

## 4. PI Vision import

**Confirmed present and liftable; frontend-ob's `CanvasItem` is *leaner* than the importer's legacy target.**

- **Files (canonical, single copies, no stale dupes):**
  - `…/release/industrial-vis-frontend/src/services/ScreenImportService.ts` — **688 lines**.
  - `…/release/industrial-vis-frontend/src/utils/AFParser.ts` — **267 lines** (note: `utils/`, not `services/`; `remaining.md:163` is wrong on this).
  - Sample `…/xmlgraphics-batik-main/xmlgraphics-batik-main/301-Kiln.zip` — 29,720 bytes.
- **`.pdix` = ZIP** with `display_json`(+`metadata_json`+`Content/`). Entry `importFromPdix()` `:17`; mapping `mapPdixType()` `typeMap` **`:539-550`** → `shape.*`/`ind.*`/`chart.*`/`media.image`; `image`→`media.image` `:239`; `graphic`→`SYMBOL_REGISTRY` `:245-250,:510-534`.
- **Preserves:** position/size/rotation, groups + composed matrices, flip, fill/stroke/dash/corner, text+align+font, value (1st binding), line/polygon/ellipse geometry, embedded images, external SVG graphics, raw-SVG replay. **Drops:** multi-state configs (`multiStateConfigs:[]` `:338`), conditional rules (`rules:[]` `:337`), trend pens/axes, tables/event-frames (`return null` `:231-233`), navigation links, secondary bindings (only `DataSources[0]` `:289-293`).
- **Liftability:** framework-free (no React/store/network). 3 entanglement points to swap on lift: type imports `:2`, `SYMBOL_REGISTRY` `:4/:510-534`, `SymbolLibraryHydrator` `:21`. `AFParser.ts` = **DOMParser-only, zero imports — drop-in liftable.**
- **Target-shape reality:** frontend-ob `CanvasItem` (`types.ts:8-31`) has `navigationLink` (object form, `:30-39`) but **lacks `rules`, `multiStateConfigs`, `pens`, `rawSvg`, and `groupId`/`Group`**. The legacy target type has all of them. So "fill dropped fields" requires **first adding those fields to frontend-ob's `types.ts`** — which Phases F (rules/multiState) and G (grouping) do anyway. Also adapt: move `rotation`/`zIndex` out of `style`, rename `cornerRadius`→`borderRadius`, convert `points` string→`ShapeProps.points[]`.
- `remaining.md` Part 4 (`:158-170`) documents this reuse plan and matches these findings.

---

## 5. Cross-phase dependency chain (this reorders nothing, but the phases feed each other)

- **F adds** `rules[]` + `multiStateConfig` to `CanvasItem` and a rules/multistate **engine** → **I fills** those from the importer (no longer dropped).
- **G adds** `groupId`/`Group` model → **I fills** imported groups; G's multi-select is also how you'd manage imported symbols.
- **H unifies** color onto `openBridgeTheme` tokens → **F**'s alarm colors and **C**'s trend pens both derive from one source (Gate H), and **I**'s imported displays inherit the design system (Gate I).
- Practical ordering note: doing F→G→H→I as written is fine; H should run **after** F/G so it restyles the widgets they add (as the user specified).

## 6. Decisions to resolve before implementing (surfaced, not assumed)

1. **Gate F "force a limit breach on a live tag → alarmStore":** alarms are server-produced; my sim tags don't generate alarms. Options: **(A, recommended)** a small **limit-watchdog** (Python, mirrors the sim) that reads live values, and when a tag crosses its limit publishes a real alarm event to the alarm pipeline (`raw-alarms` → Flink → SignalR → `alarmStore`); suppress via the real `POST /suppress`. This makes "limit breach on a live tag" genuinely produce the alarm — no mock. **(B)** just inject a canned alarm via the feeder (less faithful to "breach"). I recommend A.
2. **Where Gate F is proven:** the standalone viewer doesn't connect the alarm hub. Either **wire the alarm hub into the viewer** (needs an auth token in the kiosk) or **prove Gate F in the authenticated designer preview** (hub already live there). Recommend: wire a shared alarm-provider so the viewer connects when a session exists, and prove in the viewer; fall back to designer preview if kiosk-auth is out of scope.
3. **Gate F rules-engine vs alarmStore:** item 2 (rules engine) is *value-threshold* driven (client) and item 1 (alarm widgets) is *alarmStore* driven. Both will exist; the gate's red+blink+hide is proven via the **alarmStore** path (item 1). Confirm that reading.
4. **Auth for automated evidence:** Playwright must log in (`admin`/`Admin123!`) to reach the designer for Gates F/G; viewer gates (H visuals, I render) can stay unauthenticated unless they need live alarms.

---
---

# APPENDIX — pre-J–L audit (trend reuse · auth/RBAC · publish · design tokens)

**Audited:** 2026-07-13, by reading the current code. **This appendix corrects three assumptions in the
J–L brief.** Environment note: the AMS stack is currently **DOWN** (`docker compose ps` in `infra/docker`
returns nothing; the only running containers belong to unrelated projects) — it must be brought back up
before any gate evidence can be produced.

Legend as before: ✅ implemented · 🟡 partial · 🟠 dead/orphaned · ❌ absent.

## 7. Trend components — what Phase C actually produced (for Phase J reuse)

**One component: `Designer/TrendChart.tsx` (221 lines, echarts).** There is no separate trend page,
dialog, or trend "session" concept anywhere. Everything Gate J needs *as charting* already exists inside
this one file — but it is **coupled to a `CanvasItem`**, which is the single thing blocking reuse.

| Gate-J requirement | Exists in Phase C? | Where |
|---|---|---|
| Multi-pen | ✅ — pens = **every binding slot whose value looks like a UNS path** | `TrendChart.tsx:57-80` |
| Historical (IoTDB) | ✅ per-pen `fetchTrend(iotSeries, start, end, 300, measurement)` | `:98-119` |
| Live (MQTT ring-buffer) | ✅ `getLiveSeries(liveKey, windowStart)`, appended after the last hist point | `:134-150` |
| **Live↔historical toggle** | ✅ `live` + `playing` + `endTs` state; `Live` button re-arms, `◀ / ▶▶` step off-live | `:82-85`, `:186-212` |
| Time-bar (range presets) | ✅ 5m / 15m / 1h / 6h | `RANGES :41-46`, bar `:194-213` |
| Cursor value-at-time | ✅ echarts `tooltip.trigger:'axis'` + `axisPointer.type:'cross'` (reads all pens at the cursor) | `:156-160` |
| Zoom / pan | ✅ `dataZoom` inside + slider | `:170-173` |
| Legend / autoscale | ✅ | `:155`, `yAxis.scale:true :166` |
| Design tokens (Phase H) | ✅ pens resolved from `--ams-pen-1..6` via `resolveColor()`; chrome from `--ams-text-dim`/`--ams-border`/`--ams-grid-line` | `:30-40`, `:128-132` |

**The two blockers for Phase J (both structural, not charting):**
1. **Props are `{ item: CanvasItem; mode: 'design'|'preview' }`** (`:13-16`). Pens are derived from
   `item.bindings` (`:57-62`). A dialog/page has **no CanvasItem** — it has a list of tags. So Phase J must
   **extract the body into a pens-driven core** (`TrendCore({ pens: {path,label}[] })`) and reduce
   `TrendChart` to a thin adapter that maps `item.bindings → pens`. That is a *lift*, not a rewrite — zero
   charting logic changes.
2. **It only renders interactively when `mode === 'preview'`** (`:177-184`); in `design` mode it returns a
   static "📈 Trend" placeholder. The core must be unconditionally interactive.

Other trend code that is **not** the Phase C component (do not reuse): `IoTDbTrendViewer.tsx` /
`SystemMonitor.tsx` still hold hardcoded IoTDB path literals (already logged as deferred in
ROADMAP_PROGRESS "Deferred items"). Known Phase-C deferral that Phase J inherits: **single shared Y-axis**
(no per-pen axis) — with 3 mixed-type tags (level % / speed RPM / press PSI) the ranges differ by ~10×, so
one autoscaled axis will squash pens. **Flagged for the Gate-J decision** (see §11).

## 8. Auth / RBAC — the REAL picture (corrects the brief)

### 8a. The role set — ✅ the brief is CORRECT
`Admin` / `Engineer` / `Operator` / `Viewer` **do exist**, exactly those literals:
`src/services/auth-service/database/schema.sql:86-91` (seeded `roles` table) and
`src/services/auth-service/src/utils/roles.ts:6` (`APP_ROLES`). `users.role` is a plain
`VARCHAR(50) DEFAULT 'Viewer'` (`schema.sql:55`) — **no CHECK/FK**, so any string can be stored.

### 8b. The token — ✅ real RS256, two authorization claims
`src/services/auth-service` (Node/Express + Postgres `traverse_auth`). Signs RS256 with a persisted
keypair (`auth.service.ts:60-66`; key at `JWT_PRIVATE_KEY_PATH=/app/keys/jwt-private.pem`, volume
`auth-keys`), `iss=traverse-auth`, `aud=ams-services`, access 15m / refresh 7d (`:36-40`), JWKS at
`GET /api/auth/.well-known/jwks.json` (`auth.routes.ts:25`). Claims:
- **`role`** — single string (`auth.service.ts:56`).
- **`permission`** — string **array**, resolved from the role at login (`:57`, `:130`).

### 8c. ⚠️ The permission vocabulary is ALARM-ONLY — there is no display/designer permission
The 11 seeded permission keys (`schema.sql:96-108`) are: `alarm.view`, `alarm.acknowledge`,
`alarm.acknowledge_batch`, `alarm.shelve`, `alarm.unshelve`, `alarm.suppress`, `alarm.export`, `soe.view`,
`analytics.view`, `admin.users.edit`, `admin.audit.view`.
**Nothing named `display.*`, `designer.*`, or `publish` exists.** Role→permission map (`schema.sql:113-137`):
Admin = all 11 · Engineer = all `alarm.*` + `soe.view` + `analytics.view` · Operator = view/ack/ack-batch/
shelve/unshelve + `soe.view` · Viewer = `alarm.view`, `soe.view`, `analytics.view`.
**→ Phase K consequence:** Designer/publish authorization has **no existing key to hang off**. K must add
`display.view` / `display.edit` / `display.publish` to `permissions` + `role_permissions` (a new
`database/` seed / auth-service migration), *or* gate on the coarse `role` claim. See §11 decision 2.

### 8d. Enforcement points that exist TODAY
| Layer | Reality |
|---|---|
| Frontend `RequireAuth` | ✅ authentication only — `App.tsx:491-500` redirects to `/login` unless authenticated; wraps the shell (`:165-193`). |
| Frontend permission checks | 🟡 **nav-hiding only** — `/admin/users` nav item is filtered by `permission:'admin.users.edit'` (`App.tsx:446`, `:458`), but **there is no per-route guard**: typing the URL renders the page anyway. |
| `/display/:id` viewer | ⚠️ **outside `RequireAuth`** (`App.tsx:153-160`) — fully anonymous kiosk route today. |
| auth-service's own API | ✅ real — `authenticateToken` (`middleware/auth.middleware.ts:25-52`) + `requireAdmin` (`middleware/rbac.middleware.ts:36-58`) on all `/users`,`/roles`,`/permissions` routes. |
| **AMS.Api (.NET)** | 🔴 **AUTHORIZATION IS A NO-OP BYPASS.** `Program.cs:241` ("JWT Authentication (Disabled…)"); `:243-248` registers `TestAuthHandler` as the default scheme; `:723-755` `HandleAuthenticateAsync()` returns **`AuthenticateResult.Success` unconditionally, reading no token**, minting `role:"OPERATOR"` **plus all 11 permission claims incl. `admin.users.edit`**. So every `[Authorize(Policy=…)]` (`:251-262`) passes for anonymous callers. A second bypass exists at `:387-388` (`Security:DisableApiAuthorization` → `.AllowAnonymous()`). |
| **display-service / template-service / asset-model / binding-resolver / historian-bff / audit / analysis / notification** | 🔴 **ZERO auth code.** No `AddAuthentication`, no `UseAuthorization`, no `[Authorize]`, no JWKS. Grep for jwt/bearer/authorize across `src/services/*` hits **only** `auth-service`. `POST /displays`, `PUT /displays/{id}/content`, `POST /displays/{id}/publish` are **anonymous writes** today. |
| Token attachment (frontend) | 🟡 ad-hoc, no wrapper/interceptor. `usersApi.ts:5` and `alarmApi.ts:6` send `Authorization: Bearer …` (the latter falls back to the literal `'dev'`). **All `/api/displays` calls send NO Authorization header** — bare `fetch` in `DisplayDesigner.tsx:54,63`, `DisplayViewer.tsx:27`, `DisplayList.tsx`. |

### 8e. Users
`schema.sql:139-140` seeds **no users**. The admin is bootstrapped by the container entrypoint from
`BOOTSTRAP_ADMIN_USERNAME/_PASSWORD` (`infra/docker/docker-compose.yml:634-636`, default
`admin`/`ChangeMe123!`; this stack's `.env` overrides the password — `admin`/`Admin123!` is what the F–I
gates actually logged in with). **No Engineer / Operator / Viewer user exists** — Phase K must create
them (auth-service already exposes admin-only user-create + a bulk-import route).

**→ Phase K consequence (the brief's biggest gap):** the brief says "Backend/API: any create/edit/save/
publish endpoint rejects Operator/Viewer tokens with 403". Today those endpoints live in **display-service,
which has no authentication layer at all** — so K is not "add a role check", it is **"introduce JWT bearer
validation into display-service (JWKS from auth-service) and then add the role check"**. That is the real
work item. The AMS.Api `TestAuthHandler` bypass is a separate, higher-severity hole, but it is **not** on
the Designer path (alarms only) — flagged, not silently worked around; see §11 decision 3.

## 9. Publish — the backend ALREADY EXISTS; the frontend never calls it

**The brief's premise ("does any draft/published distinction exist, or is everything live-edit-is-live?")
resolves to: the *schema and API* have full draft/publish/versioning; the *read path* ignores it, so the
observable behavior today is edit-is-live.**

- **Schema** `database/scripts/11_traverse_displays_schema.sql`: `display_definitions.published_version`
  (nullable, `:30`) + `draft_version` (`:31`); `display_versions(display_id, version, snapshot, status)`
  with `status ∈ draft|published|archived` (`:53-63`), UNIQUE(display_id, version). EF-mapped in
  `Data/DisplayDbContext.cs:19,50,62-63`.
- **Saving is append-only:** `PUT /displays/{id}/content` **increments `DraftVersion` and INSERTs a new
  `display_versions` row** with `status='draft'` (`Program.cs:248-263`) — it never overwrites. So full
  version history already accrues on every designer Save.
- **`POST /displays/{id}/publish` already exists** (`Program.cs:279-315`): archives the previously-published
  version, flips the current draft row to `status='published'`, sets `display.PublishedVersion`.
- 🔴 **The bug that makes it edit-is-live:** `GET /displays/{id}/content` defaults to the **draft** —
  `var targetVersion = version ?? display.DraftVersion;` (`Program.cs:131`). The runtime viewer calls that
  endpoint **with no version param** (`DisplayViewer.tsx:25-30` — and its comment "loads published content"
  is simply **wrong**), i.e. the *same* endpoint the designer reads. **`published_version` is never consulted
  by any read path.** (Contrast: `template-service/Program.cs:110` gets this right —
  `version ?? template.PublishedVersion ?? template.DraftVersion`.)
- 🟠 **Frontend never publishes:** zero `fetch` to `/publish` anywhere in `src/frontend-ob`. The designer
  toolbar has only Save (`DisplayDesigner.tsx:409-415`). `DisplayList.tsx` *already renders* "Draft vN" /
  "Pub vN" badges and computes `hasUnpublishedDraft` (`:124-125`, `:362-363`, `:444-446`) — **the UI
  vocabulary is there, unused.**
- ❌ **No unpublish / revert / rollback endpoint** exists anywhere.
- 🟠 **Personal Views:** `database/scripts/13_personal_views_schema.sql` defines `displays.personal_views`
  + `view_favorites` — **no entity, no DbSet, no endpoint, no frontend**. Two-tier displays are unbuilt
  (out of J–L scope; logged).
- **Launcher gap for Gate K/L:** `DisplayList.tsx:243` cards navigate to **`/designer/{id}`** — the list has
  **no "open published view" link** to `/display/:id` at all. Operators therefore have *no* way to reach a
  published display from the UI today. Phase K's "published-HMI list/launcher" is effectively **new** (or a
  role-conditional variant of `DisplayList`).

**→ Phase L is therefore small and mostly frontend:** (1) make the viewer read *published* (add
`?stage=published` semantics to the content endpoint — do **not** change the default, the designer needs
draft), (2) add a Publish button (role-gated by K) + an unpublish/revert endpoint, (3) surface the badges
that already exist. The heavy lifting (versioning, publish transition) is done.

## 10. Design tokens / canvas system available to J and K

`Designer/designTokens.css` (Phase H) is the single source and is directly reusable:
- Semantic: `--ams-crit`, `--ams-warn`, `--ams-caut`, `--ams-run`, `--ams-advisory`.
- **Trend pens: `--ams-pen-1..6`** (pen-1 aliases `--ams-crit`) — the trend dialog/page get correct pens for
  free, and `TrendChart.resolveColor()` (`:31-40`) is the existing helper that turns a `var()` into the
  concrete color echarts needs.
- Surfaces/typography: `--ams-canvas-bg`, `--ams-panel-bg`, `--ams-border`, `--ams-text`, `--ams-text-dim`,
  `--ams-grid-line`, `--ams-font`, with `[data-obc-theme='day'|'bright'|'night']` variants.
- ❌ **No disabled/locked/read-only token or style exists** (`--ams-disabled`, `.is-readonly`, …). Phase K's
  "locked look for Operators" needs a new token + class — small, but it is net-new, not a reuse.
- Dialog surface: the app already has `styles/hmi-dialogs.css`; per `openbridge-agent-rules.md` a modal must
  use the OpenBridge dialog/brilliant-card components rather than a bespoke overlay — **Phase J's dialog
  must be resolved against `custom-elements.json`, not hand-rolled.**

## 11. Decisions to resolve before implementing J–L (surfaced, not assumed)

1. **Trend Y-axis with mixed-type tags (Gate J says "3 different tags (mixed types)").** Phase C
   deliberately deferred per-pen axes and uses one shared autoscaled axis. Mixed units (%, RPM, PSI) on one
   axis will visually flatten the small-range pen. Recommend: add **per-pen normalized/multi-axis support to
   the extracted `TrendCore`** (a genuine Phase-C deferral being paid down, small echarts change) rather than
   shipping a gate demo where one pen is a flat line.
2. **Phase K authorization currency: coarse `role` claim vs new `display.*` permission keys.** No display
   permission exists today (§8c). Recommend: **add `display.view` / `display.edit` / `display.publish`** to
   the auth-service seed and map Admin+Engineer → edit+publish, Operator+Viewer → view. This matches the
   system's existing permission-first design (and `hasPermission()` already exists in `authStore`), and
   keeps role names from being hardcoded across services. Gate K's "as Operator / as Engineer" behavior is
   identical either way.
3. **AMS.Api's `TestAuthHandler` blanket bypass (§8d) is out of J–L scope but is a live security hole.**
   Phase K will secure **display-service** (the Designer path the gate names). I will **not** silently leave
   the AMS.Api hole undocumented — flagging it here; fixing it (real JwtBearer + JWKS on AMS.Api) is a
   separate task unless you want it folded into K.
4. **Trend access for Operator/Viewer from a published display** — Gate J/K asks this and **the audit finds
   it specified nowhere** (no `analysis.view`-style gate on trends; `TrendChart` is just a canvas symbol).
   **Asking rather than assuming.**
5. **"Return to canvas → display state untouched" (Gate J.4).** Unsaved designer edits live in React state;
   a same-tab route change to `/trend` would destroy them. Recommend **"Open in full page" opens a new tab**
   (`target=_blank`, deep-link URL) — matches PI Vision, and makes J.4 structurally true rather than
   dependent on state-restore plumbing.
6. **The stack is down.** It must be restarted (`docker compose up -d` in `infra/docker`, plus the sim +
   limit-watchdog) before any J/K/L gate evidence can be captured. No gate can be claimed until it is.
