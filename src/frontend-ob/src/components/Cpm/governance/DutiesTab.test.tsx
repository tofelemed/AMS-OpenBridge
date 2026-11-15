// @vitest-environment jsdom
// CHG-174 (owner review, badge 11, answer 1): full width, every role, the permission column kept when scrolled, the gate-
// configuration and user-administration keys added, one description per permission (the catalog's words, as on Roles).
// CHG-202 (owner, 15 Nov 2026): a permission reads by its description only, never its key.
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
    { permission_key: 'cpm.manage', description: 'Onboard and configure control loops (CPLM)', category: 'cpm' },
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
    await screen.findByText('Manage pipeline jobs and OPC connections; view Pipeline Health and Governance');
    expect(within(table).getAllByRole('rowheader').map(h => h.textContent)).toEqual([
      'Onboard and configure control loops', 'Manage pipeline jobs and OPC connections; view Pipeline Health and Governance',
      'View the audit log', 'View analytics / KPIs', 'Manage roles and their permissions', 'Create/edit controlled displays',
      'Create and edit gate-configuration drafts', 'Approve a validated gate-configuration bundle',
      'Activate an approved gate-configuration bundle', 'Create/edit/delete users',
    ]);
    expect(document.body.textContent).not.toMatch(/cpm\.manage|admin\.users\.edit|\(CPLM\)/);
    expect(screen.queryByText('Pipeline and OPC mutations')).toBeNull();
    expect(screen.queryByText(/role\(s\)/)).toBeNull();
  });

  it('marks who holds what for screen readers too', async () => {
    mount();
    await screen.findByText('Create/edit/delete users');
    expect(await screen.findByRole('img', { name: 'Admin: Onboard and configure control loops, held' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Operator: Approve a validated gate-configuration bundle, not held' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'SuperAdmin: Create/edit/delete users, held' })).toBeTruthy();
  });

  it('the permission column is the sticky row header of a scrolling region', async () => {
    mount();
    const region = await screen.findByRole('region', { name: 'Permissions by role' });
    expect(region.className).toContain('cpm-gov-duties');
    expect(within(region).getAllByRole('rowheader')[0].className).toContain('cpm-gov-duties__key');
  });

  it('without rbac.manage it says so in words, and reads nothing (CHG-202)', () => {
    held = ['system.manage'];
    mount();
    expect(screen.getByText('You do not have permission to view roles')).toBeTruthy();
    expect(screen.getByText('Separation of duties is shown to people who can manage roles.')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/rbac|RBAC|session/);
    expect(screen.queryByText(/route guards/)).toBeNull();
    expect(matrix).not.toHaveBeenCalled();
  });

  it('a failed read says Roles could not be read, with Retry', async () => {
    matrix.mockRejectedValue(new Error('The service is currently unavailable. Try again shortly.'));
    mount();
    expect(await screen.findByText('Roles could not be read')).toBeTruthy();
    matrix.mockResolvedValue([role('Viewer', [])]);
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
  });

  it('the matrix stays when the descriptions cannot be read, each permission still in words (CHG-202)', async () => {
    catalog.mockRejectedValue(new Error('no'));
    mount();
    expect(await screen.findByRole('img', { name: 'Admin: Onboard and configure control loops, held' })).toBeTruthy();
    expect(screen.getByText('Approve a validated gate-configuration bundle')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/cpm\.config/);
  });
});
