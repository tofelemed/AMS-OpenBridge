# CPA redesign plan (CPA-UI-PRM-004 R02)

Status: Phase 0 stopped at the §2 document check. Sections after §0 are written once skill R1.2 is in place.

## 0. Backup record (Phase 0 step 0)

| Item | Value |
|---|---|
| Remote | `origin`, https://github.com/tofelemed/AMS-OpenBridge.git |
| Starting branch | `feat/v25-next-release` |
| Starting commit | `0b081f4d`, 19 commits ahead of `origin/feat/v25-next-release` |
| Starting working tree | 135 entries in `git status --porcelain=v1 -uall` |
| Backup commit | `279c48552432c2a8afb0a62e16def435f5da404e` |
| Backup branch | `backup/cpa-pre-redesign-20261104` |
| Backup tag | `backup/cpa-pre-redesign-20261104` (annotated, object `309dcdbdc879c1f73214264b6f6ac0f5866eecd7`) |
| Working branch | `feat/cpa-redesign`, created from the backup commit, upstream set |
| Working tree for the redesign | `D:/HMI_Project_Usama/AMS-open-redesign` (separate worktree) |
| Evidence archive | `D:/HMI_Project_Usama/cpa-theme-evidence-20261104.zip`, 1,079 files, 168.9 MB, integrity test passed |

**Verified with `git ls-remote origin`:**

| Ref | Hash |
|---|---|
| Local `HEAD` | `279c48552432c2a8afb0a62e16def435f5da404e` |
| `refs/heads/feat/v25-next-release` | `279c48552432c2a8afb0a62e16def435f5da404e` |
| `refs/heads/backup/cpa-pre-redesign-20261104` | `279c48552432c2a8afb0a62e16def435f5da404e` |
| `refs/tags/backup/cpa-pre-redesign-20261104^{}` | `279c48552432c2a8afb0a62e16def435f5da404e` |
| `refs/heads/feat/cpa-redesign` | `279c48552432c2a8afb0a62e16def435f5da404e` |

**Deviations from the step text.**

- A branch and a tag with one name make `git push origin <name>` ambiguous, so both were pushed by full ref path.
- `feat/cpa-redesign` lives in a separate worktree, not by switching `AMS-open`, because another session works in that folder on `feat/v25-next-release`. Its next commit would otherwise land on the redesign branch.

**Files left out of the commit (paths only).** Secret-type files, all covered by `.gitignore`: `infra/docker/.env`, `migration/.env`, `src/services/auth-service/.env`, `src/services/auth-service/keys/jwt-private.pem`, `src/services/auth-service/keys/jwt-public.pem`. Generated evidence: `docs/theme/**/screenshots/`, `docs/theme/**/annotated/`, `**/.tooling/`. `docs/theme/CPA-redesign-bundle-PRM-004-R02.zip` is covered by the existing `*.zip` rule; its contents are committed.

**Secrets scan of the staged content.** 11 values from `infra/docker/.env`, plus the supplied lab password, compared against all 131 files, with JWT, private-key, bearer-token and AWS patterns. Two false positives: `KEYCLOAK_HOSTNAME` is a host name, and `TLS_CERT_PASSWORD` is the literal word "password", which matches ordinary text. No other findings.

**Work from another session included in this commit.** `changes_tracker.md`, `prod_decision.md`, `migration/.env.example`, `migration/IOTDB-LOOP-TREE-MOVE.md`, `migration/iotdb-move-loop-tree.py`, `migration/iotdb_move_v2.py`, `tests/ops/test_iotdb_move_v2.py`: the in-progress IoTDB move. They were in the working tree, so the "commit everything" instruction covers them.

### Committed files (131)

| Status | Path |
|---|---|
| A | `.claude/skills/traverse-design-system/SKILL.md` |
| A | `.claude/skills/traverse-design-system/references/acceptance.md` |
| A | `.claude/skills/traverse-design-system/references/components.md` |
| A | `.claude/skills/traverse-design-system/references/contrast-report.md` |
| A | `.claude/skills/traverse-design-system/references/shadcn-bridge.css` |
| A | `.claude/skills/traverse-design-system/references/shadcn-bridge.geometry.css` |
| A | `.claude/skills/traverse-design-system/references/tokens.css` |
| A | `.claude/skills/traverse-design-system/references/tokens.json` |
| A | `.claude/skills/traverse-design-system/scripts/contrast.py` |
| M | `.gitignore` |
| A | `Traverse_UI_Design_and_Development_Guide_R01.pdf` |
| M | `changes_tracker.md` |
| A | `docs/theme/CPA-UI-DEC-002-R01.md` |
| A | `docs/theme/CPA-UI-PRM-004-R02.md` |
| A | `docs/theme/CPA-UI-SPEC-001-R01.md` |
| A | `docs/theme/CPA-redesign-bundle-PRM-004-R02/CPA-REDESIGN-BUNDLE-README.md` |
| A | `docs/theme/CPA-redesign-bundle-PRM-004-R02/docs/theme/CPA-UI-DEC-001-R01.md` |
| A | `docs/theme/CPA-redesign-bundle-PRM-004-R02/docs/theme/CPA-UI-DEC-002-R01.md` |
| A | `docs/theme/CPA-redesign-bundle-PRM-004-R02/docs/theme/CPA-UI-PRM-002-R01.md` |
| A | `docs/theme/CPA-redesign-bundle-PRM-004-R02/docs/theme/CPA-UI-PRM-004-R02.md` |
| A | `docs/theme/CPA-redesign-bundle-PRM-004-R02/docs/theme/CPA-UI-SPEC-001-R01.md` |
| A | `docs/theme/CPA-redesign-bundle-PRM-004-R02/docs/theme/TRV-UI-BRF-001.md` |
| A | `docs/theme/TRAVERSE_UI_PROGRAMME_BRIEF.md` |
| A | `docs/theme/cpa-currenttheme.md` |
| A | `docs/theme/cpa-text-audit-by-route.md` |
| A | `docs/theme/data/css-custom-properties.json` |
| A | `docs/theme/data/source-inventory.json` |
| A | `docs/theme/data/tables/axe.md` |
| A | `docs/theme/data/tables/axeTotals.json` |
| A | `docs/theme/data/tables/colourGroups.md` |
| A | `docs/theme/data/tables/colourWorst.md` |
| A | `docs/theme/data/tables/density.md` |
| A | `docs/theme/data/tables/densityStats.json` |
| A | `docs/theme/data/tables/geometry.json` |
| A | `docs/theme/data/tables/keyboard.md` |
| A | `docs/theme/data/tables/keyboardSamples.json` |
| A | `docs/theme/data/tables/lineCounts.json` |
| A | `docs/theme/data/tables/noRing.json` |
| A | `docs/theme/data/tables/renderedSizes.json` |
| A | `docs/theme/data/tables/repeated.md` |
| A | `docs/theme/data/tables/routes.md` |
| A | `docs/theme/data/tables/states.md` |
| A | `docs/theme/data/tables/statesBlocked.json` |
| A | `docs/theme/data/tables/statesSkipped.json` |
| A | `docs/theme/data/tables/text-byRoute.md` |
| A | `docs/theme/data/tables/text-changes.md` |
| A | `docs/theme/data/tables/text-constraint-check.json` |
| A | `docs/theme/data/tables/text-projection.md` |
| A | `docs/theme/data/tables/text-summary.json` |
| A | `docs/theme/data/tables/text-top20.md` |
| A | `docs/theme/data/tables/tokenFamilies.json` |
| A | `docs/theme/data/tables/topTokens.json` |
| A | `docs/theme/deep/behaviour.md` |
| A | `docs/theme/deep/component-fit.md` |
| A | `docs/theme/deep/conformance-matrix.md` |
| A | `docs/theme/deep/content-audit-v2.md` |
| A | `docs/theme/deep/cpa-deep-analysis.md` |
| A | `docs/theme/deep/data-states.md` |
| A | `docs/theme/deep/data/component-fit.json` |
| A | `docs/theme/deep/data/component-inventory.json` |
| A | `docs/theme/deep/data/component-states.json` |
| A | `docs/theme/deep/data/content-audit-v2.json` |
| A | `docs/theme/deep/data/deny-list.json` |
| A | `docs/theme/deep/data/hidden-surfaces.md` |
| A | `docs/theme/deep/data/openbridge-fit-probe.json` |
| A | `docs/theme/deep/data/openbridge-internals.json` |
| A | `docs/theme/deep/data/reflow.json` |
| A | `docs/theme/deep/data/report-summary.json` |
| A | `docs/theme/deep/data/source-surfaces.json` |
| A | `docs/theme/deep/data/task-summary.json` |
| A | `docs/theme/deep/data/task-walks.json` |
| A | `docs/theme/deep/discrepancies.md` |
| A | `docs/theme/deep/help-registry-draft.md` |
| A | `docs/theme/deep/metric-lineage.json` |
| A | `docs/theme/deep/metric-lineage.md` |
| A | `docs/theme/deep/surface-inventory.json` |
| A | `docs/theme/deep/surface-inventory.md` |
| A | `docs/theme/deep/task-flows.md` |
| A | `docs/theme/deep/tools/conformance/build.py` |
| A | `docs/theme/deep/tools/conformance/cells_cpa.py` |
| A | `docs/theme/deep/tools/conformance/cells_g.py` |
| A | `docs/theme/deep/tools/conformance/template.md` |
| A | `docs/theme/tools/.gitignore` |
| A | `docs/theme/tools/annotate-screens.mjs` |
| A | `docs/theme/tools/annotate-v2.mjs` |
| A | `docs/theme/tools/capture-screens.mjs` |
| A | `docs/theme/tools/capture-states.mjs` |
| A | `docs/theme/tools/component-fit-render.mjs` |
| A | `docs/theme/tools/component-inventory.mjs` |
| A | `docs/theme/tools/component-states.mjs` |
| A | `docs/theme/tools/crawl-surfaces.mjs` |
| A | `docs/theme/tools/lib/colour-rules.mjs` |
| A | `docs/theme/tools/lib/component-ratings.mjs` |
| A | `docs/theme/tools/lib/dom-metrics.mjs` |
| A | `docs/theme/tools/lib/dom-surfaces.mjs` |
| A | `docs/theme/tools/lib/entries.mjs` |
| A | `docs/theme/tools/lib/guard.mjs` |
| A | `docs/theme/tools/lib/import-graph.mjs` |
| A | `docs/theme/tools/lib/routes.mjs` |
| A | `docs/theme/tools/lib/session.mjs` |
| A | `docs/theme/tools/lib/states.mjs` |
| A | `docs/theme/tools/lib/surfaces-api.mjs` |
| A | `docs/theme/tools/lib/surfaces-core.mjs` |
| A | `docs/theme/tools/lib/surfaces-data.mjs` |
| A | `docs/theme/tools/lib/surfaces-deny.mjs` |
| A | `docs/theme/tools/lib/surfaces-hidden-facts.mjs` |
| A | `docs/theme/tools/lib/surfaces-jsx.mjs` |
| A | `docs/theme/tools/lib/surfaces-report.mjs` |
| A | `docs/theme/tools/lib/surfaces-routes.mjs` |
| A | `docs/theme/tools/lib/surfaces-url.mjs` |
| A | `docs/theme/tools/lib/tasks.mjs` |
| A | `docs/theme/tools/lib/text-rules-v2.mjs` |
| A | `docs/theme/tools/lib/text-rules.mjs` |
| A | `docs/theme/tools/lineage.mjs` |
| A | `docs/theme/tools/obc-fit-probe.mjs` |
| A | `docs/theme/tools/obc-internals.mjs` |
| A | `docs/theme/tools/reflow-capture.mjs` |
| A | `docs/theme/tools/report-tables.mjs` |
| A | `docs/theme/tools/source-inventory.mjs` |
| A | `docs/theme/tools/source-surfaces.mjs` |
| A | `docs/theme/tools/surface-report.mjs` |
| A | `docs/theme/tools/task-report.mjs` |
| A | `docs/theme/tools/task-walk.mjs` |
| A | `docs/theme/tools/text-audit-v2.mjs` |
| A | `docs/theme/tools/text-audit.mjs` |
| M | `migration/.env.example` |
| M | `migration/IOTDB-LOOP-TREE-MOVE.md` |
| M | `migration/iotdb-move-loop-tree.py` |
| A | `migration/iotdb_move_v2.py` |
| M | `prod_decision.md` |
| A | `tests/ops/test_iotdb_move_v2.py` |

## 1. Reading record

Not started. §2 of the prompt stopped at skill R1.2.

| Document | Path | State |
|---|---|---|
| Guide R01 | `docs/design/Traverse_UI_Design_and_Development_Guide_R01.pdf` | Placed, 30 pages |
| Skill R1.2 | `.claude/skills/traverse-design-system/` | **Missing: `SKILL.md` and `references/tokens.css` say R1.1** |
| Programme brief R03 | `docs/theme/TRV-UI-BRF-001.md` | Placed from the bundle |
| DEC-001 R01 | `docs/theme/CPA-UI-DEC-001-R01.md` | Placed from the bundle |
| DEC-002 R01 | `docs/theme/CPA-UI-DEC-002-R01.md` | Present |
| SPEC-001 R01 | `docs/theme/CPA-UI-SPEC-001-R01.md` | Present |
| PRM-002 R01 | `docs/theme/CPA-UI-PRM-002-R01.md` | Placed from the bundle |
| PRM-004 R02 | `docs/theme/CPA-UI-PRM-004-R02.md` | Present |
| Analyses | `docs/theme/cpa-currenttheme.md`, `docs/theme/deep/` | Present |
| OpenBridge skill | `.claude/skills/openbridge/SKILL.md` | Present |
