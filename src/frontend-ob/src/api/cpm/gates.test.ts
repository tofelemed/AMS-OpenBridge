// v2.5 workbench: the window picker lists EVERY evaluated window of a loop (INSUFFICIENT_DATA ones
// included - they carry run ids and a reason) as ~0.5 KB summary rows, paged backwards with `to`.
// The gate history read the other pages use (verdict rows only, full matrix) is untouched.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fetchMod from '../apiFetch';
import { getGateHistory, getWindowSummaries } from './gates';

vi.mock('../apiFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../apiFetch')>();
  return { ...actual, apiJson: vi.fn() };
});

const apiJson = fetchMod.apiJson as unknown as ReturnType<typeof vi.fn>;
const urlOf = (call: number) => new URL('http://x' + (apiJson.mock.calls[call][0] as string));

describe('window summaries', () => {
  beforeEach(() => { apiJson.mockReset(); apiJson.mockResolvedValue({ loopId: 'FIC10405', windowKind: '24h', count: 0, projection: 'summary', windows: [] }); });

  it('asks for the summary projection with insufficient windows included, newest first', async () => {
    await getWindowSummaries('FIC10405', '24h');
    const u = urlOf(0);
    expect(u.pathname).toBe('/api/v1/cpm/loops/FIC10405/gates');
    expect(u.searchParams.get('projection')).toBe('summary');
    expect(u.searchParams.get('includeInsufficient')).toBe('true');
    expect(u.searchParams.get('windowKind')).toBe('24h');
    expect(u.searchParams.get('limit')).toBe('100');
    expect(u.searchParams.get('to')).toBeNull();
  });

  it('pages older windows with `to` and a caller-chosen limit', async () => {
    await getWindowSummaries('FIC10405', '12h', { to: '2026-09-16T07:45:00Z', limit: 50 });
    const u = urlOf(0);
    expect(u.searchParams.get('to')).toBe('2026-09-16T07:45:00Z');
    expect(u.searchParams.get('limit')).toBe('50');
  });

  it('leaves the verdict-only full history read exactly as it was', async () => {
    await getGateHistory('FIC10405', '24h');
    const u = urlOf(0);
    expect(u.searchParams.get('projection')).toBeNull();
    expect(u.searchParams.get('includeInsufficient')).toBeNull();
  });
});
