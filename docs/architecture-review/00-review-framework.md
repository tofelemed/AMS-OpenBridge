# Traverse AMS Edge — Architecture Review Framework

**Document type:** Review framework and section contracts (input to Claude Code execution prompt)
**Scope:** Full-stack review of the AMS/Traverse monorepo — architecture, security, data layer, streaming, frontend, scalability, operability
**Grading model:** Dual-column (Lab vs Production-candidate)
**Governing principle:** Every finding must be verified against code, not documentation. Documentation-derived claims are hypotheses until confirmed with `file:line` evidence.
**Roadmap treatment:** Roadmap items (API gateway, RBAC Phase 6, headless reporting) are graded as gaps like all others. Roadmap status is recorded in a `Roadmap` column, never used to reduce severity.

---

## 1. Grading model

### 1.1 Dual-column grades

Every assessed capability receives two independent grades:

| Grade | Lab column meaning | Production column meaning |
|---|---|---|
| **A — Conformant** | Correct for lab purpose, no action | Meets production-candidate bar with evidence |
| **B — Acceptable with note** | Works; documented shortcut | Acceptable with a compensating control that is itself verified |
| **C — Deficient** | Impedes lab work or masks defects | Material gap; remediation required before production candidacy |
| **D — Blocker** | Breaks lab workflows | Disqualifying for production; must appear in remediation Phase 1 |

### 1.2 Severity scale (gap register)

| Severity | Definition | Example class |
|---|---|---|
| **S1 — Blocker** | Data loss, security bypass, or availability failure under normal production operation | Checkpoints on local volume; auth bypass flag; single-broker Kafka |
| **S2 — Critical** | Failure under plausible fault or load; silent correctness risk | Snapshot eviction blank-screen; consumer-group split; no Flink HA |
| **S3 — Major** | Degrades operability, performance, or maintainability at scale | Missing indexes; no rate limiting; no API-tier caching |
| **S4 — Minor** | Hygiene, drift risk, or hardening item | Copied auth module; plaintext lab credentials; image pinning |
| **S5 — Informational** | Documented divergence or deliberate trade-off to record | At-least-once + idempotent sink as a stated contract |

### 1.3 Evidence rules (non-negotiable)

1. Every finding cites `path/file.ext:line-range` from the actual repository. No citation → the finding is marked `UNVERIFIED` and excluded from grading.
2. Where documentation and code disagree, code wins; the divergence itself is logged as a finding (documentation drift, S4 minimum).
3. Absence claims ("no rate limiting exists") require the search commands executed and their empty results recorded in an evidence appendix.
4. No fabricated line numbers, no paraphrased code presented as quotation.
5. Each finding records: ID, claim, evidence, standard/practice reference, Lab grade, Production grade, severity, remediation, effort (S/M/L), roadmap status.

---

## 2. Standards and practice anchors per domain

Findings must reference the applicable anchor. This list is the authoritative mapping.

| Domain | Anchors |
|---|---|
| Microservices architecture | Database-per-service, smart-endpoints/dumb-pipes, bounded contexts (DDD), Twelve-Factor App (config, disposability, backing services), CQRS conformance per project rules |
| Authentication & authorization | OWASP ASVS 4.0 (V2 Authentication, V3 Session, V13 API), RFC 8725 (JWT BCP), RFC 9700 (OAuth 2.0 Security BCP), NIST SP 800-63B, IEC 62443-3-3 SR 1.x/2.x |
| API edge / gateway | OWASP API Security Top 10 (2023), rate-limiting patterns (token bucket / sliding window), backend-for-frontend pattern, TLS termination and mTLS zoning per IEC 62443 zones/conduits |
| Relational data layer | PostgreSQL indexing practice (covering/partial indexes matching predicates), TimescaleDB hypertable + compression policy guidance, connection pooling (PgBouncer/Npgsql pool sizing), EF Core read-path hygiene (`AsNoTracking`, mandatory pagination) |
| Time-series historian | Apache IoTDB deployment guidance (standalone vs 3C3D per the Traverse Edge specification §6), TTL/retention, schema template cardinality control |
| Cache / snapshot tier | Redis persistence (AOF everysec) and eviction-policy correctness relative to contract (paint-on-open is a contract, not a cache), key TTL governance |
| Kafka | Production checklist: RF ≥ 3, `min.insync.replicas=2`, `acks=all`, idempotent producers, explicit topic provisioning (`auto.create.topics.enable=false`), KRaft migration posture, consumer lag SLOs |
| Flink | HA (ZK/K8s HA services), durable remote checkpoint storage, explicit sink `DeliveryGuarantee`, savepoint-based upgrade procedure, state TTL, backpressure monitoring |
| MQTT / Sparkplug | Eclipse Sparkplug 3.0 (birth/death lifecycle, alias discipline, QoS 0 + no-retain constraints), EMQX production hardening (authn, per-client ACLs, TLS/WSS) |
| Frontend performance | Core Web Vitals, RAIL model, React render hygiene (memoization discipline, list virtualization), subscription lifecycle hygiene (unsubscribe on unmount/navigation), debounce/throttle on user-driven query inputs, explicit loading/error/empty states, request cancellation (AbortController) |
| Alarm domain | ISA-18.2 (state model, latency expectations), EEMUA 191 (KPI targets), ISA-101 (display hierarchy), NAMUR NE107 (quality states) |
| Reliability & operations | SRE practice (SLI/SLO/error budget), health/readiness/liveness separation, graceful shutdown, chaos assumptions (broker loss, JM loss, Redis eviction), observability coverage (RED/USE) |
| Container & supply chain | Non-root containers, pinned digests, resource limits (per the four-tier anchor system in progress), secrets externalization, image scanning |

---

## 3. Verification hypothesis register

Each hypothesis below is derived from project documentation and must be **confirmed, refuted, or amended** with code evidence before any document is written. Status values: `CONFIRMED | REFUTED | AMENDED | UNVERIFIED`.

| ID | Hypothesis | Primary evidence targets |
|---|---|---|
| H-01 | nginx front door performs no authentication, rate limiting, or response caching — proxy only | `src/frontend-ob/nginx.conf` |
| H-02 | No API gateway service exists anywhere in the stack (no envoy/kong/yarp/ocelot service, no gateway project) | `infra/docker/docker-compose.yml`, repo-wide search |
| H-03 | auth-service exposes JWKS only; no OIDC discovery document; JwtBearer `Authority` flow impossible | `src/services/auth-service/` routes |
| H-04 | `TraverseAuth.cs` is byte-copied into 7 services with a sync script and CI drift check as sole mitigation | `src/services/_shared/TraverseAuth.cs`, `scripts/sync-auth-module.ps1`, `.github/workflows/ci-cd.yml` |
| H-05 | Default service key `traverse-internal-dev-key` fallback exists; fail-closed only in production environment mode | compose env, `TraverseAuth.cs` |
| H-06 | `Security__DisableApiAuthorization` flag exists in ams-api and can disable authorization wholesale | `src/backend/AMS.Api/Program.cs`, compose |
| H-07 | Flink Kafka sinks set no `DeliveryGuarantee` → effective at-least-once despite EXACTLY_ONCE checkpoint mode | all `KafkaSink` builders in `src/flink/` |
| H-08 | No Flink HA; recovery is a 60 s supervisor resubmit loop; in-flight state windows lost on JM loss | `infra/docker/flink-job-supervisor.sh`, compose `FLINK_PROPERTIES` |
| H-09 | Flink checkpoints target a local Docker volume (`file:///flink-checkpoints`) — not durable beyond the host | compose `FLINK_PROPERTIES`, volume declarations |
| H-10 | `AnalysisExecutionJob` is supervised only by the host-side script, not the compose supervisor → dies silently after JM restart | `flink-job-supervisor.sh` vs `scripts/ensure_flink_jobs.py` |
| H-11 | Kafka: single broker, Zookeeper-based, `auto.create.topics.enable=true`, default 4 partitions, 24 h retention, effective RF=1 | compose kafka env |
| H-12 | IoTDB runs standalone (1.3.2) vs the specified 3C3D production topology | compose, `Traverse-Edge-Platform-Specification.md` §6 |
| H-13 | Redis: `volatile-lru`, ~200 MB maxmemory, TTL on snapshot keys — the paint-on-open contract is evictable under memory pressure | compose redis command args, `AlarmMetricPublisher.java` TTL |
| H-14 | PostgreSQL projection upsert key is `serverId+sourceName+conditionName+subConditionName`; verify a unique index actually backs this key, and inventory all indexes vs hot query predicates | `database/scripts/*.sql`, `NormalizedAlarmIngestor.cs`, EF configuration |
| H-15 | No caching tier between ams-api reads and PostgreSQL (no `IMemoryCache`/`IDistributedCache`/output caching on hot read endpoints) | `src/backend/AMS.Api/` repo search |
| H-16 | No rate limiting middleware anywhere in any .NET service (`AddRateLimiter` absent) and none in nginx (`limit_req` absent) | repo-wide search |
| H-17 | EMQX allows anonymous connections in lab; no per-client ACLs scoping Sparkplug subscriptions | compose emqx env, EMQX config |
| H-18 | historian-bff performs no result caching and no IoTDB session/connection pooling discipline; verify pagination bounds on `/raw` | `src/services/historian-bff/Program.cs`, `IoTDbClient.cs` |
| H-19 | Single PostgreSQL instance; no replicas, no PgBouncer; Npgsql pool sizes unconfigured (defaults) | compose, connection strings |
| H-20 | Secrets in compose as plaintext defaults (`supersecurepassword123`, `admin/ChangeMe123!`, root/root IoTDB) | compose, `database/scripts` |
| H-21 | CPLM consumer-group single-member constraint (`ams-api-cplm-results`, `-frames`) is enforced only by flag/convention — nothing technical prevents a second member | `cplm-api` consumer config, compose |
| H-22 | `lifecycle-alerts` (telemetry deadman output) has no consumer — stall alerts go nowhere | topic catalog vs all consumer registrations |
| H-23 | Sparkplug device-id (sanitised sourceName) vs IoTDB path (sanitised alarmId) divergence forces frontend-side resolution (`resolveHistorianPathForLiveAlarm`) — a namespace-consistency violation against the UNS single-source-of-truth rule | `AlarmMetricPublisher.java`, `src/frontend-ob/src/utils/iotdbPaths.ts` |
| H-24 | SignalR has no scale-out backplane (no Redis backplane) → ams-api cannot run more than one replica for hub traffic | `Program.cs` SignalR registration |
| H-25 | Frontend: verify AG Grid virtualization config, MQTT unsubscribe-on-navigation, debounce on filter inputs, AbortController on fetches, loading/error/empty states on every data surface, ECharts progressive rendering for large trend sets | `src/frontend-ob/src/components/**`, `store/*.ts` |
| H-26 | Frontend fallback polling (30 s when SignalR disconnected) — verify it stops on reconnect and does not stack timers | `alarmStore.ts` |
| H-27 | Containers run as root, images pinned by tag not digest; resource limit anchors (four-tier system) not yet applied to all services | Dockerfiles, compose |
| H-28 | No graceful-shutdown handling in Kafka consumer background services (offset commit + drain on SIGTERM) | `BackgroundServices/*.cs` |

---

## 4. Discovery sweep (beyond the hypotheses)

Claude Code must execute these searches and record commands + results in the evidence appendix. Empty results are findings, not omissions.

```bash
# Data layer
grep -rn "CREATE INDEX\|CREATE UNIQUE INDEX" database/scripts/
grep -rn "create_hypertable\|add_compression_policy\|add_retention_policy" database/scripts/
grep -rn "AsNoTracking\|Skip(\|Take(" src/backend/ src/services/
grep -rn "Maximum Pool Size\|Pooling=" src/ infra/

# Caching & resilience
grep -rn "IMemoryCache\|IDistributedCache\|OutputCache\|ResponseCach\|AddStackExchangeRedisCache" src/
grep -rn "AddRateLimiter\|RateLimiterOptions" src/
grep -rn "limit_req\|proxy_cache" src/frontend-ob/nginx.conf
grep -rn "Polly\|AddResilienceHandler\|CircuitBreaker\|Retry" src/

# Kafka correctness
grep -rn "enable.auto.commit\|auto.offset.reset\|max.poll\|EnableAutoCommit\|AutoOffsetReset" src/
grep -rn "setDeliveryGuarantee\|DeliveryGuarantee" src/flink/
grep -rn "setTransactionalIdPrefix" src/flink/

# Frontend performance
grep -rn "debounce\|throttle" src/frontend-ob/src/
grep -rn "AbortController\|signal:" src/frontend-ob/src/
grep -rn "rowBuffer\|rowModelType\|suppressRowVirtualisation" src/frontend-ob/src/
grep -rn "unsubscribe\|client.end\|removeAllListeners" src/frontend-ob/src/store/mqttStore.ts
grep -rn "isLoading\|isError\|isFetching" src/frontend-ob/src/ | wc -l   # coverage signal, then spot-check surfaces

# Security & ops
grep -rn "USER \|useradd\|adduser" src/**/Dockerfile*
grep -rn "healthcheck" infra/docker/docker-compose.yml
grep -rn "IHostApplicationLifetime\|StopAsync" src/backend/AMS.Api/BackgroundServices/
```

Additional manual inspections: nginx buffer/timeout/WebSocket settings; EMQX listener auth config; Flink `FLINK_PROPERTIES` in full; every `Program.cs` for middleware order (authn → authz → endpoints); React Query default `staleTime`/`gcTime`; Vite build chunking.

---

## 5. Document skeletons (section contracts)

All documents are written to `/docs/architecture-review/`. Every document opens with the same header block: purpose, date, commit SHA reviewed, verification status legend, and a dual-column summary grade table for its domain. Diagrams are Mermaid. Prose is professional and evidence-led; no unverified claims.

### 00-review-index.md
Purpose, reading order, commit SHA, methodology summary (hypothesis → verification → grading), consolidated dual-column scorecard across all domains (one row per domain, Lab grade, Production grade, top S1/S2 count), links.

### 01-architecture-assessment.md
1. System context (C4 level 1 Mermaid) and container diagram (C4 level 2).
2. Microservices maturity assessment: service inventory with, per service — bounded context, owned database, sync/async coupling, independent deployability verdict. Explicit answer to "is this microservices-based or a distributed monolith", with evidence (shared JAR for all Flink jobs, copied auth module, compose-level coupling all weighed).
3. CQRS conformance audit against the project's own enforced rules (display config purity, Flink-only compute, projection-only Postgres writes) — each rule: where enforced in code, where violated.
4. Twelve-Factor scorecard (dual-column).
5. Coupling and failure-domain analysis: what fails together and why.

### 02-auth-security-review.md
1. Auth architecture as-built (sequence diagram: login, refresh, service-to-service).
2. ASVS-mapped findings table (control → status → evidence → grades).
3. Token lifecycle: TTLs, revocation path, refresh rotation, JWKS cache behavior, key rotation procedure (or absence).
4. Service-to-service trust: X-Service-Key model vs mTLS/SPIFFE target; copied-module drift risk.
5. Authorization bypass surfaces (H-06 and any others found).
6. IEC 62443 zone/conduit conformance of the deployed topology.
7. Secrets management posture.
8. Verdict: explicit dual-column answer to "is auth-service production grade", itemized.

### 03-api-gateway-and-edge.md
1. Current edge as-built (nginx route map, what it does and does not do).
2. Gap analysis vs gateway responsibilities: authn offload vs zero-trust retention decision, rate limiting (per-client, per-route), response caching candidates (which routes are cacheable and which must never be), request size limits, circuit breaking, WebSocket/SSE handling (SignalR, MQTT-WS pass-through).
3. Target design proposal: candidate technologies (YARP, Envoy, Kong OSS) evaluated against the .NET estate and IEC 62443 zoning; recommended option with rationale.
4. Redis-backed gateway caching and rate-limit counter design (key schema, TTLs, fail-open vs fail-closed policy).
5. Migration plan with phase gates.

### 04-data-layer-performance.md
1. PostgreSQL: schema inventory per database; index inventory vs hot predicates (active alarm list, history search, KPI reads) with missing-index proposals as concrete DDL; upsert-key backing index verdict (H-14); Timescale usage audit (are hypertables actually used where claimed); pool sizing; EF read-path hygiene findings.
2. IoTDB: write-path batching, schema/cardinality control, TTL policy, standalone-vs-3C3D divergence, decimated query conformance to the BFF contract.
3. Redis: contract-vs-eviction analysis (H-13) with remediation options (dedicated instance without eviction for contract keys, `noeviction` + sizing, or key-class separation).
4. Caching strategy end-to-end: what is cached today at each tier (React Query, Redis snapshots, nothing at API tier), what should be, with invalidation strategy per candidate.
5. Backup/restore and retention posture per store.

### 05-streaming-review.md
1. Kafka production-readiness table (config → current → required → grades).
2. Topic catalog audit: provisioning discipline, partitioning rationale vs consumer parallelism, compaction correctness on `current-alarm-state`, dead/orphan topics (H-22).
3. Flink: **how jobs are built, submitted, supervised, upgraded, and monitored today** (full lifecycle narrative — this is the "how we create and use Flink jobs" deliverable), delivery-guarantee analysis (H-07) with the idempotency contract stated explicitly per sink, checkpoint durability (H-09), HA (H-08), savepoint upgrade procedure design, state-size and backpressure observability.
4. Consumer correctness in .NET services: offset commit discipline, graceful shutdown (H-28), single-member group enforcement (H-21) with a technical enforcement proposal (e.g., static membership + assignment assertion, or leader lease).
5. Prod-grade operating runbook outline: broker loss, JM loss, lag SLO breach, replay procedure.

### 06-frontend-performance.md
1. Render architecture (stores, query cache, realtime channels — diagram).
2. Findings per practice area with evidence: list virtualization, memoization discipline, debounce/throttle on filters and search, loading/error/empty state coverage per route, request cancellation, subscription hygiene (MQTT topic scope + unsubscribe, SignalR reconnect behavior, poll-fallback correctness H-26), bundle analysis (chunking, lazy routes), WebSocket message-rate handling vs display refresh cap.
3. Per-route audit table: `/alarms`, `/live-events`, `/trend`, `/dashboard`, `/analytics` — data source, update mechanism, identified risks, grades.
4. Remediation list ranked by user-visible impact.

### 07-scalability-reliability.md
1. Load model: target thousands of concurrent operators translated into concrete numbers per tier (SignalR connections, MQTT subscriptions, BFF QPS, Postgres QPS) with the math shown.
2. Horizontal-scale blockers per service (H-24 SignalR backplane, consumer-group constraints, stateful assumptions).
3. Single-point-of-failure inventory (dual-column: acceptable in lab / blocker in production).
4. HA/DR target architecture: Kafka RF≥3 + KRaft, Flink HA + remote checkpoints, IoTDB 3C3D, Postgres replication, Redis sizing/eviction fix, EMQX clustering.
5. SLO proposal: field-to-HMI latency (≤1.5 s per spec §11), trend p95 <1 s, alarm-pipeline lag, availability targets — with the metrics that would measure each and which already exist in Prometheus.
6. Failure-mode table extended from the project's own list, each with detection + mitigation.

### 08-technology-rationale.md
One section per component (Kafka, Flink, IoTDB, PostgreSQL/Timescale, Redis, EMQX/Sparkplug, SignalR, .NET services, React/OpenBridge, nginx, auth-service, Prometheus/Grafana): **what it is, why it was chosen here (cite the architectural rule or spec section), what it is used for in this system (concrete flows), how to use it (developer/operator quick reference), and what production-grade operation of it looks like** (the delta between current usage and prod-grade, cross-referenced to gap IDs). This document answers the "about each and every thing used in this project" requirement without duplicating the deep findings.

### 09-gap-register.md
Single flat table, sortable: `GAP-ID | Domain | Finding | Evidence | Standard anchor | Lab grade | Prod grade | Severity | Roadmap status | Remediation | Effort | Phase`. Followed by a phased remediation roadmap (Phase 1 = all S1 + selected S2; Phase 2 = S2/S3; Phase 3 = S3/S4 hardening), each phase with entry/exit criteria. Roadmap items appear graded like all others per the review decision.

### 10-target-architecture.md — consolidated to-be architecture (build-against reference)
This is the authoritative target-state document. The domain documents (03/04/05/07) analyze and justify their targets; this document **consolidates them into one coherent, implementable architecture** in the same register as the Traverse Edge platform specification. It must be self-sufficient: an engineer must be able to build against it without reading the review documents, using GAP-ID cross-references only for rationale.

1. **Target system context and container diagrams** (C4 L1/L2, Mermaid) — the complete to-be topology, edge to historian, with every service, trust boundary (IEC 62443 zones/conduits), and protocol labeled.
2. **Target microservices topology** — final service inventory with bounded context, owned database, sync/async contracts; any recommended consolidations or splits with rationale; deployment target (Compose lab profile vs Helm/Kubernetes production profile) and how the four-tier resource-anchor system maps onto it; shared-code resolution (auth module build-context fix per the documented alternatives).
3. **Target edge and API gateway** — selected gateway technology with decision record (options considered, criteria, verdict); full request path diagram (client → gateway → service) for REST, SignalR, and MQTT-WS; gateway responsibilities matrix: TLS termination, authn offload vs retained per-service zero-trust validation, per-client and per-route rate limiting (algorithm, limits, Redis counter key schema, fail-open/fail-closed policy), response caching (cacheable route inventory with TTL and invalidation trigger per route; explicit never-cache list — alarm state, ack endpoints, live data), request size limits, circuit breaking, and observability at the edge.
4. **Target auth architecture** — auth-service hardened to production grade: OIDC discovery document, key rotation procedure with JWKS rollover, refresh-token rotation and revocation, shared validation library replacing byte-copies, service identity (mTLS or service-mesh/SPIFFE decision), RBAC model integration (Phase 6 spec alignment), secrets externalization. End-to-end sequence diagrams for login, refresh, service-to-service, and SignalR/MQTT credential flows through the gateway.
5. **Target data layer** — PostgreSQL: HA topology, PgBouncer placement, pool sizing, the indexing standard (every hot query predicate index-backed, DDL included), Timescale policy set (hypertables, compression, retention) per table class. IoTDB: 3C3D topology per platform spec §6, schema template governance. Redis: contract-tier separation (snapshot contract keys on a non-evicting instance or `noeviction` policy with sizing math), cache-tier keys separately governed.
6. **Target streaming plane** — Kafka: KRaft, RF≥3, `min.insync.replicas=2`, explicit topic provisioning as code, partitioning standard tied to consumer parallelism. Flink: HA services, remote durable checkpoint storage, explicit `DeliveryGuarantee` per sink with the idempotency contract stated where at-least-once is retained, savepoint-based upgrade procedure, supervisor replaced or subordinated to the HA mechanism.
7. **Target end-to-end performance architecture** — the complete caching and latency map as one diagram: browser (React Query policy, debounced inputs, virtualized grids, subscription hygiene) → gateway (response cache, rate limits) → BFF/API tier (output caching, IoTDB session pooling, decimation contract) → stores. Per-tier latency budget summing to the field-to-HMI ≤1.5 s and trend p95 <1 s SLOs.
8. **Cross-cutting target state** — observability (RED/USE coverage, SLO dashboards, alarm-pipeline lag alerts wired to a consumer, closing the `lifecycle-alerts` orphan), secrets management, container hardening, backup/restore per store.
9. **Gap-to-target traceability matrix** — every S1/S2/S3 GAP-ID mapped to the target element that resolves it; any target element not traceable to a gap is justified as forward-looking design.
10. **Migration sequencing** — ordered transition from as-is to target, aligned with the remediation phases in 09, each step with preconditions, rollback posture, and verification criteria.

---

## 6. Acceptance criteria for the completed review

1. Every hypothesis H-01..H-28 carries a status and evidence citation (or `UNVERIFIED` with the reason).
2. Every discovery-sweep command appears in the evidence appendix with its result.
3. Every document conforms to its skeleton; no section omitted without an explicit `NOT APPLICABLE — reason` marker.
4. Every finding has both grades, a severity, a standard anchor, and a remediation.
5. The gap register reconciles: every C/D grade in any document maps to a GAP-ID; no orphan grades.
6. Target-architecture traceability: every S1/S2/S3 GAP-ID maps to a resolving element in `10-target-architecture.md`; every target element is either gap-traceable or explicitly justified as forward-looking. `10-target-architecture.md` is self-sufficient as a build-against reference and contains no `UNVERIFIED` markers (it is design, not findings — but its rationale citations must point to verified findings only).
7. No claim in any findings document lacks either a code citation or an `UNVERIFIED` marker.
8. Mermaid diagrams render (validated syntax).
9. A human approval gate is passed after hypothesis verification and before document drafting (see execution prompt).
