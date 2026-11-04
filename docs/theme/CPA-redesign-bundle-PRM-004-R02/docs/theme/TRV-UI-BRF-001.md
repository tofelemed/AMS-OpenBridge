# Traverse UI Programme — Context Brief

| Field | Value |
|---|---|
| Document ID | TRV-UI-BRF-001 |
| Revision | R03 (supersedes R02 of 2026-11-04) |
| Date | 2026-11-04 |
| Scope | Migration of the Traverse suite frontends (Instrumental, CPA, then the other modules) to the Traverse design system with Day and Night modes |
| Owner | Tofel |

**R03 change summary.** The CPA deep analysis (CPA-UI-PRM-003) has been reviewed, with the redesign decisions recorded in CPA-UI-DEC-002 R01. The redesign is specified in CPA-UI-SPEC-001 R01 (seven destinations) and is to be delivered by CPA-UI-PRM-004 R02, which supersedes CPA-UI-PRM-002. §1.3 now reflects CD1 as amended (option B2). §5 records the CPA status, and §7 lists the new files.

**R02 change summary.** The CPA analysis has been reviewed and its decisions recorded in CPA-UI-DEC-001 R01. §1.3 now carries a CPA exception: OpenBridge components remain as CPA's component layer, while Traverse supplies all values. §2 notes the stack-specific mechanism for non-Next.js modules. §5 records the CPA status, and §7 lists the new files.

Read this brief at the start of any chat in this project. It records the authority chain, the decisions already taken, the working method, and the current status, so that work on a new module starts from the same baseline as Instrumental.

---

## 1. Authority and precedence

1. **Traverse UI Design and Development Guide R01** (Lead, 04 Nov 2026, 30 pages). This is the design authority. Its own order of precedence applies: the exact tokens and written rules first, then the page requirements and the corrections on p.28, and the concept images last, for hierarchy and density only. Never sample a colour, size or spacing from an image.
2. **`traverse-design-system` skill, R1.2** (files under `traverse-design-system/` in this project). This is a transcription of guide pp.3–7, verified by `contrast.py`: 74 hex values compared with 0 mismatches, 126 pairings with 121 passing, and the guide's 4.587:1 minimum reproduced. Where the skill and the PDF disagree, the PDF wins.
3. **`openbridge` skill.** Used for principles only: token discipline, plus the ISA-18.2 / IEC 62682 alarm-state semantics. No OpenBridge packages, components, `data-obc-theme` or `obi-*` icons are introduced in the Traverse web frontends. **CPA exception (CPA-UI-DEC-001 CD1):** CPA is built on OpenBridge web components, so `ObcButton`, the passive OpenBridge parts and the `Obi*` icons remain behind a bridge that supplies Traverse colours, geometry variables and two `::part` rules. As amended by CPA-UI-DEC-002 RD2 (option B2), the nine OpenBridge types that cannot meet the WCAG name, role, state and focus contracts (46 uses) are replaced with CPA components. `data-obc-theme` is kept only as an internal attribute set together with `data-theme`. No OpenBridge value appears on a themed surface, and `@oicl/openbridge-webcomponents` is pinned to 1.0.1.
4. **Lead's token package** (tokens JSON and CSS, guide p.30). Not received yet. When it arrives, reconcile names and values; the package then becomes authoritative.

## 2. Design-system decisions (apply to every module)

| Topic | Decision |
|---|---|
| Themes | `day` and `night`. Day is the initial default. The choice persists across modules. No third theme (CPA's Bright is removed and migrated to Day). |
| Mechanism | `data-theme="day\|night"` on `<html>`. **Next.js modules:** next-themes with `attribute="data-theme"`, `themes={["day","night"]}`, `defaultTheme="day"`, `enableSystem={false}`, and **no `value` map**. A value map combined with a `defaultTheme` outside the theme list removes the attribute. **Other stacks (CPA: React/Vite):** keep the existing theme context and add no dependency; a blocking `<head>` script sets the attribute before first paint. |
| Saved choice | Keep the existing storage key. A blocking `<head>` script migrates stored `dark`→`night`, `light`→`day` and `bright`→`day` once. Users with no stored choice get Day; record this in the release note. |
| Tokens | `--traverse-*` variables are defined only in the token file. Components never use hex, `rgb()`, `oklch()` or Tailwind palette classes. |
| Colour vs geometry | `tokens.css` and `shadcn-bridge.css` change **colour only**. Root font-size, font family, `--radius` and scrollbar width/radius live in the optional `shadcn-bridge.geometry.css`, which is applied only in an approved layout package. |
| Bridge | **shadcn modules:** the shadcn bridge aliases shadcn variables to Traverse tokens and re-points the Tailwind `dark` variant to `[data-theme="night"]`, so `components/ui/*` works unchanged. **CPA:** `openbridge-bridge.css` assigns the OpenBridge and app variables from Traverse tokens (CPA-UI-PRM-002 §5.2). |
| Success colour | Only for a recorded verified or completed outcome (sync "Success", "Completed"). Not for Active, Connected, Comm OK, Good, Acked or a passed check. |
| Info | In progress, Available, Active, Connected, Comm OK, Live, acknowledgement badges, a hypothesis (suspected or detected finding). |
| Warning | Pending, Needs review, Incomplete, Stale, Condition open. |
| Unknown | Not checked, Unassigned, Missing, Unavailable, No comm, Disconnected, Inactive account, Not evaluated. |
| Neutral badge | Composed from existing tokens (bg-muted, text-muted-foreground, border-border). Used for roles, source types, tags, criticality, severity numbers, priority and "Last 30 days"-type labels. |
| Violet | Only for labelled AI content. `chart.series.2` is violet and is therefore reserved for AI series. |
| NE107 | F `#D92D45`/white, C `#F79B4A`/`#152238`, S `#F7D75C`/`#152238`, M `#79B6FF`/`#152238`. Fixed across themes. The code is always shown with its label. Labels follow the guide ("Maintenance required" is a source alias). Unknown is availability, not a fifth category. Normal is neutral: no chip, no green. |
| Normal in charts | Donut and bars: `surface.raised` fill with a thin `border.strong` edge. Timelines: no Normal segments when the API only returns non-OK episodes, because filling gaps would imply health. |
| Alarm / severity | No automatic priority→colour mapping (guide p.4); severity shows as neutral text. Any colour must come from the configured site alarm philosophy. |
| Containers | State never colours a card border or a row container; state lives in the badge. Card icons and KPI values are neutral; out-of-target uses danger only with a label and a configured threshold. |
| Selection | `surface.selected` background, `action.primary` text, 3 px start-edge indicator. The same rule applies to navigation, tabs and segmented controls. |
| Buttons | One primary per header or context. Secondary actions are outline. Logout is ghost. Destructive is `status.danger.fg` with `action.on` text. |
| Links | `action.primary`, hover `action.hover`. |
| Data states (G06) | Loading, empty, partial, stale, bad quality, unavailable and restricted are each distinguishable. An error never also shows the empty-state text. Last-known state after a data gap is overlaid with the unknown hatch: "No data since T". |
| Charts | Measured values use a solid line, setpoint a labelled dashed line, estimates a distinct labelled pattern. The axis is time-proportional; no smoothing of counts; no unlabelled stacking. The window shown must equal the data drawn (watch UTC versus site-local boundaries). Canvas libraries (echarts) resolve tokens to literals in one theme builder and rebuild on a theme change. |
| Help | Metric definitions sit behind an ⓘ toggletip beside the value; "How to read this view" sits behind ? in the panel header. Both open on click and keyboard, with hover only as an enhancement (WCAG 2.1 SC 1.4.13, 2.1.1). There are no `title`-only definitions. A fixed template links to the full calculation view (CPA-UI-DEC-001 CD16). |
| Content | Units, data-state labels, coverage, time zone, source and errors are never removed. Metric definitions move behind an info control next to the value (guide p.6). Implementation detail (raw enums, pipeline terms, internal IDs, engine notes) is translated, collapsed into "Technical details", or removed from operator pages (CD17). Marketing claims, unsupported figures and compliance statements without a documented basis (e.g. "in compliance with IEC 62443") are removed. |
| Login | Split-screen layout (IAMS-UI-PRM-002): theme-swapped cover image in CSS, the existing authentication contract unchanged, real status-bar values only, no default-account placeholder. |

## 3. Working method (proven on Instrumental)

- **Packages:** first a read-only analysis (styling inventory, screenshots, text audit), then the migration in phases. Phases 1+2 (tokens and provider) ship together, then the shell and primitives, charts and NE107, a mechanical sweep, status semantics, legacy route guard, and QA.
- **Rule:** no layout, typography or structure change in the colour migration (D14). Deviations from guide geometry are recorded in `geometry-deviations.md` for a later layout package. Text reductions are logged in `content-candidates.md` for a later content package.
- **Gates every phase:** `tsc` (baseline, no new errors), lint (baseline), `lint:theme` (stack-specific regex gates), build, and the contrast check (`contrast.mjs`, the Node port of `contrast.py`), plus a browser computed-style check.
- **Evidence:** production builds only; screenshot manifests with measured sidebar, header, row and scrollbar sizes; first-paint test by frame-by-frame screencast; capture runs paced below the gateway rate limit (100 requests per minute per client).
- **Checkpoints:** the plan (C1), the NE107 palette (C2), uncovered cases (C3) and the shell in both themes (C4). Chart-behaviour changes (axis type, date boundaries, smoothing) are diagnosed first and merged only after approval.
- **Change control:** one commit per phase (`theme(phase-N): …`), and one change-tracker entry per phase.

## 4. Status — Instrumental (IAMS-UI-PRM-001 R03)

| Item | State |
|---|---|
| Phase 3 shell and primitives | Done, commit 321000c |
| Phase 4 charts and NE107 (D6) | Done, commit 56cff37 |
| Phase 5 sweep / Phase 6 semantics | Next. Rulings issued, covering Priority Queue, ERP, Performance panel, date controls, filter selects, the timeline no-data overlay, short-episode minimum width, and the unit rule |
| Chart behaviour C1–C3 | Trend axis categorical, window mismatch (Jul 31→Sep 4 for an Aug 1→Sep 10 request), smoothing and stacking. Diagnosis only |
| Data tickets (to raise) | Oldest active 1091.8 d; Bad Actors TT1000A with 4902 episodes in a single day and MTBF 0 s; Event detail "16,000 bar g URV" against "URL 40 bar" |
| Measured shell | Sidebar 256, header 64, rows 49 (Devices) and 45 (Users), scrollbar 10 px |
| Login redesign | IAMS-UI-PRM-002, pending; cover images login-cover-day/night |

## 5. Status — CPA

| Item | State |
|---|---|
| CPA-UI-PRM-001 analysis | Done. 31 routes, 373 images, branch `feat/v25-next-release` commit `16184182`. Reviewed in CPA-UI-DEC-001 R01 |
| Stack | React 18 + Vite 5, OpenBridge web components 1.0.1 (217 `ObcButton` uses), plain global CSS, echarts 5.6. No Tailwind, shadcn or next-themes |
| Baseline | 97.5 % of live colour declarations go through variables; 0 % are Traverse. 46 literals, 124 fallbacks; 109 of 130 hex in `Designer.css` |
| Decisions approved | DEC-001: CD1 adapter (amended by DEC-002 RD2 to B2), CD2 Graphite and Cyan Night, CD3 Bright removed, CD16 help toggletip, CD17 Internal class, CD18 gate names first. DEC-002: RD1 seven destinations (Overview, Performance, Episodes, Loop, Evidence, Setup, System), RD2 B2 with no focus-gap waiver, RD3 global time range with pinned verdicts, RD15 deployment out of scope |
| Migration prompt | CPA-UI-PRM-002 R01 **superseded** by PRM-004 (its foundation is PRM-004 Phase 1) |
| Deep analysis | CPA-UI-PRM-003 done (`docs/theme/deep/`, 702 images). The fitness gate was waived (10 of 243 loops live), so acceptance needs a populated lab. Reviewed in CPA-UI-DEC-002 R01 |
| Key findings | 145 metric concepts, 28 consistent; 49 discrepancies for control engineering. 490 conformance cells, 112 pass. Loop detail spread over 8 pages, with PV/SP/OP plotted in 8 places on 5 chart builders. 18 of 24 tasks multi-page. 9 OpenBridge types fail WCAG Level A semantics. `ObcButton` paints at 34 px (not 48) |
| Redesign | Specified in CPA-UI-SPEC-001 R01 (page contents, route map, shared components, function-preservation matrix, acceptance). Delivered by CPA-UI-PRM-004 R02: Phases 0–8, checkpoints R0–R7, with a control-engineer review at R5 |
| Act-now items (PRM-004 Phase 0) | Modal footer focus, drawer focus trap and return, permission checkbox names, the IEC 62443 login claim. Owner to confirm: hiding `/admin/system`; permission guard corrections (RD13) |
| Open | Q7 metric definitions (the redesign keeps text as implemented, RD10); confirmed-finding colour (proposed warning); Q8 reporting-day boundary; hidden or disabled absent modules (implemented as hidden) |

## 6. Open decisions for the Lead or product owner

- The Lead's tokens package (guide p.30) and the reconciliation of extension names (`status.*`, `diag.*`, `chart.series.*`).
- Proposed component states not in R01: destructive button, disabled styling, input hover border, table header divider.
- The Instrumental Health score "weighted by NE107 category" conflicts with guide p.16, where F/C/S/M are not a severity scale. Its definition needs approval.
- The plant time zone and reporting-day boundary (guide p.29).
- Skill R1.3: an echarts section in `references/components.md` (CPA-UI-DEC-001 CD15).
- CPA metric definitions and eligible operating periods (guide p.29).

## 7. Files in this project

| Path | Content |
|---|---|
| `traverse-design-system/SKILL.md` and `references/*`, `scripts/contrast.py` | Design-system skill R1.2 |
| `prompts/IAMS-UI-PRM-001-R03.md` | Instrumental theming migration prompt (the template for CPA) |
| `prompts/IAMS-UI-PRM-002-R01.md` | Login redesign prompt |
| `prompts/CPA-UI-PRM-001-R01.md` | CPA analysis prompt |
| `prompts/CPA-UI-PRM-002-R01.md` | CPA colour migration prompt (superseded by PRM-004) |
| `prompts/CPA-UI-PRM-003-R01.md` | CPA deep functional, UX and content analysis prompt |
| `prompts/CPA-UI-PRM-004-R02.md` | CPA redesign prompt (R02 adds the backup-and-push step; R01 superseded, not run) |
| `decisions/CPA-UI-DEC-001-R01.md` | CPA analysis review and design-system decision record |
| `decisions/CPA-UI-DEC-002-R01.md` | CPA deep-analysis review and redesign decisions |
| `specs/CPA-UI-SPEC-001-R01.md` | CPA redesign specification: what each page contains |
| `samples/fleet-now-sample.html` | Fleet Now reference in the guide geometry, with a Day/Night toggle |
| Uploaded by the owner | The guide PDF and the skill zip for Claude Code |

The prompts are kept as issued. Where IAMS-UI-PRM-001 R03 conflicts with §2 of this brief, §2 governs. The conflicts are: the D1 `value` map (removed), the contrast gate (Node port `contrast.mjs` instead of `python3 contrast.py`), D6 "Normal = surface.raised" (refined as in §2), and success/info usage (the Q5 rulings). CPA-UI-PRM-002 already has §2 and CPA-UI-DEC-001 folded in.
