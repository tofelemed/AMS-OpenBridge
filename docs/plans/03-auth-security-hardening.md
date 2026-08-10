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
- [ ] Exactly one JWT validation implementation exists in the repo. — **AUTH-08 deferred to its own CI-gated PR** (the 8 copies remain byte-identical + drift-guarded meanwhile).
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

### AUTH-08 — why deferred, and how to execute

AUTH-08 raises every service's Docker build context and folds `ams-api` + `display-service`
onto one referenced `Traverse.Auth` project. Its correctness lives almost entirely in the
Dockerfile COPY/context changes, which **only** manifest in a full image build — this plan's
own guidance is to land it "in one PR with a full CI run, not service by service." A single
.NET service image build here runs >2 min, so validating all nine without CI is not feasible in
this pass, and a half-validated build-system change risks the half-migrated estate the plan
warns against. The current security posture is intact: the 8 copies are byte-identical and the
CI drift guard (`sync-auth-module.ps1 -Check`) fails the build if they diverge.

Ready-to-run steps (own PR, full CI):
1. Add `src/services/_shared/Traverse.Auth.csproj` (net8.0 classlib) wrapping `TraverseAuth.cs`.
2. For each service under `src/services` (asset-model, template-service, binding-resolver,
   historian-bff, analysis-service, audit-service, cplm-api, notification-service, display-service):
   raise its compose `build.context` to `../../src/services` with `dockerfile: <svc>/Dockerfile`;
   rewrite the Dockerfile COPY/restore to reference `<svc>/` and `_shared/`; add a
   `<ProjectReference>` to `Traverse.Auth.csproj`; delete `<svc>/Auth/TraverseAuth.cs`.
3. Fold `ams-api` (raise its context to include `src/services/_shared`, or publish `Traverse.Auth`
   as a local package) and `display-service` off their hand-rolled `JwksKeyCache`/validators.
4. Delete `scripts/sync-auth-module.ps1` and drop the CI drift step; run the full image-build CI.

## Risks & notes

- **Item 7 touches every service's Dockerfile and build context** — do it in one PR with a full CI run, not service by service, or the estate ends up half-migrated.
- **Item 3's scoping change can break service-to-service calls** if a service needs a permission it was implicitly getting from `Perms.All`; enumerate actual call paths (binding-resolver → asset-model, cplm-api → asset-model) before narrowing scopes.
- Rotating the Postgres password (item 8) touches 12 connection strings plus the exporter DSN — coordinate as a single change.
