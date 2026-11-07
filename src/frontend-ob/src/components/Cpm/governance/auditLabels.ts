import { codeLabel } from '../vocabulary';

/** Audit records name things in code. The code itself stays on hover. */
export const ENTITY_LABEL: Readonly<Record<string, string>> = {
  CpmLoop: 'CPM loop', CpmEventFrame: 'CPM event', Display: 'HMI display', RolePermissions: 'Role permissions',
  'data-source-config': 'Data source', gate_config_bundle: 'Gate configuration bundle', config_deployment: 'Configuration deployment',
};

/** Acronyms stay upper case, and a dotted code reads as words. */
export const auditLabel = (code: string | null | undefined): string => {
  const text = code?.includes('.') ? code.replace(/\./g, ' ').replace(/^./, c => c.toUpperCase()) : codeLabel(code);
  return text.replace(/\bCpm\b/g, 'CPM').replace(/\bRbac\b/g, 'RBAC');
};

export const entityLabel = (type: string): string => ENTITY_LABEL[type] ?? auditLabel(type);

export const eventTone = (t: string): 'good' | 'warn' | 'bad' | 'muted' => {
  if (t.includes('DELETED')) return 'bad';
  if (t.includes('SHELVED')) return 'warn';
  if (t.includes('ACTIVATED') || t.includes('ACKNOWLEDGED')) return 'good';
  return 'muted';
};

/** The one entity type whose id is a loop in the registry. */
export const LOOP_ENTITY = 'CpmLoop';

/** A single loop's id. Bulk events carry `bulk:N`, a count, which names no loop. */
export const isSingleLoop = (entityType: string, entityId: string): boolean =>
  entityType === LOOP_ENTITY && !entityId.startsWith('bulk:');
