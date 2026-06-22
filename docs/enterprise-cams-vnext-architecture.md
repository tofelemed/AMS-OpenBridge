# AMS Enterprise CAMS vNext — Target Architecture

> Governed system of record: a contract-driven, replay-safe, event-sourced industrial state reconstruction engine with dual-identity temporal modeling and governed truth-resolution layers. Correctness = hard guarantees (Kafka/Flink/identity) + soft guarantees (ops discipline) + **continuous verification** (CI/E2E/readiness/reconstruction). See [production-contracts.md](./production-contracts.md) §0–§0.2.

**Two execution planes (§0.1):** **Production truth plane** (StreamPipes → Kafka → Flink → API/UI) and **Verification truth plane** (CI gate → E2E → readiness → reconstruction). The verification plane defines whether the production plane is considered correct — a closed semantic loop, not a linear pipeline.

**Authoritative OT layer:** Apache StreamPipes only. No QuickOPC, OPC Gateway, COM/DCOM, or local OPC runtime in AMS.

**Production ingest protocol:** **OPC UA Alarms & Conditions (OPC-UA-AC)** only. Classic **OPC-AE (COM/DCOM) is not supported** by StreamPipes and must not be used on the ingest path.

## Final target data plane

```text
┌────────────────────────────┐
│         DCS / PLC          │
└─────────────┬──────────────┘
              │
              ▼
┌────────────────────────────┐
│ OPC UA Alarms & Conditions │  ← production target (Option A)
└─────────────┬──────────────┘
              │
              ▼
┌────────────────────────────┐
│        StreamPipes         │
│  OPC UA adapter (ingest)   │
│  ACK pipeline (writeback)  │
└─────────────┬──────────────┘
              │
              ▼
┌────────────────────────────┐
│           Kafka            │  ← required; do NOT remove
├────────────────────────────┤
│ raw-opc-events             │
│ operator-actions           │
│ ack-writeback              │
│ ack-results                │
│ lifecycle-events           │
│ current-alarm-state        │
│ root-cause-events          │
└─────────────┬──────────────┘
              │
              ▼
┌────────────────────────────┐
│           Flink            │  ← sole state engine
├────────────────────────────┤
│ Validation · Deduplication │
│ SOE · Enrichment · CEP     │
│ Lifecycle · KPI · Flood    │
│ ACK Orchestration          │
└─────────────┬──────────────┘
              │
      ┌───────┴────────┐
      ▼                ▼
┌───────────┐   ┌────────────┐
│PostgreSQL │   │ SignalR    │
│TimescaleDB│   │ Live Delta │
└─────┬─────┘   └─────┬──────┘
      │               │
      └───────┬───────┘
              ▼
┌────────────────────────────┐
│         React UI           │
└────────────────────────────┘
```

**Coupled verification truth plane** (second operational plane — defines production correctness):

```text
         ┌──────────────────────────────────────┐
         │     VERIFICATION TRUTH PLANE          │
         ├──────────────────────────────────────┤
         │ CI gate → E2E → agent → readiness     │
         │ → incident reconstruction             │
         └─────────────────┬────────────────────┘
                           │ closed loop: defines "correct"
                           ▼
              production plane behavior
  Compile-time · runtime · readiness · forensic
  See production-contracts.md §0.1 · e2e-testing-plan.md
```

## ACK path (event-sourced, no optimistic UI)

```text
UI → operator-actions → Kafka → Flink Lifecycle Engine → ack-writeback
  → StreamPipes → DCS ACK (OPC UA write) → ack-results
  → Flink → ACK_CONFIRMED → current-alarm-state → SignalR → UI
```

## Why Kafka stays (not MQTT)

Flink is designed around **durable partitioned logs**. This platform uses:

- Event sourcing and replay
- CEP and root-cause correlation
- SOE ordering
- Flood detection and lifecycle tracking
- Exactly-once checkpoints with Kafka sources/sinks

MQTT is appropriate for **edge device → MQTT → Kafka bridge → Flink**, not **MQTT → Flink** for enterprise alarm management at scale.

## OPC-AE elimination (major gap)

| Path | Status |
|------|--------|
| OPC-UA / OPC-UA-AC → StreamPipes → Kafka | ✅ Supported |
| OPC-AE → StreamPipes | ❌ **Impossible** (no StreamPipes adapter) |
| IntegrationObjects.OPCAEServer.Simulator.1 | ❌ Cannot ingest via StreamPipes |

**Recommended (Option A):** Migrate plant to **OPC UA Alarms & Conditions**. Benefits: no COM/DCOM, Linux/K8s/cloud-native, fully StreamPipes-native.

Alternatives (not implemented in AMS):

- **Option B:** Windows edge bridge (COM OPC-AE → OPC UA) → StreamPipes
- **Option C:** Custom StreamPipes adapter (high effort)

AMS API **rejects new OPC-AE connections** with a migration message. Existing legacy rows remain visible but cannot Connect.

## OPC Connections (Administration → OPC Servers)

- API: `/api/v1/opc/connections`
- **Ingest protocols:** `OPC-UA`, `OPC-UA-AC`
- **Blocked:** `OPC-AE` (create/connect)
- On **Connect:** StreamPipes REST auto-provisions adapter + pipeline → `raw-opc-events`

## Production contracts (required before DCS)

See **[production-contracts.md](./production-contracts.md)** for the full distributed event-sourcing contract:

- Deterministic alarm instance key (`serverId|source|condition|subCondition` — **not** activeTime)
- Sink semantics table (Kafka EOS, PostgreSQL idempotent upsert, SignalR at-least-once)
- ACK identity & idempotency (`commandId`, `alarmId`)
- Kafka partition strategy (`serverId|sourceName` per asset)
- Event-time governance (watermarks, allowed lateness, late-event DLQ routing)
- DLQ operational workflow + `scripts/replay-kafka-dlq.ps1`
- StreamPipes key enforcement (no fallback keying)
- Flink state semantics (RocksDB, exactly-once, 7-day TTL)
- Security checklist (OPC UA certs, Kafka SASL/mTLS)

### Architecture review statement

> The architecture is structurally valid. Production readiness is determined by enforcement of deterministic contracts across ACK identity, per-asset ordering, Flink state semantics, event-time governance, DLQ/replay lifecycle, and strict limitation of StreamPipes to stateless ingestion and forwarding. The system's correctness depends on Kafka as the immutable event log, with Flink as the only stateful compute layer and all downstream systems operating under explicit idempotency and consistency contracts.

**Evolution risk** (DCS tag schema changes, OPC-UA restructuring, long-term key drift, delayed replay) is managed via versioned instance keys (`v1|…`), explicit conflict classification, Flink payload-derived re-keying (StreamPipes untrusted), and replay state merge rules — see [production-contracts.md](./production-contracts.md) §1, §2, §7–§8.

## Production readiness (assessment)

| Area | Score | Notes |
|------|-------|-------|
| StreamPipes integration | 90% | REST automation wired; tune node lists per DCS |
| Kafka architecture | 95% | Required backbone — keep |
| Flink architecture | 90% | Per-stage parallelism, RocksDB CP |
| Event sourcing | 95% | Kafka + Flink authoritative |
| ACK lifecycle | 85% | Needs `AckWriteNodeId` on real DCS |
| CEP correlation | 80% | Crusher/Conveyor/Feeder wired; topology broadcast pending |
| UI architecture | 90% | SignalR live delta |
| Historical replay | 85% | Transitions NDJSON export |
| OPC UA path | 90% | Production target |
| OPC-AE elimination | 40% | Blocked in API/UI; plant migration required |

**Overall ~90%** once DCS exposes OPC UA A&C.

## Lab startup

```powershell
.\scripts\start-ams-lab.ps1
```

Use **OPC-UA-AC** endpoint (or OPC-UA Milo/simulator with alarm nodes), not Integration Objects COM simulator for ingest.

## Acceptance (verification truth plane)

```powershell
# CI contract gate (every commit — compile-time enforcement)
bash scripts/ci-contract-gate.sh

# Full system E2E (recommended before DCS cutover — runtime enforcement)
.\scripts\e2e-full-system-test.ps1 -InjectLabEvents

# Cutover readiness scoring
.\scripts\ams-readiness-score.ps1 -RunFullE2E -InjectLabEvents

# Contract validation agent
.\scripts\ams-contract-validation-agent.ps1

# Incident reconstruction (forensic phase)
.\scripts\incident-reconstruct.ps1 -SourceName "Plant/Area/Tag" -HoursBack 24

# Smoke tests (Tests 1–7)
.\scripts\production-acceptance-test.ps1
```

See **[e2e-testing-plan.md](./e2e-testing-plan.md)** for the complete §0–§12 matrix.
