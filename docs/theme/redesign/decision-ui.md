# CPA redesign: decision log

Decisions made while executing CPA-UI-PRM-004 R02. The owner's instruction of 2026-11-04: proceed phase by phase, take the recommended option, do not do anything destructive, and record each decision here.

Governing order when documents conflict: Guide, skill, brief, DEC-001, DEC-002, SPEC-001.

| ID | Date | Phase | Decision | Why | Reversible? |
|---|---|---|---|---|---|
| UI-001 | 2026-11-04 | 0 | Keep the first backup refs at `279c4855`. Add a second backup, `backup/cpa-pre-redesign-20261104-r2`, holding skill R1.2, the placed documents and `plan.md` §0 | The owner asked for these in the backup, and prompt rule 11 forbids moving a backup branch or tag | Yes, additive |
| UI-002 | 2026-11-04 | 0 | Skill R1.2 lives on `feat/cpa-redesign` in the worktree `AMS-open-redesign`. `AMS-open` keeps R1.1 until the branch merges | Rule 11: work only on `feat/cpa-redesign`. Another session works in `AMS-open` | Yes |
| UI-003 | 2026-11-04 | 0 | Change-tracker entries for this package use the block CHG-110 to CHG-118, one per phase (Phase 0 = CHG-110). CHG-104 to CHG-109 stay free | Other sessions take numbers from 104 on `feat/v25-next-release`; a separate block avoids a clash at merge | Yes |
| UI-004 | 2026-11-04 | 0 | **CD21 approved under the owner's rule: hide `/admin/system`.** Apply in Phase 6 with Administration | Recommended by DEC-001. The page shows illustrative values, and hiding it is a one-line change that removes nothing | Yes, one line |
| UI-005 | 2026-11-04 | 0 | **RD13 guard corrections not applied.** Permission checks stay exactly as they are. A refused route shows "Not available for your role" instead of a silent redirect | Changing who can reach a page is a security decision and prompt §1 puts permission-model changes out of scope. The restricted message changes no access | n/a |
| UI-006 | 2026-11-04 | 0 | **Role description gets an explicit Save** in Phase 6, replacing PUT on change | SPEC 5.7 recommends it. It only adds a step before a write, and no data or access changes | Yes |
| UI-007 | 2026-11-04 | 0 | Checkpoints R0 to R7 no longer pause for approval, per the owner's instruction. Each is still reported and recorded. **The R5 control-engineer review is still required before release**; it is logged as pending, and work continues on the branch | The owner asked to continue phase by phase. Nothing ships from this branch (RD15), so continuing cannot bypass the review | Yes |
| UI-008 | 2026-11-04 | 0 | Phase commits use the `redesign(phase-N):` prefix. A commit may follow the phase commit when a test or record needs correcting, rather than rewriting history | Rule 11 forbids rewriting pushed history | n/a |
| UI-009 | 2026-11-04 | 0 | A commit must follow a passing test run. The Phase 0 login commit `ee666af8` carried a failing test; the next commit fixes it | Found by reading the output. The commit helper did not check the test result | n/a |
