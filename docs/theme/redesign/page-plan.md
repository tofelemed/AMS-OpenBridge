# CPA page plan

**Status: proposal. Nothing here is built, and nothing will be until the owner agrees.** The picture of it is `samples/page-plan.html`. Block names come from the running pages and the source (5 November 2026).

## The short answer

**24 screens become 8 menu entries, and no content is lost.** Phase 2 already put most old pages inside tabs. What is left is cleaning up what happens when they sit together: tabs inside tabs, a page header inside every tab, and a loop picker on every tab.

Inside each tab, **the layout stays exactly as it is today**: same panels, same order, same trends, same drawers.

| Menu entry | Tabs | Replaces |
|---|---|---|
| **Overview** | none (KPI drill-down opens in place) | Operations overview, KPI drill-down |
| **Performance** | none | Performance (unchanged) |
| **Episodes** | none | Loop events (unchanged) |
| **Loop** | Summary · Historical · Diagnosis · Model · Signals · History · Calculations | Loop explorer, Historical, Investigation, System response |
| **Evidence** | Gates · Replay · Windows · Calculations | Evidence workbench, Evidence replay, Window inspector, Calculations |
| **Setup** | Loops · Configuration · Plant model · Data sources · Tag aliases | Loop registry, Gate configuration, three Administration sections |
| **System** | Pipeline · Governance · Users · Roles · Audit log · Settings | Pipeline health, Governance, four Administration sections |
| **Trend** | none | Trend tool (unchanged) |

## What changes, and only this

1. **One header per page.** The page name, one `?`, the window switch and one loop picker. The old page's own title goes, because the tab names it. Its purpose sentence moves to the tab's `?`.
2. **One row of tabs.** No tabs inside tabs.
3. **Every tab has its own address.** Back, forward, bookmarks and shared links work, and every old address opens the right tab.
4. **Each tab keeps its permission.** A role that cannot see a page today cannot see that tab.

## Where every block goes

### Overview
| Block | Comes from | Change |
|---|---|---|
| Plant scope filter, 12h / 24h | Operations overview | None |
| Operating picture: 10 KPI cards, state bar | Operations overview | None (CHG-119) |
| Priority queue | Operations overview | None |
| Loop focus: live values, readiness, gates, evidence path | Operations overview | None |
| Event trail | Operations overview | None |
| Configuration limits, readiness strip | Operations overview | None |
| **KPI drill-down:** the rule, how it is calculated, how it has moved (14 d to 3 y), every loop behind the number with its proof | KPI drill-down | Opens in place, with "← Overview" |

### Performance, Episodes, Trend
No change. Every block stays: Performance's data-issue chips, four summary figures, gate pathway, gate matrix and Loops needing attention; Episodes' filters, ledger, episode detail, review and shelf, notes and fast conditions; Trend's whole tool.

### Loop
| Tab | Blocks | Comes from |
|---|---|---|
| **Summary** | Readiness bar, operating state, trend and period bar, loop model, loop KPIs, gate strip and detail, long and short windows | Loop explorer › Summary |
| **Historical** | Range bar, CSV and JSON exports, signals, overlay, mode and verdict lanes, inspect panel | Historical |
| **Diagnosis** | Final conclusion, analysis cases, numeric evidence, signals over the window, reasoning chain, hypothesis comparison, recent windows, loop notes | Investigation |
| **Model** | Response events, key results, steps A to H, subgates, candidate models, frequency response, residuals, uncertainty, model history, model review | System response |
| **Signals** | Role map, open signals in Trend, and under it source → loop → calculations → outputs, and loop links | Loop explorer › Signals + Relationships |
| **History** | Episodes by condition, with the pager | Loop explorer › History |
| **Calculations** | Gate outcomes and per-window values, with the window size selector, Full catalogue › | Loop explorer › Calculations |

### Evidence
| Tab | Blocks | Comes from |
|---|---|---|
| **Gates** | Evaluate a window, window list, jump to date, load older, context bar, basis bar, gate views G0 to G15, explain panel, historian lanes, export | Evidence workbench |
| **Replay** | Diagnosis band, where this evidence came from, re-run this window, recompute from history, export package, loop notes | Evidence replay |
| **Windows** | Window list, latest results, and the window detail with its contract, coverage, density and boundaries | Window inspector |
| **Calculations** | Summary figures, the full catalogue, calculation drawer | Calculations |

### Setup
| Tab | Blocks | Comes from |
|---|---|---|
| **Loops** | Registry table, profile panel, roles per gate, add, bulk import, edit, effective configuration | Loop registry |
| **Configuration** | Overview, effective, bundles, gate editors G0 to G15, layer stack, diff and impact, validation, approval, shadow, deployments | Gate configuration |
| **Plant model** | Tree, add, edit, delete, CSV import | Administration |
| **Data sources** | Sources and their wizard | Administration |
| **Tag aliases** | Aliases, add, import, delete | Administration |

### System
| Tab | Blocks | Comes from |
|---|---|---|
| **Pipeline** | Job table, checkpoint behaviour, E2E round trip, where a sample becomes a verdict | Pipeline health |
| **Governance** | Events and chain verification, what produces today's verdicts, configuration awaiting approval, permission matrix | Governance |
| **Users** | Users, add, bulk import, edit, delete | Administration |
| **Roles** | Roles, permissions, custom roles | Administration |
| **Audit log** | Audit explorer | Administration |
| **Settings** | System settings | Administration |

## What is removed: repeats only

| Repeat | Today | After |
|---|---|---|
| Page title inside a tab | Tab "Historical", then a heading "Historical" | The tab names it |
| Loop picker | On Explorer, Historical, Investigation, Response, Replay, Windows, Calculations, Workbench | One in the page header |
| Signals | In Loop twice: Performance › Signals and Signals | Once |
| Tabs inside tabs | Loop › Performance › Summary | One row |
| Administration | A list of links that leaves System | Real tabs |

## Not duplicates: kept apart

Checked in the code, because they look alike.

| Pair | Why both stay |
|---|---|
| Loop › Calculations and Evidence › Calculations | The first is one loop's gate outcomes at a chosen window size. The second is the catalogue, one row per stored metric. **The earlier redirect table merged them, which would have lost content, so this plan corrects it.** |
| Loop › Historical and Trend | The first is one loop with its verdict and mode lanes. The second is any tag. |
| Loop › History and Episodes | The first is one loop's episodes by condition. The second is the fleet ledger, where work happens. |
| Diagnosis › Recent windows and Evidence › Windows | The first is fused verdict windows. The second is every short granularity. |
| Loop notes on Diagnosis, Replay and Episodes | The same notes, each where the question arises. |

## Decisions for the owner

1. **Administration.** Recommended: Plant model, Data sources and Tag aliases go to Setup, because they describe the plant. Users, Roles, Audit log and Settings go to System. The alternative is one Administration tab with its own section bar, which brings back tabs inside tabs.
2. **Name of the first Loop tab.** Recommended: **Summary**, because "Performance" is also a menu entry.
3. **KPI drill-down.** Recommended: opens in place as a full view. A drawer is too narrow for its six-column table.
4. **Governance events and Audit log read the same trail.** Recommended: keep both for now, because you asked to remove nothing. You may prefer one.

## Order of work

One page at a time, each shown to you before the next.

1. **Loop:** the biggest gain.
2. **Overview:** KPI drill-down in place.
3. **Evidence:** one loop picker.
4. **Setup and System:** Administration into tabs.
5. **Old addresses:** switch on the redirects, and check every link.

Each step is checked in Day and Night at 1440, 1000, 768 and 390 px, with a list proving that no control, link or field was lost.

## Known risks, already understood

- Historical, Investigation, Replay and Windows read `window` as an end time. The 12h / 24h switch must never reach them, so it shows only on tabs where it applies.
- Old pages use `tab` for themselves. Inside a page they need their own name, as Explorer already does with `sub`.
- A loop picker in the header must carry the loop to every tab, and the period only where it means the same thing.
