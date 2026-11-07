'use client';

/**
 * The Performance list, Findings view (CHG-098 #24, reshaped in CHG-135).
 *
 * One row per loop: its result, the checks behind that result ("G5 Symptom seen"), its evidence score and a link
 * to review it. Only gates that move the result are named; all 17 stay one toggle away in the gate matrix. A check is
 * a native button that opens the gate's dialog. The row set, paging and filters are the matrix's (GateMatrix owns
 * them), so switching views never changes which loops are shown.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { serviceName } from './loopName';
import type { CpmHeatmapLoop } from '../../api/cpmApi';
import { TonePill, toneFor } from './shared';
import { gateMark, gateName, resultGates } from './gateStatus';
import { diagnosisLabel } from './vocabulary';
import { evidenceScore } from './evidenceScore';
import { hasVerdict } from './metricAvailability';
import { investigationHref } from './cpaHref';

/** The verdict both views share: the diagnosis pill. An older verdict is named in the band and the dialog, not per row. */
export const ResultCell: React.FC<{ row: CpmHeatmapLoop }> = ({ row }) => (
  <TonePill tone={toneFor(row.diagnosis)}>{diagnosisLabel(row.diagnosis)}</TonePill>
);

export interface GateMatrixChecksProps {
  rows: CpmHeatmapLoop[];
  orderedGateKeys: string[];
  selectedLoopId: string | null;
  windowKind: string;
  onSelectLoop: (loopId: string) => void;
  onOpenLoop: (loopId: string) => void;
  onOpenGate: (loopId: string, gate: string) => void;
  inputFlagsOf?: (loopId: string) => string[];
}

export const GateMatrixChecks: React.FC<GateMatrixChecksProps> = ({
  rows, orderedGateKeys, selectedLoopId, windowKind, onSelectLoop, onOpenLoop, onOpenGate, inputFlagsOf,
}) => {
  const navigate = useNavigate();
  return (
    <div className="cpm-matrix-scroll cpm-matrix-scroll--list">
      <table className="cpm-matrix cpm-checks" aria-label="Findings by loop">
        <thead>
          <tr>
            <th scope="col" className="cpm-matrix__loop">Loop</th>
            <th scope="col" className="cpm-matrix__result">Result</th>
            <th scope="col" className="cpm-checks__head">Checks behind the result</th>
            <th scope="col">Evidence</th>
            <th scope="col">Review</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const selected = selectedLoopId?.toLowerCase() === row.loopId.toLowerCase();
            const flags = inputFlagsOf?.(row.loopId);
            // G15 is the verdict itself, and the Result column already says it
            const gates = resultGates(row, orderedGateKeys, flags).filter(k => k !== 'G15');
            const score = hasVerdict(row.diagnosis) ? evidenceScore(row.confidence) : null;
            return (
              <tr key={row.loopId} className={selected ? 'cpm-matrix__row--selected' : undefined}>
                <th scope="row" className="cpm-matrix__loop">
                  <button type="button" className="cpm-matrix__loop-btn" title="Open in the Loop Explorer"
                    onClick={() => onOpenLoop(row.loopId)}>
                    <strong>{row.loopId}</strong>
                    <span className="cpm-event-row__sub">{serviceName(row)}</span>
                  </button>
                </th>
                <td className="cpm-matrix__result"><ResultCell row={row} /></td>
                <td className="cpm-checks__cell">
                  <div className="cpm-checks__list">
                    {gates.map(k => {
                      const g = gateMark(row.gates[k], k, flags);
                      return (
                        <button key={k} type="button"
                          className={`cpm-gate-chip cpm-checks__chip cpm-matrix__cell--${g.tone}`}
                          data-gate={k}
                          title={`${k} ${gateName(k)}: ${g.label}`}
                          aria-label={`${k} ${g.word}, ${gateName(k)}: ${g.label}. ${row.loopId}. Open the evidence.`}
                          onClick={() => { onSelectLoop(row.loopId); onOpenGate(row.loopId, k); }}>
                          <span className="cpm-gate-chip__glyph" aria-hidden data-mark={g.meaning}>{g.glyph}</span>
                          <span aria-hidden><span className="cpm-mono">{k}</span> {g.word}</span>
                        </button>
                      );
                    })}
                  </div>
                </td>
                <td className="cpm-checks__score">{score ?? '—'}</td>
                <td>
                  <ObcButton variant="flat" title={`Review ${row.loopId} in Investigation`}
                    onClick={() => navigate(investigationHref(row.loopId, { kind: windowKind }))}>
                    Review ↗
                  </ObcButton>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default GateMatrixChecks;
