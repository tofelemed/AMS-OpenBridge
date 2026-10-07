# Changes Tracker — pending production deployment

Running log of every change made since **2026-09-09**, kept so the prod release can be
reviewed as one set instead of reconstructed from git. Read top to bottom, then work the
[Deployment checklist](#deployment-checklist).

- **Branch:** `feat/ot-loop-ingestion`
- **Target:** Marun on-prem (air-gapped — images move by file, see the migration runbook)
- **Status legend:** ✅ done & verified · ⚠️ done, verification limited · ⬜ not started

---

## Summary — what a reviewer needs to know

Three problems are addressed here, all found while diagnosing *"G0 passes but the fleet
never produces a verdict"*:

1. **The MODE map was inverted**, so every controlling loop was excluded on G1 and only
   out-of-service loops were analysed. Root cause of the reported symptom. **Fixed by
   configuration, not code** — plus code so it can never fail silently again (CHG-003).
2. **The good-error band was a hardcoded 0.5 absolute EU**, making G3 unreachable for any
   loop not scaled 0–100. Now a fraction of the declared PV span (CHG-004).
3. Two ingestion changes committed earlier in the session (process-time `event_ts_ms`,
   quality = OT's verdict) are on the branch but **not yet in prod** (CHG-001, CHG-002).

Separately, a fourth defect found on **2026-09-10** while diagnosing the **/cpm/replay**
page: every raw-slice trend read returned 500, because the historian asked IoTDB for exactly
the one row count it refuses (CHG-009). Unrelated to the gate work and independently
deployable.

Fifth, also **2026-09-10**: **valve positioner feedback (VP)** is now carried end to end by
default, and the `param_roles` config trap that could black out every loop from one save is
closed (CHG-010). Ingestion-service only; the registry, Flink and the historian already
handled VP.

Sixth, **2026-09-10**: the Data Source wizard **deleted the whole `loop_ingest` block on every
save** (CHG-012) — the most probable reason production's `mode_value_map` was missing rather
than merely wrong. Frontend only, rides the CHG-006 rebuild.

Seventh, **2026-09-13**: the two CPM pages the plant reported as slow (**Overview**,
**Performance**) sorted the whole gate table on every fleet read — at plant size that is an
HTTP 500 at the 30 s timeout, not "slow". Fixed as **CHG-023**, shipped separately as
**release v2.4** (cplm-api, ams-frontend, historian-bff + three online indexes); the page sweep
also fixed `/calculations` (same failure), `/loops`, `gates/latest`, `/pipeline-metrics` and
the snapshot seed. See [Release v2.4](#release-v24--what-to-build-and-run). **CHG-024** then turned
the five remaining per-loop / per-item fan-outs into batch calls (readiness → resolver batch,
resolver → asset-model by-paths, bulk republish-evidence, Windows comparator, Governance roles);
it is **not in a release yet** — the four services to rebuild are listed in the entry.
**CHG-025** (also unreleased) fixes the Performance matrix search (the heatmap payload was cut
at 100 loops) and moves the Window inspector's detail sections onto a per-window sub-page.

**Service rebuilds required (v3):** `traverse-ingestion-service`, `cplm-api`, `historian-bff`, the
**frontend**, and the **Flink jar** (the three CPLM jobs must be *cancelled and resubmitted* — a restart deploys
nothing, see CHG-008). No database migration. One config edit per data source. The exact
service list and the scripts to run are in [Release v3](#release-v3--what-to-build-and-run).

### Verification status (2026-09-09)

The whole set was built and run on a full local stack — infra, gateway, auth, asset-model,
cplm-api, ingestion-service, frontend, Flink (10 jobs) — fed by the OT gateway simulator over
the mosquitto OT-broker stand-in.

| | Result |
|---|---|
| `test-ot-loop-ingestion-e2e.ps1` | **17 passed, 0 failed** (CHG-001/002/003 + CHG-007) |
| CHG-004 band discrimination | **proven** on the clean production jar — see the table in CHG-004 |
| CHG-006 registry round trip | **proven** against the live API — see CHG-006 |
| CHG-009 replay raw slice (2026-09-10) | **proven** on the live stack — full cursor walk returns IoTDB's own row count, see CHG-009 |
| CHG-010 VP end to end (2026-09-10) | `test-ot-loop-ingestion-e2e.ps1` **23 passed, 0 failed** on the rebuilt image (17 prior + 6 VP/overlay steps); ingestion unit tests **134/134** (was 115) |
| Frontend | built, deployed, and the served `LoopRegistry` chunk carries the new UI |
| Automated regression tests | ingestion-service only (134). The Flink suite still does not compile (Risks) |

---

Eighth, **2026-09-16**: **v2.5 Phase 1** (spec v6 Slice 1) — per-role provenance on the samples tuple,
protocol-specific quality, corrected G2/G4/G10/G11, fusion v2 with fault-scoped confirmation, episodes
that survive missing evidence, immutable run identity + evidence store + replay isolation, and the
Instrumental NE107 transmitter-health context end to end (CHG-026). Needs cpm-07 / cpm-07b / cpm-08,
five new Kafka topics, two new Flink jobs and the `quality_protocol` config on every loop data source.

Ninth, **2026-09-17**: **v2.5 Phases 2 and 3** — G12 is a real system-response analysis (event capture, bounded
estimation, holdout validation, model-domain frequency outputs), every gate emits its exact intermediates into a
checksum-verified evidence store with an immutable-selection workbench (17 views), G13 is an aligned peer analysis,
the registry stores the loop model separately from the tag prefix (CHG-027); and the gate configuration is governed
end to end - a 165-property catalogue as code with one hash, drafts → validate → shadow → hash-bound approval →
signed bundles that every property-reading Flink job ACKs before they take effect, one effective bundle per loop by
event time, rollback as a new deployment (CHG-028). Adds two Kafka topics, the Response job, `CPLM_GATE_CONFIG_KEY`
on the Flink containers and `traverse-auth-service` to the rebuild list (a revocation-epoch rounding found on the lab).
**Phase 4 started 2026-09-17 on the user's go**: every suite green on the clean tree, the five v2.5 images rebuilt
and running on the lab for the user's test tour ([WHATS-NEW-v2.5.md](WHATS-NEW-v2.5.md)); the reliability / load
probes, the bundle build and the tag follow that tour - see [Release v2.5](#release-v25--what-to-build-and-run).

## v3 DEPLOYED to Marun — 2026-09-10

Deployed from commit `78ef6ce`, release `release-out/v3-20260910` (968 MB). Order followed
[migration/V3-DEPLOY.md](migration/V3-DEPLOY.md).

| Step | Result |
|---|---|
| Transfer + `sha256sum -c` | 10/10 OK incl. every `ops/` path |
| MODE map (CHG-003, no deploy) | `PUT 200`; wire went from raw `1`/`2` to **AUT 62% / MAN 7% / IMAN 6% / UNKNOWN 25%** |
| 5 images loaded, all fingerprinted PROD | ingestion, cplm-api, historian-bff, ams-flink, frontend |
| Flink (CHG-004 engine half) | JAR replaced, both containers removed, **4 × RUNNING** with fresh start times 17:46 |
| `paramRoles` (CHG-010) | `"VP": "vp"` present |
| historian-bff (CHG-009) | `/raw/cursor` returns JSON, no 500 |
| cpm-01 | 14 registry + 56 tag-map rows |
| cpm-02 | **171 loops with all four bounds**, `still_undeclared = 0` |
| republish-evidence | **175/175 → 200**, zero 429s at `sleep 0.5`; the 14 new loops now carry 5 signal assets each |

**Found during the deployment, all confirmed live:**

- **The stored OP ranges were placeholders, not data.** All 157 "overwritten" rows held
  `{"opMin":0,"opMax":100}` written at onboarding, so the workbook replaced a default rather
  than a measurement. `LIC10601`'s impossible **OP 235.58 %** corroborates the workbook
  independently: it only makes sense on that loop's real 0–300 range.
- **`TIC10704` (3..5) and `TIC30304` (100..155) confirmed by the plant** and loaded with the rest.
- **25 % of tuples carry `mode: UNKNOWN`** — a loop that has *never received* a MODE message,
  not an unmapped value. MODE is published on change, so a subscriber that restarts cannot learn
  a mode until it next changes. **OT question: does the gateway set the MQTT retain flag on MODE?**
  Without it these loops stay excluded at G1 indefinitely. Re-measure once the stack has settled.
- **`FIC30203` stopped publishing 2026-09-05 18:29** (IoTDB's last row) while `FIC10405` is
  current — the IoTDB writer is healthy, that loop's data is absent upstream. OT question.
- **`SERVICE_LOG_LEVEL=Error` is only partly applied.** It rides the `kafka-env` anchor, and
  `historian-bff` (among others) does not merge that anchor — it still logs at Info. The 94e1f8f
  log-volume fix is therefore incomplete; not a v3 blocker, but the disk lesson is only half learnt.
- **V3-DEPLOY §F had a wrong URL**: `/api/hist/raw/cursor` binds `DateTimeOffset start/end`, so
  epoch-ms values 400 with an empty body. ISO-8601 required; `/raw` additionally needs `offset`.

---

## CHG-001 ✅ `event_ts_ms` carries OT process time

**Commit:** `9612db4` · **Service:** ingestion-service

`LoopJoiner` stamped tuples with the grid boundary from the *ingestion server's* wall clock.
It now uses the newest OT source timestamp among the tuple's members, and adds
`ingest_ts_ms` so lag and gateway clock drift stay measurable.

- A tick where no member advanced is **skipped, not re-stamped** — a repeated `event_ts_ms`
  would overwrite the previous row in IoTDB, which keys by device+timestamp.
- New metric `ingestion_loop_ticks_skipped_total`.

**Behaviour change downstream (no code):** Flink event time and IoTDB row timestamps become
process time. After an outage longer than the 2-minute watermark, backlog is dropped as late
— replay it through the IoTDB + recompute door, never the live topic.

**Verified:** 115/115 unit tests; live stream showed 0/40 messages on a grid boundary
(was 40/40), median source→ingest lag ~500 ms.

---

## CHG-002 ✅ Quality is OT's verdict only

**Commit:** `b0a4d98` · **Service:** ingestion-service

Tuple quality = worst-of the OT quality tags on pv/sp/op. The `stale_after_seconds` ageing
rule is removed entirely (config key, validation and joiner logic), because a setpoint
untouched for an hour is *unchanged*, not untrustworthy — and only the source may call a
value bad.

A stored `stale_after_seconds` in any existing config is now ignored — no migration needed.
Silence is still not mistaken for good data: a gateway that stops publishing advances no
timestamp, so the loop emits nothing (CHG-001's skip rule) rather than republishing
forward-filled values as GOOD.

**Verified:** 115/115 unit tests; live stream all `GOOD` with 4-day-old setpoints, which the
old 30 s rule would have marked `BAD`.

---

## CHG-003 ✅ MODE map: correct values, and never fail silently again

**Service:** ingestion-service · **Files:** `Pipeline/ModeVocabulary.cs` (new),
`Pipeline/OtLoopSubscriber.cs`, `Pipeline/OtIngestionHostService.cs`,
`Pipeline/IngestionMetrics.cs`

**The production problem.** `mode_value_map` was configured `{"4":"AUT","3":"CAS","2":"MAN"}`
— a guess, marked *"pending OT confirmation"*. The SME-confirmed CENTUM enum is
**1=AUT, 2=MAN, 3=CAS, 4=MAN IMAN**. So `1` (the only controlling mode, 12 of 21 loops in the
snapshot) was unmapped, passed through raw as `"1"`, failed the engine's auto vocabulary and
was counted **not-auto** → **G1 excluded every real loop**, while `4` — idle, SP = OP = 0 —
was labelled AUT and analysed. G0 stayed green throughout, which is why nothing looked wrong.

**Config change (do this first — no redeploy needed):**

```json
"mode_value_map": { "1": "AUT", "2": "MAN", "3": "CAS", "4": "IMAN" }
```

Use those exact tokens: the engine tests set membership (manual first, then auto) before its
substring fallback, and `AUT`/`MAN`/`CAS`/`IMAN` are all exact members. `3=CAS` **must** be
mapped — a cascade slave counts as auto, and leaving it out repeats the same silent exclusion
on a different subset. Saving changes the config fingerprint; the subscriber restarts itself
within 30 s.

**Code so this cannot recur silently:**

- `ModeVocabulary` mirrors the engine's auto/manual token sets.
- Per-value warning + `ingestion_mode_unrecognised_total` when a MODE the engine cannot
  classify is about to be published, naming the loop and the offending value.
- Startup warning when a `MQTT_LOOP_SAMPLES` source has an **empty** `mode_value_map`.

**Verified:** builds clean; 115/115 unit tests. Confirmed live: with the corrected map every
loop on `traverse.cpa.loop.samples.v1` carries `mode=AUT` and the CPLM jobs produce verdicts
for them; E2E 17/17. The unrecognised-value warning path is still not exercised (it needs a
deliberately bad map).

---

## CHG-004 ✅ Good-error band scales with the PV span

**Services:** Flink jar (all four CPLM jobs) + cplm-api
**Files:** `CplmLoopDynamicsProfile.java`, `CplmDynamicsParameterSetSupport.java`,
`CplmGateEngine.java`, `cplm-api/Services/CpmLoopRegistryService.cs`

`goodErrorPct` counted `|SP−PV| ≤ 0.5` in **absolute EU, hardcoded** — 0.5 % of span on a
0–100 loop, 0.05 % on a 0–1000 t/h flow, 50 % on a 0–1 fraction. Measured on HDPE: **0 of 6
temperature loops** inside the band (profile requires 50 % of samples), 3 of 6 level loops.
G3 was therefore unreachable for whole equipment classes, and OCE ≡ 0 with it.

The band is now `goodErrorBandPctOfSpan × (pvEngMax − pvEngMin)`, defaulting to
`0.005 × (100 − 0) = 0.5` — **byte-for-byte the old behaviour for any loop that declares no
PV range.** A declared range makes it proportional; an unusable range falls back to 0.5
rather than to zero (a zero band would silently WARN every loop).

- `CpmEngineeringRange` gains `PvMin`/`PvMax`, stored in `cpm.loop_registry.engineering`
  alongside `opMin`/`opMax` and broadcast on `cplm.loop.engineering` as `pvEngMin`/`pvEngMax`.
- The two evidence-publish sites (single + batch) were duplicate literals and are now one
  `EngineeringParameter()` helper — that duplication is exactly how one of them would have
  missed the new field.
- `goodErrorBandPctOfSpan` is overridable per loop/class through the existing parameter-set
  spine, so tuning it needs no code change.

**No loop declares a PV range yet, so this is inert until ranges are populated.** Entry is now
possible from the wizard, the CSV import or the API — see CHG-006. Rolling it out is a data
task, not a deploy task.

**Verified live (2026-09-09, full lab stack).** Three loops fed byte-identical PV/SP/OP/MODE
with |SP−PV| pinned at 2.0 EU, differing only in what they declare:

| loop | declares | band | `good_error_pct` | G3 |
|---|---|---|---|---|
| `ZZBAND_WIDE` | PV 0–100000 | 500.0 | **1.00** | **PASS** |
| `ZZBAND_NONE` | nothing | 0.5 | 0.00 | WARN |
| `ZZBAND_OPRNG` | OP 0–1 only | 0.5 | 0.00 | WARN |

`mae` was 2.00 on all three, so the only variable is the declared span. `ZZBAND_NONE` confirms
the undeclared case is unchanged, and `ZZBAND_OPRNG` confirms the merge is per-key: declaring
an OP range leaves the PV band alone. That loop also re-proved the OP half — OP fed at 0.5 on a
declared 0–1 range gave `saturation_pct 0.00`, i.e. it normalised to 50 % instead of reading as
pinned at the low limit.

**⚠️ Still not covered by an automated test** — see [Risks](#risks--pre-existing-issues). The
proof above is a manual lab run, not a regression test.

---

## CHG-006 ✅ Engineering ranges are enterable (closes the CHG-004 UI gap)

**Services:** cplm-api (read path) + frontend
**Files:** `cplm-api/Services/CpmLoopRegistryService.cs`, `frontend-ob/src/api/cpmApi.ts`,
`components/Cpm/AddLoopWizard.tsx`, `components/Cpm/csvImport.ts`,
`components/Cpm/BulkImportDialog.tsx`

CHG-004 shipped the mechanism but nothing could fill it: `CpmActivateRequest` had no
`engineering` field, so neither the wizard nor the CSV import could carry a range, and
`CpmLoopDto` did not return one — the wizard could not show or change a range it had never
been told about. Both holes are closed.

*Correction to an earlier draft of this entry:* an edit round-trip did **not** silently drop a
stored range. CHG-004's upsert is `COALESCE(@engineering::jsonb, …existing)`, and a live
round-trip confirms an omitted range is preserved. The real consequence of that same COALESCE
is the opposite one, and it is a genuine limitation: **a declared range cannot be cleared**
through the wizard or the API. Blanking the fields omits them, and omission means "keep".
Clearing one today needs a direct SQL update. Worth an explicit "clear ranges" affordance if
anyone asks for it; not a blocker, since a wrong range is corrected by overwriting it.

- **Read path:** `CpmLoopDto` gains `Engineering`, hydrated from `cpm.loop_registry.engineering`
  in both DTO SELECTs. Null when nothing is declared, so "absent" survives the round trip as
  absent rather than becoming a zero the engine would read as a real bound.
- **Wizard** (Classification step): PV min/max and OP min/max, prefilled in edit mode, with
  copy explaining that PV range scales the G3/OCE band and OP range feeds G10/G2r. Non-numeric
  input blocks Next; a **half-declared range is flagged** because the API defaults the missing
  bound (0 / 100) and would invent a span nobody wrote down. The Review step shows the ranges,
  or "not declared (PV band stays ±0.5 EU)".
- **CSV import:** four optional columns `pv_min, pv_max, op_min, op_max`, parsed to declared
  bounds only, with the same non-numeric error and half-declared warning per row. The
  downloadable template demonstrates both (row 1 PV-only, row 2 both).

**Verified live (2026-09-09):** against the running stack — `POST /loops/activate` with an
`engineering` block persists only the declared bounds to `cpm.loop_registry.engineering`;
`GET /loops` and `GET /loops/{id}` both return them; a wizard-shaped edit round-trip preserves
them; a loop declaring nothing stores `{}`, returns `null`, and emits **no**
`cplm.loop.engineering` parameter at all, so the engine keeps its 0.5 EU default. A
half-declared range (`pvMax` only) broadcasts `{"pvEngMin":0,"pvEngMax":500}` — the API really
does invent the missing bound, which is exactly what the wizard's half-declared warning and the
CSV row warning exist to prevent.

**Not verified:** the browser UI itself was not click-tested (no headless browser in this repo);
the wizard and CSV paths are covered only by typecheck, lint and build.

---

## CHG-007 ✅ Test fixtures that were green on the broken config

**Files:** `scripts/test-ot-loop-ingestion-e2e.ps1`, `ams-sims/sim_ot_gateway_mqtt.py`
**Ships no runtime code** — test fixtures only, but they are why the MODE bug survived.

Found while proving CHG-003 on the lab. The E2E created its data source with
`mode_value_map = @{ '4' = 'AUT' }` — the same wrong map production was running — and then
asserted `mode -eq 'AUT'`. **So the test passed green for exactly the reason the plant was
broken.** It now creates the SME-confirmed map and says why in a comment.

The simulator published `MODE = 4.0` unconditionally. Under the corrected map that is `IMAN`,
i.e. manual, so every simulated loop is excluded at G1 and the CPLM chain downstream of
ingestion proves nothing. `--mode` now selects the value, defaulting to `1` (AUT) so the feed
lands in the analysed path; pass `--mode 4` to exercise the exclusion path deliberately.

Two more fixture defects surfaced in the same run and are fixed here:

- **The first gateway call of every run failed.** `$GatewayBase` defaulted to `localhost`,
  which resolves to `::1` first; PS 5.1's `Invoke-RestMethod` blocks on the IPv6 attempt for
  the full `-TimeoutSec` before falling back, so check 1 timed out while `curl` answered the
  same URL in 0.75 s. Later calls reuse the fallen-back stack, which is why exactly one check
  failed. Defaults are now `127.0.0.1`.
- **The `FIC99999` parking probe was a race.** The sim published the unregistered sentinel at
  `t=0` and then not again for 300 s, but the subscriber needs up to 30 s to connect — so the
  only probe was lost and the check failed on timing, not behaviour. The sim now sends one
  extra probe at `t=45 s`, leaving the 300 s steady rate (and the DLQ-flood protection it
  exists for) untouched.

**Verified:** after the fix every loop on `traverse.cpa.loop.samples.v1` carries `mode=AUT`,
`quality=GOOD`, and the CPLM jobs produce gate verdicts for them.

---

## CHG-008 ⚠️ Deployment traps found while deploying this change set

Not code — two ways this release can appear to deploy and not deploy. Both bit during the
lab run, and the first would have shipped **nothing** to prod while looking successful.

**1. A Flink jar rebuild does not reach a running HA cluster.** The cluster runs
`high-availability.type: zookeeper`. On restart the JobManager logs
`Recovered JobGraph(jobId: …)` and resumes the *previously submitted* JobGraph **and its jar
blob** — the new jar sitting in `/opt/flink/usrlib` is never read. Rebuilding the image and
running `compose up -d` therefore changes nothing, silently. Proof: with the new jar deployed
and byte-verified in `usrlib`, a diagnostic print added to the engine never appeared, and the
band stayed at the old value; after `PATCH /jobs/<id>?mode=cancel` on the CPLM jobs followed by
`compose up flink-job-submit-cplm`, the same build printed immediately and the band changed.

> **Deploying the Flink half means: cancel the CPLM jobs, then resubmit.** Restarting the
> cluster is not a deployment step. Verify by checking each job's start time moved.

**2. `-DskipTests` cannot build this repo's Flink jar.** It skips test *execution*, not test
*compilation*, and the pre-existing `CplmLoopDynamicsAwareTest` compile failure still fails the
build — after `clean` has already deleted the previous jar. Use **`-Dmaven.test.skip=true`**.
`scripts/build-flink-jar.ps1` and the migration runbook should be checked against this before
the release, or the first person to run the documented command is left with no jar at all.

**Also seen (lab only, but nothing prevents it in prod):** two `MQTT_LOOP_SAMPLES` data sources
were active on overlapping topic filters. Both subscribers emitted a tuple per loop per tick
with the **same** `event_ts_ms` and *different* `mode` (one config carried the old map). IoTDB
keys on device+timestamp, so it keeps one of the two arbitrarily. Nothing warns about the
overlap. Deactivating the stale config resolved it; worth a duplicate-subscription guard.

---

## CHG-009 ✅ Replay raw-slice reads asked IoTDB for the one row count it refuses

**Service:** historian-bff (+ one frontend comment) · **Found:** 2026-09-10

`GET /api/hist/raw/cursor` returned **500 on every Evidence Replay raw-slice read**. Not an
outage — "the service is currently unavailable" is only how the frontend renders a 500.
IoTDB was refusing the query itself:

```
IoTDB query failed (code 708): Dataset row size exceeded the given max row size (10000)
SQL: SELECT pv,sp,op FROM root.site1.cpm.FIC10301 ... ORDER BY time ASC LIMIT 10000
```

IoTDB REST v2 rejects a result set that **reaches** `rest_query_default_row_size_limit`
(default 10 000), not one that exceeds it. Confirmed against the live engine: `LIMIT 9999`
returns data; `LIMIT 10000` **and** `LIMIT 10001` both return code 708.

historian-bff clamped `maxCount` to exactly `10_000`, and `CpmReplay.tsx` asked for exactly
that figure — its comment asserted *"10 000 is the server's cap"*. So every replay read
landed on the single forbidden value. `880b271` raised it 5 000 → 10 000 and walked it onto
the boundary; P2-22's fail-loud check then surfaced it honestly as a 500 instead of a silently
empty chart.

**Fix** — one named ceiling, `IoTDbClient.MaxRowsPerQuery` = `IoTDB:RestRowSizeLimit - 1`
(configurable, default 9 999). Both raw SQL builders and the `/raw/cursor` endpoint derive
from it, so the cap the API advertises is always one IoTDB will actually serve.

- The **endpoint** clamp had to move together with the builder clamp, not just the builder:
  `nextCursor` is derived from `points.Count == maxCount`. A builder capped at 9 999 under an
  endpoint still advertising 10 000 makes that equality unreachable — `nextCursor` comes back
  `null` and the cursor walk silently declares itself complete partway through the window.
  That is quiet data loss on an evidence screen, worse than the 500 it replaces.
- `/raw` (clamped to 500) and `/trend` (GROUP BY, ≤ `width` rows) could never reach the
  boundary; their builders were corrected anyway so no future caller can.

**Verified** on the live stack against a rebuilt image:

| | Result |
|---|---|
| The original failing URL | **HTTP 200** — 9 999 points, `hasMore=true`, non-null `nextCursor` |
| Full cursor walk | 9 999 + 7 223 = **17 222 rows = IoTDB's own `count(pv)`** — contiguous, no gap, no overlap |
| `/raw`, `/trend`, `/health` | 200 · zero `code 708` since restart |
| Build · `tsc --noEmit` · eslint | clean |

**Server-side fix — no frontend rebuild required** for it to take effect. The `.tsx` edit is a
comment only (it removed the stale "10 000 is the server's cap" claim that invited the bug)
and rides along with CHG-006's frontend rebuild.

**Known limitation, deliberately not changed:** replay still renders only the first page —
**9 999 of 17 222 samples, 58 % of a 24 h window** — behind an honest truncation note. The
backend's cursor paging was built for exactly this (Phase 6.5), but its only consumer never
uses it: `useRawWindow` passes `cursor: undefined` and never follows `nextCursor`. Two pages
would cover the window. Fixing the 500 is the bug; wiring the pager is a feature, so it is
left as a separate decision.

---

## CHG-010 ✅ Valve positioner (VP) end to end, and the `param_roles` trap closed

**Service:** ingestion-service · **Found:** 2026-09-10 · **Files:** `Models/LoopIngestConfig.cs`,
`Services/DataSourceValidation.cs`, `Pipeline/SubscriberStatusRegistry.cs`,
`Pipeline/OtIngestionHostService.cs`; fixtures `ams-sims/sim_ot_gateway_mqtt.py`,
`scripts/fixtures/hdpe-pilot-loops.csv`, `scripts/test-ot-loop-ingestion-e2e.ps1`;
tests `tests/ingestion-service.Tests/*`.

**What was already there.** `vp` is a first-class optional tuple member: the joiner carries it
without gating emission (`LoopJoiner.cs`), the registry accepts the `VP` signal role, mirrors it
into `tags.vp`, clears `NO_VP` and reports readiness `tag_vp` (`CpmLoopRegistryService.cs`,
`CpmReadinessController.cs`), `RawLoopIotDbConsumer` persists it as the `vp` measurement, and
Flink parses it (`CplmNormalizedSample.java:73`) so G14 becomes `CONFIRMED_CAPABLE` and the
0.89 confidence cap lifts (`CplmGateFusionEngine.java:231-237`). **None of those changed.**

**The gap.** The built-in `param_roles` map had no `VP` entry, so an OT `VP` leaf parked as
`UNKNOWN_PARAMETER` — safe and visible, but valve diagnostics never arrived.

**The trap.** `param_roles` *replaced* the built-in map. The natural edit, `{"VP":"vp"}`,
un-mapped `PV/SP/OP/MODE`; every loop on the source produced **0 tuples** with four parked
leaves (verified live before this change). On the plant that is the whole fleet going dark
from one config save, with G0 green.

**Changes (all ingestion-service):**

- Built-in map gains `VP → vp`. An OT `VP` leaf flows with **no config edit**.
- `param_roles` now **overlays** the built-ins (`LoopIngestConfig.EffectiveParamRoles`): an
  entry adds or re-points one leaf, a `null`/blank value removes a built-in entry (the only
  way to drop an alias, e.g. `{"MV": null}`), and everything unnamed stays.
- Validation refuses (`400`, field `loop_ingest.param_roles`) any **effective** map with no
  source parameter for `pv`, `sp`, `op` or `mode`, naming the role. Aliases count — un-mapping
  `SP` alone still leaves `SV → sp`. `ingest_ts_ms` (CHG-001) joins the reserved tuple fields.
- The effective map is **observable**: `GET /api/ingestion/stats` returns it as `paramRoles`
  and the subscriber logs it at start. Live, from this run:
  `effective param_roles D→d, GW→gw, I→i, MODE→mode, MV→op, OP→op, P→p, PV→pv, SP→sp, SV→sp, VP→vp`
  and after the overlay PUT: the same list plus `POS→vp`.

**Deliberately unchanged:** VP quality stays outside the tuple's GOOD/BAD verdict (worst-of
pv/sp/op), so a flaky positioner costs the loop its valve diagnostics, not its analysis; a loop
publishing no VP carries **no `vp` key** (never `0`), so `NO_VP` stays honest.

**No database migration.** `cpm.loop_tag_map.signal_role` already admits `VP` (script 32), and
because stored maps are now overlaid, every prod `param_roles` — full, partial or absent — is
forward-compatible as it sits. **No change** to cplm-api, Flink, historian or frontend.

**Verified (2026-09-10, full lab stack, rebuilt `traverse-ingestion-service`):**

| | Result |
|---|---|
| Unit tests (`tests/ingestion-service.Tests`) | **134/134** — 19 new: VP default, overlay/un-map/round-trip, guard per role, joiner VP ts + bad-VP-quality |
| `test-ot-loop-ingestion-e2e.ps1` | **23 passed, 0 failed** (~15 min; the 17 prior steps unchanged) |
| VP on the tuple, no `param_roles` configured | FIC10302 tuple carries numeric `vp` tracking `op`; `quality GOOD` |
| Loop without a positioner | FIC10405 tuple has **no `vp` key** |
| Parking | no `UNKNOWN_PARAMETER` row for `…\|VP` |
| IoTDB | `count(vp)` on `root.site1.cpm.FIC10302` > 0 |
| Registry | FIC10302 (fixture `vp_ot_tag`) → `tag_vp` ok, no `NO_VP`; FIC10405 still `NO_VP` |
| Overlay | PUT `param_roles {POS:vp}` → subscriber restarted (`startedAt` moved), `/stats.paramRoles` = built-ins + `POS`, FIC10302 tuples still `mode AUT`, `quality GOOD`, `vp` present |
| Guard | PUT `param_roles {PV:null}` → **400** naming `loop_ingest.param_roles` and `'pv'`; running map untouched |

**Not verified here:** the Flink G14 flip. `hasVp` is computed only in
`computeLongDiagnostics` and G14 is stamped by the fusion engine from the long window, so it is
not observable inside a 16-minute lab run; it was seen live on the probe loop before this
change and the Flink code path is untouched. The Flink suite still does not compile (Risks).

**Fixtures:** the sim publishes positioner feedback for `--vp-loops` (default `FIC10302`) under
`--vp-item` (default `VP`; use `POS` to rehearse an overlay); the pilot fixture maps
`FIC10302.VP`. Test-only: `Read-TupleFor` helper, steps 5b (VP present / absent / not parked)
and 11 (overlay / 400). Docs: runbook 10 §2b rewritten, mapping 09 §2 gains the `VP` row,
calculation reference §0 names the overlay rule.

**Two things still to confirm with OT** (config, not code): the exact leaf name (`VP` needs
nothing; anything else is one overlay entry), and that it is positioner **feedback**, not a
second copy of the output demand — G14 compares the two.

---

## CHG-011 ✅ Plant engineering ranges loaded (171 loops from the CPA workbook)

**Services:** none rebuilt — data + tooling only
**Files:** `scripts/cpm-01-onboard-missing-loops.sql` (new),
`scripts/cpm-02-load-engineering-ranges.sql` (new),
`scripts/fixtures/cpa-missing-loops.csv` (new), `scripts/import-cpm-loops.ps1`

CHG-004/006 built the mechanism; this is the data that makes it do anything.
`Loops Data for CPA.xlsx` supplies `pvMin/pvMax` (sheet *SH&SL Final*, long format) and
`opMin/opMax` (sheet *Loop Parameters*, wide format) for **171 loops** — both sheets cover the
identical set, all four bounds on every row, no duplicates, every span positive.

**Onboarding gap closed first.** 15 workbook rows had no registered loop; none of them were in
`hdpe-all-loops.csv` and none exist in the asset model, so they were never part of the plant
onboarding set. 14 are now registered from `cpa-missing-loops.csv`. `loop_type` mirrors the
engine's own `inferFromTag` so the registry row and the dynamics profile agree — FQIC/FC→`FIC`,
PDIC→`PIC`, and AIC/IIC/NIC→`UNKNOWN` (that pack has `priorGeometry 0.0`, so geometry-based
diagnosis stays off for those four until a class is assigned).

They sit at **`hdpe/unassigned/unassigned`** — a real node in the plant tree, not a guess. The
tag number does not predict the unit (27 of 33 digit prefixes map to more than one), so a
derived placement would have been an invention. Move them with the registry wizard once the
plant confirms each one. OT tag columns are blank on purpose: they only record `sourceTag`
metadata, and ingestion resolves by `loop_id` = the OT topic's loop level, so data flows
without them.

**`import-cpm-loops.ps1` now carries `pv_min`/`pv_max`.** It predated CHG-004 and could only
write the OP half, so a sheet with PV ranges would have silently dropped them. Half-declared
ranges warn, non-numeric values are a row error.

**Two pgAdmin-ready scripts, run in order** (no psql meta-commands — reports go to the
Messages tab via `RAISE NOTICE`, the final grid is the verification):

1. `cpm-01-onboard-missing-loops.sql` — writes `cpm.loop_registry` (14) and `cpm.loop_tag_map`
   (56 = 14 × 4 roles). **Verified byte-identical to what `POST /loops/activate` writes**: the
   API-produced rows were captured, deleted, recreated by the script, and diffed — no
   difference in either table.
2. `cpm-02-load-engineering-ranges.sql` — merges all 171 ranges with `||`, so other keys
   survive.

Both touch only loops that exist, never create one outside their own set, are idempotent, and
are transactional — swap the final `COMMIT` for `ROLLBACK` and every report still prints. The
CSV + `import-cpm-loops.ps1` path remains as the API-based alternative where prod access allows
it.

**What SQL alone cannot do, and the one call that fixes it.** An activate also writes
`cpm.loop_signal_asset` *and* the matching assets in the **traverse_assets** database — a
cross-database projection — then broadcasts to Kafka. A script against `traverse_cplm` reaches
neither, so the loops would exist with no UNS signals and Flink would never hear of them.
`POST /api/v1/cpm/loops/{loopId}/republish-evidence` does both (the endpoint is explicitly the
backfill path for loops onboarded without projection). **Verified on a fully cleared loop: 5
signal-asset rows — PV, SP, OP, MODE and DEVICE.**

**Verified on a live database, run in sequence from a cleared state:** script 1 inserts 14 + 56;
script 2 staged 171, skipped 1 (`TIC30206OLD`), and left **170 loops carrying all four bounds**.
Re-running both changes nothing (`INSERT 0 0`, `UPDATE 0`).

**✅ The `TIC30206OLD` decision is settled (plant, 2026-09-10): only `TIC30206` is in service**,
so the workbook row is now loaded onto it (`cpm-02` line 193, staged as `TIC30206`). Expect
report 1 to read *SKIPPED — none* and the final count to be **171**, one more than the run above.
That retarget is a one-line change to the staged loop id and has **not** been re-run against a
database — the merge path is unchanged and `TIC30206` is registered and modelled at
`hdpe/section_100/u1001_polymerization_reactor_1`, so it will match, but read report 1 on the
`ROLLBACK` dry run to confirm before committing.

**✅ The two OP ranges are confirmed (plant, 2026-09-10) and loaded.** Kept here because the
reasoning still applies to any future range load: `normalizeOp` is applied
unconditionally, so a wrong range is worse than none: `TIC10704` declares OP **3..5** and
`TIC30304` declares **100..155**. If either signal actually arrives as 0-100 %, an OP of 50
normalises to 2350 % / −91 %, G10 reads permanently saturated and G2r invalidates the window —
which **blocks the diagnosis**. Report 4 flags both. The wide ranges (0..300, 0..140) are the
benign direction this feature exists for.

**Not a uniform loosening.** Once the 14 are registered the split is **57 tighter / 59 looser /
54 unchanged** against today's flat 0.5 EU band — the tightest being 0.005 EU on `PIC80150`
(PV 0–1). Expect some G3 PASS → WARN; that is the fix working, not a regression.

**Resolves a standing risk:** `LIC10601` declares OP 0–300, so the "OP = 235.58 %, an OT-side
data question" in [Risks](#risks--pre-existing-issues) was never a data error — that loop's
output range genuinely is 0–300, and loading it fixes its saturation and G2r readings.

**Deployment note:** the SQL does not reach the engine. Flink reads these from the
`cplm.loop.engineering` broadcast that cplm-api emits on activate/republish, and nothing
re-reads the table — so `POST /api/v1/cpm/loops/{loopId}/republish-evidence` per updated loop
is required, or the load looks like a no-op. Cancelling the Flink jobs is **not** needed; this
is data, not code.

---

## CHG-012 ✅ The wizard no longer deletes `loop_ingest` on save

**Service:** frontend (rides the CHG-006 rebuild — no extra image) · **Found:** 2026-09-10
**Files:** `components/Administration/DataSourceWizard.tsx`, `components/Administration/dataSourcesApi.ts`

Found while answering "where in the UI do I set `mode_value_map`?". The answer is nowhere —
and the reason matters more than the answer.

**The defect.** The wizard rebuilt `profileConfig` from scratch on every save, writing
`{ mqtt: {…} }` and nothing else, while `DataSourceRepository` replaces the column wholesale
(`profile_config = @profileConfigJson::jsonb`, no merge). So **opening an `MQTT_LOOP_SAMPLES`
source in Edit, changing nothing, and clicking Save deleted the entire `loop_ingest` block** —
`mode_value_map`, `param_roles`, `grid_seconds`, `topic_template`. Every one of those has a
working default, so data keeps flowing and nothing logs an error; the only visible consequence
is that MODE stops being translated.

**It was NOT what happened to this plant — corrected 2026-09-10 during the v3 deployment.**
An earlier draft of this entry called wizard deletion the likely origin of the CHG-003 symptom.
Reading the live config disproved it: `profile_config` held **`loop_ingest` as an empty object**,
and a wizard save removes the key entirely rather than emptying it. So the MODE map was almost
certainly **never configured**, not configured-then-wiped. What the plant did confirm is the
*consequence*: live tuples carried `"mode":"1"`/`"2"` raw, so there was no map at all — which is
exactly why CHG-003's empty-map startup warning earns its place. The wizard defect is real and
worth having fixed; it just isn't this outage's cause. Everything else in `loop_ingest` was also
empty, so nothing was lost — the defaults matched the gateway's real topic shape.

**The fix** — the wizard now spreads the stored config and overrides only its own block:
`profileConfig: { ...(existing?.profileConfig ?? {}), mqtt: {…} }`. `ProfileConfig` gains an
index signature documenting that unrendered blocks exist and that **any** writer must carry
them through. The `mqtt` block itself was never at risk: every one of its keys, including
`tls.ca_cert_pem`, already round-trips through the form.

**Still no UI to *set* `loop_ingest`.** This stops the destruction; it does not add an editor.
Setting the MODE map remains an API operation (checklist step 1), and it must be a
read-modify-write — a hand-written `profileConfig` would drop the TLS `ca_cert_pem`, which is
the whole certificate.

**Verified:** `tsc --noEmit` clean, `eslint --max-warnings 0` clean. **No automated test** —
`src/frontend-ob` has no test runner configured (no `test` script, no vitest/jest), so the wizard
is covered only by typecheck, lint and build, exactly as CHG-006 notes.

**⚠️ Operational, until the new frontend is deployed:** do **not** edit an `MQTT_LOOP_SAMPLES`
data source in the wizard. Any save on the running build re-deletes `loop_ingest`, including a
map you have just restored. After the CHG-006/012 frontend ships, editing is safe again.

**Note:** `DataSourceWizard.tsx` is 605 lines, over the repo's 400–500 guideline (599 before this
change). Splitting it mid-release adds risk for no functional gain — worth doing, separately.

---

## CHG-013 ✅ `loop_ingest` is visible and the MODE map is editable

**Services:** frontend (rides the CHG-006/012 rebuild) · **Found:** 2026-09-10
**Files:** `components/Administration/LoopIngestPanel.tsx` (new), `adminUi.tsx` (new),
`DataSourcesConfig.tsx`, `dataSourcesApi.ts`

CHG-012 stopped the wizard deleting `loop_ingest`. It did not make it visible, and
invisibility is the deeper defect: a fleet-critical setting could vanish and stay vanished
because **the product never showed it**. Nobody could have noticed by looking.

Loop-samples data-source cards now carry a **Loop ingest** panel showing the effective
`mode_value_map`, grid, registry refresh, topic template and `param_roles` overlay — and,
when the map is missing or maps nothing to AUTO, a banner naming the exact consequence
("every sample counts as not-auto and Gate 1 excludes this source's whole fleet — with
Gate 0 still green"). That is the state the plant sat in undiagnosed.

The MODE map is **editable** (Admin only, `ingestion.manage`): value→token rows, a Yokogawa
CENTUM preset, and per-row classification — `counts as AUTO` / `counts as MANUAL` /
`NOT RECOGNISED`. `classifyMode()` mirrors ingestion-service `ModeVocabulary.cs`, which
mirrors Flink `CplmNormalizedSample`; manual wins before auto, exactly as the engine does,
so `4→IMAN` correctly shows as manual and `3→CAS` as auto. Saving is a read-modify-write of
the whole `profile_config` (CHG-012's rule), so the mqtt block and its TLS certificate are
carried across untouched.

**Deliberately not editable here:** `param_roles` (overlay semantics + a server-side guard —
it belongs in the API, and `scripts/set-mode-map.py` remains the bulk path), `grid_seconds`
and `topic_template`. They are shown, not typed into.

`Pill`/`Fact` moved to a shared `adminUi.tsx` — the panel needs them and importing from the
page that renders it would be a circular import. `DataSourcesConfig.tsx` shrank 257→233 lines.

**Verified:** `tsc --noEmit` clean · `eslint --max-warnings 0` clean · `npm run build` clean.
**Not click-tested** — `src/frontend-ob` still has no test runner, so no automated coverage
exists for this or any other wizard path (same limitation as CHG-006/012).

---

## CHG-014 ✅ Release tooling matches this plant

**Files:** `migration/deploy/build-release.py`

`build-release.py` generated `VM-STEPS.md` from **lab** assumptions. Three defects, all of
which would have been read as instructions on the plant:

1. **The Flink section was backwards for Marun.** It warned that "a RESTART DEPLOYS NOTHING
   because the HA JobManager resumes the previous JobGraph and its jar blob" and told the
   operator to `compose up flink-job-submit-cplm`. Marun has **no ZooKeeper HA** — the overlay
   replaces `FLINK_PROPERTIES` with RocksDB + MinIO checkpoints only — and
   `flink-job-submit-cplm` is profiled `lab-alarm`, absent from the `cpa` profile, so that
   command does nothing at all. The trap that *does* apply here is the mirror image:
   `04b-submit-flink-jobs.sh` uses `submit_if_missing`, so with the old JobManager still up it
   prints `[OK]` for all four jobs while they keep executing the **old jar**. Rewritten: remove
   both containers, `deploy.sh --prod` (04b resubmits all **four**, not three), verify start
   times moved — plus the cost note that no HA and no `-s savepoint` means fresh window state,
   so 12h/24h verdicts need up to a day.
2. **`sha256sum -c` was run from the wrong directory.** Step 1 was
   `cd /opt/AMS-open` … `sha256sum -c /tmp/v3/SHA256SUMS.txt`; sha256sum resolves each path
   against the **CWD**, not the sums file, so every entry failed `open or read`. **Reproduced
   deliberately** on a real release directory. Step 1 now runs from inside the release dir.
3. **The release shipped no SQL.** Images and the JAR travelled; `cpm-01`, `cpm-02`,
   `diagnose-gate-failures.sql` and `set-mode-map.py` did not — so a correctly deployed v3
   could not run checklist steps 1, 2, 9 or 10, on a host that can fetch nothing. New
   `OPS_FILES` copies them to `ops/`, checksummed with the rest; a missing one now fails the
   build rather than the deployment.

4. **A cp1252 stdout killed the v3 build after the work succeeded.** Found by running it:
   Windows hands a *piped* child process a cp1252 stdout, and `build-prod-images.py` logs
   `ok <svc> → <image>`. Printing that arrow raised `UnicodeEncodeError` and aborted the
   release **with the image already built**. `build-release.py` guarded its own streams for
   exactly this; the subprocess it spawns got its own. Now one `harden_stdio()` in
   `prodimages.py`, called by all three entry points (`build-prod-images`, `build-release`,
   `save-offline-bundle` — the last two had 4 and 6 unguarded non-ASCII strings of their own).
   Verified both ways: the same print crashes without it and degrades to `?` with it.
   Second-order trap worth knowing: the build was launched through `| tee`, so the pipeline
   reported **exit 0** while the build had failed. Run releases unpiped.

VM-STEPS also gained **step 0** (the MODE-map restore, which needs no deploy and is the step
that unblocks the fleet), a `df -h /` headroom check before loading, the paced republish
budget (120 mutations/min), and the CHG-012 warning not to edit these sources in the wizard.
The ingestion post-check now reads `/api/ingestion/stats` instead of the startup log, which is
silent at the plant's `SERVICE_LOG_LEVEL=Error`.

**Verified:** `--dry-run` renders the full v3 plan and the rewritten Flink section; a **real**
single-service build (`--only historian-bff --skip-build --skip-jar`) produced the directory,
and `sha256sum -c SHA256SUMS.txt` from inside it returned **OK on all five files** including
every `ops/` path — with the wrong-CWD run failing, as the fix predicts.

---

## CHG-015 ✅ Loop ingestion audit — "why is this loop dark?" in one GET

**Service:** ingestion-service · **Found:** 2026-09-11 (on the plant, the hard way)
**Files:** `Pipeline/LoopHealth.cs` (new), `LoopJoiner.cs`, `LoopRegistryCache.cs`,
`OtLoopSubscriber.cs`, `SubscriberStatusRegistry.cs`, `IngestionMetrics.cs`,
`PipelineEndpoints.cs`; tests `LoopHealthTests.cs` (new)

**What prompted it.** After v3 went in, 143 of 175 registered loops were producing
nothing. Establishing why took a two-hour MQTT inventory: capture every retained topic,
derive which loops publish which parameters, cross-reference against the registry. The
answer — **114 loops never publish SP** — had been sitting inside the joiner the entire
time. It gates emission until pv, sp AND op have each been seen, and said nothing.

**The gating is correct and is NOT relaxed.** Without SP there is no control error, so
those loops are unassessable, and defaulting the missing member is worse than silence:
`CplmNormalizedSample.java`'s P1-12 comment records a defaulted `op=0` once reading as
"G4 PASS, actuator healthy" for a valve nobody was receiving data from. Flink would
discard such tuples anyway (`isValid=false` on any non-numeric pv/sp/op), so emitting
them would only add Kafka volume. **The defect was the reporting, not the rule.**

**What was added:**

- **`GET /api/ingestion/loop-health`** — one row per registered loop: `state`, the
  `missing` required signals, which roles have been `seen`, `modeSeen`, last source
  timestamp, seconds since last emit, skipped ticks, `sourceFcs`. Filters: `?state=held`,
  `?loopId=`. Sorted worst-first so the actionable rows need no paging.
- **Four states**, each implying a different fix: `flowing`; `idle` (complete, source
  went quiet); **`held`** (a required signal has NEVER arrived — needs an OT change);
  `silent` (registered, not one message ever). Held deliberately outranks idle: an
  incomplete loop has also never emitted, but waiting will not fix it.
- **`silent` needs the registry**, which the joiner cannot see — a loop that never
  published has no joiner state at all. `OtLoopSubscriber` merges
  `LoopRegistryCache.ActiveLoops()` with the joiner snapshot every 10 s.
- **Roll-up on `/stats`** (`loopHealth`: total/flowing/idle/held/silent, missingByRole,
  noMode) and **Prometheus gauges** `ingestion_loops_by_state{state}` and
  `ingestion_loops_missing_role{role}` — so `held` climbing is alertable, not merely
  inspectable.
- Idle-ness is judged on **our** wall clock (`LastEmittedWallMs`), never the source's:
  the plant's gateway runs +132 s ahead, so comparing a source ts to now would mislabel
  healthy loops. Same lesson as CHG-001.

**`noMode` counts only otherwise-analysable loops.** First cut counted held and silent
loops too; a test caught it. A held loop's missing MODE is not the actionable fact — its
missing SP is. On the plant the 8 MODE-less loops were all flowing, which is exactly the
set worth chasing.

**Verified:** build clean, 0 warnings; **140/140 tests** (6 new, each reproducing a shape
seen on the plant: PV-only → held naming sp+op; PV+OP → held naming sp; complete → flowing
then idle; held outranking idle; MODE never gating; and the fleet roll-up).
**Not yet exercised against the plant** — first proof is the first deploy.

**What it would have answered instantly:** `GET /loop-health?state=held` → 114 rows, each
naming `sp`. That is the whole OT conversation, without touching the broker.

---

## CHG-016 ✅ Last-known loop values survive a restart

**Service:** ingestion-service (+ DB script 51) · **Built:** 2026-09-11
**Files:** `database/scripts/51_ingestion_loop_state.sql` (new),
`Services/LoopStateRepository.cs` (new), `Pipeline/LoopJoiner.cs`, `LoopHealth.cs`,
`OtLoopSubscriber.cs`, `OtIngestionHostService.cs`, `Program.cs`;
tests `LoopStateSeedTests.cs` (new)

**The gap.** The joiner held last-known values in memory only, so every restart threw
away everything learned. Normally harmless — a fresh subscribe pulls the broker's
retained set — but the plant proved the failure mode: the OT gateway publishes **only on
change**, MQTT keeps exactly **one** retained message per topic, and this broker lost its
retained store some time before 2026-09-06 20:15. A setpoint that last moved before that
is unobtainable by any client until it next happens to change, which for a stable loop can
be weeks. Every ingestion restart re-opened that hole.

**What it does.** `ingestion.loop_state` (keyed `config_id, loop_id`) holds each loop's
members, extras, mode token and emission watermark. The subscriber seeds the joiner from it
at start, saves every 60 s, and saves again on shutdown. **Once a signal has been received
it is never lost again** — and as each of the plant's quiet signals happens to change just
once, it is captured permanently rather than until the next restart.

**Safety rules, each with a test:**

- **Nothing is invented.** Only values actually received are stored, with their original
  source timestamp and quality. A restored member is indistinguishable from one that
  arrived a second ago — precisely what would have been true had the process never stopped.
- **Live data always wins.** A seed never displaces a member already present, and never
  overwrites a newer timestamp.
- **The emission watermark travels with the state, and never moves backwards.** IoTDB keys
  rows by device+timestamp, so re-emitting a published `event_ts_ms` would *overwrite* the
  original row rather than add one. A stale store must not license that.
- **Retired loops are not resurrected** — a stored row is only seeded if the registry still
  resolves that loop as active.
- **Best-effort throughout.** An empty, unreachable or stale store degrades to today's
  behaviour (wait for the wire); a failed save is logged and retried. Persistence must
  never be able to stall ingestion.

**Save cadence: every 60 s, on shutdown, AND immediately whenever a loop gains a role it
did not have before.** That last trigger is the point of the feature: on a source that
publishes a setpoint twice a week, the first arrival of that SP is the value hardest to
re-acquire, and leaving it unsaved for up to a minute is exactly the window in which a
restart would lose it. A steady update to a role already held does not trigger a save, so
this costs nothing at the ~120 msg/s the plant runs at. Seeding never raises the flag —
restoring is not new information.

**Values never expire — and that is the design, not an oversight.** A setpoint the plant
has not touched since March is not stale data, it *is* the setpoint; CHG-002 removed the
ageing rule because ageing one out marked healthy loops BAD. A restored member is used
indefinitely, keeps quality GOOD, and never stamps the tuple's `event_ts_ms` (that comes
from the newest member, normally the live PV). There is no TTL in the joiner, the
repository or the table.

**The counterweight is visibility, not expiry.** `/loop-health` now returns `memberTsMs` —
the source timestamp of every member held — so "this loop is being scored against a
setpoint from three months ago" is a fact you can read rather than infer. Raw timestamps
rather than ages, because the gateway clock runs ahead of ours (+132 s measured) and any
"seconds old" computed across the two would be wrong by that much.

**Visible, not silent:** `Restored` on each `/loop-health` row says whether a loop is
holding restored values, and the subscriber logs the seeded count at start.

**What it does NOT do.** It cannot recover the 114 loops that have never sent SP — we never
received those values, so there is nothing to have stored. **The gateway-side baseline
publish remains the only fix for those** (see
[docs/ot-data-integration/12-ot-discussion-points.md](docs/ot-data-integration/12-ot-discussion-points.md)).
This is durability insurance, not a cure.

**Verified:** build clean, 0 warnings; **150/150 tests** (10 new: restored SP completing a
PV-only loop, live-beats-restored, newer-restored-wins, watermark survives, watermark never
rewinds, audit visibility, a full snapshot→seed round trip through a second joiner, and the
immediate-save trigger firing on a first value per role but not on updates or on seeding,
and a six-month-old setpoint still being used, still GOOD, with its age visible).
**PROVEN ON THE PLANT 2026-09-11.** The OT gateway was restarted (a full publish, then
on-change) and the fleet went **36 → 161 flowing, 114 → 0 held, 7 → 0 without MODE** — every
"missing" signal existed all along. `ingestion.loop_state` captured all 161 within seconds
via the immediate-save trigger, and a subsequent restart of the ingestion service reported
**161 of 175 loops restored from the state store**, with `held` still 0.

One gap the live test exposed: the "restored N loops" startup message is `LogInformation`,
which the plant suppresses at `SERVICE_LOG_LEVEL=Error` — the single number proving restart
durability was invisible exactly where it mattered. The count is now on the `/stats`
`loopHealth` roll-up as `restored`, where no log level can hide it.

---

## CHG-017 ✅ MODE on the Loop Explorer summary

**Service:** frontend · **Files:** `utils/modeVocabulary.ts` (new),
`components/Cpm/explorer/SummaryTab.tsx`, `components/Administration/LoopIngestPanel.tsx`

The Summary tab showed live **PV / SP / OP** and not MODE — while MODE is the field that
decides whether any of it was scored at all. A loop in manual is excluded at Gate 1, so
every verdict on that page was computed *without* it; three numbers with no mode invite
the reader to judge performance that was never measured.

**The API already carried it.** `useLoopLive` has exposed `mode` (and `vp`, `quality`)
since Phase 7 — the tab simply rendered three of six fields. No backend change.

A fourth tile now shows the token plus what it means for analysis:

| Live value | Shown | Note |
|---|---|---|
| `AUT` / `CAS` | the token | closed loop · analysed |
| `MAN` / `IMAN` | the token | manual · excluded at G1 |
| `UNKNOWN` | `UNKNOWN` | **mode never published · excluded at G1** |
| absent | `—` | no live publisher |

`UNKNOWN` is deliberately its own case rather than folded into "manual": it means the
source has never published a mode (7 loops on the plant, 2026-09-11), which is an OT gap,
not an operator's choice — and the two need different people to fix them.

**Vocabulary de-duplicated.** The token sets now live in `utils/modeVocabulary.ts`, used by
both this tile and `LoopIngestPanel`'s per-row classifier. They must stay in step with
ingestion-service `ModeVocabulary.cs` and Flink `CplmNormalizedSample`; three copies would
have drifted. Manual-wins-before-auto is preserved, exactly as the engine resolves it.

**Fixed on the plant the same day:** the first version read only the live Sparkplug plane
and showed `—` for almost every loop. MODE is report-by-exception like everything else, and
it changes so rarely that the live plane is normally silent for it — a loop sitting in AUT
for a month publishes nothing, so there is no live value to read. The tile now uses the
**same two-plane rule as PV/SP/OP**: live first, last stored value second, with the source
named in the sub-line. The historian needed no change — its trend builder already decimates
`mode` with `last_value()` rather than averaging it, because it is categorical; the tab
simply was not asking for it.

**Verified:** `tsc --noEmit`, `eslint --max-warnings 0` and `npm run build` all clean. Not
click-tested — `src/frontend-ob` still has no test runner.

---

## CHG-018 ✅ Loop validation tooling (12 h gate investigation)

**Services:** none — read-only tooling
**Files:** `scripts/cpm-validate-loops.sql` (new),
`docs/cpm-loop-validation-runbook.md` (new)

A 13-section SQL investigation plus a 10-step runbook for validating a named set of
loops against a 12 h window. Built for the post-deploy check on FIC10409, FIC10509,
FIC10501, FIC10502, LIC10501, PIC00605, PIC80143, PIC80141, FIC80103, PIC80140 —
the loop list is a temp table in section 0, so it re-targets without editing queries.

Gate statuses live only inside `payload->'gates'` on `analytics.cplm_gate_results`;
the promoted columns carry metrics, not verdicts. Gate rows exist at **12h and 24h**
only — short features at 1/5/10/15/30/60m, long at 4/12/24h.

Sections: configuration → feed → 16-gate verdict → stability across windows → one
section per gate family with the numbers behind each status → first blocking
exclusion → configuration cross-checks → single-loop raw payload. The runbook covers
what SQL cannot see: tuple shape on Kafka, duplicate data sources, the
`cplm.loop.engineering` broadcast, Flink job start times vs the deploy, and consumer
group membership.

**Verified:** every section executed against the lab (0 errors) using loops that have
real 12 h history, including a deliberately absent loop to confirm missing data reads
as `-` rather than dropping the row. §11 correctly named G0 as the first blocker on
five loops; §12 caught NOT REGISTERED, missing verdicts and undeclared PV ranges.
Real data also exercised the G14 path: two loops sat at confidence exactly **0.890**
with `G14 INSUFFICIENT_EVIDENCE` — the no-VP cap demoting CONFIRMED to SUSPECTED.

**Not verified:** never run against prod — that is the point of handing it over.

---

## CHG-022 ✅ validate-loops.sh — six bugs, found by running it on the plant

**Services:** none. Diagnostic tooling only, nothing to deploy — copy the script to the VM.
**Files:** `scripts/validate-loops.sh`

Run on the plant 2026-09-12 to read the 12 h and 24 h verdicts for ten loops. The plant
answers were sound; the tool around them was not. In order of how badly each misled:

1. **Every healthy consumer group reported "2 members."** The check read the *partition*
   view and counted distinct `$NF` — which is `CLIENT-ID`, not `CONSUMER-ID` — under
   `awk 'NR>1'`. `kafka-consumer-groups` prints a **blank line before the header**, so
   `NR>1` let the header through and the literal string `CLIENT-ID` counted as a member.
   CLAUDE.md flags a split `cplm-results` group as silent data loss, so this alarm invites
   an operator to kill a healthy consumer. Verified on the plant: `--members` shows one
   consumer holding all 24 partitions.
2. **And it failed the unsafe way round.** A group with no members prints a single
   `has no active members.` line → counted 1 → reported `ok single consumer`.
3. **It probed a frames group that cannot exist.** `CplmEventFrameService` derives its group
   as `ConsumerGroupId + "-frames"` (`CplmEventFrameService.cs:66`) =
   `traverse-cpa-cplm-results-frames`. The script asked for `ams-api-cplm-results-frames`, a
   lab-era name from before CPLM moved out of ams-api — precisely the full-names trap
   CLAUDE.md warns about. Combined with (2) it printed a clean bill of health for a group it
   never looked at. The real group is present with one member on 8 partitions.
4. **`-H 24` read 12 h results.** `HOURS` drove only the header and the short-feature
   lookback; all four gate queries were pinned to `window_kind='12h'`. It printed
   `window=24h` over 12 h verdicts.
5. **`window_start >= NOW() - N hours` hid every long-window verdict.** A 12 h window ending
   now *started* 12 h ago, right at the boundary — so section 8 printed `(0 rows)` and
   `gates.csv` came out empty at 12 h while a 24 h run of the same data produced 432 rows.
   Filters on `window_end` now.
6. **Two notes asserted the opposite of the truth on Marun.** Engine health claimed
   *"ZooKeeper HA recovers the previous JobGraph + jar on restart"* — Marun has **no** HA, and
   an operator following that note would skip the mandatory container removal a deploy needs.
   The G1 note blamed `mode_value_map` for any loop at zero auto, when sibling loops on the
   same source reading `1.0000` prove the map is fine and the loop is genuinely in MAN.

**Added: `-a <timestamp>`** — report the verdict **as of** a past instant. Without it the
script always shows the *latest* verdict, which straight after a Flink restart is the
worthless one: the rolling buffer is empty and the engine keeps emitting from a partial one.
Today every loop read `INSUFFICIENT_DATA` at `conf 0.000`, with the 12 h and 24 h tables
byte-identical because both slices held the same ~25 minutes of samples. Both headers and
`run.txt` print the cutoff so a saved report cannot later be misread as current.

**Plant findings that survived all of the above** (genuine, unrelated to the tooling):
G0 fails on **completeness alone** — `bad_quality 0`, `dup_ts 0`, completeness 0.41–0.86
against the 0.98 threshold with 21–32 s gaps on a 5 s grid; **three loops produce no data
at all** (`FIC10501` — last verdict 09-03, `FIC10509`, `LIC10501`) despite being registered,
role-mapped, ranged and broadcast to Flink; and `FIC80103` is parked in MAN (`auto_pct 0`,
`saturation 1.0`, `op_std 0`, `SP=0` with `PV=420`), which is the plant, not the map.

---

## CHG-021 ✅ ams-api honours the plant log floor (found during the v2.3 deploy)

**Services:** ams-api (rebuild required — **not in v2.3**)
**Files:** `AMS.Api/Program.cs`

**Found by reading the v2.3 post-deploy logs.** They printed `INF`, on a plant configured
`SERVICE_LOG_LEVEL=Error`. Three separate causes, all in one block:

1. **The plant log floor never applied to ams-api at all.** `builder.Host.UseSerilog()` makes
   Serilog *replace* Microsoft.Extensions.Logging, and this configuration is built in code with
   no `ReadFrom.Configuration()`. So `Logging__LogLevel__Default` — set from `SERVICE_LOG_LEVEL`
   by the compose `x-kafka` anchor, and honoured by every other .NET service — was read by
   nobody, and Serilog's own default of `Information` stood. Neither `Logging__*` nor
   `Serilog__*` env vars could have fixed it from outside.
2. **`System.Net.Http` was unmuted.** `RawLoopIotDbConsumer` issues one POST per device per
   flush (~35/s across the HDPE fleet) and the HttpClient logger writes **four** Information
   lines per round trip: ~140 lines/s of pure noise.
3. **A Seq sink pointed at nothing.** `WriteTo.Seq(... ?? "http://localhost:5341")` ran in
   every non-Development environment. No deployment in this repo runs Seq or sets `Seq:Url`,
   so every prod process has been retrying a dead sink since it was written.

**Not a disk risk, a diagnostic one.** `ams-api` carries `logging: *default-logging`
(`max-size 10m`, `max-file 3`), so the json-file is capped at 30 MB — this could not refill the
disk. But at ~140 lines/s that ring holds roughly **25 minutes** of history, which means
CHG-020's once-a-minute stall message would rotate away before anyone read it. The change that
exists to make an outage visible was being hidden by the noise floor.

**Fix.** `MinimumLevel.Is()` from `Logging:LogLevel:Default` (mapping the two .NET names Serilog
does not share — `Trace`→`Verbose`, `Critical`→`Fatal` — since a silent fallback to Information
would defeat a deliberate setting); `MinimumLevel.Override("System.Net.Http", Warning)`; and the
Seq sink only when a URL is actually configured.

**Verified:** `dotnet build AMS.Api` clean, 0 warnings. **Not deployed** — v2.3 shipped before
this was found, and it is not urgent: the 30 MB cap bounds it. Goes in the next ams-api build.

---

## CHG-020 ✅ The historian no longer discards samples it cannot write

**Services:** ams-api (rebuild required — **not in v2.1**)
**Files:** `AMS.Api/BackgroundServices/RawLoopIotDbConsumer.cs`, `AMS.Api/Services/IotDbWriteClient.cs`

**The defect.** Chasing the PIC80105 trend gap (CHG-019) down to the write path found this.
`IotDbWriteClient.NonQueryAsync` returned a bare `false` for *every* failure — HTTP 5xx,
timeout, exception, and a statement IoTDB read and refused were indistinguishable. On a
rejected batch `InsertBisectingAsync` split to single rows, logged `Dropping poison sample`,
and **returned `true` regardless**, so `allOk` stayed true and the offsets were stored.

Three consequences, all verified in the code rather than inferred:

1. **On the 2026-09-12 disk-full, every row was dropped and every offset committed.** The
   samples were still in Kafka, with 7 d of retention, and the consumer walked straight past
   them. The resulting hole is permanent and cannot be backfilled — exactly the ~4 h gap seen
   on PIC80105.
2. `allOk = false` was **dead code**. The `"offsets not stored, batch will be redelivered"`
   warning could not be reached from an insert failure, so the one log line that would have
   revealed this never printed.
3. The bisect never retried a **half** — it descended straight to singles, so a rejected
   500-row batch always cost **501 statements**, never the `O(log n)` its comment claimed, and
   during an outage every one of them failed and logged at Error.

**Fix.**

1. **`IotDbWriteOutcome { Ok, Rejected, Unavailable }`.** Transport/auth/timeout/exception →
   `Unavailable` (the rows were never evaluated); HTTP 200 with a non-200 IoTDB code →
   `Rejected` (the statement was read and refused, so it *may* be one bad row). Cancellation
   now rethrows instead of being laundered into a write failure. `NonQueryAsync` survives as a
   thin bool wrapper for callers with no recovery to do.
2. **The batch-wide discriminator.** `Unavailable` is decisive but not sufficient: a disk-full
   IoTDB answers `Rejected`. So the flush also rules on what landed — **a single bad value
   cannot stop its 499 neighbours, so if nothing landed at all, the fault is the server.**
   Rejected rows are now *collected* by the bisect and judged once per flush, not dropped
   where they are found.
3. **Hold, don't discard.** On an infrastructure verdict the consumer pauses its partitions,
   keeps the buffer and the offsets, and retries the same rows until they land. IoTDB keys on
   `(device, timestamp)`, so the replay is a no-op. It logs at Error once a minute saying it is
   paused, for how long, and that the samples are safe only as long as topic retention.
4. **The ambiguous case is not resolved by guessing.** With fewer than 5 rejected rows and
   none landed there is genuinely not enough evidence, and pausing would be self-defeating —
   it stops the very siblings arriving that would settle it. So the buffer is held *without*
   pausing: the next flush either lands something (these are poison, drop them) or reaches the
   threshold (the server is down, pause). At ~120 samples/s that resolves within one interval.
5. Poison drops still happen — they are correct when siblings landed — but now carry a running
   total. There is **no metrics surface in ams-api at all** (no `Meter` anywhere in the
   project), so this is a log counter, not a Prometheus series; wiring one is a separate job.

**The trade, stated plainly.** A genuinely stuck IoTDB now **blocks the partition** instead of
discarding data. That is the intended direction — a loud stall with the data still in Kafka
beats a silent unbackfillable hole — but it means an IoTDB outage lasting longer than the
topic's retention still loses samples, and the consumer will not self-heal past a fault that
never clears. The stall log says exactly that.

**Verified:** `dotnet build AMS.Api` clean, 0 warnings. **Not verified:** no automated test —
`IotDbWriteClient` is a sealed concrete class with no seam to fake, so covering the
discriminator means extracting an interface first. The behaviour is reasoned from the code
paths above, not exercised.

**Deploy note — shipped as v2.2, deliberately NOT folded into v2.1.**
`release-out/v2.2-20260912`, ams-api only, 110 MB, no schema change and no Flink restart.
Kept separate because v2.1 carries the Flink jar, whose deploy needs both Flink containers
removed on a cluster with no ZooKeeper HA — bundling would put the only change that prevents
data loss behind the riskiest operation in the set.

**Verified in the built image**, not just at the commit: `AMS.Api.dll` (UTF-16, so
`tr -d '\0'` first) contains both `IoTDB is rejecting every write` and
`after IoTDB rejected it alone`.

**The trap that will silently no-op this deploy.** `ams-api` sits behind
`profiles: ["cpa-ams-api"]` (`docker-compose.marun.yml:205`) and `deploy.sh:69` adds that
profile only when `START_AMS_API=yes`. Without it, compose loads the new image, leaves the
**old container running**, and reports success — the same shape as the Flink
`submit_if_missing` trap. `RawLoopIotDbConsumer` is the only writer of `root.site1.cpm.*`
(no Flink job touches that tree), so this is the whole loop-historian write path. Confirm:

```bash
docker inspect -f '{{.Created}} {{.Image}}' ams-api
docker logs --since 5m ams-api | grep -c 'wrote .* samples'
```

---

## CHG-019 ✅ SP and MODE stay visible when they never change

**Services:** Flink jar (Loop Live RBE) + historian-bff + frontend
**Files:** `LoopLiveRbeJob.java`, `historian-bff/Program.cs`, `historian-bff/IoTDbClient.cs`,
`frontend-ob/src/api/cpmApi.ts`, `hooks/useCpm.ts`, `components/Cpm/explorer/SummaryTab.tsx`

**The report.** LIC30102 showed PV and OP but `SP —` and `MODE — no live value, none
stored`, on a loop that is plainly in AUT with a setpoint. Restarting the OT gateway
republished every value and changed nothing.

**Root cause — three correct pieces, wrong together.**
`LoopLiveRbeJob` emits a metric only on first observation, a numeric move past the 0.05
deadband, or a string change, and **it has no heartbeat**. `sparkplug-edge-node` writes each
emission to Redis with `SETEX … 3600`. So **any signal that does not change for an hour loses
its snapshot and can never regain it** — PV and OP move constantly and are refreshed; a held
setpoint and a constant MODE are emitted once and expire. Republishing from OT cannot fix it:
the filter compares against its own last emitted value and suppresses the unchanged repeat.
The prod job had been up ~2 days, so those snapshots died ~1 h after startup.

**Fix, in three layers.**

1. **Heartbeat (`LoopLiveRbeJob`).** A per-key processing-time timer republishes the last known
   value every `--heartbeat-seconds` (default 300). It carries the **original** sample
   timestamp — inventing a fresh one would make a month-old setpoint look just measured — plus
   a `heartbeat: true` marker. This also makes the existing 1 h TTL *correct* rather than
   merely survivable: a key now lapses only when the producer really has stopped, which is what
   makes "no live value" mean something. No TTL change needed.
2. **`GET /api/hist/last` (historian-bff).** IoTDB already stores pv/sp/op/vp/mode on every
   tuple, but nothing could ask it for a last value: `/trend` only sees inside its window and
   `/snapshot` reads the same Redis live plane. The new endpoint uses IoTDB's native
   `SELECT last` — an index lookup, not a window scan, with **no time bound** — and returns a
   per-measurement timestamp so the UI can show age instead of implying the value is live.
3. **Third plane in the UI.** `SummaryTab` now resolves live → trend bucket → last stored, and
   labels the third case `last stored 2d ago`. This also fixes a separate blind spot: `last`
   was the *final* bucket of 240, so any feed gap at the window edge rendered "—" even when the
   series was full.

**Verified:** Flink `mvn package` clean; historian-bff builds; frontend typecheck and lint
(`--max-warnings 0`) clean. `/api/hist/last` exercised through the gateway against live IoTDB,
returning `sp=63` and `mode=AUT` **47.6 h old** — exactly the values that render blank today.
One bug caught in that test: `SELECT last` returns `column_names: null` and puts headers in
`expressions`, so the first mapper returned an empty map.

**Audit 2026-09-12 — three corrections, all applied.**

1. **The heartbeat is correct and stays unbounded.** An audit first called the missing
   termination a blocking defect; that was wrong. For a report-by-exception signal, silence
   means *unchanged*, so republishing a held setpoint indefinitely is the right semantics —
   terminating it would discard the value precisely for the signals this change exists to
   serve. **But it does remove the previous staleness signal:** with a heartbeat, the key
   never expires, `live.hasData` is true forever, and `NO LIVE PUBLISHER` becomes
   unreachable. The Javadoc claimed the opposite ("letting the key lapse if the producer
   genuinely dies"), which would have misled the next reader; it now states what the code
   does and that **consumers MUST read the timestamp**.
2. **Staleness now shows in the UI.** `lastPoint` is refreshed on every message received, so
   a live loop's heartbeat carries a near-current ts while a dead one's freezes. The tiles
   render `live · 4h ago` past two heartbeat intervals instead of a bare `live (RBE)`.
   Without it a gateway outage would have shown every loop as live with frozen values — a
   worse failure than the blank tile being fixed.
3. **`noData` ignored the third plane.** A loop whose only evidence was a last stored value
   still rendered "No operating data", hiding the tiles this change exists to fill.

**Unaffected by any of this:** gates and trends. Both read
`traverse.cpa.loop.samples.v1`, where the joiner forward-fills SP into **every** tuple, and
`RawLoopIotDbConsumer` writes pv/sp/op/vp/mode on every one — so an unchanged setpoint is
already scored by the gates and already drawn as a flat line on the trend. The heartbeat
touches only the live plane.

**Verified:** Flink jar rebuilt clean (`onTimer` confirmed present in the artifact);
historian-bff builds; frontend typecheck, lint (`--max-warnings 0`) and build clean.
**Not verified:** the heartbeat has not run against a live broker — that needs the jar deployed.

**Root cause of the trigger — corrected 2026-09-12.** The entry above explains why SP and
MODE *stayed* blank; it named the wrong reason for why they went blank on that day. What
actually happened: **the VM disk filled, IoTDB began rejecting writes, and the historian plane
went dark.** PV and OP survived because they change constantly and so are refreshed on the
live plane; SP and MODE change rarely, had already lost their 1 h Redis snapshot, and had no
second plane to fall back to — so they rendered blank while their neighbours looked healthy.
The same disk-full event is what produced the ~4 h hole in PIC80105's trend (~11:24–15:18).

The RBE/TTL analysis is still correct and the defect it describes is real — an hour of no
change did lose the snapshot regardless of disk. **But it was not the trigger**, and a
deployment review that records it as such would draw the wrong conclusion about disk headroom.

**What that makes CHG-019 worth.** Not "fixes the blank tiles on LIC30102" but: it gives SP
and MODE a second plane, so the *next* historian outage degrades those fields to
`last stored 3h ago` instead of a blank — and the heartbeat means "no live value" finally
distinguishes a dead producer from a quiet one. It should still deploy, on that basis.

**It also exposed a worse defect, one layer down — see CHG-020.** The historian did not lose
those hours because writes were refused; it lost them because the consumer *discarded the
rows and committed the offsets* while they were being refused.

---

## CHG-005 ✅ Documentation & diagnostics

- `docs/cpm-calculation-reference.md` — widened from the four Flink jobs to the whole CPA
  chain: new **§0 ingestion layer** (incl. a per-gate table of what ingestion must deliver
  and how each gate fails when it doesn't), **§9 cplm-api derived values**, **§10 historical
  replay**, review flags 23–26. Review flags renumbered §9 → §11.
- `docs/ot-data-integration/10-ot-loop-ingestion-runbook.md` — §2 now carries the
  SME-confirmed MODE table, the exact-token reasoning and the "don't leave 3 unmapped"
  warning; open question #1 marked resolved.
- `scripts/diagnose-gate-failures.sql` (new) — six queries answering *which* gate is failing
  and why. Gate statuses live only inside `payload->'gates'`, so this digs into the JSONB.
- **Release tooling (CHG-008 follow-through):** `scripts/build-flink-jar.ps1` and
  `migration/deploy/build-prod-images.py` built the jar with `-DskipTests`, which cannot build
  this repo (CHG-008 §2); both now use `-Dmaven.test.skip=true`. New
  `migration/deploy/build-release.py` + manifest `migration/deploy/releases/v3.txt` — see
  [Release v3](#release-v3--what-to-build-and-run). `migration/UPDATE-RUNBOOK.md` §2 and
  `migration/deploy/README.md` point at it.

---

## CHG-023 ✅ CPM Overview / Performance were slow: the fleet reads sorted the whole gate table on every call

**Reported (2026-09-13):** `/cpm` (Overview) and `/cpm/performance` take many seconds to show
data on the plant. Audited `analysis.md` against the code and measured the read path on a
prod-scale copy of the gate table (171 loops × 11 days = 361k rows, real 3.3 KB payloads).

**Root cause.** `CpmFleetController` (`/api/v1/cpm/fleet/{summary,rankings,heatmap}`) found
each loop's newest verdict with `DISTINCT ON (loop_id)` over the **entire**
`analytics.cplm_gate_results` table, ordered by an expression no index serves, and rankings /
heatmap dragged every row's TOASTed payload through that sort. Performance fires four of these
per mount and again every 60 s; Overview two (and its trend chart waits for rankings). The
gateway cache excludes CPM, so every console repeats it. At plant size the calls exceed
Npgsql's 30 s command timeout → **HTTP 500** ("Timeout during reading attempt" ×11 in the
old service log during the BEFORE run). The plant's table grows ~33k rows/day (12h + 24h every
15 min per loop) with **no retention** — `migration/schema/03` never carried script 39's
hypertable/retention — so it only got worse.

The page sweep afterwards found the same class of defect on three more reads:
`/calculations` (engine-version lookup: 30 s → HTTP 500 at plant size; Calculations, Explorer,
Governance, Replay), `/loops/{id}/gates/latest` (per-loop expression sort on every click) and
`/loops` (1 + 2 queries per loop, nine pages mount it), plus a serial Flink walk behind
`/pipeline-metrics` (8.7 s cold) and a wildcard snapshot seed that paid for every dead device
name ever written to Redis (the lab carried 3,282 names for ~30 live devices).

### What changed

| Area | Change | Files |
|---|---|---|
| cplm-api reads | Per-loop **two index probes** (newest real verdict, else newest row — the ordering the endpoints always used) instead of whole-table `DISTINCT ON`; only `payload->'observability_flags'` / `payload->'gates'` leave the DB | `Data/FleetLatestSql.cs`, `Data/GateReadSql.cs`, `Controllers/CpmFleetController.cs`, `CpmAnalyticsController.cs` (gates/latest), `CpmEventsController.cs` (calculations) |
| Indexes | Three additive indexes, one definition, three mirrors | `Data/CplmReadIndexes.cs` (consumer self-heal DDL), `migration/schema/03-traverse_cplm.sql`, `database/scripts/52_cplm_fleet_latest_indexes.sql`, **plant:** `scripts/cpm-04-fleet-latest-indexes.sql` (CONCURRENTLY) |
| Cache | 15 s single-flight cache on the three fleet reads (`Cpm:FleetCacheSeconds`, 0 disables) and 10 s on pipeline-metrics (`Cpm:PipelineMetricsCacheSeconds`); failures never cached; a leaving caller cannot abort the shared query; `X-Cpm-Cache: HIT|MISS` header | `Data/FleetReadCache.cs`, `Program.cs` |
| Registry list | Tag map and links read once each and grouped in memory (3 queries, was 1 + 2L) | `Services/CpmLoopRegistryReads.cs`, `CpmLoopRegistryService.cs` |
| Pipeline metrics | Per-job Flink walk runs concurrently (checkpoints ∥ vertex metrics) | `Services/FlinkPipelineMetricsCollector.cs`, `CpmReadinessController.cs` |
| Frontend | Performance derives its 12 bad actors from its own 50-row ranking (no second rankings request; the "error" order still asks the server); `useFleetRankings` gains `enabled` | `components/Cpm/useBadActors.ts`, `CpmPerformance.tsx`, `hooks/useCpm.ts` |
| Frontend test runner | vitest + jsdom + Testing Library added; `npm test` | `package.json`, `vitest.config.ts` |
| nginx | gzip for JSON/JS/CSS (`gzip_proxied any`) — heatmap 112,059 B → 6,230 B | `src/frontend-ob/nginx.conf` |
| historian-bff | `GET /snapshot` reads every device's index + values concurrently; dead device names are pruned from `snapshot:devices` (the edge node SADDs a live one back on its next publish) | `SnapshotReader.cs`, `Program.cs` |
| Lab hygiene | Literal `</content></invoke>` removed from the tail of script 42 (a fresh lab volume stopped applying scripts there; prod unaffected) | `database/scripts/42_cplm_event_frames_indexes.sql` |
| Ops | Retention facts script (read-only) and BEFORE/AFTER probe; both travel in the bundle | `scripts/cpm-05-gate-results-retention-check.sql`, `scripts/cpm-06-fleet-perf-probe.sql`, `migration/deploy/build-release.py` |

### Measured (lab, 367k gate rows = plant scale; old image vs final image, via the gateway)

| Read | Before | After (cache miss / hit) |
|---|---:|---:|
| `fleet/summary` | 0.8–7.4 s | 18 ms / 24 ms |
| `fleet/rankings?limit=50` | 18.4 s once, **HTTP 500 at 30 s** otherwise | 57–95 ms / 17–31 ms |
| `fleet/rankings?limit=12` | **HTTP 500 at 30 s** (3/3) | 70–96 ms / 11–39 ms |
| `fleet/heatmap` | 30.0 s once, **HTTP 500** otherwise | 67–128 ms / 32–36 ms |
| Performance mount (4 calls, wall clock) | **34.8 s** | **0.14–0.18 s** |
| `/loops` (230 lab loops) | 0.44–0.52 s | 0.07–0.18 s |
| `/calculations` | **HTTP 500 at 30 s** (2/3), 31 s | 0.37–0.56 s |
| `/loops/{id}/gates/latest` | 0.15–0.34 s | 14–143 ms |
| `/pipeline-metrics` | 8.65 s cold | 2.19 s cold / 14–24 ms cached |
| `/api/hist/snapshot?assets=*` | 0.37–1.26 s | 37–84 ms (1,992 dead names pruned on first call) |

Pure SQL on the scratch plain table (what the plant has): rankings 9.8–17.6 s → 19 ms, heatmap
22.6 s → 20 ms, summary 532 ms → 1.8 ms; old-vs-new latest row per loop identical on all 171.
Response bodies of the old and new `summary` and `rankings` are byte-identical in content
(the other old bodies never arrived — they timed out).

### Tests (all green)

| Suite | What it proves | Count |
|---|---:|---:|
| `tests/cplm-api.Tests` (new; needs the lab Postgres on 5433) | new SQL returns exactly the legacy rows for rankings/heatmap/summary/gates-latest/calculations (legacy oracle verbatim, 600 s timeout — it needs it); plans use the new indexes; registry batch == per-loop hydration for every loop; pipeline-metrics walks concurrently and caches (stub Flink); cache single-flight/TTL/failure/cancellation semantics | 28 |
| `tests/historian-bff.Tests` (new; throwaway Redis `docker run --rm -d --name snaptest-redis -p 6390:6379 redis:7.2-alpine`) | snapshot reader parity, stale pruning, dead-device pruning, site-scope filter | 4 |
| `src/frontend-ob` `npm test` | bad actors = slice of the page ranking, one request; error order still fetched | 13 (incl. the 11 pre-existing time-expression specs, now runnable) |

### Plant deployment (v2.4) — order matters

1. `ops/cpm-06-fleet-perf-probe.sql` → keep the BEFORE output.
2. **`ops/cpm-04-fleet-latest-indexes.sql` BEFORE loading the cplm-api image** (CONCURRENTLY, no
   write lock, idempotent; prod's table is plain so CONCURRENTLY is allowed). Check the final
   query prints all three indexes with `valid = t`.
3. Load the three images, `deploy.sh --prod`. The self-heal DDL then finds the indexes present.
4. Confirm one member per CPLM consumer group (unchanged rule), then cpm-06 again → AFTER.
5. `ops/cpm-05-gate-results-retention-check.sql` (read-only) → decide P1-4 (TimescaleDB if the
   extension exists, else a nightly delete). Not part of this release.

**Rollback:** indexes are additive and can stay; reverting the cplm-api image restores the old
queries (slow, still correct). Frontend and historian-bff revert independently.

### Deferred, with reason

- **P3-8** gateway rate limiter (two serial Redis INCRs → one Lua call): ~1 ms/request, not worth
  the fail-open/fail-closed semantic risk in this release.
- **F07** readiness holds a DB connection across the resolver/Flink probes (1.3 s cold on the lab,
  then ~0.1 s): Explorer only, one call per loop click.
- **P1-4** retention: needs the plant decision (script cpm-05 gives the facts).
- The consumer's self-healed `cplm_gate_latest` VIEW orders recency-first (its "P1-3" fix) while
  the controllers order real-verdict-first; the rewrite preserves the controllers' behaviour.
  Aligning them is a product call.

### Lab notes

- The BEFORE/AFTER numbers come from 361,494 synthetic rows tagged `source = 'perf-synthetic'`
  (removed again after the run: `DELETE FROM analytics.cplm_gate_results WHERE source = 'perf-synthetic'`).
- The lab's contract Redis now holds ~1,290 device names instead of 3,282; the rest were dead.

---

## CHG-024 ✅ CPM batch APIs: the five fan-outs the batch audit ranked, built in order

**Why (2026-09-13):** after CHG-023 the fleet pages needed no batching, but five per-loop and
per-item fan-outs remained (`cpm-batch-api-candidates.md`). Each is now one request; the
existing single-item endpoints are untouched, every batch reports per item, and the two batch
endpoints that already existed (`POST /resolve/batch`, `POST /assets/by-paths`) are finally
connected end to end. **Not yet in a release** — see "Release" below.

### What changed

| # | Fan-out | Now | Files |
|---|---|---|---|
| 1 | Readiness: one `GET /resolve` per mapped role (pv/sp/op/vp/mode), five awaited round trips per loop click | one `POST /resolve/batch`, provenance read per index; labels, order and message unchanged; a short/failed answer is reported, never assumed fine | `cplm-api/Services/BindingProvenanceProbe.cs` (new), `Controllers/CpmReadinessController.cs` |
| 2 | binding-resolver `/resolve/batch`: one `GET /assets/by-path` per binding | `PathResolver.ResolveManyAsync` → one `POST /assets/by-paths` (≤ 2,000 paths); found → asset-model binding, absent → path fallback for that path only, asset-model down → all fallback (as today); results align with the input; the designer's H10 screen-open batch benefits too | `binding-resolver/Services/PathResolver.cs`, `Program.cs` |
| 3 | Operations: `POST /loops/{id}/republish-evidence` ×N from a shell with `sleep 0.5` (v3: 175 calls) | `POST /api/v1/cpm/loops/bulk-republish-evidence` `{ loopIds[] }` (≤ 5,000): one existence query, link projection per loop, then the service's existing signal-asset and evidence **batch** forms once; per-item outcomes (`notFound`, a loop failing link projection fails alone, a failed batch step marks every covered loop failed); one audit event `CPM_EVIDENCE_REPUBLISHED_BULK`; policy `cpm.manage` | `cplm-api/Services/BulkRepublish.cs` (new, pure orchestration), `CpmLoopRegistryService.cs`, `Controllers/CpmLoopsController.cs` |
| 4 | Windows comparator: six `GET /loops/{id}/kpis?resolution=K&limit=12` per loop selection | `GET /loops/{id}/kpis/latest?resolutions=1m,5m,10m,15m,30m,60m&limit=12` → `{ byResolution: { kind: { tier, count, samples } } }`; same SQL as the single read, now shared from `Data/KpiSql.cs` so the two cannot drift; 400 lists the unknown kinds | `cplm-api/Data/KpiSql.cs`, `Data/KpiReads.cs` (new), `Controllers/CpmAnalyticsController.cs`; frontend `api/cpmApi.ts`, `hooks/useCpm.ts` (`useCpmKpisByResolution`), `components/Cpm/windows/CompareAcrossKinds.tsx` |
| 5 | Governance role matrix: `GET /roles` then `GET /roles/{role}/permissions` per role | `GET /api/auth/roles?include=permissions` — one JOIN query in auth-service; the per-role route stays for edits | `auth-service/src/services/permission.service.ts`, `controllers/permission.controller.ts`; frontend `api/rolesApi.ts`, `components/Cpm/useRoleMatrix.ts` |

Not done, on purpose: Historical's trend + mode-track merge (2.6 in the audit) changes the mode
ribbon's bucket boundaries — a product decision first.

### Measured (lab, same three mapped loops and twenty mapped paths, old images → new images)

| Read | Before | After |
|---|---:|---:|
| readiness, cold, per loop (3 loops) | 3.22 / 0.70 / 0.24 s | 1.81 / 0.38 / 0.18 s |
| `POST /api/bindings/resolve/batch`, 20 paths | 0.93 / 0.17 / 0.41 s | 0.13 / 0.06 / 0.11 s |
| Windows comparator, one loop selection | six calls, 1.14–1.60 s in series | one call, 0.34–0.38 s |
| Governance matrix (4 roles) | five calls, 0.79–0.83 s in series | one call, 18–43 ms |
| republish, 3 loops | three calls, 1.7–6.2 s in series | one call, **0.21 s** (per-item results, unknown id reported) |

The BEFORE run's own republish step created AIC30601's four signal assets (10:01:19 UTC), which is
why the same twenty paths resolved 16 via asset-model before and 20 after — a measurement-order
artefact, not a code effect; the per-path contract is unchanged (proven by the resolver tests).

### Tests (all green)

| Suite | Added | Proves |
|---|---:|---|
| `tests/cplm-api.Tests` | `BindingProvenanceProbeTests` (6), `BulkRepublishTests` (5), `KpiReadsTests` (2, lab DB) | one batch request in role order with forwarded identity; short/failed answers reported; bulk order, per-item isolation, batch-step failure semantics, dedupe; by-resolution rows == single-read rows per kind, case-insensitive |
| `tests/binding-resolver.Tests` (new project) | `PathResolverBatchTests` (5) | one by-paths call, input order kept, duplicates sent once, unreachable → all fallback, batch == single per path |
| `src/frontend-ob` `npm test` | `useCpmKpisByResolution.test.tsx` (2), `useRoleMatrix.test.tsx` (2) | one request for all kinds / all roles; nothing fetched without a loop or without `rbac.manage` |

Totals now: cplm-api 41, binding-resolver 5, historian-bff 4 (unchanged), frontend 17; lint clean;
`tsc --noEmit` clean for the frontend and for auth-service (it has no unit-test harness — its change
is one query, verified end to end above).

### Release — NOT built (by request); fold into the next bundle

**Services to rebuild:** `cplm-api`, `binding-resolver`, `traverse-auth-service`, `ams-frontend`.
`cplm-api` and `ams-frontend` are already in `migration/deploy/releases/v2.4.txt`; add
`binding-resolver` and `traverse-auth-service` to that manifest (or a `v7.txt`) at release time.
**No schema change, no ops script, no Flink change.** No config knobs.

**Build-box proof for the bundle:** `dotnet test tests/cplm-api.Tests` (lab Postgres),
`dotnet test tests/binding-resolver.Tests`, `cd src/frontend-ob && npm test && npm run lint && npm run build`,
`cd src/services/auth-service && npx tsc --noEmit`.

**Plant proof after deploy:** `GET /api/v1/cpm/loops/<id>/readiness` (`binding_provenance` check
still passes for a loop whose signals are registered assets); `GET /api/v1/cpm/loops/<id>/kpis/latest?resolutions=1m,5m,10m,15m,30m,60m&limit=12`
answers 200 with six keys; `GET /api/auth/roles?include=permissions` answers 200 with
`permissions[]` per role; `POST /api/v1/cpm/loops/bulk-republish-evidence` with the loops from the
last data load replaces the shell loop (expect `republished == requested`, `notFound == []`).

---

## CHG-025 ✅ Performance matrix search could not find loops beyond the 100th; Window inspector detail moved to a sub-page

**Reported (2026-09-13):** (1) on **Performance → Calculation pathway**, searching `pic80140`
answered "No loops match" although the loop exists; (2) on the **Window inspector**, selecting
a window rendered its details at the bottom of a long list, so the reader had to scroll to
find what they had just clicked.

### 1. Matrix search — root cause and fix

The gate matrix pages and searches **client-side** over the `/fleet/heatmap` payload, and the
request asked for the server default of **100** loops (server cap 300). The plant has 171
monitored loops sorted by id; the lab has 230, cut at `G13_LOOP_B`; `PIC80140` sorts after the
100th, so it was never in the payload and the search reported a miss. The footer did say
"matrix serves the first 100 of N", but the empty state said "No loops match".

| | Before | After |
|---|---|---|
| `GET /fleet/heatmap` default / cap | 100 / 300 | **500 / 2,000** |
| response | `count`, `loops[]` | + **`total`** (monitored loops in scope) and **`truncated`** |
| client request | default (100) | asks for the whole allowance (`limit=2000`) |
| matrix footer shortfall | measured against the registry total from the summary | against the heatmap's own `total` |
| search miss on a truncated payload | "No loops match" | says the loop may be beyond the N loaded and to narrow the scope |

Files: `cplm-api/Controllers/CpmFleetController.cs`, `frontend-ob/src/api/cpmApi.ts`,
`components/Cpm/CpmPerformance.tsx`, `components/Cpm/GateMatrix.tsx`.
Cost: one extra `COUNT(*)` on the registry per (cached) heatmap call; the per-loop probes stay
~0.1 ms each, so 171 loops ≈ the same 70–130 ms as before; payload ≈ 100 KB (6 KB gzipped).

### 2. Window inspector — sub-page

`?window=<end>` now opens that window's **sub-page** instead of rendering below the list: a
header with **‹ All &lt;profile&gt; windows** (Back), "Window i of N loaded", and
**Newer / Older** icon buttons over the loaded windows; then Window results, Window metadata
(with the Historical/Trend links), Sample density + window contract, and Across window sizes.
The list is hidden while a window is open; the loop/profile toolbar stays. A `?window=` that
names no loaded row falls back to the list (it used to silently show the newest window). The
raw historian slice is now only fetched on the sub-page, not on every list render.

Files: `components/Cpm/CpmWindows.tsx` (462 → 225 lines), new `windows/WindowDetail.tsx`,
`windows/windowNav.ts`, `windows/windowMath.ts` (shared arithmetic, unchanged).

### Tests (green)

| Suite | Added | Proves |
|---|---:|---|
| `src/frontend-ob` `npm test` | `api/cpmApi.heatmap.test.ts` (1), `windows/windowNav.test.ts` (4) | the heatmap request asks for ≥ 2,000 loops; list vs sub-page resolution, Newer/Older neighbours, stale `?window=` → list |
| `tests/cplm-api.Tests` | `FleetHeatmapApiTests` (2, end to end through the lab gateway) | every monitored loop is in the payload and `total == count`, `truncated == false`; an explicit small `limit` reports `truncated == true` |

Totals: frontend 22, cplm-api 43; lint and `tsc --noEmit` clean.

### Lab verification (new images deployed)

`GET /fleet/heatmap?windowKind=24h&limit=2000` → `count 230, total 230, truncated false`,
113 KB in 0.09–0.14 s (gateway, cache miss); `PIC80140` is in the payload and a client-side
search for `pic80140` now hits it. Before: `count 100`, last loop `G13_LOOP_B`, `PIC80140` absent.

### Release — NOT built (by request)

**Services to rebuild:** `cplm-api`, `ams-frontend` (both already in the pending set from
CHG-023/024). No schema change, no ops script.

---

## Deployment checklist

Order matters: the config fix alone unblocks the fleet, so do it first and confirm before
shipping binaries.

1. ⬜ **Apply the MODE map** on each `MQTT_LOOP_SAMPLES` data source
   (`{"1":"AUT","2":"MAN","3":"CAS","4":"IMAN"}`). No deploy. **Via the API, not the wizard**
   (CHG-012: the shipped wizard deletes `loop_ingest` on save, and a hand-written
   `profileConfig` would drop the TLS `ca_cert_pem`) — read the source, merge the map into
   `profile_config.loop_ingest`, PUT the whole object back. Confirm within ~1 minute:
   `scripts/diagnose-gate-failures.sql` query 3 — `avg_auto_pct` should rise off zero, and
   tuples on `traverse.cpa.loop.samples.v1` carry `AUT`/`MAN`/`CAS` instead of `1`/`2`.
2. ⬜ **Confirm verdicts appear**: query 2 — G1 should stop being the universal failure, and
   G12–G15 should stop being `—`. Expect real diagnoses on the loops already flagging G8/G5.
3. ⬜ **Rebuild + deploy `traverse-ingestion-service`** (CHG-001/002/003/010).
   After it comes up, confirm the effective map in the log
   (`effective param_roles … VP→vp`) or `GET /api/ingestion/stats` → `paramRoles.VP == "vp"`.
   If a prod data source carries an explicit `param_roles`, leave it: it is now an overlay and
   VP comes from the built-ins. No `param_roles` edit is needed for VP.
   Beware the compose rename: prod may still run a container created as `ingestion-service`
   while compose now declares `traverse-ingestion-service`; if `compose up` reports a name
   conflict, `docker rm -f traverse-ingestion-service` first (~30 s ingestion pause, QoS-1
   persistent session covers it).
4. ⬜ **Rebuild + deploy `cplm-api`** (CHG-004 API half).
5. ⬜ **Build and deploy the Flink jar** (CHG-004 engine half). Inert until PV ranges are
   declared, so it can follow at a quieter moment — but do it in this exact order, because a
   restart alone deploys nothing (CHG-008):
   1. `mvn -B -Dmaven.test.skip=true package` — **not** `-DskipTests`, which fails after
      `clean` has removed the old jar.
   2. Rebuild the `ams-flink` image so `/opt/flink/usrlib` carries the new jar.
   3. **Cancel** the three CPLM jobs (`PATCH /jobs/<id>?mode=cancel`) and wait for CANCELED.
   4. Resubmit (`compose up flink-job-submit-cplm`), then confirm each job's start time moved.
6. ⬜ **Investigate the four `INSUFFICIENT DATA` loops** (FIC10403/10404/10501/10503) — a
   data-cadence question, not a gate one.
7. ⬜ **Rebuild + deploy the frontend** (CHG-006 UI half + CHG-012 + CHG-013). Until this
   lands, nobody may edit an `MQTT_LOOP_SAMPLES` source in the wizard — a save re-deletes
   `loop_ingest`, including the map restored in step 1. Once it lands, the card's new **Loop
   ingest** panel shows the MODE map and can edit it, so step 1's script becomes the bulk
   path rather than the only one.
8. ⬜ **Rebuild + deploy `historian-bff`** (CHG-009). Independent of every step above and of
   the frontend — it unblocks the Evidence Replay raw-slice trends on its own. Confirm a
   replay raw read answers 200 rather than 500:
   `GET /api/hist/raw/cursor?series=root.site1.cpm.<loop>&start=…&end=…&maxCount=10000&measurements=pv,sp,op`
   → `count: 9999`, `hasMore: true`, non-null `nextCursor`.
9. ⬜ **Onboard the 14 unregistered CPA loops** (CHG-011) — `cpm-01-onboard-missing-loops.sql`
   in pgAdmin against `traverse_cplm`. They park at `hdpe/unassigned/unassigned`; relocate each
   once the plant confirms its unit.
10. ⬜ **Load the engineering ranges** (CHG-011) — `cpm-02-load-engineering-ranges.sql`. Run
    once with `COMMIT` changed to `ROLLBACK` and read the Messages tab first: confirm
    `TIC10704` (OP 3..5) and `TIC30304` (OP 100..155) against the DCS. A wrong OP range blocks
    the diagnosis outright — worse than leaving it undeclared.
11. ⬜ **Republish evidence** for every touched loop
    (`POST /api/v1/cpm/loops/{loopId}/republish-evidence`) — **mandatory, not optional**: it is
    the only thing that projects the 14 loops' signal assets into the UNS tree *and* tells Flink
    any of the ranges exist. Without it both scripts are invisible to the engine.
    Then confirm `good_error_pct` moves on one loop from report 4 before trusting the fleet.
    Expect G3 to move PASS → WARN on some loops: 52 get a *tighter* band than today.
12. ⬜ *(when OT wires positioner feedback — data task)* Map each loop's `VP` role (wizard
    "Valve position", worksheet `vp_ot_tag`, or the `tags` array). Ingestion needs nothing if
    the leaf is `VP`; otherwise one overlay entry per data source, e.g.
    `"param_roles": { "POS": "vp" }` — **never** resend the whole map, and never `null` a
    primary (`PV/SP/OP/MODE`) — the API refuses it with 400. Confirm with
    `unknown-sources` (no `UNKNOWN_PARAMETER … |VP`) and a tuple carrying `vp` on
    `traverse.cpa.loop.samples.v1`. G14 flips to `CONFIRMED_CAPABLE` on the next long window.

**Rollback:** every code change is additive and defaults to prior behaviour — CHG-004
reproduces the old constant exactly when no PV range is declared, CHG-003 only adds
warnings, and CHG-010 only widens the built-in map and turns a fleet-blackout save into a 400. The one behavioural change that cannot be reverted by config is CHG-001's
process-time stamping; reverting it means redeploying the previous ingestion image.
CHG-009 only lowers a request cap by one row — reverting it simply restores the 500.

---

## Release v3 — what to build and run

Prod runs **v2** (the `b0a4d98` ingestion image and older everything else). v3 is this whole
tracker. Nothing here needs a schema change, so `migration/schema/*` and steps 00–05 are
untouched.

**Updated services (build these, nothing else):**

| Compose service | Image | Carries |
|---|---|---|
| `traverse-ingestion-service` | `ams-cpa-traverse-ingestion-service` | CHG-001, 002, 003, **010** |
| `cplm-api` | `ams-cpa-cplm-api` | CHG-004 (API half), 006 (read path) |
| `historian-bff` | `ams-cpa-historian-bff` | CHG-009 |
| `flink-jobmanager` (+ taskmanager, same image) | `ams-flink:1.0-SNAPSHOT` + the JAR file | CHG-004 (engine half) |
| `ams-frontend` | `ams-cpa-ams-frontend` | CHG-006 (UI half), CHG-009 comment, **CHG-012**, **CHG-013** |

Unchanged and **not** rebuilt: gateway, auth, asset-model, binding-resolver, audit-service,
sparkplug-edge-node, ams-api.

**Scripts to run — build box (in this order):**

```powershell
# 0. commit first: bundles ship `git archive HEAD` (UPDATE-RUNBOOK rule 2)
git status --short                                             # must be empty

# 1. prove the change set on the lab before building anything for the plant
dotnet test tests/ingestion-service.Tests                      # 134/134
.\scripts\test-ot-loop-ingestion-e2e.ps1                       # 23/23, ~15 min, needs run-all.ps1 stack

# 2. build + verify + save exactly the v3 set (jar with -Dmaven.test.skip=true, PROD
#    fingerprints, one .tar.gz per image written by Python, SHA256SUMS, VM-STEPS.md)
python migration/deploy/build-release.py --release v3 --dry-run   # read the plan
python migration/deploy/build-release.py --release v3             # → release-out/v3-<date>/
```

The manifest is `migration/deploy/releases/v3.txt`; `--only <service>` narrows a re-run.

**Scripts to run — plant VM:** the generated `release-out/v3-<date>/VM-STEPS.md`, which is
UPDATE-RUNBOOK §1 for each image plus the Flink special case, in order: `sha256sum -c`,
rollback point, `docker load` ×5, copy the JAR, `docker rm -f` the Flink JM/TM,
`deploy.sh --prod`, then **cancel + resubmit the three CPLM jobs** (CHG-008 §1), then
`deploy.sh --prod` again for the remaining containers. Do the
[Deployment checklist](#deployment-checklist) config steps 1–2 **before** any of it.

**Post-deploy proof (VM):** `scripts/diagnose-gate-failures.sql` queries 2–3 (G1 no longer
universal, `avg_auto_pct` off zero), the CHG-009 cursor URL answering 200/9999/`hasMore`, and
`/api/ingestion/stats` showing `paramRoles.VP == "vp"` on every `MQTT_LOOP_SAMPLES` source.

---

## Release v2.4 — what to build and run

Prod runs v3 + v2.3. v2.4 (the release formerly drafted as "v6") carries **CHG-023, CHG-024 and CHG-025** (the CPM Overview /
Performance read-path fix, the batch APIs, the matrix-search fix and the Window inspector
sub-page). Additive indexes, applied online before the swap. Step-by-step:
[migration/V2.4-DEPLOY.md](migration/V2.4-DEPLOY.md).

**Updated services (build these, nothing else) — manifest `migration/deploy/releases/v2.4.txt`:**

| Compose service | Image | Carries |
|---|---|---|
| `cplm-api` | `ams-cpa-cplm-api` | CHG-023: fleet/gates-latest/calculations per-loop index probes, 15 s single-flight cache, batched registry list, concurrent + cached pipeline-metrics, self-heal DDL for the three indexes · CHG-024: readiness → one resolver batch call, `POST /loops/bulk-republish-evidence`, `GET /loops/{id}/kpis/latest` · CHG-025: heatmap default 500 / cap 2,000 with `total` + `truncated` |
| `ams-frontend` | `ams-cpa-ams-frontend` | CHG-023: bad-actor list derived from the page ranking, nginx gzip · CHG-024: Windows comparator one request, Governance matrix one request · CHG-025: heatmap asks for the whole fleet, matrix says when truncated, Window inspector sub-page (Back / Newer / Older) |
| `historian-bff` | `ams-cpa-historian-bff` | CHG-023: `/snapshot` concurrent Redis reads + dead-device pruning |
| `binding-resolver` | `ams-cpa-binding-resolver` | CHG-024: `/resolve/batch` resolves every path with one asset-model `by-paths` call |
| `traverse-auth-service` | `ams-cpa-traverse-auth-service` | CHG-024: `GET /api/auth/roles?include=permissions` |

Unchanged and **not** rebuilt: gateway, asset-model, audit-service, sparkplug-edge-node,
ams-api, ingestion-service, Flink (no jar change, **no job resubmission**).

**Scripts to run — build box (in this order):**

```powershell
git status --short                                             # must be empty (bundles ship git archive HEAD)
dotnet test tests/cplm-api.Tests                               # 43/43 — needs the lab Postgres (run-all.ps1); ~7 min
dotnet test tests/binding-resolver.Tests                       # 5/5
docker run --rm -d --name snaptest-redis -p 6390:6379 redis:7.2-alpine
dotnet test tests/historian-bff.Tests                          # 4/4
docker rm -f snaptest-redis
cd src/frontend-ob; npm test; npm run lint; npm run build; cd ..\..   # 22/22, lint clean, tsc clean
cd src/services/auth-service; npx tsc --noEmit; cd ..\..\..
python migration/deploy/build-release.py --release v2.4 --dry-run
python migration/deploy/build-release.py --release v2.4             # → release-out/v2.4-<date>/ (5 images + ops/)
```

The manifest is `migration/deploy/releases/v2.4.txt`. `ops/` now also carries
`cpm-04-fleet-latest-indexes.sql` (run **before** the cplm-api swap),
`cpm-05-gate-results-retention-check.sql` (read-only, retention decision) and
`cpm-06-fleet-perf-probe.sql` (BEFORE/AFTER proof).

**Test proof before building (all currently green):** cplm-api 43, binding-resolver 5,
historian-bff 4, frontend 22; `npm run lint`, frontend and auth-service `tsc --noEmit` clean.

**Scripts to run — plant VM:** [migration/V2.4-DEPLOY.md](migration/V2.4-DEPLOY.md) §C, in order:
`sha256sum -c`, rollback point, cpm-06 (BEFORE), **cpm-04**, `docker load` ×5, `deploy.sh --prod`,
consumer-group check, cpm-06 (AFTER), the curl timings.

**Config knobs (env, optional):** `Cpm__FleetCacheSeconds` (default 15, 0 disables),
`Cpm__PipelineMetricsCacheSeconds` (default 10).

---

## Release v2.5 — what to build and run

Prod runs v3 + v2.3 + v2.4. v2.5 is the spec v6 set: **CHG-026** (qualification and safe semantics,
Instrumental NE107 health), **CHG-027** (G12 system response, the evidence workbench, G13 aligned
interaction, the loop model) and **CHG-028** (governed gate configuration). Additive schema applied
before the swap, eight new Kafka topics created before the jobs start, every CPLM job resubmitted plus
three new jobs, one configuration step per loop data source. Step by step:
[migration/V2.5-DEPLOY.md](migration/V2.5-DEPLOY.md). A plain-words tour of what the release adds, where it
is in the UI, how to try it on the lab and what the OT side must send: [WHATS-NEW-v2.5.md](WHATS-NEW-v2.5.md).

**Pre-production review (2026-09-25):** [docs/pre-prod/v2.5-pre-prod-readiness.md](docs/pre-prod/v2.5-pre-prod-readiness.md)
(baseline, delta, the gaps found in the plant procedure - source sync, ownership normalization, TM metaspace, validator
job list, topic counts - what operators will see, go / no-go) and
[docs/pre-prod/v2.5-ot-instrumental-requests.md](docs/pre-prod/v2.5-ot-instrumental-requests.md) (the MUST / SHOULD /
OPTIONAL requests to the OT gateway team and to Instrumental, and how a transmitter is mapped to a loop).

**CPA navigation and UI repair (2026-09-20, [CHG-030](#chg-030--cpa-navigation-and-ui-repair-overview-performance-explorer-historical-all-trends-events-system-response-2026-09-20)):**
`ams-frontend` only - context-carrying `ObcButton` navigation on Overview / Performance / Explorer / Historical /
Events / System Response, drag-rectangle zoom on every trend, clock-derived shelf state, contained Response layout.
No API, schema, topic or job change; same image, same manifest. Browser passes for Phases 5-7 are still owed
(the lab Docker engine went down, C: full).

**Episode shelving lifecycle (2026-09-20, [CHG-032](#chg-032--episode-shelving-as-its-own-lifecycle-shelve--update--unshelve--expiry--history-2026-09-20)):**
`cplm-api` (three new routes, the expiry sweeper, the action history) + `ams-frontend` (Review and shelf
section, Unshelve, History). **One new plant step:** `ops/cpm-09-event-shelving.sql` on `traverse_cplm` before
the cplm-api swap (additive, converts legacy `ack_state = SHELVED` rows; re-runnable) — already in C1 of
`V2.5-DEPLOY.md` and in `build-release.py`'s ops list.

**Phase 4.2 verification, 2026-09-17 10:43–10:52, clean tree at 1cc8a8b4:** Flink 266 run / 0 failures / 2 skipped ·
cplm-api 159/159 · ingestion 212/212 · binding-resolver 5/5 · historian-bff 4/4 · frontend 101/101 + lint + build
clean · auth-service `tsc` clean · simulators 17/17 · catalogue 165 properties, 4 copies identical. The five images
(`traverse-ingestion-service`, `cplm-api`, `historian-bff`, `ams-frontend`, `traverse-auth-service`) were rebuilt
from that commit with `SOURCE_COMMIT` and recreated on the lab (all healthy; `/capabilities` service commit =
1cc8a8b4, six engine workers on jar 4ea1da78). Still to run, after the user's manual test tour (they kill
cplm-api, stop Postgres and restart jobs): `test-cpm-v25-reliability.ps1`, `cpm-v25-load-probe.py --minutes 30`
(→ `docs/next-release/04-load-report.md`). **The bundle is NOT built and the tag is NOT set yet** -
`build-release.py --release v2.5` runs after the tour, from a clean tree.

**Evidence Workbench redesign (2026-09-17, after the rendered frontend audit — `docs/next-release/05-frontend-audit-2026-09-17.md`):**
`cplm-api` gains the KPI rows' run identity, `GET /loops/{id}/gates?projection=summary`, `POST /method-runs/evidence/batch`
and `GET /method-runs/{id}/evidence/bundle` (all additive; `EvidenceApiTests`, `KpiReadsTests`, `GateMatrixProjectionTests`);
`ams-frontend` carries the redesigned workbench (`WHATS-NEW-v2.5.md` §3.5 describes the new flow). Both images are on the lab;
they are in the v2.5 manifest already, nothing else changes for the plant.

**Audit follow-up, same day (every remaining finding, `05-frontend-audit` §4.6):** `cplm-api` additionally gains
`GET /loops/{id}/gates/latest` = the NEWEST evaluated window with `lastVerdict` (`?prefer=verdict` for the old
behaviour; the heatmap row follows), `RequiredJobs` covering the three v2.5 engines (readiness), the fleet
capability wording, `GET /conditions` (fleet-wide fast conditions) and `response-events?includeCensored=false`
+ `censoredCount` - all additive, no schema change (cplm-api tests 171/171). `ams-frontend` carries the
redesigned System Response and Gate Configuration pages, the Loop Explorer loop model, the fast-conditions table
on Loop Events and the "latest is the newest window" reading everywhere (frontend tests 225/225). Same two
images, same manifest; test counts below are the current ones.

**Gate Configuration frame redesign (2026-09-18, `05-frontend-audit` §4.7):** `cplm-api` gains two additive reads -
`GET /configuration/effective/summary?site&area&unit` (what every loop in scope runs under, one read) and
`GET /configuration/drafts?projection=summary` (list rows without layers / resolved / shadow); no schema change.
`ams-frontend` carries the new page frame (scope filter + loop search at the top, overview landing, Effective /
Bundles / Editor views). Same two images, same manifest.

**Performance follow-up, same day (`03-acceptance-evidence.md`, "System Response and Gate Configuration measured"):**
`scripts/cpm-07-v25-schema.sql` (and `database/scripts/53`) gain three indexes - GIN on `method_run_ids` for
`cplm_short_feature_results` and `cplm_long_feature_results`, partial `ix_evidence_manifest_unlinked` - all
`IF NOT EXISTS`, online, minutes on a plant-sized short table; the plant applies cpm-07 before the swap exactly as
listed (no extra step). `cplm-api` probes `response_event` first and through a materialized CTE, and its minute
reconcile is bounded (was a three-minute UPDATE every minute on a lab-sized manifest table - on the plant it would
have grown with the manifests). Result: a Response event opens in 1–2.6 s instead of 15 s; nothing else changes.

**Updated services (build these, nothing else) — manifest `migration/deploy/releases/v2.5.txt`:**

| Compose service | Image | Carries |
|---|---|---|
| `traverse-ingestion-service` | `ams-cpa-traverse-ingestion-service` | CHG-026: samples schema 1.1 (`roles{}` per-role time / quality / held), protocol-specific quality decoder (UNKNOWN ≠ GOOD, non-finite → DLQ), Instrumental NE107 health subscriber → `traverse.cpa.instrument.health.v1` + DLQ |
| `cplm-api` | `ams-cpa-cplm-api` | CHG-026/027/028: identity columns + `analysis_run` + evidence store, the five new consumers (conditions, evidence, response, health, config-acks - each one member), the 25 new endpoints (`/capabilities` + config section, `/gate-catalogue`, `/method-runs`, `/evidence`, `/analysis-runs`, `/response-events`, `/models`, `/instrument-health`, `/conditions`, `/investigations`, `/configuration/*`), fusion v2 reads, episode availability vs condition, claims-only identity · **CHG-032**: episode shelving lifecycle (`/events/{id}/unshelve`, `/events/{id}/actions`, `/events/shelving-policy`, expiry sweeper; needs `ops/cpm-09-event-shelving.sql` first) · **2026-09-25 pre-prod fixes (965b72bc, e24aac9e, 52664843, d5113d6e):** `GET /events/{id}/actions` no longer throws on real history; the evidence sweeper runs per policy row in batches, indexed, and **purges** expired manifests after a 7 d grace (none were ever removed before); `GET /analysis-runs/{id}` is index-served at plant-size manifest tables (was a 30 s timeout) |
| `historian-bff` | `ams-cpa-historian-bff` | CHG-026: source / verified / emission timestamps on the live snapshot |
| `flink-jobmanager` (+ `flink-taskmanager`, same image) | `ams-flink:1.0-SNAPSHOT` | the JAR: schema 1.1 codec, strict quality, RBE quality transitions, G2/G4/G10/G11 semantics, fusion v2, run identity + evidence artifacts, G12 kernel + Response job, Condition job, Instrument Context job, G13 aligned analysis, loop model, governed bundles (signed PREPARE/APPLY, ACKs, effective selection, no static SPINE); the TM needs `CPLM_GATE_CONFIG_KEY` (compose carries it) · **2026-09-25 (90fc8d56):** the Response Engine no longer crash-loops on a re-delivered sample (a duplicate event time entered the capture ring, `close()` threw out of `processElement`, Flink restored the same state and threw again for ever - found after an hour of lab running; `ResponseCaptureEvaluatorTest`) · **2026-09-25 evening:** capability announce from an unbounded source - a restore from the checkpoint that closed the bounded announce task looped for ever on `FLINK-25920` (`AnnounceOnceSource`, two unit tests, lab restore proof); Response Engine duplicate / late-sample guard with counters and per-loop capture reset; exponential restart back-off · **2026-09-27 patches (post-release, Marun):** completeness from the declared grid (`21e4260b`); per-partition watermarks at the source with idle-marking control streams and no post-join re-assignment (`6bbfc7b2`); partition idleness 30 min (`3d6a905e`); Short job parallelism from `CPLM_SHORT_PARALLELISM` (`04b0c2ce`). Bundles `v2.5-flink-patch-20260927` (jar b4a10e54) and `v2.5-flink-patch2-20260927` (jar f7c99294), image only |
| `ams-frontend` | `ams-cpa-ams-frontend` | Governance build identity + approvals queue, transmitter health panel + lanes, events availability/condition, Evidence Workbench (17 views), System Response workspace, registry Classification step, Gate Configuration workspace · **CHG-030** CPA navigation/UI repair · **CHG-032** shelve / unshelve / history on Loop Events |
| `traverse-auth-service` | `ams-cpa-traverse-auth-service` | CHG-028 lab finding: the revocation feed floors `credentials_changed_at` (a token issued in the same second as a credential change read as revoked) |
| `gateway` | `ams-cpa-gateway` | 2026-09-17 lab finding: the rate limiter failed CLOSED on a Redis timeout and token refresh was a "mutation" - one 1 s Redis stall logged every user out and held every request ~7 s. Now a `session` class (fail-open), one bounded Redis round trip, a circuit breaker with in-process counters (fail-closed = enforced locally), `GET /gw/ratelimit`, `X-RateLimit-Source`; `docs/api-gateway.md` §3; proofs `scripts/test-gateway-redis-outage.ps1` (Pause / Stop, 9/9 each), `scripts/validation/gw-redis-stall-load.mjs`, `scripts/validation/ui-refresh-resilience.mjs` |

Unchanged and **not** rebuilt: asset-model, binding-resolver, audit-service, display-service,
template-service, analysis-service, notification-service, sparkplug-edge-node, ams-api.

**Scripts to run — build box (in this order):**

```powershell
git status --short                                                   # must be empty (bundles ship git archive HEAD)
python scripts/gen-property-catalogue.py --check                     # the four catalogue copies are identical
docker run --rm -v "D:\HMI_Project_Usama\AMS-open\src\flink:/build" -v "$env:USERPROFILE\.m2:/root/.m2" -w /build maven:3.9-eclipse-temurin-11 mvn -q -o test   # 0 failures
python -m pytest migration/deploy -q                                 # 13 - release tooling: source archive (LF), VM step order, numbers
dotnet test tests/ingestion-service.Tests                            # 212
dotnet test tests/cplm-api.Tests                                     # 191 (lab Postgres on 5433; the 3 FleetLatestSql ranking oracles need a QUIET feed - two non-atomic reads)
dotnet test tests/binding-resolver.Tests
dotnet test tests/gateway.Tests                                      # 17 (no lab needed)
docker run --rm -d --name snaptest-redis -p 6390:6379 redis:7.2-alpine; dotnet test tests/historian-bff.Tests; docker rm -f snaptest-redis
cd src/frontend-ob; npm test; npm run lint; npm run build; cd ..\..    # 225, lint + build clean
cd src/services/auth-service; npx tsc --noEmit; cd ..\..\..
python -m pytest scripts/sim -q                                      # 17
.\run-all.ps1                                                        # then the lab proofs, each N passed / 0 failed:
.\scripts\test-ot-loop-ingestion-e2e.ps1
.\scripts\test-cpm-v25-slice1-e2e.ps1
.\scripts\test-cpm-v25-slice2-e2e.ps1
.\scripts\test-cpm-v25-slice3-e2e.ps1
.\scripts\test-cpm-v25-reliability.ps1 -LoopId FIC10405              # feed the loop >= 6 min first (an empty 1-min window reads as a gap); -Steps R3 re-runs one probe
.\scripts\test-gateway-redis-outage.ps1 -AdminPassword <pw>            # 9/9; and -Mode Stop 9/9 (pauses / stops ams-redis ~25 s)
python scripts/cpm-v25-load-probe.py --minutes 30                    # -> docs/next-release/04-load-report.md
node scripts/validation/ui-v25-audit.mjs                             # 19 pages, 0 console errors / 0 failed responses
node scripts/validation/ui-v25-shelving-zoom.mjs                     # 19/19 - CHG-032 lifecycle + CHG-030 zoom / Response layout, real clicks
# run the lab scripts one at a time on a quiet host: slice2's G12 capture censors on the source gaps a concurrent
# image build causes, and the ranking oracles compare two reads seconds apart
python migration/deploy/build-release.py --release v2.5 --dry-run
python migration/deploy/build-release.py --release v2.5 --skip-jar --out release-out/v2.5-20260925-r2   # RUN 2026-09-25 23:00 from the tagged commit (v2.5); --skip-jar ships the lab-proven jar 2dc8788aa07f
```

The manifest carries `!v25-upgrade`: `VM-STEPS.md` then emits the source-tree sync → the schema → cplm-api
stopped for cpm-07b → cpm-08 / cpm-09 → ownership normalization → topics → images → seven jobs →
signing-key proof → quality-protocol steps (`migration/deploy/test_build_release.py` pins that order). The bundle
carries `src-<commit>.tar.gz` (`git archive HEAD`, ~10 MB) beside the images since 2026-09-25 (pre-prod gap G1: the
VM's 04 / 04b / 05 scripts and both compose files are not in any image) and `ops/` gains `cpm-07-v25-schema.sql`,
`cpm-07b-v25-result-key.sql`, `cpm-08-v25-permissions.sql`, `cpm-09-event-shelving.sql`, `set-quality-protocol.py`
and `topics.txt`.

**Scripts to run — plant VM:** [migration/V2.5-DEPLOY.md](migration/V2.5-DEPLOY.md) §C, in order:
`sha256sum -c`, rollback point, `df -h`, **source tree** (`tar -xzf src-<commit>.tar.gz -C /opt/AMS-open`),
**cpm-07** (online), `docker stop traverse-cplm-api`, **cpm-07b**, **cpm-08**, **cpm-09**, `02-apply-schemas.sh`
(ownership normalization - gap G2), `04-create-kafka-topics.sh` (`ALLOW_CREATE_PREFIXED_TOPICS=yes`, 8 new topics,
15 `traverse.cpa.*`), **`04c-apply-topic-retention.sh`** (the minimum retention per consumer on the topics that already exist -
user decision 2026-09-25: samples 12 h, feature / evidence streams 6 h, record-bearing topics 3 d, live metrics 1 h),
the `retention_policy` STANDARD → 7 d step (evidence measured at 0.6-0.7 GB of chunks + ~0.4 GB of manifests per day at
161 loops), `docker load` ×7, JAR copy, `docker rm -f` JM + TM, `export START_AMS_API=yes
ALLOW_FLINK_SUBMIT=yes`, `deploy.sh --prod` (04b submits the seven jobs), the `CPLM_GATE_CONFIG_KEY` proof,
`set-quality-protocol.py --apply`, then the post-deploy proof (seven consumer groups with one member,
`/capabilities` jar + `config` section, `/gate-catalogue` 17).

**Post-deploy proof:** within the hour short windows carry `bundle_hash` / `method_run_ids` and COMPLETE
evidence manifests; Investigation shows hypotheses and the confirmation record; Evidence Workbench,
System Response and Gate Configuration appear in the navigation; health reads `NOT_CONFIGURED` for every
loop (expected until Instrumental publishes). 12 h / 24 h verdicts and G13 need up to a day.

**Config knobs (env, optional):** `Cpm__ConfigAckWindowMinutes` (5), `Cpm__ConfigProbeWindowMinutes` (5),
Flink job args `--evidence-emit ALL|EPISODES|NONE`, `--g12-delay-min-s`, `--gate-config-key`, `--site`.

---

## Release v2.6.2 — what to build and run (CHG-034 family-change debounce) — SUPERSEDED by v2.6.3, never deployed

**Updated service: `cplm-api`** (the only image; no Flink jar). Build: `python migration/deploy/build-release.py --release v2.6.2`
(manifest `migration/deploy/releases/v2.6.2.txt`). Scripts and steps at the plant, in order: extract the source archive
(the compose overlay now forwards the `Cplm__*` knobs; the daily check ships) → `ops/cpm-11-episode-debounce.sql` (online)
→ `bash migration/02-apply-schemas.sh` → image swap (`deploy.sh --prod`) → proofs (`printenv Cplm__FamilyChangeWindows`,
`FAMILY_CHANGED` closes per day falling to the tens). Details:
[CHG-034](#chg-034--episodes-no-longer-flip-with-the-fault-family-2026-10-03).

## Release v2.6.1 — what to build and run (v2.6 + Flink patch 2, one deployment)

The user's call on 2026-09-27: deploy the patch-2 jar and v2.6 together. **Updated services: `flink-jobmanager` (the
image the JobManager and TaskManager share; the jar inside it is the validated patch-2 jar f7c99294e0767ea9, shipped with
`--skip-jar`) and `cplm-api`.** Build: `python migration/deploy/build-release.py --release v2.6.1 --skip-jar` (manifest
`migration/deploy/releases/v2.6.1.txt`). The order differs from v2.6 alone in one place: the `.env` switches
(`CPLM_EVIDENCE_EMIT=episodes`, `CPLM_SHORT_PARALLELISM=4`, `CPLM_SHORT_EVIDENCE_EMIT` unset) are written in step 4a,
BEFORE step 5, because step 5 (`docker rm -f` JM + TM, `deploy.sh --prod`) resubmits all seven jobs with the new 04b;
6c then only proves (G5 and up only; `slots-available` 6; the jar in every worker's capability) - no cancel. Everything
else is the v2.6 list below: 4a overlay, 4d cpm-10a + ownership, step 5 + the cplm-api swap, 6c measurement for 24 h with
the headroom rule, 6d cpm-10b inside a stop, the cron file. Tests: the v2.6 suites plus `test_build_release.py` (25).
Plant note: [release-note-V2.6.md](release-note-V2.6.md) (v2.6.1 adds patch 2, see its top).

## Release v2.6 — what to build and run

Prod runs v2.5 (2026-09-26) plus the two Flink engine patches of 2026-09-27. v2.6 is **CHG-033** only: the
space fix after the 26 September outage. **Updated service: `cplm-api`** (the only image; no Flink jar, no
frontend). Build: `python migration/deploy/build-release.py --release v2.6` (manifest
`migration/deploy/releases/v2.6.txt`); built 2026-09-27 as `release-out/v2.6-20260927-r3` (source archive e3cc0b01, the
reviewed and fixed tree); the generated `VM-STEPS.md` carries every command with its expected output.
Production settings of record: [prod_decision.md](prod_decision.md). Scripts and steps to run at the plant, in order:

0. Extract the source archive over `/opt/AMS-open` first (`tar -xzf /tmp/v2.6/src-<commit>.tar.gz -C /opt/AMS-open`): the
   new `04b`, the cron drop-in and `stub-04b.sh` are files, not images (review finding 1 - without it the plant would
   resubmit the old 04b with short-tier evidence on).
1. `ops/cpm-10a-episode-evidence.sql` (online, additive) → `bash migration/02-apply-schemas.sh` (ownership).
2. Image swap: `bash migration/deploy/deploy.sh --prod`; `/health`; the `Evidence retention:` log line within 15 min.
3. `migration/.env`: `CPLM_EVIDENCE_EMIT=episodes` (the interim `none` goes; `CPLM_SHORT_EVIDENCE_EMIT` stays unset =
   none); `flink cancel` Short, Long and Fusion; `ALLOW_FLINK_SUBMIT=yes bash migration/04b-submit-flink-jobs.sh`;
   proof: manifests of the last 15 min are G5 and up only.
4. Measure 24 h (`select retention_class, count(*), pg_size_pretty(sum(total_bytes)) … group by 1`, the five table
   sizes, `df -h /`); headroom rule: if the plateau would come within 10 GB of full, set `GATE_RESULTS` to 14 d with
   `INSERT ... ON CONFLICT (record_class) DO UPDATE` (the row does not exist before cpm-10b; a plain UPDATE is UPDATE 0).
5. `ops/cpm-06-fleet-perf-probe.sql` (before) → `docker stop traverse-cplm-api` → `ops/cpm-10b-result-partitions.sql`
   → `docker start traverse-cplm-api` → the probe again → `relkind = p` for the three tables, DEFAULT partitions empty.
6. `sudo cp migration/cron.d/cpa-capacity /etc/cron.d/` (the prune line is gone); next day: oldest partition dropped, `df` moved.

Tests behind it: cplm-api suite on the lab (incl. the new `EvidenceClassTests`, `EpisodeCaptureTests`,
`EvidenceClassSweepTests`, `FeaturePartitionTests` on a throwaway plain database), `python -m pytest migration/deploy`
(18), `bash migration/deploy/stub-04b.sh` (the Short job's argument order). Details:
[CHG-033](#chg-033--bounded-evidence-and-partitioned-result-tables-the-marun-space-fix-2026-09-27).
Plant note: [release-note-V2.6.md](release-note-V2.6.md). Progress: [checklist.md](checklist.md) "CHG-033 / v2.6".

## Risks & pre-existing issues

- ~~**The CPLM Flink test suite does not compile**~~ — resolved in the v2.5 work: the suite runs
  (`mvn -o test` 269 run / 0 failures / 2 skipped on 2026-09-25 after 888e1963; an earlier "534 / 4" figure was one run counted twice) and every engine change since is
  covered; CHG-004's ⚠️ stands only for its own missing test.
- **G3 stays WARN on temperature loops until PV ranges are declared.** Expected, not a
  regression: CHG-004 only supplies the mechanism.
- ~~**`LIC10601` reports OP = 235.58 %**~~ — **resolved by CHG-011**: the loop's declared OP
  range is 0–300, so this was never bad data. Loading the range fixes saturation and G2r.
- **Evidence Replay shows 58 % of a 24 h window** (first page only, 9 999 of ~17 222 samples),
  labelled by a truncation note. Pre-existing and documented in the code; CHG-009 fixed the
  500 that hid it, and did not change the paging. See CHG-009.
- **Numeric `quality` is still ignored** (`OtPayloadParser` reads the field only when it is a
  JSON string, defaulting to `GOOD`). Harmless while the gateway sends `"GOOD"`; a silent
  integrity risk if it ever sends OPC integers. Deliberately deferred — see review flag 24.
- **G14 / VP is proven to Kafka + IoTDB, not through Flink.** The G14 flip lives on the
  long-diagnostics window, so no lab run under an hour can show it and the Flink suite cannot
  run. The Flink VP path is unchanged code; first proof on the plant is the first long window
  after a loop with a mapped, published VP.
- **Evidence Replay does not draw `vp`** (`CpmReplay.tsx` asks the historian for `pv,sp,op`).
  The rows are there (`count(vp)` > 0). A one-line measurement-list change plus a series;
  left out of CHG-010 because it is a UI feature, not part of the data path.


## CHG-027 ✅ v2.5 Slice 2 — G12 system response, evidence workbench, G13 interaction, loop model (spec v6 Phase 2)

**Reported (spec v6, audited against the code on 2026-09-16 — `docs/next-release/01-audit-vs-code.md`):**
G12 was a boolean "step test approved" flag (R01); per-gate evidence was scalars only and the
UI drew eight generic charts from summaries (R12); the evidence drawer opened "latest" instead of
the run a cell IS (R13); PV and OP shared one axis (R14); G13 was a boolean "has peer links" that
lifted a gate to PASS and fired the disturbance soft-block from the mere existence of a link (R09);
the loop's class was derived from its tag prefix on the client (R25) and nothing declared what the
data source can resolve (R05). Phase 2 closes R01, R05, R09, R12, R13, R14, R24 and R25.

### What changed

| Area | Before (audited at `5cec34ef`) | After |
|---|---|---|
| G12 kernel (`com.ams.flink.cplm.response.*`, commons-math3) | boolean flag → PASS / `NO_STEP_TEST` | model bank (FOPDT / SOPDT / SO_UNDERDAMPED / IPDT / INTEGRATOR_LAG) with exact ZOH simulators (Padé `expm`, fractional delay, gap policy); observed metrics with named censoring (robust endpoints, sustained crossings on the observed grid, exact ITAE, settling from band entry, qualified peaks, Theil-Sen slopes); safe event triggering + capture state machine (`SUPERSEDED_BY_EVENT`, `MODE_TRANSFER`, `HEALTH_INELIGIBLE`, `CAPTURE_MAX`, `BUDGET_EXCEEDED`); bounded output-error estimator with delay profile, integrating adapter (no static Kp), closed-loop PEM that abstains (`NO_EXCITATION`, `AMBIGUOUS_MODELS`); holdout validation (free-run vs one-step), covariance / profile-likelihood / block-bootstrap uncertainty, controller form adapters, model-domain frequency response, SIMC advisory (never applied); `G12Result` with the 52 catalogue quantities `{value|null, unit, path, uncertainty, method, support, config_hash, reason_if_null}` |
| `CplmResponseAnalysisJob` | — | event-time capture per loop (a stale held VP is not the applied input; a gap restarts the ring), bounded fits, results on `traverse.cpa.clpm.response.results.v1`, evidence on the evidence topic; lab-proven: COMPLETE `INPUT_TEST` events with Kp 3.000, τ 20.00 s, θ 2.7 ± 2.5 s; a second event VALIDATED against the first (validation RMSE 0.36, prediction RMSE 0.23) |
| cplm-api response | — | `analytics.response_event` / `response_metric` / `system_model` / `model_validation`, `cpm.controller_snapshot`, `cpm.loop_objective_version` (55); verbatim consumer `traverse-cpa-cplm-response`; `GET /loops/{id}/response-events` (rejected and censored listed, cursor-paged), `GET /response-events/{id}` (subgates A–H + quantities), `GET /loops/{id}/models?at` (as-of, never "latest"), `POST /models/{id}/review` (server-owned, If-Match, audited, perm `cpm.model.review`) |
| exact intermediates (G0–G11, G13–G15) | scalars | every gate emits its arrays with the workbook's field names through `EvidenceArtifact` (named columns, coded columns with legends, masks): G0 per-role qualification, G1 authority intervals, G2 events, G2r region, G3 error + cumulative integrals, G4 activity, G5 full ACF + crossings, **G6 Welch PSD in signal²/Hz whose segment follows the declared band**, G7 every cycle fit incl. rejected, G8 lag structure (`XCORR_ASYMMETRY_V1`; bicoherence stated NOT_INSTALLED), G9 polygons / corners, G10 limits + dwell episodes, G11 measurement + freeze episodes + NE107 lanes, G14 confirmation record, G15 decision record (argmax form). `EvidencePolicy --evidence-emit` (EPISODES default, ALL, NONE); replay mode `EVIDENCE_RECONSTRUCTION` applies the registry parameter set so a reconstructed run carries the original identity |
| evidence API | `/method-runs/{id}` only | manifests with `ETag` / 304, `GET /evidence/{id}/chunks/{n}` immutable bytes (sha ETag, site scope), readiness `PENDING/COMPLETE/FAILED/EXPIRED/PARTIAL`, `POST /analysis-runs {purpose: EVIDENCE_RECONSTRUCTION}` → ATTACHED under the original run; EXPIRED manifests revive on re-delivery; the JobManager client is a plain long-lived `HttpClient` (the resilience handler cut uploads at 10 s) |
| catalogue + investigations | static `GATE_ROLES` in three UI files; notes on acknowledge | `GET /gate-catalogue` (17 entries once incl. G2r, installed method/version, artifact kinds, capability state); `analytics.investigation_reference` (56) — `POST /investigations` pins evidence, outcome `WORK_COMPLETED / PERFORMANCE_RESTORED / INCONCLUSIVE` set explicitly (default INCONCLUSIVE) |
| evidence workbench (UI) | 8 generic charts; drawer on "latest"; mixed axes | `CpmChart` (one axis per unit group, `connectNulls:false`, stepped holds, bands named with their meaning, site zone, data table + CSV); `GateResultState` (9 stated states, never an empty chart); artifact codec (gzip + SHA-256 verified before anything draws); `GateEvidenceWorkspace` from an **immutable URL selection** (`/cpm/evidence?loop=&methodRun=&gate=`), signal context lanes, method trace from the run; 17 gate views on the exact artifacts; heatmap / gates cells carry `methodRunId`; historical + replay charts split by unit group with the site zone; `ResponseWorkspace` (`/cpm/response?loop=&event=`): events incl. rejected/censored, labelled prediction band, response-time markers, residuals + ACF, candidate models + delay objective curve + parameter intervals, Bode only when the kernel wrote it, model history as interval markers (no line), server-owned review; `styles/cpm-evidence.css` layout from OpenBridge tokens |
| G13 | boolean link flag; link ⇒ PASS and soft-block | `InteractionMath` on the long tier: peers' samples fanned out to the loops that list them (registry `cplm.loop.evidence` broadcast, reverse-indexed, keyed under the loop), nearest-sample alignment with a shared support mask, normalised cross-correlation over ±`g13LagMaxS`, Welch coherence in the loop's band; a peer is associated only when both floors clear on enough support; `INTERACTION_DETECTED → WARN` + soft-block, `NO_INTERACTION → PASS`, `UNAVAILABLE / NOT_CONFIGURED → NOT_EVALUATED` with the reason; the fused row shares the long tier's G13 run id (evidence: `interaction` record + per-peer `aligned_series` / `cross_correlation` / `coherence`); a long row without the analysis is `LEGACY_FLAG_ONLY` and drives nothing; G13 view with force graph ("graph relation is not proof"), lag / coherence panes, propagation table |
| loop model (registry) | `loop_type` CHECK + client `dynamicClassOf` | `cpm.loop_registry` gains `service_family`, `dynamic_class`, `objective_type`, `topology`, `command_path`, `acquisition{}`, `classification_source` (57); a `loop_type` only suggests a preset (`PRESET_FROM_LOOP_TYPE`), an explicit value is `EXPLICIT` and no later preset (single or bulk) overwrites it; validation names the field; `GET /registry-contract` lists the enums + presets; broadcast `cplm.loop.model` → Flink profile resolution (explicit class/objective override the pack; `DynamicClass` gains `INTEGRATING_LAG`, `UNDERDAMPED`, `UNKNOWN`); `MethodEligibility`: declared (else observed) grid vs the fastest period → G5/G6/G12 `LIMITED:BANDWIDTH` on the long + fused rows and the gate cells (NR-016); RBE holds are `RBE_HOLD` in G0 (NR-019); wizard `ClassificationStep` (five explicit selects, preset shown, typed acquisition); registry list / aside show the stored model with its source; `CpmLoopRegistryService` split into partial files |

Commits (branch `feat/v25-next-release`, tests first): 2A `f3a91c84` `33e167a7` `fbb2e8df` `ae226715` `1b0c6087` `79305f58` ·
2B `3599d519` `01e8122a` `81baa69c` `14c3cff1` `9bca728c` · 2C `c0e672dd` `dfc75202` `19727d1d` `f83688d6` `38f42e73` `8dd09e33` `a7d7b2a7` `117a9622` ·
2D `a5cdf73c` `7af35971` · 2E `8ec77afb` `f909830e` `5c986106` `f5f4d20a` `7854ebb1` `c73ef24d` `c00629e9` ·
2F `47dfbaa0` `a8d6df4e` `43b83a25` `22e56fa5` · 2G `1e7d2b8b` `910c5b93` `48695ba8` `52b4d4a6` `459bec7e` · 2G.2 (this entry).

### Migration and service update (facts the v2.5 release manifest carries; Phase 4 packages them)

| Step | What | Notes |
|---|---|---|
| SQL | `scripts/cpm-07-v25-schema.sql` on `traverse_cplm` now also carries 55 (response), 56 (investigations), 57 (loop model dimensions) | additive, idempotent, before the image swap; `migration/schema/03-traverse_cplm.sql` mirrors all of it for a fresh plant |
| Kafka | `traverse.cpa.clpm.response.results.v1` (new, 8 partitions, delete 30 d) | in `migration/kafka/topics.txt` / `scripts/kafka-reset-lab-topics.ps1`; **create before the jobs start** |
| Flink | jar rebuilt; the three CPLM jobs + Condition + Instrument Context are CANCELLED AND RESUBMITTED (the long job's operator chain changed: peer fan-out + peer buffer state, so no savepoint restore across this release); the NEW job `AMS - CPLM Response Engine` is submitted (`migration/04b-submit-flink-jobs.sh`, `migration/flink/JOBS.md`); optional job args `--evidence-emit ALL|EPISODES|NONE`, `--g12-delay-min-s` | check `docker logs ams-flink-job-supervisor` for `ClassNotFoundException`, `/jobs/overview` for RESTARTING; the TaskManager needs metaspace ≥ 512m for bounded replay submissions (see Risks) |
| Images | `cplm-api`, `ams-frontend`, the Flink image | `traverse-ingestion-service` unchanged since CHG-026; `ams-api`, gateway, the other Traverse services: unchanged |
| Config | every loop keeps its `loop_type` preset until a person declares the model in the wizard (Classification step) — `classification_source` tells which; peers come from `cpm.loop_link` (asset relationships or manual) and reach the long job through the registry broadcast (`republish-evidence` after linking) | G12 events need `u_applied`: VP fresh (`vpMaxAgeS`) or OP on `OP_TO_VALVE`; `--g12-delay-min-s` declares the smallest dead time the site needs resolved (0 = no bandwidth claim) |
| Consumer groups | + `traverse-cpa-cplm-response` | one member; listed on cplm-api `/health` |
| Permissions | `cpm.model.review` (review a system model), `cpm.analysis.create` (reconstruction / replay) | already in `cpm-08-v25-permissions.sql` (Phase 1) |

### Verification (lab, 2026-09-17)

- Unit (at 2G.2 close, 2026-09-17): Flink `mvn test` **264 run / 0 failures / 2 skipped**; cplm-api **159/159** (lab DB); frontend vitest **101/101**, `npm run lint` clean, `tsc` clean.
- 2B lab proof (jar `2a6dd18a…`): COMPLETE `INPUT_TEST` events (Kp 3.000, τ 20.00 s, θ 2.7 ± 2.5 s, settle 80.1 s, 12 artifacts); second event VALIDATED (validation RMSE 0.36, prediction RMSE 0.23, fit improvement 0.97).
- 2C lab proof: short-tier manifests COMPLETE; `/method-runs/{id}/evidence` ETag / 304; chunk bytes decoded to 61 × 6 columns; reconstruction under the original identity; retention cycle EXPIRED → reconstruct → ATTACHED / COMPLETE; G12 reconstruction refused 422.
- `scripts/test-cpm-v25-slice2-e2e.ps1` (new, 19 steps): **19 passed, 0 failed** at 04:45 on jar `4ea1da78…` (the fused-identity
  fix) - catalogue 17 once; schema 55/56/57; registry contract + an EXPLICIT LIC model surviving a preset re-activation; the
  running jar observed on results; G13 as the aligned analysis on the newest fused row with the API cell matching its own
  window; bandwidth eligibility on the long + fused rows; G5 `acf_series` / G6 `psd` on a COMPLETE manifest; the G13 evidence
  record under the long tier's run id shared with the fused row; a COMPLETE `INPUT_TEST` event (Kp 3.000); **NR-007: the second
  step censored the first (`SUPERSEDED_BY_EVENT`) and opened a second on the running job**; manifest ETag / 304 and chunk sha;
  `/method-runs` resolves the newest run's id (a pre-1G verdict-aware "latest" cell states null, never a made-up id);
  investigation outcome; SPA routes. Earlier runs on the cold lab found four defects fixed in this set (see the findings above
  and 6bdcfd78, 95f25b74, 770e3315, d0003ba5).
- `scripts/sim/loop_step_sim.py` gains `interrupted-step` (NR-007: a second step 30 s after the first).
- Lab findings while proving Slice 2 (all fixed in this set): the no-watermark control stream held every long-job timer
  (ea8ed2c7, `LongJobTopologyTest`); an EXCLUDED fused window (cold 24 h, G0 FAIL) read G13 as `LEGACY_FLAG_ONLY` as if an
  old jar had produced it, and carried an empty `method_eligibility` - the long tier's G13 identity and the grid's
  eligibility now ride every fused row (6bdcfd78, 95f25b74); **the streaming capture never looked for a second step while
  one was open** (the machine's SUPERSEDED_BY_EVENT path was only ever driven by its own unit test), so the interrupted-step
  scenario read COMPLETE on the lab - a sustained change of the open event's driving signal now supersedes it and the second
  event carries the whole input sequence (NR-007, `ResponseCaptureEvaluatorTest`); **the fusion job selected no bundle** (no site on
  the long result) while the long job had, so the two tiers computed different method run ids for one window - the long
  result now carries `site`, the fused row inherits the long tier's bundle identity and flags a divergence
  `BUNDLE_MISMATCH_FUSION` instead of forking the ids (d0003ba5, `ResultIdentityTest`).

### Risks and deliberate limits

- **Release blocker (Phase 4):** bounded replay / reconstruction submissions leak TaskManager metaspace (one user-code classloader per REST submission); the lab TM died of `OutOfMemoryError: Metaspace` at 256m. Lab compose runs 512m; find the leak or bound submissions per TM lifetime before v2.5 ships.
- Bounded replay evaluates G13 without peers (the replay source is one loop): a reconstructed long run reads `LEGACY_FLAG_ONLY` for G13 while its other gates reconstruct exactly.
- The G12 bandwidth claim needs `--g12-delay-min-s` > 0; unset, subgate A reports `NOT_ASSESSED` for bandwidth (the long tier's `method_eligibility` still bounds G5/G6/G12 from the profile's fastest period).
- Model promotion (VALIDATED → ACTIVE_BASELINE) is a person's review; the kernel never promotes.
- Objective types `RATIO / RAMP / BATCH / SUPERVISORY` are stored and displayed but map to no engine objective yet (the pack's objective stays).

## CHG-028 ✅ v2.5 Slice 3 — governed gate configuration (spec v6 Phase 3)

**Reported (spec v6, audited against the code on 2026-09-16 — `docs/next-release/01-audit-vs-code.md`):**
the only configuration surface was a free-text `thresholdProfileId` and a fire-and-forget metadata
broadcast (R16); Flink hydrated profiles from a process-wide static map (`SPINE`) fed by a broadcast
whose parse failures were swallowed, with a per-field overlay on the class pack and the canonical
topic gated off (R17); windows and estimator settings were compiled in with no change-class model,
so nothing distinguished a hot policy change from one that needs a build (R18). Phase 3 closes
R16, R17 and R18 (capacity declaration + validation; the bounded keyed scheduler stays a later
deployment, as spec §5.2 allows).

### What changed

| Area | Before (audited at `5cec34ef`) | After |
|---|---|---|
| catalogue as code (3A.1) | ~45 parser fields, G4 3/8 hardcoded, no typed inventory | `contracts/gate-config/v1/property-catalogue.json`: the 165 properties of the spec sheet (`CFG-001…165`) generated by `scripts/gen-property-catalogue.py` with type, unit, default (null = commissioning required), validation, change class, consumers, dependencies; ONE `catalogue_hash` (SHA-256 of the canonical document) carried by cplm-api (embedded), the jar (resource) and the UI (generated types); `--check` fails when any copy drifts |
| capability from the running jobs (3A.2) | version strings | `BundleProfileMapper` is the only table property → engine setting; `PropertyReaders` per job; every job announces a `CAPABILITY` record on `traverse.cpa.context.gate-config.acks.v1` at start (readable ids, catalogue hash, jar, compiled `ExecutionPlanCapacity`); `unsupported-in-build.json` names the 78 catalogue properties no job reads and why (`CapabilityCoverageTest` fails the build otherwise); `GET /capabilities.config` is what the RUNNING jobs announced: readable ids per job, not-read properties, mixed jars, `CATALOGUE_MISMATCH` stated |
| store + pure library (3B.1 / 3B.2) | — | schema 58 (`cpm.gate_config_bundle`, `gate_config_layer`, `config_approval`, `config_deployment`, `config_worker_ack`, `config_active`, `config_worker_capability`); RFC 8785 `CanonicalJson` (content hash); `EffectiveConfigResolver` FACTORY → SITE → exactly one PROFILE → LOOP → exactly one REGIME with `RESET_TO_INHERITED`, explicit null refused, `NO_VALUE` stated; `ChangeClassifier` promotes through the catalogue's dependants; `BundleValidator` (typed / finite / bounds / fraction ≠ percent / unknown field named; G9 never PRIMARY; uninstalled G6/G8 methods `DEPLOYMENT_REQUIRED`; G5 capacity vs 24 h; execution plan vs compiled capacity); the FACTORY layer is exported from the jar (`FactoryLayer` = catalogue starting values + the class packs; `FactoryLayerParityTest` fails the build when `factory-layer.json` drifts from the packs) |
| lifecycle (3B.3) | none | `GET /configuration/{catalogue,effective}`, drafts: `POST` (from the parent version or the factory + pack), `PATCH` requested changes under `If-Match` (409 stale), `validate`, `shadow` (a SHADOW analysis run over a retained interval through the replay job with `--bundle-hash / --bundle-properties-b64`; server-materialised before/after gate matrix; `POLICY_RECLASSIFICATION` when symptoms disappear), `approve` (an independent reviewer - self-approval 403 - bound to the content hash with an expiry; site-wide / objective / test-permission changes need `ControlAuthority`); deployments: `POST` (APPROVED only) → SCHEDULED → PREPARING → PREPARED → APPLYING → PROBING → `ACTIVE_VERIFIED` (a result pinned to the hash, or complete APPLY ACKs after the probe window); a NACK, a foreign hash or **mixed jars** → `ACTIVATION_FAILED` (NR-051); an incomplete matrix past the ACK window → `PARTIALLY_ACKNOWLEDGED`, never active; rollback = a new deployment of the previous bundle (NR-054); every transition audited; `CplmConfigAckConsumerService` (`…-config-acks`, one member) records CAPABILITY and ACK/NACK records; bundles leave signed (HMAC-SHA256 of the canonical bundle with `Auth:ServiceKey`) |
| Flink bundles (3C.1) | static `SPINE`, swallowed parse failures | the bundle topic joins the registry metadata on ONE control broadcast; `BundleBroadcastHandler`: PREPARE verifies the signature (`UNSIGNED`), validates locally (`GateConfigBundle`: catalogue identity, content hash, selectable scope, every property known / typed / in bounds, G5 period capacity, execution plan within capacity) and ACKs or NACKs naming every reason with its jar, commit and topology generation; APPLY needs a PREPARE (`NOT_PREPARED`); a `STATE_BOUNDARY` bundle opens a new epoch; garbage is `PARSE_ERROR` + `cplm_config_rejected` counter; `EffectiveBundleSelector`: LOOP > PROFILE > SITE, by effective-from event time within a scope - a window decides at its end, so `window_end ≥ effective_from` uses the new bundle and older windows keep the old, never mixed (NR-052); windows whose support began before a STATE_BOUNDARY effective time report `evaluation_state = WAITING / WARMUP` (NR-053); the bundle hash is the `bundle_hash` of every result, its epoch the `context_revision`; the static map is gone (`CplmDynamicsParameterSetSupport.resolve(..., Lookup)` over the operator's checkpointed broadcast state; bounded jobs build theirs with `CplmParameterUpdateReader`); the response job pins a capture to the bundle in force at its start; replays and reconstructions evaluate under `--bundle-hash` (the governed bundle behind the run's hash) |
| capacity (3C.2) | — | `ExecutionPlanCapacity` declares the compiled horizons (short 1m…60m, long 4h/12h/24h, event), 24 h + 10 min retention, 10 active horizons, `FIXED_COMPILED`; `execution-plan.installed.json` ships in the jar and the API; `ExecutionPlanCapacityTest`: the installed plan validates and equals the Java declaration; `long_30h`, a moved gate, another scheduler mode or a six-hour G5 period are `DEPLOYMENT_REQUIRED` by name (NR-055) |
| UI (3D.1) | free-text profile id | `/cpm/config` Gate Configuration workspace (nav; `cpm.config.read`): site → scope → reference → bundle version → gate → properties; `PropertyForm` (definition, unit, effective value + source layer, inherited value, Commissioning required, bounds, change class, dependencies, the build's not-read reason (locked), validation errors; typed inputs - a fraction refuses a percent, arrays replaced whole, reset to inherited); `EffectiveConfigDrawer` (read-only; from the Method Trace it names the bundle THAT run used and says when it is no longer the active one); `DiffImpactPanel` (per-property class, affected scope, no phased rollout in this build stated); `ShadowComparison`; `ApprovalPanel` (hash-bound approvals with expiry; the server's 403 / 409 shown as such); `DeploymentStatus` (ACK matrix per worker, NACK reasons, mixed jars called out, the active bundle per job, the probe, rollback) - a partial matrix never reads as active; Governance's approval queue is real |

Commits (branch `feat/v25-next-release`, tests first): 3A `45a8567f` `c62cfe66` `2cc34ed5` · 3B `8a0a6084` `9de5eb45` `5003d1cf` ·
3C `b3eb83c6` `96036c50` · 3D `1b853e89` · 3D.2 (this entry) · topics `c9ad3afb`.

### Migration and service update (facts the v2.5 release manifest carries; Phase 4 packages them)

| Step | What | Notes |
|---|---|---|
| SQL | `scripts/cpm-07-v25-schema.sql` on `traverse_cplm` now also carries 58 (config governance) | additive, idempotent, before the image swap; `migration/schema/03-traverse_cplm.sql` mirrors it |
| Kafka | `traverse.cpa.context.gate-config.v1` (compacted, 3 partitions, key `bundle_id`), `traverse.cpa.context.gate-config.acks.v1` (delete 7 d, 3 partitions) | in `migration/kafka/topics.txt` / `scripts/kafka-reset-lab-topics.ps1`; **create before the jobs start** (the jobs announce their capability on the ACK topic at start) |
| Flink | jar rebuilt; ALL six CPLM jobs are CANCELLED AND RESUBMITTED (the control broadcast gained the bundle source and a side output; no savepoint restore across this release); the Flink JobManager and TaskManager containers need `CPLM_GATE_CONFIG_KEY` = the platform `TRAVERSE_SERVICE_KEY` (compose: base + `docker-compose.marun.yml`) - without it every bundle is NACKed `UNSIGNED` and no deployment can verify | optional job args `--gate-config-topic`, `--gate-config-acks-topic`, `--gate-config-key`, `--site` |
| Images | `cplm-api`, `ams-frontend`, the Flink image | `traverse-ingestion-service` unchanged since CHG-026 |
| Config | until a site activates a bundle, every loop runs the FACTORY layer = the class packs exactly as before (the effective endpoint says `NO_ACTIVE_BUNDLE`); `Cpm:ConfigAckWindowMinutes` (default 5) and `Cpm:ConfigProbeWindowMinutes` (default 5) on cplm-api | a REGIME-scoped bundle and a DEPLOYMENT-class change are refused by the workers by design |
| Consumer groups | + `traverse-cpa-cplm-results-config-acks` | one member; listed on cplm-api `/health` |
| Permissions | `cpm.config.read / draft / validate / shadow / approve / activate / rollback` (Engineer: read…shadow; Supervisor: approve; Admin: all) | in `cpm-08-v25-permissions.sql` (Phase 1) |

### Verification (lab, 2026-09-17)

- Unit: Flink `mvn test` **263 run / 0 failures / 2 skipped** (CanonicalJson vectors = the API's + a Python-pinned HMAC; BundleBroadcastHandler 8; EffectiveBundleSelector 5; GateConfigTopology 3; ExecutionPlanCapacity 3; FactoryLayerParity; CapabilityCoverage; PropertyCatalogue); cplm-api **159/159** (lab DB; ConfigLifecycleTests 5, CapabilityManifest 6, PropertyCatalogue, ConfigLibrary); frontend vitest **101/101** (PropertyForm 3, DeploymentStatus 3), `npm run lint` clean, build clean.
- Lab (jar `03d04d12…`, six jobs RUNNING, `CPLM_GATE_CONFIG_KEY` set): `/capabilities.config` = `ANNOUNCED`, 6 workers on one jar, catalogue matches, 70 readable property ids, 78 declared unsupported.
- `scripts/test-cpm-v25-slice3-e2e.ps1` (new, 14 steps): **14 passed, 0 failed** at 02:52 on jar `27544b6f…` - fleet on one jar and one
  catalogue; a LOOP draft from the factory + pack; the typed edit under If-Match; stale etag 409; unknown field and a percent for a
  fraction refused by name; VALIDATED with class POLICY; self-approval 403, admin approval hash-bound; deployment: the five
  property-reading jobs ACKed PREPARE and APPLY (the Instrument Context engine listed as observer) → **ACTIVE_VERIFIED with 2
  results pinned to `f9153b00…`**; the effective configuration names the bundle and the edited value; v2 activated then rolled
  back → the previous bundle active again (`ROLLED_BACK` / `ACTIVE_VERIFIED`), v1 rows 7 → 7 untouched, v2 rows kept 3; SPA route.
  The bundles stay on the lab (v1 active for FIC10302: G4 warn ratio 4.5).

### Lab findings while proving Slice 3 (all fixed in this set)

- The Instrument Context engine announces a capability but reads no catalogue property and consumes no bundle, so it never
  answered and no deployment could verify: a job that reads nothing is an **observer** of a deployment (listed, parallelism 0),
  never a required ACK (80d68b56).
- Validation classified EVERY resolved property and reported a warn-ratio edit as STATE_BOUNDARY: the class of a bundle is the
  class of what it changes (its own layer + the diff to its parent) (80d68b56).
- A value the catalogue forbids (a percent for a fraction, out of bounds) landed in the draft and only validation refused it:
  the PATCH now refuses it by name and changes nothing (3de059b8); validation keeps the cross-field checks.
- With ZooKeeper HA on the lab, the recreated JobManager restored one job from its OLD jar blob (it was not RUNNING at cancel
  time) and the fleet ran two jars - `/capabilities.config` said so (`jarSha256s` = 2), the deploy helper now cancels any
  worker announcing another jar. Marun has no ZK HA; the runbook's post-check catches it either way.
- The auth-service revocation feed rounded `credentials_changed_at` to the nearest second, so a token issued in the same second
  as a credential change read as revoked (first login 401): floor() now, and `traverse-auth-service` joins the v2.5 manifest
  (3e87aea2).

### Risks and deliberate limits

- A worker holds the last APPLYd bundle in its checkpointed broadcast state; there is no "deactivate" (return to the factory layer) operation - the first bundle of a scope has no previous bundle to roll back to. Deleting a bundle row while the jobs still run under it leaves results whose hash no bundle explains; the E2E therefore keeps its bundles.
- The bounded keyed scheduler is not implemented: an execution plan beyond the compiled horizons is `DEPLOYMENT_REQUIRED` (capacity declaration + validation only, spec §5.2 option).
- A REGIME scope is refused by the workers (no regime selector in the engine); the API accepts REGIME drafts and the workers NACK them on PREPARE.
- Properties the build declares unsupported (78, `unsupported-in-build.json`) are accepted in a bundle and stated, not applied.
- The shadow comparison compares against the LIVE rows of the same windows; a loop without live results over the interval compares nothing (stated).
- Phased rollout with stop criteria is not part of this build: a deployment switches its whole scope at the effective time.

## CHG-026 ✅ v2.5 Slice 1 — qualification and safe semantics (spec v6 Phase 1, incl. Instrumental NE107 health)

**Reported (spec v6 "Traverse CPA Next-release engineering specification", audited against the
code on 2026-09-16 — `docs/next-release/01-audit-vs-code.md`):** the loop-performance product
could not make an operational diagnosis it could defend. One timestamp and one quality stood for
five roles; an unknown quality became `GOOD`; a heartbeat looked like a fresh sample; G2/G4 were
unit-dependent; G10/G11 counted samples, not seconds; G14 "confirmed" a valve fault from the mere
presence of VP; a window without evidence CLOSED an open episode; nothing carried a reproducible
run identity and a replay wrote into the live timeline; there was no transmitter-health context
at all. Phase 1 closes R02, R03, R04, R06, R08, R10, R11 (fast path), R15, R19, R20, R22 and R26,
and demotes G8 to supporting evidence (R07). G12 (R01), the evidence workbench (R12–R14), the loop
model (R05, R25) and governed configuration (R16–R18) are Phases 2–3.

### What changed

| Area | Before (audited at `5cec34ef`) | After |
|---|---|---|
| samples tuple (`traverse.cpa.loop.samples.v1`) | one `event_ts_ms` + one `quality` for pv/sp/op/vp/mode; VP/MODE held forever, hold invisible | **schema 1.1, additive, same topic**: `roles{}` with per-role `sample_ts_ms`, `verified_ts_ms`, `quality_native`/`quality_protocol`/`quality`, `unit`, `held`, `age_ms`; `binding_revision`. Every 1.0 reader proven unaffected (E2E 1A.3) |
| quality | `Str(root,"quality") ?? "GOOD"`; numeric quality dropped; NaN accepted | `QualityDecoder` per protocol (OPC_DA, OPC_UA, SPARKPLUG, STRING_ENUM, NONE); `UNKNOWN` is never `GOOD`; non-finite → DLQ `NON_FINITE`; Flink G0 counts `unknown_quality_pct`, reason `QUALITY_UNKNOWN` |
| live RBE | quality-only change never emitted; one `ts` | emits on a (value, quality) change; `source_ts` / `verified_ts` / `emission_ts` carried to the UI (source age shown) |
| G2 / G4 | 1.0 EU band; `>8 / >3` hardcoded | band policy (EU objective or fraction of declared span, else NOT_EVALUATED `NO_OBJECTIVE`); profile thresholds; dimensionless `activity_ratio_norm` |
| G10 / G11 | 5/95 % of samples; freeze ≥ 60 s **and** ≥ 10 % of the window | limits from the declared output range, dwell in **seconds**, `dwell_events[]`; freeze episodes retained (`freeze_events[]`), exclusion only on a material freeze; **fast path** `CplmConditionStreamJob` → `traverse.cpa.clpm.condition.v1` → `analytics.condition_event` → `/loops/{id}/conditions`, fused as evidence |
| fusion | `conf ≥ 0.90 && VP present` ⇒ CONFIRMED; G8 decisive | observations → hypotheses → fault-scoped **Confirmation** (CONFIRMED only from measured VP non-following dwell; CONTRADICTED cap 0.54; NOT_CONFIRMED cap 0.89); `score_semantics = EVIDENCE_SCORE_UNCALIBRATED`; G8 `XCORR_ASYMMETRY_V1` supporting only; served as `verdictV2` |
| episodes | EXCLUDED / INSUFFICIENT / NO_CALL closed open frames | `availability_state` vs `condition_state`; UNOBSERVABLE never closes; Clear only with `qualified_support_ms ≥ recovery_support_s`; overlapping windows add no support |
| run identity / replay | upsert by `sample_count`; replay wrote the live topic; version strings only | `method_run_ids` (one deterministic v5 uuid per gate), `bundle_hash` **in the unique key** (a different configuration is a new row, never an overwrite), `purpose` + `analysis_run_id` + `analytics.analysis_run`, `source_commit` / `jar_sha256` / `dataset_hash` on every result; `POST /analysis-runs`; IoTDB-backed replay (`HISTORIAN_QUALITY_ASSUMED`); latest-row reads serve LIVE only |
| evidence | scalars only | per-gate artifacts (f64le+gzip chunks ≤ 256 KiB, per-chunk + whole SHA-256) on `traverse.cpa.clpm.gate.evidence.v1` → `CplmEvidenceConsumerService` → `analytics.evidence_manifest` / `evidence_chunk`; `COMPLETE` **only** when every checksum verifies; `/method-runs/{id}[/evidence]`; daily retention sweeper (pinned never expires) |
| Instrumental NE107 | nothing | contract v1 + simulator; `INSTRUMENTAL_HEALTH` ingestion profile (strict schema, dedupe/conflict, epoch discipline, DLQ) → `traverse.cpa.instrument.health.v1`; effective-dated device bindings; `CplmInstrumentContextJob` (device state machine + §4.6 eligibility policy) → `traverse.cpa.context.instrument-health.v1`; cplm-api mirror + `/loops/{id}/instrument-health[/history]`; `health_lanes` on every verdict (PV INELIGIBLE ⇒ `EXCLUDED_INSTRUMENT_HEALTH`); `TransmitterHealthPanel`, health lane in Historical/Investigation, fleet `?health=` filters |

Commits (branch `feat/v25-next-release`, all with tests first): 1A `bbbbf083` `65db8eec` `5852567d` · 1B `4d311cdb` `5f31502e` ·
1C `7b256208` · 1D `0ff8edc0` `83c4ad57` `08ea68a2` `25a8de85` · 1E `49938db1` `1ec96268` · 1F `3535c78a` · 1G `04bdb7d5` ·
1H `eb56752c` `09d82159` `4ef64e9a` `9df8052e` `06418b2c` `210d26e9` `547482a5` · 1H.7 (this entry).
Files: see each commit; the branch compiles from `06418b2c` onward (the 1G commit carries whole
files that the 1H.5 commit's classes complete — stated in both messages).

### Migration and service update (the v2.5 release manifest is Phase 4; these are the facts it will carry)

| Step | What | Notes |
|---|---|---|
| SQL 1 | `scripts/cpm-07-v25-schema.sql` on `traverse_cplm` | additive (identity columns with defaults, new tables incl. the health mirror), before the image swap; idempotent |
| SQL 2 | `scripts/cpm-07b-v25-result-key.sql` | swaps the result unique key to `(loop_id, window_kind, window_end, source, bundle_hash)`; **run with cplm-api stopped**; ends with `ANALYZE` (the planner picked the wrong index otherwise) |
| SQL 3 | `scripts/cpm-08-v25-permissions.sql` on `traverse_auth` | ten `cpm.*` keys; Engineer gets six, Supervisor if present |
| Kafka | `migration/kafka/topics.txt` | new: `traverse.cpa.clpm.condition.v1`, `traverse.cpa.clpm.gate.evidence.v1`, `traverse.cpa.instrument.health.v1`, `traverse.ingestion.health-dlq`, `traverse.cpa.context.instrument-health.v1` (compacted). **Create them before the jobs start** — the lab fusion job restarted for hours because the condition topic had never been created |
| Flink | jar rebuilt (`mvn package` first — the image only COPIES the jar); cancel + resubmit the three CPLM jobs; submit the two NEW jobs `AMS - CPLM Condition Engine`, `AMS - CPLM Instrument Context Engine` (`migration/04b-submit-flink-jobs.sh`, `migration/flink/JOBS.md`); resubmit `AMS - Loop Live RBE Engine` | check `docker logs ams-flink-job-supervisor` for `ClassNotFoundException` and `/jobs/overview` for RESTARTING after the swap |
| Images | `traverse-ingestion-service`, `cplm-api`, `ams-frontend`, `sparkplug-edge-node` (1C: `AlarmMetricPublisher` carries source/verified/emission time) and the Flink image | `binding-resolver`, `asset-model`, `audit-service`, `display-service`, `template-service`, `historian-bff`, `notification-service`, `analysis-service`: only the synced `TraverseAuth.cs` permission list changed (no behaviour) — rebuild optional; `ams-api`, gateway: unchanged |
| Config | every `MQTT_LOOP_SAMPLES` data source needs `loop_ingest.quality_protocol` (`STRING_ENUM` for the CENTUM gateway's `"GOOD"` strings) or its loops become `UNKNOWN` quality — by design, never `GOOD` | `scripts/set-quality-protocol.py` ships with Phase 4; one `INSTRUMENTAL_HEALTH` data source per Instrumental publisher (none until Instrumental ships it — every loop shows `NOT_CONFIGURED` health until then, which is the intended state) |
| Consumer groups | `traverse-cpa-cplm-results`, `…-frames`, `…-evidence`, `…-conditions`, `…-health` | exactly one member each; `/health` on cplm-api lists all with `projectionLag` |

### Verification (lab, 2026-09-16)

- Unit: Flink `mvn test` 114 run / 0 failures / 2 skipped; cplm-api 96/96 (lab DB); ingestion-service 212/212; frontend vitest 51/51, `npm run lint` clean, `npm run build` OK; simulator pytest 17/17.
- `scripts/test-ot-loop-ingestion-e2e.ps1` **28/28** (three 1G steps added; the DLQ step now reads each partition's tail — the topic holds 168k records).
- `scripts/test-cpm-v25-slice1-e2e.ps1` (new, 18 steps): **18/18** at 15:14 on the redeployed jar (jar e09d6f40; NE107 path, fusion v2 + identity + health lanes, evidence COMPLETE, fleet filters, availability)
- Lab facts recorded in `docs/next-release/00-build-truth.md`: running jar `d382a97a…`; all five CPLM jobs RUNNING; health path proven MQTT → ingestion → Kafka → mirror → API and Flink context → eligibility; the evidence path emits only for episode-bearing long windows (`scripts/sim/loop_freeze_sim.py` exercises it).

### Risks and deliberate limits

- Instrumental's publisher is external; every plant loop reports `NOT_CONFIGURED` health until it ships (correct, not a defect).
- Evidence artifacts exist only for windows with a limit-dwell or freeze episode until Phase 2C.1 adds the per-gate series artifacts.
- The fast condition path covers G10/G11; the G12 response event path is Phase 2B.
- Retention of the v1 gate rows stays an ops decision (the sweeper touches evidence only).


## CHG-029 — Lab Docker disk exhaustion and Flink retention (2026-09-20)

**Scope:** lab runtime configuration and Windows Docker storage recovery. No CPA
API contracts or calculation algorithms changed.

C: exhausted while the Docker VHDX occupied about 173 GiB. Inside it, Flink had
accumulated old process-local temporary directories and RocksDB/file-log families.
The lab now uses INFO console logs under Docker's existing 10 MB x 3 rotation,
WARN RocksDB logs capped at 1 MB x 2 per database and stored with that database,
and startup-only cleanup of recognized temporary files. HA/checkpoint/savepoint
volumes are preserved. A duplicate crash-looping long-diagnostics job was stopped
after verifying the other copy's successful checkpoints.

Components: infra/docker/docker-compose.yml, infra/docker/flink-entrypoint.sh,
infra/docker/flink-log4j-lab.properties, scripts/test-flink-startup-cleanup.sh,
scripts/compact-lab-docker-disk.ps1, scripts/start-lab-docker.ps1. Host-only changes move WSL swap to D: and
reduce Docker builder GC's target to 5 GB; original configs are backed up.
Redis contract AOF recovery removed an invalid 688-byte tail after a complete
backup to D:. See [incident evidence and recovery record](docs/docker-disk-recovery-2026-09-20.md).

Validation: Compose config, shell/PowerShell syntax, and the isolated cleanup
regression passed. Offline compaction reclaimed 102.81 GiB; C: reached 107.2 GiB
free. After restart, Flink reported 13 running jobs / zero failed, no running
container was unhealthy/restarting, and Explorer loaded loop data in Chrome.
The Desktop stale-socket error was recovered separately; the guarded startup
helper is a workaround, not a vendor bug fix.


## CHG-030 — CPA navigation and UI repair: Overview, Performance, Explorer, Historical, all trends, Events, System Response (2026-09-20)

**Scope:** frontend only (`src/frontend-ob`). No API contract, backend, database script or Flink
job changed. Plan and per-phase findings: [docs/cpa-ui-fix-plan.md](docs/cpa-ui-fix-plan.md);
acceptance status: [docs/cpa-application-flow-audit.md](docs/cpa-application-flow-audit.md) §6.
Rules followed: every in-page route carries `?loop=` (plus `window` / `gate` / `kind` when
window-scoped), every navigation affordance is an `ObcButton`, no new eager fetch, disabled-with-
reason instead of hidden, `push` for visits and `replace` for in-page selection, files ≤ 500 lines,
`npm run lint --max-warnings 0` clean, the nav sidebar untouched.

### What was wrong and what changed

| Page | Defect (measured on the lab) | Fix |
|---|---|---|
| Overview | Analysis dialog painted under the top bar (modal z-index 60/61 vs a grid-item top bar at 100); its only action sat below 17 gate rows and opened the fleet matrix; the Flink runtime panel cost 2 requests + a 15 s poll; loop ids were text | Modal layer 1000/1001 with a fixed footer; `Open loop ›` (Explorer) / `Fleet matrix ›`; gate rows route to the gate panel; queue rows, event trail and the "Need attention" tile route with context; `PipelinePanel` removed. Initial calls 9 → 7, poll gone |
| Performance | Loop cell only selected; `Open in workbench` disabled for loading, absent and pre-v2.5 cells with one misleading title; `tab=calculations` case bug; `Window Inspector` was a text link; stale line had no route | Loop cell routes to the Explorer (native grid cell kept: `obc-button` has no `delegatesFocus`, so it cannot take the roving focus); five named button states with Replay promoted for legacy rows; `tab=Calculations`; Window Inspector / Pipeline Health / `Open loop ›` buttons. Initial calls unchanged (5) |
| Explorer | Rail stayed open with a loop selected; Summary had no gates or calculations; Workbench / Response were text links | Rail follows the URL (collapsed when a loop is named, on deep links and Back); Summary gate strip from the cached `gates/latest` row (0 requests) with a lazy gate detail that fetches that run's manifest + bundle only on click and renders the Workbench gate view; lazy Long / Short calculations (fused row from cache, one `kpis?limit=1` call per short kind picked); Context buttons open the exact fused run. Initial calls unchanged (9) |
| Historical + every PV/SP/OP chart | Legend swatches and tooltip markers used the ECharts palette (yellow/red/blue) while lines used the pens | `color` set beside `lineStyle.color` on every signal series (Historical, Overview focus, Explorer, Replay, Investigation); Historical gains an `Evidence Workbench ›` exit for the selected window |
| All trends | No drag-rectangle zoom | Shared `components/charts/{boxZoom,useBoxZoom,ChartZoomBar}`: ECharts' toolbox dataZoom feature shown to ECharts but off-canvas, driven by OpenBridge buttons (Zoom area · Undo · Reset, Escape cancels); the zoom rides in the option so live ticks keep it; wired into Historical (x on every lane, y on the signals grid), Overview focus, Explorer operating state, Investigation, Replay (time + phase plane), CpmChart (Workbench / Response / model history), Trajectory, Pipeline telemetry and TrendCore (Trend page, dialog, canvas symbol; split into `Designer/trend/*`, 583 → 366 lines). Zero requests on zoom |
| Loop Events | Expired shelves read "Shelved" for ever (EVT-833 three days past expiry); no Shelved views; four fixed durations; loop id text; `?loop=` ignored | `events/shelfState` derives ACTIVE / EXPIRED from the clock; filters Shelved and Shelf expired (expired also counts as unacknowledged); lazy shelve panel with presets, custom expiry, reason and Update shelf; a visible disabled Unshelve naming the missing endpoint; `?loop=` scopes the single events request; loop buttons everywhere; ack / shelve gated on `cpm.manage` |
| System Response | Context column 284 px; expanded outputs and the 52-row catalogue escaped it by 248 px; timestamps wrapped to three lines; censored events kept "Decoding…" skeletons; Workbench was a text link | Columns `1fr / 3fr / 1.4fr` (context stacks under the centre below 1400 px); contained key/value rows; catalogue as a lazy wide centre card; tables get a scroll wrapper; panels wait only for artifact kinds the manifest declares; `Open in Evidence Workbench ›` and `Open loop ›` buttons; missing timestamps read "unknown" |

### Changed components

- New: `components/Cpm/cpaHref.ts` (+test), `components/charts/boxZoom.ts` (+test), `useBoxZoom.ts`, `ChartZoomBar.tsx`, `components/Cpm/explorer/summary/{OperatingState,SummaryGateStrip,SummaryGateDetail,SummaryCalculations}.tsx`, `components/Cpm/events/{shelfState.ts,EventDetail.tsx,ShelvePanel.tsx}` (+test), `components/Cpm/response/QuantityCatalogue.tsx`, `components/Designer/trend/{trendSupport.ts,trendOption.ts,TrendLegend.tsx,TrendTimeBar.tsx}`.
- Changed: `CpmOverview`, `overview/{FocusedLoopDrawer,LoopFocus}`, `CpmPerformance`, `GateMatrix`, `GateEvidencePanel`, `AttentionList`, `CpmExplorer`, `explorer/{SummaryTab,LoopModelCard}`, `CpmHistorical`, `historical/{chartOption,SelectedWindowPanel}`, `CpmInvestigation`, `CpmPipeline`, `replay/ReplayChart`, `evidence/CpmChart`, `evidence/views/primitives/Trajectory`, `windows/WindowResults` (export), `CpmEvents`, `response/{ResponseWorkspace,EventAside,EventList,CandidateModelsTable}`, `Designer/TrendCore`, `shared.tsx` (KpiTile `action`), `global.d.ts` (`title`, `aria-pressed` on `ObcButton`), `styles/{app,cpm,cpm-evidence}.css`.
- Removed: `components/Cpm/overview/PipelinePanel.tsx` (only consumer was the Overview).

### Validation

- Unit: `npx vitest run` 62 files / 272 tests; `npm run lint` clean; `npx tsc --noEmit` clean; `npm run build` OK.
- Browser (lab Vite dev build, 1440×900 and 1036×647, Day / Night): Phase 1–4 journeys exercised with real clicks — Overview dialog above the top bar, every Overview / Performance / Explorer route lands with context and Back restores `loop` / `gate` / `tab`; Performance keyboard grid still one tab stop; Explorer deep link with `gate=` opens the detail; gate click adds only `method-runs/evidence/batch` + `…/evidence/bundle`; Short-window toggle adds exactly one `kpis` call; Historical tooltip markers match the pens.
- **Pending browser verification:** Phases 5–7 (box zoom on each chart, Events shelving, Response layout). The lab Docker engine failed during the run (C: full, see below); the box-zoom mechanism itself was proven with a real drag on a standalone ECharts instance in the same page (x 37.6–59.8 %, y 31.5–69.4 %).

### API gaps (frontend cannot close)

1. `POST /api/v1/cpm/events/{id}/unshelve` does not exist (only acknowledge, which clears the shelf, and shelve). The Unshelve button is visible and disabled with that reason.
2. Event frames carry no evaluated-window end or run id, so an episode cannot open its own evidence in one click (audit A2).
3. Rows without `method_run_id` (all prod v2 rows) cannot open the immutable Workbench; Replay / Window Inspector are the offered fallbacks.

### Release impact — updated services and the script to run

Only `ams-frontend` (`ams-cpa-ams-frontend`) changes; no other service, no database script, no Kafka
topic, no Flink artefact. It ships inside the v2.5 bundle (the image is already in
`migration/deploy/releases/v2.5.txt`), so the plant steps in
[migration/V2.5-DEPLOY.md](migration/V2.5-DEPLOY.md) are unchanged. If the frontend has to go out
alone (a v2.5 hotfix after the bundle is built):

```powershell
cd src/frontend-ob; npm run lint; npm run build                 # both must be clean
cd ../..; git status --short                                    # must be empty (bundles ship git archive HEAD)
python migration/deploy/build-release.py --release v2.5 --only ams-frontend
```

Plant: UPDATE-RUNBOOK §1 for that one image (`sha256sum -c`, rollback point, `docker load`,
`deploy.sh --prod`), then 200 on `/` and users press Ctrl+F5.

### Lab incident during this change (2026-09-20, ops)

The Docker engine on the lab PC answered HTTP 500 at ~10:45, was restarted (Docker Desktop restart,
then `scripts/start-lab-docker.ps1` after a stale-socket refusal) and the stack was healthy at
~11:00; by ~11:30 the engine was unreachable again. Cause: **C: had 244 MB free**;
`C:\Users\Admin\DockerDesktopWSL\disk\docker_data.vhdx` had grown to 166 GB (this morning's
CHG-029 compaction had left 107 GB free). Docker Desktop was stopped at 11:37 to halt the growth;
nothing was deleted. Next steps for ops: find what filled the VHDX in nine hours (Flink / Kafka
state under `infra/docker` retention), then run the elevated `scripts/compact-lab-docker-disk.ps1`
or move the VHDX to D:, then `scripts/start-lab-docker.ps1`.

## CHG-031 — Plant: disk-full → Kafka down → ingestion producer never reconnected (2026-09-18 → 09-20)

**Scope:** plant operations, Kafka topic retention, one new OT data source. No image rebuilt.

**What happened.** The VM filled (475 MB free). Root cause was ours: `traverse.cpa.clpm.feature.short.v1`
at 7 d retention, uncompressed, with no `segment.ms` (script 04's `<` excluded 7 d topics) — 20 GB
of Kafka's 30 GB. At 10:00:36 UTC Kafka logged `No space left on device` and
`Shutdown broker because all log dirs … have failed`; both brokers restarted. Every consumer
reconnected — **except the ingestion service's rdkafka producer**, which logged `2/2 brokers are
down` once and then stayed silent and "healthy" for 6 h, publishing nothing. The OT gateway does
not buffer, so 10:00 → restart on 2026-09-18 is an unrecoverable gap in samples, features and gates.

**What worked.** The historian consumer (CHG-020) held ~8 h of samples in Kafka while IoTDB was
refusing writes and replayed all of them in 24 s once space returned — every 30-min bucket before
10:00 is complete for every loop. First live proof of the hold-and-retry path.

**Fixes applied on the plant (online, no deletion):** `feature.short` → retention 1 d, lz4,
`segment.ms` 6 h; `dlq.ingestion.failed` (Instrumental's) → 1 d. Disk 475 MB → 16 GB free within
minutes. Repo made to match: `migration/kafka/topics.txt`, `04-create-kafka-topics.sh` (segment.ms
for every topic ≤ 30 d, cap 6 h), MARUN-DISK §2 incident row, §3 G per-topic probe, §3 I shared-disk
survey, §3 D "save logs before truncating".

**Ingestion recovery.** The data source had to be recreated: `HDPE OT loops`,
`mqtts://192.168.190.91:8883` (the **piarchiver-broker** mosquitto — not EMQX), inline CA
(PIArchiver Local CA), `servername: localhost`, new broker user `traverse-ingestion`, filter
`OT/HDPE/+/+/+/diagnostics/+`, plant mode map. Result: connected, 142/175 loops flowing within
60 s, Kafka log-end growing at ~28 samples/s, 0 dead-lettered. Facts recorded in MARUN-CONTEXT §12b.

**Defect to fix (open):** `traverse-ingestion-service` — `LoopSamplePipelineProducer` does not
recover from a total-broker outage (librdkafka all-brokers-down) and `/health` does not reflect
it. Fix: on a fatal producer error or an all-brokers-down window longer than N s, dispose and
rebuild the producer; expose `lastDeliveredAt` and fail health when it lags the source's
`lastMessageAt` by more than a threshold. Interim runbook: after any Kafka restart, check
`loop.samples` log-end is growing; restart the service if not.

**Also open:** `RawLoopIotDbConsumer` generic `catch` (line ~191) clears the held buffer on a
non-write exception (e.g. `EnsureTimeseriesAsync`) — those rows are re-read only after a restart.

## CHG-032 — Episode shelving as its own lifecycle: shelve / update / unshelve / expiry / history (2026-09-20)

**Scope:** `cplm-api` (API + schema + sweeper), `ams-frontend` (Loop Events), one new plant SQL step.
Design and runbook: [docs/cpa-event-shelving.md](docs/cpa-event-shelving.md). User request: "proper
shelve / unshelve management as we have acknowledge management", API changes allowed.

**What was wrong.** A shelf was stored by overwriting `ack_state` with `SHELVED`, so shelving forgot
the review; nothing but an acknowledgement could end a shelf (no unshelve route); nothing ran at
expiry, so an expired shelf stayed `SHELVED` for ever (lab EVT-833); who / when / why lived only on
the Kafka audit trail; there was no maximum duration.

**What changed.**

- Schema (additive, idempotent): `analytics.cplm_event_frames` gains `shelf_state` (NONE | SHELVED |
  EXPIRED), `shelved_by`, `shelved_at`, `shelve_reason` and a partial index on live shelves;
  new `analytics.cplm_event_actions` (ACKNOWLEDGED / SHELVED / SHELVE_UPDATED / UNSHELVED /
  SHELVE_EXPIRED with actor, at, until, reason). Legacy `ack_state = 'SHELVED'` rows are converted
  (shelf columns filled, history row written, ack reset to UNACKNOWLEDGED — a shelf never meant
  reviewed). Three identical copies: `database/scripts/60_cplm_event_shelving.sql` (lab),
  `scripts/cpm-09-event-shelving.sql` (plant, in `build-release.py` OPS_FILES and the VM steps),
  `migration/schema/03-traverse_cplm.sql` (fresh installs); `CplmEventFrameService.EnsureSchemaAsync`
  self-heals the same DDL.
- `cplm-api`: `Services/EventShelvingRules.cs` (pure transitions with explicit refusals),
  `Services/EventActionStore.cs` (frame + history row in one transaction; the sweeper's
  `UPDATE … RETURNING`), `Services/ShelvingOptions.cs` (`Cplm:Shelving` — MaxHours 168, SweepSeconds
  60, SweepEnabled), `Controllers/CpmEventActionsController.cs` (acknowledge and shelve moved here,
  unchanged routes; new `POST /events/{id}/unshelve`, `GET /events/{id}/actions`,
  `GET /events/shelving-policy`), `BackgroundServices/CplmShelfExpirySweeper.cs` (registered always,
  own switch). `CpmEventsController` is read-only: rows carry the shelf columns, the envelope carries
  `shelvePolicy.maxHours`, `includeShelved=false` hides active shelves only. Semantics: acknowledge
  leaves an active shelf and clears an expired one; shelve on an active shelf is an update; unshelve
  keeps the ack. Audit: `CPM_EVENT_SHELVE_UPDATED`, `CPM_EVENT_UNSHELVED`, `CPM_EVENT_SHELF_EXPIRED` added.
- `ams-frontend`: `api/cpmApi.ts` (`shelf_state` + shelf columns, `CpmEventAction`, `unshelveEvent`,
  `getEventActions`, `shelvePolicy`), `hooks/useCpm.ts` (`useUnshelveEvent`, `useEventActions`),
  `events/shelfState.ts` (shelf column first, clock second, legacy rows still read), `events/EventDetail.tsx`
  (Review and shelf section; Acknowledge / Shelve… / Unshelve… / History › with disabled-with-reason),
  `events/ShelvePanel.tsx` (presets within the site limit, capped custom expiry, required reason),
  new `events/UnshelvePanel.tsx` and `events/EventHistory.tsx` (lazy; the history fetches only while open),
  `explorer/HistoryTab.tsx` (active shelf still reads SHELVED). No new eager request on any page.

**Validation.** cplm-api build clean; unit suite 117/117 (`EventShelvingRulesTests` 5 new);
frontend lint / tsc clean, vitest 277/277 (`shelfState.test.ts` rewritten, `EventDetail.test.tsx` new),
`npm run build` OK. **Pending the lab (Docker down, C: full):** `EventActionsApiTests` (Integration:
transaction pairing, shelf/ack independence, sweeper once-only, events read + policy) and the browser
pass of Loop Events (shelve → Shelved with countdown, acknowledge keeps the shelf, Unshelve keeps the
ack, History rows, expiry return within a minute).

**Release v2.5 — updated services and scripts.** Images: `cplm-api`, `ams-frontend` (both already in
`migration/deploy/releases/v2.5.txt`). Plant, in C1 of [migration/V2.5-DEPLOY.md](migration/V2.5-DEPLOY.md)
right after cpm-08 and **before the cplm-api swap**:

```bash
docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < /tmp/v2.5/ops/cpm-09-event-shelving.sql
docker exec instrumental-postgres psql -U postgres -d traverse_cplm -tAc "select count(*) from analytics.cplm_event_frames where ack_state='SHELVED'"   # 0 after the conversion
```

Build box: `python migration/deploy/build-release.py --release v2.5` (cpm-09 rides under `ops/`
automatically). Lab: `.\run-all.ps1 -SkipBuild` after rebuilding the two images; the consumer's
self-heal DDL applies the schema, or run `database/scripts/60_cplm_event_shelving.sql` by hand.
Rollback: the columns and table are additive and ignored by the previous image; a previous image
would again write `ack_state = 'SHELVED'` on shelve, which the new one still reads.

## CHG-032 — Lab Docker disk exhaustion, second time: uncapped VHDX, no TRIM, broken vendor compaction, Flink HA repair (2026-09-20)

**Scope:** lab host operations and Flink HA recovery. No application code, images or
compose services changed; `scripts/start-ams-docker-full.ps1` gained an image prune step.

**What happened.** Nine hours after CHG-029's compaction, C: hit 0 again: `docker_data.vhdx`
regrew 75.6 GB → 166.4 GB while the ext4 inside held ~57 GB. Root cause is the disk, not
the data: a 1 TB dynamically expanding VHDX on a 480 GB C:, a Docker VM that never runs
`fstrim` and mounts without `discard`, and Docker Desktop's shutdown trim+compaction
skipped since last night's 4.91 / WSL 2.7.14 update (`wsl --unmount` "failed to detach").
When C: reached 0 the VM took I/O errors, ext4 went read-only, and MinIO lost one Flink HA
handle object; ZooKeeper still referenced it, so the JobManager crash-looped (19 fatals)
and the TaskManager re-restored RocksDB state at ~60 GB/h until it was stopped.
Full evidence and timeline: [docs/docker-disk-recovery-2026-09-20.md](docs/docker-disk-recovery-2026-09-20.md) (second section).

**Recovery done (12:10–12:30):** fsck (clean) → `fstrim` inside the VM → `Optimize-VHD`
166.4 → 70.5 GB, C: 96 GB free → Docker Desktop restarted, 31 containers up, Redis contract
AOF intact, gateway 200. JobManager left **stopped** pending the HA repair below.

**Permanent fix added (see the table in the doc):** `scripts/reclaim-lab-docker-disk.ps1`
(nightly trim+compact+verify), `scripts/watch-lab-disk.ps1` (10-min guard, graceful stop
< 20 GB), `scripts/install-lab-disk-guard.ps1` (registers both tasks),
`scripts/cap-lab-docker-disk.ps1` (one-time 160 GB hard cap), `scripts/repair-flink-ha-checkpoints.ps1`,
`scripts/gc-flink-checkpoints.ps1`, dangling-image prune in `scripts/start-ams-docker-full.ps1`,
timestamped log in `scripts/compact-lab-docker-disk.ps1`.

**Updated services:** none rebuilt (host/ops scripts only).

**Scripts to run for v3 (lab host, in this order):**
1. `docker stop ams-flink-jobmanager` → `.\scripts\repair-flink-ha-checkpoints.ps1 -Apply` → `docker start ams-flink-jobmanager` → expect 13 RUNNING at http://localhost:8082.
2. Admin: `.\scripts\install-lab-disk-guard.ps1` (nightly 03:30 reclaim + 10-min watch).
3. Admin, ~10 min stack downtime, after Flink is healthy: `.\scripts\cap-lab-docker-disk.ps1 -NewSizeGB 160`.
4. Once Flink REST is up: `.\scripts\gc-flink-checkpoints.ps1` (review) then `-Apply`.
5. Every `run-all.ps1` build now prunes dangling images automatically.

**Verification (2026-09-20 13:00-13:20):**
- Step 1 done: `repair-flink-ha-checkpoints.ps1 -Apply` removed the one broken reference
  (38/39 intact); JobManager restarted with 0 restarts, 13 RUNNING, *AMS - Alarm State
  Machine* logged "Restoring job ... from Checkpoint 12804".
- Step 2 done: tasks `AMS Lab Docker Disk Reclaim` (daily 03:30) and `AMS Lab Disk Watch`
  (10 min) registered as OWS02W\Admin, highest; event source registered; watch samples
  land in `D:\DockerSupport\disk-watch.csv` (last result 0).
- Step 4 done: `gc-flink-checkpoints.ps1 -Apply` deleted 61 of 61 orphaned directories
  (303 MB); 106 kept (13 live + newer than 7 days).
- Step 3 NOT applied: first run aborted at `resize2fs` because PowerShell turned the
  tool's stderr banner into a terminating error under `$ErrorActionPreference = 'Stop'`.
  Filesystem verified unchanged afterwards (block count 268435456, state clean, last
  checked by the run's own fsck). Fixed in `reclaim-lab-docker-disk.ps1` and
  `cap-lab-docker-disk.ps1` (stderr treated as text, guest tools `2>&1`, docker calls
  wrapped). Second launch: UAC prompt cancelled. Re-run when ~10 min of stack downtime
  is acceptable: elevated `.\scripts\cap-lab-docker-disk.ps1 -NewSizeGB 160`. If it logs
  "Hyper-V minimum size ... exceeds target" or `Resize-VHD` fails, the fallback is a
  rebuild into a new 160 GB disk (export volumes, recreate, re-import).
- First nightly reclaim log expected 2026-09-21 03:30 in `D:\DockerSupport\reclaim-docker-*.log`.

## CHG-033 — Bounded evidence and partitioned result tables: the Marun space fix (2026-09-27)

**Scope:** `cplm-api` (evidence classes, episode capture, the sweep, partition maintenance, self-heal indexes),
two plant SQL steps (`scripts/cpm-10a-episode-evidence.sql` online; `scripts/cpm-10b-result-partitions.sql` with
cplm-api stopped), the Flink submit script (`migration/04b`: the Short job's `--evidence-emit` switch, default
none), the cron drop-in (prune line retired, `migration/prune-short-features.sh` deleted). No Flink code, no API,
no UI change. Design: the user's `gate_evidence_workbench-proposed.md`; plan `.claude/plans/melodic-tumbling-bubble.md`;
progress [checklist.md](checklist.md) "CHG-033 / v2.6"; plant note [release-note-V2.6.md](release-note-V2.6.md).

**What was wrong.** v2.5 filled the plant's 96 GB shared disk in three hours (`docs/marun-capacity-remediation.md`):
every window with a finding emitted its artifacts - at Marun that is every window, ~1.4 GB/h into
`evidence_manifest` / `evidence_chunk` - and the three result tables had no retention at all (the repository's
retention is TimescaleDB, which the plant does not have). The interim controls held (`CPLM_EVIDENCE_EMIT=none`,
so an empty workbench; a cron DELETE that plateaus the feature tables) but gate results still grew 0.6 GB/day
for ever and nothing was a property of the product.

**What changed.**

- **Evidence by class** (`EvidenceBlobStore.RetentionClassOf`, `EvidenceRetentionSweeper` + `EvidenceRetentionTiers`):
  every live artifact is inserted as `TRANSIENT` and deleted outright after `Cplm:EvidenceTransientHours` (6) or,
  oldest first, once the class exceeds `Cplm:EvidenceTransientBudgetBytes` (2 GiB, counting ~1.2 KB of row overhead
  per manifest); an artifact a reconstruction or replay produced (`provenance.purpose` ≠ LIVE or an
  `analysis_run_id`) is `STANDARD` as before; `PINNED` untouched. The sweep runs every
  `Cplm:EvidenceSweepIntervalMinutes` (15; the old hours setting still honoured) and returns a `SweepResult`.
- **Episode capture** (`EpisodeCaptureStore`, `CplmEventFrameService`, `EventFrameLifecycle.Escalate`): the fused
  verdict's `method_run_ids` are parsed; on OPEN, ESCALATE (severity band rose LOW < MEDIUM < HIGH - the new
  `TransitionKind`) and CLOSE the frame service records them in `analytics.cplm_episode_capture` inside the frame's
  transaction and promotes the TRANSIENT manifests already stored to `EPISODE`; the sweep promotes late arrivals.
  OPEN + ESCALATE stop at `Cplm:EpisodeCaptureMax` (3, `capture_count` on the frame); CLOSE always captures.
  `EPISODE` expires `retention_policy.EPISODE` days (90) after the linked episode CLOSED, never while it is open.
  Only the long tier and fusion runs are captured: the fused ids are stamped from the 12h/24h window
  (`ResultIdentity.java:71`), so short-tier manifests never match them by design.
- **Result tables partitioned** (`scripts/cpm-10b-result-partitions.sql`, `FeaturePartitions`,
  `FeaturePartitionMaintenance`, `FeaturePartitionOptions`): short, long and gate results become daily RANGE
  partitions on `window_end` (PK `(id, window_end)`, id on a plain sequence, every existing index replayed with its
  name so `CplmResultSchema.Ddl` stays a no-op - proven; `created_at` indexes added for the evidence reconciler).
  The maintenance loop (every `Cplm:Partitions:MaintenanceMinutes` = 60, 5 s lock timeout, one pass at consumer
  start too) creates today + 2 (relocating DEFAULT rows first), DROPs days before today - `retention_policy` days
  (`SHORT_FEATURES` 3, `LONG_FEATURES` 30, `GATE_RESULTS` 30) and prunes DEFAULT below the cutoff. Retention is by
  window day for every purpose - the lab's Timescale semantics. A table that is not partitioned is skipped, so
  the lab's hypertables are untouched. The feature upserts moved to `Data/CplmFeatureUpsertSql.cs`.
- **Short tier off at the source** (`migration/04b-submit-flink-jobs.sh`): `--evidence-emit
  "${CPLM_SHORT_EVIDENCE_EMIT:-none}"` as the Short job's FIRST argument (`EvidencePolicy.fromArgs` takes the first
  match); `migration/deploy/stub-04b.sh` runs 04b against a fake docker and prints every job's value.
- **Schema, four copies as always:** `scripts/cpm-10a-episode-evidence.sql` (plant), `database/scripts/61_cplm_episode_capture.sql`
  (lab), `migration/schema/03-traverse_cplm.sql` (fresh install), `CplmEventFrameService.EnsureSchemaAsync` (self-heal, DDL only).
- **Release wiring:** `migration/deploy/releases/v2.6.txt` (`!v26-retention`, cplm-api only), `build-release.py` OPS_FILES +
  VM-STEPS blocks 4d / 6c / 6d; `migration/cron.d/cpa-capacity` without the prune line.

**Tests.** cplm-api suite on the lab: **216 / 216** (new: `EventFrameLifecycleTests` +4, `EvidenceClassTests` 3,
`EpisodeCaptureTests` 4, `EvidenceClassSweepTests` 3, `FeaturePartitionTests` 10 on a throwaway plain database
`cplm_plain_test` built from `migration/schema/03` + the self-heal DDL + cpm-10b, `SchemaV25Tests` +1);
`python -m pytest migration/deploy` 18; `bash migration/deploy/stub-04b.sh` (Short = none, others = episodes, override honoured).
Every task RED -> GREEN with the full suite before its commit (ledger `.superpowers/sdd/melodic-tumbling-bubble/progress.md`).

**End-to-end on the lab (2026-09-27).** The new image ran as the lab's `traverse-cplm-api` and, as a second instance with its
own consumer groups, against a plain database built from `migration/schema/03` + `cpm-10b`. Records produced into the lab Kafka
in Flink's shape drove the real consumers: manifest + chunk -> COMPLETE / TRANSIENT; fused verdicts -> OPEN -> ESCALATE -> CLOSE
with the four capture rows and three in-transaction promotions; the late artifact promoted by the first sweep and logged; the
gateway API returned the artifacts as COMPLETE / EPISODE; on the partitioned database the feature upserts landed in today's
partition (a 30-day replay in DEFAULT, a duplicate key upserted, ids from the new sequence), 256 replayed real verdicts and 8 real
Flink manifests (TRANSIENT) went through without an error. One defect found and fixed: the VM step 6d proof query
(`relname||relkind` is ambiguous on PG15; now `relkind::text`, pytest-pinned).

**Migration / service update.** See "Release v2.6 - what to build and run" above. Order matters: cpm-10a online -> image
swap -> evidence on + three jobs resubmitted -> 24 h measurement -> cpm-10b in a stop -> cron file.

**Cost per day (plant, 144 loops, measured cadence x lab bytes per row).** Short features 1.5-2.5 GB/day (3 d ≈ 5-8 GB),
long 0.16 GB/day (30 d ≈ 5 GB), gate results 0.6 GB/day (30 d ≈ 18 GB), evidence TRANSIENT ~10 GB/day written and deleted
within ~5 h (3-5 GB plateau), EPISODE ≤ 0.1 GB/day (≤ 10 GB after 90 d). Net permanent growth ≈ 0.1 GB/day; plateau ≈ 35-45 GB
with 30 d of gate results, ≈ 25-35 GB at 14 d - the headroom rule in the VM steps decides after the measurement.

**Plant outcome (2026-09-27 → 10-02).** v2.6.1 live 27 Sep 17:30 UTC. TRANSIENT held at 1.75 GB as designed. EPISODE did not:
fused verdicts flip fault family between consecutive 15-min windows on many loops (580 episodes opened and 481 closed per day,
348 closes FAMILY_CHANGED, 413 episodes under an hour), so ~1,350 capture events a day promoted ~300k manifests a day into a
class kept 90 d; with 34 orphaned Flink checkpoint directories (5 GB, every `docker rm -f` of the JobManager leaves the jobs'
last checkpoint) the host reached 1.4 GB free on 2 Oct. Recovery: evidence off, `EPISODE` = 2 d, evidence tables truncated
(no pinned rows), orphans deleted → 17 GB free. **Open: CHG-034 - episode capture must debounce family flips (one episode per
loop/window-kind across consecutive windows, or capture only on OPEN of a frame that survived N windows) before
`CPLM_EVIDENCE_EMIT=episodes` returns; the VM steps must `flink cancel` every job before removing the JobManager.**

**Risks and known limits.** The plateau at 30 d of gate results exceeds today's ~25 GB free (headroom rule; storage - remediation
item 1 - is still the real fix). Frames already open at the plant get no OPEN capture (ESCALATE / CLOSE only). A replay of a
window older than retention is ephemeral, as in the lab. A fresh install (03 -> cpm-10b -> first start) builds the two feature GIN
indexes on the empty parents at that first start. The ~10 GB/day TRANSIENT churn is WAL + vacuum load on the shared cluster,
not space. Pre-existing and untouched: `ConfigEffectiveSummaryTests` races the config lifecycle tests (NullReference in
`CpmConfigurationController.ShapeSummary` line 277 when a bundle field is null mid-mutation) - failed twice in eight full runs,
passes alone.

## CHG-034 — Episodes no longer flip with the fault family (2026-10-03)

**Scope:** `cplm-api` (`EventFrameLifecycle`, `CplmEventFrameService`), one online plant SQL step (`scripts/cpm-11-episode-debounce.sql`,
mirrors `database/scripts/62_…` and `migration/schema/03`), the plant compose overlay, the release builder, the daily check.

**What was wrong.** At Marun the fused diagnosis flips fault family between consecutive 15-minute windows on many loops. The
lifecycle keyed an episode on the family, so each flip closed one episode (`FAMILY_CHANGED`) and opened another: 580 opened and
481 closed per day, 413 shorter than an hour, 348 closes `FAMILY_CHANGED`; and since v2.6 every OPEN and CLOSE captured ~95
artifacts, the EPISODE evidence class grew ~1 GB a day (the 2 October disk incident).

**What changed.** A verdict of a different family no longer closes the open episode. The episode records it as the candidate
family and counts consecutive windows (`candidate_family`, `candidate_windows` on `cplm_event_frames`); a window of the
episode's own family resets the count, a third family restarts it; after `Cplm:FamilyChangeWindows` (default 3 = 45 minutes)
consecutive fault windows the episode closes `FAMILY_CHANGED` and the new one opens exactly as before (an unjudged or
insufficient-support window neither counts nor resets). A candidate window extends the episode (support, last diagnosis) but
never ratchets its peak, moves its severity or escalates; a closed row carries no candidate. Captures are
unchanged in kind (OPEN / ESCALATE / CLOSE), so a stable fleet captures tens of times a day. Also: the plant compose forwards
`Cplm__EvidenceTransientHours`, `Cplm__EvidenceTransientBudgetBytes`, `Cplm__EvidenceSweepIntervalMinutes`,
`Cplm__EpisodeCaptureMax`, `Cplm__FamilyChangeWindows` from `.env` (the 2 October finding that a `.env` key did not reach the
container); the Flink swap in the VM steps cancels every job before removing the JobManager and sweeps orphaned checkpoint
directories (34 orphans / 5 GB found); `migration/daily-check.sh` + `MARUN-DAILY-CHECK.md`.

**Tests.** `EventFrameLifecycleTests` (+5: candidate, takeover after three, reset on own family, third family restarts, escalate
on a candidate window; the two former immediate-change tests rewritten), `SchemaV25Tests` (+2 columns), `test_build_release.py`
(+5: cancel before removal + orphan sweep, compose pass-through, v2.6.2 manifest and steps). Full suite + lab injection below.

**Deliberately not done.** The fusion engine's instability itself (why the diagnosis flips) is a Flink question for the engine
owner; the Short job's 5-minute checkpoint timeout (jar) stays as is - a backlog after an ingestion stop can still push it into
the restart loop seen on 3 October; `MARUN-DAILY-CHECK.md` section 4 has the recovery.

## CHG-035 — Loop Explorer: 12 h / 24 h fused window toggle; trend charts drop the data table (2026-10-03)

**Scope:** `ams-frontend` only (`src/frontend-ob`): `components/Cpm/explorer/{SummaryTab,LoopWorkspace}.tsx`,
`explorer/summary/WindowKindToggle.tsx` (new), `CpmExplorer.tsx`, `CpmPerformance.tsx`, `cpaHref.ts`,
`evidence/CpmChart.tsx`, `api/cpm/evidence.ts`, `styles/cpm.css`, `styles/cpm-evidence.css`. No service, schema or Flink change.

**What the operator asked.** The Summary page of the Loop Explorer evaluated the 24 h fused window only ("Evaluated 24h
window · ending …"); the 12 h verdict exists but could not be reached from the hub. Every trend chart carried a "Data
table / CSV" disclosure that printed every point into the page when opened; it was not used, and the CSV should be a
click, not a table.

**What changed.**
- The Explorer reads the fused window kind from `?window=` (default `24h`), the same name and default as Performance, so
  the matrix's "open loop" hand-off now lands on the window it was showing (`explorerHref` gained `kind`). The workspace
  verdict pill and the Summary gate strip read the same kind (one `gates/latest?windowKind=` request, one query key). A
  12h / 24h `ObcToggleButtonGroup` in the "Gates on the latest fused result" panel head writes it with `replace` and drops
  `?gate=` (a gate selected on one window is not that gate's row on the other); options come from
  `resolutions.fusion.firesOn` (static per deployment, cached), with the same empty-first-emit guard Performance has.
- `CpmChart` lost the `<details>` data table; one flat `Export CSV` button remains and builds the file only on click.
  The dead `.cpm-chart__table` rule is gone; `.cpm-chart__more` stays for the zero-crossings disclosure in LongViews.
- `.cpm-panel-head__right` is a flex row (toggle beside the pill).
- **Evidence reconstruction reads the historian.** The workbench's "Reconstruct" posted `source: 'kafka'`, so at the
  plant only windows inside the samples topic's 12 h retention could be rebuilt and anything older rebuilt from nothing.
  `postReconstruction` now defaults to `source: 'iotdb'` (the API and the replay job's `IotDbBoundedSource` already
  supported it: `root.<site>.cpm.<loop>.{pv,sp,op,vp,mode}` over exactly the run's support). User decision 2026-10-03:
  the historian is the durable source. Lab proof below.

**Tests.** `cpaHref.test.ts` (+1: `explorerHref` writes `?window=`), `explorer/summary/WindowKindToggle.test.tsx` (new, 2:
options and selected value; a served kind forwarded, an empty or unknown emit dropped — the two OpenBridge wrappers stubbed
as `LoopModelCard.test` stubs `ObcButton`, the Lit group never assigns its slot under jsdom), `evidence/CpmChartCsv.test.tsx`
(new, 1: no table, no `<details>`, no serialised values, one `Export CSV` button). Every test watched RED before the code.
`api/cpm/evidence.test.ts` (new, 1: the request body names `source: 'iotdb'`). Frontend suite 282 / 282, `npm run lint` clean, `npm run build` clean. Lab browser pass 2026-10-03 (Vite 5174, FIC10302):
12h → eyebrow "Evaluated 12h window", a different fused run id on the workbench link, one `windowKind=12h` request, the
verdict pill updated; G5 detail: 2 charts, 0 data tables, 2 CSV buttons; 0 new console errors.

**Deliberately not done.** The Historical / Window Inspector pages keep their own window parameters (`?window=` there is
the window END, `cpaHref.ts` documents the split); a source picker in the workbench (Kafka for a very recent window) is not
offered — the historian covers every window the historian keeps, which at the plant is longer than Kafka's 12 h.

### Release v2.6.3 — what to build and run (ONE bundle: CHG-034 + CHG-035; replaces v2.6.2)

- **Updated services: `cplm-api`** (CHG-034 debounce) **and `ams-frontend`** (CHG-035). No Flink jar (plant stays on
  f7c99294e0767ea9). Source archive: compose `Cplm__*` pass-through, Flink-swap orphan sweep, daily check.
- Build: `python migration/deploy/build-release.py --release v2.6.3 --skip-jar --out release-out/v2.6.3-<date>` (manifest
  `migration/deploy/releases/v2.6.3.txt`, directive `!v262-debounce`). The v2.6.2 bundle is withdrawn.
- Plant, in order (the bundle's VM-STEPS.txt has the exact commands): extract the source archive → `ops/cpm-11-episode-debounce.sql`
  (online, additive) → `bash migration/02-apply-schemas.sh` → `docker load` both images → `deploy.sh --prod` with the usual
  exports → proofs: `printenv Cplm__FamilyChangeWindows` = 3 in the container; `200` on `/` and users press Ctrl+F5; Loop
  Explorer › Summary shows the 12h / 24h toggle; a trend chart shows "Export CSV" and no "Data table / CSV"; next day
  `FAMILY_CHANGED` closes in the tens.

## CHG-036 — Historian-backed bounded runs were refused by Flink: the replay source is now declared BOUNDED (2026-10-03)

**Scope:** `src/flink` only (`CplmHistoricalReplayJob.java`), one new test. Ships as the v2.6.3 add-on "replay jar patch 4"
`release-out/v2.6.3-20261003/flink-replay-jar-patch4/` (jar sha256 `043a645633a56579…`: bounded source, IOTDB_PASS, writer device path; Flink suite 279 / 0 / 2 skipped), a host-file replacement — no
Flink image swap, no job cancel or resubmit.

**What was wrong.** Found at Marun during the v2.6.3 test (step H) and reproduced in the lab: every
`EVIDENCE_RECONSTRUCTION` with `source=iotdb` (and every REPLAY with that source) came back
`ANALYSIS_RUN_SUBMIT_FAILED` — the JobManager rejected the program at submit time with "Detected an UNBOUNDED source
with the 'execution.runtime-mode' set to 'BATCH'". The job runs in BATCH (its Kafka branch is bounded by offsets),
but the historian branch wired its `IotDbBoundedSource` through `env.addSource(SourceFunction)`, which declares every
legacy source CONTINUOUS_UNBOUNDED whatever its `run()` does. Present since v2.5; never exercised because the UI sent
`source: 'kafka'` until CHG-035. The plant's `analysis_run` rows at 06:07 and 09:13/09:25 UTC carry the stack.

**What changed.** `CplmHistoricalReplayJob.historianSource(env, fn)` builds the source through the public
`DataStreamSource(env, typeInfo, new StreamSource<>(fn), false, name, Boundedness.BOUNDED)` constructor, same uid /
name / parallelism 1 as before. BATCH mode takes no checkpoints, so the FLINK-25920 restore loop that bit the announce
source in streaming jobs cannot occur here.

**Tests.** `CplmHistoricalReplayJobTest` (new, 2): the bounded wiring passes `env.getStreamGraph()` in BATCH (the
JobManager's pre-flight) with one source of parallelism 1; the legacy `addSource` wiring throws the exact
IllegalStateException. RED (missing method) → GREEN; Flink suite 277 run / 0 failures / 2 skipped (Docker Maven).
Lab 2026-10-03: with the new jar mounted into cplm-api the same POST that failed is **accepted** (HTTP 202, run
cc6dd5e2, job 516b30ff, tier long, source iotdb); the lab TaskManager has 0 free slots (two duplicate jobs after a
Docker restart), so the run waits there — completion is proven at the plant (6 free slots), step H of the runbook.

**Delivery and provenance.** cplm-api uploads its own mounted jar for bounded runs (`CplmRecompute__JarPath` =
host `src/flink/target/ams-flink-1.0-SNAPSHOT.jar`), so the fix reaches the plant by replacing that file (`cp`, not
`mv`: the bind mount holds the inode) and restarting cplm-api. The seven engine jobs keep the image jar
f7c99294e0767ea9; reconstruction manifests record the replay jar's hash in their provenance. The next Flink image
release carries the same source, which closes the split.

**Second cause, found after the jar patch (plant 10:37 UTC).** With the bounded source fixed, the plant still answered
"Could not execute application". A hand-built submission of the identical program arguments straight to the JobManager
was accepted (job c6b5bf75), which isolated the difference to one argument: `--brokers`. The job's `main` reads the
registry's parameter-update topic (`CplmParameterUpdateReader.readParameterUpdates(brokers)`) before submitting, and
cplm-api fills `--brokers` from `CplmRecompute:BootstrapServers`, whose default was the lab's `kafka:9092`; the plant
container set only the jar path for that section, so every submission there (Kafka or historian source, since v2.5) was
refused. Fixes: (1) the plant overlay forwards `CplmRecompute__BootstrapServers` from `KAFKA_BOOTSTRAP_INTERNAL`
(`test_plant_compose_gives_recompute_the_plant_brokers`, 35/35) — applied at the plant as a one-line patch of the overlay
and a cplm-api recreate; (2) `CplmRecomputeOptions.BootstrapServers` is now unset by default and
`EffectiveBootstrapServers` falls back to the service's own `Kafka:BootstrapServers` (`CplmRecomputeOptionsTests`, 3/3,
RED→GREEN) — ships with the next cplm-api image. The `Selector$CloseMode` lines in the JobManager log are Kafka admin
threads orphaned by cancelled jobs, not a cause.

**Third cause, found once the job ran (plant 11:0x UTC).** The bounded source opened the historian with
`root/root`: the compose files hand every Flink container the password as `IOTDB_PASS` (what `PipelineConfig` reads),
the replay job read `IOTDB_PASSWORD`. The lab's IoTDB keeps the default password, so only the plant failed
("801: Authentication failed" in `IotDbBoundedSource.run`). Fix: `CplmHistoricalReplayJob.envFirst` reads
`IOTDB_PASS` then `IOTDB_PASSWORD` (`historianCredentialsFollowTheFleetEnvNames`, RED→GREEN; suite 278 / 0 / 2 skipped);
the add-on jar is rebuilt. The plant's interim proof passed the credentials as program
arguments on a hand submission.

**Fourth cause, and the end-to-end proof (plant 12:23 UTC).** With credentials passed, the job ran and wrote nothing:
it read `root.<registry site>.cpm.<loop>` (`--site hdpe`, the UNS hierarchy site), while the historian writer stores
loops under its configured prefix `IotDb:LoopRootPrefix` = `root.site1.cpm` with SafeNode names (a leading digit
prefixed by `_`). A hand submission with `--site site1` produced `STANDARD/COMPLETE=3` manifests for run b6c924cf
(job 50d52c31): **reconstruction from the historian is proven at the plant.** Fixes: the job resolves the device from
`--iotdb-device`, else `--iotdb-root-prefix`, else `LOOP_ROOT_PREFIX`, else `root.site1.cpm`, joined with a SafeNode
mirror — never from the registry site (`historianDeviceFollowsTheWriterNotTheRegistrySite`, RED→GREEN); cplm-api passes
`--iotdb-device` = its own `IotDb:LoopRootPrefix` + `SafeNode(loop)` (`HistorianDeviceIsTheWritersPrefixPlusTheSafeNodeName`,
RED→GREEN, 4/4) — next image. Until then the jar's default prefix covers the plant.

**Closed at the plant 2026-10-03 13:19 UTC.** Patch 4 swapped (container jar `043a6456`, overlay brokers), then the
normal path — the request the workbench's Reconstruct button sends, nothing supplied by hand — for PIC10412 run
5d0d8ebf: accepted (run 4d697f22, job 50c44fb0), `STANDARD/COMPLETE=3` within 20 s.

### Release v2.6.3 add-on — what to run (CHG-036)

- Updated artifact: the host jar `/opt/AMS-open/src/flink/target/ams-flink-1.0-SNAPSHOT.jar` (replay/reconstruction only).
- Steps: `release-out/v2.6.3-20261003/flink-replay-jar-patch4/STEPS.md` — checksum, rollback copy, `cp` over the
  host jar, then the overlay line `CplmRecompute__BootstrapServers: ${KAFKA_BOOTSTRAP_INTERNAL:-kafka-1:9092,kafka-2:9092}`
  under cplm-api, `deploy.sh --prod` (recreates cplm-api), `printenv CplmRecompute__BootstrapServers` in the container,
  `sha256sum` inside the container = `043a6456…`, then RUNBOOK step H.

## CHG-037 — Evidence checksums failed on the plant UI: no SubtleCrypto over plain HTTP (2026-10-03)

**Scope:** `ams-frontend` only (`src/frontend-ob/src/components/Cpm/evidence/artifactCodec.ts`). Release v2.6.4.

**What was wrong.** The plant UI is served at `http://192.168.190.91:8090`. Browsers expose `crypto.subtle` only in a
secure context (HTTPS or localhost), so the artifact codec's checksum call threw "Cannot read properties of undefined
(reading 'digest')" for every chunk, the Explorer gate panel reported "An artifact did not verify … nothing is drawn
from bytes that failed their checksum", and no evidence chart drew at the plant. The lab runs on localhost and never
showed it.

**What changed.** `sha256Hex(bytes, subtle)` uses the native engine when the context has one and a pure-JavaScript
SHA-256 (FIPS 180-4) otherwise; `browserPorts.sha256` passes `globalThis.crypto?.subtle`. Same digest either way, so the
verification rule ("nothing is drawn from bytes that failed their checksum") is unchanged.

**Tests.** `artifactCodec.test.ts` (+2, RED→GREEN): the fallback matches the reference digests for `abc`, the empty
input and a 100 KB input compared with Node's `createHash`; the native path still matches. Frontend suite, lint and
build below. Lab browser proof with `crypto.subtle` removed from the page: Summary G11 (2 charts) and Workbench G8 (4 charts) verify and draw through the fallback. Plant proof: Ctrl+F5, open a gate on the Explorer Summary or the Evidence Workbench → the charts draw.

**Also in v2.6.4: the workbench polls while a reconstruction is pending.** The plant rebuilds a window in ~20 s, but
`GateEvidenceWorkspace` refetched the manifest once (too early) and then held it for 30 s, so the charts appeared only
on a reselect. The manifest is now polled every 10 s after an accepted reconstruction (`RECONSTRUCTION_POLL_MS`), and
the hook stops by itself once readiness is COMPLETE; the Summary gate detail already polled at 15 s.
`GateEvidenceWorkspace.test.tsx` (+1: fails without the change, passes with it; the hook coalesces manifest reads into
the batch endpoint, which the test counts). Suite 285 / 285, lint clean, build clean.

### Release v2.6.4 — what to build and run

- Updated service: `ams-frontend` (image). Nothing else; no SQL; no jar; no `.env` change. Deploys on top of v2.6.3.
- Build: `python migration/deploy/build-release.py --release v2.6.4 --skip-jar --out release-out/v2.6.4-<date>`.
- Plant: `sha256sum -c`, `gunzip -c ams-cpa-ams-frontend.tar.gz | docker load`, `deploy.sh --prod` with the usual
  exports (recreates ams-frontend only), `200` on `/`, users Ctrl+F5, then a gate's evidence charts draw.

## CHG-038 — The Short Feature job looped on expired checkpoints instead of catching up (2026-10-04)

**Scope:** `src/flink` (`CplmShortFeatureStreamJob.configureCheckpointing`), one test. Ships in release v2.6.5
(Flink image swap) together with CHG-036's cplm-api fallbacks and patch 4's replay fixes.

**What was wrong.** Three times at Marun (27 September, 3 October, 4 October) the Short job fell a few minutes behind
real time and never recovered: 32 completed checkpoints against 212 failed, 14 h behind, 1.48 M samples queued on
4 October. The job checkpointed every 3 min in exactly-once mode with a 5-minute timeout and Flink's default of zero
tolerated failures. Its six window operators (1-minute tumbling and sliding 5/1, 10/2, 15/5, 30/5, 60/5 minutes; one
sample lives in about 32 window instances in RocksDB) keep up with the live feed but cannot drain a backlog in five
minutes, so the aligned barrier waited behind the queue, the checkpoint expired, the job failed, the restore rewound
Kafka to the last good checkpoint, the backlog grew, and the next checkpoint expired too. The trigger varied (a Kafka
or TaskManager stall of a few minutes); the inability to recover was the constant. The manual remedy (cancel, reset
the group's offsets to latest, resubmit) loses the short windows of the looped period.

**What changed.** `configureCheckpointing`: tolerated checkpoint failures 1,000 (an expired checkpoint no longer fails
the job), unaligned checkpoints after a 30 s aligned attempt (the barrier overtakes the backlog; exactly-once kept),
timeout 15 min; cadence 3 min / 1 min pause and retain-on-cancel unchanged. Left alone, the job clears a backlog of
hours in well under an hour. The six other engine jobs keep their settings (thousands of completed checkpoints against
0 to 5 failed; their windows slide every 15 min).

**Tests.** `CplmShortFeatureStreamJobTest` (RED: method missing → GREEN); Flink suite below. The daily check's
section 4 (per-job checkpoint counts, Short consumer lag) and section 5 (minutes behind) are the operational proof.

### Release v2.6.5 — what to build and run

- Updated services: **`flink-jobmanager`** (image; the TaskManager uses it too) and **`cplm-api`** (image). No schema,
  no `.env`.
- Build: `python migration/deploy/build-release.py --release v2.6.5 --skip-jar --out release-out/v2.6.5-<date>` after
  `mvn package` (Docker Maven) has produced the jar.
- Plant: the bundle's VM-STEPS step 5 — `flink cancel` every job, `docker rm -f ams-flink-taskmanager ams-flink-jobmanager`,
  `deploy.sh --prod` (04b resubmits all seven), orphan-checkpoint sweep guarded by the running-jobs list; then cplm-api
  swap; proofs: `/capabilities` → one `jarSha256` on all workers, 7 RUNNING, 6 slots free, Short job checkpoints
  completing; next morning's daily check.


## CHG-039 — The Short Feature job: one sample buffer instead of six window operators; checkpoints deleted on cancel (2026-10-05)

**Scope:** `src/flink` — `CplmShortFeatureStreamJob` (graph + checkpoint cleanup), new `ShortFeatureBufferFn`,
`ShortWindowSpecs`, `ShortFeatureEmitter`; tests `ShortWindowParityTest`, `ShortWindowBacklogBench` (measurement),
`CplmShortFeatureStreamJobTest`. `migration/daily-check.sh` + `MARUN-DAILY-CHECK.md` §1. Ships in release v2.6.6
(Flink image swap). No schema, no topic, no cplm-api change; the output records are byte-identical.

**What was wrong.** Marun daily check 2026-10-05 05:56 UTC: 3 GB free on the shared disk, the Short job 1.46 M samples
(~14 h) behind with 18 failed checkpoints, no short features for 10 min. Two defects in the Short job:
1. *Cost.* Six `WindowOperator`s (1m tumbling; sliding 5/1, 10/2, 15/5, 30/5, 60/5 min) each kept their own copy of
   every member, so one sample was stored **32 times** (1 + 5 + 5 + 3 + 6 + 12) in RocksDB and every firing re-read its
   whole window. Live it kept up; after any pause it drained a backlog at ~22 samples/s per core, under back-pressure
   its unaligned checkpoints carried the queued data, and CHG-038's tolerance only stopped the restart loop — it could
   not make catching up cheap.
2. *Leak.* The job set `RETAIN_ON_CANCELLATION`, overriding the cluster's `DELETE_ON_CANCELLATION` (chosen on
   2026-10-02 precisely because retained trees filled this disk). Every cancel or redeploy of the Short job left its
   checkpoint tree in MinIO: the 2026-10-05 recovery cancel left **4.1 GB** (checkpoints 4.8 GB → 0.7 GB after the sweep).

**What changed.**
- `ShortFeatureBufferFn` (one `KeyedProcessFunction` per loop) fires all six kinds from one buffer with Flink's exact
  window contract (`ShortWindowSpecs`): fire when the watermark reaches `end - 1` if the window has members; fire again
  for every member arriving within its allowed lateness; drop a sample late for every window it falls in; members in
  arrival order. Same kinds, sizes, slides and lateness; cplm-api's window contract is unchanged.
- State layout, chosen so a sample costs O(1) to write: the sample is stored once under its arrival sequence
  (`MapState<seq, sample>`); a per-minute index (`MapState<minute, long[] seqs>`) turns a window into a run of minutes
  (every window starts and ends on a whole minute); a firing reads only the minutes of the largest window it fires;
  eviction deletes whole minutes once the last window that can hold them is cleaned. Every firing and eviction time is
  a minute boundary − 1 ms, so ONE chained event-time timer per loop (re-armed each minute while anything is buffered)
  replaces per-sample timers. Per sample: 1 sample write + 1 small index write + at most 1 timer, against 32 list
  appends + 64 timer registrations before.
- `ShortFeatureEmitter`: the per-window maths and evidence side output, shared verbatim with the old window function.
- **State backend (decided 2026-10-05):** the Short job sets `HashMapStateBackend` itself
  (`configureStateBackend`); every other job keeps the cluster's RocksDB. Checkpoint storage (MinIO) is unchanged.
- **TaskManager memory:** `taskmanager.memory.process.size` 2560m → **3584m** (plant overlay and lab compose): task heap
  640 → ~1,100 MB for the ~250 MB heap buffer, managed 717 → 1,086 MB (RocksDB 45 → 68 MB per slot for the other jobs).
  The host has 62 GiB with ~10 GiB available.
- Checkpoints: `DELETE_ON_CANCELLATION` (cadence, timeout, tolerance, unaligned from CHG-038 unchanged).
- Daily check: a `checkpoints N MB` line (WARN > 1.5 GB, ACT > 3 GB); the short-features line no longer prints
  "newest window - UTC, -1 min behind" when there are no rows.

**How the layout was chosen (lab 2026-10-05, measured, not guessed).** Three cuts ran on the lab under the full-plant
simulator (161 loops, ~215 samples/s):
1. one flat `MapState<seq, sample>` read whole and scanned for eviction on every timer: fine at the plant's density,
   but at ~5,000 buffered samples per loop it fell to **16 samples/s** after a TaskManager restart (stuck at watermark);
2. one-minute `MapState<minute, List>` buckets: **153 samples/s**, thread dumps 8/8 inside `RocksDB.put` — every sample
   re-wrote its whole minute (60–80 heavy samples);
3. the final layout above. Thread dumps then put the remaining cost in reads (`RocksDB.get` + POJO decode of the 1.1
   tuple with its five-role map): each sample is decoded ~20× over its life (5m/10m re-read 10 min every minute, 60m reads
   an hour every 5 min) — the old graph paid the same reads plus 32× the writes. A heap cache of decoded samples would
   remove most reads but needs ~150–200 MB of the ~640 MB task heap the seven plant jobs share: **not done**; recorded in
   `prod_decision.md` §7 as the next lever if a larger plant needs it.

**Tests.**
- `ShortWindowParityTest` runs the v2.6.5 six-operator graph and the new operator on one scripted stream (3 loops,
  150 min, jitter, local disorder, late samples in every lateness band inside and beyond 30 s / 60 s / 90 s / 2 / 3 min,
  duplicates, a loop silent 45 min, a 10-min watermark jump with the stalled samples draining late, evidence ALL):
  15,749 records, identical as a multiset, on the heap **and** the RocksDB backend; plus window assignment checked
  against Flink's own `SlidingEventTimeWindows` for 12,000 timestamps. Mutation checks: disabling late re-firing
  (15,749 vs 13,683) and evicting 5 min early (15,749 vs 15,230) both fail it.
- Flink suite: 283 run, 0 failures, 2 skipped (as before).
- `ShortWindowBacklogBench` (144 loops, 30-min backlog queued, RocksDB, parallelism 1, evidence off; `-Dshort.bench.real=true`
  uses the lab's real 1.1 tuple from `src/test/resources/cplm/real-loop-sample.json` with a resolved profile):

  | 30-min backlog, plant rate (51,840 samples) | v2.6.5 six windows | CHG-039 buffer |
  |---|---|---|
  | real 1.1 tuples | **22 samples/s** (13,416 done in the 10-min cap), checkpoint 43.4 MB and growing | **648 samples/s** (all in 80 s), checkpoint 13.9 MB — **~30×** |
  | light synthetic tuples | 130 samples/s, checkpoint 31.3 MB | 3,308 samples/s, checkpoint 2.7 MB |
  | 1 s feed, 90-min backlog (777,600, light) | not run (hours) | 1,705 samples/s |

  This matches the plant: 22/s × 4 subtasks ≈ 88/s of capacity against a 29/s feed keeps up live but drains a backlog
  at ~60/s (1.46 M ≈ 7 h, growing meanwhile).
- **The plant's RocksDB memory is the second bottleneck (found 2026-10-05, measured).** Marun/lab TaskManager: 717 MB
  managed memory over 16 slots = ~45 MB of RocksDB memory per slot; there `RocksDB.put` stalls (thread dumps 26/33).
  `ShortWindowBacklogBench -Dshort.bench.managedMb=N`, real tuples, 90-min buffer, one core:

  | RocksDB memory per slot | 45 MB (Marun today) | 72 MB | 128 MB | heap state (`HashMapStateBackend`) |
  |---|---|---|---|---|
  | CHG-039 operator | 47 samples/s | 127 | 208 | **804** (full snapshot 116 MB; ~250 MB live heap) |

  On RocksDB at Marun's 45 MB per slot the new operator would still take ~2 h for a 1.46 M backlog; on the heap, at
  ~800/s per core × 4, about 8 min. Hence the heap decision above. Marun read-only diagnosis the same day (v2.6.5 job):
  source 100 % back-pressured again, Short state **596.6 MB**, a checkpoint takes **553 s** against a 3-min interval,
  RocksDB working dir 3.6 GB, disk 5.2 GB free; no active swapping (si/so 0; swap held by Instrumental's sqlservr).
- Lab, same TaskManager and feed (overloaded lab TM: 14 jobs, RocksDB writes throttled): v2.6.5 job **7 samples/s**
  (its 60m operator 100 % busy), CHG-039 82–94 samples/s.

**End-to-end on the lab (final build, jar `b432802ffcd25622`, heap state).** Lab TaskManager recreated with 3584m
(taskHeap 1,101 MB). Short job submitted with the supervisor's arguments at parallelism 3 (the free slots); OT
simulator, 30 HDPE loops through mosquitto → ingestion-service → `traverse.cpa.loop.samples.v1` (~37 samples/s, buffer
~140,000 samples at 60 min — Marun-like). Readings 11:28–12:06 UTC: window operator busy 0–30 ms/s while keeping up;
all six kinds written by cplm-api, newest window ~3 min behind real time (out-of-orderness + exactly-once commit, as
before); checkpoints 0 failed, growing with the buffer (79 MB at 38 min); heap 540–770 MB of 1,230 with no old-generation
GC. At 11:36 a lab ZooKeeper suspension suspended all 16 jobs: the Short job restored from its heap checkpoint and
resumed producing windows (restore proof). Near-full buffer (55 of 60 min, 12:18–12:23): busy 0 ms/s, windows ~2 min
behind, checkpoint 111–118 MB (bench predicted ~116 MB), heap 647–843 of 1,230 MB, no old-generation GC. A second
restore ~12:12 (while the PC wrote the bundle image) recovered by itself; its cause was not verified.

### Release v2.6.6 — what to build and run

- Updated services: **`flink-jobmanager`** (image `ams-flink`; the TaskManager uses it too) and the **TaskManager memory**
  (`migration/deploy/docker-compose.marun.yml`: process 3584m; applied when step 5 recreates the TaskManager). Source
  archive: that overlay, `migration/daily-check.sh`, `MARUN-DAILY-CHECK.md`. No schema, no topic, no `.env`, no cplm-api /
  frontend change. Check before deploying: `free -g` shows ≥ 2 GiB available beyond the +1 GiB the TaskManager takes.
- Build: `mvn package` (Docker Maven) → `python migration/deploy/build-release.py --release v2.6.6 --skip-jar
  --out release-out/v2.6.6-<date>`.
- Plant (VM-STEPS step 4a + step 5, same as v2.6.5): extract `src-<commit>.tar.gz` over `/opt/AMS-open`; load the
  `ams-flink` image; `flink cancel` every job; `docker rm -f ams-flink-taskmanager ams-flink-jobmanager`;
  `deploy.sh --prod` (04b resubmits all seven); then the orphan-checkpoint sweep guarded by the running-jobs list —
  it must also remove the v2.6.5 Short job's tree, which that version keeps on cancel.
- Proofs: `/capabilities` → one `jarSha256` on all workers; 7 RUNNING, 6 slots free; the Short job's graph shows
  `cplm-short-windows` and `/checkpoints/config` → `delete_on_cancellation: true`; within the hour all six short kinds
  in `analytics.cplm_short_feature_results`; next morning's daily check: `checkpoints` under 1.5 GB, Short lag under
  50,000, short features minutes (not hours) behind.
- Rollback: load the `ams-flink:pre-v2.6.6` image tag and repeat step 5 (output format unchanged, nothing to migrate).

## CHG-040 — SME review #1-#2: Loop Performance menu organised by user task; menu keeps the loop and plant scope (2026-10-05)

**Source:** `SME_review.md` (2026-10-05), points 1 and 2. First item of the SME review batch; the batch is deployed as one
release at the end.

**Scope:** `ams-frontend` only (`src/frontend-ob`): `components/nav/{cpmTasks.ts, cpmTasks.test.ts, navItems.ts,
Sidebar.tsx}` (new; the menu and sidebar moved out of `App.tsx`, 991 → 833 lines), `App.tsx`, `components/CommandPalette.tsx`,
`components/Cpm/shared.tsx` (`WorkspaceHeader` gained `page`), the headers of the 13 Loop Performance pages,
`styles/app.css` (`.nav-subsection__title`). No route, service, schema or Flink change; bookmarks keep working.

**What the SME said.** (1) Navigation follows internal analysis functions: Evidence Replay, Evidence Workbench,
Investigation, Window Inspector and Calculations are separate pages whose difference is not clear; organise around the
task — find the problem, check the loop, understand the cause, record the action. (2) Opening another page from the menu
asks to select the loop again.

**Verified against the code.** Both correct. The Loop Performance group was one flat list of 13 entries in build order
(configuration pages between the analysis pages); six pages answer "why did this loop get this verdict" with nothing
saying which to use. The URL is the only selection state (`cpaHref.ts`) and every sidebar entry navigated to the bare
path, so the menu dropped `?loop=` and `?site/area/unit=`; every one of the 13 pages reads `?loop=`.

**What changed.**
- `cpmTasks.ts` is the one source of truth per page: the task (Find problems / Check a loop / Understand the cause /
  Set up) and one plain sentence of what the page answers. The sidebar renders the group under those task sub-headings
  in task order, the sentence is the entry's tooltip, and each page header shows the task as its eyebrow and the
  sentence as its copy (pages with a dynamic title — Evidence Workbench, a loop's Gate Configuration, a loop's System
  Response — show "task · page name"). Internal wording left the headers ("Gate-level forensics", "Windowing internals").
  Titles aligned with the menu labels: "Loop explorer", "Loop events", "Historical", "Calculations".
- `cpmNavHref`: a menu entry (sidebar and Ctrl+K palette) opened FROM a Loop Performance page keeps `loop`, `site`,
  `area`, `unit`. Pipeline Health and Governance (System group) and every non-CPM page stay bare.

**Deliberately not done.** The evaluated window is not carried — each page names it differently (`window` = kind on
Performance/Explorer, = END on Historical/Replay, `profile` on the Window Inspector, a run id on the Workbench); a
canonical period belongs with SME #3 (persistent loop/period header). Merging Replay / Workbench / Window Inspector into
one evidence page is deferred: too large a UI change for this release. "Record the action" has no page of its own yet:
Loop Events (acknowledge/shelve) sits under Find problems; loop-level notes are SME #23.

**Tests.** `nav/cpmTasks.test.ts` (new, 6: loop + scope carried, window not carried, bare path from/to outside Loop
Performance and to Pipeline Health, blank values dropped, every page has task + purpose). Frontend suite 291 / 291 (67
files), `tsc` clean, `npm run lint` clean (0 warnings), `npm run build` clean. **Lab browser pass 2026-10-05** (Vite 5174,
admin, FIC10301): sidebar shows the four sub-headings and all 13 tooltips; from `/cpm/explorer?loop=FIC10301&site=site1`
each of the 12 other Loop Performance entries opened with `loop=FIC10301&site=site1` (Investigation and Evidence Workbench
opened on the loop with no "pick a loop" prompt; the Workbench resolved its newest run on its own); every header shows the
task eyebrow + purpose; from `/trend` the menu opens the bare `/cpm/investigation`; 0 console errors. Dev-only note: Vite's
first-use dependency optimisation reloads the page and drops the in-memory session — log in again (not a product bug).

## CHG-041 — SME review #3: a loop context bar that stays in view (loop, service, location, period) (2026-10-05)

**Source:** `SME_review.md` point 3. **Scope:** `ams-frontend` only: `components/Cpm/context/LoopContextBar.tsx` (+ test,
new), `styles/cpm-context.css` (new, imported in `main.tsx`), one line in each of 11 pages (Explorer, Historical,
Investigation, Evidence Workbench, Replay, Window Inspector, Calculations, System Response, Loop Events, Performance,
Overview). No service, schema or Flink change; no new request (the bar reads the cached `useCpmLoops` list).

**What the SME said.** On long pages the loop and the period go out of view; a persistent header should show the
current loop, service, location and selected window.

**Verified on the lab before the change (1440×900, FIC10301).** Correct. Loop pages run 1.9–4.9 screens; after
scrolling to the bottom the loop id was nowhere on screen on Investigation, Evidence Workbench, Performance, Window
Inspector, Overview, Historical and Calculations; no page showed the loop's site › area › unit (the scope filter
said "All sites"); the window sat inside a card (Investigation) or a toolbar. The registry has no "service" field —
`displayName` + `loopType` + `criticality` is what exists (a real service description would be a new registry column).

**What changed.** One sticky row under each page header: `LOOP <id> <displayName> <type · criticality>` ·
`LOCATION site › area › unit` · `PERIOD <what this page shows>`. The period is passed by the page because "window"
differs per page: Investigation the evaluated fused window (latest / selected) with start → end; Replay the selected
24h fused window; Evidence Workbench the opened run's window in the site zone; Window Inspector the profile list or the
opened window; Historical the from → to range; Calculations "Latest results · 24h fused window" with its times; System
Response the selected response event; Explorer "Gates: latest 24h fused window · trend: last 8 h"; Performance / Overview
/ Events a label only (they hold no single window). Times always name the zone. The bar renders nothing without a loop,
says "not in the loop registry" for an unknown id, sticks flush to the scroller edge across the full width, wraps on
narrow screens, and publishes its measured height (`--cpm-context-h`) so the sticky side panels (Performance evidence
inspector, Workbench explain column, Response event list) stop 16 px below it instead of sliding under it.

**Deliberately not done (user decision 2026-10-05, Option A).** The period is shown, not carried between pages; a shared
period parameter belongs with SME #12–#13. No "service" registry field (backend + migration).

**Follow-up (user, 2026-10-05):** the bar is NOT shown on the fleet pages — Overview and Performance — where a carried
`?loop=` only highlights a row; it stays on the 9 loop pages (Explorer, Historical, Investigation, Evidence Workbench,
Replay, Window Inspector, Calculations, System Response, Loop Events filtered to a loop). Lab-checked: absent on `/cpm` and
`/cpm/performance?loop=FIC10301`, present on Explorer / Investigation / Events; 0 console errors.

**Tests.** `context/LoopContextBar.test.tsx` (new, 7: period text with range/zone, epoch + end-only, label-only and
unparseable times, location text, no loop → nothing, case-insensitive loop match with all four facts, unknown loop).
Frontend suite 68 files green, `tsc` clean, lint clean, build clean. **Lab browser pass 2026-10-05** (Vite 5174, FIC10301):
bar present with the right loop/location/period on all 11 pages; scrolled to the bottom it holds at the scroller top (62 px)
on every page, full width, horizontal overflow 0; Workbench explain column and Performance inspector hold 16 px below it;
1000 px wide it wraps to three lines and the panels' offset follows (79 px); night theme via tokens; 0 console errors.

## CHG-042 — SME review #4: the loop page opens with a summary (condition, severity, cause, evidence, data, next check) (2026-10-05)

**Source:** `SME_review.md` point 4 (+ the #6/#24 separation for the readiness banner). **Scope:** `ams-frontend` only:
`components/Cpm/explorer/summary/{LoopSummaryCard.tsx, summaryText.ts, summaryText.test.ts}` (new),
`explorer/{LoopWorkspace.tsx, SummaryTab.tsx, readinessCauses.ts}`, `cpaHref.ts` (+`investigationHref`, `historicalHref`),
`context/LoopContextBar.tsx` (shared `fmtInstant`), `styles/cpm-loop-summary.css` (new, in `main.tsx`). No request added:
the card reads the `gates/latest` row LoopWorkspace already holds (same query key).

**What the SME said.** The main loop page should show a short summary first — current condition, severity, diagnosis,
important evidence, data availability and next checking action; today they are scattered between badges, gate panels and
lower sections.

**Verified on the lab before the change (FIC10301, 1440×900).** Correct. Severity (`HIGH`) and the engine's recommendation
were in the served row but shown nowhere on the Explorer (only on Investigation); the evidence score sat at 1,155 px below
the fold; the leading hypothesis and the data facts (12,068 samples, observability flags) were not shown at all. The most
prominent element above the fold was a yellow "Degraded evidence · 2 causes" banner whose causes were configuration gaps
(no VP mapped, no peer links), not faults. B2_027PIC: newest window insufficient (93 samples), last real verdict "excluded
mode" 57 days earlier — nothing said so.

**What changed.**
- **Loop summary card** at the head of the loop workspace, above the tabs (so it heads every tab and fits the first screen:
  388–704 px of a 732 px viewport). Tone on the left border like the KPI tiles. Condition in plain words ("Oscillation
  confirmed", "Not evaluated: not enough data", "Excluded: loop not in automatic"); severity pill + loop criticality;
  leading cause with "evidence score" (tooltip: uncalibrated, not a probability — SME #20 wording); evidence seen (present
  observations, main first, supporting marked); data (samples + window, and "ended N days ago" in caution colour once the
  window is older than its own size); limitations (observability flags as what each costs, two shown + "and N more");
  next check (engine recommendation, else a state-specific fallback) with ONE primary action that goes where the check is
  done — Investigation for a finding, Window Inspector for insufficient data, Historical for excluded mode — and the
  Evidence Workbench as secondary. When the newest window has no verdict, the card names the last verdict and its age.
- **Readiness banner**: with nothing blocking it is "Configuration limits" in neutral styling, items labelled LIMIT (muted);
  blocking causes keep the alarm treatment ("Not producing verdicts", BLOCKING).
- One date format across the summary surfaces (`fmtInstant` / `fmtPeriod`, zone named).

**Deliberately not done.** Header pills (GOOD / health / diagnosis label clarity) = SME #9; trend scaling = SME #10.

**Tests.** `summary/summaryText.test.ts` (new, 12: condition wording incl. not-judged states, limitation phrases
de-duplicated, evidence order/cap/legacy, leading cause, next-check fallback, age text, primary action per state,
staleness = window size), `cpaHref.test.ts` (+2), `context/LoopContextBar.test.tsx` (+1 `fmtInstant`). Frontend suite
69 files green (one unrelated CHG-032 `EventDetail` test timed out once under full-suite load and passes on rerun and
alone), `tsc`, lint and build clean. **Lab browser pass 2026-10-05:** FIC10301 card complete above the fold, no false
stale flag; B2_027PIC shows the last verdict "Excluded … 10 Aug 01:00 GST (57 days ago)", "ended 48 days ago", primary
"Open Window Inspector ›" → `/cpm/windows?loop=B2_027PIC`; card present on the Signals tab; night theme and 1000 px
stacked layout, no horizontal overflow; 0 console errors.

## CHG-043 — SME review #5/#6: the Overview shows the operating picture; configuration limits move to Readiness (2026-10-05)

**Source:** `SME_review.md` points 5 and 6. **Scope:** **`cplm-api`** — `Data/FleetLatestSql.cs` (`SummaryByStatus`,
`StaleAfterSeconds`), `Controllers/CpmFleetController.cs` (`fleet/summary` gains an additive `statuses` block; `diagnoses`
unchanged); **`ams-frontend`** — `components/Cpm/overview/{OperatingPicture.tsx, ReadinessStrip.tsx, operatingStates.ts
(+test)}` (new), `CpmOverview.tsx`, `api/cpmApi.ts` (`CpmFleetStatuses`), `styles/cpm-loop-summary.css`. Tests:
`tests/cplm-api.Tests/FleetStatusSqlTests.cs` (new). No schema change, no migration, no new index.

**What the SME said.** (#5) The Overview gives too much space to missing positioner feedback and configured peers while the
basic operating picture is incomplete — show healthy, poor performance, excluded, stale and not evaluated; configuration
limitations can sit in a separate readiness section. (#6) "Need attention 164" beside "164 loops evaluated" mixes counts;
excluded mode, missing data and confirmed abnormal performance must not look like the same problem.

**Verified before the change (lab, 230 monitored).** Correct. The four tiles were Loops monitored 230, Need attention 164
(= every non-green verdict: 162 confirmed oscillation + 1 suspected final element + 1 excluded mode; the sub-label "164
loops evaluated" was the same number), and two configuration counts (224 without VP, 228 without peers) in caution yellow.
`SummaryByDiagnosis` counts a loop's newest real verdict of ANY age and skips loops with none: 66 loops appeared nowhere,
B2_027PIC's 57-day-old verdict counted as current; no healthy / stale / not-evaluated count existed.

**What changed.**
- cplm-api `statuses`: every monitored loop in exactly one state (they add up to `loops.monitored`) — no verdict →
  `insufficientData` (it has LIVE rows) or `noResult`; verdict window ended longer ago than the window size → `stale`
  (checked first); `EXCLUDED_*` → `excluded`; NORMAL/NONE/HEALTHY → `healthy`; CONFIRMED_/SUSPECTED_/DETECTED_/CLASSIFIED_*
  → `poor`; anything else → `unclassified` (counted, never dropped); plus `staleAfterSeconds`. Lab: poor 161, stale 3,
  insufficient data 1, no result yet 65 = 230; 20 ms (EXPLAIN ANALYZE); cached like the other fleet reads.
- Overview: an **Operating picture** panel — "230 loop(s) monitored · of 230 registered", one segmented bar (part-to-whole;
  not-evaluated hatched so it differs from excluded by pattern, not only colour) and five KPI tiles in the SME's order
  (Healthy · Poor performance · Excluded · Stale · Not evaluated) with count, share and a one-line meaning; "Show loops ›"
  opens Performance on `rows=attention` / `rows=notEvaluated` (no button where Performance has no matching filter).
  Configuration limits moved to a neutral **Readiness · Configuration limits** strip at the bottom with "Open Loop Registry ›".
  An older cplm-api without `statuses` gets a stated notice, not zeros.

**Deliberately not done.** Priority-queue ranking (#7), "100% conf" wording in the queue (#20), trend scaling (#10).

**Tests.** `FleetStatusSqlTests` (new, integration against the lab DB: every monitored loop in one state and the counts equal
a C# oracle over a plain DISTINCT ON read; a site scope sums to that site's monitored loops) + `FleetStaleAfterTests` (8
cases); fleet SQL suites 20/20. `overview/operatingStates.test.ts` (new, 5). Frontend 70 files green, lint / tsc / build
clean. **Known pre-existing failure:** `EvidenceClassSweepTests.The_transient_budget_deletes_the_oldest_live_rows_until_the_class_fits`
fails on the lab DB with or without this change (proven by stashing it) — not caused here, to be looked at separately; the
rest of cplm-api.Tests passes (235/236). **Lab browser pass 2026-10-05:** cplm-api rebuilt and restarted (`docker compose
build cplm-api && up -d --no-deps cplm-api`, healthy in 8 s); the Overview shows 0 / 161 / 0 / 3 / 66 with 70 % / 1 % / 29 %;
the two "Show loops ›" open `/cpm/performance?rows=attention` and `?rows=notEvaluated`; Readiness strip at the bottom;
panel 260 px tall (~360 px in the first cut — tiles compacted); 1000 px keeps the five tiles on one row; night theme;
0 console errors.

## CHG-044 — Responsive guards across the CPM pages (user rule, 2026-10-05)

**Source:** user rule during the SME batch — every page, container card, KPI, button and trend must be responsive.
**Scope:** `ams-frontend` only: `styles/cpm-responsive.css` (new, imported in `main.tsx`). CSS only, no component change.

**Measured on the lab before the change** (13 CPM pages, page-level horizontal overflow of `.page-content`, outermost
element past the visible content edge; Chrome's narrowest window ≈ 500 px): Performance +130 (toggle group, pagination),
Loop Explorer +108 (gate-strip panel head: kind toggle + verdict pill on one unbreakable row), Investigation +135 (fr grid
columns grown to min-content by nowrap window rows), Evidence Workbench +1,484 (an unbroken id in a key/value row; at
768 px +16 from a KPI tile value), Loop Events +465 (filter toggle group), Gate Configuration +4 (pills in a table cell).
Overview, Historical, Replay, Window Inspector, Calculations, System Response, Loop Registry: 0.

**What changed (shared rules, so every page benefits):** panel heads and their right-hand controls wrap under the title;
`.cpm-grid-2` children may shrink (`min-width: 0`); Investigation window rows use shrinkable columns and stack under
600 px; key/value values wrap long tokens (`overflow-wrap: anywhere`, label capped at 45 %); OpenBridge toggle groups and
pagination scroll inside their own box; data tables scroll inside their card under 900 px (desktop untouched); KPI tiles
shrink and wrap long single-word values.

**Lab pass 2026-10-05:** all 13 pages at 0 px page overflow at ~500, 768, 1000 and 1440 px (wide content — the Performance
matrix, tables, toggle groups — scrolls inside its own container). Frontend 70 files green, lint and build clean, 0 console
errors. **Known, deferred to SME #15:** raw machine tokens in Workbench tiles (e.g. `OSCILLATION_TUNING`) now wrap
mid-word on narrow screens instead of overflowing; #15 replaces them with plain wording.

## CHG-045 — SME review #7: the priority queue ranks by ISA-18.2-style priority and says why (2026-10-05)

**Source:** `SME_review.md` point 7. **Scope:** **`cplm-api`** — `Data/FleetPrioritySql.cs` (new: queue + shelved count),
`Controllers/CpmFleetController.cs` (`fleet/rankings?orderBy=priority`, additive row fields `priority`, `episodeOpenedAt`,
`episodeWindowCount`, `ackState` and response `shelvedCount`; the other orders unchanged); **`ams-frontend`** —
`components/Cpm/overview/{PriorityQueue.tsx, priorityReason.ts (+test)}` (new), `CpmOverview.tsx`, `api/cpmApi.ts`,
`hooks/useCpm.ts` (`useCpmLoop` no longer retries a 404), `styles/cpm-loop-summary.css`. Tests:
`tests/cplm-api.Tests/FleetPrioritySqlTests.cs` (new). No schema change, no migration, no new index.

**What the SME said.** Several loops show the same 100% confidence but very different performance (plant: FIC10401 good 97 %,
LIC10404 good 21 %). The queue needs a visible ranking reason including severity, criticality and persistence; confidence
alone does not say which loop needs action first.

**Verified before the change (lab).** Correct. The queue was `ORDER BY confidence DESC`; 162 loops share confidence 1.00,
so its top rows were alphabetical (FIC00701, FIC10301, FIC10302 …). Severity is HIGH on 164 of 165 verdicts, the registry's
criticality (12 critical / 15 high / 190 medium / 13 low) was not used, persistence (the open episode's `opened_at`,
`window_count`) was not used, the good-error bar was shown but did not order anything, and shelved loops competed for the
top six.

**Decision (user: "check what the standard is and go with that").** ISA-18.2 / EEMUA 191: priority from consequence
severity × time to respond, at most 3–4 levels, target distribution ~5 % high / 15 % medium / 80 % low; a shelved alarm is
removed from the active list and shown in a separate shelved list; acknowledged alarms stay listed, marked. Implemented as
three levels — consequence = loop criticality, urgency = finding severity (critical: HIGH/MEDIUM→High, LOW→Medium; high:
HIGH→High, MEDIUM→Medium, LOW→Low; medium: HIGH→Medium, else Low; low: Low; unset criticality = medium, unset severity =
LOW). Inside a level: worst control impact (lowest good-error share), then longest persistence (oldest open episode), then
evidence score, then loop id. Queue = current findings only (the CHG-043 "poor performance" rule), actively shelved
episodes left out and counted, an expired shelf brings the loop back.

**What changed in the UI.** Overview queue rows: priority badge (High = alarm tone, Medium = caution, Low = neutral), loop
route, condition in plain words, an "Acknowledged" marker, and a reason line ("High-criticality loop · High severity ·
persisting 10 h (1 window) · evidence score 100") beside the good-error bar (impact said once). The panel states the rule in
one line; "N shelved ›" opens Loop Events on the shelved filter when any are shelved. "Highest-confidence finding" became
"Top-priority finding" and says why the loop heads the queue; the focus panel reads "top-priority loop". A `?loop=` outside
the queue (healthy, excluded, not evaluated) now previews through a single-loop lookup made only in that case (before: "not
in the ranking"); an unknown id still says so, with one request instead of three retries.

**Lab result.** 161 queued + 0 shelved = the operating picture's 161 poor; 1 High (FIC10302, high criticality), 160 Medium,
0 Low — the lab registry is almost all "medium" and the engine rates nearly every finding HIGH severity, so ISA-18.2's "High
stays rare" holds but Low is empty: review criticality and severity at the plant (prod_decision.md). Medium loops order
worst-impact first (16 % in band before 22–23 %).

**Tests.** `FleetPrioritySqlTests` (new, integration on the lab DB: every queued row is a current finding, its level equals
the C# matrix, rows follow level → impact → persistence; queue + shelved = POOR count; shelving one episode inside a rolled-
back transaction removes it and counts it, an expired shelf brings it back) + `FleetPriorityLabelTests`; fleet SQL suites
27/27. `overview/priorityReason.test.ts` (new, 6). Frontend 71 files green, lint / tsc / build clean; cplm-api.Tests
242/243 (the pre-existing `EvidenceClassSweepTests` failure, CHG-043). **Lab browser pass 2026-10-05:** cplm-api rebuilt and
restarted; queue and finding card as above; rows 115 px (first cut ~170, impact moved beside the reason); 0 px page overflow
at 500 / 768 / 1000 / 1440; night theme; no console errors in normal use (a deliberately unknown `?loop=` logs its one 404).

## CHG-046 — SME review #8: signal quality, instrument health, control performance and diagnosis are labelled apart (2026-10-06)

**Source:** `SME_review.md` point 8. **Scope:** `ams-frontend` only: `components/Cpm/FacetPill.tsx` (+test, new),
`overview/{LoopFocus, GoodErrorBar, PriorityQueue}.tsx`, `explorer/{LoopWorkspace.tsx, summary/OperatingState.tsx}`,
`AttentionList.tsx`, `styles/cpm-loop-summary.css`. No service change.

**What the SME said.** A green GOOD badge, a green performance bar and a red confirmed diagnosis can appear together; they may
refer to different things but the labels do not say so. Separate signal quality, control performance and diagnostic condition.

**Verified before the change.** Correct. Four facts, unlabelled or colliding: the Overview focus panel's green "● GOOD" (live PV
signal quality, OPC/NE107) with a green-tinted PV pill; the queue / attention-list bar "good 22%" / "good error 22%" (share of
the evaluated window in the good-error band) — the same word as the signal's GOOD; the Explorer header's red "CONFIRMED
OSCILLATION" (the verdict) with no caption; "HEALTH NOT CONFIGURED" (Instrumental transmitter health). The focus panel's OP pill
was permanently caution-yellow (it matched the OP pen colour) — an alert colour used as a pen identity (ISA-101).

**What changed.** One `FacetPill` — a fixed caption + the toned value — for the four facets everywhere they appear:
**Signal quality** (Good / Uncertain / Bad / Maintenance / Out of service, NE107), **Instrument health** (OK / Limited / Fault /
Not configured), **Diagnosis** (the plain condition wording of the loop summary), and **Control performance**, which is the bar,
now "N% in band" with the facet tooltip (never "good N%"). Overview focus panel: PV / SP / OP / MODE value pills neutral, signal
quality its own captioned pill. Explorer header: Instrument health + Diagnosis captioned; operating-state line: Signal quality.
Queue rows: the condition is the Diagnosis facet.

**Found during the lab pass and fixed (same facet):** the focus panel said "Signal quality · Good" for a value last received 16 h
earlier (the lab simulators had stopped overnight). Signal quality is now judged as of now: a value older than 10 min (two of the
feed's 300 s heartbeats — the Explorer tiles' existing threshold) shows its age, and a stalled "Good" becomes **"Uncertain · last
value 16 h ago"** in caution tone (OPC UA: Uncertain, last usable value). A stalled Bad stays Bad, with its age.

**Tests.** `FacetPill.test.tsx` (new, 7: caption always present, each facet's caption, quality and health wording, fresh vs
stalled quality). Frontend 72 files green, lint / tsc / build clean. **Lab browser pass 2026-10-06** (Docker restarted after the
overnight stop): Overview focus "SIGNAL QUALITY Uncertain · last value 16 h ago" (warn), neutral value pills, queue rows
"DIAGNOSIS Oscillation confirmed" and "22% in band"; Explorer header "INSTRUMENT HEALTH Not configured" (muted) and "DIAGNOSIS
Oscillation confirmed" (bad), operating-state line Signal quality; 0 px page overflow on Overview / Explorer / Performance at
500 / 768 / 1000 / 1440; night theme; 0 console errors.

## CHG-047 — SME review #9/#10: trends get named PV and OP axes with units, the band explained, and a Fit / Engineering-range scale (2026-10-06)

**Source:** `SME_review.md` points 9 and 10. **Scope:** **`ams-frontend`** — `components/Cpm/trend/{SignalTrend.tsx,
trendOption.ts (+test)}` (new, shared by the Overview focus panel, the Explorer operating state and the Investigation
evidence chart, replacing three copies), `historical/chartOption.ts` (+test updated), `replay/ReplayChart.tsx`,
`CpmHistorical.tsx`, `CpmReplay.tsx`, `AddLoopWizard.tsx`, `csvImport.ts` (+`csvImport.unit.test.ts`), `api/cpmApi.ts`,
`styles/cpm-loop-summary.css`; **`cplm-api`** — `CpmEngineeringRange.PvUnit`, `CpmLoopRegistryReads.ReadRange`,
`CpmLoopRegistryService.Bulk.cs` (`HasRange`, `SerializeRange`, `EngineeringMerge`); tests `EngineeringUnitTests.cs` (new).
**No schema change, no migration** (`engineering` is a jsonb column: `pvUnit` is one more optional key). The Flink
`cplm.loop.engineering` broadcast is unchanged (numbers only).

**What the SME said.** (#9) FIC10401 shows a confirmed oscillation but its trend looks flat: PV ≈ 800 on a wide scale
with OP ≈ 29 at the bottom — PV/SP need a useful scale and OP a separate percentage scale. (#10) Loops whose PV and OP
share a magnitude look reasonable on one axis though their units differ; every axis needs units and clear signal
assignment; the shaded envelope needs explaining.

**Verified before the change.** Correct. The Overview focus trend, the Explorer 8 h trend and the Investigation evidence
chart drew PV, SP, OP (and VP) and the band on ONE unnamed value axis. Historical and Replay already split PV/SP from
OP/VP but named the axes with the placeholder "EU" and "pp". The band had no legend entry or explanation. No real unit
existed anywhere: the registry's engineering block had ranges only, and none of the 1,080 lab assets of the loops' signals
carried `engineering_unit`.

**What changed.**
- Shared trend: left axis **"PV / SP (<unit>)"**, right axis **"OP (%)"** / **"OP / VP (%)"**, each named and drawn in its
  pen colour; time axis with readable day boundaries ("5 Oct", not "5"); legend under the chart with **"PV min–max per
  point"**; a caption explaining the band; tooltips with units ("PV: 801 kg/h · OP: 29.4 %").
- **Scale switch (DCS / PI Vision practice — user decision 2026-10-06):** **Fit to data** (default: autorange, shows the
  shape) | **Engineering range** (the registered PV range and OP range, OP falling back to 0–100 %: shows where the loop
  sits in its span); the range option is disabled, with its reason, when no PV range is registered.
- A stalled feed (buckets with no values) shows "No signal values in this trend range" instead of an empty frame.
- **PV unit (Part B):** the Add-Loop wizard has a "PV unit" field beside the ranges (shown on Review); the bulk CSV has an
  optional `pv_unit` column; cplm-api stores, returns and serialises it (trimmed, at most 24 characters); **a ranges-only
  re-import keeps a registered unit** (`EngineeringMerge`). Until a loop has one, every axis reads "(unit not set)" —
  never a fake "EU". Historical and Replay use it too; their "pp" axis is now "OP / VP (%)"; Historical's lanes moved
  down 12–24 px and its grids gained right margin so the named axes do not clip or overprint.

**Tests.** Frontend: `trend/trendOption.test.ts` (new, 10: axis assignment and names, pen-coloured axes, band legend,
VP on the OP axis, tooltip units, fit / range / fallbacks, "unit not set", stalled feed), `csvImport.unit.test.ts` (new,
3), `historical/chartOption.test.ts` updated to the new axis names. 74 files green; lint / tsc / build clean. cplm-api:
`EngineeringUnitTests` (3 unit) + `EngineeringMergeSqlTests` (3 on the lab Postgres, evaluating the real merge
expression); full suite **249 / 249** — the `EvidenceClassSweepTests` failure noted in CHG-043/045 did not reproduce this
run (it depends on the lab data's state; still worth a look). **Lab pass 2026-10-06:** cplm-api rebuilt and restarted;
FIC10401 edited in the wizard with PV unit `kg/h` (Review: "PV 0–2500 kg/h · OP 0–100"; API and DB return `pvUnit`);
Investigation chart: "PV / SP (kg/h)" 73–79 left, "OP (%)" 29–35 right, the oscillation visible in both; Engineering
range: PV 0–2500 kg/h, OP 0–100 % (PV sits at ~3 % of its registered span — worth checking that range with the plant);
Overview and Explorer (lab feed stalled 17 h) show the no-values state; Historical and Replay show the unit; 0 px page
overflow on all five pages at 500 / 768 / 1440; night theme; 0 console errors. Lab data note: FIC10401 now carries
`pvUnit: "kg/h"` in the lab registry.

### CHG-047 follow-up — stored-XSS fix for the PV unit (2026-10-06, automated security review)

The PV unit is user-entered (wizard / CSV) and was concatenated into the ECharts **tooltip HTML** of the shared trend,
Historical and Replay: a unit like `<img src=x onerror=…>` would have run in every viewer's browser. Fixed on both sides:
- **cplm-api** `Validate` (both the single and the bulk path): `engineering.pvUnit` must match the allowlist
  `^[\p{L}\p{N} °%/.\-·²³µ()^*]{1,24}$` → 422 `REGISTRY_VALIDATION` (single) / per-row `REGISTRY_VALIDATION` (bulk).
- **frontend** `utils/escapeHtml.ts` (new): the unit (and Historical's overlay unit) is HTML-escaped in all three tooltip
  builders; axis names are canvas text and unaffected. The wizard and the CSV import apply the same allowlist and say why.
- Tests: `EngineeringUnitTests` (+17 allowlist cases), `escapeHtml.test.ts` (new), a hostile-unit tooltip test and a CSV
  row-problem test. Frontend 75 files green; cplm-api 266 / 266. **Lab proof:** `POST /loops/activate` with
  `pvUnit:"<img src=x onerror=alert(1)>"` → 422 with the allowlist message; `POST /loops/bulk-activate` → row failed
  `REGISTRY_VALIDATION`, 0 activated; the probe loop does not exist (404).

## CHG-048 — SME review #11: the Loop Explorer trend gets periods (presets, ‹ / ›, custom, Live) and carries them to Historical (2026-10-06)

**Source:** `SME_review.md` point 11. **Scope:** `ams-frontend` only: `components/Cpm/trend/{TimeRangeBar.tsx,
useTrendRange.ts, trendPeriod.ts (+test)}` (new), `historical/{timeRange.ts, RangeToolbar.tsx}` (the period row moved
into `TimeRangeBar`), `CpmHistorical.tsx`, `explorer/summary/{OperatingState.tsx, LoopSummaryCard.tsx}`, `CpmExplorer.tsx`,
`cpaHref.ts` (`historicalHref` takes a period), `nav/cpmTasks.ts` (+test), `styles/cpm-loop-summary.css`. No service change.

**What the SME said.** The Explorer has a rolling 8 h trend but older data is not convenient to reach from the same view; add
time presets, custom dates and previous/next period controls; opening Historical should carry the same loop and period.

**Verified before the change.** Correct. The Explorer trend was a fixed rolling 8 h with no controls; the summary card's
Historical link carried the loop only; the menu carried loop and scope, never a period. Historical already had presets,
‹ / ›, Now and custom From / To — inside its own toolbar, unusable elsewhere.

**What changed.**
- **One shared period bar** (`TimeRangeBar`) for Historical and the Explorer: presets as one segmented group + Custom,
  ‹ / › one span, Now (Historical) or Live (Explorer), the custom pair applied on Apply with a stated error for a missing
  or backwards pair. (Historical's "Custom" segment now actually opens the date fields — before, clicking it did nothing
  until the range already was custom.)
- **Explorer trend:** `8h` = LIVE (no `from` / `to` in the URL, rolling and refreshing as before); 24h / 7d / 30d, ‹ / › and
  a custom pair pin an absolute period in the URL as `?from=&to=` — the same names and meaning as Historical. The bar and
  the trend line say "live" or "fixed period"; polling only while live; the operating-state tiles' trend fallback (the
  newest bucket) only while live, so a past period is never shown as the loop's current value.
- **"Open in Historical ›"** on the bar (and the summary card's Historical action) carries the loop and the period; a live
  view is handed over as its absolute 8 h at the moment of the click.
- **Menu carry:** `from` / `to` travel between the Explorer and Historical only (the two pages that read them identically);
  a live Explorer hands Historical its absolute 8 h. Every other page still gets loop + scope only.
- The sticky context bar's period reads "trend: last 8 h" or the pinned range.

**Tests.** `trend/trendPeriod.test.ts` (new, 3), `nav/cpmTasks.test.ts` (+3: pinned period carried Explorer ⇄ Historical,
live 8 h made absolute, never carried to Replay). Frontend 76 files green, lint / tsc / build clean. **Lab browser pass
2026-10-06** (lab feed stalled since 5 Oct, so live 8 h is empty): FIC10401 Explorer shows 8h · live and the no-values state;
24h pins `from/to` and shows 5 Oct's data on both axes, context bar "trend: Oct 05, 10:41 AM → Oct 06, 10:41 AM"; Open in
Historical → `/cpm/historical?loop=FIC10401&from=…&to=…` with the same range; menu Historical → Explorer keeps the period
("fixed period"); Live → `?loop=FIC10401`; menu live Explorer → Historical gets the absolute last 8 h; Custom: a backwards pair
says "\"To\" must be after \"From\".", 12:00–17:00 on 5 Oct pins and plots; 0 px page overflow at 500 / 768 / 1440 on Explorer
and Historical (the bar stacks on a phone); night theme; 0 console errors.

## CHG-049 — Evidence storage is bounded by what the plant needs, and the daily check measures the files (2026-10-06)

**Scope:** `src/flink` (evidence cycle cap + `cycle_scores`, `EvidencePolicy`, per-loop throttle, `04b` arguments),
`cplm-api` (evidence consumer: orphan chunks + count gate; RESPONSE retention; `Cplm__EvidenceExpiredGraceDays` forwarded by
compose; `ix_response_event_created`), `scripts/cpm-12-evidence-response-retention.sql` and
`scripts/cpm-12b-evidence-reclaim.sql`, `migration/deploy/build-release.py` (+ `chg049-evidence` VM steps),
`migration/daily-check.sh` + `MARUN-DAILY-CHECK.md` §1 / §7, `MARUN-DISK.md` (ZooKeeper rule), `prod_decision.md`.
Ships in the accumulating SME-batch release below (version assigned when the batch closes). Commits in `checklist.md`.

**What was wrong.** Marun daily check 2026-10-06 05:21 UTC: 1.4 GB free of 96 GB. Evidence was the controllable part:
chunk 2424 MB + manifest 1273 MB = **3.7 GB on disk** while the daily check's payload sum said 1.9 GB "within budget" (a
DELETE never shrinks table files). Manifests: EPISODE COMPLETE 325,016, EPISODE EXPIRED 240,823, TRANSIENT 265,632 written
in 6 h (~1 M/day of write-then-delete); average 43 manifests per run, maximum 4,321. The response tables (0.8 GB;
`response_event` 50,821 rows since 2026-09-25, `response_metric` 2.64 M rows) had no retention. The same morning two
non-evidence events hid the picture: a 2.6 GB uncapped container json-log and Instrumental's ZooKeeper crash-looping on a
zero-byte transaction log (`log.91a0`), which took Kafka and 6 of 7 Flink jobs down; `piarchiver-broker` (not ours) was also
crash-looping, so 0 samples arrived from the OT feed (left to its owners).

**What changed.**
- Flink: one evidence artifact carries at most `--evidence-max-cycles` (**12**, env `CPLM_EVIDENCE_MAX_CYCLES`) cycles, with
  the per-cycle scores kept in `cycle_scores`; at most one artifact per loop and window kind every
  `--evidence-min-interval-min` (**60**, env `CPLM_EVIDENCE_MIN_INTERVAL_MIN`). Both pass through `04b`.
- Policy `episodes`: the Long job emits only on G7..G11 findings (G5 / G6 alone are context); Fusion emits on G14 /
  diagnosis, or when a health lane is PV-ineligible or limited (a merely configured lane no longer counts).
- cplm-api evidence consumer: orphan chunks are skipped with a warning (no 2 s stall); the count gate avoids reading
  payloads until all chunks are there.
- Retention: `retention_policy` row `RESPONSE` = **14 days** (new, `cpm-12`, online; 30 d would hold ~1.5 GB here);
  `Cplm__EvidenceExpiredGraceDays` = **1** (was the built-in 7, never forwarded by compose); `ix_response_event_created`.
- `cpm-12b` (cplm-api STOPPED, after at least 1 h of the new jar): removes expired tombstones and rewrites the evidence
  tables so the space returns.
- Daily check §7: `evidence tables N MB on disk` from `pg_total_relation_size` (WARN > 1536 MB, ACT > 3072 MB).
- Runbooks: `MARUN-DISK.md` §3 J (ZooKeeper zero-byte log: back up both volumes, MOVE the file out of `version-2/`, never
  rename in place) and the 2026-10-06 row; `MARUN-DAILY-CHECK.md` §1 (an uncapped json-log can be GBs) and §7.
- Final-review fixes: the capped G7 / G9 per-cycle artifacts take the **accepted** cycles first (first and last cycle
  kept, the rest evenly spaced; G9 follows G7's cycle ids when they line up), and the workbench counts accepted / total
  from `cycle_scores` ("showing k of N cycles"), so a capped window never reads "No accepted cycle" against its verdict.
  The throttle forgets a window the policy skips (a finding back after a PASS emits at once) and records state only
  when records were output. The RESPONSE purge keeps events a system model was created from. The RESPONSE row is in the
  lab and fresh-install schemas too. VM steps: `cpm-12` is followed by an `indisvalid` check (an interrupted
  CONCURRENTLY build leaves an invalid index: drop it and re-run); the `cpm-12b` guard prints the three tables' size
  (with `response_metric`) and `df -h /` BEFORE cplm-api is stopped.
- Left alone: the short-feature GIN index `ix_cplm_short_feature_results_method_run_ids` is used by `MethodRunResolver`.
- Plant actions already taken 2026-10-06 (before this release): log truncated, /tmp bundles deleted, `TRUNCATE
  analytics.evidence_chunk, analytics.evidence_manifest` (pinned = 0 checked; emission left ON), ZooKeeper log moved
  out; disk 1.4 → 11 GB free. See `prod_decision.md` §6.

**Tests.** Flink full suite 298 run, 0 failures, 2 skipped (baseline 289). cplm-api `Evidence|Response|SchemaV25` 50 / 50
(baseline 45). `test_build_release.py` 45 passed. `bash -n migration/daily-check.sh` clean; the new SQL prints an integer
on the lab Postgres. After the final-review fixes: Flink 307 run, 0 failures, 2 skipped; cplm-api 51 / 51;
`test_build_release.py` 45 passed; frontend `vitest src/components/Cpm/evidence` 107 passed, lint and build clean.

**End-to-end on the lab (Task 8 stage A, 2026-10-06, jar `19b95248`, cplm-api from fe0ee52c).** Full Flink swap (13
jobs cancelled, JM + TM recreated, Short with `--evidence-emit none`, Long / Fusion default `episodes` 12 cycles / 60
min, all six CPLM CAPABILITY records = `19b95248`); cplm-api with grace 1 d (lab override); `cpm-12` online
(`indisvalid` t). T0 = 10:29 UTC (24 h soak, stage B, pending).
- **Warm-up:** no CPLM output for ~30 min after a stateless submit (`SAMPLE_IDLENESS` 30 min holds the watermark while
  unfed partitions are idle). Expect the same at the plant.
- **Volume (G5..G15, TRANSIENT + EPISODE), 2 h window 11:15-13:16:** all loops 7,836 → 1,663/h, 101.3 → 10.0 MB/h, but
  the stateless restart cut the long tier from 161 to the 10 fed loops. **Like for like (the 10 fed loops, full hour):
  1,200 → 504/h (2.4×), 15.9 → 6.4 MB/h — below the 5× target.** Long 960 → ~264/h (3.6×; the throttle emits once
  per loop × kind per hour plus on signature changes, as designed). Fusion is unchanged at 240/h: it emits every
  window whenever the diagnosis is not PASS / NO_CALL / PENDING (INSUFFICIENT_DATA counts). The cycle cap, the plant's
  main lever, is not exercised: the lab has had 0 valid cycles since 2026-09-25. Max per run G9 = 1. G12 (Response
  job, outside CHG-049) ran at ~935/h after the restart.
- **Evidence still there:** episode G9 runs captured on the new jar read COMPLETE (EPISODE); a throttled run reads
  NONE + the RECONSTRUCT action (never an error). Reconstruction of a throttled run (kafka) → STANDARD/COMPLETE in
  ~17 s. Reconstruction of a 48-cycle G7 run (iotdb) emitted 48 `cycle_fit` + `cycle_scores` (cycles_total =
  cycles_emitted = 48, uncapped); the API serves 49 COMPLETE artifacts.
- **Consumer:** 0 `fail:` lines and 0 orphan / swept warnings from the swap to 14:00 across two cplm-api restarts
  (drill (b) included); lag 0, one member per group. **Drill (a):** Long cancelled + resubmitted; its first firing emitted
  30 of 30 loop × kind pairs at once.
- **RESPONSE 14 d:** the first sweep purged 7,308 events (7 kept: a system model was built from them).
- **cpm-12b** (cplm-api stopped 7.5 min, script 6 min 35 s): the three tables 5,059 → 3,606 MB; daily-check line 4,920 →
  3,552 MB (chunk 3,273 → 2,360, manifest 1,647 → 1,191, response_metric 137 → 54); 84,694 TRANSIENT deleted, 0
  EXPIRED; the ~1.05 M STANDARD replay manifests stay. On the lab the Docker VHDX grew 2.6 GB (no TRIM).
- Open for the SME / controller: Fusion throttle, or INSUFFICIENT_DATA no longer counted as a finding. The 24 h soak
  reading (stage B).

**Stress test on the lab (Task 9, 2026-10-06, jar `9622d11d` = Task 10 fusion policy + throttle; full results in
`docs/next-release/chg049-stress-results.md`).** Stopped in S1; S2-S8 not run; S9 deferred (cplm-api rebuild first).
- **S1 (161 loops) FAIL:** the Flink TaskManager ran out of heap after 25-30 min and the JVM did not exit (no
  `ExitOnOutOfMemoryError`): 0 TaskManagers, all 13 jobs RESTARTING until the TM was recreated by hand. The Short
  job's heap state (275 MB checkpoint at 30 min) could not be restored on the same TM, and a stateless Short OOMed again
  while replaying its backlog. The lab is left with Short cancelled (12 of 13 RUNNING).
- **Lab L1:** six active MQTT loop-sample sources on the same topics (five e2e leftovers) put every tuple on Kafka 6×;
  the Long tier then infers a 0 s sample period and never accepts a cycle (the cause of "0 valid cycles since
  2026-09-25"). The cycle cap and `cycle_scores` therefore remain unproven on the lab.
- Before the OOM the throttle held: 1,508 emissions over 805 loop × kind × tier series, 0 re-emits within 60 min
  without a signature change; max per run G9 1, G5 3; 0 evidence `fail:` lines; evidence lag < 2,000, one member.
- Findings for a follow-up: TM `-XX:+ExitOnOutOfMemoryError` (F1), a bound on the Short heap buffer and its recovery
  runbook (F2), ingestion guard against duplicate loop-sample sources + Long-tier duplicate-timestamp drop (L1).

**Stress re-run on the lab (Task 17, 2026-10-06/07, jar `b514d2b7` = CHG-049 + CHG-060..062; full results in
`docs/next-release/chg049-stress-results.md`, section "Re-run at plant × 3").** 161 loops at the 5 s grid = 33 tuples/s (plant × 3
= 87/s is not reachable at a 5 s grid; the grid change was refused), one source, 24 limit-cycle loops.
- **S1 PASS:** 4 h, no OOM; G9 max 25 manifests per run; 1,065 of 1,416 `cycle_scores` capped (cycles now accepted: L1 is gone);
  throttle 0 violations; 27.9k manifests/h, 49.9 MB/h TRANSIENT; TM post-GC heap ~510 MB, peak 709 MB. S2, S4a-d, S5, S6 (cpm-12b
  6,581 → 3,760 MB in 12.6 min), S8 (300k events purged in 5,000-event transactions, one 35.4 s), S11 PASS. S3 blocked (no
  episode can open until a 12h window has ≥ 0.95 coverage). S10 skipped (tool refused). S9 not started (cplm-api rebuild first).
- **Findings needing code:** F4 (P1) a slow Response fit expires the checkpoint, the task does not cancel and the TaskManager kills
  itself, restarting every Flink job (three times; Response left CANCELLED on the lab); F3 a reconstruction's colliding artifact ids
  keep the live run's TRANSIENT rows (mixed datasets in the served set).

## CHG-060 — Both Flink JVMs exit on an OutOfMemoryError (2026-10-06)

**Scope:** `infra/docker/docker-compose.yml` (JM / TM `FLINK_PROPERTIES`), the HA compose (JM, JM-2, TM, TM-2), the marun overlay
(JM, TM), `prod_decision.md` §4 / §6, `migration/MARUN-DAILY-CHECK.md` §4. Ships in the SME-batch release below. Commit b7fb65c1.

**What was wrong.** Task 9 S1 (161 loops on the lab, 2026-10-06): the TaskManager ran out of heap 25-30 min in. The JVM did not
exit, so the container stayed Up and all 13 jobs, the alarm jobs included, sat in RESTARTING until the TaskManager was
recreated by hand. Docker's `unless-stopped` only restarts a process that exits.

**What changed.** `env.java.opts.jobmanager` and `env.java.opts.taskmanager` = `-XX:+ExitOnOutOfMemoryError` in every
`FLINK_PROPERTIES` block (lab compose JM / TM, HA JM / JM-2 / TM / TM-2, marun overlay JM / TM). No heap dump (a dump over 1 GB on
the shared 96 GB disk is a disk incident). A TaskManager OOM now restarts the TM and the jobs resume from their checkpoint; a
JobManager OOM restarts the JM and, with no HA at the plant, the jobs are gone (daily check §4 shows fewer than 7: `04b`).

**Tests.** `pytest` 46 passed.

**End-to-end on the lab (Task 17, 2026-10-06/07).** `-XX:+ExitOnOutOfMemoryError` reaches the TM and JM JVMs (ps). No OOM in
~11 h. Every TM death (Docker crash, three self-kills from the Response job (F4), a `docker kill`) restored all jobs from their
checkpoints; a JVM exit is restarted by Docker (RestartCount 1 → 3), a `docker kill` is not (manual stop). The forced-OOM drill (S10)
was skipped: the test job was refused.

## CHG-061 — The Short buffer is bounded: one profile per loop, no duplicate samples, a hard per-loop cap (2026-10-06)

**Scope:** `src/flink` (`ShortProfileRegistry`, the Short buffer / `CplmShortFeatureStreamJob` options, `04b` arguments),
`migration/04b-submit-flink-jobs.sh`, `migration/daily-check.sh` + `MARUN-DAILY-CHECK.md` §4, `prod_decision.md` §3 / §4.
Commits 96f14511 (a), 31154549 + afdc1d53 (b).

**What was wrong.** The CHG-039 Short buffer lives on the heap. In the 2026-10-06 stress run its checkpoint reached 275 MB after
30 min; restoring it ran the TaskManager out of heap (15:22 UTC), and starting without state and replaying the backlog ran it
out again (15:39 UTC). Every buffered sample carried its own copy of the resolved dynamics profile (~117 members), and nothing
bounded the buffer when the watermark stalled.

**What changed.**
- (a) The buffer keeps one profile per loop (`ShortProfileRegistry`: content SHA-256 key, per-loop keyed MapState) and
  drops an exact duplicate `(loopId, eventTsMs)` at ingest. The state names moved to `-v2`, so a restore of an old checkpoint
  starts with an empty buffer. Bench, real tuples, heap backend: checkpoint 57.9 -> 27.1 MB (-53 %); heap per buffered sample
  3.33 -> 2.31 KB (-31 %; the target was 40 %, the measured figure is reported).
- (b) Hard per-loop cap: `--short-max-samples-per-loop` (0 = derived; 04b passes `${CPLM_SHORT_MAX_SAMPLES_PER_LOOP:-0}`).
  Derived cap = max(ceil(1.4 x 3960 s / grid), 1100) from the declared `grid_seconds` (fallback 5 s): **1,109 at Marun**
  (1.4 x the 792 samples of normal running, about 92 min of data; sized to the 1,100 MB task heap, see `prod_decision.md` §4). An
  explicit value > 0 overrides it with no floor. The oldest whole minutes are evicted; if the arriving sample's own minute is
  the oldest left it is dropped. Log `SHORT_BUFFER_CAPPED loop=... samples=... watermarkLagMs=... cap=... declaredGridS=...` at
  most once per loop per hour; Flink counter `shortBufferCapped`.
- (final review) A dropped exact duplicate is counted on the Flink counter `shortDuplicatesDropped` and logged as
  `SHORT_DUPLICATE_DROPPED loop=... ts=...` at most once per loop per hour. The Marun Flink log config
  (`infra/docker/flink-log4j-console.properties`, root ERROR) carries a WARN override for `ShortFeatureBufferFn`, so both lines
  reach the plant log. G0's duplicate condition is now inert for the short tier: the buffer drops the duplicate before the
  window maths, so `duplicate_timestamps` (`dup_ts` in `validate-loops`) reads 0 even on a doubled feed; the Kafka-tuple check
  in `scripts/validate-loops.sh` is the one that still detects it.
- Daily check §4: `SHORT_BUFFER_CAPPED` count in the TaskManager log over 24 h (WARN if > 0), with the recipe in
  `MARUN-DAILY-CHECK.md` §4.
- The `ShortProfileRegistry` javadoc figure was corrected (about 1.0 KB saved per sample, not 2.2 KB; comment only).

**Tests.** Flink full suite 319 run, 0 failures, 2 skipped (baseline 289). Bench with a stalled watermark: heap 145 MB at
130 min fed, 152 MB at 390 min (3 x the cap): flat. Final-review fixes: `ShortBufferCapTest` (1,109 at 5 s; a normal feed peaks
at 768 per loop, under 1,100) and `ShortBufferRestoreTest` (heap-backend snapshot and restore at the cap with two profiles gives
the same output as an uninterrupted run; `shortDuplicatesDropped` counted).

**End-to-end on the lab (Task 17, 2026-10-06/07).** 161 loops, 33 tuples/s, 4 h: no OOM, Short checkpoint ~55 MB / 5 s (Task 9:
275 MB / 65 s). With a partition held at a frozen timestamp the cap engaged at 45.5 min of watermark lag: 156 loops at 1,109,
156 `SHORT_BUFFER_CAPPED` WARN lines, `shortBufferCapped` 3,714, checkpoint flat at 81.4 MB, **peak TM post-GC heap 713 MB (design
estimate 738 MB)**; the release of 65 min of windows passed without a failure. A quiet partition alone never reaches the cap (idleness
releases the watermark at ~32 min). The Short job restored its state after every TM restart (output within a minute, no warm-up).

## CHG-062 — Duplicate loop samples are ignored, and a second overlapping source is refused (2026-10-06)

**Scope:** `src/flink` (`SignalMath`, the Long tier), `src/services/ingestion-service` (data-source API, subscriber manager),
`scripts/test-ot-loop-ingestion-e2e.ps1`, `migration/MARUN-CONTEXT.md` §12b, `prod_decision.md` §4.
Commits 538d4d9b (a), 06a953cf + 680c165e (b), this commit (c).

**What was wrong.** On the lab six active "E2E OT Gateway (mosquitto-test)" sources (five leftovers of the e2e script, which
created a source and never reused or reliably removed it) delivered every sample 6x. The Long tier then inferred a 0 s sample
period and found 0 oscillation cycles on the lab from 2026-09-25 onwards. Nothing in ingestion refused a second source on the
same topics.

**What changed.**
- (a) `SignalMath.filterHalfOpen` keeps the first sample of a repeated `eventTsMs`; `inferSamplePeriodSec` ignores zero
  diffs; the Long `onTimer` dedupes the rolling buffer by timestamp and the peer buffer by (loopId, timestamp). SYN-TIC x6 gives
  the same period and cycles as the clean series.
- (b) Ingestion refuses an overlapping `MQTT_LOOP_SAMPLES` source. Conflict = same normalized endpoint (scheme, lower-case
  host, default ports 1883 / 8883) AND (overlapping topic filters OR the same effective client id). API: 409
  `{error:"overlaps active source '<name>' (<id>)", field:"topics"}` on POST, on PUT (when active and a feed field changed) and on
  activate (when not already active). Subscriber manager: the oldest source wins (created_at, config_id); a loser is parked with
  `ConnectionError "duplicate feed: overlaps '<name>'"` and re-checked every 30 s, and a winner leaving logs "Starting subscriber
  '<name>' (duplicate-feed winner gone)". Same endpoint without overlap: one LogWarning (the Marun diagnostics-vs-PIDParams trap,
  `MARUN-CONTEXT.md` §12b). The real plant filter `OT/HDPE/+/+/+/PIDParams/+` against the lab filter
  `OT/+/+/+/+/PIDParams/+` is pinned as overlapping.
- (c) `test-ot-loop-ingestion-e2e.ps1` reuses its source by name (GET `/data-sources`, PUT the profile and activate, else POST,
  as `start-ot-loop-soak.ps1` does), deactivates `'OT Gateway (lab soak)'` while it runs and restores it in `finally`, and the
  cleanup moved into try/finally so a failed step no longer leaks a source. Parse-checked only (it needs the lab).

**Tests.** ingestion 237 / 237; Flink full suite 319 run, 0 failures, 2 skipped. The e2e script parses clean.

**End-to-end on the lab (Task 17, 2026-10-06/07).** One active source: 0 duplicate (loop, event_ts) keys; the Long tier reads a
5.06 s period and accepts cycles again (G7/G9 PASS on the limit-cycle loops). API activate of a leftover duplicate → 409; an SQL
re-enable → the subscriber manager runs one feed only (the older config wins and the newer is parked "duplicate feed"), and switches
back ("duplicate-feed winner gone") when the leftover is deactivated.

## CHG-075 — One slow G12 fit can no longer restart every Flink job: the fit budget is a deadline, Response checkpoints tolerate a busy operator (2026-10-07)

**Scope:** `src/flink` (Response job: `EstimatorSettings` deadline, `FitBudgetExceeded`, `ResponseEvaluator` censor branch,
`ZohSimulator` / `InputReconstruction` exact-ZOH speed-ups, `CplmCheckpointing` shared by Short and Response,
`ResponseFitBench`), `prod_decision.md` §4 / §6, `migration/MARUN-DAILY-CHECK.md` §4, `migration/deploy/build-release.py`
(two stale lines). Ships in release v2.7.0 below (`flink-jobmanager`). Commits 44245ba3, 829ac29e, 872f1393, 2b6ac121, 3527edaf.

**What was wrong.** Task 17 lab stress re-run (finding F4, 2026-10-06/07): the Response job's G12 fit ran inside one
`processElement` for minutes. Its 120 s checkpoint expired (0 tolerated failures, aligned), the restarting task could not
cancel within 180 s, and the TaskManager killed itself, so every Flink job, the alarm jobs too, restarted. After the restore
the job re-read the same input and wedged again: three TaskManager self-kills on the lab (03:47, 03:58, 04:16 UTC on 7 Oct).
The budget (`fitBudgetMs`) was only checked after a fit had finished. Cause of the slowness: `ZohSimulator` cached the
discretised model by the exact step length, so with real, jittered timestamps nearly every step ran `expm`, inside every
Jacobian evaluation at every delay, and `InputReconstruction` was O(n²). The Response job was left CANCELLED on the lab
(12 of 13 jobs) until this fix.

**What changed.**
- The G12 fit budget is a deadline the fit honours: `EstimatorSettings.deadlineNanos` = start + `fitBudgetMs` (default
  **20,000 ms**; job argument `g12-fit-budget-ms`). It is checked (with `Thread.isInterrupted`) in the OE theta loop,
  `refineDelay`, every BoundedLm evaluation, every 256 samples inside `ZohSimulator.simulate`, and every PEM order / nk
  iteration. Expiry throws `FitBudgetExceeded`, re-thrown before BoundedLm's generic catch, and `ResponseEvaluator` routes it
  to the existing censor branch: `NOT_ESTIMATED / BUDGET_EXCEEDED`, `evaluationState=CENSORED`, rejection
  `ESTIMATION:BUDGET_EXCEEDED`, plus the `budget_ms` and `budget_stage` outputs. Never a partial model. An interrupted
  (cancelled) fit re-throws and emits nothing; the event is evaluated again after the restore.
- Exact-ZOH speed-ups with results identical to before (parity 7.8e-14 relative, bound 1e-9): an `InputReconstruction`
  cursor (O(n) instead of O(n²)) and a closed-form first-order discretisation for FOPDT / IPDT (no `expm`).
- Bench `ResponseFitBench` (14,400 jittered samples = 4 h at 1 s, production grid θmax 600 s / 5 s, on the loaded lab host):
  FOPDT **5,007 s → 46 s**, same parameters to 2e-13; SOPDT 390 s after. At the plant's 5 s grid an event has at most
  2,880 samples (about 9 s FOPDT), inside the 20 s budget; long 1 s-grid events censor as `BUDGET_EXCEEDED` (ruling: keep 20 s).
- Checkpoints: the shared helper `CplmCheckpointing` (Short delegates to it unchanged: 180 s / 60 s). Response now checkpoints
  every 300 s with a 120 s minimum pause, timeout 900 s, 1,000 tolerable failures, unaligned after 30 s aligned, and
  **`DELETE_ON_CANCELLATION` (was RETAIN)**. Unaligned checkpoints cannot overtake a fit still inside `processElement`; a
  barrier waits at most about 20 s for the fit to stop, well inside the 900 s timeout.
- Not changed (deferred): `relTol` is plumbed but never applied to BoundedLm; LM non-convergence silently returns p0 as a
  valid trial; two further speed-ups were rejected because they moved fitted parameters by up to 1.3e-6 and need an SME
  decision (time rebase to t−t[0], the µs discretisation-cache key).

**Tests.** Flink full suite 334 run, 0 failures, 2 skipped (+ the fix-round tests). RED: the budget test timed out at 120 s on
the old code; GREEN 5.03 s with a 5 s budget.

**End-to-end on the lab (Task 21, 2026-10-07, the exact v2.7.0 build: jar `abbcf7af`, cplm-api from aa365097).** Full Flink swap
(12 jobs cancelled, JM + TM recreated, `-XX:+ExitOnOutOfMemoryError` in the TM, Short by hand with `--evidence-emit none`, the rest
by `ensure_flink_jobs.py`): **13 / 13 RUNNING, Response included**, no duplicates, all six CPLM CAPABILITY records = `abbcf7af`;
the Response `/checkpoints/config` reads 300 s / 120 s / 900 s / 1,000 tolerable / unaligned / delete on cancellation. T0 09:49:18 UTC;
go/no-go feed (161 loops, 24 limit cycles) from 09:54:24.
- 67 min watched (to 10:56): Response checkpoints **0 failed** in every JobMaster lifetime (latest chk 7-13 COMPLETED, 0.6-15.4 s,
  5-15 MB); evaluate operator busy max 22-542 ms/s (F4: pinned at 1000); **TaskManager RestartCount 0** (F4: three self-kills in ~30 min).
- `response_event` on the new jar: 3,919 events, **BUDGET_EXCEEDED 0, ESTIMATED 32, max `fit_ms` 822 ms**. No new step event in the
  hour (the step sim's loop is fed by the lab's own feed, so it was not run); the bench stays the production-size figure.
- Deviation (lab, not Response): four ZooKeeper session stalls of 31-40 s (JM 10:09 and 10:18, TM 10:23 and 10:34; VM load 40-55 on
  6 vCPUs, 4.2 GB swap) made every job lose leadership and restore from its checkpoint, as in Task 17 I1; every Response restart is
  "Job leader ... lost leadership", none from the job itself. **PASS.**

## CHG-076 — A reconstruction replaces the live artifacts it collides with (2026-10-07)

**Scope:** `cplm-api` (`EvidenceBlobStore.UpsertManifestAsync`, `EvidenceApiTests`), `prod_decision.md` §3 / §6. Ships in release
v2.7.0 below (`cplm-api`). Commit 61584c90.

**What was wrong.** Task 17 lab stress re-run (finding F3, S7): a capped live run and its uncapped reconstruction share
deterministic evidence ids (cycles 0-11 and `cycle_scores`). The consumer's ON CONFLICT kept the live rows, so the served set
mixed two datasets (96 `cycle_fit` from the reconstruction, 12 of them really from the live run, and a `cycle_scores` that said
78 / 12), and those 13 rows stayed TRANSIENT: the sweeper deleted them after 6 h while the 84 STANDARD rows stayed, so the
reconstructed set lost cycles 0-11 and its `cycle_scores`.

**What changed.**
- `EvidenceBlobStore.UpsertManifestAsync`: when the incoming manifest is a reconstruction (`RetentionClassOf == STANDARD`:
  provenance `analysis_run_id`, or purpose ≠ LIVE) and an unpinned row with the same `evidence_id` exists in PENDING /
  COMPLETE with a different sha256, its chunks are deleted and the manifest is reset to PENDING in ONE transaction
  (`SELECT … FOR UPDATE`, DELETE, upsert). The class becomes STANDARD unless it is EPISODE (kept); PINNED rows are untouched;
  a same-sha re-emit is a no-op; a live (TRANSIENT) re-delivery of a COMPLETE row stays a no-op; `method_run_id` /
  `gate_result_id` are kept.
- A reconstruction reviving an EXPIRED / FAILED TRANSIENT row also becomes STANDARD (before: it stayed TRANSIENT and was swept
  in 6 h).
- Not changed (deferred): `PutChunkAsync` could reject a chunk whose sha ≠ `chunk_sha256[chunk_no]` (a late-live-chunk race;
  unreachable through Kafka ordering, since live and reconstruction records share `method_run_id` and so the partition).

**Tests.** cplm-api `Evidence|Response|SchemaV25` 57 / 57 (+6). `EvidenceApiTests` 243-246 rewritten: an identical-sha re-emit
stays a no-op; a different-bytes reconstruction replaces the COMPLETE row.

**End-to-end on the lab (Task 21, 2026-10-07, cplm-api from aa365097, jar `abbcf7af`).** EVIDENCE_RECONSTRUCTION (iotdb) of a live
capped G9 run (`3ca06723`, FIC10406 12h, 25 TRANSIENT manifests, dataset `fbde2fed`): the Flink job finished in ~1 min and the stored
set is **299 manifests, all STANDARD / COMPLETE, one dataset (`b7a64a60`), all from analysis run 40afd5e0**: the colliding live rows
(cycles and `corners`) were replaced, 0 TRANSIENT left. **PASS** (F3 closed). Seen on the way, not CHG-076: under the lab load the POST
reported "Flink did not accept the submission in time" while the job ran, and the `analysis_run` row stayed `CREATED`.

### SME review batch release **v2.7.0** — what to build and run (bundle 7 Oct 2026, plant deploy 8 Oct; manifest `migration/deploy/releases/v2.7.0.txt`)

- Go/no-go (user decision 2026-10-07, replaces the 24 h soak gate): about 6 h on the exact shipping build with all 13 lab jobs
  (Response included) decides the plant deploy; the 24 h soak keeps running in parallel and anything it finds after the gate
  becomes a follow-up patch.
- Updated services: **`ams-frontend`** (CHG-040 … CHG-048), **`cplm-api`** (CHG-043, CHG-045, CHG-047, CHG-049, CHG-076),
  **`flink-jobmanager`** (image `ams-flink`, CHG-049, CHG-061, CHG-062a, CHG-075; the TaskManager uses it too: full Flink swap, cancel
  every job before `docker rm -f` of JM and TM, then the orphan-checkpoint sweep) and **`ingestion-service`** (CHG-062b: image
  `traverse-ingestion-service`, `docker load` and recreate; no schema).
- Marun overlay (CHG-060): the `FLINK_PROPERTIES` of JM and TM changed (`-XX:+ExitOnOutOfMemoryError`); `deploy.sh` applies the
  overlay, so the recreate in the Flink swap picks it up. Afterwards the flag is visible in the TaskManager and JobManager process arguments.
- New optional `.env` key (CHG-061): `CPLM_SHORT_MAX_SAMPLES_PER_LOOP` (unset = 0 = derived = max(ceil(1.4 x 3960 / grid), 1100),
  1,109 at Marun); `04b` passes it as
  `--short-max-samples-per-loop`.
- The Short job restarts with EMPTY state (CHG-061: state names moved to `-v2`); after the swap expect about 30 min of warm-up
  (`SAMPLE_IDLENESS`) before the short features and verdicts resume. Daily check §4 gains a `SHORT_BUFFER_CAPPED` line (WARN > 0 in 24 h).
- Schema (CHG-049): `cpm-12` online after `deploy.sh` (RESPONSE retention row, `ix_response_event_created`; then the
  `indisvalid` check must print `t`), then `cpm-12b` with cplm-api STOPPED, at a quiet time, only after the new jar has run
  at least 1 h and only if free disk >= 2 x the printed size of the three tables (VM step 6g). Optional `.env` keys `CPLM_EVIDENCE_MAX_CYCLES` (12)
  and `CPLM_EVIDENCE_MIN_INTERVAL_MIN` (60). The batch manifest must carry `!chg049-evidence`.
- Build: `mvn package` (Docker Maven, the jar is needed for CHG-049; no `--skip-jar`) → `python migration/deploy/build-release.py --release v2.7.0 --out release-out/v2.7.0-20261007`.
- The batch manifest `migration/deploy/releases/v2.7.0.txt` (bcb65977) lists `!chg049-evidence`, `flink-jobmanager`, `cplm-api`,
  `traverse-ingestion-service` (CHG-062b; the compose/manifest name) and `ams-frontend`. Schema order at the plant: `cpm-12`
  (online), `cpm-12b` (cplm-api stopped, at least 1 h after the swap, free-space guard), `cpm-13` (online, additive; CHG-058).
- Marun Flink log config (CHG-061): `infra/docker/flink-log4j-console.properties` gains a WARN override for
  `ShortFeatureBufferFn` (root stays ERROR); the overlay mounts it, so the Flink recreate picks it up.
- Plant: `docker load` the `ams-frontend`, `cplm-api`, `ams-flink` and `traverse-ingestion-service` images; then the Flink swap from the VM steps (cancel every job, `docker rm -f ams-flink-taskmanager ams-flink-jobmanager`) → `deploy.sh --prod` (04b resubmits all seven; 7 RUNNING) → `200` on `/`; users press Ctrl+F5.
  cplm-api restarts its consumers: check each CPLM consumer group has exactly one member afterwards (SingleMemberGuard).
- Proofs (CHG-040): the Loop Performance menu shows four task sub-headings; open a loop in the Loop Explorer, then
  Investigation from the menu: the same loop is open without picking it again. (CHG-041) on Investigation, scroll to the
  bottom: the LOOP / LOCATION / PERIOD bar stays at the top. (CHG-042) Loop Explorer on any loop opens with the
  Loop summary card above the tabs; a non-blocking readiness banner reads "Configuration limits" in neutral grey.
  (CHG-043) `GET /api/v1/cpm/fleet/summary` carries `statuses` whose values add up to `loops.monitored`; the Overview shows
  the five-state operating picture and a Readiness strip at the bottom.
  (CHG-045) the Overview queue rows carry a High / Medium / Low priority badge and a reason line; `fleet/rankings?orderBy=priority`
  returns `shelvedCount` and per-row `priority`.
  (CHG-046) loop facets carry captions: SIGNAL QUALITY / INSTRUMENT HEALTH / DIAGNOSIS pills, "N% in band" bars; a live value
  older than 10 min shows "Uncertain · last value …".
  (CHG-047) loop trends: "PV / SP (unit)" left, "OP (%)" right, Fit to data / Engineering range switch, band legend +
  caption. **Plant data step:** load PV units with the registry bulk import (`pv_unit` column; a ranges-only CSV keeps
  them) — until then axes read "(unit not set)".
  (CHG-048) Loop Explorer › Summary trend has 8h (live) / 24h / 7d / 30d / Custom, ‹ / ›, Live and "Open in Historical ›",
  which opens Historical on the same loop and period.
- Rollback (CHG-049): reload the pre-release images (`pre-<release>-images.txt`) for `ams-flink`, `cplm-api` and `traverse-ingestion-service` and repeat the
  Flink swap; the RESPONSE retention row and the index can stay (harmless to the old build).
- Proofs (CHG-049): 7 jobs RUNNING with one `jarSha256`; daily check §7 `evidence tables N MB on disk` under 1536 MB after
  `cpm-12b` and flat the next morning.
- Proofs (CHG-060..062): the TaskManager process carries `-XX:+ExitOnOutOfMemoryError`; 7 jobs RUNNING after the warm-up; daily
  check §4 `Short buffer cap` reads OK; a second overlapping `MQTT_LOOP_SAMPLES` source is refused (409) instead of doubling the feed.
- Proofs (CHG-075 / CHG-076): the Response job is among the 7 RUNNING and its checkpoints complete (JobManager
  `/jobs/<id>/checkpoints`: `failed` stays 0); `ams-flink-taskmanager` RestartCount stays 0 (daily check §2); `BUDGET_EXCEEDED`
  censors in `analytics.response_event` are normal under load (daily check §4). A reconstruction's artifacts read STANDARD /
  COMPLETE with one dataset (no TRANSIENT rows left from the live run).
