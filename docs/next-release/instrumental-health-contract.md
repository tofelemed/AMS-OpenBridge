# Instrumental NE107 transmitter-health contract — v1 (proposed)

Status: **proposed** (spec v6 §4.1). The Instrumental owner and the ingestion owner approve the
namespace, identity, field semantics, poll/verification behaviour and historical reconciliation
before Instrumental's publisher ships. Until then the lab uses `scripts/sim/instrumental_health_sim.py`,
which produces exactly these messages. Machine-readable, strict (`additionalProperties: false`)
schemas: `contracts/instrumental-health/v1/{state,event,availability}.schema.json`.

CPA is **read-only** toward Instrumental and the DCS: there is no command topic; acknowledging a
CPA episode never acknowledges a transmitter condition. CPA never scrapes the Instrumental UI or
joins its private tables.

## Topics (MQTT, TLS + broker ACLs in the plant)

| Topic | QoS | Retained | Payload |
|---|---|---|---|
| `traverse/instrumental/v1/{tenant_id}/{site_id}/devices/{device_id}/state` | 1 | yes | `STATE_SNAPSHOT` — the full current state |
| `traverse/instrumental/v1/{tenant_id}/{site_id}/devices/{device_id}/events` | 1 | no | `STATE_EVENT` — a change, with the same full post-state |
| `traverse/instrumental/v1/{tenant_id}/{site_id}/sources/{source_id}/availability` | 1 | yes | `SOURCE_AVAILABILITY` — ONLINE/OFFLINE/DEGRADED; the producer's last-will publishes OFFLINE |

Producers publish only their own source/site/device scope; CPA subscribes only to its scope; the
payload's `tenant_id` / `site_id` / `device_id` (or `source_id`) must equal the topic captures or
the message is rejected. Browsers never hold credentials that can publish health.

## Envelope (every message)

`schema_version` (`"1.0"`), `message_kind`, `observation_id`, `tenant_id`, `site_id`, `producer_id`,
`producer_epoch`, `sequence` (monotonic within epoch and device), `source_id`, `device_id`,
`observed_at`, `verified_at`, `published_at`, `state_revision`, `state_complete`, `verification_kind`
(`DEVICE_DIRECT` | `UPSTREAM_DATABASE_POLL`), optional `installation_id`, `scan_interval_s`,
`mapping_version`. The gateway adds `received_at`, `topic`, the MQTT retained indication and the
**authenticated** producer identity — a client's own claim is never accepted as identity.

- `observed_at`: when the state was observed/changed at source (declared clock).
- `verified_at`: the most recent successful verification of the device state, even if unchanged.
  A bridge heartbeat alone may update only `published_at` / availability. No reliable
  `verified_at` ⇒ freshness UNKNOWN.
- `state_complete: true` with an empty `active_flags` means the source verified NO active
  diagnostic (`NO_ACTIVE_DIAGNOSTIC`). A missing field is a schema failure, never an implicit clear.

## State object

`active_flags` (subset of `F`, `C`, `S`, `M` — NAMUR NE107, edition 2025-07-15), `native_status`,
optional producer-selected `primary_flag` with its `primary_flag_policy_version` (a display choice
under the producer's policy, never a CPA severity), `collection_state` (`VERIFIED` | `STALE` |
`UNKNOWN` | `OFFLINE`), `measurement_impact` (`VALID` | `INVALID` | `DEGRADED` | `UNKNOWN`), and
`diagnostics[]`. All active flags are preserved; a scalar code never erases concurrent evidence.

Each diagnostic: `diagnostic_id` (occurrence-unique, not a reusable code), `native_code`,
`message`, `flags`, `affected_variable_ids` (signal ids incl. compensation variables; empty = the
whole device), `measurement_impact`, `first_observed_at`, `cause`, `remedy`, `source_record_ref`
(an allow-listed application reference the connector resolves; never an arbitrary URL rendered
as HTML), optional `native_category`, `last_observed_at`, `source_acknowledgement`,
`source_shelving`. Aliases such as `first_seen` or `code` are rejected. A diagnostic's
measurement impact is never inferred from a priority.

`STATE_EVENT` adds `event_id`, `change_kind` (`DIAGNOSTIC_RAISED` | `DIAGNOSTIC_UPDATED` |
`DIAGNOSTIC_CLEARED` | `STATE_RESYNC` | `LATE_CORRECTION`), `diagnostic_ids[]` and, for a late
correction, `corrects_observation_id`.

## Ordering, history, intervals (what CPA does with it)

- Deduplicate by `tenant/site/source/observation_id`; the same id with a different payload is an
  **integrity incident** (DLQ `INTEGRITY_CONFLICT`), never a silent overwrite.
- `sequence` detects loss within an epoch. A new `producer_epoch` needs a complete verified
  snapshot before it supersedes the current state; an event arriving first is parked
  (`EPOCH_WITHOUT_SNAPSHOT`). Sequence numbers of different epochs are never compared.
- Out-of-order observations are persisted; only a policy-qualified newer revision changes the
  current state. A late correction produces an explicit historical **revision** (the original
  belief is kept with its own received time) and never a live transition.
- Status intervals begin at the supported observed time and end on an explicit newer state, a
  freshness expiry (`max(3 × scan_interval_s, site minimum)`, bounded) or a source availability
  boundary. A snapshot at 10:00 proves nothing about 09:59. Uncertainty gaps stay gaps.
- A clear needs complete source evidence at an appropriate time — not an empty tombstone, a
  missing retained message, an expired topic, or a CPA acknowledgement.
- Limits: message ≤ 64 KiB, ≤ 64 diagnostics, ≤ 32 affected variables, strings bounded per
  schema, timestamp skew ≤ 24 h. Malformed / unsupported messages go to
  `traverse.ingestion.health-dlq` without stopping OT sample ingestion.

## Binding (CPA side)

Primary identity = `tenant/site`, functional loop id, signal role, primary `device_id`;
`installation_id` and the binding validity `[valid_from, valid_to)` are stored
(`cpm.signal_device_binding_history`). Tags/serials are aliases. A replacement splits the
binding; history resolves the device installed at that time. Ambiguous or contradictory identity
is parked with an explicit reason — never substring-matched from a tag.

## Gate impact (spec §4.6, encoded in `HealthEligibilityPolicy`)

| Source evidence | CPA eligibility for the affected signal |
|---|---|
| F affecting PV / invalid measurement | `INELIGIBLE` (identification, shape, reliability); raw evidence retained |
| C affecting PV | `INELIGIBLE` for identification / baseline learning; `LIMITED` for descriptive |
| S with degraded validity | `LIMITED`; no model/baseline promotion without a separate validity decision |
| M with valid PV | `ELIGIBLE`; maintenance priority is separate from the control finding |
| F/C/S on an independent variable | `ELIGIBLE` for the unaffected path; state remains visible |
| UNKNOWN / STALE / lost collection | `LIMITED`; no implied healthy clearance |
| No binding | `NOT_CONFIGURED`; health never manufactured |
| Fresh complete empty state | `ELIGIBLE` (`NO_ACTIVE_DIAGNOSTIC`) — not proof of calibration accuracy |

No arithmetic on flags ("M adds 0.1 valve confidence") is permitted; a transmitter diagnostic
can invalidate or explain PV behaviour but never confirms a valve fault.
