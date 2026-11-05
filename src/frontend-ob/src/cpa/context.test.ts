import { describe, expect, it } from 'vitest';
import { cpaHref } from '../components/Cpm/cpaHref';
import { DESTINATIONS, SUITE_MODULES, destinationFor, visibleDestinations } from './destinations';
import { resolveRedirect, rewriteLegacy } from './redirects';
import { isoToZoneInput, siteDateTime, zoneAbbr, zoneInputToIso } from './siteTime';
import { DEFAULT_RANGE, pickZone, readRange } from './useCpaContext';

const q = (s: string) => new URLSearchParams(s);
const sorted = (url: string | null) => {
  const [path, query = ''] = (url ?? '').split('?');
  return `${path}?${[...q(query).entries()].map(([k, v]) => `${k}=${v}`).sort().join('&')}`;
};

describe('destinations', () => {
  it('lists seven destinations in the SPEC order', () => {
    expect(DESTINATIONS.map(d => d.label)).toEqual(['Overview', 'Performance', 'Episodes', 'Loop', 'Evidence', 'Setup', 'System']);
  });

  it.each([
    ['/cpm', 'overview'], ['/cpm/kpi', 'overview'], ['/cpm/performance', 'performance'], ['/cpm/events', 'episodes'],
    ['/cpm/loop', 'loop'], ['/cpm/explorer', 'loop'], ['/cpm/historical', 'loop'], ['/cpm/investigation', 'loop'],
    ['/cpm/response', 'loop'], ['/cpm/evidence', 'evidence'], ['/cpm/replay', 'evidence'], ['/cpm/windows', 'evidence'],
    ['/cpm/calculations', 'evidence'], ['/cpm/setup', 'setup'], ['/cpm/registry', 'setup'], ['/cpm/config', 'setup'],
    ['/cpm/system', 'system'], ['/cpm/pipeline', 'system'], ['/cpm/governance', 'system'], ['/admin/users', 'system'],
  ])('%s belongs to %s', (path, id) => {
    expect(destinationFor(path)?.id).toBe(id);
  });

  it('gives Tag trend no destination, because it is a tool', () => {
    expect(destinationFor('/trend')).toBeUndefined();
  });

  it('shows an operator five destinations and hides Setup and System (RD4)', () => {
    const labels = visibleDestinations(p => p === 'analytics.view').map(d => d.label);
    expect(labels).toEqual(['Overview', 'Performance', 'Episodes', 'Loop', 'Evidence']);
  });

  it('shows Setup to a holder of either of its permissions', () => {
    expect(visibleDestinations(p => p === 'cpm.manage').map(d => d.id)).toEqual(['setup']);
    expect(visibleDestinations(p => p === 'cpm.config.read').map(d => d.id)).toEqual(['setup']);
  });

  it('keeps the suite order and deploys only CPA here', () => {
    expect(SUITE_MODULES.map(m => m.label)).toEqual(['Overview', 'Truss', 'CPA', 'Instrumental', 'PLC', 'Downtime', 'RCA']);
    expect(SUITE_MODULES.filter(m => m.deployed).map(m => m.id)).toEqual(['cpa']);
  });
});

describe('cpaHref', () => {
  const ctx = 'site=hdpe&area=s100&unit=u1&range=7d&window=24h&loop=FIC1';

  it('carries scope, range, window and loop to a loop page', () => {
    expect(sorted(cpaHref('/cpm/loop', ctx))).toBe('/cpm/loop?area=s100&loop=FIC1&range=7d&site=hdpe&unit=u1&window=24h');
  });

  it('leaves the loop behind on fleet pages', () => {
    expect(cpaHref('/cpm', ctx)).not.toContain('loop=');
    expect(cpaHref('/cpm/performance', ctx)).not.toContain('loop=');
  });

  it('leaves the window kind behind on Setup and System', () => {
    expect(cpaHref('/cpm/setup', ctx)).not.toContain('window=');
    expect(cpaHref('/cpm/system', ctx)).not.toContain('window=');
  });

  it('does not carry an evaluated window END as a kind', () => {
    expect(cpaHref('/cpm/loop', 'window=2026-11-04T12:00:00Z&loop=A')).toBe('/cpm/loop?loop=A');
  });

  it('carries a custom range with both ends only', () => {
    expect(sorted(cpaHref('/cpm', 'range=custom&from=a&to=b'))).toBe('/cpm?from=a&range=custom&to=b');
    expect(cpaHref('/cpm', 'range=custom&from=a')).toBe('/cpm');
  });

  it('treats a bare from and to as a custom range', () => {
    expect(sorted(cpaHref('/cpm', 'from=a&to=b'))).toBe('/cpm?from=a&range=custom&to=b');
  });

  it('drops a range it does not know', () => {
    expect(cpaHref('/cpm', 'range=fortnight')).toBe('/cpm');
  });

  it('lets extra win over the carried value and drops unrelated parameters', () => {
    expect(sorted(cpaHref('/cpm/loop', 'loop=A&gate=G1&sort=x', { loop: 'B', tab: 'signals' }))).toBe('/cpm/loop?loop=B&tab=signals');
  });

  it('accepts URLSearchParams', () => {
    expect(cpaHref('/cpm', q('site=a'))).toBe('/cpm?site=a');
  });
});

describe('legacy URL rewrite (SPEC §2.3)', () => {
  it.each([
    ['/cpm/kpi', 'kpi=K&site=a', '/cpm?review=K&site=a'],
    ['/cpm/kpi', '', '/cpm?review=acceptable'],
    ['/admin/users', '', '/cpm/system?tab=users'],
    ['/admin/roles', '', '/cpm/system?tab=roles'],
    ['/admin/audit', '', '/cpm/system?tab=governance'],
    ['/admin/system', '', '/cpm/system?tab=settings'],
    ['/admin/plant-model', 'search=b2', '/cpm/setup?search=b2&tab=plant-model'],
    ['/admin/data-sources', '', '/cpm/setup?tab=data-sources'],
    ['/admin/aliases', '', '/cpm/setup?tab=tag-aliases'],
    ['/cpm/explorer', 'loop=L', '/cpm/loop?loop=L&tab=summary'],
    ['/cpm/explorer', 'loop=L&tab=Summary', '/cpm/loop?loop=L&tab=summary'],
    ['/cpm/explorer', 'loop=L&tab=Signals', '/cpm/loop?loop=L&tab=signals'],
    ['/cpm/explorer', 'loop=L&tab=Relationships', '/cpm/loop?loop=L&tab=signals'],
    ['/cpm/explorer', 'loop=L&tab=Calculations', '/cpm/loop?loop=L&tab=calculations'],
    ['/cpm/explorer', 'loop=L&tab=History', '/cpm/loop?loop=L&tab=history'],
    ['/cpm/historical', 'loop=L&kpi=K&signals=pv&from=a&to=b&normalize=1&focus=x', '/cpm/loop?focus=x&from=a&kpi=K&loop=L&normalize=1&signals=pv&tab=historical&to=b'],
    ['/cpm/historical', 'loop=L&window=2026-11-04T12:00:00Z', '/cpm/loop?loop=L&tab=historical&window=2026-11-04T12:00:00Z'],
    ['/cpm/historical', 'loop=L&window=24h', '/cpm/loop?loop=L&tab=historical&window=24h'],
    ['/cpm/investigation', 'loop=L&profile=12h&case=C&mode=m&window=w', '/cpm/loop?case=C&loop=L&mode=m&profile=12h&tab=diagnosis&window=w'],
    ['/cpm/response', 'loop=L&event=E&methodRun=R', '/cpm/loop?event=E&loop=L&methodRun=R&tab=model'],
    ['/cpm/evidence', 'loop=L&gate=G0&before=b&methodRun=R&view=v&kind=12h', '/cpm/evidence?before=b&gate=G0&kind=12h&loop=L&methodRun=R&tab=gates&view=v'],
    ['/cpm/replay', 'loop=L&gate=G0&window=w', '/cpm/evidence?gate=G0&loop=L&tab=replay&window=w'],
    ['/cpm/windows', 'loop=L&profile=12h&window=w', '/cpm/evidence?loop=L&profile=12h&tab=windows&window=w'],
    ['/cpm/calculations', 'loop=L&gate=G0&metric=M', '/cpm/evidence?gate=G0&loop=L&metric=M&tab=calculations'],
    ['/cpm/registry', 'loop=L', '/cpm/setup?loop=L&tab=loops'],
    ['/cpm/config', 'loop=L&view=v&bundle=B&gate=G0&tab=rules', '/cpm/setup?bundle=B&gate=G0&loop=L&sub=rules&tab=configuration&view=v'],
    ['/cpm/pipeline', '', '/cpm/system?tab=pipeline'],
    ['/cpm/governance', '', '/cpm/system?tab=governance'],
  ])('%s?%s', (path, search, want) => {
    expect(sorted(rewriteLegacy(path, search))).toBe(sorted(want));
  });

  it.each(['/cpm', '/cpm/performance', '/cpm/events', '/trend', '/admin', '/cpm/loop'])('%s stays where it is', path => {
    expect(rewriteLegacy(path, 'loop=L')).toBeNull();
  });

  it('does not rewrite an Evidence URL that already has a tab', () => {
    expect(rewriteLegacy('/cpm/evidence', 'tab=replay')).toBeNull();
  });

  it('keeps a row off until its phase ships', () => {
    expect(resolveRedirect('/cpm/explorer', 'loop=L', 4)).toBeNull();
    expect(resolveRedirect('/cpm/explorer', 'loop=L', 5)).toBe('/cpm/loop?loop=L&tab=summary');
    expect(resolveRedirect('/cpm/kpi', 'kpi=K', 3)).toBeNull();
    expect(resolveRedirect('/cpm/kpi', 'kpi=K', 4)).toBe('/cpm?review=K');
  });
});

describe('time range', () => {
  it('defaults when nothing is set', () => {
    expect(readRange(q(''))).toEqual({ key: DEFAULT_RANGE, from: null, to: null });
  });

  it('reads a preset and ignores stray dates on it', () => {
    expect(readRange(q('range=7d&from=a&to=b'))).toEqual({ key: '7d', from: null, to: null });
  });

  it('reads a custom range', () => {
    expect(readRange(q('range=custom&from=a&to=b'))).toEqual({ key: 'custom', from: 'a', to: 'b' });
  });

  it('falls back when a custom range is missing an end', () => {
    expect(readRange(q('range=custom&from=a')).key).toBe(DEFAULT_RANGE);
  });
});

describe('site zone', () => {
  it('prefers the loop, then the scope, then the plant', () => {
    expect(pickZone('Asia/Dubai', 'Asia/Tehran', 'UTC')).toBe('Asia/Dubai');
    expect(pickZone(null, 'Asia/Tehran', 'UTC')).toBe('Asia/Tehran');
    expect(pickZone(null, undefined, 'Asia/Tehran')).toBe('Asia/Tehran');
  });

  it('skips an invalid zone and ends on UTC when nothing declares one', () => {
    expect(pickZone('Mars/Base', null, null)).toBe('UTC');
  });

  it('names the zone on every timestamp', () => {
    const at = Date.UTC(2026, 10, 4, 9, 15);
    expect(siteDateTime(at, 'UTC')).toBe('4 Nov 2026, 09:15 UTC');
    expect(siteDateTime(at, 'Asia/Dubai')).toContain('13:15');
    expect(siteDateTime(at, 'Asia/Dubai')).toContain(zoneAbbr('Asia/Dubai', at));
  });

  it('shows a dash for a missing or broken time', () => {
    expect(siteDateTime(null, 'UTC')).toBe('—');
    expect(siteDateTime('not a time', 'UTC')).toBe('—');
  });

  it('round-trips a datetime input through the site zone', () => {
    const iso = '2026-11-04T09:15:00.000Z';
    expect(isoToZoneInput(iso, 'Asia/Dubai')).toBe('2026-11-04T13:15');
    expect(zoneInputToIso('2026-11-04T13:15', 'Asia/Dubai')).toBe(iso);
  });

  it('reads wall-clock time correctly on both sides of a daylight-saving change', () => {
    expect(zoneInputToIso('2026-07-01T12:00', 'Europe/Oslo')).toBe('2026-07-01T10:00:00.000Z');
    expect(zoneInputToIso('2026-01-01T12:00', 'Europe/Oslo')).toBe('2026-01-01T11:00:00.000Z');
  });

  it('rejects a value that is not a datetime', () => {
    expect(zoneInputToIso('yesterday', 'UTC')).toBeNull();
  });
});
