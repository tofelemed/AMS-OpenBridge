# Database Setup

The auth service uses its own PostgreSQL database **`traverse_auth`** in the shared
Postgres instance. Schema and RBAC seed data live in `database/schema.sql`.

## Local dev

```bash
# .env holds DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME (see .env.example)

# Creates the traverse_auth database (if missing) + applies the schema
npm run migrate

# Creates the first admin from BOOTSTRAP_ADMIN_* env vars
npm run seed:admin
```

`npm run migrate` connects to the maintenance DB (`DB_ADMIN_DB`, default `postgres`) to
`CREATE DATABASE`, then applies `database/schema.sql` to `traverse_auth`. Both steps are
idempotent.

## Docker / compose stack

`traverse_auth` is created on first Postgres init by
`database/scripts/17_traverse_auth_schema.sql`. Seed the admin once the stack is up:

```bash
docker compose exec auth-service node dist/database/seed-admin.js
```

## Notes

- Auth signing uses **RS256** (`JWT_PRIVATE_KEY` / `JWT_PRIVATE_KEY_PATH`), not a shared
  `JWT_SECRET`. In dev an ephemeral key is generated if none is provided; run
  `npm run keys:gen` for a stable local keypair.
- Connection errors ("Connection terminated unexpectedly") usually mean Postgres is not
  reachable at `DB_HOST:DB_PORT` — verify the host/port and that the DB accepts the
  `DB_USER`/`DB_PASSWORD` credentials.
