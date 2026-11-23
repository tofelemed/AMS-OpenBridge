# System Response release: what changed, and what it means for Flink, the database and the plant

23 Nov 2026. Branch `feat/sr-engine-fixes` (head `dab6f725`, unpushed), which contains `feat/sr-mine` (CHG-106..109) and
`feat/cpa-redesign` up to v2.9.1. **No deployment bundle is built until the owner approves.** Plan:
`docs/next-release/system-response-implementation-plan.md`; owner decisions: `system-response-owner-decisions.md`; SME
items: `sme-review.md`; lab results: `system-response-e2e-results.md`.

## 1. What changed, by phase

| Phase | CHG | Change | Where |
|---|---|---|---|
| 1 | 204-211 | Engine fixes: PV-range-scaled step / settle tests, servo steps on an even grid, textbook decay ratio, valve-at-limit and region-exit censors, declared process type, 95 % prediction band, closed-loop fit centred on the pre-step state, model check replayed from the previous event's own start | Flink |
| 1 | (owner, 22 Nov) | Capture in **AUT only** (`--response-capture-modes AUT`); leaving AUT censors the event | Flink |
| 1 | 106 | `PLANT_DAY_START` (default 00:00 = unchanged): the evidence boundaries and the daily KPI day can follow 06:00 / 18:00 shifts | Flink, cplm-api, frontend, compose |
| 2 | 212-215 | Controller tuning from the DCS: P / I / D read from the samples, CENTUM ideal PID (Kc = 100 / P × OP span / PV span), "tuning changed" censor, margins / Bode / SIMC advice, Frequency tab | Flink, frontend |
| 2 | 107 | Tuning history: cplm-api stores each loop's tuning (effective-dated) and links each model to it; `GET .../loops/{id}/controller-tuning` | cplm-api |
| 4 | 216 | Setpoint-step models for integrating (level) loops (`PEM_ARMAX_RATE`) | Flink |
| 4 | 217 | Servo dead time no longer one read short on jittered data | Flink |
| 4 | 108 | Per-loop settings apart from the plant-wide ones: operating regions for many loops at once, re-stack of loops with their own settings after a plant-wide change, batch approve / deploy | cplm-api |
| 4 | 109 | Model review queue (one row per loop and path to review) | cplm-api |
| 4 | 218 | "Models to review" on System Response | frontend |
| 4 | 219 | Gate Configuration "Per-loop settings" view; the Response job named as a reader of the region | frontend, catalogue |
| fixes | 108 follow-up, 220 | One approval rule everywhere (a second person, or an Admin / SuperAdmin alone, recorded); SuperAdmin approves site-wide; expired approvals re-approvable; a loop's first own bundle starts from the plant-wide bundle; batch lookup without the 200 cap | cplm-api, frontend |
| fixes | 108 follow-up 2 (+ UI by CPA Updates) | The rest of the Gate Configuration check: Effective values over the class pack; per worker the bundle it really runs; no "active" before a scheduled time; rollback only from the current deployment to the version before it; shadow status refreshed; lost Kafka messages re-sent, then failed | cplm-api, frontend |

Also in the branch: v2.9.1 (CHG-183..203, built 15 Nov, not deployed) with migration `cpm-22-response-redraw-retention`.

## 2. Services, database, topics, configuration

| Item | Change |
|---|---|
| Images | **Flink jar / image**, **cplm-api**, **ams-frontend**. Ingestion, ams-api, historian, gateway: unchanged |
| Ship together | the jar and cplm-api carry the same property catalogue (hash `aee93593…`): a deployment needs workers on the catalogue cplm-api validated against |
| Database | **No new migration** from this work. `cpm-22` (v2.9.1) only if v2.9.1 is not deployed first. Tables newly written: `cpm.controller_snapshot` (tuning history, kept; a row only per tuning change); batches use the existing `note` column |
| Kafka | no new topic. P / I / D ride on `traverse.cpa.loop.samples.v1` as extra fields (ingestion already maps P → p, I → i, D → d) |
| Compose / `.env` | `PLANT_DAY_START` (cplm-api `Cpm__PlantDayStart`, both Flink submitters); default `00:00` |
| New job arguments (all optional, defaults apply) | `--response-capture-modes` (AUT), `--g12-lambda-rule` (DEAD_TIME), `--g12-controller-scan-s` (1), `--g12-settle-noise-multiplier`, `--g12-actuator-limit-band-fraction`, `--g12-actuator-limit-dwell-s`, `--g12-region-exit-dwell-s` (10), `--plant-day-start` (00:00) |
| New API | `GET .../loops/{id}/controller-tuning`; `GET/POST .../configuration/regions`; `GET .../configuration/loop-settings/stale`; `POST .../loop-settings/restack`; `GET .../configuration/batches/{id}`, `POST .../batches/{id}/approve`, `.../deploy`; `GET .../models/review-queue` (base `/api/v1/cpm`) |

## 3. Effect on the Flink jobs

| Job | At the deploy | After |
|---|---|---|
| **AMS - CPLM Response Engine** | **Resubmit without state** (new fields in its keyed state; never a savepoint upgrade, never a ZK-HA restore of the old jar) | Event and result identities change for loops without a bundle. A loop's model check and band start from its **second** accepted event after the deploy. Expect more `ACTUATOR_CONSTRAINT` / `REGION_EXIT` / `TUNING_CHANGED` censors, far fewer models rejected as "no better than a flat line", setpoint steps getting models for the first time |
| Short, Long, Fusion and the other CPLM jobs | New jar. They may restore from savepoints (the sample class only gained nullable fields), or start fresh in the plant's usual full swap | With a fresh start the 12 h / 24 h verdicts refill in about 11 h / 23 h. Long and Fusion read `--plant-day-start` (00:00: no change) |
| All CPLM workers | Announce the new catalogue in their CAPABILITY record | A region deployment now also waits for the Response Engine's ACK |

## 4. What needs a restart, and what does not

| Change at the plant | Restart? |
|---|---|
| Add or change an operating region (one loop or many) | **No.** The bundle is broadcast to the running jobs, each worker acknowledges it, and it applies from its effective time. Checked on the lab (all 5 required workers ACK, ACTIVE_VERIFIED) |
| Deploy any plant-wide or per-loop Gate Configuration bundle, or a re-stack batch | No (same broadcast) |
| The DCS starts publishing P / I / D | No: ingestion forwards them, the engine reads them on the next event |
| Declare or correct a loop's PV range | No restart; the next event uses it (a new tuning row is written when the range changes) |
| `PLANT_DAY_START` (e.g. 06:00) | Yes: resubmit Long + Fusion (fresh state, verdicts refill within a day) and recreate cplm-api (`deploy.sh`); the kept KPI days are re-stored on the next daily pass |
| Add Cascade to the capture (later phase) | Yes: resubmit the Response job with `--response-capture-modes AUT,CAS` |

## 5. Behaviour the plant will see

- **Regions change verdicts:** a window with the PV outside its loop's region more than 20 % of the time fails G2r and loses
  its fused verdict; events leaving the region are censored. Regions are entered after deploy (section 6).
- **Approvals:** every Gate Configuration approval needs a second person, except an Admin or SuperAdmin approving their own
  (recorded as `[self-approved as <role>]` in the approval and the audit). Site-wide bundles need a SuperAdmin.
- **Per-loop settings** keep a loop's own values; after any plant-wide change the screen offers to re-stack those loops so the
  plant-wide change reaches them too.
- **Tuning:** the Frequency tab shows the tuning each event ran under, the history, margins and advice ("advice only, never
  applied"). A loop that publishes tuning but has no PV range shows "No PV range recorded".
- **Review:** System Response lists one model to review per loop (no baseline first).

## 6. Steps at the plant after the deploy

1. Load the 9 recommended regions (`sme-review.md` section 3) in Gate Configuration → Per-loop settings, approve (a second
   person, or a SuperAdmin alone) and deploy. No restart.
2. Retire the 18 non-PID tags in Loop Registry.
3. Declare the PV range of every loop that publishes tuning.
4. I&C: publish P / I / D under `PIDParams` with PV / SV / MV / MODE.
5. When the SME confirms the shifts: set `PLANT_DAY_START=06:00` (section 4).

## 6a. Lifecycle: adding or changing an operating region

All in cplm-api (`/api/v1/cpm/configuration`), tables in `traverse_cplm`. Topics: `traverse.cpa.context.gate-config.v1`
(bundle broadcast, compacted) and `traverse.cpa.context.gate-config.acks.v1` (worker ACKs and CAPABILITY records).

| # | The engineer does | What happens behind it | API / permission | Data and audit |
|---|---|---|---|---|
| 1 | Gate Configuration → **Per-loop settings** (third view) | The table lists every active loop of the site with its PV range, region and source (Own / Plant-wide / None) | `GET regions?site=` · `cpm.config.read` | reads `cpm.loop_registry`, `cpm.config_active`, `cpm.gate_config_bundle` |
| 2 | **Edit regions**, types min / max (both empty = clear), **Save** | For each changed loop: one LOOP draft built on the bundle the loop runs under now (its own LOOP bundle, else the active PROFILE / SITE bundle with a LOOP layer added), the two properties `G2r.pv_region_min` / `_max` set, validated. All drafts form one batch (`[batch <id> regions]` in the note). Rows with errors (unknown or retired loop, one bound, min ≥ max) are refused one by one; a region outside the PV range is a warning | `POST regions` · `cpm.config.draft` | `cpm.gate_config_bundle` (state VALIDATED or REJECTED); audit `CONFIG_DRAFT_CREATED` per loop, `CONFIG_REGION_BATCH_CREATED` |
| 3 | **Approve** (a second person) or **Approve alone (Admin)** (the author as Admin / SuperAdmin) | Each validated draft gets an approval bound to its content hash, valid 72 h (re-approvable when expired); a self-approval is recorded as such; an Engineer cannot approve their own | `POST batches/{id}/approve?site=` · `cpm.config.approve` | `cpm.config_approval`, bundle → APPROVED; audit `CONFIG_DRAFT_APPROVED` (`selfApproved`, `role`) |
| 4 | **Deploy** | One deployment per bundle: SCHEDULED → the PREPARE message on the broadcast topic → every required worker (the CPLM jobs that read a catalogue property, the Response Engine included) ACKs PREPARE with the same hash on one jar → PREPARED → APPLY message (at the effective time) → APPLY ACKs → PROBING → ACTIVE_VERIFIED (a result carries the hash, or the probe window passed). A missing ACK after 5 min = PARTIALLY_ACKNOWLEDGED; a NACK = ACTIVATION_FAILED; a lost message is re-sent by the 30 s sweep, then failed. **No Flink restart** | `POST batches/{id}/deploy?site=` · `cpm.config.activate` | `cpm.config_deployment`, `cpm.config_worker_ack`; at ACTIVE_VERIFIED `cpm.config_active` names the bundle and the previous one is SUPERSEDED; audit `CONFIG_DEPLOYMENT_SCHEDULED`, `CONFIG_ACTIVE_VERIFIED` (or `CONFIG_REJECTED`) |
| 5 | (nothing: the engine applies it) | From the effective time: the Short job checks G2r against the region (a window more than 5 % outside = WARN, more than 20 % = FAIL, and the fused verdict of a FAIL window is excluded); the Response job censors an event whose PV leaves the region for 10 s (`REGION_EXIT`) | — | results carry the new bundle hash |
| 6 | After any plant-wide (SITE / PROFILE) deployment: the notice "N loops have their own settings on the previous plant-wide settings" → **Prepare their new versions**, then approve and deploy as in 3-4 | For each such loop a new LOOP draft = the current plant-wide layers + the loop's own layer, unchanged, as one batch (`[batch <id> restack]`) | `GET loop-settings/stale?site=`, `POST loop-settings/restack` · `cpm.config.read` / `.draft` | audit `CONFIG_DRAFT_CREATED`, `CONFIG_RESTACK_BATCH_CREATED` |

## 6b. Lifecycle: a gate configuration change (one bundle, Bundles view)

| # | The engineer does | What happens behind it | API / permission | Data and audit |
|---|---|---|---|---|
| 1 | Bundles → **Prepare bundle draft**, picks LOOP / PROFILE / SITE and a note | A new version of that scope. A next version starts from the previous one of the scope; a first version starts from the plant-wide bundle in force (LOOP: the active PROFILE, else SITE; PROFILE: SITE), the factory layers only when nothing above is active | `POST drafts` · `cpm.config.draft` | `cpm.gate_config_bundle` DRAFT; audit `CONFIG_DRAFT_CREATED` |
| 2 | Edits properties (requested changes only) | Each save is checked against the catalogue (type, range) and the draft's version tag (409 when someone else changed it); the draft returns to DRAFT and its old comparison is cleared | `PATCH drafts/{id}` with If-Match · `cpm.config.draft` | audit `CONFIG_DRAFT_EDITED` |
| 3 | **Validate** | Every rule of the catalogue (dependencies such as max > min, the execution plan); the change class is the class of what this version changes (POLICY, STATE_BOUNDARY, …) | `POST drafts/{id}/validate` · `cpm.config.validate` | VALIDATED or REJECTED with every reason; audit `CONFIG_DRAFT_VALIDATED` |
| 4 | Optional **Shadow run** on a loop (1-168 h) | A SHADOW analysis run replays the loop's history from IoTDB under the draft's values (the loop's class pack under the draft's layers); no operational output. The comparison (before / after per gate) refreshes the run's state from Flink | `POST drafts/{id}/shadow`, `GET drafts/{id}/shadow` · `cpm.config.shadow` / `.read` | `analytics.analysis_run`, SHADOW rows in `cplm_gate_results`; audit `CONFIG_SHADOW_STARTED` |
| 5 | **Approve** | A second person, or the author as Admin / SuperAdmin ("Approve alone (Admin)", recorded). A SITE bundle, or a change of `G3.objective_type` / `G14.allowed_evidence_types`, needs a SuperAdmin. Valid 72 h; an expired approval can be given again | `POST drafts/{id}/approve` · `cpm.config.approve` | `cpm.config_approval`; audit `CONFIG_DRAFT_APPROVED` |
| 6 | **Activate**, optionally with "Effective from" | As step 4 of 6a. A bundle with a future effective time is prepared and applied by the workers but takes effect only at that time, and the page shows "Takes effect at …" (it is never ACTIVE_VERIFIED before it) | `POST deployments` `{bundleId, scheduledFor}` · `cpm.config.activate` | as 6a step 4 |
| 7 | Watches the **ACK matrix** | States SCHEDULED, PREPARING, PREPARED, APPLYING, PROBING, then ACTIVE_VERIFIED, PARTIALLY_ACKNOWLEDGED or ACTIVATION_FAILED; the bundle's state follows; a partial or failed one can be deployed again while the approval is valid | `GET deployments/{id}` · `cpm.config.read` | `cpm.config_deployment`, `cpm.config_worker_ack` |
| 8 | **Effective** view of a loop | The loop's values the engine's way (the bundle's layers over the loop's class pack) with each value's source; per worker the bundle it really runs, and "N of M run another version" during a partial deployment | `GET effective?loopId=` · `cpm.config.read` | reads `cpm.config_active`, `cpm.config_worker_ack` |
| 9 | **Roll back to vN** (only on the scope's current deployment) | A new deployment (kind ROLLBACK) of the version active before it; when verified, the rolled-back deployment is ROLLED_BACK. None for a first version, and only one at a time | `POST deployments/{id}/rollback` · `cpm.config.rollback` | as 6a step 4; audit `CONFIG_DEPLOYMENT_SCHEDULED` (kind ROLLBACK) |

## 7. Verification

- Tests: the full Flink suite; cplm-api config / region / review-queue / tuning / plant-clock tests on the lab database; the
  frontend CPM test files, tsc and eslint (see each CHG in `changes_tracker.md`).
- Lab end to end (23 Nov, one deploy, `system-response-e2e-results.md`): A1-A8, A10, B1-B8 and the review list pass, incl.
  the B6 re-run after the approval fix; the duplicate censored event seen on the lab is fixed and checked live.
- Not covered on the lab: A9 (every simulated loop carries an old P), the Engineer approval path (no such user on the lab),
  the plant-day start (optional), and the closed-loop setpoint methods (CHG-216 / 217 rest on bench tests; a smoke check
  on the lab modelled a setpoint step).

## 8. Open for later (not in this release)

Cascade / master-slave; Manual bump tests; keeping P / I / D in the historian (the tuning history covers the analysis need).
(The Gate Configuration gaps 1, 2, 4, 6, 7, 9 of `gate-configuration-e2e-check.md` were moved into this release by the
owner on 23 Nov.)

## 9. Records

`changes_tracker.md`: CHG-106, 107, 108, 108 follow-up, 109 and CHG-204..220 sections. `prod_decision.md`: plant day start,
tuning history, per-loop settings and regions, approval rules, and the System Response engine section.
