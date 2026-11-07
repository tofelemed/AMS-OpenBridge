/**
 * Task 15: Reconstruct evidence asks first. It names what will be rebuilt (loop, gate, window, run) and sends nothing until
 * confirmed. The dialog shows the real state of the request: in flight, or the service's refusal. An acceptance is the
 * page's to state, after the service has acknowledged; the dialog closes then, and never claims it.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../../ui/Dialog';

export interface ReconstructDialogProps {
  open: boolean;
  loopId: string;
  /** "G5 Oscillation (ACF)". */
  gate: string;
  windowText: string;
  runId: string;
  state: 'idle' | 'pending' | 'error';
  error?: string;
  onConfirm: () => void;
  onClose: () => void;
}

export const ReconstructDialog: React.FC<ReconstructDialogProps> = ({ open, loopId, gate, windowText, runId, state, error, onConfirm, onClose }) => (
  <Dialog
    open={open}
    onClose={onClose}
    title="Reconstruct evidence"
    description="Rebuilds this gate's arrays from the run's window. The rebuild is stored beside the retained proof, never over it."
    footer={(
      <>
        <ObcButton variant="flat" onClick={onClose}>Cancel</ObcButton>
        <ObcButton variant="normal" disabled={state === 'pending'} onClick={onConfirm}>{state === 'pending' ? 'Requesting…' : 'Reconstruct'}</ObcButton>
      </>
    )}
  >
    <dl className="cpm-recon">
      <dt>Loop</dt><dd>{loopId}</dd>
      <dt>Gate</dt><dd>{gate}</dd>
      <dt>Window</dt><dd>{windowText}</dd>
      <dt>Run</dt><dd className="cpm-mono">{runId}</dd>
    </dl>
    {state === 'error' && <p className="cpm-field__error" role="alert">Reconstruction refused: {error}</p>}
  </Dialog>
);

export default ReconstructDialog;
