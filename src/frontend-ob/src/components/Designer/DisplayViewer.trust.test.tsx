// @vitest-environment jsdom
/**
 * CHG-176 at the runtime viewer: a published display's bindings arrive in ONE batch resolve (H10). A display whose
 * bindings all come from the asset model reads and looks exactly as before and never touches the loop registry. When
 * the batch answers "fallback", the registry is read once, after that answer: a plain tag keeps its derived value and
 * reads Uncertain, a loop signal shows no value (its derived topic is never subscribed) and reads Uncertain.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as fetchMod from '../../api/apiFetch';
import { useAuthStore } from '../../store/authStore';
import type { CanvasItem } from './types';
import {
  DERIVED_VALUE, LOOP_PV, MODEL_VALUE, REASON_FALLBACK, REASON_LOOP, SIGNAL_PATHS_URL, TAG, TAG2, fakeAnswer, fakeApi,
  fakeResponse, liveFor, loopReads, topicOf, type FakeApi,
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
vi.mock('../../App', () => ({ useTheme: () => ({ theme: 'day', setTheme: () => undefined }) }));
vi.mock('../shared/dialogService', () => ({ usePrompt: () => async () => null }));
vi.mock('./PersonalViewsDialog', () => ({ default: () => null }));

import { DisplayViewer } from './DisplayViewer';

let api: FakeApi;
const readout = (id: string, path: string, x: number): CanvasItem => ({
  id, type: 'obc.readout', position: { x, y: 10 }, size: { width: 120, height: 40 }, bindings: { value: path }, formatting: { decimals: 1 },
});
const ITEMS = [readout('a', TAG, 10), readout('b', LOOP_PV, 150), readout('c', TAG2, 290)];
const show = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={['/display/d1']}>
      <Routes><Route path="/display/:id" element={<DisplayViewer />} /></Routes>
    </MemoryRouter>
  </QueryClientProvider>,
);
const tile = (path: string) => document.querySelector(`[data-resolved="${path}"]`) as HTMLElement | null;
const badgeOf = (path: string) => tile(path)?.querySelector('[aria-label^="quality:"]') ?? null;
const valueOf = (path: string) => tile(path)?.querySelector('.symbol-readout__value')?.textContent;

beforeEach(() => {
  api = fakeApi({ content: { name: 'Unit 600', snapshot: { items: ITEMS, settings: { canvasWidth: 800, canvasHeight: 300 } } } });
  mq.subscribeScreen.mockReset();
  mq.metrics = liveFor([TAG, TAG2, LOOP_PV]);
  useAuthStore.setState({ user: { user_id: 'u', username: 'op', email: '', role: 'Operator', is_active: true, permissions: ['analytics.view'] }, status: 'authenticated', accessToken: 't' });
  vi.mocked(fetchMod.apiFetch).mockImplementation(async (url: string, init?: RequestInit) => fakeResponse(fakeAnswer(api, url, init)));
  vi.mocked(fetchMod.apiJson).mockImplementation(async (url: string, init?: RequestInit) => {
    const a = fakeAnswer(api, url, init);
    if (a.status >= 400) throw new fetchMod.ApiError(a.status, 'down');
    return a.body as never;
  });
});
afterEach(cleanup);

describe('a display bound through the asset model', () => {
  it('reads one batch, shows every value without a badge, and never reads the loop registry', async () => {
    show();
    await waitFor(() => expect(valueOf(TAG)).toBe(String(MODEL_VALUE)));
    await waitFor(() => expect(valueOf(LOOP_PV)).toBe(String(MODEL_VALUE)));
    expect(valueOf(TAG2)).toBe(String(MODEL_VALUE));
    expect(document.querySelector('[aria-label^="quality:"]')).toBeNull();
    expect(api.calls.filter(c => c.startsWith('POST') && c.includes('/resolve/batch'))).toHaveLength(1);
    // Exactly the reads this display made before CHG-176 (captured on the old code): the content, one batch, and the
    // per-slot resolve + catalog reads that start before the batch answers.
    const enc = (p: string) => encodeURIComponent(p);
    expect([...api.calls].sort()).toEqual([
      'GET /api/displays/d1/content?stage=published', 'POST /api/bindings/resolve/batch',
      ...[TAG, LOOP_PV, TAG2].flatMap(p => [`GET /api/bindings/resolve?path=${enc(p)}&roles=live`, `GET /api/assets/by-path/${enc(p)}`]),
    ].sort());
    expect(loopReads(api)).toBe(0);
  });
});

describe('a display whose batch answers fallback', () => {
  it('flags the plain tag Uncertain, shows no value for the loop signal, and reads the registry once, afterwards', async () => {
    api.fallback = [TAG, LOOP_PV];
    show();
    await waitFor(() => expect(valueOf(TAG)).toBe(String(DERIVED_VALUE)));
    await waitFor(() => expect(badgeOf(TAG)?.getAttribute('aria-label')).toBe('quality: Uncertain'));
    expect(badgeOf(TAG)?.getAttribute('title')).toContain(REASON_FALLBACK);

    await waitFor(() => expect(badgeOf(LOOP_PV)?.getAttribute('title')).toContain(REASON_LOOP));
    expect(badgeOf(LOOP_PV)?.getAttribute('aria-label')).toBe('quality: Uncertain');
    expect(valueOf(LOOP_PV)).toBe('{fic10401.pv}');
    expect(mq.subscribeScreen).not.toHaveBeenCalledWith([topicOf(LOOP_PV, 'fallback')]);

    expect(valueOf(TAG2)).toBe(String(MODEL_VALUE));
    expect(badgeOf(TAG2)).toBeNull();

    const batchAt = api.calls.findIndex(c => c.includes('/resolve/batch'));
    const loopsAt = api.calls.findIndex(c => c.endsWith(SIGNAL_PATHS_URL));
    expect(loopReads(api)).toBe(1);
    expect(loopsAt).toBeGreaterThan(batchAt);
  });
});
