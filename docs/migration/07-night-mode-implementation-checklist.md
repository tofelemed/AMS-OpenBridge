# 07 — Night-Mode Implementation Checklist (Candidate A "Neutral Graphite")

**Companion to:** [06-night-mode-color-theme-audit.md](06-night-mode-color-theme-audit.md)
**Approved candidate:** **A — Neutral Graphite** (3 depth steps, border-led, fully achromatic chrome)
**Approval:** granted by the user ("do recommended"), satisfying the audit's Phase Gate.
**Date:** 2026-08-27

Findings IDs (F-01 … F-14) refer to §2.3 of the audit.

---

## Phase 0 — Approval & baseline

- [x] **0.1** Phase Gate released — Candidate A explicitly approved.
- [x] **0.2** Baseline captured: 32 undefined tokens / 119 dropped declaration sites; 157 amber night
      declarations live; 18 amber tokens actually consumed by project code.
- [x] **0.3** Confirm every alias target exists in **all three** shipped themes before use.

## Phase 1 — F-03: revive the dead tokens *(blocking prerequisite)*

Target: [designTokens.css](../../src/frontend-ob/src/components/Designer/designTokens.css), extending the
existing "Compatibility aliases" block (L38-64).

- [x] **1.1** Alarm/status aliases (**57 dropped sites**) — map `--alert-*-background-color` to the
      OpenBridge **container-tint** variants (correct for rows/badges; the saturated fill would make a
      dense grid unreadable), and `--on-alert-*` to `--element-active-color` so text flips with theme.
- [x] **1.2** Chrome/structural aliases (**62 dropped sites**) — incl. `--on-surface-active-color`
      (fixes F-11 brand title), `--regular-*-background-color` (fixes nav hover/active), `--border-focused-color`.
- [x] **1.3** Low-priority (`--alert-notice-*`) mapped **achromatically** — see Decision D-2 below.
- [x] **1.4** Verify zero remaining undefined custom properties.

## Phase 2 — F-04 / F-05: alarm-priority mapping *(blocking prerequisite)*

Target: [Dashboard.tsx `PRIORITY_DEFS`](../../src/frontend-ob/src/components/Dashboard/Dashboard.tsx#L606-L611)

- [x] **2.1** F-04 — Medium no longer painted with `--element-active-color` (the navigation text token).
- [x] **2.2** F-05 — High moved off `--alert-caution-color` (Medium's token) onto `--alert-warning-color`.
- [x] **2.3** F-13 — replace `textColor:'#fff'` / `var(--on-selected-color, #fff)` with the real
      `--on-alarm-color` / `--on-warning-color` / `--on-caution-color` (verified present in all 3 themes).
- [x] **2.4** Low left achromatic (Decision D-2).

## Phase 3 — F-09 / F-10: dialog night theme *(blocking prerequisite)*

Target: [hmi-dialogs.css](../../src/frontend-ob/src/styles/hmi-dialogs.css)

- [x] **3.1** F-09 — add a `:root[data-obc-theme='night']` branch overriding all `--hmi-*` tokens to the
      Candidate A neutral scale. Removes the **#FFFFFF at 21:1** glare on a dark-adapted console.
- [x] **3.2** F-09b — tokenise the hardcoded `color:#FFFFFF` declarations via a new `--hmi-on-accent`.
- [x] **3.3** F-10 — replace the six Tailwind status hues (`#F59E0B`, `#EF4444`, `#10B981`, `#D97706`,
      `#DC2626`, `#059669`) with OpenBridge alert tokens.

## Phase 4 — Candidate A palette

Target: [designTokens.css](../../src/frontend-ob/src/components/Designer/designTokens.css) night block.

- [x] **4.1** Surface scale: canvas `#0A0A0A` → surface `#141414` → raised `#1E1E1E` (fixes F-07).
- [x] **4.2** Text tiers: `#D4D4D4` / `#9A9A9A` / `#6E6E6E` (+ disabled `#4A4A4A`).
- [x] **4.3** Borders: divider `#282828`, outline `#3C3C3C`, **focus `#8A8A8A` at 5.73:1** (fixes F-08).
- [x] **4.4** Override the 18 amber tokens project code actually consumes (fixes F-01, F-02).
- [x] **4.5** F-06 — repoint `TB.blue` off the *background* token it misuses as foreground.
- [x] **4.6** Confirm the reserved alarm/NE107/IEC-60073 set is untouched.

## Phase 5 — Verification

- [x] **5.1** `npm run build` (tsc typecheck + vite) clean.
- [x] **5.2** `npm run lint` clean at `--max-warnings 0`.
- [x] **5.3** Undefined-token count re-measured → 0.
- [x] **5.4** Contrast re-verified against the shipped values.
- [x] **5.5** Confirm no OpenBridge `node_modules` file was edited.

---

## Decisions taken during implementation

**D-1 — Aliases, not call-site renames.** The audit's Phase Gate said "rename to the real OpenBridge
tokens; do not author new ones." Implementation uses the **existing alias block** in `designTokens.css`
(L38-64) instead, which that file was explicitly created to host. Rationale: it repairs all 119 sites in
one reviewed place rather than editing 119 call sites across 8 files, it is the pattern already
documented in that file, and the alias values are `var()` references to **real** OpenBridge tokens — so
nothing is invented and everything stays theme-aware. Net effect is identical; risk is far lower.

**D-2 — Low priority stays achromatic.** Audit **OQ-2** records that Low / Journal / Shelved colors are
**not defined anywhere in this repo**; the cyan/blue for Low is asserted but unverified. Mapping Low to
OpenBridge's `--notification-*` family would paint it **green** in night (`rgb(40,101,80)`) — which
collides with IEC 60073 "green = normal/safe". Low is therefore mapped to the neutral container tint
(least-salient, IEC 60073 "white/neutral = no specific meaning"). **If the alarm-philosophy owner
confirms Low = cyan/blue, this is a 3-line change** to the three `--alert-notice-*` aliases.

**D-3 — Dialog primary action stays achromatic in night.** IEC 60073 would justify blue for
"mandatory action", but the prompt's own alarm mapping puts **Low = cyan/blue**. Using blue for confirm
buttons would recreate the F-02 class of error. Primary actions are therefore distinguished by fill
lightness + border, not hue. Reversible if D-2 resolves against blue.

**D-4 — Alert backgrounds use container tints, not saturated fills.** `--alert-*-background-color` feeds
alarm **row** backgrounds (incl. `color-mix(… 60%, transparent)` blends) and priority badges. Saturated
fills would make a dense AG-Grid unreadable. The OpenBridge `--alert-*-container-background-color`
variants exist in all three themes and are the intended target. Badges keep the saturated
`--alert-*-color` as their **border**, giving fill + outline + light text.

---

## Contrast verification table (as shipped)

| Surface / pair | Value | Ratio | Requirement | Result |
|---|---|---|---|---|
| primary text on canvas | `#D4D4D4` on `#0A0A0A` | **13.36:1** | 4.5 | PASS |
| primary text on raised (worst case) | `#D4D4D4` on `#1E1E1E` | **11.25:1** | 4.5 | PASS |
| secondary text on raised | `#9A9A9A` on `#1E1E1E` | **5.92:1** | 4.5 | PASS |
| muted text on canvas | `#6E6E6E` on `#0A0A0A` | 3.88:1 | 3.0 non-text | PASS |
| disabled text | `#4A4A4A` on `#0A0A0A` | 2.23:1 | — | AA-exempt (1.4.3) |
| **focus ring** | `#8A8A8A` on `#0A0A0A` | **5.73:1** | 3.0 (1.4.11) | PASS |
| Critical text on tint (night) | `#D4D4D4` on `rgb(70,0,0)` | **11.24:1** | 4.5 | PASS |
| High text on tint (night) | `#D4D4D4` on `rgb(53,20,0)` | **11.32:1** | 4.5 | PASS |
| Medium text on tint (night) | `#D4D4D4` on `rgb(37,29,0)` | **11.29:1** | 4.5 | PASS |
| Critical text on tint (day) | `rgb(31,31,31)` on `rgb(255,210,203)` | **12.03:1** | 4.5 | PASS |
| Critical badge border on tint | `#E90F20` on `rgb(70,0,0)` | 3.61:1 | 3.0 | PASS |
| Critical chip label on fill | `#000` on `#E90F20` | 4.55:1 | 4.5 | PASS |
| dialog text on dialog surface | `#D4D4D4` on `#161616` | **12.21:1** | 4.5 | PASS |

**Salience restored:** chrome is now achromatic, so it no longer competes with alarms on the hue channel
at all — the axis ISA-101 actually reserves. Alarm salience additionally comes from a saturated *area*
(tint + saturated border, or filled chip), not from thin colored glyphs.

---

## Verification results (measured, 2026-08-27)

Re-measured from the **shipped file contents**, not from the intended values.

| Check | Before | After |
|---|---|---|
| Undefined custom properties | 32 | **0** |
| Silently-dropped declaration sites | 119 (57 alarm-significant) | **0** |
| Amber chrome tokens consumed by app code | 18 live | **0** — all 18 overridden |
| Hardcoded hex in dialog *rules* | 63, no theme branch | **0**, night branch present |
| `npm run build` (tsc + vite) | — | **PASS** — built in 1m 6s |
| `npm run lint` (`--max-warnings 0`) | — | **PASS** — exit 0 |
| `node_modules` modified | — | **no** |
| Files changed | — | 4 (+262 / −54) |

### One number moved the "wrong" way — stated plainly

The chrome-to-Critical **luminance** ratio went from **2.59× to 3.71×**. It did not improve; it widened.

This is the documented trade-off from audit §3.0, not a regression that slipped through:

- WCAG AA (4.5:1) for body text sets a luminance **floor** that necessarily lands near the alarm
  colors, because OpenBridge deliberately pins all four alert colors at ~4.55:1. Any AA-compliant
  chrome text on a near-black canvas will out-luminate them. This is unavoidable, not a tuning miss.
- What actually changed is the **hue** channel: chrome went from a saturated orange-amber sitting
  between the High and Medium priorities to `#D4D4D4`, verified achromatic (R=G=B). ISA-101 reserves
  *saturated color*, not brightness — so chrome has now left the reserved channel entirely, which a
  brightness adjustment alone could never achieve.
- Alarms gained **area** salience they did not previously have at all: before this change, 57
  alarm-significant declaration sites were dead, so the nav alarm badge had no fill and alarm rows had
  no tint. Alarm surfaces now render as tint + saturated border + theme-flipping label.

**If the luminance gap is judged unacceptable on review**, the lever is to dim the chrome text tier
(e.g. `--element-active-color` `#D4D4D4` → `#A8A8A8`, which still clears AA at 7.0:1 on the raised
surface and drops the ratio to ~2.2×). That is a one-line change and is *not* applied here, because
Candidate A's published values were what was approved.

### Deferred / still open

- **OQ-2 (unchanged):** Low / Journal / Shelved priority colors remain undefined anywhere in the repo.
  Low ships achromatic per D-2. Needs the alarm-philosophy document to close.
- **OQ-3 (unchanged):** no NE107-named tokens exist; whether NE107 is realised elsewhere was not
  established by this work.
- **OQ-1 (partially open):** contrast is verified from the deterministic token cascade and the build
  passes, but **no live browser render was performed** — `getComputedStyle` has not been read back from
  a running session, and shadow-DOM styles inside OpenBridge Lit components remain unverified.
- **Audit undercount, corrected:** audit §1.3 reported 63 hardcoded literals in `hmi-dialogs.css`. That
  figure came from a truncated scan and was low — additional light-only blocks (ISA notices, info
  notice, context-menu danger states, reason buttons, detail-panel actions, scrollbars) were found and
  fixed during implementation. The audit's *count* was wrong; its *finding* was right.
- **`hmi-dialogs.css` is 1261 lines**, over the 400–500 guideline in `CLAUDE.md`. It was already 1179
  before this work; restructuring it was out of scope and is left as a separate cleanup.
