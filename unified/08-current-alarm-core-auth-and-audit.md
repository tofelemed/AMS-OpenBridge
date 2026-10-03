# Current state: AMS alarm core, hubs, KPIs, gateway surface and audit

Read-only analysis of the AMS-open working tree (branch `feat/v25-next-release`, 2026-09-30). Everything below is
verified against code, SQL or config unless marked **(inferred)**. Where a document disagrees with the code, the code
is reported and the disagreement is flagged.

## 1. Scope and sources examined

| Area | Files read (all paths relative to repo root) |
|---|---|
| Domain | `src/backend/AMS.Domain/Alarms/ActiveAlarm.cs`, `AlarmDomainEvents.cs`, `Repositories/IRepositories.cs`, `IAlarmTransitionRepository.cs`, `Connectivity/OpcConnection.cs` |
| Application | `src/backend/AMS.Application/Alarms/Queries/AlarmQueries.cs`, `Commands/AlarmCommands.cs` (route/handler grep) |
| Infrastructure | `Persistence/AmsDbContext.cs`, `Repositories/AlarmRepositories.cs`, `AlarmTransitionRepository.cs`, `StubRepositories.cs`, `Caching/AlarmReadCache.cs`, `Kafka/AlarmPartitionKeys.cs`, `NormalizedAlarmIngestor.cs`, `KafkaConsumerService.cs`, `LifecycleEventConsumerService.cs`, `StreamMessages.cs`, `StreamEventContracts.cs`, `AckSlaWatchdogService.cs`, `TelemetryDeadmanWatchdogService.cs`, EF migrations |
| API | `AMS.Api/Program.cs`, `Extensions/ServiceCollectionExtensions.cs`, `Auth/GatewayHeaderAuthHandler.cs`, `Hubs/AlarmHub.cs`, `Hubs/ObservabilityHub.cs`, `Controllers/V1/*.cs`, `BackgroundServices/*.cs`, `Services/AlarmEnricher.cs`, `appsettings.json` (keys only) |
| Database | `database/scripts/02_alarm_schema.sql`, `03_apply_ef_migrations.sql`, `24_traverse_audit_db.sql`, `35_alarm_current_identity.sql`, `36_alarm_shelving.sql`, `39_timescale_policies.sql`, `40_alarm_hot_indexes.sql`, `50_alarm_ack_lifecycle.sql`, `17_traverse_auth_schema.sql`, `37_rbac_catalog.sql` |
| Flink | `AlarmKeys.java`, `AlarmKpiStreamJob.java`, `AlarmKpiResult.java`, `OpcEventStreamJob.java` (sinks/topology), `RawOpcAlarmEvent.java`, `IoTDBPersistenceJob.java`, `LiveStateJob.java` |
| Services | `src/services/audit-service/*`, `asset-model/Models/Asset.cs`, `binding-resolver/Services/PathResolver.cs` + `Program.cs`, `gateway/appsettings.json` + `Program.cs`, `auth-service/src/services/auth.service.ts`, audit emitters in display-service / cplm-api / auth-service / ingestion-service |
| Frontend | `src/frontend-ob/src/store/alarmStore.ts`, `components/Designer/SymbolRenderer.tsx`, `AlarmConsole/AlarmConsole.tsx`, `api/auditApi.ts` |
| Docs | `docs/api-gateway.md`, `docs/alarm-identity-contract.md`, `docs/ams-alarm-architecture.md`, `docs/architecture-review/09-gap-register.md`, `architecture_document.md`, `MIGRATION_LOG.md` decisions, `prod_decision.md`, `conversion.md`, `changes_tracker.md` (release sections), `migration/deploy/docker-compose.marun.yml`, `migration/deploy/deploy.sh`, `migration/kafka/topics.txt`, `migration/04b-submit-flink-jobs.sh` |

## 2. How it works today

### 2.0 Where the alarm lane actually runs

The **plant (Marun) deployment runs the CPA / loop-performance lane, not the alarm lane.** `prod_decision.md:1-16`
describes production as "CPA / loop performance", with **no TimescaleDB** at the plant. In the plant compose,
`ams-api` sits behind the opt-in profile `cpa-ams-api` (`migration/deploy/docker-compose.marun.yml:204-205`) and
`deploy.sh:70-72` warns "ams-api needs an 'ams' database this cut does not create"; `migration/kafka/topics.txt:5` says
the `traverse.alarm.*` topics are "not created by 04 this cut"; `04b-submit-flink-jobs.sh:98-138` submits only the seven
`com.ams.flink.cplm.*` jobs. Everything in §2.1–2.5 is therefore **lab-proven, not plant-proven**.

### 2.1 Alarm identity and asset linkage

- **Row identity.** `alarms.alarm_current` has `id UUID PK`, `alarm_id VARCHAR(255) UNIQUE` (`02_alarm_schema.sql:38-39`)
  and, since Plan 01, the enforced logical identity `uq_alarm_current_identity ON (server_id, source, condition,
  COALESCE(sub_condition,''))` (`35_alarm_current_identity.sql:54-55`). The DTO comment names it: "the intended identity
  has always been serverId + sourceName + conditionName + subConditionName" (`35_...sql:14-15`).
- **Deterministic GUID.** `.NET` `AlarmPartitionKeys.AlarmInstanceKeyV1` = `v1|{serverId}|{source}|{condition}|{subCondition}`,
  hashed MD5 → GUID by `DeterministicAlarmId` (`AlarmPartitionKeys.cs:31-36,53-59`); Flink `AlarmKeys.alarmKey/stableAlarmId`
  is the same MD5 rule (`AlarmKeys.java:11-27`). `LogicalAlarmFamilyId` is the unversioned key for cross-version
  correlation (`AlarmPartitionKeys.cs:42-47`). When Flink supplies a non-GUID `alarmId`, ams-api keeps it as
  `alarm_id` and hashes it for `id` (`NormalizedAlarmIngestor.cs:270-282`).
- **HTTP-feed identity.** The poller sets `alarmId = correlation_id` or `"{tag_name}|{condition}"`
  (`AlarmIngestionService.cs:114-116`), e.g. `"BB26-BF402|Alarm high"` (`IRepositories.cs:13`).
- **The "alarm-identity contract" (DATA-07)** — `docs/alarm-identity-contract.md:8-12`: *identity = the Kafka `alarmId`;
  historian path = `root.ams.site1.alarms.<sanitised>` with `sanitised = alarmId.replaceAll("[^a-zA-Z0-9_]","_")`*.
  binding-resolver is the only derivation service (`GET /resolve/alarm?alarmId=`, `binding-resolver/Program.cs:138-149`);
  the Sparkplug device id deliberately uses a different sanitiser (keeps hyphens), bridged by an `alarmId` metric
  (`alarm-identity-contract.md:26-34`).
- **Plant/area/unit context: none is persisted.** The only context columns are `server_id` and free-text `source`
  (a raw tag name such as `FIC1002`). The HTTP feed record carries `asset`, `area`, `site` fields, but they are used only
  as a *fallback for sourceName* (`AlarmIngestionService.cs:188,324-329`) and never stored. `ActiveAlarmDto.AreaPath`
  is always `null` (`AlarmEnricher.cs:111`). `ActiveAlarmQuery.AreaIds` exists (`IRepositories.cs:127`) but is never
  applied (`AlarmRepositories.cs:76-99`). The hub has `SubscribeToArea` → group `area-{areaId}` (`AlarmHub.cs:102-105`)
  but no publisher ever targets an `area-*`, `role-*` or `station-*` group (`AlarmHub.cs:301-343`).
- **No join to `traverse_assets` today.** grep of `src/backend` for `traverse_assets|asset-model|unsPath|assetPath`
  returns nothing. asset-model computes `Asset.AlarmSource = "{site}:{unit}:{device}"` (`asset-model/Models/Asset.cs:154-165`,
  EF-ignored at `AssetDbContext.cs:66`) and binding-resolver's alarm binding advertises
  `AlarmApiEndpoint = /api/v1/alarms/active?sourceNameContains=<site:unit:device>` (`PathResolver.cs:317-335`).
  Because `alarm_current.source` holds raw tag names, that filter cannot match **(inferred)**; no frontend code consumes
  the resolver's alarm binding (grep `binding.alarm|.alarm?.` → none). Designer symbols bind by `item.alarmSource` =
  raw sourceName looked up in `alarmIndexBySource` (`Designer/types.ts:36`, `SymbolRenderer.tsx:120-123`).
- **Doc vs code:** `architecture_document.md:134` says Flink "enriches it with asset data"; `PipelineOperators.EnrichmentMap`
  (`PipelineOperators.java:161`) and `RawOpcAlarmEvent.java:5-37` carry no area/unit/asset field. Code wins: alarms carry
  a tag name only.

### 2.2 Domain model and storage

**Enums** (`ActiveAlarm.cs`): `AlarmPriority` Critical/High/Medium/Low/Diagnostic mapped to OPC severity bands
900-1000/700-899/400-699/100-399/1-99 (:8-15); `AlarmState` UnacknowledgedUncleared, AcknowledgedUncleared,
UnacknowledgedCleared, AcknowledgedCleared, Shelved, SuppressedByDesign, OutOfService, Inhibited (:21-31);
`AlarmEventType` Simple/Tracking/Condition; `AlarmCategory` (8 values); `SourceType` (10 values).

**Persistence reality.** EF maps `ActiveAlarm` → `alarms.alarm_current` and **ignores** AlarmTagId, EventType, Priority,
Category, Quality, ConditionActive, ActiveTime, ShelveComment, all suppression metadata, IsOutOfService, CorrelationId,
RootCause*, ProcessValue/Unit (`AmsDbContext.cs:86-124`). Consequences at read time: Priority is re-derived from severity
(`AlarmEnricher.cs:62-69`), Category hardcoded `Process` (:83), `IsOutOfService` always `false` (:93), `QualityGood`
always `true` (:94). DB `state` vocabulary is `ACTIVE|CLEARED|SHELVED|SUPPRESSED|OUT_OF_SERVICE|INHIBITED` plus
`ack_status` (`AmsDbContext.cs:127-141`; reconciled in `AlarmEnricher.ResolveEffectiveState` :121-126). The active list is
`state ∈ {UnackedUncleared, AckedUncleared}` (`AlarmRepositories.cs:79`); **cleared alarms are deleted from
`alarm_current`** (`NormalizedAlarmIngestor.cs:135-139,153-157,187-192`).

| Table (`ams` DB) | Key columns | Storage facts |
|---|---|---|
| `alarms.alarm_current` | id, alarm_id, server_id, source, condition, sub_condition, severity, message, event_time, state, ack_status, opc_attributes jsonb, custom_attributes jsonb, ack_time, acked_by, ack_comment, is_shelved, shelve_until, shelved_by, is_suppressed | bounded hot table; indexes state+time, source, trigram (`40_alarm_hot_indexes.sql:25-30`) |
| `alarms.alarm_history` | alarm_id, source, severity, condition, sub_condition, event_time, state, ack_status, cleared_time | hypertable 1-day chunks, compress after 7 d, **retention 730 d** (`39_timescale_policies.sql:58-66`); writer = projection consumer `AppendHistoryAsync` (`AlarmRepositories.cs:292-306`) |
| `alarms.alarm_state_transitions` | alarm_id, server_id, source_name, from_state, to_state, transition_time, triggered_by | hypertable (EF migration `20260530160000`); **read-only** — `AlarmTransitionRepository.cs:59` is the only reference; no writer in `src/` |
| `alarms.historical_alarms` | server_id, source_name, condition_name, timestamp, alarm_state, priority | hypertable; write path removed ("dead", `IRepositories.cs:46-48`) |
| `alarms.shelving_actions` | alarm_id, action SHELVED/UNSHELVED/AUTO_EXPIRED, shelve_until, comment, operator_station | written only by `alarms.expire_shelved_alarms()` (`36_alarm_shelving.sql:71-76`); no .NET writer found |
| `soe.*` | — | **no tables**; `SoeEventRepository` is a stub returning empty pages (`StubRepositories.cs:6-10`) |
| `configuration.opc_servers`, `opc_connections` | name, endpoint, StreamPipes ids, status | connection registry (`OpcConnection.cs:8-26`) |

**ISA-18.2 operations.** `Acknowledge` (refused if shelved), `Shelve` (comment mandatory, default max 480 min),
`Unshelve`, `Suppress`, `SetOutOfService` (`ActiveAlarm.cs:167-249`). Shelve expiry: `ShelveExpiryService` calls the SQL
function every minute (`ShelveExpiryService.cs:29,41`). ACK is stream-driven: the API publishes `OPERATOR_ACK_COMMAND` to
`traverse.alarm.operator-actions`; Flink orchestrates writeback; `ack_time/acked_by/ack_comment` and the lifecycle
projection are persisted since script 50 (`50_alarm_ack_lifecycle.sql:15-24`).

**NE107 quality.** Not implemented in the alarm core: `Quality` is a raw OPC code (`QualityGood => Quality >= 192`,
`ActiveAlarm.cs:98-99`) and is EF-ignored. grep `NE107` in `src/backend` → 0 hits; NE107 exists only in CPM instrument
health (`cplm-api/Controllers/CpmInstrumentHealthController.cs`, `GateCatalog.cs`), ingestion profiles, and designer
symbol styling. Decision #11 "Quality mandatory on reopen (NE107/ISA-18.2)" (`MIGRATION_LOG.md:299`) is unrealised for alarms.

### 2.3 SignalR hubs

- **`AlarmHub`** at `/hubs/alarms`, `[Authorize]` (any authenticated principal), WebSockets + SSE
  (`AlarmHub.cs:22-23`, `Program.cs:341-345`). On connect it auto-joins `role-{role}` and `station-{operator_station}`
  (`AlarmHub.cs:51-55`; the `operator_station` claim is never issued by auth-service — `auth.service.ts:89-97` signs
  `sub, user_id, preferred_username, username, email, role, permission[]` only). Client methods: `SubscribeToServer`,
  `UnsubscribeFromServer`, `SubscribeToArea`, `SubscribeToPriority` (CRITICAL…DIAGNOSTIC), `Ping` (:89-116).
- **Server → client events** (`IAlarmHubClient`, :124-161): `OnNewAlarm`, `OnAlarmUpdated`, `OnAckLifecycleUpdated`,
  `OnAlarmCleared`, `OnBulkAlarmsUpdated`, `OnFloodAlert`, `OnServerStatusChanged`, `OnSoeEvent`, `OnAnalyticsUpdate`,
  `OnConnected`, `OnHeartbeat`, `OnAlarmKpiUpdate`. `AlarmSignalRPublisher` publishes to `Clients.All`, plus
  `alarms-{PRIORITY}` and `server-{serverId}` (:301-343) — so **every client receives every alarm**; group scoping is
  cosmetic. `AlarmHubPayload` (:165-198) carries ServerId, SourceName, Condition, SubCondition, Severity, Priority, State,
  ack/shelve flags, epoch times, `LogicalAlarmFamilyId`, `CustomAttributes`; `ServerName` is `""` and `AckedByUsername`
  `null` (:379,395). No area/asset/unit field.
- **`ObservabilityHub`** at `/hubs/observability`, `[Authorize(Policy="system.manage")]` (`ObservabilityHub.cs:35`):
  `OnAlarmStateDeltaReceived`, `OnReplayDeltaReceived`.
- **Transport settings:** KeepAlive 10 s, ClientTimeout 30 s (prod) (`Program.cs:205-216`); no Redis backplane, single
  instance by design (`Program.cs:222`; `AlarmReadCache.cs:12-14`). Gateway validates `?access_token=` and injects
  `X-Auth-*`; WS activity timeout 24 h (`docs/api-gateway.md:40,59,116`).
- **Frontend:** `alarmStore.ts:470-483` connects with `accessTokenFactory` + `withAutomaticReconnect` (1 s / 3 s / 10 s /
  30 s); `onreconnected` re-hydrates from `GET /alarms/active` and re-subscribes the connected server (:555-565); a 30 s
  REST poll reconciles (:598-604). Subscribers: `App.tsx`, `AlarmConsole`, `Dashboard`, `Analytics`, `LiveEventsPage`,
  `SoePanel`, `Designer/SymbolRenderer`.

### 2.4 KPI and other ams-api endpoints

| Method / path | Policy | Purpose / computation |
|---|---|---|
| `GET /api/v1/alarms/active` | class `[Authorize]` only | paged active list; filters serverId, priority, state, category, sourceNameContains (ILIKE/trigram), isAcknowledged, isShelved, isSuppressed; pageSize ≤ 1000; rate class `alarms-read` (`AlarmsController.cs:42-60`) |
| `GET /api/v1/alarms/active/statistics` | class `[Authorize]` | `AlarmStatsSummary` from `alarm_current`: TotalActive/Critical/High/Medium/Low/Unacknowledged; **Shelved=0, Suppressed=0, AlarmsPerTenMin=0, FloodActive=false hardcoded** (`AlarmEnricher.cs:42-52`) |
| `POST /api/v1/alarms/{id}/acknowledge`, `/acknowledge/batch` | alarm.acknowledge / alarm.acknowledge_batch | publish `OPERATOR_ACK_COMMAND` (`AlarmCommands.cs:36-160`) |
| `POST …/{id}/shelve`, `/unshelve`, `/suppress`, `/out-of-service` | alarm.shelve / alarm.unshelve / alarm.suppress / alarm.suppress | domain op + `SaveChanges` (`AlarmsController.cs:201-300`) |
| `POST /api/v1/alarms/active/purge-lab-data` | alarm.acknowledge | deletes lab-injected rows (:114-118) |
| `GET /api/v1/alarms/historical`, `/historical/stream` | class / alarm.export | `alarm_history` Dapper query, ≤ 365 d window, page ≤ 5000; serverId/category unfilterable (`AlarmRepositories.cs:220-222`) |
| `GET /api/v1/alarms/transitions`, `/transitions/stream` | class / alarm.export | reads `alarm_state_transitions` (empty in practice — no writer) |
| `GET /api/v1/analytics/kpi` | analytics.view | plant-wide SQL over `alarm_history`/`alarm_current`: hourly rates 24 h, chattering (source ≥ 5 events/24 h), fleeting (<60 s), total 24 h, top-10 bad actors 7 d + contribution %, stale (unacked > 15 min), priority distribution (`AnalyticsController.cs:26-101`). **No scope parameter.** |
| `GET /api/v1/admin/opc-servers`; `GET/POST /api/v1/admin/alarm-feed[/test]` | alarm.view; alarm.view / admin.users.edit | feed status / test |
| `/api/v1/opc/connections*` (GET, POST, PUT, DELETE, connect, disconnect, test, browse, sync-from-gateway) | analytics.view read; system.manage writes | OPC/StreamPipes connection lifecycle (`OpcConnectionsController.cs`) |
| `POST /api/v1/Observability/replay` | system.manage | Flink replay submission |
| `GET /api/v1/health/pipeline`, `/kafka`; `/health`, `/health/ready`, `/health/pipeline` | anonymous | liveness = postgres only; pipeline = kafka + flink-ingest (`Program.cs:353-368`) |

**Flink-side KPIs.** `AlarmKpiStreamJob` consumes `traverse.alarm.lifecycle-events` (`AlarmKpiStreamJob.java:43-46`),
counts `ACTIVE` transitions in a 10-min sliding / 1-min step `windowAll` → `traverse.alarm.kpi-alarm-rates` with flood
bands >10 MINOR, >20 MAJOR, >50 SEVERE (:69-79,125-133), and a standing-alarm counter keyed `"GLOBAL"` ("simple global
counter for lab purposes") → compacted `traverse.alarm.kpi-standing-snapshots` (:94-106). `KpiConsumerService` forwards
both to `OnAlarmKpiUpdate` (`KpiConsumerService.cs:27-31,66-68`). **Nothing persists these**; scope is global only.
Not exposed anywhere: per-area/unit rates, MTTA (although `ack_time` is now stored), chattering per alarm family,
priority distribution per scope.

### 2.5 Background workers in AMS.Api (registered `Program.cs:156-189`)

| Hosted service | Group / trigger | Consumes | Writes |
|---|---|---|---|
| `NormalizedAlarmConsumerService` | `ams-backend` | `traverse.alarm.current-alarm-state` (ALARM_STATE_UPSERT / DELETE / ACK_STATE_UPDATE) | upsert/delete `alarm_current`, append `alarm_history`, SignalR, `AlarmReadCache.Invalidate`; DLQ `traverse.alarm.raw-alarms-dlq` (`KafkaConsumerService.cs:101-351`) |
| `LifecycleEventConsumerService` | `ams-backend-lifecycle` | `traverse.alarm.lifecycle-events` | `ApplyAckLifecycle` on the row found by `alarm_id`; `OnAckLifecycleUpdated` (`LifecycleEventConsumerService.cs:37-43,78-116`) |
| `AlarmStateDeltaConsumerService` | `ams-delta-consumer-ui` | `traverse.alarm.flink.state.alarm.delta` | ObservabilityHub (`:32-39,57`) |
| `ReplayResultConsumerService` | `ams-replay-ui-consumer` | `traverse.alarm.flink.state.alarm.replay` | ObservabilityHub |
| `TelemetryDeadmanWatchdogService` | watches `raw-alarms` silence | — | `TELEMETRY_STALLED` → `traverse.alarm.lifecycle-alerts` (consumed by notification-service) |
| `AlarmIngestionService` | `AlarmIngestion:Enabled` (default **false**, `appsettings.json:21`); poll 2 s | HTTP current-alarms feed | delta events → `traverse.alarm.raw-alarms`, server id `f0af9a6d-…` (`AlarmIngestionService.cs:18-28,158`) |
| `HttpAckWritebackService` | `ams-backend-http-ack-writeback`, manual commit | `traverse.alarm.ack-writeback` | POST to DCS ack URL → `traverse.alarm.ack-results` (`HttpAckWritebackService.cs:43-57,174-175`) |
| `KpiConsumerService` | `ams-api-kpi-consumer` | `kpi-alarm-rates`, `kpi-standing-snapshots` | hub only |
| `RawLoopIotDbConsumer` | `traverse-cpa-iotdb-raw-loop` | `Cplm:SamplesTopic` = `traverse.cpa.loop.samples.v1` | IoTDB device `{IotDb:LoopRootPrefix}.{SafeNode(loop_id)}` with pv/sp/op/vp/mode; batch 500 rows / 5 s; pauses on server fault (`RawLoopIotDbConsumer.cs:26-32,72-81,219-245`). Path derives from `loop_id`/`tagId`/key — **no UNS lookup** |
| `ShelveExpiryService` | every 60 s | — | `SELECT alarms.expire_shelved_alarms()` |

**`AlarmStreamProcessorService` does not exist in the tree.** `Program.cs:141-151` *throws* unless
`Kafka:UseFlinkOrchestration` is `true` ("in-service stream processing and .NET ACK orchestration were removed").
`CLAUDE.md` and `architecture_document.md:90` still describe a fallback; the code has none. `AckSlaWatchdogService` is
`[Obsolete]` and unregistered (`AckSlaWatchdogService.cs:10-13`).

### 2.6 Gateway route map (verbatim from `docs/api-gateway.md:24-48`)

| Public path | Upstream service | Upstream path (rewrite) | Auth | Notes |
|---|---|---|---|---|
| `POST/… /api/auth/*` | auth-service :3002 | same path | **anonymous** | login, refresh (httpOnly cookie), logout, JWKS; auth-service enforces its own admin routes |
| `GET /api/auth/.well-known/jwks.json` | auth-service | same | anonymous | RS256 public keys (rotation publishes two — see runbook) |
| `/api/v1/cpm[/**]` | cplm-api :5000 | same path | required | loop performance (CPM/CPLM): loops, KPIs, gates, readiness, recompute |
| `/api/displays[/**]` | display-service :5000 | strip `/api` → `/displays…` | required | display CRUD, content, publish, folders, media assets |
| `/api/bindings/**` | binding-resolver :5000 | strip `/api/bindings` → `/resolve`, `/preview`… | required | UNS path+role → transport resolution |
| `/api/assets[/**]` | asset-model :5000 | strip `/api` → `/assets…` | required | UNS asset CRUD, search, hierarchy, relationships |
| `/api/aliases/**` | asset-model :5000 | strip `/api` → `/aliases…` | required | legacy-tag alias resolution |
| `/api/ingestion/**` | ingestion-service :5000 | strip `/api/ingestion` → `/data-sources…`, `/profiles`, `/stats`, `/unknown-sources` | required | OT data-source configs + phase-2 subscriber ops — `ingestion.view`/`ingestion.manage`, Admin-only |
| `/api/templates[/**]` | template-service :5000 | strip `/api` → `/templates…` | required | element templates + instantiation |
| `/api/analyses[/**]` | analysis-service :5000 | strip `/api` → `/analyses…` | required | derived calculations / analysis defs |
| `/api/audit[/**]` | audit-service :8080 | → `/api/v1/audit…` | required | tamper-evident audit trail (browser alias) |
| `/api/v1/audit[/**]` | audit-service :8080 | same path | required | audit-service's native prefix (tooling parity) |
| `/api/hist/**` | historian-bff :8090 | strip `/api/hist` → `/snapshot`, `/trend`, `/summary`, `/series`… | required | IoTDB reads: snapshots + trends |
| `/api/**` (catch-all) | ams-api :8000 | same path | required | **alarm system**: `/api/v1/alarms*` (list/ack/shelve/suppress/export), SOE, analytics/KPI, admin, OPC connections, observability, replay |
| `/hubs/**` | ams-api :8000 | same path | required (`?access_token=`) | SignalR: `/hubs/alarms` (realtime alarm feed), `/hubs/observability` (drift/replay — needs `system.manage`) |
| `/mqtt-ws` | EMQX :8083 | → `/mqtt` | required (`?access_token=`) | MQTT-over-WebSocket live values (Sparkplug B); EMQX re-authenticates the MQTT CONNECT (JWT as password) |
| `/health` | ams-api | same | anonymous | platform liveness (nginx parity) |
| `/swagger[/**]` | ams-api | same | anonymous | **blocked (404)** unless `Gateway__ExposeSwagger=true` — never in production |
| `/external-api/**` | config-driven (`external-feed` cluster) | → `/api/**` | required | legacy external feed; no consumer in src — decommission candidate |
| `/gw/health` | gateway itself | — | anonymous | gateway liveness |
| `/gw/metrics` | gateway itself | — | anonymous (internal) | Prometheus RED metrics per route |
| `/gw/upstreams` | gateway itself | — | anonymous | cluster inventory |
| `/gw/upstreams/{cluster}/health` | any upstream | → `/health` | anonymous | per-service health passthrough — the replacement for the old `localhost:<port>/health` checks |

Config check: `gateway/appsettings.json:61-295` matches the table except that **no `/external-api` route exists** (only an
`ExternalFeedUrl` comment at :12); `/gw/*` and `/gw/ratelimit` are mapped in `gateway/Program.cs:154-277`.

Beyond auth (`api-gateway.md:54-119`): edge-only RS256 validation against auth-service JWKS, revocation snapshot polled
every 5 s (fail-open on poll failure, bounded by 15-min TTL), inbound `X-Auth-*` stripped; **rate limiting** in Redis
with fixed 60 s windows — login 10/min (IP, enforced in-process on Redis failure), session 60, snapshot 30, historian
120, mutation 120 (in-process on failure), read 600, global 2000; Redis circuit breaker opens after 3 consecutive
failures for 30 s and decides from local counters ("fail closed = enforced locally, never deny everyone"); **response
cache** allow-list only (assets/aliases 60 s, displays 30 s, bindings/resolve 30 s, hist trend/summary 10 s, templates
60 s; alarm state, ACK/shelve, hubs, CPM, auth, audit never cached), keyed per user; body limits (ACK ≤ 4 KB, display JSON
≤ 2 MB, default 256 KB); YARP passive health (dead upstream → 503 in ms; a 5xx never trips it); connect timeout 5 s.

### 2.7 Audit-service

- **Ingest:** Kafka consumer on `traverse.cpa.audit-events`, group `traverse-cpa-audit`, earliest, manual commit *after*
  the DB append (`AuditEventConsumer.cs:21,31-37,60-63`). Append is serialised under `pg_advisory_xact_lock(101010)` and
  hash-chained (`ImmutableAuditRepository.cs:27-47`); `AuditDbContext.SaveChanges` rejects UPDATE/DELETE except a
  hash-only rechain (`AuditDbContext.cs:64-83`). Table `audit.immutable_events` in `traverse_audit`, created by
  `EnsureCreated()` at startup (`Program.cs:59`; `24_traverse_audit_db.sql:3-13`). WORM S3 archival is opt-in on
  `S3:ServiceUrl` (`Program.cs:39-45`).
- **Schema** (`AuditEvent.cs:8-26`): EventId, TimestampUtc, EventType, UserId, SourceIp, Station, EntityType, EntityId,
  BeforeState/AfterState (jsonb), CorrelationId, PreviousHash, CurrentHash; indexes TimestampUtc, (EntityType, EntityId),
  UserId, CurrentHash unique (`AuditDbContext.cs:36-39`).
- **Retention:** none by design — hash chain is excluded from Timescale policies (`39_timescale_policies.sql:25-28`).
- **Query API** (all `admin.audit.view`): `GET /api/v1/audit?entityType&entityId&userId&eventType&from&to&take(≤500)`
  returns header fields only (no Before/After/Station/SourceIp) (`Program.cs:89-119`); `POST /api/v1/audit/verify`;
  `POST /api/v1/audit/rechain`. Frontend: `api/auditApi.ts`, `Administration/AuditExplorer.tsx`, `Cpm/CpmGovernance.tsx`.
- **Who emits:** display-service (`DISPLAY_CREATED/UPDATED/CONTENT_SAVED/PUBLISHED/UNPUBLISHED/REVERTED/DUPLICATED/RESTORED/DELETED/SHARED/VERSION_RESTORED`,
  `FOLDER_CREATED` — `display-service/Program.cs:339-1177`); cplm-api (`CPM_LOOP_*`, `CPM_EVENT_ACKNOWLEDGED/UNSHELVED/SHELF_EXPIRED`,
  `CPM_EVIDENCE_REPUBLISHED*`, `CPM_RECOMPUTE_STARTED`, `CONFIG_DRAFT_*`, `CONFIG_SHADOW_STARTED`, `CONFIG_ACTIVE_VERIFIED`,
  `CONFIG_REJECTED`, `CONFIG_DEPLOYMENT_SCHEDULED` — `CplmAuditEmitter.cs`); auth-service (`RBAC_ROLE_*`,
  `ACCOUNT_DEACTIVATED`, `SESSION_IDLE_TIMEOUT`, `SESSION_MAX_DURATION` — `audit-emitter.ts`); ingestion-service has an
  `AuditEmitter.cs` (event names not literal in grep — **inferred**: data-source config changes). Emission is fire-and-forget;
  a Kafka outage is logged, not surfaced (`display-service/Services/AuditEmitter.cs:12`).
- **Who does NOT emit:** **ams-api has no audit emitter** (grep `src/backend` for `audit-service|AuditEvent|traverse.cpa.audit` →
  comments only). Alarm ACK/shelve/suppress/OOS are recorded only as Kafka `operator-actions`/`lifecycle-events` and
  `alarm_current` columns (3-day topic retention at the plant, `topics.txt:18`). asset-model, template-service,
  binding-resolver, notification-service emit nothing — **UNS/plant-model changes are not audited**. No service audits
  reads, navigation or drill-downs.

### 2.8 Caching and resilience of record

- ams-api: in-memory `AlarmReadCache`, 3 s TTL, version-stamp invalidated by every projection write (`AlarmReadCache.cs:1-41`);
  in-service limiters `alarms-read` 1000/min, `alarms-write` 300/min (`ServiceCollectionExtensions.cs:46-58`);
  `AddStandardResilienceHandler` on every outbound HttpClient (`Program.cs:254`); EF retry 5× / 60 s command timeout
  (`Program.cs:99-100`); **no Redis in ams-api** (`Program.cs:201,222`), no SignalR backplane, single replica.
- Redis contract tier: `redis-contract` runs in the plant compose (`docker-compose.marun.yml:117-118`) for Sparkplug
  snapshot keys `snapshot:metric:<group>:<edge>:<device>:<metric>` (`AlarmMetricPublisher.java:41`) — live values, not alarms.
- Kafka: `current-alarm-state` compacted and keyed by `alarmId` (`OpcEventStreamJob.java:155`); DLQ per stage.
- Gateway: see §2.6. Plant retention of record: `prod_decision.md:31-46` (evidence classes, feature partitions 3/30 d,
  gate results 30/14 d, Kafka topic retention 1 h–3 d). **No alarm-lane retention value exists at the plant** because the
  lane is not deployed there.

### 2.9 Data path

```
HTTP feed poller / OPC-UA(StreamPipes) ──► traverse.alarm.raw-alarms
                                                  │
        Flink OpcEventStreamJob: validate → dedup(alarmKey) → normalize → SOE order → lifecycle → correlation → flood → root-cause
                                                  │
     ┌───────────────┬────────────────────────────┼──────────────────────────────┐
 lifecycle-events   current-alarm-state (compacted, key=alarmId)   ack-writeback   root-cause-events / dlq
     │                          │                                        │
 AlarmKpiStreamJob        ams-api NormalizedAlarmConsumer          HttpAckWritebackService → DCS → ack-results → Flink
     │                    ├─ alarms.alarm_current (upsert/delete)
 kpi-* topics ──► KpiConsumer│─ alarms.alarm_history (append; 730 d)
                          └─ AlarmHub /hubs/alarms (Clients.All) ──► React alarmStore (+30 s REST reconcile)
 IoTDBPersistenceJob ──► root.ams.site1.alarms.<sanitised alarmId>     LiveStateJob ──► live.alarms ──► Sparkplug edge ──► EMQX
 traverse.cpa.audit-events (display/cplm/auth/ingestion only) ──► audit-service ──► audit.immutable_events (hash chain)
```

## 3. Code map

| Concern | file:line | Note |
|---|---|---|
| Alarm entity + ISA-18.2 ops | `src/backend/AMS.Domain/Alarms/ActiveAlarm.cs:79-249` | rich domain model; half of it is EF-ignored |
| Identity constraint | `database/scripts/35_alarm_current_identity.sql:54-55` | `(server_id, source, condition, sub_condition)` |
| Deterministic ids | `src/backend/AMS.Infrastructure/Kafka/AlarmPartitionKeys.cs:31-59`; `src/flink/.../AlarmKeys.java:11-27` | must stay in step |
| Identity contract doc | `docs/alarm-identity-contract.md:8-12` | alarmId + sanitiser rule |
| EF mapping / ignored columns | `src/backend/AMS.Infrastructure/Persistence/AmsDbContext.cs:29-124` | state vocabulary :127-161 |
| Projection ingest | `src/backend/AMS.Infrastructure/Kafka/NormalizedAlarmIngestor.cs:16-169` | cleared rows deleted |
| Projection consumer + history + DLQ | `src/backend/AMS.Infrastructure/Kafka/KafkaConsumerService.cs:101-351` | group `ams-backend` |
| Read repos / filters | `src/backend/AMS.Infrastructure/Repositories/AlarmRepositories.cs:76-99,171-276` | `AreaIds` unused |
| DTO + stats | `src/backend/AMS.Api/Services/AlarmEnricher.cs:35-116` | AreaPath null, flood 0 |
| Alarm routes | `src/backend/AMS.Api/Controllers/V1/AlarmsController.cs:42-436` | policies per route |
| KPI SQL | `src/backend/AMS.Api/Controllers/V1/AnalyticsController.cs:26-101` | plant-wide only |
| Flink KPI job | `src/flink/src/main/java/com/ams/flink/AlarmKpiStreamJob.java:43-133` | global window, lab thresholds |
| Hub + payloads + publisher | `src/backend/AMS.Api/Hubs/AlarmHub.cs:22-421` | groups never targeted |
| Hub wiring / SignalR opts | `src/backend/AMS.Api/Program.cs:205-222,341-351` | no backplane |
| Flink-only guard | `src/backend/AMS.Api/Program.cs:141-153` | no .NET fallback exists |
| Worker registration | `src/backend/AMS.Api/Program.cs:156-189` | |
| Raw loop → IoTDB | `src/backend/AMS.Api/BackgroundServices/RawLoopIotDbConsumer.cs:72-81,211-245` | path from loop_id |
| Edge-header auth + policies | `src/backend/AMS.Api/Auth/GatewayHeaderAuthHandler.cs:28-58`; `Extensions/ServiceCollectionExtensions.cs:22-35` | permission claims only |
| Token claims | `src/services/auth-service/src/services/auth.service.ts:89-97` | no site/unit scope claim |
| Hypertables / retention | `database/scripts/39_timescale_policies.sql:41-88` | lab only (`prod_decision.md:16`) |
| Shelving persistence + expiry | `database/scripts/36_alarm_shelving.sql:20-81` | |
| ACK lifecycle columns | `database/scripts/50_alarm_ack_lifecycle.sql:15-24` | |
| Audit consumer / chain / API | `src/services/audit-service/Consumers/AuditEventConsumer.cs:21-63`; `Persistence/ImmutableAuditRepository.cs:23-57`; `Program.cs:70-119` | |
| Audit emitters | `src/services/display-service/Program.cs:339-1177`; `cplm-api/Services/CplmAuditEmitter.cs`; `auth-service/src/services/audit-emitter.ts` | none in ams-api / asset-model |
| Asset alarm hook (unused) | `src/services/asset-model/Models/Asset.cs:154-165`; `binding-resolver/Services/PathResolver.cs:317-335` | `site:unit:device` never matches tags |
| Gateway routes / limits | `src/services/gateway/appsettings.json:34-320`; `Program.cs:154-277` | doc `docs/api-gateway.md` |
| Frontend hub client | `src/frontend-ob/src/store/alarmStore.ts:470-620` | reconnect + reconcile |
| Plant deployment shape | `migration/deploy/docker-compose.marun.yml:204-205`; `migration/deploy/deploy.sh:70-72`; `migration/kafka/topics.txt:5` | alarm lane not at plant |

## 4. Constraints, settled decisions and traps

- **Flink-only compute / lifecycle** (decision #3; `Program.cs:141-153`): any per-entity state or KPI belongs in Flink; the
  .NET side is projection + query only. There is no fallback path to remove or preserve.
- **Edge-only auth** (decision #16, `MIGRATION_LOG.md:303-309`): tokens carry `role` + flat `permission[]`; no scope
  (site/unit) claims exist and no service checks one. Scope-limited tokens need auth-service + every policy to change.
- **One DB per service; alarm and CPA lanes never join in SQL** (`architecture_document.md:52,116`). An alarm↔asset join
  therefore has to be an id carried on the event, not a cross-database join.
- **Single-instance ams-api** pinned by the in-memory cache and the CPLM/UI consumer groups (`AlarmReadCache.cs:12-14`;
  CLAUDE.md consumer-group rule). Any scale-out first needs the Redis backplane (Plan 06).
- **Cleared alarms vanish from `alarm_current`**; history lives only in `alarm_history` (state vocabulary `ACTIVE|
  ACKNOWLEDGED|CLEARED`, `AlarmRepositories.cs:336-347`). An "issue references alarm A-567 from 08:15" link must point at
  `alarm_history` rows (or the Kafka alarmId + event_time), not at `alarm_current.id`.
- **Dead or half-wired surfaces:** `soe.*` (stub), `alarm_state_transitions` (no writer), `historical_alarms` (no writer),
  hub `area-/role-/station-` groups (no publisher), `AckSlaWatchdogService` (unregistered), `/external-api` (documented,
  not configured), `AlarmStreamProcessorService` (documented, deleted).
- **Docs that disagree with code:** `architecture_document.md:90,134` (fallback processor; asset enrichment),
  `docs/ams-alarm-architecture.md:129,536-548` (says SHA-1 → GUID; code is MD5; lists `OpcAeRawEventIngestService`,
  `AckFlinkBridgeService`, `SimpleKafkaSignalRBridgeService` that do not exist in `src/backend`).
- **Plant reality:** no TimescaleDB, no alarm topics, ams-api optional and DB-less (`prod_decision.md:16`; `deploy.sh:70-72`).
  Retention and hypertable claims in §2.2 are lab settings; `39_timescale_policies.sql:30-32` itself says "confirm with
  compliance/audit owners before go-live".
- **Quality:** NE107 mapping for alarms (decision #11) is unrealised; `Quality` is not even persisted.
- **Compacted-topic trap:** every Flink sink to a compacted topic must be keyed (`KafkaSinks.java`; memory note
  "alarm-history sink fix"). A new per-entity state topic must follow the same rule.

## 5. Mapping to the Truss living-asset pitch

| Pitch concept | What exists today | Status | Notes / gap |
|---|---|---|---|
| Alarm stream `alarm/<unit>/<asset>/<code>` attributed to a canonical `entity_id` | Alarm identity = `(server_id, source tag, condition, sub_condition)` → MD5 GUID; only `server_id` + free-text `source` as context | **MISSING** | No entity/asset id on the event, row, DTO or hub payload; no join to `traverse_assets`; `Asset.AlarmSource` (`site:unit:device`) is a format that tag names never match |
| Active alarms / exceptions on a unit-scoped Operations or Shift Supervisor dashboard | `GET /alarms/active` filters by serverId/priority/state/sourceNameContains; hub broadcasts to all | **MISSING** | `AreaIds` and `SubscribeToArea` are dead parameters; the only "scope" is the OPC server GUID |
| Issues referencing alarms as evidence ("Alarm A-567 from 08:15") | `alarm_history` (alarm_id, source, event_time, state, cleared_time; 730 d in lab), `alarm_current.id` (deleted on clear), `LogicalAlarmFamilyId`, historian series per alarmId | **PARTIAL** | A durable reference exists (`alarm_id` + `event_time`), but no issue/ledger object and no API to fetch one alarm episode by id + time (`GET /alarms/historical` is a range query) |
| Runtime API: entity state / children / history / issues | asset-model hierarchy + binding-resolver (path+role → transport); historian-bff trends; cplm-api episodes for loops only | **PARTIAL** | Assets have no alarm state; alarm history has no asset; CPM event frames are the only "issue-like" object and are loop-scoped |
| WebSocket push of entity updates | `AlarmHub` (alarm deltas, all clients), MQTT/Sparkplug for live values, `ObservabilityHub` (admin) | **PARTIAL** | Per-alarm, not per-entity; no entity-keyed groups; single instance, no backplane |
| RBAC: Plant Manager token scoped to Plant01 | Role + flat permission catalog (`37_rbac_catalog.sql`; `Perms.All`); gateway injects `X-Auth-Role/Permissions` | **MISSING** | No site/plant/unit claim, no row-level or path-prefix authorization anywhere |
| Audit of config changes | Hash-chained `audit.immutable_events`; display, CPM loop/config governance, RBAC, ingestion emit | **PARTIAL** | asset-model (the UNS), templates, bindings, OPC connections and alarm shelving/suppression emit nothing |
| Audit of user drill / read actions | None | **MISSING** | Only mutations are audited; the query API exposes headers, not before/after payloads |
| ISA-18.2 KPIs (rates, floods, standing, stale, chattering) as plant/unit metrics on living objects | Plant-wide only: `/analytics/kpi` SQL, `AlarmStatsSummary` (flood/rate hardcoded 0), Flink 10-min rate + global standing counter to Kafka (unpersisted) | **PARTIAL** | No per-unit/asset keying, no persistence of Flink KPIs, thresholds are lab constants, MTTA not computed despite `ack_time` |
| NE107 / ISA-18.2 quality on the living object | OPC quality int, not persisted; NE107 only in CPM instrument health | **MISSING** (alarm lane) | Decision #11 unrealised |
| Canonical plant model (Truss) as source of truth | asset-model is the UNS source of truth (`root.<site>.<area>.<unit>.<device>`; decision #17) | **EXISTS** (for Traverse) | Pitch would introduce a second canonical model; alarm lane today uses neither |

## 6. Open questions

1. Is the alarm lane in scope for the plant at all? Today it is lab-only (`deploy.sh:70-72`); the pitch assumes alarms as
   a live input stream on the same host.
2. What is the intended source of `entity_id` for an alarm — a tag→asset alias table in asset-model (`assets.alias_mapping`
   exists for Instrumental ids), enrichment inside `OpcEventStreamJob` (the `EnrichmentMap` slot is there but empty), or a
   Truss lookup? Decision #2/#5 require the UNS path to be the key.
3. Where should an alarm-as-evidence reference resolve: `alarm_history` (append-only, 730 d lab retention, no plant
   retention decided), the IoTDB series, or a new episode table? `alarm_current.id` is unusable (deleted on clear).
4. Does "unit-scoped active alarms" need server-side filtering (new column + index on `alarm_current`) or is a
   client-side filter over the full broadcast acceptable at plant alarm volumes?
5. Scope-limited tokens: is a claim (`site`/`unit` list) plus gateway/policy enforcement acceptable, given decision #16
   keeps fine-grained authorization in-service and no service reads such a claim today?
6. Should alarm operator actions (ACK/shelve/suppress/OOS) and asset-model changes start emitting to
   `traverse.cpa.audit-events`? Both are absent and the hash chain has no retention policy, so volume matters.
7. Flink KPI job: keep the global `windowAll` and add a keyed (unit) branch, or replace? Its thresholds (10/20/50 per
   10 min) are lab constants and nothing persists its output.
