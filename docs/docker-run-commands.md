# AMS — Docker Run Commands (Copy-Paste)

Run from **PowerShell** on the project machine. Project root: `E:\AMS - HMI GRID`

---

## Option A — One script (recommended)

```powershell
cd "E:\AMS - HMI GRID\scripts"
.\run-ams-docker-stack.ps1 -FirstRun
```

First run creates Kafka topics. Later runs:

```powershell
.\run-ams-docker-stack.ps1
```

Then start OPC Gateway on the host (must run from `scripts` folder or use full path):

```powershell
cd "E:\AMS - HMI GRID\scripts"
.\start-opc-gateway-lab.ps1
```

> **Note:** OPC Gateway source is at `e:\AMS\src\opc-gateway\` (sibling repo). The script auto-detects that path.

---

## Option B — Manual step-by-step

### 1. Environment file

```powershell
cd "E:\AMS - HMI GRID\infra\docker"
# Ensure .env exists with:
# POSTGRES_PASSWORD=supersecurepassword123
```

### 2. Start core infrastructure

```powershell
docker compose up -d postgres zookeeper kafka flink-jobmanager flink-taskmanager
```

Wait until healthy:

```powershell
docker ps --format "table {{.Names}}\t{{.Status}}"
```

Expected: `ams-postgres`, `ams-kafka`, `ams-zookeeper`, `ams-flink-jobmanager`, `ams-flink-taskmanager` all **Up (healthy)** or **Up**.

### 3. Create Kafka topics (first install only)

```powershell
cd "E:\AMS - HMI GRID\scripts"
.\kafka-reset-lab-topics.ps1 -Force
```

### 4. Build Flink JAR and submit job

```powershell
.\stabilize-ams-e2e.ps1 -ForceResubmit
```

Verify Flink **RUNNING**:

```powershell
curl.exe -s http://127.0.0.1:8082/jobs/overview
```

### 5. Build API + frontend images

```powershell
cd "E:\AMS - HMI GRID\infra\docker"
docker compose build ams-api ams-frontend
```

### 6. Run API + frontend (use `docker run` — stable on this stack)

> Do **not** use `docker compose up ams-api` if other containers already use `docker_ams-backend` — it can disrupt the network.

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
  -e "OpcHttpIngest__ServerName=Current Alarms Feed" `
  docker-ams-api:latest

docker run -d --name ams-frontend --network docker_ams-backend --restart unless-stopped -p 3000:80 `
  docker-ams-frontend:latest
```

### 7. OPC Gateway (Windows host — not in Docker)

```powershell
cd "E:\AMS - HMI GRID\scripts"
.\start-opc-gateway-lab.ps1
```

If the script is not found, you are in the wrong folder — use the full path:

```powershell
& "E:\AMS - HMI GRID\scripts\start-opc-gateway-lab.ps1"
```

Gateway must publish to Kafka at **`127.0.0.1:9093`** (external listener).

---

## Service URLs

| Service | URL |
|---------|-----|
| Alarm UI | http://127.0.0.1:3000/alarms |
| API health | http://127.0.0.1:8000/health |
| Pipeline health | http://127.0.0.1:8000/api/v1/health/pipeline |
| Flink dashboard | http://127.0.0.1:8082 |
| PostgreSQL | `localhost:5433` (user `ams_user`, db `ams`) |
| Kafka (host) | `127.0.0.1:9093` |
| OPC Gateway | http://127.0.0.1:5050 |
| HTTP alarm feed | http://192.168.1.51:8010/api/current-alarms |

---

## Validation commands

```powershell
cd "E:\AMS - HMI GRID\scripts"

# Full report (target: ACCEPTED, score >= 85)
.\production-validation-report.ps1

# UI smoke (12 checks)
cd validation
node ui-autonomous.mjs

# Kafka + ingest path
cd ..
.\diagnose-kafka-pipeline.ps1

# Flink job only
.\stabilize-ams-e2e.ps1 -SkipBuild -ForceResubmit -SkipValidation
```

Quick health:

```powershell
curl.exe -s http://127.0.0.1:8000/health
curl.exe -s -H "Authorization: Bearer dev" http://127.0.0.1:8000/api/v1/health/pipeline
docker exec ams-kafka kafka-topics --bootstrap-server kafka:29092 --list
```

---

## Stop stack

```powershell
docker stop ams-frontend ams-api
docker stop ams-flink-jobmanager ams-flink-taskmanager ams-kafka ams-zookeeper ams-postgres
```

Remove containers (keeps volumes/data):

```powershell
docker rm ams-frontend ams-api ams-flink-jobmanager ams-flink-taskmanager ams-kafka ams-zookeeper ams-postgres
```

---

## Troubleshooting

| Problem | Command / fix |
|---------|----------------|
| Flink RESTARTING | `.\stabilize-ams-e2e.ps1 -ForceResubmit` then wait 30s |
| No alarms in UI | Start `.\start-opc-gateway-lab.ps1` |
| HTTP feed Error | `docker exec ams-api curl -v http://192.168.1.51:8010/api/current-alarms` |
| Wrong Postgres password | Match `POSTGRES_PASSWORD` in `.env` with `ConnectionStrings__AmsDb` |
| Network missing | `docker network create docker_ams-backend` or re-run compose from `infra\docker` |

---

## Architecture in Docker

```
postgres + kafka + zookeeper + flink (compose)
        ↓
Flink job "AMS - Alarm State Machine" (stabilize script)
        ↓
ams-api + ams-frontend (docker run on docker_ams-backend)
        ↓
OPC Gateway on host :5050 → raw-opc-events → Flink → PostgreSQL → UI
HTTP feed :8010 → OpcHttpIngestor → alarm-* → SignalR → UI (optional)
```

Full parallelism and topic reference: [server-build-kafka-flink-complete-guide.md](server-build-kafka-flink-complete-guide.md)
