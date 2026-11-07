import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fetchMod from '../api/apiFetch';
import { useRestoreLoop, useRetireLoop } from './useLoopRetire';

const wrap = (qc: QueryClient) => ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

afterEach(() => vi.restoreAllMocks());

describe('useLoopRetire', () => {
  it('retire posts the reason to the loop and refreshes the loop reads', async () => {
    const api = vi.spyOn(fetchMod, 'apiJson').mockResolvedValue({ loopId: 'A/1', retired: true, changed: true });
    const qc = new QueryClient();
    const inv = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => useRetireLoop(), { wrapper: wrap(qc) });
    result.current.mutate({ loopId: 'A/1', reason: 'decommissioned' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api).toHaveBeenCalledWith('/api/v1/cpm/loops/A%2F1/retire',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ reason: 'decommissioned' }) }));
    expect(inv).toHaveBeenCalledWith({ queryKey: ['cpm', 'loops'] });
    expect(inv).toHaveBeenCalledWith({ queryKey: ['cpm', 'loop', 'A/1'] });
  });

  it('restore posts to the restore address', async () => {
    const api = vi.spyOn(fetchMod, 'apiJson').mockResolvedValue({ loopId: 'L1', retired: false, changed: true });
    const { result } = renderHook(() => useRestoreLoop(), { wrapper: wrap(new QueryClient()) });
    result.current.mutate({ loopId: 'L1' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.mock.calls[0][0]).toBe('/api/v1/cpm/loops/L1/restore');
  });
});
