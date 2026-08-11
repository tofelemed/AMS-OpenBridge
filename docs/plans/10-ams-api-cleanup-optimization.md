# Plan 10 — ams-api Cleanup & Optimization (post-gateway)

**Phase:** 3 · **Effort:** M · **Depends on:** Plan 04 (edge-only auth is why the residue exists), Plan 05 (hypertables), [docs/ams-api-analysis.md](../ams-api-analysis.md)
**Objective:** remove what the gateway made dead, shrink the composition hot-spot, and fix the operational papercuts — **with zero functional change to the alarm surface**.

> **Scope guard:** no scale-out work (that is Plan 06), no consumer-group or topic changes, no
> merging ams-api into the Traverse fleet, no DB table drops without a recorded decision.
> Every item below is backed by evidence gathered in the deep analysis — file:line cited.

## Why

Edge-only auth (Plan 04) moved all token validation to the gateway, but ams-api still carries the
configuration for a validator it no longer has. Independently, the analysis surfaced dead
repository members with zero callers, a hub file that is 41% commented-out duplicate, three
packages with no call sites, and two operational issues we hit repeatedly during Plans 04–05: the
container flaps `unhealthy` whenever Flink is down even though the API answers, and every request
is now access-logged twice (gateway + Serilog).

---

## Phase A — Dead code & post-gateway residue (zero behavior change)

| # | Item | Evidence | Action |
|---|---|---|---|
| A1 | Unused auth configuration | compose ams-api env still carries `Auth__JwksUrl`/`Auth__Issuer`/`Auth__Audience`; `appsettings.Development.json` still has an `Auth` section; `Program.cs:17` imports `Microsoft.IdentityModel.Tokens` with no remaining use | Delete all three env lines, the appsettings section, and the using. Nothing reads them since `GatewayHeaderAuthHandler` replaced JwtBearer. |
| A2 | Three unused Polly packages | `AMS.Infrastructure.csproj`: `Polly 8.4.0`, `Polly.Extensions.Http`, `Microsoft.Extensions.Http.Polly` — zero call sites (RES-01 established this; resilience now comes from `Microsoft.Extensions.Http.Resilience` in AMS.Api) | Remove the three `PackageReference`s. |
| A3 | 348 commented-out lines in `AlarmHub.cs` (41% of the file) | lines 446–847: a full commented duplicate of `AlarmHub` + `AlarmSignalRPublisher` | Delete the commented block. Git history keeps it. |
| A4 | Dead repository members (zero callers) | `GetUnacknowledgedAsync`, `GetShelvedExpiredAsync` (stub returning `[]` — real expiry is the SQL function `alarms.expire_shelved_alarms()`), `GetByCorrelationIdAsync` (stub), `BulkInsertAsync` (COPY into `historical_alarms`, never called) | Remove the four members from `IActiveAlarmRepository`/`IHistoricalAlarmRepository` + implementations. Compile + tests prove no hidden caller. |
| A5 | `src/backend/publish-test/` | untracked local publish output full of DLLs | Delete; add pattern to `.gitignore`. |
| A6 | Stale exception message | `Program.cs:125` names `AlarmStreamProcessorService` — a class that no longer exists | Reword the guard message (the guard itself stays — it is load-bearing). |
| A7 | **Decision to record (no action now):** `alarms.historical_alarms` table fate | write path dead after A4; only `StreamAsync` reads for CSV export, and it actually queries `alarm_history` | Keep the table until the export path's contract is re-verified and compliance signs off; record in this plan's status when decided. |

**Risk:** nil–low. A4 touches interfaces → the two test projects must rebuild; that *is* the
verification.

## Phase B — Program.cs decomposition (structure only, no behavior)

`Program.cs` is ~700 lines including inline production classes.

| # | Item | Action |
|---|---|---|
| B1 | Inline classes out of the composition root | `ShelveExpiryService` → `BackgroundServices/`; `SoeEventRepository` (stub — see B3) → `Infrastructure/Repositories/`; pipeline behaviors (`ValidationBehavior`, `LoggingBehavior`) → `AMS.Application`. Pure file moves, namespaces preserved where referenced. |
| B2 | Registration grouped into extension methods | `AddAmsPersistence()`, `AddAmsKafkaPipeline()`, `AddAmsAuthPolicies()`, `AddAmsHealthChecks()` in `AMS.Api/Extensions/`. Target: Program.cs ≤ 250 lines, read-top-to-bottom. |
| B3 | SOE stub honesty | `SoeEventRepository.QueryAsync` returns an empty page — the SOE REST query path silently serves nothing (UI gets SOE via SignalR pushes). Either implement the Postgres query against `soe` (S effort — table exists) or make the endpoint return `501` with a clear message. **Recommendation: implement the query** — the table and UI panel both exist; an empty-forever REST path is a trap. |

**Risk:** low. Moves are mechanical; B3 is the only behavior *addition* (a previously-empty
endpoint starts returning data — strictly more functional, still gated by `soe.view`).

## Phase C — Operational optimization (behavioral, individually testable)

| # | Item | Evidence | Action |
|---|---|---|---|
| C1 | **Health-check decoupling** (the `unhealthy`-flap fix) | Container healthcheck curls `/health`, which aggregates postgres + kafka + `flink-ingest` — so a down Flink marks the *container* unhealthy while the API serves fine (observed throughout Plans 04–05); the kafka check **publishes a synthetic message to `server-status` every probe** (15s) | (a) Point the container healthcheck at `/health/ready` filtered to true liveness (postgres only); (b) re-tag `kafka`/`flink-ingest` as `"pipeline"` (not `critical`) — they stay visible in `/health` and `/health/pipeline`; (c) replace the produce-based kafka check with an AdminClient metadata check (no synthetic messages); (d) cache health results ~5s so probes can't stack 5s timeouts. |
| C2 | **Double access logging** | gateway logs every request (Plan 04 E) AND `UseSerilogRequestLogging` logs it again at INFO | Keep Serilog request logging only for ≥400 responses and slow requests (>1s) via `GetLevel`; the gateway is the access log of record. Roughly halves steady-state log volume. |
| C3 | **CORS removal** | `AmsPolicy` (Program.cs:349/396) predates the gateway; in production the browser is same-origin behind nginx→gateway, and direct cross-origin access is impossible (no published port) | Restrict CORS to Development only (Vite on :5174 goes through the gateway anyway — verify, then delete outright if unused even in dev). |
| C4 | In-service rate limiter (`alarms-read`) | duplicated by the gateway's per-client limiting | **Keep — explicit no-change decision.** It is the only limiter for *in-network* callers and costs nothing. Documented so nobody "cleans" it later. |
| C5 | List+count as one round-trip | `GetActiveAlarmsAsync` + `CountActiveAsync` = two queries per cache miss | Optional: single Dapper query with `COUNT(*) OVER()`. Low priority — the 3s read cache already absorbs the hot path. Do only with a before/after measurement. |
| C6 | Analytics on hypertables | `AnalyticsController` raw SQL predates Plan 05's conversion | Optional: switch range aggregations to `time_bucket()` and verify chunk exclusion with `EXPLAIN`. Measure first; only adopt if the plan shows chunk pruning isn't already happening. |

**Risk:** C1 changes what "container healthy" means — validate against orchestration expectations
(compose `depends_on: service_healthy` consumers of ams-api: the frontend). C2/C3 are
config-level and trivially reversible.

## Phase D — Config hygiene

| # | Item | Action |
|---|---|---|
| D1 | LAN IP in `appsettings.Development.json` (`AlarmIngestion:FeedUrl` → `192.168.1.51`) | Move behind env with a documented placeholder default; the compose env already overrides it. |
| D2 | `Kafka:LabDirectIngest` / dead-mode keys still present in appsettings | Remove keys whose only accepted value is the default (the startup guards stay). |

---

## Execution order & validation

1. **A (dead code)** → build all 6 projects + both test projects; grep-verify zero references to
   removed members; live smoke via gateway (list, ack path 401/200, hubs negotiate).
2. **B (structure)** → identical smoke; `git diff --stat` should show moves, not rewrites. B3 gets
   its own test: SOE query returns seeded rows.
3. **C1 (health)** → the acceptance test that matters: **stop Flink → ams-api container stays
   `healthy`, `/health/pipeline` reports the degradation, `/health` still details it**; kafka-ui
   shows no more synthetic `server-status` probe messages.
4. **C2/C3** → log-volume before/after over a fixed request burst; CORS verified by exercising the
   dev origin.
5. Each phase = one commit; push after the set.

## Exit criteria

- [ ] Zero references to auth/JWKS anywhere in `src/backend` (config included).
- [ ] `AlarmHub.cs` contains no commented-out duplicate; repository interfaces expose only called members.
- [ ] `Program.cs` ≤ 250 lines; no production class defined inside it.
- [ ] With Flink stopped, the ams-api container reports healthy and the REST surface answers; pipeline degradation is visible in `/health/pipeline`.
- [ ] No synthetic kafka messages from health probes.
- [ ] One access log of record (gateway); ams-api logs only warnings/errors/slow requests.
- [ ] SOE REST path returns data (or an explicit 501 — decision recorded).
- [ ] Full regression: build + tests + gateway smoke identical before/after.

## Non-goals (deliberate)

- Scale-out, SignalR backplane, Redis-backed read cache → **Plan 06**.
- Consumer-group/topic renames, partition changes → not worth the migration risk here.
- Dropping `historical_alarms` → needs the A7 decision first.
- Rewriting the Clean Architecture layering — it earns its keep for this domain.
