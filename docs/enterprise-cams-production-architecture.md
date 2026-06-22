# AMS Enterprise CAMS — Production Architecture & DCS Readiness

## Executive summary

AMS Enterprise CAMS is an event-sourced industrial alarm management platform for DCS integration, ISA-18.2 workflows, and high-volume OT telemetry. The authoritative path is:

- **Kafka** — event log
- **Apache Flink** — sole lifecycle / ACK orchestration engine
- **OPC Edge Gateway** — native OPC-AE COM (no QuickOPC)
- **API** — query + command publish only (no direct ACK SQL)
- **PostgreSQL** — materialized projection
- **SignalR + React AG Grid** — operator UI with delta updates

Related runbooks:

- [Flink-only orchestration](flink-only-orchestration.md)
- [E2E stabilization & OPC ACK validation](e2e-stabilization.md)

---

## 1. Authoritative architecture

```text
┌────────────────────────────────────────────┐
│          LEVEL 0 / LEVEL 1 OT             │
│ DCS / PLC / OPC-AE Simulator / OEM System │
└────────────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────┐
│      AMS OPC EDGE GATEWAY (.NET 8)        │
│ Native OPC COM Interop (no QuickOPC)      │
│ SQLite WAL buffer · SOE capture             │
│ Kafka producer (idempotent)               │
│ ack-writeback consumer → AckCondition     │
└────────────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────┐
│                APACHE KAFKA               │
│ raw-opc-events · operator-actions         │
│ lifecycle-events · ack-writeback          │
│ ack-results · current-alarm-state         │
└────────────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────┐
│          APACHE FLINK STATE ENGINE         │
│ Normalize · dedupe · SOE · enrich           │
│ ACK orchestration · KPI · flood detect    │
│ (CEP correlation — staged)                │
└────────────────────────────────────────────┘
          ┌───────────┴───────────┐
          ▼                       ▼
┌──────────────────┐   ┌────────────────────┐
│ PostgreSQL       │   │ SignalR hub        │
└──────────────────┘   └────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────┐
│            REACT + AG GRID UI             │
└────────────────────────────────────────────┘
```

---

## 2. OPC edge gateway

### 2.1 QuickOPC removed

Gateway uses native OPC Foundation COM (`IOPCEventServer`, subscriptions, `AckCondition`). No QuickOPC runtime.

### 2.2 Responsibilities

| Area | Responsibility |
|------|----------------|
| Ingest | Subscribe OPC-AE, normalize, publish `raw-opc-events` |
| Reliability | SQLite WAL, store-and-forward |
| ACK | Consume `ack-writeback`, `AckCondition`, publish `ack-results` |
| Health | OPC, Kafka, WAL backlog |

### 2.3 Producer guarantees

```json
{
  "EnableIdempotence": true,
  "Acks": "All",
  "MaxInFlight": 1
}
```

---

## 3. Flink — authoritative state machine

### 3.1 No direct DB ACK mutations

All ACK logic:

```text
UI → operator-actions → Flink → ack-writeback → Gateway → OPC
  → ack-results → Flink → current-alarm-state + lifecycle-events → SignalR → UI
```

`.NET AlarmStreamProcessorService` is **not** registered when `UseFlinkOrchestration: true`.

### 3.2 Lab parallelism (default)

| Stage | Parallelism |
|-------|-------------|
| Ingest / validation | 2 |
| Dedup / SOE / enrich | 2 |
| ACK orchestration | 2 |
| ACK results / sinks | 2 |

### 3.3 Checkpointing & restart

```java
env.enableCheckpointing(10_000, CheckpointingMode.EXACTLY_ONCE);
env.setRestartStrategy(RestartStrategies.fixedDelayRestart(5, Time.seconds(10)));
```

RocksDB state backend; checkpoint dir `file:///opt/flink/checkpoints` (lab) or PVC (K8s).

### 3.4 Kafka consumer hardening

```properties
request.timeout.ms=60000
session.timeout.ms=45000
heartbeat.interval.ms=15000
max.poll.interval.ms=300000
partition.discovery.interval.ms=30000
```

ACK topics use `committed-earliest` on first deploy so unprocessed commands are not skipped after Flink restarts.

### 3.5 Lab topic partitions

| Topic | Partitions |
|-------|------------|
| raw-opc-events | 8 |
| operator-actions | 4 |
| ack-writeback | 2 |
| ack-results | 2 |
| current-alarm-state | 8 |
| lifecycle-events | 4 |

Recreate with: `scripts/kafka-reset-lab-topics.ps1 -Force`

---

## 4. ACK lifecycle model

```text
ACK_REQUESTED → ACK_QUEUED → ACK_PROCESSING → ACK_DISPATCHED
  → ACK_PENDING_DCS → ACK_CONFIRMED
```

Failures: `ACK_FAILED`, `ACK_TIMEOUT`

### Production rule

An alarm is **not** acknowledged in AMS unless:

1. Valid **`opcAttributes.cookieOffset`** from live OPC ingest
2. Flink emits **`ack-writeback`**
3. Gateway **`AckCondition`** succeeds
4. **`ack-results`** → Flink reconciliation → **`ACK_CONFIRMED`**

Ingest **must not** treat OPC `wNewState` ack bit as operator ACK (implemented in `RawOpcNormalizer` + `NormalizedAlarmIngestor`).

---

## 5. AG Grid & SignalR

- High-volume: `getRowId`, `immutableData`, SignalR deltas (target: `applyTransactionAsync` for row churn — see gap table below)
- No optimistic `ACK_CONFIRMED` in UI; lifecycle from hub only
- Live event stream, ACK badges, infrastructure ribbon, KPI bar

---

## 6. CEP & root cause (staged)

`AlarmCepProcessor` exists but is **not wired** in `OpcEventStreamJob` (placeholder pass-through). Plant topology tables and `root-cause-events` consumer in notification-service are prepared for a later phase.

---

## 7. Production infrastructure

Helm charts include PDBs and HPAs (`infra/helm/ams/templates/`). Full OT zero-trust network policies are deployment-specific.

---

## 8. Production acceptance criteria

Run:

```powershell
.\scripts\validate-ams-production-ack.ps1
```

Or full stabilization:

```powershell
.\scripts\stabilize-ams-e2e.ps1 -ResetKafkaTopics
```

| Gate | Requirement |
|------|----------------|
| Telemetry | `raw-opc-events` flowing; sample has `cookieOffset > 0` |
| API | At least one active FIC/PVLEVEL alarm with `cookieOffset > 0` |
| ACK | `ACK_DISPATCHED` then `ACK_CONFIRMED` on `lifecycle-events` |
| Flink | Job RUNNING, no root exception in JobManager |
| UI | SignalR lifecycle only; no fake ack from OPC ingest |
| OPC | Gateway `AckCondition` after `ack-writeback` |

---

## 9. Architectural decisions (confirmed)

| Decision | State |
|----------|--------|
| QuickOPC | Removed |
| Native COM interop | Enabled |
| Flink orchestration | Authoritative |
| Direct SQL ACK | Forbidden (shelve/suppress still direct SQL — see gaps) |
| SignalR optimistic ACK | Forbidden |
| SQLite WAL | Required on gateway |
| Kafka event sourcing | Required |
| Demo/storm injectors | Filtered in UI; purge API available |

---

## 10. Implementation vs target — honest gap table

Use this when reviewing “READY” claims against the lab environment.

| Area | Target | Current implementation |
|------|--------|-------------------------|
| Flink ACK path | End-to-end `ACK_CONFIRMED` | **Proven:** API → `operator-actions`. **Blocked without cookie:** `ack-writeback` / OPC |
| `cookieOffset` | > 0 on live alarms | **Often 0** until simulator + live `raw-opc-events` repopulate DB |
| Flink stability | RUNNING, no metadata storms | **Improved** (8-partition topics, consumer timeouts); reset topics after change |
| CEP / `root-cause-events` | Enabled | **Stub** — processor not connected in Flink job |
| AG Grid `applyTransactionAsync` | Delta-only updates | **`immutableData` + hub updates**; explicit `applyTransactionAsync` not wired |
| K8s / Redis Sentinel | Full HA | **Helm scaffolding**; lab uses Docker Compose |
| Shelve / suppress | Kafka command path | **Still direct SQL** in API handlers |

**Architecture** is production-grade and deterministic by design. **DCS sign-off** requires passing `validate-ams-production-ack.ps1` under live OPC load.

---

## 11. Final recommendation

The platform is structurally ready for:

- Live DCS / simulator validation
- ISA-18.2 operator workflows
- Deterministic ACK orchestration (Flink-only)
- High-volume ingest (with lab partition tuning)

Remaining work is **operational proof**: sustained telemetry, cookie propagation, full ACK loop, failure injection, and load tests (17k alarms / 100k events/min per validation phases in project scripts).

Do **not** re-enable .NET stream orchestration, bypass Flink, or mutate ACK state in SQL for production ACK paths.
