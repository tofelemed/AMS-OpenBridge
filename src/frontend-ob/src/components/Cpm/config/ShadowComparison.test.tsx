// CHG-169 (owner review): the Shadow tab. Run shadow is the one control (the lifecycle's Shadow button only switched tabs);
// it sends the same request as before (the loop only for a bundle that is not a LOOP bundle, one day = 24 h by default). A version
// that is frozen no longer says "Validate the bundle first" (it is validated, it is frozen: the reason is said once above).
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as fetchMod from '../../../api/apiFetch';
import { sameResultWords, ShadowComparison } from './ShadowComparison';
import type { Bundle } from '../../../api/cpm/config';

vi.mock('../../../api/apiFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/apiFetch')>();
  return { ...actual, apiJson: vi.fn() };
});
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
afterEach(cleanup);
beforeEach(() => { vi.mocked(fetchMod.apiJson).mockReset(); });

const bundle = (over: Partial<Bundle>): Bundle => ({
  bundleId: 'b1', version: 1, contentHash: 'h', site: 'hdpe', scopeKind: 'LOOP', scopeRef: 'FIC10301', state: 'VALIDATED', shadow: null, layers: [], resolved: { properties: {}, sources: {} }, ...over,
} as unknown as Bundle);
const view = (b: Bundle, extra: Partial<React.ComponentProps<typeof ShadowComparison>> = {}) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ShadowComparison bundle={b} defaultLoopId="FIC10301" canShadow pending={false} error={null} onStart={() => {}} {...extra} />
  </QueryClientProvider>);

describe('ShadowComparison', () => {
  it('a validated LOOP bundle runs over its own loop: no loop or days to fill, the request carries no loop', () => {
    const onStart = vi.fn();
    view(bundle({}), { onStart });
    expect(screen.getByText('Try on past data', { selector: 'h2' })).toBeTruthy();
    expect(screen.getByText('Not tried')).toBeTruthy();
    expect(screen.queryByLabelText('Loop')).toBeNull();
    expect(screen.queryByLabelText('Hours')).toBeNull();
    expect(screen.queryByLabelText('Days')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try on past data' }));
    expect(onStart).toHaveBeenCalledWith({ loopId: undefined, hours: 24 });
  });

  it('a SITE bundle names the loop to run over and the days (1 to 7, sent as whole days of hours); blank sends one day', () => {
    const onStart = vi.fn();
    view(bundle({ scopeKind: 'SITE', scopeRef: null }), { onStart, defaultLoopId: undefined });
    expect(screen.queryByLabelText('Hours')).toBeNull();
    expect((screen.getByLabelText('Loop') as HTMLInputElement).placeholder).toBe('');
    fireEvent.change(screen.getByLabelText('Loop'), { target: { value: 'FIC10401' } });
    const days = screen.getByLabelText('Days') as HTMLInputElement;
    expect(days.value).toBe('1');
    const send = (value: string) => { fireEvent.change(days, { target: { value } }); fireEvent.click(screen.getByRole('button', { name: 'Try on past data' })); };
    send('');
    send('3');
    send('30');
    expect(onStart.mock.calls.map(c => c[0])).toEqual([{ loopId: 'FIC10401', hours: 24 }, { loopId: 'FIC10401', hours: 72 }, { loopId: 'FIC10401', hours: 168 }]);
  });

  it('the window table names diagnoses and gate results in words, never engine codes', async () => {
    vi.mocked(fetchMod.apiJson).mockResolvedValue({ bundleId: 'b1', analysisRunId: 'r1', runState: 'FINISHED', loopId: 'FIC10301', fromMs: 0, toMs: 1, shadowRows: 1,
      comparedWindows: 1, symptomsRemoved: 1, symptomsAdded: 0, reclassification: null, comparedAt: 't',
      windows: [{ windowKind: '24h', windowEnd: '2026-11-22T00:00:00Z', diagnosisBefore: 'SUSPECTED_OSCILLATION', diagnosisAfter: 'NO_CALL', changed: [{ gate: 'G5', before: 'DETECTED', after: 'NOT_DETECTED' }] }] } as never);
    view(bundle({ state: 'SHADOW_EVALUATED', shadow: { analysisRunId: 'r1', loopId: 'FIC10301', contentHash: 'h' } as never }));
    const table = await screen.findByRole('table');
    expect(table.textContent).toContain('Oscillation suspected → No fault identified');
    expect(table.textContent).toContain('Oscillation (ACF): ');
    expect(table.textContent).not.toMatch(/\b[A-Z][A-Z0-9]+_[A-Z0-9_]+\b/);
  });

  it('a draft says to check first; a frozen version says nothing under the button; no permission says so', () => {
    view(bundle({ state: 'DRAFT' }));
    expect(screen.getByText('Check the change first')).toBeTruthy();
    cleanup();
    view(bundle({ state: 'ACTIVE_VERIFIED' }));
    expect((screen.getByRole('button', { name: 'Try on past data' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/Check the change first/)).toBeNull();
    cleanup();
    view(bundle({}), { canShadow: false });
    expect(screen.getByText('Needs permission to try changes')).toBeTruthy();
  });

  it('no explanatory sentence: no ? text about what a run does', () => {
    view(bundle({}));
    expect(screen.queryByText(/re-evaluates a retained interval/)).toBeNull();
    expect(screen.queryByLabelText('What a shadow run does')).toBeNull();
  });

  it('while starting it says Starting… (about 30 s); a refusal is shown', () => {
    view(bundle({}), { pending: true, error: new Error('validate the draft first (state DRAFT)') });
    expect((screen.getByRole('button', { name: 'Starting… (about 30 s)' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toMatch(/validate the draft first/);
  });

  it('a 502 or 504 on start is not an error: it reads Starting… and the bundle is read again', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(client, 'invalidateQueries');
    for (const status of [502, 504]) {
      spy.mockClear();
      render(<QueryClientProvider client={client}>
        <ShadowComparison bundle={bundle({})} defaultLoopId="FIC10301" canShadow pending={false} error={new fetchMod.ApiError(status, 'bad gateway')} onStart={() => {}} />
      </QueryClientProvider>);
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getByRole('button', { name: 'Starting… (about 30 s)' })).toBeTruthy();
      expect(spy).toHaveBeenCalledWith({ queryKey: ['cpm', 'config'] });
      cleanup();
    }
    view(bundle({}), { error: new fetchMod.ApiError(400, 'nope') });
    expect(screen.getByRole('alert').textContent).toMatch(/nope/);
  });

  it('names the loop a shadow run used, never the run id (CHG-184)', () => {
    vi.mocked(fetchMod.apiJson).mockImplementation(() => new Promise(() => {}));
    view(bundle({ shadow: { analysisRunId: '7c1e04a2-9b3d-4e5f-a1b2-c3d4e5f60718', loopId: 'FIC10301' } }));
    expect(screen.getByText('Run on')).toBeTruthy();
    expect(screen.queryByText(/7c1e04a2/)).toBeNull();
  });
});

// CHG-220 (Gate Configuration check, gap 7): the comparison stopped at "Submitted" (only "Running" was read again), Run again
// showed the previous run, and an edited draft showed the comparison of its old content.
describe('ShadowComparison keeps to the current run and content (CHG-220)', () => {
  const report = (over: Record<string, unknown>) => ({ bundleId: 'b1', analysisRunId: 'r1', runState: 'FINISHED', loopId: 'FIC10301', fromMs: 0, toMs: 1, shadowRows: 3,
    comparedWindows: 3, symptomsRemoved: 1, symptomsAdded: 0, reclassification: null, comparedAt: 't', windows: [], ...over });

  it('a submitted run reads as in progress and is read again until it ends', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.mocked(fetchMod.apiJson).mockResolvedValueOnce(report({ runState: 'SUBMITTED', shadowRows: 0, comparedWindows: 0, symptomsRemoved: 0 }) as never)
        .mockResolvedValue(report({}) as never);
      view(bundle({ state: 'SHADOW_EVALUATED', shadow: { analysisRunId: 'r1', loopId: 'FIC10301', contentHash: 'h' } as never }));
      expect(await screen.findByText('Submitted')).toBeTruthy();
      await vi.advanceTimersByTimeAsync(10_500);
      expect(await screen.findByText('Finished')).toBeTruthy();
      expect(screen.getByText(/1 removed · 0 added/)).toBeTruthy();
    } finally { vi.useRealTimers(); }
  });

  it('a run of content the draft no longer has is not its comparison', async () => {
    vi.mocked(fetchMod.apiJson).mockResolvedValue(report({}) as never);
    view(bundle({ contentHash: 'h2', shadow: { analysisRunId: 'r1', loopId: 'FIC10301', contentHash: 'h1' } as never }));
    expect(screen.getByText('This change was edited after the last run.')).toBeTruthy();
    expect(screen.getByText('Not tried')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.queryByText(/removed ·/)).toBeNull();
    expect(fetchMod.apiJson).not.toHaveBeenCalled();
  });
});

describe('ShadowComparison run states in words (Task 8)', () => {
  const report = (over: Record<string, unknown>) => ({ bundleId: 'b1', analysisRunId: 'r1', runState: 'SUBMITTED', loopId: 'FIC10301', fromMs: 0, toMs: 1, shadowRows: 0,
    comparedWindows: 0, symptomsRemoved: 0, symptomsAdded: 0, reclassification: null, comparedAt: 't', windows: [], ...over });
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  const shadowOf = (startedAt: string) => ({ analysisRunId: 'r1', loopId: 'FIC10301', contentHash: 'h', startedAt }) as never;

  it('a run submitted for over 2 minutes reads Waiting for free capacity; a younger one does not', async () => {
    vi.mocked(fetchMod.apiJson).mockResolvedValue(report({}) as never);
    view(bundle({ state: 'SHADOW_EVALUATED', shadow: shadowOf(ago(3 * 60_000)) }));
    expect(await screen.findByText('Waiting for free capacity')).toBeTruthy();
    cleanup();
    view(bundle({ state: 'SHADOW_EVALUATED', shadow: shadowOf(ago(30_000)) }));
    expect(await screen.findByText('Submitted')).toBeTruthy();
    expect(screen.queryByText('Waiting for free capacity')).toBeNull();
  });

  it('a finished run with nothing compared says No matching live results to compare', async () => {
    vi.mocked(fetchMod.apiJson).mockResolvedValue(report({ runState: 'FINISHED', shadowRows: 3 }) as never);
    view(bundle({ state: 'SHADOW_EVALUATED', shadow: shadowOf(ago(60_000)) }));
    expect(await screen.findByText('No matching live results to compare')).toBeTruthy();
    expect(screen.queryByText(/the loop had no live results/)).toBeNull();
  });
});

describe('ShadowComparison after a gateway timeout and a failed run (fix round 1)', () => {
  const finished = { bundleId: 'b1', analysisRunId: 'r1', runState: 'FINISHED', loopId: 'FIC10301', fromMs: 0, toMs: 1, shadowRows: 3,
    comparedWindows: 3, symptomsRemoved: 1, symptomsAdded: 0, reclassification: null, comparedAt: 't', windows: [] };
  const timeout = () => new fetchMod.ApiError(504, 'gateway timeout');
  const wrap = (b: Bundle, error: unknown, client: QueryClient) => (
    <QueryClientProvider client={client}>
      <ShadowComparison bundle={b} defaultLoopId="FIC10301" canShadow pending={false} error={error} onStart={() => {}} />
    </QueryClientProvider>);

  it('a 504 that stays as the error stops reading Starting once the bundle shows a run for this content', async () => {
    vi.mocked(fetchMod.apiJson).mockResolvedValue(finished as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(wrap(bundle({}), timeout(), client));
    expect(screen.getByRole('button', { name: 'Starting… (about 30 s)' })).toBeTruthy();
    rerender(wrap(bundle({ state: 'SHADOW_EVALUATED', shadow: { analysisRunId: 'r1', loopId: 'FIC10301', contentHash: 'h' } as never }), timeout(), client));
    expect(await screen.findByText('Finished')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Starting/ })).toBeNull();
    expect((screen.getByRole('button', { name: 'Try again' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a 504 with no run after 2 minutes shows the error and the button works again', async () => {
    vi.useFakeTimers();
    try {
      render(wrap(bundle({}), timeout(), new QueryClient({ defaultOptions: { queries: { retry: false } } })));
      expect(screen.getByRole('button', { name: 'Starting… (about 30 s)' })).toBeTruthy();
      await vi.advanceTimersByTimeAsync(2 * 60_000 + 1000);
      expect(screen.getByRole('alert').textContent).toMatch(/gateway timeout/);
      expect((screen.getByRole('button', { name: 'Try on past data' }) as HTMLButtonElement).disabled).toBe(false);
    } finally { vi.useRealTimers(); }
  });

  it.each([['FAILED', 'The run failed'], ['SUBMIT_FAILED', 'The run failed'], ['CANCELED', 'The run was cancelled']])('a %s run says %s, never "No matching live results", and Try again is enabled', async (runState, words) => {
    vi.mocked(fetchMod.apiJson).mockResolvedValue({ ...finished, runState, comparedWindows: 0 } as never);
    view(bundle({ state: 'SHADOW_EVALUATED', shadow: { analysisRunId: 'r1', loopId: 'FIC10301', contentHash: 'h' } as never }));
    expect(await screen.findByText(words)).toBeTruthy();
    expect(screen.queryByText('No matching live results to compare')).toBeNull();
    expect((screen.getByRole('button', { name: 'Try again' }) as HTMLButtonElement).disabled).toBe(false);
  });
});


describe('ShadowComparison retest fixes (issue 5)', () => {
  const rep = (over: Record<string, unknown>) => ({ bundleId: 'b1', analysisRunId: 'r1', runState: 'FINISHED', loopId: 'FIC10301', fromMs: 0, toMs: 1, shadowRows: 0,
    comparedWindows: 0, symptomsRemoved: 0, symptomsAdded: 0, reclassification: null, comparedAt: 't', windows: [], ...over });
  const tried = () => bundle({ state: 'SHADOW_EVALUATED', shadow: { analysisRunId: 'r1', loopId: 'FIC10301', contentHash: 'h' } as never });
  it('0 of 0 windows on a type change says the days of the run, 1 day singular', async () => {
    const h = 3600000;
    vi.mocked(fetchMod.apiJson).mockResolvedValue(rep({ fromMs: 0, toMs: 3 * 24 * h }) as never);
    view({ ...tried(), scopeKind: 'PROFILE', scopeRef: 'FIC' } as never);
    expect(await screen.findByText('No data in the last 3 days')).toBeTruthy();
    cleanup();
    vi.mocked(fetchMod.apiJson).mockResolvedValue(rep({ fromMs: 0, toMs: 24 * h }) as never);
    view({ ...tried(), scopeKind: 'PROFILE', scopeRef: 'FIC' } as never);
    expect(await screen.findByText('No data in the last 1 day')).toBeTruthy();
  });
  it('0 of 0 windows on a loop change says No data in the last 24 hours', async () => {
    vi.mocked(fetchMod.apiJson).mockResolvedValue(rep({ fromMs: null, toMs: null }) as never);
    view(tried());
    expect(await screen.findByText('No data in the last 24 hours')).toBeTruthy();
    expect(screen.queryByText(/chosen period/)).toBeNull();
    expect(screen.queryByText('No matching live results to compare')).toBeNull();
  });
  it('compared windows with no change say the result is the same', async () => {
    vi.mocked(fetchMod.apiJson).mockResolvedValue(rep({ shadowRows: 1, comparedWindows: 1 }) as never);
    view(tried());
    expect(await screen.findByText(/Same result/)).toBeTruthy();
  });
  it('Same result names the diagnoses the compared windows kept (re-check item 6)', async () => {
    vi.mocked(fetchMod.apiJson).mockResolvedValue(rep({ shadowRows: 12, comparedWindows: 12, unchanged: [{ diagnosis: 'HEALTHY', windows: 10 }, { diagnosis: 'CONFIRMED_OSCILLATION', windows: 2 }] }) as never);
    view(tried());
    expect(await screen.findByText('Same result in all 12 compared windows: No problem found 10 · Oscillation confirmed 2')).toBeTruthy();
  });
  it('sameResultWords: one window names its diagnosis; without the counts (an older server) the sentence alone', () => {
    expect(sameResultWords(1, [{ diagnosis: 'HEALTHY', windows: 1 }])).toBe('Same result in the compared window: No problem found');
    expect(sameResultWords(3, undefined)).toBe('Same result in all 3 compared windows');
    expect(sameResultWords(3, [])).toBe('Same result in all 3 compared windows');
    expect(sameResultWords(2, [{ diagnosis: null, windows: 2 }])).toBe('Same result in all 2 compared windows: Not evaluated yet 2');
  });
  it('Try again comes after the inputs (Period), not between Run on and Period', async () => {
    vi.mocked(fetchMod.apiJson).mockResolvedValue(rep({ shadowRows: 1, comparedWindows: 1 }) as never);
    view(tried());
    const period = await screen.findByText('Period');
    const btn = screen.getByRole('button', { name: 'Try again' });
    expect(period.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
