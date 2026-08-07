# AMS / Traverse — Architecture Review Pack

**Source of truth:** code + `infra/docker/docker-compose.yml` (not legacy README claims).  
**Audience:** technical product managers / architects onboarding.

| Doc | Contents |
|---|---|
| [01-system-overview.md](./01-system-overview.md) | What the product is, layers, why each tech |
| [02-docker-compose-services.md](./02-docker-compose-services.md) | Every compose service, ports, role |
| [03-microservices-catalog.md](./03-microservices-catalog.md) | `src/services/*` + `src/backend` capabilities |
| [04-data-flows.md](./04-data-flows.md) | End-to-end pipelines (alarm, live, history, CPLM, HMI) |
| [05-flink-jobs.md](./05-flink-jobs.md) | Standing / on-demand / dead Flink jobs |
| [06-iotdb-historian.md](./06-iotdb-historian.md) | Writers, path trees, readers |
| [07-mqtt-sparkplug-live.md](./07-mqtt-sparkplug-live.md) | Kafka → Sparkplug → EMQX → Redis → UI |
| [08-auth-architecture.md](./08-auth-architecture.md) | Why TraverseAuth is copied into every service |
| [09-databases.md](./09-databases.md) | Postgres DBs, init scripts, ownership |
| [10-cleanup-and-reorg.md](./10-cleanup-and-reorg.md) | Unused paths + proposed folder structure |

```mermaid
flowchart TB
  subgraph UI["UI"]
    FE[frontend-ob :3000 / :5174]
  end
  subgraph Edge["Edge / Live"]
    SP[sparkplug-edge-node]
    EMQX[EMQX MQTT]
    REDIS[(Redis)]
  end
  subgraph Stream["Stream Compute"]
    K[(Kafka)]
    FL[Flink 1.18]
  end
  subgraph Hist["Historian"]
    IOT[(IoTDB)]
    HBFF[historian-bff]
  end
  subgraph Apps["App Services"]
    API[ams-api]
    AUTH[auth-service]
    AMS[asset / display / template / analysis]
    BIND[binding-resolver]
    CPLM[cplm-api]
    AUD[audit-service]
  end
  subgraph PG["Postgres / Timescale"]
    DB[(ams + traverse_*)]
  end
  FE --> AUTH
  FE --> API
  FE --> AMS
  FE --> BIND
  FE --> CPLM
  FE --> HBFF
  FE --> EMQX
  API --> K
  API --> DB
  FL --> K
  FL --> IOT
  SP --> K
  SP --> EMQX
  SP --> REDIS
  HBFF --> IOT
  HBFF --> REDIS
  CPLM --> DB
  CPLM --> K
  CPLM --> IOT
```

**Start here if new:** `01` → `04` → `02` → `05` → `08` → `10`.
