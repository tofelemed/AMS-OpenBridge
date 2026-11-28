# System Response: implementation plan (Auto loops)

| | |
|---|---|
| Approved | owner, 22 Nov 2026: work phase by phase; **use the defaults now, the SME confirms later** |
| Release | **one release after Phases 1-4.** Cascade and the other loop types (Phase 5) come later |
| Decisions | `docs/next-release/system-response-owner-decisions.md` (Auto only, AUT capture, P / I / D over MQTT) |
| SME document | `docs/system-response-fixes-for-sme.md` on `feat/sr-engine-fixes` |

## Defaults used until the SME answers

| Topic | Default now | SME later |
|---|---|---|
| Capture | AUT only (`--response-capture-modes AUT`) | Cascade in Phase 5 |
| Process type | engine rule: LIC = integrating, all others self-regulating | confirm TIC10603, PIC30204, PIC40101, PIC20501, PIC10104; PIC30305 description vs type |
| Step, ramp, settle, valve-at-limit thresholds | the built defaults (SME doc, "Defaults now built in") | confirm or change; the settle test vs the textbook 2-5 % of the step |
| Operating regions | none set, so the PV-out-of-region rule stays off | values, priority-A loops first (data proposal in Phase 3) |
| λ for the tuning advice | SIMC tight rule, λ = dead time, on every loop | name the averaging level loops (larger λ) |
| Plant day / evidence boundaries | `PLANT_DAY_START` built with default `00:00` (no change) | 06:00 at the plant when confirmed (`shift-time-change.md`) |
| PID algorithm (PID / PI-D / I-PD) | PID assumed; affects only the setpoint-response advice | I&C answer |

## Phase 1: what is built, plus the plant-day setting

| Item | Owner | State |
|---|---|---|
| CHG-204..211 engine fixes | CPA Redesign | built, on `feat/sr-engine-fixes` |
| AUT-only capture (`ResponseJobConfig.capturesIn`, `ResponseCaptureModesTest`) | CPA Redesign | built, to commit |
| `PLANT_DAY_START` (Flink `PlantClock`, submit scripts, cplm-api `Kpi/PlantClock.cs`), default `00:00` | system response Updates | to build |

## Phase 2: controller tuning from P / I / D

| Step | What | Owner |
|---|---|---|
| 2a | Ingestion: P → p, I → i, D → d already mapped (`LoopIngestConfig.DefaultParamRoles`); a `param_roles` overlay only if the gateway uses other names | done |
| 2b | Flink `CplmNormalizedSample` reads p, i, d | CPA Redesign |
| 2c | Response job builds the `ControllerSnapshot` (CENTUM: Kc = 100 / P, I and D in seconds, PV span from the registry, output 0-100 %) instead of `unknown()`; a change in p, i or d censors the open event ("tuning changed") | CPA Redesign |
| 2d | Tuning history: the response result carries the snapshot when it changes; cplm-api writes it to `cpm.controller_snapshot` (effective-dated, `source` = DCS) and links models (`controller_snapshot_id`); API to read a loop's tuning history | engine side CPA Redesign, cplm-api side system response Updates |
| 2e | Wire the existing `FrequencyResponse` (gain / phase margin, Bode) and `SimcAdvisor` to the snapshot | CPA Redesign |
| 2f | System Response shows the tuning (read-only), margins, Bode and advice | CPA Redesign (frontend) |

Until the plant publishes P / I / D, every loop runs as today ("tuning unknown"); nothing breaks.

## Phase 3: plant data and configuration (no release needed)

| Item | Owner |
|---|---|
| Read-only plant queries: tag names with non-Latin letters; loops seen in CAS; proposed operating regions for the 13 priority-A loops (PV band in AUT over 30 days). **Done 22 Nov**, results in `system-response-plant-queries.md`: no non-Latin names; no current loop in CAS; 9 regions recommended, 4 loops without one; data gaps listed | system response Updates |
| Retire the 18 non-PID tags (5 FQIC, 5 HIC, 8 SIC ramp flags) in Loop Registry (retire is built). **Decided 22 Nov**: all 18 are active and never sent data | owner, at the plant |
| Enter the 9 recommended regions in Gate Configuration **after the SME confirms**: the same properties drive gate G2r, and a window mostly outside the region loses its fused verdict (Overview and KPIs change too) | owner, at the plant |
| Enter SME answers as they come: process types, regions, averaging loops | owner / SME |

## Phase 4: model quality and review

| Item | Owner |
|---|---|
| Measure after Phases 1-2 on the lab, then the plant: validated / rejected shares (41-45 % rejected before), servo models from setpoint steps | both |
| Setpoint-step method for integrating loops (item 5, deferred) | CPA Redesign |
| Review shortlist per loop: newest validated model and the baseline, instead of ~600 models a day | CPA Redesign (UI) + cplm-api |
| Servo dead time ~1 grid step short on jittered data (known limitation) | CPA Redesign |

## Release (after Phase 4)

New Flink jar (full swap if `PLANT_DAY_START` is set at the plant at the same time, otherwise the System Response job
resubmit), cplm-api, ams-frontend. Migrations only if Phase 2d or 4 needs a column. Records: `changes_tracker.md`,
`prod_decision.md`, the SME document.

## Phase 5 (later): Cascade and other loop types

Register cascade pairs (`cpm.loop_link`) and the other types; capture in CAS as its own event type
(`--response-capture-modes AUT,CAS` plus pair logic); the Overview "in auto mode" KPI against each loop's design mode.
