// CHG-098 (SME review 2 #24): the default Performance gate view lists, per loop, only the checks behind its
// result - by readable name, with mark and word - and each check opens the same evidence as a matrix cell.
// Task 8: the verdict is the Result column, so G15 is not repeated as a check, and a quiet row says nothing.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { CpmHeatmapLoop } from '../../api/cpmApi';
import { MemoryRouter } from 'react-router-dom';
import { GateMatrixChecks } from './GateMatrixChecks';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => <button onClick={onClick}>{children}</button>,
}));

afterEach(cleanup);

const keys = ['G0', 'G1', 'G3', 'G5', 'G7', 'G14', 'G15'];
const row = (loopId: string, gates: Record<string, string>, diagnosis = 'SUSPECTED_STICTION') =>
  ({ loopId, displayName: `${loopId} loop`, loopType: 'flow', windowEnd: null, diagnosis, confidence: null, gates }) as CpmHeatmapLoop;

const show = (rows: CpmHeatmapLoop[], over: Partial<React.ComponentProps<typeof GateMatrixChecks>> = {}) => render(
  <MemoryRouter><GateMatrixChecks rows={rows} orderedGateKeys={keys} selectedLoopId={null} windowKind="12h"
    onSelectLoop={() => {}} onOpenLoop={() => {}} onOpenGate={() => {}} {...over} /></MemoryRouter>);

describe('GateMatrixChecks', () => {
  it('shows only the gates that move the result, named, and opens their evidence', () => {
    const onOpenGate = vi.fn();
    const onSelectLoop = vi.fn();
    show([row('FIC-1', { G0: 'PASS', G1: 'EXCLUDED_MODE', G3: 'FAIL', G5: 'PASS', G7: 'STRONG', G14: 'NOT_APPLICABLE', G15: 'SUSPECTED' })],
      { onOpenGate, onSelectLoop });
    const chips = document.querySelectorAll('[data-gate]');
    expect([...chips].map(c => c.getAttribute('data-gate'))).toEqual(['G1', 'G3', 'G7']);
    const g1 = screen.getByRole('button', { name: /^G1 Excluded, Mode \/ service: excluded on purpose/ });
    expect(g1.textContent).toContain('G1 Excluded');
    fireEvent.click(screen.getByRole('button', { name: /^G3 Failed, Base performance: check failed/ }));
    expect(onSelectLoop).toHaveBeenCalledWith('FIC-1');
    expect(onOpenGate).toHaveBeenCalledWith('FIC-1', 'G3');
  });

  it('reads each check as the code and its word, as the dialog will', () => {
    show([row('FIC-1', { G5: 'WARN', G15: 'SUSPECTED' })]);
    expect(screen.getByRole('button', { name: /^G5 / }).textContent).toBe('◐G5 Symptom seen');
  });

  it('says nothing about a loop with no check behind its result, and keeps the verdict in Result', () => {
    show([row('LIC-2', { G0: 'PASS', G15: 'NOT_EVALUATED' }, 'NOT_EVALUATED')]);
    expect(screen.queryByText('no other check moved this result')).toBeNull();
    expect(document.querySelectorAll('[data-gate]')).toHaveLength(0);
  });
});
