# Unified HMI Configuration Platform — Feasibility Analysis & Transition Plan

**Subject:** Folding the PI Vision++ reference application (Apache Batik / Konva) into the AMS / Traverse Edge stack, with OpenBridge Web Components as the HMI foundation
**Document type:** Feasibility analysis + build-against transition plan
**Scope decision (confirmed):** Full reference-app parity — AF templates, hierarchy, analysis engine, **and** the HMI designer/runtime
**Standards anchor:** ISA-101 (HMI), ISA-5.1 (instrumentation symbols), ISA-18.2 + EEMUA 191 (alarms), ISA-95 (asset hierarchy / UNS), Eclipse Sparkplug B 3.0, IEC 62443 (zones/conduits), CQRS, BFF pattern
**Verification:** OpenBridge facts verified against the OICL GitHub repo, npm, and OpenBridge 5.0 release notes (June 2026)

---

## 1. Verdict (executive summary)

**Building a full PI-Vision-class HMI designer/builder on OpenBridge is feasible — but OpenBridge is one of four required layers, not the whole solution.** The single most important correction to the framing is this:

> Apache Batik is *not* what gives the reference application its drag-and-drop interactivity. That comes from **Konva** (an HTML5 canvas engine). Batik is used for SVG parsing, server-side rasterization (`batik-microservice` SVG→PNG), GVT-level DOM mutation for symbol state, and ISA-101 graphics rendering. So the real question is not "OpenBridge vs Batik" — it is "what is the correct *editor substrate* and *symbol strategy* for a web-native HMI builder, and where does OpenBridge fit."

OpenBridge fits as the **component vocabulary, the ISA-101-aligned visual language (day/dusk/night/bright palettes), and the live-bindable runtime widget set**. It does not provide: (a) the canvas/interaction engine (grid-snap, marquee select, z-order, transform handles, undo/redo); (b) a complete ISA-5.1 process-symbol library (valves, pumps, motors, vessels); or (c) the data-binding / multi-state rule engine. Those three remain custom — which is exactly the boundary the Traverse specification already draws ("genuinely custom: the HPHMI application; the Asset Model service is the differentiated product IP").

**Recommended foundation:** a **DOM + SVG editor** (not Konva), where every placed element is either a native OpenBridge web component or a theme-aware SVG symbol, positioned via CSS transforms over an SVG/HTML interaction overlay. This makes the *runtime* the same components as the *editor*, eliminates the rasterization round-trip, and preserves OpenBridge's core advantage: attribute changes re-render the component automatically. This is the unification win and it retires Batik from the live path entirely.

The remainder of this document substantiates that verdict, answers the two advisory questions (Batik server-side rendering; data-binding model), and lays out a phased transition that reuses the existing AMS infrastructure (single PostgreSQL instance with per-service databases, the existing Kafka cluster, EMQX/Sparkplug for live data, IoTDB for history).

---

## 2. The two applications, side by side

| Dimension | Reference app (PI Vision++ / `xmlgraphics-batik-main`) | Main app (AMS / Traverse Edge) |
|---|---|---|
| Purpose | PI AF + PI Vision clone: HMI designer, asset framework, analysis | Alarm Management System: dual-pipeline (alarm state + edge live + historian) |
| Frontend | React 19 + Vite 7, **Konva** canvas, ECharts, socket.io-client | React 18 + Vite 5, **OpenBridge web components**, AG Grid, MQTT.js, SignalR |
| Designer engine | Konva (canvas) + Batik (SVG render / GVT / server raster) | None yet (this is the gap to fill) |
| Live transport | Socket.IO bridge (`data-gateway`) over Kafka `af.live.stream` | **Sparkplug B over MQTT/WSS (EMQX)** + SignalR for alarms |
| History | IoTDB via platform `QueryController` | IoTDB via `historian-bff` (`/trend`, `/raw`, `/snapshot`) |
| Stream compute | **Apache StreamPipes** (adapters + pipelines) + JVM analysis-service | **Apache Flink 1.18** (single stateful compute layer) |
| Metadata store | PostgreSQL `industrial_vis` (+ CouchDB for SP + legacy displays) | PostgreSQL + TimescaleDB (alarms/soe/config) |
| Real-time cache | Redis | Redis (`snapshot:metric:*`, `alias:*`) |
| Backend | Spring Boot hub + Node.js microservices | .NET 8 API + Java edge services |
| Maturity | ~45% vs full PI AF/Vision; several microservices are stubs/mocks | Production-oriented alarm pipeline, verified June 2026 |

**Architectural conflicts to resolve during unification:**

1. **Compute engine.** Reference = StreamPipes; AMS = Flink-only (enforced at startup; Traverse explicitly forbids the StreamPipes Flink wrapper). → Consolidate on Flink.
2. **Live transport.** Reference = Socket.IO; AMS = Sparkplug B/MQTT. → Consolidate on Sparkplug B/MQTT (Traverse real-time plane).
3. **Display persistence.** Reference = PostgreSQL `display_definitions` (primary) with CouchDB as a legacy fallback. → Consolidate on PostgreSQL; retire CouchDB.
4. **Editor substrate.** Reference = Konva + Batik. → Re-platform onto DOM/SVG + OpenBridge (Section 3).
5. **Namespace.** Reference = AF-derived device paths; AMS = `root.ams.site1.alarms.*`. → Define one UNS in the Asset Model (Traverse §7) and generate the rest.

---

## 3. Feasibility: OpenBridge as the HMI designer foundation

### 3.1 What OpenBridge is (and is not)

OpenBridge is the OICL design system delivered as **Lit-based web components**, Apache-2.0, v1.0.0 with 200+ components, framework-agnostic with React/Vue/Angular wrappers. Its strengths for a process HMI:

- **ISA-101-aligned visual language out of the box.** The palette system (`variables.css`, `data-obc-theme` = bright/day/dusk/night) directly supports the High-Performance HMI doctrine: muted base, colour reserved for abnormal conditions, WCAG-2.1-tuned contrast.
- **Live-bindable by construction.** Because components are web components, updating an attribute re-renders the component — no manual redraw. This is precisely what you want for a live process value or a multi-state symbol.
- **A real automation/instrumentation section** (revamped in OpenBridge 5.0, with HVAC and new system types), plus gauges, indicators, alerts/notifications, navigation and control-room chrome.
- **A Figma → SVG exporter** that emits palette-aware (theme-correct) SVGs — the supported path for authoring custom symbols that stay consistent across palettes.

What OpenBridge **does not** provide, and therefore must be built or sourced:

| Missing capability | Why it matters | Resolution |
|---|---|---|
| Canvas / interaction engine | Drag-drop, grid-snap, marquee, z-order, transform handles, undo/redo | Custom editor layer (Section 3.3) |
| Complete ISA-5.1 P&ID symbol set | OpenBridge is maritime-origin; valve/pump/motor/vessel coverage as ready web components is partial | Theme-aware SVG symbol library via the Figma exporter; migrate the reference app's `Graphics/` set and re-theme to OpenBridge tokens |
| Data-binding / multi-state rule engine | Symbols must react to live tags/alarms (colour/visibility/animation) | Custom binding + rule schema (Section 5) |
| Versioning / diff / persistence | Display lifecycle, comments, rollback | Already exists in the reference app (Module 12) — port it |

**Caveat on the React wrapper.** The OpenBridge React wrapper was partner-only until March 2026 and is still early/unstable (0.0.17). AMS already consumes the **core** web components, which is the right pattern: depend on the framework-agnostic core and keep a thin custom React binding rather than coupling to the early wrapper. Pin to the quarterly `stable`/`latest` (Apache-licensed) channel, not `develop`/`next`.

### 3.2 The four-layer designer architecture you actually need

A PI-Vision-class builder decomposes into four layers. OpenBridge supplies Layer 3 (partially) and Layer 4's theming; the rest is yours.

1. **Editor substrate** — the interactive surface: placement, grid-snap, selection, transform, z-order, alignment guides, undo/redo (command stack), copy/paste, keyboard nudging. *(Section 3.3)*
2. **Binding & rule engine** — design-time binding picker over the UNS; runtime resolution to live/history/alarm transports; multi-state rules (state → attribute/style/animation). *(Section 5)*
3. **Symbol palette** — native OpenBridge components **+** a registered theme-aware SVG symbol library (ISA-5.1 process symbols). Each palette entry declares its bindable inputs and states.
4. **Persistence & runtime** — versioned display documents in PostgreSQL; a runtime renderer that paints the *same* components, live-bound, with snapshot-on-open.

### 3.3 Editor substrate decision: retire Konva, adopt DOM/SVG

There are two viable substrates. The choice is consequential because OpenBridge components are DOM (Lit/shadow DOM) and **cannot be rendered inside a Konva canvas** (Konva draws bitmaps to `<canvas>`; web components live in the DOM tree).

- **Option A — DOM/SVG editor (recommended).** The canvas is an absolutely-positioned DOM/SVG surface. Each placed element is a real OpenBridge web component or a theme-aware SVG symbol, positioned via CSS `transform`. A separate SVG/HTML **overlay layer** draws selection handles, marquee, snap guides, and rulers. Grid-snap, multi-select, z-order, and undo/redo are implemented over a command/transaction model.
  - *Pros:* components render natively and stay live-bindable; the editor and the runtime use identical rendering, so "what you design is what operators see"; no rasterization; theming/accessibility inherited from OpenBridge; export is a DOM/SVG serialization.
  - *Cons:* very large displays (thousands of live nodes) need virtualization and update-rate capping (~1 s, per Traverse §10/§11) — but this is a constraint you already accept on the AMS Live Events path.
- **Option B — keep Konva, rasterize symbols.** Render OpenBridge/SVG symbols to images and blit them onto the canvas. This reintroduces a Batik-like raster step, re-rasterizes on every state change, and discards OpenBridge's reactivity. **Not recommended** for a live process HMI.

**Recommendation: Option A.** It is the modern web-HMI/diagramming pattern (SVG/DOM surface + interaction overlay), it unifies editor and runtime, and it is the only option that preserves the reason to adopt OpenBridge in the first place.

> Practical note: implement the interaction layer either as a thin custom transform/selection system or on top of a mature diagramming/interaction library, but keep the *rendered nodes* as native OpenBridge components/SVG — do not let the diagramming library own rendering.

### 3.4 Multi-state symbols (PI-Vision equivalence)

PI Vision's value is multi-state symbols and parameterized (`%Element%`) displays. Reproduce this with a declarative rule schema attached to each placed symbol:

```jsonc
{
  "symbolId": "valve-gate",
  "binding": { "path": "site1/u200/p101.state", "role": "live" },
  "states": [
    { "when": "value == 'OPEN'",   "set": { "fill": "var(--obc-... )", "animation": "none" } },
    { "when": "value == 'CLOSED'", "set": { "fill": "var(--obc-... )" } },
    { "when": "quality != 'GOOD'", "set": { "overlay": "stale" } }   // NAMUR NE107 status overlay
  ]
}
```

Anchor state semantics to **NAMUR NE107** (instrument status: good/uncertain/bad/maintenance) and **ISA-18.2** (alarm states) so symbol colouring is standards-driven rather than ad hoc, and reserve saturated colour for abnormal states per ISA-101.

### 3.5 Feasibility conclusion

Feasible, with these conditions: adopt the DOM/SVG substrate; treat OpenBridge as vocabulary + theme, not as the editor; fill the ISA-5.1 gap with a theme-aware SVG symbol library (migrating the existing `Graphics/` assets); build the binding/rule engine on the UNS. None of these conflicts with the Traverse architecture — they are the items Traverse already classifies as "genuinely custom."

---

## 4. Advisory answer — server-side rendering / Batik (Question 2)

**Best practice: retire Apache Batik from the unified platform, and add a small headless-Chromium render service only if (and only where) server-side image output is actually required.**

Reasoning:

- In a DOM/SVG + OpenBridge runtime, **live updates are browser DOM mutations** — there is no need for server-side GVT mutation or Batik on the interactive/live path. That entire Batik role disappears.
- The only legitimate residual need for server-side rendering is **headless image output**: display thumbnails for the gallery, PNG/PDF export, and scheduled report snapshots for non-browser consumers.
- **Batik is the wrong tool for that residual need**, because Batik is a Java SVG engine that *does not execute web components* (no Lit, no shadow DOM, no JS-driven OpenBridge rendering). A Batik render of an OpenBridge display would not match what operators see.
- The correct approach for web-component-based rendering is **headless Chromium (Playwright or Puppeteer)**: render the actual runtime display, freeze bindings at a timestamp, and screenshot/PDF it. This guarantees fidelity — identical components, palette, and bindings — which Batik structurally cannot.

**Net:** drop Batik (and `batik-microservice`). If thumbnails/exports/reports are in scope (they usually are for a display gallery), introduce one stateless **render service** wrapping headless Chromium, callable by the Display service. If they are not needed now, defer it entirely. Client-side PNG export (canvas/SVG serialization in the browser) covers ad-hoc "export this screen" without any server component.

---

## 5. Advisory answer — recommended data-binding model (Question 3)

**Recommended model: bind to a logical UNS path + a role, resolved at runtime by a Binding Resolver / BFF to the correct transport. Never bind a display directly to a physical topic, series, or socket.**

This is the CQRS-correct, ISA-95-aligned model and it matches the principles already established in your stack (read/write separation; the BFF is architecturally non-negotiable; snapshot-on-open is mandatory under QoS-0/no-retain Sparkplug).

### 5.1 Binding shape (stored in the display document)

```jsonc
{
  "path": "site1/u200/p101.disch_press",   // logical UNS / ISA-95 path
  "role": "live"                            // live | history | alarm
}
```

### 5.2 Resolution (Binding Resolver / BFF)

The resolver maps `path + role` to a concrete transport using the **Asset Model** as the single source of truth that ties one identity across all three representations (Traverse §7):

| Role | Transport (existing AMS) | Mechanics |
|---|---|---|
| `live` | **Sparkplug B on EMQX** | Browser uses MQTT.js over WSS + `sparkplug-payload`; **snapshot-on-open from Redis** (`snapshot:metric:*`, `alias:*`) to defeat the QoS-0/no-retain blank-screen problem; then live `DDATA` deltas; alias→name resolution from the registry |
| `history` | **IoTDB via `historian-bff`** | `/trend?series=&start=&end=&width=` (decimated to pixel width) and `/raw` for zoom/export |
| `alarm` | **SignalR (Pipeline A)** and/or `traverse.alarm.live.alarms` | Live alarm banner/state; ack via the event-store API |

### 5.3 Why not bind to raw paths directly

- It hard-couples displays to physical topology; any retopology (new edge node, renamed device) breaks every display.
- It defeats CQRS (the UI would reach into stores directly) and prevents the BFF from enforcing authz, decimation, and session pooling.
- It loses the one-identity guarantee. The Asset Model is what maps `IoTDB tree path ↔ Sparkplug topic/metric+alias ↔ alarm source`; binding through it is what keeps all three planes consistent.

This is also the strongest justification for the confirmed **full-parity scope**: the Asset Model / hierarchy engine is not optional decoration — it is the resolution layer that makes binding clean across live, history, and alarm planes simultaneously. Subscribe **per open screen only** and unsubscribe on navigation to bound MQTT fan-out (Traverse §8.6).

### 5.4 Display lifecycle, roles, and the configuration-vs-data principle (ISA-101) — **recorded decision**

**Decision:** Adopt the ISA-101 two-tier display model — *controlled displays* (engineer-owned, versioned, MOC-gated) vs *personal views* (operator-owned, non-authoritative) — with live values always re-bound at open and **never persisted into the display**. This is a recorded decision, not an open one; the alternatives violate either ISA-101's managed-display lifecycle or CQRS, so no "Option B" is carried.

ISA-101.01 (ANSI/ISA-101.01-2015, *Human Machine Interfaces for Process Automation Systems*) treats the HMI as a managed lifecycle — philosophy → style guide → design → build → operate → maintain → audit — analogous to ISA-18.2 for alarms. The five sub-decisions that follow from it:

1. **A saved display stores configuration only, never values.** The display document in `traverse_displays` holds layout + symbols + `path/role` bindings. On open, the runtime re-subscribes and paints current values (snapshot-on-open from Redis, then `DDATA`). No process value is ever written into the display record. "Revisit a display and see real values" therefore means *re-binding to the live plane each time*, not replaying stored values — persisting values would be stale data masquerading as live and would violate CQRS.
2. **Authoring/deploying controlled displays is an engineer-role, versioned, MOC-gated action.** These live in `display_definitions` / `display_versions` with diff + comments, behind the engineer/admin RBAC tier. "Deploy" is a distinct, audited transition, not a silent save. Operators cannot edit controlled displays.
3. **Operators get a separate "personal views" feature** — ad-hoc trend groups, watchlists, favourites — stored apart from the controlled display lifecycle in its own table (`operator_views`), owned by the operator, with no MOC and no required versioning. This is the legitimate "operator saves something and revisits it" path; keeping it separate prevents pollution of the authoritative display set.
4. **"Revisit" has two distinct meanings, both supported:** reopening a display shows *live current values* (re-binding); viewing an earlier *version* shows earlier *configuration* (the MOC/audit trail via version-diff). They are different features on different data — do not conflate them.
5. **Quality is mandatory on reopen.** Anything stale/uncertain/bad must be surfaced via NAMUR NE107 status (and ISA-18.2 for alarm state), driven by the snapshot/`DDATA` quality field through the symbol's multi-state rules. Never display a last-known number as if it were live.

**Sequencing:** sub-decisions 1, 2, 4, 5 land in Phase 2 (designer MVP + runtime); the operator personal-views feature (sub-decision 3) lands in Phase 3. If launch needs only engineer-authored displays + live runtime, ship 1/2/4/5 first and add personal views later.

**RBAC / storage split (summary):**

| Tier | Artifact | Storage | MOC / versioning | Who edits |
|---|---|---|---|---|
| Controlled display | Authoritative operator screens (L1–L4) | `display_definitions` / `display_versions` (`traverse_displays`) | Yes — versioned, diff, comments, audited deploy | Engineer / Admin |
| Personal view | Trend groups, watchlists, favourites | `operator_views` | No | Operator (own views only) |

---

## 6. Target architecture for the unified platform

### 6.1 Service topology (after unification)

```
                         React HMI (src/frontend-ob, OpenBridge)
        ┌───────────── Designer (/designer, /displays)  +  Operator runtime + Alarm console ─────────────┐
        │ DOM/SVG editor • OpenBridge palette • SVG symbol library • binding picker over UNS              │
        └───────────────┬───────────────────────────┬───────────────────────────┬──────────────────────┘
                        │ live (MQTT/WSS)            │ history (REST)            │ alarms (SignalR/REST)
                        ▼                            ▼                           ▼
                  EMQX (Sparkplug B)          historian-bff (IoTDB)        AMS API (.NET 8)
                        ▲                            ▲                           ▲
                        │ Sparkplug + Redis          │ time-series               │ projections
                  sparkplug-edge-node          Apache IoTDB                 PostgreSQL (alarms.*)
                        ▲                            ▲                           ▲
                        └──────────── Apache Kafka (single cluster) ─────────────┘
                                              ▲
                                       Apache Flink (single compute: alarm SM, RBE, persistence, analysis, KPIs)

   Design-time services (Spring Boot / .NET), each owning a database in the single PostgreSQL instance:
     Asset Model svc ──(UNS source of truth)        Template svc        Analysis def svc        Display svc
   Binding Resolver / BFF  ──(UNS path+role → Sparkplug / IoTDB / SignalR)
   [optional] Headless-Chromium render svc ──(thumbnails / PNG / PDF)
```

### 6.2 PostgreSQL — one instance, per-service databases

Use the existing PostgreSQL+TimescaleDB instance. **Recommendation: separate logical databases per bounded context** (not just schemas), so each migrated service owns its own schema and migrations independently — preserving the reference app's microservice ownership while sharing one instance, one backup target, one set of credentials policy.

| Database | Owner service | Origin |
|---|---|---|
| `ams` (existing: `alarms`, `soe`, `configuration`, `analytics`, `audit`…) | AMS API | unchanged |
| `traverse_assets` | Asset Model service | reference `elements`, `attribute_instances`, `state_machine_definitions` |
| `traverse_templates` | Template service | reference `element_templates`, `attribute_templates`, `template_versions` |
| `traverse_analysis` | Analysis-definition service | reference `analysis_definitions`, `analysis_executions` |
| `traverse_displays` | Display service | reference `display_definitions`, `display_versions`, `display_comments`; **plus `operator_views`** (operator-owned personal views — trend groups/watchlists/favourites; no MOC/versioning, see §5.4) |
| shared: `uom_*`, `categories`, `roles`/`users`/`audit_logs` | choose one owning DB or a `shared` DB | reference Modules 6/7/8 |

Notes: TimescaleDB is already present and is irrelevant to AF metadata (relational, low-cardinality) — do not put templates/displays in hypertables. Time-series stays in IoTDB; relational lifecycle stays in PostgreSQL (the same division your stack already enforces). If you later need cross-context joins, consider consolidating to **schemas within one database** instead — but separate databases is the cleaner default for independent service ownership.

### 6.3 Kafka — reuse, unify the topic catalog

Reuse the existing cluster. Reconcile the two naming conventions (`af.*` from the reference app vs `traverse.alarm.raw-alarms`/`traverse.alarm.current-alarm-state`/`live.*` in AMS). Recommended: keep AMS topics as-is; bring asset/template/analysis events under a single documented convention (e.g. `asset.*`, `template.*`, `analysis.*`, or a UNS-prefixed scheme), and route computed/live tag data onto the existing `traverse.live.metrics` / `traverse.alarm.live.alarms` path so designed HMIs consume the **same** live plane as the AMS Live Events tab. Publish one unified topic catalog and avoid collisions.

### 6.4 EMQX / MQTT — the single live transport

All designed-HMI live data flows over **Sparkplug B on EMQX**, exactly as the AMS Live Events tab already does (subscribe `spBv1.0/ams_site1/DDATA/ams_edge1/#`, snapshot-on-open from Redis, alias resolution). This **replaces** the reference app's Socket.IO `data-gateway`/`realtime-service` path. One real-time mechanism for the whole platform; TLS + per-client ACLs per IEC 62443.

### 6.5 IoTDB — reuse, unify the namespace (**confirmed naming standard**)

Reuse the existing IoTDB. **Confirmed canonical UNS path:** `root.<site>.<unit>.<device>.<measurement>` — contextual, human-readable, e.g. `root.houston.crude1.pump101.discharge_press` (insert `<area>` only where a site genuinely needs it). Define this identity **once** in the Asset Model and generate the three representations from it (Traverse §7):

| Representation | Pattern | Example |
|---|---|---|
| IoTDB tree path | `root.<site>.<unit>.<device>.<measurement>` | `root.houston.crude1.pump101.discharge_press` |
| Sparkplug topic / metric | `spBv1.0/<site>_<unit>/DDATA/<edge>/<device>` ; metric `<device>/<measurement>` (+ alias) | `spBv1.0/houston_crude1/DDATA/<edge>/pump101` ; `pump101/discharge_press` |
| Alarm source reference | resolves to the same `<site>/<unit>/<device>` + condition | `houston/crude1/pump101` |

ISA-95 alignment: Site (`houston`) → Unit (`crude1`) → Equipment/Device (`pump101`) → Measurement (`discharge_press`). The existing AMS `root.ams.site1.alarms.*` tree is **migrated** onto this contextual tree (path-mapping/alias during transition; all new series written to the contextual tree). The Binding Resolver/BFF resolves `path + role` against this namespace; no display references the raw IoTDB path or Sparkplug topic directly.

### 6.6 StreamPipes & CouchDB — retire (**confirmed**)

The reference app uses StreamPipes (adapters + pipelines) and CouchDB (SP metadata + legacy display store). AMS is Flink-only by rule, and Traverse explicitly forbids the StreamPipes Flink wrapper. **Confirmed: retire StreamPipes and CouchDB; Flink only.** Move computed-tag/analysis logic to Flink (SQL/MATCH_RECOGNIZE/CEP), and persist displays in PostgreSQL (already the reference app's primary store).

---

## 7. Reference services → target mapping (full parity)

| Reference component | Disposition | Target |
|---|---|---|
| `industrial-platform` (Spring Boot hub) | Split by concern | Asset Model + Template + Analysis-def services; AF-import retained as a module |
| `template-service` (Module 1) | **Port** | Java/Spring service, DB `traverse_templates`, emits `template.*` to Kafka |
| `hierarchy-service` (Module 2, stub) | **Consolidate & complete** | **Asset Model service** = UNS source of truth (the product IP), DB `traverse_assets` |
| `analysis-service` (Module 5) | **Re-platform execution to Flink** | Keep design-time CRUD + DB `traverse_analysis`; runtime = Flink SQL/CEP → IoTDB (computed series) + live topics |
| Display engine (Module 12) | **Port** | Display service, DB `traverse_displays`, versioning + diff + comments |
| `BindingResolverService` | **Promote** | First-class **Binding Resolver / BFF** (UNS path+role → Sparkplug/IoTDB/SignalR) |
| Designer frontend (Konva + Batik) | **Re-platform** | New routes in `src/frontend-ob`: DOM/SVG editor + OpenBridge palette + SVG symbol library |
| `Graphics/` SVG symbols | **Migrate & re-theme** | Theme-aware SVG symbol library via OpenBridge Figma exporter (fills ISA-5.1 gap) |
| `realtime-service` / `data-gateway` (Socket.IO) | **Drop** | EMQX Sparkplug + SignalR |
| `query-service` (mock) | **Drop** | `historian-bff` |
| `batik-microservice` | **Drop** | Optional headless-Chromium render service (Section 4) |
| StreamPipes + CouchDB | **Drop** (see §6.6) | Flink + PostgreSQL |
| Auth/RBAC (JWT, 4 roles) | **Unify** | Single AMS identity model; ISA-101 role tiers (admin/engineer/operator/viewer) |
| `graph-service` (Neo4j), `ml-inference-service` | **Defer** | Out of first-release scope |

---

## 8. Phased transition plan

Each phase is independently shippable and validates one risk before the next.

**Phase 0 — Foundations & decisions (enabling).**
Define the unified UNS/namespace; provision per-service PostgreSQL databases; publish the unified Kafka topic catalog; unify auth/RBAC; complete the OpenBridge licensing review (build on `stable`/Apache releases); confirm the open decisions in Section 9. *Exit:* one identity model, one namespace, one topic catalog, agreed scope.

**Phase 1 — Asset Model + Binding Resolver.**
Stand up the Asset Model service (consolidate `hierarchy-service`) as the UNS source of truth; build the Binding Resolver/BFF mapping `path + role → Sparkplug / IoTDB / SignalR`. *Exit:* a logical tag resolves end-to-end to live (EMQX snapshot+DDATA), history (IoTDB), and alarm (SignalR) against existing AMS data — the binding model proven before any UI.

**Phase 2 — Designer MVP (the core feasibility proof).**
DOM/SVG editor substrate (place, grid-snap, multi-select, z-order, transform, undo/redo); palette = OpenBridge components + a starter set of migrated theme-aware SVG symbols; property inspector with a binding picker that browses the UNS; save to `traverse_displays` as **controlled displays** (config-only, versioned, engineer-role, audited deploy — §5.4 sub-decisions 1, 2, 4). Runtime renderer = identical components, live-bound (snapshot-on-open + DDATA), per-screen subscription, with **mandatory quality-on-open** (NE107/ISA-18.2 status surfaced, never a stale value shown as live — §5.4 sub-decision 5). *Exit:* design a faceplate, bind it, deploy it, watch it update live from EMQX with correct quality indication — in one app.

**Phase 3 — Templates, multi-state, parameterized displays, operator personal views.**
Port `template-service`; implement the multi-state/rule schema (NE107 / ISA-18.2 anchored); `%Element%` context switching; display versioning/diff/comments; add the operator **personal-views** feature (`operator_views` — trend groups/watchlists/favourites, operator-owned, no MOC — §5.4 sub-decision 3). *Exit:* template-driven, reusable, parameterized displays at PI-Vision parity, plus operator-savable personal views separated from the controlled set.

**Phase 4 — Analysis on Flink.**
Re-platform analysis execution to Flink SQL/CEP; keep analysis-definition CRUD; computed series → IoTDB + live plane. *Exit:* AF analysis parity, Flink-only compliant.

**Phase 5 — Legacy decommission + hardening (reporting deferred).**
Thumbnails and ad-hoc export are handled client-side (resolved per ISA-101, §9), so no headless render service is built at launch — add it later only if automated/scheduled report images become a requirement. Decommission Konva, Batik, StreamPipes, CouchDB, Socket.IO services, and mock services (only after parity is verified); IEC 62443 segmentation review; observability SLOs; concurrency load test to the target operator count. *Exit:* unified platform, legacy retired.

---

## 9. Risks, mitigations, and open decisions

**Risks & mitigations**

| Risk | Mitigation |
|---|---|
| OpenBridge React wrapper early/unstable (partner-only until Mar 2026, 0.0.17) | Consume the **core** web components directly (AMS already does); thin custom React bindings; pin to `stable`/`latest` (Apache), not `develop`/`next` |
| OpenBridge licensing nuance | Build on the Apache-aged `stable` channel; legal review (consistent with Traverse §12 on delayed/early-access licensing) |
| ISA-5.1 process-symbol gap in OpenBridge web components | Theme-aware SVG symbol library via the Figma exporter; migrate `Graphics/`; treat SVG symbols as a first-class palette type |
| Namespace reconciliation (`root.ams.site1.*` vs AF-derived) | Define UNS once in the Asset Model; generate IoTDB path / Sparkplug topic / alarm source from it (Traverse §7) |
| Re-platforming analysis to Flink (effort) | Keep design-time CRUD; migrate execution incrementally; SQL/CEP first, Java UDF only for stateful KPIs |
| Many live components per screen (performance) | Per-open-screen subscription; snapshot-on-open; cap update rate ~1 s; virtualize lists (Traverse §10/§11) |
| CQRS discipline erosion | Bindings resolve only through the BFF; designer never writes current values to the historian or reads live values from it |

**Recorded decisions (settled — implement, do not re-litigate):** the ISA-101 two-tier display model (controlled displays vs operator personal views), configuration-only persistence (no values in the display), and mandatory quality-on-open are recorded in §5.4. Additionally confirmed: **designer embedded in `src/frontend-ob`**; **StreamPipes + CouchDB retired (Flink only)**; **separate PostgreSQL database per service**; **contextual UNS/IoTDB namespace** `root.<site>.<unit>.<device>.<measurement>` (e.g. `root.houston.crude1.pump101.discharge_press`), per §6.5.

**Reporting/export — resolved per ISA-101.** A controlled display is fully rendered in the browser at design time, so image output is a config-time/client-side artifact, not a server concern: **thumbnails** are captured **client-side at save** and stored with the display record (no server render service); **ad-hoc export** is **client-side**; **automated/scheduled/notification report images** are **deferred** (optional headless-Chromium service, not at launch — added later only if required).

**No platform decisions remain open.**

---

## 10. One-paragraph summary

Use OpenBridge as the component vocabulary, the ISA-101 visual language, and the live-bindable runtime widget set — not as the editor. Build the designer as a DOM/SVG surface (retiring Konva) so the editor and the deployed runtime render the identical components, fill the ISA-5.1 process-symbol gap with theme-aware SVGs exported from OpenBridge's Figma toolchain, and drive everything through a UNS-based binding model resolved by a BFF to Sparkplug (live) / IoTDB (history) / SignalR (alarms). Retire Batik from the live path entirely and replace its only legitimate residual role (server-side image output) with headless Chromium, added only if reporting/thumbnails are in scope. Reuse the existing PostgreSQL (per-service databases), Kafka cluster, EMQX, and IoTDB; consolidate compute on Flink and retire StreamPipes/CouchDB/Socket.IO. Sequence the migration so the binding model is proven (Phase 1) before the designer (Phase 2), then layer templates, analysis-on-Flink, and reporting/decommissioning on top.
