# AMS Production Contracts

Distributed industrial event-sourcing contract system for ISA-18.2 alarm management.

Production readiness is determined by **enforcement of deterministic contracts** across ACK identity, per-asset ordering, Flink state semantics, event-time governance, DLQ/replay lifecycle, and strict limitation of StreamPipes to **stateless ingestion and forwarding**.

**Correctness chain:** Kafka = immutable event log → Flink = sole stateful compute → downstream systems = explicit idempotency boundaries.

**Evolution risk category:** DCS tag schema changes, OPC-UA node restructuring, long-term key drift, and replay after months of data evolution are managed via **versioned instance keys**, **logicalAlarmFamilyId** cross-version correlation, **conflict classification**, and **explicit replay state rules** — not implicit behavior.

**Governance phase:** Correctness is contract-defined. Remaining work is **operability at scale** (§12) — observability of contract violations, control-plane services, and incident reconstruction tooling.

**Platform classification:** A contract-governed, event-sourced industrial control platform with a coupled verification subsystem that enforces correctness across compile-time, runtime, operational readiness, and forensic reconstruction phases.

**Architectural classification:** A **self-validating distributed event system with embedded deployment authority** — a contract-governed, event-sourced industrial control platform that continuously validates deployability, runtime correctness, and ingestion health, and exposes system authority directly to operators.

**Maturity level:** **Level 5 — Self-validating operational system** (see §0.3).

---

## 0. Governed system of record (design consequence)

AMS is not a pipeline. It is a **governed system of record** — a contract-driven, replay-safe, event-sourced industrial state reconstruction engine with dual-identity temporal modeling and governed truth-resolution layers.

**Correctness is no longer a property of code alone.** It is a property of **contract enforcement + operational discipline**, depending equally on:

### Hard guarantees (implemented)

| Guarantee | Mechanism |
|-----------|-----------|
| Event log immutability | Kafka exactly-once |
| Stateful correctness | Flink RocksDB + lifecycle FSM |
| Deterministic identity | Versioned instance keys + `logicalAlarmFamilyId` |
| Replay safety | Merge semantics, event-time ordering, state mutability boundary |
| Ingestion trust boundary | Untrusted adapters → Flink re-key |

### Soft guarantees (critical operational layer)

| Guarantee | Depends on |
|-----------|------------|
| ACK integrity | Operators use `operator-actions`; no bypass paths |
| Correction discipline | Replay only via triaged DLQ workflow; no hotfix state edits |
| Truth domain clarity | Engineers resolve incidents by domain priority (§2), not global "winner" |
| Contract compliance | Ops monitors DLQ reasons, ordering lag, identity drift |

**Failure mode when soft guarantees break:** the system remains *technically correct* but *operationally untrustworthy* — phantom timelines, unexplainable state, audit gaps.

### Where value moves next

| Priority | Capability | Question it answers |
|----------|------------|---------------------|
| **1** | Incident reconstruction engine | "What did the system believe at time T?" / "What is corrected truth after replay + operator intent?" / "How did v1 vs v2 evolve per familyId?" |
| **2** | Contract violation observability | DLQ reasons, ordering violations, identity mismatches, replay divergence — contracts as **measured enforcement**, not documentation |

Remaining work: turn a correct distributed system into a **governable operational product** — contract drift dashboards, replay orchestration UX, incident reconstruction tooling, controlled correction workflows (§12).

### 0.1 Two execution planes (closed correctness loop)

AMS is not a single pipeline with auxiliary tests. It operates on **two execution planes** in a **closed semantic loop** — not a linear pipeline:

| Plane | Scope | Function |
|-------|-------|----------|
| **Production truth plane** | StreamPipes → Kafka → Flink → PostgreSQL → API → SignalR → React UI | Produces state, drives UI, handles alarms |
| **Verification truth plane** | CI contract gate → E2E orchestrator → validation agent → readiness scoring → incident reconstruction | Validates production behavior, reconstructs system state, computes readiness and violations |

```
         ┌──────────────────────────────────────┐
         │       PRODUCTION TRUTH PLANE          │
         │  DCS → ingest → state → projection    │
         └─────────────────┬────────────────────┘
                           │ observed behavior
                           ▼
         ┌──────────────────────────────────────┐
         │     VERIFICATION TRUTH PLANE          │
         │  prove · score · reconstruct · gate   │
         └─────────────────┬────────────────────┘
                           │ defines "correct"
                           ▼
              ┌────────────────────────┐
              │  Correctness verdict   │
              │  (closed semantic loop)│
              └────────────────────────┘
```

**Critical implication:** The verification plane **defines whether the production plane is considered correct**. Production behavior is **meaningless unless continuously proven** against the formal contract model.

This is **embedded epistemic control** — truth verification as a runtime property of the platform, not an external QA activity.

| Phase | Verification layer | Question answered |
|-------|-------------------|-------------------|
| **Compile-time** | `ci-contract-gate` + `AMS.Tests.Contract` | Did we regress a declared contract in code? |
| **Runtime** | `e2e-full-system-test.ps1` + validation agent | Does the live pipeline behave per contract? |
| **Operational readiness** | `ams-readiness-score.ps1` | Is each subsystem safe for DCS cutover? |
| **Forensic reconstruction** | `incident-reconstruct.ps1` + E2E truth traces | What did the system believe at T1–T2? |

**Maintainer rule:** Scripts under `scripts/` and CI job `contract-gate` are **correctness governance infrastructure** — as essential as Flink state or Kafka EOS. Removing or bypassing verification is equivalent to weakening a production contract.

The production plane **executes truth**. The verification plane **makes truth provable**. Together they form a system where **truth is both executable and provable**.

### 0.2 Maturity closure (current state)

| Capability | Status |
|------------|--------|
| Architecture | ✔ Complete |
| Contracts | ✔ Enforced |
| Runtime correctness | ✔ Verified |
| UI projection | ✔ Aligned |
| Replay semantics | ✔ Deterministic |
| Verification subsystem | ✔ First-class (second operational plane) |
| Governance model | ✔ Closed-loop |
| **Deployment gate (golden startup)** | ✔ Complete |
| **Runtime scoring (readiness API + UI)** | ✔ Complete |
| **Semantic ingestion (StreamPipes detector)** | ✔ Complete |
| **UI authority layer** | ✔ Complete |

**Remaining work category:** operator control center, automated remediation, compliance timeline (§12.0) — not architectural gaps.

### 0.3 Level 5 — Self-validating operational system

AMS has crossed from advanced observability into a **closed operational correctness loop with runtime gating**. Every layer from deployment → ingestion → processing → UI is governed by a shared correctness contract and continuously validated against it.

**Question shift (before → now):**

| Before | Now |
|--------|-----|
| "Is the system running?" | "Does the system satisfy the deployment contract?" |
| "Are alarms flowing?" | "Is pipeline score ≥ operational threshold (85)?" |
| "Is StreamPipes ready?" | "Is ingestion semantically healthy or just alive?" |

#### Deployment gate (golden startup verification)

Startup is no longer binary up/down — it is **contract-valid or not**.

| Component | Script / hook |
|-----------|---------------|
| Readiness scoring + threshold ≥ 85 | `Invoke-AmsGoldenStartupVerify.ps1`, `ams-readiness-score.ps1` |
| E2E + agent integration | `e2e-full-system-test.ps1`, `ams-contract-validation-agent.ps1` |
| Docker / lab hooks | `start-ams-docker-full.ps1`, `start-ams-lab.ps1 -GoldenVerify` |
| CI gate | `ci-contract-gate` (compile-time) |

#### Runtime authority surface (live UI readiness gate)

Operators do not infer health from logs — they see **go/no-go system authority**:

```json
{
  "overallScore": 87,
  "cutoverThreshold": 85,
  "gateStatus": "PASS",
  "recommendation": "READY_FOR_CUTOVER"
}
```

**API:** `GET /api/v1/health/pipeline` → `readiness` field  
**UI:** Header readiness badge (PASS / WARN / FAIL), refreshed with pipeline health

Observability is converted to an **operational decision layer**.

#### Semantic ingestion intelligence (StreamPipes readiness detector)

Ingestion state is **classified**, not inferred — eliminating false-positive alarms during warm-up:

| State | Meaning |
|-------|---------|
| `WarmingUp` | Expected startup latency — no operator alert |
| `IngestDelayed` | Early warning — gap > 50% of stall threshold |
| `IngestStalled` | Real failure — exceeds telemetry stall threshold |
| `Healthy` | Ingest flowing |
| `Failed` | StreamPipes backend unreachable |

**Implementation:** `StreamPipesReadinessDetector` + `TelemetryIngestState` → exposed on `streampipes.readinessState` in pipeline health.

---

## 1. Identity model (versioned & deterministic)

| Concept | Formula | Stable? | Used for |
|---------|---------|---------|----------|
| **Asset partition key** | `serverId \| sourceName` (trimmed) | Per schema version | Flink `keyBy`, Kafka sink keys |
| **Alarm instance key v1** | `v1\|serverId \| sourceName \| conditionName \| subConditionName` | Per v1 rules | ISA-18.2 condition identity |
| **Dedup key** | Same as versioned instance key | Per schema version | 60s burst dedup window |
| **AMS alarm ID** | UUID (`ActiveAlarm.Id`) from DB | Yes | ACK orchestration (`keyBy`) |
| **Synthetic alarm ID** | `UUID.nameUUIDFromBytes(versionedInstanceKey)` | Per schema version | When DCS omits `eventId` |
| **ACK command ID** | UUID per operator action | Yes | Idempotent ACK writeback |
| **Telemetry event ID** | DCS `eventId` if present | Per event | Correlation only — **not** ACK scope |
| **instanceKeySchemaVersion** | `1` (current) | N/A | Payload field; Flink + API |
| **logicalAlarmFamilyId** | `serverId \| sourceName \| conditionName \| subConditionName` (no version prefix) | **Yes — cross-version** | KPIs, dashboards, long-term SOE |
| **Execution instance key** | `v1\|…` (versioned) | Per schema version | Flink state, dedup, ACK scope |

### Dual identity: family vs execution

Versioned instance keys **intentionally break** execution continuity when the formula changes. Historical SOE must be **reconstructed**, not assumed continuous.

| Identity | Role | Changes on v1→v2? |
|----------|------|-------------------|
| **logicalAlarmFamilyId** | Cross-version correlation, KPI trends, dashboard rollups | Only via explicit alias mapping |
| **alarmInstanceKey (vN)** | Execution identity, Flink keyed state, dedup | Yes — by design |
| **synthetic alarmId** | Derived from versioned instance key | Yes — by design |

**v2 migration:** maintain `alarm_key_aliases(family_id, v1_instance_key, v2_instance_key)` for SOE reconstruction. KPIs aggregate on `logicalAlarmFamilyId`, not versioned instance key.

**Code:** `AlarmKeys.logicalAlarmFamilyId()`, `AlarmPartitionKeys.LogicalAlarmFamilyId()`

### Invariant: `activeTime` is a property, not identity

`activeTimeEpochMs` records when the condition became active. It must **not** appear in `alarmInstanceKey`.

**On reactivation:** same instance key → update `activeTime` on existing row; do not create a new instance.

### Versioned instance keys (evolution safety)

`UUID.nameUUIDFromBytes(instanceKey)` is deterministic but **not collision-safe under schema drift**.

When plant mapping changes (e.g. `sourceName` rename, subCondition normalization), the instance key formula may change. Without versioning, old and new alarms silently diverge → SOE corruption.

**Rule:** embed schema version in the key prefix:

```
v1|serverId|sourceName|conditionName|subConditionName   ← current (AlarmKeys.INSTANCE_KEY_SCHEMA_VERSION = 1)
v2|...                                                    ← reserved; define before plant migration
```

**Migration procedure (when incrementing to v2):**

1. Deploy Flink + API reading both v1 and v2 during transition window
2. Run tag-mapping migration script; emit `instanceKeySchemaVersion: 2` on new events
3. Optional: DB alias table mapping v1→v2 instance keys for historical SOE
4. Retire v1 after TTL window (7 days state + ops sign-off)

**Code:** `AlarmKeys.java`, `AlarmPartitionKeys.cs`, `NormalizedAlarm.instanceKeySchemaVersion`

### ACK semantics (Flink authoritative)

| Rule | Behavior |
|------|----------|
| ACK scope | Per **AMS alarm row** (`alarmId` UUID), one lifecycle state machine |
| Idempotency unit | `commandId` — duplicate suppresses writeback |
| Terminal state | Only from `ack-results` via `AckResultReconciler` |
| Replay | Same `commandId` → no duplicate writeback |
| Confirmed + new `commandId` | Allowed (re-ACK after clear — new command) |

---

## 2. Consistency boundaries & conflict classification

### Sink semantics

| Layer | Guarantee | Mechanism | Notes |
|-------|-----------|-----------|-------|
| **Kafka** | **Exactly-once** (source of truth) | Flink EOS sink v2 + idempotent producer | Immutable log |
| **Flink keyed state** | **Exactly-once** | RocksDB + EXACTLY_ONCE checkpointing | Sole state holder |
| **PostgreSQL** | **At-least-once → idempotent upsert** | Match on condition/subCondition | Eventual = Kafka truth |
| **SignalR / React UI** | **At-least-once** | Client reconciles from `current-alarm-state` | Brief duplicates OK |
| **StreamPipes** | **Untrusted forwarder** | No state; no ACK authority | See §8 |

### Truth Domain Resolver Priority (hierarchical — not symmetric)

The conflict matrix defines **context-dependent truth**, not a single global winner. Debugging requires asking: *which resolution domain applied?*

**Priority stack (highest wins when domains overlap):**

```
Priority  Domain                          Authority
────────  ──────────────────────────────  ───────────────────────────────────
   1      Replay correction layer         Ops-triaged DLQ replay (correction=true)
   2      Operator intent overlay         operator-actions / ack-results (commandId)
   3      Event-time state machine        Flink lifecycle FSM (later eventTime wins)
   4      Flink dedup suppression         Same instance + state within window
   5      Kafka projection snapshot       current-alarm-state / lifecycle-events
   6      PostgreSQL materialized view    Idempotent upsert — eventual, not authoritative
   7      External DB / manual edits      Non-authoritative — stale until Kafka event
```

**Rules:**

- Higher priority **overrides** lower for the same `alarmInstanceKey` + time window
- Matrix rows map to a domain — never treat rows as peer-equivalent
- Incident analysis: log which domain resolved each transition (`resolutionDomain` field — future observability)

### Domain exclusivity (meta-rule)

**No two domains may assert final authority on the same state transition simultaneously.**

Each transition resolves in exactly **one** domain. If a new subsystem (e.g. root-cause engine, CEP suppression, analytics overlay) emits state changes, it must either:

1. **Emit to Kafka** as a normal event subject to domain priority (FSM / dedup), or
2. **Register as a new domain** in the priority stack with explicit scope — never peer-compete with replay or ACK domains on the same `alarmInstanceKey` + `eventTimeEpochMs`

Overlapping authority without stack registration is a **contract violation**. Extensions that write terminal ACK state, override replay corrections, or mutate Flink state outside the pipeline are forbidden.

### Conflict classification matrix

**"Kafka wins" is not global.** Each conflict type has a defined scope, detector, and winner.

| Conflict type | Detection | Winner | Rationale |
|---------------|-----------|--------|-----------|
| **Duplicate telemetry burst** | Same `dedupKey` + same state within 60s | Flink dedup suppresses | Noise / retransmit |
| **Duplicate `commandId`** | ACK orchestrator state | Suppress writeback | Idempotent ACK |
| **Out-of-order state transition** | `eventTimeEpochMs` vs lifecycle FSM | **Later event-time wins** per instance key | SOE authority |
| **Replay vs live (same event)** | Same instance key + same `eventTimeEpochMs` + same state | Idempotent merge (no double emit) | Dedup + upsert |
| **Replay vs live (corrected payload)** | Same instance key + same `eventTimeEpochMs` + **different** state | **Replayed event wins** if triaged as correction | Ops-approved replay only |
| **`current-alarm-state` vs PostgreSQL row** | Consumer lag / timestamp on projection | **Kafka projection wins** | DB is materialized view |
| **PostgreSQL manual edit (no Kafka event)** | Row changed without `operator-actions` / lifecycle | **Stale until next Kafka event** | No silent DB authority |
| **Operator ACK action** | `operator-actions` topic with valid `commandId` | **Operator intent wins** for ACK lifecycle | User-driven path |
| **Historical archive correction** | Explicit admin replay with `correction=true` flag (future) | **Correction stream wins** over live snapshot | Requires ops runbook |
| **Late event (within lateness)** | Watermark + allowed lateness | Process normally | Event-time governance |
| **Late event (beyond lateness)** | `LateEventGuard` | **DLQ** — not silently applied | Prevents SOE corruption |

Each row resolves within its **truth domain** (see priority stack above). Domains 1–3 are authoritative for runtime state; domains 5–7 are projections or stale views.

**Never override:** confirmed operator ACK (domain 2) without a new `commandId` or explicit correction workflow (domain 1).

PostgreSQL ingest (`NormalizedAlarmIngestor`): matches `MatchesIngestEvent` on condition/subCondition — idempotent upsert semantics.

---

## 3. Kafka partition strategy

**Flink-derived keys are authoritative.** Kafka message keys from StreamPipes are a performance hint only.

| Topic | Partition key (Flink / AMS publishers) |
|-------|----------------------------------------|
| `raw-opc-events` | `serverId\|sourceName` from **payload** |
| `operator-actions` | `serverId\|sourceName` |
| `ack-writeback` | `serverId\|sourceName` |
| `ack-results` | `serverId\|sourceName` |
| `lifecycle-events` | `serverId\|sourceName` |
| `current-alarm-state` | `serverId\|sourceName` |

Flink pipeline: `Authoritative Asset Re-Key` → `keyBy(partitionKey)` immediately after normalization (payload-derived, ignores Kafka message key).

Flink `keyBy`: dedup/SOE = versioned instance key / partition key; ACK = `alarmId`.

---

## 4. Event-time governance (SOE)

| Parameter | Default | Purpose |
|-----------|---------|---------|
| **Authoritative clock** | DCS `eventTime` / `eventTimeEpochMs` | SOE ordering |
| **Allowed lateness** | 5 minutes | `LateEventGuard` → DLQ |
| **Max future skew** | 30 seconds | Reject far-future → DLQ |
| **Watermark strategy** | Bounded out-of-orderness (30s) | Ingest stream |
| **Missing eventTime** | → `raw-opc-events-dlq` | No ingest-time substitution |
| **ingestTime** | Audit + lag metrics only | Never SOE authority |

Late events: `raw-opc-events-dlq` with `dlqReason=LATE_EVENT|FUTURE_EVENT`.

---

## 5. Flink state & recovery

| Setting | Value |
|---------|-------|
| State backend | RocksDB (incremental) |
| Checkpoint | EXACTLY_ONCE @ 10s |
| State TTL | 7 days (ACK dispatch, dedup) |
| Kafka sink | EOS v2 + idempotent producer |
| Recovery | Replay from checkpoint; `commandId` idempotency |

### State mutability boundary (invariant)

**Flink keyed state is immutable except via:**

1. **Normal pipeline processing** — events through dedup + lifecycle FSM
2. **Bounded DLQ replay** — merge into existing state (no reset)
3. **Savepoint restore** — disaster recovery only
4. **Targeted state purge** — per-asset ops runbook, job stopped, documented

**Prohibited:**

- Ad-hoc RocksDB state patching
- Partial hotfix state editing outside the pipeline
- Manual state correction without savepoint or replay workflow

Industrial systems often attempt "hotfix state editing" under pressure — this contract forbids it. All corrections flow through Kafka → Flink.

---

## 6. DLQ operational lifecycle

### Topics

| Topic | Trigger |
|-------|---------|
| `raw-opc-events-dlq` | Invalid JSON, missing identity/time, late/future event |
| `ack-writeback-dlq` | StreamPipes writeback failure (after 3 retries) |

### Operational workflow

```
1. DETECT   — Monitor DLQ rate (Grafana / kafka lag on *-dlq topics)
2. TRIAGE   — Inspect payload; classify: schema fix | DCS bug | clock skew | correction
3. FIX      — Correct upstream or patch payload
4. REPLAY   — scripts/replay-kafka-dlq.ps1 → primary topic
5. VERIFY   — Flink dedup + ACK idempotency; no DLQ spike
6. QUARANTINE — Unfixable: leave in DLQ; TTL purge @ 30 days
```

### Replay rules (ordering)

| Rule | Requirement |
|------|-------------|
| **Partition key** | `serverId\|sourceName` from payload (not DLQ arrival order) |
| **SOE ordering** | **Event-time ascending** per partition key before produce |
| **Never use** | Ingestion-time or DLQ arrival order for replay |
| **Rate** | ≤ 50% normal ingest until lag < 1000 |
| **Gate** | Manual triage only — no automatic replay |

`replay-kafka-dlq.ps1` sorts by `eventTimeEpochMs ASC` within each partition key.

---

## 7. Replay & Flink state interaction (critical)

**Most common hidden bug in event-sourced systems:** replay without defining state behavior.

### Replay vs live boundary (invariant)

**Replay is a re-emission of event-time history — not a mutation of live state.**

| Replay is | Replay is NOT |
|-----------|---------------|
| Reconstructing forward state through the existing FSM | Editing or overwriting live Flink state in place |
| Re-emitting events with original `eventTimeEpochMs` | Backfill that becomes a live override |
| Merge via dedup + idempotent upsert | Ad-hoc "fix current snapshot" |

Replay never **edits** — it only **reconstructs forward**. Accidental backfills must not become live overrides; all replay flows through Kafka → Flink merge semantics (§6).

### DLQ replay (bounded, routine)

| Aspect | Behavior |
|--------|----------|
| **Flink state reset** | **NO** — do not clear RocksDB / savepoint |
| **Merge model** | Replayed events merge through existing dedup + lifecycle FSM |
| **Duplicates** | Same instance key + eventTime + state → suppressed |
| **Corrections** | Ops-triaged replay with different state at same eventTime → emits state change |
| **PostgreSQL** | Idempotent upsert; eventual match to Kafka projection |
| **Phantom alarms** | Prevented by versioned instance key + dedup |

### Full topic replay (disaster recovery)

| Aspect | Behavior |
|--------|----------|
| **Option A** | Restore Flink savepoint from before corruption + replay Kafka from offset |
| **Option B** | Stop job → clear affected keyed state only (ops script) → reset consumer offset → restart |
| **Option C** | New consumer group + let dedup/TTL expire old state over 7 days (slow) |
| **Never** | Replay full topic into live job without dedup idempotency review |

### Per-asset replay (advanced)

If replaying months of history for one asset: pause ACK for that asset, replay event-time ordered, verify SOE export, then resume. Optional: targeted state purge for `partitionKey` (requires Flink ops runbook — not automated).

---

## 8. Untrusted ingestion boundary (all adapters)

StreamPipes established the pattern; **every future ingest adapter** inherits the same contract.

### Trust zones

```
┌─────────────────────────────────────────────────────────────┐
│  UNTRUSTED — ingestion layer                                │
│  StreamPipes, future OPC bridges, lab simulators, MQTT…     │
│  Assume: duplicates, reordering, partial delivery, bad keys │
└──────────────────────────┬──────────────────────────────────┘
                           │ raw-opc-events (at-least-once)
┌──────────────────────────▼──────────────────────────────────┐
│  TRUSTED — processing layer (Flink)                         │
│  Validate → normalize → re-key → dedup → lifecycle FSM      │
│  Correctness guaranteed only AFTER Authoritative Asset Re-Key│
└──────────────────────────┬──────────────────────────────────┘
                           │ current-alarm-state, lifecycle-events
┌──────────────────────────▼──────────────────────────────────┐
│  AUTHORITATIVE — state layer                                │
│  Flink RocksDB + Kafka immutable log                        │
└─────────────────────────────────────────────────────────────┘
```

### Per-adapter requirements (StreamPipes and all successors)

| Requirement | Rationale |
|-------------|-----------|
| No lifecycle / ACK authority | Flink only |
| No trusted partition guarantee | Flink re-keys from payload |
| Forward raw events to Kafka | Immutable log |
| `schemaVersion` on payload | Evolution safety |

StreamPipes-specific notes:

**Real guarantee point:** Flink `Authoritative Asset Re-Key` derives `partitionKey` from payload `serverId` + `sourceName` after normalization. All stateful operators key on payload-derived identity.

StreamPipes Kafka keys remain a **performance optimization** (colocate asset events in Kafka partitions). Verify when possible:

```powershell
kafka-console-consumer --bootstrap-server localhost:9092 --topic raw-opc-events --max-messages 5 --property print.key=true
```

If keys are null: fix in StreamPipes UI or custom sink — but **Flink still correct** for keyed state (at cost of cross-partition interleaving before re-key).

**Prohibited in StreamPipes:** timestamp-based keys, hash override without asset semantics, retry paths that change key.

---

## 9. Security (plant integration)

| Layer | Requirement |
|-------|-------------|
| OPC UA | Cert lifecycle, session renewal, exponential backoff |
| Kafka | SASL/SCRAM or mTLS |
| StreamPipes | Service API key (not admin password) |
| AMS API | JWT + network segmentation |

---

## 10. Payload schema versioning

`schemaVersion` + `eventType` on every payload. Increment before breaking Flink deserialization.

`instanceKeySchemaVersion` is separate — tracks identity formula evolution (§1).

---

## 11. Three time semantics (per-stream declaration)

Industrial event-sourced systems operate with **three distinct time dimensions**. Each consumer must declare which it uses — mixing them causes SOE/UI mismatch and KPI drift.

| Time dimension | Source | Purpose | Never use for |
|----------------|--------|---------|---------------|
| **eventTime** | DCS `eventTimeEpochMs` | SOE ordering, lifecycle FSM, alarm correlation | Ingest lag metrics |
| **ingestTime** | `serverReceivedEpochMs` / adapter timestamp | Audit trail, pipeline lag, SLA monitoring | SOE timeline, KPI counts |
| **replayTime** | DLQ consumer / replay script wall clock | Replay ops audit only | Any downstream ordering |

### Per-stream time authority

| Stream / consumer | Authoritative time | Notes |
|-------------------|-------------------|-------|
| `raw-opc-events` | eventTime | Source events |
| Flink dedup / lifecycle | eventTime | Watermark-governed |
| `lifecycle-events` | eventTime | Historical SOE export |
| `current-alarm-state` | eventTime (+ ingestTime for lag) | UI live view uses eventTime for display |
| PostgreSQL `active_alarms` | eventTime | Materialized; eventual |
| SignalR push | eventTime in payload | Client sorts by eventTime |
| DLQ / replay audit log | replayTime | Ops only |
| KPI aggregation (Flink) | eventTime | Not ingestTime |
| Pipeline health dashboards | ingestTime | Not SOE |

**Header convention (future):** each Kafka message should carry `timeAuthority: "eventTime"` in envelope metadata.

---

## 12. Operability maturity roadmap (next class of work)

Correctness is contract-defined. **Governance and operability at scale** are the remaining maturity step — not architectural gaps.

The verification and gating **data layer** is complete (§0.3). Technical architecture is closed. **Only meaningful evolution:** operator-facing control and automated response.

### 12.0 Next phase (operator control + automated response)

#### Path 1 — Operator control center (not dashboards)

Answers authority questions, not metric questions:

| Question | Surface |
|----------|---------|
| "Why am I not green?" | Contract violation drill-down from readiness subsystems |
| "What broke the contract?" | Violation heatmap + DLQ reason + truth-domain overlay |
| "What changed since last good state?" | Readiness score delta + last PASS timestamp |

Builds on: live readiness badge, `readiness_*.json`, agent violations.

#### Path 2 — Automated remediation layer

Closes the loop from detection → action:

| Trigger | Remediation |
|---------|-------------|
| `IngestStalled` | Restart StreamPipes adapter / alert ops |
| Flink checkpoint drift | Job rollback / resubmit from savepoint |
| DLQ growth after fix | Auto-replay triaged DLQ (`replay-kafka-dlq.ps1`) |

#### Path 3 — Continuous compliance timeline

Long-horizon governance:

| Capability | Purpose |
|------------|---------|
| Readiness score time series | Track degradation trends |
| Cutover failure prediction | Score slope + subsystem gaps before DCS window |
| Compliance audit export | Prove contract adherence over shift/plant cycle |

#### Paths 4–6 — Operability UI (from prior roadmap, data layer ready)

**Path 4 — Incident reconstruction UI** — familyId timeline, v1/v2 comparison, truth-domain overlay  
**Path 5 — Replay / correction control plane** — governed replay, correction workflow, audit trail  
**Path 6 — DLQ analytics + violation heatmaps** — contract-as-measured enforcement

### 12.1 Contract observability

| Metric / signal | Purpose |
|-----------------|---------|
| Contract violation counters | Missing eventTime, bad keys, late events → DLQ rate by reason |
| Ordering / ACK drift | Out-of-order transitions, ACK domain regressions |
| **Projection lag (p95)** | `eventTime` → UI visibility delta — operator trust metric |
| Per-stream ordering lag | `eventTime` vs processing time delta per partition key |
| Replay lineage | `{replayId, sourceDlq, messageCount, operator, outcome}` |
| Replay divergence | Replayed vs live state mismatch after merge window |
| DLQ growth anomaly | Alert on sustained > baseline |
| Truth domain resolution log | Which priority domain resolved each transition |

### 12.2 Control-plane services (evolution from scripts)

| Service | Replaces |
|---------|----------|
| ACK governance API | Ad-hoc ACK testing |
| Replay orchestration service | Manual `replay-kafka-dlq.ps1` at scale |
| Key-version registry | Implicit v1/v2 in code only |
| Alias mapping API | `alarm_key_aliases` for v1↔v2 family correlation |

### 12.3 Incident reconstruction tooling

Not log debugging — **timeline rebuild**:

> "Reconstruct alarm timeline for asset X between T1–T2 under v1 and v2 keys, merged by logicalAlarmFamilyId"

Inputs: `lifecycle-events` + `alarm_key_aliases` + replay audit log.  
Output: unified SOE export with cross-version family grouping.

**Script (v1):** `scripts/incident-reconstruct.ps1`

```powershell
# SOE trail from transitions API (structured NDJSON for forensic UI)
.\scripts\incident-reconstruct.ps1 -SourceName "E2E/Motor_01_Overload" -HoursBack 24

# Optional Kafka lifecycle-events sample when lab stack is up
.\scripts\incident-reconstruct.ps1 -IncludeKafkaSample -HoursBack 6
```

E2E and agent runs emit companion truth traces under `scripts/validation/` — pair with incident exports for full reconstruction.

### 12.4 Production cutover confidence scoring

Per-subsystem readiness (0–100) aggregated from live verification checks. Cutover threshold: **85** with zero contract violations.

**Script:** `scripts/ams-readiness-score.ps1`

```powershell
# Fast path: contract validation agent only
.\scripts\ams-readiness-score.ps1

# Full runtime verification before DCS cutover
.\scripts\ams-readiness-score.ps1 -RunFullE2E -InjectLabEvents
```

Output: `scripts/validation/readiness_*.json` with weighted subsystem scores (ingest, kafka, flink, ack, database, uiProjection, contracts).

### 12.5 Continuous contract enforcement (CI/CD gate)

Every commit runs a **static subset** of the verification suite — no Kafka/Flink cluster required:

| Layer | CI gate | Lab / staging |
|-------|---------|---------------|
| Contract docs present | ✔ | — |
| Frontend static (no `Date.now()` eventTime, no `ui-*` commandIds) | ✔ | — |
| Backend identity helpers | ✔ | — |
| `NormalizedAlarmEventJson` tests | ✔ | — |
| Frontend `tsc --noEmit` | ✔ | — |
| Full §0–§12 E2E matrix | — | `e2e-full-system-test.ps1` |
| Readiness score + cutover recommendation | — | `ams-readiness-score.ps1` |

**Scripts:** `scripts/ci-contract-gate.sh` (Linux CI), `scripts/ci-contract-gate.ps1` (local Windows)  
**Workflow:** `.github/workflows/ci-cd.yml` → job `contract-gate`

This is the primary value layer once the platform is contract-stable.

---

## Maturity assessment

| Capability | Status |
|------------|--------|
| Architecturally complete | ✔ |
| Contract-driven | ✔ |
| Operationally governed | ✔ |
| Replay-capable | ✔ |
| Evolution-safe keys | ✔ (v1 + logicalAlarmFamilyId) |
| Hierarchical truth domains | ✔ |
| State mutability boundary | ✔ |
| Untrusted ingestion (all adapters) | ✔ |
| Three time semantics declared | ✔ |
| UI projection model (§13) | ✔ |
| Production-consistent (normal + degraded) | ✔ |
| Operability at scale | ◻ In progress — verification data layer complete; operability UI next (§12.0) |

**Remaining work category:** operability — observability, control-plane, incident reconstruction. Not correctness.

---

## 13. UI layer contract (React / SignalR)

The UI is a **state projection layer** over a distributed event-sourced industrial system — not a React dashboard that owns alarm state.

**Core principle:** The UI is **never a source of truth**. It is a **reconciled projection of backend state at a given event-time boundary**.

### Three truth surfaces

| Surface | Authority | Role |
|---------|-----------|------|
| **Event log truth** | Kafka (`lifecycle-events`, `current-alarm-state`, `raw-opc-events`) | Immutable record; replay source |
| **Backend state truth** | Flink keyed state + PostgreSQL materialized view | Authoritative runtime state machine |
| **UI projection truth** | SignalR + REST snapshot + client reconciliation | Eventually consistent operator view |

On conflict: event log + Flink state win. UI re-hydrates and merges — it does not override.

```
Kafka (immutable log) → Flink (state) → PostgreSQL (materialized) → SignalR → UI (projection)
                                              ↑
                         operator-actions (intent only — not terminal ACK)
```

### Projection semantics (at-least-once)

| Rule | UI behavior |
|------|-------------|
| **SOE display** | Sort and display by `eventTimeEpochMs` only — no `Date.now()` fallback |
| **Duration** | `activeTimeEpochMs` for "time in alarm" — derived, not SOE authority |
| **Ingest audit** | `serverReceivedEpochMs` — lag/audit label only |
| **Reconciliation** | SignalR merges with existing rows; **later `eventTimeEpochMs` wins**; REST re-hydrate on reconnect |
| **ACK** | Operator intent via API only; terminal state from `OnAckLifecycleUpdated` (server `commandId`) — no client-generated IDs |
| **Terminal ACK guard** | Do not regress `ACK_CONFIRMED` / `ACK_FAILED` / `ACK_TIMEOUT` from stale lifecycle events |
| **Identity display** | `logicalAlarmFamilyId` + `instanceKeySchemaVersion` in contract panel — governance boundary, not debug trivia |
| **Historical grid** | Map snake_case DB rows; event-time pure — no synthetic timeline offsets |

### Incident classification

UI defects at this maturity level are **projection consistency violations**, not "display bugs":

- Stale row after reconnect → reconciliation failure
- Wrong SOE order → eventTime merge failure
- ACK state regression → terminal guard failure
- Missing family ID → contract field not propagated from backend

Every UI row must be traceable to a deterministic event-time state transition with explicit resolution domain provenance (§2).

### Projection correctness definition

**"Correct UI state"** at this maturity level means:

| Criterion | Definition |
|-----------|------------|
| **Eventual consistency** | UI converges to Flink/backend state — not instant, not authoritative |
| **Event-time ordering** | Rows sorted and merged by `eventTimeEpochMs`; SOE reconstructable |
| **Idempotent merge** | Each event-time transition applied **at most once** in UI state (dedup via merge logic) |

**Expected lag is not a bug.** When backend is correct and UI is behind:

> "UI is wrong but backend is right" → usually **expected eventual consistency lag**, not a defect.

**Defect** = projection fails to converge after reconnect re-hydrate + merge window, or violates event-time / ACK domain rules above.

### Projection lag (first-class metric)

Since UI is at-least-once, operator trust depends on measuring visibility delay:

```
projectionLagMs = wallClockNow − eventTimeEpochMs   (per alarm row, at UI render)
pipelineLagMs   = serverReceivedEpochMs − eventTimeEpochMs   (ingest path)
signalRLagMs    = uiReceivedEpochMs − serverReceivedEpochMs   (future: stamp on hub payload)
```

| Metric | Meaning | Target (ops) |
|--------|---------|--------------|
| **Projection lag** | DCS event → operator sees row | Monitor p95; alert if sustained > SLA |
| **Reconnect rehydrate time** | SignalR drop → REST snapshot complete | Log in client; alert if > 5s |
| **Merge stall** | Hub events received but row not updated | Contract violation counter |

Expose projection lag in ops dashboards (§12.1). UI may show ingest audit timestamp so operators distinguish SOE time from visibility time.

**Code:** `alarmReconciliation.ts`, `alarmMappers.ts`, `alarmStore.ts`, `AlarmDetailPanel.tsx`, `HistoricalViewer.tsx`

---

## Architecture review statement

> The architecture is structurally valid. Production readiness is determined by enforcement of deterministic contracts across ACK identity, per-asset ordering, Flink state semantics, event-time governance, DLQ/replay lifecycle, and strict limitation of StreamPipes to stateless ingestion and forwarding. The system's correctness depends on Kafka as the immutable event log, with Flink as the only stateful compute layer and all downstream systems operating under explicit idempotency and consistency contracts.

**System characterization:** A contract-driven, event-sourced industrial control platform that continuously validates its own deployability, runtime correctness, and ingestion health, and exposes system authority directly to operators through a governed UI.

**Maturity:** Level 5 — self-validating operational system (§0.3). Deployment validation, runtime scoring, semantic ingestion, and UI authority layer are complete.

**Final verdict:** Architecture and gating closed. Remaining work is operator control center, automated remediation, and compliance timeline (§12.0).

## Related docs

- [enterprise-cams-vnext-architecture.md](./enterprise-cams-vnext-architecture.md)
- [streampipes-connectivity.md](./streampipes-connectivity.md)
