# Task 16 — CHG-199: accepted response events keep their values 90 days and their stored charts 30 days (owner Q11)

Branch `feat/cpa-redesign` after CHG-198 (`c5831434`). Brief: `.superpowers/sdd/2026-11-15-owner-prod-review/chg199-brief.md`.
One commit (this report rides in it). Not pushed. No docker, no deploy, no subagents, no engine change. `prod_decision.md` /
`changes_tracker.md` untouched: the facts for them are below. Text changes: `docs/theme/redesign/text-changes.md` `## CHG-199`.

## What changed

**cplm-api**
- `Services/ResponseEvidenceRetention.cs`: `ChartsPolicy = "RESPONSE_CHARTS"` and `PurgeAgedChartsAsync(db, days?, batch, ct)`:
  deletes RESPONSE-class G12 manifests older than `days` whose event still exists and is not censored, outside `KeptModelRuns`
  (the cap's rule), unpinned, not EXPIRED; batched, `FOR UPDATE OF m SKIP LOCKED`; chunks cascade. Null days (no row) = 0 deleted.
  Censored events are excluded on purpose: their charts follow the event (CHG-196) whatever the chart row says.
- `Services/EvidenceRetentionSweeper.cs`: reads row RESPONSE_CHARTS and runs the chart age after the event / orphan / censored
  purges and before the byte cap; RESPONSE_CHARTS added to `NotEvidenceClasses` (otherwise the day-based loop would treat it as
  an evidence class).
- `Controllers/CpmResponseController.cs`: `retention` = `{ acceptedDays, acceptedChartDays, censoredDays, censoredChartHours }`
  (`acceptedChartDays` from RESPONSE_CHARTS, null = with the event); the earlier fields keep their names and meaning.
- `Services/ResponseRetention.cs`: comment only.

**SQL**
- Plant: `scripts/cpm-22-response-redraw-retention.sql` (online, idempotent: RESPONSE 30 → 90 only where it is still 30;
  RESPONSE_CHARTS 30 inserted ON CONFLICT DO NOTHING; last line `cpm-22 OK | RESPONSE=90d RESPONSE_CHARTS=30d`) and
  `scripts/cpm-22-response-redraw-retention.rollback.sql` (RESPONSE 90 → 30, row deleted; last line
  `cpm-22 rollback OK | RESPONSE=30d | RESPONSE_CHARTS rows: 0`).
- Fresh installs: `database/scripts/70_cplm_response_redraw_retention.sql` (`\c traverse_cplm`, after 69) and the same block at
  the end of `migration/schema/03-traverse_cplm.sql`, next to the CHG-105 block.
- Checked on the lab database inside transactions that were rolled back (a throwaway test, deleted, not committed): start 30 →
  90 + row; a re-run changes nothing; an operator's 45 stays 45; the rollback restores 30 and removes the row; script 70 gives
  the same; the lab rows were unchanged afterwards (RESPONSE 30, no RESPONSE_CHARTS).

**Frontend**
- `api/cpm/response.ts`: `ResponseRetention.acceptedChartDays?: number | null` (optional: an older cplm-api sends none).
- `response/ResponseNotes.tsx`: state `AGED_OUT`, "The stored charts of this event are no longer kept.", and `chartsGone`: a
  NOT_KEPT accepted event whose end is older than `acceptedChartDays` days. A censored event, an older server (undefined) and no
  row (null) read as before. No number is shown (nothing technical).
- `response/EventPanes.tsx` (`chartDays` prop; the CHG-198 redraw button is offered on AGED_OUT too),
  `response/ResponseWorkspace.tsx` (passes the events page's `retention.acceptedChartDays`).
- Two live Workbench sentences said "as long as the event" and would have become false for accepted events:
  `evidence/GateResultState.tsx` (G12 no-charts state) and `evidence/evidenceBasis.ts` (disabled Reconstruct reason) now say the
  charts are kept for a limited time and that System Response can redraw the trends from the historian.
- `response/responseCopy.ts` `chartsAbsentCopy` (no page renders it since CHG-195): the accepted sentence uses
  `acceptedChartDays ?? acceptedDays`, so it never claims 90 days of charts.

## Tests (each new assertion watched failing first)

- `tests/cplm-api.Tests/ResponseChartRetentionTests.cs` (+3): an accepted event's chart older than the chart days is deleted
  with its chunks while the event and its quantities stay and a younger chart stays; a kept model's chart, a pinned chart (flag),
  a PINNED-class chart and a censored event's chart are never aged out; null days deletes nothing. Only the test's own ids;
  3,500-3,650-day ages against a 3,600-day window, so lab rows are never in reach. Failed first (no `PurgeAgedChartsAsync`).
- `tests/cplm-api.Tests/ResponseEventsListTests.cs` (+1): `acceptedChartDays` = the RESPONSE_CHARTS row's days (null on the lab,
  which has no row), earlier fields still present.
- Frontend: `ResponseNotes.test.tsx` (+4 `chartsGone` / AGED_OUT), `redraw/RedrawOnPanes.test.tsx` (+1: an accepted event past
  the chart days reads "no longer kept" with the redraw; an older server reads as before), `responseCopy.test.ts` (+1),
  `classifyGateResult.test.ts` / `evidenceBasis.test.ts` (no "as long as the event", mention the redraw). 8 failed first.

Runs before the commit:
- `dotnet test tests/cplm-api.Tests --filter "FullyQualifiedName~ResponseChartRetention|FullyQualifiedName~ResponseEventsList"`
  against the lab database (host port 5436, connection string in the environment only): **12 passed, 0 failed** (the 8 earlier
  tests and the 4 new ones).
- `dotnet build src/services/cplm-api`: 0 warnings, 0 errors.
- Frontend: `npx vitest run` 351 files / 2941 tests passed; `npx tsc --noEmit` clean; `npm run lint` clean; `npm run lint:theme`
  0 matches; `npm run build` built.

## Retention facts for prod_decision.md / changes_tracker.md

- **Old rows (CHG-105 / CHG-196, v2.9.0):** RESPONSE days 30, max_bytes 2 GiB (accepted event, quantities and charts 30 days; the
  cap trims the oldest charts); RESPONSE_CENSORED days 3 (censored event and its charts).
- **New rows (CHG-199):** RESPONSE days **90** (accepted event and its quantities; unreviewed system models age out with the
  same days, see concern 1); RESPONSE max_bytes 2 GiB unchanged (safety net); new **RESPONSE_CHARTS days 30** (an accepted
  event's stored charts; max_bytes unused; no row = charts live as long as the event); RESPONSE_CENSORED 3 unchanged.
- **Why:** after 30 days the System Response page redraws an event's trends from the historian (CHG-198; loop samples TTL 90 d),
  which needs the event's record and quantities for as long as the historian can redraw them.
- **Services:** cplm-api and the frontend (ams-frontend). **Plant step:** `cpm-22` online, AFTER the cplm-api swap (POST_SWAP):
  `docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < ops/cpm-22-response-redraw-retention.sql`;
  last line `cpm-22 OK | RESPONSE=90d RESPONSE_CHARTS=30d`. Either order is safe (the old image ignores RESPONSE_CHARTS; the new
  image without the row keeps the charts with the event). The first sweep after both deletes accepted charts older than 30 days
  (at the plant there are none older than 30 days yet: the events themselves were kept 30 days).
- **Cost:** accepted records ~21 KB per event × ~1,250-2,000 a day: 90 d ≈ 2.4-3.8 GB, +1.6-2.5 GB over today's 30 d; charts
  unchanged ≈ 0.8 GB at 30 d (the 2 GiB cap stays). Plus the unreviewed system models kept 90 instead of 30 days (not measured).
- **Rollback (online):** `ops/cpm-22-response-redraw-retention.rollback.sql` (RESPONSE 90 → 30, RESPONSE_CHARTS removed); the
  next sweep deletes accepted events older than 30 days with their quantities; charts already deleted by age are not restored
  (G12 charts cannot be rebuilt). Safe with either cplm-api image.
- **Check after deploy:** `SELECT record_class, days, max_bytes FROM analytics.retention_policy WHERE record_class LIKE 'RESPONSE%';`
  and `SELECT count(*) FILTER (WHERE m.evidence_id IS NULL) AS events_without_charts, count(*) FROM analytics.response_event e
  LEFT JOIN analytics.evidence_manifest m ON m.method_run_id = e.method_run_id AND m.gate_id = 'G12' WHERE e.capture_state <> 'CENSORED'
  AND e.created_at < NOW() - interval '30 days';` (from day 31 the older accepted events keep their record without charts).

## Concerns

1. **Unreviewed system models now live 90 days too.** `ResponseRetention.PurgeModelsAsync` ages models out with row RESPONSE's
   days (CHG-091), so RESPONSE 90 keeps ~1,000 unreviewed models a day for 90 instead of 30 days, and every event a model was built
   from stays as long as its model. Not in the brief; left as is (it keeps a redrawn event's model too). Size not measured: check
   `pg_total_relation_size('analytics.system_model')` at the plant one week after deploy.
2. **Release tooling not wired:** `migration/deploy/build-release.py` (ops list), `release_blocks.py` (the POST_SWAP step) and
   `test_release_blocks.py` list cpm-21 but not cpm-22. They are under `migration/`, outside what this task may touch; add cpm-22
   there when the release is built.
3. The "no longer kept" note is chosen from the event's end versus the chart days, not from a server flag: an accepted event whose
   charts were never kept (or were trimmed by the cap) and that is older than 30 days also reads "no longer kept", which is still
   true in plain words.
4. Not seen in a browser (owner rule: the controller's end-of-batch pass).
