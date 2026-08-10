# 09 — Gap Register and Remediation Roadmap

**Purpose:** the single reconciliation table for the review. Every C or D grade in any document maps to a GAP-ID here; every S1/S2/S3 GAP maps to a resolving element in [10-target-architecture.md](./10-target-architecture.md).
**Reviewed commit:** `4e2758c951df06a170f35d23313824cb57c9ef03`
**Date:** 2026-08-08
**Grading:** dual-column (Lab / Production-candidate) per framework §1.1. Severity per §1.2. Roadmap status records whether the item was already a known roadmap item; it never reduces severity (§1.3, review decision).

Verification legend: every finding is CONFIRMED/AMENDED in [PHASE1-VERIFICATION.md](./PHASE1-VERIFICATION.md); no row is UNVERIFIED.

---

## 1. Summary counts

| Severity | Count | Prod grade = D (disqualifying) |
|---|---|---|
| S1 — Blocker | 11 | 11 |
| S2 — Critical | 16 | 5 |
| S3 — Major | 16 | 0 |
| S4 — Minor | 8 | 0 |
| S5 — Informational | 2 | 0 |
| **Total** | **53** | **16** |

(No gap carries a Lab grade of D — the S1/S2 items impede or mask defects in the lab rather than breaking lab workflows outright, so they are graded Lab C. The 16 Prod-D grades are all 11 S1 gaps plus 5 availability/security-critical S2 gaps: SCALE-01, DATA-04, DATA-05, DATA-06, AUTH-04.)

Effort key: **S** ≤ 3 days · **M** ≤ 3 weeks · **L** > 3 weeks / multi-team.

---

## 2. Gap register (flat, sortable)

### S1 — Blockers (Phase 1)

| GAP-ID | Domain | Finding | Evidence | Standard anchor | Lab | Prod | Sev | Roadmap | Remediation | Effort | Phase |
|---|---|---|---|---|---|---|---|---|---|---|---|
| STR-01 | Streaming | Flink Kafka sinks set no `DeliveryGuarantee`; connector default NONE → records lost across TM crash despite EXACTLY_ONCE checkpointing (H-07) | `OpcEventStreamJob.java:176-184`; `CplmKafkaSink.java:14-20`; KF-2/3 | Flink explicit sink guarantee | C | D | S1 | No | Set `DeliveryGuarantee.AT_LEAST_ONCE` (+ `setTransactionalIdPrefix`+EXACTLY_ONCE where consumers aren't idempotent) on all 13 sinks; assert idempotency per sink | M | 1 |
| STR-02 | Streaming | Checkpoints on local Docker volume `file:///flink-checkpoints`; no durable remote store (H-09) | docker-compose.yml:306,365,21 | Flink durable checkpoint storage | C | D | S1 | Yes | Move `state.checkpoints.dir` to S3/MinIO/durable object store; wire the existing `.env` S3 placeholders | M | 1 |
| STR-03 | Streaming | No Flink HA; JM restart destroys all jobs; supervisor resubmits stateless in 60s (H-08) | `flink-job-supervisor.sh:6-7,75`; KF-6 | Flink ZK/K8s HA services | C | D | S1 | Yes | Enable JM HA (ZooKeeper or Kubernetes HA), subordinate supervisor to HA; resubmit with `-s` from latest checkpoint | L | 1 |
| STR-04 | Streaming | Single Kafka broker, ZooKeeper, `auto.create.topics.enable=true`, RF=1, 24h retention (H-11) | docker-compose.yml:262-273 | Kafka RF≥3, min.insync=2, acks=all, no auto-create | C | D | S1 | No | 3-broker KRaft cluster, RF≥3, `min.insync.replicas=2`, disable auto-create, provision topics as code, raise retention on event-sourced topics | L | 1 |
| AUTH-01 | Auth | Default service key `traverse-internal-dev-key` grants full-`Perms.All` principal; fail-open (warn) outside Production (H-05) | `_shared/TraverseAuth.cs:176-186,203`; SO-13 | OWASP ASVS V2; IEC 62443 SR 1.x | C | D | S1 | No | Mandatory strong per-service keys from secret store; fail-closed in all non-dev envs; move to mTLS/SPIFFE service identity | M | 1 |
| AUTH-02 | Auth | `Security:DisableApiAuthorization` flips entire ams-api REST surface to anonymous (H-06) | `AMS.Api/Program.cs:445-446` | OWASP ASVS V4; API Sec Top-10 API5 | C | D | S1 | No | Remove the flag from production images; if retained for test, gate behind a build-time symbol, never runtime config | S | 1 |
| AUTH-03 | Auth/Edge | EMQX anonymous + no ACLs + public nginx `/mqtt-ws` → any browser reads/injects live Sparkplug + device commands (H-17/H-30) | docker-compose.yml:149; nginx.conf:150; `mqttStore.ts:239-245` | Sparkplug 3.0 + EMQX hardening; IEC 62443 zones | C | D | S1 | No | EMQX authenticator (JWT/per-client), per-client ACLs scoping `spBv1.0/#`, WSS/TLS, browser presents access token; gateway authorizes MQTT-WS upgrade | M | 1 |
| DATA-01 | Data | No unique index backs the projection key; `alarm_current` has no `server_id`; app-level RMW over unindexed `source` (H-14) | `02_alarm_schema.sql:37-52`; `AlarmRepositories.cs:114-118`; DL-4 | Postgres upsert-key integrity | C | D | S1 | No | Add `server_id`; `UNIQUE(server_id,source,condition,sub_condition)`; convert to `INSERT … ON CONFLICT`; index the ingest predicate | M | 1 |
| DATA-02 | Data | TimescaleDB unused on docker-initialized DBs; no hypertables/compression/retention → unbounded growth (H-38) | `03_apply_ef_migrations.sql:183-190`; DL-2/3 | Timescale hypertable + retention policy | C | D | S1 | No | Create hypertables for time-series tables in mounted SQL; add compression + retention policies; stop pre-marking migrations applied | M | 1 |
| STR-05 | Streaming | `lifecycle-alerts` (deadman + ACK-SLA watchdogs) has no consumer — safety alerts go to a void (H-22) | `TelemetryDeadmanWatchdogService.cs:153-157`; `AckSlaWatchdogService.cs:161`; KF-8/9 | ISA-18.2 alarm-system integrity; SRE alerting | C | D | S1 | No | Wire a consumer (notification-service or ams-api) that raises operator-visible alerts + Prometheus alert; add end-to-end test | S | 1 |
| DOM-01 | Streaming/.NET | Projection consumer's DLQ is a stub that only logs; a Postgres failure drops the 100-event batch (H-33) | `KafkaConsumerService.cs:272-291` | Exactly-once processing; DLQ pattern | C | D | S1 | No | Real DLQ producer + do not advance offsets on failure; retry with backoff; alert on DLQ depth | M | 1 |

### S2 — Critical (Phase 1–2)

| GAP-ID | Domain | Finding | Evidence | Standard anchor | Lab | Prod | Sev | Roadmap | Remediation | Effort | Phase |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SCALE-01 | Scalability | SignalR has no backplane; ams-api pinned to one replica; UI-topic consumers split partitions if scaled (H-24) | `Program.cs:174,191`; SO-14 | ASP.NET SignalR scale-out (Redis backplane) | B | D | S2 | Yes | Add Redis backplane (or Azure SignalR); give UI consumers instance-unique groups or a single dispatcher | M | 1 |
| STR-06 | Streaming | CPLM single-member consumer group enforced by flag/convention only; 2 replicas silently halve persisted windows (H-21) | cplm-api `Program.cs:88-92`; `CplmResultConsumerService.cs:67` | Kafka consumer-group correctness | B | C | S2 | No | Static membership + assignment-count assertion or leader lease; assert single member at startup; alert on split | M | 2 |
| DATA-03 | Data | Redis snapshot "contract" keys carry TTL under `volatile-lru` → evictable under pressure; no auth (H-13) | docker-compose.yml:109-115; `SparkplugConfig.java:83` | Redis eviction correctness | B | C | S2 | No | Contract keys on a `noeviction` instance (or key-class separation); size for working set; add `requirepass`/ACL + TLS | M | 2 |
| DATA-04 | Data | IoTDB standalone 1.3.2 vs spec 3C3D; single point of failure, root/root (H-12) | docker-compose.yml:69; `Traverse-Edge-Platform-Specification.md:129` | IoTDB deployment guidance (spec §6) | B | D | S2 | Yes | Deploy 3C3D cluster per spec; schema-template governance; non-root credentials | L | 2 |
| DATA-05 | Data | Single Postgres, no replica/PgBouncer, default Npgsql pool, floating image tag (H-19) | docker-compose.yml:37-62; DL-6/SO-8 | PG HA + pooling | B | D | S2 | Yes | Primary+replica (Patroni), PgBouncer, explicit pool sizing, pinned image | L | 2 |
| STR-07 | Streaming | AnalysisExecutionJob supervised only by host script, not compose supervisor → dead after JM restart (H-10) | `flink-job-supervisor.sh:81-109`; `ensure_flink_jobs.py:121-127` | Flink job supervision | C | C | S2 | No | Add to the HA-managed job set; single reconciliation source of truth | S | 2 |
| STR-08 | Streaming | Four Flink jobs (AlarmKpi, AlarmStateExport, LoopKpi, StateDrift) unscheduled; ams-api consumers idle forever; AlarmStateExport keys on a missing field + no checkpointing (H-41) | evidence-C §3.3; `AlarmStateExportJob.java` | Topic/consumer liveness | C | C | S2 | No | Either schedule + fix (correct key field, add checkpointing) or delete jobs + their idle consumers; document decision | M | 2 |
| AUTH-04 | Auth | `/hubs/observability` SignalR hub has no `[Authorize]`; drift/state/replay streams to any client (H-29) | `ObservabilityHub.cs:35`; SO-15 | OWASP ASVS V4 | C | D | S2 | No | Add `[Authorize]` with an observability policy | S | 1 |
| AUTH-05 | Auth | No access-token revocation; deactivating a user leaves ≤15min tokens valid (H-31) | `auth.service.ts:204`; §7 | OWASP ASVS V3; RFC 9700 | B | C | S2 | No | Short-lived tokens + revocation list (jti blocklist in Redis) or reference tokens + introspection | M | 2 |
| AUTH-06 | Auth | No key-rotation tooling; single RSA keypair, one JWKS key, no grace overlap (H-32) | `generate-keys.ts:19-22`; SO-11 | RFC 8725; NIST SP 800-63B | B | C | S2 | Yes | Rotation procedure with dual-key JWKS overlap + `kid`; automate | M | 2 |
| STR-09 | Streaming | Partition-revoke handler `c.Commit()` commits positions ahead of un-persisted in-memory batch (H-34) | `KafkaConsumerService.cs:153-159` | Kafka offset discipline | C | C | S2 | No | Commit only stored offsets of persisted records; flush batch before revoke | S | 1 |
| STR-10 | Streaming | HttpAckWritebackService auto-commit → at-most-once ACK writeback to DCS (H-35) | `HttpAckWritebackService.cs:46-48,135` | Exactly/at-least-once ACK delivery | C | C | S2 | No | Manual commit after successful POST + ack-result publish; idempotent writeback | M | 2 |
| DATA-06 | Data | `alarms.alarm_history` has readers (KPI/history) but no writer in the repo (H-39) | DL-8; S8-S10 | Data-flow completeness | C | D | S2 | No | Add the projection writer (or repoint readers to `historical_alarms`); reconcile history model | M | 1 |
| DOM-02 | Domain/.NET | `ShelveExpiryService` implemented but never registered; and its SQL function inserts into a never-created table (H-36) | `Program.cs:567-602`; evidence-E | ISA-18.2 shelving timeout | C | C | S2 | No | Register the hosted service; create `alarms.shelving_actions`; test expiry | S | 2 |
| FE-01 | Frontend | Always-on plant-wide MQTT firehose in the shell + one setState per DDATA + 24 binding hooks/symbol + zero `React.memo` → render storm (H-45/H-25) | `App.tsx:527-529`; `mqttStore.ts:461-514`; FE-6 | React render hygiene; RAIL | C | C | S2 | No | Mount firehose only on monitoring routes; coalesce DDATA (rAF/throttle) before setState; memoize `SymbolRenderer` | M | 2 |
| DATA-07 | Data/Domain | Sparkplug device-id (sourceName) vs IoTDB path (alarmId) divergence; frontend re-derives the join; silent empty-trend on miss (H-23) | `IoTDBPersistenceJob.java:111-113`; `AlarmMetricPublisher.java:255-259`; `iotdbPaths.ts:67-76` | UNS single-source-of-truth | C | C | S2 | No | One canonical alarm identity + shared sanitization contract across Flink/edge/UNS; remove browser-side derivation | M | 2 |

### S3 — Major (Phase 2–3)

| GAP-ID | Domain | Finding | Evidence | Standard anchor | Lab | Prod | Sev | Roadmap | Remediation | Effort | Phase |
|---|---|---|---|---|---|---|---|---|---|---|---|
| GW-01 | Edge | nginx does no rate limiting, request-size limit, TLS, or caching — pure proxy (H-01) | nginx.conf:1-174; CR-3 | OWASP API Sec; rate-limit patterns | B | C | S3 | Yes | Introduce the gateway (GW-02) with per-route/per-client limits, body limits, TLS | M | 2 |
| GW-02 | Edge | No API gateway anywhere in the stack (H-02) | SO-6 | BFF / gateway pattern | B | C | S3 | Yes | Adopt YARP gateway (see 03/10) | L | 2 |
| GW-03 | Edge | AMS.Api limiter is global-bucket, 3 endpoints; no per-client; Traverse services unlimited (H-16) | `Program.cs:323-346`; CR-2 | Rate-limiting (token bucket/sliding window) | B | C | S3 | No | Per-client sliding-window at gateway (Redis counters); keep per-service fallback | M | 2 |
| DATA-08 | Data | No API-tier caching; alarm list = list+count+stats per request (H-15) | CR-1; `AlarmQueries.cs:121-127` | Output caching | B | C | S3 | No | OutputCache/short-TTL Redis cache for hot reads; invalidate on projection write | M | 2 |
| DATA-09 | Data | historian-bff no result cache; `/snapshot` does per-request Redis keyspace SCAN (H-18) | `historian-bff/Program.cs:261-311` | Cache tier; Redis SCAN avoidance | B | C | S3 | No | Replace SCAN with a snapshot index set; cache trend/summary; IoTDB session reuse policy | M | 2 |
| DATA-10 | Data | Missing hot-predicate indexes on `alarm_current` (source; state+event_time; trigram) and `alarm_history` (state; source trigram; event_time+source) (H-14 audit) | evidence-E §4 | Postgres covering/partial indexes | B | C | S3 | No | Add the DDL in 04 §1; validate against `pg_stat_statements` | S | 2 |
| SEC-01 | Container | 7/8 Traverse .NET services run as root; no digest pins; no resource limits on 37 services (H-27) | SO-1/3 | Non-root, pinned digests, resource limits | B | C | S3 | Yes | Add `USER`, pin digests, set per-tier `deploy.resources`; apply the log-rotation anchor | M | 2 |
| STR-11 | Streaming | No savepoint-based upgrade; every submit is `flink run -d` with no `-s`; upgrades lose state (H-08) | KF-7; evidence-C §3.4 | Flink savepoint upgrade | C | C | S3 | Yes | Savepoint-stop → deploy → restore-from-savepoint procedure (05 §3) | M | 2 |
| FE-02 | Frontend | No debounce on filter/search inputs (except one) (H-25) | FE-1 | Debounce/throttle | B | C | S3 | No | Debounce AlarmConsole/MqttLiveStream/LiveEvents inputs (200-300ms) | S | 3 |
| FE-03 | Frontend | No AbortController; superseded historian/binding requests complete and are discarded; stale can overwrite (H-25) | FE-2 | Request cancellation | B | C | S3 | No | Thread React Query `signal` into fetch; abort on tag/range change | S | 3 |
| FE-04 | Frontend | Zero `React.memo`; unmemoized 24-hook symbol renderer; per-mousemove `setOption` (H-25) | FE-6; `TrendCore.tsx:510-524` | React memoization; render hygiene | B | C | S3 | No | Memoize symbol/renderer; throttle axis-pointer setOption to rAF | M | 3 |
| FE-05 | Frontend | Loading/error/empty states missing on Dashboard + AlarmConsole hydration (H-25) | FE-4 | Explicit loading/error/empty | B | C | S3 | No | Add skeleton/hydration + error states; distinguish "loading" from "all quiet" | S | 2 |
| FE-06 | Frontend | Per-screen MQTT unsubscribe not ref-counted → shared-topic starvation on unmount (H-25) | `mqttStore.ts:290-328` | Subscription lifecycle hygiene | C | C | S3 | No | Ref-count `subscribeScreen`/`unsubscribeScreen` like the firehose already is | S | 2 |
| RES-01 | Resilience | Polly packaged but unused; no retry/circuit-breaker on any HttpClient (H-37) | CR-4 | SRE resilience; circuit breaker | B | C | S3 | No | `AddStandardResilienceHandler` on all outbound HttpClients (Flink, IoTDB, asset-model, DCS) | M | 2 |
| DATA-11 | Data | Five init scripts lack `\c`, run against `ams`; four error, `20` creates table in wrong DB (H-40) | evidence-E §1; S-N | Twelve-Factor build/init determinism | C | C | S3 | No | Add `\c <db>` to 17_display/18/19/20/21; make init deterministic without self-heal | S | 2 |
| AUTH-07 | Auth | notification-service has zero auth and blocks `Host.StartAsync`; absent from CI matrix (H-45) | evidence-B §5; evidence-D §11 | ASVS; disposability | C | C | S3 | No | Add TraverseAuth; run consumer off the startup thread; add to CI | S | 3 |

### S4 — Minor / hardening (Phase 3)

| GAP-ID | Domain | Finding | Evidence | Standard anchor | Lab | Prod | Sev | Roadmap | Remediation | Effort | Phase |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SEC-02 | Secrets | Plaintext credential defaults across compose (`supersecurepassword123`, `ChangeMe123!`, root/root, admin/public) (H-20) | evidence-A §10 | Secrets externalization | B | C | S4 | Yes | Move to Docker/K8s secrets or vault; remove committed defaults | M | 3 |
| AUTH-08 | Auth | TraverseAuth byte-copied ×7 + 2 hand-rolled validators; only the 7 covered by CI drift check (H-04) | evidence-B §2 | DRY; shared library | B | B | S4 | Yes | Raise Docker build context to `src/services` and reference `_shared` once; delete copies | M | 3 |
| STR-12 | Streaming | `live.metrics` carries two incompatible schemas (H-42) | evidence-C §5 | Schema governance | B | C | S4 | No | Split topics or add a schema discriminator + registry | S | 3 |
| OPS-01 | Ops | Prometheus admin API unauthenticated on host; no Alertmanager; zero Grafana dashboards; EMQX scrape creds mismatch (H-43) | evidence-A §11 | RED/USE observability | B | C | S4 | Yes | Disable admin API or auth it; wire Alertmanager + SLO dashboards; fix scrape creds | M | 3 |
| STR-13 | Streaming | Flink JAR bind-mounted from working tree in 7 containers; local `mvn` changes the running binary (H-44) | evidence-A §1 | Immutable artifacts; Twelve-Factor build/release/run | B | C | S4 | No | Bake versioned JAR into the image; submit by version | S | 3 |
| OPS-02 | Ops | Phantom `kafka-1/kafka-2` in kafka-ui; declared `docker-compose.streampipes.yml` missing; stale e2e config claims (H-48/H-49; D-10) | evidence-A §1; PHASE0 D-10 | Config hygiene | A | B | S4 | No | Remove phantom refs; either add or delete the StreamPipes overlay; reconcile docs | S | 3 |
| FE-07 | Frontend | Live→trend deep link broken (params ignored by TrendPage); dead deps (`@tanstack/react-virtual`, maybe `axios`) (H-23/H-25) | `iotdbPaths.ts:79-93`; FE-7 | Dead code / broken navigation | B | B | S4 | No | Fix `buildTrendViewerUrl` target/params; drop dead deps | S | 3 |
| DATA-12 | Data | `traverse_auth` uses naive `TIMESTAMP` (all others TIMESTAMPTZ); `traverse_shared` has no live creation script though documented (H-40 adj.; D-13) | evidence-E §2.6/2.9 | Timestamp correctness | B | B | S4 | No | Convert to TIMESTAMPTZ; either create or de-document `traverse_shared` | S | 3 |

### S5 — Informational

| GAP-ID | Domain | Finding | Evidence | Standard anchor | Lab | Prod | Sev | Roadmap | Note |
|---|---|---|---|---|---|---|---|---|---|
| INFO-01 | Streaming | LiveStateJob + IoTDBPersistenceJob declare AT_LEAST_ONCE with a stated idempotent-sink contract (alarmId+ts / series+ts dedup) — a deliberate, documented trade-off | `LiveStateJob.java:42`; `IoTDBPersistenceJob.java:42` | At-least-once + idempotent sink | A | A | S5 | Record as an explicit contract; still requires STR-01's guarantee to actually hold |
| INFO-02 | Frontend | 30s poll-fallback is correct — stops on reconnect, no timer stacking (H-26) | App.tsx:145-167; FE-9 | Subscription lifecycle | A | A | S5 | No action; add an overlap guard on `refreshActiveAlarms` (minor) |

---

## 3. Reconciliation index (C/D grade → GAP-ID)

Every C or D grade in documents 01–08 and 10 maps to a GAP-ID above. The consolidated scorecard in [00-review-index.md](./00-review-index.md) lists the per-domain grades; the mapping is:

- **01 Architecture** — distributed-monolith coupling → AUTH-08, STR-13, SCALE-01; CQRS conformance violations → DATA-07, DATA-01.
- **02 Auth** — AUTH-01..08.
- **03 Gateway/Edge** — GW-01..04, AUTH-03.
- **04 Data** — DATA-01..12.
- **05 Streaming** — STR-01..13, DOM-01/02.
- **06 Frontend** — FE-01..07.
- **07 Scalability** — SCALE-01, DATA-04/05, STR-03/04, DATA-04.
- **08 Technology rationale** — cross-references all of the above (no new grades).

---

## 4. Three-phase remediation roadmap

### Phase 1 — Stop-the-bleeding (all S1 + selected S2)

**Scope:** STR-01, STR-02, STR-03, STR-04, AUTH-01, AUTH-02, AUTH-03, AUTH-04, DATA-01, DATA-02, DATA-06, STR-05, STR-09, DOM-01, SCALE-01.

**Entry criteria:** review accepted; a staging environment mirroring compose topology exists; backup of current Postgres + checkpoints taken.

**Exit criteria:**
- No Flink sink runs with `DeliveryGuarantee.NONE`; checkpoints land on durable remote storage; JM HA verified by a kill-JM chaos test that restores jobs *with* state.
- Kafka RF≥3 with `min.insync.replicas=2`; `auto.create.topics.enable=false`; topics provisioned as code.
- No path can serve alarm data unauthenticated: `Security:DisableApiAuthorization` removed from prod images; EMQX authenticated + ACL'd; `/hubs/observability` authorized; MQTT-WS requires a token.
- `alarm_current` has a real unique constraint incl. server dimension and an `ON CONFLICT` upsert; ingest predicate indexed; a duplicate-redelivery integration test passes.
- Time-series tables are hypertables with retention; a growth test shows bounded disk.
- `lifecycle-alerts` has a consumer that surfaces an operator alert; a stalled-feed test fires it.
- Projection DLQ is real; a Postgres-outage fault-injection test loses zero events.

### Phase 2 — Production-candidate hardening (remaining S2 + S3)

**Scope:** STR-06, DATA-03, DATA-04, DATA-05, STR-07, STR-08, AUTH-05, AUTH-06, STR-10, DOM-02, FE-01, DATA-07, GW-01/02/03, DATA-08/09/10, SEC-01, STR-11, FE-05/06, RES-01, DATA-11, and the gateway build-out.

**Entry criteria:** Phase 1 exit criteria met and holding for 2 weeks in staging under synthetic load (load model in 07 §1).

**Exit criteria:**
- YARP gateway terminates TLS, enforces per-client sliding-window rate limits (Redis counters), request-size limits, and the cacheable-route policy in 10 §3; never-cache list honored.
- IoTDB 3C3D and Postgres primary+replica+PgBouncer deployed; Redis contract keys on a non-evicting tier; all pool sizes explicit.
- CPLM single-member enforced technically; ACK writeback at-least-once with idempotency; shelve expiry runs.
- Every outbound HttpClient has a resilience handler; hot-read endpoints cached with invalidation on write; the missing indexes are in place and validated.
- Containers non-root, digest-pinned, resource-limited; savepoint upgrade procedure exercised once end-to-end.
- Frontend: firehose scoped to monitoring routes, DDATA coalesced, symbol renderer memoized; ref-counted MQTT unsubscribe; Dashboard/AlarmConsole loading states.

### Phase 3 — Hardening and hygiene (residual S3/S4)

**Scope:** FE-02/03/04/07, AUTH-07, AUTH-08, SEC-02, STR-12/13, OPS-01/02, DATA-12.

**Entry criteria:** Phase 2 exit met; SLOs in 07 §5 instrumented in Prometheus.

**Exit criteria:** secrets externalized to a vault; auth module de-duplicated to a single referenced library; observability complete (Alertmanager + SLO dashboards + pipeline-lag alert wired to the closed `lifecycle-alerts` loop); dead code/deps removed; all documentation drift (PHASE0 §4) reconciled; input debounce + request cancellation + memoization complete.
