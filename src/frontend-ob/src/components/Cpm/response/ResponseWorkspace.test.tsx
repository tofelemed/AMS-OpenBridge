// Task 21 / CHG-165: the System Response page: six tabs in the address, the merged empty state, the permission-gated G12 link,
// the event chosen in the band or the Events table, and the band's exits.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../../store/authStore';
import type { ResponseEventSummary } from '../../../api/cpm/response';

const state = vi.hoisted(() => ({
  events: [] as unknown[], hasNext: false, models: [] as unknown[],
  censored: [] as unknown[], detail: undefined as unknown, asked: [] as boolean[],
}));

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('../../../hooks/useCpm', () => ({ useCpmLoops: () => ({ data: { loops: [{ loopId: 'FIC1' }] }, isError: false }) }));
vi.mock('../context/LoopBand', () => ({ LoopBand: (p: { children?: React.ReactNode; end?: React.ReactNode }) => React.createElement('div', null, p.children, p.end) }));
vi.mock('./useResponse', () => ({
  // the censored events are listed only when asked for (includeCensored), and always counted
  useResponseEvents: (_loop: string, _purpose: string, includeCensored: boolean) => {
    state.asked.push(includeCensored);
    const events = includeCensored ? [...state.events, ...state.censored] : state.events;
    return { data: { pages: [{ events, censoredCount: state.censored.length }] }, isSuccess: true, isLoading: false, isFetchingNextPage: false, hasNextPage: state.hasNext, fetchNextPage: () => {} };
  },
  useResponseEvent: () => ({ data: state.detail, isLoading: false, isError: false }),
  useModels: () => ({ data: { models: state.models }, isSuccess: true, isError: false }),
  useReviewModel: () => ({ reset: () => {}, isSuccess: false, isPending: false, error: null, mutate: () => {} }),
}));
vi.mock('../evidence/useEvidence', () => ({
  useEvidenceManifest: () => ({ data: undefined, isLoading: false, isError: false }),
  useMethodRun: () => ({ data: undefined, isError: false }),
}));
vi.mock('../evidence/useGateArtifacts', () => ({ useGateArtifacts: () => ({ byKind: {}, loading: false }) }));
import { ResponseWorkspace } from './ResponseWorkspace';

afterEach(() => { cleanup(); state.events = []; state.models = []; state.hasNext = false; state.censored = []; state.detail = undefined; state.asked = []; });
const Where: React.FC = () => <output data-testid="where">{useLocation().pathname + useLocation().search}</output>;
const draw = (perms: string[], at = '/cpm/response?loop=FIC1') => {
  useAuthStore.setState({ user: { user_id: 'u', username: 'a', email: '', role: 'Admin', is_active: true, permissions: perms }, status: 'authenticated', accessToken: 't' });
  return render(<MemoryRouter initialEntries={[at]}><ResponseWorkspace /><Where /></MemoryRouter>);
};
const ev = (i: number): ResponseEventSummary => ({
  eventId: `e${i}`, methodRunId: `r${i}`, eventType: 'INPUT_TEST', pathId: 'OP_TO_PV', t0Ms: 1000 + i, tEndMs: null, captureState: 'COMPLETE', censorReason: '',
  evaluationState: 'EVALUATED', eligibility: 'ELIGIBLE', finding: 'RESPONSE_CHARACTERISED', modelState: 'NONE', purpose: 'LIVE', bundleHash: 'b', resultRevision: 1, emittedAtMs: null,
});

describe('ResponseWorkspace', () => {
  it('titles the page as the sidebar does', () => {
    draw(['cpm.config.read']);
    expect(screen.getByRole('heading', { level: 1, name: 'System Response' })).toBeTruthy();
  });

  it('merges the empty states into one panel and offers G12 settings only with cpm.config.read', () => {
    draw(['cpm.config.read']);
    expect(screen.getAllByText('No qualifying response event')).toHaveLength(1);
    expect(screen.queryByText(/Setpoint changes in Historical/)).toBeNull();
    expect(screen.getByText('Check G12 settings')).toBeTruthy();
    expect(screen.getByText('Open loop ↗')).toBeTruthy();
    expect(screen.queryByText('System model')).toBeNull();               // CHG-165: the empty panel says it alone, no zero tiles beside it
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    cleanup();
    draw([]);
    expect(screen.queryByText('Check G12 settings')).toBeNull();
  });

  it('opens on Events with data: six plain tabs, the events table, a row opens its event on Response', () => {
    state.events = [ev(1), ev(2)];
    draw(['cpm.model.review']);
    expect(screen.queryByText('No qualifying response event')).toBeNull();
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Events', 'Response', 'Fit quality', 'Frequency', 'Steps & data', 'Models']);
    expect(screen.getByRole('tab', { name: 'Events' }).getAttribute('aria-selected')).toBe('true');
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    fireEvent.click(rows[1]);
    expect(screen.getByTestId('where').textContent).toBe('/cpm/response?loop=FIC1&event=e2&tab=response');
  });

  it('chooses an event in the band and steps to the older one', () => {
    state.events = [ev(1), ev(2)];
    draw([]);
    fireEvent.change(screen.getByRole('combobox', { name: 'Response event' }), { target: { value: 'e1' } });
    expect(screen.getByTestId('where').textContent).toBe('/cpm/response?loop=FIC1&event=e1&tab=response');
    fireEvent.click(screen.getByText('›'));
    expect(screen.getByTestId('where').textContent).toBe('/cpm/response?loop=FIC1&event=e2&tab=response');
  });

  it('opens a linked event on Response, and the band opens its G12 run in the Workbench', () => {
    state.events = [ev(1)];
    draw([], '/cpm/response?loop=FIC1&event=e1');
    expect(screen.getByRole('tab', { name: 'Response' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByText(/run r1/)).toBeNull();                         // CHG-195: no foot line; the band names the event
    fireEvent.click(screen.getByText('Workbench ↗'));
    expect(screen.getByTestId('where').textContent).toMatch(/^\/cpm\/evidence\?.*methodRun=r1.*gate=G12|^\/cpm\/evidence\?.*gate=G12.*methodRun=r1/);
  });

  it('asks for an event on a tab that reads one, and Next moves to the following tab', () => {
    state.events = [ev(1)];
    draw([], '/cpm/response?loop=FIC1&tab=fit');
    expect(screen.getByText('No event selected')).toBeTruthy();
    fireEvent.click(screen.getByText('Next: Frequency →'));
    expect(screen.getByTestId('where').textContent).toBe('/cpm/response?loop=FIC1&tab=frequency');
  });

  // CHG-196 (found by CHG-195): the event detail carries the censored state as evaluation_state, never capture_state
  it('a link straight to a censored event lists the censored events and selects it', () => {
    state.events = [ev(1)];
    state.censored = [{ ...ev(9), eventId: 'c1', methodRunId: 'rc1', captureState: 'CENSORED', censorReason: 'SUPERSEDED_BY_EVENT', evaluationState: 'CENSORED', modelState: 'NONE' }];
    state.detail = {
      result: { event_id: 'c1', method_run_id: 'rc1', loop_id: 'FIC1', path_id: 'OP_TO_PV', evaluation_state: 'CENSORED', eligibility: 'ELIGIBLE', finding: 'SUPERSEDED_BY_EVENT',
        model_state: 'NONE', subgates: {}, window_start_ms: 0, window_end_ms: 0, bundle_hash: 'b', purpose: 'LIVE' },
      metrics: [],
    };
    draw([], '/cpm/response?loop=FIC1&event=c1');
    expect(state.asked.at(-1)).toBe(true);
    const select = screen.getByRole('combobox', { name: 'Response event' }) as HTMLSelectElement;
    expect(select.value).toBe('c1');
    expect(screen.queryByText('Selected event (not in the list)')).toBeNull();
  });

  it('shows a plus on the counts past one page', () => {
    state.events = [ev(1)]; state.hasNext = true;
    draw([]);
    expect(screen.getAllByText('1+').length).toBe(2);
  });
});
