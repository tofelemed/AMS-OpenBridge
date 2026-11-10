/**
 * CHG-141: Calculation proof. One gate of this window in the shared gate dialog, with the values behind it, and the two
 * ways on: its immutable run in the Workbench, or the same loop, window and gate in Replay. A row with no run says why the
 * Workbench cannot open. CHG-160 (owner review): named by the gate; the band names the loop and window, the Result tab
 * the loop's result, and both ways on are short links on one line.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import GateDialog from '../blocks/GateDialog';
import { replayHref } from '../cpaHref';
import { workbenchHref } from '../evidence/selection';
import { reasonSentence } from '../evidence/verdictCopy';
import { ReasonedButton } from '../ReasonedButton';
import { KvRow } from '../shared';
import { gateValues, sentence } from './gateProof';

export const GateProofDialog: React.FC<{
  loopId: string;
  gate: string;
  matrix: CpmGateMatrix;
  windowKind: string;
  flags?: readonly string[] | null;
  onClose: () => void;
}> = ({ loopId, gate, matrix, windowKind, flags, onClose }) => {
  const navigate = useNavigate();
  const cell = matrix.gates.find(g => g.key === gate);
  const runId = cell?.methodRunId ?? matrix.methodRunIds?.[gate] ?? null;
  const reason = reasonSentence(cell?.reason ?? null, { gate, eligibilityDetail: matrix.methodEligibility?.[gate]?.detail });
  const values = gateValues(gate, matrix);

  return (
    <GateDialog
      open onClose={onClose} loop={loopId} gate={gate} status={cell?.status} flags={flags} loopInView
      rows={reason ? [{ label: 'Reason', value: sentence(reason) }] : undefined}
      actions={(
        <>
          <ObcButton variant="flat" onClick={() => navigate(replayHref(loopId, { window: matrix.windowEnd, kind: windowKind, gate }))}>Replay ↗</ObcButton>
          <ReasonedButton variant="flat" disabled={!runId}
            reason="Stored before analysis runs were kept (before v2.5), so there is no run to open"
            onClick={() => { if (runId) navigate(workbenchHref(loopId, runId, gate)); }}>Workbench ↗</ReasonedButton>
        </>
      )}
    >
      <div className="cpm-inv-proof">
        <h3 className="cpm-eyebrow">Calculated values</h3>
        {values.length > 0
          ? values.map(v => <KvRow key={v.label} label={v.label}><span title={v.title}>{v.value}</span></KvRow>)
          : <p className="cpm-metric-na">This gate reports a state, not a measured value.</p>}
      </div>
    </GateDialog>
  );
};

export default GateProofDialog;
