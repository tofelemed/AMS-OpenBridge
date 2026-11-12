// @vitest-environment jsdom
/**
 * CHG-176 in the table symbols, drawn through SymbolRenderer as on a display. The value table shows a fallback value
 * that is no loop signal (its summary too) and leaves a loop signal's row at "--" without reading its derived history;
 * the time-series table reads no derived history for a loop signal. The symbol's NE107 badge reads Uncertain, and the
 * affected cell or column names its reason once. Rows from the asset model are untouched.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as fetchMod from '../../api/apiFetch';
import { useAuthStore } from '../../store/authStore';
import type { CanvasItem } from './types';
import {
  DERIVED_VALUE, LOOP_PV, MODEL_VALUE, REASON_FALLBACK, REASON_LOOP, TAG, TAG2, fakeAnswer, fakeApi, fakeResponse,
  historyOf, liveFor, loopReads, type FakeApi,
} from './trustFixtures';

const mq = vi.hoisted(() => ({
  subscribeScreen: vi.fn(), unsubscribeScreen: vi.fn(), connect: vi.fn(), metrics: new Map<string, unknown>(),
  fetchSummary: vi.fn(async () => ({ min: 1, max: 3, avg: 2 })),
  fetchTrend: vi.fn(async (_s: string, _a: Date, _b: Date, _w: number, m: string) => [{ ts: Date.now(), [m]: 7 }]),
}));
vi.mock('../../store/mqttStore', () => ({
  useMqttStore: (pick: (s: typeof mq) => unknown) => pick(mq),
  getLiveSeries: () => [],
}));
vi.mock('../../api/apiFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/apiFetch')>();
  return { ...actual, apiFetch: vi.fn(), apiJson: vi.fn() };
});

import { SymbolRenderer } from './SymbolRenderer';

let api: FakeApi;
const item = (type: string, bindings: Record<string, string>, extra: Partial<CanvasItem> = {}): CanvasItem => ({
  id: 't1', type, position: { x: 0, y: 0 }, size: { width: 260, height: 160 }, bindings, ...extra,
});
const show = (it: CanvasItem) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <SymbolRenderer item={it} mode="preview" />
  </QueryClientProvider>,
);
const badge = () => screen.queryByLabelText(/^quality:/);
const row = (leaf: string) => [...document.querySelectorAll('tbody tr')].find(r => r.textContent?.startsWith(leaf)) as HTMLTableRowElement;
const cell = (leaf: string, i: number) => row(leaf).cells[i];
const seriesRead = (fn: typeof mq.fetchSummary | typeof mq.fetchTrend) => (fn.mock.calls as unknown as Array<[string]>).map(c => c[0]);
const series = (p: string, prov: 'asset-model' | 'fallback') => historyOf(p, prov).replace(/\.[^.]+$/, '');

beforeEach(() => {
  api = fakeApi();
  mq.metrics = liveFor([TAG, TAG2, LOOP_PV]);
  mq.fetchSummary.mockClear();
  mq.fetchTrend.mockClear();
  useAuthStore.setState({ user: { user_id: 'u', username: 'op', email: '', role: 'Operator', is_active: true, permissions: ['analytics.view'] }, status: 'authenticated', accessToken: 't' });
  vi.mocked(fetchMod.apiFetch).mockImplementation(async (url: string, init?: RequestInit) => fakeResponse(fakeAnswer(api, url, init)));
  vi.mocked(fetchMod.apiJson).mockImplementation(async (url: string, init?: RequestInit) => {
    const a = fakeAnswer(api, url, init);
    if (a.status >= 400) throw new fetchMod.ApiError(a.status, 'down');
    return a.body as never;
  });
});
afterEach(cleanup);

describe('value table', () => {
  it('shows rows from the asset model as before: no reason, no badge, no registry read', async () => {
    show(item('table.value', { value: TAG, value2: TAG2 }, { summaryColumns: ['avg'] }));
    await waitFor(() => expect(cell('pt10001.pv', 1).textContent).toBe(String(MODEL_VALUE)));
    expect(cell('pt10001.pv', 1).getAttribute('title')).toBeNull();
    await waitFor(() => expect(seriesRead(mq.fetchSummary).sort()).toEqual([series(TAG, 'asset-model'), series(TAG2, 'asset-model')].sort()));
    expect(badge()).toBeNull();
    expect(loopReads(api)).toBe(0);
  });

  it('shows a fallback value Uncertain and leaves a loop signal\'s row empty, reading none of its history', async () => {
    api.fallback = [TAG, LOOP_PV];
    show(item('table.value', { value: TAG, value2: LOOP_PV, value3: TAG2 }, { summaryColumns: ['avg'] }));
    await waitFor(() => expect(cell('pt10001.pv', 1).textContent).toBe(String(DERIVED_VALUE)));
    await waitFor(() => expect(cell('fic10401.pv', 1).getAttribute('title')).toBe(REASON_LOOP));
    expect(cell('pt10001.pv', 1).getAttribute('title')).toBe(REASON_FALLBACK);
    expect(cell('fic10401.pv', 1).textContent).toBe('--');
    expect(cell('tt10002.pv', 1).textContent).toBe(String(MODEL_VALUE));
    expect(cell('tt10002.pv', 1).getAttribute('title')).toBeNull();
    await waitFor(() => expect(seriesRead(mq.fetchSummary)).toContain(series(TAG, 'fallback')));
    expect(seriesRead(mq.fetchSummary)).not.toContain(series(LOOP_PV, 'fallback'));
    expect(cell('fic10401.pv', 3).textContent).toBe('--');
    await waitFor(() => expect(badge()?.getAttribute('aria-label')).toBe('quality: Uncertain'));
    expect(badge()?.getAttribute('title')).toContain(REASON_LOOP);
  });
});

describe('time-series table', () => {
  it('reads no derived history for a loop signal, and the derived history of a plain tag', async () => {
    api.fallback = [TAG, LOOP_PV];
    show(item('table.timeseries', { value: LOOP_PV, value2: TAG }));
    await waitFor(() => expect(seriesRead(mq.fetchTrend)).toContain(series(TAG, 'fallback')));
    expect(seriesRead(mq.fetchTrend)).not.toContain(series(LOOP_PV, 'fallback'));
    const heads = [...document.querySelectorAll('thead th')];
    expect(heads.find(h => h.textContent === 'fic10401.pv')?.getAttribute('title')).toBe(REASON_LOOP);
    expect(heads.find(h => h.textContent === 'pt10001.pv')?.getAttribute('title')).toBe(REASON_FALLBACK);
    await waitFor(() => expect(badge()?.getAttribute('aria-label')).toBe('quality: Uncertain'));
  });

  it('reads the asset model\'s history as before', async () => {
    show(item('table.timeseries', { value: TAG }));
    await waitFor(() => expect(seriesRead(mq.fetchTrend)).toEqual([series(TAG, 'asset-model')]));
    expect(document.querySelector('thead th[title]')).toBeNull();
    expect(badge()).toBeNull();
  });
});
