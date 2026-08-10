# Plan 04 — API Gateway & Edge Security

**Phase:** 2 · **Effort:** L · **Depends on:** Plan 03 (identity model) · **Approval:** dedicated funded track
**Gaps closed:** GW-01, GW-02, GW-03, AUTH-03, AUTH-08 (resolved by deletion under the edge-only model — see §2)
**Objective:** put a real gateway in front of the estate — TLS, edge authentication, per-client rate limiting, response caching, request-size limits — and close the anonymous live-data plane.

> **Decided auth model: EDGE-ONLY.** The gateway is the single JWT validator. Backend services stop
> validating tokens and trust the gateway; this is what dissolves AUTH-08 (the duplicated per-service
> validators are deleted, not consolidated into a library). Prerequisites that make edge-only *safe* are
> called out in §2 — they are mandatory, not optional.

> **This is the largest net-new build in the programme.** Everything else fixes existing code; this introduces a new component that most of the security and performance work depends on.

## Why

The front door is a pure reverse proxy on plain HTTP with **no** authentication, rate limiting, caching, or request-size limit. It also publicly proxies `/mqtt-ws` straight into a broker that accepts anonymous connections — so anyone who can reach the URL can read every live process value and inject Sparkplug device commands. It additionally exposes `/swagger` and a hardcoded LAN IP route.

## Work items

| # | Task | Gap | Where | Effort |
|---|---|---|---|---|
| 1 | Stand up the YARP gateway with TLS termination | GW-02 | new `src/services/gateway` | M |
| 2 | Edge-only JWT validation; delete per-service validators | GW-01, AUTH-08 | gateway + all services | M |
| 3 | Per-client, per-route rate limiting on Redis counters | GW-03 | gateway + Redis | M |
| 4 | Response caching with per-route TTL and invalidation | GW-01 | gateway + Redis | M |
| 5 | Request-size limits, circuit breaking, edge observability | GW-01 | gateway | S |
| 6 | Authenticate EMQX + move MQTT-WS behind the gateway | AUTH-03 | EMQX config, gateway, `mqttStore.ts` | M |
| 7 | Cut nginx back to static SPA only; remove exposed routes | GW-01 | `nginx.conf`, compose | S |

## Implementation steps

### 1. Gateway service (GW-02)

**Decision: YARP** — native .NET 8, first-class SignalR/WebSocket pass-through, and it reuses the JWKS validation and ASP.NET rate-limiter/output-cache middleware the estate already owns. (Envoy and Kong were considered; both add a second runtime and duplicate auth logic — see [03-api-gateway-and-edge.md](../architecture-review/03-api-gateway-and-edge.md) §3.)

- New service `src/services/gateway`, route map mirroring today's nginx table (11 upstreams + `/hubs` + `/mqtt-ws`).
- TLS 1.2+ termination with real certificates; HTTP redirects to HTTPS; WSS for both WebSocket routes.
- Deploy in **shadow mode** first (routes a copy of read traffic) to verify parity before cutover.

### 2. Edge-only authentication (GW-01, AUTH-08)

**Decided model: edge-only.** The gateway is the *sole* JWT validator; backend services stop validating
tokens and trust the gateway. This is what closes AUTH-08 — the duplicated per-service validators
(`_shared/TraverseAuth.cs` × 8 copies + the hand-rolled ones in `ams-api` and `display-service`) are
**deleted**, not consolidated into a shared library. The heavy JWKS/`kid`/signature logic lives in exactly
one place: the gateway.

At the gateway:
- Validate the RS256 JWT against auth-service JWKS (issuer/audience/expiry/signature), reject anonymous
  requests before they reach any service.
- Check the revocation set (`credentials_changed_at` epoch + `jti` blocklist from Plan 03) here — the
  single enforcement point. A deactivated user or rotated role is rejected at the edge within seconds.
- After validation, forward the caller's identity + `permission[]` claims to the upstream as **trusted
  headers** (e.g. `X-Auth-Subject`, `X-Auth-Roles`, `X-Auth-Permissions`). The gateway is the only writer
  of these headers.

At each backend service:
- Replace `AddTraverseAuth`/`UseTraverseAuth` JWKS validation with a trivial handler that populates the
  ASP.NET identity from the gateway-injected headers. **The existing per-endpoint policies
  (`RequireAuthorization("asset.edit")` etc.) keep working unchanged** — they read the same `permission`
  claims, now sourced from the trusted header instead of a locally-validated token. Fine-grained
  authorization stays in-service; only the *cryptographic validation* moves to the edge.

**Mandatory safety prerequisites (edge-only is unsafe without all of these):**
1. **Services are unreachable except through the gateway.** No published service ports; only the gateway
   can dial them — Docker-network isolation now, network policy + mTLS in the on-prem prod. If a service
   is directly reachable, anyone can forge `X-Auth-*` headers and bypass auth entirely.
2. **Reject spoofed identity headers.** Services accept `X-Auth-*` only over the gateway↔service mTLS
   channel (verified client cert) and strip any such headers arriving from elsewhere.
3. **Internal service-to-service calls bypass the gateway** (binding-resolver / cplm-api / analysis-service
   → asset-model). These use **mTLS/SPIFFE workload identity** (the AUTH-01 target), *not* the header
   trust — that is item 2b below and replaces the `X-Service-Key` scheme.
4. **Background Kafka consumers have no HTTP surface** and are unaffected — they authenticate to Kafka/EMQX,
   not through the gateway.

**Cutover sequencing (avoid a window where services trust headers while still publicly reachable):**
enable gateway validation + header injection → put services on the private network / mTLS and unpublish
their ports → *then* delete the per-service JWKS validators. Not the other order.

### 2b. Internal identity — mTLS/SPIFFE (AUTH-01 target)

Replace the shared `X-Service-Key` (Plan 03 hardened it, but it is still a bearer secret) with mTLS +
SPIFFE/SPIRE workload identity for the asset-model callers. asset-model authorizes the peer's SPIFFE ID
instead of a header, and the `Auth:ServicePermissions` scope from Plan 03 maps onto the peer identity.

### 3. Rate limiting (GW-03)

Sliding-window counters in Redis:

- Key schema: `rl:{routeClass}:{clientId}:{windowStart}` (INCR + TTL = window).
- `clientId` = `sub` claim when authenticated, else client IP.
- Starting limits: login **10/min/IP**; alarm-read 600/min/user; historian 120/min/user; snapshot 30/min/user; mutations 120/min/user; global ceiling 2000/min/IP.
- **Fail-open** on a Redis outage for read routes (availability), **fail-closed** for login and mutations (never drop brute-force protection).
- Note: auth-service's own limiter is currently relaxed to 2000/15min per IP — the gateway limit becomes the real control; tighten the service limit to match.

### 4. Response caching (GW-01)

| Route | TTL | Invalidation |
|---|---|---|
| `GET /api/assets` tree/by-path | 60 s | asset-model write (`asset-events`) |
| `GET /api/displays/{id}` config | 30 s | display-service write |
| `GET /api/bindings/resolve` | 30 s | asset/binding change |
| `GET /api/hist/trend`, `/summary` | 10 s | new IoTDB write window |
| `GET /api/templates/{id}` | 60 s | template publish |

- Cache key `cache:{routeClass}:{queryHash}:{userScopeHash}` — the scope hash folds in permissions/asset-scope so a cached response can never cross an authorization boundary.
- **Never cache:** current alarm state, ACK/shelve/suppress endpoints, `/hubs/*`, `/mqtt-ws`, CPM mutations, auth endpoints. Enforce this as an explicit deny-list with a test.

### 5. Limits, breakers, observability (GW-01)

- Per-route body limits: ACK ≤ 4 KB, display JSON ≤ 2 MB, default 256 KB.
- Per-upstream circuit breaker (open on sustained 5xx/timeouts) with fast failure.
- RED metrics per route, access logs, trace-header propagation.

### 6. Close the anonymous live plane (AUTH-03)

The broker has **no authenticator or ACL configured at all**, and the browser connects with no credentials.

- Enable an EMQX JWT authenticator validating the same RS256 tokens.
- Add per-client ACLs scoping `spBv1.0/#` — subscribe-only for browsers, publish rights only for the edge node; explicitly deny browser publication of `NCMD`/`DCMD` device commands.
- Route MQTT-WS through the gateway over WSS with an authorised upgrade; update `mqttStore.ts` to present the access token on connect.
- Provision a real edge-node credential (today's `ams_edge`/`changeme_edge` authenticates against nothing).
- Retire the unused 8084 WSS port or configure it properly.

### 7. Shrink nginx (GW-01)

- nginx serves the static SPA only; the gateway owns `/api`, `/hubs`, `/mqtt-ws`.
- Remove the public `/swagger` proxy (or restrict to non-production).
- Replace the hardcoded `/external-api/ → http://192.168.1.51:8010/api/` route with configuration.

## Exit criteria

- [ ] All client traffic reaches services only via the gateway over HTTPS/WSS; direct service ports are not published.
- [ ] An unauthenticated API request is rejected at the edge; a revoked token is rejected at the edge.
- [ ] **Edge-only holds:** exactly one JWT validator exists (the gateway); no backend service performs JWKS/signature validation. The per-service validators and `sync-auth-module.ps1` are gone (AUTH-08).
- [ ] A request carrying a forged `X-Auth-*` header, sent directly to a service (bypassing the gateway), is rejected — proving header trust is bound to the gateway↔service mTLS channel.
- [ ] asset-model authorizes its internal callers by SPIFFE/mTLS identity, not `X-Service-Key`.
- [ ] Rate limits enforced per client (verified by load test); login limiting fails closed when Redis is down.
- [ ] Cache hit-ratio measured on cacheable routes; an automated test proves alarm state, ACK, and live routes are **never** served from cache.
- [ ] An anonymous MQTT-WS connection is refused; an authenticated browser can subscribe but **cannot** publish device commands.
- [ ] Oversized request bodies are rejected per route.
- [ ] `/swagger` is not publicly reachable in production.

## Execution status (2026-08-10)

| # | Task | Status |
|---|---|---|
| 1 | YARP gateway + TLS knob | ✅ Built (`src/services/gateway`): route map mirrors nginx 1:1 (every rewrite shape live-tested), WS passthrough (101 to EMQX), `/swagger` gated, external-feed IP now config, HTTPS-on-8443 via `Gateway:Tls:CertPath` (cert to be supplied on-prem). Compose: **shadow mode on host 8081** alongside nginx. |
| 2 | Edge-only JWT validation | ✅ **Transition state**: gateway validates (JWKS, revocation within ~8s via auth-service internal poll, `X-Auth-*` injection + spoof-strip) *and* forwards the bearer, so services still validate. **Per-service validator deletion deliberately NOT done** — blocked on the §2 prerequisites (unpublish service ports / mTLS), which is the cutover step. |
| 3 | Rate limiting | ✅ Redis fixed-window per plan schema; login 10/min/IP + mutations fail CLOSED, reads fail OPEN — all proven by stopping Redis live. |
| 4 | Response caching | ✅ Allow-list of the plan's 5 route families with per-user scope hash; deny-list proven (no header/keys for alarm/auth/audit); cross-user isolation tested with a second account. |
| 5 | Limits/breaker/metrics | ✅ 4KB/2MB/256KB body caps (413), passive-health breaker (dead upstream: 503 in 6–10ms vs ~2.5s; 5xx responses never trip it), 5s connect timeout, `/gw/metrics` RED + access log. |
| 6 | EMQX auth + MQTT-WS behind gateway | ✅ Done — EMQX 5.6 authenticator chain (JWT-via-JWKS for browsers, `from=password`, `disconnect_after_expire=false`; built-in DB for `ams_edge`, provisioned by the new `emqx-init` one-shot). File ACL + `no_match=deny`: edge owns `spBv1.0/#`, browsers subscribe-only, **NCMD/DCMD publish denied**. `mqttStore.ts` presents the token as MQTT password + `?access_token=` (both refreshed per reconnect); gateway `/mqtt-ws` route flipped to authenticated. 8084 retired. **Tested 8/8**: anonymous refused; JWT subscribe-only; browser publishes dropped; edge DDATA delivered; upgrade rejected without token; real sparkplug-edge-node reconnected under auth. |
| 7 | nginx → static SPA only | ✅ Done — nginx rewritten to SPA + single-upstream pass-through to the gateway (`/api`, `/hubs`, `/mqtt-ws`, `/health`); `/swagger` + `/external-api` removed (SPA fallback, never proxied); Vite dev proxy collapsed to the gateway (dev/prod parity); frontend `depends_on` gateway. **Deployed & smoked on :3000**: SPA + login + authed reads + 401-at-edge + MQTT WS 101 through the real `browser→nginx→gateway→services` chain (6/6). **Final lockdown remains** (see below). |

Defects found & fixed while testing: auth-service refresh tokens had no `jti` (two same-second logins → duplicate-key 500); YARP's default `HealthyOrPanic` re-dials the only unhealthy destination (breaker never fast-failed until `HealthyAndUnknown` was set); lab DB was missing migration 38 (`credentials_changed_at`) — applied.

### Final lockdown — ✅ DONE (2026-08-10). AUTH-08 closed.

Executed as one coordinated change, in the §2 cutover order:

1. **Ops tooling repointed** — every `scripts/**` reference to a direct `localhost:<port>` now
   targets the gateway (path-equivalents for native service paths; per-service health via the
   new `GET /gw/upstreams/<cluster>/health` passthrough). A native `/api/v1/audit` route was
   added to the gateway for path-parity. Vite dev proxy already targeted the gateway.
2. **Direct service host ports unpublished** — ams-api 8000, auth-service 3002, asset-model 5001,
   binding-resolver 5002, display-service 5003, template-service 5004, analysis-service 5005,
   cplm-api 5006, historian-bff 8090, audit-service 8095, notification-service 8096, EMQX WS 8083.
   Kept: gateway 8081, frontend 3000, EMQX 1883 (authenticated, external SCADA/edge clients) +
   18083 dashboard, infra ports. **Verified: all 12 closed ports refuse connections.**
3. **Per-service JWT validators deleted** — `TraverseAuth.cs` rewritten as a header-trust shim
   (no crypto; same `AddTraverseAuth`/`UseTraverseAuth` surface, keeps the scoped `X-Service-Key`
   path for internal calls) and synced to 9 services (display-service folded onto it, its
   hand-rolled validator deleted); ams-api's JwtBearer stack replaced by `GatewayHeaderAuthHandler`.
   JwtBearer package refs removed estate-wide. **grep-verified: JWKS/JwtBearer code exists only in
   the gateway.** All per-endpoint permission policies unchanged.

Tested live on rebuilt images: 401-at-edge and 200-authed on real ams-api endpoints; SignalR
negotiate through the gateway (query token → header auth); every service's API through the
gateway; internal `X-Service-Key` → asset-model 200/401/401 (with/without/bad key); frontend
:3000 chain intact. Environment drift found & fixed during testing: migrations 35/36 (server
identity + shelving) had never been applied to the lab volume — applied (same class of drift as
migration 38 earlier; the lab's postgres volume predates the init-script additions).

**Remaining for on-prem (not lab-blocking):** real TLS cert on 8443; gateway↔service **mTLS**
so `X-Auth-*` trust is bound to the peer certificate — today it is network-bound (verified: an
in-network forged header is accepted, an out-of-network one cannot reach a service at all);
mTLS/SPIFFE to replace `X-Service-Key` for internal calls.

## Rollback

The gateway runs alongside nginx until cutover; rollback at any stage = repoint DNS/compose back to the nginx path. Item 6 is the exception — enabling EMQX authentication breaks unauthenticated clients by design; stage it by allowing both auth and anonymous briefly, then removing anonymous once the frontend cutover is confirmed.

## Risks & notes

- **Biggest schedule risk in the programme.** Treat as its own track with its own owner; Plans 06 (scale-out) and parts of 05 (caching) depend on it.
- SignalR through a gateway needs either sticky sessions or the Plan 06 backplane — sequence 06 immediately after, or enable sticky routing as an interim.
- Turning on EMQX auth requires the frontend change (item 6) to ship simultaneously, otherwise live values go dark for operators.
- TLS certificate lifecycle (issuance, renewal, trust store for mTLS in Plan 03) needs an owner before cutover.
