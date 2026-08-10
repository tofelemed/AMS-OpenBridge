# Runbook — JWT signing-key rotation (AUTH-06)

The auth-service signs access/refresh tokens with an RS256 private key and publishes the
matching public key(s) at `GET /api/auth/.well-known/jwks.json`. Every other service
(the .NET API, the Traverse microservices) validates tokens by fetching that JWKS and
selecting the key by the token's `kid` header. Rotation replaces the signing key **with an
overlap window** so no in-flight token ever fails validation.

## When to rotate

- **Scheduled:** quarterly.
- **On compromise / suspected exposure:** immediately, then force re-authentication of all
  users (`credentials_changed_at` bump — see step 5).
- **On staff turnover** with key-material access.

## How it works

- The signing key lives at `/app/keys/jwt-private.pem` (persisted in the `auth-keys` volume).
- Signing **always** uses the current key.
- If `/app/keys/jwt-previous-public.pem` exists, the service **also** publishes it in JWKS and
  will validate tokens signed by it. That file is the overlap.
- `keys.ts` auto-detects the previous-public file next to the private key — no env change
  needed. (Env overrides exist for out-of-band delivery: `JWT_PREVIOUS_PUBLIC_KEY`,
  `JWT_PREVIOUS_PUBLIC_KEY_PATH`, `JWT_PREVIOUS_KEY_ID`.)

## Grace window

The overlap MUST last **at least the access-token TTL** (`JWT_EXPIRES_IN`, default `15m`) so
every access token minted just before the switch validates for its whole life. Refresh tokens
(`JWT_REFRESH_EXPIRES_IN`, default `7d`) signed by the old key keep working only until the
overlap ends; any client that refreshes during the window is re-issued a token pair signed by
the new key. For a routine rotation, run the finalize step **after 7 days** to also cover
outstanding refresh tokens; for an emergency rotation, finalize after 15 minutes and accept
that un-refreshed sessions must log in again.

## Procedure

All commands run against the live container (`traverse-auth-service`).

### 1. Begin the overlap

```bash
docker exec traverse-auth-service node dist/tools/rotate-keys.js
```

This promotes the current public key to `jwt-previous-public.pem` and generates a new current
keypair. It prints the old and new `kid`s — record them.

### 2. Reload the service

```bash
docker compose -f infra/docker/docker-compose.yml restart auth-service
```

On boot the log shows `Previous signing key <kid> published for rotation overlap`. Confirm JWKS
now serves **two** keys:

```bash
curl -s http://localhost:3002/api/auth/.well-known/jwks.json | jq '.keys | length'   # -> 2
```

### 3. Verify both keys validate

- A freshly-issued token (new `kid`) works — log in and call any protected endpoint.
- A token minted before step 1 (old `kid`) still works until it expires. Downstream services
  re-fetch JWKS automatically when they first see the new `kid` (no restart of API/services
  needed).

### 4. Finalize — retire the old key (after the grace window)

```bash
docker exec traverse-auth-service node dist/tools/rotate-keys.js --finalize
docker compose -f infra/docker/docker-compose.yml restart auth-service
curl -s http://localhost:3002/api/auth/.well-known/jwks.json | jq '.keys | length'   # -> 1
```

### 5. (Compromise only) force re-authentication

Retiring the key does not by itself invalidate tokens already minted by it during the overlap.
On a suspected compromise, after finalize, bump every user's revocation epoch so all existing
tokens are rejected:

```sql
UPDATE users SET credentials_changed_at = NOW();
DELETE FROM refresh_tokens;
```

(`verifyToken` rejects any access token with `iat` older than `credentials_changed_at`, and the
refresh tokens are gone, so everyone must log in again.)

## Rollback

If the new key causes problems **before finalize**, restore the previous key as current:

```bash
docker exec traverse-auth-service sh -c 'cp /app/keys/jwt-previous-public.pem /tmp/prev.pub'  # keep a copy first
# put the previous PRIVATE key back as jwt-private.pem from your secure backup, then:
docker exec traverse-auth-service node dist/tools/rotate-keys.js --finalize
docker compose -f infra/docker/docker-compose.yml restart auth-service
```

> Keep the previous **private** key in the secret store until the overlap is finalized — the
> tool only persists the previous *public* key (enough to validate, not to sign or roll back).

## Local / non-Docker

```bash
cd src/services/auth-service
JWT_PRIVATE_KEY_PATH=./keys/jwt-private.pem npm run keys:rotate
# restart the dev server, verify, then:
JWT_PRIVATE_KEY_PATH=./keys/jwt-private.pem npm run keys:rotate -- --finalize
```
