# Update & Emergency Runbook — live Marun VM

Companion to [DEPLOY-RUNBOOK.md](DEPLOY-RUNBOOK.md) (first install). This one covers a
**running plant**: shipping a new version of one or more services, and the disk-full
emergency drill. Every command here was proven during commissioning (2026-09-01/02).
**Shipping v3 right now?** Follow [V3-DEPLOY.md](V3-DEPLOY.md) — the ordered checklist for
that release; this file is the per-service reference behind it.

---

## 0. Golden rules (live-plant edition)

1. **The repo is the truth.** Any fix patched on the VM MUST also be committed on the
   build box — the next bundle overwrites VM-local edits without warning.
2. **Commit before building.** Bundles/images ship `git archive HEAD`; uncommitted work
   silently does not exist.
3. **Never build or pull on the VM** (`deploy.sh` and `pull-images.sh` refuse when they
   see `instrumental-postgres` — keep it that way).
4. **Never touch Instrumental**: their containers, volumes, databases, topics, images.
5. **Save images with bash, never PowerShell** — PS pipelines corrupt binary streams
   (`docker save | gzip` through PS produced a broken archive once already).
6. **Record a rollback point before every load** (§4).

---

## 1. Update ONE service (the common case)

### Build box
```powershell
cd D:\HMI_Project_Usama\AMS-open
git status --short                                   # MUST be empty
$env:DOCKER_DEFAULT_PLATFORM = "linux/amd64"
$env:COMPOSE_PROJECT_NAME    = "ams-cpa"
$env:START_AMS_API           = "yes"                 # so ams-api is always in scope

python migration/deploy/build-prod-images.py --only <service>
python migration/deploy/build-prod-images.py --verify-only    # the row must say PROD
```
Then save **via Git Bash** (rule 5) — image name is `ams-cpa-<service>` unless it has an
explicit tag (`ams-flink:1.0-SNAPSHOT`, `ams-sparkplug-edge-node:1.0-SNAPSHOT`):
```bash
docker save ams-cpa-<service> | gzip > /d/transfer/<service>-$(date +%Y%m%d).tar.gz
sha256sum /d/transfer/<service>-*.tar.gz
```
Transfer: `scp` direct to `lean@192.168.190.91:/tmp/`, or two-hop via the gateway PC,
or single-hop `scp -o ProxyJump=<user>@<gateway-ip> ...`.

### VM
```bash
cd /opt/AMS-open
echo "<sha256>  /tmp/<service>-YYYYMMDD.tar.gz" | sha256sum -c        # STOP on mismatch
docker images --no-trunc --format '{{.ID}} {{.Repository}}:{{.Tag}}' > /tmp/pre-update-images.txt   # rollback point
gunzip -c /tmp/<service>-YYYYMMDD.tar.gz | docker load
# if compose/env/scripts also changed: sync those files too (scp or python patch) — rule 1
bash migration/deploy/deploy.sh --prod 2>&1 | tail -8
```
Compose recreates **only** containers whose image/env changed; everything else keeps running.

### Post-update checks, per service
| Service | Check |
|---|---|
| gateway | `curl -fsS http://localhost:8081/gw/health` + one browser login |
| ams-frontend | `curl -s -o /dev/null -w '%{http_code}' http://localhost:8090/` = 200; users hard-refresh (Ctrl+F5) |
| traverse-auth-service | login returns a token; `docker logs` clean |
| traverse-ingestion-service | subscriber reconnects ≤30 s: logs show `connected to mqtt...`; `/api/ingestion/stats` tuples climbing |
| cplm-api | groups `traverse-cpa-cplm-results` (+`-frames`) each have exactly **one** member |
| ams-api | `docker logs` free of `Unauthorized`/`WRONG_LOGIN` (NOT `grep 401` — loop ids contain "401"!); `select last * from root.site1.cpm.<loop>` fresh |
| historian-bff | a `/trend` chart draws |
| asset-model | Plant Model page: hierarchy + tags panels populate |

---

## 2. Special cases

**Flink job change (new JAR)** — three artifacts move together:
1. `.\scripts\build-flink-jar.ps1` → 2. `--only flink-jobmanager` (bakes the JAR) →
3. copy `src/flink/target/ams-flink-1.0-SNAPSHOT.jar` into the transfer too (cplm-api
   bind-mounts it for recompute; `target/` is not in git).
On the VM: load image, replace `/opt/AMS-open/src/flink/target/*.jar`, then
`docker rm -f ams-flink-taskmanager ams-flink-jobmanager && bash migration/deploy/deploy.sh --prod`
— 04b re-submits all four. **Removing both containers is mandatory, not tidiness:** 04b uses
`submit_if_missing`, so with the old JobManager still up it prints `[OK]` for every job while
they keep executing the OLD jar. This overlay has no ZooKeeper HA, so `rm -f` really does clear
them — and, with no HA and no `-s <savepoint>`, they come back with **fresh window state**
(short windows rebuild within the hour; 12h/24h verdicts need up to a day). Verify: 4 × RUNNING
with start times moved, and `/tmp` still in `docker inspect ams-flink-taskmanager` mounts.

**Config-only change (env / compose / .env):** no image needed. Commit on build box,
apply the same edit on the VM (scp the file or python patch), `deploy.sh --prod` —
only affected containers recreate.

**Schema change:** update `migration/schema/*.sql` in the repo **and** apply a matching
idempotent `ALTER ... IF NOT EXISTS` live via `docker exec instrumental-postgres psql`
— script 02 skips databases whose sentinel tables exist, so the live DB never re-runs
full DDL (the missing-`template`-column lesson). Re-running 02 is still useful: its
ownership normalization heals any postgres-owned objects.

**New Kafka topic:** add to `kafka/topics.txt` (TAB-separated; only `traverse.cpa.*` /
`traverse.ingestion.*` pass the guard), then `bash migration/04-create-kafka-topics.sh`
(needs `ALLOW_CREATE_PREFIXED_TOPICS=yes`). **Never delete-recreate a topic a live
consumer polls** — auto-create resurrects it with broker defaults within seconds; fix
shape with `kafka-topics --alter --partitions` / `kafka-configs --alter` instead.

**Bulk API operations** (republish loops, imports): budget the gateway rate limiter —
login 10/min/IP (all browsers share nginx's IP!), mutations 120/min global. Pace loops
with `sleep 0.3`–`1`, log `<id> <http_code>`, and mop up non-200s from the log (endpoints
are idempotent). Tokens expire in 1 h — `echo ${#TOKEN}` before any loop.

**Full-version update (bundle v2+):** DEPLOY-RUNBOOK §1–3 with a full build; on the VM,
extract the new source tarball over `/opt/AMS-open` (`migration/.env` is not in the
archive and survives), `docker load`, `deploy.sh --prod`. Steps 00–05 are idempotent.

**Release of a named change set (v3+):** `python migration/deploy/build-release.py --release v3`
on the build box does §1 for every service in `migration/deploy/releases/v3.txt` in one go —
clean-tree and not-on-the-VM guards, the Flink JAR with the right Maven flag (CHG-008 §2),
PROD-fingerprint verify, one `.tar.gz` per image written by Python (rule 5), the JAR beside
them, the operator scripts under `ops/` (the MODE-map restore and the CPM SQL — a release
cannot finish its own checklist without them), `SHA256SUMS.txt` written relative to the release
dir, and a generated `VM-STEPS.md` carrying the plant's real Flink procedure (above), not the
lab's. `--dry-run` prints the plan; `--only <service>` narrows it. The VM half stays manual and
is in that file. Which services and why: `changes_tracker.md` → "Release v3".

---

## 3. Rollback

Derived image tags are unversioned, so a `docker load` overwrites the tag and the old
image becomes untagged (it stays on disk until pruned). To roll back:
```bash
grep <service> /tmp/pre-update-images.txt              # the OLD image id
docker tag <old-image-id> ams-cpa-<service>            # retag it back
bash migration/deploy/deploy.sh --prod                 # recreates on the old image
```
Keep `/tmp/pre-update-images.txt` and the previous transfer archive until the new
version has soaked for a day.

---

## 4. 🚨 DISK FULL — emergency drill

**How it presents (2026-09-02 incident):** logins fail with 429 "rate limit exceeded"
(full disk → Redis bgsave fails → `MISCONF` write-block → gateway limiter INCR throws →
login class fails CLOSED). IoTDB writes 401→drop. **Instrumental's Kafka/Postgres share
this filesystem — at 0 bytes their production is minutes from failing. Act immediately.**

### Step 1 — confirm and triage
```bash
df -h /
docker exec ams-redis redis-cli -a "$(grep '^REDIS_PASSWORD=' /opt/AMS-open/migration/.env | cut -d= -f2)" --no-auth-warning set rl:probe 1
```
`MISCONF` reply = the login outage is disk, not auth.

### Step 2 — instant reclaims, in order (all proven safe)
```bash
# a. leftover per-service transfer archives. KEEP /tmp/offline-bundle/ams-cpa-images.tar.gz —
# on an air-gapped host it is the ONLY recovery path for a wrongly-removed image (2026-09-05).
ls -lh /tmp/*.tar.gz /tmp/offline-bundle/ 2>/dev/null      # review, then rm only loaded single-service ones

# b. journald
sudo journalctl --vacuum-size=100M

# c. oversized container logs — TRUNCATE, never rm (live fd; rm frees nothing + breaks docker logs)
sudo find /var/lib/docker/containers -name '*-json.log' -size +50M -exec truncate -s 0 {} \;

# d. dangling image layers. NOT the free lunch it is on a connected host: anything removed
# here cannot be re-pulled (see the air-gap caveat in step 4). Read the list it prints.
docker image prune -f
```

### Step 3 — find the eater (read-only battery)
```bash
sudo sh -c 'du -sh /var/lib/docker/volumes/*/_data 2>/dev/null' | sort -rh | head -15
sudo sh -c 'du -sh /var/lib/docker/containers/*/ 2>/dev/null' | sort -rh | head -8   # map hashes: docker ps -a --no-trunc
docker ps -a --size --format 'table {{.Names}}\t{{.Size}}' | sort -k2 -rh | head -8  # writable layers
sudo du -xh --max-depth=2 /var/lib/containerd 2>/dev/null | sort -rh | head -4
```
Known hot spots from history: a Flink TM writable layer (2026-09-02: 6.6GB RocksDB
in `/tmp` → fixed with a volume; 2026-09-03: **12.1GB again with the volume intact** —
something else in the layer grows; `docker exec ams-flink-taskmanager sh -c "du -xh
--max-depth=2 /opt/flink /tmp | sort -rh | head"` BEFORE rm'ing it, then `docker rm -f`
both Flink containers + `deploy.sh --prod` recovers ~13GB, state resumes from MinIO);
**our own Kafka topics on the shared brokers** (`traverse.cpa.loop.samples.v1` grows
~4GB/day cluster-wide at 161 loops/5s — retention is 24h + 6h segments since
2026-09-03, verify with `kafka-configs --describe`); uncapped json-logs on other
stacks' containers; forgotten install tarballs under `/home/lean`.
A full disk CRASHES the shared Kafka brokers (they restart themselves once space
frees — verify with `kafka-topics --list`, not just `docker ps`). Never "fix" Kafka
disk use by touching broker data volumes — retention config is the only lever.

### Step 4 — targeted removals (name things explicitly; get the owner's nod for theirs)
Unused tagged images by **ID-verified** list only:
```bash
docker ps -aq | xargs docker inspect -f '{{.Image}}' | sort -u > /tmp/used-ids.txt
docker images --no-trunc --format '{{.ID}}\t{{.Repository}}:{{.Tag}}\t{{.Size}}' | sort > /tmp/all-ids.txt
awk -F'\t' 'NR==FNR{u[$1];next} !($1 in u){print $2"  "$3}' /tmp/used-ids.txt /tmp/all-ids.txt
```
Keep always: build bases (`node:*-alpine`, `python:*-slim`), anything <1 week old,
anything whose owner is unknown. `docker rmi` without `-f` refuses in-use images — the seatbelt.

**Air-gap caveat (learned 2026-09-05): image removal here is a ONE-WAY DOOR.** On a
connected host a wrongly-pruned image just re-pulls; on this VM it cannot, and the next
`deploy.sh --prod` dies mid-compose trying to reach registry-1.docker.io. The small
one-shot init images are the easy casualties — they are unreferenced whenever their
container has been recreated, so they look disposable: `curlimages/curl:8.9.1`
(emqx-init) and `minio/mc:RELEASE.*` (minio-init, a `service_completed_successfully`
dependency of flink-jobmanager, so losing it blocks Flink too). Before ANY `docker rmi`
or `image prune` on this host, check the name against the bundle manifest; recovery means
`gunzip -c /tmp/offline-bundle/ams-cpa-images.tar.gz | docker load` (keep that bundle!) or
a fresh transfer from the build box.

### Step 5 — NEVER, even at 0 bytes
- `docker system prune` (kills other teams' stopped containers) / `prune -a` / `volume prune`
- anything Instrumental: their volumes, Prometheus data, databases, topics
- `rm` on a live container's json-log (truncate instead)
- deleting inside a running Prometheus/IoTDB/Kafka data dir

### Step 6 — verify recovery (self-healing, no restarts needed)
```bash
docker exec ams-redis redis-cli -a "$REDIS_PW" --no-auth-warning set rl:probe 1   # OK
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8081/api/auth/login -H 'Content-Type: application/json' -d "{\"username\":\"admin\",\"password\":\"$ADMIN_PW\"}"   # 200
docker ps -a --format '{{.Names}} {{.Status}}' | grep -vE ' Up ' | grep -vE 'Exited \(0\)'   # no NEW casualties
docker exec instrumental-postgres pg_isready
# ingestion resumed:
docker exec ams-iotdb /iotdb/sbin/start-cli.sh -h 127.0.0.1 -p 6667 -u root -pw "$IOTDB_PW" -e "select last * from root.site1.cpm.FIC30203;"   # fresh timestamps
```

### Step 7 — post-incident (same day)
Name the eater from step 3 and **cap it** (log `max-size`, retention, a volume mount);
report to ops with the `du` numbers; re-raise the LVM extension — 87 GB is empirically
too small for both stacks plus ingestion. Target steady state: **≥15 GB free**; weekly
`df -h /` glance until the LVM lands.

---

## 5. Trap index (one line each, learned the hard way)

- PowerShell corrupts binary pipes — `docker save` via bash only.
- Loop IDs contain "401" (`FIC10401`…) — grep `unauthorized|wrong_login`, never `401`.
- Deleting a topic a consumer polls = instant auto-recreate with broker defaults — `--alter` instead.
- `psql -c` does NOT interpolate `:'var'` — feed SQL via stdin.
- Bash tab-IFS collapses empty TSV fields — parse with a non-whitespace IFS.
- IoTDB passwords: 4–32 chars (`openssl rand -hex 12`).
- Gateway login limit: 10/min shared across everyone behind nginx; mutations 120/min.
- Tokens expire in 1 h; check `${#TOKEN}` before bulk loops.
- Fresh IoTDB is root/root until init rotates it — init now enforces, but verify on new sites.
- `docker restart` keeps a bloated writable layer — only recreate drops it.
- VM edits die at the next update unless committed to the repo the same day.
