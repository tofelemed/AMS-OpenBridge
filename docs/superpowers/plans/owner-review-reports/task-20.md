# Task 20: CHG-203, follow-ups to CHG-201 (Loop Registry) and CHG-202 (Governance), with their browser check

**Status:** DONE_WITH_CONCERNS
**Commit:** `fix(cpa): CHG-203 Registry + Governance follow-ups - plain errors, Resend to analysis everywhere, approval wording`
(branch `feat/cpa-redesign`, on `b37d0228`, not pushed). `task-19.md` rides in it.
**Brief:** `.superpowers/sdd/2026-11-15-owner-prod-review/chg203-brief.md`. Text changes: `docs/theme/redesign/text-changes.md`
`## CHG-202` (from task-19) and `## CHG-203`. Screens (PNG, device scale 1, not committed): `docs/theme/redesign/evidence/chg203/`.
No docker, no subagents, the :4173 preview was neither started nor stopped.

## What changed

1. **Approval rules, one wording.** Gate Configuration now uses Governance's plain words. Approve's disabled reason
   (`config/lifecycle.ts`) is "Someone other than the author, with permission to approve gate configuration." The Approval
   tab's ? (`config/ApprovalTab.tsx`) is "An approval holds only for the content approved, and it expires. …". The cross-file
   parity test is back in `CpmGovernance.test.tsx`: lifecycle.ts and ApprovalTab.tsx must hold `APPROVE_RULE` /
   `APPROVAL_BINDS` word for word.
2. **Unused CSS.** `.cpm-gov-trace__foot` is removed from `styles/cpm-audit.css`. Nothing used it, and a test keeps it gone.
3. **"Resend to analysis" everywhere a user reads it.**
   - cplm-api: the `peer_links` readiness message moved into `CpmReadinessController.PeerLinksMessage(InputState)`, unchanged
     except the ExpectedUnmapped sentence. That message reaches the editor's saved-readiness ? and Loop Explorer's readiness
     causes as sent. New test: `tests/cplm-api.Tests/ReadinessMessagesTests.cs` (no DB).
   - Loop Explorer › Relationships ?: "Create asset relationships, then republish evidence — G13 …" became the linked-loops
     sentence below.
   - Frontend grep: no other user-read "Re-project" or "republish" is left. `DetailHeader.tsx` keeps the old name in a code
     comment only. cplm-api's onboarding `notes.peerLinks` still says "republish evidence", but the frontend never shows it.
4. **Linked loops, one short sentence per place.** The meaning is unchanged: links come from the plant model and reach the
   analysis through Resend to analysis, or the loop is set to Not applicable.
   - Ready for analysis (`readinessRules.ts`) and cplm-api's message: "Link its interacting loops in the plant model and use
     Resend to analysis, or set Interacting loops to Not applicable in Edit loop."
   - Linked loops card, none yet (`ReadyAndLinks.tsx`): "No linked loops yet: link them in the plant model, then use Resend to
     analysis."
   - Explorer › Relationships ?: "Link this loop’s interacting loops in the plant model, then use Resend to analysis on its
     Loop Registry page."
5. **Valve position ? at narrow widths.** Each Valve position cell now carries its own label "Valve position ?"
   (`RegistryList.tsx`, the shared `VpLabel`). Above 820 px it is hidden (`display: none`). At 820 px and below, where the rows
   are cards, it shows in place of the generated column name (`td[data-label]:has(> .cpm-reg-cardlabel)::before { content:
   none }`), and the hidden head row's ? leaves the tab order. The Toggletip already stops its click and Enter, so opening the
   ? never opens the loop. This was checked in the browser at 390 and 768.
6. **Shared error text.** `QueryError` (`components/Cpm/shared.tsx`) no longer prints `error.message`. The new
   `queryErrorCopy.ts` gives the words:
   - 403: "You do not have permission to see this."
   - 404: "Not found."
   - 5xx, 408, a network failure ("Failed to fetch" and its Firefox / Safari words) or a TimeoutError: "The service did not
     answer. Try again."
   - Anything else, including a TypeError from code: "This could not be loaded. Try again."

   Retry stays. The error goes to `console.warn(title, error)` once per error. Governance's `ReadFailed` is deleted, and its
   four call sites use the shared `QueryError` (see Decisions).

## Faults seen in the screenshots, fixed (Governance)

| Fault | Fix |
|---|---|
| The header: How to read sat centred on Verify audit chain plus its last-run line, 12 px below Verify's top | `.cpm-gov .cpm-workspace-header__actions { align-items: flex-start }`. Tops are now 88 / 88 at 1440, 1000 and 768 (158 / 158 at 390) |
| At 601–900 px the audit trail table shrank to its content (608 of 688 px at 768). The cause is the shared `cpm-responsive.css` rule that makes every `.cpm-table` a scrolling block below 900 px | `@media (min-width: 600.02px) and (max-width: 900px) { .cpm-screen.cpm-gov table.cpm-gov-table { display: table } }`. These tables are fixed-layout and wrap, so the page cannot widen. Table = filter row = 686 px at 768 |
| The time range select (9rem = 126 px) cut "Last 24 hours" to "Last 24 hour" and "Custom range" to "Custom rang" | `.cpm-gov-filters__range { flex: 0 0 10rem }`. Find starts from 9rem instead of 10rem (it still takes the room left), so the five filters stay on one line at 768. Checked at 1440 / 1000 / 768 / 390 |

No ids, codes or backend words were seen on either page. The capture also scans each shot's visible text (main, dialogs, tips)
for GUIDs, hex runs, dotted permission keys, SCREAMING_CASE, snake_case and backend words. It found 0 hits in 77 shots.

## Tests (TDD: each new or changed expectation was watched failing before the source change)

- New: `QueryError.test.tsx` (14: every status, no answer, other errors, title + Retry, console only) and
  `ReadinessMessagesTests.cs` (2). Its red step was a compile failure: `PeerLinksMessage` did not exist yet.
- Changed:
  - `CpmGovernance.test.tsx`: the parity test is back.
  - `cpmAuditOpen.test.ts`: no `__foot`, header tops, table full width, range width.
  - `lifecycle.test.ts`, `GateConfigurationWrites.test.tsx`: the approval reason.
  - `readinessRules.test.ts`, `LoopDetailPage.test.tsx`: the linked-loops sentences.
  - `RelationshipsTab.test.tsx`: the Resend sentence and no "republish".
  - `RegistryList.test.tsx`: the card label with its ?, which does not open the row, plus its CSS.
  - `LoopRegistry.test.tsx`: it now uses the head's ?.
  - `governance/plainWords.test.tsx`: the shared copy on every tab.
- Tests that pinned server text and now pin the plain words: `Designer/TrendPage.test.tsx` ("loops unavailable") and
  `events/ConditionsView.test.tsx` ("boom").
- First full `npx vitest run`: 367 files, 3057 tests. 3054 passed. The three failures were the two pinned-text tests above
  (fixed, then passing) and the known flake `Designer/TrendCore.trust.test.tsx`, which passes alone (with TrendPage and
  ConditionsView: 3 files, 50 tests).

## Verification

- Final full `npx vitest run`, after every change: 367 files, 3060 tests, all passed (the flake passed too).
- `npx tsc --noEmit`: clean.
- `npm run lint`: clean.
- `npm run lint:theme`: 680 live files, 0 matches.
- `npm run build` with `VITE_LOOP_ROOT_PREFIX=root.hdpev2.cpm`: passes. The preview serves this dist.
- cplm-api `dotnet build`: 0 warnings, 0 errors.
- `dotnet test tests/cplm-api.Tests --filter ReadinessMessages|ReadinessJobs|OptionalInputs`: 32 passed, 0 failed. The lab DB
  connection string was in the environment only. These tests do not touch the DB.

## Browser check (preview :4173, lab API through :8081, read-only)

The guard blocked every non-GET `/api/` outside auth and READ_POSTS. Verify's POST was answered in the page and never sent.
Every run had 0 blocked calls and 0 HTTP 429. No horizontal page scroll in any shot. Each screenshot was looked at.

| Check | Result | Screens |
|---|---|---|
| Governance: four tabs at 1440 / 1000 / 768 / 390, Day + Night | Plain words throughout. The trail is a table above 600 px and two-line rows on a phone. Duties scrolls inside its card at 768 / 390 with the permission column fixed. Traceability: "Calculations v3.0.0", "Dynamics profile v2.0.0", "Threshold profiles in use: defaults only" | `gov-{trail,approvals,duties,traceability}-{w}-{theme}.png` |
| An audit event selected | The panel (a drawer below 1280 px) shows Actor, When with seconds, Entity, "Before and after values: Not available". No id, hash or Record details | `gov-trail-event-{w}-{theme}.png` |
| How to read, each tab, Day + Night | The four parts per tab. The approval rules read in the plain words that Gate Configuration now shares | `gov-howto-{tab}-1440-{theme}.png` |
| Verify audit chain (mocked) | Intact: "The audit chain is intact: no entry has been changed." Failed (mocked 500 with service text): "✕ Verify failed" + "An entry may have been changed, or the check could not finish." The service text does not appear in the dialog | `gov-verify-intact-1440-{day,night}.png`, `gov-verify-failed-{390-day,1440-night}.png` |
| Filters | Entity "Loops" + "Last 24 hours" give "No audit events match" in words. The range keeps its words after the fix | `gov-filters-1440-day.png`, `gov-filters-range-{1440-day,1000-night,768-day,390-day}.png` |
| A failed read (the guard answers 500 with service text) | "Audit log not reached" / "The service did not answer. Try again." / Retry | `gov-trail-failed-read-{1440,390}-day.png` |
| After the layout fixes | Header tops aligned, the table at full width at 768 | `gov-header-{1440-day,1000-night,768-day,768-night,390-day}.png` |
| Loop Registry list at 390 / 768 (Day, Night at 390) | Each card reads "Valve position ?". The ? opens the four words over the list and the page stays on `/cpm/registry`. The head's ? is hidden there (0 × 0). At 1440 the card label is hidden and the head's ? is shown | `reg-list-{390-day,390-night,768-day,1440-day}.png`, `reg-list-card-tip-{390-day,390-night,768-day}.png` |
| Loop page, FIC10401, linked-loops words (1440 Day / Night, 390 Day) | Checklist: "! To set: No linked loops / Link its interacting loops in the plant model and use Resend to analysis, or set Interacting loops to Not applicable in Edit loop." Card: "No linked loops yet: link them in the plant model, then use Resend to analysis." | `reg-detail-FIC10401-{1440-day,1440-night,390-day}.png` |

Tool (scratchpad, not committed): `chg203/shots.mjs` with modes `gov`, `reg`, `extra`, `filters`, plus `probe-selects.mjs` and
`probe-range.mjs`. Reports: `report-{gov,reg,extra,filters}.json` next to the screens.

## Decisions

- **Governance uses the shared QueryError.** The brief allowed it "if identical". The two are not identical word for word:
  ReadFailed always said "Try again shortly.", while the shared copy follows the status. Its purpose is identical, though:
  plain words and Retry. One copy app-wide is more consistent, and a 403 now says it is about permission instead of "Try again
  shortly.". `ReadFailed.tsx` is deleted.
- **The server message is in the Registry's words**, not only the old button name swapped out. Items 3 and 4 name the same
  sentence, so the editor's tip, Loop Explorer and the loop's page now read alike.

## Concerns

1. **The shell banner leaks server text.** In the mocked failed-Verify shot, the app-wide banner (`shared/ConnectivityBanner.tsx`,
   "The API is returning errors") printed the mocked 500's detail ("Npgsql timeout") in a `<code>` line. It does this on any
   page for any 5xx with a detail. Its body also says "gateway" and "service". This is outside these two pages, and the
   wording is the owner's call, so it is not changed here. It is the same leak class as item 6: the fix is to send
   `health.lastError` to the console and reword the strip.
2. **`ui/DataState` (`kind="error"`)** still uses `error.message` as its reason, the same leak as QueryError had. It is used
   by DataTable error states (History, Evaluated windows, Response tabs and others). It is not part of this brief.
   `reasonOf` could call `queryErrorCopy`.
3. **Permission keys are still on screen for users without the permission.** "Needs the cpm.manage permission" appears on the
   Loop Registry list (Bulk import, Add loop), the loop page (Resend, Retire, Edit), Loop Events, Investigation notes and
   Pipeline Health. Gate Configuration's other disabled reasons read "Needs cpm.config.validate / shadow / activate /
   rollback.". The app shares this string, so it needs one app-wide change, not a fix on two pages. Governance already says
   "Needs permission to view the audit trail".
4. **Entity and Event type filters clip long choices** at their 9rem width: "Gate configuration bundles", "Configuration
   deployments", "Loop settings resent to analysis (bulk)" and others. The choice reads whole in the open list. Fitting them
   would put the filters on two lines at 1440, which changes the row's design, so the owner should decide.
5. **ApprovalTab's note placeholder** still reads "Why this content is approved (recorded, hash-bound)". "hash-bound" is
   backend wording, but it was not in the brief, so it is left as is.
6. **The tab row moves 9 px** between the Audit trail tab (header with Verify and its line) and the other tabs (How to read
   only). This was already so (CHG-174), and it is not changed.
7. **Repetition in the trail's Entity column:** "20 loops" over "Loops", the CHG-202 design. The owner's no-repetition rule
   may want the type left out when the name already says it.
8. `.cpm-events-record` / `.cpm-events-copy` in `cpm-episodes.css` are unused too (task-19 item 5). The brief named only
   `.cpm-gov-trace__foot`, so they are left.
9. The lab cplm-api is the old build, so Loop Explorer's readiness causes and the editor's tip still show the old server
   sentence until cplm-api is rebuilt.

## For the release records (prod_decision.md / changes_tracker.md, not edited here)

- Services: **frontend** (Gate Configuration approval words, Loop Registry card ?, linked-loops words, Explorer Relationships
  ?, the shared failed-read words, Governance header / table / filter layout) and **cplm-api** (one readiness message text,
  `peer_links`). No migration, no schema change, no config, no API shape change.
