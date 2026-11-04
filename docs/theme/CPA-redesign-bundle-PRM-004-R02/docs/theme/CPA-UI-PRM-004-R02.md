# CPA — Redesign to the Traverse Design System

| Field | Value |
|---|---|
| Document ID | CPA-UI-PRM-004 |
| Revision | R02 (supersedes R01 of 2026-11-04; R01 was not run) |
| Date | 2026-11-04 |
| Scope | `src/frontend-ob/` only (React 18, Vite 5, TypeScript, OpenBridge web components 1.0.1, plain CSS, echarts 5.6). No backend, API, engine or database change |
| Supersedes | CPA-UI-PRM-002 R01. Its foundation is Phase 1 here; its login hotfix is in Phase 0 (DEC-002 RD8) |
| Governing documents | Guide R01 · skill R1.2 · TRV-UI-BRF-001 R03 · CPA-UI-DEC-001 R01 · **CPA-UI-DEC-002 R01** · **CPA-UI-SPEC-001 R01** |
| Evidence base | `docs/theme/deep/` (CPA-UI-PRM-003 output), `docs/theme/cpa-currenttheme.md` (CPA-UI-PRM-001 output) |
| Output | Seven destinations, shared components, the shell, help registry, redirects, and evidence under `docs/theme/redesign/` |

**R02 change summary.**
- New Phase 0 step 0: before any change, all current code is committed, pushed and tagged as a verified remote backup.
- Rule 11 now pushes the working branch at the end of every phase.
- The document is placed at `docs/theme/CPA-UI-PRM-004-R02.md`.

---

## 1. Role and objective

You are the frontend engineer delivering a controlled redesign of a production application. Every change must be regression-safe, reviewable, and verified by execution rather than by assertion.

Deliver CPA-UI-SPEC-001:
- the seven destinations (Overview, Performance, Episodes, Loop, Evidence, Setup, System), the tag trend tool and the restyled Administration and Login;
- the shared components of SPEC §6;
- the Traverse token foundation with Day and Night;
- every current function preserved (SPEC §8);
- every old URL redirected (SPEC §2.3);
- the acceptance targets in SPEC §9.

**Out of scope:**
- any change to calculations, thresholds, metric definitions or engine behaviour (DEC-002 RD10);
- any backend or API change;
- any permission-model change (RD13);
- deployment, release planning, site flags and image builds (RD15).

## 2. Documents (check before anything else)

Copy these into the repository and confirm each path. **If any one is missing, stop and report.** Do not reconstruct a document from its name, from a summary, or from memory. The previous analysis ran without DEC-001, PRM-002 and skill R1.2, and had to infer decisions as a result.

| Document | Path |
|---|---|
| Guide R01 (PDF, 30 pages) | `docs/design/Traverse_UI_Design_and_Development_Guide_R01.pdf` |
| Skill **R1.2** (replace the R1.1 copy; `SKILL.md` and `references/tokens.css` must both state R1.2) | `.claude/skills/traverse-design-system/` |
| Programme brief R03 | `docs/theme/TRV-UI-BRF-001.md` |
| Decision record 1 | `docs/theme/CPA-UI-DEC-001-R01.md` |
| Decision record 2 | `docs/theme/CPA-UI-DEC-002-R01.md` |
| Redesign specification | `docs/theme/CPA-UI-SPEC-001-R01.md` |
| Superseded migration prompt (for reuse of its §5 mapping and §6 gates) | `docs/theme/CPA-UI-PRM-002-R01.md` |
| This prompt | `docs/theme/CPA-UI-PRM-004-R02.md` |
| Analyses | `docs/theme/cpa-currenttheme.md`, `docs/theme/deep/` |
| OpenBridge skill (rules only) | `.claude/skills/openbridge/SKILL.md` |

**Reading.**
- Guide: `pages: "1-7"`, `"11-13"`, `"26-30"`, then `"8-10"` and `"14-25"` once, for suite consistency.
- Skill R1.2: `SKILL.md` and every reference file.
- DEC-001, DEC-002 and SPEC-001: in full.
- Deep analysis: `cpa-deep-analysis.md`, `component-fit.md`, `conformance-matrix.md` §3, `task-flows.md`, `discrepancies.md`, `help-registry-draft.md` (structure), `surface-inventory.md`, `data/hidden-surfaces.md`.

Precedence: Guide → skill → brief → DEC-001 → DEC-002 → SPEC-001. A conflict between two of them is a checkpoint C3; do not choose silently.

## 3. Non-negotiable rules

1. **Meaning is preserved.**
   - No calculation, threshold, eligibility rule or definition text changes.
   - Labels follow DEC-002 RD10; every label choice goes into `docs/theme/redesign/label-register.md` with the concept ID (`M-###`), the labels in use today and the one chosen.
   - Toggletip content is seeded **verbatim** from `docs/theme/deep/help-registry-draft.md`.
   - Only the four display defects in RD11 (D-08, D-15, D-20, D-39) are corrected.
2. **Function is preserved.**
   - Every row of SPEC §8 stays reachable, with the same data and the same permission.
   - A function with no home, or data the API does not provide (for example a per-row coverage figure), is a C3.
   - Never compute a new figure in the frontend to fill a gap.
3. **No fabricated data.** No placeholder, sample or illustrative value is rendered. Test fixtures stay in tests.
4. **Tokens only.** Colour comes from `styles/traverse-tokens.css` through the bridge and the shared components (CD5, PRM-002 §4). Status uses StatusBadge (CD8). Charts use `chartTheme.ts` through TrendPanel (CD12).
5. **Components.**
   - The nine OpenBridge types listed in DEC-002 RD2 are not used after Phase 3.
   - `ObcButton` and the passive OpenBridge parts stay.
   - `@oicl/openbridge-webcomponents` is pinned to exactly `1.0.1`.
   - No new UI library, icon library or chart library is added.
6. **Context.** Every CPA link is built with `cpaHref` and carries plant scope, loop, range and window (SPEC §2.2). One time zone per page: the site zone, labelled (RD5).
7. **Content.** SPEC §4 applies. Units, data-state labels, coverage, time zone, source and errors are never removed. Any text change that touches safety context is listed for the R5 control-engineer review.
8. **Read-only evidence runs.**
   - Every automated capture, crawl and task walk runs with the PRM-003 guard (`docs/theme/tools/lib/guard.mjs`) and its deny-list.
   - Write paths are verified by tests that mock the API, using the repository's existing test tooling. If no tooling mocks the API, raise C3; do not add a dependency without approval.
   - Manual writes against the shared lab need the owner's approval each time.
9. **Files.**
   - New components go in `src/frontend-ob/src/ui/` and new pages in `src/frontend-ob/src/pages/cpa/`.
   - New files stay under the project's 500-line limit.
   - Existing files over the limit are not split unless a phase rebuilds them.
10. **Credentials** come only from `CPA_BASE_URL`, `CPA_USER`, `CPA_PASSWORD`, `CPA_SUPER_USER`, `CPA_SUPER_PASSWORD`, `CPA_VIEWER_USER` and `CPA_VIEWER_PASSWORD`. Never write them to a file, log, manifest or image name.
11. **Change control.**
    - Work only on `feat/cpa-redesign` (created in Phase 0 step 0).
    - One commit per phase, prefixed `redesign(phase-N):`, with one change-tracker entry (CHG) in the file's existing format.
    - At the end of every phase, push the branch (`git push origin feat/cpa-redesign`, never `--force`) and record the pushed hash in the phase report.
    - Never use `--force`, `--no-verify`, `git reset --hard` on pushed commits or any history rewrite, and never move or delete the backup branch or tag.
    - A phase is complete only when every §5 gate passes and its output is pasted into the phase report.

## 4. Approach

Build the destinations beside the current pages, then switch each old route to its redirect in the phase that ships its destination:
- old route components remain until Phase 8;
- they are deleted only after the import graph shows no live use and the redirect test passes;
- at no commit may a current function be unreachable.

## 5. Gates (every phase; paste the output)

```bash
cd src/frontend-ob
npx tsc --noEmit                          # baseline from Phase 0: no new errors
npm run lint                              # baseline: no new findings
npm test --if-present                     # all pass
npm run build
npm run lint:theme                        # §5.1
node scripts/theme/contrast.mjs           # 121/126 + CPA chart pairings (PRM-002 §6); exit 0
node ../../docs/theme/tools/obc-fit-probe.mjs --assert   # ObcButton variables and parts still present (RD2)
node scripts/redesign/check-redirects.mjs # SPEC §2.3, every row, parameters included (from Phase 2)
node scripts/redesign/check-a11y.mjs      # axe on destinations built so far, both themes: 0 critical, 0 serious (from Phase 4)
node scripts/redesign/check-geometry.mjs  # RD9 measurements on destinations built so far (from Phase 2)
```

### 5.1 `lint:theme` (live files only, TypeScript AST, tests excluded)

| Gate | Rule | Active from |
|---|---|---|
| T1–T6 | As PRM-002 §6: colour literals, `var()` literal fallbacks, inline literal colours, `--traverse-*` definitions outside the token file, collided semantic variables (`--alert-*`, `--ams-pen-*`, `--ams-crit`, `--cpm-tone-*`) outside the bridge and StatusBadge, theme attribute access outside the theme module | T4, T6: Phase 1. T1–T3: Phase 1 for `src/ui/` and `src/pages/cpa/`, and for the whole live set in Phase 8. T5: Phase 3 |
| T7 | `bright` as a theme value | Phase 1; removed in Phase 8 |
| T8 | `title=` on elements in `src/ui/` and `src/pages/cpa/`. Use `aria-label` for names and the Toggletip for definitions | Phase 3 |
| T9 | The tags of the nine replaced OpenBridge types (ten tags: `ObcToggleButtonGroup`, `ObcToggleButtonOption`, `ObcTextInputField`, `ObcTabRow`, `ObcFilterChip`, `ObcAccordionItem`, `ObcCheckbox`, `ObcDropdownButton`, `ObcPagination`, `ObcInputChip`) in live code | Phase 3 for new code; whole live set in Phase 8 |
| T10 | `echarts.init`, `ReactECharts` or `echarts-for-react` outside `src/ui/trend/` | Phase 3 for new code; whole live set in Phase 8 |
| T11 | Literal `"/cpm…"` paths in links or `navigate()` outside `cpaHref` and the redirect table | Phase 2 for new code; whole live set in Phase 8 |
| T12 | Internal-class patterns (`docs/theme/deep/data/content-audit-v2.json` patterns plus DEC-001 R2) in rendered strings in `src/pages/cpa/` for Overview, Performance, Episodes, Loop and Evidence, outside `TechnicalDetails` | Phase 7 |

### 5.2 Evidence for every phase

- Production build served by `npx vite preview` (or the built image), with the correct historian prefix.
- Screenshots of the affected surfaces in **Day and Night** at 1440 × 1024, plus 1280 × 800 and 1024 × 768 for new destinations.
- The computed-style check for the bridge (PRM-002 §6).
- Store everything under `docs/theme/redesign/evidence/phase-N/`.

## 6. Phases

### Phase 0 — Prerequisites, plan and live defects (stop at R0)

**Step 0 — Backup before any change.** Nothing else in this prompt starts until this step has succeeded and the remote copy is verified.

1. Record the starting state: `git remote -v` (report the URL without credentials), `git branch --show-current`, `git log -1 --oneline`, `git status --porcelain=v1 -uall`.
2. **Commit everything not yet committed**, as one commit `chore(backup): snapshot before CPA-UI-PRM-004`, with these exclusions:
   - **Secrets.** Never commit `.env*` (except `.env.example`), `*.pem`, `*.key`, `*.pfx`, `*.p12`, or files holding passwords, tokens or cookies. List them in the report (path only, never contents) and make sure `.gitignore` covers them.
   - **Large generated evidence.** Do not commit `docs/theme/**/screenshots/`, `docs/theme/**/annotated/`, `**/.tooling/`, `node_modules/`, build output, or any single file over 50 MB. Add them to `.gitignore` if they are not already covered. Archive the screenshot and annotated folders outside the repository, as `../cpa-theme-evidence-<yyyymmdd>.zip`, and report its size and path.
   - **Everything else** (source, the analysis Markdown and JSON, the tools under `docs/theme/tools/`, and the governing documents of §2) is committed.

   List every committed file in the report.
3. Push the current branch: `git push origin <current-branch>`. No `--force`.
4. At that commit, create an annotated tag `backup/cpa-pre-redesign-<yyyymmdd>` (message: "Backup before CPA-UI-PRM-004") and a branch with the same name, then push both: `git push origin backup/cpa-pre-redesign-<yyyymmdd>` and `git push origin refs/tags/backup/cpa-pre-redesign-<yyyymmdd>`.
5. **Verify.** `git ls-remote origin` must show the current branch, the backup branch and the backup tag, all resolving to the local `HEAD` hash. Report the four hashes side by side.
6. Create the working branch `feat/cpa-redesign` from the backup commit and push it with upstream (`git push -u origin feat/cpa-redesign`). All later commits go there.
7. **If any step fails, stop and report.** This includes no remote, an authentication failure, a protected branch, a rejecting hook, or an unexplained file in the commit list. Do not continue without a verified remote backup.
8. Record the remote, branch names, tag and hash in `docs/theme/redesign/plan.md` §0.

**Then:**

1. Verify §2. Write the reading record, including the 74-value skill-against-PDF comparison (`docs/theme/redesign/plan.md` §1).
2. Re-run `docs/theme/tools/source-inventory.mjs` and `component-inventory.mjs` at the current commit, and report deltas against the deep analysis (`0b081f4d`).
3. **Complete the function map.** Map each of the 48 source overlays the analysis did not reach (`surface-inventory.md`, "Source overlays not reached") and each hidden surface (`data/hidden-surfaces.md`) to a SPEC §8 home. Write the result to `docs/theme/redesign/function-map.md`. Raise C3 for any overlay or surface with no home.
4. **Live defects (RD12)**, each a separate commit, with a test where one is feasible:
   - Modal footer buttons reachable by Tab: the focus trap must include focusable elements inside shadow roots (`Modal.tsx:57`).
   - Drawers trap focus and return it to the trigger, including `ObcButton` triggers (`useDialogA11y.ts:15-27`, `Modal.tsx:86`).
   - Each permission checkbox is named (`RolesConfig.tsx:264`).
   - Login: remove the IEC 62443 sentence; "Secure sign in" becomes "Sign in" (CD20).
5. Write `docs/theme/redesign/plan.md`:
   - files and components per phase;
   - the component build order;
   - the redirect implementation;
   - a seed of the label register;
   - the list of current page components each destination consumes;
   - the C3 items so far.
6. Record the baselines for `tsc`, lint and tests.
7. Check the lab against the PRM-003 fitness rule and report the result. Development continues either way; Phase 8 acceptance needs the rule met (DEC-002 Q-A).
8. **Stop. Present R0.** Include the two product-owner items: hiding `/admin/system` (CD21), and the guard corrections plus the role-description Save behaviour (RD13). Apply neither until confirmed.

### Phase 1 — Foundation (stop at R1)

1. Carry out PRM-002 Phases 1+2 in full (its §3 D1–D5, D7, D13, §5.1–5.2):
   - `traverse-tokens.css` verbatim from R1.2;
   - `openbridge-bridge.css` (complete the mapping per PRM-002 Phase 0 step 3, including shadow-root variables, scoped per component where the analysis showed a global remap collides, for example `--border-divider-color`);
   - the blocking head script and the `ThemeContext` writing `data-theme` and `data-obc-theme` together;
   - Bright removed, with the storage migration;
   - toastify themed;
   - dead stylesheets deleted;
   - the `CLAUDE.md` rule amended to the DEC-002 RD2 text.
2. Add `src/charts/chartTheme.ts` per CD12. Move the 11 existing charts onto it now, so that colour is right in both themes during the transition (this fixes the 5 charts that ignore a theme change).
3. Geometry foundation (RD9):
   - `ObcButton` at 40 px painted and 6 px radius through its variables;
   - the 3 px focus gap through its `::part` rules;
   - the guide type scale and spacing available as Traverse size and type tokens (already in R1.2 `tokens.css`).

   Do not restyle the old pages beyond what the variables give.
4. Pin `@oicl/openbridge-webcomponents` to `1.0.1`. Add `obc-fit-probe.mjs --assert` to the gates.
5. **Stop at R1:**
   - every current page in Day and Night;
   - the first-paint screencast, proved able to detect a flash;
   - the storage migration test (`bright`, `light`, `dark`, garbage);
   - computed-style evidence inside `obc-*` shadow roots;
   - the chart theme switch with no reload.

### Phase 2 — Shell, navigation, context and routing (stop at R2)

1. Build **AppShell** (SPEC §6.1):
   - the header with logo and "CPA", plant selector, search (opens the existing palette, with the hint visible), time range with zone, environment indicator, Day/Night switch and user menu;
   - the sidebar with suite module order (absent modules hidden, RD4), the CPA sub-navigation (Setup and System permission-gated), the 64 px rail and the drawer below 1024 px;
   - the selected-item rule;
   - a skip link and a single `main`.
2. Context model:
   - extend `cpaHref` to carry `site`, `area`, `unit`, `range`, `from`, `to`, `window` and `loop` (SPEC §2.2);
   - one hook, `useCpaContext()`, reads them;
   - the site time zone resolves once per page and is passed to every formatter and chart;
   - remove the browser-zone formatting path from new code.
3. Routing:
   - add the seven destination routes. Each shows its old page inside the new shell until its phase replaces it;
   - add the redirect table (SPEC §2.3), each row switched on in the phase that ships its destination;
   - add `check-redirects.mjs`;
   - a refused route shows a DataState "Not available for your role" instead of a silent redirect (RD13). The guard logic is unchanged.
4. While the old pages render in the new shell, their own Site/Area/Unit selects read from and write to the header context, so there is one scope.
5. **Stop at R2:**
   - the shell in both themes at 1440, 1280 and 1024 and at 200 % zoom;
   - context carried across every hop of the 24 task walks (G07 report);
   - the restricted state with a viewer account.

### Phase 3 — Shared components and replacements (stop at R3)

1. Build SPEC §6.2–6.16 in `src/ui/`, each with its states, keyboard model and tests, and document them in `docs/theme/redesign/components.md`.
   - **TrendPanel** implements every CD14 behaviour item:
     - nulls kept (no joining or zero-fill);
     - a no-sample hatch;
     - the plotted-window label;
     - a value table;
     - cursor sync across grids;
     - the site zone on axis and tooltip;
     - a themed tooltip;
     - text-labelled lanes;
     - a keyboard path;
     - ECharts `aria`.
   - **Toggletip** and `src/help/registry.ts`, seeded verbatim from the help-registry draft and keyed by `M-###` (RD10).
2. Replace the 46 uses in 19 files of the nine OpenBridge types (DEC-002 RD2; `component-fit.md` §4.1 lists the files) with the §6.9–6.10 components, keeping behaviour. Activate T9 for the touched files.
3. Provide a component gallery route only when the build sets `VITE_CPA_COMPONENT_GALLERY=1`. It must be absent from default builds. Capture evidence from a production build with the flag set.
4. **Stop at R3:**
   - each component against its contract clause by clause, in both themes, with axe and keyboard results;
   - the TrendPanel behaviour evidence (gap, zoom label, value table, cursor sync, zone, tooltip at night).

### Phase 4 — Overview, Performance, Episodes (stop at R4)

1. Build SPEC §5.1, §5.2 and §5.3 exactly: regions, contents, sources, actions, states.
2. Switch on the redirects for `/cpm/kpi`.
3. Apply RD11 where these pages show D-08, D-15, D-20 or D-39.
4. Record each label choice in the label register.
5. **Stop at R4:**
   - the three pages in both themes at all widths;
   - acceptance against SPEC §5.1–5.3;
   - the CPA01 rule table (R1–R5, A2–A5);
   - task walks OP1, OP4, OP6, EN2, RE1 and RE4 re-run.

### Phase 5 — Loop (stop at R5: control-engineer review)

1. Build SPEC §5.4: the context header, status strip, readiness, TrendPanel, the Performance review inspector, and the tabs Performance, Diagnosis, Model and Signals.
2. Switch on the redirects for Explorer, Historical, Investigation and Response, parameters included.
3. Verify every SPEC §8 row for those four routes on the new page.
4. **Stop at R5.** Present:
   - the page in both themes, with the confirmed (`FIC10301`), suspected (`G13_LOOP_A`), live (`FIC10302`), stale (`FIC00701`) and never-evaluated (`DEMO-FIC-001`) loops, or their current equivalents;
   - the CPA02 rule table (B1–B6, R7, R9, R11, C2);
   - the label register;
   - every changed text that touches safety context, listed for review.

   A control engineer reviews before Phase 6.

### Phase 6 — Evidence, Setup, System, tools, Administration, Login (stop at R6)

1. Build SPEC §5.5, §5.6, §5.7, §5.8 and §5.9.
2. Switch on the remaining redirects.
3. Rebuild the Administration pages in the shell on the shared components. Apply CD21 and RD13 only if confirmed at R0.
4. Verify every SPEC §8 row for the affected routes, including all write actions, through mocked-API tests.
5. **Stop at R6.**

### Phase 7 — Content

1. Wire the Toggletip beside every value covered by the help registry.
2. Remove `title` attributes that carry definitions or explanations (567 attributes in 134 files today; count the remainder).
3. Apply SPEC §4 and the non-definition proposals in `content-audit-v2.md`, including the Internal class (CD17) and gate names first (CD18).
4. Activate T12.
5. Report:
   - words per destination against the PRM-003 per-surface counts;
   - Internal-class blocks remaining on operator destinations (target 0 outside Technical details);
   - definitions reachable by keyboard from their value (target 100 % of registry entries rendered).

### Phase 8 — Retire, accept, document (stop at R7)

1. Delete the old route components once the import graph shows no live use and the redirect test passes.
2. Extend T1–T3, T9, T10 and T11 to the whole live set. Remove T7.
3. **Acceptance on a populated lab** meeting the PRM-003 fitness rule, with the superadmin and viewer accounts. If the rule cannot be met, run everything, mark acceptance **conditional**, and list each check affected.
   - G01–G12 (skill `acceptance.md`) on every destination and overlay, at 1440, 1366, 1920, 1280, 1024 and 200 % zoom, in Day and Night: `docs/theme/redesign/acceptance-record.md`.
   - Re-run the 24 task walks with `task-walk.mjs` against the new routes. Targets (SPEC §9): average pages per task ≤ 1.5, multi-page tasks ≤ 11, 0 dead ends, 0 context losses.
   - axe-core on every destination and overlay: 0 critical, 0 serious.
   - The keyboard check on every overlay, table and chart.
   - Verify every row of SPEC §8 and SPEC §2.3.
   - Re-run `text-audit-v2.mjs` and `source-inventory.mjs`; report the final totals against both analyses.
4. Write the documentation:
   - `docs/theme/redesign/README.md`: how to add a page, how to use the shared components, how context, help and status work, and what each gate checks;
   - `geometry-deviations.md`: any remaining deviation from RD9, with its reason;
   - the final label register.
5. Add the final change-tracker entry.
6. **Do not build an image or deploy** (RD15). Report readiness.

## 7. Checkpoints (stop and wait)

| ID | When | Present |
|---|---|---|
| R0 | End of Phase 0 | Backup verification (remote, branch, tag, hash, committed-file list, evidence archive); reading record; deltas; function map with any homeless functions; live-defect fixes; plan; lab fitness; the CD21 and RD13 questions |
| R1 | End of Phase 1 | Theme parity on every current page; first paint; storage migration; shadow-root evidence; charts switching theme |
| R2 | End of Phase 2 | Shell at all widths in both themes; context continuity report; restricted state |
| R3 | End of Phase 3 | Component contracts clause by clause; TrendPanel behaviour; the 46 replacements |
| R4 | End of Phase 4 | Overview, Performance and Episodes against SPEC; CPA01 table; walks |
| R5 | End of Phase 5 | Loop against SPEC and CPA02; label register; safety-context text list. **Control-engineer review** |
| R6 | End of Phase 6 | Evidence, Setup, System, tools, Administration, Login; write-action tests |
| R7 | End of Phase 8 | Acceptance record; walks; axe; keyboard; function and redirect verification; final totals |
| C3 | Any time | A conflict between governing documents; a function with no home; data the API does not provide; a label or text change that would alter meaning; anything outside §1 scope. Describe the options; do not decide |

## 8. Phase report format

```
Phase N — <title>
Files changed: <count> (list)
Destinations / components delivered: <list>
Redirects switched on: <rows>
Functions verified (SPEC §8): <rows, n of N>
Gates: tsc ✓/✗ (baseline n) | lint ✓/✗ | test ✓/✗ | build ✓/✗ | lint:theme ✓/✗ (T-gates active, matches n) | contrast ✓/✗ | obc-probe ✓/✗ | redirects ✓/✗ | a11y ✓/✗ (crit/serious) | geometry ✓/✗
Evidence: <paths, both themes, widths>
Label register: <entries added>
Text touching safety context: <items or "none">
Deferred / C3: <items or "none">
Change tracker: <CHG id>
Commit: <hash> redesign(phase-N): <message>
Pushed: origin/feat/cpa-redesign at <hash> (verified with git ls-remote)
```

Do not report work as done without the gate output. If a gate fails and cannot be fixed within the phase, the phase is not complete: report the failure and stop.
