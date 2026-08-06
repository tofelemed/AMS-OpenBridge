# Runbook — moving the CPLM Kafka consumers between processes

**Applies to:** `CplmResultConsumerService` and `CplmEventFrameService`, which persist
`clpm.gate.results.v1` / `clpm.feature.short.v1` / `clpm.feature.long.v1` into
`traverse_cplm` and derive event frames. They live in **`cplm-api`** (`src/services/cplm-api`).

**Why this file exists:** these consumers share the groups `ams-api-cplm-results` and
`ams-api-cplm-results-frames`. If two processes join a group, Kafka **splits the partitions
between them** — each persists only the windows on its partitions, and **neither logs an
error**. The result looks like a working pipeline that quietly stores half the verdicts.
That failure is invisible in logs, dashboards, and health checks, so the ordering below is
not a style preference — it is the only safe sequence.

Use this whenever you move the consumers to another service, run a second replica, or
temporarily point a dev instance at the shared broker.

---

## Pre-flight

Both sides are gated by the same flag, so a cutover is two env flips, never a code edit:

| Where | Key | Meaning |
|---|---|---|
| `cplm-api` (compose) | `Cplm__ConsumersEnabled` | currently `true` — this service owns the groups |
| `ams-api` (compose) | `Cplm__ConsumersEnabled` | currently `false` — historical, kept as the rollback path |

**Never `true` on both at once.**

Record the starting state (kept as evidence; see `tests/cplm-cutover-offsets-*.txt` for the
2026-08-06 originals):

```bash
docker exec ams-kafka bash -c "
  kafka-consumer-groups --bootstrap-server localhost:9092 --describe --group ams-api-cplm-results
  kafka-consumer-groups --bootstrap-server localhost:9092 --describe --group ams-api-cplm-results-frames
" > tests/cplm-cutover-offsets-before.txt

docker exec ams-postgres psql -U ams_user -d traverse_cplm -tAc "
  SELECT 'gate',   count(*) FROM analytics.cplm_gate_results
  UNION ALL SELECT 'short',  count(*) FROM analytics.cplm_short_feature_results
  UNION ALL SELECT 'long',   count(*) FROM analytics.cplm_long_feature_results
  UNION ALL SELECT 'frames', count(*) FROM analytics.cplm_event_frames;"
```

Proceed only when **lag is 0 on every partition**. Cutting over mid-backlog is legal (offsets
are committed), but it removes your ability to tell "consumer stopped" from "still draining".

---

## Cutover (strict order)

1. **Stop the current owner.** Set its `Cplm__ConsumersEnabled=false` and redeploy:
   ```bash
   docker compose up -d <current-owner>     # e.g. cplm-api
   ```

2. **Confirm ZERO members — this is the gate, do not skip it.**
   ```bash
   docker exec ams-kafka bash -c "
     for g in ams-api-cplm-results ams-api-cplm-results-frames; do
       echo -n \"\$g members: \"
       kafka-consumer-groups --bootstrap-server localhost:9092 --describe --group \$g --members 2>/dev/null | grep -c rdkafka
     done"
   ```
   Both must print `0`. If either prints ≥1, something is still consuming — find it before
   continuing. A rebalance can take a few seconds after the container stops.

3. **Start the new owner** with `Cplm__ConsumersEnabled=true` and redeploy it.

4. **Confirm exactly one member, and that it is the process you expect:**
   ```bash
   docker exec ams-kafka kafka-consumer-groups --bootstrap-server localhost:9092 \
     --describe --group ams-api-cplm-results --members
   docker inspect <new-owner-container> --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'
   ```
   The member's HOST must match the new container's IP, and `#PARTITIONS` must be the full
   count (24 with the current topic layout: 8+8+8). A member holding *some* partitions means
   another consumer is present.

5. **Confirm offsets resumed** rather than reset: compare against the before-file. Values must
   continue from the recorded offsets — not `0` (re-consuming from earliest) and not the log-end
   offset (skipping the backlog).

---

## Verification (do all four — each catches a different silent failure)

```bash
# 1. Persistence works end to end: run a recompute and confirm the verdict lands.
TOKEN=$(curl -s -X POST http://localhost:3002/api/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"..."}' | python -c "import json,sys;print(json.load(sys.stdin)['token'])")
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/v1/cpm/loops/<loop>/recompute
# poll /api/v1/cpm/replays/<replayId>?jobId=<jobId> until finished, then:
docker exec ams-postgres psql -U ams_user -d traverse_cplm -tAc \
  "SELECT diagnosis, confidence FROM analytics.cplm_gate_results WHERE payload->>'replay_id'='<replayId>';"

# 2. The OLD owner is not still writing (must print 0).
docker logs <old-owner> --since 10m 2>&1 | grep -ci CplmResultConsumer

# 3. IoTDB KPI dual-write still lands, with no write failures (must print 0).
docker logs <new-owner> --since 10m 2>&1 | grep -ciE "iotdb.*(fail|reject|exception)"

# 4. No gap in the window sequence across the cutover.
docker exec ams-postgres psql -U ams_user -d traverse_cplm -tAc \
  "SELECT window_end, diagnosis, source FROM analytics.cplm_gate_results
   WHERE window_kind='24h' ORDER BY window_end DESC LIMIT 10;"
```

Finally, re-run the response-diff harness — it is the same gate the extraction used:

```bash
python scripts/cplm-response-diff.py diff    # through nginx (default base)
python scripts/cplm-response-diff.py assert
```

If a recompute rewrote windows on purpose, re-capture the golden afterwards
(`python scripts/cplm-response-diff.py capture`) and say so in the commit — never edit the
golden files by hand.

---

## Rollback

Reverse the same sequence: new owner `false` → confirm zero members → old owner `true`.
Because the group ids are unchanged, committed offsets carry over in both directions and no
data is re-processed or skipped.

## Related traps

- **Self-healing DDL hides an empty database.** Both consumers create their tables when
  missing. Pointed at a fresh/empty database they will create empty tables and report healthy,
  losing nothing visibly while persisting into the wrong place. Always confirm
  `current_database()` (cplm-api's `/health` asserts `traverse_cplm`) and row counts.
- **`RawLoopIotDbConsumer` is not part of this.** It stays in `ams-api` with its own consumer
  group and writes raw loop samples to the IoTDB historian. Do not move it to "tidy up".
- **The Flink jar must be bind-mounted** into whichever service owns A8 recompute
  (`/opt/ams/flink/ams-flink.jar`), or recompute fails only when someone clicks it.
