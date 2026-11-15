// CHG-198 (owner, 2026-11-15): "Redraw from historian" is a dialog in the Evaluate pattern: the loop and the event on its band, the
// window, the signals and the trends it will draw, Redraw as the one primary action. Then progress in place: Reading the
// historian (with the points read so far), Drawing, Done with the time since the click, and it closes by itself; a failure stays
// open with the reason and Retry; closing during the read cancels it. The result lives in the page cache, keyed by the event.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as cpmApi from '../../../../api/cpmApi';
import { ApiError } from '../../../../api/apiFetch';
import { selfRegulating, T0S } from '../trends/trendFixtures';
import { redrawWindow } from './historianRead';
import { historianPoints } from './redrawFixtures';
import { RedrawDialog } from './RedrawDialog';
import { useRedrawn } from './useRedraw';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean; variant?: string }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled, 'data-variant': p.variant }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/building-blocks/circular-progress/circular-progress', () => ({
  ObcCircularProgress: () => React.createElement('span', { 'data-testid': 'spinner' }),
}));
vi.mock('../../../../api/cpmApi', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../api/cpmApi')>()),
  getRawCursor: vi.fn(),
}));

const e = selfRegulating();
const all = historianPoints(e, () => 130);
const page = (points: typeof all, hasMore: boolean) => ({
  series: 's', count: points.length, cursor: null, nextCursor: hasMore ? Number(points[points.length - 1].ts) : null, hasMore, points,
});
const deferred = <T,>() => { let resolve!: (v: T) => void, reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

const Cached: React.FC = () => {
  const r = useRedrawn('e1');
  return <span data-testid="cached">{r ? `${r.points} points` : 'none'}</span>;
};
function draw(onClose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Harness: React.FC = () => {
    const [open, setOpen] = React.useState(true);
    return (
      <>
        {open && <RedrawDialog loopId="FIC1" eventId="e1" eventName="15 Sept 12:00 · Input test · OP → PV · Candidate" result={e.result} metrics={e.metrics}
          window={redrawWindow(e.result, 0)!} pvUnit="m3/h" timeZone="UTC" onClose={() => { onClose(); setOpen(false); }} />}
        <Cached />
      </>
    );
  };
  render(<QueryClientProvider client={qc}><Harness /></QueryClientProvider>);
  return onClose;
}
const dialog = () => screen.getByRole('dialog', { name: 'Redraw from historian' });
const status = () => screen.getByRole('status').textContent;
const press = (name: string) => fireEvent.click(within(dialog()).getByRole('button', { name }));
const flush = () => act(() => vi.advanceTimersByTimeAsync(0));

describe('RedrawDialog', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime((T0S + 3_600) * 1000); vi.mocked(cpmApi.getRawCursor).mockReset(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('names the loop and the event on its band, then the window, the signals and the trends; Cancel secondary, Redraw primary', () => {
    draw();
    const d = dialog();
    expect(d.querySelector('.ui-dialog__subtitle')?.textContent).toBe('FIC1 · 15 Sept 12:00 · Input test · OP → PV · Candidate');
    const rows = [...d.querySelectorAll('.cpm-run-form__label')].map(l => [l.textContent, l.nextElementSibling?.textContent]);
    expect(rows.map(r => r[0])).toEqual(['Window', 'Signals', 'Trends']);
    expect(rows[0][1]).toMatch(/^\d{1,2} \w{3,4} \d{2}:\d{2} → \d{1,2} \w{3,4} \d{2}:\d{2} UTC$/);
    expect(rows[1][1]).toBe('PV, SP, OP');
    // CHG-200 (C1): Error from the setpoint is not promised: it draws only when the samples reproduce the engine's integrals
    expect(rows[2][1]).toBe('Measured response · Input · Dead time and time constant · Rise time and settling');
    expect([...d.querySelectorAll('.ui-dialog__foot button')].map(b => [b.textContent, b.getAttribute('data-variant')]))
      .toEqual([['Cancel', 'normal'], ['Redraw', 'raised']]);
    expect(cpmApi.getRawCursor).not.toHaveBeenCalled();
  });

  it('reads the historian with the points read so far, then draws, then says Done with the time and closes by itself', async () => {
    const first = deferred<ReturnType<typeof page>>(), second = deferred<ReturnType<typeof page>>();
    vi.mocked(cpmApi.getRawCursor).mockReturnValueOnce(first.promise as never).mockReturnValueOnce(second.promise as never);
    const onClose = draw();
    press('Redraw');
    await flush();
    expect(status()).toBe('Reading the historian');
    expect(screen.getByTestId('spinner')).toBeTruthy();
    expect(within(dialog()).queryByRole('button', { name: 'Redraw' })).toBeNull();
    await act(async () => { first.resolve(page(all.slice(0, 200), true)); });
    expect(status()).toBe('Reading the historian · 200 points');
    await act(async () => { second.resolve(page(all.slice(200), false)); });
    expect(status()).toBe('Drawing');
    expect(screen.getByTestId('cached').textContent).toBe('none');
    await flush();
    expect(status()).toMatch(/Done/);
    expect(dialog().querySelector('.cpm-run-progress__elapsed')?.textContent).toMatch(/^\d+:\d{2}$/);
    await act(() => vi.advanceTimersByTimeAsync(50));   // react-query tells its observers a moment later
    expect(screen.getByTestId('cached').textContent).toBe(`${all.length} points`);
    expect(screen.queryByTestId('spinner')).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(1_300));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a failed read stays open with the reason in plain words and Retry, which reads again', async () => {
    vi.mocked(cpmApi.getRawCursor).mockRejectedValueOnce(new ApiError(502, 'Bad gateway')).mockResolvedValueOnce(page(all, false));
    draw();
    press('Redraw');
    await flush();
    expect(screen.getByRole('alert').textContent).toContain('The historian did not answer. Try again in a minute.');
    expect([...dialog().querySelectorAll('.ui-dialog__foot button')].map(b => [b.textContent, b.getAttribute('data-variant')]))
      .toEqual([['Close', 'normal'], ['Retry', 'raised']]);
    press('Retry');
    await flush();
    await flush();
    expect(status()).toMatch(/Done/);
    expect(cpmApi.getRawCursor).toHaveBeenCalledTimes(2);
  });

  it('says plainly when the historian holds no samples for the window', async () => {
    vi.mocked(cpmApi.getRawCursor).mockResolvedValueOnce(page([], false));
    draw();
    press('Redraw');
    await flush();
    await flush();
    expect(screen.getByRole('alert').textContent).toContain('The historian has no samples for this window.');
    expect(screen.getByTestId('cached').textContent).toBe('none');
  });

  it('Cancel during the read aborts it and keeps nothing', async () => {
    let signal: AbortSignal | undefined;
    vi.mocked(cpmApi.getRawCursor).mockImplementationOnce((...args) => { signal = args[6]; return new Promise(() => {}) as never; });
    const onClose = draw();
    press('Redraw');
    await flush();
    expect(signal?.aborted).toBe(false);
    press('Cancel');
    expect(signal?.aborted).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('cached').textContent).toBe('none');
  });
});
