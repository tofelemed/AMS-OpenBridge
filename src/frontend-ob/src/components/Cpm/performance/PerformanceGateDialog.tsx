/**
 * A gate of one Performance row, opened in the shared gate dialog (CHG-135; it replaced the column docked beside
 * the matrix). The status comes from the same row as the cell that was clicked, through `gateMark`, so the two always
 * agree. The loop's result sits beside it: a gate can differ from the result, and an older verdict is named as last,
 * never as current. The rest of the evidence is one disclosure away, and previous and next walk the gates in order.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import GateDialog from '../blocks/GateDialog';
import { EvidenceBody } from '../GateEvidencePanel';
import { TonePill, fmtDateTime, toneFor } from '../shared';
import { investigationHref, windowsHref } from '../cpaHref';
import { staleVerdictLine } from '../verdictAge';
import { diagnosisLabel } from '../vocabulary';
import { evidenceScore } from '../evidenceScore';
import { hasVerdict } from '../metricAvailability';
import { useLatestGates } from '../../../hooks/useCpm';
import { ApiError } from '../../../api/apiFetch';
import type { CpmHeatmapLoop } from '../../../api/cpmApi';

export const PerformanceGateDialog: React.FC<{
  row: CpmHeatmapLoop;
  gate: string;
  windowKind: string;
  /** Ordered gate keys, so previous and next walk the pathway in tier order. */
  gateKeys: string[];
  flags?: readonly string[] | null;
  onSelectGate: (gate: string) => void;
  onClose: () => void;
}> = ({ row, gate, windowKind, gateKeys, flags, onSelectGate, onClose }) => {
  const navigate = useNavigate();
  const gates = useLatestGates(row.loopId, windowKind);
  const cell = gates.data?.gates.find(g => g.key === gate);
  const failed = gates.isError && !(gates.error instanceof ApiError && gates.error.status === 404);
  const idx = gateKeys.indexOf(gate);
  const prev = idx > 0 ? gateKeys[idx - 1] : null;
  const next = idx >= 0 && idx < gateKeys.length - 1 ? gateKeys[idx + 1] : null;
  const older = staleVerdictLine(row.lastVerdict);
  const score = hasVerdict(row.diagnosis) ? evidenceScore(row.confidence) : null;
  const reason = failed
    ? (gates.error instanceof Error ? gates.error.message : 'The gate detail could not be loaded.')
    : cell?.reason;

  return (
    <GateDialog
      open onClose={onClose} loop={row.loopId} gate={gate} status={row.gates[gate]} flags={flags}
      loopResult={(
        <>
          <TonePill tone={toneFor(row.diagnosis)}>{diagnosisLabel(row.diagnosis)}</TonePill>
          {score != null && <span className="cpm-event-row__sub"> evidence score {score}</span>}
          {older && <span className="cpm-event-row__sub"> {older}</span>}
        </>
      )}
      assessment={`Latest ${windowKind} window${row.windowEnd ? ` · ${fmtDateTime(row.windowEnd)}` : ''}`}
      rows={reason ? [{ label: 'Reason', value: reason }] : undefined}
      actions={(
        <>
          {prev && <ObcButton variant="flat" onClick={() => onSelectGate(prev)}>Previous gate {prev}</ObcButton>}
          {next && <ObcButton variant="flat" onClick={() => onSelectGate(next)}>Next gate {next}</ObcButton>}
          <ObcButton variant="flat" onClick={() => navigate(windowsHref(row.loopId, { profile: windowKind }))}>
            Window Inspector ↗
          </ObcButton>
          <ObcButton variant="raised" onClick={() => navigate(investigationHref(row.loopId, { kind: windowKind, gate }))}>
            Review {row.loopId} →
          </ObcButton>
        </>
      )}
    >
      <details className="cpm-gate-more">
        <summary>More about this gate</summary>
        <EvidenceBody loopId={row.loopId} gateKey={gate} windowKind={windowKind} />
      </details>
    </GateDialog>
  );
};

export default PerformanceGateDialog;
