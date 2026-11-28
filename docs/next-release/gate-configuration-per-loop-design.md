# Gate Configuration: per-loop settings (CHG-219 design, owner-approved)

| | |
|---|---|
| Owner request | 22 Nov 2026: "we should have a proper ui for per loop setting which is excluded to plant wise settings - check whats best as we are doing changes", then "yes go ahead with your recommendation" |
| Owner answers | 23 Nov 2026, the four choices below (each the recommended option) |
| API | CHG-108 (cplm-api, `/api/v1/cpm/configuration`): `regions`, `loop-settings/stale`, `loop-settings/restack`, `batches/{id}`, `batches/{id}/approve`, `batches/{id}/deploy` |
| Builder | CPA Updates session (CHG-219). Owner rules apply: nothing on the current page moves or is removed; no technical text; OpenBridge only; current sizes |

## 1. Placement: a third view

The toggle becomes **Effective | Bundles | Per-loop settings**. Effective and Bundles stay exactly as they are; the
plant-wide settings (site and loop-class bundles) stay in Bundles as today. Nothing on the page moves or is removed.

## 2. The per-loop table

One row per active loop of the scope in the header (site / area / unit filters as on the other views), from
`GET regions?site=`.

| Column | From |
|---|---|
| Loop | `loopId` (+ `displayName`) |
| Type | `loopType` |
| PV range | `pvRangeMin` – `pvRangeMax` (blank when not declared) |
| Region min | `regionMin` |
| Region max | `regionMax` |
| Source | `source`: Own (LOOP), Plant-wide (PROFILE or SITE), None |
| Pending | the newest batch row of the loop, if any (state of its draft / deployment) |

**Many at once: edit in the table.** An "Edit regions" button turns the Region min / max cells of every row into inputs.
Save sends only the changed rows as one batch (`POST regions`, both cells empty = clear the region). Row errors and the
"reaches outside the PV range" warning show on their row.

## 3. Approve and deploy: a panel above the table

After Save, a batch panel above the table lists each loop of the batch with its state (`GET batches/{id}?site=`), and:

| Button | Who | Call |
|---|---|---|
| Approve | a second person (not the author) | `POST batches/{id}/approve?site=` |
| Approve alone (Admin) | the author, when they are Admin or SuperAdmin; recorded as a self-approval | the same call |
| Deploy | after approval | `POST batches/{id}/deploy?site=`; each row then follows its deployment until active |

**After a plant-wide change** (a site or loop-class bundle deployed): when `GET loop-settings/stale?site=` returns loops,
show the notice "N loops have their own settings on the previous plant-wide settings." with the button "Prepare their new
versions" (`POST loop-settings/restack`); the resulting batch opens in the same panel.

## Not decided here

Exact spacing, colours and component choice follow the existing Gate Configuration page and OpenBridge; anything that
would change the current views needs the owner first.
