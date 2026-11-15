/**
 * CHG-197 (owner Q10): what the System Response trends draw, read from the event's G12 arrays and its quantities only (no new
 * request). Every value drawn is the engine's: a quantity the engine marked unavailable is null here and draws nothing.
 * Two marks the arrays alone cannot carry are drawn only after this module has reproduced the engine's own number from the
 * stored arrays with the engine's rule (ResponseMetricCalculator, Settling, ErrorIntegrals): the settling bands (the band is not
 * stored) and the error trend (the per-sample setpoint is not stored). Where the reproduction differs, the mark is left out.
 * CHG-198: a redraw from the historian hands the same arrays built from the historian's samples (redraw/redrawArtifacts), plus
 * the setpoint of every sample (`historian_sp`), which the error trend then uses with the same reproduction rule.
 */
import type { ResponseEventDetail, ResponseQuantity } from '../../../../api/cpm/response';
import type { DecodedArtifact } from '../../evidence/artifactCodec';
import { readable } from '../../evidence/format';
import { pathLabel } from '../responseLabels';
import { displayUnit, metricOf } from '../responseSupport';

export interface ResponseFacts {
  /** The step and the event end, epoch seconds (the engine's time base). */
  t0: number;
  tEnd: number;
  /** The one time range every trend of the tab draws (ms), so their cursor and zoom line up. */
  xRange: [number, number];
  pathId: string;
  pvUnit: string;
  /** "OP" on an OP → PV path. */
  inputName: string;
  inputUnit: string;
  censored: boolean;
  samples: DecodedArtifact;
  input?: DecodedArtifact;
  fit?: DecodedArtifact;
  predict?: DecodedArtifact;
  band?: DecodedArtifact;
  /** CHG-198: the setpoint of every sample, on the samples' times; only a redraw from the historian has it. */
  sp?: DecodedArtifact;
  /** The engine's value of a quantity, or null when it marked it unavailable (or did not report it). */
  value: (id: string) => number | null;
  quantity: (id: string) => ResponseQuantity | undefined;
  /** In the loop's units ("PV_EU*s" → "m3/h·s"). */
  unitOf: (kernelUnit: string | null | undefined) => string;
  baseline: number | null;
  final: number | null;
  /** Final value − baseline, when both exist. */
  change: number | null;
  /** The setpoint the engine held after the step (its target array), on every event. */
  reference: number | null;
  /** The setpoint after and before the step, on a setpoint step only. */
  setpoint: number | null;
  setpointBefore: number | null;
  /** A level or ramp response (the engine reported the post-event slope): no time constant, no settling. */
  slope: boolean;
}

/** Seconds as read on a label: "34.2 s", "120 s". */
export const secs = (v: number) => `${readable(v)} s`;
/** A PV level or change: four significant figures ("134.6"). */
export const level = (v: number) => readable(v, 4);

const valid = (d: DecodedArtifact, i: number) => (d.mask ? d.mask[i] : true);

export function buildFacts(args: {
  byKind: Record<string, DecodedArtifact[]>; metrics: ResponseQuantity[] | undefined; result: ResponseEventDetail['result'] | undefined;
  t0Ms: number; pvUnit?: string | null;
}): ResponseFacts | null {
  const one = (k: string) => args.byKind[k]?.[0];
  const samples = one('accepted_samples');
  if (!samples || samples.n === 0) return null;
  const marker = one('response_event');
  const target = one('target');
  const t0 = marker && marker.n > 0 ? marker.columns.x[0] : args.t0Ms / 1000;
  const last = samples.columns.x[samples.n - 1];
  const tEnd = marker && marker.n > 1 ? marker.columns.x[1] : target && target.n > 1 ? target.columns.x[1] : last;
  const pathId = String(args.result?.path_id ?? samples.meta.roleOrPath ?? '');
  const quantity = (id: string) => metricOf(args.metrics, id);
  const value = (id: string) => { const v = quantity(id)?.value; return v == null || !Number.isFinite(v) ? null : v; };
  // "PV_EU^2*s" reads "(m3/h)²·s": the square belongs to the whole unit
  const unitOf = (u: string | null | undefined) =>
    displayUnit((u ?? '').replace(/PV_EU\^2/g, '(PV_EU)^2'), pathId, args.pvUnit).replace(/\*/g, '·').replace(/\^2/g, '²');
  const baseline = value('baseline_pv');
  const final = value('endpoint_pv');
  const spStep = value('sp_step');
  const r1 = target && target.n > 0 ? target.columns.y[0] : null;
  const censored = [args.result?.capture_state, args.result?.evaluation_state].includes('CENSORED');
  return {
    t0, tEnd, pathId,
    xRange: [Math.min(samples.columns.x[0], t0) * 1000, Math.max(last, tEnd) * 1000],
    pvUnit: unitOf('PV_EU'),
    inputName: pathId ? pathLabel(pathId).split(' → ')[0] : 'Input',
    inputUnit: unitOf('input_EU'),
    censored,
    samples, input: one('input_reconstruction'), fit: one('y_fit'), predict: one('y_predict'), band: one('prediction_interval'), sp: one('historian_sp'),
    value, quantity, unitOf,
    baseline, final, change: baseline != null && final != null ? final - baseline : null,
    reference: r1,
    setpoint: spStep != null && r1 != null ? r1 : null,
    setpointBefore: spStep != null && r1 != null ? r1 - spStep : null,
    slope: value('post_slope') != null,
  };
}

/** The PV of the sample at an instant the engine reported as a sample time (a settled point), or null. */
export function pvAt(d: DecodedArtifact, tS: number): number | null {
  for (let i = 0; i < d.n; i++) if (Math.abs(d.columns.x[i] - tS) < 1e-6) return d.columns.y[i];
  return null;
}

/** The valid PV range after the step, to place labels (placement only, never a value). */
export function pvSpan(d: DecodedArtifact): { min: number; max: number } {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < d.n; i++) {
    const y = d.columns.y[i];
    if (!valid(d, i) || !Number.isFinite(y)) continue;
    if (y < min) min = y;
    if (y > max) max = y;
  }
  return Number.isFinite(min) ? { min, max } : { min: 0, max: 1 };
}

/** Settling.settle: walk back from the last valid sample while inside the band, stopping at a gap longer than maxGapS. */
export function settleEntry(d: DecodedArtifact, t0: number, centre: number, band: number, maxGapS = 60): number | null {
  const t = d.columns.x, y = d.columns.y;
  let lastValid = -1;
  for (let i = d.n - 1; i >= 0; i--) if (valid(d, i) && t[i] >= t0) { lastValid = i; break; }
  if (lastValid < 0) return null;
  let firstInside = -1;
  let prevT = t[lastValid];
  for (let i = lastValid; i >= 0 && t[i] >= t0; i--) {
    if (!valid(d, i)) continue;
    if (prevT - t[i] > maxGapS) break;
    if (Math.abs(y[i] - centre) > band) break;
    firstInside = i;
    prevT = t[i];
  }
  return firstInside < 0 ? null : t[firstInside] - t0;
}

const same = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));

/**
 * The settling band the engine used (Settling.responseBand with the factory settings: 0.1 PV unit, 2 % of the change, at
 * least 0.05), returned only when the engine's settled time is reproduced with it from the stored samples; a bundle that
 * changed the band, or a gap rule that differs, gives a different time and no band is drawn.
 */
export function responseBand(f: ResponseFacts): number | null {
  const ts = f.value('settle_response');
  if (ts == null || f.final == null || f.change == null) return null;
  const band = Math.max(0.1, 0.02 * Math.abs(f.change), 0.05);
  const entry = settleEntry(f.samples, f.t0, f.final, band);
  return entry != null && same(entry, ts) ? band : null;
}

/** The setpoint band (0.5 PV unit, the engine's targetBandEu), returned only when it reproduces settle_target. */
export function targetBand(f: ResponseFacts): number | null {
  const ts = f.value('settle_target');
  if (ts == null || f.setpoint == null) return null;
  const entry = settleEntry(f.samples, f.t0, f.setpoint, 0.5);
  return entry != null && same(entry, ts) ? 0.5 : null;
}

export interface ErrorInterval { a: number; b: number; e: number }

/**
 * ErrorIntegrals.over with the setpoint the engine held (the setpoint before the step for the sample that straddles it, the
 * setpoint after the step from then on). Returns the intervals only when IAE, ISE and ITAE all reproduce the engine's values;
 * a setpoint that moved inside the event (not stored) gives other integrals and nothing is returned. CHG-198: with the setpoint
 * of every sample (a redraw from the historian) each sample's own setpoint is used, as the engine does.
 */
export function errorIntervals(f: ResponseFacts): ErrorInterval[] | null {
  const iae = f.value('iae'), ise = f.value('ise'), itae = f.value('itae');
  const r1 = f.reference;
  const sp = f.sp?.n === f.samples.n ? f.sp.columns.y : null;
  if (iae == null || ise == null || itae == null || (r1 == null && !sp)) return null;
  const r0 = f.setpointBefore ?? r1;
  const d = f.samples, t = d.columns.x, y = d.columns.y;
  const out: ErrorInterval[] = [];
  let sa = 0, ss = 0, st = 0;
  for (let i = 0; i < d.n; i++) {
    const a = Math.max(t[i], f.t0);
    const b = Math.min(i + 1 < d.n ? t[i + 1] : f.tEnd, f.tEnd);
    if (b <= a || !valid(d, i)) continue;
    const e = (sp ? sp[i] : t[i] >= f.t0 ? r1! : r0!) - y[i];
    if (!Number.isFinite(e)) continue;
    sa += Math.abs(e) * (b - a);
    ss += e * e * (b - a);
    st += 0.5 * Math.abs(e) * ((b - f.t0) ** 2 - (a - f.t0) ** 2);
    out.push({ a, b, e });
  }
  return out.length > 0 && same(sa, iae) && same(ss, ise) && same(st, itae) ? out : null;
}
