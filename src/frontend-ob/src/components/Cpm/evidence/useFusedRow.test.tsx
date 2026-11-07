import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { row } from './windowFixtures';
import type { MethodRun } from '../../../api/cpm/evidence';

const getGateHistory = vi.hoisted(() => vi.fn());
vi.mock('../../../api/cpm/gates', () => ({ getGateHistory, getWindowSummaries: vi.fn() }));

import { useFusedRow } from './useFusedRow';

const wrap = ({ children }: { children: React.ReactNode }) =>
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
const run = (analysisRunId: string | null): MethodRun => ({
  methodRunId: 'm', tier: 'fusion', gate: 'G15', loopId: 'FIC10401', windowKind: '12h',
  support: { fromMs: 0, toMs: Date.parse('2026-10-05T12:30:00Z'), sampleCount: 1 },
  identity: { analysisRunId } as MethodRun['identity'],
} as MethodRun);
const live = row('2026-10-05T12:30:00Z', { diagnosis: 'NO_CALL' });
const rerun = row('2026-10-05T12:30:00Z', { diagnosis: 'CONFIRMED', replayId: 'ar-7' });
const page = (...windows: ReturnType<typeof row>[]) => ({ loopId: 'FIC10401', windowKind: '12h', count: windows.length, windows });

describe('useFusedRow', () => {
  beforeEach(() => getGateHistory.mockReset());

  it('reads the row of the pinned run, not the live row', async () => {
    getGateHistory.mockResolvedValue(page(live, rerun));
    const { result } = renderHook(() => useFusedRow('FIC10401', run('ar-7')), { wrapper: wrap });
    await waitFor(() => expect(result.current.row).toBeDefined());
    expect(result.current.row?.diagnosis).toBe('CONFIRMED');
    expect(getGateHistory.mock.calls[0][7]).toBe('ANY');
  });

  it('a live run reads the original, never a re-run of the same end', async () => {
    getGateHistory.mockResolvedValue(page(rerun, live));
    const { result } = renderHook(() => useFusedRow('FIC10401', run(null)), { wrapper: wrap });
    await waitFor(() => expect(result.current.row).toBeDefined());
    expect(result.current.row?.diagnosis).toBe('NO_CALL');
  });

  it('a pinned run whose row is not stored gets no row, not the live one', async () => {
    getGateHistory.mockResolvedValue(page(live));
    const { result } = renderHook(() => useFusedRow('FIC10401', run('ar-9')), { wrapper: wrap });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.row).toBeUndefined();
  });

  it('finds a REPLAY row, which stores only the 12-character prefix of the run id', async () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    getGateHistory.mockResolvedValue(page(live, row('2026-10-05T12:30:00Z', { diagnosis: 'CONFIRMED', replayId: '0f8fad5bd9cb' })));
    const { result } = renderHook(() => useFusedRow('FIC10401', run(id)), { wrapper: wrap });
    await waitFor(() => expect(result.current.row).toBeDefined());
    expect(result.current.row?.diagnosis).toBe('CONFIRMED');
  });

  it('finds an EVALUATE row, which stores the whole run id', async () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    getGateHistory.mockResolvedValue(page(live, row('2026-10-05T12:30:00Z', { diagnosis: 'CONFIRMED', replayId: id })));
    const { result } = renderHook(() => useFusedRow('FIC10401', run(id)), { wrapper: wrap });
    await waitFor(() => expect(result.current.row).toBeDefined());
    expect(result.current.row?.diagnosis).toBe('CONFIRMED');
  });
});
