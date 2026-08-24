'use client';

/**
 * Plant Model — the Master Data editor for the UNS asset tree (P3 / G-06).
 *
 * The asset model is the platform's source of truth (bindings, historian paths,
 * Sparkplug topics and alarm sources are all derived from contextual paths), yet
 * until this page it had NO human write path — the hierarchy was seed-SQL-only
 * and every runtime writer created parentless leaves. This page gives operators:
 *
 *   • a Site → Area → Unit → Device → Measurement tree with search,
 *   • per-level create/edit dialogs (parent is always the node you clicked,
 *     never free text — the origin-spec cascade rule),
 *   • guarded delete (server 409s while children or CPM loops reference a node;
 *     the reason is surfaced verbatim),
 *   • a 3-step CSV importer (validate first, nothing sent until the last step).
 *
 * Path segments are immutable identity (lowercase snake_case slugs; `u` prefix
 * when a name starts with a digit — IoTDB nodes must not); display names are
 * freely editable. See MIGRATION_LOG decision #17.
 */
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Modal, FormField } from '../shared/Modal';
import { useConfirm } from '../shared/dialogService';
import { apiFetch, apiJson, ApiError } from '../../api/apiFetch';
import { useAuthStore } from '../../store/authStore';
import { toast } from 'react-toastify';
import { T } from '../../styles/theme';
import { ImportDialog } from './PlantModelImport';

const ASSET_API = (import.meta.env.VITE_ASSET_SERVICE_URL as string | undefined) || '/api/assets';

// asset_type in the asset model.
const TYPE_NAMES: Record<number, string> = { 1: 'Site', 2: 'Area', 3: 'Unit', 4: 'Device', 5: 'Measurement' };
const CHILD_TYPE: Record<number, number | null> = { 1: 2, 2: 3, 3: 4, 4: 5, 5: null };

export interface AssetNode {
  id: string;
  contextualPath: string;
  name: string;
  type: number;
  description?: string | null;
  engineeringUnit?: string | null;
  loEngLimit?: number | null;
  hiEngLimit?: number | null;
  template?: string | null;
  parentId?: string | null;
}

/** Path segment from a display name: lowercase, non-alnum → '_', collapsed;
 *  'u' prefix when it starts with a digit (IoTDB path nodes must not). */
export function slugSegment(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return /^[0-9]/.test(s) ? `u${s}` : s;
}

const SEGMENT_RX = /^[A-Za-z0-9_-]+$/;

async function fetchAssets(params: string): Promise<AssetNode[]> {
  const data = await apiJson<{ assets?: AssetNode[] }>(`${ASSET_API}?${params}`);
  return data.assets ?? [];
}

function invalidatePlantModel(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['plant-model'] });
  void qc.invalidateQueries({ queryKey: ['assets'] });
  void qc.invalidateQueries({ queryKey: ['cpm', 'filters'] });
  void qc.invalidateQueries({ queryKey: ['cpm', 'plant-locations'] });
}

// ── tree node ───────────────────────────────────────────────────────────────

const NodeRow: React.FC<{
  node: AssetNode;
  depth: number;
  canEdit: boolean;
  onAddChild: (parent: AssetNode) => void;
  onEdit: (node: AssetNode) => void;
  onDelete: (node: AssetNode) => void;
}> = ({ node, depth, canEdit, onAddChild, onEdit, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const childType = CHILD_TYPE[node.type];
  const children = useQuery({
    queryKey: ['plant-model', 'children', node.id],
    enabled: expanded && childType !== null,
    staleTime: 30_000,
    queryFn: () => fetchAssets(`parentId=${node.id}&take=1000`),
  });

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 10px', paddingLeft: 10 + depth * 22,
        borderBottom: `1px solid ${T.borderLight}`,
      }}>
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          disabled={childType === null}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          style={{
            background: 'none', border: 'none', cursor: childType === null ? 'default' : 'pointer',
            color: childType === null ? 'transparent' : T.textSecondary,
            width: 18, fontSize: '11px', padding: 0, fontFamily: 'inherit',
          }}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <span style={{
          fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em',
          color: T.textMuted, width: 92, flexShrink: 0, textTransform: 'uppercase',
        }}>
          {TYPE_NAMES[node.type]}
        </span>
        <span style={{ fontSize: '13px', fontWeight: 600, color: T.textPrimary }}>{node.name}</span>
        <span style={{ fontSize: '12px', color: T.textMuted, fontFamily: 'monospace' }}>{node.contextualPath}</span>
        {node.engineeringUnit && (
          <span style={{ fontSize: '11px', color: T.textSecondary }}>[{node.engineeringUnit}]</span>
        )}
        {node.template && (
          <span style={{
            fontSize: '10px', color: T.textSecondary, border: `1px solid ${T.border}`,
            borderRadius: '999px', padding: '1px 8px',
          }}>{node.template}</span>
        )}
        <span style={{ flex: 1 }} />
        {canEdit && (
          <span style={{ display: 'inline-flex', gap: 4 }}>
            {childType !== null && (
              <ObcButton variant="flat" size="small" onClick={() => onAddChild(node)}>
                + {TYPE_NAMES[childType]}
              </ObcButton>
            )}
            <ObcButton variant="flat" size="small" onClick={() => onEdit(node)}>Edit</ObcButton>
            <ObcButton variant="flat" size="small" onClick={() => onDelete(node)}>Delete</ObcButton>
          </span>
        )}
      </div>
      {expanded && children.isLoading && (
        <div style={{ padding: '6px 10px', paddingLeft: 32 + depth * 22, fontSize: '12px', color: T.textMuted }}>
          Loading…
        </div>
      )}
      {expanded && (children.data ?? []).map(c => (
        <NodeRow key={c.id} node={c} depth={depth + 1} canEdit={canEdit}
          onAddChild={onAddChild} onEdit={onEdit} onDelete={onDelete} />
      ))}
      {expanded && children.data?.length === 0 && (
        <div style={{ padding: '6px 10px', paddingLeft: 32 + depth * 22, fontSize: '12px', color: T.textMuted }}>
          No children yet.
        </div>
      )}
    </div>
  );
};

// ── create / edit dialog ────────────────────────────────────────────────────

interface EditorState {
  mode: 'create' | 'edit';
  /** Create: the parent node (null = creating a Site). Edit: the node itself. */
  parent: AssetNode | null;
  node: AssetNode | null;
  type: number;
}

const AssetEditorDialog: React.FC<{ editor: EditorState; onClose: (changed: boolean) => void }> = ({ editor, onClose }) => {
  const isCreate = editor.mode === 'create';
  const node = editor.node;
  const [name, setName] = useState(node?.name ?? '');
  const [segment, setSegment] = useState('');
  const [segmentTouched, setSegmentTouched] = useState(false);
  const [description, setDescription] = useState(node?.description ?? '');
  const [template, setTemplate] = useState(node?.template ?? '');
  const [engineeringUnit, setEngineeringUnit] = useState(node?.engineeringUnit ?? '');
  const [loEng, setLoEng] = useState(node?.loEngLimit != null ? String(node.loEngLimit) : '');
  const [hiEng, setHiEng] = useState(node?.hiEngLimit != null ? String(node.hiEngLimit) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveSegment = segmentTouched ? segment : slugSegment(name);
  const isMeasurement = editor.type === 5;
  const path = isCreate
    ? editor.parent
      ? `${editor.parent.contextualPath}${isMeasurement ? '.' : '/'}${effectiveSegment}`
      : effectiveSegment
    : node?.contextualPath ?? '';
  const segmentValid = effectiveSegment !== '' && SEGMENT_RX.test(effectiveSegment);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const numeric = (v: string) => (v.trim() === '' ? null : Number(v));
      if (isCreate) {
        await apiJson(`${ASSET_API}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contextualPath: path,
            name: name.trim() || effectiveSegment,
            type: editor.type,
            description: description.trim() || null,
            template: template.trim() || null,
            engineeringUnit: isMeasurement ? (engineeringUnit.trim() || null) : null,
            loEngLimit: isMeasurement ? numeric(loEng) : null,
            hiEngLimit: isMeasurement ? numeric(hiEng) : null,
            parentId: editor.parent?.id ?? null,
          }),
        });
      } else {
        await apiJson(`${ASSET_API}/${node!.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim() || undefined,
            description,
            template,
            engineeringUnit: isMeasurement ? engineeringUnit : undefined,
            loEngLimit: isMeasurement ? numeric(loEng) : undefined,
            hiEngLimit: isMeasurement ? numeric(hiEng) : undefined,
          }),
        });
      }
      onClose(true);
    } catch (e) {
      setError(e instanceof ApiError ? (e.detail ?? e.message) : String(e));
    } finally {
      setSaving(false);
    }
  };

  const levelName = TYPE_NAMES[editor.type];
  return (
    <Modal
      isOpen
      onClose={() => onClose(false)}
      title={isCreate
        ? editor.parent ? `Add ${levelName} under ${editor.parent.name}` : `Add ${levelName}`
        : `Edit ${levelName} ${node?.name}`}
      subtitle={isCreate
        ? 'The path segment is permanent identity — the display name can change later.'
        : node?.contextualPath}
      width="520px"
      footer={
        <>
          <ObcButton variant="normal" onClick={() => onClose(false)}>Cancel</ObcButton>
          <ObcButton variant="raised" disabled={saving || (isCreate && !segmentValid) || !name.trim()} onClick={save}>
            {saving ? 'Saving…' : isCreate ? `Create ${levelName}` : 'Save changes'}
          </ObcButton>
        </>
      }
    >
      <FormField label="Display name" required>
        <input className="ob-input" value={name} placeholder={levelName === 'Site' ? 'HDPE Plant' : ''}
          onChange={e => setName(e.target.value)} />
      </FormField>
      {isCreate && (
        <FormField
          label="Path segment"
          required
          hint={`Letters, digits, _ and - only. Full path: ${path || '—'}`}
          error={effectiveSegment && !segmentValid ? 'Invalid segment — letters, digits, _ and - only' : undefined}
        >
          <input className="ob-input" value={effectiveSegment} style={{ fontFamily: 'monospace' }}
            onChange={e => { setSegment(e.target.value); setSegmentTouched(true); }} />
        </FormField>
      )}
      <FormField label="Description">
        <input className="ob-input" value={description ?? ''} onChange={e => setDescription(e.target.value)} />
      </FormField>
      {(editor.type === 4 || editor.type === 5) && (
        <FormField label="Template" hint="Type label (Pump, Tank, …) — powers collections and asset-relative displays">
          <input className="ob-input" value={template ?? ''} onChange={e => setTemplate(e.target.value)} />
        </FormField>
      )}
      {isMeasurement && (
        <>
          <FormField label="Engineering unit" hint="PSI, degC, %, m3/h …">
            <input className="ob-input" value={engineeringUnit ?? ''} onChange={e => setEngineeringUnit(e.target.value)} />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FormField label="Low limit">
              <input className="ob-input" type="number" value={loEng} onChange={e => setLoEng(e.target.value)} />
            </FormField>
            <FormField label="High limit">
              <input className="ob-input" type="number" value={hiEng} onChange={e => setHiEng(e.target.value)} />
            </FormField>
          </div>
        </>
      )}
      {error && <div style={{ color: T.critical, fontSize: '13px', marginTop: 8 }}>{error}</div>}
    </Modal>
  );
};


// ── the page ────────────────────────────────────────────────────────────────

export const PlantModelConfig: React.FC = () => {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const hasPermission = useAuthStore(s => s.hasPermission);
  const canEdit = hasPermission('asset.edit');

  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const roots = useQuery({
    queryKey: ['plant-model', 'roots'],
    staleTime: 30_000,
    queryFn: () => fetchAssets('type=1&take=200'),
  });

  const searched = useQuery({
    queryKey: ['plant-model', 'search', search],
    enabled: search.trim().length >= 2,
    staleTime: 15_000,
    queryFn: () => fetchAssets(`search=${encodeURIComponent(search.trim())}&take=200`),
  });

  const onDelete = async (node: AssetNode) => {
    const ok = await confirm({
      title: `Delete ${TYPE_NAMES[node.type]}`,
      message: `Delete '${node.name}' (${node.contextualPath})? Deletes are refused while children or control loops still reference it.`,
      danger: true,
    });
    if (!ok) return;
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
      invalidatePlantModel(qc);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const closeEditor = (changed: boolean) => {
    setEditor(null);
    if (changed) invalidatePlantModel(qc);
  };

  const showSearch = search.trim().length >= 2;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: T.textPrimary, margin: 0 }}>Plant Model</h3>
          <p style={{ fontSize: '13px', color: T.textSecondary, margin: '4px 0 0' }}>
            The UNS asset tree — the source of truth every binding, trend, filter and loop location
            resolves against. Path segments are permanent identity; names are labels.
          </p>
        </div>
        {canEdit && (
          <span style={{ display: 'inline-flex', gap: 8 }}>
            <ObcButton variant="normal" onClick={() => setImportOpen(true)}>Import CSV</ObcButton>
            <ObcButton variant="raised" onClick={() => setEditor({ mode: 'create', parent: null, node: null, type: 1 })}>
              + Add Site
            </ObcButton>
          </span>
        )}
      </div>

      <input
        className="ob-input"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search by name or path (min. 2 characters)…"
        style={{ maxWidth: 420 }}
      />

      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, overflow: 'hidden' }}>
        {showSearch ? (
          <>
            {(searched.data ?? []).map(n => (
              <NodeRow key={n.id} node={n} depth={0} canEdit={canEdit}
                onAddChild={p => setEditor({ mode: 'create', parent: p, node: null, type: CHILD_TYPE[p.type]! })}
                onEdit={n2 => setEditor({ mode: 'edit', parent: null, node: n2, type: n2.type })}
                onDelete={onDelete} />
            ))}
            {searched.data?.length === 0 && (
              <div style={{ padding: 16, fontSize: '13px', color: T.textMuted }}>No matches.</div>
            )}
          </>
        ) : (
          <>
            {(roots.data ?? []).map(n => (
              <NodeRow key={n.id} node={n} depth={0} canEdit={canEdit}
                onAddChild={p => setEditor({ mode: 'create', parent: p, node: null, type: CHILD_TYPE[p.type]! })}
                onEdit={n2 => setEditor({ mode: 'edit', parent: null, node: n2, type: n2.type })}
                onDelete={onDelete} />
            ))}
            {roots.isLoading && <div style={{ padding: 16, fontSize: '13px', color: T.textMuted }}>Loading…</div>}
            {roots.data?.length === 0 && (
              <div style={{ padding: 16, fontSize: '13px', color: T.textMuted }}>
                No sites modelled yet. {canEdit ? 'Add a site or import a CSV to begin.' : ''}
              </div>
            )}
          </>
        )}
      </div>

      {editor && <AssetEditorDialog editor={editor} onClose={closeEditor} />}
      {importOpen && (
        <ImportDialog onClose={changed => { setImportOpen(false); if (changed) invalidatePlantModel(qc); }} />
      )}
    </div>
  );
};

export default PlantModelConfig;
