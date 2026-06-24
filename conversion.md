# conversion.md — OpenBridge Component Selection Map (AMS Alarm Acknowledgement App)

> **Purpose.** For every UI concern in this application, this file defines **what to use
> from OpenBridge**. The agent must consult this map before building any screen or control,
> and must not introduce non-OpenBridge UI for anything listed here.
>
> **Resolution rule.** Where this map names a *family* rather than an exact tag, resolve the
> precise component, props, slots, and events from `custom-elements.json` in the installed
> core package, then use its React wrapper (`obc-x-y` → `ObcXY`). See `openbridge-agent-rules.md` §9.
> Tags marked **(verify)** are expected names to confirm in the manifest, not invented facts.

---

## 1. Application shell and layout

| Concern | OpenBridge choice | Notes |
| --- | --- | --- |
| Top application bar | `ObcTopBar` (`obc-top-bar`) — confirmed | App title, page title, dimming/brightness, alert summary entry point, app menu trigger. |
| Brilliance / day-night control | OpenBridge brilliance / dimming control in `components/…` **(verify)** | Wire to `data-obc-theme` switching (`day`/`dusk`/`night`/`bright`). |
| Navigation / app menu | OpenBridge navigation menu + menu item components **(verify)** | Do not build a custom sidebar. |
| Page / content cards | OpenBridge card components **(verify)** | Group alarm panels, KPIs, and detail views. |
| Dividers, surfaces, containers | OpenBridge layout primitives + surface tokens | Use `--{variant}-{state}-background-color` tokens, never raw fills. |

---

## 2. Controls and inputs

| Concern | OpenBridge choice | Notes |
| --- | --- | --- |
| Buttons (primary/secondary/flat/raised) | OpenBridge button component(s) **(verify)** | Use the documented `style`/variant props (`flat`/`normal`/`raised`/`amplified`), not custom CSS. |
| Icon buttons | OpenBridge icon-button + `obi-*` icon | Respect the 48px touch / 32px visual target. |
| Toggles / switches | OpenBridge toggle component **(verify)** | Positive boolean props (`checked`, not `disableX`). |
| Text / number inputs | OpenBridge input components **(verify)** | For filters, search, operator notes. |
| Select / dropdown | OpenBridge select/menu components **(verify)** | For priority/area/unit filters. |
| Tabs / segmented controls | OpenBridge tab components **(verify)** | For Active / Shelved / Suppressed / History views. |

---

## 3. Alarms and alerts — the core domain (anchor: ISA-18.2 / IEC 62682, EEMUA 191)

Use OpenBridge's alert/notification components and alert tokens for **all** alarm
presentation, acknowledgement, and notification. Do not build custom banners/toasts.

| Concern | OpenBridge choice | Notes |
| --- | --- | --- |
| Alarm summary / count in top bar | `ObcTopBar` alert area + alert button **(verify)** | Shows highest active priority and unacknowledged count. |
| Alert button / indicator | OpenBridge alert button **(verify)** | Drives the blink-until-acknowledged behaviour via alert tokens. |
| Alarm list / alert list | OpenBridge alert-list / notification-list **(verify)** | One row per alarm; columns: time, tag, description, priority, state. |
| Single alarm row / notification item | OpenBridge notification/alert item **(verify)** | Carries severity styling + acknowledge affordance. |
| Acknowledge action | The item/list's acknowledge control + `acknowledge` event **(verify)** | Bind to your DCS two-way ack write-back; do not fake the state locally. |
| Silence / mute | OpenBridge silence control **(verify)** | Audible-off is distinct from acknowledge — keep them separate per ISA-18.2. |
| Severity styling | Alert tokens/mixins `alert-alarm`, `alert-critical`, `alert-caution` | Plus blink properties `--alarm-blink-on/off`, `--warning-blink-on/off`. |

### 3.1 Alarm-state → OpenBridge presentation mapping

Drive OpenBridge alert visuals from your alarm-state machine (do **not** let the library's
visual model become your alarm model — keep an explicit adapter):

| ISA-18.2 / IEC 62682 state | OpenBridge presentation |
| --- | --- |
| Normal (RTN, acknowledged) | No alert styling; item cleared from active list. |
| Unacknowledged alarm | Severity colour **+ blinking** (alarm/critical/caution token), audible flag set. |
| Acknowledged (still active) | Same severity colour, **steady (no blink)**. |
| Return-to-normal, unacknowledged | Distinct "RTN unacked" treatment — steady, flagged for ack/clear. |
| Shelved | Move to Shelved view; muted/secondary styling; show shelve timer. |
| Suppressed-by-design / Out-of-service | Separate view; neutral styling; clearly labelled as not annunciating. |

### 3.2 Priority → severity token mapping (configure to your alarm philosophy)

| Alarm priority | OpenBridge severity token |
| --- | --- |
| Critical / Emergency | `alert-alarm` (highest urgency, blink) |
| High | `alert-critical` |
| Medium / Warning | `alert-caution` |
| Low / Advisory | Notification (non-blinking) |
| Diagnostic / Info | Notification, lowest emphasis |

> Confirm exact severity levels and audible behaviour against the site's alarm
> rationalization / alarm philosophy document before finalising the mapping.

---

## 4. Data display and trends

| Concern | OpenBridge choice | Notes |
| --- | --- | --- |
| Tables / lists | OpenBridge list/table components **(verify)** | Alarm history, audit log, shelving register. |
| KPIs / counts | OpenBridge cards + typography tokens | Active count, unacked count, alarm rate (per ISA-18.2 / EEMUA 191 metrics). |
| Trends / charts | `bars-graphs/…` (line, area, donut, pie, polar, radial-bar) | Alarm-rate trend, priority distribution, flood detection. |
| Gauges / instruments | `navigation-instruments/…` + `building-blocks/…` | Use only if showing live process values. |
| Process device symbols | `automation/…` (valves, pumps, motors, tanks, lines, badges) | For any embedded mimic/faceplate context. |

---

## 5. Icons, typography, color

| Concern | OpenBridge choice | Rule |
| --- | --- | --- |
| All icons | `obi-*` / `Obi…` (1000+); `obi-placeholder` for undecided slots | No other icon library anywhere. |
| Typography | Noto Sans + OpenBridge font tokens/mixins | No raw font-size literals. |
| Color | `data-obc-theme` palette + `--…-color` tokens | No raw hex; theme-switchable only. |
| Spacing / sizing | Size-variant classes (`.obc-component-size-*`) + tokens | Larger size class for touch panels. |

---

## 6. What is NOT in OpenBridge (build it yourself, but skinned with OB tokens)

OpenBridge does not cover backend/data concerns or every app-specific widget. Where you
must build custom UI (e.g. a bespoke alarm-rationalization editor), still skin it using
OpenBridge **tokens, fonts, spacing, and themes** so it is visually indistinguishable, and
reuse OpenBridge buttons/inputs/icons inside it. Never introduce a competing visual language.

---

## 7. Build order (recommended)

1. Shell: `ObcTopBar` + theme provider (`data-obc-theme`) + navigation menu.
2. Primitives: buttons, inputs, toggles, cards.
3. **Alarm list + single alarm item + acknowledge flow**, wired to the alarm-state adapter (§3).
4. Filters/tabs (Active / Shelved / Suppressed / History).
5. Trends, KPIs, history table.
6. Any embedded mimic/automation symbols last.

> For every step: resolve exact tags/props from `custom-elements.json` first, confirm with
> the Storybook story, then implement via the React wrapper.
