# Chat context — Marun CPA / Instrumental shared VM

**Date span:** 2026-08-28 → 2026-08-30  
**Repo:** AMS-open (this app). **Host:** same Linux VM as already-deployed Instrumental Pro (iAMS).  
**This file** is a handoff of one long chat. Specs still win if they disagree: [marun-cpa-slice.md](marun-cpa-slice.md), [migration/migration.md](../../migration/migration.md).

---

## Goal

First product on Marun is **CPA / Loop Performance** (UI `/cpm/*`, API `cplm-api` `/api/v1/cpm/*`), plus live PV/SP/OP, admin subset, historian trend. **Not** full CAMS, **not** HMI Designer.

Reuse Instrumental’s **Postgres process** and **Kafka cluster** (3 brokers). Do **not** stand up a second Postgres/Kafka. Do **not** take host `:80` / `:3000`.

---

## Frozen product decisions

| ID | Frozen as |
|---|---|
| **D-SLICE** | CPA + admin subset + `/trend`. Alarms, Designer, mock-dcs, alarm Flink jobs **off**. |
| **D-LIVE** | Live PV/SP/OP **in**: own `ams-emqx`, `ams-sparkplug-edge-node`, `ams-redis` + `ams-redis-contract`, Flink `LoopLiveRbeJob`, topic `traverse.cpa.live.loop.metrics`. Do **not** share Instrumental Redis (theirs has **no password**, hostname `redis`). |
| **D-AUTH** | Own platform identity: `traverse_auth`, RS256, `traverse-gateway`. Seed **full** RBAC catalog. **No** Instrumental `JWT_SECRET` / `auth_service` DB / SSO. |
| **D-INGEST** | Plant path = MQTT → **our** `ingestion-service` → Kafka. Phase 2 **subscriber is not built**. Replay/CSV is lab-only. Their `ingestion-service` (`MQTT_CLIENT_ID=ingestion-service`) is a different product — do not reuse that client id or Docker DNS name. |

**Still open (ops):** T1-lite (Timescale on `traverse_cplm` vs vanilla PG — their image is `postgres:15-alpine`, no Timescale); HTTP (vhost on `instrumental-nginx` vs free port **8088**).

**Five DBs this cut:** `traverse_auth`, `traverse_assets`, `traverse_cplm`, `traverse_ingestion`, `traverse_audit`.  
**Not this cut:** `ams`, `traverse_displays`, `traverse_templates`, `traverse_analysis`.  
**Never:** Instrumental DB names (`auth_service`, `instrument_*`, `instrumental`).

**Kafka:** prefix **`traverse.cpa.`** (dotted). Alarms **`traverse.alarm.`** + old name (not created by script 04 this cut). Groups `traverse-cpa-` / `traverse-alarm-`. Edge group `traverse-sparkplug-edge`.

**Never on Marun:** `scripts/kafka-reset-lab-topics.ps1` (it **deletes** topics). `docker compose down -v` on Instrumental. `DROP DATABASE`.

---

## Instrumental stack (as shared 2026-08-30)

From their `docker-compose.instrument-only.yml` + `docker-compose.prod.yml` (already running):

| Resource | Facts |
|---|---|
| Network | named **`instrumental-network`** |
| Postgres | `instrumental-postgres`, hostname **`postgres`**, host **5432**, DB `instrumental` + many others |
| Redis | `instrumental-redis`, hostname **`redis`**, host **6379**, **no requirepass** |
| Kafka | `instrumental-kafka-1/2/3`, hostnames `kafka-1/2/3`, INTERNAL `:9092`, RF=3, minISR=2, **`AUTO_CREATE_TOPICS_ENABLE=true`** |
| ZK | `instrumental-zookeeper`, `zookeeper:2181` |
| Nginx | `instrumental-nginx` **:80 / :443** |
| Frontend | `instrumental-frontend` **:3000** |
| API GW | `api-gateway` **:3001** |
| Their auth | container **`auth-service`**, hostname **`auth-service`**, **:3002**, DB `auth_service`, `JWT_SECRET` |
| Their ingest | container **`ingestion-service`**, **:3008** |
| Their notify | container **`notification-service`**, **:3009** |
| Kafka UI | **:8080** |
| Prometheus / Grafana / pgAdmin | **:9090** / **:4000** / **:5050** |

Prod overlay switches their Node apps to `Dockerfile` + `node dist/server.js`. Irrelevant to us except: **do not collide with those container/DNS names**.

---

## What this chat built

### Docs
- `docs/pre-prod/marun-instrumental-preprod-analysis.md`
- `docs/pre-prod/marun-cpa-slice.md`
- `migration/migration.md`, `migration/OFFLINE_DEPLOYMENT_GUIDE.md`
- `migration/kafka/topics.txt`, `CONSUMER-GROUPS.md`, `schema/INVENTORY.md`, `flink/JOBS.md`

### `migration/` Phase 0–9 (Linux `.sh` for the VM)
- Schema DDL (no `CREATE DATABASE` / `\c`): `schema/01`–`05`
- Seed: `sql/03-hdpe-hierarchy.sql` (site `hdpe`, 8 areas, 25 units, `instrumental-pro` aliases; no devices/loops; no houston/dallas); `sql/03-auth-rbac.sql` (full catalog; admin hashed in `03-seed.sh`)
- `00` read-only prereq → `01` create 5 DBs + `ams_user` (never DROP) → `02` schemas (`--force` on live PG needs `CONFIRM_FORCE=yes`) → `03` seed → `04` topics (refuses unless `ALLOW_CREATE_PREFIXED_TOPICS=yes`) → `04b` four Flink jobs (refuses unless `ALLOW_FLINK_SUBMIT=yes`; JobManager must be up) → `05` validate
- `run-migration.sh`: default 00–03–05; `--with-kafka` / `--with-flink`
- `deploy/prepare-vm.sh`, `deploy.sh` (tee `deploy/logs/`), `pull-images.sh`
- `deploy.sh --prod` = compose + **`--no-build`**. `--compose` may still build (internet box only).
- Overlay: `migration/deploy/docker-compose.marun.yml` (`name: ams-cpa`, `--profile cpa`)

**04 / 04b stay ops-gated** even though code already uses prefixed names.

### Phase 5 — topic names in code
Mechanical rename in `src/`, `infra/`, `scripts/`, `tests/`, `ams-sims/`. Examples:
- `traverse.cpa.loop.samples.v1`, `traverse.cpa.clpm.gate.results.v1`, `traverse.cpa.live.loop.metrics`
- `traverse.alarm.raw-alarms` (not `traverse.alarm.alarm.*`)
- Groups: `traverse-cpa-flink-cplm`, `traverse-cpa-cplm-results`, `traverse-sparkplug-edge`

CPLM consumers must have **one member process** (`traverse-cpa-cplm-results`, frames group = that + `-frames`). Live in `cplm-api` only.

### Offline / air-gap (scripts written; **images not built** in this chat)
- `migration/deploy/prodimages.py` — `COMPOSE_PROJECT_NAME=ams-cpa`, prod fingerprint
- `build-prod-images.py` — internet box, one service at a time
- `save-offline-bundle.py` — one `docker save` → `ams-cpa-images.tar.gz` + source + `env.copyme` + Flink JAR + LF `SHA256SUMS.txt`
- Does **not** save Instrumental postgres/kafka
- VM: `sha256sum -c` → `docker load` → `deploy.sh --prod --no-build`
- Frontend fonts already self-hosted (`src/frontend-ob/src/styles/fonts.css`). Grafana (off this cut) has air-gap env in lab compose.
- `cplm-api` bind-mounts `src/flink/target/*.jar` (not in git) — bundle copies the JAR; `prepare-vm.sh <bundle>` restores it.

### UI CPA slice
`src/frontend-ob/src/productSlice.ts` — `CPA_SLICE_ONLY = true`, `HOME_PATH = '/cpm'`.
- Login → `/cpm` (`postLoginPath`)
- Nav: Loop Performance + `/trend` + Administration + pipeline/governance
- Hidden: dashboard, alarms, live events, SOE, alarm history, analytics, HMI displays/designer, edge, iotdb-trend
- Admin tabs hidden: Alarm Feed / Rules / Notifications
- Top bar: no critical/unacked, no Live Events rail
- Alarm SignalR not started in slice mode
- Flip `CPA_SLICE_ONLY` to `false` when CAMS/HMI return

First `tsc` failed (dropped `useAuthStore` import in Administration); **fixed**; second `tsc --noEmit` passed.

---

## Overlay status vs what Instrumental compose requires

**Already in `docker-compose.marun.yml`:** lab postgres/kafka/zk/ui/mock-dcs off; Kafka `kafka-1,2,3`; PG `Host=instrumental-postgres`; frontend **8088**; gateway **8081**; EMQX no host 1883; own Redis/IoTDB/Flink/MinIO/EMQX; Flink HA **not** using lab ZK; alarm Flink submitters `lab-alarm`.

**Not done — do before plant compose-up** (analysis in this chat, **code not applied**):

Dual-homed containers (`ams-backend` + `instrumental-network`) that still resolve `auth-service` or `redis` can hit **their** auth (HS256 `JWT_SECRET`) or **their** open Redis.

| Today | Must become |
|---|---|
| `http://auth-service:3002` (gateway, EMQX JWKS, JWKS clients) | `http://traverse-auth-service:3002` |
| `Redis__Host=redis` / `redis-contract` | `ams-redis` / `ams-redis-contract` |
| `DB_HOST=postgres` if leftover | `instrumental-postgres` |
| hostname/alias `auth-service` on shared net | `hostname: traverse-auth-service`; alias `auth-service` **only** on `ams-backend` |

Do not publish 80, 443, 3000, 3001, 3002, 3008, 3009, 5432, 6379, 8080, 9090, 1883. Check VM for free **6667** (IoTDB) and **8082** (Flink UI).

Optional: Flink HA → their ZK with chroot `/flink-ams-cpa`.

---

## How to run (do not run 01 against live Instrumental until ops signs off)

```text
# VM / copy
bash migration/deploy/prepare-vm.sh
cp migration/.env.example migration/.env   # fill CHANGE_ME; leave ALLOW_* commented
bash migration/deploy/deploy.sh            # 00→01→02→03→05

# After overlay DNS fixes + secrets + images loaded
bash migration/deploy/deploy.sh --prod --no-build

# Internet box (later)
python migration/deploy/build-prod-images.py
python migration/deploy/build-prod-images.py --verify-only
python migration/deploy/save-offline-bundle.py
```

`ALLOW_CREATE_PREFIXED_TOPICS=yes` / `ALLOW_FLINK_SUBMIT=yes` = ops confirm on the **shared** broker. 04b runs **after** JobManager is up when using `--compose` / `--prod`.

---

## Next work (priority)

1. **Overlay DNS/hostname fix** (above) — blocking for shared-network compose.  
2. Dry-run `01–03` on a **copy** of Postgres, not live Instrumental.  
3. Ops: T1-lite, HTTP (8088 vs nginx vhost), then `ALLOW_*`.  
4. Internet box: build + verify + `save-offline-bundle.py`.  
5. Phase 10: MQTT subscriber in **our** ingestion-service → `traverse.cpa.loop.samples.v1`.  
6. `ams-api` / `ams` DB only if RawLoop→IoTDB is required (`START_AMS_API=yes` — this cut does not create `ams`).

---

## File index

| Path | Role |
|---|---|
| `docs/pre-prod/marun-cpa-slice.md` | Product cut |
| `docs/pre-prod/marun-instrumental-preprod-analysis.md` | Shared-VM analysis |
| `migration/` | VM scripts + schema + topics |
| `migration/deploy/docker-compose.marun.yml` | Marun overlay |
| `migration/OFFLINE_DEPLOYMENT_GUIDE.md` | Air-gap |
| `src/frontend-ob/src/productSlice.ts` | UI slice flag |
| `infra/docker/docker-compose.yml` | Lab full stack (do not `up` alone on Marun) |

**Chat id (Cursor):** [Marun CPA migration](00930c09-65fd-4afa-901a-5c95f005802f)
