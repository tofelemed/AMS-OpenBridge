# Unified Kafka Topic Catalog

**Document:** Phase 0 Foundation  
**Status:** AUTHORITATIVE  
**Date:** 2026-06-30

---

## 1. Topic Naming Convention

```
<domain>.<entity>.<event_type>
```

Examples:
- `raw-alarms` (existing AMS)
- `live.alarms` (existing AMS)
- `asset.created` (new Traverse)

---

## 2. Retained AMS Topics (Unchanged)

These topics are production infrastructure. **Do not modify.**

| Topic | Producer | Consumer(s) | Retention | Partitions | Purpose |
|-------|----------|-------------|-----------|------------|---------|
| `raw-alarms` | OPC Gateway | Flink OpcEventStreamJob | 24h | 4 | OPC-AE telemetry ingest |
| `current-alarm-state` | Flink | NormalizedAlarmConsumerService | 24h | 4 | Normalized alarm stream |
| `live.alarms` | Flink LiveStateJob | sparkplug-edge-node | compact | 4 | Live alarm state → Sparkplug |
| `live.metrics` | Flink LiveStateJob | sparkplug-edge-node | compact | 4 | Live metrics (RBE) → Sparkplug |
| `operator-actions` | AMS API | Flink | 7d | 4 | Operator ACK/shelve commands |
| `ack-writeback` | Flink | OPC Gateway | 24h | 4 | DCS writeback commands |
| `ack-results` | OPC Gateway | Flink, AMS API | 7d | 4 | ACK confirmation |
| `lifecycle-events` | Multiple | LifecycleEventConsumer | 30d | 4 | Append-only state machine log |

---

## 3. New Traverse Topics

### 3.1 Asset Domain

| Topic | Producer | Consumer(s) | Retention | Purpose |
|-------|----------|-------------|-----------|---------|
| `asset.created` | Asset Model service | Binding Resolver, Flink | 7d | New asset registered |
| `asset.updated` | Asset Model service | Binding Resolver, Flink | 7d | Asset metadata changed |
| `asset.deleted` | Asset Model service | Binding Resolver, Flink | 7d | Asset removed |
| `asset.alias.created` | Asset Model service | Binding Resolver | 7d | Legacy alias mapping added |

**Payload schema (asset.created):**
```json
{
  "eventId": "uuid",
  "eventTime": "2026-06-30T12:00:00Z",
  "asset": {
    "id": "uuid",
    "contextualPath": "houston/crude1/pump101.discharge_press",
    "site": "houston",
    "unit": "crude1",
    "device": "pump101",
    "measurement": "discharge_press",
    "iotdbPath": "root.houston.crude1.pump101.discharge_press",
    "sparkplugGroup": "houston_crude1",
    "sparkplugDevice": "pump101"
  }
}
```

### 3.2 Template Domain (Phase 3)

| Topic | Producer | Consumer(s) | Retention | Purpose |
|-------|----------|-------------|-----------|---------|
| `template.created` | Template service | Asset Model, downstream | 7d | Template created |
| `template.updated` | Template service | Asset Model, downstream | 7d | Template modified |
| `template.propagated` | Template service | Hierarchy sync | 7d | Inheritance notification |

### 3.3 Display Domain (Phase 2)

| Topic | Producer | Consumer(s) | Retention | Purpose |
|-------|----------|-------------|-----------|---------|
| `display.saved` | Display service | Audit | 7d | Display version saved |
| `display.deployed` | Display service | Audit, notification | 7d | Display deployed to production |

### 3.4 Analysis Domain (Phase 4)

| Topic | Producer | Consumer(s) | Retention | Purpose |
|-------|----------|-------------|-----------|---------|
| `analysis.scheduled` | Analysis-def service | Flink | 7d | Analysis job trigger |
| `analysis.result` | Flink | IoTDB persistence, live.metrics | 24h | Computed value output |

---

## 4. Deprecated Topics (Migrate Away)

These topics exist in the reference app. **Do not use in new code.**

| Topic | Replacement | Migration Path |
|-------|-------------|----------------|
| `af.live.stream` | `live.metrics` via Sparkplug | Flink job outputs to live.* |
| `af.computed.stream` | `live.metrics` | Flink analysis results |
| `af.raw.xml` | Keep for audit only | No new producers |
| `af.events` | `lifecycle-events` | Consolidate event sources |
| `af.template.created` | `template.created` | Port template-service |
| `template.propagated` | Keep name | No change needed |
| `af.analysis.results` | `analysis.result` | Flink migration |

---

## 5. Topic Configuration

### 5.1 Default Settings

```properties
# Production defaults
num.partitions=4
replication.factor=1          # Increase to 3 for production HA
min.insync.replicas=1

# Retention
retention.ms=86400000         # 24 hours default
retention.bytes=-1            # No size limit

# Compaction (for state topics)
cleanup.policy=compact        # For live.* topics
```

### 5.2 Per-Topic Overrides

| Topic Pattern | Cleanup Policy | Retention |
|---------------|----------------|-----------|
| `live.*` | compact | infinite |
| `raw-alarms` | delete | 24h |
| `lifecycle-events` | delete | 30d |
| `operator-actions` | delete | 7d |
| `*.created`, `*.updated` | delete | 7d |

---

## 6. Consumer Groups

| Consumer Group | Service | Topics |
|----------------|---------|--------|
| `ams-backend-2` | AMS API | raw-alarms (ingest watchdog) |
| `flink-ams-operator-actions` | Flink | operator-actions |
| `flink-ams-ack-results` | Flink | ack-results |
| `ams-sparkplug-edge-node` | sparkplug-edge-node | live.alarms, live.metrics |
| `traverse-asset-model` | Asset Model service | template.*, asset.* |
| `traverse-binding-resolver` | Binding Resolver BFF | asset.created, asset.updated |
| `traverse-display-audit` | Display service | display.saved, display.deployed |

---

## 7. Access Control (ACLs)

| Principal | Operations | Topics |
|-----------|------------|--------|
| `ams-api` | Read, Write | operator-actions, lifecycle-events |
| `ams-flink` | Read, Write | all |
| `ams-edge-node` | Read | live.* |
| `traverse-asset` | Read, Write | asset.*, template.* |
| `traverse-display` | Read, Write | display.* |

---

## 8. Validation

### Topic Existence Check

```bash
# List all topics
docker exec ams-kafka kafka-topics --bootstrap-server kafka:9092 --list

# Expected: retained AMS topics present
# raw-alarms
# current-alarm-state
# live.alarms
# live.metrics
# operator-actions
# ack-writeback
# ack-results
# lifecycle-events
```

### Consumer Group Health

```bash
# Check consumer lag
docker exec ams-kafka kafka-consumer-groups \
  --bootstrap-server kafka:9092 \
  --describe --group ams-sparkplug-edge-node

# LAG should be 0 when healthy
```

---

## 9. Invariants

1. **No collisions:** New Traverse topics use distinct names from AMS topics
2. **Backward compatibility:** AMS topics unchanged; AMS services unaffected
3. **Flink as hub:** All computed data flows through Flink to live.* topics
4. **No direct UI publish:** UI never writes to Kafka (goes through API)
5. **Audit trail:** lifecycle-events captures all state transitions
