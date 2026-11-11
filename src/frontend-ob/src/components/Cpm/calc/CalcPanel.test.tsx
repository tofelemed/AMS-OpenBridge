// @vitest-environment jsdom
// Task 20: the selected calculation in the right column; the proof opens the exact run, or says why it cannot.
// CHG-166 (owner review, the approved sample): the id beside the title; Value, Unit (the loop's unit, merged with the signal
// engineering unit), Gate with a ? that tells its result from the window verdict, Method; then Record details (a dialog),
// Rules & parameters and Identity & raw (the Workbench tabs they open); Open G3 proof stays the primary.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { METRICS } from '../calcCatalogue';
import type { MetricView } from './calcView';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
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
      stamped="3.0.0" deployed="3.0.0" record={[['Window qualification', 'Qualified'], ['Stored in', 'cplm_long_feature_results']]}
      open onClose={() => undefined} {...o} />
    <Where />
  </MemoryRouter>);
// a label is its first text node: the Gate label also holds its ? button
const labelOf = (l: Element) => l.firstChild?.textContent?.trim();
const valueOf = (label: string) => [...document.querySelectorAll('.ui-inspector__body .cpm-kv')]
  .find(r => labelOf(r.querySelector('.cpm-kv__label')!) === label)?.querySelector('.cpm-kv__value')?.textContent ?? '';
const where = () => screen.getByTestId('where').textContent ?? '';

describe('CalcPanel', () => {
  it('names the metric with its id beside the title, and no Id row', () => {
    mount(view('CPLM-010'));
    const heading = screen.getByRole('heading', { name: 'Mean absolute error' });
    expect(heading.parentElement?.textContent).toContain('CPLM-010');
    expect(screen.queryByText('Id')).toBeNull();
  });

  it('gives Value, Unit, Gate and Method, in that order', () => {
    mount(view('CPLM-010'));
    const labels = [...document.querySelectorAll('.ui-inspector__body .cpm-kv__label')].map(labelOf);
    expect(labels).toEqual(['Value', 'Unit', 'Gate', 'Method']);
    expect(valueOf('Value')).toContain('0.7103');
    expect(valueOf('Value')).not.toContain('kg/h');
    expect(valueOf('Gate')).toContain('G3 · Base performance');
    expect(screen.getByText('mean(|SP − PV|)')).toBeTruthy();
  });

  it('writes a PV-unit calculation in the loop unit, on one Unit row', () => {
    mount(view('CPLM-012'));
    expect(valueOf('Unit')).toMatch(/^kg\/h·s/);
    expect(valueOf('Unit')).toMatch(/PV unit \(PV·s\)/);
    expect(screen.queryByText('Signal engineering unit')).toBeNull();
    expect(screen.queryByText('Related gate')).toBeNull();
  });

  it('keeps PV units and says so when the loop has no PV unit', () => {
    mount(view('CPLM-010'), { pvUnit: null });
    expect(valueOf('Unit')).toMatch(/^PV units/);
    expect(valueOf('Unit')).toMatch(/no PV unit/i);
  });

  it('shows a unit that is not a PV unit as the catalogue writes it', () => {
    mount(view('CPLM-020'));
    expect(valueOf('Unit')).toBe('ratio');
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

  it('tells the gate result from the window verdict behind the Gate ?, not in a sentence', () => {
    mount(view('CPLM-010'));
    expect(screen.queryByText(/is the gate.s own result/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Gate result and window verdict' }));
    expect(screen.getByText(/verdict is in the band/)).toBeTruthy();
  });

  it('opens the proof of the exact run, and the Rules and Identity tabs of the same run', () => {
    mount(view('CPLM-010'));
    fireEvent.click(screen.getByText(/Open G3 proof/));
    expect(where()).toBe('/cpm/evidence?loop=FIC10401&methodRun=run-g3&gate=G3&mode=FIXED');
    fireEvent.click(screen.getByText('Rules & parameters ↗'));
    expect(where()).toContain('sub=rules');
    fireEvent.click(screen.getByText('Identity & raw ↗'));
    expect(where()).toContain('sub=identity');
    for (const gone of [/Inspect parameters/, /Retained value & identity/, /Original configuration/]) expect(screen.queryByText(gone)).toBeNull();
  });

  it('puts Record details first, then the two Workbench tabs', () => {
    mount(view('CPLM-010'));
    const order = ['Record details', 'Rules & parameters ↗', 'Identity & raw ↗'].map(t => screen.getByText(t));
    expect(order[0].compareDocumentPosition(order[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(order[1].compareDocumentPosition(order[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('opens Record details as a dialog, not a disclosure', () => {
    mount(view('CPLM-010'));
    expect(document.querySelector('details')).toBeNull();
    expect(screen.queryByText('Window qualification')).toBeNull();
    fireEvent.click(screen.getByText('Record details'));
    const dialog = screen.getByRole('dialog', { name: 'Record details' });
    expect(within(dialog).getByText('Window qualification').nextSibling?.textContent).toBe('Qualified');
    fireEvent.click(within(dialog).getByText('Close'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('disables the proof and the tabs and says why when the window carries no run', () => {
    mount(view('CPLM-010'), { runId: undefined });
    expect((screen.getByText(/Open G3 proof/) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText('Rules & parameters ↗') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText(/no run is stored/i).length).toBeGreaterThan(0);
  });

  it('warns when the value was written by another calculation version', () => {
    mount(view('CPLM-010'), { stamped: '2.9.0', deployed: '3.0.0' });
    expect(screen.getByText(/written by v2\.9\.0/)).toBeTruthy();
  });

  it('shows a gate result with no value muted and not as a pass', () => {
    mount(view('CPLM-010', { value: null, na: { short: 'Not calculated', reason: 'x' }, status: { label: 'Pass', tone: 'muted', code: 'PASS', partial: true } }));
    expect(screen.getByText('Pass on other inputs')).toBeTruthy();
  });

  it('says nothing about versions when they match', () => {
    mount(view('CPLM-010'));
    expect(screen.queryByText(/written by v/)).toBeNull();
  });
});
