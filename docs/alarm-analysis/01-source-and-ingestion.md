# Alarm Source & Ingestion — Code-Verified Analysis

**Scope:** how alarm data actually enters the AMS/CAMS platform.
**Method:** read-only inspection of the repository at `d:\HMI_Project_Usama\AMS-open` (branch `main`, HEAD `2886ccb`). Every claim below cites `path/file.ext:line`. Where behaviour could not be established from code it is marked **Unknown / Requires Verification**.
**Excluded:** `src/xmlgraphics-batik-main ScreeN Import/` (retired legacy).

---

## 1. Executive summary

There is exactly **one** ingestion path that produces alarm data into the platform in running code:

> `AlarmIngestionService` (a .NET `BackgroundService` inside `ams-api`) polls a **plain HTTP JSON endpoint** with `GET`, diffs the response against an in-memory snapshot, and publishes changed records to the Kafka topic **`raw-alarms`**.

Everything else that *sounds* like an alarm source is not one:

- There is **no OPC-UA client, no OPC A&E/COM client, and no StreamPipes runtime anywhere in this repository.** No OPC package is referenced by any `.csproj` (`src/backend/AMS.Api/AMS.Api.csproj:10-24`, `src/backend/AMS.Infrastructure/AMS.Infrastructure.csproj:16-32`) and no `AMS.OpcGateway` project exists in the tree (`find . -iname "*OpcGateway*"` returns only scripts and config references; `scripts/start-opc-gateway-lab.ps1:10` points at an **out-of-repo** path `e:\AMS - HMI GRID\src\opc-gateway\...`).
- `src/services/ingestion-service` is **configuration CRUD only**. Its own health endpoint reports `"subscriber": {"status": "NotBuilt"}` (`src/services/ingestion-service/Program.cs:88`).
- `src/services/sparkplug-edge-node` is **egress**, not ingress: Kafka → MQTT Sparkplug B (`src/services/sparkplug-edge-node/src/main/java/com/ams/sparkplug/AlarmMetricPublisher.java:117-118` consumes Kafka; `:238` `messageArrived` is an empty body — nothing inbound is processed).
- The documented topic **`raw-opc-events` does not exist in `src/` at all** — it is docs-only, and `scripts/kafka-reset-lab-topics.ps1:85-88` actively **deletes** it as a legacy topic.

In the lab compose default, the single live path **points at an unreachable host** (`192.168.1.51:8010`), so no alarms flow from it; all lab alarm traffic is injected straight into `raw-alarms` by the Python simulators.

---

## 2. Verdict table — every candidate ingestion path

| # | Path | Real protocol client? | Produces to | Status | Evidence |
|---|---|---|---|---|---|
| 1 | **HTTP-JSON alarm feed poller** (`AlarmIngestionService`) | No protocol stack — plain `HttpClient.GetStringAsync` | `raw-alarms` (hardcoded literal) | **Implemented** (sole live producer) | `src/backend/AMS.Api/BackgroundServices/AlarmIngestionService.cs:87,158`; DI `src/backend/AMS.Api/Program.cs:146` |
| 2 | **OPC-UA** via `OpcConnectionsController` | No. TCP `connect()` only | nothing | **Placeholder** | `src/backend/AMS.Api/Controllers/V1/OpcConnectionsController.cs:332-347` — opens a `TcpClient`, returns "StreamPipes adapter validates full OPC-UA session" |
| 3 | **OPC A&E** via external gateway | No client in repo; HTTP probe of `/health/opc` on an external process | nothing (repo-side) | **Missing / external** | `OpcConnectionsController.cs:452-482`, default base `http://host.docker.internal:5050` (`:458`); no `AMS.OpcGateway` project in tree |
| 4 | **StreamPipes** | No. Only dead field names + a NoOp gateway | nothing | **Dead code** | `src/backend/AMS.Infrastructure/Opc/NoOpOpcDcsGateway.cs:8` "Used after StreamPipes was removed"; `src/backend/AMS.Domain/Connectivity/OpcConnection.cs:18-20` orphan `StreamPipes*Id` columns |
| 5 | **`src/services/ingestion-service`** (MQTT data-source config) | MQTTnet 4.3.7.1207 — used **only** for a one-shot connect/disconnect test | nothing | **Partially implemented** (config plane done, data plane absent) | `src/services/ingestion-service/ingestion-service.csproj:15`; `Services/MqttConnectionTester.cs:67-80`; `Program.cs:88` `subscriber: NotBuilt` |
| 6 | **`sparkplug-edge-node`** | Paho MQTT v3 + Tahu (`pom.xml:23-31`) — publish-only | MQTT `spBv1.0/...` (egress) | **Implemented, but egress** | `AlarmMetricPublisher.java:118` subscribes Kafka `live.alarms/live.metrics/live.loop.metrics`; `:397,447,494,516` publishes DBIRTH/DDATA; `:238` inbound handler empty |
| 7 | **EMQX / MQTT broker** | n/a | n/a | **Egress only, ingress denied** | `infra/docker/emqx/acl.conf:17-24` — only `spBv1.0/#`, `authorization.no_match = deny` (`docker-compose.yml` emqx block, `EMQX_AUTHORIZATION__NO_MATCH: "deny"`) |
| 8 | **`ams-sims/sim_alarm_feed.py`** | n/a (kafka-console-producer via `docker exec`) | `raw-alarms` | **Implemented — simulator only** | `ams-sims/sim_alarm_feed.py:107`; `ams-sims/simlib.py:118-158,320-353` |
| 9 | **`ams-sims/sim_stress_flood.py`** | n/a | `raw-alarms` (high rate) | **Implemented — simulator only** | `ams-sims/README.md:14` |
| 10 | **`scripts/sim` (`ams-sim` compose service)** | n/a | `live.metrics` — **process values, not alarms** | **Implemented — simulator only** | `scripts/sim/process_value_sim.py:38`; `infra/docker/docker-compose.sims.yml:21-31` |
| 11 | **`Invoke-AmsLabEventInject`** (`run-all.ps1 -InjectLabEvents`) | n/a | `raw-opc-events` | **Dead code / broken** | `scripts/lib/AmsContractChecks.ps1:275` produces to `raw-opc-events`, which nothing consumes and which `scripts/kafka-reset-lab-topics.ps1:86,108-115` deletes, with `KAFKA_AUTO_CREATE_TOPICS_ENABLE: "false"` (`infra/docker/docker-compose.yml:385`) |
| 12 | **`mock-dcs`** compose service | Python `http.server`, `do_POST` only | nothing | **Implemented — ACK sink only, not a feed** | `infra/docker/docker-compose.yml:413-445` — no `do_GET`, so it cannot serve `/api/current-alarms` |
| 13 | **`AdminOpcServersController`** | none | nothing | **Placeholder** (returns a synthetic row with `Status: "Connected"` hardcoded) | `src/backend/AMS.Api/Controllers/V1/AdminOpcServersController.cs:27-39` |
| 14 | **`AlarmIngestionAdminController`** | HTTP probe only | nothing | **Implemented** (read-only status/test; cannot change config) | `src/backend/AMS.Api/Controllers/V1/AlarmIngestionAdminController.cs:34-74`; `:61` "…and restart ams-api to change the feed URL" |

---

## 3. The one live path, in detail

### 3.1 `AlarmIngestionService` (`src/backend/AMS.Api/BackgroundServices/AlarmIngestionService.cs`, 323 lines)

**Registration:** `src/backend/AMS.Api/Program.cs:146` — `services.AddHostedService<AlarmIngestionService>()`, unconditional. Options bound at `Program.cs:135-136` from section `AlarmIngestion`.

**Gating config keys** (`AlarmIngestionOptions`, `:15-42`):

| Key | Code default | `appsettings.json` | `appsettings.Development.json` | `appsettings.Production.json` | docker-compose (`ams-api`) |
|---|---|---|---|---|---|
| `AlarmIngestion:Enabled` | `true` (`:23`) | `false` (`appsettings.json:25`) | `false` (`:7`) | `true` (`:3`) | `"true"` (`docker-compose.yml:704`) |
| `AlarmIngestion:FeedUrl` | `http://192.168.1.51:8010/api/current-alarms` (`:20,24`) | `""` (`:26`) | `""` (`:9`) | `http://192.168.1.51:8010/api/current-alarms` (`:4`) | `http://192.168.1.51:8010/api/current-alarms` (`:705`) |
| `AlarmIngestion:AckWritebackUrl` | `http://192.168.1.51:8010/api/alarms/acknowledge` (`:21,25`) | `""` | `""` | same LAN IP (`:5`) | `${ACK_WRITEBACK_URL:-http://mock-dcs:8010/api/alarms/acknowledge}` (`:710`) |
| `AlarmIngestion:PollIntervalMs` | `2000` (`:26`) | `2000` | `2000` | `2000` | `"2000"` (`:711`) |
| `AlarmIngestion:ServerId` | `f0af9a6d-85f6-4c9f-a8ad-6de277d1d110` (`:18,27`) | same | same | — | same (`:712`) |
| `AlarmIngestion:ServerName` | `Current Alarms Feed` (`:19,28`) | same | same | — | same (`:713`) |

**Enabled by default?** In-process default is `true`, but the shipped `appsettings.json` sets it to `false`, so a bare `dotnet run` is disabled. Under docker compose the env var `AlarmIngestion__Enabled=true` wins → **enabled in the default compose profile**.

**Loop** (`:67-102`):
1. `HttpClient` named `"AlarmFeed"` (30 s timeout, `Program.cs:169-172`).
2. `GET` the whole feed as a string (`:87`).
3. Parse (`ParseResponse`, `:245-277`): accepts either a bare JSON array, or an object with `items` / `Items` / `value` / `Value`. On parse failure returns an **empty list** silently (`:263,273,276`).
4. Diff against `_lastSnapshot` and publish (`PublishDeltaAsync`, `:104-140`).
5. `await Task.Delay(Math.Clamp(_opts.PollIntervalMs, 1000, 5000))` (`:100`) — the configured interval is **silently clamped to 1–5 s**.
6. Every exception → `LogWarning` and retry forever; no backoff, no circuit breaker, no DLQ (`:95-98`).

### 3.2 Inbound payload schema (what the feed must send)

`HttpFeedAlarmRecord`, `src/backend/AMS.Api/BackgroundServices/AlarmIngestionService.cs:290-322`. Deserialization is `PropertyNameCaseInsensitive = true` with explicit snake_case `[JsonPropertyName]`.

| Wire field | CLR type | Required? | Notes |
|---|---|---|---|
| `correlation_id` | `string?` | one of `correlation_id` / `tag_name` required (`:111-112`) | becomes `alarmId` verbatim when present (`:114-116`) |
| `tag_name` | `string?` | see above | fallback `alarmId` = `"{tag_name}\|{condition}"`; also first choice for `sourceName` (`:188`) |
| `source_event_id` | `string?` | optional | passed through as `sourceEventId`, defaults `""` (`:189`) |
| `event_name` | `string?` | optional | last-resort condition name (`:210`) |
| `state` | `string?` | optional | only `"cleared"` (case-insensitive) maps to `CLEARED`; **anything else, including null, maps to `ACTIVE`** (`:182-184`) |
| `severity` | `string?` | optional | `CRITICAL/HIGH/MEDIUM/LOW`, anything else → `LOW` (`:222-229`) |
| `priority` | `int` (non-nullable) | optional | used only when `severity` is blank; `<=1 → CRITICAL`, `2 → HIGH`, `3 → MEDIUM`, else `LOW` (`:213-220`). **Absent ⇒ 0 ⇒ CRITICAL** |
| `source_timestamp` | `string?` | optional | copied **verbatim, no parsing, no timezone normalisation**; when absent, `DateTimeOffset.UtcNow.ToString("o")` (`:194`) |
| `description` | `string?` | optional | first choice for the condition name (`:200-201`) and second choice for message |
| `message` | `string?` | optional | `:190` |
| `acknowledged` | `bool` | optional | default `false`; forwarded as `acknowledged` (`:195`) |
| `asset`, `area`, `site` | `string?` | optional | `sourceName` fallback chain `tag_name → asset → area → site → "HTTP Feed"` (`:188`) |
| `raw_payload` | `string?` | optional | re-parsed as JSON if possible, else echoed as a string, else `{}` (`:161-174`) |

### 3.3 Outbound payload published to `raw-alarms`

Built at `AlarmIngestionService.cs:144-158`, serialised camelCase by `AlarmEventProducer` (`src/backend/AMS.Infrastructure/Kafka/KafkaConsumerService.cs:528-530`).

| Field | Source |
|---|---|
| `alarmId` | `correlation_id` or `tag_name\|condition` |
| `sourceName` | `tag_name` ?? `asset` ?? `area` ?? `site` ?? `"HTTP Feed"` |
| `sourceEventId` | `source_event_id` or `""` |
| `message` | `message` ?? `description` ?? `""` |
| `priority` | `"CRITICAL" \| "HIGH" \| "MEDIUM" \| "LOW"` (string) |
| `condition` | `description` ?? second half of `correlation_id` split on `\|` ?? `event_name` ?? `"Alarm"` |
| `state` | `"ACTIVE"` or `"CLEARED"` |
| `timestamp` | `source_timestamp` verbatim, or ISO-8601 UTC `"o"` now |
| `acknowledged` | bool |
| `rawPayload` | parsed `raw_payload` or `{}` |

**Kafka message key = `alarmId`** (`:158`).

**Notable omissions:** the envelope carries **no `schemaVersion`, no `eventType`, no `serverId`, no `severity` integer, no `eventTimeEpochMs`, no `subConditionName`, no `cookieOffset`** — even though `StreamSchemaVersion.RawAlarms = 2` and `StreamEventTypes.RawAlarmEvent = "RAW_ALARM_EVENT"` are declared for exactly this envelope (`src/backend/AMS.Infrastructure/Kafka/StreamEventContracts.cs:9-10,20`). The simulators *do* emit those fields (`ams-sims/simlib.py:325-353`), so simulator traffic and production traffic have **different shapes on the same topic**.

### 3.4 Producer settings (`AlarmEventProducer`, `KafkaConsumerService.cs:496-544`)

`Acks.All`, `EnableIdempotence` (default `true`, `KafkaOptions:46`), `MaxInFlight = 1`, `MessageSendMaxRetries = 3`, `RetryBackoffMs = 1000`, `BatchSize = 128 KB`, `LingerMs = 5`, `CompressionType.Lz4` (`:507-518`). Each event is `await`-ed individually (`:534`) — one round-trip per alarm change.

---

## 4. Raw topic entry points — who actually produces

| Topic | Real producers in running code | Consumers | Notes |
|---|---|---|---|
| **`raw-alarms`** | `AlarmIngestionService.cs:158` (**only** production producer). Simulators: `ams-sims/sim_alarm_feed.py:107`, `sim_stress_flood.py` | `OpcEventStreamJob` group `flink-ams-raw-alarms` (`src/flink/.../OpcEventStreamJob.java:52-55`); `IoTDBPersistenceJob` (`IoTDBPersistenceJob.java:49`); `TelemetryDeadmanWatchdogService` (`src/backend/AMS.Infrastructure/Kafka/TelemetryDeadmanWatchdogService.cs:57`) | 8 partitions, 7 d retention, lz4 (`scripts/kafka-reset-lab-topics.ps1:19`) |
| **`raw-opc-events`** | **none in `src/`.** Only `scripts/lib/AmsContractChecks.ps1:275` and `scripts/e2e-full-system-test.ps1:163` | **none** | Explicitly listed as a legacy topic to delete (`scripts/kafka-reset-lab-topics.ps1:86`). Corroborated by `docs/architecture-review/PHASE0-INVENTORY.md:106` (D-6) and `docs/architecture-review/EVIDENCE-APPENDIX.md:46` |
| `raw-alarms-dlq` | `KafkaConsumerService.cs:413` — but that is the **projection** consumer's DLQ (failures writing `current-alarm-state` to Postgres), **not** the ingest boundary | none in `src/` | 2 partitions (`kafka-reset-lab-topics.ps1:20`) |
| `alarm.events.raw` | none in `src/` | `AlarmReplayEngine.java:39`, `StateDriftDetectionJob.java:32` | orphan input |
| `loop-raw-data` | none in `src/` | `LoopKpiStreamJob.java:38` | orphan input (out of alarm scope) |
| `live.metrics` | `scripts/sim/process_value_sim.py:38`, Flink `LiveStateJob` | `sparkplug-edge-node` | process values, not alarms |

---

## 5. Flink-side ingest parsing (first consumer of `raw-alarms`)

`PipelineOperators.ValidationMap` (`src/flink/src/main/java/com/ams/flink/PipelineOperators.java:23-98`) is the real schema gate. It is deliberately **dual-shaped**:

- `httpFeed = root.has("alarmId") && root.has("state")` (`:42`) — this is how the HTTP-feed envelope is distinguished from the simulator/legacy envelope.
- Missing/empty `sourceName|sourcePath` **or** `conditionName|condition` ⇒ `return null` ⇒ **silently dropped**, no DLQ (`:40`).
- Any parse exception ⇒ `return null` (`:94-96`). The only visibility is the `records_in`/`records_out` counter delta (`:29-30`).
- `serverId` fallback constants: `"f0af9a6d-85f6-4c9f-a8ad-6de277d1d110"` for http-feed, `"7ce5ecbf-70c9-498d-b899-5c8bb7add383"` otherwise (`:45-46`) — both **hardcoded string literals** duplicated from C#/compose.
- `httpFeed` severity is derived **from the priority string**, discarding numeric fidelity: `CRITICAL→900, HIGH→700, MEDIUM→400, LOW→100, default→300` (`:63`, `:486-494`).
- Timestamps: `eventTimeEpochMs` → else `OffsetDateTime.parse(timestamp)` → else `OffsetDateTime.parse(eventTime)` → else **`System.currentTimeMillis()`** (`:471-484`). Because the HTTP feed forwards `source_timestamp` verbatim, any format that is not ISO-8601 **with an offset** silently degrades to Flink wall-clock time. Units are epoch-milliseconds; there is no timezone metadata anywhere in the envelope.

**Ingest DTO (Flink):** `src/flink/src/main/java/com/ams/flink/RawOpcAlarmEvent.java:4-42` — public fields `alarmId, alarmKey, serverId, source, condition, subCondition, message, severity, rawSeverity, conditionActive, ackRequired, opcDcsAcknowledged, acknowledged, cookieOffset, eventTimeEpochMs, activeTimeEpochMs, activeFileTime, priority, category, lifecycleState, transitionType, duplicate, httpFeed, sourceEventId, opcAttributesJson`.

---

## 6. Docker-compose wiring

| Container | Exists? | Profile | Ingestion role | Key env |
|---|---|---|---|---|
| `ams-api` | yes (`docker-compose.yml:679`) | default | **hosts the only live ingester** | `AlarmIngestion__Enabled=true`, `AlarmIngestion__FeedUrl=http://192.168.1.51:8010/api/current-alarms`, `Kafka__RawAlarmsTopic=raw-alarms`, `Kafka__IngestAuthority=api` (`:700-713`) |
| `ingestion-service` | yes (`:963`) | **default** (no `profiles:` key) | config CRUD only | `ConnectionStrings__TraverseIngestion`, `ENCRYPTION_KEY` (required, ≥32 chars), `Kafka__BootstrapServers=kafka:9092`, `Auth__ServiceKey` (`:972-983`). No published host port |
| `mock-dcs` | yes (`:413`) | default | ACK sink (POST-only) | inline Python; listens `0.0.0.0:8010` (`:438`) |
| `mosquitto-test` | yes (`:930`) | **`mqtt-test`** (opt-in) | broker for testing the ingestion-service connection tester | `1884:1883`, `MOSQUITTO_TEST_USER/PASSWORD` (`:942,948-949`) |
| `sparkplug-edge-node` | yes (`:801`) | default | Kafka → MQTT egress | `LIVE_ALARMS_TOPIC=live.alarms`, `MQTT_HOST=emqx`, `SPARKPLUG_GROUP=ams_site1`, `SPARKPLUG_EDGE=ams_edge1` (`:815-834`) |
| `emqx` | yes (`:182`) | default | Sparkplug egress broker; **ingress denied** | `EMQX_AUTHORIZATION__NO_MATCH: "deny"`; ACL allows only `spBv1.0/#` |
| `ams-sim` | `docker-compose.sims.yml:21` | separate file, must be named explicitly | `live.metrics` process-value feed | `--bootstrap kafka:9092 --interval 2` |
| `v2-validator` | `docker-compose.sims.yml:34` | `validate` | validation only | — |
| StreamPipes | **absent** | — | — | no service defined anywhere in `infra/docker/` |
| OPC gateway | **absent** | — | — | no service defined; only `OpcGateway:BaseUrl` config consumed by `OpcConnectionsController.cs:458,507` |

Kafka has `KAFKA_AUTO_CREATE_TOPICS_ENABLE: "false"` (`:385`), so any producer aimed at an undeclared topic fails loudly — this is what makes item 11 in the verdict table (`raw-opc-events` injection) definitively broken.

---

## 7. Deduplication, validation, rate-limiting, backpressure at the ingest boundary

| Control | Where | Verified behaviour |
|---|---|---|
| **Delta dedup** | `AlarmIngestionService.cs:120-121` | `ConcurrentDictionary<string, AlarmSnapshot>` keyed by `alarmId`; a record equal to the previous snapshot (record equality over all 9 fields) is skipped. **In-memory only, never persisted, never evicted.** |
| **Synthetic clear** | `:128-137` | Any tracked alarm absent from the current batch and not already `CLEARED` gets a synthetic `CLEARED` event with `Timestamp = now`. |
| **Ingest validation** | `:111-112` | Only "must have `tag_name` or `correlation_id`". No schema validation, no field-type checks, no bounds. |
| **Response-shape validation** | `:245-277` | Two tolerant attempts, then an **empty list** — a malformed feed response is indistinguishable from "zero alarms", which then triggers synthetic `CLEARED` for **every** tracked alarm. |
| **Rate limiting** | none | No cap on records per poll or events per second. |
| **Backpressure** | implicit only | Serial `await ProduceAsync` with `MaxInFlight=1` (`KafkaConsumerService.cs:512,534`) means a slow broker stretches the poll cycle; there is no queue, no drop policy, no metric for it. |
| **Response size limit** | none | `GetStringAsync` (`:87`) buffers the entire body with no `MaxResponseContentBufferSize`. |
| **DLQ at ingest** | **none** | `raw-alarms-dlq` is written only by the *projection* consumer (`KafkaConsumerService.cs:413`), never by the ingester and never by Flink's `ValidationMap`. |
| **Flink dedup** | `PipelineOperators.java:100-145` | Keyed on `alarmKey` (`serverId\|source\|condition\|subCondition`). Drops events whose `eventTimeEpochMs <= last` unless `conditionActive` or `acknowledged` flipped. |
| **Flood filter** | `PipelineOperators.java:360-383` | `max(severity, rawSeverity) >= 950` ⇒ dropped. Because the HTTP path derives severity from a 4-value priority string capped at 900 (`:486-494`), **this band is unreachable for the only live source**. |
| **Deadman watchdog** | `TelemetryDeadmanWatchdogService.cs:57,160` | Consumes `raw-alarms`; emits `TELEMETRY_STALLED` on `lifecycle-alerts` after `Kafka:TelemetryStallThresholdSeconds` (default 60, `KafkaOptions:50`). This is detection, not backpressure. |
| **Gateway rate limiting** | `src/services/gateway/appsettings.json:34` | Applies to the HTTP API surface (incl. `/api/ingestion`, route `:153-159`), **not** to the alarm ingest path, which never traverses the gateway. |

---

## 8. Active vs simulator-only vs abandoned

**Active in the real deployment (evidence-backed):**
- `AlarmIngestionService` → `raw-alarms`. Enabled by compose env (`docker-compose.yml:704`) and by `appsettings.Production.json:3`. `docs/edge-platform-implementation-plan.md:18` describes it as "✅ Running — Polls `192.168.1.51:8010` → `raw-alarms`".
- **Caveat:** the feed host is unreachable from the lab. `pipeline.md:17` (PIPE-002) records `Test-NetConnection 192.168.1.51 -Port 8010 → TcpTestSucceeded: False`. The compose comment at `docker-compose.yml:706-709` confirms "the real DCS host (192.168.1.51) is unreachable from this lab". So in the shipped lab configuration the poller retries forever with warnings and **produces nothing**. Corroborated by `docs/ams-api-analysis.md:225` ("The external feed poller retries forever").

**Simulator-only:** `ams-sims/sim_alarm_feed.py`, `sim_stress_flood.py` (→ `raw-alarms`), `sim_live_mqtt_direct.py` (→ `live.alarms`, bypasses ingest entirely, `ams-sims/README.md:14`), `scripts/sim/process_value_sim.py` (→ `live.metrics`). These are how every validated lab alarm actually entered the pipeline (`ams-sims/README.md:8-14`).

**Abandoned / dead:**
- StreamPipes — removed; only orphan DB columns and a NoOp gateway remain.
- `raw-opc-events` — deleted topic, docs-only, plus a broken injector script.
- OPC A&E gateway — external, not in this repo; `OpcConnectionsController` can only *probe* it.
- `Browse` endpoint — `OpcConnectionsController.cs:324` returns `"Browse not supported."`.
- `AdminOpcServersController` — "Legacy route — returns HTTP alarm feed only (OPC/gateway removed)" (`:9`).

**Partially built (forward-looking):** `ingestion-service` phase 1. `ProfileRegistry` (`src/services/ingestion-service/Services/ProfileRegistry.cs:15-57`) declares four MQTT profiles with destinations `raw-alarms`, `loop.samples.v1`, `live.metrics`, `prm.diagnostics.v1` and default topic filters `ot/alarms/#`, `ot/loops/#`, `ot/telemetry/#`, `prm/data/#`. **Nothing subscribes to any of them** — `grep data_source_configs` finds readers only inside `ingestion-service` itself. `prm.diagnostics.v1` is not even a declared Kafka topic (`scripts/kafka-reset-lab-topics.ps1:18-83`).

---

## 9. Hardcoded / mock / temporary logic in the ingestion path

| # | Item | Location | Impact |
|---|---|---|---|
| H-1 | LAN IP `192.168.1.51:8010` as a compiled-in `const` | `AlarmIngestionService.cs:20,21`; `OpcConnectionsController.cs:27`; `appsettings.Production.json:4,5`; `docker-compose.yml:705` | Site-specific address baked into the binary and into the prod settings file. Also flagged in `docs/plans/10-ams-api-cleanup-optimization.md:68` (D1). |
| H-2 | HTTP-feed server GUID `f0af9a6d-85f6-4c9f-a8ad-6de277d1d110` duplicated across 3 languages | `AlarmIngestionService.cs:18`; `OpcConnectionsController.cs:25`; `OpcEventStreamJob.java:26`; `PipelineOperators.java:45`; `docker-compose.yml:712` | Changing it requires edits in C#, Java and compose; a mismatch silently splits alarm identity. |
| H-3 | Lab OPC server GUID `7ce5ecbf-70c9-498d-b899-5c8bb7add383` as the non-http `serverId` default | `PipelineOperators.java:46`; `scripts/lib/AmsContractChecks.ps1:240`; `scripts/start-opc-gateway-lab.ps1:26` | A lab identity is the production fallback for any event without `serverId`. |
| H-4 | Topic name `"raw-alarms"` as a string literal in the producer | `AlarmIngestionService.cs:158` | `Kafka:RawAlarmsTopic` is honoured by the watchdog (`TelemetryDeadmanWatchdogService.cs:57`), health (`HealthPipelineController.cs:42`) and the admin DTO (`AlarmIngestionAdminController.cs:53`) but **ignored by the producer** — retopicking splits the pipeline. |
| H-5 | Poll interval clamped to `[1000, 5000]` ms | `AlarmIngestionService.cs:100` | Configured values outside the band are silently ignored; no log. |
| H-6 | `host.docker.internal:5050` default OPC gateway base URL | `OpcConnectionsController.cs:458,507` | Docker-Desktop-only hostname as a production default. |
| H-7 | Root-cause family hardcoded to `CRUSHER/CONVEYOR/FEEDER/MOTOR` | `PipelineOperators.java:298-303,320` | Mining-plant vocabulary hardcoded in a general alarm engine; substring matching on `sourceName`. |
| H-8 | Magic severity numbers `950` (flood), `900/700/400/100/300` (priority bands), `192` (quality) | `PipelineOperators.java:377,161-164,486-494,431` | No config surface; the flood band is unreachable for the live source (see §7). |
| H-9 | `mock-dcs` inline Python service in the default profile | `docker-compose.yml:413-445` | A mock is in the *default* compose profile with no profile gate; only `ACK_WRITEBACK_URL` steers away from it. |
| H-10 | Insecure built-in dev encryption key | `src/services/ingestion-service/Program.cs:22,31` | Fails closed outside Development (`:27-30`) — acceptable, but the literal ships in the binary. |
| H-11 | `AdminOpcServersController` returns `Status: "Connected"` unconditionally | `AdminOpcServersController.cs:35` | The legacy admin screen shows a green feed even when the feed is dead. |
| H-12 | `EventsPerSec` computed from *all* alarms in the last minute and attributed to *every* connection | `src/backend/AMS.Infrastructure/Repositories/OpcConnectionMetricsEnricher.cs:24-40` | Per-connection throughput on the OPC connections screen is fabricated. |
| H-13 | Stale-connection heuristic deletes rows by name/scheme | `OpcConnectionsController.cs:579-582` | Any connection whose name contains "Lab OPC", or any `OpcAe` row with an `opc.tcp://` endpoint, is **deleted** on every `GET /api/v1/opc/connections` (via `SyncGatewayOpcConnectionsAsync`, `:21`). Destructive side effect on a read. |

---

## 10. Bugs and risks

### Critical

**C-1 — Missing `priority`/`severity` in a feed record silently becomes `CRITICAL`.**
`HttpFeedAlarmRecord.Priority` is a non-nullable `int` (`AlarmIngestionService.cs:302-303`), so an absent `priority` deserialises to `0`. When `severity` is also absent, `MapNumericPriority(0)` hits the `<= 1` arm and returns `"CRITICAL"` (`:213-220`), which Flink then maps to severity 900 (`PipelineOperators.java:489`). A feed that omits priority floods the console with critical alarms. There is no unit-tested guard and no log.

**C-2 — `alarmKey` collision when the feed supplies `correlation_id` but no `tag_name`.**
`sourceName` degrades to `asset → area → site → "HTTP Feed"` (`AlarmIngestionService.cs:188`), while Flink keys **dedup and lifecycle state** on `alarmKey = serverId|source|condition|subCondition` (`PipelineOperators.java:56`, `OpcEventStreamJob.java:74,94`), **not** on `alarmId`. Two distinct alarms sharing a degraded `sourceName` and the same condition collapse onto one keyed state: `DedupFilter` drops one of them, and `LifecycleMap`'s ack-preservation state is shared. Silent alarm loss.

**C-3 — No dead-letter path at the ingest boundary.**
`ValidationMap` returns `null` for missing `sourceName`/`condition` and for any parse exception (`PipelineOperators.java:40,94-96`); the record vanishes with no DLQ and no per-reason metric. `AlarmIngestionService` likewise has no DLQ. For an ISA-18.2 / EEMUA-191 system this breaks alarm-loss accountability. `docs/architecture-review/05-streaming-review.md:52` records the same finding ("DLQ topics … are config-declared but never published").

### High

**H-1 — Restart amnesia produces permanently stale ACTIVE alarms.**
`_lastSnapshot` is in-memory (`AlarmIngestionService.cs:50`). After an `ams-api` restart the dictionary is empty, so alarms that cleared at the source while the service was down are **never** emitted as `CLEARED` (the synthetic-clear loop at `:128-137` only walks entries it already knows). Those alarms stay ACTIVE in `alarm_current` indefinitely.

**H-2 — Unbounded memory growth in `_lastSnapshot`.**
Entries are written at `:124` and `:135` but **never removed** — `CLEARED` entries are retained forever (`:131` only skips re-clearing). Long-running plants accumulate one entry per distinct `alarmId` ever seen.

**H-3 — A malformed or truncated feed response is read as "no alarms" and clears everything.**
`ParseResponse` swallows both parse attempts and returns an empty list (`:263,273,276`). `PublishDeltaAsync` then emits a synthetic `CLEARED` for every tracked alarm (`:128-137`). One bad HTTP body wipes the active alarm list.

**H-4 — `-InjectLabEvents` is dead.**
`run-all.ps1:13,17` → `scripts/start-ams-docker-full.ps1:180-190` → `Invoke-AmsLabEventInject` publishes to `raw-opc-events` (`scripts/lib/AmsContractChecks.ps1:275`), a topic that is deleted at stack reset (`scripts/kafka-reset-lab-topics.ps1:86,108-115`) and cannot auto-create (`docker-compose.yml:385`). The documented "inject sample alarms for E2E" flow injects nothing. Multiple acceptance scripts assert on this same topic (`scripts/e2e-full-system-test.ps1:75,163`; `scripts/production-acceptance-test.ps1:47-57`), so those gates are testing a topic no live component uses.

**H-5 — Timestamp fidelity is unguarded.**
`source_timestamp` is forwarded verbatim (`AlarmIngestionService.cs:194`) and parsed by `OffsetDateTime.parse` in Flink (`PipelineOperators.java:475`). A local-time string without an offset (very common from DCS gateways) throws and silently falls back to `System.currentTimeMillis()` (`:483`), destroying sequence-of-events ordering. No validation, no counter, no warning.

**H-6 — `GET /api/v1/opc/connections` performs deletes.**
`GetAll` calls `SyncGatewayOpcConnectionsAsync` (`OpcConnectionsController.cs:21`), which deletes rows matching a name/endpoint heuristic (`:511-515,579-582`). A read-scoped policy (`analytics.view`, `:22`) triggers destructive writes.

### Medium

**M-1 — Contract drift between producer and declared schema.** The live envelope omits `schemaVersion` and `eventType` (`AlarmIngestionService.cs:144-156`) that `StreamEventContracts.cs:9-10,20` declares for `raw-alarms`; the sims include them (`ams-sims/simlib.py:326-327`). Contract-validation scripts checking for `schemaVersion` therefore pass on simulator traffic and would fail on real traffic.

**M-2 — Topic name not config-driven in the producer** (H-4 in §9): `Kafka:RawAlarmsTopic` is half-honoured.

**M-3 — `state` defaults to ACTIVE.** Any value other than `"cleared"`, including `null`, yields `ACTIVE` (`AlarmIngestionService.cs:182-184`), so a feed using `"RTN"`/`"NORMAL"`/`"OK"` will never clear an alarm.

**M-4 — Throughput ceiling.** Serial awaited produces with `MaxInFlight=1` and `Acks.All` (`KafkaConsumerService.cs:512,534`) cap ingest at roughly one message per broker round-trip; an alarm flood stretches the poll cycle unboundedly with no metric for the lag.

**M-5 — Unbounded HTTP response buffering** (`GetStringAsync`, `:87`) with a 30 s timeout and no size cap.

**M-6 — Flood detection is a no-op on the live path.** See §7; only records that already carry an integer `severity >= 950` are dropped, and the live producer never emits an integer severity at all.

**M-7 — Ingest observability is coarse.** The only ingest metrics are a 30-second log line (`AlarmIngestionService.cs:231-243`) and Flink `records_in`/`records_out` counters. No Prometheus counter for feed failures, dropped records, or drop reasons.

### Low

**L-1 — `PollIntervalMs` clamp is silent** (`:100`).
**L-2 — Poll failures log at `Warning` with no escalation** (`:97`) — a permanently dead feed looks identical to a transient blip; only the `raw-alarms` deadman (`TelemetryDeadmanWatchdogService.cs:160`) surfaces it, and only after ≥60 s of *topic* silence.
**L-3 — `ingestion-service` self-heals its own schema at startup** (`Program.cs:238-335`), duplicating `database/scripts/46_ingestion_data_sources.sql`; the comment at `:240` acknowledges the two must be kept in sync manually.
**L-4 — Orphan `StreamPipes*Id` columns** persist in the domain model and EF configuration (`OpcConnection.cs:18-20`, `src/backend/AMS.Infrastructure/Persistence/OpcConnectionConfiguration.cs`).
**L-5 — `ProfileRegistry` advertises `prm.diagnostics.v1`**, which is not a declared topic (`ProfileRegistry.cs:55` vs `scripts/kafka-reset-lab-topics.ps1:18-83`).

---

## 11. Open questions for cross-check

Facts other agents should reconcile against their own evidence:

1. **Kafka census:** confirm `raw-opc-events` has **zero** producers and consumers in `src/`, and that `raw-alarms` has exactly one non-simulator producer (`AlarmIngestionService.cs:158`). Confirm whether `raw-alarms-dlq`, `alarm.events.raw`, `loop-raw-data`, `active-alarms`, `historical-alarms`, `soe-events`, `dead-letter-events` (declared in `KafkaOptions:31-43`) have any producer at all.
2. **Flink jobs:** verify that `OpcEventStreamJob` (`flink-ams-raw-alarms`) and `IoTDBPersistenceJob` are the only two consumers of `raw-alarms`, that both are actually submitted at startup (`infra/docker/flink-submit-raw-alarms.sh`, `flink-submit-iotdb-persistence.sh`), and whether `IoTDBPersistenceJob` re-parses the same envelope with a *different* field mapping than `ValidationMap` (`IoTDBPersistenceJob.java:107`).
3. **Alarm identity:** the report claims dedup/lifecycle keying is on `alarmKey`, not `alarmId` (`OpcEventStreamJob.java:74,94`). The backend/DB agent should confirm how `alarms.alarm_current` identity columns (`database/scripts/35_alarm_current_identity.sql`) relate, and whether an `alarmId` collision or an `alarmKey` collision is the one that corrupts a row.
4. **Priority/severity round-trip:** the live producer emits a *string* priority; Flink converts it to a coarse integer severity (900/700/400/100/300); the API then re-derives a priority band. Someone should confirm end-to-end whether the original DCS severity is recoverable anywhere, or is permanently lost at `PipelineOperators.java:63`.
5. **`ACK_WRITEBACK_URL` vs `FeedUrl` split:** compose points the writeback at `mock-dcs` but the feed at the unreachable `192.168.1.51` (`docker-compose.yml:705,710`). Confirm whether any environment sets both consistently, and whether `ResolveAckWritebackUrl()` (`AlarmIngestionService.cs:30-41`) derivation is ever exercised.
6. **Telemetry watchdog semantics:** `TelemetryIngestState.TotalEventsObserved` is surfaced by the admin API as feed health (`AlarmIngestionAdminController.cs:57-58`), but it counts messages on `raw-alarms` from *any* producer, including simulators. Confirm whether any dashboard treats that number as "the DCS feed is alive".
7. **Auth on the ingest admin surface:** `OpcConnectionsController` has class-level `[Authorize(Policy = "analytics.view")]` (`:22`) but `TestDraft` (`:268-269`) and `Browse` (`:283-284`) and `SyncFromGateway` (`:494-495`) inherit only that read policy while performing outbound network calls / DB deletes. Security review should confirm the intended policy.
8. **Documentation drift:** `architecture_document.md:16,47,49,60,66,73` and `CLAUDE.md:12` describe `OPC-UA / StreamPipes → raw-opc-events` as the data path. This is not what the code does. The doc-drift agent should decide whether the docs or the code is the intended target state; `docs/architecture-review/PHASE0-INVENTORY.md:106` already logged this as defect **D-6**.

---

## 12. Things that could not be verified from code

- Whether `http://192.168.1.51:8010/api/current-alarms` exists in any real deployment, what it actually returns, and which fields it populates. **Unknown / Requires Verification** — the endpoint is not implemented anywhere in this repository and no captured sample response is checked in.
- The out-of-repo `AMS.OpcGateway` (`scripts/start-opc-gateway-lab.ps1:10` → `e:\AMS - HMI GRID\src\opc-gateway\`) — whether it uses a real OPC A&E stack, and whether it ever publishes to Kafka. `infra/docker/.env.example:75` states "QuickOPC removed from AMS.OpcGateway — gateway cannot publish raw-opc-events", which suggests it is ACK-only, but the source is not in this repository. **Unknown / Requires Verification.**
- Whether the ingestion-service phase-2 MQTT subscriber exists on another branch. On `main` it does not: `git log` for `src/services/ingestion-service` shows only `e811af5 backup untill ui configuration of mqtt` and `54896e1 first commit`.
