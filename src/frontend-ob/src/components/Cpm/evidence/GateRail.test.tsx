// Task 15: the workbench's gate rail - all gates by tier with code, name and mark, replacing the gate dropdown.
// Marks come from gateMark (through chipsOf); Up and Down move over one roving tab stop; Enter opens; below
// 850 px a native select with the same groups takes its place; the Key opens in a dialog.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { GateRail } from './GateRail';
import { chipsOf } from './GateChipStrip';
import { gateMark } from '../gateStatus';
import type { GateCatalogue } from '../../../api/cpm/catalogue';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
afterEach(cleanup);

const catalogue = {
  count: 3, service: { version: '1', sourceCommit: 'x' },
  gates: [
    { gate: 'G0', name: 'Data quality', tier: 'short', role: 'BLOCKING' },
    { gate: 'G3', name: 'Base performance', tier: 'short', role: 'PERFORMANCE' },
    { gate: 'G15', name: 'Decision', tier: 'fusion', role: 'FUSION' },
  ],
} as unknown as GateCatalogue;
const cells = [{ key: 'G0', status: 'PASS', reason: null }, { key: 'G3', status: 'WARN', reason: null }, { key: 'G15', status: 'SUSPECTED', reason: null }];
const siblings = { G0: 'g0-run', G3: 'g3-run', G15: 'g15-run' };
const chips = chipsOf({ siblings, cells, result: null, catalogue });

describe('GateRail', () => {
  it('lists gates by tier with code, name and the gateMark symbol', () => {
    render(<GateRail chips={chips} selected="G3" onSelect={() => {}} />);
    const nav = screen.getByRole('navigation', { name: 'Gates of this window' });
    expect(within(nav).getAllByRole('group').map(g => g.getAttribute('aria-label'))).toEqual(['Eligibility', 'Performance', 'Diagnostic evidence', 'Confirmation', 'Fusion']);
    const g3 = within(nav).getByRole('button', { name: /^G3 / });
    expect(g3.textContent).toContain('G3');
    expect(g3.textContent).toContain('Base performance');
    expect(g3.textContent).toContain(gateMark('WARN', 'G3').glyph);
    expect(g3.getAttribute('aria-current')).toBe('true');
    expect(within(nav).getByRole('button', { name: /^G0 / }).getAttribute('aria-current')).toBeNull();
    expect(within(nav).getAllByRole('button').filter(b => b.hasAttribute('data-gate'))).toHaveLength(17);
  });

  it('opens a gate on click; a gate with no run on this tier is disabled and says why', () => {
    const onSelect = vi.fn();
    render(<GateRail chips={chips} selected="G3" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /^G0 / }));
    expect(onSelect).toHaveBeenCalledWith('G0');
    const g1 = screen.getByRole('button', { name: /^G1 / }) as HTMLButtonElement;
    expect(g1.disabled).toBe(true);
    expect(g1.getAttribute('title')).toMatch(/no run on this tier/);
  });

  it('moves with Up and Down over one tab stop, skipping disabled gates', () => {
    render(<GateRail chips={chips} selected="G0" onSelect={() => {}} />);
    const nav = screen.getByRole('navigation', { name: 'Gates of this window' });
    const g0 = within(nav).getByRole('button', { name: /^G0 / });
    expect(g0.getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(g0, { key: 'ArrowDown' });
    const g3 = within(nav).getByRole('button', { name: /^G3 / });
    expect(g3.getAttribute('tabindex')).toBe('0');            // G1, G2 and G2r carry no run
    expect(g0.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(g3);
    fireEvent.keyDown(g3, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(g0);
    fireEvent.keyDown(g0, { key: 'End' });
    expect(document.activeElement).toBe(within(nav).getByRole('button', { name: /^G15 / }));
  });

  it('carries a native select with the same groups for a narrow screen', () => {
    const onSelect = vi.fn();
    render(<GateRail chips={chips} selected="G3" onSelect={onSelect} />);
    const picker = screen.getByRole('combobox', { name: 'Gate' }) as HTMLSelectElement;
    expect(picker.value).toBe('G3');
    expect(Array.from(picker.querySelectorAll('optgroup')).map(o => o.label)).toEqual(['Eligibility', 'Performance', 'Diagnostic evidence', 'Confirmation', 'Fusion']);
    expect(picker.querySelector<HTMLOptionElement>('option[value="G1"]')!.disabled).toBe(true);
    fireEvent.change(picker, { target: { value: 'G0' } });
    expect(onSelect).toHaveBeenCalledWith('G0');
  });

  it('opens the key in a dialog', () => {
    render(<GateRail chips={chips} selected="G3" onSelect={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Key' }));
    expect(within(screen.getByRole('dialog', { name: 'Gate status key' })).getByRole('note', { name: 'Gate symbols' })).toBeTruthy();
  });
});
