/**
 * CHG-174 (owner answer 1): the selected event's one flat ↗ link to its object, where one exists and the user may open it: a loop
 * in the registry → Loop Registry; a bundle → Gate Configuration on the tab its step needs (approved → Approval, shadow → Shadow,
 * else Properties); a deployment → its bundle's Deployments tab (when the page could read which bundle); a role → Administration ›
 * Roles; a user → Administration › Users; an HMI display → the designer, in a build that has it. Only a single loop linked before.
 */
import type { AuditEventRow } from '../../../api/auditApi';
import { isSliceNavPath } from '../../../productSlice';
import { adminHref, configHref, registryHref } from '../cpaHref';
import type { ConfigTab } from '../config/EditorView';
import { entityName } from './auditCatalog';
import { bundleName, type ConfigNames } from './useConfigNames';

export interface ObjectLink { label: string; to: string }

/** The one entity type whose id is a loop in the registry; bulk events carry `bulk:N`, a count, which names no loop. */
export const isSingleLoop = (e: Pick<AuditEventRow, 'entityType' | 'entityId'>): boolean =>
  e.entityType === 'CpmLoop' && !e.entityId.startsWith('bulk:');

const BUNDLE_TAB: Record<string, ConfigTab> = { CONFIG_DRAFT_APPROVED: 'approval', CONFIG_SHADOW_STARTED: 'shadow' };
const GONE = new Set(['RBAC_ROLE_DELETED', 'USER_DELETED', 'DISPLAY_DELETED', 'FOLDER_CREATED']);

/** The bundle a bundle or deployment event is about, when the page could read it. */
export function bundleOf(e: AuditEventRow, names: ConfigNames): { id: string; name?: string } | null {
  if (e.entityType === 'gate_config_bundle') {
    const b = names.bundle(e.entityId);
    return { id: e.entityId, name: b ? bundleName(b) : undefined };
  }
  if (e.entityType === 'config_deployment') {
    const d = names.deployment(e.entityId);
    if (!d) return null;
    const b = names.bundle(d.bundleId);
    return { id: d.bundleId, name: b ? bundleName(b) : undefined };
  }
  return null;
}

export function objectLink(
  e: AuditEventRow, ctx: { names: ConfigNames; has: (p: string) => boolean; loopKnown: boolean | undefined },
): ObjectLink | null {
  if (GONE.has(e.eventType)) return null;
  if (isSingleLoop(e)) return ctx.loopKnown ? { label: e.entityId, to: registryHref(e.entityId) } : null;
  if (e.entityType === 'gate_config_bundle' || e.entityType === 'config_deployment') {
    if (!ctx.has('cpm.config.read')) return null;
    const b = bundleOf(e, ctx.names);
    if (!b) return null;
    const tab: ConfigTab = e.entityType === 'config_deployment' ? 'deployments' : BUNDLE_TAB[e.eventType] ?? 'properties';
    return { label: b.name ?? 'Bundle', to: configHref({ bundle: b.id, tab }) };
  }
  if (e.entityType === 'Role' || e.entityType === 'RolePermissions') {
    return ctx.has('rbac.manage') ? { label: e.entityId, to: `${adminHref('roles')}?role=${encodeURIComponent(e.entityId)}` } : null;
  }
  if (e.entityType === 'User') {
    return ctx.has('admin.users.edit') && e.entityId !== 'bulk-import' ? { label: 'Users', to: adminHref('users') } : null;
  }
  if (e.entityType === 'Display' && isSliceNavPath('/designer')) return { label: entityName(e), to: `/designer/${encodeURIComponent(e.entityId)}` };
  return null;
}
