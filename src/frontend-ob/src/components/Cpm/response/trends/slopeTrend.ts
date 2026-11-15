/**
 * CHG-197 trend 6, level and ramp responses (the engine reported the post-event slope): the dead time, the slope line from the end
 * of dead time with a rise-over-run triangle, the slope and the model's integrating gain. A time constant and settling do not
 * apply to a response that keeps moving, so they are not drawn here (and trends 3-5 do not show).
 */
import { readable } from '../../evidence/format';
import type { Mark } from './annotations';
import { level, secs, type ResponseFacts } from './responseFacts';
import { ms, placement, spanMark, pvSeries, stepMark, TREND_HEIGHT, type TrendSpec } from './trendSupport';

const RUNS = [5, 10, 15, 20, 30, 60, 90, 120, 180, 300, 600, 900, 1200, 1800, 3600];
/** A round run for the triangle, about a quarter of the slope's span. */
const runFor = (span: number) => RUNS.filter(r => r <= span / 4).pop() ?? Math.max(1, Math.round(span / 4));

export function slopeTrend(f: ResponseFacts): TrendSpec | null {
  const slope = f.value('post_slope');
  if (f.censored || slope == null) return null;
  const theta = f.value('dead_time');
  const start = f.t0 + (theta ?? 0);   // the engine's slope window starts at the end of the model's dead time (0 without a model)
  const place = placement(f);
  const marks: Mark[] = [stepMark(f)];
  if (theta != null) marks.push(spanMark(f, ms(f.t0), ms(start), (f.baseline ?? place.min) - 0.06 * place.range, { text: 'Dead time', value: secs(theta) }));
  const span = f.tEnd - start;
  if (f.baseline != null && span > 0) {
    const at = (t: number) => f.baseline! + slope * (t - start);
    marks.push({ kind: 'segment', x1: ms(start), y1: f.baseline, x2: ms(f.tEnd), y2: at(f.tEnd), dashed: true });
    const run = runFor(span);
    const a = start + Math.max(0, Math.min(span / 2, span - run));
    const ya = at(a), yb = at(a + run);
    marks.push(
      { kind: 'segment', x1: ms(a), y1: ya, x2: ms(a + run), y2: ya },
      { kind: 'segment', x1: ms(a + run), y1: ya, x2: ms(a + run), y2: yb },
      { kind: 'text', x: ms(a + run / 2), y: ya, label: { text: secs(run) }, side: 'bottom' },
      { kind: 'text', x: ms(a + run), y: (ya + yb) / 2, label: { text: `${slope * run >= 0 ? '+' : ''}${level(slope * run)} ${f.pvUnit}` }, side: 'right' },
    );
  }
  const slopeQ = f.quantity('post_slope')!;
  marks.push({ kind: 'text', x: ms(f.t0) + 0.01 * (f.xRange[1] - f.xRange[0]), y: place.max, label: { text: 'Slope', value: `${readable(slope)} ${f.unitOf(slopeQ.unit)}` }, side: 'right' });
  const ki = f.quantity('integrating_gain');
  if (ki?.value != null) {
    marks.push({ kind: 'text', x: ms(f.t0) + 0.01 * (f.xRange[1] - f.xRange[0]), y: place.max - 0.1 * place.range, label: { text: 'Integrating gain (model)', value: `${readable(ki.value)} ${f.unitOf(ki.unit)}` }, side: 'right' });
  }
  return {
    id: 'slope', title: 'Slope', unit: f.pvUnit, height: TREND_HEIGHT, marks, series: [pvSeries(f)],
    help: [
      'PV keeps moving after a level or ramp response, so it has no time constant and no settling.',
      'Slope: the median of the rates between every pair of valid samples from the end of the dead time to the end of the event, drawn from the baseline at the end of the dead time; the triangle shows its rise over a round run.',
      ...(ki?.value != null ? [`Integrating gain (model): the fitted rate of PV per unit of ${f.inputName} change.`] : []),
    ],
  };
}
