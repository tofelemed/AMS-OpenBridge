/**
 * CHG-198 (owner, approved 2026-11-15): the redraw of an event lives in the page only, in the react-query cache keyed by the
 * event (nothing is stored on the server). useRedrawRun reads the historian and draws: Reading (with the points read so far),
 * Drawing, Done, or Failed with the reason; a cancel, or the dialog going away, aborts the read (AbortSignal).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ResponseQuantity } from '../../../../api/cpm/response';
import { loopSeries } from '../../../../utils/loopSeries';
import { readFailure, readHistorian, type RedrawWindow } from './historianRead';
import { redrawArtifacts, type RedrawnArtifacts } from './redrawArtifacts';
import { NO_SAMPLES } from './redrawWords';

export interface Redrawn { byKind: RedrawnArtifacts; points: number }

export const redrawKey = (eventId: string) => ['cpm', 'response-redraw', eventId] as const;

/** The event's redraw while the page holds it (half an hour after the last screen that shows it), else undefined. */
export function useRedrawn(eventId: string | undefined): Redrawn | undefined {
  return useQuery<Redrawn>({ queryKey: redrawKey(eventId ?? ''), queryFn: skipToken, staleTime: Infinity, gcTime: 30 * 60_000 }).data;
}

export type RedrawStage =
  | { step: 'IDLE' }
  | { step: 'READING'; points: number }
  | { step: 'DRAWING' }
  | { step: 'DONE' }
  | { step: 'FAILED'; reason: string };

const IDLE: RedrawStage = { step: 'IDLE' };

/** "Drawing" is on screen for at least one paint before the trends are built. */
const nextPaint = () => new Promise<void>(resolve => { setTimeout(resolve, 0); });

export function useRedrawRun(a: { eventId: string; loopId: string; pathId: string; window: RedrawWindow; metrics: ResponseQuantity[] | undefined }) {
  const qc = useQueryClient();
  const [stage, setStage] = useState<RedrawStage>(IDLE);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const run = useRef<AbortController | null>(null);
  const args = useRef(a);
  args.current = a;
  useEffect(() => () => run.current?.abort(), []);

  const start = useCallback(async () => {
    run.current?.abort();
    const ctrl = new AbortController();
    run.current = ctrl;
    const { eventId, loopId, pathId, window: w, metrics } = args.current;
    setStartedAt(Date.now());
    setStage({ step: 'READING', points: 0 });
    try {
      const points = await readHistorian(loopSeries(loopId), w, ctrl.signal, n => { if (!ctrl.signal.aborted) setStage({ step: 'READING', points: n }); });
      if (ctrl.signal.aborted) return;
      setStage({ step: 'DRAWING' });
      await nextPaint();
      if (ctrl.signal.aborted) return;
      const byKind = redrawArtifacts(points, w, pathId, metrics);
      if (!byKind) { setStage({ step: 'FAILED', reason: NO_SAMPLES }); return; }
      qc.setQueryData<Redrawn>(redrawKey(eventId), { byKind, points: points.length });
      setStage({ step: 'DONE' });
    } catch (e) {
      if (!ctrl.signal.aborted) setStage({ step: 'FAILED', reason: readFailure(e) });
    }
  }, [qc]);

  const cancel = useCallback(() => { run.current?.abort(); run.current = null; setStage(IDLE); setStartedAt(null); }, []);
  return { stage, startedAt, start, cancel };
}
