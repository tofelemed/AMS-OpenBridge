# Phase 7 — CPLM Frontend Checklist (CPA parity in frontend-ob)

**Date:** 2026-08-05 · Source of truth for screen parity: `CPA/CPA webpage` (Next.js prototype, twelve screens).
Secondary reference for real-API field names: `CPA/CPAMAIN/docs/reference/cpmsuite-contract/pages`.

**Goal:** rebuild the CPA prototype's exact information architecture — every screen, sub-screen,
widget, column, and interaction — inside `src/frontend-ob`, wired to the real Phase 3–6 API.

## Ground rules (non-negotiable)

- [ ] **OpenBridge only.** Every component/color/spacing from `@oicl/openbridge-webcomponents-react`
      (per-path imports) + OpenBridge CSS tokens. Resolve every component/prop/slot from
      `node_modules/@oicl/openbridge-webcomponents/custom-elements.json` — if it isn't in the
      manifest it doesn't exist. Read `openbridge-agent-rules.md` (or invoke the `openbridge`
      skill) **before writing the first component**. The CPA prototype's hand-written CSS,
      Geist fonts, lucide icons and light-only palette do **not** transfer; its layouts,
      labels, and flows do.
- [ ] **Icons:** `Obi*` only. Map lucide → Obi at the nav/table level (e.g. `CircleGauge`→gauge-ish
      Obi icon; pick from the manifest, don't guess).
- [ ] **Theming:** CPA is light-only; ours must honor `data-obc-theme` (day/dusk/night/bright).
      All tone colors (`good|warn|bad|muted`) map to OpenBridge alert/status tokens — the CPLM
      band vocabulary (PASS/WARN/EXCLUDED/SUSPECTED/CONFIRMED) maps per `conversion.md`
      (ISA-18.2 alert mapping). No raw hex.
- [ ] **Toasts/alerts:** the CPA `notify()` toast is replaced by OpenBridge alert/notification
      components — no custom banners (repo rule).
- [ ] **Typed API layer (plan 7.1):** new `src/api/cpmApi.ts` over `apiFetch` with TS types
      mirroring the C# DTOs, consumed **only** through `@tanstack/react-query` hooks in
      `src/hooks/useCpm*.ts`. No raw `useEffect`+`Promise.all` (the TrendCore anti-pattern).
- [ ] **Real routes.** The prototype has no router (label-string switch). Every screen gets a URL;
      every toolbar select (loop, window, gate, range) becomes a query param so views deep-link.
- [ ] **Permissions:** reads `analytics.view`; mutations (ack/shelve/onboard/recompute)
      `cpm.manage`; U11 admin actions `system.manage`. Nav entries carry the same permission as
      their route guard (existing `navItems` rule).
- [ ] **Charts:** echarts (already in the repo) replaces the prototype's hand-drawn canvas.
      Trend charts reuse/extend `TrendCore` with the new `?envelope=true` (min/max band + avg
      line) so oscillation renders truthfully.

## Foundation work (build first — F0)

- [ ] **F0.1 Routes + nav group.** New sidebar group `Loop Performance` (order after Analysis):
      `/cpm` (U1 Overview) · `/cpm/explorer` (U2) · `/cpm/performance` (U3) · `/cpm/events` (U4)
      · `/cpm/investigation` (U5) · `/cpm/historical` (U6) · `/cpm/windows` (U7)
      · `/cpm/replay` (U8) · `/cpm/calculations` (U9) · `/cpm/registry` (U10)
      · `/cpm/pipeline` (U11) · `/cpm/governance` (U12). Route guards + matching nav permissions.
- [ ] **F0.2 `cpmApi.ts`** — typed client for: `GET /cpm/loops`, `GET /cpm/loops/{id}`,
      `POST /cpm/loops/activate`, `DELETE /cpm/loops/{id}`, `POST /cpm/loops/{id}/republish-evidence`,
      `POST /cpm/loops/{id}/recompute`, `GET /cpm/replays/{id}`, `GET /cpm/registry-contract`,
      `GET /cpm/loops/{id}/gates/latest`, `GET /cpm/loops/{id}/gates`, `GET /cpm/loops/{id}/kpis`,
      `GET /cpm/resolutions`, `GET /cpm/fleet/summary|rankings|heatmap`,
      `GET /cpm/loops/{id}/readiness`, `GET /cpm/pipeline-status`, `GET /cpm/events`,
      `POST /cpm/events/{id}/acknowledge|shelve`, `GET /cpm/calculations`,
      historian `GET /trend?envelope=true`, `GET /raw/cursor`, `GET /snapshot`.
- [ ] **F0.3 Shared CPM components** (all OpenBridge-based):
      - [ ] `TonePill` — the `good|warn|bad|muted` dot+label pill (status token colors).
      - [ ] `GateStatusCell` — ✓/!/×/■/— glyph cell with tone (used by U3 matrix + U5 chain).
      - [ ] `CpmDataTable` — thin wrapper (ag-grid or obc table per manifest) with the CPA
            grid-column pattern.
      - [ ] `KpiTile` — caption/value/sub/tone tile (U1, U3, U9, U11).
      - [ ] `WorkspaceHeader` — eyebrow/title/copy/actions row.
      - [ ] `GateEvidenceDrawer` — right-side drawer; content driven by `GET /cpm/calculations`
            gate definitions + the selected loop's `gates/latest` payload.
      - [ ] `LoopSelect` — loop dropdown fed by `GET /cpm/loops` (used by U5–U9 toolbars).
      - [ ] `RelationshipMap` — lineage strip (source → loop → pack → outputs), real edges from
            asset-model `/assets/{id}/relationships`.
- [ ] **F0.4 Command palette** (⌘K actually bound): searches loops (`GET /cpm/loops`) +
      calculations (`GET /cpm/calculations`) + nav items; Loop→Explorer, Calc→Calculations.
- [ ] **F0.5 Live plane hook** `useLoopLive(loopId)` — resolves the loop device via
      binding-resolver, `mqttStore.subscribeScreen` on the loop's Sparkplug device
      (pv/sp/op/vp/mode metrics + quality property), snapshot-on-open already handled in store.

## Per-screen checklists

### U1 — Overview (`/cpm`)
- [ ] KPI row: score card (`Plant health` meter) + 4 tiles (`Loops in service`, `Need attention`,
      `Bad actors`, `Data confidence`) ← `GET /cpm/fleet/summary` (loops.total/monitored,
      diagnoses counts, capability caveats). "Data confidence" = completeness avg (short features).
- [ ] **Live Flink runtime panel** (events/s, watermark, 4 window-progress bars with countdowns,
      stream-flow stages) ← `GET /cpm/pipeline-status` + Flink REST proxy (see Data gaps DG-1);
      1 s tick for countdowns computed client-side from window boundaries.
- [ ] **Rolling-window ribbon** (5 emitted + 1 collecting card, dropped/retained/added transition
      blocks, segmented 5m/30m/60m) ← `GET /cpm/loops/{id}/kpis` window ends per resolution;
      countdown client-side.
- [ ] Priority queue table (Loop & service | Health | Finding, 6 rows) ← `fleet/rankings`;
      row click selects loop focus panel (no nav).
- [ ] Loop focus panel: signal row (PV/SP/OP/MODE/QUALITY ← `useLoopLive` + snapshot),
      8 h trend (TrendCore, `envelope=true`), `Open analysis →` opens **focused-loop drawer**.
- [ ] Focused-loop drawer: diagnosis card + evidence path rows ← `gates/latest` (real gate
      statuses, not the hardcoded seven); `Continue in Explorer →` navigates with `?loop=`.
- [ ] Insight card (highest-impact finding + confidence meter) ← top of `fleet/rankings`.
- [ ] Event trail (3 recent) ← `GET /cpm/events?openOnly=false&limit=3`.

### U2 — Explorer (`/cpm/explorer?loop=`)
- [ ] Left asset tree: plants→loops from `GET /cpm/loops` grouped by `site`/`area`;
      **make the tree search actually filter** (prototype's is inert).
- [ ] Hero header: tag/service/plant + issue pill + health.
- [ ] Tabs (5): `Summary` · `Signals` · `Calculations` · `Relationships` · `History` (tab in URL).
- [ ] Summary: live operating state (useLoopLive) + 8 h trend + Context kv
      (template/dynamics class/profile/source/owner ← registry + `gates/latest.metadata`).
- [ ] Signals table (Role|Meaning|Value|Quality|Time-series path) ← loop `tags` map +
      binding-resolver resolution (show **Provenance**; fallback = warning row).
- [ ] Calculations tab ← `GET /cpm/loops/{id}/gates/latest` metric fields (per-gate rows).
- [ ] Relationships ← `RelationshipMap` with real asset edges.
- [ ] History ← `GET /cpm/events?loopId=&openOnly=false` timeline.
- [ ] Header actions: `Add to watchlist` (local store), as-of button (defer; DG-6).

### U3 — Performance (`/cpm/performance`)
- [ ] KPI tiles: Fleet OCE / Median MAE / Loops oscillating / Potential savings ←
      summary + rankings aggregates (savings: DG-5, show `—` until model exists).
- [ ] **Runtime heatmap** (loops × 2 h periods × metric toggle Health/OCE/Stiction, tone
      thresholds + legend) ← per-loop `GET /cpm/loops/{id}/gates?windowKind=12h` history
      (client-side pivot) — or DG-2 fleet time-heatmap endpoint if too chatty.
- [ ] **Gate status matrix** (Loop + G0…G15+G2r columns, grouped header
      Eligibility|Performance|Diagnostic evidence|Confirmation|Fusion, Result column) ←
      `GET /cpm/fleet/heatmap` (exact fit). Row select + cell click opens Gate Evidence Drawer.
- [ ] Selection summary bar (warnings count, blocking count, final diagnosis, `Open evidence ›`).
- [ ] **Gate evidence drawer**: result strip, contract grid (window/role/result id/emitted),
      Purpose/Formula/Fusion behaviour/Required evidence ← `GET /cpm/calculations` definitions
      + selected loop `gates/latest`; `Open in Evidence Replay` **actually navigates**
      (`/cpm/replay?loop=&gate=`).
- [ ] Opportunity ranking (sortable Health|Confidence, top 8) ← `fleet/rankings`.
- [ ] Guide card (static copy).
- [ ] Range segmented 24h/7d/30d **actually filters** (history `from=`).

### U4 — Events (`/cpm/events`)
- [ ] Filter bar: All/Open/Unacknowledged/Acknowledged/Closed + severity filter + count ←
      `GET /cpm/events` params (ack_state/openOnly mapping).
- [ ] List (Event | Severity | State | Time) ← event frames (family, peak_diagnosis,
      peak_confidence, ack_state, opened_at).
- [ ] Detail aside: what happened / interpretation / Evidence kv (gate family, calculation
      version, confidence, owner) — from the frame row, **not hardcoded**.
- [ ] Actions: `Acknowledge` → `POST /cpm/events/{id}/acknowledge`; `Shelve` → shelve **with
      required until** (OpenBridge dialog + duration picker; the API rejects shelves without
      expiry). Optimistic update via react-query invalidation.
- [ ] Live refresh: react-query polling (30 s) + refetch on ack/shelve.
- [ ] **OpenBridge alert components** for severity/state rendering (repo rule; U4 explicitly).

### U5 — Investigation (`/cpm/investigation?loop=&window=`)
- [x] Analysis-type library chips (7 cases) — derived from the loop's actual latest verdict
      (diagnosis/EXCLUDED_*/INSUFFICIENT_* → case id), clickable to filter loops by case.
- [x] Controls: LoopSelect + Live/Historical segmented; historical from/to + profile select +
      `Load historical evidence` ← `gates?from=&to=` (real, no fake 650 ms).
- [x] Final-conclusion card (code/outcome/summary/badge) ← `gates/latest`
      (`diagnosis`, `insufficientEvidenceReason`, `observabilityFlags`, `familyDisqualifiers`).
- [x] Key-facts tiles ← metric fields (freeze index, stiction score, selected family, …) from
      the gates payload.
- [x] Evidence chart (PV/SP/OP + highlighted region + x labels) ← `/trend?envelope=true` over
      the selected window; region annotations from gate reasons where derivable.
- [x] Reasoning chain (4 steps + machine-reason code) ← gate statuses mapped to the
      Eligibility→Evidence→Fusion narrative; machine reason = `insufficient_evidence_reason`
      or the family disqualifier string.
- [x] Hypothesis comparison ← family scores from payload (`family_score`,
      `raw_final_element_score`, detector scores).
- [x] Next-best action panel + `Create investigation case ›` (creates a note on the event frame;
      full case-management = DG-7).
- [x] Window browser (5 window cards + transition + delta table PREVIOUS/CURRENT) ←
      `gates` history rows; delta computed client-side between adjacent windows.

*U5 build notes (S6): historical evidence is selected from the loop's real evaluated
windows (a window picker over `gates` history) rather than free from/to inputs — same
data, no way to pick a range that was never evaluated. Chart region annotations from
gate reasons were not derivable reliably and are omitted rather than guessed.*

### U6 — Historical explorer (`/cpm/historical?loop=&from=&to=&kpi=`)
- [x] Toolbar: LoopSelect, from/to datetime, KPI overlay select (Stiction probability /
      Effort ratio / IAE / FFT peak ratio), `Apply range`.
- [x] Synchronized chart: PV/SP/OP (envelope trend) + KPI overlay ← `/trend?envelope=true` +
      `GET /cpm/loops/{id}/kpis` series aligned on time.
- [x] **Diagnosis band track** (clickable segments Normal/Developing/Suspected/Recovering with
      gate + note) ← `gates` history: band = diagnosis class per window; click moves cursor.
- [ ] Quality/mode track ← `/raw/cursor` on mode+quality measurements (coarse ribbon).
      *Deferred from S5: the raw cursor pages at 5000 points (~7 h at the 5 s grid), so a
      multi-day ribbon from the first page alone would misrepresent coverage; needs a
      decimated mode/quality read (S7 or historian-bff aggregation).*
- [x] Selected-period card (profile, window, completeness, confidence + `Replay this period ›`
      **actually navigates** to U8 with params).
- [x] Maintenance correlation panel — DG-3 (no CMMS): render panel with empty-state copy.
- [x] `Export evidence` → download JSON/CSV of the queried windows (client-side).

### U7 — Window inspector (`/cpm/windows?loop=&profile=`)
- [x] Toolbar: LoopSelect + window profile select (1m/5m/10m/15m/30m/60m from
      `GET /cpm/resolutions` + 4h/12h/24h) + live watermark chip (DG-1 proxy).
- [x] Emitted-window list (5 recent, result id, state pill) ← `kpis?resolution=` rows.
- [x] Window metadata grid: boundary semantics `[start,end)`, size, slide, expected vs actual
      samples, completeness, allowed lateness ← short/long feature rows
      (`sample_count`, `completeness`, window bounds); late/out-of-order counts = DG-4 (show `—`).
- [x] Sample-density bar (used/late/excluded) ← `/raw/cursor` bucket counts vs expected;
      excluded = bad-quality count from G0 fields.
- [x] Window contract strip (dropped/retained/added) — computed from profile size/slide.

### U8 — Evidence replay (`/cpm/replay?loop=&window=&gate=`)
- [x] Toolbar: LoopSelect + emitted-window select (`gates` history) + gate select
      (all 17, from `/cpm/calculations`) + role pill.
- [x] Transformation stepper (Raw→…→Calculated) — cosmetic stages retained; chart shows
      raw (`/raw/cursor`) vs evaluated (5 s grid) series.
- [x] Evidence chart with replay cursor slider; ACF/phase-plane variants for G5/G6/G9/G14
      (echarts, computed client-side from raw samples — or metric fields from payload).
- [x] Summary aside: latest value/threshold/window/role/profile/result-id + Formula/Purpose/
      Fusion ← `/cpm/calculations` + `gates/latest` metrics.
- [x] Input lineage strip (IoTDB raw → normalization → gate → G15) — static structure, real ids.
- [x] **Recompute integration:** `Re-run this window` → `POST /cpm/loops/{id}/recompute` +
      poll `GET /cpm/replays/{id}` → refetch gates on FINISHED (this is A8; ~1 min round trip).
- [x] Engineer note textarea → stores as note on the loop's open event frame (`note` field).
- [x] `Export package` → client-side JSON bundle (gates payload + raw slice + versions).

### U9 — Calculations (`/cpm/calculations?loop=`)
- [ ] Loop selector panel + facts strip (health/dynamics/latest window/issue).
- [ ] Stat tiles (results count / 17 gates incl. G2r / acceptable / review / unavailable) ←
      computed from `gates/latest` statuses + metric presence.
- [ ] Catalog: search + gate filter + type filter + pagination (12/page); columns
      `ID | Calculation | Gate | Window | Latest value | Acceptable | Assessment` ←
      `GET /cpm/calculations` (17 gate definitions + observedInResults) **joined with** the
      selected loop's `gates/latest` metric fields for latest values. The CPA 143-metric
      dictionary becomes: one row per payload metric field, grouped by gate (build a static
      metric→gate map from `CplmGateResult` fields; values live).
- [ ] Calc drawer: tabs Definition (formula/runtime config kv) · Dependencies (RelationshipMap)
      · Validation (checks incl. golden-test provenance) · History (loop events). Copy-definition
      + version stamps from A13 metadata.

### U10 — Loop registry (`/cpm/registry`)
- [ ] Draft-first banner (copy adapted: activation is immediate in our API — banner explains
      review states instead) — or implement draft state (DG-8 decision).
- [ ] Registry table: `Loop / service | Dynamic class | Structure | VP | Profile | State` ←
      `GET /cpm/loops` (loopType, tags.vp presence, threshold_profile_id, isActive/monitoring).
      Search filters tag+service+area.
- [ ] Profile detail aside: contract kv + **gate role policy table** (static role map) +
      supporting-only note + `Request governed change` (→ republish-evidence/DG-8).
- [ ] **Add-loop wizard (5 steps)** mapping to `POST /cpm/loops/activate`:
      Identity (tag/service/site/area/**loopType mandatory**) → Classification (dynamics class →
      `dynamicClassOverride`; structure/objective stored in engineering JSONB) → Signal mappings
      (PV/SP/OP/MODE required, VP optional — **exactly our validation**; QUALITY optional role) →
      Windows & profile (informational; thresholdProfileId) → Review (calls activate; show
      readiness result `GET /cpm/loops/{id}/readiness` as the post-save validation the CPA
      wizard promises).
- [ ] Duplicate-tag inline error ← check against loaded registry.
- [ ] **Bulk CSV import dialog**: header validation (14 columns), summary tiles, preview with
      per-row validation pills, template download; import = sequential `activate` calls with
      per-row result report (server bulk endpoint = DG-9 if volume demands).
- [ ] Peer links: add a `Links` column/section (our G13 capability; CPA lacked it) with
      `republish-evidence` action.

### U11 — Pipeline health (`/cpm/pipeline`)
- [x] Restricted banner (read-only copy).
- [x] KPI tiles: Jobs running (real count from `pipeline-status`), watermark lag, max Kafka lag,
      checkpoint success, managed state ← DG-1 Flink/metrics proxy.
- [x] Job table: `Service | Status | Latency | Backpressure | Parallelism` — one row per
      **required job** (7) from `pipeline-status` + DG-1 metrics. **Replace the fabricated
      SystemMonitor/EdgeNodeMonitor hardcoded panels — remove, don't extend (plan 7.7).**
- [x] `Run E2E verification` → recompute round-trip on a reference loop + report (cpm.manage).
- [x] Runtime telemetry chart (lag/checkpoint duration over range) ← DG-1.
- [x] Result delivery path strip (DCS→Kafka→Flink→IoTDB→UI) with real last-delivery age
      (`gates/latest.metadata.computedAt` vs now).

### U12 — Governance (`/cpm/governance`)
- [x] Audit stream ← audit-service `GET /api/v1/audit` (+ **A15 emitter**: CPLM onboarding/
      ack/shelve/recompute events → audit topic — the remaining Phase 5 leftover; build here).
- [x] Approval queue + detail + evidence checklist + Approve/Reject — **no server-side approval
      workflow exists** (DG-8): ship stage 1 as read-only governance view (audit + version
      history from `loop_config` + calculation versions), stage 2 adds an approvals table.
- [x] Separation-of-duties card (static, reflects real roles: Admin/Engineer/Operator/Viewer
      + cpm.manage/system.manage mapping).

## Data-gap register (server work Phase 7 needs)

| ID | Gap | Consumer | Plan |
|---|---|---|---|
| DG-1 | Flink metrics proxy (watermark lag, per-job latency/backpressure/parallelism, checkpoint stats, events/s) | U1 runtime, U7 chip, U11 | **DONE (S5):** `GET /cpm/pipeline-metrics` proxies `/jobs/overview` + `/jobs/{id}/checkpoints`; state/uptime/checkpoint age-duration-size per required job; watermark/events-s/backpressure listed in `unavailable[]` (honest) |
| DG-2 | Fleet time-heatmap in one call | U3 heatmap | Start client-side pivot over per-loop gate history; add endpoint if >20 loops |
| DG-3 | Maintenance/CMMS events | U6 panel | Empty-state; integration out of scope |
| DG-4 | Late/out-of-order counts per window | U7 | Not recorded by jobs today; show `—` (honest) |
| DG-5 | Savings model ($) | U3 tile | `—` until a $/loop model is configured |
| DG-6 | As-of config reconstruction | U2/U5 header | Defer (needs config versioning read API) |
| DG-7 | Investigation case management | U5 action | Notes on event frames now; cases later |
| DG-8 | Draft/approval workflow | U10/U12 | Stage 1: direct activate + audit trail; stage 2: approvals |
| DG-9 | Server-side bulk import | U10 | Client-side sequential activate first |

## Build order

1. **S1 Foundation** — F0.1–F0.5 (routes, api client, shared components, palette, live hook).
2. **S2 Registry + Events** (U10, U4) — onboarding is the gateway to everything else; events
   exercise ack/shelve. *Exit: onboard a loop via wizard, see it in registry, ack an event.*
3. **S3 Overview + Performance** (U1, U3 + both drawers). *Exit: fleet KPIs real; gate matrix
   cell → evidence drawer → “Open in Evidence Replay” navigates.*
4. **S4 Explorer + Calculations** (U2, U9). *Exit: tree → loop tabs all live; calc drawer
   shows real values + versions.*
5. **S5 Historical + Windows + Replay** (U6, U7, U8 + DG-1 proxy). *Exit: diagnosis bands from
   real windows; replay re-runs a window via A8 and refreshes.* ✅ **DONE** — plus the
   sidebar 'Loop Performance' nav group (routes existed but had no nav entries until S5).
6. **S6 Investigation + Pipeline + Governance** (U5, U11, U12 + A15 audit emitter;
   remove SystemMonitor/EdgeNodeMonitor fabricated panels). *Exit: reasoning chain from real
   flags; U11 shows 7 real jobs; audit stream live.* ✅ **DONE** — SystemMonitor deleted
   outright (its job table/latencies were invented and its /health/pipeline endpoint never
   existed, so it spun forever); EdgeNodeMonitor audited as REAL (MQTT + BFF health) and kept.
   The admin AuditExplorer was also a fabrication (3 hardcoded rows, fake standing
   "chain verified" banner, alert() verify) — rewired to the real /api/audit + verify.
   Gates payload numeric fields now ride the matrix as `metrics` + `narrative`
   (selected_family/status_reason/recommendation) for U5.
7. **S7 Polish** — command palette bindings, kiosk/timezone conformance with existing app,
   `npm run lint` clean (`--max-warnings 0`), typecheck, screen-by-screen parity pass against
   the CPA prototype.

## Verification per screen (definition of done)

- [ ] Every widget listed above renders with **real data** (or an explicit honest empty-state
      from the gap register — never fabricated numbers; the SystemMonitor lesson).
- [ ] Every button does something real (navigation, mutation, download) — no dead handlers.
- [ ] Deep link (URL with params) restores the exact view.
- [ ] Day + night themes render correctly (`data-obc-theme`).
- [ ] Permission-gated actions hidden without the claim.
- [ ] `npm run lint` + `tsc` clean.
