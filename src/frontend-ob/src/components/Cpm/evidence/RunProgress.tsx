/**
 * CHG-188 (owner review 10.2, 15): the progress line under a run dialog's rows. In flight: OpenBridge's circular progress
 * (indeterminate: no API reports a percent), the state the API reports and the time since the click. Then "Done", or "Failed"
 * with the reason. It takes focus when a run starts, so focus stays in the dialog when the button that started it goes.
 * CHG-198: a run that knows its own stage (Redraw from historian: "Reading the historian · 1,200 points", "Drawing") passes
 * `word`, which replaces the in-flight state word.
 */
import React, { useEffect, useRef } from 'react';
import { ObcCircularProgress } from '@oicl/openbridge-webcomponents-react/building-blocks/circular-progress/circular-progress';
import { StatusBadge } from '../../../ui/StatusBadge';
import { formatElapsed, inFlight, type RunPhase } from './runPhase';

const WORD: Partial<Record<RunPhase['step'], string>> = { QUEUED: 'Queued', RUNNING: 'Running' };

export const RunProgress: React.FC<{ phase: RunPhase; startedAt: number | null; word?: string }> = ({ phase, startedAt, word }) => {
  const ref = useRef<HTMLDivElement>(null);
  const busy = inFlight(phase);
  useEffect(() => { if (busy) ref.current?.focus({ preventScroll: true }); }, [busy]);
  const elapsed = startedAt != null && phase.step !== 'FAILED' ? formatElapsed(Date.now() - startedAt) : null;
  return (
    <div ref={ref} className="cpm-run-progress" tabIndex={-1}>
      {busy && <span className="cpm-run-progress__spin" aria-hidden="true"><ObcCircularProgress /></span>}
      {phase.step === 'FAILED' ? (
        <span className="cpm-run-progress__failed" role="alert">
          <StatusBadge tone="danger">Failed</StatusBadge>
          <span>{phase.reason}</span>
        </span>
      ) : (
        <span className="cpm-run-progress__state" role="status">
          {phase.step === 'DONE' ? <StatusBadge tone="success">Done</StatusBadge> : (word ?? WORD[phase.step])}
        </span>
      )}
      {elapsed && <span className="cpm-run-progress__elapsed">{elapsed}</span>}
    </div>
  );
};

export default RunProgress;
