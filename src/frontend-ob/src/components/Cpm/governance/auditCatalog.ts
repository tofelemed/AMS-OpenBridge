/**
 * CHG-174 (owner review, answer 4 and the audit findings): every entity type and event type the services write to the audit
 * trail, read from the emitters (cplm-api CplmAuditEmitter, display-service and ingestion-service AuditEmitter, auth-service
 * audit-emitter.ts, audit-service's own AUDIT_CHAIN_RECHAINED). The Entity and Event type filters offer this fixed list; they
 * offered three entity types and only the event types seen in the rows fetched. An action reads in words with its tone and
 * glyph ("✓ Draft approved"), the entity by a short name with its type under it. A code no emitter writes yet still reads as words.
 *
 * CHG-202 (owner, 15 Nov 2026: no ids, no backend text): "Loops" and "Loop events" (not "CPM …"); the republish action in the
 * Loop Registry's words (CHG-201 "Resend to analysis"); no hash, binding or recompute talk; an unknown code without the service
 * that wrote it. An actor is a person's name, "System" or "Unknown user", never an id (the signed-in person by their full
 * name, from the session, with no request). An entity known only by an id (a bundle, deployment, data source, display, user,
 * model) shows its type alone: the codes stay in the filters' option values and the service's data only.
 */
import type { CpmTone } from '../shared';
import { codeLabel } from '../vocabulary';

export interface EntityKind { code: string; one: string; many: string }

export const ENTITIES: readonly EntityKind[] = [
  { code: 'CpmLoop', one: 'Loop', many: 'Loops' },
  { code: 'CpmEventFrame', one: 'Loop event', many: 'Loop events' },
  { code: 'gate_config_bundle', one: 'Gate configuration bundle', many: 'Gate configuration bundles' },
  { code: 'config_deployment', one: 'Configuration deployment', many: 'Configuration deployments' },
  { code: 'data-source-config', one: 'Data source', many: 'Data sources' },
  { code: 'Display', one: 'HMI display', many: 'HMI displays' },
  { code: 'Role', one: 'Role', many: 'Roles' },
  { code: 'RolePermissions', one: 'Role permissions', many: 'Role permissions' },
  { code: 'User', one: 'User', many: 'Users' },
  { code: 'system_model', one: 'System model', many: 'System models' },
  { code: 'AuditChain', one: 'Audit chain', many: 'Audit chain' },
];

type Tone = Exclude<CpmTone, 'muted'>;
export interface EventKind { code: string; entity: string; label: string; tone?: Tone }

const ev = (entity: string, rows: Array<[code: string, label: string, tone?: Tone]>): EventKind[] =>
  rows.map(([code, label, tone]) => ({ code, entity, label, tone }));

export const EVENTS: readonly EventKind[] = [
  ...ev('CpmLoop', [
    ['CPM_LOOP_ACTIVATED', 'Loop activated', 'good'], ['CPM_LOOPS_BULK_ACTIVATED', 'Loops activated (bulk)', 'good'],
    ['CPM_LOOP_RETIRED', 'Loop retired'], ['CPM_LOOP_RESTORED', 'Loop restored'], ['CPM_LOOPS_BULK_RETIRED', 'Loops retired (bulk)'],
    ['CPM_LOOP_DELETED', 'Loop deleted', 'bad'], ['CPM_EVIDENCE_REPUBLISHED', 'Loop settings resent to analysis'],
    ['CPM_EVIDENCE_REPUBLISHED_BULK', 'Loop settings resent to analysis (bulk)'], ['CPM_RECOMPUTE_STARTED', 'Recalculation started'],
    ['CPM_INSTRUMENT_BINDING_CREATED', 'Instrument linked'],
  ]),
  ...ev('CpmEventFrame', [
    ['CPM_EVENT_ACKNOWLEDGED', 'Event acknowledged', 'good'], ['CPM_EVENT_SHELVED', 'Event shelved', 'warn'],
    ['CPM_EVENT_SHELVE_UPDATED', 'Shelf updated', 'warn'], ['CPM_EVENT_UNSHELVED', 'Event unshelved'], ['CPM_EVENT_SHELF_EXPIRED', 'Shelf expired'],
  ]),
  ...ev('gate_config_bundle', [
    ['CONFIG_DRAFT_CREATED', 'Draft created'], ['CONFIG_DRAFT_EDITED', 'Draft edited'], ['CONFIG_DRAFT_VALIDATED', 'Draft validated'],
    ['CONFIG_SHADOW_STARTED', 'Shadow evaluation started'], ['CONFIG_DRAFT_APPROVED', 'Draft approved', 'good'],
  ]),
  ...ev('config_deployment', [
    ['CONFIG_DEPLOYMENT_SCHEDULED', 'Deployment scheduled'], ['CONFIG_ACTIVE_VERIFIED', 'Active (verified)', 'good'],
    ['CONFIG_REJECTED', 'Deployment rejected', 'bad'],
  ]),
  ...ev('data-source-config', [
    ['ingestion.datasource.created', 'Data source created'], ['ingestion.datasource.updated', 'Data source updated'],
    ['ingestion.datasource.deleted', 'Data source deleted', 'bad'], ['ingestion.datasource.tested', 'Data source tested'],
    ['ingestion.datasource.activated', 'Data source activated', 'good'], ['ingestion.datasource.deactivated', 'Data source deactivated'],
    ['ingestion.datasource.reloaded', 'Data sources reloaded'],
  ]),
  ...ev('Display', [
    ['DISPLAY_CREATED', 'Display created'], ['DISPLAY_UPDATED', 'Display updated'], ['DISPLAY_CONTENT_SAVED', 'Content saved'],
    ['DISPLAY_PUBLISHED', 'Display published'], ['DISPLAY_UNPUBLISHED', 'Display unpublished'], ['DISPLAY_REVERTED', 'Display reverted'],
    ['DISPLAY_DUPLICATED', 'Display duplicated'], ['DISPLAY_RESTORED', 'Display restored'], ['DISPLAY_DELETED', 'Display deleted', 'bad'],
    ['DISPLAY_SHARED', 'Display shared'], ['DISPLAY_VERSION_RESTORED', 'Version restored'], ['FOLDER_CREATED', 'Folder created'],
  ]),
  ...ev('Role', [['RBAC_ROLE_CREATED', 'Role created'], ['RBAC_ROLE_UPDATED', 'Role updated'], ['RBAC_ROLE_DELETED', 'Role deleted', 'bad']]),
  ...ev('RolePermissions', [['RBAC_ROLE_PERMISSIONS_RESET', 'Role permissions reset'], ['RBAC_ROLE_PERMISSIONS_CHANGED', 'Role permissions changed']]),
  ...ev('User', [
    ['USER_CREATED', 'User created'], ['USER_UPDATED', 'User updated'], ['USER_DELETED', 'User deleted', 'bad'], ['USER_BULK_IMPORTED', 'Users imported (bulk)'],
  ]),
  ...ev('system_model', [['cpm.model.reviewed', 'Model reviewed']]),
  ...ev('AuditChain', [['AUDIT_CHAIN_RECHAINED', 'Audit chain recalculated']]),
];

const EVENT = new Map(EVENTS.map(e => [e.code, e]));
const ENTITY = new Map(ENTITIES.map(e => [e.code, e]));

/** The event types of one entity type; every type when none is chosen. */
export const eventsFor = (entity: string): EventKind[] => EVENTS.filter(e => !entity || e.entity === entity);

/** The service or module a code starts with ("CPM_", "RBAC_", "ingestion."): not the reader's business. */
const SOURCE = /^(cpm|rbac|ingestion)[._]/i;

/** A code no emitter writes yet, as words, without the service that wrote it: "CPM_SOMETHING_NEW" → "Something new". */
export const codeWords = (code: string | null | undefined): string => {
  const bare = (code ?? '').trim().replace(SOURCE, '');
  return bare.includes('.') ? bare.replace(/\./g, ' ').replace(/^./, c => c.toUpperCase()) : codeLabel(bare);
};

/** "Gate configuration bundle"; an unknown type from its code ("SomethingElse" → "Something else"). */
export const entityOne = (code: string): string =>
  ENTITY.get(code)?.one ?? codeWords(code.replace(/([a-z])([A-Z])/g, '$1_$2'));

/** The entity type a row shows under its name: plural for a bulk event ("20 loops" · "Loops"). */
export const entityKind = (e: { entityType: string; entityId: string }): string =>
  (e.entityId.startsWith('bulk:') ? ENTITY.get(e.entityType)?.many ?? entityOne(e.entityType) : entityOne(e.entityType));

const GLYPH: Record<Tone, string> = { good: '✓', warn: '◐', bad: '✕' };

export interface ActionView { label: string; tone?: Tone; glyph?: string }

interface Row { eventType: string; entityType: string; entityId: string; userId?: string }

const bulkCount = (id: string): number | null => (id.startsWith('bulk:') ? Number(id.slice(5)) : null);

/** The action in words with its tone and glyph. A deployment's kind, when the page could read it, names it. */
export function actionView(e: Row, deployment?: { kind?: string | null } | null): ActionView {
  const known = EVENT.get(e.eventType);
  let label = known?.label ?? codeWords(e.eventType);
  let tone = known?.tone;
  if (e.eventType === 'CONFIG_DEPLOYMENT_SCHEDULED' && deployment?.kind) {
    label = deployment.kind === 'ROLLBACK' ? 'Rollback scheduled' : deployment.kind === 'ACTIVATE' ? 'Activation scheduled' : label;
  }
  // "bulk:0" is the number of loops done: an activation of none is not a success.
  if (bulkCount(e.entityId) === 0) tone = undefined;
  return tone ? { label, tone, glyph: GLYPH[tone] } : { label };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SERVICES = new Set(['system', 'traverse-service']);

/** A raw id (a GUID): never shown. */
export const isRawId = (id: string | null | undefined): boolean => UUID.test((id ?? '').trim());

/** The signed-in person, from the session (no request): what lets their own events read by their full name. */
export interface Me { user_id?: string | null; username?: string | null; full_name?: string | null }

export interface ActorView { text: string; byName: boolean }

const UNKNOWN: ActorView = { text: 'Unknown user', byName: false };
const same = (a: string, b: string | null | undefined) => !!b && a.toLowerCase() === b.trim().toLowerCase();

/**
 * Who did it: "System" for a service's own event; the signed-in person by their full name (matched by login, or by the id an
 * event recorded before CHG-171); anyone else by their user name; "Unknown user" for an event recorded with an id only or with
 * no actor at all.
 */
export function actorView(userId: string | null | undefined, me?: Me | null): ActorView {
  const u = (userId ?? '').trim();
  if (SERVICES.has(u.toLowerCase())) return { text: 'System', byName: true };
  if (!u || u.toLowerCase() === 'unknown') return UNKNOWN;
  if (me && (same(u, me.username) || same(u, me.user_id))) {
    const name = me.full_name?.trim() || me.username?.trim();
    if (name) return { text: name, byName: true };
  }
  return UUID.test(u) ? UNKNOWN : { text: u, byName: true };
}

/** The entity types whose id is itself a name the reader knows: a loop's tag, a role's name. */
const NAMED = new Set(['CpmLoop', 'Role', 'RolePermissions']);

/**
 * The entity by a short name: a loop's tag, "20 loops", "EVT-2230", a role's name, a bundle's "FIC10302 · v7" when known.
 * Null when only an id names it: the row and the panel then show its type alone.
 */
export function entityName(e: Row, known?: string | null): string | null {
  if (known) return known;
  const bulk = bulkCount(e.entityId);
  if (bulk !== null && Number.isFinite(bulk)) return `${bulk} ${bulk === 1 ? 'loop' : 'loops'}`;
  if (e.entityType === 'CpmEventFrame' && /^\d+$/.test(e.entityId)) return `EVT-${e.entityId}`;
  if (e.entityType === 'AuditChain') return 'Whole chain';
  if (e.entityId === 'bulk-import') return 'Bulk import';
  return NAMED.has(e.entityType) && e.entityId.trim() && !UUID.test(e.entityId) ? e.entityId : null;
}
