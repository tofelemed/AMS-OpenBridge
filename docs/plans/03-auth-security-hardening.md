# Plan 03 — Auth & Security Hardening (non-edge)

**Phase:** 1–2 · **Effort:** M · **Depends on:** nothing (runs parallel to Plans 01–02)
**Gaps closed:** AUTH-01, AUTH-02, AUTH-04, AUTH-05, AUTH-06, AUTH-07, AUTH-08, SEC-02
**Objective:** remove the authorization bypasses, replace the shared full-permission service key with real service identity, and give tokens a rotation and revocation story.

> **Scope note:** edge/TLS/rate-limiting and the anonymous MQTT plane are in [Plan 04](./04-api-gateway-and-edge.md). This plan hardens what sits behind the edge.

## Why

Three bypasses exist today: a single env var makes every ams-api REST controller anonymous, the observability hub has no `[Authorize]` at all, and anyone presenting the source-visible default service key gets a principal with **every** permission. Tokens cannot be revoked and signing keys cannot be rotated.

## Work items

| # | Task | Gap | Where | Effort |
|---|---|---|---|---|
| 1 | Remove the authorization kill switch | AUTH-02 | `AMS.Api/Program.cs:445-446` | S |
| 2 | Authorize the observability hub | AUTH-04 | `AMS.Api/Hubs/ObservabilityHub.cs` | S |
| 3 | Replace the shared service key with per-service identity | AUTH-01 | `_shared/TraverseAuth.cs`, compose | M |
| 4 | Add access-token revocation | AUTH-05 | `auth-service`, validators | M |
| 5 | Add signing-key rotation with JWKS overlap | AUTH-06 | `auth-service/config/keys.ts`, `tools/generate-keys.ts` | M |
| 6 | Secure and deploy notification-service | AUTH-07 | `src/services/notification-service` | S |
| 7 | De-duplicate the auth module (7 copies + 2 hand-rolled) | AUTH-08 | build contexts, `_shared` | M |
| 8 | Externalise secrets | SEC-02 | compose, CI, vault | M |

## Implementation steps

### 1. Remove the kill switch (AUTH-02)

`if (config.GetValue("Security:DisableApiAuthorization", false)) controllerEndpoints.AllowAnonymous();` turns the entire REST surface — alarms, ACK, shelve, admin, audit, OPC — anonymous from one environment variable.

- Delete the branch from the production code path.
- If a test hook is genuinely needed, gate it behind a compile-time symbol (`#if DEBUG_TEST_AUTH`) so it cannot exist in a release image.
- Remove `Security__DisableApiAuthorization` from all compose files.

### 2. Authorize the observability hub (AUTH-04)

`AlarmHub` carries `[Authorize]`; `ObservabilityHub` carries nothing, so drift alerts, alarm-state deltas, and replay streams push to any client that connects.

- Add `[Authorize]` with a dedicated policy (e.g. `system.manage` or a new `observability.view` permission).
- Add the permission to the auth-service seed catalogue and to the roles that need it.

### 3. Per-service identity (AUTH-01)

A valid `X-Service-Key` yields a principal holding **every** permission, the default value is in source, and the fail-closed guard only throws when the environment resolves to Production — which the sims overlay deliberately sidesteps by running services in Development.

Staged approach:
- **Now:** mandate a strong per-service key injected from the secret store; fail closed in **all** non-development environments; scope each service principal to the permissions it actually needs instead of `Perms.All`; remove the Development downgrade from the sims overlay.
- **Target (with Plan 04):** replace the header entirely with mTLS + SPIFFE/SPIRE workload identity between services; the gateway becomes the only place a client credential is translated.
- Log and alert on any use of a default/placeholder key value.

### 4. Access-token revocation (AUTH-05)

Access tokens (15 min) are validated by signature and expiry alone — deactivating a user leaves live tokens working until they expire.

- Add a `jti` claim to access tokens.
- Maintain a revocation set in Redis (TTL = remaining token lifetime) written on logout, password change, role change, and user deactivation.
- Check the set at the gateway (Plan 04) and, until the gateway exists, in the shared validation module.
- Keep the existing single-use refresh rotation — it is already correct.

### 5. Key rotation (AUTH-06)

One RSA keypair is generated once, `generate-keys.ts` refuses to overwrite, and JWKS exposes a single key with no overlap mechanism.

- Support **two** active keys: publish both in JWKS, sign with the newer `kid`, keep the older for validation through a grace window ≥ the access-token TTL.
- Add a rotation script/job: generate → publish both → switch signing → retire old after grace.
- Document the rotation runbook and schedule (e.g. quarterly, plus on-compromise).

### 6. notification-service (AUTH-07)

It has no auth wiring at all, blocks `Host.StartAsync` with a synchronous consume loop, and is absent from the CI build matrix — while Plan 02 makes it the consumer for safety alerts.

- Add `AddTraverseAuth()`/`UseTraverseAuth()` (or the shared library from item 7).
- Move the consume loop off the startup thread (`await Task.Yield()` / `Task.Run`) so a broker hiccup at boot cannot hang the host.
- Add the service to the CI build matrix and to compose.

### 7. Single auth library (AUTH-08)

`TraverseAuth.cs` is byte-copied into 7 services (CI `diff` guards those) plus two independent hand-rolled validators in `ams-api` and `display-service` that the guard does not cover — a hardening applied to `_shared` reaches only 7 of 9.

- Raise the Docker build context to `src/services` (or repo root) so each service can reference `_shared/Traverse.Auth.csproj` as a project/package.
- Delete the 7 copies and `scripts/sync-auth-module.ps1`; drop the CI drift step.
- Fold `ams-api` and `display-service` onto the same library so there is exactly one validator.

### 8. Secrets externalisation (SEC-02)

Plaintext defaults across compose take effect on any fresh clone: Postgres `supersecurepassword123` (12 sites), bootstrap admin `ChangeMe123!`, IoTDB `root/root` (hardcoded, not even env-overridable), Grafana `admin/admin`, EMQX dashboard, and committed scrape credentials.

- Move every credential to Docker/Kubernetes secrets or a vault; remove the `:-default` fallbacks so a missing secret fails loudly instead of silently using a known password.
- Make IoTDB credentials env-driven and change them off `root/root`.
- Rotate everything that has ever been committed.

## Exit criteria

- [x] `Security__DisableApiAuthorization` does not exist in any image or compose file.
- [x] Connecting to `/hubs/observability` without a valid token is rejected.
- [x] No service accepts the built-in default service key in any non-development environment; service principals no longer hold `Perms.All`.
- [x] Deactivating a user invalidates their live access token within seconds (revocation check verified).
- [x] A key rotation completes with zero failed validations during the overlap window.
- [x] notification-service authenticates its endpoints, starts without blocking the host, and builds in CI.
- [x] Exactly one JWT validation implementation exists in the repo. — **Met via the Plan 04 final lockdown (edge-only)**: JWKS/JwtBearer code exists only in the gateway; every service authorizes from gateway-injected `X-Auth-*` headers through the shared header-trust `TraverseAuth.cs` (no crypto). AUTH-08 **closed**.
- [x] No credential literal remains in compose; a missing secret fails startup.

## Rollback

Items 1, 2, 6 are code changes reverted by redeploy. Item 3 staged rollback = re-enable the header check with the strong key. Item 4/5 are additive (revocation set empty = current behaviour; second key optional). Item 7 is a build-system change — keep the copies in git history until the referenced library is proven in CI. Item 8: retain the old secret values in the vault until every service has cut over.

## Execution status (2026-08-10)

| # | Task | Gap | Status |
|---|---|---|---|
| 1 | Remove the authorization kill switch | AUTH-02 | ✅ Done — flag + branch deleted from `Program.cs`, removed from compose + appsettings. |
| 2 | Authorize the observability hub | AUTH-04 | ✅ Done — `[Authorize(Policy="system.manage")]` on `ObservabilityHub` (no live client to break). |
| 3 | Per-service identity | AUTH-01 | ✅ Done — fail-closed in **all** non-Development, `Auth:ServicePermissions` scoping (asset-model = `asset.view,asset.edit`; every other service = none), default-key-use warning, sims Development downgrade removed. |
| 4 | Access-token revocation | AUTH-05 | ✅ Done earlier (RBAC build) — `credentials_changed_at` epoch + refresh-token deletion. |
| 5 | Key rotation with JWKS overlap | AUTH-06 | ✅ Done — dual-key `keys.ts`, kid-selected verification, `keys:rotate` tool, runbook. Overlap proven: a token signed by the old key still validates after rotation (functional test). |
| 6 | Secure & deploy notification-service | AUTH-07 | ✅ Done — `AddTraverseAuth`/`UseTraverseAuth` wired (health/metrics stay anonymous); boot-hang + CI + compose were landed in Plan 02. |
| 7 | Single auth library | AUTH-08 | ⏸ **Deferred to its own CI-gated PR** (see below). |
| 8 | Externalise secrets | SEC-02 | ✅ Done — every credential literal removed from compose; missing secret aborts startup (`:?`); IoTDB creds env-driven; `.env.example` documents the now-required set. |

### AUTH-08 — deferred to Plan 04, resolved by deletion (edge-only auth)

**Decision (2026-08-10): edge-only auth.** The API gateway (Plan 04) becomes the *single* JWT
validator; backend services stop validating tokens and trust the gateway. So AUTH-08 — "exactly one
JWT validation implementation" — is achieved by **deleting** the per-service validators, not by
refactoring them into a shared library. The heavy JWKS/`kid`/signature logic ends up in one place: the
gateway. See [04-api-gateway-and-edge.md](./04-api-gateway-and-edge.md) §2.

Why this is the right sequencing: the shared-library refactor (raise every Docker build context, add a
`Traverse.Auth` project reference, fold `ams-api`/`display-service`) is a high-risk build-system migration
that the plan says must land as one full-CI PR — and it would be **throwaway** once edge-only deletes those
validators anyway. Meanwhile the security posture is intact: the 8 copies are byte-identical and the CI
drift guard (`sync-auth-module.ps1 -Check`) fails the build if they diverge.

What Plan 04 does for AUTH-08:
1. Gateway validates the JWT + revocation once, injects trusted `X-Auth-*` identity/permission headers.
2. Each service replaces its JWKS validator with a trivial "trust the gateway header" handler; existing
   `RequireAuthorization("…")` policies keep working off the injected `permission` claims.
3. Delete the 8 `Auth/TraverseAuth.cs` copies, the `ams-api`/`display-service` hand-rolled validators,
   `scripts/sync-auth-module.ps1`, and the CI drift step.
4. Enforce the edge-only safety prerequisites (services unreachable except via the gateway; header trust
   bound to gateway↔service mTLS; internal calls on mTLS/SPIFFE, not `X-Service-Key`).

> Fallback only if edge-only is ever reversed: consolidate the validators into
> `src/services/_shared/Traverse.Auth.csproj` referenced by all services via a raised Docker build context.

## Risks & notes

- **Item 7 touches every service's Dockerfile and build context** — do it in one PR with a full CI run, not service by service, or the estate ends up half-migrated.
- **Item 3's scoping change can break service-to-service calls** if a service needs a permission it was implicitly getting from `Perms.All`; enumerate actual call paths (binding-resolver → asset-model, cplm-api → asset-model) before narrowing scopes.
- Rotating the Postgres password (item 8) touches 12 connection strings plus the exporter DSN — coordinate as a single change.
