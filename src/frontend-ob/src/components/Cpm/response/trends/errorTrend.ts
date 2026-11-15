/**
 * CHG-197 trend 7: the error the engine integrates for IAE / ISE / ITAE (ErrorIntegrals: setpoint − PV of each valid sample, held
 * to the next sample, from the step to the event end), drawn with the area shaded, and the three values. Shown only when the
 * stored arrays reproduce the engine's three integrals (responseFacts.errorIntervals); otherwise the values stay in the
 * quantities table and nothing approximate is drawn.
 */
import { plainNumber } from '../../evidence/format';
import type { Mark } from './annotations';
import { errorIntervals, type ResponseFacts } from './responseFacts';
import { ms, stepMark, TREND_HEIGHT, type TrendSpec } from './trendSupport';

/** CHG-198: a redraw names this trend before it can know whether the samples reproduce the engine's integrals. */
export const ERROR_TREND_TITLE = 'Error from the setpoint';

export function errorTrend(f: ResponseFacts): TrendSpec | null {
  if (f.censored) return null;
  const intervals = errorIntervals(f);
  if (!intervals) return null;
  const x: number[] = [], y: Array<number | null> = [];
  let lo = 0, hi = 0;
  intervals.forEach((iv, i) => {
    x.push(ms(iv.a), ms(iv.b)); y.push(iv.e, iv.e);
    lo = Math.min(lo, iv.e); hi = Math.max(hi, iv.e);
    const next = intervals[i + 1];
    if (next && next.a !== iv.b) { x.push(ms(iv.b)); y.push(null); }   // an excluded (rejected) interval is a gap
  });
  const width = f.xRange[1] - f.xRange[0];
  const marks: Mark[] = [stepMark(f), { kind: 'guide', y: 0, dotted: true, label: { text: 'No error' } }];
  ['iae', 'ise', 'itae'].forEach((id, i) => {
    const qy = f.quantity(id)!;
    // CHG-200: the three start half a line under the top (off the "No error" line when the error is all below it)
    marks.push({ kind: 'text', x: f.xRange[0] + 0.72 * width, y: hi - (i + 0.5) * 0.12 * Math.max(hi - lo, 1e-9), label: { text: id.toUpperCase(), value: `${plainNumber(qy.value!)} ${f.unitOf(qy.unit)}` }, side: 'right' });
  });
  return {
    id: 'error', title: ERROR_TREND_TITLE, unit: f.pvUnit, height: TREND_HEIGHT, marks,
    series: [{ id: 'error', csvLabel: 'error', label: 'Error (setpoint − PV)', unit: f.pvUnit, x, y, pen: 'neutral', area: true }],
    help: [
      'Error: the setpoint minus PV, held from each sample to the next, from the step to the end of the event. Rejected samples are left out.',
      'IAE adds up the size of the error over time, ISE its square, ITAE its size weighted by the time since the step.',
    ],
  };
}
