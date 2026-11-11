/**
 * The Administration tabs, each with the permission that shows it (the reference's order). Alarm feed, Alarm rules and
 * Notifications are outside the CPA slice and follow, so a full build keeps them.
 *
 * CHG-172 (owner review, 11 Nov 2026): System settings is hidden until a settings service exists (answer 2); Audit log is a link
 * at the end of the tab row, not a tab (answer 1); Plant model and Tag aliases open with asset.view, as their own texts always
 * said, so Admin and Engineer reach them (answer 3f; writes inside need asset.edit, and the server checks every call).
 */
import { HOME_PATH, isSliceAdminTab } from '../../productSlice';
import { governanceHref } from '../Cpm/cpaHref';

export type HowToKey = 'users' | 'roles' | 'sources' | 'plant' | 'aliases';

export interface AdminTab {
  path: string;
  label: string;
  permission?: string;
  /** The How to read part for this tab. */
  howTo?: HowToKey;
}

export const ADMIN_TABS: readonly AdminTab[] = [
  { path: '/admin/users', label: 'Users', permission: 'admin.users.edit', howTo: 'users' },
  { path: '/admin/roles', label: 'Roles & permissions', permission: 'rbac.manage', howTo: 'roles' },
  { path: '/admin/data-sources', label: 'Data sources', permission: 'ingestion.view', howTo: 'sources' },
  { path: '/admin/plant-model', label: 'Plant model', permission: 'asset.view', howTo: 'plant' },
  { path: '/admin/aliases', label: 'Tag aliases', permission: 'asset.view', howTo: 'aliases' },
  { path: '/admin/alarm-feed', label: 'Alarm feed' },
  { path: '/admin/alarm-rules', label: 'Alarm rules' },
  { path: '/admin/notifications', label: 'Notifications' },
];

/** Shows the Audit log ↗ link (the audit trail is on Governance). */
export const AUDIT_PERMISSION = 'admin.audit.view';

export const visibleAdminTabs = (has: (p: string) => boolean): AdminTab[] =>
  ADMIN_TABS.filter(t => isSliceAdminTab(t.path) && (!t.permission || has(t.permission)));

/**
 * Where a bare /admin (or an address that is no tab) goes: the first tab the role may open; with none, Governance for an
 * auditor (as the Audit log tab did), else the home page.
 */
export function adminLanding(has: (p: string) => boolean): string {
  return visibleAdminTabs(has)[0]?.path ?? (has(AUDIT_PERMISSION) ? governanceHref() : HOME_PATH);
}
