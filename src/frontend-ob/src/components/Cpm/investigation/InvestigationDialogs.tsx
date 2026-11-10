/**
 * CHG-141: the page's dialogs, one open at a time, so All gates can hand over to one gate's proof. Each sits on the page
 * body, clear of the sticky band. CHG-160 (owner review): Compare windows and Hypothesis comparison became the Windows and
 * Hypotheses steps, and Numeric evidence is the Windows table; a check that asks for one of them opens that step.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import { Dialog } from '../../../ui/Dialog';
import { historicalHref } from '../cpaHref';
import { AllGatesDialog } from './AllGatesDialog';
import { GateProofDialog } from './GateProofDialog';

export type InvestigationDialog =
  | { kind: 'proof'; gate: string } | { kind: 'all' } | { kind: 'compare' } | { kind: 'hypotheses' } | { kind: 'mode' } | null;

export const InvestigationDialogs: React.FC<{
  dialog: InvestigationDialog;
  onDialog: (dialog: InvestigationDialog) => void;
  loopId: string;
  matrix: CpmGateMatrix;
  windowKind: string;
  /** The window's effective input flags. */
  flags: readonly string[];
}> = ({ dialog, onDialog, loopId, matrix, windowKind, flags }) => {
  const navigate = useNavigate();
  const close = () => onDialog(null);
  switch (dialog?.kind) {
    case 'proof':
      return <GateProofDialog loopId={loopId} gate={dialog.gate} matrix={matrix} windowKind={windowKind} flags={flags} onClose={close} />;
    case 'all':
      return <AllGatesDialog matrix={matrix} flags={flags} onGate={gate => onDialog({ kind: 'proof', gate })} onClose={close} />;
    case 'mode':
      return createPortal(
        <Dialog open title="Mode context" onClose={close}
          footer={<ObcButton variant="flat" onClick={() => navigate(historicalHref(loopId, { from: matrix.windowStart, to: matrix.windowEnd, window: matrix.windowEnd, kind: windowKind }))}>Historical ↗</ObcButton>}>
          <p className="cpm-copy">If manual operation was intended, the exclusion needs no change to the controller. If it was not, review the operator or logic change that took the loop out of automatic or cascade.</p>
        </Dialog>,
        document.body,
      );
    default:
      return null;
  }
};

export default InvestigationDialogs;
