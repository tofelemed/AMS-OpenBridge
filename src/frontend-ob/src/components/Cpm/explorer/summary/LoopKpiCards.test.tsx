// @vitest-environment jsdom
/**
 * Nine loop KPIs in one grid (CHG-185, owner Q2), each naming its group; title then value; the explanation in a ? tip, not on the
 * card; a card opens a dialog, not a page; "not measured" is said once; coverage has its bar.
 */
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
const card = (label: string) => screen.getByRole('button', { name: label }).closest('.cpm-kpicard') as HTMLElement;

beforeEach(() => hooks.kpis.mockReturnValue({ data: K({ auto_pct: 0.98, good_error_pct: 0.13, mae: 4, pv_std: 3, saturation_pct: 0.01, travel_per_day: 850,
  reversals_per_hour: 12, sp_changes_per_h: 0, completeness: 0.99, sample_count: 8641, expected_sample_count: 8640 }), isError: false }));
afterEach(cleanup);

describe('LoopKpiCards', () => {
  it('shows the nine cards in one grid, in the groups\' order, each naming its group (Q2)', () => {
    const { container } = show();
    expect(screen.getByRole('heading', { name: 'Loop KPIs' })).toBeTruthy();
    expect(screen.queryAllByRole('group')).toHaveLength(0);
    expect(container.querySelector('.cpm-kpigroup__title')).toBeNull();
    expect(screen.getAllByRole('list')).toHaveLength(1);
    const cards = [...container.querySelectorAll('.cpm-kpicard')];
    expect(cards).toHaveLength(9);
    // CHG-192: the ? sits with the title's last word; the card is named by its title alone
    expect(cards.map(c => c.querySelector('.cpm-kpicard__opener')?.getAttribute('aria-label'))).toEqual([
      'Time in normal mode', 'Good-error time', 'Control error (MAE)', 'PV variability (2σ)', 'Setpoint changes',
      'Time at an OP limit', 'OP travel', 'OP reversals', 'Data coverage',
    ]);
    expect(cards.map(c => c.querySelector('.cpm-kpicard__group')?.textContent)).toEqual([
      ...Array(5).fill('Control performance'), ...Array(3).fill('Actuator activity'), 'Evidence quality',
    ]);
    expect(container.textContent).not.toMatch(/How this loop performs|rule ≥|not evaluated/);
  });

  it('reads title, then value, with the explanation in a ? tip, not under the value (item 4)', () => {
    show();
    const c = card('Good-error time');
    const text = c.textContent ?? '';
    expect(text.indexOf('Good-error time')).toBeLessThan(text.indexOf('13 %'));
    expect(c.querySelector('.cpm-kpicard__sub')).toBeNull();
    expect(text).not.toContain('inside the good band');
    expect(c.getAttribute('title')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'About Good-error time' }));
    const tip = screen.getByRole('group', { name: 'About Good-error time' });
    expect(tip.textContent).toContain('|PV − SP| inside the good band · G3 warn');
    expect(tip.textContent).toContain('judged by G3');
    // the tip opens on its own; the card's dialog does not
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the sample count, in the coverage card\'s tip', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'About Data coverage' }));
    expect(screen.getByRole('group', { name: 'About Data coverage' }).textContent).toContain('8641 of 8640 samples · G0 pass');
  });

  it('colours the icon blue for normal mode and amber for a value that needs a look, never green', () => {
    show();
    expect(card('Time in normal mode').querySelector('.cpm-kpicard__icon--mode')).not.toBeNull();
    expect(card('Good-error time').querySelector('.cpm-kpicard__icon--warn')).not.toBeNull();
    expect(card('OP travel').querySelector('.cpm-kpicard__icon--none')).not.toBeNull();
    expect(document.querySelector('.cpm-kpicard__icon--good')).toBeNull();
  });

  it('opens a KPI as a dialog, and Inspect G3 → selects the gate', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Good-error time' }));
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
