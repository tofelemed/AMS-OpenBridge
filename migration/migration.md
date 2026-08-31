# Marun migration — CPA slice (phase plan)

**Audience:** operators and this team.  
**Host:** shared Marun VM next to Instrumental Pro (reuse their Postgres **process** and Kafka **cluster**).  
**Product cut:** Loop Performance + live PV/SP/OP + admin + trend.  
**Spec:** [docs/pre-prod/marun-cpa-slice.md](../docs/pre-prod/marun-cpa-slice.md).

Linux `.sh` is what the VM runs.

---

## Frozen here

| Item | Value |
|---|---|
| Kafka namespace | **`traverse.cpa.`** prepended to today’s lab topic names (shared broker with Instrumental). Canonical list: [kafka/topics.txt](kafka/topics.txt). |
| Consumer-group prefix | **`traverse-cpa-`** — [kafka/CONSUMER-GROUPS.md](kafka/CONSUMER-GROUPS.md) |
| Databases (5) | `traverse_auth`, `traverse_assets`, `traverse_cplm`, `traverse_ingestion`, `traverse_audit` |
| Do not create | `ams`, Instrumental names (`auth_service`, `instrument_*`, …) |
| Postgres / Kafka containers | Variables: `POSTGRES_CONTAINER` (Marun: `instrumental-postgres`), `KAFKA_CONTAINER` (`instrumental-kafka-1`) |
| Topics | `--if-not-exists` only. Never the lab wipe script `scripts/kafka-reset-lab-topics.ps1`. |

**Code uses prefixed topic names** (`traverse.cpa.loop.samples.v1`, `traverse.alarm.raw-alarms`, group `traverse-cpa-flink-cplm`). Compose Kafka bootstrap is `kafka-1:9092,kafka-2:9092,kafka-3:9092`.

---

## Phases (do in order)

| Phase | What | This folder | Done when |
|---|---|---|---|
| **0** | Plan + inventories | this file, `kafka/`, `schema/INVENTORY.md`, `flink/JOBS.md` | Done |
| **1** | Schema files per DB (DDL only) + HDPE/RBAC seed SQL | `schema/01`–`05`, `sql/03-hdpe-hierarchy.sql`, `sql/03-auth-rbac.sql` | Done |
| **2** | `01-create-databases.sh` | create 5 DBs + role, idempotent, never DROP | Script present. Dry-run on a copy, not live Instrumental, until ops is ready. |
| **3** | `02-apply-schemas.sh` | apply `schema/*.sql`; skip if base tables exist unless `--force` (dev only) | Script present (`CONFIRM_FORCE=yes` required for `--force` on `instrumental-postgres`) |
| **4** | `03-seed.sh` + `sql/` | HDPE hierarchy, full RBAC catalog, admin user. **Not** houston pumps. Loops = site CSV, not default | Scripts present. Admin needs `BOOTSTRAP_ADMIN_PASSWORD` + bcrypt (python3 or htpasswd) |
| **5** | Wire prefixed topics in code + compose Kafka bootstrap | app/env | **Done.** Code uses `traverse.cpa.*` / `traverse.alarm.*`. Overlay sets Marun bootstrap. |
| **6** | `04-create-kafka-topics.sh` | read **only** `kafka/topics.txt`; RF=3 minISR=2 on Marun | Script present; **refuses** until `ALLOW_CREATE_PREFIXED_TOPICS=yes` (ops confirm) |
| **7** | `04b-submit-flink-jobs.sh` + `flink/` | four CPA jobs after topics exist | Script present; **refuses** until `ALLOW_FLINK_SUBMIT=yes` (ops confirm) |
| **8** | `00-prerequisites-check.sh`, `05-validate.sh`, `run-migration.sh` | 00 no writes; 05 fails deploy on missing topic/job | Done. Default `run-migration.sh` skips 04 unless `--with-kafka` |
| **9** | `deploy/prepare-vm.sh`, `deploy.sh` (tee log), compose overlay | one-shot Marun path | `bash migration/deploy/deploy.sh` (+ `--compose` when secrets are set) |
| **10** | MQTT ingestion phase 2 (product code) | not bash | Samples flow from Data Sources → `traverse.cpa.loop.samples.v1` |

04 / 04b stay **ops-gated** even though Phase 5 has landed: creating topics or submitting jobs on the shared cluster is not automatic.

---

## How to run

```text
bash migration/deploy/prepare-vm.sh
cp migration/.env.example migration/.env    # passwords; leave ALLOW_* commented
bash migration/deploy/deploy.sh             # 00 → 01 → 02 → 03 → 05
bash migration/deploy/deploy.sh --compose   # CPA overlay after secrets are set
```

With `ALLOW_CREATE_PREFIXED_TOPICS=yes`, deploy also runs 04. With `ALLOW_FLINK_SUBMIT=yes` and `--compose`, 04b runs **after** JobManager is up.

Infra (Instrumental Postgres/Kafka) is **already up**. Never `compose up` their stack. Never `docker compose down -v` on Instrumental.

---

## Next action

**Dry-run on a copy / empty Postgres (not live Instrumental data until ops signs off):**

```text
cp migration/.env.example migration/.env
bash migration/run-migration.sh
```

Do not set `ALLOW_*` on Marun until ops confirms topic create / Flink submit on the shared broker.

Still open (ops): T1-lite (Timescale on `traverse_cplm` vs vanilla PG); HTTP hostname vs free port.

Air-gap images: [OFFLINE_DEPLOYMENT_GUIDE.md](OFFLINE_DEPLOYMENT_GUIDE.md) (build on an internet box, `docker save`, VM `--prod --no-build`). Do not build images on Marun.
