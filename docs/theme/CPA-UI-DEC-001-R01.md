# CPA — Design-System Decisions and Analysis Review

| Field | Value |
|---|---|
| Document ID | CPA-UI-DEC-001 |
| Revision | R01 |
| Date | 2026-11-04 |
| Application | CPA — Control Loop Performance Management (Traverse Edge), `src/frontend-ob/` |
| Input reviewed | `docs/theme/cpa-currenttheme.md` (CPA-UI-PRM-001 R01 output, branch `feat/v25-next-release`, commit `16184182`), `cpa-text-audit-by-route.md`, `data/`, `screenshots/current/` (373 images) |
| Governs | CPA-UI-PRM-002 (colour migration) and the later CPA content and layout packages |
| Authority | TRV-UI-BRF-001 §1. This record amends §1.3 of the brief for CPA only (CD1) |
| Owner | Tofel |

---

## 1. Review of the analysis

The analysis is accepted as the baseline. Its counts carry their commands (§13 of the analysis), the capture tooling is reproducible, and the guide pages read are recorded. Five qualifications apply.

| # | Qualification | Consequence |
|---|---|---|
| R1 | The lab was atypical during capture: 165 of 243 loops stale, 76 never evaluated; the dev server read the wrong historian prefix (`root.site1.cpm` instead of `root.hdpe.cpm`), so Explorer, Historical, Replay and Evidence charts are largely empty. | Word counts and table densities are understated. PRM-002 Phase 0 re-captures the baseline from a production build with the correct prefix on a populated lab. |
| R2 | The text classifier did not separate implementation detail from operator information. A re-scan of the per-route audit for enums, pipeline terms, internal IDs, engine notes and file paths found **137 blocks on 26 routes, of which 112 were classed Keep** (worst: explorer-calculations 19, pipeline 14, evidence 12). Command: `python3 internal_text.py cpa-text-audit-by-route.md` (pattern set recorded in CD17). | A fifth class, **Internal**, is added (CD17). The top-20 list is re-ranked in the content package. |
| R3 | `title` tooltips hold 4,393 words, most of the calculation logic, and were measured but not classified. | They are the primary input for the help registry (CD16). |
| R4 | The repository carries `traverse-design-system` skill **R1.1**; the project copy is **R1.2** (scrollbar geometry moved to the geometry file; token values unchanged since R1.0). Answers Q15. | Replace the repository copy with R1.2 before PRM-002 Phase 0. |
| R5 | §11 of the analysis estimates 42–66 engineer-days across colour, shell, components, charts, status, data states and pages. | The colour package (PRM-002) covers analysis phases 1, 2, 5 (colour part only) and 6. Shell, geometry, component replacement, chart behaviour and page conformance are separate packages. |

## 2. Decisions

Status: **A** = approved by the owner on 2026-11-04; **R** = ruled from TRV-UI-BRF-001 §2 (stands unless the owner objects); **P** = proposed, awaiting the named party.

### 2.1 Design system and themes

| # | Decision | Status |
|---|---|---|
| CD1 | **Traverse tokens through an OpenBridge adapter.** The OpenBridge web components (`obc-*`, 217 `ObcButton` uses) remain the component layer. Every colour value comes from `traverse-tokens.css` through a new `openbridge-bridge.css` that re-points the OpenBridge and application variables in use to Traverse roles. No OpenBridge value survives on a themed surface. This amends TRV-UI-BRF-001 §1.3 for CPA, and the CPA `CLAUDE.md` rule "OpenBridge is mandatory for all designs, components, colors" becomes "OpenBridge components; Traverse values". Basis: guide p.26 step 1 ("through a shared adapter where needed"); analysis §11 (97.5 % of live colour declarations already resolve through variables). Component replacement is not planned; if it is wanted later, it is a layout package. | A |
| CD2 | **Night = Graphite and Cyan** per guide p.3, replacing the achromatic OpenBridge Night (`designTokens.css:181,187` overrides removed). ISA-101 colour reservation is preserved by usage, not by an achromatic palette: surfaces are low-chroma, cyan is limited to actions, selection and focus, and status hues appear only for abnormal or recorded states (CD10). Operations sign-off is required before release at Marun. | A |
| CD3 | **Bright is removed.** The guide defines Day and Night only. The first-paint script migrates a stored `bright` to `day` once; this is recorded in the release note. OpenBridge `dusk` stays unexposed. | A |
| CD4 | **Theme mechanism for the CPA stack.** Keep the hand-written `ThemeContext` (`App.tsx:90-96`); no next-themes and no new dependency (the next-themes rule in brief §2 is specific to Next.js). The provider writes `data-theme` (Traverse) and `data-obc-theme` (OpenBridge internals) together, with values `day` or `night` only. Storage key `ams-theme` is kept. A blocking script in `index.html` `<head>` reads the key, maps `bright`→`day`, `dark`→`night`, `light`→`day`, defaults to `day`, and sets both attributes before first paint; the hardcoded `data-obc-theme="day"` at `index.html:2` is removed. The theme toggle becomes a Day/Night control per the skill's "Theme switch" contract. | R |
| CD5 | **Token files.** `traverse-tokens.css` is a verbatim copy of skill R1.2 `references/tokens.css`. `--traverse-*` variables are defined only there. `shadcn-bridge.css` and `shadcn-bridge.geometry.css` do not apply to CPA. | R |
| CD6 | **Colour only.** No layout, spacing, typography, component structure or behaviour change in PRM-002 (brief §3, D14). `ObcButton` 48 px, 32.5–115 px rows, the 28 rendered type sizes, 8 px panel radius, 16 px content padding and the absent header controls are recorded in `geometry-deviations.md`. The 48 px touch target is retained until Q13 is decided. The one exception is the focus ring, which is a colour and accessibility rule. | R |

### 2.2 Status semantics

| # | Decision | Status |
|---|---|---|
| CD7 | **Split the colliding tokens before remapping.** `--alert-running-color`, `--alert-caution-color` and `--alert-alarm-color` currently carry unrelated meanings (analysis §4.5). Each field gets its own semantic role so that one value change cannot alter several meanings. | R |
| CD8 | Field mapping (Traverse `status.*` unless stated otherwise): | |
| | Gate PASS → neutral, ✓ glyph and label (a computed check, not a recorded verified outcome). Gate limited pass → neutral with a distinct glyph, so that it is not identical to PASS (analysis §9.7). WARN → warning. FAIL → danger. Not evaluated, insufficient, none, n/a, DISABLED, pending → unknown (DISABLED added to the legend). EXCLUDED → neutral with glyph, in both the matrix and the roll-up. | R |
| | Diagnosis: suspected, detected, classified → info (a hypothesis, guide p.4). Ruled out, no fault → neutral. **Confirmed finding → warning ("condition open")**. | R; confirmed = P (control engineering) |
| | Mode AUTO, MAN, CAS and others → neutral text. "Out of design mode" → warning only against the configured threshold, always with its label. | R |
| | Episode review: unacknowledged → warning; acknowledged → info; shelved → neutral; shelf expired, unreviewed → warning. | R |
| | Source quality: GOOD → neutral; UNCERTAIN, MAINT → warning; BAD → danger; aged GOOD → warning with the word "Stale"; OOS, no comm → unknown. Quality stays a separate field from diagnosis (guide p.16). | R |
| | Jobs and runs: queued → unknown; running, in progress → info; completed, done → success; failed, rejected, job down → danger. | R |
| | Deployment ACTIVE_VERIFIED, evidence COMPLETE, response VALIDATED → success. Rebuilt evidence → info with the label "Rebuilt". | R |
| | Registry Active, data source Active, connected → info. Degraded → warning. | R |
| | Loop priority, criticality, finding severity, change class, user roles → neutral badge (guide p.4: no automatic priority colour; status colour stays out of unrelated fields). Any future colour comes from the configured site alarm philosophy (Q12). | R |
| | Evidence score bar and metric meters → neutral fill (`text.secondary` on `surface.raised`) plus the value; no "lower is greener". Thresholded metric bands (`GoodErrorBar` 80/50, `CpmWindows` 0.9/0.5, `fleetKpiView` 0.10) → colour only with a label and a server-configured threshold; hardcoded thresholds are logged for Q7. | R |
| CD9 | **NE107** uses the fixed Traverse fills: F `#D92D45`/white, C `#F79B4A`/`#152238`, S `#F7D75C`/`#152238`, M `#79B6FF`/`#152238`. The code letter is always shown with its label. C is no longer green; M is no longer near-transparent. Unknown is availability, not a fifth category. Normal is neutral. | R |
| CD10 | **Violet** only on labelled AI content. CPA has none, so `--ams-pen-5` and every violet series are remapped (CD12). | R |
| CD11 | **Success** only for recorded verified or completed outcomes (brief §2). The analysis §9.7 violation list is the Phase 6 work list. | R |

### 2.3 Charts (echarts)

| # | Decision | Status |
|---|---|---|
| CD12 | **One chart theme builder**, `src/frontend-ob/src/charts/chartTheme.ts`, used by all 11 echarts components. It resolves `var(--traverse-chart-*)` and `var(--traverse-*)` to literals at option build (canvas cannot read CSS variables), subscribes to the theme, and sets tooltip, axisPointer, splitLine, axisLine, axisLabel and dataZoom colours explicitly. It replaces `cpmChartColors`, `cpmToneColors`, `PEN_TOKENS` and the duplicate `resolveColor`. Series roles: PV = `chart.series.1`; SP = `chart.series.5`, dashed and labelled; OP = `chart.series.3`; VP = `chart.series.4`; further pens `chart.series.6`, then repeat with a dash pattern. `chart.series.2` (violet) is reserved for AI. All five non-violet series pass 3:1 against page, panel and raised surfaces in both themes (lowest: series 6 on Day raised, 4.62:1). | R |
| CD13 | Distribution and proportion marks use `status.*.fg` (not the old caution fill at 1.03:1), and Normal uses `surface.raised` with a thin `border.strong` edge (brief §2). | R |
| CD14 | **Colour defects fixed in PRM-002:** 5 charts that ignore a theme change; untinted tooltip at night; PV drawn in the alarm colour on `/trend`; ECharts default grid, axis and zoom colours; SP solid in the evidence lanes and on `/trend` (line style is colour-layer encoding per guide p.5). **Behaviour defects diagnosed only, merged after approval:** joined gaps (C2 overlay and mode, C11, C3 outage), zero-fill (C10), zoom-window label, value table, cursor sync, browser-versus-site time zone on axes and tooltips. | R |
| CD15 | Propose skill R1.3: an echarts section in `references/components.md` (resolved literals, theme-dependent rebuild, explicit chrome, nulls for gaps, `aria` option). Answers Q16. | P (Lead) |

### 2.4 Text, help and internal detail

| # | Decision | Status |
|---|---|---|
| CD16 | **Help pattern.** ⓘ beside a value = metric definition; ? in a panel header = "How to read this view" (the Performance panel is the existing instance). Both are real buttons with `aria-expanded` and `aria-controls`. They open on click, Enter or Space; hover opens after about 300 ms as an enhancement only. Content stays open while the pointer or focus is inside, Esc closes it, focus returns to the trigger, and one is open at a time (WCAG 2.1 SC 1.4.13, 2.1.1, 2.4.7, 4.1.2; guide p.6). The definition template is fixed and at most about 60 words: what it measures · formula · window and eligibility · unit · source and calculation version · "Full calculation ›", which opens the existing calculation drawer (`?metric=`). Content comes from one registry (`calcCatalogue.ts` / `kpiMeta.ts`), never from inline strings. `title` attributes carrying definitions are removed when the registry entry exists. | A (pattern); built in the content package |
| CD17 | **Fifth text class: Internal** (implementation detail). Dispositions: **Translate** raw enums (`NO_CALL`, `INSUFFICIENT_EVIDENCE`, `UNSET`, `UNKNOWN`, `PERIODIC`, `TIGHT`, `SINGLE`, `PRESET`, `op_requested`, `u_applied`) through the existing vocabulary (`utils/modeVocabulary.ts`, `vocabulary.ts`). **Collapse** run, bundle and source IDs, calculation and engine versions, topic names and job codes into a keyboard-reachable "Technical details" disclosure; they stay available for traceability. **Remove** pipeline mechanics (Flink, Kafka, watermark, proxy, arrays, scalars, A8 or A13 jobs, `docs/` paths) from operator and engineer pages; they remain on Pipeline Health only, stated as data states ("Not available"). | A (principle); executed in the content package |
| CD18 | **Gate codes: name first, code secondary**, for example "Data quality · G0". The gate matrix keeps codes as column heads, with the name in the ⓘ toggletip. | A |
| CD19 | **Content changes are not made in PRM-002.** PRM-002 logs Keep / Shorten / Move to help / Remove / Internal candidates in `docs/theme/content-candidates.md`. The content package executes them after control-engineering review (analysis §12.3: text that looks redundant may carry safety context). Units, data-state labels, coverage, time zone, source and error text are never removed. | R |

### 2.5 Items to act on independently of the migration

| # | Decision | Status |
|---|---|---|
| CD20 | Remove from `Login.tsx:155-157` the IEC 62443 compliance sentence, and replace "Secure sign in" with "Sign in". Keep "Authorized use only. Access is restricted to authorized operators." No assessment exists, and `docs/architecture-review/02-auth-security-review.md` conflicts with the claim (analysis §8.5). Ship as a hotfix. | R (brief §5.5); security owner informed |
| CD21 | Hide `/admin/system` (remove it from `SLICE_ADMIN_TABS`) until it is connected to the backend. Its own notice states that the values are illustrative. | P (product owner) |
| CD22 | **SuperAdmin pages** (Pipeline, Governance, Admin) are in colour scope, because the bridge is global and excluding them would leave mixed themes. Their content audit is lighter. Answers Q11. | R |
| CD23 | One product identity across login and shell: "Traverse CPA". "Lean Automation" in the header and the alternate names on the login page are logged for the content package (guide p.28). | R |

## 3. Open items

| # | Item | Owner | Blocks |
|---|---|---|---|
| Q4 | Fit of CPA's 13 pages into the fixed suite module navigation; treatment of modules not deployed. Recommendation: CPA is one module, and its pages form a second-level navigation keeping the four task groups. | Product owner, Lead | Layout package |
| Q5 | Meaning of the header time range on CPA pages. Recommendation: on evaluated pages it selects the evaluation window kind (12 h or 24 h) and never recomputes a fused verdict; on trend pages it sets the plotted span. | CPA owner | Layout package |
| Q7 | CPA metric definitions and eligible operating periods (guide p.29); **not issued**. Known discrepancies between the UI and the engine (analysis §9.4a): time in AUTO divides by samples present, not window time; UNKNOWN mode counts as manual; the auto set includes NORMAL, RSP, DDC and SUP; thresholds 0.95 (card) and 0.90 (G1) conflict; three staleness rules (60 min, window length, 3 h); five names for one field. These are raised as tickets. No label or calculation changes until the definitions are approved. | Control engineering, CPA owner | Content package help text |
| Q8 | Plant time zone and reporting-day boundary. | Operations, data owner | Chart behaviour fixes |
| Q12 | Site alarm philosophy, needed if loop priority is ever coloured. | Alarm management | None (neutral until then) |
| Q13 | 40 px guide minimum versus 48 px touch targets. | Lead, operations | Layout package |
| CD8 | Colour of a confirmed finding (proposed: warning). | Control engineering | Phase 6 |
| CD15 | Echarts contract in skill R1.3. | Lead | None |
| — | The Lead's tokens package (guide p.30) and its reconciliation. | Lead | None; values are unchanged |

## 4. Evidence index

| Claim | Source |
|---|---|
| Stack, theme mechanism, stylesheets | Analysis §3.1–3.3 |
| Readiness 97.5 %, 0 % Traverse | Analysis §4.1–4.2 |
| Status mappings and collisions | Analysis §4.5 |
| Chart inventory and defects | Analysis §5 |
| Geometry and type deviations | Analysis §6 |
| Internal text count (137 / 112 Keep) | This record R2; re-scan of `cpa-text-audit-by-route.md` |
| Series contrast for CD12 | WCAG relative-luminance computation against `tokens.css` R1.2 values; minimum 4.62:1 |
| Login claim | Analysis §8.5 |
