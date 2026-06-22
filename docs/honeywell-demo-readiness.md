# Honeywell DCS — Client Demo Readiness Checklist

Use this as the **go/no-go** document before a live client presentation.  
Architecture is production-grade; **sign-off requires a green run on real Honeywell OPC**, not storm/simulator-only.

---

## Copy-paste: commands that should succeed

```powershell
cd e:\AMS

# 0) Configure DCS (required once)
notepad scripts\config\honeywell-opc.ps1

# 1) Lab (no Honeywell) - note the dash before SkipBuild
.\scripts\start-ams-lab.ps1 -SkipBuild

# 1b) Honeywell production
.\scripts\start-ams-production.ps1

# 2) If step 1 validation not all PASS, run manually:
$h = @{ Authorization = "Bearer dev" }
Invoke-RestMethod http://127.0.0.1:8000/api/v1/health/pipeline
Invoke-RestMethod http://127.0.0.1:5050/health/opc
docker exec ams-flink-jobmanager flink list
(Invoke-RestMethod "http://127.0.0.1:8000/api/v1/alarms/active?pageSize=20&isAcknowledged=false" -Headers $h).items |
  Where-Object { $_.opcAttributes.cookieOffset -gt 0 } | Select-Object -First 3 sourceName, id, @{N='cookie';E={$_.opcAttributes.cookieOffset}}
.\scripts\validate-ams-production-ack.ps1 -ConnectedServerId "<ServerId-from-honeywell-opc.ps1>"

# 3) UI
start http://localhost:3000
start http://127.0.0.1:8000/swagger/index.html
```

**Lab simulator** (rehearsal only — replace `ServerId` with lab GUID):

```powershell
.\scripts\validate-ams-production-ack.ps1 -ConnectedServerId "7ce5ecbf-70c9-498d-b899-5c8bb7add383"
```

---

## Last verification run (this machine)

| Check | Result |
|-------|--------|
| Docker postgres/kafka/flink | healthy |
| API Swagger | HTTP 200 |
| Frontend :3000 | HTTP 200 |
| Pipeline health | Kafka healthy, lag=0, Flink restarts=0 |
| Flink job | RUNNING |
| `validate-ams-production-ack.ps1` (lab simulator) | **7/10 PASS** — ACK lifecycle still FAIL |
| Gateway | Was down until started; then connected |

**Conclusion:** Infrastructure commands succeed; **ACK_CONFIRMED** still needs fix/rehearsal before Honeywell client demo.

---

## One-command stack (Honeywell)

**Prerequisite:** Edit `scripts\config\honeywell-opc.ps1` with real values from OPC Expert on the DCS node.

| Field | Example | How to verify |
|-------|---------|----------------|
| `OpcHost` | `HPSERVER01` or `192.168.x.x` | Windows machine name on Experion (prefer name over `127.0.0.1`) |
| `OpcProgId` | `Honeywell.AlarmEventServer.1` | OPC Expert → ProgID on DCS |
| `ServerId` | Stable GUID | Same ID in Administration → OPC Servers (OPC-AE) |

```powershell
cd e:\AMS
.\scripts\start-ams-production.ps1
```

Starts: Docker, Flink, Gateway (no simulator), Honeywell connect, API, `npm run dev`, cookie backfill, ACK validation.

**Faster restart** (after first successful build):

```powershell
.\scripts\start-ams-production.ps1 -SkipBuild
```

**Stop:**

```powershell
.\scripts\stop-ams-lab.ps1
```

---

## Commands that must succeed (in order)

### 1. Prerequisites

```powershell
cd e:\AMS
.\scripts\ensure-opc-ae-lab.ps1
```

Expect: `opcaeps.dll: OK` (simulator line may say MISSING — OK for Honeywell).

### 2. Docker infrastructure

```powershell
docker inspect -f "{{.State.Health.Status}}" ams-postgres
docker inspect -f "{{.State.Health.Status}}" ams-kafka
docker inspect -f "{{.State.Health.Status}}" ams-flink-jobmanager
```

Expect: `healthy` for each.

### 3. Gateway (ACK + telemetry when `EnableRawEventPublish: true`)

```powershell
Invoke-RestMethod http://127.0.0.1:5050/health
Invoke-RestMethod http://127.0.0.1:5050/health/opc
```

Expect: `opcConnected: true`, Honeywell server in `servers`, `eventsPerSec` > 0 when DCS is active.

### 4. API and Swagger

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health -TimeoutSec 60
Invoke-WebRequest http://127.0.0.1:8000/swagger/index.html -UseBasicParsing
```

Swagger: HTTP **200**.  
`/health` may be **503** if a dependency is degraded — use pipeline health below.

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/v1/health/pipeline
```

Expect: `kafka.brokerHealth: Healthy`, `flink.restartCount: 0`, `gateway.opcConnected: true`.

### 5. Flink job

```powershell
docker exec ams-flink-jobmanager flink list
```

Expect: one **RUNNING** job: `AMS - Event-Sourced Alarm State Machine`.

Open: http://localhost:8082

### 6. Alarms with cookie (required for ACK)

```powershell
$h = @{ Authorization = "Bearer dev" }
(Invoke-RestMethod "http://127.0.0.1:8000/api/v1/alarms/active?pageSize=50&isAcknowledged=false" -Headers $h).items |
  Where-Object { $_.opcAttributes.cookieOffset -gt 0 } |
  Select-Object -First 5 sourceName, conditionName, @{N='cookie';E={$_.opcAttributes.cookieOffset}}
```

Expect: at least one row with **cookie > 0**.

If empty:

```powershell
.\scripts\backfill-cookies-from-kafka.ps1 -ServerId "<your-ServerId-from-honeywell-opc.ps1>"
```

### 7. Production ACK validation (go/no-go)

```powershell
.\scripts\validate-ams-production-ack.ps1 -ConnectedServerId "<your-ServerId>"
```

Expect: **all PASS**, especially:

- OPC Gateway connected  
- raw-opc-events with cookieOffset  
- API cookieOffset > 0  
- Flink job RUNNING  
- Lifecycle **ACK_CONFIRMED**  
- PostgreSQL/API ack state  

### 8. Frontend

```powershell
Invoke-WebRequest http://127.0.0.1:3000 -UseBasicParsing
```

Open: http://localhost:3000  
ACK only alarms with cookie (button enabled). Confirm on **Experion/DCS** that the alarm acknowledged.

---

## UI sync expectations

| Source | What updates |
|--------|----------------|
| SignalR `/hubs/alarms` | Grid rows, counts, lifecycle state |
| Pipeline ribbon | Kafka lag, Flink CP, gateway, OPC rate |
| ACK button | Disabled when `cookieOffset` missing |

**Smooth demo needs:** `kafka.lag ≈ 0`, gateway connected, no storm-only rows in grid (filtered), Flink RUNNING.

---

## What NOT to use for Honeywell sign-off

| Command | Purpose | Not DCS ACK proof |
|---------|---------|-------------------|
| `.\scripts\start-ams-lab.ps1` | Integration Objects simulator | Lab only |
| `.\scripts\run-autonomous-validation.ps1` | Storm + catch-up | Load test; storm has no cookie |
| `autonomous-ams-validation.ps1` alone | ACK-only :5050 after storm | Infrastructure, not Experion ACK |

---

## Troubleshooting quick reference

| Symptom | Action |
|---------|--------|
| Red errors before script runs (`&`, `Unexpected token 'fix'`) | Sync `scripts\start-ams-lab.ps1` from repo; do not edit throw messages with `&` inside double quotes on Windows PowerShell 5.1 |
| `SkipBuild` ignored | Command must be `.\scripts\start-ams-lab.ps1 -SkipBuild` (leading **`-`**) |
| Gateway not connected | Fix `OpcHost`/`OpcProgId`; DCOM; start Experion OPC A&E service |
| No cookieOffset | Wait for live events; run `backfill-cookies-from-kafka.ps1` |
| ACK_FAILED / timeout | Stale cookie or wrong active time — ack a **fresh** active alarm |
| UI empty | Check connected server in Admin → OPC Servers; enable OPC-AE server |
| API won't start | `appsettings.json` must use `localhost:5433` for Postgres |
| Port 3000 refused | `cd src\frontend; npm run dev` or re-run `start-ams-production.ps1` |

---

## Demo day sequence (15 min before client)

1. `.\scripts\stop-ams-lab.ps1` then `.\scripts\start-ams-production.ps1 -SkipBuild`
2. Wait for validation **all PASS**
3. Open http://localhost:3000 — confirm Honeywell alarms visible
4. Open http://127.0.0.1:8000/swagger/index.html — optional API demo
5. Pre-select one **unacked** alarm with **cookie > 0** for live ACK
6. Confirm same alarm clears/acks on **DCS**

---

## Production-ready statement

| Criterion | Required |
|-----------|----------|
| `validate-ams-production-ack.ps1` | **All PASS** on Honeywell host |
| DCS reflects ACK | Operator sees ack on Experion |
| UI shows ACK_CONFIRMED | Via SignalR only |
| No SQL/manual ack | Enforced by design |

Until all four are true on the **client DCS**, state: *architecture ready; DCS validation pending* — not *fully production deployed*.

---

## Related docs

- [Startup orchestration](./startup-orchestration.md)
- [E2E stabilization & ACK](./e2e-stabilization.md)
- [Enterprise architecture](./enterprise-cams-production-architecture.md)
