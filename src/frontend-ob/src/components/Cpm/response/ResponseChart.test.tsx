// v2.5 Task 2E.5 (spec §2.10, NR-034/035): the response chart draws the kernel's arrays only - the
// prediction band carries its meaning in its name, an integrating loop shows process_gain as "not
// applicable (integrating)" and never as 0, and the held input steps on its own unit axis.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { decoded } from '../evidence/views/fixtures';
import { ResponseChartBody } from './ResponseChart';
import { candidateRows, quantityText } from './responseSupport';
import type { ResponseQuantity } from '../../../api/cpm/response';

const captured: unknown[] = [];
vi.mock('echarts-for-react', () => ({ default: (props: { option: unknown }) => { captured.push(props.option); return React.createElement('div', { 'data-testid': 'echarts' }); } }));
afterEach(() => { cleanup(); captured.length = 0; });

type Opt = { series: Array<{ name: string; connectNulls?: boolean; step?: string; yAxisIndex?: number; lineStyle?: { width?: number }; data: unknown[] }>; yAxis: Array<{ name: string }> };
const q = (over: Partial<ResponseQuantity> & { quantityId: string }): ResponseQuantity => ({
  value: null, unit: '', pathId: 'OP_TO_PV', uncertainty: null, method: '', supportFromMs: null, supportToMs: null, configHash: 'b', reasonIfNull: '', ...over,
});

const T0S = 1_789_500_000;                           // epoch seconds, the kernel's time base
const ts = (n: number) => Array.from({ length: n }, (_, i) => T0S - 10 + i * 5);

describe('ResponseChart', () => {
  it('labels the prediction band with its meaning, keeps gaps, steps the held input on its own axis', () => {
    const t = ts(6);
    const byKind = {
      accepted_samples: [decoded({ gate: 'G12', kind: 'accepted_samples', role: 'OP_TO_PV', x: t, y: [100, 100, 101, 105, 110, 114], xQuantity: 'time', xUnit: 's', yQuantity: 'pv', yUnit: 'PV_EU', mask: [true, true, false, true, true, true] })],
      input_reconstruction: [decoded({ gate: 'G12', kind: 'input_reconstruction', role: 'OP_TO_PV', x: t, y: [40, 40, 45, 45, 45, 45], xQuantity: 'time', xUnit: 's', yQuantity: 'u_applied', yUnit: 'input_EU' })],
      y_fit: [decoded({ gate: 'G12', kind: 'y_fit', role: 'OP_TO_PV', x: t, y: [100, 100, 100.5, 104, 109, 113], xQuantity: 'time', xUnit: 's', yQuantity: 'pv_fit', yUnit: 'PV_EU' })],
      prediction_interval: [decoded({ gate: 'G12', kind: 'prediction_interval', role: 'OP_TO_PV', x: t, y: [101, 101, 101.5, 105, 110, 114], xQuantity: 'time', xUnit: 's', yQuantity: 'pv_prediction_upper', yUnit: 'PV_EU',
        columns: { lower: [99, 99, 99.5, 103, 108, 112] }, units: { lower: 'PV_EU' }, provenance: { band_meaning: 'PREDICTION_INTERVAL_OF_OUTPUT_NOT_PARAMETER_CONFIDENCE' } })],
      baseline: [decoded({ gate: 'G12', kind: 'baseline', role: 'OP_TO_PV', x: [T0S, T0S + 20], y: [100, 100], xQuantity: 'time', xUnit: 's', yQuantity: 'baseline_pv', yUnit: 'PV_EU' })],
      target: [decoded({ gate: 'G12', kind: 'target', role: 'OP_TO_PV', x: [T0S, T0S + 20], y: [115, 115], xQuantity: 'time', xUnit: 's', yQuantity: 'reference', yUnit: 'PV_EU' })],
      response_times: [decoded({ gate: 'G12', kind: 'response_times', role: 'OP_TO_PV', x: [6.1, 50.0], y: [10, 90], xQuantity: 'time_after_t0', xUnit: 's', yQuantity: 'progress_level', yUnit: '%' })],
    };
    render(<ResponseChartBody byKind={byKind} timeZone="UTC" t0Ms={T0S * 1000} metrics={[q({ quantityId: 'process_gain', value: 3, unit: 'PV_EU/input_EU', uncertainty: 0.02 })]} healthExclusions={[]} />);
    const out = captured[0] as Opt;
    const band = out.series.filter(s => /prediction interval of the output/i.test(s.name));
    expect(band).toHaveLength(2);                                                                // upper and lower, both named with the meaning
    expect(band.every(s => /not parameter confidence/i.test(s.name))).toBe(true);
    const pv = out.series.find(s => s.name === 'PV (accepted)')!;
    expect(pv.connectNulls).toBe(false);
    expect((pv.data as Array<[number, number | null]>)[2][1]).toBeNull();                        // the rejected sample is a gap
    expect((pv.data as Array<[number, number]>)[0][0]).toBe((T0S - 10) * 1000);                  // epoch seconds shown as time
    expect(out.yAxis.map(a => a.name)).toEqual(['PV_EU', '%']);                                  // response-time markers ride their own % axis
    const input = captured[1] as Opt;
    expect(input.series[0].step).toBe('end');                                                    // held input
    expect(input.yAxis.map(a => a.name)).toEqual(['input_EU']);
    expect(screen.getByText(/3\.00 PV_EU\/input_EU ± 0\.02/)).toBeTruthy();
  });

  it('integrating loop: process_gain is "not applicable (integrating)" - never 0', () => {
    const t = ts(3);
    const byKind = { accepted_samples: [decoded({ gate: 'G12', kind: 'accepted_samples', role: 'OP_TO_PV', x: t, y: [1, 1.1, 1.3], xQuantity: 'time', xUnit: 's', yQuantity: 'pv', yUnit: 'm' })] };
    render(<ResponseChartBody byKind={byKind} timeZone="UTC" t0Ms={T0S * 1000} healthExclusions={['F on PV 12:00-12:01']}
      metrics={[q({ quantityId: 'process_gain', value: null, unit: 'PV_EU/input_EU', reasonIfNull: 'INTEGRATING' }), q({ quantityId: 'integrating_gain', value: 0.000166667, unit: 'm/(s·pp)', method: 'IPDT_SLOPE_FIT' })]} />);
    expect(screen.getByText(/not applicable \(integrating\)/)).toBeTruthy();
    expect(screen.queryByText(/process gain[^]*\b0\.00\b/)).toBeNull();
    expect(screen.getByText(/F on PV 12:00-12:01/)).toBeTruthy();                                // exclusions are stated
  });

  it('quantityText and candidateRows re-shape the kernel text, never compute', () => {
    expect(quantityText(undefined)).toBe('not reported');
    expect(quantityText(q({ quantityId: 'dead_time', value: 4.2, unit: 's', uncertainty: 2.5 }))).toBe('4.20 s ± 2.50');
    expect(quantityText(q({ quantityId: 'gain_margin', value: null, unit: 'dB', reasonIfNull: 'CONTROLLER_FORM_UNKNOWN' }))).toBe('not applicable (controller form unknown)');
    const rows = candidateRows('FOPDT(OP_TO_PV: gain=3.0, theta=4.0, tau=20.0, tau2=NaN, zeta=NaN, wn=NaN) bounds_hit=false flat_delay=true sign_uncertain=false cond=10.5;SOPDT(OP_TO_PV: gain=3.1, theta=3.0, tau=18.0, tau2=2.0, zeta=NaN, wn=NaN) bounds_hit=true flat_delay=false sign_uncertain=false cond=1e9');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ family: 'FOPDT', path: 'OP_TO_PV', flatDelay: true, boundsHit: false, cond: '10.5' });
    expect(rows[0].parameters).toEqual([['gain', '3.0'], ['theta', '4.0'], ['tau', '20.0']]);   // NaN parameters are not parameters of that family
    expect(rows[1].boundsHit).toBe(true);
  });
});
