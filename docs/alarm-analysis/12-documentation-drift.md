# 12 — Documentation Drift: What the Docs Claim vs. What the Code Does

**Scope:** the alarm domain only. Every row below was verified directly against the working tree
at commit `2886ccb` (branch `main`, clean) on 2026-08-25.

**Why this file exists.** Three documents are treated as authoritative for the alarm pipeline —
`CLAUDE.md`, `architecture_document.md`, and `docs/ams-alarm-architecture.md`. All three describe
components, topics, and flows that **no longer exist in this repository**. Anyone reading them to
understand the alarm path will build a mental model that the code does not implement. Several of the
"missing feature" findings elsewhere in this analysis are only surprising if you started from the docs.

This file is the reconciliation layer: it does not itself judge whether a feature *should* exist, only
whether the documented artifact *does* exist.

---

## 1. Verification method

For each documented claim:

1. Extract the exact artifact named (class, file path, topic name, config key).
2. Test its existence with `test -e` for paths, and `rg --glob '!**/xmlgraphics-batik-main*/**'`
   for symbols across `src/`, `database/`, `infra/`, `scripts/`.
3. Record `EXISTS` / `MISSING` / `EXISTS BUT INERT` (present, but unreachable or disabled at runtime).

> **Search caveat for anyone repeating this work:** a plain recursive `grep -r` from the repo root
> times out (>2 min). The cause is **`CPA/`** — an untracked 6,824-file tree at the repo root
> (`git ls-files CPA` returns 0). Pass `--glob '!CPA/**'`, or use ripgrep, which respects `.gitignore`.
>
> Note that `CLAUDE.md:23` blames a different directory — `src/xmlgraphics-batik-main ScreeN Import/`
> — and instructs agents to ignore it. **That directory no longer exists** (verified: `src/` now holds
> only `backend`, `flink`, `frontend-ob`, `services`, and one markdown file). The instruction is stale
> and misdirects anyone tuning their searches; it is itself a drift item — see D-9 below.

---

## 2. Documented components that do not exist

`docs/ams-alarm-architecture.md` §13 ("Key source files reference") is a table of twelve paths.
**Five of them do not exist**, and two more point outside this repository:

| Documented as | Path in doc | Reality |
|---|---|---|
| OPC raw ingest | `src/backend/AMS.Api/BackgroundServices/OpcAeRawEventIngestService.cs` | **MISSING** — zero matches for the symbol anywhere under `src/` |
| ACK bridge | `src/backend/AMS.Api/BackgroundServices/AckFlinkBridgeService.cs` | **MISSING** — zero matches for `AckFlinkBridge` anywhere under `src/` |
| SignalR bridge | `src/backend/AMS.Api/BackgroundServices/SimpleKafkaSignalRBridgeService.cs` | **MISSING** |
| Gateway writeback | `e:\AMS\src\opc-gateway\AMS.OpcGateway\Kafka\AckWritebackConsumerService.cs` | **OUT OF REPO** — absolute path on another drive |
| Gateway OPC connection | `e:\AMS\src\opc-gateway\AMS.OpcGateway\OpcAe\OpcAeServerConnection.cs` | **OUT OF REPO** — absolute path on another drive |
| ACK commands | `src/backend/AMS.Application/Alarms/Commands/AlarmCommands.cs` | EXISTS |
| Operator publish | `src/backend/AMS.Infrastructure/Kafka/OperatorActionPublisher.cs` | EXISTS |
| Pipeline health | `src/backend/AMS.Infrastructure/Health/PipelineHealthService.cs` | EXISTS |
| Domain ACK logic | `src/backend/AMS.Domain/Alarms/ActiveAlarm.cs` | EXISTS |
| Flink job | `src/flink/src/main/java/com/ams/flink/OpcEventStreamJob.java` | EXISTS |
| Flink job scripts | `scripts/stabilize-ams-e2e.ps1`, `scripts/lib/AmsFlinkJob.ps1` | EXISTS |
| Docker compose | `infra/docker/docker-compose.yml` | EXISTS |

Additional symbols named in prose across the three authoritative docs, all returning **zero matches**
under `src/`:

| Symbol | Documented in | Claimed role |
|---|---|---|
| `AlarmStreamProcessorService` | `CLAUDE.md:100`, `architecture_document.md:75`, `docs/enterprise-cams-production-architecture.md:105` | ".NET fallback when `Kafka:UseFlinkOrchestration` is false" |
| `NotificationHub` | `architecture_document.md` §3.4 | Second SignalR hub for real-time distribution |
| `OpcAeRawEventIngestService` | `docs/ams-alarm-architecture.md` §6.3, §13 | API-side raw OPC A&E ingest |
| `AckFlinkBridge` / `AckFlinkBridgeService` | `docs/ams-alarm-architecture.md` §7.6, §13, §4 | API-side ACK confirmation bridge |

**Consequence for `AlarmStreamProcessorService` specifically.** `CLAUDE.md` presents it as a live
fallback path. In code the flag it is gated on does not select a fallback — it *aborts startup*:

```csharp
// src/backend/AMS.Api/Program.cs:115-125
var useFlinkOrchestration = config.GetValue("Kafka:UseFlinkOrchestration", true);
if (config.GetValue("Kafka:LabDirectIngest", false))
    throw new InvalidOperationException(
        "Kafka:LabDirectIngest is not permitted. AMS runs in Flink-only authoritative orchestration mode.");

if (!useFlinkOrchestration)
{
    throw new InvalidOperationException(
        "Kafka:UseFlinkOrchestration must be true. Flink owns the alarm lifecycle; " +
        "in-service stream processing and .NET ACK orchestration were removed.");
}
```

The name `AlarmStreamProcessorService` survives only inside that exception's prose. There is no
fallback: **Flink-only is hard-enforced**, and a deployment that sets the flag `false` will not boot.
`src/backend/AMS.Infrastructure/Health/FlinkOnlyIngestHealthCheck.cs:19-22` enforces the same rule as
a health check.

---

## 3. StreamPipes: named as the sole telemetry authority, entirely absent

`architecture_document.md` §3.1 is unambiguous:

> **Sole telemetry authority:** Apache StreamPipes (OPC UA) → `raw-opc-events` (schema v2).
> Zero QuickOPC/OpcLabs/COM/DCOM runtime dependencies.
> **Docs:** `docs/streampipes-connectivity.md`
> **Path:** … StreamPipes pipeline → **Kafka sink** → `ams-kafka:29092` / `raw-opc-events`

Verified:

| Artifact | Status |
|---|---|
| Any file matching `*streampipes*` in the repo | **MISSING** (zero results) |
| `docs/streampipes-connectivity.md` | **MISSING** |
| `infra/docker/docker-compose.streampipes.yml` | **MISSING** |
| A StreamPipes service in `infra/docker/docker-compose.yml` | **MISSING** — not among the 40 services declared |

The documented primary ingestion path has no implementation, no compose service, and no
configuration in this repository. See `01-source-and-ingestion.md` for what actually feeds the
pipeline instead.

---

## 4. The OPC Gateway is not part of this repository

Both the ingestion story and the DCS write-back story route through an "AMS OPC Gateway". Its source
is not here. The only build/run entry point is a script that reaches onto a different drive:

```powershell
# scripts/start-opc-gateway-lab.ps1:10-16
$gwDir = 'e:\AMS - HMI GRID\src\opc-gateway\AMS.OpcGateway\bin\Release\net8.0'
$exe = Join-Path $gwDir 'AMS.OpcGateway.exe'
if (-not (Test-Path $exe)) {
    Write-Host 'Building OPC Gateway...' -ForegroundColor Yellow
    Push-Location 'e:\AMS - HMI GRID\src\opc-gateway\AMS.OpcGateway'
    dotnet build -c Release
    Pop-Location
}
```

Note also that `docs/ams-alarm-architecture.md` §13 cites a *third* root for the same component
(`e:\AMS\src\opc-gateway\...`, without the ` - HMI GRID` segment), so the two documents do not even
agree on where the out-of-repo code lives.

**Implications:**

- No component in this repository implements the `ack-writeback → DCS` hop or the `ack-results`
  producer. Both are attributed to the gateway in `docs/ams-alarm-architecture.md` §4.
- The gateway cannot be reviewed, built, tested, containerised, or version-pinned from this repo.
  It appears in no `.sln`, no Dockerfile, and no compose service.
- `run-all.ps1` / `scripts/start-ams-docker-full.ps1` bring up the stack without it.

Hardcoded identity in the same script, all of which is lab-simulator-specific:

| Value | Line | What it is |
|---|---|---|
| `e:\AMS - HMI GRID\src\opc-gateway\...` | `scripts/start-opc-gateway-lab.ps1:10` | Absolute path on a drive that will not exist on any other machine |
| `7ce5ecbf-70c9-498d-b899-5c8bb7add383` | `:24` | OPC server GUID — also appears as the worked example in `docs/ams-alarm-architecture.md` §5.1 |
| `IntegrationObjects.OPCAEServer.Simulator.1` | `:27` | COM ProgID of a **simulator**, not a DCS |
| `http://127.0.0.1:5050/opc/servers/connect` | `:30` | Gateway control endpoint |
| `127.0.0.1:9093` | `:20` | Kafka external listener |

See `06-dcs-writeback.md` for the full hop-by-hop verdict and `09-dead-code-and-hardcoded.md` for the
wider hardcoded-environment sweep.

---

## 5. Ingest topic name: `raw-opc-events` vs `raw-alarms`

The two authoritative documents disagree with the deployment scripts.

| Source | Claimed ingest topic |
|---|---|
| `architecture_document.md` §2 diagram, §3.2, §15 | `raw-opc-events` |
| `docs/ams-alarm-architecture.md` §4 (topic table), §15 | `raw-opc-events` |
| `CLAUDE.md` (data-path summary) | `raw-opc-events`/`raw-alarms` (both, unresolved) |
| `infra/docker/flink-submit-raw-alarms.sh:2` header | `raw-alarms → current-alarm-state` |
| `infra/docker/flink-submit-raw-alarms.sh:13,47` | `RAW_ALARMS_STARTING_OFFSETS` → `--raw-alarms.starting-offsets` |
| `docs/plans/08-observability-and-ops.md:66` | acknowledges the drift: "the ingest topic is `raw-alarms`, not `raw-opc-events`" |

The submit script — which is what actually runs — parameterises **`raw-alarms`**. Authoritative
resolution of which topic `OpcEventStreamJob` subscribes to, and whether `raw-opc-events` has any live
producer or consumer at all, is in `04-kafka-architecture.md`.

---

## 6. Other drift items

| # | Claim | Where | Reality |
|---|---|---|---|
| D-1 | "Managed strictly via EF Core Migrations (`AmsDbContext.cs`)" | `architecture_document.md` §3.5 | `CLAUDE.md` calls `database/scripts/` "the sole live schema path"; **both** exist — `src/backend/AMS.Infrastructure/Migrations/` *and* 48 numbered SQL scripts, plus a bridging `database/scripts/03_apply_ef_migrations.sql`. Which is authoritative is resolved in `07-database-and-state.md`. |
| D-2 | "a highly customized Glassmorphism CSS design system" | `architecture_document.md` §3.7 | The frontend is OpenBridge web components (`@oicl/openbridge-webcomponents-react`), governed by `openbridge-agent-rules.md`. The Glassmorphism system is gone. |
| D-3 | SignalR hubs "`NotificationHub`, `AlarmHub`" | `architecture_document.md` §3.4 | Only `AlarmHub.cs` and `ObservabilityHub.cs` exist under `src/backend/AMS.Api/Hubs/`. |
| D-4 | "`OpcServerConfig.tsx`" admin panel | `architecture_document.md` §3.7 | Not present under `src/frontend-ob/src/components/Administration/`; the alarm-related panels there are `AlarmFeedConfig.tsx` and `AlarmRulesConfig.tsx`. |
| D-5 | "The Edge Agent captures the COM event locally" (§4 step 2) | `architecture_document.md` §4 | Contradicts §3.1 of the *same document*, which mandates "Zero QuickOPC/OpcLabs/COM/DCOM runtime dependencies". The document describes two mutually exclusive edge architectures. |
| D-6 | `docs/ams-alarm-architecture.md` topic table attributes `alarm-created` / `alarm-updated` / `alarm-cleared` to `OpcAeRawEventIngestService` | §4 | That producer class does not exist (§2 above), so the attribution cannot hold. Whether the topics themselves survive is resolved in `04-kafka-architecture.md`. |
| D-7 | "`(row deleted)` → UI state Cleared" | `docs/ams-alarm-architecture.md` §5.3 | Implies destructive delete on clear rather than an append-only history. Verified against the schema and sink code in `07-database-and-state.md`. |
| D-8 | Doc version stamp `2026-06-08 — production Flink pipeline` | `docs/ams-alarm-architecture.md` §15 footer | ~2.5 months stale relative to the working tree; §15 still describes "production validation mode" with `OpcGateway:EnableRawEventIngest=false` and `LabAckSimulator:Enabled=false` as *current targets*. |
| D-9 | "**Ignore** `src/xmlgraphics-batik-main ScreeN Import/` — that is the legacy reference app being retired … its `node_modules` dominate glob results" | `CLAUDE.md:23` | **The directory no longer exists.** `src/` contains only `backend`, `flink`, `frontend-ob`, `services`, and one `.md`. The instruction sends every agent and developer to tune searches against a phantom, while the actual search hazard — the untracked 6,824-file `CPA/` tree at the repo root — goes unmentioned. |
| D-10 | `run-all.ps1:8` states the script starts StreamPipes | `run-all.ps1` | StreamPipes is absent from the repo (§3). The banner describes a service that cannot start. |
| D-11 | `run-all.ps1:27` references `docker-compose.lab.yml`; `scripts/start-ams-docker-full.ps1:226` references a compose profile `observability` | both scripts | Neither exists. The only profile defined anywhere in `infra/docker/docker-compose.yml` is `mqtt-test`. |

---

## 7. Net effect

The drift is not cosmetic. Read together, the authoritative docs describe an alarm system with:

- a StreamPipes edge ingest tier — **which is not in the repo**;
- an out-of-repo OPC Gateway performing the DCS ACK write and the `ack-results` reply — **which is not
  in the repo**;
- API-side ingest and ACK-bridge services (`OpcAeRawEventIngestService`, `AckFlinkBridgeService`)
  projecting alarms and confirming ACKs — **which do not exist**;
- a .NET stream-processing fallback — **which was deleted, and whose config flag now aborts startup**.

Every one of those is load-bearing in the documented end-to-end story. What remains implemented in
this repository is reconstructed from code in `11-architecture-reconstruction.md`.

---

*Companion files:* `01-source-and-ingestion.md`, `04-kafka-architecture.md`, `06-dcs-writeback.md`,
`07-database-and-state.md`, `09-dead-code-and-hardcoded.md`, `11-architecture-reconstruction.md`.
