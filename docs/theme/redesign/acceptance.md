# CPA reference redesign: acceptance sheet

Branch `feat/cpa-redesign`, CHG-133 to CHG-153. Checks A1 to A10 are from `reference/CPA_Implementation_Brief.md`. Design: `docs/superpowers/specs/2026-11-06-cpa-structure-and-flow-design.md`. Ledger: `.superpowers/sdd/2026-11-06-cpa-reference-redesign/progress.md`.

Results are Pass, Fail, Not run, or Not in this release. Nothing here certifies the numerical diagnostic algorithms or plant acceptance.

## A1 to A10

| Check | Result | Route and selected context | Evidence |
|---|---|---|---|
| A1 Visual fidelity | Pass, hierarchy and structure only | All 17 sidebar pages, from `/cpm` | Judged on hierarchy and structure, because the look stays the base app's. Each section's pages were looked at in the browser after its build (ledger, "page look" lines) and size-check shows 0 differences from the running build, apart from two recorded exceptions (`baseline/size-exceptions.json`). Look, icons, colours and sizes are ours and are not judged. |
| A2 Functional parity | Pass | Every page; `docs/theme/redesign/function-map.md` | Cpm suite 1152 of 1152 passed on the final build; control-edge check lists every control that moved on purpose (`baseline/moved-controls.json`). One reference dialog was not added: Performance has no Calculation basis dialog, because the base page never had one and nothing is added inside a page (ledger ruling). |
| A3 End-to-end loop journey | Pass | `/cpm`, `/cpm/performance`, `/cpm/events` to `/cpm/investigation`, then `/cpm/evidence`, `/cpm/replay`, `/cpm/calculations`, `/cpm/historical`; loop and exact window carried in the address | Journey walk: 86 steps, 84 pass, 0 fail, 2 untested, 0 blocked writes (commit `d375aba3`). Untested: `wi-inspect-norun` (every lab window has a run, so the no-run branch could not be reached; the code is in `windowNav.ts` lines 54 to 58) and `pf-basis` (Performance never had a Calculation basis dialog; see A2). |
| A4 Historical interaction | Not run | `/cpm/historical`, `/cpm/trend` | Past ranges, custom dates, series selection, zoom and cursor were not checked as a separate pass in the browser. Unit tests cover the window, range and pen logic; the journey walk opened Historical and Trend with a loop and a window. |
| A5 Evidence integrity | Not run | `/cpm/investigation`, `/cpm/evidence`, `/cpm/replay` | Status words, `conditionOf` and no-fault facts were fixed at the source and are tested, but the control engineer has not reviewed them (`text-changes.md`). The original run and a new re-run are kept apart in code (Re-run opens the new run in the Workbench); a re-run needs a write on the lab, see A9. |
| A6 Configuration correctness | Not run | `/cpm/registry`, loop page, `/cpm/config` | Validation, retire and activate rules are covered by tests (409 `LOOP_RETIRED`, row error on import, keys kept on activate). No configuration change was saved on the lab; see A9. |
| A7 Feedback | Pass | Pipeline Health, Governance, Registry, Trend | Loading, empty, read-error and unavailable states were seen in the browser, including a run captured while the engine restarted: the pages said so and showed no success. A failed loop list shows the read error; a failed draft keeps its errors. |
| A8 Responsive and accessibility | Partly: widths and themes pass; keyboard-only and touch not run | All pages, Day and Night, at 320, 390, 736, 1024 and 1440 px | Control-edge: 54 views, 0 off the screen. Geometry: 14 measurements, 0 failing. Accessibility: 74 scans, 0 serious. Keyboard-only and touch were not run as a separate pass. |
| A9 Persistence and security | Not run for writes | Retire, Restore, Edit, notes, reviews, config changes | Writes on the shared lab need the owner's approval, so none were made. Proven without a write: the retire and restore SQL ran on the real schema inside a rolled-back transaction on FIC10401. The flags and `enabled_before_retire` were right, a second retire wrote nothing, the 4 tag rows were kept and the row was unchanged after the rollback. Tests cover the rest (permissions, reason length, 409, audit events `CPM_LOOP_RETIRED` and `CPM_LOOP_RESTORED`). |
| A10 Exports and runtime | Not run for writes and exports | Pipeline Health, Governance, Re-run, evidence package | Re-run and verification need a write on the lab and were not run. The pages show the service's own words for the audit-chain check and for job states. The evidence package zip holds `manifest.json` and `evidence-package.json`; its content was not compared with a selection in the browser. |

## Not in this release

| Item | Result | Why |
|---|---|---|
| Replay playback | Not in this release | Owner decision 2: our cursor and readout stay. The SME is told. |
| Calculations export | Not in this release | Not requested. |
| Re-run with current configuration | Not in this release | Needs backend work beyond the agreed small additions. |
| Audit before and after values | Not in this release | Not served today. |
| Audit chain range, count and algorithm | Not in this release | Not served today; audit-service is outside this plan. |

Final gates on the release build (f5761378, 7 Nov):

- Static: tsc 0, lint 0, theme 0, 1927 of 1927 frontend tests, build OK. cplm-api: 369 passed, 6 failed, all known before this branch (ConfigLifecycleTests x5 need a database, ReadinessJobsTests x1 supervisor list).
- Browser: redirects 25 of 25; accessibility 74 scans, 0 critical or serious; geometry 14 measurements, 0 failing; control edge 54 views, 0 off the screen; links 49 clicked, 0 problems; sizes 0 differences beyond the three recorded in baseline/size-exceptions.json.
- Controls: every baseline control has a place. Two names were absent in this run only because their data was absent: Overview's "Not assessable" chip shows only when such loops exist, and Governance's permission matrix rows were still loading (they were present in the Section 5 run, code unchanged).
- Lab deploy: not done. C: had 4.1 GB free and Docker's disk was still growing, so building the two images could fill the drive. The images are to be built once space is freed.

## Hand-offs

### For the control engineer

Read `docs/theme/redesign/text-changes.md`. Points to check:

- The status words: Pass, Symptom seen, Strong symptom, Insufficient evidence.
- The `conditionOf` words. It was corrected to agree with `diagnosisLabel` and CHG-092, so some Explorer words changed.
- The no-fault facts shown on a window with no fault.
- Cause reads "None identified", even when a mechanism fell short and the engine kept it.
- "Good-error time" against "Good-error share".
- "limit symptom".
- The method texts on Calculations: CPLM-001, 003, 014, 020 and 031 were corrected to the engine.
- "Observed: no symptom present" beside G5 and G6 "Symptom seen", on a window that did not qualify.

### For the SME: what differs from the reference

- Filters are ours.
- Colours, icons and sizes are ours.
- The Result lane.
- Next checks.
- Retire instead of Delete.
- No Replay playback.
- Re-run opens the new run in the Workbench.
- The "Not in this release" items above.
