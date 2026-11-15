# Final visual sweep: partial (stopped early)

Branch `feat/cpa-redesign`, head `de86e0b1` (CHG-183 … CHG-192). `npm run build` passed (exit 0). Screenshots came from
the preview on :4173 against the lab API, read-only, using the guard from `docs/theme/tools/lib/guard.mjs`. Superadmin
session.

**Stopped early on the coordinator's instruction.** The owner changed the secondary button look, so a fix pass will change
every page and the full sweep runs again on the final build. Only the coverage listed below was captured. Every finding
about buttons should be checked again after that pass.

Screenshots: `docs/theme/redesign/evidence/final-sweep/<theme>/<width>/<slug>.png` for pages, and
`docs/theme/redesign/evidence/final-sweep/dialogs/<theme>/<width>/<dialog>.png` for dialogs.

## Coverage

| What | Widths | Themes | Status |
|---|---|---|---|
| Pages: Overview, Performance, Loop Events, Loop Explorer (Summary) | 1440 | day, night | Captured (full page) |
| Every other route in `ROUTES` (27), and the four pages above at 1000 / 768 / 390 | — | — | **Not captured** |
| Performance gate dialog (FIC10401 · G8, from a gate matrix cell) | 1440, 390 | day, night | Captured |
| Evaluate a window (Evidence Workbench) | 1440, 390 | day, night | Captured |
| Compare window sizes (Window Inspector) | 1440, 390 | day, night | Captured |
| Loop notes (Evidence Replay) | 1440, 390 | day, night | Captured |
| How to read (Overview) | 1440, 390 | day, night | Captured |
| Loop Events episode detail | 390 (drawer) | day, night | Captured. At 1440 it is the side panel, visible in `day/1440/events.png` and behind Full history |
| Full history (Loop Events) | 1440 day + night, 390 day | | Captured. 390 night is missing (`dialogs/night/390/full-history.png` shows the drawer, not the dialog) |
| Reconstruct evidence | — | — | **Not opened.** The button is disabled on the lab's newest FIC10401 window (not evaluated). The pass that first picks an evaluated window was stopped before it ran. `dialogs/*/1440/reconstruct.png` shows the page without the dialog |
| Measured vs required | — | — | **Not opened**, for the same reason. `dialogs/day/1440/measured.png` shows no dialog |

Dialog facts that were measured:
- Every dialog that opened has the solid cyan header: day `rgb(0,107,131)`, night `rgb(84,214,232)`. This includes the
  episode drawer.
- Wide dialogs are 880 px at 1440. At 390 they are 358 px with 16 px gutters. No dialog is wider than the viewport.
- Every footer is on screen. The tallest is the gate dialog at 390, 810 px inside an 844 px viewport.
- No dialog has more than one primary button. The exception is the episode drawer (D2).

## Defects

| # | Page | Theme | Width | What is wrong | Screenshot | Severity |
|---|---|---|---|---|---|---|
| D1 | Performance gate dialog | day, night | 390 | The foot's link row breaks up over three lines. "Workbench ↗" sits alone and centred. "Replay ↗" and "Loop ↗" share a line with "Review →". "Window Inspector ↗" sits alone on a third line. At 1440 it is one tidy line. | `dialogs/day/390/perf-gate.png`, `dialogs/night/390/perf-gate.png` | medium |
| D2 | Loop Events episode panel / drawer | day, night | 390 (drawer, a modal dialog); also 1440 (panel) | Two filled primaries in one dialog: "Acknowledge" and "Investigation →". | `dialogs/day/390/episode-detail.png`, `dialogs/night/390/episode-detail.png`, `day/1440/events.png` | medium |
| D3 | Loop Explorer › Summary, Gate results | day, night | 1440 | The G2r pass check is drawn green (`.cpm-gate-tile--good` mark uses `--traverse-status-success-fg`). Owner Q3 and ISA-101 say a normal state is neutral, with no green. The Performance gate matrix draws the same pass in neutral grey. | `day/1440/explorer.png`, `night/1440/explorer.png` | medium |
| D4 | Compare window sizes dialog | day, night | 390 | The table is wider than the dialog. The last column is cut off ("WIN… (LAS…") and the only way to see it is an inner horizontal scroll with no visible hint. | `dialogs/day/390/compare-sizes.png` | low |
| D5 | Evaluate a window dialog | day, night | 390 | The Window value breaks inside a date: "→ 2026-11-" on one line, "15 04:45:00 (UTC)" on the next. | `dialogs/day/390/evaluate.png` | low |
| D6 | Loop Explorer › Summary, readings | day, night | 1440 | Mode reads "AUT". Replay's readout was changed to "Auto" (item 12), so the two pages disagree. | `day/1440/explorer.png` | low |
| D7 | Loop Explorer › Summary, readings | day, night | 1440 | A caps-style label remains: "SIGNAL QUALITY" on the quality chip beside the readings. | `day/1440/explorer.png` | low |
| D8 | Loop notes dialog | day, night | 1440, 390 | "No notes on this loop yet." sits right under the last checkbox with no gap or divider, so it reads as part of the form. | `dialogs/day/1440/loop-notes.png` | low |
| D9 | Performance gate dialog, "Loop result" row | day, night | 1440 | The result pill and "last verdict …" are crowded together. "last verdict" floats beside the pill, and the rest wraps right-aligned under it. | `dialogs/day/1440/perf-gate.png` | low |

Checked and not defects:
- Times in UTC. Owner Q5 keeps time display out of this batch.
- EVT codes. These are deliberately kept (item0-sweep, owner question 1).
- "↗" links drawn as underlined links. This follows Q4.
- Sentence-case table and eyebrow labels drawn uppercase by CSS ("FIND PROBLEMS", table headers). These are the
  established page design and are not on the owner's removal list.
- The greyed, not underlined "Window Inspector ↗" on Performance when no loop is selected. This is the disabled link.
- The text scan of the captured surfaces found no run UUIDs, version numbers, Flink or job names, and no "Record details".
- Night theme: the screenshots show no unreadable text. axe `color-contrast` reported 0 violations on Overview,
  Performance and Loop Events at 1440, day and night. That came from the first page pass; its JSON was later overwritten,
  and the numbers were read before that happened.

## Blocked-request log

**Empty.** Five runs logged 0 blocked requests and 0 HTTP 429s (143 paced API calls in total).
- No write button was clicked. Dialogs were opened only through their opener buttons (Evaluate a window, Compare window
  sizes, Loop notes, How to read, Full history, a gate cell, an episode row) and closed with Escape.
- The 401s on `POST /api/auth/refresh` are the login page probing for an existing session. That call is on the allowlist.

## Console errors

- No `pageerror` (no uncaught JavaScript exception) in any run.
- 28 × "Failed to load resource: 500" and 3 react-query logs ("ApiError: The service is currently unavailable").
  All of them come from lab cplm-api 500s (next section).
- 5 × 401 on `/api/auth/refresh` at login (expected).

## Lab data gaps and lab API errors (not defects)

- cplm-api returned 500 on these endpoints:
  - `GET /api/v1/cpm/calculations`. The gate dialog's "What this gate asks" stays at "Loading…", and Replay shows "Gate
    catalogue unavailable".
  - `POST /api/v1/cpm/method-runs/evidence/batch` and `GET /api/v1/cpm/method-runs/{run}/evidence`.
  - `GET /api/v1/cpm/fleet/rankings` and `/fleet/kpis`.
  - `GET /api/v1/cpm/loops` and `/loops/FIC10401/kpis`.

  The app showed its "The API is returning errors" banner on Performance and Replay. Worth checking on the lab before the
  re-run, because it blanks panels in the screenshots.
- FIC10401: the newest window is "Not evaluated: not enough data" (it ended 8 days ago). Samples were last stored 12 days
  ago. Loop KPIs show "—", Data coverage shows 81 %, and the trend stays at "Loading trend…".
- Overview: the KPI area and "Loops requiring review" still showed "Loading…" after 15 s in the first capture.
- Performance: the fleet KPIs show "—" (no assessed loop). The fused window is stale (184.8 h).
- Window Inspector › Compare window sizes: 0 windows for every size from 5 to 60 min. 1 min shows 3 windows, all declined.
- Loop Events: on the first visit the list was still "Loading events…" after 15 s (`dialogs/day/1440/episode-detail.png`).

## Pages that could not be reached

- None of the captured pages redirected.
- Pipeline and Governance (system.manage) were not reached, and neither were any other routes, because the run stopped
  before them. That is a coverage gap, not a redirect.

## Re-running the sweep

The scripts are kept in the scratchpad:
`C:\Users\Admin\AppData\Local\Temp\claude\cd01226643df5f14\9349cd5f-01c2-482c-b2bc-ba4c6bf01721\scratchpad\final-sweep\`
(`chain.sh`, `sweep.mjs`, `extra.mjs`, `episode.mjs`, `facts.mjs`).

1. Rebuild (`npm run build` in `src/frontend-ob`).
2. Run `bash chain.sh > chain.log 2>&1` in the background. It reads the credentials from `infra/docker/.env` at run time
   and never prints them. It runs one browser at a time, in this order:
   1. The dialogs: gate, Evaluate, Compare, Loop notes, How to read, Full history.
   2. `extra.mjs`: picks an evaluated window, then opens Reconstruct and Measured vs required.
   3. `episode.mjs`: the episode panel and drawer.
   4. `sweep.mjs pages`.
3. The default scope is `SCOPE=reduced`: every route at 1440 and 390, and only the key routes (overview, performance,
   explorer, historical, kpi) at 1000 and 768, in day and night. `SCOPE=full bash chain.sh` covers all four widths.
   `ROUTES_ONLY=slug,slug` narrows the page pass.
4. Results go to `results-*.json` beside the scripts.
