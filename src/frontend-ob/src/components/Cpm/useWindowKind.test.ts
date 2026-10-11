import { describe, expect, it } from 'vitest';
import { DEFAULT_WINDOW_KIND, WINDOW_KINDS, windowKindOf } from './useWindowKind';
import { kpiHref, overviewHref } from './cpaHref';

// CHG-089: 12h is the default fused window everywhere; 24h on request; a bad URL value never empties a page
describe('windowKindOf', () => {
  it('defaults to 12h', () => {
    expect(DEFAULT_WINDOW_KIND).toBe('12h');
    expect(WINDOW_KINDS).toEqual(['12h', '24h']);
    expect(windowKindOf(null)).toBe('12h');
    expect(windowKindOf(undefined)).toBe('12h');
  });
  it('keeps a served kind and drops anything else', () => {
    expect(windowKindOf('24h')).toBe('24h');
    expect(windowKindOf('12h')).toBe('12h');
    expect(windowKindOf('7d')).toBe('12h');
    expect(windowKindOf('2026-10-12T00:00:00Z')).toBe('12h');   // an evaluated window END is not a kind
    expect(windowKindOf('24h', ['12h'])).toBe('12h');          // only what the engine serves
  });
});

describe('KPI links carry the window', () => {
  it('writes ?window= on the KPI page and the Overview', () => {
    expect(kpiHref('manual-mode', { site: 'hdpe', windowKind: '24h' })).toBe('/cpm/kpi?kpi=manual-mode&site=hdpe&window=24h');
    expect(overviewHref({ windowKind: '12h' })).toBe('/cpm?window=12h');
    expect(overviewHref({})).toBe('/cpm');
  });
});
