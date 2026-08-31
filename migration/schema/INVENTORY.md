# Schema inventory — CPA Marun DBs

Source of truth for **what exists in repo SQL today**. Phase 1 files are in `schema/` (DDL only). HDPE site/areas/units are seed, not schema: `sql/03-hdpe-hierarchy.sql`.

Scripts live in `database/scripts/`. They assume Docker **initdb** (`CREATE DATABASE` + `\c` inside the same file). Marun **must not** use initdb on Instrumental’s volume.

- **01** = `CREATE DATABASE` only (Phase 2 script).
- **schema/*.sql** = `CREATE SCHEMA` / `TABLE` / indexes / functions — **no** `CREATE DATABASE`, **no** site seed (HDPE is `sql/`).
- **sql/** = seed (Phase 4).

Never `--force` apply these onto a live Instrumental DB that already has our tables.

**Phase 1 status (files on disk):**

| File | Kind |
|---|---|
| `schema/01-traverse_auth.sql` | DDL |
| `schema/02-traverse_assets.sql` | DDL |
| `schema/03-traverse_cplm.sql` | DDL (`30`+`32`+`34`+`42`+`44`; no `39_` Timescale) |
| `schema/04-traverse_ingestion.sql` | DDL |
| `schema/05-traverse_audit.sql` | GRANT only |
| `sql/03-hdpe-hierarchy.sql` | Seed (Phase 4 apply) |
| `sql/03-auth-rbac.sql` | Seed (Phase 4 apply) |

---

## Databases this cut (5)

| # | Database | Owner | Timescale? | Notes |
|---|---|---|---|---|
| 1 | `traverse_auth` | `ams_user` | No | Platform users — keep for later modules |
| 2 | `traverse_assets` | `ams_user` | No | UNS + aliases + relationships |
| 3 | `traverse_cplm` | `ams_user` | Optional (`39_` hypertables) | Skip `39_` unless ops installs Timescale (T1-lite) |
| 4 | `traverse_ingestion` | `ams_user` | No | Data Sources configs |
| 5 | `traverse_audit` | `ams_user` | No | Tables via audit-service `EnsureCreated` — schema file may be GRANT-only |

**Not this cut:** `ams`, `traverse_displays`, `traverse_templates`, `traverse_analysis`.

---

## 1. `traverse_auth` → Phase 1 file `schema/01-traverse_auth.sql`

| Repo script | Kind | Phase 1 |
|---|---|---|
| `17_traverse_auth_schema.sql` | CREATE DB + tables + **role/permission INSERT** | Tables → schema. Role/permission **INSERT** → `sql/03-auth-rbac.sql` (full catalog needed) |
| `33_cpm_permissions.sql` | INSERT `cpm.manage`, `system.manage` | → seed |
| `37_rbac_catalog.sql` | INSERT HMI keys + role matrix | → seed |
| `38_auth_timestamptz_revocation.sql` | ALTER TIMESTAMP→TIMESTAMPTZ + `credentials_changed_at` | **fold into schema** as TIMESTAMPTZ from the start (don’t ship naive TIMESTAMP then alter) |
| `41_auth_session_clocks.sql` | ADD `last_used_at`, `session_started_at` | **fold into** `refresh_tokens` DDL |
| `47_ingestion_permissions.sql` | INSERT `ingestion.view` / `ingestion.manage` | → seed |

**Tables (target):** `roles`, `permissions`, `role_permissions`, `users`, `refresh_tokens` (+ revocation/session columns from 38/41).

---

## 2. `traverse_assets` → `schema/02-traverse_assets.sql`

| Repo script | Kind | Phase 1 |
|---|---|---|
| `10_traverse_assets_schema.sql` | CREATE DB + `assets.assets`, `assets.alias_mapping` + indexes/trigger | DDL → schema. Strip CREATE DB / `\c` |
| `31_assets_relationships.sql` | `assets.asset_relationships` | → schema |
| `43_traverse_assets_transport_overrides.sql` | ALTER ADD override columns | **fold into** `assets.assets` CREATE |
| `15_traverse_assets_2site_plant.sql` | houston/dallas **seed** | **omit** (lab) |
| `16_pumpstation_20_pumps.sql` | 20 pumps **seed** | **omit** |
| `48_hdpe_plant_hierarchy.sql` | HDPE **seed** + instrumental-pro aliases | → `sql/03-hdpe-hierarchy.sql` |

**Tables (target):** `assets.assets` (with override columns), `assets.alias_mapping`, `assets.asset_relationships`.

---

## 3. `traverse_cplm` → `schema/03-traverse_cplm.sql`

| Repo script | Kind | Phase 1 |
|---|---|---|
| `29_traverse_cplm_db.sql` | CREATE DB only | 01 script, not schema |
| `30_cplm_analytics_schema.sql` | `analytics.cplm_gate_results`, `_short_feature_results`, `_long_feature_results` + views/indexes | → schema |
| `32_cpm_loop_registry.sql` | `cpm.loop_registry`, `loop_tag_map`, `loop_tag_catalog`, `threshold_profile`, `loop_group`, `loop_group_member`, `loop_link` | → schema. Any default threshold **INSERT** → seed if present |
| `34_cplm_event_frames.sql` | `analytics.cplm_event_frames` | → schema |
| `42_cplm_event_frames_indexes.sql` | extra indexes | **fold into** 34 |
| `44_cpm_signal_asset_ledger.sql` | `cpm.loop_signal_asset` | → schema |
| `39_timescale_policies.sql` (cplm section) | hypertables + compression + retention | **omit** unless T1-lite |

**Tables (target):**  
`cpm.loop_registry`, `cpm.loop_tag_map`, `cpm.loop_tag_catalog`, `cpm.threshold_profile`, `cpm.loop_group`, `cpm.loop_group_member`, `cpm.loop_link`, `cpm.loop_signal_asset`,  
`analytics.cplm_gate_results`, `analytics.cplm_short_feature_results`, `analytics.cplm_long_feature_results`, `analytics.cplm_event_frames`.

---

## 4. `traverse_ingestion` → `schema/04-traverse_ingestion.sql`

| Repo script | Kind | Phase 1 |
|---|---|---|
| `45_traverse_ingestion_db.sql` | CREATE DB | 01 script |
| `46_ingestion_data_sources.sql` | `ingestion.data_source_configs` | → schema |

**Tables:** `ingestion.data_source_configs`.

---

## 5. `traverse_audit` → `schema/05-traverse_audit.sql`

| Repo script | Kind | Phase 1 |
|---|---|---|
| `24_traverse_audit_db.sql` | CREATE DB + GRANT | 01 + GRANT in schema. **No tables** — `audit-service` `EnsureCreated()` builds `audit.immutable_events`. |

Phase 1 file: `GRANT` + comment. Optional: copy EF table DDL later if we want apply-without-service-boot.

---

## Explicitly out of schema dumps

| Script | Why |
|---|---|
| `01`–`03`, `35`, `36`, `40` | `ams` alarm DB |
| `11`, `12`, `13`, `14`, `18`–`23` | displays / templates / analysis |
| `15`, `16` | lab plant seed |
| `39` | Timescale; needs extension on Instrumental PG |

---

## Phase 1 assembly rules

1. One database per file, numbered in apply order (`01` auth → `05` audit).  
2. Header: `-- target: traverse_*` `SET client_min_messages TO WARNING;`  
3. `CREATE … IF NOT EXISTS` / guarded `DO $$` like today’s scripts.  
4. No `\c` (02 script wraps `psql -d $DB`).  
5. No `INSERT` except functions/default rows that are true schema (prefer seed). Threshold profile defaults: if 32_ seeds them, move to `sql/`.
