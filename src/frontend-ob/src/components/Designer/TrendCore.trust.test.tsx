// @vitest-environment jsdom
/**
 * CHG-176 in the Designer's trends (the ad-hoc dialog and the canvas trend symbol, both on TrendCore). A pen whose
 * binding is a fallback on a registered loop's signal is not read (CHG-175's "not read": no history, no live tail,
 * named in the failed-pen line); any other fallback pen is read and flagged Uncertain: the legend's tooltip gives the
 * reason, the dialog's legend carries the NE107 badge, and on a display the symbol's own badge reads Uncertain.
 * The CPA Trend page's tag pens (no flag) keep today's behaviour and never read the loop registry.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as fetchMod from '../../api/apiFetch';
import { useAuthStore } from '../../store/authStore';
import { useDisplayTimeStore } from '../../store/timeStore';
import {
  LOOP_PV, REASON_FALLBACK, REASON_LOOP, TAG, TAG2, fakeAnswer, fakeApi, fakeResponse, historyOf, liveFor, loopReads,
  type FakeApi,
} from './trustFixtures';

vi.mock('echarts-for-react', () => ({ default: () => <div data-testid="echart" /> }));
const mq = vi.hoisted(() => ({
  subscribeScreen: vi.fn(), unsubscribeScreen: vi.fn(), connect: vi.fn(), metrics: new Map<string, unknown>(),
  fetchTrend: vi.fn(async (_s: string, _a: Date, _b: Date, _w: number, m: string) => [{ ts: 1, [m]: 1 }, { ts: 2, [m]: 2 }]),
}));
vi.mock('../../store/mqttStore', () => ({
  useMqttStore: (pick: (s: typeof mq) => unknown) => pick(mq),
  getLiveSeries: () => [],
}));
vi.mock('../../api/apiFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/apiFetch')>();
  return { ...actual, apiFetch: vi.fn(), apiJson: vi.fn() };
});

import TrendCore from './TrendCore';
import TrendDialog from './TrendDialog';
import { SymbolRenderer } from './SymbolRenderer';

vi.stubGlobal('ResizeObserver', class { observe() { /* jsdom has none */ } disconnect() { /* none */ } });

let api: FakeApi;
const PIN = { start: Date.parse('2026-11-06T10:45:00Z'), end: Date.parse('2026-11-06T22:45:00Z'), live: false };
const PENS = [{ path: TAG, label: 'pt10001.pv' }, { path: LOOP_PV, label: 'fic10401.pv' }, { path: TAG2, label: 'tt10002.pv' }];
const wrap = (node: React.ReactNode) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{node}</QueryClientProvider>,
);
const pen = (path: string) => document.querySelector(`.trend-core__pen[data-pen="${path}"]`) as HTMLElement;
const series = (p: string, prov: 'asset-model' | 'fallback') => historyOf(p, prov).replace(/\.[^.]+$/, '');
const read = () => (mq.fetchTrend.mock.calls as unknown as Array<[string]>).map(c => c[0]);

beforeEach(() => {
  api = fakeApi();
  mq.metrics = liveFor([TAG, TAG2, LOOP_PV]);
  mq.fetchTrend.mockClear();
  useDisplayTimeStore.setState({ tz: 'UTC', start: PIN.start, end: PIN.end, live: false });
  useAuthStore.setState({ user: { user_id: 'u', username: 'op', email: '', role: 'Operator', is_active: true, permissions: ['analytics.view'] }, status: 'authenticated', accessToken: 't' });
  vi.mocked(fetchMod.apiFetch).mockImplementation(async (url: string, init?: RequestInit) => fakeResponse(fakeAnswer(api, url, init)));
  vi.mocked(fetchMod.apiJson).mockImplementation(async (url: string, init?: RequestInit) => {
    const a = fakeAnswer(api, url, init);
    if (a.status >= 400) throw new fetchMod.ApiError(a.status, 'down');
    return a.body as never;
  });
});
afterEach(cleanup);

describe('the Designer\'s trend dialog', () => {
  it('does not read a loop signal\'s fallback pen, reads the other fallback pen, and marks both', async () => {
    api.fallback = [TAG, LOOP_PV];
    wrap(<TrendDialog pens={PENS} onClose={() => undefined} />);
    await waitFor(() => expect(screen.getByText(/failed to load/).textContent).toContain('fic10401.pv'));
    expect(read()).toContain(series(TAG, 'fallback'));
    expect(read()).toContain(series(TAG2, 'asset-model'));
    expect(read().some(s => s.includes('fic10401'))).toBe(false);
    expect(pen(TAG).getAttribute('title')).toContain(REASON_FALLBACK);
    expect(pen(LOOP_PV).getAttribute('title')).toContain(REASON_LOOP);
    expect(pen(TAG2).getAttribute('title')).not.toContain('asset model');
    expect(pen(TAG).querySelector('[aria-label="quality: Uncertain"]')).not.toBeNull();
    expect(pen(LOOP_PV).querySelector('[aria-label="quality: Uncertain"]')).not.toBeNull();
    expect(pen(TAG2).querySelector('[aria-label^="quality:"]')).toBeNull();
    expect(loopReads(api)).toBe(1);
  });

  it('reads every pen as before when the asset model answers', async () => {
    wrap(<TrendDialog pens={PENS} onClose={() => undefined} />);
    await waitFor(() => expect(read()).toHaveLength(3));
    expect(screen.queryByText(/failed to load/)).toBeNull();
    expect(document.querySelector('[aria-label^="quality:"]')).toBeNull();
    expect(pen(TAG).getAttribute('title')).toBe(`${TAG} — click to hide`);
    expect(loopReads(api)).toBe(0);
  });
});

describe('the canvas trend symbol', () => {
  it('reads Uncertain on the symbol\'s badge; the legend keeps its tooltip reason without a second badge', async () => {
    api.fallback = [LOOP_PV];
    wrap(<SymbolRenderer item={{ id: 't', type: 'chart.trend', position: { x: 0, y: 0 }, size: { width: 400, height: 200 }, bindings: { value: TAG2, value2: LOOP_PV } }} mode="preview" />);
    await waitFor(() => expect(pen(LOOP_PV)?.getAttribute('title')).toContain(REASON_LOOP));
    await waitFor(() => expect(document.querySelectorAll('[aria-label="quality: Uncertain"]')).toHaveLength(1));
    expect(document.querySelector('[aria-label="quality: Uncertain"]')?.closest('.trend-core__pen')).toBeNull();
    expect(read().some(s => s.includes('fic10401'))).toBe(false);
  });
});

describe('the CPA Trend page\'s tag pens (no flag)', () => {
  it('read a fallback pen as before, unmarked, without the loop registry', async () => {
    api.fallback = [LOOP_PV];
    wrap(<TrendCore pens={[{ path: LOOP_PV, label: 'fic10401.pv' }]} controlledWindow={PIN} showTimeBar={false} />);
    await waitFor(() => expect(read()).toEqual([series(LOOP_PV, 'fallback')]));
    expect(pen(LOOP_PV).getAttribute('title')).toBe(`${LOOP_PV} — click to hide`);
    expect(document.querySelector('[aria-label^="quality:"]')).toBeNull();
    expect(loopReads(api)).toBe(0);
  });
});
