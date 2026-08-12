'use client';

// Phase 4 — Personal (operator-owned) views. The /me/views CRUD endpoints existed with no UI. A
// personal view is a non-versioned, per-user snapshot of a display's CONFIG (config-only — the server
// rejects any process values), that the operator can reopen later. This dialog lists the caller's own
// views plus views shared with them, and lets them open or delete their own.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { Modal } from '../shared/Modal';
import { apiJson, apiFetch } from '../../api/apiFetch';
import { relativeTime } from '../../utils/relativeTime';

const API_BASE = import.meta.env.VITE_DISPLAY_SERVICE_URL || '/api/displays';

interface ViewRow {
  id: string; name: string; description?: string | null; userId: string;
  isShared: boolean; sourceDisplayId?: string | null; updatedAt: string; mine: boolean;
}

export const PersonalViewsDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['my-views'],
    queryFn: () => apiJson<{ views: ViewRow[] }>(`${API_BASE}/me/views`),
    enabled: open,
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`${API_BASE}/me/views/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-views'] }); },
    onError: (e: Error) => toast.error(`Delete failed: ${e.message}`),
  });

  const views = data?.views ?? [];
  const mine = views.filter(v => v.mine);
  const shared = views.filter(v => !v.mine);

  const openView = (id: string) => { onClose(); navigate(`/my-view/${id}`); };

  const row = (v: ViewRow) => (
    <li key={v.id} className="pv__row" data-testid="pv-row">
      <button className="pv__open" onClick={() => openView(v.id)} title="Open this view">
        <span className="pv__name">🗔 {v.name}</span>
        <span className="pv__meta">{v.isShared ? 'shared · ' : ''}updated {relativeTime(v.updatedAt)}</span>
      </button>
      {v.mine && (
        <button className="pv__del" data-testid="pv-delete"
          onClick={() => { if (window.confirm(`Delete personal view "${v.name}"?`)) remove.mutate(v.id); }}
          title="Delete">✕</button>
      )}
    </li>
  );

  return (
    <Modal isOpen={open} onClose={onClose} title="My views" subtitle="Your saved personal views" width="480px">
      <div className="pv">
        {isLoading ? <div className="pv__loading">Loading…</div> : (
          <>
            <ul className="pv__list">
              {mine.map(row)}
              {isError && (
                <li className="pv__empty">
                  Could not load your views: {(error as Error)?.message ?? 'unavailable'}.{' '}
                  <button type="button" className="linklike" onClick={() => void refetch()}>Retry</button>
                </li>
              )}
              {!isError && mine.length === 0 && <li className="pv__empty">No personal views yet — open a display and “Save as personal view”.</li>}
            </ul>
            {shared.length > 0 && (
              <>
                <div className="pv__section">Shared with me</div>
                <ul className="pv__list">{shared.map(row)}</ul>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};

export default PersonalViewsDialog;
