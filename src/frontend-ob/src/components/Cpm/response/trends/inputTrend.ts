/**
 * CHG-197 trend 2, every event: the input the process received (held between samples), the step, the measured input change
 * (input_step) and the model's gain, labelled as the fitted value it is.
 */
import { readable } from '../../evidence/format';
import type { Mark } from './annotations';
import type { ResponseFacts } from './responseFacts';
import { INPUT_HEIGHT, stepMark, timeSeries, type TrendSpec } from './trendSupport';

/** "% OP" reads "%" after "OP change". */
const short = (unit: string) => (unit.startsWith('% ') ? '%' : unit);

export function inputTrend(f: ResponseFacts): TrendSpec | null {
  const d = f.input;
  if (!d || d.n === 0) return null;
  const series = timeSeries(d, 'u_applied', `${f.inputName} applied`, f.inputUnit, 'op', { held: true });
  let lo = Infinity, hi = -Infinity, before: number | null = null;
  for (let i = 0; i < d.n; i++) {
    const u = series.y[i];
    if (u == null) continue;
    lo = Math.min(lo, u); hi = Math.max(hi, u);
    if (d.columns.x[i] < f.t0) before = u;
  }
  const width = f.xRange[1] - f.xRange[0];
  const marks: Mark[] = [stepMark(f)];
  const du = f.value('input_step');
  if (du != null && before != null) {
    marks.push({ kind: 'bracket', x: f.xRange[0] + 0.97 * width, y1: before, y2: before + du, label: { text: `${f.inputName} change`, value: `${readable(du)} ${short(f.inputUnit)}` } });
  }
  const gain = f.quantity('process_gain');
  if (gain?.value != null && Number.isFinite(lo)) {
    marks.push({ kind: 'text', x: f.xRange[0] + 0.5 * width, y: (lo + hi) / 2, label: { text: 'Gain (model)', value: `${readable(gain.value)} ${f.unitOf(gain.unit)}` }, side: 'right' });
  }
  return {
    id: 'input', title: 'Input', unit: f.inputUnit, height: INPUT_HEIGHT, marks, series: [series],
    help: [
      `${f.inputName} applied: the ${f.inputName} the process received, held from each sample to the next.`,
      ...(du != null ? [`${f.inputName} change: the measured size of the step.`] : []),
      ...(gain?.value != null ? [`Gain (model): the model's fitted process gain, the PV change per unit of ${f.inputName} change once PV has settled. It is a model value; PV change and ${f.inputName} change are measured.`] : []),
    ],
  };
}
