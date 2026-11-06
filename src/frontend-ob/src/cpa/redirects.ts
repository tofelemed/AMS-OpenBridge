/**
 * Old CPA addresses and where they go. Every page has its own address again (design 2026-11-06), so
 * this is short: the KPI page, the audit log, and the tab hosts that only ever ran on the lab.
 * Unlisted parameters are carried unchanged. `check-redirects.mjs` covers every row.
 */
type Rewrite = (q: URLSearchParams) => { path: string; query: URLSearchParams };

export interface RedirectRow {
  from: string;
  /** Applies only when this holds. Without it the row always applies. */
  when?: (q: URLSearchParams) => boolean;
  to: Rewrite;
}

const with_ = (q: URLSearchParams, set: Record<string, string | null>) => {
  const next = new URLSearchParams(q);
  for (const [k, v] of Object.entries(set)) {
    if (v == null) next.delete(k); else next.set(k, v);
  }
  return next;
};

/** Where one tab of an old host page went. `tab` is the page's own tab, if it opens on one. */
interface TabTarget { path: string; tab?: string; subIsTab?: boolean }

const fromTab = (tabs: Readonly<Record<string, TabTarget>>, fallback: TabTarget): Rewrite => q => {
  const target = tabs[q.get('tab') ?? ''] ?? fallback;
  const tab = target.subIsTab ? q.get('sub') : target.tab ?? null;
  return { path: target.path, query: with_(q, { tab, sub: null }) };
};

const EXPLORER: TabTarget = { path: '/cpm/explorer' };
const WORKBENCH: TabTarget = { path: '/cpm/evidence' };
const REGISTRY: TabTarget = { path: '/cpm/registry' };
const GOVERNANCE: TabTarget = { path: '/cpm/governance' };

export const REDIRECTS: readonly RedirectRow[] = [
  { from: '/cpm/kpi', to: q => ({ path: '/cpm', query: with_(q, { kpi: null, review: q.get('kpi') ?? 'acceptable' }) }) },
  { from: '/admin/audit', to: q => ({ path: '/cpm/governance', query: q }) },
  {
    from: '/cpm/loop',
    to: fromTab({
      summary: EXPLORER,
      signals: { ...EXPLORER, tab: 'Signals' },
      history: { ...EXPLORER, tab: 'History' },
      calculations: { ...EXPLORER, tab: 'Calculations' },
      historical: { path: '/cpm/historical' },
      diagnosis: { path: '/cpm/investigation' },
      model: { path: '/cpm/response' },
    }, EXPLORER),
  },
  {
    from: '/cpm/evidence',
    when: q => q.has('tab'),
    to: fromTab({
      gates: WORKBENCH,
      replay: { path: '/cpm/replay' },
      windows: { path: '/cpm/windows' },
      calculations: { path: '/cpm/calculations' },
    }, WORKBENCH),
  },
  {
    from: '/cpm/setup',
    to: fromTab({
      loops: REGISTRY,
      configuration: { path: '/cpm/config', subIsTab: true },
      'plant-model': { path: '/admin/plant-model' },
      'data-sources': { path: '/admin/data-sources' },
      'tag-aliases': { path: '/admin/aliases' },
    }, REGISTRY),
  },
  {
    // Governance when no tab is named: it opens for every role that could open System.
    from: '/cpm/system',
    to: fromTab({
      pipeline: { path: '/cpm/pipeline' },
      governance: GOVERNANCE,
      users: { path: '/admin/users' },
      roles: { path: '/admin/roles' },
      settings: { path: '/admin/system' },
    }, GOVERNANCE),
  },
];

/** Where an old URL goes, or null for a URL that does not move. */
export function resolveRedirect(pathname: string, search: string): string | null {
  const q = new URLSearchParams(search);
  const row = REDIRECTS.find(r => r.from === pathname && (r.when?.(q) ?? true));
  if (!row) return null;
  const { path, query } = row.to(q);
  const s = query.toString();
  return s ? `${path}?${s}` : path;
}
