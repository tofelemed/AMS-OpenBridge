import { describe, expect, it } from 'vitest';
import { cpaHref } from '../components/Cpm/cpaHref';
import { DESTINATIONS, SUITE_MODULES, destinationFor, visibleDestinations } from './destinations';
import { resolveRedirect } from './redirects';
import { isoToZoneInput, siteDateTime, zoneAbbr, zoneInputToIso } from './siteTime';
import { DEFAULT_RANGE, pickZone, readRange } from './useCpaContext';

const q = (s: string) => new URLSearchParams(s);
const sorted = (url: string | null) => {
  const [path, query = ''] = (url ?? '').split('?');
  return `${path}?${[...q(query).entries()].map(([k, v]) => `${k}=${v}`).sort().join('&')}`;
};

describe('destinations', () => {
  it('lists 17 entries under six headings in the reference order', () => {
    expect(DESTINATIONS.map(d => d.label)).toEqual([
      'Overview', 'Performance', 'Loop Events', 'Loop Explorer', 'Historical', 'Investigation', 'Evidence Workbench',
      'Evidence Replay', 'Window Inspector', 'Calculations', 'System Response', 'Loop Registry', 'Gate Configuration',
      'Trend', 'Pipeline Health', 'Administration', 'Governance',
    ]);
    expect([...new Set(DESTINATIONS.map(d => d.group))]).toEqual([
      'Find problems', 'Check a loop', 'Understand the cause', 'Set up', 'Engineering', 'System',
    ]);
  });

  it('puts every page on the address the plant already uses', () => {
    expect(DESTINATIONS.map(d => d.path)).toEqual([
      '/cpm', '/cpm/performance', '/cpm/events', '/cpm/explorer', '/cpm/historical', '/cpm/investigation', '/cpm/evidence',
      '/cpm/replay', '/cpm/windows', '/cpm/calculations', '/cpm/response', '/cpm/registry', '/cpm/config', '/trend',
      '/cpm/pipeline', '/admin', '/cpm/governance',
    ]);
  });

  it.each([
    ['/cpm', 'overview'], ['/cpm/kpi', 'overview'], ['/cpm/performance', 'performance'], ['/cpm/events', 'events'],
    ['/cpm/explorer', 'explorer'], ['/cpm/historical', 'historical'], ['/cpm/investigation', 'investigation'],
    ['/cpm/evidence', 'workbench'], ['/cpm/replay', 'replay'], ['/cpm/windows', 'windows'], ['/cpm/calculations', 'calculations'],
    ['/cpm/response', 'response'], ['/cpm/registry', 'registry'], ['/cpm/config', 'config'], ['/trend', 'trend'],
    ['/cpm/pipeline', 'pipeline'], ['/cpm/governance', 'governance'], ['/admin', 'administration'], ['/admin/users', 'administration'],
  ])('%s belongs to %s', (path, id) => {
    expect(destinationFor(path)?.id).toBe(id);
  });

  it('hides an entry from a role without its permission', () => {
    const ids = visibleDestinations(p => p === 'analytics.view').map(d => d.id);
    expect(ids).not.toContain('pipeline');
    expect(ids).not.toContain('config');
    expect(ids).not.toContain('trend');
    expect(ids).not.toContain('administration');
    expect(ids).toContain('registry');
  });

  it('shows Trend to a holder of historian.view alone', () => {
    expect(visibleDestinations(p => p === 'historian.view').map(d => d.id)).toEqual(['trend']);
  });

  it('shows Governance to an auditor, whose Audit log now lives there', () => {
    expect(visibleDestinations(p => p === 'admin.audit.view').map(d => d.id)).toEqual(['administration', 'governance']);
  });

  it('keeps the suite order and deploys only CPA here', () => {
    expect(SUITE_MODULES.map(m => m.label)).toEqual(['Overview', 'Truss', 'CPA', 'Instrumental', 'PLC', 'Downtime', 'RCA']);
    expect(SUITE_MODULES.filter(m => m.deployed).map(m => m.id)).toEqual(['cpa']);
  });
});

describe('cpaHref', () => {
  const ctx = 'site=hdpe&area=s100&unit=u1&range=7d&window=24h&loop=FIC1';

  it('carries scope, range, window and loop to a loop page', () => {
    expect(sorted(cpaHref('/cpm/explorer', ctx))).toBe('/cpm/explorer?area=s100&loop=FIC1&range=7d&site=hdpe&unit=u1&window=24h');
  });

  it('leaves the loop behind on fleet pages', () => {
    expect(cpaHref('/cpm', ctx)).not.toContain('loop=');
    expect(cpaHref('/cpm/performance', ctx)).not.toContain('loop=');
  });

  it('leaves the window kind behind on Set up and System pages', () => {
    expect(cpaHref('/cpm/registry', ctx)).not.toContain('window=');
    expect(cpaHref('/cpm/pipeline', ctx)).not.toContain('window=');
  });

  it('turns one page\'s window kind into the next page\'s', () => {
    expect(cpaHref('/cpm/investigation', 'loop=A&window=24h')).toBe('/cpm/investigation?profile=24h&loop=A');
    expect(cpaHref('/cpm/historical', 'loop=A&window=24h')).toBe('/cpm/historical?kind=24h&loop=A');
    expect(cpaHref('/cpm/explorer', 'loop=A&profile=24h')).toBe('/cpm/explorer?window=24h&loop=A');
    expect(cpaHref('/cpm/explorer', 'loop=A&kind=24h')).toBe('/cpm/explorer?window=24h&loop=A');
  });

  it('keeps the choice through a page that shows none', () => {
    expect(cpaHref('/cpm/windows', 'loop=A&window=24h')).toBe('/cpm/windows?kind=24h&loop=A');
    expect(cpaHref('/cpm/explorer', 'loop=A&kind=24h')).toContain('window=24h');
  });

  it('does not carry an evaluated window END as a kind', () => {
    expect(cpaHref('/cpm/explorer', 'window=2026-11-04T12:00:00Z&loop=A')).toBe('/cpm/explorer?loop=A');
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
    expect(sorted(cpaHref('/cpm/explorer', 'loop=A&gate=G1&sort=x', { loop: 'B', tab: 'Signals' }))).toBe('/cpm/explorer?loop=B&tab=Signals');
  });

  it('accepts URLSearchParams', () => {
    expect(cpaHref('/cpm', q('site=a'))).toBe('/cpm?site=a');
  });
});

describe('old addresses (design 2026-11-06, section 3)', () => {
  it.each([
    ['/cpm/kpi', 'kpi=K&site=a', '/cpm?review=K&site=a'],
    ['/cpm/kpi', '', '/cpm?review=acceptable'],
    ['/admin/audit', '', '/cpm/governance'],
    ['/cpm/loop', 'loop=A', '/cpm/explorer?loop=A'],
    ['/cpm/loop', 'tab=summary&loop=A&window=24h', '/cpm/explorer?loop=A&window=24h'],
    ['/cpm/loop', 'tab=historical&loop=A&site=s', '/cpm/historical?loop=A&site=s'],
    ['/cpm/loop', 'tab=diagnosis&loop=A&profile=24h', '/cpm/investigation?loop=A&profile=24h'],
    ['/cpm/loop', 'tab=model&loop=A&event=E', '/cpm/response?event=E&loop=A'],
    ['/cpm/loop', 'tab=signals&loop=A', '/cpm/explorer?loop=A&tab=Signals'],
    ['/cpm/loop', 'tab=history&loop=A', '/cpm/explorer?loop=A&tab=History'],
    ['/cpm/loop', 'tab=calculations&loop=A', '/cpm/explorer?loop=A&tab=Calculations'],
    ['/cpm/evidence', 'tab=gates&loop=A', '/cpm/evidence?loop=A'],
    ['/cpm/evidence', 'tab=replay&loop=A&gate=G1', '/cpm/replay?gate=G1&loop=A'],
    ['/cpm/evidence', 'tab=windows&loop=A', '/cpm/windows?loop=A'],
    ['/cpm/evidence', 'tab=calculations&loop=A&metric=M', '/cpm/calculations?loop=A&metric=M'],
    ['/cpm/setup', '', '/cpm/registry'],
    ['/cpm/setup', 'tab=loops&loop=A', '/cpm/registry?loop=A'],
    ['/cpm/setup', 'tab=configuration&sub=Effective&loop=A', '/cpm/config?loop=A&tab=Effective'],
    ['/cpm/setup', 'tab=configuration&loop=A', '/cpm/config?loop=A'],
    ['/cpm/setup', 'tab=plant-model&search=b2', '/admin/plant-model?search=b2'],
    ['/cpm/setup', 'tab=data-sources', '/admin/data-sources'],
    ['/cpm/setup', 'tab=tag-aliases', '/admin/aliases'],
    ['/cpm/system', '', '/cpm/governance'],
    ['/cpm/system', 'tab=pipeline', '/cpm/pipeline'],
    ['/cpm/system', 'tab=governance', '/cpm/governance'],
    ['/cpm/system', 'tab=users', '/admin/users'],
    ['/cpm/system', 'tab=roles', '/admin/roles'],
    ['/cpm/system', 'tab=settings', '/admin/system'],
  ])('%s?%s lands on its own page', (path, search, to) => {
    expect(sorted(resolveRedirect(path, search))).toBe(sorted(to));
  });

  it.each([
    '/cpm', '/cpm/performance', '/cpm/events', '/cpm/explorer', '/cpm/historical', '/cpm/investigation', '/cpm/response',
    '/cpm/replay', '/cpm/windows', '/cpm/calculations', '/cpm/registry', '/cpm/config', '/cpm/pipeline', '/cpm/governance',
    '/trend', '/admin', '/admin/users', '/admin/roles', '/admin/system', '/admin/plant-model', '/admin/data-sources', '/admin/aliases',
  ])('keeps %s at its address', path => {
    expect(resolveRedirect(path, 'loop=A')).toBeNull();
  });

  it('leaves an Evidence Workbench address without a tab alone', () => {
    expect(resolveRedirect('/cpm/evidence', 'loop=A&methodRun=R&gate=G3')).toBeNull();
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
