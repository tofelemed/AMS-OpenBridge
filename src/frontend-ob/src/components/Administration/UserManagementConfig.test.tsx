// @vitest-environment jsdom
// CHG-172 (owner review, the approved sample): Users is one list (a 32 px filter row, search first, the counts inside the two
// dropdowns, the shared pager) with the selected user in a panel: Email, Role, Created; Delete and Edit in the foot. On your own
// account Delete is disabled with its reason on screen. Add user sends Active account (3a); Edit sends only what changed (3b);
// the server's refusals show as it words them (3c). Every request keeps its endpoint and shape.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { AdminUser, UsersFilters } from '../../api/usersApi';

const { deleteUser, createUser, updateUser, getUsersPage } = vi.hoisted(() => ({
  deleteUser: vi.fn(), createUser: vi.fn(), updateUser: vi.fn(), getUsersPage: vi.fn(),
}));
let held: string[] = ['admin.users.edit', 'rbac.manage'];
let pages = 1;
const users: AdminUser[] = [
  { user_id: 'me', username: 'platform_admin', full_name: 'Platform Administrator', email: 'platform.admin@example.test', role: 'SuperAdmin', is_active: true, created_at: '2026-10-10T12:00:00Z' },
  { user_id: 'u1', username: 'a_engineer', full_name: 'A. Engineer', email: 'engineer.a@example.test', role: 'Engineer', is_active: true, created_at: '2026-11-03T12:00:00Z' },
  { user_id: 'u2', username: 'h_viewer', full_name: '', email: 'viewer.h@example.test', role: 'Viewer', is_active: false, created_at: '2026-09-20T12:00:00Z' },
];

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
vi.mock('../../store/authStore', () => ({
  useAuthStore: (pick: (s: unknown) => unknown) => pick({ user: { user_id: 'me' }, hasPermission: (p: string) => held.includes(p) }),
}));
vi.mock('../../api/usersApi', async () => {
  const real = await vi.importActual<typeof import('../../api/usersApi')>('../../api/usersApi');
  return { ...real, getUsersPage, createUser, updateUser, deleteUser };
});
vi.mock('../../api/rolesApi', () => ({
  getRoles: async () => ['Admin', 'Engineer', 'Operator', 'SuperAdmin', 'Viewer'].map(role_name => ({ role_name, description: null, is_system_role: true })),
}));
vi.mock('./BulkImportModal', () => ({ BulkImportModal: (p: { isOpen: boolean }) => (p.isOpen ? <p>bulk import open</p> : null) }));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

import { UserManagementConfig } from './UserManagementConfig';

const answer = (f: UsersFilters) => {
  const needle = (f.search ?? '').toLowerCase();
  const rows = users.filter(u => (!f.role || u.role === f.role) && (!f.status || (f.status === 'active') === u.is_active)
    && (!needle || [u.username, u.full_name ?? '', u.email].some(v => v.toLowerCase().includes(needle))));
  const byRole: Record<string, number> = {};
  rows.forEach(u => { byRole[u.role] = (byRole[u.role] ?? 0) + 1; });
  return {
    users: rows,
    stats: { total: rows.length, active: rows.filter(u => u.is_active).length, inactive: rows.filter(u => !u.is_active).length, byRole },
    pagination: { page: f.page ?? 1, pageSize: 50, total: rows.length, totalPages: pages },
    filterOptions: { roles: [], statuses: [] },
  };
};

const Where = () => { const l = useLocation(); return <output>{l.pathname + l.search}</output>; };
const show = async (at = '/admin/users', first = 'a_engineer') => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[at]}><UserManagementConfig /><Where /></MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findAllByText(first);
};
const panel = () => screen.getByRole('complementary');
const row = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });
const lastFilters = () => getUsersPage.mock.calls.map(c => c[0] as UsersFilters);
const refusal = (status: number, error: string) => Object.assign(new Error('Request failed'), {
  isAxiosError: true, response: { status, data: { success: false, error } },
});

beforeEach(() => {
  held = ['admin.users.edit', 'rbac.manage'];
  pages = 1;
  getUsersPage.mockReset().mockImplementation(async (f: UsersFilters) => answer(f));
  deleteUser.mockReset().mockResolvedValue(undefined);
  createUser.mockReset().mockResolvedValue({});
  updateUser.mockReset().mockResolvedValue({});
});
afterEach(cleanup);

describe('the user list', () => {
  it('keeps Bulk import and Add user as the tab actions', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Bulk import' }));
    expect(screen.getByText('bulk import open')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add user' })).toBeTruthy();
  });

  it('shows User, Role and Status, the role as a word and the status as tone, glyph and word', async () => {
    await show();
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual(['User', 'Role', 'Status']);
    const cells = within(screen.getByRole('table')).getAllByRole('row')[2].textContent;
    expect(cells).toContain('a_engineer');
    expect(cells).toContain('A. Engineer');
    expect(cells).toContain('Engineer');
    expect(cells).toContain('✓Active');
    expect(within(screen.getByRole('table')).getAllByRole('row')[3].textContent).toContain('⊘Inactive');
    expect(screen.queryByText(/users ·/)).toBeNull();
  });

  it('puts the counts inside the two dropdowns, beside a search that names what it finds', async () => {
    await show();
    expect(screen.getByRole('searchbox', { name: 'Find user' }).getAttribute('placeholder')).toBe('User name, name or email');
    const role = screen.getByRole('combobox', { name: 'Role' }) as HTMLSelectElement;
    const status = screen.getByRole('combobox', { name: 'Status' }) as HTMLSelectElement;
    await waitFor(() => expect([...role.options].map(o => o.textContent)).toEqual(['All roles 3', 'Admin 0', 'Engineer 1', 'Operator 0', 'SuperAdmin 1', 'Viewer 1']));
    expect([...status.options].map(o => o.textContent)).toEqual(['All statuses 3', 'Active 2', 'Inactive 1']);
  });

  it('keeps the counts of every role when one role is chosen, and sends the role filter', async () => {
    await show();
    const role = screen.getByRole('combobox', { name: 'Role' }) as HTMLSelectElement;
    await waitFor(() => expect(role.options.length).toBe(6));
    fireEvent.change(role, { target: { value: 'Engineer' } });
    await waitFor(() => expect(lastFilters().some(f => f.role === 'Engineer' && f.page === 1 && f.pageSize === 50)).toBe(true));
    await waitFor(() => expect(screen.queryByText('platform_admin')).toBeNull());
    expect([...role.options].map(o => o.textContent)).toContain('SuperAdmin 1');
  });

  it('opens on the role a link names', async () => {
    await show('/admin/users?role=Viewer', 'h_viewer');
    await waitFor(() => expect((screen.getByRole('combobox', { name: 'Role' }) as HTMLSelectElement).value).toBe('Viewer'));
    expect(lastFilters().some(f => f.role === 'Viewer')).toBe(true);
  });

  it('shows the shared pager only when there is more than one page, and asks for the next page', async () => {
    await show();
    expect(screen.queryByRole('navigation', { name: 'User pages' })).toBeNull();
    cleanup();
    pages = 2;
    await show();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'User pages' })).getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(lastFilters().some(f => f.page === 2)).toBe(true));
  });

  it('says No users found when nothing matches', async () => {
    getUsersPage.mockImplementation(async (f: UsersFilters) => ({ ...answer(f), users: [] }));
    render(
      <QueryClientProvider client={new QueryClient()}><MemoryRouter><UserManagementConfig /></MemoryRouter></QueryClientProvider>,
    );
    expect(await screen.findByText('No users found')).toBeTruthy();
  });
});

describe('the selected user', () => {
  it('shows Email, Role and Created in the panel, with Delete and Edit in the foot', async () => {
    await show();
    fireEvent.click(row('a_engineer'));
    const p = panel();
    expect(within(p).getByRole('heading', { level: 2 }).textContent).toBe('a_engineer');
    expect(within(p).getByText('A. Engineer')).toBeTruthy();
    expect(within(p).getByText('engineer.a@example.test')).toBeTruthy();
    expect(within(p).getByText('3 Nov 2026')).toBeTruthy();
    expect(within(p).getByRole('button', { name: 'Delete' })).toBeTruthy();
    expect(within(p).getByRole('button', { name: 'Edit' })).toBeTruthy();
  });

  it('opens the role on Roles & permissions, for a role manager only', async () => {
    await show();
    fireEvent.click(row('a_engineer'));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Permissions ↗' }));
    expect(screen.getByRole('status').textContent).toBe('/admin/roles?role=Engineer');
    cleanup();
    held = ['admin.users.edit'];
    await show();
    fireEvent.click(row('a_engineer'));
    expect(within(panel()).queryByRole('button', { name: 'Permissions ↗' })).toBeNull();
  });

  it('disables Delete on your own account and says why on screen', async () => {
    await show();
    fireEvent.click(row('platform_admin'));
    const del = within(panel()).getByRole('button', { name: 'Delete' }) as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    expect(within(panel()).getByText('You cannot delete your own account.')).toBeTruthy();
  });

  it('asks before deleting, and deletes only after Delete', async () => {
    await show();
    fireEvent.click(row('a_engineer'));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Delete' }));
    let dialog = screen.getByRole('dialog', { name: 'Delete user' });
    expect(within(dialog).getByText('Delete user "a_engineer"? This cannot be undone.')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(deleteUser).not.toHaveBeenCalled();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Delete' }));
    dialog = screen.getByRole('dialog', { name: 'Delete user' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleteUser).toHaveBeenCalledWith('u1'));
  });

  it('shows the server refusal of a delete in the dialog', async () => {
    deleteUser.mockRejectedValue(refusal(409, 'This change would leave no active user with the admin.users.edit permission. Give it to another active user first.'));
    await show();
    fireEvent.click(row('a_engineer'));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Delete' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete user' })).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText(/would leave no active user with the admin.users.edit permission/)).toBeTruthy();
  });
});

describe('Add user and Edit user', () => {
  const field = (dialog: HTMLElement, name: string) => within(dialog).getByLabelText(name) as HTMLInputElement;

  it('adds a user in two titled parts and sends Active account as ticked', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Add user' }));
    const dialog = screen.getByRole('dialog', { name: 'Add user' });
    expect(within(dialog).getAllByRole('heading', { level: 3 }).map(h => h.textContent)).toEqual(['Account', 'Access']);
    fireEvent.change(field(dialog, 'Username *'), { target: { value: 'shift_b' } });
    fireEvent.change(field(dialog, 'Email *'), { target: { value: 'shift.b@example.test' } });
    fireEvent.change(field(dialog, 'Password *'), { target: { value: 'Passw0rdX' } });
    fireEvent.change(within(dialog).getByLabelText('Role *'), { target: { value: 'Operator' } });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Active account' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create user' }));
    await waitFor(() => expect(createUser).toHaveBeenCalledWith({
      username: 'shift_b', email: 'shift.b@example.test', password: 'Passw0rdX', full_name: undefined, role: 'Operator', is_active: false,
    }));
  });

  it('keeps the checks word for word and sends nothing until they pass', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Add user' }));
    const dialog = screen.getByRole('dialog', { name: 'Add user' });
    fireEvent.change(field(dialog, 'Username *'), { target: { value: 'ab' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create user' }));
    expect(within(dialog).getByRole('alert').textContent).toBe('Username must be 3+ chars (letters, numbers, underscores).');
    expect(createUser).not.toHaveBeenCalled();
  });

  it('shows a role-assignment refusal as the server words it', async () => {
    createUser.mockRejectedValue(refusal(403, "Assigning the role 'SuperAdmin' needs the rbac.manage permission, because the role has permissions you do not hold."));
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Add user' }));
    const dialog = screen.getByRole('dialog', { name: 'Add user' });
    fireEvent.change(field(dialog, 'Username *'), { target: { value: 'shift_b' } });
    fireEvent.change(field(dialog, 'Email *'), { target: { value: 'shift.b@example.test' } });
    fireEvent.change(field(dialog, 'Password *'), { target: { value: 'Passw0rdX' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create user' }));
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toContain("Assigning the role 'SuperAdmin' needs the rbac.manage permission"));
  });

  it('sends only the email when only the email changed', async () => {
    await show();
    fireEvent.click(row('a_engineer'));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit user' });
    expect(within(dialog).queryByLabelText('Username *')).toBeNull();
    expect(within(dialog).queryByLabelText('Password *')).toBeNull();
    fireEvent.change(field(dialog, 'Email *'), { target: { value: 'a.engineer@example.test' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith('u1', { email: 'a.engineer@example.test' }));
  });

  it('sends the role and the status when they change', async () => {
    await show();
    fireEvent.click(row('a_engineer'));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit user' });
    fireEvent.change(within(dialog).getByLabelText('Role *'), { target: { value: 'Operator' } });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Active account' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith('u1', { role: 'Operator', is_active: false }));
  });

  it('closes without a request when nothing changed', async () => {
    await show();
    fireEvent.click(row('a_engineer'));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Edit' }));
    await act(async () => { fireEvent.click(within(screen.getByRole('dialog', { name: 'Edit user' })).getByRole('button', { name: 'Save changes' })); });
    expect(screen.queryByRole('dialog', { name: 'Edit user' })).toBeNull();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('locks your own role and status, and says why on screen', async () => {
    await show();
    fireEvent.click(row('platform_admin'));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit user' });
    expect((within(dialog).getByLabelText('Role *') as HTMLSelectElement).disabled).toBe(true);
    expect((within(dialog).getByRole('checkbox', { name: 'Active account' }) as HTMLInputElement).disabled).toBe(true);
    expect(within(dialog).getByText('You cannot change your own role or status.')).toBeTruthy();
  });
});
