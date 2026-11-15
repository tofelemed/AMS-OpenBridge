# Task 13 — CHG-196: censored response events keep their charts as long as the event (owner Q9)

Branch `feat/cpa-redesign` from `a8ddaa35`. Brief: `.superpowers/sdd/2026-11-15-owner-prod-review/q9-brief.md`; spec Q9 of
`docs/theme/redesign/owner-review-2026-11-14.md`. One commit (this report rides in it). Not pushed. No docker, no deploy, no
subagents, no migration, no engine change. `prod_decision.md` / `changes_tracker.md` untouched: the facts for them are below.

## What changed

**cplm-api**
- `Services/ResponseEvidenceRetention.cs` `PromoteSql`: the `e.capture_state <> 'CENSORED'` filter is gone, so each sweep
  moves the TRANSIENT G12 manifests of every response event (censored included) to class `RESPONSE`. Class comment rewritten
  (CHG-196).
- Checked, unchanged code: `ResponseRetention.PurgeAsync(censoredOnly: true)` already deletes the `RESPONSE`, unpinned
  manifests of the runs it deletes inside the same transaction as the events (chunks cascade), so a censored event's charts
  never outlive it. `PurgeOrphansAsync` and `TrimOverBudgetAsync` have no capture-state filter: censored charts are treated
  like the others (orphans after the RESPONSE days; the byte cap trims oldest first, never a kept model's charts). Comments
  in `ResponseRetention.cs` and `EvidenceRetentionSweeper.cs` updated.
- `Controllers/CpmResponseController.cs`: `retention` keeps its shape `{ acceptedDays, censoredDays, censoredChartHours }`.
  `censoredChartHours` is documented as no longer used by the page and now reports `censoredDays × 24` (null = while the
  event is kept), so an older frontend, which prints it as hours ("… and 72 h for censored candidates"), stays truthful if
  cplm-api is deployed first. The controller no longer reads `Cplm:EvidenceTransientHours` (constructor takes only the data
  source; DI unaffected).

**Frontend**
- `api/cpm/response.ts`: `ResponseRetention.censoredChartHours` optional and documented as unread; `responseCopy.ts` now
  re-exports the API type instead of a duplicate interface.
- `responseCopy.ts` `chartsAbsentCopy`: a censored event reads "Censored events keep their charts, result and quantities for
  3 days." ("1 day"; no row: "Censored events keep their charts as long as the event."); the hours are never read, so old and
  new API shapes give the same sentence. Note: since CHG-195 no component renders `chartsAbsentCopy` (the notes are one plain
  line: "Charts are not available for this event." etc., unchanged here); it is kept updated, not deleted.
- Two other live sentences said "a censored candidate only for hours" and would have become false: the G12 no-charts state
  (`evidence/GateResultState.tsx`) and the disabled-Reconstruct reason (`evidence/evidenceBasis.ts`). Both now say "a
  response event keeps its charts as long as the event". Recorded in `docs/theme/redesign/text-changes.md` `## CHG-196`.
- `response/ResponseWorkspace.tsx` (found by CHG-195): the deep-link check read `result.capture_state`, which the event detail
  never carries; it now reads `capture_state` or `evaluation_state` (as `EventPanes` does), so a link straight to a censored
  event switches the censored events on and the event selector selects it.

## Tests (each new or flipped assertion watched failing first)

- `tests/cplm-api.Tests/ResponseChartRetentionTests.cs`: `Promote_keeps_the_G12_charts_of_an_accepted_event_only` flipped to
  `Promote_keeps_the_G12_charts_of_every_response_event_censored_included` (censored chart → RESPONSE); new
  `CHG196_a_censored_events_charts_are_kept_and_leave_with_it_in_the_censored_purge` (TRANSIENT chart of a 3,650-day-old
  censored event promoted, then `PurgeAsync(3600, censoredOnly)` deletes event + chart + chunks, an accepted event and its
  chart stay). Only the test's own ids; 3,600+ day windows.
- `tests/cplm-api.Tests/ResponseEventsListTests.cs`: `censoredChartHours` = `censoredDays × 24`; constructor updated.
- Frontend: `responseCopy.test.ts` (censored copy in days, 1 day, no row, old shape with hours → same sentence, never
  "hour"), `classifyGateResult.test.ts` and `evidenceBasis.test.ts` (no "hours"), `ResponseWorkspace.test.tsx` (link to a
  censored event → `includeCensored` asked, the selector value is the event, no "Selected event (not in the list)"). The five
  failed first for the right reason, then passed.

Runs before the commit:
- `dotnet test tests/cplm-api.Tests --filter "FullyQualifiedName~ResponseChartRetention"`: **not run against the lab — the lab
  Postgres (127.0.0.1:5433) is not listening** (all 6 fail with `Failed to connect to 127.0.0.1:5433`; nothing else listens
  on 5432-5434). Before the change the test project failed to compile (constructor), as expected. The two integration
  classes must be run once the lab database is up.
- `dotnet build src/services/cplm-api`: 0 errors, 0 warnings; `dotnet build tests/cplm-api.Tests`: 0 errors.
- `npx vitest run src/components/Cpm/response src/components/Cpm/evidence`: 58 files, 375 tests passed. `npx tsc --noEmit`:
  clean. `eslint --max-warnings 0` on the 9 changed files: clean.

## Retention facts for prod_decision.md / changes_tracker.md

- **Old rule (CHG-105, v2.9.0):** accepted events' G12 charts → class RESPONSE, kept with the event 30 days (row RESPONSE,
  2 GiB cap); censored events kept 3 days (row RESPONSE_CENSORED) but their charts only the TRANSIENT 6 hours.
- **New rule (CHG-196):** every response event's G12 charts → class RESPONSE and leave with their event: accepted 30 days,
  censored 3 days (deleted by the censored purge in the same transaction). Same 2 GiB cap for the whole class, oldest
  first, kept-model charts never trimmed. No schema change, no new retention row, no migration; services: **cplm-api** and
  the **frontend** (ams-frontend).
- **After deploy only new censored charts are kept:** the first sweep promotes censored charts still TRANSIENT inside the
  lookback (TRANSIENT hours + 1 = 7 h); older censored charts are already deleted and cannot be rebuilt (G12 is event-keyed).
  Full steady state after 3 days.
- **Cost estimate (not measured — lab DB down; plant figures from CHG-105, 12 Nov):** a censored event writes the 7 required
  G12 kinds (no fit, so none of the conditional ones). At ~3,400 censored/day (brief) to ~6,000/day (12 Nov count) × 3 days
  = 10,200–18,000 censored events held. Payload ≤ ~4.9 KB/event (the accepted-event figure) = 50–90 MB on disk; counted
  against the cap with 1,200 B per manifest row (7 rows) ≈ 13 KB/event = 130–235 MB of the 2 GiB. Accepted charts at
  1,250–2,000/day × 30 days with 7–16 manifests each count ≈ 0.5–1.45 GB, so the class stays under the 2 GiB cap at the
  plant's rates, with less headroom at the top of the range.
- **Rollback:** reverting cplm-api to v2.9.0 is safe: censored charts already in RESPONSE are still deleted with their event
  by the unchanged censored purge (≤ 3 days); new censored charts go back to the 6 h TRANSIENT life.
- Check after deploy (plant): `SELECT e.capture_state = 'CENSORED' AS censored, count(*), pg_size_pretty(sum(m.total_bytes))
  FROM analytics.evidence_manifest m JOIN analytics.response_event e USING (method_run_id) WHERE m.retention_class =
  'RESPONSE' GROUP BY 1;` — censored rows should appear within one sweep and stop growing after 3 days.

## Concerns

1. The integration tests were not run (lab Postgres down). The SQL change is a one-line filter removal and the purge path is
   unchanged code, but the two classes (`ResponseChartRetention`, `ResponseEventsList`) need one lab run.
2. Censored charts now share the RESPONSE 2 GiB cap. At the top of the estimated range the cap could trim the oldest
   accepted charts (those near 30 days) before their event ages out; kept-model charts are never trimmed. Measure the class
   at the plant one week after deploy (query above) and raise `max_bytes` if it nears 2 GiB.
3. `chartsAbsentCopy` is dead code since CHG-195 (no component calls it). Kept and updated per the brief; removing it is a
   one-line follow-up if the controller prefers.
