# 06 — DCS Integration and ACK Write-Back

**Scope:** does this system actually write anything back to a DCS / control system?
**Method:** code only, hop by hop, no assumption that a documented hop exists.
**Repo root:** `d:\HMI_Project_Usama\AMS-open` · branch `main` @ `2886ccb`

---

## Verdict

**(b) Implemented only against a mock / HTTP stub — with the final protocol hop absent from this repository entirely.**

The ACK chain is real and complete for its first four hops: the operator's UI action reaches
`operator-actions`, a genuine Flink operator (`ack-processor`) transforms it into `ack-writeback`, and a
genuine .NET consumer (`HttpAckWritebackService`) picks that up and issues a real HTTP POST. That POST is
the end of the line. **There is no OPC-UA, OPC A&E, Modbus, or any other industrial-protocol write
anywhere in this repository** — a search of every `.csproj`, `pom.xml`, and `package.json` under `src/`
and `infra/` returns zero OPC/industrial client libraries. The only write-back target wired into the
default stack is `mock-dcs`, an **inline 16-line Python `HTTPServer` defined directly in
`infra/docker/docker-compose.yml:413-445`** that reads the POST body, `print()`s it, and returns
`HTTP 200 {"status":"ok"}`. In the default `docker compose up`, an operator acknowledgement therefore
terminates at a print statement, and the system reports `ACK_CONFIRMED` back to the operator on that basis.

The documented "OPC Gateway → DCS" hop is not merely unimplemented — **it is not in this repository and
cannot be built or reviewed from it.** `scripts/start-opc-gateway-lab.ps1:10-11` launches
`e:\AMS - HMI GRID\src\opc-gateway\AMS.OpcGateway\bin\Release\net8.0\AMS.OpcGateway.exe` — a different
drive, outside the repo tree. `src/opc-gateway/` does not exist; no compose service, Dockerfile, or
`AMS.sln` project references an OPC gateway. Separately, the in-process gateway abstraction that would
serve shelve/suppress write-back, `IOpcDcsGateway`, has exactly one implementation in the repo —
`NoOpOpcDcsGateway` (`src/backend/AMS.Infrastructure/Opc/NoOpOpcDcsGateway.cs:10`) — and it is the one
registered (`src/backend/AMS.Api/Program.cs:108`). It logs and returns `Task.CompletedTask`. **That is a
textbook placeholder: `ShelveAlarm` returns success without doing anything.**

Net effect: an operator pressing ACK in the console produces a correct, well-correlated, at-least-once
message flow that ends in an HTTP call to a configurable URL. Whether anything on the far side of that
URL can actually acknowledge an alarm on a DCS is **Unknown / Requires Verification** — the receiving
component lives outside this repository, and the only receiver present in-repo is a mock.

---

## Hop-by-hop table

| # | Hop | Component | file:line | Status | Evidence |
|---|---|---|---|---|---|
| 1 | Operator clicks ACK | `AlarmConsole` ack button / dialog | `src/frontend-ob/src/components/AlarmConsole/AlarmConsole.tsx:195-229`, `:361-366` | **Implemented** | `handleAcknowledgeConfirm` filters by `isOpcAckWriteable`, optimistically sets `ACK_REQUESTED`, calls the API |
| 1a | Client-side write guard | `isOpcAckWriteable` / `opcAckSkipReason` | `src/frontend-ob/src/utils/opcAckWriteable.ts:22-45`, `:47-69` | **Implemented** | Requires `conditionActive`, non-empty `conditionName`, `cookieOffset > 0` (non-HTTP feeds), `alarmEventKind == CONDITION`; excludes `Tracking*`/`System*` sources |
| 2 | HTTP call | `acknowledgeAlarmsBatch` → `POST /api/v1/alarms/acknowledge/batch` | `src/frontend-ob/src/api/alarmApi.ts:71-81` | **Implemented** | Body `{alarmIds, comment, operatorStation}` |
| 3 | API controller | `AlarmsController.BatchAcknowledgeAlarms` (and `.AcknowledgeAlarm`) | `src/backend/AMS.Api/Controllers/V1/AlarmsController.cs:170-192`, `:133-161` | **Implemented** | `[Authorize(Policy = "alarm.acknowledge_batch")]`; dispatches MediatR command. **No DB `acknowledged` write here** |
| 4 | Command handler | `BatchAcknowledgeAlarmsHandler` / `AcknowledgeAlarmCommandHandler` | `src/backend/AMS.Application/Alarms/Commands/AlarmCommands.cs:122-163`, `:55-75` | **Implemented** | Batch handler re-checks `OpcCookieHelper.IsWritebackAckEligible` at `:133-140`; single-alarm handler does **not** (guard falls through to the publisher) |
| 5 | Server-side write guard | `OpcCookieHelper.IsWritebackAckEligible` | `src/backend/AMS.Application/Alarms/OpcCookieHelper.cs:91-120` | **Implemented** | Mirrors the client guard; `OperatorActionPublisher.cs:41-47` throws `InvalidOperationException` if ineligible |
| 6 | Produce to `operator-actions` | `OperatorActionPublisher.PublishAcknowledgeAsync` | `src/backend/AMS.Infrastructure/Kafka/OperatorActionPublisher.cs:66-95` | **Implemented** | Builds `OperatorActionMessage`, key = `AlarmPartitionKeys.AssetKey(serverId, sourceName)`; emits `ACK_REQUESTED` then `ACK_QUEUED` lifecycle events (`:61-64`, `:97-101`) |
| 7 | Topic `operator-actions` | Kafka, 4 partitions, `cleanup.policy=delete` | `scripts/kafka-reset-lab-topics.ps1:22`; default name `src/backend/AMS.Infrastructure/Kafka/KafkaConsumerService.cs:26` | **Implemented** | — |
| 8 | **ACK orchestrator (Flink)** | `OpcEventStreamJob` operator `ack-processor` | `src/flink/src/main/java/com/ams/flink/OpcEventStreamJob.java:153-162`; transform `:213-242` | **Implemented — it is real Flink, not .NET** | Consumes `operator-actions` (group `flink-ams-operator-actions`), filters `ActionType == ACKNOWLEDGE`, maps to `ACK_WRITEBACK_COMMAND`, sets `ackState/lifecycleState = ACK_DISPATCHED`, sinks to `ack-writeback` |
| 8a | Job actually deployed | `flink-job-supervisor.sh` submits `AMS - Alarm State Machine` | `infra/docker/flink-job-supervisor.sh:92` | **Implemented** | Also `infra/docker/flink-submit-raw-alarms.sh` |
| 9 | Topic `ack-writeback` | Kafka, 2 partitions, unkeyed (`KafkaSinks.valueOnly`) | `scripts/kafka-reset-lab-topics.ps1:23`; `OpcEventStreamJob.java:209-211` | **Implemented** | `cleanup.policy=delete`, so unkeyed records are legal here |
| 10 | Write-back consumer | `HttpAckWritebackService` | `src/backend/AMS.Api/BackgroundServices/HttpAckWritebackService.cs:34-197` | **Implemented** | Registered at `src/backend/AMS.Api/Program.cs:147`. Group `{ConsumerGroupId}-http-ack-writeback`, `EnableAutoCommit = false`, commit only after the `ack-results` publish succeeds (`:169-183`) |
| 11 | **The actual "DCS write"** | `client.PostAsync(ackUrl, content)` | `HttpAckWritebackService.cs:125` | **Implemented as a generic HTTP POST — no industrial protocol** | JSON body: `correlation_ids[]`, `source_event_id`, `idempotency_key`, `action: "ACKNOWLEDGE"`, `operator`, `timestamp` (`:108-116`) |
| 12 | **OPC Gateway** | — | — | **MISSING from this repo** | `src/opc-gateway/` does not exist. No compose service, Dockerfile, or `AMS.sln` project. Referenced only as an out-of-repo absolute path: `scripts/start-opc-gateway-lab.ps1:10-11` → `e:\AMS - HMI GRID\src\opc-gateway\...\AMS.OpcGateway.exe` |
| 12a | OPC protocol client library | — | — | **MISSING** | Zero matches for `Opc.Ua` / `OPCFoundation` / `QuickOPC` / `node-opcua` / `milo` across all `*.csproj`, `pom.xml`, `package.json` in `src/` + `infra/` |
| 13 | **Actual write-back target** | `mock-dcs` — inline Python `HTTPServer` | `infra/docker/docker-compose.yml:413-445` (handler body `:425-437`) | **Placeholder (returns success without doing anything)** | `print('ACK', path, body)` then `send_response(200)` + `{"status":"ok"}`. Wired as the default at `docker-compose.yml:710`: `AlarmIngestion__AckWritebackUrl: ${ACK_WRITEBACK_URL:-http://mock-dcs:8010/api/alarms/acknowledge}` |
| 14 | Produce to `ack-results` | `HttpAckWritebackService` | `HttpAckWritebackService.cs:150-174` | **Implemented** | `AckResultMessage` keyed by `AlarmId`; `ResultState = ACK_CONFIRMED` on any 2xx, `ACK_FAILED` otherwise (`:126-148`) |
| 15 | `ack-results` → lifecycle | Flink `ack-lifecycle-sink` | `OpcEventStreamJob.java:165-179`; transform `:253-276` | **Implemented** | Maps `resultState` → `lifecycleState`, sinks to `lifecycle-events` |
| 16 | `ack-results` → projection | Flink `ack-projection-sink` | `OpcEventStreamJob.java:181-188`; transforms `:244-251`, `:278-300` | **Implemented** | Only `ACK_CONFIRMED` passes; emits `ACK_STATE_UPDATE` keyed by `alarmId` to compacted `current-alarm-state` |
| 17 | Projection → Postgres | `NormalizedAlarmIngestor` | `src/backend/AMS.Infrastructure/Kafka/NormalizedAlarmIngestor.cs:47-50`, `:57` | **Implemented** | `ACK_STATE_UPDATE` updates ack fields only and never resurrects a cleared alarm |
| 18 | Lifecycle → Postgres + UI | `LifecycleEventConsumerService` | `src/backend/AMS.Infrastructure/Kafka/LifecycleEventConsumerService.cs:56-105` | **Implemented** | Applies `ApplyAckLifecycle`, guards against terminal-state regression (`:67-72`), invalidates read cache, then `PublishAckLifecycleAsync` over SignalR (`:95-105`) |
| 19 | SignalR → UI | `OnAckLifecycleUpdated` handler | `src/frontend-ob/src/store/alarmStore.ts:517-519`, `:658-663` | **Implemented** | Grid column at `AlarmConsole.tsx:325-355`; `ACK_FAILED`/`ACK_TIMEOUT` row styling at `:489-494` |
| 20 | `AlarmStateDeltaConsumerService` | Observability delta feed | `src/backend/AMS.Api/BackgroundServices/AlarmStateDeltaConsumerService.cs:39-58` | **Implemented (secondary path)** | Subscribes `flink.state.alarm.delta`; producer exists (`src/flink/src/main/java/com/ams/flink/AlarmStateExportJob.java:65`) and the job is submitted (`infra/docker/flink-job-supervisor.sh:133`). Pushes to `ObservabilityHub`, **not** the alarm console — the console's loop closes via hop 19 |
| — | Shelve/suppress → DCS | `IOpcDcsGateway` → `NoOpOpcDcsGateway` | `src/backend/AMS.Infrastructure/Opc/NoOpOpcDcsGateway.cs:19-29`; registered `src/backend/AMS.Api/Program.cs:108` | **Placeholder (success without effect)** | `ShelveAlarmAsync` logs `"NoOp Shelve … (direct OPC writeback deferred/disabled)"` and returns `Task.CompletedTask`. Called from `AlarmCommands.cs:234` inside the shelve handler, whose result the UI reports as success |

### `IOpcDcsGateway` — every implementation and call site

Requested explicitly; enumerated exhaustively.

| Kind | Location |
|---|---|
| Interface declaration | `src/backend/AMS.Application/Alarms/Commands/AlarmCommands.cs:494-498` (`AcknowledgeAlarmAsync`, `ShelveAlarmAsync`) |
| **Implementations (1, total)** | `src/backend/AMS.Infrastructure/Opc/NoOpOpcDcsGateway.cs:10` |
| DI registration | `src/backend/AMS.Api/Program.cs:108` — `services.AddScoped<IOpcDcsGateway, NoOpOpcDcsGateway>();` |
| Call site — shelve | `src/backend/AMS.Application/Alarms/Commands/AlarmCommands.cs:234` |
| Injection points | `AlarmCommands.cs:198`, `:204`, `:209` (ShelveAlarmCommandHandler) |
| Commented-out duplicates (dead) | `AlarmCommands.cs:705`, `:711`, `:716`, `:742`, `:939` |
| Acknowledged gap | `AlarmCommands.cs:307` — `// NOTE: OPC/DCS un-suppression writeback is a follow-up (IOpcDcsGateway has no Unshelve yet).` |

`NoOpOpcDcsGateway.cs:8` states it "Replaces `StreamPipesOpcWritebackGateway`". **No such type exists
anywhere in the repo** — the class it replaced was deleted, and nothing real took its place. So the only
registered gateway is the no-op, and `AcknowledgeAlarmAsync` on it has **zero call sites** (the ACK path
bypasses `IOpcDcsGateway` entirely in favour of the Kafka/HTTP chain). Result: `IOpcDcsGateway` is a
placeholder for shelve and dead code for acknowledge.

---

## Sequence diagram — what ACTUALLY happens

```mermaid
sequenceDiagram
    autonumber
    actor Op as Operator
    participant UI as AlarmConsole (React)
    participant API as ams-api AlarmsController
    participant K1 as Kafka operator-actions
    participant FL as Flink ack-processor<br/>(OpcEventStreamJob)
    participant K2 as Kafka ack-writeback
    participant WB as HttpAckWritebackService
    participant DCS as mock-dcs<br/>inline Python HTTPServer
    participant K3 as Kafka ack-results
    participant LC as LifecycleEventConsumerService
    participant DB as Postgres active_alarms

    Op->>UI: Click ACK (dialog: comment + station)
    UI->>UI: isOpcAckWriteable() guard;<br/>optimistic ACK_REQUESTED
    UI->>API: POST /api/v1/alarms/acknowledge/batch
    API->>API: Policy alarm.acknowledge_batch<br/>IsWritebackAckEligible()
    API->>K1: OperatorActionMessage (ACKNOWLEDGE)
    API-->>UI: 200 "N dispatched to Flink"<br/>(NOT a DCS confirmation)
    Note over API,DB: No 'acknowledged' write on the POST path
    K1->>FL: consume
    FL->>K2: ACK_WRITEBACK_COMMAND<br/>lifecycleState = ACK_DISPATCHED
    K2->>WB: consume (manual commit)
    WB->>DCS: HTTP POST {correlation_ids, source_event_id,<br/>idempotency_key, action, operator, timestamp}
    rect rgba(220,60,60,0.16)
        Note over DCS: END OF CHAIN.<br/>print('ACK', path, body)<br/>return 200 {"status":"ok"}<br/>No OPC. No DCS. No protocol write.
    end
    DCS-->>WB: 200 OK
    WB->>K3: AckResultMessage ResultState=ACK_CONFIRMED
    WB->>K2: commit offset (only now)
    K3->>FL: consume
    FL->>FL: lifecycle-events (ACK_CONFIRMED)<br/>+ current-alarm-state (ACK_STATE_UPDATE)
    FL->>LC: lifecycle-events
    LC->>DB: ApplyAckLifecycle + acknowledged=true
    LC-->>UI: SignalR OnAckLifecycleUpdated
    UI->>Op: Grid shows ACK_CONFIRMED
```

The critical read: **the green "ACK_CONFIRMED" the operator sees is derived solely from an HTTP 200
returned by a print statement.** Nothing in the chain verifies that the DCS changed state, and there is
no read-back.

---

## Failure-handling analysis

### What is handled well

| Concern | Implementation | file:line |
|---|---|---|
| At-least-once delivery | `EnableAutoCommit = false`; offset committed only after `ack-results` publish succeeds | `HttpAckWritebackService.cs:53`, `:169-183` |
| Idempotency key | `CommandId`, else composite `{AlarmId}|{ActiveTimeEpochMs}|{CookieOffset}` | `HttpAckWritebackService.cs:104-106` |
| Poison-message handling | Malformed JSON is logged and committed (not retried forever) | `:82-87` |
| HTTP failure → typed result | Non-2xx or exception → `ACK_FAILED` with `ErrorMessage` carrying status + body | `:135-148` |
| Failure reaches the UI | `ACK_FAILED` → `lifecycle-events` → SignalR → grid column + row styling | `OpcEventStreamJob.java:253-276`; `LifecycleEventConsumerService.cs:95-105`; `AlarmConsole.tsx:489-494` |
| Correlation | `CommandId` / `CorrelationId` / `LifecycleId` / `DcsSequenceId` carried on every message via `IAckCorrelatedEvent` | `src/backend/AMS.Infrastructure/Kafka/StreamMessages.cs:29-51`, `:54-85`, `:88-116` |
| Out-of-order protection | Terminal ACK states are not regressed by late lifecycle events | `LifecycleEventConsumerService.cs:67-72` |
| Retry + circuit breaker + timeout | `ConfigureHttpClientDefaults(http => http.AddStandardResilienceHandler())` applies to every `HttpClient`, including `AlarmFeed` | `src/backend/AMS.Api/Program.cs:228`; client timeout 30 s at `:169-172` |
| Flink offset semantics | `committedOffsets(EARLIEST)` — a fresh submit will not replay and re-dispatch historical ACKs | `OpcEventStreamJob.java:198-202` |

### Defects and gaps

| ID | Finding | Evidence | Impact |
|---|---|---|---|
| **DCS-1** | **HTTP 200 is treated as DCS confirmation.** Any 2xx from any listener yields `ACK_CONFIRMED` and sets `acknowledged = true` in Postgres. No response body is parsed, no per-alarm result is checked, no read-back verifies the DCS state changed. | `HttpAckWritebackService.cs:126-132`; `OpcEventStreamJob.java:244-251` | An operator sees "acknowledged" for an alarm that may still be unacknowledged on the DCS. Safety-relevant under ISA-18.2. |
| **DCS-2** | **`ACK_TIMEOUT` is unreachable dead code.** The only emitter is `AckSlaWatchdogService`, which is `[Obsolete]` and **not registered** in `Program.cs`. Its comment claims "Flink owns ACK_TIMEOUT", but `OpcEventStreamJob.java` contains no timer, no `ProcessFunction`, and no `TIMEOUT` string (its only `Timeout` is `setCheckpointTimeout`). | `AckSlaWatchdogService.cs:11-14`, `:169-180`; state constant `AckLifecycleStates.cs:13`; grep of `src/flink` for `TIMEOUT` returns only `OpcEventStreamJob.java:34` | If `ams-api` is down or `ack-writeback` is unconsumed, an alarm sits at `ACK_DISPATCHED` **forever**. Nothing escalates. The UI renders a live-counting timer (`AlarmConsole.tsx:349-352`) that never terminates. |
| **DCS-3** | **`ACK_PENDING_DCS` is never set.** The watchdog's only timeout trigger requires that state (`AckSlaWatchdogService.cs:169`), and no producer emits it. | `AckLifecycleStates.PendingDcs` referenced only in the unregistered watchdog | Compounds DCS-2 — even if the watchdog were registered, it would never fire. |
| **DCS-4** | **DLQ is configured but never used.** `AckWritebackDlqTopic = "ack-writeback-dlq"` is declared and has zero producers and zero consumers. | `src/backend/AMS.Infrastructure/Kafka/KafkaConsumerService.cs:32`; no other reference in `src/` | Dead config. A permanently failing writeback is retried on every redelivery with no parking lot; a persistently non-2xx endpoint produces an unbounded stream of `ACK_FAILED` results. |
| **DCS-5** | **Retry amplification against a non-idempotent DCS.** `AddStandardResilienceHandler` retries the POST transparently, *and* an uncommitted offset causes full redelivery. Safety rests entirely on the receiver honouring `idempotency_key`. `mock-dcs` ignores it outright. | `Program.cs:228`; `HttpAckWritebackService.cs:101-106`; `docker-compose.yml:425-437` | A retried ACK is safe only if the real DCS implements the idempotency contract — which no code in this repo can enforce or verify. **Unknown / Requires Verification** for any real endpoint. |
| **DCS-6** | **Ack endpoints are not rate limited.** `alarms-write` (300/min) is defined but never applied; `AlarmsController` carries `[EnableRateLimiting("alarms-read")]` only on the three read endpoints. Validator caps a batch at 5000 alarms. | Limiter `src/backend/AMS.Api/Extensions/ServiceCollectionExtensions.cs:54-58`; attributes present only at `AlarmsController.cs:43`, `:318`, `:403`; cap `AlarmCommands.cs:96-97` | Unbounded ACK write volume toward the DCS endpoint. One client can issue repeated 5000-alarm batches with no throttle. |
| **DCS-7** | **No audit record of the ACK.** Neither ack handler emits an audit event; `audit-service` defines `ALARM_ACKNOWLEDGED` only as a doc-comment example, with no producer anywhere. | `AlarmCommands.cs:55-163` (no audit call); `src/services/audit-service/Models/AuditEvent.cs:10` | No immutable trail of who acknowledged what — an ISA-18.2 / regulatory gap on the single most safety-relevant operator action. |
| **DCS-8** | **Single-alarm ACK skips the handler-level eligibility check.** `AcknowledgeAlarmCommandHandler` has no `IsWritebackAckEligible` guard (the batch handler does, at `:133-140`). The guard still holds inside the publisher, but it surfaces as a thrown `InvalidOperationException` → unhandled → 500, rather than the batch path's clean skip-with-reason. | `AlarmCommands.cs:55-75` vs `:133-140`; publisher throw at `OperatorActionPublisher.cs:41-47` | Inconsistent error surface between the two endpoints. |
| **DCS-9** | **No confirm-dialog on batch scale and no dry-run flag.** The ack dialog collects a comment and station but presents no "you are about to write N acknowledgements to the DCS" confirmation; no dry-run/simulate mode exists anywhere in the chain. | `AlarmConsole.tsx:195-229`; `AcknowledgeDialog.tsx` | No last-line guard before a bulk write toward process control. |
| **DCS-10** | **`architecture_document.md` describes infrastructure that does not exist.** It cites StreamPipes as "sole telemetry authority", `docker-compose.streampipes.yml`, and `docs/streampipes-connectivity.md`. A repo-wide `find -iname '*streampipes*'` returns **zero files**. `NoOpOpcDcsGateway.cs:8` confirms StreamPipes was removed. `architecture_document.md:54` also describes `AMS.OpcGateway` as "ACK-only" with OPC-UA writeback "planned". | `architecture_document.md:54`; empty `find` result; `NoOpOpcDcsGateway.cs:8` | The authoritative architecture doc materially overstates DCS/edge integration. Anyone reading it will believe a protocol write-back exists. |

### Correlation on failure — how the result gets home

Correlation is genuinely well built and is the strongest part of this chain.
`AckCorrelationContext.CreateNew()` (`OperatorActionPublisher.cs:53`) mints `CommandId` + `CorrelationId`
+ `LifecycleId`; each is copied verbatim by the Flink transform (`OpcEventStreamJob.java:221-223`) and
echoed into `AckResultMessage` (`HttpAckWritebackService.cs:154-157`). The UI correlates by `alarmId`
(`alarmStore.ts:517-519`). Separately, `ResolveFeedCorrelationId`
(`HttpAckWritebackService.cs:199-211`) builds the DCS-facing correlation as `SourceAlarmId`, falling back
to `"{SourceName}|{ConditionName}"`, then to the internal GUID — the last fallback would send an
AMS-internal GUID to a DCS that has never seen it, which would silently fail to match on a real endpoint.

**So: yes, the UI does learn an ACK failed** (`ACK_FAILED` reaches the grid). But it never learns an ACK
*timed out*, because that state cannot be produced (DCS-2/DCS-3).

---

## Hardcoded configuration table

| Value | file:line | Overridable? | Impact |
|---|---|---|---|
| `http://192.168.1.51:8010/api/alarms/acknowledge` — DCS ACK URL default constant | `src/backend/AMS.Api/BackgroundServices/AlarmIngestionService.cs:21` | Yes, `AlarmIngestion__AckWritebackUrl` | Site-specific LAN IP compiled into the binary as the last-resort fallback. If config is blank and `FeedUrl` doesn't end in `/api/current-alarms`, the service posts operator ACKs to this address — whatever now lives there (`ResolveAckWritebackUrl`, `:30-41`). |
| `http://192.168.1.51:8010/api/alarms/acknowledge` — **checked into Production config** | `src/backend/AMS.Api/appsettings.Production.json:5` | Env override only | A production profile shipping a hardcoded private LAN IP. Directly contradicts the sibling comment at `appsettings.Development.json:8` ("never a hardcoded LAN IP in a checked-in file"). |
| `http://192.168.1.51:8010/api/current-alarms` — feed URL | `AlarmIngestionService.cs:20`; `appsettings.Production.json`; `docker-compose.yml:705` | Yes | Same class of leak on the ingest side. |
| `http://mock-dcs:8010/api/alarms/acknowledge` — **default ACK target of the whole stack** | `infra/docker/docker-compose.yml:710` | Yes, `ACK_WRITEBACK_URL` | Default `docker compose up` sends every operator acknowledgement to a print statement. The comment at `:706-709` acknowledges this was done because the real host was unreachable. |
| Guid `f0af9a6d-85f6-4c9f-a8ad-6de277d1d110` — `DefaultHttpFeedServerId` | `AlarmIngestionService.cs:18`; `docker-compose.yml:712` | Yes | Fixed synthetic server identity for the HTTP feed. |
| Guid `7ce5ecbf-70c9-498d-b899-5c8bb7add383` — **fallback OPC ServerId** | `src/backend/AMS.Application/Alarms/OpcCookieHelper.cs:84` | No — final `return Guid.Parse(...)` in the resolution chain | An alarm with no `ServerId`, no `serverId` attribute, and no `OpcGateway:DefaultServerId` config silently gets a lab simulator's GUID stamped on its ACK writeback, addressing the wrong DCS server. |
| Same GUID + ProgId `IntegrationObjects.OPCAEServer.Simulator.1` | `scripts/start-opc-gateway-lab.ps1:24`, `:27` | No | Lab OPC A&E simulator identity baked into the gateway bootstrap script. |
| `http://127.0.0.1:5050/opc/servers/connect` — gateway connect URL | `scripts/start-opc-gateway-lab.ps1:30` | No | Gateway assumed on loopback:5050. |
| `127.0.0.1:9093` — Kafka external listener for the gateway | `scripts/start-opc-gateway-lab.ps1:4`, `:19` | No | Overrides machine env; single-host assumption. |
| `e:\AMS - HMI GRID\src\opc-gateway\AMS.OpcGateway\bin\Release\net8.0\AMS.OpcGateway.exe` | `scripts/start-opc-gateway-lab.ps1:10-11`, build path `:14` | No | **Absolute path on a different drive, outside this repository.** The OPC gateway cannot be built, reviewed, versioned, or containerised from this repo. |
| `http://host.docker.internal:5050` — `OpcGateway:BaseUrl` fallback | `src/backend/AMS.Api/Controllers/V1/OpcConnectionsController.cs:458`, `:507` | Yes, `OpcGateway:BaseUrl` | Assumes a Docker-Desktop host bridge; fails on Linux/K8s deployment. |
| `localhost:9092` — Kafka bootstrap fallback | `src/backend/AMS.Api/BackgroundServices/AlarmStateDeltaConsumerService.cs:28` | Yes, `Kafka:BootstrapServers` | Silent wrong-broker fallback rather than fail-fast. |
| Group `ams-delta-consumer-ui` | `AlarmStateDeltaConsumerService.cs:32` | No | Not derived from `ConsumerGroupId`; multiple `ams-api` replicas would split partitions. |
| Port `8010` for `mock-dcs` | `infra/docker/docker-compose.yml:438`, `:442` | No | Chosen to mirror the real site feed's port. |

No credentials, tokens, or API keys are sent on the DCS write-back POST — the request carries **no
authentication headers whatsoever** (`HttpAckWritebackService.cs:118-125`). Whether the real endpoint
requires auth is **Unknown / Requires Verification**.

---

## Safety & validation summary

| Control | Present? | Evidence |
|---|---|---|
| Authorization on the ACK endpoint | **Yes** | `[Authorize(Policy = "alarm.acknowledge")]` / `"alarm.acknowledge_batch"` — `AlarmsController.cs:134`, `:171`; policies at `ServiceCollectionExtensions.cs:24-25`, claim-based, validated at the gateway (edge-only auth) |
| Eligibility guard (client) | **Yes** | `opcAckWriteable.ts:22-45` |
| Eligibility guard (server) | **Yes** (batch + publisher; not the single-alarm handler) | `AlarmCommands.cs:133-140`; `OperatorActionPublisher.cs:41-47` |
| Tag whitelist | **No** | Guard is structural (cookie/condition/kind), not an allow-list of writable tags |
| Rate limit on writes | **No** — limiter defined, never attached | `ServiceCollectionExtensions.cs:54-58` vs `AlarmsController.cs:43`, `:318`, `:403` |
| Batch size cap | **Yes** — 5000 | `AlarmCommands.cs:96-97` |
| Confirm dialog | Partial — collects comment/station, no scale warning | `AlarmConsole.tsx:195-229` |
| Dry-run / simulate flag | **No** | No such flag anywhere in the chain |
| Write guard / interlock | **No** | Nothing blocks writes by unit, mode, or shift |
| Read-back verification | **No** | Confirmation derives solely from the HTTP status code — `HttpAckWritebackService.cs:126-132` |
| Audit trail | **No** | DCS-7 above |

---

## Bottom line

The message plumbing is production-grade: correct at-least-once semantics, an idempotency key, real
correlation IDs threaded end to end, a real Flink orchestrator, and a UI that genuinely reflects
`ACK_FAILED`. What it plumbs *to* is not. The chain's last real hop is a bare HTTP POST to a configurable
URL; the only in-repo receiver is a print statement; the component that would speak an actual control
protocol lives on another drive and is not in this repository; and the one in-process DCS gateway
abstraction resolves to a no-op. Treat DCS write-back as **not demonstrated against any real control
system from this codebase**, and treat the "ACK_CONFIRMED" state as meaning "an HTTP endpoint returned
2xx" — nothing more.
