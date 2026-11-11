'use client';

/**
 * Roles & permissions. CHG-172 (owner review, the approved sample docs/theme/redesign/samples/administration-proposal.html,
 * badges 8-11, and the answers of 11 Nov 2026): a role list (the name, its description under it, System / Custom as a word) with
 * the selected role in a panel beside it (RolePanel; a drawer below 1280 px); Add custom role in the page header opens a small
 * dialog; Reset to default asks first (it signs everyone with the role out); Delete role picks the reassignment target from a
 * list. `?role=` opens a role (Permissions ↗ on a user). System roles first, then by name; the latest click wins; Save only when
 * changed; every request, notice and refusal as before.
 */
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import {
  getRoles, getPermissionCatalog, getRolePermissions, setRolePermissions,
  resetRolePermissions, createRole, deleteRole, updateRole,
  extractRoleApiError, type Role, type PermissionDef,
} from '../../api/rolesApi';
import { useAuthStore } from '../../store/authStore';
import { EmptyState } from '../Cpm/shared';
import { AdminActions } from './AdminActions';
import { AdminConfirmDialog } from './AdminConfirmDialog';
import { RolePanel, SIGN_OUT } from './roles/RolePanel';
import { AddRoleDialog, DeleteRoleDialog } from './roles/RoleDialogs';

const sortRoles = (rs: Role[]) =>
  [...rs].sort((a, b) =>
    a.is_system_role === b.is_system_role
      ? a.role_name.localeCompare(b.role_name)
      : a.is_system_role ? -1 : 1);

type Asking = 'add' | 'reset' | 'delete' | null;

export const RolesConfig: React.FC = () => {
  const canUsers = useAuthStore(s => s.hasPermission('admin.users.edit'));
  const [params, setParams] = useSearchParams();
  const [roles, setRoles] = useState<Role[]>([]);
  const [catalog, setCatalog] = useState<PermissionDef[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set());
  const [baseline, setBaseline] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [asking, setAsking] = useState<Asking>(null);
  const [drawer, setDrawer] = useState(false);

  const selectedRole = roles.find(r => r.role_name === selected) ?? null;
  // The description saves on commit (blur or Enter), so the field edits a draft of the stored text.
  const [descDraft, setDescDraft] = useState('');
  useEffect(() => { setDescDraft(selectedRole?.description ?? ''); }, [selectedRole?.role_name, selectedRole?.description]);
  const dirty = useMemo(() => {
    if (selectedPerms.size !== baseline.size) return true;
    for (const k of selectedPerms) if (!baseline.has(k)) return true;
    return false;
  }, [selectedPerms, baseline]);

  const byCategory = useMemo(() => {
    const groups: Record<string, PermissionDef[]> = {};
    for (const p of catalog) (groups[p.category ?? 'other'] ??= []).push(p);
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [catalog]);

  // Clicking role A then role B could leave A selected if A's response landed last: a sequence guard makes the latest click win.
  const loadSeq = useRef(0);
  const loadRole = useCallback(async (role: string) => {
    const seq = ++loadSeq.current;
    setError(null); setNotice(null);
    setSelected(role); // optimistic: the row highlights immediately
    try {
      const perms = await getRolePermissions(role);
      if (seq !== loadSeq.current) return; // a newer click superseded this one
      setSelectedPerms(new Set(perms));
      setBaseline(new Set(perms));
    } catch (e) {
      if (seq === loadSeq.current) setError(extractRoleApiError(e));
    }
  }, []);

  const wanted = useRef(params.get('role'));
  const refresh = useCallback(async (keep?: string) => {
    setLoading(true); setError(null);
    try {
      const [rs, cat] = await Promise.all([getRoles(), getPermissionCatalog()]);
      const sorted = sortRoles(rs);
      setRoles(sorted); setCatalog(cat);
      const ask = keep ?? wanted.current ?? undefined;
      const target = ask && sorted.some(r => r.role_name === ask) ? ask : sorted[0]?.role_name;
      if (target) await loadRole(target);
    } catch (e) { setError(extractRoleApiError(e)); }
    finally { setLoading(false); }
  }, [loadRole]);

  useEffect(() => { void refresh(); }, [refresh]);

  const pick = (role: string) => {
    setDrawer(true);
    setParams(p => { p.set('role', role); return p; }, { replace: true });
    void loadRole(role);
  };

  const togglePerm = (key: string) =>
    setSelectedPerms(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const toggleCategory = (keys: string[], all: boolean) =>
    setSelectedPerms(prev => {
      const next = new Set(prev);
      keys.forEach(k => (all ? next.delete(k) : next.add(k)));
      return next;
    });

  /** One write: busy while it runs, the refusal in the panel (or the open dialog) as the server words it. */
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError(null); setNotice(null);
    try { await work(); } catch (e) { setError(extractRoleApiError(e)); }
    finally { setBusy(false); }
  };

  const onSave = () => selected && run(async () => {
    const saved = await setRolePermissions(selected, [...selectedPerms]);
    setBaseline(new Set(saved)); setSelectedPerms(new Set(saved));
    setNotice(`Saved ${saved.length} permissions for ${selected}.`);
  });

  const onReset = () => selected && run(async () => {
    const perms = await resetRolePermissions(selected);
    setBaseline(new Set(perms)); setSelectedPerms(new Set(perms));
    setAsking(null);
    setNotice(`${selected} reset to its default permission set.`);
  });

  const onCreate = (name: string, description: string) => run(async () => {
    const role = await createRole({ roleName: name, description: description || undefined });
    setAsking(null);
    await refresh(role.role_name);
    setNotice(`Custom role "${role.role_name}" created. Select permissions and Save.`);
  });

  const onDelete = (reassignTo: string) => selectedRole && !selectedRole.is_system_role && run(async () => {
    const name = selectedRole.role_name;
    await deleteRole(name, reassignTo || undefined);
    setAsking(null);
    setSelected(null);
    wanted.current = null;
    setParams(p => { p.delete('role'); return p; }, { replace: true });
    await refresh();
    setNotice(`Role "${name}" deleted.`);
  });

  const onSaveDescription = async (description: string) => {
    if (!selectedRole) return;
    try {
      await updateRole(selectedRole.role_name, { description });
      setRoles(rs => rs.map(r => (r.role_name === selectedRole.role_name ? { ...r, description } : r)));
    } catch (e) { setError(extractRoleApiError(e)); }
  };

  const ask = (what: Asking) => { setError(null); setAsking(what); };
  const dialogError = asking ? error : null;

  return (
    <>
      <AdminActions>
        <ObcButton variant="raised" onClick={() => ask('add')}>Add custom role</ObcButton>
      </AdminActions>
      {loading && roles.length === 0 ? <EmptyState title="Loading roles…" /> : (
        <div className="cpm-master-detail cpm-admin-roles">
          <section className="cpm-surface cpm-admin-list" aria-label="Roles">
            {roles.length === 0 && error && <p className="cpm-field__error" role="alert">{error}</p>}
            <table className="cpm-table cpm-reg-table cpm-admin-table cpm-admin-table--roles">
              <thead><tr><th>Role</th><th>Type</th></tr></thead>
              <tbody>
                {roles.map(r => {
                  const on = r.role_name === selected;
                  return (
                    <tr key={r.role_name} className={`cpm-reg-row${on ? ' cpm-reg-row--selected' : ''}`} aria-current={on ? 'true' : undefined}
                      onClick={() => pick(r.role_name)}>
                      <td>
                        <button type="button" className="cpm-admin-rowlink" onClick={e => { e.stopPropagation(); pick(r.role_name); }}>
                          <strong>{r.role_name}</strong>
                          {r.description && <span className="cpm-event-row__sub">{r.description}</span>}
                        </button>
                      </td>
                      <td className="cpm-copy">{r.is_system_role ? 'System' : 'Custom'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
          {selectedRole && (
            <RolePanel role={selectedRole} groups={byCategory} total={catalog.length} selected={selectedPerms} dirty={dirty} busy={busy}
              notice={notice} error={asking ? null : error} canUsers={canUsers}
              description={descDraft} onDescription={setDescDraft} onCommitDescription={v => void onSaveDescription(v)}
              onToggle={togglePerm} onToggleGroup={toggleCategory} onSave={() => void onSave()}
              onDiscard={() => setSelectedPerms(new Set(baseline))} onReset={() => ask('reset')} onDelete={() => ask('delete')}
              open={drawer} onClose={() => setDrawer(false)} />
          )}
        </div>
      )}

      {asking === 'add' && <AddRoleDialog busy={busy} error={dialogError} onCancel={() => setAsking(null)} onCreate={(n, d) => void onCreate(n, d)} />}
      <AdminConfirmDialog open={asking === 'reset'} title="Reset to default" confirmLabel="Reset to default" busy={busy} error={dialogError}
        onCancel={() => setAsking(null)} onConfirm={() => void onReset()}>
        <p className="cpm-copy">The role gets its default permission set back; changes made on this page are lost.</p>
        <p className="cpm-copy">{SIGN_OUT}</p>
      </AdminConfirmDialog>
      {asking === 'delete' && selectedRole && (
        <DeleteRoleDialog role={selectedRole.role_name} roles={roles} busy={busy} error={dialogError}
          onCancel={() => setAsking(null)} onDelete={t => void onDelete(t)} />
      )}
    </>
  );
};

export default RolesConfig;
