# Full RBAC Auth — Build Plan & Role Matrix

**Extends:** [03-auth-security-hardening.md](./03-auth-security-hardening.md) (AUTH-05, AUTH-08) with the full role/permission model.
**Model (confirmed with product):** many users → a small set of shared roles; single role per user; **custom roles supported**; admins edit each role's permission set. No per-user permission overrides.
**Standards anchor:** ISA-18.2 (operator *response* vs engineering *configuration*), ISA-101 (HMI operating roles), IEC 62443-3-3 SR 2.1 (least privilege, role-based access).
**Baseline:** `4e2758c` · **Date:** 2026-08-10

---

## 1. What already exists (keep)

`traverse_auth` already has the correct normalized RBAC schema — `roles`, `permissions`, `role_permissions` (M2M), `users` (single `role` FK), `refresh_tokens`. Login resolves the user's role → `permission[]` claim in an RS256 JWT; every service authorizes locally on that claim. User CRUD, bulk CSV import, self-service, and an atomic `PUT /roles/:role/permissions` all work. This build **completes and hardens** that foundation; it does not replace it.

## 2. The complete permission catalog (code-owned, not admin-created)

Permissions are defined by **what the services actually enforce** — inventing a permission key an admin can assign but no service checks would be a lie. So the catalog is owned by code and synced to the DB; **admins assign catalog permissions to roles, but do not create permission keys.** This also permanently fixes the drift that left 12 keys unassignable.

| Domain | Keys |
|---|---|
| Alarms (response) | `alarm.view`, `alarm.acknowledge`, `alarm.acknowledge_batch`, `alarm.shelve`, `alarm.unshelve`, `alarm.export` |
| Alarms (config) | `alarm.suppress` |
| SOE | `soe.view` |
| Analytics / KPIs | `analytics.view` |
| Displays (HMI) | `display.view`, `display.edit`, `display.publish` |
| Templates | `template.view`, `template.edit`, `template.publish` |
| Assets / UNS | `asset.view`, `asset.edit` |
| Bindings | `binding.resolve` |
| Historian / Trends | `historian.view` |
| Analysis | `analysis.view`, `analysis.edit` |
| Control-loop perf | `cpm.manage` |
| System / Ops | `system.manage` |
| Administration | `admin.users.edit`, `admin.audit.view`, `rbac.manage` (new) |

**12 of these are missing from the DB catalog today** (`asset.*`, `binding.resolve`, `historian.view`, `display.*`, `template.*`, `analysis.*`) — the reason non-admin roles can't touch the HMI. `rbac.manage` is new (see §5).

## 3. Proposed role matrix (industry standard)

Four built-in **system roles**, ISA-18.2/ISA-101 aligned. `✓` = granted.

| Permission | Viewer | Operator | Engineer | Admin |
|---|:--:|:--:|:--:|:--:|
| alarm.view, soe.view, analytics.view | ✓ | ✓ | ✓ | ✓ |
| display.view, template.view, asset.view | ✓ | ✓ | ✓ | ✓ |
| binding.resolve, historian.view, analysis.view | ✓ | ✓ | ✓ | ✓ |
| alarm.acknowledge, alarm.acknowledge_batch | – | ✓ | ✓ | ✓ |
| alarm.shelve, alarm.unshelve | – | ✓ | ✓ | ✓ |
| alarm.export | – | ✓ | ✓ | ✓ |
| alarm.suppress | – | – | ✓ | ✓ |
| display.edit, display.publish | – | – | ✓ | ✓ |
| template.edit, template.publish | – | – | ✓ | ✓ |
| asset.edit | – | – | ✓ | ✓ |
| analysis.edit | – | – | ✓ | ✓ |
| cpm.manage | – | – | ✓ | ✓ |
| system.manage | – | – | – | ✓ |
| admin.users.edit | – | – | – | ✓ |
| admin.audit.view | – | – | – | ✓ |
| rbac.manage | – | – | – | ✓ |

**Rationale:**
- **Viewer** — full *read* across the whole product, not just alarms. Deliberately includes `binding.resolve` + `historian.view`: a read-only HMI is useless if it can't resolve live values or open a trend (ISA-101 monitoring role).
- **Operator** — Viewer + the ISA-18.2 *operator response* actions: acknowledge (single/batch), shelve/unshelve, and export for shift handover. **No `alarm.suppress`** — suppression-by-design is an engineering configuration act, not an operator response. No display/asset editing (operators run displays, engineers build them).
- **Engineer** — Operator + all *configuration*: displays, templates, assets, analyses, CPM loop onboarding, and `alarm.suppress` (rationalization). **No user/role admin.** `system.manage` (DCS connection lifecycle + Flink job submission) is held at Admin by default — it's a privileged ops action; it can be delegated to a custom "Senior Engineer" role if you want.
- **Admin** — everything, including user management, role management (`rbac.manage`), audit, and system ops.

**One nuance to verify in implementation:** operator-owned *Personal Views* (the non-versioned tier) vs controlled displays. If display-service gates personal-view CRUD under `display.edit`, operators would need it. Recommended fix: a separate `display.personal.edit` so operators manage their own views without gaining controlled-display edit rights. Flagged, not assumed.

## 4. Custom roles

- `roles.is_system_role` already exists. Custom roles are `is_system_role = FALSE`.
- **System roles** (Viewer/Operator/Engineer/Admin): cannot be deleted or renamed; their *permission set* is editable by an admin, with a "reset to default" action.
- **Custom roles**: fully mutable (create, rename, edit permissions, delete). A custom role can be assigned any subset of the catalog.
- Example custom roles this enables:
  - *Shift Supervisor* = Operator set + `alarm.suppress` + `admin.audit.view`
  - *Maintenance* = Viewer set + `cpm.manage` + `analysis.edit`
  - *Contractor (read-only)* = `alarm.view` + `display.view` + `historian.view` + `binding.resolve` only

## 5. Admin surface — roles & permission mapping

Everything an admin does is itself gated by a **permission**, not a hardcoded `role == Admin` check (that's the current `requireAdmin`). New `rbac.manage` permission gates role management; `admin.users.edit` gates user management.

New/confirmed endpoints (all `rbac.manage` unless noted):
- `GET  /api/auth/roles` — list (exists)
- `POST /api/auth/roles` — create custom role **(new)**
- `PUT  /api/auth/roles/:role` — rename/describe; system roles: description only **(new)**
- `DELETE /api/auth/roles/:role` — custom only; 409 on system role **(new)**
- `GET  /api/auth/permissions` — catalog (exists)
- `GET  /api/auth/roles/:role/permissions` — mapping (exists)
- `PUT  /api/auth/roles/:role/permissions` — replace mapping (exists; now works for custom roles + full catalog)
- `POST /api/auth/roles/:role/permissions/reset` — reset a system role to its default set **(new)**
- **No** permission-CRUD endpoint — the catalog is code-owned (§2).

## 6. Prompt propagation (why this model needs it)

With shared roles, admins retune "what an Engineer can do" and onboard/offboard people constantly — but the JWT carries a **snapshot** of permissions, so a role edit or a deactivation takes up to 15 min (the access-token TTL) to take effect. For a plant with shift changes this is too slow. Fix (AUTH-05):
- Add `jti` to access tokens; maintain a revocation set in Redis (TTL = token lifetime), written on logout, password change, user deactivation, and **role/permission change** (revoke all live tokens for affected users so they re-mint with the new set on next request).
- Checked at the gateway (Plan 04) and, until the gateway exists, in the shared validation module.

## 7. Schema & hardening deltas

- **Complete the catalog**: seed the 12 missing keys + `rbac.manage`; extend the default role→permission mapping to match §3.
- **Catalog sync guard**: a CI check (or startup assertion) that the DB `permissions` set == the code-enforced key set (the `Perms` list in `_shared/TraverseAuth.cs` + display-service policies). Same pattern as the existing `TraverseAuth.cs` drift check. Prevents §2 drift recurring.
- **TIMESTAMPTZ**: convert `traverse_auth` timestamps from naive `TIMESTAMP` (DATA-12) — it's the only schema that deviates.
- **RBAC-change audit**: role create/delete/rename and permission-mapping edits emit to the tamper-evident `audit-service` (who changed which role, when), not just the app log.
- **Keep**: bcrypt, single-use refresh rotation, JWKS. **Related but separate**: key rotation (AUTH-06), OIDC discovery, mTLS service identity — tracked in Plan 03/10, not blockers for this build.

## 8. Implementation order

1. Complete the permission catalog + default role mappings (SQL) → makes Engineer/Operator/Viewer actually functional. *Ships value on its own.*
2. Catalog sync guard (CI + startup assertion).
3. Role CRUD API + `rbac.manage` + reset-to-default; guard system roles.
4. Move user/role admin gating from `requireAdmin` → permission-based.
5. Token revocation on role/permission/user change (AUTH-05).
6. TIMESTAMPTZ migration + RBAC-change audit emit.
7. Admin UI: role editor (create/edit/delete custom roles, permission checkboxes grouped by domain, reset system role).

## 9. Exit criteria

- [ ] Every code-enforced permission key exists in the DB catalog; CI fails if they diverge.
- [ ] Viewer/Operator/Engineer can use the HMI per §3 (verified end-to-end, not just Admin).
- [ ] An admin can create a custom role, assign a permission subset, and a user with that role gets exactly those permissions in their token.
- [ ] Editing a role's permissions takes effect for logged-in users within seconds (revocation), not 15 min.
- [ ] System roles cannot be deleted/renamed; their permissions are editable and resettable.
- [ ] Every role/permission change is in the audit trail.
- [ ] All admin actions gated by permission, not by hardcoded role.
