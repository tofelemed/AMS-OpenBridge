// CHG-188 (owner review 10): Evaluate a window is a dialog. Length as 12h / 24h segments, Ending at "Now" by default, the window
// it will evaluate shown before the click, Evaluate as the primary action. Then the run as the status API reports it (Queued,
// Running with a spinner and the time since the click, Done); on Done the page opens the window and the dialog closes by
// itself. A failure stays open with the reason and Retry. Closing mid-run leaves the run going.
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as evaluation from '../../../api/cpm/evaluation';
import { ApiError } from '../../../api/apiFetch';
import { EvaluateWindow } from './EvaluateWindow';
import { requestedEnd } from './evaluationState';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean; variant?: string }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled, 'data-variant': p.variant }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/building-blocks/circular-progress/circular-progress', () => ({
  ObcCircularProgress: () => React.createElement('span', { 'data-testid': 'spinner' }),
}));
vi.mock('../../../api/cpm/evaluation', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/cpm/evaluation')>()),
  postEvaluation: vi.fn(), getEvaluation: vi.fn(),
}));

const NOW = Date.parse('2026-11-06T20:07:00Z');
const RUN_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const run = (over: Partial<evaluation.EvaluationRun> = {}): evaluation.EvaluationRun => ({
  analysisRunId: RUN_ID, loopId: 'FIC10401', purpose: 'EVALUATE', state: 'QUEUED', cached: false, windowKind: '12h',
  fromMs: 0, toMs: 1, statusUrl: '/x', ...over,
});
const done = (over: Partial<evaluation.EvaluationRun> = {}) =>
  run({ state: 'FINISHED', gateResults: 17, verdictMethodRunId: 'g15-run', methodRunIds: { G15: 'g15-run', G5: 'g5-run' }, ...over });

const Harness: React.FC<{ onOpen: () => void }> = ({ onOpen }) => {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open the dialog</button>
      <EvaluateWindow loopId="FIC10401" timeZone="UTC" subtitle="FIC10401 · Flow controller" open={open} onClose={() => setOpen(false)} onOpen={onOpen} />
    </>
  );
};
function renderDialog(onOpen = vi.fn()) {
  // staleTime as App.tsx sets it: a run read moments ago is not read again by itself
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  render(<QueryClientProvider client={qc}><Harness onOpen={onOpen} /></QueryClientProvider>);
  return onOpen;
}
const dialog = () => screen.getByRole('dialog', { name: 'Evaluate a window' });
const status = () => screen.getByRole('status').textContent;
const evaluate = () => fireEvent.click(within(dialog()).getByRole('button', { name: 'Evaluate' }));

describe('EvaluateWindow', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    vi.mocked(evaluation.postEvaluation).mockReset();
    vi.mocked(evaluation.getEvaluation).mockReset();
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('is a dialog with the loop on its band, Length as 12h / 24h segments, Ending at Now and the window before the click', () => {
    renderDialog();
    const d = dialog();
    expect(d.querySelector('.ui-dialog__subtitle')?.textContent).toBe('FIC10401 · Flow controller');
    const length = within(d).getByRole('group', { name: 'Length' });
    expect(within(length).getAllByRole('button').map(b => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([['12h', 'true'], ['24h', 'false']]);
    expect(within(d).getByRole('button', { name: /^Ending at: Now/ }).textContent).toBe('Now');
    expect(d.querySelector('input[type="datetime-local"]')).toBeNull();
    expect(d.textContent).toContain('2026-11-06 08:00:00 → 2026-11-06 20:00:00 (UTC)');
    fireEvent.click(within(length).getByRole('button', { name: '24h' }));
    expect(d.textContent).toContain('2026-11-05 20:00:00 → 2026-11-06 20:00:00 (UTC)');
    // Cancel secondary, Evaluate primary and last; no explanatory sentence
    expect([...d.querySelectorAll('.ui-dialog__foot button')].map(b => [b.textContent, b.getAttribute('data-variant')]))
      .toEqual([['Cancel', 'normal'], ['Evaluate', 'raised']]);
    expect(d.textContent).not.toMatch(/Any window the historian holds|empty = now|from the historian/i);
  });

  it('picks another end from now, and Now goes back to the current window', async () => {
    vi.mocked(evaluation.postEvaluation).mockResolvedValue(run());
    vi.mocked(evaluation.getEvaluation).mockResolvedValue(run());
    renderDialog();
    fireEvent.click(within(dialog()).getByRole('button', { name: /^Ending at: Now/ }));
    const input = dialog().querySelector<HTMLInputElement>('input[type="datetime-local"]')!;
    expect(input.value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);   // never an empty mm/dd/yyyy field
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: '2026-11-06T12:00' } });
    evaluate();
    await waitFor(() => expect(evaluation.postEvaluation).toHaveBeenCalledWith('FIC10401', '12h', requestedEnd('2026-11-06T12:00', Date.now())));
    cleanup();
    renderDialog();
    fireEvent.click(within(dialog()).getByRole('button', { name: /^Ending at: Now/ }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Now' }));
    expect(within(dialog()).getByRole('button', { name: /^Ending at: Now/ })).toBeTruthy();
  });

  it('shows Queued, then Running with a spinner and the time, then Done; opens the window and closes by itself', async () => {
    vi.mocked(evaluation.postEvaluation).mockResolvedValue(run());
    vi.mocked(evaluation.getEvaluation).mockResolvedValueOnce(run({ state: 'RUNNING' })).mockResolvedValue(done());
    const onOpen = renderDialog();
    evaluate();
    await waitFor(() => expect(status()).toBe('Queued'));   // the POST's answer
    expect(screen.getByTestId('spinner')).toBeTruthy();
    expect(within(dialog()).queryByRole('button', { name: 'Evaluate' })).toBeNull();
    expect(within(dialog()).getByRole('group', { name: 'Length' }).querySelector('[aria-disabled="true"]')).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(1_600));
    await waitFor(() => expect(status()).toBe('Running'));
    expect(dialog().querySelector('.cpm-run-progress__elapsed')?.textContent).toMatch(/^\d+:\d{2}$/);
    expect(dialog().textContent).not.toMatch(/%/);
    await act(() => vi.advanceTimersByTimeAsync(1_600));
    await waitFor(() => expect(status()).toMatch(/Done/));
    expect(onOpen).toHaveBeenCalledWith('g15-run', { G15: 'g15-run', G5: 'g5-run' }, RUN_ID);
    expect(screen.queryByTestId('spinner')).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(1_300));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onOpen).toHaveBeenCalledTimes(1);
    // the next opening starts with the form
    fireEvent.click(screen.getByRole('button', { name: 'Open the dialog' }));
    expect(within(dialog()).getByRole('button', { name: 'Evaluate' })).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('a stored result of the same window is Done at once', async () => {
    vi.mocked(evaluation.postEvaluation).mockResolvedValue(done({ cached: true }));
    vi.mocked(evaluation.getEvaluation).mockResolvedValue(done({ cached: true }));
    const onOpen = renderDialog();
    evaluate();
    await waitFor(() => expect(status()).toMatch(/Done/));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('stays open after a failure with the reason, Close and Retry; Retry asks again', async () => {
    vi.mocked(evaluation.postEvaluation).mockResolvedValue(run());
    vi.mocked(evaluation.getEvaluation).mockResolvedValue(run({ state: 'FAILED', error: 'NO_HISTORIAN_DATA: root.hdpe.cpm.FIC10401' }));
    const onOpen = renderDialog();
    evaluate();
    await waitFor(() => expect(status()).toBe('Queued'));   // the POST's answer
    await act(() => vi.advanceTimersByTimeAsync(1_600));   // the first status read
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Failed.*holds no samples/));
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    expect(dialog()).toBeTruthy();   // never closes by itself
    expect([...dialog().querySelectorAll('.ui-dialog__foot button')].map(b => [b.textContent, b.getAttribute('data-variant')]))
      .toEqual([['Close', 'normal'], ['Retry', 'raised']]);
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(evaluation.postEvaluation).toHaveBeenCalledTimes(2));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('a retry answered with the same run shows that answer, not the state read before it', async () => {
    const lost = run({ state: 'FINISHED', gateResults: 0, verdictMethodRunId: 'g15-run', finishedAt: new Date(NOW - 120_000).toISOString() });
    vi.mocked(evaluation.postEvaluation).mockResolvedValueOnce(run()).mockResolvedValue(done({ cached: true }));
    vi.mocked(evaluation.getEvaluation).mockResolvedValue(lost);
    const onOpen = renderDialog();
    evaluate();
    await waitFor(() => expect(status()).toBe('Queued'));
    await act(() => vi.advanceTimersByTimeAsync(1_600));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/did not arrive within a minute/));
    vi.mocked(evaluation.getEvaluation).mockResolvedValue(done({ cached: true }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(status()).toMatch(/Done/));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('shows a refused request in plain words, with Retry', async () => {
    vi.mocked(evaluation.postEvaluation).mockRejectedValue(new ApiError(429, 'x', 'TOO_MANY_EVALUATIONS_IN_FLIGHT'));
    renderDialog();
    evaluate();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/You already have 3 evaluations running/));
    expect(within(dialog()).getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('closing mid-run leaves the run going: reopened it shows the run, and the window still opens when done', async () => {
    vi.mocked(evaluation.postEvaluation).mockResolvedValue(run());
    vi.mocked(evaluation.getEvaluation).mockResolvedValue(run());
    const onOpen = renderDialog();
    evaluate();
    await waitFor(() => expect(status()).toBe('Queued'));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open the dialog' }));
    expect(status()).toBe('Queued');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Close' }));
    vi.mocked(evaluation.getEvaluation).mockResolvedValue(done());
    await act(() => vi.advanceTimersByTimeAsync(1_600));
    await waitFor(() => expect(onOpen).toHaveBeenCalledTimes(1));
    expect(evaluation.postEvaluation).toHaveBeenCalledTimes(1);
  });
});
