# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Two systems live in one monorepo:

1. **AMS / CAMS** — a production Consolidated Alarm Management System (OPC A&E 1.10 compliant, ISA-18.2 / EEMUA-191 aligned). This is the established platform: .NET 8 backend, Apache Flink stream processing, React frontend, Kafka backbone.
2. **Traverse Edge unification** — an in-progress migration (see `MIGRATION_LOG.md`) that folds a legacy "PI Vision++" HMI designer into AMS as a set of new microservices (`src/services/*`) plus an OpenBridge-based designer in `src/frontend-ob`. Phases 0–5 are largely landed (single commit `de23967`); Phase 5 (legacy decommission/hardening) is partial.

The end-to-end alarm data path: **OPC-UA / StreamPipes → Kafka (`raw-opc-events`/`raw-alarms`) → Flink (ISA-18.2 state machine, exactly-once) → PostgreSQL/TimescaleDB + IoTDB → .NET 8 Web API → SignalR (WebSockets) → React dashboard.** ACK flows back: `operator-actions` → Flink ACK orchestrator → `ack-writeback` → OPC Gateway → DCS → `ack-results`. Read `architecture_document.md` for the authoritative diagram and topic catalog before touching the pipeline.

## Top-level layout

- `src/backend/` — .NET 8 Clean Architecture solution: `AMS.Api` (Web API, SignalR hubs, background workers), `AMS.Application`, `AMS.Domain`, `AMS.Infrastructure` (EF Core / `AmsDbContext`), plus `AMS.Tests.Contract` and `AMS.Tests.Integration` (xUnit).
- `src/services/` — Traverse microservices. .NET 8 minimal APIs: `asset-model` (UNS source of truth), `binding-resolver` (path+role → transport), `display-service`, `template-service`, `analysis-service`, `historian-bff` (IoTDB reads), `notification-service`, `audit-service`, `cplm-api` (control-loop performance: the CPM REST API + the CPLM result/event-frame Kafka consumers). `sparkplug-edge-node` involves Java/edge code.
- `src/flink/` — Java (Maven) Flink jobs. Entry point of interest: `OpcEventStreamJob.java` (event-sourced alarm state machine); also `LiveStateJob`, `IoTDBPersistenceJob`, KPI jobs.
- `src/frontend-ob/` — React 18 + Vite + TypeScript dashboard using **OpenBridge web components**. The HMI Designer lives in `src/components/Designer/` (this is where the current working-tree changes are).
- `infra/docker/docker-compose.yml` — orchestrates the entire stack (~35 services). `infra/helm`, `infra/windows` for other deploy targets.
- `database/scripts/` — SQL schemas (the sole live schema path; the superseded `database/migrations/` tree was removed). Traverse uses **one PostgreSQL database per service** (`traverse_assets`, `traverse_templates`, `traverse_analysis`, `traverse_displays`, `traverse_shared`, `traverse_audit`, `traverse_cplm`); AMS core uses the `ams` database. Scripts run in filename order against `postgres` and `\c` into their own database — a new per-service database needs its own `NN_traverse_<svc>_db.sql` before the schema scripts that populate it.
- `scripts/` — large collection of PowerShell (`.ps1`) automation for build, deploy, E2E, and validation. This is the primary operational tooling; prefer these over ad-hoc commands.
- **Ignore** `src/xmlgraphics-batik-main ScreeN Import/` — that is the legacy reference app being retired (Batik/Konva); it is not part of the live path and its `node_modules` dominate glob results.

## Common commands

Platform is **Windows / PowerShell**. Automation scripts are `.ps1`; a POSIX Bash tool is also available.

### Full stack (canonical way to run everything)
```powershell
.\run-all.ps1                    # build images, start all services, deploy Flink job, open UI
.\run-all.ps1 -SkipBuild         # start without rebuilding
.\run-all.ps1 -InjectLabEvents   # also inject sample alarms for E2E
.\run-all.ps1 -SkipGoldenVerify  # skip the golden-path startup verification
```
This wraps `scripts/start-ams-docker-full.ps1`. Related: `scripts/start-ams-lab.ps1`, `scripts/stop-ams-lab.ps1`, `scripts/start-ams-production.ps1`.

### Frontend (`src/frontend-ob`)
```powershell
npm install
npm run dev      # Vite dev server on http://localhost:5174 (proxies /api → :5000, /api/bindings → :5002, /api/displays → :5003, /api/hist → :8090)
npm run build    # tsc typecheck + vite build → dist/
npm run lint     # eslint, --max-warnings 0 (must be clean)
```

### Backend & services (.NET 8)
```powershell
dotnet build src/backend/AMS.Api/AMS.Api.csproj
dotnet run --project src/backend/AMS.Api          # local dev API (Kestrel; frontend dev proxy expects :5000)
dotnet run --project src/services/binding-resolver # any service runs the same way
```

### Tests
```powershell
dotnet test src/backend/AMS.Tests.Integration      # xUnit integration tests
dotnet test src/backend/AMS.Tests.Contract         # contract tests
dotnet test tests/integration                       # Traverse binding-resolver tests
dotnet test --filter "FullyQualifiedName~BindingResolver"   # single test / class
dotnet test --filter "Category=Integration"                 # by trait
```
End-to-end validation is script-driven, not `dotnet test`: `scripts/e2e-full-system-test.ps1`, `scripts/test-full-pipeline-e2e.ps1`, `scripts/run-designer-e2e.ps1`, `scripts/production-acceptance-test.ps1`.

### Flink jobs
```powershell
.\scripts\build-flink-jar.ps1          # or: mvn -f src/flink/pom.xml clean package
```
Jobs are submitted to the Flink JobManager during stack startup; see `infra/docker/flink-submit-*.sh` and `scripts/ensure_flink_jobs.py`.

## Service ports (docker-compose)

| Service | Host port |
|---|---|
| ams-api (.NET) | 8000 (local dev Kestrel: 5000) |
| ams-frontend (nginx) | 3000 (dev Vite: 5174) |
| asset-model | 5001 |
| binding-resolver | 5002 |
| display-service | 5003 |
| template-service | 5004 |
| analysis-service | 5005 |
| cplm-api | 5006 |
| historian-bff | 8090 |
| audit-service | 8095 |
| Postgres | 5433 → 5432 |
| Redis | 6380 → 6379 |
| Kafka | 9093 (kafka-ui: 8085) |
| EMQX (MQTT/Sparkplug) | 1883, WS 8083, dashboard 18083 |
| IoTDB | 6667 |
| Flink JobManager UI | 8082 |
| Prometheus / Grafana | 9090 / 3001 |

## Architecture rules that aren't obvious from the code

These are settled decisions (`MIGRATION_LOG.md` "Recorded Decisions", `src/Unified-HMI-Platform-Feasibility-and-Transition-Plan.md`). Honor them:

- **CQRS discipline**: displays/templates are *configuration only* — no process values are stored in display snapshots. Live values arrive at runtime through the Binding Resolver.
- **Bind through the UNS**: everything addresses data by path + role, resolved to a transport by `binding-resolver`. UNS pattern is `root.<site>.<unit>.<device>.<measurement>`. Path+role → live (Sparkplug/Redis), history (IoTDB/historian-bff), or alarm (SignalR).
- **Flink-only compute**: analysis/aggregation runs as Flink jobs, not in-service. The .NET `AlarmStreamProcessorService` is only a fallback for when `Kafka:UseFlinkOrchestration` is `false`.
- **Reuse shared infra**: one Postgres cluster, one Kafka, one EMQX, one IoTDB — but a separate logical database per service.
- **CPLM lives in `cplm-api`, not `ams-api`**: the loop-performance REST API (`/api/v1/cpm/*`, proxied by nginx to `cplm-api:5000`), the `traverse_cplm` database, and the `clpm.*` result consumers all belong to that service. `ams-api` keeps only `RawLoopIotDbConsumer` (raw loop samples → IoTDB historian, its own consumer group). **The CPLM consumer groups (`ams-api-cplm-results`, `-frames`) must only ever have one member process** — two split the partitions and each persists a subset with no error logged. See [docs/cplm-consumer-cutover-runbook.md](docs/cplm-consumer-cutover-runbook.md) before moving or duplicating them.
- **DOM/SVG designer, not Konva**: the HMI designer renders with DOM/SVG. Do not reintroduce Konva. Batik is retired from the live path.
- **Two-tier displays**: controlled/versioned displays vs. operator-owned Personal Views (non-versioned).
- **Quality on reopen**: alarm/quality state must map to NAMUR NE107 + ISA-18.2 (Good/Uncertain/Bad/Maintenance/OutOfService).

## Frontend / OpenBridge conventions (mandatory)

`openbridge-agent-rules.md` is the canonical UI rulebook — read it before writing any UI. Key points:

- **Import only from `@oicl/openbridge-webcomponents-react`, per-path** (`ObcTopBar` from `.../components/top-bar/top-bar`). Never hand-write raw `<obc-*>` custom-element tags in JSX; never guess an import path.
- **Resolve any component/prop/slot/event from `node_modules/@oicl/openbridge-webcomponents/custom-elements.json`.** If it isn't in the manifest, it doesn't exist — ask rather than invent.
- **Drive all color/size/spacing from OpenBridge CSS tokens**; no raw hex, px font sizes, or bespoke spacing. Theme is set via `data-obc-theme` (`day`/`dusk`/`night`/`bright`) on the root.
- **All alarm/notification surfaces use OpenBridge alert components + alert tokens** (`alert-alarm`/`alert-critical`/`alert-caution`, blink-while-unacknowledged → steady-on-ack). Do not build custom banners/toasts. The alarm-state → OpenBridge-alert mapping is in `conversion.md`.
- **Icons**: use `obi-*` / `Obi…` OpenBridge icons only; no Lucide/FontAwesome/inline SVG for covered icons.
- Do **not** load the OpenBridge library's own contributor `AGENTS.md` / `.cursor/rules` — those are for library maintainers and give the wrong mental model here.

## State & realtime (frontend)

- **Zustand** for state (`src/store/`), **@tanstack/react-query** for server data, **@microsoft/signalr** for the alarm hub, **mqtt** + `sparkplug-payload` for live edge values. Charts use **echarts** and **d3**; grids use **ag-grid**.
