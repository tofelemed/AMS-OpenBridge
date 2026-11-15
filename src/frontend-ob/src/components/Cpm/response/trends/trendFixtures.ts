// CHG-197 test fixtures: three response events as the G12 kernel stores them (epoch-second arrays, PV_EU quantities): a
// self-regulating input test, a setpoint step that overshoots, and a level (integrating) input test.
import type { ResponseEventDetail, ResponseQuantity } from '../../../../api/cpm/response';
import { decoded } from '../../evidence/views/fixtures';
import type { DecodedArtifact } from '../../evidence/artifactCodec';

export const T0S = 1_789_500_000;
const grid = (from: number, to: number, dt = 2) => { const t: number[] = []; for (let s = from; s <= to; s += dt) t.push(T0S + s); return t; };

export const q = (quantityId: string, value: number | null, unit = '', method = 'OBSERVED_RESPONSE_V1'): ResponseQuantity => ({
  quantityId, value, unit, pathId: 'OP_TO_PV', uncertainty: null, method, supportFromMs: null, supportToMs: null, configHash: 'b', reasonIfNull: value == null ? 'NOT_APPLICABLE' : '',
});

export const result = (over: Record<string, unknown> = {}): ResponseEventDetail['result'] => ({
  event_id: 'e1', method_run_id: 'r1', loop_id: 'FIC1', path_id: 'OP_TO_PV', evaluation_state: 'EVALUATED', eligibility: 'ELIGIBLE',
  finding: 'RESPONSE_CHARACTERISED', model_state: 'CANDIDATE', subgates: {}, window_start_ms: T0S * 1000, window_end_ms: (T0S + 600) * 1000,
  bundle_hash: 'b', purpose: 'LIVE', ...over,
});

const art = (kind: string, x: number[], y: number[], extra: Partial<Parameters<typeof decoded>[0]> = {}) =>
  decoded({ gate: 'G12', kind, role: 'OP_TO_PV', x, y, xQuantity: 'time', xUnit: 's', yUnit: 'PV_EU', ...extra });

/** ErrorIntegrals.over with a constant setpoint after the step (r0 before it). */
export function integrals(t: number[], y: number[], r0: number, r1: number, tEnd: number) {
  let iae = 0, ise = 0, itae = 0;
  for (let i = 0; i < t.length; i++) {
    const a = Math.max(t[i], T0S), b = Math.min(i + 1 < t.length ? t[i + 1] : tEnd, tEnd);
    if (b <= a) continue;
    const e = (t[i] >= T0S ? r1 : r0) - y[i];
    iae += Math.abs(e) * (b - a); ise += e * e * (b - a); itae += 0.5 * Math.abs(e) * ((b - T0S) ** 2 - (a - T0S) ** 2);
  }
  return { iae, ise, itae };
}

export interface EventFixture { byKind: Record<string, DecodedArtifact[]>; metrics: ResponseQuantity[]; result: ResponseEventDetail['result'] }

/** Input test on a flow loop: dead time 34 s, PV 120 → 134.6, exactly at the final value from 410 s (settling band ±0.292). */
export function selfRegulating(): EventFixture {
  const t = grid(-60, 600);
  const y = t.map(s => { const k = s - T0S; return k < 34 ? 120 : k < 410 ? 120 + 14 * (k - 34) / (408 - 34) : 134.6; });
  const u = t.map(s => (s < T0S ? 42 : 46));
  const tEnd = T0S + 600;
  const sp = 130;
  const e = integrals(t, y, sp, sp, tEnd);
  return {
    result: result(),
    byKind: {
      response_event: [art('response_event', [T0S, tEnd], [0, 1], { yUnit: 'index' })],
      accepted_samples: [art('accepted_samples', t, y, { mask: t.map(() => true) })],
      input_reconstruction: [art('input_reconstruction', t, u, { yUnit: 'input_EU' })],
      y_fit: [art('y_fit', t, y.map(v => v + 0.05))],
      baseline: [art('baseline', [T0S, tEnd], [120, 120])],
      target: [art('target', [T0S, tEnd], [sp, sp])],
    },
    metrics: [
      q('input_step', 4, 'input_EU'), q('sp_step', null, 'PV_EU'), q('baseline_pv', 120, 'PV_EU'), q('endpoint_pv', 134.6, 'PV_EU'),
      q('process_gain', 3.65, 'PV_EU/input_EU', 'MODEL_FOPDT'), q('integrating_gain', null, 'PV_EU/(input_EU*s)', 'MODEL_FOPDT'),
      q('dead_time', 34, 's', 'MODEL_FOPDT'), q('time_constant', 120, 's', 'MODEL_FOPDT'),
      q('t10', 71.4, 's'), q('t50', 221, 's'), q('t63', 154.1, 's'), q('t90', 321.4, 's'), q('rise_time_10_90', 250, 's'),
      q('settle_response', 410, 's'), q('settle_target', null, 's'), q('overshoot', 0, '% of response change'), q('undershoot', 0, '% of response change'),
      q('peak_time', null, 's'), q('peak_pv', null, 'PV_EU'), q('steady_error', null, 'PV_EU'), q('decay_ratio', 0.25, 'dimensionless'),
      q('iae', e.iae, 'PV_EU*s', 'HELD_INTERVAL_INTEGRALS_V1'), q('ise', e.ise, 'PV_EU^2*s', 'HELD_INTERVAL_INTEGRALS_V1'), q('itae', e.itae, 'PV_EU*s^2', 'HELD_INTERVAL_INTEGRALS_V1'),
      q('post_slope', null, 'PV_EU/s'),
    ],
  };
}

/** Setpoint step 50 → 60 in Auto: PV peaks at 61.73 at 95 s (18 % overshoot) and ends at 59.6, 0.4 below the setpoint. */
export function setpointStep(): EventFixture {
  const t = grid(-60, 480);
  const y = t.map(s => { const k = s - T0S; return k < 10 ? 50 : k < 95 ? 50 + 11.728 * (k - 10) / 85 : k < 200 ? 61.728 - 2.128 * (k - 95) / 105 : 59.6; });
  const tEnd = T0S + 480;
  const e = integrals(t, y, 50, 60, tEnd);
  return {
    result: result(),
    byKind: {
      response_event: [art('response_event', [T0S, tEnd], [0, 1], { yUnit: 'index' })],
      accepted_samples: [art('accepted_samples', t, y, { mask: t.map(() => true) })],
      input_reconstruction: [art('input_reconstruction', t, t.map(s => (s < T0S ? 35 : 40)), { yUnit: 'input_EU' })],
      baseline: [art('baseline', [T0S, tEnd], [50, 50])],
      target: [art('target', [T0S, tEnd], [60, 60])],
    },
    metrics: [
      q('input_step', null, 'input_EU'), q('sp_step', 10, 'PV_EU'), q('baseline_pv', 50, 'PV_EU'), q('endpoint_pv', 59.6, 'PV_EU'),
      q('overshoot', 18, '% of response change'), q('undershoot', 0, '% of response change'), q('peak_time', 95, 's'), q('peak_pv', 61.728, 'PV_EU'),
      q('steady_error', 0.4, 'PV_EU'), q('decay_ratio', 0.25, 'dimensionless'), q('settle_response', 200, 's'), q('settle_target', null, 's'),
      q('t10', 18.2, 's'), q('t50', 50.9, 's'), q('t63', 61.7, 's'), q('t90', 83.6, 's'), q('rise_time_10_90', 65.4, 's'),
      q('iae', e.iae, 'PV_EU*s'), q('ise', e.ise, 'PV_EU^2*s'), q('itae', e.itae, 'PV_EU*s^2'), q('post_slope', null, 'PV_EU/s'),
    ],
  };
}

/** Input test on a level loop (integrating with dead time): the level keeps rising 0.02 m/s from 30 s; no final value. */
export function levelLoop(): EventFixture {
  const t = grid(-60, 480);
  const y = t.map(s => { const k = s - T0S; return k < 30 ? 40 : 40 + 0.02 * (k - 30); });
  const tEnd = T0S + 480;
  return {
    result: result(),
    byKind: {
      response_event: [art('response_event', [T0S, tEnd], [0, 1], { yUnit: 'index' })],
      accepted_samples: [art('accepted_samples', t, y, { mask: t.map(() => true) })],
      input_reconstruction: [art('input_reconstruction', t, t.map(s => (s < T0S ? 50 : 55)), { yUnit: 'input_EU' })],
      y_fit: [art('y_fit', t, y)],
      baseline: [art('baseline', [T0S, tEnd], [40, 40])],
      target: [art('target', [T0S, tEnd], [45, 45])],
    },
    metrics: [
      q('input_step', 5, 'input_EU'), q('sp_step', null, 'PV_EU'), q('baseline_pv', 40, 'PV_EU'), q('endpoint_pv', null, 'PV_EU'),
      q('process_gain', null, 'PV_EU/input_EU', 'MODEL_IPDT'), q('integrating_gain', 0.004, 'PV_EU/(input_EU*s)', 'MODEL_IPDT'),
      q('dead_time', 30, 's', 'MODEL_IPDT'), q('post_slope', 0.02, 'PV_EU/s', 'THEIL_SEN'),
      q('t10', null, 's'), q('t50', null, 's'), q('t63', null, 's'), q('t90', null, 's'), q('rise_time_10_90', null, 's'),
      q('settle_response', null, 's'), q('overshoot', null, '% of response change'), q('peak_time', null, 's'),
      q('iae', null, 'PV_EU*s'), q('ise', null, 'PV_EU^2*s'), q('itae', null, 'PV_EU*s^2'),
    ],
  };
}
