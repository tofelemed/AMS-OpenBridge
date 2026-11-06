// @vitest-environment jsdom
// Task 7: the gate summary is 17 count tiles under their tiers. A click still filters the list (?fg=); the tile shows the
// count and the code only, and the failed / attention split stays in its accessible name.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { CpmHeatmapLoop } from '../../api/cpmApi';
import { GateRollup } from './GateRollup';

afterEach(cleanup);

const ALL = ['G0', 'G1', 'G2', 'G2r', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12', 'G13', 'G14', 'G15'];
const loop = (id: string, gates: Record<string, string>): CpmHeatmapLoop =>
  ({ loopId: id, displayName: id, loopType: 'FLOW', windowEnd: null, diagnosis: 'NO_CALL', confidence: null, gates });

const LOOPS = [loop('A', { G5: 'FAIL' }), loop('B', { G5: 'FAIL' }), loop('C', { G5: 'WARN' }), loop('D', { G3: 'WARN' }), loop('E', {})];

describe('GateRollup', () => {
  it('filters the list from a gate tile and keeps the count split in its name', () => {
    const onSelectGate = vi.fn();
    render(<GateRollup loops={LOOPS} gateKeys={ALL} activeGate={null} onSelectGate={onSelectGate} />);
    const g5 = screen.getByRole('button', { name: /G5/ });
    expect(g5.getAttribute('aria-label')).toMatch(/3 .*G5.*2 failed, 1 need attention/);
    // the spoken name begins with the visible words, in order (axe label-content-name-mismatch)
    expect(g5.textContent).toBe('3 G5');
    expect(g5.getAttribute('aria-label')!.startsWith('3 G5')).toBe(true);
    fireEvent.click(g5);
    expect(onSelectGate).toHaveBeenCalledWith('G5');
  });

  it('shows all 17 gates once each, and a gate holding nothing back cannot be filtered on', () => {
    render(<GateRollup loops={LOOPS} gateKeys={ALL} activeGate={null} onSelectGate={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(17);
    expect((screen.getByRole('button', { name: /^G0 / }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a second click on the active tile clears the filter', () => {
    const onSelectGate = vi.fn();
    render(<GateRollup loops={LOOPS} gateKeys={ALL} activeGate="G5" onSelectGate={onSelectGate} />);
    const g5 = screen.getByRole('button', { name: /G5/ });
    expect(g5.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(g5);
    expect(onSelectGate).toHaveBeenCalledWith(null);
  });

  it('says so when no gate holds a loop back', () => {
    render(<GateRollup loops={[loop('E', {})]} gateKeys={ALL} activeGate={null} onSelectGate={() => {}} />);
    expect(screen.getByText(/No gate is holding back any loop/)).toBeTruthy();
  });
});
