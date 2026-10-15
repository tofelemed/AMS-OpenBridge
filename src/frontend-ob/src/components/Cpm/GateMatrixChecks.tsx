'use client';

/**
 * CHG-098 (SME review 2 #24): the Performance page's DEFAULT gate view — "Checks behind the result".
 *
 * The full G0–G15 matrix asked an engineer to decode 17 code-only columns per loop to learn which two or three
 * gates decided its result. This view lists, per loop, only the gates that move the result (a failed check, an
 * unusable or excluded window, a symptom, a ruled-out fault) plus G15, which gives the verdict — each with its
 * readable name, its mark and its word. The full matrix stays one toggle away as the advanced view.
 *
 * Each check is a native button opening the same evidence as a matrix cell. The row set, paging and filters are
 * the matrix's (GateMatrix owns them), so switching views never changes which loops are shown.
 */
import React from 'react';
import type { CpmHeatmapLoop } from '../../api/cpmApi';
import { staleVerdictLine } from './verdictAge';
import { TonePill, toneFor } from './shared';
import { gateMark, gateName, resultGates } from './gateStatus';
import { diagnosisLabel } from './vocabulary';

/** The verdict cell both views share: the diagnosis pill and, when older, the last real verdict's age. */
export const ResultCell: React.FC<{ row: CpmHeatmapLoop }> = ({ row }) => {
  const stale = staleVerdictLine(row.lastVerdict);
  return (
    <>
      <TonePill tone={toneFor(row.diagnosis)}>{diagnosisLabel(row.diagnosis)}</TonePill>
      {/* audit F4: the row is the NEWEST window; an older verdict is named as older, with its age */}
      {stale && (
        <span className="cpm-event-row__sub cpm-matrix__stale" title={row.lastVerdict?.windowEnd ?? undefined}>{stale}</span>
      )}
    </>
  );
};

export interface GateMatrixChecksProps {
  rows: CpmHeatmapLoop[];
  orderedGateKeys: string[];
  selectedLoopId: string | null;
  onSelectLoop: (loopId: string) => void;
  onOpenLoop: (loopId: string) => void;
  onOpenGate: (loopId: string, gate: string) => void;
  inputFlagsOf?: (loopId: string) => string[];
}

export const GateMatrixChecks: React.FC<GateMatrixChecksProps> = ({
  rows, orderedGateKeys, selectedLoopId, onSelectLoop, onOpenLoop, onOpenGate, inputFlagsOf,
}) => (
  <div className="cpm-matrix-scroll">
    <table className="cpm-matrix cpm-checks" aria-label="Checks behind each loop's result">
      <thead>
        <tr>
          <th scope="col" className="cpm-matrix__loop">Loop</th>
          <th scope="col" className="cpm-checks__head">Checks behind the result</th>
          <th scope="col" className="cpm-matrix__result">Result</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => {
          const selected = selectedLoopId?.toLowerCase() === row.loopId.toLowerCase();
          const flags = inputFlagsOf?.(row.loopId);
          const gates = resultGates(row, orderedGateKeys, flags);
          const quiet = gates.length === 1 && gates[0] === 'G15';
          return (
            <tr key={row.loopId} className={selected ? 'cpm-matrix__row--selected' : undefined}>
              <th scope="row" className="cpm-matrix__loop">
                <button type="button" className="cpm-matrix__loop-btn" title="Open in the Loop Explorer"
                  aria-label={`Open ${row.loopId}, ${row.displayName}, in the Loop Explorer`}
                  onClick={() => onOpenLoop(row.loopId)}>
                  <strong>{row.loopId} ›</strong>
                  <span className="cpm-event-row__sub">{row.displayName}</span>
                </button>
              </th>
              <td className="cpm-checks__cell">
                <div className="cpm-checks__list">
                  {gates.map(k => {
                    const g = gateMark(row.gates[k], k, flags);
                    const name = gateName(k);
                    return (
                      <button key={k} type="button"
                        className={`cpm-gate-chip cpm-checks__chip cpm-matrix__cell--${g.tone}`}
                        data-gate={k}
                        title={`${k} ${name}: ${g.label}`}
                        aria-label={`${row.loopId}, ${k} ${name}: ${g.label}. Open the evidence.`}
                        onClick={() => { onSelectLoop(row.loopId); onOpenGate(row.loopId, k); }}>
                        <span className="cpm-gate-chip__glyph" aria-hidden data-mark={g.meaning}>{g.glyph}</span>
                        <span aria-hidden><span className="cpm-mono">{k}</span> {name}</span>
                        <span className="cpm-gate-chip__word" aria-hidden>· {g.word}</span>
                      </button>
                    );
                  })}
                  {quiet && <span className="cpm-event-row__sub">no other check moved this result</span>}
                </div>
              </td>
              <td className="cpm-matrix__result"><ResultCell row={row} /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

export default GateMatrixChecks;
