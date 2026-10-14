// CHG-097 (SME review 2 #15): model parameters read in engineering names and the loop's units, and the interval says
// what it is — the kernel's placeholders (PV_EU, input_EU) and raw ids never reach the screen.
import { describe, expect, it } from 'vitest';
import { displayUnit, paramLabel, uncertaintyMeaning } from './responseSupport';

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
