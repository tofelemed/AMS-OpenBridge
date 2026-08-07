# PHASE 1 — Hypothesis Verification

**Reviewed commit:** `4e2758c951df06a170f35d23313824cb57c9ef03`
**Date:** 2026-08-08
**Method:** Each hypothesis H-01..H-28 (framework §3) carries a verdict block: status, claim, evidence (`file:line` + verbatim where load-bearing), amendment, consequence. New findings from the §4 discovery sweep not covered by any hypothesis are appended as H-29+. Recorded search commands are in [EVIDENCE-APPENDIX.md](./EVIDENCE-APPENDIX.md). Primary `file:line` citations trace to the six domain evidence reports.
Status values: `CONFIRMED | REFUTED | AMENDED | UNVERIFIED`.

---

## Verdict summary

| ID | Hypothesis (abbrev.) | Verdict |
|---|---|---|
| H-01 | nginx = proxy only, no authn/rate-limit/cache | **CONFIRMED** |
| H-02 | No API gateway anywhere | **CONFIRMED** |
| H-03 | auth-service JWKS only, no OIDC discovery | **CONFIRMED** |
| H-04 | TraverseAuth byte-copied ×7, CI drift check | **CONFIRMED** (amended: 3 independent validators) |
| H-05 | Default service key → full principal, fail-closed only in Production | **CONFIRMED** |
| H-06 | `Security__DisableApiAuthorization` disables authz wholesale | **CONFIRMED** |
| H-07 | Flink sinks set no DeliveryGuarantee | **CONFIRMED** (amended: default NONE → possible loss) |
| H-08 | No Flink HA; 60s supervisor resubmit; state lost | **CONFIRMED** |
| H-09 | Checkpoints on local Docker volume | **CONFIRMED** |
| H-10 | AnalysisExecutionJob unsupervised by compose | **CONFIRMED** |
| H-11 | Single ZK Kafka broker, auto-create, 4 part, 24h, RF=1 | **CONFIRMED** |
| H-12 | IoTDB standalone 1.3.2 vs spec 3C3D | **CONFIRMED** |
| H-13 | Redis volatile-lru, evictable snapshot contract | **AMENDED** (512mb not ~200MB; else confirmed) |
| H-14 | Projection upsert key backed by unique index | **AMENDED** (no backing index; no server_id column) |
| H-15 | No caching tier between ams-api and Postgres | **CONFIRMED** |
| H-16 | No rate limiting in any .NET service | **REFUTED** for AMS.Api, **CONFIRMED** for all Traverse services + nginx |
| H-17 | EMQX anonymous, no per-client ACLs | **CONFIRMED** |
| H-18 | historian-bff no cache, no IoTDB pooling discipline | **CONFIRMED** (amended: /raw bounded, /snapshot unbounded SCAN) |
| H-19 | Single Postgres, no PgBouncer, default pool | **CONFIRMED** |
| H-20 | Plaintext secrets in compose | **CONFIRMED** |
| H-21 | CPLM single-member enforced by flag/convention only | **CONFIRMED** |
| H-22 | `lifecycle-alerts` has no consumer | **CONFIRMED** |
| H-23 | Sparkplug device-id vs IoTDB path divergence → frontend resolution | **CONFIRMED** |
| H-24 | SignalR no scale-out backplane | **CONFIRMED** |
| H-25 | Frontend perf hygiene (per sub-item) | **MIXED** (see block) |
| H-26 | 30s fallback poll stops on reconnect, no stacking | **CONFIRMED** (no defect) |
| H-27 | Containers root, tag-pinned, no resource limits | **CONFIRMED** (scoped) |
| H-28 | No graceful shutdown in Kafka consumers | **PARTIALLY REFUTED** |

New (discovery sweep): H-29..H-45 — see below.

Counts: **CONFIRMED 20** · **AMENDED 3** (H-13, H-14 + H-04/H-07/H-18 confirmed-with-amendment) · **MIXED 1** (H-25) · **REFUTED (partial) 2** (H-16, H-28) · **UNVERIFIED 0**. Every hypothesis carries a code citation.

---

## H-01 — CONFIRMED
**Claim:** nginx front door performs no authentication, rate limiting, or response caching — proxy only.
**Evidence:** `src/frontend-ob/nginx.conf:1-174` read in full; every location block is bare `proxy_pass` + forwarded headers. Grep `limit_req|limit_conn|auth_request|auth_basic|proxy_cache|client_max_body_size|proxy_buffering|gzip|ssl_` → **∅** (EVIDENCE-APPENDIX CR-3, SO-4). `listen 80;` (nginx.conf:2) — no TLS.
**Amendment:** none. Bonus exposure: `/swagger` (nginx.conf:166) and `/mqtt-ws` (nginx.conf:150) publicly proxied; `/external-api/` hardcodes `http://192.168.1.51:8010/api/` (nginx.conf:129).
**Consequence:** the only edge in front of 11 upstreams enforces nothing — DoS, credential-stuffing against `/api/auth/`, and unbounded uploads all pass through.

## H-02 — CONFIRMED
**Claim:** No API gateway service exists anywhere in the stack.
**Evidence:** `rg -i "envoy|kong|yarp|ocelot|traefik|krakend|tyk"` over `infra` + `src` → **exit 1, no matches** (SO-6). Compose full read confirms the only edge component is the nginx inside `ams-frontend`.
**Amendment:** none.
**Consequence:** cross-cutting authn/z, rate limiting, request-size limits, and circuit breaking have no home; each would have to be reinvented per service.

## H-03 — CONFIRMED
**Claim:** auth-service exposes JWKS only; no OIDC discovery; JwtBearer `Authority` flow impossible.
**Evidence:** `routes/auth.routes.ts:25-27` registers only `/.well-known/jwks.json`; grep `openid-configuration` over `src/` → **∅** (SO-10). All validators use `IssuerSigningKeyResolver` (`_shared/TraverseAuth.cs:147`; `AMS.Api/Auth/JwksKeyCache.cs`), never `options.Authority`. The shared module header says so verbatim (`_shared/TraverseAuth.cs:8-9`).
**Amendment:** none.
**Consequence:** key discovery/rotation are hand-built (unknown-`kid` refetch); no standard OIDC metadata/introspection for third-party integration.

## H-04 — CONFIRMED (amended)
**Claim:** `TraverseAuth.cs` is byte-copied into 7 services with a sync script and CI drift check as sole mitigation.
**Evidence:** Glob `src/services/**/TraverseAuth.cs` → **7 copies + 1 `_shared` source**; `scripts/sync-auth-module.ps1:15` lists exactly those 7; CI drift guard `ci-cd.yml:203-205` (`diff -q`). Live SHA256 of all 7 = identical to source today.
**Amendment:** **three** independent JWT validators exist — the shared module (7 copies), `display-service`'s hand-rolled JwtBearer, and `ams-api`'s own `JwksKeyCache`. Only the shared module is covered by sync/CI; a hardening applied to `_shared` silently does not reach the other two.
**Consequence:** drift risk is contained for the 7 copies but not for the two hand-rolled validators.

## H-05 — CONFIRMED
**Claim:** Default service key `traverse-internal-dev-key` fallback exists; fail-closed only in production environment mode.
**Evidence (verbatim, `_shared/TraverseAuth.cs:176-186`):** `const string InsecureDefaultServiceKey = "traverse-internal-dev-key";` … `if (app.Environment.IsProduction()) throw …; else app.Logger.LogWarning(…)`. A valid key builds a principal with **every** permission (`_shared/TraverseAuth.cs:203` `Perms.All.Select(...)`). Compose default `${TRAVERSE_SERVICE_KEY:-traverse-internal-dev-key}` across 6 services + `Cpm__ServiceKey` (SO-13).
**Amendment:** guard keys on `IsProduction()`; Traverse services set no `ASPNETCORE_ENVIRONMENT` (defaults to Production, so they *would* hard-fail on the default key), but `docker-compose.sims.yml:15-24` deliberately downgrades analysis-service + audit-service to Development to bypass exactly this fail-closed behavior.
**Consequence:** possession of the source-visible default key = full-admin principal on 6+ services; the key is one shared secret over intra-network HTTP, no rotation.

## H-06 — CONFIRMED
**Claim:** `Security__DisableApiAuthorization` flag exists in ams-api and can disable authorization wholesale.
**Evidence (verbatim, `AMS.Api/Program.cs:445-446`):** `if (config.GetValue("Security:DisableApiAuthorization", false)) controllerEndpoints.AllowAnonymous();`. Default false; compose sets `"false"` (docker-compose.yml:440).
**Amendment:** scope is `MapControllers()` — every REST controller becomes anonymous when true; SignalR hubs unaffected (AlarmHub keeps `[Authorize]`).
**Consequence:** one env var flips the entire ams-api REST surface (alarms, ack, shelve, admin, audit, OPC) to anonymous; high-blast-radius kill switch relying on operational discipline.

## H-07 — CONFIRMED (amended: worse than hypothesized)
**Claim:** Flink Kafka sinks set no `DeliveryGuarantee` → effective at-least-once despite EXACTLY_ONCE checkpoint mode.
**Evidence:** `setDeliveryGuarantee|DeliveryGuarantee` and `setTransactionalIdPrefix` → **∅ across `src/flink`** (KF-2, KF-3). All 13 `KafkaSink` builders are the bare pattern, e.g. `OpcEventStreamJob.java:176-184`, `CplmKafkaSink.java:14-20`. Nine jobs declare `CheckpointingMode.EXACTLY_ONCE`.
**Amendment:** in the pinned `flink-connector-kafka 3.0.1-1.18` (`pom.xml:30-34`), `KafkaSinkBuilder`'s default is `DeliveryGuarantee.NONE`, not AT_LEAST_ONCE — with NONE the sink does not flush pending producer records on checkpoint barriers, so buffered records can be **lost** (not merely duplicated) on TM failure. This default-value claim is **library/standards-anchored** (Flink connector API), not repo-line-anchored — the repo-verified fact is that no builder sets a guarantee.
**Consequence:** `current-alarm-state`, lifecycle events, ACK writebacks, and CPLM gate results can be silently dropped across a TM crash; the "exactly-once" language in CLAUDE.md/architecture docs is not delivered by the code.

## H-08 — CONFIRMED
**Claim:** No Flink HA; recovery is a 60s supervisor resubmit loop; in-flight state windows lost on JM loss.
**Evidence:** `high-availability|ha.` → **∅ in compose `FLINK_PROPERTIES` and `src/flink`** (KF-6); only the unused Helm chart sets ZK HA. `flink-job-supervisor.sh:6-7` states "there is no JM HA"; loop interval `SUPERVISOR_INTERVAL_SEC:-60` (:18); resubmit is `flink run -d` with **no `-s` savepoint restore** (:75). Compose comment docker-compose.yml:1091-1093 concurs.
**Amendment:** none.
**Consequence:** a JobManager restart destroys all jobs; they return in ≤60s but with **empty keyed state** — RBE fingerprints and the CPLM long job's 24h `ListState` buffer (`CplmLongDiagnosticsStreamJob.java:81-91`) restart empty; `latest()`-offset jobs (LiveState) skip the outage window entirely.

## H-09 — CONFIRMED
**Claim:** Flink checkpoints target a local Docker volume — not durable beyond the host.
**Evidence:** `state.checkpoints.dir: file:///flink-checkpoints` in both `FLINK_PROPERTIES` blocks (docker-compose.yml:306, 365), backed by named volume `flink-checkpoints:` (line 21, default local driver) mounted at :334/:385. `.env.example:53-57` ships unused S3 placeholders never referenced in compose.
**Amendment:** none.
**Consequence:** host/volume loss = loss of all retained EXACTLY_ONCE state; and combined with H-08's restore-less resubmit, the retained checkpoints are not actually used by any automated recovery path.

## H-10 — CONFIRMED
**Claim:** `AnalysisExecutionJob` is supervised only by the host-side script, not the compose supervisor → dies silently after JM restart.
**Evidence:** supervisor `submit_if_missing` list = exactly 7 jobs (`flink-job-supervisor.sh:81-109`), AnalysisExecutionJob absent. `scripts/ensure_flink_jobs.py:121-127` contains it. `ensure_flink_jobs` is invoked only by `run-v2-validation.ps1:64` and `e2e-edge/run_all.py:100` — never by `start-ams-docker-full.ps1` or compose (SO/KF logs).
**Amendment:** none.
**Consequence:** after any JM restart the supervisor restores 7 jobs; `analysis.executions` accumulates unconsumed and every analysis sits "pending" until a human runs the validation script — the exact failure the job was written to fix.

## H-11 — CONFIRMED
**Claim:** single broker, Zookeeper-based, `auto.create.topics.enable=true`, default 4 partitions, 24h retention, effective RF=1.
**Evidence (verbatim, docker-compose.yml:262-273):** `KAFKA_BROKER_ID: 1`, `KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181`, `KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"`, `KAFKA_NUM_PARTITIONS: 4`, `KAFKA_LOG_RETENTION_HOURS: "24"`, `KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1`. Only one broker service exists.
**Amendment:** `default.replication.factor` unset (cp-kafka default 1) so RF=1 is by-default; `kafka-ui` lists phantom brokers `kafka-1:9093,kafka-2:9094` (docker-compose.yml:250) that exist nowhere; both listeners PLAINTEXT, external :9093 host-published.
**Consequence:** one broker restart pauses the whole alarm pipeline; 24h retention bounds event-sourced replay to a day; typo'd topic names silently auto-create.

## H-12 — CONFIRMED
**Claim:** IoTDB runs standalone (1.3.2) vs the specified 3C3D production topology.
**Evidence:** `image: apache/iotdb:1.3.2-standalone` (docker-compose.yml:69), single node, root/root. Spec target confirmed: `Traverse-Edge-Platform-Specification.md:129` — "tree model, 3C3D topology (3 ConfigNodes Ratis + schema replica 3; 3 DataNodes IoTConsensus + data replica 2)"; §11 (:238) "IoTDB 3C3D HA; async pipe replication to a standby cluster".
**Amendment:** none.
**Consequence:** the historian is a single point of failure with root/root credentials; no replication, no HA.

## H-13 — AMENDED
**Claim:** Redis `volatile-lru`, ~200 MB maxmemory, TTL on snapshot keys — paint-on-open contract is evictable under memory pressure.
**Evidence (verbatim, docker-compose.yml:109-115):** `--maxmemory 512mb --maxmemory-policy volatile-lru --save 60 1 --appendonly yes --appendfsync everysec`. Snapshot keys are written `setex(key, redisTtlSeconds, json)` with `REDIS_TTL_SECS` default 3600 (`SparkplugConfig.java:83`).
**Amendment:** maxmemory is **512mb**, not ~200 MB. Policy `volatile-lru` confirmed; because snapshot keys carry a TTL, they **are** in the evictable set — the "paint-on-open contract" lives on evictable keys. No `requirepass`; Redis unauthenticated on host :6380 (SO-7).
**Consequence:** under memory pressure Redis can evict a live snapshot → blank faceplate with no retry (matches the doc's own failure-mode row). The eviction-vs-contract conflict is real; the sizing number in the hypothesis was off.

## H-14 — AMENDED
**Claim:** PostgreSQL projection upsert key is `serverId+sourceName+conditionName+subConditionName`, backed by a unique index.
**Evidence:** the contract is asserted only in a comment (`NormalizedAlarmIngestor.cs:10-12`). The live projection table is `alarms.alarm_current` (`AmsDbContext.cs:29`), whose DDL (`02_alarm_schema.sql:37-52`) has **no `server_id` column** (`ServerId` is `b.Ignore`'d, AmsDbContext.cs:68) and only `UNIQUE(alarm_id)` + `idx_alarm_current_state(state)`. `sub_condition_name` ∩ index → **∅** (DL-4). The match is app-level read-modify-write over `AlarmRepositories.cs:114-118`, whose predicate filters `source` only (serverId ignored) and is **unindexed**.
**Amendment:** the 4-part key is an application convention, not a DB constraint. Dedup rests on `UNIQUE(alarm_id)`, whose value equals the 4-part key **only** when Flink supplies no `AlarmId` (`NormalizedAlarmIngestor.cs:270-282`); casing differences and cross-server same-name tags bypass it.
**Consequence:** at-least-once redelivery or a second API instance can throw `23505` (crashes the consume loop) on a raced deterministic key, or create duplicate logical alarms; and every Kafka event sequentially scans `alarm_current` on the unindexed `source` predicate.

## H-15 — CONFIRMED
**Claim:** No caching tier between ams-api reads and PostgreSQL.
**Evidence:** `IMemoryCache|IDistributedCache|OutputCache|ResponseCach|AddStackExchangeRedisCache|AddOutputCache|AddMemoryCache` → **∅ across `src/backend` and `src/services`** (CR-1). `Program.cs:170` comment "Redis removed per simplified architecture". `AlarmQueries.cs:121-127` runs list + count + stats-summary against Postgres on every page request.
**Amendment:** none (Redis is a live-value snapshot store, not a query cache).
**Consequence:** every dashboard poll is three DB query groups; stats aggregates recomputed per request; Postgres is the single read-amplification point.

## H-16 — REFUTED (AMS.Api) / CONFIRMED (Traverse services + nginx)
**Claim:** No rate limiting middleware anywhere in any .NET service and none in nginx.
**Evidence:** AMS.Api **does** register limiters — `Program.cs:323-346` (`alarms-read` 1000/min, `alarms-write` 300/min) + `UseRateLimiter()` (:416), applied at `AlarmsController.cs:41,308,393`. No limiter in any Traverse service (CR-2). nginx has no `limit_req` (CR-3).
**Amendment:** the AMS.Api limiter is **global-bucket** fixed-window (not per-client/IP), covers only 3 read endpoints, and the registered `alarms-write` policy is attached to nothing; no `GlobalLimiter`.
**Consequence:** all writes, all Traverse endpoints (historian-bff `/raw`, `/snapshot`), and cplm-api are unlimited; one noisy client consumes the shared read window for everyone.

## H-17 — CONFIRMED
**Claim:** EMQX allows anonymous connections in lab; no per-client ACLs scoping Sparkplug subscriptions.
**Evidence:** `EMQX_ALLOW_ANONYMOUS: "true"` (docker-compose.yml:149); `find infra -iname "*emqx*" -o -iname "*.conf"` → **∅** (SO-9) — no authenticator/ACL config exists. Compose's own comment (docker-compose.yml:140-146) concedes the env var isn't even the EMQX 5.x mechanism; with no authenticator, EMQX defaults to accepting all.
**Amendment:** none. The `/mqtt-ws` nginx route (nginx.conf:150-160) exposes the broker to any browser.
**Consequence:** any network/browser client can subscribe to all Sparkplug process data (`spBv1.0/#`), publish forged DDATA, or issue NCMD/DCMD device commands; the edge-node's own credentials authenticate against nothing.

## H-18 — CONFIRMED (amended)
**Claim:** historian-bff performs no result caching and no IoTDB session/connection pooling discipline; verify pagination bounds on `/raw`.
**Evidence:** no cache (CR-1). IoTDB is REST v2 via a bare typed HttpClient (`historian-bff/Program.cs:11`, `IoTDbClient.cs:22-31`) — no session concept, no timeout/retry/circuit policy. `/raw` **is** bounded: `Math.Clamp(maxCount,1,500)` + `LIMIT/OFFSET` (Program.cs:133); `/raw/cursor` ≤10,000 with O(1) timestamp paging; `/trend` decimates to `width∈[10,2000]` via `GROUP BY interval`.
**Amendment:** the unbounded hot path is `/snapshot` — a per-request Redis `server.Keys()` SCAN + per-key GET (`Program.cs:261-311`), O(keyspace) with no paging/cache. IoTDB Basic auth defaults root/root (`IoTDbClient.cs:17-19`).
**Consequence:** historian read latency is IoTDB-bound with no shedding; `/snapshot` cost grows linearly with keyspace × request rate.

## H-19 — CONFIRMED
**Claim:** Single PostgreSQL instance; no replicas, no PgBouncer; Npgsql pool sizes unconfigured.
**Evidence:** one `postgres` service (docker-compose.yml:37-62), floating tag `timescale/timescaledb:latest-pg15`; `pgbouncer|replica|standby|patroni` → **∅** (SO-8). Pool-size settings → **∅ in src/ and infra/** (DL-6) → Npgsql default Max 100 per data source. Eight logical DBs + ~12 client processes share one instance on one shared `ams_user`.
**Amendment:** none.
**Consequence:** single point of failure for AMS core and all Traverse services; unbounded pool queueing under load; major-version drift risk on the floating image tag.

## H-20 — CONFIRMED
**Claim:** Secrets in compose as plaintext defaults.
**Evidence:** `supersecurepassword123` ×12 (e.g. docker-compose.yml:49), `ChangeMe123!` (:645), IoTDB `root`/`root` hardcoded (:331-332, not even env-overridable), Grafana `admin/admin` (:1160-1161), pgAdmin `admin` (:184), EMQX dashboard `changeme_emqx` (:157), Prometheus→EMQX `admin/public` committed in prometheus.yml:61-63. No `secrets:` block anywhere.
**Amendment:** none. SQL scripts themselves contain no plaintext credentials (DL-7).
**Consequence:** any fresh clone runs with known credentials on host-published ports; secrets visible via `docker inspect`.

## H-21 — CONFIRMED
**Claim:** CPLM consumer-group single-member constraint is enforced only by flag/convention — nothing technical prevents a second member.
**Evidence:** cplm-api `Program.cs:88-92` gates the two consumers on `Cplm:ConsumersEnabled` (default false); groups `ams-api-cplm-results` / `-frames` (`CplmResultConsumerService.cs:67`, `CplmEventFrameService.cs:63`). The AMS.Api originals were deleted in Phase 6. **No `GroupInstanceId` (static membership), no assignment-count assertion, no leader lease** anywhere.
**Amendment:** none. `/health` heartbeats detect a stalled loop but not a second member.
**Consequence:** scaling cplm-api to 2 replicas — or redeploying a pre-Phase-6 ams-api image — silently splits partitions and each member persists a subset of windows with no error logged.

## H-22 — CONFIRMED
**Claim:** `lifecycle-alerts` (telemetry deadman output) has no consumer.
**Evidence:** every repo match classified (KF-8/9): 2 config declarations, 2 producers — `TelemetryDeadmanWatchdogService.cs:153-157` (TELEMETRY_STALLED, CRITICAL) and `AckSlaWatchdogService.cs:161` (ACK_SLA_BREACH) — and **0 consumers** (all 10 `.Subscribe(` sites in `src/backend` enumerated). The repo's own catalog row reads "(none wired)".
**Amendment:** none.
**Consequence:** the two most safety-relevant watchdog signals — "telemetry stalled" and "ACK SLA breached" — are published into a void; a dead OPC feed raises no operator-visible alert.

## H-23 — CONFIRMED
**Claim:** Sparkplug device-id (sanitised sourceName) vs IoTDB path (sanitised alarmId) divergence forces frontend-side resolution — a namespace-consistency violation.
**Evidence:** three identity/sanitization schemes for the same alarm — IoTDB `root.ams.site1.alarms.` + `alarmId.replaceAll("[^a-zA-Z0-9_]","_")` (`IoTDBPersistenceJob.java:36,111-113`); Sparkplug/Redis device = `sourceName.replaceAll("[^a-zA-Z0-9_\\-]","_")` (hyphens kept) (`AlarmMetricPublisher.java:255-259`); frontend `resolveHistorianPathForLiveAlarm` (`iotdbPaths.ts:67-76`) bridges via the optional `<device>/alarmId` DDATA metric, falling back to feeding the device id into the alarmId sanitizer.
**Amendment:** the derived path is then routed through `buildTrendViewerUrl` to `/trend`, whose current page ignores every param it sets — the **live→history deep link is broken** at the route level.
**Consequence:** UNS "one path, many transports" is violated for alarms; the join is done in browser code and silently degrades to an empty trend when the alarmId metric is missing; sanitization collisions (`FIC-101` vs `FIC.101`) are invisible to all three layers.

## H-24 — CONFIRMED
**Claim:** SignalR has no scale-out backplane → ams-api cannot run more than one replica for hub traffic.
**Evidence:** single `AddSignalR` (`Program.cs:174`); `AddStackExchangeRedis` → **∅** (SO-14); explicit comment `Program.cs:191` "Single-instance backend does not need Redis backplane."
**Amendment:** worse than a fan-out gap — the UI-topic consumers (AlarmStateDelta/ReplayResult/DriftAlert) use fixed group ids and broadcast `Clients.All`, so a second ams-api instance would **split partitions** and each instance's hub clients would receive only a subset of deltas.
**Consequence:** ams-api is architecturally pinned to one replica for correct realtime delivery.

## H-25 — MIXED (per sub-item)
**Claim:** verify AG Grid virtualization, MQTT unsubscribe-on-navigation, debounce on filters, AbortController on fetches, loading/error/empty states, ECharts progressive rendering.
- **AG Grid virtualization — CONFIRMED GOOD.** Client-side row model, virtualization on (no suppress flags, FE-3), `rowBuffer=20`, `getRowId`, diffed `applyTransactionAsync` + `asyncTransactionWaitMillis={50}` (`AlarmConsole.tsx:455-506,731-767`) — production-grade update path.
- **MQTT unsubscribe — PARTIAL/DEFICIENT.** `unsubscribeScreen` has **no ref-count** (`mqttStore.ts:290-328`): first unmount of a shared device topic starves surviving subscribers (stale values). `LiveEventStream` is permanently mounted in the shell (`App.tsx:527-529`) → the plant-wide DDATA firehose is always on; `mqttStore.disconnect` never called (FE-5) → socket outlives logout.
- **Debounce — REFUTED.** Only `UserManagementConfig` debounces (FE-1); AlarmConsole/MqttLiveStream/LiveEvents filter per keystroke.
- **AbortController — REFUTED.** Zero usage (FE-2); React Query `signal` unused; trend uses discard-stale flags only.
- **Loading/error/empty — PARTIAL.** Good on DisplayViewer/Analytics/CPM/IoTDBTrend; **Dashboard.tsx has none** (cold load renders zeros = "all quiet"), AlarmConsole has no hydration indicator (FE-4).
- **ECharts progressive — REFUTED-but-mitigated.** No `progressive`/`sampling` (FE-8); server decimates to plot width + 2000-pt live ring cap, so it's unnecessary. Real cost is unthrottled per-mousemove `setOption(notMerge)` (`TrendCore.tsx:510-524`).
**Consequence:** the alarm grid is solid; the systemic gaps are the always-on firehose + one immer setState per message fanned out to 24 binding hooks per symbol with **zero `React.memo`** (FE-6), plus missing input debounce/cancellation.

## H-26 — CONFIRMED (no defect)
**Claim:** fallback polling (30s when SignalR disconnected) stops on reconnect and does not stack timers.
**Evidence:** the poll lives in `App.tsx:145-167` — one `setInterval` per auth effect, each tick early-returns when `connectionState === HubConnectionState.Connected`, `clearInterval` in cleanup. `connection.onreconnected` sets Connected (`alarmStore.ts:471-472`); reconnect cycles don't re-run the effect; `initialize` is single-flighted (:316,339). No stacking (FE-9).
**Amendment:** `refreshActiveAlarms`/`hydrateAlarmsFromApi` is **not** single-flighted, so a >30s hydration during a long outage can overlap the next tick (interleaving upserts/reconciles) — a correctness edge, not a timer leak.
**Consequence:** poll-fallback design is sound; only the missing overlap guard is worth hardening.

## H-27 — CONFIRMED (scoped)
**Claim:** Containers run as root, images pinned by tag not digest; resource-limit anchors not applied to all services.
**Evidence:** Dockerfile audit (SO-1) — 7 of 8 Traverse .NET services + both nginx frontends + both Python images have no `USER`; no `@sha256` digest anywhere; `deploy:|resources:|mem_limit|cpus:` → **∅ config on any of 37 services** (SO-3, only a comment + an unused anchor).
**Amendment:** 4 images **are** non-root (ams-api, historian-bff, sparkplug-edge-node, auth-service). No `cap_drop`/`read_only`/`security_opt` anywhere; the json-file log-rotation anchor is defined but referenced by nothing.
**Consequence:** a compromised Traverse service has in-container root; any one container can exhaust host RAM/CPU/disk (unrotated logs) and down the single-host stack.

## H-28 — PARTIALLY REFUTED
**Claim:** No graceful-shutdown handling in Kafka consumer background services (offset commit + drain on SIGTERM).
**Evidence:** 7 of 10 AMS.Api consumers call `consumer.Close()` in `finally`; NormalizedAlarmConsumer additionally drains its batch before Close (`KafkaConsumerService.cs:231-238`); audit/cplm/analysis consumers also Close (SO-5).
**Amendment:** the real defects are failure-path, not SIGTERM: (i) AlarmStateDelta/ReplayResult/DriftAlert consumers never `Close()` (dispose only); (ii) the FlushBatch failure path silently drops a batch behind a **stub DLQ** (`KafkaConsumerService.cs:286-291`); (iii) the revoked-partition handler calls bare `c.Commit()` committing un-persisted positions (:159); (iv) HttpAckWritebackService auto-commit = at-most-once ack writeback; (v) notification-service continues past failed messages with a "DLQ here" comment.
**Consequence:** shutdown is mostly clean; correctness risk concentrates in the failure/rebalance paths (captured as H-33/H-34/H-35).

---

## New hypotheses (discovery sweep, H-29+)

## H-29 — CONFIRMED
**Finding:** `/hubs/observability` SignalR hub has no `[Authorize]` (contrast `AlarmHub.cs:22`); `ObservabilityHub` class declaration carries none (SO-15). Drift alerts, alarm-state deltas, and replay-state deltas stream to any connecting client. **Severity candidate S2.**

## H-30 — CONFIRMED
**Finding:** Browser→EMQX MQTT-WS is fully anonymous — `mqttStore.ts:239-245` sends no credentials, EMQX runs `EMQX_ALLOW_ANONYMOUS: "true"`, and nginx `/mqtt-ws` (nginx.conf:150) exposes it publicly. Live Sparkplug process values are readable, and DDATA/NCMD injectable, by anyone reaching the endpoint. The binding-resolver asset-scope check governs *resolution*, not the subscription. **S1 candidate** (combines H-17 + H-01).

## H-31 — CONFIRMED
**Finding:** No access-token revocation. 15-min RS256 access tokens are validated by signature/exp only; deactivating or deleting a user does not invalidate live tokens (no blocklist). Refresh tokens are DB-backed single-use, but access tokens are not checked against the DB (`auth.service.ts:204` blocks refresh only). **S2 candidate.**

## H-32 — CONFIRMED
**Finding:** No key-rotation tooling. A single RSA keypair is generated once (`generate-keys.ts:19-22` refuses to overwrite); JWKS exposes one key; no overlap/grace mechanism; `rotat` search → **∅** in scripts (SO-11). Rotation requires manual PEM replacement + restart. **S2/S3 candidate.**

## H-33 — CONFIRMED
**Finding:** Silent alarm-batch loss on DB failure. The projection consumer's DLQ is a stub that only logs (`KafkaConsumerService.cs:286-291`); on a transient Postgres error the 100-event batch is dropped (`finally { batch.Clear(); offsets.Clear(); }`), contradicting the class header "exactly-once processing". Events reappear only after a restart rewinds to the committed offset. **S1 candidate.**

## H-34 — CONFIRMED
**Finding:** Rebalance commits un-persisted offsets. `SetPartitionsRevokedHandler` calls bare `c.Commit()` (`KafkaConsumerService.cs:153-159`), committing consume positions that include messages sitting un-persisted in the in-memory batch — a mid-batch rebalance can commit offsets for events never written to Postgres. **S2 candidate.**

## H-35 — CONFIRMED
**Finding:** ACK writeback is at-most-once. `HttpAckWritebackService` uses `EnableAutoCommit=true`; offsets can commit before the HTTP POST to the DCS succeeds, so a crash between commit and POST silently drops an operator acknowledgement (compensated only by the Flink ACK-timeout path). **S2 candidate.**

## H-36 — CONFIRMED
**Finding:** `ShelveExpiryService` is fully implemented (`AMS.Api/Program.cs:567-602`, `SELECT alarms.expire_shelved_alarms()` every minute) but appears in **no** `AddHostedService` call (KF/SO logs) — ISA-18.2 shelve expiry never runs. Worse, the SQL function it calls inserts into the never-created `alarms.shelving_actions` table (evidence-E), so it would fail even if registered. **S2 candidate.**

## H-37 — CONFIRMED
**Finding:** Polly is packaged (`AMS.Infrastructure.csproj:25-27`) but has **zero** call sites (CR-4); no retry/circuit-breaker on any HttpClient (FlinkRestClient, AlarmFeed, IotDbWrite, cplm-api clients, historian-bff IoTDbClient all bare). The only resilience is EF `EnableRetryOnFailure`. **S3 candidate.**

## H-38 — CONFIRMED
**Finding:** TimescaleDB "in name only." Extension present but **zero** `create_hypertable`/compression/retention on docker-initialized DBs (DL-2); `03_apply_ef_migrations.sql:183-190` pre-marks the hypertable migration IDs applied without running their bodies. `alarm_history`, `alarm_state_transitions`, `immutable_events`, and all CPLM result tables are plain heap tables that grow unbounded. **S1/S2 candidate** (data-volume availability failure over time).

## H-39 — CONFIRMED
**Finding:** `alarms.alarm_history` has readers (KPI dashboard, history search) but **no writer** anywhere in the repo (DL-8, search logs S8-S10). The history/KPI surfaces read a table nothing in-repo populates. **S2 candidate.**

## H-40 — CONFIRMED
**Finding:** Five init scripts lack `\c` and execute against `ams`: `17_display_background_token_migration`, `18`, `19`, `21` error against schemas that live only in other DBs; `20_display_media_assets` creates `displays.media_assets` in the **wrong** database. Services self-heal at startup, masking it. **S3/S4 candidate.**

## H-41 — CONFIRMED
**Finding:** Four Flink jobs are in no submission or supervision mechanism at all — AlarmKpiStreamJob, AlarmStateExportJob, LoopKpiStreamJob, StateDriftDetectionJob — yet ams-api consumers (KpiConsumer, AlarmStateDeltaConsumer, DriftAlertConsumer) idle forever waiting on their output topics (evidence-C §3.3). AlarmStateExportJob additionally has no checkpointing and keys on a field (`Id`/`id`) that `current-alarm-state` JSON doesn't carry (it uses `alarmId`), so it keys everything to "unknown". **S3 candidate** (dead features presented as live).

## H-42 — CONFIRMED
**Finding:** `live.metrics` carries two incompatible schemas — LiveStateJob writes alarm-shaped records, `scripts/sim/process_value_sim.py` writes process-value-shaped `{device,metric,value}`; the edge node's metric branch expects the latter. The supervisor comment concedes it "already carries two". **S4 candidate.**

## H-43 — CONFIRMED
**Finding:** Prometheus runs `--web.enable-admin-api` unauthenticated on host :9090 (docker-compose.yml:1135-1141) — anonymous TSDB deletion; prometheus.yml commits EMQX basic-auth `admin/public` (:61-63) that doesn't match compose's own EMQX default; Grafana provisioning dir contains zero dashboards. **S4 candidate.**

## H-44 — CONFIRMED
**Finding:** The Flink JAR is a bind mount from the local working tree (`../../src/flink/target/ams-flink-1.0-SNAPSHOT.jar`) in 7 containers — a local `mvn package` silently changes the running "production" job binary; no image-baked artifact. **S4 candidate.**

## H-45 — CONFIRMED
**Finding:** notification-service has zero auth wiring and blocks `Host.StartAsync` (its consumer loop runs without `Task.Yield`/`Task.Run` before `consumer.Consume`), the exact boot-hang bug audit-service documents against; it is also absent from the CI build matrix and from compose. **S3/S4 candidate.**

---

## GATE 1 — verification summary (recorded; execution continued per user instruction)

> The framework specifies a human approval gate here. The user directed a single continuous run ("don't stop after a phase — complete all phases one by one"), so this gate is **recorded, not blocking**. The summary below is what would have been presented for approval.

**Counts by verdict:** CONFIRMED 20 · confirmed-with-amendment 3 (H-04, H-07, H-18) · AMENDED 2 (H-13, H-14) · MIXED 1 (H-25) · partially-REFUTED 2 (H-16, H-28) · UNVERIFIED 0. New discovery findings: 17 (H-29..H-45), all CONFIRMED. **Zero hypotheses lack a code citation.**

**REFUTED / AMENDED items highlighted:**
- **H-16 REFUTED for AMS.Api** — it does have a (weak, global-bucket, 3-endpoint) rate limiter; the gap is per-client scope + Traverse-service coverage.
- **H-28 partially REFUTED** — shutdown is mostly clean; the danger moved to failure/rebalance paths (H-33/34/35).
- **H-13 AMENDED** — Redis is 512mb (not ~200MB); eviction-vs-contract conflict stands.
- **H-14 AMENDED** — the claimed unique key has **no DB backing** and the live table has no server dimension; strictly worse than the hypothesis.
- **H-07 AMENDED** — effective guarantee is **below** at-least-once (possible loss), worse than hypothesized.

**New S1/S2 candidates raised at the gate (not in the original hypothesis set):**
- **S1:** H-30 (anonymous broker via public `/mqtt-ws`), H-33 (stub DLQ drops alarm batches), H-38 (no retention → unbounded table growth).
- **S2:** H-29 (unauthenticated observability hub), H-31 (no token revocation), H-34 (rebalance commit of un-persisted offsets), H-35 (at-most-once ACK writeback), H-36 (shelve expiry never runs + broken SQL), H-39 (alarm_history no writer), H-41 (dead Flink jobs feeding idle consumers).

Proceeding to Phase 2 (grading, load model, target designs).
