# OT Loop Ingestion — Runbook

**Scope:** operating the `MQTT_LOOP_SAMPLES` subscriber pipeline in `ingestion-service`
(phase 2, 2026-08-31). Contracts: [09-ot-mqtt-loop-mapping.md](09-ot-mqtt-loop-mapping.md);
decisions/evidence: [08-ot-mqtt-loop-ingestion-assessment.md](08-ot-mqtt-loop-ingestion-assessment.md).
All API calls ride the gateway (`:8081`) with an Admin token (`ingestion.view`/`ingestion.manage`).

## 1. Adding a new loop (no redeploy, ever)

1. Add a row to the loop worksheet (columns per `scripts/import-cpm-loops.ps1`; sample:
   `scripts/fixtures/hdpe-pilot-loops.csv`). `loop_id` **must equal the OT topic's loop
   level** (e.g. `FIC10403`) — the registry id IS the resolution key.
2. `.\scripts\import-cpm-loops.ps1 -CsvPath loops.csv` (or the `/cpm/registry` UI / CSV import).
3. Wait one registry refresh (`loop_ingest.registry_refresh_seconds`, default 60 s) —
   the loop's messages stop parking and start flowing. Verify:
   - `GET /api/ingestion/stats` → `registryLoops` grew, `tuplesEmitted` climbing;
   - `GET /api/v1/cpm/loops/<id>/readiness` → registry/tag checks ok, samples arriving;
   - the `LOOP_NOT_REGISTERED` row for it in `/api/ingestion/unknown-sources` stops growing
     (rows are evidence — they are not auto-deleted).

## 2. Configuring the MODE map (and other loop_ingest settings)

`MODE` arrives numeric (`4.0`); the engine needs vocabulary strings (`AUT`, `CAS`, `MAN`…).
Edit the data source (Administration → Data Sources, or `PUT /api/ingestion/data-sources/{id}`)
and set `profile_config.loop_ingest`:

```json
"loop_ingest": {
  "mode_value_map": { "1": "AUT", "2": "MAN", "3": "CAS", "4": "IMAN" },   // SME-confirmed, see §2
  "grid_seconds": 5,
  "registry_refresh_seconds": 60,
  "topic_template": "{ns}/{site}/{fcs}/{class}/{loop}/{group}/{param}"
}
```

Saving changes the config fingerprint → the subscriber restarts itself within 30 s.
Unmapped mode values pass through as raw strings (visible in tuples) and hurt window
eligibility — that is the signal the map is incomplete. **The real CENTUM enum must come
from the OT team** (assessment §6 open question 1); do not guess.

### MODE enum — SME-confirmed (2026-09-09)

| MODE | CENTUM meaning | Map to | Engine reads it as | Loops analysed? |
|---|---|---|---|---|
| 1 | AUT | `AUT` | auto | yes |
| 2 | MAN | `MAN` | manual | no — correctly excluded |
| 3 | CAS | `CAS` | **auto** (a cascade slave is still under closed-loop control) | yes |
| 4 | MAN IMAN (initialisation manual) | `IMAN` | manual | no — correctly excluded |

```json
"mode_value_map": { "1": "AUT", "2": "MAN", "3": "CAS", "4": "IMAN" }
```

Map to those **exact tokens**: `isAutoMode()` tests set membership (manual first, then auto)
before falling back to a substring check, and `AUT`, `CAS`, `MAN` and `IMAN` are all exact
members. Writing the SME's literal label `"MAN IMAN"` would also end up non-auto, but only by
falling through every branch to the default — recognition is safer than luck.

**Two values must not be left unmapped.** An unmapped value passes through raw (`"3"`), matches
nothing, and is counted **not-auto**:

- `3` unmapped ⇒ every cascade loop silently excluded from analysis.
- `1` unmapped ⇒ every AUT loop excluded. This is what the plant was running: the previous map
  guessed `4=AUT, 3=CAS, 2=MAN`, so `1` (12 of 21 loops in the snapshot, median |SP−PV| 0.755
  with SP and OP always non-zero) was excluded, while `4` — idle, SP = OP = 0 — was labelled
  AUT and analysed. G0 passed throughout because the data itself was healthy, which is why the
  fleet produced no verdict while looking perfectly fed.

A loop that never receives a MODE message at all is stamped `UNKNOWN` by the joiner, which the
engine also treats as not-auto — so a missing MODE topic excludes the loop just as silently.

## 2b. Valve positioner feedback (VP) — and adding any other parameter

The pipeline carries `vp` as a first-class tuple member — optional, it does not gate
emission, and the engine uses it for G14 (without it, valve diagnostics report
`INSUFFICIENT_EVIDENCE` and overall confidence is capped at 0.89). **Since CHG-010 the
built-in map already contains `VP → vp`**, so the day OT publishes a `VP` leaf it flows with
no config change at all. What remains is per loop:

1. Map the loop's `VP` signal role in the registry (wizard "Valve position", CSV `vp_tag` /
   worksheet `vp_ot_tag`, or the `tags` array on activate). This clears the `NO_VP`
   observability flag and turns readiness `tag_vp` green.
2. Confirm with OT that the leaf **is the positioner feedback**, not a second copy of the
   output demand — G14 compares the two.

If OT's leaf is not literally `VP` (`POS`, `MV2`, …), add it to `param_roles` on the data
source:

```json
"param_roles": { "POS": "vp" }
```

**`param_roles` OVERLAYS the built-in map** (CHG-010; before it the map was *replaced*, and
this exact edit un-mapped `PV/SP/OP/MODE` and blacked out every loop on the source —
verified live 2026-09-10, 0 tuples, four parked leaves). The rules now:

- an entry **adds or re-points** one leaf; every built-in entry you do not name stays;
- a **`null` (or blank) value removes** a built-in entry — the only way to drop one, e.g.
  `{ "MV": null }` on a gateway whose `MV` is not the controller output;
- a save that leaves **no source parameter for `pv`, `sp`, `op` or `mode`** is refused with
  `400 loop_ingest.param_roles` naming the role — the "fleet goes dark from one config save"
  outcome is no longer reachable (`SV`/`MV` count: un-mapping `SP` alone leaves `SV → sp`);
- the **effective** map (built-ins + overlay) is on `GET /api/ingestion/stats` as
  `paramRoles`, and logged when the subscriber starts — "is VP mapped?" is one GET, never a
  log dive.

Built-in map today: `PV→pv SP→sp OP→op MODE→mode VP→vp SV→sp MV→op P→p I→i D→d GW→gw`.
`SV`/`MV` are the Yokogawa CENTUM aliases for setpoint/output. Anything mapped to a role
other than `pv/sp/op/vp/mode` rides the tuple as a numeric extension field.

A leaf the effective map does not know still parks as `UNKNOWN_PARAMETER` (raw message on
the DLQ) while `pv/sp/op/mode` keep flowing — the loop stays analysed, just without valve
diagnostics. VP quality is deliberately **not** part of the tuple's GOOD/BAD verdict, which
is worst-of `pv`/`sp`/`op` only, so a faulty positioner signal cannot invalidate an
otherwise healthy loop. A loop that publishes no VP carries **no `vp` key** on the tuple
(never `0`), so the engine's `NO_VP` is honest.

Lab proof: `scripts/test-ot-loop-ingestion-e2e.ps1` steps 5b and 11 (the sim publishes VP
for `FIC10302` only — `--vp-loops`, `--vp-item` to rehearse another leaf name).

## 3. Reviewing unknown sources (the discovery workflow)

`GET /api/ingestion/unknown-sources?configId=<id>` — one counted row per
(reason, source). `LOOP_NOT_REGISTERED` rows are the real OT loop inventory: register
the loop (§1) or deliberately ignore it. `UNKNOWN_PARAMETER` rows mean the gateway
publishes a leaf not in `param_roles` — extend the map (config edit) if it should flow.
Raw copies of every parked message are on `traverse.ingestion.ot-dlq` for replay.

## 4. OT broker outage / reconnect

The managed client auto-reconnects (5 s backoff) with a **persistent session**
(`session_expiry_seconds`, default 86400) — the broker queues QoS-1 messages while we
are away. During the gap nothing new arrives, so no source timestamp advances and the
joiner emits nothing — silence rather than republished forward-fills. Quality stays
OT's verdict (worst-of the pv/sp/op quality tags); values are never aged out. Watch: `/health` (`subscriber` check), `/api/ingestion/stats`
(`connected`, `connectionError`), Prometheus `ingestion_mqtt_reconnects_total`.
Queued-backlog values carry their original OT timestamps, and `event_ts_ms` is that
process time — so a long backlog CAN produce event times behind the watermark, and
Flink drops what is more than its out-of-orderness bound (2 min) in the past. That is
the deliberate trade for process-time fidelity: after an outage longer than a couple of
minutes, treat the gap as history and replay it through the backfill door (doc 03 §6),
never through this topic. `ingest_ts_ms` on every tuple makes the lag measurable, and
`ingestion_source_latency_ms` graphs it.

Because tuples now carry source time, a loop that goes quiet is **skipped** rather than
re-stamped — watch `ingestion_loop_ticks_skipped_total` to see it, and note the loop
will show as a gap (not steady data) in CPM.

## 5. Kafka outage

The pipeline **stalls by design**: tuple publishing retries every 2 s, the channel
fills, MQTT consumption pauses, the broker queues. Nothing is dropped; nothing is
reordered. Watch `ingestion_kafka_publish_failures_total` and the
`DlqReceivingMessages` alert. Recovery is automatic when Kafka returns.

## 6. Replaying the DLQ

```powershell
.\scripts\replay-kafka-dlq.ps1   # point it at traverse.ingestion.ot-dlq
```
Replay only after fixing the cause. The envelope carries `reason`, `mqtt_topic`, the
raw `payload`, and `received_at_ms`. A `LOOP_NOT_REGISTERED` message whose loop is now
registered will resolve if re-published to the broker path; identity-mismatch and
malformed records are evidence for the OT team, not replayable data.

## 7. Forcing a subscriber restart / registry refresh

`POST /api/ingestion/data-sources/{id}/reload` (`ingestion.manage`) — picked up within
30 s; the restart re-pulls the registry immediately. Deactivate/activate does the same
through the config watch.

## 8. Verifying end to end

```powershell
# full pipeline proof (registers pilot loops itself; needs the stack + rebuilt image):
.\scripts\test-ot-loop-ingestion-e2e.ps1
# on a lab whose Kafka volume still carries the legacy un-prefixed topic generation
# (docker exec ams-kafka kafka-topics --list shows loop.samples.v1, not traverse.cpa.*):
# set INGESTION_LOOP_SAMPLES_TOPIC=loop.samples.v1 in infra/docker/.env and pass
# -LoopSamplesTopic loop.samples.v1 here. PS 5.1 note: use -GatewayBase http://127.0.0.1:8081
# (localhost resolves to ::1 where the Docker proxy does not answer).

# manual soak: keep the data source + sim running
.\scripts\test-ot-loop-ingestion-e2e.ps1 -KeepConfig -SkipCleanup
python ams-sims\sim_ot_gateway_mqtt.py            # OT broker stand-in feed (mosquitto-test :1884)
```

Quick checks: tuples — `docker exec ams-kafka kafka-console-consumer --bootstrap-server
localhost:9092 --topic traverse.cpa.loop.samples.v1 --property print.key=true
--max-messages 5 --timeout-ms 15000`; historian — IoTDB `select count(pv) from
root.site1.cpm.<LOOP>`; CPM pages populate after ≥12 h of continuous samples.

## 9. Open OT-team questions (blocking full fidelity, not data flow)

1. ~~**CENTUM numeric MODE enum**~~ — **resolved**,
   answered by the SME 2026-09-09: 1=AUT, 2=MAN, 3=CAS, 4=MAN IMAN (see §2).
2. **`GW` semantics** (candidate: gap width %) → until confirmed it rides tuples as an
   opaque `gw` extension field.
3. Broker QoS/retained flags + our subscriber credentials on the production broker
   (`mqtts://…:8883` — set the CA in the data source's TLS block).
