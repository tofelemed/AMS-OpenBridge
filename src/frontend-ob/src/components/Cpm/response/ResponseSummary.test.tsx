// Task 21: the System Response summary tiles and the merged empty state.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ResponseEmpty, ResponseTiles, responseFacts } from './ResponseSummary';
import type { ResponseEventSummary, SystemModel } from '../../../api/cpm/response';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
afterEach(cleanup);

const ev = (over: Partial<ResponseEventSummary>): ResponseEventSummary => ({
  eventId: 'e1', methodRunId: 'r1', eventType: 'INPUT_TEST', pathId: 'OP_TO_PV', t0Ms: 1, tEndMs: null, captureState: 'COMPLETE', censorReason: '',
  evaluationState: 'EVALUATED', eligibility: 'ELIGIBLE', finding: 'RESPONSE_CHARACTERISED', modelState: 'CANDIDATE', purpose: 'LIVE', bundleHash: 'b', resultRevision: 1, emittedAtMs: null, ...over,
});
const model = (state: string): SystemModel => ({
  modelId: state, loopId: 'L', pathId: 'OP_TO_PV', family: 'FOPDT', parameters: null, estimator: '', uncertaintyMethod: '', trainingSupport: null, validationSupport: null,
  modelState: state, approvedDomain: null, controllerSnapshotId: null, contextRevision: 1, createdFromEvent: null, methodRunId: null, bundleHash: 'b', revision: 1,
  reviewedBy: null, reviewedAt: null, reviewNote: null, createdAt: '2026-09-16T12:00:00Z', supersededBy: null,
});

describe('responseFacts', () => {
  it('counts events and accepted events, with a plus past one page', () => {
    const events = Array.from({ length: 50 }, (_, i) => ev({ eventId: `e${i}`, ...(i < 10 ? { captureState: 'REJECTED', modelState: 'NONE' } : {}) }));
    const f = responseFacts(events, true, [model('VALIDATED')]);
    expect(f.events).toBe('50+');
    expect(f.accepted).toBe('40+');
    expect(responseFacts(events.slice(0, 3), false, []).events).toBe('3');
  });

  it('shows the best model state, and no model without an accepted event', () => {
    expect(responseFacts([ev({})], false, [model('CANDIDATE'), model('ACTIVE_BASELINE')]).model).toBe('Active baseline');
    expect(responseFacts([ev({})], false, [model('CANDIDATE')]).model).toBe('Candidate');
    expect(responseFacts([ev({})], false, []).model).toBe('Not estimated');
    const none = responseFacts([ev({ eligibility: 'INELIGIBLE', modelState: 'NONE' })], false, [model('VALIDATED')]);
    expect(none.accepted).toBe('0');
    expect(none.model).toBe('None');
  });
});

describe('ResponseTiles', () => {
  it('renders the three tiles', () => {
    render(<ResponseTiles events={[ev({})]} hasMore={false} models={[model('VALIDATED')]} />);
    expect(screen.getByText('Response events')).toBeTruthy();
    expect(screen.getByText('Accepted events')).toBeTruthy();
    expect(screen.getByText('System model')).toBeTruthy();
    expect(screen.getByText('Validated')).toBeTruthy();
  });
});

const Where: React.FC = () => <output data-testid="where">{useLocation().pathname + useLocation().search}</output>;

describe('ResponseEmpty', () => {
  const draw = (canConfig: boolean, censored = 0) => render(
    <MemoryRouter><ResponseEmpty loopId="FIC1" canConfig={canConfig} censoredCount={censored} /><Where /></MemoryRouter>);

  it('merges the empty states: one panel, Historical and G12 settings', () => {
    draw(true);
    expect(screen.getByText('No qualifying response event')).toBeTruthy();
    expect(screen.getByText(/A qualifying setpoint or output step is needed/)).toBeTruthy();
    expect(screen.queryByText(/Events are captured from/)).toBeNull();
    fireEvent.click(screen.getByText(/Review setpoint changes/));
    expect(screen.getByTestId('where').textContent).toBe('/cpm/historical?loop=FIC1');
    fireEvent.click(screen.getByText('Check G12 settings'));
    expect(screen.getByTestId('where').textContent).toBe('/cpm/config?loop=FIC1&view=effective&gate=G12');
  });

  it('hides the G12 settings without cpm.config.read, and says censored candidates exist', () => {
    draw(false, 2);
    expect(screen.queryByText('Check G12 settings')).toBeNull();
    expect(screen.getByText(/2 captured candidates were censored/)).toBeTruthy();
  });

  it('shows the four steps and opens Event states explained', () => {
    draw(true);
    for (const s of ['Capture', 'Qualify', 'Estimate', 'Review']) expect(screen.getByText(new RegExp(`^\\d · ${s}$`))).toBeTruthy();
    fireEvent.click(screen.getByText(/Event states explained/));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Eligible for model fitting')).toBeTruthy();
  });
});
