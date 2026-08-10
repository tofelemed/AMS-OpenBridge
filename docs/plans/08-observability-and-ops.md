# Plan 08 — Observability, Secrets & Container Hardening

**Phase:** 3 · **Effort:** M · **Depends on:** Plans 01–07 (measures what they deliver); Plan 02 item 2 supplies the alert source
**Gaps closed:** OPS-01, OPS-02, SEC-01, INFO-01, INFO-02
**Objective:** be able to *prove* the SLOs, alert before operators notice, and make the container estate safe to run outside a lab.

## Why

Metrics exist but nothing alerts: Alertmanager is commented out, the Grafana provisioning directory contains **zero dashboards**, and the Traverse services, auth-service, and historian-bff are not scraped at all — so the trend-latency SLO cannot even be measured. Prometheus runs with an unauthenticated admin API on a published port. Seven of eight Traverse services run as root, no container has a resource limit, and the log-rotation anchor defined in compose is referenced by nothing.

## Work items

| # | Task | Gap | Where | Effort |
|---|---|---|---|---|
| 1 | Scrape every service; add SLI recording rules | OPS-01 | `infra/docker/prometheus.yml` | S |
| 2 | Wire Alertmanager + the alert rule set | OPS-01 | `infra/docker/`, new rules file | M |
| 3 | Provision SLO dashboards | OPS-01 | `infra/docker/grafana/provisioning/dashboards/` | M |
| 4 | Lock down the monitoring stack itself | OPS-01 | compose, `prometheus.yml` | S |
| 5 | Container hardening (non-root, limits, pinning, logs) | SEC-01 | all Dockerfiles, compose | M |
| 6 | Config hygiene cleanup | OPS-02 | compose, `.env.example`, scripts | S |
| 7 | Record the deliberate trade-offs as contracts | INFO-01, INFO-02 | `docs/` | S |

## Implementation steps

### 1. Complete metric coverage (OPS-01)

- Add scrape jobs for the eight Traverse services, auth-service, and historian-bff (historian-bff exposes `/metrics` but is not scraped — its absence is why trend p95 is unmeasurable).
- Add recording rules for the SLIs defined in the review: field-to-HMI latency, trend query p95, alarm-pipeline consumer lag, alarm-push availability, Flink checkpoint success.
- Instrument the end-to-end live latency properly: stamp the event at ingest and record the delta at the client (or at the edge publish) — today no single metric spans the path.

### 2. Alerting (OPS-01)

- Deploy Alertmanager (currently commented out) with a real notification route.
- Minimum rule set:
  - **Stalled feed / ACK SLA breach** — fed by the `lifecycle-alerts` consumer from Plan 02 item 2. This closes the loop on the platform's own safety watchdogs.
  - Consumer-group lag above SLO.
  - Flink checkpoint failures; job not RUNNING.
  - DLQ depth non-zero (Plan 01 item 2).
  - Redis contract-tier memory > 80% (Plan 05 item 3).
  - Postgres connection saturation; disk growth trend.
  - Certificate expiry (post Plan 04).

### 3. Dashboards (OPS-01)

- Provision dashboards as code into the (currently empty) provisioning directory: an SLO overview, alarm-pipeline health (ingest → Flink → projection → push), data-store saturation (USE), and an API/gateway RED view.

### 4. Secure the monitoring stack (OPS-01)

- Remove `--web.enable-admin-api` (or authenticate it) — it currently allows anonymous TSDB deletion on a published port.
- Fix the committed EMQX scrape credentials, which do not even match the broker's configured password; move them to secrets (coordinate with Plan 03 item 8).
- Put Prometheus and Grafana behind authentication; stop publishing them on the host in production profiles.

### 5. Container hardening (SEC-01)

- Add a non-root `USER` to the seven Traverse .NET services and both nginx images (ams-api, historian-bff, sparkplug-edge-node, and auth-service already do this — copy their pattern).
- Pin images by digest, not floating tags (`timescale/timescaledb:latest-pg15`, `dpage/pgadmin4:latest`, `provectuslabs/kafka-ui:master` are all floating today).
- Apply the four-tier resource anchors: every service gets CPU/memory limits — currently **no** service has any, so one container can exhaust the host.
- Reference the `x-logging` anchor that is defined in compose but attached to nothing, so logs actually rotate.
- Add `cap_drop`, `read_only` where feasible, and stop publishing internal store ports to the host.

### 6. Config hygiene (OPS-02)

- Remove the phantom `kafka-1:9093,kafka-2:9094` brokers from the kafka-ui bootstrap list (they do not exist).
- Resolve `docker-compose.streampipes.yml`: it is referenced by `.env.example` as the production ingest path but is **not in the repo** — either add it or delete the references.
- Fix the stale e2e scripts that assert `ALLOW_ANONYMOUS=false` while compose sets it true.
- Reconcile the 17 documentation-drift items from the review's Phase 0 inventory (notably: the ingest topic is `raw-alarms`, not `raw-opc-events`; the `UseFlinkOrchestration` fallback no longer exists).

### 7. Record the deliberate contracts (INFO-01, INFO-02)

- Document the retained **at-least-once + idempotent sink** contracts (IoTDB `series+ts`, live.* `alarmId+ts`, CPLM `ON CONFLICT`) so future changes do not "fix" them into exactly-once unnecessarily.
- Record that the 30 s SignalR poll-fallback is correct by design (guarded per tick, cannot stack timers) so it is not re-investigated.

## Exit criteria

- [ ] Every deployed service is scraped; the trend-p95 and field-to-HMI SLIs produce real numbers.
- [ ] A stalled OPC feed pages an operator via Alertmanager (end-to-end test).
- [ ] SLO dashboards load from provisioning on a clean deploy.
- [ ] The Prometheus admin API is unreachable anonymously; no monitoring credential is committed.
- [ ] No container runs as root; every service has CPU/memory limits; all images are digest-pinned; logs rotate.
- [ ] `docker compose config` contains no reference to a non-existent service, file, or broker.
- [ ] The documented trade-offs are written down where an implementer will find them.

## Rollback

Every item is additive configuration. Resource limits are the one behavioural risk — introduce them with generous headroom, observe for a week, then tighten. Non-root conversion can break file permissions on mounted volumes; test per service and revert individually if needed.

## Risks & notes

- **Alert fatigue:** start with the small rule set above and tune thresholds against a week of real data before adding more.
- Resource limits set too tight will OOM the Flink TaskManager, which deliberately has none today because it hosts the CPLM long-diagnostics state — size it from observed usage, not a guess.
- Digest pinning increases upgrade friction; pair it with a scheduled dependency-bump job so images do not silently rot.
