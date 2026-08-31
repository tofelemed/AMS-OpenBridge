# 02 — Flink Stream-Processing Jobs (Alarm Path)

**Scope:** every Flink job in `src/flink/src/main/java/com/ams/flink/` that touches the alarm
data path. CPLM/loop-performance jobs (`com.ams.flink.cplm.*`, `LoopKpiStreamJob`) are excluded
except where they share a submission mechanism or a topic.

**Method:** every statement below was read out of source. File:line citations are given for each
claim. Anything not verifiable from code is marked **Unknown / Requires Verification**.

**Repo state at analysis:** branch `main`, commit `2886ccb`, working tree clean.
Flink 1.18.1 (`src/flink/pom.xml:15`, `infra/docker/flink/Dockerfile:12`),
`flink-connector-kafka` 3.2.0-1.18 (`src/flink/pom.xml:34`).

---

## 1. Job inventory

### 1.1 Master table

| # | Job class | Display name (`env.execute`) | Source topic(s) | Sink(s) | Submitted in running stack? | Status |
|---|---|---|---|---|---|---|
| 1 | `OpcEventStreamJob` | `AMS - Alarm State Machine` | `raw-alarms`, `operator-actions`, `ack-results` | `current-alarm-state` (keyed), `lifecycle-events`, `root-cause-events`, `ack-writeback` | **YES** — `flink-submit-raw-alarms.sh:42` + supervisor `flink-job-supervisor.sh:92` | **Implemented** (with defects, §4) |
| 2 | `IoTDBPersistenceJob` | `AMS - IoTDB Alarm Persistence` | `raw-alarms` | IoTDB `root.ams.site1.alarms.*` via `FailLoudIoTDBSink` | **YES** — `flink-submit-iotdb-persistence.sh:43` + supervisor `:99` | **Implemented** |
| 3 | `LiveStateJob` | `AMS - Live State RBE` | `current-alarm-state` | `live.alarms` (keyed), `live.alarm.metrics` (keyed) | **YES** — `flink-submit-live-state.sh:34` + supervisor `:102` | **Implemented**; `live.alarm.metrics` has no consumer (§5.2) |
| 4 | `AlarmKpiStreamJob` | `AMS - Alarm KPI Engine` | `lifecycle-events` | `kpi-alarm-rates`, `kpi-standing-snapshots` (fixed key) | **YES** — supervisor `flink-job-supervisor.sh:131` only | **Partially implemented** — standing-count logic wrong (§4, F-05) |
| 5 | `AlarmStateExportJob` | `AMS Alarm State Export Engine` | `current-alarm-state` | `flink.state.alarm.delta` | **YES** — supervisor `flink-job-supervisor.sh:133` only | **Partially implemented** — DELETE routing wrong (§4, F-09) |
| 6 | `AnalysisExecutionJob` | `AMS - Analysis Execution Engine` | `analysis.executions` | `analysis.results` | **YES** — supervisor `flink-job-supervisor.sh:126` | **Implemented** (not an alarm job; listed for completeness) |
| 7 | `StateDriftDetectionJob` | `AMS State Drift Detection Engine` | `alarm.events.raw`, `alarm.state.active` | `system.state.drift.alerts` | **NO** — absent from `flink-job-supervisor.sh` and `scripts/ensure_flink_jobs.py` | **Dead code** — both inputs have no producer anywhere (§5.1) |
| 8 | `AlarmReplayEngine` | `AMS Alarm Replay Engine [<replayId>]` | `alarm.events.raw` (seek by ts) | `flink.state.alarm.replay` | **NO** — on-demand via `FlinkRestClient.SubmitReplayJobAsync`, which cannot work (§5.1) | **Dead code / broken by construction** |

### 1.2 Supporting classes (not jobs)

| File | Role | Status |
|---|---|---|
| `PipelineConfig.java` | arg/env parsing, per-operator parallelism | Implemented; `dbUrl`/`dbUser`/`dbPass` are dead fields (§4, F-16) |
| `PipelineOperators.java` | all `OpcEventStreamJob` operators + JSON builders | Implemented; `toAlarmTopicJson` dead (§5.3) |
| `KafkaSinks.java` | shared `KafkaSink` builders, key-on-JSON-field | Implemented |
| `AlarmJson.java` | PascalCase/camelCase-tolerant JSON reads | Implemented; `integer()`/`bool()` unused |
| `AlarmKeys.java` | `alarmKey` + `stableAlarmId` (MD5→UUID) | Implemented; **diverges from .NET** (§3.2) |
| `RawOpcAlarmEvent.java` | POJO carried through the pipeline | Implemented; `duplicate` field write-only |
| `AlarmKpiResult.java` | KPI DTO | Partially dead — `BAD_ACTOR`/`HEALTH_SCORE` branches have no producer (§5.3) |
| `IoTDBAlarmRow.java` | IoTDB row DTO | Implemented |
| `AlarmIoTSerializationSchema.java` | measurement/type constants **only** | `serialize()` is **dead** — nothing calls it (§5.3) |
| `FailLoudIoTDBSink.java` | checkpoint-integrated IoTDB sink | Implemented — genuinely fails loud (§2.2) |
| `ExpressionEvaluator.java` | shunting-yard arithmetic evaluator | Implemented (analysis path, not alarms) |

### 1.3 How jobs actually get submitted

Three mechanisms exist; only two run in the default stack.

1. **One-shot compose containers** (`restart: "no"`), started by plain `docker compose up`
   (no profiles gate them — the only `profiles:` key in the file is `mqtt-test` at
   `infra/docker/docker-compose.yml:933`):
   - `flink-job-submit` → `flink-submit-raw-alarms.sh` → `OpcEventStreamJob`
     (`docker-compose.yml:651-677`)
   - `flink-job-submit-iotdb` → `IoTDBPersistenceJob` (`docker-compose.yml:1391-1423`)
   - `flink-job-submit-live-state` → `LiveStateJob` (`docker-compose.yml:1425-1454`)
   - `flink-job-submit-cplm` → CPLM jobs (`docker-compose.yml:1456-1487`)
2. **Standing supervisor** — `flink-job-supervisor` (`docker-compose.yml:1489-1521`), default
   restart policy, loops every `SUPERVISOR_INTERVAL_SEC=60` and re-submits any of **ten** named
   jobs that is not present (`flink-job-supervisor.sh:90-135, 137-141`). This is the authoritative
   list of what runs.
3. **`scripts/ensure_flink_jobs.py`** — the same ten jobs (`ensure_flink_jobs.py:83-190`), but
   **manually invoked only**; nothing in stack startup calls it (`scripts/start-ams-docker-full.ps1`
   contains no reference). Its own header warns the two lists must not drift
   (`flink-job-supervisor.sh:9-11`).

The JAR is baked into the image (`infra/docker/flink/Dockerfile:17`,
`COPY target/ams-flink-1.0-SNAPSHOT.jar /opt/flink/usrlib/…`) and built by
`scripts/build-flink-jar.ps1` via a `maven:3.9-eclipse-temurin-11` container.

---

## 2. Cluster-level runtime configuration

### 2.1 Flink cluster (`infra/docker/docker-compose.yml:517-557`, TaskManager mirrors at `:599-631`)

| Setting | Value | Source line |
|---|---|---|
| `parallelism.default` | `1` | `:520` |
| `high-availability.type` | `zookeeper` (quorum `zookeeper:2181`, root `/flink-ams`, cluster-id `/ams-lab`) | `:528-531` |
| `high-availability.storageDir` | `s3://ams-flink/ha/` (MinIO) | `:532` |
| `state.backend` | `rocksdb`, incremental | `:534-535` |
| `state.checkpoints.dir` | `s3://ams-flink/checkpoints` | `:539` |
| `state.savepoints.dir` | `s3://ams-flink/savepoints` | `:540` |
| `state.checkpoints.num-retained` | `3` | `:547` |
| `execution.checkpointing.interval` | `60000` | `:549` |
| `execution.checkpointing.min-pause` | `30000` | `:550` |
| `execution.checkpointing.mode` | `EXACTLY_ONCE` | `:551` |
| `execution.checkpointing.timeout` | `120000` | `:552` |
| `execution.checkpointing.externalized-checkpoint-retention` | `RETAIN_ON_CANCELLATION` | `:554` |
| metrics reporter | Prometheus on `:9249` | `:556-557` |
| **`restart-strategy`** | **NOT SET ANYWHERE** — verified by grep over the compose file | — |

**Consequence of the missing restart strategy:** with checkpointing enabled and no strategy
configured, Flink 1.18 falls back to fixed-delay with `Integer.MAX_VALUE` attempts and a **1 s**
delay. A deterministic poison record (see F-06) therefore produces an unbounded 1-second restart
loop with no circuit breaker. See F-13.

**Note:** every job overrides the cluster checkpoint config programmatically (`env.enableCheckpointing(...)`),
so the `execution.checkpointing.*` block above is effectively inert for jobs 1–6. E.g.
`OpcEventStreamJob` sets 30 s / 10 s min-pause (`OpcEventStreamJob.java:32-33`), which is *shorter*
than the cluster's declared 60 s / 30 s.

### 2.2 Per-job checkpoint / delivery configuration

| Job | `enableCheckpointing` | Mode | Min pause | Timeout | Externalized | Sink delivery guarantee |
|---|---|---|---|---|---|---|
| `OpcEventStreamJob` | 30 000 ms (`:32`) | EXACTLY_ONCE | 10 000 (`:33`) | 120 000 (`:34`) | RETAIN_ON_CANCELLATION (`:35-36`) | **AT_LEAST_ONCE** (`KafkaSinks.java:55`) |
| `IoTDBPersistenceJob` | 60 000 ms (`:43`) | AT_LEAST_ONCE | 20 000 (`:44`) | 120 000 (`:45`) | not set | n/a (IoTDB sink, fails-loud) |
| `LiveStateJob` | 30 000 ms (`:49`) | AT_LEAST_ONCE | 10 000 (`:50`) | 60 000 (`:51`) | not set | AT_LEAST_ONCE |
| `AlarmKpiStreamJob` | 60 000 ms (`:35`) | EXACTLY_ONCE | 10 000 (`:36`) | 300 000 (`:37`) | RETAIN_ON_CANCELLATION (`:38-39`) | AT_LEAST_ONCE (`:84`, `KafkaSinks.fixedKey`) |
| `AlarmStateExportJob` | 30 000 ms (`:39`) | AT_LEAST_ONCE | 10 000 (`:40`) | 60 000 (`:41`) | not set | AT_LEAST_ONCE (`:63`) |
| `AnalysisExecutionJob` | 60 000 ms (`:39`) | AT_LEAST_ONCE | — | — | not set | AT_LEAST_ONCE (`:60`) |
| `StateDriftDetectionJob` | **NONE** — no `enableCheckpointing` call anywhere in the file | — | — | — | — | AT_LEAST_ONCE (`:61`) |
| `AlarmReplayEngine` | 30 000 ms (`:35`) | EXACTLY_ONCE | — | — | not set | AT_LEAST_ONCE (`:109`) |

**`KafkaSinks` never offers EXACTLY_ONCE.** `KafkaSinks.build` hardcodes
`DeliveryGuarantee.AT_LEAST_ONCE` (`KafkaSinks.java:55`) with `delivery.timeout.ms=120000`,
`request.timeout.ms=30000`, `max.block.ms=60000` (`:58-60`). No job configures a
`transactionalIdPrefix`. So despite `CheckpointingMode.EXACTLY_ONCE` on the state machine,
**end-to-end delivery to `current-alarm-state` / `lifecycle-events` / `ack-writeback` is
at-least-once**; a restart re-emits every record produced since the last completed checkpoint
(up to 30 s of alarm state upserts). See F-11.

**`FailLoudIoTDBSink` is genuinely fail-loud** — verified: it buffers into a `List`
(`FailLoudIoTDBSink.java:56, 77`), flushes on `batchSize` (`:78-80`) *and* inside
`snapshotState` (`:84-88`), retries 3× with 2 s × attempt backoff (`:46-47, 127-145`), and then
**throws `IOException`** (`:147-150`), failing the checkpoint. `close()` also flushes (`:99`).

---

## 3. Deep dive — `OpcEventStreamJob` (the ISA-18.2 state machine)

### 3.1 Topology, verbatim

`OpcEventStreamJob.java:52-190`. Three independent sources, six sinks.

```
raw-alarms ──(KafkaSource, group flink-ams-raw-alarms, offsets per --raw-alarms.starting-offsets)
   → ValidationMap            (:65,  parallelism cfg.validation)
   → filter(e != null)        (:69)
   → keyBy(alarmKey) → DedupFilter        (:74-78,  cfg.dedup)   [ValueState ×3]
   → EnrichmentMap ("normalization")      (:81-85,  cfg.enrichment)
   → SoeOrderMap ("soe-ordering")         (:88-91,  cfg.soe)     [NO-OP]
   → keyBy(alarmKey) → LifecycleMap       (:94-98,  cfg.lifecycle) [ValueState ×2]
   → CorrelationMap                       (:101-105, cfg.correlation) [NO-OP]
   → FloodDetectFilter                    (:108-111, cfg.flood)
   ├→ RootCauseMap → sink root-cause-events                     (:113-122)
   ├→ KpiMap → filter(...)   ***NO SINK — output discarded***   (:124-129)
   ├→ toLifecycleJson → sink lifecycle-events (value-only key)  (:131-135)
   └→ projection-builder → sink current-alarm-state (keyed alarmId) (:137-151)

operator-actions ──(group flink-ams-operator-actions, committed/earliest)
   → toAckWriteback → filter non-empty → sink ack-writeback     (:154-162)

ack-results ──(group flink-ams-ack-results, committed/earliest)
   ├→ toAckLifecycleEvent → sink lifecycle-events               (:173-179)
   └→ filter(isAckConfirmed) → toAckConfirmedState
        → sink current-alarm-state (keyed alarmId)              (:181-188)
```

### 3.2 Alarm identity / dedup key

**Key computation — `PipelineOperators.ValidationMap.map` (`:38-60`)**

```java
serverId  = text("serverId", "opcServer")                       // :43
            default = httpFeed ? "f0af9a6d-85f6-4c9f-a8ad-6de277d1d110"
                               : "7ce5ecbf-70c9-498d-b899-5c8bb7add383";   // :44-47
source    = text("sourceName", "sourcePath")                    // :38
condition = text("conditionName", "condition")                  // :39
subCondition = root.subConditionName or ""                      // :48-49
alarmKey  = AlarmKeys.alarmKey(serverId, source, condition, subCondition)   // :56
alarmId   = explicit root.alarmId  ?  that value
                                   :  AlarmKeys.stableAlarmId(alarmKey)     // :57-60
```

`AlarmKeys.alarmKey` = `serverId + "|" + source + "|" + condition + "|" + subCondition`
(`AlarmKeys.java:11-13`). Empty `source` **or** empty `condition` drops the record
(`PipelineOperators.java:40`).

`AlarmKeys.stableAlarmId` (`AlarmKeys.java:15-27`): MD5 of the key; MSB from bytes 0–7,
LSB from bytes 8–15, big-endian; **no RFC-4122 version/variant nibble munging**.

Everything downstream is keyed on `alarmKey` (`OpcEventStreamJob.java:74, 94` via
`RawOpcAlarmEvent::getAlarmKey`), and the Kafka record key on `current-alarm-state` is the
**`alarmId`** (`OpcEventStreamJob.java:148, 185` → `KafkaSinks.keyedByJsonField(..., "alarmId")`).

**Cross-check vs `docs/alarm-identity-contract.md`:** the contract's canonical rule ("identity is
the Kafka `alarmId`; historian path = `alarmId.replaceAll("[^a-zA-Z0-9_]","_")`") **matches the
code** — `IoTDBPersistenceJob.java:132-134` applies exactly that regex and builds
`root.ams.site1.alarms.<safe>`. Collision detection is real (`IoTDBPersistenceJob.java:87-102`),
bounded at 50 000 entries, logs a warning only.

**Cross-check vs .NET — MISMATCH (F-03).** `AlarmKeys.java:7` claims "must match AMS.Api
StableGuid (MD5)". No class named `StableGuid` exists. The .NET counterpart is
`AlarmPartitionKeys` (`src/backend/AMS.Infrastructure/Kafka/AlarmPartitionKeys.cs`), whose header
at `:8` claims "Must match Flink `AlarmKeys`". They do **not** match, in two ways:

| | Flink `AlarmKeys` | .NET `AlarmPartitionKeys` |
|---|---|---|
| Key string | `serverId\|src\|cond\|sub` (`AlarmKeys.java:12`) | `"v1\|" + serverId + "\|" + src + "\|" + cond + "\|" + sub` (`AlarmPartitionKeys.cs:15, 36`) |
| Version/variant nibbles | not set (`AlarmKeys.java:20-23`) | `hash[6] = (hash[6]&0x0F)\|0x30; hash[8] = (hash[8]&0x3F)\|0x80` (`AlarmPartitionKeys.cs:56-57`) |
| Byte order | big-endian `new UUID(msb, lsb)` (`AlarmKeys.java:20-23`) | `new Guid(hash.AsSpan(0,16))` — .NET reads the first 3 fields **little-endian** (`AlarmPartitionKeys.cs:58`) |

The two therefore produce different GUIDs for the same alarm. The comment at
`AlarmPartitionKeys.cs:52` ("Matches Java `UUID.nameUUIDFromBytes`") is also wrong on both counts.
This is **latent** on the OPC path (Flink always ships an explicit `alarmId`, which the .NET
ingestor `Guid.TryParse`s straight through — `NormalizedAlarmIngestor.cs:272-275`) but it is the
root of the live-path key split described in F-02.

### 3.3 Deduplication — `DedupFilter` (`PipelineOperators.java:100-145`)

Keyed by `alarmKey`. Three `ValueState`s, **no TTL configured on any of them**:

| State | Descriptor | Line |
|---|---|---|
| `lastEventTime` | `ValueState<Long>` | `:116` |
| `lastConditionActive` | `ValueState<Boolean>` | `:117` |
| `lastAcknowledged` | `ValueState<Boolean>` | `:118` |

Drop rule (`:135-138`):

```java
if (prev != null && prev >= evt.eventTimeEpochMs && !activeChanged && !ackChanged) {
    evt.duplicate = true;   // written, never read anywhere
    return false;           // dropped, no metric, no side output
}
```

`activeChanged` / `ackChanged` are computed at `:130` / `:133`. The state is **never cleared** —
unlike `LifecycleMap`, `DedupFilter` keeps three entries per distinct `alarmKey` forever
(F-14).

Consequence (F-07): an event carrying the *same* `eventTimeEpochMs` as the previous one for that
key, with the same `conditionActive` and `acknowledged`, is silently discarded — even if severity,
message, priority, or `cookieOffset` changed. On the HTTP feed the event timestamp is
`record.SourceTimestamp` (the activation time, `AlarmIngestionService.cs:190`), which is stable
across polls, so a severity escalation on a standing alarm is dropped.

### 3.4 The state machine itself — `LifecycleMap` (`PipelineOperators.java:211-275`)

Keyed by `alarmKey`. Two `ValueState`s, no TTL:
- `prevLifecycle` : `ValueState<String>` (`:226`)
- `prevAcknowledged` : `ValueState<Boolean>` (`:227`)

**Every transition implemented, exhaustively:**

| # | Precondition (`prev` = `prevLifecycle.value()`) | Input | `transitionType` | `lifecycleState` | Ack handling | State write | Line |
|---|---|---|---|---|---|---|---|
| T1 | `prev == null` (first sighting, or after a CLEAR) | any | `NEW` | `ACTIVE` | `effectiveAck = evt.acknowledged` — **prior ack is deliberately NOT restored** (`prev != null` guard at `:255`) | if active: `prevLifecycle="ACTIVE"`, `prevAcknowledged=ack` | `:239-241` |
| T2 | `prev != null` and `evt.conditionActive == true` | active event | `ACTIVE` | `ACTIVE` | ack sticky: if `!evt.acknowledged && prevAcked==true` → `effectiveAck = true` | `prevLifecycle="ACTIVE"`, `prevAcknowledged=ack` | `:242-244, 254-261, 269-270` |
| T3 | any | `conditionActive == false` | `CLEARED` | `CLEARED` | `effectiveAck` = `evt.acknowledged` only (sticky branch requires `conditionActive`) | **both states cleared** (`:265-267`) | `:245-248` |

Note T1 fires again after every T3, because T3 wipes `prevLifecycle` — so a re-activation is
always `NEW` with acknowledgment reset. That is intentional and documented at `:262-263`.

**That is the entire state machine.** There is no other state-carrying operator in the alarm
pipeline.

### 3.5 ISA-18.2 conformance — what exists and what does not

| ISA-18.2 / EEMUA-191 state | Implemented in Flink? | Evidence |
|---|---|---|
| Normal | Implicit (absence of a row; `ALARM_STATE_DELETE` emitted) | `OpcEventStreamJob.java:139-141` |
| Unacknowledged (Active/Unacked) | **Yes** — `conditionActive=true, acknowledged=false` | `PipelineOperators.java:429-430` |
| Acknowledged (Active/Acked) | **Yes** — `conditionActive=true, acknowledged=true` | same |
| **RTN Unacknowledged** (cleared but never acked) | **NO** | `OpcEventStreamJob.java:139-141` emits `ALARM_STATE_DELETE` whenever `!conditionActive`, **regardless of ack**; the .NET consumer then unconditionally `DeleteAsync`es the row (`NormalizedAlarmIngestor.cs:186-193`). The alarm vanishes from `alarm_current`. **This is an ISA-18.2 conformance break** (F-01). |
| Shelved | **NO** in Flink | grep for `shelv` across `src/flink/src/main/java/com/ams/flink` → 0 hits. Shelving exists only in .NET (`ShelveExpiryService`, registered at `src/backend/AMS.Api/Program.cs`) |
| Suppressed by design | **NO** | grep for `suppress` → only `RootCauseMap`'s advisory `suppressed[]` array (`PipelineOperators.java:326-329`) and RBE "no change — suppress" comments in `LiveStateJob.java:159, 230` |
| Out of Service | **NO** | grep for `out.of.service` / `outofservice` → 0 hits |
| Latched / Reset-required | **NO** | no such concept in any operator |
| Quality / NAMUR NE107 mapping | **NO — hardcoded** | `quality` is written as the literal `192` at `PipelineOperators.java:431` and `OpcEventStreamJob.java:301`. There is no NE107 mapping, no Uncertain/Bad/Maintenance/OutOfService derivation anywhere in Flink. `RawOpcAlarmEvent` has no quality field at all. |

**Priority / severity mapping** (two independent implementations that must agree):

| Input | Rule | Line |
|---|---|---|
| HTTP feed (`alarmId` + `state` both present → `httpFeed=true`, `PipelineOperators.java:42`) | `severity = priorityToSeverity(priority)`: CRITICAL→900, HIGH→700, MEDIUM→400, LOW→100, else 300 | `PipelineOperators.java:486-495` |
| Non-HTTP feed | `severity = root.severity` (default 300) | `PipelineOperators.java:73` |
| Both | `priority = severity>=900 CRITICAL / >=700 HIGH / >=400 MEDIUM / >=100 LOW / else DIAGNOSTIC` | `PipelineOperators.java:161-164` |
| Historian (parallel impl.) | same bands + `DIAGNOSTIC→50` | `IoTDBPersistenceJob.java:184-206` |

The two implementations agree on CRITICAL=900 (a documented past defect, `IoTDBPersistenceJob.java:187-193`),
but `IoTDBPersistenceJob.priorityToSeverity` has a `DIAGNOSTIC → 50` case that
`PipelineOperators.priorityToSeverity` lacks (falls to `default: 300`). See F-15.

**Condition / sub-condition:** `conditionName` (fallback `condition`) and `subConditionName` are
read (`PipelineOperators.java:39, 48-49`), form part of the identity key, and are echoed to the
projection (`:421-423`) — but there is **no** OPC A&E sub-condition ranking, no
active-sub-condition transition logic, no "condition changed sub-condition" event kind.
`alarmEventKind` is the hardcoded string `"CONDITION"` in three places
(`PipelineOperators.java:182, 428`; `OpcEventStreamJob.java:297, 309`) — SIMPLE and TRACKING event
kinds are never produced by Flink.

**`conditionActive` derivation:** HTTP feed → `!"CLEARED".equalsIgnoreCase(state)`
(`PipelineOperators.java:70-71`); otherwise → `root.conditionActive` defaulting to `true`
(`:75`).

**Ack derivation at ingest:** `evt.acknowledged = evt.opcDcsAcknowledged = root.acknowledged`
(`PipelineOperators.java:78-82`) for *all* feeds — the comment at `:79-81` states OPC A&E is
authoritative. Note this contradicts the field javadoc on `RawOpcAlarmEvent.java:22-25`, which
says `opcDcsAcknowledged` is "informational only; never drives UI projection" and `acknowledged`
is "only set by ack-results / operator-actions path". The code does the opposite. (F-17,
documentation defect.)

### 3.6 ACK orchestration — the full loop **does exist**, verified end to end

| Hop | Component | File:line | Emits |
|---|---|---|---|
| 1 | Operator ACK in UI → `OperatorActionPublisher.PublishAcknowledgeAsync` | `src/backend/AMS.Infrastructure/Kafka/OperatorActionPublisher.cs:66-95` | `operator-actions`, key = `AssetKey(serverId, sourceName)`; `AlarmId = alarm.Id` (**Postgres GUID**), `SourceAlarmId = alarm.AlarmId` (**Kafka alarm key string**) |
| 2 | Flink `toAckWriteback` | `OpcEventStreamJob.java:213-242` | filters `ActionType == "ACKNOWLEDGE"` (`:217`); emits `ACK_WRITEBACK_COMMAND` with `ackState`/`lifecycleState` = `"ACK_DISPATCHED"` (`:236-237`) to `ack-writeback` (value-only key, `:162`) |
| 3 | `HttpAckWritebackService` | `src/backend/AMS.Api/BackgroundServices/HttpAckWritebackService.cs:57, 108-146` | consumes `ack-writeback` with `EnableAutoCommit=false` (`:52`); POSTs `{correlation_ids, source_event_id, idempotency_key, action:"ACKNOWLEDGE", operator, timestamp}` to `AlarmIngestion__AckWritebackUrl` |
| 4 | same service | `:149-176` | publishes `AckResultMessage` (`ResultState` = `ACK_CONFIRMED` on 2xx, else `ACK_FAILED`) to `ack-results`, key = `writeback.AlarmId`; commits the offset **only after** the publish succeeds (`:174-175`) |
| 5 | Flink `toAckLifecycleEvent` | `OpcEventStreamJob.java:253-276` | `LIFECYCLE_EVENT` with `lifecycleState = resultState` → `lifecycle-events` |
| 6 | Flink `isAckConfirmed` + `toAckConfirmedState` | `OpcEventStreamJob.java:244-251, 278-314` | `ACK_STATE_UPDATE` → `current-alarm-state`, keyed by `alarmId` |
| 7 | `NormalizedAlarmIngestor` | `src/backend/AMS.Infrastructure/Kafka/NormalizedAlarmIngestor.cs:47-50, 99-116` | applies ack-only fields, never touches `conditionActive` |

**Correlation identifiers** flow intact through every hop: `commandId`, `correlationId`,
`lifecycleId` are copied at `OpcEventStreamJob.java:221-223` (writeback), `:266-268`
(lifecycle event), `:287-289` (state update), and set on the .NET side at
`HttpAckWritebackService.cs:154-156`.

**There is no OPC gateway service.** `CLAUDE.md` describes `ack-writeback → OPC Gateway → DCS`;
in the compose file the only consumer of `ack-writeback` is `ams-api`'s
`HttpAckWritebackService`, and the DCS endpoint defaults to the `mock-dcs` stub
(`docker-compose.yml:406-435, 710`). No `raw-opc-events` topic exists either — the ingest topic is
`raw-alarms` (`scripts/kafka-reset-lab-topics.ps1:19`).

**`ack-writeback-dlq` is declared and never used** — `KafkaConsumerService.cs:32` declares it,
nothing produces to it, and `scripts/kafka-reset-lab-topics.ps1` never creates it (only
`raw-alarms-dlq`, `:20`).

### 3.7 Chattering / flood / correlation / aggregation

| Feature | Status | Evidence |
|---|---|---|
| Flood detection | **Placeholder that silently drops data** | `FloodDetectFilter` (`PipelineOperators.java:360-383`) is not flood detection at all — it is a severity high-pass filter: `if (max(severity, rawSeverity) >= 950) return false;`. No rate window, no counter, no state. |
| Chattering / fleeting detection | **Missing** | grep `chatter\|fleeting` in `src/flink/.../com/ams/flink` (excluding `cplm/`) → 0 hits |
| Bad-actor / nuisance ranking | **Missing producer** | `AlarmKpiResult` has `BAD_ACTOR` and `HEALTH_SCORE` branches (`AlarmKpiResult.java:47-53`) and topics `kpi-bad-actors` / `kpi-health-scores` exist (`kafka-reset-lab-topics.ps1:30, 32`), but **no Flink code emits either kpiType**. `KpiConsumerService` subscribes to all four (`KpiConsumerService.cs:20-23`) and two of them will never receive anything. |
| Alarm rate KPI | Implemented | `AlarmKpiStreamJob.java:70-91`, 10-min sliding / 1-min slide event-time window over `lifecycle-events` filtered to `lifecycleState=="ACTIVE"` |
| Standing-alarm snapshot | **Implemented but wrong** | `StandingAlarmTracker` (`:139-172`) — see F-05 |
| Correlation | **No-op** | `CorrelationMap` (`PipelineOperators.java:278-295`) increments two counters and returns the input unchanged. Its javadoc calls it a "Correlation pass-through". |
| Root-cause "CEP" | **Hardcoded string matching, not CEP** | `RootCauseMap` (`PipelineOperators.java:297-334`) — uppercases `source`, checks `contains("CRUSHER"/"CONVEYOR"/"FEEDER"/"MOTOR")`, and emits a `suppressed[]` array of the *other* three hardcoded tag words. No Flink CEP library is used anywhere in the repo. Zero relationship to the actual plant model (`HDPE` hierarchy). |
| SOE ordering | **No-op** | `SoeOrderMap` (`PipelineOperators.java:193-209`) — `recordsIn.inc(); recordsOut.inc(); return evt;`. Despite the operator name in the Flink UI, no sequence-of-events reordering happens. |
| Aggregation beyond the above | none | — |

### 3.8 Event-time, watermarks, lateness, idleness

| Job | Watermark strategy | Event-time windows? | Idleness handling |
|---|---|---|---|
| `OpcEventStreamJob` | `WatermarkStrategy.noWatermarks()` on **all three** sources (`:63, 155, 167`) | none | n/a |
| `IoTDBPersistenceJob` | `noWatermarks()` (`:61`) | none | n/a |
| `LiveStateJob` | `noWatermarks()` (`:65`) | none | n/a |
| `AlarmStateExportJob` | `noWatermarks()` (`:53`) | none | n/a |
| `AnalysisExecutionJob` | `noWatermarks()` (`:52`) | none | n/a |
| `AlarmKpiStreamJob` | `forBoundedOutOfOrderness(5 s)` with a timestamp assigner reading `timestampEpochMs`, **applied downstream of a `noWatermarks()` source** (`:52-65`) | **yes** — `SlidingEventTimeWindows.of(10 min, 1 min)` via `windowAll` (`:77`) | **`withIdleness` NOT set** |
| `StateDriftDetectionJob` | `forBoundedOutOfOrderness(5 s)` **with no timestamp assigner** (`:48, 51`) — falls back to Kafka record timestamps | none (processing-time timers, `:97`) | n/a |
| `AlarmReplayEngine` | `noWatermarks()` (`:48`) | none | n/a |

**Late/out-of-order handling:** the alarm state machine has none. It is a pure
processing-time-ordered pipeline; ordering is whatever Kafka partition interleaving produces.
The only out-of-order defence is `DedupFilter`'s `prev >= evt.eventTimeEpochMs` drop
(`PipelineOperators.java:135`) — which does not *reorder* late events, it **deletes** them
(F-08). `AlarmKpiStreamJob` has no `allowedLateness` and no late-data side output, so records
older than watermark − 5 s are dropped by the window.

### 3.9 Error handling, DLQ, poison messages — **VERIFIED: there is no Flink DLQ**

Grep for `OutputTag`, `sideOutput`, `getSideOutput` across
`src/flink/src/main/java/com/ams/flink/` returns **zero matches**. No Flink job in the repo has a
side output or a dead-letter sink of any kind.

Every failure path silently discards:

| Location | Failure | Behaviour |
|---|---|---|
| `PipelineOperators.java:94-96` | any exception parsing a `raw-alarms` record | `return null` → dropped by `filter(e != null)` (`OpcEventStreamJob.java:69`). `recordsOut` is not incremented, so the loss is visible only as an `in > out` counter gap — **no error metric, no log line, no DLQ**. |
| `PipelineOperators.java:40` | missing `sourceName` or `conditionName` | `return null` → same silent drop |
| `OpcEventStreamJob.java:239-241` | malformed `operator-actions` record | `return ""` → filtered out. **An operator's acknowledgement is silently swallowed.** |
| `OpcEventStreamJob.java:249` | malformed `ack-results` | `return false` → not treated as confirmed |
| `OpcEventStreamJob.java:273-275, 311-313` | malformed `ack-results` | `return ""` → filtered out |
| `LiveStateJob.java:134-137, 208-211` | unparseable `current-alarm-state` | `return null` → filtered |
| `IoTDBPersistenceJob.java:177-179` | unparseable `raw-alarms` | `return null` → filtered |
| `AlarmStateExportJob.java:91-93` | unparseable key extraction | key `"unknown"` — record still processed under a shared key |
| `AlarmKpiStreamJob.java:152-153` | **no try/catch** — `MAPPER.readTree` throws, or `node.get("lifecycleState")` returns `null` → NPE | **fails the task** → job restart loop (F-06) |
| `PipelineOperators.java:135-138` | dedup drop | silent, no metric |
| `PipelineOperators.java:377-379` | flood-band drop | silent, no metric |

The *real* DLQ in this system is on the **.NET** side and it is **not** a stub (contrary to
`docs/architecture-review/09-gap-register.md:45` "DOM-01"): `KafkaConsumerService.SendToDeadLetterAsync`
(`:392-424`) publishes a `DeadLetterEnvelope` to `raw-alarms-dlq`, increments the
`ams_projection_dlq_events_total` counter, returns a bool, and the caller commits offsets **only**
if every event was accepted (`:357-381`). That gap appears to have been fixed since the review was
written; the review text is stale.

### 3.10 Sink correctness (compacted topics, keys, upsert semantics)

`KafkaSinks.java` is the shared helper and its contract is honoured where it matters:

| Sink | Topic | `cleanup.policy` | Key strategy | Correct? |
|---|---|---|---|---|
| `current-alarm-state-sink` | `current-alarm-state` | **compact** (`kafka-reset-lab-topics.ps1:21`) | `keyedByJsonField(..., "alarmId")` (`OpcEventStreamJob.java:148`) | ✅ |
| `ack-projection-sink` | `current-alarm-state` | compact | `keyedByJsonField(..., "alarmId")` (`:185`) | ✅ mechanically, ❌ semantically (F-02 — wrong `alarmId` value) |
| `lifecycle-events` (×2) | `lifecycle-events` | delete (`:25`) | **value-only, null key** (`OpcEventStreamJob.java:135, 176`) | legal, but destroys per-alarm ordering across 4 partitions (F-10) |
| `root-cause-sink` | `root-cause-events` | delete (`:26`) | value-only | ✅ |
| `ack-writeback` | `ack-writeback` | delete (`:23`) | value-only | ✅ |
| `live-alarms-sink` | `live.alarms` | delete (`:49`) | `keyedByJsonField(..., "alarmId")` (`LiveStateJob.java:79`) | ✅ (documented PIPE-010 ordering fix, `:71-72`) |
| `live-metrics-sink` | `live.alarm.metrics` | delete (`:55`) | keyed (`LiveStateJob.java:100`) | ✅ |
| `standing-sink` | `kpi-standing-snapshots` | **compact** (`:31`) | `KafkaSinks.fixedKey(..., "GLOBAL")` (`AlarmKpiStreamJob.java:104`) | ✅ |
| `rates-sink` | `kpi-alarm-rates` | delete (`:29`) | raw `KafkaSink.builder()`, no key (`AlarmKpiStreamJob.java:82-89`) | ✅ (bypasses the helper, but the topic is delete-policy) |
| `Delta State Sink` | `flink.state.alarm.delta` | delete (`:36`) | raw builder, no key (`AlarmStateExportJob.java:61-68`) | ✅ |
| `Drift Alerts Sink` | `system.state.drift.alerts` | delete (`:44`) | raw builder, no key (`StateDriftDetectionJob.java:59-66`) | n/a (job never runs) |
| `replay-sink` | `flink.state.alarm.replay` | delete (`:39`) | raw builder, no key (`AlarmReplayEngine.java:107-115`) | n/a (job never runs) |

`JsonFieldKey.serialize` never emits a null key — it falls back to the whole JSON value as the key
if the field is missing (`KafkaSinks.java:84-86`). Safe for the broker, but a missing `alarmId`
would create a garbage key rather than fail loudly.

**Upsert semantics:** `current-alarm-state` gets a real key-per-alarm, so log compaction keeps the
latest state per alarm. But **`ALARM_STATE_DELETE` is not a tombstone** — it is a normal record
with a non-null value (`PipelineOperators.java:443-456`), so the key is never actually removed by
compaction. The compacted topic therefore grows monotonically with the number of distinct alarm
ids ever seen. See F-12.

---

## 4. Findings

Severity key — **Critical**: silent data loss or safety-relevant misbehaviour on the live path.
**High**: incorrect operator-visible state. **Medium**: correctness/ops risk under load or
failure. **Low**: hygiene.

### F-01 — Critical — RTN-Unacknowledged alarms are deleted, not held

`OpcEventStreamJob.java:138-141`:
```java
if (!e.conditionActive) { return PipelineOperators.toDeleteAlarmStateJson(e); }
```
The ack state is not consulted. `NormalizedAlarmIngestor.HandleDeleteAsync`
(`NormalizedAlarmIngestor.cs:186-193`) then deletes the `alarm_current` row unconditionally.

**Failure scenario:** a HIGH alarm activates, is never acknowledged, and the process self-corrects
30 s later. The alarm disappears from the operator's alarm list before anyone saw it. ISA-18.2
§5.3.4 requires it to persist in the "RTN Unacknowledged" state until an operator acknowledges.
This also breaks EEMUA-191 unacknowledged-alarm metrics.

### F-02 — Critical — the ACK projection writes to a **different compaction key** than the alarm state, on the live HTTP-feed path

Chain:
1. HTTP-feed alarms carry a non-GUID `alarmId`: `record.CorrelationId` or the literal
   `"{TagName}|{Condition}"` (`AlarmIngestionService.cs:114-116`). The lab simulator confirms the
   shape: `alarm_id = f"SIM-{tag}-{i:03d}"` (`ams-sims/sim_alarm_feed.py`).
2. Flink passes it through unchanged (`PipelineOperators.java:57-60`) and keys
   `current-alarm-state` on it (`OpcEventStreamJob.java:148`).
3. The .NET ingestor cannot `Guid.TryParse` it, so it derives a *different* id
   `DeterministicAlarmId(evt.AlarmId)` and stores that as `alarm.Id`
   (`NormalizedAlarmIngestor.cs:272-277`, `ActiveAlarm.cs:204-209`).
4. An operator ACK publishes `AlarmId = alarm.Id.ToString()` — that derived GUID
   (`OperatorActionPublisher.cs:74`).
5. Flink copies it verbatim through `ack-writeback` → `ack-results` →
   `toAckConfirmedState` → `current-alarm-state` **keyed by that GUID**
   (`OpcEventStreamJob.java:290, 185`).

**Result:** the `ACK_STATE_UPDATE` lands under a key that no alarm-state record ever uses. On a
compacted topic it becomes a permanent orphan entry. Worse, `LiveStateJob` reads
`current-alarm-state` and keys by `alarmId` (`LiveStateJob.java:74`), so it manufactures a
**phantom entry in `live.alarms`** with the hardcoded `severity=100`, `priority="LOW"`,
`category="PROCESS"` from `OpcEventStreamJob.java:294-296`, and — because
`toAckConfirmedState` deliberately omits `conditionActive` (`:298`) — `LiveStateJob.java:144`
defaults it to `true`. The HMI live plane therefore shows a fake LOW alarm per acknowledgement.

Postgres is unaffected (the ingestor matches on `serverId + sourceName + condition`, not on the
key), which is why this has not been caught by DB-level E2E checks.

**Requires verification:** whether the production feed at
`http://192.168.1.51:8010/api/current-alarms` (`docker-compose.yml:705`) returns GUID
`correlation_id`s. If it does, step 3 short-circuits and the bug does not fire in that
deployment — but the `"{TagName}|{Condition}"` fallback (`AlarmIngestionService.cs:116`) always
triggers it for records with no correlation id.

### F-03 — High — Flink and .NET compute different deterministic alarm GUIDs while each claims to match the other

Detailed in §3.2. `AlarmKeys.java:7` and `AlarmPartitionKeys.cs:8, 52` all assert a compatibility
that the code does not have (different key prefix, different nibble munging, different byte
order). Latent today only because Flink always ships an explicit `alarmId`; it becomes live the
moment anything relies on either side re-deriving the id.

### F-04 — High — `FloodDetectFilter` silently deletes the most severe alarms

`PipelineOperators.java:371-382`:
```java
if (Math.max(evt.severity, evt.rawSeverity) >= 950) { return false; }
```
This is the **only** thing the "flood detection" operator does. OPC A&E severity is 1–1000, so
any alarm in the 950–1000 band — the highest-severity events in the plant — never reaches
`current-alarm-state`, `lifecycle-events`, `root-cause-events`, or the operator's screen. No log,
no metric, no DLQ.

Note also that the PIPE-012 `rawSeverity` mitigation (`RawOpcAlarmEvent.java:13-19`,
`PipelineOperators.java:67-69`) is inert for the live HTTP feed, because
`AlarmIngestionService.PublishEventAsync` (`:143-156`) never emits a `severity` field at all —
only `priority`.

### F-05 — High — `StandingAlarmTracker` counts events, not alarms

`AlarmKpiStreamJob.java:139-172`. All records are forced onto a single key `"GLOBAL"` (`:95`);
the counter increments on **every** lifecycle event whose state is `ACTIVE` (`:155-156`) and
decrements on `CLEARED` (`:157-158`).

But `OpcEventStreamJob` emits a lifecycle event for *every* passing event, and re-emits `ACTIVE`
for every subsequent update of a standing alarm (`PipelineOperators.java:242-244` → T2). A single
alarm that updates 50 times contributes +50 and −1. `standingCount` therefore drifts upward
without bound and is meaningless as an EEMUA-191 standing-alarm metric. `oldestStandingDurationMs`
is hardcoded to `0` with a "simplified for demo" comment (`:168`).

`KpiConsumerService` (`src/backend/AMS.Api/BackgroundServices/KpiConsumerService.cs:20-23`)
consumes this as if it were real.

### F-06 — High — poison message in `lifecycle-events` restart-loops the KPI job

`AlarmKpiStreamJob.StandingAlarmTracker.processElement` (`:148-153`) has **no try/catch**:
```java
JsonNode node = MAPPER.readTree(json);            // throws on non-JSON
String state = node.get("lifecycleState").asText(""); // NPE if field absent
```
`lifecycle-events` is written by two independent producers (Flink `:135, 176` and .NET
`LifecycleEventPublisher.cs:54`) with no schema enforcement. Any record lacking `lifecycleState`
fails the task. With no `restart-strategy` configured (§2.1) Flink retries every 1 s forever,
because the offending offset is replayed from the last checkpoint each time.

### F-07 — High — dedup drops legitimate state changes that share a timestamp

`PipelineOperators.java:135` drops when `prev >= evt.eventTimeEpochMs` unless `conditionActive`
or `acknowledged` changed. Severity escalation, message change, priority change, and
`cookieOffset` arrival at the same event timestamp are all silently discarded. On the HTTP feed
the timestamp is the alarm's *activation* time and is constant for the lifetime of a standing
alarm (`AlarmIngestionService.cs:190`), making this the common case rather than an edge case.

### F-08 — Medium — no late/out-of-order handling in the state machine

All three sources use `WatermarkStrategy.noWatermarks()` (`OpcEventStreamJob.java:63, 155, 167`).
Ordering is Kafka-partition interleaving. Because `raw-alarms` has 8 partitions
(`kafka-reset-lab-topics.ps1:19`) and is keyed by the producer on `snapshot.AlarmId`
(`AlarmIngestionService.cs:158`), same-alarm ordering *is* preserved at the source — but any
producer that keys differently (or a re-partitioning) would reorder events, and `DedupFilter`
would then permanently delete the out-of-order ones rather than reorder them.

### F-09 — Medium — `AlarmStateExportJob` misroutes `ALARM_STATE_DELETE`

`AlarmStateExportJob.java:113-120` computes `isDelete` from
`conditionActive == false && acknowledged == true`. It never checks
`eventType == "ALARM_STATE_DELETE"`. Flink's delete record sets `conditionActive: false` and
`acknowledged: evt.acknowledged` (`PipelineOperators.java:451-452`), so an unacknowledged clear
is emitted downstream as an `UPDATE` rather than a `REMOVE`, and `AlarmStateDeltaConsumerService`
(`AlarmStateDeltaConsumerService.cs:39`) never learns the alarm went away.

### F-10 — Medium — `lifecycle-events` records are produced with a null key

`OpcEventStreamJob.java:135` and `:176` both use `kafkaSink(...)` → `KafkaSinks.valueOnly`
(`:209-211`, `KafkaSinks.java:31-33`). Legal for the delete-policy topic, but the 4 partitions
(`kafka-reset-lab-topics.ps1:25`) receive one alarm's events round-robin, so the ISA-18.2
"append-only transition log" has no per-alarm ordering guarantee. The .NET side deliberately keys
its own lifecycle events by `AssetKey` (`OperatorActionPublisher.cs:61`) — Flink does not.

### F-11 — Medium — `EXACTLY_ONCE` checkpointing paired with `AT_LEAST_ONCE` sinks

`OpcEventStreamJob.java:32` declares `CheckpointingMode.EXACTLY_ONCE`; every sink it uses is
`DeliveryGuarantee.AT_LEAST_ONCE` (`KafkaSinks.java:55`), and no `transactionalIdPrefix` is set
anywhere in the repo. On a TaskManager failure, up to 30 s of `current-alarm-state`,
`lifecycle-events` and `ack-writeback` records are re-emitted. The `current-alarm-state` upserts
are idempotent so Postgres is safe; **`ack-writeback` is not** — a duplicate ACK command is
re-POSTed to the DCS. It is mitigated by `idempotency_key` on the payload
(`HttpAckWritebackService.cs:104-106`) but the DCS must honour it.
`architecture_document.md` and `CLAUDE.md` both describe this pipeline as "exactly-once".

### F-12 — Medium — `current-alarm-state` is compacted but never tombstoned

`toDeleteAlarmStateJson` (`PipelineOperators.java:443-456`) emits a full JSON body, not a null
value. Compaction keeps the last record per key, so every alarm id ever seen is retained forever.
A plant with high alarm-id churn (the `"{TagName}|{Condition}"` fallback creates a new id per
distinct condition string) grows the topic without bound. `retention.ms` is also set on this
compact-only topic (`kafka-reset-lab-topics.ps1:21`), where it has no effect.

### F-13 — Medium — no restart strategy configured anywhere

Verified: `restart-strategy` appears nowhere in `infra/docker/docker-compose.yml` and no job
calls `env.setRestartStrategy(...)`. Flink 1.18's fallback (checkpointing enabled) is fixed-delay
× `Integer.MAX_VALUE` at 1 s. Combined with F-06 this is an unbounded hot restart loop that also
prevents the supervisor from noticing anything wrong (`job_running_count` counts `RESTARTING` as
healthy — `flink-job-supervisor.sh:58`).

### F-14 — Medium — unbounded keyed state: no `StateTtlConfig` anywhere

Grep for `StateTtlConfig` across `src/flink/src/main/java/com/ams/flink/` → 0 hits.
- `DedupFilter` keeps 3 `ValueState`s per `alarmKey` and **never clears them**
  (`PipelineOperators.java:139-141` only updates).
- `LiveStateJob`'s `live-alarm-fp` / `live-metric-fp` (`:125, 199`) are never cleared.
- `LifecycleMap` *does* clear on CLEARED (`PipelineOperators.java:265-267`) — the only operator
  that does.

State size grows with lifetime distinct alarm-key cardinality. RocksDB + incremental checkpoints
delay the pain but do not bound it.

### F-15 — Low — the two `priorityToSeverity` implementations disagree on `DIAGNOSTIC`

`IoTDBPersistenceJob.java:195` maps `DIAGNOSTIC → 50`; `PipelineOperators.java:486-494` has no
`DIAGNOSTIC` case and falls through to `default: 300`. A `DIAGNOSTIC` HTTP-feed alarm is stored in
the historian at severity 50 and in Postgres at severity 300 (priority `LOW`).

### F-16 — Low — hardcoded values and credentials

| Value | Location | Impact |
|---|---|---|
| `"supersecurepassword123"` (Postgres default password) | `PipelineConfig.java:84` | Credential in source. Compounded by the fact that `dbUrl`/`dbUser`/`dbPass` are **never read** by any job (no JDBC sink exists) — pure dead config. |
| `"root"`/`"root"` IoTDB defaults | `PipelineConfig.java:100-101` | Default credentials in source (compose does override via `IOTDB_USER`/`IOTDB_PASS`) |
| `"f0af9a6d-85f6-4c9f-a8ad-6de277d1d110"` | `OpcEventStreamJob.java:26` (**unused constant**) and duplicated as a literal at `PipelineOperators.java:45` | Two copies of the HTTP-feed server id; the named constant is dead |
| `"7ce5ecbf-70c9-498d-b899-5c8bb7add383"` | `PipelineOperators.java:46` | Hardcoded OPC server id fallback |
| Topic names `raw-alarms`, `operator-actions`, `ack-results`, `current-alarm-state`, `lifecycle-events`, `root-cause-events`, `ack-writeback` | `OpcEventStreamJob.java:54, 119, 135, 148, 154, 162, 165, 176, 185` | No topic is configurable; every job compiles its topics in (only `bootstrap.servers` and the CPLM jobs' topics are parameterised) |
| `"root.ams.site1.alarms."` | `IoTDBPersistenceJob.java:36` | Site is hardcoded to `site1`; a second site cannot be historised |
| `"live.alarm.metrics"` | `LiveStateJob.java:42` | hardcoded |
| Severity band constants 900/700/400/100 | `PipelineOperators.java:161-164, 489-492`; `IoTDBPersistenceJob.java:191-196, 201-205` | 4 copies of the same table |
| Flood threshold `950` | `PipelineOperators.java:377` | magic number, see F-04 |
| KPI flood bands `50/20/10` | `AlarmKpiStreamJob.java:125-132` | magic numbers, per 10-min window |
| Root-cause tag words CRUSHER/CONVEYOR/FEEDER/MOTOR | `PipelineOperators.java:298-304, 320` | plant-specific literals in a generic engine |
| `quality = 192` | `PipelineOperators.java:431`, `OpcEventStreamJob.java:301` | NE107 mapping replaced by a constant |
| `severity=100, priority=LOW, category=PROCESS` on ACK projection | `OpcEventStreamJob.java:294-296` | fabricated values, see F-02 |
| IoTDB collision guard cap `50_000` | `IoTDBPersistenceJob.java:89` | magic number |
| Retry `MAX_ATTEMPTS=3`, `RETRY_BACKOFF_MS=2000` | `FailLoudIoTDBSink.java:46-47` | magic numbers |
| Feed URL `http://192.168.1.51:8010/api/current-alarms` | `infra/docker/docker-compose.yml:705` | hardcoded LAN IP, not env-overridable (unlike `ACK_WRITEBACK_URL` at `:710`) |

### F-17 — Low — `RawOpcAlarmEvent` field javadoc contradicts the code

`RawOpcAlarmEvent.java:22-25` states `opcDcsAcknowledged` is "informational only; never drives UI
projection" and `acknowledged` is "only set by ack-results / operator-actions path".
`PipelineOperators.java:82` does `evt.acknowledged = evt.opcDcsAcknowledged;` for every feed, and
that value flows straight into the projection (`OpcEventStreamJob.java:142`).

### F-18 — Low — the supervisor cannot distinguish "recovering" from "stuck"

`flink-job-supervisor.sh:56-59` counts `CREATED|INITIALIZING|RUNNING|RESTARTING|RECONCILING` as
present. That correctly prevents duplicate submits (a real past incident, documented at `:50-55`),
but a job wedged in a `RESTARTING` loop (F-06/F-13) is reported healthy and never escalated.

---

## 5. Dead, orphaned, and duplicated code

### 5.1 Jobs that never run

| Job | Why dead |
|---|---|
| `StateDriftDetectionJob` | Not in `flink-job-supervisor.sh` and not in `scripts/ensure_flink_jobs.py`. Both input topics — `alarm.events.raw` (`:32`) and `alarm.state.active` (`:41`) — **have no producer anywhere in the repo**: a repo-wide grep finds them only in this job, in `AlarmReplayEngine`, in the topic-creation script, and in docs. Also: both sources share the group id `flink-drift-detector` (`:33, 43`); has **no checkpointing at all**. `DriftAlertConsumerService` (`DriftAlertConsumerService.cs:39`) idles forever. `docs/plans/STR-08-job-decisions.md:16` marks it "RETIRE — needs sign-off". |
| `AlarmReplayEngine` | On-demand only, via `FlinkRestClient.SubmitReplayJobAsync` (`FlinkRestClient.cs:17-42`), which calls `GET /jars` and throws if the list is empty (`:20-24`). Flink's `/jars` endpoint lists jars uploaded through `POST /jars/upload` into `web.upload.dir`; this stack **bakes the jar into the image** at `/opt/flink/usrlib/` (`infra/docker/flink/Dockerfile:17`) and never sets `web.upload.dir` (verified: no `web.upload` key in the compose file). `/jars` is therefore always empty and the call always throws. It also reads the producerless `alarm.events.raw` (`AlarmReplayEngine.java:39`). `ReplayResultConsumerService` (`:39`) idles forever. |

### 5.2 Live jobs producing to topics nobody consumes

| Topic | Producer | Consumer |
|---|---|---|
| `live.alarm.metrics` | `LiveStateJob.java:100` | **none** — the job's own comment says so (`:92-93`) and a repo-wide grep confirms it |
| `kpi-bad-actors` | **none** | `KpiConsumerService.cs:22` subscribes |
| `kpi-health-scores` | **none** | `KpiConsumerService.cs:23` subscribes |
| `root-cause-events` | `OpcEventStreamJob.java:119` | `notification-service/Consumers/RootCauseConsumer.cs:26` — live, but fed by the hardcoded-tag-word "CEP" of §3.7 |

### 5.3 Dead code inside live jobs

| Item | Location | Note |
|---|---|---|
| `KpiMap` branch | `OpcEventStreamJob.java:124-129` | mapped and filtered, **never sunk**. Full JSON serialisation per event, thrown away. |
| `PipelineOperators.toAlarmTopicJson` | `:385-398` | never called |
| `AlarmIoTSerializationSchema.serialize()` | `:39-51` | never called; only the `MEASUREMENTS`/`TYPES` constants are used (`FailLoudIoTDBSink.java:119-120`). Keeps a compile dependency on `org.apache.iotdb.flink.Event`. |
| `PipelineConfig.dbUrl/dbUser/dbPass` | `:9-11, 82-84` | populated from env, never read (no JDBC sink in any job) |
| `OpcEventStreamJob.HTTP_FEED_SERVER_ID` | `:26` | unused constant |
| `RawOpcAlarmEvent.duplicate` | `:34` | written at `PipelineOperators.java:136`, never read |
| `AlarmJson.integer` / `AlarmJson.bool` | `:22-30` | never called |
| `AlarmKpiResult` `BAD_ACTOR` / `HEALTH_SCORE` branches | `:47-53` | no producer |
| `SoeOrderMap`, `CorrelationMap` | `PipelineOperators.java:193-209, 278-295` | no-op passthroughs that exist only to draw named boxes in the Flink UI and increment counters |
| unused imports | `OpcEventStreamJob.java:15, 17` (`ObjectNode`, `OffsetDateTime`), `PipelineOperators.java:8` (`Counter` is used; `HashSet/Set` used) | hygiene |
| `ack-writeback-dlq` option | `KafkaConsumerService.cs:32` | declared, never produced to, never created by the topic script |

### 5.4 Is anything duplicated by .NET?

**No.** The `AlarmStreamProcessorService` fallback described in `CLAUDE.md:100` and
`architecture_document.md:75` **does not exist** — a repo-wide grep finds the name only in
documentation and inside one exception string. `src/backend/AMS.Api/Program.cs:115-123`:

```csharp
var useFlinkOrchestration = config.GetValue("Kafka:UseFlinkOrchestration", true);
if (config.GetValue("Kafka:LabDirectIngest", false)) throw new InvalidOperationException(...);
if (!useFlinkOrchestration) throw new InvalidOperationException(
    "Kafka:UseFlinkOrchestration must be true. Flink owns the alarm lifecycle; " +
    "in-service stream processing and .NET ACK orchestration were removed.");
```

Setting the flag to `false` **throws at startup**. `ams-api` registers projection consumers only
(`Program.cs:130-133`). The .NET side is complementary, not duplicative:

| .NET service | Role | Overlap with Flink |
|---|---|---|
| `NormalizedAlarmConsumerService` | `current-alarm-state` → Postgres + SignalR | projection only |
| `LifecycleEventConsumerService` | `lifecycle-events` → audit log | none |
| `HttpAckWritebackService` | `ack-writeback` → DCS HTTP → `ack-results` | the **only** implementation of hops 3–4 of the ACK loop |
| `AlarmIngestionService` | HTTP feed → `raw-alarms` | the **only** producer of `raw-alarms` |
| `KpiConsumerService` | 4 KPI topics → DB | consumes Flink output |
| `AlarmStateDeltaConsumerService` / `ReplayResultConsumerService` / `DriftAlertConsumerService` | consume `flink.state.alarm.delta` / `.replay` / `system.state.drift.alerts` | 2 of 3 idle forever (§5.1) |
| `ShelveExpiryService` | ISA-18.2 shelving timeout | Flink has **no** shelving at all — this is the only implementation |

---

## 6. Failure / recovery posture

| Aspect | Reality |
|---|---|
| JobManager HA | ZooKeeper-backed, `high-availability.type: zookeeper` (`docker-compose.yml:528-532`); job graphs survive a JM restart and recover from the latest checkpoint |
| Checkpoint durability | MinIO S3 (`s3://ams-flink/checkpoints`), `num-retained: 3`, `RETAIN_ON_CANCELLATION` (`:539, 547, 554`); the S3 plugin is installed by `flink-entrypoint.sh:13-20` rather than `ENABLE_BUILT_IN_PLUGINS` (with a documented reason at `:8-12`) |
| Savepoints | `state.savepoints.dir` set (`:540`); **no automated savepoint-on-upgrade step exists** — no submit script or supervisor path takes or restores from a savepoint, and `flink run` is never invoked with `-s` |
| Offset reset (`raw-alarms`) | `--raw-alarms.starting-offsets`: `committed` (fallback earliest) from the supervisor (`docker-compose.yml:1517`) and `ensure_flink_jobs.py:91`, but **`earliest`** from the one-shot `flink-job-submit` container (`docker-compose.yml:670`) and the script default (`flink-submit-raw-alarms.sh:12`, `PipelineConfig.java:67`). The two disagree — a cold `docker compose up` replays the whole topic; a supervisor-driven resubmit does not. |
| Offset reset (other alarm sources) | `operator-actions` / `ack-results`: committed-with-earliest-fallback (`OpcEventStreamJob.java:201-202`). `IoTDBPersistenceJob`: committed-with-earliest (`:53-54`). `LiveStateJob`, `AlarmKpiStreamJob`, `AlarmStateExportJob`: **`latest()`** (`LiveStateJob.java:57`, `AlarmKpiStreamJob.java:46`, `AlarmStateExportJob.java:48`) — a restart loses everything produced while they were down. |
| Duplicate-job protection | Supervisor counts copies and refuses to stack a second one, logging loudly (`flink-job-supervisor.sh:68-80`); `flink-submit-raw-alarms.sh:35-39` and the live-state/iotdb scripts have similar guards (the latter two grep for `"(RUNNING)"` only, so they can double-submit a `RESTARTING` job — `flink-submit-live-state.sh:25-30`, `flink-submit-iotdb-persistence.sh:34-39`) |
| At-least-once duplication window | up to one checkpoint interval: 30 s (`OpcEventStreamJob`, `LiveStateJob`, `AlarmStateExportJob`), 60 s (`IoTDBPersistenceJob`, `AlarmKpiStreamJob`) |
| Restart strategy | **not configured** — see F-13 |
| Backpressure / poison isolation | none — see §3.9 |

---

## 7. Summary scorecard

| Capability | Verdict |
|---|---|
| Event ingest → normalisation → projection | **Implemented** and running |
| ISA-18.2 two-state condition machine (Active/Cleared + ack bit) | **Implemented** |
| ISA-18.2 full state model (RTN-Unack, Shelved, Suppressed, OOS, Latched) | **Missing** in Flink (RTN-Unack is actively broken — F-01) |
| ACK write-back orchestration in Flink | **Implemented** — `operator-actions` → `ack-writeback` and `ack-results` → projection both exist in `OpcEventStreamJob`; the DCS hop itself is .NET |
| Deduplication | **Implemented**, over-aggressive (F-07), unbounded state (F-14) |
| Flood detection | **Placeholder** — a severity high-pass that deletes critical alarms (F-04) |
| Chattering detection | **Missing** |
| Correlation / root cause | **Placeholder** — hardcoded tag-word matching, no CEP |
| SOE ordering | **Placeholder** — no-op operator |
| Deduplication metrics / observability of drops | **Missing** |
| DLQ / side outputs / poison handling in Flink | **Missing entirely** (0 `OutputTag` in the codebase) |
| NAMUR NE107 quality mapping | **Missing** — `quality` hardcoded to `192` |
| Exactly-once end to end | **Not achieved** — sinks are `AT_LEAST_ONCE` (F-11) |
| Historian durability | **Implemented well** — `FailLoudIoTDBSink` is a genuine no-loss seam |
| Compacted-topic key discipline | **Implemented** via `KafkaSinks`, one semantic break (F-02) |
