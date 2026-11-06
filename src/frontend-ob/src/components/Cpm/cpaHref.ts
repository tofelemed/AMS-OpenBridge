/**
 * URL builders for in-page CPA navigation (docs/cpa-ui-fix-plan.md §2).
 *
 * The URL is the only selection state: every builder carries the loop, and the
 * window-scoped ones add the evaluated window (`window=` = its END, ISO), the
 * gate and the kind. Pure functions, no router and no store, so a link can be
 * unit-tested and shared by every page that routes somewhere.
 *
 * Reader compatibility (do not "fix" without migrating the reader):
 * - Overview, Performance and Loop Explorer read the fused window KIND from
 *   `?window=` (e.g. `24h`), so `performanceHref` / `explorerHref` write `kind`
 *   under that name.
 * - Historical, Replay, Evidence Workbench and Calculations read it from `?kind=`,
 *   Investigation from `?profile=`.
 * - Historical, Investigation, Replay, the Window Inspector and Calculations read
 *   `?window=` as the evaluated window END.
 * - The Window Inspector reads its kind from `?profile=`.
 * - The Evidence Workbench opens an IMMUTABLE run via `evidence/selection.ts`
 *   (`workbenchHref`); `evidenceHref` here is the loop-level landing only.
 */
import type { ScopeKind } from '../../api/cpm/config';
import { DESTINATIONS } from '../../cpa/destinations';
import { chosenKind } from '../../cpa/tabKind';
import type { ConfigTab } from './config/EditorView';
import type { ExplorerTab } from './explorer/readinessCauses';
import type { RowFilter } from './gateStatus';
import type { LoopSort } from './performance/loopSort';

type Query = Record<string, string | number | null | undefined>;

const build = (path: string, query: Query): string => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v == null || v === '') continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `${path}?${s}` : path;
};

const RANGES = new Set(['8h', '24h', '7d', '30d', 'custom']);

/**
 * The link helper for the sidebar: carries plant scope, time range, and, where the page takes them, the
 * window kind under the name that page reads, and the loop. An evaluated window END stays behind: it
 * travels only through in-page links. `extra` wins over anything carried.
 */
export function cpaHref(path: string, current: URLSearchParams | string = '', extra: Query = {}): string {
  if (path === '/trend') return trendToolHref(current);
  const q = typeof current === 'string' ? new URLSearchParams(current) : current;
  const dest = DESTINATIONS.find(d => d.path === path);
  const carried: Query = { site: q.get('site'), area: q.get('area'), unit: q.get('unit') };
  const from = q.get('from');
  const to = q.get('to');
  const range = q.get('range');
  if (from && to && (range === 'custom' || range == null)) Object.assign(carried, { range: 'custom', from, to });
  else if (range && range !== 'custom' && RANGES.has(range)) carried.range = range;
  const kind = chosenKind(q);
  if (dest?.carriesWindow && kind) carried[dest.kindParam ?? 'kind'] = kind;
  if (dest?.carriesLoop) carried.loop = q.get('loop');
  return build(path, { ...carried, ...extra });
}

/** Tag trend is a tool, not a destination: it keeps the plant scope for the way back, and nothing else. */
export function trendToolHref(current: URLSearchParams | string = ''): string {
  const q = typeof current === 'string' ? new URLSearchParams(current) : current;
  return build('/trend', { site: q.get('site'), area: q.get('area'), unit: q.get('unit') });
}

/** The loop hub. `gate` pre-selects a gate on the Summary strip; `kind` is the fused window kind the strip evaluates (`?window=`, as on Performance). */
export const explorerHref = (loop: string, opts: {
  tab?: ExplorerTab; gate?: string | null; kind?: string | null; from?: string | null; to?: string | null;
} = {}) =>
  build('/cpm/explorer', { loop, tab: opts.tab, gate: opts.gate, window: opts.kind, from: opts.from, to: opts.to });

/** The fleet matrix. `gate` opens that cell's evidence panel; `kind` is the fused window kind. */
export const performanceHref = (
  opts: { loop?: string | null; gate?: string | null; kind?: string | null; rows?: RowFilter; sort?: LoopSort } = {},
) => build('/cpm/performance', { loop: opts.loop, gate: opts.gate, window: opts.kind, rows: opts.rows, sort: opts.sort });

/** Loop Events. `event` selects an episode; `loop` narrows the list (honoured from Phase 6). */
export const eventsHref = (
  opts: { loop?: string | null; event?: number | string | null; filter?: string | null } = {},
) => build('/cpm/events', { loop: opts.loop, event: opts.event, filter: opts.filter });

/** Evidence Replay. `window` is the evaluated window END (ISO); `kind` its size. */
export const replayHref = (
  loop: string, opts: { gate?: string | null; window?: string | null; kind?: string | null } = {},
) => build('/cpm/replay', { loop, gate: opts.gate, window: opts.window, kind: opts.kind });

/** Window Inspector. `profile` is the window kind it lists; `window` an evaluated END to open. */
export const windowsHref = (
  loop: string, opts: { profile?: string | null; window?: string | null } = {},
) => build('/cpm/windows', { loop, profile: opts.profile, window: opts.window });

/** Evidence Workbench, loop-level landing (its newest window with run identity); `kind` picks the tier. */
export const evidenceHref = (loop: string, opts: { kind?: string | null; gate?: string | null } = {}) =>
  build('/cpm/evidence', { loop, kind: opts.kind, gate: opts.gate });

/** System Response. `event` is a response event id (never a loop-event frame id). */
export const responseHref = (loop: string, opts: { event?: string | null } = {}) =>
  build('/cpm/response', { loop, event: opts.event });

/** Investigation on one loop. `kind` is the fused window kind it reads as `?profile=`; `window` an evaluated END. */
export const investigationHref = (loop: string, opts: { kind?: string | null; window?: string | null; gate?: string | null } = {}) =>
  build('/cpm/investigation', { loop, profile: opts.kind, window: opts.window, gate: opts.gate });

/** Historical on one loop; `from` / `to` (ISO) carry the period being looked at (CHG-048), else its default range. */
export const historicalHref = (loop: string, opts: {
  from?: string | null; to?: string | null;
  /** CHG-097 (SME review 2 #26): the evaluated window to shade (its end), the signals that matter, and what was clicked. */
  window?: string | null; signals?: string | null; focus?: string | null;
  /** Historical's window kind (?kind=12h|24h) — the selected window end is looked up among windows of this kind. */
  kind?: string | null;
} = {}) =>
  build('/cpm/historical', { loop, from: opts.from, to: opts.to, kind: opts.kind, window: opts.window, signals: opts.signals, focus: opts.focus });

/** The standalone calculations catalogue for one loop. */
export const calculationsHref = (loop: string, opts: { metric?: string | null; kind?: string | null; window?: string | null } = {}) =>
  // CHG-092 (SME review 2 #9): a KPI's proof opens the matching metric (CPLM id) on the matching fused window
  build('/cpm/calculations', { loop, kind: opts.kind, window: opts.window, metric: opts.metric });

/** Trend on one loop's signals. `roles` limits the pens; `from` / `to` (ISO) pin the period. */
export const trendHref = (loop: string, opts: { roles?: string[]; from?: string | null; to?: string | null } = {}) =>
  build('/trend', { loop, roles: opts.roles?.join(','), from: opts.from, to: opts.to });

/** Loop Registry: its list, or one loop's detail. */
export const registryHref = (loop?: string | null) => build('/cpm/registry', { loop });

/** Links from other pages keep their shape; a bundle opens the editor, a LOOP scope names the loop. */
export const configHref = (q: {
  site?: string; scope?: ScopeKind; ref?: string; bundle?: string; gate?: string; tab?: ConfigTab; loop?: string; view?: string;
} = {}) => {
  const loop = q.loop ?? (q.scope === 'LOOP' ? q.ref : undefined);
  return build('/cpm/config', {
    loop,
    view: q.view ?? (q.bundle ? 'editor' : loop ? 'effective' : undefined),
    bundle: q.bundle,
    gate: q.gate,
    tab: q.tab === 'properties' ? undefined : q.tab,
  });
};

type AdminSection = 'users' | 'roles' | 'data-sources' | 'plant-model' | 'aliases' | 'system';

/** One section of Administration. */
export const adminHref = (section: AdminSection) => `/admin/${section}`;

/** Governance holds the one audit trail. */
export const governanceHref = () => '/cpm/governance';

/** Pipeline Health has no loop scope: it explains freshness for the whole engine. */
export const pipelineHref = () => '/cpm/pipeline';

/** CHG-089: a plant scope plus the fused window kind the Overview and the KPI page count on (`?window=`). */
type KpiLinkScope = { site?: string; area?: string; unit?: string; windowKind?: string };

/** CHG-082: a KPI's drill-down — the loops behind one Overview figure, in the same plant scope and window (`reason` narrows not-assessable). */
export const kpiHref = (kpi: string, scope: KpiLinkScope = {}, reason?: string | null) =>
  build('/cpm', { review: kpi, reason, site: scope.site, area: scope.area, unit: scope.unit, window: scope.windowKind });

/** CHG-085: back to the Overview in the same plant scope and window. */
export const overviewHref = (scope: KpiLinkScope = {}) =>
  build('/cpm', { site: scope.site, area: scope.area, unit: scope.unit, window: scope.windowKind });
