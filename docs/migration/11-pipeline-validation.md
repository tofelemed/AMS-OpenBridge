# 11 — End-to-End Pipeline Validation (2026-08-13)

**Scope:** every data pipeline in the AMS / Traverse platform, exercised end-to-end with
synthetic load against the local Docker Compose lab — Kafka → Flink → PostgreSQL/IoTDB →
Sparkplug/EMQX/Redis → REST/SignalR → frontend transports.
**Tooling:** the new [`ams-sims/`](../../ams-sims/README.md) suite (one Python script per
pipeline, machine-parseable reports in `pipeline-reports/`).
**Live bug log:** [`pipeline.md`](../../pipeline.md) (repo root) — every defect with
evidence, category (auto-fix vs flag), and status. This doc is the methodology + closing
summary; the bug log is the authority on defect state.

## How it was run

- Stack already up (34 containers, `run-all.ps1` provisioned earlier the same day); the
  running Alarm State Machine / Alarm KPI Engine come from the working-tree
  **KafkaSinks keying fix** (`docs/alarm-history-flink-sink-stuck.md`) hot-deployed that
  morning — this validation doubles as its soak test.
- Kafka publishing rides `docker exec kafka-console-producer` with `parse.key=true`
  (host 9093 advertises an unresolvable address — PIPE-001), so every record is keyed;
  Redis/Postgres/IoTDB verified via `docker exec` / REST; APIs via the gateway with a
  real JWT; MQTT via host 1883 and `/mqtt-ws`; SignalR via `signalrcore` (direct-WS).
- Each simulator embeds a unique `--run-tag` in every record so runs never collide, uses
  ephemeral consumer groups, exits non-zero on Kafka failure, and emits `SUMMARY_JSON`.

## Stage results (details + evidence in pipeline.md "Stage log")

| # | Stage | Result |
|---|---|---|
| 1 | Kafka topic audit | ✅ all catalog topics exist, partitions + cleanup.policy per catalog; 3 config drifts **fixed** (PIPE-004), 2 flagged (PIPE-005 auto-create on, PIPE-006 uncataloged topics) |
| 2 | Flink job health | ✅ 7/7 standing jobs RUNNING, checkpoint mode+interval exactly per `05-flink-jobs.md`, 0 failed checkpoints |
| 3 | Pipeline A: alarm feed (`sim_alarm_feed`) | ✅ 8/8 checks — keyed upserts, Postgres identity columns, severity→priority mapping, SignalR, ~30–50 s E2E |
| 3b | ACK loop (`sim_ack_lifecycle`) | ✅ 10/10 checks — API never sets ack directly; DISPATCHED → (DCS unreachable) FAILED verified; synthetic ACK_CONFIRMED → `ACK_STATE_UPDATE` → Postgres. Defect PIPE-009 (ACK_REQUESTED field scramble) |
| 4 | Alarm historian (IoTDB) | ✅ tree keyed by sanitized Kafka `alarmId`, 12/12 series+values. Defect PIPE-007 (CRITICAL = 950 here vs 900 in Postgres) |
| 5 | Pipeline B isolated (`sim_live_mqtt_direct`) | ✅ 7/7 — DBIRTH-before-DDATA, alias maps, QoS 0, no retain, contract-tier Redis snapshots w/ TTL, no IoTDB leak |
| 6 | Full live path via Flink | ✅ exact RBE propagation (8→8), 48 snapshot keys. Observation PIPE-010 (live.* null keys) |
| 7 | CPLM / loops (`sim_loop_samples`) | ✅ 11/11 — short/long/gate produced in-run (compressed event time), `traverse_cplm` rows, IoTDB raw **exact-count** (idempotent) + full KPI dual-write tree, loop RBE, forbidden job absent |
| 8 | Binding resolution (`sim_binding_resolution`) | ✅ 7/7 — live/history/alarm descriptors, batch (`{"bindings":[…]}`), edge-only auth enforced. Observation PIPE-011 (stale internal URLs in descriptors) |
| 9 | API surface smoke | ✅ alarms/statistics/CPM gates+KPIs/hist trend+raw+snapshot/health-pipeline all 200 and reflecting the injected data (health is `/api/v1/health/pipeline`; bare `/health/pipeline` doesn't exist) |
| 10 | Frontend smoke | ✅ transport-level — SPA + bundles serve; `/mqtt-ws` 401 without JWT, streams with `?access_token=` via nginx AND gateway (193 msgs/6 s); SignalR + hist + health verified in earlier stages. **No browser DOM pass** (no Playwright in lab) |
| 11 | Flood/load (`sim_stress_flood`) | ✅ infra: 2114 msg/s ingest, dedup 8000→2000 exact, RBE + EMQX bounded, 0 checkpoint failures, all jobs up. **Defect PIPE-012: FloodDetectFilter unreachable on the http-feed path** |
| — | Cross-cutting | ✅ CQRS (no Flink JDBC sinks), CPLM consumer singletons (both groups, static instance ids), idempotent replay (12→12→12 at topic AND both tables), auth boundary in-network (all 401 without proper credentials; dev-default service key rejected — lab runs a strong key) |

## Defect register summary (full rows in pipeline.md)

**Auto-fixed & re-verified (1):**
- **PIPE-004** — `flink.state.alarm.replay`, `analysis.executions`, `analysis.results`
  were on broker defaults (24 h retention) instead of the declared 7 d / delete policy.
  Aligned via `kafka-configs --alter`; re-verified.

**Flagged — need approval (8):**
- **PIPE-001** (Medium) — Kafka EXTERNAL listener advertises an empty host; published
  9093 unusable by host clients. Fix = compose change + broker restart.
- **PIPE-002** (Medium, environmental) — DCS ACK URL `192.168.1.51:8010` unreachable;
  `ACK_CONFIRMED` uncoverable E2E without a mock ACK endpoint in the lab.
- **PIPE-005** (Medium) — `KAFKA_AUTO_CREATE_TOPICS_ENABLE=true` contradicts the Plan 09
  decision recorded in the reset script/docs.
- **PIPE-006** (Low) — `audit-events` + `lifecycle-alerts` missing from the reset-script
  catalog (24 h retention in effect).
- **PIPE-007** (Medium) — CRITICAL normalized to **950 in IoTDB** vs **900 in Postgres**
  (two divergent `priorityToSeverity` copies); 950 collides with the flood-drop constant.
- **PIPE-009** (Medium) — `ACK_REQUESTED` lifecycle event emitted with scrambled fields
  (C# overload-resolution bug in `OperatorActionPublisher` → `EmitAsync`); the state is
  invisible to any consumer. Also: `ACK_PENDING_DCS` defined but never emitted (doc drift).
- **PIPE-010** (Low) — `live.*` topic records are null-keyed → no per-alarm partition
  ordering on the live path.
- **PIPE-011** (Low) — binding descriptors return pre-lockdown internal URLs
  (`historian-bff:8090`, `ams-api:8000`, `emqx:8083`) that browsers can't reach; frontend
  survives only because it ignores those fields.
- **PIPE-012** (Medium) — flood detection (`severity ≥ 950` drop) is dead code for
  http-feed alarms: severity is clamped to ≤900 before the filter. Design decision needed
  (rate-based flood handling vs pre-normalization threshold).
- **PIPE-003** (Low, docs) — resolved as doc shorthand: the real CPLM groups are
  `ams-api-cplm-results` and `ams-api-cplm-results-frames` (both verified singleton);
  CLAUDE.md/runbook shorthand suggests a nonexistent `ams-api-cplm-frames`. Bonus stale-doc
  finding: `lifecycle-alerts` is no longer an orphan — deployed notification-service
  consumes it with lag 0 (STR-05 effectively closed; PHASE0/PHASE1 review claims stale).

## Closing summary (§9.4 of the execution prompt)

**Pipelines fully verified E2E:** alarm ingest → state machine → projection → SignalR;
alarm historian (IoTDB); ACK loop (to the DCS boundary, plus confirm-branch via synthetic
DCS reply); live Sparkplug path (isolated AND through Flink RBE); CPLM short/long/fusion →
`traverse_cplm` + KPI dual-write; raw loop historian; loop live RBE; binding resolution;
API surface; frontend transports; flood/load resilience.

**Pipelines with open flagged defects:** ACK lifecycle observability (PIPE-009), historian
severity fidelity (PIPE-007), flood detection (PIPE-012), live-path ordering (PIPE-010),
binding descriptor contract (PIPE-011) — none blocks data flow today; all have proposed
fixes awaiting approval in `pipeline.md`.

**Pre-flight conditions not met (accepted, documented):**
1. Postgres volume was NOT fresh (stack pre-existing; baseline rows noted, not assumed clean).
2. DCS ACK endpoint unreachable (PIPE-002) → `ACK_CONFIRMED` exercised synthetically.
3. `ams-api-cplm-frames` group "missing" per docs — actually a doc-naming artifact (PIPE-003).
4. Acceptance criterion "all 7 jobs RUNNING with zero checkpoint failures attributable to
   test load" — **met** (verified before, during, and after the flood stage).
5. No grossly abnormal latencies observed: alarm E2E ≈ 30–50 s dominated by the 30 s
   checkpoint-bound sink flush (expected, documented); live path < 10 s; trend/raw queries
   sub-second under light load.

**Not covered (explicitly):** visual browser rendering of the five UI routes (transport +
data planes verified; no browser driver in the lab); real DCS ACK confirmation; Kafka
host-listener fix (needs broker restart — schedule with the next stack recycle).

---

## Addendum — fix round (2026-08-13, later the same day)

All flagged defects were approved, fixed, redeployed, and re-verified; `pipeline.md` rows
updated in place with per-fix evidence. Summary:

| Defect | Fix | Re-verified |
|---|---|---|
| PIPE-001 | Kafka advertises `EXTERNAL://${KAFKA_EXTERNAL_HOST:-127.0.0.1}:9093` | host client lists + produces |
| PIPE-002 | new `mock-dcs` compose stub; `ACK_WRITEBACK_URL` env-overridable | real `ACK_CONFIRMED` E2E (rack2) |
| PIPE-003 | CLAUDE.md spells out full CPLM group names | doc text |
| PIPE-005 | auto-create OFF | nonexistent-topic produce fails; nothing created |
| PIPE-006 | `audit-events` + `lifecycle-alerts` in reset-script ensure-tier; configs aligned | `--describe` |
| PIPE-007 | IoTDB job CRITICAL→900 (matches PipelineOperators) | historian shows 900/CRITICAL |
| PIPE-009 | named args at `OperatorActionPublisher.cs:58` | proper REQUESTED→QUEUED→CONFIRMED chain |
| PIPE-010 | keyed sinks: `live.alarms`/`live.alarm.metrics` by alarmId, `live.loop.metrics` by loopId | keyed records on both topics |
| PIPE-011 | gateway-relative binding descriptors (`Public:*` config) + `mqtt.wsPath` | live resolve + rbind1 7/7 |
| PIPE-012 | flood filter tests pre-clamp `rawSeverity` | rfld2: 100×sev-960 dropped, CAS +300 exactly |

New findings during the round: **PIPE-013** — `live.alarm.metrics` had never been cataloged
(existed only via auto-create; its absence under the new auto-create-off policy stalled the
Live State RBE checkpoint flush → topic created + cataloged), and **PIPE-014 (High, partially
open)** — IoTDB server memory exhaustion made all historian writes fail for ~40 min while the
Flink IoTDB sink logged-and-dropped and checkpoints kept completing; recovered by restarting
IoTDB (retained batches re-flushed, no loss this incident), with explicit IoTDB memory sizing
and a fail-loud/DLQ sink flagged as the durable fixes.

Full re-run: all six simulators pass (alarm feed, ACK with real DCS round trip, MQTT direct,
loops, binding, flood-with-drop). Remaining open items: PIPE-014 durable fixes, rate-based
flood-handling design (PIPE-012 note), `ACK_PENDING_DCS` doc drift (PIPE-009 note).

---

## Addendum 2 — production hardening round (2026-08-17)

Restart-safety / no-data-loss hardening, five items in order (full table in `pipeline.md`
"Production hardening round"): **(1) Flink JM HA** (ZooKeeper + MinIO storageDir) — a
JobManager restart now recovers all 10 jobs with identical ids and checkpointed state, zero
resubmissions, zero replay; **(2) PIPE-014 closed** — explicit IoTDB heap (mounted
`datanode-env.sh`, `-Xmx3G`) + `FailLoudIoTDBSink` (write failure fails the checkpoint);
verified by the gold test: IoTDB outage + alarms injected + TaskManager restarted mid-outage
→ 5/5 alarms recovered from Kafka replay; **(3) recovery-state-aware submit guards**
(supervisor + one-shot submit scripts) — no more duplicate jobs around restarts; docs
corrected: the supervisor owns TEN standing jobs (STR-07/08), not seven;
**(4) committed-offsets start position** for the state machine, its ACK sources, and the
IoTDB job — a fresh submit grew `current-alarm-state` by 0 instead of ~6,000;
**(5) RF≥3 prep** — topic replication env-parametrized (`KAFKA_TOPIC_RF`/
`KAFKA_TOPIC_MIN_ISR`); actual RF≥3 needs the production 3-broker topology
(`docs/ha-production-guide.md`).
