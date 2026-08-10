# 08 — Technology Rationale

**Purpose:** for every major component — what it is, why it was chosen here (citing the architectural rule or spec section), what it's used for (concrete flows), how to use it (developer/operator quick reference), and the production-grade delta (cross-referenced to GAP-IDs, not restated).
**Reviewed commit:** `4e2758c951df06a170f35d23313824cb57c9ef03`
**Date:** 2026-08-08
This document answers "about each and every thing used" without duplicating the deep findings — the delta column points to the gap register.

---

## Kafka
- **What:** distributed event log; `confluentinc/cp-kafka:7.5.3`, one broker, ZooKeeper-coordinated.
- **Why here:** durable event bus decoupling ingest → Flink → projectors; the spine of the event-sourced alarm pipeline (CLAUDE.md: "Kafka backbone"; spec §4).
- **Used for:** `raw-alarms` → Flink SM → `current-alarm-state`/`lifecycle-events`/`ack-writeback`; `operator-actions`/`ack-results` ACK loop; `loop.samples.v1` → CPLM; `live.*` → edge node; `audit-events`.
- **How to use:** topics auto-create (dev); produce/consume via Confluent .NET client + Flink KafkaSource/Sink; inspect at kafka-ui :8085.
- **Prod-grade delta:** RF≥3 KRaft, `min.insync.replicas=2`, `acks=all`, idempotent producers, disable auto-create + provision-as-code, longer retention → **STR-04**.

## Flink
- **What:** stateful stream processor; `flink:1.18.1-java11`, 1 JM + 1 TM (16 slots), RocksDB state backend.
- **Why here:** the settled "Flink-only compute" rule (CLAUDE.md; MIGRATION_LOG.md decision 3; spec §5) — all aggregation/state machines run as Flink jobs, not in services.
- **Used for:** ISA-18.2 alarm state machine (`OpcEventStreamJob`), live RBE (`LiveStateJob`, `LoopLiveRbeJob`), CPLM feature/gate engines, IoTDB persistence, on-demand replay.
- **How to use:** `build-flink-jar.ps1` → single shaded JAR; submitted via one-shot containers + 60s supervisor; UI at :8082.
- **Prod-grade delta:** explicit per-sink `DeliveryGuarantee` → **STR-01**; durable remote checkpoints → **STR-02**; JM HA → **STR-03**; savepoint upgrades + operator UIDs → **STR-11**; fix/retire unscheduled jobs → **STR-08**; supervise AnalysisExecutionJob → **STR-07**; image-baked artifact → **STR-13**.

## IoTDB
- **What:** time-series historian; `apache/iotdb:1.3.2-standalone`, session (:6667) + REST v2 (:8181).
- **Why here:** high-ingest historian separated from Postgres (spec §6); tree model fits UNS paths; REST + session fit .NET writers and the Flink connector.
- **Used for:** alarm history (`root.ams.site1.alarms.*`), raw loop samples (`root.site1.cpm.*`), CPLM KPIs; read via historian-bff `/trend|/raw|/summary|/series`.
- **How to use:** Flink session connector (batched) + REST v2 writers; query via historian-bff, IoTDB Workbench :8086, or CloudBeaver.
- **Prod-grade delta:** 3C3D cluster per spec §6 + async pipe standby → **DATA-04**; schema-template cardinality governance; unify alarm identity with the live plane → **DATA-07**; non-root creds → SEC-02.

## PostgreSQL / TimescaleDB
- **What:** relational SoT + time-series; `timescale/timescaledb:latest-pg15`, one instance, 8 logical DBs.
- **Why here:** relational SoT for the alarm projection + per-service config DBs (CLAUDE.md "one Postgres cluster, one logical DB per service"; MIGRATION_LOG.md decision 14); Timescale for time-series.
- **Used for:** `ams` alarm projection; `traverse_*` per-service config; CPLM analytics tables.
- **How to use:** init via `database/scripts/*.sql` (filename order, `\c` per DB); EF Core (`AmsDbContext`) + Dapper; pgAdmin :5050.
- **Prod-grade delta:** upsert-key unique index + server dimension → **DATA-01**; real hypertables/compression/retention → **DATA-02**; hot-predicate indexes → **DATA-10**; HA + PgBouncer + pool sizing → **DATA-05**; fix wrong-DB init scripts → **DATA-11**; add `alarm_history` writer → **DATA-06**; pinned image.

## Redis
- **What:** in-memory store; `redis:7.2-alpine`, `--maxmemory 512mb --maxmemory-policy volatile-lru`, AOF everysec.
- **Why here:** paint-on-open snapshots + asset/display pub-sub — a contract store, not a general cache (CLAUDE.md "Reuse shared infra"; 07-mqtt-sparkplug-live.md).
- **Used for:** `snapshot:metric:*` live snapshots (served by historian-bff `/snapshot`), `asset-events`/`display-events` pub-sub.
- **How to use:** edge node `setex` snapshots (TTL 3600s); historian-bff SCAN+GET on paint-on-open.
- **Prod-grade delta:** contract-tier `noeviction` separation → **DATA-03**; replace `/snapshot` SCAN with a snapshot index → **DATA-09**; SignalR backplane use → **SCALE-01**; `requirepass`/ACL + TLS → SEC-02.

## EMQX / Sparkplug
- **What:** MQTT broker; `emqx/emqx:5.6.0`, TCP 1883 + WS 8083; Sparkplug B via sparkplug-edge-node.
- **Why here:** browser-friendly live transport (MQTT over WS) with the industrial Sparkplug namespace + birth/death; avoids Kafka-to-browser (07-mqtt-sparkplug-live.md; spec §8.3-8.6).
- **Used for:** `live.*` Kafka → Sparkplug DDATA on EMQX → frontend `mqttStore`; Redis snapshots for cold start.
- **How to use:** edge node publishes `spBv1.0/{group}/…`; frontend subscribes per-screen (intended) via `/mqtt-ws`.
- **Prod-grade delta:** authenticator + per-client ACLs + WSS/TLS + authenticated browser upgrade → **AUTH-03**; fix dual-schema `live.metrics` → **STR-12**; EMQX clustering (07 §4).

## SignalR
- **What:** ASP.NET realtime hub; `/hubs/alarms` + `/hubs/observability` on ams-api.
- **Why here:** push alarm list/ack UX to the HMI without polling (01-system-overview.md).
- **Used for:** alarm New/Update/Cleared/Ack/Flood/SOE/KPI push; observability streams.
- **How to use:** frontend `alarmStore` connects with `accessTokenFactory`; auto-reconnect backoff; 30s poll fallback.
- **Prod-grade delta:** Redis backplane for multi-replica → **SCALE-01**; authorize `/hubs/observability` → **AUTH-04**.

## .NET 8 services (ams-api + Traverse)
- **What:** Clean-Architecture Web API (ams-api) + minimal-API microservices.
- **Why here:** the established platform stack (CLAUDE.md); one service per bounded context.
- **Used for:** alarm API/ingest/ACK/SignalR; UNS/binding/display/template/analysis/cplm/historian/audit.
- **How to use:** `dotnet run --project …`; consumers as `AddHostedService`; EF Core + Dapper.
- **Prod-grade delta:** de-duplicate copied auth module → **AUTH-08**; register ShelveExpiry + fix SQL → **DOM-02**; real DLQ + rebalance-safe commit → **DOM-01/STR-09**; resilience handlers → **RES-01**; per-client rate limits → **GW-03**; API caching → **DATA-08**.

## React / OpenBridge
- **What:** React 18 + Vite + TS SPA using OpenBridge web components; Zustand + React Query + SignalR + mqtt.
- **Why here:** OpenBridge is the mandated maritime/industrial design system (CLAUDE.md; openbridge-agent-rules.md); DOM/SVG designer (MIGRATION_LOG.md decision 6).
- **Used for:** alarm console, live events, trends, HMI designer, dashboards.
- **How to use:** `npm run dev` (:5174, proxies to services); per-path OpenBridge imports; Zustand stores per channel.
- **Prod-grade delta:** scope firehose + coalesce + memoize → **FE-01/FE-04**; ref-count MQTT unsubscribe → **FE-06**; loading states → **FE-05**; debounce + AbortController → **FE-02/FE-03**; fix deep link + dead deps → **FE-07**.

## nginx
- **What:** SPA host + reverse proxy (`nginx:1.25-alpine`), `listen 80`.
- **Why here:** serve the built SPA and proxy `/api/*` to many backends (02-docker-compose-services.md).
- **Used for:** static SPA + 11 upstream routes + `/hubs` + `/mqtt-ws`.
- **How to use:** `nginx.conf` location blocks; dev uses Vite proxy instead.
- **Prod-grade delta:** replace/augment with a real gateway (TLS, authn check, rate limit, cache, body limits) → **GW-01/GW-02/GW-03**; non-root image → SEC-01.

## auth-service
- **What:** Node/Express RS256 JWT issuer; `traverse_auth`.
- **Why here:** central issuer; services validate JWKS (08-auth-architecture.md); no OIDC discovery by design.
- **Used for:** login, refresh (single-use rotation), JWKS, user/role/permission admin.
- **How to use:** `/api/auth/*`; frontend holds access token in memory, refresh in httpOnly cookie.
- **Prod-grade delta:** access-token revocation → **AUTH-05**; key rotation → **AUTH-06**; strong service identity replacing the shared key → **AUTH-01**; remove authz kill switch → **AUTH-02**.

## Prometheus / Grafana
- **What:** metrics + dashboards; `prom/prometheus:v2.51.2`, `grafana:10.4.2`.
- **Why here:** RED/USE observability of the stack.
- **Used for:** scrape ams-api, historian-bff, Flink, IoTDB, exporters (redis/postgres/kafka).
- **How to use:** Prometheus :9090, Grafana :3001.
- **Prod-grade delta:** disable/auth the admin API, wire Alertmanager + SLO dashboards + pipeline-lag alert (closing the `lifecycle-alerts` loop), scrape the Traverse services + auth-service → **OPS-01**, **STR-05**, SLOs in 07 §5.

## Container platform (Docker Compose)
- **What:** 37-service compose stack on one bridge network.
- **Why here:** single-host lab orchestration of the full stack (`run-all.ps1`).
- **Used for:** the entire dev/lab deployment.
- **How to use:** `.\run-all.ps1`.
- **Prod-grade delta:** non-root + digest-pinned + resource-limited containers, log rotation, network segmentation, secrets externalization, and a Helm/K8s production profile → **SEC-01**, **SEC-02**, **OPS-01**; the four-tier resource-anchor mapping is in 10 §2.
