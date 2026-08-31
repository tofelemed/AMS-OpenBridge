# 09 — Dead Code, Unused Components, and Hardcoded / Mock / Temporary Logic

**Scope:** the alarm domain across `src/backend` (.NET 8), `src/flink` (Java), `src/services`,
`src/frontend-ob` (React/TS), `infra/docker`, `database/scripts`, `scripts/`, `ams-sims/`.
**Method:** ripgrep call-site census + read-through. Every "unused" claim below carries the
grep that produced it and states what class of reference (if any) survived.
**Read-only audit.** Nothing was changed; this file is the only artifact written.

**Excluded tree:** `src/xmlgraphics-batik-main ScreeN Import/` (retired Batik/Konva reference app).
Note: it **no longer exists on disk** (`ls` → *No such file or directory*; `git ls-files "src/xmlgraphics*"` → 0)
yet `CLAUDE.md:23` still instructs readers to ignore it — a stale instruction, not a live tree.

**Evidence classes used below**
- `referenced nowhere` — no hit outside the declaration itself.
- `referenced only by tests` — hits confined to `AMS.Tests.*` / `ams-sims/`.
- `referenced only by scripts/docs` — hits confined to `scripts/`, `docs/`, `*.md`.
- `live` — a real production call site exists.
- **Unknown / Requires Verification** — used wherever a runtime fact could not be settled statically.

---

## TOP 10 MOST MISLEADING

Ranked by "how strongly does this make someone believe a feature works when it does not".

| # | Item | Where | Why it misleads |
|---|---|---|---|
| 1 | **`mock-dcs` is the default ACK destination in the main compose** — a 20-line Python stub that answers **any** POST with HTTP 200 `{"status":"ok"}` | `infra/docker/docker-compose.yml:413-444`, default `ACK_WRITEBACK_URL` at `:718` | The whole ISA-18.2 ACK round trip (`operator-actions → ack-writeback → HTTP → ack-results → ACK_CONFIRMED`) goes green end-to-end while **no DCS is ever told**. E2E scripts assert on this and pass. No profile guards it — a plain `docker compose up` starts it. |
| 2 | **`NoOpOpcDcsGateway` is the only registered `IOpcDcsGateway`** — every DCS write-back logs and returns `Task.CompletedTask` | `src/backend/AMS.Api/Program.cs:108`; `src/backend/AMS.Infrastructure/Opc/NoOpOpcDcsGateway.cs:19-29` | `ShelveAlarmCommandHandler` "propagates shelve to OPC DCS" (`AlarmCommands.cs:230-239`) and returns *"Alarm shelved successfully"*. The DCS never learns the alarm is shelved. Its own doc comment blames a component (StreamPipes) that is not in the repo. |
| 3 | **`GET /api/v1/alarms/active/statistics` returns hardcoded `0` / `false` for shelved, suppressed, alarm rate and flood** | `src/backend/AMS.Api/Services/AlarmEnricher.cs:50-53` | EEMUA-191 flood state and alarm rate are the two headline safety KPIs. `floodActive` is *always* `false`; `alarmsPerTenMin` is *always* `0`. Every UI threshold that reads them (`Dashboard.tsx:66`, `AlarmConsole.tsx:964-965`, `Analytics.tsx:101`) is therefore permanently un-triggerable. |
| 4 | **`OnAnalyticsUpdate` — the only live push for flood/rate — has zero producers** | declared `src/backend/AMS.Api/Hubs/AlarmHub.cs:151,251`; subscribed `src/frontend-ob/src/store/alarmStore.ts:548-554` | Both ends of the wire exist and compile. Nothing ever calls it (`rg "OnAnalyticsUpdate\|PublishAnalytics"` → only the declaration, the payload record and the client `.on(...)`). Reinforces #3: there is **no** path by which flood ever becomes true. |
| 5 | **The documented ingest topic `raw-opc-events` does not exist and is actively deleted at startup** | claimed `CLAUDE.md:12`, `architecture_document.md:47,49,60,66,73`; deleted `scripts/kafka-reset-lab-topics.ps1:85` (`$legacyTopics`) | The two *authoritative* architecture documents name a topic that has zero producers, zero consumers, is not in the topic catalog, and is on the legacy-delete list run by every start script. Anyone tracing the pipeline from the docs starts at a topic that gets dropped. |
| 6 | **Four components named in current docs do not exist in `src/` at all** — `AlarmStreamProcessorService`, `NotificationHub`, `OpcAeRawEventIngestService`, `AckFlinkBridge` | `CLAUDE.md:50`, `docs/ams-alarm-architecture.md:106,206,393`, `architecture_document.md` | `rg` over all of `src/` (excluding generated `*.xml`) returns **zero** for each. `CLAUDE.md` even states a behavioural rule about `AlarmStreamProcessorService` ("only a fallback when `Kafka:UseFlinkOrchestration` is false") for a class that isn't there — and `Program.cs:120-125` *throws* if that flag is false. |
| 7 | **`AdminOpcServersController` fabricates `Status = "Connected"`** with no probe of anything | `src/backend/AMS.Api/Controllers/V1/AdminOpcServersController.cs:27-39` | Returns a synthetic single-server DTO built from `AlarmIngestionOptions` with `Status:"Connected"`, `Enabled:true`, `EventsPerSec:0`. The OPC-server admin page shows a healthy connected server whether or not the feed host is reachable. (Contrast the honest `AlarmIngestionAdminController`, which really probes.) |
| 8 | **`purgeLabInjectedAlarms` runs against the live active-alarm table on every operator hub connect, and deletes any alarm whose `SourceName` contains `/`** | `src/frontend-ob/src/store/alarmStore.ts:593` (`purgeLab:true`) → `:357-364` → `src/backend/AMS.Infrastructure/Repositories/AlarmRepositories.cs:113-125` | `a.SourceName.Contains("/")` is a hierarchical-path wildcard. With the HDPE 4-level UNS hierarchy in play, real plant alarms carry `/` — an operator logging in silently `ExecuteDeleteAsync`-es them from `alarms.alarm_current`. Guarded only by `protocol === 'OPC-AE'`, which is exactly the lab/live protocol. |
| 9 | **`notification-service` alarm escalation is a hardcoded mock policy** | `src/services/notification-service/Orchestrator/NotificationOrchestrator.cs:163-178` (`// Mock DB fetch`), `:29` (`// We mock a policy evaluation here`), `:154` (`mock simple logic`) | Every root-cause notification is routed to one invented policy ("Critical Operations Team" → `ops-lead@plant.local`), and the method ignores its `areas` argument entirely. `IsActiveForCurrentShift` ignores time-of-day. The service is in the default compose (`docker-compose.yml:1184`) and looks operational. |
| 10 | **Two parallel alarm table families; the "EF" one is dead but scripts still assert on it** | `database/scripts/03_apply_ef_migrations.sql:54,112` creates `alarms.active_alarms` / `alarms.historical_alarms`; EF actually maps to `alarm_current` (`src/backend/AMS.Infrastructure/Persistence/AmsDbContext.cs:29`) and SQL reads `alarm_history` (`AlarmRepositories.cs:211,250,273`) | `scripts/autonomous-ams-validation.ps1:90,213-215` truncates and then asserts `COUNT(*) > 0` on `alarms.active_alarms` — a table nothing writes. A "validation passed" from that script proves nothing about the alarm path. |

Runners-up (only just missed the list): `AckSlaWatchdogService` implemented + `[Obsolete]` + never
registered (ACK SLA breach alerts never fire); the compiled-in customer LAN IP `192.168.1.51` as
both the default alarm feed **and** the default ack write-back target; `AlarmKpiStreamJob.java:168`
shipping `oldestStandingDurationMs = 0 // simplified for demo` as a real KPI.

---

# SECTION A — DEAD CODE & UNUSED COMPONENTS

## A.0 Prioritized summary

| Pri | Finding | Path | Evidence class | Removal risk |
|---|---|---|---|---|
| P0 | `StateDriftDetectionJob` never submitted; inputs have no producers | `src/flink/.../StateDriftDetectionJob.java` | referenced only by scripts/docs | safe (sign-off — A.1.1) |
| P0 | `AlarmReplayEngine` submittable only through a structurally broken path | `src/flink/.../AlarmReplayEngine.java` | live-but-unreachable | needs verification |
| P0 | `LoopKpiStreamJob` never submitted; input `loop-raw-data` has no producer | `src/flink/.../LoopKpiStreamJob.java` | referenced only by scripts/docs | safe (superseded by CPLM) |
| P0 | `AckSlaWatchdogService` implemented, `[Obsolete]`, never registered | `src/backend/AMS.Infrastructure/Kafka/AckSlaWatchdogService.cs` | referenced nowhere (1 doc comment) | safe |
| P0 | Domain-event mechanism has no dispatcher | `src/backend/AMS.Domain/Alarms/AlarmDomainEvents.cs` (95 ln) | referenced nowhere outside `ActiveAlarm` | safe |
| P0 | `OnAnalyticsUpdate` hub method — zero producers | `AlarmHub.cs:151,251` | referenced nowhere (server side) | needs verification (UI subscribes) |
| P1 | ~440 lines of commented-out duplicate command handlers | `src/backend/AMS.Application/Alarms/Commands/AlarmCommands.cs:505-943` | commented out | safe |
| P1 | Dead Kafka topics (`alarm.state.delta`, `raw.telemetry.site1`, `alarm.events.raw`, `alarm.state.active`, `loop-raw-data`) | `scripts/kafka-reset-lab-topics.ps1:28,34,36,37,57` | created, never used | safe |
| P1 | Producer-side-dead topics (`kpi-bad-actors`, `kpi-health-scores`) | `KpiConsumerService.cs:22-23` | consumer live, producer absent | needs verification |
| P1 | Dead tables `alarms.active_alarms`, `alarms.historical_alarms`, `configuration.opc_servers` | `database/scripts/02,03_*.sql` | referenced only by scripts/migrations / nowhere | needs verification |
| P1 | `SoeEventRepository` / `OpcServerRepository` are declared stubs | `src/backend/AMS.Infrastructure/Repositories/StubRepositories.cs` | live registration, empty behaviour | **actually still live** (load-bearing) |
| P1 | Orphaned config keys: `Kafka:StreamProcessorGroupId`, `Kafka:AckWritebackDlqTopic`, `Kafka:SoeEventsTopic`, `Kafka:SchemaRegistryUrl` | `KafkaConsumerService.cs:23,32,35,41`, `appsettings.json:9,16` | referenced nowhere | safe |
| P1 | `Confluent.SchemaRegistry` + `.Serdes.Avro` packages with no Schema Registry in the stack | `AMS.Infrastructure.csproj:21-22` | referenced nowhere | safe |
| P2 | 6 orphaned frontend files (~937 ln), incl. 2 duplicate/stale alarm CSS | see A.7 | referenced nowhere | safe |
| P2 | Dead route alias `/admin/opc-servers` | `src/frontend-ob/src/components/Administration/Administration.tsx:137` | referenced nowhere (no nav, no deep link) | safe |
| P2 | `infra/helm` (7 files) referenced only by `CLAUDE.md:20` | `infra/helm/**` | referenced only by docs | needs verification |
| P2 | `App_Data/opc-servers.json` | `src/backend/AMS.Api/App_Data/opc-servers.json` | referenced nowhere | safe |
| P2 | Non-existent overlay in a `ValidateSet`; non-existent compose profile in startup output | `run-all.ps1:27`, `scripts/start-ams-docker-full.ps1:226` | broken reference | safe |
| P3 | MIGRATION_LOG Phase 5 deliverables point at a deleted directory | `MIGRATION_LOG.md:249` → `database/migrations/` | path does not exist | doc fix |

---

## A.1 Flink jobs defined but never started

The complete submission surface is three mechanisms: `infra/docker/flink-submit-*.sh` (4 files),
`infra/docker/flink-job-supervisor.sh` (the standing reconciler, `docker-compose.yml:1489`), and
`scripts/ensure_flink_jobs.py` (host-side, manual).

**Supervisor's complete list** (`flink-job-supervisor.sh:92-134`): `OpcEventStreamJob`,
`IoTDBPersistenceJob`, `LiveStateJob`, `CplmShortFeatureStreamJob`, `CplmLongDiagnosticsStreamJob`,
`CplmGateFusionStreamJob`, `LoopLiveRbeJob`, `AnalysisExecutionJob`, `AlarmKpiStreamJob`,
`AlarmStateExportJob` — **10 jobs**. Three alarm-domain job classes are not in it.

### A.1.1 `StateDriftDetectionJob` — DEAD
- **File:** `src/flink/src/main/java/com/ams/flink/StateDriftDetectionJob.java:22`
- **Evidence:** `rg "StateDriftDetectionJob" --glob '!**/node_modules/**'` → hits only in `docs/**`,
  `docs/plans/**`, and `scripts/lib/AmsFlinkJob.ps1:341` (a default parameter value in a helper).
  **Zero** hits in any submit script, the supervisor, `ensure_flink_jobs.py`, or compose.
- **Inputs are also dead:** `setTopics("alarm.events.raw")` (`:32`) and `setTopics("alarm.state.active")`
  (`:41`) — repo-wide grep finds **no producer** for either (A.3).
- **Downstream consumer is live and idle:** `DriftAlertConsumerService` is registered at
  `src/backend/AMS.Api/Program.cs:160` and subscribes to `system.state.drift.alerts`
  (`DriftAlertConsumerService.cs:38`) — a topic whose only producer is this unsubmitted job.
- **Also:** no `enableCheckpointing` call anywhere in the file.
- **Risk:** safe to delete, but it takes `DriftAlertConsumerService` + the `ObservabilityHub` drift
  surface with it. **Confusing the architecture: high** — "state drift detection" appears in the
  job list, the topic catalog, and the hub contract.

### A.1.2 `AlarmReplayEngine` — UNREACHABLE BY CONSTRUCTION
- **File:** `src/flink/src/main/java/com/ams/flink/AlarmReplayEngine.java:22`
- **Only submission path:** `ObservabilityController.StartReplay` (`ObservabilityController.cs:33`)
  → `FlinkRestClient.SubmitReplayJobAsync` (`src/backend/AMS.Api/Services/FlinkRestClient.cs:17-42`).
- **Why it cannot work:** `FlinkRestClient.cs:20-24` calls `GET /jars` and throws
  `"No uploaded JARs found on Flink JobManager."` when the list is empty. The AMS jar is
  **bind-mounted** into `/opt/flink/usrlib` by every submit container (`docker-compose.yml:672,1408,1443,1474`),
  never *uploaded* through the REST `/jars/upload` endpoint — so `/jars` is always empty.
- **Input topic dead:** `setTopics("alarm.events.raw")` (`:39`) — no producer.
- **No frontend caller:** `rg "observability/replay|Observability/replay"` → hits only in `docs/**`
  and the controller itself. `referenced only by docs`.
- **Consumer idles:** `ReplayResultConsumerService` (registered `Program.cs:133`) subscribes to
  `flink.state.alarm.replay` (`ReplayResultConsumerService.cs:38`).
- **Risk:** needs verification — confirm nobody drives replay via a manual `/jars/upload` first.

### A.1.3 `LoopKpiStreamJob` — DEAD
- **File:** `src/flink/src/main/java/com/ams/flink/LoopKpiStreamJob.java`
- **Evidence:** `rg "LoopKpiStreamJob" --glob '*.sh' --glob '*.py' --glob '*.ps1' --glob '*.yml'`
  → hits **only** under the untracked `CPA/` tree. Not in the supervisor, not in `ensure_flink_jobs.py`.
- **Input:** `setTopics("loop-raw-data")` (`:38`) — no producer anywhere (A.3).
- **Output `loop-kpis-5m`** is consumed live by `KpiConsumerService.cs:19,61`, which therefore idles.
- **Superseded by:** the CPLM three-stage pipeline on `loop.samples.v1`.
- **Risk:** safe. Its POJO `RawLoopData.java` is fed by nothing either.

### A.1.4 `AnalysisExecutionJob` — RECOVERED, note only
Was host-script-only; now in the supervisor at `flink-job-supervisor.sh:126`. **Live.** Listed here
only because `docs/architecture-review/09-gap-register.md:56` (STR-07) still reports it as dead —
a stale doc, not a stale job.

### A.1.5 Compose one-shot submitters cannot self-heal
`flink-job-submit`, `flink-job-submit-iotdb`, `flink-job-submit-live-state`, `flink-job-submit-cplm`
are all `restart: "no"` (`docker-compose.yml:678,1417,1454,1487`). Only `flink-job-supervisor`
(`:1489`, `<<: *default-restart`) reconciles. See A.10.2 for the duplicate-reconciler problem.

---

## A.2 Unused API endpoints

Route strings grepped across `src/frontend-ob/`, `src/services/`, `scripts/`, `ams-sims/`, `tests/`.

| Route | Callers found | Verdict |
|---|---|---|
| `POST /api/v1/Observability/replay` | `docs/**` only | **referenced only by docs** — dead (A.1.2) |
| `POST /api/v1/opc/connections/sync-from-gateway` | none outside `OpcConnectionsController.cs:494` | **referenced nowhere** |
| `GET /api/v1/admin/opc-servers` | `scripts/test-ui-production-readiness.ps1:75,147`; `Administration.tsx:137` (a route with **no nav entry**) | **referenced only by scripts** + a dead route alias |
| `POST /api/v1/alarms/active/purge-lab-data` | `src/frontend-ob/src/api/alarmApi.ts:154` — **live, and dangerous** (B.2.5) | live |
| `GET /api/v1/health/kafka` | `docs/**` only | **referenced only by docs** — Unknown / Requires Verification (may be an ops probe) |
| all others (`alarms/active`, `acknowledge`, `acknowledge/batch`, `shelve`, `unshelve`, `suppress`, `out-of-service`, `historical`, `historical/stream`, `transitions`, `transitions/stream`, `analytics/kpi`, `admin/alarm-feed`) | real frontend or script callers | live |

`sync-from-gateway` detail: `OpcConnectionsController.cs:494-…` posts to
`_config["OpcGateway:BaseUrl"] ?? "http://host.docker.internal:5050"` (`:507`) — an OPC Gateway
that is **not in this repository** (its build lives on another machine — B.2.6). So the endpoint is
both uncalled and pointed at an absent service.

---

## A.3 Dead Kafka topics

Topic catalog: `scripts/kafka-reset-lab-topics.ps1` (invoked by `start-ams-docker-full.ps1:162`,
`start-ams-lab.ps1:397`, `run-ams-docker-stack.ps1:65`, `stabilize-ams-e2e.ps1:21`).
Broker auto-create is **off** (`docker-compose.yml:385`), so an uncataloged topic is a hard failure.

### Fully dead (created, no producer, no consumer)
| Topic | Declared | Producers | Consumers |
|---|---|---|---|
| `alarm.state.delta` | `kafka-reset-lab-topics.ps1:34` | **none** | **none** |
| `raw.telemetry.site1` | `:57` (comment: *"StreamPipes path, future use"*) | **none** | **none** |

`rg -F "alarm.state.delta"` outside `.md`/`CPA/`/`pipeline-reports/` returns exactly one line: its
own declaration. Same for `raw.telemetry.site1`, whose rationale references StreamPipes — absent
from the repo (A.12.2). **Risk: safe.**

### Consumed but never produced (dead inputs)
| Topic | Consumer | Producer |
|---|---|---|
| `alarm.events.raw` | `StateDriftDetectionJob:32`, `AlarmReplayEngine:39` (both unsubmitted) | **none** |
| `alarm.state.active` | `StateDriftDetectionJob:41` | **none** |
| `loop-raw-data` | `LoopKpiStreamJob:38` (unsubmitted) | **none** |
| `kpi-bad-actors` | `KpiConsumerService.cs:22` (**live**) | **none** — `AlarmKpiStreamJob` writes only `kpi-alarm-rates` (`:86`) and `kpi-standing-snapshots` (`:104`) |
| `kpi-health-scores` | `KpiConsumerService.cs:23` (**live**) | **none** |

The last two are the sharp ones: a *live, registered* consumer subscribes to two topics no code
writes. `KpiConsumerService.cs:67-72` deserializes anything non-`loop-kpis-5m` as `AlarmKpiPayload`
and forwards it to SignalR — so if either topic were ever fed by hand, it would be mis-typed.

### Produced but never consumed / consumer idles
| Topic | Producer | Consumer | State |
|---|---|---|---|
| `flink.state.alarm.delta` | `AlarmStateExportJob:65` (**submitted**, `supervisor:133`) | `AlarmStateDeltaConsumerService` (`Program.cs:132`) | **live** |
| `flink.state.alarm.replay` | `AlarmReplayEngine:111` (unreachable) | `ReplayResultConsumerService` (`Program.cs:133`) | **consumer idles forever** |
| `system.state.drift.alerts` | `StateDriftDetectionJob:63` (unsubmitted) | `DriftAlertConsumerService` (`Program.cs:160`) | **consumer idles forever** |
| `loop-kpis-5m` | `LoopKpiStreamJob:72` (unsubmitted) | `KpiConsumerService:19` | **consumer idles forever** |

### Phantom topics — named in config/docs, never created
| Name | Where | Note |
|---|---|---|
| `raw-opc-events` | `CLAUDE.md:12`, `architecture_document.md:47,49,60,66,73`, `docs/ams-alarm-architecture.md:42,50,106,…` | **Zero code hits.** On the *legacy delete* list at `kafka-reset-lab-topics.ps1:85`. Top-10 #5. |
| `raw-opc-events-dlq` | `scripts/lib/AmsContractChecks.ps1:37` | Also on the delete list — a contract check asserting on a topic that gets deleted. **Unknown / Requires Verification.** |
| `ack-writeback-dlq` | `appsettings.json:16`, `KafkaConsumerService.cs:32`, `AmsContractChecks.ps1:37` | **Not in the topic catalog** and no producer. The ACK-writeback DLQ does not exist; a failed write-back has nowhere to go. |
| `soe-events` | `KafkaConsumerService.cs:41` (`SoeEventsTopic`), `docs/flink-only-orchestration.md:12`, `docs/INSTALL.md:49` | No producer, no consumer, not created. Pairs with the stubbed SOE repository (A.5.2). |
| `current-opc-state`, `opc-events`, `opc-ack`, `alarm-created`, `alarm-updated`, `alarm-cleared`, `alarm-acknowledged` | `kafka-reset-lab-topics.ps1:85-86` `$legacyTopics` | Correctly handled — actively deleted. Listed to close the sweep. |

---

## A.4 Unused consumers / producers / hosted services

### A.4.1 `AckSlaWatchdogService` — implemented, `[Obsolete]`, NEVER REGISTERED
- **File:** `src/backend/AMS.Infrastructure/Kafka/AckSlaWatchdogService.cs:13-14`
  `[Obsolete("Disabled in Flink-only mode. Flink lifecycle engine owns ACK SLA and timeouts.")]`
  on `public sealed class AckSlaWatchdogService : BackgroundService`.
- **Evidence:** `rg "AckSlaWatchdogService"` → the file itself, plus one doc comment in
  `src/services/notification-service/Models/LifecycleAlert.cs:10`. **No `AddHostedService`** in
  `Program.cs` (the complete hosted-service list is `Program.cs:130-163`).
- **Consequence:** it is the documented producer of `ACK_SLA_BREACH` on `lifecycle-alerts`
  (`AckSlaWatchdogService.cs:161`). `src/services/notification-service/Program.cs:36` still says the
  topic "had two producers (telemetry deadman, ACK-SLA watchdog)" — it has one.
  `Kafka:AckConfirmationTimeoutSeconds` (`appsettings.json:18`) is read **only** here (`:169`),
  making that key orphaned too.
- **Risk:** safe to delete the class — but first confirm Flink genuinely emits an ACK-SLA breach.
  **Unknown / Requires Verification**: I found no `ACK_SLA` emit in `OpcEventStreamJob.java`.
- **Confusing the architecture: yes** — an ISA-18.2 ACK-timeout alerting capability appears to exist.

### A.4.2 Consumers registered but structurally starved
Three hosted services in `Program.cs` consume topics whose producers never run:
`ReplayResultConsumerService` (`:133`), `DriftAlertConsumerService` (`:160`), and
`KpiConsumerService` (`:148`) — of whose 5 topics two have no producer at all and one
(`loop-kpis-5m`) has an unsubmitted producer; only `kpi-alarm-rates` and `kpi-standing-snapshots`
actually flow. All three are `live` code with dead inputs. Removal risk: **needs verification** —
deleting them also removes the `ObservabilityHub` surface.

### A.4.3 Domain events raised and dropped
- `src/backend/AMS.Domain/Alarms/AlarmDomainEvents.cs` (95 lines, 6 records: `AlarmActivatedEvent`,
  `AlarmAcknowledgedEvent`, `AlarmClearedEvent`, `AlarmShelvedEvent`, `AlarmSuppressedEvent`, …),
  all `: DomainEventBase : IDomainEvent : MediatR.INotification` (`BaseEntity.cs:28-41`).
- `ActiveAlarm` raises them via `AddDomainEvent` (`BaseEntity.cs:15-16`).
- **`AmsDbContext.cs:106` — `b.Ignore(a => a.DomainEvents);`** and:
  - `rg "INotificationHandler" src/backend` → **no output**
  - `rg "IPublisher|_mediator.Publish|Publish\(" src/backend/AMS.Infrastructure src/backend/AMS.Application` → **no output**
- **Verdict:** the entire domain-event layer accumulates records in a `List<IDomainEvent>` that is
  never read. `referenced nowhere`. **Risk: safe.**
- **Confusing: yes** — the code reads as an event-driven domain when it is not.

### A.4.4 `OnAnalyticsUpdate` — hub contract with no server-side caller
Declared `src/backend/AMS.Api/Hubs/AlarmHub.cs:151` (`IAlarmHubClient`), payload record `:251`.
Client subscribes `src/frontend-ob/src/store/alarmStore.ts:548`, assigning `floodActive` (`:553`)
and `alarmsPerTenMin` (`:554`). `rg "OnAnalyticsUpdate|PublishAnalytics|AnalyticsUpdate" src/` →
the declaration, the payload record, the generated `AMS.Api.xml`, and the client `.on()`.
**No invocation.** **Risk: needs verification** (the UI depends on this contract). Top-10 #4.

---

## A.5 Unused models / interfaces / DTOs / enums

### A.5.1 Commented-out duplicate command handlers — ~440 lines
`src/backend/AMS.Application/Alarms/Commands/AlarmCommands.cs` is **943 lines**, of which
**406 begin with `//`** (`grep -c '^//'`). Lines **~505-943** are a wholesale commented-out second
copy of the file's own live contents: `AcknowledgeAlarmCommand` + validator + handler (`:525-565`),
the shelve/suppress handlers (`:613-…`), the `PurgeLabInjectedAlarms` handler (`:915-926`),
`IOperatorActionPublisher` (`:931-934`) and `IOpcDcsGateway` (`:939-943`) — all of which exist live
earlier in the same file (`:39, :106, :180, :193, :486, :494`).
**Risk: safe.** Also brings the file back under the `CLAUDE.md` 400-500-line rule (943 → ~505).
**Confusing: yes** — searching for `AcknowledgeAlarmCommandHandler` returns two definitions.

### A.5.2 Stub repositories on the live DI graph
`src/backend/AMS.Infrastructure/Repositories/StubRepositories.cs` (self-documented at `:1-15`):
- `SoeEventRepository` (`:21-38`) — `QueryAsync` returns an empty page unconditionally (`:27-28`);
  `StreamReplayAsync` yields nothing. Registered `Program.cs:101`. The `soe` schema has **no tables**
  (`rg -w "soe_events" database/ src/` → nothing).
- `OpcServerRepository` (`:41-51`) — every method returns empty/null/`CompletedTask`. Registered
  `Program.cs:102`.
- **Verdict: `actually still live` (load-bearing stubs)** — do not delete; the file header explains
  that `GetAllEnabledAsync` returning empty is depended on by callers. Flagged because a "SOE query
  API" appears functional at the REST layer while returning nothing by construction.

### A.5.3 Dead frontend alarm symbols
From an export-usage pass over all 189 `.ts`/`.tsx` files (declaration is the only occurrence):

| Symbol | File:line |
|---|---|
| `AckLifecycleState` (type) | `src/frontend-ob/src/store/alarmStore.ts:56` |
| `TIME_AUTHORITY` | `src/frontend-ob/src/utils/alarmIdentity.ts:13` |
| `isLabStormAlarm` | `src/frontend-ob/src/utils/opcAlarmFilter.ts:11` — body is `return false;` |
| `isLiveSimulatorAlarm` | `src/frontend-ob/src/utils/opcAlarmFilter.ts:15` — alias returning `true` for every displayable alarm |
| `BadActorRow` (interface) | `src/frontend-ob/src/hooks/useAlarmAnalytics.ts:30` |
| `AlarmAnalytics` (type) | `src/frontend-ob/src/hooks/useAlarmAnalytics.ts:56` |

Repo-wide: 150 of 719 exports are never imported cross-file; 18 are fully dead. **Risk: safe.**

### A.5.4 Orphaned deprecation constant referencing an absent system
`src/backend/AMS.Domain/Connectivity/OpcConnection.cs:47-50`
`public const string OpcAeDeprecatedMessage = "OPC-AE (COM/DCOM) cannot be ingested by StreamPipes. …"`
`rg "OpcAeDeprecatedMessage"` → the declaration and the generated `AMS.Api.xml` only.
`referenced nowhere`. Its rationale ("StreamPipes") does not exist in the repo (A.12.2), while
`IntegrationObjects.OPCAEServer.Simulator.1` **is** the live lab source. The sibling
`IngestSupported` (`:41`, comment *"Protocols StreamPipes can provision"*) **is** used
(`OpcConnectionsController.cs:381,384`), so OPC-AE is rejected at connection-create time on a
rationale that no longer holds. **Risk: needs verification** — this actively blocks a protocol.

---

## A.6 Unused database tables

| Table | Created at | Referenced by code? |
|---|---|---|
| `alarms.active_alarms` | `database/scripts/03_apply_ef_migrations.sql:54` | **No.** EF maps `ActiveAlarm` → `alarm_current` (`AmsDbContext.cs:29`). Only `scripts/autonomous-ams-validation.ps1:90,213` touch it. `referenced only by scripts` |
| `alarms.historical_alarms` | `03_apply_ef_migrations.sql:112`; also `src/backend/AMS.Infrastructure/Migrations/20260528000000_AddTimescaleDbHypertables.cs:16,33` (hypertable) | **No.** `HistoricalAlarmRepository` reads/writes `alarms.alarm_history` (`AlarmRepositories.cs:211,216,237,250,273`); `:233` documents the DATA-06 fix that moved off it. `referenced only by migrations` |
| `configuration.opc_servers` | `database/scripts/02_alarm_schema.sql:11` | **No.** `rg -w "opc_servers" src/ scripts/ ams-sims/` → no output. EF uses `configuration.opc_connections` (`OpcConnectionConfiguration.cs:11`). `referenced nowhere` |
| `alarms.alarm_current` | `02_alarm_schema.sql:37` | **live** (`AmsDbContext.cs:29`, `AnalyticsController.cs:74,86`) |
| `alarms.alarm_history` | `02_alarm_schema.sql:57` | **live** (`AlarmRepositories.cs:211…`, `AnalyticsController.cs:29,42,49,55,61,70`) |
| `alarms.alarm_state_transitions` | `03_apply_ef_migrations.sql:161` | **live** (`AlarmTransitionRepository.cs:59,64,81`) |
| `alarms.shelving_actions` | `36_alarm_shelving.sql:34` | **live** (`ShelveExpiryService`; asserted `Plan01ProjectionIntegrityTests.cs:97,173`) |

The `03_apply_ef_migrations.sql` / `src/backend/AMS.Infrastructure/Migrations/` pair is the deeper
issue — A.10.3.

---

## A.7 Unused frontend components

Import graph built by resolving every relative specifier across 189 files and BFS from
`src/main.tsx` (the only entry; `index.html` loads it, `vite.config.ts` declares no extra inputs).
**184 reachable, 5 unreachable.**

| File | Lines | Evidence |
|---|---|---|
| `src/frontend-ob/src/components/Designer/MultiStateSymbol.tsx` | 289 | `rg "MultiStateSymbol" src` → **0 hits** (not even a self-match). Duplicates the live NAMUR path (`Designer/openBridgeTheme.ts`, `Designer/ruleEngine.ts`). `referenced nowhere` |
| `src/frontend-ob/src/components/Designer/TemplatePalette.tsx` | 192 | `rg "TemplatePalette" src` → 3 hits, all self. Targets `VITE_TEMPLATE_SERVICE_URL \|\| '/api/templates'` — 1 hit, itself. `referenced nowhere` |
| `src/frontend-ob/src/components/Designer/index.ts` | 34 | Barrel re-exporting 23 symbols; nothing imports it. Verified that no file's *only* importer is this barrel. `referenced nowhere` |
| **`src/frontend-ob/src/styles/alarm-console.css`** | 197 | `rg "styles/alarm-console" src` → 0. `AlarmConsole.tsx:21` resolves to `components/AlarmConsole/alarm-console.css`. `diff -q` → **byte-identical duplicate**. `referenced nowhere` (**alarm domain**) |
| **`src/frontend-ob/src/styles/ag-theme-openbridge.css`** | 219 | `rg "styles/ag-theme-openbridge" src` → 0. Live copy is `components/AlarmConsole/ag-theme-openbridge.css` (283 ln), imported by `AlarmConsole.tsx:20` + `HistoricalViewer.tsx:12`. `diff` → **differs**: a stale, 64-line-shorter fork of the alarm-grid theme. `referenced nowhere` (**alarm domain**) |
| `src/frontend-ob/Designer.css` | 6 | All 7 `import './Designer.css'` sites resolve to `components/Designer/Designer.css` (3337 ln). `referenced nowhere` |
| `src/frontend-ob/src/utils/timeExpression.test.ts` | 82 | `vitest` absent from `package.json`; no `test` script; `tsconfig.json` excludes `**/*.test.ts`. `referenced only by tests` — **and the test cannot execute** |

**Alarm-domain component files: none orphaned.** All 28 `*Alarm*`/`*Alert*`/`*Shelve*`/`*Ack*`/
`*Soe*`/`*Event*` modules are reachable.

**Dead route:** `src/frontend-ob/src/components/Administration/Administration.tsx:137`
`<Route path="opc-servers" element={<AlarmFeedConfig />} />` — `rg "opc-servers" src` → **1 hit,
that line**. The `TABS` array (`:33-46`) has no entry for it, nothing navigates to it, and it renders
the *same* component already served by `/admin/alarm-feed` (`:136`). `referenced nowhere`. **Risk: safe.**

The stale CSS fork is the highest-risk item here: an engineer restyling the alarm grid has a coin-flip
chance of editing the file that is never loaded.

---

## A.8 Commented-out implementations of alarm logic

- **`src/backend/AMS.Application/Alarms/Commands/AlarmCommands.cs:505-943`** — ~440 lines. See A.5.1.
- **`src/services/notification-service/Orchestrator/NotificationOrchestrator.cs:173`** —
  `// new NotificationChannel { Type = "TEAMS", TargetEndpoint = "https://outlook.office.com/webhook/..." }`
  — the Teams escalation channel is commented out while `TeamsWebhookProvider.cs` (57 ln) is built
  and registered. The provider is therefore reachable by no policy.
- Beyond these two, the C#/Java/TS alarm tree is clean of large commented-out blocks.

---

## A.9 Deprecated code

| Marker | Location | State |
|---|---|---|
| `[Obsolete("Disabled in Flink-only mode…")]` | `src/backend/AMS.Infrastructure/Kafka/AckSlaWatchdogService.cs:13` | **dead + unregistered** (A.4.1) |
| `[Obsolete("LabDirectIngest is disabled…")]` | `src/backend/AMS.Infrastructure/Kafka/KafkaConsumerService.cs:54` | correctly enforced — `Program.cs:116-118` throws if the flag is set. **Good**; keep. |
| `"Legacy route — returns HTTP alarm feed only (OPC/gateway removed)."` | `src/backend/AMS.Api/Controllers/V1/AdminOpcServersController.cs:9` | live route, fabricated payload (top-10 #7) |
| `OpcAeDeprecatedMessage` | `src/backend/AMS.Domain/Connectivity/OpcConnection.cs:47` | unused constant, obsolete rationale (A.5.4) |
| `columnMenu="legacy"` | `src/frontend-ob/src/components/AlarmConsole/AlarmConsole.tsx:863` | deliberate AG Grid v32 pin; low risk, v33 upgrade blocker |
| `legacy` health fallback | `src/frontend-ob/src/api/historianHealth.ts:19-30` | synthesises `iotdb`/`redis` sub-statuses from one word |

`rg "\[Obsolete|@Deprecated|TODO: remove|DEPRECATED|LEGACY" src/` returns exactly the two
`[Obsolete]` attributes above — the *declared* deprecation surface is small and honest. The problem
is the **undeclared** dead code around it.

---

## A.10 Duplicate implementations

### A.10.1 Severity → priority band map — **8 copies, 2 disagree**
| # | Location | Cutoffs |
|---|---|---|
| 1 | `src/flink/.../PipelineOperators.java:161-164` (the authority) | 900 / 700 / 400 / 100 |
| 2 | `src/flink/.../IoTDBPersistenceJob.java:201-202` | 900 / 700 / … |
| 3 | `src/backend/AMS.Api/Services/AlarmEnricher.cs:62-68` | 900 / 700 / 400 / 100 |
| 4 | `src/backend/AMS.Api/Services/AlarmEnricher.cs:44-48` (stats counts) | 900 / 700 / 400 / 100 |
| 5 | `src/backend/AMS.Api/Controllers/V1/AnalyticsController.cs:79-84` (SQL `CASE`) | 900 / 700 / 400 |
| 6 | `src/frontend-ob/src/components/AlarmConsole/AlarmConsole.tsx:411-414` | 900 / 700 / 400 |
| 7 | `src/frontend-ob/src/components/LiveEvents/MqttAlarmListItem.tsx:39-41` | **800 / 600 / 400** |
| 8 | `src/frontend-ob/src/components/IoTDBTrend/IoTDBTrendViewer.tsx:35-37` | **800 / 600 / 400** |

Severity 850 renders **HIGH/amber** on the Alarm Console and **CRITICAL/red** on the Live Events
rail. Under ISA-18.2 / IEC 62682, colour is the operator's primary triage channel.
**Confusing the architecture: yes.** The backend already ships `priorityLabel`
(`src/frontend-ob/src/api/alarmMappers.ts:59`) — copies 6-8 should consume it.

### A.10.2 Two Flink job reconcilers with hand-synced lists
`infra/docker/flink-job-supervisor.sh:92-134` (10 jobs, in-cluster, 60 s loop) and
`scripts/ensure_flink_jobs.py:86-190` (host, manual). The Python file's own comment at `:177-180`
says *"STR-08 parity with flink-job-supervisor.sh (the two lists must not drift)"*. Two sources of
truth for which alarm jobs must be running, kept in sync by convention.

### A.10.3 Two schema systems — which is dead
`CLAUDE.md:19` declares `database/scripts/` "the sole live schema path", yet
`src/backend/AMS.Infrastructure/Migrations/` holds 6 EF migrations, `Program.cs:259` runs
`db.Database.MigrateAsync()` in non-Development, and `database/scripts/03_apply_ef_migrations.sql`
hand-replays those migrations in SQL — creating `active_alarms`/`historical_alarms`, the tables
nothing uses (A.6). Because compose pins `ASPNETCORE_ENVIRONMENT: Development`
(`docker-compose.yml:694`), `Program.cs:253-256` **skips migrations entirely** in the lab — so the
EF path is exercised in **no running configuration**.
**Dead:** `src/backend/AMS.Infrastructure/Migrations/` plus the `active_alarms`/`historical_alarms`
half of `03_apply_ef_migrations.sql`. **Risk: needs verification** — deleting the migrations changes
the non-Development startup path, which is the intended production shape.

### A.10.4 Duplicate alarm CSS
`src/frontend-ob/src/styles/alarm-console.css` (byte-identical duplicate) and
`src/frontend-ob/src/styles/ag-theme-openbridge.css` (stale 64-line-shorter fork). See A.7.

### A.10.5 Two OPC server surfaces
`AdminOpcServersController` (`api/v1/admin/opc-servers`, fabricated payload) and
`OpcConnectionsController` (`api/v1/opc/connections`, real, DB-backed) both present "OPC servers",
backed by `configuration.opc_servers` (dead) and `configuration.opc_connections` (live).

---

## A.11 Orphaned configuration

| Key | Declared | Read by |
|---|---|---|
| `Kafka:StreamProcessorGroupId` | `appsettings.json:9`, `KafkaConsumerService.cs:35` | **nothing** — the .NET stream processor was removed (`Program.cs:120-127`) |
| `Kafka:AckWritebackDlqTopic` | `appsettings.json:16`, `KafkaConsumerService.cs:32` | **nothing**; the topic is not created either |
| `Kafka:SoeEventsTopic` | `KafkaConsumerService.cs:41` | **nothing**; the topic does not exist |
| `Kafka:SchemaRegistryUrl` | `KafkaConsumerService.cs:23` | **nothing**. `AMS.Infrastructure.csproj:21-22` pulls `Confluent.SchemaRegistry` + `.Serdes.Avro`; `KafkaConsumerService.cs:3-4` imports them. **There is no Schema Registry service in `docker-compose.yml`.** `scripts/start-ams-lab.ps1:130` adds a `'schema-registry'` service name compose does not define. |
| `Kafka:AckConfirmationTimeoutSeconds` | `appsettings.json:18` | only `AckSlaWatchdogService.cs:169` — itself dead (A.4.1) |
| `VITE_DEMO_MODE` | `infra/docker/frontend/Dockerfile:11,16` | **nothing** in `src/frontend-ob/src/` |
| `VITE_TEMPLATE_SERVICE_URL` | `TemplatePalette.tsx:5` | only that orphaned file |
| `VITE_API_BASE_URL`, `VITE_SIGNALR_HUB_URL` as **runtime** env | `docker-compose.yml:751-752` | nothing — Vite bakes these at build time; the container serves static nginx. And `http://ams-api:8000` is a compose-internal name no browser can resolve. |
| `VITE_ALARM_ROOT_PREFIX`, some `VITE_SPARKPLUG_*` | read at `src/frontend-ob/src/utils/iotdbPaths.ts:10`, `loopSeries.ts:19` | **no `ARG`/`ENV` in `infra/docker/frontend/Dockerfile`, no compose build arg** → the hardcoded fallback always wins (B.2.9) |
| `run-all.ps1:27` `-ApplyOverlay "docker-compose.lab.yml"` | `ValidateSet` | **file does not exist** (`ls infra/docker/*.yml` → only `.yml`, `.ha.yml`, `.sims.yml`) — the option is accepted, then fails at compose |
| `scripts/start-ams-docker-full.ps1:226` "Grafana … (profile: observability)" | startup output | **no such profile** — `rg "profiles:" docker-compose.yml` → one match, `:933` `["mqtt-test"]` |
| `MIGRATION_LOG.md:249` "Legacy data migration scripts → `database/migrations/`" | Phase 5 deliverable | **directory does not exist** |
| `OpcGateway:EnableRawEventIngest` | `docs/ams-alarm-architecture.md:513` | no such key in any `appsettings*.json` or compose env |

---

## A.12 Legacy alarm workflows not decommissioned (Traverse Phase 5)

`MIGRATION_LOG.md:235-274` — Phase 5 "Legacy Decommission + Hardening" is **IN PROGRESS** with
**every deliverable at ⏳** and **every acceptance criterion unchecked**. What survived:

### A.12.1 The lab OPC-AE workflow is still the live one
`docker-compose.yml:711-713` pins the alarm feed to a single hardcoded server identity
(`f0af9a6d-…`, "Current Alarms Feed"); the *frontend* hardcodes the same GUID as its visibility
fallback (`opcAlarmFilter.ts:22`); and `database/scripts/35_alarm_current_identity.sql:41,49` bakes
it into the **schema** as a column DEFAULT. Meanwhile `OpcConnection.cs:47` declares OPC-AE
deprecated. The deprecated protocol is the one everything is wired to.

### A.12.2 StreamPipes: named as the "sole telemetry authority", absent from the repo
- `architecture_document.md:47-49`: *"Sole telemetry authority: Apache StreamPipes (OPC UA) →
  `raw-opc-events` (schema v2)"*, citing `docker-compose.streampipes.yml` and
  `docs/streampipes-connectivity.md`.
- `find . -iname "*streampipes*"` → **nothing**. `ls infra/docker/docker-compose.streampipes.yml` →
  *No such file*. `ls docs/streampipes-connectivity.md` → *No such file*.
- `run-all.ps1:8` still advertises that it starts "…Flink, API, Frontend, **StreamPipes**".
- Residue in code: `NoOpOpcDcsGateway.cs:8`, `OpcConnection.cs:41,47`,
  `kafka-reset-lab-topics.ps1:56` (`raw.telemetry.site1` — "StreamPipes path, future use").

### A.12.3 Documented components that do not exist
`rg` over all of `src/` (excluding generated `*.xml`) → **zero hits** for each:

| Name | Claimed in |
|---|---|
| `AlarmStreamProcessorService` | `CLAUDE.md:50` — *and* the attached rule is wrong: `Program.cs:120-125` **throws** when `Kafka:UseFlinkOrchestration` is false rather than falling back |
| `OpcAeRawEventIngestService` | `docs/ams-alarm-architecture.md:106,206,393` |
| `NotificationHub` | `docs/ams-alarm-architecture.md` (the real hubs are `AlarmHub`, `ObservabilityHub` — `Program.cs:315,321`) |
| `AckFlinkBridge` | `architecture_document.md` |

**Treat this as a first-class dead-artifact category.** Documentation is the primary onboarding
surface, and four named components + one config switch (`OpcGateway:EnableRawEventIngest`) + one
topic (`raw-opc-events`) + one entire platform (StreamPipes) in it are fiction.

### A.12.4 Out-of-repo OPC Gateway
`OpcConnectionsController.cs:458,507` call `_config["OpcGateway:BaseUrl"] ?? "http://host.docker.internal:5050"`.
No `opc-gateway` service exists in `src/` or compose; `scripts/start-opc-gateway-lab.ps1:10` launches
it from `e:\AMS - HMI GRID\src\opc-gateway\…` — a path on another drive/machine. The component that
actually talks to the DCS is a hard dependency of the OPC admin surface and is not in this repository.

---

## A.13 Other dead / never-started assets

- **`infra/helm/`** — 7 files (`Chart.yaml`, an api `deployment.yaml`, a flink
  `jobmanager-deployment.yaml`, `hpa/networkpolicy/pdb`, `values.yaml`) for a ~35-service stack.
  `rg "infra/helm|helm upgrade|helm install"` outside `docs/` → **1 hit: `CLAUDE.md:20`**.
  `referenced only by docs`. **Risk: needs verification** (may be an intentional future target) —
  but as it stands it cannot deploy the alarm pipeline.
- **`src/backend/AMS.Api/App_Data/opc-servers.json`** (2081 bytes) — `rg "opc-servers.json|App_Data"
  src/ scripts/ infra/` → **no output**. `referenced nowhere`. **Risk: safe.**
- **`mosquitto-test`** (`docker-compose.yml:930-947`, `profiles: ["mqtt-test"]`) — correctly opt-in;
  started only by `scripts/test-ingestion-config-e2e.ps1:57`. **Not dead**; listed to close the
  profile sweep (it is the *only* profile in the entire compose file).
- **`alertmanager`** (`docker-compose.yml:1532`) — `infra/docker/alertmanager.yml` ships a receiver
  with **no notifier configs**: routing and grouping are configured, nobody is paged. Deliberate and
  documented (`alertmanager.yml:2-4`), but it means the Prometheus alarm-pipeline alerts
  (`prometheus-rules.yml`: `ConsumerGroupLagHigh`, `DlqReceivingMessages`, `FlinkNoRunningJobs`,
  `FlinkCheckpointFailures`) notify no one.
- **`CPA/`** — 6824 files, `git ls-files CPA` → **0** (untracked). A second full project tree
  (`CPAMAIN/{src,infra,database,scripts,docs}`) at the repo root with its own copies of
  `LoopKpiStreamJob` contracts. Not repo code, but it is on disk and it poisons every repo-wide grep.

---

# SECTION B — HARDCODED / MOCK / TEMPORARY LOGIC

## B.0 Prioritized summary

| Pri | What | Where | Impact |
|---|---|---|---|
| P0 | Mock DCS ACK endpoint is the compose default | `docker-compose.yml:413-444`, `:718` | ACK loop reports success; no DCS is told |
| P0 | `NoOpOpcDcsGateway` on the shelve/ack write-back path | `Program.cs:108`; `NoOpOpcDcsGateway.cs:19-29` | Shelve never reaches the DCS; handler still returns success |
| P0 | Flood/rate/shelved/suppressed KPIs hardcoded to 0/false | `AlarmEnricher.cs:50-53` | EEMUA-191 flood indicator can never fire |
| P0 | Customer LAN IP compiled in as the default alarm feed **and** ack write-back | `AlarmIngestionService.cs:20-21,39` | Unconfigured deploy silently polls `192.168.1.51` and sends acks there |
| P0 | DB password in source | `appsettings.json:3`, `appsettings.Development.json:3`, `PipelineConfig.java:84` | `supersecurepassword123` committed in 3 places |
| P0 | Lab server GUID baked into the **schema** as a column DEFAULT | `database/scripts/35_alarm_current_identity.sql:41,49` | Every un-attributed alarm row is stamped with the lab feed identity forever |
| P0 | `ASPNETCORE_ENVIRONMENT: Development` on `ams-api` in the main compose | `docker-compose.yml:694` | Skips migrations, enables Swagger+CORS, and **swallows background-service crashes** (`Program.cs:53-56`) |
| P0 | Frontend "History" tab fabricates timestamps and causal prose | `AlarmDetailPanel.tsx:331-383` | Fabricated audit trail shown to investigators |
| P0 | Access token written to `window` unguarded | `alarmStore.ts:479` | XSS/extension can ack/shelve as the operator |
| P0 | Hardcoded lab GUID as the alarm-visibility allowlist, behind a swallowed error | `opcAlarmFilter.ts:22,32` + `alarmApi.ts:147-149` | Console silently shows **zero** alarms on any admin-API hiccup |
| P1 | Notification escalation policy is a hardcoded mock | `NotificationOrchestrator.cs:163-178` | Alarm escalation goes to `ops-lead@plant.local` |
| P1 | Every alarm's category hardcoded to `"PROCESS"` | `PipelineOperators.java:165` | ISA-18.2 categorisation collapses to one value |
| P1 | `oldestStandingDurationMs = 0 // simplified for demo` | `AlarmKpiStreamJob.java:168` | A shipped KPI is a constant |
| P1 | Hardcoded operator station / station list in audit-bearing dialogs | `AlarmConsole.tsx:248`; `AcknowledgeDialog.tsx:24,158-162`; `ShelveDialog.tsx:45,245-249`; `SuppressDialog.tsx:120,219` | Wrong station in the immutable audit trail |
| P1 | Silent default ACK comment | `AcknowledgeDialog.tsx:42` | Empty acks stamped `"Acknowledged by operator via console"` |
| P1 | Absolute foreign-drive paths in scripts | `start-opc-gateway-lab.ps1:10,15`; `validation/ui-autonomous.mjs:131,138` | Scripts only run on one developer's machine |
| P1 | Hardcoded OPC identity (GUID + ProgId + `127.0.0.1:5050`/`:9093`) | `start-opc-gateway-lab.ps1:19-31`; `apply-all-stabilization.ps1:67-70` | Lab-only; breaks at any site |
| P2 | Three disagreeing severity band sets; ~8 ISA/EEMUA thresholds as literals | A.10.1 and B.4 | Same alarm coloured differently on two screens |
| P2 | Two admin screens are pure local `useState` with fake save latency | `AlarmRulesConfig.tsx:7-11`; `NotificationsConfig.tsx:49` | Engineer reads invented flood/chattering config as live |
| P2 | Invented engineering recommendation in the RCA Explorer | `Analytics.tsx:587,628` | "Apply 5s ON-delay" presented as analysis output |
| P2 | KPI tile pass/fail contradicts its own caption | `Analytics.tsx:100-101` | Compliance dashboard reports compliance it hasn't met |
| P2 | Hardcoded UNS/site prefixes with no plumbing to override | `iotdbPaths.ts:10`, `loopSeries.ts:19` | Second site gets empty trends with HTTP 200 |
| P2 | Hardcoded Sparkplug topic shown as an alarm's real "Data Path" | `LiveAlarmDetailDialog.tsx:190`; `MqttLiveStream.tsx:236`; `Dashboard.tsx:911` | Sends an engineer to the wrong topic while diagnosing |

---

## B.1 Mock / stub implementations on a production path

### B.1.1 `mock-dcs` — the ACK loop terminates in a Python stub
`infra/docker/docker-compose.yml:413-444`. Inline Python answering **every** POST with HTTP 200
`{"status":"ok"}` on `0.0.0.0:8010`. **No `profiles:` key** → it starts on a plain `docker compose up`.
`:718` — `AlarmIngestion__AckWritebackUrl: ${ACK_WRITEBACK_URL:-http://mock-dcs:8010/api/alarms/acknowledge}`.
The stub is the **default**; the real host is the override.
**Should come from:** a required (no-default) `ACK_WRITEBACK_URL`, with the stub behind a
`profiles: ["lab"]` gate.
**Impact:** `scripts/test-full-pipeline-e2e.ps1:104-108,192` lists `POST acknowledge/batch`,
`Flink sink ack-writeback` and `Lifecycle ACK_CONFIRMED` as *critical* pass criteria. All of them
pass against a stub. **The single most misleading artifact in the alarm system.**

### B.1.2 `NoOpOpcDcsGateway` — the only `IOpcDcsGateway`
`src/backend/AMS.Infrastructure/Opc/NoOpOpcDcsGateway.cs:19-29` — both methods log and return
`Task.CompletedTask`. Registered `Program.cs:108`. `rg "IOpcDcsGateway"` → the interface
(`AlarmCommands.cs:494`), this class, and `ShelveAlarmCommandHandler` (`AlarmCommands.cs:198,204,232`).
`ShelveAlarmCommandHandler.Handle` wraps the call in try/catch and logs a *warning* on failure
(`:235-238`) — but a no-op never fails, so even the warning never appears — then returns
`"Alarm shelved successfully"` (`:241`). `UnshelveAlarmCommandHandler` does not even try
(`:307`: *"OPC/DCS un-suppression writeback is a follow-up (IOpcDcsGateway has no Unshelve yet)"*).
**Should come from:** a real gateway client (`OpcGateway:BaseUrl`), or the `ack-writeback` Kafka
path already used for acknowledgements.
**Impact:** the DCS keeps annunciating an alarm the AMS console shows as shelved.

### B.1.3 `AdminOpcServersController` — fabricated `Connected` status
`src/backend/AMS.Api/Controllers/V1/AdminOpcServersController.cs:27-39` builds a DTO with
`Status: "Connected"`, `Enabled: true`, `EventsPerSec: 0`, `TotalEvents: null` from config alone.
**Should come from:** the same probe that `AlarmIngestionAdminController.ProbeFeedAsync` (`:76-92`)
already performs. **Impact:** the OPC-server admin view is green while the feed is down.

### B.1.4 `NotificationOrchestrator` — mock policy store
`src/services/notification-service/Orchestrator/NotificationOrchestrator.cs`
- `:29` — `// In a real implementation, policies are fetched from a PostgreSQL DB or Redis Cache. We mock a policy evaluation here.`
- `:163-178` — `GetActivePoliciesForArea` returns a literal list: one policy,
  `TargetAreas = { "Plant/Area1", "Plant/Area2" } // Assume it matches`, one EMAIL channel to
  `ops-lead@plant.local`. It **ignores its `areas` argument entirely** — every root cause matches.
- `:151-159` — `IsActiveForCurrentShift` checks only `DaysOfWeek`;
  `// Note: Real shift schedules must account for complex Timezone math.`
- `src/services/notification-service/Providers/EmailProvider.cs:26-28` — SMTP defaults
  `localhost:25`, from `ams-alerts@plant.local`; `:43`
  `// In a real environment, configure SSL/TLS and authentication here.`
**Impact:** alarm escalation is non-functional and cannot be configured; the service is in the
default compose (`docker-compose.yml:1184`) and reports healthy.

### B.1.5 Frontend stubs and fake saves
- `src/frontend-ob/src/utils/opcAlarmFilter.ts:11` — `isLabStormAlarm` returns `false`
  unconditionally; `:15` `isLiveSimulatorAlarm` is an alias returning `true` for **every**
  displayable alarm. Any future caller would classify all real plant alarms as simulator alarms.
- `src/frontend-ob/src/components/Administration/AlarmRulesConfig.tsx:7-11` — the alarm-rationalization
  page is local `useState`: `floodThreshold: 10, floodWindowMinutes: 10, maxShelveDurationHours: 24,
  chatteringThreshold: 3, chatteringWindowMinutes: 5, autoUnshelve: true, requireAckComment: true`.
  A banner at `:20-28` and a disabled Save at `:41-53` mitigate, but the numbers read as live
  ISA-18.2 config — and they **contradict** the server-side shelve cap of 480 min
  (`AlarmCommands.cs:186`, `ShelveDialog.tsx:74,204`) and the server-side chattering threshold of 5
  (`AnalyticsController.cs:45`).
- `src/frontend-ob/src/components/Administration/NotificationsConfig.tsx:49` —
  `await new Promise(r => setTimeout(r, 600));` then writes to `useState` (`:50-54`). An escalation
  policy for Critical Alarms can be "created", evaporates on refresh, and never pages anyone.
- `src/frontend-ob/src/components/Analytics/Analytics.tsx:587,628` —
  `action: count > 500 ? 'Apply 5s ON-delay' : 'Review setpoint'`, rendered in a column headed
  **"Suggested Action"**. A rationalization recommendation derived from nothing but an alarm count.

### B.1.6 Fabricated alarm history
`src/frontend-ob/src/components/AlarmConsole/AlarmDetailPanel.tsx:331-383` builds the "History" tab
from the *current* snapshot:
- `:355` — Shelved event stamped with `alarm.ackTimeEpochMs ?? alarm.eventTimeEpochMs` (the **ack** time)
- `:366` — Suppressed event stamped with `alarm.eventTimeEpochMs` (the **original event** time)
- `:367` — `Reason: ${alarm.suppressionReason ?? 'DCS Rule'}` — invented literal
- `:376` — `detail: 'Process variable recovered to acceptable range'` — a hardcoded physical-process
  claim the frontend has no evidence for
**Should come from:** `alarms.alarm_state_transitions` (`GET /api/v1/alarms/transitions`, already
built and live) or `audit-service`.
**Impact:** an incident investigator reads invented timestamps and invented causation as the audit trail.

### B.1.7 `Math.random()` audit — clean
Repo-wide, only `mqttStore.ts:289` (MQTT clientId suffix) and `DisplayDesigner.tsx:65` (canvas item id).
**No fabricated numeric values are rendered as process data.**

---

## B.2 Hardcoded identifiers, hosts, credentials

### B.2.1 A customer's LAN IP compiled into the binary
`src/backend/AMS.Api/BackgroundServices/AlarmIngestionService.cs`
- `:18` `public static readonly Guid DefaultHttpFeedServerId = Guid.Parse("f0af9a6d-85f6-4c9f-a8ad-6de277d1d110");`
- `:20` `public const string DefaultHttpFeedUrl = "http://192.168.1.51:8010/api/current-alarms";`
- `:21` `public const string DefaultHttpAckWritebackUrl = "http://192.168.1.51:8010/api/alarms/acknowledge";`
- `:22` `public bool Enabled { get; set; } = true;`
- `:39` `ResolveAckWritebackUrl()` final fallback → `DefaultHttpAckWritebackUrl`

Also `src/backend/AMS.Api/Controllers/V1/OpcConnectionsController.cs:27`
(`DefaultHttpFeedEndpoint = "http://192.168.1.51:8010/api/current-alarms"`) and
`AlarmIngestionAdminController.cs:38-40` (displays it as the feed URL when config is blank).
`appsettings.Development.json:8` carries a Plan-10-D1 comment stating these must **never** be a
hardcoded LAN IP in a checked-in file — while the C# constants remain.
**Should come from:** required deployment config with **no default** (fail fast if unset).
**Impact:** an unconfigured deployment polls a stranger's `192.168.1.51` every 2 s and — worse —
`ResolveAckWritebackUrl()` will POST **operator acknowledgements** there.

### B.2.2 Committed database and historian credentials
- `src/backend/AMS.Api/appsettings.json:3` — `Password=supersecurepassword123` (also `Host=postgres`
  with `Port=5433`, mixing the host-published port with the container hostname)
- `src/backend/AMS.Api/appsettings.Development.json:3` — same password
- `src/flink/src/main/java/com/ams/flink/PipelineConfig.java:84` —
  `System.getenv().getOrDefault("DB_PASS", "supersecurepassword123")`
- `PipelineConfig.java:101-102` — IoTDB `root` / `root`
**Impact:** credentials in source control; a Flink job launched with no env still authenticates to
a same-named production database.

### B.2.3 Lab OPC identity baked into the database schema
`database/scripts/35_alarm_current_identity.sql`
- `:41` `SET server_id = 'f0af9a6d-85f6-4c9f-a8ad-6de277d1d110'::uuid`
- `:49` `ALTER COLUMN server_id SET DEFAULT 'f0af9a6d-85f6-4c9f-a8ad-6de277d1d110'::uuid;`

The same GUID appears in `docker-compose.yml:712`, `AlarmIngestionService.cs:18`,
`src/frontend-ob/src/utils/opcAlarmFilter.ts:22`, `ams-sims/simlib.py:58`,
`scripts/e2e-edge/config.py:50`, `scripts/e2e-edge/live_alarm_generator.py:61`.
**Impact:** the "Current Alarms Feed" lab identity is a permanent schema-level default. At a real
site, every alarm inserted without an explicit `server_id` is attributed to a feed that isn't there.

### B.2.4 Frontend: hardcoded GUID as the alarm-visibility allowlist
`src/frontend-ob/src/utils/opcAlarmFilter.ts:22` — `const HTTP_FEED_SERVER_ID = 'f0af9a6d-…';`,
used at `:32` when `connectedServerIds` is empty — which happens on **any** failure, because
`src/frontend-ob/src/api/alarmApi.ts:147-149` is `} catch { return []; }`.
**Impact:** a 500 from `/api/v1/admin/alarm-feed` is indistinguishable from "no servers configured",
and the console **silently renders zero alarms** while looking healthy. The worst possible failure
mode for an alarm system.

### B.2.5 `purge-lab-data` on the live path with a `/` wildcard
`src/backend/AMS.Infrastructure/Repositories/AlarmRepositories.cs:113-125`
```
|| a.SourceName.Contains("/")
|| EF.Functions.ILike(a.SourceName, "Kiln/%") …
var removed = await q.ExecuteDeleteAsync(ct);
```
Called from `src/frontend-ob/src/store/alarmStore.ts:593` (`purgeLab: true`) on **every hub
connect**, gated only on `protocol === 'OPC-AE'` (`:357`).
**Impact:** any hierarchical alarm source name is deleted from `alarms.alarm_current` when an
operator logs in. With the HDPE 4-level UNS hierarchy landed, this is a live data-loss path.
**Should be:** an explicit admin-only action, never on a hydration path.

### B.2.6 Absolute foreign-drive paths in scripts
| File:line | Value |
|---|---|
| `scripts/start-opc-gateway-lab.ps1:10` | `$gwDir = 'e:\AMS - HMI GRID\src\opc-gateway\AMS.OpcGateway\bin\Release\net8.0'` |
| `scripts/start-opc-gateway-lab.ps1:15` | `Push-Location 'e:\AMS - HMI GRID\src\opc-gateway\AMS.OpcGateway'` |
| `scripts/validation/ui-autonomous.mjs:131,138` | `process.env.AMS_UI_RESULTS \|\| 'e:/AMS/scripts/validation/ui-results.json'` |

A sweep for `['"= ]([a-z]):[\\/](AMS|Users|HMI|Program Files|opt|temp)` across `scripts/`, `infra/`,
`src/backend`, `src/services` found **only these three** — the category is small but critical.
**Impact:** the OPC Gateway — the component that actually talks to the DCS — can only be started
from one machine, and the repository contains none of its source.

### B.2.7 Hardcoded OPC/DCS configuration
`scripts/start-opc-gateway-lab.ps1`
- `:20` `$env:Kafka__BootstrapServers = '127.0.0.1:9093'`
- `:21` `$env:ASPNETCORE_ENVIRONMENT = 'Development'`
- `:24` `ServerId = '7ce5ecbf-70c9-498d-b899-5c8bb7add383'`
- `:26` `Host = $env:COMPUTERNAME`
- `:27` `ProgId = 'IntegrationObjects.OPCAEServer.Simulator.1'`
- `:30` `Invoke-RestMethod -Uri 'http://127.0.0.1:5050/opc/servers/connect'`

The same GUID + ProgId also at `scripts/apply-all-stabilization.ps1:67-70`,
`scripts/verify-opc-ack-writeback.ps1:5`, `scripts/validate-ams-production-ack.ps1:5`,
`scripts/ensure-opc-ae-lab.ps1:51`, `docs/startup-orchestration.md:207-210`,
`docs/ams-alarm-architecture.md:134`, `docs/server-build-kafka-flink-complete-guide.md:157`,
`docs/docker-run-commands.md:99`.
**Should come from:** parameters/env. **Impact:** the "connect to DCS" step is pinned to one
simulator on one machine, and `ASPNETCORE_ENVIRONMENT = 'Development'` is forced on the gateway.

### B.2.8 Four different defaults for one Flink URL
| File:line | Fallback |
|---|---|
| `src/backend/AMS.Api/Program.cs:144` | `"http://ams-flink-jobmanager:8081"` |
| `src/backend/AMS.Infrastructure/Health/PipelineHealthService.cs:113,204` | `"http://localhost:8082"` |
| `src/backend/AMS.Api/appsettings.json:33`, `appsettings.Development.json:27` | `"http://localhost:8082"` |
| `docker-compose.yml:716` | `Flink__JobManagerUrl: http://flink-jobmanager:8081` |

Three host names, two ports, one setting. The comment at `Program.cs:140-142` documents that this
exact class of disagreement was a past bug ("two components could disagree about which cluster they
were talking to") — and it is **still present** between `Program.cs:144` and `PipelineHealthService.cs:113`.

Other `localhost` fallbacks on the alarm path: `AlarmStateDeltaConsumerService.cs:28`,
`DriftAlertConsumerService.cs:28`, `ReplayResultConsumerService.cs:28`,
`KafkaMetadataHealthCheck.cs:29`, `PipelineHealthService.cs:186,222,237` (all `Kafka:BootstrapServers`
→ `"localhost:9092"`); `Program.cs:41` Seq → `http://localhost:5341`;
`ServiceCollectionExtensions.cs:109` CORS → `http://localhost:3000`;
`IotDbWriteClient.cs:27` → `http://iotdb:8181`; `OpcConnectionsController.cs:458,507` →
`http://host.docker.internal:5050`; `src/services/notification-service/Consumers/RootCauseConsumer.cs:25`
and `LifecycleAlertConsumer.cs:43`, `src/services/audit-service/Consumers/AuditEventConsumer.cs:20`
→ `"localhost:9092"`.
**Impact:** in a real deployment a missing key silently produces a connection to nothing rather than
a startup failure.

### B.2.9 Frontend hosts / topology
- `src/frontend-ob/src/store/mqttStore.ts:23,39` — `ws://localhost:8083/mqtt` default.
  `VITE_MQTT_WS_URL` is set in Docker but there is **no `.env` file** in `src/frontend-ob/`, so
  `npm run dev` connects straight to EMQX:8083, bypassing the `/mqtt-ws` Vite proxy
  (`vite.config.ts:26`) and therefore the gateway's WebSocket-upgrade auth.
- `src/frontend-ob/src/utils/iotdbPaths.ts:10` — `'root.ams.site1.alarms.'`;
  `src/frontend-ob/src/utils/loopSeries.ts:19` — `'root.site1.cpm'`. `VITE_ALARM_ROOT_PREFIX` has
  **no `ARG`/`ENV` in `infra/docker/frontend/Dockerfile` and no compose build arg** → the fallback
  always wins despite the "overridable" comment at `:6-8`. Every alarm trend / historian lookup is
  pinned to `site1`; a second site gets empty charts with HTTP 200 and no error.
- `src/frontend-ob/src/components/LiveEvents/LiveAlarmDetailDialog.tsx:190` —
  `` `spBv1.0/ams_site1/DDATA/ams_edge1/${alarm.alarmId}` `` shown under a **"Data Path"** heading.
  The store actually subscribes to the wildcard `spBv1.0/+/DDATA/+/#` (`mqttStore.ts:49`) and the
  real topic is available in `handleMessage` (`mqttStore.ts:658`). Same literal at
  `MqttLiveStream.tsx:236` and `Dashboard.tsx:911`.
- `src/frontend-ob/src/components/EdgeNodeMonitor/EdgeNodeMonitor.tsx:141` — `sub="localhost:8090"`
  under the Historian BFF health tile, while the call goes to `/api/hist/health`
  (`historianHealth.ts:11`). Misdirects an operator debugging a historian outage.
- `docker-compose.yml:751-752` — `VITE_*` as **runtime** env on an nginx static container (A.11).
- `src/frontend-ob/src/global.d.ts:3-10` — `ImportMetaEnv` declares only `VITE_OPC_SERVER_ID` and
  `VITE_SIGNALR_HUB_URL`, and *replaces* Vite's `ImportMeta` rather than augmenting it. That is why
  every other env read needs an `as string | undefined` cast — and why a misspelled or missing env
  var is **invisible to TypeScript**. This is the structural cause of the silent-fallback failures above.

### B.2.10 Token on `window`, unguarded
`src/frontend-ob/src/store/alarmStore.ts:479` —
`(window as unknown as { amsDevToken?: string }).amsDevToken = token;`
No `import.meta.env.DEV` guard — contrast `Designer/DisplayDesigner.tsx:642`, which guards its
equivalent. Ships in the production bundle.
**Impact:** any XSS or browser extension on a control-room console can read the bearer token and
acknowledge / shelve / suppress as the operator.

---

## B.3 Dev / test logic on a production path

### B.3.1 `ASPNETCORE_ENVIRONMENT: Development` for `ams-api` in the main compose
`infra/docker/docker-compose.yml:694`. Consequences in `Program.cs`:

| Line | Behaviour in Development |
|---|---|
| `:53-56` | `BackgroundServiceExceptionBehavior.Ignore` — **a crashed alarm consumer is swallowed**; the host keeps running with a dead consumer and no non-zero exit |
| `:253-256` | EF migrations **skipped** |
| `:181` | SignalR `EnableDetailedErrors = true` |
| `:187-189` | SignalR client timeout 120 s instead of 30 s |
| `:240-241`, `:280-281` | CORS policy registered and applied |
| `:284-295` | Swagger UI served |
| `:297` | HTTPS redirection off |
| `:40-41` | Serilog Seq sink skipped |

**Impact:** the "full stack" everyone runs and validates against runs the alarm API in its most
permissive configuration. The most dangerous line is `:53-56` — a Kafka consumer that throws
disappears silently, which is exactly how a starved alarm projection would present.
`docker-compose.sims.yml:16-22` reportedly forces `Development` on two more services —
**Unknown / Requires Verification** (I did not read that overlay line-by-line).

### B.3.2 Test-mode defaults
- `AlarmIngestionOptions.Enabled` defaults to **`true`** in C# (`AlarmIngestionService.cs:22`) while
  both `appsettings*.json` set it to `false` — a deployment that drops the section starts polling
  the hardcoded IP.
- `RAW_ALARMS_STARTING_OFFSETS: earliest` on the one-shot submitter (`docker-compose.yml:673`) vs
  `committed` on the supervisor (`:1521`) — the same job replays the whole topic or does not,
  depending on which path started it.
- `src/backend/AMS.Tests.Integration/TestBase.cs:63` — `// Mock Authentication to bypass Keycloak in tests`.
  Correctly test-scoped; noted only to close the `Mock` sweep. (Keycloak is also gone — auth is
  edge-only via the gateway.)
- `import.meta.env.DEV` branches in the frontend: exactly one, correctly guarded
  (`Designer/DisplayDesigner.tsx:642`). The unguarded equivalent is B.2.10.

### B.3.3 `TODO` / `FIXME` / `HACK` / `XXX` sweep
`rg "TODO|FIXME|HACK\b|XXX|NotImplementedException"` over `src/backend`, `src/services`, `src/flink`,
`src/frontend-ob/src` (excluding `obj/`, `bin/`, `node_modules/`):
- **Zero** `FIXME`, `HACK`, `XXX`, or `NotImplementedException` in alarm code.
- The alarm-relevant residue is all honest-comment kind: `AlarmCommands.cs:307`
  (*"OPC/DCS un-suppression writeback is a follow-up"*), `AlarmKpiStreamJob.java:168`
  (*"simplified for demo"*), `NotificationOrchestrator.cs:29,154,164` (`mock`),
  `EmailProvider.cs:43` (*"In a real environment, configure SSL/TLS"*),
  `NoOpOpcDcsGateway.cs:21,27` (*"direct OPC writeback deferred/disabled"*).

**State this plainly: the gaps are not marked with TODOs.** They are marked with `NoOp…`, `Stub…`,
`mock-…`, `// simplified for demo`, and hardcoded return values — which is precisely why they read
as finished features rather than as known holes.

---

## B.4 Magic numbers without named constants

### Backend / Flink
| File:line | Value | Should be |
|---|---|---|
| `AnalyticsController.cs:45` | `HAVING COUNT(*) >= 5` — chattering threshold | config (`AlarmRulesConfig.tsx:10` advertises `chatteringThreshold: 3` — **disagrees**) |
| `AnalyticsController.cs:52` | `< INTERVAL '60 seconds'` — fleeting | config |
| `AnalyticsController.cs:76` | `> INTERVAL '15 minutes'` — stale-alarm cutoff | config |
| `AnalyticsController.cs:64` | `LIMIT 10` — bad-actor top-N | config |
| `AnalyticsController.cs:79-84` | 900 / 700 / 400 severity bands | shared constant (A.10.1) |
| `PipelineOperators.java:73` | `asInt(300)` default severity | named constant |
| `PipelineOperators.java:161-164` | 900/700/400/100 bands | shared constant |
| **`PipelineOperators.java:165`** | **`evt.category = "PROCESS";`** — for every alarm | the OPC-AE category field |
| `PipelineOperators.java:377` | `>= 950` flood band | config |
| `KafkaConsumerService.cs:124` | `MaxFlushAttempts = 4` | named/config |
| `KafkaConsumerService.cs:163-168` | `MaxPollIntervalMs 300_000`, `SessionTimeoutMs 45_000`, `FetchMaxBytes 52428800` | config |
| `KafkaConsumerService.cs:203,211` | `batchSize = 100`, `Consume(100 ms)` | config |
| `KafkaConsumerService.cs:45,47` | `RetryDelayMs 1000`, `BatchSizeBytes 131072` | config |
| `AlarmEnricher.cs:44-48` | 900/700/400/100 | shared constant |
| `Program.cs:73-75` | retry 5 / 30 s max delay / 60 s command timeout | config |
| `Program.cs:182-189` | 100 KB msg, buffer 20, 15 s handshake, 10 s keepalive | config |
| `AlarmKpiStreamJob.java:35` (60 s) vs `AlarmStateExportJob:39` (30 s) vs `LoopKpiStreamJob:30` (180 s) | checkpoint intervals | one policy |
| `AlarmCommands.cs:186` | `InclusiveBetween(1, 480)` shelve duration | server-side policy config; **contradicts** `AlarmRulesConfig.tsx:9` (`maxShelveDurationHours: 24`) |

### Frontend (abridged)
- **ISA/EEMUA thresholds:** `Analytics.tsx:100-101` — caption says `Target ≤ 1.0 / 10 min (ISA-18.2)`
  while the pass test is `<= 2.0` (**the tile shows green at twice its stated target**);
  `:103` `peakAlarmRate > 10`; `:105` `timeInFlood < 1`; `:126` `mtta < 30`; `:129` `compliance >= 95`;
  `:148` `fleetingCount < 20`; `:151` `top10ContributionPercent < 5`; `:182-183` `staleAlarmCount < 5` /
  `totalActive < 10`; `:385-393` ECharts markLines at `yAxis: 6` ("ISA Target") and `yAxis: 12` ("Max");
  `Dashboard.tsx:363` `ISA_TARGET_PER_HOUR = 6`, `:66` `alarmsPerTenMin > 1.0`;
  `AlarmConsole.tsx:964-965` `> 10` / `> 5`; `:474` `ms > 3_600_000` (Time-in-Alarm amber at 1 h).
  → **three mutually inconsistent alarm-rate thresholds (1.0, 2.0, 10) across three screens** —
  and all of them read a field that is hardcoded to `0` (B.0 / `AlarmEnricher.cs:52`).
- `Analytics.tsx:36` — `alarmsPerShift = totalAlarms24h / 2` (hardcoded 2 shifts/day; wrong by 1.5×
  at any 8-hour-shift plant).
- **Page sizes / caps:** `alarmApi.ts:36` `pageSize = 500`; `AlarmConsole.tsx:59-60`
  `[25,50,100,200,500]` default `100`; `MqttLiveStream.tsx:16` `50`; `LiveEventsPage.tsx:24` /
  `SoePanel.tsx:26` `25`; `IoTDBTrendViewer.tsx:15` `50`; `HistoricalViewer.tsx:56` `500`;
  `alarmStore.ts:184` `MAX_SOE_EVENTS = 500`; `mqttStore.ts:198,205` `LIVE_SERIES_CAP 2000` /
  `LIVE_SERIES_KEY_CAP 4000`; **`shared/LiveEventStream.tsx:42` `.slice(0, 50)` with no
  "showing 50 of N" indicator** — silently truncates the side rail during a flood, exactly when
  the operator most needs to know there is more.
- **Timers:** `alarmStore.ts:265` `HUB_FLUSH_MS = 100`; `:490-495` SignalR reconnect ladder
  `1000/3000/10000/30000` with cutoffs at retry 5 and 10; `mqttStore.ts:245-246,253,291-293,611`;
  `App.tsx:141-142` (`retry: 2`, `staleTime: 30_000`), `:195` (60 s session watchdog),
  `:247` (30 s alarm poll fallback); `AlarmConsole.tsx:638,828`; `AlarmFeedConfig.tsx:46` (10 s poll);
  `useAlarmAnalytics.ts:59` (60 s refetch); `EdgeNodeMonitor.tsx:84` (15 s); `MqttLiveStream.tsx:71,87`.
- `alarmStore.ts:780-787` — annunciator tones `880 / 660 / 440 Hz`, gain `0.08`, 0.4 s decay.
  MEDIUM / LOW / DIAGNOSTIC are all 440 Hz — indistinguishable, and unmatched to any site's
  existing annunciator convention.
- `ShelveDialog.tsx:17-33,74,204` — `DURATION_PRESETS` 15/30/60/120/240/480 min, a client-side 480
  cap, and six canned reason presets, none server-enforced in the UI.
- `AcknowledgeDialog.tsx:42` — `comment.trim() || 'Acknowledged by operator via console'`, while the
  field hint at `:138` says "This is recorded in the audit trail" and `AlarmRulesConfig.tsx:10`
  advertises `requireAckComment: true`. An empty acknowledgement is silently stamped with
  boilerplate in the immutable audit trail instead of being rejected.
- `AlarmConsole.tsx:248` — `await unshelveAlarmApi(alarm.id, 'CCR-01')`. Every other alarm action
  takes `operatorStation` from the dialog; unshelve alone hardcodes it.
- `AcknowledgeDialog.tsx:24,158-162`, `ShelveDialog.tsx:45,245-249`, `SuppressDialog.tsx:120,219` —
  station list `CCR-01, CCR-02, FCR-01, ENG-01, REMOTE` hardcoded as `<option>`s.
- `Dashboard.tsx:135,151,172,942` — `totalActive > 100`, `unacknowledged > 20`, `totalHigh > 10`,
  `.slice(0, 10)` live-alarm cap.
- `Dashboard.tsx:50-62,211-215` — `avgMtta` / `totalHandled` computed over the whole hydrated alarm
  map but labelled "Acknowledged in session" / "Avg. operator response time" — neither
  session-scoped nor plant-wide, shown on an operator-performance tile.

---

## Appendix — how to reproduce

Plain `grep -r` from the repo root **times out** (2 min) because of the untracked `CPA/` tree
(6824 files) and any residual `node_modules`. Use ripgrep:

```
rg -n --glob '!**/node_modules/**' --glob '!CPA/**' --glob '!**/obj/**' --glob '!**/bin/**' <pattern> .
```

Key one-liners used above:

```
rg -n "StateDriftDetectionJob|AlarmReplayEngine|LoopKpiStreamJob" --glob '*.sh' --glob '*.py' --glob '*.ps1' --glob '*.yml'
rg -n "AckSlaWatchdogService|OnAnalyticsUpdate|AlarmStreamProcessorService|NotificationHub|OpcAeRawEventIngestService|AckFlinkBridge" src/
rg -n "INotificationHandler|_mediator.Publish" src/backend               # -> empty
rg -n -F "alarm.state.delta" --glob '!*.md' --glob '!CPA/**' .           # -> 1 hit, its own declaration
rg -n "\[Obsolete|@Deprecated|TODO: remove|DEPRECATED|LEGACY" src/       # -> exactly 2 hits
rg -n -w "opc_servers|soe_events" src/ scripts/ ams-sims/                # -> empty
find . -iname "*streampipes*"                                            # -> nothing
git ls-files CPA | wc -l                                                 # -> 0 (untracked)
grep -c '^//' src/backend/AMS.Application/Alarms/Commands/AlarmCommands.cs   # -> 406 of 943
```

### Open items — Unknown / Requires Verification
1. Does Flink actually emit an `ACK_SLA_BREACH` lifecycle alert, or did that capability leave with
   `AckSlaWatchdogService`? (No `ACK_SLA` emit found in `OpcEventStreamJob.java`.)
2. Is `GET /api/v1/health/kafka` used by an external ops probe (Prometheus, load balancer)?
3. Is `infra/helm` an intentional future target, or abandoned?
4. Does `docker-compose.sims.yml:16-22` force `Development` on additional services?
5. Is anyone driving `AlarmReplayEngine` via a manual `/jars/upload`?
6. Is `scripts/lib/AmsContractChecks.ps1` still asserting on `raw-opc-events-dlq` at runtime, and
   does that assertion currently pass?
