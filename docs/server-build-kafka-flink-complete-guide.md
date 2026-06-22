# AMS Server Build, Dual-Source Ingest & Kafka/Flink Reference

**Version:** 2026-06-09  
**Audience:** Operators and engineers deploying AMS on a Windows lab/production server  
**Assurance model:** Every step ends with a verification command. Do not skip validation gates.

---

## Table of Contents

1. [Architecture Summary](#1-architecture-summary)
2. [Prerequisites](#2-prerequisites)
3. [Build the Application Server (Zero-Error Path)](#3-build-the-application-server-zero-error-path)
4. [Dual-Source Ingest: OPC + HTTP Feed](#4-dual-source-ingest-opc--http-feed)
5. [Kafka Topics — Complete Reference](#5-kafka-topics--complete-reference)
6. [Flink Job — Complete Parallelism Reference](#6-flink-job--complete-parallelism-reference)
7. [100% Validation Checklist](#7-100-validation-checklist)
8. [Known Pitfalls & Fixes](#8-known-pitfalls--fixes)

---

## 1. Architecture Summary

AMS runs **two complementary ingest paths** in parallel:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PATH A — Production OPC (authoritative, persisted)                            │
│                                                                             │
│  OPC Gateway (:5050) → Kafka raw-opc-events → Flink (AMS - Alarm State      │
│  Machine) → PostgreSQL alarms.alarm_current → API REST → SignalR → UI      │
│                                                                             │
│  Operator ACK: UI → operator-actions → Flink → ack-writeback → Gateway      │
│              → ack-results → Flink → PostgreSQL + alarm-acknowledged → UI   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ PATH B — HTTP snapshot feed (supplementary, real-time UI)                   │
│                                                                             │
│  http://192.168.1.51:8010/api/current-alarms                                │
│       → OpcHttpIngestorService (poll 500ms)                                 │
│       → Kafka alarm-created / alarm-updated / alarm-cleared                 │
│       → SimpleKafkaSignalRBridgeService → SignalR → UI                      │
│                                                                             │
│  Server ID: f0af9a6d-85f6-4c9f-a8ad-6de277d1d110 ("Current Alarms Feed")   │
│  ACK: read-only snapshot — opcAckWriteable=false (by design)                │
└─────────────────────────────────────────────────────────────────────────────┘
```

| Source | Persists to PostgreSQL | Shows in UI grid | Operator ACK |
|--------|------------------------|------------------|--------------|
| OPC Gateway (Flink path) | Yes | Yes | Yes (when cookie present) |
| HTTP current-alarms feed | No (SignalR live only) | Yes (when enabled) | No (snapshot) |

---

## 2. Prerequisites

| Requirement | Version | Verify |
|-------------|---------|--------|
| Windows 10/11 or Server 2019+ | — | `winver` |
| Docker Desktop | 4.x+ | `docker version` |
| .NET SDK (local gateway build) | 8.0 | `dotnet --version` |
| PowerShell | 5.1+ | `$PSVersionTable.PSVersion` |
| Node.js (frontend build only) | 22.x | `node --version` |
| Network: OPC Gateway host | :5050 | `curl http://127.0.0.1:5050/health` |
| Network: HTTP feed (optional) | :8010 | `curl http://192.168.1.51:8010/api/current-alarms` |

**Ports used (lab):**

| Service | Host port |
|---------|-----------|
| Frontend | 3000 |
| API | 8000 |
| PostgreSQL | 5433 |
| Kafka | 9092 |
| Flink REST | 8082 |
| OPC Gateway | 5050 |

---

## 3. Build the Application Server (Zero-Error Path)

### Step 1 — Clone and open project

```powershell
cd "E:\AMS - HMI GRID"
```

### Step 2 — Start infrastructure (Postgres, Kafka, Zookeeper, Flink)

```powershell
cd infra\docker
docker compose up -d postgres zookeeper kafka flink-jobmanager flink-taskmanager
```

**Gate 2A — all healthy:**

```powershell
docker ps --format "table {{.Names}}\t{{.Status}}" | Select-String "ams-postgres|ams-kafka|ams-zookeeper|ams-flink"
```

Expected: all `Up` and `(healthy)` where applicable.

### Step 3 — Create Kafka topics (first install only)

```powershell
cd ..\..\scripts
.\kafka-reset-lab-topics.ps1 -Force
```

**Gate 3A:** Script prints `Lab topics recreated` with no errors.

### Step 4 — Build Flink JAR

```powershell
.\stabilize-ams-e2e.ps1 -SkipValidation
```

This runs Maven inside Docker, submits `AMS - Alarm State Machine`, waits 15s.

**Gate 4A — Flink RUNNING:**

```powershell
curl.exe -s http://127.0.0.1:8082/jobs/overview
```

Expected: one job named `AMS - Alarm State Machine` with `"state":"RUNNING"`.

### Step 5 — Build API and Frontend images

```powershell
cd ..\infra\docker
docker compose build ams-api ams-frontend
```

**Gate 5A:** Both images tagged `docker-ams-api:latest` and `docker-ams-frontend:latest`.

### Step 6 — Deploy API + Frontend (manual — avoids network tear-down)

> `docker compose up` on this stack can disrupt the shared `docker_ams-backend` network when other containers are attached. Use manual `docker run` after build.

```powershell
docker stop ams-api ams-frontend 2>$null
docker rm ams-api ams-frontend 2>$null

docker run -d --name ams-api --network docker_ams-backend --restart unless-stopped -p 8000:8000 `
  -e ASPNETCORE_ENVIRONMENT=Development `
  -e ASPNETCORE_URLS=http://0.0.0.0:8000 `
  -e "ConnectionStrings__AmsDb=Host=postgres;Port=5432;Database=ams;Username=ams_user;Password=supersecurepassword123" `
  -e Kafka__BootstrapServers=kafka:9092 `
  -e Kafka__IngestAuthority=gateway `
  -e Flink__JobManagerUrl=http://flink-jobmanager:8081 `
  -e LabAckSimulator__Enabled=false `
  -e OpcGateway__BaseUrl=http://host.docker.internal:5050 `
  -e OpcGateway__EnableRawEventIngest=false `
  -e OpcGateway__DefaultServerId=7ce5ecbf-70c9-498d-b899-5c8bb7add383 `
  -e OpcHttpIngest__Enabled=true `
  -e OpcHttpIngest__FeedUrl=http://192.168.1.51:8010/api/current-alarms `
  -e OpcHttpIngest__PollIntervalMs=500 `
  -e OpcHttpIngest__ServerId=f0af9a6d-85f6-4c9f-a8ad-6de277d1d110 `
  -e OpcHttpIngest__ServerName="Current Alarms Feed" `
  docker-ams-api:latest

docker run -d --name ams-frontend --network docker_ams-backend --restart unless-stopped -p 3000:80 docker-ams-frontend:latest
```

**Gate 6A:**

```powershell
curl.exe -s http://127.0.0.1:8000/health
curl.exe -s http://127.0.0.1:3000/
```

Both return HTTP 200.

### Step 7 — Start OPC Gateway (Windows host)

```powershell
cd ..\..\scripts
.\start-opc-gateway-lab.ps1
```

**Gate 7A:** Gateway health at `http://127.0.0.1:5050` returns connected status.

### Step 8 — Full production validation

```powershell
.\production-validation-report.ps1
```

**Gate 8A:** Report shows `ACCEPTED`, score ≥ 85, 0 FAIL.

### Step 9 — UI smoke test

```powershell
cd validation
node ui-autonomous.mjs
```

**Gate 9A:** All checks PASS (including AG Grid rows and ACK E2E).

---

## 4. Dual-Source Ingest: OPC + HTTP Feed

### Configuration keys

| Key | Location | Value (lab) |
|-----|----------|-------------|
| `OpcHttpIngest:Enabled` | appsettings / docker env | `true` |
| `OpcHttpIngest:FeedUrl` | appsettings / docker env | `http://192.168.1.51:8010/api/current-alarms` |
| `OpcHttpIngest:PollIntervalMs` | appsettings / docker env | `500` |
| `OpcHttpIngest:ServerId` | appsettings / docker env | `f0af9a6d-85f6-4c9f-a8ad-6de277d1d110` |
| `OpcHttpIngest:ServerName` | appsettings / docker env | `Current Alarms Feed` |
| `OpcGateway:BaseUrl` | docker env | `http://host.docker.internal:5050` |
| `OpcGateway:EnableRawEventIngest` | docker env | `false` (Flink-only DB writes) |

### Verify HTTP feed from API container network

```powershell
docker exec ams-api curl -s -o NUL -w "%{http_code}" http://192.168.1.51:8010/api/current-alarms
```

Expected: `200`. If unreachable, check firewall/routing from Docker to `192.168.1.51`.

### Verify HTTP feed in admin UI

1. Open `http://127.0.0.1:3000/admin` → OPC Servers
2. **Current Alarms Feed** should show `HTTP-JSON`, Enabled, Connected
3. **Local IO Simulator** should show `OPC-AE`, Connected

### Verify HTTP alarms in console

```powershell
curl.exe -s -H "Authorization: Bearer dev" http://127.0.0.1:8000/api/v1/opc/connections
```

HTTP connection `enabled: true`, `status: Connected`.

HTTP-sourced alarms appear in the grid via **SignalR** (live). They use `opcAttributes.feed = "http-current-alarms"` and cannot be OPC-acknowledged.

### Disable HTTP feed (OPC-only mode)

Set `OpcHttpIngest__Enabled=false` on `ams-api` and restart container.

---

## 5. Kafka Topics — Complete Reference

Created by `scripts/kafka-reset-lab-topics.ps1`:

| Topic | Partitions | Retention | Cleanup | Role | Why this partition count |
|-------|------------|-----------|---------|------|--------------------------|
| `raw-opc-events` | **8** | 7 days | delete | OPC gateway telemetry ingress | Matches Flink `raw-ingest` parallelism (4) × 2 for headroom; allows parallel consumer scaling |
| `current-alarm-state` | **8** | 7 days | **compact** | Flink → API `NormalizedAlarmConsumer` projection | Compacted keyed state; 8 partitions align with raw-opc fan-out |
| `operator-actions` | **4** | 7 days | delete | UI operator ACK/shelve commands | Moderate throughput; keyed by alarm asset |
| `ack-writeback` | **2** | 7 days | delete | Flink → OPC gateway ACK commands | Low volume, ordered per partition |
| `ack-results` | **2** | 7 days | delete | Gateway → Flink ACK confirmations | Pairs with writeback; 2 for redundancy |
| `alarm-acknowledged` | **4** | 7 days | delete | Confirmed ACK → SignalR bridge | UI notification fanout |
| `alarm-created` | **4** | 7 days | delete | HTTP ingest + lab inject → SignalR | Supplementary path; not Flink-authoritative |
| `alarm-updated` | **4** | 7 days | delete | HTTP ingest updates → SignalR | Same |
| `alarm-cleared` | **4** | 7 days | delete | HTTP ingest clears → SignalR | Same |
| `lifecycle-events` | **4** | 7 days | delete | Flink lifecycle audit stream | ISA-18.2 transition log |
| `root-cause-events` | **2** | 7 days | delete | Flink CEP root-cause output | Low volume analytics |

**Consumer groups (critical):**

| Group ID | Topic(s) | Owner |
|----------|----------|-------|
| `flink-ams-raw-opc-events` | raw-opc-events | Flink job |
| `flink-ams-operator-actions` | operator-actions | Flink ACK branch |
| `flink-ams-ack-results` | ack-results | Flink ACK branch |
| `flink-ams-alarm-acknowledged` | alarm-acknowledged | Flink secondary ACK sink |
| `ams-api-signalr-bridge` | alarm-created/updated/cleared/acknowledged | API SignalR bridge |
| `ams-stream-processor` | current-alarm-state | API DB projection |

**Verify topics exist:**

```powershell
docker exec ams-kafka kafka-topics --bootstrap-server kafka:29092 --list
```

**Verify lag zero:**

```powershell
docker exec ams-kafka kafka-consumer-groups --bootstrap-server kafka:29092 --describe --group flink-ams-raw-opc-events
```

---

## 6. Flink Job — Complete Parallelism Reference

**Job name:** `AMS - Alarm State Machine`  
**Entry class:** `com.ams.flink.OpcEventStreamJob`  
**JAR:** `src/flink/target/ams-flink-1.0-SNAPSHOT.jar`  
**Submit script:** `scripts/lib/AmsFlinkJob.ps1` (via `stabilize-ams-e2e.ps1`)

### Cluster constraints (docker-compose)

| Setting | Value | Why |
|---------|-------|-----|
| `parallelism.default` | **1** | Fallback for operators without explicit parallelism |
| `taskmanager.numberOfTaskSlots` | **4** | **Hard ceiling** — max 4 concurrent subtasks per TaskManager |
| TaskManagers (lab) | 1–2 | Scale slots before raising operator parallelism above 4 |

### Configurable parallelism (CLI args → `PipelineConfig.java`)

| CLI argument | Config field | Java default | Lab submit value (`AmsFlinkJob.ps1`) | Why necessary |
|--------------|--------------|--------------|--------------------------------------|---------------|
| `--parallelism.raw-ingest` | `rawSource` | 4 | **4** | Parallel Kafka partition consumption from `raw-opc-events` (8 partitions) |
| `--parallelism.validation` | `validation` | 4 | **4** | CPU-bound JSON parse/validate; scales with ingest rate |
| `--parallelism.dedup` | `dedup` | 4 | **4** | Keyed 60s dedup window; must scale with validation output |
| `--parallelism.enrichment` | `enrichment` | 4 | **2** | Cookie/attribute enrichment; lab caps at 2 to fit 4 slots |
| `--parallelism.soe` | `soe` | 2 | **2** | Sequence-of-events ordering per alarm key |
| `--parallelism.lifecycle` | `lifecycle` | 2 | **2** | Keyed state machine (ACTIVE/ACK/CLEAR transitions) |
| `--parallelism.flood` | `flood` | 1 | **1** | ISA-18.2 flood detection — single instance avoids duplicate flood flags |
| `--parallelism.kpi` | `kpi` | 1 | **1** | KPI side metrics — lightweight, non-critical path |
| `--parallelism.cep` | `cep` | 2 | **2** | Root-cause CEP analysis |
| `--parallelism.current-sink` | `postgresSink` | 2 | **2** | JDBC writes to `alarm_current` + lifecycle tables; 2 balances throughput vs. connection pool |
| `--parallelism.history-sink` | `signalrSink` | 2 | **2** | Kafka fanout to UI topics (`alarm-*`, `current-alarm-state`); **not** a history DB sink |
| `--parallelism.ack-results` | `ackProcessor` | 2 | **2** | ACK branch: operator-actions + ack-results sources and ack-processor map |

> **Note:** `--parallelism.normalization` in `AmsFlinkJob.ps1` is **not parsed** by Java — it is ignored. Use `--parallelism.enrichment` instead.

### Every operator in `OpcEventStreamJob.java`

#### Branch 1 — OPC telemetry

| Operator | Parallelism | Keyed? | Purpose |
|----------|-------------|--------|---------|
| `raw-opc-source` | `cfg.rawSource` (4) | No | Kafka source `raw-opc-events` |
| `validation` | `cfg.validation` (4) | No | Parse/validate JSON envelope |
| `validation-filter` | **1** (default) | No | Drop invalid records |
| `deduplication` | `cfg.dedup` (4) | **Yes** (`alarmKey`) | 60s keyed dedup |
| `enrichment` | `cfg.enrichment` (2 lab) | No | Cookie, OPC attributes |
| post-enrichment filter | **1** | No | Drop enrichment failures |
| `soe-ordering` | `cfg.soe` (2) | No | SOE timestamp ordering |
| `lifecycle-engine` | `cfg.lifecycle` (2) | **Yes** (`alarmKey`) | State transitions |
| `flood-detection` | `cfg.flood` (1) | No | Flood rate filter |
| `kpi-aggregation` | `cfg.kpi` (1) | No | KPI metrics side branch |
| KPI filter | **1** | No | Drop empty KPI records |
| `root-cause-analysis` | `cfg.cep` (2) | No | CEP root-cause |
| root-cause filter | **1** | No | Drop empty CEP output |
| `root-cause-events` sink | **1** | No | Kafka `root-cause-events` |
| `lifecycle-events` map | **1** | No | Lifecycle JSON |
| `lifecycle-events` Kafka sink | **1** | No | Kafka `lifecycle-events` |
| `postgres-lifecycle-sink` | `cfg.postgresSink` (2) | No | JDBC `alarm_state_transitions` |
| `activeAlarms` / `clearedAlarms` filters | **1** | No | Split active vs cleared |
| `postgres-current-sink` | `cfg.postgresSink` (2) | No | UPSERT `alarms.alarm_current` |
| `postgres-clear-sink` | `cfg.postgresSink` (2) | No | DELETE cleared alarms |
| `alarm-created` map | **1** | No | NEW alarm JSON |
| `signalr-alarm-created` | `cfg.signalrSink` (2) | No | Kafka `alarm-created` |
| `alarm-updated` map | **1** | No | UPDATE alarm JSON |
| `signalr-alarm-updated` | `cfg.signalrSink` (2) | No | Kafka `alarm-updated` |
| `alarm-cleared` map | **1** | No | CLEAR alarm JSON |
| `signalr-alarm-cleared` | `cfg.signalrSink` (2) | No | Kafka `alarm-cleared` |
| `current-alarm-state` map | **1** | No | Full state snapshot JSON |
| `signalr-current-state` | `cfg.signalrSink` (2) | No | Kafka `current-alarm-state` |

#### Branch 2 — ACK orchestration

| Operator | Parallelism | Purpose |
|----------|-------------|---------|
| `operator-actions` source | `cfg.ackProcessor` (2) | UI ACK commands from Kafka |
| `ack-processor` map | `cfg.ackProcessor` (2) | Build `ack-writeback` payload |
| ack filter | **1** | Drop invalid ACK requests |
| `ack-writeback` Kafka sink | **1** | To OPC gateway |
| `ack-results` source | `cfg.ackProcessor` (2) | Gateway ACK confirmations |
| `ack-results` filter | **1** | Only `ACK_CONFIRMED` |
| `postgres-ack-sink` | `cfg.postgresSink` (2) | `UPDATE ack_status` in PostgreSQL |
| `signalr-ack-confirmed` map | **1** | ACK confirmed JSON |
| `signalr-ack-confirmed` sink | `cfg.signalrSink` (2) | Kafka `alarm-acknowledged` |
| `alarm-acknowledged` source | **1** (hardcoded) | Secondary API-bridge ACK path — serialized to prevent duplicate DB updates |
| `postgres-acknowledged-topic-sink` | `cfg.postgresSink` (2) | Secondary ACK DB update |

### Environment variables (Flink containers)

| Variable | Default | Used by |
|----------|---------|---------|
| `KAFKA_BROKERS` | `kafka:9092` | All Kafka sources/sinks |
| `DB_URL` | `jdbc:postgresql://postgres:5432/ams` | JDBC sinks |
| `DB_USER` | `ams_user` | JDBC auth |
| `DB_PASS` | from compose | JDBC auth |

### Checkpointing

| Setting | Value | Why |
|---------|-------|-----|
| Interval | 30s | Recovery point for exactly-once |
| Mode | EXACTLY_ONCE | No duplicate DB writes on restart |
| Min pause | 10s | Prevents checkpoint storms |
| Timeout | 120s | Tolerates JDBC backpressure |
| Externalized | RETAIN_ON_CANCELLATION | Manual recovery after job cancel |

### Verify Flink operator metrics

```powershell
curl.exe -s -H "Authorization: Bearer dev" http://127.0.0.1:8000/api/v1/health/pipeline | python -c "import sys,json; d=json.load(sys.stdin); print('status',d['flink']['status']); print('raw-opc',d['flink']['rawOpcEventsProcessed']); [print(o['name'],o.get('recordsIn',0)) for o in d['flink']['operators'][:5]]"
```

---

## 7. 100% Validation Checklist

Run in order. **All gates must pass** before declaring production-ready.

| # | Gate | Command | Pass criteria |
|---|------|---------|---------------|
| 1 | Docker infra | `docker ps` | postgres, kafka, zookeeper, flink-jobmanager, flink-taskmanager Up |
| 2 | Kafka topics | `kafka-topics --list` | All 11 topics from Section 5 present |
| 3 | Flink RUNNING | `curl :8082/jobs/overview` | `AMS - Alarm State Machine` state=RUNNING, no root-exception |
| 4 | API health | `curl :8000/health` | Healthy |
| 5 | Pipeline readiness | `curl :8000/api/v1/health/pipeline` | score ≥ 85, gateStatus=PASS |
| 6 | OPC ingest | pipeline API `telemetryIngest.state` | OK, secondsSinceLastEvent < 5 |
| 7 | HTTP feed | `docker exec ams-api curl :8010/api/current-alarms` | HTTP 200 |
| 8 | DB alarms | `psql SELECT COUNT(*) FROM alarms.alarm_current` | > 0 when simulator running |
| 9 | No false ACK | API alarms: no `ack_status=true` + `state=ACTIVE` mismatch | 0 inconsistent rows |
| 10 | Production report | `.\production-validation-report.ps1` | ACCEPTED |
| 11 | UI agent | `node scripts/validation/ui-autonomous.mjs` | 12/12 PASS |
| 12 | Manual ACK | Select FIC1001 LO (opcAckWriteable=true), Ack | Lifecycle REQUESTED → CONFIRMED, not FAILED |

---

## 8. Known Pitfalls & Fixes

| Symptom | Root cause | Fix |
|---------|------------|-----|
| Flink RESTARTING | JDBC param index mismatch in `postgres-current-sink` | Rebuild JAR (`stabilize-ams-e2e.ps1`), verify 9 JDBC placeholders |
| Alarms auto-ACK | Kafka `alarm-acknowledged` replay on job resubmit | Reset false acks in DB; consider `latest` offset for ack topic consumer |
| AG Grid empty | Grid selection not synced to store | Ensure `onSelectionChanged` wired (fixed in AlarmConsole) |
| Ack button disabled | No row selected in store | Click checkbox or row first |
| HTTP feed not in grid | `opcAlarmFilter` excluded HTTP server ID | Enable `OpcHttpIngest` + HTTP connection Connected |
| `docker compose up` breaks network | Compose tries to recreate `docker_ams-backend` | Build with compose, deploy API/frontend with manual `docker run` |
| Flink UI on wrong port | JobManager mapped 8082→8081 | Use `http://127.0.0.1:8082` not 8081 |
| Parallelism > 4 ineffective | Only 4 task slots | Add TaskManager or reduce operator parallelism |
| HTTP alarms vanish on refresh | HTTP path is SignalR-only (no DB) | Expected; OPC path is authoritative for REST |

---

## Quick Reference Commands

```powershell
# Full lab bring-up (one command)
.\scripts\start-ams-lab.ps1 -Validate

# Stabilize Flink only
.\scripts\stabilize-ams-e2e.ps1 -ForceResubmit -SkipValidation

# Diagnose active ingest path
.\scripts\diagnose-kafka-pipeline.ps1

# Verify OPC ACK writeback
.\scripts\verify-opc-ack-writeback.ps1
```

---

## Related Documents

- `docs/ams-alarm-architecture.md` — system architecture overview
- `docs/flink-only-orchestration.md` — Flink-only ingest rationale
- `docs/production-validation-architecture.md` — validation gate definitions
- `docs/startup-orchestration.md` — service start order
