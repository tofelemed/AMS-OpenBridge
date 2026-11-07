// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UserManagementConfig } from './UserManagementConfig';

const deleteUser = vi.fn().mockResolvedValue(undefined);
const confirm = vi.fn();
const users = [
  { user_id: 'u1', username: 'alice', full_name: 'Alice A', email: 'alice@plant.test', role: 'Admin', is_active: true, created_at: '2026-01-02T00:00:00Z' },
  { user_id: 'u2', username: 'root', full_name: '', email: 'root@plant.test', role: 'SuperAdmin', is_active: false, created_at: '2026-01-03T00:00:00Z' },
];

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
vi.mock('../../store/authStore', () => ({ useAuthStore: (pick: (s: unknown) => unknown) => pick({ user: { user_id: 'me' } }) }));
vi.mock('../../api/usersApi', () => ({
  getUsersPage: async () => ({ users, stats: { total: 2, active: 1, inactive: 1 }, pagination: { page: 1, totalPages: 1, total: 2 } }),
  createUser: vi.fn(), updateUser: vi.fn(), deleteUser: (id: string) => deleteUser(id), extractApiError: () => 'err',
}));
vi.mock('../../api/rolesApi', () => ({ getRoles: async () => [{ role_name: 'Admin' }, { role_name: 'SuperAdmin' }] }));
vi.mock('../shared/dialogService', () => ({ useConfirm: () => confirm }));
vi.mock('./BulkImportModal', () => ({ BulkImportModal: () => null }));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

const show = async () => {
  render(<QueryClientProvider client={new QueryClient()}><UserManagementConfig /></QueryClientProvider>);
  await screen.findByText('alice');
};
beforeEach(() => { deleteUser.mockClear(); confirm.mockReset(); });
afterEach(cleanup);

describe('Users', () => {
  it('shows User, Role and Status, with the rest in the row dialog', async () => {
    await show();
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual(['User', 'Role', 'Status']);
    expect(screen.queryByText('alice@plant.test')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /alice/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('alice@plant.test')).toBeTruthy();
    expect(within(dialog).getByText('Created')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeTruthy();
  });

  it('keeps the delete confirmation in the row dialog', async () => {
    confirm.mockResolvedValue(false);
    await show();
    fireEvent.click(screen.getByRole('button', { name: /alice/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(deleteUser).not.toHaveBeenCalled();
    confirm.mockResolvedValue(true);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleteUser).toHaveBeenCalledWith('u1'));
  });

  it('never paints a role in alarm colours', async () => {
    await show();
    const badges = screen.getAllByTestId('role-badge');
    expect(badges.map(b => b.firstElementChild?.className)).toEqual(['ui-badge ui-badge--neutral', 'ui-badge ui-badge--neutral']);
    expect(badges.map(b => b.textContent)).toEqual(['·Admin', '·SuperAdmin']);
  });

  it('keeps Bulk import and the role and status filters', async () => {
    await show();
    expect(screen.getByRole('button', { name: 'Bulk import' })).toBeTruthy();
    expect(screen.getByLabelText('Filter by role')).toBeTruthy();
    expect(screen.getByLabelText('Filter by status')).toBeTruthy();
  });
});
