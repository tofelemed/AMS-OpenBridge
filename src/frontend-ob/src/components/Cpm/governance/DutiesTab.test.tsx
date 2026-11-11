// @vitest-environment jsdom
// CHG-174 (owner review, badge 11, answer 1): full width, every role, the permission column kept when scrolled, the gate-
// configuration and user-administration keys added, one description per permission (the catalog's words, as on Roles).
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DUTY_KEYS, DutiesTab } from './DutiesTab';

let held = ['system.manage', 'rbac.manage'];
const matrix = vi.fn();
const catalog = vi.fn();

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => <button type="button" onClick={onClick}>{children}</button>,
}));
vi.mock('../../../store/authStore', () => ({
  useAuthStore: (pick: (s: { hasPermission: (p: string) => boolean }) => unknown) => pick({ hasPermission: p => held.includes(p) }),
}));
vi.mock('../../../api/rolesApi', () => ({
  getRolesWithPermissions: () => matrix(),
  getPermissionCatalog: () => catalog(),
}));

const role = (name: string, permissions: string[]) => ({ role_name: name, description: null, is_system_role: true, permissions });
const mount = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DutiesTab /></QueryClientProvider>,
);

beforeEach(() => {
  held = ['system.manage', 'rbac.manage'];
  matrix.mockReset(); catalog.mockReset();
  matrix.mockResolvedValue([
    role('Admin', ['cpm.manage', 'analytics.view', 'display.edit']),
    role('Engineer', ['cpm.manage', 'analytics.view', 'display.edit']),
    role('Operator', ['analytics.view']),
    role('SuperAdmin', [...DUTY_KEYS]),
    role('Viewer', ['analytics.view']),
  ]);
  catalog.mockResolvedValue([
    { permission_key: 'system.manage', description: 'Manage pipeline jobs and OPC connections; view Pipeline Health and Governance', category: 'system' },
    { permission_key: 'cpm.config.approve', description: 'Approve a validated gate-configuration bundle', category: 'cpm' },
    { permission_key: 'admin.users.edit', description: 'Create/edit/delete users', category: 'admin' },
  ]);
});
afterEach(cleanup);

describe('separation of duties', () => {
  it('shows every role and the duties four eyes separates, each with the catalog description', async () => {
    mount();
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Permission', 'Admin', 'Engineer', 'Operator', 'SuperAdmin', 'Viewer']);
    expect(within(table).getAllByRole('rowheader').map(h => h.querySelector('.cpm-mono')?.textContent)).toEqual([
      'cpm.manage', 'system.manage', 'admin.audit.view', 'analytics.view', 'rbac.manage', 'display.edit',
      'cpm.config.draft', 'cpm.config.approve', 'cpm.config.activate', 'admin.users.edit',
    ]);
    await screen.findByText('Manage pipeline jobs and OPC connections; view Pipeline Health and Governance');
    expect(screen.getByText('Approve a validated gate-configuration bundle')).toBeTruthy();
    expect(screen.getByText('Create/edit/delete users')).toBeTruthy();
    expect(screen.queryByText('Pipeline and OPC mutations')).toBeNull();
    expect(screen.queryByText(/role\(s\)/)).toBeNull();
  });

  it('marks who holds what for screen readers too', async () => {
    mount();
    expect(await screen.findByRole('img', { name: 'Admin holds cpm.manage' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Operator does not hold cpm.config.approve' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'SuperAdmin holds admin.users.edit' })).toBeTruthy();
  });

  it('the permission column is the sticky row header of a scrolling region', async () => {
    mount();
    const region = await screen.findByRole('region', { name: 'Permissions by role' });
    expect(region.className).toContain('cpm-gov-duties');
    expect(within(region).getAllByRole('rowheader')[0].className).toContain('cpm-gov-duties__key');
  });

  it('without rbac.manage it says so in its first sentence only, and reads nothing', () => {
    held = ['system.manage'];
    mount();
    expect(screen.getByText('The live role matrix needs the rbac.manage permission')).toBeTruthy();
    expect(screen.getByText('Your session can read the audit trail but not the RBAC model, so this panel will not describe a permission model it cannot verify.')).toBeTruthy();
    expect(screen.queryByText(/route guards/)).toBeNull();
    expect(matrix).not.toHaveBeenCalled();
  });

  it('a failed read says RBAC model unavailable with Retry', async () => {
    matrix.mockRejectedValue(new Error('The service is currently unavailable. Try again shortly.'));
    mount();
    expect(await screen.findByText('RBAC model unavailable')).toBeTruthy();
    matrix.mockResolvedValue([role('Viewer', [])]);
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
  });

  it('the matrix stays when the descriptions cannot be read', async () => {
    catalog.mockRejectedValue(new Error('no'));
    mount();
    expect(await screen.findByRole('img', { name: 'Admin holds cpm.manage' })).toBeTruthy();
  });
});
