# CPA page plan

**Status: built, all five steps (CHG-120 to CHG-125, unreleased). Agreed with the owner on 5 November 2026, and corrected after a check of every filter in the code.** The picture of it is `samples/page-plan.html`. Block names come from the running pages and the source.

## The short answer

**24 screens become 8 menu entries, and no content is lost. This plan only moves pages.**

Inside each tab **nothing is added, removed or rearranged**: same panels, same order, same filters, same trends, same drawers. The filter row of each page stays on that page. The selected loop and the plant scope already carry from tab to tab in the address, so nobody picks a loop twice.

| Menu entry | Tabs | Replaces |
|---|---|---|
| **Overview** | none (KPI drill-down opens in place) | Operations overview, KPI drill-down |
| **Performance** | none | Performance (unchanged) |
| **Episodes** | none | Loop events (unchanged) |
| **Loop** | Summary · Historical · Diagnosis · Model · Signals · History · Calculations | Loop explorer, Historical, Investigation, System response |
| **Evidence** | Gates · Replay · Windows · Calculations | Evidence workbench, Evidence replay, Window inspector, Calculations |
| **Setup** | Loops · Configuration · Plant model · Data sources · Tag aliases | Loop registry, Gate configuration, three Administration sections |
| **System** | Pipeline · Governance · Users · Roles · Settings | Pipeline health, Governance, Audit log, three Administration sections |
| **Trend** | none | Trend tool (unchanged) |

## What changes, and only this

1. **One row of tabs.** Tabs inside tabs move up into the page's row, and their counts move with them.
2. **Every tab has its own address.** Back, forward, bookmarks and shared links work, and every old address opens the right tab.
3. **Each tab keeps its permission.** A role that cannot see a page today cannot see that tab, and nobody loses a page they have today.
4. **Two changes the owner asked for:** the KPI drill-down opens in place, and Governance events and Audit log become one view (below).

## What travels between tabs

The loop, the plant scope, 12h / 24h and the filters travel. **A selection stays on its tab:** a selected run, event or evaluated window does not follow you to another tab, and browser Back returns to it. Otherwise one loop's evidence could show under another loop's name (UI-075).

## Withdrawn after the filter check

The first version of this plan said "one loop picker in the page header" and "the old page title goes". **Both are withdrawn.**

The loop picker is not a separate control. On every page it sits inside a filter row and works with it, as the table below shows. On Summary it is a loop tree with its own search. On Diagnosis the case chips decide which loops it offers. Moving it would have meant rebuilding those rows, which the same plan promised not to do. It also buys nothing, because the loop already stays selected across tabs.

Page headings stay as well, because nothing inside a page changes. Dropping them where they repeat the tab is the owner's choice, and it is one line of code.

## Every filter stays on its tab

Checked in the source on 5 November 2026. Each row is that tab's controls today, and each stays in the same place.

| Tab | Loop chooser | The filters and selectors around it |
|---|---|---|
| Loop › Summary, Signals, History, Calculations | Loop tree with search, can collapse | 12h / 24h; Site, Area, Unit, loops in scope. Summary: trend period bar, compare. Calculations: window size selector. History: pager |
| Loop › Historical | Loop picker | 12h / 24h; Site, Area, Unit, loops in scope; four exports; range presets, step back and forward, now, custom from and to; PV, SP, OP, VP toggles; KPI overlay; normalize; Open in Trend |
| Loop › Diagnosis | Loop picker, narrowed by the case chips | Site, Area, Unit, loops in scope; case chips, Clear filter; Source live or historical; Profile; Evaluated window; folds to one line |
| Loop › Model | Loop picker | Site, Area, Unit; Open loop; Change loop; show censored events |
| Evidence › Gates | Loop picker | Site, Area, Unit, loops in scope; Window of any size; Evaluated window; Load older; Jump to date; Evaluate |
| Evidence › Replay | Loop picker | 12h / 24h; Site, Area, Unit; Evaluated window; Gate; Export package |
| Evidence › Windows | Loop picker | Site, Area, Unit; Window profile |
| Evidence › Calculations | Loop picker | 12h / 24h; Site, Area, Unit; search; All gates; All types; column sort |
| Setup › Configuration | Loop picker | Site, Area, Unit; Effective, Bundles and Editor views |

What the choice of loop does also stays per tab: Replay and Windows clear the selected window, Model clears the selected event, and Summary clears the selected gate.

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
| **KPI drill-down:** the rule, how it is calculated, how it has moved (14 d to 3 y), every loop behind the number with its proof | KPI drill-down | Opens in place, at `/cpm?review=`, with its back link (decision 3) |

### Performance, Episodes, Trend
No change. Every block stays: Performance's data-issue chips, four summary figures, gate pathway, gate matrix and Loops needing attention; Episodes' filters, ledger, episode detail, review and shelf, notes and fast conditions; Trend's whole tool.

### Loop
| Tab | Blocks | Comes from |
|---|---|---|
| **Summary** | Readiness bar, operating state, trend and period bar, loop model, loop KPIs, gate strip and detail, long and short windows | Loop explorer › Summary |
| **Historical** | Range bar, exports, signals, overlay, mode and verdict lanes, inspect panel | Historical |
| **Diagnosis** | Final conclusion, analysis cases, numeric evidence, signals over the window, reasoning chain, hypothesis comparison, recent windows, loop notes | Investigation |
| **Model** | Response events, key results, steps A to H, subgates, candidate models, frequency response, residuals, uncertainty, model history, model review | System response |
| **Signals** | Role map, open signals in Trend, and under it source → loop → calculations → outputs, and loop links | Loop explorer › Signals + Relationships |
| **History** | Episodes by condition, with the pager | Loop explorer › History |
| **Calculations** | Gate outcomes and per-window values, with the window size selector, Full catalogue › | Loop explorer › Calculations |

The loop tree, the loop summary and the readiness bar head Summary, Signals, History and Calculations, as they head those tabs today (SME #4).

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
| **Governance** | The one audit trail (below), what produces today's verdicts, configuration awaiting approval, permission matrix | Governance + Audit log |
| **Users** | Users, add, bulk import, edit, delete | Administration |
| **Roles** | Roles, permissions, custom roles | Administration |
| **Settings** | System settings | Administration |

## One audit trail (decision 4)

Governance events and Audit log read the same records from the same address, `/api/audit`. They differ in what each shows, so the one view keeps everything from both.

| | Governance events | Audit log | One view |
|---|---|---|---|
| Entity buttons | All, CPM loops, CPM events, HMI displays | none | Kept |
| Event type | none | All, Acknowledgements, Shelving, Security and logins, System | Kept, with the types the records hold: the old four returned nothing |
| User filter | none | Asks the server for one user | Kept: needs the exact user name |
| Find by user, action or entity | Within the rows fetched | none | Kept |
| Columns | When and hash, action, actor, entity | Timestamp, event type, user, entity, hash, correlation | All of them, with the longer hash |
| Verify cryptographic chain | Yes | Yes | One button |
| Integrity line | Result after a run | Result after a run, and a standing note before it | Kept |
| Paging | 25 a page, says when older rows are not fetched | 25 a page, states the totals | Kept, both statements |

It lives on System › Governance, above version provenance, approvals and the permission matrix. `/admin/audit` opens it. Each block keeps its own permission, so someone who holds only `admin.audit.view` sees the trail and nothing they cannot see today. The other Governance blocks stay with `system.manage`.

## What goes away: navigation only

| Today | After |
|---|---|
| Signals in Loop twice: Performance › Signals and Signals | Once |
| Tabs inside tabs: Loop › Performance › Summary | One row |
| Administration: a list of links that leaves System | Real tabs |
| The Audit log as a separate view of the same trail | One view, by the owner's decision |

## Not duplicates: kept apart

Checked in the code, because they look alike.

| Pair | Why both stay |
|---|---|
| Loop › Calculations and Evidence › Calculations | The first is one loop's gate outcomes at a chosen window size. The second is the catalogue, one row per stored metric. **The earlier redirect table merged them, which would have lost content, so this plan corrects it.** |
| Loop › Historical and Trend | The first is one loop with its verdict and mode lanes. The second is any tag. |
| Loop › History and Episodes | The first is one loop's episodes by condition. The second is the fleet ledger, where work happens. |
| Diagnosis › Recent windows and Evidence › Windows | The first is fused verdict windows. The second is every short granularity. |
| Loop notes on Diagnosis, Replay and Episodes | The same notes, each where the question arises. |

## The owner's decisions, 5 November 2026

1. **Administration:** Plant model, Data sources and Tag aliases go to Setup. Users, Roles and Settings go to System. Agreed.
2. **First Loop tab:** Summary. Agreed.
3. **KPI drill-down:** opens in place as a full view. Agreed.
4. **Governance events and Audit log:** one page with the information of both.

## Order of work

One page at a time, each shown to the owner before the next.

1. **Loop:** one row of tabs. **Built (CHG-120).**
2. **Overview:** KPI drill-down in place. **Built (CHG-121).**
3. **Evidence:** tabs share the loop and window correctly. **Built (CHG-122).**
4. **Setup and System:** Administration into tabs, and the one audit trail. **Built (CHG-123, CHG-124).**
5. **Old addresses:** switch on the redirects, and check every link. **Built (CHG-125).**

Each step is checked in Day and Night at 1440, 1000, 768 and 390 px. Each step compares every control on the new tab with the old page, in the running app, and lists any difference, and measures every control against the screen at phone width.

## Known risks, already understood

- Tabs on one page share the address, and old pages use the same names for different things. `cpa/tabKind.ts` handles it: each tab states where it reads 12h / 24h and which parameters are its own (CHG-120, CHG-122). A new tab must state both.
- Each Setup and System tab keeps the rule of the page it replaces (UI-078). `/admin` lands on the first section the role may open (UI-085).
- The old pages stay in the code for one release, as the rollback: `SHIPPED_PHASE = 2` (UI-086).
- Old pages use `tab` for themselves. Inside a page they need their own name, as Gate configuration already does with `sub`.

## Owner's review, 6 November 2026 (CHG-126 to CHG-131)

After seeing the plan built, the owner reviewed it on lab :3000 and approved the sample `samples/one-filter-place.html`. This changes one rule above: **second copies of a filter go, and no function goes** (UI-088). "Every filter stays" now means every filter function stays, once.

- **Site, Area and Unit:** the header only, with the loop count beside them.
- **Loop:** one control in the band on every loop page. It holds the old left list.
- **The band:** the loop control, then only what the tab needs.
- **Loop summary:** on Summary only, as one row with Open details.
- **Long filter lines:** dropdowns on Gates, Configuration, Performance, Episodes, Diagnosis, time ranges and the audit trail. 12h / 24h and the pens stay as they are.
- **Headings that repeat the tab:** gone. Their controls sit at the end of the tab row.
- **Overview:** coloured KPI icons, no explanation on the cards, and the owner's state bar.

Gates: tsc 0, lint 0, 1,221 tests in 153 files, build OK, lint:theme 0.
Walks: 59 of 59 on lab data, 0 server errors, 0 blocked. `check-a11y` 70 scans with 0 findings of any level, `check-redirects` 27 of 27, `check-geometry` 14 of 14, `control-edge` 52 views with 0 off the screen, link walk 75 links on 28 pages with 0 problems.

**KPI drill-down (CHG-132):** the number, its trend and its loops on one screen. The calculation sits behind the `?`, and rows lost their repeats and the hierarchy line.

Not built yet at the plant. Before release: control-engineer review of `text-changes.md`, and tell the SME that the summary left the other tabs (UI-101).
