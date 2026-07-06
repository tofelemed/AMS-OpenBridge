/**
 * Role helpers. Admin is the only elevated role (full access).
 * Case-insensitive because JWT and DB values may differ in casing.
 */

export const APP_ROLES = ['Admin', 'Engineer', 'Operator', 'Viewer'] as const;
export type AppRole = (typeof APP_ROLES)[number];

export function hasElevatedRole(role: string | undefined): boolean {
  return (role ?? '').trim().toLowerCase() === 'admin';
}
