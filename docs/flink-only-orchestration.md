# Flink-Only Authoritative Orchestration

AMS operates in **Flink-only** mode. The .NET `AlarmStreamProcessorService`, `GatewayBufferIngestService`, and `AckSlaWatchdogService` are not registered at runtime.

## Pipeline

```
OPC-AE / DCS
  → AMS Edge Gateway
  → raw-opc-events
  → Apache Flink
  → current-alarm-state / lifecycle-events / soe-events
  → AMS API projection consumers
  → PostgreSQL
  → SignalR
  → React AG Grid UI
```

## ACK flow

```
Operator ACK → API (operator-actions only, no SQL)
  → Flink ACK orchestrator
  → ack-writeback → Gateway → OPC AckCondition()
  → ack-results → Flink reconciliation
  → current-alarm-state + lifecycle-events
  → SignalR → UI
```

## Configuration (required)

```json
"Kafka": {
  "UseFlinkOrchestration": true,
  "LabDirectIngest": false,
  "IngestAuthority": "gateway"
}
```

## Start Flink job

From repo root:

```powershell
. .\scripts\lib\AmsFlinkJob.ps1
Ensure-AmsFlinkAlarmJob -JarHostPath ".\src\flink\target\ams-flink-1.0-SNAPSHOT.jar"
```

Before redeploy: `flink stop --savepointPath <path> <jobId>` — do not hot-redeploy active jobs.

## Topic ownership

| Topic | Owner |
|-------|--------|
| raw-opc-events | Gateway |
| operator-actions | API |
| lifecycle-events | Flink |
| current-alarm-state | Flink |
| ack-writeback | Flink |
| ack-results | Gateway |

## API responsibilities

- **Commands:** publish to Kafka only (ACK via `operator-actions`).
- **Queries:** read projection DB only.
- **Consumers:** `NormalizedAlarmConsumerService`, `LifecycleEventConsumerService` (projection from Flink outputs).
