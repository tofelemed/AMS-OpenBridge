import { describe, expect, it } from 'vitest';
import { CPM_PAGES, cpmNavHref, cpmPage } from './cpmTasks';

describe('cpmNavHref', () => {
  it('carries loop and plant scope between Loop Performance pages', () => {
    expect(cpmNavHref('/cpm/replay', '/cpm/explorer', '?loop=FIC10401&site=marun&tab=Summary'))
      .toBe('/cpm/replay?loop=FIC10401&site=marun');
  });

  it('carries scope without a loop', () => {
    expect(cpmNavHref('/cpm/events', '/cpm', '?site=marun&area=hdpe&unit=u1'))
      .toBe('/cpm/events?site=marun&area=hdpe&unit=u1');
  });

  it('opens Overview and Performance on the whole plant: no loop, no scope (CHG-069)', () => {
    expect(cpmNavHref('/cpm', '/cpm/explorer', '?loop=FIC10503&site=hdpe')).toBe('/cpm');
    expect(cpmNavHref('/cpm/performance', '/cpm/explorer', '?loop=FIC10503&site=hdpe&area=a')).toBe('/cpm/performance');
    expect(cpmNavHref('/cpm/performance', '/cpm', '?site=marun')).toBe('/cpm/performance');
  });

  it('does not carry the window: its meaning differs per page', () => {
    expect(cpmNavHref('/cpm/historical', '/cpm/performance', '?loop=L1&window=24h&gate=G3'))
      .toBe('/cpm/historical?loop=L1');
  });

  it('returns the bare path when leaving or entering from outside Loop Performance', () => {
    expect(cpmNavHref('/alarms', '/cpm/explorer', '?loop=L1')).toBe('/alarms');
    expect(cpmNavHref('/cpm/explorer', '/alarms', '?loop=L1')).toBe('/cpm/explorer');
    expect(cpmNavHref('/cpm/pipeline', '/cpm/explorer', '?loop=L1')).toBe('/cpm/pipeline');
  });

  it('ignores blank values', () => {
    expect(cpmNavHref('/cpm/explorer', '/cpm/events', '?loop=%20&site=')).toBe('/cpm/explorer');
  });
});

describe('CPM_PAGES', () => {
  it('gives every page a task and a purpose sentence', () => {
    for (const path of Object.keys(CPM_PAGES)) {
      const info = cpmPage(path);
      expect(info?.task).toBeTruthy();
      expect(info?.purpose).toMatch(/\.$/);
    }
  });
});

describe('cpmNavHref period carry (CHG-048)', () => {
  const NOW = Date.parse('2026-10-06T12:00:00Z');
  it('carries a pinned period between the Explorer trend and Historical', () => {
    expect(cpmNavHref('/cpm/historical', '/cpm/explorer', '?loop=L1&from=2026-10-01T00:00:00Z&to=2026-10-02T00:00:00Z', NOW))
      .toBe('/cpm/historical?loop=L1&from=2026-10-01T00%3A00%3A00Z&to=2026-10-02T00%3A00%3A00Z');
  });
  it('hands Historical the live Explorer 8 h, made absolute', () => {
    expect(cpmNavHref('/cpm/historical', '/cpm/explorer', '?loop=L1', NOW))
      .toBe('/cpm/historical?loop=L1&from=2026-10-06T04%3A00%3A00.000Z&to=2026-10-06T12%3A00%3A00.000Z');
  });
  it('never carries the period to pages that read it differently', () => {
    expect(cpmNavHref('/cpm/replay', '/cpm/explorer', '?loop=L1&from=a&to=b', NOW)).toBe('/cpm/replay?loop=L1');
  });
});
