# Consumer groups — CPA slice on shared Kafka

Groups are created by **clients**, not by `04-create-kafka-topics.sh`.
Code now uses these names (Phase 5). Prefixes avoid Instrumental `instrument-*-service-*`.

| Group | Topics | Owner |
|---|---|---|
| `traverse-cpa-flink-cplm` (+ `-short` / `-long` / `-fusion` suffixes in jobs) | samples + feature/gate | Flink short/long/fusion |
| `traverse-cpa-flink-cplm-live-rbe` | `traverse.cpa.loop.samples.v1` | `LoopLiveRbeJob` (appends `-live-rbe` to the base id) |
| `traverse-cpa-cplm-results` | short + long + gate | `cplm-api` — **exactly one member** |
| `traverse-cpa-cplm-results-frames` | gate results | `cplm-api` — **exactly one member** |
| `traverse-cpa-iotdb-raw-loop` | `traverse.cpa.loop.samples.v1` | slim `ams-api` `RawLoopIotDbConsumer` |
| `traverse-sparkplug-edge` | `traverse.cpa.live.loop.metrics`, `traverse.alarm.live.alarms`, `traverse.live.metrics` | `ams-sparkplug-edge-node` (container name unchanged) |
| `traverse-cpa-audit` | `traverse.cpa.audit-events` | `audit-service` |

Alarm Flink groups (not this Marun cut, but wired in code): `traverse-alarm-flink-raw-alarms`, `traverse-alarm-flink-operator-actions`, `traverse-alarm-flink-ack-results`, `traverse-alarm-flink-live-state`, `traverse-alarm-flink-alarm-kpi`, `traverse-alarm-flink-iotdb-persistence`.

**Never run two copies of the same Flink job.** Do not create `ams-health-lag-<guid>` ephemeral groups in production probes.
