# 06 — Night-Mode Color & Design-Pattern Audit

**Status:** Analysis only — no source file, token file, or stylesheet was modified.
**Scope:** `src/frontend-ob` night theme (`data-obc-theme="night"`).
**Date:** 2026-08-27
**Governing standards:** ISA-101, ISA-18.2 / EEMUA 191, NAMUR NE107, IEC 60073, WCAG 2.1 AA.

## Method & evidence basis

Every color value in this report was resolved from the installed palette source
(`node_modules/@oicl/openbridge-webcomponents/src/palettes/variables.css`, 13 326 lines) and the
project's own stylesheets, then run through a WCAG 2.1 relative-luminance/contrast computation.
Because all theme values are **static CSS custom properties** with a deterministic cascade, resolved
values are exact rather than sampled.

No live browser render was performed (see [Open Questions](#open-questions), OQ-1). Claims are
therefore stated as *computed* values, not *observed* pixels. Every claim carries a file citation;
anything not verifiable in code is in Open Questions.

---

## Executive summary

The prompt's hypothesis — "one amber hue does double duty as brand chrome and alarm-significant
color" — is **confirmed, and the real situation is worse than hypothesised.** Three independent
defects compound:

1. **Chrome out-shouts alarms.** Night chrome text `#EAA75E` renders at **10.19:1** against the
   black canvas, while *every* alarm color is pinned at **~4.55:1**. Ordinary navigation labels are
   **2.59× the relative luminance of a Critical alarm.** The salience hierarchy is inverted.
2. **Alarm fills are dead code.** **32 of 173** custom properties referenced by project source are
   defined nowhere — **119 declaration sites silently drop**, of which **57 are alarm/status-significant**
   (`--alert-alarm-background-color`, `--running-color`, `--on-alert-alarm-active-color`, …). The
   nav alarm badge has **no background color at all**. All 157 amber chrome declarations are live.
3. **Night mode has no surfaces and no dialogs.** All four container tokens resolve to `rgb(0,0,0)`
   — zero elevation. Dividers sit at **1.25:1** (invisible). And `hmi-dialogs.css` is a
   theme-blind light stylesheet, so every dialog opens as **#FFFFFF at 21:1 glare** on a dark-adapted
   console.

The single-sentence verdict: **today's night mode uses saturated color as branding and neutral
absence-of-color as alarm — a direct inversion of ISA-101, and it breaks the ISA-18.2 priority
mapping at the point of use.**

---

# Phase 1 — The actual theme-toggle mechanism

## 1.1 The control

The Day / Bright / Night control is **not** an OpenBridge component. It is a hand-rolled inline-styled
segmented button group inside the app shell:

| Concern | Location |
|---|---|
| Control markup | [App.tsx:528-551](../../src/frontend-ob/src/App.tsx#L528-L551) — `(['day','bright','night'] as Theme[]).map(...)` at [:534](../../src/frontend-ob/src/App.tsx#L534), `onClick={() => setTheme(t)}` at [:538](../../src/frontend-ob/src/App.tsx#L538) |
| Type | [App.tsx:95](../../src/frontend-ob/src/App.tsx#L95) — `type Theme = 'day' \| 'bright' \| 'night'` |
| State | [App.tsx:96-101](../../src/frontend-ob/src/App.tsx#L96-L101) — React `createContext` + `useContext`, **not** Zustand |
| Initial value | [App.tsx:152-160](../../src/frontend-ob/src/App.tsx#L152-L160) — hydrated from `localStorage['ams-theme']`, default `'day'` |
| Persistence | [App.tsx:164](../../src/frontend-ob/src/App.tsx#L164) |

> Note: `dusk` — a theme OpenBridge fully defines (661 tokens) — is **not exposed** by the union type.
> The adjacent comment at [App.tsx:528](../../src/frontend-ob/src/App.tsx#L528) still reads
> `{/* Theme: Day | Bright */}` and is stale by one option.

## 1.2 Where state reaches the DOM

**[App.tsx:163](../../src/frontend-ob/src/App.tsx#L163)** — the single write:

```ts
document.documentElement.setAttribute('data-obc-theme', theme);
```

It is set on `<html>`, matching the server-rendered default at
[index.html:2](../../src/frontend-ob/index.html#L2) (`<html lang="en" data-obc-theme="day">`).
Components that need to react in JS observe it via `MutationObserver`:
[useObcTheme.ts:13-21](../../src/frontend-ob/src/hooks/useObcTheme.ts#L13-L21) and, separately,
[TrendCore.tsx:92-96](../../src/frontend-ob/src/components/Designer/TrendCore.tsx#L92-L96).

## 1.3 Every file that participates in theme switching

| # | File | Role | Theme-branch selectors | Raw hex | Notes |
|---|---|---|---|---|---|
| 1 | `node_modules/@oicl/openbridge-webcomponents/src/palettes/variables.css` | **Palette source of truth** | 4 (`day` L10415, `dusk` L11128, `night` L11876, `bright` L12564) | n/a (rgb()) | 661 declarations per theme (675 for `bright`) |
| 2 | [components/Designer/designTokens.css](../../src/frontend-ob/src/components/Designer/designTokens.css) | **Project override** — `--ams-*` + ~30 compatibility aliases | **3** (`day` [:9](../../src/frontend-ob/src/components/Designer/designTokens.css#L9), `bright` [:72](../../src/frontend-ob/src/components/Designer/designTokens.css#L72), `night` [:84](../../src/frontend-ob/src/components/Designer/designTokens.css#L84)) | 43 (token definitions — correct) | No `dusk` block |
| 3 | [App.tsx:106-124](../../src/frontend-ob/src/App.tsx#L106-L124) (`TB`) + [styles/theme.ts](../../src/frontend-ob/src/styles/theme.ts) (`T`) | **Semantic remap layer** (TS → `var()`) | n/a | 0 | Introduces no color, but **misroutes token roles** — see F-06 |
| 4 | [styles/hmi-dialogs.css](../../src/frontend-ob/src/styles/hmi-dialogs.css) | **Hardcoded leak** — light-only dialog system | **0** | **63** | 1 179 lines; `--hmi-surface:#FFFFFF`, `--hmi-header-bg:#1976D2` on bare `:root` |
| 5 | [components/Designer/Designer.css](../../src/frontend-ob/src/components/Designer/Designer.css) | Mostly token-driven; hex as `var(…, #fallback)` | 0 | 110 | Fallbacks encode a *dark* assumption; 2 hard leaks at [:1332](../../src/frontend-ob/src/components/Designer/Designer.css#L1332), [:1353](../../src/frontend-ob/src/components/Designer/Designer.css#L1353) |
| 6 | [components/AlarmConsole/shelve-dialog.css](../../src/frontend-ob/src/components/AlarmConsole/shelve-dialog.css) | **Hardcoded leak** | 0 | 47 | |
| 7 | [styles/app.css](../../src/frontend-ob/src/styles/app.css) | App shell chrome | 0 | 9 (all `var()` fallbacks) | Depends on 5 undefined tokens — see F-03 |
| 8 | 17 × `.tsx` files | **Hardcoded leak** | n/a | **82** | Incl. [Dashboard.tsx:607-609](../../src/frontend-ob/src/components/Dashboard/Dashboard.tsx#L607-L609) |
| — | `styles/cpm.css`, `styles/alarm-console.css`, `styles/ag-theme-openbridge.css`, `components/AlarmConsole/*.css` | **Clean** — fully token-driven | 0 (grep hits are comments only) | 0 | Reference implementation of the correct pattern |

Load order is fixed in [main.tsx:16-28](../../src/frontend-ob/src/main.tsx#L16-L28): OpenBridge CSS →
`designTokens.css` → `app.css` → `hmi-dialogs.css` → `cpm.css`. Because `hmi-dialogs.css` loads
*after* the token layer and defines on bare `:root`, its light values win unconditionally.

## 1.4 Definitive count

> **Exactly three files are genuine sources of truth for night-mode color** — the OpenBridge palette
> (`variables.css`), the project override (`designTokens.css`), and the TypeScript remap layer
> (`App.tsx` `TB` / `styles/theme.ts` `T`) — **but a further five files (plus 17 `.tsx` files)
> containing 311 hardcoded color literals do not respond to the theme attribute at all**, so the
> practical redesign surface is **eight files, not one.**

Breakdown of the 311 literals: `Designer.css` 110 · `.tsx` files 82 · `hmi-dialogs.css` 63 ·
`shelve-dialog.css` 47 · `designTokens.css` 43 *(legitimate — these are the token definitions)* ·
`app.css` 9 *(all `var()` fallbacks)*. Excluding the legitimate 43, **268 are leaks or fallbacks.**

---

# Phase 2 — Audit of current night-mode visuals

## 2.1 Resolved night palette (from `variables.css` L11876-12563)

| Token | Night value | Contrast vs `#000` | Role in app |
|---|---|---|---|
| `--element-active-color` | `rgb(234,167,94)` `#EAA75E` | **10.19:1** | Primary text, nav labels, headers, values |
| `--element-neutral-color` | `rgb(199,136,66)` `#C78842` | 7.03:1 | Secondary text (96 uses — most-used token in the app) |
| `--element-inactive-color` | `rgb(156,106,52)` `#9C6A34` | 4.52:1 | Muted text |
| `--element-disabled-color` | `rgb(72,52,31)` `#483420` | 1.79:1 | Disabled |
| `--container-global/background/section/backdrop-color` | **all `rgb(0,0,0)`** | 1.00:1 | Canvas, card, section, backdrop — **all identical** |
| `--border-divider-color` | `rgb(39,27,16)` `#271B10` | **1.25:1** | Every divider and card border |
| `--alert-alarm-color` (Critical) | `rgb(233,15,32)` `#E90F20` | 4.55:1 | |
| `--alert-warning-color` (High) | `rgb(186,90,0)` `#BA5A00` | 4.55:1 | |
| `--alert-caution-color` (Medium) | `rgb(137,115,0)` `#897300` | 4.52:1 | |
| `--alert-running-color` (Normal) | `rgb(0,136,0)` `#008800` | 4.52:1 | |

OpenBridge deliberately normalises **all four alert colors to ~4.5:1** so they are distinguished by
*hue*, not brightness. That is a sound decision — **which the chrome then destroys** by sitting at
10.19:1 above them.

## 2.2 Verification of the core hypothesis

**Question:** is the same amber used for nav labels, headers, borders, values *and* the critical-alarm
counter? **Answer: partly — and the exception is worse than the rule.**

| Surface | File / line | Token | Night value | Verdict |
|---|---|---|---|---|
| Nav item label | [app.css:265](../../src/frontend-ob/src/styles/app.css#L265) | `--on-surface-neutral-color` → `--element-neutral-color` | `#C78842` amber | amber ✔ |
| Nav item hover/active label | [app.css:277](../../src/frontend-ob/src/styles/app.css#L277), [:282](../../src/frontend-ob/src/styles/app.css#L282) | `--on-surface-active-color` | **UNDEFINED — declaration dropped** | no hover feedback |
| Nav item hover/active background | [app.css:276](../../src/frontend-ob/src/styles/app.css#L276), [:281](../../src/frontend-ob/src/styles/app.css#L281) | `--regular-hover/pressed-background-color` | **UNDEFINED — dropped** | no active highlight |
| **Nav alarm badge** | [app.css:286-295](../../src/frontend-ob/src/styles/app.css#L286-L295) | `--alert-alarm-background-color` / `--on-alert-alarm-active-color` | **BOTH UNDEFINED — dropped** | **badge has no red fill** |
| Brand title "Traverse AMS" | [app.css:73-79](../../src/frontend-ob/src/styles/app.css#L73-L79) | `var(--on-surface-active-color, #1F2937)` | falls back to `#1F2937` | **1.43:1 — invisible** |
| Top-bar Critical counter | [App.tsx:485-488](../../src/frontend-ob/src/App.tsx#L485-L488) | `--alert-alarm-color` | `#E90F20` | correct red ✔ |
| Top-bar Critical counter *background* | [App.tsx:481](../../src/frontend-ob/src/App.tsx#L481) | `TB.criticalBg` → `--container-section-color` | `rgb(0,0,0)` | **identical to normal bg** |
| Top-bar Unacked counter | [App.tsx:493](../../src/frontend-ob/src/App.tsx#L493) | `--alert-warning-color` | `#BA5A00` | High-priority hue used for an *ack-state* count |
| **Dashboard "Medium" KPI tile** | [Dashboard.tsx:609](../../src/frontend-ob/src/components/Dashboard/Dashboard.tsx#L609) | **`--element-active-color`** | **`#EAA75E` — the chrome token** | **direct conflict** |
| **Dashboard "High" KPI tile** | [Dashboard.tsx:608](../../src/frontend-ob/src/components/Dashboard/Dashboard.tsx#L608) | `T.caution` → `--alert-caution-color` | `#897300` (Medium's color) | **priority mis-map** |
| Selected theme-toggle label | [App.tsx:544](../../src/frontend-ob/src/App.tsx#L544) | `TB.blue` → `--selected-enabled-**background**-color` | `rgb(16,33,26)` | **1.25:1 — invisible** |

## 2.3 Findings

| ID | Finding | Evidence | Severity | Standard violated |
|---|---|---|---|---|
| **F-01** | **Salience inversion.** Chrome text `#EAA75E` (10.19:1, luminance 0.4594) is **2.59× the luminance of a Critical alarm** `#E90F20` (4.55:1, 0.1777) and **2.61×** that of a Medium alarm. Chrome is the brightest thing on screen. | `variables.css` night block; computed | **Critical** | ISA-101 §color reservation; EEMUA 191 (alarm must attract attention) |
| **F-02** | **Chrome hue is an alarm hue.** `#EAA75E` is an orange-amber sitting between the agreed High (orange) and Medium (amber) priorities. An operator cannot tell "this orange = High priority" from "this orange = app chrome". | `variables.css` night block; agreed mapping in [conversion.md:70](../../conversion.md#L70) | **Critical** | ISA-18.2 / EEMUA 191 priority coding |
| **F-03** | **Alarm fills are dead tokens.** 32 of 173 referenced custom properties are undefined → **119 dropped declarations**, of which **57 are alarm/status-significant**: `--running-color` (21), `--alert-alarm-background-color` (10), `--alert-caution-background-color` (7), `--alert-warning-background-color` (4), `--on-alert-alarm-active-color` (4), + 7 more. | Full list in §2.4 | **Critical** | ISA-18.2; ISA-101 |
| **F-04** | **Chrome token used *as* an alarm-priority color.** Medium-priority KPI tile is painted `--element-active-color` — literally the navigation text token. | [Dashboard.tsx:609](../../src/frontend-ob/src/components/Dashboard/Dashboard.tsx#L609) | **Critical** | ISA-18.2; ISA-101 |
| **F-05** | **Priority mis-map.** High-priority KPI tile uses `--alert-caution-color` (Medium's token). High and Medium are visually merged. | [Dashboard.tsx:608](../../src/frontend-ob/src/components/Dashboard/Dashboard.tsx#L608) | **High** | ISA-18.2 |
| **F-06** | **Token-role misuse.** `TB.blue` maps a *background* token (`--selected-enabled-background-color`, `rgb(16,33,26)`) onto *foreground* text. Selected theme button, "Show Events" toggle, Designer accent all render at **1.25:1**. | [App.tsx:107](../../src/frontend-ob/src/App.tsx#L107), used [:544](../../src/frontend-ob/src/App.tsx#L544) | **High** | WCAG 2.1 AA (1.4.3) |
| **F-07** | **Zero elevation.** `--container-global`, `-background`, `-section`, `-backdrop` **all** resolve to `rgb(0,0,0)`. Cards, sections, backdrops and modals are the same color; 46 container tokens are pure black. | `variables.css` night block | **High** | ISA-101 (hierarchy/grouping) |
| **F-08** | **Invisible dividers.** `--border-divider-color` `#271B10` = **1.25:1**. With F-07 this leaves *no* means of region separation. | `variables.css` night block | **High** | WCAG 2.1 (1.4.11 non-text 3:1) |
| **F-09** | **Dialogs ignore the theme entirely.** `hmi-dialogs.css` defines 63 light-theme literals on bare `:root` with **zero** `[data-obc-theme]` branches. Every dialog/modal/detail panel/context menu/form opens **`#FFFFFF` at 21:1** on the black console — destroying dark adaptation. Header is `#1976D2`. | [hmi-dialogs.css:16-35](../../src/frontend-ob/src/styles/hmi-dialogs.css#L16-L35) | **Critical** | ISA-101; IEC 60073 (blue = mandatory action, misused as branding) |
| **F-10** | **Non-standard status hues in dialogs.** `#F59E0B`, `#EF4444`, `#10B981`, `#D97706`, `#DC2626`, `#059669` (Tailwind defaults) used for warning/danger/success — outside the OpenBridge alert tokens and outside the alarm-priority mapping. | [hmi-dialogs.css:103-120](../../src/frontend-ob/src/styles/hmi-dialogs.css#L103-L120) | **Medium** | ISA-18.2; IEC 60073 |
| **F-11** | **Brand title invisible in night.** `var(--on-surface-active-color, #1F2937)` — token undefined, so the near-black fallback applies: **1.43:1**. | [app.css:76](../../src/frontend-ob/src/styles/app.css#L76) | **Medium** | WCAG 2.1 AA |
| **F-12** | **Critical chip has no distinguishing fill.** `TB.criticalBg` → `--container-section-color` = `rgb(0,0,0)`, identical to `TB.bg`. Only a 1px border differs. | [App.tsx:481](../../src/frontend-ob/src/App.tsx#L481), [:122](../../src/frontend-ob/src/App.tsx#L122) | **Medium** | ISA-18.2 |
| **F-13** | `--on-selected-color` does not exist anywhere (0 occurrences) → `var(--on-selected-color, #fff)` always yields hardcoded white. | [Dashboard.tsx:609](../../src/frontend-ob/src/components/Dashboard/Dashboard.tsx#L609) | **Low** | — |
| **F-14** | `dusk` is fully defined by OpenBridge (661 tokens) but unreachable — the `Theme` union omits it. | [App.tsx:95](../../src/frontend-ob/src/App.tsx#L95) | **Low** | — |

### 2.4 The 32 undefined custom properties (119 declaration sites)

Alarm/status-significant (**57 sites — these are the ISA-critical ones**):
`--running-color` (21) · `--alert-alarm-background-color` (10) · `--alert-caution-background-color` (7) ·
`--alert-warning-background-color` (4) · `--on-alert-alarm-active-color` (4) · `--alert-notice-border-color` (3) ·
`--alert-notice-background-color` (3) · `--running-background-color` (1) · `--on-alert-warning-active-color` (1) ·
`--on-alert-notice-active-color` (1) · `--on-alert-caution-active-color` (1) · `--on-alert-alarm-color` (1)

Chrome/structural (**62 sites**):
`--on-surface-active-color` (12) · `--border-focused-color` (9) · `--regular-hover-background-color` (7) ·
`--container-hover-color` (7) · `--on-focus-active-color` (6) · `--on-container-disabled-color` (4) ·
`--regular-pressed-background-color` (2) · `--regular-enabled-background-color` (2) · `--container-border-color` (2) ·
`--on-selected-color`, `--on-regular-neutral-color`, `--on-regular-active-color`, `--on-container-color`,
`--modal-shadow`, `--modal-backdrop-color`, `--input-background-color`, `--font-mono`,
`--border-subtle-color`, `--ams-font-sans`, `--ams-container-bg` (1 each)

There is **no `--regular-*` family in OpenBridge at all.** The correct names for the alarm fills are
`--alarm-enabled-background-color` / `--on-alarm-color` (both defined in every theme). This is a
naming drift, not a missing feature — the fix is renaming at the call site, not authoring new tokens.

**Live vs dead, by the numbers:** 157 of 661 night declarations (23.8%) carry the amber chrome family
and **all are live**. 57 alarm/status declaration sites are **dead**.

## 2.5 UI/UX heuristic evaluation

**Contrast (WCAG 2.1 AA, ≥4.5:1 text / ≥3:1 non-text).** Chrome text tiers pass comfortably
(10.19 / 7.03 / 4.52). Structural elements fail: dividers 1.25:1, disabled text 1.79:1, `TB.blue`
foreground 1.25:1, brand title 1.43:1. The palette is over-provisioned where it doesn't matter and
under-provisioned where it does.

**Can a user distinguish "critical" from "section label" by color alone today?** **No.** A section
label is amber at 10.19:1; a Medium alarm is *the same token* (F-04); a High alarm is `#897300` at
4.52:1 — dimmer than the label next to it. Colour alone is not merely insufficient, it is
**actively misleading**.

**Density & whitespace.** Not a defect — spacing is token-driven via the `--spacing-*` aliases
([designTokens.css:61-64](../../src/frontend-ob/src/components/Designer/designTokens.css#L61-L64)).

**Elevation/depth.** Absent (F-07, F-08). With all containers black and dividers at 1.25:1, night
mode has no available mechanism for grouping — the one thing the layout reference does well.

## 2.6 Verdict (non-hedged, as required)

**Q1 — Does today's night mode violate ISA-101's color-reservation principle?**
**YES.** `--element-active-color` = `#EAA75E`, a fully saturated orange-amber, is applied as blanket
chrome to navigation labels, headers, body accents and values, at 10.19:1 — **2.59× the luminance of
a Critical alarm**. Saturated color is the app's default state, not an exception signalling
abnormality. This is the precise condition ISA-101 exists to prevent.

**Q2 — Does the chrome orange conflict with the agreed alarm-priority mapping?**
**YES, and the conflict is realised in shipped code, not merely theoretical.**
[Dashboard.tsx:609](../../src/frontend-ob/src/components/Dashboard/Dashboard.tsx#L609) paints the
**Medium-priority alarm count with `--element-active-color`** — the navigation text token itself.
Simultaneously [Dashboard.tsx:608](../../src/frontend-ob/src/components/Dashboard/Dashboard.tsx#L608)
paints **High** with `--alert-caution-color`, Medium's token. So on one dashboard row, High wears
Medium's color and Medium wears the chrome's color. An operator cannot recover priority from color.

**Q3 — Is the amber a defect or a design intent?**
It is **OpenBridge working as designed, in the wrong domain.** OpenBridge is a *maritime bridge*
system; its night theme is amber-on-black to preserve scotopic dark adaptation on a ship's bridge at
sea. That is a legitimate convention for its origin domain. **It is not transferable to an
ISA-101 industrial control room**, where the governing constraint is that color must remain a scarce
signal. Adopting OpenBridge's night palette unmodified imported a *maritime* convention into a
*process-industry* application. That is the root cause of F-01, F-02 and F-04, and it is why the fix
belongs at the token-override layer rather than in component code.

---

# Phase 3 — Candidate night-mode palettes (proposal only)

## 3.0 Design reasoning (the crux)

ISA-101 reserves **saturated color**, not brightness. Chrome must therefore become **achromatic**
(hue-free), which removes it from the alarm channel entirely — a grey cannot be mistaken for a
priority. All three candidates below are achromatic or near-achromatic and differ only in **how many
neutral depth steps** they use and **whether hierarchy is carried by lightness or by borders**.

Two hard constraints fell out of the numeric validation and shape all three:

- **Keep the canvas near-black.** OpenBridge's alert colors are tuned against `#000`. Lifting the
  canvas degrades them: at a `#26303B` surface, Critical drops to 2.90:1. Every candidate therefore
  keeps its darkest surface near-black so alarms retain ≥3:1.
- **Alarms must be presented as filled chips, not colored text.** Salience should come from a
  saturated *area* (`--alarm-enabled-background-color` + `--on-alarm-color`, both already defined in
  every theme), not from thin colored glyphs competing on luminance. This is what makes achromatic
  chrome safe at comfortable reading brightness.

## 3.1 Candidate A — "Neutral Graphite" (3 depth steps, border-led)

Pure achromatic. Hierarchy from borders; minimal lightness travel.

| Role | Value | Contrast |
|---|---|---|
| canvas | `#0A0A0A` | — |
| surface | `#141414` | — |
| raised | `#1E1E1E` | — |
| text primary | `#D4D4D4` | 13.36:1 canvas / **11.25:1 worst-case** ✅ AA |
| text secondary | `#9A9A9A` | 7.04 / **5.92** ✅ AA |
| text disabled | `#6E6E6E` | 3.88 / 3.27 — AA-exempt (disabled) |
| divider | `#282828` | 1.34:1 (decorative) |
| border | `#3C3C3C` | 1.79:1 (decorative) |
| **focus / state border** | `#5D5D5D` | **3.01:1 ✅ WCAG 1.4.11** |

Alarm legibility on worst-case surface: Critical 3.62:1, High 3.61:1, Medium 3.59:1, Normal 3.59:1.
Filled chip: black-on-fill 4.55:1, fill-vs-canvas 4.29:1.
**Chromatic values introduced: none.** Traceability: n/a — fully achromatic.

## 3.2 Candidate B — "Blue-Grey Depth" (4 depth steps, elevation-led)

Near-achromatic (blue-grey, chroma ≈ 4–6/255). Hierarchy from lightness; borders hairline. Closest to
the layout reference's card-elevation feel.

| Role | Value | Contrast |
|---|---|---|
| canvas | `#080B0F` | — |
| surface | `#111720` | — |
| raised | `#1A2029` | — |
| overlay (modal) | `#222A34` | — |
| text primary | `#D3DAE1` | 13.98 / **10.27 worst-case** ✅ AA |
| text secondary | `#98A3AE` | 7.68 / **5.65** ✅ AA |
| text disabled | `#6C7681` | 4.27 / 3.14 — AA-exempt |
| divider | `#1E252E` | 1.28:1 |
| border | `#39434F` | 1.96:1 |
| **focus / state border** | `#595E65` | **3.02:1 ✅** |

Alarm legibility on the `#222A34` overlay: Critical **3.14:1** — the weakest of the three; acceptable
for non-text/graphical use but the thinnest margin. Filled chip unaffected (4.55:1).
**Chromatic values introduced: none that read as hue** — the blue-grey tint is below the threshold at
which IEC 60073 blue semantics could be invoked. Traceability: near-achromatic by construction.

## 3.3 Candidate C — "Deep Slate Minimal" (2 depth steps, dark-adaptation preserving)

Lowest absolute luminance — the closest analogue to what OpenBridge's night theme was *trying* to
achieve, minus the amber. Hierarchy from typography + strong borders.

| Role | Value | Contrast |
|---|---|---|
| canvas | `#050607` | — |
| surface | `#0D1014` | — |
| text primary | `#BFC7CF` | 11.86 / **11.16** ✅ AA |
| text secondary | `#87919B` | 6.33 / **5.95** ✅ AA |
| text disabled | `#5F6871` | 3.58 / 3.36 — AA-exempt |
| divider | `#191F25` | 1.22:1 |
| border | `#333C45` | 1.81:1 |
| **focus / state border** | `#575C63` | **3.01:1 ✅** |

Alarm legibility: **best of the three — Critical 4.13:1**, High 4.13, Medium 4.10, Normal 4.11.
Filled chip: fill-vs-canvas 4.40:1.
**Chromatic values introduced: none that read as hue.**

## 3.4 Reserved color set — unchanged under all three candidates

Explicitly confirmed: **no candidate touches, redefines, or competes with any of the following.**
Chrome is achromatic, so nothing in the reserved set is diluted.

| Reserved for | Values | Standard |
|---|---|---|
| Critical / High / Medium / Low / Journal / Shelved | existing alarm-priority mapping | ISA-18.2 / EEMUA 191 |
| `--alert-alarm/warning/caution/running-color` + `--alarm/warning/caution-*-background-color` | OpenBridge night values, unchanged | ISA-18.2 |
| Failure / Function-Check / Out-of-Spec / Maintenance-Required | NE107 status set | NAMUR NE107 |
| Red danger · Yellow caution · Green normal · Blue mandatory-action · White neutral | indicator semantics | IEC 60073 |
| PV / SP / OP / VP trend pens | `--ams-pen-*` ([designTokens.css:91-96](../../src/frontend-ob/src/components/Designer/designTokens.css#L91-L96)) | industry practice (charts only) |

**Traceability statement (all candidates):** every chromatic value in the night theme after this
change traces to ISA-18.2, NAMUR NE107, IEC 60073 or the trend-pen convention. **The candidates
themselves introduce zero chromatic values.** No hue is added for aesthetic or branding reasons —
which satisfies the standards-only constraint by construction rather than by argument.

## 3.5 Override surface per candidate

Baseline: the night block holds **661** declarations, of which **157** carry the amber chrome family
and **46** are pure-black containers. No candidate needs to override all 157.

| | **A — Graphite** | **B — Blue-Grey** | **C — Deep Slate** |
|---|---|---|---|
| Tokens **overridden** in a `:root[data-obc-theme='night']` block | **~14** (4 `element-*`, 4 `container-*`, 2 `border-*`, `--border-focus-color`, 3 `on-{normal,raised,flat}-*` groups) | **~19** (as A + `overlay`/modal surface + `--container-hover-color` tier) | **~11** (2 surfaces only) |
| Tokens **extended** (new project-scope names) | 1 (`--ams-focus-border`) | 2 (`--ams-elevation-3`, `--ams-focus-border`) | 1 |
| Amber declarations left live (cosmetic residue in unused OpenBridge subsystems: nav-charts, instruments) | ~143 | ~138 | ~146 |
| **Undefined-token repairs required** (F-03, prerequisite for *any* candidate) | **32 names / 119 sites** | same | same |
| `hmi-dialogs.css` night branch (F-09) | required | required | required |
| Relative change surface | **Smallest** | Largest | Small |

The dominant cost is **not** the palette — it is the shared prerequisite work (F-03 token repairs +
F-09 dialog theming), which is identical across candidates. The palette choice itself is a ~11–19
line override block.

## 3.6 Structural recommendations — **independent of color**

From the layout/depth reference, adopt structure only. Its multi-hue card convention (pink/teal/
orange/blue per card) is **rejected outright** and is not proposed under any candidate — categorical
color-coding of cards would recreate F-02 in a new form.

| Structural element | Recommendation | Rationale |
|---|---|---|
| Card elevation / raised surfaces | **Adopt** | Directly remedies F-07 (zero elevation). Requires ≥3 depth steps → favours A or B. |
| Grouped KPI tiles | **Adopt** | Alarm-count tiles already exist ([Dashboard.tsx:607-609](../../src/frontend-ob/src/components/Dashboard/Dashboard.tsx#L607-L609)); grouping is a layout change. Must be re-tokenised to fix F-04/F-05 regardless. |
| Rounded corners | **Adopt** | Already tokenised (`--corner-radius` → `--border-radius-br-8`). Zero cost. |
| Per-metric iconography | **Adopt, `obi-*` only** | Icons carry category *without* spending color — directly serves ISA-101. Per the OpenBridge rule, no Lucide/FontAwesome/inline SVG. |
| Chart depth / shadow | **Adopt cautiously** | `--shadow-flat-*` is a **no-op** in night (`blur 0`, `spread 0`, alpha 0). Depth must come from surface lightness, not shadow. |
| Per-card decorative hue | **REJECT** | Violates ISA-101 and would re-introduce F-02. |

## 3.7 Recommendation — *pending approval, not a decision*

**Recommended: Candidate A — "Neutral Graphite."**

| Criterion | Why A |
|---|---|
| Alignment with ISA-101 | Strongest — pure achromatic chrome, zero hue available to be misread as priority. |
| Alarm legibility | Good (Critical 3.62:1 worst-case); B is the weakest at 3.14:1. |
| Minimal change surface | Smallest override block (~14 tokens). |
| Elevation (fixes F-07) | 3 steps — enough for the adopted card treatment, unlike C's 2. |
| Risk | Lowest — no tint means no argument about whether a blue-grey reads as IEC 60073 blue. |

**Choose B instead if** the card-elevation aesthetic from the layout reference is a priority and a
Critical-alarm contrast of 3.14:1 on modal overlays is acceptable to the alarm-philosophy owner.
**Choose C instead if** true dark-adaptation preservation (night-shift, dimly-lit control room)
outranks visual hierarchy — C gives the best alarm contrast (4.13:1) and the lowest glare, at the
cost of having only two surface levels.

This is a **recommendation for human selection**, not a decision, and nothing here is implemented.

---

## Open Questions

- **OQ-1 — No live render was performed.** All values were resolved statically from the palette
  cascade, which is deterministic; but computed CSS was **not** read back from a running browser, and
  no screenshot was taken. Runtime effects that static analysis cannot see — shadow-DOM styles inside
  OpenBridge Lit components, `color-mix()`, opacity stacking, GPU color management — remain
  unverified. Recommend confirming F-01/F-03/F-09 against `getComputedStyle` in a real session before
  implementation.
- **OQ-2 — The agreed alarm-priority palette is asserted, not located.** The prompt states
  Critical=red / High=orange / Medium=amber / Low=cyan-blue / Journal=grey / Shelved=grey-purple as
  already agreed. [conversion.md:70](../../conversion.md#L70) confirms a priority→severity-token
  mapping exists, but **no file in this repo defines Low, Journal or Shelved colors.** Those three
  are unverified. A Phase-3 implementation would need the alarm-philosophy document.
- **OQ-3 — NE107 mapping not located in the night palette.** `CLAUDE.md` and the OpenBridge skill
  require Good/Uncertain/Bad/Maintenance/OutOfService. `designTokens.css` provides `--ams-*` status
  colors but **no NE107-named tokens exist**. Whether NE107 is realised elsewhere (Flink, backend
  enums, symbol renderers) was not established.
- **OQ-4 — Which of the 268 hardcoded literals are actually reachable** was not determined; dead
  rules and unmounted components were not excluded. The count is an upper bound on the leak surface.
- **OQ-5 — `dusk` is unreachable** ([App.tsx:95](../../src/frontend-ob/src/App.tsx#L95)) yet fully
  defined by OpenBridge. Whether exposing it is wanted is a product decision, not an audit finding.
- **OQ-6 — Screenshot not supplied to this analysis.** The prompt describes a night-mode screenshot
  and a layout reference image; neither was available. Section 2.2 verifies the hypothesis from code
  rather than from the image, per the standing principle.

---

## Phase Gate — **RELEASED 2026-08-27**

> **Status: Candidate A "Neutral Graphite" was explicitly approved by the user and has been
> implemented.** Execution record, decisions and measured results:
> [07-night-mode-implementation-checklist.md](07-night-mode-implementation-checklist.md).
>
> Measured outcome: 32 undefined tokens → **0**; 119 dropped declaration sites → **0**; all 18 amber
> chrome tokens consumed by app code overridden; build and lint clean. Prerequisites 1-3 below were
> completed *before* the palette was applied, as required. Step 5 (live-browser re-verification)
> remains **open** — see OQ-1.
>
> **Correction to §1.3 of this document:** the "63 hardcoded literals" figure for `hmi-dialogs.css`
> came from a truncated scan and was an undercount. Further light-only blocks (ISA notices, info
> notice, context-menu danger states, reason buttons, detail-panel actions, scrollbar thumbs) were
> found and fixed during implementation. The count was wrong; the finding (F-09) was correct.
>
> The original gate text is preserved below as the record of what was required.
>
> ---
>
> **No implementation may begin until a specific candidate palette from Phase 3 is explicitly
> approved.**
>
> This document is analysis and proposal only. No source file, token file, or stylesheet was created
> or modified in producing it.
>
> On approval, the implementation sequence is constrained as follows — the prerequisites are **not
> optional**, because a palette change alone would leave the alarm surfaces dead:
>
> 1. **Prerequisite (blocking):** repair F-03 — 32 undefined custom properties / 119 declaration
>    sites, of which 57 are alarm-significant. Rename to the real OpenBridge tokens
>    (`--alarm-enabled-background-color`, `--on-alarm-color`, …); do **not** author new ones.
> 2. **Prerequisite (blocking):** repair F-04 and F-05 — the Dashboard KPI priority mis-mapping.
>    These are ISA-18.2 defects in their own right and are independent of the palette choice.
> 3. **Prerequisite (blocking):** give `hmi-dialogs.css` a night branch (F-09).
> 4. **Then**, and only then, apply the approved candidate as a
>    `:root[data-obc-theme='night']` override block in `designTokens.css`.
> 5. Re-verify every contrast figure in §3 against `getComputedStyle` in a running browser (OQ-1)
>    before the change is considered complete.
>
> Steps 1–3 are pre-existing defects that a palette change would otherwise mask. They should be
> scheduled regardless of which candidate — or whether any candidate — is approved.
