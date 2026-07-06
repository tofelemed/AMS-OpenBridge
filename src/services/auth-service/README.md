# Auth Service (Traverse / AMS)

Standalone Node/Express authentication + RBAC microservice. Issues **RS256 JWTs**
that the .NET API and other services validate against the public key (JWKS). This
service is the single source of truth for roles and functional permissions.

- Port **3002**, all routes under `/api/auth`
- **No self-registration** — accounts are created by an Admin (or bulk import)
- Access token in the JSON body (in-memory on the client); refresh token in a
  **Secure httpOnly cookie**
- Roles: **Admin, Engineer, Operator, Viewer** → functional permissions embedded
  in the token as the `permission[]` claim

## Quick start (local dev)

```bash
npm install

# Create the traverse_auth database + schema (creates the DB if missing)
npm run migrate

# Create the first admin (reads BOOTSTRAP_ADMIN_* from .env / environment)
npm run seed:admin

# Optional: generate a stable RS256 keypair (otherwise a dev key is ephemeral)
npm run keys:gen        # then set JWT_PRIVATE_KEY_PATH=./keys/jwt-private.pem

npm run dev             # http://localhost:3002
```

Configuration lives in `.env` (see `.env.example`). Key vars: `DB_*`,
`JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_PRIVATE_KEY[_PATH]`, `CORS_ORIGIN`,
`COOKIE_SECURE`, `BOOTSTRAP_ADMIN_*`.

## Docker (compose stack)

The service is wired into `infra/docker/docker-compose.yml` as `auth-service`.
The `traverse_auth` database + schema is created by
`database/scripts/17_traverse_auth_schema.sql` on first Postgres init. Seed the
admin once the stack is up:

```bash
docker compose exec auth-service node dist/database/seed-admin.js
```

## API

### Auth
- `POST /api/auth/login` — `{ username, password }` → `{ token, user }` + sets refresh cookie
- `POST /api/auth/refresh` — rotates using the refresh cookie → `{ token }`
- `POST /api/auth/logout` — clears the refresh cookie + server record
- `POST /api/auth/verify` — verify a bearer access token
- `GET  /api/auth/me` — current user + permissions
- `PUT  /api/auth/me/profile`, `PUT /api/auth/me/password` — self-service
- `GET  /api/auth/.well-known/jwks.json` — public keys for token validators

### User management (Admin)
- `POST /api/auth/users`, `GET /api/auth/users`, `GET /api/auth/users/page`,
  `GET/PUT/DELETE /api/auth/users/:id`
- `POST /api/auth/users/bulk-import/{validate,execute}`, `GET .../template`

### RBAC (Admin)
- `GET /api/auth/roles` — list roles
- `GET /api/auth/permissions` — functional permission catalog
- `GET /api/auth/roles/:role/permissions` — permissions for a role
- `PUT /api/auth/roles/:role/permissions` — `{ permissions: string[] }` replace mapping

> There is **no** `POST /api/auth/register`.

## JWT contract (for validators)

RS256 · `iss=traverse-auth` · `aud=ams-services` · claims `sub`,
`preferred_username`, `email`, `role`, `permission[]`. Fetch the public key from
`/api/auth/.well-known/jwks.json`. See `docs/auth-jwt-contract.md` for the .NET
`AddJwtBearer` configuration.

## Security

- RS256 asymmetric signing (private key only in this service)
- bcrypt password hashing (configurable rounds)
- Helmet, rate limiting, explicit-origin CORS with credentials
- Parameterized SQL (no ORM)
