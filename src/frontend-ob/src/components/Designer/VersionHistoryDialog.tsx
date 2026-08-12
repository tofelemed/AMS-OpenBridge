'use client';

// Phase 4 — Version-history browser. The endpoints existed (GET /versions, GET /versions/{n},
// POST /versions/{n}/restore, GET/POST /comments) but had NO UI. This surfaces them: list every
// version, compare any two (client-side diff of the item sets), restore an arbitrary version into a
// new draft, and read/add change comments. Config-only: a snapshot is display configuration, never
// process values, so a diff can never leak plant data.
import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { Modal } from '../shared/Modal';
import { apiJson } from '../../api/apiFetch';
import { relativeTime } from '../../utils/relativeTime';

const API_BASE = import.meta.env.VITE_DISPLAY_SERVICE_URL || '/api/displays';

interface VersionSummary {
  id: string; version: number; status: string; changeNote?: string | null;
  createdBy: string; createdAt: string; publishedAt?: string | null; publishedBy?: string | null;
}
interface VersionsResponse {
  displayId: string; publishedVersion: number | null; draftVersion: number; versions: VersionSummary[];
}
interface SnapItem { id: string; type: string; label?: string; [k: string]: unknown }
interface Snapshot { items?: SnapItem[]; settings?: Record<string, unknown> }
interface Comment { id: string; version?: number | null; author: string; body: string; createdAt: string }

const labelOf = (i: SnapItem) => i.label ? `${i.type} “${i.label}”` : i.type;

async function fetchSnapshot(displayId: string, n: number): Promise<Snapshot> {
  const r = await apiJson<{ snapshot: Snapshot }>(`${API_BASE}/${displayId}/versions/${n}`);
  return r.snapshot ?? {};
}

/** Client-side diff of two snapshots by item id (added / removed / changed). */
function diffSnapshots(a: Snapshot, b: Snapshot) {
  const am = new Map((a.items ?? []).map(i => [i.id, i] as const));
  const bm = new Map((b.items ?? []).map(i => [i.id, i] as const));
  const added: string[] = [], removed: string[] = [], changed: string[] = [];
  for (const [id, bi] of bm) {
    const ai = am.get(id);
    if (!ai) added.push(labelOf(bi));
    else if (JSON.stringify(ai) !== JSON.stringify(bi)) changed.push(labelOf(bi));
  }
  for (const [id, ai] of am) if (!bm.has(id)) removed.push(labelOf(ai));
  const settingsChanged = JSON.stringify(a.settings ?? {}) !== JSON.stringify(b.settings ?? {});
  return { added, removed, changed, settingsChanged };
}

export const VersionHistoryDialog: React.FC<{
  displayId: string;
  open: boolean;
  onClose: () => void;
  /** Called after a successful restore so the editor can reload the new draft. */
  onRestored?: () => void;
}> = ({ displayId, open, onClose, onRestored }) => {
  const qc = useQueryClient();
  const [compare, setCompare] = useState<{ base?: number; against?: number }>({});

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['versions', displayId],
    queryFn: () => apiJson<VersionsResponse>(`${API_BASE}/${displayId}/versions`),
    enabled: open,
  });
  const { data: commentData } = useQuery({
    queryKey: ['display-comments', displayId],
    queryFn: () => apiJson<{ comments: Comment[] }>(`${API_BASE}/${displayId}/comments`),
    enabled: open,
  });

  // Diff — fetch both selected snapshots and compute the delta.
  const { data: diff, isFetching: diffing } = useQuery({
    queryKey: ['version-diff', displayId, compare.base, compare.against],
    enabled: open && compare.base != null && compare.against != null,
    queryFn: async () => {
      const [a, b] = await Promise.all([
        fetchSnapshot(displayId, compare.base as number),
        fetchSnapshot(displayId, compare.against as number),
      ]);
      return diffSnapshots(a, b);
    },
  });

  const restore = useMutation({
    mutationFn: (n: number) => apiJson(`${API_BASE}/${displayId}/versions/${n}/restore`, { method: 'POST' }),
    onSuccess: (_r, n) => {
      toast.success(`Restored v${n} into a new draft`);
      qc.invalidateQueries({ queryKey: ['versions', displayId] });
      qc.invalidateQueries({ queryKey: ['display', displayId] });
      onRestored?.();
    },
    onError: (e: Error) => toast.error(`Restore failed: ${e.message}`),
  });

  const [commentBody, setCommentBody] = useState('');
  const addComment = useMutation({
    mutationFn: (body: string) => apiJson(`${API_BASE}/${displayId}/comments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }),
    }),
    onSuccess: () => { setCommentBody(''); qc.invalidateQueries({ queryKey: ['display-comments', displayId] }); },
    onError: (e: Error) => toast.error(`Comment failed: ${e.message}`),
  });

  const versions = data?.versions ?? [];
  const pick = (n: number) => setCompare(c => {
    if (c.base == null) return { base: n };
    if (c.against == null && n !== c.base) return { ...c, against: n };
    return { base: n }; // restart selection
  });
  const selLabel = useMemo(() => {
    if (compare.base == null) return 'Click a version to start a comparison';
    if (compare.against == null) return `Comparing from v${compare.base} → pick a second version`;
    return `v${compare.base} → v${compare.against}`;
  }, [compare]);

  return (
    <Modal isOpen={open} onClose={onClose} title="Version history" subtitle="Compare and restore prior versions" width="640px">
      <div className="vh">
        <div className="vh__hint">{selLabel}{compare.base != null && (
          <button className="vh__link" onClick={() => setCompare({})}>clear</button>
        )}</div>

        {(compare.base != null && compare.against != null) && (
          <div className="vh__diff" data-testid="version-diff">
            {diffing ? <span>Computing diff…</span> : diff ? (
              <>
                <strong>Changes v{compare.base} → v{compare.against}:</strong>{' '}
                <span className="vh__diff-add">+{diff.added.length} added</span> ·{' '}
                <span className="vh__diff-chg">{diff.changed.length} changed</span> ·{' '}
                <span className="vh__diff-rem">−{diff.removed.length} removed</span>
                {diff.settingsChanged && ' · display settings changed'}
                {(diff.added.length + diff.changed.length + diff.removed.length) > 0 && (
                  <ul className="vh__diff-list">
                    {diff.added.slice(0, 8).map((l, i) => <li key={`a${i}`} className="vh__diff-add">+ {l}</li>)}
                    {diff.changed.slice(0, 8).map((l, i) => <li key={`c${i}`} className="vh__diff-chg">~ {l}</li>)}
                    {diff.removed.slice(0, 8).map((l, i) => <li key={`r${i}`} className="vh__diff-rem">− {l}</li>)}
                  </ul>
                )}
              </>
            ) : null}
          </div>
        )}

        {isLoading ? <div className="vh__loading">Loading versions…</div> : (
          <ul className="vh__list">
            {versions.map(v => {
              const isPub = data?.publishedVersion === v.version;
              const isDraft = data?.draftVersion === v.version;
              const selected = compare.base === v.version || compare.against === v.version;
              return (
                <li key={v.id} className={`vh__row${selected ? ' vh__row--sel' : ''}`} data-testid="version-row">
                  <button className="vh__pick" onClick={() => pick(v.version)} title="Select for comparison">
                    <span className="vh__ver">v{v.version}</span>
                    {isPub && <span className="vh__tag vh__tag--pub">published</span>}
                    {isDraft && <span className="vh__tag vh__tag--draft">draft</span>}
                    <span className="vh__note">{v.changeNote || '—'}</span>
                    <span className="vh__meta">{v.createdBy} · {relativeTime(v.createdAt)}</span>
                  </button>
                  <button
                    className="vh__restore" data-testid="version-restore"
                    disabled={restore.isPending}
                    onClick={() => { if (window.confirm(`Restore v${v.version} into a new draft?`)) restore.mutate(v.version); }}
                    title="Copy this version into a new editable draft"
                  >Restore</button>
                </li>
              );
            })}
            {isError && (
              <li className="vh__empty">
                Could not load versions: {(error as Error)?.message ?? 'unavailable'}.{' '}
                <button type="button" className="linklike" onClick={() => void refetch()}>Retry</button>
              </li>
            )}
            {!isError && versions.length === 0 && <li className="vh__empty">No versions yet.</li>}
          </ul>
        )}

        <div className="vh__comments">
          <div className="vh__comments-title">Change notes</div>
          <ul className="vh__comments-list">
            {(commentData?.comments ?? []).slice(0, 20).map(c => (
              <li key={c.id}><strong>{c.author}</strong> <span className="vh__meta">{relativeTime(c.createdAt)}</span><div>{c.body}</div></li>
            ))}
            {(commentData?.comments ?? []).length === 0 && <li className="vh__meta">No comments yet.</li>}
          </ul>
          <div className="vh__comments-add">
            <input
              className="ob-input" placeholder="Add a change note…" value={commentBody}
              onChange={e => setCommentBody(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && commentBody.trim()) addComment.mutate(commentBody.trim()); }}
            />
            <button className="vh__restore" disabled={!commentBody.trim() || addComment.isPending}
              onClick={() => addComment.mutate(commentBody.trim())}>Add</button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default VersionHistoryDialog;
