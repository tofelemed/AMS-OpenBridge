'use client';

/**
 * Plant Model — the Master Data editor for the UNS asset tree (P3 / G-06).
 *
 * The asset model is the platform's source of truth (bindings, historian paths, Sparkplug topics and alarm sources are all
 * derived from contextual paths), yet until this page it had NO human write path — the hierarchy was seed-SQL-only and every
 * runtime writer created parentless leaves. This page gives operators a Site → Area → Unit → Device → Measurement tree with
 * search, per-level create/edit dialogs (the parent is always the node selected, never free text — the origin-spec cascade
 * rule), guarded delete (the server refuses while children or CPM loops reference a node; the reason is surfaced verbatim) and a
 * 3-step CSV importer (validate first, nothing sent until the last step).
 *
 * CHG-172 (owner review, the approved sample docs/theme/redesign/samples/administration-proposal.html, badges 16-18, and the
 * owner's answers of 11 Nov 2026): the onboarding strip above the tree (its counts load with the page); the tree card with one
 * search (2 characters or more; `?search=` from a link); the selected node in a panel beside it (a drawer below 1280 px) holding
 * the actions that were on every row; Import CSV and Add site in the page header. Reads need asset.view, every write asset.edit.
 */
import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { toast } from 'react-toastify';
import { apiFetch } from '../../api/apiFetch';
import { useAuthStore } from '../../store/authStore';
import { EmptyState } from '../Cpm/shared';
import { AdminActions } from './AdminActions';
import { AdminConfirmDialog } from './AdminConfirmDialog';
import { ImportDialog } from './PlantModelImport';
import { PlantModelStatus } from './PlantModelStatus';
import { PlantTree } from './plant/PlantTree';
import { NodePanel } from './plant/NodePanel';
import { AssetEditorDialog, type EditorState } from './plant/AssetEditorDialog';
import { ASSET_API, CHILD_TYPE, TYPE_NAMES, fetchAssets, invalidatePlantModel, type AssetNode } from './plant/plantModel';


export const PlantModelConfig: React.FC = () => {
  const qc = useQueryClient();
  const canEdit = useAuthStore(s => s.hasPermission('asset.edit'));
  const [params] = useSearchParams();
  const [search, setSearch] = useState(() => params.get('search') ?? '');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [picked, setPicked] = useState<AssetNode | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [deleting, setDeleting] = useState<AssetNode | null>(null);

  const roots = useQuery({ queryKey: ['plant-model', 'roots'], staleTime: 30_000, queryFn: () => fetchAssets('type=1&take=200') });
  const showSearch = search.trim().length >= 2;
  const searched = useQuery({
    queryKey: ['plant-model', 'search', search],
    enabled: showSearch,
    staleTime: 15_000,
    queryFn: () => fetchAssets(`search=${encodeURIComponent(search.trim())}&take=200`),
  });
  const shown = showSearch ? searched.data ?? [] : roots.data ?? [];
  const selected = picked ?? shown[0] ?? null;

  const onDelete = async (node: AssetNode) => {
    setDeleting(null);
    try {
      const res = await apiFetch(`${ASSET_API}/${node.id}`, { method: 'DELETE' });
      if (res.status === 409) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        toast.error(body?.error ?? 'Delete refused — the asset is still referenced.');
        return;
      }
      if (!res.ok && res.status !== 404) {
        toast.error(`Delete failed (HTTP ${res.status})`);
        return;
      }
      toast.success(`Deleted ${node.contextualPath}`);
      if (picked?.id === node.id) setPicked(null);
      invalidatePlantModel(qc);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const closeEditor = (changed: boolean) => {
    setEditor(null);
    if (changed) invalidatePlantModel(qc);
  };
  const pick = (n: AssetNode) => { setPicked(n); setDrawer(true); };

  return (
    <>
      {canEdit && (
        <AdminActions>
          <ObcButton variant="normal" onClick={() => setImportOpen(true)}>Import CSV</ObcButton>
          <ObcButton variant="raised" onClick={() => setEditor({ mode: 'create', parent: null, node: null, type: 1 })}>Add site</ObcButton>
        </AdminActions>
      )}
      <PlantModelStatus />
      <div className="cpm-master-detail">
        <section className="cpm-surface cpm-admin-list" aria-label="Plant model">
          <div className="cpm-compact cpm-admin-filters" role="group" aria-label="Plant model filters">
            <input className="cpm-input" type="search" aria-label="Find in plant model" placeholder="Name or path, 2 characters or more"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {shown.length > 0 && <PlantTree nodes={shown} selectedId={selected?.id ?? null} onSelect={pick} />}
          {showSearch && searched.data?.length === 0 && <EmptyState title="No matches." />}
          {!showSearch && roots.isLoading && <EmptyState title="Loading…" />}
          {!showSearch && roots.data?.length === 0 && (
            <EmptyState title="No sites modelled yet." copy={canEdit ? 'Add a site or import a CSV to begin.' : undefined} />
          )}
        </section>
        {selected && (
          <NodePanel node={selected} canEdit={canEdit} open={drawer} onClose={() => setDrawer(false)}
            onAddChild={() => setEditor({ mode: 'create', parent: selected, node: null, type: CHILD_TYPE[selected.type]! })}
            onEdit={() => setEditor({ mode: 'edit', parent: null, node: selected, type: selected.type })}
            onDelete={() => setDeleting(selected)} />
        )}
      </div>

      {editor && <AssetEditorDialog editor={editor} onClose={closeEditor} />}
      <AdminConfirmDialog open={!!deleting} title={`Delete ${deleting ? TYPE_NAMES[deleting.type] : ''}`} confirmLabel="Delete"
        onCancel={() => setDeleting(null)} onConfirm={() => deleting && void onDelete(deleting)}>
        <p className="cpm-copy">
          {deleting && `Delete '${deleting.name}' (${deleting.contextualPath})? Deletes are refused while children or control loops still reference it.`}
        </p>
      </AdminConfirmDialog>
      {importOpen && <ImportDialog onClose={changed => { setImportOpen(false); if (changed) invalidatePlantModel(qc); }} />}
    </>
  );
};

export default PlantModelConfig;
