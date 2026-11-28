# Gate Configuration: end-to-end check (23 Nov 2026)

| | |
|---|---|
| Scope | Every step of the Gate Configuration page against cplm-api: create, edit, validate, shadow, approve, deploy, verify (worker acknowledgements), roll back, the Effective view (all loops and one loop), and the new Per-loop settings view |
| Build | `feat/sr-engine-fixes` at aeeb3cf8 (System Response Phases 1-4 + CHG-106..109) |
| Method | Code walk of both sides (UI and API), each finding traced in the code. The live run on the lab follows the deploy |
| Who fixes | UI = CPA Updates session; API = system response Updates session. **Fixed in this release (owner, 23 Nov): 3, 5, 8, 8a**; the rest can follow |

## Gaps, most serious first

| # | Gap | What the user sees | Side | New in this release? |
|---|---|---|---|---|
| 1 | A loop under a **site-wide bundle**: the server works out its values from the factory defaults, while the engine applies the site bundle on top of the loop's class pack | The Effective view shows factory values (36-42 of 48 differ) and "FACTORY" as their source; the engine runs other values. No effect on results, only on what the page says. The lab and, as far as known, the plant have no site-wide bundle | API | No |
| 2 | The engine starts using a bundle when each worker acknowledges it; the page only moves it to "active" when every worker has | (a) A deployment that fails half way: some workers run the new bundle, the page shows the old one. (b) A bundle with a future "Effective from" is shown active after 5 minutes, while the engine waits for that time | API | No |
| 3 | A loop's (or class's) **first** own bundle starts from the factory defaults, not from the plant-wide bundle the loop runs under | When it is activated, the loop loses the plant-wide changes. The comparison reads "0 properties differ". (The new per-loop region flow does start from the plant-wide bundle) | UI (`DraftBundleDialog`) | No - **fixed** (CHG-220, 2b0d52e8): a first version starts from the active PROFILE, else SITE bundle; seen live (FIC10401: "Starts from PROFILE v1") |
| 4 | Roll back is offered where the server refuses it or does something else | (a) The first version of a scope: refused "no previously active bundle". (b) A superseded bundle: the server redeploys the bundle that is already running. (c) A second click rolls back one more version | UI + API | No |
| 5 | Approve is offered where the server will refuse it | The author gets "refused" even as Admin (only the new batch path allows Admin self-approval, so the same draft can be approved alone in Per-loop settings but not in the editor). A site-wide bundle needs the role "ControlAuthority", which no user has, so nobody can approve one. An expired approval: Approve is offered but refused, and Edit is closed | UI + API | No - **fixed** (API f77cb8b2, UI 2b0d52e8): an Admin / SuperAdmin approves their own draft in the editor too ("Approve alone (Admin)", recorded `[self-approved as …]`); a site-wide or objective / test-permission change needs a SuperAdmin; an expired approval can be given again and reopens Edit. Seen live: B6 re-run, PROFILE v1 approved alone in the editor |
| 6 | A bundle's state is not read again when its deployment finishes | After "Partially acknowledged" or "Activation failed" the editor still says "Prepared" and Activate stays off until the page is reloaded | UI | No |
| 7 | Shadow comparison | It stays at "Submitted" (the run is only marked finished when another page reads it), and "Run again" or an edit still shows the previous comparison | UI + API | No |
| 8 | Per-loop settings (new) | Refusals of single rows were not shown; a re-stack with nothing to prepare opened an empty batch; "Cleared" on re-stack rows; the table did not refresh after the deployment | UI | **Yes - fixed** (aeeb3cf8) |
| 8a | Per-loop settings: a batch is looked up among the site's 200 newest loop bundles | An older batch quietly loses rows and approve / deploy act on the rest | API | Yes (CHG-108) - **fixed** (f77cb8b2): the batch is read by its marker, with no 200 cap |
| 9 | A deployment whose message to Kafka fails stays "Scheduled" or "Prepared" for ever (the 30 s sweep does not look at those states) | The bundle cannot be edited or deployed again; the page waits for ever. Only on a Kafka outage | API | No |

Minor: a malformed "Effective from" reads "request failed (HTTP 400)"; two quick edits in a row can be refused as stale (the
new version tag is not kept after the first save).

## Checked and correct

Create, edit (with the version check), validate (rejections listed); when Shadow and Activate are offered; the
acknowledgement table (required workers and observers, a wrong bundle flagged); every permission matches the server; the
screens refresh after each write; the batch approve rule; the region request (changed rows only, both empty clears, the
200-row limit).

## Recommendation for this release

Fix 3 (a loop losing plant-wide settings is a silent wrong configuration), 5 (the Admin rule should be the same in the
editor and in Per-loop settings, and a site-wide bundle must be approvable by someone) and 8a. The rest can follow; none
changes an engine result.

**Done 23 Nov** (owner agreed): 3, 5 and 8a fixed, deployed to the lab (frontend and cplm-api `sr-f4a6132b`) and checked
there. Open for a later release: 1, 2, 4, 6, 7, 9.
