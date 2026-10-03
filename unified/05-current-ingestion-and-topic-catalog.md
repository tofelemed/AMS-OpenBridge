# Current state: ingestion paths, topic catalog and message envelopes

Read-only analysis of the AMS-open monorepo, 2026-09-30. Everything below was verified in code/config
unless marked "(inferred)". Where a document and the code disagree, the code is trusted and the
document is named as stale.

## 1. Scope and sources examined

- Docs: `architecture_document.md`, `prod_decision.md`, `pipeline.md`, `MIGRATION_LOG.md` (Recorded
  Decisions), `changes_tracker.md` (CHG-031), `docs/production-contracts.md`, `docs/api-gateway.md`,
  `docs/ot-data-integration/*` (12 files), `migration/MARUN-CONTEXT.md` §12b, `migration/kafka/topics.txt`,
  `infra/windows/opc-gateway-deploy.md`.
- Infra: `infra/docker/docker-compose.yml` (1744 lines, all service blocks), `infra/docker/emqx/acl.conf`,
  `infra/docker/emqx/emqx-init.sh`, `infra/docker/.env.example` (key names only), `infra/docker/iotdb-init-ttl.sh`,
  `infra/docker/flink-submit-raw-alarms.sh`, `infra/docker/flink-job-supervisor.sh`,
  `scripts/kafka-reset-lab-topics.ps1`, `migration/04-create-kafka-topics.sh`, `migration/04c-apply-topic-retention.sh`.
- Code: `src/backend/AMS.Api/BackgroundServices/*`, `src/backend/AMS.Infrastructure/Kafka/*`,
  `src/flink/src/main/java/com/ams/flink/**` (all job entry points + `KafkaSinks`, `CplmTopics`),
  `src/services/ingestion-service/**`, `src/services/sparkplug-edge-node/**`, `src/services/binding-resolver/**`,
  `src/services/historian-bff/Program.cs`, `src/services/gateway/appsettings.json`, `src/services/cplm-api/**`,
  `src/services/{notification,audit,analysis,display,asset-model}-service`, `src/frontend-ob/src/store/mqttStore.ts`,
  `ams-sims/*.py`, `scripts/sim/process_value_sim.py`, `contracts/instrumental-health/v1/*.json`.
- Repo-wide greps: `streampipes`, `raw-opc-events`, `kafka-connect|RegexRouter|MqttSourceConnector`,
  `piwebapi|osisoft|aveva|PI Web`, `spBv1.0`, `traverse/`, `0x1F`.

## 2. How it works today

### 2.1 Ingestion sources

**Alarms: HTTP poll, not OPC and not StreamPipes.** `ams-api` runs `AlarmIngestionService`
(`src/backend/AMS.Api/BackgroundServices/AlarmIngestionService.cs:45-100`): every `PollIntervalMs`
(2000 ms, clamped 1-5 s) it GETs `AlarmIngestion:FeedUrl` (default `http://192.168.1.51:8010/api/current-alarms`,
`:20`), parses `items|Items|value|Value` or a bare array of `HttpFeedAlarmRecord`
(`correlation_id, source_event_id, event_name, state, severity, priority, source_timestamp, tag_name,
description, message, acknowledged, asset, area, site, raw_payload`, `:290-322`), diffs against the last
snapshot per alarm and publishes only deltas; an alarm that disappears from the feed becomes a synthetic
`CLEARED` (`:127-137`). A parse failure throws instead of returning an empty list (audit F-12, `:275-283`).
Compose: `AlarmIngestion__Enabled=true`, `Kafka__IngestAuthority=api` (`infra/docker/docker-compose.yml:750-766`).

- **StreamPipes does not exist in this repo.** `.env.example:65-68`: "StreamPipes connectivity overlay — NOT
  IN THIS REPO … Nothing in this repo's compose reads them"; MIGRATION_LOG decision #13 "Retire StreamPipes +
  CouchDB" (`MIGRATION_LOG.md:301`). No `streampipes` service in `docker-compose.yml`.
- **`raw-opc-events` is retired.** It sits in the delete list of `scripts/kafka-reset-lab-topics.ps1:101`
  and `scripts/lib/AmsFlinkJob.ps1:48` calls it "the deleted raw-opc-events topic". The only live raw topic
  is `traverse.alarm.raw-alarms` (`OpcEventStreamJob.java:54`). `architecture_document.md` §2-§3.3 and
  `docs/production-contracts.md:323` (StreamPipes → `raw-opc-events`, partition table) are **stale**.
- **The Windows `AMS.OpcGateway` source tree is gone.** `src/opc-gateway/` does not exist (`ls` fails);
  `infra/windows/opc-gateway-deploy.md:22-26` and `scripts/apply-all-stabilization.ps1:40` still reference it;
  `OpcConnectionsController.cs:458` still dials `OpcGateway:BaseUrl` (`host.docker.internal:5050`) — dead path.
- **ACK path:** browser → `OperatorActionPublisher.cs:92-94` → `traverse.alarm.operator-actions` → Flink ACK
  orchestrator (`OpcEventStreamJob.java:132-140`) → `traverse.alarm.ack-writeback` → `HttpAckWritebackService`
  (POST to `AlarmIngestion:AckWritebackUrl`; lab = `mock-dcs:8010/api/alarms/acknowledge`, a 25-line Python
  stub, `docker-compose.yml:409-459`) → `traverse.alarm.ack-results` → Flink (`:143-163`). `mock-dcs` is an ACK
  sink only; it produces no data.

**Sparkplug edge node is a Kafka→MQTT publisher, not a PLC/tag edge.** `src/services/sparkplug-edge-node`
subscribes Kafka `traverse.alarm.live.alarms`, `traverse.live.metrics`, `traverse.cpa.live.loop.metrics`
(`AlarmMetricPublisher.java:118`, group `traverse-sparkplug-edge`, `auto.offset.reset=earliest`,
`docker-compose.yml:872-878`) and republishes as Sparkplug B on EMQX (see §2.5).

**OT loop ingestion (CPA lane).** `src/services/ingestion-service` (`traverse-ingestion-service`,
`docker-compose.yml:1026-1074`) is a .NET 8 MQTTnet managed client that subscribes an *external* OT broker,
joins per-parameter messages into one loop tuple per 5 s grid and produces to Kafka. Only two of five
configured "profiles" have a subscriber pipeline: `MQTT_LOOP_SAMPLES` and `INSTRUMENTAL_HEALTH`
(`Pipeline/OtIngestionHostService.cs:16-18,79-84` — other profiles log "no subscriber pipeline for it yet").
`MQTT_ALARMS` (→ `traverse.alarm.raw-alarms`), `MQTT_TELEMETRY` (→ `traverse.live.metrics`) and `MQTT_PRM`
are config-only stubs (`Services/ProfileRegistry.cs:18-71`).

**Process-value telemetry has no production producer.** `traverse.live.metrics` is written only by
`scripts/sim/process_value_sim.py:38` (record `{group,edge,device,metric,value,quality,ts,type}`, key=device,
`:137-149`). `traverse.raw.telemetry.site1` (16 partitions, "StreamPipes path, future use",
`kafka-reset-lab-topics.ps1:53-54`) has no producer and no consumer in `src/`.

### 2.2 MQTT ↔ Kafka bridging

| Direction | Mechanism | Evidence |
|---|---|---|
| MQTT → Kafka | **Custom service** `ingestion-service`: MQTTnet managed client (stable client id, QoS 1, `cleanSession` default false, `OtLoopSubscriber.cs:13-17,89,135-136`) → Confluent producer keyed by `loop_id` (`LoopSamplePipelineProducer.cs:71-80`); health plane → `InstrumentalHealthProducer.cs:16-19,54-58` (acks=all, idempotent, lz4) | only path that exists |
| MQTT → Kafka via EMQX rule engine / data bridge | **None.** `infra/docker/emqx/` holds only `acl.conf` and `emqx-init.sh`; compose sets no `EMQX_BRIDGES__*`/`EMQX_RULE_ENGINE__*` | `docker-compose.yml:182-248` |
| Kafka Connect | **None** anywhere (`grep -ri kafka-connect|connect-distributed|RegexRouter` hits only `unified/*.md` and an unrelated doc) | repo grep |
| Flink MQTT source | **None.** All Flink sources are `KafkaSource` | `src/flink/**` |
| Kafka → MQTT | **Custom service** `sparkplug-edge-node` (Java, Paho, Sparkplug B protobuf) | `AlarmMetricPublisher.java:31-38` |

In the lab the OT broker stand-in is `mosquitto-test` (profile `mqtt-test`, host 1884, user `ams_ingest`,
`docker-compose.yml:985-1016`), **not EMQX** — EMQX's ACL denies every topic outside `spBv1.0/#` (§2.5).
At the plant the OT broker is **Instrumental's `piarchiver-broker` mosquitto** on `192.168.190.91:1883`
(`migration/MARUN-CONTEXT.md` §12b; CHG-031 `changes_tracker.md:2178-2185`), TLS off since 2026-09-22.

### 2.3 Kafka topic catalog

Lab topics are declared in `scripts/kafka-reset-lab-topics.ps1` (RF 1, `retention.ms` 7 d, `segment.ms` 1 h,
alarm tier is deleted+recreated on reset, CPA tier is ensure-only, `:18-98`). Plant topics are declared in
`migration/kafka/topics.txt:25-44` (RF 2, `min.insync.replicas=1`) and created by `migration/04-create-kafka-topics.sh`
— **only `traverse.cpa.*` and `traverse.ingestion.*`; the alarm tier is "not created by 04 this cut"**
(`topics.txt:5`). Broker: `KAFKA_AUTO_CREATE_TOPICS_ENABLE=false`, default retention 24 h, PLAINTEXT, no ACLs
(`docker-compose.yml:372-392`). Plant retention column = `prod_decision.md:44` + `topics.txt`.

**Alarm lane (`traverse.alarm.*`)**

| Topic | Producer | Consumer (group) | Key | Parts | Policy (lab / plant) | Envelope |
|---|---|---|---|---|---|---|
| `traverse.alarm.raw-alarms` | ams-api `AlarmIngestionService.cs:158` | Flink `OpcEventStreamJob.java:54-55` (`traverse-alarm-flink-raw-alarms`); Flink `IoTDBPersistenceJob.java:49-50` (`traverse-alarm-flink-iotdb-persistence`); ams-api `TelemetryDeadmanWatchdogService.cs:57` | alarmId (= `correlation_id` or `tag|condition`) | 8 | delete 7 d lz4 / not in plant list | `{alarmId,sourceName,sourceEventId,message,priority,condition,state,timestamp,acknowledged,rawPayload}` `AlarmIngestionService.cs:144-157`; `StreamSchemaVersion.RawAlarms=2` `StreamEventContracts.cs:9` |
| `traverse.alarm.raw-alarms-dlq` | Flink `OpcEventStreamJob.java:86`; ams-api `KafkaConsumerService.cs:409` | manual (`scripts/replay-kafka-dlq.ps1`) | | 2 | delete 7 d | DLQ envelope with `SourceTopic` |
| `traverse.alarm.current-alarm-state` | Flink `OpcEventStreamJob.java:126,163` (`keyedByJsonField alarmId`) | ams-api `KafkaConsumerService.cs:197` (`ams-backend-2`); Flink `LiveStateJob.java:58-59`; Flink `AlarmStateExportJob.java:56-57` | alarmId | 8 | **compact** | `eventType` ALARM_STATE_UPSERT / ALARM_STATE_DELETE / ACK_STATE_UPDATE + `schemaVersion, serverId, sourceName, conditionName, subConditionName, severity, rawSeverity, priority, lifecycleState, conditionActive, acknowledged, opcDcsAcknowledged, eventTimeEpochMs, activeTimeEpochMs, cookieOffset, quality, category, transitionType…` `PipelineOperators.java:458`; normalized class `RawOpcAlarmEvent.java:4-37` |
| `traverse.alarm.operator-actions` | ams-api `OperatorActionPublisher.cs:92-94` | Flink `OpcEventStreamJob.java:132` (`traverse-alarm-flink-operator-actions`) | `serverId\|sourceName` (`AlarmPartitionKeys.AssetKey`) | 4 | delete 7 d | `OperatorActionMessage` `StreamMessages.cs:54-78` (`eventType OPERATOR_ACK_COMMAND`, commandId, correlationId, lifecycleId, alarmId, actionType, userId, serverId, sourceName, conditionName, activeTimeEpochMs, cookieOffset…) |
| `traverse.alarm.ack-writeback` | Flink `OpcEventStreamJob.java:140` (value-only) | ams-api `HttpAckWritebackService.cs` | none | 2 | delete 7 d | `AckWritebackMessage` `StreamMessages.cs:88-110` |
| `traverse.alarm.ack-results` | ams-api `HttpAckWritebackService` (after HTTP 200) | Flink `OpcEventStreamJob.java:143` (`traverse-alarm-flink-ack-results`) | | 2 | delete 7 d | `AckResultMessage` `StreamMessages.cs:29-45` (`resultState`, `errorMessage`) |
| `traverse.alarm.lifecycle-events` | Flink `OpcEventStreamJob.java:113,154`; ams-api `LifecycleEventPublisher` | ams-api `LifecycleEventConsumerService.cs:37-43` (`<group>-lifecycle`); Flink `AlarmKpiStreamJob.java:44-45` | | 4 | delete 7 d | `LifecycleEventMessage` `StreamMessages.cs:4-19` |
| `traverse.alarm.root-cause-events` | Flink `OpcEventStreamJob.java:97` | notification-service (`notification-service-group`) | | 2 | delete 7 d | |
| `traverse.alarm.lifecycle-alerts` | ams-api `TelemetryDeadmanWatchdogService.cs:153-154`, `AckSlaWatchdogService` | notification-service (`notification-service-lifecycle-alerts`) | | 4 | delete 7 d | TELEMETRY_STALLED etc. |
| `traverse.alarm.kpi-alarm-rates` | Flink `AlarmKpiStreamJob.java:86` | ams-api (`ams-api-kpi-consumer`) | | 4 | delete 7 d | |
| `traverse.alarm.kpi-standing-snapshots` | Flink `AlarmKpiStreamJob.java:104` | ams-api (`ams-api-kpi-consumer`) | fixed `GLOBAL` | 2 | compact | |
| `traverse.alarm.flink.state.alarm.delta` | Flink `AlarmStateExportJob.java:74` | ams-api (`ams-delta-consumer-ui`) | `correlation_id` | 4 | delete 7 d | |
| `traverse.alarm.flink.state.alarm.replay` | Flink `AlarmReplayEngine.java:111` | ams-api (`ams-replay-ui-consumer`) | | 2 | delete 7 d | |
| `traverse.alarm.events.raw` | **none in `src/`** | Flink `AlarmReplayEngine.java:39` (`ams-replay-cg-<id>`) | | 8 | delete 7 d | created, never fed |
| `traverse.alarm.state.delta` | **none** | **none** | | 4 | delete 7 d | created, unused |
| `traverse.alarm.live.alarms` | Flink `LiveStateJob.java:87` (RBE) | sparkplug-edge-node | alarmId | 4 | delete 7 d lz4 | `{alarmId,state,severity,acknowledged,conditionActive,priority,sourceName,conditionName,message,rbeTs,eventTimeEpochMs}` `LiveStateJob.java:191-203` |
| `traverse.alarm.live.alarm.metrics` | Flink `LiveStateJob.java:108` | **none in `src/`** (inferred: unconsumed) | alarmId | 4 | delete 7 d lz4 | `{alarmId,severity,state,priority,conditionActive,rbeTs}` `:283-288` |
| `traverse.live.metrics` | **sim only** `scripts/sim/process_value_sim.py:38` | sparkplug-edge-node `AlarmMetricPublisher.java:118` | device | 8 | delete 7 d lz4 | `{group,edge,device,metric,value,quality(int OPC),ts,type}` `AlarmMetricPublisher.java:285-323` |
| `traverse.raw.telemetry.site1` | none | none | | 16 | delete 7 d lz4 | "StreamPipes path, future use" — dead |
| `traverse.analysis.executions` / `.results` | analysis-service / Flink `AnalysisExecutionJob.java:62` | Flink `AnalysisExecutionJob.java:43` (`flink-analysis-execution`) / analysis-service (`analysis-service-results`) | | 2 | delete 7 d | |
| `traverse.analysis.commands` | analysis-service `Program.cs:514` | **none**; **not in either catalog** → with auto-create off the produce fails (inferred) | | – | – | |

**CPA lane (`traverse.cpa.*`, `traverse.ingestion.*`)** — names fixed in `CplmTopics.java:16-31`.

| Topic | Producer | Consumer (group) | Key | Parts | Plant retention (`topics.txt`) | Envelope |
|---|---|---|---|---|---|---|
| `traverse.cpa.loop.samples.v1` | ingestion-service `LoopSamplePipelineProducer.cs:75-76` | Flink Short/Long/Condition/Response via `CplmIngestPipeline.java:24-25` (`traverse-cpa-flink-cplm`, `CplmJobConfig.java:66`); `LoopLiveRbeJob.java:113`; ams-api `RawLoopIotDbConsumer.cs:72-81` (`traverse-cpa-iotdb-raw-loop`) | `loop_id` (registry casing) | 16 | delete **12 h** lz4 | `LoopTuple` JSON `LoopJoiner.cs:10-55`: `loop_id, event_ts_ms (OT process time), ingest_ts_ms, pv, sp, op, vp?, mode, quality (worst-of, GOOD/UNCERTAIN/BAD/UNKNOWN), loop_type, site/area/unit, asset_uuid, grid_seconds, + extras p/i/d/gw`; read by `CplmNormalizedSample.java:15-56` |
| `traverse.ingestion.ot-dlq` | ingestion-service `:78-80` | manual replay | topic/loop | 2 | delete 3 d | `{reason, config_id, mqtt_topic, payload, received_at_ms, detail}` `LoopSamplePipelineProducer.cs:8-14` |
| `traverse.cpa.clpm.feature.short.v1` | Flink `CplmShortFeatureStreamJob.java:162` | cplm-api (`traverse-cpa-cplm-results`, `-frames`) | `loop_id` | 8 | delete **2 h** lz4 | |
| `traverse.cpa.clpm.feature.long.v1` | Flink `CplmLongDiagnosticsStreamJob.java:103` | cplm-api; Flink Fusion `:81-82` (`…-long-in`) | `loop_id` | 8 | delete 6 h lz4 | |
| `traverse.cpa.clpm.gate.results.v1` | Flink `CplmGateFusionStreamJob.java:153` | cplm-api (`traverse-cpa-cplm-results`, `-frames`); `LoopLiveRbeJob` | `loop_id` | 8 | delete 3 d lz4 | `source = flink \| replay:<id>` |
| `traverse.cpa.clpm.condition.v1` | Flink `CplmConditionStreamJob.java:49` | cplm-api `CplmConditionConsumerService.cs:44`; Fusion `:99-100` | `loop_id` | 8 | delete 1 d | |
| `traverse.cpa.clpm.gate.evidence.v1` | Flink jobs (`evidence/EvidenceKafkaRecords.java`) | cplm-api `CplmEvidenceConsumerService.cs:38-42` | `method_run_id` | 8 | delete **1 h**, `max.message.bytes` 1 MiB | manifest + gzip/base64 chunks |
| `traverse.cpa.clpm.response.results.v1` | Flink `CplmResponseAnalysisJob.java:63` | cplm-api (`…-response`) | `loop_id` | 8 | delete 3 d | |
| `traverse.cpa.instrument.health.v1` | ingestion-service `InstrumentalHealthProducer.cs:29,55` | Flink `CplmInstrumentContextJob.java:66-67`; cplm-api (`…-health`) | `device_id` | 8 | delete 3 d | Instrumental NE107 v1 `contracts/instrumental-health/v1/state.schema.json:13-33` (`schema_version, message_kind, observation_id, tenant_id, site_id, producer_id, sequence, device_id, observed_at, verified_at, state…`) |
| `traverse.ingestion.health-dlq` | ingestion-service `:30,58` | manual | | 2 | delete 3 d | |
| `traverse.cpa.context.instrument-health.v1` | Flink `CplmInstrumentContextJob` | Fusion `:116-117`; cplm-api | `context_key` | 8 | **compact** | |
| `traverse.cpa.context.gate-config.v1` | cplm-api `Services/Config/BundleEnvelope.cs` (signed) | all CPLM Flink jobs (`config/BundleBroadcastHandler.java`) | `bundle_id` | 3 | **compact** | |
| `traverse.cpa.context.gate-config.acks.v1` | Flink jobs (`ConfigAck`, `CapabilityRecord`) | cplm-api `CplmConfigAckConsumerService.cs:37` | | 3 | delete 3 d | |
| `traverse.cpa.ams.metadata.updates` | cplm-api `CpmLoopRegistryService.cs` | every CPLM Flink job (broadcast); `CplmInstrumentContextJob:84-85` | loop key; tombstone `{__tombstone,key}` (not a null value) | 3 | **compact** | evidence: VP, peer links, step test, eng ranges |
| `traverse.cpa.context.parameter-set.v1` | cplm-api | CPLM Flink jobs (broadcast) | | 3 | **compact** | |
| `traverse.cpa.live.loop.metrics` | Flink `LoopLiveRbeJob.java:132` (RBE, deadband 0.05, heartbeat 300 s) | sparkplug-edge-node | loopId | 8 | delete **1 h** lz4 | `{loopId,metric,value,dataType,quality,ts,sourceTs,verifiedTs,emissionTs}` `AlarmMetricPublisher.java:337-380` |
| `traverse.cpa.audit-events` | cplm-api, display-service `AuditEmitter.cs:19`, ingestion-service `AuditEmitter.cs:20` | audit-service (`traverse-cpa-audit`) | | 4 | delete 3 d | |
| `traverse.cpa.cplm.replay.{id}` | on-demand `CplmHistoricalReplayJob` | replay consumers | | 1 | 2 h, never pre-created | |

Documented-but-not-created / created-but-unused: `raw-opc-events` (docs only, deleted); `traverse.alarm.events.raw`
(no producer); `traverse.alarm.state.delta` (nothing); `traverse.raw.telemetry.site1` (nothing);
`traverse.alarm.live.alarm.metrics` (no consumer); `traverse.live.metrics` (sim producer only);
`traverse.analysis.commands` (produced, never declared). At the plant the whole alarm tier is undeclared.

### 2.4 MQTT namespace catalog

**EMQX (`ams-emqx`, 5.6.0)** — auth: chain (1) JWT via auth-service JWKS, token presented as the MQTT
password, `disconnect_after_expire=false`; (2) built-in DB user `ams_edge` provisioned by `emqx-init.sh`
(`docker-compose.yml:203-210,253-268`). Authorization: `no_match=deny`, file ACL (`emqx/acl.conf:17-22`):
`ams_edge` all on `spBv1.0/#`; everyone else **deny publish** `spBv1.0/#`, allow subscribe `spBv1.0/#`.
**No other namespace is publishable or subscribable on EMQX.** Listeners: TCP 1883, WS 8083 (unpublished on
host, reached only via gateway `/mqtt-ws`); no TLS listener (8084 WSS retired, `:230-236`). Telemetry
phone-home disabled (`:192`).

| MQTT topic | Publisher | Subscriber | QoS / retain | Notes |
|---|---|---|---|---|
| `spBv1.0/ams_site1/NBIRTH/ams_edge1` | edge node `AlarmMetricPublisher.java:88,533-542` (bdSeq) | browsers `spBv1.0/+/NBIRTH/+` (`mqttStore.ts:286`) | QoS 0, not retained (`:52,701-703`) | republished on reconnect |
| `spBv1.0/ams_site1/NDEATH/ams_edge1` | LWT (`:670`) | browsers | QoS 0 | |
| `spBv1.0/<group>/DBIRTH/<edge>/<device>` | edge node `:395,546` (metric list + aliases) | browsers `spBv1.0/+/DBIRTH/+/#` | QoS 0 | alias map also in Redis `alias:<group>:<edge>` |
| `spBv1.0/<group>/DDATA/<edge>/<device>` | edge node `:456,568`; devices = alarm (`alarm_<8hex>` or source, `:260-262`), process (`device` field), loop (`loopId` sanitised `:353`) | browsers: scoped per open display (`mqttStore.ts:115,368`) or firehose `spBv1.0/+/DDATA/+/#` (Dashboard only, `:50`) | QoS 0, retain false | `quality` (Int32 OPC 192/64/0), `sourceTs/verifiedTs/emissionTs/qualityToken` as Sparkplug metric properties (`:438-462`) |
| `spBv1.0/…/NCMD|DCMD` | nobody | edge may subscribe (`acl.conf:9`) | | browser publish denied by ACL |
| `OT/HDPE/<fcs>/<class>/<loop>/PIDParams/<PARAM>` (**plant piarchiver mosquitto**, not EMQX) | Instrumental/PIArchiver OT gateway | ingestion-service `OtLoopSubscriber` QoS 1, persistent session, client id `traverse-ingestion-pidparams` | QoS 1 | 8 params PV/SP/OP/MODE/P/I/D/GW; `diagnostics` group duplicates `PIDParams` — subscribe one only (`MARUN-CONTEXT.md` §12b); ~14.6 % of messages park (Bender monitor) `prod_decision.md:64` |
| `traverse/instrumental/v1/{tenant}/{site}/devices/+/state\|events`, `…/sources/+/availability` | Instrumental NE107 publisher | ingestion-service `InstrumentalHealthSubscriber.cs:95` QoS 1 | QoS 1, retained state handled (`:87`) | the **only** `traverse/*` MQTT namespace; inbound, third-party |
| `ot/alarms/#`, `ot/telemetry/#`, `prm/data/#` | designed (doc 06) | **no subscriber** (`OtIngestionHostService.cs:83`) | | wizard defaults only |

### 2.5 Envelopes (summary of the record classes above)

- Raw alarm (HTTP-feed schema v2): `AlarmIngestionService.cs:144-157`; normalized by Flink into
  `RawOpcAlarmEvent.java:4-37` (`alarmKey = serverId|source|condition|subCondition`, `AlarmKeys`).
- ACK plane: `StreamMessages.cs` (`LifecycleEventMessage :4`, `AckResultMessage :29`, `OperatorActionMessage :54`,
  `AckWritebackMessage :88`, `RawAlarmStreamEvent :119`); discriminators `StreamEventContracts.cs:12-24`.
- Loop tuple: `LoopJoiner.cs:10-55` (serializer) ↔ `CplmNormalizedSample.java:15-56` (Flink) ↔
  `RawLoopIotDbConsumer.cs:219-243` (`loop_id|tagId|key`, `event_ts_ms|timestamp`, `pv/sp/op/vp/mode`).
- OT source payload (per parameter): `{value, unit, quality, ts (ISO Z), source:"opc_ua", seq, device, area,
  line, enterprise, site, process_unit, equipment, item}` (`ams-sims/sim_ot_gateway_mqtt.py:71-78`; parser
  `OtPayloadParser.cs:54-108` requires `value` + `ts`, quality string enum, future-skew guard).
- Live planes: `{device,metric,value,quality,ts}` / `{loopId,metric,…}` → Sparkplug DDATA; Redis snapshot
  `snapshot:metric:<group>:<edge>:<device>:<metric>` = `{v,q,ts,src?,ver?,emit?,qt?}` TTL 3600 s
  (`AlarmMetricPublisher.java:495-523`, `historian-bff/Program.cs:291-300`).
- Binding resolution (UNS → transport): `BindingResponse` (`binding-resolver/Models/BindingResponse.cs:46-153`)
  carries `sparkplugTopic = spBv1.0/{site}/DDATA/{site}_edge1/{deviceId}`, `sparkplugDevice`, `sparkplugMetric`,
  Redis key, `iotdbPath = root.<path dotted>`, `SignalRHub=/hubs/alarms` (`PathResolver.cs:236-327`).
  Device id rule = asset-model `Asset.SparkplugDevice` (`Asset.cs:120-131`): `{unit}_{device}` at ≥4 path
  segments, bare device below; metric = measurement after the dot. **No tag→metric config file exists on the
  edge node** — identity comes from the Kafka record (`device`/`loopId`, `metric`, per-record `group`/`edge`).

### 2.6 Retention / compaction of record

- Kafka, plant (`prod_decision.md:44`, `topics.txt:25-41`): samples 12 h · feature.short 2 h · feature.long 6 h ·
  gate.results 3 d (14 d headroom rule on Postgres side) · condition 1 d · gate.evidence 1 h · response 3 d ·
  instrument.health 3 d · ot/health DLQs 3 d · gate-config acks 3 d · audit 3 d · live.loop.metrics 1 h ·
  compacted topics never time-limited. `segment.ms = retention/4`, floor 1 h, cap 6 h (`04-create-kafka-topics.sh:47-55`;
  `04c` applies to existing topics because `04` only creates and auto-create resurrects deleted topics).
  Rationale: "Kafka is transport plus a recovery buffer; IoTDB / Postgres are the records" (`topics.txt:15-20`).
- Kafka, lab: every declared topic 7 d / segment 1 h; broker default 24 h.
- IoTDB TTL (`iotdb-init-ttl.sh:86,115,120`): `root.ams` 365 d, `root.site1` 90 d, `root.site1.cpm.**.kpi.**` 730 d.
  Plant has **no TimescaleDB** (`prod_decision.md:16`).
- Redis snapshot/alias keys: TTL 3600 s on the `redis-contract` (noeviction) tier (`docker-compose.yml:893-897`).
- Disk incidents: **CHG-031** 2026-09-18 — `feature.short` at 7 d, uncompressed, no `segment.ms` = 20 GB of a
  30 GB Kafka; broker died, ingestion's rdkafka producer never reconnected (6 h silent gap; OT gateway does not
  buffer) (`changes_tracker.md:2160-2192`). 2026-09-26 — 311 MB free three hours after v2.5 (evidence per window),
  ZooKeeper zero-byte log crash loop, Kafka coordinator lost ~20 min incl. Instrumental (`prod_decision.md:81`).
  Lab: Docker VHDX exhaustion 2026-09-20 (`docs/docker-disk-recovery-2026-09-20.md`).

### 2.7 Browser realtime path

Two channels, both through the API gateway (`:8081`):
1. **SignalR** `/hubs/alarms` (`AlarmHub.cs:127-148`: `OnNewAlarm, OnAlarmUpdated, OnAckLifecycleUpdated,
   OnAlarmCleared, OnBulkAlarmsUpdated, OnFloodAlert, OnServerStatusChanged, OnSoeEvent`), fed by ams-api's
   `current-alarm-state` consumer.
2. **MQTT over WebSocket** `/mqtt-ws` → YARP `emqx-ws` cluster `http://emqx:8083`, path rewritten to `/mqtt`,
   `AuthorizationPolicy: default` (`gateway/appsettings.json:254-274,365-366`). Browser (`mqttStore.ts:255-316`):
   `?access_token=` on the WS URL for the gateway **and** the same RS256 token as MQTT password for EMQX's JWT
   authenticator; `clientId ams-hmi-<rand>`, `clean:true`, `username 'hmi-browser'`, QoS 0; subscribes
   NBIRTH/DBIRTH wildcards + scoped DDATA; re-seeds from Redis via `GET /api/hist/snapshot` after reconnect.
   Token rotation (15 min) is handled by re-setting the password before reconnect (`:306-312`).
   So the UI gets **Sparkplug edge data + SignalR + REST snapshot/trend** — there is no `traverse/runtime/*`
   MQTT namespace and no Kafka→MQTT path other than Sparkplug DDATA.

### 2.8 AVEVA PI

**No PI Web API / AF / OSIsoft integration exists.** Repo-wide grep finds only: `.pdix` PI Vision *display*
importer (`ScreenImportService.ts`, display config, no data), a `SourceType.AvevaSystemPlatform` enum member
(`AMS.Domain/Alarms/ActiveAlarm.cs:66`, unused), open clarification rows on AVEVA System Platform scope
(`cas_clarifications.csv:5`), and the plant name **"piarchiver"** — which is Instrumental's *PIArchiver*
product (their IoTDB + mosquitto containers, `migration/cap-iotdb-logs.sh:4-8`, `MARUN-CONTEXT.md` §12b), not
OSIsoft PI. `AUDIT-REPORT.md:585` confirms "no PI Web API coupling".

### 2.9 Diagram

```mermaid
flowchart LR
  subgraph Sources
    FEED["DCS HTTP feed<br/>/api/current-alarms<br/>(lab: none; ACK→mock-dcs)"]
    OTB["OT broker (piarchiver mosquitto, plant)<br/>OT/HDPE/fcs/class/loop/PIDParams/PARAM<br/>lab: mosquitto-test:1884"]
    INS["Instrumental NE107<br/>traverse/instrumental/v1/..."]
  end
  FEED -->|poll 2 s, delta| API1[ams-api AlarmIngestionService]
  API1 -->|traverse.alarm.raw-alarms| K[(Kafka<br/>traverse.alarm.* / traverse.cpa.*)]
  OTB -->|MQTT QoS1| ING[ingestion-service<br/>join 5 s grid]
  INS -->|MQTT QoS1| ING
  ING -->|loop.samples.v1 / instrument.health.v1 / DLQs| K
  K --> F[Flink: alarm FSM, LiveState RBE,<br/>IoTDB persist, CPLM short/long/fusion,<br/>LoopLiveRbe]
  F -->|current-alarm-state (compact)<br/>live.alarms, live.loop.metrics,<br/>clpm.* results| K
  F --> IOT[(IoTDB)]
  K --> API2[ams-api consumers] --> PG[(Postgres ams)]
  API2 -->|SignalR /hubs/alarms| UI[Browser]
  K --> CPLM[cplm-api] --> PG2[(traverse_cplm)]
  K -->|live.alarms, live.metrics(sim only),<br/>live.loop.metrics| EDGE[sparkplug-edge-node]
  EDGE -->|spBv1.0/ams_site1/DDATA/ams_edge1/dev QoS0| EMQX[(EMQX, ACL spBv1.0/# only)]
  EDGE --> R[(Redis snapshot:* TTL 1 h)]
  EMQX -->|/mqtt-ws via gateway, JWT| UI
  R -->|/api/hist/snapshot| UI
  IOT -->|/api/hist/trend| UI
```

## 3. Code map

| Concern | file:line | Note |
|---|---|---|
| Alarm ingest (HTTP poll → Kafka) | `src/backend/AMS.Api/BackgroundServices/AlarmIngestionService.cs:45-160` | delta detection, synthetic CLEARED, key = alarmId |
| ACK writeback (Kafka → HTTP) | `src/backend/AMS.Api/BackgroundServices/HttpAckWritebackService.cs:1-40` | lab target `mock-dcs:8010` |
| Backend topic names / groups | `src/backend/AMS.Api/appsettings.json:9-20`; `KafkaConsumerService.cs:24-42,197` | `UseFlinkOrchestration=true` default |
| Backend envelopes | `src/backend/AMS.Infrastructure/Kafka/StreamMessages.cs`, `StreamEventContracts.cs`, `AlarmPartitionKeys.cs` | schema v1 ACK plane, v2 raw alarms |
| Alarm state machine job | `src/flink/src/main/java/com/ams/flink/OpcEventStreamJob.java:54-163` | sources/sinks/groups |
| Keyed sinks for compacted topics | `src/flink/src/main/java/com/ams/flink/KafkaSinks.java:16-42` | null-key records are rejected by compacted topics |
| Live alarm RBE | `LiveStateJob.java:58-108,191-203` | two outputs, alarmId key |
| Alarm → IoTDB | `IoTDBPersistenceJob.java:36-50` | `root.ams.site1.alarms.<alarmId>` |
| CPLM topic constants | `src/flink/.../cplm/contract/CplmTopics.java:16-31` | "keep lab list, plant list and this in step" |
| CPLM ingest + group | `cplm/CplmIngestPipeline.java:24-25`, `CplmJobConfig.java:66` | `traverse-cpa-flink-cplm` |
| Loop live RBE | `cplm/LoopLiveRbeJob.java:59-132` | deadband/heartbeat, key loopId |
| Flink job roster + args | `infra/docker/flink-job-supervisor.sh:29-144` | 12 jobs, topic args |
| OT subscriber | `src/services/ingestion-service/Pipeline/OtLoopSubscriber.cs:13-137` | QoS 1, managed client |
| OT topic template parser | `Pipeline/OtTopicParser.cs:4-54` | `{site}{fcs}{class}{loop}{param}` |
| OT payload parser + DLQ reasons | `Pipeline/OtPayloadParser.cs:11-108` | quality only read as string (see traps) |
| Loop joiner / tuple serializer | `Pipeline/LoopJoiner.cs:10-55,320-365` | process-time stamping, quiet ticks skipped |
| Kafka producer (samples/DLQ) | `Pipeline/LoopSamplePipelineProducer.cs:36-80` | key `loop_id` |
| Ingest config contract | `Models/LoopIngestConfig.cs:14-81` | `topic_template, grid_seconds, param_roles (overlay), mode_value_map, quality_protocol` |
| Profile registry (5 profiles) | `Services/ProfileRegistry.cs:18-71`; `Pipeline/OtIngestionHostService.cs:16-18,79-84` | only 2 profiles wired |
| Instrument-health bridge | `Health/HealthTopic.cs:5-37`, `Health/InstrumentalHealthProducer.cs:16-58` | contract `contracts/instrumental-health/v1/*.json` |
| Sparkplug edge node | `src/services/sparkplug-edge-node/.../AlarmMetricPublisher.java:31-46,118,283-380,438-523,651-703` | QoS 0, cleanSession true, Redis snapshot |
| Edge env config | `SparkplugConfig.java:66-90` | group `ams_site1`, edge `ams_edge1` |
| EMQX auth/ACL | `infra/docker/docker-compose.yml:196-217`; `infra/docker/emqx/acl.conf:17-22`; `emqx/emqx-init.sh` | deny-by-default |
| Gateway MQTT route | `src/services/gateway/appsettings.json:254-274,365-366`; `docs/api-gateway.md:41,69` | `/mqtt-ws` → `emqx:8083/mqtt` |
| Browser MQTT client | `src/frontend-ob/src/store/mqttStore.ts:19-50,255-316,368` | token as password + query |
| UNS → transport | `src/services/binding-resolver/Services/PathResolver.cs:236-327`; `Models/BindingResponse.cs:46-153` | device-id rule shared with `asset-model/Models/Asset.cs:120-131` |
| Snapshot read | `src/services/historian-bff/Program.cs:24-28,291-300` | Redis keys |
| Asset change events | `src/services/asset-model/Program.cs:1055-1072` | **Redis pub/sub `asset-events`**, not Kafka |
| Lab topic catalog | `scripts/kafka-reset-lab-topics.ps1:18-120` | delete tier vs ensure tier vs legacy list |
| Plant topic catalog + retention | `migration/kafka/topics.txt:25-44`; `migration/04-create-kafka-topics.sh:29-56`; `04c-apply-topic-retention.sh` | `traverse.cpa.*` only |
| Retention of record | `prod_decision.md:31-49` | steady state 25-45 GB |
| Simulators | `ams-sims/sim_ot_gateway_mqtt.py:71-78,172-183`; `sim_alarm_feed.py`; `sim_live_mqtt_direct.py`; `scripts/sim/process_value_sim.py:137-149` | only producers of `live.metrics` |

## 4. Constraints, settled decisions and traps

- **Settled (MIGRATION_LOG.md:288-329):** bind through UNS path+role; Flink-only compute; one Kafka / one EMQX /
  one IoTDB / one Postgres cluster with a DB per service; StreamPipes + CouchDB retired (#13); edge-only auth,
  gateway is the single JWT validator (#16); four-level UNS `site/area/unit/device[.measurement]` with the
  Sparkplug device-id rule `{unit}_{device}` at ≥4 segments (#17).
- **Plant Kafka is shared with Instrumental** (`prod_decision.md:17`): topics must carry the `traverse.cpa.*` /
  `traverse.ingestion.*` prefixes, `04` refuses anything else and refuses to run without
  `ALLOW_CREATE_PREFIXED_TOPICS=yes`; never run the lab reset script there. RF 2, minISR 1 (cluster went 3→2 brokers).
- **Auto-create is off in the lab**, so a topic missing from `kafka-reset-lab-topics.ps1` stalls a Flink sink at
  checkpoint flush and restart-loops the job (`:47-52`); on the plant a deleted topic is resurrected by
  auto-create within seconds with broker defaults (`04c:3-5`).
- **Compacted topics reject null-key records silently** (sink shows in=N out=0) — every compacted sink must
  use `KafkaSinks.keyedByJsonField/fixedKey` (`KafkaSinks.java:16-22`, `docs/alarm-history-flink-sink-stuck.md`).
- **CPLM consumer groups: exactly one member** (`traverse-cpa-cplm-results`, `…-frames`, evidence, condition,
  response, health, config-acks) — two split partitions and each persists a subset with no error
  (`prod_decision.md:60`, `SingleMemberGuard`).
- **Watermarks are source-driven** (`event_ts_ms` = OT process time, per-partition, 30 min idleness);
  a backlog older than the bounded out-of-orderness is dropped as late — backfill goes IoTDB → recompute,
  never through the stream (`prod_decision.md:55`; runbook 10 §4).
- **Quality decoding:** every MQTT loop source must declare `quality_protocol=STRING_ENUM`; never derive quality
  from `source` (`prod_decision.md:62`). Open defect: `OtPayloadParser` reads `quality` only when it is a JSON
  string; numeric `0`/`64` defaults to GOOD. Mirror on the telemetry plane: edge `qualityCode()` maps unknown
  strings to 0/BAD (`AlarmMetricPublisher.java:479-490`).
- **`param_roles` overlays the built-ins** (CHG-010); a map with no source for pv/sp/op/mode is refused 400.
- **`diagnostics` and `PIDParams` groups carry identical values** on the plant broker — subscribe one, or Flink
  double-counts; reusing the subscriber's client id kicks it off (`MARUN-CONTEXT.md` §12b).
- **Producer resilience gap (open, CHG-031):** ingestion's rdkafka producer does not recover from an
  all-brokers-down window and `/health` does not reflect it; the OT gateway does not buffer, so that gap is lost.
- **Time base:** OT gateway clock measured +132 s ahead of the VM; `future_skew_max_seconds=300` guard.
- **EMQX ACL is `spBv1.0/#` only** — any new MQTT namespace (inbound or runtime output) on EMQX needs ACL rows
  and, for a service publisher, a built-in-DB credential (only `ams_edge` exists).
- **"0x1F mangle"** is a tooling trap, not a data trap: an editor write emitted a literal U+001F inside
  `string.Join("\x1f", …)` in `LoopIngestConfig.cs` (fingerprint hashing, `:105`) and the sims use `\x1f` as a
  psql field separator (`ams-sims/simlib.py:255-260`); verify such edits with `od -c`.
- **Stale documentation to not trust:** `architecture_document.md` §2/§3.1-3.3 (StreamPipes, `raw-opc-events`,
  "Edge Agent captures the COM event"), `docs/production-contracts.md` §3 partition table (unprefixed topics),
  `infra/windows/opc-gateway-deploy.md`, `run-all.ps1:8` / `scripts/start-ams-lab.ps1:341-348` (StreamPipes health).

## 5. Mapping to the Truss living-asset pitch

| Pitch concept | What exists today | Status | Notes / gap |
|---|---|---|---|
| Source systems publish to MQTT namespaces `dcs/<unit>/<asset>/<param>`, `alarm/<unit>/<asset>/<code>`, `apm/…`, `control/<loop>`, `instrumental/<instrument>`, `utility/…` | Loops: third-party namespace `OT/HDPE/<fcs>/<class>/<loop>/PIDParams/<PARAM>` on Instrumental's broker; instrument health: `traverse/instrumental/v1/…`; alarms: **HTTP poll, no MQTT**; APM/utility: nothing | MISSING | The two live namespaces are owned by other vendors and configured per data-source (`topic_template`). Alarm MQTT profile is a stub. Any new namespace on EMQX needs ACL + credentials. |
| Kafka Connect MQTT Source (`clean.session=false`, at-least-once) | Custom `ingestion-service`: MQTTnet, QoS 1, persistent session, stable client id → Kafka acks=all idempotent | PARTIAL (functionally equivalent for 2 profiles) | No Connect cluster anywhere. The custom service also does what Connect cannot: topic-template parsing, role mapping, quality decoding, 5 s join, registry gating, DLQ. Replacing it with Connect would move the join into Flink (which `CplmNormalizedSample` currently expects pre-merged). |
| Kafka topics `source/dcs/…`, `source/apm/…` (+ optional RegexRouter) | Namespaces are `traverse.alarm.*`, `traverse.cpa.*`, `traverse.ingestion.*`; plant script rejects any other prefix | MISSING | A `source.*` prefix must be added to `04`'s namespace guard and to both catalogs; on the shared plant broker it needs Instrumental's ops confirm. |
| Envelope `{mqtt_topic, value, timestamp, quality}` | Per-parameter OT payload has `value, ts, quality, unit, …` but `mqtt_topic` survives only in DLQ records; samples topic carries a *joined* loop tuple | PARTIAL | No raw per-message Kafka topic exists — raw MQTT messages are not retained anywhere (Kafka samples = 12 h of joined tuples). |
| Compacted context/config topic | `traverse.cpa.context.gate-config.v1`, `parameter-set.v1`, `ams.metadata.updates`, `context.instrument-health.v1` (compacted, keyed, `{__tombstone,key}` convention) | PARTIAL | Exists for the CPA lane only. Asset-model changes go on **Redis pub/sub `asset-events`**, not Kafka; there is no plant-wide entity/config topic. |
| Runtime MQTT namespace `traverse/runtime/entity/{id}/state`, `traverse/runtime/issue/{id}` | Sparkplug B `spBv1.0/ams_site1/DDATA/ams_edge1/<device>` from the edge node (RBE-fed), plus SignalR for alarms | MISSING | The Kafka→MQTT bridge pattern exists (edge node) but is Sparkplug-shaped and alias/DBIRTH based; EMQX ACL forbids any other namespace; browsers are subscribe-only. |
| Typed `SensorData {timestamp, entity_id, asset_type, parameter, value, uom, quality}` | Loop tuple `{loop_id, asset_uuid, loop_type, site/area/unit, event_ts_ms, pv/sp/op/vp/mode, quality}`; live metrics `{device, metric, value, quality, ts}` | PARTIAL | Entity identity is `loop_id` / Sparkplug `device` (derived from the UNS path), not a Truss entity id; no `uom` on any Kafka record (unit is dropped by the joiner); no generic per-parameter event stream. |
| PI Web API as historical source | None. Historian is IoTDB via historian-bff (`/api/hist/trend`, `/raw`, `/snapshot`) | MISSING | No PI client, config or importer; "piarchiver" at the plant is Instrumental's product, not OSIsoft PI. |
| TLS + broker ACLs by service identity | EMQX: JWT (browsers) + one built-in user (`ams_edge`), file ACL by username, no TLS listener; plant OT broker TLS off since 2026-09-22; Kafka PLAINTEXT, no ACLs | PARTIAL | Identity model is per-user/JWT, not per-service certificates. |
| Exactly-once Flink from Kafka | `OpcEventStreamJob` EXACTLY_ONCE with RocksDB + MinIO checkpoints; CPLM jobs same cluster; committed-offset starts | EXISTS | Plant runs without HA/savepoints; a resubmit restarts window state. |
| All real-time data through Kafka as backbone | True for alarms and loops; process-value telemetry (`traverse.live.metrics`) has **no production producer** | PARTIAL | The HMI live-value plane is effectively unfed outside simulators. |

## 6. Open questions

1. Is the DCS "current alarms" HTTP feed (`192.168.1.51:8010`) a real endpoint at any site, or is the alarm lane
   currently running only against simulators? (No plant alarm topics are created by `04`.)
2. Who owns the OT gateway's MQTT namespace and payload (Instrumental/PIArchiver)? Could it publish
   `dcs/<unit>/<asset>/<param>`-style topics, or must Truss adopt `OT/HDPE/…` as-is?
3. Should raw per-message MQTT records be retained in Kafka at all, given the plant's 96 GB shared disk and the
   12 h samples floor? (A `source/*` raw tier would roughly triple today's ingest volume: 8 params × ~30 msg/s.)
4. Is the `traverse/instrumental/v1` NE107 feed the model for an `instrumental/<instrument>` namespace, i.e. can
   Truss reuse that contract rather than define a new one?
5. Does EMQX stay the runtime broker (requires ACL/credential redesign beyond `spBv1.0/#`), or does the runtime
   namespace ride the plant's mosquitto?
6. Where should entity ids come from — `asset_uuid` from asset-model (already on loop tuples) or a Truss id —
   and who owns the UNS path ↔ entity mapping that binding-resolver currently derives by rule?
7. `traverse.analysis.commands` is produced but never declared or consumed; `events.raw`, `state.delta`,
   `raw.telemetry.site1`, `live.alarm.metrics` are declared but dead — are these slated for removal?
