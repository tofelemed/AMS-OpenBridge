// @vitest-environment jsdom
// CHG-158 (owner review): the trend toolbar holds its own buttons — Historical ↗ and Trend ↗ after Live, and the evaluated-window
// buttons at its end — so nothing sits on a row of its own under it.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { CpmLoop } from '../../../../api/cpmApi';
import { EXPLORER_PRESETS } from '../../historical/timeRange';

const hooks = vi.hoisted(() => ({ gates: vi.fn() }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; title?: string }) =>
    React.createElement('button', { type: 'button', onClick: p.onClick, title: p.title }, p.children),
}));
vi.mock('../../../../hooks/useCpm', () => ({
  useLatestGates: hooks.gates,
  useCpmTrend: () => ({ data: { points: [] }, isLoading: false, isError: false }),
}));
vi.mock('../../trend/SignalTrend', () => ({ default: () => null }));

import LoopTrendPanel from './LoopTrendPanel';

const LOOP = { loopId: 'FIC10401', tags: { PV: 'FIC10401.PV', SP: 'FIC10401.SV', OP: 'FIC10401.MV' } } as unknown as CpmLoop;
const FROM = new Date('2026-11-06T23:45:00Z');
const TO = new Date('2026-11-07T11:45:00Z');
const range = (live: boolean) => ({
  from: FROM, to: TO, live, presets: EXPLORER_PRESETS, preset: live ? '8h' : 'custom',
  applyPreset: vi.fn(), step: vi.fn(), applyCustom: vi.fn(() => null), goLive: vi.fn(),
});
const Where: React.FC = () => { const l = useLocation(); return <span data-testid="where">{l.pathname}{l.search}</span>; };
const panel = (live = true) => render(
  <MemoryRouter initialEntries={['/cpm/explorer?loop=FIC10401']}>
    <Routes><Route path="*" element={<>
      <LoopTrendPanel loop={LOOP} range={range(live) as never} trend={{ data: { points: [] }, isLoading: false, isError: false } as never} points={[]} />
      <Where />
    </>} /></Routes>
  </MemoryRouter>,
);
const gatesOn = (start: string, end: string) =>
  hooks.gates.mockReturnValue({ data: { diagnosis: 'INSUFFICIENT_DATA', windowStart: start, windowEnd: end, gates: [] } });

afterEach(cleanup);

describe('LoopTrendPanel toolbar', () => {
  it('opens Trend on this loop and this period', () => {
    gatesOn(FROM.toISOString(), TO.toISOString());
    panel();
    fireEvent.click(screen.getByRole('button', { name: 'Trend ↗' }));
    expect(screen.getByTestId('where').textContent)
      .toBe(`/trend?loop=FIC10401&from=${encodeURIComponent(FROM.toISOString())}&to=${encodeURIComponent(TO.toISOString())}`);
  });

  it('keeps the compare buttons in the toolbar on the evaluated window', () => {
    gatesOn(FROM.toISOString(), TO.toISOString());
    const { container } = panel(false);
    const bar = container.querySelector('.cpm-range-bar')!;
    expect(bar.textContent).toContain('Compare with previous window');
    expect(bar.textContent).toContain('Compare with now');
    expect(container.querySelector('.cpm-eval-note')).toBeNull();
  });

  it('keeps Show evaluated period → in the toolbar when the window is outside the range', () => {
    gatesOn('2026-10-01T00:00:00Z', '2026-10-01T12:00:00Z');
    const { container } = panel();
    expect(container.querySelector('.cpm-range-bar')!.textContent).toContain('Show evaluated period →');
    expect(container.querySelector('.cpm-eval-note')).toBeNull();
  });
});
