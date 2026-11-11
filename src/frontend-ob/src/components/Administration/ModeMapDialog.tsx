/**
 * CHG-172 (owner review, the approved sample, badge 15): Edit MODE map as a dialog (it opened inside the panel). The same rows
 * (value → engine token, with what the engine makes of the token), Add value, the Yokogawa CENTUM preset, the "Nothing here
 * counts as AUTO" warning and Save MODE map. PUT replaces profile_config, so saving is a read-modify-write of the whole stored
 * object (CHG-012): the mqtt block, the TLS certificate and every other loop_ingest key are carried across untouched.
 */
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObiDelete } from '@oicl/openbridge-webcomponents-react/icons/icon-delete';
import { Dialog } from '../../ui/Dialog';
import { CpmIconButton } from '../Cpm/shared';
import { DataSourceDto, LoopIngestConfig, extractApiError, updateDataSource } from './dataSourcesApi';
// Single source of truth for the engine's mode tokens: it must stay in step with ingestion-service ModeVocabulary.cs.
import { classifyMode, type ModeClass } from '../../utils/modeVocabulary';

/** SME-confirmed Yokogawa CENTUM enum (docs/ot-data-integration/10 §2). */
const CENTUM_PRESET: Array<[string, string]> = [['1', 'AUT'], ['2', 'MAN'], ['3', 'CAS'], ['4', 'IMAN']];

interface Row { value: string; token: string }

export const CLASS_LABEL: Record<ModeClass, string> = {
  auto: 'counts as AUTO',
  manual: 'counts as MANUAL',
  unrecognised: 'NOT RECOGNISED — engine treats it as manual',
};
const CLASS_TONE: Record<ModeClass, string> = { auto: 'cpm-admin-good', manual: 'cpm-copy', unrecognised: 'cpm-field__error' };

const toRows = (map?: Record<string, string>): Row[] => Object.entries(map ?? {}).map(([value, token]) => ({ value, token }));

export const ModeMapDialog: React.FC<{
  source: DataSourceDto;
  onClose: () => void;
  onSaved: (saved: DataSourceDto) => void;
}> = ({ source, onClose, onSaved }) => {
  const li = (source.profileConfig?.loop_ingest ?? {}) as LoopIngestConfig;
  const [rows, setRows] = useState<Row[]>(() => toRows(li.mode_value_map));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draftHasAuto = rows.some(r => r.value.trim() && classifyMode(r.token) === 'auto');
  const setRow = (i: number, patch: Partial<Row>) => setRows(rs => rs.map((r, n) => (n === i ? { ...r, ...patch } : r)));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const map: Record<string, string> = {};
      for (const r of rows) {
        const v = r.value.trim();
        const t = r.token.trim().toUpperCase();
        if (v && t) map[v] = t;
      }
      // Read-modify-write: PUT replaces profile_config, so send the whole object.
      const pc = source.profileConfig ?? {};
      onSaved(await updateDataSource(source.configId, { profileConfig: { ...pc, loop_ingest: { ...li, mode_value_map: map } } }));
      onClose();
    } catch (err) {
      const { message, field } = extractApiError(err);
      setError(field ? `${message} (${field})` : message);
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <Dialog open title="Edit MODE map" onClose={() => { if (!saving) onClose(); }}
      footer={<>
        <ObcButton variant="flat" disabled={saving} onClick={onClose}>Cancel</ObcButton>
        <ObcButton variant="raised" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save MODE map'}</ObcButton>
      </>}>
      <p className="cpm-copy">
        Source MODE value → engine token. Use exact tokens: <strong>AUT</strong>, <strong>MAN</strong>, <strong>CAS</strong>,
        {' '}<strong>IMAN</strong>. Everything else in this block is managed through the API and is left untouched by this save.
      </p>
      {rows.map((row, i) => {
        const cls = classifyMode(row.token);
        const filled = row.value.trim() !== '' || row.token.trim() !== '';
        return (
          <div key={i} className="cpm-admin-moderow">
            <input className="cpm-input cpm-mono" aria-label={`MODE value ${i + 1}`} value={row.value} placeholder="value"
              onChange={e => setRow(i, { value: e.target.value })} />
            <span aria-hidden="true">→</span>
            <input className="cpm-input cpm-mono" aria-label={`Engine token ${i + 1}`} value={row.token} placeholder="AUT"
              aria-invalid={filled && cls === 'unrecognised' ? true : undefined} onChange={e => setRow(i, { token: e.target.value })} />
            <span className={CLASS_TONE[cls]}>{filled ? CLASS_LABEL[cls] : ''}</span>
            <CpmIconButton label="Remove" onClick={() => setRows(rs => rs.filter((_, n) => n !== i))}><ObiDelete /></CpmIconButton>
          </div>
        );
      })}
      {rows.length > 0 && !draftHasAuto && (
        <p className="cpm-field__error">Nothing here counts as AUTO — saving this map excludes every loop on this source at Gate 1.</p>
      )}
      <div className="cpm-admin-inline">
        <ObcButton variant="normal" onClick={() => setRows(rs => [...rs, { value: '', token: '' }])}>Add value</ObcButton>
        <ObcButton variant="normal" onClick={() => setRows(CENTUM_PRESET.map(([value, token]) => ({ value, token })))}>Use Yokogawa CENTUM preset</ObcButton>
      </div>
      {error && <p className="cpm-field__error" role="alert">{error}</p>}
    </Dialog>, document.body);
};

export default ModeMapDialog;
