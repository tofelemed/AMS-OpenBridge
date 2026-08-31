# HMI Designer — Phase 5 Design (control write-back + event annotations)

> **STATUS: DESIGN ONLY — NOT IMPLEMENTED.** This document specifies *what* Phase 5 does and *how* we
> will build it, so it can be reviewed (especially the security model) before any code is written.
> Phase 5.1 (write-back) is the one genuinely dangerous item in the whole remediation plan: it turns
> read-only screens into something that can move a valve on a real plant. It ships only after an
> explicit security sign-off.

Phase 5 closes the last two "not implemented" gaps from `docs/DESIGNER-FEATURE-GUIDE.md`:

- **5.1 — Controls write nothing.** Buttons / toggles / sliders / inputs display live values but have no
  command / write-back path.
- **5.2 — Event annotations + related / compare-events views.**

The two are independent and can be built in either order. 5.2 is low-risk and could ship first.

---

## Part A — Control write-back (5.1)

### A.1 Current state (verified)

These control symbols render and (where bound) show a live value, but their action is a no-op — nothing
is ever written back to the process:

| Symbol | Slot(s) | Today | Target |
|---|---|---|---|
| `obc.button` | `command` | renders a button | writes a command/boolean to the tag |
| `obc.toggle` | `state` | reflects live state | writes ON/OFF |
| `obc.check` | `state` | reflects live state | writes ON/OFF |
| `obc.slider` / `obc.slider-horizontal` | `value`,`setpoint` | shows value | writes a setpoint |
| `obc.input` | `value`,`setpoint` | shows value | writes a setpoint |
| `ctrl.selector` | `state` | shows state | writes a discrete position |

The **binding-resolver resolves paths for READ only** (path+role → live/history/alarm transport). There is
no write-transport resolution and no command path from the UI.

### A.2 We already have a proven write-back spine — reuse it

The alarm **ACK** flow already writes back to the DCS through a hardened, auditable pipeline. Phase 5.1
mirrors it exactly rather than inventing a new one:

```
                 EXISTING ACK PATH                          NEW COMMAND PATH (5.1, mirrors it)
UI ──ACK──▶ AMS API ──traverse.alarm.operator-actions──▶ Flink      UI ──POST /commands──▶ Command API ──operator-commands──▶ Flink
   Flink ──traverse.alarm.ack-writeback──▶ HttpAckWritebackService      Flink ──command-writeback──▶ HttpCommandWritebackService
        ──HTTP──▶ OPC Gateway ──▶ DCS                          ──HTTP──▶ OPC Gateway ──OPC-UA write──▶ DCS
   OPC Gateway ──traverse.alarm.ack-results──▶ Flink + AMS API          OPC Gateway ──command-results──▶ API ──SignalR──▶ UI
```

Grounding (see `docs/migration/kafka-topic-catalog.md`, `src/backend/.../HttpAckWritebackService.cs`,
`src/backend/.../Kafka/OperatorActionPublisher.cs`):
- Kafka **invariant #4: "the UI never writes to Kafka — it goes through the API."** The command endpoint
  is the only producer; the browser never touches a topic.
- The gateway write is HTTP-fronted (`HttpAckWritebackService` already POSTs writeback commands to the
  gateway), so a `HttpCommandWritebackService` is a near-copy.

### A.3 Security model — the part that must be signed off

Write-back is guarded in **depth**; every layer independently refuses an unsafe write.

1. **Authoring is deliberate, not default.** A control is read-only until an author flips a **"Writable"**
   toggle in the Property Inspector and fills a *Command* config: target path+role, value kind
   (boolean / setpoint / discrete), allowed range (min/max) or the discrete value set, an optional
   engineering-unit, and a **confirmation level** (none / confirm / confirm-with-reason).
2. **RBAC.** A new permission **`control.write`** is required to *issue* a command. It is **not** granted to
   Viewer/Operator by default — assignment is an explicit decision. Authoring `Writable` needs
   `display.edit`; issuing at runtime needs `control.write`.
3. **ABAC / asset-scope.** The command endpoint enforces the caller's `assetScope` claim against the target
   path (the same scoping added in the V2 hardening for `/resolve` and `/trend`). No scope → 403. A user can
   only command tags inside their scope.
4. **Runtime confirmation.** Per the control's confirmation level: a modal shows *what* will be written,
   *where* (asset + node id), the *current* value, and the *new* value; confirm-with-reason additionally
   requires a free-text reason that is carried into the audit event.
5. **Server-side validation.** The endpoint re-checks range/discrete-set/type against the display config's
   command spec — a tampered client cannot widen the range. Setpoints outside `[min,max]` are rejected 400.
6. **Rate-limit + debounce.** Per-user + per-tag rate limit (e.g. N writes / 10 s) and a slider debounce so a
   drag issues one command on release, not one per pixel.
7. **Interlocks (optional, config-driven).** A command spec may name a boolean permissive tag; the command is
   refused if the permissive is false ("pump not ready"). This is resolved read-side at issue time.
8. **Audit — always.** Every attempt (allowed *and* refused) emits an `AuditEvent` to `traverse.cpa.audit-events`
   (the hash-chained store the audit-service already consumes): who, when, path, old→new, reason, result.
9. **Config-only invariant is untouched.** The *command spec* is display configuration (target path, range,
   confirmation) — never a process value. Saved displays still carry zero live data.

### A.4 Data model & new topics

| Topic | Producer | Consumer | Retention | Purpose |
|---|---|---|---|---|
| `operator-commands` | Command API | Flink command orchestrator | 7d | UI-issued write commands |
| `command-writeback` | Flink | `HttpCommandWritebackService` | 24h | Resolved DCS write instruction |
| `command-results` | OPC Gateway | AMS API (→ SignalR) | 7d | Write confirmation / failure |

**`operator-commands` payload:**
```json
{
  "commandId": "uuid",
  "issuedAt": "2026-07-16T12:00:00Z",
  "issuedBy": "operator1",
  "path": "houston/crude1/pump101.speed_sp",
  "role": "setpoint",
  "kind": "setpoint",            // boolean | setpoint | discrete
  "value": 62.5,
  "reason": "ramping to shift target",
  "displayId": "uuid",           // provenance for audit
  "assetScope": "houston/crude1"
}
```
The orchestrator resolves `path+role → OPC-UA node id` (a new **write-transport** resolution in
binding-resolver: `POST /resolve/write` → `{ nodeId, dataType, writable:true }`), emits to
`command-writeback`, and the writeback service performs the OPC-UA write via the gateway.

### A.5 Component changes (build list)

**Frontend**
- `types.ts`: add `commandSpec` to `CanvasItem` (writable flag, path+role, kind, min/max or discrete set,
  confirmation level, optional permissive tag + unit).
- `PropertyInspector.tsx`: a **Command** section for control symbols — the `Writable` toggle + spec fields.
- `SymbolRenderer.tsx`: control symbols become interactive in *preview* only when `commandSpec.writable`;
  they call a new `useCommand()` hook that opens the confirm dialog and POSTs.
- New `api/commandApi.ts` + `hooks/useCommand.ts` + `CommandConfirmDialog.tsx`.
- SignalR: subscribe to `command-results` for the issued `commandId` → toast success/failure + revert
  optimistic UI on failure.

**Backend**
- New **Command API** surface (in AMS API or binding-resolver): `POST /api/commands` (authz `control.write`
  + asset-scope + validation + rate-limit + audit) → publish `operator-commands`.
- binding-resolver: `POST /resolve/write` (path+role → writable node id).
- Flink: a **command orchestrator** job consuming `operator-commands` → `command-writeback` (analogous to
  the ACK orchestrator; reuses the resolver).
- AMS API: `HttpCommandWritebackService` (copy of `HttpAckWritebackService`) consuming `command-writeback`
  → HTTP write to the OPC Gateway; and a `command-results` consumer → SignalR.
- OPC Gateway: an OPC-UA **write** endpoint (the ACK path already writes; extend for arbitrary node writes,
  gated to the allow-listed writable nodes).
- DB/permissions: seed the `control.write` permission + policy; add a `command_audit` view over the audit
  store if a dedicated command log is wanted.

### A.6 Failure modes & safety behavior
- Resolver says the node is **not writable** → 422, command never leaves the API.
- Gateway/DCS **rejects or times out** → `command-results` failure → UI reverts the optimistic value and
  shows the DCS reason; the tag keeps its real (unchanged) live value.
- **Stale display** (published config drifted from the live tag) → server re-resolves at issue time, so the
  write targets the current node, not a cached one.
- **Loss of comms** → command expires (TTL on `operator-commands`); the UI shows "not confirmed" rather than
  a false success.

### A.7 Test plan
- Unit: range/discrete/type validation; rate-limit; asset-scope denial (403); interlock refusal.
- Integration (containerised, extends `scripts/e2e-v2/`): issue a setpoint → assert `operator-commands` →
  `command-writeback` → gateway write → `command-results` success → SignalR confirmation → audit row with
  old→new+reason. Then a denied case (no `control.write`) and an out-of-range case (400).
- Manual: a Writable slider on `houston/crude1/pump101.speed_sp`, confirm dialog, DCS value moves, audit
  trail shows the write.

### A.8 Sub-phases
- **5.1a** binding-resolver `/resolve/write` + gateway write endpoint (no UI).
- **5.1b** Command API + Kafka + Flink orchestrator + writeback + results (headless, script-tested).
- **5.1c** Frontend: command spec authoring + confirm dialog + runtime issue + SignalR feedback.
- **5.1d** Hardening: rate-limit, interlocks, confirm-with-reason, full audit, denial UX.

---

## Part B — Event annotations & related / compare-events (5.2)

### B.1 Current state
Trends and the alarm table show events, but there is no way to **annotate** a moment on a trend, attach a
note to an event, or open a **related / compare-events** view across assets or time windows.

### B.2 Functionality
- **Trend annotations:** click a point/time on a trend to drop a note (text + author + timestamp, optional
  linked tag). Annotations render as markers on the trend and in a side list; hover shows the note.
- **Event notes:** attach a note to an alarm/event row (why it happened, what was done).
- **Related events:** from an event, show other events on the same asset / same time window (already partly
  possible via the alarm store's path-prefix match; this formalises it).
- **Compare events:** pick two time windows (e.g. this trip vs. the last one) and show the two event sets +
  trends side by side.

### B.3 Data model & API
Annotations are **not** display config (they are operational records), so they live in a service, not in the
display document — the config-only invariant is preserved.

- New table `annotations` (in `traverse_shared` or the audit DB): `id, kind (trend|event), author,
  created_at, ts_from, ts_to, asset_path, display_id, event_id, body, color`.
- New endpoints (audit-service is the natural home — it already owns operational records, or a small
  `annotation-service`):
  `GET /annotations?assetPath=&from=&to=`, `POST /annotations`, `PUT /annotations/{id}`,
  `DELETE /annotations/{id}` (author-or-Admin), all `DisplayView`+ scoped.
- Emits `annotation.created` to Kafka for downstream (optional).

### B.4 Frontend
- `TrendCore.tsx`: an annotations layer (echarts `markLine`/`markPoint`) fed by `GET /annotations` for the
  visible tags + window; click-to-add in a new "annotate" mode; the existing cursor machinery supplies the ts.
- A reusable `EventNotes` panel for the alarm table / event list.
- A `CompareEvents` view (two `TrendCore` + two event lists, shared legend).

### B.5 Test plan
- Add an annotation at t0 on `houston/crude1/pump101.discharge_press`; reload → marker persists at t0 for
  that tag; author-or-Admin can edit/delete, others cannot. Compare two windows renders both event sets.

---

## Sequencing, dependencies, open decisions

- **Order:** 5.2 (annotations) is low-risk and independent — it can ship first. 5.1 (write-back) waits for
  the security sign-off below.
- **Dependencies:** 5.1 needs (a) an OPC Gateway write endpoint, (b) binding-resolver write resolution, (c)
  the `control.write` permission seeded, (d) the containerised command E2E extending `scripts/e2e-v2/`.
- **Open decisions requiring sign-off before 5.1 code:**
  1. Who gets `control.write`, and is confirm-with-reason mandatory for setpoints?
  2. Command host — extend AMS API (owns SignalR + the ACK spine) vs. a new command-service?
  3. Interlocks in v1, or defer to 5.1d?
  4. Are ad-hoc display commands even in scope, or is write-back restricted to a vetted allow-list of tags
     per the "Flink-only compute / controlled change" posture? (This is a plant-safety policy call, not an
     engineering one.)
