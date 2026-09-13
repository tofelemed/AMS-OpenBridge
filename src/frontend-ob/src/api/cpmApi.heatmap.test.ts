// CHG-025 — the Performance gate matrix must be able to find every monitored loop.
//
// The matrix pages and searches CLIENT-SIDE over the heatmap payload, and the request asked
// for the server default of 100 loops. A plant with 171 (lab: 230) monitored loops therefore
// searched only the first 100 by id and answered "No loops match" for a loop that exists
// (PIC80140 sorts after the 100th). The request now asks for the server's whole allowance.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fetchMod from './apiFetch';
import { getFleetHeatmap } from './cpmApi';

vi.mock('./apiFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./apiFetch')>();
  return { ...actual, apiJson: vi.fn() };
});

describe('getFleetHeatmap', () => {
  beforeEach(() => {
    vi.mocked(fetchMod.apiJson).mockReset();
    vi.mocked(fetchMod.apiJson).mockResolvedValue({ site: null, windowKind: '24h', gateKeys: [], count: 0, total: 0, truncated: false, loops: [] });
  });

  it('asks for the whole fleet (the server cap), not the first 100 loops', async () => {
    await getFleetHeatmap({ site: 'hdpe' }, '24h');

    const url = vi.mocked(fetchMod.apiJson).mock.calls[0][0] as string;
    const params = new URL(url, 'http://x').searchParams;
    expect(Number(params.get('limit'))).toBeGreaterThanOrEqual(2000);
    expect(params.get('windowKind')).toBe('24h');
    expect(params.get('site')).toBe('hdpe');
  });
});
