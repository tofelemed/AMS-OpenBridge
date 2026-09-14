# Marun on-prem — Linux context

Everything you need to know to work on the CPA deployment on the shared Instrumental VM.
Commands are copy-paste. Names are exact.

## 1. The host

| | |
|---|---|
| SSH | `ssh lean@192.168.190.91` |
| Hostname | `unified-analytics` |
| Clock | UTC — confirm with `date -u` (Postgres shows `+00`, Flink prints the same) |
| Air-gapped | **Nothing can be pulled or built here.** Every image arrives by file. |
| Shared with | Instrumental (their Postgres, Kafka, ZooKeeper, network). We own Instrumental too, but we do not stop or wipe it. |
| Build box | Windows, `D:\HMI_Project_Usama\AMS-open` — transfers from **Git Bash only**, `/d/...` paths |

## 2. Where things live

```
/opt/AMS-open/                          git checkout — THE source of truth for compose/scripts
  infra/docker/docker-compose.yml       base compose (~35 services, most profiled OUT here)
  migration/.env                        plant secrets + hostnames (never commit; .env.example is the shape)
  migration/deploy/docker-compose.marun.yml   the overlay: profiles, Instrumental hostnames, Flink props
  migration/deploy/deploy.sh            the ONLY way to (re)create services:  deploy.sh --prod
  migration/deploy/logs/deploy-<ts>.log every deploy run
  migration/0[0-5]*.sh, 04b-submit-flink-jobs.sh   deploy steps (deploy.sh runs them)
  migration/topics.txt                  the ONLY Kafka topic list (partitions, retention)
  migration/V2.3-DEPLOY.md, V3-DEPLOY.md, V2.4-DEPLOY.md   release runbooks
  migration/MARUN-DISK.md               disk checkup & cleanup
  src/flink/target/ams-flink-1.0-SNAPSHOT.jar   the Flink JAR; cplm-api bind-mounts it; copy new one here
  scripts/validate-loops.sh             loop validation (needs plant env, §13)
  scripts/diagnose-gate-failures.sql    which gate fails and why
/tmp/<release>/                         where a release bundle is scp'd, sha-checked, loaded from
/var/tmp/cpm-*                          validate-loops output (keep it OUT of /opt/AMS-open)
```

`git -C /opt/AMS-open status --porcelain` must be **clean** before a deploy.

## 3. Compose

```bash
cd /opt/AMS-open
export START_AMS_API=yes          # or ams-api is silently skipped (§10, trap 2)
bash migration/deploy/deploy.sh --prod 2>&1 | tail -20
```

What `deploy.sh` actually runs (do not hand-type this — env-file and project-dir matter):

```bash
docker compose --env-file migration/.env \
  -f infra/docker/docker-compose.yml -f migration/deploy/docker-compose.marun.yml \
  --project-directory infra/docker --profile cpa [--profile cpa-ams-api] ...
```

| Compose project | `ams-cpa` (prefixes every network/volume: `ams-cpa_<name>`) |
|---|---|
| Profile `cpa` | everything we run |
| Profile `cpa-ams-api` | `ams-api` only, added when `START_AMS_API=yes` |
| Profiles **not** started here | `lab-infra` (postgres, kafka, zookeeper, kafka-ui, pgadmin, cloudbeaver, mock-dcs, mosquitto-test), `lab-obs` (prometheus, grafana, alertmanager, exporters), `lab-alarm` (all `flink-job-submit*`, `flink-job-supervisor`), `later-module` (display/template/analysis/notification) |

## 4. Instrumental's infrastructure (theirs — we connect, never manage)

| | Container / name | Notes |
|---|---|---|
| Postgres | `instrumental-postgres` | user `ams_user`, one DB per service (§7) |
| Kafka | `instrumental-kafka-1` (+ `kafka-2`) | 2 brokers since 2026-09-05: RF=2, min-ISR=1. `kafka-3` is gone. |
| Bootstrap (inside network) | `kafka-1:9092,kafka-2:9092` | use `--bootstrap-server kafka-1:9092` from the container |
| ZooKeeper | Instrumental's | crashed for 17 h once when the disk filled mid-snapshot |
| Network | `instrumental-network` (external) | every one of our services is dual-homed onto it |

**Never:** `docker system prune`, `prune -a`, `volume prune`, DROP DATABASE, delete-recreate a topic a live consumer polls, `kafka-reset-lab-topics.ps1`.

## 5. Our containers on Marun

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}' | sort
```

| Container | Service | What it does |
|---|---|---|
| `traverse-gateway` | gateway | **only** way in: host `8081`. All `/api/*`, `/hubs`, `/mqtt-ws` |
| `ams-frontend` | ams-frontend | SPA on host **`8090`** (8088 is Instrumental's alarm_superset) |
| `ams-api` | ams-api | profile-gated. On Marun runs **only** `RawLoopIotDbConsumer` → IoTDB. Alarm ingestion + CPLM consumers off |
| `traverse-cplm-api` | cplm-api | CPM REST + the two CPLM Kafka consumers (§8) |
| `ams-historian-bff` | historian-bff | IoTDB reads: `/api/hist/trend`, `/raw/cursor`, `/last` |
| `traverse-ingestion-service` | traverse-ingestion-service | OT MQTT → joiner → `traverse.cpa.loop.samples.v1`. Alias `ingestion-service` on ams-backend |
| `ams-flink-jobmanager` / `ams-flink-taskmanager` | flink-* | 4 CPLM jobs (§9). Flink UI host `8082` |
| `ams-iotdb` | iotdb | loop historian, port `6667` |
| `ams-minio` | minio | Flink checkpoints, bucket `ams-flink` |
| `ams-emqx` | emqx | MQTT broker for the edge node |
| `ams-redis`, `ams-redis-contract` | redis, redis-contract | live plane. **Never** resolve the bare `redis` — that is Instrumental's, passwordless |
| `ams-sparkplug-edge-node` | sparkplug-edge-node | RBE → Redis (`SETEX … 3600`) |
| `traverse-auth-service`, `traverse-asset-model`, `traverse-binding-resolver`, `traverse-audit-service` | | |
| `ams-iotdb-init`, `ams-minio-init`, `ams-emqx-init` | one-shot | **need `curlimages/curl` and `minio/mc` images present** — unpullable here, one-way door if removed |

## 6. Networks, ports, volumes

```bash
docker network ls | grep -E 'ams-cpa|instrumental'
docker volume ls | grep ams-cpa
```

| Network | |
|---|---|
| `ams-cpa_ams-backend` | ours, bridge. Use for one-off containers that must reach `minio`, `iotdb`, etc. |
| `instrumental-network` | theirs, external |

| Host port | |
|---|---|
| 8081 | gateway (entire API surface) |
| 8090 | frontend |
| 8082 → 8081 | Flink UI / REST |
| 6667 | IoTDB |

| Volume (`ams-cpa_…`) | Holds | Disk risk |
|---|---|---|
| `minio-data` | Flink checkpoints/savepoints | **HIGH** — see MARUN-DISK §3 |
| `flink-jm-tmp`, `flink-tm-tmp` | RocksDB working state, Flink temp | **HIGH** |
| `flink-jm-log`, `flink-tm-log` | Flink log dir (off the layer) | low with error-only log4j |
| `iotdb-data`, `iotdb-logs`, `iotdb-ext` | historian | grows with retention |
| `redis-data`, `redis-contract-data`, `emqx-data`, `emqx-log`, `auth-keys` | | low |

## 7. Secrets and hostnames — `migration/.env`

```bash
grep -E '^[A-Z_]+=' /opt/AMS-open/migration/.env | cut -d= -f1      # keys only, never cat the file into a log
```

Read one without exporting it into your shell history:

```bash
IOTDB_PW=$(grep -E '^IOTDB_PASSWORD=' migration/.env | cut -d= -f2-)
PGPASSWORD=$(grep -E '^POSTGRES_PASSWORD=' migration/.env | cut -d= -f2-)
```

Keys that matter day to day: `POSTGRES_HOST=instrumental-postgres`, `AMS_DB_USER=ams_user`,
`POSTGRES_PASSWORD` (derived from `AMS_DB_PASSWORD` — raw compose without `deploy.sh` aborts on it),
`KAFKA_CONTAINER=instrumental-kafka-1`, `KAFKA_BOOTSTRAP_INTERNAL`, `IOTDB_PASSWORD`,
`MINIO_ROOT_USER/PASSWORD`, `REDIS_PASSWORD`, `TRAVERSE_SERVICE_KEY`, `INGESTION_ENCRYPTION_KEY`,
`SERVICE_LOG_LEVEL=Error`, `GATEWAY_HOST_PORT=8081`, `FRONTEND_HOST_PORT=8090`.

**Databases** (all in `instrumental-postgres`, user `ams_user`): `traverse_cplm` (gates, features,
`cpm.*` registry), `traverse_assets`, `traverse_ingestion`, `traverse_audit`, `traverse_auth`, `ams`.

```bash
PGPASSWORD=$(grep -E '^POSTGRES_PASSWORD=' migration/.env | cut -d= -f2-)
docker exec -i -e PGPASSWORD="$PGPASSWORD" instrumental-postgres psql -U ams_user -d traverse_cplm -c "select now();"
```

pgAdmin is **not** ours on Marun (profile `lab-infra`); use whichever one you already point at `instrumental-postgres`. It executes only the **selected** text.

## 8. Kafka

```bash
K="docker exec instrumental-kafka-1"
$K kafka-topics --bootstrap-server kafka-1:9092 --list | grep traverse
$K kafka-topics --bootstrap-server kafka-1:9092 --describe --topic traverse.cpa.loop.samples.v1
$K kafka-consumer-groups --bootstrap-server kafka-1:9092 --list | grep cpa
$K kafka-consumer-groups --bootstrap-server kafka-1:9092 --group <group> --describe --members
$K kafka-console-consumer --bootstrap-server kafka-1:9092 --topic traverse.cpa.loop.samples.v1 --max-messages 5 --timeout-ms 30000
```

Topics (`migration/topics.txt` is canonical):

| Topic | Parts | Retention | Written by → read by |
|---|---|---|---|
| `traverse.cpa.loop.samples.v1` | 16 | **24 h** | ingestion → Flink short/long, ams-api→IoTDB |
| `traverse.cpa.clpm.feature.short.v1` / `.long.v1` | 8 | 7 d | Flink → Flink fusion, cplm-api |
| `traverse.cpa.clpm.gate.results.v1` | 8 | 30 d | Flink fusion → cplm-api |
| `traverse.cpa.live.loop.metrics` | 8 | **3 h** | Flink RBE → edge node |
| `traverse.cpa.ams.metadata.updates`, `traverse.cpa.context.parameter-set.v1` | 3 | compact | |
| `traverse.cpa.audit-events`, `traverse.ingestion.ot-dlq` | 4 / 2 | 7 d | |

Consumer groups that **must have exactly one member** — a split persists a subset silently:

| Group | Owner | Partitions |
|---|---|---|
| `traverse-cpa-cplm-results` | cplm-api | 24 |
| `traverse-cpa-cplm-results-frames` | cplm-api (derived: `ConsumerGroupId + "-frames"`) | 8 |
| `traverse-cpa-iotdb-raw-loop` | ams-api | 16 — **growing lag = IoTDB refusing writes** (CHG-020) |

Retention only deletes **closed** segments; `04-create-kafka-topics.sh` sets `segment.ms = retention/4` (floor 1 h) so short retention actually frees disk.

## 9. Flink

```bash
docker exec ams-flink-jobmanager flink list -m localhost:8081         # 4 x RUNNING, note start times
curl -s http://127.0.0.1:8082/jobs/overview | python3 -m json.tool | grep -E '"name"|"state"|start-time'
```

| Job | Buffer / cadence |
|---|---|
| AMS - CPLM Short Feature Engine | 1 m / 60 m windows |
| AMS - CPLM Long Diagnostics Engine | rolling 24 h + 10 min per loop, **event-time timer every 15 min** → 4h/12h/24h slices, emits at ≥ 32 samples |
| AMS - Loop Live RBE Engine | deadband 0.05 + heartbeat every 300 s |
| AMS - CPLM Gate Fusion Engine | fuses short + long (12h/24h only) → gate results |

- **No ZooKeeper HA.** The marun overlay replaces `FLINK_PROPERTIES` wholesale. Removing the JobManager destroys every job — that is how a new jar lands.
- Checkpoints: `s3://ams-flink/checkpoints` in `ams-minio`, `DELETE_ON_CANCELLATION` (since v2.3).
- On (re)start jobs read from **Kafka-committed offsets** (`committedOffsets(EARLIEST)`), not from the checkpoints you deleted — they replay the downtime backlog, and the rolling buffer refills from zero. A full 12h verdict exists 12h after restart, 24h after 24h.
- Submit path is **`04b-submit-flink-jobs.sh` only** (via `deploy.sh`). It is `submit_if_missing`: with the old JobManager up it prints `[OK]` while the old jar keeps running. **Remove both containers first.**

## 10. Deploy traps — all report success while doing nothing

| Trap | Symptom | Prevention / check |
|---|---|---|
| Flink `submit_if_missing` | `[OK]` × 4, old jar still running | `docker rm -f ams-flink-taskmanager ams-flink-jobmanager` **before** `deploy.sh`; then `flink list` start times = now |
| `ams-api` profile | image loaded, old container keeps running | `export START_AMS_API=yes` before **every** `deploy.sh`; `docker inspect -f '{{.Created}}' ams-api` |
| Ingestion rename conflict | compose refuses `traverse-ingestion-service` | `docker rm -f traverse-ingestion-service` then re-run (~30 s, QoS-1 covers it) |
| Init images pruned | `curlimages/curl` / `minio/mc` missing, stack won't come up | never `rmi` them; they are unpullable here |
| Dirty repo | bundle ships `git archive HEAD`; uncommitted work does not exist on the plant | `git status --porcelain` clean before building |

## 11. Logging

- Plant floor: `SERVICE_LOG_LEVEL=Error` → `Logging__LogLevel__Default` via the compose `x-kafka` anchor, for every .NET service that merges it.
- **Consequence:** health greps on `LogInformation` lines (`connected to mqtt`, `wrote N samples`, startup counts) read **0 on a healthy service**. Prove health from Kafka lag, IoTDB `select last`, or `/stats` endpoints instead.
- `ams-api` uses Serilog configured in code and **ignored the floor** until CHG-021 (not yet deployed): it logs `INF` and 4 lines per IoTDB HTTP call. Bounded at 30 MB by json-file rotation, but only ~25 min of history.
- Docker: `json-file`, `max-size 10m`, `max-file 3` on every service. **Truncate, never `rm`, a live container's log.**
- Flink: error-only console log4j (`migration/deploy/flink-log4j-console.properties`), log dir on a volume.

```bash
docker logs --since 15m <container> 2>&1 | tail -50
docker logs --since 15m ams-api 2>&1 | grep -iE 'rejecting every write|poison'   # CHG-020 stall — should be empty
```

## 12. Gateway, auth, IoTDB, MinIO

```bash
# login → bearer (field is `token`; rate limit 10/min/IP; mutations 120/min GLOBAL; expires 1 h)
ADMIN_PW='...'
TOKEN=$(curl -s -X POST http://localhost:8081/api/auth/login -H 'Content-Type: application/json' \
  -d "{\"username\":\"admin\",\"password\":\"$ADMIN_PW\"}" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('token') or d.get('accessToken'))")
echo "len=${#TOKEN}"
H="Authorization: Bearer $TOKEN"

curl -s -H "$H" 'http://localhost:8081/api/hist/last?series=root.site1.cpm.PIC80105&measurements=pv,sp,op,mode'
curl -s -H "$H" 'http://localhost:8081/api/hist/raw/cursor?series=root.site1.cpm.PIC80105&from=2026-09-12T00:00:00Z&to=2026-09-12T01:00:00Z&maxCount=10000'   # ISO-8601, not epoch
curl -s http://localhost:8081/api/ingestion/stats | python3 -m json.tool | head -30
curl -s http://localhost:8081/api/ingestion/loop-health?state=held | python3 -m json.tool | head
```

```bash
# IoTDB (tree: root.site1.cpm.<loop>.{pv,sp,op,vp,mode}; rows keyed by (device, ts) — a repeated ts OVERWRITES)
IOTDB_PW=$(grep -E '^IOTDB_PASSWORD=' migration/.env | cut -d= -f2-)
docker exec ams-iotdb /iotdb/sbin/start-cli.sh -h 127.0.0.1 -p 6667 -u root -pw "$IOTDB_PW" \
  -e "select last pv,sp,op,mode from root.site1.cpm.PIC80105"
docker exec ams-iotdb /iotdb/sbin/start-cli.sh -h 127.0.0.1 -p 6667 -u root -pw "$IOTDB_PW" \
  -e "select count(pv) from root.site1.cpm.PIC80105 group by ([2026-09-12T07:00:00Z, 2026-09-12T16:00:00Z), 30m)"
# REST v2 rejects a result that REACHES rest_query_default_row_size_limit (10 000) — ask for 9 999
```

```bash
# MinIO
docker exec ams-minio du -sh /data/ams-flink/* 2>/dev/null
```

## 13. Diagnostic tools — plant invocation

```bash
cd /opt/AMS-open
export PG=instrumental-postgres KAFKA=instrumental-kafka-1 BROKER=kafka-1:9092
export PGPASSWORD=$(grep -E '^POSTGRES_PASSWORD=' migration/.env | cut -d= -f2-)

OUTDIR=/var/tmp/cpm-$(date -u +%Y%m%dT%H%M%SZ) bash scripts/validate-loops.sh -H 12 -o           # latest verdict
OUTDIR=/var/tmp/cpm-preboot bash scripts/validate-loops.sh -H 24 -a '2026-09-12 14:36:00+00' -o    # AS OF a time
```

`bash scripts/…`, not `./scripts/…` (execute bit is not preserved by scp). Defaults are **lab** names — the three exports above are mandatory. Read-only against the plant.

`scripts/diagnose-gate-failures.sql` — run sections in pgAdmin against `traverse_cplm`. `payload->'gates'` holds **plain strings** (`{"G0":"FAIL"}`): use `->>'G0'` on the gates object, or `#>> '{}'` on a value — never `->>'status'`.

## 14. Release flow (build box → VM), one screen

```bash
# build box, Git Bash
python migration/deploy/build-release.py --release <name>      # run UNPIPED: a | tee masks the exit code
cd /d/HMI_Project_Usama/AMS-open/release-out/<name>-<date> && sha256sum -c SHA256SUMS.txt
ssh lean@192.168.190.91 'mkdir -p /tmp/<name>' && scp -r ./* lean@192.168.190.91:/tmp/<name>/
```

```bash
# VM — then follow /tmp/<name>/VM-STEPS.md (generated per release) or migration/V2.3-DEPLOY.md
cd /tmp/<name> && sha256sum -c SHA256SUMS.txt && cd /opt/AMS-open
docker images --no-trunc --format '{{.ID}} {{.Repository}}:{{.Tag}}' > /tmp/pre-<name>-images.txt
df -h /                                                  # ≥ 8 GB free first (MARUN-DISK.md)
cd /tmp/<name> && for f in *.tar.gz; do gunzip -c "$f" | docker load; done && cd /opt/AMS-open
```

Rollback = re-tag the image id from `/tmp/pre-<name>-images.txt` and `deploy.sh --prod` again (Flink: remove both containers first). Window state is not rollback-able.

## 15. Things this VM has taught us (the short list)

- Disk has filled **three times**: RocksDB on the container layer, Flink INFO logs, orphaned MinIO checkpoints. Each has a permanent fix in place — MARUN-DISK.md §5 says how to verify they are active.
- When the disk fills, IoTDB refuses writes; before CHG-020 the historian consumer **dropped** those rows and committed offsets → unbackfillable trend holes. Now it stalls loudly and holds.
- The OT gateway publishes on change only, retained. A restart of the gateway republishes everything once — that took the fleet from 36 → 161 analysable loops. Ingestion now persists last-known values across its own restarts.
- MQTT Explorer shows session history the broker no longer holds; `ts` is DCS change time. Judge availability only with a fresh clean-session client.
- Windows side: .NET DLL strings are UTF-16 (`tr -d '\0'` before grep); Python needs `harden_stdio()`; Docker 29's containerd snapshotter leaves `GraphDriver.Data.UpperDir` empty.
