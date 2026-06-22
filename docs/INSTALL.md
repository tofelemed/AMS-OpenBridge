# AMS – Enterprise Consolidated Alarm Management System
## Complete Technical Architecture & Installation Guide

### OPC A&E 1.10 Compliant | ISA-18.2 | EEMUA-191 | IEC 61511

---

## Table of Contents
1. [System Architecture](#architecture)
2. [Installation Guide](#installation)
3. [OPC Integration Guide](#opc)
4. [API Reference](#api)
5. [Deployment Guide](#deployment)
6. [Disaster Recovery](#dr)
7. [User Manual](#user)
8. [Administrator Manual](#admin)

---

## 1. System Architecture {#architecture}

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    INDUSTRIAL PLANT NETWORK (OT)                │
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │Honeywell │ │ Emerson  │ │Yokogawa  │ │   ABB / GE /     │  │
│  │ Experion │ │  DeltaV  │ │  Centum  │ │ Foxboro / Others │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────────┬─────────┘  │
│       │             │             │                 │            │
│       └─────────────┴─────────────┴─────────────────┘          │
│                             │ OPC A&E 1.10                       │
└─────────────────────────────┼───────────────────────────────────┘
                              │ DCOM-Free REST/SSE (DMZ)
                    ┌─────────▼──────────┐
                    │   AMS OPC Gateway  │
                    │ (DCOM→REST Bridge) │
                    │  Port 8082         │
                    └─────────┬──────────┘
                              │ SSE / REST
┌─────────────────────────────▼───────────────────────────────────┐
│                     AMS PLATFORM (IT / DMZ)                      │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              KAFKA CLUSTER (Event Streaming)             │    │
│  │  raw-opc-events → normalized-alarms → active-alarms     │    │
│  │  soe-events → alarm-analytics → notification-events     │    │
│  └────────────────────────┬────────────────────────────────┘    │
│                           │                                      │
│  ┌────────────────────────▼────────────────────────────────┐    │
│  │         APACHE FLINK (Stream Processing Cluster)         │    │
│  │  • OPC Event Normalization                               │    │
│  │  • Alarm Deduplication (60s keyed window)               │    │
│  │  • SOE Ordering (ms precision, event-time)              │    │
│  │  • Alarm Correlation Engine (stateful CEP)              │    │
│  │  • Flood Detection (ISA-18.2: >10/10min)               │    │
│  │  • Chattering Detection (EEMUA-191: >2 trans/10min)    │    │
│  │  • Bad Actor Analysis (ISA-18.2 top-10)                │    │
│  │  • KPI Aggregation (tumbling + sliding windows)         │    │
│  └────────────────────────┬────────────────────────────────┘    │
│                           │                                      │
│  ┌──────────────┐  ┌──────▼──────────────────────────────┐     │
│  │   KEYCLOAK   │  │     ASP.NET Core 8 REST API          │     │
│  │  (RBAC/LDAP) │  │  • CQRS + MediatR                   │     │
│  │  Port 8080   │◄─┤  • SignalR (real-time streaming)     │     │
│  └──────────────┘  │  • gRPC inter-service                │     │
│                    │  • Swagger/OpenAPI v1                 │     │
│                    │  • Rate limiting + security headers   │     │
│                    │  Port 8000/8001                       │     │
│                    └──────────┬──────────────────────────┘     │
│                               │                                  │
│  ┌────────────────────────────▼────────────────────────────┐    │
│  │         PostgreSQL 16 + TimescaleDB (Primary DB)         │    │
│  │  Schemas: alarms | soe | analytics | security | audit    │    │
│  │  Hypertables: historical_alarms, soe.events, transitions │    │
│  │  Continuous Aggregates: 10min, 1h, daily rates          │    │
│  │  Compression: 7-day auto | Retention: 5 years            │    │
│  │  Partitions: by time (daily chunks)                      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │    REDIS 7   │  │  PROMETHEUS  │  │       GRAFANA       │   │
│  │  (Cache/SSO) │  │  (Metrics)   │  │   (Observability)   │   │
│  └──────────────┘  └──────────────┘  └─────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                    REACT FRONTEND (Operator UI)                  │
│                                                                  │
│  • AG Grid Enterprise virtualized alarm console                 │
│  • ECharts real-time KPI dashboards                             │
│  • D3.js SOE timeline visualization                             │
│  • SignalR WebSocket real-time updates                          │
│  • ISA-18.2 priority coloring + flood alerts                    │
│  • Keyboard shortcuts (Ctrl+A, Ctrl+Shift+A, etc.)             │
│  • Multi-screen deployment support                              │
│  • Keycloak SSO + MFA                                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Installation Guide {#installation}

### Prerequisites

| Component        | Version  | Notes                           |
|------------------|----------|---------------------------------|
| Docker           | 26.x+    | Docker Desktop or Engine        |
| Docker Compose   | 2.27+    | Included with Docker Desktop    |
| Node.js          | 20 LTS   | For frontend dev only           |
| .NET SDK         | 8.0 LTS  | For backend dev only            |
| Java             | 17 LTS   | For Flink dev only              |
| kubectl          | 1.29+    | For Kubernetes deployment       |
| helm             | 3.14+    | For K8s deployment              |

### Step 1: Clone and Configure

```bash
git clone https://github.com/your-org/ams.git
cd ams

# Copy and edit environment configuration
cp infra/docker/.env.example infra/docker/.env
```

Edit `infra/docker/.env`:
```env
POSTGRES_PASSWORD=<strong-password-32chars>
REDIS_PASSWORD=<strong-password>
KEYCLOAK_ADMIN_PASSWORD=<admin-password>
KEYCLOAK_HOSTNAME=localhost
GRAFANA_PASSWORD=<grafana-password>
GRAFANA_OAUTH_SECRET=<oauth-secret>
TLS_CERT_PASSWORD=<cert-password>
SEQ_ADMIN_PASSWORD_HASH=<bcrypt-hash>
```

### Step 2: Generate TLS Certificates

```bash
cd infra/docker

# Self-signed for development (replace with CA-signed for production)
mkdir -p certs
openssl req -x509 -newkey rsa:4096 -sha256 -days 365 \
  -keyout certs/tls.key -out certs/tls.crt \
  -subj "/CN=ams-local/O=AMS/C=US" \
  -addext "subjectAltName=DNS:localhost,DNS:ams-api,IP:127.0.0.1"

# Convert to PFX for .NET
openssl pkcs12 -export \
  -out certs/tls.pfx \
  -inkey certs/tls.key \
  -in certs/tls.crt \
  -passout pass:${TLS_CERT_PASSWORD}
```

### Step 3: Start Core Infrastructure

```bash
cd infra/docker

# Start database and messaging infrastructure first
docker compose up -d postgres redis zookeeper kafka schema-registry kafka-init

# Wait for health checks (~60s)
docker compose ps

# Apply database schemas
docker compose exec postgres psql -U ams_user -d ams \
  -f /docker-entrypoint-initdb.d/01_init_extensions.sql \
  -f /docker-entrypoint-initdb.d/02_alarm_schema.sql \
  -f /docker-entrypoint-initdb.d/03_soe_schema.sql \
  -f /docker-entrypoint-initdb.d/04_analytics_schema.sql \
  -f /docker-entrypoint-initdb.d/05_security_audit_notification.sql
```

### Step 4: Start Application Services

```bash
# Start Keycloak (RBAC/SSO)
docker compose up -d keycloak
# Wait ~90s for Keycloak to initialize

# Start AMS API
docker compose up -d ams-api

# Start Flink cluster
docker compose up -d flink-jobmanager flink-taskmanager

# Start observability stack
docker compose up -d prometheus grafana seq

# Start frontend
docker compose up -d ams-frontend
```

### Step 5: Deploy Flink Jobs

```bash
# Build Flink JAR
cd src/flink
mvn clean package -DskipTests -Pproduction

# Deploy OPC Event Stream Processor
curl -X POST http://localhost:8082/jars/upload \
  -H "Expect:" \
  -F "jarfile=@target/ams-flink-1.0.0.jar"

# Submit job
curl -X POST http://localhost:8082/jars/<jar-id>/run \
  -H "Content-Type: application/json" \
  -d '{
    "programArgs": "--kafka.bootstrap-servers kafka:29092 --postgres.url jdbc:postgresql://postgres:5432/ams",
    "parallelism": 4,
    "entryClass": "com.ams.flink.OpcEventStreamJob"
  }'
```

### Step 6: Configure Keycloak

```bash
# Import AMS realm (users, roles, OIDC clients)
curl -X POST http://localhost:8080/admin/realms \
  -H "Authorization: Bearer $(curl -s -X POST http://localhost:8080/realms/master/protocol/openid-connect/token \
    -d 'client_id=admin-cli&grant_type=password&username=admin&password=${KEYCLOAK_ADMIN_PASSWORD}' | jq -r .access_token)" \
  -H "Content-Type: application/json" \
  -d @infra/docker/keycloak/realm-ams.json
```

### Step 7: Verify Installation

```bash
# Health checks
curl http://localhost:8000/health/ready    # API
curl http://localhost:8082/v1/overview     # Flink
curl http://localhost:8080/health/ready    # Keycloak
curl http://localhost:9090/-/healthy       # Prometheus

# Access points
echo "Frontend:   http://localhost:3000"
echo "API Swagger: http://localhost:8000/swagger"
echo "Grafana:    http://localhost:3001"
echo "Flink UI:   http://localhost:8082"
echo "Keycloak:   http://localhost:8080"
echo "Seq Logs:   http://localhost:8084"
```

---

## 3. OPC Integration Guide {#opc}

### Supported Vendors

| Vendor        | OPC A&E | OPC DA | Protocol  | Notes                         |
|---------------|---------|--------|-----------|-------------------------------|
| Honeywell     | ✅      | ✅     | REST/SSE  | Experion R500+                |
| Emerson       | ✅      | ✅     | REST/SSE  | DeltaV v14+                   |
| Yokogawa      | ✅      | ✅     | REST/SSE  | Centum VP                     |
| Foxboro       | ✅      | ✅     | REST/SSE  | I/A Series                    |
| Matrikon      | ✅      | ✅     | REST/SSE  | OPC Bridge                    |
| ABB           | ✅      | ✅     | REST/SSE  | 800xA v6+                     |
| GE            | ✅      | ✅     | REST/SSE  | iFIX, Cimplicity               |

### Adding an OPC A&E Server

#### Via REST API (recommended)
```bash
curl -X POST http://localhost:8000/api/v1/configuration/opc-servers \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name":               "Honeywell Experion Unit 1",
    "sourceType":         "OPC_AE",
    "host":               "192.168.10.50",
    "port":               4840,
    "progId":             "Honeywell.AlarmEventServer.1",
    "subscriptionString": "Unit1/*",
    "pollIntervalMs":     1000,
    "eventTypeFilter":    4,
    "severityMin":        1,
    "severityMax":        1000,
    "areaFilter":         ["Unit1/Reactor", "Unit1/Distillation"],
    "storeForwardEnabled": true,
    "backfillEnabled":    true,
    "backfillLookbackHours": 24,
    "attributesRequested": [100, 101, 102]
  }'
```

### OPC A&E 1.10 Compliance

The system implements the following OPC A&E 1.10 specification items:

- **ONEVENTSTRUCT** — Full field mapping (Section 3.2)
- **Event Types** — SIMPLE(1), TRACKING(2), CONDITION(4) (Section 3.3)
- **Condition States** — Active/Inactive/Ack/Unack bitmask (Section 3.4)
- **Severity** — 1-1000 scale mapped to priority (Section 3.5)
- **ChangeMask** — Full bitmask interpretation (Section 6.3)
- **Sequence Numbers** — Gap detection and validation
- **IOPCEventSubscriptionMgt** — Subscription lifecycle management
- **IOPCEventServer** — GetStatus, GetEventCategories, GetConditionNames
- **Backfill** — QueryEventHistory equivalent via gateway

### No-DCOM Architecture

```
DCS/SCADA ──(DCOM)──► OPC A&E Server (on plant network)
                              │
                     OPC Gateway Process
                     (runs on plant network)
                              │ REST/SSE (HTTP/HTTPS)
                     Firewall (DMZ)
                              │
                     AMS OPC Connector
                     (runs in AMS platform)
```

The AMS OPC Gateway translates DCOM OPC A&E calls to DCOM-free REST/SSE, eliminating:
- DCOM firewall issues
- Windows-specific deployment requirements
- OPC tunneler licensing costs

---

## 4. API Reference {#api}

### Base URL
```
https://ams.example.com/api/v1
```

### Authentication
```
Authorization: Bearer <Keycloak JWT>
```

### Key Endpoints

| Method | Endpoint                           | Permission              | Description                |
|--------|------------------------------------|-------------------------|----------------------------|
| GET    | /alarms/active                     | alarm.view              | Get active alarms          |
| GET    | /alarms/active/statistics          | alarm.view              | Real-time KPIs             |
| POST   | /alarms/{id}/acknowledge           | alarm.acknowledge       | Acknowledge alarm          |
| POST   | /alarms/acknowledge/batch          | alarm.acknowledge_batch | Batch acknowledge          |
| POST   | /alarms/{id}/shelve                | alarm.shelve            | Shelve alarm               |
| DELETE | /alarms/{id}/shelve                | alarm.unshelve          | Unshelve alarm             |
| POST   | /alarms/{id}/suppress              | alarm.suppress          | Suppress alarm             |
| GET    | /alarms/historical                 | alarm.view              | Historical query           |
| GET    | /alarms/historical/stream          | alarm.export            | Stream as NDJSON           |
| GET    | /soe/events                        | soe.view                | SOE events query           |
| POST   | /soe/replay                        | soe.replay              | Create replay session      |
| GET    | /analytics/kpi                     | analytics.view          | KPI dashboard data         |
| GET    | /analytics/flood                   | analytics.view          | Flood event history        |
| GET    | /analytics/chattering              | analytics.view          | Chattering alarm report    |
| GET    | /analytics/bad-actors              | analytics.view          | Bad actor ranking          |
| GET    | /configuration/opc-servers         | config.opc_servers.view | List OPC servers           |
| POST   | /configuration/opc-servers         | config.opc_servers.edit | Add OPC server             |
| GET    | /health                            | (public)                | Health check               |
| GET    | /health/ready                      | (public)                | Readiness check            |

### SignalR Hub: `/hubs/alarms`

**Connection:**
```javascript
const conn = new HubConnectionBuilder()
  .withUrl('/hubs/alarms', { accessTokenFactory: () => token })
  .withAutomaticReconnect()
  .build();

// Subscribe to events
conn.on('OnNewAlarm', (alarm) => { ... });
conn.on('OnAlarmUpdated', (alarm) => { ... });
conn.on('OnAlarmCleared', ({ alarmId }) => { ... });
conn.on('OnFloodAlert', (alert) => { ... });
conn.on('OnSoeEvent', (event) => { ... });
```

**Groups (invoke after connect):**
```javascript
await conn.invoke('SubscribeToServer', 'server-uuid');
await conn.invoke('SubscribeToPriority', 'CRITICAL');
await conn.invoke('SubscribeToArea', 'area-uuid');
```

---

## 5. Deployment Guide {#deployment}

### Kubernetes Deployment

```bash
# Add Helm repo
helm repo add ams https://charts.ams.example.com
helm repo update

# Deploy to production namespace
helm install ams-prod ams/ams \
  --namespace ams-prod \
  --create-namespace \
  --values values-prod.yaml \
  --wait --timeout 15m
```

### Kubernetes Resource Requirements

| Service          | CPU Request | CPU Limit | Memory Request | Memory Limit |
|------------------|-------------|-----------|----------------|--------------|
| ams-api          | 500m        | 2000m     | 512Mi          | 2Gi          |
| postgres         | 1000m       | 4000m     | 2Gi            | 8Gi          |
| kafka            | 500m        | 2000m     | 1Gi            | 4Gi          |
| flink-jobmanager | 500m        | 2000m     | 2Gi            | 4Gi          |
| flink-taskmanager| 1000m       | 4000m     | 4Gi            | 8Gi          |
| redis            | 100m        | 500m      | 256Mi          | 1Gi          |
| keycloak         | 500m        | 2000m     | 1Gi            | 2Gi          |

### High Availability Configuration

For production HA deployment:
- **API**: 3+ replicas behind load balancer
- **PostgreSQL**: TimescaleDB HA with streaming replication + failover (Patroni)
- **Kafka**: 3-node cluster with RF=3, min-ISR=2
- **Flink**: 2x JobManager (standby), 4+ TaskManagers
- **Redis**: Redis Sentinel (3 nodes) or Redis Cluster

---

## 6. Disaster Recovery {#dr}

### RTO/RPO Targets

| Tier    | Scenario                    | RTO   | RPO   |
|---------|-----------------------------|-------|-------|
| Tier 1  | Single service failure      | <1min | 0     |
| Tier 2  | Database failover           | <5min | <30s  |
| Tier 3  | Full site failure           | <30min| <5min |
| Tier 4  | Data corruption             | <2h   | <1h   |

### Backup Procedures

```bash
# PostgreSQL backup (daily, automated)
pg_dump -Fc -h postgres -U ams_user ams > ams_backup_$(date +%Y%m%d).dump

# TimescaleDB continuous backup
# Configured via pgBackRest or Barman

# Flink checkpoint backup
# S3: s3://ams-backups/flink-checkpoints/

# Kafka topic replication
# Cross-datacenter MirrorMaker 2 configuration
```

### Recovery Procedures

```bash
# Restore PostgreSQL
pg_restore -h postgres -U ams_user -d ams ams_backup_20260101.dump

# Restore Flink from checkpoint
curl -X POST http://flink-jobmanager:8081/jobs/{job-id}/savepoints \
  -H "Content-Type: application/json" \
  -d '{"cancel-job": false}'
```

---

## 7. User Manual {#user}

### Alarm Console

**Keyboard Shortcuts:**

| Shortcut       | Action                          |
|----------------|---------------------------------|
| Ctrl+A         | Select all visible alarms       |
| Ctrl+Shift+A   | Batch acknowledge selected      |
| Ctrl+Shift+S   | Shelve selected alarms          |
| F5             | Manual refresh                  |
| Escape         | Clear selection / Close dialogs |
| Ctrl+F         | Focus search filter             |
| Alt+C          | Toggle alarm sounds             |

**Priority Color Legend (ISA-18.2):**

| Color  | Priority    | Severity Range | Action Required        |
|--------|-------------|----------------|------------------------|
| 🔴 Red    | Critical    | 900-1000       | Immediate response     |
| 🟠 Orange | High        | 700-899        | Prompt response        |
| 🟡 Yellow | Medium      | 400-699        | Response within shift  |
| 🔵 Blue   | Low         | 1-399          | Monitor               |
| 🟢 Green  | Diagnostic  | 1-99           | Information only       |

**Blinking alarms** = Critical AND unacknowledged → requires immediate action.

### Shelving (ISA-18.2 Section 11)

- Maximum shelve duration: **8 hours** (480 minutes)
- Comment is **mandatory** per ISA-18.2
- Alarm auto-unshelves when duration expires
- Shelved alarms still appear in SOE history

### Alarm Acknowledgement

1. Click alarm row to select
2. Press **Ctrl+Shift+A** or click **Acknowledge** in toolbar
3. Enter optional comment
4. Confirm — response time is recorded for MTTA metrics

---

## 8. Administrator Manual {#admin}

### User Management

**Roles:**

| Role         | Description                                        |
|--------------|----------------------------------------------------|
| SYSTEM_ADMIN | Full system access including user management       |
| ENGINEER     | Alarm config, analytics, acknowledgement           |
| SUPERVISOR   | Acknowledge, shelve, suppress, analytics           |
| OPERATOR     | Acknowledge, shelve, view alarms                   |
| VIEWER       | View only — no write operations                    |
| AUDITOR      | Read + export — no write operations                |

### ISA-18.2 Compliance Checklist

- [x] Alarm priority levels (Critical/High/Medium/Low)
- [x] Alarm state machine (active/inactive/ack/unack)
- [x] Alarm shelving with mandatory comment and max 8h duration
- [x] Alarm suppression by design
- [x] Out-of-service state
- [x] Flood detection (>10 alarms/10 min)
- [x] Chattering detection (>2 transitions/10 min)
- [x] Bad actor identification (top 10)
- [x] MTTA/MTTR calculation and reporting
- [x] Operator response metrics per shift
- [x] Audit trail for all actions (immutable)
- [x] SOE with millisecond timestamps

### EEMUA-191 Target Metrics

| KPI                    | Acceptable | Good    | Best Practice |
|------------------------|------------|---------|---------------|
| Alarms per operator/10min | <10    | <5      | <1            |
| % acknowledged         | >80%       | >90%    | >95%          |
| Chattering alarms      | <5%        | <2%     | <1%           |
| Standing alarms        | <5%        | <2%     | <1%           |

### Monitoring & Alerting

Access Grafana dashboards at `http://ams.example.com:3001`:
- **AMS Overview** — Active alarms, KPIs, server status
- **Flink Streaming** — Job health, throughput, lag
- **Database Performance** — Query times, connections, disk
- **Kafka Metrics** — Consumer lag, throughput, partition balance

---

## File Structure Reference

```
AMS/
├── src/
│   ├── backend/
│   │   ├── AMS.Domain/           # Entities, events, repository interfaces
│   │   ├── AMS.Application/      # CQRS commands/queries, validators
│   │   ├── AMS.Infrastructure/   # EF Core, Kafka, OPC connector, repositories
│   │   └── AMS.Api/              # Controllers, SignalR hub, Program.cs
│   ├── flink/                    # Apache Flink Java jobs
│   └── frontend/                 # React + TypeScript application
├── database/
│   ├── scripts/                  # PostgreSQL + TimescaleDB DDL
│   └── procedures/               # Stored procedures
├── infra/
│   ├── docker/                   # Docker Compose + configs
│   ├── k8s/                      # Kubernetes manifests
│   ├── helm/                     # Helm charts
│   └── ci/                       # CI/CD pipelines
├── docs/                         # This documentation
└── monitoring/                   # Prometheus rules, Grafana dashboards
```
