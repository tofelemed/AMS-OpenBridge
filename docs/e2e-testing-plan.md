# AMS End-to-End Testing Plan

Full system validation: ingestion → Flink → ACK → PostgreSQL → SignalR → UI projection → agent.

**Goal:** Prove the system is production-validated, contract-consistent, and replay-safe across the full event lifecycle.

See also: [production-contracts.md](./production-contracts.md), [e2e-stabilization.md](./e2e-stabilization.md)

---

## Quick start

```powershell
# 1. Start lab
.\scripts\start-ams-lab.ps1

# 2. Stabilize Flink + Kafka
.\scripts\stabilize-ams-e2e.ps1

# 3. Full E2E (recommended)
.\scripts\e2e-full-system-test.ps1 -InjectLabEvents

# 4. Contract agent only
.\scripts\ams-contract-validation-agent.ps1

# 5. Smoke acceptance (Tests 1–7)
.\scripts\production-acceptance-test.ps1
```

---

## 0. Goal

Validate that:

- Every alarm event is correctly ingested
- Identity + time + ACK rules are never broken
- Flink state is deterministic and replay-safe
- UI reflects backend truth (not stale or duplicated state)
- Agent can validate system health + correctness automatically

---

## 1. Pre-test environment

### 1.1 Required services

| Service | Check |
|---------|--------|
| OPC UA simulator / DCS | StreamPipes adapter connected |
| StreamPipes | UI `:8088`, backend `:8030` |
| Kafka | `ams-kafka` container, `:9092` |
| Flink | JobManager + taskmanagers |
| PostgreSQL | `ams-postgres` |
| AMS API | `http://127.0.0.1:8000/health` |
| React UI | `http://127.0.0.1:3000` (manual UI tests) |
| Validation agent | `ams-contract-validation-agent.ps1` |

### 1.2 Kafka topics

Must exist (created by lab scripts or E2E):

- `raw-opc-events`, `operator-actions`, `ack-writeback`, `ack-results`
- `lifecycle-events`, `current-alarm-state`, `root-cause-events`
- `raw-opc-events-dlq`, `ack-writeback-dlq`

**Automated:** `e2e-full-system-test.ps1` §1

### 1.3 Flink job

Single RUNNING job: **AMS - Event-Sourced Alarm State Machine** (`OpcEventStreamJob`)

Includes: Validation → Normalization → Event-Time Guard → Asset Re-Key → Dedup → SOE → Lifecycle ACK → Sinks

**Automated:** `Get-AmsFlinkAlarmJobs` in `lib/AmsFlinkJob.ps1`

---

## 2. Connection test (OPC → StreamPipes → Kafka)

| Step | Action | Pass criteria |
|------|--------|---------------|
| 2.1 | Trigger OPC alarm (or `-InjectLabEvents`) | Event on `raw-opc-events` |
| 2.2 | Verify payload contract | `serverId`, `sourceName`, `conditionName`, `eventTimeEpochMs` present |

**Script:** `e2e-full-system-test.ps1` §2, `test-e2e-streampipes.ps1`

Example lab tag: `E2E/Motor_01_Overload`, condition `HIGH`

---

## 3. Flink processing test

| Step | Expected |
|------|----------|
| 3.1 Deduplication | Duplicate event → single lifecycle projection |
| 3.2 Instance identity | `v1\|serverId\|source\|condition\|subCondition` — no `activeTime` in key |
| 3.3 State transition | `current-alarm-state` reflects FSM |

**Script:** `e2e-full-system-test.ps1` §3 with `-InjectLabEvents -DuplicateLast`

---

## 4. ACK flow test (critical)

| Step | Expected |
|------|----------|
| 4.1 UI/API ACK | UI sends intent only; no client `ui-*` commandId |
| 4.2 `operator-actions` | Server-generated `commandId` |
| 4.3 Flink | `ACK_CONFIRMED` via lifecycle; idempotent on duplicate |

**Scripts:**

- `test-full-pipeline-e2e.ps1` — full Kafka pipeline
- `validate-ams-production-ack.ps1` — production matrix with cookie
- `test-ui-ack-e2e.ps1` — API-only ACK

**Manual UI:** Acknowledge in Alarm Console → toast "Awaiting DCS confirmation via SignalR"

---

## 5. SignalR real-time test

| Step | Pass |
|------|------|
| 5.1 Alarm update | Row appears; merges (no duplicate id) |
| 5.2 Reconnect | Disconnect hub → generate alarms → reconnect → REST rehydrate |

**Automated:** SignalR health via `/api/v1/health/pipeline`

**Manual:** Browser devtools → Network → WebSocket `/hubs/alarms`

---

## 6. React UI contract test

| Check | Authority |
|-------|-----------|
| Event Time column | `eventTimeEpochMs` (SOE) |
| Server Received | `serverReceivedEpochMs` (audit only) |
| Time in Alarm | `activeTimeEpochMs` (duration) |
| Contract Identity panel | `logicalAlarmFamilyId`, `instanceKeySchemaVersion`, `commandId` |
| Historical grid | Event-time sorted; no synthetic offsets |

**Automated proxy:** API field checks in `e2e-full-system-test.ps1` §6

**Code:** `alarmReconciliation.ts`, `AlarmDetailPanel.tsx`, `HistoricalViewer.tsx`

---

## 7. Replay test

| Step | Action |
|------|--------|
| 7.1 | Invalid event → `raw-opc-events-dlq` |
| 7.2 | `.\scripts\replay-kafka-dlq.ps1 -DlqTopic raw-opc-events-dlq -TargetTopic raw-opc-events` |

**Pass:** Event-time ordering preserved; Flink merge (no state reset); no phantom alarms

See [production-contracts.md](./production-contracts.md) §7 — replay re-emits history, does not mutate live state.

---

## 8. Conflict resolution test

| Scenario | Winner |
|----------|--------|
| Out-of-order events | Later `eventTime` |
| Operator ACK vs replay | Operator intent (domain 2) unless triaged correction (domain 1) |

**Automated:** Documented + merge logic in `alarmReconciliation.ts`

---

## 9. Database consistency

```sql
-- No duplicate active identity groups
SELECT server_id, source_name, condition_name, COALESCE(sub_condition_name,''), COUNT(*)
FROM alarms.active_alarms WHERE condition_active = true
GROUP BY 1,2,3,4 HAVING COUNT(*) > 1;
```

**Automated:** `e2e-full-system-test.ps1` §9

---

## 10. Agent validation

**Script:** `ams-contract-validation-agent.ps1`

| Check | Purpose |
|-------|---------|
| Kafka lag | Consumer health |
| Flink checkpoint | Recovery readiness |
| DLQ size | Poison message growth |
| SignalR health | UI push path |
| Raw event contract | Missing eventTime detection |
| No `ui-*` commandIds | ACK identity violation |
| API identity fields | `logicalAlarmFamilyId` propagation |

Report: `scripts/validation/agent_*.json`

---

## 11. Failure scenario tests (manual)

| Scenario | Expected recovery |
|----------|-------------------|
| Kafka restart | Consumer resumes; lag clears |
| Flink restart | Checkpoint restore |
| SignalR drop | UI REST rehydrate |
| StreamPipes failure | Ingest resumes; Flink re-keys from payload |

---

## 12. Final acceptance criteria

System **PASS** when all true:

| Category | Criteria |
|----------|----------|
| Data correctness | No duplicate alarms; no lost events; deterministic identity |
| Time correctness | `eventTime` authoritative; no synthetic timestamps |
| ACK correctness | Server-owned `commandId`; idempotent processing |
| Replay correctness | DLQ replay produces consistent state |
| UI correctness | Projection merges; no divergence from backend |

**Single command:**

```powershell
.\scripts\e2e-full-system-test.ps1 -InjectLabEvents
```

Exit `0` = critical path pass. Exit `2` = non-critical failures only.

---

## Script reference

| Script | Scope |
|--------|--------|
| `e2e-full-system-test.ps1` | **Master orchestrator** (§0–§12) |
| `ams-contract-validation-agent.ps1` | Health + contract violations (§10) |
| `production-acceptance-test.ps1` | Smoke Tests 1–7 |
| `test-e2e-streampipes.ps1` | StreamPipes + Kafka + Flink stages |
| `test-full-pipeline-e2e.ps1` | Full ACK Kafka pipeline |
| `validate-ams-production-ack.ps1` | Production ACK matrix |
| `replay-kafka-dlq.ps1` | DLQ replay (event-time ordered) |
| `ams-readiness-score.ps1` | **Cutover confidence scoring** (per-subsystem 0–100) |
| `incident-reconstruct.ps1` | **Incident timeline rebuild** (transitions API → NDJSON) |
| `ci-contract-gate.ps1` / `ci-contract-gate.sh` | **CI static contract gate** (every commit) |
| `autonomous-ams-validation.ps1` | Load/storm validation |
| `lib/AmsContractChecks.ps1` | Shared contract helpers |
| `lib/AmsReadinessScore.ps1` | Subsystem weighting + cutover recommendation |

---

## Verification truth plane (second operational plane)

AMS operates on **two execution planes** in a closed semantic loop ([production-contracts.md](./production-contracts.md) §0.1). The verification plane **defines whether the production plane is considered correct**.

| Plane | Components |
|-------|------------|
| **Production truth** | StreamPipes → Kafka → Flink → PostgreSQL → API → SignalR → React UI |
| **Verification truth** | CI contract gate → E2E orchestrator → validation agent → readiness scoring → incident reconstruction |

### Verification phases

| Phase | Mechanism | When |
|-------|-----------|------|
| **Compile-time** | `ci-contract-gate` + `AMS.Tests.Contract` | Every commit / PR |
| **Runtime** | `e2e-full-system-test.ps1`, validation agent | Lab, staging, nightly |
| **Operational readiness** | `ams-readiness-score.ps1` | Pre-cutover sign-off |
| **Forensic reconstruction** | `incident-reconstruct.ps1` + E2E truth traces | Post-incident SOE rebuild |

**Maintainer rule:** Verification is not external QA. Production behavior is meaningless unless continuously proven against the formal contract model.

### Next phase (only three paths — §12.0)

1. **Operability layer** — verification → product UI (readiness dashboard, violation heatmaps, DLQ analytics)
2. **Incident reconstruction UI** — trust layer (familyId timeline, v1/v2 comparison, truth-domain overlay)
3. **Replay / correction control plane** — governance execution (controlled replay, correction workflows, audit trail)

---

## Runtime verification maturity (natural evolution)

This is not a typical application test suite. It is the **verification truth plane** of a self-verifying event-sourced control platform:

| Capability | Script / gate | When |
|------------|---------------|------|
| **Production cutover confidence** | `ams-readiness-score.ps1` | Pre-cutover, staging sign-off |
| **Incident reconstruction** | `incident-reconstruct.ps1` + E2E truth traces | Post-incident SOE rebuild |
| **Continuous contract enforcement** | `ci-contract-gate` (CI) + full E2E (lab) | Every commit / nightly lab |

### Golden startup verification (deployment gate)

Runs automatically at end of `start-ams-docker-full.ps1`; opt-in on lab with `-GoldenVerify`.

```powershell
.\scripts\Invoke-AmsGoldenStartupVerify.ps1
.\scripts\Invoke-AmsGoldenStartupVerify.ps1 -RunFullE2E
.\scripts\start-ams-docker-full.ps1 -SkipGoldenVerify   # skip gate
```

Threshold: **≥ 85**, zero contract violations. Startup = contract-valid, not merely up.

### Live readiness gate (UI authority)

`GET /api/v1/health/pipeline` → `readiness.overallScore`, `gateStatus` (PASS/WARN/FAIL).  
UI header badge — operators see go/no-go authority, not inferred health.

### StreamPipes semantic ingestion

`streampipes.readinessState`: `WarmingUp` | `IngestDelayed` | `IngestStalled` | `Healthy` | `Failed`  
No false-positive stall alerts during warm-up.

### Cutover readiness

```powershell
.\scripts\ams-readiness-score.ps1
# Exit 0 + overallScore >= 85 + zero violations → READY_FOR_CUTOVER
```

Reports: `scripts/validation/readiness_*.json`

### Incident reconstruction

```powershell
.\scripts\incident-reconstruct.ps1 -SourceName "Plant/Area/Tag" -HoursBack 24
```

Structured NDJSON pairs with E2E/agent reports for forensic timeline UI (§12.3).

### CI contract gate

```bash
bash scripts/ci-contract-gate.sh   # Linux / GitHub Actions
.\scripts\ci-contract-gate.ps1     # Windows local
```

GitHub Actions job `contract-gate` runs on every push/PR. Docker images require gate pass.

---

## Final result

If verification phases pass:

> The system is **production-validated**, **contract-consistent**, and **replay-safe** — system truth is **both executable and provable**.

**Architectural class:** A self-verifying event-sourced control system with embedded correctness governance as a second operational plane. Behavior is meaningless unless continuously proven against the formal contract model.

Remaining work: **three human-facing surfaces** for the verification truth plane (§12.0) — operability UI, incident reconstruction viewer, replay/correction control plane.
