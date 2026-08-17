# UI pages review checklist — the non-CPM surfaces

Companion to the completed Loop Performance module review (commits `cf7c83c..1d7f9a9`,
2026-08-17/18, all 12 `/cpm/*` pages). This file inventories **every other page** of
`src/frontend-ob` and seeds each with (a) findings already confirmed by grep/live
reconnaissance and (b) the recurring bug classes that review established, so each page
gets the same treatment: **review → fix → build → validate → deploy → API-test → commit**.

Legend: `[ ]` unreviewed · `[~]` recon evidence attached, not yet reviewed in depth · `[x]` reviewed & fixed.

---

## The recurring bug classes (check these on EVERY page first)

Established across ~90 findings in the CPM review; each class was found 3+ times.

| # | Class | The fix pattern |
|---|-------|-----------------|
| K1 | **Fetch failure rendered as empty state** ("no data" for a 500/403) | `QueryError` from `components/Cpm/shared.tsx` (or equivalent), with retry; 404-with-meaning stays an empty state |
| K2 | **Bare `toLocaleString`/`toLocaleTimeString`** — no zone label while exports write UTC ISO (P2-13) | shared `fmtDateTime` |
| K3 | **`setSearchParams` without `{replace:true}`** for in-page selection — Back-button flooding | `replace: true` on selection/filter params |
| K4 | **Case-sensitive deep links + silent fallback** — `?id=` that doesn't match shows a *different* record under that URL | case-insensitive match + an explicit "not found / fell back" state |
| K5 | **Capped/ordered fetch presented as the whole fleet** (top-N slice labelled "all") | raise to server max, name the basis in the caption, or aggregate server-side |
| K6 | **Hardcoded facts the API serves** (grids, window shapes, gate counts, TTLs) | render from the served contract; never assert a constant the page can't know |
| K7 | **Engine qualification flags ignored** (`sufficient_data`, `long_metrics_qualified`) — zeroed placeholders shown as measurements | gate display on the flags |
| K8 | **echarts stacked helper series leak into tooltips** (envelope min/band) | tooltip formatter filtering helpers, reporting real min–max |
| K9 | **Substring error classification** (`message.includes('403')` — matches URLs containing 403) | `err instanceof ApiError && err.status === 403` |
| K10 | **`String(error)`** rendering ("Error: …" prefix, loses ApiError's friendly detail) | `err instanceof Error ? err.message : String(err)` |
| K11 | Mouse-only rows (`onClick` without keyboard), Enter-only handlers | `role`, `tabIndex`, Enter **and** Space, `aria-pressed` |
| K12 | Mode/quality vocabulary re-derived locally (`=== 'AUTO'` vs real `AUT`/`CASCADE`) | shared `classifyMode` / `qualityLabel` |

Recon result 2026-08-18: **no bare `fetch()` bypassing `apiFetch`** and **no K12
violations** outside CPM — those two classes are clean app-wide. K3 has exactly **one**
non-CPM occurrence. K2 has **12 files** (counts below).

---

## Priority 1 — operator-facing alarm surfaces

### [~] `/alarms` — Alarm Console (`components/AlarmConsole/`)
The core ISA-18.2 surface (ag-grid, ack/shelve/suppress). Highest stakes, deepest page.
- [ ] K2: `ShelveDialog.tsx` ×2 bare `toLocale*` — shelve-until timestamps, operator-legal territory
- [ ] Ack/shelve/suppress mutation errors: verify failures surface (not silently dropped) and map to ISA-18.2 states per `conversion.md`
- [ ] Verify blink-while-unacknowledged → steady-on-ack uses OpenBridge alert tokens end-to-end (skill §5)
- [ ] Filter/sort state: deep-linkable? K3/K4 sweep
- [ ] ag-grid virtualization vs. the live alarm rate — dropped-frame check under `-InjectLabEvents`
- [ ] `alarm-console.css` / `ag-theme-openbridge.css`: verify token usage against the real OpenBridge palette (remember: `--divider-color` etc. are *aliased* in `designTokens.css`, not dead)

### [~] `/dashboard` — Dashboard (`components/Dashboard/`)
- [ ] K2 ×2
- [ ] `slice(0, 10)` of `liveAlarms` — verify the panel is labelled as "latest 10", not as the alarm load (K5)
- [ ] KPI tiles: source + failure rendering (K1); verify counts aren't client-derived from capped fetches
- [ ] Uses `T` theme tokens — confirm no raw hex leaked back in

### [~] `/live-events` — Live Events (`components/LiveEvents/`)
- [ ] K2: `MqttAlarmListItem.tsx` ×2, `MqttLiveStream.tsx` ×1, `shared/LiveEventStream.tsx` ×1
- [ ] Firehose subscription lifecycle: verify `subscribeFirehose`/`unsubscribeFirehose` ref-counting on unmount (W10 scoping)
- [ ] Ring-buffer caps honest in the UI (buffer size shown vs. implied completeness)
- [ ] Uses shared `ListPager` ✓ (already migrated) — confirm no regression

### [~] `/soe` — Sequence of Events (`components/Soe/SoePanel.tsx`)
- [ ] SOE ordering is the product here: verify sort is by event time (not arrival), ties stable, and the basis stated
- [ ] K1/K2/K3 sweep; export (if any) carries zone-labelled or ISO timestamps consistently
- [ ] Uses shared `ListPager` ✓ — confirm

## Priority 2 — historical / analytics surfaces

### [~] `/historical` — Alarm Historical Viewer (`components/HistoricalViewer/`)
- [ ] K2 ×2
- [ ] Range selection: from<to validation, drafts follow applied range (Historical-page pattern from CPM H5/H7)
- [ ] K5: page caps on history queries named when hit
- [ ] Cross-link: alarm → SOE/trend drill-through exists?

### [~] `/analytics` — Alarm Analytics (`components/Analytics/Analytics.tsx`)
- [ ] K2 ×1
- [ ] Export filename builds from `toISOString` ✓ (fine); verify exported rows carry the caps/truncation marker if the source query is capped (CPM H4 pattern)
- [ ] Chart tooltips: has formatters ✓ — verify none of the stat tiles derive "fleet" claims from capped queries (K5)
- [ ] KPI definitions: verify served, not hardcoded (K6)

### [~] `/iotdb-trend` — IoTDB Trend Viewer (`components/IoTDBTrend/`)
- [ ] **Known**: series dropdown lists ALARM devices only (`IOTDB_ALARM_PREFIX` discovery) — loop/`cpm` paths must be hand-typed. Either add prefix scopes (alarms / cpm / process) or state the scope in the UI
- [ ] K2 ×1
- [ ] `?series=` deep link: K4 sweep (unknown series → clear message, not empty chart)

### [x] `/trend` — Trend page (`components/Designer/TrendPage.tsx`)
Custom from/to windows + CPM handoffs shipped in the CPM review. Remaining:
- [ ] **Known gap (deliberate, platform-scope)**: no tag picker — arriving without `?tags=` gives zero pens and no way to add one from the UI. Needs a UNS browse/search picker (Designer-module feature)

## Priority 3 — Designer / displays module

### [ ] `/displays` — Display Launcher (`components/Designer/DisplayLauncher.tsx`)
- [ ] K1/K3/K4 sweep; folder filter state; personal-view vs controlled listing honest (two-tier rule)

### [~] `/designer` — Display List (`components/Designer/DisplayList.tsx`)
- [ ] K2 ×1 (modified-at timestamps)
- [ ] Delete/publish confirmations; error surfacing on save conflicts (K10)

### [ ] `/designer/:id` — Display Designer (`components/Designer/DisplayDesigner.tsx`)
The deepest surface outside alarms. Review with `openbridge` skill loaded; honor CQRS
(displays are configuration only — no process values in snapshots).
- [ ] Binding picker: resolves through binding-resolver only; now that loop signals project into the UNS (Option C), verify loop tags appear and bind correctly
- [ ] Save/publish error paths (K10); dirty-state guard on navigation
- [ ] Symbol palette: manifest-verified components only (no invented `obc-*`)

### [ ] `/display/:id` + `/my-view/:id` — Display Viewer (`components/Designer/DisplayViewer.tsx`)
- [ ] Live binding failures render distinctly from "no data" (K1 at symbol level — NE107 quality states, not blank)
- [ ] W10 scoping: per-screen subscriptions only, unsubscribed on close
- [ ] `SymbolRenderer.tsx` K2 ×2

### [ ] `/designer/import` — PI Vision import (`components/Designer/ImportPage.tsx`)
- [ ] Error handling uses `.message` ✓ (recon) — verify import result reporting (per-item outcomes, partial-failure honesty, like Registry's CSV import)

## Priority 4 — infrastructure / admin

### [~] `/edge` — Edge Node Monitor (`components/EdgeNodeMonitor/`)
- [ ] K2 ×1
- [ ] Health polling: failure vs. degraded distinction (K1); staleness of last sample stated

### [~] `/admin/audit` — Audit Explorer (`components/Administration/AuditExplorer.tsx`)
- [ ] **CONFIRMED (recon)**: `String(message).includes('403')` at line ~127 — the exact
      substring bug Governance fixed for itself (K9); a request URL containing "403"
      misclassifies an outage as a permission problem. Fix: `ApiError.status === 403`
- [ ] Chain-verify affordance parity with Governance (it exists there; should it here?)

### [~] `/admin/users` — User Management (`components/Administration/UserManagementConfig.tsx`)
- [ ] K2 ×1 (last-login timestamps)
- [ ] Uses `extractApiError` ✓ — pattern looks healthy; confirm mutation error paths

### [ ] `/admin/roles` — RBAC (`components/Administration/RolesConfig.tsx`)
- [ ] Sequenced error handling via `extractRoleApiError` ✓ — verify race guards (`loadSeq`) on rapid role switching
- [ ] Catalog parity: permission list served from auth-service catalog, not hardcoded (K6)

### [ ] `/admin/alarm-feed` + `/admin/opc-servers` — Alarm Feed / OPC (`AlarmFeedConfig.tsx`)
- [ ] Same component serves both routes — verify the tab highlights correctly for each
- [ ] Connection-test results honest (failure ≠ empty)

### [ ] `/admin/alarm-rules` — Alarm Rules (`AlarmRulesConfig.tsx`)
- [ ] Rule mutation errors; suppression-by-design gated on engineering permission (ISA-18.2)

### [ ] `/admin/notifications` — Notifications (`NotificationsConfig.tsx`)
- [ ] Delivery-test path honest; secrets never echoed

### [ ] `/admin/system` — System Settings (`SystemSettingsConfig.tsx`)
- [ ] `system.manage` gating verified; destructive actions confirmed

### [ ] `/login` — Login (`components/Login/Login.tsx`)
- [ ] Failure messaging (lockout vs bad-credentials vs service-down distinct); no K-class findings expected

---

## Method per page (the CPM cadence)

1. Read the page + its hooks/API client end-to-end (full vertical slice where it owns one).
2. Sweep K1–K12 with the greps in this file's header commit.
3. Report findings → fix approved items → `tsc` + `eslint --max-warnings 0` + `npm run build`.
4. `docker compose build ams-frontend && up -d` → verify container healthy + bundle carries a marker string.
5. API-test the endpoints the page reads (in-network curl with `X-Auth-*` headers).
6. Commit per page/batch with the findings in the message; push to `main`.

## CPM module coverage gaps (backend/jobs — carried from the module review)

The CPM review covered UI, controllers, schemas, and Flink *structure* in depth; these
are the layers it did **not** cover, ordered by value. Same cadence: review → fix →
build → validate → test → commit.

- [x] **GAP-1 — Execute a real A8 recompute end-to-end.** DONE 2026-08-18:
      submitted on G13_LOOP_A → Flink batch FINISHED/succeeded → fresh rows in
      `analytics.cplm_gate_results` with `source='flink-historical-replay'` and
      `replay_id=208822d8a3fb` stamped. Verdict INSUFFICIENT_DATA at 0.00 —
      correct: the lab's raw data island ended Aug 13, so the recent window has
      too few samples. Mechanism proven; result honest.
- [x] **GAP-2 — Review the Kafka→Postgres consumers.** DONE 2026-08-18. Both
      sound: StoreOffset only after successful persist (poison JSON skips +
      advances; DB errors retry), idempotent upserts with a fuller-window guard,
      static membership + sole-member assertion, P1-8 null semantics, IoTDB
      dual-write verified non-throwing (NonQueryAsync catches all → false), and
      the frames episode logic converges under at-least-once redelivery.
      **One fix shipped**: the frames self-healing DDL lacked the 42-script
      `lower(loop_id)` indexes — a service-healed database would seq-scan the
      events list (the exact defect B2 fixed). Added + deployed. Minor notes:
      `window_count` can overcount on retried redeliveries (informational
      field); a malformed no-diagnosis result closes open frames (rare).
- [x] **GAP-3 — Review the small cplm-api services.** DONE 2026-08-18.
      `SingleMemberGuard`: real partition-count comparison per assignment,
      CRITICAL log + /health surfacing, deliberately non-throwing (dying would
      hand partitions to the duplicate and hide the split) — it does what the
      CLAUDE.md trap demands. `ConsumerHeartbeat`: per-consumer phase+beat every
      500ms poll, surfaced with a stalled flag (P3-11). `CplmAuditEmitter`:
      best-effort BY DESIGN — failed emit logs and drops, never blocks the
      operation it records (matches display-service's emitter).
- [~] **GAP-4 — Scripted E2E suites: CLASSIFIED STALE (pre-lockdown), not run.**
      Verified 2026-08-18: they target `127.0.0.1:8000` (ams-api publishes no
      host port since Plan 04 — confirmed against the running container) with
      `Authorization: Bearer dev` (edge-only auth rejects it). Same staleness
      class as `tests/integration`. They also test the ALARM ack pipeline, not
      CPM. The CPM-side E2E is the GAP-1 recompute round trip (historian →
      normalize → gates → Postgres), executed live. Porting the alarm E2E to the
      gateway-auth world remains a cross-cutting item below.
- [ ] **GAP-5 — Flink math internals**: `CplmGateEngine` / fusion scoring were
      regression-covered (30/30 incl. golden-loop gate) but not re-reviewed
      line-by-line. Only worth a pass with a concrete suspicion or a reference
      dataset to pin against.
- [ ] **GAP-6 — Gateway route map audit**: `docs/api-gateway.md` was trusted, not
      verified against the nginx/gateway config (`/api/v1/cpm` → cplm-api:5000,
      `/api/hist` → historian-bff:8090, header stripping of client-supplied
      `X-Auth-*`).
- [ ] **GAP-7 — Browser-level interaction pass**: all review testing was API and
      bundle-level; rendering was verified via screenshots only. A click-through
      of the 12 CPM pages in a real browser (both themes, one narrow viewport).

## Known cross-cutting items (not per-page)

- [ ] `tests/integration` binding-resolver suite targets pre-lockdown anonymous `localhost:5001/5002` — port to gateway-auth world or retire
- [ ] `B2_027PIC` onboarded with dotted IoTDB-style tag paths — works via exact-match, odd UNS citizenship; re-onboard with slash paths when convenient
- [ ] Rankings-derived aggregates cap at 200 loops — server-side aggregation endpoint when a real fleet approaches that
- [ ] `useLoopLive.ts` still carries its own `deviceOf` sanitizer (hyphen-keeping, matches edge node) — correct today; keep in step with `AlarmMetricPublisher` if either changes
