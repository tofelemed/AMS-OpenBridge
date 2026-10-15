// CHG-098 (SME review 2 #24): the default Performance gate view lists, per loop, only the checks behind its
// result — by readable name, with mark and word — and each check opens the same evidence as a matrix cell.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { CpmHeatmapLoop } from '../../api/cpmApi';
import { GateMatrixChecks } from './GateMatrixChecks';

afterEach(cleanup);

const keys = ['G0', 'G1', 'G3', 'G5', 'G7', 'G14', 'G15'];
const row = (loopId: string, gates: Record<string, string>, diagnosis = 'SUSPECTED_STICTION') =>
  ({ loopId, displayName: `${loopId} loop`, loopType: 'flow', windowEnd: null, diagnosis, confidence: null, gates }) as CpmHeatmapLoop;

describe('GateMatrixChecks', () => {
  it('shows only the gates that move the result, named, and opens their evidence', () => {
    const onOpenGate = vi.fn();
    const onSelectLoop = vi.fn();
    render(<GateMatrixChecks
      rows={[row('FIC-1', { G0: 'PASS', G1: 'EXCLUDED_MODE', G3: 'FAIL', G5: 'PASS', G7: 'STRONG', G14: 'NOT_APPLICABLE', G15: 'SUSPECTED' })]}
      orderedGateKeys={keys} selectedLoopId={null} onSelectLoop={onSelectLoop} onOpenLoop={() => {}} onOpenGate={onOpenGate} />);
    const chips = document.querySelectorAll('[data-gate]');
    expect([...chips].map(c => c.getAttribute('data-gate'))).toEqual(['G1', 'G3', 'G7', 'G15']);
    expect(screen.getByText('Stiction shape')).toBeTruthy();
    const g1 = screen.getByRole('button', { name: /G1 Mode \/ service: excluded on purpose/ });
    expect(g1.textContent).toContain('Excluded');
    fireEvent.click(screen.getByRole('button', { name: /G3 Base performance: check failed/ }));
    expect(onSelectLoop).toHaveBeenCalledWith('FIC-1');
    expect(onOpenGate).toHaveBeenCalledWith('FIC-1', 'G3');
  });

  it('says so when nothing but the verdict is behind the result', () => {
    render(<GateMatrixChecks rows={[row('LIC-2', { G0: 'PASS', G15: 'NOT_EVALUATED' }, 'NOT_EVALUATED')]}
      orderedGateKeys={keys} selectedLoopId={null} onSelectLoop={() => {}} onOpenLoop={() => {}} onOpenGate={() => {}} />);
    expect(screen.getByText('no other check moved this result')).toBeTruthy();
    expect(screen.getByRole('button', { name: /G15 Diagnosis band: not evaluated/ })).toBeTruthy();
  });
});
