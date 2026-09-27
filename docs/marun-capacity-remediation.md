# Marun capacity remediation — what must change after the 26 September 2026 outage

**Status:** items 2 and 3 shipped as v2.6 (CHG-033, 2026-09-27; plant rollout pending); items 1, 4 and 5 open.
**Decision needed from:** whoever owns the plant host, plus the engineering backlog.
**Related:** [MARUN-DISK.md](../migration/MARUN-DISK.md) covers cleanup and the log and checkpoint
controls already shipped. This document covers what that runbook does not: the analytics data volume
introduced by v2.5, and the containment gap that let it affect another platform.

---

## 1. What happened

v2.5 was deployed at 07:20 UTC on 26 September 2026. It came up clean and every acceptance check
passed. About three hours later the shared filesystem reached 311 MB free out of 96 GB.

The consequence was not confined to the analysis platform. ZooKeeper failed while writing a
transaction log, created a zero byte file, and then refused to start because it could not read that
file's header. Kafka lost its coordinator. Both brokers are shared with the Instrumental platform, so
their production messaging was unavailable for roughly twenty minutes until the empty file was moved
aside and ZooKeeper restarted.

Nothing was lost. The zero byte file contained no transactions, all 75 topics survived, and no
partition ended under-replicated.

## 2. Why

Four independent causes. Each would have been survivable alone.

### 2.1 The analysis output is far larger than anyone estimated

Measured across the first three hours, at 144 publishing loops:

| Store | Size after three hours |
|---|---|
| `traverse_cplm` database | 10 GB |
| `cplm_short_feature_results` | 4104 MB |
| `evidence_chunk` | 3366 MB |
| `evidence_manifest` | 1576 MB |
| `cplm_long_feature_results` | 898 MB |
| `cplm_gate_results` | 663 MB |
| Kafka, both brokers combined | grew 13 GB |

That is on the order of 80 GB a day for the database alone, and it had not reached steady state,
because no 12 or 24 hour window had closed yet so the fused verdicts were barely being written.

The pre-production estimate was 0.6 to 0.7 GB a day. It came from the laboratory, where the simulated
loops mostly pass.

### 2.2 Evidence emission is conditional, not bounded

Evidence artifacts are emitted for windows that contain a finding, where a finding is any gate status
other than pass, pending or not-evaluated. The policy assumes findings are rare, so that the subset is
small. At this plant nearly every window contains one, which is precisely why the plant bought the
system. The policy therefore emits almost everything and is not a limiter at all.

Emission is also **per window**, while a condition persists across many consecutive windows as a single
episode. The same finding is therefore evidenced dozens or hundreds of times.

### 2.3 No retention exists in the production data path

Not one analytics table has a retention policy in production. They grow without bound.

The retention work that exists in the codebase is built on TimescaleDB. The plant's PostgreSQL has no
Timescale extension, so none of it applies here. This was not noticed because the laboratory does have
the extension, and retention has always appeared to work there.

### 2.4 Nothing warned anyone, and nothing stopped it

The observability profile, which carries Prometheus, Grafana, Alertmanager and the exporters, is
deliberately not started at this plant. Free space fell from 15 GB to 311 MB with no alert to any
person or system.

The platform also has no floor of its own. It wrote until the filesystem was full, and because that
filesystem is shared, it took a neighbour's production down with it.

## 3. What must change

Ordered by value, not by effort.

### Item 1 — Give the analysis platform its own filesystem

**Owner:** platform. **Effort:** hours. **Code changes:** none.

Move our Docker volumes onto a separate volume or disk from Instrumental's PostgreSQL, Kafka and
ZooKeeper. This does not reduce our consumption by a single byte. What it does is convert the worst
case from "the plant's messaging backbone is down" into "the analysis platform stopped writing".

Every other item on this list reduces the chance of an incident. This one reduces its blast radius, and
it is the only item that would have prevented the part of yesterday that mattered.

Note that the volume group on this host is now fully allocated, so this requires additional storage
rather than repartitioning.

### Item 2 — Ship retention as part of the schema

**Shipped in v2.6:** `ops/cpm-10b-result-partitions.sql` + `FeaturePartitionMaintenance` (daily partitions, `retention_policy` days). Gate results included at 30 d.

**Owner:** engineering. **Effort:** one release. **Applies to:** the four high-volume analytics tables.

Range-partition by time, with a scheduled job that detaches and drops partitions past the retention
window. Native PostgreSQL partitioning, not Timescale, since the plant cannot have the extension.

Partitioning rather than deletion matters for a specific reason. Dropping a partition is instant and
returns the space to the filesystem. Deleting rows leaves the pages behind for reuse, so the table
plateaus rather than shrinking, and a table that grew to 30 GB before anyone noticed stays 30 GB on
disk forever.

Retention windows belong in configuration with defaults that assume a plant like this one, not a
laboratory.

### Item 3 — Make evidence emission bounded

**Shipped in v2.6:** per-episode capture (OPEN / ESCALATE / CLOSE) with a TRANSIENT cache bounded by hours and bytes; the Short tier stopped at the source. Artifact bytes stay in PostgreSQL (MinIO not done - the budget makes it unnecessary for space).

**Owner:** engineering. **Effort:** one release. Two changes, either of which helps, both of which
together are decisive.

**Emit per episode, not per window.** An episode already groups the consecutive windows that share a
finding. Emitting on episode transitions, meaning open, materially changed, and closed, instead of on
every window, is a reduction of one to two orders of magnitude with no loss of diagnostic value. A
reader wants the evidence for the episode, not fifty near-identical copies of it.

**Move artifact bytes out of PostgreSQL.** Keep the manifest row, with its checksum and provenance,
in the database, and put the chunk payloads in object storage. MinIO is already deployed on this host
for Flink checkpoints. A relational database is the wrong home for multi-kilobyte binary blobs
arriving continuously, and it is the reason `evidence_chunk` alone reached 3.4 GB in three hours.

### Item 4 — Monitor the disk, and give the platform a floor

**Owner:** platform for the first half, engineering for the second. **Effort:** days.

Run disk monitoring at the plant with alerts at 25 percent and 15 percent free, routed to a person. The
components are already in the repository and are simply not started here.

Separately, the services need a threshold at which they stop writing optional data, shed the evidence
tier, and log loudly, rather than consuming the last byte. A system capable of taking down its
neighbour should refuse to.

### Item 5 — Size from real data

**Owner:** engineering process. **Effort:** part of the next release cycle.

Volume estimates must come from a shadow run against real plant data, or from a first production hour
run under a hard cap with a kill switch. A synthetic feed whose loops pass cannot predict the output of
a system whose entire purpose is to report loops that do not.

## 4. Interim controls now in place

These are holding, and every one of them is manual.

| Control | What it does | Why it is fragile |
|---|---|---|
| `--evidence-emit none` on the plant's job submitter | stops evidence entirely, the largest single source | edited directly into a released script, so the next release overwrites it. The submitter has no environment hook for this setting, which it should |
| `prune-short-features.sh` every 30 minutes | keeps 6 hours of short features | a cron written during an incident. Deletion, so the table plateaus rather than shrinking |
| Kafka retention at 1 to 2 hours on the evidence and short-feature topics | bounds the broker side | below the documented minimums, chosen for space rather than for recoverability |
| Evidence class set to 3 days | bounds evidence if it is ever re-enabled | moot while emission is off |
| A person running `df -h /` | the only alarm that exists | exactly the control that failed yesterday |

The cost of these controls is that the Evidence Workbench, a headline feature of this release, has no
content. Verdicts, diagnostics, episodes, run identity and system response all work normally.

## 5. The decision

The plant can have v2.5 at full fidelity, or it can have v2.5 on this disk. Not both.

- **Add storage and do items 1 through 4.** Evidence returns, the platform stops being able to harm its
  neighbour, and retention becomes a property of the product rather than a cron job.
- **Keep the current disk.** Evidence stays off indefinitely, and items 2 and 4 are still required,
  because short features and verdicts alone will fill 96 GB shared with another platform.

Item 1 should proceed regardless of which path is chosen. Containment is not an optimisation.

## 6. How we will know it worked

- Free space on the plant host stable week over week, with no human running `df`.
- An alert fires before free space reaches 15 percent, and reaches a person.
- Every analytics table has a stated retention window, visible in the schema.
- Evidence is on, and its daily volume is a known, bounded number rather than a function of how badly
  the plant's loops behave.
- A deliberate disk-exhaustion test on the analysis volume leaves Instrumental's PostgreSQL, Kafka and
  ZooKeeper running.
