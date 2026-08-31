/**
 * Marun first cut (D-SLICE): Loop Performance + admin subset + historian trend.
 * CAMS alarms and HMI Designer stay out of the chrome. Routes remain in the
 * bundle so a later module is a flag flip, not a new app.
 */
export const CPA_SLICE_ONLY = true;

export const HOME_PATH = '/cpm';

const SLICE_NAV = new Set([
  '/cpm',
  '/cpm/performance',
  '/cpm/explorer',
  '/cpm/historical',
  '/cpm/windows',
  '/cpm/replay',
  '/cpm/investigation',
  '/cpm/calculations',
  '/cpm/registry',
  '/cpm/events',
  '/cpm/pipeline',
  '/cpm/governance',
  '/trend',
  '/admin',
]);

export const SLICE_ADMIN_TABS = new Set([
  '/admin/users',
  '/admin/roles',
  '/admin/data-sources',
  '/admin/plant-model',
  '/admin/aliases',
  '/admin/audit',
  '/admin/system',
]);

export function isSliceNavPath(path: string): boolean {
  if (!CPA_SLICE_ONLY) return true;
  return SLICE_NAV.has(path);
}

export function isSliceAdminTab(path: string): boolean {
  if (!CPA_SLICE_ONLY) return true;
  return SLICE_ADMIN_TABS.has(path);
}

/** After login: /cpm, unless `from` is a kept CPA/admin/trend URL. */
export function postLoginPath(from?: string | null): string {
  if (!CPA_SLICE_ONLY) return from && from !== '/login' ? from : '/dashboard';
  if (!from || from === '/login' || from === '/') return HOME_PATH;
  const path = from.split('?')[0];
  if (path === '/cpm' || path.startsWith('/cpm/')) return from;
  if (path === '/trend' || path.startsWith('/trend')) return from;
  if (path === '/admin' || SLICE_ADMIN_TABS.has(path)) return from;
  return HOME_PATH;
}
