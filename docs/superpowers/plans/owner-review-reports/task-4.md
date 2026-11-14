# Task 4 (CHG-186): Investigation, five tabs in the owner's design — report

Owner review 2026-11-14 item 8, with the owner decisions of 2026-11-15 (Q4: "↗" links stay links; Q5: no time display
changes). Design followed: `owner-review-2026-11-14/08-result-tab-DESIGN.webp` (Result) and `08-windows-pager-DESIGN.webp`
(Windows pager). Builds on CHG-183 (button standard), CHG-184 (removals) and CHG-185 (`KpiCard` headed mode, readings
spacing). Every visible text change is in `docs/theme/redesign/text-changes.md` under `## CHG-186`.

## What changed, per file

### Result tab
- `components/Cpm/investigation/InvestigationHero.tsx` (86 → 128 lines): rebuilt to the design.
  - Left: the headline with the result's dot (`cpm-dot cpm-tone-<condition tone>`), the "Earlier window" and
    "Re-run, no original stored" pills beside it, the older-verdict line under it (unchanged text).
  - "Confirmed from" / "Based on" as a small sentence-case label over a list of chips (`Basis`): each chip is a check,
    the observation in words and each gate code as its own pill (G5, G6 …). With no observation list (a healthy
    window's "No problem found in …", or a finding with no observation seen) the label sits over the phrase.
  - Cause and Engine severity in one two-cell card (`cpm-inv-class`): "Cause ?" (same tip) over the cause and, when the
    leading cause is not confirmed by G14, the warning badge "! Not confirmed" (`ui/StatusBadge`, tone + glyph + word);
    "Engine severity" over the severity with a dot in `toneFor(severity)` (no dot without a severity).
  - Right: the three facts as `KpiCard` headed tiles (title, then value), the Evidence score `?` holding
    `EvidenceScoreNote` as before; Good-error time gets the bar when it is a measured share (0–1).
  - Below, full width under a divider: the limits heading ("What is still unconfirmed" or "Limits on this conclusion")
    with a count badge, then one card per line in a three-column grid (`Limits`): the words before the first ": " are
    the bold title, the rest the reason in secondary text; a line with no colon is a title alone.
- `components/Cpm/investigation/heroFacts.ts`: `HeroFact` gains an optional `bar` (0–100), set on Good-error time only
  when measured and between 0 and 1 (a ratio above 1 stays a number with no bar). New pure `limitCard(line)` splits a
  limit line into title and reason.
- `components/Cpm/conclusionBasis.ts`: `ConclusionBasis` gains `items: { label, codes[] }[]` (one per observation seen,
  the gate codes apart), built from the same list as `from`, so the chips and the phrase cannot disagree. Additive: the
  Loop summary card still reads `lead` + `from`.
- `components/Cpm/kpi/KpiCard.tsx` (shared): a `headed` card with neither `to` nor `onOpen` is now a plain tile in the
  CHG-185 layout (title, `?` tip, value, bar) with class `cpm-kpicard--tile`; `Icon` is optional (rendered only when
  given); new `tip` prop replaces the tip's `sub`/`title` text with a block (used for `EvidenceScoreNote`). The link card
  (Overview) and the dialog card (Loop Explorer) are unchanged.

### All tabs
- `components/Cpm/investigation/InvestigationSteps.tsx`: "Next: <step> →" is the Primary button (`variant="raised"`),
  bottom right of the foot strip, on Result, Evidence, Windows and Hypotheses (Review has none, as before).

### Windows tab
- `components/Cpm/investigation/WindowBrowser.tsx`: the pager "‹ Newer · 1–5 of 100+ · Older ›" moved from under the tiles
  onto the "Recent 12h windows" heading line, right-aligned (`PanelHead right=`), as a `role="group"` named "Pages of
  windows". Same buttons, titles, disabled states and paging logic.

### Hypotheses tab
- `components/Cpm/investigation/HypothesisPanel.tsx`: the sentence "Scores rank the mechanisms; they are not
  probabilities." moved from under the cards into a `?` beside "Mechanisms and the evidence for each" ("Mechanism
  scores"), per the global "label + ? tip, no explanatory sentence" rule. Cards take the Result tab's card padding.

### Evidence and Review tabs
- No structural change: both already use the cards/tiles language (Evidence: stage cards, gate list, trend; Review: Next
  checks and Record your review panels). They get the Primary Next (Evidence), the centred heading line, and sentence-case
  labels are already in place. The trend is untouched. `SignalStripAt` (CHG-185 spacing) checked on Evidence: four
  separate boxes, "at window end" at the end of the row — looks right.

### CSS
- `styles/cpm-investigation.css`: Result layout (`1.2fr / 1fr` columns, 24 px gap), headline, `cpm-inv-label`
  (sentence-case small label, `--cpm-text-caption`, `text.secondary`), chips (`cpm-inv-chip*`: `border.subtle` box,
  check in a `surface.selected` circle with `action.primary` glyph, gate code pill on `surface.raised`), count badge,
  cause/severity card, unconfirmed cards (`cpm-inv-gap*`), tiles without an icon (head at content height), the limits
  divider spanning the panel, foot strip padding 12 px (was 4 px), `.cpm-inv-steps .cpm-panel-head` centred so a
  heading and its pager / link / pill share one line, hypothesis card padding. Breakpoints: ≤ 1100 px the Result stacks
  and the unconfirmed grid is two columns; ≤ 736 px one column, and the cause/severity cells stack.
- `styles/cpm-evidence-layout.css`: `.cpm-window-tiles__pager` right-aligned with no top margin (it is in the head now).
- Tokens only (`--traverse-*`, `--cpm-text-*`); no hex, rgb or px font sizes. `lint:theme` 0 matches.

## Every fact of today's Result tab, and where it is now

| Today | Now |
|---|---|
| Title (this window's result) | Headline, with the result's dot (new) |
| "Earlier window" pill (hover: the window span) | Beside the headline, unchanged |
| "Re-run, no original stored" pill | Beside the headline, unchanged |
| "Last verdict … · evidence score … · N days ago" (older verdict) | Under the headline, unchanged text |
| "**Confirmed from** / **Based on** <observations with gates>." | "Confirmed from" / "Based on" label over one chip per observation (✓, words, gate code pills) |
| "**No problem found in** the performance and symptom checks …" | Label over the phrase |
| Cause + `?` "Symptom and cause" | Cause cell of the card, same tip |
| " · not confirmed" | "! Not confirmed" warning badge beside the cause |
| Engine severity | Severity cell of the card, with its dot (new) |
| Finding / healthy facts: Good-error time, Persisting, Evidence score (`?` EvidenceScoreNote) | The three tiles, same values and tip; bar under Good-error time (new) |
| No-fault facts: Good-error time, Time in normal mode, Data coverage | Same three tiles |
| Other facts: Time in normal mode, Time at an OP limit, Data coverage | Same three tiles |
| Limits heading ("What is still unconfirmed" / "Limits on this conclusion") | Same heading with a count badge |
| Limits lines (not checked inputs, limitations, score cap, no-verdict reason) | One card each: title + reason |

No fact lacked a place, so the Result tab has **no "More" disclosure**. Judgement call to note: the two pills and the
older-verdict line are not drawn in the design (it shows a finding on the newest window, where they do not appear); they
qualify the headline, so they stay at it rather than in a "More" at the bottom. If the owner wants them in "More", it is a
move of three lines.

## Decisions
- **"Persisting" has a source**: the episode open at the window's end (`episodeAt` over the loop's open and recent
  episodes, its `opened_at`, measured to the window end — CpmInvestigation already read it). The tile stays. Its two
  existing states stay too: "No open episode" when the episodes were read and none was open, "—" while they are unread.
  The plan's "else leave the tile out" was read as "if there is no source"; dropping "No open episode" would remove a fact.
- **Good-error bar colour**: the existing `KpiCard` bar (neutral `text.secondary`, as Loop Explorer's coverage bar), not the
  design's teal. Teal is `action.primary`, which Traverse keeps for actions and selection; one bar look across the app.
- **Chips hug their content** and wrap, rather than three equal columns: the observations vary in length ("sustained
  oscillation G5 G6"); equal columns broke words at 1440 px.
- **"Not confirmed"** in sentence case (the design shows "not confirmed"), as every other badge on the page ("Not seen",
  "Leading", "Earlier window").
- **Tiles reuse `KpiCard`** (brief): the design's tiles open nothing today, so a plain-tile mode was added instead of an
  `onOpen` that would invent a drill-down (no functionality added).
- **Evidence and Review** were already cards and tiles; restyling the stage cards' pressed state or Loop notes was left
  alone (Loop notes: Task 7).

## Not done / for the controller
- Hypotheses still shows the "revision N" pill (`verdict.resultRevision`) — a version-like value CHG-184 left; not removed
  here (this task removes nothing).
- Loop notes (Review tab) keep their caps "OUTCOME" label and a "Save review" button that is Secondary; spec item 17 lists
  "Save note" as a Primary example. Left for Task 7, which redesigns Loop notes.
- The design's numbers (84 %, 3 days, 6 unconfirmed) are illustrative; lab FIC10401 shows 100 %, 33 days, 5.
- During captures one `POST /api/v1/cpm/method-runs/evidence/batch` (a read the page makes through POST) was aborted by
  the read-only rule, as in the "before" captures; it feeds gate detail text, so Evidence-tab gate details may be
  shorter in the screenshots than on a normal session.
- `src/frontend-ob/src/components/Cpm/_body.txt` was already untracked before this task; left alone, not committed.

## Tests
New or changed tests (each fails without the change):
- `investigation/InvestigationHero.test.tsx`: chips with separate gate codes; phrase fallback with no list; unconfirmed
  cards (title, reason, count); result and severity dots and tones; headed tiles with the Good-error bar; the evidence
  score tip opens `EvidenceScoreNote`; "Not confirmed" as a warning badge; the limits list by name.
- `investigation/heroFacts.test.ts`: `bar` on Good-error time (13, 91), none when unmeasured or above 1; `limitCard`.
- `conclusionBasis.test.ts`: `items` lists each observation with its codes, consistent with `from`; empty when healthy.
- `kpi/KpiCard.headed.test.tsx`: plain tile mode (no link, no icon, bar, `?` tip with `tip` content, title before value).
- `investigation/WindowBrowser.test.tsx`: the pager is inside the heading line's right part; no pager on one page.
- `investigation/HypothesisPanel.test.tsx`: the score sentence is behind "Mechanism scores", not on the page.
- `investigation/InvestigationSteps.test.tsx` (new): Next is `raised` in the foot strip and moves on; none on Review;
  `stepOf`.

Output tails (from `src/frontend-ob`):
```
npx vitest run src/components/Cpm/investigation src/components/Cpm/kpi src/components/Cpm/conclusionBasis.test.ts src/components/Cpm/CpmInvestigation.test.tsx src/components/Cpm/explorer
 Test Files  46 passed (46)
      Tests  356 passed (356)

npx vitest run
 Test Files  327 passed (327)
      Tests  2670 passed (2670)

npx tsc --noEmit -p tsconfig.json      (no output, exit 0)
npm run lint                           (no warnings, exit 0)
npm run lint:theme
lint:theme phase 3: 634 live files, gates T1 T2 T3 T4 T5 T6 T7 T8 T9 T10 T11 T13, matches 0
```
No `.tsx` over 400 lines (largest touched: HypothesisPanel 177, WindowBrowser 166, InvestigationHero 128, KpiCard 121).

## Visual check (preview :4173, lab data, read-only)
`npm run build`, then a capture script on `docs/theme/tools/lib/session.mjs` (login, client-side goto, tabs by role;
theme via `data-theme` / `data-obc-theme`); every non-GET `/api/` request aborted except `/auth/login` and `/auth/refresh`.
The newest FIC10401 window is "Not evaluated: not enough data", so the design's state was captured on the finding window
ending 6 Nov 22:45 (`&window=2026-11-06T22:45:00Z`, "Oscillation confirmed"). Console: the pre-login 401 refresh (also in
the before captures) and the aborted POST above. No horizontal scroll at 1440, 1000, 768 or 390.

Screens in `docs/theme/redesign/evidence/chg186/` (untracked):
- after, finding window: `result-day-1440`, `evidence-day-1440`, `windows-day-1440`, `hypotheses-day-1440`,
  `review-day-1440`, `result-night-1440`, `windows-night-1440`, `result-day-768`, `result-day-1000`, `result-day-390`,
  `windows-day-390`;
- after, newest (not evaluated) window: `newest-result-day-1440` ("Limits on this conclusion" as cards, older verdict
  line), `newest-windows-day-1440`;
- before: `before-*-day-1440` (newest window) and `before-finding-*-day-1440` (finding window), all five tabs.
