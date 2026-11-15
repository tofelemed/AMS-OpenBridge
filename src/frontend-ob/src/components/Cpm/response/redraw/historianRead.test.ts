// CHG-198 (owner, 2026-11-15): an event whose stored charts are gone is redrawn from the historian's raw read. The read covers
// the engine's pre-event support before the step through the event end, measurements PV, SP and the path's input, paged until
// the historian says it is done; an event older than the historian keeps loop samples cannot be redrawn.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as cpmApi from '../../../../api/cpmApi';
import { ApiError } from '../../../../api/apiFetch';
import { HISTORIAN_KEEP_DAYS, PRE_SUPPORT_S, pastHistorianKeep, readFailure, readHistorian, redrawWindow } from './historianRead';
import { result, T0S } from '../trends/trendFixtures';

vi.mock('../../../../api/cpmApi', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../api/cpmApi')>()),
  getRawCursor: vi.fn(),
}));

const page = (from: number, n: number, hasMore: boolean) => ({
  series: 's', count: n, cursor: null, nextCursor: hasMore ? from + n - 1 : null, hasMore,
  points: Array.from({ length: n }, (_, i) => ({ ts: from + i, pv: 1, sp: 2, op: 3 })),
});

describe('redrawWindow', () => {
  it('reads from the engine\'s pre-event support before the step through the event end, PV, SP and OP', () => {
    const w = redrawWindow(result(), 0)!;
    expect(PRE_SUPPORT_S).toBe(120);
    expect(w.t0Ms).toBe(T0S * 1000);
    expect(w.tEndMs).toBe((T0S + 600) * 1000);
    expect(w.fromMs).toBe((T0S - 120) * 1000);
    // the historian's end is exclusive; the engine keeps the sample at the event end
    expect(w.toMs).toBe((T0S + 600) * 1000 + 1);
    expect(w.measurements).toBe('pv,sp,op');
    expect(w.input).toBe('op');
  });

  it('reads VP as the input on a VP path, as the engine does', () => {
    const w = redrawWindow(result({ path_id: 'VP_TO_PV' }), 0)!;
    expect(w.measurements).toBe('pv,sp,vp');
    expect(w.input).toBe('vp');
  });

  it('takes the step from the page when the result has none, and has no window without an end after the step', () => {
    expect(redrawWindow(result({ window_start_ms: 0 }), T0S * 1000)!.t0Ms).toBe(T0S * 1000);
    expect(redrawWindow(result({ window_end_ms: T0S * 1000 }), 0)).toBeNull();
    expect(redrawWindow(undefined, T0S * 1000)).toBeNull();
  });
});

describe('pastHistorianKeep', () => {
  it('is true once the first sample the redraw needs is older than the historian keeps loop samples', () => {
    expect(HISTORIAN_KEEP_DAYS).toBe(90);
    const w = redrawWindow(result(), 0)!;
    const day = 86_400_000;
    expect(pastHistorianKeep(w, w.fromMs + 89 * day)).toBe(false);
    expect(pastHistorianKeep(w, w.fromMs + 90 * day + 1)).toBe(true);
  });
});

describe('readHistorian', () => {
  beforeEach(() => vi.mocked(cpmApi.getRawCursor).mockReset());

  it('reads every page, passing each cursor on, and reports the points read so far', async () => {
    vi.mocked(cpmApi.getRawCursor)
      .mockResolvedValueOnce(page(1_000, 3, true))
      .mockResolvedValueOnce(page(1_003, 3, true))
      .mockResolvedValueOnce(page(1_006, 2, false));
    const w = redrawWindow(result(), 0)!;
    const signal = new AbortController().signal;
    const seen: number[] = [];
    const points = await readHistorian('root.x.FIC1', w, signal, n => seen.push(n));
    expect(points.map(p => p.ts)).toEqual([1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007]);
    expect(seen).toEqual([3, 6, 8]);
    const calls = vi.mocked(cpmApi.getRawCursor).mock.calls;
    expect(calls.map(c => c[4])).toEqual([undefined, 1002, 1005]);
    expect(calls[0][0]).toBe('root.x.FIC1');
    expect((calls[0][1] as Date).getTime()).toBe(w.fromMs);
    expect((calls[0][2] as Date).getTime()).toBe(w.toMs);
    expect(calls[0][5]).toBe('pv,sp,op');
    expect(calls.every(c => c[6] === signal)).toBe(true);
  });

  it('stops when a cursor does not move on, so a faulty answer cannot loop', async () => {
    vi.mocked(cpmApi.getRawCursor).mockResolvedValueOnce(page(1_000, 3, true)).mockResolvedValue({ ...page(1_000, 3, true), nextCursor: 1002 });
    const points = await readHistorian('s', redrawWindow(result(), 0)!, new AbortController().signal, () => {});
    expect(vi.mocked(cpmApi.getRawCursor)).toHaveBeenCalledTimes(2);
    expect(points).toHaveLength(6);
  });
});

describe('readFailure', () => {
  it('says in plain words that the historian could not be read', () => {
    expect(readFailure(new ApiError(502, 'Bad gateway'))).toBe('The historian did not answer. Try again in a minute.');
    expect(readFailure(new TypeError('Failed to fetch'))).toBe('The historian did not answer. Try again in a minute.');
    expect(readFailure(new ApiError(403, 'Forbidden'))).toBe('You are not allowed to read this loop\'s history.');
  });
});
