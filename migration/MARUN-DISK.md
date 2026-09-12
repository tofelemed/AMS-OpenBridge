# Marun on-prem — disk checkup & cleanup

The host has filled **three times**. Each time the same shape: something grew unbounded,
IoTDB or ZooKeeper hit the wall, and data was lost or the stack went down. This is the
checkup to run first, the cleanup by target, and how to confirm the permanent fixes are live.

Floor: **≥ 8 GB free** before any `docker load`. Below **3 GB** treat as an incident.

## 1. Checkup — 90 seconds, top to bottom

```bash
ssh lean@192.168.190.91
df -h /                                                            # the number
sudo du -xh --max-depth=1 / 2>/dev/null | sort -rh | head -12       # which top-level dir
docker system df                                                   # images / containers / volumes / cache
```

Per-volume (the usual suspects):

```bash
for v in $(docker volume ls -q | grep -E 'ams-cpa'); do
  printf '%-32s ' "$v"; sudo du -sh "$(docker volume inspect -f '{{.Mountpoint}}' "$v")" 2>/dev/null | cut -f1
done | sort -k2 -rh
```

Per-container writable layer (Docker 29 containerd snapshotter: `GraphDriver.Data.UpperDir` is
**empty**, so `du` on it silently measures `.` — use `docker diff` or exec `du` inside):

```bash
docker ps --format '{{.Names}}' | while read -r c; do
  printf '%-32s %s\n' "$c" "$(docker diff "$c" 2>/dev/null | wc -l) changed paths"
done | sort -k2 -rn | head
docker exec ams-flink-taskmanager du -sh /tmp /opt/flink/log 2>/dev/null
```

Container logs (json-file, capped 10 m × 3 per container — but check the cap is actually applied):

```bash
sudo du -sh /var/lib/docker/containers/*/*-json.log 2>/dev/null | sort -rh | head
```

MinIO, journal, /tmp:

```bash
docker exec ams-minio du -sh /data/ams-flink/* 2>/dev/null
sudo journalctl --disk-usage
du -sh /tmp/* 2>/dev/null | sort -rh | head
docker images -f dangling=true
```

## 2. What has eaten this disk, and the fix that is now in place

| Date | What grew | How much | Root cause | Permanent fix |
|---|---|---|---|---|
| 2026-09-02 | Flink TM **container layer** | 6.6 GB in one evening | RocksDB + Flink temp wrote to `/tmp` inside the layer | named volumes `flink-jm-tmp` / `flink-tm-tmp` |
| 2026-09-03 | Flink **INFO logs** on the layer | 12 GB | default log4j at INFO, log dir on the layer | error-only `flink-log4j-console.properties` + `flink-*-log` volumes; `SERVICE_LOG_LEVEL=Error` for .NET |
| 2026-09-03 | Kafka loop topics | unbounded | default 7 d retention, segments never rolled | `loop.samples` **24 h**, `live.loop.metrics` **3 h**, `segment.ms = retention/4` |
| 2026-09-03 | Instrumental Prometheus / Loki | GBs | monitoring we do not use | data deleted, containers stopped (we own Instrumental) |
| 2026-09-12 | **MinIO checkpoints** | 868 MB → **9.1 GB** in 2 days | `RETAIN_ON_CANCELLATION` + every resubmit orphaned a checkpoint tree | `DELETE_ON_CANCELLATION` (live since v2.3) |
| 2026-09-12 | Flink tmp volumes | ~5 GB | RocksDB working state across resubmits | cleared with Flink down; recreated empty |
| 2026-09-12 | Old release bundles in `/tmp` | ~1 GB each | never deleted after load | delete after every successful deploy |
| 2026-09-12 | ams-api HttpClient INFO | bounded 30 MB, but ~25 min history | Serilog ignored the plant log floor | CHG-021 (built, not yet deployed) |

**Consequence of a full disk here, twice observed:** IoTDB rejects writes → the historian consumer
(before CHG-020) *dropped* the rows and committed offsets → permanent trend holes. ZooKeeper
(Instrumental's) crashed mid-snapshot → 17 h Kafka outage. A full disk is a data-loss event, not
a capacity warning.

## 3. Cleanup by target — measure → remove → verify

Everything below is safe with the stack running **except A and B**, which need Flink down.

### A. Orphaned Flink checkpoints in MinIO (biggest, 9 GB last time)

Needs Flink down. Jobs come back with fresh window state either way — that is already the cost
of any Flink restart here (no HA, no savepoint resume).

```bash
docker exec ams-minio du -sh /data/ams-flink/* 2>/dev/null                     # measure
docker rm -f ams-flink-taskmanager ams-flink-jobmanager
docker exec ams-minio sh -c 'rm -rf /data/ams-flink/checkpoints/* /data/ams-flink/savepoints/*'
docker restart ams-minio
docker exec ams-minio du -sh /data/ams-flink 2>/dev/null                       # verify
```

MinIO stores each object as a self-contained directory and lists by walking the filesystem —
removing whole subtrees leaves nothing dangling; `.minio.sys` is untouched.

Bring Flink back with the normal deploy (both containers gone = jobs resubmitted from the current jar):

```bash
cd /opt/AMS-open && export START_AMS_API=yes && bash migration/deploy/deploy.sh --prod 2>&1 | tail -8
docker exec ams-flink-jobmanager flink list -m localhost:8081                  # 4 x RUNNING
```

### B. Flink tmp + log volumes (~5 GB last time)

Needs Flink down (A already did it). Compose recreates all four empty on the next `up`.

```bash
docker volume rm ams-cpa_flink-jm-tmp ams-cpa_flink-tm-tmp ams-cpa_flink-jm-log ams-cpa_flink-tm-log
```

"volume is in use" = a Flink container is still alive → `docker rm -f` it and retry.

### C. Old release bundles and rollback lists in /tmp

```bash
du -sh /tmp/* 2>/dev/null | sort -rh | head -20          # read it first
rm -rf /tmp/v3 /tmp/v3-* /tmp/v4 /tmp/v4-* /tmp/v5 /tmp/v5-* /tmp/v2.1* /tmp/v2.2* /tmp/v2.3*
rm -f /tmp/pre-v*-images.txt
```

Keep the **current** release's `pre-<name>-images.txt` until you are sure you will not roll back.

### D. Container logs — truncate, never delete

`rm` on a live container's json-log breaks its logging until restart. Truncate in place:

```bash
docker ps --format '{{.Names}}' | while read -r c; do
  f=$(docker inspect --format='{{.LogPath}}' "$c")
  [ -n "$f" ] && [ -f "$f" ] && sudo truncate -s 0 "$f" && echo "truncated $c"
done
```

### E. systemd journal

```bash
sudo journalctl --disk-usage
sudo journalctl --vacuum-size=200M
```

### F. Dangling images only

Air-gapped: **image removal is a one-way door.** Never `prune`, never `rmi -f`, never touch
`curlimages/curl`, `minio/mc`, `ct-superset:*`, `intigration/canvas:*`.

```bash
docker images -f dangling=true                          # read the list
docker rmi $(docker images -f dangling=true -q)         # only what that printed
```

Superseded app images (a prior `ams-cpa-*` tag you have confirmed you will never roll back to):

```bash
docker images --format '{{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.CreatedAt}}' | grep -E 'ams-cpa|ams-flink' | sort
docker rmi <repo>:<tag>          # by name, one at a time, never -f
```

### G. Kafka — verify retention is doing its job (no manual deletion)

```bash
K="docker exec instrumental-kafka-1"
$K kafka-configs --bootstrap-server kafka-1:9092 --describe --entity-type topics --entity-name traverse.cpa.loop.samples.v1
$K kafka-log-dirs --bootstrap-server kafka-1:9092 --describe --topic-list traverse.cpa.loop.samples.v1,traverse.cpa.live.loop.metrics 2>/dev/null \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print(sum(p["size"] for b in d["brokers"] for l in b["logDirs"] for p in l["partitions"])//2**20,"MB")'
```

Expect `retention.ms=86400000` and `segment.ms=21600000` on samples, `10800000` / `3600000` on
live metrics. If a size keeps climbing past ~1 day of samples, segments are not rolling — rerun
`bash migration/04-create-kafka-topics.sh` (idempotent, `--if-not-exists` + config). **Never
delete-recreate a topic a live consumer polls.**

### H. IoTDB — retention, not deletion

```bash
IOTDB_PW=$(grep -E '^IOTDB_PASSWORD=' /opt/AMS-open/migration/.env | cut -d= -f2-)
sudo du -sh "$(docker volume inspect -f '{{.Mountpoint}}' ams-cpa_iotdb-data)"
docker exec ams-iotdb /iotdb/sbin/start-cli.sh -h 127.0.0.1 -p 6667 -u root -pw "$IOTDB_PW" -e "show ttl on root.site1.cpm.**"
```

Set a TTL rather than deleting rows — it is the historian, and gaps here are permanent.

## 4. Full cleanup — order of operations

1. **Measure** (§1). Know which of A–H is the actual problem before deleting anything.
2. **C, D, E, F** — no service impact, do them first.
3. **A then B** — Flink down, MinIO tree, tmp volumes.
4. `deploy.sh --prod` with `START_AMS_API=yes` → `flink list` 4 × RUNNING.
5. `df -h /` — record the number in the deploy log / tracker.
6. Only now `docker load` anything.

## 5. Verify the permanent fixes are actually live

A fix that exists in the repo but not in the running container has fixed nothing.

```bash
# DELETE_ON_CANCELLATION reached the running JobManager (it lives in FLINK_PROPERTIES, applied at container create)
docker exec ams-flink-jobmanager sh -c 'echo "$FLINK_PROPERTIES"' | grep externalized-checkpoint-retention
#   → execution.checkpointing.externalized-checkpoint-retention: DELETE_ON_CANCELLATION

# Flink tmp and log are on volumes, not the layer
docker inspect -f '{{range .Mounts}}{{.Name}} -> {{.Destination}}{{"\n"}}{{end}}' ams-flink-taskmanager | grep -E 'tmp|log'

# Flink log4j is the error-only console file
docker exec ams-flink-jobmanager grep -E '^rootLogger.level' /opt/flink/conf/log4j-console.properties

# .NET services carry the plant floor
docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' traverse-cplm-api | grep Logging__LogLevel__Default
#   → Logging__LogLevel__Default=Error      (ams-api: only after CHG-021 is deployed)

# json-file cap on every container
docker inspect -f '{{.Name}} {{.HostConfig.LogConfig.Config}}' $(docker ps -q) | grep -v 'max-size:10m'   # expect NO output

# Topic retention (§3 G)
# MinIO tree stays small day over day
docker exec ams-minio du -sh /data/ams-flink 2>/dev/null
```

## 6. Watch it — a weekly line in the log

```bash
{ date -u; df -h / | tail -1; docker exec ams-minio du -sh /data/ams-flink 2>/dev/null; \
  sudo du -sh /var/lib/docker/volumes/ams-cpa_flink-tm-tmp 2>/dev/null; } | tee -a /var/tmp/disk-watch.log
```

Three lines, once a week. If MinIO or `flink-tm-tmp` is growing between Flink restarts, the fix
in §5 is not live.

## 7. Never

- `docker system prune`, `prune -a`, `volume prune`, `builder prune` — they will take the init
  images or a volume with real data.
- `docker rmi -f`.
- `rm` a live container's `*-json.log` (truncate).
- Delete IoTDB data files, Postgres data, or any `instrumental-*` volume.
- Delete-recreate a Kafka topic with a live consumer.
- `docker pull` or `docker build` on this host.
- Clean the MinIO tree with Flink **running** — it will write into the directory you are deleting.
