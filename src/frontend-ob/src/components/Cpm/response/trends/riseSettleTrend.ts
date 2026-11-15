/**
 * CHG-197 trend 4, responses that level out: the measured 10 %, 50 % and 90 % crossings as dots, the rise time between 10 and
 * 90 %, the settling band and the settled point as the engine defines them, and on a setpoint step the settle-to-setpoint
 * point with its own band. A band is drawn only when it reproduces the engine's settled time (responseFacts).
 */
import type { Mark } from './annotations';
import { level, pvAt, responseBand, secs, targetBand, type ResponseFacts } from './responseFacts';
import { ms, placement, spanMark, pvSeries, setpointSeries, stepMark, TREND_HEIGHT, type TrendSpec } from './trendSupport';

const CROSSINGS: Array<[string, string, number]> = [['t10', '10 %', 0.1], ['t50', '50 %', 0.5], ['t90', '90 %', 0.9]];

export function riseSettleTrend(f: ResponseFacts): TrendSpec | null {
  if (f.censored || f.slope || f.baseline == null || f.final == null || f.change == null) return null;
  const ids = ['t10', 't50', 't90', 'rise_time_10_90', 'settle_response', 'settle_target'];
  if (ids.every(id => f.value(id) == null)) return null;
  const place = placement(f);
  const marks: Mark[] = [stepMark(f)];
  for (const [id, text, share] of CROSSINGS) {
    const t = f.value(id);
    if (t != null) marks.push({ kind: 'dot', x: ms(f.t0 + t), y: f.baseline + share * f.change, label: { text }, side: 'right' });
  }
  const t10 = f.value('t10'), t90 = f.value('t90'), rise = f.value('rise_time_10_90');
  if (rise != null && t10 != null && t90 != null) {
    marks.push(spanMark(f, ms(f.t0 + t10), ms(f.t0 + t90), f.baseline - 0.06 * place.range, { text: 'Rise time', value: secs(rise) }));
  }
  const settled = f.value('settle_response');
  const band = responseBand(f);
  if (band != null) {
    marks.push({ kind: 'band', x1: ms(f.t0), x2: f.xRange[1], y1: f.final - band, y2: f.final + band, label: { text: 'Settling band', value: `±${level(band)} ${f.pvUnit}` } });
  }
  if (settled != null) settlePoint(f, marks, settled, 'Settled');
  const atSp = f.value('settle_target');
  const spBand = targetBand(f);
  if (spBand != null && f.setpoint != null) {
    marks.push({ kind: 'band', x1: ms(f.t0), x2: f.xRange[1], y1: f.setpoint - spBand, y2: f.setpoint + spBand, label: { text: 'Setpoint band', value: `±${level(spBand)} ${f.pvUnit}` } });
  }
  if (atSp != null && f.setpoint != null) settlePoint(f, marks, atSp, 'At setpoint');
  return {
    id: 'rise-settle', title: 'Rise time and settling', unit: f.pvUnit, height: TREND_HEIGHT, marks, series: [pvSeries(f), ...setpointSeries(f)],
    help: [
      'The dots are where the measured PV first passed 10 %, 50 % and 90 % of its change and held it. Rise time runs from 10 % to 90 %.',
      ...(band != null ? [`Settling band: 2 % of the change or 0.1 ${f.pvUnit}, whichever is larger. Settled: from that time PV stays inside the band to the end of the event.`] : []),
      ...(settled != null && band == null ? ['Settled: from that time PV stays inside the engine\'s settling band to the end of the event.'] : []),
      ...(atSp != null ? [`At setpoint: from that time PV stays within ${spBand != null ? `${level(spBand)} ${f.pvUnit}` : 'the setpoint band'} of the setpoint to the end of the event.`] : []),
    ],
  };
}

/** A settled time is a sample time: the dot sits on that sample, with a guide down to the time axis. */
function settlePoint(f: ResponseFacts, marks: Mark[], t: number, text: string) {
  const y = pvAt(f.samples, f.t0 + t);
  marks.push({ kind: 'vguide', x: ms(f.t0 + t) });
  if (y != null) marks.push({ kind: 'dot', x: ms(f.t0 + t), y, label: { text, value: secs(t) }, side: 'bottom' });
  else marks.push({ kind: 'text', x: ms(f.t0 + t), y: f.final ?? y ?? 0, label: { text, value: secs(t) }, side: 'bottom' });
}
