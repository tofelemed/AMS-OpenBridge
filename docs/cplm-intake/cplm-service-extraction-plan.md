# CPLM API Extraction — Task & Phase Checklist

**Date:** 2026-08-06 · **Goal:** move the CPLM/CPM API out of `AMS.Api` into its own
Traverse microservice (`src/services/cplm-api`, port **5006**) with its own logical
database (`traverse_cplm`) in the shared Postgres cluster — honoring the repo rule
*"one Postgres cluster, one Kafka, one EMQX, one IoTDB, but a separate logical database
per service"* (CLAUDE.md).

**Why now / why not:** nothing is functionally blocked by the current coupling. The real
payoff is deploying and scaling the CPLM write path independently of the alarm API, and
removing CPLM churn from the AMS.Api release blast radius. If independent scaling isn't
needed yet, this can wait — it does not unblock A12b or DG-8.

---

## Verified baseline (measured 2026-08-06, not assumed)

| Fact | Value | Why it matters |
|---|---|---|
| Files to move | 10 (`Cpm*`/`Cplm*`) | 5 controllers, 3 services, 2 background consumers |
| Lines of code | 2,975 | Small enough for a mechanical move |
| External type deps | `AMS.Infrastructure.Kafka`, `AMS.Api.Services.IotDbWriteClient` | Only two — see Phase 2 |
| Non-CPLM code touching `analytics.cplm_*` / `cpm.*` | **none** (only `Program.cs` DI wiring) | **The DB split is clean** |
| Cross-schema joins | 1, and both sides are CPLM-owned (`cplm_gate_results` ⋈ `cpm.loop_registry`) | No query rewriting needed |
| **Test coverage of CPLM** | **zero** — no test file references `Cpm`/`Cplm` | **No safety net. Phase 0 must build one.** |
| Tables / views | 7 base tables + 3 `_latest` views across `analytics.*` and `cpm.*` | Full inventory in Phase 1 |
| Live row counts | gate_results 550 · short 3,842 · long 755 · frames 41 · registry 2 · links 2 · tag_map 8 | Migration must preserve these exactly |
| Kafka consumer groups | `ams-api-cplm-results`, `ams-api-cplm-results-frames` | **Split-brain risk — see Phase 4** |
| Port 5006 | free (5001–5005 taken) | New service port |
| DDL scripts | `30_cplm_analytics_schema.sql`, `32_cpm_loop_registry.sql`, `33_cpm_permissions.sql`, `34_cplm_event_frames.sql` | `31_assets_relationships.sql` belongs to asset-model and **stays** |

### Bus topology after extraction (unchanged — Kafka is the backbone, not the only bus)

- **Kafka (async data plane):** consumes `clpm.feature.short.v1`, `clpm.feature.long.v1`,
  `clpm.gate.results.v1`; produces `ams.metadata.updates` (loop evidence broadcast) and
  `audit-events`.
- **HTTP (sync control plane):** → asset-model `/assets/{id}/relationships` (peer links,
  `X-Service-Key`), → Flink REST (A8 recompute), → binding-resolver (readiness provenance).
- **SignalR** stays in AMS.Api (alarm hub — CPLM does not use it).
- **MQTT/Sparkplug** untouched (live plane is edge-node → EMQX → browser).

---

## Ground rules

- [ ] **No behavior change.** This is a move, not a redesign. Any API shape change is a
      separate commit, before or after — never inside a move commit.
- [ ] **Every phase independently deployable and revertible.** No phase leaves the stack
      in a state that needs the next phase to work.
- [ ] **Read path before write path.** Reads are idempotent and can run in both places at
      once; the Kafka write path cannot (consumer-group split). Reads prove the plumbing
      before we touch the risky part.
- [ ] **Prove the data boundary before moving code** (Phase 1 before Phase 3) so a wrong
      boundary is one config line to revert, not a service rollback.
- [ ] **Verify against real responses, not assumptions** — the recurring failure species in
      this integration is silent success.

---

## Phase 0 — Safety net & preconditions ✅ DONE (`a26f66f`)

The extraction has **no test coverage to protect it**. Build the net first.

- [x] **0.1 Fix the `system.manage` policy bug (live, found while surveying).**
      `ObservabilityController` (whole controller) and 3 `OpcConnectionsController` actions
      carry `[Authorize(Policy = "system.manage")]`, but the policy is **never registered**
      in `Program.cs` (`AddAuthorizationBuilder` block ends at `cpm.manage`) and there is no
      fallback policy provider. ASP.NET throws → **HTTP 500**, verified live against a token
      that *does* carry the `system.manage` claim. Fails closed, so not a security hole, but
      the endpoints are broken. One line: `.AddPolicy("system.manage", p => p.RequireClaim("permission", "system.manage"))`.
      *Do this first — the new service copies this policy block, and copying it broken doubles the bug.*
- [x] **0.2 Response-diff harness.** Script that hits every CPLM endpoint against a base URL
      and writes canonical JSON to disk: loops (list + one), registry-contract, readiness,
      events, gates/latest, gates history, kpis (short + long resolution), resolutions,
      fleet summary/rankings/heatmap, calculations, pipeline-status, pipeline-metrics.
      Run it against `:8000` now and commit the golden output.
- [x] **0.3 Contract tests for the move** in `AMS.Tests.Contract` (or a new
      `Cplm.Tests.Contract`): status codes, permission enforcement (401/403 vs 200 per
      policy), and the gate-matrix shape (17 gate keys incl. `G2r`, `metrics`, `narrative`,
      `metadata` version stamps). These outlive the extraction — they're the regression net
      CPLM never had.
- [x] **0.4 Record the live baseline** — row counts (table above), the golden verdict
      (`G13_LOOP_A` = SUSPECTED_FINAL_ELEMENT_NONLINEARITY @ 0.89, G13 PASS, `has_peer_links: true`),
      and current Kafka consumer-group offsets for both CPLM groups.

**Exit:** harness + tests green against the current monolith; baseline committed.

---

## Phase 1 — Database split (schema moves, code stays) ✅ DONE (2026-08-06)

Proves the boundary with the code still in one process. One connection string to revert.

- [x] **1.1 Create `traverse_cplm`** database (same cluster, `ams_user` owner) with schemas
      `analytics` and `cpm`.
- [x] **1.2 Re-verify the boundary** immediately before migrating (the grep from the baseline
      table — no non-CPLM code referencing the schemas). If anything new appeared, stop.
- [x] **1.3 Migrate structure + data**: `pg_dump -n analytics -n cpm` from `ams` → restore
      into `traverse_cplm`. Includes the 3 `_latest` views, the UNIQUE upsert keys
      (`loop_id, window_kind, window_end, source`), and the **partial unique index on
      `cplm_event_frames WHERE closed_at IS NULL`** — verify indexes explicitly, a partial
      index silently missing means duplicate open frames.
- [x] **1.4 Add a second data source** in AMS.Api (`ConnectionStrings:Cplm`) and point *only*
      the CPLM controllers/consumers at it. Everything else keeps using `ams`.
- [x] **1.5 Verify**: row counts match the Phase 0 baseline exactly; run the 0.2 harness and
      **diff against golden — must be byte-identical**; the golden verdict still resolves.
- [x] **1.6 Soak** for one full pipeline cycle: confirm new gate results land in
      `traverse_cplm` (not `ams`) and that the 12h/24h fusion windows still persist.
- [x] **1.7 Drop `analytics.*` / `cpm.*` from `ams`** — only after 1.6 passes. Take a dump first.

> **Trap:** `CplmResultConsumerService` has self-healing DDL (creates tables when missing,
> 57P03 retry). Pointed at an empty database it will happily create empty tables and report
> healthy — you'd lose 550 verdicts and never see an error. **Migrate data before repointing.**

**Exit:** CPLM data lives in `traverse_cplm`; monolith unchanged in behavior; harness diff clean.

---

## Phase 2 — Service skeleton (deployed, no traffic) ✅ DONE (2026-08-06)

> 2.3 resolution: `AMS.Infrastructure.Kafka` — the consumers use only `KafkaOptions.BootstrapServers`;
> the new service supplies it from `Cpm:BootstrapServers`, no copy and no project reference.
> `IotDbWriteClient` copied to `Services/IotDbWriteClient.cs` with a provenance header naming the
> AMS.Api original (which stays for RawLoopIotDbConsumer). Also added: `/authcheck` guarded probe
> (skeleton had no domain routes, so 404s proved nothing about auth), `.dockerignore` (host obj/
> breaks in-container publish), and the three CPLM permission keys added to the shared
> `_shared/TraverseAuth.cs` `Perms.All` + `cplm-api` added to sync-auth-module.ps1.

- [x] **2.1 Create `src/services/cplm-api`** following the `analysis-service` layout
      (`Program.cs`, `Auth/`, `Data/`, `Models/`, `Dockerfile`, `appsettings.json`,
      `cplm-api.csproj` with `RootNamespace Traverse.CplmApi`, net8.0).
- [x] **2.2 Platform auth**: RS256 bearer validation against auth-service JWKS + the policy
      block (`analytics.view`, `cpm.manage`, `system.manage` — the fixed one from 0.1).
- [x] **2.3 Resolve the two shared dependencies:**
      - `AMS.Infrastructure.Kafka` — check what's actually used; if it's only message
        contracts, copy the DTOs rather than taking a project reference on the AMS backend
        (a services/ project referencing backend/ couples the deploy units back together).
      - `IotDbWriteClient` — **shared with `RawLoopIotDbConsumer`, which stays in AMS.Api.**
        Copy it into the new service (≈1 file) rather than moving it. Note the duplication
        in the file header; a shared package is over-engineering for one class.
- [x] **2.4 Health + metrics**: `/health` (mirroring the other services so compose's
      healthcheck works), Prometheus `/metrics`.
- [x] **2.5 Compose service** on port **5006**, `depends_on` postgres/kafka, env:
      `ConnectionStrings__Default` → `traverse_cplm`, `Cpm__AssetModelUrl`,
      `Cpm__ServiceKey` (`TRAVERSE_SERVICE_KEY`), `Cpm__BootstrapServers`,
      IoTDB config, **and the Flink jar bind-mount**
      (`../../src/flink/target/ams-flink-1.0-SNAPSHOT.jar:/opt/ams/flink/ams-flink.jar:ro`) —
      A8 recompute uploads that jar and cannot work without it.
- [x] **2.6 Verify** the empty service starts healthy, validates a real token, and reaches
      Postgres — **before** any endpoint moves.

**Exit:** `cplm-api` healthy in compose, serving nothing but `/health`.

---

## Phase 3 — Move the read path (safe, reversible)

Controllers are idempotent reads — they can exist in both services simultaneously.

- [ ] **3.1 Move** `CpmAnalyticsController`, `CpmFleetController`, `CpmEventsController` (read
      actions), `CpmReadinessController`, and the read side of `CpmLoopsController`.
- [ ] **3.2 Move `CplmRecomputeService` + `CpmLoopRegistryService`** (the controllers depend
      on them) — but leave the *mutating* endpoints disabled until Phase 5.
- [ ] **3.3 Run the 0.2 harness against `:5006`** and diff against golden. Both services now
      answer identically. **Diff must be clean before proceeding.**
- [ ] **3.4 Do not switch the frontend yet.** AMS.Api still serves the UI.

**Exit:** `:5006` returns byte-identical responses to `:8000` for every read endpoint.

---

## Phase 4 — Move the write path (the risky one)

**This is a hard cutover.** Both consumers use group `ams-api-cplm-results` (+`-frames`).
Two processes in the same group means Kafka **splits the partitions between them** — each
persists only some windows, with no error in either log. It looks like it's working.

- [ ] **4.1 Move** `CplmResultConsumerService` + `CplmEventFrameService` into `cplm-api`,
      keeping the **same group ids** so committed offsets carry over.
- [ ] **4.2 Cutover procedure (ordered, not parallel):**
      1. Note current offsets/lag for both groups.
      2. Stop AMS.Api's consumers (feature-flag them off, or deploy the AMS.Api build with
         them removed) and **confirm the group has zero members**.
      3. Start `cplm-api`'s consumers.
      4. Confirm consumption resumes from the recorded offsets, lag drains to ~0.
- [ ] **4.3 Verify no gap**: row counts increased monotonically, no window between the two
      processes is missing (query for gaps in `window_end` at the active resolutions).
- [ ] **4.4 Verify the IoTDB dual-write** still lands KPI series (`root.site1.cpm.<loop>.kpi.*`)
      from the new process.
- [ ] **4.5 Verify the audit emitter** (`CplmAuditEmitter`) still reaches `audit-events` and
      chains into audit-service.

**Exit:** all CPLM persistence flows through `cplm-api`; no missing windows; KPIs and audit intact.

---

## Phase 5 — Mutations, side services, frontend switch

- [ ] **5.1 Enable the mutating endpoints** on `cplm-api`: activate/delete loop,
      republish-evidence, recompute + replay status, event acknowledge/shelve.
- [ ] **5.2 Verify each against the real dependencies** — peer-link projection returns
      `projected: 1` (not 0 — a 401 to asset-model shows up as "no peers"), and an A8
      recompute completes end-to-end (~90 s) producing a fused verdict.
- [ ] **5.3 Frontend routing**: add an nginx `location /api/v1/cpm` block → `cplm-api:5006`
      (nginx uses longest-prefix matching, so it wins over the `/api/` catch-all regardless
      of order — but place it with the other service blocks for readability). Mirror it in
      `vite.config.ts` for dev.
- [ ] **5.4 `cpmApi.ts` needs no change** — it already calls `/api/v1/cpm/*`; only the proxy
      target moves. Confirm all 12 screens still load.

**Exit:** the UI is served entirely by `cplm-api` for CPM data; AMS.Api serves no CPLM traffic.

---

## Phase 6 — Decommission from AMS.Api

- [ ] **6.1 Delete** the 10 CPLM files and their `Program.cs` registrations.
- [ ] **6.2 Keep** `IotDbWriteClient` (still used by `RawLoopIotDbConsumer`) and
      `AMS.Infrastructure.Kafka`.
- [ ] **6.3 Keep the `cpm.manage` policy** in AMS.Api only if something still uses it —
      otherwise remove it there and keep it in `cplm-api`.
- [ ] **6.4 Confirm `:8000` returns 404** for `/api/v1/cpm/*`, and that alarms, SoE, SignalR,
      and OPC paths are unaffected.
- [ ] **6.5 Re-run the full 0.2 harness** against the deployed stack (through nginx, as the
      browser sees it) — final diff against golden.

**Exit:** AMS.Api has zero CPLM code; stack behavior unchanged from the golden baseline.

---

## Phase 7 — Documentation & operational close-out

- [ ] **7.1 Update `CLAUDE.md`** — add `cplm-api` to the `src/services/` list, the port table
      (5006), and the database list (`traverse_cplm`).
- [ ] **7.2 Update `architecture_document.md`** — CPLM data path now terminates in a separate
      service; note the consumer-group ownership.
- [ ] **7.3 Runbook entry**: the consumer-group cutover procedure (4.2) — this is the step
      that silently corrupts data if done wrong, so it must be written down, not remembered.
- [ ] **7.4 CI**: add `cplm-api` build + the new contract tests to `.github/workflows/ci-cd.yml`.
- [ ] **7.5 `scripts/`**: update any script that assumes CPLM lives at `:8000`
      (check `ams-readiness-score.ps1`, `production-acceptance-test.ps1`, validation scripts).

---

## Risk register

| # | Risk | Likelihood | Mitigation | Phase |
|---|---|---|---|---|
| R1 | **Consumer-group split-brain** — two processes share a group, each persists a subset, no error logged | High if done carelessly | Ordered cutover with zero-member confirmation (4.2) | 4 |
| R2 | **Self-healing DDL masks an empty database** — consumer creates empty tables and reports healthy | High | Migrate data *before* repointing; verify row counts (1.3/1.5) | 1 |
| R3 | **Partial unique index lost in migration** → duplicate open event frames | Medium | Explicit index verification after restore (1.3) | 1 |
| R4 | **No test coverage** — a behavior regression goes unnoticed | Certain without Phase 0 | Response-diff harness + contract tests (0.2/0.3) | 0 |
| R5 | **Missing Flink jar mount** → A8 recompute fails only when someone clicks it | Medium | Mount in compose at 2.5; exercise recompute at 5.2 | 2/5 |
| R6 | **Service key mismatch** → peer-link projection 401 surfaces as "no peers", G13 silently degrades | Medium (has happened before) | Assert `projected > 0` at 5.2 | 5 |
| R7 | Two deploy units to keep in version lockstep during the move | Low | Phases 3–5 are short-lived; don't leave the stack half-moved across days | 3–5 |

## Rollback

- **Phases 0–2:** additive only — delete the new service, nothing else changes.
- **Phase 3:** point the frontend/proxy back at `:8000` (it was never switched) — reads still
  work in the monolith.
- **Phase 4:** the real rollback point. Stop `cplm-api` consumers, redeploy AMS.Api with its
  consumers enabled, same group ids → resumes from committed offsets.
- **Phase 5–6:** revert the nginx block; restore the deleted files from git.
- **Database:** keep the pre-1.7 dump of `analytics.*`/`cpm.*` until Phase 6 is signed off.

## Definition of done

- [ ] `cplm-api` serves every CPM endpoint with byte-identical responses to the golden baseline.
- [ ] All CPLM persistence (Postgres + IoTDB KPIs) flows through `cplm-api`; no missing windows.
- [ ] AMS.Api contains zero CPLM code and returns 404 for `/api/v1/cpm/*`.
- [ ] All 12 Phase-7 UI screens work unchanged.
- [ ] Golden verdict reproducible via recompute from the new service.
- [ ] Contract tests in CI; runbook documents the cutover.
