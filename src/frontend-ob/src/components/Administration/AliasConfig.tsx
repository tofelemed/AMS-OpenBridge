'use client';

/**
 * Tag Aliases — admin surface for assets.alias_mapping (P4.3 / G-08).
 *
 * The alias table is the OT bridge: `legacy OT tag → canonical UNS path`, so the
 * DCS never has to be renamed. It shipped write-only (create + resolve, no list,
 * no delete) and sat empty in production. This page lists, creates, retires and
 * CSV-imports aliases. legacy_path + source_system are immutable identity —
 * correcting them is delete + recreate, mirroring the server contract.
 */
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Modal, FormField } from '../shared/Modal';
import { useConfirm } from '../shared/dialogService';
import { parseCsv, downloadTextFile } from '../../utils/csv';
import { apiFetch, apiJson, ApiError } from '../../api/apiFetch';
import { useAuthStore } from '../../store/authStore';
import { toast } from 'react-toastify';
import { T } from '../../styles/theme';

const ALIAS_API = '/api/aliases';

interface AliasRow {
  id: string;
  legacyPath: string;
  canonicalPath: string;
  sourceSystem: string;
  isActive: boolean;
  createdAt: string;
}

const AddAliasDialog: React.FC<{ onClose: (changed: boolean) => void }> = ({ onClose }) => {
  const [legacyPath, setLegacyPath] = useState('');
  const [canonicalPath, setCanonicalPath] = useState('');
  const [sourceSystem, setSourceSystem] = useState('ot-gateway');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiJson(ALIAS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ legacyPath: legacyPath.trim(), canonicalPath: canonicalPath.trim(), sourceSystem: sourceSystem.trim() || 'unknown' }),
      });
      onClose(true);
    } catch (e) {
      setError(e instanceof ApiError ? (e.detail ?? e.message) : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={() => onClose(false)}
      title="Add tag alias"
      subtitle="Maps an OT/legacy tag name to its canonical UNS path."
      width="520px"
      footer={
        <>
          <ObcButton variant="normal" onClick={() => onClose(false)}>Cancel</ObcButton>
          <ObcButton variant="raised" disabled={saving || !legacyPath.trim() || !canonicalPath.trim()} onClick={save}>
            {saving ? 'Saving…' : 'Create alias'}
          </ObcButton>
        </>
      }
    >
      <FormField label="Legacy / OT tag" required hint="Exactly as the source system sends it, e.g. 45FIC109.PV">
        <input className="ob-input" value={legacyPath} style={{ fontFamily: 'monospace' }}
          onChange={e => setLegacyPath(e.target.value)} placeholder="45FIC109.PV" />
      </FormField>
      <FormField label="Canonical UNS path" required hint="site/[area/]unit/device.measurement">
        <input className="ob-input" value={canonicalPath} style={{ fontFamily: 'monospace' }}
          onChange={e => setCanonicalPath(e.target.value)} placeholder="hdpe/section_100/u1001_polymerization_reactor_1/45fic109.pv" />
      </FormField>
      <FormField label="Source system" hint="ot-gateway, PI-AF, instrumental-pro, …">
        <input className="ob-input" value={sourceSystem} onChange={e => setSourceSystem(e.target.value)} />
      </FormField>
      {error && <div style={{ color: T.critical, fontSize: '13px', marginTop: 8 }}>{error}</div>}
    </Modal>
  );
};

const ImportAliasDialog: React.FC<{ onClose: (changed: boolean) => void }> = ({ onClose }) => {
  const [text, setText] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; errors: { legacyPath?: string; error: string }[] } | null>(null);

  const downloadTemplate = () => downloadTextFile('tag-aliases-template.csv', [
    'legacy_path,canonical_path,source_system',
    '45FIC109.PV,hdpe/section_100/u1001_polymerization_reactor_1/45fic109.pv,ot-gateway',
  ].join('\n'));

  const runImport = async () => {
    setImporting(true);
    try {
      const rows = parseCsv(text);
      const creates = rows
        .filter(r => (r['legacy_path'] ?? '').trim() && (r['canonical_path'] ?? '').trim())
        .map(r => ({
          legacyPath: r['legacy_path'].trim(),
          canonicalPath: r['canonical_path'].trim(),
          sourceSystem: (r['source_system'] ?? '').trim() || 'ot-gateway',
        }));
      if (creates.length === 0) {
        toast.error('No importable rows — legacy_path and canonical_path are required.');
        return;
      }
      const res = await apiJson<{ created: number; errors: { legacyPath?: string; error: string }[] }>(
        `${ALIAS_API}/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ creates }),
        });
      setResult(res);
    } catch (e) {
      toast.error(e instanceof ApiError ? (e.detail ?? e.message) : String(e));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={() => onClose(!!result)}
      title="Import tag aliases from CSV"
      subtitle="Columns: legacy_path, canonical_path, source_system"
      width="640px"
      footer={
        <>
          <ObcButton variant="normal" onClick={() => onClose(!!result)}>{result ? 'Close' : 'Cancel'}</ObcButton>
          {!result && (
            <ObcButton variant="raised" disabled={!text.trim() || importing} onClick={runImport}>
              {importing ? 'Importing…' : 'Import'}
            </ObcButton>
          )}
        </>
      }
    >
      {!result ? (
        <>
          <p style={{ fontSize: '13px', color: T.textSecondary, marginTop: 0 }}>
            Duplicate (legacy_path, source_system) pairs are reported per row, not fatal.{' '}
            <button type="button" onClick={downloadTemplate}
              style={{ background: 'none', border: 'none', color: T.blue, cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: '13px' }}>
              Download template
            </button>
          </p>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="legacy_path,canonical_path,source_system"
            style={{
              width: '100%', minHeight: 180, fontFamily: 'monospace', fontSize: '12px',
              background: T.card, color: T.textPrimary, border: `1px solid ${T.border}`,
              borderRadius: 6, padding: 10, resize: 'vertical',
            }}
          />
        </>
      ) : (
        <div style={{ fontSize: '13px', color: T.textPrimary }}>
          <p><strong>{result.created}</strong> alias(es) created.</p>
          {result.errors.length > 0 && (
            <div style={{ maxHeight: 200, overflow: 'auto', border: `1px solid ${T.border}`, borderRadius: 6 }}>
              {result.errors.map((e, i) => (
                <div key={i} style={{ padding: '4px 10px', fontSize: '12px', color: T.critical, borderBottom: `1px solid ${T.borderLight}` }}>
                  {e.legacyPath ? `${e.legacyPath}: ` : ''}{e.error}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

export const AliasConfig: React.FC = () => {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const canEdit = useAuthStore(s => s.hasPermission('asset.edit'));
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const aliases = useQuery({
    queryKey: ['aliases', search],
    staleTime: 15_000,
    queryFn: () => apiJson<{ total: number; items: AliasRow[] }>(
      `${ALIAS_API}?take=500&includeInactive=true${search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ''}`),
  });

  const onDelete = async (row: AliasRow) => {
    if (!await confirm({
      title: 'Delete alias',
      message: `Delete the mapping '${row.legacyPath}' → '${row.canonicalPath}'? Events using this tag will park as unknown until remapped.`,
      danger: true,
    })) return;
    const res = await apiFetch(`${ALIAS_API}/${row.id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) {
      toast.error(`Delete failed (HTTP ${res.status})`);
      return;
    }
    void qc.invalidateQueries({ queryKey: ['aliases'] });
  };

  const refresh = (changed: boolean) => {
    setAddOpen(false);
    setImportOpen(false);
    if (changed) void qc.invalidateQueries({ queryKey: ['aliases'] });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: T.textPrimary, margin: 0 }}>Tag Aliases</h3>
          <p style={{ fontSize: '13px', color: T.textSecondary, margin: '4px 0 0' }}>
            OT/legacy tag → canonical UNS path. Ingestion resolves incoming tag names through this
            table; a tag without an alias parks as unknown instead of flowing.
          </p>
        </div>
        {canEdit && (
          <span style={{ display: 'inline-flex', gap: 8 }}>
            <ObcButton variant="normal" onClick={() => setImportOpen(true)}>Import CSV</ObcButton>
            <ObcButton variant="raised" onClick={() => setAddOpen(true)}>+ Add Alias</ObcButton>
          </span>
        )}
      </div>

      <input className="ob-input" value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by tag or path…" style={{ maxWidth: 420 }} />

      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: T.textSecondary }}>
              {['Legacy / OT tag', 'Canonical UNS path', 'Source', 'Active', ''].map(h => (
                <th key={h} style={{ padding: '8px 12px', borderBottom: `1px solid ${T.border}`, fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(aliases.data?.items ?? []).map(row => (
              <tr key={row.id}>
                <td style={{ padding: '6px 12px', borderBottom: `1px solid ${T.borderLight}`, fontFamily: 'monospace', color: T.textPrimary }}>{row.legacyPath}</td>
                <td style={{ padding: '6px 12px', borderBottom: `1px solid ${T.borderLight}`, fontFamily: 'monospace', color: T.textSecondary }}>{row.canonicalPath}</td>
                <td style={{ padding: '6px 12px', borderBottom: `1px solid ${T.borderLight}`, color: T.textSecondary }}>{row.sourceSystem}</td>
                <td style={{ padding: '6px 12px', borderBottom: `1px solid ${T.borderLight}`, color: row.isActive ? T.success : T.textMuted }}>
                  {row.isActive ? 'active' : 'inactive'}
                </td>
                <td style={{ padding: '6px 12px', borderBottom: `1px solid ${T.borderLight}`, textAlign: 'right' }}>
                  {canEdit && (
                    <ObcButton variant="flat" size="small" onClick={() => onDelete(row)}>Delete</ObcButton>
                  )}
                </td>
              </tr>
            ))}
            {aliases.data && aliases.data.items.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 16, color: T.textMuted }}>
                  No aliases{search.trim() ? ' match the search' : ' configured yet'}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {aliases.data && aliases.data.total > aliases.data.items.length && (
        <p style={{ fontSize: '12px', color: T.textMuted, margin: 0 }}>
          Showing {aliases.data.items.length} of {aliases.data.total} — narrow with search.
        </p>
      )}

      {addOpen && <AddAliasDialog onClose={refresh} />}
      {importOpen && <ImportAliasDialog onClose={refresh} />}
    </div>
  );
};

export default AliasConfig;
