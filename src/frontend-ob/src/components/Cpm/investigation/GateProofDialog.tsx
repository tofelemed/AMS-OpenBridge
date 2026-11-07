/**
 * CHG-141: Calculation proof. One gate of this window in the shared gate dialog, with the values behind it, and the two
 * ways on: its immutable run in the Workbench, or the same loop, window and gate in Replay. The loop's result stays
 * beside the gate's, because the two can differ. A row with no run says why the Workbench cannot open.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import GateDialog from '../blocks/GateDialog';
import { replayHref } from '../cpaHref';
import { workbenchHref } from '../evidence/selection';
import { reasonSentence } from '../evidence/verdictCopy';
import { evidenceScoreText } from '../evidenceScore';
import { hasVerdict } from '../metricAvailability';
import { ReasonedButton } from '../ReasonedButton';
import { KvRow, TonePill, toneFor } from '../shared';
import { windowSpan } from '../windowLabel';
import { gateValues, sentence } from './gateProof';
import { heroTitle } from './heroFacts';

export const GateProofDialog: React.FC<{
  loopId: string;
  gate: string;
  matrix: CpmGateMatrix;
  windowKind: string;
  flags?: readonly string[] | null;
  timeZone?: string;
  onClose: () => void;
}> = ({ loopId, gate, matrix, windowKind, flags, timeZone, onClose }) => {
  const navigate = useNavigate();
  const cell = matrix.gates.find(g => g.key === gate);
  const runId = cell?.methodRunId ?? matrix.methodRunIds?.[gate] ?? null;
  const reason = reasonSentence(cell?.reason ?? null, { gate, eligibilityDetail: matrix.methodEligibility?.[gate]?.detail });
  const score = hasVerdict(matrix.diagnosis) ? evidenceScoreText(matrix.confidence) : '';
  const values = gateValues(gate, matrix);

  return (
    <GateDialog
      open onClose={onClose} loop={loopId} gate={gate} status={cell?.status} flags={flags}
      loopResult={(
        <>
          <TonePill tone={toneFor(matrix.diagnosis)}>{heroTitle(matrix)}</TonePill>
          {score && <span className="cpm-event-row__sub"> {score}</span>}
        </>
      )}
      assessment={windowSpan({ ...matrix, windowKind }, timeZone)}
      rows={reason ? [{ label: 'Reason', value: sentence(reason) }] : undefined}
      actions={(
        <>
          <ObcButton variant="flat" onClick={() => navigate(replayHref(loopId, { window: matrix.windowEnd, kind: windowKind, gate }))}>
            Evidence Replay ↗
          </ObcButton>
          <ReasonedButton variant="raised" disabled={!runId}
            reason="Stored before analysis runs were kept (before v2.5), so there is no run to open"
            onClick={() => { if (runId) navigate(workbenchHref(loopId, runId, gate)); }}>
            Evidence Workbench →
          </ReasonedButton>
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
