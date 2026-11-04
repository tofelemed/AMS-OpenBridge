# CPA redesign: decision log

Decisions made while executing CPA-UI-PRM-004 R02. The owner's instruction of 2026-11-04: proceed phase by phase, take the recommended option, do not do anything destructive, and record each decision here.

Governing order when documents conflict: Guide, skill, brief, DEC-001, DEC-002, SPEC-001.

| ID | Date | Phase | Decision | Why | Reversible? |
|---|---|---|---|---|---|
| UI-001 | 2026-11-04 | 0 | Keep the first backup refs at `279c4855`. Add a second backup, `backup/cpa-pre-redesign-20261104-r2`, holding skill R1.2, the placed documents and `plan.md` §0 | The owner asked for these in the backup, and prompt rule 11 forbids moving a backup branch or tag | Yes, additive |
| UI-002 | 2026-11-04 | 0 | Skill R1.2 lives on `feat/cpa-redesign` in the worktree `AMS-open-redesign`. `AMS-open` keeps R1.1 until the branch merges | Rule 11: work only on `feat/cpa-redesign`. Another session works in `AMS-open` | Yes |
