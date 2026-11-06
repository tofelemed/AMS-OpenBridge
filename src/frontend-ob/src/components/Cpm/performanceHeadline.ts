/**
 * CHG-093 (SME review 2 #10, #11): the Performance headline — figures the SERVER computed over every assessed loop in the
 * scope (the Overview KPIs' classification), never over a ranked page. Each figure says what it counts and what was left
 * out; error is compared across loops only as a share of the registered PV span. Pure (unit-tested).
 *
 * Task 7: the tile carries the figure and a short line. The basis and the long sentences are the dialog's: `basisLines`
 * and `title`.
 */
import type { FleetKpiKey, FleetPerformance } from '../../api/cpm/fleetKpis';
import type { CpmFleetSummary } from '../../api/cpmApi';
import { diagnosticCapabilityCopy } from './overview/capabilityCopy';

export interface HeadlineTile {
  key: 'good-error' | 'median-error' | 'periodic';
  caption: string;
  value: string;
  /** One short line on the tile. */
  sub: string;
  /** What the figure counts and how: the dialog's explanation. */
  title: string;
  /** The drill-down that lists the loops behind the figure. */
  drill: FleetKpiKey;
  /** Assessed loops that contribute to the figure. */
  counted: number;
  /** Assessed loops left out of this figure, with the reason. */
  notCounted: string[];
}

export interface CapabilityTile { value: string; sub: string; title: string; drill: FleetKpiKey; tone: 'warn' | 'muted' }

const pct1 = (v: number) => `${(Math.round(v * 10) / 10).toFixed(1)} %`;

/** "72 of 72 assessed loops contribute", what was counted out of the figure, and the loops that were not assessed at all. */
export function basisLines(p: FleetPerformance, counted: number, notCounted: string[] = []): string[] {
  const out = [
    p.excluded.notAssessable ? `${p.excluded.notAssessable} not assessable` : '',
    p.excluded.stale ? `${p.excluded.stale} stale` : '',
    p.excluded.neverEvaluated ? `${p.excluded.neverEvaluated} never evaluated` : '',
  ].filter(Boolean);
  return [
    `${counted} of ${p.assessed} assessed loops contribute`,
    notCounted.length ? `Not counted: ${notCounted.join(', ')}` : '',
    out.length ? `Not assessed: ${out.join(', ')}` : '',
  ].filter(Boolean);
}

export function headlineTiles(p: FleetPerformance): HeadlineTile[] {
  const g = p.goodError;
  const e = p.errorOfSpan;
  const none = p.assessed ? null : 'no assessed loop';
  return [
    {
      key: 'good-error', caption: 'Good-error time',
      value: g.meanPct != null ? pct1(g.meanPct) : '—',
      // CHG-098 lab pass: with nothing assessed, say why (e.g. every result stale) instead of a bare "yet"
      sub: g.meanPct == null ? (none ?? 'not measured') : `Mean · ${g.counted} assessed loops`,
      title: 'Mean share of the window with |PV − SP| inside the good band, over every assessed loop in this scope'
        + (g.medianPct != null ? ` (median ${pct1(g.medianPct)})` : '') + '.',
      drill: 'assessed', counted: g.counted,
      notCounted: g.notMeasured ? [`${g.notMeasured} not measured`] : [],
    },
    {
      key: 'median-error', caption: 'Median error',
      value: e.medianPct != null ? pct1(e.medianPct) : '—',
      sub: e.medianPct == null ? (none ?? 'no loop with a registered PV span') : `MAE ÷ PV span · ${e.counted} assessed`,
      title: 'Mean absolute error of each loop divided by its registered PV range (pvMax − pvMin), median across loops. '
        + 'Loops in different engineering units are never averaged directly; a loop without a registered range is left out.',
      drill: 'assessed', counted: e.counted,
      notCounted: [e.noSpan ? `${e.noSpan} without a PV span` : '', e.notMeasured ? `${e.notMeasured} not measured` : ''].filter(Boolean),
    },
    {
      key: 'periodic', caption: 'Periodic diagnosis',
      value: String(p.periodic.count),
      sub: p.periodic.of ? 'Oscillation / valve nonlinearity' : 'no assessed loop',
      title: 'Assessed loops whose current diagnosis is an oscillation or final-element (valve) family at detected or any stronger band.',
      drill: 'periodic', counted: p.periodic.of, notCounted: [],
    },
  ];
}

/** The fourth tile: valve loops that can confirm a fault from valve position, as a short count; the sentence is the dialog's. */
export function capabilityTile(fleetTotal: number | null, capability: CpmFleetSummary['capability'] | undefined): CapabilityTile {
  const capped = capability?.loopsCappedByMissingVp ?? null;
  const copy = diagnosticCapabilityCopy(fleetTotal, capped, capability);
  const [withVp, valves] = copy.value.split('/').map(Number);
  const sub = copy.value === '—' ? 'unavailable'
    : capped ? 'Expected VP not mapped'
      : withVp < valves ? `${valves - withVp} without a positioner` : 'all valve loops mapped';
  return { value: copy.value, sub, title: copy.sub, drill: 'capability', tone: capped ? 'warn' : 'muted' };
}
