# Task 7 (CHG-189): Evidence Replay — report

Owner review 2026-11-14 item 12, with the owner decisions of 2026-11-15 (Q4: "↗" links stay links; Q5: no time display change).
Builds on CHG-183 (Secondary A / primary buttons, cyan `ui/Dialog` with `subtitle`), CHG-184 (no "unit not set"), CHG-185 (the Loop
Explorer readings) and CHG-187 (the Workbench's one-line foot strip). Every visible text change is in
`docs/theme/redesign/text-changes.md` under `## CHG-189`.

## What changed, per file (all under `src/frontend-ob/src/`)

### Chart (axis name cut on the left)
- `components/Cpm/replay/ReplayChart.tsx`: `ReplayChart` had its own grid and centred axis names, so CHG-181's fix in
  `trend/trendOption.ts` never reached it. The axis names now align the same way: the left name starts at its axis line
  (`nameTextStyle.align: 'left'`), the right one ends at it (`'right'`); the phase plane's PV name too. Browser: "PV / SP (kg/h)"
  is whole (`replay-chart-left-day-1440.png`). Passes `pvUnit` to the readout.

### Evidence check card
- `components/Cpm/replay/WindowVerdictCard.tsx`: the window's verdict line ("Stiction ruled out: its own checks failed") is a
  headline paragraph (`.cpm-replay-verdict`, key-text size 16 px token, weight 600, no border or padding) above the selector, not a
  bordered box that read like a field. Then the gate selector, then one set of rows: Check result, Reason, Time in AUTO and the
  gate's metric values (they were behind a "▶ G5 metric values" disclosure; now plain rows). G1's only metric, "In AUTO (%)", is the
  "Time in AUTO" row already shown, so it is not repeated (each fact once). No field removed.
- `styles/cpm-replay.css`: rows `min-height: var(--traverse-size-row)` (44 px, the table-row token), `padding: var(--traverse-space-2) 0`,
  centred — even rows with more room (was 6 px padding, uneven). Measured in the browser: every row 44 px.
- "Re-run this window" (`replay/RerunCard.tsx`): already `ObcButton variant="normal"`, which CHG-183 made Secondary A; the spec's
  table lists Re-run as Secondary. Checked in the browser, no code change.

### Loop notes: button + dialog (one shared component)
- `components/Cpm/investigation/LoopNotes.tsx` (rewritten, 112 lines): `LoopNotes` is now a Secondary "Loop notes (n)" button
  ("Loop notes" with none; `aria-haspopup="dialog"`) that opens a `ui/Dialog` "Loop notes", subtitle loop tag · name (e.g.
  "FIC10401 · Flow controller (FCS0101)", via `serviceName`), size wide. Footer: "Close" (secondary) + "Save note" (primary
  `raised`, with the existing reasons: no `cpm.manage`, too long). The create / acknowledge calls, their payloads and the reset after
  saving are unchanged. The draft (text, outcome, attach, acknowledge) is kept by the button, so a scrim click or Close never loses
  what was typed. The episode list (for the episode links and the Edit select) and the window's evidence manifest are read only
  while the dialog is open; the count on the button is the notes read the page already made.
- `components/Cpm/investigation/NoteForm.tsx` (new): the form as the dialog's label / value rows (`.cpm-run-form`, the CHG-188
  Evaluate look): "Note ?" (the old "About loop notes" tip moved to this ?), the text box with the same placeholder, "Outcome", then
  the two existing check boxes ("Attach to this window — its evidence is kept", "Also acknowledge the open episode EVT-… and link the
  note to it", the latter only with an open episode). No caps "OUTCOME", no "RECORD IT".
- `components/Cpm/investigation/NoteList.tsx` (new): "1 note" / "3 notes" (h3) over the cards, newest first. A card: the outcome as
  a badge (`TonePill`, same tones), "admin · 10 Oct 10:06 UTC" (same `fmtInstant`), the text, "evaluated window ↗" and the episode
  link (unchanged links). With `cpm.manage`, an "Edit" button opens two rows in the card, "Episode" ("No episode" + the recent
  episodes; an older linked episode is still named) and "Outcome", with "Cancel" (secondary) and "Save" (primary); Save sends only
  what changed through the existing `PATCH …/event` / `PATCH …/outcome`, and the card closes when both succeed; a failure stays in
  the card with its message. A load failure of the notes is now said ("The notes could not be loaded: …"); before it read as an
  empty list.
- `components/Cpm/investigation/noteText.ts` (new, pure): outcomes, `episodeLabel`, `noteCount`, `notesButtonLabel`, the draft type.
- `styles/cpm-evidence-layout.css`: the dialog's form and card rules (tokens only); the unused inline-form rules removed; the plain
  list rules kept for Loop Events' `EpisodeNotes` (left alone, as asked).

### Where the button sits
- `components/Cpm/CpmReplay.tsx` (276 lines): the button sits under the Evidence check panel (`.cpm-replay-notes`); with no window
  open it sits under the page's message (a note needs no window). The old full-width notes section at the page foot is gone.
- `components/Cpm/investigation/ReviewStep.tsx` + `CpmInvestigation.tsx`: on the Review tab the button sits in the Next checks
  head, before "Related events ↗"; the inline "Record your review" panel (form, "Save review", list) is replaced by the same dialog
  ("Save note"). The step is one column now (`styles/cpm-investigation.css`). With no verdict, the button sits under the page's
  message (`.cpm-inv-notes`). The subtitle is built from the loop record in both pages.

### Evidence package message
- `components/Cpm/replay/PackageDialog.tsx`: after the download the dialog shows, in a `role="status"` block under a divider (the
  result line style the run dialogs use: `StatusBadge` + text), "✓ Downloaded" + the file name
  (`cplm-FIC10401-12h-2026-11-06T2000-evidence-package.zip`), then one line per part left out: "! Not read" + part + reason, or
  "– Not held" + part. The old one-sentence error-coloured "Downloaded, but not complete: …" is gone. The message clears when the
  dialog closes. No toast.

### Cursor readout
- `components/Cpm/explorer/summary/SignalReading.tsx` (new): the Loop Explorer reading box, split out of `SignalStrip.tsx`
  (which now imports it; no visual change there).
- `components/Cpm/replay/CursorReadout.tsx`: PV, SP, OP and MODE as those reading boxes (value + unit: PV/SP the registry unit,
  OP "%"; no unit on a dash), the mode as its word ("Auto"), then "Sample 8,640 of 8,640" (`en-US` thousands separators, " loaded" on
  a truncated slice as before) and the time. The time is the same `formatInZone(ts, tz) zoneLabel(tz, ts)` text as before (Q5);
  only its font changed from monospace to the body face with tabular numerals. Stored values take no state colour (as Investigation's
  readings at a window end).
- `utils/modeVocabulary.ts`: `modeWord(token)` — tokens with one meaning get a word (AUT/AUTO/A/AUTOMATIC → Auto, CAS/CASC/CASCADE →
  Cascade, RSP → Remote setpoint, MAN/MANUAL/M → Manual, NORMAL, SUP, LO/LOCAL, OFF, TRACK, UNKNOWN); any other token (IMAN, a plant
  code, a number) reads as stored, so a word never hides what the historian holds.
- `styles/cpm-replay.css`: readout layout; the dead `.cpm-readout__values/__item` rules removed.

### Foot strip
- `CpmReplay.tsx` + `styles/cpm-replay.css`: the facts are the Workbench's `cpm-workbench__foot-facts` span (one line, ellipsis,
  the full text as its title); the strip is `nowrap` at desktop widths and wraps below 1280 px; "Original run · pinned" and "Run
  details" keep their size beside it. Text unchanged.

## Decisions
1. **Metric values as rows, not a disclosure** — the spec lists "metric values" among the even rows; the disclosure row was the one
   uneven row. G1's metric is deduplicated against "Time in AUTO".
2. **Save note in the dialog footer** (dialog standard: actions right, primary last); the card's Edit has its own Cancel / Save.
   When a card is being edited and the form has text, two primary buttons can show at once (card Save + footer Save note).
3. **Review tab placement** — the button sits in the Next checks head beside "Related events ↗" rather than alone in the right
   column (a lone button there left a half-empty two-column layout), so the step became one column.
4. **Mode words** only for unambiguous tokens; CAS reads "Cascade", not "Auto" (both are normal modes to the engine, but they are
   different modes on the DCS).
5. **Package part lines** — "Not read" (warning) for a failed read with its reason, "Not held" (unknown) for a part the window does
   not hold; the old trailing "manifest.json says so." was dropped (the zip's manifest still records it).
6. **Readout time font** — the content is identical (Q5); only the monospace face went, as the spec asks ("no monospace raw text").

## What I could not do / notes
- **Lab data:** the lab historian returns no raw samples for FIC10401 in the 6 Nov 20:00 window (nor the newest 7 Nov 11:45 one),
  so Replay shows "No raw historian data for this window" on lab data. For the chart, axis and readout screenshots the capture
  script served synthetic 5 s samples (8,640 points, PV ≈ 800 ± 18 kg/h, SP 800, OP ≈ 28 %, mode "AUT") to that one GET
  (`/api/hist/raw/cursor`) when the real answer was empty. Everything else is lab data. The foot says 8,307 samples (the window's
  real count) while the readout says 8,640 (the synthetic slice).
- **Notes:** FIC10401 has no notes on the lab; the capture served two sample notes to the GET and answered the one "Save note"
  POST locally (it never reached the lab). The Edit was opened and cancelled; no PATCH was sent.
- **Package "Not read" line on real data:** the first capture run got a real "service unavailable" from the lab's evidence batch
  read and the dialog showed "✓ Downloaded cplm-FIC10401-12h-2026-11-07T1145-evidence-package.zip" + "! Not read evidence manifests
  (ApiError: The service is currently unavailable. Try again shortly.)"; that screenshot was overwritten by the final run, where the
  read succeeded (success line only). Both states are covered by tests.
- Spec items left as instructed: the "plant time" / "time short" bullets (Q5), Loop Events' `EpisodeActivity` notes.

## Screenshots (`docs/theme/redesign/evidence/chg189/`, untracked)
Built with `npm run build`, captured on http://localhost:4173 with a route filter that let through GET/HEAD/OPTIONS, `/api/auth/login`,
`/api/auth/refresh` and the read POST `/api/v1/cpm/method-runs/evidence/batch`; note writes were answered locally; blocked: none
needed (nothing else was attempted). Window: FIC10401, 12h ending 6 Nov 20:00, gate G5.
- `replay-day-1440.png` — full page: axis whole, Evidence check card (headline, selector, 5 even rows, Re-run), "Loop notes (2)"
  under it, readout, one-line foot.
- `replay-chart-left-day-1440.png` — the left axis name "PV / SP (kg/h)", not clipped.
- `notes-dialog-day-1440.png`, `notes-dialog-edit-day-1440.png` (form filled + a card in Edit), `notes-dialog-saved-day-1440.png`
  ("Saved", the new note first, "3 notes"), `notes-dialog-edit-night-1440.png`.
- `package-downloaded-day-1440.png` — "✓ Downloaded cplm-FIC10401-12h-2026-11-06T2000-evidence-package.zip".
- `investigation-review-day-1440.png` (Next checks head: "Loop notes (3)" + "Related events ↗"), `investigation-notes-dialog-day-1440.png`.
- `replay-night-1440.png`, `replay-day-768.png` (no horizontal scroll; the foot wraps below 1280 px as designed).
- `chg189-measure.json` — rows 44 px each; foot one line at 1440 (41 px, not clipped); readout "PV 819.35 kg/h · SP 800.00 kg/h ·
  OP 28.90 % · MODE Auto", "Sample 8,640 of 8,640 2026-11-06 20:00:00 UTC (UTC+00:00)"; no monospace; 0 caps labels in the dialog.

## Tests
New or rewritten (each fails without this change; checked by running them against the stashed old source: 36 failures):
- `investigation/LoopNotes.test.tsx` (12): button label with/without count; nothing on the page and no episode read until opened;
  dialog title/subtitle, form fields, "Save note" primary, no caps labels; create payload unchanged; acknowledge only when ticked;
  draft kept across close; permission reason and no Edit; "1 note"/"3 notes", newest first, outcome badge; no select until Edit;
  Edit sends only what changed (outcome, then unlink); Cancel sends nothing; empty state.
- `replay/CursorReadout.test.tsx` (11): value + unit per reading, "Auto", "Sample n of m", reading boxes and no `.cpm-mono`, no unit
  when none registered, the time text identical to `formatInZone + zoneLabel`, plus `modeWord`.
- `replay/ReplayChart.test.tsx`: axis names aligned left / right (time chart and phase plane); sample text updated.
- `replay/WindowVerdictCard.test.tsx`: headline paragraph before the selector, no `.cpm-replay-reason`; rows in order with no
  `<details>`; G1 says Time in AUTO once.
- `replay/PackageDialog.test.tsx`: success line with the file name; one line per missing part; cleared on close.
- `CpmReplay.kind.test.tsx`: the button right after the Evidence check panel with the loop subtitle; the button with no window; the
  foot facts in `cpm-workbench__foot-facts` with the full text as title.
- `CpmInvestigation.test.tsx`: the button in the Next checks head beside Related events, no "Record your review"; the button with no
  verdict.
- `styles/replayLayout.test.ts` (new): foot `nowrap` + the 1279 px wrap rule; headline in key text with no border/padding; rows
  min-height 44 px token; Review step one column.

Checks (from `src/frontend-ob`):
```
npx vitest run src/styles src/components/Cpm/replay src/components/Cpm/investigation src/components/Cpm/explorer src/utils \
  src/components/Cpm/CpmReplay.kind.test.tsx src/components/Cpm/CpmInvestigation.test.tsx
 Test Files  57 passed (57)
      Tests  430 passed (430)

npx vitest run            (full suite)
 Test Files  1 failed | 331 passed (332)
      Tests  1 failed | 2755 passed (2756)
   Duration  176.24s
 FAIL src/components/Designer/TrendCore.trust.test.tsx > the Designer's trend dialog > does not read a loop signal's
      fallback pen, reads the other fallback pen, and marks both
   -> not caused by this change: the test imports none of the changed modules; it passes alone
      (4/4) and with its folder (npx vitest run src/components/Designer: 14 files, 124 tests passed). Load-sensitive under
      the full parallel run (environment time 1854 s).

npx tsc --noEmit -p tsconfig.json     -> exit 0
npm run lint                          -> clean (--max-warnings 0)
npm run lint:theme                    -> lint:theme phase 3: 647 live files, gates T1 … T13, matches 0
npm run build                         -> built in 18.15s
```
