/**
 * CHG-093 (SME review 2 #10, #11): the Performance headline — figures the SERVER computed over every assessed loop in the
 * scope (the Overview KPIs' classification), never over a ranked page. Each figure says what it counts and what was left
 * out; error is compared across loops only as a share of the registered PV span. Pure (unit-tested).
 */
import type { FleetPerformance } from '../../api/cpm/fleetKpis';

export interface HeadlineTile { caption: string; value: string; sub: string; title: string }

const pct1 = (v: number) => `${(Math.round(v * 10) / 10).toFixed(1)} %`;

/** "of 120 assessed · 8 not assessable, 2 stale, 1 never evaluated" — the basis and the exclusions in one line. */
export function basisText(p: FleetPerformance, counted: number, extra: string[] = []): string {
  const out = [
    ...extra,
    p.excluded.notAssessable ? `${p.excluded.notAssessable} not assessable` : '',
    p.excluded.stale ? `${p.excluded.stale} stale` : '',
    p.excluded.neverEvaluated ? `${p.excluded.neverEvaluated} never evaluated` : '',
  ].filter(Boolean);
  return `${counted} of ${p.assessed} assessed loop(s)${out.length ? ` · excluded: ${out.join(', ')}` : ''}`;
}

export function headlineTiles(p: FleetPerformance): HeadlineTile[] {
  const g = p.goodError;
  const e = p.errorOfSpan;
  return [
    {
      caption: 'Good-error time',
      value: g.meanPct != null ? pct1(g.meanPct) : '—',
      sub: g.meanPct == null ? 'no assessed loops yet'
        : `mean · ${basisText(p, g.counted, g.notMeasured ? [`${g.notMeasured} not measured`] : [])}`,
      title: 'Mean share of the window with |PV − SP| inside the good band, over every assessed loop in this scope'
        + (g.medianPct != null ? ` (median ${pct1(g.medianPct)})` : ''),
    },
    {
      caption: 'Median error (% of span)',
      value: e.medianPct != null ? pct1(e.medianPct) : '—',
      sub: e.medianPct == null ? (p.assessed ? 'no loop with a registered PV span' : 'no assessed loops yet')
        : `MAE ÷ PV span · ${basisText(p, e.counted, [
          e.noSpan ? `${e.noSpan} without a PV span` : '', e.notMeasured ? `${e.notMeasured} not measured` : ''].filter(Boolean))}`,
      title: 'Mean absolute error of each loop divided by its registered PV range (pvMax − pvMin), median across loops. '
        + 'Loops in different engineering units are never averaged directly; a loop without a registered range is left out.',
    },
    {
      caption: 'Loops with periodic diagnosis',
      value: String(p.periodic.count),
      sub: `oscillation or valve nonlinearity, detected or stronger · ${basisText(p, p.periodic.of)}`,
      title: 'Assessed loops whose current diagnosis is an oscillation or final-element family at any band',
    },
  ];
}
