# CPA — Traverse Design System and Day/Night Colour Migration

| Field | Value |
|---|---|
| Document ID | CPA-UI-PRM-002 |
| Revision | R01 |
| Date | 2026-11-04 |
| Scope | `src/frontend-ob/` (React 18, Vite 5, TypeScript, OpenBridge web components 1.0.1, plain global CSS, echarts 5.6) |
| Template | IAMS-UI-PRM-001 R03, adapted. Brief TRV-UI-BRF-001 §2 and decision record CPA-UI-DEC-001 R01 are folded in and govern where the template differs |
| Inputs | `docs/design/Traverse_UI_Design_and_Development_Guide_R01.pdf` · `.claude/skills/traverse-design-system/` (**R1.2**) · `docs/theme/cpa-currenttheme.md` and `docs/theme/data/` · `docs/theme/CPA-UI-DEC-001-R01.md` · `.claude/skills/openbridge/SKILL.md` |
| Output | Traverse token layer with an OpenBridge adapter, Day/Night themes (Bright removed), first-paint script, chart theme builder, status-semantics remap, CI lint gate, change-tracker entries, content and geometry logs |

**Differences from the Instrumental template.** CPA has no Tailwind, shadcn or next-themes. The shadcn bridge, the Tailwind palette gates and the class codemod are therefore replaced by:
- an OpenBridge variable bridge (CD1);
- the existing `ThemeContext` with a blocking `<head>` script (CD4);
- literal, fallback and semantic-variable gates;
- one echarts theme builder (CD12).

The decisions taken from brief §2 are applied as follows:
- no `value` map (not applicable: no next-themes);
- the contrast gate is `contrast.mjs`;
- Normal in charts is `surface.raised` with a `border.strong` edge;
- success/info/warning/unknown usage follows brief §2 as detailed in CPA-UI-DEC-001 CD8.

---

## 1. Role and objective

You are the frontend engineer executing a controlled theming refactor of a production application. CPA is live, including at Marun. Every change must be regression-safe, reviewable, and verified by execution rather than by assertion.

Objectives, in order of priority:

1. Move every colour on the active CPA surface onto the Traverse token set. OpenBridge components stay; their colour variables are re-pointed to Traverse tokens through one bridge file. No literal colour, no `var()` literal fallback and no OpenBridge value survives on a themed surface outside the allow-list in §6.
2. Provide the two Traverse themes, **Day** and **Night** (Graphite and Cyan), with Day as the initial default. Remove Bright.
3. Apply the theme with no first-paint flash, persist the choice, and make it reach every surface: pages, OpenBridge components, native controls, dialogs, drawers, toasts, the command palette, charts (canvas included), badges, scrollbars, error states and the login page.
4. Correct colour **meaning** per CPA-UI-DEC-001 §2.2 (status semantics, NE107, violet, success).

Out of scope: layout, spacing, typography, component structure, routing, data fetching, chart behaviour and text content. These are recorded for later packages (Phase 6). The only exceptions are the focus ring (a colour and accessibility rule) and the single login hotfix in Phase H.

---

## 2. Documents to read before writing any code

| Document | Path |
|---|---|
| Traverse UI Design and Development Guide R01 (PDF, 30 pages) | `docs/design/Traverse_UI_Design_and_Development_Guide_R01.pdf` |
| Traverse design system skill **R1.2** | `.claude/skills/traverse-design-system/` |
| CPA analysis (CPA-UI-PRM-001 output) | `docs/theme/cpa-currenttheme.md`, `docs/theme/cpa-text-audit-by-route.md`, `docs/theme/data/` |
| Decision record | `docs/theme/CPA-UI-DEC-001-R01.md` |
| Programme brief | `docs/theme/TRV-UI-BRF-001.md` (copy supplied by the owner) |
| OpenBridge skill | `.claude/skills/openbridge/SKILL.md` |

**Skill revision.** The repository currently carries skill **R1.1** (analysis §1). Replace the folder with the R1.2 copy supplied by the owner before Phase 0. Confirm that `SKILL.md` states "Skill revision **R1.2**" and `references/tokens.css` states "R1.2". If R1.2 is not available, stop and report.

If any other file is missing from its path, search the repository for it by name. If it is still not found, stop and report. Do not continue from memory or from the skill alone.

### 2.1 The PDF (mandatory reading)

Read the PDF with the Read tool, using `pages` ranges of at most 20 pages per call:

1. `pages: "1-7"`: precedence, colour tokens, status and NE107, charts and accessibility, shell, interaction and data behaviour.
2. `pages: "11-13"`: CPA01 (loop overview), CPA02 (detailed performance), CPA requirements. These are concept images and written rules. Take hierarchy and density from the images; never sample a colour, size or spacing from an image.
3. `pages: "26-30"`: shared components, acceptance G01–G12, the p.28 corrections (CPA: actual zoom window, mode-compliance and time-in-AUTO windows, legible histogram marks), decisions still open, references.
4. `pages: "8-10"` and `"14-25"`: read once, so that CPA stays consistent with the other modules (G03).

Order of precedence: (1) exact tokens and written rules, (2) page requirements and the p.28 corrections, (3) images, for hierarchy and density only.

Compare every hex value in the skill's `references/tokens.css` with the tables on pages 3–5 (74 values: 33 Day, 33 Night, 8 fixed diagnostic) and report the result, for example "74 compared, 0 mismatches". If they disagree, the PDF wins; report it at C1.

### 2.2 The analysis: facts not to re-derive

- Theme is applied by `data-obc-theme` on `<html>` in a React effect (`App.tsx:201-204`). The key is `localStorage['ams-theme']`, the default is `day`, and the toggle is a three-button group (`App.tsx:612-636`). `index.html:2` hardcodes `data-obc-theme="day"`, and there is no first-paint script.
- The token layers, in resolution order: OpenBridge `openbridge.css` (`--container-*`, `--element-*`, `--alert-*`, `--instrument-*`, `--border-*`, `--focus-color`) → `Designer/designTokens.css` (`--ams-*` pens, alarm and grid values per theme; night overrides at :181, :187) → `styles/theme.ts` `T` and `App.tsx` `TB` (JavaScript names for OpenBridge variables) → `styles/cpm.css` `--cpm-*` tones (:32-35).
- Live code references 154 distinct custom properties. There are 46 literal declarations, 124 `var()` literal fallbacks and 130 hex values, of which 109 are in `components/Designer/Designer.css`. That file is live only because `Designer/TrendPage.tsx` imports it.
- Dead stylesheets: `styles/ag-theme-openbridge.css`, `styles/alarm-console.css`, root `Designer.css`.
- 11 echarts components (C1–C11, analysis §5.1). C4, C5, C6, C7 and C8 do not follow a theme change. `useObcTheme` observes only `data-obc-theme` (`hooks/useObcTheme.ts:21`).
- The live/legacy split is computed by `docs/theme/tools/lib/import-graph.mjs`. The legacy set (93 files) is not edited.
- Lab caveat: the dev server reads the wrong historian prefix (`VITE_LOOP_ROOT_PREFIX`; CHG-101). All evidence in this package comes from a **production build** (`npm run build` then `npx vite preview`, or the built image) with the correct prefix.

### 2.3 OpenBridge skill: rules only

| Skill section | Applies? | How |
|---|---|---|
| §0–§2 packages, imports, `data-obc-theme` | **Component layer only** (CD1) | The existing `obc-*` components and their React wrappers remain; no new OpenBridge components are introduced. `data-obc-theme` stays only as an internal attribute kept in step with `data-theme` (CD4). |
| §3 tokens only, never literals | **Yes** | It governs the bridge and every app stylesheet. |
| §4 icons | **Yes, unchanged** | The existing `Obi*` icons remain (no second icon library). |
| §5 alarms | **Semantics only** | ISA-18.2 / IEC 62682 state naming informs status usage. No automatic priority colour (guide p.4). |
| §6 NE107 | **Yes, with Traverse values** | Fixed `--traverse-diag-*` values, not OpenBridge values. |
| Values in general | **No** | Where the two skills disagree on a value, Traverse wins. |

---

## 3. Decisions (resolved; do not reopen)

The full text is in CPA-UI-DEC-001. The items below are binding for this package.

| # | Decision |
|---|---|
| D1 | **Adapter, not rewrite** (CD1). `obc-*` components remain. Every colour value comes from `styles/traverse-tokens.css` through `styles/openbridge-bridge.css`. Amend the CPA `CLAUDE.md` rule "OpenBridge is mandatory for all designs, components, colors" to "OpenBridge web components are the component layer; all colour values come from the Traverse design system (CPA-UI-DEC-001 CD1)". Make that one-line edit in Phase 1 and report it. |
| D2 | **Themes `day` and `night`; Night = Graphite and Cyan** (CD2). The achromatic night overrides at `designTokens.css:181,187` are removed. Baseline screenshots serve as layout and content reference, not colour comparison. Operations sign-off is required before release (Phase 7). |
| D3 | **Bright removed** (CD3). The theme control offers Day and Night only. Stored `bright` migrates to `day`. |
| D4 | **Theme mechanism** (CD4). Keep `ThemeContext`; add no dependency. One function, `applyTheme(t)`, sets `document.documentElement` `data-theme=t` and `data-obc-theme=t` and writes `localStorage['ams-theme']=t`. A blocking inline script in `index.html` `<head>`, placed before any stylesheet or module script, reads the key, maps `bright`→`day`, `light`→`day`, `dark`→`night`, treats anything else as `day`, writes the mapped value back once, and sets both attributes. Remove the hardcoded attribute at `index.html:2`. No component other than the theme control and `chartTheme.ts` reads the theme. react-toastify receives `night`→`dark` and `day`→`light` from the context. |
| D5 | **Token file** = verbatim copy of skill R1.2 `references/tokens.css`, with a header comment recording the skill revision and copy date. `--traverse-*` variables are defined only there. |
| D6 | **Colour only** (CD6). The focus ring from `tokens.css` (2 px `--traverse-focus`, 3 px offset) is applied. Where an `obc-*` component draws its own focus indicator inside its shadow root, re-point its focus variable instead of adding a second ring. |
| D7 | **Primary action** = `action.primary` (`#006B83` Day / `#54D6E8` Night). `--instrument-enhanced-primary-color` and any primary button colour resolve to it; hover and pressed states use `action.hover` and `action.active`. Text on primary uses `action.on`. |
| D8 | **Status semantics** per CPA-UI-DEC-001 CD7–CD11. Usage is adjusted, never token values. The three colliding OpenBridge alert variables are not used directly by CPA code after Phase 5 (Gate T5). Tones are expressed as `danger`, `warning`, `success`, `info`, `unknown` and `neutral`, rendered by classes that read `--traverse-status-*-fg` and `-bg`, or the neutral composition (`surface.raised`, `text.secondary`, `border.subtle`). |
| D9 | **NE107** (CD9). `components/Cpm/health/TransmitterHealthPanel.tsx:21-25,77` and any other NE107 rendering use `--traverse-diag-{f,c,s,m}-fill` and `-text`, with the code letter and label always shown together. |
| D10 | **Charts** (CD12–CD14). One builder, `src/charts/chartTheme.ts`: `resolveTraverse(name)` resolves a token to a literal through one hidden probe element (this replaces `Cpm/shared.tsx:27-36` `resolveCssColor` and `Designer/trend/trendSupport.ts:51` `resolveColor`); `useChartTheme()` returns the resolved palette and the theme name for `useMemo` dependencies; `baseOption(palette)` sets tooltip, axisPointer, splitLine, axisLine, axisLabel, legend and dataZoom colours. Series roles: PV `chart.series.1` solid; SP `chart.series.5` dashed and labelled; OP `chart.series.3` solid; VP `chart.series.4` solid; additional pens `chart.series.6`, then repeat with dash patterns; `chart.series.2` only for labelled AI. Mode lanes and categorical lanes use the tone classes of D8 resolved to literals. Behaviour (gap handling, zoom label, value table, cursor sync, time zone) is **not** changed: diagnose and report at C5. |
| D11 | **Designer.css off the CPA path.** Extract the rules that `/trend` actually uses into `components/Designer/trend/trend.css`, tokenise them, and remove the `Designer.css` import from `TrendPage.tsx`. The extraction must leave `/trend` geometry unchanged (Phase 3 check). `Designer.css` itself stays for the legacy HMI Designer and is not edited. |
| D12 | **Dead stylesheets removed**: `styles/ag-theme-openbridge.css`, `styles/alarm-console.css`, root `Designer.css`, after re-verifying by import graph that nothing imports them. |
| D13 | **Fonts unchanged.** Noto Sans and Noto Sans Mono satisfy guide p.6. Apply `font-variant-numeric: tabular-nums` (from `tokens.css` on `html`) and verify that table cells inherit it, because they report `normal` today (analysis §6). Add `font-variant-numeric: inherit` on the table cell rule if they do not; this is a numerals rule, not a typography change. |
| D14 | **Legacy not edited.** The 93 legacy files and routes that redirect under `CPA_SLICE_ONLY` are outside the gates, excluded by the import-graph live set. |
| D15 | **Text is not edited** except Phase H. Candidates are logged (CD19), including the **Internal** class (CD17) and gate-name-first (CD18). |
| D16 | **Dependencies unchanged.** No package is added, removed or re-pinned in this package. Caret ranges remain; `package-lock.json` fixes the install. |

---

## 4. Non-negotiable rules

1. No hex, `rgb()`, `rgba()`, `hsl()`, `oklch()` or named colour in live TS, TSX or CSS outside `styles/traverse-tokens.css` and the allow-list.
2. No `var(--x, <literal>)` fallbacks in live code. A missing token is a defect to fix, not to mask.
3. No inline colour literals. Inline `style` may pass `var(--traverse-…)` strings or values from `chartTheme.ts`.
4. `--traverse-*` variables are defined only in `styles/traverse-tokens.css`. The bridge **assigns** OpenBridge and app variables from Traverse variables; it never defines a `--traverse-*` name.
5. After Phase 5, live CPA code does not reference `--alert-*`, `--ams-pen-*`, `--ams-crit` or `--cpm-tone-*` directly. Status goes through D8 tone classes; series go through `chartTheme.ts`. Surface, text and border OpenBridge variables (`--container-*`, `--element-*`, `--border-*`) may still be referenced, because the bridge resolves them.
6. No component reads the theme except the theme control and `chartTheme.ts`.
7. No layout, spacing, typography or structural change (D6). Every phase compares measured element boxes against the Phase 0 baseline (§7, evidence).
8. No invented token names. Every Traverse name exists in R1.2 `tokens.css`; otherwise raise checkpoint C3.
9. Files over the project's 500-line limit (`App.tsx`, `app.css`, `cpm.css`, `hmi-dialogs.css`, `DataSourceWizard.tsx`, `Login.css`) may be edited in place but are not split in this package. The new files (`openbridge-bridge.css`, `chartTheme.ts`, `trend.css`) each stay under 500 lines; split the bridge by layer if needed (`openbridge-bridge.surfaces.css`, `…status.css`, `…app.css`).
10. Every phase ends with the §6 gates run and their output pasted into the phase report. A phase is complete only when every gate passes.
11. One commit per phase, message prefixed `theme(phase-N):`, and one entry per phase in the repository's change tracker (CHG entries) in its existing format.
12. Credentials come only from `CPA_BASE_URL`, `CPA_USER` and `CPA_PASSWORD`. Never write credentials, tokens or cookies to a file, log, manifest or image name.

---

## 5. Target architecture

### 5.1 Files

```
src/frontend-ob/index.html                   ← blocking <head> theme script (D4); hardcoded attribute removed
src/frontend-ob/src/main.tsx                 ← import order below
src/frontend-ob/src/styles/traverse-tokens.css   ← VERBATIM skill R1.2 references/tokens.css (+ header comment)
src/frontend-ob/src/styles/openbridge-bridge.css ← OpenBridge + app variables assigned from --traverse-* (split by layer if > 500 lines)
src/frontend-ob/src/styles/tones.css         ← D8 tone classes (danger, warning, success, info, unknown, neutral)
src/frontend-ob/src/charts/chartTheme.ts     ← D10
src/frontend-ob/src/components/Designer/trend/trend.css   ← D11
src/frontend-ob/scripts/theme/check-tokens.mjs  ← §6 gates, scoped by import-graph live set
src/frontend-ob/scripts/theme/contrast.mjs   ← Node port of skill scripts/contrast.py (see §6)
docs/theme/migration-plan.md, token-mapping.md, content-candidates.md, geometry-deviations.md, chart-behaviour.md, acceptance-record.md, README.md
```

Import order in `main.tsx`: `styles/fonts.css` → OpenBridge `dist/openbridge.css` → `styles/traverse-tokens.css` → `styles/openbridge-bridge.css` → `Designer/designTokens.css` (colour values removed or re-pointed, Phase 1) → `styles/tones.css` → the existing app stylesheets in their current order.

The bridge selectors must out-rank OpenBridge's theme selectors. Use `:root[data-theme="day"]` and `:root[data-theme="night"]`, and confirm in the browser by computed style (Phase 1 evidence) that every mapped variable resolves to the Traverse value inside an `obc-*` shadow root as well as in light DOM.

### 5.2 Bridge mapping (the starting set; Phase 0 completes it)

| OpenBridge / app variable | Traverse role | Note |
|---|---|---|
| `--container-backdrop-color` | `surface.page` | `.cpm-surface` sits on this; chart surfaces use it |
| `--container-background-color` | `surface.panel` | |
| `--container-section-color` | `surface.raised` | |
| hover / pressed container variables in use | `surface.hover` | Phase 0 names them |
| selected or pressed navigation background | `surface.selected` | Selected nav: `surface.selected`, `action.primary` text, 3 px start-edge `action.primary` (today `--focus-color`, `app.css:331-335`) |
| `--border-divider-color` | `border.subtle` | |
| control outline / input border variables | `border.strong` | Controls only |
| `--element-active-color` | `text.primary` | |
| `--element-neutral-color` | `text.secondary` | Today also used as SP, axes and the muted tone: these uses move to `chartTheme.ts` and tone classes |
| `--element-inactive-color` | `text.muted` | |
| `--instrument-enhanced-primary-color` | `action.primary` | D7 |
| `--instrument-enhanced-secondary-color` | Usage-dependent | Density "Normal" (`WindowDetail.tsx:237`) becomes `surface.raised` with a `border.strong` edge; other uses go to C3 |
| `--focus-color` | `focus` | |
| `--alert-alarm-color` | `status.danger.fg` | Interim only; usage split in Phase 5 |
| `--alert-caution-color`, `--alert-warning-color` | `status.warning.fg` | Interim only; the caution fill at 1.03:1 Day is retired |
| `--alert-running-color` | `status.success.fg` | Interim only; most uses become neutral or info in Phase 5 |
| `--alert-limit-secondary-color` (NE107 M) | none | Replaced by `--traverse-diag-m-*` in Phase 4 |
| `--ams-crit`, `--ams-pen-1…n` | `chart.series.*` per D10 | Consumed only through `chartTheme.ts` after Phase 4 |
| `--ams-grid-line` | `chart.grid` | |
| `--hmi-*` dialog variables | `surface.panel`, `border.subtle`, `text.*`, `overlay` | Backdrop = `--traverse-overlay` |
| `--cpm-*` tones (`cpm.css:32-35`) | D8 tone classes | |
| react-toastify `--toastify-color-*` | `surface.panel`, `text.primary`, `status.*.fg` | Start-edge status bar 3 px, as on Instrumental |
| `T.*` (`styles/theme.ts`), `TB.*` (`App.tsx`) | Unchanged names, values = the bridged variables | No call-site edits needed where the role is correct |

`color-mix()` (34 uses) is permitted when every argument is a Traverse or bridged variable.

---

## 6. Verification gates (run after every phase; paste the output)

`scripts/theme/check-tokens.mjs`, wired to `npm run lint:theme`, scans **live** files only (reuse `docs/theme/tools/lib/import-graph.mjs`), excludes tests, parses TS/TSX with the TypeScript AST so that comments are ignored, and exits non-zero on any match outside the allow-list.

| Gate | Pattern | Active from |
|---|---|---|
| T1 colour literals | `#[0-9a-fA-F]{3,8}\b`, `\b(rgb|rgba|hsl|hsla|oklch)\(`, CSS named colours in colour-bearing properties | Phase 3 |
| T2 literal fallbacks | `var\(--[a-z0-9-]+\s*,\s*(#|rgb|hsl|oklch|[a-z]+\))` | Phase 3 |
| T3 inline literal colour | `style=\{\{[^}]*(color|background|backgroundColor|borderColor|fill|stroke)\s*:\s*['"](#|rgb|hsl)` | Phase 3 |
| T4 Traverse definitions | `--traverse-[a-z0-9-]+\s*:` outside `styles/traverse-tokens.css` | Phase 1 |
| T5 collided semantics | `--alert-[a-z-]+`, `--ams-pen-\d+`, `--ams-crit`, `--cpm-tone-[a-z]+` outside the bridge, `tones.css` and `chartTheme.ts` | Phase 5 |
| T6 theme access | writes or reads of `data-theme` / `data-obc-theme` / `ams-theme` outside `index.html`, `ThemeContext`, the theme control and `chartTheme.ts` | Phase 2 |
| T7 retired theme (temporary) | `\bbright\b` as a theme value | Phase 2; removed after Phase 7 |

**Allow-list** (only these files may match, only on the lines noted):
- `styles/traverse-tokens.css`: all definitions (T1, T4).
- `index.html`: the head script (T6).
- `charts/chartTheme.ts`: the probe element and resolved-literal handling (T1 for the probe's transparent reset only; T5; T6).
- `components/shared/ErrorBoundary.tsx`: only if it renders outside the themed root; otherwise tokenise. Decide at C1.
- Legacy files: excluded by path (D14).

At every phase also run:

```bash
cd src/frontend-ob
npx tsc --noEmit            # baseline: no new errors versus Phase 0
npm run lint                # baseline: no new findings versus Phase 0
npm run lint:theme
npm test --if-present       # existing tests must still pass
npm run build
node scripts/theme/contrast.mjs   # 121 of 126 pairings pass; the 5 documented exceptions; exit 0
```

**Contrast check.** Use the Node port `contrast.mjs` produced for Instrumental if it is available to you. Otherwise port `scripts/contrast.py` from skill R1.2 line for line (same pairings, same thresholds, same output) and show that both produce identical results on R1.2 `tokens.css` before relying on it. Extend it with the CPA chart pairings of D10 (series 1, 3, 4, 5 and 6 against page, panel and raised, ≥ 3:1).

**Browser computed-style check** (production build, both themes): for every mapped bridge variable, the value resolved at `:root` and inside one instance of each `obc-*` component in use equals the Traverse value. Output goes to `docs/theme/evidence/phase-N-computed.json`.

---

## 7. Phases

Each phase follows the same sequence: implement → run the gates → capture the affected routes in **both** themes from a production build → compare element boxes with the baseline (tolerance 1 px; any larger difference is a defect unless it is the focus ring) → commit → change-tracker entry → phase report (§9).

Capture with the existing tooling in `docs/theme/tools/` (`capture-screens.mjs`, `capture-states.mjs`), with Bright removed from its theme list. Pace requests and record any HTTP 429.

### Phase H — Login hotfix (independent; may ship first)

`components/Login/Login.tsx:155-157`: remove the IEC 62443 compliance sentence and keep "Authorized use only. Access is restricted to authorized operators." At `Login.tsx:247`, change "Secure sign in" to "Sign in". No other change. Gates, one commit `fix(login): remove unsupported compliance claim (CPA-UI-DEC-001 CD20)`, and one change-tracker entry.

### Phase 0 — Plan and baseline (stop at C1)

1. Replace the skill with R1.2 (§2). Read the inputs. Write the reading record, including the 74-value comparison.
2. Re-run `docs/theme/tools/source-inventory.mjs` at the current commit. Report the deltas against the analysis (it was measured at `16184182`).
3. **Complete the bridge inventory.** (a) The 154 variables referenced by live code. (b) Every custom property read inside the shadow roots of the `obc-*` components in use: enumerate them in the browser from each component's adopted or shadow stylesheets, and list `var(--…)` names. (c) Every OpenBridge variable whose computed value differs between `data-obc-theme="day"` and `"night"`. Assign each a Traverse role, an "unchanged (non-colour)" mark, or C3. Write the result to `docs/theme/token-mapping.md`.
4. Write `docs/theme/migration-plan.md`: files per phase, the full bridge mapping, the tone-class mapping per field (CD8), the chart role map per component (C1–C11), the allow-list, and the 500-line file list.
5. Establish the baselines: `tsc`, lint and test counts, and build time.
6. **Baseline capture** from a production build with the correct historian prefix, on a populated lab if one is available: every live route at 1440 × 1024 in Day and Night (current palette), the key pages also at 1366 × 768 and 1920 × 1080, and the states set from `capture-states.mjs`. Record element boxes for the shell, the panels, table rows, buttons and charts in `manifest.json`. These are the layout and content reference (D2).
7. **Stop. Present C1.**

### Phases 1 and 2 — Token foundation, bridge, theme mechanism (one change)

1. Add `traverse-tokens.css` (verbatim) and `openbridge-bridge.css` per `token-mapping.md`. Remove the colour values from `designTokens.css`, including the night overrides at :181 and :187, and re-point its `--ams-*` names to the bridge (series stay as interim aliases until Phase 4). Fix the import order (§5.1).
2. Apply D4: the head script, `applyTheme`, a Day/Night control per the skill's "Theme switch" contract (two options, `aria-pressed`, keyboard operable; the current toggle-group component may be reused with Bright removed), toastify mapping, and `useObcTheme` observing `data-theme`.
3. Apply D1: the `CLAUDE.md` one-line amendment.
4. Delete the dead stylesheets (D12).
5. **Verify:**
   - A fresh profile paints `data-theme="day"` on the first frame. Prove this by a frame-by-frame screencast that shows the method detects a flash when the script is disabled.
   - Stored `bright`, `light`, `dark` and garbage values migrate as specified.
   - The toggle swaps every surface, including `obc-*` shadow content, native `<select>` (through `color-scheme`) and toasts.
   - A reload preserves the choice.
   - The computed-style check passes.
   - Contrast passes.
6. **Stop at C4** with shell screenshots in both themes.

### Phase 3 — Core stylesheets and literals

1. Tokenise the literals in `styles/app.css`, `cpm.css`, `cpm-evidence.css`, `cpm-evidence-layout.css`, `cpm-loop-summary.css`, `cpm-tables.css`, `cpm-context.css`, `cpm-responsive.css`, `hmi-dialogs.css` (16 `rgba()`), `Login/Login.css`, `registry/wizard/wizard.css` and `Cpm/shared.tsx` (10 hex).
2. Remove every `var()` literal fallback (T2).
3. Apply D11 for `/trend` and verify that its geometry matches the baseline.
4. Convert the inline literal colours in `SystemSettingsConfig.tsx` and `HealthLane.tsx:44`. The latter passes a bare, non-existent token name; fix it to a real role.
5. Apply D13.
6. Activate gates T1–T3.

### Phase 4 — Charts and NE107 (C2 before applying NE107 and the status palette)

1. Create `chartTheme.ts` (D10). Convert C1–C11.
2. The five components that ignore a theme change (C4, C5, C6, C7, C8) take the theme from `useChartTheme()` in their memo dependencies.
3. Theme the tooltip, grid, axis, ticks and zoom slider explicitly.
4. PV on `/trend` becomes `chart.series.1` (currently `--ams-crit`, the alarm colour). SP becomes dashed and labelled in the evidence lanes and on `/trend`, through `TrendPage.tsx:33` passing a style. These are line-style encodings, not behaviour.
5. Replace violet series (CD10).
6. Distribution and proportion marks (C12–C17) use `status.*.fg` and Normal = `surface.raised` with a `border.strong` edge (CD13).
7. Apply D9 to NE107.
8. **Present C2**: before and after for the series palette, the NE107 palette, and the distribution marks in both themes, with their computed contrast ratios against the surfaces actually behind them. Proceed unless the owner objects.

### Phase 5 — Status-semantics pass

1. Add `tones.css`. Rewrite the tone mapping at each source in the analysis §4.5 table to the CD8 rulings: `gateStatus.ts`, `shared.tsx` `toneFor` (split it per field; a catch-all spanning fields is not permitted), `priorityReason.ts`, `shelfState.ts`, `eventsState.ts`, `useLoopLive.ts`, `FacetPill.tsx`, `CpmHistorical.tsx:145`, `HistorianLanes.tsx:38`, `LoopIngestPanel.tsx`, `TransmitterHealthPanel.tsx`, `GoodErrorBar.tsx`, `CpmWindows.tsx`, `CpmPipeline.tsx`, `fleetKpiView.ts`, `KpiRowsTable.tsx`, `cpm-loop-summary.css:113-121`, `HypothesisPanel.tsx`, `evidenceBasis.ts`, `evaluationState.ts`, `configSupport.ts`, `lifecycle.ts`, `EffectiveView.tsx` and its inline siblings, `responseSupport.ts`, `CpmGovernance.tsx`, `AuditExplorer.tsx`, `registryShared.ts`, `ProfileAside.tsx`, `UserManagementConfig.tsx`, `DataSourcesConfig.tsx`, `AliasConfig.tsx` and `PlantModelStatus.tsx`.
2. Work through the analysis §9.7 success-violation list item by item.
3. Make `ok` and `ok-limited` distinguishable by glyph, not only by `title`. Add DISABLED to the legend.
4. Render EXCLUDED the same in the matrix and the roll-up.
5. The Required-jobs tile is not red while loading, and the checkpoint tile is not amber with no data: both use `unknown` with a label.
6. Mode and quality must not reuse one colour role. Verify no field conflation: diagnosis, workflow state, source quality and mode render as separate badges (guide p.16).
7. Raise C3 for any field not covered by CD8.
8. A confirmed finding renders as `warning`, with a comment citing CD8 as pending control-engineering confirmation.
9. Activate gate T5.

### Phase 6 — Logs for later packages (no source change)

1. `docs/theme/chart-behaviour.md`: diagnosis only. For each CD14 behaviour defect, give the file and line, the current behaviour (observed in the browser where reproducible), the proposed change, and the guide reference. Covered defects: C2 overlay and mode joining, C10 zero-fill, C11 joined gaps, C3 outage, the zoom-window label (p.28), the missing value table, cursor sync, and browser-versus-site time zone. **Present C5.**
2. `docs/theme/content-candidates.md`: run `docs/theme/tools/text-audit.mjs` with the **Internal** class added (CD17). The patterns are listed in CPA-UI-DEC-001 R2; extend them with any found. Record gate-name-first proposals (CD18), the help-registry candidates from `title` tooltips (CD16 template), and the analysis §8.5 identity items (CD23). Re-rank the top 20 by words saved × occurrences.
3. `docs/theme/geometry-deviations.md`: the analysis §6 table re-measured on the migrated build, plus the shell items absent from the header (guide p.6) and the Q4, Q5 and Q13 open items.

### Phase 7 — QA, lint gate, documentation, readiness

1. Wire `npm run lint:theme` and `node scripts/theme/contrast.mjs` into the lint and pre-build steps. Remove gate T7.
2. Capture every live route in Day and Night at the three widths, plus the states set, into `docs/theme/screenshots/{day,night}/`. Build `docs/theme/review.html` pairing Day, Night and baseline per route. Layout and content regressions are found by comparing element boxes and fixed.
3. Run axe-core on every route in both themes. Colour-contrast nodes must be 0, or each remaining node listed with its reason. Report the other rules against the baseline (479 Day and 391 Night nodes; 15 critical). Fixing non-colour axe rules is out of scope unless they are colour or focus related.
4. Acceptance: G01–G06 and G12, plus the CPA module checks from guide p.28 that are within colour scope (legible histogram and distribution marks). Record pass or fail per route in `docs/theme/acceptance-record.md`. G07–G11 are marked "not assessed".
5. Re-run the source inventory. Report the final totals: Traverse share of live colour declarations, literals (= allow-list only), fallbacks 0, and T5 matches 0.
6. Write `docs/theme/README.md`: how to add a colour, how the bridge and the head script work, what each gate checks, the allow-list and the reason for each entry.
7. Write the release note: Night appearance changed to Graphite and Cyan; Bright removed and migrated to Day; Day is the default for users without a stored choice. Operations sign-off is required before release at Marun (CD2).
8. Add the final change-tracker entry. Build the frontend image per the deployment runbook. **Do not deploy**; report readiness.

---

## 8. Checkpoints (stop and wait)

| ID | When | What you present |
|---|---|---|
| C1 | End of Phase 0 | Reading record and 74-value comparison, deltas against the analysis, `token-mapping.md` (including shadow-root variables), migration plan, tone and chart role maps, allow-list decisions, baselines. Only the skill replacement has been applied. |
| C2 | Phase 4, before NE107 and distribution marks | Before and after palettes with contrast ratios against the actual surfaces, both themes. Proceed unless the owner objects. |
| C3 | Any time | A colour case not covered by R1.2 tokens or CD8, a gate match that cannot be resolved with defined tokens, a success ambiguity, a shadow-root variable that cannot be bridged, or anything that would change layout, structure, behaviour or text. Describe the options; do not invent. |
| C4 | End of Phases 1+2 | Shell, overview and one OpenBridge-heavy page in both themes, the first-paint screencast, the storage migration test, computed-style evidence. |
| C5 | Phase 6 | `chart-behaviour.md`. Nothing is merged from it in this package. |

---

## 9. Phase report format

```
Phase N — <title>
Files changed: <count> (list)
Changes: <by mapping row / tone rule / chart component, counts>
Gates: tsc ✓/✗ (baseline n) | lint ✓/✗ (baseline n) | lint:theme ✓/✗ (matches n, all allow-listed) | test ✓/✗ | build ✓/✗ | contrast ✓/✗ (121/126 + CPA chart pairings) | computed-style ✓/✗
Geometry: element boxes vs baseline — max delta <px> (routes checked)
Screenshots: <paths, both themes>
Deferred / needs decision: <items or "none">
Change tracker: <CHG id>
Commit: <hash> theme(phase-N): <message>
```

Do not report work as done without the gate output. If a gate fails and cannot be fixed within the phase, the phase is not complete; report the failure and stop.
