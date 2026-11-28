# After a Flink restart the 12 h / 24 h results disappear for half a day

| | |
|---|---|
| Status | Research only, 23 Nov 2026. No code, container, job or data was changed (lab queries were read-only). |
| Code read | Branch `feat/sr-engine-fixes` (worktree `AMS-open-sr-engine`). Every Flink and cplm-api file cited is identical to v2.9.0 (`7ba43a0e`, live at the plant since 13 Nov) and to v2.9.1 (`7e4b8f69`). |
| Evidence | Lab: `traverse_cplm` results, lab IoTDB (`root.hdpev2.cpm`), Flink REST. Plant: not queried; section 4 is the check to run there. |
| Decision needed | Owner questions in section 3.4 |

## In short

- The engine keeps the last 24 hours of each loop's samples in its own memory (the "window buffer"). Every 15 minutes
  it recalculates the 12 h and 24 h results from that buffer.
- A restart the way the plant does it (cancel the job, submit it again) throws that buffer away. The new job does not
  reload the past from IoTDB or from Kafka. It starts collecting again from the moment the old job stopped.
- The engine then checks each 12 h window: "do I hold at least 95 % of 12 hours of samples?" One hour after the restart
  it holds one hour (8 %), so every loop gets **"Not enough data"**, although IoTDB holds the full 12 hours.
- 95 % of 12 h is **11.4 hours**; 95 % of 24 h is **22.8 hours**. That is the half day (and almost a full day for 24 h).
- Overview, Performance tiles and the loop pages show each loop's **newest** result. So the "Not enough data" results
  replace the good ones on screen within 15 minutes of the restart, and the daily KPI history stores the dip.
- At the plant this happens on **every release** (all jobs are cancelled and resubmitted without their memory), on
  every job resubmit, and after any JobManager restart (the plant has no JobManager high availability). A TaskManager
  crash alone does not cause it: Flink restores the jobs from their last checkpoint.

**Recommendation:** (1) the screens keep each loop's last real result, with its time, while the engine refills after a
restart, and the engine marks those refill windows so this never hides a real data problem (options C + D, covers
planned and unplanned restarts); (2) planned restarts keep the engine's memory with a savepoint whenever a lab rehearsal
proves the new jar can read it (option A), so most releases have no gap at all; (3) later, the engine refills its
buffer from Kafka at start-up so even an unplanned restart has full results within minutes (option B1).

---

## 1. What happens today

### 1.1 Step by step, at the plant (restart at time T)

| When | What the engine does | What the screens show |
|---|---|---|
| T | The new Long Diagnostics job starts with an empty buffer. It reads the samples from where the old job last committed (its last checkpoint, at most 5 minutes before it stopped). Nothing older. | The results from before the restart (they stay "fresh" for 60 minutes). |
| First 15-minute mark (T + 2 to 17 min) | The 12 h window holds only minutes of samples. Completeness ≈ 1–2 %. Gate G0 = FAIL, reason INCOMPLETE. The result is `INSUFFICIENT_DATA`. Fusion writes it as the loop's newest 12 h and 24 h result. | Overview: the loop moves to **Not assessable · incomplete data**. Loop page: **Not enough data**. Details in 1.2. |
| Every 15 minutes | The buffer grows; completeness rises about 2 % per 15 min (12 h) and 1 % (24 h). Each window is again `INSUFFICIENT_DATA`. | Unchanged. |
| T + 11.4 h, next 15-minute mark | The 12 h window holds 95 %: G0 = WARN, a real 12 h verdict again. The first one or two are capped by the persistence rule (DETECTED instead of CONFIRMED), because fusion's history is also new. | 12 h screens are back; full confidence 15–30 minutes later. |
| T + 22.8 h | The same for the 24 h window. | 24 h screens are back. |

A loop whose own feed has a gap after the restart needs longer: every missing minute must be made up.

On the lab the first result after a restart comes 30 minutes later than at the plant: only one of the 16 sample
partitions carries data there, and an empty partition holds the clock back for 30 minutes (`SAMPLE_IDLENESS`). At the
plant all 16 partitions carry loops, so there is no such wait.

### 1.2 What each screen shows during the refill

| Screen (endpoint) | Which result it reads | During the refill |
|---|---|---|
| Overview tiles, bar and drill-downs (`GET fleet/kpis`) | the newest 12 h / 24 h result, whatever it says | Loops move to **Not assessable (incomplete data)**. "Performing acceptably", findings, oscillating, valve and effort counts drop. "In auto mode", "In manual mode" and "Saturated" lose the loops from their denominators (no mode is measured in a not-enough-data window). |
| Performance tiles (same endpoint) | the same | the same |
| Performance loop × gate map (`fleet/heatmap`) | the newest result, the last verdict beside it | the newest is not enough data |
| Loop page summary and gate matrix (`loops/{id}/gates/latest`) | the newest result; the last verdict as a small note | **Not enough data**, gates not evaluated, a note "Last verdict: … window ending …" |
| Performance list, priority queue, fleet status (`fleet/rankings`, `fleet/summary`) | the newest **real** verdict | keep the old verdict, which turns **Stale** once it is older than 12 h (24 h). A loop with any feed gap after the restart goes Stale before it recovers. |
| "Change since yesterday" on the tiles | the same rules as of 24 h earlier | the day after a restart compares against the dip |
| Daily KPI history (`analytics.cplm_kpi_daily`, kept 3 years) | a snapshot at the end of each plant day | a day that ends inside the refill is stored with those loops **Not assessable** |
| Episodes (event frames) | every fused verdict | stay open, marked "unobservable"; a not-enough-data window never closes an episode (correct) |
| Saved boundary evidence (12 h at 00:00 / 12:00, 24 h at 00:00 plant time) | the window at the boundary | a boundary inside the refill saves a not-enough-data window instead of the real one |

What the owner calls "excluded" is this "Not assessable" group. The engine path `EXCLUDED_DATA_QUALITY` is never
reached for an incomplete window: G0 FAIL already returns `INSUFFICIENT_DATA` one step earlier. On the lab, 30 days of
12 h and 24 h results hold 20,164 `INSUFFICIENT_DATA` rows (all G0 FAIL, INCOMPLETE) and no `EXCLUDED_*` row.

The Short Feature job (1 to 60-minute windows) refills within an hour and does not feed these screens. The Condition
engine (limit dwell, freeze) works on minutes. Neither is the half-day problem.

### 1.3 Which restarts cause it

| Event | What happens at the plant | Window buffer kept? |
|---|---|---|
| Release with a new jar | `flink cancel` every job, `docker rm -f` JobManager and TaskManager, `deploy.sh`, `04b` submits again (`migration/deploy/build-release.py` lines 404–421: "COST: no HA and no `-s <savepoint>` means the jobs return with FRESH window state") | **No** |
| Config change that needs a resubmit (evidence emission, `PLANT_DAY_START`, daily-check remedies) | cancel by id, `04b` | **No** |
| JobManager restart (out of memory, Docker restart, VM reboot) | no high availability at the plant: the jobs are gone, `04b` by hand (`prod_decision.md` line 95) | **No** |
| Disk clean-up `MARUN-DISK.md` §3A | removes both Flink containers and every checkpoint and savepoint | **No** |
| TaskManager crash or out of memory alone | Flink restarts the jobs from their last checkpoint | Yes |

The lab has ZooKeeper high availability (`infra/docker/docker-compose.yml` lines 543–547), so a lab JobManager restart
keeps the windows; the lab gap comes from cancel-and-resubmit, as today at 07:29 and 08:18 UTC.

The next restart at the plant is the System Response release's Flink swap (which also brings `PLANT_DAY_START=06:00`).

### 1.4 The mechanism in the code

| Step | Where |
|---|---|
| The buffer is Flink keyed state: every own sample of the loop for the last 24 h + 10 min. | `CplmLongDiagnosticsStreamJob.java` lines 136, 181–183, 196–215, 222–234 |
| Every 15 minutes the 12 h slice is `[timer − 12 h, timer)` whatever the buffer holds. Nothing records when the buffer started. | same file, lines 270–284 (4 h: 253–267, 24 h: 287–301); fewer than 32 samples (`MIN_SAMPLES`, line 59) = nothing emitted |
| Each slice gets a short-feature check over the same nominal window: expected samples = window length ÷ declared grid; completeness = held ÷ expected. | `ShortFeatureCalculator.java` lines 76–93 |
| G0: completeness ≥ 0.98 PASS, ≥ 0.95 WARN, else FAIL (INCOMPLETE). FAIL sets `sufficientData = false`. | same file lines 121–158; thresholds `CplmLoopDynamicsProfile.java` lines 86–87 (bundle property `G0.coverage_min`) |
| Fusion: `sufficientData = false` → `INSUFFICIENT_DATA`, confidence 0, every later gate not evaluated. | `CplmGateFusionEngine.java` lines 126–133; `fusion/BlockingExclusions.java` lines 15–26 |
| A fresh job reads Kafka from the consumer group's committed offsets, not from history. | `CplmIngestPipeline.java` line 31 |
| Every submit path is `flink run -d` without `-s`. | `infra/docker/flink-job-supervisor.sh` line 112; `infra/docker/flink-submit-cplm.sh` line 71; `migration/04b-submit-flink-jobs.sh` line 60 |
| Long and Fusion keep their last checkpoint when cancelled (`RETAIN_ON_CANCELLATION` in code); the release sweep then deletes it. | `CplmLongDiagnosticsStreamJob.java` lines 73–74; `CplmGateFusionStreamJob.java` lines 63–64; `build-release.py` lines 413–417 |
| Fusion's persistence history (last 3 families per window kind) is keyed state too; it restarts empty and fills with "NONE" during the refill, so the first real windows are capped. | `CplmGateFusionStreamJob.java` lines 262–273; `CplmGateFusionEngine.java` lines 388–418 |
| Overview / Performance tiles classify the newest row of any diagnosis. | `Data/FleetKpiSql.cs` lines 47–54; `Services/Kpi/FleetKpiClassifier.cs` lines 45–52 (fresh = newest row ≤ 60 min old, `FleetKpiModels.cs` line 7) |
| The loop gate matrix serves the newest row, the last verdict only as a reference. | `Data/GateReadSql.cs` lines 14–21; `Controllers/CpmAnalyticsController.cs` lines 46–67 |
| Rankings and fleet status prefer the newest real verdict; stale after one window length. | `Data/FleetLatestSql.cs` lines 34–55, 192–238 |
| Results are upserted per (loop, kind, window end, source, bundle); a later write with fewer samples never overwrites. | `BackgroundServices/CplmResultConsumerService.cs` lines 213–253 |
| A not-enough-data window marks an open episode unobservable, never closes it. | `Services/EventFrameLifecycle.cs` lines 86, 112–120 |
| Kafka keeps the loop samples 12 hours at the plant. | `migration/kafka/topics.txt` line 25 (`43200000`) |

### 1.5 Lab evidence

**a) Today, FIC10302 (the only lab loop with samples, a simulator in bursts).** The engine's window holds only what
arrived after its own start; IoTDB holds everything:

| 12 h window ending (UTC) | Engine samples | IoTDB samples, same window | Job instance |
|---|---:|---:|---|
| 23 Nov 06:00 | 245 | 1,100 | started ~04:17 UTC: only the 04:30–06:05 bursts |
| 23 Nov 07:45 | 133 | 1,270 | resubmitted 07:29 UTC: only the 07:30–07:45 burst |

The 133 against 245 is this: the 07:29 job forgot the 245 samples the previous job held. (This loop is a burst
simulator: even 1,270 samples are 15 % of 12 hours, so on the lab it reads "not enough data" either way.)

**b) 3–4 Nov, FIC10301 (continuous simulator, 5 s grid, 8,640 samples = a full 12 h window).**

| 12 h window ending (UTC) | Engine samples (completeness) | Engine result | IoTDB samples (completeness) | Result with the full buffer |
|---|---|---|---|---|
| 3 Nov 19:15 | 5,286 (0.61) | not enough data | 5,286 (0.61) | not enough data (the same) |
| 3 Nov 19:30 | **38** (0.004) | not enough data | 5,462 (0.63) | not enough data |
| 4 Nov 06:45 | 7,215 (0.84) | not enough data | 8,225 (0.95) | **real verdict** (G0 WARN) |
| 4 Nov 07:00 | **90** (0.010) | not enough data | 8,396 (0.97) | **real verdict** |
| 4 Nov 09:00 | 1,490 (0.17) | not enough data | 8,440 (0.98) | **real verdict** |
| 4 Nov 12:15 | 3,618 (0.42) | not enough data | 8,261 (0.96) | **real verdict** |

All 23 windows (one every 15 minutes) from 4 Nov 06:45 to 12:15 would have been real verdicts with the full
history; the engine produced none. Its windows started again from nothing five times: the first windows after the
restarts end at 19:30 and 20:45 on 3 Nov and at 07:00, 11:45 and 12:30 on 4 Nov. Section 4 query 2 finds exactly
these five on the lab, with 9 to 10 of the 10 simulated loops each.

**c) The 24 h window never produced a verdict on the lab in 30 days.** Its highest completeness was 0.920: the lab
Long job never ran 22.8 hours without a cancel-and-resubmit. 12 h: 126 real verdicts out of 10,145 rows.

**d) The daily KPI history stored the dip.** On 3 Nov the lab stored 10 loops as "Not assessable, incomplete data".

**e) A restart that keeps the memory works.** Today at 09:34–09:35 UTC the lab JobManager came back and every job
restored from its last checkpoint (Flink REST: Long `chk-15`, Fusion `chk-25`, Short `chk-102`, `is_savepoint`
false). Same jobs, same windows; `cpm.config_worker_capability` still shows their 08:17 submit. This is what a
savepoint or checkpoint resume (option A) gives the plant.

---

## 2. Options

Effort: S = up to a day, M = 2–4 days, L = one to two weeks, each including tests and a lab check.

### A. Keep the engine's memory on planned restarts (savepoint or checkpoint resume)

- **What changes:** the release and resubmit procedure, not the code. Long and Fusion (and the others where it
  matters) are stopped with a savepoint (`flink stop -p s3://ams-flink/savepoints <job id>`, never `--drain`) and
  submitted again with `-s <savepoint path>`. `04b` needs a small change to pass `-s` for named jobs.
  A2: Long and Fusion already keep their last checkpoint when cancelled, and after a JobManager loss; `04b` could
  resume them from it (`-s s3://ams-flink/checkpoints/<old job id>/chk-N`). That also covers an unplanned
  JobManager loss, if 04b records which job id ran which job.
- **Effect:** no gap at all: tiles, loop pages, daily history, boundary evidence and episodes run straight through.
- **Covers an unplanned crash:** TaskManager crashes are covered today. JobManager loss: only with A2.
- **Effort:** S for the commands and the `04b` change; every release then needs a lab restore rehearsal (S).
- **Risks:**
  - The new jar must be able to read the saved state. The stateful operators all have stable ids; the buffered
    sample is a Flink POJO, so added fields are accepted (CHG-212 added `p`, `i`, `d` in the System Response release:
    expected to restore, must be proven). Fields Flink stores with Kryo (the sample's `roles` map, the peer list, the
    profile's `bundleResponseValues` map) and removed enum values are not safe. Some releases change state on
    purpose (the Response job is stateless by rule, `prod_decision.md` line 353); those jobs keep the fresh submit.
  - The Fusion job's three Kafka sources have no `uid()`: after a topology change their saved offsets cannot be
    matched; restore with `--allowNonRestoredState` and they fall back to the committed offsets (harmless here).
  - `--drain` would fire every pending timer and write a window ending in the future. Never use it.
  - The release sweep of "orphaned" checkpoints must wait until the restored job completes its first checkpoint
    (Flink 1.18 restores in NO_CLAIM mode: the first checkpoint after a restore is a full one). The disk clean-up
    (`MARUN-DISK.md` §3A) deletes savepoints and must not run between stop and resubmit.
  - Size and time of the Long savepoint at plant size are unknown: measure the Long job's checkpoint in MinIO first.
  - Never restore a Short checkpoint from before CHG-061 (`MARUN-DAILY-CHECK.md` §4).

### B. The engine refills its buffer from history at start-up

**B1, from Kafka (recommended variant).**
- **What changes:** the Long job only. When it starts without saved state it reads the samples topic from
  "submit time − 24 h 10 min" instead of the committed offsets (Flink uses that start point only for partitions with
  no saved offset, so a restored job keeps its exact position). While it catches up, its 15-minute timers only re-arm:
  nothing is calculated or written, so the replayed history never reaches fusion, episodes or the evidence archive.
  The first output is the first 15-minute mark after catch-up, with a full window. Kafka retention of
  `traverse.cpa.loop.samples.v1` goes from 12 h to 25 h (`topics.txt` + `04c`).
- **Effect:** after any stateless start the 12 h and 24 h results return within the catch-up time (minutes, to be
  measured), from the same tuples the live path uses (same quality, grid and roles), so the results equal an
  uninterrupted run. With today's 12 h retention the 12 h results return at once and the 24 h ones after ~11 hours.
- **Covers an unplanned crash:** yes, every stateless start.
- **Effort:** M (`CplmIngestPipeline` start option, the catch-up gate in the Long job, retention, lab test of a cancel
  and resubmit with a full day of simulator data).
- **Risks:** start-up load (24 h of 144 loops on a 5 s grid is about 2.5 million samples into RocksDB); Kafka disk: the samples
  topic roughly doubles (measure it first:
  `kafka-log-dirs --describe --topic-list traverse.cpa.loop.samples.v1`); a duplicate overlap with the committed
  position is harmless (the buffer drops a repeated timestamp, CHG-062a).

**B2, from IoTDB.** The same idea reading `root.<prefix>.cpm.<loop>` (the replay reader exists, `IotDbLoopReader`).
Not recommended: the historian keeps values, not quality, so every refilled sample is assumed GOOD and a missing mode
reads AUT (`IotDbLoopReader.java` lines 19–21, 117–119); it needs a new bounded source or blocking reads inside the
keyed operator. Effort L.

### C. The engine marks the refill windows

- **What changes:** the Long job remembers, per loop, from when its buffer covers (kept in its state, so a restore
  keeps it; set from the oldest buffered sample when absent, so a savepoint from an older jar is not mis-marked). A
  window that starts before that moment carries the flag `WARMING_UP` and `coverage_from_ms`. G0 stays as computed.
  Fusion copies the flag into the result. Payload only, no table change.
- **Why not simply stop emitting them:** with no new row the loops turn **Stale** after 60 minutes and Pipeline Health
  reports a stopped pipeline. A flag keeps the truth in the data and lets the screens decide.
- **Effect alone:** none on screen; it is what makes D exact.
- **Covers an unplanned crash:** yes.
- **Effort:** S. **Risk:** a loop whose feed was already down when the job restarted reads "warming up" instead of
  "incomplete" for at most one window length; a newly onboarded loop reads "warming up" until its first full window.

### D. The screens keep the last real result while the engine refills

- **What changes (cplm-api):** when a loop's newest 12 h / 24 h row is a refill window and the loop had a real verdict
  that ended no more than one window length before the refill began:
  - Overview and Performance tiles classify the loop from that verdict; "fresh" is judged by the newest row (which
    proves the pipeline runs); the loop carries "updating since a restart" and the verdict's time
    (`FleetKpiSql.Rows` needs the verdict's payload fields, `FleetKpiClassifier.Classify` the rule).
  - The loop page serves the verdict as the matrix (the `prefer=verdict` path exists in `gates/latest`), the refill
    window as the side note. The heat map does the same.
  - Rankings and fleet status do not call that verdict Stale while the loop refills.
  - The daily KPI job stores a day that ends inside a refill from the verdict (and records that it did).
- **What changes (frontend):** one short line where the time is already shown, e.g. "Updating after a restart ·
  result from 10:15". No layout change; wording for the owner to approve.
- **Interim without a new jar:** cplm-api alone can recognise a refill: newest row not enough data (G0 INCOMPLETE)
  whose window started before the Long job's submit time (`cpm.config_worker_capability`), for a loop that had a
  real verdict within an hour before that submit. It can ship in a cplm-api-only release, with no Flink restart.
  It cannot recognise past restarts, so it does not repair stored days; the C flag does.
- **Covers an unplanned crash:** yes, any refill.
- **Effort:** M for cplm-api (with the existing fleet KPI tests), S for the frontend.
- **Risks:** a result up to 11.5 h (24 h: 23 h) old is shown as the loop's state, with its time. Mode and saturation
  tiles would use the last verdict's shares. A problem that starts during the refill is not visible until the window
  is full (it is not visible today either). Without C's flag the rule must stay narrow, or it would hide a genuine
  feed outage; the 17 Sep audit rule "never present an old verdict as current" is kept by showing the time.
  `FleetKpiClassifier.RuleVersion` must be bumped, which recomputes the kept 14 days of daily history.

### E. Bridge the refill with on-demand evaluations (alternative to B1)

After a restart cplm-api queues one historian evaluation per monitored loop for the newest 12 h and 24 h window
(CHG-102's standing On-Demand Evaluation job); D would prefer a fresh evaluation over an older verdict. Results come
in minutes but are stored as purpose EVALUATE (episodes and screens ignore them today), use assumed-GOOD quality, each
writes a whole evidence set (2 × ~144 sets after every restart, on a disk with an evidence history), and IoTDB serves
24 h per loop at once. Effort M. Not recommended over B1.

### F. JobManager high availability at the plant

Covers a JobManager loss or VM reboot the way the lab does. Risks: it would use Instrumental's shared ZooKeeper (3.8.x,
the zero-byte log crash of October; a ZooKeeper outage would stop Flink's leader election), and the lab trap that a
recreated JobManager restores the old job graphs with the old jar unless every job is cancelled first. Not now; A2
gives most of the benefit.

### Comparison

| | A savepoint / checkpoint | B1 Kafka refill | B2 IoTDB refill | C mark refill | D keep last result | E evaluations | F HA |
|---|---|---|---|---|---|---|---|
| Planned release | yes, if the state reads | yes | yes | with D | yes | yes | no |
| JobManager loss | A2 only | yes | yes | with D | yes | yes | yes |
| Gap in new results | none | catch-up minutes | catch-up minutes | unchanged | unchanged | minutes (EVALUATE rows) | none |
| Gap on screen | none | catch-up minutes | catch-up minutes | unchanged | **none** (last result shown) | none | none |
| Daily KPI history | intact | intact | intact | with D | intact | with D | intact |
| Effort | S + rehearsal per release | M | L | S | M + S | M | M + operations |
| Main risk | state the new jar cannot read | start-up load, Kafka disk | assumed quality | small | old result shown (with time) | evidence volume | shared ZooKeeper |

---

## 3. Recommendation

### 3.1 Next release: C + D

D is exactly the owner's rule: the last calculated KPIs and gate results stay on screen, with their time, until new
results arrive. C makes D safe: only a refill caused by a restart keeps the old result; a loop whose data really goes
missing still reads "Not assessable". Both work for planned and unplanned restarts. If the owner wants it before the
next jar swap, the D interim (cplm-api only) can go first, and C follows with the next jar.

### 3.2 From the next release on: A for planned restarts

Every release rehearses a savepoint restore of Long and Fusion on the lab with the release jar. When it passes, the
plant commands stop those two with a savepoint and resubmit from it; when it fails, they are resubmitted fresh and
D covers the half day. The System Response release swap is the first candidate (its sample gains three fields).

### 3.3 Later: B1

With the samples topic at 25 hours, even an unplanned restart gives full 12 h and 24 h results within minutes, and D
seldom shows. Measure the topic size first; the plant disk decides.

Not recommended now: B2 (assumed quality), E (evidence volume), F (shared ZooKeeper).

### 3.4 Owner questions

1. During a refill, show each loop's last real result with its time (D)? Wording of the one-line note?
2. Mode and saturation tiles during a refill: from the last result (recommended, its time is shown) or left out?
3. Daily KPI history: store a day that ends inside a refill from the last result (recommended), and recompute the
   kept 14 days?
4. Savepoint step in the release procedure (A), with a lab rehearsal per release?
5. B1 later: Kafka retention of the loop samples 12 h → 25 h, after measuring the disk cost?

---

## 4. Plant check (read-only)

Shows when the Long job was last submitted, every restart in the 14 days of kept results that emptied the windows,
the fleet hour by hour around the last restart, how long loops went without a verdict, and the daily KPI history.
Every statement is a SELECT; the session is set read-only. Paste the block into the VM shell:

```bash
cat > /tmp/flink-restart-check.sql <<'SQL'
-- Flink restart data gap - plant check. Read-only: the session is set read-only, every statement is a SELECT.
-- Times in UTC and plant time (Asia/Tehran). To look at an earlier restart, replace NULL in the two
-- "restart_override" lines with a time, e.g. '2026-11-13 12:18+00'.
SET default_transaction_read_only = on;
SET statement_timeout = '120s';

-- 1. When each CPLM job was last SUBMITTED (a fresh submit starts with empty windows; a restore from a checkpoint keeps the old time)
SELECT job_name,
       to_char(to_timestamp(announced_at_ms / 1000.0) AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS submitted_utc,
       to_char(to_timestamp(announced_at_ms / 1000.0) AT TIME ZONE 'Asia/Tehran', 'YYYY-MM-DD HH24:MI') AS submitted_plant,
       left(jar_sha256, 12) AS jar
FROM cpm.config_worker_capability
WHERE job_name LIKE 'AMS - CPLM%'
ORDER BY announced_at_ms DESC;

-- 2. Every restart that emptied the 12 h windows in the last 14 days, found in the results themselves:
--    a 12 h window can lose at most ~2 % of its samples in one 15-minute step, so a loop whose sample count halves
--    from one window to the next lost its buffer. Many loops at the same window end = a job restart.
WITH r1 AS (
    SELECT DISTINCT ON (lower(loop_id), window_end) lower(loop_id) AS loop_id, window_end, sample_count
    FROM analytics.cplm_gate_results
    WHERE purpose = 'LIVE' AND source = 'flink' AND window_kind = '12h' AND window_end > now() - interval '14 days'
    ORDER BY lower(loop_id), window_end, created_at DESC
), w AS (
    SELECT loop_id, window_end, sample_count,
           lag(sample_count) OVER (PARTITION BY loop_id ORDER BY window_end) AS prev_n,
           lag(window_end)   OVER (PARTITION BY loop_id ORDER BY window_end) AS prev_end
    FROM r1
)
SELECT to_char(window_end AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')         AS first_window_after_utc,
       to_char(window_end AT TIME ZONE 'Asia/Tehran', 'YYYY-MM-DD HH24:MI') AS first_window_after_plant,
       count(*)                  AS loops_that_lost_their_window,
       round(avg(prev_n))        AS avg_samples_before,
       round(avg(sample_count))  AS avg_samples_after
FROM w
WHERE prev_n >= 100 AND sample_count < prev_n * 0.5 AND window_end - prev_end <= interval '1 hour'
GROUP BY window_end
HAVING count(*) >= 3
ORDER BY window_end;

-- 3. The fleet, hour by hour, from 3 h before to 26 h after the last restart: monitored loops with a real verdict vs
--    "not enough data" (G0 incomplete), and the median completeness of their windows. Real verdicts need >= 0.95.
WITH params AS MATERIALIZED (
    SELECT COALESCE(NULL::timestamptz /* restart_override */,
                    (SELECT to_timestamp(announced_at_ms / 1000.0) FROM cpm.config_worker_capability
                     WHERE job_name = 'AMS - CPLM Long Diagnostics Engine')) AS t
), g AS (
    SELECT DISTINCT ON (lower(g.loop_id), g.window_kind, g.window_end)
           g.window_kind, g.window_end, g.diagnosis,
           g.payload->>'gate0_reason' AS g0_reason, (g.payload->>'completeness')::float8 AS completeness
    FROM analytics.cplm_gate_results g
    WHERE g.purpose = 'LIVE' AND g.window_kind IN ('12h', '24h')
      AND g.window_end >= (SELECT t FROM params) - interval '3 hours'
      AND g.window_end <= (SELECT t FROM params) + interval '26 hours'
      AND extract(minute FROM g.window_end) = 0
      AND lower(g.loop_id) IN (SELECT lower(loop_id) FROM cpm.loop_registry
                               WHERE COALESCE((monitoring->>'enabled')::boolean, FALSE))
    ORDER BY lower(g.loop_id), g.window_kind, g.window_end, g.created_at DESC
)
SELECT g.window_kind,
       to_char(g.window_end AT TIME ZONE 'UTC', 'MM-DD HH24:MI')         AS window_end_utc,
       to_char(g.window_end AT TIME ZONE 'Asia/Tehran', 'MM-DD HH24:MI') AS window_end_plant,
       round((extract(epoch FROM g.window_end - p.t) / 3600.0)::numeric, 1) AS h_after_restart,
       count(*) AS loops,
       count(*) FILTER (WHERE g.diagnosis IS NOT NULL AND g.diagnosis <> 'INSUFFICIENT_DATA') AS real_verdicts,
       count(*) FILTER (WHERE g.diagnosis = 'INSUFFICIENT_DATA' AND g.g0_reason = 'INCOMPLETE') AS not_enough_data,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY g.completeness)::numeric, 3) AS median_completeness
FROM g CROSS JOIN params p
GROUP BY g.window_kind, g.window_end, p.t
ORDER BY g.window_kind, g.window_end;

-- 4. Per window kind: loops that HAD a real verdict in the window before the restart, how many have one again,
--    how long that took, and how many the Overview shows as "Not assessable" right now.
WITH params AS MATERIALIZED (
    SELECT COALESCE(NULL::timestamptz /* restart_override */,
                    (SELECT to_timestamp(announced_at_ms / 1000.0) FROM cpm.config_worker_capability
                     WHERE job_name = 'AMS - CPLM Long Diagnostics Engine')) AS t
), g AS MATERIALIZED (
    SELECT lower(g.loop_id) AS loop_id, g.window_kind, g.window_end, g.created_at,
           (g.diagnosis IS NOT NULL AND g.diagnosis <> 'INSUFFICIENT_DATA') AS is_verdict
    FROM analytics.cplm_gate_results g
    WHERE g.purpose = 'LIVE' AND g.window_kind IN ('12h', '24h')
      AND g.window_end >= (SELECT t FROM params) - interval '24 hours'
      AND lower(g.loop_id) IN (SELECT lower(loop_id) FROM cpm.loop_registry
                               WHERE COALESCE((monitoring->>'enabled')::boolean, FALSE))
), per_loop AS (
    SELECT g.loop_id, g.window_kind, p.t,
           max(g.window_end) FILTER (WHERE g.is_verdict AND g.window_end <= p.t
                 AND g.window_end > p.t - CASE g.window_kind WHEN '12h' THEN interval '12 hours' ELSE interval '24 hours' END) AS last_before,
           min(g.window_end) FILTER (WHERE g.is_verdict AND g.window_end > p.t) AS first_after,
           (array_agg(g.is_verdict ORDER BY g.window_end DESC, g.created_at DESC))[1] AS newest_is_verdict
    FROM g CROSS JOIN params p
    GROUP BY g.loop_id, g.window_kind, p.t
)
SELECT window_kind,
       count(*) FILTER (WHERE last_before IS NOT NULL) AS had_verdict_before,
       count(*) FILTER (WHERE last_before IS NOT NULL AND first_after IS NOT NULL) AS verdict_again,
       round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM first_after - t) / 3600.0)
             FILTER (WHERE last_before IS NOT NULL AND first_after IS NOT NULL))::numeric, 1) AS median_h_without_verdict,
       round((max(extract(epoch FROM first_after - t) / 3600.0)
             FILTER (WHERE last_before IS NOT NULL AND first_after IS NOT NULL))::numeric, 1) AS max_h_without_verdict,
       count(*) FILTER (WHERE last_before IS NOT NULL AND NOT newest_is_verdict) AS newest_is_not_enough_data
FROM per_loop
GROUP BY window_kind
ORDER BY window_kind;

-- 5. The stored daily KPI history (kept 3 years): days on which loops were counted "Not assessable - incomplete data".
--    A day whose end fell inside a restart's warm-up shows a spike here that the plant did not have.
SELECT day, window_kind,
       count(*) AS loops,
       count(*) FILTER (WHERE state = 'Assessed') AS assessed,
       count(*) FILTER (WHERE state = 'NotAssessable' AND reason = 'INCOMPLETE_DATA') AS not_assessable_incomplete
FROM analytics.cplm_kpi_daily
WHERE day >= current_date - 14
GROUP BY day, window_kind
ORDER BY day, window_kind;
SQL
docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm < /tmp/flink-restart-check.sql
```

How to read it:

| Query | The effect is confirmed when |
|---|---|
| 1 | The Long Diagnostics submit time matches the last jar swap or resubmit (v2.9.0 went live 13 Nov, 12:18 UTC). A TaskManager crash does not change it (the job restores and keeps its windows). |
| 2 | Each release or resubmit in the last 14 days appears as one row with most monitored loops, samples falling from thousands to tens or hundreds. A row you cannot match to a planned restart is an unplanned one. |
| 3 | `real_verdicts` drops to (near) 0 in the first hour after the restart and `median_completeness` climbs about 0.08 per hour (12 h) or 0.04 (24 h); real verdicts return at about 11.5 h (12 h) and 23 h (24 h). |
| 4 | `median_h_without_verdict` ≈ 11.5 for 12 h and ≈ 23 for 24 h. Within a day of a restart, `newest_is_not_enough_data` is the number of loops the Overview shows as Not assessable only because of the restart. |
| 5 | A day whose end (plant midnight) fell within 11.4 h (12 h) or 22.8 h (24 h) after a restart shows a spike in `not_assessable_incomplete`. |

Tested on the lab: all five run in about 15 seconds there, which uses compressed hypertable chunks; at the plant the
results table is plainly partitioned and the queries read only time-bounded slices without payloads, except query 3
(two payload fields of the hourly rows in a 29-hour range).

## 5. Checked and not checked

- Checked: the code path above, in the files the plant runs; lab results, lab IoTDB counts and Flink REST checkpoint
  data (read-only).
- Not checked: the plant itself (section 4 does it); the Long job's savepoint size and stop time at plant size; the
  catch-up time of B1; whether `flink stop` completes cleanly with the capability announce source (part of the A
  rehearsal).
