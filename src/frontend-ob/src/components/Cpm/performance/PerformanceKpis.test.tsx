// @vitest-environment jsdom
// Task 7: four fleet tiles. Each opens a dialog with its basis and the way to the loops behind it.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { FleetPerformance } from '../../../api/cpm/fleetKpis';
import { PerformanceKpis } from './PerformanceKpis';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => <button onClick={onClick}>{children}</button>,
}));
afterEach(cleanup);

const P: FleetPerformance = {
  monitored: 313, assessed: 72, excluded: { notAssessable: 0, stale: 165, neverEvaluated: 76 },
  goodError: { meanPct: 71.25, medianPct: 75, counted: 72, notMeasured: 0 },
  errorOfSpan: { medianPct: 1.84, counted: 72, noSpan: 0, notMeasured: 0 },
  periodic: { count: 9, of: 72 },
};
const CAP = { loopsCappedByMissingVp: 4, loopsWithoutDisturbanceContext: 0 };

const Where = () => {
  const l = useLocation();
  return <output data-testid="where">{l.pathname + l.search}</output>;
};
const show = (over: Partial<React.ComponentProps<typeof PerformanceKpis>> = {}) => render(
  <MemoryRouter initialEntries={['/cpm/performance']}>
    <PerformanceKpis performance={P} fleetTotal={72} capability={CAP} scope={{}} windowKind="12h" healthFiltered={false} {...over} />
    <Where />
  </MemoryRouter>);

describe('PerformanceKpis', () => {
  it('reads as four short tiles', () => {
    const { container } = show();
    expect([...container.querySelectorAll('.cpm-kpi__caption')].map(c => c.textContent))
      .toEqual(['Good-error time', 'Median error', 'Periodic diagnosis', 'Diagnostic capability']);
    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(screen.queryByText(/approved test record/)).toBeNull();
    expect(screen.queryByText(/excluded/)).toBeNull();
  });

  it('opens a tile as a dialog with its basis and the way to its loops', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: /Good-error time/ }));
    const dialog = screen.getByRole('dialog', { name: 'Good-error time' });
    expect(within(dialog).getByText(/72 of 72 assessed loops contribute/)).toBeTruthy();
    expect(within(dialog).getByText(/165 stale, 76 never evaluated/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Show the loops' }));
    expect(screen.getByTestId('where').textContent).toMatch(/^\/cpm\?review=assessed/);
  });

  it('every tile reaches its own loops', () => {
    const goes = (name: RegExp) => {
      const { unmount } = show();
      fireEvent.click(screen.getByRole('button', { name }));
      fireEvent.click(screen.getByRole('button', { name: 'Show the loops' }));
      const at = screen.getByTestId('where').textContent;
      unmount();
      return at;
    };
    expect(goes(/Median error/)).toMatch(/review=assessed/);
    expect(goes(/Periodic diagnosis/)).toMatch(/review=periodic/);
    expect(goes(/Diagnostic capability/)).toMatch(/review=capability/);
  });

  it('keeps the long sentences in the dialog: the health filter and the valve-fault condition', () => {
    show({ healthFiltered: true });
    fireEvent.click(screen.getByRole('button', { name: /Good-error time/ }));
    expect(screen.getByText(/health filter does not narrow/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    fireEvent.click(screen.getByRole('button', { name: /Diagnostic capability/ }));
    expect(screen.getByText(/approved test record to be confirmed/)).toBeTruthy();
  });

  it('with nothing assessed it says why inside the dialog, never a 0', () => {
    show({ performance: { ...P, assessed: 0, goodError: { meanPct: null, medianPct: null, counted: 0, notMeasured: 0 },
      errorOfSpan: { medianPct: null, counted: 0, noSpan: 0, notMeasured: 0 }, periodic: { count: 0, of: 0 } } });
    fireEvent.click(screen.getByRole('button', { name: /Good-error time/ }));
    expect(screen.getByText(/0 of 0 assessed loops contribute/)).toBeTruthy();
  });

  it('a failed read says so on the tile', () => {
    show({ performance: undefined, failed: true });
    expect(screen.getByText('could not be read')).toBeTruthy();
  });
});
