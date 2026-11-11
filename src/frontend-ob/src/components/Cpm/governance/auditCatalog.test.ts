import { describe, expect, it } from 'vitest';
import { ENTITIES, EVENTS, actionView, actorView, entityKind, entityName, entityOne, eventsFor, shortId } from './auditCatalog';

const row = (over: Partial<{ eventType: string; entityType: string; entityId: string; userId: string }>) => ({
  eventType: 'CPM_LOOP_ACTIVATED', entityType: 'CpmLoop', entityId: 'FIC10503', userId: 'a_engineer', ...over,
});

describe('the audit catalog (finding: filters offered only what the fetched rows held)', () => {
  it('offers every entity type the services record', () => {
    expect(ENTITIES.map(e => e.code)).toEqual([
      'CpmLoop', 'CpmEventFrame', 'gate_config_bundle', 'config_deployment', 'data-source-config', 'Display',
      'Role', 'RolePermissions', 'User', 'system_model', 'AuditChain',
    ]);
  });

  it('offers every event type the emitters write, each under an entity it offers', () => {
    const codes = EVENTS.map(e => e.code);
    for (const c of [
      'CPM_LOOP_ACTIVATED', 'CPM_LOOPS_BULK_ACTIVATED', 'CPM_LOOPS_BULK_RETIRED', 'CPM_EVIDENCE_REPUBLISHED', 'CPM_EVIDENCE_REPUBLISHED_BULK',
      'CPM_LOOP_DELETED', 'CPM_LOOP_RETIRED', 'CPM_LOOP_RESTORED', 'CPM_RECOMPUTE_STARTED', 'CPM_INSTRUMENT_BINDING_CREATED',
      'CPM_EVENT_ACKNOWLEDGED', 'CPM_EVENT_SHELVED', 'CPM_EVENT_SHELVE_UPDATED', 'CPM_EVENT_UNSHELVED', 'CPM_EVENT_SHELF_EXPIRED',
      'CONFIG_DRAFT_CREATED', 'CONFIG_DRAFT_EDITED', 'CONFIG_DRAFT_VALIDATED', 'CONFIG_SHADOW_STARTED', 'CONFIG_DRAFT_APPROVED',
      'CONFIG_DEPLOYMENT_SCHEDULED', 'CONFIG_ACTIVE_VERIFIED', 'CONFIG_REJECTED', 'cpm.model.reviewed',
      'DISPLAY_CREATED', 'DISPLAY_UPDATED', 'DISPLAY_CONTENT_SAVED', 'DISPLAY_PUBLISHED', 'DISPLAY_UNPUBLISHED', 'DISPLAY_REVERTED',
      'DISPLAY_DUPLICATED', 'DISPLAY_RESTORED', 'DISPLAY_DELETED', 'DISPLAY_SHARED', 'DISPLAY_VERSION_RESTORED', 'FOLDER_CREATED',
      'ingestion.datasource.created', 'ingestion.datasource.updated', 'ingestion.datasource.deleted', 'ingestion.datasource.tested',
      'ingestion.datasource.activated', 'ingestion.datasource.deactivated', 'ingestion.datasource.reloaded',
      'RBAC_ROLE_CREATED', 'RBAC_ROLE_UPDATED', 'RBAC_ROLE_DELETED', 'RBAC_ROLE_PERMISSIONS_RESET', 'RBAC_ROLE_PERMISSIONS_CHANGED',
      'USER_CREATED', 'USER_UPDATED', 'USER_DELETED', 'USER_BULK_IMPORTED', 'AUDIT_CHAIN_RECHAINED',
    ]) expect(codes).toContain(c);
    const entities = new Set(ENTITIES.map(e => e.code));
    expect(EVENTS.every(e => entities.has(e.entity))).toBe(true);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('narrows the event types to the chosen entity', () => {
    expect(eventsFor('Role').map(e => e.code)).toEqual(['RBAC_ROLE_CREATED', 'RBAC_ROLE_UPDATED', 'RBAC_ROLE_DELETED']);
    expect(eventsFor('')).toHaveLength(EVENTS.length);
  });
});

describe('an action reads in words with its tone and glyph, never repeating the entity code', () => {
  it('names the change', () => {
    expect(actionView(row({ eventType: 'CONFIG_DRAFT_APPROVED', entityType: 'gate_config_bundle' }))).toEqual({ label: 'Draft approved', tone: 'good', glyph: '✓' });
    expect(actionView(row({ eventType: 'CPM_EVENT_SHELVED', entityType: 'CpmEventFrame' }))).toEqual({ label: 'Event shelved', tone: 'warn', glyph: '◐' });
    expect(actionView(row({ eventType: 'CPM_LOOP_DELETED' }))).toEqual({ label: 'Loop deleted', tone: 'bad', glyph: '✕' });
    expect(actionView(row({ eventType: 'ingestion.datasource.tested', entityType: 'data-source-config' })).label).toBe('Data source tested');
    expect(actionView(row({ eventType: 'RBAC_ROLE_PERMISSIONS_RESET', entityType: 'RolePermissions' })).label).toBe('Role permissions reset');
    expect(actionView(row({ eventType: 'CPM_EVIDENCE_REPUBLISHED_BULK', entityId: 'bulk:20' })).label).toBe('Evidence republished (bulk)');
  });

  it('a bulk activation of no loop is not shown in the good tone', () => {
    expect(actionView(row({ eventType: 'CPM_LOOPS_BULK_ACTIVATED', entityId: 'bulk:0' })).tone).toBeUndefined();
    expect(actionView(row({ eventType: 'CPM_LOOPS_BULK_ACTIVATED', entityId: 'bulk:3' })).tone).toBe('good');
  });

  it('a deployment reads as an activation or a rollback when its kind is known, else as scheduled', () => {
    const d = row({ eventType: 'CONFIG_DEPLOYMENT_SCHEDULED', entityType: 'config_deployment', entityId: 'd-1' });
    expect(actionView(d).label).toBe('Deployment scheduled');
    expect(actionView(d, { kind: 'ROLLBACK' }).label).toBe('Rollback scheduled');
    expect(actionView(d, { kind: 'ACTIVATE' }).label).toBe('Activation scheduled');
  });

  it('a code no emitter writes yet still reads as words', () => {
    expect(actionView(row({ eventType: 'CPM_SOMETHING_NEW' })).label).toBe('CPM something new');
    expect(actionView(row({ eventType: 'ingestion.thing.done' })).label).toBe('Ingestion thing done');
  });
});

describe('the actor', () => {
  it('a service is System, an old id-only event is Not recorded by name, a person is their user name', () => {
    expect(actorView('system')).toEqual({ text: 'System', byName: true, id: null });
    expect(actorView('')).toEqual({ text: 'Not recorded by name', byName: false, id: null });
    expect(actorView('7c41e0d2-9b1a-4f7e-8d2c-0a1b2c3d4e5f')).toEqual({ text: 'Not recorded by name', byName: false, id: '7c41e0d2-9b1a-4f7e-8d2c-0a1b2c3d4e5f' });
    expect(actorView('g_admin')).toEqual({ text: 'g_admin', byName: true, id: null });
  });
});

describe('the entity by short name', () => {
  it('names what it can, and shortens a raw id', () => {
    expect(entityName(row({}))).toBe('FIC10503');
    expect(entityName(row({ eventType: 'CPM_EVIDENCE_REPUBLISHED_BULK', entityId: 'bulk:20' }))).toBe('20 loops');
    expect(entityName(row({ eventType: 'CPM_LOOPS_BULK_ACTIVATED', entityId: 'bulk:1' }))).toBe('1 loop');
    expect(entityName(row({ entityType: 'CpmEventFrame', entityId: '2230' }))).toBe('EVT-2230');
    expect(entityName(row({ entityType: 'RolePermissions', entityId: 'Engineer' }))).toBe('Engineer');
    expect(entityName(row({ entityType: 'Display', entityId: 'd19f0a2c-1111-4222-8333-944445555666' }))).toBe('d19f0a2c…');
    expect(entityName(row({ entityType: 'gate_config_bundle', entityId: 'c7d1aa00-1111-4222-8333-944445555666' }), 'FIC10302 · v7')).toBe('FIC10302 · v7');
    expect(entityName(row({ entityType: 'AuditChain', entityId: 'audit.immutable_events' }))).toBe('Whole chain');
    expect(entityName(row({ entityType: 'User', eventType: 'USER_BULK_IMPORTED', entityId: 'bulk-import' }))).toBe('Bulk import');
  });

  it('names the type in words, an unknown one from its code', () => {
    expect(entityOne('gate_config_bundle')).toBe('Gate configuration bundle');
    expect(entityOne('SomethingElse')).toBe('Something else');
    expect(shortId('abc')).toBe('abc');
    expect(entityKind({ entityType: 'CpmLoop', entityId: 'bulk:20' })).toBe('CPM loops');
    expect(entityKind({ entityType: 'CpmLoop', entityId: 'FIC10503' })).toBe('CPM loop');
  });
});
