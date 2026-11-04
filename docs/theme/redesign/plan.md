# CPA redesign plan (CPA-UI-PRM-004 R02)

Status: Phase 0 complete. Later phases record their progress in the phase reports and `decision-ui.md`.

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

### Second backup (decision UI-001)

The owner asked for skill R1.2, the placed documents and this section to go into the backup. Rule 11 forbids moving the first backup, so a second one was added.

| Item | Value |
|---|---|
| Backup commit | `4e05e6090cca76eeb91188e0a71b3381d6f125e0` on `feat/cpa-redesign` |
| Backup branch | `backup/cpa-pre-redesign-20261104-r2` |
| Backup tag | `backup/cpa-pre-redesign-20261104-r2` (annotated, object `862a262a61ea7c7a9eb436d4aebdc74ebec81e52`) |
| Verified with `git ls-remote` | Branch, tag (peeled) and `feat/cpa-redesign` all resolve to `4e05e609` |

## 1. Reading record

All §2 documents are present. Skill checks run on the worktree copy:

| Check | Result |
|---|---|
| `SKILL.md` and `references/tokens.css` state R1.2 | Yes |
| `references/tokens.json` present; `python scripts/tokens_json.py . --check` | 122 values compared, 74 hex, 0 mismatches |
| `python scripts/contrast.py` | 126 pairings, 121 pass, 5 documented exceptions; minimum text 4.587, minimum non-text 3.153 |
| Skill against the guide PDF pp.3-5 (`docs/theme/tools/skill-vs-pdf.py`) | **74 compared, 0 mismatches**: [evidence/phase-0/skill-vs-pdf.md](evidence/phase-0/skill-vs-pdf.md) |

Read in full: DEC-001, DEC-002, SPEC-001, PRM-002, PRM-004, skill `SKILL.md` and `components.md`. Guide pp.1-7, 11-13 and 26-29 were read directly. Guide pp.8-10, 14-25 and 30 were read during the PRM-003 Part H pass, and their suite pattern is in `deep/conformance-matrix.md` §1.

The guide states a lowest non-text ratio of 3.093 and 94 pairings (p.5); the skill's wider set reports 3.153 and 126. They measure different pairing sets and no token value differs, so this is not a conflict.

## 2. Inventory deltas

[evidence/phase-0/inventory-deltas.md](evidence/phase-0/inventory-deltas.md). Against the analysis: live files 322 → 324 (the focus helper and `PermissionCheckbox`), one native input added, one `ObcCheckbox` removed. No colour count changed.

## 3. Baselines

| Check | Baseline at `4e05e609` |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npm run lint` | 0 findings |
| `npm test` | 112 files, 539 tests, all pass |

## 4. Lab fitness (PRM-003 rule)

Measured 2026-11-04 14:43 UTC: 243 loops, 10 evaluated within their window (4 %), 78 never evaluated, 0 current findings. **The rule is not met.** Development continues; Phase 8 acceptance needs the rule met or is recorded as conditional (DEC-002 Q-A).

## 5. Files and components per phase

| Phase | New | Changed |
|---|---|---|
| 1 | `styles/traverse-tokens.css`, `styles/openbridge-bridge.css`, `styles/tones.css`, `theme/theme.ts`, `theme/ThemeContext.tsx`, `charts/chartTheme.ts`, `scripts/theme/check-tokens.mjs`, `scripts/theme/contrast.mjs`, `components/Designer/trend/trend.css` | `index.html`, `main.tsx`, `App.tsx`, `designTokens.css`, `useObcTheme.ts`, 11 chart components, `package.json`, `CLAUDE.md`. Dead stylesheets deleted |
| 2 | `ui/shell/*`, `cpa/context.ts`, `cpa/redirects.ts`, `scripts/redesign/check-redirects.mjs`, `check-geometry.mjs` | `App.tsx`, `cpaHref.ts`, `cpmTasks.ts`, `navItems.ts`, `plantScope.tsx` |
| 3 | `ui/` components of SPEC 6.2-6.16, `help/registry.ts`, `docs/theme/redesign/components.md`, gallery route | 19 files replacing the nine OpenBridge types |
| 4 | `pages/cpa/overview/*`, `performance/*`, `episodes/*`, `scripts/redesign/check-a11y.mjs` | Router |
| 5 | `pages/cpa/loop/*` | Router, redirects |
| 6 | `pages/cpa/evidence/*`, `setup/*`, `system/*`, `trend/*`, `login/*` | `Administration/*`, redirects |
| 7 | None | Pages: toggletips, `title` removal, content, T12 |
| 8 | `README.md`, `geometry-deviations.md`, `acceptance-record.md` | Old pages removed after the import graph clears them |

## 6. Component build order

Each depends only on those before it.

1. Tokens, bridge, `chartTheme.ts` (Phase 1).
2. AppShell, ContextHeader (Phase 2).
3. Buttons, form controls, SegmentedControl, Tabs.
4. StatusBadge, DataState, TechnicalDetails.
5. Dialog, Inspector, Toggletip with the help registry.
6. MetricSummary, DataTable, AssetPicker.
7. TrendPanel, last because it uses the rest.

## 7. Redirect implementation

- `cpa/redirects.ts` holds one pure function per row of SPEC §2.3: old path and search in, new path and search out. Unlisted parameters carry unchanged.
- Each old `<Route>` renders a `RedirectTo` element that calls it with `replace`, gated by a per-row switch turned on in the phase that ships the destination.
- `scripts/redesign/check-redirects.mjs` runs every row, parameters included, against the pure functions. The gate runs without a browser, so it stays fast.

## 8. Current components each destination consumes

| Destination | Consumes |
|---|---|
| Overview | `CpmOverview`, `overview/*`, `CpmKpiDrilldown`, `kpi/*` |
| Performance | `CpmPerformance`, `GateMatrix`, `GateMatrixChecks`, `GateRollup`, `AttentionList`, `GateEvidencePanel`, `GateLegend` |
| Episodes | `CpmEvents`, `events/*` |
| Loop | `CpmExplorer`, `explorer/*`, `CpmHistorical`, `historical/*`, `CpmInvestigation`, `investigation/*`, `health/*`, `response/*`, `trend/*` |
| Evidence | `evidence/*`, `CpmReplay`, `replay/*`, `CpmWindows`, `windows/*`, `CpmCalculations`, `CalcDrawer` |
| Setup | `LoopRegistry`, `registry/*`, `ProfileAside`, `AddLoopWizard`, `BulkImportDialog`, `config/*` |
| System | `CpmPipeline`, `CpmGovernance`, `Administration/*` |
| Tag trend | `Designer/TrendPage`, `TrendCore`, `Designer/trend/*` |

## 9. Label register seed

Started in [label-register.md](label-register.md). Each entry is added in the phase that first renders the label.

## 10. Open items

Recorded as they arise in [decision-ui.md](decision-ui.md).
