# Plan 02 — Streaming Correctness & Checkpoint Durability

**Phase:** 1 · **Effort:** M · **Depends on:** Plan 01 (shares the Flink sink edit)
**Gaps closed:** STR-02, STR-05, STR-06, STR-07, STR-08, STR-11, STR-12, STR-13
**Objective:** make Flink state survive a host loss, close the orphaned safety-alert topic, and put every job under a single supervision and upgrade discipline.

> **Scope note:** this plan covers durability and correctness **without clustering**. Flink JobManager HA and Kafka replication are deliberately held for [Plan 09](./09-replication-clustering-ha.md). Landing durable remote checkpoint storage here is what makes Plan 09 a configuration change rather than a redesign.

## Why

Checkpoints live on a local Docker volume, so a host loss destroys all exactly-once state. The two safety watchdogs (telemetry deadman, ACK SLA) publish to `lifecycle-alerts`, which **has no consumer** — a dead OPC feed raises no operator alert. Four jobs are in no submission mechanism at all while .NET consumers idle on their output topics, and there is no savepoint-based upgrade path, so every deploy loses keyed state.

## Work items

| # | Task | Gap | Where | Effort |
|---|---|---|---|---|
| 1 | Move checkpoints/savepoints to durable remote storage | STR-02 | `infra/docker/docker-compose.yml` FLINK_PROPERTIES | M |
| 2 | Wire a consumer for `lifecycle-alerts` | STR-05 | `notification-service` | S |
| 3 | Enforce CPLM single-member consumer group technically | STR-06 | `cplm-api/Program.cs`, consumer services | M |
| 4 | Bring `AnalysisExecutionJob` under the standing supervisor | STR-07 | `infra/docker/flink-job-supervisor.sh` | S |
| 5 | Fix or retire the four unscheduled jobs + their idle consumers | STR-08 | `src/flink/`, `AMS.Api/BackgroundServices/` | M |
| 6 | Add operator UIDs + a savepoint upgrade procedure | STR-11 | all job classes, `scripts/` | M |
| 7 | Split the dual-schema `live.metrics` topic | STR-12 | `LiveStateJob`, `scripts/sim`, edge node | S |
| 8 | Bake the Flink JAR into the image instead of bind-mounting | STR-13 | `infra/docker/`, build pipeline | S |

## Implementation steps

### 1. Durable checkpoint + savepoint storage (STR-02)

`state.checkpoints.dir: file:///flink-checkpoints` points at a local named volume in both the JobManager and TaskManager property blocks.

- Stand up an S3-compatible object store (MinIO single node is sufficient — this is **storage durability, not replication**).
- Set `state.checkpoints.dir: s3://ams-flink-checkpoints/` and add `state.savepoints.dir: s3://ams-flink-savepoints/`.
- Add the `flink-s3-fs-presto` (or hadoop) plugin to the Flink image and the credentials via secrets — the unused S3 placeholders already in `.env.example` can be wired.
- Keep `state.backend: rocksdb` + incremental; retain `num-retained: 3`.
- Verify a checkpoint appears in the bucket and a job restores from it manually before moving on.

### 2. Close the `lifecycle-alerts` orphan (STR-05)

Producers exist (`TelemetryDeadmanWatchdogService`, `AckSlaWatchdogService`); there is no consumer anywhere.

- Add a `LifecycleAlertConsumer` to `notification-service` (which already consumes `root-cause-events`) that raises an operator-visible notification and increments a Prometheus counter.
- Deploy `notification-service` in compose — it is implemented but not deployed today.
- Add an alert rule on the counter (`TELEMETRY_STALLED`, `ACK_SLA_BREACH`) so a stalled feed pages someone.
- End-to-end test: stop the OPC feed → alert fires within the deadman window.

### 3. Technical single-member enforcement for CPLM (STR-06)

Today a config flag plus a code deletion are the only things preventing two members from splitting the partitions and each persisting half the windows with no error.

- Assign `GroupInstanceId` (static membership) to the intended single member.
- At startup, assert the assigned partition set equals the **full** topic partition set; if it does not, log a critical error and fail fast rather than silently halving throughput.
- Surface the assertion in the existing `/health` consumer-heartbeat payload so a split is visible, not just a stall.

### 4. Single supervision source of truth (STR-07)

The compose supervisor restores 7 jobs; `AnalysisExecutionJob` exists only in the host-side `ensure_flink_jobs.py`, which stack startup never calls — so it stays dead after any JobManager restart.

- Add `AnalysisExecutionJob` to `flink-job-supervisor.sh`'s `submit_if_missing` list.
- Correct the stale "six standing jobs" comment in the script header.
- Make `ensure_flink_jobs.py` and the supervisor read the same job manifest so the two lists cannot drift again.

### 5. Resolve the four unscheduled jobs (STR-08)

`AlarmKpiStreamJob`, `AlarmStateExportJob`, `LoopKpiStreamJob`, and `StateDriftDetectionJob` are in no submission mechanism, yet `KpiConsumerService`, `AlarmStateDeltaConsumerService`, and `DriftAlertConsumerService` idle forever waiting on their topics.

For each job, make an explicit **schedule-or-delete** decision and record it:

- `AlarmStateExportJob` — if kept: add checkpointing and fix the key extractor (it reads `Id`/`id`, but `current-alarm-state` carries `alarmId`, so everything keys to `"unknown"`).
- `StateDriftDetectionJob` — inputs `alarm.events.raw` / `alarm.state.active` have no producers; either wire producers or delete the job.
- `LoopKpiStreamJob` — input `loop-raw-data` has no producer; likely superseded by CPLM — delete.
- `AlarmKpiStreamJob` — schedule it or remove `KpiConsumerService`.
- Delete the .NET consumer for anything retired so no consumer idles on a dead topic.

### 6. Savepoint-based upgrades (STR-11)

Every submit path is `flink run -d` with no `-s` restore, so a deploy restarts from empty keyed state.

- Add explicit `.uid()` to every stateful operator — without stable UIDs, savepoint restore is fragile even once storage exists.
- Add an upgrade script implementing:
  1. `flink stop --savepointPath s3://ams-flink-savepoints/<job> <jobId>`
  2. deploy the new versioned JAR
  3. `flink run -d -s <savepointPath> -c <Class> <jar>`
  4. verify RUNNING + checkpointing + lag recovered; else restore the prior savepoint
- Exercise it once end-to-end on the CPLM long job (largest state) and document the runtime.

### 7. Split `live.metrics` (STR-12)

The topic carries alarm-shaped records from `LiveStateJob` and process-value-shaped records from the simulator; the edge node's metric branch expects the latter.

- Route process values to a distinct topic (e.g. `live.process.metrics`) and keep `live.metrics` alarm-shaped, or add a schema discriminator field.
- Update the edge node's branch selection and the simulator accordingly.

### 8. Immutable job artifact (STR-13)

The JAR is bind-mounted from the working tree into 7 containers, so a local `mvn package` silently changes the running binary.

- Bake a versioned JAR into a Flink image at build time; submit by version tag.
- Keep the bind mount only in an explicit developer override file.

## Exit criteria

- [ ] A checkpoint is written to the object store; a job restores from it after a full stack restart with state intact.
- [ ] Stopping the OPC feed raises an operator-visible alert (the `lifecycle-alerts` loop is closed end to end).
- [ ] Starting a second CPLM consumer instance fails fast with a critical log rather than silently splitting partitions.
- [ ] After a JobManager restart, **all** standing jobs including `AnalysisExecutionJob` return automatically.
- [ ] No Kafka topic has a live .NET consumer whose producing job is unscheduled (documented decision for all four jobs).
- [ ] A savepoint upgrade of the CPLM long job preserves its rolling buffer across a version change.
- [ ] `live.metrics` carries exactly one schema.
- [ ] The running JAR's version is traceable to a build artifact, not a developer's working tree.

## Rollback

Items 1, 4, 7, 8 are configuration/compose changes — revert the file and redeploy. Item 2 adds a service (disable by removing it from compose). Items 3, 5, 6 are code changes reverted by redeploy; savepoints taken during item 6 remain valid restore points.

## Risks & notes

- **Item 1 is a prerequisite for Plan 09** — Flink HA without durable remote checkpoints buys nothing.
- Adding `.uid()` to operators of a **running** job invalidates existing checkpoints; schedule item 6 during a maintenance window and accept one cold start, or apply UIDs at the same time as item 1.
- Retiring jobs (item 5) removes features some dashboards may reference — confirm with the product owner which KPI surfaces are actually in use before deleting.
