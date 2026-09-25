# CPA episode shelving — design, API and runbook (CHG-032, 2026-09-20)

Loop Events episodes (`analytics.cplm_event_frames`) get a shelving lifecycle of their own,
modelled on ISA-18.2 §12 and on the AMS alarm path (`36_alarm_shelving.sql`,
`ShelveExpiryService`): shelve with an expiry inside a site limit and a reason, update the
shelf, unshelve, automatic return at expiry, and a per-episode history of every operator
action. Acknowledgement is a separate fact: shelving never reviews an episode and
acknowledging never ends an active shelf.

## 1. What was wrong

| Before | Effect |
|---|---|
| A shelf was stored by overwriting `ack_state` with `SHELVED` | Shelving forgot whether the episode had been reviewed; the two facts could not coexist |
| No unshelve endpoint | The only way to end a shelf was to acknowledge the episode, which is a different statement |
| Nothing ran at expiry | An expired shelf stayed `SHELVED` for ever (lab EVT-833, three days past its expiry); the events read hid it with a `shelve_until <= NOW()` clause and the UI derived "expired" from the clock |
| Who / when / why lived only on the Kafka audit trail | The episode row could not say who shelved it or why; `note` was shared between ack and shelve |
| No maximum duration | A shelf could be set months ahead |

## 2. Model

`analytics.cplm_event_frames` (additive, script `database/scripts/60_cplm_event_shelving.sql`):

| Column | Meaning |
|---|---|
| `shelf_state` | `NONE` \| `SHELVED` \| `EXPIRED`. `EXPIRED` = returned from the shelf, not yet reviewed |
| `shelved_by`, `shelved_at`, `shelve_until`, `shelve_reason` | The shelf's own record. `note` stays the acknowledgement note |
| `ack_state` | `UNACKNOWLEDGED` \| `ACKNOWLEDGED`. `SHELVED` is no longer written (the CHECK still admits it until the conversion ran) |

`analytics.cplm_event_actions` — one row per action: `ACKNOWLEDGED`, `SHELVED`, `SHELVE_UPDATED`,
`UNSHELVED`, `SHELVE_EXPIRED`; `actor`, `at`, `until`, `reason`. Cascades with the frame.

Transitions (pure, `EventShelvingRules.cs`, tested in `EventShelvingRulesTests`):

| Request | Accepted when | Result |
|---|---|---|
| shelve `{until, reason}` | open episode; reason ≥ 3 chars; `now < until ≤ now + MaxHours` | `SHELVED` + record; on an active shelf the record says `SHELVE_UPDATED`; an `EXPIRED` shelf becomes a new shelf; the ack is untouched |
| unshelve `{reason?}` | `SHELVED` or `EXPIRED` (or a legacy `ack_state = SHELVED` row) | `NONE`, shelf columns cleared, `UNSHELVED` record; the ack is untouched |
| acknowledge `{note?}` | not already acknowledged (open or closed) | `ACKNOWLEDGED` + record; an `EXPIRED` shelf is cleared by the review; an active shelf stays |
| sweeper (every 60 s) | `SHELVED` and `shelve_until <= now()` | `EXPIRED` + `SHELVE_EXPIRED` record (actor `system`) + audit event; `UPDATE … RETURNING` flips each row once |

Refusals carry the reason: 409 closed / not shelved / already acknowledged, 400 reason / expiry
(with `maxHours`), 404 unknown id.

## 3. API (`cplm-api`, all under `/api/v1/cpm`, policy `cpm.manage` for writes)

| Route | Body | Response |
|---|---|---|
| `POST /events/{id}/acknowledge` | `{ note? }` | `{ id, ackState }` |
| `POST /events/{id}/shelve` | `{ until, reason }` (`note` still accepted as the reason) | `{ id, shelfState: "SHELVED", shelveUntil, updated }` |
| `POST /events/{id}/unshelve` | `{ reason? }` | `{ id, shelfState: "NONE", ackState }` |
| `GET /events/{id}/actions` | — | `{ eventId, count, actions[] }` newest first |
| `GET /events/shelving-policy` | — | `{ maxHours, sweepSeconds }` |
| `GET /events` | unchanged query | rows gain `shelf_state`, `shelved_by`, `shelved_at`, `shelve_reason`; the envelope gains `shelvePolicy.maxHours`; `includeShelved=false` hides active shelves only |

Configuration (`Cplm:Shelving`): `MaxHours` 168, `SweepSeconds` 60, `SweepEnabled` true.
Audit events: `CPM_EVENT_ACKNOWLEDGED`, `CPM_EVENT_SHELVED`, `CPM_EVENT_SHELVE_UPDATED`,
`CPM_EVENT_UNSHELVED`, `CPM_EVENT_SHELF_EXPIRED`.

## 4. UI (Loop Events)

- The detail's **Review and shelf** section shows the acknowledgement (who / when / note) and
  the shelf (who / until / countdown / reason) as two rows.
- Buttons: **Acknowledge** (raised), **Shelve… / Update shelf…**, **Unshelve…** (enabled for an
  active or expired shelf, otherwise disabled with the reason), **History ›** (lazy
  `GET /events/{id}/actions`, fetched only while open).
- The shelve panel offers the presets the site limit allows, a custom expiry capped at that
  limit, and a required reason; the unshelve panel states which queue the episode lands in.
- The State column reads `Shelved · expires in 3.0 h`, `Shelf expired · unreviewed`,
  `Acknowledged`, `Unacknowledged`, `Closed …`. Filters: *Unacknowledged* excludes active
  shelves and includes expired ones; *Shelved* / *Shelf expired* as named.

## 5. Deploy

Order on the plant: `ops/cpm-09-event-shelving.sql` on `traverse_cplm` **before** the `cplm-api`
image swap (additive; converts legacy `SHELVED` rows and writes their history rows; re-runnable),
then the `cplm-api` and `ams-frontend` images. The lab self-heals the same DDL from
`CplmEventFrameService.EnsureSchemaAsync`. Fresh installs carry it in
`migration/schema/03-traverse_cplm.sql`.

Proof: `select shelf_state, count(*) from analytics.cplm_event_frames group by 1` shows no
row left with `ack_state = 'SHELVED'`; the sweeper logs "Shelf expiry: N episode(s) returned"
once a minute when something is due; `GET /events/shelving-policy` answers `{ maxHours: 168 }`.

## 6. Tests

- `tests/cplm-api.Tests/EventShelvingRulesTests.cs` (pure, 5 tests).
- `tests/cplm-api.Tests/EventActionsApiTests.cs` (Integration, lab `traverse_cplm`): the
  frame and its history land together; shelf and ack independent; sweeper flips once;
  events read hides active shelves only and reports the policy.
- Frontend: `events/shelfState.test.ts`, `events/EventDetail.test.tsx`.
