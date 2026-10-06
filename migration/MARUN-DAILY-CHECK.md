# Marun daily check (v2.6.1)

One run every morning, about three minutes, no change to anything:

```
bash /opt/AMS-open/migration/daily-check.sh
```

Every line starts with `OK`, `WARN` or `ACT`. `OK` needs nothing. `WARN` means look again tomorrow, or
earlier if two warnings appear together. `ACT` means do the step in the matching section below today.
The script only reads; every fix below is a command you run yourself. Keep the morning output in a
text file per day (`bash … daily-check.sh | tee /home/lean/daily/$(date +%F).txt`); a trend over a
week says more than one number.

The sections follow the script's numbers.

## 1. Disk

| Free | Meaning |
|---|---|
| 15 GB or more | normal (the 96 GB disk is shared with Instrumental; their Kafka, Postgres and ZooKeeper sit on it too) |
| 10 to 15 GB | watch: run the check again in the afternoon; find what grows with the three sizes on the second line (database, Kafka, checkpoints) |
| under 10 GB | act today, in this order |

Act, in order (each returns space at once):
```
docker image prune -f | tail -1                                   # dangling images only; never prune -a (unpullable images here)
sudo sh -c 'for f in /var/lib/docker/containers/*/*-json.log; do s=$(stat -c%s "$f"); [ "$s" -gt 209715200 ] && truncate -s 0 "$f" && echo "truncated $s $f"; done'
# orphaned Flink checkpoints (left behind by a killed JobManager; running jobs are excluded):
docker exec ams-flink-jobmanager flink list -m localhost:8081 2>/dev/null | grep -oE '[0-9a-f]{32}' | sort > /tmp/running.txt
for id in $(docker exec ams-minio sh -c 'ls /data/ams-flink/checkpoints/' | sort | comm -23 - /tmp/running.txt); do docker exec ams-minio rm -rf /data/ams-flink/checkpoints/$id; done
df -h / | tail -1
```
The `checkpoints N MB` line (v2.6.6, CHG-039): about 1 GB is normal for seven jobs (the Short job now keeps its
state on the heap and its checkpoints are full snapshots, ~120 MB each, three kept). `WARN` above 1.5 GB,
`ACT` above 3 GB. A jump of gigabytes is either a checkpoint tree left behind by a cancelled or killed job
(the sweep above removes it; on 5 October the Short job's own tree was 4.1 GB, because until v2.6.6 that job
kept its checkpoints on cancel) or a job that is far behind (section 4).

A single container json-log can also be GBs when a container has no log cap (2026-10-06: one uncapped
log was 2.6 GB; ours are capped 10 m x 3). The truncate loop above is the fix; afterwards find the owner
with `docker ps -a --no-trunc | grep <container id>` and cap it if it is ours.

If the database is what grows, section 7 (evidence) or section 8 (partitions) says which table; the
emergency levers are there. `migration/MARUN-DISK.md` has the full survey.

## 2. Containers

All eight must be `running`, and the ones with a health check `healthy`. The `RestartCount` line
(CHG-060) prints Docker's restart count for `ams-flink-taskmanager` and `ams-flink-jobmanager` and WARNs
above 0: each restart is one exit (since CHG-060 an OutOfMemoryError exits the JVM). The count resets to 0
when a deploy recreates the container, so it reads 0 right after a deploy; that is expected. A count that
grows day over day is a crash loop: section 4. A missing or restarting container:
```
docker logs --since 10m <name> 2>&1 | tail -20
cd /opt/AMS-open && export START_AMS_API=yes ALLOW_FLINK_SUBMIT=yes && bash migration/deploy/deploy.sh --prod 2>&1 | tail -5
```

## 3. OT feed and ingestion

`samples +N/min`: the OT gateway publishes about 1,700 samples a minute for 144 loops. Zero means
either the gateway or Instrumental's broker (`piarchiver-broker`, their container) or our ingestion
service. Tell them apart:
```
docker ps --format '{{.Names}} {{.Status}}' | grep -E 'piarchiver-broker|traverse-ingestion'
docker exec piarchiver-broker sh -c 'timeout 15 mosquitto_sub -h 127.0.0.1 -p 1883 -u traverse-ingestion -P "<the .env password>" -t "OT/HDPE/#" -C 1 -W 10 -v | head -1'
docker logs --since 10m traverse-ingestion-service 2>&1 | tail -5
```
A broker line prints a topic: the gateway publishes, so ingestion is the problem (restart it with the
`deploy.sh` line above). `not authorised`: our broker user vanished again (`MARUN-CONTEXT.md` section
13: the user lives in Instrumental's `.env` `MQTT_EXTRA_USERS`; recreate their container, never
restart it). Nothing within 10 s: the gateway is silent; that is the OT side.

## 4. Flink jobs

Seven jobs `RUNNING` and six slots free (the Short job uses four). Each running job's checkpoints:
`ok` must climb day over day and `failed` stay near 0. A job whose `failed` is close to or above `ok`
is in the checkpoint restart loop (seen 3 October: a backlog after an ingestion stop made every
checkpoint expire, the job restored and rewound every 10 minutes and never caught up). Fix, for the
Short job (the group name differs per job: `-short`, `-long`, `-fusion-long-in`):
```
ID=$(docker exec ams-flink-jobmanager flink list -m localhost:8081 2>/dev/null | grep 'Short Feature' | awk '{print $4}')
docker exec ams-flink-jobmanager flink cancel -m localhost:8081 $ID 2>/dev/null; sleep 20
docker exec instrumental-kafka-1 kafka-consumer-groups --bootstrap-server kafka-1:9092 --group traverse-cpa-flink-cplm-short --topic traverse.cpa.loop.samples.v1 --reset-offsets --to-latest --execute 2>&1 | tail -2
ALLOW_FLINK_SUBMIT=yes bash /opt/AMS-open/migration/04b-submit-flink-jobs.sh 2>&1 | grep -E 'Short'
```
`04b` submits a fresh Short job; never restore (`-s`) a pre-CHG-061 Short checkpoint (the heap backend restores its old,
unregistered state names and keeps re-snapshotting them).
The `Short job consumer lag` line is the same loop seen from Kafka: under 50,000 samples is normal (a few minutes of
feed); hundreds of thousands and growing is the backlog, same fix. Section 5's short-features line now says how many
minutes behind real time the newest window is; more than 120 is the same condition and prints `ACT`.

Since CHG-060 (pending deploy) both Flink JVMs exit on an OutOfMemoryError and Docker restarts them (`unless-stopped`). After a TaskManager OOM the jobs resume from their last checkpoint by themselves; check `docker ps` section 2 for a young uptime on `ams-flink-taskmanager`. After a JobManager OOM there is no HA at the plant, so the jobs are gone: this section shows fewer than seven, and the remedy below (`04b`) applies, AND the orphan-checkpoint sweep from section 1 (the cancelled-job cleanup never ran).
Crash loop: if the TaskManager uptime keeps resetting, or `docker inspect -f '{{.RestartCount}}' ams-flink-taskmanager` grows (section 2), the restored state itself runs the heap out: cancel Short, reset `traverse-cpa-flink-cplm-short` to latest and resubmit (the recipe above).
`-XX:+ExitOnOutOfMemoryError` covers heap and metaspace OOM, not "Direct buffer memory": a TaskManager logging that error stays up and half dead; restart it by hand (`docker restart ams-flink-taskmanager`).

`Short buffer cap` (CHG-061, pending deploy): `SHORT_BUFFER_CAPPED loop=... samples=... watermarkLagMs=... cap=... declaredGridS=...` in the TaskManager log means one loop's Short buffer reached its hard cap (default max(ceil(1.4 x 3960 / grid), 1100) = 1,109 samples at 5 s, about 92 min; the oldest whole minutes are evicted), so the job protects its heap instead of running out of it. WARN when it appears in the last 24 h:
```
docker logs --since 24h ams-flink-taskmanager 2>&1 | grep -c SHORT_BUFFER_CAPPED
docker logs --since 24h ams-flink-taskmanager 2>&1 | grep SHORT_BUFFER_CAPPED | tail -3
```
A large `watermarkLagMs` on many loops, or a growing `Short job consumer lag`, is a backlog: use the recipe above. One loop only, with `declaredGridS` far from its real publishing interval, is a mis-declared grid: fix `grid_seconds` for that loop in the loop registry (the derived cap follows the declared grid). The line logs at most once per loop per hour. `SHORT_DUPLICATE_DROPPED loop=... ts=...` (same rate limit; counter `shortDuplicatesDropped`) means the loop is fed twice: look for a second overlapping data source (`MARUN-CONTEXT.md` 12b). Both lines reach the plant log through the WARN override for `ShortFeatureBufferFn` in `infra/docker/flink-log4j-console.properties` (root stays ERROR).

Fewer than seven jobs: `ALLOW_FLINK_SUBMIT=yes bash migration/04b-submit-flink-jobs.sh` submits the
missing ones. Never `docker rm -f` the JobManager without cancelling every job first (orphaned
checkpoints, section 1).

## 5. Calculations

- Short features: rows must arrive every minute with a window end a few minutes old. `0 rows` with a
  live feed (section 3) is the Short job stalled: section 4.
- Long features and fused verdicts: one row per loop and window kind every 15 minutes once the job
  has an hour of data after any restart.
- 1m completeness at or above 0.95: the samples arrive at the declared grid. Below it, the gateway is
  dropping samples or the grid declaration is wrong (`docs/pre-prod/v2.5-ot-instrumental-requests.md`).

## 6. Consumers

The three cplm-api groups must have exactly one member each and a lag that stays small (hundreds, not
hundreds of thousands). Two members means another process consumes the same group and silently takes
half the data (the rule in `CLAUDE.md`); find it with
`kafka-consumer-groups --describe --group <group> --members` and stop it. A lag that only grows:
`docker logs --since 1h traverse-cplm-api` and restart the container.

## 7. Evidence

Three classes, each with its bound:

| Class | Bound | Why |
|---|---|---|
| `TRANSIENT` | at most about 2 GB of payload, oldest at most 6 hours | every live artifact of the long tier and fusion, swept every 15 minutes |
| `EPISODE` | levels off near 2 GB; oldest at most about 2 days after an episode closed | what an episode's open / escalate / close captured; `retention_policy` row `EPISODE` = 2 days |
| `STANDARD` | 3 days | rebuilt on request from the workbench |

The plant logs at level Error, so the sweeper never prints; these numbers are its proof. `episodes
24 h`: a healthy fleet opens tens of episodes a day; hundreds mean verdicts flipping fault family
window to window (seen 2 October: 580 a day), which is what inflates `EPISODE`; that is an engine item
(CHG-034), not something to fix at the plant.

Physical size line (CHG-049): `evidence tables N MB on disk` is `pg_total_relation_size` of the chunk and
manifest tables, the files and not the payload sum, because DELETE never shrinks them (2026-10-06: 1.9 GB
of payload "within budget" while 3.7 GB sat on disk). `WARN` above 1536 MB, `ACT` above 3072 MB. What to do:
1. Once the CHG-049 release is deployed, `ops/cpm-12b` (cplm-api stopped, after at least 1 hour of the new
   build running) rewrites both tables and returns the space; this is the normal reclaim.
2. Emergency, disk under 10 GB: the TRUNCATE lever below (check `pinned` = 0 first).
3. Never switch evidence off as the first move: truncate first (the first lever below); emission stays on.

Emergency lever 1, truncate only (emission stays on; this is what the plant did on 2026-10-06), when an evidence class
breaks its bound or the evidence tables are above 3072 MB and the disk is under 10 GB:
```
docker exec instrumental-postgres psql -U postgres -d traverse_cplm -c "select count(*) from analytics.evidence_manifest where pinned"   # must be 0 before the next line
docker exec instrumental-postgres psql -U postgres -d traverse_cplm -c "TRUNCATE analytics.evidence_chunk, analytics.evidence_manifest"
df -h / | tail -1
```

Emergency lever 2, last resort: only when the tables break their bound again within hours of a truncate, or the disk is
under 3 GB with the truncate already done. It switches emission off and then truncates:
```
cd /opt/AMS-open && sed -i 's/^CPLM_EVIDENCE_EMIT=.*/CPLM_EVIDENCE_EMIT=none/' migration/.env
for id in $(docker exec ams-flink-jobmanager flink list -m localhost:8081 2>/dev/null | grep -E 'Long Diagnostics|Gate Fusion' | awk '{print $4}'); do docker exec ams-flink-jobmanager flink cancel -m localhost:8081 $id 2>/dev/null; done
ALLOW_FLINK_SUBMIT=yes bash migration/04b-submit-flink-jobs.sh 2>&1 | grep -c '\[OK\]'
docker exec instrumental-postgres psql -U postgres -d traverse_cplm -c "select count(*) from analytics.evidence_manifest where pinned"   # must be 0 before the next line
docker exec instrumental-postgres psql -U postgres -d traverse_cplm -c "TRUNCATE analytics.evidence_chunk, analytics.evidence_manifest"
```
Back on: `episodes` instead of `none` in the first line, then the same cancel and resubmit.

## 8. Partitions and retention rows

Rows: `EPISODE=2 GATE_RESULTS=14 LONG_FEATURES=30 PINNED=never SHORT_FEATURES=3 STANDARD=3`. Each
result table keeps partitions from its retention days back to two days ahead, and its DEFAULT
partition is empty (rows there are replays of windows older than retention; the hourly maintenance
prunes them). A newest partition older than tomorrow means the maintenance loop stopped: restart
cplm-api. Changing a retention is one row and takes effect within the hour, no restart:
```
docker exec instrumental-postgres psql -U postgres -d traverse_cplm -c "UPDATE analytics.retention_policy SET days = 14 WHERE record_class = 'GATE_RESULTS'"
```
`prod_decision.md` at the repository root is the record of every value and why; change it together
with the row.

## 9. Errors

Error lines in cplm-api or ingestion over the last day. Zero is normal. Read the five newest with the
command the script prints; a repeated line is a defect to report with its text.

## When something needs more than this file

`migration/MARUN-CONTEXT.md` (how the plant is wired, the traps), `migration/MARUN-DISK.md` (the full
disk survey and cleanup), `prod_decision.md` (every production setting and why), `changes_tracker.md`
(what each release changed and the commands it needs).
