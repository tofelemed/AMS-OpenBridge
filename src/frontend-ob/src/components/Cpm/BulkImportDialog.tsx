'use client';

/**
 * CPLM Phase 7 — U10 Loop Registry: bulk CSV import. Parse, validate against the plant model, preview, activate; validation is
 * entirely client-side, so the review is a real gate: nothing is sent until Activate.
 *
 * CHG-168 (owner review, the approved sample docs/theme/redesign/samples/loop-registry-proposal.html): a dialog titled
 * "Bulk import" with tabs File · Review · Activate and "Next: X →" (forward only through Next; back by a tab or Back, never
 * while importing or after the result); each count said once; the step name not repeated (it was in the title and the pills);
 * Status before the paths. The file checks, every row check, the 5,000-row bound, the unmodelled override and the ONE
 * bulk-activate request with its payload are as before.
 */
import React, { useMemo, useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog } from '../../ui/Dialog';
import { Tabs, tabPanelProps } from '../../ui/Tabs';
import { useCpmRegistryContract } from '../../hooks/useCpm';
import { bulkActivateLoops } from '../../api/cpmApi';
import { ApiError } from '../../api/apiFetch';
import type { CpmLoop, CpmTagMapEntry } from '../../api/cpmApi';
import { downloadTextFile } from '../../utils/csv';
import { SIGNAL_ROLES, usePlantLocations } from './plantLocation';
import { MAX_BULK_LOOPS, MAX_CSV_BYTES, parseCsv, templateCsv } from './csvImport';
import ReasonedButton from './ReasonedButton';
import { ImportFileTab } from './registry/import/ImportFileTab';
import { ImportReviewTab } from './registry/import/ImportReviewTab';
import { ImportActivateTab, type ImportResult, type ImportStats } from './registry/import/ImportActivateTab';
import { importCounts, plural } from './registry/import/importText';

const TABS = [{ value: 'file', label: 'File' }, { value: 'review', label: 'Review' }, { value: 'activate', label: 'Activate' }] as const;

export const BulkImportDialog: React.FC<{ existing: CpmLoop[]; onClose: () => void }> = ({ existing, onClose }) => {
  const [text, setText] = useState('');
  const [step, setStep] = useState(0);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [importing, setImporting] = useState(false);
  // G-07: the server rejects site/area/unit chains that are not in the asset model; this dialog-level override forwards
  // allowUnmodelledLocation on every row — an explicit choice, defaulting to the safe refusal.
  const [allowUnmodelled, setAllowUnmodelled] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const qc = useQueryClient();
  const locations = usePlantLocations();
  const contract = useCpmRegistryContract();
  const loopTypes = useMemo(() => contract.data?.loopTypes ?? [], [contract.data]);

  /** Read a dropped/chosen file into the textarea, which stays the single source of truth so an uploaded file can still be corrected in place. */
  const loadFile = async (file: File | undefined) => {
    setFileError(null);
    if (!file) return;
    if (!/\.(csv|txt)$/i.test(file.name)) { setFileError(`"${file.name}" is not a .csv file`); return; }
    if (file.size > MAX_CSV_BYTES) {
      setFileError(`"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB — larger than the ${MAX_CSV_BYTES / 1024 / 1024} MB limit. Split it into smaller batches.`);
      return;
    }
    try {
      setText(await file.text());
      setFileName(file.name);
      setResults(null);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Could not read the file');
    }
  };

  const parsed = useMemo(() => parseCsv(text, existing, locations.data, loopTypes), [text, existing, locations.data, loopTypes]);
  const valid = parsed.rows.filter(r => r.problems.length === 0);
  const counts = importCounts(parsed.rows);

  const runImport = async () => {
    // ONE request for the whole file: the gateway counts a mutation per request (120/minute/user), and the server can only
    // batch its own reads, writes and asset projection when it receives the whole set (~8 ms per loop for 1000, ~33 ms row-by-row).
    setImporting(true);
    setResults(null);
    setWarning(null);
    setStats(null);
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
      setResults(result.results.map(r => ({ tag: r.loopId, ok: r.ok, message: r.ok ? undefined : (r.error ?? r.code ?? 'Failed') })));
      setWarning(result.warning ?? null);
      setStats({ activated: result.activated, failed: result.failed, elapsedMs: result.elapsedMs });
    } catch (err) {
      // A whole-batch failure (transport, timeout, 413) is reported against every row rather than leaving the dialog blank.
      const message = err instanceof ApiError
        ? `${err.message}${err.status === 413 ? ' — split the file into smaller batches.' : ''}`
        : err instanceof Error ? err.message : String(err);
      setResults(valid.map(row => ({ tag: row.tag, ok: false, message })));
      setStats(null);
    } finally {
      void qc.invalidateQueries({ queryKey: ['cpm', 'loops'] });
      setImporting(false);
    }
  };

  const sourceReady = text.trim() !== '' && parsed.missing.length === 0 && parsed.rows.length > 0;
  const tooMany = valid.length > MAX_BULK_LOOPS;
  const failed = results?.filter(r => !r.ok) ?? [];
  const locked = importing || !!results;
  const nextWhy = step === 0
    ? (!sourceReady ? 'Provide the registry rows, with every required column, first' : null)
    : valid.length === 0 ? 'No row is ready to import — fix the rows marked above'
      : tooMany ? `Too many rows for one import (at most ${MAX_BULK_LOOPS})` : null;
  const activateWhy = valid.length === 0 ? 'No row is ready to import' : tooMany ? `Too many rows for one import (at most ${MAX_BULK_LOOPS})` : null;
  const reimport = () => { setResults(null); setStats(null); setWarning(null); setStep(0); };

  const footer = results
    ? (
      <>
        {failed.length > 0 && <ObcButton variant="normal" onClick={reimport}>Fix and re-import</ObcButton>}
        <ObcButton variant="raised" onClick={onClose}>Close</ObcButton>
      </>
    ) : (
      <>
        <ObcButton variant="flat" disabled={importing} onClick={onClose}>Cancel</ObcButton>
        {step > 0 && <ObcButton variant="normal" disabled={importing} onClick={() => setStep(step - 1)}>Back</ObcButton>}
        {step < 2
          ? <ReasonedButton variant="raised" disabled={nextWhy !== null} reason={nextWhy} onClick={() => setStep(step + 1)}>Next: {TABS[step + 1].label} {'→'}</ReasonedButton>
          : (
            <ReasonedButton variant="raised" disabled={activateWhy !== null || importing} reason={activateWhy} onClick={() => { void runImport(); }}>
              {importing ? 'Activating…' : `Activate ${plural(valid.length, 'loop', 'loops')}`}
            </ReasonedButton>
          )}
      </>
    );

  const tab = TABS[step].value;
  return (
    <Dialog open size="wide" title="Bulk import" onClose={() => { if (!importing) onClose(); }} footer={footer}>
      <div className="cpm-reg-editor">
        <Tabs idBase="cpm-bulk-import" label="Bulk import" value={tab}
          options={TABS.map((t, i) => ({ value: t.value, label: t.label, disabled: i > step || (locked && i !== step) }))}
          onChange={v => setStep(TABS.findIndex(t => t.value === v))} />
        <div className="cpm-reg-editor__panel" {...tabPanelProps('cpm-bulk-import', tab)}>
          {step === 0 && (
            <ImportFileTab text={text} onText={v => { setText(v); setResults(null); setFileName(null); }} fileName={fileName}
              fileError={fileError} onFile={f => { void loadFile(f); }} rows={parsed.rows.length} missing={parsed.missing}
              unknownColumns={parsed.unknownColumns} onTemplate={() => downloadTextFile('cplm-loop-registry-template.csv', templateCsv())} />
          )}
          {step === 1 && <ImportReviewTab rows={parsed.rows} />}
          {step === 2 && (
            <ImportActivateTab counts={counts} allowUnmodelled={allowUnmodelled} onAllowUnmodelled={setAllowUnmodelled}
              importing={importing} results={results} stats={stats} warning={warning} />
          )}
        </div>
      </div>
    </Dialog>
  );
};

export default BulkImportDialog;
