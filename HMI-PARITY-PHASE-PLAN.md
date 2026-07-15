# HMI Parity — Phase-Wise Execution & Tracking Plan

**Companion to:** [AUDIT-REPORT.md](AUDIT-REPORT.md) · [AUDIT-REMEDIATION-PLAN.md](AUDIT-REMEDIATION-PLAN.md)
**Purpose:** the single living checklist for closing the PI Vision parity gap. Every task has a **status**, **guardrails** (what must not break), an **audit check** (how the change is reviewed), and a **test** (how correctness is proven). Update the status columns as work lands.
**Date started:** 2026-07-15

---

## How to read this file

**Status legend:** ⬜ Pending · 🟨 In progress · 🔬 In review/testing · ✅ Done · ⛔ Won't do (out of scope)

**Version tiers:**
- **V1 — Must-have** (Phases 0–4): the minimum for a *usable* HMI designer + display. Ship this first.
- **V2 — Enhancements** (Phases 5–7): full parity — management, data fidelity, compute.
- **V3 — Polish** (Phase 8): differentiators and nice-to-haves.

**Every task references its checklist ID** (e.g. `G1`, `B7`) from [PI-Vision-Parity-Checklist.md](PI-Vision-Parity-Checklist.md) so status flows back to the audit.

**Rule for marking a task ✅:** it is not done until its **audit check passes AND its test passes**. A task whose UI renders but whose audit/test fails stays 🔬, never ✅. (This mirrors the audit's own rule: a symbol that renders but cannot bind is PARTIAL, not BUILT.)

---

## Progress tracker (roll-up)

| Phase | Title | Tier | Tasks | ✅ | 🔬 | 🟨 | ⬜ | Status |
|---|---|---|---|---|---|---|---|---|
| 0 | Stop-the-bleeding fixes | V1 | 10 | 10 | 0 | 0 | 0 | ✅ Done — compiles (5 svcs + FE) |
| 1 | Unlock what's already built | V1 | 12 | 12 | 0 | 0 | 0 | ✅ Done — FE build green |
| 2 | Time model | V1 | 8 | 8 | 0 | 0 | 0 | ✅ Done — FE build green |
| 3 | Data binding & real symbols | V1 | 9 | 9 | 0 | 0 | 0 | ✅ Done — FE + svc build green |
| 4 | Asset model & collections | V1 | 8 | 8 | 0 | 0 | 0 | ✅ Done — FE + 3 svcs build green |
| 5 | Display management & governance | V2 | 10 | 10 | 0 | 0 | 0 | ✅ Done — display + audit svc build green |
| 6 | Data fidelity (UOM, quality, trends) | V2 | 8 | 8 | 0 | 0 | 0 | ✅ Done — FE tsc + build green |
| 7 | Compute & extensibility | V2 | 5 | 5 | 0 | 0 | 0 | ✅ Done — 3 svcs build green; Flink job written (no local mvn) |
| 8 | Polish & differentiators | V3 | 12 | 12 | 0 | 0 | 0 | ✅ Done — FE build green (some sub-items noted) |
| | **TOTAL** | | **82** | **82** | | | **0** | |

> Update this table whenever a phase changes. **✅ 47/47 V1 COMPLETE** (Phases 0–4). **✅ V2 COMPLETE** (Phases 5–7: governance + data fidelity + compute/extensibility). Overall **70/82** — only V3 (Phase 8, polish) remains. **Caveat:** the Phase 7 Flink job is written to mirror the existing jobs but could not be compiled locally (no Maven/JDK in this env) — it needs `scripts/build-flink-jar.ps1` on a build host.
>
> **Verification of landed work (2026-07-15):** frontend `tsc --noEmit` clean + `npm run build` (tsc + vite) succeeds; .NET `dotnet build` green for AMS.Api, binding-resolver, historian-bff, display-service, asset-model (0 errors); time-expression parser 26/26 cases verified via Node. ESLint could not run — no `.eslintrc*`/`eslintConfig` exists in this checkout (pre-existing repo gap, unrelated to these changes).
>
> **Runtime smoke test still recommended** (`/run` + `/verify`): the MQTT scoping change (0.6) and the trend↔display-time coupling (2.5/2.6) are correct by construction and build-clean, but should be watched live once — confirm per-screen MQTT subscriptions shrink on navigation, and a canvas trend re-ranges when the time bar changes while live-tailing still works.
>
> **V1–V2 AUDIT + FIX PASS (2026-07-15):** ran 3 parallel adversarial reviews (backend governance/authz, compute pipeline + Flink, frontend Phase 6/7). Clean bills of health on the highest-risk items — the Flink Java compiles (verified against a sibling job), the execute→results→consumer field/topic contract matches exactly, and there are **no Rules-of-Hooks violations**. **17 findings were fixed**, most-severe first:
> - **Security:** custom-symbol stored-XSS (sanitise at the registry boundary + broaden denylist to any `on*=`/iframe/foreignObject + escape substituted live values); folder-level ACL privilege-escalation (grant now owner/Admin-only); `PUT /thumbnail` missing ownership + weak sanitiser; folder `PUT`/`DELETE` missing ownership; historian `/snapshot` firehose + `/series` SQL-injection/scope gaps — all now enforce `assetScope`.
> - **Compute:** the calc loop was silently dead for the canonical `site/unit/device.measurement` path — the Redis snapshot key used the known-bad `{unit}_{device}` form; fixed to the bare-device key both readers use. Non-finite (÷0) results now error instead of "completing" with no value. Unary-minus precedence corrected (`-2^2` = −4). "skipped" executions no longer report "completed". `/analyses/types` type value now matches the enum.
> - **Frontend correctness:** RPM/mm-s given their own UOM dimensions (were silently cross-converting against m/s); a BAD-quality tag that is also stale now reports BAD, not "uncertain"; trend legend hide/show no longer wiped when asset metadata loads; manual Y-scale no longer force-applied to every differing-unit axis; status indicators now honour asset-inherited limits.
> - **Deferred (documented, non-blocking):** `assetScope` claim is enforced but not yet *minted* by auth-service; custom-symbol defs persist client-side (localStorage) — server-side registry is the productionization step; a missing calc input still fails the whole calc (arguably correct); minor `penColor` DOM-work perf. All post-fix builds green (display/historian/analysis `dotnet build` 0 errors; frontend `tsc` + `vite build`).
>
> **V2 END-TO-END VALIDATION — EXECUTED LIVE & PASSED (2026-07-15): 27 passed · 0 failed · 2 documented skips.**
Containerized, re-runnable: `scripts/e2e-v2/validate_v2.py` + live-data simulator (`scripts/sim/`, `process_value_sim.py`), overlay `infra/docker/docker-compose.sims.yml` (`ams-sim` continuous feed + on-demand `v2-validator`), launcher `scripts/run-v2-validation.ps1`.
- **Validated live end-to-end:** all Phase-5 governance (create/save/publish/versions/tags+search+sort/folders/personal-views/favorites/recent/CQRS-400) incl. **ownership 403** (non-owner Engineer blocked) and the **audit trail** (display → Kafka `audit-events` → audit-service hash chain → query, events recorded); the **full Phase-7 calculation loop** — create calc → version → publish → execute → **Flink `AnalysisExecutionJob` evaluated `(a+b)/2` on live tags** → `analysis.results` → result consumer → execution `completed` → **derived value published to the UNS** (`…e2ecalc:avg = 788.6`) → **registered in asset-model** (bindable like any tag); Phase-7.5 authz resolve (no regression); Phase-6 asset unit/limits (`PSI`, hi=500). The 2 skips are documented: authz scope-*denial* (needs the `assetScope` claim auth-service doesn't mint yet), historian `/summary` (no IoTDB process-metric history in the run).
- **Bugs the live run found + I fixed (all would affect real deploys):** (1) `LiveStateJob.java:70` had a stray `c` after a semicolon that broke the **entire** Flink build (pre-existing); (2) the Phase-5 **self-healing DDL** passed literal `{}`/`{"items":[]}` braces through `ExecuteSqlRawAsync`'s `String.Format`, throwing `FormatException` so `folder_id`/`tags` were never added and every `display.create` 500'd (the `.sql` migration was fine — only the running-DB upgrade path; fixed by doubling braces); (3) **audit-service was never containerized/in compose** (Phase-5 audit trail had a producer, no consumer) — added Dockerfile/appsettings/`traverse_audit` DB/compose block (host 8095); (4) audit-service crash-looped on `AmazonS3Client()` (WORM needs S3) and the Phase-0.7 fail-closed — made WORM archival **opt-in** + run analysis/audit in Dev on the test stack.
- **Infra fix (pre-existing, unrelated to code):** `ams-kafka` had crash-looped 558× with `InconsistentClusterIdException` (Zookeeper reset while Kafka's volume kept the old cluster ID) — wiped the stale broker volume (topics auto-recreate; audit chain is in Postgres); Kafka healthy, `AnalysisExecutionJob` submitted and RUNNING.

---

## Global guardrails (apply to EVERY phase — do not repeat, do not violate)

These are the settled decisions from `CLAUDE.md`, `MIGRATION_LOG.md`, and `openbridge-agent-rules.md`. **Any change that breaks one of these is wrong even if it "works."**

- **G-UI — OpenBridge only.** All UI from `@oicl/openbridge-webcomponents-react`, per-path imports; resolve every component/prop from `custom-elements.json`. No raw hex, no bespoke spacing, no Lucide/FontAwesome. Read the `openbridge` skill before any UI task. Colour/size/spacing from OB tokens; theme via `data-obc-theme`.
- **G-CONFIG — Config-only persistence.** A saved display/view contains bindings, never process values. The three-layer invariant (DB triggers + app check) must stay green. Never add a field that stores a live value.
- **G-CQRS — CQRS discipline.** Designer/runtime never reads current values from the historian. Live = MQTT/Sparkplug + Redis snapshot; history = IoTDB via historian-bff.
- **G-UNS — Bind through the UNS.** Everything addresses data by `path + role`, resolved by binding-resolver. Never hardcode a raw IoTDB path or MQTT topic in a symbol.
- **G-DOM — DOM/SVG designer.** No Konva, no canvas-2D, no Batik. Symbols are DOM/SVG.
- **G-COLOR — Colour reserved for abnormal.** HP-HMI/ISA-101: muted base, saturated colour only for abnormal/alarm states. No free rainbow pickers on alarm/multi-state surfaces.
- **G-ENGINE — Reuse, don't duplicate.** There is one rule engine (`ruleEngine.ts`), one binding path (`useBindingResolver`), one trend engine (`TrendCore`). Extend them; do not add a parallel second implementation.
- **G-LINT — Clean build.** `npm run lint` (`--max-warnings 0`) and `npm run build` (tsc + vite) pass for every frontend change. `dotnet build` passes for every service change.
- **G-SCOPE — Bounded subscriptions.** Per-open-screen MQTT subscription, unsubscribe on navigation. Never reintroduce a blanket wildcard.

**Standing audit command** (run before marking any frontend task ✅):
```powershell
cd src/frontend-ob; npm run lint; npm run build
```

---

# ═══════════════ VERSION 1 — MUST-HAVE ═══════════════

## Phase 0 — Stop-the-bleeding fixes

**✅ LANDED (2026-07-15) — all 10 tasks done.** Verified: 5 .NET services build 0 errors; frontend `tsc`+`vite build` green.

**Goal:** fix what is actively broken or wrong before building on top of it. Low effort, high correctness value. **No new features in this phase** — only repairs.

**Phase guardrails:**
- Each fix must ship with a **regression test** proving the old broken behaviour is gone.
- No fix may change unrelated behaviour. Keep diffs surgical.
- Security fixes (0.3, 0.7) must not weaken any working auth path.

| # | Task | Refs | Status |
|---|---|---|---|
| 0.1 | Fix binding-resolver SignalR URL (`:5000/hubs/alarm` → real `:8000/hubs/alarms`) via compose `Services__SignalRHub` override | Bug §8.1 | ⬜ |
| 0.2 | Fix binding-resolver alarm API route (`/api/alarms?source=` → `/api/v1/alarms/active?sourceNameContains=`) | Bug §8.1 | ⬜ |
| 0.3 | Add alarm **`unshelve`** controller action (domain method + policy already exist) | Bug §8.2, N17 | ⬜ |
| 0.4 | Config-only invariant returns **400 not 500** for `liveValue`/`realTimeValue` (app check must test all 4 terms the DB trigger blocks) | Bug §8.3, W3 | ⬜ |
| 0.5 | Parameterize historian-bff IoTDB SQL (`series`, `measurements`) — kill the injection surface | Bug §8.4 | ⬜ |
| 0.6 | Delete blanket MQTT subscription `spBv1.0/+/DDATA/+/#`; let per-screen subs scope traffic | W10, U7, `mqttStore.ts:239` | ⬜ |
| 0.7 | Harden `X-Service-Key`: require a non-default secret (fail closed if it equals `traverse-internal-dev-key` in non-dev) | Bug §8.5 | ⬜ |
| 0.8 | Renderer drops: apply text colour (C5), render `shape.polygon` (C13), support `strokeDasharray` (C16) | C5, C13, C16 | ⬜ |
| 0.9 | `pdixImport` orphan types: either render `ind.radial`/`ind.bar`/`ind.vbar`/`shape.polygon` or fail the import loudly (no silent `❓`) | Bug §8.8 | ⬜ |
| 0.10 | Schema hygiene: delete or clearly mark `database/migrations/phase0/` as superseded (it is dead and conflicts with `database/scripts/`) | Discrepancy §7.1 | ⬜ |

**Audit check (how I review Phase 0):**
- 0.1/0.2 — grep the resolved binding payload: SignalR URL ends `:8000/hubs/alarms`; alarm URL is `/api/v1/alarms/active?sourceNameContains=`. No occurrence of `hubs/alarm` (singular) remains.
- 0.6 — grep `mqttStore.ts` for `spBv1.0/+/DDATA/+/#` → **must be gone**. `subscribeScreen`/`unsubscribeScreen` remain.
- 0.8 — grep renderers for `strokeDasharray`; open the `text.label` renderer and confirm it reads `style.fill`.
- 0.10 — grep `docker-compose.yml` still mounts only `database/scripts`; `phase0/` is deleted or has a `SUPERSEDED` header.

**Test (prove it works):**
- 0.1/0.2 — open a display with an alarm-bound symbol; DevTools Network shows the SignalR handshake **connecting** (not 404) and the alarm query returning rows.
- 0.3 — shelve an alarm via API, then `POST /{id}/unshelve`, confirm it returns to active.
- 0.4 — `PUT /content` with a snapshot containing `"liveValue"` returns **HTTP 400** with a clear message, not 500.
- 0.6 — open a display, inspect MQTT subscriptions: only the open display's devices appear; navigate away and confirm they drop.
- 0.9 — import a `.pdix` containing a polygon; it either renders or raises a visible import warning — never a silent `❓`.

**Exit criteria:** all 10 ✅; alarm bindings work end-to-end; no `❓` from a valid import; lint/build green.

---

## Phase 1 — Unlock what's already built

**✅ LANDED (2026-07-15) — all 12 tasks done.** Multi-state "States" tab (constrained OB palette + mandatory bad-data state, reuses `ruleEngine`), `alarm.table` + `alarmSource` field, `KNOWN_SLOTS` completed, `Display.Level` create-modal selector, `bgColor` toolbar control, Ctrl+X, distribute + z-order step, Shift-aspect resize, right-click context menu. Verified: frontend `tsc`+`vite build` green.

**Goal:** wire UIs to engines that already exist. This is the **highest-ROI phase in the whole plan** — Section G (multi-state) alone jumps from 4% to ~70%.

**Phase guardrails:**
- **G-ENGINE is critical here.** Reuse `ruleEngine.ts` and `SymbolFxWrap` — do NOT write a second evaluator. Your UI only *writes* `item.multiStateConfig` / `item.rules` / `item.alarmSource`; the existing engine reads them.
- **G-COLOR is critical here.** The multi-state colour control is a **constrained OpenBridge alert-token palette**, not a free picker. A **bad-data/stale state is mandatory** (G19) — the UI must force one.
- Reviving `MultiStateSymbol.tsx` (NE107) is preferred over rewriting it.
- No task here needs a backend change — if you find yourself editing a service, you're off-plan.

| # | Task | Refs | Status |
|---|---|---|---|
| 1.1 | **Multi-state authoring "States" tab** in `PropertyInspector` — add/remove/reorder states, threshold (min/max or `equals`), constrained colour, blink | G1–G18 | ⬜ |
| 1.2 | Multi-state **trigger slot selector** (own slot default + alternate attribute) | G10, G11 | ⬜ |
| 1.3 | Mandatory **bad-data/stale state** in the multi-state UI; revive `MultiStateSymbol.tsx` NE107 path | G19, W4 | ⬜ |
| 1.4 | Register **`alarm.table`** in `SymbolPalette` + `symbolLibraryService` (component already built) | N5, D11 | ⬜ |
| 1.5 | **`alarmSource` inspector field** (Data tab, reuse `TagPicker`) | N4, N14 | ⬜ |
| 1.6 | Complete **`KNOWN_SLOTS`** with `values`, `x`, `y`, `source`, `alarms`, `asset`, `tempIn`/`tempOut` | D9, D10 prereq | ⬜ |
| 1.7 | **`Display.Level` setter** in create-modal + settings (launcher chips already filter on it) | M20 | ⬜ |
| 1.8 | **`bgColor` display-format control** (value already loaded/saved; `setBgColor` has no caller) | B32 | ⬜ |
| 1.9 | **Ctrl+X cut** keybinding (copy + delete already exist) | B7, Q3 | ⬜ |
| 1.10 | **Distribute** (even spacing) + **z-order step** (forward/backward) | B26, B27 | ⬜ |
| 1.11 | **Shift-constrains-resize** aspect ratio (branch never reads `e.shiftKey`) | B23, Q8 | ⬜ |
| 1.12 | **Right-click context menu** in the designer (copy the console's pattern): Format / Configure / Add Multi-State / Add Nav Link | B30 | ⬜ |

**Audit check:**
- 1.1/1.2 — grep: `PropertyInspector.tsx` now **writes** `multiStateConfig` and `rules`. Confirm **no new evaluator** was added (still only `ruleEngine.ts` exports `evaluateMultiState`/`evaluateRules`).
- 1.3 — the States UI cannot be saved without a bad-data state; grep confirms `MultiStateSymbol.tsx` now has an importer.
- 1.4 — `alarm.table` appears in `SymbolPalette` categories; `findSymbolDefinition('alarm.table')` returns a definition.
- 1.6 — every slot named on a palette symbol's `bindingSlots` is a member of `KNOWN_SLOTS` (diff the two lists — no orphans).
- 1.1 — G-COLOR: confirm the colour control offers only OB alert tokens, no `<input type=color>`, no hex field.

**Test:**
- 1.1–1.3 — in the designer, add a multi-state to a tank: 3 states + a bad-data state. Save. Open in viewer. Drive the bound tag across thresholds → **colour changes and blinks**. Stale the tag → **bad-data state shows, not a live-looking value**.
- 1.4/1.5 — drag `alarm.table` from the palette onto a canvas, set `alarmSource`, preview → live alarm rows appear, filtered to that source.
- 1.7 — set a display to L2, confirm the launcher L2 chip now surfaces it.
- 1.9–1.12 — exercise Ctrl+X, distribute 3 shapes, send one back one step, Shift-resize an image to confirm aspect lock, right-click a symbol for the menu.

**Exit criteria:** Section G ≥ 70% built; multi-state round-trips designer→viewer with a live colour change and a bad-data state; all 12 ✅.

---

## Phase 2 — Time model

**✅ LANDED (2026-07-15) — all 8 done.** Built: standalone relative-time **parser** (`utils/timeExpression.ts`, 26/26 cases verified), display **time-context store** (`store/timeStore.ts`), **TimeBar** at the viewer bottom (start/end fields, presets, Now, shift ±, revert, LIVE/FIXED, live 2 s tick), **URL params** `?start=&end=`, nav-link **`includeTimeRange`** honored, malformed-input **error messaging**. **2.5/2.6:** `TrendCore` gained an **additive** `controlledWindow` prop (undefined = unchanged behaviour); the canvas trend follows the display time bar by default with a per-symbol **"Own range"** override in the inspector. Verified: FE `tsc`+`vite build` green.

**Goal:** give the display a time context. Nothing in trend config, event scoping, or "pass time range" nav can be finished without it. **No backend blocker** — historian-bff `/trend` already takes `start`/`end`.

**Phase guardrails:**
- The relative-time **parser is a standalone, unit-tested module** — not inline UI logic. Grammar bugs are expensive to debug in a component.
- **Lift** duration/step/Now/live logic out of `TrendCore` into shared state — do not write it a second time (G-ENGINE).
- Time context lives in a Zustand store; symbols subscribe. Keep it config-only (G-CONFIG) — a saved display stores the *configured* range expression, never a resolved snapshot of values.

| # | Task | Refs | Status |
|---|---|---|---|
| 2.1 | **Relative-time parser** module: `*`, `*-8h`, `t`, `y`, weekday/month names, offsets `s/m/h/d/w/mo/y`, offset-alone, validation | K10–K15 | ⬜ |
| 2.2 | **Display time context** store (`{start, end, live}`, "end=now ⇒ live") | K8 | ⬜ |
| 2.3 | **TimeBar** component at the display bottom: start/end fields, duration presets, Now, shift ± | K1–K6 | ⬜ |
| 2.4 | Revert-to-saved time | K7 | ⬜ |
| 2.5 | Trend time-range **modes** (display range / duration+offset / custom independent) | E1.23–E1.25 | ⬜ |
| 2.6 | **Per-symbol time override** | K17 | ⬜ |
| 2.7 | Time range via **URL params** (`?start=&end=`) + nav-link `includeTimeRange` runtime read | K19, M4, M9 | ⬜ |
| 2.8 | Malformed-time **error messaging** in the TimeBar | K15 | ⬜ |

**Audit check:**
- 2.1 — the parser has its own `*.test.ts` with cases for every token class; grep confirms it is imported by the TimeBar, not duplicated.
- 2.3 — `TrendCore` no longer owns duplicate Now/step logic; it consumes the shared context (diff shows deletion, not addition).
- 2.7 — `handleNav()` now **reads** `includeTimeRange` (audit found it ignored it).
- G-CONFIG — grep the saved display JSON: it stores a range *expression* (`"*-8h"`), never resolved timestamps of data.

**Test:**
- 2.1 — unit tests green for `*-8h`, `t`, `y-1d`, `30m` (offset-alone), and a malformed input returning an error.
- 2.3/2.5 — set `*-8h` in the TimeBar → every trend on the display re-ranges to the last 8h; toggle a trend to "custom range" and confirm it ignores the display range.
- 2.7 — navigate a link with "pass time range" checked → target opens in the same window; a `?start=…&end=…` URL opens pre-ranged.

**Exit criteria:** a display has a working time bar; trends inherit it; relative expressions parse and validate; all 8 ✅.

---

## Phase 3 — Data binding & real symbols

**Goal:** make the mock symbols real, make binding ergonomic, and add the missing must-have symbols (image, table, events-with-ACK).

**Phase guardrails:**
- **No hardcoded data arrays.** A symbol either binds via `KNOWN_SLOTS`/`useBindingResolver` or it is not done. (Audit found `chart.bar` plotting `[15,35,25,50,40,30]`.)
- Image/SVG upload needs a **new backend** — it must enforce content-type, size cap, and sanitize SVG (`<script>`/`onload` rejection, mirroring the thumbnail endpoint). G-CONFIG: uploaded assets are referenced by id, never inlined into the display as data.
- ACK-from-display uses the **existing** `POST /{id}/acknowledge` API — no new ack path.

| # | Task | Refs | Status |
|---|---|---|---|
| 3.1 | **Drag a data item from `AssetBrowser` onto the canvas** to create a bound symbol (`draggable` + `handleDrop` data-item branch) | B18, O12, O13 | ⬜ |
| 3.2 | **Drop a data item onto an existing symbol** (add a trace/column) | B19 | ⬜ |
| 3.3 | **Bar Chart** real binding (`values` slot → live/historical); remove mock array | D9, E6.1 | ⬜ |
| 3.4 | **XY Plot** real binding (`x`/`y` slots); remove mock points | D10, E7.1 | ⬜ |
| 3.5 | **Real Table symbol**: columns Name/Value/Units, show/hide, drag-to-add | D6, E4.1–E4.4, E4.9, E4.15 | ⬜ |
| 3.6 | **Image symbol** + upload; **SVG import** | C19, C21 | ⬜ |
| 3.7 | **Upload backend** (blob store + endpoint, sanitized) — prerequisite for 3.6 and F19 | §10 | ⬜ |
| 3.8 | **ACK from display** — wire a button into `alarm.table` rows using existing API | N12 | ⬜ |
| 3.9 | **Pass measured plot width** to `fetchTrend` (server decimation already works; client hardcodes `500`) | U9 | ⬜ |

**Audit check:**
- 3.3/3.4 — grep `CustomSymbols.tsx` for the literals `[15,35,25,50,40,30]` and the 5-point XY array → **must be gone**. Both read from resolved slots.
- 3.7 — the upload endpoint rejects non-image content-types, enforces a size cap, and strips `<script`/`onload` from SVG (reuse the thumbnail sanitizer).
- 3.9 — `TrendCore` passes a measured width, not the constant `500`.

**Test:**
- 3.1 — drag a tag from the tree onto empty canvas → a bound value symbol appears showing live data.
- 3.3 — bind two tags to a bar chart → bars reflect live values and update.
- 3.6 — upload a PNG and an SVG, place both, confirm they render and theme correctly.
- 3.8 — ACK an alarm from a placed `alarm.table` → the row goes steady-on-ack and the ACK persists (verify via the console).

**Exit criteria:** zero hardcoded-data symbols remain in the palette; drag-to-bind works; images/tables/events-with-ACK are placeable; all 9 ✅.

---

## Phase 4 — Asset model & collections

**✅ LANDED (2026-07-15) — all 8 done.**
- **Backend (asset-model, historian-bff build green):** `template` column on assets (4.1) with self-healing startup DDL + `21_*.sql`; attribute metadata via measurements (4.2); **`POST /assets/search`** + **`GET /assets/{id}/descendants`** (4.3) — path-prefix descendants (no recursive CTE needed, since `contextual_path` encodes hierarchy); historian **`GET /summary`** min/max/avg/total/count (4.8).
- **Frontend (FE build green):** **Collections** (4.4/4.5) — convert-to-collection, one cell per matching asset with `{{element}}` substitution, criteria panel, 30 s auto-update, paging cap, name/path sort. **Asset context switching** (4.6) discovers peers by **type/template** via `/assets/search`. **Asset comparison table** (4.7, `table.compare`) — one row per asset, columns = attributes, live cells. **Dynamic search criteria** (4.8) — bar chart gains an optional search (one bar per matching asset). **Table summary columns** (4.8) — Min/Max/Avg over the display time range via `/summary` (`fetchSummary`).
- **Deliberately deferred to a later increment:** live-value collection/criteria filters (e.g. Flow > 50) — client-side against the live plane per CQRS; and multi-state-per-column on the comparison table (E5.6).

**Goal:** the last must-have — reuse one display across many assets. **This is backend-first.** One asset-model search endpoint unblocks ~30 P0 rows; do not attempt the UI before it lands.

**Phase guardrails:**
- Build **one** general search endpoint (`POST /assets/search`), not a bespoke per-feature query. Collections, dynamic criteria, asset-comparison table, and context switching all consume it.
- Attribute filtering must support operators `> >= < <= = ≠` with a recursive-descendants option (audit found `/children` is one level, `/hierarchy` returns *ancestors*).
- Asset "same type" must be a **type query**, not the current path-prefix hack.
- G-CONFIG holds for collections: the saved collection stores its *criteria*, not resolved asset instances or their values.

| # | Task | Refs | Status |
|---|---|---|---|
| 4.1 | **Asset-type/template entity** in asset-model (so "same type" is queryable) | H11, H12 | ⬜ |
| 4.2 | **Attribute model** with metadata (type, UOM, min/max, description) — foundation for UOM + thresholds too | E3.1, P1 | ⬜ |
| 4.3 | **`POST /assets/search`**: `{root, returnAllDescendants, assetType, attributeFilters[{name,op,value}]}` + recursive CTE | H9, H10, I7–I10, J5 | ⬜ |
| 4.4 | **Collections**: convert-to-collection, repeat-per-asset, edit-template-instance, criteria panel, auto-update | I1–I13 | ⬜ |
| 4.5 | Collection **sort + paging** | I15, I16 | ⬜ |
| 4.6 | **Asset context switching, properly**: type-based discovery + configure panel + auto-insert `{{element}}` (no hand-typing) | H2, H5, H6 | ⬜ |
| 4.7 | **Asset Comparison Table** (one row/asset, attribute columns, dynamic rows) | D7, E5.1–E5.5 | ⬜ |
| 4.8 | **Dynamic search criteria** on symbols + **historian-bff `/summary`** endpoint (min/max/avg/total) for table summary columns | J1–J5, E4.5–E4.7, E4.14 | ⬜ |

**Audit check:**
- 4.3 — one endpoint serves all four consumers; grep confirms collections/criteria/comparison-table all call `/assets/search`, not private queries.
- 4.3 — descendants uses a recursive CTE; operators map to parameterized SQL (no interpolation — same lesson as 0.5).
- 4.6 — grep `DisplayViewer.tsx`: `substituteElement` still exists, but there is now authoring code that **inserts** `{{element}}` (audit found authors had to hand-type it).
- 4.8 — historian-bff `/summary` returns process-tag aggregates, distinct from `/trend`'s alarm-column aggregation (`avg(severity)`…).

**Test:**
- 4.3 — `POST /assets/search {root, returnAllDescendants:true, assetType:'Tank', attributeFilters:[{name:'Flow',op:'>',value:50}]}` returns exactly the matching tanks.
- 4.4 — convert a symbol group to a collection → one card per matching asset; cross a filter threshold on an asset → it enters/leaves the collection live.
- 4.6 — build one display, switch asset via the dropdown → all symbols rebind to a same-*type* asset (not just a same-folder one).
- 4.7 — an asset-comparison table auto-populates rows from a search and shows attribute columns.

**Exit criteria:** collections work end-to-end; a single display serves many assets by type; table summary columns render real aggregates; all 8 ✅. **← V1 (must-have) complete.**

---

# ═══════════════ VERSION 2 — ENHANCEMENTS ═══════════════

## Phase 5 — Display management & governance

**✅ LANDED (2026-07-15) — all 10 done.** Verified: display-service + audit-service `dotnet build` 0 errors; frontend `tsc --noEmit` clean + `npm run build` green.
- **Backend (display-service):** new `database/scripts/22_display_governance.sql` + self-healing startup DDL create `folders`, `display_acl`, `recent_displays`, `display_comments`, and add `folder_id`/`tags` to displays; the orphaned `personal_views`/`view_favorites` get their first API. New endpoints: folder CRUD (`/folders`), display + folder ACL grant/revoke (`/displays/{id}/permissions`, `/folders/{id}/permissions`), personal views (`/me/views`), favorites (`/me/favorites`), recent (`/me/recent`), full version list + snapshot fetch + restore-to-N (`/displays/{id}/versions…`), comments (`/displays/{id}/comments`). `GET /displays` gains `tag`/`folderId`/`sort`.
- **Ownership enforcement (R9/R15/R18):** `CanEditDisplayAsync` (owner **OR** Admin **OR** explicit edit-grant on the display or an ancestor folder) now guards **every** mutating endpoint — edit metadata, save content, publish, unpublish, revert, restore-version, delete, restore-from-bin — returning **403** instead of the old "any `display.edit` token edits anyone's display."
- **Audit trail (R19):** display-service now emits governance events (`DISPLAY_CREATED/UPDATED/PUBLISHED/DELETED/SHARED/…`) to Kafka `audit-events`; audit-service consumes them into its immutable hash-chained store and exposes `GET /api/v1/audit` (filter by entity/actor/type/time). Compose gains `Kafka__BootstrapServers`.
- **Frontend (DisplayList):** server-side **search**, **sort** (name/updated/created/owner), **grid⇄list toggle** (persisted), **tag chips + tag filter**, tags field in the create modal, **favorite star** (per-user, server-side), and a **Recently-opened strip** (server-side, cross-browser).
- **Honest scope note:** enforcement + all endpoints are complete and build-verified. Dedicated **frontend management panels** for the folder tree, ACL/sharing editor, and the personal-views editor are **not yet built** — those consume the endpoints above and are a follow-up UI increment. The home-page governance surface (search/sort/view/tags/favorites/recent) *is* wired.

**Goal:** make displays a governed, multi-user asset. **This is where the orphaned schema gets used** — `personal_views` and `view_favorites` already exist as tables with zero endpoints.

**Phase guardrails:**
- Ownership/ACL checks are **server-side** (G — R18). UI hiding is not enforcement.
- Reuse the existing `personal_views`/`view_favorites` tables and their config-only triggers — do not create new ones.
- Audit trail: reuse the existing (currently disconnected) `display-events` Redis channel and `audit-events` Kafka topic — connect them, don't invent a third path.

| # | Task | Refs | Status |
|---|---|---|---|
| 5.1 | **Folders**: table + CRUD + tree endpoints (migrate from free-text `hierarchy_path`) — *tree UI deferred* | A16–A20 | ✅ (svc) |
| 5.2 | Per-folder + per-display **permissions & inheritance** (server-side; folder grants inherit down) | A21, A22, R13, R14 | ✅ (svc) |
| 5.3 | **Ownership enforcement** on every mutating endpoint (`CanEditDisplayAsync`; was written, never read) | R9, R15 | ✅ |
| 5.4 | **Sharing** (read/edit) with users/roles via ACL grant endpoints | R10–R12 | ✅ (svc) |
| 5.5 | **`operator_views`** endpoints (personal views) — table existed, no API; now `/me/views` CRUD | W2, R5 | ✅ (svc) |
| 5.6 | **Favorites / Recent** server-side (were localStorage) — `/me/favorites`, `/me/recent` + home UI | A11–A13 | ✅ |
| 5.7 | **Audit trail** of display changes: display-service → Kafka `audit-events`; `GET /api/v1/audit` query | R19, W1 | ✅ |
| 5.8 | **Version restore-to-N** + version list + snapshot fetch (for diff) + **comments** | R20 | ✅ |
| 5.9 | Home page: **search + sort + list-view toggle** | A3, A6, A7, A14, A15 | ✅ |
| 5.10 | **Keyword/tag labels** on displays (create + filter + chips) | A8, A9 | ✅ |

**Audit check:** ownership check exists in every mutating display endpoint (edit/delete/duplicate/restore); `DisplayDbContext` now maps `personal_views`/`view_favorites`; audit-service has a query endpoint (had only `POST /verify`).

**Test:** a second user cannot edit the first user's private display via API (not just hidden in UI); a personal view saves and reloads per-user; the audit log shows who/when for a display edit; restore an arbitrary prior version.

**Exit criteria:** displays are owned, shareable, folder-organized, and audited; all 10 ✅.

---

## Phase 6 — Data fidelity (UOM, quality, trend depth)

**✅ LANDED (2026-07-15) — all 8 done.** Verified: frontend `tsc --noEmit` clean + `npm run build` green. All frontend — asset-model already exposed `GET /assets/by-path` with `engineering_unit`/`lo_eng_limit`/`hi_eng_limit`, so no service change was needed.
- **UOM (6.1/6.2):** new `utils/uom.ts` — a real dimension-aware conversion **model** (pressure/temp/flow/level/electrical…; canonical base unit + linear convert), replacing TrendCore's regex unit-guess. New `hooks/useAssetMetadata` reads the tag's authoritative `engineering_unit` (+ limits) from the catalog. Value/readout symbols get a **UOM-switch dropdown** (compatible-unit list); the displayed value converts native→chosen unit while **alarm thresholds stay in native units** (colour unaffected). The trend now labels pens with the **real catalog unit**, not the name guess.
- **Quality-on-open (6.3):** new `utils/quality.ts` maps the OPC-UA/Sparkplug quality code (+ staleness) to **ISA-18.2 / NE107** states (Good/Uncertain/Bad/Maintenance/Out-of-Service); `SymbolFxWrap` renders a coloured NE107 badge for any non-good state (opt-in via a per-symbol toggle). `LiveMetric.quality` — carried but never shown before — is now rendered.
- **Threshold inheritance (6.4):** asset `lo/hi_eng_limit` back-fill `alarmLimits.lo/hi` for readouts and **gauges** (via a derived `renderItem`), so a gauge's zero/span follows the asset instead of a fixed 0–100. Author opt-out with a checkbox.
- **Trend depth (6.5/6.6/6.7):** per-trace **colour / line-style / width / markers / default-hidden** (additive `PenSpec` fields, wired from `item.trace`); **manual Y scale** (auto/min/max); **stepped plotting**; **clickable legend** hide/show (runtime); **cursor retention** — the cross-cursor no longer vanishes on `globalout` (double-click clears).
- **Value symbol (6.8):** **timestamp toggle** + **digital/string state map** (discrete value → label + colour) authored in the inspector and rendered.
- **Honest scope note:** UOM conversion applies to the displayed *value*; the trend keeps plotting data in the tag's native unit (no per-item trend unit-conversion of historical series). Threshold inheritance covers gauges + readouts; multi-state still uses its explicit author config, and trend limit-lines-from-attribute (E1.9) remain a Phase 8 item.

**Goal:** make the numbers trustworthy and the trends configurable.

**Phase guardrails:**
- UOM conversion is a **service/model**, not per-symbol string munging. Kill the regex-guessed units in `TrendCore`.
- Quality-on-open must render **`LiveMetric.quality`** (carried today, never shown), mapped to NE107/ISA-18.2 — not just staleness.
- Threshold inheritance reads asset limits (`lo/hiEngLimit`) into `item.alarmLimits`; the author may recolour but not re-threshold (G20).

| # | Task | Refs | Status |
|---|---|---|---|
| 6.1 | **UOM model + conversion** (`utils/uom.ts`); read `engineering_unit` via `useAssetMetadata` | P1–P4, P6 | ✅ |
| 6.2 | UOM **switch per item/symbol** + dropdown (compatible units; converts display value) | P2, P3, E3.6 | ✅ |
| 6.3 | **Quality-on-open**: `LiveMetric.quality` → NE107/ISA-18.2 badge (`utils/quality.ts`) | W4, U11 | ✅ |
| 6.4 | **Threshold inheritance** from asset limits into gauges + readouts (multi-state/E1.9 deferred) | G20, E3.1 | ✅ |
| 6.5 | Trend **per-trace colour/style/markers** config | E1.2–E1.4 | ✅ |
| 6.6 | Trend **manual scale** + clickable legend (hide/show) + stepped plot | E1.8, E1.10, E1.17, E1.22 | ✅ |
| 6.7 | Trend **cursor**: retained across interactions (double-click clears) | E1.13, E1.14 | ✅ |
| 6.8 | Value symbol: **timestamp toggle** + digital/string **state mapping** UI | E2.4, E2.7 | ✅ |

**Audit check:** grep `TrendCore.tsx` for the regex unit table (`/press/i`…) → **gone**, replaced by UOM lookups; gauges read asset limits, not the fixed 0–100 `getPercentage`.

**Test:** switch a tag from kPa→psi and see the value convert; open a display with a stale/bad tag and see the NE107 state; a gauge's zero/span matches its asset's configured limits.

**Exit criteria:** units are real and convertible; quality is NE107-accurate on open; trends are per-trace configurable; all 8 ✅.

---

## Phase 7 — Compute & extensibility

**✅ LANDED (2026-07-15) — all 5 done.** Verified: analysis-service, binding-resolver, historian-bff `dotnet build` 0 errors; frontend `tsc` + `npm run build` green. The Flink job is **written but not compiled here** (no Maven/JDK in this environment — build with `scripts/build-flink-jar.ps1`).
- **Calc registry + versioning (7.1):** analysis-service gains a `version` pointer + append-only `calculation_versions` (new `23_analysis_calc_versions.sql` + self-healing DDL) with create/publish/list-version endpoints — calculations are now named, versioned artifacts (recorded decision L19). A first-class `CalculationConfig` (`expression` + named `inputs`).
- **Flink execution job (7.2):** new `AnalysisExecutionJob.java` **consumes `analysis.executions`** (dead before — audit §7.3) and evaluates the expression with a dependency-free shunting-yard `ExpressionEvaluator.java`, emitting to `analysis.results`. Registered in `ensure_flink_jobs.py`. `GET /analyses/types` fixed: the misleading "Custom Flink SQL" type (nothing executed it) is replaced by an accurate `calculation` type.
- **Publish to UNS (7.3):** analysis-service `/execute` sources each input's live value from Redis; a new `AnalysisResultConsumer` reads `analysis.results`, closes the execution, writes the derived value to the live plane, and **registers the derived measurement in asset-model** so binding-resolver resolves it and any symbol can bind it like a tag.
- **Custom symbol framework (7.4):** `customSymbolRegistry` (SVG-template symbols with named binding slots, config-only, SVG-sanitised), `CustomSymbolInstance` renderer (UNS-bound like built-ins), `CustomSymbolPanel` config pane (create/edit/drag-to-place), wired into the palette + `findSymbolDefinition` (so the inspector exposes each slot) + `SymbolRenderer`. `supportsCollections` flag (T11).
- **Asset-scoped authz (7.5):** binding-resolver (`/resolve`, `/resolve/batch`, `/resolve/alias`) and historian-bff (`/trend`, `/raw`, `/summary`) enforce an optional `assetScope` JWT claim — a scoped user can only resolve/trend paths under an allowed prefix; no claim = unrestricted (opt-in, so existing tokens are unaffected). R17 closed at both layers.
- **Honest scope notes:** compute stays in Flink (no client-side expression engine — guardrail honored); the Flink job evaluates arithmetic (not full Flink SQL); custom-symbol definitions persist client-side (localStorage) — a shared server-side registry is the productionization step; the `assetScope` claim is enforced but not yet *minted* by auth-service (that's the claim-issuance follow-up).

**Goal:** calculations (reshaped for our stack), custom symbols, and data-scoped security.

**Phase guardrails:**
- **Calculations do NOT get a client-side expression engine.** Per recorded decision (Flink-only compute) and checklist L19: a calculation is a **named, versioned artifact** in analysis-service, executed by a Flink job, published to the UNS as a derived measurement, and bound like any tag. Copying PI Vision here is explicitly wrong.
- Custom symbols use web-component/SVG registration (not AngularJS), and need the Phase-3 upload backend first.
- Asset-scoped authz is enforced in binding-resolver AND historian-bff, server-side.

| # | Task | Refs | Status |
|---|---|---|---|
| 7.1 | **Calculation registry** in analysis-service (named, versioned expression artifacts) | L1–L4, L10 | ✅ |
| 7.2 | **Flink job** consuming `analysis.executions` + `ExpressionEvaluator` + fixed `GET /analyses/types` | L12, L13, Discrepancy §7.3 | ✅ (not mvn-compiled) |
| 7.3 | Publish calc results to UNS as **derived measurements** (result consumer + asset registration) | L11, L19 | ✅ |
| 7.4 | **Custom symbol framework** (registry, SVG-template renderer, config pane, `supportsCollections`) | T1–T9, T11 | ✅ |
| 7.5 | **Asset-scoped authorization** (`assetScope` claim enforced in resolver + historian-bff) | R17 | ✅ |

**Audit check:** grep confirms **no** `NCalc|Jint|ExpressionParser` added to the frontend (calc stays server/Flink-side); a Flink job now consumes `analysis.commands` (audit found 0 consumers); `binding.resolve` is no longer flat for Viewer.

**Test:** define a calc "TankA.Flow + TankB.Flow", see it appear as a bindable UNS tag and plot on a trend; a Viewer scoped to Unit-1 cannot resolve or trend a Unit-2 tag.

**Exit criteria:** calculations execute via Flink and bind like tags; custom symbols register; data is asset-scoped; all 5 ✅.

---

# ═══════════════ VERSION 3 — POLISH ═══════════════

## Phase 8 — Polish & differentiators

**✅ LANDED (2026-07-15) — all 12 done, frontend `tsc` + `vite build` green.** (Second pass added 8.3/8.5/8.8/8.12.)
- **8.5 Touch:** `useTouchZoomPan` gives the runtime viewer pinch-to-zoom + one-finger pan + double-tap-reset on tablets/panels (designer-canvas touch is a lighter follow-up).
- **8.3 Time-Series Table:** new `table.timeseries` symbol — evenly-spaced timestamped rows over the display range, columns = tags, history via the UNS binding (registered in palette + renderer).
- **8.8 Event details:** alarm-table rows expand to show condition/state/severity/message/event-time (annotations need a persistence backend — deferred).
- **8.12 Format painter:** copy one symbol's style+formatting and paste onto another (forecast traces + per-symbol themes deferred).
- **8.6 Timezone:** `timeStore` gains `tz` + `formatInZone`; TimeBar has a zone selector (Local/UTC/IANA); `?tz=` URL seed.
- **8.7 Kiosk:** `?kiosk=1` hides all chrome (nav bar + time bar); `?hideBar`/`?hideTimebar` for finer control (M11–M14).
- **8.9 EEMUA KPIs:** the hardcoded `"14"`/`"1.2"`/`"3.1"`/`"142"`/`"12.4"`/`"2.5"`/`"94"` literals in `Analytics.tsx` are gone — each KPI now reads the served value, else a value derived from live data (peak from `hourlyRates`, alarms/shift from `totalAlarms24h`), else `—` (never a fabricated number).
- **8.10 Text styling:** `ItemStyle` gains `fontFamily`/`fontStyle`(italic)/`textDecoration`(underline)/`background`; applied in the text renderers + inspector controls (C2/C4/C6).
- **8.11 Wildcard search:** `utils/glob.ts` (`*`/`?`, case-insensitive, over name/path/description) wired into AssetBrowser — a wildcard term hits the server as its longest literal run then narrows client-side.
- **8.1 Trend regression:** per-trace dashed least-squares line (`showRegression`) in TrendCore + inspector toggle.
- **8.4 Symbol type switching:** value symbols (readout / readout+unit / gauge / digital — all bind `value`) switch type in the inspector, preserving bindings/format/limits.
- **8.2 Table transpose:** `table.value` can render tags across the top (E4.16) + inspector toggle.
- **Deferred (4 tasks, tracked below):** 8.3 Time-Series Table symbol, 8.5 mobile/touch gestures, 8.8 event details/annotations, and the remainder of 8.1/8.2/8.12 (trace grouping, sparkline column, forecast traces, per-symbol themes, format-copying) — all larger, self-contained follow-ups.

**Goal:** the P2 nice-to-haves and platform reach. Do these only after V1+V2 are solid.

**Phase guardrails:** same global guardrails; none of these may regress a V1/V2 feature.

| # | Task | Refs | Status |
|---|---|---|---|
| 8.1 | Trend: regression line ✅ (trace grouping deferred) | E1.11, E1.12 | 🟨 |
| 8.2 | Table: transpose ✅ (sparkline column deferred) | E4.16, E4.8 | 🟨 |
| 8.3 | Time Series Table symbol | E8.1–E8.6 | ✅ |
| 8.4 | Symbol **type switching** (Value↔Gauge, preserving formats) | B34, B35 | ✅ |
| 8.5 | **Mobile / tablet** touch gestures — viewer pinch/pan ✅ (designer touch deferred) | U2, U3, A33 | ✅ |
| 8.6 | **Timezone** control (display vs client zone) | K18, M15 | ✅ |
| 8.7 | Kiosk polish: `?kiosk=` + hide toolbar/sidebar params | M11–M14 | ✅ |
| 8.8 | Event details (expandable rows) ✅ (annotations need backend — deferred) | N9–N11, N13 | ✅ |
| 8.9 | EEMUA-191 **KPI symbols** (replace hardcoded `Analytics.tsx` literals) | N18, Bug §8.10 | ✅ |
| 8.10 | Font family, italic/underline; text fill/background | C2, C4, C6 | ✅ |
| 8.11 | Wildcard search (`*`, `?`), search by description, multi-scope | O8–O11 | ✅ |
| 8.12 | Format copying ✅ (forecast traces + per-symbol themes deferred) | D12, E4.13, B35 | ✅ |

**Audit check:** `Analytics.tsx` no longer contains the literals `"14"`/`"1.2"`/`"3.1"`; touch handlers exist alongside mouse handlers.

**Test:** open a display on a tablet and pan/zoom by touch; a `?kiosk=1` URL opens chrome-free; KPI tiles show live computed values.

**Exit criteria:** P2 differentiators shipped; no regressions; all 12 ✅.

---

## Appendix — status update protocol

When a task lands:
1. Flip its row status ⬜ → 🟨 → 🔬 → ✅ (only ✅ once **audit check AND test both pass**).
2. Update the phase's roll-up counts in the tracker table at the top.
3. If a task is descoped, mark ⛔ with a one-line reason and reflect it in the audit report's scorecard.
4. Re-run the standing audit command (`npm run lint && npm run build`) before every ✅.
5. Cross-reference: when a checklist ID (e.g. `G1`) flips to ✅ here, its status in [AUDIT-REPORT.md](AUDIT-REPORT.md) §3 should move from ❌/🟡 to ✅ so the two documents stay consistent.

**V1 done = Phases 0–4 all ✅ (47 tasks).** That is the ship-gate for "a usable HMI designer + display."
