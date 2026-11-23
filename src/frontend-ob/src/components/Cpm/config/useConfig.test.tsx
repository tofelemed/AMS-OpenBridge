// CHG-220 (Gate Configuration check): gap 6 - a version's state is read again when its deployment ends (it kept "Prepared" and
// Activate stayed off until a reload); minor - a saved edit's new ETag is cached at once, so a second edit is not refused as stale.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as api from '../../../api/cpm/config';
import { ApiError } from '../../../api/apiFetch';
import { useBundle, useConfigActions, useDeployments } from './useConfig';

vi.mock('../../../api/cpm/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/cpm/config')>();
  return { ...actual, listDeployments: vi.fn(), patchDraft: vi.fn(), getBundle: vi.fn() };
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.mocked(api.listDeployments).mockReset(); vi.mocked(api.patchDraft).mockReset(); vi.mocked(api.getBundle).mockReset(); });

const wrapper = (qc: QueryClient) => ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const dep = (state: string) => ({ deploymentId: 'd1', bundleId: 'b1', state, kind: 'ACTIVATE', ackMatrix: [] }) as unknown as api.Deployment;

describe('useDeployments (gap 6)', () => {
  it('reads the version again once its deployment stops moving', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(api.listDeployments).mockResolvedValueOnce({ count: 1, deployments: [dep('APPLYING')] }).mockResolvedValue({ count: 1, deployments: [dep('PARTIALLY_ACKNOWLEDGED')] });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => useDeployments('b1'), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.data?.deployments[0].state).toBe('APPLYING'));
    expect(spy).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(5_500); });
    await waitFor(() => expect(result.current.data?.deployments[0].state).toBe('PARTIALLY_ACKNOWLEDGED'));
    const keys = spy.mock.calls.map(c => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).toContain(JSON.stringify(['cpm', 'config', 'bundle', 'b1']));
    expect(keys).toContain(JSON.stringify(['cpm', 'config', 'effective']));
  });
});

describe('useConfigActions.patch (minor)', () => {
  it('caches the saved version with its new ETag before the re-read, keeping its approvals', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(['cpm', 'config', 'bundle', 'b1'], { bundleId: 'b1', etag: 'e1', approvals: [{ approvalId: 'a' }] });
    vi.mocked(api.patchDraft).mockResolvedValue({ bundleId: 'b1', etag: 'e2' } as unknown as api.Bundle);
    const { result } = renderHook(() => useConfigActions('hdpe'), { wrapper: wrapper(qc) });
    vi.spyOn(qc, 'invalidateQueries').mockResolvedValue();   // no re-read in this test: the cache must already hold e2
    await act(async () => { await result.current.patch.mutateAsync({ id: 'b1', etag: 'e1', ops: [] }); });
    expect(qc.getQueryData(['cpm', 'config', 'bundle', 'b1'])).toMatchObject({ etag: 'e2', approvals: [{ approvalId: 'a' }] });
  });
});

describe('useBundle', () => {
  it('a 404 is not retried: one request, the error at once, even with the app default of 2 retries', async () => {
    vi.mocked(api.getBundle).mockRejectedValue(new ApiError(404, 'not found'));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: 2 } } });
    const { result } = renderHook(() => useBundle('nope'), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 500 });
    expect(api.getBundle).toHaveBeenCalledTimes(1);
  });
});
