# AMS / Traverse API Gateway

**Service:** `src/services/gateway` (YARP, .NET 8) · **Container:** `traverse-gateway` · **Host port:** `8081` (HTTP; `8443` HTTPS when a cert is configured)
**Status:** live — Plan 04 complete including the final lockdown. The gateway is the **only** way into the platform's API surface from outside the compose network.

```
                                 ┌──────────────────────────────────────────────┐
 Browser ──► nginx (:3000) ────► │              API GATEWAY (:8081)             │
            static SPA only      │  TLS · edge JWT auth · revocation · rate     │
 Scripts / tools ──────────────► │  limits · response cache · body limits ·     │
                                 │  circuit breaker · X-Auth-* identity         │
                                 └───┬──────┬──────┬──────┬──────┬──────┬───────┘
                                     ▼      ▼      ▼      ▼      ▼      ▼
                                  ams-api  auth  asset  display hist   EMQX …
                                  (no published ports — compose network only)
```

---

## 1. Route map — every API through the gateway

The route table lives in [`appsettings.json`](../src/services/gateway/appsettings.json) (`ReverseProxy` section) and is the successor of the old nginx upstream table. All routes require an authenticated caller unless marked *anonymous*.

| Public path | Upstream service | Upstream path (rewrite) | Auth | Notes |
|---|---|---|---|---|
| `POST/… /api/auth/*` | auth-service :3002 | same path | **anonymous** | login, refresh (httpOnly cookie), logout, JWKS; auth-service enforces its own admin routes |
| `GET /api/auth/.well-known/jwks.json` | auth-service | same | anonymous | RS256 public keys (rotation publishes two — see runbook) |
| `/api/v1/cpm[/**]` | cplm-api :5000 | same path | required | loop performance (CPM/CPLM): loops, KPIs, gates, readiness, recompute |
| `/api/displays[/**]` | display-service :5000 | strip `/api` → `/displays…` | required | display CRUD, content, publish, folders, media assets |
| `/api/bindings/**` | binding-resolver :5000 | strip `/api/bindings` → `/resolve`, `/preview`… | required | UNS path+role → transport resolution |
| `/api/assets[/**]` | asset-model :5000 | strip `/api` → `/assets…` | required | UNS asset CRUD, search, hierarchy, relationships |
| `/api/aliases/**` | asset-model :5000 | strip `/api` → `/aliases…` | required | legacy-tag alias resolution |
| `/api/templates[/**]` | template-service :5000 | strip `/api` → `/templates…` | required | element templates + instantiation |
| `/api/analyses[/**]` | analysis-service :5000 | strip `/api` → `/analyses…` | required | derived calculations / analysis defs |
| `/api/audit[/**]` | audit-service :8080 | → `/api/v1/audit…` | required | tamper-evident audit trail (browser alias) |
| `/api/v1/audit[/**]` | audit-service :8080 | same path | required | audit-service's native prefix (tooling parity) |
| `/api/hist/**` | historian-bff :8090 | strip `/api/hist` → `/snapshot`, `/trend`, `/summary`, `/series`… | required | IoTDB reads: snapshots + trends |
| `/api/**` (catch-all) | ams-api :8000 | same path | required | **alarm system**: `/api/v1/alarms*` (list/ack/shelve/suppress/export), SOE, analytics/KPI, admin, OPC connections, observability, replay |
| `/hubs/**` | ams-api :8000 | same path | required (`?access_token=`) | SignalR: `/hubs/alarms` (realtime alarm feed), `/hubs/observability` (drift/replay — needs `system.manage`) |
| `/mqtt-ws` | EMQX :8083 | → `/mqtt` | required (`?access_token=`) | MQTT-over-WebSocket live values (Sparkplug B); EMQX re-authenticates the MQTT CONNECT (JWT as password) |
| `/health` | ams-api | same | anonymous | platform liveness (nginx parity) |
| `/swagger[/**]` | ams-api | same | anonymous | **blocked (404)** unless `Gateway__ExposeSwagger=true` — never in production |
| `/external-api/**` | config-driven (`external-feed` cluster) | → `/api/**` | required | legacy external feed; no consumer in src — decommission candidate |
| `/gw/health` | gateway itself | — | anonymous | gateway liveness |
| `/gw/metrics` | gateway itself | — | anonymous (internal) | Prometheus RED metrics per route |
| `/gw/upstreams` | gateway itself | — | anonymous | cluster inventory |
| `/gw/upstreams/{cluster}/health` | any upstream | → `/health` | anonymous | per-service health passthrough — the replacement for the old `localhost:<port>/health` checks |

**Precedence:** specific prefixes win over the `/api` catch-all (`Order 0` vs `100`), reproducing nginx longest-prefix behavior. Route config hot-reloads on file change.

---

## 2. Authentication — edge-only model

Decided in MIGRATION_LOG **decision #16**: the gateway is the platform's **single JWT validator**. No backend service parses or verifies a token.

**At the gateway, per request:**
1. Validate the RS256 bearer (or `?access_token=` for WebSocket/SSE — browsers can't set headers on WS) against **auth-service JWKS**: signature, issuer `traverse-auth`, audience `ams-services`, expiry, `RS256` only. Unknown `kid` → JWKS re-fetch (this is what makes key rotation seamless).
2. **Revocation check**: an in-memory snapshot polled every 5 s from `GET /api/auth/internal/revocations` (X-Service-Key-guarded). A user whose role/password changed or who was deactivated is rejected **within seconds**, even though the token's signature is still valid. Poll failure → last snapshot kept (fail-open, bounded by the 15-min token TTL).
3. **Identity forwarding**: the caller's identity is injected as trusted headers — `X-Auth-Subject`, `X-Auth-Username`, `X-Auth-Role`, `X-Auth-Permissions` (comma-separated). Any client-supplied `X-Auth-*` is **stripped at ingress**; the gateway is the only writer.

**At each service:** the shared `TraverseAuth.cs` module (synced byte-identical into 9 services; `ams-api` has the equivalent `GatewayHeaderAuthHandler`) materialises those headers into a `ClaimsPrincipal`. The per-endpoint permission policies (`RequireAuthorization("asset.edit")`, `[Authorize(Policy="system.manage")]`, …) are unchanged — **fine-grained authorization stays in the service**; only cryptographic validation moved to the edge.

**Internal service-to-service calls** (binding-resolver / cplm-api / analysis-service → asset-model) bypass the gateway and authenticate with `X-Service-Key`, promoted to a service principal scoped by `Auth__ServicePermissions` (asset-model: `asset.view,asset.edit`; everyone else: none). Target state on-prem: replace with mTLS/SPIFFE workload identity.

**Why header trust is safe (the lockdown):** no service publishes a host port — the compose network is the only path, and the gateway owns the `X-Auth-*` namespace on it. On-prem production must add **gateway↔service mTLS** so the trust is bound to the peer certificate, not just the network. The dev fallback key fails closed outside Development (`TRAVERSE_SERVICE_KEY` required).

**MQTT plane:** EMQX accepts no anonymous connections. Browsers authenticate the WS upgrade at the gateway (`?access_token=`) *and* the MQTT CONNECT (token as password, validated by EMQX's JWT authenticator against the same JWKS). The Sparkplug edge node uses its `ams_edge` credential (built-in DB, provisioned by `emqx-init`). ACL: edge owns `spBv1.0/#`; browsers are **subscribe-only** — publishing anything, explicitly including `NCMD`/`DCMD` device commands, is denied.

---

## 3. Rate limiting (Redis)

Fixed 60-second windows, keys `rl:{class}:{clientId}:{windowStart}` (`INCR` + expiry). `clientId` = token `sub` when authenticated, else client IP. Config: `RateLimiting` section.

| Class | Matches | Limit/min | Keyed by | On Redis outage |
|---|---|---|---|---|
| `login` | `POST /api/auth/login` | **10** | IP | **fail CLOSED** (never drop brute-force protection) |
| `snapshot` | `GET /api/hist/snapshot*` | 30 | user | fail OPEN |
| `historian` | `GET /api/hist/*` (other) | 120 | user | fail OPEN |
| `mutation` | any non-GET (except login) | 120 | user | **fail CLOSED** |
| `read` | any other GET | 600 | user | fail OPEN (operators never lose alarm visibility to a dead cache) |
| `global` | everything | 2000 | IP | fail OPEN |

Over-limit → `429` + `Retry-After` (seconds to window end). Denials are logged and counted in metrics.

---

## 4. Response caching (Redis)

**Allow-list only** — a route family not in this table is structurally uncacheable (alarm state, ACK/shelve, `/hubs`, `/mqtt-ws`, CPM, auth, audit are never cached, enforced by construction and by test). Config: `ResponseCache` section.

| Route family | TTL | Invalidation |
|---|---|---|
| `GET /api/assets*`, `/api/aliases*` | 60 s | TTL (asset writes churn slowly) |
| `GET /api/displays*` | 30 s | TTL |
| `GET /api/bindings/resolve*` | 30 s | TTL |
| `GET /api/hist/trend*`, `/api/hist/summary*` | 10 s | TTL (new IoTDB write window) |
| `GET /api/templates*` | 60 s | TTL |

Key: `cache:{class}:{sha(path+query)}:{sha(sub + sorted permissions)}` — **scoped per user**, so a cached body can never cross a user or authorization boundary (displays carry operator-owned Personal Views; per-user is the only safe default). Only `200`-to-`GET` responses are stored. `X-Cache: HIT|MISS` on every cacheable response for hit-ratio measurement. Redis down → cache bypassed.

---

## 5. Protection & resilience

| Mechanism | Setting | Behavior |
|---|---|---|
| **Body limits** | ACK ≤ 4 KB · display JSON ≤ 2 MB · default ≤ 256 KB | `413` before the proxy; chunked uploads cut off by the per-request Kestrel bound |
| **Circuit breaker** | YARP passive health `TransportFailureRate`, `AvailableDestinationsPolicy: HealthyAndUnknown`, reactivation 60 s | a **dead** upstream (connect refused/timeout) trips the breaker → `503` in ~5–10 ms instead of multi-second dials; an upstream **5xx response never trips it** (a struggling service is not cut off) |
| **Connect timeout** | 5 s (`Gateway__ConnectTimeoutSeconds`) | bounds the dial to a dead upstream |
| **WS activity timeouts** | 24 h on `/hubs` + `/mqtt-ws` clusters, 30 s on historian | long-lived streams stay up; slow reads bounded |
| **TLS** | `Gateway__Tls__CertPath` / `__CertPassword` | HTTPS on 8443 + HTTP→HTTPS redirect; lab runs HTTP, on-prem supplies the cert |
| **Swagger gate** | `Gateway__ExposeSwagger` (default `false`) | `/swagger` 404s unless explicitly enabled |
| **Spoof guard** | always on | inbound `X-Auth-*` stripped before anything else runs |

---

## 6. Observability

- **`GET /gw/metrics`** — Prometheus: `http_requests_*` per route/method/code (RED), plus default .NET metrics.
- **Access log** — one line per request: method, path, status, ms, user, IP, cache result (`Gateway__AccessLog=false` to disable).
- **`GET /gw/upstreams`** / **`GET /gw/upstreams/{cluster}/health`** — cluster inventory and per-service health passthrough. This is what ops scripts use now that direct ports are closed, e.g.:
  - `http://localhost:8081/gw/upstreams/asset-model/health`
  - `http://localhost:8081/gw/upstreams/auth-service/health`

---

## 7. Deployment & ports (after the final lockdown)

| Published on the host | What |
|---|---|
| `3000` | nginx — static SPA only; passes `/api`, `/hubs`, `/mqtt-ws`, `/health` to the gateway |
| **`8081`** | **the gateway — the entire API surface** |
| `1883` | EMQX MQTT TCP (authenticated; external SCADA/edge clients) |
| `18083` | EMQX dashboard (admin credentials) |
| infra | postgres 5433, redis 6380, kafka 9093, iotdb 6667, flink 8082, prometheus 9090, grafana 3001, kafka-ui 8085 |

**No longer published:** ams-api 8000, auth-service 3002, asset-model 5001, binding-resolver 5002, display-service 5003, template-service 5004, analysis-service 5005, cplm-api 5006, historian-bff 8090, audit-service 8095, notification-service 8096, EMQX WS 8083. They exist only on the compose network.

Dev workflows: Vite (`npm run dev`) proxies `/api`, `/hubs`, `/mqtt-ws` to the gateway on 8081. All `scripts/*.ps1` tooling was repointed the same way.

---

## 8. Adding a new service / route (checklist)

1. Add a **cluster** in `appsettings.json` (in-network address) with the standard passive-health block.
2. Add **route(s)** with `Order: 0`, an `AuthorizationPolicy` (`default` unless it truly is public), and the path transform if the service's native prefix differs.
3. Decide **rate-limit class** (default classes cover GET/mutations automatically) and whether any GET family belongs in the **cache allow-list** (only if staleness ≤ TTL is acceptable and responses are user-scoped-safe).
4. In the service: sync `TraverseAuth.cs` (`scripts/sync-auth-module.ps1` — add the service to `$services`), call `AddTraverseAuth()`/`UseTraverseAuth()`, guard endpoints with `RequireAuthorization("<permission>")`.
5. **Do not publish a host port.** Ops health goes through `/gw/upstreams/<cluster>/health`.
6. Update this document's route table.

## 9. Operational notes

- **Key rotation:** [docs/runbooks/jwt-key-rotation.md](runbooks/jwt-key-rotation.md) — the gateway re-fetches JWKS on unknown `kid`, so rotation needs no gateway restart.
- **Revocation:** bumping a user's `credentials_changed_at` (any role/permission/password change or deactivation via auth-service) takes effect at the edge within ~5–10 s.
- **Rollback:** the gateway image is stateless; roll back by redeploying the previous image. Route config is file-based and hot-reloads.
- **Remaining hardening for on-prem:** real TLS cert on 8443; gateway↔service mTLS (binds `X-Auth-*` trust to the peer, closing the in-network spoof gap); mTLS/SPIFFE for the internal `X-Service-Key` path.
