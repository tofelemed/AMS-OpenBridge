// CHG-024 (batch 4) — the Windows comparator's six per-kind KPI reads become one request.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as cpm from '../api/cpmApi';
import { useCpmKpisByResolution } from './useCpm';

vi.mock('../api/cpmApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/cpmApi')>();
  return { ...actual, getKpisByResolution: vi.fn(), getKpis: vi.fn() };
});

const KINDS = ['1m', '5m', '10m', '15m', '30m', '60m'];
const row = (kind: string, i: number): cpm.CpmKpiRow =>
  ({ window_start: null, window_end: `2026-09-13T0${i}:00:00Z`, sample_count: 60, created_at: '2026-09-13T00:00:00Z', mae: i, kind } as unknown as cpm.CpmKpiRow);

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useCpmKpisByResolution', () => {
  beforeEach(() => {
    vi.mocked(cpm.getKpisByResolution).mockReset();
    vi.mocked(cpm.getKpis).mockReset();
    vi.mocked(cpm.getKpisByResolution).mockImplementation(async (_loopId, resolutions, limit) => ({
      loopId: 'FIC1', limit: limit ?? 12,
      byResolution: Object.fromEntries(resolutions.map(k => [k, { tier: 'short' as const, count: 2, samples: [row(k, 1), row(k, 2)] }])),
    }));
  });

  it('asks for every kind in ONE request and exposes the samples per kind', async () => {
    const { result } = renderHook(() => useCpmKpisByResolution('FIC1', KINDS, 12), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    const calls = vi.mocked(cpm.getKpisByResolution).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('FIC1');
    expect(calls[0][1]).toEqual(KINDS);
    expect(calls[0][2]).toBe(12);
    expect(vi.mocked(cpm.getKpis)).not.toHaveBeenCalled();
    expect(Object.keys(result.current.data!.byResolution)).toEqual(KINDS);
    expect(result.current.data!.byResolution['5m'].samples).toHaveLength(2);
  });

  it('does not fetch without a loop or without kinds', async () => {
    renderHook(() => useCpmKpisByResolution(undefined, KINDS, 12), { wrapper });
    renderHook(() => useCpmKpisByResolution('FIC1', [], 12), { wrapper });
    await new Promise(r => setTimeout(r, 30));
    expect(vi.mocked(cpm.getKpisByResolution)).not.toHaveBeenCalled();
  });
});
