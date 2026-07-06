'use client';

import React, { useRef, useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Modal } from '../shared/Modal';
import { parseCsv, downloadTextFile } from '../../utils/csv';
import {
  validateBulkImport,
  executeBulkImport,
  getImportTemplate,
  extractApiError,
  type BulkValidationResult,
  type BulkImportResult,
} from '../../api/usersApi';
import { toast } from 'react-toastify';

const T = {
  blue: '#31598F', blueLight: '#EAF2FF', border: '#DDE3EA',
  text: '#1F2937', textSub: '#6B7280', textMuted: '#9CA3AF',
  success: '#2E8B57', successBg: '#ECFDF5',
  critical: '#D64545', criticalBg: '#FEF2F2',
  warning: '#B45309', warningBg: '#FFFBEB',
  radiusSm: '8px',
} as const;

type Step = 'upload' | 'preview' | 'result';

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  valid: { bg: T.successBg, color: T.success },
  warning: { bg: T.warningBg, color: T.warning },
  duplicate: { bg: T.blueLight, color: T.blue },
  error: { bg: T.criticalBg, color: T.critical },
};

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
    setStep('upload');
    setRows([]);
    setValidation(null);
    setResult(null);
    setError(null);
    setBusy(false);
    setSkipErrors(true);
    setOverwriteDuplicates(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const downloadTemplate = async () => {
    try {
      const csv = await getImportTemplate();
      downloadTextFile('user_import_template.csv', csv);
    } catch (e) {
      toast.error(extractApiError(e));
    }
  };

  const handleFile = async (file: File) => {
    setError(null);
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please choose a .csv file.');
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length === 0) {
        setError('The CSV file has no data rows.');
        return;
      }
      if (parsed.length > 5000) {
        setError('Maximum 5000 rows per import.');
        return;
      }
      setRows(parsed);
      setBusy(true);
      const v = await validateBulkImport(parsed);
      setValidation(v);
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

  const footer =
    step === 'preview' ? (
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
        <ObcButton variant="flat" onClick={() => reset()} disabled={busy}>Choose another file</ObcButton>
        <ObcButton variant="raised" onClick={() => void runImport()} disabled={busy || (validation?.validRows ?? 0) + (validation?.warningRows ?? 0) + (validation?.duplicateRows ?? 0) === 0}>
          {busy ? 'Importing…' : 'Import users'}
        </ObcButton>
      </div>
    ) : step === 'result' ? (
      <ObcButton variant="raised" onClick={handleClose}>Done</ObcButton>
    ) : undefined;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Bulk import users" subtitle="Upload a CSV to create or update accounts" width="720px" footer={footer}>
      {error && (
        <div role="alert" style={{ marginBottom: 12, padding: '8px 12px', borderRadius: T.radiusSm, background: T.criticalBg, color: T.critical, border: `1px solid ${T.critical}`, fontSize: 13 }}>
          {error}
        </div>
      )}

      {step === 'upload' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 14px', border: `1px solid ${T.border}`, borderRadius: T.radiusSm, background: T.blueLight }}>
            <div style={{ fontSize: 13, color: T.text }}>
              Columns: <code>username, email, full_name, password, role, is_active</code>. Roles: Admin, Engineer, Operator, Viewer.
            </div>
            <ObcButton variant="flat" onClick={() => void downloadTemplate()}>Download template</ObcButton>
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void handleFile(f); }}
            onClick={() => fileInputRef.current?.click()}
            style={{ cursor: 'pointer', border: `2px dashed ${T.border}`, borderRadius: T.radiusSm, padding: '32px', textAlign: 'center', color: T.textSub, background: '#FBFCFE' }}
          >
            {busy ? 'Validating…' : 'Click to choose a CSV file, or drag & drop it here'}
            <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }} />
          </div>
        </div>
      )}

      {step === 'preview' && validation && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Stat label="Total" value={validation.totalRows} />
            <Stat label="Valid" value={validation.validRows} tone="success" />
            <Stat label="Warnings" value={validation.warningRows} tone="warning" />
            <Stat label="Duplicates" value={validation.duplicateRows} tone="blue" />
            <Stat label="Errors" value={validation.errorRows} tone="critical" />
          </div>

          <div style={{ display: 'flex', gap: 16, fontSize: 13, color: T.text }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={skipErrors} onChange={(e) => setSkipErrors(e.target.checked)} />
              Skip error rows
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={overwriteDuplicates} onChange={(e) => setOverwriteDuplicates(e.target.checked)} />
              Overwrite existing (duplicates)
            </label>
          </div>

          <div style={{ maxHeight: 300, overflow: 'auto', border: `1px solid ${T.border}`, borderRadius: T.radiusSm }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ position: 'sticky', top: 0, background: '#F6F8FB' }}>
                  {['#', 'Status', 'Username', 'Email', 'Role', 'Notes'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: T.textSub, borderBottom: `1px solid ${T.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {validation.rows.map((r) => {
                  const st = STATUS_STYLE[r.status];
                  const notes = [...r.errors, ...r.warnings];
                  return (
                    <tr key={r.row_number} style={{ borderBottom: `1px solid ${T.border}` }}>
                      <td style={{ padding: '5px 8px', color: T.textMuted }}>{r.row_number}</td>
                      <td style={{ padding: '5px 8px' }}>
                        <span style={{ padding: '1px 7px', borderRadius: 6, fontSize: 10.5, fontWeight: 700, background: st.bg, color: st.color }}>{r.status}</span>
                      </td>
                      <td style={{ padding: '5px 8px', color: T.text }}>{String(r.data.username ?? '')}</td>
                      <td style={{ padding: '5px 8px', color: T.textSub }}>{String(r.data.email ?? '')}</td>
                      <td style={{ padding: '5px 8px', color: T.textSub }}>{String(r.data.role ?? '')}</td>
                      <td style={{ padding: '5px 8px', color: notes.length ? T.warning : T.textMuted }}>{notes.join('; ') || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === 'result' && result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Stat label="Processed" value={result.totalProcessed} />
            <Stat label="Created" value={result.created} tone="success" />
            <Stat label="Updated" value={result.updated} tone="blue" />
            <Stat label="Skipped" value={result.skipped} tone="warning" />
          </div>
          {result.errors.length > 0 && (
            <div style={{ maxHeight: 200, overflow: 'auto', border: `1px solid ${T.border}`, borderRadius: T.radiusSm, padding: 8, fontSize: 12, color: T.critical }}>
              {result.errors.map((e, i) => (
                <div key={i}>Row {e.row}: {e.error}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

const Stat: React.FC<{ label: string; value: number; tone?: 'success' | 'warning' | 'critical' | 'blue' }> = ({ label, value, tone }) => {
  const color = tone === 'success' ? T.success : tone === 'warning' ? T.warning : tone === 'critical' ? T.critical : tone === 'blue' ? T.blue : T.text;
  return (
    <div style={{ minWidth: 84, padding: '8px 12px', border: `1px solid ${T.border}`, borderRadius: T.radiusSm, background: '#FFFFFF' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: T.textSub }}>{label}</div>
    </div>
  );
};

export default BulkImportModal;
