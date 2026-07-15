> # ⛔ SUPERSEDED — DO NOT USE FOR THE RUNNING SYSTEM
>
> These scripts are **NOT applied** by the stack. `infra/docker/docker-compose.yml` mounts only
> **`database/scripts/`** into `/docker-entrypoint-initdb.d`, and that directory is the single
> source of truth for the live schema.
>
> This `phase0/` set **conflicts** with `database/scripts/` (e.g. it creates an *unqualified*
> `display_definitions`, whereas the live schema — and `DisplayDbContext` — uses
> `displays.display_definitions`). Tables that exist **only** here and **do not exist** in the
> running system include: `operator_views`, `display_comments`, `tags TEXT[]`,
> `resource_permissions`, `attribute_instances`, `attribute_templates`,
> `state_machine_definitions`, `uom_classes` / `uom_units`, `categories`, `user_preferences`.
>
> Audit code against `database/scripts/`, never against this directory. Retained only for
> historical reference. See `AUDIT-REPORT.md` §7 (doc-vs-code discrepancies).

# Phase 0 Database Migrations

**Status:** ⛔ Superseded by `database/scripts/` — retained for reference only (see banner above)
**Date:** 2026-06-30

## Execution Order

Run these scripts in order against the PostgreSQL instance (port 5433):

```bash
# 1. Create databases (run as superuser)
psql -h localhost -p 5433 -U postgres -f 001_create_traverse_databases.sql

# 2. Create schemas (run per database)
psql -h localhost -p 5433 -U ams_user -d traverse_assets -f 002_traverse_assets_schema.sql
psql -h localhost -p 5433 -U ams_user -d traverse_displays -f 003_traverse_displays_schema.sql
psql -h localhost -p 5433 -U ams_user -d traverse_templates -f 004_traverse_templates_schema.sql
psql -h localhost -p 5433 -U ams_user -d traverse_analysis -f 005_traverse_analysis_schema.sql
psql -h localhost -p 5433 -U ams_user -d traverse_shared -f 006_traverse_shared_schema.sql
```

## Docker Execution

```bash
# From project root
docker exec -i ams-postgres psql -U postgres -f /docker-entrypoint-initdb.d/phase0/001_create_traverse_databases.sql

# Or interactively
docker exec -it ams-postgres psql -U postgres
```

## Databases Created

| Database | Owner | Purpose |
|----------|-------|---------|
| `traverse_assets` | ams_user | Asset Model service (UNS source of truth) |
| `traverse_displays` | ams_user | Display service (controlled displays + personal views) |
| `traverse_templates` | ams_user | Template service (Phase 3) |
| `traverse_analysis` | ams_user | Analysis definition service (Phase 4) |
| `traverse_shared` | ams_user | Shared reference data (UOM, categories) |

## Existing Database (Unchanged)

| Database | Owner | Purpose |
|----------|-------|---------|
| `ams` | ams_user | AMS alarm management (UNCHANGED) |

## Verification

```sql
-- List databases
\l

-- Expected output includes:
-- ams
-- traverse_assets
-- traverse_displays
-- traverse_templates
-- traverse_analysis
-- traverse_shared

-- Check tables in traverse_assets
\c traverse_assets
\dt

-- Expected:
-- assets
-- alias_mapping
-- attribute_instances
-- state_machine_definitions
```

## Rollback

```sql
-- Drop databases (CAUTION: destroys all data)
DROP DATABASE IF EXISTS traverse_assets;
DROP DATABASE IF EXISTS traverse_displays;
DROP DATABASE IF EXISTS traverse_templates;
DROP DATABASE IF EXISTS traverse_analysis;
DROP DATABASE IF EXISTS traverse_shared;
```
