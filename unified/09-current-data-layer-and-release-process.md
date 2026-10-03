# Current state: data layer of record and the release / migration process

Analysed at commit `6344ce9b` (branch `feat/v25-next-release`, 2026-09-27). Every claim below was read from the file or commit cited; anything not verified is marked **(inferred)**. Paths are repo-relative; `file:line` is the line where the fact lives.

## 1. Scope and sources examined

- `database/scripts/*.sql` (52 files, all headers + guard/hypertable greps), `database/scripts` git history (`--diff-filter=A`).
- `migration/` pack: `lib.sh`, `run-migration.sh`, `01-create-databases.sh`, `02-apply-schemas.sh`, `03-seed.sh`, `04-create-kafka-topics.sh`, `04b-submit-flink-jobs.sh`, `04c-apply-topic-retention.sh`, `05-validate.sh`, `schema/INVENTORY.md`, `sql/README.md`, `kafka/topics.txt`, `flink/JOBS.md`, `cron.d/cpa-capacity`, `UPDATE-RUNBOOK.md`, `DEPLOY-RUNBOOK.md`, `V2.5-DEPLOY.md`, `MARUN-DISK.md`, `OFFLINE_DEPLOYMENT_GUIDE.md`; `migration/deploy/`: `build-release.py`, `build-prod-images.py`, `prodimages.py`, `deploy.sh`, `pull-images.sh`, `docker-compose.marun.yml`, `releases/*.txt` (v2.1…v5), `README.md`.
- `infra/docker/docker-compose.yml`, `docker-compose.ha.yml`, `prometheus.yml`, `grafana/provisioning`, `iotdb-init-ttl.sh`, `flink-job-supervisor.sh`; `infra/helm`, `infra/windows`.
- `src/services/gateway/appsettings.json` + `Program.cs`; EF/`EnsureCreated`/`EnsureSchemaAsync` grep across `src/backend` and `src/services`; `scripts/sync-auth-module.ps1`, `scripts/cpm-*.sql`, `scripts/ensure_flink_jobs.py`, `scripts/kafka-reset-lab-topics.ps1`, `scripts/build-and-deploy.ps1`.
- `changes_tracker.md` (2394 lines), `prod_decision.md` (94), `checklist.md`, `MIGRATION_LOG.md`, `docs/api-gateway.md`, `docs/marun-capacity-remediation.md`, `docs/docker-disk-recovery-2026-09-20.md`, `docs/ha-production-guide.md`, `docs/INSTALL.md`, `docs/pre-prod/cpa-offline-audit.md`, `CLAUDE.md`.
- Git: `git show --stat` of `302b3adc` (cplm-api skeleton), `e811af5a` (ingestion service + DB + gateway route), `c9ad3afb` (topic add), `25a8de85` (Flink job add), `e654e8e6`/`66d3e280` (frontend routes).

## 2. How it works today

### 2.1 Schema catalog (`database/scripts`, filename order = execution order)

Scripts run once by the lab Postgres `initdb` (mounted at `infra/docker/docker-compose.yml:58`) against the default DB `ams` (`:48`); each Traverse script creates its DB with a guarded `\gexec` and then `\c`s into it. Guards: **INE** = `IF NOT EXISTS` count, **OC** = `ON CONFLICT` count, **DO** = `DO $$` guard. Only `39` carries hypertable/retention statements; `61` writes a `retention_policy` row. "Introduced by" is the adding commit, plus the CHG / plant script where one exists.

| File | Target DB | Creates / alters | Guards | Hypertable / partition / retention | Introduced by |
|---|---|---|---|---|---|
| 01_init_extensions.sql | ams | extensions (timescaledb, uuid-ossp, pg_trgm, btree_gin, pg_stat_statements, pgcrypto), 8 schemas, search_path, types | INE 14 | – | 54896e19 |
| 02_alarm_schema.sql | ams | `configuration` schema + tables | INE 2 | – | 54896e19 |
| 03_apply_ef_migrations.sql | ams | `__EFMigrationsHistory`, alarms enums/tables; **pre-marks 5 EF migrations incl. the hypertable one** (`:180-196`) | INE 16, OC 1 | defers to 39 | 54896e19 |
| 10_traverse_assets_schema.sql | creates `traverse_assets` | `assets.assets`, `alias_mapping`, indexes, trigger | INE 10, OC 5 | – | de23967b |
| 11_traverse_displays_schema.sql | creates `traverse_displays` | displays schema | INE 9, OC 2 | – | de23967b |
| 12_traverse_templates_schema.sql | creates `traverse_templates` | templates schema | INE 8, OC 6 | – | de23967b |
| 13_personal_views_schema.sql | traverse_displays | `displays.personal_views` | INE 5 | – | de23967b |
| 14_traverse_analysis_schema.sql | creates `traverse_analysis` | analysis schema | INE 10, OC 3 | – | de23967b |
| 15_traverse_assets_2site_plant.sql | traverse_assets | seed, 2-site plant | OC 8 | – | b2e69273 |
| 16_pumpstation_20_pumps.sql | traverse_assets | seed, 20 pumps | OC 3 | – | b2e69273 |
| 17_display_background_token_migration.sql | traverse_displays | data UPDATE (tokens) | none | – | b5a155f4 |
| 17_traverse_auth_schema.sql (duplicate `17_` prefix) | creates `traverse_auth` | users/roles/permissions/refresh_tokens + INSERTs | INE 13, OC 6 | – | b2e69273 |
| 18_display_published_at.sql | traverse_displays | ADD COLUMN | INE 5 | – | b5a155f4 |
| 19_display_thumbnail_and_level.sql | traverse_displays | ADD COLUMNs | INE 3 | – | b5a155f4 |
| 20_display_media_assets.sql | traverse_displays | media assets table | INE 3 | – | 56815a75 |
| 21_asset_template_column.sql | traverse_assets | ADD COLUMN template | INE 2 | – | 56815a75 |
| 22_display_governance.sql | traverse_displays | `displays.folders` + governance | INE 15 | – | 56815a75 |
| 23_analysis_calc_versions.sql | traverse_analysis | `analysis.calculation_versions` | INE 3 | – | 56815a75 |
| 24_traverse_audit_db.sql | creates `traverse_audit` | DB only; tables by audit-service `EnsureCreated` (`src/services/audit-service/Program.cs:59`) | \gexec guard | – | 56815a75 |
| 29_traverse_cplm_db.sql | creates `traverse_cplm` | DB only (template for a new DB, 15 lines) | \gexec guard | – | ba2a029f |
| 30_cplm_analytics_schema.sql | traverse_cplm | `analytics` schema, `cplm_short/long_feature_results`, `cplm_gate_results` | INE 18 | hypertable in 39 (lab); partitions via `cpm-10b` (plant) | 457b8d6b |
| 31_assets_relationships.sql | traverse_assets | `assets.asset_relationships` | INE 4 | – | 0b4974a6 |
| 32_cpm_loop_registry.sql | traverse_cplm | `cpm` schema + `loop_registry` | INE 15, OC 1 | – | 0b4974a6 |
| 33_cpm_permissions.sql | traverse_auth | INSERT `cpm.manage`, `system.manage` | OC 3 | – | c0ec3f6b |
| 34_cplm_event_frames.sql | traverse_cplm | `analytics.cplm_event_frames` (lifecycle table) | INE 5 | excluded from Timescale (39:20-23) | 9b38f490 |
| 35_alarm_current_identity.sql | ams | `uq_alarm_current_identity` | INE 4 | – | 913a3975 (Plans 01/02) |
| 36_alarm_shelving.sql | ams | shelving columns + index | INE 7 | – | 913a3975 |
| 37_rbac_catalog.sql | traverse_auth | RBAC catalog INSERTs | OC 6 | – | 0fe547a0 |
| 38_auth_timestamptz_revocation.sql | traverse_auth | TIMESTAMP→TIMESTAMPTZ, `credentials_changed_at` | INE 1 | – | 0fe547a0 |
| 39_timescale_policies.sql | ams, traverse_analysis, traverse_cplm | **LAB ONLY** hypertables + compression + retention (values in §2.5) | INE 2, OC 2, DO PK-widening | yes | e2458351 (Plan 05 A) |
| 40_alarm_hot_indexes.sql | ams | pg_trgm + hot indexes | INE 8 | – | e2458351 |
| 41_auth_session_clocks.sql | traverse_auth | `last_used_at`, `session_started_at` | INE 2 | – | 69c014b3 |
| 42_cplm_event_frames_indexes.sql | traverse_cplm | event-frame indexes | INE 3 | – | cf7c83cb |
| 43_traverse_assets_transport_overrides.sql | traverse_assets | `iotdb_path_override` etc. | INE 6 | – | cf7c83cb |
| 44_cpm_signal_asset_ledger.sql | traverse_cplm | `cpm.loop_signal_asset` | INE 1 | – | cf7c83cb |
| 45_traverse_ingestion_db.sql | creates `traverse_ingestion` | DB only | \gexec guard | – | e811af5a |
| 46_ingestion_data_sources.sql | traverse_ingestion | `ingestion.data_source_configs` | INE 4 | – | e811af5a |
| 47_ingestion_permissions.sql | traverse_auth | INSERT `ingestion.view/manage` | OC 2 | – | e811af5a |
| 48_hdpe_plant_hierarchy.sql | traverse_assets | seed HDPE Plant→Area→Unit | OC 5 | – | ef2e9fc0 (decision #17) |
| 49_ingestion_unknown_sources.sql | traverse_ingestion | `ingestion.unknown_sources` | INE 2 | – | 0d10c338 |
| 50_alarm_ack_lifecycle.sql | ams | ACK lifecycle columns | INE 4 | – | 767e2c80 |
| 51_ingestion_loop_state.sql | traverse_ingestion | `ingestion.loop_state` | INE 2 | – | 042efcaf / CHG-016 (tracker:788) |
| 52_cplm_fleet_latest_indexes.sql | traverse_cplm | `idx_cplm_gate_results_latest_real/_any` | INE 4 | – | 0cb8e1bd / CHG-023 → plant `cpm-04` |
| 53_cplm_v25_identity_evidence.sql | traverse_cplm | `analysis_run`, `evidence_manifest/chunk`, identity cols | INE 38, OC 2 | – | 49938db1 / CHG-026 → `cpm-07` |
| 54_cpm_instrument_bindings.sql | traverse_cplm | btree_gist, effective-dated bindings | INE 14 | – | 4ef64e9a / CHG-026 → `cpm-07` |
| 55_cplm_response.sql | traverse_cplm | `analytics.response_event` + models | INE 12 | – | 01e8122a / CHG-027 → `cpm-07` |
| 56_cplm_investigation_refs.sql | traverse_cplm | `analytics.investigation_reference` | INE 3 | – | 7af35971 / CHG-027 → `cpm-07` |
| 57_cpm_loop_model_dimensions.sql | traverse_cplm | `loop_registry` model columns | INE 7 | – | 910c5b93 / CHG-027 → `cpm-07` |
| 58_cpm_config_governance.sql | traverse_cplm | `cpm.gate_config_bundle` + governance | INE 13 | – | 8a0a6084 / CHG-028 → `cpm-07` |
| 59_cpm_v25_permissions.sql | traverse_auth | v2.5 `cpm.*` permissions | OC 4 | – | 04bdb7d5 / v2.5 → `cpm-08` |
| 60_cplm_event_shelving.sql | traverse_cplm | shelf columns, `cplm_event_actions`, legacy conversion | INE 9 | – | e654e8e6 / CHG-032 → `cpm-09` |
| 61_cplm_episode_capture.sql | traverse_cplm | `capture_count`, `cplm_episode_capture`, `EPISODE` policy row | INE 4, OC 1 | `retention_policy` row | 54d0ebfd / CHG-033 → `cpm-10a` |

Not in the lab tree but part of the plant path: `scripts/cpm-10b-result-partitions.sql` (daily RANGE partitions on `window_end` for the three result tables, plain PG15, refuses hypertables, run with cplm-api stopped — header `:1-30`).

### 2.2 Applying schemas to a live database

**There is no migrations table for the SQL scripts.** The only version ledger is EF's `public.__EFMigrationsHistory` in `ams`, which `03` pre-fills and `AMS.Api` then runs `MigrateAsync()` against at startup (`src/backend/AMS.Api/Program.cs:102,285`; the sole `Migrations` folder is `src/backend/AMS.Infrastructure/Migrations`). Traverse services use no EF migrations: audit-service `EnsureCreated()` (`Program.cs:59`); cplm-api self-heals DDL at consumer start (`CplmEventFrameService.cs:286`, `CplmResultConsumerService.cs:416`, `CplmConditionConsumerService.cs:110`, `Services/Registry/CpmLoopRegistryService.Schema.cs:18`); ingestion creates `loop_state` itself (`releases/v4.txt`).

**Lab (already-initialised volume):** `initdb` runs the mounted scripts only on an empty volume (`scripts/build-and-deploy.ps1:122`). A new `NN_*.sql` reaches an existing lab DB only through a service's self-heal DDL or by hand (`changes_tracker.md` CHG-032: "the consumer's self-heal DDL applies the schema, or run `database/scripts/60_…` by hand"). A literal error in one script stops the rest of the initdb run (tracker:1274, script 42). This is the "lab volume drift" trap.

**Plant (Marun, Instrumental's cluster, never initdb — `migration/schema/INVENTORY.md`):**
- Fresh install: `run-migration.sh` → `01-create-databases.sh` (role `ams_user` + the five DBs in `lib.sh:14-20`: auth, assets, cplm, ingestion, audit) → `02-apply-schemas.sh` (one file per DB from `migration/schema/0N-*.sql` (`:89-93`), **skipped when the sentinel table exists** (`apply_one`, `:33-55`), then `normalize_ownership` → `ams_user` on every schema/table/sequence/view/function (`:57-87,95`)) → `03-seed.sh` (`sql/03-auth-rbac.sql`, `sql/03-hdpe-hierarchy.sql`, bootstrap admin) → `05-validate.sh`. `04`/`04b` are gated by `ALLOW_CREATE_PREFIXED_TOPICS` / `ALLOW_FLINK_SUBMIT`.
- **ALTER of a live prod DB in a release:** write a plant ops script `scripts/cpm-NN-<name>.sql` = the lab script minus its `\c` header (`scripts/cpm-07-v25-schema.sql:7`, `cpm-10a-episode-evidence.sql:9`), add it to `OPS_FILES` in `migration/deploy/build-release.py:55-72` so it ships under `ops/`, mirror it into `migration/schema/03-traverse_cplm.sql` (fresh installs) and into the service's `EnsureSchemaAsync`. "Four copies as always" (CHG-033). On the VM: `docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < /tmp/<rel>/ops/cpm-NN.sql` → `bash migration/02-apply-schemas.sh` (ownership; the go-live 42501 trap) → image swap. Statements that change a writer's unique key or partition a table run with the service stopped (`cpm-07b`, `cpm-10b`). Last done: `cpm-10a` (online) + `cpm-10b` (stopped) in v2.6 / v2.6.1; `cpm-07/07b/08/09` in v2.5 (`migration/V2.5-DEPLOY.md` "Schema" row).
- **New database for a new service:** lab `database/scripts/NN_traverse_<svc>_db.sql` (copy of `29`/`45`) + `NN+1` schema script; plant `migration/schema/0N-traverse_<svc>.sql` + `TRAVERSE_DBS` in `lib.sh` + an `apply_one` line with a sentinel and the `normalize_ownership` loop in `02-apply-schemas.sh` + `05-validate.sh`. Last done: ingestion (`e811af5a`: scripts 45/46/47; `migration/schema/04-traverse_ingestion.sql`).

### 2.3 Release bundle and deploy steps

- **Cut:** commit (dirty tree refused, `build-release.py:584`; bundles ship `git archive HEAD`) → `python migration/deploy/build-release.py --release vN [--skip-jar] [--only svc] [--dry-run]`. Manifest `migration/deploy/releases/vN.txt`: one compose service per line, `#` comments explain *why each is here*, optional `!data-load` / `!v25-upgrade` / `!v26-retention` directives that add step blocks to the generated steps (`:95-124`; an unknown service or directive is refused, `:121,124`).
- **Output** `release-out/<vN>-<YYYYMMDD>[-rN]/`: one `.tar.gz` per image (saved by Python, never PowerShell — rule 5), `ams-flink-1.0-SNAPSHOT.jar` beside them, `src-<commit>.tar.gz`, `ops/` (the `OPS_FILES`), `SHA256SUMS.txt`, generated `VM-STEPS.md` with expected outputs (`:302-560`). Every image must fingerprint **PROD** (`prodimages.image_kind`, `:196-223`) or the save is refused.
- **Image naming / registry:** none. Images are `ams-cpa-<service>` with unversioned tags, except `ams-flink:1.0-SNAPSHOT` (JM, TM, submitters, supervisor share it) and `ams-sparkplug-edge-node:1.0-SNAPSHOT` (`prodimages.py:27,62-69`). They move by `scp` + `docker load`; `deploy.sh` and `pull-images.sh` refuse to build/pull when `instrumental-postgres` is present.
- **Deploy on the VM** (`UPDATE-RUNBOOK.md §1`, `V2.5-DEPLOY.md` C0-C7, tracker "Release v2.6"): `sha256sum -c` → rollback point `/tmp/pre-<rel>-images.txt` → manual `pg_dump -Fc` of the touched DBs to `/opt/ams-recovery` (`V2.5-DEPLOY.md:103-104`) → `tar -xzf src-<commit>.tar.gz -C /opt/AMS-open` (**not a git checkout**; `migration/.env` is untracked and survives) → online ops SQL + ownership → `docker load` → `export START_AMS_API=yes ALLOW_FLINK_SUBMIT=yes [ALLOW_CREATE_PREFIXED_TOPICS=yes]; bash migration/deploy/deploy.sh --prod` (compose recreates only changed containers) → per-service checks (runbook table) → stopped-writer SQL → cron file.
- **Flink jars:** baked into the `ams-flink` image at `/opt/flink/usrlib` (`prodimages.py:102`) and shipped again as a file for cplm-api's recompute bind-mount (`docker-compose.yml:1434`). Verified by sha256 in `SHA256SUMS.txt` and at runtime by `GET /api/v1/cpm/capabilities` → `config.jarSha256s` (`build-release.py:365`); `prod_decision.md §2` records the jar hash per deployment. **No savepoints, no HA at the plant:** a jar change = `docker rm -f` JM+TM, then `04b` (`submit_if_missing`) resubmits; window state is rebuilt (short within the hour, 12 h/24 h within a day).
- **Rollback:** retag the previous image id from the pre-update list, `deploy.sh --prod` (`UPDATE-RUNBOOK.md §3`); schema changes are additive by design so the old image ignores new columns; `V2.5-DEPLOY.md` "Rollback" (`:214-235`).
- **Env knobs** (`migration/.env`, exported before `deploy.sh`): `START_AMS_API` (profile `cpa-ams-api`, `deploy.sh:70-73`), `ALLOW_FLINK_SUBMIT`, `ALLOW_CREATE_PREFIXED_TOPICS`, `CPLM_EVIDENCE_EMIT`, `CPLM_SHORT_EVIDENCE_EMIT`, `CPLM_SHORT_PARALLELISM`, `CPLM_GATE_CONFIG_KEY` (= `TRAVERSE_SERVICE_KEY`, `docker-compose.marun.yml:256,312`), `SERVICE_LOG_LEVEL`, `COMPOSE_PROJECT_NAME=ams-cpa`; secrets checked by `require_compose_secrets` (`deploy.sh:75-83`).

### 2.4 `changes_tracker.md` and `prod_decision.md` templates (verbatim headings)

**Latest CHG entry shape** (CHG-033, `changes_tracker.md:2315-2394`; CHG-032 shelving at `:2198` uses the same bold-label style):

```
## CHG-0NN — <title> (<YYYY-MM-DD>)
**Scope:** <services, plant SQL steps, scripts, docs>
**What was wrong.** …
**What changed.**
- **<change>** (`<class/file>`): …
- **Schema, four copies as always:** `scripts/cpm-NNx.sql` (plant), `database/scripts/NN_*.sql` (lab), `migration/schema/0N-*.sql` (fresh install), `<Service>.EnsureSchemaAsync` (self-heal).
- **Release wiring:** `migration/deploy/releases/vN.txt`, `build-release.py` OPS_FILES + VM-STEPS blocks …
**Tests.** …
**End-to-end on the lab (<date>).** …
**Migration / service update.** See "Release vN - what to build and run" above. Order matters: …
**Risks and known limits.** …
```
(The ops-only CHG-032 disk entry at `:2260` uses **Scope / What happened / Recovery done / Permanent fix added / Updated services / Scripts to run for v3 (…, in this order) / Verification**; the older ✅ entries CHG-026..028 use `### What changed`, `### Migration and service update (…)`, `### Verification (lab, <date>)`, `### Risks and deliberate limits`.)

**Release section shape** (`:1785-1826`):
```
## Release vN — what to build and run
<what prod runs now>. vN is **CHG-0NN** only. **Updated service(s): `<svc>`** (…). Build: `python migration/deploy/build-release.py --release vN` (manifest `migration/deploy/releases/vN.txt`); built <date> as `release-out/vN-<date>`… Production settings of record: prod_decision.md. Scripts and steps to run at the plant, in order:
0. … 1. `ops/<sql>` (online, additive) → `bash migration/02-apply-schemas.sh` (ownership). 2. Image swap … 3. … 
Tests behind it: … Details: [CHG-0NN](#…). Plant note: release-note-vN.md. Progress: checklist.md "…".
```

**`prod_decision.md` structure** (whole file, 94 lines; "this file is the state, CHG entries are the history"):
```
# prod_decision.md — the production settings of record (Marun, CPA / loop performance)
Last updated: <date> (<release>, plant rollout <state>).
## 1. Where it runs                       | Item | Value | Why / where recorded |
## 2. Versions on the plant               | Date (UTC) | What | Bundle / jar |
## 3. Retention: what we keep and for how long   | Store | Setting | Value at the plant | Where | Why |
## 4. Engine and pipeline settings        | Setting | Value | Why |
## 5. Performance settings                | Where | Setting | Why |
## 6. Issues faced and what we changed    | Date | Issue | Change | Record |
## 7. Deploying to another server: what to decide again   (numbered list)
```

### 2.5 Settings of record

| Concern | Value | Source |
|---|---|---|
| Postgres | lab `timescale/timescaledb:latest-pg15`; plant = Instrumental PG15, **no TimescaleDB**; one cluster, one DB per service | `docker-compose.yml:43`; `prod_decision.md §1` |
| Timescale (lab only) | `alarms.alarm_history` 1 d chunks, compress 7 d, retain 730 d; `historical_alarms` 730 d; `alarm_state_transitions` 730 d; `analysis.analysis_executions` 7 d chunks, compress 30 d, retain 180 d; `cplm_short_feature_results` 365 d, `cplm_long_feature_results` 730 d, `cplm_gate_results` 730 d (7 d chunks, compress 30 d, segment by loop_id) | `39_timescale_policies.sql:58-66,69-77,80-88,111-118,144-172` |
| Plant result retention | daily partitions; `retention_policy` rows `SHORT_FEATURES` 3 d, `LONG_FEATURES` 30 d, `GATE_RESULTS` 30 d (14 d if the headroom rule fires); maintenance hourly, 5 s lock timeout | `scripts/cpm-10b`; `prod_decision.md §3` |
| Evidence classes | `TRANSIENT` 6 h AND 2 GiB (`Cplm__EvidenceTransientHours/BudgetBytes`), sweep 15 min; `EPISODE` 90 d after CLOSE; `STANDARD` 3 d (shipped 90); `PINNED` never; `CPLM_EVIDENCE_EMIT=episodes`, `CPLM_SHORT_EVIDENCE_EMIT` unset (=none) | `prod_decision.md §3`; `04b-submit-flink-jobs.sh` |
| Kafka plant topics (`retention.ms`) | `loop.samples.v1` 12 h (16 parts, lz4); `feature.short` 2 h; `feature.long` 6 h; `gate.results` 3 d; `condition` 1 d; `gate.evidence` 1 h; `response.results` 3 d; `instrument.health` 3 d; `live.loop.metrics` 1 h; `audit-events`, DLQs, `gate-config.acks` 3 d; **compacted**: `context.instrument-health`, `context.gate-config`, `ams.metadata.updates`, `context.parameter-set`; RF 2, min ISR 1; `segment.ms` = retention/4, floor 1 h, cap 6 h | `migration/kafka/topics.txt:25-41`; `lib.sh:54-55`; `04-create-kafka-topics.sh:53-54` |
| Kafka lab broker | auto-create off, 4 default partitions, `log.retention.hours` 24, 100 MB segments; lab topics 7 d / 1 h segments, RF from env | `docker-compose.yml:388-392`; `scripts/kafka-reset-lab-topics.ps1:8-16` |
| Redis | `ams-redis` 512 mb `volatile-lru`, AOF + `save 60 1`; `ams-redis-contract` 256 mb `noeviction`, AOF; plant identical (overlay sets only the profile) | `docker-compose.yml:127-130,160-163`; `docker-compose.marun.yml:115-118` |
| IoTDB | 1.3.2 standalone; `iotdb-init` one-shot enforces the password, creates `root.ams` (**TTL 365 d**) and the loop DB `root.site1` (**TTL 90 d**; a 730 d kpi-subtree TTL is attempted first but path-pattern TTL rewrites the DB TTL on 1.3.2); plant ports unpublished; log files truncated hourly at 200 MB by cron | `infra/docker/iotdb-init-ttl.sh:32-34,83-120`; `docker-compose.marun.yml:119-121`; `migration/cron.d/cpa-capacity` |
| Flink lab | ZooKeeper HA (`/flink-ams`, `s3://ams-flink/ha/`), RocksDB incremental, checkpoints `s3://ams-flink/checkpoints`, 3 retained, interval 60 s, min-pause 30 s, EXACTLY_ONCE, timeout 120 s, `RETAIN_ON_CANCELLATION`, Prometheus reporter :9249 | `docker-compose.yml:538-582` |
| Flink plant | **no HA**, `DELETE_ON_CANCELLATION`, JM 1024 m, TM `process.size` 2560 m / metaspace 512 m, 16 slots, `restart-strategy exponential-delay` 1 s → 5 min, `CPLM_SHORT_PARALLELISM=4`, sample idleness 30 min (jar patch 2) | `docker-compose.marun.yml:263,277-283,296,322-325`; `prod_decision.md §4` |
| Gateway | Redis round trip 300 ms, circuit 3 failures / 30 s open; upstream connect timeout 5 s; passive health reactivation 60 s; `/hubs` `ActivityTimeout` 1 day; rate classes login 10/min/IP, session 60, snapshot 30, mutations 120/min global | `src/services/gateway/appsettings.json:38-40,299,303,308`; `docs/api-gateway.md:77-81`; `UPDATE-RUNBOOK.md §2` |
| Frontend nginx | `proxy_read_timeout 86400` on `/api`, `/hubs` | `src/frontend-ob/nginx.conf:55,67-68` |
| Container logs | json-file 10 m × 3 for every service; plant `.NET` at `SERVICE_LOG_LEVEL=Error`, Flink error-only log4j | `docker-compose.yml:4-7`; `MARUN-DISK.md §2` |
| Disk floors | plant ≥ 8 GB free before any `docker load`, < 3 GB = incident; lab watch task stops the stack < 20 GB, 160 GB VHDX cap pending | `MARUN-DISK.md:6`; tracker CHG-032 (disk) |

### 2.6 Wiring checklists with git examples

**Microservice** (last real: `cplm-api` `302b3adc`, `ingestion-service` `e811af5a`):
1. `src/services/<svc>/` — `Dockerfile`, `Program.cs`, `<svc>.csproj`, `appsettings.json`, `.dockerignore`, `Auth/TraverseAuth.cs` (copied, not referenced: each image builds from its own context).
2. `scripts/sync-auth-module.ps1:15` — add to `$services`, run it (both example commits touched it and every sibling `Auth/TraverseAuth.cs`).
3. `infra/docker/docker-compose.yml` — service block: `build.context ../../src/services/<svc>`, `container_name traverse-<svc>`, `logging: *default-logging`, `<<: *default-restart`, `depends_on` postgres/kafka healthy, env `ASPNETCORE_URLS`, `ConnectionStrings__<Db>`, `Auth__JwksUrl/Issuer/Audience/ServiceKey/ServicePermissions`, `Kafka__BootstrapServers`, **no `ports`** (Plan 04 lockdown), `networks: [ams-backend]`, `/health` healthcheck via `/dev/tcp` (pattern `:1385-1445`). `infra/docker/.env.example` keys (`e811af5a` +10).
4. `src/services/gateway/appsettings.json` — a `Routes` entry + a `Clusters` entry (see gateway route below); `docs/api-gateway.md` table row.
5. Database — §2.2 "new database" (lab `NN_traverse_<svc>_db.sql`, plant `migration/schema`, `lib.sh`, `02-apply-schemas.sh`).
6. `migration/deploy/docker-compose.marun.yml` — overlay block (`<<: *cpa-shared`, `depends_on: !reset`, `ConnectionStrings` with `POSTGRES_HOST`, `<<: *kafka-env`; pattern `:175-182`); `migration/deploy/prodimages.py` `BUILD_SERVICES` (`:31`) or the manifest is refused (`build-release.py:121`).
7. `infra/docker/prometheus.yml` scrape job only once the service has `/metrics` (`:94`: "do not scrape blind targets").
8. E2E script `scripts/test-<svc>-e2e.ps1` (`e811af5a`: `scripts/test-ingestion-config-e2e.ps1`), `tests/<svc>.Tests` project.
9. `migration/deploy/releases/vN.txt` line with the "why"; a CHG entry; `prod_decision.md` rows for any new retention/setting; `UPDATE-RUNBOOK.md §1` post-update check row.

**Kafka topic** (last: `c9ad3afb` gate-config bundle + ACK topics; `25a8de85` condition topic): `migration/kafka/topics.txt` TAB row (only `traverse.cpa.*` / `traverse.ingestion.*` pass the guard `04:34`) + `scripts/kafka-reset-lab-topics.ps1` `$allowedTopics` + the Java/C# constant. Plant: `ALLOW_CREATE_PREFIXED_TOPICS=yes bash migration/04-create-kafka-topics.sh` (`--if-not-exists`); retention change on an existing topic only via `04c` (`kafka-configs --alter`); **never delete-recreate** a polled topic.

**Flink job** (last: `25a8de85` `CplmConditionStreamJob`, 13 files): job + test under `src/flink`; `infra/docker/flink-submit-cplm.sh` (lab one-shot), `infra/docker/flink-job-supervisor.sh` (lab standing list), `scripts/ensure_flink_jobs.py` (`CORE_JOBS`), `migration/04b-submit-flink-jobs.sh` (plant `submit_if_missing`, order matters — Fusion last), `migration/flink/JOBS.md`, `topics.txt` + lab reset for its sink topic; jar rebuild (`scripts/build-flink-jar.ps1`, Docker Maven on the lab) and `flink-jobmanager` in the manifest; plant deploy = `docker rm -f` JM+TM.

**Database** — §2.2; examples `ba2a029f` (`29_traverse_cplm_db.sql`), `e811af5a` (45/46/47).

**Gateway route** (last: `e811af5a`, `appsettings.json` +13): `Routes."api-<svc>"` = `{ ClusterId, Order: 0, AuthorizationPolicy: "default", Match.Path "/api/<svc>/{**rest}", Transforms [PathRemovePrefix] }` and `Clusters."<svc>"` = `{ Destinations.d1.Address "http://<svc>:5000", HealthCheck.Passive TransportFailureRate 00:01:00, Metadata RateLimit 0.5 }` (diff at `:149-160,318-330`); the route becomes visible at `/gw/upstreams` and `/gw/upstreams/<cluster>/health` (`Program.cs:164-190`) with no further wiring.

**Frontend route** (last: `e654e8e6`, `66d3e280`, `1b853e89`): `src/frontend-ob/src/App.tsx` `<Route path=… element={<React.Suspense …><Lazy/></React.Suspense>}>` (`:335-428`), the sidebar / command-palette whitelist (`66d3e280`: "the Marun slice whitelist never learned /cpm/evidence"), `api/<x>Api.ts`, `hooks/use<X>.ts`, `styles/*.css`, `*.test.tsx`; `ams-frontend` in the manifest; the SPA rides `nginx` → gateway, so no gateway change.

### 2.7 Topics / Flink / Redis / IoTDB provisioning

- **Topics.** Lab: `scripts/kafka-reset-lab-topics.ps1` (deletes messages; RF/min-ISR from env; alarm + analysis + CPA lists). Plant: `04` creates from `topics.txt`, `04c` aligns retention on existing topics; on-demand replay topics are created by cplm-api (`topics.txt:43-44`).
- **Flink.** Lab: one-shot `flink-job-submit-*` containers (`docker-compose.yml:702,1473,1507,1538`) plus `flink-job-supervisor` re-submitting every 60 s (`:1572`; `flink-job-supervisor.sh`), and `scripts/ensure_flink_jobs.py` for the three alarm jobs. Plant: only `04b` (7 CPA jobs, `JOBS.md`); the alarm submitters and the supervisor stay on profile `lab-alarm` (`docker-compose.marun.yml:105-113`).
- **Redis.** Two instances from compose `command` flags; the contract tier (`ams-redis-contract`) is the binding/snapshot store — its AOF was hand-repaired once (`docs/docker-disk-recovery-2026-09-20.md:57-62`).
- **IoTDB / MinIO.** `iotdb-init` one-shot (`docker-compose.yml:1450-1459`); `minio-init` creates the checkpoint buckets (`:487`).

### 2.8 Backup / DR

- **No scheduled backup exists in the repo.** `pg_dump` appears only as prose in `docs/INSTALL.md:445-462` (generic, `ams` only) and as a manual pre-release step in `V2.5-DEPLOY.md:103-104` (`traverse_cplm`, `traverse_auth` → `/opt/ams-recovery`). No IoTDB, Redis, MinIO or volume backup script; no restore drill recorded for the plant.
- **HA topology** (`docker-compose.ha.yml`, `docs/ha-production-guide.md`: Kafka RF 3, 2 JMs on ZK, PG streaming replica + PgBouncer, IoTDB async pipe) was built and drilled on 2026-08-12 (`0b67616f`) but is **not deployed at Marun** (no HA, one TM, Instrumental's two brokers).
- **Disk-growth controls:** plant — `MARUN-DISK.md` checkup/cleanup, `cron.d/cpa-capacity` (IoTDB log caps), Kafka minimum retention, evidence classes + partitions (CHG-033), `DELETE_ON_CANCELLATION`; remediation items 1 (own filesystem) and 4 (disk monitor + floor) still open (`docs/marun-capacity-remediation.md:80,128`). Lab — `scripts/reclaim-lab-docker-disk.ps1`, `watch-lab-disk.ps1`, `cap-lab-docker-disk.ps1`, `repair-flink-ha-checkpoints.ps1`, `gc-flink-checkpoints.ps1` (CHG-032 disk).
- **Secrets:** `migration/.env` / `infra/docker/.env` are untracked; compose fails fast on `${VAR:?}`; `deploy.sh` refuses `CHANGE_ME`; no vault/k8s secrets (helm has one `secretRef` placeholder, `infra/helm/ams/charts/api/templates/deployment.yaml:41`). Open: the admin password pasted into a transcript must be rotated (`prod_decision.md §6`).

### 2.9 Observability

`infra/docker/prometheus.yml` scrapes prometheus, `ams-api:8000`, `historian-bff:8090`, Flink JM/TM `:9249`, `iotdb:9091`, `redis-exporter:9121`, `postgres-exporter:9187`, `kafka-exporter:9308`, `gateway:8080` (`/gw/metrics`), `audit-service`, `notification-service`, `cplm-api:5000`, `ingestion-service:5000`; EMQX disabled; Alertmanager dev-null receiver; rules in `prometheus-rules.yml`; one Grafana dashboard `ams-slo-overview.json`. **At the plant the whole observability profile is off** (`lab-obs`, `docker-compose.marun.yml:93-103`; `prod_decision.md §7 item 6`). Health: each service `/health`; gateway `/gw/health`, `/gw/upstreams`, `/gw/upstreams/{cluster}/health` (`Program.cs:154-190`); cplm-api `/health` lists consumer-group membership (runbook table).

### 2.10 Helm / Windows

`infra/helm/ams` (Chart, `values.yaml` with `ghcr.io/your-org/*` placeholders, 3 root templates, 2 sub-chart templates) and `infra/windows/opc-gateway-deploy.md` (OPC A&E gateway on Windows x86) were last touched in the first commit `54896e19` — **stale, never part of a release**. Compose is the only maintained target.

## 3. Code map

| Concern | file:line | Note |
|---|---|---|
| Lab schema bootstrap | `infra/docker/docker-compose.yml:48,58` | `POSTGRES_DB=ams`; scripts mounted read-only into initdb |
| EF history / migrate | `src/backend/AMS.Api/Program.cs:102,285`; `database/scripts/03_apply_ef_migrations.sql:180-196` | only `ams`; hypertable migration pre-marked |
| Self-heal DDL | `src/services/cplm-api/BackgroundServices/CplmEventFrameService.cs:286`, `…/CplmResultConsumerService.cs:416`, `…/Services/Registry/CpmLoopRegistryService.Schema.cs:18` | runs at consumer start; needs `ams_user` ownership |
| Plant DB list / apply | `migration/lib.sh:14-20`; `migration/02-apply-schemas.sh:33-55,57-95` | sentinel skip + ownership normalisation |
| Plant ops SQL | `scripts/cpm-04…cpm-10b*.sql`; `migration/deploy/build-release.py:55-72` | shipped under `ops/` |
| Release build | `migration/deploy/build-release.py:560-625`; `prodimages.py:31,144,196` | manifest, PROD fingerprint, image names |
| Release manifests | `migration/deploy/releases/v2.6.1.txt` | latest shape incl. `!v26-retention` |
| Plant deploy | `migration/deploy/deploy.sh:61-75,113-135`; `docker-compose.marun.yml` | profiles `cpa`, `cpa-ams-api` |
| Topics | `migration/kafka/topics.txt`; `migration/04-create-kafka-topics.sh:29-51`; `04c-apply-topic-retention.sh` | guard, segment rule |
| Flink submit | `migration/04b-submit-flink-jobs.sh:43-60,76-140`; `infra/docker/flink-job-supervisor.sh`; `scripts/ensure_flink_jobs.py` | `submit_if_missing`; lab supervisor |
| Flink config | `infra/docker/docker-compose.yml:538-582`; `docker-compose.marun.yml:263-296,322-325` | HA lab / no-HA plant |
| Gateway routes | `src/services/gateway/appsettings.json:60-340`; `Program.cs:154-209` | YARP; `/gw/*` endpoints |
| Auth module sync | `scripts/sync-auth-module.ps1:15` | 10 services |
| Retention (lab) | `database/scripts/39_timescale_policies.sql` | not applied at the plant |
| Retention (plant) | `scripts/cpm-10b-result-partitions.sql`; `analytics.retention_policy` | daily partitions + rows |
| IoTDB TTL | `infra/docker/iotdb-init-ttl.sh:32-34,83-120` | password enforcement; alarm DB 365 d, loop DB 90 d |
| Cron | `migration/cron.d/cpa-capacity` | hourly log cap |
| Disk runbooks | `migration/MARUN-DISK.md`; `docs/marun-capacity-remediation.md`; `docs/docker-disk-recovery-2026-09-20.md` | plant + lab incidents |
| Observability | `infra/docker/prometheus.yml`; `grafana/provisioning/dashboards/ams-slo-overview.json` | off at the plant |
| Records | `changes_tracker.md:1785-1826,2315`; `prod_decision.md`; `checklist.md:91-112` | templates, versions on the plant |

## 4. Constraints, settled decisions and traps

- **One Postgres cluster, one logical DB per service** (`CLAUDE.md:21`); at Marun it is Instrumental's PG15 **without TimescaleDB**, so retention must be plain-SQL partitions, not hypertables (`prod_decision.md §1`; `cpm-10b` refuses hypertables).
- **No migration framework and no schema-version table** for the SQL path; idempotency is by `IF NOT EXISTS`/`ON CONFLICT`/`DO $$` and by sentinel tables; a change must be written four times (lab script, plant ops script, fresh-install schema, self-heal DDL) — CHG-033.
- **Air-gapped plant** (`OFFLINE_DEPLOYMENT_GUIDE.md`, `docs/pre-prod/cpa-offline-audit.md`): images by file only, no registry, never `docker image prune -a`, telemetry switched off (EMQX, MinIO, Grafana), no builds on the VM. `/opt/AMS-open` is an extracted tarball, not a git checkout.
- **No Kafka Connect** anywhere (grep of `infra`, `migration`, `docs`, `scripts` for `kafka-connect|connect-distributed|debezium` returned nothing); every Postgres/IoTDB write is a service consumer (`cplm-api`, `ams-api RawLoopIotDbConsumer`) or a Flink sink.
- **Kafka is a shared, foreign broker**: only `traverse.cpa.*` / `traverse.ingestion.*` may be created; RF 2 / min ISR 1; broker auto-create off at the lab, on at the plant (a deleted polled topic resurrects with defaults); compacted topics already exist as the config-distribution pattern (`context.gate-config.v1` + `acks`).
- **Flink at the plant has no HA, no savepoints**: every jar or argument change is `docker rm -f` JM+TM and a resubmit with fresh window state; `04b` reports `[OK]` for a job that is still running the old jar if the JM was not removed. Signed config bundles need `CPLM_GATE_CONFIG_KEY` on the TM.
- **Consumer groups with exactly one member** (`SingleMemberGuard`; `CLAUDE.md`), rate limiter budgets for bulk API work (login 10/min/IP), `START_AMS_API=yes` or compose silently keeps the old `ams-api`.
- **Disk is the recurring failure** (four plant fills, two lab VHDX exhaustions): every new table/topic needs a retention row and a rate estimate before go-live (`marun-capacity-remediation.md` item 2 "ship retention as part of the schema").
- **Process rules:** commit before building (bundles ship `git archive HEAD`); PowerShell tooling on the build box, Bash on the VM, images saved by Python; every change recorded in `changes_tracker.md` (updated services + scripts to run) and `prod_decision.md`; 400–500 lines per file (`CLAUDE.md:124`); `sync-auth-module.ps1` after any auth change; gateway is the single entry and JWT validator (decision #16, `MIGRATION_LOG.md:307`).

## 5. Mapping to the Truss living-asset pitch

| Pitch ops concept | What exists today | Status | Notes / gap |
|---|---|---|---|
| Liquibase-style migrations for the Truss schema | Numbered idempotent SQL, no version table, four-copy rule, sentinel skip at the plant | PARTIAL | A Liquibase/EF changelog would be the first real migration ledger in the repo; it must still ship as an `ops/` file and honour `02-apply-schemas.sh` ownership, or be replaced by the existing pattern |
| New Truss database | `NN_traverse_<svc>_db.sql` + `migration/schema/0N` + `lib.sh` + `02` (§2.2) | EXISTS | Same cluster, `ams_user` owner, no Timescale at the plant |
| Context revisions (versioned config) | `cpm.gate_config_bundle` + signed PREPARE/APPLY over compacted `context.gate-config.v1` with ACKs (`58_cpm_config_governance.sql`, CHG-028) | EXISTS (for gate config) | Reusable pattern for a runtime package; extend rather than invent |
| Compacted config topic | `context.gate-config.v1`, `context.parameter-set.v1`, `ams.metadata.updates` (compact, `topics.txt:31-35`) | EXISTS | Add via `topics.txt` + lab reset; compacted topics need keyed records (`KafkaSinks.java` rule) |
| Flink broadcast/keyed state + savepoint-based upgrades | RocksDB + MinIO checkpoints; lab ZK HA; **plant: no HA, no savepoints, `DELETE_ON_CANCELLATION`** | MISSING at the plant | Savepoint upgrades are a new capability (needs HA storage, `-s` in `04b`, disk headroom); today every upgrade is a cold resubmit |
| Runtime package on Kafka → living-object state store (Postgres) | Consumer-writes-Postgres pattern (`cplm-api` result consumers, partitions, single-member groups) | PARTIAL | A new consumer service must copy the cplm-api pattern; no Kafka Connect/JDBC sink exists |
| Issue ledger table with retention | `retention_policy` rows + `FeaturePartitionMaintenance`; Timescale lab-only | PARTIAL | New tables need a partition/retention design for plain PG15 from day one |
| Truss DB daily backups | None scheduled; manual `pg_dump` before releases only | MISSING | Would be the plant's first automated backup; disk headroom (25 GB free) must be budgeted |
| Prometheus metrics | Scrape config + one dashboard in the lab; **off at the plant** | PARTIAL | Any dashboard promise needs remediation item 4 first |
| k8s secrets | `.env` files + compose `${VAR:?}`; helm stale since first commit | MISSING | Compose + `.env` is the only supported secret path |
| Release/rollback of the new services | `build-release.py` manifest + `ops/` + `VM-STEPS.md`; image retag rollback | EXISTS | Every new service must be in `prodimages.BUILD_SERVICES` and the Marun overlay |

## 6. Open questions

1. Will Truss/runtime tables live in a new `traverse_<svc>` database (one-DB-per-service rule) or inside `traverse_cplm` / `traverse_assets`? The plant DB list is hard-coded in `lib.sh` and `02-apply-schemas.sh`.
2. Is a real migration ledger (Liquibase or EF) acceptable alongside the SQL-script path, or must the pitch adopt the four-copy rule? Who owns `EnsureSchemaAsync` parity for the new services?
3. Savepoint-based upgrades require HA storage and a `04b` change; is the plant willing to run ZooKeeper HA on the shared host, or does the plan accept cold resubmits with state rebuilt from the compacted config topic?
4. Where does the daily backup land (the 96 GB shared disk has ~25 GB free) and who restores it?
5. Which Kafka namespace do the new topics use (`traverse.cpa.*` passes the guard; a new prefix needs `04:34` and `04c` changes and Instrumental's sign-off)?
6. Does the plant keep observability off, in which case the dashboard's health claims need another proof path (`/gw/upstreams/<cluster>/health`, `/capabilities`)?
7. Loop-registry, asset-model and gate-config already hold "canonical config" — which one is Truss's source of truth, and does the compiler read them or replace them?
