# CPM loop validation — 12 h investigation runbook

Companion to [`scripts/cpm-validate-loops.sql`](../scripts/cpm-validate-loops.sql).
Order matters: each step rules out a layer, so a failure at step *n* makes steps
after it meaningless until it is fixed.

**Loops under test** (edit section 0 of the SQL to change):

```
FIC10409  FIC10509  FIC10501  FIC10502  LIC10501
PIC00605  PIC80143  PIC80141  FIC80103  PIC80140
```

**Prerequisites:** DB access to `traverse_cplm`, an Admin token for the gateway,
and shell access to the Kafka container. Replace `<GW>` with the gateway base URL
and `<KAFKA>` with the Kafka container name.

---

## Step 1 — Is it configured? (SQL §1, §12)

Run **section 1** and **section 12** of the SQL first. Section 12 returns one row
per finding; **an empty result is the pass condition.**

Stop and fix before going further if you see:

| Finding | Meaning |
|---|---|
| `NOT REGISTERED` | the loop does not exist — nothing downstream can work |
| `incomplete signal roles` | monitoring needs all four of PV/SP/OP/MODE |
| `monitoring disabled` | registered but deliberately not analysed |
| `no PV range declared` | G3 falls back to a flat ±0.5 EU band |
| `OP out of range after normalisation` | the declared OP range does not match the real signal — **saturation and G2r are meaningless until corrected** |

---

## Step 2 — Did data actually arrive? (SQL §2)

`short_windows = 0` means nothing reached Flink. That is an ingestion problem, not
a gate problem — go to step 3 and do not read the gate sections.

`feed = STALE` means it arrived but stopped.

---

## Step 3 — Ingestion side (only if step 2 was empty or stale)

```bash
# subscriber connected, tuples climbing, registry loaded?
curl -s -H "Authorization: Bearer $TOKEN" <GW>/api/ingestion/stats | jq

# is the loop parked instead of flowing? LOOP_NOT_REGISTERED = tag mismatch
curl -s -H "Authorization: Bearer $TOKEN" <GW>/api/ingestion/unknown-sources | jq

# are tuples on the topic, and do they look right?
docker exec <KAFKA> kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic traverse.cpa.loop.samples.v1 \
  --timeout-ms 20000 --max-messages 400 2>/dev/null \
  | grep -E '"loop_id":"(FIC10409|FIC10509|FIC10501|FIC10502|LIC10501|PIC00605|PIC80143|PIC80141|FIC80103|PIC80140)"' \
  | tail -5
```

On each tuple check, in this order:

- **`mode`** — must be a token (`AUT`/`CAS`/`MAN`/`IMAN`), never a raw digit.
  A raw `"1"` means `mode_value_map` is wrong and **G1 will exclude every window**.
- **`quality`** — `GOOD`; worst-of pv/sp/op only.
- **`event_ts_ms` vs `ingest_ts_ms`** — they must differ. Equal values mean the
  process timestamp is not being carried.
- **duplicate `event_ts_ms` for one loop** — two data sources on overlapping
  topics double-publish; IoTDB then keeps one arbitrarily.

```bash
# only ONE active MQTT_LOOP_SAMPLES source should cover these topics
curl -s -H "Authorization: Bearer $TOKEN" <GW>/api/ingestion/data-sources \
  | jq '.[] | select(.isActive) | {configId, name, topics: .profileConfig.mqtt.topics,
        modeMap: .profileConfig.loop_ingest.mode_value_map}'
```

---

## Step 4 — Current verdict, gate by gate (SQL §3, §4)

**§3** is the headline: all 16 gates, diagnosis, confidence, severity.
**§4** shows whether it is stable — `distinct_diagnoses > 1` means the loop is
flapping between calls, which is a different investigation from one that is
steadily bad.

Reading traps:

- **`STRONG` is not good.** On G4/G7/G8/G9 it is strong evidence of a *fault*.
- **G2 and G3 never FAIL** — PASS or WARN only.
- **`confidence = 0.890` exactly** is the signature of the G14 no-VP cap: the loop
  scored ≥ 0.90 and was demoted from CONFIRMED to SUSPECTED because it has no
  valve-position signal. Nothing is wrong with the loop.

---

## Step 5 — Why (SQL §5–§10)

One section per gate family, each showing the numbers behind the status rather
than the status alone.

| Section | Gate | The number that explains it |
|---|---|---|
| §5 | G0 | `completeness`, `bad_quality_pct`, `duplicate_ts`, `max_gap_s` |
| §6 | G1 | `auto_pct` — near 0 with data present means a bad mode map |
| §7 | G2, G2r | `sp_range_eu` vs the profile max; `region_out_pct` |
| §8 | G3, OCE | **`mae` vs `band_eu`** — the single most useful comparison |
| §9 | G4, G10 | `effort_ratio`, `saturation_pct`, `op_range_pct` |
| §10 | G5–G11 | ACF/FFT period, triangularity, phase area, `gate9_reason` |

§8 is where a wrong PV range shows itself: if `mae` is far larger than `band_eu`,
`good_error_pct` is 0 and G3 sits at WARN forever — that is arithmetic, not a
control problem.

---

## Step 6 — What is blocking (SQL §11)

Names the **first** of the five exclusions that fires. Only that one is worth
fixing for that loop; the rest are consequences.

```
1. INSUFFICIENT_DATA     -> fewer than 10 samples, or G0 already failed
2. G0 data quality       -> completeness/quality/duplicates
3. G1 mode/service       -> not in AUT/CAS enough of the window
4. G2r operating region  -> PV or OP outside the declared region
5. G11 sensor freeze     -> PV unchanged >= 60 s AND >= 10 % of the window
```

`not blocked` with a diagnosis is the healthy outcome.

---

## Step 7 — Did the engineering ranges reach the engine?

The database is not the engine. A range loaded by SQL is invisible to Flink until
it is broadcast.

```bash
docker exec <KAFKA> kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic traverse.cpa.ams.metadata.updates \
  --from-beginning --timeout-ms 15000 2>/dev/null \
  | grep -E '"calcInstanceId":"(FIC10409|LIC10501|PIC80140)"'
```

Expect `"name":"cplm.loop.engineering","value":"{...pvEngMin...pvEngMax...}"`.

If absent, republish — this also backfills the UNS signal-asset projection:

```bash
for L in FIC10409 FIC10509 FIC10501 FIC10502 LIC10501 \
         PIC00605 PIC80143 PIC80141 FIC80103 PIC80140; do
  curl -s -X POST -H "Authorization: Bearer $TOKEN" \
    <GW>/api/v1/cpm/loops/$L/republish-evidence
  echo
done
```

Then confirm the band moved: re-run SQL §8 and check `band_eu` against the
declared span, and `good_error_pct` against the previous value.

---

## Step 8 — Engine health (rules out the platform, not the loop)

```bash
# all three CPLM jobs RUNNING, and started AFTER the last deploy
curl -s <FLINK>/jobs/overview | jq '.jobs[] | select(.name|test("CPLM"))
  | {name, state, start: (.["start-time"]/1000|todate)}'

# exactly ONE consumer per CPLM group - two split the partitions silently
docker exec <KAFKA> kafka-consumer-groups --bootstrap-server localhost:9092 \
  --describe --group traverse-cpa-cplm-results | head
docker exec <KAFKA> kafka-consumer-groups --bootstrap-server localhost:9092 \
  --describe --group ams-api-cplm-results-frames | head
```

A Flink job whose start time predates the deploy is running the **old jar** —
under ZooKeeper HA a cluster restart recovers the previous JobGraph and its jar,
so new code only takes effect after cancel + resubmit.

---

## Step 9 — Per-loop readiness (API's own opinion)

```bash
for L in FIC10409 FIC10509 FIC10501 FIC10502 LIC10501 \
         PIC00605 PIC80143 PIC80141 FIC80103 PIC80140; do
  echo "== $L"
  curl -s -H "Authorization: Bearer $TOKEN" \
    <GW>/api/v1/cpm/loops/$L/readiness \
    | jq -c '{ready, degraded, failed: [.checks[]|select(.ok==false)|.id]}'
done
```

---

## Step 10 — Need everything for one loop

SQL **§13** prints the full gate payload for a single loop: every family score,
disqualifier, observability flag and intermediate value. Edit the loop id at the
top of that section.

For a verdict sooner than the next 12 h window, recompute from history:

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  <GW>/api/v1/cpm/loops/FIC10409/recompute
```

---

## What "validated" means for this set

A loop passes this investigation when **all** of the following hold:

1. §12 returns no finding for it.
2. §2 shows a flowing feed with `avg_completeness ≥ 0.98`.
3. §3 shows G0 PASS, G1 PASS, G2r PASS — the three that can block before analysis.
4. §11 says `not blocked`.
5. §4 shows a single stable diagnosis across the window.
6. §8 shows `band_eu` consistent with the declared PV span, not the 0.5 fallback.

Anything else is a finding: record the loop, the section that surfaced it, and the
number behind it.
