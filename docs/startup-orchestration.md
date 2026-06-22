# AMS Startup & Orchestration Guide

Complete reference for bringing up all containers, host applications, and the event pipeline on a **Windows local lab** machine.

---

## Quick start (one command)

### Honeywell DCS client demo (production — no simulator)

1. Edit `scripts\config\honeywell-opc.ps1` — set **OpcHost** (DCS machine name) and **OpcProgId** (from OPC Expert on DCS).
2. Run:

```powershell
cd e:\AMS
.\scripts\start-ams-production.ps1
```

Starts Docker, Flink, Gateway (no auto-simulator), connects Honeywell OPC A&E, API, **`npm run dev`** on port 3000, runs ACK validation. Script **fails** if OPC or validation does not pass.

### Local lab (Integration Objects simulator)

```powershell
cd e:\AMS
.\scripts\start-ams-lab.ps1
```

This orchestrator:

1. Starts Docker infrastructure (Postgres, Redis, Zookeeper, Kafka, Schema Registry, Flink)
2. Builds and submits the Flink alarm job
3. Starts the Integration Objects OPC A&E simulator (if installed)
4. Starts **OPC Gateway** (host, port 5050)
5. Connects the simulator via `POST /opc/servers/connect`
6. Starts **AMS.Api** (host, port 8000, Development profile)
7. Backfills `cookieOffset` into Postgres from Kafka
8. Starts the **Vite frontend** (port 3000)
9. Prints pipeline health for the UI ribbon

### Common variants

| Command | Use when |
|---------|----------|
| `.\scripts\start-ams-lab.ps1 -Validate` | Full startup + production ACK validation matrix |
| `.\scripts\start-ams-lab.ps1 -ResetKafkaTopics` | First run or after partition/metadata issues |
| `.\scripts\start-ams-lab.ps1 -SkipBuild` | Code unchanged; faster restart |
| `.\scripts\start-ams-lab.ps1 -SkipFrontend` | Backend-only work |
| `.\scripts\start-ams-lab.ps1 -NoSimulator` | Simulator already running manually |
| `.\scripts\start-ams-lab.ps1 -DockerFull` | Everything in Docker (API + UI containers) |
| `.\scripts\stop-ams-lab.ps1` | Stop host Gateway, API, frontend |
| `.\scripts\stop-ams-lab.ps1 -DockerDown` | Also `docker compose down` |

Equivalent stabilization-only deploy (no frontend):

```powershell
.\scripts\apply-all-stabilization.ps1
```

---

## Architecture overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Windows host (local dev lab)                                           │
│                                                                         │
│  Integration Objects OPC A&E Simulator  ──DCOM──►  AMS.OpcGateway :5050 │
│                                                         │               │
│  Vite React UI :3000 ◄──SignalR/REST──►  AMS.Api :8000               │
│                                              │                          │
└──────────────────────────────────────────────┼──────────────────────────┘
                                               │ localhost:9092 / :5433
┌──────────────────────────────────────────────▼──────────────────────────┐
│  Docker (infra/docker/docker-compose.yml)                               │
│                                                                         │
│  Zookeeper → Kafka → Schema Registry → kafka-init (topics)              │
│       │                                                                 │
│       ├── Flink JobManager :8082  +  TaskManager(s)                     │
│       ├── PostgreSQL :5433                                              │
│       └── Redis :6379                                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Data flow (ACK path):**

```
UI → operator-actions (Kafka) → Flink → ack-writeback → Gateway → OPC AckCondition
  → ack-results → Flink → current-alarm-state → API ingest → SignalR → UI
```

See also: [E2E stabilization](./e2e-stabilization.md), [Kafka + Flink hardening](./kafka-flink-stabilization.md).

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| **Docker Desktop** | WSL2 backend recommended; 8 GB+ RAM for Kafka + Flink |
| **.NET 8 SDK** | Gateway + API run on host in lab mode |
| **Node.js 18+** | Frontend `npm run dev` |
| **PowerShell 5.1+** | All orchestration scripts |
| **Maven (optional)** | Flink JAR built via Docker Maven image if not local |
| **OPC A&E simulator** | Integration Objects — run `.\scripts\ensure-opc-ae-lab.ps1 -StartSimulator` |
| **opcaeps.dll** | 32-bit OPC Foundation stub in `SysWOW64` — see `ensure-opc-ae-lab.ps1` |

### Environment file

Copy and edit secrets once:

```powershell
Copy-Item infra\docker\.env.example infra\docker\.env
```

Lab defaults in `.env` must match `src\backend\AMS.Api\appsettings.Development.json`:

| Setting | Lab value |
|---------|-----------|
| Postgres password | `supersecurepassword123` |
| Redis password | `supersecureredis123` |
| Postgres host port | **5433** (avoids conflict with local PostgreSQL on 5432) |

---

## Startup order (detailed)

Correct order matters because each layer depends on the one below.

### Phase 0 — Stop conflicting processes

```powershell
Get-Process AMS.Api, AMS.OpcGateway -ErrorAction SilentlyContinue | Stop-Process -Force
```

Locked DLLs prevent rebuild. Port 3000 must be free for Vite.

### Phase 1 — Docker infrastructure

```powershell
cd e:\AMS\infra\docker
docker compose up -d postgres redis zookeeper kafka schema-registry kafka-init `
  flink-jobmanager flink-taskmanager
```

Wait until healthy:

```powershell
docker inspect -f "{{.State.Health.Status}}" ams-kafka
docker inspect -f "{{.State.Health.Status}}" ams-postgres
docker inspect -f "{{.State.Health.Status}}" ams-flink-jobmanager
```

**Services started in lab mode:**

| Container | Host port | Purpose |
|-----------|-----------|---------|
| `ams-postgres` | 5433 | Alarm projection, audit, config |
| `ams-redis` | 6379 | SignalR backplane (optional in dev) |
| `ams-zookeeper` | (internal) | Kafka coordination |
| `ams-kafka` | 9092 | Event bus |
| `ams-schema-registry` | 8081 | Avro schemas |
| `ams-kafka-init` | — | Creates topics (runs once) |
| `ams-flink-jobmanager` | 8082 | Flink UI + job submission |
| `ams-flink-taskmanager` | — | Stream processing workers |

**Kafka topics (lab partitions)** — created by `kafka-init` or reset via:

```powershell
.\scripts\kafka-reset-lab-topics.ps1 -Force
```

| Topic | Partitions |
|-------|------------|
| raw-opc-events | 8 |
| operator-actions | 4 |
| ack-writeback | 2 |
| ack-results | 2 |
| current-alarm-state | 8 |
| lifecycle-events | 4 |
| root-cause-events | 2 |

### Phase 2 — Flink job

Build JAR (Docker Maven) and submit single RUNNING job:

```powershell
.\scripts\stabilize-ams-e2e.ps1 -ForceResubmit -SkipValidation
```

Verify in Flink UI: http://localhost:8082 — job `OpcEventStreamJob` should be **RUNNING** with no root exception.

### Phase 3 — OPC simulator + Gateway

```powershell
.\scripts\ensure-opc-ae-lab.ps1 -StartSimulator

cd e:\AMS\src\opc-gateway\AMS.OpcGateway
dotnet run
```

Gateway listens on **http://127.0.0.1:5050**.

Connect simulator (orchestrator does this automatically):

```powershell
$body = @{
  serverId = "7ce5ecbf-70c9-498d-b899-5c8bb7add383"
  name     = "Local IO Simulator"
  host     = "127.0.0.1"
  progId   = "IntegrationObjects.OPCAEServer.Simulator.1"
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri "http://127.0.0.1:5050/opc/servers/connect" `
  -ContentType "application/json" -Body $body
```

Health checks:

```powershell
Invoke-RestMethod http://127.0.0.1:5050/health
Invoke-RestMethod http://127.0.0.1:5050/health/opc
```

Expect `telemetryPublish: true` and `isConnected: true` for the server above.

### Phase 4 — AMS API

```powershell
cd e:\AMS\src\backend\AMS.Api
dotnet run --environment Development
```

API listens on **http://127.0.0.1:8000**.

Development config highlights (`appsettings.Development.json`):

- Postgres: `localhost:5433`
- Kafka: `localhost:9092`
- Gateway: `http://127.0.0.1:5050`
- Flink UI: `http://localhost:8082`
- Auth: development bearer token **`dev`** (see API auth middleware)

### Phase 5 — Cookie projection backfill

If the grid shows “No OPC cookieOffset”, run:

```powershell
.\scripts\backfill-cookies-from-kafka.ps1
```

### Phase 6 — Frontend

```powershell
cd e:\AMS\src\frontend
npm install   # first time only
npm run dev
```

Open **http://localhost:3000**. Vite proxies `/api` and `/hubs` to port 8000.

---

## Full Docker mode (optional)

Runs API, Keycloak, Grafana, Seq, and frontend as containers:

```powershell
.\scripts\start-ams-lab.ps1 -DockerFull
```

Or manually:

```powershell
cd e:\AMS\infra\docker
docker compose up -d
.\scripts\stabilize-ams-e2e.ps1 -ForceResubmit -SkipValidation
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| API | http://localhost:8000 |
| Keycloak | http://localhost:8080 |
| Flink | http://localhost:8082 |
| Grafana | http://localhost:3001 |
| Prometheus | http://localhost:9090 |
| Seq | http://localhost:8084 |

**Note:** OPC Gateway still typically runs on the **Windows host** for DCOM access to the simulator unless you deploy gateway separately.

---

## Health verification

### Pipeline ribbon (API)

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/v1/health/pipeline
```

Expected (steady state):

- `kafka.brokerHealth`: healthy
- `kafka.lag`: 0 or low
- `flink.checkpointLatencyMs`: &lt; 60000
- `gateway.opcConnected`: true
- `kafka.throughput`: &gt; 0 events/s when simulator is active

### Active alarms with cookies

```powershell
$h = @{ Authorization = "Bearer dev" }
(Invoke-RestMethod "http://127.0.0.1:8000/api/v1/alarms/active?pageSize=50&isAcknowledged=false" -Headers $h).items |
  Where-Object { $_.opcAttributes.cookieOffset -gt 0 } |
  Select-Object -First 5 sourceName, id, @{N='cookie';E={$_.opcAttributes.cookieOffset}}
```

### Full acceptance matrix

```powershell
.\scripts\validate-ams-production-ack.ps1
```

Production-ready when all phases **PASS**, including `ACK_CONFIRMED` with real OPC writeback.

### Kafka smoke test

```powershell
docker exec ams-kafka kafka-console-consumer `
  --bootstrap-server localhost:9092 `
  --topic raw-opc-events --timeout-ms 10000
```

Messages should include `"cookieOffset"` &gt; 0.

---

## Port reference

| Port | Service |
|------|---------|
| 3000 | Vite dev server (frontend) |
| 5050 | AMS OPC Gateway (host) |
| 5433 | PostgreSQL |
| 6379 | Redis |
| 8000 | AMS.Api HTTP |
| 8082 | Flink JobManager UI |
| 9092 | Kafka broker |
| 8083 | Schema Registry (host; avoids conflict with other stacks on 8081) |

---

## Vendor DCS OPC vs this AMS application

**The vendor OEM license is not an AMS application license.**

| Layer | Part of this repo? | License |
|-------|-------------------|---------|
| React UI, AMS API, Kafka, Flink | Yes | Open source (free) |
| StreamPipes middleware | Referenced in compose overlay | Apache 2.0 (free) |
| `opc-connector` mock ingest | Yes | In-repo (free) |
| Honeywell / Emerson / Yokogawa DCS OPC server | **No** — runs on plant OT network | Vendor OEM (paid) |
| Integration Objects OPC A&E Simulator | **No** — separate Windows install | Commercial |
| `AMS.OpcGateway` (Windows ACK bridge) | Referenced; source may be absent | Depends on vendor OPC above |

AMS **connects to** plant OPC servers; it does not include them. Budget vendor OPC as a plant/OT procurement item, not AMS software.

**Real `ACK_CONFIRMED` on physical DCS** requires a licensed vendor OPC endpoint. In lab, use `LabAckSimulator` (below) instead.

## Free-tier lab deployment (no paid licenses)

| Component | Free alternative | Notes |
|-----------|------------------|-------|
| Alarm grid | AG Grid Community in Alarm Console | Enterprise tree data / sidebar removed; no watermark |
| OPC ingest | `opc-connector` Docker service (mock) | Started automatically by `start-ams-lab.ps1` |
| Production OPC | Apache StreamPipes (Apache 2.0) | Overlay compose; no Integration Objects / Honeywell license |
| HTTP ingest | `OpcHttpIngest` in `appsettings.Development.json` | Set `Enabled=true` and `FeedUrl`; disabled by default |
| Lab ACK demo | `LabAckSimulator` in `appsettings.Development.json` | `Enabled=true` — full `ACK_CONFIRMED` without vendor OPC |
| Real DCS ACK | StreamPipes or OpcGateway → vendor OPC | **Not free** — requires plant DCS/OEM license |

Diagnose ingest path:

```powershell
.\scripts\diagnose-kafka-pipeline.ps1
.\scripts\diagnose-kafka-pipeline.ps1 -Stabilize   # reset topics + redeploy Flink
```

## UI stack decision (AMS vs OpenBridge HMI)

**Keep the AMS custom React UI** for consolidated alarm management. It is the projection layer for Kafka → Flink → PostgreSQL → SignalR and implements ISA-18.2 alarm workflows (ACK, shelve, suppress, flood detection).

**OpenBridge HMI** ([openbridge.no](https://www.openbridge.no/faqs)) is a free, open-source maritime/industrial **design system** (UI components + guidelines). It is not an alarm management platform and does not replace this backend. Use OpenBridge only if you later want visual alignment with IEC 62288 / ISA 101 workstation standards — as a styling layer, not a platform migration.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `start-ams-lab.ps1` parse error: `Unexpected token 'fix'` or `&` not allowed (lines ~226, ~247) | Production copy is **out of date**. Copy `scripts\start-ams-lab.ps1` and `scripts\ensure-opc-ae-lab.ps1` from the latest repo (strings with `&` or `A&E` must use **single quotes** in PowerShell 5.1). |
| Ran `.\scripts\start-ams-lab.ps1 SkipBuild` (no dash) | Use **`-SkipBuild`** — without the dash, PowerShell treats `SkipBuild` as a positional argument and switches are ignored. |
| `.NET SDK is not on PATH` | Install **.NET 8 SDK** ([download](https://dotnet.microsoft.com/download/dotnet/8.0)), close and reopen PowerShell, run `dotnet --version`. If SDK is installed but PATH is stale, copy latest `start-ams-lab.ps1` (auto-adds `C:\Program Files\dotnet`). |
| Kafka unhealthy | `docker compose restart kafka`; wait 60s |
| Flink job FAILED / root exception | `.\scripts\stabilize-ams-e2e.ps1 -ForceResubmit` |
| Gateway build error | Stop running `AMS.OpcGateway` process first |
| API build DLL locked | Stop `AMS.Api` process first |
| “No OPC cookieOffset” in UI | `.\scripts\backfill-cookies-from-kafka.ps1` |
| ACK FAILED / timeout | Confirm cookie &gt; 0; check `ack-results` topic; see [e2e-stabilization](./e2e-stabilization.md) |
| 64-partition topic storms | `.\scripts\kafka-reset-lab-topics.ps1 -Force` |
| OPC not connected | Start simulator; POST `/opc/servers/connect` |
| Frontend stale after code change | Restart `npm run dev` |
| Empty grid | Wait 30–60s for ingest; check gateway `eventsPerSec` at `/health` |

---

## Shutdown

```powershell
# Host processes only (keep Docker running)
.\scripts\stop-ams-lab.ps1

# Host + Docker
.\scripts\stop-ams-lab.ps1 -DockerDown
```

---

## Autonomous validation (post-storm, gateway ACK-only)

Gateway on **:5050** stays **ACK-only** (`EnableRawEventPublish: false`). Storm ingest uses Python → `raw-opc-events` → Flink → API (not gateway telemetry).

```powershell
cd e:\AMS

# Services already up after storm — skip reset, 3 min catch-up
.\scripts\run-autonomous-validation.ps1 -SkipReset -CatchUpSec 180

# Full reset + storm + catch-up
.\scripts\run-autonomous-validation.ps1 -CatchUpSec 300

# Live DCS ACK (not storm rows — need cookieOffset)
.\scripts\validate-ams-production-ack.ps1
```

Parameters on `autonomous-ams-validation.ps1`:

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `-CatchUpSec` | 180 | Wait for Kafka lag=0 and stable active alarm count after storm |
| `-ExpectGatewayAckOnly` | (via wrapper) | Assert gateway `mode=ack-only` on :5050 |
| `-SkipReset` | — | Skip truncate/Flink restart when stack is already warm |

## Script index

| Script | Role |
|--------|------|
| **`start-ams-lab.ps1`** | **Primary orchestrator — use this** |
| `stop-ams-lab.ps1` | Stop host apps (+ optional Docker down) |
| `apply-all-stabilization.ps1` | Deploy stack without frontend |
| `stabilize-ams-e2e.ps1` | Build Flink JAR, submit job |
| `kafka-reset-lab-topics.ps1` | Recreate topics with lab partitions |
| `backfill-cookies-from-kafka.ps1` | Sync cookieOffset to Postgres |
| `validate-ams-production-ack.ps1` | End-to-end ACK acceptance |
| `e2e-full-system-test.ps1` | **Full system E2E** (§0–§12) |
| `ams-contract-validation-agent.ps1` | Contract violation agent |
| `ensure-opc-ae-lab.ps1` | OPC prerequisites + start simulator |

---

## Related documentation

- [Honeywell demo readiness](./honeywell-demo-readiness.md) — Client presentation go/no-go and commands
- [INSTALL.md](./INSTALL.md) — Enterprise architecture and production deployment
- [e2e-stabilization.md](./e2e-stabilization.md) — ACK flow and acceptance criteria
- [kafka-flink-stabilization.md](./kafka-flink-stabilization.md) — Checkpointing, consumer tuning, parallelism
