/**
 * CHG-220 (owner, 23 Nov 2026; Gate Configuration check gap 5): who may approve a gate configuration bundle, the same rule in the
 * bundle editor, in Per-loop settings and in cplm-api. Someone other than the author approves; the author approves alone only as
 * Admin or SuperAdmin (recorded as a self-approval). A plant-wide (SITE) bundle needs a SuperAdmin (the owner's choice: a SuperAdmin
 * counts as the ControlAuthority role, which nobody held, so nobody could approve a SITE bundle before). CHG-224 (owner decision
 * D6): no property needs one any more - an objective or a test permission is no longer edited in Gate Configuration.
 */
import type { Bundle } from '../../../api/cpm/config';

export const ADMIN_ROLES = ['Admin', 'SuperAdmin'];
/** The properties whose change needs a SuperAdmin: none since CHG-224 (the server's list is empty too). */
export const SUPERADMIN_PROPERTIES: string[] = [];

export type Viewer = { username?: string | null; role?: string | null } | null;
export interface ApproveRule { label: string; reason: string | null }

const roleIs = (viewer: Viewer, roles: string[]) => !!viewer?.role && roles.some(r => r.toLowerCase() === viewer.role!.toLowerCase());

/** Whether the viewer wrote it, and whether they may approve their own work. */
export function standing(author: string | null | undefined, viewer: Viewer) {
  const mine = !!author && !!viewer?.username && author.toLowerCase() === viewer.username.toLowerCase();
  return { mine, admin: roleIs(viewer, ADMIN_ROLES), superAdmin: roleIs(viewer, ['SuperAdmin', 'ControlAuthority']) };
}

/** A SITE bundle, or one whose own layer sets an objective or a test permission. */
export function needsSuperAdmin(bundle: Pick<Bundle, 'scopeKind' | 'layers' | 'resolved'>): 'SITE' | 'PROPERTY' | null {
  if (bundle.scopeKind === 'SITE') return 'SITE';
  const own = bundle.layers.filter(l => l.kind === bundle.scopeKind && l.content && typeof l.content === 'object');
  const props = bundle.resolved?.properties ?? {};
  const edited = SUPERADMIN_PROPERTIES.some(p => props[p] != null && own.some(l => p in l.content));
  return edited ? 'PROPERTY' : null;
}

/** The Approve button's label, and why this viewer cannot approve this bundle (null: they can). */
export function bundleApproveRule(bundle: Pick<Bundle, 'createdBy' | 'scopeKind' | 'layers' | 'resolved'>, viewer: Viewer): ApproveRule {
  const who = standing(bundle.createdBy, viewer);
  const label = who.mine && who.admin ? 'Approve alone' : 'Approve';
  if (who.mine && !who.admin) return { label, reason: 'Needs a second person' };
  const sensitive = needsSuperAdmin(bundle);
  if (sensitive && !who.superAdmin) {
    return { label, reason: sensitive === 'SITE' ? 'A plant-wide bundle needs a SuperAdmin to approve it.' : 'A change to an objective or a test permission needs a SuperAdmin to approve it.' };
  }
  return { label, reason: null };
}
