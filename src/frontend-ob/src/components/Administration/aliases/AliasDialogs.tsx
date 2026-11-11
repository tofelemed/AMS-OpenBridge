/**
 * Add tag alias and Import tag aliases from CSV (moved out of AliasConfig.tsx). CHG-172 (owner review, the approved sample,
 * badge 20): one Mapping part with the hints behind ? (the subtitle repeated the page's ?); the import's columns and its rule in a
 * Columns part with Download template, then File contents. legacy_path + source_system are immutable identity; the same two
 * requests (POST /aliases, POST /aliases/bulk in chunks of 2000; the endpoint caps at 5000).
 */
import React, { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { toast } from 'react-toastify';
import { Dialog } from '../../../ui/Dialog';
import { Toggletip } from '../../../ui/Toggletip';
import { ReasonedButton } from '../../Cpm/ReasonedButton';
import { Field, Part } from '../../Cpm/registry/wizard/editorParts';
import { parseCsv, downloadTextFile } from '../../../utils/csv';
import { apiJson, ApiError } from '../../../api/apiFetch';

export const ALIAS_API = '/api/aliases';
const help = (label: string, text: string) => <Toggletip variant="how-to" label={label}><p>{text}</p></Toggletip>;

export const AddAliasDialog: React.FC<{ onClose: (changed: boolean) => void }> = ({ onClose }) => {
  const id = useId();
  const [legacyPath, setLegacyPath] = useState('');
  const [canonicalPath, setCanonicalPath] = useState('');
  const [sourceSystem, setSourceSystem] = useState('ot-gateway');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missing = !legacyPath.trim() || !canonicalPath.trim();

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

  return createPortal(
    <Dialog open title="Add tag alias" onClose={() => { if (!saving) onClose(false); }}
      footer={<>
        <ObcButton variant="flat" disabled={saving} onClick={() => onClose(false)}>Cancel</ObcButton>
        <ReasonedButton variant="raised" disabled={saving || missing} reason={missing ? 'Enter the tag and its UNS path first' : null} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Create alias'}
        </ReasonedButton>
      </>}>
      <Part title="Mapping">
        <div className="cpm-admin-stack">
        <Field id={`${id}-tag`} label="Legacy / OT tag *" help={help('Legacy / OT tag', 'Exactly as the source system sends it, e.g. 45FIC109.PV')}>
          <input id={`${id}-tag`} className="cpm-input cpm-mono" value={legacyPath} placeholder="45FIC109.PV" onChange={e => setLegacyPath(e.target.value)} />
        </Field>
        <Field id={`${id}-path`} label="Canonical UNS path *" help={help('Canonical UNS path', 'site/[area/]unit/device.measurement')}>
          <input id={`${id}-path`} className="cpm-input cpm-mono" value={canonicalPath}
            placeholder="hdpe/section_100/u1001_polymerization_reactor_1/45fic109.pv" onChange={e => setCanonicalPath(e.target.value)} />
        </Field>
        <Field id={`${id}-src`} label="Source system" help={help('Source system', 'ot-gateway, PI-AF, instrumental-pro, …')}>
          <input id={`${id}-src`} className="cpm-input" value={sourceSystem} onChange={e => setSourceSystem(e.target.value)} />
        </Field>
        </div>
      </Part>
      {error && <p className="cpm-field__error" role="alert">{error}</p>}
    </Dialog>, document.body);
};

export const ImportAliasDialog: React.FC<{ onClose: (changed: boolean) => void }> = ({ onClose }) => {
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
      const creates = parseCsv(text)
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
      // Chunked: /aliases/bulk caps at 5000 rows per request.
      let created = 0;
      const errors: { legacyPath?: string; error: string }[] = [];
      for (let i = 0; i < creates.length; i += 2000) {
        const res = await apiJson<{ created: number; errors: { legacyPath?: string; error: string }[] }>(`${ALIAS_API}/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ creates: creates.slice(i, i + 2000) }),
        });
        created += res.created;
        errors.push(...(res.errors ?? []));
      }
      setResult({ created, errors });
    } catch (e) {
      toast.error(e instanceof ApiError ? (e.detail ?? e.message) : String(e));
    } finally {
      setImporting(false);
    }
  };

  return createPortal(
    <Dialog open size="wide" title="Import tag aliases from CSV" onClose={() => onClose(!!result)}
      footer={<>
        <ObcButton variant="flat" onClick={() => onClose(!!result)}>{result ? 'Close' : 'Cancel'}</ObcButton>
        {!result && (
          <ReasonedButton variant="raised" disabled={!text.trim() || importing} reason={!text.trim() ? 'Paste the file contents first' : null}
            onClick={() => void runImport()}>
            {importing ? 'Importing…' : 'Import'}
          </ReasonedButton>
        )}
      </>}>
      {!result ? (
        <>
          <Part title="Columns" end={<ObcButton variant="flat" onClick={downloadTemplate}>Download template</ObcButton>}>
            <p className="cpm-copy"><code>legacy_path, canonical_path, source_system</code>. Duplicate (legacy_path, source_system) pairs are reported per row, not fatal.</p>
          </Part>
          <Part title="File contents">
            <textarea aria-label="File contents" className="cpm-textarea cpm-mono" rows={8} value={text} spellCheck={false}
              placeholder="legacy_path,canonical_path,source_system" onChange={e => setText(e.target.value)} />
          </Part>
        </>
      ) : (
        <>
          <p className="cpm-copy"><strong>{result.created}</strong> alias(es) created.</p>
          {result.errors.length > 0 && (
            <div className="cpm-admin-scroll">
              {result.errors.map((e, i) => <p key={i} className="cpm-field__error">{e.legacyPath ? `${e.legacyPath}: ` : ''}{e.error}</p>)}
            </div>
          )}
        </>
      )}
    </Dialog>, document.body);
};
