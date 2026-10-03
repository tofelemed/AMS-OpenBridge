# prod_decision.md — the production settings of record (Marun, CPA / loop performance)

Why this file exists: the plant runs on a shared host with settings that are the result of incidents,
measurements and deliberate trade-offs. If this application is deployed on another server, every value
below must be decided again for that server, and this file says what we chose here and why. Keep it
current with every release (`changes_tracker.md` CHG entries are the history; this file is the state).

Last updated: 2026-10-02 (v2.6.1 live since 2026-09-27 17:30 UTC; evidence OFF again since 2026-10-02 after the episode-flapping incident; cpm-10b still pending).

## 1. Where it runs

| Item | Value | Why / where recorded |
|---|---|---|
| Host | Ubuntu VM 192.168.190.91, 16 cores, **96 GB disk shared with Instrumental** (their Postgres, two Kafka brokers, ZooKeeper) | `migration/MARUN-DISK.md`; `docs/marun-capacity-remediation.md` item 1 (separate storage still open) |
| Air-gapped | yes: images arrive as tarballs (`release-out/<release>/`); never `docker image prune -a` (curlimages/curl, minio/mc cannot be re-pulled) | `migration/V2.5-DEPLOY.md` |
| Databases | one Postgres cluster (`instrumental-postgres`, `psql -U postgres`), one logical database per service (`traverse_cplm` for CPA); **no TimescaleDB** at the plant (the lab has it) | `CLAUDE.md`; `database/scripts/39_timescale_policies.sql` is lab-only |
| Kafka | Instrumental's brokers `kafka-1:9092,kafka-2:9092`; our topics prefixed `traverse.cpa.*`, replication 2 | `migration/kafka/topics.txt`, `migration/04-create-kafka-topics.sh` |
| Flink | JobManager + one TaskManager (16 slots), **no ZooKeeper HA**, RocksDB + MinIO checkpoints; the jar lives INSIDE the image (`/opt/flink/usrlib`): a jar change = a new `ams-flink` image and `docker rm -f` of JM and TM | VM steps step 5 |
| Entry points | API gateway `:8081` (single JWT validator, edge-only auth); frontend `:8090`; Flink UI host `:8082` to JM `:8081` | `docs/api-gateway.md` |
| `/opt/AMS-open` | **not a git checkout**: each release's `src-<commit>.tar.gz` is extracted over it (VM step 4a); `migration/.env` is untracked and survives | `migration/deploy/build-release.py` |

## 2. Versions on the plant

| Date (UTC) | What | Bundle / jar |
|---|---|---|
| 2026-09-26 07:20 | v2.5 (CHG-026 / 027 / 028 / 030 / 032) | `release-out/v2.5-20260925-r2`, tag `v2.5` = aae3c77a, jar 2dc8788aa07f |
| 2026-09-27 05:24 | Flink patch 1: G0 completeness from the declared grid; per-partition watermarks; control streams marked idle | jar b4a10e5474e7a557 |
| 2026-09-27 | Flink patch 2: sample idleness 30 min; Short job parallelism from `CPLM_SHORT_PARALLELISM` | `release-out/v2.5-flink-patch2-20260927`, jar f7c99294e0767ea9 |
| 2026-10-03 09:03 | **v2.6.3** deployed (cplm-api 5dc9dcf4 + ams-frontend); proofs: knobs in the container, consumers Healthy / no split, frontend assets. Step H (reconstruction) found CHG-036 | `release-out/v2.6.3-20261003` |
| 2026-10-03 13:19 | **v2.6.3 add-on, replay jar patch 4** (CHG-036; patch 3 = the 10:21 UTC interim jar 26020dfd, superseded): host jar `src/flink/target/ams-flink-1.0-SNAPSHOT.jar` → sha `043a645633a56579` (bounded source + IOTDB_PASS + writer device path) + overlay `CplmRecompute__BootstrapServers`; engine jobs stay on f7c99294e0767ea9. Proof: cplm-api reconstruction of PIC10412 → 3 manifests in 20 s | `release-out/v2.6.3-20261003/flink-replay-jar-patch4/` |
| superseded | ~~v2.6.3~~ as planned = CHG-034 (`cplm-api`: episode family-change debounce, `Cplm__FamilyChangeWindows`=3, `ops/cpm-11`) + CHG-035 (`ams-frontend`: Explorer 12h/24h toggle, CSV on demand, reconstruction from the historian); replaces the never-deployed v2.6.2; no jar | `release-out/v2.6.3-<date>`; `changes_tracker.md` "Release v2.6.3" |
| pending | v2.6.1 = v2.6 (CHG-033: bounded evidence + partitioned result tables, `cplm-api`) + Flink patch 2 (the same jar f7c99294e0767ea9, shipped in the Flink image) in one deployment | `release-out/v2.6.1-20260927`; `changes_tracker.md` "Release v2.6.1" |

## 3. Retention: what we keep and for how long

| Store | Setting | Value at the plant | Where | Why |
|---|---|---|---|---|
| Evidence, live artifacts (`TRANSIENT`) | `Cplm__EvidenceTransientHours`, `Cplm__EvidenceTransientBudgetBytes` | 6 h AND 2 GiB (oldest first) | cplm-api env (`migration/.env`); sweep every `Cplm__EvidenceSweepIntervalMinutes` = 15 | v2.5 emitted ~1.4 GB/h and filled the disk in three hours; the workbench needs recent artifacts, not history |
| Evidence, episode captures (`EPISODE`) | `analytics.retention_policy` row `EPISODE` | **2 days** after the episode closed (was 90; cut 2026-10-02), never while it is open | `ops/cpm-10a-episode-evidence.sql` | the user's design: evidence follows the episode, captured at OPEN / ESCALATE / CLOSE (`Cplm__EpisodeCaptureMax` = 3 automatic captures, CLOSE always) |
| Evidence, reconstructions (`STANDARD`) | row `STANDARD` | **3 days** (shipped 90; cut at the go-live disk survey) | `retention_policy` | an operator-requested rebuild is cheap to redo |
| Evidence, pinned (`PINNED`) | row `PINNED` | never | `retention_policy` | investigation references |
| Short features | row `SHORT_FEATURES` | 3 days (daily partitions, dropped whole) | `ops/cpm-10b-result-partitions.sql`; `FeaturePartitionMaintenance` hourly | 1.5-2.5 GB/day; trends beyond 3 days come from the long tier |
| Long features | row `LONG_FEATURES` | 30 days | same | 0.16 GB/day |
| Gate results (verdict history) | row `GATE_RESULTS` | 30 days; **14 if the headroom rule fires** (the plateau must stay 10 GB below free space) | same | 0.6 GB/day at ~21.5 KB per row: the largest permanent consumer |
| Short-tier artifacts at the source | `CPLM_SHORT_EVIDENCE_EMIT` (04b, Short job only) | unset = `none` | `migration/.env`, `migration/04b-submit-flink-jobs.sh` | six sliding windows x 144 loops = ~24 GB/day of write-and-delete churn on the shared cluster; G0-G4 evidence is reconstructed on demand |
| Evidence emission, long tier + fusion | `CPLM_EVIDENCE_EMIT` | `episodes` again since 2026-10-02 13:19 UTC (off 12:40-13:19 that day during the recovery), bounded by EPISODE = 2 d and the 2 GiB cache; the capture debounce (CHG-034) is still owed | same | policy `episodes` = windows with a finding; at this plant that is every window, hence the class bounds above |
| Kafka topics | `retention.ms` per topic | samples 12 h; `feature.short` 2 h; `gate.evidence` 1 h; other feature/evidence streams 6 h; record-bearing topics 3 d; live metrics 1 h; compacted topics untouched | `migration/kafka/topics.txt` (plant values); `migration/04c-apply-topic-retention.sh` | below the documented minimums, chosen for disk; every consumer can re-derive from the historian |
| IoTDB log files | `cap-iotdb-logs.sh` hourly (cron `cpa-capacity`) | truncate four named files past 200 MB (ours and the PI archiver's) | `migration/cron.d/cpa-capacity` | the PI archiver's error log grew 1.28 GB in a day |
| Interim prune cron | `prune-short-features.sh` | **retired in v2.6** (was a 6 h / 24 h DELETE every 30 min) | none | replaced by the partitions |

Steady state with these values: about 35-45 GB with 30 days of gate results, about 25-35 GB with 14; the host had
about 25 GB free after the 26 September cleanup. The 24 h measurement in the v2.6 VM steps (step 6c) decides.

## 4. Engine and pipeline settings

| Setting | Value | Why |
|---|---|---|
| Watermarks | per-partition at the KafkaSource, bounded out-of-orderness `outOfOrdernessMinutes`, sample idleness **30 min**, control streams `noWatermarks().withIdleness(1 s)`, no re-assignment after joins | patches 1 and 2: a single max-based watermark over 16 partitions dropped 91 % of samples as late; 1 min idleness collapsed the minimum under back-pressure |
| G0 completeness | expected samples from the declared `grid_seconds`, not the median interval | patch 1: the median of whole-second intervals gave 4 or 6, never 5 |
| Short Feature job parallelism | `CPLM_SHORT_PARALLELISM=4` (16 slots; 9 were free) | one core could not keep six sliding windows over 142 loops current |
| Job submission | `04b` `submit_if_missing` (skips RUNNING / RESTARTING); a resubmit is a cancel by id, then `04b`; fresh window state after any resubmit (short windows within the hour, 12 h / 24 h verdicts within a day) | no HA, no savepoints |
| Uneven partition backlog | cancel the Short job, `kafka-consumer-groups --reset-offsets --to-latest`, resubmit | proven twice on 27 September; the skipped backlog was being discarded anyway |
| CPLM consumer groups | exactly ONE member per group (`traverse-cpa-cplm-results`, `...-frames`, evidence, condition, response, health, config-acks); `SingleMemberGuard` asserts it | two members split the partitions and each persists a subset silently |
| Gate configuration signing | `CPLM_GATE_CONFIG_KEY` on JM and TM (= `TRAVERSE_SERVICE_KEY`) | unsigned bundles are NACKed; six workers must announce one jar |
| Episode family change | `Cplm__FamilyChangeWindows` = 3 (v2.6.2) | a different fault family must hold 3 consecutive fault windows (45 min; unjudged windows neither count nor reset) before an episode changes hands; candidate windows never move the severity; before, every flip closed and reopened (348 a day) and captured evidence |
| Replay / reconstruction jar | cplm-api uploads its own mounted jar (host `src/flink/target/ams-flink-1.0-SNAPSHOT.jar`); it may differ from the engine image's jar between releases (patch 4: `043a6456` vs engine `f7c99294`) | a bounded run is a separate program; its manifests carry the jar they ran on. Replace the host file with `cp` (the bind mount holds the inode) and restart cplm-api |
| Recompute brokers | `CplmRecompute__BootstrapServers` = `kafka-1:9092,kafka-2:9092` on cplm-api (overlay, from `KAFKA_BOOTSTRAP_INTERNAL`) | the bounded job reads the parameter-update topic in `main()` with these brokers; the option's default was the lab's `kafka:9092` and every replay / reconstruction at the plant was refused until 2026-10-03 (CHG-036). From the next cplm-api image the service falls back to its own `Kafka__BootstrapServers` |
| Historian device for replays | `root.site1.cpm.<SafeNode(loop)>` = `IotDb:LoopRootPrefix` (writer) + SafeNode; the registry `site` (`hdpe`, UNS hierarchy) is NOT the historian site | the replay job built the path from the registry site and read nothing (CHG-036, fourth cause). cplm-api passes `--iotdb-device` from the next image; the jar's default prefix is `root.site1.cpm` |
| Evidence reconstruction source | `iotdb` (the historian), set by the workbench; the API also accepts `kafka` | the samples topic keeps 12 h at the plant (`retention.ms` 43200000), the historian keeps the loop series for weeks; a rebuild from Kafka of an older window produced nothing (2026-10-03). The replay job reads `root.<site>.cpm.<loop>.{pv,sp,op,vp,mode}` over exactly the run's support and needs one free TaskManager slot |
| Quality decoding | every MQTT loop data source declares `quality_protocol = STRING_ENUM` (`ops/set-quality-protocol.py`) | never derive quality from the payload's `source` field |
| Loop model | `command_path` = `OP_TO_VALVE` for 169 loops, `OP_TO_VFD` for FIC10405, all EXPLICIT; 5 loops `UNKNOWN` | the VFD / cascade-master exception list is still owed by the control engineer |
| Ingestion parking | ~14.6 % of OT messages park (one Bender monitor is 99.8 % of them): narrow the subscription to exclude `OT/HDPE/BENDER/#` | open |

## 5. Performance settings

| Where | Setting | Why |
|---|---|---|
| Fleet reads | `idx_cplm_gate_results_latest_real` / `_latest_any` / `_created_at` (CHG-023) with per-loop LATERAL probes; on the v2.6 partitions one index probe per partition (about 31); proven with `ops/cpm-06-fleet-perf-probe.sql` before and after | Overview / Performance went from 34.8 s to 0.14 s in release v6 and must stay in that order after cpm-10b |
| Gateway rate limiter | session class (refresh / logout) fails OPEN, one bounded Redis round trip (300 ms), circuit breaker, in-process counters while Redis is away | a 1 s Redis stall logged every user out (lab finding, 2026-09-17) |
| Evidence reconciler | `created_at` indexes on the three result tables | it scans `created_at > now() - 20 min` every minute; without them a partitioned table is seq-scanned per partition |
| Sweeps | evidence every 15 min, batched (5 000 / 2 000 / 20 000 rows, `FOR UPDATE SKIP LOCKED`); partitions hourly under a 5 s lock timeout | bounded pieces; never queue the writer behind a long reader |
| Flink checkpoints | RocksDB + MinIO, no HA; **cancel every job (`flink cancel`) before `docker rm -f` of JM and TM, or delete the orphaned `/data/ams-flink/checkpoints/<job id>` directories afterwards** | a killed JobManager leaves each job's last checkpoint behind: 34 orphans / 5 GB found 2026-10-02 |

## 6. Issues faced and what we changed

| Date | Issue | Change | Record |
|---|---|---|---|
| 2026-09-18 to 20 | disk full, Kafka down, the ingestion producer never reconnected | reconnect fix; Kafka retention cut | CHG-031 |
| 2026-09-26 (three hours after v2.5) | 311 MB free: evidence per window plus no result retention; ZooKeeper wrote a zero-byte transaction log and crash-looped; Kafka lost its coordinator (about 20 min, Instrumental included) | `CPLM_EVIDENCE_EMIT=none`, TRUNCATEs, `resize2fs` +9 GB, log truncation, Kafka retention minimums, evidence class 3 d, prune and cap crons; the zero-byte `log.7dbe` moved aside (never delete the ZooKeeper data directory) | `migration/MARUN-DISK.md`, `docs/marun-capacity-remediation.md` |
| 2026-09-27 (day two) | every loop DEGRADED, no short windows, G0 FAIL everywhere | Flink patches 1 and 2 (grid basis, watermarks, idleness, parallelism), offsets reset | `checklist.md` "Production patches" |
| 2026-09-27 | permanent form of the space fix | v2.6 / CHG-033 (section 3 of this file) | `changes_tracker.md` |
| 2026-10-03 | cpm-10b applied (three result tables partitioned, GATE_RESULTS 14 d); the Short job found in a checkpoint restart loop since the 2 Oct ingestion stop (checkpoints expire under back-pressure, the job restores and rewinds, event time 13 h behind) | cancel, offsets of `traverse-cpa-flink-cplm-short` to latest, resubmit; follow-up: checkpoint timeout for the Short job, alert on checkpoint failures | `checklist.md` 5.5-5.7 |
| open | the admin password was pasted into a session transcript | rotate it | `checklist.md` "Still open" |
| open | Instrumental: diode-outbox backlog, IoTDB error log | tell Instrumental | `checklist.md` |
| 2026-10-02 | 1.4 GB free again: the EPISODE class (kept 90 d after close) grew 1 GB/day because fused verdicts flip fault family window to window (580 episodes opened / 481 closed per day, 348 closes FAMILY_CHANGED, 413 shorter than 1 h; each flip = CLOSE + OPEN capture of ~95 artifacts); 34 orphaned Flink checkpoint directories (5 GB) from every `docker rm -f` of the JobManager | evidence off (`CPLM_EVIDENCE_EMIT=none`, Long + Fusion resubmitted), `EPISODE` = 2 d, `TRUNCATE evidence_chunk, evidence_manifest` (0 pinned), orphan checkpoints deleted; 17 GB free | this file; `checklist.md` Phase 5 |

## 7. Deploying to another server: what to decide again

1. Disk: an own volume for our Docker volumes (item 1 of the remediation document); size it from the rates in section 3 times the days wanted.
2. `migration/.env`: every `CPLM_*` value above, `CPLM_GATE_CONFIG_KEY`, the Kafka bootstrap and container names (`migration/lib.sh` defaults are Marun's).
3. The `retention_policy` rows (section 3) and the `Cplm__*` values: set them for that disk BEFORE switching evidence on.
4. Kafka topic retention (`topics.txt`) and `04c-apply-topic-retention.sh`; whether TimescaleDB exists (if it does, `39_timescale_policies.sql` instead of cpm-10b).
5. The OT payload contract (`quality_protocol`, `event_ts_ms`, `grid_seconds`) and the loop model (`command_path`).
6. Cron: `migration/cron.d/cpa-capacity` (log caps); monitoring (the observability profile is off at Marun; remediation item 4).
