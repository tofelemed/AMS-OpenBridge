// CHG-023 (P0-2) — the Performance page's "bad actors" list.
//
// It used to be a SECOND /fleet/rankings request (limit 12) fired beside the page's own
// limit-50 ranking — the same server order, so the same twelve loops — which doubled the
// heaviest query on the page and repeated it every 60 s. Now the confidence order is a
// slice of the page's ranking; only the "error" order (a genuinely different server
// ORDER BY, which cannot be derived client-side) still costs a request.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as cpm from '../../api/cpmApi';
import { useBadActors } from './useBadActors';

vi.mock('../../api/cpmApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/cpmApi')>();
  return { ...actual, getFleetRankings: vi.fn() };
});

const loop = (i: number): cpm.CpmRankedLoop => ({
  rank: i + 1, loopId: `FIC${100 + i}`, displayName: `Loop ${i}`, site: 'hdpe', area: null, unit: null,
  loopType: 'flow', criticality: 'B', windowEnd: null, diagnosis: 'STICTION', severity: 'HIGH',
  confidence: 1 - i / 100,
  metrics: { effortRatio: null, triangularity: null, horchOddness: null, acfPeriodS: null, goodErrorPct: null, mae: null },
  observabilityFlags: [],
});

const fifty = { site: undefined, area: undefined, unit: undefined, windowKind: '24h', orderBy: 'confidence',
  count: 50, loops: Array.from({ length: 50 }, (_, i) => loop(i)) };
const twelveByError = { ...fifty, orderBy: 'error', count: 12, loops: Array.from({ length: 12 }, (_, i) => loop(80 + i)) };

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useBadActors', () => {
  beforeEach(() => {
    vi.mocked(cpm.getFleetRankings).mockReset();
    vi.mocked(cpm.getFleetRankings).mockImplementation(async (_scope, _wk, limit, orderBy) =>
      orderBy === 'error' ? twelveByError : { ...fifty, count: limit ?? 50, loops: fifty.loops.slice(0, limit ?? 50) });
  });

  it('by confidence: is the top 12 of the page ranking and issues no second rankings request', async () => {
    const { result } = renderHook(() => useBadActors({}, '24h', 'confidence'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data!.loops).toEqual(fifty.loops.slice(0, 12));
    const calls = vi.mocked(cpm.getFleetRankings).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][2]).toBe(50);
    expect(calls[0][3]).toBe('confidence');
  });

  it('by error: asks the server for the error order, limit 12', async () => {
    const { result } = renderHook(() => useBadActors({}, '24h', 'error'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data!.loops).toEqual(twelveByError.loops);
    const calls = vi.mocked(cpm.getFleetRankings).mock.calls;
    expect(calls.some(c => c[2] === 12 && c[3] === 'error')).toBe(true);
  });
});
