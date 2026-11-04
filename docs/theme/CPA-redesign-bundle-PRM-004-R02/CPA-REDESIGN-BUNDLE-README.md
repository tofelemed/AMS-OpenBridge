# CPA redesign — Claude Code bundle (PRM-004 R02)

Unzip at the **repository root**. The files land in the paths that CPA-UI-PRM-004 R02 §2 checks.

## 1. In this bundle

| File | Repository path |
|---|---|
| Programme brief R03 | `docs/theme/TRV-UI-BRF-001.md` |
| Decision record 1 | `docs/theme/CPA-UI-DEC-001-R01.md` |
| Decision record 2 | `docs/theme/CPA-UI-DEC-002-R01.md` |
| Redesign specification | `docs/theme/CPA-UI-SPEC-001-R01.md` |
| Superseded migration prompt (needed for its mapping and gates) | `docs/theme/CPA-UI-PRM-002-R01.md` |
| **Redesign prompt** | `docs/theme/CPA-UI-PRM-004-R02.md` |

## 2. Add these yourself (not in the bundle)

| File | Repository path | Check |
|---|---|---|
| Traverse UI Design and Development Guide R01 (PDF) | `docs/design/Traverse_UI_Design_and_Development_Guide_R01.pdf` | 30 pages |
| `traverse-design-system` skill **R1.2**, complete, from your skill zip | `.claude/skills/traverse-design-system/` (replace the R1.1 folder) | `SKILL.md` and `references/tokens.css` both say R1.2; `references/tokens.json` is present |

## 3. Already in the repository (from the two analyses)

These are left as they are; the prompt reads them:
- `docs/theme/cpa-currenttheme.md`
- `docs/theme/deep/`
- `docs/theme/tools/`
- `.claude/skills/openbridge/`

## 4. Environment variables

These are needed for the evidence runs. Never put them in a file.

```
CPA_BASE_URL          CPA_USER          CPA_PASSWORD
CPA_SUPER_USER        CPA_SUPER_PASSWORD
CPA_VIEWER_USER       CPA_VIEWER_PASSWORD     (low-privilege account, for restricted states)
```

## 5. Prompt to paste into Claude Code

```
Read docs/theme/CPA-UI-PRM-004-R02.md in full and execute it.

Start with Phase 0 step 0: commit all current work (with the stated exclusions),
push it, create and push the backup branch and tag, verify them with
git ls-remote, then create and push feat/cpa-redesign. If the backup cannot be
verified on the remote, stop and report; do nothing else.

Then complete the rest of Phase 0 and stop at checkpoint R0. Do not start
Phase 1 until I approve R0. At every later checkpoint, stop and wait for approval.
```
