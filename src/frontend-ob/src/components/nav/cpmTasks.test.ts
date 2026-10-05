import { describe, expect, it } from 'vitest';
import { CPM_PAGES, cpmNavHref, cpmPage } from './cpmTasks';

describe('cpmNavHref', () => {
  it('carries loop and plant scope between Loop Performance pages', () => {
    expect(cpmNavHref('/cpm/replay', '/cpm/explorer', '?loop=FIC10401&site=marun&tab=Summary'))
      .toBe('/cpm/replay?loop=FIC10401&site=marun');
  });

  it('carries scope without a loop', () => {
    expect(cpmNavHref('/cpm/performance', '/cpm', '?site=marun&area=hdpe&unit=u1'))
      .toBe('/cpm/performance?site=marun&area=hdpe&unit=u1');
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
