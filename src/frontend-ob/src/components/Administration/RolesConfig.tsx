'use client';

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObcCheckbox } from '@oicl/openbridge-webcomponents-react/components/checkbox/checkbox';
import { CheckboxStatus } from '@oicl/openbridge-webcomponents/dist/components/checkbox/checkbox.js';
import { ObcTextInputField } from '@oicl/openbridge-webcomponents-react/components/text-input-field/text-input-field';
import {
  getRoles, getPermissionCatalog, getRolePermissions, setRolePermissions,
  resetRolePermissions, createRole, deleteRole, updateRole,
  extractRoleApiError, type Role, type PermissionDef,
} from '../../api/rolesApi';

/* Layout tokens — shared idiom with the other Administration tabs. */
const T = {
  blue: '#31598F', blueLight: '#EAF2FF', blueMuted: '#C4D8F0',
  card: '#FFFFFF', border: '#DDE3EA',
  textPrimary: '#1F2937', textSecondary: '#6B7280', textMuted: '#9CA3AF',
  danger: '#B42318', dangerBg: '#FEF3F2',
  radius: '10px', radiusSm: '8px',
} as const;

const sortRoles = (rs: Role[]) =>
  [...rs].sort((a, b) =>
    a.is_system_role === b.is_system_role
      ? a.role_name.localeCompare(b.role_name)
      : a.is_system_role ? -1 : 1);

export const RolesConfig: React.FC = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [catalog, setCatalog] = useState<PermissionDef[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set());
  const [baseline, setBaseline] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Create-role form
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const selectedRole = roles.find((r) => r.role_name === selected) ?? null;
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

  // H: clicking role A then role B could leave A selected if A's response landed
  // last — a sequence guard makes the latest click win regardless of order.
  const loadSeq = useRef(0);
  const loadRole = useCallback(async (role: string) => {
    const seq = ++loadSeq.current;
    setError(null); setNotice(null);
    setSelected(role); // optimistic — the row highlights immediately
    try {
      const perms = await getRolePermissions(role);
      if (seq !== loadSeq.current) return; // a newer click superseded this one
      setSelectedPerms(new Set(perms));
      setBaseline(new Set(perms));
    } catch (e) {
      if (seq === loadSeq.current) setError(extractRoleApiError(e));
    }
  }, []);

  const refresh = useCallback(async (keep?: string) => {
    setLoading(true); setError(null);
    try {
      const [rs, cat] = await Promise.all([getRoles(), getPermissionCatalog()]);
      const sorted = sortRoles(rs);
      setRoles(sorted); setCatalog(cat);
      const target = keep && sorted.some((r) => r.role_name === keep) ? keep : sorted[0]?.role_name;
      if (target) await loadRole(target);
    } catch (e) { setError(extractRoleApiError(e)); }
    finally { setLoading(false); }
  }, [loadRole]);

  useEffect(() => { void refresh(); }, [refresh]);

  const togglePerm = (key: string) =>
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const toggleCategory = (keys: string[], all: boolean) =>
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (all ? next.delete(k) : next.add(k)));
      return next;
    });

  const onSave = async () => {
    if (!selected) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const saved = await setRolePermissions(selected, [...selectedPerms]);
      setBaseline(new Set(saved)); setSelectedPerms(new Set(saved));
      setNotice(`Saved ${saved.length} permissions for ${selected}. Users with this role re-authorize on their next request.`);
    } catch (e) { setError(extractRoleApiError(e)); }
    finally { setBusy(false); }
  };

  const onReset = async () => {
    if (!selected) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const perms = await resetRolePermissions(selected);
      setBaseline(new Set(perms)); setSelectedPerms(new Set(perms));
      setNotice(`${selected} reset to its default permission set.`);
    } catch (e) { setError(extractRoleApiError(e)); }
    finally { setBusy(false); }
  };

  const onCreate = async () => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const role = await createRole({ roleName: newName.trim(), description: newDesc.trim() || undefined });
      setCreating(false); setNewName(''); setNewDesc('');
      await refresh(role.role_name);
      setNotice(`Custom role "${role.role_name}" created. Select permissions and Save.`);
    } catch (e) { setError(extractRoleApiError(e)); }
    finally { setBusy(false); }
  };

  const onDelete = async () => {
    if (!selectedRole || selectedRole.is_system_role) return;
    const reassignTo = window.prompt(
      `Delete custom role "${selectedRole.role_name}".\n\nIf any users hold it, enter a role to reassign them to (leave blank to cancel if there are users):`,
      'Viewer'
    );
    if (reassignTo === null) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await deleteRole(selectedRole.role_name, reassignTo.trim() || undefined);
      const name = selectedRole.role_name;
      setSelected(null);
      await refresh();
      setNotice(`Role "${name}" deleted.`);
    } catch (e) { setError(extractRoleApiError(e)); }
    finally { setBusy(false); }
  };

  const onSaveDescription = async (description: string) => {
    if (!selectedRole) return;
    try {
      await updateRole(selectedRole.role_name, { description });
      setRoles((rs) => rs.map((r) => r.role_name === selectedRole.role_name ? { ...r, description } : r));
    } catch (e) { setError(extractRoleApiError(e)); }
  };

  if (loading) return <div style={{ color: T.textSecondary, padding: 24 }}>Loading roles…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: T.textPrimary }}>Roles &amp; Permissions</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: T.textSecondary }}>
            Assign permissions to roles. Editing a role takes effect for its users on their next request.
          </p>
        </div>
        <ObcButton variant="raised" onClick={() => { setCreating((c) => !c); setError(null); setNotice(null); }}>
          {creating ? 'Cancel' : '+ New custom role'}
        </ObcButton>
      </div>

      {error &&  <div role="alert" style={{ background: T.dangerBg, color: T.danger, border: `1px solid ${T.danger}22`, borderRadius: T.radiusSm, padding: '8px 12px', fontSize: 13 }}>{error}</div>}
      {notice && <div style={{ background: T.blueLight, color: T.blue, border: `1px solid ${T.blueMuted}`, borderRadius: T.radiusSm, padding: '8px 12px', fontSize: 13 }}>{notice}</div>}

      {creating && (
        <div style={{ border: `1px solid ${T.border}`, borderRadius: T.radius, padding: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: T.textSecondary, display: 'flex', flexDirection: 'column', gap: 4 }}>
            Role name
            <ObcTextInputField value={newName} placeholder="e.g. ShiftSupervisor" onInput={(e: any) => setNewName(e.target.value)} />
          </label>
          <label style={{ fontSize: 12, color: T.textSecondary, display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 240 }}>
            Description
            <ObcTextInputField value={newDesc} placeholder="What this role is for" onInput={(e: any) => setNewDesc(e.target.value)} />
          </label>
          <ObcButton variant="raised" disabled={busy || !newName.trim()} onClick={onCreate}>Create</ObcButton>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16, alignItems: 'start' }}>
        {/* ── Role list ── */}
        <div style={{ border: `1px solid ${T.border}`, borderRadius: T.radius, overflow: 'hidden' }}>
          {roles.map((r) => {
            const active = r.role_name === selected;
            return (
              <button
                key={r.role_name}
                onClick={() => loadRole(r.role_name)}
                style={{
                  width: '100%', textAlign: 'left', cursor: 'pointer',
                  padding: '10px 12px', border: 'none', borderBottom: `1px solid ${T.border}`,
                  background: active ? T.blueLight : T.card,
                  color: active ? T.blue : T.textPrimary,
                  fontWeight: active ? 700 : 500, fontSize: 13,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}
              >
                {r.role_name}
                <span style={{ fontSize: 10, color: r.is_system_role ? T.textMuted : T.blue, fontWeight: 600 }}>
                  {r.is_system_role ? 'SYSTEM' : 'CUSTOM'}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Permission matrix ── */}
        <div style={{ border: `1px solid ${T.border}`, borderRadius: T.radius, padding: 16 }}>
          {!selectedRole ? (
            <div style={{ color: T.textSecondary, fontSize: 13 }}>Select a role.</div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T.textPrimary }}>
                    {selectedRole.role_name}
                    <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 500, marginLeft: 8 }}>
                      {selectedRole.is_system_role ? 'system role — protected, permissions editable' : 'custom role'}
                    </span>
                  </div>
                  <div style={{ marginTop: 6, maxWidth: 420 }}>
                    <ObcTextInputField
                      value={selectedRole.description ?? ''}
                      placeholder="Role description"
                      onChange={(e: any) => onSaveDescription(e.target.value)}
                    />
                  </div>
                </div>
                <div style={{ fontSize: 12, color: dirty ? T.blue : T.textMuted, fontWeight: 600 }}>
                  {selectedPerms.size} selected{dirty ? ' • unsaved' : ''}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                {byCategory.map(([category, perms]) => {
                  const keys = perms.map((p) => p.permission_key);
                  const allOn = keys.every((k) => selectedPerms.has(k));
                  return (
                    <div key={category} style={{ border: `1px solid ${T.border}`, borderRadius: T.radiusSm, padding: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: T.textSecondary, letterSpacing: '0.03em' }}>{category}</span>
                        <button onClick={() => toggleCategory(keys, allOn)}
                          style={{ fontSize: 11, color: T.blue, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                          {allOn ? 'Clear' : 'All'}
                        </button>
                      </div>
                      {perms.map((p) => (
                        <label key={p.permission_key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer' }}>
                          <ObcCheckbox
                            status={selectedPerms.has(p.permission_key) ? CheckboxStatus.checked : CheckboxStatus.unchecked}
                            onChange={() => togglePerm(p.permission_key)}
                          />
                          <span style={{ fontSize: 12.5, color: T.textPrimary }} title={p.description ?? ''}>
                            {p.permission_key}
                          </span>
                        </label>
                      ))}
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 16, borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
                <ObcButton variant="raised" disabled={busy || !dirty} onClick={onSave}>Save permissions</ObcButton>
                {selectedRole.is_system_role
                  ? <ObcButton variant="normal" disabled={busy} onClick={onReset}>Reset to default</ObcButton>
                  : <ObcButton variant="flat" disabled={busy} onClick={onDelete}>Delete role</ObcButton>}
                {dirty && (
                  <ObcButton variant="flat" disabled={busy} onClick={() => setSelectedPerms(new Set(baseline))}>Discard changes</ObcButton>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default RolesConfig;
