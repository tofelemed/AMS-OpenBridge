// @vitest-environment jsdom
// Task 8: a gate opens in a dialog. Status, result and assessment first; Review and Window Inspector at the foot.
// CHG-156: short Prev / Next / Review labels, the result said once, no build or contract details.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { CpmHeatmapLoop } from '../../../api/cpmApi';
import { PerformanceGateDialog } from './PerformanceGateDialog';
import { gateMark } from '../gateStatus';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick, disabled, variant }: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean; variant?: string }) =>
    <button onClick={onClick} disabled={disabled} data-variant={variant}>{children}</button>,
}));
vi.mock('../../../hooks/useCpm', () => ({
  useLatestGates: () => ({
    isLoading: false, isError: false, error: null,
    data: {
      gates: [{ key: 'G5', status: 'WARN', reason: 'ACF peak 0.42 at 38 s', methodRunId: null }],
      metadata: { calculationVersion: '2.9' }, windowStart: null, windowEnd: null, observabilityFlags: [], sampleCount: 100,
    },
  }),
  useCpmCalculations: () => ({ data: { gates: [] } }),
  useCpmLoop: () => ({ data: undefined }),
  useGateCatalogue: () => ({ data: undefined }),
}));
afterEach(cleanup);

const ROW = {
  loopId: 'FIC10301', displayName: 'Feed flow', loopType: 'flow', windowEnd: '2026-11-04T12:15:00Z', diagnosis: 'CONFIRMED_OSCILLATION',
  confidence: 0.9, gates: { G4: 'PASS', G5: 'WARN', G6: 'PASS' },
  lastVerdict: { windowEnd: '2026-10-06T19:15:00Z', diagnosis: 'SUSPECTED_STICTION', confidence: 0.6, ageMs: 86_400_000 },
} as CpmHeatmapLoop;

const Where = () => { const l = useLocation(); return <output data-testid="where">{l.pathname + l.search}</output>; };
const show = (over: Partial<React.ComponentProps<typeof PerformanceGateDialog>> = {}) => {
  const onSelectGate = vi.fn();
  const onClose = vi.fn();
  render(
    <MemoryRouter initialEntries={['/cpm/performance']}>
      <PerformanceGateDialog row={ROW} gate="G5" windowKind="12h" gateKeys={['G4', 'G5', 'G6']} flags={[]}
        onSelectGate={onSelectGate} onClose={onClose} {...over} />
      <Where />
    </MemoryRouter>);
  return { onSelectGate, onClose };
};

describe('PerformanceGateDialog', () => {
  it('opens as a dialog named loop and gate, with the gate name and tier', () => {
    show();
    const d = screen.getByRole('dialog', { name: 'FIC10301 · G5' });
    expect(within(d).getByText('Oscillation (ACF)')).toBeTruthy();
    expect(within(d).getByText('Diagnostic evidence')).toBeTruthy();
  });

  it('builds check status from gateMark so it agrees with the cell', () => {
    show();
    const d = screen.getByRole('dialog');
    expect(within(d).getByText(gateMark('WARN', 'G5').word)).toBeTruthy();
  });

  it('shows the loop result, the reason and a last verdict labelled as last', () => {
    show();
    const d = screen.getByRole('dialog');
    expect(within(d).getByText('ACF peak 0.42 at 38 s')).toBeTruthy();
    expect(within(d).getByText(/^last verdict /)).toBeTruthy();
    expect(within(d).queryByText(/current/i)).toBeNull();
  });

  it('offers Review and Window Inspector, carrying loop and profile', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Window Inspector ↗' }));
    expect(screen.getByTestId('where').textContent).toBe('/cpm/windows?loop=FIC10301&profile=12h');
  });

  it('Review goes to Investigation on the same loop and window kind', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Review →' }));
    expect(screen.getByTestId('where').textContent).toMatch(/^\/cpm\/investigation\?loop=FIC10301&profile=12h/);
  });

  it('walks to the previous and next gate with short labels, naming the gate on hover, and not past the ends', () => {
    const { onSelectGate } = show();
    const prev = screen.getByRole('button', { name: 'Prev' });
    expect(prev.closest('[title]')?.getAttribute('title')).toBe('Previous gate G4');
    expect(screen.getByRole('button', { name: 'Next' }).closest('[title]')?.getAttribute('title')).toBe('Next gate G6');
    fireEvent.click(prev);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onSelectGate.mock.calls).toEqual([['G4'], ['G6']]);
    cleanup();
    show({ gate: 'G4' });
    expect(screen.queryByRole('button', { name: 'Prev' })).toBeNull();
  });

  it('says the result once when the last verdict is that same result', () => {
    show({ row: { ...ROW, lastVerdict: { diagnosis: 'CONFIRMED_OSCILLATION', confidence: 0.9, ageMs: 86_400_000 } } as CpmHeatmapLoop });
    const d = screen.getByRole('dialog');
    expect(within(d).queryByText(/last verdict/)).toBeNull();
    expect(within(d).getAllByText(/evidence score/)).toHaveLength(1);
  });

  it('offers the evidence under More about this gate as short flat links (CHG-157)', () => {
    show();
    const more = screen.getByRole('dialog').querySelector('details')!;
    const links = ['Workbench →', 'Replay →', 'Loop ↗'].map(name => within(more as HTMLElement).getByRole('button', { name }));
    for (const l of links) expect(l.getAttribute('data-variant')).toBe('flat');
    expect(more.querySelector('.cpm-gate-more__actions')).toBeTruthy();
  });

  it('shows no build or contract details under More about this gate', () => {
    show();
    const d = screen.getByRole('dialog');
    for (const gone of [/Calculation v/, /^Contract$/, /^Source$/, /^Emitted$/]) expect(within(d).queryByText(gone)).toBeNull();
    expect(within(d).getByText('Window from')).toBeTruthy();
  });

  it('keeps the rest of the evidence under one disclosure', () => {
    show();
    const d = screen.getByRole('dialog');
    const more = d.querySelector('details');
    expect(more).toBeTruthy();
    expect(more?.hasAttribute('open')).toBe(false);
    expect(within(d).getByText('What this gate asks')).toBeTruthy();
  });
});
