# PHASE_JL_PLAN — Trend view (J) · RBAC (K) · Publish (L)

Written **after** the §7–§11 audit appendix in `SYSTEM_AUDIT.md`. Every item is tagged
**[extend]** (code exists — modify it) or **[new]** (does not exist). Nothing here assumes an
architecture the audit didn't confirm.

## Where the brief and reality diverge (read first)

| Brief assumes | Reality (audit §) | Effect on the plan |
|---|---|---|
| "Reuse Phase C's multi-pen/time-bar/cursor components" | §7 — they exist, but as **one `CanvasItem`-coupled component**, interactive only in `mode==='preview'` | J starts with a **lift** of `TrendChart` into a pens-driven `TrendCore`. Reuse is real, but requires this refactor first. |
| Roles Admin/Engineer/Operator/Viewer | §8a — ✅ **confirmed**, exact literals | No correction needed. |
| "…is already implemented the way described" (RBAC) | §8c/§8d — permissions are **alarm-only**; **no `display.*` key exists**; **display-service has NO auth layer at all** (anonymous writes+publish); AMS.Api authenticates **everything** via a `TestAuthHandler` bypass | K is **not** "add a role check" — it is **introduce JWT validation into display-service**, then gate. Plus new permission keys + new users. |
| "Publish — does a draft/published distinction exist?" | §9 — **the backend already has it in full** (draft_version/published_version/versions/status + `POST /publish`); the **viewer just reads the draft** (`Program.cs:131`) and the frontend never publishes | L is **small**: fix the read path, add a Publish button + revert endpoint. Do not rebuild versioning. |
| "Operators use Phase B's viewer + launcher/list page" | §9 — `DisplayList` cards open the **designer**; there is **no** published-viewer entry point in the UI | K must add an Operator-facing launcher (role-conditional `DisplayList`). |

**Blocking prerequisite (all phases):** the AMS stack is **down** (audit §11.6). Bring up
`infra/docker` + `scripts/sim/process_value_sim.py` before any gate.

---

## PHASE J — Dedicated trend view (page + dialog)

**Principle: no new charting logic.** Everything below is entry points, packaging, and one paid-down
Phase-C deferral.

### J1 [extend] Lift `TrendChart` → `TrendCore`
- `Designer/TrendChart.tsx:55-219` body moves into **`Designer/TrendCore.tsx`** with props
  `{ pens: {path:string; label?:string}[]; height?; compact?; initialRangeMs? }`. Identical internals:
  `useBatchBindingResolver` → pens, `fetchTrend` history, `getLiveSeries` live tail, RANGES time-bar,
  live/playing/endTs, echarts `dataZoom` + `axisPointer:'cross'` cursor, `--ams-pen-*` via `resolveColor`.
- `TrendChart.tsx` becomes a **thin adapter**: `item.bindings` → `pens[]` (keeps the `design`-mode
  placeholder). **Existing canvas trends must render identically** — that is the regression bar.

### J2 [extend] Per-pen Y-axis (audit §11.1)
Gate J demands *mixed types*. Add to `TrendCore` an axis mode: each pen gets its own `yAxis` index (echarts
supports N `yAxis` + `series.yAxisIndex`), axis label colored to the pen. Default on when pens have
different measurements. Small, contained; pays down the Phase-C deferral rather than shipping a flat pen.

### J3 [new] Selection → "Trend" action
- `DisplayDesigner.tsx` ops toolbar (Phase G) gains a **Trend** button, enabled when `selectedIds.length ≥ 1`
  **and** at least one selected item has a UNS-path binding.
- Tag extraction helper: selected `CanvasItem[]` → unique `{path,label}` pens (all binding slots, de-duped).
- Also add it to the canvas **context menu** if that exists after G; otherwise toolbar-only (state it).

### J4 [new] `TrendDialog` overlay
- Modal over the canvas, **resolved from `@oicl/openbridge-webcomponents/custom-elements.json`** per
  `openbridge-agent-rules.md` (no hand-rolled overlay). Body = `<TrendCore pens={…} />`, fully interactive.
- Header: pen chips (remove a pen), **"Open in full page ↗"**, close. Closing unmounts the dialog only —
  designer state is untouched by construction (no route change).

### J5 [new] `/trend` route — deep-linkable
- `App.tsx` route `/trend?tags=<path>,<path>&range=15m` → **`TrendPage`** = shell + `<TrendCore>` from parsed
  query. Shareable/bookmarkable URL. Renders under the app shell (so it inherits Phase H theming).
- "Open in full page" builds that URL and opens it in a **new tab** (audit §11.5) — canvas state cannot be
  lost, which is what Gate J.4 actually requires.

### J6 [extend] Tokens
`TrendCore` inherits `--ams-pen-*` / `--ams-text-dim` / `--ams-border` / `--ams-grid-line` (Phase H). Dialog
chrome uses `--ams-panel-bg`/`--ams-border`. **No new colors.**

### GATE J — evidence to paste
1. In the designer, marquee-select **3 symbols bound to mixed-type tags** (e.g. tank01.level %, pump101.speed
   RPM, pump101.discharge_press PSI) → click **Trend** → screenshot of the dialog with **3 independent pens**,
   legend, per-pen axes.
2. Prove interactivity is the reused Phase-C machinery, not a stub: paste observed **cursor readout of all 3
   pens at one timestamp**, a **zoom** (dataZoom) before/after, and a **live→historical** toggle (`Live` on →
   `◀` steps back off-live; screenshot both).
3. Click **Open in full page** → paste the resulting **URL** and a screenshot of `/trend?tags=…` showing the
   same 3 pens.
4. Return to the canvas → `window.__designer` dump showing `items`/`selectedIds`/`histIndex` **identical** to
   pre-dialog.
5. `npm run build` clean.

---

## PHASE K — RBAC (Designer vs. published runtime)

Grounded by §8. **Three of these four work-items are net-new because the audit found no display auth at all.**

### K1 [new] Display permission vocabulary + users (audit §11.2)
- Add to auth-service seed (`database/schema.sql` + an additive migration so the running DB picks it up):
  permissions **`display.view`**, **`display.edit`**, **`display.publish`**; `role_permissions` →
  Admin: view+edit+publish · Engineer: view+edit+publish · Operator: view · Viewer: view.
- Create test users via the existing admin API (or seed script): `engineer1` (Engineer), `operator1`
  (Operator), `viewer1` (Viewer). Record credentials in ROADMAP_PROGRESS.
- Verify the JWT `permission[]` claim actually carries them (paste a decoded token).

### K2 [new] display-service: JWT bearer validation + authorization  ← **the real work**
- `src/services/display-service`: add `Microsoft.AspNetCore.Authentication.JwtBearer`; configure
  `Authority`/JWKS against `http://auth-service:3002/api/auth/.well-known/jwks.json`, validate
  `iss=traverse-auth`, `aud=ams-services`, RS256 signature.
- Policies: `DisplayEdit` (`RequireClaim("permission","display.edit")`), `DisplayPublish`, `DisplayView`.
- Apply: **`POST /displays`, `PUT /displays/{id}`, `PUT /displays/{id}/content`, `POST /displays/{id}/publish`,
  `DELETE /displays/{id}` → `RequireAuthorization("DisplayEdit"/"DisplayPublish")`.** Reads (`GET /displays`,
  `/{id}`, `/{id}/content`) → `DisplayView` (Operator/Viewer have it).
- **Decision to confirm:** the kiosk viewer `/display/:id` is currently *anonymous* (§8d). Gating reads on
  `DisplayView` means the viewer must send a token → the viewer moves **inside** the authenticated app
  (login required to view). That is what Gate K's "as Operator, the viewer works normally" implies. I will
  implement it that way unless told otherwise, and will note that kiosk-anonymous mode is thereby removed.

### K3 [extend] Frontend: send the token, guard the routes
- **[new] `apiFetch` wrapper** attaching `Authorization: Bearer ${getAuthToken()}` + 401→refresh→retry; swap
  the bare `fetch`es in `DisplayDesigner.tsx:54,63`, `DisplayViewer.tsx:27`, `DisplayList.tsx`,
  `ImportPage.tsx` onto it. (Today they send **no** header — §8d.)
- **[new] `RequirePermission` route guard** (`App.tsx`): wraps `/designer`, `/designer/:id`,
  `/designer/import` with `display.edit` → **`<Navigate to="/displays" replace />`** for Operator/Viewer.
  Direct URL navigation redirects; it does not partially render. (Today only `RequireAuth` exists and
  `/admin/users` is merely *hidden* — that gap gets fixed by the same guard.)
- Nav: Designer entries filtered by `hasPermission('display.edit')` (mechanism already exists, `App.tsx:458`).

### K4 [new] Operator launcher (published HMI list)
`/displays` — role-visible to everyone with `display.view`; lists **published** displays; cards open
**`/display/:id`**, not the designer (§9 gap). Engineers see both entry points; Operators/Viewers see only this.

### K5 [new] Locked/read-only visual state (audit §10)
Add `--ams-disabled` + a `.is-readonly` treatment to `designTokens.css`/`Designer.css` for any surface an
Operator can see but not act on. (No such token exists today.)

### Out of scope, flagged not worked around
**AMS.Api's `TestAuthHandler` (`Program.cs:723-755`) authenticates every anonymous request with a full
permission set** (§8d, §11.3). It is not on the Designer path (alarms only), so Gate K does not touch it —
but it is a live hole. Fold into K only on your say-so.

### GATE K — evidence to paste
1. **As `operator1`:** screenshot — **no Designer nav entry**; the published-HMI list renders; opening a
   display shows the runtime viewer with live data.
2. **As `operator1`:** navigate directly to `/designer/<id>` → screenshot + URL showing the **redirect**
   (landed on `/displays`, designer never rendered).
3. **As `engineer1`:** screenshot — Designer nav present, designer opens, **Publish button present**.
4. **Bypass the frontend:** `curl` `PUT /api/displays/<id>/content` and `POST /api/displays/<id>/publish`
   with the **operator1 bearer token** → paste the **actual `403`** response headers+body. Repeat with the
   **engineer1** token → paste the `200`. Also paste a **no-token** call → `401`.
5. `npm run build` + `dotnet build display-service` clean.

---

## PHASE L — Publish workflow  (depends on K)

The backend already does the hard part (§9). Four small items.

### L1 [extend] Make the runtime read *published* — the core fix
`display-service/Program.cs:126-150`: add a `stage` query param —
`targetVersion = version ?? (stage=="published" ? display.PublishedVersion : display.DraftVersion)`.
**Default stays `draft`** (the designer depends on it). If `stage=published` and `PublishedVersion is null`
→ **`404 "not published"`** (an unpublished display is invisible to Operators, which is correct).
`DisplayViewer.tsx:25-30` calls `?stage=published` (and its incorrect "loads published content" comment
becomes true).

### L2 [extend] Publish action in the designer
Publish button next to Save in `DisplayDesigner.tsx:409-415`, gated on `display.publish` (K) → `POST
/displays/{id}/publish` (endpoint exists). Header shows **Draft vN / Published vM** and an "unpublished
changes" state — `DisplayList.tsx:124-125,362-363,444-446` **already computes exactly these badges**; reuse.

### L3 [new] Unpublish / revert
- `POST /displays/{id}/unpublish` → `PublishedVersion = null`, published row → `archived`. Viewer then 404s
  (display withdrawn from the runtime).
- `POST /displays/{id}/revert` → copy the last published version's snapshot into a **new draft version**
  (append-only, consistent with `PUT /content`). Both `RequireAuthorization("DisplayPublish")`.

### L4 [extend] Save semantics unchanged
`PUT /content` already only ever creates drafts — **no change**; L3's revert is the only new write path.

### GATE L — evidence to paste
1. As `engineer1`: open display D, publish it. As `operator1` (2nd browser context): `/display/D` shows
   version M — screenshot + the `GET …?stage=published` JSON showing `version: M, status: "published"`.
2. Engineer edits D (visible change, e.g. a new symbol) and **Saves without publishing** → paste
   `PUT /content` response (`version: M+1, status:"draft"`). **Operator's view re-fetched → still shows M**
   (screenshot + JSON).
3. Engineer clicks **Publish** → Operator re-fetch → **now shows M+1** (screenshot + JSON).
4. Engineer edits + saves again (M+2 draft) → **Operator still sees M+1** (screenshot + JSON).
5. **Revert/unpublish**: call it, paste the response + the resulting Operator view.
6. `npm run build` clean.

---

## Decisions locked (user-confirmed 2026-07-13)

1. **Operators/Viewers CAN trend.** The Trend action + `/trend` page are available from the published
   runtime viewer, not just the Designer. Trends are read-only analysis and stay **ungated**; only the
   Designer is role-gated. → J3 also wires the Trend action into `DisplayViewer` (select a symbol → Trend).
2. **The viewer requires login.** `/display/:id` moves **inside** `RequireAuth`; display-service `GET`s
   require a valid JWT with `display.view`. Anonymous kiosk mode is intentionally removed.
3. **AMS.Api's `TestAuthHandler` bypass gets fixed in Phase K** ("we have auth service") — replace it with
   real `JwtBearer` + JWKS against auth-service, keeping the existing `permission`-claim policies
   (`Program.cs:251-262`) intact. **Regression bar: the Gate-F alarm path (ack/suppress → alarmStore) must
   still work end-to-end with a real token** — re-prove it, don't assume it.

## Ordering & risk

J → K → L, one at a time, as instructed. K is the long pole (new JWT layer in a .NET service + auth-service
seed + a frontend fetch wrapper); J is mostly a refactor; L is small because the audit found the backend
already built. Two decisions need your answer before K/J start — see the questions accompanying this plan.
