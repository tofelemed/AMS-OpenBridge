// v2.5 workbench (audit F15): the gates of the window as ONE row of status chips - the matrix's own
// glyph vocabulary (✓ ! × —) grouped by tier, every chip a selector (click / arrow keys / Enter),
// the selected gate marked, a gate with no run on this tier disabled with the reason on hover.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { chipsOf, GateChipStrip, type GateChip } from './GateChipStrip';
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

describe('GateChipStrip', () => {
  const chips: GateChip[] = chipsOf({ siblings, cells: fusedCells, result: null, catalogue });

  it('renders five tier groups with labelled, glyph-bearing, accessible chips and marks the selected gate', () => {
    render(<GateChipStrip chips={chips} selected="G5" onOpen={() => {}} />);
    const groups = screen.getAllByRole('group');
    expect(groups.map(g => g.getAttribute('aria-label'))).toEqual(['Eligibility', 'Performance', 'Diagnostic evidence', 'Confirmation', 'Fusion']);
    const g5 = screen.getByRole('button', { name: 'G5 Oscillation (ACF): symptom seen, limited by the sampling rate' });
    expect(g5.getAttribute('aria-current')).toBe('true');
    expect(g5.textContent).toContain('◐G5Seen');
    expect(screen.getByRole('button', { name: 'G0 Data quality: check passed' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('button', { name: /^G12 / }).textContent).toContain('—');
  });

  it('opens a gate on click and disables gates with no run on this tier, saying why', () => {
    const onOpen = vi.fn();
    render(<GateChipStrip chips={chips} selected="G5" onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'G0 Data quality: check passed' }));
    expect(onOpen).toHaveBeenCalledWith('G0', 'g0-run');
    const g1 = screen.getByRole('button', { name: /^G1 / });
    expect((g1 as HTMLButtonElement).disabled).toBe(true);
    expect(g1.getAttribute('title')).toMatch(/no run on this tier/);
  });

  it('moves a roving tab stop with the arrow keys and skips disabled chips', () => {
    render(<GateChipStrip chips={chips} selected="G0" onOpen={() => {}} />);
    const g0 = screen.getByRole('button', { name: /^G0 / });
    expect(g0.getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(g0, { key: 'ArrowRight' });
    const g3 = screen.getByRole('button', { name: /^G3 / });
    expect(g3.getAttribute('tabindex')).toBe('0');               // G1, G2, G2r have no run: skipped
    expect(g0.getAttribute('tabindex')).toBe('-1');
    fireEvent.keyDown(g3, { key: 'End' });
    expect(screen.getByRole('button', { name: /^G15 / }).getAttribute('tabindex')).toBe('0');
  });
});
