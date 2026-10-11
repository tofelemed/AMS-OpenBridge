/**
 * CHG-082 / CHG-085: the Overview's operating picture, from cplm-api `GET /fleet/kpis` (rules, formulas and evidence:
 * kpi_calculation_logic/KPI-LOGIC.md).
 *
 * - Performance: seven compact KPI cards — icon, change since 24 h ago, the count, its label and its share of a NAMED
 *   denominator; each card opens the drill-down listing exactly those loops with the value that put each one there.
 * - CHG-089: counted on the page's fused window (12h default, 24h on request); every link carries it.
 * - Coverage: the loops that could not be judged (not assessable / stale / never evaluated) beside one bar that places
 *   every monitored loop in exactly one state, with a legend that links to each state's list.
 */
import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import type { CpmFleetScope } from '../../../api/cpmApi';
import type { FleetKpiFigure, FleetKpis, FleetKpiScope } from '../../../api/cpm/fleetKpis';
import { EmptyState, PanelHead, QueryError, fmtDateTime } from '../shared';
import { kpiHref } from '../cpaHref';
import { useFleetKpis } from '../kpi/useFleetKpis';
import { KpiCard } from '../kpi/KpiCard';
import { KPI_META, kpiDelta } from '../kpi/kpiMeta';
import { KPI_GROUPS, basisText, kpiTone, pct, reasonsText, stateSegments } from '../kpi/fleetKpiView';

const Card: React.FC<{ f: FleetKpiFigure; k: FleetKpis; scope?: FleetKpiScope; sub?: React.ReactNode }> = ({ f, k, scope, sub }) => {
  const meta = KPI_META[f.key];
  if (!meta) return null;
  return (
    <KpiCard Icon={meta.Icon} value={f.count} label={f.label} tone={kpiTone(f)} delta={kpiDelta(f, k)}
      title={`${f.rule}. Open to see every loop and why.`} to={kpiHref(f.key, scope)}
      sub={sub ?? <>{pct(f.count, f.denominator)} % of {f.denominator} {f.denominatorLabel}</>} />
  );
};

export const OperatingPicture: React.FC<{ scope?: CpmFleetScope; windowKind?: string }> = ({ scope: plant, windowKind }) => {
  const scope: FleetKpiScope = { ...plant, windowKind };
  const q = useFleetKpis(scope);
  const k = q.data;
  const figures = new Map((k?.kpis ?? []).map(f => [f.key, f]));
  const pick = (keys: readonly string[]) => keys.map(key => figures.get(key as FleetKpiFigure['key'])).filter((f): f is FleetKpiFigure => !!f);
  const performance = pick([...KPI_GROUPS[0].keys, ...KPI_GROUPS[1].keys]);
  const coverage = pick(KPI_GROUPS[2].keys);
  const segments = k ? stateSegments(k) : [];

  return (
    <section className="cpm-surface cpm-op" aria-label="Operating picture">
      <PanelHead eyebrow={`Operating picture · latest ${k?.basis.windowKind ?? windowKind ?? '12h'} results`}
        title={k ? `${k.monitored} loop(s) monitored` : 'Loading…'}
        right={k ? <span className="cpm-op__muted" title={basisText(k)}>updated {fmtDateTime(k.computedAt)} · change vs 24 h ago</span> : undefined} />
      {q.isError && <QueryError title="Operating picture unavailable" error={q.error} retry={() => void q.refetch()} />}
      {k && k.monitored === 0 && <EmptyState title="No monitored loops" copy="No loop in this scope has monitoring enabled." />}
      {k && k.monitored > 0 && (
        <>
          <div className="cpm-kpicards cpm-kpicards--7" role="list" aria-label="Loop performance KPIs">
            {performance.map(f => <div role="listitem" key={f.key}><Card f={f} k={k} scope={scope} /></div>)}
          </div>

          <div className="cpm-op__coverage">
            <div className="cpm-kpicards cpm-kpicards--3" role="list" aria-label="Loops that could not be judged">
              {coverage.map(f => (
                <div role="listitem" key={f.key}>
                  <Card f={f} k={k} scope={scope}
                    sub={f.key === 'not-assessable' && f.count > 0 ? reasonsText(k) : `${pct(f.count, f.denominator)} % of monitored`} />
                </div>
              ))}
            </div>
            <div className="cpm-op__statebox">
              <span className="cpm-kpicard__label">Every monitored loop, one state each</span>
              <div className="cpm-op__bar" role="img"
                aria-label={`Monitored loops by state: ${segments.map(s => `${s.label} ${s.count}`).join(', ')}`}>
                {segments.map(s => (
                  <span key={s.key} className={`cpm-op__seg cpm-op__seg--${s.key}`} style={{ flexGrow: s.count }}
                    title={`${s.label}: ${s.count} of ${k.monitored} (${pct(s.count, k.monitored)} %)`} />
                ))}
              </div>
              <ul className="cpm-op__legend">
                {segments.map(s => (
                  <li key={s.key}>
                    <span className={`cpm-op__swatch cpm-op__seg--${s.key}`} aria-hidden />
                    <RouterLink className="cpm-link" to={kpiHref(s.drill, scope)} title={`List these ${s.count} loop(s)`}>
                      {s.label} <strong>{s.count}</strong>
                    </RouterLink>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="cpm-op__basis">{basisText(k)}. Each card opens the loops behind it.</p>
        </>
      )}
    </section>
  );
};

export default OperatingPicture;
