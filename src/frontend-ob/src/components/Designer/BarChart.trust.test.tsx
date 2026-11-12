// @vitest-environment jsdom
/**
 * CHG-176 in the chart symbols (bar chart, sparkline), drawn through SymbolRenderer as on a display. Values from the
 * asset model draw as before. A fallback value that is no loop signal still draws; one on a registered loop's signal
 * draws nothing. The symbol's NE107 badge reads Uncertain for either, and each value's tooltip names its reason once.
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
  liveFor, liveKeyOf, loopReads, type FakeApi,
} from './trustFixtures';

const mq = vi.hoisted(() => ({
  subscribeScreen: vi.fn(), unsubscribeScreen: vi.fn(), connect: vi.fn(),
  metrics: new Map<string, unknown>(), series: new Map<string, Array<{ ts: number; v: number }>>(),
}));
vi.mock('../../store/mqttStore', () => ({
  useMqttStore: (pick: (s: typeof mq) => unknown) => pick(mq),
  getLiveSeries: (key: string) => mq.series.get(key) ?? [],
}));
vi.mock('../../api/apiFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/apiFetch')>();
  return { ...actual, apiFetch: vi.fn(), apiJson: vi.fn() };
});

import { SymbolRenderer } from './SymbolRenderer';

let api: FakeApi;
const item = (type: string, bindings: Record<string, string>): CanvasItem => ({
  id: 'c1', type, position: { x: 0, y: 0 }, size: { width: 250, height: 160 }, bindings,
});
const show = (it: CanvasItem) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <SymbolRenderer item={it} mode="preview" />
  </QueryClientProvider>,
);
const badge = () => screen.queryByLabelText(/^quality:/);
const col = (leaf: string) => [...document.querySelectorAll('.symbol-barchart__col')].find(c => c.textContent?.includes(leaf)) as HTMLElement;

beforeEach(() => {
  api = fakeApi();
  mq.metrics = liveFor([TAG, TAG2, LOOP_PV]);
  mq.series = new Map();
  for (const [k, v] of mq.metrics) mq.series.set(k, [{ ts: 1, v: (v as { value: number }).value - 1 }, { ts: 2, v: (v as { value: number }).value }]);
  useAuthStore.setState({ user: { user_id: 'u', username: 'op', email: '', role: 'Operator', is_active: true, permissions: ['analytics.view'] }, status: 'authenticated', accessToken: 't' });
  vi.mocked(fetchMod.apiFetch).mockImplementation(async (url: string, init?: RequestInit) => fakeResponse(fakeAnswer(api, url, init)));
  vi.mocked(fetchMod.apiJson).mockImplementation(async (url: string, init?: RequestInit) => {
    const a = fakeAnswer(api, url, init);
    if (a.status >= 400) throw new fetchMod.ApiError(a.status, 'down');
    return a.body as never;
  });
});
afterEach(cleanup);

describe('bar chart', () => {
  it('draws bars from the asset model as before: no badge, no reason, no registry read', async () => {
    show(item('chart.bar', { value: TAG, value2: TAG2 }));
    await waitFor(() => expect(col('pt10001.pv')?.textContent).toContain(String(MODEL_VALUE)));
    expect(col('pt10001.pv').getAttribute('title')).toBe(`pt10001.pv: ${MODEL_VALUE}`);
    expect(badge()).toBeNull();
    expect(loopReads(api)).toBe(0);
  });

  it('draws a fallback value Uncertain and leaves a loop signal\'s bar empty', async () => {
    api.fallback = [TAG, LOOP_PV];
    show(item('chart.bar', { value: TAG, value2: LOOP_PV, value3: TAG2 }));
    await waitFor(() => expect(col('pt10001.pv')?.textContent).toContain(String(DERIVED_VALUE)));
    await waitFor(() => expect(col('fic10401.pv').getAttribute('title')).toContain(REASON_LOOP));
    expect(col('pt10001.pv').getAttribute('title')).toBe(`pt10001.pv: ${DERIVED_VALUE} · ${REASON_FALLBACK}`);
    expect(col('fic10401.pv').textContent).toContain('--');
    expect(col('fic10401.pv').textContent).not.toContain(String(DERIVED_VALUE));
    expect(col('tt10002.pv').getAttribute('title')).toBe(`tt10002.pv: ${MODEL_VALUE}`);
    await waitFor(() => expect(badge()?.getAttribute('title')).toContain(REASON_LOOP));
    expect(badge()?.getAttribute('aria-label')).toBe('quality: Uncertain');
    expect(loopReads(api)).toBe(1); // one shared, cached read for the symbol and its chart
  });

  it('draws the loop signal\'s fallback value, Uncertain, when the registry cannot be read', async () => {
    api.fallback = [LOOP_PV];
    api.loops = 'fail';
    show(item('chart.bar', { value2: LOOP_PV, value3: TAG2 }));
    await waitFor(() => expect(col('fic10401.pv')?.textContent).toContain(String(DERIVED_VALUE)));
    expect(col('fic10401.pv').getAttribute('title')).toContain(REASON_FALLBACK);
    await waitFor(() => expect(badge()?.getAttribute('aria-label')).toBe('quality: Uncertain'));
  });
});

describe('sparkline', () => {
  it('draws from the asset model as before', async () => {
    show(item('chart.sparkline', { value: TAG }));
    await waitFor(() => expect(document.querySelector('.symbol-sparkline')?.getAttribute('title')).toBe(`pt10001.pv: ${MODEL_VALUE}`));
    expect(badge()).toBeNull();
  });

  it('draws a fallback value with the reason, Uncertain', async () => {
    api.fallback = [TAG];
    show(item('chart.sparkline', { value: TAG }));
    await waitFor(() => expect(document.querySelector('.symbol-sparkline')?.getAttribute('title')).toBe(`pt10001.pv: ${DERIVED_VALUE} · ${REASON_FALLBACK}`));
    await waitFor(() => expect(badge()?.getAttribute('aria-label')).toBe('quality: Uncertain'));
  });

  it('draws nothing for a loop signal\'s fallback, Uncertain', async () => {
    api.fallback = [LOOP_PV];
    show(item('chart.sparkline', { value: LOOP_PV }));
    await waitFor(() => expect(badge()?.getAttribute('title')).toContain(REASON_LOOP));
    expect(screen.getByText(/waiting/)).toBeTruthy();
    expect(mq.series.has(liveKeyOf(LOOP_PV, 'fallback'))).toBe(true); // there was a derived series to draw - it was not read
    expect(document.querySelector('.symbol-sparkline polyline')).toBeNull();
  });
});
