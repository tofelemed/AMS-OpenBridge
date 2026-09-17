# What's new in v2.5 — a walkthrough for testing on the lab

This page explains, in plain words, what release v2.5 adds to the Loop Performance (CPM) part of the
application, where each new thing lives in the UI, how to try it on the lab, what the OT side has to
send for it to work, and how the pieces fit together. The formal records are `checklist.md`
(task status), `changes_tracker.md` (CHG-026/027/028, what to deploy) and
`docs/next-release/` (spec, audit, acceptance evidence).

## 0. Before you start

| What | Where |
|---|---|
| UI | http://localhost:3000 — login `admin` / `ChangeMe123!` (the lab bootstrap admin) |
| API (everything goes through the gateway) | http://127.0.0.1:8081/api/v1/cpm/... with a Bearer token from `POST /api/auth/login` |
| Flink dashboard | http://localhost:8082 — seven `AMS - CPLM ...` jobs must be RUNNING, all on **one** jar |
| Kafka UI | http://localhost:8085 |
| Lab MQTT broker for simulators | `mosquitto-test`, host port **1884**, user `ams_ingest` / `ams-ingest-test` |

The lab as of 2026-09-17 10:52: the five v2.5 service images (ingestion, cplm-api, historian-bff,
frontend, auth) are built from commit `1cc8a8b4` and running; the six CPLM engine jobs run jar
`4ea1da78`; an OT simulator is publishing four pilot loops (FIC10405, PIC10201, TIC10101 and the
unregistered FIC99999) for 8 hours and deliberately **not** FIC10302, which is reserved for the
step-test simulator. `FIC10302` also runs under an activated configuration bundle (v1, hash
`f9153b00…`, G4 warn ratio 4.5) left by the slice-3 proof.

Roles that matter in this release (Administration → Users to create people):

| Role | Can |
|---|---|
| Engineer | read gate configuration, create/edit drafts, validate, run shadow evaluations, start analysis runs, manage instrument bindings |
| Supervisor (if the site defines it) | approve a validated bundle, review a response model |
| Admin | everything, including deploy (activate) and roll back |

The approver must be a **different person** than the draft's author: self-approval is refused (403).

## 1. The big picture — how data flows now

```
OT gateway (MQTT)                    Instrumental NE107 publisher (MQTT)
  OT/<site>/<fcs>/<class>/<loop>/PIDParams/<param>      traverse/instrumental/v1/<tenant>/<site>/devices/<dev>/state
        │                                                        │
        ▼  ingestion-service (joins params into one 5 s tuple    ▼  ingestion-service (strict schema, dedupe)
        │  per loop; per-role time + quality + held flag)        │
        ▼                                                        ▼
  Kafka traverse.cpa.loop.samples.v1 (schema 1.1)        Kafka traverse.cpa.instrument.health.v1
        │                                                        │
        ▼  Flink (all the maths lives here)                      ▼
  ┌ Short Feature Engine   (1m…60m windows: G0–G4)        Instrument Context Engine (device state → per-loop eligibility)
  │ Long Diagnostics Engine (4h/12h/24h: G5–G11, G13)             │  traverse.cpa.context.instrument-health.v1
  │ Condition Engine        (fast G10 limit-dwell / G11 freeze)   │
  │ Response Engine         (G12: step/SP events → fitted models) ◄┘
  │ Gate Fusion Engine      (G14/G15 verdict: observations → hypotheses → confirmation)
  └── every result carries: method_run_ids, bundle_hash, jar_sha256, source_commit, purpose
        │  Kafka traverse.cpa.clpm.* (gate results, conditions, response results, evidence chunks, config ACKs)
        ▼
  cplm-api (persists verbatim, never recomputes) → PostgreSQL traverse_cplm → REST /api/v1/cpm/* → React UI
        ▲
        └── cplm-api control plane: signed configuration bundles → Kafka traverse.cpa.context.gate-config.v1 → every Flink job
```

Three ideas run through the whole release:

1. **Nothing is assumed.** Missing quality is `UNKNOWN`, not `GOOD`; a held value says it is held;
   a missing peer says `UNAVAILABLE`; missing evidence keeps an episode open instead of closing it.
2. **Every number is traceable.** Each gate evaluation is a *method run* with an id, the jar that
   produced it, the configuration bundle it used and the raw arrays it computed from. The UI opens
   exactly that run — never "the latest".
3. **Configuration is governed.** Thresholds and settings are typed properties in a catalogue (165
   of them), edited as a draft, validated, shadow-tested, approved by someone else, then pushed to
   the engines, which acknowledge before anything switches.

## 2. What the OT side must send (ingestion contract)

### 2.1 Control-loop signals (profile "Control-Loop Signals (CPA)")

Configured in **Administration → Data Sources** (one entry per OT gateway/broker). The loop must
exist in **Loop Registry** first, otherwise its messages are parked in the DLQ as `LOOP_NOT_REGISTERED`.

- Topic: `OT/<site>/<fcs>/<class>/<loop_tag>/PIDParams/<param>` (subscription `OT/+/+/+/+/PIDParams/+`).
  Example: `OT/HDPE/FCS0101/Flow/FIC10302/PIDParams/PV`.
- Parameters: `PV`, `SP` (or `SV`), `OP` (or `MV`), `MODE` (numeric, mapped by `mode_value_map`
  e.g. `1→AUT, 2→MAN, 3→CAS, 4→IMAN`), optional `VP`/`POS` (valve position feedback), tuning
  `P/I/D/GW` carried opaque. Anything else → DLQ `UNKNOWN_PARAMETER`.
- One JSON message per parameter:

```json
{ "value": 60.4, "unit": "t/h", "quality": "GOOD",
  "ts": "2026-09-17T06:52:44.761Z", "source": "opc_ua", "seq": 0,
  "device": "FIC10302", "area": "FCS0101", "line": "Flow", "site": "HDPE",
  "process_unit": "Flow", "equipment": "FIC10302", "item": "PV" }
```

- **Quality (new in v2.5):** the data source declares how the gateway encodes quality —
  `quality_protocol` = `STRING_ENUM` (`GOOD|UNCERTAIN|BAD` strings; the default when unset),
  `OPC_DA` (8-bit word), `OPC_UA` (32-bit StatusCode), `SPARKPLUG` (192/500/0) or `NONE` (the
  source has no quality → every sample is `UNKNOWN`). Anything undecodable is `UNKNOWN`, and
  `UNKNOWN` is never treated as good. `NaN`, `Infinity` or overflow values go to the DLQ as
  `NON_FINITE`. The plant tool `scripts/set-quality-protocol.py` sets the field on every source.
- Timestamps must be ISO-8601; unparseable or future-dated → DLQ.

What the ingestion service produces (Kafka `traverse.cpa.loop.samples.v1`, schema **1.1**): the
old top-level fields are unchanged, and a new `roles{}` block carries per-role provenance —
captured live from the lab:

```json
{ "loop_id": "TIC10101", "event_ts_ms": 1789627964761, "pv": 182.08, "sp": 182, "op": 33.46, "mode": "AUT",
  "quality": "GOOD", "loop_type": "TIC", "site": "hdpe", "source_fcs": "FCS0101",
  "schema_version": "1.1", "binding_revision": 3386766494735662605, "grid_seconds": 5,
  "roles": {
    "pv": { "value": 182.08, "sample_ts_ms": 1789627964761, "verified_ts_ms": 1789627964761,
            "quality_native": "GOOD", "quality_protocol": "STRING_ENUM", "quality": "GOOD",
            "unit": "", "held": false, "age_ms": 0 },
    "sp": { "...": "same shape" }, "op": { "..." : "" }, "vp": { "held": true, "age_ms": 93000 }, "mode": { "..." : "" } } }
```

`held=true` means the value was carried over from an earlier tick (VP and MODE are held between
updates); `age_ms` says for how long. The engines use this: a VP older than 60 s is not used as
positioner evidence, and a quality-only change is a real change (the live feed emits it).

### 2.2 Transmitter health (profile "Transmitter Health (Instrumental NE107)")

A second data-source type, one per Instrumental publisher. Instrumental's real publisher is
external and **not delivered yet** — on the plant every loop will show `NOT_CONFIGURED` health until
it ships, which is the intended behaviour, not a defect. The lab uses a simulator.

- Topics (retained state, non-retained events, retained source availability with an OFFLINE last-will):
  `traverse/instrumental/v1/{tenant}/{site}/devices/{device_id}/state`, `.../devices/{device_id}/events`,
  `.../sources/{source_id}/availability`.
- Every message carries an envelope (`schema_version "1.0"`, `message_kind`, `observation_id`,
  `tenant_id`, `site_id`, `producer_id`, `producer_epoch`, `sequence`, `source_id`, `device_id`,
  `observed_at`, `verified_at`, `published_at`, `state_revision`, `state_complete`) and a state
  (`active_flags` ⊂ `F,C,S,M`, `native_status`, `collection_state`, `measurement_impact`,
  `diagnostics[]` with `affected_variable_ids`, cause, remedy). Aliases like `first_seen` are
  rejected; the topic's tenant/site/device must equal the payload's; duplicates are dropped and a
  duplicate id with a different payload is an `INTEGRITY_CONFLICT`.
- The full contract with examples: `docs/next-release/instrumental-health-contract.md`;
  JSON schemas: `contracts/instrumental-health/v1/`.
- A device is tied to a loop signal by an effective-dated **binding** (API only in this release:
  `POST /api/v1/cpm/loops/{id}/instrument-bindings`, permission `cpm.context.manage`). On the lab
  `TT-10302` is bound to `FIC10302` PV from source `instr-prm-1`.

## 3. What's new, feature by feature

### 3.1 Qualified data — quality, time and holds are real facts

- **Where:** Overview → loop focus shows `live · source <time>` — the time of the newest *source*
  sample, separate from the feed heartbeat (a heartbeat keeps the feed alive but does not make a
  value fresh). Performance → G0 cell → the reason names `QUALITY_UNKNOWN` / unknown-quality
  percentage. Evidence Workbench → G0 view shows per-role ribbons of accepted/rejected samples with
  the hold kind.
- **Try:** restart the OT simulator with quality flips —
  `python ams-sims/sim_ot_gateway_mqtt.py --minutes 30 --quality-flip 0.2 --exclude FIC10302` —
  and watch G0 on the pilot loops degrade with a named reason instead of silently passing.

### 3.2 Gate semantics corrected (G2, G4, G10, G11) and a fast condition path

- G2 setpoint stability band is span-relative (unit-independent); G4 control activity uses
  profile thresholds and a dimensionless ratio; G10 limit dwell is measured in **seconds** against
  the loop's declared engineering range (0–100 fallback flagged); G11 freeze episodes are kept as
  a list — a one-hour freeze inside 24 h is still an event.
- A new **Condition Engine** detects limit dwell and freezes within a minute, without waiting for
  the 4/12/24 h windows; conditions are fused into the verdict and listed per loop
  (`GET /loops/{id}/conditions`).
- **Where:** the fast conditions themselves are API-only in this release
  (`GET /api/v1/cpm/loops/{id}/conditions?from&to`, no page yet); what you see in the UI is their
  effect on the verdict: Performance G10/G11 cells, the Loop Events episode the fused window opens,
  and the Evidence Workbench G10 / G11 views (dwell and freeze episodes drawn as intervals).
- **Try:** `python scripts/sim/loop_freeze_sim.py --loop FIC10301 --minutes 5` (constant PV, OP at
  the low limit) → within ~2 minutes `GET /loops/FIC10301/conditions` lists the OPEN freeze and
  limit-dwell conditions; the next fused window shows G11 / G10 on FIC10301 in Performance.

### 3.3 Fusion v2 — observations, hypotheses, confirmation

The verdict engine (G15) now separates what was **observed** (oscillation, effort, geometry, lag
asymmetry, limit, freeze — each with score and support), what is **hypothesised** (stiction,
tuning, external disturbance, sensor, actuator limit — with evidence groups and contradictions)
and what is **confirmed** (G14). A valve fault is never confirmed just because a VP signal exists:
confirmation needs positive non-following evidence (VP tracking error over a dwell) or an approved
test record; healthy VP tracking is recorded as a contradiction and demotes the stiction hypothesis.

- **Where:** Investigation page (hypotheses come from the server now, with their contradictions),
  Performance → G14/G15 cells, Evidence Workbench G14 (evidence table, no fake certainty curve) and
  G15 (ranked hypotheses exactly as fusion uses them).

### 3.4 Episodes — availability vs condition (Loop Events)

Missing evidence no longer closes an episode. Each event carries two facts: the **condition**
(OPEN/CLOSED) and the **availability** (OBSERVED / UNOBSERVABLE). A window that could not be
evaluated marks the episode unobservable and leaves it open; only a qualified contrary result with
enough support closes it, and overlapping windows no longer multiply persistence counts.

- **Where:** Loop Events → each row shows both pills; filters for each.

### 3.5 Run identity and the Evidence Workbench (the biggest UI addition)

Every gate result row now carries `method_run_ids` (one id per gate), `bundle_hash` (the
configuration it ran under), `jar_sha256` + `source_commit` (the build), `purpose`
(LIVE / REPLAY / SHADOW / EVIDENCE_RECONSTRUCTION) and `dataset_hash`. The engines also emit the
exact intermediate arrays they computed from (ACF, PSD, cycle fits, lag structure, polygons, dwell
events, health lanes, …) as checksummed evidence chunks stored in PostgreSQL.

- **Where:** the nav entry **Evidence Workbench** opens like every other page: scope filter, loop
  search, then **Window** (24h / 12h fused verdicts, 1m–60m short features, 4h long diagnostics) and
  **Evaluated window** (newest first, each with its state and age; *Load older windows*, *Jump to
  date*). Picking a loop lands on its newest window that carries run identity; the URL always names
  the run, so a link is shareable. Or Performance → click any gate cell → **Open in workbench ›**
  (disabled on rows older than v2.5). The page: one fact row (window in the site zone, samples,
  mode, evidence readiness, age, copyable run id, Newer / Older / Newest), a **gate strip** (the 17
  gates as status chips — ✓ ! ✕ — grouped by tier, click or arrow keys to switch), then the reading
  column — **verdict card** (status, one sentence, key numbers), signal context lanes (the run's own
  qualified samples, or the historian's trend labelled as such when the run kept no arrays), the
  gate's charts (data table / CSV behind a disclosure), flags — and a collapsible **Explain** column
  (what the gate asks, method, why this result, parameters used, configuration the run used, identity).
- 17 views: G0 data qualification, G1 mode/authority, G2 SP events, G2r operating region, G3 objective
  error, G4 control activity, G5 oscillation (real ACF), G6 spectrum (Welch PSD in signal²/Hz),
  G7 waveform fits, G8 lag structure, G9 cycle geometry, G10 actuator, G11 measurement + NE107
  lanes, G12 system response, G13 interaction, G14 confirmation, G15 decision. Every chart has one
  axis per unit (PV EU and OP/VP `pp` never share an axis), no null bridging, site time zone.
- When evidence is missing the view says so (`EVIDENCE_PENDING`, `EVIDENCE_EXPIRED`,
  `UNSUPPORTED_METHOD`, `NOT_EVALUATED`…) instead of drawing an empty chart. Expired evidence can be
  rebuilt under the original identity (`POST /analysis-runs` purpose `EVIDENCE_RECONSTRUCTION`).
- Governance → **Version provenance** shows which jar / commit produced today's verdicts;
  `GET /capabilities` and `GET /gate-catalogue` are the machine-readable truth of the installed build.
- Historical page: two axes (EU left, `pp` right), tooltip with unit, sample time, verified time,
  hold kind and quality; `?normalize=1` is an explicit choice.

### 3.6 G12 — real system-response analysis (System Response page)

G12 was a yes/no "step test seen" flag. It is now an event-driven analysis: the **Response Engine**
detects setpoint/input steps (servo step, cascade SP step, exogenous input test, ramp tracking…),
captures the response with a state machine (candidate → capturing → qualified → estimating →
validating → complete / rejected / censored with a reason), measures it (t10/t50/t63/t90, settling
against the response band and the target band, overshoot, IAE/ISE/ITAE, coverage) and fits
candidate models (FOPDT, SOPDT, underdamped, integrating + lag) with uncertainty, then validates on
a hold-out event (free-run vs one-step RMSE, residual whiteness). 52 catalogue quantities, each with
unit, path and a reason when null (an integrating loop has no static gain — `process_gain = null,
reason INTEGRATING`). Controller form/frequency margins and a SIMC tuning *suggestion* are computed
only when the model is validated and the controller form is known; nothing is ever written to the DCS.

- **Where:** nav **System Response**: pick the loop with the scope filter + loop search (as on every
  CPM page) or arrive from a G12 view in the workbench. Left = the loop's real events, newest first,
  one line each (time · type · path · one state · the finding in words); the censored candidates
  (superseded by a later change, source gap - most of what the detector captures) are **counted**,
  "Show n censored candidates" lists them with their reason. Centre = the **result card** first (model
  family, K / θ / τ with ± and units, the validation verdict, one sentence on identifiability), then
  the response chart (PV, fit, labelled prediction band, response-time markers, held input), residuals
  + residual ACF, candidate models with the delay-objective curve, Bode only when valid - every panel
  keeps its place as a skeleton while its artifacts decode, nothing is blank. Right = the event's
  steps A–H with their reason, the **key results**, the whole 52-row catalogue folded away (not-
  applicable rows greyed with their reason, never 0), the model history; **Review model** dialog
  (permission `cpm.model.review`) to validate / reject / promote / expire a model with a note.
- **Try (≈9 min per run):**
  `python scripts/sim/loop_step_sim.py --loop FIC10302 --scenario input-test --pre-s 180 --post-s 360 --interval 1`
  → one `INPUT_TEST` event `COMPLETE` with Kp ≈ 3, τ ≈ 20 s, θ ≈ 2.7 s. Run it a second time
  (≥ 90 s later) and the model becomes **VALIDATED** against the first event. Other scenarios:
  `servo-step`, `integrating`, `interrupted-step` (a second step during a capture → the first event
  is `CENSORED SUPERSEDED_BY_EVENT`, the second carries the whole input sequence).

### 3.7 Instrumental NE107 transmitter health

- The **Instrument Context Engine** turns device state messages into per-loop, per-role health
  intervals (F/C/S/M flags, collection state, measurement impact) and an **eligibility** verdict
  for the analytics (`ELIGIBLE / LIMITED / INELIGIBLE / UNKNOWN / NOT_CONFIGURED`) using the
  impact policy of spec §4.6: a Failure on the PV device makes identification ineligible, Check
  limits it, Maintenance is context only, no binding is `NOT_CONFIGURED` (never shown as OK).
- **Where:** Loop Explorer → loop header pill *Transmitter health (Instrumental NE107)* → drawer
  with device, flags (with text labels), native status, observed/verified age, diagnostics with
  cause and remedy; Historical and Evidence Workbench G11 health lanes; Performance filter chips
  **Missing binding · Stale collection · Active affected-device condition** (applied server-side);
  `GET /loops/{id}/instrument-health` and `/history`.
- **Try** (device TT-10302 is bound to FIC10302 PV):
  `python scripts/sim/instrumental_health_sim.py --scenario f-on-pv` → within ~30 s FIC10302 shows
  **F** and eligibility INELIGIBLE; `--scenario clear` → `NO_ACTIVE_DIAGNOSTIC`; `--scenario m-only`
  → "context only, measurement valid"; `--scenario offline` → source OFFLINE, last status retained;
  also `c-test`, `s-degraded`, `stale`, `dup`, `conflict`, `epoch-reset`, `late-correction`, `replace-device`.

### 3.8 Loop model — say what the loop is, not just its tag

The registry now stores five explicit dimensions next to the tag-derived `loop_type`: **service
family** (flow, gas pressure, level, temperature, cascade…), **dynamic class** (fast/slow
self-regulating, integrating, underdamped…), **objective** (tight, averaging, constraint…),
**topology** (single, cascade master/slave, split range…), **command path** (OP → valve, VFD,
slave SP) and an **acquisition** contract (grid seconds, mode, filter). Values derived from the tag
are stamped `PRESET_FROM_LOOP_TYPE`; a person's choice is `EXPLICIT` and a preset never overwrites it.

- **Where:** Loop Registry → Add loop wizard → **Classification** step (explicit selects with the
  preset suggestion and the note that an explicit value overrides the preset); the registry shows
  the classification source. Flink uses it: a 5 s grid on a fast loop makes G5/G6/G12 `LIMITED reason
  BANDWIDTH` (shown on the cell, never a silent PASS).

### 3.9 Governed gate configuration (Gate Configuration page)

All engine settings are now a typed catalogue of **165 properties** (`G4.activity_warn_ratio`,
`G12.noise_multiplier`, `G0.mode`…) with unit, bounds, default ("Commissioning required" when
none), change class and consumer. A **bundle** is the resolved configuration for a scope:
FACTORY (the shipped class packs) → SITE → one PROFILE → LOOP → one REGIME, canonicalised (RFC 8785)
and hashed; that hash is what every result is pinned to.

Lifecycle (every step is a server-side permission):

1. **Draft** — Gate Configuration → choose Site → Scope (SITE / PROFILE / LOOP) → reference → *New
   draft* (or *New version* of the selected bundle). Pick a gate; its properties are a **table**
   (name · effective value and the layer it comes from · change class · flags such as
   *commissioning* or *unread by build*); click a row to open its editor (definition, inherited
   value, bounds, read-by, set / reset - one open at a time). Type a new value (a fraction field
   refuses `50`, arrays are replaced whole, *reset to inherited* removes an override; a value the
   catalogue forbids is refused at edit time naming the field). *Diff & impact* and *Shadow* are
   tabs beside *Properties*. The right column is the **lifecycle**: the steps (draft → validated →
   shadow → approved → deploying → active) with the current one marked, the actions in that order -
   a disabled one says why (the state, or the permission you lack) - and the deployments as a
   timeline whose worker ACK matrix is summarised in one line and unfolds when something is not
   verified.
2. **Validate** — types, bounds, forbidden combinations, execution-plan capacity. The draft is
   classified by its own edits: `POLICY` (thresholds, hot), `STATE_BOUNDARY` (changes what an event
   detector sees → engines start a new epoch and report `WAITING / WARMUP` until warm), or
   `DEPLOYMENT` (needs a new build, e.g. a `long_30h` horizon → `DEPLOYMENT_REQUIRED`).
3. **Shadow** — a bounded replay of retained data under the draft; the panel shows the before/after
   gate matrix, symptoms removed/added, and records `POLICY_RECLASSIFICATION` when a change makes a
   symptom disappear.
4. **Approve** — a different user (Supervisor/Admin) with an expiry; the approval is bound to the
   content hash, so any later edit voids it.
5. **Deploy** — cplm-api signs the bundle (HMAC with the shared service key) and broadcasts
   PREPARE; every property-reading Flink task validates it locally and answers ACK/NACK with its jar
   and topology generation. Jobs that read no property (Instrument Context) are *observers*. All
   required ACKs → APPLY at the effective time (event time: windows ending after it use the new
   bundle, older ones the old — never mixed in one result) → the **probe** waits for real results
   carrying the hash → **ACTIVE_VERIFIED**. A NACK, two jars in the fleet or a foreign hash →
   `ACTIVATION_FAILED`; a slow member → `PARTIALLY_ACKNOWLEDGED` (redeployable).
6. **Roll back** — a new deployment of the previously active bundle; old results are untouched.

- **Where:** nav **Gate Configuration** (`/cpm/config`, needs `cpm.config.read`); *Show effective*
  opens the read-only **Effective configuration** drawer (also reachable from the workbench's Method
  trace: it names the bundle *that run* used and says when that bundle is no longer active);
  Governance → **Approvals** queue lists validated drafts awaiting approval/activation.
- **Try it in the UI:** create an Engineer user (Administration → Users), log in as that user, draft
  a LOOP bundle for a flowing loop (e.g. FIC10405), set `G4.activity_warn_ratio`, Validate, Shadow;
  log in as admin, Approve, Deploy; watch the ACK matrix reach ACTIVE_VERIFIED (a few minutes: the
  probe needs a 1-minute window on the new hash); then Roll back. The scripted version of exactly
  this is `.\scripts\test-cpm-v25-slice3-e2e.ps1` (14 steps, ~10 min).

## 4. Page map — what changed where

| Page (nav) | New in v2.5 |
|---|---|
| Overview / Performance | health filter chips; cells carry the run id; G12/G13/G14 states (`LEGACY_FLAG_ONLY` on old rows); *Open in workbench* |
| Loop Explorer | transmitter-health pill + drawer; source age vs feed age |
| Historical | one axis per unit, provenance tooltip, health lane |
| Evidence Workbench | **new** — 17 gate views on exact artifacts, method trace, effective configuration link |
| System Response | **new** — G12 events, fits, models, review |
| Gate Configuration | **new** — catalogue, drafts, validation, shadow, approval, deployment, rollback |
| Investigation | server-side hypotheses with contradictions; investigation references with an explicit outcome (API) |
| Loop Registry | Classification step (loop model dimensions, classification source) |
| Loop Events | condition and availability pills |
| Governance | version provenance (jar/commit), approvals queue |
| Administration → Data Sources | `quality_protocol` on loop sources; new profile *Transmitter Health (Instrumental NE107)* |

API only (no UI in this release): instrument bindings, controller snapshots, investigation
references, analysis-run creation (replay / reconstruction), evidence pinning.

## 5. A one-hour test tour on the lab

```powershell
# 0. the OT feed is already running (pid in the terminal that started it); to restart it yourself:
python ams-sims/sim_ot_gateway_mqtt.py --minutes 480 --exclude FIC10302
# 1. transmitter health on FIC10302  (Loop Explorer → FIC10302)
python scripts/sim/instrumental_health_sim.py --scenario f-on-pv
python scripts/sim/instrumental_health_sim.py --scenario clear
# 2. a freeze + limit condition on FIC10301  (GET /loops/FIC10301/conditions; Performance G10/G11 on the next window)
python scripts/sim/loop_freeze_sim.py --loop FIC10301 --minutes 5
# 3. a system-response event on FIC10302, twice for a validated model  (System Response)
python scripts/sim/loop_step_sim.py --loop FIC10302 --scenario input-test --pre-s 180 --post-s 360 --interval 1
python scripts/sim/loop_step_sim.py --loop FIC10302 --scenario input-test --pre-s 180 --post-s 360 --interval 1
# 4. open a verdict's evidence: Performance → FIC10405 → any gate cell → Open in workbench
# 5. configuration lifecycle in the UI (section 3.9), or scripted:
.\scripts\test-cpm-v25-slice3-e2e.ps1
```

The scripted proofs of the whole release (each prints N passed / 0 failed):
`scripts/test-ot-loop-ingestion-e2e.ps1` (28), `scripts/test-cpm-v25-slice1-e2e.ps1` (18),
`scripts/test-cpm-v25-slice2-e2e.ps1` (19; starts its own OT sim excluding FIC10302),
`scripts/test-cpm-v25-slice3-e2e.ps1` (14).

## 6. Things to know while testing

- Old result rows (before v2.5) have no run id and no bundle hash: their cells say
  `LEGACY_FLAG_ONLY` and the workbench button is disabled for them. That is by design.
- Fresh windows on a quiet lab are often `INSUFFICIENT_DATA`; the verdict-aware "latest" a page
  shows may then be an older real verdict. Simulators create the conditions the gates need.
- The step-test loop (FIC10302) must not be fed by the OT simulator at the same time — that is
  why the running sim excludes it.
- `STATE_BOUNDARY` bundles restart the engines' window state: expect `WAITING / WARMUP` results
  for one window length after activation.
- Bounded replay / reconstruction runs leak TaskManager metaspace on the lab (one classloader per
  REST submission; the TM is at 512 m). This is the one open release blocker recorded in
  `checklist.md`.
- Plant deployment order and post-deploy proof: `migration/V2.5-DEPLOY.md`; what to build:
  `changes_tracker.md` → "Release v2.5 — what to build and run".
