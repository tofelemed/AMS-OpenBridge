/**
 * CHG-197 trend 1, every event: the measured response. PV (rejected samples as gaps), the step, the baseline and the final value
 * (the engine's robust medians), the setpoint on a setpoint step, the PV change between them, and the wrong-way move
 * (undershoot: how far PV first went against the step, % of the change) when the engine reported one.
 */
import { plainNumber } from '../../evidence/format';
import type { Mark } from './annotations';
import { level, type ResponseFacts } from './responseFacts';
import { ms, placement, pvSeries, setpointSeries, stepMark, TREND_HEIGHT, type TrendSpec } from './trendSupport';

export function measuredTrend(f: ResponseFacts): TrendSpec {
  const place = placement(f);
  const marks: Mark[] = [stepMark(f)];
  if (f.baseline != null) marks.push({ kind: 'guide', y: f.baseline, label: { text: 'Baseline', value: level(f.baseline) } });
  if (f.final != null) marks.push({ kind: 'guide', y: f.final, label: { text: 'Final value', value: level(f.final) } });
  if (f.setpoint != null) marks.push({ kind: 'text', x: place.at(0.5), y: f.setpoint, label: { text: 'Setpoint', value: level(f.setpoint) }, side: 'top' });
  if (f.baseline != null && f.final != null && f.change != null) {
    marks.push({ kind: 'bracket', x: place.at(0.97), y1: f.baseline, y2: f.final, label: { text: 'PV change', value: `${level(f.change)} ${f.pvUnit}` } });
  }
  const under = f.value('undershoot');
  if (under != null && under > 0 && f.baseline != null && f.change != null) {
    const y = f.baseline - (under / 100) * f.change;
    marks.push({ kind: 'guide', y, from: ms(f.t0), to: ms(f.tEnd), dotted: true, label: { text: 'Wrong-way move', value: `${plainNumber(under)} % of the change` } });
    const at = wrongWayPoint(f, y);
    if (at != null) marks.push({ kind: 'dot', x: at, y });
  }
  return {
    id: 'measured', title: 'Measured response', unit: f.pvUnit, height: TREND_HEIGHT, marks,
    series: [pvSeries(f), ...setpointSeries(f)],
    help: [
      'PV as recorded. A rejected sample is a gap; the line is never joined across it.',
      'Baseline: the median of the steady PV just before the step. Final value: the median of the steady PV at the end of the event. PV change is the final value minus the baseline.',
      ...(under != null && under > 0 ? ['Wrong-way move: how far PV went against the step after it, as a percentage of the change.'] : []),
    ],
  };
}

/** The sample at the engine's lowest progress (the one its undershoot names), or null when none matches exactly. */
function wrongWayPoint(f: ResponseFacts, y: number): number | null {
  const d = f.samples;
  for (let i = 0; i < d.n; i++) {
    if ((d.mask && !d.mask[i]) || d.columns.x[i] < f.t0) continue;
    if (Math.abs(d.columns.y[i] - y) <= 1e-9 * Math.max(1, Math.abs(y))) return ms(d.columns.x[i]);
  }
  return null;
}
