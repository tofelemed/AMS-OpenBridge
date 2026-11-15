/**
 * CHG-102 Phase 5c: "Evaluate a window" - any 12 h / 24 h window of the loop, ending now or at a picked time, evaluated from the
 * historian by the always-running on-demand Flink job, with the engine the live verdicts use; the result is kept 3 days. The
 * window list shows only the live verdicts of the last 14 days; this reaches any window the historian holds.
 * CHG-188 (owner review 10): a dialog (cyan band, the loop as subtitle). Length as 12h / 24h segments, Ending at "Now" by
 * default, the window it will evaluate, Evaluate as the primary action. After Evaluate it shows the run as the status API
 * reports it (Queued, Running, with the time since the click), and on Done it closes by itself while the page opens the
 * evaluated window. A failure stays open with the reason and Retry. The run lives here, not in the dialog: closed mid-run, the
 * run goes on and the page still opens the window when it is done; reopened, the dialog shows the run. A new loop starts over.
 */
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { getEvaluation, postEvaluation, type EvaluationKind, type EvaluationRun } from '../../../api/cpm/evaluation';
import { toSiteInput } from '../../../cpa/siteTime';
import { Dialog } from '../../../ui/Dialog';
import { SegmentedControl } from '../../../ui/SegmentedControl';
import { formatInZone } from './timezone';
import { evaluationPhase, evaluationSettled, openableVerdict, requestedEnd, requestedStart } from './evaluationState';
import { inFlight } from './runPhase';
import { RunProgress } from './RunProgress';
import { useAfterDone, useTick } from './useRunClock';

export interface EvaluateWindowProps {
  loopId: string;
  timeZone: string;
  /** On the band: "FIC10401 · Flow controller". */
  subtitle?: string;
  /** The window kind the toolbar shows, the first choice when it is 24h. */
  kindHint?: string;
  open: boolean;
  onClose: () => void;
  /** Opens the evaluated window in the workbench: its fused (G15) run, and every gate's run of the window. */
  onOpen: (verdictMethodRunId: string, methodRunIds: Record<string, string>, analysisRunId: string) => void;
}

const POLL_MS = 1500;
const LENGTHS: readonly EvaluationKind[] = ['12h', '24h'];

/** "Now" until a time is picked; picking starts from now, so the browser never shows an empty date field. */
const EndingAt: React.FC<{ labelId: string; value: string; disabled: boolean; onChange: (v: string) => void }> = ({ labelId, value, disabled, onChange }) => {
  const input = useRef<HTMLInputElement>(null);
  const focusInput = useRef(false);
  useEffect(() => { if (value && focusInput.current) { focusInput.current = false; input.current?.focus(); } }, [value]);
  if (!value) {
    return (
      <button type="button" className="cpm-input cpm-run-form__now" disabled={disabled} aria-label="Ending at: Now. Pick another time"
        onClick={() => { focusInput.current = true; onChange(toSiteInput(requestedEnd('', Date.now()))); }}>Now</button>
    );
  }
  return (
    <>
      <input ref={input} className="cpm-input" type="datetime-local" aria-labelledby={labelId} value={value} disabled={disabled}
        onChange={e => onChange(e.target.value)} />
      <button type="button" className="ui-btn ui-btn--secondary" disabled={disabled} onClick={() => onChange('')}>Now</button>
    </>
  );
};

export const EvaluateWindow: React.FC<EvaluateWindowProps> = ({ loopId, timeZone, subtitle, kindHint, open, onClose, onOpen }) => {
  const ids = useId();
  const [kind, setKind] = useState<EvaluationKind>(kindHint === '24h' ? '24h' : '12h');
  const [end, setEnd] = useState('');
  const [runId, setRunId] = useState<string | undefined>();
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const opened = useRef<string | undefined>();
  const qc = useQueryClient();

  const start = useMutation({
    mutationFn: (a: { kind: EvaluationKind; endMs: number }) => postEvaluation(loopId, a.kind, a.endMs),
    // the answer is the run itself, and the newest word on it: a retry answered with the same run (in flight, or stored)
    // must not show the state read before it
    onSuccess: r => { qc.setQueryData(['cpm', 'evaluation', r.analysisRunId], r); opened.current = undefined; setRunId(r.analysisRunId); },
  });
  const resetStart = start.reset;
  const reset = useCallback(() => { setRunId(undefined); setStartedAt(null); resetStart(); opened.current = undefined; }, [resetStart]);
  // a different loop starts over (a run of the previous loop must never open here)
  useEffect(() => { reset(); }, [loopId]);   // eslint-disable-line react-hooks/exhaustive-deps

  const poll = useQuery({
    queryKey: ['cpm', 'evaluation', runId ?? ''],
    queryFn: ({ signal }) => getEvaluation(runId!, signal),
    enabled: !!runId,
    refetchInterval: q => (evaluationSettled(q.state.data, Date.now()) ? false : POLL_MS),
  });
  // a stored result of the same window is in the POST's answer, so it opens at once
  const data: EvaluationRun | undefined = runId && poll.data?.analysisRunId === runId ? poll.data : undefined;
  const phase = evaluationPhase({
    pending: start.isPending, startError: start.error, accepted: !!runId, run: data, readError: runId ? poll.error : null, nowMs: Date.now(),
  });
  useTick(inFlight(phase));

  const verdict = openableVerdict(data);
  useEffect(() => {
    if (verdict && data && opened.current !== verdict) { opened.current = verdict; onOpen(verdict, data.methodRunIds ?? {}, data.analysisRunId); }
  }, [verdict, onOpen, data]);
  useAfterDone(phase.step === 'DONE', () => { onClose(); reset(); });

  const evaluate = () => {
    reset();
    setStartedAt(Date.now());
    start.mutate({ kind, endMs: requestedEnd(end, Date.now()) });
  };
  // closing mid-run leaves the run going; after Done or a failure the next opening starts with the form
  const close = () => { onClose(); if (!inFlight(phase)) reset(); };
  // a changed window after a failure is a new request: the form again, with Evaluate
  const edit = (apply: () => void) => { if (phase.step === 'FAILED') reset(); apply(); };

  const locked = inFlight(phase) || phase.step === 'DONE';
  const failed = phase.step === 'FAILED';
  const endMs = requestedEnd(end, Date.now());
  return (
    <Dialog open={open} onClose={close} title="Evaluate a window" subtitle={subtitle}
      footer={(
        <>
          <ObcButton variant="normal" onClick={close}>{phase.step === 'IDLE' ? 'Cancel' : 'Close'}</ObcButton>
          {(phase.step === 'IDLE' || failed) && <ObcButton variant="raised" onClick={evaluate}>{failed ? 'Retry' : 'Evaluate'}</ObcButton>}
        </>
      )}>
      <div className="cpm-run-form">
        <span className="cpm-run-form__label" id={`${ids}-len`}>Length</span>
        <div className="cpm-run-form__value">
          <SegmentedControl<EvaluationKind> label="Length" value={kind} onChange={k => edit(() => setKind(k))} ignoreReselect
            options={LENGTHS.map(k => ({ value: k, label: k, disabled: locked }))} />
        </div>
        <span className="cpm-run-form__label" id={`${ids}-end`}>Ending at</span>
        <div className="cpm-run-form__value">
          <EndingAt labelId={`${ids}-end`} value={end} disabled={locked} onChange={v => edit(() => setEnd(v))} />
        </div>
        <span className="cpm-run-form__label">Window</span>
        <span className="cpm-run-form__value" aria-live="polite">
          {formatInZone(requestedStart(endMs, kind), timeZone)} → {formatInZone(endMs, timeZone)} ({timeZone})
        </span>
      </div>
      {phase.step !== 'IDLE' && <RunProgress phase={phase} startedAt={startedAt} />}
    </Dialog>
  );
};

export default EvaluateWindow;
