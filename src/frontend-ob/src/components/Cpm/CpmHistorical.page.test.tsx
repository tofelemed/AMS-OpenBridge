// @vitest-environment jsdom
// CHG-139 / B3: the evaluated-window list and the Result lane write the same ?window= (the window END).
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

const state = vi.hoisted(() => ({ chartEvents: undefined as undefined | { click?: (e: { seriesName?: string; dataIndex?: number }) => void } }));
const noQuery = { data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn() };

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('echarts-for-react', () => ({
  default: (p: { onEvents?: typeof state.chartEvents }) => { state.chartEvents = p.onEvents; return <div data-testid="chart" />; },
}));
vi.mock('./context/LoopBand', () => ({ LoopBand: (p: { children?: React.ReactNode; card?: boolean }) => <div data-testid="band" data-card={p.card ? 'yes' : 'no'}>{p.children}</div> }));
vi.mock('./trend/TimeRangeBar', () => ({ default: () => null }));
vi.mock('./historical/RangeToolbar', () => ({ default: (p: { tools?: React.ReactNode }) => <div data-testid="chart-head">{p.tools}</div>, ExportMenu: () => null, SIGNAL_KEYS: ['pv', 'sp', 'op', 'vp'] }));
vi.mock('./historical/SelectedWindowPanel', () => ({ default: (p: { window?: { windowEnd: string } }) => <div data-testid="panel">{p.window?.windowEnd ?? 'none'}</div> }));
vi.mock('./historical/useHistoryExports', () => ({ useHistoryExports: () => ({ run: vi.fn(), busy: null, error: null }) }));
vi.mock('./health/useInstrumentHealth', () => ({ useInstrumentHealthHistory: () => ({ data: undefined }) }));
vi.mock('./historical/useWindowKpis', async (orig) => {
  const win = (end: string) => ({ windowStart: new Date(Date.parse(end) - 12 * 3_600_000).toISOString(), windowEnd: end, diagnosis: 'NO_CALL', confidence: null, sampleCount: 10, insufficientEvidenceReason: null, methodRunIds: {}, gates: [], metrics: {} });
  const windows = [win('2026-11-05T06:00:00Z'), win('2026-11-05T12:00:00Z')];
  return { ...(await orig<typeof import('./historical/useWindowKpis')>()), useWindowKpis: () => ({ windows, full: windows, history: noQuery, summaries: noQuery, truncated: false, fullCapped: false }) };
});
vi.mock('../../hooks/useCpm', () => ({
  useCpmLoops: () => ({ ...noQuery, data: { loops: [{ loopId: 'L1', timezone: 'UTC', tags: { PV: 'a.pv' } }] } }),
  useCpmTrend: () => ({ ...noQuery, data: { points: [{ ts: Date.parse('2026-11-05T10:00:00Z'), pv: 1, sp: 1, op: 1 }] } }),
  useCpmKpisRange: () => ({ ...noQuery, data: { samples: [] } }),
  useCpmModeTrack: () => ({ ...noQuery, data: { points: [] } }),
}));

import { CpmHistorical } from './CpmHistorical';

const Where = () => { const l = useLocation(); return <div data-testid="where">{decodeURIComponent(l.search)}</div>; };
const URL_ = '/cpm/historical?loop=L1&from=2026-11-05T00:00:00Z&to=2026-11-06T00:00:00Z';
beforeEach(() => { state.chartEvents = undefined; });
afterEach(cleanup);

describe('Historical selects a window from the list and from the lane (B3)', () => {
  it('a row of the evaluated-window list writes ?window= with the window end', () => {
    render(<MemoryRouter initialEntries={[URL_]}><CpmHistorical /><Where /></MemoryRouter>);
    expect(screen.getByTestId('where').textContent).not.toContain('window=');
    const table = screen.getByRole('table', { name: 'Evaluated windows' });
    fireEvent.click(within(table).getAllByRole('row')[1]);          // newest first: the 12:00 window
    expect(screen.getByTestId('where').textContent).toContain('window=2026-11-05T12:00:00Z');
    expect(screen.getByTestId('panel').textContent).toBe('2026-11-05T12:00:00Z');
  });

  it('a click on the Result lane writes the same ?window= with the window end', () => {
    render(<MemoryRouter initialEntries={[URL_]}><CpmHistorical /><Where /></MemoryRouter>);
    expect(state.chartEvents?.click).toBeTypeOf('function');
    act(() => state.chartEvents!.click!({ seriesName: 'verdict-track', dataIndex: 0 }));   // markers are oldest first: the 06:00 window
    expect(screen.getByTestId('where').textContent).toContain('window=2026-11-05T06:00:00Z');
  });

  it('a click on another lane selects nothing', () => {
    render(<MemoryRouter initialEntries={[URL_]}><CpmHistorical /><Where /></MemoryRouter>);
    act(() => state.chartEvents!.click!({ seriesName: 'PV', dataIndex: 0 }));
    expect(screen.getByTestId('where').textContent).not.toContain('window=');
  });
});

// CHG-159 (owner review of Historical, 10 Nov)
describe('Historical title and size', () => {
  it('has no ? on the page title', () => {
    render(<MemoryRouter initialEntries={[URL_]}><CpmHistorical /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1, name: 'Historical' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Historical' })).toBeNull();
  });

  it('carries the compact size class, so its buttons and fields are 32 px like the pager', () => {
    const { container } = render(<MemoryRouter initialEntries={[URL_]}><CpmHistorical /></MemoryRouter>);
    expect(container.querySelector('.cpm-screen')?.classList.contains('cpm-compact')).toBe(true);
  });

  it('draws the loop band as a card, as on Loop Explorer', () => {
    render(<MemoryRouter initialEntries={[URL_]}><CpmHistorical /></MemoryRouter>);
    expect(screen.getByTestId('band').dataset.card).toBe('yes');
  });

  it('puts Zoom area, Undo and Reset in the chart head row, once', () => {
    render(<MemoryRouter initialEntries={[URL_]}><CpmHistorical /></MemoryRouter>);
    const head = screen.getByTestId('chart-head');
    for (const name of ['Zoom area', 'Undo', 'Reset']) expect(within(head).getByRole('button', { name })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Zoom area' })).toHaveLength(1);
  });
});
