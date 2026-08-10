# STR-08 — Schedule-or-retire decision record for the unscheduled Flink jobs

**Plan:** [02-streaming-correctness-durability.md](./02-streaming-correctness-durability.md) item 5
**Date:** 2026-08-10 · **Baseline:** `4e2758c`

Four Flink jobs existed in the shaded JAR but were in **no** submission or supervision
mechanism, while .NET consumers in ams-api sat idle forever on their output topics. Each
needed an explicit decision rather than being left ambiguous. Two were scheduled and two
are recommended for retirement.

| Job | Input topic | Has producer? | Consumer of its output | Decision |
|---|---|---|---|---|
| `AlarmKpiStreamJob` | `lifecycle-events` | **Yes** (OpcEventStreamJob + ams-api) | `KpiConsumerService` (live) | ✅ **SCHEDULED** |
| `AlarmStateExportJob` | `current-alarm-state` | **Yes** (OpcEventStreamJob) | `AlarmStateDeltaConsumerService` (live) | ✅ **FIXED + SCHEDULED** |
| `LoopKpiStreamJob` | `loop-raw-data` | **No producer anywhere** | `KpiConsumerService` (live) | ⚠️ **RETIRE — needs sign-off** |
| `StateDriftDetectionJob` | `alarm.events.raw`, `alarm.state.active` | **No producer anywhere** | `DriftAlertConsumerService` (live) | ⚠️ **RETIRE — needs sign-off** |

---

## Scheduled

### AlarmKpiStreamJob → now supervised
Input and consumer were both live; only the submission was missing. Added to
`flink-job-supervisor.sh`. This unblocks the KPI surfaces that were reading empty topics.

### AlarmStateExportJob → two real defects fixed, then scheduled
Scheduling it as-was would have produced wrong data, so both defects were fixed first:

1. **Key extraction was broken.** `extractId` read `"Id"`/`"id"`, but `current-alarm-state`
   records carry the identity as `"alarmId"`. Every record fell through to the `"unknown"`
   fallback, so the entire stream keyed to one value and every alarm in the plant shared a
   single `previousState`. The delta output was meaningless. Now reads `alarmId` first.
2. **No checkpointing at all.** Keyed delta state was never snapshotted and source offsets
   were never committed through a checkpoint. Added `AT_LEAST_ONCE` at 30 s (safe: the
   consumer applies deltas by alarm id and is idempotent).

---

## Recommended for retirement — product sign-off required

These two consume topics that **nothing in the repository produces**, so they cannot do
anything if scheduled. They were left in place rather than deleted because removing a
feature is a product decision, not a review finding.

### LoopKpiStreamJob
Reads `loop-raw-data`; a repo-wide search finds no producer. Its function is superseded by
the CPLM engines, which compute loop KPIs from `loop.samples.v1`.
**Recommendation:** delete the job class and remove the `loop-kpis-5m` branch from
`KpiConsumerService`.

### StateDriftDetectionJob
Reads `alarm.events.raw` and `alarm.state.active` — neither has a producer; both appear only
in `kafka-reset-lab-topics.ps1`'s *delete* list. It also has no checkpointing and both
sources share one consumer group id.
**Recommendation:** delete the job class and `DriftAlertConsumerService`, or specify what
should produce those topics if drift detection is still wanted.

---

## Why the idle consumers matter

An idle consumer is not harmless. Each holds a consumer-group membership, appears healthy in
`/health` and in lag dashboards, and makes the feature look wired when it is not. The KPI
dashboard read a topic that no job wrote to, and nothing in the system said so. Whichever way
the two retirements are decided, **the .NET consumer must go the same way as its producing
job** so no topic is left with a live consumer and a dead producer.
