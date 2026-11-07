// @vitest-environment jsdom
/** A KPI card opens a dialog: its meaning, how it moved, where it is judged, and the way on. */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { LoopKpiCardModel } from '../../kpi/loopKpiView';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    React.createElement('button', { type: 'button', disabled: p.disabled, onClick: p.onClick }, p.children),
}));

import { LoopKpiDialog } from './LoopKpiDialog';

const CARD: LoopKpiCardModel = {
  key: 'good-error', label: 'Good-error time', Icon: () => null, value: '13 %', sub: '|PV − SP| inside the good band · G3 warn', tone: 'warn',
  delta: { points: -4, direction: 'down', good: false, text: '−4 pp', title: 'Change since the window 24 h earlier: 17 % → 13 %' },
  title: 'Time with |PV − SP| inside the good-error band ÷ window time (CPLM-014), judged by G3.',
  proof: 'calculations', metric: 'CPLM-014', group: 'control', relevant: false, gate: 'G3', judged: true, bar: null,
};
const Probe: React.FC = () => { const l = useLocation(); return <div data-testid="location">{l.pathname}{l.search}</div>; };
const open = (card = CARD, onInspect = vi.fn(), gateKeys?: string[]) => {
  render(
    <MemoryRouter><Routes><Route path="*" element={<>
      <LoopKpiDialog card={card} proof={{ label: 'Calculation proof ↗', href: '/cpm/calculations?loop=FIC1&metric=CPLM-014' }}
        gateKeys={gateKeys} onInspect={onInspect} onClose={() => {}} /><Probe />
    </>} /></Routes></MemoryRouter>);
  return onInspect;
};
afterEach(cleanup);

describe('LoopKpiDialog', () => {
  it('shows the meaning and Inspect Gn →: Good-error time → Inspect G3', () => {
    const onInspect = open();
    expect(screen.getByRole('dialog', { name: 'Good-error time' })).toBeTruthy();
    expect(screen.getByRole('dialog').textContent).toContain('inside the good-error band ÷ window time (CPLM-014)');
    expect(screen.getByRole('dialog').textContent).toContain('17 % → 13 %');
    fireEvent.click(screen.getByRole('button', { name: 'Inspect G3 →' }));
    expect(onInspect).toHaveBeenCalledWith('G3');
  });

  it('says Judged by for a KPI a gate judges and Related gate for a context KPI, with Inspect Gn → on both', () => {
    open();
    expect(screen.getByRole('dialog').textContent).toContain('Judged byG3');
    cleanup();
    open({ ...CARD, key: 'variability', label: 'PV variability (2σ)', gate: 'G3', judged: false });
    expect(screen.getByRole('dialog').textContent).toContain('Related gateG3');
    expect(screen.getByRole('dialog').textContent).not.toContain('Judged by');
    expect(screen.getByRole('button', { name: 'Inspect G3 →' })).toBeTruthy();
  });

  it('keeps the drill-down to where the number is proven', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Calculation proof ↗' }));
    expect(screen.getByTestId('location').textContent).toBe('/cpm/calculations?loop=FIC1&metric=CPLM-014');
  });

  it('says not measured, never 0, when the engine stored no value', () => {
    open({ ...CARD, value: '—', sub: '', delta: null, tone: 'muted' });
    expect(screen.getByRole('dialog').textContent).toMatch(/Not measured in this window/);
    expect(screen.getByRole('dialog').textContent).not.toMatch(/\b0 %/);
  });

  it('disables Inspect Gn with the reason when the served row does not carry that gate', () => {
    const onInspect = open(CARD, vi.fn(), ['G1', 'G4']);
    const button = screen.getByRole('button', { name: 'Inspect G3 →' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText('No G3 result in this window')).toBeTruthy();
    fireEvent.click(button);
    expect(onInspect).not.toHaveBeenCalled();
  });

  it('keeps Inspect Gn enabled when the row carries the gate, or the gates are not loaded yet', () => {
    open(CARD, vi.fn(), ['G3']);
    expect((screen.getByRole('button', { name: 'Inspect G3 →' }) as HTMLButtonElement).disabled).toBe(false);
    cleanup();
    open(CARD, vi.fn(), undefined);
    expect((screen.getByRole('button', { name: 'Inspect G3 →' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
