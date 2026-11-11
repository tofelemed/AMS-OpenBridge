/**
 * CHG-168 (owner review): Bulk import › Review. The counts on one line; the table says exactly what WILL be sent, derived paths
 * included, so a wrong location is caught here rather than after N loops are activated. Status sits before the paths (it was
 * cut off at the dialog's right edge at 1440 px, so the reason a row is red was out of view); the paths read under the
 * location. 100 rows previewed, every row validated.
 */
import React from 'react';
import type { CsvRow } from '../../csvImport';
import { MAX_BULK_LOOPS, PREVIEW_LIMIT } from '../../csvImport';
import { TonePill } from '../../shared';
import { importCounts, pathsText, plural, resumesNote, updatesNote } from './importText';

const Status: React.FC<{ row: CsvRow }> = ({ row }) => {
  const why = row.problems.length > 0 ? row.problems : row.warnings;
  return (
    <>
      {row.problems.length > 0
        ? <TonePill tone="bad" glyph="✕">Needs correction</TonePill>
        : row.existing ? <TonePill tone="warn" glyph="↻">Updates existing</TonePill> : <TonePill tone="good" glyph="✓">Ready</TonePill>}
      {why.length > 0 && <div className={row.problems.length > 0 ? 'cpm-event-row__sub' : 'cpm-event-row__sub cpm-tone-warn'}>{why.join('; ')}</div>}
    </>
  );
};

export const ImportReviewTab: React.FC<{
  rows: CsvRow[];
  /** Tags of rows that match a loop not monitored now: importing turns its monitoring back on. */
  resumes?: string[];
}> = ({ rows, resumes = [] }) => {
  const c = importCounts(rows);
  const resumed = resumesNote(resumes);
  return (
    <>
      <p className="cpm-reg-import-line" data-testid="cpm-import-summary">
        <strong>{plural(c.rows, 'row', 'rows')}:</strong>{' '}
        {c.ready > 0 && <><TonePill tone="good" glyph="✓">{c.ready} ready</TonePill>{updatesNote(c.updates)}</>}
        {c.ready > 0 && c.fix > 0 && ' · '}
        {c.fix > 0 && <TonePill tone="bad" glyph="✕">{c.fix} {c.fix === 1 ? 'needs' : 'need'} correction</TonePill>}
        {'.'}
        {c.ready > 0 && c.fix > 0 && <span className="cpm-copy"> Rows that need correction are skipped.</span>}
      </p>
      {resumed && <p className="cpm-event-row__sub cpm-tone-warn" role="note">{resumed}</p>}
      {c.ready > MAX_BULK_LOOPS && (
        <p className="cpm-field__error">{c.ready} rows exceeds the {MAX_BULK_LOOPS.toLocaleString()}-per-import limit — split the file.</p>
      )}
      {c.ready === 0 && (
        <p className="cpm-field__error">No row can be imported yet. Fix the problems listed below, then go back and paste or upload the corrected file.</p>
      )}
      <div className="cpm-csv-preview">
        <table>
          <thead><tr><th>Loop</th><th>Location</th><th>Type</th><th>Status</th><th>PV / SP / OP / MODE / VP</th></tr></thead>
          <tbody>
            {rows.slice(0, PREVIEW_LIMIT).map((r, i) => {
              const p = pathsText(r);
              const loc = [r.location.site, r.location.area, r.location.unit].filter(Boolean).join(' / ');
              return (
                <tr key={`${r.tag}-${i}`} className={r.problems.length ? 'is-bad' : undefined}>
                  <td className="cpm-mono">{r.tag || '—'}</td>
                  <td className="cpm-reg-import-loc" title={loc || undefined}>{loc || '—'}</td>
                  <td>{r.loopType || '—'}</td>
                  <td className="cpm-reg-import-status"><Status row={r} /></td>
                  <td className="cpm-mono cpm-reg-import-paths" title={p.full || undefined}>{p.short}</td>
                </tr>
              );
            })}
            {rows.length > PREVIEW_LIMIT && (
              <tr>
                <td colSpan={5} className="cpm-copy">
                  … and {rows.length - PREVIEW_LIMIT} more row(s) not shown. All rows are still validated and imported — the line above counts the whole file.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
};

export default ImportReviewTab;
