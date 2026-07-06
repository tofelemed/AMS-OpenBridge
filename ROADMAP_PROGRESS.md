# ROADMAP_PROGRESS — 5-Phase HMI/SCADA Buildout

Durable record of the gated roadmap. Updated after each phase gate passes.
Plan file: `~/.claude/plans/we-re-implementing-a-5-phase-ticklish-haven.md`.

**Started:** 2026-07-05 · **Environment:** full Docker stack already up (21 containers, 32h; Flink jar built).

## Decisions locked (user-confirmed)
- Gate A evidence via the real pipeline: **Python producer → Kafka `live.metrics` → sparkplug-edge-node → EMQX → frontend**, two sites.
- Sites: **houston + dallas**. Tag/asset model: **realistic 2-site plant model** (multiple devices & measurements) — this is the permanent UNS catalog the designer binds to (PI-Vision-AF style), not throwaway.
- Designer binding UI: **TagPicker/AssetBrowser browse the live asset-model catalog**.
- Test gate: **typecheck + build** (`npm run build`) + existing `dotnet test tests/integration/binding-resolver.test.csproj`. No new frontend test runner.
- Live values/tags are **real product** (edge-node generic-metric support is a genuine gap being filled, not a harness).

## The UNS → transport contract (authoritative; everything must match)
Derived deterministically by `asset-model/Models/Asset.cs` for a path `<site>/<unit>/<device>.<measurement>`:
| Field | Value | Example (`houston/crude1/pump101.discharge_press`) |
|---|---|---|
| SparkplugGroup | `<site>` | `houston` |
| SparkplugEdgeNode | `<site>_edge1` | `houston_edge1` |
| SparkplugDevice | `<device>` (3-seg path) | `pump101` |
| SparkplugMetric | `<measurement>` | `discharge_press` |
| DDATA topic | `spBv1.0/<site>/DDATA/<site>_edge1/<device>` | `spBv1.0/houston/DDATA/houston_edge1/pump101` |
| Redis snapshot key | `snapshot:metric:<site>:<site>_edge1:<device>:<measurement>` | `snapshot:metric:houston:houston_edge1:pump101:discharge_press` |
| IoTDB path | `root.<path with / → .>` | `root.houston.crude1.pump101.discharge_press` |

Seeding asset-model with the paths auto-produces all transport fields (they are computed getters, EF-ignored). The simulator stamps `{group,edge,device,metric,value,quality,ts}` to match; the edge-node generic branch builds topic + Redis key from those verbatim; the frontend subscribes per-binding using resolver-provided group/edge and keys values fully-qualified (`group/edge/device/metric`) to avoid cross-site device-name collisions.

## Phase status
| Phase | Status | Gate evidence |
|---|---|---|
| A — Live data works | ✅ GATE PASSED (2026-07-05) | cross-site live values + staleness + build + tests (below) |
| B — Standalone viewer | ✅ GATE PASSED (2026-07-05) | `/display/:id` direct, 6 live tags both sites, 0 edit affordances |
| C — Trends | ✅ GATE PASSED (2026-07-05) | 1-tag + 3-pen live+historical trends, cursor reads all pens, shared time-bar (below) |
| D — Navigation | ✅ GATE PASSED (2026-07-05) | pump→L3 detail in-context (asset in URL), breadcrumb L1›L3, back/forward (below) |
| E — Asset-relative + collections | ✅ GATE PASSED (2026-07-05) | 1 pump display swapped across 20 pumps, every binding rebinds each swap (below) |

## GATE A — evidence (PASSED 2026-07-05)
Saved display `b42de765-…` ("Gate A - 2 Site Live"): 6 readouts bound to tank level / pump speed /
valve position across **houston + dallas**, observed in a real browser (Playwright, Preview mode):
- **Cross-site live + changing** — capture t1 → t2:
  - HOUSTON Tank01 Level 80.0% → 12.6% · Pump101 Speed 2041 → 1789 RPM · Valve01 Position 74.5% → 60.6%
  - DALLAS Tank02 Level 40.5% → 30.9% · Pump201 Speed 1101 → 2619 RPM · Valve02 Position 72.8% → 20.4%
- **Staleness (NE107)** — froze `houston/crude1/tank01.level` (sim `--exclude`): that tile rendered
  greyed + ⚠ badge (`.symbol-quality-stale`, grayscale+opacity) frozen at 81.5% while the other 5 stayed
  live/changing. Screenshots: scratchpad `gateA_live_t1.png`, `gateA_live_t2.png`, `gateA_stale.png`.
- **Build**: `npm run build` (tsc + vite) ✓ built in 19.70s.
- **Tests**: `dotnet test tests/integration/binding-resolver.test.csproj` → 8/8 passed.

### Phase A changes (product + enabling)
- Frontend: `SymbolRenderer.tsx` generic multi-slot resolution (`useSlotMetrics` over all declared slots +
  primary-value fallback) so any bound symbol shows live data; NE107 `SymbolQualityWrap` (universal stale
  degrade). `openBridgeTheme.ts` +`isStale`/`isBadQuality`. `mqttStore.ts` de-hardcoded → wildcard
  subscribe (`spBv1.0/+/…`) + env-overridable group/edge. `DisplayDesigner.tsx` load/save aligned to
  backend `snapshot` contract (was broken: sent/read `content`). `vite.config.ts` +`/api/assets`→asset-model
  proxy (AssetBrowser/TagPicker now browse the live UNS catalog).
- Backend/infra: edge-node generic `live.metrics` branch (per-record group/edge). binding-resolver
  asset-model URL-encoding fix. historian-bff multi-site `/snapshot`. `database/scripts/15_*.sql` 2-site
  plant seed. `scripts/sim/process_value_sim.py`. Test expectations corrected in `BindingResolverTests.cs`
  (device `pump101` per asset-model source-of-truth; `ioTDbPath` casing).

## GATE C — evidence (PASSED 2026-07-05)
Decision: **Both** (live buffer + IoTDB). Built process-value history: edge-node now also writes
each numeric `live.metrics` sample to IoTDB via REST at `root.<site>.<unit>.<device>.<measurement>`
(sim carries the `path`). Verified: `root.houston` auto-created, 10 timeseries, historian `/trend`
returns real points (28.64/57.77/74.38). Frontend: `mqttStore` live ring-buffer + `getLiveSeries`;
`fetchTrend` gained `measurements`; new `TrendChart.tsx` (echarts) wired into `chart.trend`.
- **Single-tag** display `43af13f4…`: real tank01.level waveform (IoTDB history + live), time-bar
  (5m/15m/1h/6h, ◀/Live/⏸/▶▶), legend, autoscale, zoom slider, cursor value-at-time. (`gateC_single.png`)
- **3-pen** display `2b5f8bb5…`: tank01.level + valve01.position + tank02.level on one chart, distinct
  colours + legend; cursor at 23:30:49 reads **all three independently** (84.65 / 54.87 / 63.62); one
  shared time-bar controls all pens. (`gateC_multi.png`)
- Build: `npm run build` ✓ 34.09s.
Deferred within C: per-pen multi-Y-axis (used shared autoscaled axis; fine for similar ranges);
historian still defaults to alarm columns when `measurements` omitted.

## GATE D — evidence (PASSED 2026-07-05)
Added `NavigationLink` to `CanvasItem` (targetDisplayId/targetUrl/assetContext/openMode). Viewer
symbols with a link are clickable (replace / new-tab / popup=iframe faceplate); viewer bar gained
Home/Back/Forward + a session breadcrumb trail (append forward, trim on return). Displays: L1
`Plant Overview` (pump tile → link) + L3 `Pump101 Detail`.
- Click pump on L1 → navigates to L3 detail with **`?asset=houston/crude1/pump101`** in the URL.
- Breadcrumb: **Plant Overview (L1) › Pump101 Detail (L3) · pump101**.
- L3 detail live: Speed 3039 RPM · Pressure 303.1 PSI · Temp 70.9 °C · Current 25.7 A.
- Back → overview; Forward → detail. (`gateD_detail.png`, `gateD_overview.png`) Build ✓ 32.69s.

## GATE E — evidence (PASSED 2026-07-05)
Asset-relative bindings: `{{element}}` substituted at runtime in the viewer against the selected
asset; an Asset selector lists sibling devices (same unit) and swaps the whole display. Seeded 20
pumps `houston/pumpstation/pump01..20` (+sim). One asset-relative Pump faceplate `495535cf…`
(`{{element}}.speed/discharge_press/motor_temp/current`), swept across all 20 pumps:
- **Every binding rebound to the selected pump on every swap** (`data-resolved` = `pumpNN.*` for all
  4 readouts, all 20 pumps).
- Live values track each pump's own data band (pump01≈1142 → pump20≈3370 RPM); **20/20 distinct**
  readings, all in expected band. (`gateE_pump01/10/20.png`) Build ✓ 39.09s.
- Also fixed a real bug: `useBindingResolver` now clears the prior value on rebind (asset swap no
  longer briefly shows the previous asset's value).
Remaining Phase E scope (NOT in the gate, not built): **collections** (repeat a symbol group over N
elements) and wiring the orphaned **TemplatePalette**. Also cosmetic: `shape.label` type renders as
the unknown "?" symbol (not handled in SymbolRenderer switch).

## 🏁 Roadmap complete — Gates A–E all PASSED (2026-07-05), each with observed browser evidence.

## Deferred items noticed (do NOT fix early — later-phase scope)
- **Device-id inconsistency**: binding-resolver FALLBACK + `/preview` derive `unit_device` (crude1_pump101)
  while asset-model (authoritative, used by the live path) derives `device` (pump101) for 3-seg paths.
  Reconcile the fallback to match asset-model. (Not exercised on the working path.)
- **nginx prod** needs an `/api/assets`→asset-model route to mirror the vite dev proxy.
- **display-service content/snapshot**: backend uses `snapshot`; frontend now adapts. Consider standardizing.
- Metric devices surface as "active alarms" in the live panel (mqttStore `buildLiveAlarmFromMetrics` treats
  any device with state as an alarm) — cosmetic; revisit when alarms-on-canvas (Phase F-ish) is done.
- SignalR alarm hub 404 in dev (ams-api negotiate) — unrelated to MQTT live data; pre-existing.
- IoTDB path literals in `utils/iotdbPaths.ts`, `IoTDbTrendViewer.tsx`, `SystemMonitor.tsx` → Phase C.
- historian-bff `/trend`/`/raw`/`/series` default to alarm schema + single-series/decimated → Phase C (needs multi-series endpoint).
- Full `Designer.css` raw-hex → OpenBridge-token sweep (70 hexes) → cleanup pass.
- `run-all.ps1`/`start-ams-docker-full.ps1` stale (missing `docker-compose.lab.yml`, wrong container names) → infra cleanup.

## Change log
- 2026-07-05: Roadmap kicked off; contract pinned from asset-model/binding-resolver; ROADMAP_PROGRESS created. Phase A started.
- 2026-07-05: Data pipeline built + VERIFIED end-to-end for houston+dallas. Seeded 36 assets (15_*.sql). Extended edge-node with generic `live.metrics` branch (per-record group/edge). New `scripts/sim/process_value_sim.py`. Fixed binding-resolver asset-model URL-encoding bug (was 404→fallback→wrong device id) + historian-bff multi-site `/snapshot`. Rebuilt+restarted edge-node, binding-resolver, historian-bff. mqttStore de-hardcoded to wildcard subscribe. Observed: houston tank01.level 53.66→58.97→63.48, dallas valve02.position 67.33→74.89→79.99; historian /snapshot returns all 8 devices both sites. Remaining Phase A: A1 generic slots, A2 NE107 staleness, TagPicker catalog, browser evidence.
