# Kafka + Flink Stabilization (Production Hardening)

Lab-scale partition counts, Flink checkpoint/restart hardening, `cookieOffset` end-to-end propagation, and pipeline health metrics for ISA-18.2 / DCS validation.

## Implementation status

| Area | Target | Status | Location |
|------|--------|--------|----------|
| Topic partitions (lab) | 8/4/2 per plan | Done | `infra/docker/docker-compose.yml`, `scripts/kafka-reset-lab-topics.ps1` |
| Retention policies | 7d, segment 1h, min ISR 1 | Done | Same + compact for `current-alarm-state` |
| `root-cause-events` | 2 partitions | Done | docker-compose + reset script |
| Kafka consumer timeouts | 60–120s lab-tuned | Done | `KafkaSourceFactory.java` |
| Restart strategy | fixedDelay 5×10s | Done | `OpcEventStreamJob.java` |
| Checkpoint hardening | 10s, min pause 5s, timeout 60s, tolerate 5 | Done | `OpcEventStreamJob.java` |
| RocksDB state backend | enabled | Done | `OpcEventStreamJob.java` |
| Local checkpoint storage | `file:///opt/flink/checkpoints` | Done | `OpcEventStreamJob.java` |
| Stage parallelism | ingest/validate/dedup/CEP/lifecycle=2, KPI=1, sink=2 | Done | `JobConfig.java`, `OpcEventStreamJob.java`, `AmsFlinkJob.ps1` |
| Explicit source parallelism | raw-opc ingest = 2 | Done | `OpcEventStreamJob.java` |
| `cookieOffset` in Flink | Raw → Normalized → state msg | Done | `RawOpcNormalizer`, `CurrentAlarmStateMsg` |
| `opcAttributes.cookieOffset` | nested JSON for API | Done | `CurrentAlarmStateMsg.java` |
| Backend cookie parse | flat + nested | Done | `NormalizedAlarmEventJson.cs` |
| Postgres JSONB projection | `MergeOpcAttributes` | Done | `NormalizedAlarmIngestor.cs` |
| Consumer lag metric | backend group on `current-alarm-state` | Done | `PipelineHealthService.cs` |
| Ribbon indicators | Kafka lag, checkpoint latency | Done | `App.tsx` |
| ACK lifecycle (Flink-only) | no SQL shortcuts | Done | prior session |
| Gateway `ack-results` → `ACK_CONFIRMED` | OPC AckCondition | **Open** | `AckWritebackConsumerService.cs` |
| Deterministic replay gate | 17k+ alarm acceptance | **Open** | `validate-ams-production-ack.ps1` |

## Kafka topology (lab)

| Topic | Partitions | Retention |
|-------|------------|-----------|
| raw-opc-events | 8 | 7d, delete, lz4 |
| current-alarm-state | 8 | 7d, compact |
| operator-actions | 4 | 7d, delete |
| lifecycle-events | 4 | 7d, delete |
| ack-writeback | 2 | 7d, delete |
| ack-results | 2 | 7d, delete |
| root-cause-events | 2 | 7d, delete |

### Reset topics (destructive)

```powershell
.\scripts\kafka-reset-lab-topics.ps1 -Force
.\scripts\stabilize-ams-e2e.ps1
```

## Flink parallelism model

| Stage | Parallelism |
|-------|-------------|
| raw-opc ingest | 2 |
| validation / dedup / SOE / CEP / lifecycle | 2 |
| KPI aggregation | 1 |
| DB + current-alarm-state sinks | 2 |
| ACK orchestrator | 1 (lab) |
| ack-results reconciler | 1 (lab) |

Program args are set in `scripts/lib/AmsFlinkJob.ps1`.

## cookieOffset propagation

```text
OPC event (cookieOffset)
  → raw-opc-events
  → RawOpcNormalizer
  → CurrentAlarmStateMsg { cookieOffset, opcAttributes: { cookieOffset, ... } }
  → current-alarm-state
  → NormalizedAlarmEventJson (flat or nested)
  → ActiveAlarm.MergeOpcAttributes → Postgres JSONB
  → operator ACK → ack-writeback (requires cookieOffset > 0)
```

## ACK lifecycle (deterministic)

```text
ACK_REQUESTED → ACK_QUEUED → ACK_PROCESSING → ACK_DISPATCHED
  → ACK_PENDING_DCS → ACK_CONFIRMED
```

Rules:

1. AG Grid rows are not mutated locally for ACK state.
2. Only SignalR deltas update ACK columns.
3. `ACK_CONFIRMED` only after OPC `AckCondition` success and `ack-results` event.

## Health ribbon

`GET /api/v1/health/pipeline` exposes:

- **Kafka**: broker health + consumer lag (`ams-backend-v2` on `current-alarm-state`)
- **Flink**: latest checkpoint end-to-end duration, restart task count
- **Gateway**: OPC connected, WAL queue size

UI ribbon (`App.tsx`): `Kafka: Healthy · Lag: 0`, `Checkpoint: 2.1s`, `Gateway: Connected`.

## Production readiness gate

Full pipeline must run without restart loops, stale state, duplicate ACK, or optimistic UI ACK:

```text
OPC → Kafka → Flink → current-alarm-state → API/SignalR → operator-actions
  → Flink lifecycle → ack-writeback → OPC AckCondition → ack-results → ACK_CONFIRMED
```

**ACK terminal states** (`ACK_CONFIRMED`, `ACK_FAILED`) are owned exclusively by `AckResultReconciler` consuming `ack-results`. The orchestrator must not emit `ACK_TIMEOUT` via a processing-time timer — that races with gateway confirmation and can overwrite a successful ACK.

Validate with:

```powershell
.\scripts\validate-ams-production-ack.ps1
```

All phases including `ACK_CONFIRMED` and `cookieOffset > 0` must PASS.

## Related docs

- [E2E stabilization](./e2e-stabilization.md)
- [Enterprise CAMS architecture](./enterprise-cams-production-architecture.md)
