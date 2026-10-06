import { describe, expect, it } from 'vitest';
import { trendPeriodOf, trendPeriodText } from './trendPeriod';

const NOW = Date.parse('2026-10-06T12:00:00Z');
const q = (s: string) => new URLSearchParams(s);

describe('trend period from the URL', () => {
  it('is live without from/to: "last 8 h", handed on as the absolute 8 h', () => {
    expect(trendPeriodText(q('loop=L1'))).toBe('last 8 h');
    expect(trendPeriodOf(q('loop=L1'), NOW)).toEqual({ from: '2026-10-06T04:00:00.000Z', to: '2026-10-06T12:00:00.000Z' });
  });
  it('is the pinned period when from/to are valid', () => {
    expect(trendPeriodOf(q('from=2026-10-01T00:00:00Z&to=2026-10-02T00:00:00Z'), NOW))
      .toEqual({ from: '2026-10-01T00:00:00.000Z', to: '2026-10-02T00:00:00.000Z' });
    expect(trendPeriodText(q('from=2026-10-01T00:00:00Z&to=2026-10-02T00:00:00Z'))).toContain('→');
  });
  it('treats a backwards or broken pair as live', () => {
    expect(trendPeriodText(q('from=2026-10-02T00:00:00Z&to=2026-10-01T00:00:00Z'))).toBe('last 8 h');
    expect(trendPeriodText(q('from=nope&to=2026-10-01T00:00:00Z'))).toBe('last 8 h');
  });
});
