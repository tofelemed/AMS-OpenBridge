// Task 18: Re-run this window sends the exact window as a new run and keeps the original.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import * as evaluation from '../../../api/cpm/evaluation';
import { useAuthStore } from '../../../store/authStore';
import { row } from '../evidence/windowFixtures';
import { RerunCard } from './RerunCard';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('../../../api/cpm/evaluation', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/cpm/evaluation')>()),
  postEvaluation: vi.fn(), getEvaluation: vi.fn(),
}));

const END = '2026-10-05T12:30:00Z';
const run = (over: Partial<evaluation.EvaluationRun> = {}): evaluation.EvaluationRun => ({
  analysisRunId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', loopId: 'A', purpose: 'EVALUATE', state: 'QUEUED', cached: false, windowKind: '12h',
  fromMs: 0, toMs: Date.parse(END), statusUrl: '/x', ...over,
});
const asUser = (permissions: string[]) =>
  useAuthStore.setState({ user: { user_id: 'u', username: 'eng', email: '', role: 'Engineer', is_active: true, permissions }, status: 'authenticated', accessToken: 't' });

function renderCard(onCompare = vi.fn(), r = row(END, { windowKind: '12h' })) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><MemoryRouter><RerunCard loopId="A" row={r} timeZone="UTC" onCompare={onCompare} /></MemoryRouter></QueryClientProvider>);
  return onCompare;
}
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Re-run this window' }));
const create = () => fireEvent.click(screen.getByRole('button', { name: 'Create run' }));

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
    vi.mocked(evaluation.getEvaluation).mockResolvedValue(run({ state: 'FINISHED', gateResults: 17, samples: 8640 }));
    renderCard(); open(); create();
    await waitFor(() => expect(screen.getAllByText(/Evaluated \(8,640 samples\)/).length).toBeGreaterThan(0));
    cleanup();
    vi.mocked(evaluation.getEvaluation).mockResolvedValue(run({ state: 'FAILED', error: 'NO_HISTORIAN_DATA' }));
    renderCard(); open(); create();
    await waitFor(() => expect(screen.getAllByText('The historian holds no samples for this loop in that window.').length).toBeGreaterThan(0));
  });

  it('offers a comparison with the original when finished', async () => {
    vi.mocked(evaluation.postEvaluation).mockResolvedValue(run());
    vi.mocked(evaluation.getEvaluation).mockResolvedValue(run({ state: 'FINISHED', gateResults: 17 }));
    const onCompare = renderCard();
    open(); create();
    fireEvent.click(await screen.findByRole('button', { name: 'Compare with the original ↗' }));
    expect(onCompare).toHaveBeenCalledWith('aaaaaaaabbbb');   // the replay id is the first 12 hex characters of the run id
  });

  it('disables Current configuration with its reason', () => {
    renderCard();
    open();
    const radio = screen.getByLabelText(/Current configuration/) as HTMLInputElement;
    expect(radio.disabled).toBe(true);
    expect(screen.getByText('Not available in this release.')).toBeTruthy();
  });

  it('does not promise exact reproduction', () => {
    renderCard();
    open();
    expect(screen.getByText(/uses the window.s governed bundle and today.s engine build/i)).toBeTruthy();
    expect(screen.queryByText(/reproduc/i)).toBeNull();
  });

  it('opens the run already made for this window, and says so', async () => {
    vi.mocked(evaluation.postEvaluation).mockResolvedValue(run({ cached: true, state: 'FINISHED', gateResults: 17 }));
    vi.mocked(evaluation.getEvaluation).mockResolvedValue(run({ cached: true, state: 'FINISHED', gateResults: 17 }));
    renderCard();
    open(); create();
    expect(await screen.findByText(/already made for this window.*held 3 days/i)).toBeTruthy();
  });

  it('disables Re-run with its reason without cpm.analysis.create', () => {
    asUser([]);
    renderCard();
    const b = screen.getByRole('button', { name: 'Re-run this window' }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(screen.getByText('Needs the cpm.analysis.create permission')).toBeTruthy();
  });

  it('says why a window of another length cannot be re-run', () => {
    renderCard(vi.fn(), row(END, { windowKind: '15m' }));
    expect((screen.getByRole('button', { name: 'Re-run this window' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Only 4h, 12h and 24h windows can be re-run')).toBeTruthy();
  });
});
