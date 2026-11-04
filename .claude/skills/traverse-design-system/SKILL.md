---
name: traverse-design-system
description: >
  Canonical visual rules for every Traverse suite screen (Truss, CPA, Instrumental, PLC,
  Downtime, RCA and future modules). Read BEFORE writing or editing any page, component,
  colour, theme, button, input, table, badge, dialog, chart, focus style, spacing or layout.
  Defines the Graphite and Cyan token set with Day and Night modes, status and NE107
  diagnostic colours, chart series, application shell geometry, typography, data-state
  presentation and acceptance checks G01–G12. Source: Traverse UI Design and Development
  Guide R01 (04 Nov 2026). Works together with the openbridge skill, which contributes
  token discipline and alarm-state semantics only. Triggers on: "theme", "day", "night",
  "light mode", "dark mode", "color", "colour", "token", "button", "badge", "status",
  "NE107", "chart", "table", "dialog", "sidebar", "header", "focus", "spacing", "Traverse".
---

# Traverse Design System — build rules

> Skill revision **R1.1** (2026-11-04). Change from R1.0: `tokens.css` and `shadcn-bridge.css` are colour-only; root font-size, font family and `--radius` moved to the optional `references/shadcn-bridge.geometry.css`. Token values are unchanged.

**Every colour, surface, border, text, focus and chart value comes from the Traverse
semantic tokens in `references/tokens.css`. No raw hex, no Tailwind palette classes
(`bg-slate-900`, `text-white`, `text-red-400`), no per-module brand overrides, no values
sampled from screenshots.** The guide (R01) states the order of precedence: (1) exact tokens
and shared rules, (2) each page's written interaction and module requirements plus the
corrections list, (3) the concept images, for hierarchy and density only.

Source of record: `Traverse_UI_Design_and_Development_Guide_R01.pdf`, pages 3–7 (foundations),
14–16 (Instrumental), 26–29 (components, acceptance, corrections, decisions). Token values
below are transcribed from that document and verified by `scripts/contrast.py`
(see `references/contrast-report.md`). The Lead's tokens JSON / CSS package referenced on
page 3 was not available at transcription; when it arrives, reconcile names and values
against it and treat the package as authoritative (§9).

## 0. Relationship to the openbridge skill

| Concern | Governing skill |
|---|---|
| Colour values, theme names, status/NE107/chart colours, shell geometry, typography, spacing, focus, data states, acceptance checks | **this skill** |
| Token discipline (no literals, size classes on ancestors, touch targets never below defaults), alarm-state semantics (unacknowledged → acknowledged → return-to-normal), ISA-18.2 / IEC 62682 state table | **openbridge** (semantics only) |
| OpenBridge packages, `obc-*` components, `obi-*` icons, `data-obc-theme` | **not used** in the Traverse web frontend unless a module explicitly adopts OpenBridge components through an adapter (guide p.26 build step 1) |

Where the two skills disagree on a *value* (a hex, a radius, a height), this skill wins.
Where they disagree on a *principle*, stop and ask.

## 1. Themes

- Two themes: **`day`** and **`night`**. Day is the initial default. Persist the user's
  choice across module navigation; a mode change swaps the full token set while preserving
  labels, selected objects and workflow state.
- The themed root carries `data-theme="day"` or `data-theme="night"`. With next-themes use `attribute="data-theme"`,
  `themes={["day","night"]}`, `defaultTheme="day"` and **no `value` map**; a value map combined
  with a `defaultTheme` outside the theme list removes the attribute on first paint. Components never
  read the theme; they consume tokens. The only theme-aware component is the switch.
- Icons do not change between themes (one outlined SVG icon set).
- Every page must render in both themes with unchanged domain meaning (G01), even where the
  guide illustrates only one.

## 2. Token naming

Dotted path → CSS custom property with the `--traverse-` prefix, dots replaced by hyphens.
`surface.panel` → `--traverse-surface-panel`. Group tokens defined by the guide:
`surface.*`, `border.*`, `text.*`, `action.*`, `focus`, `ai.*`. Groups below marked
*(ext)* follow the same convention but their dotted names are this skill's extension of the
guide, pending the Lead's JSON: `status.<state>.fg|bg`, `diag.<code>.fill|text`,
`chart.series.<n>`, `chart.grid|axis|tick`, `space.*`, `radius.*`, `size.*`, `type.*`.

## 3. Core colour tokens (opaque sRGB)

| Token | Day | Night | Use |
|---|---|---|---|
| surface.page | `#F3F6FA` | `#0B1220` | Page background |
| surface.panel | `#FFFFFF` | `#111C2E` | Primary content panel; behind charts |
| surface.raised | `#E8EEF5` | `#18263B` | Secondary surface or field |
| surface.hover | `#E5ECF4` | `#213149` | Hovered neutral row |
| surface.selected | `#DDF3F6` | `#143540` | Selected row or navigation |
| border.subtle | `#D3DCE8` | `#2A3A52` | Decorative divider only |
| border.strong | `#75879C` | `#6F849F` | Essential control boundary |
| text.primary | `#152238` | `#EAF1FA` | Headings and primary values |
| text.secondary | `#4B5D73` | `#A8B7CC` | Supporting text |
| text.muted | `#596B81` | `#8D9FB7` | Readable low-emphasis text (Day value is the revised one; `#60738A` is withdrawn) |
| action.primary | `#006B83` | `#54D6E8` | Primary action and selection |
| action.hover | `#00576B` | `#81E4F0` | Primary action hover |
| action.active | `#00485A` | `#33BACC` | Primary action pressed |
| action.on | `#FFFFFF` | `#0B1220` | Text/icon on primary action |
| focus | `#006B83` | `#7CE8F4` | Keyboard focus ring |
| ai.fg | `#6C45C0` | `#B8A4FF` | Labelled AI content |
| ai.bg | `#F0EAFB` | `#28213F` | AI assessment surface |

Rules: use `border.strong` whenever a boundary is needed to identify a control (inputs,
outline buttons, checkboxes); use `border.subtle` for decoration (dividers, panel edges).
Violet (`ai.*`) identifies labelled AI-assisted content only; it never expresses confidence,
correctness or approval.

## 4. Status colours *(ext naming)*

| State | Day fg | Day bg | Night fg | Night bg |
|---|---|---|---|---|
| danger | `#B42332` | `#FDECEE` | `#FF7A85` | `#351E2B` |
| warning | `#8A5700` | `#FFF3D6` | `#F5C451` | `#332A16` |
| success | `#16724A` | `#E5F5ED` | `#56D6A1` | `#163329` |
| info | `#1764C0` | `#E9F1FC` | `#7EB1FF` | `#1B2D46` |
| unknown | `#4B5D73` | `#E8EEF5` | `#A8B7CC` | `#18263B` |

Workflow mapping (guide p.4): **warning** = Pending, Needs review, Incomplete;
**info** = In progress, Available; **unknown** = Not checked, Unassigned, Missing,
Unavailable; **success** = recorded verified or completed outcome only. A supported
hypothesis stays informational until its causal conclusion is verified.

Keep equipment operation, alarm priority, device diagnostics, source quality, workflow
state and AI authorship in **separate fields**. A badge in one field never sets another.
Alarm priority colours, symbols, acknowledgement and shelving come from the approved site
configuration; this system supplies no automatic P1/P2 mapping.

## 5. Instrumental diagnostic categories (NAMUR NE107) *(ext naming)*

| Code | Label | Fill | Text |
|---|---|---|---|
| F | Failure | `#D92D45` | `#FFFFFF` |
| C | Function check | `#F79B4A` | `#152238` |
| S | Out of specification | `#F7D75C` | `#152238` |
| M | Maintenance request | `#79B6FF` | `#152238` |

- Fills are **theme-independent**; only surrounding chrome adapts. Always display code and
  label together ("M  Maintenance request"); the chip alone is never the sole cue.
- These are diagnostic *categories*, not a severity scale. **Unknown** is a status-
  availability state (§4), not a fifth NAMUR category.
- A missing diagnostic result must never look healthy. Normal, unknown, unavailable and
  diagnostics-disabled are separate states.
- "Maintenance required" (source wording) may be retained as a documented label alias.
- Verified: on the Day panel the C, S and M fills are below 3:1 as pure graphics
  (`references/contrast-report.md`); the code letter inside the chip carries the meaning
  (≥ 4.76:1 in all four). Do not add a fifth colour or a darker fill to "fix" this; if a
  border is wanted on Day chips, propose `border.strong` to the Lead first.

## 6. Chart tokens *(ext naming)*

| Series | Day | Night |
|---|---|---|
| 1 | `#006B83` | `#54D6E8` |
| 2 | `#6C45C0` | `#B8A4FF` |
| 3 | `#245EB8` | `#80ABFF` |
| 4 | `#9B3C82` | `#DFA6DE` |
| 5 | `#53657B` | `#9EAEC2` |
| 6 | `#277575` | `#86D3D1` |

Chrome: grid = `border.subtle`, axis = `border.strong`, tick/legend text = `text.secondary`,
tooltip = `surface.panel` / `border.strong` / `text.primary`, hover cursor = `surface.hover`.
Rules: measured = solid line; reference/setpoint = labelled dashed; predicted/estimated =
distinct labelled pattern; break lines over unavailable intervals (never zero-fill); direct
labels plus line/marker distinction for every series; violet reserved for the labelled AI
layer; series hues are scoped to the legend and carry no meaning elsewhere. Cards and chart
endpoints derive from the same calculation, boundary and period (G08).

## 7. Shell, geometry, typography, spacing

| Element | Baseline |
|---|---|
| Desktop reference | 1440 × 1024; validate at 1366 × 768 and 1920 × 1080 |
| Sidebar | 220 px expanded; 64 px rail; fixed order Overview, Truss, CPA, Instrumental, PLC, Downtime, RCA |
| Header | 64 px: plant selector, search ("Search assets, tags and records"), time range, environment indicator, user |
| Main content | 24 px outer padding; 16 px panel gap; vertical scroll for long content |
| Panel | 12 px radius; 20 px padding; quiet `border.subtle`; no nested decorative cards |
| Buttons and inputs | 40 px minimum height; 6 px radius |
| Table rows | 44 px default; 40 px compact; never shrink text to fit |
| Inspector | 320–400 px; persistent on wide layouts, drawer below 1280 px |
| Type | 14 px body; 16 px key text; 24 px page title; 18 px section title; 12 px metadata |
| Font | Self-hosted UI sans (Inter or equivalent) with system fallback; **tabular numerals** for values; monospace for technical identifiers |
| Spacing scale | 4 8 12 16 20 24 32 |
| Focus | 2 px outline in `focus`, 3 px gap exposing the neutral surface, never clipped |
| Breakpoints | < 1280 px: rail + inspector drawer. < 1024 px: navigation drawer, stacked content in task order |

Selected navigation = `surface.selected` background, `action.primary` text, persistent
start-edge indicator (3 px, `action.primary`), text emphasis. This written rule overrides
the concept images, which vary (guide p.28).

## 8. Component contracts

Full state tables are in `references/components.md`. Summary:

- **Primary button**: `action.primary` / `action.on`; hover `action.hover`; pressed
  `action.active`; focus per §7. **Outline button**: transparent, `border.strong`,
  `text.primary`; hover `surface.hover`. **Accent outline** (e.g. environment indicator):
  `action.primary` border and text. **Ghost**: `text.secondary`, hover `surface.hover`.
  **Destructive** *(proposal, not in R01)*: `status.danger.fg` surface with `action.on`
  text (verified 6.51:1 Day, 7.47:1 Night). **Disabled**: `surface.raised`, `text.muted`,
  `border.subtle`, and an accessible reason — a disabled action never silently does nothing.
- **Inputs**: `surface.panel` (Day) / `surface.raised` (Night) field, `border.strong`,
  `text.primary`, placeholder `text.muted`, focus per §7, invalid = `status.danger.fg` border + message.
- **Tables**: header `text.secondary` uppercase 12 px; row divider `border.subtle`; hover
  `surface.hover`; selected `surface.selected`; identifiers in monospace; values tabular.
- **Badges**: `status.<state>.bg` + `status.<state>.fg`, text label always present.
  Diagnostic chips per §5.
- **Dialogs / popovers / drawers**: `surface.panel`, `border.subtle`, 12 px radius;
  overlay = `surface.page` at 60 % alpha; focus trapped; Escape closes.
- **Toasts**: `surface.panel` with a 3 px start-edge bar in the status colour.
- **Skeleton / loading**: `surface.raised` blocks, labelled; retain selected context.
- **AI assessment**: `ai.bg` surface, `ai.fg` label "AI-assisted", authorship, review
  state, evidence links and missing coverage visible; no invented confidence.

## 9. Data-state presentation (mandatory)

| State | Presentation |
|---|---|
| Loading | Labelled skeleton or progress; selected context retained |
| Empty | Explain no matching records; offer the relevant filter reset |
| Partial | Identify missing sources/intervals; label coverage and affected metrics |
| Stale | Keep last value with timestamp and a "Stale" label |
| Bad quality | Show source quality beside the affected value or interval |
| Unavailable / error | Keep successful panels visible; source-specific retry |
| Permission restricted | Explain that the action or record is restricted |

## 10. Acceptance (run before any theme or shared-component change ships)

G01 theme parity · G02 token consistency (no module overrides, no sampled colours) ·
G03 shared shell · G04 keyboard access with unclipped focus · G05 colour independence
(label, code, shape or line style always present) · G06 data states distinguishable ·
G07 context continuity · G08 numerical consistency · G09 source traceability ·
G10 review integrity · G11 AI transparency · G12 responsive clarity. Review at the three
reference widths in both themes with long tags, large numbers, missing sources and many
records. The 121 passing colour pairings do not establish WCAG conformance of a built page.

## 11. Hard do / do-not

**Do** — consume `--traverse-*` tokens (or the shadcn bridge variables that alias them) ·
keep each semantic field separate · show code + label for every diagnostic · verify both
themes on every page · run `scripts/contrast.py` after any token change · version tokens and
the shared component library together and record colour-semantic changes in release notes.

**Do not** — write hex, `rgb()`, `oklch()` or Tailwind palette classes in components ·
create per-module brand overrides · sample colours from the concept images · map alarm
priorities to colours without the site configuration · present Unknown as a NAMUR category ·
let a missing diagnostic look healthy · use violet for anything other than labelled AI
content · invent token names outside §2 (stop and ask).

## 12. Files

- `references/tokens.css` — both themes, all `--traverse-*` variables.
- `references/tokens.json` — same values, custom dotted-path schema (not DTCG).
- `references/shadcn-bridge.css` — colour only: aliases shadcn/Tailwind v4 variables to Traverse tokens and re-points the `dark` variant to `[data-theme="night"]`.
- `references/shadcn-bridge.geometry.css` — optional: root 14 px, Inter, 6 px `--radius`. Import only in an approved layout package.
- `references/components.md` — state tables per component.
- `references/contrast-report.md` — computed WCAG ratios for 126 pairings.
- `references/acceptance.md` — G01–G12, data states, Instrumental module checks and R01 corrections.
- `scripts/contrast.py` — re-run after any token change; exit code 1 on a new failure.
