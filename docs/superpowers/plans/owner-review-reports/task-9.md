# Task 9 (CHG-191): Performance gate dialog — report

Owner review 2026-11-14 item 3 (with section 17's button levels), under the owner decisions of 2026-11-15: no sample round
("start building"), Q4 ("↗" links stay links), Q5 (no time display change: the window line joins the two times exactly as
"Window from" / "Window to" printed them). Builds on CHG-183 (`ui/Dialog` cyan band and `size`, `ui/Button`, `ui-link`) and
CHG-157 (Workbench offered once). Every visible text change is in `docs/theme/redesign/text-changes.md` under `## CHG-191`.

## What changed, per file (all under `src/frontend-ob/src/`)

- `components/Cpm/blocks/GateDialog.tsx` (88 lines), the shared gate dialog:
  - the caps tier label (`cpm-eyebrow`: "DIAGNOSTIC EVIDENCE", "ELIGIBILITY" …) is gone; the gate's name is an `h3` heading
    with the same look as the other section headings (`cpm-panel-title`);
  - `assessment` (the "Assessment" row) is replaced by `windowLine`: one line under the gate name;
  - new `aside` prop: with it the dialog uses `ui/Dialog`'s existing `size="wide"` (720 px) and lays out
    `.cpm-gate-dialog__cols` with two `.cpm-gate-dialog__col` (result left, aside right); without it the dialog is as before
    (Investigation's Calculation proof);
  - new `gateWindowLine(kind, start, end)` → "12h window · <fmtDateTime(start)> → <fmtDateTime(end)>" (the same formatter and
    zone as the old rows; "12h window" alone when no bound is known);
  - new `GateActions` (steps, links, primary): the foot in three groups, in that order. `GateSteps` unchanged.
- `components/Cpm/GateEvidencePanel.tsx` (167 lines): `EvidenceBody` is split by where each part now sits, all fed by one
  hook:
  - `useGateEvidence(loopId, gate, kind)`: the latest gates, the cell, the definition (+ `defLoading`), the role from the
    catalogue, the loop's inputs, no-window-yet / failed;
  - `EvidenceState`: the failed / no-window line (result column);
  - `EvidenceAbout`: "What this gate asks" (question; an optional `definition` paragraph under it; NOT YET OBSERVED as before),
    "Effect on the verdict" (same G13 / G14 / role prose), "Flags on this window" — one `h3` per part (`GatePart`), no eyebrow;
  - `EvidenceLinks`: "Workbench ↗" (ReasonedButton, the same five disabled reasons, shown on screen), "Replay ↗", "Loop ↗", all
    `ui-link`; `withWorkbench={false}` leaves the Workbench out (Summary, where it is the primary).
  - The "Window & attribution" block ("Window from", "Window to", "Gate role", "Samples") is gone; Samples moved to the dialogs.
- `components/Cpm/performance/PerformanceGateDialog.tsx` (85 lines): wide two-column dialog. Left: name, window line, Check
  status, Loop result, Reason, Samples, then `EvidenceState`. Right: `EvidenceAbout`. Foot: `GateActions` = Prev / Next ·
  Workbench ↗, Replay ↗, Loop ↗, Window Inspector ↗ · "Review →" as `ui/Button variant="primary"` (was a raised ObcButton: same
  look). The window line uses the gate matrix's `windowStart` / `windowEnd` (the source of the old Window from / to rows), with
  the heatmap row's `windowEnd` (the old Assessment source) as fallback while the matrix loads. No `<details>`.
- `components/Cpm/explorer/summary/SummaryGateDetail.tsx` (98 lines; Loop Explorer Summary and Calculations tabs): the same
  layout. Left as Performance (window line and Samples from the `matrix` prop the tab already holds). Right: `EvidenceAbout` with
  the catalogue `definition`, so "What this gate asks" is said once (it was a row with the definition and again a section with
  the question). Foot: Prev / Next · Replay ↗, Loop ↗, Window Inspector ↗ · "Evidence Workbench →" (ReasonedButton raised, the
  one primary, disabled reason on screen as before).
- `styles/cpm-blocks.css`: `.cpm-gate-dialog__heading`, `__window`, `__cols` (one column; two `minmax(0, 1fr)` columns from
  `@media (min-width: 1000px)`), `__part` spacing and flag-row gap; `.cpm-gate-actions` (+ `__steps`, `__links`, `__primary`):
  Prev / Next on the left, the links as a centred cluster that wraps among itself (no gap: a link carries its own padding), the
  primary pushed to the end. Tokens only. The unused `.cpm-gate-dialog__name` went.
- `styles/cpm-perf-list.css`: the gate-dialog rules inside `.cpm-gate-more` (panel heads, flag row, `__actions`) removed;
  the base `.cpm-gate-more` disclosure stays (Relationships › Lineage uses it).

## Decisions
1. **The disclosure "More about this gate" is gone.** Two columns only work if the right column is visible; at 720 px there
   is room. Below 1000 px everything stacks in one column and the body scrolls as before.
2. **Tier label dropped in all gate dialogs, Investigation's Calculation proof included**, because the three share
   `GateDialog` ("a gate reads the same everywhere") and the owner listed "DIAGNOSTIC EVIDENCE" among the caps labels to drop.
   The proof dialog's own "CALCULATED VALUES" eyebrow is untouched (Task 10). Its width and layout are unchanged (no aside).
3. **"Workbench →" / "Replay →" became "Workbench ↗" / "Replay ↗" links** in the foot: they open another page, so they join
   the "↗" group the owner asked for (Q4 keeps them links), and Investigation's proof dialog already names them so.
4. **One window line under the gate name, without a "Window" label** (the line itself says "12h window"); the word "Latest"
   went with the Assessment row, as in the brief's example. The arrow is "→" between the two unchanged times.
5. **Samples kept** as a row (the only other fact of "Window & attribution"). "Effect on the verdict" keeps the role's meaning;
   no fact was dropped besides the two repeats and the caps labels.
6. **Failed read in Performance**: the error was a "Reason" row and again inside the disclosure; it is now said once, as the
   status line the body already printed (a failed request is not the gate's reason).
7. **"Loading…" instead of "Definition unavailable."** while the calculations catalogue loads: the question is now the first
   thing in the right column, and on the lab the first open caught the catalogue still loading ("unavailable" was wrong there).
8. **Foot at 720 px**: Prev / Next + four links + Review do not fit one line (measured: links ≈ 463 px, room ≈ 410 px). The
   order stays Prev / Next → links → Review; the links wrap among themselves as one centred cluster (Workbench, Replay, Loop /
   Window Inspector), with Prev / Next and Review centred beside them. At 390 px the groups stack.
9. Section headings use the existing `cpm-panel-title` look (as the old PanelHead titles); the gate name now shares it
   (it was a bold body-size paragraph), so every part has the same heading.

## What I could not do / notes
- The lab has a run for every gate of FIC10401's latest 12h window, so the disabled "Workbench ↗" with its on-screen reason
  could not be shown in the browser; it is covered by `PerformanceGateDialog.test.tsx` and `GateEvidencePanel.test.tsx`.
- The lab's latest 12h window for FIC10401 ends 07/11/2026 11:45 UTC (8 days old) and its gates are mostly not evaluated;
  G5 (Symptom seen, Reason BANDWIDTH) is the "symptom" gate captured. No gate is FAIL on that window except G0 ("Not usable",
  captured in `before-perf-G0-day-1440.png` only).
- `src/frontend-ob/src/components/Cpm/_body.txt`, `docs/theme/redesign/samples/*` and the evidence folders were untracked
  before this task and are not committed.

## Browser check (preview :4173, lab data, read-only)
`npm run build`, then Playwright with `docs/theme/tools/lib/session.mjs` (credentials from the environment only). Route filter:
every non-GET `/api/` request aborted except `/auth/login`, `/auth/refresh` and the evidence batch POST — **0 blocked** in both
runs. Screens in `docs/theme/redesign/evidence/chg191/` (untracked):
- before (today's build): `before-perf-G8-day-1440`, `before-perf-G5-day-1440`, `before-perf-G0-day-1440`,
  `before-summary-G8-day-1440` (disclosure opened), `before-facts.json`;
- after: `after-perf-G8-day-1440`, `after-perf-G5-day-1440`, `after-perf-G8-night-1440`, `after-perf-G5-night-1440`,
  `after-perf-G8-day-768`, `after-perf-G8-day-1000`, `after-perf-G8-day-390`, `after-summary-G8-day-1440`,
  `after-summary-G5-day-1440`, `after-facts.json`.
Measured: dialog 720 px wide at 1440 / 1000 / 768 (358 at 390); two columns of 327 px at 1440 and 1000, one column (678 px) at
768; no horizontal scroll in the body at any width; G8 dialog 501 px tall at 1440 (was 921 px with the disclosure open).

## Tests
New or changed (each new behaviour fails on the old source: 19 of the new/changed tests failed with the source stashed):
- `components/Cpm/blocks/GateDialog.test.tsx`: name as heading, no caps tier / Assessment, one window line; wide + two columns
  with an aside, default + one column without; `gateWindowLine` (both bounds via `fmtDateTime`, kind only); `GateActions`
  order Prev, Next → links → primary; CSS: one column, two from `min-width: 1000px`, primary at the far end.
- `components/Cpm/performance/PerformanceGateDialog.test.tsx`: one window line with both times, no Assessment / Window from /
  Window to / "Latest 12h window", each time once; no Gate role, effect kept; headings exactly name / What this gate asks /
  Effect on the verdict / Flags on this window, no eyebrow; wide, two columns with the facts on their side, no `<details>`;
  foot order Prev, Next, Workbench ↗, Replay ↗, Loop ↗, Window Inspector ↗, Review →, links `ui-link`, one raised; the
  Workbench link's on-screen reason.
- `components/Cpm/explorer/summary/SummaryGateDetail.test.tsx`: now renders the real body (only the hooks are mocked): window
  line, no Assessment / Window from / Gate role; the body in the second column of a wide dialog; "What this gate asks" once
  with question and definition; foot order Next, Replay ↗, Loop ↗, Window Inspector ↗, Evidence Workbench → (one raised);
  Workbench offered once.
- `components/Cpm/GateEvidencePanel.test.tsx` (new): headings and no caps labels, definition under the question, Loading… vs
  Definition unavailable., no flags part when empty, links are `ui-link` and `withWorkbench={false}`, the no-window status.

## Output tails (run from `src/frontend-ob`)
```
npx vitest run src/components/Cpm/GateEvidencePanel.test.tsx src/components/Cpm/blocks src/components/Cpm/performance src/components/Cpm/explorer src/components/Cpm/investigation
 Test Files  47 passed (47)
      Tests  352 passed (352)

npx vitest run            (full suite)
 Test Files  334 passed (334)
      Tests  2796 passed (2796)
 (no failure; the known TrendCore.trust flake did not occur)

npx tsc --noEmit -p tsconfig.json      exit 0, no output
npm run lint                           exit 0 (eslint --max-warnings 0)
npm run lint:theme                     lint:theme phase 3: 650 live files, gates T1 T2 T3 T4 T5 T6 T7 T8 T9 T10 T11 T13, matches 0
npm run build                          ✓ built (the usual >500 kB chunk warning only)
```
