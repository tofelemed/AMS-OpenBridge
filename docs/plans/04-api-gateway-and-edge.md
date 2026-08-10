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

## Rollback

The gateway runs alongside nginx until cutover; rollback at any stage = repoint DNS/compose back to the nginx path. Item 6 is the exception — enabling EMQX authentication breaks unauthenticated clients by design; stage it by allowing both auth and anonymous briefly, then removing anonymous once the frontend cutover is confirmed.

## Risks & notes

- **Biggest schedule risk in the programme.** Treat as its own track with its own owner; Plans 06 (scale-out) and parts of 05 (caching) depend on it.
- SignalR through a gateway needs either sticky sessions or the Plan 06 backplane — sequence 06 immediately after, or enable sticky routing as an interim.
- Turning on EMQX auth requires the frontend change (item 6) to ship simultaneously, otherwise live values go dark for operators.
- TLS certificate lifecycle (issuance, renewal, trust store for mTLS in Plan 03) needs an owner before cutover.
