/**
 * CHG-168 (owner review): Bulk import › Activate. One line says what will happen ("2 loops to activate: 1 new, 1 updates an
 * existing loop · 1 row skipped", what each loop gets behind the ?); Allow locations that are not in the asset model (G-07,
 * the reason behind its ?). The whole file goes in ONE request, so the progress is an indeterminate bar. The result says the
 * counts once, then the failures first and in full; successes are a count, so a 1000-row success does not bury three failures.
 */
import React from 'react';
import { ObcProgressBar } from '@oicl/openbridge-webcomponents-react/components/progress-bar/progress-bar';
import { Toggletip } from '../../../../ui/Toggletip';
import { TonePill } from '../../shared';
import { activateLine, plural, type ImportCounts } from './importText';

export interface ImportResult { tag: string; ok: boolean; message?: string }
export interface ImportStats { activated: number; failed: number; elapsedMs: number }

export const ImportActivateTab: React.FC<{
  counts: ImportCounts;
  allowUnmodelled: boolean;
  onAllowUnmodelled: (v: boolean) => void;
  importing: boolean;
  results: ImportResult[] | null;
  stats: ImportStats | null;
  warning: string | null;
}> = ({ counts, allowUnmodelled, onAllowUnmodelled, importing, results, stats, warning }) => {
  const failed = results?.filter(r => !r.ok) ?? [];
  if (importing) {
    return (
      <div className="cpm-reg-import-progress">
        <ObcProgressBar type="linear" mode="indeterminate" />
        <p className="cpm-copy" role="status">
          Activating {counts.ready} loop(s)… this is a single request; leaving the dialog open until it finishes.
        </p>
      </div>
    );
  }
  if (results) {
    return (
      <>
        <p className="cpm-reg-import-line" role="status">
          {failed.length === 0
            ? <TonePill tone="good" glyph="✓">{`All ${plural(stats?.activated ?? results.length, 'loop', 'loops')} activated`}</TonePill>
            : <TonePill tone="warn" glyph="!">{`${stats?.activated ?? 0} activated, ${failed.length} failed`}</TonePill>}
          {stats && <> <span className="cpm-copy">Completed in {(stats.elapsedMs / 1000).toFixed(1)} s.</span></>}
        </p>
        {warning && <p className="cpm-field__error">{warning}</p>}
        {failed.length > 0 && (
          <div className="cpm-csv-preview">
            <table>
              <thead><tr><th>Loop</th><th>Why it failed</th></tr></thead>
              <tbody>
                {failed.map(r => <tr key={r.tag} className="is-bad"><td className="cpm-mono">{r.tag}</td><td>{r.message ?? 'Failed'}</td></tr>)}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  }
  return (
    <>
      <div className="cpm-title-row cpm-reg-import-line">
        <span><strong>{plural(counts.ready, 'loop', 'loops')} to activate:</strong> {activateLine(counts)}</span>
        <Toggletip variant="how-to" label="Activation">
          <p>Each one gets its role mappings and a UNS signal asset per stored role, so its PV/SP/OP resolve and trend immediately.</p>
        </Toggletip>
      </div>
      <span className="cpm-title-row">
        <label className="cpm-check">
          <input type="checkbox" checked={allowUnmodelled} onChange={e => onAllowUnmodelled(e.target.checked)} />
          <span>Allow locations that are not in the asset model</span>
        </label>
        <Toggletip variant="how-to" label="Unmodelled locations">
          <p>Rows whose site/area/unit is unmodelled are otherwise rejected: their signals would sit outside the plant tree and resolve against nothing.</p>
        </Toggletip>
      </span>
    </>
  );
};

export default ImportActivateTab;
