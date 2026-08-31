# 03 — .NET 8 Backend Alarm Surface

**Scope:** `src/backend/` (AMS.Api, AMS.Application, AMS.Domain, AMS.Infrastructure). CPLM/loop-performance is out of scope (`RawLoopIotDbConsumer` noted only). `src/services/*` covered in a separate section at the end.

**Method:** every claim below was verified by reading the source at the cited `path:line`. Nothing is inferred from names, comments, or docs. Where a comment contradicts the code, the code is reported and the contradiction is flagged.

**Analysis date:** 2026-08-25. Branch `main`, HEAD `2886ccb`.

---

## 1. Composition root — what is actually registered

### 1.1 Ordered `AddHostedService<…>` registrations (`src/backend/AMS.Api/Program.cs`)

| # | Line | Hosted service | Type location | Config gate | Status |
|---|---|---|---|---|---|
| 1 | 130 | `NormalizedAlarmConsumerService` | `AMS.Infrastructure/Kafka/KafkaConsumerService.cs:105` | none (unconditional; the `useFlinkOrchestration` guard above throws rather than branching) | Implemented |
| 2 | 131 | `LifecycleEventConsumerService` | `AMS.Infrastructure/Kafka/LifecycleEventConsumerService.cs:12` | none | Implemented |
| 3 | 132 | `AlarmStateDeltaConsumerService` | `AMS.Api/BackgroundServices/AlarmStateDeltaConsumerService.cs:9` | none | Implemented |
| 4 | 133 | `ReplayResultConsumerService` | `AMS.Api/BackgroundServices/ReplayResultConsumerService.cs:9` | none | Implemented |
| 5 | 134 | `TelemetryDeadmanWatchdogService` | `AMS.Infrastructure/Kafka/TelemetryDeadmanWatchdogService.cs:12` | none | Implemented |
| 6 | 146 | `AlarmIngestionService` | `AMS.Api/BackgroundServices/AlarmIngestionService.cs:44` | **`AlarmIngestion:Enabled`** (checked inside `ExecuteAsync` at :70 — returns immediately when false) + non-empty `AlarmIngestion:FeedUrl` | Implemented |
| 7 | 147 | `HttpAckWritebackService` | `AMS.Api/BackgroundServices/HttpAckWritebackService.cs:11` | none (always consumes `ack-writeback`) | Implemented |
| 8 | 148 | `KpiConsumerService` | `AMS.Api/BackgroundServices/KpiConsumerService.cs:12` | none | Implemented |
| 9 | 159 | `RawLoopIotDbConsumer` | `AMS.Api/BackgroundServices/RawLoopIotDbConsumer.cs` | none | CPLM-adjacent — out of scope |
| 10 | 160 | `DriftAlertConsumerService` | `AMS.Api/BackgroundServices/DriftAlertConsumerService.cs:9` | none | Implemented |
| 11 | 163 | `ShelveExpiryService` | `AMS.Api/BackgroundServices/ShelveExpiryService.cs:12` | none | Implemented (real timer — see §5) |

**No hosted service is gated by `Kafka:UseFlinkOrchestration`.** `Program.cs:115-125` reads the flag and **hard-throws** `InvalidOperationException` at startup if it is `false`; `Kafka:LabDirectIngest = true` also throws (`Program.cs:116-118`). There is no branch, no fallback registration.

### 1.2 Singletons / scoped alarm services

| Line | Registration | Lifetime | Notes |
|---|---|---|---|
| `Program.cs:96` | `AlarmReadCache` | Singleton | `AMS.Infrastructure/Caching/AlarmReadCache.cs:19` |
| `Program.cs:98-101` | `IActiveAlarmRepository`, `IHistoricalAlarmRepository`, `IAlarmTransitionRepository`, `ISoeEventRepository` | Scoped | `SoeEventRepository` is a **deliberate stub** (`StubRepositories.cs:21-38`) |
| `Program.cs:102` | `IOpcServerRepository → OpcServerRepository` | Scoped | **Stub**, always returns empty (`StubRepositories.cs:41-51`) |
| `Program.cs:105` | `IUnitOfWork → UnitOfWork` | Scoped | `Repositories/UnitOfWork.cs:7` |
| `Program.cs:106` | `IAlarmSignalRPublisher → AlarmSignalRPublisher` | **Singleton** | `Hubs/AlarmHub.cs:285` |
| `Program.cs:107` | `IAlarmEnricher → AlarmEnricher` | Scoped | `Api/Services/AlarmEnricher.cs:13` |
| `Program.cs:108` | `IOpcDcsGateway → NoOpOpcDcsGateway` | Scoped | see §1.3 |
| `Program.cs:112` | `AlarmEventProducer` | Singleton | `Kafka/KafkaConsumerService.cs:496` |
| `Program.cs:113` | `LifecycleEventPublisher` | Singleton | `Kafka/LifecycleEventPublisher.cs:7` |
| `Program.cs:114` | `IOperatorActionPublisher → OperatorActionPublisher` | Singleton | `Kafka/OperatorActionPublisher.cs:11` |
| `Program.cs:164-167` | `TelemetryIngestState`, `ReadinessHistoryStore`, `PipelineHealthService`, `ISignalRHealthProvider` | Singleton | |

### 1.3 `IOpcDcsGateway` — every call site (verified exhaustively)

Interface declared at `AMS.Application/Alarms/Commands/AlarmCommands.cs:494-498` with two members.

| Member | Call sites |
|---|---|
| `ShelveAlarmAsync` | **1** — `AlarmCommands.cs:234` (`ShelveAlarmCommandHandler`) |
| `AcknowledgeAlarmAsync` | **0 — dead interface member** |

**The only implementation in the entire repository is `NoOpOpcDcsGateway`** (`AMS.Infrastructure/Opc/NoOpOpcDcsGateway.cs:10`), which logs and returns `Task.CompletedTask` (`:21`, `:27`). `AMS.Infrastructure/Opc/` contains **exactly one file**. `AMS.Infrastructure/OpcConnector/` is an **empty directory** (0 files).

**Consequence:** shelve never propagates to any DCS. `AlarmCommands.cs:238-241` catches and logs a warning for a call that is structurally incapable of failing.

### 1.4 Documented backend components that DO NOT EXIST

Verified with `rg` over `src/` (`.cs` only, excluding `obj/`, `bin/`, `xmlgraphics-batik-main*`):

| Name | .cs hits | Still described in |
|---|---|---|
| `AlarmStreamProcessorService` | **0** | `CLAUDE.md:100`, `architecture_document.md:75`, `docs/enterprise-cams-production-architecture.md:105` |
| `NotificationHub` | **0** | (per coordinator) |
| `OpcAeRawEventIngestService` | **0** | (per coordinator) |
| `AckFlinkBridge` | **0** | (per coordinator) |
| `GatewayBufferIngestService` | **0** | `docs/flink-only-orchestration.md:3` |
| `StreamPipesOpcWritebackGateway` | 1 (a comment at `NoOpOpcDcsGateway.cs:8`) | — |

The string `AlarmStreamProcessorService` survives **only inside an exception message** at `Program.cs:124` ("in-service stream processing and .NET ACK orchestration were removed"). **There is no .NET fallback stream processor. `Kafka:UseFlinkOrchestration=false` is a startup crash, not a mode.**

### 1.5 EF Migrations vs `database/scripts/` — schema conflict (**HIGH**)

`src/backend/AMS.Infrastructure/Migrations/` contains 5 migrations + `AmsDbContextModelSnapshot.cs`.

* `AmsDbContextModelSnapshot.cs:244` maps `ActiveAlarm → alarms.active_alarms`.
* The **runtime** model maps `ActiveAlarm → alarms.alarm_current` (`Persistence/AmsDbContext.cs:29`).
* `20260525080915_InitialCreate.cs:33` creates `active_alarms` — a table **no runtime code reads or writes**.
* `Program.cs:250-262`: `db.Database.MigrateAsync()` runs **only when the environment is NOT Development**.

`infra/docker/docker-compose.yml` sets `ASPNETCORE_ENVIRONMENT: Development` for `ams-api`, so migrations are skipped and `database/scripts/` supplies the schema. **In any genuinely non-Development deployment the app would apply migrations that build the wrong table and never create `alarm_current`, and every alarm read/write would fail.** The migration tree is stale, orphaned, and actively dangerous.

---

## 2. Complete HTTP API surface

Base: gateway `:8081` → `ams-api:8000`. Versioned route template `api/v{version:apiVersion}/…`; `AssumeDefaultVersionWhenUnspecified = true`, default `1.0` (`Extensions/ServiceCollectionExtensions.cs:123-124`). All JSON is **camelCase**, nulls omitted, enums serialized as **strings** (`Program.cs:205-210`).

### 2.1 `AlarmsController` — `api/v1/alarms` (`Controllers/V1/AlarmsController.cs`)

Controller-level `[Authorize]` (`:22`) — authentication required for every action; individual policies below.

| Verb + Route | Line | Auth policy | Rate limit | Request | Response |
|---|---|---|---|---|---|
| `GET /api/v1/alarms/active` | 42 | `[Authorize]` only (**no `alarm.view` policy**) | `alarms-read` | query: `serverId?:Guid`, `priority?:AlarmPriority`, `state?:AlarmState`, `category?:AlarmCategory`, `sourceNameContains?:string`, `isAcknowledged?:bool`, `isShelved?:bool`, `isSuppressed?:bool`, `pageNumber=1`, `pageSize=100 (1..1000)`, `sortBy="EventTime"`, `sortDescending=true` | `ActiveAlarmListResult` + header `X-Total-Count` |
| `GET /api/v1/alarms/active/statistics` | 93 | `[Authorize]` only | — | `serverId?:Guid` | `AlarmStatsSummary` |
| `POST /api/v1/alarms/active/purge-lab-data` | 114 | `alarm.acknowledge` | — | query `serverId?:Guid` | `PurgeLabInjectedAlarmsResult { removedCount:int }` |
| `POST /api/v1/alarms/{id:guid}/acknowledge` | 133 | `alarm.acknowledge` | — | body `AcknowledgeRequest { comment?:string(≤2000), operatorStation?:string(≤255) }` | `AcknowledgeAlarmResult { success:bool, message:string, ackTime:DateTimeOffset? }` |
| `POST /api/v1/alarms/acknowledge/batch` | 170 | `alarm.acknowledge_batch` | — | body `BatchAcknowledgeRequest { alarmIds:Guid[] (≤5000), comment?, operatorStation? }` | `BatchAcknowledgeResult { successCount:int, failedCount:int, message:string }` |
| `POST /api/v1/alarms/{id:guid}/shelve` | 201 | `alarm.shelve` | — | body `ShelveRequest { durationMinutes:int (1..480, required), comment:string (required, ≤2000), operatorStation? }` | `ShelveAlarmResult { success, message, shelveUntil:DateTimeOffset? }` |
| `POST /api/v1/alarms/{id:guid}/unshelve` | 235 | `alarm.unshelve` | — | body `UnshelveRequest { reason:string (required, ≤2000), operatorStation? }` | `UnshelveAlarmResult { success, message }` |
| `POST /api/v1/alarms/{id:guid}/suppress` | 262 | `alarm.suppress` | — | body `SuppressRequest { reason:string (required, ≤2000), operatorStation? }` | `SuppressAlarmResult { success, message }` |
| `POST /api/v1/alarms/{id:guid}/out-of-service` | 287 | `alarm.suppress` (**not a dedicated policy**) | — | body `OutOfServiceRequest { reason:string (required, ≤2000), operatorStation? }` | `SetAlarmOutOfServiceResult { success, message }` |
| `GET /api/v1/alarms/historical` | 317 | `[Authorize]` only | `alarms-read` | query: `from:DateTimeOffset` **(required)**, `to:DateTimeOffset` **(required)**, `serverId?`, `priority?`, `category?`, `state?`, `sourceNameContains?`, `isAcknowledged?`, `pageNumber=1`, `pageSize=200 (1..5000)`, `sortBy="EventTime"`, `sortDescending=true` | `HistoricalAlarmListResult` + `X-Total-Count`; 400 if `to<=from` or range >365d |
| `GET /api/v1/alarms/historical/stream` | 366 | `alarm.export` | — | `from`, `to`, `serverId?` | `application/x-ndjson`, one JSON object per line |
| `GET /api/v1/alarms/transitions` | 402 | `[Authorize]` only | `alarms-read` | `from`, `to` (required), `alarmId?`, `serverId?`, `sourceNameContains?`, `toState?:string`, `pageNumber=1`, `pageSize=500 (1..5000)`, `sortBy="TransitionTime"`, `sortDescending=true` | `{ items, totalCount, pageNumber, pageSize }` + `X-Total-Count` |
| `GET /api/v1/alarms/transitions/stream` | 432 | `alarm.export` | — | `from`, `to` | `application/x-ndjson` |

**There is no `GET /api/v1/alarms/{id}` single-alarm endpoint, and no dedicated comment endpoint.** Comments ride inside the acknowledge / shelve / unshelve / suppress bodies.

#### Response shapes

`ActiveAlarmListResult` (`AMS.Application/Alarms/Queries/AlarmQueries.cs:67`):
```
{ items: ActiveAlarmDto[], totalCount: long, pageNumber: int, pageSize: int, summary: AlarmStatsSummary }
```

`ActiveAlarmDto` (`AlarmQueries.cs:27-65`) — 33 fields:
`id:Guid, serverId:Guid, serverName:string, sourceName:string, conditionName?, subConditionName?, message?, severity:int, priority:AlarmPriority(string), category:AlarmCategory(string), priorityLabel:string, stateLabel:string, state:AlarmState(string), conditionActive:bool, acknowledged:bool, isShelved:bool, isSuppressed:bool, isOutOfService:bool, qualityGood:bool, eventTime:DateTimeOffset, activeTime:DateTimeOffset, ackTime?:DateTimeOffset, ackedByUsername?:string, ackComment?:string, shelveUntil?:DateTimeOffset, shelveComment?:string, suppressionReason?:string, correlationId?:Guid, isRootCause:bool, processValue?:double, processUnit?:string, opcAttributes:Dictionary<string,object>, timeInAlarm?:TimeSpan, areaPath?:string, serverReceivedAt:DateTimeOffset, logicalAlarmFamilyId:string, instanceKeySchemaVersion:int`

⚠ **11 of these fields are hardcoded or fabricated — see §7.1.**

`AlarmStatsSummary` (`AlarmQueries.cs:75`):
`{ totalActive, totalCritical, totalHigh, totalMedium, totalLow, unacknowledged, shelved, suppressed :long, alarmsPerTenMin:double, floodActive:bool }`
⚠ `shelved`, `suppressed`, `alarmsPerTenMin`, `floodActive` are **hardcoded zero/false** (`AlarmEnricher.cs:49-52`).

`HistoricalAlarmListResult` (`AlarmQueries.cs:154`): `{ items: object[], totalCount:long, pageNumber:int, pageSize:int }`. `items` are raw Dapper `dynamic` rows with **snake_case** keys (`AlarmRepositories.cs:205-214`): `id, server_id, source_name, condition_name, sub_condition_name, message, severity, alarm_state, acknowledged, event_time, active_time, cleared_time`. The camelCase JSON policy does **not** rename dictionary keys, so the historical payload shape differs from the active payload shape.

`transitions` items (also raw Dapper, `AlarmTransitionRepository.cs:56-58`): `id, alarm_id, server_id, source_name, from_state, to_state, transition_time, triggered_by, trigger_reason, comment`.

### 2.2 Other alarm-adjacent controllers

| Verb + Route | File:line | Auth |
|---|---|---|
| `GET /api/v1/analytics/kpi` | `AnalyticsController.cs:20` | `analytics.view` |
| `GET /api/v1/admin/alarm-feed` | `AlarmIngestionAdminController.cs:34` | `alarm.view` |
| `POST /api/v1/admin/alarm-feed/test` | `AlarmIngestionAdminController.cs:64` | `admin.users.edit` |
| `GET /api/v1/admin/opc-servers` | `AdminOpcServersController.cs:20` | `alarm.view` — **returns a hardcoded single-element array** (`:27-39`) |
| `GET /api/v1/health/pipeline` | `HealthPipelineController.cs:29` | **`[AllowAnonymous]`** |
| `GET /api/v1/health/kafka` | `HealthPipelineController.cs:37` | **`[AllowAnonymous]`** |
| `POST /api/v1/Observability/replay` | `ObservabilityController.cs:23` | `system.manage` |
| `GET/POST/PUT/DELETE /api/v1/opc/connections/…` | `OpcConnectionsController.cs:53-500` | class `analytics.view`; mutations `system.manage`, **except** `POST test` (:303), `GET {id}/browse` (:318), `POST sync-from-gateway` (:494) |
| `GET /health`, `/health/ready`, `/health/pipeline` | `Program.cs:327,333,338` | anonymous |
| `GET /metrics` | `Program.cs:303` | anonymous (Prometheus) |

`AnalyticsController.GetKpi` reads `alarms.alarm_history` and `alarms.alarm_current` directly via Dapper (`:26-89`) — 7 separate round-trips, no caching, no time-range parameterisation (fixed 24h / 7d windows).

---

## 3. SignalR contract (exact — for frontend cross-check)

### 3.1 `AlarmHub` — route `/hubs/alarms`

`Program.cs:315-319`. Transports: **WebSockets | ServerSentEvents** (LongPolling disabled). `[Authorize]` at `Hubs/AlarmHub.cs:22` — authentication required, **no permission policy**.

Serializer: `Program.cs:191-194` — `PropertyNamingPolicy = CamelCase`. So every payload property below is camelCase on the wire.

Hub options (`Program.cs:179-190`): `MaximumReceiveMessageSize=102400`, `StreamBufferCapacity=20`, `HandshakeTimeout=15s`, `KeepAliveInterval=10s`, `ClientTimeoutInterval=120s` in Development / 30s otherwise.

#### Groups

| Group name pattern | Joined | Published to |
|---|---|---|
| `role-{role}` | auto on connect (`:51`), from claim `role`, default `"VIEWER"` | **never** |
| `station-{stationId}` | auto on connect (`:55`) if claim `operator_station` present | **never** |
| `server-{serverId}` | `SubscribeToServer` (`:91`) | `OnNewAlarm` (`:310`), `OnAlarmUpdated` (`:318`) |
| `area-{areaId}` | `SubscribeToArea` (`:104`) | **never** |
| `alarms-{PRIORITY}` (`CRITICAL`/`HIGH`/`MEDIUM`/`LOW`/`DIAGNOSTIC`, uppercased) | `SubscribeToPriority` (`:112`) | `OnNewAlarm` (`:306`) |

#### Client → server methods

| Method | Signature | File:line |
|---|---|---|
| `SubscribeToServer` | `(string serverId) → void` | `AlarmHub.cs:89` |
| `UnsubscribeFromServer` | `(string serverId) → void` | `AlarmHub.cs:96` |
| `SubscribeToArea` | `(string areaId) → void` | `AlarmHub.cs:102` |
| `SubscribeToPriority` | `(string priority) → void` — silently no-ops if not in `{CRITICAL,HIGH,MEDIUM,LOW,DIAGNOSTIC}` | `AlarmHub.cs:108` |
| `Ping` | `() → string` returning `"pong:{ISO-8601 UTC}"` | `AlarmHub.cs:116` |

There is **no** `UnsubscribeFromArea` and **no** `UnsubscribeFromPriority`.

#### Server → client methods (`IAlarmHubClient`, `AlarmHub.cs:124-161`)

| Method | Payload type | Invoked? | Invoked from |
|---|---|---|---|
| `OnConnected` | `HubConnectionInfo` | ✅ | `AlarmHub.cs:62` (caller only) |
| `OnNewAlarm` | `AlarmHubPayload` | ✅ | `AlarmHub.cs:303` (All), `:306` (priority grp), `:310` (server grp) — via `NormalizedAlarmIngestor.cs:97` |
| `OnAlarmUpdated` | `AlarmHubPayload` | ✅ | `AlarmHub.cs:317` (All), `:318` (server grp) — via `AlarmCommands.cs:229,306,363,418`; `NormalizedAlarmIngestor.cs:115,142,160,213` |
| `OnAlarmCleared` | `AlarmClearedPayload` | ✅ | `AlarmHub.cs:332` (All) — via `NormalizedAlarmIngestor.cs:137,155,190` |
| `OnAckLifecycleUpdated` | `AckLifecyclePayload` | ✅ | `AlarmHub.cs:365` (All) — via `LifecycleEventConsumerService.cs:95` |
| `OnLoopKpiUpdate` | `object` (`LoopKpiPayload`) | ✅ | `AlarmHub.cs:370` (All) — via `KpiConsumerService.cs:65` |
| `OnAlarmKpiUpdate` | `object` (`AlarmKpiPayload`) | ✅ | `AlarmHub.cs:375` (All) — via `KpiConsumerService.cs:72` |
| `OnBulkAlarmsUpdated` | `AlarmBulkUpdatePayload` | ❌ **DEAD** | `PublishBulkAlarmsUpdatedAsync` has **zero callers** |
| `OnFloodAlert` | `FloodAlertPayload` | ❌ **DEAD** | `PublishFloodAlertAsync` has **zero callers** |
| `OnServerStatusChanged` | `ServerStatusPayload` | ❌ **DEAD** | `PublishConnectionStatusAsync` has **zero callers** |
| `OnSoeEvent` | `SoeEventPayload` | ❌ **DEAD** | never invoked anywhere |
| `OnAnalyticsUpdate` | `AnalyticsUpdatePayload` | ❌ **DEAD** | never invoked anywhere |
| `OnHeartbeat` | `HeartbeatPayload` | ❌ **DEAD** | never invoked anywhere |

#### Payload records (verbatim field order; wire names camelCase)

**`AlarmHubPayload`** (`AlarmHub.cs:165-195`):
```
id:Guid, serverId:string, serverName:string, sourceName:string, conditionName:string?,
subConditionName:string?, message:string?, severity:int, priority:string, category:string,
state:string, conditionActive:bool, acknowledged:bool, isShelved:bool, isSuppressed:bool,
eventTimeEpochMs:long, activeTimeEpochMs:long, ackTimeEpochMs:long?, ackedByUsername:string?,
shelveUntilEpochMs:long?, correlationId:Guid?, isRootCause:bool, processValue:double?,
processUnit:string?, serverReceivedEpochMs:long, logicalAlarmFamilyId:string,
instanceKeySchemaVersion:int, ackComment:string? = null,
opcAttributes:IReadOnlyDictionary<string,object>? = null
```
`state` values (`AlarmHub.cs:410-421`): `UNACKNOWLEDGED_UNCLEARED`, `ACKNOWLEDGED_UNCLEARED`, `UNACKNOWLEDGED_CLEARED`, `ACKNOWLEDGED_CLEARED`, `SHELVED`, `SUPPRESSED_BY_DESIGN`, `OUT_OF_SERVICE`, `INHIBITED`, `UNKNOWN`.
`priority`/`category` are `.ToString().ToUpper()` of the enums (`:387-388`).
⚠ `serverName` is always `string.Empty` (`:381`); `ackedByUsername` is always `null` (`:397`) — see §7.2.

**`AckLifecyclePayload`** (`AlarmHub.cs:197-209`):
```
alarmId:Guid, commandId:string, correlationId:string, lifecycleId:string?, dcsSequenceId:string?,
lifecycleState:string, detail:string?, timestampEpochMs:long, latencyMs:long?,
ackRequestedAtEpochMs:long?, actionId:string? = null
```
⚠ `AlarmSignalRPublisher.PublishAckLifecycleAsync` (`:362-364`) always passes `ackRequestedAtEpochMs: null` and `actionId: commandId`.
`lifecycleState` values (`Kafka/AckLifecycleStates.cs:6-14`): `ACK_REQUESTED`, `ACK_QUEUED`, `ACK_PROCESSING`, `ACK_DISPATCHED`, `ACK_PENDING_DCS`, `ACK_CONFIRMED`, `ACK_FAILED`, `ACK_TIMEOUT`, `ACK_RETRYING`.

**`AlarmClearedPayload`** (`:211`): `alarmId:Guid, sourceName:string, clearedTimeEpochMs:long`
**`AlarmBulkUpdatePayload`** (`:217`): `alarmIds:Guid[], action:string, timestampEpochMs:long, count:int`
**`FloodAlertPayload`** (`:224`): `serverId:string, alarmsPerTenMin:double, isFlood:bool, detectedAtEpochMs:long`
**`ServerStatusPayload`** (`:231`): `serverId:string, serverName:string, isConnected:bool, error:string?, timestampEpochMs:long`
**`SoeEventPayload`** (`:239`): `id:long, sourceName:string, serverId:string, sourceTimestampEpochMs:long, severity:int, priority:string, message:string, conditionActive:bool, isOutOfOrder:bool`
**`AnalyticsUpdatePayload`** (`:251`): `serverId:string, alarmsPerTenMin:double, totalActive:int, totalCritical:int, totalUnacknowledged:int, floodActive:bool, timestampEpochMs:long`
**`HubConnectionInfo`** (`:261`): `connectionId:string, userId:string, role:string, connectedAt:DateTimeOffset, serverTime:DateTimeOffset`
**`HeartbeatPayload`** (`:269`): `serverTimeEpochMs:long, connectedClients:int`

**`LoopKpiPayload`** (`KpiConsumerService.cs:90`): `tagId:string, windowStartMs:long, windowEndMs:long, iae:double, ise:double, dominantMode:string, sampleCount:int`
**`AlarmKpiPayload`** (`KpiConsumerService.cs:100`): `kpiType:string, windowStartMs:long, windowEndMs:long, alarmCount:int, floodStatus:string?, standingCount:int, oldestStandingDurationMs:long, alarmId:string?, nuisanceType:string?, occurrences:int, healthScore:double, area:string?, priority:string?`

### 3.2 `ObservabilityHub` — route `/hubs/observability`

`Program.cs:321-325`. `[Authorize(Policy = "system.manage")]` (`Hubs/ObservabilityHub.cs:40`). WebSockets | SSE.

**Client → server:** none.

**Server → client** (`IObservabilityHubClient`, `ObservabilityHub.cs:7-12`):

| Method | Payload | Invoked from |
|---|---|---|
| `OnDriftAlertReceived` | `DriftAlertPayload` | `DriftAlertConsumerService.cs:57` |
| `OnAlarmStateDeltaReceived` | `AlarmStateDeltaPayload` | `AlarmStateDeltaConsumerService.cs:57` |
| `OnReplayDeltaReceived` | `ReplayStateDeltaPayload` | `ReplayResultConsumerService.cs:57` |

⚠ These three payload records carry explicit `[JsonPropertyName]` **snake_case** attributes (`ObservabilityHub.cs:15-33`) — `replay_id`, `correlation_id`, `change_type`, `current_state`, `previous_state`, `timestamp`, `alarmId`, `type`. `System.Text.Json` honours `JsonPropertyName` over the camelCase policy, so **these hub payloads are snake_case on the wire while `AlarmHub` payloads are camelCase.** Note `DriftAlertPayload.AlarmId → "alarmId"` (camel) but `AlarmStateDeltaPayload.CorrelationId → "correlation_id"` (snake) — inconsistent even within the same hub.

---

## 4. ACK / shelve / suppress / unshelve workflow — as actually implemented

### 4.1 Single ACK (`POST /api/v1/alarms/{id}/acknowledge`)

1. `AlarmsController.cs:140-161` → resolves `userId` from claim `sub`/`NameIdentifier` (`Guid.Empty` if absent, `:461-465`) and `username` from `preferred_username`/`Name` (`"unknown"` if absent, `:467-470`).
2. `AcknowledgeAlarmCommandValidator` (`AlarmCommands.cs:25-34`) requires non-empty `AlarmId`, **non-empty `UserId`**, non-empty `Username`.
3. `AcknowledgeAlarmCommandHandler.Handle` (`AlarmCommands.cs:55-75`):
   * loads the alarm (`_uow.ActiveAlarms.GetByIdAsync`) — 404-equivalent `{success:false,"Alarm not found"}` if missing;
   * calls `_actionPublisher.PublishAcknowledgeAsync(...)`;
   * **writes NOTHING to the database** and returns `{ success:true, message:"Acknowledge command dispatched to Flink", ackTime:null }`.
4. `OperatorActionPublisher.PublishAcknowledgeAsync` (`Kafka/OperatorActionPublisher.cs:33-106`):
   * `OpcCookieHelper.IsWritebackAckEligible(alarm)` gate (`:41`) — **throws `InvalidOperationException` if ineligible**;
   * emits `ACK_REQUESTED` to **`lifecycle-events`** (`:61-64`), key = `AlarmPartitionKeys.AssetKey(serverId, sourceName)` = `"{serverId}|{sourceName}"`;
   * produces `OperatorActionMessage` to **`operator-actions`** (`:92-95`), key = `AssetKey(alarm.ServerId, alarm.SourceName)`;
   * emits `ACK_QUEUED` to `lifecycle-events` (`:97-101`).
5. Flink consumes `operator-actions`, and (per the topic catalog) emits to **`ack-writeback`**.
6. `HttpAckWritebackService` (`BackgroundServices/HttpAckWritebackService.cs`) consumes `ack-writeback`, **POSTs to the DCS over HTTP** (`:125`) at `AlarmIngestion:AckWritebackUrl`, then publishes an `AckResultMessage` to **`ack-results`** (`:174`) with `resultState` = `ACK_CONFIRMED` or `ACK_FAILED`.
7. `LifecycleEventConsumerService` consumes `lifecycle-events` and, for each transition, applies `ApplyAckLifecycle` to the entity, saves, invalidates the read cache, and pushes `OnAckLifecycleUpdated` over SignalR (`LifecycleEventConsumerService.cs:64-105`).
8. Flink also emits `ACK_STATE_UPDATE` / `ALARM_STATE_UPSERT` on **`current-alarm-state`**, which `NormalizedAlarmConsumerService` → `NormalizedAlarmIngestor` projects into `alarms.alarm_current` and pushes as `OnAlarmUpdated`.

**Answer to "is the DCS write-back triggered from the ACK endpoint?" — No.** The endpoint only produces to `operator-actions`. The actual HTTP POST to the DCS happens in `HttpAckWritebackService`, driven by `ack-writeback` messages that **Flink** produces.

#### ACK message payload (`OperatorActionMessage`, `Kafka/StreamMessages.cs:54-85`)
```
schemaVersion:1, eventType:"OPERATOR_ACK_COMMAND", commandId:guid, correlationId:guid,
lifecycleId:guid, dcsSequenceId:null, actionId:=commandId, alarmId:string, sourceAlarmId:string?,
sourceEventId:string?, actionType:"ACKNOWLEDGE", userId:string, username:string, comment:string?,
actionTimeEpochMs:long, serverId:string, sourceName:string, conditionName:string?,
subConditionName:string?, activeTimeEpochMs:long, activeFileTime:long, cookieOffset:int,
operatorStation:string?
```
Serialized camelCase by `AlarmEventProducer.PublishAsync` (`KafkaConsumerService.cs:528`).

#### DCS HTTP payload (`HttpAckWritebackService.cs:108-116`)
```json
{ "correlation_ids": ["<sourceAlarmId | sourceName|conditionName | alarmId>"],
  "source_event_id": "...", "idempotency_key": "<commandId>",
  "action": "ACKNOWLEDGE", "operator": "<username|operator>", "timestamp": "<ISO-8601 UTC>" }
```

### 4.2 Batch ACK

`BatchAcknowledgeAlarmsHandler` (`AlarmCommands.cs:103-163`): loops the ids, loads each **one row at a time** (N+1 queries), pre-checks `OpcCookieHelper.IsWritebackAckEligible` and skips ineligible with a `failedCount++`, catches per-item exceptions. **No DB write, no SignalR bulk push** (`_publisher` is injected at `:107` and never used — dead field).

### 4.3 Shelve — `POST /api/v1/alarms/{id}/shelve`

`ShelveAlarmCommandHandler` (`AlarmCommands.cs:194-249`). This is the **only** operator command that writes to the database.
* `alarm.Shelve(userId, durationMinutes, comment)` (`ActiveAlarm.cs:231-249`) → sets `IsShelved=true, ShelvedAt, ShelvedBy, ShelveUntil=UtcNow+duration, ShelveComment, State=Shelved`.
* `UpdateAsync` + `SaveChangesAsync` → `UPDATE alarms.alarm_current`.
* `PublishAlarmUpdatedAsync` → `OnAlarmUpdated`.
* `_opcGateway.ShelveAlarmAsync(...)` → **no-op** (§1.3).
* **Produces nothing to Kafka.** Flink never learns the alarm was shelved.

**Persisted columns:** only `is_shelved`, `shelve_until`, `shelved_by`, `state` are mapped (`AmsDbContext.cs:87-91`). `ShelvedAt` and `ShelveComment` are `Ignore`d (`:90,92`) — **the mandatory ISA-18.2 shelve comment is discarded**.

### 4.4 Unshelve / Suppress / Out-of-service

| Command | Handler | DB write | Kafka | SignalR | DCS |
|---|---|---|---|---|---|
| Unshelve | `AlarmCommands.cs:275-316` | yes (`is_shelved=false`, `shelve_until=null`, `state`) | none | `OnAlarmUpdated` | none (explicit TODO at `:307`) |
| Suppress | `AlarmCommands.cs:331-372` | yes (`is_suppressed=true`, `state='SUPPRESSED'`) | none | `OnAlarmUpdated` | none |
| Out-of-service | `AlarmCommands.cs:387-427` | `state='OUT_OF_SERVICE'` only — **`IsOutOfService` is `Ignore`d** (`AmsDbContext.cs:96`) | none | `OnAlarmUpdated` | none |

`SuppressionReason` is `Ignore`d (`AmsDbContext.cs:95`) — the mandatory reason is discarded.

**There is no un-suppress and no return-to-service endpoint.** Once suppressed or set out of service, the row's `state` leaves the active set (`ActiveAlarmRepository.cs:73`) and there is no API path back. Only `alarms.expire_shelved_alarms()` can restore a *shelved* alarm.

### 4.5 Comment workflow

There is no comment API. `comment` on acknowledge is carried in the Kafka `OperatorActionMessage.Comment` and in the DCS payload; it is **never written to `alarms.alarm_current`** (`AckComment` is `Ignore`d, `AmsDbContext.cs:83`). `comment` on shelve is validated as mandatory then discarded. No comment ever appears in a read response — `ActiveAlarmDto.AckComment` is hardcoded `null` (`AlarmEnricher.cs:97`).

---

## 5. `ShelveExpiryService` — real, not a placeholder

`BackgroundServices/ShelveExpiryService.cs:20-48`. Real loop: every 60 s (`Task.Delay(TimeSpan.FromMinutes(1), ct)`, `:41`) it opens a DI scope and executes `SELECT alarms.expire_shelved_alarms()` (`:29`). Registered at `Program.cs:163`.

The SQL function is real (`database/scripts/36_alarm_shelving.sql:55-70`): un-shelves rows where `is_shelved AND shelve_until <= NOW()`, sets `state='ACTIVE'`, and logs to `alarms.shelving_actions`.

**Weaknesses:** (a) catches every exception and logs at **Warning**, so a permanently missing function degrades silently forever (`:35-38`); (b) the return value (number expired) is discarded — no metric, no SignalR push, so **the UI is never told an alarm auto-unshelved** until the next poll; (c) 60 s granularity means up to 60 s of over-shelving.

**Status: Implemented.**

---

## 6. Kafka topics and consumer groups

Effective `Kafka:ConsumerGroupId` = **`ams-backend-2`** (docker-compose `ams-api` env). `appsettings.json:8` default is `ams-backend`; `appsettings.Development.json:17` says `ams-backend-2` — compose wins.

### 6.1 Consumers

| Service | Topic(s) | Group ID | Offset reset | Auto-commit | File:line |
|---|---|---|---|---|---|
| `NormalizedAlarmConsumerService` | `current-alarm-state` | `{ConsumerGroupId}` = `ams-backend-2` | **Earliest** | **false** (manual, batch) | `KafkaConsumerService.cs:156-169` |
| `LifecycleEventConsumerService` | `lifecycle-events` | `{ConsumerGroupId}-lifecycle` | Latest | true | `LifecycleEventConsumerService.cs:34-40` |
| `HttpAckWritebackService` | `ack-writeback` | `{ConsumerGroupId}-http-ack-writeback` | Latest | **false** (manual) | `HttpAckWritebackService.cs:43-54` |
| `TelemetryDeadmanWatchdogService` | `raw-alarms` | `{ConsumerGroupId}-telemetry-deadman` | Latest | true | `TelemetryDeadmanWatchdogService.cs:48-54` |
| `AlarmStateDeltaConsumerService` | `flink.state.alarm.delta` | **`ams-delta-consumer-ui`** (hardcoded) | Latest | true | `AlarmStateDeltaConsumerService.cs:29-36` |
| `DriftAlertConsumerService` | `system.state.drift.alerts` | **`ams-drift-consumer-ui`** (hardcoded) | Latest | true | `DriftAlertConsumerService.cs:29-36` |
| `ReplayResultConsumerService` | `flink.state.alarm.replay` | **`ams-replay-ui-consumer`** (hardcoded) | Latest | true | `ReplayResultConsumerService.cs:29-36` |
| `KpiConsumerService` | `loop-kpis-5m`, `kpi-alarm-rates`, `kpi-standing-snapshots`, `kpi-bad-actors`, `kpi-health-scores` | **`ams-api-kpi-consumer`** (hardcoded) | Latest | true | `KpiConsumerService.cs:17-40` |
| `RawLoopIotDbConsumer` *(CPLM-adjacent, out of scope)* | `loop.samples.v1` | **`ams-iotdb-raw-loop`** | — | — | `RawLoopIotDbConsumer.cs:63,72` |
| `PipelineHealthService` lag probe | `raw-alarms` | **`ams-health-lag-{new Guid}`** — a **new group per probe** | — | false | `PipelineHealthService.cs:457-462` |
| `AckSlaWatchdogService` | `lifecycle-events` | `{ConsumerGroupId}-ack-sla-watchdog` | — | — | **DEAD — never registered** (`AckSlaWatchdogService.cs:52`) |

### 6.2 Producers (`AlarmEventProducer`, `KafkaConsumerService.cs:496-544`)

Config: `EnableIdempotence=true`, `Acks=All`, `MaxInFlight=1`, `MessageSendMaxRetries=3`, `RetryBackoffMs=1000`, `BatchSize=131072`, `LingerMs=5`, `CompressionType=Lz4` (`:507-518`).

| Topic | Key | Payload | Producer |
|---|---|---|---|
| `raw-alarms` | `snapshot.AlarmId` | anonymous `{alarmId, sourceName, sourceEventId, message, priority, condition, state, timestamp, acknowledged, rawPayload}` | `AlarmIngestionService.cs:158` |
| `operator-actions` | `"{serverId}|{sourceName}"` | `OperatorActionMessage` | `OperatorActionPublisher.cs:92-95` |
| `lifecycle-events` | `"{serverId}|{sourceName}"` (ACK path) or `alarmId` (2-arg overload) | `LifecycleEventMessage` | `LifecycleEventPublisher.cs:54` |
| `ack-results` | `writeback.AlarmId` | `AckResultMessage` | `HttpAckWritebackService.cs:174` |
| `raw-alarms-dlq` | event key / `EventId` | `DeadLetterEnvelope { key, reason, sourceTopic, sourcePartition, sourceOffset, failedAtUtc, payload }` | `KafkaConsumerService.cs:413` |
| `lifecycle-alerts` | `"telemetry-deadman"` | `TelemetryStallAlertMessage` | `TelemetryDeadmanWatchdogService.cs:153-157` |

**Configured but never produced/consumed by the backend:** `ack-writeback-dlq`, `active-alarms`, `historical-alarms`, `alarm-analytics`, `soe-events`, `notification-events`, `dead-letter-events` (`KafkaOptions`, `KafkaConsumerService.cs:32,38-43`) — dead configuration.

---

## 7. Mock / static / fabricated data in production read paths

### 7.1 `AlarmEnricher.MapToDto` — the alarm list is substantially synthetic

`src/backend/AMS.Api/Services/AlarmEnricher.cs:55-111`. Every `GET /api/v1/alarms/active` row passes through this.

| DTO field | Actual value | Line |
|---|---|---|
| `serverId` | **always the configured `AlarmIngestion:ServerId`** — the alarm's own `ServerId` is discarded | `:57-59, 75` |
| `serverName` | always `AlarmIngestion:ServerName` (`"Current Alarms Feed"`) | `:76` |
| `priority` | recomputed from `severity` thresholds, never the stored priority | `:62-69` |
| `category` | **hardcoded `AlarmCategory.Process`** | `:83` |
| `conditionActive` | derived from `state`, not from data | `:87` |
| `isShelved` | **hardcoded `false`** | `:89` |
| `isSuppressed` | **hardcoded `false`** | `:90` |
| `isOutOfService` | **hardcoded `false`** | `:91` |
| `qualityGood` | **hardcoded `true`** | `:92` |
| `activeTime` | **= `eventTime`** | `:94` |
| `ackTime` | **`DateTimeOffset.UtcNow` if acknowledged** — a fabricated timestamp that changes on every poll | `:95` |
| `ackedByUsername` | **hardcoded `null`** | `:96` |
| `ackComment` | **hardcoded `null`** | `:97` |
| `shelveUntil`, `shelveComment`, `suppressionReason`, `correlationId`, `processValue`, `processUnit`, `areaPath` | **hardcoded `null`** | `:98-107` |
| `isRootCause` | **hardcoded `false`** | `:102` |
| `serverReceivedAt` | **`DateTimeOffset.UtcNow`** — fabricated | `:108` |

`GetStatsSummaryAsync` (`:35-53`): `shelved:0`, `suppressed:0`, `alarmsPerTenMin:0`, `floodActive:false` are **hardcoded** (`:49-52`). The `serverId` parameter is **ignored entirely** — the query never filters by it (`:37-38`).

**Impact:** the `isShelved` / `isSuppressed` query filters work against the database, but the response always reports `false`. A UI cannot render shelved or suppressed state, cannot show who acknowledged an alarm, cannot show an ack comment, and shows a moving `ackTime`.

### 7.2 `AlarmSignalRPublisher.MapToPayload` (`Hubs/AlarmHub.cs:378-408`)

`serverName` → `string.Empty` (`:381`); `ackedByUsername` → `null` (`:397`). Fields read from the entity (`ActiveTime`, `AckTime`, `ServerReceivedAt`, `ProcessValue`, `ProcessUnit`, `CorrelationId`, `IsRootCause`, `Priority`, `Category`) are all **unmapped in EF** (§8.1), so for any alarm loaded from the database they carry CLR defaults — notably `activeTimeEpochMs` and `serverReceivedEpochMs` become `DateTimeOffset.MinValue.ToUnixTimeMilliseconds()` = **-62135596800000**.

### 7.3 Other hardcoded values

| Value | Location | Impact |
|---|---|---|
| `'f0af9a6d-85f6-4c9f-a8ad-6de277d1d110'::UUID as server_id` **injected into the historical SQL SELECT** | `Repositories/AlarmRepositories.cs:207` | every historical alarm is reported as belonging to one server regardless of origin |
| `Guid.Parse("7ce5ecbf-70c9-498d-b899-5c8bb7add383")` final fallback server id | `AMS.Application/Alarms/OpcCookieHelper.cs:84` | ACK messages can be published under a phantom server id |
| `DefaultHttpFeedUrl = "http://192.168.1.51:8010/api/current-alarms"` | `BackgroundServices/AlarmIngestionService.cs:20` | site LAN IP compiled into the binary |
| `DefaultHttpAckWritebackUrl = "http://192.168.1.51:8010/api/alarms/acknowledge"` | `AlarmIngestionService.cs:21` | ditto |
| `DefaultHttpFeedEndpoint = "http://192.168.1.51:8010/api/current-alarms"` | `Controllers/V1/OpcConnectionsController.cs:27` | ditto |
| `"http://192.168.1.51:8010/…"` in the **checked-in Production config** | `appsettings.Production.json:4-5` | contradicts the explicit warning at `appsettings.Development.json:8` |
| DB password `supersecurepassword123` in checked-in config | `appsettings.json:3`, `appsettings.Development.json:3` | **credential in source control** |
| `"http://host.docker.internal:5050"` OPC gateway fallback | `OpcConnectionsController.cs:507, 458` | dev-host address in a production code path |
| `AdminOpcServersController.GetAll` returns a **fabricated** `Status:"Connected", EventsPerSec:0` row | `AdminOpcServersController.cs:27-39` | admin UI shows a server that is never probed |
| `PurgeLabInjectedAlarms` — a **lab data-deletion endpoint** shipped in the production controller, gated only by `alarm.acknowledge` | `AlarmsController.cs:114-124`; SQL at `AlarmRepositories.cs:113-125` | any operator with ack rights can mass-delete every alarm whose `SourceName` contains `/` |

---

## 8. Persistence — `AmsDbContext` vs the domain model

### 8.1 Fields the domain models but EF does NOT persist

`Persistence/AmsDbContext.cs:70-106`. **Mapped:** `Id`, `AlarmId`, `ServerId`, `SourceName`, `Severity`, `Message`, `ConditionName`, `SubConditionName`, `EventTime`, `Acknowledged`(`ack_status`), `OpcAttributes`, `State`, `IsShelved`, `ShelveUntil`, `IsSuppressed`, `ShelvedBy`. **That is 16 of 40+ properties.**

`b.Ignore(...)` — **not persisted**: `CreatedAt`, `UpdatedAt`, `AlarmTagId`, `EventType`, **`Priority`**, **`Category`**, `Quality`, `QualityGood`, **`ConditionActive`**, **`ActiveTime`**, **`AckTime`**, **`AckedBy`**, **`AckComment`**, `ServerReceivedAt`, `ShelvedAt`, **`ShelveComment`**, `SuppressedAt`, `SuppressedBy`, **`SuppressionReason`**, **`IsOutOfService`**, `CorrelationId`, `RootCauseAlarmId`, `IsRootCause`, `ProcessValue`, `ProcessUnit`, **`CustomAttributes`**, `KafkaOffset`, `KafkaPartition`, `KafkaTopic`, `DomainEvents`.

This matches the actual `alarms.alarm_current` DDL (`database/scripts/02_alarm_schema.sql:37-50` + `35_alarm_current_identity.sql:24` + `36_alarm_shelving.sql:21-25`), which genuinely has only ~15 columns. The *table* is the constraint; the domain model is far richer than what is stored.

**`CustomAttributes` being unmapped is the most consequential:** the entire ACK lifecycle state (`ackLifecycleState`, `pendingAckCommandId`, `ackCorrelationId`, `ackLifecycleId`, `dcsSequenceId`, `ackRequestedAtEpochMs`, `ackLifecycleDetail`) is written into `CustomAttributes` by `ActiveAlarm.ApplyAckLifecycle` (`ActiveAlarm.cs:306-321`) — and **none of it is ever persisted**. `LifecycleEventConsumerService.cs:82-83` calls `UpdateAsync` + `SaveChangesAsync` believing it saved that state; the only thing that actually reaches the database is `ack_status` and `state` (from the `ACK_CONFIRMED` branch at `ActiveAlarm.cs:323-336`). On the next read, `GetAckLifecycleState()` returns `null` and the out-of-order-protection at `LifecycleEventConsumerService.cs:68-72` is a no-op.

### 8.2 `shelved_by` column type mismatch (**HIGH**)

`AmsDbContext.cs:91` maps `Guid? ShelvedBy → shelved_by`. `database/scripts/36_alarm_shelving.sql:24` creates `shelved_by VARCHAR(255)`. (`database/scripts/03_apply_ef_migrations.sql:80` creates it as `UUID` — but on `active_alarms`, the orphaned table.) Reading `alarm_current` back into `Guid?` from a `varchar` column will fail in Npgsql. This affects **every** `SELECT` from `alarm_current`, not just shelve. **Requires runtime verification against the live lab DB** — but the two DDLs and the EF mapping are provably inconsistent.

---

## 9. Auth

**Model:** edge-only. `GatewayHeaderAuthHandler` (`Auth/GatewayHeaderAuthHandler.cs:20-58`) is the single registered authentication scheme (`ServiceCollectionExtensions.cs:17-20`). It performs **no cryptography**: it reads `X-Auth-Subject`, `X-Auth-Username`, `X-Auth-Role`, `X-Auth-Permissions` (comma-separated) and materialises a `ClaimsPrincipal`. Missing `X-Auth-Subject` → `AuthenticateResult.NoResult()` (`:31-32`) → `[Authorize]` returns 401. ✅ The edge-only model **is** applied.

**Policies** (`ServiceCollectionExtensions.cs:22-35`): `alarm.view`, `alarm.acknowledge`, `alarm.acknowledge_batch`, `alarm.shelve`, `alarm.unshelve`, `alarm.suppress`, `alarm.export`, `soe.view`, `analytics.view`, `admin.users.edit`, `admin.audit.view`, `system.manage` — each a bare `RequireClaim("permission", "<name>")`.

**There is no authorization kill switch** — `Program.cs:310-313` documents that `Security:DisableApiAuthorization` was removed. ✅

### Security gaps

| # | Severity | Finding |
|---|---|---|
| S-1 | **High** | Any service on the compose network can call `ams-api` with self-authored `X-Auth-*` headers and obtain full permissions. The design assumes the gateway is the only network path; the handler itself has **no** defence (no shared secret, no mTLS check, no source-IP check). `ams-api` publishes no host port, so this is contained to a compose-network compromise — but it is a single hop from any other container. |
| S-2 | **Medium** | `GET /api/v1/alarms/active`, `/active/statistics`, `/historical`, `/transitions` carry **only `[Authorize]`** — the `alarm.view` policy exists (`ServiceCollectionExtensions.cs:23`) but is applied to **no alarm read endpoint**. Any authenticated principal with zero permissions reads every alarm. |
| S-3 | **Medium** | `GET /api/v1/health/pipeline` and `/health/kafka` are `[AllowAnonymous]` (`HealthPipelineController.cs:30,38`) and expose broker health, consumer lag, Flink operator metrics, OPC connection inventory and telemetry counters. |
| S-4 | **Medium** | `POST /api/v1/opc/connections/sync-from-gateway` (`OpcConnectionsController.cs:494`) **deletes and creates DB rows** but inherits only the class-level `analytics.view` policy, not `system.manage` like the other mutations. Same for `POST /api/v1/opc/connections/test` (`:303`) and `GET {id}/browse` (`:318`). |
| S-5 | **Medium** | SSRF: `POST /api/v1/opc/connections/test` takes an arbitrary `endpoint` from the body and issues an outbound `HttpClient.GetAsync` (`:410-425`) or raw `TcpClient.ConnectAsync` (`:337-341`), returning status code and body in the response. Reachable with `analytics.view`. |
| S-6 | **Medium** | `POST /api/v1/alarms/active/purge-lab-data` mass-deletes alarms with only `alarm.acknowledge` (`AlarmsController.cs:115`). The predicate `a.SourceName.Contains("/")` (`AlarmRepositories.cs:117`) matches any hierarchical UNS tag. |
| S-7 | **Low** | Argument injection: `FlinkRestClient.SubmitReplayJobAsync` interpolates the caller-supplied `correlationId` unescaped into Flink `programArgs` (`Services/FlinkRestClient.cs:34`). Gated by `system.manage`. |
| S-8 | **Low** | `appsettings.json:3` / `appsettings.Development.json:3` contain a plaintext DB password. |
| S-9 | **Low** | `AlarmHub` has `[Authorize]` with no policy — any authenticated connection receives **every alarm on the system** via `Clients.All`; the `role-`/`station-`/`server-` groups provide no isolation because publishing is unconditional to `All`. |
| S-10 | **Low** | `ASPNETCORE_ENVIRONMENT: Development` in `infra/docker/docker-compose.yml` → Swagger UI exposed (`Program.cs:284-295`), CORS policy active (`:280-281`), detailed SignalR errors (`:181`), HTTPS redirection off (`:297`). |

---

## 10. Bugs

### Critical

| ID | Finding |
|---|---|
| **C-1** | **`priority` and `category` filters/sorts on `GET /api/v1/alarms/active` throw at runtime.** `ActiveAlarmRepository.ApplyActiveFilters` builds `Where(a => a.Priority == …)` (`AlarmRepositories.cs:78`) and `Where(a => a.Category == …)` (`:82`), and `GetActiveAlarmsAsync` sorts `OrderByDescending(a => a.Priority)` when `sortBy="Priority"` (`:50-51`). Both properties are `b.Ignore(...)`d (`AmsDbContext.cs:75-76`), so they are not in the EF model and the LINQ expression cannot be translated → `InvalidOperationException` → `GlobalExceptionFilter` → **HTTP 500**. Failure scenario: an operator clicks the "Critical" priority filter or sorts by priority and the alarm list breaks. |
| **C-2** | **`?isShelved=true` can never return a row.** `ApplyActiveFilters` first restricts to `State ∈ {UnacknowledgedUncleared, AcknowledgedUncleared}` (`AlarmRepositories.cs:73`). `ActiveAlarm.Shelve` sets `State = Shelved` (`ActiveAlarm.cs:244`) → `state='SHELVED'` in the DB (`AmsDbContext.cs:117`). The state predicate excludes it before the `IsShelved` predicate runs. Identically, `?isSuppressed=true` always returns empty. **The shelved-alarm view is structurally impossible.** |
| **C-3** | **One malformed event poisons up to 99 good ones.** `NormalizedAlarmConsumerService` batches 100 events (`KafkaConsumerService.cs:203,250`) and calls `NormalizedAlarmIngestor.ProcessAsync` for each inside one try (`:307-308`). `ActiveAlarm.CreateFromOpcEvent` throws `ArgumentOutOfRangeException` for `severity < 1 or > 1000` (`ActiveAlarm.cs:171-172`). A single Flink event with `severity=0` throws → the whole batch retries 4× (`:298`) → then **all 100 events go to the DLQ** (`:357-367`) and are lost from the projection. Same for a `null` `priority`/`category` (`.ToUpper()` NRE at `NormalizedAlarmIngestor.cs:294,304`) and a `null` `sourceName` (`.StartsWith` at `:262`). |
| **C-4** | **Two events for the same new alarm in one batch kill the batch.** `GetBySourceNameForIngestAsync` (`AlarmRepositories.cs:140-144`) executes SQL against the database and does not see entities added earlier in the same batch. Both events therefore take the "create" branch (`NormalizedAlarmIngestor.cs:57`) and produce two `ActiveAlarm` instances with the same deterministic `Id` (`:59`) → EF throws *"another instance with the same key value is already being tracked"* at `AddAsync`/`SaveChangesAsync` → 4 retries → **DLQ for the whole batch**. This triggers on any alarm burst where a tag transitions twice within one 100-event window. |

### High

| ID | Finding |
|---|---|
| **H-1** | **Single ACK of an ineligible alarm returns HTTP 500, not 400.** `OperatorActionPublisher.PublishAcknowledgeAsync` throws `InvalidOperationException` when `IsWritebackAckEligible` is false (`OperatorActionPublisher.cs:41-47`). `AcknowledgeAlarmCommandHandler` does not catch it (`AlarmCommands.cs:55-75`), so it reaches `GlobalExceptionFilter` → generic 500 with `"An unexpected error occurred"` (`GlobalExceptionFilter.cs:25-31`). The operator never sees the actual reason (`"No OPC cookieOffset — wait for live DCS event"`, etc.) that `OpcCookieHelper.AckIneligibleReason` computed. The batch path handles this correctly (`AlarmCommands.cs:133-140`); the single path does not. |
| **H-2** | **ACK lifecycle state is never persisted** — see §8.1. Every `ApplyAckLifecycle` write into `CustomAttributes` is discarded because the property is `Ignore`d (`AmsDbContext.cs:102`). Consequences: the out-of-order guard in `LifecycleEventConsumerService.cs:68-72` never fires (it always reads `null`); `ClearOpcInferredAcknowledgement`'s protection against clobbering a pending operator ACK (`ActiveAlarm.cs:379-384`) never fires, so an OPC event reporting `acknowledged=false` **silently reverts an in-flight operator acknowledgement**; and `IsWritebackAckEligible`'s `opcAckWriteable` reasoning is the only surviving ACK metadata. |
| **H-3** | **Deterministic alarm-id formula does not match Flink.** `.NET AlarmPartitionKeys.DeterministicAlarmId` (`Kafka/AlarmPartitionKeys.cs:53-59`) does `MD5`, then sets RFC-4122 version/variant bits (`:56-57`), then `new Guid(hash.AsSpan(0,16))` — which reads Data1/Data2/Data3 **little-endian**. Java `AlarmKeys.stableAlarmId` (`src/flink/src/main/java/com/ams/flink/AlarmKeys.java:15-26`) does `MD5` then packs bytes **big-endian** into `new UUID(msb,lsb)` and **does not set the version/variant bits**. Additionally the key strings differ: .NET prefixes `"v1|"` and trims each field (`:36,61`), Java does neither (`AlarmKeys.java:12`). The comment at `AlarmPartitionKeys.cs:52` ("Matches Java `UUID.nameUUIDFromBytes`") is **false on three counts**. Impact is contained only because Flink normally supplies `alarmId` and `ResolveAlarmIdentity` prefers it (`NormalizedAlarmIngestor.cs:272-276`); on the fallback path the .NET-generated row id is unaddressable from Flink. |
| **H-4** | **`serverId`, `priority` and `category` are silently ignored on `GET /api/v1/alarms/historical`.** `HistoricalAlarmRepository.QueryAsync` builds its WHERE from only `From/To`, `State`, `SourceNameContains`, `IsAcknowledged` (`AlarmRepositories.cs:168-194`). `ServerId`, `Priority`, `Category` are accepted by the API, passed into `HistoricalAlarmQuery`, and never used. `StreamAsync` (`:264-279`) ignores every filter except the time range — including the `serverId` the controller passes (`AlarmsController.cs:383-384`). Same defect class as the fixed `DATA-10`, unfixed for the historical path. |
| **H-5** | **`AmsDbContextModelSnapshot` targets the wrong table** — see §1.5. Any non-Development deployment applies migrations that build `alarms.active_alarms` while the runtime reads `alarms.alarm_current`. |
| **H-6** | **`shelved_by` type mismatch** — see §8.2. |
| **H-7** | **`BackgroundServiceExceptionBehavior.Ignore` in Development** (`Program.cs:53-56`), and compose runs `ams-api` in Development. If any hosted service throws out of `ExecuteAsync`, the host keeps running with that service permanently dead and **no restart, no alert**. `AlarmIngestionService` and `NormalizedAlarmConsumerService` both have paths that can escape their loops. Alarm ingest can stop while `/health/ready` still reports healthy (it only checks Postgres, `ServiceCollectionExtensions.cs:99`). |
| **H-8** | **Duplicate SignalR deliveries.** `PublishNewAlarmAsync` sends the *same* payload to `Clients.All`, then to the priority group, then to the server group (`AlarmHub.cs:303-311`). A client subscribed to both `alarms-CRITICAL` and its server group receives **three** `OnNewAlarm` callbacks for one alarm. `PublishAlarmUpdatedAsync` sends **two** (`:317-318`). Any client-side counter, toast, or audible annunciator fires 2–3×. |
| **H-9** | **`PipelineHealthService` creates a new Kafka consumer group on every probe** — `GroupId = $"ams-health-lag-{Guid.NewGuid():N}"` (`:460`). `/api/v1/health/pipeline` is anonymous and polled by dashboards; each call leaves permanent group metadata in `__consumer_offsets`. Unbounded broker-side growth. |

### Medium

| ID | Finding |
|---|---|
| M-1 | `AlarmIngestionService._lastSnapshot` (`:50`) is **never pruned**. Cleared alarms stay in the dictionary forever with `State="CLEARED"` (`:128-136`). Unbounded memory growth proportional to lifetime distinct alarm ids. |
| M-2 | `AlarmReadCache` is keyed by `$"active:{Request.QueryString.Value}"` (`AlarmsController.cs:67`) into a shared `IMemoryCache` with **no `SizeLimit`** (`Program.cs:95`). An authenticated caller can flood the cache with arbitrary query strings. Also a classic stampede: `GetOrCreateAsync` (`AlarmReadCache.cs:31-40`) has no per-key lock, so N concurrent misses run N database queries. |
| M-3 | `AlarmEnricher.GetStatsSummaryAsync` materialises **every** active alarm row into memory (`ToListAsync`, `AlarmEnricher.cs:40`) then counts in LINQ-to-objects (`:43-48`). Under an alarm flood this is an unbounded allocation on every `/active` and `/active/statistics` call. Should be a single `GROUP BY`. |
| M-4 | `SetAlarmOutOfService`'s idempotency guard is dead. `IsOutOfService` is `Ignore`d (`AmsDbContext.cs:96`), so it is always `false` on a reloaded entity and `if (IsOutOfService) return Failure` (`ActiveAlarm.cs:287`) never trips. |
| M-5 | Shelved/suppressed rows can be silently reactivated. `NormalizedAlarmIngestor` calls `ApplyConditionChange` on projection events (`:133,151`), which overwrites `State` (`ActiveAlarm.cs:411,421`) without checking `IsShelved`/`IsSuppressed`. Result: `state='ACTIVE'` with `is_shelved=true` — the alarm reappears in the operator list while still flagged shelved in the database. |
| M-6 | Silent event drops in the ingestor: if `matches.Count == 0` and `evt.ConditionActive == false`, or if `isAckStateUpdate` and no row matches, `ProcessAsync` falls through and does nothing (`NormalizedAlarmIngestor.cs:57,99`) — **no log, no metric, no DLQ**. A clear event that arrives before its activate event is lost without trace. |
| M-7 | `PropagateCookieToSiblingRows` is effectively dead: it early-returns on `!alarm.ConditionActive` (`:209`), and `ConditionActive` is `Ignore`d in EF so freshly-loaded entities always have `false`. |
| M-8 | `HistoricalAlarmRepository.QueryAsync` sorts on an unsanitised interpolated column via a `switch` whitelist (`:198-203`) — safe — but `LIMIT @Limit OFFSET @Offset` with `pageSize` up to 5000 and no upper bound on `pageNumber` allows a deep-offset scan on a hypertable. |
| M-9 | `AlarmStateDeltaConsumerService`, `DriftAlertConsumerService`, `ReplayResultConsumerService` all use `JsonSerializer.Deserialize<T>(json)` with **default options** (`:54` in each). The target records use `[JsonPropertyName]` snake_case so this works, but `PropertyNameCaseInsensitive` is off and there is **no try/catch around the deserialize specifically** — a malformed message hits the outer `catch (Exception)` which logs and sleeps 1 s, then (auto-commit is on) the offset has likely already advanced. Message lost. |
| M-10 | `LifecycleEventConsumerService` uses `EnableAutoCommit = true` (`:39`) while doing a database write and a SignalR push per message. A crash between commit and write silently drops the lifecycle transition. Contrast `HttpAckWritebackService`, which correctly uses manual commit for the same class of work. |
| M-11 | `PipelineHealthService.GetConsumerLag` swallows every exception and returns `0` (`:481-484`). `/api/v1/health/kafka` then reports `status:"Healthy"` because `report.Kafka.Lag == 0` (`HealthPipelineController.cs:46`). **A broken lag probe is indistinguishable from a healthy pipeline.** |
| M-12 | `ShelveExpiryService` logs a **Warning**, not an Error, when `alarms.expire_shelved_alarms()` is missing (`:37`). Shelve expiry would be dead in production and only visible in log noise. |
| M-13 | `KpiConsumerService` builds its `IConsumer` in the **constructor** (`:41`) — a blocking Kafka client created during DI graph construction, before `ExecuteAsync`. It is also `IDisposable` but the service does not implement `Dispose`; only `_consumer.Close()` on loop exit (`:86`). If `ExecuteAsync` throws early, the consumer leaks. |
| M-14 | `HistoricalAlarmListResult.Items` is `IReadOnlyList<object>` holding Dapper `dynamic` rows, so the historical response is **snake_case** while the active response is **camelCase** (§2.1). Two shapes for the same conceptual entity. |
| M-15 | Both NDJSON streaming endpoints manually set a reserved transport header: `Response.Headers.Append("Transfer-Encoding", "chunked")` (`AlarmsController.cs:377` and `:442`). Kestrel manages framing itself; appending this header duplicates or conflicts with the framing Kestrel emits. Combined with `app.UseResponseCompression()` (`Program.cs:278`) — which lists `application/x-ndjson` as a compressible type (`ServiceCollectionExtensions.cs:79`) — the export responses are at risk of malformed framing. **Requires runtime verification against a live response.** |
| M-16 | The NDJSON export endpoints hold a Postgres connection open for the whole unbounded stream (`AlarmRepositories.cs:268` / `AlarmTransitionRepository.cs:76`, `QueryUnbufferedAsync`) with no row cap and no rate limit (`alarms-read` is **not** applied to `historical/stream` or `transitions/stream`). A single `alarm.export` caller can pin a pooled connection for the lifetime of a multi-million-row scan. |

### Low

| ID | Finding |
|---|---|
| L-1 | `AlarmsController.GetCurrentUserId` returns `Guid.Empty` when the `sub` claim is missing/unparseable (`:464`). The validators require a non-empty `UserId` (`AlarmCommands.cs:30`), so this surfaces as a confusing validation error rather than a 401. |
| L-2 | `ObservabilityController` route is `api/v1/[controller]` → **`/api/v1/Observability/replay`** with a capital O (`ObservabilityController.cs:12`), inconsistent with every other lowercase route. |
| L-3 | `AlarmHub.SubscribeToPriority` silently returns on an invalid priority (`:111`) with no error to the caller. |
| L-4 | `HistoricalAlarmRepository.CountAsync` (`:231-239`) has **zero callers** — `QueryAsync` computes its own count. Dead method on a public interface. |
| L-5 | `ActiveAlarmRepository.GetBySourceNameAsync` (`:127-132`) accepts `serverId` and **ignores it** — the exact defect `GetBySourceNameForIngestAsync` was created to fix. It has zero callers, so it is dead code with a live trap. |
| L-6 | `IActiveAlarmRepository.CountActiveAsync` returns `Task<int>` (`IRepositories.cs:15`) but `ActiveAlarmListResult.TotalCount` is `long` (`AlarmQueries.cs:69`) — silent narrowing at >2^31 rows. |
| L-7 | `AlarmIngestionService` clamps `PollIntervalMs` to `[1000,5000]` (`:100`) regardless of configuration — a configured 10 s poll silently becomes 5 s. |
| L-8 | `AlarmIngestionService.ParseResponse` swallows both parse attempts with bare `catch { }` (`:263,273`) and returns an empty list. A feed that starts returning HTML error pages looks identical to "no alarms" — and the empty list then makes `PublishDeltaAsync` mark **every** tracked alarm as `CLEARED` (`:128-137`). |
| L-9 | `AckSlaWatchdogService._states` (`AckSlaWatchdogService.cs:23`) would grow unboundedly for non-terminal lifecycle states. Moot — the service is never registered. |
| L-10 | `TelemetryDeadmanWatchdogService._stallAlertEmitted` (`:22`) is a plain `bool` written from the consumer thread (`:89`) and the watchdog thread (`:158`) with no synchronisation — a benign race that can duplicate or skip one alert. |
| L-11 | `AlarmIngestionService._lastMetricsLog` (`:53`) is a non-volatile `DateTimeOffset` — single-threaded here, so benign, but inconsistent with the `Interlocked` treatment of the neighbouring counters. |

---

## 11. Dead code inventory

| Item | Location | Evidence |
|---|---|---|
| **443 lines of commented-out code** (a verbatim duplicate of the whole file) | `AMS.Application/Alarms/Commands/AlarmCommands.cs:501-943` | verified: zero non-comment lines after 500 |
| `AckSlaWatchdogService` (+ `AckLifecycleAlertMessage`, `WatchState`) — 216 lines | `AMS.Infrastructure/Kafka/AckSlaWatchdogService.cs` | never registered; `[Obsolete]` at `:13` |
| `RawAlarmStreamEvent` record — 31 lines | `AMS.Infrastructure/Kafka/StreamMessages.cs:119-149` | zero references outside its own declaration |
| `IOpcDcsGateway.AcknowledgeAlarmAsync` | `AlarmCommands.cs:496` | zero call sites |
| `IAlarmSignalRPublisher.PublishBulkAlarmsUpdatedAsync` / `PublishFloodAlertAsync` / `PublishConnectionStatusAsync` | `AlarmCommands.cs:435,438,439`; impls `AlarmHub.cs:321,335,342` | zero call sites |
| SignalR client methods `OnBulkAlarmsUpdated`, `OnFloodAlert`, `OnServerStatusChanged`, `OnSoeEvent`, `OnAnalyticsUpdate`, `OnHeartbeat` | `AlarmHub.cs:139,142,145,148,151,157` | never invoked (§3.1) |
| SignalR groups `role-*`, `station-*`, `area-*` | `AlarmHub.cs:51,55,104` | joined, never published to |
| `AlarmHub.SubscribeToArea` | `AlarmHub.cs:102` | joins a group nothing publishes to |
| `ActiveAlarm.Acknowledge()` (`ActiveAlarm.cs:212`) | — | only callers are `AMS.Tests.Integration/Alarms/AlarmLifecycleTests.cs:46,58,60,107`. The production ACK path never touches it. |
| `ActiveAlarm.SetCorrelation()` (`:466`) | — | zero callers |
| All 10 domain-event records | `AMS.Domain/Alarms/AlarmDomainEvents.cs` | `AddDomainEvent` is called (`ActiveAlarm.cs:199,226,247,264,280,412,422`) but there is **no dispatcher and no `INotificationHandler` anywhere in the solution** — `DomainEvents` is `Ignore`d (`AmsDbContext.cs:106`) and `ClearDomainEvents` has zero callers. Events accumulate in a per-entity list and are discarded. |
| `SoeEventRepository` | `Repositories/StubRepositories.cs:21-38` | deliberate stub — returns an empty page; `soe.view` policy exists but no SOE endpoint |
| `OpcServerRepository` | `Repositories/StubRepositories.cs:41-51` | deliberate stub — all methods return empty/no-op |
| `HistoricalAlarmRepository.CountAsync` | `AlarmRepositories.cs:231` | zero callers |
| `ActiveAlarmRepository.GetBySourceNameAsync` | `AlarmRepositories.cs:127` | zero callers |
| `KafkaOptions`: `SchemaRegistryUrl`, `StreamProcessorGroupId`, `AckWritebackDlqTopic`, `ActiveAlarmsTopic`, `HistoricalAlarmsTopic`, `AlarmAnalyticsTopic`, `SoeEventsTopic`, `NotificationEventsTopic`, `DeadLetterTopic`, `LabDirectIngest` | `KafkaConsumerService.cs:23,32,35,38-43,55` | never read by any producer/consumer (`LabDirectIngest` only by the startup guard) |
| Policy `soe.view` | `ServiceCollectionExtensions.cs:30` | registered but applied to **zero** endpoints anywhere in the solution — dead policy |
| Policy `alarm.view` | `ServiceCollectionExtensions.cs:23` | applied only to `AdminOpcServersController.cs:21` and `AlarmIngestionAdminController.cs:35` — **never to any alarm read endpoint** (S-2) |
| `ActiveAlarmQuery.CorrelationId`, `.AreaIds` | `IRepositories.cs:116,121` | never bound by any controller, never used by any repository |
| `AMS.Infrastructure/OpcConnector/` | — | **empty directory** |
| `AMS.Infrastructure/Migrations/*` (5 migrations + snapshot) | — | targets `active_alarms`; the runtime targets `alarm_current` (§1.5) |
| `alarms.active_alarms` table | `database/scripts/03_apply_ef_migrations.sql:54` | created by scripts; no runtime code reads or writes it |
| `AlarmsController` route `POST active/purge-lab-data` | `:114` | lab tooling shipped in the production controller |
| `ObservabilityHub` XML comment "This controller had NO `[Authorize]`" | `ObservabilityController.cs:8-10`, `OpcConnectionsController.cs:12-17`, `ObservabilityHub.cs:36-39` | stale changelog text describing a fixed defect, presented as current-state documentation |

---

## 12. Component reference table

| Component | Responsibility | In | Out | Topics / group | HTTP | DB | Registered | Status |
|---|---|---|---|---|---|---|---|---|
| `AlarmIngestionService` | Poll HTTP alarm feed, diff, publish deltas | HTTP GET `AlarmIngestion:FeedUrl` | Kafka | → `raw-alarms` | — | — | ✅ (gated by `AlarmIngestion:Enabled`) | Implemented |
| `NormalizedAlarmConsumerService` | Project Flink state into Postgres + SignalR + history | `current-alarm-state` | Postgres, SignalR, `raw-alarms-dlq` | grp `ams-backend-2`, manual commit, batch 100 | — | `alarm_current` (EF), `alarm_history` (Dapper) | ✅ | Implemented |
| `NormalizedAlarmIngestor` | Upsert/delete logic per event | `NormalizedAlarmEvent` | entity mutations, SignalR | — | — | `alarm_current` | static helper | Implemented |
| `LifecycleEventConsumerService` | Apply ACK lifecycle + push `OnAckLifecycleUpdated` | `lifecycle-events` | Postgres, SignalR | grp `ams-backend-2-lifecycle`, auto-commit | — | `alarm_current` | ✅ | **Partially** — writes to unmapped `CustomAttributes` (H-2) |
| `HttpAckWritebackService` | POST ACK to DCS, publish result | `ack-writeback` | HTTP POST, `ack-results` | grp `ams-backend-2-http-ack-writeback`, manual commit | — | — | ✅ | Implemented (best-engineered consumer in the codebase) |
| `TelemetryDeadmanWatchdogService` | Detect ingest silence | `raw-alarms` | `lifecycle-alerts`, `TelemetryIngestState` | grp `ams-backend-2-telemetry-deadman` | — | — | ✅ | Implemented |
| `ShelveExpiryService` | 60 s sweep calling the expiry SQL function | timer | Postgres | — | — | `alarm_current`, `shelving_actions` | ✅ | Implemented |
| `KpiConsumerService` | Fan KPI topics to SignalR | 5 KPI topics | SignalR | grp `ams-api-kpi-consumer` | — | — | ✅ | Implemented |
| `AlarmStateDeltaConsumerService` | Flink delta → ObservabilityHub | `flink.state.alarm.delta` | SignalR | grp `ams-delta-consumer-ui` | — | — | ✅ | Implemented |
| `DriftAlertConsumerService` | Drift alerts → ObservabilityHub | `system.state.drift.alerts` | SignalR | grp `ams-drift-consumer-ui` | — | — | ✅ | Implemented |
| `ReplayResultConsumerService` | Replay deltas → ObservabilityHub | `flink.state.alarm.replay` | SignalR | grp `ams-replay-ui-consumer` | — | — | ✅ | Implemented |
| `AlarmEventProducer` | Shared idempotent JSON producer | any | Kafka | — | — | — | ✅ singleton | Implemented |
| `LifecycleEventPublisher` | Emit lifecycle transitions | — | `lifecycle-events` | — | — | — | ✅ singleton | Implemented |
| `OperatorActionPublisher` | Publish ACK commands | `ActiveAlarm` | `operator-actions` + `lifecycle-events` | — | — | — | ✅ singleton | Implemented |
| `AlarmSignalRPublisher` | Domain → hub bridge | entities | `/hubs/alarms` | — | — | — | ✅ singleton | **Partially** — 3 of 9 publish methods dead; duplicate delivery (H-8) |
| `AlarmEnricher` | Entity → DTO + stats | entities | DTOs | — | — | `alarm_current` | ✅ scoped | **Placeholder-grade** — 11 hardcoded fields (§7.1) |
| `ActiveAlarmRepository` | Active-alarm reads/writes | — | — | — | — | `alarm_current` | ✅ | **Partially** — C-1, C-2 |
| `HistoricalAlarmRepository` | History reads + append | — | — | — | — | `alarm_history` | ✅ | **Partially** — H-4, hardcoded server_id |
| `AlarmTransitionRepository` | SOE transition reads | — | — | — | — | `alarm_state_transitions` | ✅ | Implemented |
| `SoeEventRepository` | — | — | — | — | — | — | ✅ | **Placeholder** (documented stub) |
| `OpcServerRepository` | — | — | — | — | — | — | ✅ | **Placeholder** (documented stub) |
| `NoOpOpcDcsGateway` | DCS shelve writeback | — | log only | — | — | — | ✅ scoped | **Placeholder** — only impl |
| `FlinkRestClient` | Submit replay jobs | HTTP | Flink `/jars/{id}/run` | — | — | — | ✅ typed client | Implemented (S-7) |
| `PipelineHealthService` | Aggregate pipeline health | Kafka admin, Flink REST, Postgres | JSON | ad-hoc groups | `/api/v1/health/pipeline` | `pg_stat_activity` | ✅ singleton | **Partially** — H-9, M-11 |
| `AlarmReadCache` | 3 s versioned read cache | — | — | — | — | — | ✅ singleton | Implemented (M-2) |
| `GatewayHeaderAuthHandler` | Materialise `X-Auth-*` | headers | `ClaimsPrincipal` | — | — | — | ✅ sole scheme | Implemented (S-1) |
| `AckSlaWatchdogService` | ACK SLA breach alerts | `lifecycle-events` | `lifecycle-alerts` | grp `…-ack-sla-watchdog` | — | — | ❌ | **Dead code** |

---

## 12b. Test coverage of the alarm surface

| Project | File | What it covers |
|---|---|---|
| `AMS.Tests.Contract` | `Kafka/NormalizedAlarmEventJsonTests.cs` | **one** `[Fact]` — `cookieOffset` parsing from a Flink `ALARM_STATE_UPSERT` payload |
| `AMS.Tests.Integration` | `Alarms/AlarmLifecycleTests.cs` | pure domain-entity state machine (ack / shelve / suppress guards) — no DB, no API |
| `AMS.Tests.Integration` | `Alarms/Plan01ProjectionIntegrityTests.cs` | Testcontainers DB tests: `uq_alarm_current_identity` uniqueness (`:112,126,138`), `expire_shelved_alarms()` behaviour (`:154,178`), `alarm_history` column list (`:197`) |
| `AMS.Tests.Integration` | `Kafka/NormalizedAlarmEventJsonTests.cs` | duplicate of the contract test |

**Not covered by any test:** every controller and endpoint, the SignalR hub and its payload contract, the full ACK workflow, `AlarmEnricher` (the component with 11 hardcoded fields), `NormalizedAlarmIngestor` routing/branching, every Kafka consumer, `AlarmReadCache`, `OpcCookieHelper` eligibility rules, and `GatewayHeaderAuthHandler`. Every Critical and High finding in §10 is in untested code.

---

## 12c. `src/services/*` — alarm involvement

Verified by reading source, not by naming. **Net answer: neither `audit-service` nor the gateway contains any alarm-domain code. `notification-service` is the only one of the three that touches alarm-derived data.**

### notification-service (.NET 8, `src/services/notification-service/Program.cs`)

Runs on `:8080`, **no published host port, and no gateway route exists for it** — there is no `notification-service` cluster in `src/services/gateway/appsettings.json`, so its HTTP surface is unreachable from outside the compose network.

| Topic (verbatim) | Direction | Consumer group (verbatim) | Offset reset | File:line |
|---|---|---|---|---|
| `lifecycle-alerts` | consume | `notification-service-lifecycle-alerts` | Earliest | `Consumers/LifecycleAlertConsumer.cs:44,57,59` |
| `root-cause-events` | consume | `notification-service-group` | Latest | `Consumers/RootCauseConsumer.cs:26,39,40` |

`lifecycle-alerts` is written by two alarm-pipeline watchdogs in this backend: `TelemetryDeadmanWatchdogService.cs:153-157` (`TELEMETRY_STALLED`, live) and `AckSlaWatchdogService.cs:161` (`ACK_SLA_BREACH`, **dead — that service is never registered, §11**). So in the running system `notification-service` only ever sees telemetry-stall alerts. `root-cause-events` is produced by Flink (`src/flink/src/main/java/com/ams/flink/OpcEventStreamJob.java:119`).

No database. HTTP: `/metrics`, `/health` (anonymous), `/` (authenticated, returns a literal string).

Alarm-relevant defects found:
* **Root-cause notifications are silently empty.** Flink emits `{alarmId, rootCause, suppressed[], eventTime}` (`PipelineOperators.java:323-332`); the consumer deserializes into `RootCauseEvent` with `RootCauseId / InitiatingAlarmId / RootEquipmentId / RootEquipmentName / CorrelatedAlarmIds / …` (`Models/Models.cs:9-20`). **Zero field names overlap.** Deserialization succeeds with every field defaulted, so the generated email shows an empty equipment name, 0 correlated alarms, and a detection time of 1970-01-01.
* **A broker hiccup stops the host.** `RootCauseConsumer.cs:53` calls `Consume(stoppingToken)` *outside* the inner try (`:56`); the outer catch handles only `OperationCanceledException` (`:75`), so a `ConsumeException` escapes `ExecuteAsync`. `LifecycleAlertConsumer.cs:116-120` handles the same case correctly — divergent resilience between two consumers in one service.
* `NotificationOrchestrator.GetActivePoliciesForArea` is a **placeholder** — `// Mock DB fetch`, one hardcoded policy, hardcoded recipient `ops-lead@plant.local`, and the `areas` argument is ignored (`Orchestrator/NotificationOrchestrator.cs:162-178`).
* `Smtp__Host` is empty in the deployed stack (`docker-compose.yml:1205`); the `?? "localhost"` fallback does not trigger on an empty string (`Providers/EmailProvider.cs:26`), so every dispatch throws and is caught.

### audit-service (.NET 8, `src/services/audit-service/Program.cs`)

Consumes exactly one topic: **`audit-events`**, group **`audit-service-group`**, `Earliest` (`Consumers/AuditEventConsumer.cs:20,21,34,35`; topic string hardcoded). Postgres `traverse_audit`, schema `audit`, single table `audit.immutable_events` (`Persistence/AuditDbContext.cs:14,17`), created by `EnsureCreated()` at `Program.cs:56`.

Endpoints (all `RequireAuthorization("admin.audit.view")`): `POST /api/v1/audit/verify` (`:67`), `POST /api/v1/audit/rechain` (`:76`), `GET /api/v1/audit` (`:86`). `/metrics` and `/health` anonymous.

**It does not touch alarms.** Every producer on `audit-events` was enumerated: `display-service` (`Services/AuditEmitter.cs:19`), `cplm-api` (`Services/CplmAuditEmitter.cs:28`), `ingestion-service` (`Services/AuditEmitter.cs:20`), `auth-service` (`src/services/audit-emitter.ts:18`). **`ams-api` produces nothing to `audit-events`** — a repo grep for `Audit` under `src/backend/AMS.Api` returns three incidental hits (`ServiceCollectionExtensions.cs:33`, `Program.cs:150,312`).

> **A-1 (High, cross-cutting): there is no alarm audit trail.** Alarm acknowledge, shelve, unshelve, suppress and out-of-service are never written to the tamper-evident store — even though `Models/AuditEvent.cs:10,14` names `ALARM_ACKNOWLEDGED` and `Alarm` as the model's intended cases. Combined with §8.1 (ack comment, shelve comment, suppression reason and `AckedBy` are all unmapped in EF) and §7.1 (`ackedByUsername` / `ackComment` hardcoded `null` in the DTO), **the system currently retains no durable, queryable record of who acknowledged or shelved an alarm, or why.** That is a compliance gap against ISA-18.2 record-keeping expectations, not merely a missing feature.

Two further defects worth surfacing: the hash-chain salt is `Environment.GetEnvironmentVariable("AUDIT_SALT") ?? "default-development-salt"` (`Hashing/AuditHashChainService.cs:10`) and `AUDIT_SALT` is set **nowhere** in the repo — tamper-evidence rests on a source-visible constant. And `POST /api/v1/audit/rechain`, which rewrites every row's hash chain (`ChainIntegrityVerifier.cs:71-101`), is gated by the **read** permission `admin.audit.view` (`Program.cs:80`).

### gateway (.NET 8 + YARP 2.2.0, `src/services/gateway/`)

Published on host **8081** → container 8080 (`docker-compose.yml:786`), `ASPNETCORE_ENVIRONMENT: Production`. **No Kafka client, no database, no alarm-specific route.**

Alarm REST reaches ams-api through the catch-all route `api-catchall`: `/api/{**rest}` → cluster `ams-api` → `http://ams-api:8000`, no rewrite, order **100** (`appsettings.json:234-240`). `/api/v1/alarms/*` therefore has **no dedicated route, no dedicated auth policy, and no cache rule** — alarm state is structurally uncacheable, which is correct.

**SignalR `/hubs/alarms`:** route `hubs` = `/hubs/{**rest}` → cluster `ams-api-ws` → `http://ams-api:8000`, path unchanged, `AuthorizationPolicy: "default"` (`appsettings.json:254-260`); cluster `ActivityTimeout` **24 h** (`:316`). The `?access_token=` query parameter is handled at `Program.cs:87-91` (`JwtBearerEvents.OnMessageReceived` falls back to `Request.Query["access_token"]`). There is no `app.UseWebSockets()` — YARP performs the HTTP/1.1 upgrade itself via `IHttpUpgradeFeature`, which is the intended mechanism.

**The gateway is the single JWT validator** (`Program.cs:62-95`): RS256 only, issuer `traverse-auth`, audience `ams-services`, 30 s clock skew, keys from `JwksKeyCache`. It injects `X-Auth-Subject` / `X-Auth-Username` / `X-Auth-Role` / `X-Auth-Permissions` (`:116-134`) and **strips every inbound `X-Auth-*` header before authentication** (`:186-195`). This is what makes `GatewayHeaderAuthHandler` (§9) safe at the edge.

Two gateway findings that directly affect the alarm surface:

> **G-1 (High): the 4 KB alarm-ACK body limit never fires.** `Limits/BodyLimitMiddleware.cs:45-48` matches `path.StartsWithSegments("/api/alarms")`. The real route is **`/api/v1/alarms`** (`AlarmsController.cs:21`), and the frontend calls `/api/v1/alarms/...` (`src/frontend-ob/src/api/alarmApi.ts:77,90,103,112,123`). The `/ack` substring test is and-chained behind the wrong prefix, so **both branches are unreachable** and ACK bodies fall through to the 256 KB default. The control documented at `appsettings.json:26` and in `docs/api-gateway.md` is not in force.

> **G-2 (Medium, operational): operator ACKs fail closed when Redis is down.** Every non-GET request lands in the gateway's `mutation` rate-limit class — 120/min per user, **fail CLOSED** on Redis unavailability (`Program.cs:266-271`, `RateLimit/RedisRateLimiter.cs`). Alarm reads are class `read` (600/min, fail **open**). A Redis outage therefore produces the worst possible operator experience: the alarm list keeps updating while every acknowledge, shelve and suppress returns **429**. `POST /hubs/alarms/negotiate` is also in `mutation`, so SignalR reconnects fail too.

Other gateway notes: `X-Service-Key` is **not** stripped alongside `X-Auth-*` (`Program.cs:186-195`), and `TraverseAuth.cs:93-107` promotes a matching key to a service principal defaulting to `Perms.All` — neither `audit-service` nor `notification-service` has `Auth__ServiceKey` set in compose, so this is not exploitable against them today, but the gateway does not close the hole. `/gw/upstreams` and `/gw/upstreams/{cluster}/health` are anonymous and **exempt from rate limiting** (`Program.cs:182,156,275`) on the one published port. The `external-feed` cluster hardcodes `http://192.168.1.51:8010` (`appsettings.json:380`) and is a self-documented decommission candidate (`:243`).

---

## 13. Cross-cutting notes for the orchestrator

1. **Flink owns the alarm lifecycle; the .NET API is a thin command gateway + read projection.** ACK/shelve/suppress endpoints are *not* symmetric: ACK is fully Kafka-mediated and writes nothing to the DB; shelve/unshelve/suppress/OOS write directly to the DB and publish **nothing** to Kafka — so Flink's state machine is unaware of every shelve and suppression in the system. This is the single biggest architectural asymmetry in the alarm surface.
2. **The `alarm_current` projection table is far narrower than the domain model** (16 mapped properties out of 40+). Most of what the API DTO advertises simply has nowhere to live. The `AlarmEnricher` masks this by fabricating the missing values.
3. **Two competing schema sources of truth** — `database/scripts/` (live) and `AMS.Infrastructure/Migrations/` (stale, targets a table nothing uses). `MigrateAsync()` is only skipped because compose pins Development.
4. **Six documented backend components do not exist** (§1.4). `CLAUDE.md`, `architecture_document.md`, `docs/enterprise-cams-production-architecture.md` and `docs/flink-only-orchestration.md` should be corrected.
5. **No operator alarm action is recorded anywhere durable** (§12c, A-1). Not in `alarm_current` (the columns are unmapped), not in `alarm_history` (only projection events are appended), and not in `audit.immutable_events` (ams-api never produces to `audit-events`). The only trace of an acknowledgement is the `operator-actions` / `lifecycle-events` Kafka log, subject to whatever retention those topics carry.
6. **Suggested remediation order.** C-1 and C-2 are one-line-class fixes in `ActiveAlarmRepository` that unbreak the alarm list — do those first. C-3/C-4 (batch poisoning) need per-event isolation inside `FlushBatchAsync` and change durability behaviour — plan them together. H-2 (unpersisted ACK lifecycle) and A-1 (no audit trail) are both blocked on widening `alarm_current` / adding an ams-api audit emitter, so they are one workstream. §7.1 (`AlarmEnricher`) cannot be fixed before that widening lands — its hardcoded fields are a symptom, not the cause.
