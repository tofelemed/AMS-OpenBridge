// @vitest-environment jsdom
// CHG-172 (owner review, the approved sample, badges 8-11): Roles & permissions is a role list (name, description under it,
// System / Custom) with the selected role in a panel: Description, every permission with what it allows on screen, "22 of 38",
// the sign-out sentence once beside Save permissions, Reset to default asking first, Delete role picking the target from a list,
// the links Users with this role ↗ and Permissions by role ↗. Every request keeps its endpoint and payload.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

const api = vi.hoisted(() => ({
  getRoles: vi.fn(), getPermissionCatalog: vi.fn(), getRolePermissions: vi.fn(), setRolePermissions: vi.fn(),
  resetRolePermissions: vi.fn(), createRole: vi.fn(), deleteRole: vi.fn(), updateRole: vi.fn(),
}));
let held = ['rbac.manage', 'admin.users.edit'];
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
vi.mock('../../store/authStore', () => ({
  useAuthStore: (pick: (s: unknown) => unknown) => pick({ hasPermission: (p: string) => held.includes(p) }),
}));
vi.mock('../../api/rolesApi', async () => {
  const real = await vi.importActual<typeof import('../../api/rolesApi')>('../../api/rolesApi');
  return { ...real, ...api };
});

import { RolesConfig } from './RolesConfig';

const SIGN_OUT = 'Everyone with this role is signed out within a few seconds, and gets the new permissions when they sign in again.';
const catalog = [
  { permission_key: 'admin.audit.view', description: 'View the audit log', category: 'admin' },
  { permission_key: 'rbac.manage', description: 'Manage roles and their permissions', category: 'admin' },
  { permission_key: 'asset.edit', description: 'Create/edit UNS assets', category: 'asset' },
  { permission_key: 'asset.view', description: 'View the UNS asset model', category: 'asset' },
];
const held_by: Record<string, string[]> = { Engineer: ['asset.edit', 'asset.view'], Viewer: ['asset.view'], Supervisor: ['asset.view'] };

const Where = () => { const l = useLocation(); return <output>{l.pathname + l.search}</output>; };
const show = async (at = '/admin/roles') => {
  render(<MemoryRouter initialEntries={[at]}><RolesConfig /><Where /></MemoryRouter>);
  await screen.findByRole('complementary');
};
const panel = () => screen.getByRole('complementary');
const box = (key: string) => within(panel()).getByRole('checkbox', { name: key }) as HTMLInputElement;

beforeEach(() => {
  held = ['rbac.manage', 'admin.users.edit'];
  api.getRoles.mockReset().mockResolvedValue([
    { role_name: 'Viewer', description: 'Viewer - read-only access', is_system_role: true },
    { role_name: 'Supervisor', description: 'Approves gate configuration on shift', is_system_role: false },
    { role_name: 'Engineer', description: 'Engineer - operate + configure, no user admin', is_system_role: true },
  ]);
  api.getPermissionCatalog.mockReset().mockResolvedValue(catalog);
  api.getRolePermissions.mockReset().mockImplementation(async (r: string) => held_by[r] ?? []);
  api.setRolePermissions.mockReset().mockImplementation(async (_r: string, keys: string[]) => keys);
  api.resetRolePermissions.mockReset().mockResolvedValue(['asset.view', 'asset.edit']);
  api.createRole.mockReset().mockImplementation(async (p: { roleName: string }) => ({ role_name: p.roleName, description: null, is_system_role: false }));
  api.deleteRole.mockReset().mockResolvedValue(undefined);
  api.updateRole.mockReset().mockResolvedValue({});
});
afterEach(cleanup);

describe('the role list', () => {
  it('lists system roles first, each with its description under it and its type as a word', async () => {
    await show();
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1).map(r => r.textContent);
    expect(rows).toEqual([
      'EngineerEngineer - operate + configure, no user adminSystem',
      'ViewerViewer - read-only accessSystem',
      'SupervisorApproves gate configuration on shiftCustom',
    ]);
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Role', 'Type']);
  });

  it('opens on the first role, or on the role a link names', async () => {
    await show();
    expect(within(panel()).getByRole('heading', { level: 2 }).textContent).toBe('Engineer');
    cleanup();
    await show('/admin/roles?role=Viewer');
    await waitFor(() => expect(within(panel()).getByRole('heading', { level: 2 }).textContent).toBe('Viewer'));
    expect(api.getRolePermissions).toHaveBeenLastCalledWith('Viewer');
  });
});

describe('the selected role', () => {
  it('shows its kind, the count, the description field and every permission with what it allows', async () => {
    await show();
    await waitFor(() => expect(box('asset.edit').checked).toBe(true));
    expect(within(panel()).getByText('System role')).toBeTruthy();
    expect(within(panel()).getByText('2 of 4')).toBeTruthy();
    expect((within(panel()).getByRole('textbox', { name: 'Description' }) as HTMLInputElement).value).toBe('Engineer - operate + configure, no user admin');
    expect(within(panel()).getByText('Create/edit UNS assets')).toBeTruthy();
    expect(within(panel()).getAllByRole('heading', { level: 3 }).map(h => h.textContent)).toContain('Permissions');
  });

  it('saves the description when the edit is committed', async () => {
    await show();
    const field = within(panel()).getByRole('textbox', { name: 'Description' }) as HTMLInputElement;
    await waitFor(() => expect(field.value).toBe('Engineer - operate + configure, no user admin'));
    fireEvent.input(field, { target: { value: 'Engineer - configures loops' } });
    expect(api.updateRole).not.toHaveBeenCalled();
    await act(async () => { field.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(api.updateRole).toHaveBeenCalledWith('Engineer', { description: 'Engineer - configures loops' });
  });

  it('says why Save permissions is off, then saves the ticked keys and says so', async () => {
    await show();
    await waitFor(() => expect(box('asset.edit').checked).toBe(true));
    const save = within(panel()).getByRole('button', { name: 'Save permissions' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(within(panel()).getByText('Tick or clear a permission first')).toBeTruthy();
    expect(screen.getAllByText(SIGN_OUT)).toHaveLength(1);
    fireEvent.click(box('admin.audit.view'));
    expect(within(panel()).getByText(/3 of 4/).textContent).toBe('3 of 4 · unsaved changes');
    fireEvent.click(within(panel()).getByRole('button', { name: 'Save permissions' }));
    await waitFor(() => expect(api.setRolePermissions).toHaveBeenCalledWith('Engineer', ['asset.edit', 'asset.view', 'admin.audit.view']));
    expect(await screen.findByText('Saved 3 permissions for Engineer.')).toBeTruthy();
    expect(screen.getAllByText(SIGN_OUT)).toHaveLength(1);
  });

  it('ticks or clears a whole group, and Discard changes puts the role back', async () => {
    await show();
    await waitFor(() => expect(box('asset.edit').checked).toBe(true));
    const admin = within(panel()).getByRole('group', { name: 'admin' });
    fireEvent.click(within(admin).getByRole('button', { name: 'All' }));
    expect(box('rbac.manage').checked).toBe(true);
    expect(within(admin).getByRole('button', { name: 'Clear' })).toBeTruthy();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Discard changes' }));
    expect(box('rbac.manage').checked).toBe(false);
    expect(within(panel()).queryByRole('button', { name: 'Discard changes' })).toBeNull();
  });

  it('asks before Reset to default, in the sign-out words, and resets only after the dialog button', async () => {
    await show();
    await waitFor(() => expect(box('asset.edit').checked).toBe(true));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Reset to default' }));
    let dialog = screen.getByRole('dialog', { name: 'Reset to default' });
    expect(within(dialog).getByText('The role gets its default permission set back; changes made on this page are lost.')).toBeTruthy();
    expect(within(dialog).getByText(SIGN_OUT)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(api.resetRolePermissions).not.toHaveBeenCalled();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Reset to default' }));
    dialog = screen.getByRole('dialog', { name: 'Reset to default' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset to default' }));
    await waitFor(() => expect(api.resetRolePermissions).toHaveBeenCalledWith('Engineer'));
    expect(await screen.findByText('Engineer reset to its default permission set.')).toBeTruthy();
  });

  it('deletes a custom role, moving its users to the role picked from a list', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: /^Supervisor/ }));
    await waitFor(() => expect(within(panel()).getByText('Custom role')).toBeTruthy());
    expect(within(panel()).queryByRole('button', { name: 'Reset to default' })).toBeNull();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Delete role' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete role "Supervisor"' });
    expect(within(dialog).getByText('If any users hold this role, enter a role to reassign them to (leave blank to cancel if there are users).')).toBeTruthy();
    const target = within(dialog).getByRole('combobox', { name: 'Reassign users to' }) as HTMLSelectElement;
    expect([...target.options].map(o => o.value)).toEqual(['Viewer', 'Engineer']);
    expect(target.value).toBe('Viewer');
    fireEvent.change(target, { target: { value: 'Engineer' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete role' }));
    await waitFor(() => expect(api.deleteRole).toHaveBeenCalledWith('Supervisor', 'Engineer'));
    expect(await screen.findByText('Role "Supervisor" deleted.')).toBeTruthy();
  });

  it('shows a server refusal as the server words it', async () => {
    api.setRolePermissions.mockRejectedValue(Object.assign(new Error('x'), {
      isAxiosError: true, response: { status: 409, data: { error: 'This change would leave no active user with the rbac.manage permission. Give it to another active user first.' } },
    }));
    await show();
    await waitFor(() => expect(box('asset.edit').checked).toBe(true));
    fireEvent.click(box('asset.edit'));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Save permissions' }));
    expect((await screen.findByRole('alert')).textContent).toContain('would leave no active user with the rbac.manage permission');
  });

  it('links to the users who hold the role and to the permissions by role', async () => {
    await show();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Users with this role ↗' }));
    expect(screen.getByRole('status').textContent).toBe('/admin/users?role=Engineer');
    cleanup();
    held = ['rbac.manage'];
    await show();
    expect(within(panel()).queryByRole('button', { name: 'Users with this role ↗' })).toBeNull();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Permissions by role ↗' }));
    expect(screen.getByRole('status').textContent).toBe('/cpm/governance');
  });
});

describe('Add custom role', () => {
  it('creates a role from a small dialog and opens it', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Add custom role' }));
    const dialog = screen.getByRole('dialog', { name: 'Add custom role' });
    const create = within(dialog).getByRole('button', { name: 'Create' }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    expect(within(dialog).getByText('Write a role name first')).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Role name'), { target: { value: ' ShiftLead ' } });
    fireEvent.change(within(dialog).getByLabelText('Description'), { target: { value: 'Leads the shift' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(api.createRole).toHaveBeenCalledWith({ roleName: 'ShiftLead', description: 'Leads the shift' }));
    expect(await screen.findByText('Custom role "ShiftLead" created. Select permissions and Save.')).toBeTruthy();
  });
});
