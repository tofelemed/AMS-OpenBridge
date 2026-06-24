# OpenBridge Agent Rules — AMS Alarm Acknowledgement Application

> **Purpose.** This file is the canonical context for any AI coding agent (Cursor,
> Claude Code, Copilot, etc.) working in **this application repository**. It defines
> how to consume the OpenBridge design system correctly so that every screen,
> control, and state uses OpenBridge styling and components — not ad-hoc UI.
>
> **Placement.** Save as `AGENTS.md` at the repo root, or as
> `.cursor/rules/openbridge.mdc` (set `alwaysApply: true`). Keep `conversion.md`
> alongside it and reference it from here.

---

## 0. Critical distinction (read first)

The OpenBridge GitHub repository ships its own `AGENTS.md` and `.cursor/rules`.
**Those are written for people contributing to the library itself** (creating Lit
components, running `npm run analyze`, JSDoc patterns, visual snapshot tests, "do
not edit the auto-generated wrappers"). **Do not load them into this project.** They
will give the agent a library-maintainer mental model that does not apply to building
an application. This file replaces them with consumer-oriented rules.

---

## 1. What OpenBridge is, in one paragraph

OpenBridge is an open-source design system for safety-critical maritime and industrial
HMIs, implemented as **Lit-based web components** (Lit 3 + TypeScript). The core package
is the source of truth; framework wrappers are auto-generated. We consume the **React
wrapper**. The system is standards-aligned (IEC 62288 presentation principles, IMO/IEC
bridge alert-management lineage) and ships multiple light-condition themes plus a
first-class alert/alarm subsystem — which is why it suits an alarm-acknowledgement app.

---

## 2. Packages and versions

| Package | Role |
| --- | --- |
| `@oicl/openbridge-webcomponents` | Core Lit web components + CSS (source of truth). Provides the design tokens, themes, and `custom-elements.json`. |
| `@oicl/openbridge-webcomponents-react` | **Typed React wrappers — what we import in this app.** |

Rules:
- **Always import from the React wrapper**, never instantiate raw custom elements in JSX.
- Pin an explicit version in `package.json`. Do not float on `next`/`latest`.
- Node **v20+**.

Install (confirm exact names against npm before running):

```bash
npm install @oicl/openbridge-webcomponents @oicl/openbridge-webcomponents-react
```

---

## 3. Import conventions

The React wrappers are **per-path, PascalCase** components mirroring the core element
tag (`obc-top-bar` → `ObcTopBar`; icons use the `Obi…` / `obi-…` prefix).

Confirmed canonical import shape:

```ts
import { ObcTopBar } from "@oicl/openbridge-webcomponents-react/components/top-bar/top-bar";
```

Generalised from the core directory layout (the segment after the package is the
**component family**):

| Family path segment | Contents |
| --- | --- |
| `components/…` | General UI: buttons, cards, top-bar, inputs, feedback/alerts, navigation menus |
| `navigation-instruments/…` | Compass, heading, gauges, indicators |
| `building-blocks/…` | Low-level SVG instrument pieces (scales, bars, chart bases) |
| `bars-graphs/…` | Charts: line, area, donut, pie, polar, radial-bar |
| `automation/…` | Process devices: valves, pumps, motors, tanks, lines, badges |
| `icons/…` | 1000+ auto-generated `obi-*` icons |

**Rule:** never guess a tag or import path. Resolve it from `custom-elements.json`
(see §9). If a component is not in the manifest, it does not exist — ask before
inventing a substitute.

---

## 4. One-time application setup (Next.js App Router)

1. **CSS** — import the OpenBridge stylesheet **once**, in `app/layout.tsx`.
   *Verify the exact dist path from the installed package* (e.g.
   `@oicl/openbridge-webcomponents/dist/…/openbridge.css`); read the core package
   README / `package.json` `exports` field to confirm. Do not hard-code a path you
   have not verified in `node_modules`.

2. **Font** — OpenBridge uses **Noto Sans**. Register it once (via `next/font` or an
   `@font-face` rule) and set it as the base family, so component typography and app
   text match.

3. **Theme** — set the active palette on the root via the **`data-obc-theme`**
   attribute. Four themes exist: `day`, `dusk`, `night`, `bright`.

```tsx
// app/layout.tsx
import "@oicl/openbridge-webcomponents/dist/…/openbridge.css"; // VERIFY exact path

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-obc-theme="day">
      <body>{children}</body>
    </html>
  );
}
```

4. **Theme switching** — store the current theme in app state and write it to the
   `data-obc-theme` attribute on the root element. All token-driven colours update
   automatically. A control-room app should expose at least `day`/`night`.

---

## 5. SSR / client-boundary rules (non-negotiable in Next.js)

Web components are **browser custom elements** that register on import and require the DOM.

- Any module that imports an OpenBridge React component must be a **Client Component**
  (`'use client'` at the top).
- Keep data fetching and server logic in Server Components **above** the OpenBridge
  layer; pass plain serialisable props down into the client UI.
- For heavy instruments/charts that can break hydration, use
  `next/dynamic(() => import(...), { ssr: false })`.
- Never call browser APIs at module scope; gate on `useEffect`/`typeof window`.

---

## 6. Theming and design tokens (use tokens, never literals)

**Rule:** the agent must not write raw hex colours, pixel font sizes, or bespoke
spacing for anything OpenBridge covers. Drive everything from OpenBridge CSS variables
so theme switching and approvable contrast are preserved.

- **Palette** is defined globally and selected by `data-obc-theme` on `:root`.
- **Colour token conventions:**
  - Surfaces: `--{variant}-{state}-background-color`, `--{variant}-{state}-border-color`
  - Content (text/icon): `--on-{variant}-{role}-color`, where `role` ∈ `active | neutral | disabled`
- **Size variants:** apply `.obc-component-size-regular` (default) / `-medium` /
  `-large` / `-xl` on an **ancestor** element; sizing tokens inherit down. Use a larger
  size class for touch-panel deployments.
- **Touch vs visual target:** interactive components use a two-layer model — an outer
  invisible **touch target (≈48px)** wrapping a smaller visible control (**≈32px**).
  Do not shrink touch targets below the provided defaults; respect them for operator use.

---

## 7. Alerts and alarms (the heart of this app)

OpenBridge encodes alert severity as first-class visual states. The relevant style
hooks are the alert mixins: **`alert-alarm`**, **`alert-critical`**, **`alert-caution`**,
with a blink animation driven by registered CSS custom properties
(`--alarm-blink-on/off`, `--warning-blink-on/off`). The pattern is: **blink while
unacknowledged → steady once acknowledged → clear on return-to-normal.**

**Rule:** alarm presentation, acknowledge interaction, and the alert list/notification
surfaces must all come from OpenBridge's alert/notification components and these alert
tokens. Do not build a custom banner or toast. The mapping from your alarm-management
state model (ISA-18.2 / IEC 62682) to OpenBridge alert states is defined in
**`conversion.md` §Alarms** — follow it exactly so the UI state machine stays faithful
to the alarm standard.

---

## 8. Icons

- Use OpenBridge icons (`obi-*` / `Obi…` React components) for **all** iconography.
  Do not import Lucide, Font Awesome, Material Icons, or inline SVGs for anything the
  OpenBridge icon set covers (1000+ icons).
- `obi-placeholder` is the explicit placeholder when an icon slot is required but the
  final icon is undecided — use it instead of a random stand-in.
- Resolve exact icon names from the icon family in `custom-elements.json` / Storybook.

---

## 9. How the agent resolves any component (authoritative protocol)

When the agent needs a component, prop, slot, or event and is not certain:

1. **Read `custom-elements.json`** from the installed core package
   (`node_modules/@oicl/openbridge-webcomponents/custom-elements.json`). This is the
   complete, machine-readable API: every element, its attributes/properties, slots,
   events, and types. Storybook's own docs are generated from it.
2. Cross-check the component's **Storybook story** for usage and variant examples
   (reference: the stable Storybook at `openbridge-storybook.web.app`).
3. Map the core tag to its React wrapper name (`obc-x-y` → `ObcXY`) and import per-path.

**Never** fabricate a component, prop, or import path. If it is not in the manifest,
stop and ask.

---

## 10. Boolean props and API style

- OpenBridge names booleans **positively** (`showLabels`, `hasBar`, `showTooltip`),
  default `false`, opt-in `true`. Some `true`-default booleans are property-only
  (`attribute: false`) — in React this is transparent because **wrappers set everything
  via properties**, so pass them as normal props.
- Prefer the component's own props/variants over CSS overrides. Only reach for the CSS
  tokens in §6 when a documented prop does not exist.

---

## 11. Hard do / do-not list

**Do**
- Import only from `@oicl/openbridge-webcomponents-react`, per-path.
- Wrap OpenBridge UI in `'use client'`; keep server logic above it.
- Drive all colour/size/spacing from OpenBridge tokens and size-variant classes.
- Use OpenBridge alert components + alert tokens for every alarm/notification surface.
- Use `obi-*` icons exclusively.
- Resolve unknowns from `custom-elements.json` before writing code.

**Do not**
- Do not load the library's contributor `AGENTS.md` / `.cursor/rules` into this repo.
- Do not edit anything under `node_modules`.
- Do not hand-write raw custom-element tags in JSX, or mix a second UI/icon library.
- Do not hard-code hex colours, font sizes, or unverified import/CSS paths.
- Do not server-render the custom elements.
- Do not invent component, prop, slot, or event names.

---

## 12. Licensing note (for awareness, not legal advice)

OpenBridge 1.x uses a delayed-license model: each release is AGPL for its first six
months, then transitions to Apache 2.0 (donors get immediate Apache 2.0). For private,
non-distributed personal use there is no fee and no practical obligation. If this app is
ever distributed or exposed to third parties over a network, revisit the license posture
(pin to a version already past its Apache transition, or join as a donor). Not legal advice.
