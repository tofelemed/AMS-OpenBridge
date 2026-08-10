import axios from 'axios';
import { getAuthToken } from './auth';

// RBAC admin API (auth-service). All endpoints require the rbac.manage permission.
const BASE = '/api/auth';
const authHeaders = () => ({ Authorization: `Bearer ${getAuthToken()}` });

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
  const res = await axios.get(`${BASE}/roles`, { headers: authHeaders() });
  return res.data.data;
}

export async function getPermissionCatalog(): Promise<PermissionDef[]> {
  const res = await axios.get(`${BASE}/permissions`, { headers: authHeaders() });
  return res.data.data;
}

export async function getRolePermissions(role: string): Promise<string[]> {
  const res = await axios.get(`${BASE}/roles/${encodeURIComponent(role)}/permissions`, {
    headers: authHeaders(),
  });
  return res.data.data.permissions;
}

export async function setRolePermissions(role: string, permissions: string[]): Promise<string[]> {
  const res = await axios.put(
    `${BASE}/roles/${encodeURIComponent(role)}/permissions`,
    { permissions },
    { headers: authHeaders() }
  );
  return res.data.data.permissions;
}

export async function resetRolePermissions(role: string): Promise<string[]> {
  const res = await axios.post(
    `${BASE}/roles/${encodeURIComponent(role)}/permissions/reset`,
    {},
    { headers: authHeaders() }
  );
  return res.data.data.permissions;
}

export async function createRole(payload: {
  roleName: string;
  description?: string;
  permissions?: string[];
}): Promise<Role> {
  const res = await axios.post(`${BASE}/roles`, payload, { headers: authHeaders() });
  return res.data.data;
}

export async function updateRole(
  role: string,
  changes: { description?: string; newName?: string }
): Promise<Role> {
  const res = await axios.put(`${BASE}/roles/${encodeURIComponent(role)}`, changes, {
    headers: authHeaders(),
  });
  return res.data.data;
}

export async function deleteRole(role: string, reassignTo?: string): Promise<void> {
  await axios.delete(`${BASE}/roles/${encodeURIComponent(role)}`, {
    headers: authHeaders(),
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
