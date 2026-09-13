// CHG-024 (batch 5) — the Governance role matrix: one request instead of 1 + one per role.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as rolesApi from '../../api/rolesApi';
import { useRoleMatrix } from './useRoleMatrix';

vi.mock('../../api/rolesApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/rolesApi')>();
  return { ...actual, getRoles: vi.fn(), getRolePermissions: vi.fn(), getRolesWithPermissions: vi.fn() };
});

let canManage = true;
vi.mock('../../store/authStore', () => ({
  useAuthStore: (selector: (s: { hasPermission: (p: string) => boolean }) => unknown) =>
    selector({ hasPermission: (p: string) => p === 'rbac.manage' && canManage }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useRoleMatrix', () => {
  beforeEach(() => {
    canManage = true;
    vi.mocked(rolesApi.getRoles).mockReset();
    vi.mocked(rolesApi.getRolePermissions).mockReset();
    vi.mocked(rolesApi.getRolesWithPermissions).mockReset();
    vi.mocked(rolesApi.getRolesWithPermissions).mockResolvedValue([
      { role_name: 'admin', description: null, is_system_role: true, permissions: ['rbac.manage', 'analytics.view'] },
      { role_name: 'viewer', description: 'read only', is_system_role: true, permissions: ['analytics.view'] },
    ]);
  });

  it('builds the matrix from ONE roles-with-permissions request', async () => {
    const { result } = renderHook(() => useRoleMatrix(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(vi.mocked(rolesApi.getRolesWithPermissions)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(rolesApi.getRoles)).not.toHaveBeenCalled();
    expect(vi.mocked(rolesApi.getRolePermissions)).not.toHaveBeenCalled();
    expect(result.current.canRead).toBe(true);
    expect(result.current.data!.roles.map(r => r.role_name)).toEqual(['admin', 'viewer']);
    expect(result.current.data!.holders['viewer'].has('analytics.view')).toBe(true);
    expect(result.current.data!.holders['viewer'].has('rbac.manage')).toBe(false);
  });

  it('asks nothing when the session cannot manage RBAC', async () => {
    canManage = false;
    const { result } = renderHook(() => useRoleMatrix(), { wrapper });
    await new Promise(r => setTimeout(r, 30));

    expect(result.current.canRead).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(vi.mocked(rolesApi.getRolesWithPermissions)).not.toHaveBeenCalled();
  });
});
