/**
 * Addresses of the Gate Configuration sub-pages, and the mapper that sends an old
 * `/cpm/config?loop=&view=&bundle=&tab=` link to its new page. Pure functions, no router.
 */
import type { BundleTab } from './lifecycle';

export const CONFIG_BASE = '/cpm/config';

export type ChangeStep = 'edit' | 'check' | 'try' | 'approve' | 'deploy';

export const STEP_OF_TAB: Record<BundleTab, ChangeStep> = {
  properties: 'edit', diff: 'check', shadow: 'try', approval: 'approve', deployments: 'deploy',
};

const enc = encodeURIComponent;

export const loopPath = (loopId: string) => `${CONFIG_BASE}/loops/${enc(loopId)}`;
export const typePath = (profileId: string) => `${CONFIG_BASE}/types/${enc(profileId)}`;
export const plantPath = (site: string) => `${CONFIG_BASE}/plant/${enc(site)}`;
export const regionsPath = () => `${CONFIG_BASE}/regions`;
export const changePath = (bundleId: string, step?: ChangeStep) =>
  `${CONFIG_BASE}/changes/${enc(bundleId)}${step ? `?step=${step}` : ''}`;

/** Appends one query pair when it has a value. */
const withParam = (path: string, key: string, value?: string | null) =>
  value ? `${path}?${key}=${enc(value)}` : path;

/** The regions page showing one saved batch. */
export const regionsBatchPath = (batchId: string) => withParam(regionsPath(), 'batch', batchId);

/** The header's plant scope (plantScope.tsx): the only query a journey link carries from page to page. */
const SCOPE_KEYS = ['site', 'area', 'unit'] as const;

/**
 * `path` with the header scope of `search` (site / area / unit, nothing else) in front of the path's own query, so a link inside
 * Gate Configuration keeps the plant chosen in the header, as registryUrl.ts does for the Loop Registry. A scope key the path
 * names itself keeps the path's value. Without a scope the path is returned as it is.
 */
export function scoped(path: string, search: URLSearchParams | string): string {
  const from = new URLSearchParams(search);
  const at = path.indexOf('?');
  const base = at < 0 ? path : path.slice(0, at);
  const own = at < 0 ? '' : path.slice(at + 1);
  const ownKeys = new URLSearchParams(own);
  const scope = new URLSearchParams();
  for (const k of SCOPE_KEYS) { const v = from.get(k); if (v && !ownKeys.has(k)) scope.set(k, v); }
  const query = [scope.toString(), own].filter(Boolean).join('&');
  return query ? `${base}?${query}` : base;
}

/**
 * The new address of an old Gate Configuration link, or null when the query names nothing. A bare `?loop=` is not an old link:
 * it is the loop the app carries from page to page (useContextCarry), so the start page shows with that loop in its search.
 * Only an old-only key beside it (`view`, `gate`) makes it an old loop link.
 */
export function legacyTarget(search: URLSearchParams): string | null {
  const bundle = search.get('bundle');
  const loop = search.get('loop');
  const view = search.get('view');
  const tab = search.get('tab');
  const gate = search.get('gate');
  if (bundle) return changePath(bundle, tab && Object.prototype.hasOwnProperty.call(STEP_OF_TAB, tab) ? STEP_OF_TAB[tab as BundleTab] : undefined);
  if (view === 'per-loop') return withParam(regionsPath(), 'batch', search.get('batch'));
  if (loop && view === 'bundles') return `${loopPath(loop)}?tab=versions`;
  if (loop && (view === 'effective' || (!view && gate))) return withParam(loopPath(loop), 'gate', gate);
  return null;
}

/** A loop's page that also names the loop as the carried context, so the next page follows the loop just chosen. */
export const loopContextPath = (loopId: string) => `${loopPath(loopId)}?loop=${enc(loopId)}`;
