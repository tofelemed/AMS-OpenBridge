// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import CpmKpiDrilldown from './CpmKpiDrilldown';
import { useFleetKpiLoops, useFleetKpiTrend, useFleetKpis } from './kpi/useFleetKpis';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => <button type="button" onClick={onClick}>{children}</button>,
}));
vi.mock('./kpi/KpiTrendChart', () => ({ KpiTrendChart: () => <p>chart</p> }));
vi.mock('./kpi/KpiRowsTable', () => ({ KpiRowsTable: () => <p>rows</p> }));
vi.mock('./plantScope', () => ({ useCpmScope: () => ({ params: {}, active: false }) }));
vi.mock('./kpi/useFleetKpis', () => ({ useFleetKpis: vi.fn(), useFleetKpiLoops: vi.fn(), useFleetKpiTrend: vi.fn() }));

const figure = (key: string, count = 165) => ({
  key, label: 'Stale', count, denominator: 241, denominatorLabel: 'monitored loops', rule: 'Newest 12h result older than 60 min',
});
const kpis = {
  kpis: [figure('stale'), figure('not-assessable', 12)],
  computedAt: '2026-11-06T12:14:24Z',
  basis: { freshSeconds: 3600 },
  states: { notAssessable: 12 },
  notAssessableByReason: [{ reason: 'INSUFFICIENT_DATA', count: 7 }, { reason: 'EXCLUDED_MAINTENANCE', count: 5 }],
  segments: [],
  previous: { kpis: [{ ...figure('stale', 141) }] },
};
const list = (total: number, extra: object = {}) => ({ data: { total, matched: total, rows: [{ loopId: 'FIC1' }], figure: null, ...extra }, isError: false });

const Where: React.FC = () => <output data-testid="url">{useLocation().search}</output>;
const open = (url: string) => render(<MemoryRouter initialEntries={[url]}><CpmKpiDrilldown /><Where /></MemoryRouter>);
const url = () => screen.getByTestId('url').textContent;

beforeEach(() => {
  vi.mocked(useFleetKpis).mockReturnValue({ data: kpis, isError: false } as never);
  vi.mocked(useFleetKpiLoops).mockReturnValue(list(165) as never);
  vi.mocked(useFleetKpiTrend).mockReturnValue({
    data: { days: [{ asOf: '2026-11-05T20:00:00Z', day: '2026-11-05', stale: { count: 141, denominator: 241 } }] }, isError: false,
  } as never);
});
afterEach(cleanup);

describe('CpmKpiDrilldown', () => {
  it('shows the number, the trend and the loops, and keeps the calculation behind the ?', () => {
    open('/cpm?review=stale');
    expect(within(screen.getByRole('region', { name: 'KPI and its controls' })).getByText('165')).toBeTruthy();
    expect(screen.getByText('/ 241 monitored loops')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '165 loops' })).toBeTruthy();
    expect(screen.getByText('matches the KPI')).toBeTruthy();
    for (const term of ['Formula', 'Threshold', 'Basis', 'Why this KPI', 'Computed']) expect(screen.queryByText(term)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'How this number is calculated' }));
    for (const term of ['Rule', 'Formula', 'Threshold', 'Basis', 'Computed', 'Since 24 h ago']) expect(screen.getByText(term)).toBeTruthy();
    expect(screen.getByText('No result for > 60 min')).toBeTruthy();
  });

  it('names one loop in the singular', () => {
    vi.mocked(useFleetKpiLoops).mockReturnValue(list(1) as never);
    open('/cpm?review=stale');
    expect(screen.getByRole('heading', { name: '1 loop' })).toBeTruthy();
  });

  it('always names the KPI in its dropdown, even one the list does not hold', () => {
    vi.mocked(useFleetKpiLoops).mockReturnValue(list(3, { figure: { ...figure('bar-stale', 3), label: 'Stale only' } }) as never);
    open('/cpm?review=bar-stale');
    const pick = screen.getByRole('combobox', { name: 'Show another KPI' }) as HTMLSelectElement;
    expect(pick.value).toBe('bar-stale');
    expect(pick.selectedOptions[0].textContent).toBe('Stale only');
    expect(screen.queryByText('chart')).toBeNull();
  });

  it('moves to another KPI and clears its reason', () => {
    open('/cpm?review=not-assessable&reason=INSUFFICIENT_DATA');
    fireEvent.change(screen.getByRole('combobox', { name: 'Show another KPI' }), { target: { value: 'stale' } });
    expect(url()).toBe('?review=stale');
  });

  it('narrows by reason from one dropdown, with its counts', () => {
    vi.mocked(useFleetKpiLoops).mockReturnValue(list(12) as never);
    open('/cpm?review=not-assessable');
    const reason = screen.getByRole('combobox', { name: 'Narrow by reason' }) as HTMLSelectElement;
    expect([...reason.options].map(o => o.textContent)[0]).toBe('All reasons · 12');
    fireEvent.change(reason, { target: { value: 'EXCLUDED_MAINTENANCE' } });
    expect(url()).toContain('reason=EXCLUDED_MAINTENANCE');
    fireEvent.change(reason, { target: { value: '' } });
    expect(url()).not.toContain('reason');
  });

  it('keeps a reason the counts no longer hold, so the filter can still be undone', () => {
    vi.mocked(useFleetKpiLoops).mockReturnValue(list(0, { rows: [] }) as never);
    open('/cpm?review=not-assessable&reason=GONE');
    expect((screen.getByRole('combobox', { name: 'Narrow by reason' }) as HTMLSelectElement).value).toBe('GONE');
  });

  it('sets the trend range from one dropdown, and 14 days leaves the address clean', () => {
    open('/cpm?review=stale');
    const range = screen.getByRole('combobox', { name: 'Trend range' });
    fireEvent.change(range, { target: { value: '90' } });
    expect(url()).toContain('range=90');
    fireEvent.change(range, { target: { value: '14' } });
    expect(url()).not.toContain('range');
  });

  it('offers the way back from a picked day', () => {
    open('/cpm?review=stale&day=2026-11-05T20:00:00Z');
    fireEvent.click(screen.getByRole('button', { name: 'Back to now' }));
    expect(url()).not.toContain('day');
  });

  it('offers to clear a search that finds nothing', () => {
    vi.mocked(useFleetKpiLoops).mockReturnValue(list(0, { rows: [] }) as never);
    open('/cpm?review=stale');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search loops' }), { target: { value: 'zz' } });
    expect(screen.getByText('No loop matches the search')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect((screen.getByRole('searchbox', { name: 'Search loops' }) as HTMLInputElement).value).toBe('');
  });

  it('says "Not stored for that day" for a picked day with no capability list, not an empty KPI', () => {
    vi.mocked(useFleetKpiLoops).mockReturnValue(list(0, { rows: [] }) as never);
    open('/cpm?review=capability&day=2026-11-05T20:00:00Z');
    expect(screen.getByText('Not stored for that day')).toBeTruthy();
    expect(screen.queryByText('No loop is in this KPI')).toBeNull();
  });
});
