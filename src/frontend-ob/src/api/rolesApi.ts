// H2: authedAxios attaches the bearer, marks idle-clock activity (these are
// all admin-initiated actions) and replays once after a silent 401 refresh.
import axios from 'axios';
import { authedAxios } from './http';

// RBAC admin API (auth-service). All endpoints require the rbac.manage permission.
const BASE = '/api/auth';

export interface Role {
  role_name: string;
  description: string | null;
  is_system_role: boolean;
  created_at?: string;
}

export interface PermissionDef {
  permission_key: string;
  description: string | null;
  category: string | null;
}

export async function getRoles(): Promise<Role[]> {
  const res = await authedAxios.get(`${BASE}/roles`);
  return res.data.data;
}

export interface RoleWithPermissions extends Role {
  permissions: string[];
}

/** CHG-024 — every role with its permission keys in one request (was 1 + one per role). */
export async function getRolesWithPermissions(): Promise<RoleWithPermissions[]> {
  const res = await authedAxios.get(`${BASE}/roles`, { params: { include: 'permissions' } });
  return res.data.data;
}

export async function getPermissionCatalog(): Promise<PermissionDef[]> {
  const res = await authedAxios.get(`${BASE}/permissions`);
  return res.data.data;
}

export async function getRolePermissions(role: string): Promise<string[]> {
  const res = await authedAxios.get(`${BASE}/roles/${encodeURIComponent(role)}/permissions`);
  return res.data.data.permissions;
}

export async function setRolePermissions(role: string, permissions: string[]): Promise<string[]> {
  const res = await authedAxios.put(
    `${BASE}/roles/${encodeURIComponent(role)}/permissions`,
    { permissions },
    {}
  );
  return res.data.data.permissions;
}

export async function resetRolePermissions(role: string): Promise<string[]> {
  const res = await authedAxios.post(
    `${BASE}/roles/${encodeURIComponent(role)}/permissions/reset`,
    {},
    {}
  );
  return res.data.data.permissions;
}

export async function createRole(payload: {
  roleName: string;
  description?: string;
  permissions?: string[];
}): Promise<Role> {
  const res = await authedAxios.post(`${BASE}/roles`, payload);
  return res.data.data;
}

export async function updateRole(
  role: string,
  changes: { description?: string; newName?: string }
): Promise<Role> {
  const res = await authedAxios.put(`${BASE}/roles/${encodeURIComponent(role)}`, changes);
  return res.data.data;
}

export async function deleteRole(role: string, reassignTo?: string): Promise<void> {
  await authedAxios.delete(`${BASE}/roles/${encodeURIComponent(role)}`, {
    params: reassignTo ? { reassignTo } : undefined,
  });
}

/** Human-readable message from an auth-service error ({ error }). */
export function extractRoleApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 403) return 'You need the rbac.manage permission for this.';
    if (error.response?.status === 401) return 'Your session expired. Please sign in again.';
    if (error.response?.status === 409) {
      return (error.response?.data as { error?: string } | undefined)?.error || 'Conflict.';
    }
    return (error.response?.data as { error?: string } | undefined)?.error || error.message;
  }
  return 'An unexpected error occurred.';
}
