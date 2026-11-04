/**
 * SPEC §2.3: every old CPA URL and where it goes. Unlisted parameters are carried unchanged.
 * A row turns on in the phase that ships its destination (`phase` <= SHIPPED_PHASE), so an old
 * page stays reachable until its replacement exists. `check-redirects.mjs` covers every row.
 */

/** The last phase that shipped destinations. Raise it when a phase replaces its pages. */
export const SHIPPED_PHASE = 2;

type Rewrite = (q: URLSearchParams) => { path: string; query: URLSearchParams };

export interface RedirectRow {
  from: string;
  phase: number;
  to: Rewrite;
}

const with_ = (q: URLSearchParams, set: Record<string, string | null>) => {
  const next = new URLSearchParams(q);
  for (const [k, v] of Object.entries(set)) {
    if (v == null) next.delete(k); else next.set(k, v);
  }
  return next;
};

/** Historical's `window` is an evaluated END; the global `window` is a kind (SPEC §2.2). */
const isKind = (v: string | null) => v === '12h' || v === '24h';

const explorer: Rewrite = q => {
  const tab = q.get('tab');
  if (tab === 'Calculations') return { path: '/cpm/evidence', query: with_(q, { tab: 'calculations' }) };
  if (tab === 'History') return { path: '/cpm/loop', query: with_(q, { tab: 'diagnosis', section: 'episodes' }) };
  if (tab === 'Relationships') return { path: '/cpm/loop', query: with_(q, { tab: 'signals', section: 'relationships' }) };
  if (tab === 'Signals') return { path: '/cpm/loop', query: with_(q, { tab: 'signals' }) };
  return { path: '/cpm/loop', query: with_(q, { tab: 'performance' }) };
};

const historical: Rewrite = q => {
  const window = q.get('window');
  const end = window && !isKind(window) ? window : null;
  const custom = q.get('from') && q.get('to') ? 'custom' : q.get('range');
  return {
    path: '/cpm/loop',
    query: with_(q, { tab: 'performance', range: custom, window: end ? null : window, windowId: end }),
  };
};

export const REDIRECTS: readonly RedirectRow[] = [
  { from: '/cpm/kpi', phase: 4, to: q => ({ path: '/cpm', query: with_(q, { kpi: null, review: q.get('kpi') }) }) },
  { from: '/cpm/explorer', phase: 5, to: explorer },
  { from: '/cpm/historical', phase: 5, to: historical },
  { from: '/cpm/investigation', phase: 5, to: q => ({ path: '/cpm/loop', query: with_(q, { tab: 'diagnosis' }) }) },
  { from: '/cpm/response', phase: 5, to: q => ({ path: '/cpm/loop', query: with_(q, { tab: 'model' }) }) },
  { from: '/cpm/replay', phase: 6, to: q => ({ path: '/cpm/evidence', query: with_(q, { tab: 'replay' }) }) },
  { from: '/cpm/windows', phase: 6, to: q => ({ path: '/cpm/evidence', query: with_(q, { tab: 'windows' }) }) },
  { from: '/cpm/calculations', phase: 6, to: q => ({ path: '/cpm/evidence', query: with_(q, { tab: 'calculations' }) }) },
  { from: '/cpm/registry', phase: 6, to: q => ({ path: '/cpm/setup', query: with_(q, { tab: 'loops' }) }) },
  {
    from: '/cpm/config', phase: 6,
    to: q => ({ path: '/cpm/setup', query: with_(q, { tab: 'configuration', sub: q.get('tab') }) }),
  },
  { from: '/cpm/pipeline', phase: 6, to: q => ({ path: '/cpm/system', query: with_(q, { tab: 'pipeline' }) }) },
  { from: '/cpm/governance', phase: 6, to: q => ({ path: '/cpm/system', query: with_(q, { tab: 'governance' }) }) },
];

const compose = (path: string, query: URLSearchParams) => {
  const s = query.toString();
  return s ? `${path}?${s}` : path;
};

/** Where an old URL goes, whatever phase its row ships in. Null for a URL that does not move. */
export function rewriteLegacy(pathname: string, search: string): string | null {
  const q = new URLSearchParams(search);
  // The one old URL that keeps its path: Evidence gains a default tab.
  if (pathname === '/cpm/evidence') return q.get('tab') ? null : compose(pathname, with_(q, { tab: 'gates' }));
  const row = REDIRECTS.find(r => r.from === pathname);
  if (!row) return null;
  const { path, query } = row.to(q);
  return compose(path, query);
}

/** The redirect in force now. */
export function resolveRedirect(pathname: string, search: string, shipped = SHIPPED_PHASE): string | null {
  const phase = pathname === '/cpm/evidence' ? 6 : REDIRECTS.find(r => r.from === pathname)?.phase;
  if (phase == null || phase > shipped) return null;
  return rewriteLegacy(pathname, search);
}
