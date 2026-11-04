# CPA data states (Part J)

Reproduced or simulated on the production build. Night images sit beside the Day ones. A guard blocked no write during this pass.

## Coverage

| Route | loading | empty | empty-filter | no-selection | partial | stale | error | error-server | restricted | missing-record |
|---|---|---|---|---|---|---|---|---|---|---|
| overview | [yes](screenshots/day/states/overview--loading.png) | [yes](screenshots/day/states/overview--empty.png) | - | - | [yes](screenshots/day/states/overview--partial.png) | [yes](screenshots/day/states/overview--stale.png) | [yes](screenshots/day/states/overview--error.png) | - | [yes](screenshots/day/states/overview--restricted.png) | [yes](screenshots/day/states/overview--missing-record.png) |
| performance | [yes](screenshots/day/states/performance--loading.png) | [yes](screenshots/day/states/performance--empty.png) | [yes](screenshots/day/states/performance--empty-filter.png) | - | - | [yes](screenshots/day/states/performance--stale.png) | [yes](screenshots/day/states/performance--error.png) | [yes](screenshots/day/states/performance--error-server.png) | - | - |
| events | [yes](screenshots/day/states/events--loading.png) | [yes](screenshots/day/states/events--empty.png) | - | - | - | - | [yes](screenshots/day/states/events--error.png) | - | - | [yes](screenshots/day/states/events--missing-record.png) |
| explorer | [yes](screenshots/day/states/explorer--loading.png) | [yes](screenshots/day/states/explorer--empty.png) | - | [yes](screenshots/day/states/explorer--no-selection.png) | [yes](screenshots/day/states/explorer--partial.png) | - | [yes](screenshots/day/states/explorer--error.png) | - | - | [yes](screenshots/day/states/explorer--missing-record.png) |
| historical | [yes](screenshots/day/states/historical--loading.png) | [yes](screenshots/day/states/historical--empty.png) | - | [yes](screenshots/day/states/historical--no-selection.png) | [yes](screenshots/day/states/historical--partial.png) | - | [yes](screenshots/day/states/historical--error.png) | - | - | - |
| investigation | [yes](screenshots/day/states/investigation--loading.png) | [yes](screenshots/day/states/investigation--empty.png) | - | [yes](screenshots/day/states/investigation--no-selection.png) | - | - | [yes](screenshots/day/states/investigation--error.png) | - | - | - |
| evidence | [yes](screenshots/day/states/evidence--loading.png) | - | - | [yes](screenshots/day/states/evidence--no-selection.png) | - | - | [yes](screenshots/day/states/evidence--error.png) | [yes](screenshots/day/states/evidence--error-server.png) | - | - |
| windows | [yes](screenshots/day/states/windows--loading.png) | - | - | [yes](screenshots/day/states/windows--no-selection.png) | - | - | [yes](screenshots/day/states/windows--error.png) | - | - | - |
| calculations | [yes](screenshots/day/states/calculations--loading.png) | [yes](screenshots/day/states/calculations--empty.png) | - | [yes](screenshots/day/states/calculations--no-selection.png) | - | - | [yes](screenshots/day/states/calculations--error.png) | - | - | - |
| response | [yes](screenshots/day/states/response--loading.png) | - | - | [yes](screenshots/day/states/response--no-selection.png) | - | - | [yes](screenshots/day/states/response--error.png) | - | - | - |
| registry | [yes](screenshots/day/states/registry--loading.png) | [yes](screenshots/day/states/registry--empty.png) | - | - | - | - | [yes](screenshots/day/states/registry--error.png) | - | [yes](screenshots/day/states/registry--restricted.png) | - |
| kpi | [yes](screenshots/day/states/kpi--loading.png) | [yes](screenshots/day/states/kpi--empty.png) | - | - | - | - | [yes](screenshots/day/states/kpi--error.png) | [yes](screenshots/day/states/kpi--error-server.png) | - | - |
| trend | - | [yes](screenshots/day/states/trend--empty.png) | - | - | - | - | - | - | - | - |
| replay | - | - | - | [yes](screenshots/day/states/replay--no-selection.png) | - | - | - | - | - | - |
| shell | - | - | - | - | - | - | - | - | - | - |
| config | [yes](screenshots/day/states/config--loading.png) | - | - | - | - | - | [yes](screenshots/day/states/config--error.png) | - | - | - |
| config-effective | [yes](screenshots/day/states/config-effective--loading.png) | - | - | - | - | - | [yes](screenshots/day/states/config-effective--error.png) | - | - | - |
| pipeline | [yes](screenshots/day/states/pipeline--loading.png) | - | - | - | - | - | [yes](screenshots/day/states/pipeline--error.png) | - | - | - |
| governance | [yes](screenshots/day/states/governance--loading.png) | - | - | - | - | - | [yes](screenshots/day/states/governance--error.png) | - | - | - |
| admin-users | [yes](screenshots/day/states/admin-users--loading.png) | - | - | - | - | - | [yes](screenshots/day/states/admin-users--error.png) | - | - | - |
| admin-audit | [yes](screenshots/day/states/admin-audit--loading.png) | - | - | - | - | - | [yes](screenshots/day/states/admin-audit--error.png) | - | - | - |

Not reproduced: **bad quality** (no reproducible source value in the lab) and a **genuine restricted** state (no low-privilege account was supplied; the 403 images simulate a service refusal).

## Errors that also show empty text (G06)

| Route | What the page showed |
|---|---|
| performance | FIND PROBLEMS Performance Compare every loop gate by gate and see where the plant is failing. 12h 24h Verdict… |

Detected by matching the visible text; a screenshot review confirms each.

## What each state showed

| State | How reached | Text shown |
|---|---|---|
| overview--loading | GET responses held 7 s in the browser, first visit | FIND PROBLEMS Operations overview Which loops need attention first, and why. 12h 24h SITE All sites AREA — select a sit… |
| performance--loading | GET responses held 7 s in the browser, first visit | FIND PROBLEMS Performance Compare every loop gate by gate and see where the plant is failing. 12h 24h Verdicts fuse on … |
| events--loading | GET responses held 7 s in the browser, first visit | FIND PROBLEMS Loop events Investigate diagnosis episodes with operating context and a traceable response history. One r… |
| explorer--loading | GET responses held 7 s in the browser, first visit | CHECK A LOOP Loop explorer One loop's current condition, trend and gate results. 12h 24h LOOP FIC10302 Reactor feed flo… |
| historical--loading | GET responses held 7 s in the browser, first visit | CHECK A LOOP Historical A loop's signals, KPIs, mode and verdicts over a past period. 12h 24h LOOP FIC10302 Reactor fee… |
| investigation--loading | GET responses held 7 s in the browser, first visit | UNDERSTAND THE CAUSE Investigation Start here: the conclusion, the evidence behind it and what to check next. LOOP FIC1… |
| evidence--loading | GET responses held 7 s in the browser, first visit | Loading… |
| windows--loading | GET responses held 7 s in the browser, first visit | Loading… |
| calculations--loading | GET responses held 7 s in the browser, first visit | UNDERSTAND THE CAUSE Calculations Every calculated metric for a loop, with its latest value and method. 12h 24h LOOP FI… |
| response--loading | GET responses held 7 s in the browser, first visit | UNDERSTAND THE CAUSE System response — Reactor feed flow Site zone UTC. Every event is listed with its state and reason… |
| registry--loading | GET responses held 7 s in the browser, first visit | SET UP Loop registry Add individual loops or validate a bulk registry import. Onboarded loops are evaluated immediately… |
| kpi--loading | GET responses held 7 s in the browser, first visit | Operations overview FIND PROBLEMS Performing acceptably The loops behind one Overview number, and the value that put ea… |
| overview--error | CPM API answered 503 in the browser, first visit | FIND PROBLEMS Operations overview Which loops need attention first, and why. 12h 24h SITE All sites Dallas Terminal (da… |
| performance--error | CPM API answered 503 in the browser, first visit | FIND PROBLEMS Performance Compare every loop gate by gate and see where the plant is failing. 12h 24h Verdicts fuse on … |
| events--error | CPM API answered 503 in the browser, first visit | FIND PROBLEMS Loop events Investigate diagnosis episodes with operating context and a traceable response history. One r… |
| explorer--error | CPM API answered 503 in the browser, first visit | CHECK A LOOP Loop explorer One loop's current condition, trend and gate results. 12h 24h LOOP FIC10302 loading… PERIOD … |
| historical--error | CPM API answered 503 in the browser, first visit | CHECK A LOOP Historical A loop's signals, KPIs, mode and verdicts over a past period. 12h 24h LOOP FIC10302 not in the … |
| investigation--error | CPM API answered 503 in the browser, first visit | UNDERSTAND THE CAUSE Investigation Start here: the conclusion, the evidence behind it and what to check next. LOOP FIC1… |
| evidence--error | CPM API answered 503 in the browser, first visit | LOOP FIC10302 loading… PERIOD 12h windows (none opened) SITE All sites Dallas Terminal (dallas) HDPE Plant (hdpe) Houst… |
| windows--error | CPM API answered 503 in the browser, first visit | UNDERSTAND THE CAUSE Window inspector Which windows were evaluated and whether they had enough data. CHECKING RUNTIME… … |
| calculations--error | CPM API answered 503 in the browser, first visit | UNDERSTAND THE CAUSE Calculations Every calculated metric for a loop, with its latest value and method. 12h 24h LOOP FI… |
| response--error | CPM API answered 503 in the browser, first visit | UNDERSTAND THE CAUSE System response — FIC10302 Site zone UTC. Every event is listed with its state and reason; the sel… |
| registry--error | CPM API answered 503 in the browser, first visit | SET UP Loop registry Add individual loops or validate a bulk registry import. Onboarded loops are evaluated immediately… |
| kpi--error | CPM API answered 503 in the browser, first visit | Operations overview FIND PROBLEMS acceptable The loops behind one Overview number, and the value that put each one ther… |
| overview--restricted | CPM API answered 403 in the browser | FIND PROBLEMS Operations overview Which loops need attention first, and why. 12h 24h SITE All sites Dallas Terminal (da… |
| registry--restricted | CPM API answered 403 in the browser | SET UP Loop registry Add individual loops or validate a bulk registry import. Onboarded loops are evaluated immediately… |
| overview--partial | Only /fleet/kpis answered 503 | FIND PROBLEMS Operations overview Which loops need attention first, and why. 12h 24h SITE All sites Dallas Terminal (da… |
| explorer--partial | Only the historian API answered 503 | CHECK A LOOP Loop explorer One loop's current condition, trend and gate results. 12h 24h LOOP FIC10302 Reactor feed flo… |
| historical--partial | Only the historian API answered 503 | CHECK A LOOP Historical A loop's signals, KPIs, mode and verdicts over a past period. 12h 24h LOOP FIC10302 Reactor fee… |
| overview--empty | URL only | FIND PROBLEMS Operations overview Which loops need attention first, and why. 12h 24h SITE All sites Dallas Terminal (da… |
| performance--empty | URL only | FIND PROBLEMS Performance Compare every loop gate by gate and see where the plant is failing. 12h 24h Verdicts fuse on … |
| performance--empty-filter | URL only | FIND PROBLEMS Performance Compare every loop gate by gate and see where the plant is failing. 12h 24h Verdicts fuse on … |
| events--empty | URL only | FIND PROBLEMS Loop events Investigate diagnosis episodes with operating context and a traceable response history. One r… |
| calculations--empty | URL only | UNDERSTAND THE CAUSE Calculations Every calculated metric for a loop, with its latest value and method. 12h 24h LOOP FI… |
| historical--empty | URL only | CHECK A LOOP Historical A loop's signals, KPIs, mode and verdicts over a past period. 12h 24h LOOP FIC10302 Reactor fee… |
| registry--empty | URL only | SET UP Loop registry Add individual loops or validate a bulk registry import. Onboarded loops are evaluated immediately… |
| kpi--empty | URL only | Operations overview FIND PROBLEMS Oscillating The loops behind one Overview number, and the value that put each one the… |
| trend--empty | URL only | Trend From To Apply window LIVE 0 pens No tags selected 04/11, 16:25:21 15m 1h 8h 1d 1w ◀ ⏸ ▶▶ Now 04/11, 16:40:21 Zoom… |
| explorer--empty | URL only | CHECK A LOOP Loop explorer One loop's current condition, trend and gate results. 12h 24h SITE All sites Dallas Terminal… |
| investigation--empty | URL only | UNDERSTAND THE CAUSE Investigation Start here: the conclusion, the evidence behind it and what to check next. SITE All … |
| explorer--no-selection | URL only | CHECK A LOOP Loop explorer One loop's current condition, trend and gate results. 12h 24h SITE All sites Dallas Terminal… |
| historical--no-selection | URL only | CHECK A LOOP Historical A loop's signals, KPIs, mode and verdicts over a past period. 12h 24h SCOPE SITE All sites Dall… |
| evidence--no-selection | URL only | SITE All sites Dallas Terminal (dallas) HDPE Plant (hdpe) Houston Refinery (houston) AREA — select a site — UNIT — sele… |
| replay--no-selection | URL only | UNDERSTAND THE CAUSE Evidence replay Replay the raw samples behind a verdict and re-run the calculation. 12h 24h Export… |
| windows--no-selection | URL only | UNDERSTAND THE CAUSE Window inspector Which windows were evaluated and whether they had enough data. CPLM jobs not visi… |
| calculations--no-selection | URL only | UNDERSTAND THE CAUSE Calculations Every calculated metric for a loop, with its latest value and method. 12h 24h 1 · SEL… |
| response--no-selection | URL only | UNDERSTAND THE CAUSE System response Process models estimated from setpoint or output steps. SITE All sites Dallas Term… |
| investigation--no-selection | URL only | UNDERSTAND THE CAUSE Investigation Start here: the conclusion, the evidence behind it and what to check next. SITE All … |
| explorer--missing-record | URL only | CHECK A LOOP Loop explorer One loop's current condition, trend and gate results. 12h 24h LOOP zz_none not in the loop r… |
| events--missing-record | URL only | FIND PROBLEMS Loop events Investigate diagnosis episodes with operating context and a traceable response history. One r… |
| overview--missing-record | URL only | FIND PROBLEMS Operations overview Which loops need attention first, and why. 12h 24h SITE All sites Dallas Terminal (da… |
| kpi--error-server | URL only | Operations overview FIND PROBLEMS KPI The loops behind one Overview number, and the value that put each one there. 12h … |
| performance--error-server | URL only | FIND PROBLEMS Performance Compare every loop gate by gate and see where the plant is failing. 12h 24h Verdicts fuse on … |
| evidence--error-server | URL only | LOOP FIC10302 Reactor feed flow FIC · criticality high LOCATION HDPE › Section 100 › U1001 polymerization reactor 1 PER… |
| shell--command-palette | opened, not submitted | FIND PROBLEMS Operations overview Which loops need attention first, and why. 12h 24h SITE All sites Dallas Terminal (da… |
| performance--help-open | opened, not submitted | FIND PROBLEMS Performance Compare every loop gate by gate and see where the plant is failing. 12h 24h Verdicts fuse on … |
| performance--gate-cell | opened, not submitted | FIND PROBLEMS Performance Compare every loop gate by gate and see where the plant is failing. 12h 24h Verdicts fuse on … |
| events--detail | opened, not submitted | FIND PROBLEMS Loop events Investigate diagnosis episodes with operating context and a traceable response history. One r… |
| explorer--chart-tooltip | opened, not submitted | CHECK A LOOP Loop explorer One loop's current condition, trend and gate results. 12h 24h LOOP FIC10302 Reactor feed flo… |
| explorer--gate-detail | opened, not submitted | CHECK A LOOP Loop explorer One loop's current condition, trend and gate results. 12h 24h LOOP FIC10302 Reactor feed flo… |
| historical--chart-tooltip | opened, not submitted | CHECK A LOOP Historical A loop's signals, KPIs, mode and verdicts over a past period. 12h 24h LOOP FIC10302 Reactor fee… |
| calculations--drawer | opened, not submitted | UNDERSTAND THE CAUSE Calculations Every calculated metric for a loop, with its latest value and method. 12h 24h LOOP FI… |
| registry--add-loop-dialog | opened, not submitted | SET UP Loop registry Add individual loops or validate a bulk registry import. Onboarded loops are evaluated immediately… |
| registry--bulk-import-dialog | opened, not submitted | SET UP Loop registry Add individual loops or validate a bulk registry import. Onboarded loops are evaluated immediately… |
| performance--stale | browser clock shifted +5 h | FIND PROBLEMS Performance Compare every loop gate by gate and see where the plant is failing. 12h 24h Verdicts fuse on … |
| overview--stale | browser clock shifted +5 h | FIND PROBLEMS Operations overview Which loops need attention first, and why. 12h 24h SITE All sites Dallas Terminal (da… |
| config--loading | GET responses held 7 s in the browser, first visit | SET UP Gate configuration What each loop runs under, the bundles in progress, and the editor for one of them. SITE All … |
| config-effective--loading | GET responses held 7 s in the browser, first visit | SET UP · GATE CONFIGURATION FIC10302 · Reactor feed flow What this loop runs under today, the bundles at its three leve… |
| pipeline--loading | GET responses held 7 s in the browser, first visit | RUNTIME INTERNALS Pipeline health The Flink/Kafka runtime that produces every verdict. This view is read-only; job life… |
| governance--loading | GET responses held 7 s in the browser, first visit | CHANGE CONTROL Governance Who changed what, under which calculation versions, and which duties are separated by the per… |
| admin-users--loading | GET responses held 7 s in the browser, first visit | System Administration User management, plant model, data sources, and audit User Management Roles & Permissions Data So… |
| admin-audit--loading | GET responses held 7 s in the browser, first visit | System Administration User management, plant model, data sources, and audit User Management Roles & Permissions Data So… |
| config--error | CPM API answered 503 in the browser, first visit | SET UP Gate configuration What each loop runs under, the bundles in progress, and the editor for one of them. SITE All … |
| config-effective--error | CPM API answered 503 in the browser, first visit | SET UP · GATE CONFIGURATION FIC10302 What this loop runs under today, the bundles at its three levels, and the editor f… |
| pipeline--error | CPM API answered 503 in the browser, first visit | RUNTIME INTERNALS Pipeline health The Flink/Kafka runtime that produces every verdict. This view is read-only; job life… |
| governance--error | CPM API answered 503 in the browser, first visit | CHANGE CONTROL Governance Who changed what, under which calculation versions, and which duties are separated by the per… |
| admin-users--error | CPM API answered 503 in the browser, first visit | System Administration User management, plant model, data sources, and audit User Management Roles & Permissions Data So… |
| admin-audit--error | CPM API answered 503 in the browser, first visit | System Administration User management, plant model, data sources, and audit User Management Roles & Permissions Data So… |

Pass and fail per route and state from source reading is in [cpa-currenttheme.md](../cpa-currenttheme.md) §9.8 and still applies; nothing in the data-state code changed.
