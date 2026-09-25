# Ingestion service v2.5 — OT and Instrumental input contract

Source of truth: `src/services/ingestion-service` (`Pipeline/*`, `Health/*`, `Models/*`),
`contracts/instrumental-health/v1/*.schema.json`, consumers `src/flink/.../cplm/CplmNormalizedSample.java`,
`TupleCodec.java`, `cplm/health/HealthObservation.java`. Verified 2026-09-23.

---

## 1. Control-loop signals (profile `MQTT_LOOP_SAMPLES`)

### 1.1 Data source (Administration → Data Sources, `ingestion.data_source_configs`)

| Field | Value |
|---|---|
| `source_type` | `MQTT` |
| `profile_type` | `MQTT_LOOP_SAMPLES` |
| `connection_url` | `mqtt://host:1883` or `mqtts://host:8883` (scheme + host, optional port, no path) |
| `username` / `password` | required; password stored encrypted, never returned |
| `profile_config.mqtt.topics[]` | subscription filters; default `OT/+/+/+/+/PIDParams/+` |
| `profile_config.mqtt.qos` | 0 / 1 / 2 (use 1) |
| `profile_config.mqtt.client_id` | `[A-Za-z0-9_-]{1,64}`; blank → `ingestion-<config_id>` |
| `profile_config.mqtt.clean_session` | default `false` |
| `profile_config.mqtt.session_expiry_seconds` | default `86400` |
| `profile_config.mqtt.keepalive_seconds` | > 0 |
| `profile_config.mqtt.tls` | `ca_cert_pem` (inline PEM, ≤ 64 KB, no private key) **or** `ca_cert_path`, optional `servername`; mutually exclusive with `insecure_skip_verify` |

`profile_config.loop_ingest`:

| Field | Default | Rule |
|---|---|---|
| `topic_template` | `{ns}/{site}/{fcs}/{class}/{loop}/{group}/{param}` | `/`-separated; must capture `{site}` `{fcs}` `{loop}` `{param}`; `{class}` optional; literal levels must match exactly (case-sensitive); level count must equal the topic's |
| `grid_seconds` | `5` | emission cadence per loop |
| `future_skew_max_seconds` | `300` | `ts` later than `now + skew` → DLQ `FUTURE_TIMESTAMP` |
| `param_roles` | see §1.3 | OVERLAY on the built-in map: `{"POS":"vp"}` adds, `{"GW":null}` removes; roles lowercase `[a-z0-9_]`; may not be `loop_id event_ts_ms ingest_ts_ms quality loop_type site area unit asset_uuid source_fcs`; effective map must still contain `pv` `sp` `op` `mode` (save refused otherwise) |
| `mode_value_map` | `{}` | numeric MODE → engine token, e.g. `{"1":"AUT","2":"MAN","3":"CAS","4":"IMAN"}` (CENTUM); unmapped values pass through raw and are counted NOT auto |
| `quality_protocol` | `STRING_ENUM` | `STRING_ENUM` \| `OPC_DA` \| `OPC_UA` \| `SPARKPLUG` \| `NONE`; plant tool `scripts/set-quality-protocol.py --apply` |
| `registry_refresh_seconds` | `60` | loop registry re-read (`GET /api/v1/cpm/loops`, service key) |

`binding_revision` = FNV-1a 63-bit of (effective `param_roles` + `mode_value_map` + `quality_protocol`); changes only when the binding changes.

### 1.2 MQTT topic

```
OT/{site}/{fcs}/{class}/{loop}/PIDParams/{param}
OT/HDPE/FCS0101/Flow/FIC10302/PIDParams/PV
```

| Level | Capture | Used for |
|---|---|---|
| 2 `HDPE` | `site` | cross-check with `payload.site`; not the registry site (`hdpe` slug) |
| 3 `FCS0101` | `fcs` | cross-check with `payload.area`; emitted as `source_fcs` |
| 4 `Flow` | `class` | warn-only against `payload.line` / `payload.process_unit` (metric `ClassMismatchWarning`) |
| 5 `FIC10302` | `loop` | case-insensitive lookup in `cpm.loop_registry.loop_id` (active loops only); emitted with registry casing |
| 7 `PV` | `param` | `param_roles` key (case-insensitive) |

### 1.3 Parameters (built-in `param_roles`)

| OT leaf | Role | Tuple field | Requirement |
|---|---|---|---|
| `PV` | `pv` | `pv` | required — no tuple without it |
| `SP` or `SV` | `sp` | `sp` | required |
| `OP` or `MV` | `op` | `op` | required |
| `MODE` | `mode` | `mode` | required for analysis (missing → `"UNKNOWN"` → G1 excludes every window) |
| `VP` | `vp` | `vp` | optional; positioner feedback for G14; absent from the tuple when never published |
| `P` `I` `D` `GW` | `p` `i` `d` `gw` | extension numbers | optional, carried opaque |
| any other leaf | — | — | DLQ `UNKNOWN_PARAMETER` + parking inventory |

Numeric roles require a numeric `value` (number, `true`/`false` → 1/0, or numeric string); a non-numeric value on a numeric role → DLQ `MISSING_FIELD`. MODE accepts a number or a string.

### 1.4 Payload (one JSON object per parameter message)

```json
{ "value": 60.4, "unit": "t/h", "quality": "GOOD",
  "ts": "2026-09-17T06:52:44.761Z", "source": "opc_ua", "seq": 0,
  "device": "FIC10302", "area": "FCS0101", "line": "Flow", "site": "HDPE",
  "process_unit": "Flow", "equipment": "FIC10302", "item": "PV", "enterprise": "" }
```

| Field | Required | Parse rule |
|---|---|---|
| `value` | yes | number / bool / numeric string → double; `NaN`, `±Infinity`, overflow → DLQ `NON_FINITE`; non-numeric string kept as `RawValue` (MODE only) |
| `ts` | yes | integer epoch **ms**, or ISO-8601 string (UTC assumed when no zone) → epoch ms; unparseable → `BAD_TIMESTAMP`; `> now + future_skew_max_seconds` → `FUTURE_TIMESTAMP` |
| `quality` | no | native token kept verbatim (string, or number as digits); decoded under `quality_protocol` (§1.5); absent → `UNKNOWN` (`QUALITY_MISSING`), never GOOD |
| `unit` | no | carried into `roles.<role>.unit` |
| `seq` | no | integer, DLQ envelope only, not used for dedupe |
| `source` | no | informational |
| `site` | no | if present must equal topic `site` (case-insensitive) else `LOOP_IDENTITY_MISMATCH` |
| `area` | no | must equal topic `fcs` else `LOOP_IDENTITY_MISMATCH` |
| `device`, `equipment` | no | must equal topic `loop` else `LOOP_IDENTITY_MISMATCH` |
| `item` | no | must equal topic `param` else `PARAMETER_MISMATCH` |
| `line`, `process_unit` | no | warn-only against topic `class` |
| `enterprise` | no | ignored |

Payload not a JSON object → `MALFORMED_JSON`. Absent identity fields pass.

MODE resolution: integral numeric → key `"4"`; otherwise the raw string trimmed of quotes; looked up in `mode_value_map`, unmapped → the key itself. Engine vocabulary — auto: `AUTO AUT A AUTOMATIC NORMAL NORM CAS CASC CASCADE RSP DDC SUP SUPERVISORY` (or contains `AUTO`/`CASCADE`); manual: `MAN MANUAL M IMAN ROUT LO LOCAL OFF TRACK`. Anything else counts NOT auto (warning `ModeUnrecognised`).

### 1.5 Quality decoding (`QualityDecoder`)

| `quality_protocol` | Native token | GOOD | UNCERTAIN | BAD | UNKNOWN (reason) |
|---|---|---|---|---|---|
| `STRING_ENUM` | string, case-insensitive | `GOOD` | `UNCERTAIN` | `BAD` | any other string (`NOT_IN_STRING_VOCABULARY`); a number (`NUMERIC_UNDER_STRING_ENUM`) |
| `OPC_DA` | integer 0–255 | bits 7-6 = `11` | `01` | `00` | `10` (`RESERVED_OPC_DA_QUALITY`); non-integer; out of range |
| `OPC_UA` | integer 0–0xFFFFFFFF | bits 31-30 = `00` | `01` | `10`/`11` | non-integer; out of range |
| `SPARKPLUG` | integer | `192` | `500` (STALE) | `0` | other code (`UNKNOWN_SPARKPLUG_CODE`) |
| `NONE` | anything | — | — | — | always (`PROTOCOL_NONE`) |

Missing/blank token → `UNKNOWN` (`QUALITY_MISSING`) under every protocol. Tuple `quality` = worst of pv/sp/op (`BAD > UNCERTAIN > UNKNOWN > GOOD`); vp and mode carry their own verdict in `roles{}` only. The engine treats only `GOOD` as good.

### 1.6 Processing order per message

1. topic vs `topic_template` → `TOPIC_SHAPE_MISMATCH`
2. payload parse → `MALFORMED_JSON` / `MISSING_FIELD` / `NON_FINITE` / `BAD_TIMESTAMP` / `FUTURE_TIMESTAMP`
3. identity cross-check → `LOOP_IDENTITY_MISMATCH` / `PARAMETER_MISMATCH`
4. registry lookup (active loop) → `LOOP_NOT_REGISTERED` (+ `ingestion.unknown_sources`, key `site|fcs|loop`)
5. `param_roles` → `UNKNOWN_PARAMETER` (+ inventory, key `loop|param`) / `MISSING_FIELD` (non-numeric on numeric role)
6. joiner: last-known value per (loop, role) with source `ts`, decoded quality, native token, unit; MODE token + native + quality

Grid tick (every second, per loop at its `grid_seconds` boundary): emit only when `pv`, `sp`, `op` all seen; `event_ts_ms` = newest source `ts` among pv/sp/op/vp/mode; tick skipped when that timestamp did not advance since the last emission (no re-stamping, no catch-up). Last-known values persist to `ingestion.loop_state` every 60 s and on first-seen roles, restored on restart (restored members report `quality_protocol: "RESTORED"`, quality GOOD/BAD from the stored flag).

### 1.7 Output — Kafka `traverse.cpa.loop.samples.v1` (16 partitions, 1 d, lz4; key = `loop_id`)

```json
{ "loop_id": "FIC10302", "event_ts_ms": 1789627964761, "ingest_ts_ms": 1789627965003,
  "pv": 182.08, "sp": 182.0, "op": 33.46, "vp": 41.2, "mode": "AUT", "quality": "GOOD",
  "loop_type": "FIC", "site": "hdpe", "area": "section_100", "unit": "u1001", "asset_uuid": "…",
  "source_fcs": "FCS0101", "p": 300.0, "i": 240.0, "d": 0.0, "gw": 0.0,
  "schema_version": "1.1", "binding_revision": 3386766494735662605, "grid_seconds": 5,
  "roles": {
    "pv":   { "value": 182.08, "sample_ts_ms": 1789627964761, "verified_ts_ms": 1789627964761,
              "quality_native": "GOOD", "quality_protocol": "STRING_ENUM", "quality": "GOOD",
              "unit": "t/h", "held": false, "age_ms": 0 },
    "sp":   { "…": "same shape" },
    "op":   { "…": "same shape" },
    "vp":   { "value": 41.2, "sample_ts_ms": 1789627871761, "verified_ts_ms": 1789627871761,
              "quality_native": "GOOD", "quality_protocol": "STRING_ENUM", "quality": "GOOD",
              "held": true, "age_ms": 93000 },
    "mode": { "value": "AUT", "mode_native": "1", "sample_ts_ms": 1789627900000, "verified_ts_ms": 1789627900000,
              "quality_native": "GOOD", "quality_protocol": "STRING_ENUM", "quality": "GOOD",
              "held": true, "age_ms": 64761 }
  } }
```

| Field | Origin |
|---|---|
| `loop_id` | registry casing |
| `event_ts_ms` | newest member source `ts` (process time) |
| `ingest_ts_ms` | wall clock at emission |
| `pv` `sp` `op` | last-known values (forward-filled) |
| `vp` | present only if a `vp` role was ever received |
| `mode` | mapped token or `"UNKNOWN"` |
| `quality` | worst-of pv/sp/op |
| `loop_type` `site` `area` `unit` `asset_uuid` | `cpm.loop_registry` |
| `source_fcs` | topic level `fcs` |
| extension numbers | every mapped non-tuple role (`p` `i` `d` `gw` …) |
| `roles.<r>.held` | value not advanced since the previous emission |
| `roles.<r>.age_ms` | `event_ts_ms − sample_ts_ms` |
| `roles.vp` | `null` when no VP |

Consumer requirements (Flink `CplmNormalizedSample`): `loop_id`, `event_ts_ms`, finite numeric `pv` `sp` `op` (else `MISSING_REQUIRED_ROLE` / `NON_FINITE`, tuple dropped); `vp` optional and only used as evidence when `roles.vp.quality == GOOD` and not (`held` and `age_ms > 60 000`); `quality` must be exactly `GOOD` to pass G0; `mode` must be in the auto vocabulary for G1. Tuples without `roles{}` are read as schema 1.0 with synthesised roles.

### 1.8 Dead letters — Kafka `traverse.ingestion.ot-dlq` (2 partitions, 7 d; key = loop tag, `site|fcs|loop`, `loop|param` or topic)

```json
{ "reason": "LOOP_NOT_REGISTERED", "config_id": "…", "mqtt_topic": "OT/HDPE/FCS0101/Flow/FIC99999/PIDParams/PV",
  "payload": "{…raw message…}", "received_at_ms": 1789627964761, "detail": "…" }
```

Reasons: `MALFORMED_JSON` `MISSING_FIELD` `NON_FINITE` `BAD_TIMESTAMP` `FUTURE_TIMESTAMP` `TOPIC_SHAPE_MISMATCH` `LOOP_IDENTITY_MISMATCH` `PARAMETER_MISMATCH` `LOOP_NOT_REGISTERED` `UNKNOWN_PARAMETER`. Non-JSON payloads are wrapped as `{"raw": "…"}`.

### 1.9 Delivery

MQTT: QoS 1, persistent session (`clean_session=false`, `session_expiry_seconds=86400`), stable client id, auto-reconnect 5 s, bounded channel 10 000 (backpressure to the broker). Kafka: `acks=all`, idempotent, lz4, linger 5 ms, retry forever on tuples (backpressure), DLQ publish failure counted not fatal. Topics pre-created (broker auto-create off).

### 1.10 Checks

| Check | Where |
|---|---|
| subscriber state, received / emitted / parked / dead-lettered counters | `GET /api/ingestion/stats` |
| per-loop `flowing` / `idle` / `held` (missing roles) / `silent` | `GET /api/ingestion/loop-health?state=held` |
| parked sources (unregistered loops, unknown parameters) | `GET /api/ingestion/unknown-sources` |
| restart a subscriber after a config change | `POST /api/ingestion/data-sources/{id}/reload` |

---

## 2. Instrumental NE107 transmitter health (profile `INSTRUMENTAL_HEALTH`)

### 2.1 Data source

`profile_config.mqtt` as §1.1 (QoS 1 forced on subscribe). `profile_config.instrumental_health`:

| Field | Default | Rule |
|---|---|---|
| `topic_prefix` | `traverse/instrumental/v1` | trailing `/` trimmed |
| `tenant_id` | — | required, `^[A-Za-z0-9][A-Za-z0-9._:-]*$` |
| `site_id` | — | required, same pattern |
| `allowed_source_ids[]` | — | required, ≥ 1; a `source_id` outside the list → DLQ `SOURCE_NOT_ALLOWED` |
| `max_skew_seconds` | `86400` | `|published_at − received_at|` limit → `TIMESTAMP_SKEW` |
| `max_message_bytes` | `65536` | → `TOO_LARGE` |

The subscriber subscribes only to its own scope:

```
{prefix}/{tenant_id}/{site_id}/devices/+/state
{prefix}/{tenant_id}/{site_id}/devices/+/events
{prefix}/{tenant_id}/{site_id}/sources/+/availability
```

### 2.2 Topics

| Topic | QoS | Retained | `message_kind` |
|---|---|---|---|
| `traverse/instrumental/v1/{tenant_id}/{site_id}/devices/{device_id}/state` | 1 | yes | `STATE_SNAPSHOT` |
| `traverse/instrumental/v1/{tenant_id}/{site_id}/devices/{device_id}/events` | 1 | no | `STATE_EVENT` |
| `traverse/instrumental/v1/{tenant_id}/{site_id}/sources/{source_id}/availability` | 1 | yes (+ last-will `OFFLINE`) | `SOURCE_AVAILABILITY` |

Exactly 5 levels after the prefix; empty level or other shape → `TOPIC_SHAPE`.

### 2.3 Payload — `STATE_SNAPSHOT` (`state.schema.json`, `additionalProperties: false`)

Required: `schema_version` `message_kind` `observation_id` `tenant_id` `site_id` `producer_id` `producer_epoch` `sequence` `source_id` `device_id` `observed_at` `verified_at` `published_at` `state_revision` `state_complete` `verification_kind` `state`. Optional: `installation_id` `scan_interval_s` `mapping_version`.

```json
{ "schema_version": "1.0", "message_kind": "STATE_SNAPSHOT",
  "observation_id": "obs-5c1d…", "tenant_id": "default", "site_id": "hdpe",
  "producer_id": "instr-prm-1", "producer_epoch": 3, "sequence": 118,
  "source_id": "instr-prm-1", "device_id": "TT-10302", "installation_id": "inst-1",
  "observed_at": "2026-09-17T06:50:00.000Z", "verified_at": "2026-09-17T06:52:00.000Z",
  "published_at": "2026-09-17T06:52:01.250Z",
  "state_revision": 42, "state_complete": true, "verification_kind": "UPSTREAM_DATABASE_POLL",
  "scan_interval_s": 30.0, "mapping_version": "prm-map-2",
  "state": {
    "active_flags": ["F"], "native_status": "Failure",
    "primary_flag": "F", "primary_flag_policy_version": "prm-primary-1",
    "collection_state": "VERIFIED", "measurement_impact": "INVALID",
    "diagnostics": [
      { "diagnostic_id": "occ-F-0001", "native_code": "F210", "native_category": "Failure",
        "message": "Sensor element failure", "flags": ["F"],
        "affected_variable_ids": ["FIC10302.PV"], "measurement_impact": "INVALID",
        "first_observed_at": "2026-09-17T06:50:00.000Z", "last_observed_at": "2026-09-17T06:52:00.000Z",
        "cause": "Open circuit on the measuring cell", "remedy": "Replace the sensor element",
        "source_record_ref": "prm://instrumental/occurrences/occ-F-0001",
        "source_acknowledgement": { "acknowledged": false },
        "source_shelving": { "shelved": false } } ] } }
```

| Field | Type / rule |
|---|---|
| `schema_version` | const `"1.0"` else `UNSUPPORTED_VERSION` |
| `message_kind` | must match the topic kind else `KIND_MISMATCH` |
| ids (`observation_id` `tenant_id` `site_id` `producer_id` `source_id` `device_id` `installation_id` `diagnostic_id` `affected_variable_ids[]`) | `^[A-Za-z0-9][A-Za-z0-9._:-]*$`, 1–128 chars |
| `tenant_id` `site_id` | must equal the topic captures and the data source's configured scope else `IDENTITY_MISMATCH` |
| `device_id` (state/events), `source_id` (availability) | must equal the topic capture else `IDENTITY_MISMATCH` |
| `source_id` | must be in `allowed_source_ids` else `SOURCE_NOT_ALLOWED` |
| `producer_epoch` `sequence` `state_revision` | integer ≥ 0; `sequence` monotonic within (epoch, device) |
| timestamps | `YYYY-MM-DDTHH:MM:SS[.ffffff](Z|±HH:MM)`; `observed_at` = state observed at source, `verified_at` = last successful verification (may be old), `published_at` within `max_skew_seconds` of receipt |
| `state_complete` | `true` only when the whole state was verified; then empty `active_flags` = `NO_ACTIVE_DIAGNOSTIC` |
| `verification_kind` | `DEVICE_DIRECT` \| `UPSTREAM_DATABASE_POLL` |
| `scan_interval_s` | number 0 < x ≤ 86400; freshness expiry = `max(3 × scan_interval_s, 120 s)` |
| `state.active_flags` | unique subset of `F` `C` `S` `M`, max 4 |
| `state.native_status` | string ≤ 256 |
| `state.primary_flag` / `primary_flag_policy_version` | optional display choice, never a CPA severity |
| `state.collection_state` | `VERIFIED` \| `STALE` \| `UNKNOWN` \| `OFFLINE` |
| `state.measurement_impact` | `VALID` \| `INVALID` \| `DEGRADED` \| `UNKNOWN` |
| `state.diagnostics[]` | ≤ 64; each requires `diagnostic_id` `native_code` (1–64) `message` (≤ 1024) `flags` (1–4 unique) `affected_variable_ids` (≤ 32; empty = whole device) `measurement_impact` `first_observed_at` `cause` (≤ 1024) `remedy` (≤ 1024) `source_record_ref` (≤ 512); optional `native_category` (≤ 128) `last_observed_at` `source_acknowledgement{acknowledged, by?, at?}` `source_shelving{shelved, until?, by?}` |

Aliases (`first_seen`, `code`, …) and any unknown property → `SCHEMA_INVALID`.

### 2.4 Payload — `STATE_EVENT` (`event.schema.json`)

Everything in §2.3 plus required `event_id`, `change_kind` (`DIAGNOSTIC_RAISED` \| `DIAGNOSTIC_UPDATED` \| `DIAGNOSTIC_CLEARED` \| `STATE_RESYNC` \| `LATE_CORRECTION`), `diagnostic_ids[]` (≤ 64, empty for a resync); optional `corrects_observation_id` (LATE_CORRECTION). Carries the same full post-`state`. Each event has its own fresh `observation_id`.

```json
{ "schema_version": "1.0", "message_kind": "STATE_EVENT", "event_id": "evt-9a2f…",
  "observation_id": "obs-7d0b…", "tenant_id": "default", "site_id": "hdpe",
  "producer_id": "instr-prm-1", "producer_epoch": 3, "sequence": 119,
  "source_id": "instr-prm-1", "device_id": "TT-10302", "installation_id": "inst-1",
  "observed_at": "2026-09-17T06:50:00.000Z", "verified_at": "2026-09-17T06:52:00.000Z",
  "published_at": "2026-09-17T06:52:01.400Z", "state_revision": 43, "state_complete": true,
  "verification_kind": "UPSTREAM_DATABASE_POLL", "scan_interval_s": 30.0,
  "change_kind": "DIAGNOSTIC_RAISED", "diagnostic_ids": ["occ-F-0001"],
  "state": { "…": "same object as the snapshot" } }
```

### 2.5 Payload — `SOURCE_AVAILABILITY` (`availability.schema.json`)

Required: `schema_version` `message_kind` `tenant_id` `site_id` `source_id` `producer_id` `producer_epoch` `state` (`ONLINE` \| `OFFLINE` \| `DEGRADED`) `since` `published_at`. Optional: `last_will` (bool, true when the broker published it), `scan_interval_s`, `expected_collection_latency_s` (0–86400).

```json
{ "schema_version": "1.0", "message_kind": "SOURCE_AVAILABILITY",
  "tenant_id": "default", "site_id": "hdpe", "source_id": "instr-prm-1",
  "producer_id": "instr-prm-1", "producer_epoch": 3,
  "state": "ONLINE", "since": "2026-09-17T06:00:00.000Z", "published_at": "2026-09-17T06:52:01.000Z",
  "last_will": false, "scan_interval_s": 30.0, "expected_collection_latency_s": 5.0 }
```

Last-will registration: same topic, retained, payload with `state: "OFFLINE"`, `last_will: true`.

### 2.6 Processing order per message

1. topic shape → `TOPIC_SHAPE`
2. size → `TOO_LARGE`; JSON object → `NOT_JSON`; `schema_version` → `UNSUPPORTED_VERSION`; `message_kind` vs topic → `KIND_MISMATCH`; JSON-schema → `SCHEMA_INVALID`
3. identity → `IDENTITY_MISMATCH`; allow-list → `SOURCE_NOT_ALLOWED`; transport clock → `TIMESTAMP_SKEW`
4. state/events only — dedupe key `tenant|site|source|observation_id` with SHA-256 of the canonical JSON (sorted keys, compact): same id + same hash → dropped as duplicate; same id + different payload → `INTEGRITY_CONFLICT`
5. state/events only — epoch discipline per `tenant|site|device`: first message of a device or of a higher `producer_epoch` must be a `STATE_SNAPSHOT` with `state_complete: true`, otherwise parked → `EPOCH_WITHOUT_SNAPSHOT` (replayable); lower epoch → forwarded flagged `STALE_EPOCH`; `sequence ≤ last` → forwarded flagged `SEQUENCE_REGRESSION`
6. forward wrapped (§2.7)

Availability messages skip 4 and 5.

### 2.7 Output — Kafka `traverse.cpa.instrument.health.v1` (8 partitions, 30 d; key = `device_id`, availability key = `source_id`)

```json
{ "gateway": { "received_at": "2026-09-17T06:52:01.612Z",
               "topic": "traverse/instrumental/v1/default/hdpe/devices/TT-10302/state",
               "kind": "STATE", "mqtt_retained": true,
               "authenticated_producer": "<data-source MQTT username>",
               "config_id": "<data-source id>", "flags": [] },
  "observation": { "…the validated message verbatim…" } }
```

`gateway.kind`: `STATE` \| `EVENTS` \| `AVAILABILITY`. `gateway.flags`: `[]`, `["STALE_EPOCH"]` or `["SEQUENCE_REGRESSION"]`.

Consumer (Flink `CplmInstrumentContextJob` → compacted `traverse.cpa.context.instrument-health.v1`) reads: `gateway.received_at`, `gateway.flags`; `observation.tenant_id site_id source_id device_id message_kind observation_id producer_id producer_epoch sequence state_revision state_complete observed_at verified_at published_at scan_interval_s change_kind corrects_observation_id`; `state.active_flags native_status collection_state measurement_impact`; per diagnostic `diagnostic_id native_code flags affected_variable_ids measurement_impact first_observed_at`; availability `state`, `since`. Intervals close on a newer state, `FRESHNESS_EXPIRED` (`max(3 × scan_interval_s, 120 s)`, timer 60 s) or `SOURCE_OFFLINE`.

### 2.8 Dead letters — Kafka `traverse.ingestion.health-dlq` (2 partitions, 7 d; key = device_id / source_id / topic)

Same envelope as §1.8 (`payload` truncated to 2048 chars). Reasons: `TOPIC_SHAPE` `TOO_LARGE` `NOT_JSON` `UNSUPPORTED_VERSION` `SCHEMA_INVALID` `KIND_MISMATCH` `IDENTITY_MISMATCH` `SOURCE_NOT_ALLOWED` `TIMESTAMP_SKEW` `INTEGRITY_CONFLICT` `EPOCH_WITHOUT_SNAPSHOT` `KAFKA_FAILURE`.

### 2.9 Binding a device to a loop signal (CPA side, required before health reaches a loop)

`POST /api/v1/cpm/loops/{loopId}/instrument-bindings` (permission `cpm.context.manage`):

```json
{ "signalRole": "PV", "deviceId": "TT-10302", "installationId": "inst-1",
  "sourceId": "instr-prm-1", "validFrom": "2026-09-17T00:00:00Z", "note": "…" }
```

`GET /api/v1/cpm/loops/{loopId}/instrument-bindings`, `…/history`. `affected_variable_ids` in diagnostics use the loop signal id form `<loop_id>.<ROLE>` (lab: `FIC10302.PV`). Unbound loops read `NOT_CONFIGURED`.

### 2.10 Limits

Message ≤ 64 KiB; ≤ 64 diagnostics; ≤ 32 affected variables per diagnostic; ids ≤ 128 chars; `published_at` within 24 h of receipt; `observed_at` / `verified_at` unbounded (old retained snapshots are valid, stale).

---

## 3. Kafka topics (`migration/kafka/topics.txt`)

| Topic | Partitions | Cleanup | Retention | Compression | Producer |
|---|---|---|---|---|---|
| `traverse.cpa.loop.samples.v1` | 16 | delete | 1 d | lz4 | ingestion (loop subscriber) |
| `traverse.ingestion.ot-dlq` | 2 | delete | 7 d | — | ingestion (loop subscriber) |
| `traverse.cpa.instrument.health.v1` | 8 | delete | 30 d | — | ingestion (health subscriber) |
| `traverse.ingestion.health-dlq` | 2 | delete | 7 d | — | ingestion (health subscriber) |
| `traverse.cpa.context.instrument-health.v1` | 8 | compact | — | — | Flink instrument-context job |

Ingestion service config keys: `Kafka:BootstrapServers` (empty = publishing disabled), `Kafka:LoopSamplesTopic`, `Kafka:OtDlqTopic`, `Kafka:InstrumentHealthTopic`, `Kafka:HealthDlqTopic`, `Services:CplmApi`, `Auth:ServiceKey`.
