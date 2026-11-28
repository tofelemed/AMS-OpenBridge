# Planned Flink restarts keep the jobs' memory (CHG-226, savepoint part)

| | |
|---|---|
| Status | Scripts committed in 91d9b2aa (`feat/sr-engine-fixes`), in release v2.10.0. State check at the release commit: clean (additive fields, one new state). **Not yet rehearsed on the lab**: the plant uses it only after a rehearsal; otherwise a fresh submit. |
| Why | Plant, 13 Nov: a fresh submit cost 11.7 h (12 h) and 23.7 h (24 h) without verdicts for 76 loops. Background: `flink-restart-data-gap.md` option A. |
| Scripts | `migration/flink-stop-with-savepoint.sh` (new), `migration/04b-submit-flink-jobs.sh` (resume option), `migration/deploy/stub-04b.sh` (shows the resume), `migration/lib.sh` (`MINIO_CONTAINER`), `migration/MARUN-DISK.md` §3A (warning) |
| Decision | Owner question 4 in `flink-restart-data-gap.md` §3.4: use it for planned restarts, with a lab rehearsal per release |

## In short

- Before the Flink swap, Long Diagnostics and Gate Fusion are **stopped with a savepoint**. That is a full copy of their
  state: the 24 h sample buffer, the timers, Fusion's persistence history and its open conditions, plus their Kafka
  positions.
- 04b submits them **from the savepoint** (`-s`). They carry on from the exact sample they stopped at and work through
  the samples Kafka collected meanwhile. The 12 h / 24 h windows run straight through, with no "Not enough data".
- Every other job starts fresh, as today.
- If a restore fails, 04b says so and exits with an error. The job is then submitted fresh (today's behaviour) and
  the savepoint is kept for analysis.

## 1. Which jobs resume

| Job | Planned restart | Why |
|---|---|---|
| CPLM Long Diagnostics | **savepoint** (`RESUME_LONG_FROM`) | 24 h buffer: a fresh start costs 11.4 h / 22.8 h |
| CPLM Gate Fusion | **savepoint** (`RESUME_FUSION_FROM`, always `--allowNonRestoredState`) | persistence history and open conditions. Its Kafka sources have no uid (section 6) |
| CPLM Response | fresh | stateless by rule (`prod_decision.md`, System Response deploy rule): new keyed-state fields |
| CPLM Short Feature | fresh | refills within the hour and does not feed the 12 h / 24 h screens. Heap backend; never restore a checkpoint from before CHG-061 |
| CPLM Condition | fresh | works in minutes. Its detector state is Kryo-stored (private fields) |
| CPLM Instrument Context | fresh | rebuilds from the health records that follow. Device state is Kryo-stored |
| Loop Live RBE | fresh | its only state is the last value sent: one extra send per value. Its source has no uid |
| CPLM On-Demand Evaluation | fresh | request-driven, no window state |

## 2. Where the savepoints go

Lab and plant are the same: `state.savepoints.dir: s3://ams-flink/savepoints`, which is `/data/ams-flink/savepoints/`
inside `ams-minio`.

- Plant: `migration/deploy/docker-compose.marun.yml`, JobManager and TaskManager `FLINK_PROPERTIES`.
- Lab: `infra/docker/docker-compose.yml`, confirmed in the running JobManager's `flink-conf.yaml`.

The stop script reads the directory from the JobManager (`GET /jobmanager/config`). `SAVEPOINT_DIR` overrides it.

A savepoint is a folder `savepoint-<6 hex of the job id>-<12 hex>` holding `_metadata` and, above about 20 KB of state,
its data files. Flink never deletes savepoints itself.

Measured on the lab, 23 Nov 2026 (one simulated loop): Long 416 KB, Fusion 276 KB; each stopped in 14 s and 17 s.
**The plant size is unknown.** The Long checkpoint there is the best guide. A CANONICAL savepoint is a full,
uncompressed copy, so it can be several times that size.

## 3. Plant procedure (replaces "cancel every job" in step 5 of the VM steps)

Run everything from the release's extracted source (`/opt/AMS-open`); the stop script ships with it. `<release>` is the
release folder in `/tmp`.

**0. Before the window.**
- The lab rehearsal (section 7) passed with this release's jar, and section 5's check is clean.
- There is room on disk:

```bash
ID=$(docker exec ams-flink-jobmanager flink list -m localhost:8081 2>/dev/null | grep 'Long Diagnostics' | awk '{print $4}')
docker exec ams-minio du -sh /data/ams-flink/checkpoints/$ID     # the Long checkpoint; free disk must be >= 3x this
df -h / | tail -1
```

**1. Stop Long and Fusion with a savepoint.** Long goes first: if its savepoint fails, nothing has been stopped.

```bash
cd /opt/AMS-open
ALLOW_FLINK_STOP=yes bash migration/flink-stop-with-savepoint.sh --out /tmp/<release>/flink-resume.env
cat /tmp/<release>/flink-resume.env        # export RESUME_LONG_FROM=... and export RESUME_FUSION_FROM=...
```

**2. Cancel the other jobs** with the usual loop. Long and Fusion are FINISHED and no longer listed. Flink should also
have discarded their checkpoints: RETAIN_ON_CANCELLATION keeps them only on a cancel, not on a FINISHED job. This is
not checked on the lab yet; the orphan sweep in step 6 covers it either way.

```bash
for id in $(docker exec ams-flink-jobmanager flink list -m localhost:8081 2>/dev/null | grep -oE '[0-9a-f]{32}'); do docker exec ams-flink-jobmanager flink cancel -m localhost:8081 $id 2>/dev/null; done
```

**3. Swap Flink as usual:** `docker rm -f ams-flink-taskmanager ams-flink-jobmanager`, plus the release's other step-5
lines. The savepoints stay in MinIO.

**4. Deploy with the resume variables set.** Do not pipe into `tail -8` this time; the restore lines come at the end.

```bash
. /tmp/<release>/flink-resume.env
bash migration/deploy/deploy.sh --prod 2>&1 | tail -25; echo "deploy exit ${PIPESTATUS[0]}"
grep -E 'restor|savepoint' "$(ls -t migration/deploy/logs/deploy-*.log | head -1)"
```

04b checks each savepoint before submitting it: it must exist in MinIO and be at most 240 min old
(`RESUME_MAX_AGE_MIN`). After all submits, it waits up to 15 min (`RESUME_VERIFY_TIMEOUT_S`) for each restored job to be
RUNNING, restored from exactly that path, with one completed checkpoint. Success:

```
[OK] 'AMS - CPLM Long Diagnostics Engine' restored from s3://ams-flink/savepoints/savepoint-... and completed a checkpoint: its windows run on
[OK] 'AMS - CPLM Gate Fusion Engine' restored from s3://ams-flink/savepoints/savepoint-... and completed a checkpoint: its windows run on
```

**5. Verify.**
- `flink list` shows 8 jobs RUNNING.
- The capability records show the new jar for every job. A restored job announces again at its submit (section 9,
  risk 5).
- The data check in section 8 passes within 30 minutes.

**6. Clean up.**
- `unset RESUME_LONG_FROM RESUME_FUSION_FROM`.
- Run the usual orphan-checkpoint sweep, only now that both restores are proven.
- After the data check, delete the two savepoints: `docker exec ams-minio rm -rf /data/ams-flink/savepoints/<name>`.
  The daily check measures only `checkpoints/`, so a forgotten savepoint uses disk unseen. Check with
  `docker exec ams-minio du -sh /data/ams-flink/savepoints`.

**Fallback.**

| What failed | Then |
|---|---|
| Step 1, Long's savepoint | Nothing was stopped; Long keeps running. Retry once. If it fails again, use today's procedure (cancel all, fresh submit). |
| Step 1, Fusion's savepoint | Long is already stopped; Fusion keeps running. Retry with `... flink-stop-with-savepoint.sh --out <same file> fusion` (the newest line wins). Or cancel Fusion with the others: a fresh Fusion only caps its first one or two verdicts at DETECTED and loses the open conditions until they next change. |
| Step 4, a restore (04b prints FAIL and exits 1; 05-validate does not run) | Read why: `docker exec ams-flink-jobmanager curl -s localhost:8081/jobs/<id>/exceptions \| head -c 3000`. Then `flink cancel` that job id if it is still listed, `unset RESUME_<JOB>_FROM`, `ALLOW_FLINK_SUBMIT=yes bash migration/04b-submit-flink-jobs.sh` (fresh submit), then `bash migration/05-validate.sh --require-flink`. Keep the savepoint for the lab. Do not restore it later: a fresh job has run since. |

## 4. Rules

1. **Never `--drain`.** A drain fires every pending timer and writes windows that end in the future. The script sends
   `"drain":false` and has no option to change it.
2. **Keep the savepoint until the restored job has completed its first checkpoint.** 04b waits for it. Restores run
   in NO_CLAIM mode, so the first checkpoint after a restore is a full one and nothing depends on the savepoint after
   that. Until then, do not run the orphan sweep either.
3. **No disk clean-up between stop and resubmit.** `MARUN-DISK.md` §3A deletes `/data/ams-flink/savepoints/*` (it now
   says so). Run the stop and the resubmit within 240 min: Kafka keeps long features 6 h and samples 12 h; past that
   04b refuses.
4. **Never put `RESUME_*` into `migration/.env`.** A later release would restore an old state. They live in the shell
   for one release; the age check is the safety net.
5. **Never restore a Short checkpoint from before CHG-061** (`MARUN-DAILY-CHECK.md` §4). This procedure does not
   savepoint the Short job at all.
6. **The Response job always starts fresh** (stateless by rule).
7. **Stop the lab job supervisor first** (`ams-flink-job-supervisor`). It resubmits a stopped job fresh within a
   minute, so the script refuses while it runs. The plant has no supervisor.
8. **Keep the parallelism within 128.** A restored job keeps its savepoint's max parallelism (128, Flink's default,
   since the code sets none). Never add `setMaxParallelism` to these jobs.
9. **Do not delete a job's old checkpoint tree by hand during the restore.** A restore from a retained checkpoint
   instead of a savepoint (option A2) depends on it until the first checkpoint completes.

## 5. Is the new jar's state compatible? (run for every release that changes the jar)

```bash
PLANT=7e4b8f69     # the plant's source (v2.9.1; its Flink code equals v2.9.0 7ba43a0e)
REL=HEAD           # the release commit
B=src/flink/src/main/java/com/ams/flink
TOPO="$B/cplm/CplmLongDiagnosticsStreamJob.java $B/cplm/CplmGateFusionStreamJob.java $B/cplm/CplmIngestPipeline.java $B/cplm/CplmParameterSetBroadcastSupport.java $B/cplm/CplmPeerFanoutSupport.java $B/cplm/CplmKafkaSink.java $B/KafkaSinks.java $B/cplm/config/CapabilityRecord.java $B/cplm/config/AnnounceOnceSource.java"
STATE="$B/cplm/CplmNormalizedSample.java $B/cplm/CplmLoopDynamicsProfile.java $B/cplm/contract/RoleObservation.java $B/cplm/condition/ConditionEvent.java $B/cplm/health/LoopHealthContextRecord.java"
git diff $PLANT $REL -- $TOPO | grep -E '^[-+].*(\.uid\(|\.name\(|fromSource|addSource|sinkTo|keyBy|connect\(|StateDescriptor)'
git diff --stat $PLANT $REL -- $STATE
```

| Change | Restores? |
|---|---|
| POJO field added or removed (sample, profile, `ConditionEvent`, `LoopHealthContextRecord`) | yes. An added field restores as null, false or 0. A removed field's value is dropped |
| POJO field type changed, or a class stops being a POJO (private field without getter/setter, final field, no public no-arg constructor) | **no** |
| Field change in a **Kryo-stored** class: `RoleObservation` (inside the sample's `roles` map), and the contents of the sample's `configuredPeers` list, the profile's `bundleResponseValues` map and Fusion's `family-history-by-kind` list | **no** |
| Enum constant added (`LoopClass`, `DynamicClass`, `ServiceObjective`, `GateRole`, `ProfileSource`) | yes |
| Enum constant removed or renamed | **no** |
| New state name (new descriptor) | yes, it starts empty |
| State renamed | the old value is no longer read (silently empty) |
| State's type changed | **no** |
| A stateful operator's `uid` changed | **no**: Long fails loudly. Fusion, which uses `--allowNonRestoredState`, silently drops that operator's state. Never change these uids |
| Topology change before a uid-less source (section 6) | Long: may fail with "Cannot map checkpoint/savepoint state for operator ..."; then rehearse with `RESUME_LONG_ALLOW_NON_RESTORED=yes`. Fusion: covered by the flag |

**Result for the System Response release** (head 4457e36c plus the uncommitted CHG-226 marker work in the worktree):
- No uid, source, sink, key or connect change.
- The only state change in Long is the new ValueState `cplm-buffer-coverage-from-ms`. It restores empty and is filled
  from the oldest buffered sample, which is by design.
- The sample gains `p`, `i`, `d` (nullable `Double`, CHG-212). The profile gains `dynamicClassDeclared` (`boolean`,
  CHG-208). Both are POJO additions; restored samples carry null / false for them. Only the Response job reads them, and
  it starts fresh.
- No change in the Kryo-stored classes or the enums.

So both jobs should restore without extra flags. The lab rehearsal must prove it. Run the check again at the final
release commit.

## 6. uid check (code at 4457e36c)

A stateful operator without `uid()` gets an id generated from its position in the job graph. That id stays the same
while the graph stays the same, but can change with any topology change.

| Job | Operator | State | uid |
|---|---|---|---|
| Long | `cplm-long-normalized-source` (samples) | Kafka positions | yes (`…-source`) |
| Long | control-plane sources `cplm-profile-broadcast-legacy-source`, `cplm-gate-config-broadcast-source`, `cplm-profile-broadcast-canonical-source` (twice: profile join and peer fan-out; `CplmParameterSetBroadcastSupport.buildParameterUpdateStream`) | Kafka positions; they start from earliest anyway | **no** |
| Long | `cplm-sample-profile-broadcast`, `cplm-long-peer-fanout` | broadcast state | yes |
| Long | `cplm-long-diagnostics-keyed-process` | 24 h buffer, peer buffer, timer, evidence throttle (+ coverage start) | yes |
| Long | `cplm-capability-announce-<job-name hash>` | none | yes (stable while the job name stays) |
| Long | sinks (diagnostics, evidence, ACK, capability) | none: AT_LEAST_ONCE, no transactions | yes |
| Fusion | `cplm-fusion-long-source`, `cplm-fusion-condition-source`, `cplm-fusion-health-source` (and the unnamed map chained after the long and health sources) | Kafka positions | **no** |
| Fusion | the same control-plane sources | Kafka positions | **no** |
| Fusion | `cplm-fusion-profile-broadcast` | broadcast state | yes |
| Fusion | `cplm-gate-fusion-join` | family history, open conditions, health by role, evidence throttle | yes |
| Fusion | sinks, capability announce | none | yes |
| Short / Condition / Response | samples source, keyed operator | | yes |
| Short / Condition / Response | control-plane sources | | **no** |
| Live RBE | `live-rbe-source` | | **no** (`live-rbe-explode` and `live-rbe-filter` yes) |
| Instrument Context, On-Demand | all | | yes |

Every keyed and broadcast operator has a uid. The uid-less operators are all Kafka sources whose fallback is harmless:
- Health and control sources read from earliest anyway.
- Fusion's long and condition sources fall back to their consumer group's committed position, which is committed at
  each completed checkpoint. A few long features may be read twice: the result upsert absorbs the duplicate row, and
  that loop's persistence history may count one window twice, once.

Follow-up (not in this change): give these sources a `uid()` so no restore needs `--allowNonRestoredState`. The first
restore after adding them needs the flag once.

## 7. Lab rehearsal (you run it during the next lab deploy)

**Is it valid for the plant?** Only if the lab Long and Fusion jobs run state classes identical to the plant's when the
savepoint is taken. Check the lab jar's commit and repeat section 5 with it in place of `PLANT`:

```bash
docker exec -i ams-postgres psql -U ams_user -d traverse_cplm -c "select job_name, left(jar_sha256,12) jar, source_commit, to_timestamp(announced_at_ms/1000.0) from cpm.config_worker_capability where job_name like 'AMS - CPLM%' order by 1"
```

An empty state diff between the lab commit and `7e4b8f69` makes the lab's savepoint stand in for the plant's. Otherwise
the rehearsal still proves the mechanism and the new jar, but not the plant's old-jar-to-new-jar step.

**Commands** (Git Bash on the lab PC; the supervisor stays stopped):

```bash
cd /d/HMI_Project_Usama/AMS-open-sr-engine
export MSYS_NO_PATHCONV=1
SP=/c/Users/Admin/AppData/Local/Temp/claude/cd01226643df5f14/474f2c3f-c14a-4911-bf8f-770b6ccad608/scratchpad
# 1. stop Long and Fusion with a savepoint (the plant script itself; it needs an env file, an empty one will do)
ALLOW_FLINK_STOP=yes MIGRATION_ENV="$(mktemp)" bash migration/flink-stop-with-savepoint.sh --out "$SP/flink-resume.env"
# 2. lab deploy of the release jar as you do it, after cancelling the other CPA jobs.
#    ZooKeeper HA: a recreated JobManager restores every job still registered, with the OLD jar. Long and Fusion are
#    FINISHED and no longer registered.
# 3. resubmit everything; Long and Fusion from their savepoints
set -a; . "$SP/flink-resume.env"; set +a
bash "$SP/submit-cpa-jobs-resume.sh"
```

`submit-cpa-jobs-resume.sh` (in the scratchpad, not run) is `submit-cpa-jobs.sh` with this change to `submit()`:

```bash
  local restore=()   # CHG-226: RESUME_LONG_FROM / RESUME_FUSION_FROM from migration/flink-stop-with-savepoint.sh; unset = fresh
  case "$name" in
    "AMS - CPLM Long Diagnostics Engine") [ -n "${RESUME_LONG_FROM:-}" ] && restore=(-s "$RESUME_LONG_FROM") ;;
    "AMS - CPLM Gate Fusion Engine") [ -n "${RESUME_FUSION_FROM:-}" ] && restore=(-s "$RESUME_FUSION_FROM" --allowNonRestoredState) ;;
  esac
  if [ "$(running "$name")" != "0" ]; then echo "skip (running): $name${restore:+ - NOT restored from ${restore[1]}}"; return; fi
  echo "submit: $name${restore:+ from ${restore[*]}}"
  docker exec "$JM" /opt/flink/bin/flink run -d -m localhost:8081 "${restore[@]}" -c "$class" "$JAR" "$@" 2>&1 | grep -E "JobID|Exception|Error" | head -2
```

To rehearse Long strictly, leave out `--allowNonRestoredState` for Long, as here. A failure with "Cannot map
checkpoint/savepoint state" means the plant needs `RESUME_LONG_ALLOW_NON_RESTORED=yes` for this jar.

## 8. Did the restore keep the windows?

**a) Flink REST.** Take the new job id from `curl -s http://127.0.0.1:8082/jobs/overview` (lab) or `flink list` (plant):

```bash
curl -s http://127.0.0.1:8082/jobs/<new id>/checkpoints | grep -oE '"counts":\{[^}]*\}|"restored":\{[^}]*\}'
# restored.external_path = the savepoint; counts.restored = 1 (2 or more = it restarted: read /jobs/<id>/exceptions);
# counts.completed >= 1 after 5 min (Long) / 3 min (Fusion)
```

**b) JobManager log** (lab only; the plant JobManager logs ERROR only):

```bash
docker logs --since 30m ams-flink-jobmanager 2>&1 | grep -E 'from savepoint|Restoring job|Reset the checkpoint ID|Skipping (empty )?savepoint state|Cannot map'
```

- Expected: `Starting job <id> from savepoint s3://ams-flink/savepoints/... ()`. Fusion's line ends in
  `(allowing non restored state)`. Then `Restoring job <id> from Savepoint ...`.
- No `Cannot map`.
- With an unchanged topology, no `Skipping savepoint state for operator` either. With one, they name the skipped
  operator ids.

**c) The results.** Each loop's sample count carries on across the restart instead of dropping to the few samples that
arrived after the resubmit (23 Nov, after a fresh submit: 245 to 133). Set `t_stop` to the stop time in UTC:

```sql
SET default_transaction_read_only = on;
WITH p AS (SELECT timestamptz '2026-11-24 10:00+00' AS t_stop),
r AS (
  SELECT DISTINCT ON (lower(loop_id), window_kind, window_end) lower(loop_id) AS loop_id, window_kind, window_end, sample_count
  FROM analytics.cplm_gate_results, p
  WHERE purpose = 'LIVE' AND source = 'flink' AND window_kind IN ('12h', '24h')
    AND window_end BETWEEN p.t_stop - interval '1 hour' AND p.t_stop + interval '3 hours'
  ORDER BY lower(loop_id), window_kind, window_end, created_at DESC),
b AS (SELECT DISTINCT ON (loop_id, window_kind) loop_id, window_kind, sample_count FROM r, p WHERE window_end <= p.t_stop ORDER BY loop_id, window_kind, window_end DESC),
a AS (SELECT DISTINCT ON (loop_id, window_kind) loop_id, window_kind, sample_count FROM r, p WHERE window_end > p.t_stop ORDER BY loop_id, window_kind, window_end)
SELECT window_kind, count(*) AS loops,
       count(*) FILTER (WHERE a.sample_count >= 0.9 * b.sample_count) AS kept,
       count(*) FILTER (WHERE a.sample_count < 0.5 * b.sample_count) AS emptied,
       round(avg(b.sample_count)) AS avg_before, round(avg(a.sample_count)) AS avg_after
FROM b JOIN a USING (loop_id, window_kind) GROUP BY window_kind ORDER BY window_kind;
```

- Lab: `docker exec -i ams-postgres psql -U ams_user -d traverse_cplm`.
- Plant: `docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm`.
- Pass: `emptied` = 0 and `kept` = nearly every loop. `flink-restart-data-gap.md` §4 query 2 then shows no row at the
  restart.
- On the lab, the burst simulator can lose a whole burst from a 12 h window in one 15-minute step, so compare its rows
  by eye: a kept window holds samples from before the stop.
- On the lab, the first window after the restore comes about 30 min late. Watermarks are not saved, and the empty
  sample partitions hold the clock back for `SAMPLE_IDLENESS`, exactly as after a fresh submit. The windows that fell
  due during the stop are then written in a burst, which is expected.

## 9. Open risks

1. **Plant savepoint size and time are unknown.** A CANONICAL savepoint is a full, uncompressed copy of the Long buffer
   (144 loops x 24 h). The savepoint must finish within the job's checkpoint timeout: Long 600 s, Fusion 300 s (in
   code). Otherwise it fails and the job keeps running. Measure it on the plant's checkpoint first (step 0).
   `SAVEPOINT_FORMAT=NATIVE` writes RocksDB's own compressed files (smaller, faster; it needs the same state backend,
   which is the case). It is the fallback if CANONICAL is too large or slow.
2. **Fusion's `--allowNonRestoredState` hides a mistake.** If someone changes the uid of `cplm-gate-fusion-join`, its
   state is dropped without an error. Section 5's uid diff is the guard.
3. **Long's uid-less control sources.** A topology change before them can make Long's restore fail. That failure is
   loud, and the lab rehearsal finds it first.
4. **Fusion may read a few long features twice** after falling back to the committed position (section 6). Small and
   one-off.
5. **A restore looks like a submit in `cpm.config_worker_capability`.** `announced_at_ms` is set when the job graph is
   built, so it becomes the resubmit time even though the windows were kept. `flink-restart-data-gap.md` §4 query 1
   ("a fresh submit starts with empty windows") no longer holds after a restore. The D interim idea (refill = window
   opened before the Long submit time) would misread a restore, so use the C flag (`warming_up`) instead.
6. **The stop has been proven on the lab, but only with this jar and one loop** (23 Nov, see below). The stop of the
   legacy capability-announce source finished cleanly there. The restore with a jar change is not yet proven.
7. **The release generator is not updated.** `migration/deploy/build-release.py` step 5 still prints "cancel every
   job" and the fresh-state cost. Add the section 3 lines there once the owner approves.
8. **A comment in the Flink config is out of date.** The comment in `docker-compose.marun.yml` saying "04b submits
   without `-s`" sits inside `FLINK_PROPERTIES`, so changing it changes the containers' environment and recreates both
   Flink containers. Update it only in a Flink release.

**Lab incident, 23 Nov 2026 ~11:38 UTC.** While the stop script was being tested, the real lab Long and Fusion jobs were
stopped with savepoints by mistake:
- Long: `s3://ams-flink/savepoints/savepoint-18e4fb-5e6504c2d7b8`.
- Fusion: `s3://ams-flink/savepoints/savepoint-c5340f-f94070fb07f6`.

The test's fake `docker` sat in a `C:/...` PATH entry, which Git Bash splits at the colon, so the real `docker` ran.
The coordinator resumed both jobs from these savepoints. Script tests now run only with a `/c/...` PATH entry, a check
that `type -P docker` is the fake, and `DOCKER_HOST=tcp://127.0.0.1:1`, so no real daemon can be reached.
