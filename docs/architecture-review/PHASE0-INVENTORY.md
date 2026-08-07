# PHASE 0 — Inventory and Ground-Truthing

**Document type:** Phase 0 output (service / job / topic inventory + documentation-drift delta list)
**Reviewed commit:** `4e2758c951df06a170f35d23313824cb57c9ef03` (branch `main`)
**Date:** 2026-08-08
**Method:** Static analysis only. No `docker compose up`, no builds, no test execution. Every row is code-verified; `file:line` citations live in [EVIDENCE-APPENDIX.md](./EVIDENCE-APPENDIX.md) and the six raw evidence reports it indexes.
**Scope exclusion:** `src/xmlgraphics-batik-main ScreeN Import/` (retired legacy reference app) ignored throughout.

Verification legend: **✓ code-verified** · **~ verified with amendment** · **✗ contradicts review-pack docs** · **UNVERIFIED**.

---

## 1. Service inventory

Ports, databases, Kafka topics, and auth mechanism per deployed service. "Auth" column: `JWT` = validates RS256 user tokens via JWKS; `+SvcKey` = also accepts `X-Service-Key` full-permission principal; `none` = no authentication wiring.

| Service | Image / build | Host port → cont. | Database | Consumes (Kafka) | Produces (Kafka) | Auth | Runs as |
|---|---|---|---|---|---|---|---|
| ams-api | build `src/backend` + `infra/docker/api/Dockerfile` | 8000 | `ams` | current-alarm-state, lifecycle-events, ack-writeback, kpi-alarm-rates, kpi-standing-snapshots, loop.samples.v1, flink.state.alarm.delta/replay, system.state.drift.alerts | raw-alarms, operator-actions, ack-results, lifecycle-alerts | JWT (own JwksKeyCache), `Security:DisableApiAuthorization` kill-switch | non-root `amsuser` |
| ams-frontend (nginx) | build `src/frontend-ob` + `infra/docker/frontend/Dockerfile` | 3000→80 | — | — | — | none (pure proxy) | **root** |
| auth-service | build `src/services/auth-service` (Node 18) | 3002 | `traverse_auth` | — | — | issuer (RS256) | non-root `nodejs` |
| asset-model | build `.../asset-model` | 5001→5000 | `traverse_assets` | — | asset-events (Redis pub) | JWT +SvcKey (shared TraverseAuth) | **root** |
| binding-resolver | build `.../binding-resolver` | 5002→5000 | none | — | — | JWT +SvcKey; also a service *client* to asset-model | **root** |
| display-service | build `.../display-service` | 5003→5000 | `traverse_displays` | — | audit-events | JWT (hand-rolled, no SvcKey) | **root** |
| template-service | build `.../template-service` | 5004→5000 | `traverse_templates` | — | — | JWT +SvcKey | **root** |
| analysis-service | build `.../analysis-service` | 5005→5000 | `traverse_analysis` | analysis.results | analysis.commands, analysis.executions | JWT +SvcKey (1 route anon) | **root** |
| cplm-api | build `.../cplm-api` | 5006→5000 | `traverse_cplm` | clpm.gate.results.v1, clpm.feature.short.v1, clpm.feature.long.v1 | ams.metadata.updates, audit-events | JWT +SvcKey; mutation-gate middleware | **root** |
| historian-bff | build `.../historian-bff` | 8090 | none | — | — | JWT +SvcKey | non-root `appuser` |
| audit-service | build `.../audit-service` | 8095→8080 | `traverse_audit` | audit-events | — | JWT +SvcKey | **root** |
| sparkplug-edge-node | build `.../sparkplug-edge-node` (Java) | none | none (Redis + IoTDB REST) | live.alarms, live.metrics, live.loop.metrics | — (→ EMQX Sparkplug + Redis) | MQTT user/pass (edge only) | non-root `appuser` |
| notification-service | `src/services/notification-service` | **not in compose** | none | root-cause-events | — | **none** | — |
| opc-connector | `src/services/opc-connector` | **stub** (`.dockerignore` only) | — | — | — | — | — |

**Shared infra:** postgres (`timescale/timescaledb:latest-pg15`, host 5433), iotdb (`apache/iotdb:1.3.2-standalone`, 6667/8181/9091), redis (`redis:7.2-alpine`, 6380), emqx (`emqx/emqx:5.6.0`, 1883/8083/8084/18083), kafka (`confluentinc/cp-kafka:7.5.3` broker id 1) + zookeeper (`cp-zookeeper:7.5.3`), flink-jobmanager/taskmanager (`flink:1.18.1-java11`), 4 one-shot flink-job-submit* + 1 flink-job-supervisor, prometheus/grafana + 3 exporters, pgadmin/cloudbeaver/kafka-ui/iotdb-workbench. **37 services on one bridge network `ams-backend`, no segmentation.**

**Auth mechanism reality:** three independent JWT validators exist — the shared `_shared/TraverseAuth.cs` (byte-copied into 7 services), `display-service`'s hand-rolled JwtBearer, and `ams-api`'s own `AMS.Api.Auth.JwksKeyCache`. Only the shared copy is covered by the sync script + CI drift check.

---

## 2. Flink job inventory

Checkpoint config and sink guarantee **as found in code** (`src/flink/...`), not as documented. **No job sets a Kafka sink `DeliveryGuarantee` or `setTransactionalIdPrefix`** — every `KafkaSink` builder is bare (bootstrap + serializer + `build()`). State backend/checkpoint dir come from compose `FLINK_PROPERTIES`, not code.

| Job class | Checkpoint (code) | Sources (topic / offset) | Sinks | Sink guarantee | Scheduled by |
|---|---|---|---|---|---|
| OpcEventStreamJob | 30s **EXACTLY_ONCE**, RETAIN_ON_CANCELLATION | raw-alarms, operator-actions, ack-results | current-alarm-state, lifecycle-events, ack-writeback, root-cause-events | **none set → NONE default** | one-shot + supervisor |
| LiveStateJob | 30s AT_LEAST_ONCE | current-alarm-state (latest) | live.alarms, live.metrics | none set → NONE | one-shot + supervisor |
| IoTDBPersistenceJob | 60s AT_LEAST_ONCE | raw-alarms (earliest) | IoTDB (session, batch) | IoTDB idempotent | one-shot + supervisor |
| CplmShortFeatureStreamJob | 180s EXACTLY_ONCE | loop.samples.v1 (committed/EARLIEST) | clpm.feature.short.v1 | none set → NONE | one-shot + supervisor |
| CplmLongDiagnosticsStreamJob | 300s EXACTLY_ONCE | loop.samples.v1 | clpm.feature.long.v1 | none set → NONE | one-shot + supervisor |
| CplmGateFusionStreamJob | 180s EXACTLY_ONCE | clpm.feature.short/long.v1 | clpm.gate.results.v1 | none set → NONE | one-shot + supervisor |
| LoopLiveRbeJob | 60s EXACTLY_ONCE | loop.samples.v1 (latest) | live.loop.metrics (supervisor override) | none set → NONE | supervisor only |
| AnalysisExecutionJob | 60s AT_LEAST_ONCE | analysis.executions (earliest) | analysis.results | none set → NONE | **host `ensure_flink_jobs.py` only** |
| AlarmKpiStreamJob | 60s EXACTLY_ONCE | lifecycle-events (latest) | kpi-alarm-rates, kpi-standing-snapshots | none set → NONE | **nothing** |
| AlarmStateExportJob | **no checkpointing** | current-alarm-state (latest) | flink.state.alarm.delta | none set → NONE | **nothing** (also keys on wrong field) |
| LoopKpiStreamJob | 180s EXACTLY_ONCE | loop-raw-data (**no producer**) | loop-kpis-5m | none set → NONE | **nothing** |
| StateDriftDetectionJob | **no checkpointing** | alarm.events.raw + alarm.state.active (**no producers**, shared group) | system.state.drift.alerts | none set → NONE | **nothing** |
| CplmGateStreamJob (legacy) | 300s EXACTLY_ONCE | loop.samples.v1 | clpm.gate.results.v1 | none set → NONE | **deliberately none** (double-produce) |
| CplmHistoricalReplayJob | batch, none | `--input-topic` (bounded) | clpm.gate.results.v1 | none set → NONE | cplm-api REST (on demand) |
| AlarmReplayEngine | 30s EXACTLY_ONCE | alarm.events.raw (**no producer**) | flink.state.alarm.replay | none set → NONE | ams-api REST — **broken** (`/jars` always empty) |

Build: single shaded JAR (`ams-flink-1.0-SNAPSHOT.jar`, Flink 1.18.1 / Java 11, `flink-connector-kafka 3.0.1-1.18`, `flink-iotdb-connector 1.3.2`), bind-mounted read-only into 7 containers from the local working tree. Checkpoint storage: `file:///flink-checkpoints` (local Docker volume). **No `high-availability` keys anywhere in compose; no savepoint restore in any submit path.**

---

## 3. Topic inventory — provisioned vs consumed

Kafka runs `auto.create.topics.enable=true`, so there is no explicit provisioning manifest; topics exist because code produces to / consumes from them (default 4 partitions, RF=1, 24h retention). Health of each as found in code:

| Topic | Producer(s) | Consumer(s) | Status |
|---|---|---|---|
| raw-alarms | ams-api ingest | OpcEventStreamJob, IoTDBPersistenceJob, TelemetryDeadman | live |
| operator-actions | ams-api | OpcEventStreamJob | live |
| ack-writeback | OpcEventStreamJob | ams-api HttpAckWriteback | live |
| ack-results | ams-api | OpcEventStreamJob | live |
| lifecycle-events | OpcEventStreamJob, ams-api | AlarmKpiStreamJob (unscheduled), ams-api, AckSlaWatchdog | live |
| current-alarm-state | OpcEventStreamJob | LiveStateJob, AlarmStateExportJob (unscheduled), ams-api projector | live |
| root-cause-events | OpcEventStreamJob | notification-service (not deployed) | degraded |
| **lifecycle-alerts** | TelemetryDeadmanWatchdog, AckSlaWatchdog | **NONE** | **ORPHAN — safety alerts to void** |
| live.alarms / live.loop.metrics | LiveStateJob / LoopLiveRbeJob | sparkplug-edge-node | live |
| live.metrics | LiveStateJob (alarm-shaped) **and** process_value_sim (pv-shaped) | sparkplug-edge-node | **dual-schema** |
| loop.samples.v1 | simulators/replay scripts only (no in-`src` service producer) | CPLM Short/Long, LoopLiveRbe, RawLoopIotDbConsumer | live (sim-fed) |
| clpm.feature.short/long.v1, clpm.gate.results.v1 | CPLM Flink | CplmGateFusion, cplm-api consumers | live |
| kpi-alarm-rates, kpi-standing-snapshots, loop-kpis-5m | AlarmKpi/LoopKpi (unscheduled) | ams-api KpiConsumer | **consumer idles — producer never runs** |
| flink.state.alarm.delta | AlarmStateExportJob (unscheduled) | ams-api AlarmStateDeltaConsumer | consumer idles |
| flink.state.alarm.replay | AlarmReplayEngine (broken submit) | ams-api ReplayResultConsumer | consumer idles |
| system.state.drift.alerts | StateDriftDetectionJob (unscheduled) | ams-api DriftAlertConsumer | consumer idles |
| loop-raw-data, alarm.events.raw, alarm.state.active, clpm.normalized.samples.v1 | **NONE** | jobs that never run | dead inputs |
| raw-alarms-dlq, ack-writeback-dlq | config-declared only | none | declared, never published |
| audit-events | display-service, cplm-api | audit-service | live |
| ams.metadata.updates | cplm-api | all CPLM jobs (broadcast) | live |

---

## 4. Documentation-drift delta list

Every place where **code contradicts the review-pack docs** (`docs/architecture-review/00-INDEX.md`..`10-cleanup-and-reorg.md`) or the architecture docs. Code wins; each drift is itself a finding (S4 minimum per framework §1.3.2).

| # | Doc claim | Code reality | Where |
|---|---|---|---|
| D-1 | ✗ Flink checkpoint mode "EXACTLY_ONCE 30s" delivers exactly-once (05-flink-jobs.md:22) | Checkpoint *mode* is EXACTLY_ONCE but **no sink sets a DeliveryGuarantee**; connector default is NONE → records can be **lost** across a TM crash. 05-flink-jobs.md:93 half-acknowledges "at-least-once" but understates it. | all `KafkaSink` builders |
| D-2 | ✗ "supervisor re-submits **7** standing jobs" (02/05) and supervisor header says "six" | Supervisor has **7** `submit_if_missing` calls; its own header comment says "six" — stale. `ensure_flink_jobs.py` has an **8th** (AnalysisExecutionJob) that the supervisor lacks. | flink-job-supervisor.sh:81-109 |
| D-3 | ✗ Redis "~200 MB" implied; "`volatile-lru` (TTL keys only)" positioned as safe contract | `--maxmemory 512mb`; snapshot keys **carry TTL (3600s)** so they ARE evictable under pressure — the "paint-on-open contract" is on evictable keys. No `requirepass`. | docker-compose.yml:109-115 |
| D-4 | ✗ "projection upsert key serverId+sourceName+conditionName+subConditionName" backed by unique index (H-14 premise, echoed in 09-databases.md) | Live table `alarm_current` has **no server_id column** and only `UNIQUE(alarm_id)`. No unique index on the 4 columns exists in `database/`. Match predicate ignores serverId and is unindexed. | 02_alarm_schema.sql:37-52; AmsDbContext.cs:29,68 |
| D-5 | ✗ "Timescale + extensions … hypertables" (09-databases.md, 06) | TimescaleDB extension present but **zero** `create_hypertable`/compression/retention on docker-initialized DBs; EF migration IDs are pre-marked applied without running. | 03_apply_ef_migrations.sql:183-190 |
| D-6 | ✗ `raw-opc-events` is the ingest topic (00-INDEX / architecture_document.md / CLAUDE.md) | Code ingress topic is **`raw-alarms`**; `raw-opc-events` appears only in docs. | AlarmIngestionService.cs:158 |
| D-7 | ✗ CLAUDE.md: "`AlarmStreamProcessorService` is a fallback when `Kafka:UseFlinkOrchestration` is false" | Setting the flag false now **throws at startup**; the fallback path was removed. Flink-only is hard-enforced. | Program.cs:114-125 |
| D-8 | ✗ EMQX "anon allowed in lab; edge still sends username/password" implies auth is meaningful | **No authenticator/ACL configured at all**; the `EMQX_ALLOW_ANONYMOUS` var is (per compose's own comment) not even the EMQX 5.x mechanism; browsers connect with no creds via public `/mqtt-ws`. | docker-compose.yml:140-157; nginx.conf:150 |
| D-9 | ✗ `lifecycle-alerts` catalog row "(none wired)" treated as benign (complete-project-workflow.md:441) | The two producers are the **safety-critical** deadman + ACK-SLA watchdogs; publishing to a topic with no consumer means a dead OPC feed raises no operator alert. | TelemetryDeadmanWatchdogService.cs:153-157 |
| D-10 | ✗ `docker-compose.streampipes.yml` is the production ingest overlay (.env.example:59-70) | File **does not exist** in `infra/`. StreamPipes ingest path is not present in the repo. | Glob `infra/docker/*.yml` |
| D-11 | ✗ H-16 premise "no rate limiting in any .NET service" | AMS.Api **does** register a fixed-window limiter (global-bucket, 3 read endpoints); the "alarms-write" policy is registered but attached to nothing. All Traverse services have none. | Program.cs:322-346 |
| D-12 | ✗ H-28 premise "no graceful shutdown in consumers" | 7 of 10 consumers call `consumer.Close()` on stop; the real defects are the stub DLQ and rebalance-commit, not shutdown. | evidence-D §2 |
| D-13 | ✗ `traverse_shared` listed as a live per-service DB (CLAUDE.md, 09-databases.md) | No creation script in `database/scripts/`; only the superseded phase0 creates it; no live service references it. | Search log S4 (evidence-E) |
| D-14 | ~ H-06 "flag exists and can disable authz" | Confirmed; but scope is `MapControllers()` only — SignalR hubs keep `[Authorize]` (AlarmHub) / lack it entirely (ObservabilityHub). | Program.cs:445-446 |
| D-15 | ✗ `AlarmReplayEngine` submittable via ams-api FlinkRestClient (05-flink-jobs.md on-demand table) | Path is **broken by construction**: jar is bind-mounted not uploaded, so `/jars` is always empty — cplm-api's own code documents this. | CplmRecomputeService.cs:22-26 |
| D-16 | ~ `alarm_history` positioned as populated history store | Table has **readers but no writer** anywhere in the repo. | Search logs S8-S10 (evidence-E) |
| D-17 | ✗ Five display/asset init scripts implied to populate `traverse_displays`/`traverse_assets` | Scripts 17_display/18/19/20/21 lack `\c` and run against `ams` — four error, `20` creates `media_assets` in the wrong DB. | Search log S-N (evidence-E) |

---

## 5. Phase 0 exit state

All inputs the framework required for Phase 0 are captured: full compose (1224 lines), nginx.conf (174 lines), every `Program.cs`/entry point, all Flink job classes + submit/supervisor scripts + `ensure_flink_jobs.py`, all `database/scripts/*.sql`, the frontend stores + Designer/AlarmConsole/LiveEvents/Trend trees, and `_shared/TraverseAuth.cs` + `sync-auth-module.ps1` + auth-service source. The service/job/topic inventories above and the 17-item drift list feed Phase 1 verification.

Proceeding to Phase 1 (hypothesis verification H-01..H-28 + discovery sweep → H-29+).
