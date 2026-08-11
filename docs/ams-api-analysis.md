# ams-api — Deep Analysis

> Analysis only — this document describes `src/backend/` as it exists today (post Plans 01–07).
> Nothing here is a change proposal unless explicitly marked *observation*.

**What it is:** the alarm-domain backend of the platform — the OPC A&E 1.10 / ISA-18.2-aligned
Consolidated Alarm Management core. It is the *oldest* service in the monorepo (the original AMS,
predating the Traverse microservices) and the only one built as a full Clean Architecture solution.

**Runtime:** .NET 8 / Kestrel, container `ams-api`, in-network `ams-api:8000` — reachable **only
through the API gateway** (`/api/*` catch-all, `/hubs/*`) since the Plan 04 lockdown.

---

## 1. Why is it separate from the other services?

Four real reasons, in order of weight:

1. **It is the system of record for alarms.** Every other service owns configuration or derived
   data (displays, templates, assets, loop KPIs); ams-api owns the *operational* alarm state an
   operator acts on — the `alarms.alarm_current` projection, its history, SOE, and the ACK
   round-trip to the DCS. Regulatory alignment (ISA-18.2 state machine, OPC A&E semantics) lives
   here and in the Flink jobs, nowhere else.
2. **It is a projection head, not a CRUD service.** The Traverse services are request/response
   minimal APIs. ams-api is dominated by **11 hosted background services** consuming Kafka and
   projecting into Postgres + pushing SignalR — an event-driven core with a REST façade attached.
3. **History.** It predates the Traverse migration (Clean Architecture: Api / Application /
   Domain / Infrastructure, MediatR CQRS, EF Core + Dapper). The newer services deliberately chose
   a lighter one-project minimal-API shape. Nobody has merged the styles because the seam between
   "alarm core" and "HMI platform" is also the team/domain seam.
4. **The single-instance pin.** The CPLM cutover left `RawLoopIotDbConsumer` here with its own
   consumer group, and the alarm projection consumers assume one writer. ams-api **must run as
   exactly one instance** until Plan 06 (scale-out) — another reason it isn't folded into the
   horizontally-scalable service fleet.

Size for context: ~11.4k lines of C# across 68 files — Api 4.7k, Infrastructure 4.5k,
Application 1.3k, Domain 0.9k.

---

## 2. Solution structure (Clean Architecture)

| Project | Role | Notables |
|---|---|---|
| **AMS.Domain** | Entities + repository contracts | `ActiveAlarm` (rich ISA-18.2 entity: priority, category, shelve/suppress/OOS state machine methods), `AlarmPriority/State/Category` enums, `IActiveAlarmRepository`, `IHistoricalAlarmRepository`, `ActiveAlarmQuery` |
| **AMS.Application** | CQRS handlers (MediatR) | `AcknowledgeAlarmCommand`, `GetActiveAlarmsQuery` (+ validation & logging pipeline behaviors), `IAlarmSignalRPublisher`, `IOperatorActionPublisher` abstractions |
| **AMS.Infrastructure** | EF Core (`AmsDbContext`), Dapper reads, Kafka clients | The projection consumers, repositories, `AlarmReadCache` (Plan 05), `KafkaOptions` |
| **AMS.Api** | Composition root | Controllers, the two SignalR hubs, all hosted services, auth handler, health checks, Serilog |

Persistence style is deliberately split: **EF Core for writes** (change tracking on the alarm
state machine), **Dapper/raw SQL for hot reads** (list/count), and the **COPY protocol** for the
bulk historical path.

---

## 3. The data flows (each and every connection)

### 3.1 Ingest → projection (the main pipeline)

```
OPC UA / StreamPipes ──► Kafka raw-alarms
                              │
                              ▼
              Flink OpcEventStreamJob (ISA-18.2 state machine, exactly-once)
                              │
                              ▼ current-alarm-state
        NormalizedAlarmConsumerService  ──►  alarms.alarm_current (EF upsert,
                              │              identity uq (server_id, source, …))
                              │              + AppendHistoryAsync → alarm_history
                              │              + AlarmReadCache.Invalidate()
                              ▼
                    AlarmSignalRPublisher ──► AlarmHub → every connected console
```

ams-api **does not compute alarm state**. Flink owns the lifecycle (`Kafka:UseFlinkOrchestration`
must be `true`; the code *throws at startup* if it isn't — the old in-service
`AlarmStreamProcessorService` path is dead by construction). ams-api's consumer only *projects*
Flink's decisions into Postgres and fans them out.

### 3.2 The ACK round-trip (operator → DCS → confirmation)

```
POST /api/v1/alarms/{id}/acknowledge (policy alarm.acknowledge)
  └► AcknowledgeAlarmCommand (MediatR)
       └► OperatorActionPublisher ──► Kafka operator-actions
             └► Flink ACK orchestrator ──► ack-writeback
                   └► HttpAckWritebackService (ams-api) ──► DCS HTTP endpoint
                         └► DCS result ──► ack-results ──► Flink ──► lifecycle-events
                               └► LifecycleEventConsumerService ──► alarm_current ack state
                                     + AlarmHub OnAckLifecycleUpdated (+ cache invalidate)
```

The ACK is **not** applied locally on the POST — it is requested through Kafka, executed against
the DCS, and only the *confirmed* lifecycle event mutates the projection. That is why the UI shows
an ACK lifecycle (Requested → Queued → Confirmed) instead of flipping a boolean.

### 3.3 Kafka topics — complete map

| Topic | Direction | Handler | Purpose |
|---|---|---|---|
| `current-alarm-state` | consume | `NormalizedAlarmConsumerService` | Flink's normalized alarm projection (the main feed) |
| `lifecycle-events` | consume | `LifecycleEventConsumerService` | ACK lifecycle transitions from Flink |
| `operator-actions` | produce | `OperatorActionPublisher` | operator ACK/shelve/suppress intents |
| `ack-writeback` | consume | `HttpAckWritebackService` | commands to execute against the DCS |
| `ack-results` | produce | `HttpAckWritebackService` | DCS execution results back to Flink |
| `raw-alarms` | produce | `AlarmIngestionService` | HTTP-feed poller fallback ingest (lab/edge feed) |
| `kpi`, `kpi-alarm-rates`, `kpi-bad-actors`, `kpi-health-scores`, `kpi-standing-snapshots` | consume | `KpiConsumerService` | Flink KPI jobs → dashboard analytics + `OnKpiUpdate` pushes |
| `flink.state.alarm.delta` | consume | `AlarmStateDeltaConsumerService` | state-drift observability stream → ObservabilityHub |
| `system.state.drift.alerts` | consume | `DriftAlertConsumerService` | drift detector alerts → ObservabilityHub |
| `flink.state.alarm.replay` | consume | `ReplayResultConsumerService` | replay-engine results → ObservabilityHub |
| `telemetry-deadman` | produce | `TelemetryDeadmanWatchdogService` | "feed went quiet" lifecycle alerts (notification-service consumes) |
| `loop.samples.v1` | consume | `RawLoopIotDbConsumer` | raw loop samples → IoTDB historian (**stayed here** after the CPLM extraction; own consumer group) |

### 3.4 Hosted services (the 11 workers)

| Service | Kind | Notes |
|---|---|---|
| `NormalizedAlarmConsumerService` | Kafka consumer | batched projection writes; DLQ + rebalance handling (Plan 02); invalidates the read cache |
| `LifecycleEventConsumerService` | Kafka consumer | ACK lifecycle → projection + SignalR |
| `AlarmStateDeltaConsumerService` / `DriftAlertConsumerService` / `ReplayResultConsumerService` | Kafka consumers | observability streams → `ObservabilityHub` (groups `ams-delta-consumer-ui`, `ams-drift-consumer-ui`, `ams-replay-ui-consumer`) |
| `KpiConsumerService` | Kafka consumer | 5 KPI topics → stats + SignalR |
| `RawLoopIotDbConsumer` | Kafka consumer | loop samples → IoTDB REST writer (`IotDbWriteClient`) |
| `AlarmIngestionService` | HTTP poller | polls the external alarm feed (`AlarmIngestion:FeedUrl`, 2s) → `raw-alarms`; resilient (Plan 05 RES-01) |
| `HttpAckWritebackService` | Kafka consumer + HTTP client | the DCS write side of the ACK loop |
| `TelemetryDeadmanWatchdogService` | timer | detects a silent feed, raises lifecycle alerts |
| `ShelveExpiryService` | timer (1 min) | calls `alarms.expire_shelved_alarms()` — the ISA-18.2 shelve timeout (function from migration 36) |

### 3.5 Outbound connections

| Target | Client | Purpose |
|---|---|---|
| Postgres `ams` DB | `AmsDbContext` (EF) + `NpgsqlDataSource` (Dapper/COPY) | the projection + history + SOE + OPC-server config |
| Kafka | Confluent.Kafka producers/consumers | everything in §3.3 |
| IoTDB (REST :8181) | `IotDbWriteClient` (named HttpClient) | raw loop samples |
| Flink JobManager (REST :8081) | `FlinkRestClient` (typed HttpClient) | pipeline status/health for observability + replay submission |
| External DCS/feed (`192.168.1.51:8010` in the lab) | `AlarmFeed` client + writeback client | poll `current-alarms`; POST acknowledgements |
| ~~auth-service JWKS~~ | — | **gone** — edge-only auth removed all token validation from this service |

All outbound HttpClients carry the standard resilience pipeline (retry + circuit breaker +
timeouts) since Plan 05.

---

## 4. SignalR — why it's here and what it pushes

SignalR is the **operator-facing realtime channel**: alarm state must appear on every console
within milliseconds of the projection write, and polling at that latency would melt the API.
The gateway proxies both hubs (WebSocket/SSE) and authenticates the connection at the edge
(`?access_token=` → validated by the gateway → identity forwarded as `X-Auth-*` → the
`GatewayHeaderAuthHandler` builds the principal SignalR authorizes against).

### `/hubs/alarms` — `AlarmHub` (`[Authorize]`)

Client-invokable: `SubscribeToServer(serverId)` / `UnsubscribeFromServer` (group membership per
OPC server). Server→client events:

| Event | Fired by | Meaning |
|---|---|---|
| `OnNewAlarm` / `OnAlarmUpdated` | projection consumer | a new/changed active alarm |
| `OnAlarmCleared` | projection consumer | return-to-normal |
| `OnAckLifecycleUpdated` | lifecycle consumer | ACK progressing through Requested→Confirmed |
| `OnBulkAlarmsUpdated` | batch operations | bulk ACK/shelve results |
| `OnFloodAlert` | KPI consumer | EEMUA-191 flood detection on/off |
| `OnServerStatusChanged` | ingestion/watchdog | OPC server connectivity |
| `OnSoeEvent` | projection consumer | sequence-of-events entries |
| `OnKpiUpdate` | KPI consumer | dashboard KPI refresh |

`AlarmSignalRPublisher` (singleton wrapping `IHubContext`) is the single point through which the
Kafka consumers publish — consumers never touch the hub directly.

### `/hubs/observability` — `ObservabilityHub` (`[Authorize(Policy="system.manage")]`)

Engineering/diagnostic stream (state deltas, drift alerts, replay progress) fed by the three
observability consumers. Admin-gated since Plan 03 (it previously had no `[Authorize]` at all).

**Frontend counterpart:** `alarmStore.ts` connects with `@microsoft/signalr` (WebSockets → SSE
fallback), maintains `HubConnectionState`, and falls back to a 30-second REST poll
(`refreshActiveAlarms`, overlap-guarded since Plan 07) whenever the hub is not `Connected`.

---

## 5. REST surface (all via the gateway `/api` catch-all)

| Route | Policies | What it serves |
|---|---|---|
| `GET /api/v1/alarms/active`, `/active/statistics` | `[Authorize]` (+ rate-limit `alarms-read`) | the alarm console list + stats — cached ≤3s, invalidated on projection writes (Plan 05) |
| `POST /api/v1/alarms/{id}/acknowledge`, `/acknowledge/batch` | `alarm.acknowledge(_batch)` | starts the ACK round-trip (§3.2) |
| `POST /api/v1/alarms/{id}/shelve`, `/unshelve`, suppress/OOS | `alarm.shelve` / `alarm.unshelve` / `alarm.suppress` | ISA-18.2 out-of-service states |
| `GET /api/v1/analytics/kpi` | `analytics.view` | KPI aggregates for dashboards |
| `GET/POST /api/v1/opc/connections*` | `analytics.view` read / `system.manage` write | OPC/DCS connection lifecycle (encrypted credentials via `ConnectionPasswordCrypto`) |
| `GET /api/v1/admin/opc-servers`, `/admin/alarm-feed` | `alarm.view` / `admin.users.edit` | ingest configuration/status |
| `POST /api/v1/Observability/replay` | `system.manage` | submit a state-replay to Flink |
| `GET /api/v1/health/pipeline`, `/health/kafka` | — | pipeline-level health detail |
| `GET /health`, `/health/ready`, `/metrics` | anonymous | aggregate health (503s when Kafka/Flink checks fail — see §7), Prometheus |

Cross-cutting: API versioning (`v{version}`), fixed-window rate limiting on the alarm read path,
response compression, Swagger only in Development/Staging, Serilog request logging (+ Seq sink
outside Development).

---

## 6. Authentication & authorization (current state)

- **No JWT validation exists in this service.** Since the Plan 04 final lockdown,
  `GatewayHeaderAuthHandler` materialises the gateway-forwarded `X-Auth-Subject/-Username/-Role/
  -Permissions` headers into the `ClaimsPrincipal`. The gateway is the single validator; ams-api
  is unreachable except through it (no published port).
- Authorization is unchanged and local: 13 registered policies mapping 1:1 to permission claims
  (`alarm.view`, `alarm.acknowledge`, `alarm.acknowledge_batch`, `alarm.shelve`, `alarm.unshelve`,
  `alarm.suppress`, `alarm.export`, `soe.view`, `analytics.view`, `admin.users.edit`,
  `admin.audit.view`, `system.manage`, …) — the RBAC catalog's alarm-domain slice.
- The former `Security:DisableApiAuthorization` kill switch is deleted (Plan 03).

---

## 7. Operational characteristics & known constraints (observations)

1. **Single instance, by contract.** One projection writer; `RawLoopIotDbConsumer`'s group must
   have one member (CLAUDE.md constraint). Plan 06 is the scale-out path (Redis-backed read
   cache, SignalR backplane, partition-aware consumers).
2. **`/health` couples to Flink/Kafka.** The aggregate health check 503s (and responds slowly)
   when Flink or Kafka is down even though the REST surface still works — in the lab this makes
   the container show `unhealthy` while the API answers fine. Worth knowing before reading a red
   healthcheck as an outage.
3. **The external feed poller retries forever.** With the lab's `192.168.1.51:8010` unreachable,
   `AlarmIngestionService` logs connection-refused warnings on every poll (bounded by the
   resilience pipeline). Expected in the lab; noisy.
4. **In-memory read cache.** `AlarmReadCache` is process-local — correct only while single-instance
   (it is), and flagged to move to the Redis cache tier with Plan 06.
5. **Startup guards are strict on purpose.** `UseFlinkOrchestration=false` or `LabDirectIngest=true`
   throw immediately — the service refuses to run in any mode where alarm state could be computed
   in two places.
6. **Program.cs is the composition hot-spot** (~700 lines including inline hosted services like
   `ShelveExpiryService` and `SoeEventRepository` stubs). The SOE repository currently returns
   empty results (stubbed) — SOE data flows to the UI via SignalR pushes, not the REST query path.

---

## 8. One-paragraph summary

ams-api is the alarm system of record: a single-instance, event-driven projection head that
consumes Flink's ISA-18.2 decisions from Kafka into Postgres, fans them out over two SignalR hubs,
executes the DCS ACK round-trip, and exposes the operator REST surface for alarm actions — wrapped
in Clean Architecture because it carries the platform's oldest and most safety-relevant domain
logic. It is separate from the Traverse services because it owns *operational* state (not
configuration), runs a fundamentally different workload (11 Kafka/timer workers vs request/
response), and is pinned to one instance until the Plan 06 scale-out work.
