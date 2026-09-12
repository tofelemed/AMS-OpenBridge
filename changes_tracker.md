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

**Service rebuilds required:** `traverse-ingestion-service`, `cplm-api`, `historian-bff`, the
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

## Risks & pre-existing issues

- **The CPLM Flink test suite does not compile** — `CplmLoopDynamicsAwareTest.java:304,312`
  references `CplmGateFusionStreamJob.GateFusionCoProcess`, which exists nowhere in main
  sources. Verified pre-existing: the identical failure reproduces on a **clean tree** with
  my changes stashed. Consequence: **no engine change — including CHG-004 — is covered by
  automated tests today.** Worth fixing before the next engine change, and the reason CHG-004
  is marked ⚠️ rather than ✅.
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
