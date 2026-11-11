'use client';

/**
 * Users (CHG-172, owner review: the approved sample docs/theme/redesign/samples/administration-proposal.html, badges 3-7, and the
 * owner's answers of 11 Nov 2026). One list: a 32 px filter row (search first; the role and status dropdowns carry the counts the
 * line above the filters used to show), User / Role / Status (the role as a word, the status as tone, glyph and word) and the
 * shared pager. The selected user is in a panel beside the list (a drawer below 1280 px). Bulk import and Add user sit in the
 * page header. Server search (it finds user names too since CHG-172), 50 per page, back to page 1 on a new filter; `?role=`
 * opens on a role (Users with this role ↗ on Roles & permissions).
 *
 * The dropdown counts come from the users the search finds, before the role and status choices, so choosing a role does not
 * turn every other role to 0. With no role or status chosen that read is the list's own read (one request).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { toast } from 'react-toastify';
import { useAuthStore } from '../../store/authStore';
import { deleteUser, extractApiError, getUsersPage, type AdminUser, type UsersFilters } from '../../api/usersApi';
import { getRoles } from '../../api/rolesApi';
import { EmptyState } from '../Cpm/shared';
import { Pagination } from '../../ui/forms/Pagination';
import { BulkImportModal } from './BulkImportModal';
import { AdminActions } from './AdminActions';
import { AdminConfirmDialog } from './AdminConfirmDialog';
import { UserPanel, UserStatus } from './users/UserPanel';
import { UserEditorDialog } from './users/UserEditorDialog';

// Built-in roles are the fallback if the roles API is unavailable (it needs rbac.manage); the live list (system + custom) is
// fetched so custom roles can be assigned to users. CHG-081: SuperAdmin above Admin.
const ROLES = ['SuperAdmin', 'Admin', 'Engineer', 'Operator', 'Viewer'] as const;
const PAGE_SIZE = 50;

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const h = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(h);
  }, [value, delay]);
  return debounced;
}

const withCount = (label: string, n: number | undefined) => (n == null ? label : `${label} ${n}`);

export const UserManagementConfig: React.FC = () => {
  const qc = useQueryClient();
  const currentUser = useAuthStore(s => s.user);
  const canRoles = useAuthStore(s => s.hasPermission('rbac.manage'));
  const [params, setParams] = useSearchParams();
  const roleFilter = params.get('role') ?? 'all';
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const debouncedSearch = useDebounce(searchInput, 400);
  const [page, setPage] = useState(1);

  const filters: UsersFilters = useMemo(() => {
    const f: UsersFilters = { page, pageSize: PAGE_SIZE };
    if (debouncedSearch) f.search = debouncedSearch;
    if (roleFilter !== 'all') f.role = roleFilter;
    if (statusFilter !== 'all') f.status = statusFilter;
    return f;
  }, [page, debouncedSearch, roleFilter, statusFilter]);
  const facetFilters: UsersFilters = useMemo(
    () => (debouncedSearch ? { page: 1, pageSize: PAGE_SIZE, search: debouncedSearch } : { page: 1, pageSize: PAGE_SIZE }),
    [debouncedSearch]);

  // Back to page 1 whenever a filter narrows the set (else page N of the old result shows a false "no users").
  useEffect(() => { setPage(1); }, [debouncedSearch, roleFilter, statusFilter]);

  // The previous page stays on screen while the next one is read, so the pager does not vanish under the cursor.
  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['admin-users', filters], queryFn: () => getUsersPage(filters), retry: false, staleTime: 30_000, placeholderData: prev => prev,
  });
  const facets = useQuery({
    queryKey: ['admin-users', facetFilters], queryFn: () => getUsersPage(facetFilters), retry: false, staleTime: 30_000,
  });
  const { data: roleList } = useQuery({ queryKey: ['admin-roles'], queryFn: getRoles, retry: false, staleTime: 60_000 });
  const assignableRoles: string[] = roleList?.map(r => r.role_name) ?? [...ROLES];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [editor, setEditor] = useState<{ user: AdminUser | null } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-users'] });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => { setDeleting(null); setSelectedId(null); void invalidate(); toast.success('User deleted'); },
    onError: e => setDeleteError(extractApiError(e)),
  });

  const users = data?.users ?? [];
  const selected = users.find(u => u.user_id === selectedId) ?? users[0];
  const isSelf = (u: AdminUser | null | undefined) => !!u && u.user_id === currentUser?.user_id;
  const stats = facets.data?.stats;
  const onRole = (v: string) => setParams(p => { if (v === 'all') p.delete('role'); else p.set('role', v); return p; }, { replace: true });
  const pick = (u: AdminUser) => { setSelectedId(u.user_id); setDrawer(true); };
  const askDelete = (u: AdminUser) => { if (isSelf(u)) return; setDeleteError(null); setDeleting(u); };

  return (
    <>
      <AdminActions>
        <ObcButton variant="normal" onClick={() => setBulkOpen(true)}>Bulk import</ObcButton>
        <ObcButton variant="raised" onClick={() => setEditor({ user: null })}>Add user</ObcButton>
      </AdminActions>
      <div className="cpm-master-detail">
        <section className="cpm-surface cpm-admin-list" aria-label="Users">
          <div className="cpm-compact cpm-admin-filters" role="group" aria-label="User filters">
            <input className="cpm-input" type="search" autoComplete="off" aria-label="Find user" placeholder="User name, name or email"
              value={searchInput} onChange={e => setSearchInput(e.target.value)} />
            <select className="cpm-select" aria-label="Role" value={roleFilter} onChange={e => onRole(e.target.value)}>
              <option value="all">{withCount('All roles', stats?.total)}</option>
              {assignableRoles.map(r => <option key={r} value={r}>{withCount(r, stats ? stats.byRole?.[r] ?? 0 : undefined)}</option>)}
            </select>
            <select className="cpm-select" aria-label="Status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">{withCount('All statuses', stats?.total)}</option>
              <option value="active">{withCount('Active', stats?.active)}</option>
              <option value="inactive">{withCount('Inactive', stats?.inactive)}</option>
            </select>
          </div>
          {isLoading && <EmptyState title="Loading users…" />}
          {isError && (
            <EmptyState title="Failed to load users" copy={extractApiError(error)} action={{ label: 'Retry', onClick: () => void refetch() }} />
          )}
          {!isLoading && !isError && users.length === 0 && <EmptyState title="No users found" />}
          {users.length > 0 && (
            <table className="cpm-table cpm-reg-table cpm-admin-table cpm-admin-table--users">
              <thead><tr><th>User</th><th>Role</th><th>Status</th></tr></thead>
              <tbody>
                {users.map(u => {
                  const on = u.user_id === selected?.user_id;
                  return (
                    <tr key={u.user_id} className={`cpm-reg-row${on ? ' cpm-reg-row--selected' : ''}`} aria-current={on ? 'true' : undefined}
                      onClick={() => pick(u)}>
                      <td>
                        <button type="button" className="cpm-admin-rowlink" onClick={e => { e.stopPropagation(); pick(u); }}>
                          <strong>{u.username}</strong>
                          {u.full_name && <span className="cpm-event-row__sub">{u.full_name}</span>}
                        </button>
                      </td>
                      <td>{u.role}</td>
                      <td><UserStatus active={u.is_active} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {data?.pagination && data.pagination.totalPages > 1 && (
            <div className="cpm-events-pager">
              <Pagination page={page} pageCount={data.pagination.totalPages} onChange={setPage} label="User pages" />
            </div>
          )}
          {isFetching && !isLoading && <p className="cpm-copy">Refreshing…</p>}
        </section>
        {selected && (
          <UserPanel user={selected} isSelf={isSelf(selected)} canRoles={canRoles} open={drawer} onClose={() => setDrawer(false)}
            onEdit={() => setEditor({ user: selected })} onDelete={() => askDelete(selected)} />
        )}
      </div>

      {editor && (
        <UserEditorDialog user={editor.user} isSelf={isSelf(editor.user)} roles={assignableRoles} onClose={() => setEditor(null)} />
      )}
      <AdminConfirmDialog open={!!deleting} title="Delete user" confirmLabel="Delete" busy={deleteMutation.isPending} error={deleteError}
        onCancel={() => setDeleting(null)} onConfirm={() => deleting && deleteMutation.mutate(deleting.user_id)}>
        <p className="cpm-copy">{`Delete user "${deleting?.username ?? ''}"? This cannot be undone.`}</p>
      </AdminConfirmDialog>
      <BulkImportModal isOpen={bulkOpen} onClose={() => setBulkOpen(false)} onImported={() => void invalidate()} />
    </>
  );
};

export default UserManagementConfig;
