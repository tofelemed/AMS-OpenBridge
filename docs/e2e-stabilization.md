# AMS E2E Stabilization & OPC ACK Validation

See also: [Kafka + Flink stabilization](./kafka-flink-stabilization.md) (production hardening checklist).

Flink remains the **only** authoritative lifecycle engine. No direct SQL ACK, no optimistic UI confirm.

## Target flow

```
UI ACK → operator-actions → Flink → ack-writeback → OPC Gateway AckCondition(cookie)
       → ack-results → Flink → current-alarm-state → SignalR → UI ACK_CONFIRMED
```

## Lab Kafka partitions (reduced metadata load)

| Topic | Partitions |
|-------|------------|
| raw-opc-events | 8 |
| operator-actions | 4 |
| ack-writeback | 2 |
| ack-results | 2 |
| current-alarm-state | 8 |
| lifecycle-events | 4 |
| root-cause-events | 2 |

Existing clusters with 64-partition topics must run:

```powershell
.\scripts\kafka-reset-lab-topics.ps1 -Force
```

## Flink settings (in JAR)

- Checkpointing: 10s, EXACTLY_ONCE, RocksDB
- Restart: fixed-delay 5 × 10s
- Kafka consumer: 60s request timeout, 30s partition discovery, 45s session timeout
- `operator-actions` / `ack-results`: `committed-earliest` (process backlog after restart)
- `raw-opc-events`: `latest` (steady-state ingest)

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/stabilize-ams-e2e.ps1` | Build Flink, deploy job, run validation |
| `scripts/kafka-reset-lab-topics.ps1` | Recreate topics with lab partitions |
| `scripts/e2e-full-system-test.ps1` | **Full E2E** orchestrator — [e2e-testing-plan.md](./e2e-testing-plan.md) |
| `scripts/ams-contract-validation-agent.ps1` | Contract health + violation agent |
| `scripts/validate-ams-production-ack.ps1` | Full acceptance matrix |
| `scripts/test-full-pipeline-e2e.ps1` | Quick module-by-module test |

## Phase checklist

### 1 — Live OPC

- Integration Objects simulator running (FIC1001, PVLEVEL).
- Gateway: `telemetryPublish: true` at `http://127.0.0.1:5050/health/opc`.
- `raw-opc-events` contains `cookieOffset > 0`.

### 2 — Cookie in API

```powershell
$h = @{ Authorization = "Bearer dev" }
(Invoke-RestMethod "http://127.0.0.1:8000/api/v1/alarms/active?pageSize=50&isAcknowledged=false" -Headers $h).items |
  Where-Object { $_.opcAttributes.cookieOffset -gt 0 } |
  Select-Object -First 5 sourceName, id, @{N='cookie';E={$_.opcAttributes.cookieOffset}}
```

### 3 — ACK from UI

Only ack alarms with **cookieOffset > 0**. UI shows lifecycle: `ACK_REQUESTED` → … → `ACK_CONFIRMED` via SignalR only.

### 4 — Production ready

`ACK_CONFIRMED` must follow real OPC `AcknowledgeCondition`, not ingest auto-ack or SQL mutation.

## Acceptance

Run:

```powershell
.\scripts\stabilize-ams-e2e.ps1 -ResetKafkaTopics
```

All matrix rows **PASS** including `API cookieOffset > 0` and `Lifecycle ACK_CONFIRMED`.

## Troubleshooting `cookieOffset` missing in API (Kafka has it)

**CASE B** (confirmed): `current-alarm-state` JSON includes `"cookieOffset": <non-zero>` but `alarms.active_alarms.opc_attributes` only has `activeTimeEpochMs`.

Fix (backend): `NormalizedAlarmEventJson.Parse` re-reads `cookieOffset` from raw JSON; `NormalizedAlarmIngestor` applies cookie to **all** matching condition rows.

After deploying API:

1. Stop `AMS.Api`.
2. Replay projection (optional): reset `ams-backend` offsets on `current-alarm-state` to `earliest` while API is stopped.
3. Restart API with simulator + gateway connected; wait for new `current-alarm-state` messages.
4. Validate:

```powershell
$h = @{ Authorization = "Bearer dev" }
(Invoke-RestMethod "http://127.0.0.1:8000/api/v1/alarms/active?pageSize=20&isAcknowledged=false" -Headers $h).items |
  Where-Object { $_.opcAttributes.cookieOffset -gt 0 } |
  Select-Object sourceName, @{N='cookie';E={$_.opcAttributes.cookieOffset}}
```

## Troubleshooting `raw-opc-events` empty

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| Topic all `partition:0` after reset | Topics recreated; no new ingest yet | Start OPC simulator; wait for alarms |
| Gateway `isConnected: false`, `CO_E_SERVER_EXEC_FAILURE` | Simulator not running / COM blocked | Start Integration Objects OPC A&E Simulator on `127.0.0.1` |
| Gateway log `Message timed out` on publish | Kafka down or 64-partition metadata storm | `docker compose` healthy; `kafka-reset-lab-topics.ps1 -Force`; restart gateway |
| Buffer has `cookieOffset` but Kafka empty | Publish failed while broker unhealthy | Restart gateway after Kafka healthy; ensure simulator firing |
| Validation fails 8s consumer | No **new** messages in window | Use `validate-ams-production-ack.ps1` (tails topic) or check offsets |

Quick checks:

```powershell
Invoke-RestMethod http://127.0.0.1:5050/health/opc
Invoke-RestMethod "http://127.0.0.1:5050/opc/events/recent?sinceId=0&limit=3"
docker exec ams-kafka kafka-run-class kafka.tools.GetOffsetShell --broker-list localhost:9092 --topic raw-opc-events
```
