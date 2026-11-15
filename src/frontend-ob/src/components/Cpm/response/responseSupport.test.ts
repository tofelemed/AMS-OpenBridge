// CHG-097 (SME review 2 #15): model parameters read in engineering names and the loop's units, and the interval says
// what it is — the kernel's placeholders (PV_EU, input_EU) and raw ids never reach the screen.
import { describe, expect, it } from 'vitest';
import type { ResponseQuantity } from '../../../api/cpm/response';
import { candidateRows, displayUnit, paramLabel, quantityText, uncertaintyMeaning } from './responseSupport';

describe('model parameter presentation (SME review 2 #15)', () => {
  it('maps the kernel unit placeholders to the loop PV unit and the path input', () => {
    expect(displayUnit('PV_EU/input_EU', 'OP_TO_PV', 'm3/h')).toBe('m3/h/% OP');
    expect(displayUnit('PV_EU/(input_EU*s)', 'VP_TO_PV', 'degC')).toBe('degC/(% VP*s)');
    expect(displayUnit('PV_EU/input_EU', 'SLAVE_SP_TO_PV', null)).toBe('PV unit/slave SP unit');
    expect(displayUnit('s', 'OP_TO_PV', 'm3/h')).toBe('s');
  });
  it('names parameters and their interval', () => {
    expect(paramLabel('process_gain')).toBe('Process gain');
    expect(paramLabel('dead_time')).toBe('Dead time');
    expect(uncertaintyMeaning('process_gain')).toBe('± 1 standard error of the estimate');
    expect(uncertaintyMeaning('dead_time')).toMatch(/equally good delays/);
  });
});

// v2.5 Task 2E.5 (moved from ResponseChart.test.tsx when CHG-197 retired that chart): the kernel text re-shaped, never computed
describe('quantityText and candidateRows', () => {
  const q = (over: Partial<ResponseQuantity> & { quantityId: string }): ResponseQuantity => ({
    value: null, unit: '', pathId: 'OP_TO_PV', uncertainty: null, method: '', supportFromMs: null, supportToMs: null, configHash: 'b', reasonIfNull: '', ...over,
  });
  it('an integrating loop: process_gain is "not applicable (integrating)", never 0', () => {
    expect(quantityText(q({ quantityId: 'process_gain', value: null, unit: 'PV_EU/input_EU', reasonIfNull: 'INTEGRATING' }))).toBe('not applicable (integrating)');
  });
  it('re-shapes the kernel text', () => {
    expect(quantityText(undefined)).toBe('not reported');
    expect(quantityText(q({ quantityId: 'dead_time', value: 4.2, unit: 's', uncertainty: 2.5 }))).toBe('4.20 s\u00a0±\u00a02.50');
    expect(quantityText(q({ quantityId: 'gain_margin', value: null, unit: 'dB', reasonIfNull: 'CONTROLLER_FORM_UNKNOWN' }))).toBe('not applicable (controller form unknown)');
    const rows = candidateRows('FOPDT(OP_TO_PV: gain=3.0, theta=4.0, tau=20.0, tau2=NaN, zeta=NaN, wn=NaN) bounds_hit=false flat_delay=true sign_uncertain=false cond=10.5;SOPDT(OP_TO_PV: gain=3.1, theta=3.0, tau=18.0, tau2=2.0, zeta=NaN, wn=NaN) bounds_hit=true flat_delay=false sign_uncertain=false cond=1e9');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ family: 'FOPDT', path: 'OP_TO_PV', flatDelay: true, boundsHit: false, cond: '10.5' });
    expect(rows[0].parameters).toEqual([['gain', '3.0'], ['theta', '4.0'], ['tau', '20.0']]);
    expect(rows[1].boundsHit).toBe(true);
  });
});
