/**
 * Canonical RBAC permission catalog — the single source of truth.
 *
 * Every permission key the platform enforces is defined here exactly once, with
 * its category, description, and the set of built-in (system) roles that get it
 * by default. From this manifest:
 *   - auth-service ensures the DB `permissions` catalog on startup/migrate;
 *   - the "reset a system role to default" action (Phase 2) derives its mapping;
 *   - the CI drift guard (scripts/verify-permission-catalog.mjs) asserts this
 *     manifest matches BOTH the SQL seeds and the keys the .NET services actually
 *     enforce, so the catalog can never silently drift out of the enforced set
 *     again (the drift that had left 12 keys unassignable).
 *
 * Permissions are CODE-OWNED: an admin assigns these to roles and builds custom
 * roles, but cannot invent new keys — a key no service checks would be a dead grant.
 *
 * Role model (confirmed): shared roles, single role per user, custom roles on top.
 * Matrix is ISA-18.2 (operator response vs engineering configuration) / ISA-101
 * aligned. system.manage is Admin-only by decision.
 */

export type SystemRole = 'SuperAdmin' | 'Admin' | 'Engineer' | 'Operator' | 'Viewer';

export interface PermissionDef {
  key: string;
  description: string;
  category: string;
  /** Built-in roles granted this permission by default. */
  roles: SystemRole[];
  /**
   * True for keys enforced only inside auth-service itself (e.g. RBAC admin),
   * which therefore will NOT appear in the .NET services' enforced set. The
   * drift guard uses this to avoid false "missing in code" failures.
   */
  internal?: boolean;
}

// Convenience role groupings for readability.
const ALL: SystemRole[] = ['Viewer', 'Operator', 'Engineer', 'Admin', 'SuperAdmin'];
const OPERATOR_UP: SystemRole[] = ['Operator', 'Engineer', 'Admin', 'SuperAdmin'];
const ENGINEER_UP: SystemRole[] = ['Engineer', 'Admin', 'SuperAdmin'];
// CHG-081: platform administration (users, roles, audit, OT data sources, pipeline / governance) is SuperAdmin only;
// gate configuration (cpm.config.*, seeded by SQL, not in this catalog) likewise — scripts/cpm-14-superadmin-role.sql.
const SUPERADMIN_ONLY: SystemRole[] = ['SuperAdmin'];

export const PERMISSION_CATALOG: PermissionDef[] = [
  // ── Alarms: response (operator) ──────────────────────────────────────────
  { key: 'alarm.view',              description: 'View active alarms',            category: 'alarm',     roles: ALL },
  { key: 'alarm.acknowledge',       description: 'Acknowledge an alarm',          category: 'alarm',     roles: OPERATOR_UP },
  { key: 'alarm.acknowledge_batch', description: 'Acknowledge alarms in batch',   category: 'alarm',     roles: OPERATOR_UP },
  { key: 'alarm.shelve',            description: 'Shelve an alarm',               category: 'alarm',     roles: OPERATOR_UP },
  { key: 'alarm.unshelve',          description: 'Unshelve an alarm',             category: 'alarm',     roles: OPERATOR_UP },
  { key: 'alarm.export',            description: 'Export alarm data',             category: 'alarm',     roles: OPERATOR_UP },
  // ── Alarms: configuration (engineer) ─────────────────────────────────────
  { key: 'alarm.suppress',          description: 'Suppress an alarm (by design)', category: 'alarm',     roles: ENGINEER_UP },
  // ── Sequence of events ───────────────────────────────────────────────────
  { key: 'soe.view',                description: 'View sequence of events',       category: 'soe',       roles: ALL },
  // ── Analytics / KPIs (also covers CPM reads) ─────────────────────────────
  { key: 'analytics.view',          description: 'View analytics / KPIs',         category: 'analytics', roles: ALL },
  // ── Displays / HMI ───────────────────────────────────────────────────────
  { key: 'display.view',            description: 'View displays and personal views', category: 'display', roles: ALL },
  { key: 'display.edit',            description: 'Create/edit controlled displays', category: 'display',  roles: ENGINEER_UP },
  { key: 'display.publish',         description: 'Publish controlled displays',   category: 'display',   roles: ENGINEER_UP },
  // ── Templates ────────────────────────────────────────────────────────────
  { key: 'template.view',           description: 'View templates',                category: 'template',  roles: ALL },
  { key: 'template.edit',           description: 'Create/edit templates',         category: 'template',  roles: ENGINEER_UP },
  { key: 'template.publish',        description: 'Publish templates',             category: 'template',  roles: ENGINEER_UP },
  // ── Assets / UNS ─────────────────────────────────────────────────────────
  { key: 'asset.view',              description: 'View the UNS asset model',      category: 'asset',     roles: ALL },
  { key: 'asset.edit',             description: 'Create/edit UNS assets',        category: 'asset',     roles: ENGINEER_UP },
  // ── Bindings (needed to render live data in any display) ──────────────────
  { key: 'binding.resolve',         description: 'Resolve path+role bindings',    category: 'binding',   roles: ALL },
  // ── Historian / trends ───────────────────────────────────────────────────
  { key: 'historian.view',          description: 'View historian trends and raw data', category: 'historian', roles: ALL },
  // ── Analysis ─────────────────────────────────────────────────────────────
  { key: 'analysis.view',           description: 'View analyses',                 category: 'analysis',  roles: ALL },
  { key: 'analysis.edit',           description: 'Create/edit analyses',          category: 'analysis',  roles: ENGINEER_UP },
  // ── Control-loop performance ─────────────────────────────────────────────
  { key: 'cpm.manage',              description: 'Onboard and configure control loops (CPLM)', category: 'cpm', roles: ENGINEER_UP },
  // ── System / ops (SuperAdmin only by decision, CHG-081): also gates Pipeline Health and Governance ─
  { key: 'system.manage',           description: 'Manage pipeline jobs and OPC connections; view Pipeline Health and Governance', category: 'system', roles: SUPERADMIN_ONLY },
  // ── OT data-source configuration (ingestion-service; SuperAdmin only by decision) ─
  { key: 'ingestion.view',          description: 'View OT data-source configurations', category: 'ingestion', roles: SUPERADMIN_ONLY },
  { key: 'ingestion.manage',        description: 'Create/edit/test OT data-source configurations', category: 'ingestion', roles: SUPERADMIN_ONLY },
  // ── Administration (SuperAdmin only, CHG-081) ────────────────────────────
  { key: 'admin.users.edit',        description: 'Create/edit/delete users',      category: 'admin',     roles: SUPERADMIN_ONLY },
  { key: 'admin.audit.view',        description: 'View the audit log',            category: 'admin',     roles: SUPERADMIN_ONLY },
  { key: 'rbac.manage',             description: 'Manage roles and their permissions', category: 'admin', roles: SUPERADMIN_ONLY, internal: true },
];

export const SYSTEM_ROLES: { name: SystemRole; description: string }[] = [
  { name: 'SuperAdmin', description: 'Super Administrator - platform administration, gate configuration, pipeline and governance' },
  { name: 'Admin',    description: 'System Administrator - plant configuration; no platform administration (CHG-081)' },
  { name: 'Engineer', description: 'Engineer - operate + configure, no user admin' },
  { name: 'Operator', description: 'Operator - alarm response operations' },
  { name: 'Viewer',   description: 'Viewer - read-only access' },
];

/** Every permission key in the catalog. */
export const ALL_PERMISSION_KEYS: string[] =
  PERMISSION_CATALOG.map((p) => p.key);

/** Keys expected to be enforced by a .NET service (excludes auth-internal keys). */
export const ENFORCED_PERMISSION_KEYS: string[] =
  PERMISSION_CATALOG.filter((p) => !p.internal).map((p) => p.key);

/** Default permission keys for a built-in role, per the matrix. */
export function defaultPermissionsForRole(role: SystemRole): string[] {
  return PERMISSION_CATALOG.filter((p) => p.roles.includes(role)).map((p) => p.key);
}
