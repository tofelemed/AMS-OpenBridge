/**
 * The data the existing charts hold, as panes. Pages migrate by calling one of these; each maps
 * shape only and computes no new figure. Lane segments need no adapter: `Segment` (historical) and
 * `LaneInterval` (evidence) already fit `TrendSegment`, and ordered x and y pairs (Trajectory, the
 * phase plane) are a series on a `{ kind: 'value' }` axis.
 */
import type { CpmTrendPoint } from '../../api/cpm/kpis';
import type { CpmSeries } from '../../components/Cpm/evidence/CpmChart';
import type { TrendPoint } from '../../components/Designer/trend/trendSupport';
import type { TrendAxis, TrendBand, TrendPane, TrendRole, TrendSeries } from './trendTypes';

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const firstOf = (point: CpmTrendPoint, ...keys: string[]) => {
  for (const key of keys) {
    const v = num(point[key]);
    if (v != null) return v;
  }
  return null;
};

export interface LoopPaneOptions {
  id?: string;
  pvUnit?: string | null;
  /** The declared output range. Without it the output axis does not say "%". */
  outputRange?: { min: number; max: number } | null;
  pvRange?: { min: number; max: number } | null;
  height?: number;
}

/** A historian trend (C1, C2, C3): PV and SP on the unit axis, OP and VP on the output axis, PV band where present. */
export function trendPointsToPane(points: CpmTrendPoint[], options: LoopPaneOptions = {}): TrendPane {
  const x = points.map(p => p.ts);
  const column = (...keys: string[]) => points.map(p => firstOf(p, ...keys));
  const present = (values: Array<number | null>) => values.some(v => v != null);
  const signal = (id: string, label: string, role: TrendRole, axis: string, y: Array<number | null>): TrendSeries =>
    ({ id, label, role, axis, x, y });

  const pv = column('pv_avg', 'pv');
  const sp = column('sp');
  const op = column('op_avg', 'op');
  const vp = column('vp_avg', 'vp');
  const lo = column('pv_min');
  const hi = column('pv_max');
  const hasVp = present(vp);

  const axes: TrendAxis[] = [
    { id: 'pv', label: 'PV / SP', unit: options.pvUnit, range: options.pvRange },
    { id: 'output', label: hasVp ? 'Controller output / VP' : 'Controller output', output: true, range: options.outputRange },
  ];
  const bands: TrendBand[] = present(lo) && present(hi)
    ? [{ id: 'pv-band', label: 'PV min to max per point', role: 'pv', axis: 'pv', x, lo, hi }]
    : [];
  return {
    id: options.id ?? 'signals',
    axes,
    bands,
    height: options.height,
    series: [
      signal('pv', 'PV', 'pv', 'pv', pv),
      signal('sp', 'SP', 'sp', 'pv', sp),
      signal('op', 'OP', 'op', 'output', op),
      ...(hasVp ? [signal('vp', 'VP', 'vp', 'output', vp)] : []),
    ],
  };
}

const PEN_ROLE: Record<CpmSeries['pen'], TrendRole> = {
  pv: 'pv', sp: 'sp', op: 'op', vp: 'vp', overlay: 'overlay', neutral: 'neutral', danger: 'danger',
};

/** Evidence series (C4, C8): one axis per unit group, in first-seen order, as the old wrapper drew them. */
export function cpmSeriesToPane(id: string, series: CpmSeries[], height?: number): TrendPane {
  const units: string[] = [];
  for (const s of series) if (!units.includes(s.unit)) units.push(s.unit);
  return {
    id,
    height,
    axes: units.map(unit => ({ id: unit, label: unit === '1' ? 'Ratio' : 'Value', unit: unit === '1' ? null : unit })),
    series: series.map(s => ({
      id: s.id,
      label: s.bandMeaning ? `${s.label}: ${s.bandMeaning}` : s.label,
      role: PEN_ROLE[s.pen],
      axis: s.unit,
      x: s.x,
      y: s.y,
      held: s.held,
      markers: s.markers,
      markerSymbol: s.symbol,
      dashed: s.dashed || !!s.bandMeaning,
      area: s.area,
      meta: s.meta,
    })),
  };
}

export interface TrendPen {
  id: string;
  label: string;
  /** Asset-catalog unit. Blank renders "unit not set"; a name guess is not passed in. */
  unit?: string | null;
  points: TrendPoint[];
  setpoint?: boolean;
  stepped?: boolean;
}

/** /trend pens (C11): a y axis per unit, setpoint pens dashed, palette order for the rest. */
export function pensToPane(id: string, pens: TrendPen[], height?: number): TrendPane {
  const units: string[] = [];
  const unitKey = (pen: TrendPen) => pen.unit?.trim() || '';
  for (const pen of pens) if (!units.includes(unitKey(pen))) units.push(unitKey(pen));
  let pen = 0;
  return {
    id,
    height,
    axes: units.map(unit => ({ id: unit || 'no-unit', label: 'Value', unit: unit || null })),
    series: pens.map(p => {
      const series: TrendSeries = {
        id: p.id,
        label: p.label,
        role: p.setpoint ? 'sp' : 'pen',
        axis: unitKey(p) || 'no-unit',
        x: p.points.map(point => point.ts),
        y: p.points.map(point => point.value),
        held: p.stepped,
      };
      if (!p.setpoint) series.penIndex = pen++;
      return series;
    }),
  };
}
