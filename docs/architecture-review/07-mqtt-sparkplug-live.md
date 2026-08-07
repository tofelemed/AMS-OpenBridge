# 07 — MQTT / Sparkplug Live Pipeline

## Purpose

Deliver **live process & alarm metrics** to the HMI without polling Postgres.  
Kafka holds canonical live streams; Sparkplug edge node bridges to MQTT; Redis holds paint-on-open snapshots.

---

## End-to-end

```mermaid
flowchart LR
  subgraph Produce["Producers Flink"]
    LS[LiveStateJob]
    LR[LoopLiveRbeJob]
  end
  subgraph Bus["Kafka"]
    LA[live.alarms]
    LM[live.metrics]
    LLM[live.loop.metrics]
  end
  subgraph Edge["sparkplug-edge-node"]
    SP[Sparkplug B publisher]
    SNAP[Redis snapshot writer]
  end
  subgraph Broker["EMQX"]
    MQTT[spBv1.0/.../DDATA]
  end
  subgraph Client["frontend-ob"]
    MS[mqttStore]
    BIND[binding-resolver meta]
  end
  LS --> LA & LM
  LR --> LLM
  LA & LM & LLM --> SP
  SP --> MQTT
  SP --> SNAP
  MQTT --> MS
  SNAP --> HB[/api/hist/snapshot]
  BIND --> MS
  HB --> MS
```

---

## Components

### Flink producers

| Job | Input | Output | Behavior |
|---|---|---|---|
| `LiveStateJob` | `current-alarm-state` | `live.alarms`, `live.metrics` | Report-by-exception (fingerprint ValueState) |
| `LoopLiveRbeJob` | `loop.samples.v1` | `live.loop.metrics` | Deadband RBE per `(loopId, metric)` |

### sparkplug-edge-node (Java)

Compose: `sparkplug-edge-node`

| Env | Lab default |
|---|---|
| `KAFKA_BROKERS` | kafka:9092 |
| `LIVE_ALARMS_TOPIC` / `LIVE_METRICS_TOPIC` | `live.alarms` / `live.metrics` |
| `MQTT_HOST` | emqx |
| `SPARKPLUG_GROUP` / `SPARKPLUG_EDGE` | `ams_site1` / `ams_edge1` |
| `REDIS_*` | redis:6379, TTL 3600s |

Publishes Sparkplug B: `NBIRTH` / `DBIRTH` / `DDATA` under `spBv1.0/{group}/…`.  
Writes Redis keys `snapshot:metric:…` and alias keys.  
Optional IoTDB REST (`IOTDB_PERSIST`).

### EMQX

| Listener | Port |
|---|---|
| MQTT TCP | 1883 |
| MQTT WS | 8083 (UI via nginx `/mqtt-ws`) |
| Dashboard | 18083 |

Lab: anonymous allowed; edge still sends username/password if set.

### Redis policy

`maxmemory-policy volatile-lru` — only TTL keys evictable.  
Snapshots are a **paint-on-open contract**, not disposable cache (compose comments).

### Frontend

| Build arg / env | Value |
|---|---|
| `VITE_MQTT_WS_URL` | `/mqtt-ws` |
| `VITE_SPARKPLUG_GROUP` / `EDGE` | `ams_site1` / `ams_edge1` |
| `VITE_SNAPSHOT_URL` | `/api/hist/snapshot` |

Binding-resolver live role returns MQTT WS endpoint, Sparkplug topic/device/metric, and `redisSnapshotKey`.

---

## Operator sequence (faceplate open)

1. Load display config (display-service) — paths only.
2. Resolve bindings (`/api/bindings/resolve?roles=live`).
3. Fetch snapshot from historian-bff (Redis) → first paint.
4. Subscribe MQTT Sparkplug DDATA → updates.
5. Bad quality / missing snapshot → NE107-style quality from binding metadata (frontend mapping).

---

## Why not direct Kafka to browser?

- Browser-friendly transport: MQTT over WebSocket.
- Sparkplug B is industrial standard for edge metric namespace + birth/death.
- Redis gives cold-start without waiting for next Kafka message.
- Edge node can add IoTDB persist without changing UI.

---

## Failure modes

| Symptom | Likely cause |
|---|---|
| Blank faceplate, no retry | Redis snapshot missing/evicted (TTL policy) |
| No live updates | EMQX down / mqttStore not subscribed / wrong group-edge |
| Stale live.* | LiveStateJob / LoopLiveRbeJob not RUNNING |
| Partial metrics | sparkplug consumer lag / group offset |

Check: Flink UI (live jobs), Kafka UI (`live.*`), EMQX dashboard, Redis keys `snapshot:*`.
