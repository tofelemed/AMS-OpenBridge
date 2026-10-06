# CHG-049 lab stress test (Task 9) — results

Run 2026-10-06 on the lab, jar `9622d11d` (worktree 0ca5d19d: Task 10 fusion policy + throttle), cplm-api image
978ca336 (fe0ee52c code, grace 1 d lab override). Full running log:
`.superpowers/sdd/2026-10-06-evidence-storage-optimization/task-9-report.md`.

**Status: stopped in S1.** The TaskManager ran out of heap three times; the last recovery needs actions the harness
refused. S2-S8 were not run. S9 was deferred by the coordinator (cplm-api rebuild first).

## Setup
- 14:18-14:22 UTC Flink swap: 13 jobs cancelled, JM + TM recreated, Short by hand with `--evidence-emit none`, the rest
  by `scripts/ensure_flink_jobs.py`; 13 RUNNING, no duplicates; all six CPLM CAPABILITY records `jar_sha256 9622d11d`.
  The worktree jar is also `cp`'d to the main checkout's `src/flink/target` (cplm-api reconstruction mount, sha verified).
- Simulator: `ams-sims/sim_ot_gateway_mqtt.py` gained a limit-cycle profile (`--osc-loops/--osc-period/--osc-shape/--osc-noise/--osc-flip/--seed`)
  and `SIM_OT_CLIENT_ID` (two sims with one MQTT client id kick each other off the broker).

## Lab finding L1 — every loop sample is on Kafka six times; the lab can never accept a cycle
- `traverse_ingestion.ingestion.data_source_configs` has **six active `MQTT_LOOP_SAMPLES` sources** on the same broker
  and topic filter `OT/+/+/+/+/PIDParams/+` (782a06dd plus five leftovers of `test-ot-loop-ingestion-e2e.ps1`:
  82defcf4, 1c3ae45d, e419cf76, dc2b1bfb, 05f15e9f). Each runs its own LoopJoiner, so each tuple reaches
  `traverse.cpa.loop.samples.v1` 6× with identical `event_ts_ms`.
- The Long tier takes the median timestamp step as the sample period: **0 s** → NO_GRID, ACF/FFT empty,
  NO_VALID_CYCLE on every window, G7/G9 NOT_EVALUATED. This explains "0 valid cycles on the lab since 2026-09-25".
  The 20 limit-cycle loops of S1 read the same (FIC10501 4h: 252 samples, 209 duplicate timestamps, period 0).
- Deactivating the five duplicates was **refused** by the harness (Modify Shared Resources). Not worked around.
- Plant risk: a second active loop-sample source on the same OT topics (a test config, a re-created source) silently
  disables G5..G9 plant-wide and multiplies the Short tier's input.

## S1 — plant-scale fleet, 161 loops: **FAIL** (TaskManager OOM after 25-30 min)
- 14:26 sim: 151 loops at 1 s with 20 limit-cycle loops (triangle, 60-120 s) + the lab's 10 loops at 5 s = 161 loops;
  with L1 that is ~966 loop-equivalents of tuples at the 5 s grid.
- 14:46-14:54 the TM went into GC thrash, then `java.lang.OutOfMemoryError` (heap max 1,229 MB of
  `taskmanager.memory.process.size 3584m`). Short checkpoint was already 275 MB (65 s) at 14:52.
- **F1 — the JVM did not exit.** Container `Up`, not OOM-killed, no restart; 0 TaskManagers registered, all 13 jobs
  RESTARTING (alarm jobs included) until the TM was recreated by hand. The TM has no `-XX:+ExitOnOutOfMemoryError`.
- **F2 — the Short heap state cannot be restored on the same TM.** 15:17 TM recreated → all jobs restored
  (Short chk 10) → the TM was lost again at 15:22. 15:33 Short resubmitted stateless (state dropped) → still lost at
  15:39 while replaying its backlog from the committed offsets (~190-300k tuples, mostly the 161-loop period).
  Every loss takes the whole fleet (alarm and CPLM) down.
- Measured before the OOM (14:22-15:50, created time, G5..G15): 18,624 manifests, 49.8 MB, all TRANSIENT; per tier
  long 3,834 + 4,968, fusion 906 + 306, response (G12) 4,109 + 4,536. Max per run: G5 3, G9 1, G11 2, G12 7, others 1.
  **Throttle:** 805 loop × kind × tier series, 1,508 emissions, 543 pairs < 60 min apart and **0 of them with an
  unchanged signature**; at most 3 emissions in one event hour (signature changes). `cycle_scores`: none (L1).
- cplm-api (14:00-15:50): **0 evidence `fail:` lines**, 0 orphan / swept warnings. Other `fail:` lines: Polly timeouts
  (Flink REST slow during the GC thrash) and 3 `CplmConfigAckConsumerService` FK violations
  (`config_worker_ack_deployment_id_fkey`) after the job restarts — outside CHG-049, worth a look.
- Evidence consumer lag stayed < 2,000 (peak 1,972 right after a restore), one member.

## S2-S8: NOT RUN (blocked)
The lab is left with 12 of 13 jobs RUNNING and **the Short Feature job CANCELLED**; its consumer group
`traverse-cpa-flink-cplm-short` has a ~210k-tuple backlog that OOMs the TM on every start. Resetting that group to
latest was **refused** by the harness, as was stopping the reduced-scale S1b sim (30 loops, PID 28588).

For the user to decide (each step was refused for the agent; run them only if you want Task 9 to continue):
```bash
# 1. stop the stress feed and the health sampler (scratchpad)
taskkill //PID 28588 //F ; taskkill //PID 25584 //F
# 2. remove the duplicate loop-sample sources (L1) - keep 782a06dd
docker exec -i ams-postgres psql -U ams_user -d traverse_ingestion -c "update ingestion.data_source_configs set is_active=false where config_id in ('82defcf4-580f-4d10-b09e-915a2157db2f','1c3ae45d-1cb8-40d0-84d7-b247c29d729d','e419cf76-c536-481d-8718-216fbba8a115','dc2b1bfb-3e7b-4292-96c8-e30a420b834d','05f15e9f-93e6-4a78-a436-0c268897a01a')"
# 3. drop the Short backlog (synthetic stress data) and resubmit Short
docker exec ams-kafka kafka-consumer-groups --bootstrap-server localhost:9092 --group traverse-cpa-flink-cplm-short --topic traverse.cpa.loop.samples.v1 --reset-offsets --to-latest --execute
docker exec ams-flink-jobmanager /opt/flink/bin/flink run -d -m ams-flink-jobmanager:8081 -c com.ams.flink.cplm.CplmShortFeatureStreamJob /opt/flink/usrlib/ams-flink-1.0-SNAPSHOT.jar --bootstrap.servers kafka:9092 --input-topic traverse.cpa.loop.samples.v1 --short-feature-topic traverse.cpa.clpm.feature.short.v1 --long-feature-topic traverse.cpa.clpm.feature.long.v1 --output-topic traverse.cpa.clpm.gate.results.v1 --consumer-group-id traverse-cpa-flink-cplm --job-name "AMS - CPLM Short Feature Engine" --evidence-emit none
```

## Findings that need code / config changes
1. **F1 (plant, P1): Flink TM must exit on OOM.** Add `-XX:+ExitOnOutOfMemoryError` to `env.java.opts.taskmanager`
   (compose and the plant pack) so Docker restarts it; today one OOM stops every Flink job until someone acts.
2. **F2 (plant, P1): Short heap state has no bound.** Heap state grows with loops × tuple rate; at ~1 GB it OOMs and
   the checkpoint cannot be restored on the same TM. Bound the buffer per loop (or move it to RocksDB), alert on the
   Short checkpoint size, and document the recovery (cancel Short, reset its group, resubmit).
3. **L1 (plant, P2): duplicate loop-sample sources.** Ingestion should refuse or warn on two active loop-sample sources
   with overlapping topic filters; the Long tier should drop exact-duplicate timestamps before inferring the sample period.
4. Lab hygiene: delete the five `test-ot-loop-ingestion-e2e.ps1` leftovers and make that script remove its source.
5. Not CHG-049: `CplmConfigAckConsumerService` FK violations after job restarts.
