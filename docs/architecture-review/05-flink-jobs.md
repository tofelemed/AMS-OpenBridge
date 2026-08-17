# 05 — Flink Jobs

| Item | Value |
|---|---|
| Module | `src/flink` |
| Artifact | `src/flink/target/ams-flink-1.0-SNAPSHOT.jar` |
| Flink | 1.18.1 / Java 11 |
| Default shade main | `com.ams.flink.OpcEventStreamJob` |
| Build | `.\scripts\build-flink-jar.ps1` or `mvn -f src/flink/pom.xml package` |

**Postgres:** no Flink job writes Postgres. Projection is .NET consumers.  
**IoTDB:** only `IoTDBPersistenceJob` writes from Flink.

---

## Standing jobs (supervisor = source of truth)

Script: `infra/docker/flink-job-supervisor.sh` (every 60s). **TEN** standing jobs since
STR-07/STR-08 (this doc previously said seven — stale).

| # | Display name | Class | In → Out | Checkpoint |
|---|---|---|---|---|
| 1 | AMS - Alarm State Machine | `OpcEventStreamJob` | `raw-alarms`,`operator-actions`,`ack-results` → `lifecycle-events`,`current-alarm-state`,`ack-writeback`,`root-cause-events` | EXACTLY_ONCE 30s |
| 2 | AMS - IoTDB Alarm Persistence | `IoTDBPersistenceJob` | `raw-alarms` → IoTDB (via `FailLoudIoTDBSink` — a failed write fails the checkpoint, PIPE-014) | AT_LEAST_ONCE 60s |
| 3 | AMS - Live State RBE | `LiveStateJob` | `current-alarm-state` → `live.alarms`,`live.alarm.metrics` (keyed by alarmId) | AT_LEAST_ONCE 30s |
| 4 | AMS - CPLM Short Feature Engine | `CplmShortFeatureStreamJob` | `loop.samples.v1` → `clpm.feature.short.v1` | EXACTLY_ONCE 180s |
| 5 | AMS - CPLM Long Diagnostics Engine | `CplmLongDiagnosticsStreamJob` | same → `clpm.feature.long.v1` | EXACTLY_ONCE 300s |
| 6 | AMS - CPLM Gate Fusion Engine | `CplmGateFusionStreamJob` | short+long → `clpm.gate.results.v1` | EXACTLY_ONCE 180s |
| 7 | AMS - Loop Live RBE Engine | `LoopLiveRbeJob` | `loop.samples.v1` → `live.loop.metrics` (keyed by loopId) | EXACTLY_ONCE 60s |
| 8 | AMS - Analysis Execution Engine | `AnalysisExecutionJob` | `analysis.executions` → `analysis.results` | (STR-07) |
| 9 | AMS - Alarm KPI Engine | `AlarmKpiStreamJob` | KPI topics incl. compacted `kpi-standing-snapshots` | EXACTLY_ONCE 60s (STR-08) |
| 10 | AMS Alarm State Export Engine | `AlarmStateExportJob` | `current-alarm-state` → `flink.state.alarm.delta` | no CP (STR-08) |

CPLM args always pass `--input-topic loop.samples.v1` (compiled default topic is dead).
The state machine runs with `--raw-alarms.starting-offsets committed` (committed-with-
earliest-fallback): fresh submits resume where the consumer group left off instead of
replaying the whole topic. `scripts/ensure_flink_jobs.py` CORE_JOBS mirrors this list.

```mermaid
flowchart TB
  subgraph Alarm["Alarm path"]
    RA[raw-alarms] --> SM[OpcEventStreamJob]
    SM --> CAS[current-alarm-state]
    SM --> LC[lifecycle-events]
    CAS --> LS[LiveStateJob]
    LS --> LIVE[live.alarms / live.metrics]
    RA --> IOTJ[IoTDBPersistenceJob]
  end
  subgraph CPLM["CPLM path"]
    LSAMP[loop.samples.v1] --> SHORT
    LSAMP --> LONG
    LSAMP --> LRBE[LoopLiveRbeJob]
    SHORT --> FUS
    LONG --> FUS
    FUS --> GATES[clpm.gate.results.v1]
  end
```

---

## Alarm state machine (`OpcEventStreamJob`)

Pipeline operators (`PipelineOperators.java`):

```
raw-alarms → Validation → Dedup → Enrichment → SOE order → Lifecycle → Correlation → FloodDetect → sinks
```

Keyed state highlights:

| Operator | State | Behavior |
|---|---|---|
| DedupFilter | lastEventTime, active, ack | Drop same-ts dup unless active/ack changes |
| LifecycleMap | prevLifecycle, prevAck | NEW / ACTIVE / CLEARED; OPC ack authoritative |
| FloodDetectFilter | — | Drop severity ≥ 950 |
| RootCauseMap | — | Heuristic → `root-cause-events` |

ACK branch: `operator-actions` → `ack-writeback`; `ack-results` → state update.

---

## How jobs are submitted

| Mechanism | What |
|---|---|
| **JM HA (2026-08-17)** | ZooKeeper-backed HA (`high-availability.type: zookeeper`, storageDir on MinIO s3). A JobManager restart now RECOVERS every job from its latest checkpoint — the supervisor is liveness backstop, not the recovery mechanism |
| One-shot containers | `flink-job-submit*` (`restart: "no"`) — presence guards count recovery states, not just RUNNING |
| Supervisor | Backstop resubmission of the 10 standing jobs; counts CREATED/INITIALIZING/RESTARTING/RECONCILING as present |
| Host | `scripts/ensure_flink_jobs.py` (mirrors the supervisor's 10) |
| PowerShell | `scripts/lib/AmsFlinkJob.ps1` (manual KPI helpers — normally unneeded now) |
| cplm-api | Submits `CplmHistoricalReplayJob` on recompute |

Typical:

```text
flink run -d -m ams-flink-jobmanager:8081 -c <Class> /opt/flink/usrlib/ams-flink-1.0-SNAPSHOT.jar --bootstrap.servers kafka:9092 …
```

Cluster defaults (compose `FLINK_PROPERTIES`): RocksDB incremental, checkpoint dir `file:///flink-checkpoints`, interval 60s, mode EXACTLY_ONCE.

**Caveat:** no Kafka sink `setDeliveryGuarantee` in code → Kafka delivery remains at-least-once even when checkpoint mode is EXACTLY_ONCE.

---

## On-demand jobs

| Class | Trigger | Notes |
|---|---|---|
| `CplmHistoricalReplayJob` | cplm-api recompute | BATCH; bounded historical gates |
| `AlarmReplayEngine` | AMS.Api FlinkRestClient | Topics `alarm.events.raw` → `flink.state.alarm.replay` (stale names vs live) |

---

## Present but not auto-submitted

| Class | Status |
|---|---|
| `CplmGateStreamJob` | **Forbidden** — would double-write gate results |
| `LoopKpiStreamJob` | Manual; superseded directionally by CPLM |
| `StateDriftDetectionJob` | Stale topic names (`alarm.events.raw`) |

(`AlarmKpiStreamJob`, `AlarmStateExportJob`, `AnalysisExecutionJob` moved into the
supervisor's standing set — STR-07/STR-08.)

CLI-only (not cluster): `SynTic001CliValidator`, `CplmWindowCertificationCli`, `SynTic001ReferenceGenerator`.

---

## Ops checklist

1. Build JAR before `docker compose up` Flink submit/supervisor.
2. UI: http://localhost:8082 — expect 10 RUNNING.
3. After JM crash: **HA recovers all jobs from checkpoints** (same job ids, state intact);
   the supervisor only resubmits if recovery genuinely lost one.
4. Never run `CplmGateStreamJob` alongside fusion trio.
5. Never run CPLM consumers in both ams-api and cplm-api.
6. Never submit jobs by hand while the supervisor runs — it already owns all 10
   (hand-submits create duplicate consumers; observed 2026-08-13).
