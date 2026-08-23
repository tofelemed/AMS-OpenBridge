# MQTT Data Source Feature — Standalone Build Specification

This document is a **complete, self-contained handoff**. It describes a production-proven
feature — UI-configurable MQTT ingestion — extracted from another system (Instrumental Pro),
and contains everything a developer or Claude Code needs to rebuild it in an application that
has **none of the original code**: full database schema, the working source for every
load-bearing component, the config JSON contract, API and UI behavior, delivery-guarantee
rules, and a build plan.

The original system split this across two microservices (an asset service owning the config
CRUD, and an ingestion service owning the broker connections). **This specification collapses
that into one application**: the config CRUD and the MQTT subscriber read the same database.
Appendix B covers the optional split-service variant.

**Feature summary:** an operator defines MQTT broker connections in the UI (URL, credentials,
topics, QoS, TLS — including uploading a CA certificate from the browser), tests them with one
click, and activates them. A background subscriber connects to every active broker with
at-least-once delivery semantics, parses each message, maps it to an entity in the
application, and hands the result to a downstream sink — with a dead-letter path for anything
it cannot deliver.

---

## 0. Placeholders to resolve before building

The spec is stack-agnostic where it can be; resolve these five for the target application:

| Placeholder | Meaning | Example |
|---|---|---|
| `<SINK>` | Where a successfully parsed record goes | Kafka topic, DB table, internal event bus |
| `<DLQ>` | Where undeliverable messages are preserved | `dead_letters` table, DLQ topic |
| `<ENTITY>` | The domain object a message attaches to | device, asset, sensor, meter |
| `<MAPPING_FIELD>` | Payload field used to look the entity up | `tag_name` |
| `<PAYLOAD>` | The JSON the broker actually publishes | see §8.4 for the reference example |

The reference implementation is TypeScript/Node (Express, `mqtt` v5 client library,
PostgreSQL). The embedded code assumes that stack; on a different one, port it while
preserving every rule marked **INVARIANT**.

---

## 1. Architecture

```
┌────────────────────────────  Application  ────────────────────────────┐
│                                                                       │
│  UI: Data Sources page                 Background: MQTT subscriber    │
│  (wizard: connection, topics,          - loads active configs from DB │
│   QoS, TLS incl. CA upload,            - one MQTT client per config   │
│   test button, activate)               - MQTT 5, QoS 1, persistent    │
│        │                                 session, ack = guarantee     │
│        ▼                                       │                      │
│  REST API /data-sources ──────┐                │ parse → resolve      │
│   CRUD + test + (de)activate  │                │ <ENTITY> → publish   │
│        │                      ▼                ▼                      │
│        └──────────►  data_source_configs   <SINK>      <DLQ>          │
│                      (password AES-256-GCM encrypted)                 │
└───────────────────────────────────────────────────────────────────────┘
                                        ▲
                                        │ MQTT (mqtts://…:8883, QoS 1)
                              OT gateway / external broker(s)
```

Two distinct MQTT client identities exist by design — **INVARIANT**:

| Client | Identity | Session |
|---|---|---|
| Subscriber (long-lived) | stable, per config: `ingestion-<config_id>` | persistent (`clean: false` + session expiry) |
| Test button (one-shot) | throwaway: `test-<timestamp>` | clean, no reconnect |

Reason: an MQTT broker evicts the older of two clients sharing a client id — a test reusing
the subscriber's id would knock the live connection off, and a persistent session left by a
test would make the broker queue messages forever for a client that never returns.

---

## 2. Database schema

One table. PostgreSQL DDL (adapt types for another RDBMS; keep every column):

```sql
CREATE TABLE data_source_configs (
    config_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- identity
    source_type           VARCHAR(50)  NOT NULL DEFAULT 'MQTT' CHECK (source_type IN ('MQTT')),
    profile_type          VARCHAR(50),            -- selects parser + destination, e.g. 'MQTT_PRM'
    name                  VARCHAR(255) NOT NULL,
    description           TEXT,

    -- connection
    connection_url        TEXT         NOT NULL,  -- mqtts://host:8883 or mqtt://host:1883
    username              VARCHAR(255) NOT NULL,
    password_encrypted    TEXT         NOT NULL,  -- AES-256-GCM, see §4
    timeout_seconds       INTEGER      DEFAULT 30 CHECK (timeout_seconds > 0),
    insecure_skip_verify  BOOLEAN      DEFAULT false,  -- disables TLS cert verification

    -- everything MQTT-shaped rides in JSON, no extra columns needed (see §3)
    profile_config        JSONB        DEFAULT '{}',

    -- status & control
    is_active             BOOLEAN      DEFAULT true,
    last_connection_test  TIMESTAMP,
    last_connection_status VARCHAR(20) CHECK (last_connection_status IN ('SUCCESS','FAILED','PENDING')),
    last_connection_error TEXT,
    last_data_received    TIMESTAMP,

    -- audit
    created_at            TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    created_by            VARCHAR(100) NOT NULL,
    updated_at            TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_by            VARCHAR(100),
    version               INTEGER      DEFAULT 1
);

CREATE INDEX idx_dsc_is_active ON data_source_configs(is_active);
CREATE INDEX idx_dsc_profile_type ON data_source_configs(profile_type);

CREATE OR REPLACE FUNCTION touch_data_source_configs()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    NEW.version = OLD.version + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_touch_data_source_configs
    BEFORE UPDATE ON data_source_configs
    FOR EACH ROW EXECUTE FUNCTION touch_data_source_configs();
```

(The origin system also allowed `source_type` values for polled sources — PI, OPC-UA — with
extra `polling_interval_seconds` / `pi_*` columns. Add those only if the target app ever needs
pull-based sources; MQTT never uses them.)

---

## 3. The `profile_config.mqtt` contract

Everything MQTT-specific lives under the `mqtt` key of the `profile_config` JSONB column. The
broker URL, username, and password deliberately reuse the shared connection columns above.

```json
{
  "mqtt": {
    "topics": ["prm/data/#"],
    "qos": 1,
    "client_id": "",
    "clean_session": false,
    "session_expiry_seconds": 86400,
    "keepalive_seconds": 60,
    "tls": {
      "ca_cert_pem": "-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----",
      "ca_cert_path": "/app/certs/mqtt-ca.crt",
      "servername": "mosquitto"
    }
  }
}
```

TypeScript shape (use verbatim):

```ts
export interface MqttTlsConfig {
  /** CA certificate inline as PEM text. PREFERRED — portable, no file mounts. */
  ca_cert_pem?: string;
  /** Path to a CA file that must exist on the SERVER running the subscriber AND the tester. */
  ca_cert_path?: string;
  /** Overrides the hostname checked against the certificate's SANs. */
  servername?: string;
}

export interface MqttConfig {
  /** Topic filters, e.g. ["prm/data/#"]. Required, at least one. */
  topics: string[];
  /** Default 1. QoS 1 is required for the broker to queue messages while we are down. */
  qos?: 0 | 1 | 2;
  /** Blank = derived as `ingestion-<config_id>`. Must be stable and unique per broker. */
  client_id?: string;
  /** Default false. True = broker forgets the subscription on disconnect (messages lost). */
  clean_session?: boolean;
  /**
   * Default 86400. MQTT 5 defaults this to 0, which discards the session — and every
   * queued message — the instant the connection drops. clean_session=false alone buys
   * nothing on MQTT 5 without this. (INVARIANT)
   */
  session_expiry_seconds?: number;
  /** Default 60. Broker declares the client dead after 1.5× this with no traffic. */
  keepalive_seconds?: number;
  tls?: MqttTlsConfig;
}

export interface ProfileConfig {
  mqtt?: MqttConfig;
}
```

Defaults to seed a new config in the UI:

```ts
export const DEFAULT_MQTT_CONFIG: MqttConfig = {
  topics: ["prm/data/#"],          // adapt the example topic to <PAYLOAD>'s world
  qos: 1,
  clean_session: false,
  session_expiry_seconds: 86400,
  keepalive_seconds: 60,
  tls: {},
};
```

---

## 4. Credential encryption (full source)

Passwords are encrypted at rest with AES-256-GCM; the master secret is the `ENCRYPTION_KEY`
env var (≥32 chars; first 32 used). Decryption happens in exactly two places: loading configs
for the subscriber, and the connection test. Plaintext must never be logged or returned to any
API response. **INVARIANT** — this file is self-contained; use it verbatim (swap the logger):

```ts
// utils/encryption.ts
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY environment variable is not set');
  if (key.length < 32) throw new Error('ENCRYPTION_KEY must be at least 32 characters long');
  return key.substring(0, 32);
}

function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, 100000, KEY_LENGTH, 'sha256');
}

/** Returns base64(salt ‖ iv ‖ authTag ‖ ciphertext). */
export function encrypt(plaintext: string): string {
  const masterKey = getEncryptionKey();
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(masterKey, salt);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([salt, iv, tag, encrypted]).toString('base64');
}

export function decrypt(encryptedData: string): string {
  const masterKey = getEncryptionKey();
  const combined = Buffer.from(encryptedData, 'base64');

  const salt = combined.subarray(0, SALT_LENGTH);
  const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

  const key = deriveKey(masterKey, salt);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
```

Note: changing `ENCRYPTION_KEY` orphans every stored password — operators must re-enter them.

---

## 5. REST API

All endpoints behind the application's normal auth. `created_by`/`updated_by` come from the
authenticated user.

| Method & path | Behavior |
|---|---|
| `GET  /data-sources` | List all configs. **Never include decrypted passwords in any response.** |
| `GET  /data-sources/active` | Active only (used by admin views) |
| `GET  /data-sources/:id` | One config |
| `POST /data-sources` | Create: encrypt `password` → `password_encrypted`, insert, return row |
| `PUT  /data-sources/:id` | Partial update — only provided fields change (dynamic SET list) |
| `DELETE /data-sources/:id` | Delete |
| `POST /data-sources/:id/test` | Live broker test (§6); stores result on the row |
| `POST /data-sources/:id/activate` | `is_active = true` |
| `POST /data-sources/:id/deactivate` | `is_active = false` |

Rules — all **INVARIANT**:

1. **Empty-string password on update means "keep the stored password".** The edit form sends
   `""` when the field is untouched; treating that as a value silently replaces the credential
   with an empty one, and the source then fails to authenticate with no clue why.

   ```ts
   if (data.password !== undefined && data.password !== '') {
     updates.push(`password_encrypted = $${i++}`);
     values.push(encrypt(data.password));
   }
   ```

2. Parameterized SQL only. JSONB values are `JSON.stringify`-ed on write and defensively
   parsed on read (tolerate both string and object forms, depending on driver).
3. Updates never touch unspecified columns; the DB trigger bumps `updated_at` and `version`.

Create request body:

```jsonc
{
  "source_type": "MQTT",
  "profile_type": "MQTT_PRM",              // or your profile name, §8
  "name": "OT Gateway broker",
  "description": "optional",
  "connection_url": "mqtts://192.168.1.84:8883",
  "username": "gateway",
  "password": "…",                          // plaintext in transit (HTTPS), encrypted at rest
  "timeout_seconds": 30,
  "insecure_skip_verify": false,
  "profile_config": { "mqtt": { /* §3 */ } }
}
```

---

## 6. Connection test (full source)

Connects once with the stored credentials and the config's TLS material, then disconnects.
Result + latency stored on the row (`last_connection_test/status/error`) so the list page can
show connection health. Self-contained apart from `decrypt` (§4) and your DB helper:

```ts
// services/testMqttConnection.ts
import mqtt from 'mqtt';
import fs from 'fs';
import { decrypt } from '../utils/encryption';

interface DataSourceRow {
  connection_url: string;
  username: string;
  password_encrypted: string;
  insecure_skip_verify: boolean;
  timeout_seconds: number | null;
  profile_config: { mqtt?: import('./types').MqttConfig } | null;
}

export async function testMqttConnection(
  config: DataSourceRow
): Promise<{ ok: boolean; error?: string }> {
  const mqttSettings = config.profile_config?.mqtt;
  const timeoutMs = (config.timeout_seconds || 30) * 1000;

  let password = '';
  try {
    password = decrypt(config.password_encrypted);
  } catch (err) {
    return { ok: false, error: `Could not decrypt stored password: ${(err as Error).message}` };
  }

  // Throwaway clientId + clean session on purpose (INVARIANT): reusing the subscriber's
  // clientId would make the broker evict the live connection, and a persistent session from
  // a test would leave the broker queueing messages for a client that never returns.
  const options: mqtt.IClientOptions = {
    clientId: `test-${Date.now()}`,
    username: config.username || undefined,
    password: password || undefined,
    clean: true,
    connectTimeout: timeoutMs,
    reconnectPeriod: 0, // one attempt — this is a test, not a subscription
    protocolVersion: 5,
  };

  if (config.connection_url.startsWith('mqtts://') || config.connection_url.startsWith('ssl://')) {
    options.rejectUnauthorized = !config.insecure_skip_verify;
    if (mqttSettings?.tls?.servername) options.servername = mqttSettings.tls.servername;
    if (mqttSettings?.tls?.ca_cert_pem) {
      options.ca = [Buffer.from(mqttSettings.tls.ca_cert_pem, 'utf8')];
    } else if (mqttSettings?.tls?.ca_cert_path) {
      try {
        options.ca = [fs.readFileSync(mqttSettings.tls.ca_cert_path)];
      } catch (err) {
        return {
          ok: false,
          error: `CA certificate not readable at ${mqttSettings.tls.ca_cert_path}: ${(err as Error).message}`,
        };
      }
    }
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: { ok: boolean; error?: string }): void => {
      if (settled) return;
      settled = true;
      try { client.end(true); } catch { /* already closing */ }
      resolve(result);
    };

    const client = mqtt.connect(config.connection_url, options);
    const timer = setTimeout(
      () => finish({ ok: false, error: `Connection timed out after ${timeoutMs}ms` }),
      timeoutMs + 1000
    );

    client.on('connect', () => { clearTimeout(timer); finish({ ok: true }); });
    client.on('error', (err: Error) => {
      clearTimeout(timer);
      // A bare "Protocol error" is almost always a TLS SAN mismatch: the host used to reach
      // the broker is not in the server certificate's subjectAltName list.
      const hint = /protocol error/i.test(err.message)
        ? ` (a bare protocol error usually means the broker's TLS certificate does not list "${new URL(config.connection_url).hostname}" in its SANs)`
        : '';
      finish({ ok: false, error: `${err.message}${hint}` });
    });
  });
}
```

The `/test` endpoint wraps this, timing it and persisting:

```sql
UPDATE data_source_configs
SET last_connection_test = $1, last_connection_status = $2, last_connection_error = $3
WHERE config_id = $4
```

---

## 7. MQTT transport wrapper (full source)

The connection-lifecycle layer over the `mqtt` npm package (v5+). No business logic. Every
decision in it is load-bearing; port it verbatim (only the logger import changes).

The four **INVARIANTS** it embodies:

1. **QoS 1 + stable clientId + `clean: false` + explicit `sessionExpiryInterval`.** The broker
   then remembers the subscription and queues messages while the client is disconnected.
   MQTT 5 defaults session expiry to **0** — session and queue discarded the instant the
   connection drops — so it must be set explicitly whenever clean session is off.
2. **PUBACK withheld until the async handler resolves** (via mqtt.js's `handleMessage` hook).
   A rejecting handler leaves the message unacked → broker redelivers. This makes delivery
   at-least-once and provides backpressure for free: while the app is behind, the broker stops
   sending past its inflight window instead of growing an unbounded queue in the app's heap.
3. **`connect()` never rejects** — resolves on first CONNACK, or after the timeout with a
   warning while mqtt.js keeps retrying in the background. A briefly-down broker must not take
   the application down.
4. **Explicit re-subscribe on every `connect` event** (`resubscribe: false`) — recovers from a
   broker-side session expiry, where the CONNACK's `sessionPresent` comes back false.

```ts
// services/mqtt-client.ts
import fs from 'fs';
import mqtt, { MqttClient } from 'mqtt';
import logger from '../utils/logger'; // ← adapt to your logger

export interface MqttTlsOptions {
  caCertPath?: string;
  /** CA certificate inline, as PEM text. Takes precedence over caCertPath. */
  caCertPem?: string;
  /** Overrides the hostname checked against the certificate's SANs. */
  servername?: string;
  /** Defaults to true. Setting false disables verification — testing only. */
  rejectUnauthorized?: boolean;
}

export interface MqttConnectionOptions {
  brokerUrl: string;               // e.g. mqtts://host:8883
  clientId: string;
  username?: string;
  password?: string;
  topics: string[];                // topic filters, e.g. ['prm/data/#']
  qos?: 0 | 1 | 2;
  cleanSession?: boolean;
  sessionExpirySeconds?: number;   // MQTT 5 only, NOT optional in practice — see invariant 1
  keepaliveSeconds?: number;
  reconnectPeriodMs?: number;
  connectTimeoutMs?: number;
  tls?: MqttTlsOptions;
  label: string;                   // short human-readable name for log lines
}

export interface MqttIncomingMessage {
  topic: string;
  payload: Buffer;
  qos: number;
  retain: boolean;
  receivedAt: Date;
}

export type MqttMessageHandler = (message: MqttIncomingMessage) => Promise<void>;

export interface MqttClientStats {
  label: string; brokerUrl: string; clientId: string; topics: string[];
  connected: boolean; connects: number; reconnects: number;
  messagesReceived: number; handlerErrors: number;
  lastMessageAt: string | null; lastError: string | null; lastErrorAt: string | null;
}

interface IncomingPublishPacket { topic: string; payload: Buffer; qos: 0 | 1 | 2; retain: boolean; }

export class MqttClientWrapper {
  private client: MqttClient | null = null;
  private connected = false;
  private connects = 0;
  private reconnects = 0;
  private messagesReceived = 0;
  private handlerErrors = 0;
  private lastMessageAt: Date | null = null;
  private lastError: string | null = null;
  private lastErrorAt: Date | null = null;

  constructor(
    private readonly options: MqttConnectionOptions,
    private readonly onMessage: MqttMessageHandler
  ) {}

  async connect(): Promise<void> {
    const {
      brokerUrl, clientId, username, password,
      cleanSession = false, sessionExpirySeconds = 86400,
      keepaliveSeconds = 60, reconnectPeriodMs = 5000, connectTimeoutMs = 30000,
      tls, label,
    } = this.options;

    const isTls = brokerUrl.startsWith('mqtts://') || brokerUrl.startsWith('ssl://');
    const clientOptions: mqtt.IClientOptions = {
      clientId, username, password,
      clean: cleanSession,
      keepalive: keepaliveSeconds,
      reconnectPeriod: reconnectPeriodMs,
      connectTimeout: connectTimeoutMs,
      protocolVersion: 5,
      resubscribe: false, // we re-subscribe explicitly on every 'connect'
    };

    // MQTT 5: session lifetime is the Session Expiry Interval property, DEFAULTING TO 0 —
    // the broker drops session, subscription, and queued messages the moment the connection
    // closes. Omitting this silently turns off offline queuing. (INVARIANT 1)
    if (!cleanSession) {
      clientOptions.properties = { sessionExpiryInterval: sessionExpirySeconds };
    }

    if (isTls) {
      const ca = this.loadCaCertificate(tls);
      if (ca) clientOptions.ca = [ca];
      if (tls?.servername) clientOptions.servername = tls.servername;
      clientOptions.rejectUnauthorized = tls?.rejectUnauthorized !== false;
      if (!ca && clientOptions.rejectUnauthorized) {
        logger.warn('MQTT TLS configured without a CA certificate — verification will use system roots', { label, brokerUrl });
      }
    }

    logger.info('Connecting to MQTT broker', { label, brokerUrl, clientId, tls: isTls, cleanSession, topics: this.options.topics, qos: this.options.qos ?? 1 });

    const client = mqtt.connect(brokerUrl, clientOptions);
    this.client = client;
    this.attachHandlers(client);

    // Resolve on first connect or after the timeout with a warning. Never reject —
    // mqtt.js keeps retrying in the background. (INVARIANT 3)
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = (): void => { if (!settled) { settled = true; resolve(); } };
      const timer = setTimeout(() => {
        if (!settled) {
          logger.warn('MQTT broker not reachable yet — continuing, client will keep retrying', { label, brokerUrl, waitedMs: connectTimeoutMs });
        }
        finish();
      }, connectTimeoutMs);
      client.once('connect', () => { clearTimeout(timer); finish(); });
    });
  }

  /** A missing/unreadable CA file is logged, not thrown — the TLS error that follows is far
   *  more actionable than a startup crash. */
  private loadCaCertificate(tls?: MqttTlsOptions): Buffer | null {
    if (tls?.caCertPem) return Buffer.from(tls.caCertPem, 'utf8');
    if (!tls?.caCertPath) return null;
    try {
      return fs.readFileSync(tls.caCertPath);
    } catch (error) {
      logger.error('Failed to read MQTT CA certificate', { label: this.options.label, caCertPath: tls.caCertPath, error: (error as Error).message });
      return null;
    }
  }

  private attachHandlers(client: MqttClient): void {
    const { label, topics, qos = 1 } = this.options;

    client.on('connect', (packet) => {
      this.connected = true;
      this.connects++;
      // sessionPresent=true → broker still had our subscription and queued messages.
      // false after a session expiry — the re-subscribe below recovers. (INVARIANT 4)
      const sessionPresent = Boolean((packet as { sessionPresent?: boolean }).sessionPresent);
      logger.info('MQTT connected', { label, sessionPresent, connects: this.connects });

      client.subscribe(topics, { qos }, (error, granted) => {
        if (error) {
          this.recordError(error.message);
          logger.error('MQTT subscribe failed', { label, topics, error: error.message });
          return;
        }
        logger.info('MQTT subscribed', { label, granted: (granted || []).map((g) => ({ topic: g.topic, qos: g.qos })) });
      });
    });

    client.on('reconnect', () => {
      this.reconnects++;
      logger.warn('MQTT reconnecting', { label, reconnects: this.reconnects });
    });

    client.on('close', () => {
      if (this.connected) logger.warn('MQTT connection closed', { label });
      this.connected = false;
    });

    client.on('error', (error: Error) => {
      this.recordError(error.message);
      // A bare "Protocol error" here is almost always a TLS SAN mismatch.
      logger.error('MQTT client error', { label, error: error.message });
    });

    // The handleMessage hook withholds the PUBACK until the handler resolves; passing the
    // error back leaves the message unacked so the broker redelivers. (INVARIANT 2)
    const handleMessage: MqttClient['handleMessage'] = (packet, done) => {
      const publish = packet as unknown as IncomingPublishPacket;
      this.messagesReceived++;
      this.lastMessageAt = new Date();

      this.onMessage({
        topic: publish.topic,
        payload: publish.payload,
        qos: publish.qos,
        retain: publish.retain,
        receivedAt: this.lastMessageAt,
      })
        .then(() => done())
        .catch((error: Error) => {
          this.handlerErrors++;
          this.recordError(error.message);
          logger.error('MQTT message handler failed — message left unacknowledged', { label, topic: publish.topic, error: error.message });
          done(error);
        });
    };
    client.handleMessage = handleMessage;
  }

  private recordError(message: string): void {
    this.lastError = message;
    this.lastErrorAt = new Date();
  }

  async disconnect(): Promise<void> {
    if (!this.client) return;
    const client = this.client;
    this.client = null;
    await new Promise<void>((resolve) => {
      client.end(false, {}, () => resolve()); // force=false lets in-flight acks drain
    });
    this.connected = false;
    logger.info('MQTT disconnected', { label: this.options.label });
  }

  isConnected(): boolean { return this.connected; }

  getStats(): MqttClientStats {
    return {
      label: this.options.label,
      brokerUrl: this.options.brokerUrl,
      clientId: this.options.clientId,
      topics: this.options.topics,
      connected: this.connected,
      connects: this.connects,
      reconnects: this.reconnects,
      messagesReceived: this.messagesReceived,
      handlerErrors: this.handlerErrors,
      lastMessageAt: this.lastMessageAt ? this.lastMessageAt.toISOString() : null,
      lastError: this.lastError,
      lastErrorAt: this.lastErrorAt ? this.lastErrorAt.toISOString() : null,
    };
  }
}
```

Operational corollary of the stable-clientId rule: **run one subscriber instance per broker
config.** Two replicas would share a clientId and evict each other forever. (MQTT 5 shared
subscriptions — `$share/<group>/<filter>` — are the escape hatch if horizontal scale is ever
needed.)

---

## 8. Parsing, entity resolution, and publishing

### 8.1 The pluggable seams

The subscriber (§9) is written against three interfaces the target application implements —
this is where "no asset service" is absorbed. The origin system resolved entities via an HTTP
call to its asset service; here, resolve them however the target app stores its `<ENTITY>`
records (usually a local DB lookup with a small in-memory cache):

```ts
// services/pipeline-ports.ts

/** Resolve <MAPPING_FIELD> to the application's entity.
 *  MUST distinguish (INVARIANT):
 *    - returns null      → entity genuinely unknown (skip + dead-letter, do not retry)
 *    - throws            → lookup transiently unavailable (retry / withhold ack)      */
export interface EntityResolver {
  resolve(mappingValue: string): Promise<ResolvedEntity | null>;
}

export interface ResolvedEntity {
  entity_id: string;                       // the application's own id — never the payload's
  [k: string]: unknown;                    // any authoritative metadata to enrich with
}

/** Where a successfully parsed record goes: <SINK>. Throw on failure (caller retries). */
export interface RecordSink {
  publish(destination: string, key: string, envelope: object): Promise<void>;
}

/** Where undeliverable messages are preserved: <DLQ>. Throw on failure — the caller's
 *  reaction to that throw is the heart of the delivery guarantee (§9). */
export interface DeadLetterSink {
  write(entry: {
    reason: string;            // 'PARSE_FAILED' | 'ENTITY_UNKNOWN' | 'DELIVERY_FAILED'
    detail: string;
    mqtt_topic: string;
    received_at: string;       // ISO
    payload: string;           // raw text, truncated to ~10 000 chars
  }): Promise<void>;
}
```

### 8.2 Profiles

A **profile** binds a payload shape to a parser and a destination, so a new payload shape is a
new profile + parser — never a transport change:

```ts
// types/profiles.ts
export interface ParseResult<T> {
  success: boolean;
  records: T[];
  errors: string[];
  warnings: string[];
}

export type ParserFn<T> = (rawText: string, receivedAtIso: string) => ParseResult<T>;

export interface DataSourceProfile<T> {
  profile_type: string;        // stored in data_source_configs.profile_type
  display_name: string;
  parser: ParserFn<T>;
  destination: string;         // route key handed to RecordSink, e.g. a topic/table name
  event_type: string;          // stamped on the envelope
  source_label: string;        // stamped on the envelope
}

export const PROFILES: Record<string, DataSourceProfile<ParsedRecord>> = {
  MQTT_PRM: { /* the example profile below */ } as never,
};

export function getProfile(profileType: string): DataSourceProfile<ParsedRecord> {
  const p = PROFILES[profileType];
  if (!p) throw new Error(`Unknown profile type: ${profileType}`);
  return p;
}
```

### 8.3 The normalized record

Parsers emit a normalized record; only `mappingValue` is required. Everything the source sent
that isn't explicitly mapped goes into `fields` so nothing is lost:

```ts
export interface ParsedRecord {
  mappingValue: string;                    // value of <MAPPING_FIELD>, e.g. "FT00601"
  sourceEventId?: string;
  recordTimestamp?: string;                // event time claimed by the source
  receivedAt: string;                      // when the MQTT message arrived
  /** Pre-classified diagnostics the source computed (carry through, don't re-derive): */
  category?: string;
  severity?: number;
  faultCode?: string;
  faultDescription?: string;
  activeFlag?: boolean;
  /** Everything else the source sent, stringified: */
  fields: Record<string, string>;
}
```

### 8.4 Reference payload and the trust rules

The origin gateway publishes one JSON message per diagnostic row on topic
`prm/data/<plant>/<tag>/<unit>/asset_event`:

```json
{
  "timestamp": "2026-07-21T09:27:58.225439+00:00",
  "data_type": "asset_event",
  "source_file": "PRM_Test_20260721T092753Z.csv",
  "data": {
    "event_id": "fd081097-4c3a-4b6e-9a34-0f2f1f0f9d2e",
    "device_id": 3416,
    "tag_name": "FT00601",
    "plant": "Site Control",
    "area": "FT00601",
    "unit": "CENTUM",
    "device_type_code": "2000_IS",
    "ne107_category": "S",
    "severity": 2,
    "fault_code": 40,
    "fault_description": "Input signal out of range",
    "ts_start": "2026-07-21T09:20:00Z",
    "active_flag": false,
    "raw_payload": "{ nested JSON duplicate of most of the above }"
  }
}
```

Rules the origin parser enforces, generalized — all **INVARIANT** for any parser you write:

1. **DROP the payload's own entity id** (`device_id` above — it is the *source system's*
   integer key). Downstream code treats the id field as the application's own entity id;
   letting the source's through emits valid-looking records attached to entities that don't
   exist. The real id is attached later by the publisher via `EntityResolver`.
2. **CARRY pre-classified diagnostics through explicitly** (`ne107_category`, `severity`).
   If the source already classified the event, do not re-derive from data the payload doesn't
   contain — re-derivation classifies everything, including genuine failures, as "OK". Warn
   when the classification field is missing rather than guessing.
3. **IGNORE the payload's organizational hierarchy** (`plant`/`area`/`unit` — that is the
   source system's tree, not the application's). Keep them in `fields` for traceability;
   authoritative values come from the resolved entity.
4. Hygiene: skip null/undefined values and junk columns (the origin's CSV exports carried
   `"Unnamed: 22"…` keys); if the payload nests a redundant `raw_payload` copy, merge only the
   keys the flat row lacks; tolerate the envelope being absent (a gateway that one day
   publishes the flat row directly must not break parsing).

A parse failure returns `success: false` with errors — it must never throw.

### 8.5 The publishing choke point (full source, adapted)

Every parsed record becomes a sink event through exactly one function, so the wire contract
has a single producer. Its **three-way outcome is the contract with the subscriber's ack
logic** (INVARIANT):

```ts
// services/record-publisher.ts
import { ParsedRecord, DataSourceProfile } from '../types/profiles';
import { EntityResolver, RecordSink, ResolvedEntity } from './pipeline-ports';
import logger from '../utils/logger';

export type PublishOutcome = 'published' | 'skipped' | 'failed';

export interface PublishContext {
  profile: DataSourceProfile<ParsedRecord>;
  configId: string;      // stable id of the source config (dedup keying)
  configName: string;
  streamLabel: string;   // the MQTT topic — natural per-stream label for dedup + tracing
}

/** Last published signature per config+stream+entity: an unchanged payload is not
 *  republished (protects against a gateway replaying a file). In-memory by design —
 *  a restart republishing once is harmless under at-least-once semantics. */
const lastPublishedSignatures = new Map<string, string>();

function buildChangeSignature(ctx: PublishContext, record: ParsedRecord, entity: ResolvedEntity): string {
  // Deterministic signature of everything that matters; EXCLUDES ingestion-time fields
  // (receivedAt, ingestion timestamps) so identical data does not republish.
  const { receivedAt: _ignored, ...meaningful } = record;
  return JSON.stringify({ stream: ctx.streamLabel, entity_id: entity.entity_id, ...meaningful });
}

export function makeRecordPublisher(resolver: EntityResolver, sink: RecordSink) {
  return async function publishRecord(ctx: PublishContext, record: ParsedRecord): Promise<PublishOutcome> {
    // Thrown = resolver transiently unavailable → 'failed' (caller retries / withholds ack).
    // null = mapping value genuinely unknown → 'skipped' (one unmappable value must not
    // stall the whole stream forever).
    let entity: ResolvedEntity | null;
    try {
      entity = await resolver.resolve(record.mappingValue);
    } catch (error) {
      logger.warn('Entity resolver unavailable — record will be retried', { mappingValue: record.mappingValue, error: (error as Error).message });
      return 'failed';
    }
    if (!entity) {
      logger.warn('Entity not found — skipping publish', { mappingValue: record.mappingValue, stream: ctx.streamLabel });
      return 'skipped';
    }

    const dedupKey = `${ctx.configId}:${ctx.streamLabel}:${entity.entity_id}`;
    const signature = buildChangeSignature(ctx, record, entity);
    if (lastPublishedSignatures.get(dedupKey) === signature) return 'skipped';

    const envelope = {
      eventType: ctx.profile.event_type,
      source: ctx.profile.source_label,
      timestamp: new Date().toISOString(),
      data: {
        entity_id: entity.entity_id,        // ALWAYS the resolved id, never the payload's
        mapping_value: record.mappingValue,
        // authoritative metadata from the resolver (plant/area/… in the origin system):
        ...entity,
        // pre-classified diagnostics, carried through from the source:
        category: record.category,
        severity: record.severity,
        fault_code: record.faultCode,
        fault_description: record.faultDescription,
        active_flag: record.activeFlag,
        source_event_id: record.sourceEventId,
        record_timestamp: record.recordTimestamp,
        received_at: record.receivedAt,
        ingestion_timestamp: new Date().toISOString(),
        additional_fields: record.fields,
        source_config: ctx.configName,
        source_stream: ctx.streamLabel,
        profile_type: ctx.profile.profile_type,
      },
    };

    try {
      await sink.publish(ctx.profile.destination, entity.entity_id, envelope);
      lastPublishedSignatures.set(dedupKey, signature);
      return 'published';
    } catch (error) {
      logger.error('Sink publish failed', { entity_id: entity.entity_id, error: (error as Error).message });
      return 'failed';
    }
  };
}
```

---

## 9. The subscriber orchestrator (full source, adapted)

Owns config loading, one client per config, and — most importantly — the **ack policy, which
IS the delivery guarantee** (the handler's promise controls the PUBACK, §7 invariant 2).

| Situation | Action | Why (all INVARIANT) |
|---|---|---|
| published / recognized duplicate | ack | done with it |
| unparseable payload | DLQ, then ack | redelivery cannot fix a malformed payload; a poison message must not block the stream forever |
| entity unknown | DLQ, then ack | one unknown `<MAPPING_FIELD>` cannot stall every other entity's data |
| resolver/sink transiently down | retry 3× (1 s × attempt), then DLQ + ack | nothing silently dropped — the DLQ records it |
| **the DLQ write itself fails** | **throw — do NOT ack** | the common cause (the sink infrastructure being down) is the same reason the DLQ write failed; acking would drop the message with no record anywhere, exactly when the outage is total. Withholding the ack pushes backpressure onto the broker's offline queue, and the message is redelivered once the sink returns. |

Conversely, withholding the ack for a *poison* message would be wrong: it stalls the inflight
window behind one bad record until the broker starts discarding, losing good messages to
protect a broken one. Hence DLQ-then-ack whenever the DLQ write succeeds.

```ts
// services/mqtt-subscriber-service.ts
import { MqttClientWrapper, MqttIncomingMessage, MqttClientStats } from './mqtt-client';
import { getProfile } from '../types/profiles';
import { ParsedRecord } from '../types/profiles';
import { PublishContext, PublishOutcome } from './record-publisher';
import { DeadLetterSink } from './pipeline-ports';
import logger from '../utils/logger';

const DELIVERY_MAX_ATTEMPTS = 3;
const DELIVERY_BACKOFF_MS = 1000;
const CONFIG_LOAD_MAX_ATTEMPTS = 5;   // the DB/app is often still booting on startup
const CONFIG_LOAD_BACKOFF_MS = 3000;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** One configured broker connection, built from a data_source_configs row. */
export interface MqttSource {
  configId: string;
  configName: string;
  profileType: string;
  brokerUrl: string;
  username?: string;
  password?: string;               // decrypted
  topics: string[];
  qos: 0 | 1 | 2;
  cleanSession: boolean;
  sessionExpirySeconds: number;
  keepaliveSeconds: number;
  clientId: string;
  caCertPath?: string;
  caCertPem?: string;
  tlsServername?: string;
  rejectUnauthorized: boolean;
}

interface SubscriberStats {
  messagesReceived: number; published: number; duplicates: number;
  parseFailures: number; unknownEntities: number; deliveryFailures: number;
  dlqFailures: number;             // DLQ writes that failed; those messages stayed unacked
  lastMessageAt: string | null; lastPublishAt: string | null;
}

export interface SubscriberDeps {
  /** Read active MQTT rows and DECRYPT passwords. Throw on transient failure —
   *  do not return [] for "couldn't reach the DB": an empty array means
   *  "genuinely no sources configured". */
  loadActiveSources(): Promise<MqttSource[]>;
  publishRecord(ctx: PublishContext, record: ParsedRecord): Promise<PublishOutcome>;
  deadLetters: DeadLetterSink;
  enabled: boolean;                // MQTT_ENABLED master switch
  reconnectPeriodMs?: number;
}

export class MqttSubscriberService {
  private clients = new Map<string, { source: MqttSource; client: MqttClientWrapper }>();
  private running = false;
  private stats: SubscriberStats = {
    messagesReceived: 0, published: 0, duplicates: 0, parseFailures: 0,
    unknownEntities: 0, deliveryFailures: 0, dlqFailures: 0,
    lastMessageAt: null, lastPublishAt: null,
  };

  constructor(private readonly deps: SubscriberDeps) {}

  async start(): Promise<void> {
    if (this.running) return;
    if (!this.deps.enabled) {
      logger.info('MQTT ingestion disabled');
      return;
    }

    const sources = await this.loadSourcesWithRetry();
    if (sources.length === 0) {
      logger.warn('No MQTT sources configured — subscriber not started');
      return;
    }
    for (const source of sources) await this.startSource(source);
    this.running = this.clients.size > 0;
  }

  private async loadSourcesWithRetry(): Promise<MqttSource[]> {
    for (let attempt = 1; attempt <= CONFIG_LOAD_MAX_ATTEMPTS; attempt++) {
      try {
        return await this.deps.loadActiveSources();
      } catch (error) {
        if (attempt === CONFIG_LOAD_MAX_ATTEMPTS) {
          logger.error('Could not load MQTT sources — not starting', { attempts: attempt, error: (error as Error).message });
          return [];
        }
        await sleep(CONFIG_LOAD_BACKOFF_MS * attempt);
      }
    }
    return [];
  }

  private async startSource(source: MqttSource): Promise<void> {
    const profile = getProfile(source.profileType);
    logger.info('Starting MQTT source', { name: source.configName, brokerUrl: source.brokerUrl, topics: source.topics, profile: profile.profile_type });

    const client = new MqttClientWrapper(
      {
        label: source.configName,
        brokerUrl: source.brokerUrl,
        clientId: source.clientId,
        username: source.username,
        password: source.password,
        topics: source.topics,
        qos: source.qos,
        cleanSession: source.cleanSession,
        sessionExpirySeconds: source.sessionExpirySeconds,
        keepaliveSeconds: source.keepaliveSeconds,
        reconnectPeriodMs: this.deps.reconnectPeriodMs ?? 5000,
        tls: {
          caCertPath: source.caCertPath,
          caCertPem: source.caCertPem,
          servername: source.tlsServername,
          rejectUnauthorized: source.rejectUnauthorized,
        },
      },
      (message) => this.handleMessage(source, message)
    );

    this.clients.set(source.configId, { source, client });
    await client.connect();
  }

  async stop(): Promise<void> {
    for (const { client } of this.clients.values()) await client.disconnect();
    this.clients.clear();
    this.running = false;
  }

  /** Re-read configs and reconnect — call after a config change (§11). */
  async reload(): Promise<void> {
    await this.stop();
    await this.start();
  }

  private async handleMessage(source: MqttSource, message: MqttIncomingMessage): Promise<void> {
    this.stats.messagesReceived++;
    this.stats.lastMessageAt = message.receivedAt.toISOString();

    const profile = getProfile(source.profileType);
    const text = message.payload.toString('utf8');
    const parseResult = profile.parser(text, message.receivedAt.toISOString());

    if (!parseResult.success || parseResult.records.length === 0) {
      this.stats.parseFailures++;
      logger.warn('MQTT payload could not be parsed', { topic: message.topic, errors: parseResult.errors, preview: text.slice(0, 500) });
      await this.sendToDlq(message, text, 'PARSE_FAILED', parseResult.errors.join('; '));
      return; // acked — see policy table
    }
    for (const w of parseResult.warnings) logger.warn('MQTT parse warning', { topic: message.topic, warning: w });

    const ctx: PublishContext = {
      profile,
      configId: source.configId,
      configName: source.configName,
      streamLabel: message.topic,
    };
    for (const record of parseResult.records) {
      await this.deliverRecord(ctx, record, message, text);
    }
  }

  private async deliverRecord(
    ctx: PublishContext, record: ParsedRecord,
    message: MqttIncomingMessage, rawText: string
  ): Promise<void> {
    for (let attempt = 1; attempt <= DELIVERY_MAX_ATTEMPTS; attempt++) {
      const outcome = await this.deps.publishRecord(ctx, record);
      if (outcome === 'published') {
        this.stats.published++;
        this.stats.lastPublishAt = new Date().toISOString();
        return;
      }
      if (outcome === 'skipped') {
        // Unknown entity (already warned) or unchanged payload — neither improves with retry.
        this.stats.duplicates++;
        return;
      }
      if (attempt < DELIVERY_MAX_ATTEMPTS) await sleep(DELIVERY_BACKOFF_MS * attempt);
    }

    this.stats.deliveryFailures++;
    await this.sendToDlq(message, rawText, 'DELIVERY_FAILED',
      `resolver or sink unavailable after ${DELIVERY_MAX_ATTEMPTS} attempts`);
  }

  /** Throws if the DLQ write fails — the caller MUST let that propagate so the message
   *  stays unacked and the broker redelivers. (INVARIANT — see policy table) */
  private async sendToDlq(message: MqttIncomingMessage, rawText: string, reason: string, detail: string): Promise<void> {
    try {
      await this.deps.deadLetters.write({
        reason, detail,
        mqtt_topic: message.topic,
        received_at: message.receivedAt.toISOString(),
        payload: rawText.slice(0, 10000),
      });
      logger.warn('Record routed to DLQ', { topic: message.topic, reason, detail });
    } catch (error) {
      this.stats.dlqFailures++;
      logger.error('DLQ write failed — withholding ack so the broker redelivers', { topic: message.topic, reason, error: (error as Error).message });
      throw error;
    }
  }

  isHealthy(): boolean {
    if (!this.deps.enabled) return true;
    if (this.clients.size === 0) return false;
    return Array.from(this.clients.values()).every(({ client }) => client.isConnected());
  }

  getStats(): SubscriberStats & { running: boolean; sourceCount: number; clients: MqttClientStats[] } {
    return {
      ...this.stats,
      running: this.running,
      sourceCount: this.clients.size,
      clients: Array.from(this.clients.values()).map(({ client }) => client.getStats()),
    };
  }
}
```

`loadActiveSources()` implementation notes (this replaces the origin's asset-service HTTP
client with a direct DB read):

```sql
SELECT * FROM data_source_configs WHERE is_active = true AND source_type = 'MQTT' ORDER BY name
```

then per row: decrypt the password (§4); skip rows with no `connection_url` or no
`profile_config.mqtt.topics` (warn); apply defaults `qos ?? 1`, `clean_session ?? false`,
`session_expiry_seconds ?? 86400`, `keepalive_seconds ?? 60`; and derive
`clientId = mqtt.client_id || "ingestion-" + config_id` — stable across restarts (the broker
keys its offline queue on it) and collision-free across configs (**INVARIANT**);
`rejectUnauthorized = !insecure_skip_verify`.

Startup/shutdown ordering: connect the sink first, then start the subscriber; on shutdown,
stop the subscriber **before** the sink so in-flight handlers can still publish.

---

## 10. UI specification

A "Data Sources" admin area with a list page and a create/edit form (the origin used a 4-step
wizard: Profile → Basic info → Connection → MQTT options; a single form is equally fine).

**List page:** name, profile, broker URL, active toggle (activate/deactivate), last connection
test status/time/error, actions: Test, Edit, Delete.

**Form fields and behavior:**

| Field | Behavior |
|---|---|
| Profile | Select from registered profiles (§8.2); determines parser + destination |
| Name / Description | Name required |
| Broker URL | Required. Placeholder `mqtts://192.168.1.84:8883`; help text: *use `mqtts://` for TLS (8883), `mqtt://` for plaintext (1883); include scheme and port* |
| Username / Password | Required on create. **Edit form: password labeled "leave blank to keep current password"** and wired to §5 rule 1 |
| Topic filters | Repeatable rows, ≥1 non-blank required. Validate: a `#` wildcard must be the **last** character of a filter (anywhere else silently matches nothing). Trim blanks on submit. Help: `+` matches one level, `#` matches all remaining levels |
| QoS | Select 0/1/2, default **1**. Help: *QoS 1 is required for the broker to queue messages while ingestion is down; duplicates are suppressed downstream* |
| Client ID | Optional. Placeholder shows the derived default. Help: *must be stable and unique — the broker keys its offline queue on it, and two clients sharing an ID evict each other repeatedly* |
| Session expiry (s) | Default 86400. Warning-style help: *MQTT 5 defaults this to 0, which silently discards queued messages — keep it well above the longest expected restart* |
| Keepalive (s) | Default 60 |
| Clean session | Checkbox, default **off**, help: *leave OFF — when on, anything published while ingestion restarts is lost permanently* |
| Timeout (s) | Default 30 (used by the Test button) |

**TLS block** — shown only when the broker URL matches `^(mqtts|ssl|wss)://`; presented as one
three-way radio choice (it is a single trust decision even though it spans two storage
locations):

1. **Upload CA certificate** (recommended, default): file input read in the browser
   (FileReader). Validate before storing (**INVARIANT** — these checks prevent broken configs
   and credential leaks): reject files > 64 KB (*"a CA certificate is a few KB — wrong
   file?"*); reject text not containing `-----BEGIN CERTIFICATE-----`; reject text containing
   `PRIVATE KEY` (*"upload the CA certificate, never a key"*). Store trimmed text as
   `tls.ca_cert_pem`. Show loaded state with filename + a clear/remove button.
2. **Use a CA file already on the server** → `tls.ca_cert_path`, with the warning that the
   path resolves on the server (in the origin: inside the containers, and it must be available
   to both the subscriber and the tester).
3. **Do not verify the broker certificate** → sets the row's `insecure_skip_verify = true`,
   with an explicit warning (encrypted but unauthenticated; testing only).

Switching modes **clears the other modes' state** (delete `ca_cert_pem` / `ca_cert_path`,
reset `insecure_skip_verify`) so the saved config can never disagree with what the form shows
— the backend prefers inline PEM, so a stale leftover path would mean the UI lies about which
certificate is in use. If the URL is TLS, verification is on, and no CA is set in either mode,
show a red warning: *"will fail with 'self-signed certificate in certificate chain' — provide
a CA or choose Do not verify."* Also expose optional `tls.servername` (help: *only needed when
reaching the broker by an address its certificate does not list; a bare "Protocol error" on
connect is almost always this*).

**After-save guidance box:** (1) click Test to verify the broker accepts the credentials;
(2) restart/reload the subscriber so it picks up the change (§11); (3) every `<ENTITY>` the
broker publishes for must already exist in the application, matched on `<MAPPING_FIELD>` —
records for unknown values go to `<DLQ>`, they are not auto-created.

---

## 11. Applying config changes

The subscriber reads configs **at startup**. Minimum viable (what the origin ships): document
that a service restart applies changes, and say so in the UI's after-save box.

Better, since config CRUD and subscriber share one application here: after any successful
create/update/delete/activate/deactivate, trigger `subscriber.reload()` (directly if same
process, or via the app's internal event bus / a small authenticated admin endpoint). The
origin system published a config-changed event for exactly this purpose but never wired the
consumer — close that loop in the new build.

---

## 12. Configuration / environment

| Var | Required | Purpose |
|---|---|---|
| `ENCRYPTION_KEY` | yes (≥32 chars) | Master secret for credential encryption. Rotating it orphans stored passwords. |
| `MQTT_ENABLED` | default `false` | Master switch for the subscriber |
| `MQTT_RECONNECT_PERIOD_MS` | default `5000` | Reconnect cadence for all clients |
| sink/DLQ connection settings | per target app | — |

The origin also supports a full set of `MQTT_*` env vars as a **bootstrap fallback** used only
when the DB holds zero active MQTT configs (never mixed with DB configs — mixing risks two
clients sharing a clientId). Optional; skip it if the UI-first flow is enough.

---

## 13. Verification plan

1. **Unit tests:** encryption round-trip; §5 rule 1 (empty password keeps current — assert
   `password_encrypted` unchanged after an update with `password: ""`); parser against the
   sample payload (success, malformed JSON, missing `<MAPPING_FIELD>`, envelope absent);
   ack-policy branches of the subscriber with a mocked client and mocked ports
   (published / poison→DLQ+ack / unknown→DLQ+ack / transient→retries then DLQ /
   **DLQ-failure→throws**); the `#`-wildcard topic validation.
2. **End-to-end** against a local broker:
   ```bash
   docker run -d --name mqtt-test -p 1883:1883 eclipse-mosquitto \
     sh -c "echo -e 'listener 1883\nallow_anonymous true' > /mosquitto/config/mosquitto.conf && mosquitto"
   ```
   - Create a config in the UI (`mqtt://localhost:1883`, topic `prm/data/#`) → **Test** → SUCCESS stored on the row.
   - Start the subscriber; publish the §8.4 sample with `mosquitto_pub -t 'prm/data/p/FT00601/u/asset_event' -f sample.json` for an entity that exists → record appears in `<SINK>` with the resolved `entity_id`.
   - Publish the same payload again → deduplicated (no second sink event).
   - Publish for an unknown `<MAPPING_FIELD>` → entry in `<DLQ>` with reason `ENTITY_UNKNOWN`/`DELIVERY_FAILED`.
   - Publish malformed JSON → `<DLQ>` with `PARSE_FAILED`; stream keeps flowing afterwards.
   - Stop the subscriber, publish 5 messages, restart → all 5 arrive (persistent session + QoS 1 + session expiry). This is the test that fails if invariant §7.1 was dropped.

---

## 14. Build prompt for Claude Code

> Paste from here down into Claude Code in the target application, together with this entire
> document (it is the only context needed — the origin codebase will not be available).

Build the MQTT data-source feature specified in the accompanying document
("MQTT Data Source Feature — Standalone Build Specification") in this application.

Before writing code: read this codebase to determine its stack, DB access layer, auth
middleware, background-worker pattern, and UI conventions — then map the spec onto them.
Resolve the five placeholders from §0: choose `<SINK>`, `<DLQ>`, `<ENTITY>`,
`<MAPPING_FIELD>`, and confirm `<PAYLOAD>` (if the real payload shape is unknown, implement
the parser against the reference payload in §8.4 and add a sniffer/debug mode that logs a
field census of observed payloads without publishing, so the parser can be finalized against
reality).

Work in this order, and keep every rule marked **INVARIANT** exactly as specified:

1. Schema (§2) as a migration in this app's migration system, plus the encryption util (§4).
2. Config REST API (§5) with this app's auth, and the connection test (§6).
3. Transport wrapper (§7) — port verbatim, adapting only imports/logging.
4. Pipeline ports (§8.1) implemented against this app: entity resolution from the local
   database (with a small cache), sink and dead-letter adapters.
5. Parser + profile (§8.2–8.4) and the publishing choke point (§8.5).
6. Subscriber orchestrator (§9), wired into this app's process lifecycle (start after the
   sink connects, stop before it), with health/stats exposed on the app's existing
   health/metrics surface.
7. UI (§10) in this app's UI stack, including the TLS three-way chooser with CA-upload
   validation and the blank-password-keeps-current edit behavior.
8. Config-change propagation (§11) — prefer wiring `reload()` on save over restart-only.
9. Tests and the end-to-end verification (§13); run them and report results honestly.

Constraints: never log or return decrypted passwords; parameterized SQL only; comments sparse
and only for the non-obvious invariants; match this codebase's naming and idioms rather than
the spec's where they conflict on style (never on behavior).

---

## Appendix A — Operational gotchas (each learned in production)

1. **MQTT 5 session expiry defaults to 0** — set `sessionExpiryInterval` explicitly or
   offline queuing silently does not exist, even with clean session off.
2. **Never two clients with one clientId on one broker** — they evict each other and flap
   forever. Config-derived stable ids for subscribers, throwaway ids for tests, one subscriber
   instance per config.
3. **Bare "Protocol error" on TLS connect = SAN mismatch** — the address used to reach the
   broker is not in the certificate's subjectAltName list; fix with `tls.servername` or a
   reissued certificate.
4. **DLQ-then-ack for poison; withhold the ack only when the DLQ write itself fails.**
5. **Empty password on update = keep current** — forgetting this blanks stored credentials on
   every edit-form save.
6. **Entities must pre-exist**, matched on `<MAPPING_FIELD>`; unknown values dead-letter, they
   are not auto-created.
7. **A CA path is server/container-relative** and must be readable by both the subscriber and
   the tester; inline PEM upload avoids the whole class of problem.
8. Broker-side queuing is bounded by the broker's own limits (Mosquitto:
   `max_queued_messages`, default 1000, and `persistence true` for surviving broker restarts)
   — size them for the longest outage you intend to ride out.

## Appendix B — Split-service variant

If the target app later splits config CRUD and the subscriber into separate services, the
subscriber needs the decrypted credentials over the network. Add an internal endpoint
`GET /data-sources/internal/active-with-credentials` on the config service, guarded by a
shared secret header — timing-safe compare, fail closed when unset:

```ts
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

export function requireInternalKey(req: Request, res: Response, next: NextFunction): void {
  const configuredKey = process.env.INTERNAL_API_KEY;
  const providedKey = req.header('X-Internal-Key');
  if (!configuredKey || !providedKey) {
    res.status(403).json({ success: false, error: 'Forbidden' });
    return;
  }
  const a = Buffer.from(configuredKey);
  const b = Buffer.from(providedKey);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.status(403).json({ success: false, error: 'Forbidden' });
    return;
  }
  next();
}
```

The guard must live on the endpoint itself (not only at a reverse proxy) — anything inside the
network can reach the service directly. The subscriber's `loadActiveSources()` then becomes an
HTTP call sending `X-Internal-Key`; keep its throw-on-transient-failure semantics (§9) so a
config-service outage is retried rather than misread as "no sources configured".
