# AMS Production Validation Architecture

**Objective:** All alarm processing flows through **Real OPC → Kafka → Flink → PostgreSQL → UI**. No simulator bypass. Flink UI and Infrastructure Ribbon show actual throughput.

Related: [ams-alarm-architecture.md](ams-alarm-architecture.md) · [production-contracts.md](production-contracts.md)

---

## Target architecture

```text
Local OPC UA Server          Remote OPC UA Server         Remote OPC A&E Server
opc.tcp://localhost:4840     opc.tcp://192.168.x.x:4840   ProgID + Host + Credentials
        │                              │                            │
        └──────────────────────────────┴────────────────────────────┘
                                       │
                                       ▼
                          OPC Ingestion Service (Gateway)
                          Administration → OPC Servers (PostgreSQL config)
                                       │
                                       ▼
                            raw-opc-events (Kafka)
                                       │
                                       ▼
                              Apache Flink Job
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
                    ▼                  ▼                  ▼
              validation        deduplication       enrichment
                    │                  │                  │
                    └──────────┬───────┴──────────────────┘
                               ▼
                    SOE ordering → Lifecycle → Flood → KPI → CEP/RCA
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
        PostgreSQL      Kafka fanout       root-cause-events
     alarm_current    alarm-created/updated/cleared
     alarm_history    current-alarm-state
     alarm_state_transitions  lifecycle-events
                               │
                               ▼
                          ASP.NET API (read-only projection + ACK commands)
                               │
                               ▼
                          SignalR → React UI
```

---

## Mandatory data chain (no bypass)

| Step | Requirement | Enforcement |
|------|-------------|-------------|
| 1 | UI alarm must exist in Kafka | Gateway publishes `raw-opc-events` only |
| 2 | Kafka alarm must exist in Flink | `flink-ams-raw-opc-events` consumer group LAG=0 |
| 3 | Flink alarm must exist in PostgreSQL | JDBC sinks only — `OpcGateway:EnableRawEventIngest=false` |
| 4 | PostgreSQL alarm must exist in UI | API reads `alarm_current`; SignalR from Flink Kafka fanout |

**Health check fails if:**

- `OpcGateway:EnableRawEventIngest=true` (API bypass)
- `LabAckSimulator:Enabled=true` (fake ACK)
- `Kafka:LabDirectIngest=true`

---

## Flink job: `AMS - Alarm State Machine`

Entry class: `com.ams.flink.OpcEventStreamJob`

### Per-operator parallelism (no global parallelism)

| Operator | Default parallelism | Env arg |
|----------|--------------------|---------|
| raw-opc-source | 4 | `--parallelism.raw-ingest 4` |
| validation | 4 | `--parallelism.validation 4` |
| deduplication | 4 | `--parallelism.dedup 4` |
| enrichment | 4 | `--parallelism.enrichment 4` |
| soe-ordering | 2 | `--parallelism.soe 2` |
| lifecycle-engine | 2 | `--parallelism.lifecycle 2` |
| flood-detection | 1 | `--parallelism.flood 1` |
| kpi-aggregation | 1 | `--parallelism.kpi 1` |
| root-cause-analysis | 2 | `--parallelism.cep 2` |
| ack-processor | 2 | `--parallelism.ack-results 2` |
| postgres sinks | 2 | `--parallelism.current-sink 2` |
| signalr/kafka sinks | 2 | `--parallelism.history-sink 2` |

### Metrics

Each processing operator registers Flink counters:

- `records_in` / `records_out` (custom)
- `numRecordsIn` / `numRecordsOut` (Flink built-in via REST API)

Pipeline health API aggregates:

- `flink.recordsReceived` — sum of operator `numRecordsIn`
- `flink.recordsSent` — sum of operator `numRecordsOut`
- `flink.rawOpcEventsProcessed` — Kafka offset for `flink-ams-raw-opc-events`
- `flink.operators[]` — per-operator breakdown

---

## Acknowledgement flow (no optimistic ACK)

```text
UI → POST /api/v1/alarms/acknowledge/batch
  → operator-actions (Kafka)
  → Flink ack-processor
  → ack-writeback (Kafka)
  → OPC Gateway AckCondition()
  → ack-results (Kafka)
  → Flink ack-results + AckFlinkBridge
  → PostgreSQL ack_status=true
  → alarm-acknowledged → SignalR → UI
```

No direct SQL ACK. No `LabAckSimulator`.

---

## OPC server configuration

**Administration → OPC Servers** stores in `configuration.opc_connections`:

| Type | Fields |
|------|--------|
| Local OPC UA | `opc.tcp://localhost:4840` |
| Remote OPC UA | `opc.tcp://192.168.x.x:4840` |
| Remote OPC A&E | ProgID, Server, Host, Credentials |

API: `OpcConnectionsController` — Connect, Disconnect, Browse, Test Connection.

---

## Infrastructure ribbon (React)

Displays live metrics from `/api/v1/health/pipeline`:

| Ribbon item | Source |
|-------------|--------|
| Kafka | `brokerHealth`, `lag` (raw-opc-events), `throughput` |
| Flink | `status`, `recordsReceived`, `recordsSent` |
| OPC | `opcConnections.activeConnections` |
| Postgres | `queryLatencyMs` |

**Operator Control Center** shows per-operator Flink throughput.

---

## Validation commands

```powershell
# Build and submit production Flink job
.\scripts\stabilize-ams-e2e.ps1 -ForceResubmit

# Full acceptance report
.\scripts\production-validation-report.ps1

# E2E ACK test (real OPC)
.\scripts\test-full-pipeline-e2e.ps1
```

---

## Acceptance criteria checklist

| # | Criterion | Verification |
|---|-----------|--------------|
| 1 | Real OPC alarms in Kafka | `kafka-consumer-groups --group flink-ams-raw-opc-events` |
| 2 | Kafka messages in Flink | `flink.recordsReceived > 0` in health API |
| 3 | Flink operators non-zero | `flink.operators[].recordsIn > 0` |
| 4 | PostgreSQL populated by Flink only | `EnableRawEventIngest=false`, rows in `alarm_current` |
| 5 | UI from API/SignalR only | No ingest hub bypass |
| 6 | ACK reaches OPC server | Gateway log `DCS ACK confirmed` |
| 7 | ACK_CONFIRMED in UI | DB `ack_status=true` persists after ingest |
| 8 | No simulated alarms | `LabAckSimulator=false` |
| 9 | Local OPC tested | Gateway connected to localhost server |
| 10 | Remote OPC tested | Multi-server connections in `opc_connections` |
| 11 | Flink UI throughput | Checkpoint enabled; REST metrics non-zero |

---

## Report output fields

`production-validation-report.ps1` produces:

- Kafka topic rates (`rawOpcEventsProcessed`, lag)
- Flink operator metrics (per-operator in/out)
- OPC connection health
- PostgreSQL write verification
- Acceptance PASS/FAIL summary
- JSON report in `reports/production-validation-*.json`

---

## Deployment configuration (docker-compose)

```yaml
LabAckSimulator__Enabled: "false"
OpcGateway__EnableRawEventIngest: "false"
OpcGateway__EnableDynamicOpcSyncForAllAlarms: "false"
Kafka__UseFlinkOrchestration: true
```

Gateway on Windows host:

```powershell
$env:Kafka__BootstrapServers='127.0.0.1:9093'
.\scripts\start-opc-gateway-lab.ps1
```

---

*Document version: 2026-06-08*
