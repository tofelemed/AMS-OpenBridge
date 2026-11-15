# Task 19: CHG-202, the Governance page in plain words (no ids, no backend text)

**Status:** DONE_WITH_CONCERNS
**Commit:** `e853c25a` fix(cpa): CHG-202 Governance in plain words - no ids or backend text (branch `feat/cpa-redesign`, not pushed)
**Brief:** `.superpowers/sdd/2026-11-15-owner-prod-review/chg202-brief.md`
**Tests:** Governance + CpmGovernance: 10 files, 94 tests pass. Related suites (`src/styles` scans incl. buttonStandard /
dialogStandard, `src/cpa`, Admin Roles / landing, ShellNav, capabilities, productSlice, pages/cpa/access, useRoleMatrix): 18 files,
216 tests pass. `npx tsc --noEmit` clean. `eslint` on the Governance files: 0 warnings. `npm run lint:theme`: 0 matches.
No build, no preview, no browser, no docker (per the brief).

## What changed (summary)

- **Audit trail.** Actor "Unknown user" (it was "Not recorded by name" plus "Recorded by user id only; the id is in Record
  details."). The signed-in person shows their full name ("Super Administrator"), taken from the session, so there is no new
  request. Their old events recorded by id also resolve. Other people keep their login name. Entity types now read "Loops" and
  "Loop events". An entity known only by an id (bundle or deployment without `cpm.config.read`, data source, display, user,
  model, unknown type) shows its type alone, with no "043f185b…". The time tooltip reads "4 Nov 2026 13:04:11" (it held the raw
  ISO record). Find matches what is shown plus the actor's login. It no longer matches hidden codes or ids.
- **Record details removed** (owner Q6), with `AuditRecordDialog.tsx` and `RecordDialog.tsx`. The decision is below.
- **Verify audit chain.** The answer is in our words, never the service's own text or its status code. Possible answers:
  "The audit chain is intact: no entry has been changed." / "✕ Verify failed" + "An entry may have been changed, or the check
  could not finish." (500) / "You do not have permission to verify the audit chain." (401/403) / "The audit log could not
  complete the check." (any other status) / "The audit log could not be reached, so the chain was not checked." The "Not served"
  part went. "Walking the full chain…" now reads "Checking every entry…".
- **Approvals.** Sites show their plant-model name, from the header's shared `useSiteFilters` read (no new request). A profile
  reads in words ("PID flow · v3", "Profile PID flow"). The signed-in author shows by name. The no-permission state no longer
  names `cpm.config.read`.
- **Separation of duties.** Each permission reads as its catalog description only (no key). A trailing internal acronym
  "(CPLM)" is dropped. If the catalog fails or lacks a description, the catalog's own words stand in, so a key never shows.
  aria-labels read "Admin: View the audit log, held".
- **Change traceability.** "Calculations v3.0.0" without "CplmGateFusionEngine (Flink)". Threshold profiles read in words.
  **Build details removed**: it held the service build, commits, jar SHA-256 and engine builds, which is backend data only.
- **How to read.** The rules are in plain words, with no permission key, content hash or "refused by the server". Also changed:
  "Unknown user"; the filters text without "ask the server / rows fetched"; the chain without "walk"; the versions text
  without "payload".
- **Failed reads.** Every Governance error state now uses a local `ReadFailed`: the title, "Try again shortly." and Retry. The
  shared `QueryError` printed `error.message`, which is the server's detail when one is sent (see Shared changes, item 6).
- **Tests.** `plainWords.test.tsx` mounts the real page. It walks every tab, clicks every audit row and every bundle, opens How
  to read on each tab, and covers every Verify state, the no-permission states and the failed-read states. The fixtures carry
  GUID ids, GUID actors, hashes, correlation ids and service detail. It then checks text, titles, aria-labels and placeholders
  with `plainWordsCheck.ts`. The check rejects: GUIDs, hex runs, shortened ids, "id" / "user id", "Record details", service,
  engine or build names, CPM / CPLM / RBAC, SCREAMING_CASE, snake_case, dotted permission keys, and hash / payload / server
  wording.
- The two registry-link expectations now read `/cpm/registry/<loop>`, as the coordinator asked (CHG-201).

## The "Record details" decision, and the export it relies on

**Removed.** I looked for an export that carries the full record:
- **Frontend:** there is no audit-trail export (CSV or JSON). The CSV exporters are on the Registry, History and charts.
- **audit-service `GET /api/v1/audit`** (gateway `/api/audit`, `admin.audit.view`): a JSON API that returns every field Record
  details showed (eventId, timestampUtc, eventType, userId, entityType, entityId, correlationId, currentHash). It is a read API,
  not a user export.
- **WORM daily archive** (`Archival/WormArchiveWriter.cs`): a JSON file per day, including the before and after states, written
  to MinIO. It is opt-in and starts only when `S3:ServiceUrl` is set; compose does not set it.

So no existing export carries the record. As the brief says for that case, one plain-language record view is kept, and it is
the **event panel**, with no separate dialog (each fact once):
- who: Actor;
- what: the action as the panel title;
- when: with seconds and year;
- on what: the Entity row, or the type eyebrow when only an id names it;
- before → after: "Not available", the CHG-174 owner decision, kept.

It shows no raw ids, hashes or JSON. **Concern 1** below says what an auditor loses.

## Inventory of technical strings found

Line numbers are those of the file **before** the change (`bff8b170`).

| File:line | Before | After / removed | Why |
|---|---|---|---|
| CpmGovernance.tsx:62 | reason "Needs the admin.audit.view permission" | "Needs permission to view the audit trail" | permission key |
| auditCatalog.ts:14 | "CPM loop" / "CPM loops" | "Loop" / "Loops" | internal acronym (brief) |
| auditCatalog.ts:15 | "CPM event" / "CPM events" | "Loop event" / "Loop events" | acronym; the page is Loop Events |
| auditCatalog.ts:37 | "Evidence republished" | "Loop settings resent to analysis" | backend term; CHG-201 "Resend to analysis" |
| auditCatalog.ts:38 | "Evidence republished (bulk)" | "Loop settings resent to analysis (bulk)" | same; the count stays in Entity ("20 loops"), once |
| auditCatalog.ts:38 | "Recompute started" | "Recalculation started" | engine jargon |
| auditCatalog.ts:39 | "Instrument binding created" | "Instrument linked" | "binding" is a data-model term |
| auditCatalog.ts:71 | "Chain re-hashed" | "Audit chain recalculated" | hash |
| auditCatalog.ts:81-84 | unknown code → "CPM something new", "Ingestion thing done", RBAC capitalised | service prefix dropped: "Something new", "Thing done", "Role renamed" | service names |
| auditCatalog.ts:118-119 | `shortId`: a GUID as "043f185b…" | removed; `entityName` returns null and the row and panel show the type alone | id |
| auditCatalog.ts:123-133 | "Not recorded by name" (empty or unknown actor, and GUID actor + id for Record details) | "Unknown user"; id dropped; signed-in person by full name | id talk (brief) |
| auditCatalog.ts:135-144 | entity fallback `shortId(entityId)` (bundle, deployment, data source, display, user, model ids) | null (type alone); loop tags, role names, EVT-n, "Whole chain", "Bulk import" kept | id |
| AuditTrail.tsx:78-79 | "Audit reads require the admin.audit.view permission" / "Your session does not carry it; the trail itself keeps recording regardless." | "You do not have permission to view the audit trail" / "Changes are still recorded." | permission key, "session" |
| AuditTrail.tsx:83-84 | "The audit log refused the read" / "Your sign-in was accepted by the app but not by the audit log. Sign in again…" | "The audit log could not be opened" / "Sign in again to refresh your permissions." | backend explanation |
| AuditTrail.tsx:87 | QueryError copy = `error.message` (server detail when sent) | ReadFailed: "Try again shortly." | backend text |
| AuditTrail.tsx:90-91 | "…display, CPM, gate-configuration, data-source, role and user changes…" | "…changes to loops, loop events, gate configuration, data sources, displays, roles and users…" | acronym, hyphenated codes |
| AuditTrail.tsx:105 | `title` = raw `timestampUtc` ("2026-11-04T13:04:11.48+00:00") | "4 Nov 2026 13:04:11" (the panel's format) | raw record |
| AuditTrail.tsx:111-112 | entity name (could be "043f185b…") + type | the name and its type, or the type alone | id |
| AuditEventPanel.tsx:40 | "Record details" button | removed | owner Q6 |
| AuditEventPanel.tsx:44 | "Recorded by user id only; the id is in Record details." | removed | id talk |
| AuditEventPanel.tsx:50 | Entity row with a shortened id | the Entity row only when a name exists (the type is the eyebrow) | id; each fact once |
| AuditEventPanel.tsx:61 | AuditRecordDialog | removed | owner Q6 |
| AuditRecordDialog.tsx (whole file) | Event id, Event type (code), Recorded at (raw ISO), User id, Entity type (code), Entity id, Hash (12 chars), Correlation, ⧉ copy buttons | file deleted | ids, codes, hash |
| RecordDialog.tsx (whole file) | the shared Record / Build details dialog | file deleted (no user left) | — |
| VerifyDialog.tsx:21 + 54-59 | "Not served" part: "The chain range, entry count and algorithm are not served, so this answer cannot be checked here." | removed | describes the service's reply ("served") |
| VerifyDialog.tsx:22 | "This answer means the audit log reported possible tampering or could not complete the walk." | "An entry may have been changed, or the check could not finish." | "walk" |
| VerifyDialog.tsx:40, 69 | "Walking the full chain…" | "Checking every entry…" | "walk" |
| VerifyDialog.tsx:41 | "The audit log answered:" + the service's raw text in mono | "The audit chain is intact: no entry has been changed." | service text |
| VerifyDialog.tsx:46 | `verify.error.message` (e.g. "CHAIN TAMPERING DETECTED.", server detail, "Request failed (HTTP 404).") | the words above per case (500 / 401-403 / other / not reached) | service text, status codes |
| ApprovalPanel.tsx:28-30 | Scope "Profile pid_flow" | "Profile PID flow" | snake_case code |
| ApprovalPanel.tsx:48 | title `bundleName`: SITE bundle "hdpe · v2", profile "pid_flow · v3" | "HDPE Plant · v2", "PID flow · v3" | site slug, code |
| ApprovalPanel.tsx:56 | Site "hdpe" | plant-model name | slug |
| ApprovalPanel.tsx:59 | Author login | the signed-in person by full name; others by login | display name (brief) |
| ApprovalsTab.tsx:29-30 | "The approval queue needs the cpm.config.read permission" / "Gate-configuration bundles are read with it; approving…" | "You do not have permission to view approvals" / "Approving and activating stay on Gate Configuration." | permission key |
| ApprovalsTab.tsx:43 | QueryError (server detail) | ReadFailed | backend text |
| ApprovalsTab.tsx:61, 63, 69 | bundle name, "· hdpe" site sub-line, Author login | site name, profile words, full name for the signed-in person | slug, code |
| DutiesTab.tsx:31-32 | "The live role matrix needs the rbac.manage permission" / "Your session can read the audit trail but not the RBAC model, so this panel will not describe a permission model it cannot verify." | "You do not have permission to view roles" / "Separation of duties is shown to people who can manage roles." | key, RBAC, developer prose |
| DutiesTab.tsx:35 | "RBAC model unavailable" (+ server detail) | "Roles could not be read" (ReadFailed) | acronym, backend text |
| DutiesTab.tsx:49-50 | row header: mono key ("cpm.manage") + description under it | the description alone ("Onboard and configure control loops"; "(CPLM)" dropped; catalog words as fallback) | permission keys |
| DutiesTab.tsx:57 | aria-label "Admin holds cpm.manage" | "Admin: Onboard and configure control loops, held" | key in screen-reader text |
| ChangeTraceability.tsx:54 | "Calculation engine" "v3.0.0 · CplmGateFusionEngine (Flink)" | "Calculations" "v3.0.0" | class and runtime name; "engine" went elsewhere in CHG-200 |
| ChangeTraceability.tsx:45 | threshold profile ids as stored ("pid_flow") | in words ("PID flow") | code |
| ChangeTraceability.tsx:16-38, 60 | Build details button + dialog: "Service build 1.0.0 · 2f5ff876aaaa", "Engine build 1: calc 3.0.0 · commit 4e1a9c07b2d3-dirty · jar 9b2f61c0a7e4", "none stored yet", "Build details could not be read" | removed | service builds, commits, jar digests |
| ChangeTraceability.tsx:50 | QueryError (server detail) | ReadFailed | backend text |
| GovernanceHowToRead.tsx:19 | "Needs cpm.config.approve (by someone other than the author)." | "Someone other than the author, with permission to approve gate configuration." | permission key |
| GovernanceHowToRead.tsx:20 | "An approval is bound to the content hash and expires. A self-approval, an expired approval or a stale hash is refused by the server." | "An approval holds only for the content approved, and it expires. Approving your own draft, an expired approval or an approval of content changed since is refused." | hash, server |
| GovernanceHowToRead.tsx:21 | "a site-wide or objective / test-permission change needs an approver with the ControlAuthority role" (cplm-api's refusal, quoted) | "A site-wide change, or a change to an objective or a test permission, needs an approver with the ControlAuthority role." | server text; the role keeps its exact name, which an administrator must give it |
| GovernanceHowToRead.tsx:27 | term "a user name" | "a name" | the signed-in person now shows their full name |
| GovernanceHowToRead.tsx:28 | "A service did it: …" | "The application did it: …" | "service" |
| GovernanceHowToRead.tsx:29 | "Not recorded by name" / "An older Administration event that names its actor by user id; the id is in Record details." | "Unknown user" / "An older change recorded without the person's name." | id talk |
| GovernanceHowToRead.tsx:37 | "…ask the server, so they reach older records. Find searches only the rows fetched. User matches the exact user name, in any case." | "…search the whole audit trail, older records too. Find searches only the page shown. User matches the whole user name, in any case." | server, "rows fetched" |
| GovernanceHowToRead.tsx:38 | "…asks the audit log to walk the chain and shows its answer." | "…checks every entry and shows the result." | "walk" |
| GovernanceHowToRead.tsx:44 | "NOT active: activate again once the fleet is fixed." | "…once the cause is fixed." | "fleet" (engine workers) |
| GovernanceHowToRead.tsx:57 | "Every stored window carries these versions in its payload, so any historical verdict can be attributed to the formula that produced it." | "Every stored window keeps these versions, so any past verdict can be traced to the formula that produced it." | payload |
| auditLinks.ts:56 | display link labelled by the shortened id | "HMI display ↗" when no name | id |
| useConfigNames.ts:17-18 | `bundleName`: site slug, profile code | site name, profile words | slug, code |
| useAuditTrail.ts:17 | Find also matched the hidden entityId and eventType codes ("cpm" matched every loop row) | matches the shown words plus the actor's login | codes not on screen |

**Reviewed and kept** (plain words, or a name the reader uses elsewhere):
- "EVT-48213": the loop event's reference, used across Loop Events.
- Bundle "· v7", "Calculations v3.0.0", "Dynamics profile v2.0.0". Versions are what Change traceability exists to show, and
  Gate Configuration names bundles by version. Removing them would empty a tab the owner keeps.
- Loop tags, role names (incl. ControlAuthority) and other people's login names.
- "Verify audit chain", "Not verified in this session.", "Audit log not reached", "Before and after values: Not available".
- The Gate Configuration vocabulary: "Gate configuration bundle", "Configuration deployment", "Active (verified)", "Shadow
  evaluation started", "Change class", "State boundary", "Policy".
- "Entity" as the column and filter label: a standard audit-trail word. The owner may prefer "Item" (open question).
- The catalog wording "Manage pipeline jobs and OPC connections; view Pipeline Health and Governance": borderline ("pipeline
  jobs"), but it is the catalog's text.

All filters and all four tabs are kept. Option values and CSV / data keys are unchanged.

## CHG-202 text changes

For the coordinator to merge into `docs/theme/redesign/text-changes.md`. Each entry reads before → after (file).

**Audit trail list and panel**
- "CPM loop" / "CPM loops" → "Loop" / "Loops" (governance/auditCatalog.ts)
- "CPM event" / "CPM events" → "Loop event" / "Loop events" (governance/auditCatalog.ts)
- "Evidence republished" → "Loop settings resent to analysis" (governance/auditCatalog.ts)
- "Evidence republished (bulk)" → "Loop settings resent to analysis (bulk)" (governance/auditCatalog.ts)
- "Recompute started" → "Recalculation started" (governance/auditCatalog.ts)
- "Instrument binding created" → "Instrument linked" (governance/auditCatalog.ts)
- "Chain re-hashed" → "Audit chain recalculated" (governance/auditCatalog.ts)
- Unknown code "CPM something new" → "Something new" (service prefix dropped) (governance/auditCatalog.ts)
- "Not recorded by name" → "Unknown user"; the signed-in person shows their full name (governance/auditCatalog.ts)
- "Recorded by user id only; the id is in Record details." → removed (governance/AuditEventPanel.tsx)
- "Record details" button and dialog → removed (governance/AuditEventPanel.tsx, AuditRecordDialog.tsx, RecordDialog.tsx)
- Entity "043f185b…" (any shortened id) → the type alone, e.g. "Data source"; no Entity row in the panel
  (governance/auditCatalog.ts, AuditTrail.tsx, AuditEventPanel.tsx)
- Date tooltip "2026-11-04T13:04:11.48+00:00" → "4 Nov 2026 13:04:11" (governance/AuditTrail.tsx)

**Audit trail empty and error states**
- "Audit reads require the admin.audit.view permission" / "Your session does not carry it; …" → "You do not have permission
  to view the audit trail" / "Changes are still recorded." (governance/AuditTrail.tsx)
- "The audit log refused the read" / "Your sign-in was accepted by the app but not by the audit log. Sign in again to refresh
  your permissions." → "The audit log could not be opened" / "Sign in again to refresh your permissions."
  (governance/AuditTrail.tsx)
- "The trail records display, CPM, gate-configuration, data-source, role and user changes." → "The audit trail records
  changes to loops, loop events, gate configuration, data sources, displays, roles and users." (governance/AuditTrail.tsx)
- "Display, CPM, gate-configuration, data-source, role and user changes are recorded here as they happen." → "Changes to
  loops, loop events, gate configuration, data sources, displays, roles and users are recorded here as they happen."
  (governance/AuditTrail.tsx)
- Error copy = the service's message → "Try again shortly." (governance/ReadFailed.tsx; used by AuditTrail, ApprovalsTab,
  DutiesTab, ChangeTraceability)

**Header and Verify audit chain**
- "Needs the admin.audit.view permission" → "Needs permission to view the audit trail" (CpmGovernance.tsx)
- "The audit log answered:" + service text → "The audit chain is intact: no entry has been changed."
  (governance/VerifyDialog.tsx)
- Service error text + "This answer means the audit log reported possible tampering or could not complete the walk." →
  "An entry may have been changed, or the check could not finish." (governance/VerifyDialog.tsx)
- 401 / 403 service text → "You do not have permission to verify the audit chain." (governance/VerifyDialog.tsx)
- Other statuses ("Request failed (HTTP 404).", server detail) → "The audit log could not complete the check."
  (governance/VerifyDialog.tsx)
- "Not served" + "The chain range, entry count and algorithm are not served, so this answer cannot be checked here." →
  removed (governance/VerifyDialog.tsx)
- "Walking the full chain…" → "Checking every entry…" (governance/VerifyDialog.tsx)

**Approvals**
- "The approval queue needs the cpm.config.read permission" / "Gate-configuration bundles are read with it; approving and
  activating stay on Gate Configuration." → "You do not have permission to view approvals" / "Approving and activating stay on
  Gate Configuration." (governance/ApprovalsTab.tsx)
- Site "hdpe" → "HDPE Plant" (plant-model name); "hdpe · v2" → "HDPE Plant · v2"; "Profile pid_flow" → "Profile PID flow";
  "pid_flow · v3" → "PID flow · v3" (governance/ApprovalPanel.tsx, ApprovalsTab.tsx, useConfigNames.ts)

**Separation of duties**
- "The live role matrix needs the rbac.manage permission" / "Your session can read the audit trail but not the RBAC model, so
  this panel will not describe a permission model it cannot verify." → "You do not have permission to view roles" /
  "Separation of duties is shown to people who can manage roles." (governance/DutiesTab.tsx)
- "RBAC model unavailable" → "Roles could not be read" (governance/DutiesTab.tsx)
- Row "cpm.manage" + "Onboard and configure control loops (CPLM)" → "Onboard and configure control loops" (description only,
  every row) (governance/DutiesTab.tsx)
- aria "Admin holds cpm.manage" → "Admin: Onboard and configure control loops, held" (governance/DutiesTab.tsx)

**Change traceability**
- "Calculation engine: v3.0.0 · CplmGateFusionEngine (Flink)" → "Calculations: v3.0.0"
  (governance/ChangeTraceability.tsx)
- Threshold profiles "pid_flow" → "PID flow" (governance/ChangeTraceability.tsx)
- "Build details" button and dialog (service build, engine builds, commits, jar) → removed
  (governance/ChangeTraceability.tsx)

**How to read**
- "a user name" → "a name"; "A service did it: …" → "The application did it: …"; "Not recorded by name" / "An older
  Administration event that names its actor by user id; the id is in Record details." → "Unknown user" / "An older change
  recorded without the person's name." (governance/GovernanceHowToRead.tsx)
- Filters: "…ask the server, so they reach older records. Find searches only the rows fetched. User matches the exact user
  name, in any case." → "…search the whole audit trail, older records too. Find searches only the page shown. User matches
  the whole user name, in any case." (governance/GovernanceHowToRead.tsx)
- Audit chain: "…asks the audit log to walk the chain and shows its answer." → "…checks every entry and shows the result."
  (governance/GovernanceHowToRead.tsx)
- "NOT active: activate again once the fleet is fixed." → "NOT active: activate again once the cause is fixed."
  (governance/GovernanceHowToRead.tsx)
- Approve: "Needs cpm.config.approve (by someone other than the author)." → "Someone other than the author, with permission
  to approve gate configuration." (governance/GovernanceHowToRead.tsx)
- Approval: "An approval is bound to the content hash and expires. A self-approval, an expired approval or a stale hash is
  refused by the server." → "An approval holds only for the content approved, and it expires. Approving your own draft, an
  expired approval or an approval of content changed since is refused." (governance/GovernanceHowToRead.tsx)
- Site-wide change: "a site-wide or objective / test-permission change needs an approver with the ControlAuthority role" →
  "A site-wide change, or a change to an objective or a test permission, needs an approver with the ControlAuthority role."
  (governance/GovernanceHowToRead.tsx)
- "Every stored window carries these versions in its payload, so any historical verdict can be attributed to the formula that
  produced it." → "Every stored window keeps these versions, so any past verdict can be traced to the formula that produced
  it." (governance/GovernanceHowToRead.tsx)

## Shared-file changes needed (not done: outside the Governance files)

1. **`components/Cpm/config/lifecycle.ts:77`**: the disabled reason "Needs cpm.config.approve (by someone other than the
   author)." shows a permission key on Gate Configuration. Suggestion: use Governance's `APPROVE_RULE` words, and update
   `config/lifecycle.test.ts:35` and `config/GateConfigurationWrites.test.tsx:128`. The cross-file "word for word" test in
   `CpmGovernance.test.tsx` was replaced by a plain-words check. Once lifecycle.ts carries the same words, re-add
   `expect(readFileSync(join(__dirname, 'config', 'lifecycle.ts'), 'utf8')).toContain(APPROVE_RULE)`.
2. **`components/Cpm/config/ApprovalTab.tsx:71`**: "An approval is bound to the content hash and expires. A self-approval, an
   expired approval or a stale hash is refused by the server." Same suggestion: use `APPROVAL_BINDS`, then re-add its parity
   line.
3. **cplm-api `Services/Config/ConfigStore.cs:225`**: the refusal text is unchanged. Governance no longer quotes it. If Gate
   Configuration shows that refusal raw to the user, that is a separate cleanup.
4. **auth-service `src/rbac/permission-catalog.ts:82`** and the seeds (`database/scripts/33_cpm_permissions.sql`,
   `src/services/auth-service/database/schema.sql`): "Onboard and configure control loops (CPLM)" should drop "(CPLM)".
   Governance strips a trailing acronym meanwhile; Administration › Roles still shows it.
5. **`styles/cpm-audit.css:63`**: `.cpm-gov-trace__foot` is now unused (it was the Build details foot). `.cpm-events-record` /
   `.cpm-events-copy` were also used by Governance's Record details. Check whether Loop Events still uses them before removing.
6. **`components/Cpm/shared.tsx:378` `QueryError`** prints `error.message`. That is the server's detail whenever one is sent:
   `apiFetch.friendlyHttpMessage` returns the detail first. This leaks backend text app-wide. Governance now uses its own
   `governance/ReadFailed.tsx`. Suggestion: QueryError shows a fixed plain copy, or the status-based friendly message without
   the detail.

## Tests (TDD)

- Red first: the new `plainWords.test.tsx` and the updated assertions in the 8 existing Governance test files failed **46 of 93**
  before any source change. The failed-read test was added later and was red, on "Npgsql" from the server detail, before
  `ReadFailed` existed.
- Green: `npx vitest run src/components/Cpm/governance src/components/Cpm/CpmGovernance` gives 10 files, 94 tests passing.
- New or replaced tests:
  - `plainWords.test.tsx` (5): the whole-page sweep; the Verify answers; Approvals, Duties and Traceability with How to read;
    failed reads on every tab; no permissions.
  - AuditTrail: no Record details; GUID actor → Unknown user with the id nowhere; the signed-in person by name; Find by name or
    login; tooltip in words; a deployment by type only.
  - AuditEventPanel: Unknown user; the person by name; no Record details; an id-only entity → no Entity row.
  - auditCatalog: new labels; unknown codes without the service; actor by session; null names.
  - VerifyDialog: intact; changed or unfinished; no permission; not completed; checking.
  - DutiesTab: names, not keys; aria; "(CPLM)" dropped; catalog fallback.
  - ApprovalsTab: site name, profile words, author name, no key.
  - ChangeTraceability: no engine, build, commit or jar; profile words.
  - CpmGovernance: How to read has no key, hash or server on any tab.
- `npx tsc --noEmit`: clean. `npx eslint <governance files> --max-warnings 0`: clean. `npm run lint:theme`: 0 matches.
- **Note:** the two registry-link expectations (`/cpm/registry/FIC00701`, `/cpm/registry/OLD1`) pass only with CHG-201's
  `cpaHref.ts` change, which is still uncommitted in the worktree. At `e853c25a` alone those 2 tests fail until CHG-201 lands,
  as agreed with the coordinator.

## Concerns

1. **The raw record is no longer on screen anywhere**: event id, entity id, correlation id, hash. No audit export exists. An
   auditor who needs them must use `GET /api/audit` through the gateway (`admin.audit.view`) or the WORM daily archive, which is
   opt-in and not configured. If the owner wants a user-facing path, an "Export CSV" on the trail, carrying these columns, is
   the natural follow-up.
2. **Entities known only by an id now show their type alone**: data sources, displays, users, models, and bundles or
   deployments for users without `cpm.config.read`. So two "Data source tested" rows look the same. Names would need a lazy
   read per type (ingestion data sources, display-service, users), as `useConfigNames` already does for bundles. Not done:
   the brief asks for no new requests for names.
3. **Display names cover only the signed-in person**, taken from the session. Everyone else shows their login. Giving everyone
   a display name needs a users read, which is a new request.
4. **The approval rules no longer match Gate Configuration word for word** until shared items 1-2 are applied.
5. **Permission keys are gone from Separation of duties.** Final-test #26 had left this "owner to confirm". Administration ›
   Roles still shows the keys.
6. **Shared git index**: the CHG-201 agent had 7 registry deletions staged (`LoopActions.tsx`, `LoopPanel*`, `LoopReadiness.tsx`,
   `SignalMapping.tsx`, `loopPanelFacts*`). I committed with `git commit --only -- <my paths>`, so they are not in `e853c25a`
   and are still staged for that agent.
7. Browser check not done (per the brief). This report is not committed; it is left for the records commit.
