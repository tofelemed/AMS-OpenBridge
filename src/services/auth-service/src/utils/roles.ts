/**
 * Role helpers. SuperAdmin (CHG-081) and Admin are the elevated roles; SuperAdmin alone holds platform
 * administration, enforced by permissions (cpm-14), not by this helper.
 * Case-insensitive because JWT and DB values may differ in casing.
 */

export const APP_ROLES = ['SuperAdmin', 'Admin', 'Engineer', 'Operator', 'Viewer'] as const;
export type AppRole = (typeof APP_ROLES)[number];

export function hasElevatedRole(role: string | undefined): boolean {
  const r = (role ?? '').trim().toLowerCase();
  return r === 'admin' || r === 'superadmin';
}
