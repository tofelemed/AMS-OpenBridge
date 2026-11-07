// Task 18: Re-run this window sends the exact window as a new run and keeps the original.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import * as evaluation from '../../../api/cpm/evaluation';
import { ApiError } from '../../../api/apiFetch';
import { useAuthStore } from '../../../store/authStore';
import { row } from '../evidence/windowFixtures';
import { RerunCard } from './RerunCard';
import { useRerun } from './useRerun';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('../../../api/cpm/evaluation', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/cpm/evaluation')>()),
  postEvaluation: vi.fn(), getEvaluation: vi.fn(),
}));

const END = '2026-10-05T12:30:00Z';
const RUN_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const run = (over: Partial<evaluation.EvaluationRun> = {}): evaluation.EvaluationRun => ({
  analysisRunId: RUN_ID, loopId: 'A', purpose: 'EVALUATE', state: 'QUEUED', cached: false, windowKind: '12h',
  fromMs: 0, toMs: Date.parse(END), statusUrl: '/x', ...over,
});
const done = (over: Partial<evaluation.EvaluationRun> = {}) => run({ state: 'FINISHED', gateResults: 17, verdictMethodRunId: 'vrun', ...over });
const asUser = (permissions: string[]) =>
  useAuthStore.setState({ user: { user_id: 'u', username: 'eng', email: '', role: 'Engineer', is_active: true, permissions }, status: 'authenticated', accessToken: 't' });
const Probe: React.FC = () => { const l = useLocation(); return <div data-testid="loc">{l.pathname + l.search}</div>; };
const wrap = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>;
};

function renderCard(r = row(END, { windowKind: '12h' })) {
  const W = wrap();
  render(<W><RerunCard loopId="A" row={r} timeZone="UTC" /><Probe /></W>);
}
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Re-run this window' }));
const create = () => fireEvent.click(screen.getByRole('button', { name: 'Create run' }));
const btn = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

describe('RerunCard and dialog', () => {
  beforeEach(() => {
    vi.mocked(evaluation.postEvaluation).mockReset();
    vi.mocked(evaluation.getEvaluation).mockReset();
    asUser(['cpm.analysis.create']);
  });
  afterEach(cleanup);

  it('says what a re-run does on the card', () => {
    renderCard();
    expect(screen.getByText('Check the configuration before creating a new run.')).toBeTruthy();
    expect(screen.getByText('Original evidence stays unchanged.')).toBeTruthy();
  });

  it('submits the exact window as a new run and keeps the original', async () => {
    vi.mocked(evaluation.postEvaluation).mockResolvedValue(run());
    vi.mocked(evaluation.getEvaluation).mockResolvedValue(run());
    renderCard();
    open(); create();
    await waitFor(() => expect(evaluation.postEvaluation).toHaveBeenCalledWith('A', '12h', Date.parse(END)));
    expect(evaluation.postEvaluation).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('loc').textContent).toBe('/');   // the original stays on this page
  });

  it('shows queued, running, finished and failed', async () => {
    vi.mocked(evaluation.postEvaluation).mockResolvedValue(run());
    vi.mocked(evaluation.getEvaluation).mockResolvedValue(run({ state: 'QUEUED' }));
    renderCard();
    open(); create();
    await waitFor(() => expect(screen.getAllByText('Queued for the evaluation job…').length).toBeGreaterThan(0));
    cleanup();
    vi.mocked(evaluation.getEvaluation).mockResolvedValue(run({ state: 'RUNNING' }));
    renderCard(); open(); create();
    await waitFor(() => expect(screen.getAllByText('Evaluating from the historian…').length).toBeGreaterThan(0));
    cleanup();
    vi.mocked(evaluation.getEvaluation).mockResolvedValue(done({ samples: 8640 }));
    renderCard(); open(); create();
    await waitFor(() => expect(screen.getAllByText(/Evaluated \(8,640 samples\)/).length).toBeGreaterThan(0));
    cleanup();
    vi.mocked(evaluation.getEvaluation).mockResolvedValue(run({ state: 'FAILED', error: 'NO_HISTORIAN_DATA' }));
    renderCard(); open(); create();
    await waitFor(() => expect(screen.getAllByText('The historian holds no samples for this loop in that window.').length).toBeGreaterThan(0));
  });

  it('opens the new run in the Workbench when it has its stored result', async () => {
    vi.mocked(evaluation.postEvaluation).mockResolvedValue(run());
    vi.mocked(evaluation.getEvaluation).mockResolvedValue(done());
    renderCard();
    open(); create();
    await waitFor(() => btn('Open the new run ↗'));
    fireEvent.click(btn('Open the new run ↗'));
    const loc = screen.getByTestId('loc').textContent!;
    expect(loc.startsWith('/cpm/evidence?')).toBe(true);
    const q = new URLSearchParams(loc.split('?')[1]);
    expect(q.get('loop')).toBe('A');
    expect(q.get('methodRun')).toBe('vrun');
    expect(q.get('gate')).toBe('G15');
    expect(q.get('analysisRun')).toBe(RUN_ID);
    expect(q.get('rerun')).toBeNull();
  });

  it('does not offer the new run when the job finished without a stored result', async () => {
    const old = new Date(Date.now() - 120_000).toISOString();
    vi.mocked(evaluation.postEvaluation).mockResolvedValue(run());
    vi.mocked(evaluation.getEvaluation).mockResolvedValue(run({ state: 'FINISHED', gateResults: 0, finishedAt: old, verdictMethodRunId: 'vrun' }));
    renderCard();
    open(); create();
    expect(await screen.findByText('The run ended without a stored result yet.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open the new run ↗' })).toBeNull();
    expect(screen.queryByText(/^Evaluated/)).toBeNull();
    expect(btn('Check again')).toBeTruthy();
  });

  it('disables Current configuration with its reason', () => {
    renderCard();
    open();
    expect((screen.getByLabelText(/Current configuration/) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('Not available in this release.')).toBeTruthy();
  });

  it('does not promise exact reproduction, nor claim a bundle that may not be held', () => {
    renderCard();
    open();
    expect(screen.getByText(/today.s engine build.*can differ from the original/i)).toBeTruthy();
    expect(screen.getByText(/or the engine default if none are held/)).toBeTruthy();
    expect(screen.queryByText(/reproduc|governed/i)).toBeNull();
  });

  it('opens the run already made for this window, and says so once', async () => {
    vi.mocked(evaluation.postEvaluation).mockResolvedValue(done({ cached: true }));
    vi.mocked(evaluation.getEvaluation).mockResolvedValue(done({ cached: true }));
    renderCard();
    open(); create();
    expect(await screen.findByText(/already made for this window.*held 3 days/i)).toBeTruthy();
    expect(screen.queryByText(/Evaluated earlier/)).toBeNull();
  });

  it('disables Re-run with its reason without cpm.analysis.create', () => {
    asUser([]);
    renderCard();
    expect(btn('Re-run this window').disabled).toBe(true);
    expect(screen.getByText('Needs the cpm.analysis.create permission')).toBeTruthy();
  });

  it('says why a window of another length cannot be re-run', () => {
    renderCard(row(END, { windowKind: '15m' }));
    expect(btn('Re-run this window').disabled).toBe(true);
    expect(screen.getByText('Only 4h, 12h and 24h windows can be re-run')).toBeTruthy();
  });

  it.each([
    [403, undefined, 'You are not allowed to start an evaluation.'],
    [409, 'IDEMPOTENCY_KEY_REUSED', 'The request matched a run that cannot be reused. Try again.'],
    [429, 'TOO_MANY_EVALUATIONS_IN_FLIGHT', 'You already have 3 evaluations running. Wait for one to finish.'],
  ])('reads a %i refusal as a reason', async (status, detail, text) => {
    vi.mocked(evaluation.postEvaluation).mockRejectedValue(new ApiError(status, 'refused', detail));
    renderCard();
    open(); create();
    expect(await screen.findByText(text)).toBeTruthy();
    expect(screen.getByText('Not started')).toBeTruthy();
    expect(btn('Create run').disabled).toBe(false);   // nothing is in flight, so it can be tried again
  });

  it('keeps the run and blocks a second submit when the state cannot be read, and reads it on Check again', async () => {
    vi.mocked(evaluation.postEvaluation).mockResolvedValue(run());
    vi.mocked(evaluation.getEvaluation).mockRejectedValueOnce(new Error('network')).mockResolvedValue(done());
    renderCard();
    open(); create();
    expect(await screen.findByText("The run's state could not be read. It may still finish.")).toBeTruthy();
    expect(btn('Running…').disabled).toBe(true);
    fireEvent.click(btn('Check again'));
    await waitFor(() => btn('Open the new run ↗'));
    expect(evaluation.postEvaluation).toHaveBeenCalledTimes(1);
  });
});

describe('useRerun time limit', () => {
  it('stops polling a run that never settles, says it is still running, and keeps submit blocked', async () => {
    vi.mocked(evaluation.postEvaluation).mockReset();
    vi.mocked(evaluation.getEvaluation).mockReset();
    vi.mocked(evaluation.postEvaluation).mockResolvedValue(run({ state: 'RUNNING' }));
    vi.mocked(evaluation.getEvaluation).mockResolvedValue(run({ state: 'RUNNING' }));
    const { result } = renderHook(() => useRerun('A', 'k', 50), { wrapper: wrap() });
    result.current.submit('12h', Date.parse(END));
    await waitFor(() => expect(result.current.stillRunning).toBe(true));
    expect(result.current.busy).toBe(true);
    const calls = vi.mocked(evaluation.getEvaluation).mock.calls.length;
    result.current.checkAgain();
    await waitFor(() => expect(vi.mocked(evaluation.getEvaluation).mock.calls.length).toBeGreaterThan(calls));
    expect(evaluation.postEvaluation).toHaveBeenCalledTimes(1);
  });
});
