'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Modal, FormField } from '../shared/Modal';
import { BulkImportModal } from './BulkImportModal';
import { useAuthStore } from '../../store/authStore';
import {
  getUsersPage,
  createUser,
  updateUser,
  deleteUser,
  extractApiError,
  type AdminUser,
  type UsersFilters,
} from '../../api/usersApi';
import { getRoles } from '../../api/rolesApi';
import { toast } from 'react-toastify';
import { useConfirm } from '../shared/dialogService';
import { StatusBadge } from '../../ui/StatusBadge';
import { UserRowDialog } from './UserRowDialog';
import { T } from '../../styles/theme';


// Built-in roles are the fallback if the roles API is unavailable; the live list
// (system + custom) is fetched so custom roles can be assigned to users.
// CHG-081: SuperAdmin above Admin (platform administration, gate configuration, pipeline, governance)
const ROLES = ['SuperAdmin', 'Admin', 'Engineer', 'Operator', 'Viewer'] as const;
type Role = (typeof ROLES)[number];

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const h = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(h);
  }, [value, delay]);
  return debounced;
}

interface UserForm {
  username: string;
  email: string;
  full_name: string;
  password: string;
  role: Role;
  is_active: boolean;
}

const EMPTY_FORM: UserForm = { username: '', email: '', full_name: '', password: '', role: 'Viewer', is_active: true };

export const UserManagementConfig: React.FC = () => {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const confirm = useConfirm();

  const [searchInput, setSearchInput] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const debouncedSearch = useDebounce(searchInput, 400);
  const [page, setPage] = useState(1); // H: real pagination — 100+ accounts were invisible

  const filters: UsersFilters = useMemo(() => {
    const f: UsersFilters = { page, pageSize: 50 };
    if (debouncedSearch) f.search = debouncedSearch;
    if (roleFilter !== 'all') f.role = roleFilter;
    if (statusFilter !== 'all') f.status = statusFilter;
    return f;
  }, [page, debouncedSearch, roleFilter, statusFilter]);

  // H: reset to page 1 whenever a filter narrows the set (else page N of the old
  // result shows a false "no users").
  useEffect(() => { setPage(1); }, [debouncedSearch, roleFilter, statusFilter]);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['admin-users', filters],
    queryFn: () => getUsersPage(filters),
    retry: false,
    staleTime: 30_000,
  });

  // Live role list (system + custom) for the assignment dropdown, so custom roles
  // are assignable. Falls back to the built-in ROLES if the roles API is denied.
  const { data: roleList } = useQuery({
    queryKey: ['admin-roles'],
    queryFn: getRoles,
    retry: false,
    staleTime: 60_000,
  });
  const assignableRoles: string[] = roleList?.map((r) => r.role_name) ?? [...ROLES];

  // ── Create / edit modal ─────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [detail, setDetail] = useState<AdminUser | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  };
  const openEdit = (u: AdminUser) => {
    setEditing(u);
    setForm({ username: u.username, email: u.email, full_name: u.full_name ?? '', password: '', role: (u.role as Role) ?? 'Viewer', is_active: u.is_active });
    setFormError(null);
    setDetail(null);
    setModalOpen(true);
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-users'] });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) {
        return updateUser(editing.user_id, {
          email: form.email,
          full_name: form.full_name,
          role: form.role,
          is_active: form.is_active,
        });
      }
      return createUser({
        username: form.username,
        email: form.email,
        password: form.password,
        full_name: form.full_name || undefined,
        role: form.role,
      });
    },
    onSuccess: () => {
      invalidate();
      setModalOpen(false);
      toast.success(editing ? 'User updated' : 'User created');
    },
    onError: (e) => setFormError(extractApiError(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      invalidate();
      toast.success('User deleted');
    },
    onError: (e) => toast.error(extractApiError(e)),
  });

  const validateForm = (): string | null => {
    if (!editing) {
      if (!/^[a-zA-Z0-9_]+$/.test(form.username) || form.username.length < 3) {
        return 'Username must be 3+ chars (letters, numbers, underscores).';
      }
      if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}/.test(form.password)) {
        return 'Password must be 8+ chars with upper, lower, and a number.';
      }
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      return 'Enter a valid email address.';
    }
    return null;
  };

  const handleSave = () => {
    const err = validateForm();
    if (err) {
      setFormError(err);
      return;
    }
    saveMutation.mutate();
  };

  const handleDelete = async (u: AdminUser) => {
    if (u.user_id === currentUser?.user_id) {
      toast.warn('You cannot delete your own account.');
      return;
    }
    if (await confirm({ title: 'Delete user', message: `Delete user "${u.username}"? This cannot be undone.`, confirmLabel: 'Delete', danger: true })) {
      setDetail(null);
      deleteMutation.mutate(u.user_id);
    }
  };

  const users = data?.users ?? [];
  const stats = data?.stats;

  return (
    <>
      <div className="cpm-admin-bar">
        <span>{stats ? `${stats.total} users · ${stats.active} active · ${stats.inactive} inactive` : ''}</span>
        <div className="cpm-admin-bar__actions">
          <ObcButton variant="flat" onClick={() => setBulkOpen(true)}>Bulk import</ObcButton>
          <ObcButton variant="raised" onClick={openCreate}>Add user</ObcButton>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
        <input className="ob-input" type="text" autoComplete="off" placeholder="Search name or email…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        <select className="ob-input" aria-label="Filter by role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="all">All roles</option>
          {assignableRoles.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className="ob-input" aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div className="cpm-table-wrap">
        <table className="cpm-table">
          <thead>
            <tr><th>User</th><th>Role</th><th>Status</th></tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={3}>Loading users…</td></tr>
            ) : isError ? (
              <tr><td colSpan={3}>
                <div style={{ color: T.critical, fontWeight: 600 }}>Failed to load users</div>
                <div style={{ color: T.textSub, fontSize: 12, margin: '4px 0 10px' }}>{extractApiError(error)}</div>
                <ObcButton variant="flat" onClick={() => void refetch()}>Retry</ObcButton>
              </td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={3}>No users found</td></tr>
            ) : (
              users.map((u) => (
                <tr key={u.user_id}>
                  <td>
                    <button type="button" className="cpm-admin-user" onClick={() => setDetail(u)}>
                      <span className="cpm-admin-user__name">{u.username}</span>
                      {u.full_name && <span className="cpm-admin-user__full">{u.full_name}</span>}
                    </button>
                  </td>
                  <td><span data-testid="role-badge"><StatusBadge tone="neutral">{u.role}</StatusBadge></span></td>
                  <td><StatusBadge tone={u.is_active ? 'success' : 'neutral'}>{u.is_active ? 'Active' : 'Inactive'}</StatusBadge></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {data?.pagination && data.pagination.totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, padding: '4px 2px' }}>
          <span style={{ fontSize: 12, color: T.textSub }}>
            Page {data.pagination.page} of {data.pagination.totalPages} · {data.pagination.total} users
          </span>
          <ObcButton variant="flat" disabled={page <= 1 || isFetching} onClick={() => setPage(p => Math.max(1, p - 1))}>
            ‹ Prev
          </ObcButton>
          <ObcButton variant="flat" disabled={page >= data.pagination.totalPages || isFetching} onClick={() => setPage(p => p + 1)}>
            Next ›
          </ObcButton>
        </div>
      )}
      {isFetching && !isLoading && <div style={{ fontSize: 12, color: T.blue }}>Refreshing…</div>}

      {/* Create / edit modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${editing.username}` : 'Add user'}
        subtitle={editing ? 'Update role, status, or profile' : 'Create a new account'}
        width="480px"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, width: '100%' }}>
            <ObcButton variant="flat" onClick={() => setModalOpen(false)} disabled={saveMutation.isPending}>Cancel</ObcButton>
            <ObcButton variant="raised" onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving…' : editing ? 'Save changes' : 'Create user'}
            </ObcButton>
          </div>
        }
      >
        {formError && (
          <div role="alert" style={{ marginBottom: 12, padding: '8px 12px', borderRadius: T.radiusSm, background: T.criticalBg, color: T.critical, border: `1px solid ${T.criticalBorder}`, fontSize: 13 }}>
            {formError}
          </div>
        )}
        {/*
          A real <form> boundary is required here: without one, the browser's
          password-manager autofill isn't scoped to this dialog. As soon as the
          `type="password"` field below mounts, Chrome/Edge search the WHOLE page
          for the nearest preceding text input to autofill as "username" — which
          was the user-search box above the table, silently overwriting it with
          a saved credential and filtering the list. autoComplete="off"/"new-password"
          plus this <form> boundary stops that.
        */}
        <form autoComplete="off" onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
          {!editing && (
            <FormField label="Username" required>
              <input className="ob-input" autoComplete="off" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="john_doe" />
            </FormField>
          )}
          <FormField label="Email" required>
            <input className="ob-input" type="email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john.doe@example.com" />
          </FormField>
          <FormField label="Full name">
            <input className="ob-input" autoComplete="off" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="John Doe" />
          </FormField>
          {!editing && (
            <FormField label="Password" required hint="8+ chars with upper, lower, and a number">
              <input className="ob-input" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </FormField>
          )}
          <FormField label="Role" required>
            <select className="ob-input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {assignableRoles.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </FormField>
          <FormField label="Status">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.text, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              Active account
            </label>
          </FormField>
          {/* Submit via Enter; the visible Save/Cancel buttons live in the Modal's footer, outside this form. */}
          <button type="submit" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} />
        </form>
      </Modal>

      <BulkImportModal isOpen={bulkOpen} onClose={() => setBulkOpen(false)} onImported={invalidate} />
      <UserRowDialog user={detail} deleting={deleteMutation.isPending} onEdit={openEdit} onDelete={(u) => void handleDelete(u)} onClose={() => setDetail(null)} />
    </>
  );
};

export default UserManagementConfig;
