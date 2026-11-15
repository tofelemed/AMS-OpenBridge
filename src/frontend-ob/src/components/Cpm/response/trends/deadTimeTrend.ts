/**
 * CHG-197 trend 3, self-regulating models with a time constant: the dead time from the step and the time constant after it (both
 * the model's), the 63 % of the change level, and where the measured PV first crossed it (t63) as a dot. A second-order model
 * draws its slower time constant there and the faster one under it. Integrating and ramp responses never show this trend.
 */
import type { Mark } from './annotations';
import { secs, type ResponseFacts } from './responseFacts';
import { ms, placement, spanMark, pvSeries, stepMark, TREND_HEIGHT, type TrendSpec } from './trendSupport';

const SIXTY_THREE = 1 - Math.exp(-1);

export function deadTimeTrend(f: ResponseFacts): TrendSpec | null {
  const theta = f.value('dead_time');
  const tau = f.value('time_constant') ?? f.value('time_constant_1');
  if (f.censored || f.slope || f.value('process_gain') == null || theta == null || tau == null) return null;
  const tau2 = f.value('time_constant_2');
  const place = placement(f);
  const start = f.t0 + theta;
  const y63 = f.baseline != null && f.change != null ? f.baseline + SIXTY_THREE * f.change : null;
  const tcLevel = y63 ?? (place.min + place.max) / 2;
  const marks: Mark[] = [
    stepMark(f),
    spanMark(f, ms(f.t0), ms(start), (f.baseline ?? place.min) - 0.06 * place.range, { text: 'Dead time', value: secs(theta) }),
  ];
  if (y63 != null) marks.push({ kind: 'guide', y: y63, from: f.xRange[0], to: ms(start + tau), dotted: true, label: { text: '63 % of the change' } });
  marks.push(spanMark(f, ms(start), ms(start + tau), tcLevel, { text: tau2 != null ? 'Slower time constant' : 'Time constant', value: secs(tau) }));
  if (tau2 != null && f.baseline != null && f.change != null) {
    marks.push(spanMark(f, ms(start), ms(start + tau2), f.baseline + 0.3 * f.change, { text: 'Faster time constant', value: secs(tau2) }));
  }
  const t63 = f.value('t63');
  if (t63 != null && y63 != null) marks.push({ kind: 'dot', x: ms(f.t0 + t63), y: y63, label: { text: 'Measured 63 %', value: secs(t63) }, side: 'bottom' });
  return {
    id: 'dead-time', title: 'Dead time and time constant', unit: f.pvUnit, height: TREND_HEIGHT, marks, series: [pvSeries(f)],
    help: [
      'Dead time and time constant are the fitted model\'s. The dead time runs from the step until PV starts to move; the time constant runs from there until PV has covered 63 % of its change.',
      ...(tau2 != null ? ['A second-order model has two time constants; the 63 % point then comes later than dead time plus the slower one.'] : []),
      ...(t63 != null ? ['The dot is where the measured PV first passed 63 % of the change and held it.'] : []),
    ],
  };
}
