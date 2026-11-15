/**
 * Task 15: Reconstruct evidence asks first. It names what will be rebuilt (loop, gate, window; CHG-184: no run id) and sends
 * nothing until confirmed. CHG-188 (owner review 15): one line of text, the rows Loop, Gate and Window, Reconstruct as the
 * primary action and Cancel as secondary. After Reconstruct it shows the run's progress (Running, with the time since the
 * click, then Done; the page closes it by itself), or Failed with the reason and Retry. Closing it mid-run leaves the run going.
 * CHG-193 (final review M2): after the time limit the job may still finish: Keep waiting is the primary, Retry secondary.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../../ui/Dialog';
import type { RunPhase } from './runPhase';
import { RunProgress } from './RunProgress';

export interface ReconstructDialogProps {
  open: boolean;
  loopId: string;
  /** "G5 Oscillation (ACF)". */
  gate: string;
  windowText: string;
  /** The run's progress (reconstructionPhase); IDLE asks first. */
  phase: RunPhase;
  /** When Reconstruct was clicked. */
  startedAt: number | null;
  /** Reconstruct, and Retry after a failure. */
  onConfirm: () => void;
  /** After the time limit: wait again, with no new request. */
  onKeepWaiting?: () => void;
  onClose: () => void;
}

export const ReconstructDialog: React.FC<ReconstructDialogProps> = ({ open, loopId, gate, windowText, phase, startedAt, onConfirm, onKeepWaiting, onClose }) => {
  const failed = phase.step === 'FAILED';
  const wait = failed && !!phase.keepWaiting && !!onKeepWaiting;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Reconstruct evidence"
      description="Rebuilds this gate's charts from its window. The kept proof is not changed."
      footer={(
        <>
          <ObcButton variant="normal" onClick={onClose}>{phase.step === 'IDLE' ? 'Cancel' : 'Close'}</ObcButton>
          {(phase.step === 'IDLE' || failed) && <ObcButton variant={wait ? 'normal' : 'raised'} onClick={onConfirm}>{failed ? 'Retry' : 'Reconstruct'}</ObcButton>}
          {wait && <ObcButton variant="raised" onClick={onKeepWaiting}>Keep waiting</ObcButton>}
        </>
      )}
    >
      <dl className="cpm-recon cpm-run-form">
        <dt>Loop</dt><dd>{loopId}</dd>
        <dt>Gate</dt><dd>{gate}</dd>
        <dt>Window</dt><dd>{windowText}</dd>
      </dl>
      {phase.step !== 'IDLE' && <RunProgress phase={phase} startedAt={startedAt} />}
    </Dialog>
  );
};

export default ReconstructDialog;
