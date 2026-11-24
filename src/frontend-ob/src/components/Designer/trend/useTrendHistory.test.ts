// @vitest-environment jsdom
/**
 * CHG-227 (owner, 24 Nov 2026: "if I sit with the trend page open, values should update automatically, not on refresh"):
 * a tailing trend subscribes to its pens' live topics, so new values reach its ring buffer, and re-reads the historian once
 * a minute, so the line keeps up even while the live feed is quiet. Before, it read the history once when the page opened
 * and never subscribed, so the line stopped at the moment the page was opened.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';

const store = vi.hoisted(() => ({
  fetchTrend: vi.fn(async () => [] as Array<Record<string, number>>),
  connect: vi.fn(),
  subscribeScreen: vi.fn(),
  unsubscribeScreen: vi.fn(),
}));
vi.mock('../../../store/mqttStore', () => ({
  useMqttStore: (pick: (s: typeof store) => unknown) => pick(store),
  getLiveSeries: () => [],
}));

import { useTrendHistory } from './useTrendHistory';
import type { Pen } from './trendSupport';

const T = Date.parse('2026-11-24T10:00:10Z');
const HOUR = 3_600_000;
const TOPIC = 'spBv1.0/ams_site1/DDATA/ams_edge1/FIC10302';
const pen = (m: string, liveTopic?: string): Pen => ({
  path: `fic10302.${m}`, label: m.toUpperCase(), unit: '', iotSeries: 'root.hdpe.cpm.FIC10302', measurement: m,
  liveKey: `FIC10302/${m}`, ...(liveTopic ? { liveTopic } : {}),
});
// PV and SP live on one device topic: one subscription for both.
const PENS = [pen('pv', TOPIC), pen('sp', TOPIC)];
const widthRef = { current: 600 };
type Props = Parameters<typeof useTrendHistory>[0];
const props = (o: Partial<Props> = {}): Props => ({
  pens: PENS, windowStart: T - HOUR, windowEnd: T, fetchKey: `cspan:${HOUR}`, tailing: true, tick: 0, widthRef, ...o,
});
const at = (end: number, o: Partial<Props> = {}) => props({ windowStart: end - HOUR, windowEnd: end, ...o });

beforeEach(() => { store.fetchTrend.mockClear(); store.subscribeScreen.mockClear(); store.unsubscribeScreen.mockClear(); });
afterEach(cleanup);

describe('useTrendHistory keeps a live trend moving (CHG-227)', () => {
  it('subscribes to its pens\' live topic while it tails, once per topic, and lets go on unmount', () => {
    const h = renderHook(p => useTrendHistory(p), { initialProps: props() });
    expect(store.subscribeScreen).toHaveBeenCalledTimes(1);
    expect(store.subscribeScreen).toHaveBeenCalledWith([TOPIC]);
    h.unmount();
    expect(store.unsubscribeScreen).toHaveBeenCalledWith([TOPIC]);
  });

  it('keeps the one subscription while the window steps forward', () => {
    const h = renderHook(p => useTrendHistory(p), { initialProps: props() });
    h.rerender(at(T + 2_000));
    h.rerender(at(T + 64_000));
    expect(store.subscribeScreen).toHaveBeenCalledTimes(1);
    expect(store.unsubscribeScreen).not.toHaveBeenCalled();
  });

  it('subscribes to nothing for a fixed period, or for pens without a live topic', () => {
    renderHook(p => useTrendHistory(p), { initialProps: props({ tailing: false, fetchKey: 'cfix:a' }) });
    renderHook(p => useTrendHistory(p), { initialProps: props({ pens: [pen('pv')] }) });
    expect(store.subscribeScreen).not.toHaveBeenCalled();
  });

  it('re-reads the historian once a minute while it tails, up to the new end, not on every 2 s step', async () => {
    const h = renderHook(p => useTrendHistory(p), { initialProps: props() });
    await waitFor(() => expect(store.fetchTrend).toHaveBeenCalledTimes(2));
    h.rerender(at(T + 2_000));
    h.rerender(at(T + 4_000));
    expect(store.fetchTrend).toHaveBeenCalledTimes(2);
    h.rerender(at(T + 60_000));
    await waitFor(() => expect(store.fetchTrend).toHaveBeenCalledTimes(4));
    const [, , end] = store.fetchTrend.mock.calls[3] as unknown as [string, Date, Date];
    expect(end.getTime()).toBe(T + 60_000);
  });

  it('reads a fixed period once', async () => {
    const h = renderHook(p => useTrendHistory(p), { initialProps: props({ tailing: false, fetchKey: 'cfix:a' }) });
    await waitFor(() => expect(store.fetchTrend).toHaveBeenCalledTimes(2));
    h.rerender(at(T + 120_000, { tailing: false, fetchKey: 'cfix:a' }));
    expect(store.fetchTrend).toHaveBeenCalledTimes(2);
  });
});
