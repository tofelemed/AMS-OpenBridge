# EVIDENCE APPENDIX — Discovery-Sweep Commands and Absence-Claim Logs

**Reviewed commit:** `4e2758c951df06a170f35d23313824cb57c9ef03`
**Date:** 2026-08-08
**Purpose:** Per framework §1.3.3, every absence claim ("no rate limiting exists", "no HA config") is only valid with the executed search and its result recorded here. This appendix consolidates the search logs from the six domain evidence sweeps. Scope excludes `src/xmlgraphics-batik-main ScreeN Import/` throughout.

Each row: the framework §4 discovery-sweep command (or the equivalent Grep/Glob actually run), the scope, and the raw result. "∅" = no matches (the finding). Full per-report logs remain in the scratchpad evidence files (`evidence-A-infra.md` … `evidence-F-frontend.md`), which carry the exact tool invocations and verbatim quoted lines.

---

## 1. Data layer (framework §4)

| # | Search | Scope | Result |
|---|---|---|---|
| DL-1 | `CREATE INDEX\|CREATE UNIQUE INDEX` | `database/` | 110 lines (82 in `scripts/`, 28 in superseded `migrations/`); **9** `CREATE UNIQUE INDEX` (all in scripts): idx_opc_connections_name, idx_assets_contextual_path_unique, idx_alias_legacy_source, uq_asset_relationships_edge, uq_cplm_gate_results_window, uq_cplm_short_window, uq_cplm_long_window, uq_cpm_loop_registry_loop_ci, uq_cplm_event_frames_open |
| DL-2 | `create_hypertable\|add_compression_policy\|add_retention_policy` | `database/` | **∅ (exit 1)** — no Timescale policy calls in the mounted SQL |
| DL-3 | same, repo-wide (`*.sql,*.cs,*.py,*.ps1,*.sh`) | repo | only EF migrations `20260528000000_AddTimescaleDbHypertables.cs:33,35` and `20260530160000_AddAlarmStateTransitions.cs:33`; **`add_compression_policy` = ∅ anywhere** |
| DL-4 | `sub_condition_name` ∩ `unique\|index` | `database/` | **∅ (exit 1)** — no index of any kind references sub_condition_name (H-14) |
| DL-5 | `AsNoTracking\|Skip(\|Take(` | `src/backend`, `src/services` | `AsNoTracking` = 12 occurrences / 8 files; hot alarm list + history paginate (Skip/Take), but `GetUnacknowledgedAsync` unbounded |
| DL-6 | `Maximum Pool Size\|Pooling=\|MaxPoolSize` (case-insensitive) | repo | **1 hit — the review framework doc itself** (`00-review-framework.md:112`); **∅ in src/ or infra/ configs** → Npgsql defaults (Max 100) apply |
| DL-7 | `CREATE (ROLE\|USER)` / password literals | `database/` | **∅** — only `password_encrypted BYTEA`, `password_hash VARCHAR(255)` columns |
| DL-8 | writer of `alarms.alarm_history` | `src/`, `scripts/`, `infra/`, `tests/` | only readers (AnalyticsController.cs, AlarmRepositories.cs) + `SELECT COUNT(*)` validation scripts — **no writer exists** |

## 2. Caching & resilience (framework §4)

| # | Search | Scope | Result |
|---|---|---|---|
| CR-1 | `IMemoryCache\|IDistributedCache\|OutputCache\|ResponseCach\|AddStackExchangeRedisCache\|AddOutputCache\|AddMemoryCache` | `src/backend`, `src/services` (`*.cs`) | **∅** — no query/response cache tier anywhere (H-15). Only `AddResponseCompression` (not caching) |
| CR-2 | `AddRateLimiter\|RateLimiterOptions\|EnableRateLimiting\|UseRateLimiter` | `src` (`*.cs`) | **5 hits, all AMS.Api**: Program.cs:323,416; AlarmsController.cs:41,308,393. **∅ in every Traverse service** (H-16) |
| CR-3 | `limit_req\|proxy_cache` | `src/frontend-ob/nginx.conf` | **∅** (H-01) — plus `limit_conn\|auth_request\|auth_basic\|client_max_body_size\|proxy_buffering\|gzip\|ssl_` all ∅ |
| CR-4 | `Polly\|AddResilienceHandler\|CircuitBreaker\|AddStandardResilienceHandler\|WaitAndRetry\|AddTransientHttpErrorPolicy` | `src` | 3 hits — all `PackageReference` lines in `AMS.Infrastructure.csproj:25-27`. Usage grep (`using Polly\|Policy\.\|RetryAsync\|IAsyncPolicy`) → 7 JSON-serializer false positives. **Polly packaged, never used** |

## 3. Kafka / Flink correctness (framework §4)

| # | Search | Scope | Result |
|---|---|---|---|
| KF-1 | `enable.auto.commit\|EnableAutoCommit\|AutoOffsetReset` | `src` | AMS.Api consumers: 1 manual-commit (NormalizedAlarmConsumer, `EnableAutoCommit=false`), 9 auto-commit; cplm-api + audit-service manual-commit with StoreOffset-after-persist |
| KF-2 | `setDeliveryGuarantee\|DeliveryGuarantee` | `src/flink` | **∅ (No matches)** — every one of 13 KafkaSink builders is bare (H-07) |
| KF-3 | `setTransactionalIdPrefix` | `src/flink` | **∅ (No matches)** (H-07) |
| KF-4 | `enableCheckpointing` | `src/flink` | 12 matches (mode split: EXACTLY_ONCE ×9, AT_LEAST_ONCE ×3); AlarmStateExportJob and StateDriftDetectionJob have **none** |
| KF-5 | `StateTtlConfig\|enableTimeToLive\|setStateBackend\|setCheckpointStorage\|RocksDB` | `src/flink` | **∅** — no state TTL, no in-code backend/storage (backend from compose `FLINK_PROPERTIES`) |
| KF-6 | `high-availability\|ha\.` | `infra/docker/docker-compose.yml`, `src/flink` | **∅ in compose and code**; only the unused Helm chart sets `high-availability: zookeeper` (H-08) |
| KF-7 | `savepoint` (case-insensitive) | repo | docs + `.gitignore` + `fault_injection.py` + auth-service SQL SAVEPOINTs only — **no savepoint in any submit/upgrade script** |
| KF-8 | `lifecycle-alerts` | repo | 7 matches: 2 config declarations, 2 producers (TelemetryDeadman, AckSla), 3 docs — **0 consumers** (H-22) |
| KF-9 | `.Subscribe(` | `src/backend` | 10 subscription sites enumerated; **none subscribes lifecycle-alerts** (H-22) |
| KF-10 | `loop-raw-data\|raw-opc-events` | repo | `loop-raw-data` produced by nothing; `raw-opc-events` **∅ in src/** (docs only) — live ingress is `raw-alarms` |

## 4. Frontend performance (framework §4)

| # | Search | Scope | Result |
|---|---|---|---|
| FE-1 | `debounce\|throttle` | `src/frontend-ob/src` | 7 hits, **all** in `UserManagementConfig.tsx`. AlarmConsole quick filter, MqttLiveStream search, LiveEvents filter are per-keystroke (H-25) |
| FE-2 | `AbortController\|signal:` | `src/frontend-ob/src` | 1 hit — prose string in `GateEvidenceDrawer.tsx:91`. **Zero real AbortController usage**; React Query `signal` unused (H-25) |
| FE-3 | `rowBuffer\|rowModelType\|suppressRowVirtualisation\|suppressColumnVirtualisation` | `src/frontend-ob/src` | 1 hit — `AlarmConsole.tsx:737 rowBuffer={20}`. No virtualization-suppress flags → AG Grid client-side row model virtualization is ON (H-25 GOOD) |
| FE-4 | `isLoading\|isError\|isFetching` | `src/frontend-ob/src` | 105 occurrences / 28 files. **Absent from** Dashboard.tsx, LiveEventsPage.tsx, MqttLiveStream.tsx, AlarmConsole.tsx, LiveEventStream.tsx (store-driven surfaces) |
| FE-5 | `unsubscribe\|client.end\|removeAllListeners` | `src/frontend-ob/src` | firehose surfaces + per-screen hooks unsubscribe on cleanup; `client.end` only inside `mqttStore.disconnect` which is **never called** (H-25/H-26) |
| FE-6 | `React.memo\|memo(` | `src/frontend-ob/src` | **∅** — zero component memoization anywhere (241 useMemo/useCallback, but no `React.memo`) |
| FE-7 | `react-virtual\|useVirtualizer` | `src/frontend-ob/src` | **∅** — `@tanstack/react-virtual` declared in package.json, never imported (dead dep) |
| FE-8 | `progressive\|sampling\|large:` | `src/frontend-ob/src` | 3 unrelated hits — **no ECharts progressive/sampling config** (H-25; mitigated by server decimation) |
| FE-9 | `setInterval\|setTimeout` | `src/frontend-ob/src` | 18 hits; every `setInterval` has a matching `clearInterval` cleanup — timer hygiene clean (H-26) |

## 5. Security & ops (framework §4)

| # | Search | Scope | Result |
|---|---|---|---|
| SO-1 | `USER \|useradd\|adduser` | all Dockerfiles (Glob `**/Dockerfile*` = 18 files) | 4 non-root (ams-api, historian-bff, sparkplug-edge-node, auth-service); **7 of 8 Traverse .NET services + both nginx = root**; no `@sha256` digest pin anywhere (H-27) |
| SO-2 | `healthcheck` | `infra/docker/docker-compose.yml` | present on postgres, iotdb, redis, emqx, kafka, ams-api, historian-bff, auth-service + all Traverse .NET (via `/dev/tcp`); **absent** on kafka-ui, pgadmin, cloudbeaver, all flink jobmanager/taskmanager/submit/supervisor, sparkplug-edge-node, exporters |
| SO-3 | `deploy:\|resources:\|mem_limit\|cpus:\|limits:` | both compose files | only the anchor definition (line 1, never referenced) + a comment (line 354). **No resource limits on any of 37 services** (H-27) |
| SO-4 | `tls\|ssl\|cert` (case-insensitive) | compose | 3 non-TLS hits (a "TTLs" comment, `curl -fsSL`, `sslmode=disable`). **No TLS anywhere** |
| SO-5 | `IHostApplicationLifetime\|StopAsync` | `src/backend/AMS.Api/BackgroundServices/` | consumers call `consumer.Close()` in `finally` (7/10); no explicit `StopAsync` override with drain beyond NormalizedAlarmConsumer's batch flush (H-28) |
| SO-6 | gateway: `envoy\|kong\|yarp\|ocelot\|traefik\|krakend\|tyk` (case-insensitive) | `infra`, `src` | **∅ (exit 1)** — no API gateway anywhere (H-02) |
| SO-7 | `requirepass\|REDIS_PASSWORD` | `infra/docker/` | 1 hit — `.env.example:8` placeholder, never consumed by compose. **Redis unauthenticated** |
| SO-8 | `pgbouncer\|pg_bouncer\|replica\|standby\|patroni` | compose | only `KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR`; **no pooler, no PG replica** (H-19) |
| SO-9 | EMQX config files: `find infra -iname "*emqx*" -o -iname "*.conf"` | `infra` | **∅** — no EMQX authenticator/ACL config file exists (H-17) |
| SO-10 | `openid-configuration` | `src` | **∅** — no OIDC discovery document (H-03) |
| SO-11 | `rotat` (key rotation) | `scripts/`, `auth-service/src` | scripts ∅; auth-service = 1 refresh-token-rotation comment only. **No key rotation tooling** (H-32) |
| SO-12 | `Security__DisableApiAuthorization` | repo | Program.cs:445, compose:440 (`"false"`), appsettings.Development.json:16 (H-06) |
| SO-13 | `traverse-internal-dev-key\|Security__ServiceKey` | `infra/docker/` | 8 `${TRAVERSE_SERVICE_KEY:-traverse-internal-dev-key}`; env name is `Auth__ServiceKey`/`Cpm__ServiceKey`, **not** `Security__ServiceKey` (H-05) |
| SO-14 | `AddSignalR\|AddStackExchangeRedis` | `src` (`*.cs`) | 1 hit — `Program.cs:174` AddSignalR; **zero backplane** (H-24) |
| SO-15 | `[Authorize]` in Hubs | `src/backend/AMS.Api/Hubs` | AlarmHub.cs:22 only; **ObservabilityHub has none** (discovery finding) |
| SO-16 | browser MQTT `username`/`password` | `mqttStore.ts` connect options | **∅** — browser connects to EMQX anonymously (discovery finding) |

---

## 6. Manual inspections (framework §4 "additional")

- **nginx buffer/timeout/WebSocket:** WS upgrade only on `/hubs/` and `/mqtt-ws`; `proxy_read_timeout 86400` on both; `/api/hist/` gets `proxy_read_timeout 30s`; no `proxy_buffering`/`client_max_body_size` (nginx default 1m). `/swagger` and `/mqtt-ws` publicly proxied; `/external-api/` hardcodes `http://192.168.1.51:8010/api/`.
- **EMQX listeners:** TCP 1883 + WS 8083 bound; 8084 (WSS) published but no SSL listener/cert configured (dead port). No authenticator chain.
- **Flink `FLINK_PROPERTIES` (full):** RocksDB incremental, `state.checkpoints.dir: file:///flink-checkpoints`, num-retained 3, interval 60000, min-pause 30000, mode EXACTLY_ONCE, timeout 120000, max-concurrent 1, RETAIN_ON_CANCELLATION, Prometheus reporter :9249. **No `high-availability*`, no `state.checkpoint-storage` remote.**
- **React Query defaults:** `retry:2, staleTime:30_000, refetchOnWindowFocus:false`; no `gcTime` (v5 default 5min); queryFns ignore `signal`.
- **Vite build chunking:** 25 route components `React.lazy`-loaded; **no `manualChunks`** — vendor chunks ride route boundaries only.

---

## 7. Search-log provenance

The six raw evidence reports each carry a numbered "Search log" section with the exact tool call and verbatim output for every claim above and many more:

| Report | Domain | Search-log entries |
|---|---|---|
| evidence-A-infra.md | infra/compose/edge/EMQX/hardening/secrets | S1–S16 |
| evidence-B-auth.md | auth/authz/service-trust/secrets | 1–18 |
| evidence-C-streaming.md | Flink/Kafka/topics/lifecycle | S1–S26 |
| evidence-D-dotnet.md | .NET consumers/caching/resilience/SignalR | 1–10 |
| evidence-E-database.md | PostgreSQL/Timescale schema/index | A, B, C, S1–S11, S-N/P/Sh/F |
| evidence-F-frontend.md | React stores/realtime/render | 1–16 |

These are the authoritative primary evidence; every `file:line` citation in the review documents traces to a line actually Read during the sweep.
