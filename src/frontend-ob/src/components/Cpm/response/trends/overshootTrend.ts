/**
 * CHG-197 trend 5, when PV swings past its final value: the peak, the overshoot (% of the change past the final value), the time
 * from the step to the peak, and on a setpoint step the error left from the setpoint (steady_error).
 *
 * The decay ratio is NOT drawn: Overshoot.decayRatio takes any local maximum more than the settling band past the final value
 * as a peak, so on noisy data a noise wiggle on the tail counts as the second peak and the ratio is wrong. It stays in the
 * quantities table, where it is reported as the engine gave it.
 */
import { plainNumber } from '../../evidence/format';
import type { Mark } from './annotations';
import { level, secs, type ResponseFacts } from './responseFacts';
import { ms, placement, pvSeries, setpointSeries, stepMark, TREND_HEIGHT, type TrendSpec } from './trendSupport';

export function overshootTrend(f: ResponseFacts): TrendSpec | null {
  const overshoot = f.value('overshoot'), peakT = f.value('peak_time'), peak = f.value('peak_pv');
  if (f.censored || f.slope || f.final == null || overshoot == null || overshoot <= 0 || peakT == null || peak == null) return null;
  const place = placement(f);
  const x = ms(f.t0 + peakT);
  const marks: Mark[] = [
    stepMark(f),
    { kind: 'guide', y: f.final, label: { text: 'Final value' } },
    { kind: 'dot', x, y: peak, label: { text: 'Peak at', value: secs(peakT) }, side: 'top' },
    { kind: 'bracket', x, y1: f.final, y2: peak, label: { text: 'Overshoot', value: `${plainNumber(overshoot)} %` }, side: 'right' },
  ];
  const left = f.value('steady_error');
  if (left != null && f.setpoint != null) {
    const label = { text: 'Error left from the setpoint', value: `${level(left)} ${f.pvUnit}` };
    // a small gap: the label sits above both lines, left of the bracket, so it never runs over them
    if (Math.abs(left) > 1e-9) marks.push({ kind: 'bracket', x: place.at(0.97), y1: f.final, y2: f.setpoint });
    marks.push({ kind: 'text', x: place.at(0.85), y: Math.max(f.final, f.setpoint), label, side: 'top' });
  }
  return {
    id: 'overshoot', title: 'Overshoot', unit: f.pvUnit, height: TREND_HEIGHT, marks, series: [pvSeries(f), ...setpointSeries(f)],
    help: [
      'Overshoot: how far PV went past its final value, as a percentage of the change. Peak at: the time from the step to the highest point.',
      ...(left != null && f.setpoint != null ? ['Error left from the setpoint: the setpoint minus the final value.'] : []),
    ],
  };
}
