# Unified Namespace (UNS) Specification

**Document:** Phase 0 Foundation  
**Status:** AUTHORITATIVE  
**Date:** 2026-06-30

---

## 1. Canonical Namespace Pattern

The Asset Model service is the single source of truth for asset identity. Every asset is defined **once** with a contextual, human-readable path. All three representations (IoTDB, Sparkplug, alarm source) are **generated** from this identity.

### 1.1 Pattern

```
root.<site>.<unit>.<device>.<measurement>
```

Insert `<area>` only where a site genuinely needs it:
```
root.<site>.<area>.<unit>.<device>.<measurement>
```

### 1.2 ISA-95 Alignment

| Level | UNS Element | Example |
|-------|-------------|---------|
| Site | `<site>` | `houston` |
| Area (optional) | `<area>` | `refinery1` |
| Unit | `<unit>` | `crude1` |
| Equipment/Device | `<device>` | `pump101` |
| Measurement | `<measurement>` | `discharge_press` |

---

## 2. Generated Representations

From one contextual identity (e.g., `houston/crude1/pump101.discharge_press`), the Asset Model generates:

### 2.1 IoTDB Tree Path

```
root.houston.crude1.pump101.discharge_press
```

**Rules:**
- Periods (`.`) separate hierarchy levels
- Device and measurement separated by period
- All lowercase, underscores for multi-word names

### 2.2 Sparkplug Topic and Metric

| Element | Pattern | Example |
|---------|---------|---------|
| Group ID | `<site>_<unit>` | `houston_crude1` |
| Edge Node ID | Configuration-specific | `edge1` |
| Device ID | `<device>` | `pump101` |
| Metric name | `<device>/<measurement>` | `pump101/discharge_press` |
| Integer alias | Auto-assigned | `1042` |

**Topic:**
```
spBv1.0/houston_crude1/DDATA/edge1/pump101
```

**Metric in payload:**
```json
{
  "name": "pump101/discharge_press",
  "alias": 1042,
  "value": 145.2,
  "dataType": "Double"
}
```

### 2.3 Alarm Source Reference

```
houston/crude1/pump101
```

Used for:
- Alarm event `source` field
- SignalR alarm subscription filtering
- Alarm-to-asset correlation

---

## 3. Migration from `root.ams.site1.alarms.*`

### 3.1 Current AMS Namespace

Existing IoTDB paths follow:
```
root.ams.site1.alarms.<alarm_id>
```

Example: `root.ams.site1.alarms.FIC1002`

### 3.2 Migration Strategy: Dual-Write + Alias Resolution

**Phase A: Alias Mapping (Non-Breaking)**

1. Create an `alias_mapping` table in `traverse_assets`:

```sql
CREATE TABLE alias_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_path TEXT NOT NULL UNIQUE,
    contextual_path TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Example entries:
INSERT INTO alias_mapping (legacy_path, contextual_path) VALUES
    ('root.ams.site1.alarms.FIC1002', 'root.houston.crude1.fic1002.alarm_state'),
    ('root.ams.site1.alarms.PIC2001', 'root.houston.crude1.pic2001.alarm_state');
```

2. Binding Resolver checks alias table first, returns contextual path for resolution.

**Phase B: Dual-Write (Transition)**

1. Flink jobs write to **both** paths during transition:
   - Legacy: `root.ams.site1.alarms.*`
   - Contextual: `root.houston.crude1.*`

2. historian-bff reads from contextual path (preferred) with fallback to legacy.

**Phase C: Legacy Deprecation (Post-Parity)**

1. Stop writing to legacy paths
2. Archive legacy data (optional)
3. Remove alias mappings for fully-migrated assets

### 3.3 Example Mapping

| Legacy Path | Contextual Path | Sparkplug |
|-------------|-----------------|-----------|
| `root.ams.site1.alarms.FIC1002` | `root.houston.crude1.fic1002.alarm_state` | `houston_crude1/DDATA/edge1/fic1002` |
| `root.ams.site1.alarms.PIC2001` | `root.houston.crude1.pic2001.alarm_state` | `houston_crude1/DDATA/edge1/pic2001` |

---

## 4. Binding Resolver Rules

The Binding Resolver BFF resolves `path + role` using this namespace:

### 4.1 Input

```json
{
  "path": "houston/crude1/pump101.discharge_press",
  "role": "live"
}
```

### 4.2 Resolution Logic

```
1. Lookup asset in Asset Model by contextual path
2. If not found, check alias_mapping table
3. Generate transport-specific identifiers:
   - live  → Sparkplug topic + metric, Redis snapshot key
   - history → IoTDB tree path
   - alarm → SignalR channel, alarm source filter
4. Return resolution object
```

### 4.3 Output

```json
{
  "resolved": true,
  "path": "houston/crude1/pump101.discharge_press",
  "live": {
    "sparkplug": {
      "group": "houston_crude1",
      "edge": "edge1",
      "device": "pump101",
      "metric": "pump101/discharge_press",
      "alias": 1042
    },
    "snapshot": {
      "redisKey": "snapshot:metric:pump101:discharge_press"
    }
  },
  "history": {
    "iotdbPath": "root.houston.crude1.pump101.discharge_press"
  },
  "alarm": {
    "source": "houston/crude1/pump101",
    "signalRChannel": "live.alarms"
  }
}
```

---

## 5. Naming Conventions

### 5.1 General Rules

- All identifiers: lowercase
- Multi-word names: underscores (`discharge_press`, not `dischargePress`)
- No spaces or special characters
- Maximum path depth: 6 levels

### 5.2 Reserved Prefixes

| Prefix | Usage |
|--------|-------|
| `root.` | IoTDB tree root |
| `spBv1.0/` | Sparkplug topic prefix |
| `snapshot:` | Redis key prefix |
| `alias:` | Redis alias registry prefix |

### 5.3 Site Naming

| Site | ID | Notes |
|------|----|-------|
| Houston Refinery | `houston` | Primary demo site |
| Demo Site 1 | `demo1` | Development/testing |

---

## 6. Asset Model Schema

The `traverse_assets` database will store:

```sql
CREATE TABLE assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contextual_path TEXT NOT NULL UNIQUE,
    site VARCHAR(64) NOT NULL,
    area VARCHAR(64),
    unit VARCHAR(64) NOT NULL,
    device VARCHAR(64) NOT NULL,
    measurement VARCHAR(64),
    
    -- Generated representations (cached for performance)
    iotdb_path TEXT GENERATED ALWAYS AS (
        'root.' || site || 
        COALESCE('.' || area, '') || 
        '.' || unit || '.' || device || 
        COALESCE('.' || measurement, '')
    ) STORED,
    
    sparkplug_group VARCHAR(128) GENERATED ALWAYS AS (
        site || '_' || unit
    ) STORED,
    
    sparkplug_device VARCHAR(64) GENERATED ALWAYS AS (device) STORED,
    
    alarm_source TEXT GENERATED ALWAYS AS (
        site || '/' || COALESCE(area || '/', '') || unit || '/' || device
    ) STORED,
    
    -- Metadata
    template_id UUID,
    data_type VARCHAR(32) DEFAULT 'Double',
    engineering_unit VARCHAR(32),
    description TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_assets_site ON assets(site);
CREATE INDEX idx_assets_iotdb_path ON assets(iotdb_path);
CREATE INDEX idx_assets_sparkplug ON assets(sparkplug_group, sparkplug_device);
```

---

## 7. Invariants (Enforced)

1. **Single source of truth:** Asset Model defines identity; all representations derived
2. **No hard-coded paths in displays:** Bindings use `path + role` only
3. **Resolver is mandatory:** No direct IoTDB/Sparkplug access from UI
4. **Legacy migration is additive:** Alias mappings, not breaking changes
5. **ISA-95 alignment:** Site → Area (opt) → Unit → Device → Measurement

---

## 8. Acceptance Test

```gherkin
Feature: UNS Resolution

Scenario: Resolve live binding for contextual path
  Given an asset "houston/crude1/pump101.discharge_press" exists
  When the Binding Resolver receives path="houston/crude1/pump101.discharge_press" role="live"
  Then the response contains sparkplug.group="houston_crude1"
  And the response contains sparkplug.device="pump101"
  And the response contains sparkplug.metric="pump101/discharge_press"
  And the response contains snapshot.redisKey starting with "snapshot:metric:"

Scenario: Resolve legacy alias
  Given an alias mapping from "root.ams.site1.alarms.FIC1002" to "root.houston.crude1.fic1002.alarm_state"
  When the Binding Resolver receives path="ams/site1/alarms/FIC1002" role="history"
  Then the response contains iotdbPath="root.houston.crude1.fic1002.alarm_state"
```
