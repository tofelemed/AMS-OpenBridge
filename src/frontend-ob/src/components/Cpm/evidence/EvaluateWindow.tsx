/**
 * CHG-102 Phase 5c: "Evaluate a window" - any 4 h / 12 h / 24 h window of the loop, ending at a picked time, evaluated
 * from the historian by the always-running on-demand Flink job. The same engine as the live verdicts; the result is
 * labelled EVALUATE in the header and kept 3 days. The run is polled while it is queued / running and opened when it
 * finishes. The window list above shows only the live 15-min verdicts of the last 14 days; this reaches any window the
 * historian holds.
 */
import React, { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { EVALUATION_KINDS, getEvaluation, postEvaluation, type EvaluationKind } from '../../../api/cpm/evaluation';
import { TonePill } from '../shared';
import { formatInZone } from './timezone';
import { evaluationRefusal, evaluationSettled, evaluationStatus, openableVerdict, requestedEnd, requestedStart } from './evaluationState';

export interface EvaluateWindowProps {
  loopId: string;
  timeZone: string;
  /** The window kind the toolbar shows, used as the first choice when it is one of 4h / 12h / 24h. */
  kindHint?: string;
  /** Opens the evaluated window in the workbench: its fused (G15) run, and every gate's run of the window. */
  onOpen: (verdictMethodRunId: string, methodRunIds: Record<string, string>, analysisRunId: string) => void;
}

const POLL_MS = 1500;

export const EvaluateWindow: React.FC<EvaluateWindowProps> = ({ loopId, timeZone, kindHint, onOpen }) => {
  const ids = useId();
  const [kind, setKind] = useState<EvaluationKind>((EVALUATION_KINDS as readonly string[]).includes(kindHint ?? '') ? kindHint as EvaluationKind : '12h');
  const [end, setEnd] = useState('');
  const [runId, setRunId] = useState<string | undefined>();
  const opened = useRef<string | undefined>();

  // a different loop starts over (a run of the previous loop must never open here)
  useEffect(() => { setRunId(undefined); opened.current = undefined; }, [loopId]);

  const start = useMutation({
    mutationFn: () => postEvaluation(loopId, kind, requestedEnd(end, Date.now())),
    onSuccess: r => { opened.current = undefined; setRunId(r.analysisRunId); },
  });
  const run = useQuery({
    queryKey: ['cpm', 'evaluation', runId ?? ''],
    queryFn: ({ signal }) => getEvaluation(runId!, signal),
    enabled: !!runId,
    refetchInterval: q => (evaluationSettled(q.state.data, Date.now()) ? false : POLL_MS),
  });

  const data = run.data?.analysisRunId === runId ? run.data : undefined;
  const verdict = openableVerdict(data);
  useEffect(() => {
    if (verdict && data && opened.current !== verdict) { opened.current = verdict; onOpen(verdict, data.methodRunIds ?? {}, data.analysisRunId); }
  }, [verdict, onOpen, data]);

  const endMs = requestedEnd(end, Date.now());
  const busy = start.isPending || (!!data && !evaluationSettled(data, Date.now()) && !verdict) || (!!runId && !data && !run.error);
  const status = evaluationStatus(data);
  const refusal = evaluationRefusal(start.error);
  return (
    <section className="cpm-surface cpm-evaluate-window" aria-labelledby={`${ids}-title`}>
      <div className="cpm-evaluate-window__head">
        <h3 className="cpm-evaluate-window__title" id={`${ids}-title`}>Evaluate a window from the historian</h3>
        <span className="cpm-evaluate-window__hint">Any window the historian holds, with the engine the live verdicts use. Kept 3 days.</span>
      </div>
      <div className="cpm-toolbar">
        <label className="cpm-field cpm-field--compact">
          <span className="cpm-field__label" id={`${ids}-kind`}>Length</span>
          <select className="cpm-select" aria-labelledby={`${ids}-kind`} value={kind} disabled={busy} onChange={e => setKind(e.target.value as EvaluationKind)}>
            {EVALUATION_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label className="cpm-field cpm-field--compact">
          <span className="cpm-field__label" id={`${ids}-end`}>Ending at (empty = now)</span>
          <input className="cpm-input" type="datetime-local" aria-labelledby={`${ids}-end`} value={end} disabled={busy} onChange={e => setEnd(e.target.value)} />
        </label>
        <span className="cpm-evaluate-window__range" aria-live="polite">
          {formatInZone(requestedStart(endMs, kind), timeZone)} → {formatInZone(endMs, timeZone)} ({timeZone})
        </span>
        <ObcButton variant="normal" disabled={busy} onClick={() => start.mutate()}>{busy ? 'Evaluating…' : 'Evaluate'}</ObcButton>
        {verdict && <ObcButton variant="flat" onClick={() => onOpen(verdict, data?.methodRunIds ?? {}, data!.analysisRunId)}>Open the result</ObcButton>}
      </div>
      {refusal && <p className="cpm-evaluate-window__status" role="alert"><TonePill tone="bad">Not started</TonePill> {refusal}</p>}
      {!refusal && status && (
        <p className="cpm-evaluate-window__status" role="status"><TonePill tone={status.tone}>{data!.state}</TonePill> {status.text}</p>
      )}
      {run.error != null && <p className="cpm-evaluate-window__status" role="alert"><TonePill tone="bad">Unknown</TonePill> The run's state could not be read. It may still finish; reload to check.</p>}
    </section>
  );
};
