// CHG-168 (owner review, answer 1): one dropdown holds Show retired and the three configuration-limit counts; the choice keeps
// today's address (?retired=1, ?gap=vp|peers|degraded).
import { describe, expect, it } from 'vitest';
import type { CpmFleetSummary, CpmLoop } from '../../../api/cpmApi';
import { inView, setView, viewCounts, viewOf, viewOptions } from './registryView';

const loop = (id: string, over: Partial<CpmLoop> = {}): CpmLoop => ({
  loopId: id, assetId: null, displayName: id, site: 'hdpe', area: null, unit: null, loopType: 'FIC', criticality: 'medium',
  isActive: true, monitoringEnabled: true, tags: { VP: 'x' }, observabilityFlags: [], links: [], stepTestApproved: false,
  thresholdProfileId: null, model: null, ...over,
} as CpmLoop);

const summary = { capability: { loopsCappedByMissingVp: 234, loopsWithoutDisturbanceContext: 239 } } as CpmFleetSummary;

describe('registry view', () => {
  it('reads the choice from the address, as today', () => {
    expect(viewOf(new URLSearchParams(''))).toBe('current');
    expect(viewOf(new URLSearchParams('retired=1'))).toBe('all');
    expect(viewOf(new URLSearchParams('gap=vp'))).toBe('vp');
    expect(viewOf(new URLSearchParams('gap=peers&retired=1'))).toBe('peers');
    expect(viewOf(new URLSearchParams('gap=bogus'))).toBe('current');
  });

  it('writes the choice back as ?retired=1 or ?gap=, never both', () => {
    const p = new URLSearchParams('retired=1&search=FIC');
    setView(p, 'degraded');
    expect(p.toString()).toBe('search=FIC&gap=degraded');
    setView(p, 'all');
    expect(p.toString()).toBe('search=FIC&retired=1');
    setView(p, 'current');
    expect(p.toString()).toBe('search=FIC');
  });

  it('keeps retired loops out of Not retired and in With retired', () => {
    const old = loop('OLD', { isActive: false });
    expect(inView(old, 'current')).toBe(false);
    expect(inView(old, 'all')).toBe(true);
    expect(inView(loop('A', { tags: {} }), 'vp')).toBe(true);
    expect(inView(loop('B'), 'vp')).toBe(false);
  });

  it('counts each option: the list for retired and degraded, the server summary for VP and peers', () => {
    const scoped = [loop('A'), loop('OLD', { isActive: false }), loop('DEG', { observabilityFlags: ['NO_VP'], tags: {} })];
    const c = viewCounts(scoped, summary);
    expect(c).toEqual({ current: 2, all: 3, vp: 234, peers: 239, degraded: 1 });
    expect(viewOptions(c).map(o => o.label)).toEqual([
      'Not retired 2', 'With retired 3', 'VP expected, not mapped 234', 'Peer links expected, missing 239', 'Degraded 1',
    ]);
  });

  it('names the limit options without a number while the summary is not there', () => {
    const c = viewCounts([loop('A')], undefined);
    expect(viewOptions(c).map(o => o.label)).toEqual([
      'Not retired 1', 'With retired 1', 'VP expected, not mapped', 'Peer links expected, missing', 'Degraded 0',
    ]);
  });
});
