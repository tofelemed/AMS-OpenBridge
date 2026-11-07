// Task 21: the System Response page: tiles, the merged empty state, the permission-gated G12 link, and event selection by address.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../../store/authStore';
import type { ResponseEventSummary } from '../../../api/cpm/response';

const state = vi.hoisted(() => ({ events: [] as unknown[], hasNext: false, models: [] as unknown[] }));

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('../../../hooks/useCpm', () => ({ useCpmLoops: () => ({ data: { loops: [{ loopId: 'FIC1' }] }, isError: false }) }));
vi.mock('../context/LoopBand', () => ({ LoopBand: (p: { children?: React.ReactNode }) => React.createElement('div', null, p.children) }));
vi.mock('./useResponse', () => ({
  useResponseEvents: () => ({ data: { pages: [{ events: state.events, censoredCount: 0 }] }, isSuccess: true, isLoading: false, isFetchingNextPage: false, hasNextPage: state.hasNext, fetchNextPage: () => {} }),
  useResponseEvent: () => ({ data: undefined, isLoading: false, isError: false }),
  useModels: () => ({ data: { models: state.models }, isSuccess: true, isError: false }),
  useReviewModel: () => ({ reset: () => {}, isSuccess: false, isPending: false, error: null, mutate: () => {} }),
}));
vi.mock('../evidence/useEvidence', () => ({
  useEvidenceManifest: () => ({ data: undefined, isLoading: false, isError: false }),
  useMethodRun: () => ({ data: undefined, isError: false }),
}));
vi.mock('../evidence/useGateArtifacts', () => ({ useGateArtifacts: () => ({ byKind: {}, loading: false }) }));
import { ResponseWorkspace } from './ResponseWorkspace';

afterEach(() => { cleanup(); state.events = []; state.models = []; state.hasNext = false; });
const Where: React.FC = () => <output data-testid="where">{useLocation().pathname + useLocation().search}</output>;
const draw = (perms: string[]) => {
  useAuthStore.setState({ user: { user_id: 'u', username: 'a', email: '', role: 'Admin', is_active: true, permissions: perms }, status: 'authenticated', accessToken: 't' });
  return render(<MemoryRouter initialEntries={['/cpm/response?loop=FIC1']}><ResponseWorkspace /><Where /></MemoryRouter>);
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
    expect(screen.getByText('None')).toBeTruthy();                       // no model held
    cleanup();
    draw([]);
    expect(screen.queryByText('Check G12 settings')).toBeNull();
  });

  it('keeps the three columns with data and selects an event through the address', () => {
    state.events = [ev(1), ev(2)];
    draw(['cpm.model.review']);
    expect(screen.queryByText('No qualifying response event')).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: /INPUT_TEST/ })[1]);
    expect(screen.getByTestId('where').textContent).toBe('/cpm/response?loop=FIC1&event=e2');
  });

  it('shows a plus on the counts past one page', () => {
    state.events = [ev(1)]; state.hasNext = true;
    draw([]);
    expect(screen.getAllByText('1+').length).toBe(2);
  });
});
