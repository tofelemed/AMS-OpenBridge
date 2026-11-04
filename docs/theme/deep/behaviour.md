# CPA behaviour (Part I)

Measured on the production build on port 3000. Timings are affected by request pacing and by other captures running at the same time, so treat them as upper bounds.

## Performance and accessibility per route

| Route | ms to stable | Stable | Requests | KB | Long tasks | Long-task ms | Idle API /min | Day axe c/s/m/m | Night axe c/s/m/m |
|---|---|---|---|---|---|---|---|---|---|
| R-01 overview | 9406 | yes | 5 | 0 | 13 | 875 | 0 | 0/7/2/0 | 0/4/2/0 |
| R-02 performance | 841 | yes | 1 | 0 | 15 | 1174 | 0 | 11/15/2/0 | 11/12/2/0 |
| R-03 events | 2660 | yes | 4 | 0 | 22 | 1590 | 0 | 0/12/3/0 | 0/9/3/0 |
| R-04 explorer | 20323 | yes | 8 | 0 | 280 | 19719 | 10 | 0/7/4/0 | 0/4/4/0 |
| R-05 historical | 1235 | yes | 6 | 0 | 10 | 703 | 0 | 0/7/2/0 | 0/4/2/0 |
| R-06 investigation | 7247 | yes | 12 | 0 | 75 | 4935 | 0 | 0/7/2/5 | 0/4/2/5 |
| R-07 evidence | 9863 | yes | 2 | 0 | 14 | 2990 | 0 | 0/24/6/0 | 0/23/6/0 |
| R-08 replay | 2330 | yes | 6 | 0 | 16 | 1451 | 0 | 0/7/2/0 | 0/4/2/0 |
| R-09 windows | 9543 | yes | 4 | 0 | 10 | 1126 | 0 | 0/7/2/0 | 0/4/2/0 |
| R-10 calculations | 1203 | yes | 3 | 0 | 1 | 53 | 0 | 2/7/2/0 | 2/4/2/0 |
| R-11 response | 2098 | yes | 4 | 0 | 7 | 519 | 0 | 0/7/6/1 | 0/4/6/1 |
| R-12 registry | 792 | yes | 3 | 0 | 4 | 223 | 0 | 0/7/3/0 | 0/4/3/0 |
| R-13 config | 3059 | yes | 10 | 0 | 2 | 118 | 0 | 0/7/2/0 | 0/4/2/0 |
| R-14 kpi | 2171 | yes | 5 | 0 | 5 | 317 | 0 | 0/7/2/0 | 0/4/2/0 |
| R-15 pipeline | 10709 | yes | 4 | 0 | 2 | 128 | 5 | 0/7/2/0 | 0/4/2/0 |
| R-16 governance | 16676 | yes | 13 | 0 | 1 | 54 | 0 | 0/38/2/0 | 0/35/2/0 |
| R-17 trend | 1702 | yes | 4 | 0 | 3 | 282 | 0 | 0/7/3/0 | 0/4/3/0 |
| R-18 admin-users | 1912 | yes | 7 | 1 | 7 | 432 | 0 | 2/17/2/1 | 2/14/2/1 |
| R-19 admin-roles | 1126 | yes | 3 | 1 | 0 | 0 | 0 | 0/8/2/0 | 0/11/2/0 |
| R-20 admin-data-sources | 1026 | yes | 2 | 0 | 3 | 186 | 0 | 0/39/3/0 | 0/36/3/0 |
| R-21 admin-plant-model | 1356 | yes | 9 | 0 | 1 | 51 | 0 | 0/7/3/0 | 0/20/3/0 |
| R-22 admin-aliases | 1238 | yes | 1 | 0 | 4 | 1072 | 0 | 0/1/3/1 | 0/1/3/1 |
| R-23 admin-audit | 3814 | yes | 1 | 0 | 33 | 4118 | 0 | 0/26/3/0 | 0/37/3/0 |
| R-24 admin-system | 2158 | yes | 0 | 0 | 3 | 2802 | 0 | 0/8/3/0 | 0/5/3/0 |

axe totals across routes, views and overlays, Day: {"critical":46,"serious":494,"moderate":130,"minor":18}. Night: {"critical":46,"serious":386,"moderate":130,"minor":18}.

Top rules Day: color-contrast 356, label-content-name-mismatch 107, region 96, aria-prohibited-attr 30, landmark-unique 16, aria-allowed-role 15, button-name 14, select-name 13, heading-order 10, label 7, aria-allowed-attr 6, aria-required-attr 6.

## Polling

From source. `refetchIntervalInBackground` is not set anywhere, so react-query polling pauses in a hidden tab; `setInterval` timers keep running.

| Owner | Kind | Interval ms | At |
|---|---|---|---|
| useRollingWindow | setInterval | 60000 | `components/Cpm/shared.tsx:81` |
| useCpmEvents | refetchInterval | 30000, 60000 | `hooks/useCpm.ts:97` |
| useFleetSummary | refetchInterval | 60000 | `hooks/useCpm.ts:170` |
| useCpmPipelineStatus | refetchInterval | 15000 | `hooks/useCpm.ts:178` |
| useFleetRankings | refetchInterval | 60000 | `hooks/useCpm.ts:194` |
| useFleetHeatmap | refetchInterval | 60000 | `hooks/useCpm.ts:203` |
| usePipelineMetrics | refetchInterval | 20000 | `hooks/useCpm.ts:409` |
| useRecompute | refetchInterval | false, 5000 | `hooks/useCpm.ts:425` |
| useDeployments | refetchInterval | 5000, false | `components/Cpm/config/useConfig.ts:57` |
| useDeployment | refetchInterval | 5000, false | `components/Cpm/config/useConfig.ts:64` |
| useCpmConditions | refetchInterval | 30000 | `components/Cpm/events/useConditions.ts:10` |
| useEventPage | refetchInterval | 30000 | `components/Cpm/events/useEventPage.ts:14` |
| useFleetKpis | refetchInterval | 60000 | `components/Cpm/kpi/useFleetKpis.ts:16` |
| useInstrumentHealth | refetchInterval | false, 30000 | `components/Cpm/health/useInstrumentHealth.ts:25` |
| LoopKpiCards | refetchInterval | 300000 | `components/Cpm/explorer/summary/LoopKpiCards.tsx:24` |
| useEvidenceManifest | refetchInterval | false, 15000, 10000 | `components/Cpm/evidence/useEvidence.ts:34` |
| useAnalysisRunState | refetchInterval | false, 10000 | `components/Cpm/evidence/useEvidence.ts:58` |
| EvaluateWindow | refetchInterval | false, 1500 | `components/Cpm/evidence/EvaluateWindow.tsx:45` |
| useShadowReport | refetchInterval | 10000, false | `components/Cpm/config/ShadowComparison.tsx:25` |
| useAuditEvents | refetchInterval | 30000, false | `hooks/useAudit.ts:14` |
| TrendCore | setInterval | 2000 | `components/Designer/TrendCore.tsx:229` |
| Login | setInterval | 1000 | `components/Login/Login.tsx:77` |
| App | setInterval | 60000 | `App.tsx:231` |
| App | setInterval | 30000 | `App.tsx:282` |

## Overlays: keyboard

| Overlay type | Focusable | Focus starts inside | Trapped | Esc closes |
|---|---|---|---|---|
| Open analysis › | 0 | false | - | true |
| Instrument health drawer | 0 | false | - | false |
| Loop picker list | 0 | false | - | true |
| Calculation drawer | 0 | false | - | true |
| Add control loop | 10 | true | false | true |
| Add user | 9 | true | true | true |
| Edit superadmin | 7 | true | true | true |
| Add Site | 5 | true | true | true |
| Add Area under | 5 | true | true | true |
| Edit Site Dallas | 5 | true | true | true |

## Reflow

Cell: horizontal scroll or ok, sidebar width in px, and elements past the right edge. `zoom200` is a 720 × 512 CSS viewport at device scale 2, equal to 200 % zoom on a 1440 px window.

| Route | 1366×768 | 1920×1080 | 1280×800 | 1024×768 | 200 % |
|---|---|---|---|---|---|
| overview | ok side 200 | ok side 220 | ok side 200 | ok side 200 | ok side 0 |
| overview-loop | ok side 200 | ok side 220 | ok side 200 | ok side 200 | ok side 0 |
| performance | ok side 200 | ok side 220 | ok side 200 | ok side 200 | ok side 0 |
| events | ok side 200 | ok side 220 | ok side 200 +2 | ok side 200 +6 | ok side 0 +8 |
| explorer | ok side 200 | ok side 220 | ok side 200 | **scroll** side 200 +7 | **scroll** side 0 +9 |
| explorer-signals | ok side 200 | ok side 220 | ok side 200 | ok side 200 | ok side 0 |
| explorer-calculations | ok side 200 | ok side 220 | ok side 200 | ok side 200 | ok side 0 |
| explorer-relationships | ok side 200 | ok side 220 | ok side 200 | ok side 200 | ok side 0 |
| explorer-history | ok side 200 | ok side 220 | ok side 200 | ok side 200 | ok side 0 |
| historical | ok side 200 | ok side 220 | ok side 200 | ok side 200 | ok side 0 |
| investigation | ok side 200 | ok side 220 | ok side 200 | ok side 200 | ok side 0 |
| evidence | ok side 200 | ok side 220 | ok side 200 | **scroll** side 200 +5 | **scroll** side 0 +7 |
| replay | ok side 200 | ok side 220 | ok side 200 | ok side 200 | ok side 0 |
| windows | ok side 200 | ok side 220 | ok side 200 | ok side 200 | ok side 0 |
| calculations | ok side 200 | ok side 220 | ok side 200 | ok side 200 | ok side 0 |
| response | ok side 200 | ok side 220 | ok side 200 | ok side 200 | ok side 0 +9 |
| registry | ok side 200 | ok side 220 | ok side 200 | ok side 200 | ok side 0 |
| config | ok side 200 | ok side 220 | ok side 200 | ok side 200 | ok side 0 |
| kpi | ok side 200 | ok side 220 | ok side 200 | ok side 200 | ok side 0 |
| pipeline | ok side 200 | ok side 220 | ok side 200 | ok side 200 | ok side 0 |
| governance | ok side 200 +67 | ok side 220 +17 | ok side 200 +67 | ok side 200 | ok side 0 |
| trend | ok side 200 | ok side 220 | ok side 200 | ok side 200 | ok side 0 |
| admin-users | ok side 200 | ok side 220 | ok side 200 | ok side 200 +106 | ok side 0 +168 |
| admin-roles | ok side 200 | ok side 220 | ok side 200 | ok side 200 | ok side 0 |
| admin-data-sources | ok side 200 | ok side 220 | ok side 200 | ok side 200 | ok side 0 |
| admin-plant-model | ok side 200 | ok side 220 | ok side 200 | ok side 200 | ok side 0 |
| admin-aliases | ok side 200 +1505 | ok side 220 | ok side 200 +1505 | ok side 200 +3008 | ok side 0 +3008 |
| admin-audit | ok side 200 | ok side 220 | ok side 200 | ok side 200 +131 | ok side 0 +232 |
| admin-system | ok side 200 | ok side 220 | ok side 200 | ok side 200 | ok side 0 |

## URL state

Reload on the production build: {"reload":{"after":"/cpm/explorer?loop=FIC10302&tab=Signals","loggedOut":false}}. The session and URL survive a reload. The dev-server behaviour noted during the first analysis does not apply here.
