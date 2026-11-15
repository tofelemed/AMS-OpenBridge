// @vitest-environment jsdom
// Task 20: the selected calculation in the right column; the proof opens the exact run, or says why it cannot.
// CHG-166 (owner review, the approved sample): Value, Unit (the loop's unit, merged with the signal engineering unit), Gate with
// a ? that tells its result from the window verdict, Method; then Rules & parameters (the Workbench tab it opens); Open G3 proof
// stays the primary. CHG-184 (owner review items 0, 14, Q6): no metric code beside the title, no Record details, no Identity &
// raw link, no versions in the stale warning. CHG-190 (owner review item 14, the reference design): the code in the title's ?,
// the value and its unit one row, Method the formula with its explanation behind a ?, a Details grid (Rules & parameters,
// Method), the proof the full-width primary.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { METRICS } from '../calcCatalogue';
import type { MetricView } from './calcView';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean; fullWidth?: boolean }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled, 'data-full-width': p.fullWidth ? 'true' : undefined }, p.children),
}));

import CalcPanel from './CalcPanel';

afterEach(cleanup);

const metric = (id: string) => METRICS.find(m => m.id === id)!;
const view = (id: string, over: Partial<MetricView> = {}): MetricView => ({
  metric: metric(id), value: 0.7103, na: null, status: { label: 'Symptom seen', tone: 'warn', code: 'WARN', partial: false }, ...over,
});
const Where: React.FC = () => <output data-testid="where">{useLocation().pathname + useLocation().search}</output>;
const mount = (v: MetricView, o: Partial<React.ComponentProps<typeof CalcPanel>> = {}) => render(
  <MemoryRouter>
    <CalcPanel view={v} loopId="FIC10401" runId="run-g3" pvUnit="kg/h"
      stamped="3.0.0" deployed="3.0.0" open onClose={() => undefined} {...o} />
    <Where />
  </MemoryRouter>);
// a label is its first text node: the Gate and Method labels also hold their ? button
const labelOf = (l: Element) => l.firstChild?.textContent?.trim();
const valueOf = (label: string) => [...document.querySelectorAll('.ui-inspector__body .cpm-kv')]
  .find(r => labelOf(r.querySelector('.cpm-kv__label')!) === label)?.querySelector('.cpm-kv__value')?.textContent ?? '';
const where = () => screen.getByTestId('where').textContent ?? '';
const head = () => document.querySelector('.ui-inspector__head') as HTMLElement;

describe('CalcPanel', () => {
  it('names the metric by its name; its code and what it is sit in the title ? only (CHG-184, CHG-190)', () => {
    mount(view('CPLM-010'));
    expect(screen.getByRole('heading', { name: 'Mean absolute error' })).toBeTruthy();
    expect(screen.queryByText(/CPLM-010/)).toBeNull();
    expect(screen.queryByText('Id')).toBeNull();
    fireEvent.click(within(head()).getByRole('button', { name: 'Mean absolute error' }));
    expect(within(head()).getByText('Calculation CPLM-010')).toBeTruthy();
    expect(within(head()).getByText('Mean |PV − SP| over the window.')).toBeTruthy();
  });

  it('gives Value (with its unit), Gate and Method, in that order: no Unit row (CHG-190)', () => {
    mount(view('CPLM-010'));
    const labels = [...document.querySelectorAll('.ui-inspector__body .cpm-kv__label')].map(labelOf);
    expect(labels).toEqual(['Value', 'Gate', 'Method']);
    expect(valueOf('Value')).toMatch(/^0\.7103 kg\/h/);
    expect(valueOf('Gate')).toContain('G3 · Base performance');
  });

  it('writes the value of a ratio with its unit on one row, as "1.00 ratio"', () => {
    mount(view('CPLM-001', { value: 1 }));
    expect(valueOf('Value')).toBe('1.00 ratio');
    expect(screen.queryByText('Unit')).toBeNull();
  });

  it('writes a count bare, with no unit word after it', () => {
    mount(view('CPLM-002', { value: 8639 }));
    expect(valueOf('Value')).not.toMatch(/count/);
    expect(valueOf('Value')).toMatch(/^8,?639$/);
  });

  it('writes a PV-unit calculation in the loop unit on the Value row, and says it is the PV unit', () => {
    mount(view('CPLM-012'));
    expect(valueOf('Value')).toMatch(/kg\/h·s/);
    expect(valueOf('Value')).toMatch(/PV unit \(PV·s\)/);
    expect(screen.queryByText('Signal engineering unit')).toBeNull();
    expect(screen.queryByText('Related gate')).toBeNull();
  });

  it('keeps PV units and says so when the loop has no PV unit', () => {
    mount(view('CPLM-010'), { pvUnit: null });
    expect(valueOf('Value')).toMatch(/PV units/);
    expect(valueOf('Value')).toMatch(/no PV unit/i);
  });

  it('shows a unit that is not a PV unit as the catalogue writes it, after the number', () => {
    mount(view('CPLM-020'));
    expect(valueOf('Value')).toMatch(/ ratio$/);
  });

  it('keeps a value of 0 as 0, and Not calculated as a state with its reason', () => {
    const { unmount } = mount(view('CPLM-010', { value: 0 }));
    expect(valueOf('Value')).toMatch(/^0\b/);
    expect(screen.queryByText('Not calculated')).toBeNull();
    unmount();
    mount(view('CPLM-030', { value: null, na: { short: 'Not calculated', reason: 'no clean oscillation cycle' } }));
    expect(screen.getByText('Not calculated')).toBeTruthy();
    expect(screen.getByText('no clean oscillation cycle')).toBeTruthy();
  });

  it('shows Method as the formula only; its explanation is behind the Method ?', () => {
    mount(view('CPLM-001'));
    expect(valueOf('Method')).toBe('samples received ÷ samples expected');
    expect(screen.queryByText(/declared sample period/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'How it is computed' }));
    expect(screen.getByText(/declared sample period/)).toBeTruthy();
  });

  it('has a Details grid of Rules & parameters and Method; Method opens the formula, the unit and the explanation', () => {
    mount(view('CPLM-001'));
    const grid = screen.getByRole('region', { name: 'Details' });
    expect(within(grid).getAllByRole('button').map(b => b.textContent)).toEqual(['Rules & parameters›', 'Method›']);
    expect(grid.closest('.ui-inspector__body')).toBeNull();
    fireEvent.click(within(grid).getByRole('button', { name: 'Method' }));
    const dialog = screen.getByRole('dialog', { name: 'Method' });
    expect(within(dialog).getByText('Sample completeness')).toBeTruthy();
    expect(within(dialog).getByText('samples received ÷ samples expected')).toBeTruthy();
    expect(within(dialog).getByText('ratio')).toBeTruthy();
    expect(within(dialog).getByText(/declared sample period/)).toBeTruthy();
  });

  it('makes Open proof the full-width primary at the foot (CHG-190)', () => {
    mount(view('CPLM-001'));
    const proof = screen.getByRole('button', { name: /Open G0 proof/ });
    expect(proof.closest('.ui-inspector__foot')).toBeTruthy();
    expect(proof.getAttribute('data-full-width')).toBe('true');
    expect(document.querySelector('.ui-inspector--reference')).toBeTruthy();
  });

  it('tells the gate result from the window verdict behind the Gate ?, not in a sentence', () => {
    mount(view('CPLM-010'));
    expect(screen.queryByText(/is the gate.s own result/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Gate result and window verdict' }));
    expect(screen.getByText(/verdict is in the band/)).toBeTruthy();
  });

  it('opens the proof of the exact run, and the Rules tab of the same run; no Identity & raw link (CHG-184)', () => {
    mount(view('CPLM-010'));
    fireEvent.click(screen.getByText(/Open G3 proof/));
    expect(where()).toBe('/cpm/evidence?loop=FIC10401&methodRun=run-g3&gate=G3&mode=FIXED');
    fireEvent.click(screen.getByRole('button', { name: 'Rules & parameters' }));
    expect(where()).toContain('sub=rules');
    expect(screen.queryByText(/Identity & raw/)).toBeNull();
    expect(screen.queryByText(/↗/)).toBeNull();
    for (const gone of [/Inspect parameters/, /Retained value & identity/, /Original configuration/]) expect(screen.queryByText(gone)).toBeNull();
  });

  it('has no Record details (CHG-184, owner review Q6)', () => {
    mount(view('CPLM-010'));
    expect(screen.queryByText('Record details')).toBeNull();
    expect(document.querySelector('details')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('disables the proof and Rules & parameters and says why when the window carries no run', () => {
    mount(view('CPLM-010'), { runId: undefined });
    expect((screen.getByText(/Open G3 proof/) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Rules & parameters' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText(/no run is stored/i).length).toBeGreaterThan(0);
  });

  it('warns when the value was written by an earlier calculation, naming no version (CHG-184)', () => {
    mount(view('CPLM-010'), { stamped: '2.9.0', deployed: '3.0.0' });
    expect(screen.getByText(/written by an earlier calculation/)).toBeTruthy();
    expect(screen.queryByText(/2\.9\.0|3\.0\.0/)).toBeNull();
  });

  it('shows a gate result with no value muted and not as a pass', () => {
    mount(view('CPLM-010', { value: null, na: { short: 'Not calculated', reason: 'x' }, status: { label: 'Pass', tone: 'muted', code: 'PASS', partial: true } }));
    expect(screen.getByText('Pass on other inputs')).toBeTruthy();
  });

  it('says nothing about versions when they match', () => {
    mount(view('CPLM-010'));
    expect(screen.queryByText(/written by/)).toBeNull();
  });
});
