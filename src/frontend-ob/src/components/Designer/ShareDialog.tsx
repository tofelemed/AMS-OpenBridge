'use client';

// Phase 4 — Sharing / ACL editor. Endpoints existed (GET/POST/DELETE /displays/{id}/permissions,
// POST /folders/{id}/permissions) with no UI, so ownership was recorded but never manageable. This
// surfaces the grant list (direct + inherited-from-folder), and lets the OWNER or an ADMIN add/remove
// grants. The server independently enforces owner-or-Admin (403), so a non-owner sees a read-only view.
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { Modal } from '../shared/Modal';
import { apiJson, apiFetch } from '../../api/apiFetch';
import { useAuthStore } from '../../store/authStore';

const API_BASE = import.meta.env.VITE_DISPLAY_SERVICE_URL || '/api/displays';

interface Grant {
  id: string; principalType: 'user' | 'role'; principal: string; access: 'read' | 'edit';
  displayId?: string | null; folderId?: string | null; inherited: boolean;
}
interface PermissionsResponse { owner: string; grants: Grant[] }

export const ShareDialog: React.FC<{
  displayId: string; displayName?: string; open: boolean; onClose: () => void;
}> = ({ displayId, displayName, open, onClose }) => {
  const qc = useQueryClient();
  const user = useAuthStore(s => s.user);
  const [principalType, setPrincipalType] = useState<'user' | 'role'>('user');
  const [principal, setPrincipal] = useState('');
  const [access, setAccess] = useState<'read' | 'edit'>('read');

  const { data, isLoading } = useQuery({
    queryKey: ['permissions', displayId],
    queryFn: () => apiJson<PermissionsResponse>(`${API_BASE}/${displayId}/permissions`),
    enabled: open,
  });

  const owner = data?.owner;
  // Owner-or-Admin may manage; matches the server's own check (which would otherwise 403).
  const canManage = !!user && (user.role === 'Admin' || (owner != null && user.username === owner));

  const addGrant = useMutation({
    mutationFn: () => apiJson(`${API_BASE}/${displayId}/permissions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ principalType, principal: principal.trim(), access }),
    }),
    onSuccess: () => { setPrincipal(''); qc.invalidateQueries({ queryKey: ['permissions', displayId] }); toast.success('Access granted'); },
    onError: (e: Error) => toast.error(`Share failed: ${e.message}`),
  });

  const removeGrant = useMutation({
    mutationFn: (aclId: string) => apiFetch(`${API_BASE}/${displayId}/permissions/${aclId}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['permissions', displayId] }); },
    onError: (e: Error) => toast.error(`Remove failed: ${e.message}`),
  });

  const grants = data?.grants ?? [];
  const direct = grants.filter(g => !g.inherited);
  const inherited = grants.filter(g => g.inherited);

  return (
    <Modal isOpen={open} onClose={onClose} title="Share" subtitle={displayName ? `Who can see or edit “${displayName}”` : undefined} width="520px">
      <div className="share">
        <div className="share__owner">Owner: <strong>{owner ?? '—'}</strong></div>

        {isLoading ? <div className="share__loading">Loading…</div> : (
          <>
            <ul className="share__list">
              {direct.map(g => (
                <li key={g.id} className="share__row" data-testid="grant-row">
                  <span className="share__principal">{g.principalType === 'role' ? '👥' : '👤'} {g.principal}</span>
                  <span className={`share__access share__access--${g.access}`}>{g.access}</span>
                  {canManage && (
                    <button className="share__remove" onClick={() => removeGrant.mutate(g.id)} title="Revoke" data-testid="grant-remove">✕</button>
                  )}
                </li>
              ))}
              {inherited.map(g => (
                <li key={g.id} className="share__row share__row--inherited" title="Inherited from a parent folder">
                  <span className="share__principal">{g.principalType === 'role' ? '👥' : '👤'} {g.principal}</span>
                  <span className={`share__access share__access--${g.access}`}>{g.access}</span>
                  <span className="share__inherited">inherited</span>
                </li>
              ))}
              {grants.length === 0 && <li className="share__empty">Not shared with anyone yet — only the owner can see it.</li>}
            </ul>

            {canManage ? (
              <div className="share__add">
                <select className="ob-input" value={principalType} onChange={e => setPrincipalType(e.target.value as 'user' | 'role')}>
                  <option value="user">User</option>
                  <option value="role">Role</option>
                </select>
                <input
                  className="ob-input" placeholder={principalType === 'role' ? 'Operator / Engineer / Viewer' : 'username'}
                  value={principal} onChange={e => setPrincipal(e.target.value)}
                  data-testid="grant-principal"
                />
                <select className="ob-input" value={access} onChange={e => setAccess(e.target.value as 'read' | 'edit')}>
                  <option value="read">Can view</option>
                  <option value="edit">Can edit</option>
                </select>
                <button
                  className="share__grant" disabled={!principal.trim() || addGrant.isPending}
                  onClick={() => addGrant.mutate()} data-testid="grant-add"
                >Grant</button>
              </div>
            ) : (
              <div className="share__readonly">Only the owner or an administrator can change sharing.</div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};

export default ShareDialog;
