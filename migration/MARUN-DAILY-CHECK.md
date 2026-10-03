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
If the database is what grows, section 7 (evidence) or section 8 (partitions) says which table; the
emergency levers are there. `migration/MARUN-DISK.md` has the full survey.

## 2. Containers

All eight must be `running`, and the ones with a health check `healthy`. A missing or restarting
container:
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

Emergency lever when an evidence class breaks its bound and the disk is under 10 GB:
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
