# ams-sims — synthetic-load pipeline validators

One script per pipeline (never one monolith), so each path can be exercised and
re-run in isolation while debugging. Style and Kafka/config conventions follow
`scripts/e2e-edge/`. Findings from the 2026-08-13 validation run live in
`../pipeline.md`; methodology in `../docs/migration/11-pipeline-validation.md`.

| Script | Injects into | Exercises |
|---|---|---|
| `sim_alarm_feed.py` | `traverse.alarm.raw-alarms` | Pipeline A: Flink state machine → `traverse.alarm.current-alarm-state`/`traverse.alarm.lifecycle-events` → Postgres projection → SignalR |
| `sim_ack_lifecycle.py` | API `acknowledge/batch` (or `traverse.alarm.operator-actions`) + synthetic `traverse.alarm.ack-results` | full ACK loop incl. `ACK_STATE_UPDATE` confirm branch |
| `sim_loop_samples.py` | `traverse.cpa.loop.samples.v1` (backdated event time) | CPLM short/long/fusion, `RawLoopIotDbConsumer` raw historian, cplm-api dual-write, `LoopLiveRbeJob` |
| `sim_live_mqtt_direct.py` | `traverse.alarm.live.alarms` (bypasses Flink) | sparkplug-edge-node → EMQX Sparkplug B → Redis snapshots, isolated |
| `sim_binding_resolution.py` | HTTP `/api/bindings/resolve[,/batch]` | path+role → live/history/alarm transport descriptors |
| `sim_stress_flood.py` | high-rate `traverse.alarm.raw-alarms` burst (**run last**) | FloodDetectFilter (sev ≥ 950), RBE bounding, checkpoint stability |

## Running

```powershell
cd ams-sims
python -m pip install -r requirements.txt   # docker CLI must be on PATH
python sim_alarm_feed.py --count 12
python sim_ack_lifecycle.py --count 3
python sim_live_mqtt_direct.py --count 6
python sim_loop_samples.py --count 1200 --span-minutes 45
python sim_binding_resolution.py
python sim_stress_flood.py --count 2000    # LAST — perturbs shared infra
```

Common flags on every sim: `--count`, `--interval`, `--run-tag` (unique id baked
into every record so runs never collide), `--group-id-suffix` (ephemeral
consumer-group ids), `--report out.json`.

Behavior contract:
- **Fail loudly**: non-zero exit if Kafka is unreachable (no silent no-op).
- Machine-parseable: last stdout line is `SUMMARY_JSON {...}`; `--report` writes
  the same JSON (pretty) to a file. Exit 0 iff every check passed, 2 on fatal.

## Why Kafka goes through `docker exec`

The host-published listener (`localhost:9093`) advertises an **empty host**
(`EXTERNAL://:9093` in compose), so host clients connect, then fail on the
returned metadata (pipeline.md PIPE-001). The sims therefore pipe batches into
one `kafka-console-producer` per run inside the broker container — with
`parse.key=true`, because compacted topics (`traverse.alarm.current-alarm-state`, …) reject
null-key records (`docs/alarm-history-flink-sink-stuck.md`).

## Notes / lab constraints

- `sim_ack_lifecycle.py`: the DCS ACK URL (`192.168.1.51:8010`) is unreachable
  in this lab, so the real HTTP leg ends `ACK_FAILED` (verified as such); the
  `ACK_CONFIRMED` branch is exercised by injecting the DCS reply into
  `traverse.alarm.ack-results` (PIPE-002).
- `sim_loop_samples.py` compresses event time (backdated samples) so the
  long-diagnostics 15-minute event-time timers and gate fusion fire in-run.
- `sim_live_mqtt_direct.py` decodes Sparkplug B with `spb_decode.py`, a
  dependency-free minimal protobuf reader (no eclipse-tahu needed).
- Loops used by `sim_loop_samples.py` must exist in `cpm.loop_registry`
  (`G13_LOOP_A`, `G13_LOOP_B` are seeded in the lab).
