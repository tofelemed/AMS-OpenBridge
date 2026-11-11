'use client';

/**
 * Bulk import users. CHG-172 (owner review, the approved sample, badge 7): the three steps as tabs, File · Preview · Result
 * (a step ahead is shown and not reachable; File from Preview is Choose another file). File holds Columns with Download template
 * and the drop zone (.csv · up to 5000 rows); Preview the counts in one line, the options and the rows; Result the counts and
 * any errors. Every check, option and request is as before: .csv only, 5000 rows, validate first, then execute.
 */
import React, { useRef, useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { toast } from 'react-toastify';
import { Dialog } from '../../ui/Dialog';
import { Tabs, tabPanelProps } from '../../ui/Tabs';
import { TonePill, type CpmTone } from '../Cpm/shared';
import { ReasonedButton } from '../Cpm/ReasonedButton';
import { Part } from '../Cpm/registry/wizard/editorParts';
import { parseCsv, downloadTextFile } from '../../utils/csv';
import {
  validateBulkImport, executeBulkImport, getImportTemplate, extractApiError,
  type BulkValidationResult, type BulkImportResult,
} from '../../api/usersApi';

type Step = 'upload' | 'preview' | 'result';
const STEPS: Array<{ value: Step; label: string }> = [
  { value: 'upload', label: 'File' }, { value: 'preview', label: 'Preview' }, { value: 'result', label: 'Result' },
];
const STATUS: Record<string, [CpmTone, string]> = { valid: ['good', '✓'], warning: ['warn', '!'], duplicate: ['muted', '='], error: ['bad', '✕'] };

const Counts: React.FC<{ testId: string; items: Array<[number, string]> }> = ({ testId, items }) => (
  <p className="cpm-admin-counts" data-testid={testId}>
    {items.map(([n, label]) => <span key={label}><strong>{n}</strong> {label}</span>)}
  </p>
);

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
}

export const BulkImportModal: React.FC<Props> = ({ isOpen, onClose, onImported }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('upload');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [validation, setValidation] = useState<BulkValidationResult | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipErrors, setSkipErrors] = useState(true);
  const [overwriteDuplicates, setOverwriteDuplicates] = useState(false);

  const reset = () => {
    setStep('upload'); setRows([]); setValidation(null); setResult(null); setError(null); setBusy(false);
    setSkipErrors(true); setOverwriteDuplicates(false);
  };
  const handleClose = () => { reset(); onClose(); };

  const downloadTemplate = async () => {
    try {
      downloadTextFile('user_import_template.csv', await getImportTemplate());
    } catch (e) {
      toast.error(extractApiError(e));
    }
  };

  const handleFile = async (file: File) => {
    setError(null);
    if (!file.name.toLowerCase().endsWith('.csv')) { setError('Please choose a .csv file.'); return; }
    try {
      const parsed = parseCsv(await file.text());
      if (parsed.length === 0) { setError('The CSV file has no data rows.'); return; }
      if (parsed.length > 5000) { setError('Maximum 5000 rows per import.'); return; }
      setRows(parsed);
      setBusy(true);
      setValidation(await validateBulkImport(parsed));
      setStep('preview');
    } catch (e) {
      setError(extractApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await executeBulkImport(rows, { skipErrors, overwriteDuplicates });
      setResult(r);
      setStep('result');
      onImported();
      toast.success(`Import complete: ${r.created} created, ${r.updated} updated`);
    } catch (e) {
      setError(extractApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const importable = (validation?.validRows ?? 0) + (validation?.warningRows ?? 0) + (validation?.duplicateRows ?? 0);
  const at = STEPS.findIndex(s => s.value === step);
  const footer = step === 'upload' ? <ObcButton variant="flat" onClick={handleClose}>Cancel</ObcButton>
    : step === 'preview' ? (
      <>
        <ObcButton variant="flat" disabled={busy} onClick={reset}>Choose another file</ObcButton>
        <ReasonedButton variant="raised" disabled={busy || importable === 0} reason={importable === 0 ? 'Every row has an error.' : null}
          onClick={() => void runImport()}>
          {busy ? 'Importing…' : 'Import users'}
        </ReasonedButton>
      </>
    ) : <ObcButton variant="raised" onClick={handleClose}>Done</ObcButton>;

  if (!isOpen) return null;
  return (
    <Dialog open title="Bulk import users" size="wide" onClose={handleClose} footer={footer}>
      <Tabs idBase="admin-bulk" label="Bulk import users" value={step}
        options={STEPS.map((s, i) => ({ ...s, disabled: i > at || (step === 'result' && i < at) }))}
        onChange={v => { if (v === 'upload' && step === 'preview') reset(); }} />
      <div className="cpm-reg-editor__panel" {...tabPanelProps('admin-bulk', step)}>
        {error && <p className="cpm-field__error" role="alert">{error}</p>}

        {step === 'upload' && (
          <>
            <Part title="Columns" end={<ObcButton variant="flat" onClick={() => void downloadTemplate()}>Download template</ObcButton>}>
              <p className="cpm-mono">username, email, full_name, password, role, is_active</p>
              <p className="cpm-copy">Roles: Admin, Engineer, Operator, Viewer.</p>
            </Part>
            <Part title="File">
              <div className="cpm-csv-drop cpm-admin-drop" role="button" tabIndex={0}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void handleFile(f); }}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}>
                <span>{busy ? 'Validating…' : 'Click to choose a CSV file, or drag & drop it here'}</span>
                <span className="cpm-event-row__sub cpm-csv-drop__count">.csv · up to 5000 rows</span>
                <input ref={fileInputRef} type="file" accept=".csv" hidden aria-hidden="true" tabIndex={-1}
                  onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }} />
              </div>
            </Part>
          </>
        )}

        {step === 'preview' && validation && (
          <>
            <Counts testId="bulk-counts" items={[[validation.totalRows, 'Total'], [validation.validRows, 'Valid'],
              [validation.warningRows, 'Warnings'], [validation.duplicateRows, 'Duplicates'], [validation.errorRows, 'Errors']]} />
            <Part title="Options">
              <div className="cpm-admin-options">
                <label className="cpm-admin-check">
                  <input type="checkbox" checked={skipErrors} onChange={e => setSkipErrors(e.target.checked)} />
                  Skip error rows
                </label>
                <label className="cpm-admin-check">
                  <input type="checkbox" checked={overwriteDuplicates} onChange={e => setOverwriteDuplicates(e.target.checked)} />
                  Overwrite existing (duplicates)
                </label>
              </div>
            </Part>
            <Part title="Rows">
              <div className="cpm-admin-scroll">
                <table className="cpm-table">
                  <thead><tr>{['#', 'Status', 'Username', 'Email', 'Role', 'Notes'].map(h => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {validation.rows.map(r => {
                      const [tone, glyph] = STATUS[r.status] ?? ['muted', '·'];
                      const notes = [...r.errors, ...r.warnings];
                      return (
                        <tr key={r.row_number}>
                          <td>{r.row_number}</td>
                          <td><TonePill tone={tone} glyph={glyph}>{r.status}</TonePill></td>
                          <td>{String(r.data.username ?? '')}</td>
                          <td>{String(r.data.email ?? '')}</td>
                          <td>{String(r.data.role ?? '')}</td>
                          <td>{notes.join('; ') || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Part>
          </>
        )}

        {step === 'result' && result && (
          <>
            <Counts testId="bulk-result" items={[[result.totalProcessed, 'Processed'], [result.created, 'Created'],
              [result.updated, 'Updated'], [result.skipped, 'Skipped']]} />
            {result.errors.length > 0 && (
              <div className="cpm-admin-scroll">
                {result.errors.map((e, i) => <p key={i} className="cpm-field__error">Row {e.row}: {e.error}</p>)}
              </div>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
};

export default BulkImportModal;
