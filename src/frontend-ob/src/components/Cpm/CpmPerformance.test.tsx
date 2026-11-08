// @vitest-environment jsdom
// Task 8: a gate opens in a dialog and no column; the selected-loop band appears only after a selection;
// a last verdict is named as last, in the band and the dialog only.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CpmPerformance from './CpmPerformance';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick, disabled }: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    <button onClick={onClick} disabled={disabled}>{children}</button>,
}));
const kpiProps = vi.hoisted(() => ({ last: undefined as undefined | { fleetTotal: number | null } }));
vi.mock('./performance/PerformanceKpis', () => {
  const C = (p: { fleetTotal: number | null }) => { kpiProps.last = p; return null; };
  return { default: C, PerformanceKpis: C };
});
vi.mock('./performance/HowToReadDialog', () => ({ default: () => null }));
vi.mock('./plantScope', () => ({ useCpmScope: () => ({ params: {} }) }));
vi.mock('./kpi/useFleetKpis', () => ({ useFleetKpis: () => ({ data: undefined, isError: false }) }));

const KEYS = ['G0', 'G3', 'G5', 'G15'];
const ROWS = [{
  loopId: 'FIC10301', displayName: 'Feed flow', loopType: 'flow', windowEnd: null, diagnosis: 'NOT_EVALUATED', confidence: null,
  gates: { G0: 'PASS', G3: 'PASS', G5: 'WARN', G15: 'NOT_EVALUATED' },
  lastVerdict: { windowEnd: '2026-10-06T19:15:00Z', diagnosis: 'SUSPECTED_STICTION', confidence: 0.6, ageMs: 5 * 86_400_000 },
}];
vi.mock('../../hooks/useCpm', () => ({
  useCpmLoops: () => ({ data: { loops: [] } }),
  useCpmResolutions: () => ({ data: { fusion: { firesOn: ['12h', '24h'] }, windows: [] } }),
  useFleetSummary: () => ({ data: { loops: { total: 5, monitored: 3 } } }),
  useFleetHeatmap: () => ({ data: { loops: ROWS, gateKeys: KEYS, total: 1 }, isLoading: false, isError: false }),
  useFleetRankings: () => ({ data: undefined }),
  useLatestGates: () => ({
    isLoading: false, isError: false, error: null,
    data: { gates: [{ key: 'G5', status: 'WARN', reason: 'ACF peak', methodRunId: null }], metadata: {}, windowStart: null, windowEnd: null, observabilityFlags: [] },
  }),
  useCpmCalculations: () => ({ data: { gates: [] } }),
  useCpmLoop: () => ({ data: undefined }),
  useGateCatalogue: () => ({ data: undefined }),
}));
afterEach(cleanup);

const page = (url: string) => render(<MemoryRouter initialEntries={[url]}><CpmPerformance /></MemoryRouter>);

describe('Performance list', () => {
  it('opens a gate in a dialog, not a side column', () => {
    const { container } = page('/cpm/performance?rows=all&view=matrix');
    fireEvent.click(screen.getByRole('button', { name: /^FIC10301, gate G5/ }));
    expect(screen.getByRole('dialog', { name: 'FIC10301 · G5' })).toBeTruthy();
    expect(container.querySelector('.cpm-matrix-layout--split')).toBeNull();
    expect(container.querySelector('.cpm-inspector')).toBeNull();
  });

  it('shows the selected-loop band only once a loop is selected', () => {
    page('/cpm/performance?rows=all');
    expect(screen.queryByRole('region', { name: 'Selected loop' })).toBeNull();
    cleanup();
    page('/cpm/performance?rows=all&loop=FIC10301');
    const band = screen.getByRole('region', { name: 'Selected loop' });
    expect(within(band).getByText('FIC10301')).toBeTruthy();
    expect(within(band).getByRole('button', { name: 'Review FIC10301 →' })).toBeTruthy();
    expect(within(band).getByRole('button', { name: 'Open loop' })).toBeTruthy();
  });

  it('labels a last verdict as last, in the band and the dialog only', () => {
    page('/cpm/performance?rows=all');
    expect(screen.queryAllByText(/last verdict/)).toHaveLength(0);
    cleanup();
    page('/cpm/performance?rows=all&loop=FIC10301&gate=G5');
    const band = screen.getByRole('region', { name: 'Selected loop' });
    const dialog = screen.getByRole('dialog');
    expect(within(band).getByText(/^last verdict /)).toBeTruthy();
    expect(within(dialog).getByText(/^last verdict /)).toBeTruthy();
    expect(screen.getAllByText(/last verdict/)).toHaveLength(2);
    expect(screen.queryByText(/current/i)).toBeNull();
  });

  it('has no ? on the page title (CHG-156)', () => {
    page('/cpm/performance?rows=all');
    expect(screen.getByRole('heading', { level: 1, name: 'Performance' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Performance' })).toBeNull();
  });

  it('puts the Findings / Gate matrix toggle beside How to read, at the top right of the panel (CHG-156)', () => {
    page('/cpm/performance?rows=all');
    const right = screen.getByRole('button', { name: 'How to read' }).closest('.cpm-panel-head__right')!;
    const toggle = within(right as HTMLElement).getByRole('group', { name: 'Performance list view' });
    fireEvent.click(within(toggle).getByRole('button', { name: 'Gate matrix' }));
    expect(screen.getByRole('grid', { name: 'Gates by loop' })).toBeTruthy();
  });

  it('no longer carries the old ranking list or its words', () => {
    page('/cpm/performance?rows=all');
    for (const gone of ['Opportunity ranking', 'Loops needing attention', 'driven by', 'Selected row · latest fused result', 'Final diagnosis'])
      expect(screen.queryByText(new RegExp(gone))).toBeNull();
  });

  // CHG-153: the capability tile's X/Y counts one population, the monitored loops (its drill-down), not every active loop
  it('hands the capability tile the monitored loops as its total', () => {
    page('/cpm/performance?rows=all');
    expect(kpiProps.last?.fleetTotal).toBe(3);
  });
});
