'use client';

// Phase 4 — Folder tree for the display home. The /folders endpoints (GET/POST/PUT/DELETE) and the
// display→folder assignment (PUT /displays/{id} FolderId) existed with no UI, so `folder_id` was a
// dead column. This renders the tree, supports create/rename/delete, filters the list by folder, and
// lets you MOVE a display by dragging its card onto a folder (or onto "All / Unfiled").
import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { apiJson, apiFetch } from '../../api/apiFetch';
import { useConfirm, usePrompt } from '../shared/dialogService';

const API_BASE = import.meta.env.VITE_DISPLAY_SERVICE_URL || '/api/displays';

interface Folder { id: string; name: string; parentId?: string | null; ownerId: string }
interface FolderNode extends Folder { children: FolderNode[] }

/** MIME type carried by a dragged display card (see DisplayList). */
export const DISPLAY_DND = 'application/x-ams-display-id';

function buildTree(folders: Folder[]): FolderNode[] {
  const byId = new Map<string, FolderNode>(folders.map(f => [f.id, { ...f, children: [] }]));
  const roots: FolderNode[] = [];
  for (const n of byId.values()) {
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    if (parent) parent.children.push(n); else roots.push(n);
  }
  const sortRec = (ns: FolderNode[]) => { ns.sort((a, b) => a.name.localeCompare(b.name)); ns.forEach(c => sortRec(c.children)); };
  sortRec(roots);
  return roots;
}

export const FolderTree: React.FC<{
  selectedFolderId?: string;
  /** undefined = All; '' = Unfiled; else a folder id. */
  onSelect: (folderId: string | undefined | '') => void;
}> = ({ selectedFolderId, onSelect }) => {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['folders'],
    queryFn: () => apiJson<{ folders: Folder[] }>(`${API_BASE}/folders`),
  });
  const tree = useMemo(() => buildTree(data?.folders ?? []), [data]);

  const createFolder = useMutation({
    mutationFn: (body: { name: string; parentId?: string }) => apiJson(`${API_BASE}/folders`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['folders'] }),
    onError: (e: Error) => toast.error(`Create failed: ${e.message}`),
  });
  const renameFolder = useMutation({
    mutationFn: (v: { id: string; name: string; parentId?: string | null }) => apiJson(`${API_BASE}/folders/${v.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: v.name, parentId: v.parentId }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['folders'] }),
    onError: (e: Error) => toast.error(`Rename failed: ${e.message}`),
  });
  const deleteFolder = useMutation({
    mutationFn: (id: string) => apiFetch(`${API_BASE}/folders/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['folders'] }); qc.invalidateQueries({ queryKey: ['displays'] }); },
    onError: (e: Error) => toast.error(`Delete failed: ${e.message}`),
  });
  const moveDisplay = useMutation({
    // Unfile = the empty GUID, NOT JSON null: the backend request field is `Guid?`, so a literal null
    // deserializes to "no value" and the update is silently skipped (`if (FolderId.HasValue)`), leaving
    // the display in its old folder while the UI toasts "Moved". The empty GUID hits the backend's
    // `== Guid.Empty ? null` branch and actually clears the folder.
    mutationFn: (v: { displayId: string; folderId: string | null }) => apiJson(`${API_BASE}/${v.displayId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId: v.folderId ?? '00000000-0000-0000-0000-000000000000' }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['displays'] }); toast.success('Moved'); },
    onError: (e: Error) => toast.error(`Move failed: ${e.message}`),
  });

  const onDropTo = (folderId: string | null) => (e: React.DragEvent) => {
    e.preventDefault();
    setDropTarget(null);
    const displayId = e.dataTransfer.getData(DISPLAY_DND);
    if (displayId) moveDisplay.mutate({ displayId, folderId });
  };
  const allowDrop = (key: string) => (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(DISPLAY_DND)) { e.preventDefault(); setDropTarget(key); }
  };

  const renderNode = (node: FolderNode, depth = 0): React.ReactNode => {
    const isOpen = expanded.has(node.id);
    const sel = selectedFolderId === node.id;
    return (
      <div key={node.id}>
        <div
          className={`ft__row${sel ? ' ft__row--sel' : ''}${dropTarget === node.id ? ' ft__row--drop' : ''}`}
          style={{ paddingLeft: depth * 14 + 4 }}
          onClick={() => onSelect(node.id)}
          onDragOver={allowDrop(node.id)}
          onDragLeave={() => setDropTarget(null)}
          onDrop={onDropTo(node.id)}
          data-testid="folder-row"
        >
          {node.children.length > 0 ? (
            <button className="ft__caret" onClick={(e) => { e.stopPropagation(); setExpanded(s => { const n = new Set(s); n.has(node.id) ? n.delete(node.id) : n.add(node.id); return n; }); }}>
              {isOpen ? '▼' : '▶'}
            </button>
          ) : <span className="ft__caret-spacer" />}
          <span className="ft__icon">📁</span>
          <span className="ft__name">{node.name}</span>
          <span className="ft__actions">
            <button title="New subfolder" onClick={async (e) => { e.stopPropagation(); const name = await prompt({ title: 'New subfolder', label: 'Subfolder name' }); if (name?.trim()) createFolder.mutate({ name: name.trim(), parentId: node.id }); }}>＋</button>
            <button title="Rename" onClick={async (e) => { e.stopPropagation(); const name = await prompt({ title: 'Rename folder', label: 'Folder name', defaultValue: node.name }); if (name?.trim() && name !== node.name) renameFolder.mutate({ id: node.id, name: name.trim(), parentId: node.parentId }); }}>✎</button>
            <button title="Delete (displays inside are kept, just unfiled)" onClick={async (e) => { e.stopPropagation(); if (await confirm({ title: 'Delete folder', message: `Delete folder "${node.name}"? Displays inside are moved to Unfiled.`, confirmLabel: 'Delete', danger: true })) deleteFolder.mutate(node.id); }}>✕</button>
          </span>
        </div>
        {isOpen && node.children.map(c => renderNode(c, depth + 1))}
      </div>
    );
  };

  return (
    <div className="ft" data-testid="folder-tree">
      <div className="ft__head">
        <span>Folders</span>
        <button title="New folder" onClick={async () => { const name = await prompt({ title: 'New folder', label: 'Folder name' }); if (name?.trim()) createFolder.mutate({ name: name.trim() }); }}>＋ New</button>
      </div>
      <div
        className={`ft__row${selectedFolderId === undefined ? ' ft__row--sel' : ''}`}
        onClick={() => onSelect(undefined)} data-testid="folder-all"
      >
        <span className="ft__caret-spacer" /><span className="ft__icon">🗂️</span><span className="ft__name">All displays</span>
      </div>
      <div
        className={`ft__row${selectedFolderId === '' ? ' ft__row--sel' : ''}${dropTarget === '__unfiled' ? ' ft__row--drop' : ''}`}
        onClick={() => onSelect('')}
        onDragOver={allowDrop('__unfiled')} onDragLeave={() => setDropTarget(null)} onDrop={onDropTo(null)}
        data-testid="folder-unfiled"
      >
        <span className="ft__caret-spacer" /><span className="ft__icon">📂</span><span className="ft__name">Unfiled</span>
      </div>
      {isLoading && <div className="ft__row ft__muted">Loading folders…</div>}
      {isError && (
        <div className="ft__row ft__muted">
          Folders unavailable.{' '}
          <button type="button" className="linklike" onClick={() => void refetch()}>Retry</button>
        </div>
      )}
      {!isLoading && !isError && tree.map(n => renderNode(n))}
    </div>
  );
};

export default FolderTree;
