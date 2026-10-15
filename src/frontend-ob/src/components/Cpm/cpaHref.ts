/**
 * URL builders for in-page CPA navigation (docs/cpa-ui-fix-plan.md §2).
 *
 * The URL is the only selection state: every builder carries the loop, and the
 * window-scoped ones add the evaluated window (`window=` = its END, ISO), the
 * gate and the kind. Pure functions, no router and no store, so a link can be
 * unit-tested and shared by every page that routes somewhere.
 *
 * Reader compatibility (do not "fix" without migrating the reader):
 * - Performance and the Explorer Summary read the fused window KIND from
 *   `?window=` (e.g. `24h`), so `performanceHref` / `explorerHref` write `kind`
 *   under that name.
 * - Historical / Replay read `?window=` as the evaluated window END.
 * - The Window Inspector reads its kind from `?profile=`.
 * - The Evidence Workbench opens an IMMUTABLE run via `evidence/selection.ts`
 *   (`workbenchHref`); `evidenceHref` here is the loop-level landing only.
 */
import type { ExplorerTab } from './explorer/readinessCauses';
import type { RowFilter } from './gateStatus';

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

/** The loop hub. `gate` pre-selects a gate on the Summary strip; `kind` is the fused window kind the strip evaluates (`?window=`, as on Performance). */
export const explorerHref = (loop: string, opts: { tab?: ExplorerTab; gate?: string | null; kind?: string | null } = {}) =>
  build('/cpm/explorer', { loop, tab: opts.tab, gate: opts.gate, window: opts.kind });

/** The fleet matrix. `gate` opens that cell's evidence panel; `kind` is the fused window kind. */
export const performanceHref = (
  opts: { loop?: string | null; gate?: string | null; kind?: string | null; rows?: RowFilter } = {},
) => build('/cpm/performance', { loop: opts.loop, gate: opts.gate, window: opts.kind, rows: opts.rows });

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

/** Investigation on one loop. `kind` is the fused window kind it reads as `?profile=` (12h / 24h). */
export const investigationHref = (loop: string, opts: { kind?: string | null } = {}) =>
  build('/cpm/investigation', { loop, profile: opts.kind });

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
export const calculationsHref = (loop: string, opts: { metric?: string | null; kind?: string | null } = {}) =>
  // CHG-092 (SME review 2 #9): a KPI's proof opens the matching metric (CPLM id) on the matching fused window
  build('/cpm/calculations', { loop, window: opts.kind, metric: opts.metric });

/** Pipeline Health has no loop scope: it explains freshness for the whole engine. */
export const pipelineHref = () => '/cpm/pipeline';

/** CHG-089: a plant scope plus the fused window kind the Overview and the KPI page count on (`?window=`). */
type KpiLinkScope = { site?: string; area?: string; unit?: string; windowKind?: string };

/** CHG-082: a KPI's drill-down — the loops behind one Overview figure, in the same plant scope and window (`reason` narrows not-assessable). */
export const kpiHref = (kpi: string, scope: KpiLinkScope = {}, reason?: string | null) =>
  build('/cpm/kpi', { kpi, reason, site: scope.site, area: scope.area, unit: scope.unit, window: scope.windowKind });

/** CHG-085: back to the Overview in the same plant scope and window. */
export const overviewHref = (scope: KpiLinkScope = {}) =>
  build('/cpm', { site: scope.site, area: scope.area, unit: scope.unit, window: scope.windowKind });
