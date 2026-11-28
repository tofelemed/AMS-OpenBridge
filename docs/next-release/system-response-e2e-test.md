# System Response: end-to-end test on the lab (final run)

Run once, at the end, by the session that deploys the lab (owner decision 22 Nov: one deploy, one tester). Written by
"system response Updates" for CHG-106/107/108 and the engine work CHG-204..219.

## 0. Before you start

| Check | How | Expected |
|---|---|---|
| Lab runs the merged build | jar + cplm-api + ams-frontend from `feat/sr-engine-fixes` (incl. `feat/sr-mine`) | CAPABILITY records carry the new jar sha |
| Flink healthy | Flink UI `:8082` | TaskManager registered (it was crash-looping on 22 Nov), 8 jobs RUNNING incl. "AMS - CPLM Response Engine" |
| Test loop | `GET /api/v1/cpm/loops/FIC10302` | active, loop type FIC, **PV range declared** (`engineering.pvMin` / `pvMax`); without it the snapshot says `usable: false, reason: PV_RANGE_NOT_SET` (a valid extra case) |
| Feed | an `MQTT_LOOP_SAMPLES` data source is active on the OT test broker (the simulator publishes `OT/HDPE/{fcs}/{cls}/{loop}/PIDParams/{item}`, port 1884) | `SELECT name, is_active, profile_config->'loop_ingest'->'mode_value_map' FROM ingestion.data_source_configs;` in `traverse_ingestion` |
| **Mode maps to AUT** | the simulator sends `MODE = 1.0`; capture is AUT-only now | `mode_value_map` maps `"1"` to `AUT` (or `AUTO`). If not, no event is captured: fix the map first |

Shell helpers (lab):
```bash
pg()  { docker exec ams-postgres psql -U ams_user -d traverse_cplm -c "$1"; }
kcat(){ docker exec ams-kafka kafka-console-consumer --bootstrap-server localhost:9092 --topic traverse.cpa.loop.samples.v1 --max-messages 200 --timeout-ms 30000 2>/dev/null | grep "$1" | tail -1; }
SIM="python scripts/sim/loop_step_sim.py --loop FIC10302"
```
(Check the Kafka container name with `docker ps`; the simulator needs `pip install paho-mqtt`.)

## A. Controller tuning from P / I / D (CHG-212..215 engine, CHG-107 cplm-api)

CENTUM convention used by the engine (adapter `CENTUM_PB_1.0`): ideal PID, `Kc = 100 / P` (P = proportional band %),
I and D in seconds; the plant publishes P / I / D **on change**, like PV. Ingestion carries the last value on every sample
(never aged out).

| # | Do | Check | Expected |
|---|---|---|---|
| A1 | `$SIM --scenario input-test --tuning 120,30,0` (one run ≈ 8 min) | `kcat FIC10302` | the sample JSON carries `"p":120,"i":30,"d":0` after the contract fields |
| A2 | wait for the event to finish | `pg "SELECT capture_state, result->>'controller_snapshot_ref' AS ref, result->'controller_snapshot'->>'kc' AS kc, result->'controller_snapshot'->>'usable' AS usable, result->'controller_snapshot'->>'effective_from' AS from FROM analytics.response_event WHERE loop_id='FIC10302' ORDER BY emitted_at_ms DESC LIMIT 3;"` | `ref` = `ctl:` + 16 hex; `usable` true; `kc` = (100 / 120) × (100 / PV span), as % output per PV unit |
| A3 | | `pg "SELECT valid_from, valid_to, native->>'raw_p' AS p, normalized->>'kc' AS kc, source, imported_by FROM cpm.controller_snapshot WHERE loop_id='FIC10302' ORDER BY valid_from;"` | one row, `valid_to` null, p 120, source DCS, imported_by response-engine |
| A4 | | `pg "SELECT model_state, controller_snapshot_id FROM analytics.system_model WHERE loop_id='FIC10302' ORDER BY created_at DESC LIMIT 1;"` | `controller_snapshot_id` = the row of A3 (when the event produced a model) |
| A5 | | `GET /api/v1/cpm/loops/FIC10302/controller-tuning` (gateway, logged in) | `current.native.raw_p` = 120, `history` has 1 row |
| A6 | | `pg "SELECT result->'subgates'->'H'->'outputs' FROM analytics.response_event WHERE loop_id='FIC10302' ORDER BY emitted_at_ms DESC LIMIT 1;"` | gain / phase margin present; `lambda_source` = `DEAD_TIME_RULE`; `p_band_pct` = 120 |
| A7 | tuning change during an event: `$SIM --scenario input-test --tuning 120,30,0 --tuning-change 80,30,0 --tuning-change-at 20` | `pg "SELECT capture_state, censor_reason FROM analytics.response_event WHERE loop_id='FIC10302' ORDER BY emitted_at_ms DESC LIMIT 2;"` and A3 again | the event is CENSORED `TUNING_CHANGED`; `controller_snapshot` has 2 rows, the first closed at the second's `valid_from` |
| A8 | the same tuning again later (or after a stateless resubmit of the Response job) | A3 | no new row for the same P / I / D (the row in force continues) |
| A9 | a loop that never received P / I / D | A2 for that loop | `ref` empty, no snapshot, no row in A3 |
| A10 | UI: System Response → the loop → Frequency tab | | tuning history table (P / I / D, from / to), margins / Bode, advice with its λ source; the censored event of A7 reads "Controller tuning changed" |

## B. Operating regions and per-loop settings (CHG-108)

| # | Do | Expected |
|---|---|---|
| B1 | `POST /api/v1/cpm/configuration/regions` `{"regions":[{"loopId":"FIC10302","pvMin":<a>,"pvMax":<b>}],"note":"e2e"}` | one row `VALIDATED`, a `batchId` |
| B2 | `POST .../batches/{batchId}/approve?site=hdpe` as a second user (Engineer) | `APPROVED`; as the author with only Engineer: refused "self-approval"; as the author with Admin or SuperAdmin: `APPROVED`, approval note `[self-approved as Admin]` |
| B3 | `POST .../batches/{batchId}/deploy?site=hdpe` | one deployment per loop; it reaches ACTIVE_VERIFIED when every required worker ACKs (deployments view) — **no Flink restart** |
| B4 | `GET .../regions?site=hdpe` | FIC10302 `regionMin` / `regionMax` = a / b, `source` LOOP |
| B5 | a step that leaves the region for more than 10 s (choose a / b so the input-test step crosses b) | the event is CENSORED `REGION_EXIT`; the short windows show G2r WARN / FAIL when more than 5 % / 20 % of a window is outside |
| B6 | deploy a PROFILE bundle for FLOW loops (any changed property), then `GET .../loop-settings/stale?site=hdpe` | FIC10302 listed, base PROFILE, own properties = the two region properties |
| B7 | `POST .../loop-settings/restack` `{"site":"hdpe"}`, approve, deploy | the new FIC10302 version has the PROFILE change **and** its region; `stale` is empty afterwards |
| B8 | UI: Gate Configuration | Plant-wide and Per-loop areas, the bulk region table, the re-stack prompt after B6 (CHG-219) |

## C. Plant day start (CHG-106, optional on the lab)

Do not wait up to 12 h for 06:00 / 18:00: set `PLANT_DAY_START` in the lab `.env` to a quarter hour **just ahead** (for
example `14:30` when it is 14:10 plant time), resubmit the long + fusion jobs (04b / the supervisor) and restart cplm-api.
Expected: the Flink log line `CHG-102: evidence emit=… day start=14:30`; boundary sets (`emission_reason=BOUNDARY`) for
12 h and 24 h at 14:30, `boundary_local_end` ending `T14:30:00+04:00` (the lab runs at `+04:00`; the plant is `+03:30`); `GET /api/v1/cpm/fleet/kpis/trend` reports
`plantDay.dayStart` = `14:30` and the KPI label reads "… day from 14:30". For the daily KPI day itself, lower
`Cpm:KpiDaily:SettleMinutes` (default 60) for the test, or wait the hour. Set it back to `00:00` afterwards unless the
owner wants the lab on shift time (`06:00`).

Lab note (23 Nov run): after a long / fusion restart the long job emits only after up to 30 min (watermark idleness
30 min; on the lab 15 of 16 sample partitions are empty), so feed samples across the boundary and allow for it. The
23 Nov run passed with day start 11:45: log line, 12 h + 24 h boundary sets ending 11:45+04:00 (22 artifacts each),
`plantDay.dayStart` 11:45, daily KPI pass "26 recomputed".

## Timing (no 12-hour run needed)

| Part | Time |
|---|---|
| A1-A6 (one scenario run twice, `--repeat 2`, so the model is validated against a second event) | ≈ 20 min |
| A7 tuning change | + ≈ 8 min |
| B regions: approve / deploy apply in seconds, REGION_EXIT on the next event, G2r on the short windows | ≈ 15-60 min |
| B6-B7 re-stack | minutes |
| C with a day start just ahead | ≈ 30 min (+ the settle time for the daily KPI) |

Only the 12 h / 24 h fused verdicts need hours after a fresh Flink start (about 11 h / 23 h of data to qualify); they are
not part of this test, because none of these changes alters them.

## Report back

For each step: pass / fail and the output line. A failure in A1 is ingestion (topic or param names), A2-A6 the engine,
A3-A5 cplm-api, B3 the deployment / worker ACKs.
