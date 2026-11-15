/**
 * CHG-198 (owner, approved 2026-11-15): "Redraw from historian", in the Evaluate a window pattern (CHG-188 / CHG-193): the loop and
 * the event on the band, then Window (as the page prints a time, Q5), Signals and the Trends it will draw; Redraw is the one
 * primary action. Then the progress in place: Reading the historian with the points read so far, Drawing, Done with the time
 * since the click, after which it closes by itself and the page shows the redrawn trends. A failure stays open with the reason
 * and Retry. Unlike an evaluation, nothing runs on a server: closing during the read cancels it.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { ResponseEventDetail, ResponseQuantity } from '../../../../api/cpm/response';
import { Dialog } from '../../../../ui/Dialog';
import { fmtInstant, fmtInstantBare } from '../../context/LoopContextBar';
import { RunProgress } from '../../evidence/RunProgress';
import { IDLE, inFlight, type RunPhase } from '../../evidence/runPhase';
import { useAfterDone, useTick } from '../../evidence/useRunClock';
import type { RedrawWindow } from './historianRead';
import { plannedTrends } from './redrawArtifacts';
import { DRAWING_WORD, readingWord, REDRAW_TITLE } from './redrawWords';
import { useRedrawRun, type RedrawStage } from './useRedraw';

export interface RedrawDialogProps {
  loopId: string;
  eventId: string;
  /** The event as the event selector names it. */
  eventName: string;
  result: ResponseEventDetail['result'];
  metrics: ResponseQuantity[] | undefined;
  window: RedrawWindow;
  pvUnit?: string | null;
  timeZone: string;
  onClose: () => void;
}

function phaseOf(stage: RedrawStage): { phase: RunPhase; word?: string } {
  switch (stage.step) {
    case 'IDLE': return { phase: IDLE };
    case 'READING': return { phase: { step: 'RUNNING' }, word: readingWord(stage.points) };
    case 'DRAWING': return { phase: { step: 'RUNNING' }, word: DRAWING_WORD };
    case 'DONE': return { phase: { step: 'DONE' } };
    default: return { phase: { step: 'FAILED', reason: stage.reason } };
  }
}

export const RedrawDialog: React.FC<RedrawDialogProps> = ({ loopId, eventId, eventName, result, metrics, window: w, pvUnit, timeZone, onClose }) => {
  const run = useRedrawRun({ eventId, loopId, pathId: String(result.path_id ?? ''), window: w, metrics });
  const { phase, word } = phaseOf(run.stage);
  useTick(inFlight(phase));
  useAfterDone(phase.step === 'DONE', onClose);
  const trends = React.useMemo(() => plannedTrends(w, result, metrics, pvUnit), [w, result, metrics, pvUnit]);
  const close = () => { run.cancel(); onClose(); };
  const failed = phase.step === 'FAILED';
  return (
    <Dialog open onClose={close} title={REDRAW_TITLE} subtitle={`${loopId} · ${eventName}`}
      footer={(
        <>
          <ObcButton variant="normal" onClick={close}>{failed || phase.step === 'DONE' ? 'Close' : 'Cancel'}</ObcButton>
          {(phase.step === 'IDLE' || failed) && <ObcButton variant="raised" onClick={() => void run.start()}>{failed ? 'Retry' : 'Redraw'}</ObcButton>}
        </>
      )}>
      <div className="cpm-run-form">
        <span className="cpm-run-form__label">Window</span>
        <span className="cpm-run-form__value">
          <span className="cpm-run-form__stamp">{fmtInstantBare(w.t0Ms, timeZone)}</span> → <span className="cpm-run-form__stamp">{fmtInstant(w.tEndMs, timeZone)}</span>
        </span>
        <span className="cpm-run-form__label">Signals</span>
        <span className="cpm-run-form__value">PV, SP, {w.input.toUpperCase()}</span>
        <span className="cpm-run-form__label">Trends</span>
        <span className="cpm-run-form__value">{trends.join(' · ')}</span>
      </div>
      {phase.step !== 'IDLE' && <RunProgress phase={phase} startedAt={run.startedAt} word={word} />}
    </Dialog>
  );
};

export default RedrawDialog;
