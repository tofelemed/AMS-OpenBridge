// @vitest-environment jsdom
/** Nine loop KPIs in three groups; a card opens a dialog, not a page; "not measured" is said once; coverage has its bar. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { CpmLoop } from '../../../../api/cpmApi';
import type { LoopKpis } from '../../../../api/cpm/loopKpis';

const hooks = vi.hoisted(() => ({ kpis: vi.fn() }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { type: 'button', onClick: p.onClick }, p.children),
}));
vi.mock('./useLoopKpis', () => ({ useLoopKpis: hooks.kpis }));

import { LoopKpiCards } from './LoopKpiCards';

const LOOP = { loopId: 'FIC1' } as CpmLoop;
const K = (values: LoopKpis['current'] extends infer C ? NonNullable<C>['values'] : never): LoopKpis => ({
  loopId: 'FIC1', windowKind: '12h', computedAt: '', reference: '', span: { pvMin: 0, pvMax: 200, pvUnit: 'm3/h' },
  current: { windowEnd: '2026-11-07T12:00:00Z', diagnosis: 'NO_CALL', values, gates: { G0: 'PASS', G1: 'PASS', G3: 'WARN', G4: 'PASS' } },
  previous: null,
});
const Probe: React.FC = () => { const l = useLocation(); return <output data-testid="where">{l.pathname + l.search}</output>; };
const show = () => render(
  <MemoryRouter initialEntries={['/cpm/explorer?loop=FIC1']}>
    <Routes><Route path="*" element={<><LoopKpiCards loop={LOOP} windowKind="12h" /><Probe /></>} /></Routes>
  </MemoryRouter>);

beforeEach(() => hooks.kpis.mockReturnValue({ data: K({ auto_pct: 0.98, good_error_pct: 0.13, mae: 4, pv_std: 3, saturation_pct: 0.01, travel_per_day: 850,
  reversals_per_hour: 12, sp_changes_per_h: 0, completeness: 0.99 }), isError: false }));
afterEach(cleanup);

describe('LoopKpiCards', () => {
  it('shows nine cards in three groups, under the heading Loop KPIs', () => {
    const { container } = show();
    expect(screen.getByRole('heading', { name: 'Loop KPIs' })).toBeTruthy();
    expect(screen.getAllByRole('group').map(g => g.getAttribute('aria-label'))).toEqual(['Control performance', 'Actuator activity', 'Evidence quality']);
    expect(container.querySelectorAll('.cpm-kpicard')).toHaveLength(9);
    expect(container.textContent).not.toMatch(/How this loop performs|rule ≥|not evaluated/);
  });

  it('opens a KPI as a dialog, and Inspect G3 → selects the gate', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: /Good-error time/ }));
    expect(screen.getByRole('dialog', { name: 'Good-error time' })).toBeTruthy();
    expect(screen.getByTestId('where').textContent).toBe('/cpm/explorer?loop=FIC1');
    fireEvent.click(screen.getByRole('button', { name: 'Inspect G3 →' }));
    expect(screen.getByTestId('where').textContent).toBe('/cpm/explorer?loop=FIC1&gate=G3');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says "not measured in this window" once, not on each card', () => {
    hooks.kpis.mockReturnValue({ data: K({ auto_pct: 1 }), isError: false });
    const { container } = show();
    expect(container.textContent?.match(/not measured in this window/g)).toHaveLength(1);
  });

  it('draws the coverage bar only for a share that is not above 100 %', () => {
    const { container, rerender } = show();
    expect(container.querySelectorAll('.cpm-kpicard__bar')).toHaveLength(1);
    hooks.kpis.mockReturnValue({ data: K({ completeness: 1.2 }), isError: false });
    rerender(<MemoryRouter><LoopKpiCards loop={LOOP} windowKind="12h" /></MemoryRouter>);
    expect(container.querySelectorAll('.cpm-kpicard__bar')).toHaveLength(0);
  });
});
