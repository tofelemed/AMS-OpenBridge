// v2.5 workbench (audit F15): the gates of the window as chips - status and run per gate, from the fused
// cells or the tier payload. Task 15: the strip and the dropdown became GateRail (GateRail.test.tsx).
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import { chipsOf } from './GateChipStrip';
import type { GateCatalogue } from '../../../api/cpm/catalogue';

afterEach(cleanup);

const catalogue = {
  count: 3, service: { version: '1', sourceCommit: 'x' },
  gates: [
    { gate: 'G0', name: 'Data quality', tier: 'short', role: 'BLOCKING' },
    { gate: 'G5', name: 'Oscillation (ACF)', tier: 'long', role: 'PRIMARY' },
    { gate: 'G15', name: 'Decision', tier: 'fusion', role: 'FUSION' },
  ],
} as unknown as GateCatalogue;

const fusedCells = [
  { key: 'G0', status: 'PASS', reason: null }, { key: 'G3', status: 'NOT_EVALUATED', reason: null },
  { key: 'G5', status: 'WARN', reason: 'BANDWIDTH' }, { key: 'G12', status: 'NOT_EVALUATED', reason: 'BANDWIDTH' }, { key: 'G15', status: 'SUSPECTED', reason: null },
];
const siblings = { G0: 'g0-run', G3: 'g3-run', G5: 'g5-run', G12: 'g12-run', G15: 'g15-run' };

describe('chipsOf', () => {
  it('builds seventeen chips in gate order from the fused cells, siblings and catalogue names', () => {
    const chips = chipsOf({ siblings, cells: fusedCells, result: null, catalogue });
    expect(chips).toHaveLength(17);
    expect(chips.map(c => c.gate).slice(0, 4)).toEqual(['G0', 'G1', 'G2', 'G2r']);
    const g5 = chips.find(c => c.gate === 'G5')!;
    expect(g5).toMatchObject({ name: 'Oscillation (ACF)', status: 'WARN', reason: 'BANDWIDTH', methodRunId: 'g5-run' });
    expect(g5.glyph.glyph).toBe('◐');
    expect(chips.find(c => c.gate === 'G1')).toMatchObject({ status: null, methodRunId: null });
  });

  it('falls back to the tier payload statuses on a short or long row', () => {
    const chips = chipsOf({ siblings: { G0: 'a', G3: 'b' }, cells: undefined, result: { gate0_status: 'PASS', gate3_status: 'FAIL', gate2r_status: 'PASS', gate0_reason: null }, catalogue });
    expect(chips.find(c => c.gate === 'G3')).toMatchObject({ status: 'FAIL', methodRunId: 'b' });
    expect(chips.find(c => c.gate === 'G2r')).toMatchObject({ status: 'PASS', methodRunId: null });
    expect(chips.find(c => c.gate === 'G5')).toMatchObject({ status: null, methodRunId: null });
  });
});
