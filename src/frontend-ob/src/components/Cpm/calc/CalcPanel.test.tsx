// @vitest-environment jsdom
// Task 20: the selected calculation in the right column. Name, id, value, unit, method, gate, then the links;
// the proof opens the exact run, or says why it cannot.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
  metric: metric(id), value: 0.7103, na: null, status: { label: 'Symptom seen', tone: 'warn', code: 'WARN' }, ...over,
});
const Where: React.FC = () => <output data-testid="where">{useLocation().pathname + useLocation().search}</output>;
const mount = (v: MetricView, o: Partial<React.ComponentProps<typeof CalcPanel>> = {}) => render(
  <MemoryRouter>
    <CalcPanel view={v} loopId="FIC10401" runId="run-g3" pvUnit="kg/h" verdict="Excluded · loop not in automatic"
      stamped="3.0.0" deployed="3.0.0" open onClose={() => undefined} {...o} />
    <Where />
  </MemoryRouter>);

describe('CalcPanel', () => {
  it('names the metric, its id, value, unit and related gate', () => {
    mount(view('CPLM-010'));
    expect(screen.getByRole('heading', { name: 'Mean absolute error' })).toBeTruthy();
    expect(screen.getByText('CPLM-010')).toBeTruthy();
    expect(screen.getByText('Value').nextSibling?.textContent).toContain('0.7103');
    expect(screen.getByText('Unit').nextSibling?.textContent).toBe('PV units');
    expect(screen.getByText('Related gate').nextSibling?.textContent).toContain('G3');
    expect(screen.getByText('Signal engineering unit').nextSibling?.textContent).toBe('kg/h');
  });

  it('gives the method as a formula and a sentence', () => {
    mount(view('CPLM-020'));
    expect(screen.getByText('std(OP) ÷ std(PV)')).toBeTruthy();
  });

  it('keeps a value of 0 as 0, and Not calculated as a state with its reason', () => {
    const { unmount } = mount(view('CPLM-010', { value: 0 }));
    expect(screen.getByText('Value').nextSibling?.textContent).toMatch(/^0\b/);
    expect(screen.queryByText('Not calculated')).toBeNull();
    unmount();
    mount(view('CPLM-030', { value: null, na: { short: 'Not calculated', reason: 'no clean oscillation cycle' } }));
    expect(screen.getByText('Not calculated')).toBeTruthy();
    expect(screen.getByText('no clean oscillation cycle')).toBeTruthy();
  });

  it('tells the gate result from the verdict of the window', () => {
    mount(view('CPLM-010'));
    expect(screen.getByText(/G3 is the gate’s own result/)).toBeTruthy();
    expect(screen.getByText(/Excluded · loop not in automatic/)).toBeTruthy();
  });

  it('opens the proof of the exact run, and the identity and rules of the same run', () => {
    mount(view('CPLM-010'));
    fireEvent.click(screen.getByText(/Open G3 proof/));
    expect(screen.getByTestId('where').textContent).toBe('/cpm/evidence?loop=FIC10401&methodRun=run-g3&gate=G3&mode=FIXED');
    fireEvent.click(screen.getByText(/Retained value & identity/));
    expect(screen.getByTestId('where').textContent).toContain('sub=identity');
    fireEvent.click(screen.getByText(/Inspect parameters/));
    expect(screen.getByTestId('where').textContent).toContain('sub=rules');
  });

  it('disables the proof and says why when the window carries no run', () => {
    mount(view('CPLM-010'), { runId: undefined });
    expect((screen.getByText(/Open G3 proof/) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText(/no run is stored/i).length).toBeGreaterThan(0);
  });

  it('warns when the value was written by another calculation version', () => {
    mount(view('CPLM-010'), { stamped: '2.9.0', deployed: '3.0.0' });
    expect(screen.getByText(/written by v2\.9\.0/)).toBeTruthy();
  });

  it('says nothing about versions when they match', () => {
    mount(view('CPLM-010'));
    expect(screen.queryByText(/written by v/)).toBeNull();
  });
});
