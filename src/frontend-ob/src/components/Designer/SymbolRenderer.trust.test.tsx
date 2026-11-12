// @vitest-environment jsdom
/**
 * CHG-176: a Designer symbol flags a value from a "fallback" binding with its existing NE107 quality badge. A binding
 * from the asset model looks exactly as before. A fallback that is no loop signal keeps its value and reads Uncertain
 * (a worse quality stays); a fallback on a registered loop's signal shows no value and reads Uncertain. The badge's
 * tooltip gives the reason once. The loop registry is read only once a fallback appears.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as fetchMod from '../../api/apiFetch';
import { useAuthStore } from '../../store/authStore';
import type { CanvasItem } from './types';
import {
  DERIVED_VALUE, LOOP_PV, MODEL_VALUE, REASON_FALLBACK, REASON_LOOP, TAG, fakeAnswer, fakeApi, fakeResponse, liveFor,
  loopReads, topicOf, type FakeApi,
} from './trustFixtures';

const mq = vi.hoisted(() => ({
  subscribeScreen: vi.fn(), unsubscribeScreen: vi.fn(), connect: vi.fn(), metrics: new Map<string, unknown>(),
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
const readout = (path: string): CanvasItem => ({
  id: 'r1', type: 'obc.readout', position: { x: 0, y: 0 }, size: { width: 120, height: 40 },
  bindings: { value: path }, formatting: { decimals: 1 },
});
const show = (item: CanvasItem) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <SymbolRenderer item={item} mode="preview" />
  </QueryClientProvider>,
);
const badge = () => screen.queryByLabelText(/^quality:/);

beforeEach(() => {
  api = fakeApi();
  mq.subscribeScreen.mockReset();
  mq.metrics = liveFor([TAG, LOOP_PV]);
  useAuthStore.setState({ user: { user_id: 'u', username: 'op', email: '', role: 'Operator', is_active: true, permissions: ['analytics.view'] }, status: 'authenticated', accessToken: 't' });
  vi.mocked(fetchMod.apiFetch).mockImplementation(async (url: string, init?: RequestInit) => fakeResponse(fakeAnswer(api, url, init)));
  vi.mocked(fetchMod.apiJson).mockImplementation(async (url: string, init?: RequestInit) => {
    const a = fakeAnswer(api, url, init);
    if (a.status >= 400) throw new fetchMod.ApiError(a.status, 'down');
    return a.body as never;
  });
});
afterEach(cleanup);

describe('a readout bound through the asset model', () => {
  it('shows the value with no quality badge, and never reads the loop registry', async () => {
    show(readout(TAG));
    await screen.findByText(String(MODEL_VALUE));
    expect(badge()).toBeNull();
    expect(mq.subscribeScreen).toHaveBeenCalledWith([topicOf(TAG, 'asset-model')]);
    expect(loopReads(api)).toBe(0);
  });
});

describe('a readout bound through a fallback', () => {
  it('keeps the derived value and shows Uncertain with the reason', async () => {
    api.fallback = [TAG];
    show(readout(TAG));
    await screen.findByText(String(DERIVED_VALUE));
    await waitFor(() => expect(badge()?.getAttribute('aria-label')).toBe('quality: Uncertain'));
    expect(badge()?.textContent).toBe('?');
    expect(badge()?.getAttribute('title')).toContain(REASON_FALLBACK);
    expect(loopReads(api)).toBe(1);
  });

  it('keeps a Bad quality Bad', async () => {
    api.fallback = [TAG];
    mq.metrics = liveFor([TAG], 0);
    show(readout(TAG));
    await screen.findByText(String(DERIVED_VALUE));
    await waitFor(() => expect(badge()?.getAttribute('title')).toContain(REASON_FALLBACK));
    expect(badge()?.getAttribute('aria-label')).toBe('quality: Bad');
  });

  it('shows no value and Uncertain for a registered loop signal, and reads nothing', async () => {
    api.fallback = [LOOP_PV];
    show(readout(LOOP_PV));
    await waitFor(() => expect(loopReads(api)).toBe(1));
    await waitFor(() => expect(badge()?.getAttribute('title')).toContain(REASON_LOOP));
    expect(badge()?.getAttribute('aria-label')).toBe('quality: Uncertain');
    expect(screen.queryByText(String(DERIVED_VALUE))).toBeNull();
    expect(screen.getByText('{fic10401.pv}')).toBeTruthy(); // as an unavailable value shows today
    expect(mq.subscribeScreen).not.toHaveBeenCalled();
  });

  it('keeps the value, Uncertain, when the loop registry cannot be read', async () => {
    api.fallback = [LOOP_PV];
    api.signalPaths = 'fail';
    show(readout(LOOP_PV));
    await screen.findByText(String(DERIVED_VALUE));
    await waitFor(() => expect(badge()?.getAttribute('title')).toContain(REASON_FALLBACK));
    expect(badge()?.getAttribute('aria-label')).toBe('quality: Uncertain');
  });
});
