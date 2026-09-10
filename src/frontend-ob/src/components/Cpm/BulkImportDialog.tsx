'use client';

/**
 * Bulk CSV import: parse, validate against the plant model, preview, activate.
 */
'use client';

/**
 * CPLM Phase 7 — U10 Loop Registry.
 * CPA-prototype IA parity: registry table + profile detail aside + 5-step
 * add-loop wizard + bulk CSV import, wired to the real onboarding API.
 * The prototype's "draft" concept maps to our immediate activate + readiness
 * report (the wizard shows readiness as its post-save validation step).
 */
import React, { useMemo, useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObcProgressBar } from '@oicl/openbridge-webcomponents-react/components/progress-bar/progress-bar';
import { PanelHead, TonePill } from './shared';
import { useCpmRegistryContract } from '../../hooks/useCpm';
import { bulkActivateLoops } from '../../api/cpmApi';
import { ApiError } from '../../api/apiFetch';
import type { CpmLoop, CpmTagMapEntry } from '../../api/cpmApi';
import { useQueryClient } from '@tanstack/react-query';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { SIGNAL_ROLES, usePlantLocations } from './plantLocation';


// ── bulk CSV import ────────────────────────────────────────────────────────
import {
  CSV_HEADERS, IMPORT_STEPS, MAX_BULK_LOOPS, MAX_CSV_BYTES, PREVIEW_LIMIT,
  REQUIRED_COLUMNS, parseCsv,
} from './csvImport';

export const BulkImportDialog: React.FC<{ existing: CpmLoop[]; onClose: () => void }> = ({ existing, onClose }) => {
  const dialogRef2 = useDialogA11y<HTMLDivElement>(onClose);
  const [text, setText] = useState('');
  const [results, setResults] = useState<{ tag: string; ok: boolean; message?: string }[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const qc = useQueryClient();

  const [step, setStep] = useState(0);
  // G-07: the server rejects site/area/unit chains that are not in the asset
  // model; this dialog-level override forwards allowUnmodelledLocation on every
  // row — an explicit choice, defaulting to the safe refusal.
  const [allowUnmodelled, setAllowUnmodelled] = useState(false);
  const [importWarning, setImportWarning] = useState<string | null>(null);
  const [importStats, setImportStats] = useState<{ activated: number; failed: number; elapsedMs: number } | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const locations = usePlantLocations();
  const contract = useCpmRegistryContract();
  const loopTypes = useMemo(() => contract.data?.loopTypes ?? [], [contract.data]);

  /** Read a dropped/chosen file into the textarea, which stays the single source
   *  of truth so an uploaded file can still be corrected in place. */
  const loadFile = async (file: File | undefined) => {
    setFileError(null);
    if (!file) return;
    if (!/\.(csv|txt)$/i.test(file.name)) {
      setFileError(`"${file.name}" is not a .csv file`);
      return;
    }
    if (file.size > MAX_CSV_BYTES) {
      setFileError(
        `"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB — larger than the ${MAX_CSV_BYTES / 1024 / 1024} MB limit. Split it into smaller batches.`);
      return;
    }
    try {
      const content = await file.text();
      setText(content);
      setFileName(file.name);
      setResults(null);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Could not read the file');
    }
  };

  const parsed = useMemo(
    () => parseCsv(text, existing, locations.data, loopTypes),
    [text, existing, locations.data, loopTypes]);
  const valid = parsed.rows.filter(r => r.problems.length === 0);

  const downloadTemplate = () => {
    // Two rows on purpose: the first leaves the signal columns blank (paths are
    // derived from site/area/unit + tag) and declares only a PV range; the second
    // spells the paths out and declares both ranges.
    const sample = [
      CSV_HEADERS.join(','),
      '45FIC-109,Hydrogen recycle flow,houston,,crude1,FIC,high,,,,,,,0,1200,,',
      'TIC20501,Reactor bed temperature,houston,,crude1,TIC,medium,houston/crude1/tic20501.pv,houston/crude1/tic20501.sp,houston/crude1/tic20501.op,houston/crude1/tic20501.mode,houston/crude1/tic20501.vp,,0,250,0,100',
    ].join('\n');
    const blob = new Blob([sample], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cplm-loop-registry-template.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const runImport = async () => {
    // ONE request for the whole file. Two reasons it is not N calls: the gateway
    // counts a mutation per request (120/minute/user), so a per-row import
    // stalled at 120 loops; and the server can only batch its own reads, writes
    // and asset projection when it receives the whole set — measured at ~8 ms per
    // loop for 1000, against ~33 ms row-by-row.
    setImporting(true);
    setResults(null);
    setImportWarning(null);
    setImportStats(null);
    setImportProgress({ done: 0, total: valid.length });

    const loops = valid.map(row => ({
      loopId: row.tag,
      displayName: row.values['service'],
      site: row.location.site,
      area: row.location.area || null,
      unit: row.location.unit || null,
      loopType: row.loopType,
      criticality: row.criticality || null,
      tags: SIGNAL_ROLES
        .filter(role => row.paths[role].path)
        .map(role => ({ signalRole: role.toUpperCase(), unsPath: row.paths[role].path })) as CpmTagMapEntry[],
      thresholdProfileId: row.values['profile'] || null,
      enableMonitoring: true,
      engineering: row.engineering,
      allowUnmodelledLocation: allowUnmodelled,
    }));

    try {
      const result = await bulkActivateLoops(loops);
      setResults(result.results.map(r => ({
        tag: r.loopId,
        ok: r.ok,
        message: r.ok ? undefined : (r.error ?? r.code ?? 'Failed'),
      })));
      setImportWarning(result.warning ?? null);
      setImportStats({ activated: result.activated, failed: result.failed, elapsedMs: result.elapsedMs });
    } catch (err) {
      // A whole-batch failure (transport, timeout, 413) is reported against every
      // row rather than silently leaving the dialog blank.
      const message = err instanceof ApiError
        ? `${err.message}${err.status === 413 ? ' — split the file into smaller batches.' : ''}`
        : err instanceof Error ? err.message : String(err);
      setResults(valid.map(row => ({ tag: row.tag, ok: false, message })));
      setImportStats(null);
    } finally {
      void qc.invalidateQueries({ queryKey: ['cpm', 'loops'] });
      setImportProgress(null);
      setImporting(false);
    }
  };

  const sourceReady = text.trim() !== '' && parsed.missing.length === 0 && parsed.rows.length > 0;
  const tooMany = valid.length > MAX_BULK_LOOPS;
  const failedRows = results?.filter(r => !r.ok) ?? [];

  return (
    <div className="cpm-modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !importing) onClose(); }}>
      <div ref={dialogRef2} className="cpm-modal" role="dialog" aria-modal="true" tabIndex={-1} aria-label="Import loops from CSV">
        <PanelHead
          eyebrow="Bulk registry workflow"
          title={`Import loops from CSV — ${IMPORT_STEPS[step].title}`}
          right={step === 0
            ? <ObcButton variant="normal" onClick={downloadTemplate}>Download template</ObcButton>
            : undefined} />

        <div className="cpm-wizard-steps">
          {IMPORT_STEPS.map((s, i) => (
            <button
              key={s.title}
              type="button"
              className={`cpm-wizard-step${i === step ? ' cpm-wizard-step--active' : ''}${i < step ? ' cpm-wizard-step--done' : ''}`}
              // Only backwards, and never while the import is in flight.
              onClick={() => { if (i < step && !importing && !results) setStep(i); }}
            >
              {i < step ? '✓ ' : `${i + 1}. `}{s.title}
            </button>
          ))}
        </div>

        {/* ── Step 1 · Source ─────────────────────────────────────────── */}
        {step === 0 && (
          <>
            <p className="cpm-copy">
              Upload the registry export or paste it below. Required columns:{' '}
              <span className="cpm-mono">{REQUIRED_COLUMNS.join(', ')}</span>. Leave the signal
              columns blank to derive{' '}
              <span className="cpm-mono">site/[area/]unit/&lt;tag&gt;.&lt;role&gt;</span> — VP is only
              mapped when given explicitly.
            </p>

            <div
              className={`cpm-csv-drop${dragging ? ' cpm-csv-drop--over' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => {
                e.preventDefault();
                setDragging(false);
                void loadFile(e.dataTransfer.files?.[0]);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                style={{ display: 'none' }}
                onChange={e => { void loadFile(e.target.files?.[0]); e.target.value = ''; }}
              />
              <ObcButton variant="raised" onClick={() => fileInputRef.current?.click()}>
                Choose CSV file
              </ObcButton>
              <span className="cpm-copy">or drop a .csv here — or paste below</span>
              {fileName && (
                <span className="cpm-pill cpm-pill--good" title={fileName}>
                  {fileName} · {parsed.rows.length} row(s)
                </span>
              )}
            </div>
            {fileError && <p className="cpm-field__error">{fileError}</p>}

            <label className="cpm-field" style={{ minWidth: 0 }}>
              <span className="cpm-field__label">
                CSV content{fileName ? ` (loaded from ${fileName}, editable)` : ''}
              </span>
              <textarea
                className="cpm-textarea cpm-mono"
                rows={10}
                value={text}
                onChange={e => { setText(e.target.value); setResults(null); setFileName(null); }}
                placeholder={CSV_HEADERS.join(',')}
              />
            </label>

            {text && parsed.missing.length > 0 && (
              <p className="cpm-field__error">Missing required columns: {parsed.missing.join(', ')}</p>
            )}
            {text && parsed.unknownColumns.length > 0 && (
              <p className="cpm-field__error">
                Unrecognised column(s): {parsed.unknownColumns.join(', ')} — values in them are ignored.
              </p>
            )}
            {text.trim() !== '' && parsed.missing.length === 0 && parsed.rows.length === 0 && (
              <p className="cpm-field__error">The file has a header row but no data rows.</p>
            )}
          </>
        )}

        {/* ── Step 2 · Review ─────────────────────────────────────────── */}
        {step === 1 && (
          <>
            <div className="cpm-csv-summary">
              <KpiSummary caption="Rows detected" value={parsed.rows.length} />
              <KpiSummary caption="Ready" value={valid.length} tone="good" />
              <KpiSummary caption="Need correction" value={parsed.rows.length - valid.length}
                tone={parsed.rows.length - valid.length > 0 ? 'bad' : 'good'} />
              <KpiSummary caption="Existing (will update)" value={parsed.rows.filter(r => r.existing).length} tone="warn" />
            </div>

            {tooMany && (
              <p className="cpm-field__error">
                {valid.length} rows exceeds the {MAX_BULK_LOOPS.toLocaleString()}-per-import limit —
                split the file.
              </p>
            )}
            {valid.length === 0 && (
              <p className="cpm-field__error">
                No row can be imported yet. Fix the problems listed below, then go back and paste
                or upload the corrected file.
              </p>
            )}
            {parsed.rows.length > valid.length && valid.length > 0 && (
              <p className="cpm-copy cpm-tone-warn">
                {parsed.rows.length - valid.length} row(s) will be skipped. Only the {valid.length} ready
                row(s) are imported.
              </p>
            )}

            {/* Exactly what WILL be sent — derived paths included — so a wrong
                location is caught here rather than after N loops are activated. */}
            <div className="cpm-csv-preview">
              <table>
                <thead>
                  <tr>
                    <th>Loop</th><th>Location</th><th>Type</th><th>PV / SP / OP / MODE / VP</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, PREVIEW_LIMIT).map((r, i) => (
                    <tr key={`${r.tag}-${i}`} className={r.problems.length ? 'is-bad' : undefined}>
                      <td className="cpm-mono">{r.tag || '—'}</td>
                      <td>{[r.location.site, r.location.area, r.location.unit].filter(Boolean).join(' / ') || '—'}</td>
                      <td>{r.loopType || '—'}</td>
                      <td className="cpm-mono">
                        {SIGNAL_ROLES.map(role => r.paths[role].path).filter(Boolean).join('  ·  ') || '—'}
                      </td>
                      <td>
                        {r.problems.length > 0
                          ? <TonePill tone="bad">{r.problems.join('; ')}</TonePill>
                          : <TonePill tone={r.existing ? 'warn' : 'good'}>
                              {r.existing ? 'Updates existing' : 'Ready'}
                            </TonePill>}
                        {r.problems.length === 0 && r.warnings.length > 0 && (
                          <div className="cpm-copy cpm-tone-warn">{r.warnings.join('; ')}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {parsed.rows.length > PREVIEW_LIMIT && (
                    <tr>
                      <td colSpan={5} className="cpm-copy">
                        … and {parsed.rows.length - PREVIEW_LIMIT} more row(s) not shown. All rows are
                        still validated and imported — the counters above cover the whole file.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── Step 3 · Activate ───────────────────────────────────────── */}
        {step === 2 && (
          <>
            {!results && !importing && (
              <>
                <p className="cpm-copy">
                  Ready to onboard <strong>{valid.length}</strong> loop(s) into the registry. Each one
                  gets its role mappings and a UNS signal asset per stored role, so its PV/SP/OP
                  resolve and trend immediately.
                </p>
                <div className="cpm-csv-summary">
                  <KpiSummary caption="To activate" value={valid.length} tone="good" />
                  <KpiSummary caption="New" value={valid.filter(r => !r.existing).length} />
                  <KpiSummary caption="Updating existing" value={valid.filter(r => r.existing).length} tone="warn" />
                  <KpiSummary caption="Skipped" value={parsed.rows.length - valid.length}
                    tone={parsed.rows.length - valid.length > 0 ? 'bad' : 'good'} />
                </div>
                <label className="cpm-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
                  <input type="checkbox" checked={allowUnmodelled}
                    onChange={e => setAllowUnmodelled(e.target.checked)} />
                  <span className="cpm-copy">
                    Allow locations that are not in the asset model. Rows whose site/area/unit is
                    unmodelled are otherwise rejected (their signals would sit outside the plant
                    tree and resolve against nothing).
                  </span>
                </label>
              </>
            )}

            {importing && (
              <div style={{ margin: '18px 0' }}>
                {/* The whole file goes in ONE request, so there is no per-row
                    signal to report — an indeterminate bar is the honest shape. */}
                <ObcProgressBar type="linear" mode="indeterminate" style={{ width: '100%' }} />
                <p className="cpm-copy" style={{ marginTop: 10 }} role="status">
                  Activating {importProgress?.total ?? valid.length} loop(s)… this is a single
                  request; leaving the dialog open until it finishes.
                </p>
              </div>
            )}

            {results && (
              <>
                <div
                  role="status"
                  className={`cpm-banner${failedRows.length === 0 ? ' cpm-banner--good' : ' cpm-banner--bad'}`}
                >
                  <span style={{ fontSize: '1.2rem' }}>{failedRows.length === 0 ? '✓' : '✗'}</span>
                  <div>
                    <strong>
                      {failedRows.length === 0
                        ? `All ${importStats?.activated ?? results.length} loop(s) activated`
                        : `${importStats?.activated ?? 0} activated, ${failedRows.length} failed`}
                    </strong>
                    {importStats && (
                      <div className="cpm-copy">
                        Completed in {(importStats.elapsedMs / 1000).toFixed(1)}s.
                      </div>
                    )}
                  </div>
                </div>

                {importWarning && <p className="cpm-field__error">{importWarning}</p>}

                {/* Failures first and in full; successes are collapsed to a count
                    so a 1000-row success does not bury the three that failed. */}
                {failedRows.length > 0 && (
                  <div className="cpm-csv-preview">
                    <table>
                      <thead><tr><th>Loop</th><th>Why it failed</th></tr></thead>
                      <tbody>
                        {failedRows.map(r => (
                          <tr key={r.tag} className="is-bad">
                            <td className="cpm-mono">{r.tag}</td>
                            <td>{r.message ?? 'Failed'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── Footer navigation ───────────────────────────────────────── */}
        <div className="cpm-wizard-footer">
          <ObcButton variant="normal" onClick={onClose} disabled={importing}>
            {results ? 'Close' : 'Cancel'}
          </ObcButton>

          {!results && step > 0 && (
            <ObcButton variant="normal" disabled={importing} onClick={() => setStep(step - 1)}>
              ← Back
            </ObcButton>
          )}

          <span className="cpm-copy">
            {step === 0 && (parsed.rows.length > 0 ? `${parsed.rows.length} row(s) detected` : '')}
            {step === 1 && `${valid.length} of ${parsed.rows.length} row(s) ready`}
            {step === 2 && !results && !importing && `${valid.length} row(s) will be activated`}
          </span>

          {step < 2 && (
            <ObcButton
              variant="raised"
              disabled={step === 0 ? !sourceReady : valid.length === 0 || tooMany}
              onClick={() => setStep(step + 1)}
            >
              Next →
            </ObcButton>
          )}
          {step === 2 && !results && (
            <ObcButton variant="raised" disabled={valid.length === 0 || tooMany || importing} onClick={runImport}>
              {importing ? 'Activating…' : `Submit & activate ${valid.length} loop(s)`}
            </ObcButton>
          )}
          {step === 2 && results && failedRows.length > 0 && (
            <ObcButton variant="normal" onClick={() => { setResults(null); setImportStats(null); setImportWarning(null); setStep(0); }}>
              Fix and re-import
            </ObcButton>
          )}
        </div>
      </div>
    </div>
  );
};

const KpiSummary: React.FC<{ caption: string; value: number; tone?: 'good' | 'warn' | 'bad' }> = ({ caption, value, tone }) => (
  <div className={`cpm-kpi${tone ? ` cpm-kpi--${tone}` : ''}`}>
    <span className="cpm-kpi__caption">{caption}</span>
    <span className="cpm-kpi__value">{value}</span>
  </div>
);


export default BulkImportDialog;
