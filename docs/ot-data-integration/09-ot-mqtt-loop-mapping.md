# OT MQTT → Loop Registry → Kafka — Field Mapping Contract

**Date:** 2026-08-31. Field names on the right are the **actual** platform names (verified in code/DDL); field names on the left are the **actual** gateway names (verified in the broker screenshots).
**Companions:** [08-ot-mqtt-loop-ingestion-assessment.md](08-ot-mqtt-loop-ingestion-assessment.md) (decisions + evidence), [01](01-ot-data-requirements.md) §4 (the Kafka tuple contract).

## 1. Source identity (MQTT topic levels)

Topic template (per data-source config, default): `{ns}/{site}/{fcs}/{class}/{loop}/{group}/{param}`
Observed: `OT/HDPE/FCS0101/Flow/FIC10302/PIDParams/PV`

| Topic level | Parsed name | Validated against payload | Registry field | Role in the enriched event |
|---|---|---|---|---|
| 1 `OT` | `ns` | — | — | namespace literal; must match template |
| 2 `HDPE` | `site` | `payload.site` (=) | — (registry `site` is the plant-tree slug `hdpe`, deliberately different) | `source.site` context |
| 3 `FCS0101` | `fcs` | `payload.area` (=) | — (no FCS column exists; see assessment Q11) | `source_fcs` on the tuple |
| 4 `Flow` | `class` | `payload.line` / `payload.process_unit` (warn-only) | `loop_registry.loop_type` (Flow→FIC, Pressure→PIC/PIC_GAS/PIC_VAPOUR, Temperature→TIC, Level→LIC) — warn-only check | consistency signal |
| 5 `FIC10302` | `loop` | `payload.device` (=), `payload.equipment` (=) | **`loop_registry.loop_id`** (case-insensitive lookup; emit registry casing). Fallback: `loop_tag_map.source_tag` where `source_system='ot-gateway'` | the resolution key |
| 6 `PIDParams` | `group` | — | — | literal; must match template |
| 7 `PV` | `param` | `payload.item` (=) | via `param_roles` config → canonical role | selects the tuple field |

Identity mismatch (`=` rows) ⇒ DLQ, reasons `LOOP_IDENTITY_MISMATCH` / `PARAMETER_MISMATCH`. No registry match ⇒ DLQ + `ingestion.unknown_sources`, reason `LOOP_NOT_REGISTERED`.

## 2. Parameter → canonical role (default `param_roles` config)

| OT param | Canonical role | Tuple field | Notes |
|---|---|---|---|
| `PV` | PROCESS_VALUE | `pv` | required member — tuple invalid downstream without it |
| `SP` | SETPOINT | `sp` | required member |
| `OP` | OUTPUT | `op` | required member |
| `MODE` | CONTROLLER_MODE | `mode` | numeric on the wire (`4.0`) → `mode_value_map` config → engine vocabulary (`AUT`, `CAS`, `MAN`…); unmapped ⇒ raw string + counter |
| `P` | extension (tuning) | `p` | semantics unconfirmed (likely proportional band %) — carried opaque |
| `I` | extension (tuning) | `i` | likely integral time s — carried opaque |
| `D` | extension (tuning) | `d` | likely derivative time s — carried opaque |
| `GW` | extension (tuning) | `gw` | **unresolved** (candidate: Yokogawa gap width) — carried opaque |
| anything else | — | — | DLQ `UNKNOWN_PARAMETER` + inventory |

There is no VP in this feed → valve diagnostics report `INSUFFICIENT_EVIDENCE`, overall confidence capped at 0.89 (engine behavior, by design). If the site later wires positioner feedback, map it to role `vp` in config — no code change.

## 3. Payload fields

| Payload field | Canonical use | Authority |
|---|---|---|
| `value` | the measurement (number; MODE numeric accepted) | OT |
| `unit` | preserved as source unit; compared to registry/asset EU ⇒ `UNIT_MISMATCH` warning | OT (source), registry (canonical) |
| `quality` | `GOOD`/`UNCERTAIN`/`BAD` → member quality; UNCERTAIN counts as not-good (engine rule) | OT — preserved, never coerced |
| `ts` | ISO-8601 → epoch ms; member freshness + staleness; unparseable/future ⇒ DLQ | OT |
| `source` | `opc_ua` — carried in DLQ envelope | OT |
| `seq` | always 0 observed — preserved in DLQ envelope only, NOT used for dedup | OT |
| `device`, `equipment`, `area`, `site`, `item`, `line`, `process_unit`, `enterprise` | identity cross-checks (§1); never used for placement | validation only |

## 4. Enriched Kafka event (topic `traverse.cpa.loop.samples.v1`, key = `loop_id`)

One tuple per registered loop per grid tick (default 5 s), `event_ts_ms` = tick time:

```jsonc
{
  // ── contract fields read by Flink CplmNormalizedSample + RawLoopIotDbConsumer ──
  "loop_id":     "FIC10302",       // registry casing, = Kafka key
  "event_ts_ms": 1756600000000,    // grid tick (event time; keeps watermark discipline)
  "pv": -0.236, "sp": 63.0, "op": 33.95,  // forward-filled last-known values
  "mode":     "AUT",               // via mode_value_map; raw string if unmapped
  "quality":  "GOOD",              // worst-of members; stale required member ⇒ "BAD"
  "loop_type": "FIC",              // ← loop_registry.loop_type

  // ── enrichment extensions (ignored by today's consumers, kept for analytics) ──
  "site": "hdpe", "area": "section_100", "unit": "u1001_polymerization_reactor_1",
                                   // ← loop_registry.site/area/unit (plant placement)
  "asset_uuid": "…",               // ← loop_registry.asset_id (when set)
  "p": 300.0, "i": 240.0, "d": 0.0, "gw": 0.0,   // tuning extensions, forward-filled
  "source_fcs": "FCS0101"          // ← topic level 3 (traceability)
}
```

## 5. DLQ envelope (topic `traverse.ingestion.ot-dlq`, key = loop tag or topic)

```json
{ "reason": "LOOP_NOT_REGISTERED", "config_id": "…", "mqtt_topic": "OT/HDPE/…/PV",
  "payload": "<raw message json>", "received_at_ms": 1756600000000, "detail": "…" }
```

Reasons: `MALFORMED_JSON`, `MISSING_FIELD`, `BAD_TIMESTAMP`, `FUTURE_TIMESTAMP`, `TOPIC_SHAPE_MISMATCH`, `LOOP_IDENTITY_MISMATCH`, `PARAMETER_MISMATCH`, `LOOP_NOT_REGISTERED`, `UNKNOWN_PARAMETER`. The `-dlq` suffix keys the existing Prometheus alert and `scripts/replay-kafka-dlq.ps1`.

## 6. Delivery settings

| Hop | Setting |
|---|---|
| MQTT subscribe | QoS 1 (config), persistent session (`clean_session=false`, `session_expiry_seconds=86400`), stable client id `ingestion-<config_id>` |
| Kafka produce | `acks=all`, idempotent producer, lz4, linger 5 ms — pre-created topics only (broker auto-create is off) |
| End-to-end | at-least-once; downstream tolerates duplicates (IoTDB ts-upsert, window dupes benign) |
