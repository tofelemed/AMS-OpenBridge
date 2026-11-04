# CPA component fit (Part G)

| Field | Value |
|---|---|
| Document | Part G of the CPA redesign analysis. Read-only: no application file or `package.json` changed |
| Date | 2026-11-04 |
| Question | Can CPA's components meet the Traverse contracts, and does CD1 (adapter, keep OpenBridge) hold? |
| Baseline | [cpa-currenttheme.md](../cpa-currenttheme.md), called Baseline below |
| Contracts | `Traverse_UI_Design_and_Development_Guide_R01.pdf`, `.claude/skills/traverse-design-system/` (skill R1.1): SKILL.md, `references/components.md`, `references/acceptance.md` |
| OpenBridge | `@oicl/openbridge-webcomponents` 1.0.1, source and `custom-elements.json` in `src/frontend-ob/node_modules` |
| CD1 | CPA-UI-DEC-001 is not on disk. The only known content is that CD1 chose an adapter: a colour bridge from OpenBridge variables to Traverse tokens, keeping OpenBridge components |
| Rebuild | See §9. Use counts, rating totals and CD1 sizes below are generated, not typed |

## 1. Summary

**CD1 needs amending. It should not be reversed.** The colour bridge works exactly as CD1 assumes, and ObcButton can be kept. But a colour bridge alone is not enough, and 9 OpenBridge component types cannot meet the contract at all. The evidence supports **selective replacement**, not keeping everything and not replacing wholesale.

<!-- GEN:totals -->
| Family | Adapter-fit | Extend | Replace | Rated types |
|---|---|---|---|---|
| OpenBridge | 5 (43 uses) | 2 (214 uses) | 9 (46 uses) | 16 |
| Native HTML | 1 (6 uses) | 7 (311 uses) | 0 (0 uses) | 8 |
| CPA custom | 9 (132 uses) | 39 (870 uses) | 5 (10 uses) | 53 |
| Charts C1-C17 | 4 (5 uses) | 13 (61 uses) | 0 (0 uses) | 17 |
| **All** | **19** (186 uses) | **61** (1456 uses) | **14** (56 uses) | **94** |
<!-- /GEN -->

1. **Colour reaches the shadow tree.** Primary, Outline and Ghost states computed to the exact Traverse values, with one gap: Ghost hover text needs a host rule (§3.3).
2. **ObcButton can be 40 px with a 6 px radius without touching internals.** Inherited variables alone give painted 40, hit 40, radius 6, label 14 (§3.1). The 3 px focus gap and a true minimum height need two `::part` rules, exposed in source but undocumented (§6). Zero of the 213 call sites change.
3. **The Baseline's "ObcButton is 48 px" is the hit area.** The painted button is **34 px**, so it is 6 px short of the guide rather than 8 px over it.
4. **Five OpenBridge types fail on semantics, and that cannot be fixed from outside.** Selected state, current tab and button names never reach assistive technology (§3.4).
5. **Three of them produce 11 of the 15 critical axe nodes** in the Baseline, from 5 JSX uses (§3.6). The other 4 are CPA's own unlabelled native selects.
6. **Four more types fail only the 3 px focus gap**, because no `part` exposes the ring. That band is the owner's call: a waiver keeps them (§8).
7. **OpenBridge is a small part of CPA.** <!-- GEN:facts -->
4669 JSX elements in 176 live `.tsx` files. OpenBridge 264 (16 types) plus 39 icons, 6.5 % of all JSX. ObcButton is 80.7 % of OpenBridge uses. Of 460 interactive controls, 260 are OpenBridge (56.5 %) and 200 are native, before 38 native tables.
<!-- /GEN -->

### Three live defects, independent of the redesign

The first two reproduce with CPA's real `Modal` and `useDialogA11y` in a browser (§3.5); the third with the same markup as the call site (§3.4). None is a theme issue, and all three are in production today.

| Defect | Effect | Cause | Standard |
|---|---|---|---|
| **Tab cannot reach Modal footer buttons** | All 8 Modal uses have ObcButton footers, so a keyboard user cannot Tab to Confirm, Save or Cancel. In a confirm dialog Tab does nothing at all, so a delete cannot be confirmed; Escape only cancels. Enter submits in just two: the prompt and the user form | `querySelectorAll` in `Modal.tsx:57` cannot see a button inside a shadow root, so ObcButton footers are not in the trap's list | WCAG 2.1.1 (A), G04 |
| **Drawers do not trap focus, and focus is lost on close** | In the drawers built on `useDialogA11y`, Tab walks to the page behind an `aria-modal` dialog. In Modal and those drawers, when the trigger was an ObcButton, focus drops to `body` on close, because `host.focus()` does nothing without `delegatesFocus` | `useDialogA11y.ts:15-27`, `Modal.tsx:86` | WCAG 2.4.3 (A), components.md Dialogs |
| **Every role permission has the same name** | A screen reader announces each permission checkbox as "Checkbox item", so a user cannot tell which permission they are granting | `RolesConfig.tsx:264` sets no `aria-label`, and a wrapping `<label>` does not cross the shadow boundary. Host `aria-label` works on this component, so it is a one-line fix | WCAG 4.1.2 (A), G04 |

## 2. Method and rating rule

| Rating | Rule |
|---|---|
| **Adapter-fit** | Meets its contract clauses once the colour bridge is applied. No other change to the component |
| **Extend** | CSS, token or wrapper change in code CPA owns. Exposed variables and `::part` allowed. No shadow internals overridden |
| **Replace** | Cannot meet the contract without overriding internals, or the contract needs a component that does not exist |

Replace rows carry a band: **hard** is a name, role, state or keyboard failure; **gap only** means the 3 px focus gap is the only unreachable clause.

**Evidence used**, in order of strength:

1. Measured in Chromium with `docs/theme/tools/obc-fit-probe.mjs`: geometry, focus rings, computed colours, the accessibility tree and real Tab presses. It uses the package's own bundle, plus CPA's real `Modal` and `useDialogA11y` bundled with esbuild. No server, no lab, no credentials.
2. The TypeScript AST over the 176 live `.tsx` files: `component-inventory.mjs`.
3. OpenBridge source for all 113 component folders: `obc-internals.mjs`. Live CSS states: `component-states.mjs`.
4. Baseline measurements: `screenshots/current/manifest.json`, `data/tables/geometry.json`.

**Limits.** Probe fixtures run in the Day theme at 1440 × 1024 with OpenBridge's own CSS, not inside the running app, because this part may not call the lab. The route column is static import reachability, so it is an upper bound: a file can be imported by a route and render only behind a tab or dialog. Night was not probed; the mechanism is the same variables with other values.

**Counts reconcile with the Baseline.** Baseline §3.1 reports ObcButton 217, native button 74, select 45, table 38 by grep. This AST count gives 213, 65, 39, 38. The differences are fully explained: 4, 3 and 2 uses sit in the three hidden Admin tabs, 1 button is in a test, and 5 buttons and 4 selects are text in comments or strings, which grep counts and the AST does not.

## 3. What the browser measured

### 3.1 Geometry: what variables and parts can reach

Full data: [data/openbridge-fit-probe.json](data/openbridge-fit-probe.json). Sizes are px.

| Component | Contract | Default | Variables only | Variables plus `::part` |
|---|---|---|---|---|
| ObcButton | Min 40, radius 6, label 14 | Hit 48, **painted 34**, radius 6, label 16 | **Hit 40, painted 40, radius 6, label 14** | A wrapped label grows the box to 74. Without the part, it spills out of a fixed height |
| ObcIconButton | Hit ≥ 40 | Hit 48, painted 32 | 40 × 40 | Same |
| Segmented option | Min 40 | Hit 48, painted 32 | 40 | Same |
| ObcTextInputField | Field 40 | Field 32 | Field 40 | No parts exposed |
| ObcDropdownButton | Min 40 | Hit 48, painted 34 | 40 | No parts exposed |
| ObcFilterChip, ObcInputChip | Min 40 | Hit 48, painted 34 | 40 | No parts exposed |
| ObcAccordionItem | Min 40 | 48 | 40 | No parts exposed |
| ObcTabRow | Tabs sized to labels | Height 48, tab width 140 | Height 44, **width still 140** | No parts exposed |
| ObcTable row | 44 | 48 | 44 | Not needed |

CPA sets none of these variables today (grep finds no `--ui-components-*` declaration in `src/`), so the default column is what production paints, although it was measured in a fixture.

Three details matter for whoever writes the adapter:

- `.visible-wrapper` is content-box with a 1 px border, so `--ui-components-button-visual-size` must be **38 px** to paint 40. Setting 40 paints 42.
- Hit area and painted size are independent variables. A site could keep a 48 px hit area with a 40 px painted button, which is an option for Baseline Q13.
- `--menu-navigation-components-tab-item-min-width` is published in `openbridge.css` but ignored: `tab-item.css` hardcodes `min-width: 140px`. `cpm.css:820` already records the limit.

### 3.2 Focus ring (guide p.5: 2 px outline, 3 px gap)

Read from the box that draws the ring at each real Tab stop.

| Component | Ring | Gap, default | Gap with `::part` |
|---|---|---|---|
| ObcButton, ObcIconButton, segmented option | 2 px | 0 | **3 px, pass** (`::part(visible-wrapper)`) |
| ObcTextInputField, ObcFilterChip, ObcInputChip, ObcCheckbox, ObcTabRow, ObcAccordionItem | 2 px | 0 | **Not reachable**: no part on the ring box |
| ObcPagination | 2 px | 0 | Not reachable: a nested shadow root, which `::part` does not cross |
| ObcDropdownButton | 1 px, browser default on the select | 0 | Not reachable |
| ObcTable row | 2 px | Inset, −2 | Not tested |

A ring with no gap is still visible and passes WCAG 2.4.7. It fails the guide's specific p.5 rule, which is why those rows are a separate band.

### 3.3 Colour bridge (the core of CD1)

Variables were scoped to `obc-button`, not `:root`. That scoping matters: `--normal-*` and `--border-divider-color` are shared across meanings, so the bridge has to be able to map per component. All values below are computed styles from inside the shadow tree.

| Variant | State | Contract tokens | Result |
|---|---|---|---|
| Primary (`raised`) | Rest | `action.primary`, `action.on` | Exact |
| | Hover | `action.hover` | Exact |
| | Pressed | `action.active` | Exact |
| | Disabled | `surface.raised`, `border.subtle`, `text.muted` | Exact |
| Outline (`normal`) | Rest, hover, pressed | transparent + `border.strong` + `text.primary`; `surface.hover`; `surface.selected` | Exact |
| Ghost (`flat`) | Rest, pressed | `text.secondary`; `surface.selected` | Exact |
| | Hover | `surface.hover` plus `text.primary` | Background exact. **Text stays `text.secondary`**: no hover text variable. A host `:hover` rule re-pointing `--on-flat-active-color` covers it (Extend) |

Accent outline, Destructive and Link have no OpenBridge variant. Each is a host class re-pointing the same variables, or `href` for Link.

### 3.4 Attributes that never reach the inner control

Read from Chromium's accessibility tree. Components in this library use no `delegatesFocus` and do not forward ARIA from the host.

| Set on the host | CPA sites | Measured result |
|---|---|---|
| ObcButton `aria-label` | 1, the Modal close button | Name is **empty** |
| ObcButton `aria-pressed` | 9 | No pressed state |
| ObcButton `aria-expanded` | 1 | No expanded state |
| ObcButton `aria-describedby` | 1 | No description |
| ObcButton `title` | 45 | No description |
| ObcIconButton `aria-label` | Avoided by K-41 | Name is empty. Slot text works: "Close" |
| ObcToggleButtonGroup `aria-label` | 7 | No group exists to carry it |
| ObcTextInputField with no `label` prop | 3: `RolesConfig.tsx:185,189` inside a `<label>`, `:237` bare | Name is empty, both ways |
| ObcCheckbox inside `<label>` | 1, rendered per permission | **Every permission reads "Checkbox item"** |

Defects inside the library, which no CPA wrapper can reach:

| Component | Measured | Source |
|---|---|---|
| Segmented option | Plain button, no pressed or selected state, arrow keys do nothing | `toggle-button-option.js:63`: no role or ARIA attribute |
| ObcTabRow | All tabs read not selected, arrow keys do nothing | `tab-item.js:81`: `role="tab"` with no `aria-selected` |
| ObcFilterChip | Reads unchecked when checked | `filter-chip.js:73-75`: `role="checkbox"` with `aria-pressed` |
| ObcPagination | First, previous, next and last have empty names | `pagination.js:144-183`: `aria-label` on `obc-icon-button` hosts, which do not forward it |
| ObcModalWindow, not used by CPA | No dialog role, unnamed close button | `modal-window.js:56`. Also why K-42 cannot simply be swapped for it |
| ObcToggletip, not used by CPA | No trigger, no open state, no role, 0 Tab stops | `toggletip.js`: a presentational box |

### 3.5 Focus in CPA's own dialogs

Real components, 8 Tab presses each. Sequences are in `focus` in the probe JSON.

| Scenario | Result |
|---|---|
| Confirm dialog (`useConfirm`) with two ObcButtons | Focus stays on the dialog box. **Buttons never reached** |
| Form dialog with 2 inputs and an ObcButton footer | Cycles between the 2 inputs. **Save and Cancel never reached** |
| Drawer with `useDialogA11y` | Reaches the button, then the page behind, `body`, and round again. **Not trapped** |
| Close, opened from a native button | Focus returns to the trigger |
| Close, opened from an ObcButton | **Focus falls to `body`** |

Only light-DOM controls are matched, so a footer of ObcButtons sits outside the trap's first and last items. Admin triggers checked are ObcButtons (`AliasConfig.tsx:239-240`, `PlantModelConfig.tsx:389-390`, `UserManagementConfig.tsx:202-203`), so the lost-focus case is the normal case there.

### 3.6 The critical axe nodes trace to these components

From `routes.*.themes.day.axe` in the Baseline manifest. The capture kept one sample per rule, so attribution rests on that sample plus the matching count.

| Rule | Nodes | Route | Source |
|---|---|---|---|
| `aria-allowed-attr` | 3 | /cpm/performance | ObcFilterChip |
| `aria-required-attr` | 3 | /cpm/performance | ObcFilterChip |
| `button-name` | 4 | /cpm/performance | ObcPagination: the fixture also yields exactly 4 unnamed buttons |
| `select-name` | 1 | /cpm/performance | ObcDropdownButton |
| `select-name` | 2, 2 | /cpm/calculations, /admin/users | CPA's native selects, unlabelled at the call site |

**11 of 15 critical nodes come from 5 JSX uses.**

## 4. Component inventory and ratings

<!-- GEN:coverage -->
Rated rows cover 98 inventory keys. The other 189 of 264 custom types are not rated: they are route guards, page bodies, gate views, tab panels and local helpers assembled from rated parts. The largest are RequirePermission 32, RequireKinds 17, Row 10, RequireAuth 9, Row 6, SettingField 5. All 264 are listed with their use sites in [data/component-inventory.json](data/component-inventory.json).
<!-- /GEN -->

States: H hover, Fo focus ring, Pr pressed, Se selected, Di disabled, Re reason for disabled, Lo loading, Er error. Geometry is compared with guide p.6. Routes are static reachability (§2); "+ shell" means the app frame.

### 4.1 OpenBridge

<!-- GEN:a:ob -->
| ID | Component | Uses (files) | Routes | Variants | States | Keyboard | ARIA |
|---|---|---|---|---|---|---|---|
| K-01 | ObcButton | 213 (83) | 19 routes + shell | normal 56, raised 42, flat 103, computed 12. `fullWidth` 3. `size="small"` 11: no such attribute, inert | H Fo Pr Di. No Se (library has an `activated` style, no prop). Re only through K-40. No Lo | Native button in shadow DOM: Tab, Enter, Space. `host.focus()` does nothing: no delegatesFocus | Button role from the inner element. Host `aria-pressed` ×9, `aria-expanded` ×1, `aria-label` ×1, `aria-describedby` ×1 are all lost (measured). `title` ×45 reaches no assistive tech |
| K-02 | ObcIconButton | 1 (1) | 16 routes | One call site, inside K-41 | H Fo Pr Di | Native button in shadow DOM | Host `aria-label` lost, name empty (measured). Slot text works: "Close" (measured) |
| K-03 | ObcToggleButtonGroup + Option (segmented control) | 28 (9) | 10 routes | Text options. 11 groups, 17 options | H Fo Pr Se (visual only) Di. No Re | One Tab stop per option. Arrow keys do nothing (measured) | No group role, host `aria-label` ×7 lost. Options are plain buttons with no pressed or selected state (measured). Selection is colour only |
| K-04 | ObcTextInputField | 5 (3) | /admin/*, /cpm/explorer, /cpm/performance | `label` 2, placeholder only 3, `hasClearButton` 2 | H Fo Di. Library also has `error`, `errorText`, `helperText`, `readonly`; CPA uses none | Native input in shadow DOM | Named by the `label` prop only. Host `aria-label` lost and a wrapping `<label>` does not associate: name empty on the 3 `RolesConfig` fields (measured) |
| K-05 | ObcTabRow | 4 (4) | 4 routes | `hug` on all 4 | H Fo Se (visual only) | Every tab is a Tab stop. Arrow keys do nothing (measured) | `role="tab"` with no `aria-selected`: all tabs read not selected (measured). Tablist unnamed |
| K-06 | ObcFilterChip | 3 (3) | /cpm/investigation, /cpm/performance | `showIcon` 1 | H Fo Pr Se (visual only) Di | Native button in shadow DOM | `role="checkbox"` with `aria-pressed` and no `aria-checked`: reads unchecked when checked (measured). Source of axe critical `aria-required-attr` and `aria-allowed-attr` |
| K-07 | ObcAccordionItem | 2 (2) | /cpm/evidence, /cpm/explorer, /cpm/investigation | Inside K-68 and `LoopSummaryCard` | H Fo Pr | Native button, Enter and Space | Button with `aria-expanded`, correct (measured) |
| K-08 | ObcCheckbox | 1 (1) | /admin/* | One site, rendered per permission | H Fo Se Di | Space | Host `aria-label` works. Site sets none, and the wrapping `<label>` does not associate: **every permission reads "Checkbox item"** (measured) |
| K-09 | ObcDropdownButton | 1 (1) | /cpm/performance | One site | H Fo (1 px UA ring) | Native select overlaid | Combobox with no name; no label prop and host `aria-label` lost (measured). Axe critical `select-name` |
| K-10 | ObcPagination | 1 (1) | /cpm/performance | One site, K-51 | H Fo Se Di | Seven Tab stops at 5 pages | First, previous, next and last have **no name**: the library sets `aria-label` on hosts that do not forward it. Axe critical `button-name` ×4 |
| K-11 | ObcInputChip | 1 (1) | /cpm/events | One site | H Fo Pr | Native button | Named "Remove Stale", correct (measured) |
| K-12 | ObcProgressBar | 1 (1) | /cpm/registry | Linear, indeterminate | Lo | None needed | No role; sibling `role="status"` text carries the meaning |
| K-13 | ObcStatusIndicator | 1 (1) | /login | running, alarm | n/a | None | Decorative; adjacent "Network online" text |
| K-14 | ObcAlertIcon | 1 (1) | (shell) | alarm | n/a | None | Not rendered in the slice: `!CPA_SLICE_ONLY` guard |
| K-15 | ObcValveAnalogTwoWayIcon | 1 (1) | /cpm, /cpm/explorer, /cpm/kpi | Fixed `value=50` | n/a | None | Inside `aria-hidden` icon slot |
| K-16 | Obi icons | 39 (19) | 17 routes + shell | 19 distinct | n/a | None | Decorative |
<!-- /GEN -->

<!-- GEN:b:ob -->
| ID | Component | Geometry against p.6 | Contract clause | Rating | Reason |
|---|---|---|---|---|---|
| K-01 | ObcButton | Hit 48, **painted 34** (baseline reported the hit area), radius 6, label 16 against 14. Host 48-68.4 on 28 routes | p.6 40 px, 6 px; components.md Buttons; p.7 disabled reason; p.5 focus | **Extend** | Variables alone give painted 40, hit 40, radius 6, label 14, 0 call sites changed. `::part(visible-wrapper)` gives the 3 px gap and `::part(wrapper)` a true minimum height. Every colour state reaches the shadow tree. The 12 lost ARIA attributes need wrapper changes |
| K-02 | ObcIconButton | Hit 48, painted 32, radius 6. Variables give 40 × 40 | components.md: icon-only keeps ≥ 40 px hit area and a name | **Extend** | Geometry by variable, ring by `::part(visible-wrapper)`. Naming is already solved by K-41 |
| K-03 | ObcToggleButtonGroup + Option (segmented control) | Hit 48, painted 32, radius 6. Variables give 40. 3 px gap reachable | G05 selection not by colour alone; WCAG 4.1.2; G04 | **Replace** | Selected state never reaches assistive tech, and the inner button cannot be given `aria-pressed` or a radio role from outside the shadow tree. Geometry passes; semantics cannot |
| K-04 | ObcTextInputField | Field 32, radius 6, variables give 40. Ring 2 px, gap 0, no parts exposed | p.6 inputs; components.md Inputs; p.5 focus gap | **Replace** (gap only) | Everything is reachable except the 3 px gap: no `part` on the ring box. 89 native inputs already carry the contract more cheaply |
| K-05 | ObcTabRow | Height by variable. Width fixed: `min-width: 140px` in the shadow CSS, and the published `--menu-navigation-components-tab-item-min-width` has no effect (measured) | WCAG 4.1.2; G04; G12 | **Replace** | Current tab is never exposed, no arrow navigation, 140 px floor cannot be changed. `cpm.css:820` already records the width limit |
| K-06 | ObcFilterChip | Hit 48, painted 34, variables give 40. Ring 2 px, gap 0, no parts | WCAG 4.1.2; G05 | **Replace** | Library defect: state is wrong and cannot be corrected from outside. Accounts for 6 of the 15 critical axe nodes |
| K-07 | ObcAccordionItem | Hit 48, variable gives 40. Ring 2 px, gap 0, no parts | p.5 focus gap | **Replace** (gap only) | Semantics are correct; only the gap is unreachable. Native `details` (K-22) is already used 6 times |
| K-08 | ObcCheckbox | Box 24, radius 4, hit 48. Ring 2 px, gap 0, no parts | components.md checkbox; p.5 focus gap; WCAG 4.1.2 | **Replace** (gap only) | Only the gap is unreachable. The name defect is a one-line call-site fix regardless of the rating |
| K-09 | ObcDropdownButton | Hit 48, painted 34. Variables give 40, radius 6 | WCAG 4.1.2; components.md Inputs | **Replace** | Cannot be named. 39 native selects (K-18) already do this job |
| K-10 | ObcPagination | Variables give 40. Ring 2 px, gap 0 | WCAG 4.1.2; G04 | **Replace** | Library defect, inside its own shadow tree. K-49 already exists as the alternative |
| K-11 | ObcInputChip | Hit 48, painted 34, variables give 40. Ring 2 px, gap 0, no parts | p.5 focus gap | **Replace** (gap only) | Only the gap is unreachable |
| K-12 | ObcProgressBar | Not a control | SKILL §9 Loading: labelled progress | **Adapter-fit** | The label is adjacent; only colour changes |
| K-13 | ObcStatusIndicator | Fixed in shadow CSS | G05 label present | **Adapter-fit** | Login footer only, with a text label |
| K-14 | ObcAlertIcon | n/a | components.md: alarm follows site configuration | **Adapter-fit** | Not rendered in CPA |
| K-15 | ObcValveAnalogTwoWayIcon | KPI icon | p.6 one icon set | **Adapter-fit** | Decorative, tinted by colour variable |
| K-16 | Obi icons | No intrinsic size; host sizes them | p.6 one outlined icon set, unchanged between themes | **Adapter-fit** | One set already, and tint follows `--element-active-color` |
<!-- /GEN -->

### 4.2 Native HTML

Layout elements (`div`, `span`, `p`, `section`) are not rated as components.

<!-- GEN:a:native -->
| ID | Component | Uses (files) | Routes | Variants | States | Keyboard | ARIA |
|---|---|---|---|---|---|---|---|
| K-17 | Native `<button>` | 65 (42) | 18 routes + shell | 18 base classes; 18 inline styled; 12 without `type` | Of 16 CSS families measured: focus-visible rule on 9, Di on 2, Se on 11 | Native. 6 in roving groups | `aria-label` 19, `aria-pressed` 7, `aria-expanded` 8, `aria-current` 6 |
| K-18 | Native `<select>` | 39 (22) | 16 routes | `.cpm-select` 31, `.ob-input` 8 | Fo. `disabled` on 11 sites with no disabled style. No H on `.cpm-select`. No invalid state | Native | Directly named 7 of 39; others rely on a wrapping label. Axe critical `select-name` ×4 at Calculations and Users |
| K-19 | Native `<input>` | 89 (40) | 18 routes + shell | `.ob-input` 36, `.cpm-input` 33. text 13, checkbox 10, number 7, datetime 7, search 3, file 3, password 2 | Fo, Di; Er on `.cpm-input--error` only | Native | `aria-label` 8, `aria-invalid` 2, `aria-describedby` 2 |
| K-20 | Native `<textarea>` | 7 (7) | 7 routes | `.cpm-textarea` 4 | Fo | Native | `aria-label` 1 |
| K-21 | Native `<table>` | 38 (30) | 14 routes | `.cpm-table` 23; 8 other classes; 6 unclassed | No row H, Se or Fo on `.cpm-table`. Se on `.cpm-matrix` only | 0 rows focusable on any route | Semantic table. `aria-label` 10. `scope` on 27 of 168 `th` |
| K-22 | Native `<details>` | 6 (6) | 7 routes | Plain | Open | Native | Native disclosure |
| K-23 | Field label `.cpm-field` | 57 | via host | compact 20 | n/a | n/a | Wrapping label: correct for native controls, fails for shadow inputs |
| K-24 | Links (`Link`) | 16 (13) | 17 routes | `.cpm-link` and bare | H. No own Fo rule | Native | Native link |
<!-- /GEN -->

<!-- GEN:b:native -->
| ID | Component | Geometry against p.6 | Contract clause | Rating | Reason |
|---|---|---|---|---|---|
| K-17 | Native `<button>` | Median 32, range 12-92.8 on 16 routes. Radius 0, 4, 6, 8, 999 | p.6 40 px, 6 px; components.md Buttons | **Extend** | No library in the way. Needs one shared button class set; 18 inline styles move to it |
| K-18 | Native `<select>` | 39, radius 6 on 19 routes; 36 in Admin | components.md Inputs: 40 px; `border.strong`; 3 px gap | **Extend** | 1 px short and offset 1 not 3, in one rule. Border is `--border-divider-color`, which must split from decorative dividers |
| K-19 | Native `<input>` | Median 39, range 13-81. 36 in Admin | p.6; components.md Inputs | **Extend** | Two parallel classes to merge; the contract is CSS |
| K-20 | Native `<textarea>` | Radius 6 | components.md Inputs | **Extend** | Shares the K-19 rule |
| K-21 | Native `<table>` | Rows median 52, range 32.5-115 on 9 routes against 44. Header 26.5-38.3. Cells not tabular | p.6 rows 44/40; components.md Tables; p.26 DataTable | **Extend** | Semantics are right. Needs row states, tabular numerals and density; the sorted, selectable behaviour belongs in M-06 |
| K-22 | Native `<details>` | Text | G04 | **Adapter-fit** | Native and semantic |
| K-23 | Field label `.cpm-field` | Label 12.25 against 12 | components.md: label `text.secondary` 12 px above | **Extend** | One token |
| K-24 | Links (`Link`) | Inline | components.md Link: underline on hover | **Extend** | Add the shared ring |
<!-- /GEN -->

### 4.3 CPA custom

CPA has **no toggletip**. The brief listed one, but neither `ObcToggletip` nor any custom equivalent exists in live code (K-76 is the nearest; see M-08).

<!-- GEN:a:custom -->
| ID | Component | Uses (files) | Routes | Variants | States | Keyboard | ARIA |
|---|---|---|---|---|---|---|---|
| K-25 | TonePill | 169 (74) | 16 routes | good, warn, bad, muted. No info or unknown | None (span) | None | Text always present; dot `aria-hidden` |
| K-26 | FacetPill | 5 (4) | /cpm, /cpm/explorer | 4 facets | None | None | Caption visible; hint is `title` only |
| K-27 | Pill (Admin) | 5 (2) | /admin/* | Colour by prop | None | None | Text |
| K-28 | Ne107Chip | 1 (1) | /cpm/explorer, /cpm/historical, /cpm/investigation | F, C, S, M | None | None | Code and label as text |
| K-29 | CodeLabel | 22 (5) | 5 routes | diagnosis | None | None | Text, raw code in `title` |
| K-30 | KvRow | 206 (43) | 15 routes | One | None | None | `div` pairs, not `dl` |
| K-31 | KpiCard | 7 (3) | /cpm, /cpm/explorer, /cpm/kpi | tone 4; regular, large; link, static; relevant | H Fo (link form) | Link, Enter | Delta has hidden words. Definition in `title` |
| K-32 | KpiTile and local tiles | 52 (12) | 9 routes | 7 local variants | None | None | `title` on KpiTile |
| K-33 | MetricValue | 9 (4) | /cpm/explorer, /cpm/investigation, /cpm/windows | measured, not calculated, not qualified, insufficient, n/a | Data states | None | Status text visible; reason in `title` |
| K-34 | Panel: `.cpm-surface` + PanelHead | 132 (69) | 16 routes | Head with eyebrow, title, right slot | None | None | H2 title |
| K-35 | WorkspaceHeader | 18 (17) | 16 routes | page-driven, explicit | None | None | H1 |
| K-36 | EmptyState | 112 (52) | 16 routes | title, copy, action 18, next 26 | None. Also used as a loading message (count in §6) | Buttons inside | H3. No live region |
| K-37 | QueryError | 57 (37) | 16 routes | Via K-36 | Er | Retry button | No `role="alert"` |
| K-38 | GateResultStatePanel | 4 (4) | /cpm/evidence, /cpm/explorer, /cpm/response | By state kind | Data states; disabled action | Buttons | Reason on a wrapping `title` |
| K-39 | Skeleton | 18 (4) | /cpm/evidence, /cpm/explorer, /cpm/response | lanes, evidence, result | Lo, labelled, reduced motion honoured | None | `role="status"`, `aria-busy` |
| K-40 | ReasonedButton | 19 (16) | 11 routes | As K-01 | Di Re (visible text) | Disabled button is not a Tab stop | Reason text visible, but `aria-describedby` and `aria-pressed` on the host are lost (measured) |
| K-41 | CpmIconButton | 19 (9) | 13 routes | Reason 8 | As K-02, Re | As K-02 | Name by slot text, reason appended (measured) |
| K-42 | Modal | 8 (7) | /admin/* + shell | default, danger, warning, success | Open | **Tab never reaches footer ObcButtons** (measured). Focus lost on close when the trigger is an ObcButton. Escape works | `role="dialog"`, `aria-modal`, static `dialog-title` id. Close button has an empty name |
| K-43 | FormField | 17 (4) | /admin/* + shell | hint, error, required | Er | n/a | `<label>` is not bound to its control: no `htmlFor`, control outside it |
| K-44 | Modal drawers (`.cpm-inspector--modal`) | 4 (3) | /cpm/calculations, /cpm, /cpm/performance | 560, 760 px, centred | Open | **No trap: Tab reaches the page behind** (measured). `aria-modal` overstates it. Escape works | `role="dialog"`, `aria-modal`, label |
| K-45 | Dialogs (`.cpm-modal`) | 4 (2) | /cpm/registry, /cpm/response | Up to 860 px | Open | As K-44: no trap. `ModelReviewDialog` skips the hook: no Escape and no focus return either | `role="dialog"`, `aria-modal` |
| K-46 | Docked side panels | 5 | via host | Gate guide, Explain, Explorer rail | Collapsed | Buttons | Some labelled |
| K-47 | EffectiveConfigDrawer | 3 (3) | /cpm/evidence, /cpm/explorer, /cpm/registry | One | Lo | In page flow | Section, not a dialog |
| K-48 | CommandPalette | 1 (1) | (shell) | nav, loop, calc | Active row | Ctrl+K, arrows, Enter, Escape. No trap or focus return | `role="dialog"` only; no combobox or listbox |
| K-49 | ListPager | 1 (1) | /cpm/kpi | 1 live use; 6 other files page by hand, plus K-10 | Di Re (`title`, mouse only) | Buttons | No `nav` landmark |
| K-50 | SortHeader | 3 (2) | /cpm/calculations, /cpm/events | asc, desc | H Fo Se | Button | Name states the order; `aria-sort` not used |
| K-51 | GateMatrix | 1 (1) | /cpm/performance | Grid with tiers | H Fo Se | Roving tabindex, arrows, Home, End | `role="grid"`, rowcount, gridcell |
| K-52 | GateMatrixChecks | 3 (2) | /cpm/performance | Per check | None | Read only | Table |
| K-53 | PriorityQueue rows | 1 (1) | /cpm | 6 rows | H Fo Se | Row click pointer only; inner buttons keyboard | `div` row. `aria-pressed` on a native preview button works |
| K-54 | AttentionList rows | 1 (1) | /cpm/performance | Ranked | H Fo Se | Inner buttons | `ol > li`, semantic |
| K-55 | Other record lists (6 sites) | 6 (6) | /cpm, /cpm/calculations, /cpm/events, /cpm/governance, /cpm/windows, /cpm/registry | Calculations, Events, Governance, Windows, Registry, Overview trail | H Se on `.cpm-event-row` | 3 `role="button"` rows; 1 pointer row with an inner button; 2 not interactive | `div` grids with hand-set columns |
| K-56 | LoopCombobox | 8 (8) | 9 routes | Scoped | Se, H by cursor | Arrows, Enter, Escape | Full combobox and listbox |
| K-57 | PlantScopeFilter | 14 (14) | 15 routes | Site, area, unit | As K-18 | Native | Labelled selects |
| K-58 | LoopTree | 1 (1) | /cpm/explorer | Grouped | H Fo Se | Every row a Tab stop | `aria-expanded`, `aria-current`; no tree role |
| K-59 | LoopContextBar | 10 (9) | 9 routes | One | None | Links | `role="region"`, labelled |
| K-60 | Sidebar | 1 (1) | (shell) | Groups, sub-groups | H Se. No own Fo rule | Buttons | Nav items are buttons with no `aria-current` |
| K-61 | Top bar | 1 (1) | (shell) | Inline in `App.tsx` | None | Buttons | No `header` landmark |
| K-62 | Theme switch | 1 (1) | (shell) | Three inline buttons: day, bright, night | Se by colour | Buttons | No `aria-pressed` |
| K-63 | Wizard stepper | 2 | via host | active, done | Se. No own Fo rule | Buttons | Current step by colour only |
| K-64 | TimeRangeBar | 2 (2) | /cpm/explorer, /cpm/historical | Presets, custom, step, Now | As K-03 | As K-03 | Inherits K-03 |
| K-65 | TrendTimeBar | 1 (1) | /trend | Step, play, live | Di | Buttons | `title` only |
| K-66 | WindowKindToggle | 7 (7) | 7 routes | 12 h, 24 h | As K-03 | As K-03 | Inherits K-03 |
| K-67 | ChartZoomBar | 8 (8) | 9 routes | Zoom, undo, reset | Di with `title` | Buttons | `role="group"`. `aria-pressed` lost |
| K-68 | CollapsibleSection | 10 (3) | /cpm/evidence, /cpm/investigation | Remembered | Open | As K-07 | As K-07 |
| K-69 | ActionReceipt | 3 (3) | /cpm/events, /cpm/registry | ok, failed | Er | None | `role="status"`, `role="alert"` |
| K-70 | CopyableId | 6 (4) | 4 routes | Truncated | Copied | K-41 | `role="status"` |
| K-71 | ConnectivityBanner | 1 (1) | (shell) | By health | Er | Button | `role="status"` |
| K-72 | Toast (react-toastify) | 1 (1) | (shell) | 16 calls, Admin and App | Auto-dismiss 3 s | Library | Library |
| K-73 | SelectionSummary | 3 (3) | /cpm/calculations, /cpm/evidence, /cpm/investigation | Open, closed | Open | Button | `aria-expanded` lost on ObcButton (measured) |
| K-74 | GateLegend | 3 (3) | /cpm/evidence, /cpm/explorer, /cpm/performance | One | None | None | Glyph and word |
| K-75 | Gate chip strips | 3 (3) | /cpm/evidence, /cpm/explorer, /cpm/windows | 3 implementations | H Fo Se Di | Arrows | `aria-current`, full names |
| K-76 | Help disclosure `.cpm-help-toggle` | 2 | via host | Only inline help in CPA | H Fo | Button | `aria-expanded`, `aria-controls` |
| K-77 | Error and loading shells | 11 (2) | (shell) | 4 | Lo Er | n/a | Text |
<!-- /GEN -->

<!-- GEN:b:custom -->
| ID | Component | Geometry against p.6 | Contract clause | Rating | Reason |
|---|---|---|---|---|---|
| K-25 | TonePill | Radius 999, padding 2/10, 13 px. Contract radius 6, 12 px | components.md Badges; p.26 StatusBadge; p.4 mapping | **Extend** | One rule fixes geometry. Tone set must gain info and unknown; call-site mapping waits on Q6 |
| K-26 | FacetPill | As K-25 | SKILL §4 separate fields; p.6 accessible help | **Extend** | The separate-fields idea matches the contract. Hint must leave `title` |
| K-27 | Pill (Admin) | Radius 999, 11 px, inline | G02; components.md Badges | **Extend** | Duplicate of K-25; inline style with a colour prop |
| K-28 | Ne107Chip | Code not in a 20 px square | components.md Diagnostic chip; SKILL §5 | **Extend** | Code plus label already; shape and `diag.*` fills change |
| K-29 | CodeLabel | Inline | p.6 identifiers | **Adapter-fit** | Plain text |
| K-30 | KvRow | 13 px, padding 6. Not tabular | p.6 tabular values, 14 px body | **Extend** | One rule covers 206 uses |
| K-31 | KpiCard | Padding 12/14, radius 10, 3 px start edge, value 22.4-28. Contract 20, 12 | p.6 panel; p.6 accessible help; p.26 MetricSummary units, coverage | **Extend** | Good base with a real link. Needs a coverage line and a non-hover definition |
| K-32 | KpiTile and local tiles | Padding 14/16, radius 8 | p.26 MetricSummary | **Extend** | Seven near-duplicates to fold into K-31 or M-06 |
| K-33 | MetricValue | Inline | SKILL §9; G06 | **Extend** | Right model. Reason needs a keyboard path |
| K-34 | Panel: `.cpm-surface` + PanelHead | Padding 16 (others 8/6, 8/0, 0), radius 8, title 14.7. Contract 20, 12, 18 | p.6 panel; components.md Panels | **Extend** | One rule set. 107 surfaces use the class |
| K-35 | WorkspaceHeader | Title 19.6, 700. Contract 24 | p.6 type | **Extend** | One rule |
| K-36 | EmptyState | Padding 32/16 | SKILL §9 Empty: filter reset; Loading: skeleton | **Extend** | The shape fits. A filter-reset action is missing at sites, and the loading uses should become K-39 |
| K-37 | QueryError | As K-36 | SKILL §9 retry | **Adapter-fit** | All 57 uses pass `retry`, and each panel fails alone |
| K-38 | GateResultStatePanel | Panel | p.7 disabled reason | **Extend** | Disabled reason is mouse-only |
| K-39 | Skeleton | Radius 8 | components.md Skeletons: `surface.raised` | **Extend** | Built right, but on few pages. Background token changes; the K-36 loading uses adopt it |
| K-40 | ReasonedButton | As K-01 | p.7 disabled reason; p.6 | **Extend** | Best pattern in CPA for sighted users. Needs the reason in the name, as K-41 does |
| K-41 | CpmIconButton | Hit 48 | components.md icon-only | **Adapter-fit** | Already meets the clause. Geometry follows K-02 |
| K-42 | Modal | Radius `--hmi-radius`, overlay not page at 60 % | components.md Dialogs; WCAG 2.1.1, 2.4.3; G04 | **Extend** | CPA-owned. `querySelectorAll` cannot see shadow buttons: one function to fix. Live defect |
| K-43 | FormField | Text | WCAG 1.3.1, 3.3.2; components.md Inputs | **Extend** | CPA-owned; wrap or bind the control |
| K-44 | Modal drawers (`.cpm-inspector--modal`) | Radius 8. Centred, not edge-anchored | components.md Dialogs; p.6 inspector drawer; p.7 selection updates main view and inspector | **Extend** | Shell and hook are CPA-owned, and this becomes the below-1280 form of M-07 |
| K-45 | Dialogs (`.cpm-modal`) | Radius 10, padding 20 | components.md Dialogs | **Extend** | Same hook fix as K-44; duplicates K-42 |
| K-46 | Docked side panels | Width varies by page; baseline did not measure | p.6 inspector 320-400 | **Extend** | Closest things to an inspector, but no shared component |
| K-47 | EffectiveConfigDrawer | In flow | p.6 inspector | **Extend** | Named a drawer but is an in-page panel |
| K-48 | CommandPalette | 560 px, radius 10 | SKILL §7 header search; G03 | **Extend** | Engine is reusable behind the M-02 field. Needs combobox ARIA |
| K-49 | ListPager | Inline style. `size="small"` inert | G04; G12 | **Extend** | Becomes the one pager, replacing K-10 |
| K-50 | SortHeader | Padding 2/4: 22.4 high | p.26 DataTable sorting | **Extend** | Sound pattern; add `aria-sort` and move into M-06 |
| K-51 | GateMatrix | Rows 71.3-77 against 44. Header 26.5 | p.6 rows; WCAG 4.1.2 | **Extend** | Best keyboard model in CPA. Density only |
| K-52 | GateMatrixChecks | Table | components.md Tables | **Extend** | Follows K-21 |
| K-53 | PriorityQueue rows | Rows 106-107 against 44 | p.26 DataTable; CPA01 ranked overview; p.5 keyboard access to rows | **Replace** | A record list with sortable attributes needs a table. No shared component exists (M-06) |
| K-54 | AttentionList rows | Rows 60 | p.26 DataTable | **Replace** | As K-53 |
| K-55 | Other record lists (6 sites) | Rows 60.4-118 on the 4 measured routes | p.26 DataTable; p.6 tables in own scroll region | **Replace** | No row, column or header semantics; needs M-06 |
| K-56 | LoopCombobox | 39 × 300 min | p.26 AssetPicker | **Extend** | Strongest custom control. 1 px and ring offset only |
| K-57 | PlantScopeFilter | 39 | p.6 header plant selector; G03; G07 | **Extend** | Logic and URL scope are reusable; on 14 pages it must move into M-01 |
| K-58 | LoopTree | Max 62vh | p.26 AssetPicker; p.5 | **Extend** | Works; arrow keys would shorten long Tab paths |
| K-59 | LoopContextBar | Sticky | G07 | **Adapter-fit** | Carries loop and period |
| K-60 | Sidebar | 220 pass. Collapses fully, no 64 px rail | p.6; components.md Navigation; G03 | **Extend** | Styles and `aria-current` are small. Rail and module order wait on Q4 |
| K-61 | Top bar | 64 pass. 4 of 5 contract slots absent | p.6 header; components.md Navigation; G03 | **Replace** | Contract needs slots that do not exist (M-01 to M-04); inline styles throughout |
| K-62 | Theme switch | Text, 12 px | components.md Theme switch: ghost icon, sun and moon, `aria-pressed` | **Replace** | Contract is a two-state icon control. Bright waits on Q3 |
| K-63 | Wizard stepper | Radius 999 | G05 | **Extend** | Needs `aria-current="step"` |
| K-64 | TimeRangeBar | As K-01 | p.6; G03; p.7 time zone shown | **Extend** | Right behaviour; swap inner K-03. Header placement waits on Q5 |
| K-65 | TrendTimeBar | 13-21 high, 11 px | p.6 40 px; G03 | **Extend** | Should reuse K-64 |
| K-66 | WindowKindToggle | As K-03 | G05 | **Extend** | One file; inherits the K-03 replacement |
| K-67 | ChartZoomBar | As K-01 | p.28 show actual plotted zoom window | **Extend** | Needs the zoomed time range as text |
| K-68 | CollapsibleSection | Panel | p.5 | **Extend** | One file; inherits K-07 |
| K-69 | ActionReceipt | Inline | p.7 visible save result | **Adapter-fit** | Meets the clause |
| K-70 | CopyableId | As K-41 | p.6 identifiers | **Adapter-fit** | Built on K-41 |
| K-71 | ConnectivityBanner | Banner | SKILL §9 | **Adapter-fit** | Text, status role, retry |
| K-72 | Toast (react-toastify) | Library theme | components.md Toasts: 3 px start bar, icon and text, named dismiss | **Extend** | Library exposes CSS variables and class hooks |
| K-73 | SelectionSummary | As K-01 | WCAG 4.1.2 | **Extend** | Open state is not exposed |
| K-74 | GateLegend | Text | G05 | **Adapter-fit** | Shape and word together |
| K-75 | Gate chip strips | Min 32, radius 6 | p.6 40 px | **Extend** | Good model; 32 to 40 and merge |
| K-76 | Help disclosure `.cpm-help-toggle` | Radius 999 | p.6 accessible help | **Extend** | The seed of M-08 |
| K-77 | Error and loading shells | n/a | SKILL §9 | **Adapter-fit** | Text states |
<!-- /GEN -->

### 4.4 Charts

C1 to C11 are echarts, C12 to C17 are CSS bars, numbered as in Baseline §5. The skill's chart contract assumes recharts, which cannot apply to canvas (Baseline §5.7). The clause rated here is its intent, so the library is not itself a gap. No echarts chart needed a Replace: every visual clause is reachable through options. What is missing is a shared frame (M-09) and the value table (M-05).

<!-- GEN:a:chart -->
| ID | Component | Uses (files) | Routes | Variants | States | Keyboard | ARIA |
|---|---|---|---|---|---|---|---|
| K-78 | C1 SignalTrend | 4 (3) | /cpm, /cpm/explorer, /cpm/investigation | Line | Tooltip, zoom | None | None |
| K-79 | C2 Historical chart | 1 (1) | /cpm/historical | Lines, overlay, mode lane | Tooltip, zoom | None | None |
| K-80 | C3 ReplayChart | 1 (1) | /cpm/replay | Time, phase plane | Tooltip, zoom | None | Range input labelled |
| K-81 | C4 CpmChart | 38 (11) | /cpm/evidence, /cpm/explorer, /cpm/response | Lanes | Tooltip, zoom | CSV button | None |
| K-82 | C5 Trajectory | 3 (2) | /cpm/evidence, /cpm/explorer | Phase plot | Tooltip, zoom | None | None |
| K-83 | C6 IntervalLane | 7 (4) | /cpm/evidence, /cpm/explorer | Lane | Tooltip, zoom | None | None |
| K-84 | C7 HealthLane | 1 (1) | /cpm/investigation | Lane | Tooltip, zoom | None | `role="img"` label |
| K-85 | C8 G13 interaction | 1 (1) | /cpm/evidence | Two panes | Tooltip, zoom | None | Labelled table beside it |
| K-86 | C9 KpiTrendChart | 1 (1) | /cpm/kpi | Bars, svg renderer | Tooltip, zoom | Click pointer only | None |
| K-87 | C10 Pipeline chart | 1 (1) | /cpm/pipeline | Bars, lines | Tooltip, zoom | None | None |
| K-88 | C11 TrendCore | 1 (1) | /trend | Multi-pen | Tooltip, zoom | Zoom buttons | None |
| K-89 | C12 Sample density | 1 (1) | /cpm/windows | Normal, sparse, empty | None | None | `role="img"` summary |
| K-90 | C13 GateRollup | 1 (1) | /cpm/performance | Warn, bad | None | Buttons | Full counts in the name |
| K-91 | C14 OperatingPicture bar | 1 (1) | /cpm | Segments and legend | None | None | `role="img"`, legend with counts |
| K-92 | C15 GoodErrorBar | 1 (1) | /cpm | Tone by value | None | None | Visible "% in band"; hint in `title` |
| K-93 | C16 Meter | 1 (1) | /cpm/kpi | Fill, threshold | None | None | `aria-hidden`; value in the row |
| K-94 | C17 ScoreBar | 2 (1) | /cpm/investigation | Normal, high | None | None | Value is text |
<!-- /GEN -->

<!-- GEN:b:chart -->
| ID | Component | Geometry against p.6 | Contract clause | Rating | Reason |
|---|---|---|---|---|---|
| K-78 | C1 SignalTrend | n/a | p.5 charts; components.md Charts; §5.7 | **Extend** | Options, plus M-05 and M-09 |
| K-79 | C2 Historical chart | n/a | p.5 charts; components.md Charts; §5.7 | **Extend** | Mode and overlay gaps bridged; site zone mismatch |
| K-80 | C3 ReplayChart | n/a | p.5 charts; components.md Charts; §5.7 | **Extend** | Three clocks in one chart |
| K-81 | C4 CpmChart | n/a | p.5 charts; components.md Charts; §5.7 | **Extend** | 5 charts ignore theme changes; this one has 38 uses |
| K-82 | C5 Trajectory | n/a | p.5 charts; components.md Charts; §5.7 | **Extend** | Theme hook, violet not AI |
| K-83 | C6 IntervalLane | n/a | p.5 charts; components.md Charts; §5.7 | **Extend** | Theme hook; 3.74:1 ticks |
| K-84 | C7 HealthLane | n/a | p.5 charts; components.md Charts; §5.7 | **Extend** | Theme hook |
| K-85 | C8 G13 interaction | n/a | p.5 charts; components.md Charts; §5.7 | **Extend** | Theme hook |
| K-86 | C9 KpiTrendChart | n/a | p.5 charts; components.md Charts; §5.7 | **Extend** | Neutral at 0.55: 2.36:1 |
| K-87 | C10 Pipeline chart | n/a | p.5 charts; components.md Charts; §5.7 | **Extend** | Zero-fills gaps |
| K-88 | C11 TrendCore | n/a | p.5 charts; components.md Charts; §5.7 | **Extend** | PV in alarm colour; gaps joined; SP solid |
| K-89 | C12 Sample density | n/a | p.5 3:1; G05 | **Extend** | Empty at 0.25 opacity fails after the bridge |
| K-90 | C13 GateRollup | n/a | p.5 3:1; G05 | **Adapter-fit** | Count is text. 1.03:1 clears once caution maps to `status.warning.fg` |
| K-91 | C14 OperatingPicture bar | n/a | p.5 3:1; G05 | **Extend** | Opacity 0.55 must go |
| K-92 | C15 GoodErrorBar | n/a | p.5 3:1; G05 | **Adapter-fit** | Value is text |
| K-93 | C16 Meter | n/a | p.5 3:1; G05 | **Adapter-fit** | Passes at 8.40:1 |
| K-94 | C17 ScoreBar | n/a | p.5 3:1; G05 | **Adapter-fit** | Value is text |
<!-- /GEN -->

## 5. Comparison with the target contracts

| Contract | Source | CPA today | Gap | Verdict |
|---|---|---|---|---|
| Buttons | p.6; components.md Buttons; p.7 | K-01, K-02, K-17, K-40, K-41 | Painted 34; native median 32, range 12-92.8; 5 radii. No Destructive, Accent or Link variant. Disabled reason only through K-40 | Reachable: variables and parts on K-01, one class set on K-17 |
| Inputs | p.6; components.md Inputs | K-04, K-19, K-20, K-23, K-43 | Median 39, 36 in Admin. Two classes. Offset 1, not 3. Hover and read-only states absent | Reachable on native. K-04 gap only |
| Select | components.md Inputs | K-18, K-09 | 39 against 40. Decorative border token. Invalid state absent | Reachable on native. K-09 replaced |
| Table | p.6; components.md Tables; p.26 DataTable | K-21, K-50, K-51 and K-53 to K-55 | Rows 32.5-115, median 52. Cells not tabular. 0 rows focusable. 8 record lists are not tables | Styling reachable. **DataTable does not exist** (M-06) |
| Badge, status chip | components.md Badges; p.4; p.26 | K-25 to K-28 | Radius 999 against 6; 13 px against 12. No info or unknown tone. Three implementations | Reachable. Mapping waits on Q6 |
| KPI card | p.6 panel; p.6 help; p.26 MetricSummary | K-31, K-32 | Radius 10, padding 12/14. Definition in `title`. No coverage line. 7 near-duplicate tiles | Reachable |
| Inspector panel | p.6; p.7 | K-46, K-44 | No shared component. Modal drawers block the main view, which p.7 forbids: "Selections update the main view and inspector together" | **Does not exist** (M-07) |
| Dialog | components.md Dialogs | K-42, K-45, K-48 | Trap fails on shadow buttons. Unnamed close. Overlay colour. 2 shells | Reachable: CPA-owned code |
| Drawer | components.md Dialogs; p.6 | K-44, K-47 | No trap. Centred 560-760, not edge-anchored. K-47 is not a drawer | Reachable: CPA-owned code |
| Toast | components.md Toasts | K-72 | Library theme, no start-edge bar | Reachable: 41 `--toastify-*` variables |
| Tabs | WCAG 4.1.2; G04 | K-05 | No current-tab state, no arrows, 140 px floor | **Replace** |
| Segmented control | G05; WCAG 4.1.2 | K-03, wrapped by K-64, K-66 | Selection is colour only | **Replace** |
| Toggletip | p.6: definitions in accessible help | None. 567 `title` attributes in 134 files | Baseline: 4,393 words mouse-only. ObcToggletip is not a working control (§3.4) | **Does not exist** (M-08) |
| Empty state | SKILL §9 | K-36 | Shape fits. No filter-reset action at sites; 36 of 112 uses are loading messages | Reachable |
| Skeleton | components.md Skeletons | K-39 | Well built, labelled, honours reduced motion, but used in few places and on the wrong token | Reachable |
| Data-state overlay | SKILL §9: Partial, Stale, Bad quality | K-33, K-38 per cell or panel | Nothing keeps a last value in place with a Stale label over a panel | **Does not exist** (M-10) |
| Chart frame with value table | p.5; p.26 TrendPanel | Each of 11 charts alone | No shared units, zone, source or coverage. No synchronised cursor. No value table | **Does not exist** (M-05, M-09) |
| Time selector | p.6; G03; p.7 | K-64, K-65, K-66, per page | Good behaviour, but no header control, 3 implementations, K-65 at 13-21 px high | Header control **does not exist** (M-03) |
| Plant selector | p.6; G03; G07 | K-57 on 14 pages | Logic and URL scope sound, but per page, not in the header | Header control **does not exist** (M-01) |

## 6. Findings in CPA's own use of OpenBridge

| # | Finding | Evidence | Effect |
|---|---|---|---|
| 1 | `size="small"` on ObcButton has no effect | 11 sites. `size` is not an attribute of `obc-button` in `custom-elements.json`. Probe `b-size` measures identical to the default | Authors believe buttons are compact; none are |
| 2 | 11 CSS rules target a part that does not exist | `styles/hmi-dialogs.css:298-1229` use `::part(button)`. ObcButton's parts are `wrapper`, `visible-wrapper`, `label`, `icon`, `leading`, `trailing` | Dead CSS, and it reads as if dialog buttons are styled |
| 3 | 3 custom properties are consumed by nothing | `--obc-button-text-color`, `-background`, `-border` at `hmi-dialogs.css:263-265` | Same |
| 4 | Parts and variables are undocumented | `custom-elements.json` lists 2 CSS parts and 0 CSS properties across all 229 components, though the source exposes many | Conflicts with the project rule "if it isn't in the manifest, it doesn't exist". See §8.4 |
| 5 | 36 of 112 EmptyState uses are loading messages | `progressEmptyStates` in the inventory, 24 titles in 27 files | G06: loading reads as empty, with no skeleton |
| 6 | Six other files hand-roll paging | K-49; ListPager has 1 live use, and `obc-pagination` is a seventh approach | G03 consistency |

## 7. Guide components CPA does not have

| ID | Component | Contract | Nearest existing | Note |
|---|---|---|---|---|
| M-01 | Header plant selector | p.6; G03; G07; p.26 AppShell | K-57, K-56 | Move scope logic into the header |
| M-02 | Header search, "Search assets, tags and records" | p.6; G03 | K-48 engine | No visible field today; Ctrl+K has no on-screen hint |
| M-03 | Header time range | p.6; G03 | K-64 | Blocked on Q5: a free range cannot recompute a fused verdict |
| M-04 | Environment indicator | p.6; Accent outline button | None | grep finds nothing |
| M-05 | Value table for charts | p.5 | K-81's CSV export only | `CpmChart:229-230` records its removal |
| M-06 | DataTable replacing div lists | p.26; p.6; p.5 | K-21, K-50 | 8 record-list sites, rows 60-118 px |
| M-07 | Inspector pattern | p.6; p.7 | K-46, K-44 | 320-400 px, persistent; drawer below 1280 |
| M-08 | Toggletip or definition help | p.6 | K-76 | Reached by keyboard; replaces `title` on definitions |
| M-09 | Chart frame (TrendPanel) | p.5; p.26 | K-67 | Units, zone, source, aggregation, coverage, cursor sync, keyboard alternative |
| M-10 | Data-state overlay | SKILL §9 | K-33 | Partial, Stale and Bad quality around a retained value |
| M-11 | 64 px rail and module order | p.6 | K-60 | Blocked on Q4 |
| M-12 | Traverse logo | p.6; G03 | Text only | |
| M-13 | Segmented control and tabs | §3.4 | K-49, native buttons | Replacements for K-03 and K-05 |
| M-14 | Destructive, Accent, Link button variants | components.md | None | Variables, not new components (§3.3) |

## 8. CD1 re-test

### 8.1 What held and what did not

| CD1 assumption | Result | Evidence |
|---|---|---|
| Colour can be bridged without changing components | **Holds** | §3.3: exact values in all states |
| OpenBridge variables can carry Traverse semantics | **Holds, per component** | Scoped remap works; global remap would collide, since `--border-divider-color` is both decoration and control boundary |
| A colour bridge is the whole adapter | **Fails** | Geometry, focus and semantics all need more. See the Adapter-fit count in §1 |
| OpenBridge components can stay | **Holds for ObcButton and passive parts, fails for 9 types** | §3.1, §3.2, §3.4 |
| OpenBridge is CPA's component layer | **Mostly not** | Only ObcButton is used at scale. CPA is already mostly native and custom |

Guide p.26 step 1 allows this outcome: "Map the existing React, TypeScript and OpenBridge components to these roles through a shared adapter **where needed**."

### 8.2 Options, sized by occurrence

<!-- GEN:cd1 -->
| Option | JSX uses replaced | Files touched | OpenBridge uses left | Contract result |
|---|---|---|---|---|
| A. Keep everything, adapter only | 0 | 0 | 264 + 39 icons | **Cannot pass.** 46 uses stay outside the contract, 37 of them with name, role or state failures. 11 of 15 critical axe nodes remain |
| B1. Replace the hard failures | 37 (14.0 % of OpenBridge uses) | 15 | 227 + 39 icons | Passes if the Lead waives the 3 px gap on 9 uses. Removes all 11 critical nodes |
| **B2. Replace hard and gap-only** | **46** (17.4 %) | **19** | **218 + 39 icons** | **Passes.** ObcButton stays, behind variables and parts |
| C. Replace wholesale | 303 (264 + 39 icons, 19 icon types) | 102 | 0 | Passes. Also ends the shadow-DOM workarounds, at 6.6 times B2's edits |
<!-- /GEN -->

Every option needs the colour bridge for what stays, and CPA-owned Extend work such as panels and tables. A, B1 and B2 also need the Modal and hook fix and the 12 lost ARIA attributes on ObcButton; C gets those free, because a native button is visible to `querySelectorAll` and takes ARIA directly. Wrappers shrink B's edits: K-66 hides 7 call sites and K-68 hides 10 behind one file each.

### 8.3 Result

**Recommendation: option B2, or B1 if the Lead waives the 3 px gap for the gap-only band.**

- **Against A:** it cannot pass. Selected state, current tab and button names cannot be reached from outside the shadow tree, and those are WCAG 4.1.2 Level A failures, not style.
- **Against C:** it is not needed for any contract clause. ObcButton passes with zero call-site changes for geometry, so C touches 102 files, 83 for ObcButton alone, on a live plant for no conformance gain. Its real benefit is ending the shadow-DOM workarounds in §3.4 and §3.5, and it removes the dependency on undocumented variables. That is a fair argument, but those workarounds are one function, one hook and 12 attributes.
- **For B:** it spends edits only where the contract cannot otherwise be met, and those few uses hold 11 of the 15 critical axe nodes. Native replacements have precedent: 200 native controls already exist, so B adds no new dependency.

### 8.4 What the owner must settle

| Item | Why | Links |
|---|---|---|
| **Amend the OpenBridge rule** | CLAUDE.md requires OpenBridge components and icons. B replaces some with native HTML, and the adapter depends on parts and variables absent from the manifest, which that rule treats as non-existent | Baseline Q1 |
| **Waive or keep the 3 px gap** | Decides B1 or B2. The ring is visible either way | Lead |
| **Guard the adapter** | Variables and parts are undocumented, so a package upgrade could silently remove them. The range is `^1.0.1`, held by the lock file. Pin it, and re-run the probe before any upgrade | Release discipline, acceptance.md |
| **Fix the three live defects first** | They do not depend on any decision here | §1 |

**What would change this recommendation:** an OpenBridge upgrade that drops the variables or parts, which would move ObcButton to Replace and make C the cheapest path; or an upstream fix for the §3.4 library defects, which would move those 5 types to Extend.

## 9. Files and rebuild

```
node docs/theme/tools/source-inventory.mjs        # existing: the live file set
node docs/theme/tools/component-inventory.mjs     # JSX counts
node docs/theme/tools/obc-internals.mjs           # OpenBridge parts, slots, geometry
node docs/theme/tools/component-states.mjs        # live CSS states
node docs/theme/tools/obc-fit-probe.mjs           # browser measurements; no server needed
node docs/theme/tools/component-fit-render.mjs    # fills the generated blocks here
```

Ratings live in `docs/theme/tools/lib/component-ratings.mjs`. Data: [component-inventory.json](data/component-inventory.json), [openbridge-internals.json](data/openbridge-internals.json), [component-states.json](data/component-states.json), [openbridge-fit-probe.json](data/openbridge-fit-probe.json), [component-fit.json](data/component-fit.json).
