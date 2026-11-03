# MQTT data-source configuration and ingestion: reference for the PLA & Downtime monolith

**Audience:** engineers building MQTT event ingestion into the PLA & Downtime application.

**What this covers:** how AMS/CPA configures MQTT data sources from the UI, connects to brokers, and processes messages today. It records every rule, default and trap in that path. It then explains what Kafka and the microservice split do for us, and how to get the same guarantees in a single process with no Kafka.

**Status:** analysis of `feat/v25-next-release` as of 2026-10-11. Paths are relative to the repo root.

Two longer specifications already exist:
- [mqtt _feature_configuration _specification.md](mqtt%20_feature_configuration%20_specification.md) is the build spec for the configuration feature.
- [09-ot-mqtt-loop-mapping.md](09-ot-mqtt-loop-mapping.md) is the loop mapping contract.

This document is the condensed, code-verified version, plus the monolith translation.

---

## 0. Summary

1. **There is one service:** `src/services/ingestion-service` (.NET 8). It owns both data-source configuration (REST and Postgres) and the MQTT subscribers.
   - Keeping them together means decrypted broker passwords never cross the network.
   - For the monolith, this service is one module.
2. **A data source is one row** in `ingestion.data_source_configs`. It holds the broker URL, the credentials (AES-256-GCM encrypted) and a `profile_type`, plus a JSONB `profile_config` that holds everything else (topics, QoS, session, TLS, per-profile parsing rules).
3. **A profile is a code-defined entry** that says what the feed is for. It selects the payload parser and the destination.
   - Two profiles have running pipelines today: `MQTT_LOOP_SAMPLES` and `INSTRUMENTAL_HEALTH`.
   - Three are declared but have no subscriber: `MQTT_ALARMS`, `MQTT_TELEMETRY` and `MQTT_PRM`.
4. **A background host reconciles rows against running subscribers every 30 s.**
   - It uses a fingerprint of the material fields to decide whether a subscriber must restart.
   - Nothing is pushed on save; the host simply notices the change.
5. **Each subscriber works like this:**
   - It uses an MQTT 5 managed client: persistent session, stable client id, QoS 1, and a fixed 5 s reconnect.
   - Received messages go into a bounded in-memory channel of 10,000 entries.
   - **One** consumer task parses, validates and maps each message, then either emits it or dead-letters it.
6. **Kafka is only the output side.**
   - Good records go to a samples topic, bad ones to a DLQ topic, and audit events to an audit topic.
   - Downstream readers (Flink jobs, the IoTDB historian writer, cplm-api) read those topics.
   - In the monolith, Kafka is replaced by **Postgres tables plus in-process dispatch**. See §14 for what each Kafka job becomes.
7. **For PLA and Downtime events, copy the event-style pipeline (`INSTRUMENTAL_HEALTH`, §10), not the loop joiner (§9).**
   - The joiner resamples continuous process values onto a grid.
   - Downtime and PLA events are discrete facts that must be stored once, in order, and never merged.

---

## 1. The two MQTT planes (do not confuse them)

| Plane | Direction | Broker | Format | Who uses it |
|---|---|---|---|---|
| **Inbound OT** | OT gateway → us | Production: the plant's mosquitto `piarchiver-broker` (`mqtt://192.168.190.91:1883`, not ours). Lab: `mosquitto-test` (host port 1884) | One JSON object per message | `ingestion-service` subscribers. **This is what PLA and Downtime need.** |
| **Outbound live** | Us → browsers | Our EMQX 5.6 (`ams-emqx`) | Sparkplug B protobuf, `spBv1.0/...` | `sparkplug-edge-node` publishes and the browser `mqttStore.ts` subscribes over `/mqtt-ws` |

- The EMQX ACL (`infra/docker/emqx/acl.conf`) only allows `spBv1.0/#`, and everything else is denied.
- If PLA and Downtime events are published to *our* EMQX instead of the plant broker, add ACL rules for their topics and a dedicated publisher user.

---

## 2. End-to-end flow today

```
 Admin UI (React)                       ingestion-service (.NET 8, one process)
 ───────────────                        ──────────────────────────────────────────────────────────
 DataSourcesConfig ──REST /api/ingestion/*──► Program.cs endpoints ──► Postgres traverse_ingestion
 DataSourceWizard        (via gateway:            │  validate, encrypt,        ingestion.data_source_configs
 LoopIngestPanel          JWT → X-Auth-*)         │  409 duplicate guard, audit
                                                  ▼
                                       OtIngestionHostService (every 30 s: read active rows,
                                       fingerprint diff, park duplicates, start/stop subscribers)
                                                  │
 OT broker ──MQTT 5, QoS1, persistent──► OtLoopSubscriber / InstrumentalHealthSubscriber
                                         MQTTnet handler ─► Channel(10k, Wait) ─► 1 consumer task
                                           topic parse ─► payload parse ─► validate ─► map/dedupe
                                                  │ good                      │ bad
                                                  ▼                           ▼
                                       Kafka samples topic           Kafka DLQ topic
                                       (+ loop_state, unknown_sources and last_data_received in Postgres)
                                                  │
                         Flink CPLM jobs · ams-api RawLoopIotDbConsumer (IoTDB) · cplm-api mirrors
```

---

## 3. Data-source configuration

### 3.1 Table `ingestion.data_source_configs`

Defined in `database/scripts/46_ingestion_data_sources.sql`. The service also re-creates it at startup (`Program.cs` self-heal; see §3.10).

| Column | Type / default | Notes |
|---|---|---|
| `config_id` | UUID PK, `gen_random_uuid()` | |
| `source_type` | VARCHAR(50), default `'MQTT'`, CHECK `IN ('MQTT')` | |
| `profile_type` | VARCHAR(50) | Must be a key in `ProfileRegistry` (checked in the app, case-sensitive) |
| `name` | VARCHAR(255) NOT NULL | Not unique |
| `description` | TEXT | |
| `connection_url` | TEXT NOT NULL | `mqtt://host:1883` or `mqtts://host:8883` |
| `username` | VARCHAR(255) NOT NULL | Plaintext. Anonymous brokers are not supported |
| `password_encrypted` | TEXT NOT NULL | base64 AES-GCM blob (§3.5) |
| `timeout_seconds` | INT, default 30, CHECK > 0 | Connect timeout |
| `insecure_skip_verify` | BOOL, default false | TLS "do not verify" |
| `profile_config` | JSONB, default `{}` | Everything else (§3.2) |
| `is_active` | BOOL, default **true** | A new source is live from birth |
| `last_connection_test` / `_status` / `_error` | TIMESTAMPTZ / VARCHAR(20) CHECK SUCCESS/FAILED/PENDING / TEXT | Written by `POST /test`. PENDING is never used |
| `last_data_received` | TIMESTAMPTZ | Touched by the subscriber, at most every 30 s |
| `created_at/by`, `updated_at/by` | | `created_by` is the username from the auth claims |
| `version` | INT, default 1 | Bumped by trigger. **Not a config revision** (see trap T1) |

- Indexes: `is_active` and `profile_type`.
- A trigger, `touch_data_source_configs`, runs BEFORE UPDATE and sets `updated_at = NOW()` and `version = OLD.version + 1` on *every* update.

### 3.2 `profile_config` JSON (snake_case)

```jsonc
{
  "mqtt": {
    "topics": ["OT/HDPE/+/+/+/PIDParams/+"],   // required, ≥1 after trimming blanks
    "qos": 1,                                   // 0|1|2, runtime default 1
    "client_id": "traverse-ingestion-pidparams",// blank → "ingestion-<config_id>"
    "clean_session": false,                     // runtime default false (persistent)
    "session_expiry_seconds": 86400,            // runtime default 86400; MQTT 5 default 0 would discard the queue
    "keepalive_seconds": 60,                    // runtime default 60
    "tls": { "ca_cert_pem": "-----BEGIN CERTIFICATE-----…", "ca_cert_path": null, "servername": "mosquitto" }
  },
  "loop_ingest": { … },            // MQTT_LOOP_SAMPLES only (§9)
  "instrumental_health": { … }     // INSTRUMENTAL_HEALTH only (§10)
}
```

- Server parsing is defensive: null or malformed JSON becomes an empty object, never an exception.
- The TypeScript type has an index signature, so blocks the UI does not know about are carried through unchanged.

### 3.3 Profiles (`Services/ProfileRegistry.cs`)

Profiles are a static list in code; there is no table. The rule is: **a new payload shape means a new profile, never a change to the transport.**

| `profile_type` | Display / module | Default topics | Destination | Running pipeline |
|---|---|---|---|---|
| `MQTT_LOOP_SAMPLES` | Control-Loop Signals (CPM) | `OT/+/+/+/+/PIDParams/+` | `traverse.cpa.loop.samples.v1` | `OtLoopSubscriber` |
| `INSTRUMENTAL_HEALTH` | Transmitter Health NE107 (CPM) | derived from config | `traverse.cpa.instrument.health.v1` | `InstrumentalHealthSubscriber` |
| `MQTT_ALARMS` | Alarms & Events (CAMS) | `ot/alarms/#` | `traverse.alarm.raw-alarms` | none (the host logs "no subscriber pipeline for it yet" once) |
| `MQTT_TELEMETRY` | Process Telemetry | `ot/telemetry/#` | `traverse.live.metrics` | none |
| `MQTT_PRM` | PRM gateway | `prm/data/#` | `prm.diagnostics.v1` | none |

Each entry also has `transport: "MQTT"` and a description paragraph that the wizard shows. **For PLA and Downtime, add `MQTT_DOWNTIME_EVENTS` and `MQTT_PLA_EVENTS` entries here** (§15).

### 3.4 REST API

The gateway strips `/api/ingestion`, so the service sees the paths below. The permissions are `ingestion.view` and `ingestion.manage`; both are Admin-only, and SuperAdmin-only since CHG-081.

| Method / path | Permission | Behaviour |
|---|---|---|
| GET `/profiles` | view | The profile list |
| GET `/data-sources` | view | All rows ordered by name, as DTOs |
| GET `/data-sources/active` | view | Active rows only (no UI uses it) |
| GET `/data-sources/{id}` | view | DTO or 404 |
| POST `/data-sources` | manage | **Create**: validate → duplicate-feed check (409) → insert with encrypted password → audit `created` → 201 + `Location` |
| PUT `/data-sources/{id}` | manage | **Partial update**: a null field means keep. `password` null or `""` means keep. **`profileConfig`, when present, replaces the stored JSON wholesale.** Validates the merged result; the 409 check runs only if the row is active and a feed field changed. Audit `updated {passwordChanged}` |
| DELETE `/data-sources/{id}` | manage | Hard delete, 204. Does not cascade to `loop_state` or `unknown_sources` |
| POST `/data-sources/{id}/test` | manage | Connection test (§3.6). Always 200 `{ok, error, latencyMs, status}` |
| POST `/data-sources/{id}/activate` / `deactivate` | manage | Activate runs the 409 check only when the row was inactive. Deactivate is never blocked |
| POST `/data-sources/{id}/reload` | manage | Sets a reload flag, 202. Takes effect on the next reconcile, within 30 s |
| GET `/stats`, `/loop-health`, `/unknown-sources` | view | Runtime observability (§13). No UI uses them yet |
| GET `/health`, `/metrics` | anonymous | `/health` fails (503) only if Postgres is down. Broker state is informational |

The outbound DTO (`DataSourceDto`) has these properties:
- The secret never leaves the service: the DTO exposes `hasPassword` (bool), never the blob.
- `effectiveClientId` is computed in one place (`DeriveClientId`), so the UI and the subscriber always agree on it.
- Top-level fields are camelCase. Fields inside `profileConfig` stay snake_case.
- There is no optimistic concurrency: the last write wins.

### 3.5 Credentials (`Services/CredentialCipher.cs`)

- **Encryption:** AES-256-GCM, with a key derived by PBKDF2-SHA256 (100,000 iterations, 32 bytes) from the master key and a per-value 64-byte random salt.
  - Each value also has a 12-byte nonce and a 16-byte tag.
  - Stored as `base64(salt ‖ nonce ‖ tag ‖ ciphertext)`.
- **Master key:** env `ENCRYPTION_KEY` (compose: `INGESTION_ENCRYPTION_KEY`).
  - Outside Development, a key that is missing or shorter than 32 characters stops startup.
  - **Only the first 32 characters are used.**
  - Rotating the key orphans every stored password. Decryption then fails with "was ENCRYPTION_KEY rotated?", and that source never starts.
- **Where plaintext lives:** only in memory, in the tester and the subscriber. It never appears in logs, responses or audit records.
- **Editing:** the password field starts empty ("Leave blank to keep current password"). It is sent only if the user typed something.

### 3.6 Test connection (`Services/MqttConnectionTester.cs`)

1. The test runs on the **saved** row only, so the user must save first.
2. Decrypt the password. On failure, return FAILED with "Could not decrypt…".
3. Build the options with **the same `MqttClientOptionsFactory` the subscriber uses**, so TLS behaviour cannot differ between test and runtime.
4. Use a throwaway identity: client id `test-<epochms>`, clean session, expiry 0.
   - Reusing the live client id would make the broker evict the running subscriber.
   - A persistent test session would leave an orphan queue on the broker.
5. Connect with timeout `timeout_seconds` (default 30) + 1 s.
   - Only the CONNACK is checked. **It does not subscribe and does not check topic ACLs.**
   - A CONNACK other than Success returns "Broker refused connection: <code>", for example BadUserNameOrPassword.
6. Error text:
   - On cancellation: "Connection timed out after N ms".
   - For a TLS URL whose error mentions protocol, certificate or handshake, a SAN hint is appended: a bare "Protocol error" usually means the broker certificate does not list the host, so set `tls.servername`.
7. Persist `last_connection_*`, write the `tested` audit event, and return `{ok, error, latencyMs, status}`.

### 3.7 Validation (`Services/DataSourceValidation.cs`; the wizard mirrors it)

The first failing rule wins and is returned as `{error, field}` with status 400.

| Rule | Message (abridged) | Field |
|---|---|---|
| `sourceType` set and not MQTT | Only source_type 'MQTT' is supported | sourceType |
| Name blank, or longer than 255 | Name is required / ≤ 255 | name |
| Profile not registered | Unknown profile type | profileType |
| Username blank | Username is required | username |
| Password empty (**create only**) | Password is required | password |
| URL must match `^(mqtt\|mqtts)://[^\s/:]+(:\d{1,5})?$` | must look like mqtt://host:1883 or mqtts://host:8883 | connectionUrl |
| `timeoutSeconds ≤ 0` | Timeout must be > 0 | timeoutSeconds |
| `mqtt` block missing | profileConfig.mqtt is required | profileConfig |
| No topics after trimming | At least one topic filter is required | topics |
| `#` not the whole last level, or `+` not a whole level | Invalid topic filter | topics |
| QoS ∉ {0, 1, 2} | QoS must be 0, 1 or 2 | qos |
| Session expiry < 0; keepalive ≤ 0 | … | sessionExpirySeconds / keepaliveSeconds |
| `client_id` not `^[A-Za-z0-9_-]{1,64}$` | letters, digits, _ and - (max 64) | clientId |
| More than one TLS trust mode: PEM and path both set, or skip-verify plus a CA | either inline CA or path, not both / verification disabled — remove the CA | tls |
| PEM over 64 KB, missing `BEGIN CERTIFICATE`, or containing `PRIVATE KEY` | wrong file / not PEM / never upload a key | tls |
| Profile-specific blocks | §9 (`loop_ingest`), §10 (`instrumental_health`) | `<block>.<field>` |

- The cleaned topic list (trimmed, blanks removed) is what gets persisted.
- **Inconsistency to fix in a re-implementation:** the URL rule rejects `ssl://`, but the options factory and the wizard accept it.

### 3.8 Duplicate-feed guard (CHG-062, `Services/LoopSourceConflicts.cs`)

- **The incident:** six leftover end-to-end test sources on the same broker delivered every sample 6×.
- **The rule** (loop profiles only):
  - Two active sources conflict when they have the same normalised endpoint (`scheme://host:port`, default port 1883, or 8883 for TLS).
  - **and** either any topic filters overlap (compared level by level, where `+` matches one level and `#` matches the rest), or their effective client ids are equal.
- **Enforcement:**
  - **REST:** create, activate-from-inactive, and a feed-changing PUT on an active row all return **409** "overlaps active source '<name>'".
  - **Runtime:** the oldest source (`created_at`, then `config_id`) wins and the others are **parked** with the status error "duplicate feed: overlaps '<winner>'". Parked sources are re-checked every cycle.
  - Two sources on the same broker whose filters do not overlap only produce a log warning.

**For the monolith:** apply the same guard to event profiles. A duplicated downtime feed doubles every stop event, which is worse than a duplicated sample.

### 3.9 Frontend (`src/frontend-ob/src/components/Administration/`)

- **Gating:**
  - The "Data Sources" tab (`/admin/data-sources`) needs `ingestion.view`.
  - `canManage = ingestion.manage` shows "+ New Configuration", Test, Edit, On/Off, Delete and the MODE-map editor.
- **`dataSourcesApi.ts`:** a thin axios layer with `BASE = '/api/ingestion'`. It mirrors the server's URL and topic-filter rules for instant feedback.
- **`DataSourcesConfig.tsx`, the list page:**
  - It loads `/data-sources` and `/profiles` in parallel.
  - Each source is a card with these facts: status, profile, first topic, URL, username, "feeds module · destination", QoS/keepalive, timeout, last test (✓/✗ and time), and last data received.
  - Actions run through one `runAction` that shows a page-level error banner. A 409 message appears there.
  - Delete uses an inline confirmation: "Delete '<name>' and its stored credentials?".
  - There is no polling.
- **`DataSourceWizard.tsx`, four steps:**

  | Step | Content | Notes |
  |---|---|---|
  | 0. Profile | Select, description, transport, and a "data routing" box (topics → parser → destination → module) | Changing the profile in *create* mode replaces the topics with that profile's defaults |
  | 1. Basic | Name (required), description | |
  | 2. Connection | Broker URL, username, password | Password required on create only |
  | 3. Advanced | Topics, QoS (1 recommended), client id, session expiry, keepalive, clean session, TLS, timeout | See below |

  - On step 3, the client id placeholder shows the effective id, and the clean-session checkbox carries the advice "Leave OFF".
  - The TLS block appears only for `mqtts://` URLs. It offers three exclusive modes:
    - **Upload CA**: the PEM is checked on the client, and the default.
    - **CA path on the server**: the path must exist inside the container.
    - **Do not verify**: shown in red, for testing only.
  - Each step validates live and disables "Next" while it has an error. Server errors show as "message (field)".
  - **Save body:** `profileConfig: { ...existing.profileConfig, mqtt: {...} }`. Spreading the stored object is mandatory, because PUT replaces the whole JSON (trap T2).
  - There is no automatic test after save.
- **`LoopIngestPanel.tsx`** (loop profile only):
  - It shows the effective `loop_ingest` settings read-only.
  - It edits **only** `mode_value_map`. It shows a live AUTO/MANUAL classification for each row and offers a "Yokogawa CENTUM preset".
  - Saving does a read-modify-write of the whole `profile_config`.
  - `param_roles` is API-only on purpose.

### 3.10 Schema self-heal

- At startup the service creates the database if it is missing, then runs all DDL idempotently: 10 attempts, 3 s apart, and on final failure it logs and carries on.
- **Why:** Postgres init scripts only run on an empty volume.
- **Cost:** the DDL exists twice, in the SQL scripts and in `Program.cs`, and must be kept in sync by hand. In the monolith, use one migration tool instead.

---

## 4. Runtime host: reconcile loop (`Pipeline/OtIngestionHostService.cs`)

- **Startup:** a `BackgroundService` that waits 3 s (so the schema self-heal can finish), reconciles once, then reconciles every **30 s**. A reconcile error is logged and the loop continues.
- **Each reconcile cycle:**
  1. Read the active rows and keep those whose profile has a pipeline.
  2. Stop subscribers whose row was deleted or deactivated.
  3. Resolve duplicate-feed losers (§3.8) and park them.
  4. For each wanted row, compute the **fingerprint**: `connection_url | username | password_encrypted | timeout_seconds | insecure_skip_verify | profile_type | profile_config (raw JSON) | is_active`.
     - If the fingerprint is unchanged, no reload is pending and the row is not parked, leave it alone.
     - Otherwise stop the old subscriber and start a new one.
- **Consequences:**
  - Any `profile_config` edit, even a MODE map, restarts that subscriber within 30 s.
  - A rename does not restart it.
  - A password change does, because the ciphertext changes.
- **Start failures** (decrypt failure, no topics, invalid profile block, options build error):
  - They are recorded against the current fingerprint.
  - They are **not retried** until the config changes or `/reload` is called.
- **Shutdown:** dispose every subscriber. For each one: stop the client, wait up to 5 s for the workers, then a final flush and state save.

**Monolith:** keep the reconcile loop as a safety net, but also signal it directly from the save handler so changes apply immediately.

---

## 5. MQTT client (`Services/MqttClientOptionsFactory.cs`, subscribers)

| Setting | Value | Why |
|---|---|---|
| Library | MQTTnet **4.3.7** and `MQTTnet.Extensions.ManagedClient` 4.3.7 | MQTTnet 5 removed the managed client. Pin v4 or write your own reconnect and resubscribe loop |
| Protocol | MQTT **5.0**, TCP only (no WebSocket) | |
| Client id | `mqtt.client_id` or `ingestion-<config_id>` | **Must be stable and unique.** The broker keys the offline queue on it. Two clients with the same id evict each other in a loop. Opening MQTT Explorer with the production id kicked the live subscriber |
| Session | `clean_session=false`, `session_expiry=86400` s | Messages published while we are down are queued (QoS ≥ 1) and delivered on reconnect |
| QoS | `mqtt.qos ?? 1` (health profile: always 1) | QoS 0 is never queued |
| Keepalive | 60 s | The broker declares the client dead after 1.5× this |
| Reconnect | Managed client, fixed **5 s** delay; subscriptions are re-applied automatically | There is no exponential backoff |
| TLS | `mqtts`/`ssl` → TLS, port 8883 by default. Optional SNI via `tls.servername`. Validation: skip-verify accepts everything; with a custom CA, a chain is built with `CustomRootTrust` and revocation `NoCheck`; otherwise the system roots apply | No client certificates (mTLS) |
| Credentials | Sent when the username is non-empty | |
| Shared subscriptions | **Not used** | One subscriber per source, so there is no horizontal scale-out |

**Connection status** is kept in `SubscriberStatus`:
- Connected: `connected=true`.
- Disconnected or failed connect: the error text is stored, a rate-limited warning is logged, and `ingestion_mqtt_reconnects_total` is incremented.

---

## 6. Message path inside a subscriber (`Pipeline/OtLoopSubscriber.cs`)

```
MQTTnet receive handler ──copy payload──► Channel.CreateBounded(10_000, FullMode=Wait)
                                                     │  exactly ONE consumer task (keeps broker order)
                                                     ▼
                              topic parse → payload parse → validate → map → joiner / DLQ
Side workers: grid ticker (1 s) · registry refresh (60 s) · unknown-source flush (10 s)
```

- **Ordering:** a single consumer per source, so messages are processed in the order the broker delivered them.
- **Backpressure:**
  - A full channel blocks the MQTTnet handler.
  - MQTTnet sends PUBACK only after the handler returns, so the broker holds further messages in the persistent session.
- **The gap (do not copy):** a message is acknowledged as soon as it is *written to the channel*, not when it has been processed.
  - Up to 10,000 acknowledged messages exist only in memory.
  - They are lost on a crash, and on a reload after the 5 s grace period.
  - The persistent session protects only messages not yet delivered.
- **What actually stalls:**
  - A DLQ produce is awaited inside the consume loop. With Kafka down, each one can block for up to librdkafka's 300 s default, which stalls MQTT intake.
  - Tuple publishing runs on the grid ticker with infinite 2 s retries, so it freezes only that ticker.

**Monolith fix:** persist first, then acknowledge (§15.3).

---

## 7. Topic parsing

**Loop profile (`Pipeline/OtTopicParser.cs`):**
- Template: `loop_ingest.topic_template`, default `{ns}/{site}/{fcs}/{class}/{loop}/{group}/{param}`.
- Matching:
  - The template and the topic must have the same number of `/` levels.
  - A `{name}` segment captures one level. Any other segment must match literally and case-sensitively.
  - Required captures: `{site}`, `{fcs}`, `{loop}`, `{param}`. `{class}` is optional. `{ns}` and `{group}` are ignored.
  - An empty capture fails the parse.
- Example: `OT/HDPE/FCS0101/Flow/FIC10302/PIDParams/PV` gives site=HDPE, fcs=FCS0101, class=Flow, loop=FIC10302, param=PV.
- A failure goes to the DLQ with reason `TOPIC_SHAPE_MISMATCH`.

**Health profile (`Health/HealthTopic.cs`):**
- Topics: `{prefix}/{tenant}/{site}/devices/{device}/state|events` and `{prefix}/{tenant}/{site}/sources/{source}/availability`.
- The default prefix is `traverse/instrumental/v1`. Anything else goes to the DLQ with `TOPIC_SHAPE`.

**Monolith recommendation:** reuse the template parser exactly as it is. It is small, strict and configurable per source.
- A downtime template might be `{ns}/{site}/{line}/{machine}/downtime`.
- Store the template in `profile_config.<profile>.topic_template` and validate its required captures at save time.

---

## 8. Payload parsing, timestamps, quality, mode

**Envelope.** The real OT gateway publishes one JSON object per leaf:

```json
{"value": -0.2363, "unit": "", "quality": "GOOD", "ts": "2026-08-31T06:07:14.187Z", "source": "opc_ua",
 "seq": 0, "device": "FIC10302", "area": "FCS0101", "line": "Flow", "enterprise": "", "site": "HDPE",
 "process_unit": "Flow", "equipment": "FIC10302", "item": "PV"}
```

**Parsing (`Pipeline/OtPayloadParser.cs`):**
- **Root:** not JSON, or not an object → `MALFORMED_JSON`. Sparkplug B and bare numbers are not accepted.
- **`value`** (required):
  - A number gives a double; `true`/`false` give 1/0.
  - A numeric string is parsed with the invariant culture. Any other string is kept as raw text.
  - NaN or ±Infinity → `NON_FINITE`.
- **`ts`** (required):
  - A JSON integer is taken as **epoch milliseconds** (there is no seconds detection). A fractional number → `BAD_TIMESTAMP`.
  - A string is parsed as ISO-8601, and a value without an offset is treated as **UTC**.
  - A timestamp more than `future_skew_max_seconds` (default 300) in the future → `FUTURE_TIMESTAMP`.
  - **There is no check for old timestamps**, so retained or old messages are accepted.
  - The plant gateway clock was measured 132 s ahead, which is why the skew limit is 300 s.
- **`quality`:** the native token is kept verbatim and never defaulted.
- **`seq`:** always 0 on the plant and not used.
- **Identity check (`OtConsistencyValidator`):** an identity field in the payload may be absent, but it must not contradict the topic.
  - site, area↔fcs, device or equipment↔loop → `LOOP_IDENTITY_MISMATCH`.
  - item↔param → `PARAMETER_MISMATCH`.
  - class↔line is warn-only.

**Quality decoding (`Pipeline/QualityDecoder.cs`, per source `loop_ingest.quality_protocol`):**

| Protocol | Rule |
|---|---|
| `STRING_ENUM` (default) | `GOOD` / `UNCERTAIN` / `BAD`, case-insensitive. Anything else → UNKNOWN |
| `OPC_DA` | Integer 0..255, `code & 0xC0`: 0xC0 GOOD, 0x40 UNCERTAIN, 0x00 BAD, 0x80 UNKNOWN |
| `OPC_UA` | uint32, severity `(code >> 30) & 3`: 0 GOOD, 1 UNCERTAIN, 2-3 BAD |
| `SPARKPLUG` | 192 GOOD, 500 UNCERTAIN, 0 BAD, anything else UNKNOWN |
| `NONE` | Always UNKNOWN |

- A missing or blank token gives UNKNOWN (`QUALITY_MISSING`).
- **UNKNOWN is never treated as GOOD.**
- Ranking for worst-of: BAD > UNCERTAIN > UNKNOWN > GOOD.

**Value mapping (`loop_ingest.mode_value_map`):**
- It maps numeric codes to tokens, for example CENTUM `{"1":"AUT","2":"MAN","3":"CAS","4":"IMAN"}`.
- An integral number is looked up as an integer string, so `4.0` is looked up as `"4"`.
- Unmapped values pass through unchanged, and a "mode unrecognised" counter plus a warning record it.
- **Incident CHG-003:** an inverted map made every loop "manual", and analytics silently excluded the whole fleet.

**For downtime:** reason codes and machine states are exactly this kind of mapping. Copy the pattern:
- Per-source `reason_code_map` / `state_map`.
- A UI editor that shows how each value is classified live.
- A loud warning and a counter for unmapped values.
- **Never** a silent default.

---

## 9. Loop joiner (CPM-specific; probably not needed for PLA and Downtime)

`Pipeline/LoopJoiner.cs` turns per-parameter messages into one tuple per loop per grid tick (default 5 s).
- **State and gating:**
  - Last-value-wins state per loop.
  - A loop emits only when pv, sp and op have each been seen at least once.
- **Timestamps:**
  - `event_ts_ms` is the newest member's source timestamp and strictly increases per loop: a tick with no new data is skipped.
  - The reason for the skip: IoTDB keys rows by (device, ts), so a repeated timestamp would overwrite a row.
- **Quality and ageing:** quality is the worst of pv/sp/op. Values never age out (CHG-002).
- **Mapping:** parameters are mapped to roles by `param_roles`. That map **overlays** the built-in map (PV, SP/SV, OP/MV, MODE, VP, P, I, D, GW); it used to replace it, which took the whole fleet dark (CHG-010).
- **Restart durability:** last-known values are saved in `ingestion.loop_state`, every 60 s, immediately when a loop gains a new role, and at shutdown. They are restored on start.
  - This is needed because the gateway publishes on change only.
- **Lookup:** loops are resolved against the CPM loop registry, pulled over REST every 60 s. A failed pull keeps the old map.
- **Known gap:** an out-of-order or retained message *overwrites* a newer value, because there is no timestamp comparison in `Accept`.

If PLA needs continuous signals (counts, rates, speeds), this joiner is the model. Discrete events should not go through it.

---

## 10. Event-style pipeline: instrumental health (the template for PLA and Downtime)

`Health/InstrumentalHealthSubscriber.cs` handles discrete, self-describing events. It validates them strictly, deduplicates them, checks their ordering, and forwards them unchanged inside a wrapper.

**Configuration (`profile_config.instrumental_health`):**

| Field | Default / rule |
|---|---|
| `topic_prefix` | `traverse/instrumental/v1` |
| `tenant_id`, `site_id` | required, pattern `^[A-Za-z0-9][A-Za-z0-9._:-]*$` |
| `allowed_source_ids[]` | at least one entry |
| `max_skew_seconds` | 86400 |
| `max_message_bytes` | 65536 |

The subscription filters are **derived from this config** at QoS 1, and `mqtt.topics` is ignored.

**Per-message steps (one consumer, bounded channel):**
1. **Topic shape** → `TOPIC_SHAPE`.
2. **Size** over `max_message_bytes` → `TOO_LARGE`.
3. **JSON object** → `NOT_JSON`.
4. **`schema_version` = "1.0"** → `UNSUPPORTED_VERSION`.
5. **`message_kind`** must match the kind the topic implies → `KIND_MISMATCH`.
6. **JSON Schema** (draft-07, embedded files in `Contracts/instrumental-health/v1/*.schema.json`, `additionalProperties:false`) → `SCHEMA_INVALID`, with the first 5 errors.
7. **Identity:** tenant, site, device or source in the payload must equal the topic, and the topic must equal the config → `IDENTITY_MISMATCH`.
8. **Producer allow-list:** `source_id` must be in `allowed_source_ids` → `SOURCE_NOT_ALLOWED`.
9. **Clock:** `|received − published_at| > max_skew` → `TIMESTAMP_SKEW`. Observation times are not limited, because an old retained snapshot is valid.
10. **Dedupe** (`HealthDedupe`):
    - Key: `tenant|site|source|observation_id`. Value: SHA-256 of the canonical JSON (keys sorted).
    - Same key and same hash → dropped silently.
    - Same key and a different hash → `INTEGRITY_CONFLICT` in the DLQ.
    - It is an in-memory LRU of 50,000 entries and is forgotten on restart; the downstream primary key is the backstop.
11. **Epoch and sequence** (`EpochTracker`, per device):
    - A new device, or a higher `producer_epoch`, is accepted only if the message is a complete `STATE_SNAPSHOT`. Otherwise it is **parked** (`EPOCH_WITHOUT_SNAPSHOT`) so it can be replayed later.
    - A lower epoch is forwarded with the flag `STALE_EPOCH`.
    - The same epoch with `sequence ≤ last` is forwarded with the flag `SEQUENCE_REGRESSION`.
12. **Forward:** `{ gateway: {received_at, topic, kind, mqtt_retained, authenticated_producer = the source's MQTT username (never the payload's claim), config_id, flags[]}, observation: <payload verbatim> }`, keyed by device.

**Publisher side** (`scripts/sim/instrumental_health_sim.py`):
- State and availability are published **retained**; events are not retained.
- The last will is a retained OFFLINE availability message, and a retained ONLINE message is published on connect.
- This is the right broker pattern for "is this producer alive?".

---

## 11. Unknown and unregistered sources ("park, never auto-create")

- **What gets parked:** messages for things that are not configured (an unregistered loop, an unmapped parameter). They go to the DLQ **and** are counted in `ingestion.unknown_sources`.
  - The table's primary key is (config_id, reason, source_key), and it holds `message_count`, first/last seen, and the last topic and payload.
  - Counts are aggregated in memory and upserted every 10 s.
  - Non-JSON payloads are wrapped as `{"raw": …}` so the JSONB insert never fails.
- **How it is fixed:** an operator registers the entity, and it starts flowing on the next registry refresh. There is no redeploy and no restart.
- **For downtime:** an event for a machine that is not in the asset model must be parked and listed, not silently created and not dropped. Show this list in the UI; ours is API-only today.
- **Production data point:** 14.6 % of OT messages park, 99.8 % of them from one device whose topic the filter should not include. Narrow the topic filters; do not rely on parking to absorb noise.

---

## 12. Outputs today

| Output | Key | Shape | Failure handling |
|---|---|---|---|
| Kafka `traverse.cpa.loop.samples.v1` | `loop_id` (per-loop partition order) | Loop tuple JSON, schema 1.1 | Infinite retry every 2 s |
| Kafka `traverse.ingestion.ot-dlq` | entity key or topic | `{reason, config_id, mqtt_topic, payload, received_at_ms, detail}` | One attempt, then **dropped** |
| Kafka `traverse.cpa.instrument.health.v1` / `health-dlq` | device_id / source_id | wrapper (§10) | One attempt, then **dropped** |
| Kafka `traverse.cpa.audit-events` | none | `{EventType, TimestampUtc, UserId, EntityType, EntityId, AfterState}` | Fire-and-forget |
| Postgres `ingestion.loop_state`, `unknown_sources`, `data_source_configs.last_data_received` | | §9, §11 | Best effort |

- Producer settings: `acks=all`, idempotent, 3 retries, lz4, linger 5 ms.
- The topics are pre-created.
- With `Kafka:BootstrapServers` empty, everything is **silently not published**, although the counters still move.

---

## 13. Observability

- **`GET /stats`**, one entry per subscriber: connected, connectionError, messagesReceived, tuplesEmitted, deadLettered, parked, kafkaFailures, active and registry loop counts, lastMessageAt, the effective role map, a health summary, and for event profiles `{received, forwarded, duplicates, dlq, conflicts, parked}`.
- **`GET /loop-health`**, per loop:
  - `flowing`: emitting.
  - `idle`: no emission for max(30 s, 6× grid), measured on our clock.
  - `held`: a required member has never been seen.
  - `silent`: registered but nothing has ever arrived.
  - Context: on 2026-09-11, 143 of 175 loops were dark and it took a 2-hour broker inventory to find out why. This endpoint is the result.
- **Prometheus** (label = data-source name, never the entity id, to keep cardinality bounded):
  - Messages received, dead-lettered and parked by reason.
  - Emitted, publish failures, reconnects.
  - Loops by state.
  - A source-latency histogram.
- **`/health`** stays green when the broker is down, by design. Broker state is reported but does not fail the service.

**Production rule:** prove the feed is alive from data, not from logs.
- The plant runs at `SERVICE_LOG_LEVEL=Error`, so INFO log greps read zero.
- Use `/stats` counters, `last_data_received`, or the newest row in the store.
- Test the broker with `mosquitto_sub -R`, which skips retained messages, because retained messages make a dead feed look alive.

---

## 14. What Kafka and the microservice split give us, and the monolith equivalent

| # | What Kafka or the split does today | Monolith equivalent (no Kafka) |
|---|---|---|
| 1 | **Decoupling:** ingestion never waits on analytics or historian writers | Persist to an **inbox table** first; downstream handlers run from that table on their own workers |
| 2 | **Durability:** a record survives once `acks=all` succeeds | The Postgres commit of the inbox or event row **before** the MQTT PUBACK (§15.3) |
| 3 | **Replay:** rewind consumers, rebuild IoTDB, replay the DLQ (`scripts/replay-kafka-dlq.ps1`) | Keep raw inbox rows for N days and record a per-handler `processed_at` or cursor. "Replay" means resetting the cursor. The DLQ table gets a replay command |
| 4 | **Per-entity ordering:** key = entity id gives one partition and ordered processing | Process each entity in order: one consumer per source (as today), or a key-hash to N workers. Sort by (`entity`, `event_ts`, `seq`) when applying state |
| 5 | **Fan-out:** one samples topic, five or more readers with independent offsets | A list of in-process handlers, each with its own cursor or processed flag on the inbox, so one slow handler does not block the others |
| 6 | **Idempotence:** downstream tolerates duplicates (IoTDB upserts by ts; Flink drops exact duplicates) | **A unique constraint on the event identity** (`source_id, event_id`, or a hash) with `INSERT … ON CONFLICT DO NOTHING`. At-least-once from MQTT plus an idempotent insert gives effectively-once |
| 7 | **DLQ topics** | A `dead_letters` table: reason, config_id, topic, raw payload, detail, received_at, replayed_at |
| 8 | **Audit topic → audit-service** | A synchronous insert into an `audit_log` table in the same transaction as the config change |
| 9 | **Gateway JWT → X-Auth-\* headers** | The monolith's own auth middleware, with the same two permissions `ingestion.view` / `ingestion.manage` |
| 10 | **REST registry pull from cplm-api every 60 s** | A direct in-process read of the asset or machine table (cache it, and invalidate the cache on change) |
| 11 | **Health-plane isolation:** a separate topic and producer, so a bad feed cannot stall the main one | Separate channel and worker per source and per profile (already true per source) |
| 12 | **Retention:** samples 12 h in production, records 3 d (`prod_decision.md` §3) | Partition the inbox by day and drop old partitions (a TimescaleDB retention policy or `pg_partman`). Decide this per table and record it in `prod_decision.md` |

**Things the monolith does not need:**
- Kafka producer tuning (linger, lz4, idempotent producer).
- Flink-specific `event_ts` rules, unless a time-series store keyed by timestamp is kept.
- The service-key REST hop to the registry.

---

## 15. Proposed design for PLA and Downtime (monolith)

### 15.1 Module layout

Keep each file to 400-500 lines or fewer.

```
Ingestion/
  Config/        DataSourceRepository, Validation, CredentialCipher, ProfileRegistry, ConnectionTester, Conflicts
  Mqtt/          MqttClientOptionsFactory (copy), SubscriberHost (reconcile + signal), Subscriber (per source)
  Parsing/       TopicTemplateParser (copy), EventPayloadParser, ValueMaps (reason/state maps), Validators
  Store/         InboxRepository, EventRepository (idempotent), DeadLetterRepository, UnknownSourceRepository
  Dispatch/      HandlerRegistry + workers (DowntimeHandler, PlaHandler, …) with per-handler cursors
  Api/           data-source CRUD + test/activate/reload, /stats, /unknown-sources, /dead-letters (+ replay)
```

### 15.2 Profiles

- Add `MQTT_DOWNTIME_EVENTS` and `MQTT_PLA_EVENTS` (and any further feed types). Each one defines:
  - its default topic filter and `topic_template`;
  - its payload contract and JSON Schema version;
  - its identity rules (topic ↔ payload);
  - its value maps (reason code, machine state);
  - the handler it dispatches to.
- Keep the profile list in code. Store per-source overrides in `profile_config.<profile_block>`.

### 15.3 Persist before acknowledge (the one change that matters most)

```
on message (MQTT handler, manual ack):
    BEGIN
      INSERT INTO ingestion.inbox(config_id, topic, payload, qos, retained, received_at) …
    COMMIT
    ack the message (PUBACK)            ← only after the commit
worker per source (ordered):
    SELECT next unprocessed inbox rows FOR UPDATE SKIP LOCKED
    parse → validate → map → INSERT event … ON CONFLICT (source_id, event_id) DO NOTHING
                           → or INSERT dead_letters
    mark inbox row processed (same transaction)
```

- **How to turn off auto-acknowledge:**
  - MQTTnet 4: set `e.AutoAcknowledge = false` in the handler and call `await e.AcknowledgeAsync(ct)` after the commit.
  - Paho Java: `setManualAcks(true)`.
  - Python paho 2.x: `manual_ack=True`.
- **Result:** a crash loses nothing that was acknowledged, and the broker redelivers what was not.
- **Duplicates** from redelivery are absorbed by the unique constraint.
- **Throughput:** batch the inbox inserts, for example by collecting for 50 ms or 500 messages, and acknowledge the batch after one commit.
- **When Postgres is down:** stop acknowledging. The broker queues messages in the persistent session (session expiry 24 h), and the subscriber reports `Degraded`. This replaces "Kafka down stalls intake".

### 15.4 Connection settings to keep exactly

- QoS 1.
- `clean_session=false` and `session_expiry_seconds=86400`.
- A stable, unique client id per source.
- A connection tester that uses a throwaway id and a clean session.
- The same options factory for the tester and the runtime.
- TLS with exactly one trust mode, and a `servername` override.
- The duplicate-feed 409 guard.

### 15.5 Event semantics to decide with the PLA and Downtime owners (§17)

**Event identity:**
- Use the producer's `event_id` if there is one.
- Otherwise use SHA-256 of `(source, machine, event_type, event_ts)`.
- Copy the instrumental-health conflict rule: same id with a different body goes to the DLQ as an integrity conflict and is never overwritten.

**Downtime start and stop pairing:**
- Store raw events, then derive downtime intervals in a separate handler. The handler should be re-runnable from the raw events, which gives replay.
- Handle these cases explicitly:
  - an END without a START;
  - a second START while a stop is still open;
  - an event that arrives out of order (use `event_ts`, not arrival order, for state);
  - a stop still open across a restart, which the persisted state must cover.

**Clocks and retained messages:**
- Accept `event_ts` from the source, reject timestamps more than N seconds in the future, and add a configurable *past* limit (the loop path lacks one).
- Treat retained messages as state re-sends, not new events. Record `retained` on the inbox row and dedupe them.

**Producer liveness:** an availability topic with a retained ONLINE message and an OFFLINE last will (§10).

**Parking:** unknown machines and unknown reason codes are parked and listed. Unknown codes may optionally be stored with the reason `UNMAPPED` so the event is not lost.

### 15.6 Frontend

Reuse the four-step wizard and the list page:
- Profile.
- Basic information.
- Connection.
- Advanced: topics, QoS, client id, session, TLS, timeout.

Add these, which we lack today:
- A profile-specific panel per event profile: the topic template and the reason/state map editor with live classification. `LoopIngestPanel` is the model.
- **Always spread the stored `profileConfig` on save**, or move to a merge-patch API (trap T2).
- Views for `/stats`, `/unknown-sources` and `/dead-letters` (with Replay).
- A "Test" button available before saving, which tests the unsaved form.
- Mapping of the server's `field` to the wizard step that owns it.

Our UI uses OpenBridge components. Follow the PLA app's own design system.

---

## 16. Traps and known defects: copy the fixes, not the bugs

| # | Trap | What to do |
|---|---|---|
| T1 | The `version` trigger bumps on *every* UPDATE, including the subscriber's own `last_data_received` touch. Using it for change detection restarts the subscriber forever | Use a fingerprint of the material fields, or a separate `config_revision` column bumped only by the API |
| T2 | PUT replaces `profile_config` wholesale. The wizard once wiped `loop_ingest` on every save (CHG-012), which removed the mode map and silently excluded the fleet from analytics | Merge-patch on the server, or always spread the stored object on the client |
| T3 | A user override map used to *replace* the built-in map (CHG-010) | Overlay the built-ins, use null to remove an entry, and refuse a save that leaves a required role unmapped (400) |
| T4 | Ack before process: up to 10,000 acknowledged messages live only in memory | Persist before acknowledging (§15.3) |
| T5 | An out-of-order or retained message overwrites newer state (loop joiner) | Compare `event_ts` before applying; record and dedupe the `retained` flag |
| T6 | A numeric `ts` is assumed to be milliseconds; a seconds epoch becomes 1970 and there is no past check | Detect the unit or reject; add a past limit |
| T7 | DLQ and health produce failures are *dropped* after one attempt | DLQ rows go in the same database transaction; nothing is dropped |
| T8 | CHG-031: after a Kafka disk-full crash, the producer never reconnected and reported healthy for 6 h; data was lost. **Still open in code** | Health must fail when `now − last_successful_persist` exceeds a threshold while messages are arriving |
| T9 | Start failures are not retried until the config changes or `/reload` is called | Retry with backoff, and show the error on the card |
| T10 | A key longer than 32 characters is silently truncated to 32; rotating the key orphans every password | Document it, and provide a re-encrypt migration for key rotation |
| T11 | URL validation rejects `ssl://` while the runtime accepts it; IPv6 is rejected | Use one shared parser |
| T12 | Delete does not cascade to `loop_state` / `unknown_sources` | Add FKs with cascade, or soft delete |
| T13 | An `INSTRUMENTAL_HEALTH` source can be saved without its required block, then never starts | Profile-specific validation must require the block |
| T14 | `/health` is green while the broker is down | Keep that (it avoids restart loops), but alert on `connected=false` for more than N minutes and on stale `last_data_received` |
| T15 | Unbounded in-memory state: joiner loops and health epoch trackers are never evicted | Bound them, or keep them in the database |
| T16 | Self-heal DDL duplicated from the SQL scripts | One migration path |

---

## 17. Production lessons (plant broker, `prod_decision.md` §6)

- **2026-09-22:** the plant team recreated their broker, deleting our MQTT user and the TLS listener. Three days of data were lost before anyone noticed.
  - **Alert on silence, per source.**
- **2026-09-26:** a full disk crashed mosquitto. **2026-10-06:** the broker crash-looped; its entrypoint runs `mosquitto_passwd -c` on every start.
- **2026-10-10:** after a broker recreate, our user was missing, and the OPC→MQTT agent (`piarchiver-agent`) was wedged (rc=15, queue full).
  - **After any broker event, restart the publisher agent, verify the user exists, and test with `mosquitto_sub -R`.**
- The broker publishes the same values under two groups (`diagnostics` and `PIDParams`). Subscribe to exactly one, or every value arrives twice.
- The live client id `traverse-ingestion-pidparams` must never be reused by a debugging tool.
- The plant runs at log level Error, so health must be visible through `/stats` and data checks, not logs.

---

## 18. Acceptance checks to reuse

Taken from `scripts/test-ingestion-config-e2e.ps1` and `scripts/test-ot-loop-ingestion-e2e.ps1`.

**Configuration API:**
1. A request without a token gets 401.
2. Create returns `hasPassword=true` and `effectiveClientId = ingestion-<id>`. No response ever contains the password.
3. Test against a live broker persists SUCCESS. Wrong credentials persist FAILED. An unreachable broker persists FAILED with error text.
4. Rename with a blank password keeps the credential.
5. An invalid topic filter gets 400 `field=topics`. An `http://` URL gets 400.
6. Activate, deactivate and delete work; a GET after delete gets 404.
7. An overlapping second source gets 409.

**Pipeline:**
1. The simulator publishes, and a record arrives within 120 s with the expected mapped fields.
2. An unregistered entity is parked (count ≥ N) and appears in the DLQ.
3. `/stats` shows `connected=true` with growing counters, and `last_data_received` is set.
4. An entity registered mid-run starts flowing within 2× the refresh interval.
5. A map edit restarts the subscriber within 90 s without unmapping the required roles. Un-mapping a required role gets 400.

**Add these for the monolith:**
1. Kill the process mid-burst. Every message the broker sent at QoS 1 ends up exactly once in the event table.
2. Stop Postgres. Messages queue at the broker, and nothing is acknowledged while the database is down. After Postgres returns, everything drains in order.
3. A redelivered or retained duplicate inserts nothing.
4. The same event id with a different body produces a DLQ `INTEGRITY_CONFLICT`.

---

## 19. Configuration and default reference

| Key | Default |
|---|---|
| `ENCRYPTION_KEY` | required, ≥ 32 chars (first 32 used) |
| Reconcile period / startup delay | 30 s / 3 s |
| Channel capacity | 10,000, FullMode Wait |
| Reconnect delay | 5 s fixed |
| Connect timeout | `timeout_seconds` 30 |
| Keepalive / session expiry / QoS | 60 s / 86400 s / 1 |
| Future-skew limit | 300 s (loop), `max_skew_seconds` 86400 (health) |
| Max message size (health) | 65,536 bytes |
| Dedupe LRU (health) | 50,000 entries |
| Unknown-source flush | 10 s |
| `last_data_received` touch | 30 s |
| Registry refresh | 60 s |
| Rate-limited warning | 1 per key per 30 s |
| Loop grid / idle threshold | 5 s / max(30 s, 6× grid) |
| State save (loop) | 60 s, on a new role, at shutdown |

**Key source files:**
- `src/services/ingestion-service/Program.cs`
- `Pipeline/OtIngestionHostService.cs`, `Pipeline/OtLoopSubscriber.cs`
- `Services/MqttClientOptionsFactory.cs`, `Services/MqttConnectionTester.cs`
- `Services/DataSourceValidation.cs`, `Services/LoopSourceConflicts.cs`, `Services/CredentialCipher.cs`, `Services/ProfileRegistry.cs`
- `Pipeline/OtTopicParser.cs`, `Pipeline/OtPayloadParser.cs`, `Pipeline/QualityDecoder.cs`
- `Health/*`
- `database/scripts/45, 46, 49, 51_*.sql`
- `src/frontend-ob/src/components/Administration/{DataSourcesConfig,DataSourceWizard,LoopIngestPanel}.tsx`, `dataSourcesApi.ts`

---

## 20. Open questions for the PLA and Downtime owners

1. **Broker:** is it the plant's broker (as for OT today) or one we run? Who provisions our user, and who restarts the publisher after a broker event?
2. **Topics:** what are the exact topic shapes, and is there a namespace we can filter on tightly?
3. **Payload:** what is the payload contract, and is it versioned (`schema_version`)? Can we have a JSON Schema?
4. **Event identity:** does every event carry a unique `event_id`? If not, which fields identify it?
5. **Downtime model:** separate START and END events, or one event with a duration? Who closes an open stop after a crash?
6. **Retained messages:** are messages retained? Is there a heartbeat or availability topic with a last will?
7. **Clock and timestamps:** what is the timestamp format and unit, and how far does the publisher's clock drift?
8. **Volumes:** expected rate and peak burst (shift change, plant trip), which sets the inbox batching and retention.
9. **Codes and assets:** are reason codes and machine ids shared with the asset model, so they can be mapped and parked, or free text?
10. **Retention:** how long must raw events and derived intervals be kept? Record the answer in `prod_decision.md`.
