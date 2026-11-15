// Task 16: the Proof tab. The window, the inputs (CHG-184: no metric code column), the run's artifacts or the state that says why
// there are none, what remains open, and the two ways on (rules, signal context). The window's expected sample count is
// not served, so the page calls the window divided by the sample period nominal. CHG-187 (owner review 11.1): the inputs are the
// shared data table (Measure · Value, the code in the ? tip), a value a KPI card shows is not listed again, and measured vs
// required lives in the gate head's dialog, not here.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProofTab, type ProofTabProps } from './ProofTab';
import { manifest, methodRun } from './runFixture';
import type { GateState } from '../GateResultState';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
const fused = vi.hoisted(() => ({ metrics: { sample_period_sec: 5 } as Record<string, number> }));
vi.mock('../useFusedRow', () => ({ useFusedRow: () => ({ row: { diagnosis: 'NO_CALL', observabilityFlags: [], gates: [], metrics: fused.metrics, verdictV2: null }, isLoading: false, isError: false }) }));
vi.mock('../EvidenceArtifactRenderer', () => ({ EvidenceArtifactRenderer: () => <div data-testid="artifacts" /> }));
afterEach(cleanup);

const READY: GateState = { kind: 'READY', title: 'Ready', detail: '', stillValid: '', action: 'NONE', tone: 'good' };
const NOT_RETAINED: GateState = { kind: 'NOT_RETAINED', title: 'Evidence not retained for this run', detail: 'policy', stillValid: '', action: 'RECONSTRUCT', tone: 'muted' };
const NOT_EVALUATED: GateState = { kind: 'NOT_EVALUATED', title: 'Not evaluated: the engine looked and declined', detail: 'Reason: no peer links configured.', stillValid: 'This is a verdict.', action: 'NONE', tone: 'warn' };

function show(over: Partial<ProofTabProps> = {}) {
  const props: ProofTabProps = {
    gate: 'G3', run: methodRun({ support: { fromMs: 0, toMs: 43_200_000, sampleCount: 1977 } }), manifest: manifest(), state: READY,
    timeZone: 'UTC', timeFmt: ms => String(ms),
    onRetry: () => {}, onNavigateGate: () => {}, ...over,
  };
  return render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><ProofTab {...props} /></MemoryRouter></QueryClientProvider>);
}

describe('ProofTab', () => {
  it('tabulates the measured input as Measure · Value, the unit beside the number and the code behind the ?', () => {
    show();
    const row = screen.getByRole('row', { name: /Mean absolute error/ });
    expect(within(screen.getByRole('table', { name: /^Inputs of/ })).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Measure', 'Value']);
    expect(row.querySelector('.ui-table__cell--end')?.textContent).toBe('0.7103 PV units');
    expect(screen.queryByText('CPLM-010')).toBeNull();                          // CHG-184: no code on the row itself
    expect(within(row).getByRole('button', { name: 'Mean absolute error' })).toBeTruthy();
    expect(document.querySelector('.ui-table')).toBeTruthy();                    // the shared DataTable
  });

  it('leaves out an input a KPI card already shows', () => {
    show({ shownFields: new Set(['mae']) });
    expect(screen.queryByRole('row', { name: /Mean absolute error/ })).toBeNull();
    expect(screen.queryByRole('table', { name: /^Inputs of/ })).toBeNull();
  });

  it('has no measured-vs-required or what-remains-open section of its own', () => {
    show();
    expect(screen.queryByText(/Measured vs required|What remains open|This gate reports a state|Nothing this window flags/i)).toBeNull();
  });

  // CHG-162: the window and its samples are said once, in the page's foot strip
  it('leaves the window and its samples to the foot strip', () => {
    show();
    expect(screen.queryByText(/Nominal|→/)).toBeNull();
  });


  it('draws the run artifacts when they are ready, and says why there are none when they are not', () => {
    show();
    expect(screen.getByTestId('artifacts')).toBeTruthy();
    cleanup();
    show({ state: NOT_EVALUATED });
    expect(screen.queryByTestId('artifacts')).toBeNull();
    expect(screen.getByText('Not evaluated: the engine looked and declined')).toBeTruthy();
    expect(screen.queryByText(/^Not evaluated$/)).toBeNull();   // CHG-187: no pill repeating the head's mark
  });

  // CHG-187 (owner review 9): "Evidence not kept" is the gate head's label, so the tab adds no note for it
  it('adds no note when the evidence was not kept, and says the tab is empty only when it is', () => {
    show({ state: NOT_RETAINED });
    expect(screen.queryByText(/Evidence not retained for this run|Evidence not kept/)).toBeNull();
    expect(screen.getByRole('row', { name: /Mean absolute error/ })).toBeTruthy();
    expect(screen.queryByText(/No inputs are stored/)).toBeNull();
    cleanup();
    show({ state: NOT_RETAINED, gate: 'G2' });
    expect(screen.getByText('No inputs are stored for this gate, and its evidence was not kept.')).toBeTruthy();
    cleanup();
    show({ state: NOT_RETAINED, shownFields: new Set(['mae']) });   // the inputs are cards above: never "no inputs"
    expect(screen.queryByText(/No inputs are stored/)).toBeNull();
    expect(screen.getByText('No charts for this run.')).toBeTruthy();
  });

  it('offers no links that repeat the tabs above it', () => {
    show();
    expect(screen.queryByRole('button', { name: /See rules|View signal context/ })).toBeNull();
  });
});
