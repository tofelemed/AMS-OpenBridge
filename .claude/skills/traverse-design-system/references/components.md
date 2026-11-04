# Component state contracts

All values are token names (`--traverse-…` omitted). Geometry from guide p.6. Where a state
is not defined in R01 it is marked **(proposal)** and must be confirmed with the Lead
before it becomes a release rule.

## Buttons (min-height 40 px, radius 6 px, 14 px label, 16 px key actions)

| Variant | Rest | Hover | Pressed | Focus | Disabled |
|---|---|---|---|---|---|
| Primary | bg `action.primary`, text `action.on` | bg `action.hover` | bg `action.active` | 2 px `focus`, 3 px gap | bg `surface.raised`, text `text.muted`, border `border.subtle`, accessible reason **(proposal)** |
| Outline | bg transparent, border `border.strong`, text `text.primary` | bg `surface.hover` | bg `surface.selected` **(proposal)** | as above | as above |
| Accent outline (environment indicator, "DEMO DATA") | border + text `action.primary` | bg `surface.selected` | — | as above | — |
| Ghost | text `text.secondary` | bg `surface.hover`, text `text.primary` | bg `surface.selected` | as above | text `text.muted` |
| Destructive **(proposal)** | bg `status.danger.fg`, text `action.on` (6.51:1 Day, 7.47:1 Night) | darken via `color-mix(in srgb, status.danger.fg 85%, black)` | — | as above | as Primary disabled |
| Link | text `action.primary`, underline on hover | `action.hover` | — | as above | `text.muted` |

Icon-only buttons keep a ≥ 40 px hit area and an accessible name.

## Inputs, selects, textareas (min-height 40 px, radius 6 px)

| State | Field | Border | Text | Notes |
|---|---|---|---|---|
| Rest | Day `surface.panel`; Night `surface.raised` | `border.strong` | `text.primary`; placeholder `text.muted` | label `text.secondary` 12 px above; units adjacent to values |
| Hover | unchanged | `text.secondary` **(proposal)** | | |
| Focus | unchanged | `border.strong` | | plus 2 px `focus` outline, 3 px gap |
| Invalid | unchanged | `status.danger.fg` | | message in `status.danger.fg` with icon and text |
| Disabled | `surface.raised` | `border.subtle` | `text.muted` | reason exposed (tooltip or helper text) |
| Read-only | `surface.raised` | `border.subtle` | `text.primary` | |

Checkbox/radio: `border.strong` unchecked; `action.primary` fill with `action.on` mark when checked. Switch: track `border.strong` / `action.primary`.

## Tables (row 44 px; compact 40 px; never shrink text)

| Element | Tokens |
|---|---|
| Header row | text `text.secondary`, 12 px uppercase, letter-spacing 0.04em, bottom border `border.strong` **(proposal; concept shows a strong divider under headers)** |
| Row divider | `border.subtle` |
| Row hover | bg `surface.hover` |
| Row selected | bg `surface.selected`; row remains keyboard-focusable with the standard focus ring |
| Identifiers (tags, IDs, codes) | monospace, `text.primary`; secondary identifiers `text.secondary` |
| Values | tabular numerals, right-aligned, unit adjacent |
| Empty / partial / error | per data-state table in SKILL.md §9, rendered inside the table region |

Tables scroll in their own region with key identifiers visible (sticky first column where needed).

## Badges

| Kind | Tokens |
|---|---|
| Status (danger / warning / success / info / unknown) | bg `status.<s>.bg`, text `status.<s>.fg`, 12 px, radius 6 px, text label mandatory |
| Diagnostic chip (F / C / S / M) | bg `diag.<c>.fill`, text `diag.<c>.text`, bold code letter, 20 px square, radius 4 px; always followed by the label text in `text.primary` |
| Workflow state (Reviewed, Pending …) | status badge — a separate field from the diagnostic chip; never merged |
| AI-assisted | bg `ai.bg`, text `ai.fg`, label "AI-assisted" + review state |
| Freshness / quality (Current, Stale, Bad quality) | status badge in its own column; never implied by the diagnostic colour |

## Navigation (sidebar 220 / 64 px rail)

| State | Tokens |
|---|---|
| Rest | text `text.secondary`, icon `text.secondary` |
| Hover | bg `surface.hover`, text `text.primary` |
| Selected | bg `surface.selected`, text + icon `action.primary`, 3 px start-edge indicator `action.primary`, font-weight 600 |
| Focus | standard ring |
| Rail | icon only, tooltip label on hover/focus |

Sidebar and header surfaces: `surface.page` with `border.subtle` edge. Header 64 px; plant selector, search, time range, environment indicator, user control in fixed positions.

## Panels / cards

bg `surface.panel`, border `border.subtle`, radius 12 px, padding 20 px, gap 16 px, title 18 px `text.primary`. No nested decorative cards. Charts sit on `surface.panel`.

## Dialogs, popovers, drawers, sheets

Surface `surface.panel`, border `border.subtle`, radius 12 px, padding 20–24 px. Overlay `overlay` (page surface at 60 %). Title 18 px; body 14 px `text.secondary`; actions right-aligned, primary last. Focus trapped; Escape closes; returning focus to the trigger. Inspector drawer below 1280 px uses the same surface.

## Toasts / notifications

`surface.panel`, `border.subtle`, 3 px start-edge bar in `status.<s>.fg`, icon + text label, dismiss control with accessible name. Alarm annunciation is **not** a toast; it follows the site alarm configuration.

## Tooltips

bg `surface.panel` (Day) / `surface.raised` (Night), border `border.strong`, text `text.primary`, 12 px.

## Charts (recharts)

| Part | Token |
|---|---|
| Grid | `chart.grid` (= `border.subtle`) |
| Axis line | `chart.axis` (= `border.strong`) |
| Tick / legend text | `chart.tick` (= `text.secondary`), 12 px |
| Tooltip | `chart.tooltip.bg` / `chart.tooltip.border` / `chart.tooltip.fg` |
| Cursor / hover band | `chart.cursor` |
| Series 1–6 | `chart.series.n`; measured solid, setpoint dashed and labelled, estimate distinct pattern and labelled |
| Unavailable interval | gap in the line + labelled band in `surface.raised` ("No sample") |
| AI layer | `ai.fg`, explicitly labelled |
| Diagnostic history lanes | `diag.<c>.fill` segments proportional to duration; Normal segment `surface.raised` with `text.primary` label |

Pass `var(--traverse-…)` strings to recharts `stroke`/`fill`/`contentStyle`; they resolve inside the chart container in both themes.

## Skeletons

`surface.raised` blocks with a visually hidden "Loading <panel name>" label; keep the selected context visible.

## Theme switch

Ghost icon button in the header (sun / moon from the single outlined icon set), `aria-label="Switch to night mode"` / `"Switch to day mode"`, `aria-pressed`, keyboard operable, placeholder of identical size until mounted. Writes `data-theme` on `<html>`; persisted by next-themes.
