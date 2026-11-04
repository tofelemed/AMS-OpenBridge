# CPA: Current Theme, Styling and Content Analysis

| Field | Value |
|---|---|
| Document ID | CPA-UI-PRM-001 |
| Revision | R01 |
| Date | 2026-11-04 |
| Application | CPA, Control Loop Performance Management (Traverse Edge) |
| Type | Analysis only. No application source was changed |
| Captured from | Branch `feat/v25-next-release`, commit `16184182`, Vite dev server on port 5174 (working tree) |
| Companion files | [cpa-text-audit-by-route.md](cpa-text-audit-by-route.md), [data/](data/), [screenshots/current/](screenshots/current/) |

## 1. Reading record

| Source | Read | Notes |
|---|---|---|
| `Traverse_UI_Design_and_Development_Guide_R01.pdf` | Pages 1-7, 11-13, 26-29 | Foundations, CPA01, CPA02, CPA requirements, components, acceptance, corrections, decisions |
| `.claude/skills/traverse-design-system/SKILL.md` | All | The file states revision **R1.1**; the brief names R1.2 (see Q15) |
| `references/components.md` | All | Its chart contract assumes recharts; CPA uses echarts (§5.7) |
| `.claude/skills/openbridge/SKILL.md` | §0-§4 | Read because CPA is built on OpenBridge |
| Instrumental audit, prompt and capture script | **Not available** | Not in this repository or sibling folders. Agreed method: follow the written rules in the brief. Comparison with Instrumental holds only where the categories match |

## 2. Summary

Measured on 31 routes in three themes. Lab accounts: `admin` for 19 routes, `superadmin` for the 12 that are SuperAdmin-only (approved during the work).

1. **Token readiness is 97.5 %, but all of it is OpenBridge.** 1,827 of 1,873 resolved live colour declarations use CSS variables. `--traverse-*` usage is **0**.
2. **Hardcoded colours are few and concentrated.** 46 literal declarations and 124 literal `var()` fallbacks. 130 hex occurrences, of which **109 sit in one file**, `Designer.css`, loaded on every session because `TrendPage.tsx` imports it. Tailwind palette classes, `dark:` variants and arbitrary values: 0.
3. **All 31 routes captured; none failed.** 373 images. 12 routes silently redirect for `admin` (CHG-081), so they needed `superadmin`.
4. **Visible words: worst 531 (admin-data-sources), best 17 (trend), median 187.** Total 7,341. The proposals in §8 reduce that to 5,824 (−21 %). Overview would go from 308 to 192.
5. **`title` tooltips hold another 4,393 words** that are mouse-only, so most metric definitions fail the guide's "accessible help or detail view" (p.6). Performance alone has 980.
6. **The type scale has 28 rendered sizes** against the guide's 5, and 68 distinct values in source. Page title is 19.6 px against 24; section title 14.7 px against 18.
7. **Shell width and height match; the contents do not.** Sidebar 220 px and header 64 px pass. There is no plant selector, search field, time range or environment indicator. `ObcButton` is 48 px against 40; table rows run 32.5-115 px (median 52) against 44.
8. **Charts are the largest gap.** Of 11 echarts components, 5 ignore a theme change. PV, OP and VP fail 3:1 in Day (1.79, 1.41, 2.83). There is no value table, no cursor sync across charts and no zoom-window label. On /trend, PV draws in the alarm colour.
9. **Colour meaning collides.** `--alert-running-color` means gate pass, AUTO, Active, Good, acknowledged and NE107 Function check. Violet appears on non-AI series.
10. **Accessibility.** axe-core finds 479 issue nodes in Day and 391 in Night, 15 of them critical. Contrast accounts for 242 and 191. 0 of the table rows and 0 charts are keyboard-focusable.

**Two items to act on regardless of migration:** the login page claims compliance with IEC 62443 with no basis found (§8.5), and `/admin/system` is a live tab showing illustrative values (§8.5).

**Read the numbers with this caveat.** The lab was unusual during capture: 165 of 243 loops stale and 76 never evaluated, so many KPIs read 0. On the dev server, Explorer and Historical read an old historian prefix, so they show "no signal" states. Live /trend shows real data. Details in §7.4.

## 3. Styling stack (Part A.1-A.3)

### 3.1 Stack

Versions are the resolved `node_modules` versions; the range is from `src/frontend-ob/package.json`. No dependency uses `latest`. All are caret ranges, so none is exactly pinned, though `package-lock.json` fixes the install.

| Layer | What CPA uses | Version (range) |
|---|---|---|
| Framework | React with Vite, TypeScript | React 18.3.1 (`^18.3.1`), Vite `^5.3.1`, TypeScript `^5.4.5` |
| Router | react-router-dom, `BrowserRouter`, nested `<Routes>` in `App.tsx` | 6.30.4 (`^6.23.1`) |
| UI kit | **OpenBridge web components** through React wrappers | `@oicl/openbridge-webcomponents` and `-react` 1.0.1 (`^1.0.1`) |
| Styling approach | **Plain global CSS** plus inline `style={{}}`. Tailwind, CSS Modules, styled-components, MUI and shadcn are all absent (grep zero hits; no `postcss` or `tailwind` config) | n/a |
| Icons | OpenBridge `Obi*` icons only; 19 distinct in live code | with OpenBridge |
| Charts | echarts through echarts-for-react. `d3` is installed but imported only by the legacy `Soe/SoePanel.tsx` | echarts 5.6.0 (`^5.5.0`), echarts-for-react 3.0.6 (`^3.0.2`), d3 7.9.0 |
| Grid | No live grid. `ag-grid` is imported only by legacy AlarmConsole and HistoricalViewer. Live tables are plain `<table>` (38 in live code) | 31.3.4 |
| Fonts | Self-hosted Noto Sans and Noto Sans Mono variable fonts (`styles/fonts.css`), meets guide p.6 "self-hosted UI sans" | `@fontsource-variable/*` 5.3.0 |
| Theme provider | Hand-written `ThemeContext` in `App.tsx:90-96`; no next-themes | n/a |
| Toasts | react-toastify, themed `dark` or `light` from the app theme (`App.tsx:315`) | 11.1.0 |
| State | zustand 4.5.7, @tanstack/react-query 5.101.0 | |

Live-code component mix, measured by grep over the live directories (command in §13):

| Element | Uses |
|---|---|
| `<ObcButton` | 217 |
| Native `<button` | 74 |
| Native `<select` | 45 |
| Native `<table` | 38 |
| `<ObcToggleButtonOption` / `<ObcToggleButtonGroup` | 17 / 11 |
| Other OpenBridge components (16 distinct in total) | under 6 each |
| `style={` attributes | 563 |
| `className=` attributes | 1,757 |

### 3.2 Theme mechanism today

| Question | Answer | Evidence |
|---|---|---|
| Dark mode, light mode, both? | **Three selectable themes: Day, Bright, Night.** OpenBridge also defines `dusk`, which the UI does not offer | `App.tsx:90,618` |
| How applied | Attribute `data-obc-theme` on `<html>`, set in a React effect | `App.tsx:201-204` |
| Toggle | Three-button group in the top bar | `App.tsx:612-636` |
| Persisted | `localStorage['ams-theme']`, default `day` | `App.tsx:191-197,203` |
| First-paint script | **None.** `index.html:2` hardcodes `data-obc-theme="day"`, so a saved Night theme paints Day until the effect runs | `index.html:2` |
| Chart reaction | `useObcTheme` observes the attribute; 5 of 11 echarts components do not use it (§5.1) | `hooks/useObcTheme.ts:21` |

Night is deliberately achromatic: `designTokens.css:181,187` override OpenBridge's night neutral and backdrop for ISA-101 colour reservation (recorded project decision). This is a direct conflict with the guide's Graphite and Cyan Night, listed in §12.

### 3.3 Global stylesheets

`main.tsx` imports, in order: `styles/fonts.css`, OpenBridge `dist/openbridge.css`, `Designer/designTokens.css`, `styles/app.css`, `hmi-dialogs.css`, `cpm.css`, `cpm-evidence.css`, `cpm-context.css`, `cpm-loop-summary.css`, `cpm-responsive.css`, `cpm-evidence-layout.css`, `cpm-tables.css`.

| Stylesheet | Lines | Status |
|---|---|---|
| `styles/ag-theme-openbridge.css` | 220 | **dead**, not imported |
| `styles/alarm-console.css` | 198 | **dead**, not imported |
| `Designer.css` | 7 | **dead**, not imported |
| `components/AlarmConsole/shelve-dialog.css` | 316 | imported by legacy pages only |
| `components/AlarmConsole/ag-theme-openbridge.css` | 284 | imported by legacy pages only |
| `components/AlarmConsole/alarm-console.css` | 198 | imported by legacy pages only |
| `components/Designer/Designer.css` | 3,338 | imported, live |
| `styles/app.css` | 1,717 | imported, live |
| `styles/cpm.css` | 1,483 | imported, live |
| `styles/hmi-dialogs.css` | 1,262 | imported, live |
| `components/Login/Login.css` | 518 | imported, live |
| `styles/cpm-evidence.css` | 438 | imported, live |
| `styles/cpm-loop-summary.css` | 286 | imported, live |
| `components/Designer/designTokens.css` | 225 | imported, live |
| `styles/cpm-evidence-layout.css` | 199 | imported, live |
| `styles/cpm-tables.css` | 109 | imported, live |
| `styles/fonts.css` | 73 | imported, live |
| `styles/cpm-responsive.css` | 61 | imported, live |
| `styles/cpm-context.css` | 51 | imported, live |
| `components/Cpm/registry/wizard/wizard.css` | 31 | imported, live |

Dead stylesheets are candidates for deletion once confirmed, and were not touched. `Designer.css` is live only because `Designer/TrendPage.tsx` imports it, so 3,338 lines written for the HMI Designer load on every CPA session.

### 3.4 CSS custom properties

Declared by readable stylesheets, resolved per theme: Day 2,565, Bright 2,586, Night 2,586. Nearly all come from OpenBridge `openbridge.css`. App-declared: 339, in `Designer/designTokens.css` 136, `styles/hmi-dialogs.css` 56, `styles/cpm.css` 29, `styles/app.css` 28, `AlarmConsole/ag-theme-openbridge.css` 27, `styles/ag-theme-openbridge.css` 27, `Designer/Designer.css` 21, `Login/Login.css` 7, `styles/cpm-loop-summary.css` 7, `styles/cpm-tables.css` 1. Live code references 154 of them.

Full listing with resolved values per theme: [data/css-custom-properties.json](data/css-custom-properties.json). App-declared properties with their file and selector: `customProps` in [data/source-inventory.json](data/source-inventory.json).

The app's token layers, in resolution order: OpenBridge `openbridge.css` (`--container-*`, `--element-*`, `--alert-*`, `--instrument-*`) → `designTokens.css` (`--ams-*` pens, alarm and grid values per theme, and overrides of OpenBridge night values) → `styles/theme.ts` `T` object and `App.tsx` `TB` object (JavaScript names for OpenBridge variables) → `cpm.css` (`--cpm-*`, for example the tones at `cpm.css:32-35`).

`--traverse-*` usage in `src/frontend-ob/src`: **0**.

## 4. Colour inventory (Part A.4, A.6, A.9)

"Live" means the file can execute in the CPA slice, found by walking imports from `main.tsx` and allowing only the CPA routes' lazy imports. Hidden admin tabs count as legacy. Tests are excluded. Parsing uses the TypeScript AST, so comments and prose are not counted.

### 4.1 Totals, live code

| Category (Instrumental method) | Count | Note |
|---|---|---|
| Raw palette classes, neutral | 0 | No Tailwind |
| Raw palette classes, hue | 0 | No Tailwind |
| Hex literals | 130 | Includes those inside `var()` fallbacks |
| `rgb()` / `rgba()` | 41 | |
| `hsl()`, `oklch()` and similar | 0 | |
| Named colours | 11 | |
| Inline colour properties | 361 | 3 hold a literal; the rest use tokens or `T.*` |
| Arbitrary values | 0 | |
| `dark:` variants | 0 | |
| Semantic token references | 1,611 `var()`, 488 `T.*` / `TB.*` | Equivalent of semantic classes here |
| `color-mix()` | 34 | |
| Literal fallback in `var(--x, #hex)` | 124 | Token first, literal only if the token is missing |
| Token definitions holding a literal | 132 | `designTokens.css` and similar; expected |

### 4.2 Readiness (A.9)

| Group | Files | Colour decl | Tokenised | Literal | Indirect | hex | rgb() | var fallback | color-mix | Inline colour | Token defs | Tokenised % |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| core | 15 | 871 | 851 | 20 | 0 | 9 | 28 | 17 | 27 | 24 | 132 | 97.7 |
| shared | 53 | 50 | 40 | 0 | 10 | 10 | 0 | 0 | 0 | 39 | 0 | 100 |
| page | 254 | 1079 | 936 | 26 | 117 | 111 | 13 | 107 | 7 | 298 | 0 | 97.3 |
| live | 322 | 2000 | 1827 | 46 | 127 | 130 | 41 | 124 | 34 | 361 | 132 | 97.5 |
| legacy | 93 | 1243 | 961 | 56 | 226 | 139 | 32 | 65 | 34 | 772 | 0 | 94.5 |

Readiness is Tokenised ÷ (Tokenised + Literal). Indirect declarations pass a variable or function, so they could not be classified from syntax and are left out of the ratio.

**What this percentage means:** it measures how much will move if the variables move. It does not measure conformance. Conformance with Traverse tokens is 0 %.

Token families referenced by live code (154 distinct): openbridge 98 tokens, 1,129 references; designer 15 tokens, 228 references; hmi 20 tokens, 142 references; ams 14 tokens, 71 references; cpm 7 tokens, 41 references.

Files over the project's 500-line limit that a migration would touch: `Designer.css` 3,338, `app.css` 1,717, `cpm.css` 1,483, `hmi-dialogs.css` 1,262, `App.tsx` 837, `DataSourceWizard.tsx` 606, `Login.css` 518.

### 4.3 Per file, worst first

| File | Group | hex | rgb() | var fallback | Literal decl | color-mix | Inline colour | T refs | Most frequent literal |
|---|---|---|---|---|---|---|---|---|---|
| `components/Designer/Designer.css` | page | 109 | 9 | 107 | 20 | 4 | 0 | 0 | `#949494`×16 `#334155`×14 |
| `styles/hmi-dialogs.css` | core | 0 | 16 | 0 | 16 | 2 | 0 | 0 | `rgba(`×16 |
| `styles/app.css` | core | 9 | 5 | 12 | 2 | 19 | 0 | 0 | `rgba(`×5 `#1f2937`×2 |
| `components/Cpm/shared.tsx` | shared | 10 | 0 | 0 | 0 | 0 | 0 | 0 | `#9aa6af`×2 `#e30019`×2 |
| `styles/cpm.css` | core | 0 | 7 | 5 | 2 | 6 | 0 | 0 | `rgba(`×7 |
| `components/Login/Login.css` | page | 0 | 4 | 0 | 3 | 3 | 0 | 0 | `rgb(`×4 |
| `components/Administration/SystemSettingsConfig.tsx` | page | 1 | 0 | 0 | 2 | 0 | 19 | 23 | `#fff`×1 |
| `components/Administration/DataSourceWizard.tsx` | page | 0 | 0 | 0 | 1 | 0 | 36 | 50 |  |
| `components/Cpm/health/HealthLane.tsx` | page | 1 | 0 | 0 | 0 | 0 | 0 | 0 | `#888`×1 |
| `components/shared/LiveEventStream.tsx` | shared | 0 | 0 | 0 | 0 | 0 | 32 | 47 |  |
| `components/Administration/AuditExplorer.tsx` | page | 0 | 0 | 0 | 0 | 0 | 29 | 44 |  |
| `components/Administration/AliasConfig.tsx` | page | 0 | 0 | 0 | 0 | 0 | 27 | 28 |  |
| `components/Administration/BulkImportModal.tsx` | page | 0 | 0 | 0 | 0 | 0 | 27 | 43 |  |
| `components/Administration/RolesConfig.tsx` | page | 0 | 0 | 0 | 0 | 0 | 27 | 37 |  |
| `components/Administration/UserManagementConfig.tsx` | page | 0 | 0 | 0 | 0 | 0 | 27 | 41 |  |
| `App.tsx` | core | 0 | 0 | 0 | 0 | 0 | 24 | 39 |  |
| `components/Administration/PlantModelImport.tsx` | page | 0 | 0 | 0 | 0 | 0 | 23 | 24 |  |
| `components/Administration/PlantModelConfig.tsx` | page | 0 | 0 | 0 | 0 | 0 | 20 | 20 |  |
| `components/Administration/DataSourcesConfig.tsx` | page | 0 | 0 | 0 | 0 | 0 | 18 | 33 |  |
| `components/Administration/LoopIngestPanel.tsx` | page | 0 | 0 | 0 | 0 | 0 | 18 | 28 |  |
| `components/Administration/Administration.tsx` | page | 0 | 0 | 0 | 0 | 0 | 11 | 18 |  |
| `components/Administration/PlantModelStatus.tsx` | page | 0 | 0 | 0 | 0 | 0 | 7 | 7 |  |
| `components/shared/ListPager.tsx` | shared | 0 | 0 | 0 | 0 | 0 | 4 | 4 |  |
| `components/Administration/adminUi.tsx` | page | 0 | 0 | 0 | 0 | 0 | 3 | 2 |  |
| `components/Cpm/health/TransmitterHealthPanel.tsx` | page | 0 | 0 | 0 | 0 | 0 | 3 | 0 |  |
| `components/shared/ErrorBoundary.tsx` | shared | 0 | 0 | 0 | 0 | 0 | 2 | 0 |  |
| `components/Cpm/windows/WindowResults.tsx` | page | 0 | 0 | 0 | 0 | 0 | 1 | 0 |  |
| `components/Designer/trend/TrendLegend.tsx` | page | 0 | 0 | 0 | 0 | 0 | 1 | 0 |  |
| `components/Designer/TrendCore.tsx` | page | 0 | 0 | 0 | 0 | 0 | 1 | 0 |  |
| `components/shared/FloodAlertBanner.tsx` | shared | 0 | 0 | 0 | 0 | 0 | 1 | 0 |  |

CPA uses no utility classes, so the last column gives the most frequent literal rather than the most frequent class. Full per-file data: [data/source-inventory.json](data/source-inventory.json).

### 4.4 Current surfaces against the Traverse targets

Current values are resolved in the browser ([data/css-custom-properties.json](data/css-custom-properties.json)). Targets are guide p.3.

| Role | Current token | Current Day | Target Day | Current Night | Target Night |
|---|---|---|---|---|---|
| Page | `--container-backdrop-color` | `rgb(224,224,224)` | `#F3F6FA` | `#0a0a0a` | `#0B1220` |
| Panel | `--container-background-color` | `rgb(247,247,247)` | `#FFFFFF` | `#141414` | `#111C2E` |
| Raised | `--container-section-color` | `rgb(240,240,240)` | `#E8EEF5` | `#1e1e1e` | `#18263B` |
| Divider | `--border-divider-color` | `rgb(221,221,221)` | `#D3DCE8` | `#282828` | `#2A3A52` |
| Primary text | `--element-active-color` | `rgb(31,31,31)` | `#152238` | `#d4d4d4` | `#EAF1FA` |
| Secondary text | `--element-neutral-color` | `rgb(83,83,83)` | `#4B5D73` | `#9a9a9a` | `#A8B7CC` |
| Muted text | `--element-inactive-color` | `rgb(112,112,112)` | `#596B81` | `#6e6e6e` | `#8D9FB7` |
| Primary action | `--instrument-enhanced-primary-color` | `rgb(29,60,103)` | `#006B83` | `rgb(88,200,162)` | `#54D6E8` |
| Focus | `--focus-color` | `rgb(66,113,179)` | `#006B83` | `#8a8a8a` | `#7CE8F4` |

Note the mapping is not one to one. `.cpm-surface` sits on the backdrop token, so in Day today's panels are darker than the page target by a wide margin.

### 4.5 Status and severity colour mappings (Part A.6)

Static source audit. Path prefixes: `F` = `src/frontend-ob/src`, `C` = `F/components/Cpm`, `A` = `F/components/Administration`, `S` = `C/shared.tsx`, `G` = `C/gateStatus.ts`. Tones: g = good, w = warn, b = bad, m = muted. Guide status: D/W/S/I/U = Danger, Warning, Success, Info, Unknown. OD = owner decision (no clear guide mapping).

| Tone | Token (`F/styles/cpm.css:32-35`) | Day | Night |
|---|---|---|---|
| g | `--alert-running-color` | `#008300` | `#008800` |
| w | `--alert-caution-color` | `#FFDB42` | `#897300` |
| b | `--alert-alarm-color` | `#E30019` | `#E90F20` |
| m | `--element-neutral-color` | `#535353` | `#9A9A9A` (OpenBridge `#C78842` overridden at `designTokens.css:187`) |
| admin `T.warning` | `--alert-warning-color` | `#FE9413` | `#BA5A00` |

No `--traverse-*` token exists anywhere in `F`. One tone renders three ways: pill = 8 px dot only (`cpm.css:83-87`), KPI tile = left border (`cpm.css:100-102`), matrix g = neutral ink, not green (`cpm.css:361`).

Every row carries a text label unless noted.

| Field | Evidence | Value → tone | Guide |
|---|---|---|---|
| Check gates | G:65-72,112-114 | PASS g; limited pass m; WARN w; FAIL b; G0-G2r FAIL m "Not usable"; EXCLUDED m | D/W clear; PASS OD |
| Diagnostic gates G5-11 | G:73-76,107-110 | PASS m "Not seen"; WARN w; FAIL/STRONG w | W; "Not seen" OD |
| G15 band | G:78-83; S:294-304 | CONFIRMED b; SUSPECTED/DETECTED/CLASSIFIED w; ruled out g; no fault m | D; weak bands OD (guide p.4: a hypothesis stays Info) |
| No result | G:85-87 | none, N/A, DISABLED, pending m | U; Pending is W in guide |
| `toneFor` catch-all | S:253-261 | CRITICAL/HIGH/BAD b; MEDIUM/SHELVED w; ACTIVE/RUNNING/HEALTHY/ACCEPTABLE g; else m | OD, spans fields |
| Condition | `C/explorer/summary/summaryText.ts:25-33` | "No problem found" g; not judged m | OD |
| Event severity | `C/events/EventDetail.tsx:35-38` | via `toneFor`; absent = diagnosis band | OD |
| Queue priority | `C/overview/priorityReason.ts:18-21` | HIGH b; MEDIUM w; LOW/none m | OD |
| Episode review | `C/events/shelfState.ts:61-67,108-112` | Unacked w; Acked g; Shelved m; expired unreviewed w | W; Ack OD |
| Condition/availability | EventDetail:133,137; `C/events/eventsState.ts:30-31` | OPEN w; Observed g; Unobservable w; LEGACY m | OD |
| Source quality | `F/hooks/useLoopLive.ts:91-99`; `C/FacetPill.tsx:56` | GOOD g; UNCERTAIN/MAINT w; OOS m; BAD b; aged GOOD w | OD, separate field |
| Mode | `C/CpmHistorical.tsx:145`; `C/evidence/HistorianLanes.tsx:38`; `A/LoopIngestPanel.tsx:39-41` | auto g; manual w (admin neutral); unknown m (admin b) | OD. `F/utils/modeVocabulary.ts:136-151` tone is not rendered at `C/explorer/summary/OperatingState.tsx:119-128` |
| Eligibility | `C/health/TransmitterHealthPanel.tsx:28-34,54-60` | ELIGIBLE g; LIMITED w; INELIGIBLE b; else m | OD |
| NE107 | TransmitterHealthPanel:21-25,77 | F alarm; S caution; **C running (green)**; M `--alert-limit-secondary-color` | Guide p.4 has fixed fills; all differ. M is `rgba(0,0,0,.04)` day, `rgba(255,255,255,.05)` night, used as text colour, so nearly invisible |
| Metric bands | `C/overview/GoodErrorBar.tsx:25`; `C/CpmWindows.tsx:188`; `C/CpmPipeline.tsx:160` | ≥80/50%; ≥.9/.5; ≥99% else w | OD |
| Fleet KPIs | `C/kpi/fleetKpiView.ts:24-34`; `C/kpi/KpiRowsTable.tsx:22`; `F/styles/cpm-loop-summary.css:113-121` | acceptable g; finding b; symptom/stale w | OD |
| Evidence score bar | `C/investigation/HypothesisPanel.tsx:36-38`; `cpm.css:1255-1256` | <.7 g, ≥.7 w | OD: lower evidence is greener |
| Hypothesis | HypothesisPanel:27-31 | QUALIFIED w; CONFIRMED b; CONTRADICTED g | OD |
| Evidence basis/readiness | `C/evidence/evidenceBasis.ts:73-94`; EvidenceHeaderStrip.tsx:43 | rebuilt w; retained m; COMPLETE g; FAILED b | S/D; rebuilt OD |
| Run state | `C/evidence/evaluationState.ts:50-61` | QUEUED m; RUNNING w; done g; failed b | RUNNING should be I |
| Bundle/deployment | `C/config/configSupport.ts:10-30`; `C/config/lifecycle.ts:18-30` | ACTIVE_VERIFIED g (ACK-window only w); in progress w; rejected/failed b | S/D; in progress I |
| Change class | `C/config/EffectiveView.tsx:16` plus inline PropertyTable:54, PropertyForm:68, DiffImpactPanel:30,44, ConfigOverview:107 | DEPLOYMENT b; STATE_BOUNDARY w | OD, not a fault |
| Response model | `C/response/responseSupport.ts:113-120` | VALIDATED/COMPLETE/ELIGIBLE g; CENSORED/CANDIDATE/WAITING w; REJECTED/FAILED b | ELIGIBLE, CANDIDATE OD |
| Jobs | CpmPipeline:145,155,213; CpmWindows:90 | RUNNING g, else b | OD |
| Audit events | `C/CpmGovernance.tsx:40-45`; `A/AuditExplorer.tsx:12-14` | DELETED b; SHELVED w; ACTIVATED/ACKNOWLEDGED g | OD |
| Registry | `C/registryShared.ts:20-27`; `C/ProfileAside.tsx:106` | Active g; Degraded w; CLEAR g | OD |
| Users/roles | `A/UserManagementConfig.tsx:31-34,254` | Admin b; Engineer orange; Active g. SuperAdmin has no entry and falls to Viewer style | OD: guide p.4 keeps status colour out of unrelated fields |
| Data sources | `A/DataSourcesConfig.tsx:143,147,182`; `A/AliasConfig.tsx:263`; `A/PlantModelStatus.tsx:35-39` | Active g; topic text g; SUCCESS g | OD |

**Token collisions (one token, unrelated meanings, against guide p.4 "keep ... in separate fields"):**

- `--alert-running-color`: gate pass, job running, AUTO, GOOD quality, Active, Function check and acknowledged.
- `--alert-caution-color`: pending approval, manual, medium priority, unacknowledged, Uncertain, sparse, stale and symptom.
- `--alert-alarm-color`: confirmed fault, DEPLOYMENT class, high priority, Admin role, invalid field and job down.

## 5. Charts (Part A.5)

Static source audit of the live slice. Runtime behaviour that was reasoned from code rather than observed is marked *(inferred)*. Ratios use the WCAG formula.

Path prefixes used in this section: `c/` = `src/frontend-ob/src/components/`, `tok` = `c/Designer/designTokens.css`, `ec/` = `src/frontend-ob/node_modules/echarts/lib/`.

**Scope result:** 11 echarts components, 6 CSS-bar components, 0 hand-drawn SVG, 0 d3. `<svg|path|rect|polyline|circle` has no hits in Cpm, Administration, charts, TrendPage, TrendCore or Designer/trend. No live page imports chart code from legacy pages; the only `d3` importer is `c/Soe/SoePanel.tsx:4`, which is out of scope. **No true frequency histogram exists in CPA.**

### 5.1 Inventory and theme switching

| ID | Component (option builder) | Routes | Library / renderer | Follows a theme change |
|---|---|---|---|---|
| C1 | `c/Cpm/trend/SignalTrend.tsx:25` (`trend/trendOption.ts:72`) | /cpm, /cpm/explorer, /cpm/investigation | echarts canvas | Yes (:55) |
| C2 | `c/Cpm/CpmHistorical.tsx:334` (`historical/chartOption.ts:110`) | /cpm/historical | echarts canvas | Yes (:216) |
| C3 | `c/Cpm/replay/ReplayChart.tsx:32,88` (time and phase plane) | /cpm/replay | echarts canvas | Yes (:102) |
| C4 | `c/Cpm/evidence/CpmChart.tsx:76,190` | /cpm/evidence, /cpm/response | echarts canvas | **No**: no theme hook |
| C5 | `c/Cpm/evidence/views/primitives/Trajectory.tsx:28` | /cpm/evidence | echarts canvas | **No** |
| C6 | `.../primitives/IntervalLane.tsx:27` | /cpm/evidence | echarts canvas | **No** |
| C7 | `c/Cpm/health/HealthLane.tsx:34` | /cpm/investigation | echarts canvas | **No**: deps at :63 omit the theme |
| C8 | `c/Cpm/evidence/views/G13Interaction.tsx:36,70` | /cpm/evidence | echarts canvas | **No** |
| C9 | `c/Cpm/kpi/KpiTrendChart.tsx:14` | /cpm/kpi | echarts **svg** (:66) | Yes (:61) |
| C10 | `c/Cpm/CpmPipeline.tsx:96,239` | /cpm/pipeline | echarts canvas | Yes (:117) |
| C11 | `c/Designer/TrendCore.tsx:329` (`trend/trendOption.ts:29`) | /trend | echarts canvas | Yes (:234-242) |
| C12-17 | CSS bars, see 5.6 | various | div bars | Token CSS, automatic |

C4, C5, C6 and C8 read colours during render with no subscription. `App.tsx:201-204` sets the theme attribute in an effect after render, so these four keep the old theme's colours until their next re-render *(inferred)*.

### 5.2 Colour sources

**Series.** `cpmChartColors()` (`c/Cpm/shared.tsx:45-54`) resolves tokens through `resolveCssColor`:

| Series | Token | Day | Night | Source |
|---|---|---|---|---|
| PV | `--ams-pen-2` | `#40c057` | `#51cf66` | tok:19,143 |
| OP | `--ams-pen-3` | `#fab005` | `#ffd43b` | tok:20,144 |
| VP | `--ams-pen-4` | `#e64980` | `#f783ac` | tok:21,145 |
| Accent | `--ams-pen-5` | `#7048e8` | `#9775fa` | tok:22,146 |
| SP, axes, text | `--element-neutral-color` | `rgb(83,83,83)` | `#9a9a9a` | tok:187 |

Lanes use `cpmToneColors()` (`shared.tsx:275-281`). C11 uses `PEN_TOKENS` (`c/Designer/trend/trendSupport.ts:50`). There, pen 1 is `--ams-crit` (tok:18) and `loopTrendHref` puts PV first (`shared.tsx:230`), so **PV is drawn in the alarm colour on /trend**. No file in `src/frontend-ob/src` uses `--traverse-*`.

**Chrome.** `--ams-*` overrides apply at night; the literals below apply in every theme.

| Part | Finding | Evidence |
|---|---|---|
| Tooltip | Never themed, so ECharts defaults (white background, `#666` text) apply in night too | `ec/component/tooltip/TooltipModel.js:78,118` |
| Grid | Opacity 0.2 with no colour, so the default `#E0E6F1` shows | `trendOption.ts:129`; `chartOption.ts:240`; `ReplayChart:44,71`; `CpmChart:91`; `Trajectory:43`; `CpmPipeline:106`; default at `ec/coord/axisDefault.js:115` |
| Grid, tokenised | C9 `c.grey` at 0.2 (:46); C11 `--ams-grid-line` (`trendOption.ts:41,46`) | |
| Axis line, ticks | Default `#6E7079` line on C3 x (:69), C5, C6, C10. C6 tick text is also default (`IntervalLane:32`): 3.74:1 day, 4.01:1 night, under 4.5:1 | `ec/coord/axisDefault.js:79` |
| Zoom slider | C2 sets only border and text (`chartOption.ts:198`); C11 only text (`trendOption.ts:112`). Filler `rgba(135,175,274,0.2)` and handles stay default | `ec/component/dataZoom/SliderZoomModel.js` |
| Fonts | C11 ticks 9-10 px (`trendOption.ts:39,45,98,112`); C2 lane labels literal `'12px sans-serif'` (`chartOption.ts:188-189`) | |

**Line contrast on the chart surface** (`.cpm-surface` = `--container-backdrop-color`, `styles/cpm.css:47`: `rgb(224,224,224)` day, `#0a0a0a` night). The guide requires 3:1 for necessary graphical cues (p.5).

| Series | Day | Night |
|---|---|---|
| PV | **1.79:1 fail** | 9.87:1 |
| OP | **1.41:1 fail** | 13.89:1 |
| VP | **2.83:1 fail** | 8.29:1 |
| SP | 5.83:1 | 7.04:1 |

### 5.3 PV, SP, OP and mode

| Chart | PV | SP | OP | Mode |
|---|---|---|---|---|
| C1 | Solid 2 (:144) | Dashed 1 (:147), legend only | Solid 1.5, "OP", axis "OP (%)" (:149,130) | **Not drawn** |
| C2 | Solid 2 (:270) | Dashed 1 (:274), legend only | Solid 1.5, "OP" (:278) | Lane on grid 2 (:289). Colour only; text appears only in the tooltip (:102-106, 228) |
| C3 | Solid 1.5 (:75) | Dashed 1 (:78), legend only | Solid 1, "OP" (:80) | **Not drawn** |
| C4 evidence lanes | Solid 1.5 (`CpmChart:105`) | **Solid**: no `dashed` (`SignalContextLanes.tsx:21-30`; `HistorianLanes.tsx:19-24`; `ShortViews.tsx:76`) | "OP", "OP (historian)", "op_requested", "u_applied" | Separate chart C6 |
| C11 | Solid 1.5 | **Solid**: `TrendPage.tsx:33` passes no style | Tag name | Strings dropped by `Number.isFinite` (`TrendCore.tsx:196-197`) *(inferred)* |

- Chart labels never say "Controller output" (guide p.12). The phrase appears only in a chip's accessible name (`c/Cpm/historical/RangeToolbar.tsx:34,170`), `c/Cpm/explorer/SignalsTab.tsx:24` and `c/Cpm/AddLoopWizard.tsx:39`.
- `endLabel` and `markPoint` have no hits, so no chart labels a series directly (guide p.5 requires a direct label plus line or marker distinction).
- C2 has no label for its fifth (HEALTH) lane (`chartOption.ts:187-190`).

### 5.4 Gaps, cursor synchronisation and value tables

| Chart | Gap handling | Time sync | Value table |
|---|---|---|---|
| C1 | Nulls kept (`trendOption.ts:90,146`); `connectNulls` unset, ECharts default false: broken line | None; Compare mode's two charts are unlinked | None |
| C2 signals | `connectNulls: false`, nulls kept: broken line | `axisPointer: { link: [{ xAxisIndex: 'all' }], snap: false }` (:186), within one chart only | None; exports only |
| C2 overlay | **Joined**: `.filter(... typeof r[overlay.key] === 'number')` (:157) removes the nulls | Same | None |
| C2 mode | **Bridged**: null modes filtered (`CpmHistorical:140`), `endMs = pts[i + 1]?.ts ?? to` (:146) | Same | None |
| C3 | Per-role nulls break the line, but raw rows exist only at samples (`src/services/historian-bff/IoTDbClient.cs:166-183`), so a full outage is **joined** *(inferred)* | Own cursor plus slider (:111) | None |
| C4 | `connectNulls: false`, `nan()` (:57,101). LTTB keeps NaN (`ec/data/DataStore.js:747-765`). Absent rows: not determined, depends on artifact contents. Also fed by historian mode bridging (`HistorianLanes:37-44`) | None | Removed; CSV only (:229-232) |
| C5 | Non-finite dropped (:30), sequence joined (phase plot) | n/a | None |
| C6, C7 | Empty space | None | C7 no |
| C9 | `pct` null gives an empty slot (`kpiTrend.ts:26`); "no data" in tooltip only | n/a | KpiRowsTable lists the loops |
| C10 | **Zero-filled**: `lastCompletedAgeSec ?? 0`, `lastDurationMs ?? 0` (:88,90) | None | None |
| C11 | **Joined**: `.filter(p => p.raw !== null ...)` (`TrendCore.tsx:195`), no nulls reach the series (`trendOption.ts:63`) | None | Cursor readout only (TrendLegend), no timestamp |

The historian trend query has no FILL clause (`IoTDbClient.cs:122-123`), so bucketed nulls are honest at source.

### 5.5 Units, source, coverage and accessibility on charts

| Chart | Units / scale | Time zone | Source | Aggregation | Coverage | Keyboard / aria |
|---|---|---|---|---|---|---|
| C1 | Axis names, Fit/Range toggle (:71) | Ticks browser, tooltip browser zone (`trendOption.ts:119`) | None | `BAND_NOTE` (:25) | None | Zoom buttons; chart none |
| C2 | Axes, Normalise | **Ticks browser (:166), tooltip site (:230): mismatch** | None | "PV range" tooltip | Notes (`CpmHistorical:360-394`) | None |
| C3 | Axes | **Ticks browser (:69), tooltip site (:66), cursor browser (:112)** | "raw" page text | Raw | Truncation note (:116) | Range input labelled (:111) |
| C4 | One axis per unit, but HistorianLanes hardcodes 'EU'/'pp' (:72-73) | Axis name and ticks site (:83-86) | Some titles (`HistorianLanes:16`) | `meta` (:24-27), decimation note (:225) | None | CSV button |
| C6 | Via title | Ticks site, zone in tooltip (:32,38) | Some titles | n/a | Empty text | None |
| C7 | n/a | Tooltip has no times | None | n/a | Empty text | `role="img"` label (:65) |
| C9 | % axis | Plant day, as-of tooltip | None | n of m tooltip | Tooltip | Click is mouse-only |
| C10 | Axis names | Browser, unlabelled | Page text | Max across jobs (:88) | Sample count | None |
| C11 | Unit may be a name guess (`trendSupport.ts:71-83`); no y-axis names | `tz`, unlabelled (`TrendCore:117-119`) | None | None | Failed-pen note | Zoom buttons |

The ECharts `aria` option has no uses. C5 and C8 were not assessed in detail (no zone applies to C5; C8 has a labelled table beside it, :72).

### 5.6 Distributions and proportion bars

No frequency histogram exists; these are the essential distribution marks. Ratios are against the panel, day / night. C13 and C17 surfaces are assumed `.cpm-surface` and were not traced page by page. C15 and C16 ratios are against the panel, not their tracks.

| Mark | Tokens (day → night) | Contrast |
|---|---|---|
| C12 density, `c/Cpm/windows/WindowDetail.tsx:237` | Normal `--instrument-enhanced-secondary-color` `rgb(45,84,139)` → `rgb(56,167,132)` | 5.78 / 6.63 |
| | Sparse `--alert-caution-color` `rgb(255,219,66)` → `rgb(137,115,0)` | **1.03** / 4.26 |
| | Empty neutral at 0.25 (`cpm.css:987`) | **1.42 / 1.46** |
| C13 GateRollup, `c/Cpm/GateRollup.tsx:67-70` (/cpm/performance) | Warn: caution | **1.03** / 4.26 |
| | Bad `--alert-alarm-color` `rgb(227,0,25)` → `rgb(233,15,32)` | 3.72 / 4.29 |
| C14 OperatingPicture, `c/Cpm/overview/OperatingPicture.tsx:69` (/cpm) | Running `rgb(0,131,0)` → `rgb(0,136,0)` | 3.75 / 4.26 |
| | Symptom: caution at 0.55 (`cpm-loop-summary.css:115`) | **1.03 / 2.05** |
| | Out of mode: neutral at 0.55 | **2.36 / 2.83** |
| C9 bars | Selected accent | 4.21 / 5.88 |
| | Others neutral at 0.55 (:53-54) | **2.36 / 2.83** |
| C15 GoodErrorBar, `overview/GoodErrorBar.tsx:29` (/cpm) | Running, caution, alarm | Caution **1.03** day (track differs) |
| C16 Meter, `kpi/KpiRowsTable.tsx:26` (/cpm/kpi) | Fill `--instrument-enhanced-primary-color` | 8.40 / 9.61; `aria-hidden` |
| C17 ScoreBar, `investigation/HypothesisPanel.tsx:34` | Running; high = caution | Caution **1.03** day |

Values resolved from `node_modules/@oicl/openbridge-webcomponents/dist/openbridge.css`, with night neutral and backdrop overridden at tok:181,187.

### 5.7 Skill contract versus canvas charts

`references/components.md:99` says to pass `var(--traverse-…)` strings to recharts. CPA uses echarts on canvas, where that does not work. Today `resolveCssColor` (`c/Cpm/shared.tsx:27-36`) appends a hidden span, sets `el.style.color`, and reads `getComputedStyle(el).color`; a duplicate is `resolveColor` (`c/Designer/trend/trendSupport.ts:51`). An ECharts chart needs:

1. Resolved literals at option build, through that helper, in `var(--x)` form. A bare name fails silently: `HealthLane.tsx:44` passes `'--on-surface-passive-color'`, which also does not exist as a token, on an axis line that is hidden.
2. A rebuild on theme change, with the theme in the `useMemo` deps. `useObcTheme` watches only `data-obc-theme` (`hooks/useObcTheme.ts:21`), while the skill contract writes `data-theme` (`components.md:107`).
3. Explicit `tooltip`, `axisPointer`, `splitLine`, `axisLine`, `axisLabel` and `dataZoom` colours, or ECharts defaults show through.
4. The tooltip is DOM, so its CSS strings reach `background-color` directly (`ec/component/tooltip/TooltipHTMLContent.js:152`). All other parts need literals.
5. Null points in `data` for gaps. `connectNulls: false` alone does nothing when the points were filtered out. The "No sample" band needs `markArea`.
6. The ECharts `aria` option plus a separate keyboard path.

## 6. Geometry and typography against the guide (Part A.7, A.8)

Measured in the browser at 1440 × 1024, across the 30 shell routes. Where a value varies, the range is given.

| Element | Guide p.6 | Measured | Result |
|---|---|---|---|
| Sidebar | 220 px, 64 px rail | 220 px on 30 of 30 routes; collapses fully, no rail | Width pass, rail fail |
| Header | 64 px | 64 px on 30 of 30 | Pass |
| Main outer padding | 24 px | 16 px on 30 of 30 | Fail |
| Panel gap | 16 px | 16 px | Pass |
| Panel radius | 12 px | 8 px; KPI card 10 px | Fail |
| Panel padding | 20 px | 16 px on most; 8 px 6 px, 8 px 0 and 0 on others | Fail |
| Buttons | 40 px minimum, 6 px radius | `ObcButton` 48 px; native buttons median 32, range 12-92.8. Radius 0, 4, 6, 8 and 999 px across routes | Fail |
| Inputs | 40 px minimum, 6 px radius | Median 39 px, range 13-81; `.cpm-select` 39 px, 6 px radius | Fail, narrowly on selects |
| Table rows | 44 px, 40 px compact | Median 52 px, range 32.5-115 | Fail |
| Table header | Not specified | 26.5-38.3 px | n/a |
| Inspector | 320-400 px | Not measured; varies by page | Not measured |
| Base type | 14 px | 14 px on `html` and `body` | Pass |
| Page title | 24 px | 19.6 px, weight 700 | Fail |
| Section title | 18 px | 14.7 px, weight 700 | Fail |
| Metadata | 12 px | 12.25 px eyebrow, uppercase | Near |
| Key text | 16 px | KPI value 22.4-28 px, weight 600 | Differs |
| Selected navigation | `surface.selected`, `action.primary` text, start-edge indicator, emphasis | `rgb(221,221,221)`, `rgb(31,31,31)`, 3 px `rgb(66,113,179)` left border, weight 500 | Indicator pass, colours fail |

**Typography.**

- Family: Noto Sans, self-hosted, passes guide p.6. Mono: Noto Sans Mono through `.cpm-mono`, on 13 routes.
- Rendered sizes: **28**, counted per text node: 13px (2,859), 13.02px (2,185), 12.25px (1,262), 14px (868), 10.5px (139), 11px (126), 12px (105), 11.5px (100), 16px (63), 14.7px (61), 12.5px (42), 10px (30), 19.6px (22), 13.3333px (21), 22.4px (19), 21px (18), 16.38px (14), 15px (10), 15.4px (9), 28px (8), 13.5px (7), 18.2px (5), 12.6px (4), 9.1875px (3), 13.3px (3), 18px (2), 37.44px (1), 32px (1).
- Source: 68 distinct `font-size` values, led by 12 px (172), 13 px (149), 11 px (139), 10 px (73). Twelve uses are 9 px or 9.5 px.
- Weights in source: 600 (221), 700 (214), 500 (21), 400 (8), 800 (5).
- Tabular numerals: on KPI values. **Table cells report `font-variant-numeric: normal`**, so columns of values do not use them (guide p.6).
- Monospace for identifiers: partly. Table cells use Noto Sans for tags unless `.cpm-mono` is applied.

## 7. Routes and screenshots (Part B)

### 7.1 Route inventory

Source: `App.tsx`, `productSlice.ts`, `components/nav/navItems.ts`, `Administration.tsx`. `productSlice.ts` sets `CPA_SLICE_ONLY = true`, so `/dashboard`, `/alarms`, `/live-events`, `/soe`, `/historical`, `/iotdb-trend`, `/analytics`, `/displays`, `/designer*`, `/display/:id`, `/my-view/:id` and `/edge` all redirect to `/cpm`.

| Route | In navigation | Permission | Parameters | Real ID used |
|---|---|---|---|---|
| `/login` | No (entry) | None | none | |
| `/cpm` | Yes | `analytics.view` | `site, area, unit, window, loop` | |
| `/cpm/performance` | Yes | `analytics.view` | `window, loop, gate, rows, fg, page, view, health` | |
| `/cpm/events` | Yes | `analytics.view` | `filter, event, sort, loop` | Event 1968 exists |
| `/cpm/explorer` | Yes | `analytics.view` | `loop, tab, window, gate` | FIC10401 |
| `/cpm/historical` | Yes | `analytics.view` | `loop, kpi, signals, from, to, window, normalize, focus` | FIC10401 |
| `/cpm/investigation` | Yes | `analytics.view` | `loop, profile, case, mode, window` | FIC10401 |
| `/cpm/evidence` | Yes | `analytics.view` | `loop, gate, before, methodRun, view, kind` | FIC10401 |
| `/cpm/replay` | Yes | `analytics.view` | `loop, gate, window` | FIC10401 |
| `/cpm/windows` | Yes | `analytics.view` | `loop, profile, window` | FIC10401 |
| `/cpm/calculations` | Yes | `analytics.view` | `loop, gate, metric` | FIC10401 |
| `/cpm/response` | Yes | `analytics.view` | `loop, event, methodRun` | FIC10401 |
| `/cpm/registry` | Yes | `analytics.view` | `loop` | |
| `/trend` | Yes | `historian.view` | `tags, range, from, to` | FIC10401 pv, sp, op |
| `/cpm/config` | Yes, SuperAdmin session | `cpm.config.read` | `loop, view, bundle, gate, tab` | FIC10401 |
| `/admin/*` (7 tabs) | Yes, SuperAdmin session | Per tab | none | |

**Hidden but reachable:**

| Route | Why hidden | Note |
|---|---|---|
| `/cpm/kpi` | Opened from an Overview tile, not the menu | `kpi` values are in `api/cpm/fleetKpis.ts:9-11`; `acceptable` used |
| `/cpm/pipeline`, `/cpm/governance` | `system.manage`, SuperAdmin only | Silent redirect for others (`App.tsx:808`) |
| `/admin/alarm-feed`, `/admin/opc-servers`, `/admin/alarm-rules`, `/admin/notifications` | Not in `SLICE_ADMIN_TABS` | Redirect to the first allowed tab |

### 7.2 Route capture results

Every image is linked below. 1366 × 768 and 1920 × 1080 captures of the key pages (`overview`, `performance`, `explorer`, `historical`, `kpi`) sit in `screenshots/current/<theme>/1366x768/` and `1920x1080/`, with `--full` versions for long pages. Per-route timings, console output and measurements: [screenshots/current/manifest.json](screenshots/current/manifest.json).

| Route | URL | Nav | Stable | ms to stable | Console err / warn | API ≥ 400 | Images |
|---|---|---|---|---|---|---|---|
| login | `/login` | no | yes | 1507 | 0 / 0 | 0 | [day](screenshots/current/day/1440x1024/login.png) · [bright](screenshots/current/bright/1440x1024/login.png) · [night](screenshots/current/night/1440x1024/login.png) |
| overview | `/cpm` | yes | yes | 2564 | 0 / 0 | 0 | [day](screenshots/current/day/1440x1024/overview.png) · [bright](screenshots/current/bright/1440x1024/overview.png) · [night](screenshots/current/night/1440x1024/overview.png) |
| performance | `/cpm/performance` | yes | yes | 3257 | 0 / 0 | 0 | [day](screenshots/current/day/1440x1024/performance.png) · [bright](screenshots/current/bright/1440x1024/performance.png) · [night](screenshots/current/night/1440x1024/performance.png) |
| events | `/cpm/events` | yes | yes | 9730 | 0 / 0 | 0 | [day](screenshots/current/day/1440x1024/events.png) · [bright](screenshots/current/bright/1440x1024/events.png) · [night](screenshots/current/night/1440x1024/events.png) |
| explorer | `/cpm/explorer?loop=FIC10401` | yes | **no** | 25226 | 0 / 0 | 0 | [day](screenshots/current/day/1440x1024/explorer.png) · [bright](screenshots/current/bright/1440x1024/explorer.png) · [night](screenshots/current/night/1440x1024/explorer.png) |
| explorer-signals | `/cpm/explorer?loop=FIC10401&tab=Signals` | no | yes | 3493 | 1 / 0 | 1 | [day](screenshots/current/day/1440x1024/explorer-signals.png) · [bright](screenshots/current/bright/1440x1024/explorer-signals.png) · [night](screenshots/current/night/1440x1024/explorer-signals.png) |
| explorer-calculations | `/cpm/explorer?loop=FIC10401&tab=Calculations` | no | yes | 16080 | 0 / 0 | 0 | [day](screenshots/current/day/1440x1024/explorer-calculations.png) · [bright](screenshots/current/bright/1440x1024/explorer-calculations.png) · [night](screenshots/current/night/1440x1024/explorer-calculations.png) |
| explorer-relationships | `/cpm/explorer?loop=FIC10401&tab=Relationships` | no | yes | 10144 | 0 / 0 | 0 | [day](screenshots/current/day/1440x1024/explorer-relationships.png) · [bright](screenshots/current/bright/1440x1024/explorer-relationships.png) · [night](screenshots/current/night/1440x1024/explorer-relationships.png) |
| explorer-history | `/cpm/explorer?loop=FIC10401&tab=History` | no | yes | 522 | 0 / 0 | 0 | [day](screenshots/current/day/1440x1024/explorer-history.png) · [bright](screenshots/current/bright/1440x1024/explorer-history.png) · [night](screenshots/current/night/1440x1024/explorer-history.png) |
| historical | `/cpm/historical?loop=FIC10401` | yes | yes | 3027 | 0 / 0 | 0 | [day](screenshots/current/day/1440x1024/historical.png) · [bright](screenshots/current/bright/1440x1024/historical.png) · [night](screenshots/current/night/1440x1024/historical.png) |
| investigation | `/cpm/investigation?loop=FIC10401` | yes | yes | 5095 | 0 / 0 | 0 | [day](screenshots/current/day/1440x1024/investigation.png) · [bright](screenshots/current/bright/1440x1024/investigation.png) · [night](screenshots/current/night/1440x1024/investigation.png) |
| evidence | `/cpm/evidence?loop=FIC10401` | yes | yes | 3019 | 0 / 0 | 0 | [day](screenshots/current/day/1440x1024/evidence.png) · [bright](screenshots/current/bright/1440x1024/evidence.png) · [night](screenshots/current/night/1440x1024/evidence.png) |
| replay | `/cpm/replay?loop=FIC10401` | yes | yes | 4825 | 0 / 0 | 0 | [day](screenshots/current/day/1440x1024/replay.png) · [bright](screenshots/current/bright/1440x1024/replay.png) · [night](screenshots/current/night/1440x1024/replay.png) |
| windows | `/cpm/windows?loop=FIC10401` | yes | yes | 8129 | 0 / 0 | 0 | [day](screenshots/current/day/1440x1024/windows.png) · [bright](screenshots/current/bright/1440x1024/windows.png) · [night](screenshots/current/night/1440x1024/windows.png) |
| calculations | `/cpm/calculations?loop=FIC10401` | yes | yes | 1143 | 0 / 0 | 0 | [day](screenshots/current/day/1440x1024/calculations.png) · [bright](screenshots/current/bright/1440x1024/calculations.png) · [night](screenshots/current/night/1440x1024/calculations.png) |
| response | `/cpm/response?loop=FIC10401` | yes | yes | 1911 | 0 / 0 | 0 | [day](screenshots/current/day/1440x1024/response.png) · [bright](screenshots/current/bright/1440x1024/response.png) · [night](screenshots/current/night/1440x1024/response.png) |
| registry | `/cpm/registry` | yes | yes | 1416 | 0 / 0 | 0 | [day](screenshots/current/day/1440x1024/registry.png) · [bright](screenshots/current/bright/1440x1024/registry.png) · [night](screenshots/current/night/1440x1024/registry.png) |
| config | `/cpm/config` | yes | yes | 3972 | 0 / 0 | 0 | [day](screenshots/current/day/1440x1024/config.png) · [bright](screenshots/current/bright/1440x1024/config.png) · [night](screenshots/current/night/1440x1024/config.png) |
| config-effective | `/cpm/config?loop=FIC10401&view=effective` | no | yes | 969 | 0 / 0 | 0 | [day](screenshots/current/day/1440x1024/config-effective.png) · [bright](screenshots/current/bright/1440x1024/config-effective.png) · [night](screenshots/current/night/1440x1024/config-effective.png) |
| config-bundles | `/cpm/config?loop=FIC10401&view=bundles` | no | yes | 961 | 0 / 0 | 0 | [day](screenshots/current/day/1440x1024/config-bundles.png) · [bright](screenshots/current/bright/1440x1024/config-bundles.png) · [night](screenshots/current/night/1440x1024/config-bundles.png) |
| kpi | `/cpm/kpi?kpi=acceptable` | hidden | yes | 3359 | 0 / 0 | 0 | [day](screenshots/current/day/1440x1024/kpi.png) · [bright](screenshots/current/bright/1440x1024/kpi.png) · [night](screenshots/current/night/1440x1024/kpi.png) |
| trend | `/trend?tags=hdpe%2Fsection_600%2Fu6002_pellet_homogenization` | yes | yes | 3144 | 0 / 0 | 0 | [day](screenshots/current/day/1440x1024/trend.png) · [bright](screenshots/current/bright/1440x1024/trend.png) · [night](screenshots/current/night/1440x1024/trend.png) |
| admin-users | `/admin/users` | yes | yes | 3073 | 0 / 0 | 0 | [day](screenshots/current/day/1440x1024/admin-users.png) · [bright](screenshots/current/bright/1440x1024/admin-users.png) · [night](screenshots/current/night/1440x1024/admin-users.png) |
| admin-roles | `/admin/roles` | yes | yes | 1672 | 0 / 0 | 0 | [day](screenshots/current/day/1440x1024/admin-roles.png) · [bright](screenshots/current/bright/1440x1024/admin-roles.png) · [night](screenshots/current/night/1440x1024/admin-roles.png) |
| admin-data-sources | `/admin/data-sources` | yes | yes | 2836 | 0 / 0 | 0 | [day](screenshots/current/day/1440x1024/admin-data-sources.png) · [bright](screenshots/current/bright/1440x1024/admin-data-sources.png) · [night](screenshots/current/night/1440x1024/admin-data-sources.png) |
| admin-plant-model | `/admin/plant-model` | yes | yes | 5114 | 0 / 0 | 0 | [day](screenshots/current/day/1440x1024/admin-plant-model.png) · [bright](screenshots/current/bright/1440x1024/admin-plant-model.png) · [night](screenshots/current/night/1440x1024/admin-plant-model.png) |
| admin-aliases | `/admin/aliases` | yes | yes | 2590 | 0 / 0 | 0 | [day](screenshots/current/day/1440x1024/admin-aliases.png) · [bright](screenshots/current/bright/1440x1024/admin-aliases.png) · [night](screenshots/current/night/1440x1024/admin-aliases.png) |
| admin-audit | `/admin/audit` | yes | yes | 16103 | 0 / 0 | 0 | [day](screenshots/current/day/1440x1024/admin-audit.png) · [bright](screenshots/current/bright/1440x1024/admin-audit.png) · [night](screenshots/current/night/1440x1024/admin-audit.png) |
| admin-system | `/admin/system` | yes | yes | 484 | 0 / 0 | 0 | [day](screenshots/current/day/1440x1024/admin-system.png) · [bright](screenshots/current/bright/1440x1024/admin-system.png) · [night](screenshots/current/night/1440x1024/admin-system.png) |
| pipeline | `/cpm/pipeline` | hidden | yes | 13518 | 0 / 0 | 0 | [day](screenshots/current/day/1440x1024/pipeline.png) · [bright](screenshots/current/bright/1440x1024/pipeline.png) · [night](screenshots/current/night/1440x1024/pipeline.png) |
| governance | `/cpm/governance` | hidden | **no** | 25102 | 0 / 0 | 0 | [day](screenshots/current/day/1440x1024/governance.png) · [bright](screenshots/current/bright/1440x1024/governance.png) · [night](screenshots/current/night/1440x1024/governance.png) |

The one API failure was `500 /api/v1/cpm/loops/FIC10401/readiness` on `explorer-signals` in Day. `explorer` in Day and `config` in Bright, `governance` in Day did not settle within 25 s, because of live polling or slow lab responses; their images were still taken.

### 7.3 States and surfaces

Loading, error, partial, restricted and stale were simulated in the browser only: held responses, a 503 or 403 answered locally, or a shifted browser clock. Captured in Day and Night. A guard aborted any non-GET API call outside a read-only allowlist. **Blocked writes: 0.**

| State image | Themes | How reached | What the page showed |
|---|---|---|---|
| overview--loading | [day](screenshots/current/day/states/overview--loading.png) · [night](screenshots/current/night/states/overview--loading.png) | GET responses held 7 s in the browser, first visit | Loading… |
| performance--loading | [day](screenshots/current/day/states/performance--loading.png) · [night](screenshots/current/night/states/performance--loading.png) | GET responses held 7 s in the browser, first visit | FIND PROBLEMS Performance Compare every loop gate by gate and see where the plant is failing. 12h 24h Verdicts |
| events--loading | [day](screenshots/current/day/states/events--loading.png) · [night](screenshots/current/night/states/events--loading.png) | GET responses held 7 s in the browser, first visit | Loading… |
| explorer--loading | [day](screenshots/current/day/states/explorer--loading.png) · [night](screenshots/current/night/states/explorer--loading.png) | GET responses held 7 s in the browser, first visit | Loading… |
| historical--loading | [day](screenshots/current/day/states/historical--loading.png) · [night](screenshots/current/night/states/historical--loading.png) | GET responses held 7 s in the browser, first visit | Loading… |
| investigation--loading | [day](screenshots/current/day/states/investigation--loading.png) · [night](screenshots/current/night/states/investigation--loading.png) | GET responses held 7 s in the browser, first visit | UNDERSTAND THE CAUSE Investigation Start here: the conclusion, the evidence behind it and what to check next.  |
| evidence--loading | [day](screenshots/current/day/states/evidence--loading.png) · [night](screenshots/current/night/states/evidence--loading.png) | GET responses held 7 s in the browser, first visit | Loading… |
| windows--loading | [day](screenshots/current/day/states/windows--loading.png) · [night](screenshots/current/night/states/windows--loading.png) | GET responses held 7 s in the browser, first visit | UNDERSTAND THE CAUSE Window inspector Which windows were evaluated and whether they had enough data. CHECKING  |
| calculations--loading | [day](screenshots/current/day/states/calculations--loading.png) · [night](screenshots/current/night/states/calculations--loading.png) | GET responses held 7 s in the browser, first visit | UNDERSTAND THE CAUSE Calculations Every calculated metric for a loop, with its latest value and method. 12h 24 |
| response--loading | [day](screenshots/current/day/states/response--loading.png) · [night](screenshots/current/night/states/response--loading.png) | GET responses held 7 s in the browser, first visit | Loading… |
| registry--loading | [day](screenshots/current/day/states/registry--loading.png) · [night](screenshots/current/night/states/registry--loading.png) | GET responses held 7 s in the browser, first visit | SET UP Loop registry Add individual loops or validate a bulk registry import. Onboarded loops are evaluated im |
| kpi--loading | [day](screenshots/current/day/states/kpi--loading.png) · [night](screenshots/current/night/states/kpi--loading.png) | GET responses held 7 s in the browser, first visit | Operations overview FIND PROBLEMS Performing acceptably The loops behind one Overview number, and the value th |
| overview--error | [day](screenshots/current/day/states/overview--error.png) · [night](screenshots/current/night/states/overview--error.png) | CPM API answered 503 in the browser, first visit | FIND PROBLEMS Operations overview Which loops need attention first, and why. 12h 24h SITE All sites Dallas Ter |
| performance--error | [day](screenshots/current/day/states/performance--error.png) · [night](screenshots/current/night/states/performance--error.png) | CPM API answered 503 in the browser, first visit | FIND PROBLEMS Performance Compare every loop gate by gate and see where the plant is failing. 12h 24h Verdicts |
| events--error | [day](screenshots/current/day/states/events--error.png) · [night](screenshots/current/night/states/events--error.png) | CPM API answered 503 in the browser, first visit | FIND PROBLEMS Loop events Investigate diagnosis episodes with operating context and a traceable response histo |
| explorer--error | [day](screenshots/current/day/states/explorer--error.png) · [night](screenshots/current/night/states/explorer--error.png) | CPM API answered 503 in the browser, first visit | CHECK A LOOP Loop explorer One loop's current condition, trend and gate results. 12h 24h LOOP FIC10401 loading |
| historical--error | [day](screenshots/current/day/states/historical--error.png) · [night](screenshots/current/night/states/historical--error.png) | CPM API answered 503 in the browser, first visit | CHECK A LOOP Historical A loop's signals, KPIs, mode and verdicts over a past period. 12h 24h LOOP FIC10401 no |
| investigation--error | [day](screenshots/current/day/states/investigation--error.png) · [night](screenshots/current/night/states/investigation--error.png) | CPM API answered 503 in the browser, first visit | UNDERSTAND THE CAUSE Investigation Start here: the conclusion, the evidence behind it and what to check next.  |
| evidence--error | [day](screenshots/current/day/states/evidence--error.png) · [night](screenshots/current/night/states/evidence--error.png) | CPM API answered 503 in the browser, first visit | LOOP FIC10401 loading… PERIOD 12h windows (none opened) SITE All sites Dallas Terminal (dallas) HDPE Plant (hd |
| windows--error | [day](screenshots/current/day/states/windows--error.png) · [night](screenshots/current/night/states/windows--error.png) | CPM API answered 503 in the browser, first visit | UNDERSTAND THE CAUSE Window inspector Which windows were evaluated and whether they had enough data. CHECKING  |
| calculations--error | [day](screenshots/current/day/states/calculations--error.png) · [night](screenshots/current/night/states/calculations--error.png) | CPM API answered 503 in the browser, first visit | UNDERSTAND THE CAUSE Calculations Every calculated metric for a loop, with its latest value and method. 12h 24 |
| response--error | [day](screenshots/current/day/states/response--error.png) · [night](screenshots/current/night/states/response--error.png) | CPM API answered 503 in the browser, first visit | UNDERSTAND THE CAUSE System response — FIC10401 Site zone UTC. Every event is listed with its state and reason |
| registry--error | [day](screenshots/current/day/states/registry--error.png) · [night](screenshots/current/night/states/registry--error.png) | CPM API answered 503 in the browser, first visit | SET UP Loop registry Add individual loops or validate a bulk registry import. Onboarded loops are evaluated im |
| kpi--error | [day](screenshots/current/day/states/kpi--error.png) · [night](screenshots/current/night/states/kpi--error.png) | CPM API answered 503 in the browser, first visit | Operations overview FIND PROBLEMS acceptable The loops behind one Overview number, and the value that put each |
| overview--restricted | [day](screenshots/current/day/states/overview--restricted.png) · [night](screenshots/current/night/states/overview--restricted.png) | CPM API answered 403 in the browser | FIND PROBLEMS Operations overview Which loops need attention first, and why. 12h 24h SITE All sites Dallas Ter |
| registry--restricted | [day](screenshots/current/day/states/registry--restricted.png) · [night](screenshots/current/night/states/registry--restricted.png) | CPM API answered 403 in the browser | SET UP Loop registry Add individual loops or validate a bulk registry import. Onboarded loops are evaluated im |
| overview--partial | [day](screenshots/current/day/states/overview--partial.png) · [night](screenshots/current/night/states/overview--partial.png) | Only /fleet/kpis answered 503 | FIND PROBLEMS Operations overview Which loops need attention first, and why. 12h 24h SITE All sites Dallas Ter |
| explorer--partial | [day](screenshots/current/day/states/explorer--partial.png) · [night](screenshots/current/night/states/explorer--partial.png) | Only the historian API answered 503 | CHECK A LOOP Loop explorer One loop's current condition, trend and gate results. 12h 24h LOOP FIC10401 Flow co |
| historical--partial | [day](screenshots/current/day/states/historical--partial.png) · [night](screenshots/current/night/states/historical--partial.png) | Only the historian API answered 503 | CHECK A LOOP Historical A loop's signals, KPIs, mode and verdicts over a past period. 12h 24h LOOP FIC10401 Fl |
| overview--empty | [day](screenshots/current/day/states/overview--empty.png) · [night](screenshots/current/night/states/overview--empty.png) | URL only | FIND PROBLEMS Operations overview Which loops need attention first, and why. 12h 24h SITE All sites Dallas Ter |
| performance--empty | [day](screenshots/current/day/states/performance--empty.png) · [night](screenshots/current/night/states/performance--empty.png) | URL only | FIND PROBLEMS Performance Compare every loop gate by gate and see where the plant is failing. 12h 24h Verdicts |
| performance--empty-filter | [day](screenshots/current/day/states/performance--empty-filter.png) · [night](screenshots/current/night/states/performance--empty-filter.png) | URL only | FIND PROBLEMS Performance Compare every loop gate by gate and see where the plant is failing. 12h 24h Verdicts |
| events--empty | [day](screenshots/current/day/states/events--empty.png) · [night](screenshots/current/night/states/events--empty.png) | URL only | FIND PROBLEMS Loop events Investigate diagnosis episodes with operating context and a traceable response histo |
| calculations--empty | [day](screenshots/current/day/states/calculations--empty.png) · [night](screenshots/current/night/states/calculations--empty.png) | URL only | UNDERSTAND THE CAUSE Calculations Every calculated metric for a loop, with its latest value and method. 12h 24 |
| historical--empty | [day](screenshots/current/day/states/historical--empty.png) · [night](screenshots/current/night/states/historical--empty.png) | URL only | CHECK A LOOP Historical A loop's signals, KPIs, mode and verdicts over a past period. 12h 24h LOOP FIC10401 Fl |
| registry--empty | [day](screenshots/current/day/states/registry--empty.png) · [night](screenshots/current/night/states/registry--empty.png) | URL only | SET UP Loop registry Add individual loops or validate a bulk registry import. Onboarded loops are evaluated im |
| kpi--empty | [day](screenshots/current/day/states/kpi--empty.png) · [night](screenshots/current/night/states/kpi--empty.png) | URL only | Operations overview FIND PROBLEMS Oscillating The loops behind one Overview number, and the value that put eac |
| trend--empty | [day](screenshots/current/day/states/trend--empty.png) · [night](screenshots/current/night/states/trend--empty.png) | URL only | Trend From To Apply window LIVE 0 pens No tags selected 04/11, 14:37:04 15m 1h 8h 1d 1w ◀ ⏸ ▶▶ Now 04/11, 14:5 |
| explorer--empty | [day](screenshots/current/day/states/explorer--empty.png) · [night](screenshots/current/night/states/explorer--empty.png) | URL only | CHECK A LOOP Loop explorer One loop's current condition, trend and gate results. 12h 24h SITE All sites Dallas |
| investigation--empty | [day](screenshots/current/day/states/investigation--empty.png) · [night](screenshots/current/night/states/investigation--empty.png) | URL only | UNDERSTAND THE CAUSE Investigation Start here: the conclusion, the evidence behind it and what to check next.  |
| explorer--no-selection | [day](screenshots/current/day/states/explorer--no-selection.png) · [night](screenshots/current/night/states/explorer--no-selection.png) | URL only | CHECK A LOOP Loop explorer One loop's current condition, trend and gate results. 12h 24h SITE All sites Dallas |
| historical--no-selection | [day](screenshots/current/day/states/historical--no-selection.png) · [night](screenshots/current/night/states/historical--no-selection.png) | URL only | CHECK A LOOP Historical A loop's signals, KPIs, mode and verdicts over a past period. 12h 24h SCOPE SITE All s |
| evidence--no-selection | [day](screenshots/current/day/states/evidence--no-selection.png) · [night](screenshots/current/night/states/evidence--no-selection.png) | URL only | SITE All sites Dallas Terminal (dallas) HDPE Plant (hdpe) Houston Refinery (houston) AREA — select a site — UN |
| replay--no-selection | [day](screenshots/current/day/states/replay--no-selection.png) · [night](screenshots/current/night/states/replay--no-selection.png) | URL only | UNDERSTAND THE CAUSE Evidence replay Replay the raw samples behind a verdict and re-run the calculation. 12h 2 |
| windows--no-selection | [day](screenshots/current/day/states/windows--no-selection.png) · [night](screenshots/current/night/states/windows--no-selection.png) | URL only | UNDERSTAND THE CAUSE Window inspector Which windows were evaluated and whether they had enough data. CPLM jobs |
| calculations--no-selection | [day](screenshots/current/day/states/calculations--no-selection.png) · [night](screenshots/current/night/states/calculations--no-selection.png) | URL only | UNDERSTAND THE CAUSE Calculations Every calculated metric for a loop, with its latest value and method. 12h 24 |
| response--no-selection | [day](screenshots/current/day/states/response--no-selection.png) · [night](screenshots/current/night/states/response--no-selection.png) | URL only | UNDERSTAND THE CAUSE System response Process models estimated from setpoint or output steps. SITE All sites Da |
| investigation--no-selection | [day](screenshots/current/day/states/investigation--no-selection.png) · [night](screenshots/current/night/states/investigation--no-selection.png) | URL only | UNDERSTAND THE CAUSE Investigation Start here: the conclusion, the evidence behind it and what to check next.  |
| explorer--missing-record | [day](screenshots/current/day/states/explorer--missing-record.png) · [night](screenshots/current/night/states/explorer--missing-record.png) | URL only | CHECK A LOOP Loop explorer One loop's current condition, trend and gate results. 12h 24h LOOP zz_none not in t |
| events--missing-record | [day](screenshots/current/day/states/events--missing-record.png) · [night](screenshots/current/night/states/events--missing-record.png) | URL only | FIND PROBLEMS Loop events Investigate diagnosis episodes with operating context and a traceable response histo |
| overview--missing-record | [day](screenshots/current/day/states/overview--missing-record.png) · [night](screenshots/current/night/states/overview--missing-record.png) | URL only | FIND PROBLEMS Operations overview Which loops need attention first, and why. 12h 24h SITE All sites Dallas Ter |
| kpi--error-server | [day](screenshots/current/day/states/kpi--error-server.png) · [night](screenshots/current/night/states/kpi--error-server.png) | URL only | Operations overview FIND PROBLEMS KPI The loops behind one Overview number, and the value that put each one th |
| performance--error-server | [day](screenshots/current/day/states/performance--error-server.png) · [night](screenshots/current/night/states/performance--error-server.png) | URL only | FIND PROBLEMS Performance Compare every loop gate by gate and see where the plant is failing. 12h 24h Verdicts |
| evidence--error-server | [day](screenshots/current/day/states/evidence--error-server.png) · [night](screenshots/current/night/states/evidence--error-server.png) | URL only | LOOP FIC10401 Flow controller FIC10401 (FCS0101) FIC · criticality medium LOCATION HDPE › Section 600 › U6002  |
| shell--command-palette | [day](screenshots/current/day/states/shell--command-palette.png) · [night](screenshots/current/night/states/shell--command-palette.png) | opened, not submitted | FIND PROBLEMS Operations overview Which loops need attention first, and why. 12h 24h SITE All sites Dallas Ter |
| performance--help-open | [day](screenshots/current/day/states/performance--help-open.png) · [night](screenshots/current/night/states/performance--help-open.png) | opened, not submitted | FIND PROBLEMS Performance Compare every loop gate by gate and see where the plant is failing. 12h 24h Verdicts |
| performance--gate-cell | [day](screenshots/current/day/states/performance--gate-cell.png) · [night](screenshots/current/night/states/performance--gate-cell.png) | opened, not submitted | FIND PROBLEMS Performance Compare every loop gate by gate and see where the plant is failing. 12h 24h Verdicts |
| events--detail | [day](screenshots/current/day/states/events--detail.png) · [night](screenshots/current/night/states/events--detail.png) | opened, not submitted | FIND PROBLEMS Loop events Investigate diagnosis episodes with operating context and a traceable response histo |
| explorer--gate-detail | [day](screenshots/current/day/states/explorer--gate-detail.png) · [night](screenshots/current/night/states/explorer--gate-detail.png) | opened, not submitted | CHECK A LOOP Loop explorer One loop's current condition, trend and gate results. 12h 24h LOOP FIC10401 Flow co |
| historical--chart-tooltip | [day](screenshots/current/day/states/historical--chart-tooltip.png) · [night](screenshots/current/night/states/historical--chart-tooltip.png) | opened, not submitted | CHECK A LOOP Historical A loop's signals, KPIs, mode and verdicts over a past period. 12h 24h LOOP FIC10401 Fl |
| calculations--drawer | [day](screenshots/current/day/states/calculations--drawer.png) · [night](screenshots/current/night/states/calculations--drawer.png) | opened, not submitted | UNDERSTAND THE CAUSE Calculations Every calculated metric for a loop, with its latest value and method. 12h 24 |
| registry--add-loop-dialog | [day](screenshots/current/day/states/registry--add-loop-dialog.png) · [night](screenshots/current/night/states/registry--add-loop-dialog.png) | opened, not submitted | SET UP Loop registry Add individual loops or validate a bulk registry import. Onboarded loops are evaluated im |
| registry--bulk-import-dialog | [day](screenshots/current/day/states/registry--bulk-import-dialog.png) · [night](screenshots/current/night/states/registry--bulk-import-dialog.png) | opened, not submitted | SET UP Loop registry Add individual loops or validate a bulk registry import. Onboarded loops are evaluated im |
| performance--stale | [day](screenshots/current/day/states/performance--stale.png) · [night](screenshots/current/night/states/performance--stale.png) | browser clock shifted +5 h | FIND PROBLEMS Performance Compare every loop gate by gate and see where the plant is failing. 12h 24h Verdicts |
| overview--stale | [day](screenshots/current/day/states/overview--stale.png) · [night](screenshots/current/night/states/overview--stale.png) | browser clock shifted +5 h | FIND PROBLEMS Operations overview Which loops need attention first, and why. 12h 24h SITE All sites Dallas Ter |
| config--loading | [day](screenshots/current/day/states/config--loading.png) · [night](screenshots/current/night/states/config--loading.png) | GET responses held 7 s in the browser, first visit | Loading… |
| config-effective--loading | [day](screenshots/current/day/states/config-effective--loading.png) · [night](screenshots/current/night/states/config-effective--loading.png) | GET responses held 7 s in the browser, first visit | SET UP · GATE CONFIGURATION FIC10401 What this loop runs under today, the bundles at its three levels, and the |
| pipeline--loading | [day](screenshots/current/day/states/pipeline--loading.png) · [night](screenshots/current/night/states/pipeline--loading.png) | GET responses held 7 s in the browser, first visit | RUNTIME INTERNALS Pipeline health The Flink/Kafka runtime that produces every verdict. This view is read-only; |
| governance--loading | [day](screenshots/current/day/states/governance--loading.png) · [night](screenshots/current/night/states/governance--loading.png) | GET responses held 7 s in the browser, first visit | Loading… |
| admin-users--loading | [day](screenshots/current/day/states/admin-users--loading.png) · [night](screenshots/current/night/states/admin-users--loading.png) | GET responses held 7 s in the browser, first visit | Loading… |
| admin-audit--loading | [day](screenshots/current/day/states/admin-audit--loading.png) · [night](screenshots/current/night/states/admin-audit--loading.png) | GET responses held 7 s in the browser, first visit | System Administration User management, plant model, data sources, and audit User Management Roles & Permission |
| config--error | [day](screenshots/current/day/states/config--error.png) · [night](screenshots/current/night/states/config--error.png) | CPM API answered 503 in the browser, first visit | SET UP Gate configuration What each loop runs under, the bundles in progress, and the editor for one of them.  |
| config-effective--error | [day](screenshots/current/day/states/config-effective--error.png) · [night](screenshots/current/night/states/config-effective--error.png) | CPM API answered 503 in the browser, first visit | SET UP · GATE CONFIGURATION FIC10401 What this loop runs under today, the bundles at its three levels, and the |
| pipeline--error | [day](screenshots/current/day/states/pipeline--error.png) · [night](screenshots/current/night/states/pipeline--error.png) | CPM API answered 503 in the browser, first visit | RUNTIME INTERNALS Pipeline health The Flink/Kafka runtime that produces every verdict. This view is read-only; |
| governance--error | [day](screenshots/current/day/states/governance--error.png) · [night](screenshots/current/night/states/governance--error.png) | CPM API answered 503 in the browser, first visit | The API is returning errors The gateway answered, but a service behind it failed. Some panels below will be em |
| admin-users--error | [day](screenshots/current/day/states/admin-users--error.png) · [night](screenshots/current/night/states/admin-users--error.png) | CPM API answered 503 in the browser, first visit | The API is returning errors The gateway answered, but a service behind it failed. Some panels below will be em |
| admin-audit--error | [day](screenshots/current/day/states/admin-audit--error.png) · [night](screenshots/current/night/states/admin-audit--error.png) | CPM API answered 503 in the browser, first visit | The API is returning errors The gateway answered, but a service behind it failed. Some panels below will be em |

Skipped or failed:

- day overview loop-drawer: control not present in the lab data
- day explorer chart-tooltip: control not present in the lab data
- day kpi picker: control not present in the lab data
- day response review-dialog: control not present in the lab data
- night overview loop-drawer: control not present in the lab data
- night explorer chart-tooltip: control not present in the lab data
- night kpi picker: control not present in the lab data
- night response review-dialog: control not present in the lab data

Not captured: **bad quality** (no reproducible lab value) and **genuine restricted** (needs a low-privilege account; the 403 images simulate a service refusal). Native `<select>` lists do not appear in Chromium screenshots. `title` tooltips do not render in headless capture.

### 7.4 Conditions during capture

| Condition | Effect |
|---|---|
| 165 of 243 loops stale, 76 never evaluated | Most Overview KPIs read 0, queue is empty, "Not evaluated" repeats. Word counts reflect this |
| Dev server default `VITE_LOOP_ROOT_PREFIX` = `root.site1.cpm`; the lab's live data is at `root.hdpe.cpm` (CHG-101) | **Explorer, Historical, Replay and Evidence show "no signal" or a sliver of old data; their charts are largely empty.** Dev server only: the built image has the right prefix. Chart findings in §5 come from source, and /trend shows live data |
| Shared lab | Another session redeployed `cplm-api` and committed during capture (`d67b41e0`, `16184182`). No styling changed; source counts were re-run at the final commit with identical results |
| Admin routes captured as `superadmin` | Their sidebars show extra System entries; main-content measurements are unaffected |

## 8. Text density and content audit (Part C)

### 8.1 Measurements, worst route first

Excluded as data: table body cells, chart text, input values. A token counts as a word only if it has a letter and is not an identifier (`FIC10401`, `G15`) or a value with unit (`12h`). Lists built from `<div>` rows are counted, so `events`, `governance` and `admin-data-sources` include row content that a real table would exclude.

| Route | Visible words | In first viewport | Text blocks | Font sizes | KPI cards | Words per KPI avg / max | Tooltip words (`title`) | Repeated strings |
|---|---|---|---|---|---|---|---|---|
| admin-data-sources | 531 | 153 | 20 | 8 | 0 | - | 0 | 15 |
| explorer | 503 | 190 | 24 | 14 | 9 | 7.8 / 10 | 430 | 3 |
| events | 490 | 217 | 30 | 6 | 0 | - | 833 | 2 |
| evidence | 435 | 197 | 24 | 10 | 0 | - | 80 | 2 |
| performance | 431 | 162 | 13 | 9 | 0 | - | 980 | 5 |
| investigation | 410 | 211 | 23 | 7 | 0 | - | 109 | 4 |
| governance | 406 | 133 | 27 | 6 | 0 | - | 5 | 2 |
| registry | 397 | 228 | 9 | 5 | 0 | - | 44 | 4 |
| calculations | 378 | 179 | 7 | 6 | 0 | - | 211 | 4 |
| overview | 308 | 218 | 11 | 7 | 10 | 6.8 / 10 | 323 | 3 |
| replay | 270 | 192 | 10 | 8 | 0 | - | 0 | 0 |
| kpi | 263 | 223 | 12 | 9 | 4 | 3.5 / 7 | 41 | 0 |
| windows | 257 | 149 | 5 | 6 | 0 | - | 456 | 2 |
| pipeline | 248 | 238 | 13 | 8 | 0 | - | 0 | 0 |
| explorer-calculations | 201 | 153 | 8 | 9 | 0 | - | 58 | 1 |
| response | 187 | 187 | 6 | 7 | 0 | - | 18 | 0 |
| explorer-relationships | 178 | 161 | 12 | 11 | 0 | - | 58 | 0 |
| historical | 172 | 139 | 7 | 7 | 0 | - | 94 | 0 |
| explorer-history | 155 | 155 | 8 | 9 | 0 | - | 58 | 0 |
| config-bundles | 144 | 144 | 10 | 7 | 0 | - | 0 | 2 |
| explorer-signals | 142 | 142 | 8 | 9 | 0 | - | 58 | 0 |
| config-effective | 142 | 126 | 7 | 8 | 0 | - | 90 | 0 |
| admin-roles | 131 | 83 | 3 | 10 | 0 | - | 172 | 0 |
| admin-system | 114 | 114 | 6 | 6 | 0 | - | 10 | 0 |
| admin-plant-model | 110 | 110 | 4 | 8 | 0 | - | 0 | 0 |
| config | 88 | 60 | 3 | 6 | 0 | - | 25 | 0 |
| admin-audit | 79 | 70 | 4 | 10 | 0 | - | 200 | 0 |
| admin-aliases | 67 | 62 | 3 | 6 | 0 | - | 0 | 0 |
| login | 47 | 47 | 1 | 7 | 0 | - | 0 | 0 |
| admin-users | 40 | 40 | 1 | 6 | 0 | - | 0 | 0 |
| trend | 17 | 17 | 0 | 6 | 0 | - | 40 | 0 |

Across 31 routes: 7,341 visible words, median 187. Largest: admin-data-sources (531).

### 8.2 Repeated strings (three or more on one page)

| String | Occurrences | Words each | Routes |
|---|---|---|---|
| Now: Not evaluated: not enough data | 21 | 6 | events |
| Not measured — not in this window's result (written by an engine version without this metr | 7 | 15 | calculations |
| Flow controller FIC00701 (FCS0102) | 28 | 3 | performance |
| Cpm evidence republished bulk | 20 | 4 | governance |
| Peak: Oscillation confirmed | 21 | 3 | events |
| Not evaluated | 29 | 2 | explorer, explorer-calculations, evidence, calculations |
| Not mapped | 25 | 2 | registry |
| from 04/11/2026, 13:45:00 GST | 24 | 2 | windows |
| emitted 04/11/2026, 14:04:29 GST | 24 | 2 | windows |
| 12h window · 04/11/2026, 1:15:00 GST – 04/11/2026, 13:15:00 GST (12 h) | 12 | 4 | calculations |
| too few qualified samples in the window | 6 | 7 | investigation |
| not measured in this window | 8 | 5 | explorer |
| Cpmloop · bulk:3 | 20 | 2 | governance |
| Oscillation confirmed | 15 | 2 | overview, performance |
| Loop Performance (CPM) · traverse.cpa.loop.samples.v1 | 7 | 4 | admin-data-sources |
| 1→AUT 2→MAN 3→CAS 4→IMAN | 7 | 4 | admin-data-sources |
| no bundle at this level - the layer below applies | 3 | 9 | config-bundles |
| evidence score 100 | 12 | 2 | performance |
| driven by | 12 | 2 | performance |
| Open loop › | 12 | 2 | performance |
| Last Connection Test | 8 | 3 | admin-data-sources |
| Last Data Received | 8 | 3 | admin-data-sources |
| Insufficient data | 11 | 2 | investigation, calculations |
| Control-Loop Signals (CPA) | 7 | 3 | admin-data-sources |
| MODE map · 4 values | 7 | 3 | admin-data-sources |

### 8.3 Top 20 reduction candidates

Ranked by words saved × occurrences. Automated check: **0 blocks classed Remove touch a unit, data-state label, coverage, time zone, source, notice or error text.**

| # | Text | Class | Proposal | Words saved | Occurrences | Routes |
|---|---|---|---|---|---|---|
| 1 | Not measured — not in this window's result (written by an engine version withou… | Shorten | Not measured: older engine | 77 | 7 | 1 |
| 2 | The headline of control-loop monitoring: loops judged with no fault, on qualifi… | Move to help | Collapsed "How this is counted" on /cpm/kpi | 57 | 1 | 1 |
| 3 | User management, plant model, data sources, and audit | Remove | Deleted | 56 | 7 | 7 |
| 4 | Check that the loop’s signals are arriving: the Window Inspector shows the samp… | Shorten | Check signal arrival in Window Inspector | 50 | 5 | 5 |
| 5 | A loop is only as good as its signal mappings: on a loop that has a valve posit… | Move to help | Info button beside the value | 47 | 1 | 1 |
| 6 | One loop's current condition, trend and gate results. | Move to help | Sidebar tooltip, which already holds this sentence | 40 | 5 | 5 |
| 7 | A note stays on the loop. Saving it never acknowledges an episode unless you ti… | Shorten | Saving does not acknowledge an episode. | 38 | 2 | 2 |
| 8 | What this loop runs under today, the bundles at its three levels, and the edito… | Remove | Deleted | 38 | 2 | 2 |
| 9 | Investigate diagnosis episodes with operating context and a traceable response … | Move to help | Sidebar tooltip | 32 | 1 | 1 |
| 10 | No fault identified (NO_CALL / INSUFFICIENT_EVIDENCE), in normal mode ≥ 95 %, n… | Move to help | Collapsed "How this is counted" on /cpm/kpi | 32 | 1 | 1 |
| 11 | HDPE › Section 600 › U6002 pellet homogenization II silo 4/5 | Remove | Deleted | 30 | 5 | 5 |
| 12 | The live path keeps the arrays for windows with a finding, at most once an hour… | Move to help | Info button on "Evidence not retained" | 30 | 1 | 1 |
| 13 | Ordered by priority (loop criticality × finding severity), then time outside th… | Shorten | Ranked by priority | 27 | 1 | 1 |
| 14 | Events are captured from qualifying setpoint or output changes; none qualified … | Shorten | No qualifying event in the retained period. 294 candidates … | 27 | 1 | 1 |
| 15 | Valve position expected but not mapped: map its tag so a valve (stiction) cause… | Shorten | Valve position not mapped | 26 | 2 | 2 |
| 16 | Observations, hypotheses and the leading hypothesis by ranked selection (argmax… | Move to help | Info button beside the value | 25 | 1 | 1 |
| 17 | The UNS asset tree — the source of truth every binding, trend, filter and loop … | Move to help | Info button beside the value | 25 | 1 | 1 |
| 18 | Submits the A8 historical replay job with this loop's current evidence flags an… | Move to help | Button tooltip with accessible description | 24 | 1 | 1 |
| 19 | A model is estimated from an accepted response event (a qualifying setpoint or … | Shorten | No model yet: needs an accepted response event. | 24 | 1 | 1 |
| 20 | OT/legacy tag → canonical UNS path. Ingestion resolves incoming tag names throu… | Move to help | Info button beside the value | 24 | 1 | 1 |

### 8.4 Current and projected words per route

These are proposals, not edits. Moved text counts as saved because only an icon remains on screen. Block counts: Keep 1,489, Shorten 75, Move to help 44, Remove 16.

| Route | Current visible words | Projected | Change | Keep | Shorten | Move | Remove |
|---|---|---|---|---|---|---|---|
| admin-data-sources | 531 | 511 | −4 % | 52 | 0 | 0 | 2 |
| explorer | 503 | 432 | −14 % | 131 | 6 | 2 | 1 |
| events | 490 | 445 | −9 % | 68 | 2 | 1 | 0 |
| evidence | 435 | 325 | −25 % | 98 | 6 | 2 | 0 |
| performance | 431 | 386 | −10 % | 76 | 2 | 2 | 0 |
| investigation | 410 | 353 | −14 % | 77 | 5 | 1 | 0 |
| governance | 406 | 381 | −6 % | 89 | 1 | 1 | 0 |
| registry | 397 | 316 | −20 % | 77 | 1 | 3 | 0 |
| calculations | 378 | 239 | −37 % | 52 | 2 | 8 | 0 |
| overview | 308 | 192 | −38 % | 52 | 8 | 1 | 0 |
| replay | 270 | 192 | −29 % | 58 | 2 | 4 | 0 |
| kpi | 263 | 96 | −63 % | 30 | 3 | 5 | 0 |
| windows | 257 | 226 | −12 % | 26 | 3 | 1 | 0 |
| pipeline | 248 | 189 | −24 % | 34 | 3 | 1 | 0 |
| explorer-calculations | 201 | 174 | −13 % | 63 | 3 | 1 | 1 |
| response | 187 | 99 | −47 % | 23 | 6 | 0 | 0 |
| explorer-relationships | 178 | 145 | −19 % | 45 | 4 | 1 | 1 |
| historical | 172 | 145 | −16 % | 52 | 2 | 2 | 0 |
| explorer-history | 155 | 128 | −17 % | 40 | 3 | 1 | 1 |
| config-bundles | 144 | 124 | −14 % | 30 | 1 | 0 | 1 |
| explorer-signals | 142 | 115 | −19 % | 42 | 3 | 1 | 1 |
| config-effective | 142 | 111 | −22 % | 43 | 1 | 1 | 1 |
| admin-roles | 131 | 107 | −18 % | 73 | 0 | 1 | 1 |
| admin-system | 114 | 87 | −24 % | 22 | 0 | 1 | 2 |
| admin-plant-model | 110 | 68 | −38 % | 32 | 0 | 2 | 1 |
| config | 88 | 72 | −18 % | 27 | 2 | 0 | 0 |
| admin-audit | 79 | 54 | −32 % | 22 | 2 | 0 | 1 |
| admin-aliases | 67 | 35 | −48 % | 16 | 0 | 1 | 1 |
| login | 47 | 28 | −40 % | 8 | 4 | 0 | 0 |
| admin-users | 40 | 32 | −20 % | 18 | 0 | 0 | 1 |
| trend | 17 | 17 | −0 % | 13 | 0 | 0 | 0 |

The largest pages barely move (`admin-data-sources` −4 %, `events` −9 %, `governance` −6 %) because their text is row content. For those, the fix is converting `<div>` lists into real tables, which is a layout change rather than a wording one.

**Annotated images** (red Remove, blue Move to help, amber Shorten, dotted grey Keep):

- [explorer](screenshots/current/annotated/explorer.png)
- [events](screenshots/current/annotated/events.png)
- [evidence](screenshots/current/annotated/evidence.png)

### 8.5 Unsupported claims and figures

| Location | Wording | Type | Basis found |
|---|---|---|---|
| `components/Login/Login.tsx:155-157` | "All sessions, including failed attempts, are logged and monitored in compliance with IEC 62443 security standards." | Hardcoded | **Not supported, and repo evidence conflicts.** `docs/architecture-review/02-auth-security-review.md:20` grades zoning C/D, "Flat network, no conduits" (:134); that review may predate later hardening, current status not determined. No certificate or assessment found. Failed logins go to `logger.warn` (`src/services/auth-service/src/services/auth.service.ts:178-191`); `LOGIN_FAILED` appears only in a comment (`audit-service/Models/AuditEvent.cs:10`). "Monitored": no basis found |
| `Login.tsx:247` | "Secure sign in" | Hardcoded | None found; TLS applies only "when a cert is configured" (CLAUDE.md) |
| `App.tsx:554` | "Lean Automation" | Hardcoded tagline | None |
| `App.tsx:553`, `Login.tsx:144,151-152` | "Traverse CPA", "Traverse control-loop performance", "Traverse Edge", "Control Loop Performance Management" | Hardcoded | Inconsistent identity, no single source |
| `Login.tsx:30` | "Plant Operations" | Hardcoded fallback | `VITE_SITE_LABEL` not found in `.env*`, compose or Dockerfile |
| `Login.tsx:261-266` | Build, Network online, UTC clock | Live | Build from `package.json` (`vite.config.ts:10`); network is `navigator.onLine`, browser state only; clock is browser time |
| `AuditExplorer.tsx:47`, `CpmGovernance.tsx:112` | "Immutable cryptographically-chained record of all operator and system actions" | Hardcoded | Partly: `audit-service/Verification/ChainIntegrityVerifier.cs`. "All actions" not determined, and contradicted for failed logins by the first row |
| `kpi/kpiProof.ts:122-135`, `loopKpiView.ts:147` | Emerson, Bayer / PlantTriage, Ender 1993, Hägglund 1995, Horch 1999, Choudhury 2008, Desborough & Miller 2002, Bauer 2016, NAMUR NE 107, GUM | Hardcoded | Documented: `kpi_calculation_logic/KPI-LOGIC.md:229-244,246+`. Line 235 states no standard fixes CPM thresholds |
| `kpiProof.ts:126` | "as an alarm would be (ISA-18.2)" | Hardcoded analogy | `KPI-LOGIC.md:229` |
| `FacetPill.tsx:28-29`, `health/TransmitterHealthPanel.tsx` | NE107 | Hardcoded hint, live flags | Mapping exists; "OPC / NAMUR NE107 quality" conflates two vocabularies |

Zero live hits for: real-time, SIL, certified, AI, powered by, uptime percentages. Fake or demo data: none rendered; `evidence/views/fixtures.ts` is imported only by tests.

Hardcoded values acting as measured or judged:

- OP "%" unit (`OperatingState.tsx:99-102`, `chartOption.ts:246`).
- Card thresholds (`loopKpiView.ts:40-42`).
- Priority-bar colours 80/50, not the profile floor (`GoodErrorBar.tsx:25`).
- Out-of-mode target 0.10 drives tile colour (`fleetKpiView.ts:24`).
- `?? 0.5` manual limit (`kpiMeta.ts:41`).
- Loading fallback `'12h'` (`OperatingPicture.tsx:44`).

**`/admin/system` shows illustrative values.** `SystemSettingsConfig.tsx:27-28` says "Not functional yet — these settings are not connected to the backend and cannot be saved. Values shown are illustrative defaults, not the running configuration." The notice is honest and should stay. The tab is live in `SLICE_ADMIN_TABS`, though, so a production SuperAdmin sees retention and logging values that are not real (Q10).

### 8.6 Changes per route

Only rows that would change are listed here. Every block, including Keep, is in [cpa-text-audit-by-route.md](cpa-text-audit-by-route.md).

#### admin-data-sources: 531 → 511 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `p @124px` | User management, plant model, data sources, and audit | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: the tab row name… |
| `p @284px` | Configure OT data sources — MQTT broker connections consumed by the ingestion service | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: the page title s… |

#### explorer: 503 → 432 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Check a loop | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | One loop's current condition, trend and gate results. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `span @187px` | HDPE › Section 600 › U6002 pellet homogenization II silo 4/5 | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: Explorer shows t… |
| `span.cpm-eyebrow @443px` | Loop summary · latest 12h evaluated window | Shorten | Latest 12h window | Window label stays; repeats "Loop" |
| `p.cpm-loop-summary__next-text @553px` | Check that the loop’s signals are arriving: the Window Inspector shows the samples each w… | Shorten | Check signal arrival in Window Inspector | Keep the next step |
| `p.cpm-copy @1012px` | Classification derived from the tag type; declare it in the registry to make it explicit. | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `obc-button @1220px` | Open in Historical › | Shorten | In Historical › | Link label repeats the row label |
| `span @1276px` | The shaded band is the evaluated 12h window behind the diagnosis. | Shorten | Shaded: evaluated 12h window | Reading aid for the chart stays |
| `p.cpm-copy @2393px` | Select a gate to read its verdict, window and evidence here; the Evidence Workbench holds… | Shorten | Select a gate | Prompt 6.2: "Click to view" affordance on a clickable item |

#### events: 490 → 445 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Find problems | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | Investigate diagnosis episodes with operating context and a traceable response history. O… | Move to help | Sidebar tooltip | Prompt 6.2: repeats text already on the page or in navigation |
| `p.cpm-copy @892px` | Still open: the newest window could not be judged (excluded or insufficient data), so the… | Shorten | Still open: newest window not judged | Keep state |

#### evidence: 435 → 325 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @250px` | Understand the cause · Evidence workbench | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p @1087px` | The live path keeps the arrays for windows with a finding, at most once an hour per loop … | Move to help | Info button on "Evidence not retained" | Guide p.6: metric definitions go in an accessible help or detail view |
| `p.cpm-gate-state__valid @1224px` | The verdict and every scalar of this run are valid; only the arrays were not kept. | Shorten | Verdict and scalars valid; arrays not kept | Keep state |
| `li @1284px` | The whole window: not evaluated: not enough data — no gate on it carries a verdict. | Shorten | Whole window not evaluated: not enough data | Keep state |
| `p.cpm-collapsible__summary @1312px` | PV / SP and OP / VP from the historian over this run's window — context, not the run's ow… | Shorten | Historian context, not qualification data | Source stays |
| `li @1347px` | Valve position expected but not mapped: map its tag so a valve (stiction) cause can be co… | Shorten | Valve position not mapped | Data-state label stays; the action is the link |
| `p.cpm-copy @1526px` | Reconstruct the evidence to rebuild the arrays from the run's window; they are labelled a… | Shorten | Rebuilt arrays are labelled as rebuilt | Keep the label promise |
| `p.cpm-collapsible__summary @1658px` | Observations, hypotheses and the leading hypothesis by ranked selection (argmax, not an a… | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |

#### performance: 431 → 386 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Find problems | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | Compare every loop gate by gate and see where the plant is failing. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `p.cpm-copy @188px` | Verdicts fuse on 12h / 24h rolling windows (recomputed every 15 min) · per-window 1m–60m … | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `span.cpm-kpi__sub @524px` | 236 valve loop(s) with VP expected but not mapped — valve faults there need an approved t… | Shorten | 236 loops need a test record to confirm a valve fault | Coverage stays |

#### investigation: 410 → 353 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Understand the cause | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | Start here: the conclusion, the evidence behind it and what to check next. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `li @413px` | Valve position expected but not mapped: map its tag so a valve (stiction) cause can be co… | Shorten | Valve position not mapped | Data-state label stays; the action is the link |
| `span.cpm-copy @1552px` | newest first · pick one to make it CURRENT | Shorten | Newest first | Prompt 6.2: "Click to view" affordance on a clickable item |
| `p.cpm-copy @1783px` | Only one evaluated window stored — no PREVIOUS to compare against yet. | Shorten | No previous window to compare | Keep state |
| `p.cpm-copy @2114px` | A note stays on the loop. Saving it never acknowledges an episode unless you tick that bo… | Shorten | Saving does not acknowledge an episode. | Keep the consequence, drop the explanation |

#### governance: 406 → 381 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `p @2439px` | Validated drafts appear here for an independent approver; approved bundles until they are… | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `p.cpm-copy @2453px` | Permission changes take effect when the session's token is next issued (re-login, or the … | Shorten | Applies at next sign-in or token refresh | Keep the consequence |

#### registry: 397 → 316 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Set up | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | Add individual loops or validate a bulk registry import. Onboarded loops are evaluated im… | Move to help | Sidebar tooltip | Prompt 6.2: repeats text already on the page or in navigation |
| `div.cpm-banner @221px` | A loop is only as good as its signal mappings: on a loop that has a valve position but no… | Move to help | Info button beside the value | Prompt 6.2: slogan plus threshold note |
| `p.cpm-copy @1252px` | G9 geometry is supporting-only. It cannot create a stiction suspect without qualified ind… | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |

#### calculations: 378 → 239 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Understand the cause | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | Every calculated metric for a loop, with its latest value and method. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `div.cpm-event-row__sub @689px` | Fraction of expected samples present in the window. | Move to help | Calculation drawer, one click from the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `span @798px` | Not measured — not in this window's result (written by an engine version without this met… (×7) | Shorten | Not measured: older engine | Data-state label stays; the reason moves to help |
| `div.cpm-event-row__sub @850px` | Time fraction the controller spent in AUTO. | Move to help | Calculation drawer, one click from the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `div.cpm-event-row__sub @968px` | Mean /PV − SP/ over the window. | Move to help | Calculation drawer, one click from the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `div.cpm-event-row__sub @1440px` | Time fraction (0-1) the error stayed inside the good band. | Move to help | Calculation drawer, one click from the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `div.cpm-event-row__sub @1558px` | OP travel relative to the error it corrects. | Move to help | Calculation drawer, one click from the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `div.cpm-event-row__sub @1651px` | Total actuator travel extrapolated to a day. | Move to help | Calculation drawer, one click from the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `div.cpm-event-row__sub @1788px` | Dominant period from the autocorrelation. | Move to help | Calculation drawer, one click from the value | Guide p.6: metric definitions go in an accessible help or detail view |

#### overview: 308 → 192 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Find problems | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | Which loops need attention first, and why. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `p.cpm-op__basis @673px` | Each monitored loop counted once from its newest 12h result, at most 60 min old · normal … | Shorten | Keep the counting rule in help; drop this sentence | Prompt 6.2: "Click to view" affordance on a clickable item |
| `p.cpm-queue-rule @822px` | Ordered by priority (loop criticality × finding severity), then time outside the good-err… | Shorten | Ranked by priority | Guide p.13 needs a stated ranking basis; full rule in the info button |
| `p @825px` | Pick a loop in the priority queue to see its live signals and trend here. | Shorten | Select a loop | Prompt 6.2: "Click to view" affordance on a clickable item |
| `p @932px` | No loop has a current confirmed or suspected finding. The operating picture above shows t… | Shorten | No current findings | Heading above says this; empty state stays short |
| `p.cpm-copy @1167px` | No loop has a current finding. Verdicts appear once a loop completes an evaluation window. | Shorten | No current findings | Heading above says this; empty state stays short |
| `li @1602px` | 236 valve position expected but not mapped · map the VP tag so non-following evidence can… | Shorten | 236 loops: VP not mapped (G14) | Coverage stays; repeats the sibling line |
| `li @1628px` | 241 peer links expected but missing · interaction analysis unavailable (G13) until peers … | Shorten | 241 peer links missing (G13) | Coverage stays |

#### replay: 270 → 192 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Understand the cause | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | Replay the raw samples behind a verdict and re-run the calculation. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `p.cpm-copy @514px` | Stages are the pipeline's fixed shape; the chart below shows the raw historian slice this… | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `p.cpm-copy @826px` | Submits the A8 historical replay job with this loop's current evidence flags and window a… | Move to help | Button tooltip with accessible description | Guide p.7: a disabled or heavy action explains itself accessibly; not on every … |
| `span.cpm-kv__value @831px` | How confident is the final verdict? | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `p.cpm-copy @1511px` | A note stays on the loop. Saving it never acknowledges an episode unless you tick that bo… | Shorten | Saving does not acknowledge an episode. | Keep the consequence, drop the explanation |

#### kpi: 263 → 96 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @136px` | Find problems | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @190px` | The loops behind one Overview number, and the value that put each one there. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `span.cpm-kpicard__text @375px` | No fault · AUTO ≥ 95 % · at limit ≤ 10 % · good-error share ≥ floor (G3) · effort not str… | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `dd @550px` | No fault identified (NO_CALL / INSUFFICIENT_EVIDENCE), in normal mode ≥ 95 %, not at an O… | Move to help | Collapsed "How this is counted" on /cpm/kpi | Guide p.6: metric definitions go in an accessible help or detail view |
| `dd @605px` | count(no fault identified ∧ AUTO ≥ normal-mode limit ∧ time at OP limit ≤ saturation limi… | Move to help | Collapsed "How this is counted" on /cpm/kpi | Guide p.6: metric definitions go in an accessible help or detail view |
| `dd @636px` | The headline of control-loop monitoring: loops judged with no fault, on qualified data, i… | Move to help | Collapsed "How this is counted" on /cpm/kpi | Guide p.6: metric definitions go in an accessible help or detail view |
| `p.cpm-op__basis @988px` | Between 0 % and 0 % over the days with data. Click a day to list the loops it counted. Da… | Shorten | Days with nothing kept read "no data", not 0 %. | Prompt 6.2: "Click to view" affordance on a clickable item |
| `p @1253px` | The count for this KPI is 0 in this scope — nothing to verify here. Back on the Overview,… | Shorten | No loops in this scope | Keep state |

#### windows: 257 → 226 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Understand the cause | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | Which windows were evaluated and whether they had enough data. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `p.cpm-hist-note @408px` | Watermark lag: — (not exposed by the metrics proxy; job state and checkpoint age in the h… | Shorten | Watermark lag: unavailable | Data-state label stays |
| `span.cpm-copy @449px` | 24 loaded · newest first · select a window to open it | Shorten | 24 loaded · newest first | Prompt 6.2: "Click to view" affordance on a clickable item |

#### pipeline: 248 → 189 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `p.cpm-copy @151px` | The Flink/Kafka runtime that produces every verdict. This view is read-only; job lifecycl… | Move to help | Sidebar tooltip | Prompt 6.2: repeats text already on the page or in navigation |
| `span.cpm-copy @365px` | Latency / backpressure / parallelism are not exposed by the proxy — shown as “—”, not est… | Shorten | Not exposed: latency, backpressure, parallelism | Data-state label stays |
| `p.cpm-copy @716px` | There is no server-side history for these metrics; the chart accumulates live snapshots f… | Shorten | Live snapshots since this page opened | Source stays |
| `p @842px` | The chart needs at least two readings; it draws on its own as they arrive — keep this pag… | Shorten | Needs two readings; keep this page open | Keep state |

#### explorer-calculations: 201 → 174 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Check a loop | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | One loop's current condition, trend and gate results. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `span @187px` | HDPE › Section 600 › U6002 pellet homogenization II silo 4/5 | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: Explorer shows t… |
| `span.cpm-eyebrow @443px` | Loop summary · latest 12h evaluated window | Shorten | Latest 12h window | Window label stays; repeats "Loop" |
| `p.cpm-loop-summary__next-text @553px` | Check that the loop’s signals are arriving: the Window Inspector shows the samples each w… | Shorten | Check signal arrival in Window Inspector | Keep the next step |

#### response: 187 → 99 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Understand the cause | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | Site zone UTC. Every event is listed with its state and reason; the selection is explicit… | Shorten | Site zone UTC | Time zone stays; the rest is method |
| `p @555px` | Events are captured from qualifying setpoint or output changes; none qualified in the ret… | Shorten | No qualifying event in the retained period. 294 candidates censored. | Guide p.7: empty state explains and offers a reset; the method moves to help |
| `p.cpm-copy @612px` | No complete response event yet - the 294 captured candidates were censored (superseded by… | Shorten | No complete response event: 294 candidates censored. | Guide p.7: keep the state, drop the method |
| `a.cpm-link @676px` | Setpoint changes in Historical › | Shorten | In Historical › | Link label repeats the row label |
| `p @808px` | A model is estimated from an accepted response event (a qualifying setpoint or output ste… | Shorten | No model yet: needs an accepted response event. | Guide p.7: empty state explains; the method moves to help |

#### explorer-relationships: 178 → 145 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Check a loop | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | One loop's current condition, trend and gate results. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `span @187px` | HDPE › Section 600 › U6002 pellet homogenization II silo 4/5 | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: Explorer shows t… |
| `span.cpm-eyebrow @443px` | Loop summary · latest 12h evaluated window | Shorten | Latest 12h window | Window label stays; repeats "Loop" |
| `p.cpm-loop-summary__next-text @553px` | Check that the loop’s signals are arriving: the Window Inspector shows the samples each w… | Shorten | Check signal arrival in Window Inspector | Keep the next step |
| `p @1066px` | Create asset relationships, then republish evidence — G13 cannot evaluate without them. | Shorten | Needs asset relationships (G13). | Keep the action, drop the sequence |

#### historical: 172 → 145 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Check a loop | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | A loop's signals, KPIs, mode and verdicts over a past period. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `span.cpm-hist-note @861px` | 0 evaluated window(s) · click a verdict band to inspect | Shorten | 0 evaluated windows | Prompt 6.2: "Click to view" affordance on a clickable item |
| `p @1607px` | Fused verdicts exist only where a full evaluation window closed. | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |

#### explorer-history: 155 → 128 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Check a loop | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | One loop's current condition, trend and gate results. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `span @187px` | HDPE › Section 600 › U6002 pellet homogenization II silo 4/5 | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: Explorer shows t… |
| `span.cpm-eyebrow @443px` | Loop summary · latest 12h evaluated window | Shorten | Latest 12h window | Window label stays; repeats "Loop" |
| `p.cpm-loop-summary__next-text @553px` | Check that the loop’s signals are arriving: the Window Inspector shows the samples each w… | Shorten | Check signal arrival in Window Inspector | Keep the next step |

#### config-bundles: 144 → 124 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Set up · Gate configuration | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | What this loop runs under today, the bundles at its three levels, and the editor for one … | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: the view tabs na… |

#### explorer-signals: 142 → 115 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Check a loop | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | One loop's current condition, trend and gate results. | Move to help | Sidebar tooltip, which already holds this sentence | Prompt 6.2: repeats text already on the page or in navigation |
| `span @187px` | HDPE › Section 600 › U6002 pellet homogenization II silo 4/5 | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: Explorer shows t… |
| `span.cpm-eyebrow @443px` | Loop summary · latest 12h evaluated window | Shorten | Latest 12h window | Window label stays; repeats "Loop" |
| `p.cpm-loop-summary__next-text @553px` | Check that the loop’s signals are arriving: the Window Inspector shows the samples each w… | Shorten | Check signal arrival in Window Inspector | Keep the next step |

#### config-effective: 142 → 111 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Set up · Gate configuration | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | What this loop runs under today, the bundles at its three levels, and the editor for one … | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: the view tabs na… |
| `span.cpm-copy @678px` | a layer above sets a property, or leaves the one below | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |

#### admin-roles: 131 → 107 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `p @124px` | User management, plant model, data sources, and audit | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: the tab row name… |
| `p @287px` | Assign permissions to roles. Editing a role takes effect for its users on their next requ… | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |

#### admin-system: 114 → 87 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `p @124px` | User management, plant model, data sources, and audit | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: the tab row name… |
| `p @349px` | Configure infrastructure retention, UI defaults, and backend logging. | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: the page title s… |
| `div @433px` | Configure how long alarms and audit records are kept before archiving. | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |

#### admin-plant-model: 110 → 68 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `p @124px` | User management, plant model, data sources, and audit | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: the tab row name… |
| `p @284px` | The UNS asset tree — the source of truth every binding, trend, filter and loop location r… | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |
| `span @394px` | The onboarding order — each stage feeds the next (docs/plant-model/production-onboarding-… | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |

#### config: 88 → 72 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `span.cpm-eyebrow @96px` | Set up | Shorten | CPA / <page> breadcrumb | Guide p.11-12 concepts: eyebrow is the module path, not a task name |
| `p.cpm-copy @151px` | What each loop runs under, the bundles in progress, and the editor for one of them. 165 p… | Shorten | 165 properties · 6 workers announced | Prompt 6.2: repeats text already on the page or in navigation |

#### admin-audit: 79 → 54 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `p @124px` | User management, plant model, data sources, and audit | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: the tab row name… |
| `p @284px` | Immutable cryptographically-chained record of all operator and system actions. | Shorten | Chained audit record | Prompt 6.2: claim without a documented basis: "all actions" not established; fa… |
| `span @439px` | Entries are hash-chained by audit-service. Run a verification to confirm integrity now — … | Shorten | Hash-chained. Run a verification to confirm integrity. | Keep the honest qualifier; it contradicts the "Immutable" line above it |

#### admin-aliases: 67 → 35 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `p @124px` | User management, plant model, data sources, and audit | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: the tab row name… |
| `p @284px` | OT/legacy tag → canonical UNS path. Ingestion resolves incoming tag names through this ta… | Move to help | Info button beside the value | Guide p.6: metric definitions go in an accessible help or detail view |

#### login: 47 → 28 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `p.login__subtitle @321px` | Control Loop Performance Management | Shorten | Traverse CPA | Guide p.28: one product identity across the shell |
| `p.login__notice @382px` | Authorized use notice: Access is restricted to authorized operators. All sessions, includ… | Shorten | Authorized use only. Access is restricted to authorized operators. | Prompt 6.2: claim without a documented basis: no IEC 62443 assessment found. Th… |
| `obc-button.login__submit @670px` | Secure sign in | Shorten | Sign in | Prompt 6.2: claim without a documented basis: TLS depends on deployment |
| `span.login__visual-system @957px` | Traverse control-loop performance | Shorten | Traverse CPA | Guide p.28: one product identity across the shell |

#### admin-users: 40 → 32 words

| Location | Current wording | Class | Proposal or destination | Reason |
|---|---|---|---|---|
| `p @124px` | User management, plant model, data sources, and audit | Remove | - | Prompt 6.2: repeats text already on the page or in navigation: the tab row name… |

## 9. Guide conformance gaps (Part D)

### 9.1 Theme parity (G01): **Fail**

Day and Night both exist, and Bright is a third. Domain mapping is the same across themes in source. Failures: Night is the achromatic OpenBridge variant, not Graphite and Cyan (§4.4); 5 of 11 charts keep the old theme until they re-render (§5.1); chart tooltips stay white at night (§5.2); NE107 M is nearly invisible in both (§4.5); contrast failures differ by theme (§9.9).

### 9.2 Tokens (G02): **Fail**

`--traverse-*` usage is 0. 46 literal declarations and 124 literal fallbacks (§4.1). Night-only overrides of OpenBridge values exist at `designTokens.css:181,187`.

### 9.3 Shell (G03): **Fail**

| Guide p.6 | Today | Evidence |
|---|---|---|
| Fixed module order | **Absent.** Groups: Loop Performance (13 items under Find problems, Check a loop, Understand the cause, Set up), Engineering (Trend), System (Pipeline Health, Administration, Governance) | `components/nav/navItems.ts:62-96`, `nav/Sidebar.tsx:34-39`, `productSlice.ts:10-30` |
| Logo | **None**, text only | `App.tsx:552-555` |
| Plant selector | **Absent** in header; per-page PlantScopeFilter | `App.tsx:557-692` |
| Search text | **No visible field.** Ctrl+K palette, placeholder "Go to screen, loop, or calculation…", no on-screen hint | `CommandPalette.tsx:47,120` |
| Time range | **Absent**; per-page toggle only | |
| Environment indicator | **Absent**; grep zero hits | App, nav, palette |
| User | Present: name, role, Sign out | `App.tsx:672,688` |
| Theme | day, bright, night | `App.tsx:618` |
| Selected nav | Start-edge indicator present: 3 px left border plus pressed background, using `--focus-color` and physical `left` | `styles/app.css:331-335` |
| Below 768 px | Sidebar hidden | `app.css:1568,1585` |

### 9.4 Metric handling (guide p.11-13)

Paths are relative to `src/frontend-ob/src/` unless they start with `src/` or `kpi_calculation_logic/`. No browser or API was used for this subsection.

| # | Requirement | Result | Evidence |
|---|---|---|---|
| 1 | Definition, window, eligibility, coverage | **Partial** | /cpm tiles: rule on hover only (`components/Cpm/overview/OperatingPicture.tsx:27`). Denominator named (:28), window in eyebrow (:44), basis line (:88). No definition version. No baseline except the 24 h delta (`kpi/kpiMeta.ts:77-92`). Loop cards: window in eyebrow (`explorer/summary/LoopKpiCards.tsx:38`) |
| 2 | Overview and detail use the same window and denominator | **Partial** | Same stored field and window; stated denominator is wrong; names differ. See 9.4a |
| 3 | Ranking states its basis | **Pass on /cpm, fail on /cpm/performance** | /cpm: rule shown (`overview/PriorityQueue.tsx:52`, `overview/priorityReason.ts:13-14`); Unassessed excluded (`src/services/cplm-api/Data/FleetPrioritySql.cs:53-54`). /cpm/performance: only dropdown labels "By evidence score" / "By control error" (`AttentionList.tsx:29-32`), no rule text; "control error" actually sorts `good_error_pct ASC` (`src/services/cplm-api/Controllers/CpmFleetController.cs:175`). Sortable headings exist only on Calculations and Events (`SortHeader.tsx:4`); KPI table headers are static (`kpi/KpiRowsTable.tsx:40-45`) |
| 4 | Explanation states which metric or rule selected the loop | **Partial** | Row gives criticality, severity, persistence, score plus a condition pill (`priorityReason.ts:32-48`). `PRIORITY_RULE` states order, not selection. Conflict: empty text and basis say "confirmed or suspected" (`PriorityQueue.tsx:59`, `kpi/fleetKpiView.ts:77`), but the queue also admits DETECTED and CLASSIFIED (`FleetPrioritySql.cs:54`). Undisclosed defaults: unset criticality = medium, unset severity = LOW (`FleetPrioritySql.cs:9-10`) |
| 5 | Assessed, needing review, coverage; ranked table columns | **Partial** | See 9.4b |
| 6 | PV, SP, OP, mode on aligned axes | **Partial** | Only /cpm/historical (`historical/chartOption.ts:32-37,130`). Explorer has no mode lane; mode is a tile (`OperatingState.tsx:48,126`). Overview trend fetches pv, sp, op only (`overview/LoopFocus.tsx:33`) |
| 7 | "Controller output" label | **Partial** | Full words: `AddLoopWizard.tsx:39`, `explorer/SignalsTab.tsx:24`, `historical/RangeToolbar.tsx:34`. Bare "OP": `OperatingState.tsx:97`, `LoopFocus.tsx:53`, `chartOption.ts:246,278`, `kpi/loopKpiView.ts:145,150,153`. Valve wording on OP: "OP fully open or closed" (`loopKpiView.ts:147`, `src/services/cplm-api/Services/Kpi/FleetKpiClassifier.cs:147`), "valve wear" (`loopKpiView.ts:152,155`), "actuator travel" (`calcCatalogue.ts:34`). The app itself says "OP travel is not valve travel" (`evidence/views/ShortViews.tsx:156`) |
| 8 | Span validity; named statistics | **Pass for PV, partial for OP** | PV requires pvMax > pvMin, else "no PV span registered" (`loopKpiView.ts:109,120`); fleet excludes no-span loops and counts them (`performanceHeadline.ts:39-43`). Named: "Control error (MAE)", "PV variability (2σ)", "Median error (% of span)". OP "%" is hardcoded (`OperatingState.tsx:99-102`, `chartOption.ts:246`) though OP is identity-scaled unless a range is declared (`src/flink/.../engine/ShortFeatureCalculator.java:183`) |
| 9 | Oscillation, stiction, tuning claims name the method | **Partial** | /cpm tile names evidence band only (`FleetKpiClassifier.cs:141-143`). Drill-down row gives period and regularity (`kpi/kpiProof.ts:61-63`). Methods appear in calculations (`calcCatalogue.ts:36,40,41`) and the Workbench, one or more clicks away. "Controller tuning" is assigned for every `_OSCILLATION` case (`investigation/cases.ts:13,32`) |

**9.4a Mode metric, Overview versus detail.** The string "mode compliance" has 0 hits in `components/Cpm`, `api`, `hooks`.

| | Overview | Loop detail |
|---|---|---|
| Label | "In auto mode" (`FleetKpiClassifier.cs:136`) | "Time in normal mode" (`loopKpiView.ts:131`) |
| Rule text | "AUTO / CASCADE ≥ 95% of the 12h window (> 5% out of design mode = out of mode)", plus "newest 12h result ≤ 60 min old" (:129,137) | "AUTO / CASCADE · rule ≥ 95 % · G1 …"; "Service factor: time in AUTO or CASCADE ÷ window time" (:132-133) |
| Quantity | Loops ÷ "loops with a measured mode" | Share of one window |
| Source | `payload->>'auto_pct'`, newest LIVE row of `@windowKind` (`Data/FleetKpiSql.cs:16,46-51`) | Same row shape (`Controllers/CpmLoopKpiController.cs:24-31,35`) |

Matches: same field, same kind; `?window=` is carried (`CpmOverview.tsx:90`, `cpaHref.ts:35`, `CpmExplorer.tsx:48`); evaluation versus plot is labelled separately, "Gates: latest … · trend: …" (`CpmExplorer.tsx:93`).

Defects:

- **Denominator misstated.** The engine uses `autoCount / n`, where n = samples present, not window time (`ShortFeatureCalculator.java:72,193`; `kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:77`). "÷ window time" also appears in `kpiMeta.ts:36`.
- **"MANUAL % = time in MANUAL" is inaccurate** (`kpiMeta.ts:40`). `manualPct = 1 − autoPct` (`ShortFeatureCalculator.java:194`), so UNKNOWN or null mode counts as manual (`CplmNormalizedSample.java:234-236`).
- **"AUTO or CASCADE" understates the set.** It also includes NORMAL, RSP, DDC, SUP (`CplmNormalizedSample.java:228-229`). The catalogue says only "AUTO" (`calcCatalogue.ts:27`).
- **Thresholds conflict.** The tile limit is server-configurable (`Services/Kpi/FleetKpiModels.cs:5-8`); the card hardcodes 0.95 (`loopKpiView.ts:40,132`). G1 passes at 0.90 (`CplmLoopDynamicsProfile.java:88`), so 90-95 % shows amber beside "G1 pass".
- **Staleness has three rules.** KPI 60 min; queue and loop summary = window length (`FleetLatestSql.cs:227-236`, `explorer/summary/summaryText.ts:110-115`); Performance banner 3 h (`CpmPerformance.tsx:57`). A loop can read Stale and still sit in the queue.
- **Five names for one field:** In auto mode, Time in normal mode, Automatic-mode fraction, In AUTO (`windows/WindowResults.tsx:37`), Service factor.

**9.4b Overview presence (guide p.13).**

| Item | Status | Evidence |
|---|---|---|
| Population and period | Yes | `CpmOverview.tsx:99`, `OperatingPicture.tsx:44` |
| Assessed loops | Partial: no headline figure, only denominators | `fleetKpiView.ts:37` |
| Needing review | No single count; queue has no total, slices 6 | `PriorityQueue.tsx:25,40,65` |
| Data coverage | Partial: not-assessable, stale, never-evaluated counts; no coverage % | `OperatingPicture.tsx:58-66` |
| Loop tag | Yes | `PriorityQueue.tsx:75-78` |
| Parent asset | Partial: display name · area | :90 |
| Metric value + unit | Yes: "N% in band". Fallback "MAE x" has no unit | `overview/GoodErrorBar.tsx:14,34` |
| Assessment state | Yes: priority badge and condition | `PriorityQueue.tsx:73,83` |
| Coverage column | **No** | Not rendered |
| Last evaluation time | **No**, though `windowEnd` is in the payload | `api/cpmApi.ts:443` |
| Table form | Div rows, no column headers | `PriorityQueue.tsx:70` |

**9.4c Metric catalogue.** 19 entries (`calcCatalogue.ts:24-47`). Definition version appears only in CalcDrawer: "Calculation version", "Stamped on this value" (`CalcDrawer.tsx:148,209`), and on Historical (`historical/SelectedWindowPanel.tsx:104-107`).

| KPI | Unit | Definition source | Reachable from value | Version shown |
|---|---|---|---|---|
| /cpm tiles (10) | Count, % of denominator, pp change | Server `rule`, KPI_META formula, KPI_WHY on /cpm/kpi | Yes: whole tile links (`kpi/KpiCard.tsx:47-48`) | **No.** `RuleVersion` exists server-side (`FleetKpiClassifier.cs:10`); 0 frontend hits |
| State bar, 7 segments | Count | Label; bar title | Legend links | No |
| "% in band" | % | Tooltip only | Hover | No |
| Readiness counts | Count | `overview/capabilityCopy.ts` | No; Registry button only | No |
| Good-error time | % | Tooltip + CPLM-014 | Yes, drawer via `?metric=` (`CpmCalculations.tsx:189-190`) | Drawer |
| Control error (MAE) | % of span + EU | Tooltip + CPLM-010 | Yes | Drawer |
| OP travel | %/day | Tooltip + CPLM-021 | Yes | Drawer |
| OP reversals | /h | Tooltip + CPLM-022 | Yes | Drawer |
| Time in normal mode | % | Tooltip; CPLM-003 not linked | Goes to Historical (`loopKpiView.ts:131`) | No |
| Data coverage | % | Tooltip + CPLM-001 | Goes to Window Inspector | No |
| PV variability (2σ) | % of span | Tooltip only, **not in catalogue** | Goes to Historical | No |
| Time at an OP limit | % | Tooltip only, **not in catalogue** | Goes to Historical | No |
| Setpoint changes | /h | Tooltip only, **not in catalogue** | Goes to Historical | No |
| Evidence score | /100 | CPLM-090, "Uncalibrated — not a probability" | Summary tooltip | Drawer |

**9.4d Context continuity (G07).** Result: **partial, fail for time zone.**

| Hop | Plant | Loop | Interval |
|---|---|---|---|
| Menu between non-fleet CPM pages | Yes (`nav/cpmTasks.ts:54,71-74`) | Yes | No, except Explorer↔Historical `from`/`to` (:77-84) |
| Menu to /cpm or /cpm/performance | Dropped by design (:57-61,68) | Dropped | Dropped |
| Overview→Explorer | **Dropped** (`cpaHref.ts:34-35`) | Yes | Yes |
| Overview→Performance "View all" | **Dropped** (`cpaHref.ts:38-40`) | If chosen | Yes |
| Overview↔KPI | Yes (`cpaHref.ts:91-96`) | n/a | Yes |
| KPI row→Explorer | **Dropped** (`kpiProof.ts:108`) | Yes | Yes |

Overview's event trail ignores plant scope and window (`CpmOverview.tsx:52`). Time zone is not selectable and not in the URL. `fmtDateTime` uses the browser zone with a short zone name (`shared.tsx:62-63`); charts use `loop.timezone || 'UTC'` (`CpmHistorical.tsx:198`) while the context bar on the same page gets no zone (:254), so two zones can appear together. `LoopFocus.tsx:58` shows times with no zone.

### 9.5 Trends: **Fail** (detail in §5)

| Requirement | Result | Evidence |
|---|---|---|
| PV, SP, OP and mode on one time axis | **Partial** | Pass on /cpm/historical (`chartOption.ts:160-170`). Mode is not drawn on Explorer or Replay; /cpm/evidence splits across three charts |
| Setpoint is a labelled dashed line | **Fail** | Dashed on C1-C3 but legend-only. Solid in evidence lanes and /trend ([image](screenshots/current/day/1440x1024/trend.png)) |
| Gaps are broken, not zero-filled | **Partial** | Fail: C2 overlay and mode, C10 zero-fill, C11 joined, C3 outage *(inferred)*. Pass: C1, C2 signals, C7, C9 |
| Plotted zoom window shown in the label (p.28) | **Fail** | `useBoxZoom` holds percentages only (`charts/boxZoom.ts:17-18`). `ChartZoomBar` shows buttons, no range. C2 says "Zoomed view only" with no times. C11 clocks show the unzoomed window |
| Synchronised cursor, value table | **Fail** | No `echarts.connect` or `group`. No value table for PV, SP or OP; `CpmChart:229-230` records its removal |

### 9.6 Histograms and distributions: **Fail**

CPA has no true frequency histogram, so the CPA01 concept's tracking histogram does not exist yet. Existing distribution marks fall below 3:1: `--alert-caution-color` is **1.03:1** on the Day panel in C12, C13, C15 and C17, and C14 reads 1.03 Day, 2.05 Night (§5.6).

### 9.7 Status semantics (guide p.4)

| Check | Result | Evidence |
|---|---|---|
| Success only for verified or completed outcomes | **Fail** | Compliant uses: configSupport:25, evaluationState:56, CpmPipeline:249, CpmGovernance:121, CpmKpiDrilldown:147. Violations: **state** S:259, CpmPipeline:145,155,213, CpmWindows:90, registryShared:27, ProfileAside:106, UserManagementConfig:254, DataSourcesConfig:143,147, AliasConfig:263. **Normal/healthy** summaryText:32, TransmitterHealthPanel:24,30,60, useLoopLive:91,99, CpmHistorical:145, HistorianLanes:38. **Within limits** GoodErrorBar:25, CpmWindows:188, CpmPipeline:160, fleetKpiView:25,29, loopKpiView:115, CpmCalculations:279. **Data present** EventDetail:137, ShortViews:33,75,103,107, LongViews:119, G13Interaction:63,78, SignalsTab:63, LoopModelCard:40, EffectiveView:96, CandidateModelsTable:24, VerdictCard:65, CalcDrawer:211,233,241 |
| No automatic alarm-priority colour | **Pass** for alarm priority; loop priority is an owner decision | `priorityReason.ts:18-20` and S:253-257 use the same pattern on loop priority and severity. `components/shared/PriorityBadge.tsx` is imported only by AlarmConsole, HistoricalViewer and LiveEvents, whose routes redirect (`App.tsx:427-431`) |
| Violet only on labelled AI | **Fail** | `--ams-pen-5` `#7048E8`/`#9775FA` (`designTokens.css:22,146`) via S:50 is used at historical/chartOption.ts:252, kpi/KpiTrendChart.tsx:53, evidence/views/G13Interaction.tsx:37,100, primitives/Trajectory.tsx:47, LongViews.tsx:42,83, ShortViews.tsx:28; /trend pen 5 (`Designer/trend/trendSupport.ts:50`). No AI-labelled content exists in CPA |
| Missing never looks healthy | **Partial** | Good: distinct glyph and word (G:65-87), MetricValue, FacetPill:66-67. Failures: `ok` and `ok-limited` share ✓ and identical matrix ink (G:65,67; cpm.css:361,363), only title/aria differ (GateMatrix:303-304); DISABLED shares the `n/a` glyph and is absent from the legend (G:105,150); the Required-jobs tile is red while loading (CpmPipeline:155), the checkpoint tile amber with no data (:160); NO_CALL reads "Not evaluated yet" (summaryText:25-26) but "No fault identified" (vocabulary.ts:170) |
| Separate fields | **Partial** | Facets are deliberate (FacetPill:1-13); row verdict tone comes from diagnosis (GateMatrixChecks:26). Couplings: `passTone` lets gate plus diagnosis set the metric card colour (loopKpiView:115); EXCLUDED is a grey mark (G:72) but a red roll-up segment (G:189; GateRollup:27,69); stage colour is the worst of its gates (ReasoningChain.tsx:26-33); severity falls back to diagnosis (EventDetail:36-38); age rewrites quality (FacetPill:56) |

### 9.8 Data states (G06)

Shared components: `EmptyState`, `QueryError` (S:416-453), `MetricValue` (`C/MetricValue.tsx`), `FacetPill` (`C/FacetPill.tsx:72`), `GateResultStatePanel` (`C/evidence/GateResultState.tsx:92`). `.cpm-skeleton` is used only in evidence, config, response and SummaryGateDetail.

P = pass, Pa = partial, F = fail, NF = not found, NA = not applicable. This table is from source reading; the captured state screenshots in §7.3 are the runtime check.

| Route | Load | Empty | Partial | Stale | Bad quality | Error | Restricted |
|---|---|---|---|---|---|---|---|
| /cpm | Pa¹ | P | P | Pa² | P | Pa³ | P |
| /cpm/performance | Pa¹ | P | P | P | Pa⁴ | Pa³ | P |
| /cpm/events | Pa¹ | P | NA | P | NA | P | P |
| /cpm/explorer | Pa⁵ | P | P | Pa² | P | P | P |
| /cpm/historical | Pa⁵ | Pa⁶ | P | NA | NF | P | P |
| /cpm/investigation | Pa¹ | P | P | Pa² | NF | P | P |
| /cpm/evidence | P | Pa⁷ | P | Pa² | P | P | Pa⁸ |
| /cpm/replay | Pa¹ | Pa⁷ | P | NA | NF | P | Pa⁸ |
| /cpm/windows | Pa¹ | Pa⁷ | P | NA | Pa⁴ | Pa⁹ | P |
| /cpm/calculations | F⁵ | P | P | Pa² | Pa⁴ | Pa⁹ | P |
| /cpm/response | P | Pa⁷ | P | NA | Pa | P | P |
| /cpm/registry | Pa¹ | **F¹⁰** | NA | NA | NA | P | F⁸ |
| /cpm/config | P | P | P | NA | NA | P | **F¹¹** |
| /cpm/pipeline | Pa¹ | P | P | Pa⁹ | NA | Pa⁹ | **F¹¹** |
| /cpm/governance | Pa¹ | **F¹²** | P | NA | NA | P | **F¹¹** |
| /cpm/kpi | Pa¹ | P | P | Pa² | NA | P | P |
| /trend | NF | **F¹³** | Pa¹³ | NF | NF | F¹³ | **F¹¹** |

1. `EmptyState title="Loading…"` is text only, with no skeleton or progress (e.g. `C/CpmPerformance.tsx:275`).
2. Age is shown but the word "Stale" is absent: FacetPill:56, LoopSummaryCard:110, CpmInvestigation:253, EvidenceHeaderStrip:68, CpmCalculations:335, KpiRowsTable:63. /cpm/performance is the only full pass (`C/CpmPerformance.tsx:263-266`).
3. Summary failure is silent (`C/overview/ReadinessStrip.tsx:16`). The fleet tile has no retry (CpmPerformance:228).
4. Quality is reachable only through G0 or qualification wording: WindowDetail:254, metricAvailability.ts:69-70. Full source quality appears only in ShortViews:36.
5. With `?loop=`, "Select a loop" shows while the registry loads (CpmExplorer:140-143, CpmHistorical:323, CpmCalculations:263).
6. An unknown loop also reads "Select a loop" (:323).
7. Explains the state and gives links, but offers no reset (GateEvidenceWorkspace:182-183, CpmReplay:267, CpmWindows:146, ResponseWorkspace:140).
8. No client permission gate on writes: EvaluateWindow:78, GateEvidenceWorkspace:207, CpmReplay:334, LoopRegistry:64-65, ProfileAside:128. `CpmLoopsController.cs:67,124` require `cpm.manage`.
9. The header stays "CHECKING RUNTIME…" on failure (CpmWindows:89,97). "VERDICT UNAVAILABLE" has no retry (CpmCalculations:244). The pipeline status tile drops to "—", with no last value or retry (CpmPipeline:156-157).
10. Any filtered-out list says "No loops registered", offers Add loop and no reset (LoopRegistry:99-104).
11. Users holding `analytics.view` are redirected to /cpm with no message (`App.tsx:808`). The "Not authorized" panel appears only at `App.tsx:800-806`.
12. Search or entity filter with no match says "No governance events recorded yet", with no reset (CpmGovernance:160-163).
13. No tags gives a blank chart (TrendPage:29-34; `hasData` only feeds the zoom bar, TrendCore:272,365,377). Resolver error is dropped (TrendCore:75). Unresolved pens return [] silently (:188). Failed pens are named but have no retry (:325).

### 9.9 Accessibility baseline

axe-core 4.14.0 on each route, in each theme. Counts are DOM nodes. Canvas chart marks are not analysed by axe; see §5.2 and §5.6 for those.

| Theme | Critical | Serious | Moderate | Minor | Colour-contrast nodes |
|---|---|---|---|---|---|
| day | 15 | 374 | 83 | 7 | 242 |
| bright | 15 | 100 | 83 | 7 | 5 |
| night | 15 | 286 | 83 | 7 | 191 |

Rule totals, Day: color-contrast 242, label-content-name-mismatch 101, region 60, aria-prohibited-attr 30, landmark-unique 10, heading-order 8, select-name 5, aria-allowed-role 5, button-name 4, aria-allowed-attr 3, aria-required-attr 3, landmark-main-is-top-level 2, landmark-no-duplicate-main 2, empty-table-header 2, page-has-heading-one 1, scrollable-region-focusable 1.

| Route | day crit/ser/mod/min | bright crit/ser/mod/min | night crit/ser/mod/min | Top rules (first theme) |
|---|---|---|---|---|
| login | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |  |
| overview | 0 / 7 / 2 / 0 | 0 / 1 / 2 / 0 | 0 / 6 / 2 / 0 | color-contrast (6), region (2), label-content-name-mismatch (1) |
| performance | 11 / 34 / 2 / 0 | 11 / 9 / 2 / 0 | 11 / 12 / 2 / 0 | label-content-name-mismatch (28), color-contrast (6), button-name (4) |
| events | 0 / 17 / 3 / 0 | 0 / 6 / 3 / 0 | 0 / 9 / 3 / 0 | label-content-name-mismatch (11), color-contrast (6), region (2) |
| explorer | 0 / 24 / 4 / 0 | 0 / 1 / 4 / 0 | 0 / 4 / 4 / 0 | label-content-name-mismatch (18), color-contrast (6), region (2) |
| explorer-signals | 0 / 7 / 3 / 0 | 0 / 1 / 3 / 0 | 0 / 4 / 3 / 0 | color-contrast (6), region (2), label-content-name-mismatch (1) |
| explorer-calculations | 0 / 24 / 3 / 0 | 0 / 5 / 3 / 0 | 0 / 8 / 3 / 0 | label-content-name-mismatch (18), color-contrast (6), region (2) |
| explorer-relationships | 0 / 7 / 3 / 0 | 0 / 1 / 3 / 0 | 0 / 4 / 3 / 0 | color-contrast (6), region (2), label-content-name-mismatch (1) |
| explorer-history | 0 / 7 / 3 / 0 | 0 / 1 / 3 / 0 | 0 / 4 / 3 / 0 | color-contrast (6), region (2), label-content-name-mismatch (1) |
| historical | 0 / 7 / 2 / 0 | 0 / 1 / 2 / 0 | 0 / 5 / 2 / 0 | color-contrast (6), region (2), label-content-name-mismatch (1) |
| investigation | 0 / 7 / 2 / 5 | 0 / 1 / 2 / 5 | 0 / 4 / 2 / 5 | color-contrast (6), aria-allowed-role (5), region (2) |
| evidence | 0 / 7 / 6 / 0 | 0 / 18 / 6 / 0 | 0 / 23 / 6 / 0 | color-contrast (6), region (2), heading-order (1) |
| replay | 0 / 7 / 3 / 0 | 0 / 1 / 3 / 0 | 0 / 4 / 3 / 0 | color-contrast (6), region (2), heading-order (1) |
| windows | 0 / 7 / 2 / 0 | 0 / 1 / 2 / 0 | 0 / 4 / 2 / 0 | color-contrast (6), region (2), label-content-name-mismatch (1) |
| calculations | 2 / 7 / 2 / 0 | 2 / 1 / 2 / 0 | 2 / 4 / 2 / 0 | color-contrast (6), region (2), select-name (2) |
| response | 0 / 7 / 6 / 0 | 0 / 1 / 6 / 0 | 0 / 4 / 6 / 0 | color-contrast (6), landmark-unique (2), region (2) |
| registry | 0 / 7 / 3 / 0 | 0 / 1 / 3 / 0 | 0 / 4 / 3 / 0 | color-contrast (6), region (2), label-content-name-mismatch (1) |
| config | 0 / 7 / 2 / 0 | 0 / 1 / 2 / 0 | 0 / 4 / 2 / 0 | color-contrast (6), region (2), label-content-name-mismatch (1) |
| config-effective | 0 / 7 / 2 / 0 | 0 / 1 / 2 / 0 | 0 / 4 / 2 / 0 | color-contrast (6), region (2), label-content-name-mismatch (1) |
| config-bundles | 0 / 7 / 2 / 0 | 0 / 1 / 2 / 0 | 0 / 4 / 2 / 0 | color-contrast (6), region (2), label-content-name-mismatch (1) |
| kpi | 0 / 7 / 2 / 0 | 0 / 1 / 2 / 0 | 0 / 4 / 2 / 0 | color-contrast (6), region (2), label-content-name-mismatch (1) |
| trend | 0 / 7 / 3 / 0 | 0 / 1 / 3 / 0 | 0 / 4 / 3 / 0 | color-contrast (6), region (2), label-content-name-mismatch (1) |
| admin-users | 2 / 23 / 2 / 1 | 2 / 5 / 2 / 1 | 2 / 14 / 2 / 1 | color-contrast (22), region (2), select-name (2) |
| admin-roles | 0 / 7 / 2 / 0 | 0 / 1 / 2 / 0 | 0 / 11 / 2 / 0 | color-contrast (6), region (2), label-content-name-mismatch (1) |
| admin-data-sources | 0 / 45 / 3 / 0 | 0 / 1 / 3 / 0 | 0 / 36 / 3 / 0 | color-contrast (44), region (2), heading-order (1) |
| admin-plant-model | 0 / 7 / 3 / 0 | 0 / 1 / 3 / 0 | 0 / 20 / 3 / 0 | color-contrast (6), region (2), heading-order (1) |
| admin-aliases | 0 / 1 / 3 / 1 | 0 / 1 / 3 / 1 | 0 / 1 / 3 / 1 | region (2), empty-table-header (1), heading-order (1) |
| admin-audit | 0 / 20 / 3 / 0 | 0 / 1 / 3 / 0 | 0 / 37 / 3 / 0 | color-contrast (19), region (2), heading-order (1) |
| admin-system | 0 / 8 / 3 / 0 | 0 / 2 / 3 / 0 | 0 / 5 / 3 / 0 | color-contrast (7), region (2), heading-order (1) |
| pipeline | 0 / 7 / 2 / 0 | 0 / 1 / 2 / 0 | 0 / 4 / 2 / 0 | color-contrast (6), region (2), label-content-name-mismatch (1) |
| governance | 0 / 38 / 2 / 0 | 0 / 32 / 2 / 0 | 0 / 35 / 2 / 0 | aria-prohibited-attr (30), color-contrast (6), region (2) |

**Focus and keyboard.** Measured by tabbing through each route.

| Route | Click targets | Pointer only | Table rows | Rows focusable | Canvases | Charts focusable | Charts labelled | Tab stops with a detected ring |
|---|---|---|---|---|---|---|---|---|
| overview | 13 | 0 | 0 | 0 | 0 | 0 | 0 | 34/45 |
| performance | 180 | 0 | 25 | 0 | 0 | 0 | 0 | 32/45 |
| events | 80 | 8 | 50 | 0 | 0 | 0 | 0 | 20/45 |
| explorer | 29 | 2 | 0 | 0 | 0 | 0 | 0 | 24/44 |
| explorer-signals | 3 | 2 | 4 | 0 | 0 | 0 | 0 | 37/44 |
| explorer-calculations | 21 | 2 | 0 | 0 | 0 | 0 | 0 | 37/44 |
| explorer-relationships | 4 | 2 | 0 | 0 | 0 | 0 | 0 | 37/44 |
| explorer-history | 8 | 2 | 0 | 0 | 0 | 0 | 0 | 38/44 |
| historical | 9 | 4 | 0 | 0 | 1 | 0 | 0 | 25/44 |
| investigation | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 40/44 |
| evidence | 21 | 4 | 0 | 0 | 0 | 0 | 0 | 37/44 |
| replay | 10 | 9 | 0 | 0 | 0 | 0 | 0 | 33/44 |
| windows | 28 | 4 | 0 | 0 | 0 | 0 | 0 | 41/44 |
| calculations | 16 | 0 | 0 | 0 | 0 | 0 | 0 | 40/44 |
| response | 6 | 4 | 0 | 0 | 0 | 0 | 0 | 33/43 |
| registry | 27 | 0 | 0 | 0 | 0 | 0 | 0 | 43/45 |
| config | 23 | 2 | 21 | 0 | 0 | 0 | 0 | 44/45 |
| config-effective | 22 | 4 | 17 | 0 | 0 | 0 | 0 | 44/44 |
| config-bundles | 4 | 4 | 0 | 0 | 0 | 0 | 0 | 37/44 |
| kpi | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 31/43 |
| trend | 12 | 0 | 0 | 0 | 1 | 0 | 0 | 43/45 |
| admin-users | 9 | 0 | 20 | 0 | 0 | 0 | 0 | 10/45 |
| admin-roles | 63 | 38 | 0 | 0 | 0 | 0 | 0 | 13/45 |
| admin-data-sources | 7 | 0 | 0 | 0 | 0 | 0 | 0 | 4/44 |
| admin-plant-model | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 33/44 |
| admin-aliases | 7 | 0 | 500 | 0 | 0 | 0 | 0 | 32/45 |
| admin-audit | 8 | 0 | 25 | 0 | 0 | 0 | 0 | 39/43 |
| admin-system | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 44/44 |
| pipeline | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 41/44 |
| governance | 55 | 55 | 6 | 0 | 0 | 0 | 0 | 30/43 |

The ring column is a lower bound: a ring drawn another way inside a web component's shadow DOM is not detected. Stops counted as having no ring include: `button. ""`, `button. "Missing binding"`, `button. "Stale collection"`, `button. "Active affected-device condition"`, `input.value-input ""`, `div. ""`, `div.visually-hidden ""`. Guide p.5 asks for a 2 px outline with a 3 px gap; `--focus-color` is `rgb(66,113,179)` Day and `#8a8a8a` Night. Tab-stop position inside `main` was **not measured reliably** and is left out.

Source count, `components/Cpm/**`, non-test `.tsx`:

| Element with `onClick` | Count | Detail |
|---|---|---|
| `<tr` | 1 | `windows/CompareAcrossKinds.tsx:45`: no keyboard path found on the row |
| `<div` | 11 | 6 modal backdrops. 3 with role, tabIndex, onKeyDown (`CpmCalculations.tsx:316`, `CpmWindows.tsx:154`, `LoopRegistry.tsx:109`). 2 pointer rows with an inner keyboard button (`PriorityQueue.tsx:70`, `CpmEvents.tsx:219`) |
| `<span` | 2 | stopPropagation wrappers |
| `<li` | 1 | `role="option"` (`LoopCombobox.tsx:200`) |

`tabIndex` lines: 14 across 12 files. `role="` lines: 111. Gate matrix uses roving tabindex on real buttons (`GateMatrix.tsx:266`). KPI table: links, rows not focusable. Historical window selection reads "Click a verdict band" (`SelectedWindowPanel.tsx:73`); no keyboard equivalent found.

## 10. Files that would need changes

Grouped as in §4. **No changes were made.** Numbers are colour declarations plus `T.*` references.

| Group | Files with colour | Largest |
|---|---|---|
| Core | 10 | `styles/app.css` 237, `styles/cpm.css` 229, `styles/hmi-dialogs.css` 189, `styles/cpm-evidence.css` 76, `App.tsx` 64, `styles/cpm-loop-summary.css` 61, `styles/cpm-evidence-layout.css` 39, plus `designTokens.css`, `styles/theme.ts`, `hooks/useObcTheme.ts`, `index.html` |
| Shared | 7 | `Cpm/shared.tsx` (10 hex; `cpmChartColors`, `cpmToneColors`, `toneFor`, `EmptyState`), `shared/ListPager.tsx`, `primitives/Trajectory.tsx`, `IntervalLane.tsx`, `nav/Sidebar.tsx`, `Cpm/gateStatus.ts`, `kpi/KpiCard.tsx` |
| Page | 30 | `Designer/Designer.css` 605 (remove from /trend rather than migrate), `Administration/DataSourceWizard.tsx` 86, `AuditExplorer.tsx` 77, `UserManagementConfig.tsx` 76, `BulkImportModal.tsx` 74, `RolesConfig.tsx` 64, `DataSourcesConfig.tsx` 56, `AliasConfig.tsx` 55, `Login/Login.css` |
| Charts | 11 | `trend/trendOption.ts`, `historical/chartOption.ts`, `replay/ReplayChart.tsx`, `evidence/CpmChart.tsx`, `primitives/Trajectory.tsx`, `IntervalLane.tsx`, `health/HealthLane.tsx`, `views/G13Interaction.tsx`, `kpi/KpiTrendChart.tsx`, `CpmPipeline.tsx`, `Designer/TrendCore.tsx` |
| Legacy | 93 | Not reachable in the slice, or hidden. Leave alone. Dead stylesheets: `styles/ag-theme-openbridge.css`, `styles/alarm-console.css`, root `Designer.css` |

## 11. Recommended migration approach

**No migration has started.** The Instrumental prompt was not available, so these phases follow the guide's build sequence (p.26) and the counts above. Effort figures are estimates derived from measured occurrence counts, for one engineer who knows the codebase. They exclude the decisions in §12 and any retesting at Marun.

The central recommendation is a **token bridge rather than a rewrite**. Because 97.5 % of live colour declarations already go through CSS variables, re-pointing the OpenBridge variables at Traverse tokens re-themes most of the app without editing those declarations. Guide p.26 step 1 explicitly allows this ("through a shared adapter where needed"). It also keeps the 217 `ObcButton` uses working.

| Phase | Work | Driven by | Estimate |
|---|---|---|---|
| 0. Decisions | Resolve §12 Q1-Q7 | Owners | Not engineering time |
| 1. Token layer and bridge | Import `tokens.css`. Add one bridge file mapping the 154 OpenBridge and app tokens in use to Traverse roles. Write `data-theme` alongside `data-obc-theme`. Add a first-paint script. Retire or remap Bright | 154 tokens, 132 token definitions | 3-5 days |
| 2. Literal clean-up | Replace 46 literal declarations and 124 `var()` literal fallbacks. Stop loading `Designer.css` on /trend, which removes most of them. Delete 3 dead stylesheets | 170 occurrences, 109 of 130 hex in one file | 2-3 days |
| 3. Shell | Module navigation, 64 px header with plant selector, search, time range and environment indicator, 3 px selected indicator. `App.tsx` is 837 lines and should be split first | §6, §9.3 | 5-8 days |
| 4. Shared components | Button and input adapters to 40 px, 44 px table rows, status badge, KPI card without nesting, panel geometry, type scale (68 distinct sizes → 5) | 217 `ObcButton`, 74 native buttons, 45 selects, 38 tables | 6-10 days |
| 5. Charts | One ECharts theme builder used by all 11 charts. Fix 5 charts that ignore theme changes, gaps (C2 overlay, C2 mode, C10, C11), direct labels, dashed SP, tooltip theming, axis pointer sync, value table, zoom-window label | 11 components | 8-12 days |
| 6. Status remap | Apply the approved mapping across the 28 mapped fields in §4.5. Separate running, caution and alarm collisions | 28 fields, 3 colliding tokens | 4-6 days |
| 7. Data states and help | One skeleton, one reset action, the word "Stale", restricted message, one info button pattern for definitions. Then apply Part C | §9.8, §8 | 5-8 days |
| 8. Page conformance | CPA01 and CPA02 layouts, overview table columns, mode lane on Explorer, then remaining pages | §9.4 | 6-10 days |
| 9. Acceptance | G01-G12 at three widths in both themes, using `docs/theme/tools/` | 31 routes × 2 themes | 3-4 days |

**Total: about 42-66 engineer-days**, after decisions.

**What can be reused from the Instrumental work:**

| Asset | Reusable? | Note |
|---|---|---|
| `references/tokens.css`, `tokens.json` | Yes, unchanged | Colour only since skill R1.1 |
| `scripts/contrast.py` | Yes | Re-run after any token change |
| `references/acceptance.md` G01-G12 | Yes | Add CPA module checks from guide p.28 |
| `references/components.md` | Partly | State tables apply; its chart section assumes recharts (§5.7) |
| `shadcn-bridge.css`, `.geometry.css` | **No** | CPA has no Tailwind or shadcn; it needs an OpenBridge bridge instead |
| Instrumental capture tooling | Not available | `docs/theme/tools/` here is new and could serve Instrumental in turn |

## 12. Risks and open questions

### 12.1 Questions that block writing the migration prompt

| # | Question | Why it blocks | Owner |
|---|---|---|---|
| Q1 | **Does Traverse replace the OpenBridge rule?** `CLAUDE.md` calls OpenBridge mandatory ("all designs, components, colors"), while the Traverse skill says OpenBridge is not used unless adopted through an adapter, and that it wins on values | The two standing rules contradict. The bridge in §11 needs one to be amended | Product owner, Lead |
| Q2 | **Does Graphite and Cyan Night override the achromatic Night?** Night is deliberately grey for ISA-101 colour reservation, a recorded project decision. Guide Night is blue-graphite with cyan actions | Changes the look operators use on night shift. It needs a human-factors decision, not only a design one | Product owner, operations |
| Q3 | **What happens to Bright?** The guide has Day and Night only; CPA has Day, Bright and Night | Decides whether a shipped feature is removed and how a saved `bright` preference migrates | Product owner |
| Q4 | **How do CPA's 13 pages fit the module navigation?** Guide p.6 fixes seven suite modules. CPA alone has 13 pages under four task groups, and the other modules are not deployed in this slice | Shapes the shell and every page header. Also: are absent modules shown, disabled or hidden? | Product owner, Lead |
| Q5 | **Global time range versus evaluated windows.** The guide has one header time range. CPA's numbers come from fixed 12 h and 24 h fused windows | A free range cannot recompute a fused verdict. Needs a rule for what the header control means on each page | CPA owner |
| Q6 | **Status mapping for owner-decision fields.** 20+ rows in §4.5 have no clear guide status. Examples: is a passed gate Success, when success means a recorded verified outcome? Should a suspected fault be Warning or Info? | Colour meaning cannot be migrated without it (guide p.4) | Control engineering, CPA owner |
| Q7 | **CPA metric definitions and eligible operating periods (guide p.29).** Is time in AUTO sample-based or time-based? Does UNKNOWN count as manual? Which modes count as auto? Which thresholds apply: 0.95 or 0.90? Which of the three staleness rules applies? | §9.4a shows the UI's stated definitions differ from the engine. Text cannot be simplified until the definition is agreed | Control engineering, CPA owner |

### 12.2 Other open questions

| # | Question | Owner |
|---|---|---|
| Q8 | Plant time zone and reporting-day boundary (guide p.29). Today browser and site zones appear together | Operations and data owner |
| Q9 | Remove the IEC 62443 sentence from the login page now, independent of migration? No assessment was found, and the failed-login audit claim is not supported. This is a live page | Security owner |
| Q10 | `/admin/system` is a live tab showing illustrative values, not connected to the backend. Hide it until wired? | Product owner |
| Q11 | Are the SuperAdmin pages (Pipeline, Governance, Admin) in migration scope? | Product owner |
| Q12 | Alarm priority and symbol mapping (guide p.29). Loop priority uses alarm colours today, with no site configuration | Alarm management, operations |
| Q13 | Is a 40 px control acceptable where touch panels are used? The OpenBridge rule keeps 48 px touch targets; the guide says 40 px minimum | Lead, operations |
| Q14 | Provide the Instrumental audit and prompt, so the two audits can be compared directly | Lead |
| Q15 | The prompt names skill R1.2; the file on disk says R1.1. Is a newer revision missing? | Lead |
| Q16 | Should the skill's chart contract be extended for echarts (§5.7)? | Lead |

### 12.3 Risks

| Risk | Effect | Mitigation |
|---|---|---|
| CPA is in production at Marun | A visual change reaches operators on a live plant | Ship behind a theme flag per site; keep the old theme selectable for one release |
| Lab data was unusual during capture | 165 of 243 loops stale and 76 never evaluated, so many KPIs read 0. Word counts reflect those states, and populated pages will differ. Ranked-table density in particular is understated | Re-run `docs/theme/tools/` on a populated lab before the migration baseline |
| Branch moved during capture | Commit `d67b41e0` landed and `cplm-api` was redeployed by another session. It changed no styling, and the source counts were re-run afterwards | Baseline on a tagged commit |
| Status tones collide | Remapping one token changes several unrelated meanings at once (§4.5) | Split the fields before changing any value |
| Charts ignore theme changes | 5 of 11 charts keep old colours until they re-render, so parity defects would look intermittent | Do the theme builder before any page work |
| `title` tooltips carry definitions | They are mouse-only, so moving text to `title` would worsen accessibility | Use one keyboard-reachable info control |
| Text reduction hides safety context | Operators may rely on wording that looks redundant | Part C proposals need control-engineer review before any removal |

## 13. Method appendix

Every number above comes from these commands, run from the repository root. The capture tools read `CPA_BASE_URL`, `CPA_USER` and `CPA_PASSWORD` from the environment and write none of them anywhere.

**Tooling.** Playwright core 1.57.0 and axe-core 4.14.0 are installed in `docs/theme/tools/.tooling/` (git-ignored by `docs/theme/tools/.gitignore`). The application's `package.json` and lock file are untouched. Browser: Chromium 1200, headless.

```powershell
# Source inventory: docs/theme/data/source-inventory.json
node docs/theme/tools/source-inventory.mjs

# Routes, screenshots, text, geometry, keyboard, axe: docs/theme/screenshots/current/manifest.json
$env:CPA_BASE_URL = 'http://localhost:5174'
node docs/theme/tools/capture-screens.mjs
node docs/theme/tools/capture-screens.mjs --only config,config-effective,config-bundles,admin-users,admin-roles,admin-data-sources,admin-plant-model,admin-aliases,admin-audit,admin-system,pipeline,governance   # as superadmin

# States and surfaces: <theme>/states/ and states.json
$env:CPA_READ_POSTS = '/api/v1/cpm/method-runs/evidence/batch,/api/bindings/resolve/batch'
node docs/theme/tools/capture-states.mjs
node docs/theme/tools/capture-states.mjs --super   # as superadmin

# Tables quoted in this document: docs/theme/data/tables/
node docs/theme/tools/report-tables.mjs
node docs/theme/tools/text-audit.mjs

# Annotated images
node docs/theme/tools/annotate-screens.mjs explorer events evidence
```

**Definitions.**

| Term | Definition | Script |
|---|---|---|
| Live file | Reachable by imports from `main.tsx`, with `App.tsx` lazy imports limited to Cpm, Administration, Login, TrendPage | `lib/import-graph.mjs` |
| Colour declaration | CSS colour-bearing property, or TS/TSX key such as `color`, `background`, `fill`, `stroke`. Keywords excluded | `lib/colour-rules.mjs` |
| Tokenised / literal / indirect | Holds `var()` or `T.*` / holds a literal / a variable or function that syntax cannot resolve | `source-inventory.mjs` |
| Visible word | Rendered text outside data regions, walking shadow DOM and slots | `lib/dom-metrics.mjs` |
| Text block | Nearest block-level element's text, 4+ words, not a control, heading or data | `lib/dom-metrics.mjs` |
| Stable | No open non-stream request and no DOM mutation for 700 ms, no skeleton above 24 px; 25 s limit | `lib/session.mjs` |
| Classification | First matching rule, then a default by block kind | `lib/text-rules.mjs` |

**Greps for the component mix (§3.1)**, over `src/App.tsx`, `components/Cpm`, `Administration`, `Login`, `nav`, `shared`, `charts`, `CommandPalette.tsx`, `Designer/TrendPage.tsx`, `TrendCore.tsx`, `Designer/trend`:

```bash
grep -rhoE "<Obc[A-Z][A-Za-z]+" $L --include=*.tsx | sort | uniq -c | sort -rn
grep -rhoE "<button\b|<select\b|<table\b|style=\{|className=" $L --include=*.tsx | sort | uniq -c
```

**Greps for keyboard source counts (§9.9)**, from `src/frontend-ob/src`. Single-line grep undercounts multi-line JSX, so the table uses a parse of each opening tag:

```bash
grep -rnE --include=*.tsx --exclude=*.test.tsx "<div[^>]*onClick" components/Cpm
grep -rn  --include=*.tsx --exclude=*.test.tsx "tabIndex" components/Cpm
grep -rnE --include=*.tsx --exclude=*.test.tsx 'role="' components/Cpm
```

**How §5 and §9 were produced.** Charts, status mappings, data states and metric handling were read from source by three separate review passes, then a sample of the highest-stakes claims was re-checked against the code: IEC 62443 wording, NE107 tokens, `autoCount / n`, the overlay filter, gap handling, redirect behaviour, and the batch POSTs being reads. All held. Other file and line citations were not individually re-checked. Commit `d67b41e0` moved a few lines in `GateEvidenceWorkspace.tsx` after that reading, so citations in that file may be off by a line or two.

**Corrections made during measurement.**

- A nested `<main>` in `GateEvidenceWorkspace.tsx:212` and `ResponseWorkspace.tsx:136` doubled their text at first. Fixed; evidence fell from 540 to 435 words and response from 276 to 187. The nesting itself is a real defect, reported by axe as `landmark-no-duplicate-main`.
- Stylesheets sharing a filename in two folders were misattributed at first, then resolved by full path.

**Not measured:** inspector width; bad-quality state; genuine low-privilege restricted state; tab position inside `main`; canvas chart marks by axe (ratios in §5 are computed from tokens); zoom and reflow at 200 %; reduced motion.
