import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { row } from './windowFixtures';

const getGateHistory = vi.hoisted(() => vi.fn());
const getWindowSummaries = vi.hoisted(() => vi.fn());
vi.mock('../../../api/cpm/gates', () => ({ getGateHistory, getWindowSummaries }));

import { useWindowAt, usePreviousEnd } from './useWindowAt';

const wrap = ({ children }: { children: React.ReactNode }) =>
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
const page = (...windows: ReturnType<typeof row>[]) => ({ loopId: 'FIC10401', windowKind: '12h', count: windows.length, windows });

describe('useWindowAt', () => {
  beforeEach(() => { getGateHistory.mockReset(); getWindowSummaries.mockReset(); });

  it('finds a window older than the newest 100', async () => {
    getGateHistory.mockResolvedValue(page(row('2026-10-05T12:30:00.000Z')));
    const { result } = renderHook(() => useWindowAt('FIC10401', '12h', '2026-10-05T12:30:00Z'), { wrapper: wrap });
    await waitFor(() => expect(result.current.row).toBeDefined());
    const args = getGateHistory.mock.calls[0];
    expect(args[1]).toBe('12h');
    expect(args[2]).toBe('2026-10-05T12:30:00.000Z');   // from
    expect(args[3]).toBe('2026-10-05T12:30:00.000Z');   // to: the window itself, not a list of the newest
    expect(result.current.row?.windowEnd).toBe('2026-10-05T12:30:00.000Z');
    expect(result.current.notFound).toBe(false);
  });

  it('compares instants, not strings', async () => {
    getGateHistory.mockResolvedValue(page(row('2026-10-05T12:30:00.000Z')));
    const { result } = renderHook(() => useWindowAt('FIC10401', '12h', '2026-10-05T12:30:00Z'), { wrapper: wrap });
    await waitFor(() => expect(result.current.row).toBeDefined());
    expect(result.current.row?.windowEnd).toBe('2026-10-05T12:30:00.000Z');
  });

  it('says not found and never returns the newest', async () => {
    getGateHistory.mockResolvedValue(page(row('2026-11-04T12:15:00Z'), row('2026-11-04T12:00:00Z')));
    const { result } = renderHook(() => useWindowAt('FIC10401', '12h', '2026-10-05T12:30:00Z'), { wrapper: wrap });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.notFound).toBe(true);
    expect(result.current.row).toBeUndefined();
  });

  it('prefers the original over a re-run with the same end', async () => {
    getGateHistory.mockResolvedValue(page(
      row('2026-10-05T12:30:00Z', { replayId: 'rr-1', diagnosis: 'CONFIRMED' }),
      row('2026-10-05T12:30:00Z', { diagnosis: 'NO_CALL' })));
    const { result } = renderHook(() => useWindowAt('FIC10401', '12h', '2026-10-05T12:30:00Z'), { wrapper: wrap });
    await waitFor(() => expect(result.current.row).toBeDefined());
    expect(result.current.row?.diagnosis).toBe('NO_CALL');
    expect(result.current.rerun).toBe(false);
  });

  it('labels a window only a re-run holds as a re-run', async () => {
    getGateHistory.mockResolvedValue(page(row('2026-10-05T12:30:00Z', { replayId: 'rr-1' })));
    const { result } = renderHook(() => useWindowAt('FIC10401', '12h', '2026-10-05T12:30:00Z'), { wrapper: wrap });
    await waitFor(() => expect(result.current.row).toBeDefined());
    expect(result.current.rerun).toBe(true);
  });

  it('with no end asked it opens the newest window', async () => {
    getGateHistory.mockResolvedValue(page(row('2026-11-04T12:15:00Z'), row('2026-11-04T12:00:00Z')));
    const { result } = renderHook(() => useWindowAt('FIC10401', '12h', null), { wrapper: wrap });
    await waitFor(() => expect(result.current.row).toBeDefined());
    expect(result.current.row?.windowEnd).toBe('2026-11-04T12:15:00Z');
  });

  it('an end that is not a date is not found', async () => {
    const { result } = renderHook(() => useWindowAt('FIC10401', '12h', 'yesterday'), { wrapper: wrap });
    expect(result.current.notFound).toBe(true);
    expect(getGateHistory).not.toHaveBeenCalled();
  });
});

describe('usePreviousEnd', () => {
  beforeEach(() => getWindowSummaries.mockReset());
  it('is the next older window end whether or not the server includes the window itself', async () => {
    getWindowSummaries.mockResolvedValue({ windows: [{ windowEnd: '2026-10-05T12:30:00.000Z' }, { windowEnd: '2026-10-05T12:15:00Z' }] });
    const { result } = renderHook(() => usePreviousEnd('FIC10401', '12h', '2026-10-05T12:30:00Z'), { wrapper: wrap });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.end).toBe('2026-10-05T12:15:00Z');
  });
  it('is none when nothing older is stored', async () => {
    getWindowSummaries.mockResolvedValue({ windows: [{ windowEnd: '2026-10-05T12:30:00Z' }] });
    const { result } = renderHook(() => usePreviousEnd('FIC10401', '12h', '2026-10-05T12:30:00Z'), { wrapper: wrap });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.end).toBeNull();
  });
});
