// @vitest-environment jsdom
/**
 * CHG-176: the Designer's per-slot binding hook carries the resolver's provenance and says how far the binding is
 * trusted. A binding from the asset model is used exactly as before, with no loop-registry read. A fallback binding is
 * read (value shown, Uncertain) unless its path is a registered loop's signal: then nothing is subscribed or shown.
 * The registry is read only once a fallback appears; a failed read (or no right to read it) falls back to "read".
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as fetchMod from '../api/apiFetch';
import { useAuthStore } from '../store/authStore';
import {
  DERIVED_VALUE, LOOPS_URL, LOOP_PV, MODEL_VALUE, SIGNAL_PATHS_URL, TAG, fakeAnswer, fakeApi, fakeResponse, liveFor, loopReads,
  readsOf, topicOf, type FakeApi,
} from '../components/Designer/trustFixtures';

const mq = vi.hoisted(() => ({ subscribeScreen: vi.fn(), unsubscribeScreen: vi.fn(), metrics: new Map<string, unknown>() }));
vi.mock('../store/mqttStore', () => ({ useMqttStore: (pick: (s: typeof mq) => unknown) => pick(mq) }));
vi.mock('../api/apiFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/apiFetch')>();
  return { ...actual, apiFetch: vi.fn(), apiJson: vi.fn() };
});

import { useBindingResolver } from './useBindingResolver';

let api: FakeApi;
let client: QueryClient;
const asUser = (permissions: string[]) => useAuthStore.setState({
  user: { user_id: 'u', username: 'op', email: '', role: 'Operator', is_active: true, permissions }, status: 'authenticated', accessToken: 't',
});
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const hook = (path: string) => renderHook(() => useBindingResolver(path, 'live'), { wrapper });

beforeEach(() => {
  api = fakeApi();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mq.subscribeScreen.mockReset();
  mq.metrics = liveFor([TAG, LOOP_PV]);
  asUser(['analytics.view']);
  vi.mocked(fetchMod.apiFetch).mockImplementation(async (url: string, init?: RequestInit) => fakeResponse(fakeAnswer(api, url, init)));
  vi.mocked(fetchMod.apiJson).mockImplementation(async (url: string, init?: RequestInit) => {
    const a = fakeAnswer(api, url, init);
    if (a.status >= 400) throw new fetchMod.ApiError(a.status, 'down');
    return a.body as never;
  });
});
afterEach(cleanup);

describe('a binding from the asset model', () => {
  it('reads the asset model\'s device and never asks the loop registry', async () => {
    const { result } = hook(LOOP_PV);
    await waitFor(() => expect(result.current.metric?.value).toBe(MODEL_VALUE));
    expect(result.current.provenance).toBe('asset-model');
    expect(result.current.trust).toBe('asset-model');
    expect(mq.subscribeScreen).toHaveBeenCalledWith([topicOf(LOOP_PV, 'asset-model')]);
    expect(loopReads(api)).toBe(0);
  });
});

describe('a fallback binding', () => {
  it('carries the provenance and reads the derived path when it is no loop signal', async () => {
    api.fallback = [TAG];
    const { result } = hook(TAG);
    await waitFor(() => expect(result.current.metric?.value).toBe(DERIVED_VALUE));
    expect(result.current.provenance).toBe('fallback');
    expect(result.current.trust).toBe('fallback');
    expect(mq.subscribeScreen).toHaveBeenCalledWith([topicOf(TAG, 'fallback')]);
    expect(loopReads(api)).toBe(1);
  });

  it('reads nothing for a registered loop signal: no subscription, no value', async () => {
    api.fallback = [LOOP_PV];
    const { result } = hook(LOOP_PV);
    await waitFor(() => expect(loopReads(api)).toBe(1));
    await waitFor(() => expect(result.current.trust).toBe('loop-unread'));
    expect(result.current.provenance).toBe('fallback');
    expect(result.current.metric).toBeUndefined();
    expect(result.current.data).toBeUndefined();
    expect(mq.subscribeScreen).not.toHaveBeenCalled();
  });

  it('reads the derived path, Uncertain, when the loop signals cannot be read', async () => {
    api.fallback = [LOOP_PV];
    api.signalPaths = 'fail';
    const { result } = hook(LOOP_PV);
    await waitFor(() => expect(result.current.metric?.value).toBe(DERIVED_VALUE));
    expect(result.current.trust).toBe('fallback');
    expect(loopReads(api)).toBe(1);
    // Quiet: the shared query is marked so the app's global error log skips it.
    expect(client.getQueryCache().find({ queryKey: ['cpm', 'loop-signal-paths'] })?.meta).toMatchObject({ quietOnError: true });
  });

  it('does not ask without display.view or analytics.view, and reads the derived path', async () => {
    asUser([]);
    api.fallback = [LOOP_PV];
    const { result } = hook(LOOP_PV);
    await waitFor(() => expect(result.current.metric?.value).toBe(DERIVED_VALUE));
    expect(result.current.trust).toBe('fallback');
    expect(loopReads(api)).toBe(0);
  });
});

describe('CHG-179: the loop signals come from the signal-paths read', () => {
  it('gives an operator with only display.view the loop exception, without the loop registry', async () => {
    asUser(['display.view']);
    api.fallback = [LOOP_PV];
    const { result } = hook(LOOP_PV);
    await waitFor(() => expect(result.current.trust).toBe('loop-unread'));
    expect(result.current.metric).toBeUndefined();
    expect(mq.subscribeScreen).not.toHaveBeenCalled();
    expect(readsOf(api, SIGNAL_PATHS_URL)).toBe(1);
    expect(readsOf(api, LOOPS_URL)).toBe(0);
  });

  it('reads a plain tag\'s fallback for that operator, Uncertain', async () => {
    asUser(['display.view']);
    api.fallback = [TAG];
    const { result } = hook(TAG);
    await waitFor(() => expect(result.current.metric?.value).toBe(DERIVED_VALUE));
    expect(result.current.trust).toBe('fallback');
  });

  it('falls back to GET /loops on an older cplm-api (404) for a user with analytics.view', async () => {
    api.signalPaths = 'missing';
    api.fallback = [LOOP_PV];
    const { result } = hook(LOOP_PV);
    await waitFor(() => expect(result.current.trust).toBe('loop-unread'));
    expect(mq.subscribeScreen).not.toHaveBeenCalled();
    expect(readsOf(api, SIGNAL_PATHS_URL)).toBe(1);
    expect(readsOf(api, LOOPS_URL)).toBe(1);
  });

  it('reads the derived path, Uncertain, on an older cplm-api (404) without analytics.view', async () => {
    asUser(['display.view']);
    api.signalPaths = 'missing';
    api.fallback = [LOOP_PV];
    const { result } = hook(LOOP_PV);
    await waitFor(() => expect(result.current.metric?.value).toBe(DERIVED_VALUE));
    expect(result.current.trust).toBe('fallback');
    expect(readsOf(api, LOOPS_URL)).toBe(0);
  });

  it('sends no loop-signal read for an operator while no fallback appears', async () => {
    asUser(['display.view']);
    const { result } = hook(LOOP_PV);
    await waitFor(() => expect(result.current.metric?.value).toBe(MODEL_VALUE));
    expect(result.current.trust).toBe('asset-model');
    expect(loopReads(api)).toBe(0);
  });
});
