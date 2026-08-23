# MQTT Data-Source Configuration — Platform Fit Analysis

**Input:** [mqtt _feature_configuration _specification.md](mqtt%20_feature_configuration%20_specification.md) (the Instrumental Pro handoff spec) + the UI flow screenshots (4-step wizard + Source Configuration list page).
**Scope of this phase (user decision):** the **configuration mechanism only** — storage, CRUD API, connection test, activate/deactivate, and the admin UI. The MQTT **subscriber pipeline** (spec §7–§9: transport wrapper, parsers/profiles, sink/DLQ, ack policy) is **deferred** until the real gateway payload is known; the analysis below still reserves its seams so nothing is painted into a corner.
**Companion:** [05-mqtt-source-config-implementation-plan.md](05-mqtt-source-config-implementation-plan.md) (the end-to-end build plan).
**Date:** 2026-08-21.

---

## 1. The central question: which service stores the credentials?

**Decision: a new `ingestion-service` (`src/services/ingestion-service`), owning a new `traverse_ingestion` database.** The config CRUD, the encryption, the connection tester, and — in the later phase — the MQTT subscriber all live in this one service.

Why, ruled against the alternatives:

| Option | Verdict | Reasoning |
|---|---|---|
| **New `ingestion-service` owns config + (later) subscriber** | ✅ chosen | The only consumer of *decrypted* passwords is the subscriber and the tester. Colocating CRUD + subscriber means plaintext credentials **never cross the network** — exactly the spec's own recommendation (it collapsed the origin's asset-service/ingestion-service split for this reason, and its Appendix B split-variant needs an internal credentials endpoint we then don't have to build or guard). Also matches recorded decision #14 (one logical DB per service) and doc 03, which already scoped this exact service. |
| Store in `asset-model` (it owns the other "mapping" table, `alias_mapping`) | ❌ | Wrong domain and wrong blast radius: `traverse_assets` is read by six services; broker credentials don't belong in the most widely-shared database. Asset-model's API surface is UNS curation, not connectivity ops. |
| A generic "config-service" | ❌ | Doesn't exist; inventing a new shared-config service for one feature contradicts the per-service-ownership architecture. |
| `ams-api` (it already hosts `AlarmIngestionService`, the HTTP poller) | ❌ | ams-api is the alarm backend being *thinned* (CPLM was extracted from it); adding OT connectivity config grows it in the wrong direction. The poller is a stopgap slated for replacement by this very feature's phase 2. |

Storage details that follow from platform conventions:

- Database `traverse_ingestion`, schema `ingestion`, table `ingestion.data_source_configs` — spec §2 schema adopted nearly verbatim (divergences in §5 below).
- Passwords AES-256-GCM encrypted at rest (spec §4), master key from `ENCRYPTION_KEY` env supplied via compose/`.env`. Decryption happens only inside ingestion-service (tester now, subscriber later). Plaintext never in any API response or log — the UI screenshot's "credentials are hashed at rest" wording is wrong for MQTT (the broker needs the real password back), and the spec correctly uses reversible encryption; we follow the spec.

---

## 2. Stack decision for the service

**Decision: .NET 8 minimal API**, same skeleton as `asset-model`/`binding-resolver` (EF Core + startup self-heal DDL + `TraverseAuth.cs` copy synced by `scripts/sync-auth-module.ps1`).

The spec's reference implementation is TypeScript/Node with full working source. Two of our services are precedents for either choice (`auth-service` is Node; everything else is .NET). .NET wins because:

- The platform's service conventions (gateway header-trust auth, `X-Service-Key`, health/metrics idioms, compose patterns, EF Core self-heal) are all .NET-shaped; a Node service would re-port those instead of the spec code.
- The spec's TS sources are mostly the **subscriber** (deferred phase). What this phase needs — CRUD, AES-GCM, one MQTT connect-and-disconnect test — is small and ports cleanly: `System.Security.Cryptography.AesGcm` + `Rfc2898DeriveBytes.Pbkdf2`, and **MQTTnet** (v4, MQTT 5 capable) for the tester.
- The spec itself says: *"on a different [stack], port it while preserving every rule marked INVARIANT"* — the INVARIANTs are behavioral, not linguistic.

Port notes: .NET `AesGcm` mandates a 12-byte nonce (spec's Node code uses 16-byte IV); we keep the spec's `base64(salt ‖ nonce ‖ tag ‖ ciphertext)` layout with a 12-byte nonce — no compatibility requirement exists since the store starts empty. PBKDF2 parameters (100k iterations, SHA-256, 64-byte salt, 32-byte key) stay as specified.

---

## 3. How the spec's pieces map onto this platform

| Spec element | Platform realization |
|---|---|
| §2 `data_source_configs` table | `ingestion.data_source_configs` in `traverse_ingestion`; DDL script pair `45_traverse_ingestion_db.sql` + `46_ingestion_data_sources.sql` **plus startup self-heal DDL in the service** (init scripts only run on an empty Postgres volume — existing lab volumes never see new scripts; self-heal is the platform's standard answer, used by asset-model and cplm-api) |
| §4 encryption util | `Services/CredentialCipher.cs` (AES-256-GCM + PBKDF2), `ENCRYPTION_KEY` env, fail-fast at startup when missing/short |
| §5 REST API | Minimal-API endpoints under `/data-sources`, exposed publicly as **`/api/ingestion/data-sources`** via a new gateway route (`PathRemovePrefix: /api/ingestion`), ahead of the `/api/*` → ams-api catch-all (Order 100) |
| §5 auth ("the application's normal auth") | Edge-only auth (decision #16): gateway validates JWT, service authorizes from `X-Auth-*` headers via the shared `TraverseAuth.cs` copy. New permission keys `ingestion.view` / `ingestion.manage` (§4 below) |
| §5 `created_by`/`updated_by` | From the gateway-injected identity headers |
| §6 connection test | MQTTnet one-shot connect: throwaway client id `test-<epoch-ms>`, clean session, no reconnect, TLS material from the row; result persisted to `last_connection_test/status/error`. The two-client-identity INVARIANT (stable `ingestion-<config_id>` vs throwaway test id) is kept — the stable id is *reserved now* (derived + shown in the UI) even though the subscriber that will use it comes later |
| §10 UI | New **"Data Sources" tab in the existing Administration shell** (`/admin/data-sources`) — list page + 4-step wizard matching the screenshots, following the established `Admin*Config` component idioms (the "Alarm Feed" tab is the closest precedent: a config CRUD UI in the same shell) |
| §11 config-change propagation | Phase 2 concern (no subscriber exists yet). The API surface reserves `POST /reload` semantics; for now activate/deactivate only mutate the row |
| §12 env | `ENCRYPTION_KEY` (required), `Mqtt__Enabled=false` master switch reserved for phase 2. The spec's env-var bootstrap fallback is **skipped** (UI-first flow is the point of this feature) |
| §13 verification | Unit tests (xUnit) + an E2E PowerShell script against a disposable Mosquitto container — see plan doc §8 |
| §7–§9 transport wrapper, profiles/parsers, publisher, subscriber, sink/DLQ | **Deferred** (phase 2). What we keep now: the `profile_type` column, a `GET /profiles` endpoint serving the registered profile list (so wizard step 1 isn't hardcoded), and the `last_data_received` column the subscriber will populate |

Sink/DLQ placeholders (spec §0), resolved *provisionally* so the schema is future-proof but uncommitted: `<SINK>` = a Kafka topic chosen per profile when the payload is known (doc 01's three planes are the candidates); `<DLQ>` = a parking topic/table per doc 03 §4.3; `<ENTITY>`/`<MAPPING_FIELD>` = UNS asset matched on OT tag name via `alias_mapping` (doc 03 §4). None of this is built in this phase.

---

## 4. RBAC and reachability

New permission keys (category `ingestion`):

- `ingestion.view` — see data-source configs (broker URLs and usernames are visible; passwords never)
- `ingestion.manage` — create/edit/delete/test/activate

Grants: **Admin only** (user decision, 2026-08-22 — the catch-all picks both keys up automatically). Engineer/Operator/Viewer get neither — broker endpoints and credentials are connectivity internals.

Three-place sync rule (verified in `37_rbac_catalog.sql`): the catalog is canonical in `src/services/auth-service/src/rbac/permission-catalog.ts`, mirrored in `src/services/auth-service/database/schema.sql`, seeded for existing volumes by a numbered script — and the CI guard `scripts/verify-permission-catalog.mjs` **fails the build if they diverge**. All three must change together.

Reachability trap found during analysis: the `/admin/*` route in [App.tsx](../../src/frontend-ob/src/App.tsx) is gated by `anyOf: ['admin.users.edit', 'admin.audit.view', 'rbac.manage']`. A user holding only the new ingestion keys could never reach the tab — the route's `anyOf` list must be extended with `ingestion.manage`/`ingestion.view`, and the tab entry in `Administration.tsx` gets `permission: 'ingestion.view'`-style gating like the Users/Roles tabs.

---

## 5. Deliberate divergences from the spec (all behavior-preserving or platform-required)

| # | Divergence | Why |
|---|---|---|
| 1 | `TIMESTAMP` columns → `TIMESTAMPTZ` | Platform standardized on timestamptz (script 38 migrated auth for exactly this reason) |
| 2 | Node 16-byte GCM IV → .NET 12-byte nonce | `AesGcm` requirement; no stored-data compatibility needed |
| 3 | Table lives in schema `ingestion`, not public | Every Traverse DB namespaces its tables (`assets.*`, `cpm.*`, `analytics.*`) |
| 4 | Spec's single-app collapse → our microservice topology | Same property preserved (CRUD + future subscriber colocated); it's one service *within* the platform, behind the gateway |
| 5 | List-page card shows QoS/keepalive/topics, not "Polling Interval" | The screenshot's polling fields are the origin app's *polled* source types (PI/OPC); MQTT never uses them and the spec says to add polled columns only if ever needed. We show MQTT-truthful fields |
| 6 | Audit trail: spec has only `created_by/updated_by/version` | We additionally emit platform `audit-events` (Kafka → audit-service) on create/update/delete/activate/deactivate/test, following the existing `cplm-api`/`display-service` emitter pattern — config changes to OT connectivity are exactly what the audit log is for |
| 7 | Spec's `GET /data-sources/active` | Kept, but it returns the same **redacted** DTO as the list (it exists for admin views, not for credential export). The Appendix-B internal credentials endpoint is *not built* — same-process subscriber makes it unnecessary |
| 8 | UI is a 4-step wizard (not the spec's "single form is equally fine") | Match the screenshots / the origin UX the user wants replicated |

INVARIANTs from the spec that this phase must already honor (the rest attach to the deferred subscriber):

1. **Two MQTT client identities** — tester uses throwaway `test-<ts>`, clean session, `reconnectPeriod 0`; the stable `ingestion-<config_id>` is derived/displayed but never used by the tester.
2. **Blank password on update = keep current** — edit form sends `""` untouched; API treats `""`/absent as "no change".
3. **Never log or return decrypted passwords.**
4. **Topic-filter validation** — `#` only as the final character of a filter; ≥1 non-blank filter.
5. **TLS three-way choice is mutually exclusive** — switching modes clears the other modes' state (`ca_cert_pem` / `ca_cert_path` / `insecure_skip_verify` can never disagree with what the form shows); CA upload validation (≤64 KB, must contain `BEGIN CERTIFICATE`, must not contain `PRIVATE KEY`).
6. **Session-expiry default 86400** stored now so the phase-2 subscriber inherits correct configs (MQTT 5 default of 0 silently kills offline queuing).
7. **Parameterized SQL only**; partial updates touch only provided columns; DB trigger bumps `updated_at`/`version`.

---

## 6. UI analysis (screenshots → our stack)

The four screenshots map cleanly onto the Administration shell:

| Screenshot | Our realization |
|---|---|
| **Source Configuration** list — cards with name + `Active`/`MQTT`/topic badges, URL, username, timeout, last-test timestamp; Test / Edit / Off / Delete; "+ New Configuration" | `DataSourcesConfig.tsx` list view in the Administration content pane. Status pill from `is_active` + `last_connection_status`; "Off/On" = deactivate/activate; Test runs the live test and refreshes the row |
| **Step 1 — Profile Selection** (profile select, read-only transport type) | Profile list from `GET /api/ingestion/profiles` (phase 1 registers `MQTT_PRM` as the single metadata-only entry, description text included); transport derives from profile |
| **Step 2 — Basic Information** (name, description) | Name required |
| **Step 3 — Connection Settings** (broker URL, username, password) | URL validated `^(mqtt|mqtts)://host[:port]`; on edit, password field labeled *"leave blank to keep current password"* |
| **Step 4 — Advanced Options** (topic filters + add/remove, QoS select with help text, client-id placeholder showing derived default, session expiry with the MQTT-5 warning, keepalive, clean-session checkbox default off, contextual TLS block, timeout, "next steps" box) | All fields per spec §10 incl. the help/warning texts (they encode the production gotchas). TLS block renders the three-way radio when the URL is `mqtts://`, and the informational "nothing here applies" note when `mqtt://` (as in the screenshot). Next-steps box adapted: test → (phase 2) restart note → "every OT tag must be mapped in the asset model / alias table; unknown tags park" |

Frontend conventions that bind (from the repo's rules, not the spec): OpenBridge-only UI — the `openbridge` skill must be loaded before writing any of these components; icons `Obi*` per-path imports; palette/theme via tokens (the Administration shell's `T` theme + existing `Admin*Config` idioms are the local precedent); ag-grid/echarts not needed here; `npm run lint` must stay clean at `--max-warnings 0`.

State/data: `@tanstack/react-query` for CRUD + test mutations (the platform standard), no Zustand store needed (no cross-page shared state).

---

## 7. What phase 2 will need that we deliberately leave ready

- `profile_type` + `profile_config` JSONB already store everything the subscriber reads (`loadActiveSources()` contract, spec §9) — no schema change expected at phase 2.
- Stable client id derivation lives in one place (service-side helper, surfaced read-only in the UI) so subscriber and UI can't diverge.
- `last_data_received` column + list-page slot for it (renders "—" until the subscriber exists).
- `GET /stats` endpoint reserved (404/501 now or simply absent; the health payload notes `subscriber: "not built"`), so ops dashboards can be wired once without churn.
- The reload-on-save loop (spec §11) becomes trivial: same process, direct `subscriber.reload()` call after mutations.

**Decisions confirmed by the user (2026-08-22):** (a) `ingestion.view`/`ingestion.manage` are **Admin-only**; (b) local testing runs against the Mosquitto installed on this machine (`mqtt://host.docker.internal:1883` from inside the compose network) — production will use `mqtts://192.168.190.91:8883`; (c) the seeded profile keeps the origin's name `MQTT_PRM`.
