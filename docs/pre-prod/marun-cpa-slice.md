# Marun slice: CPA (Loop Performance) + Administration + Trend + live PV/SP/OP

**Date:** 2026-08-28 (updated same day)  
**Parent:** [marun-instrumental-preprod-analysis.md](marun-instrumental-preprod-analysis.md)  
**Scope:** first Marun product cut is **CPA / Loop Performance**, plus the admin and trend surfaces it needs. CAMS alarms and HMI Designer stay **off** for this cut. Later modules attach to the **same users, same gateway, same auth DB**.

No application code in this pass.

**Names:** UI **Loop Performance** (`/cpm/*`). API **`cplm-api`** (`/api/v1/cpm/*`). Kafka **`clpm.*`** (wire contract). Treat CPA / CPM / CPLM as one product.

---

## Frozen decisions (2026-08-28)

| ID | Decision | Frozen as |
|---|---|---|
| **D-LIVE** | Live PV / SP / OP on the HMI | **In.** Bring `ams-emqx`, `ams-sparkplug-edge-node`, `ams-redis-contract`, cache Redis, and Flink `LoopLiveRbeJob`. |
| **D-AUTH** | Users / roles | **One platform identity.** `traverse_auth` + RS256 + gateway. Same users when alarms / HMI / other modules land. Seed the **full** RBAC catalog now (unused permissions stay unused). No Instrumental SSO unless a later project. |
| **D-INGEST** | How samples arrive | **MQTT → ingestion-service → Kafka.** Phase 2 subscriber **will be built**. Administration → Data Sources is the operator config. Replay/CSV is lab-only, not the Marun path. |
| **D-SLICE** | What runs on Marun first | CPA + live plane + admin subset + trend. Not CAMS, not Designer. Compose/DBs/topics sized so later modules **add** services, they do not replace auth. |

Still open (ops, not product): **T1-lite** (Timescale on `traverse_cplm` vs vanilla PG) and **HTTP** (hostname on Instrumental nginx vs free port). See parent doc.

---

## 0. How this changes the full-stack plan

| Full AMS on Marun | This cut |
|---|---|
| 9 databases including `ams` | **5 databases.** No `ams` alarm schema yet. Add `ams` / `traverse_displays` when those modules land. Auth DB is already the long-term one. |
| ~35 Kafka topics | **CPA + live + audit** list in §4. Alarm topics created in a later cut. |
| 10 standing Flink jobs | **4 standing jobs** (3 diagnosis + Live RBE) + on-demand recompute. |
| Alarm ingest / ACK / mock-dcs | **Off.** |
| Two Redis + EMQX | **In** (live PV/SP/OP). Own instances — do not share Instrumental Redis DB 0 or MQTT client IDs. |
| Frontend | Same SPA. Land on `/cpm`. Unused alarm/HMI routes stay in the bundle so the next module is a compose + topic add, not a new app. |

Reuse Instrumental **Postgres process** and **Kafka cluster**. Bring Flink, IoTDB, EMQX, both Redis, MinIO, gateway, auth, CPA, ingestion, live edge.

---

## 1. What the operator actually uses

### 1.1 Loop Performance (keep)

| Route | Screen | Needs |
|---|---|---|
| `/cpm` | Overview | `cplm-api` + **live MQTT** for PV/SP/OP |
| `/cpm/performance` | Performance | `cplm-api` + live |
| `/cpm/explorer` | Loop Explorer | `cplm-api` + `asset-model` + live |
| `/cpm/historical` | Historical (PV/SP/OP + KPI overlay) | `cplm-api` + **`/api/hist/trend`** |
| `/cpm/windows` | Window inspector | `cplm-api` |
| `/cpm/replay` | Evidence replay | `cplm-api` + Flink JobManager |
| `/cpm/investigation` | Investigation | `cplm-api` |
| `/cpm/calculations` | Calculations | `cplm-api` |
| `/cpm/registry` | **Loop Registry** | `cplm-api` + `asset-model` |
| `/cpm/events` | Loop event frames | `cplm-api` |
| `/cpm/pipeline` | Pipeline health | `cplm-api` + Flink REST |
| `/cpm/governance` | Governance | `cplm-api` + `audit-service` |

Permissions: `analytics.view` on these routes; loop onboarding needs `cpm.manage`. Live paint-on-open also needs `historian.view` (snapshot API).

### 1.2 Trend (keep)

Not alarm history (`/historical`), not the HMI canvas trend dialog.

| Route | Role |
|---|---|
| **`/trend?tags=…&from=&to=`** | Multi-pen historian. CPA historical already deep-links here (`loopTrendHref`). `historian-bff` `/api/hist/trend`. |
| **`/cpm/historical`** | Loop chart + diagnosis + KPI; also `/api/hist/trend`. |
| `/iotdb-trend` | Optional ops explorer. |

Live values on CPA screens are **MQTT / Sparkplug + Redis snapshot**, not the trend page. Trend is history.

### 1.3 Administration

Users are **platform users**, not “CPA-only accounts”. Seed full `permissions` / roles (`37_rbac_catalog.sql` + `33_cpm_permissions.sql` + `47_ingestion_permissions.sql`) so adding CAMS later is grant-a-role, not a new identity service.

| Admin tab | This cut | Later modules |
|---|---|---|
| **User Management** `/admin/users` | **Yes** — the only login store | Same page, same people |
| **Roles & Permissions** `/admin/roles` | **Yes** — including unused `alarm.*` / `display.*` keys | Turn those keys on in roles when the module ships |
| **Plant Model** `/admin/plant-model` | **Yes** | Shared UNS for HMI/alarms later |
| **Tag Aliases** `/admin/aliases` | **Yes** | Same alias table |
| **Data Sources** `/admin/data-sources` | **Yes** — `MQTT_LOOP_SAMPLES` now; other profiles later | Add `MQTT_ALARMS` / telemetry configs without new auth |
| **Audit Log** `/admin/audit` | **Yes** | Same chain |
| Alarm Feed / Alarm Rules / Notifications | Hide or leave unused | Enable with CAMS |
| System Settings | Optional | — |

**Loop Registry** (`/cpm/registry`) is control-engineer admin (wizard + `import-cpm-loops`).

Onboarding order (`docs/plant-model/production-onboarding-flow.md`):

```
Hierarchy → Instruments & tags → OT aliases → Control loops → Ingestion (MQTT)
```

---

## 2. Live PV / SP / OP path (required)

```
OT MQTT broker
    → ingestion-service (MQTT_LOOP_SAMPLES subscriber — to be built)
    → Kafka  loop.samples.v1
         ├→ Flink Short / Long / Fusion     → clpm.*  → cplm-api → Postgres
         ├→ ams-api RawLoopIotDbConsumer    → IoTDB   → /trend, /cpm/historical
         └→ Flink LoopLiveRbeJob            → live.loop.metrics
                → sparkplug-edge-node
                     ├→ EMQX  Sparkplug B DDATA  (browser mqttStore via /mqtt-ws)
                     └→ Redis-contract  snapshot:metric:…  (paint-on-open /api/hist/snapshot)
```

`LoopLiveRbeJob` emits on deadband (numeric PV/SP/OP/VP) or any change (mode/quality). Edge node already subscribes to `live.loop.metrics` (`SparkplugConfig.LIVE_LOOP_METRICS_TOPIC`).

**Two MQTT planes — do not mix them:**

| Plane | Broker | Who connects |
|---|---|---|
| **OT ingest** | Plant / gateway MQTT (URL in Data Sources) | `ingestion-service` subscriber. Client ID e.g. `ams-ingestion-<configId>` — **must not** reuse Instrumental ingestion IDs. |
| **Live HMI** | **`ams-emqx`** (our broker) | `ams-sparkplug-edge-node` (`MQTT_CLIENT_ID=ams-edge-node-1`); browsers `ams-hmi-*` via gateway `/mqtt-ws`. Host **1883** unpublished if Instrumental already owns 1883 — edge talks on the Docker network. |

Do **not** point ingestion at Instrumental’s Kafka topics. Do **not** share Instrumental Redis DB 0 (`snapshot:*` / `cache:*`).

---

## 3. Runtime — what to start vs leave off

### 3.1 Must run

| Container | Why |
|---|---|
| `traverse-gateway` | JWT edge; `/api/v1/cpm`, `/api/assets`, `/api/hist`, `/api/auth`, `/api/ingestion`, `/api/audit`, `/api/bindings`, **`/mqtt-ws`**. |
| `traverse-auth-service` | Platform RS256 / JWKS. DB `traverse_auth`. |
| `traverse-cplm-api` | Registry, KPIs, gates, events, recompute, result consumers. **`Cplm__ConsumersEnabled=true`** (sole member). |
| `traverse-asset-model` | UNS + loop location guard. |
| `traverse-binding-resolver` | Path+role → live / history. |
| `ams-historian-bff` | Trend + snapshot (Redis-contract). |
| `ams-iotdb` | `root.site1.cpm.<loop>.{pv,sp,op,vp,mode}` |
| `ams-flink-jobmanager` + `ams-flink-taskmanager` + supervisor (CPLM list) | Engine + live RBE. |
| `ams-minio` | Checkpoints (long job buffers up to 24 h). |
| `ams-frontend` | SPA. |
| `ams-api` (slim) | `RawLoopIotDbConsumer` only. `AlarmIngestion__Enabled=false`. Never `Cplm__ConsumersEnabled=true`. |
| `traverse-ingestion-service` | Data Sources API **and** (once built) MQTT subscriber → `loop.samples.v1`. |
| `traverse-audit-service` | Governance + `/admin/audit`. |
| **`ams-emqx`** + **`ams-emqx-init`** | Live Sparkplug broker. JWT authenticator vs auth-service JWKS. |
| **`ams-sparkplug-edge-node`** | `live.loop.metrics` → MQTT + Redis snapshots. |
| **`ams-redis-contract`** | `snapshot:*` / `alias:*`, `noeviction`. |
| **`ams-redis`** | Gateway rate-limit `rl:*`. Dedicated instance or DB ≠ 0. |

### 3.2 Do not start this cut

`ams-mock-dcs`; alarm Flink jobs (`OpcEventStreamJob`, alarm `IoTDBPersistenceJob`, `LiveStateJob`, `AlarmKpiStreamJob`, `AlarmStateExportJob`, `AnalysisExecutionJob`); `traverse-display-service`, `traverse-template-service`, `traverse-analysis-service`, `traverse-notification-service`; colliding observability UIs (pgAdmin 5050, kafka-ui 8085, Grafana 3001).

When CAMS/HMI land: add those services + topics + jobs; **do not** recreate auth, gateway, EMQX, Redis, or users.

---

## 4. Databases (create these five)

No `ams` until the alarm module. Skip `39_timescale_policies.sql` unless T1-lite installs Timescale (CPLM tables work as plain Postgres).

| Database | Scripts | Seed |
|---|---|---|
| `traverse_auth` | `17_`, `33_`, **`37_rbac_catalog.sql` (full)**, `38`, `41`, `47_` | Admin + roles with **full permission catalog**. Same users forever. |
| `traverse_assets` | `10_`, `31_`, `43_`, **`48_hdpe_plant_hierarchy.sql`** | HDPE tree. Not houston `15`/`16`. |
| `traverse_cplm` | `29_`, `30_`, `32_`, `34_`, `42_`, `44_` | Loops via registry / `import-cpm-loops` |
| `traverse_ingestion` | `45_`, `46_`, `47_` | Empty until Data Sources MQTT configs |
| `traverse_audit` | `24_` | Service `EnsureCreated` |

**Skip until later modules:** `ams`, `traverse_displays`, `traverse_templates`, `traverse_analysis`.

Role: `ams_user` granted **only** on these DBs (extend GRANT when `ams` is added).

---

## 5. Kafka topics (create these)

`--if-not-exists`, RF=3, minISR=2, on Instrumental brokers. Inventory first (`live.metrics` / `audit-events` collision risk). Do **not** create alarm topics yet.

| Topic | Parts | Policy | Retention | Required |
|---|---|---|---|---|
| `loop.samples.v1` | 16 | delete | 7 d | **Yes** — MQTT ingest + engine |
| `clpm.feature.short.v1` | 8 | delete | 7 d | **Yes** |
| `clpm.feature.long.v1` | 8 | delete | 7 d | **Yes** |
| `clpm.gate.results.v1` | 8 | delete | **30 d** | **Yes** |
| `ams.metadata.updates` | 3 | compact | — | **Yes** — jobs subscribe unconditionally |
| `context.parameter-set.v1` | 3 | compact | — | **Yes** — threshold governance |
| **`live.loop.metrics`** | 8 | delete | 7 d | **Yes** — live PV/SP/OP |
| `audit-events` | 4 | delete | 7 d | **Yes** — ingestion + cplm audit |
| `cplm.replay.{id}` | 1 | delete | 2 h | On demand (recompute) |

Optional later (HMI telemetry, not this cut): `live.metrics`, `live.alarms`.

Consumer groups after traffic:

- `flink-ams-cplm` (+ short / long / fusion / `…-live-rbe`)
- `ams-api-cplm-results` / `ams-api-cplm-results-frames` — **one member** (`cplm-api`)
- `ams-iotdb-raw-loop`
- `ams-sparkplug-edge-node` (now includes `live.loop.metrics`)

---

## 6. Flink jobs (04b)

Topics first, then jobs. Fusion last (`latest()` sources).

| Job name | Class | This cut |
|---|---|---|
| `AMS - CPLM Short Feature Engine` | `CplmShortFeatureStreamJob` | **Yes** |
| `AMS - CPLM Long Diagnostics Engine` | `CplmLongDiagnosticsStreamJob` | **Yes** |
| `AMS - CPLM Gate Fusion Engine` | `CplmGateFusionStreamJob` | **Yes** |
| **`AMS - Loop Live RBE Engine`** | `LoopLiveRbeJob` | **Yes** — live PV/SP/OP |
| Replay / A8 recompute | on-demand | When operator hits Replay |

Do not submit alarm jobs or `CplmGateStreamJob` (legacy double-producer).

---

## 7. MQTT ingestion (chosen path — to be built)

**Today:** `ingestion-service` is **config + connection test** (`docs/ot-data-integration/05-mqtt-source-config-implementation-plan.md`). Profile `MQTT_LOOP_SAMPLES` already names destination `loop.samples.v1` and default topics `ot/loops/#`. **No subscriber writes Kafka yet.**

**Marun product path:** build phase 2 so an **active** Data Source:

1. CONNECT to the OT broker in the config (QoS 1, stable client id, unique vs Instrumental).
2. Subscribe to configured topics.
3. Parse payload → canonical loop sample (`loop_id`, `event_ts_ms`, `pv`/`sp`/`op`/`vp`/`mode`/`quality` — see `docs/cplm-intake/CPLM-02-technical-contract.md`). Join per-loop using **Loop Registry** `sourceTag` / tag map.
4. Produce to `loop.samples.v1` keyed by `loop_id`.
5. Update `last_data_received`; DLQ / park unknown tags (aliases exist for this).

Until that ships, Data Sources UI works and **live + trends + verdicts stay empty**. Lab replay remains a **dev** tool only.

**EMQX vs OT broker:** browsers and the edge node use **`ams-emqx`**. Ingestion uses whatever `connection_url` the operator saves (usually the **plant MQTT gateway**, not `ams-emqx`, unless OT is publishing into our broker on purpose).

---

## 8. Operator onboarding order

1. Hierarchy — `48_hdpe_plant_hierarchy.sql` or Plant Model.  
2. Instruments & tags — CSV / `import-plant-tags`.  
3. OT aliases — `ot_tag` column or Tag Aliases.  
4. Loops — `/cpm/registry` or `import-cpm-loops`. Activate → `CpmLoop` under the unit.  
5. **Data Sources** — MQTT loop-sample config, Test, Activate.  
6. Confirm `loop.samples.v1` traffic → Pipeline Health → live PV/SP/OP on `/cpm` → `/cpm/historical` + `/trend`.  
7. Pilot 2–3 loops (≥ ~12 h for long windows), then batch.

---

## 9. HTTP / UI on Marun

Same `:80` rule as the parent: Instrumental keeps bare IP. CPA hostname (e.g. `cpa.<plant>`) → `ams-frontend`. Gateway `/mqtt-ws` must be on that vhost (WebSocket).

v1: **same SPA** (users already have the full permission catalog). Default `/` → `/cpm` can wait. Do not build a second login.

---

## 10. Compose overlay sketch

Attach to `instrumental-network`. **Do not** define `postgres` / `kafka` / `zookeeper`.

```text
up:
  gateway, auth, asset-model, binding-resolver, cplm-api,
  historian-bff, iotdb, flink-jm, flink-tm, minio, frontend,
  ams-api (AlarmIngestion off),
  ingestion-service, audit-service,
  emqx, emqx-init, sparkplug-edge-node,
  redis (cache), redis-contract
```

Env that must stay correct:

- Kafka bootstrap `kafka-1:9092,kafka-2:9092,kafka-3:9092`
- Postgres = Instrumental hostname, **new** DB names
- `Cplm__ConsumersEnabled=true` **only** on `cplm-api`
- `AlarmIngestion__Enabled=false` on `ams-api`
- Edge: `LIVE_LOOP_METRICS_TOPIC=live.loop.metrics`, `MQTT_CLIENT_ID=ams-edge-node-1`, Redis = **contract** instance
- `CplmRecompute__JarPath` + jar mount for Replay
- EMQX JWT vs `http://auth-service:3002/api/auth/.well-known/jwks.json`
- Do not publish host `1883` / `3000` / `9093` if Instrumental owns them

---

## 11. `migration/` for this slice

| Script | Behaviour |
|---|---|
| `00` | Docker, RAM (Flink + EMQX), free **this app’s** ports, `instrumental-network`, postgres + kafka-1 healthy |
| `01` | Five DBs in §4 — never Instrumental names; never `ams` yet |
| `02` | Schema for those five. Skip `ams` Timescale init. Skip `39` unless T1-lite |
| `03` | HDPE + **full** auth catalog + admin user. Loops via site CSV, not default |
| `04` | §5 topic list only (`live.loop.metrics` included) |
| `04b` | Four Flink jobs (including Loop Live RBE) |
| `05` | Containers healthy; DBs/tables; every topic; four jobs RUNNING; gateway `/gw/health`; MQTT/EMQX up; **Instrumental still healthy** |
| `deploy.sh` | Tee log; this overlay only |

`05` cannot require Kafka sample rate until ingestion phase 2 is live — then add: `loop.samples.v1` bytes in, Redis snapshot key for a pilot loop, Flink live-RBE RUNNING.

---

## 12. Print checklist

**In**

- [ ] `/cpm/*` + `/trend` + `/admin` users/roles/plant-model/aliases/data-sources/audit
- [ ] Live plane: `ams-emqx`, `ams-sparkplug-edge-node`, `ams-redis-contract`, `ams-redis`, `LoopLiveRbeJob`, `live.loop.metrics`
- [ ] Ingestion-service in compose; MQTT subscriber **to be built** (D-INGEST)
- [ ] Platform auth: full RBAC seed; same users for later modules
- [ ] DBs: five `traverse_*` listed in §4
- [ ] Topics: §5 including `live.loop.metrics` and `audit-events`
- [ ] Flink: Short + Long + Fusion + Live RBE
- [ ] `ams-api` slim: raw loop → IoTDB; alarms off
- [ ] Unique MQTT client IDs; Redis not Instrumental DB 0
- [ ] Join `instrumental-network`; no `:80` / `:3000`

**Out this cut**

- [ ] No `ams` alarm DB, no alarm topics, no alarm Flink jobs
- [ ] No mock-dcs, no display/template/analysis/notification services
- [ ] No Alarm Feed / Alarm Rules / Notifications as required screens

**Still decide (ops)**

- [ ] T1-lite: vanilla PG vs Timescale on CPLM result tables
- [ ] HTTP: hostname vs free port
- [ ] OT MQTT URL / TLS for Data Sources (plant broker, not necessarily `ams-emqx`)

---

## 13. Sequence

1. Ops: T1-lite + HTTP + OT MQTT broker details.  
2. Marun inventory (DBs, topics, ports, MQTT 1883).  
3. Compose overlay as §10.  
4. **Build ingestion phase 2** (MQTT → `loop.samples.v1`) — this is product code, not just scripts.  
5. Write `migration/` 00–05 with the lists in this file.  
6. Dry-run empty DBs.  
7. Marun: HDPE → tags → aliases → loops → activate MQTT source → live PV/SP/OP + historical trend.  
8. Confirm Instrumental still healthy.

**Rollback:** `compose down` this overlay; `DROP` only the five `traverse_*` DBs; delete only §5 topics; cancel only `AMS - CPLM *` and `AMS - Loop Live RBE Engine`.
