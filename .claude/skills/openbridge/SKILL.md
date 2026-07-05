---
name: openbridge
description: >
  Canonical rules for building ALL UI in this repo (src/frontend-ob) with the
  OpenBridge design system. Read BEFORE writing or editing any screen, component,
  HMI symbol, dialog, chart, icon, color, spacing, theme, or alarm/alert surface —
  and before adding any UI dependency. Covers import conventions, design tokens,
  themes (day/dusk/night/bright), automation/process symbols for the HMI Designer,
  alarm-state → alert mapping (ISA-18.2/IEC 62682), and how to resolve any component
  from custom-elements.json. Triggers on: "component", "design", "color", "theme",
  "style", "icon", "button", "dialog", "chart", "trend", "symbol", "valve/pump/tank",
  "alarm UI", "HMI", "canvas", "faceplate", "OpenBridge", "obc-*", "obi-*".
---

# OpenBridge Design System — build rules for this app

**All designs, components, colors, spacing, typography, icons, and alarm surfaces in
`src/frontend-ob` come from OpenBridge. No ad-hoc UI, no second UI/icon library, no raw
hex/px.** This skill is the operational contract. The long-form rationale lives in
[openbridge-agent-rules.md](../../../openbridge-agent-rules.md) and the per-concern
component map in [conversion.md](../../../conversion.md) — consult those for anything not
covered here.

## 0. The two packages

| Package | Use |
| --- | --- |
| `@oicl/openbridge-webcomponents` | Core Lit components + **CSS/tokens** + `custom-elements.json` (the API source of truth). Import only the **CSS** and read the manifest from here. |
| `@oicl/openbridge-webcomponents-react` | **Typed React wrappers — the only thing you import into JSX.** |

Both are pinned at `^1.0.1` in [src/frontend-ob/package.json](../../../src/frontend-ob/package.json). Node **v20+**. Never float on `next`/`latest`. Never edit anything under `node_modules`.

## 1. Import conventions (exact, per-path, PascalCase)

Core tag `obc-x-y` → React wrapper `ObcXY`, imported **per component path**:

```ts
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObcTopBar } from '@oicl/openbridge-webcomponents-react/components/top-bar/top-bar';
import { ObcAlertButton } from '@oicl/openbridge-webcomponents-react/components/alert-button/alert-button';
```

Family path segments (the segment right after the package name):

| Segment | Contents |
| --- | --- |
| `components/…` | General UI: buttons, cards, inputs, top-bar, tables, tabs, dialogs, alerts, navigation |
| `automation/…` | **Process/mimic symbols**: valves, pumps, motors, fans, tanks, lines, badges, readouts (the HMI Designer symbol library) |
| `building-blocks/…` | Low-level SVG instrument pieces: bars, circular-progress, radial instrument, alert-list |
| `navigation-instruments/…` | Compass, heading, gauges |
| `bars-graphs/…` | Charts: line, area, donut, pie, polar, radial-bar |
| `icons/…` | 1000+ `obi-*` icons |

**Never hand-write raw `<obc-*>` / `<obi-*>` custom-element tags in JSX. Never guess a tag, prop, slot, event, or import path.** If uncertain, follow §7.

Real examples already in this codebase (copy these patterns):
- [renderers/catalogRenderer.tsx](../../../src/frontend-ob/src/components/Designer/renderers/catalogRenderer.tsx) — ~60 general components wired for the Designer palette.
- [global.d.ts](../../../src/frontend-ob/src/global.d.ts) — local prop typings incl. the `automation/*/*` wrappers (`ObcPump`, `ObcMotor`, `ObcAnalogValve`, `ObcAutomationTank`, `ObcFan`, `ObcDamper`, `ObcDigitalValve`, line pieces, etc.).

## 2. One-time app setup (already done — do not duplicate)

- **CSS** is imported once in [main.tsx](../../../src/frontend-ob/src/main.tsx): `import '@oicl/openbridge-webcomponents/dist/openbridge.css';` **before** any component. App-level overrides go in `styles/app.css` / `styles/hmi-dialogs.css` and must only extend tokens, never restyle OpenBridge internals.
- **Font**: Noto Sans (OpenBridge default). Use font tokens, never raw `font-size`.
- **Theme**: set `data-obc-theme` on the root — one of `day` | `dusk` | `night` | `bright`. A control-room app must offer at least `day`/`night`. Store the active theme in app state and write the attribute; all token colors update automatically.

## 3. Tokens only — never literals

Do **not** write raw hex, px font sizes, or bespoke spacing for anything OpenBridge covers.

- **Surfaces**: `--{variant}-{state}-background-color`, `--{variant}-{state}-border-color`
- **Content (text/icon)**: `--on-{variant}-{role}-color`, `role ∈ active | neutral | disabled`
- **Sizing**: apply a size-variant class on an **ancestor** — `.obc-component-size-regular` (default) / `-medium` / `-large` / `-xl`; tokens inherit down. Use a larger class for touch-panel deployments.
- **Touch vs visual target**: interactive components use a ~48px invisible touch target around a ~32px visible control. Never shrink touch targets below defaults.
- Prefer a component's own props/variants (e.g. `variant="raised"`) over CSS overrides. Only reach for tokens when no documented prop exists.

## 4. Icons

- Use **only** `obi-*` / `Obi…` OpenBridge icons (1000+). No Lucide, FontAwesome, Material, or inline SVG for anything the icon set covers.
- Use `obi-placeholder` when an icon slot is required but undecided.
- Resolve exact icon names from the manifest / Storybook.

## 5. Alarms & alerts (the core domain — ISA-18.2 / IEC 62682 / EEMUA 191)

Every alarm/notification surface uses OpenBridge alert components + alert tokens. **Never build a custom banner/toast/badge for alarms.**

- Components: `ObcAlertButton`, `ObcAlertIcon`, `ObcAlertFrame`, `building-blocks/alert-list`, notification components.
- Severity tokens/mixins: `alert-alarm`, `alert-critical`, `alert-caution`; blink props `--alarm-blink-on/off`, `--warning-blink-on/off`.
- **Pattern: blink while unacknowledged → steady once acknowledged → clear on return-to-normal.** Acknowledge must bind to the real DCS two-way ack write-back — never fake state locally.
- Keep an **explicit adapter** from your alarm-state machine to OpenBridge visuals (don't let the library's visual model become your alarm model):

| ISA-18.2 / IEC 62682 state | OpenBridge presentation |
| --- | --- |
| Normal (RTN, acknowledged) | No alert styling; cleared from active list |
| Unacknowledged alarm | Severity color **+ blink**, audible flag set |
| Acknowledged (still active) | Same color, **steady** |
| RTN, unacknowledged | Distinct "RTN-unacked" steady treatment, flagged for ack/clear |
| Shelved | Shelved view, muted styling, shelve timer |
| Suppressed / Out-of-service | Separate view, neutral styling, labelled not-annunciating |

Priority → token: Critical→`alert-alarm`, High→`alert-critical`, Medium→`alert-caution`, Low/Info→notification (non-blinking). Confirm audible/severity against the site alarm-philosophy doc.

## 6. HMI Designer symbols & process quality (NAMUR NE107)

- Process-mimic symbols come from `automation/…` (`ObcPump`, `ObcMotor`, `ObcAnalogValve`/`ObcDigitalValve`, `ObcAutomationTank`, `ObcFan`, `ObcDamper`, connecting `…Line` pieces, `ObcAutomationBadge`, `ObcAutomationReadout`). See the Designer renderers under [components/Designer/renderers/](../../../src/frontend-ob/src/components/Designer/).
- Live values / faceplates use instrument building-blocks (`ObcInstrumentRadial`, `ObcBarVertical/Horizontal`, `ObcCircularProgress`) — only when showing real process values.
- **Multi-state / quality colors follow NAMUR NE107**: Good / Uncertain / Bad / Maintenance / OutOfService. Drive these from OpenBridge state/severity tokens, not hand-picked colors.
- Displays are **configuration only** — no process values baked into saved definitions; live data binds at runtime via the Binding Resolver (see [CLAUDE.md](../../../CLAUDE.md)).

## 7. Resolving any component (authoritative protocol)

When you need a component/prop/slot/event and aren't 100% certain:

1. **Read the manifest**: `node_modules/@oicl/openbridge-webcomponents/custom-elements.json` — the complete machine-readable API (every element, attributes/properties, slots, events, types).
2. Cross-check the component's Storybook story for usage/variants (reference: `openbridge-storybook.web.app`).
3. Map core tag → wrapper (`obc-x-y` → `ObcXY`) and import per-path (§1).

**If it isn't in the manifest, it does not exist — stop and ask. Never fabricate a component, prop, or import path.**

## 8. Props / API style

- Booleans are named **positively** and default `false` (`showLabels`, `hasBar`, `checked`, `acknowledged`). React wrappers set everything via properties, so pass them as normal props.
- Some wrappers expose hyphenated attribute props (e.g. `alert-type` on `ObcAlertButton`, `ObcAlertIcon`) — match the existing typings in [global.d.ts](../../../src/frontend-ob/src/global.d.ts).
- When a wrapper lacks a local typing, add one to `global.d.ts` following the existing pattern rather than casting to `any` inline.

## 9. Hard do / do-not

**Do** — import per-path from the React wrapper only · drive all color/size/spacing from tokens + size classes · use OpenBridge alert components for every alarm surface · use `obi-*` icons exclusively · resolve unknowns from `custom-elements.json` first · gate any browser-API/custom-element use to the client (`'use client'`, `useEffect`).

**Do not** — load OpenBridge's *contributor* `AGENTS.md`/`.cursor/rules` (they're for library maintainers, wrong mental model here) · edit `node_modules` · hand-write raw custom-element tags · mix a second UI/icon library · hard-code hex/font-size/spacing or unverified import/CSS paths · invent component/prop/slot/event names · server-render the custom elements.
