# System Response: end-to-end results on the lab (23 Nov 2026)

| | |
|---|---|
| Test | `system-response-e2e-test.md` (sections 0, A, B; C is optional and was not run) |
| Run by | CPA Updates session, the only session on the lab (agreed 22 Nov) |
| Build | `feat/sr-engine-fixes`: deployed at aeeb3cf8 (jar `40393f675fdc1fe6`), then redeployed with the fixes found here (frontend 14e15048, jar `0a8b56dca2644d81`), and once more on 23 Nov at f4a6132b with Gate Configuration gaps 3 / 5 / 8a and the duplicate-event fix (cplm-api and frontend `sr-f4a6132b`, jar `15f24e3c467eb538`); every CPLM worker announced the jar in its CAPABILITY record |
| Lab changes | rollback tags `pre-sr-e2e` (cplm-api, frontend); the old Flink image was gone from Docker, so its jar is kept at `D:\HMI_Project_Usama\lab-rollback\pre-sr-e2e\ams-flink-dabe186270133b84.jar`; schema script 70 applied (v2.9.1 retention rows); the OT test broker `ams-mosquitto-test` started (stopped for two weeks); the job supervisor runs again and restored all 14 standing jobs (8 ran before) |

## Results

| # | Result | Evidence |
|---|---|---|
| 0 | Pass | Flink TaskManager stable since the Docker restart (the crash loop of 22 Nov is gone); 14 jobs RUNNING; mode map `"1"` → AUT |
| A1 | Pass | sample on `traverse.cpa.loop.samples.v1`: `"p":120,"i":30,"d":0`, mode AUT |
| A2 | Pass | FIC10302 (no PV range declared): `ctl:e05f9487a3144f58`, usable false, `PV_RANGE_NOT_SET`. FIC10301 (PV range 0-140, P 300 from the DCS): Kc 0.238095 = (100/300) × (100/140), usable. After PV range 0-200 was declared on FIC10302 (owner OK, 23 Nov): a new tuning row, Kc 0.625 = (100/80) × (100/200), usable, the previous row closed at the same time |
| A3 | Pass | one row per tuning, `valid_to` null, source DCS, imported_by response-engine; FIC10301's row has Kc |
| A4 | Pass | the models carry `controller_snapshot_id` of that row |
| A5 | Pass | `GET /loops/FIC10302/controller-tuning`: current P 120, history 1 (later 2) |
| A6 | Pass | FIC10301, validated model (gain 3, time constant 20 s, dead time 3.97 s - the simulator's 3 / 20 / 4): gain margin 21.5 dB, phase margin 129.6°, advice Kc 0.84, Ti 20 s, λ 3.97 s `DEAD_TIME_RULE`, P band 85.08 % (checked by hand) |
| A7 | Pass | the event CENSORED `TUNING_CHANGED`; tuning rows: P 120 closed at 21:42:24.6 = the P 80 row's `valid_from` |
| A8 | Pass | the same P 80 again, and again after a stateless resubmit of the Response job: no new row, same reference |
| A9 | Not testable here | every simulated loop carries a P from earlier lab data (ingestion keeps the last value); covered by unit tests |
| A10 | Pass | Frequency tab: Controller tuning, Tuning advice ("Advice only, never applied", λ "dead time (default until approved)"), Tuning history (2 rows); the censored event reads "controller tuning changed" |
| B1 | Pass | one row VALIDATED (v8), batch id, `createdBy` superadmin |
| B2 | Pass (Admin path) | the author as SuperAdmin: APPROVED, note `[self-approved as SuperAdmin] e2e B2`. The Engineer cases were not run: the lab has no Engineer with configuration rights |
| B3 | Pass | one deployment, all 5 required workers (the Response Engine among them) ACK prepare + apply, ACTIVE_VERIFIED, no Flink restart |
| B4 | Pass | `regions`: FIC10302 90 / 110, source LOOP |
| B5 | Pass | the step that left the region: CENSORED `REGION_EXIT`; short windows 67-100 % outside, region invalid, with their G2r evidence run |
| B6 | Pass (re-run after the gap 5 fix) | FLOW_FAST_SELF_REG PROFILE v1 (one property set to the value it already had, so no result changes), approved alone in the editor by its author (SuperAdmin; recorded `[self-approved as SuperAdmin]`), deployed, all 5 required workers ACK, ACTIVE_VERIFIED; `stale`: FIC10302, base PROFILE v1, own properties the two region bounds plus `G4.activity_warn_ratio` (from its September bundle). Then re-stacked: v10 ACTIVE_VERIFIED, region 90 / 110 kept, `stale` empty |
| B7 | Pass | via the loop that was already stale (own settings on the September factory base): re-stack → v9 with the region and its own G4 value on the current base, approved alone (SuperAdmin), deployed, ACTIVE_VERIFIED; `stale` empty afterwards |
| B8 | Pass | Gate Configuration → Per-loop settings: the table, Edit regions, the batch panel ("Approve alone (Admin)", Deploy), the re-stack notice; Day, Night, 768 px. (The test file says "Plant-wide and Per-loop areas"; the owner-approved design is a third view, Effective \| Bundles \| Per-loop settings) |
| CHG-218 | Pass | System Response with no loop: "Models to review · 1", FIC10302 first order with dead time, gain 3 · time constant 20 s · dead time 3.96 s, waiting 2 |
| C | Pass (23 Nov, now required: the plant ships with day start 06:00) | lab PLANT_DAY_START=11:45 at +04:00 (07:45 UTC); long + fusion resubmitted with --plant-day-start 11:45, cplm-api recreated (KPI pass every 5 min, settle 2 min for the test). (1) JobManager log "CHG-102: evidence emit=EPISODES plant time zone=+04:00 (+04:00) day start=11:45 boundary kinds=[12h, 24h]"; (2) BOUNDARY sets 12h and 24h ending 2026-11-23T11:45:00+04:00, 22 artifacts each (long G5-G13, fusion G14-G15), archived by cplm-api (evidence_archive_run, partition day 2026-11-23); (3) GET fleet/kpis/trend plantDay {dayStart: "11:45", utcOffset: "+04:00"}; (4) the daily KPI pass recomputed 26 kept day-windows on the new boundary ("... stored as of 2026-11-22T07:45 ... recomputed from ... 2026-11-21T20:00"). Note for whoever repeats it: after a restart the long job waits 30 min before it emits (15 of 16 sample partitions are empty on the lab, watermark idleness 30 min); feed samples across the boundary (simulator from about 5 min before to 3 min after); the test text's offset +03:30 is +04:00 on this lab |

## Found during the run, fixed

| Found | Fix |
|---|---|
| A loop that sends P / I / D but has no PV range: the advice said "Tuning not received from the DCS" | reason `PV_RANGE_NOT_SET` ("No PV range recorded"), 3d19d7eb; seen live after the redeploy |
| Per-loop settings: "Edit regions" counted a loop with its own bundle but no region as a change at once (cplm-api leaves null fields out) | absent fields read as null, 14e15048; seen live after the redeploy |
| Frequency tab: headings tight against the table above; crossing frequencies with 19 digits | 1974a5cd |
| One step censored early (region exit, tuning change) came out as **two** censored events 5 s apart | a candidate within the step dwell of the last event's step is the same move (`ResponseCapture.alreadyCaptured`), reproduced by `CensoredStepReopenTest` before the fix (e16ca2d8); seen live on jar `15f24e3c`: the same region-exit step gave one event (04:42:52), where the old jar gave pairs (22:28:50 + 22:28:55, 22:48:33 + 22:48:38) |

## Gate Configuration fixes (CHG-220 + CHG-108 follow-up), checked on the lab after the redeploy

| Check | Result |
|---|---|
| Gap 3: a loop with no bundle of its own (FIC10401) | Prepare bundle draft: LOOP "Starts from PROFILE v1 · Active (verified)" (before: the factory layers); Day, Night, 1440 and 768 px |
| Gap 5: the author approves alone as SuperAdmin in the editor | button "Approve alone (Admin)", approval recorded with `[self-approved as SuperAdmin]`; once active, Approve is off |
| Gap 5: Governance → How to read | the three approval rules in their new words |
| Gap 8a: a batch read by its marker | the B7 re-run batch approved and deployed in one call each |

## Retest after all Gate Configuration fixes (23 Nov, morning)

Build: `feat/sr-engine-fixes` 781f59ed (cplm-api and frontend `sr-781f59ed`; jar unchanged, `15f24e3c`). Lab after the retest: the
alarm jobs and the job supervisor are stopped (owner: only the CPA jobs); SITE v1 active (G0.min_samples at its own value, no effect);
FIC10302 v12 at 90-110; FIC10401 v3 own bundle without a region; FIC10302 v13 is a draft only (shadow check). Owner: every Gate
Configuration gap goes into this release (CHG-220 screens, CHG-108 follow-ups 1-2 server).

| Check | Result |
|---|---|
| Operating region, UI end to end | Per-loop settings → Edit regions → Save 1 change → "Approve alone (Admin)" → Deploy → Active (verified), on FIC10401 (500-2000, then cleared); on FIC10302 back to 90-110 at the owner's request (v12) |
| Region exit (engine) | FIC10302 under 90-110: one REGION_EXIT event (05:47:14); short windows 1m 100 % outside G2r FAIL, 5m 65 % / 86 % FAIL. The owner's 90-120 change (05:57) reached the engine at 05:58 with no restart: PV 115 then counted inside (0 %, PASS), no region exit |
| Gap 1 | TIC10101 under the new SITE v1: 48 class-pack values read PROFILE, G0.min_samples SITE, no value changed (before the fix most read FACTORY) |
| Gap 2b | SITE v1 activated with Effective from 06:09: all 5 workers ACK at 06:03, row "takes effect 23 Nov 06:09", Active (verified) 06:14 (06:09 + probe window), never before |
| Gap 5 | SITE v1 approved alone by its SuperAdmin author (impossible before: ControlAuthority, which nobody holds) |
| Gap 6 | the editor band went Scheduled → Active (verified) with no reload |
| Gap 4 | SITE v1 (first version): Roll back off, "There is no earlier version to go back to now."; FIC10302 v12: "Roll back to v11"; superseded v11: off, "Only the version running now can be rolled back."; FIC10401 v2 → v1 rolled back (v1 active, v2 Rolled back); a second rollback refused 409 |
| Gap 7 | a SITE shadow run went FINISHED with nothing reading the run (before: stuck at Submitted). The comparison read took 13-30 s and failed with a 500 (JIT on a mis-estimated TimescaleDB query, then an ordered scan of every chunk); fixed in cplm-api 03d2ce26 + 1ccc7dcb: 0.07-0.8 s |
| Minors | "tomorrow 6" in Effective from: "Not a date and time, e.g. 2026-11-24T06:00", Activate off |
| Gap 7, Shadow tab | a FIC10302 draft's shadow run (2 h): the tab went Submitted → Finished with no reload; comparison read 0.5 s (the first read after the end 25 s). The run waited 25 min for a Flink slot (16 of 16 used, plus an orphan run of a start request cut off at 30 s); the owner had the alarm jobs stopped (only CPA jobs on the lab), then it ran at once. It made one 24h window with no LIVE counterpart, so "0 compared" |
| Found and fixed in this retest | the Roll back reason read "Only the version running now…" before the deployments were read (51334573: "Reading the deployments…") |
| Not testable on the lab | gap 2a (a worker that does not apply) and gap 9 (a Kafka outage): unit and lab-database tests only |

## Not covered on the lab

- The setpoint-step methods (CHG-216 integrating loops, CHG-217 servo dead time): the simulator has no closed-loop scenario
  (its servo step moves OP with PV, not a controller), so they rest on the bench tests. Smoke check on the lab: a setpoint
  step on FIC10302 was COMPLETE, EVALUATED, model estimated by the closed-loop method on the even grid
  (`PEM_ARMAX_INNOVATION`) - at the plant every setpoint step had been refused before.
- The Engineer approval cases (no such user with configuration rights on the lab).

## Combined deploy retest (CHG-221..226), 23 Nov

Build `feat/sr-engine-fixes` 91d9b2aa: Flink jar `ba52e36760d07338` (all CPA jobs; Long and Fusion resumed from savepoints
~12:01 UTC), cplm-api and ams-frontend `sr-91d9b2aa`, lab day start 06:00 at +04:00. Run 12:06-12:40 UTC by a CPA Updates
sub-agent, as the lab SuperAdmin, through the frontend (:3000) and the gateway (:8081) only. No Flink job or container was
touched. Screenshots: `C:\Users\Admin\AppData\Local\Temp\claude\cd01226643df5f14\474f2c3f-c14a-4911-bf8f-770b6ccad608\scratchpad\shots\retest\`
(below: `<name>` = `<name>.png` in that folder; it is the session scratchpad, copy what should be kept).

| Check | Result |
|---|---|
| A. Gate Configuration journey (CHG-221) | **Pass**, with screen issues (list below) |
| B. Values in use (CHG-224) | **Pass**, one gap: a scaled factory value has no basis on hover |
| C. Last stored result (CHG-226) | **Pass**: (1) the fields are in the results, (2) the screens with a probe loop; probe removed |
| D. Use plant-wide settings (CHG-223) | **Pass** |
| E. Class packs (CHG-225) | **Pass** (note: a loop draft on this lab carries no class pack, so the pack was also checked on a type draft) |
| F. Pages outside config | **Pass**: no errors, no layout breaks |

### A. Journey (CHG-221)

| Step | Result | Evidence |
|---|---|---|
| Pages, Day 1440 / Night 1440 / Day 768 | Pass: start, loop FIC10401, plant hdpe, type FLOW_FAST_SELF_REG, regions; no console errors, no horizontal scroll at 768 | `a-{start,loop,plant,type,regions}-{day-1440,night-1440,day-768}` |
| Change settings dialog | Pass: Apply to (This loop only 1 / Every flow, fast self-regulating loop 47 / The whole plant 177), Reason, Start | `a-start-dialog-day`, `-night` |
| Start | Pass: FIC10401 own settings v4 (`d486d8ea`), opened on the Edit step | |
| Edit | Pass: Asymmetry display threshold (G8, display only) 0.7 → 0.72, "Effective 0.72 This loop" | `a-edit-day`, `-night` |
| Check | Pass: ✓ Valid, Loops 1, but the diff also lists four values the person did not change (issue 3) | `a-check-day` |
| Try on past data (CHG-222) | Pass: Finished in ~30 s, "Compared 0 of 0 windows", "No matching live results to compare" (FIC10401 has no data on the lab, issue 5). On FIC10301 (draft only, G4 activity warn ratio 3 → 2): period aligned to the newest live 24h window (21 Nov 23:00 → 22 Nov 23:00), "Compared 1 of 1 windows", "Symptoms 0 removed · 0 added" | `a-try-day`, `-night`, `-day-768`; `a2-try-day` |
| Approve alone | Pass: "Approve alone", recorded `[self-approved as SuperAdmin]` 12:20 | `a-approve-before`, `-after` |
| Deploy → Active | Pass: deployed 12:21:20, ACTIVE_VERIFIED by 12:26; the page went Deploying → "✓ Running" at 12:27 with no reload; effective v4, all 5 required workers ACK v4 | `a-deploy-waiting`, `a-deploy-fresh-day` |
| Restore | Done by check D (v5 "Uses the plant-wide settings" supersedes v4) | |

### B. Values in use (CHG-224)

| Point | Result |
|---|---|
| Loop page lists only editable settings | Pass: FIC10401 63 rows = the 63 editable entries of `effective` (none missing, none extra); FIC10302 63 |
| Value in use and where it comes from | Pass: Loop type 41, Factory 17, Worked out automatically 3 (basis on hover, e.g. "25 kg/h - 1 % of the PV range"), Needs a decision 2; FIC10302 region "90 · This loop" |
| The two decisions | Pass: FIC10302 "Not decided — 150 s used (30 samples at 5.0 s)" and "Not decided — advice uses the dead time (3.97 s)"; FIC10401 "Not decided — 30 samples at the loop's sample interval are used" and "Not decided — no tuning advice until a validated model gives the dead time" |
| Forbidden words | Pass: no "No value", "unset", "NO_VALUE", "FACTORY", "not read by this build" in the text or hover titles of the five pages, every gate of Values in use, and the Edit / Deploy steps |
| Edit step lists only editable properties | Pass: 63 listed = the catalogue's 63 editable |
| `GET effective?loopId=FIC10302` | Pass: `G12.step_min_input_eu` value 2, configured 1.0, level FACTORY, basis "2.0 - 1.0 per 100 of the PV range" |
| Gap | On the loop page that row reads "2 · Factory" with **no hover basis** (the screen shows a basis only for values worked out automatically), so the scaling is not visible; the same for G12.settling_abs_band_pv_eu (0.2) and G12.gain_abs_max (2,000), issue 9 |

### C. Last stored result (CHG-226)

| Point | Result | Evidence |
|---|---|---|
| (1) simulator on FIC10302 | Ran 12:07-12:15; it crossed no window end by 2 min and the long job emits only after the restart's 30 min idleness, so it was run a second time 12:29-12:37 | scratchpad `c1-sim.log`, `c1-sim2.log` |
| (1) long results | Pass: 4h / 12h / 24h rows for window ends 12:15 (written 12:28:52) and 12:30 (12:32:06), `coverage_from_ms` 1795435626137 (= 12:07:06.137, the first simulator sample: nothing for FIC10302 was in the restored buffer), `warming_up` true, jar `ba52e367` | SQL, `analytics.cplm_long_feature_results` |
| (1) gate results | Pass: 12h / 24h rows for the same window ends carry the same `coverage_from_ms` and `warming_up` true (INSUFFICIENT_DATA, LIVE) | SQL, `analytics.cplm_gate_results` |
| (2) probe | One loop `RFPROBE_FIC901` in its own site `rfprobe`: registry row, a 12h verdict CONFIRMED_OSCILLATION ended 9 h ago plus a refill row 10 min ago, the same for 24h, one open episode (the REF case of FleetRefillFallbackTests); inserted 12:33:17, removed 12:34:57 | scratchpad `rt-probe-insert.sql`, `rt-probe-delete.sql` |
| (2) screens | Pass: "Last stored result · 23 Nov · 03:33" once per row on Overview → Loops requiring review, the KPI drill-down (Oscillating, All loops), Performance findings, the Performance gate matrix and the Loop Explorer band; not on Not assessable (correct) | `c-probe-*` (Day; Night for overview, KPI, matrix, explorer) |
| (2) normal loops | Pass: no label on the same seven views for hdpe (FIC10302 reads "Not evaluated: not enough data": its earlier 12h rows are INSUFFICIENT_DATA as well, nothing real to keep) | `c-hdpe-*` |
| (2) cleanup | Pass: 0 rows for the probe loop / site in every `loop_id` / `site` column of traverse_cplm (58 columns); the daily KPI pass last ran 12:05:59, before the probe, so no stored KPI day saw it | |

### D. Use plant-wide settings (CHG-223)

| Point | Result | Evidence |
|---|---|---|
| Dialog | Pass: "Use plant-wide settings · 1 loop", FIC10401, Reason | `d-dialog-day`, `-night` |
| Batch | Pass: regions page `?batch=3c410b59…`, row "Uses the plant-wide settings · Validated" | `d-batch-saved` |
| Approve alone / Deploy | Pass: Approved 12:28:36, Deploy 12:28:42 → Preparing → Probing → "✓ Running" 12:34:02 | `d-batch-deploying`, `d-batch-end` |
| Afterwards | Pass: effective under PROFILE FLOW_FAST_SELF_REG v1 (layers FACTORY, SITE, PROFILE), G8 back to 0.7, workers run PROFILE v1; loop page pill "Type settings v1", no "Use plant-wide settings" button; Versions: "Uses the plant-wide settings ✓ Running", v4 / v3 / v1 Replaced; regions page From "Type settings" (the plant-wide level that applies to this type); the marker's page: Edit frozen ("This version is running — start a new change to edit"), Deploy and Roll back off | `d-loop-after-day`, `d-loop-versions-*`, `d-marker-*`, `d-regions-after-day` |

### E. Class packs (CHG-225)

| Point | Result |
|---|---|
| TIC10101 loop draft | Pass: own settings v1 (`e20b662b`) from Plant settings v1, Check "✓ Valid", no errors or warnings, Loops 1 (`e-check-day`, `-night`) |
| Note | On this lab a new draft starts from Plant settings v1, which has no PROFILE layer, so the TIC10101 draft carries no class pack (resolved values FACTORY / NO_VALUE) and Validate reads only those; the pack the engine runs (LoopEffective) is laid in for Values in use and Try on past data, not for Check. The loop draft therefore could not fail on a pack. To check the pack itself, a TEMP_SLOW_SELF_REG type draft from the factory layers (v1 `f5c8a880`, created through the gateway, draft only) was checked in the UI: PROFILE layer G9.role SUPPORTING, G5.period_max_s 28,800 s, minimum complete cycles 3 → "✓ Valid", 0 errors, Loops 36 (`e2-check-day`, `-night`) |

### F. Pages outside config (Day and Night, 1440)

Overview, Performance findings, Performance gate matrix, Loop Explorer FIC10302: no console errors, no error banners, no
horizontal scroll (`f-*-day`, `f-*-night`).

### Screen issues for the session that owns the Gate Configuration screens

1. **Plant page shows "Factory settings" while Plant settings v1 is active** (the start page says "Whole plant · Plant settings v1"). Values in use: 49 of 63 rows "— · Factory" (the factory fallback); Versions tab: "No versions yet" although v1 (active) and v2 (draft) exist. Cause: the SITE bundles carry `scopeRef` "" (empty string) and `activeAt` and the Frame's `mine` filter compare `(b.scopeRef ?? null) === null` (ConfigScopePage.tsx). `a-plant-*`, `b-plant2-*`.
2. **Loop page "Some parts run another version: Own settings v1 on 5 parts"** (FIC10401 before the retest): v3 was active and every worker had acknowledged v3's content hash `496a7c…` (= v2 = v3); v1 has `1394bb…`. The server's `workers[].runs` pointed at v1 (v2 was rolled back to v1 this morning, then v3 deployed with v2's content). Server side (effective). Gone after v4. `a-loop-day-1440`.
3. **Check and Approve list values the person did not change.** One edit on FIC10401 showed five rows: Role PRIMARY → SUPPORTING twice (G7, G10), Period maximum (s) 900 → — and Period minimum (s) 10 → — (G6), and the edit. These are non-editable properties (NOT_APPLIED / AUTOMATIC) that CHG-224 D1 drops from every new version (`WithoutNonEditable`): nothing changes in the engine, but the person reads that the change switches two roles and removes a period range, and the Approve summary hides the real edit behind "and 2 more". The same on FIC10301. Also: two rows named only "Role" (no gate) and raw codes PRIMARY / SUPPORTING. `a-check-day`, `a-approve-before`.
4. **Approve step "On past data: No result changes"** when the try compared 0 of 0 windows (FIC10401): nothing was compared.
5. **Try on past data with 0 of 0 windows** says "No matching live results to compare", but the run itself made no windows (FIC10401 has no data in the period). With 1 of 1 compared and nothing changed (FIC10301) there is no before / after row, only the counts. "Try again" sits between "Run on" and "Period". `a-try-day`, `a2-try-day`.
6. **The running marker's Roll back reason** reads "Only the version running now can be rolled back." on the version that is running ("Uses the plant-wide settings v5", ✓ Running). `d-marker-change-day`.
7. **Technical text in the marker's lead**: "[batch 3c410b59-00db-499d-a130-4e72f3f3764f inherit] retest …". `d-marker-change-day`.
8. **Deployment row glyph**: the row reads "◐ Running" (in-progress glyph, amber) while the page pill reads "✓ Running" for the same ACTIVE_VERIFIED deployment. `a-deploy-fresh-day`, `d-marker-change-day`.
9. **Scaled factory values without basis** (B gap): "2 · Factory" for a value the factory sets as "1.0 per 100 of the PV range".
10. **The regions batch panel says "Approve alone (Admin)"**; the change page says "Approve alone" (no role in brackets). `d-batch-saved`.
11. **Stale page name in a value**: FIC10401 Region minimum / maximum read "Not limited - set a region in Per-loop settings" (Per-loop settings is now Operating regions / Edit region).
12. Minor: a fresh draft opens with Edit already "✓ done" and Check "in progress" before any edit; the viewed step's circle is a solid teal disc whose number or tick is barely visible; the marker shows Try "✓ done" although no try ran; Values in use and the regions table use ~400 px of a 1,170 px card at 1440; the Check "Now" column reads "—" for a type change whose loops already run the class pack values (TEMP v1).

Also seen, outside Gate Configuration: the KPI drill-down row shows the refill window's time ("23 Nov · 12:23 · 11 min ago") above "Last stored result · 23 Nov · 03:33"; readable, but the first time is not the verdict's.

### Left on the lab

- FIC10401: v4 (G8 asymmetry display threshold 0.72) was active 12:26-12:34; now v5 "Uses the plant-wide settings" is active: the loop has no own settings and runs Type settings v1 (before the retest it ran own settings v3, whose content was the type values with the region cleared).
- Drafts, not approved: FIC10301 own settings v2 (G4 activity warn ratio 2, tried), TIC10101 own settings v1 (no edits, checked), TEMP_SLOW_SELF_REG type settings v1 (factory pack, checked). They show under Changes in progress, and a new change at those levels starts from them (newest by number).
- FIC10302: two simulator runs (12:07-12:15, 12:29-12:37, P 80 unchanged) and their warming-up long / gate rows; region 90-110 and v12 untouched.
- Probe rows: none left (checked).

## Re-check of the 12 screen fixes (build d2407216), 23 Nov, 13:16-13:35 UTC

The lab runs cplm-api and ams-frontend built from d2407216; images are tagged `sr-d2407216`, and `sr-91d9b2aa` is kept for
rollback. Flink was not restarted. Every changed page was checked in Day and Night at 1440 px: 0 console errors, no
horizontal scroll, no layout breaks.

| # | Fix | Result |
|---|---|---|
| 1 | Plant page shows Plant settings v1 and its versions | Pass |
| 2 | "Some parts run another version" uses the newest acknowledged deployment (FIC10401: API matches the worker ACKs) | Pass |
| 3 | Check / Approve list only the real edit (one edit = one row, values in words, no "and N more") | Pass |
| 4/5 | Past-data wording: "Same result in the compared window" (1 of 1); "No data in the chosen period" / "Not compared - no data in the period" (0 of 0) | Pass |
| 6 | Roll back reason on the running plant-wide version: "Start a new change to use own settings again" | Pass |
| 7 | No "[batch ...]" text anywhere | Pass |
| 8 | Deployment row "✓ Running", no in-progress mark | Pass |
| 9 | Hover basis on scaled values ("2.0 - 1.0 per 100 of the PV range") | Pass |
| 10 | Regions batch panel says "Approve alone" | Pass |
| 11 | Region text points to "Operating regions" | Pass |
| 12 | Fresh draft: Edit is current; plant-wide version: Edit / Check / Try not used | Pass |

New, small (sent to the screens session):
1. Values in use shows the raw code "SUPPORTING" for Phase geometry Role (the hover text is already in words).
2. Plant page: scaled values (step minimum input, settling band, gain maximum) show the per-100 number with no hover
   text, so they look absolute; number formatting differs ("1e-9", "14400" vs "2,000" on the loop page).
3. A settled own-settings version shows "Try on past data" as done although no try ran (FIC10302 v12; its Approve
   step says "Not tried").
4. "No data in the chosen period" appears on a loop change, where the person cannot choose a period.

Also seen: the FIC10302 v12 deployment detail shows "Different software versions are running." (checked 06:23 UTC,
before the combined deploy). Two old test loops (EVAPI_12F4CB, EVAPI_6E7E80 "evidence api probe") are listed on
Operating regions; this round did not create them.

Writes and cleanup: one FIC10301 test draft (deleted, 0 open drafts left) and two Try-on-past-data runs (both
finished; their run records stay, as with earlier tries). No approve, deploy, rollback or batch submit.

## Re-check 2: the five follow-up fixes (frontend 673870bb, cplm-api 651ab5d8), 23 Nov

Read-only round, Day and Night at 1440 px on 11 pages: 0 console errors, no layout breaks.

| # | Fix | Result |
|---|---|---|
| 1 | Values in use shows "Supporting" (words, not the code) on plant, type, FIC10401, FIC10302 | Pass |
| 2 | Plant / type pages: PV-scaled values explain "per 100 of each loop's PV range" on hover; numbers grouped (14,400), no 1e-9 | Pass |
| 3 | FIC10302 v12 no longer marks Try as done ("Not tried") | Pass |
| 4 | Loop change with no data: "No data in the last 24 hours" on Try and Approve (FIC10401 v4's stored run) | Pass |
| 5 | Past deployment: neutral "At this deployment, parts ran different software versions", no red alert | Pass |

Found in this round and fixed at once (cplm-api 651ab5d8): the hover text of G12 fit relative tolerance read "1E-09 -
standard setting"; it now reads "0.000000001 - standard setting" (0 scientific strings across FIC10302's 165 values).

Also seen: the plant shows 175 loops (was 177) - the two EVAPI test loops were deleted with the owner's OK. One open
draft not made by the re-check: B2_027PIC own settings v1, note "test", by superadmin 13:46 UTC - left alone.

## Re-check 3: Gate Configuration start page as a filter bar (frontend 007eebcc), 23 Nov

Read-only round, header plant HDPE Plant (`?site=hdpe`), Day and Night at 1440 / 1000 / 768 / 390 px: 0 console errors.
Changed tests (ConfigStartPage, ConfigJourneyScope) 17/17 pass; eslint clean on the changed files.

| Check | Result |
|---|---|
| Bar lines up with Loop Events / Loop Explorer filter bars (x 244, first control x 261; 39-40 px controls, 14 px text) | Pass |
| One row at 1440 and 1000, two rows at 768, stacked at 390; no overflow, Day and Night | Pass |
| No card or status-line leftovers, no technical text (loop types in words) | Pass |
| Loop search FIC10302 → `/cpm/config/loops/FIC10302?site=hdpe` | Pass |
| Loop type → `/cpm/config/types/FLOW_FAST_SELF_REG?site=hdpe` | Pass |
| Whole plant → `/cpm/config/plant/hdpe?site=hdpe` | Pass |
| Operating regions → `/cpm/config/regions?site=hdpe` | Pass |

Issue (sent to the CPA Redesign session): with a loop in context (after Loop Explorer, FIC10302) the sidebar link is
`/cpm/config?site=hdpe&loop=FIC10302` and the start page redirects to that loop's page, so the bar never shows. Cause:
`legacyTarget` treats a bare `?loop=` as an old-style link (code from 4457e36c, older than 007eebcc).

Minor: "Whole plant" lists all five plants with one chosen (known); at 390 px the Operating regions button stays about
150 px wide while the other controls fill the row; at 768 px the "Running now" table fills about 445 px of its card.

## Round 4: live updates (CHG-227) and the six Gate Configuration re-check fixes (frontend + cplm-api 77b3afee), 24 Nov

Lab feed for this round (owner OK): `ams-sparkplug-edge-node` started again (stopped since 3 Nov; its consumer group had
expired, 88 old messages replayed), and `scripts/sim/loop_step_sim.py --loop FIC10302 --scenario input-test --pre-s 30
--post-s 90 --repeat 20 --port 1886` (OP 40 -> 45 steps every ~2 min). Chain checked at 10:09 UTC: samples -> live job ->
MQTT (browser-style login through the gateway, CONNACK 0) -> IoTDB (newest sample 9 s old).

| Check | Result |
|---|---|
| Trend page `/trend?loop=FIC10302&range=15m`, 4 min without reload: window moved, new steps drawn at the right edge, "Live" | Pass |
| Trend page: `/api/hist/trend` re-read every 60 s (one call per pen); SUBSCRIBE to `spBv1.0/ams_site1/DDATA/ams_edge1/FIC10302`; 48 DDATA in 4.5 min | Pass |
| Loop Explorer FIC10302: PV and OP changed on screen through two steps (108.26 -> 114.66 -> 100.00 -> 114.74), every value "live"; 8 h trend re-read each minute | Pass |
| Night, both pages | Pass |
| Gate Configuration start page with a loop in context: start page shows, FIC10302 in the search, back link, next page carries the picked loop | Pass |
| "Whole plant" lists HDPE only; 390 px Operating regions button fills its row; 768 px tables fill their cards (Day and Night) | Pass |
| Check step: draft GET carries `below` / `effective`; a type change with no edits "Nothing changed yet."; one edit lists only it, Now = the type pack value (0.7) | Pass |
| Try on past data with no differing window names the diagnosis | Pass, one-window form only (the lab has no consecutive live 24 h windows) |

New, sent to the CPA Redesign session: the Edit step form shows "Effective —" where Check's Now shows the type pack value
(0.7); at 390 px the "Changes in progress" table is wider than its card, so Continue sits off-screen inside the card.

Writes and cleanup: one test draft (PROFILE FLOW_FAST_SELF_REG v2, one edit, one Try run, job 3ee15344) deleted with the
guarded delete; the owner's B2_027PIC v1 draft is the only open draft. Nothing approved, deployed, scheduled or submitted.
The tester's log briefly held the test session token from the `/mqtt-ws?access_token=` URL; removed at once, verified.

## Round 5: the two round-4 issues (frontend + cplm-api 4af8eb3e), 24 Nov 11:12-11:17 UTC

| Check | Result |
|---|---|
| Draft GET / PATCH carry `below`, `belowSources`, `effective`, `effectiveSources` (165 keys) | Pass |
| Edit step before an edit: "Effective 0.7 Loop type · Inherited 0.7 Loop type"; after Set 0.72: "Effective 0.72 Loop type", Inherited 0.7 | Pass, Day + Night |
| Set / Reset / Set: no "—", "Worked out automatically" or "Factory" flash in the gate list (in-page observer, 3 s after each click) | Pass |
| Check step still "Now 0.7 · New 0.72" | Pass |
| Start page at 390 px: two-line rows, Continue inside the card, no sideways scroll; 768 / 1000 / 1440 normal table | Pass, Day + Night |
| Regime-level value reads "This regime" | Not tested (no regime version on the lab) |
| Console | 0 errors |

Test draft PROFILE FLOW_FAST_SELF_REG v2 (b83bd09d, one edit) deleted with the guarded delete; only the owner's B2_027PIC
v1 draft is open. The live feed (simulator + edge node) was stopped on the owner's word at the end of round 4.
