// Task 16: the Proof tab. The window, the inputs with their metric ids, the run's artifacts or the state that says why
// there are none, what remains open, and the two ways on (rules, signal context). The window's expected sample count is
// not served, so the page calls the window divided by the sample period nominal.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProofTab, type ProofTabProps } from './ProofTab';
import { manifest, methodRun } from './runFixture';
import type { GateState } from '../GateResultState';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('../useFusedRow', () => ({ useFusedRow: () => ({ row: { diagnosis: 'NO_CALL', observabilityFlags: [], gates: [], metrics: { sample_period_sec: 5 }, verdictV2: null }, isLoading: false, isError: false }) }));
vi.mock('../ExplainWhy', () => ({ ExplainWhy: () => <div data-testid="explain-why" /> }));
vi.mock('../EvidenceArtifactRenderer', () => ({ EvidenceArtifactRenderer: () => <div data-testid="artifacts" /> }));
afterEach(cleanup);

const READY: GateState = { kind: 'READY', title: 'Ready', detail: '', stillValid: '', action: 'NONE', tone: 'good' };
const NOT_RETAINED: GateState = { kind: 'NOT_RETAINED', title: 'Evidence not retained for this run', detail: 'policy', stillValid: '', action: 'RECONSTRUCT', tone: 'muted' };

function show(over: Partial<ProofTabProps> = {}) {
  const props: ProofTabProps = {
    gate: 'G3', run: methodRun({ support: { fromMs: 0, toMs: 43_200_000, sampleCount: 1977 } }), manifest: manifest(), state: READY,
    eligibilityDetail: null, timeZone: 'UTC', timeFmt: ms => String(ms),
    onRetry: () => {}, onNavigateGate: () => {}, onRules: () => {}, onSignal: () => {}, ...over,
  };
  return render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><ProofTab {...props} /></MemoryRouter></QueryClientProvider>);
}

describe('ProofTab', () => {
  it('tabulates the measured input with its metric id, value and unit', () => {
    show();
    const row = screen.getByRole('row', { name: /Mean absolute error/ });
    expect(row.textContent).toContain('CPLM-010');
    expect(row.textContent).toContain('0.7103');
    expect(row.textContent).toContain('PV units');
  });

  it('calls the window divided by the sample period nominal', () => {
    show();
    expect(screen.getByText(/8,640 samples nominal at 5 s/)).toBeTruthy();
  });

  it('draws the run artifacts when they are ready, and says why there are none when they are not', () => {
    show();
    expect(screen.getByTestId('artifacts')).toBeTruthy();
    cleanup();
    show({ state: NOT_RETAINED });
    expect(screen.queryByTestId('artifacts')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Evidence not retained for this run' })).toBeTruthy();
  });

  it('goes on to the rules and to the signal context', () => {
    const onRules = vi.fn(); const onSignal = vi.fn();
    show({ onRules, onSignal });
    fireEvent.click(screen.getByRole('button', { name: 'See rules & parameters →' }));
    fireEvent.click(screen.getByRole('button', { name: 'View signal context →' }));
    expect(onRules).toHaveBeenCalledTimes(1);
    expect(onSignal).toHaveBeenCalledTimes(1);
  });
});
