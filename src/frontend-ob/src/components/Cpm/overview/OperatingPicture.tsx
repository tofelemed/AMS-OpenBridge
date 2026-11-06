/**
 * CHG-082 / CHG-085: the Overview's operating picture, from cplm-api `GET /fleet/kpis` (rules, formulas and evidence:
 * kpi_calculation_logic/KPI-LOGIC.md).
 *
 * - Ten KPI cards, five to a row (CHG-119, CHG-127): label, coloured icon and the count; each card opens the drill-down
 *   listing exactly those loops with the value behind each one. Its share of a NAMED denominator, the change since 24 h ago
 *   and the rule appear on hover.
 * - CHG-089: counted on the page's fused window (12h default, 24h on request); every link carries it.
 * - Under them, the bar that places every monitored loop in exactly one state (StateBar).
 */
import React from 'react';
import type { CpmFleetScope } from '../../../api/cpmApi';
import type { FleetKpiFigure, FleetKpis, FleetKpiScope } from '../../../api/cpm/fleetKpis';
import { EmptyState, PanelHead, QueryError, fmtDateTime } from '../shared';
import { Toggletip } from '../../../ui/Toggletip';
import { kpiHref } from '../cpaHref';
import { useFleetKpis } from '../kpi/useFleetKpis';
import { KpiCard } from '../kpi/KpiCard';
import { KPI_META, kpiDelta, kpiIconTone } from '../kpi/kpiMeta';
import { KPI_GROUPS, basisText, kpiTone, pct, reasonsText } from '../kpi/fleetKpiView';
import { StateBar } from './StateBar';

const Card: React.FC<{ f: FleetKpiFigure; k: FleetKpis; scope?: FleetKpiScope; sub?: React.ReactNode }> = ({ f, k, scope, sub }) => {
  const meta = KPI_META[f.key];
  if (!meta) return null;
  return (
    <KpiCard headed Icon={meta.Icon} value={f.count} label={f.label} tone={kpiTone(f)} iconTone={kpiIconTone(f)} delta={kpiDelta(f, k)}
      title={`${f.rule}.`} to={kpiHref(f.key, scope)}
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

  return (
    <section className="cpm-surface cpm-op" aria-label="Operating picture">
      <PanelHead eyebrow="Operating picture"
        title={k ? `${k.monitored} loop(s) monitored` : 'Loading…'}
        help={k && k.monitored > 0
          ? <Toggletip variant="how-to" label="How this is counted"><p>{basisText(k)}. Each card opens the loops behind it.</p></Toggletip>
          : undefined}
        right={k ? <span className="cpm-op__muted" title={basisText(k)}>updated {fmtDateTime(k.computedAt)}</span> : undefined} />
      {q.isError && <QueryError title="Operating picture unavailable" error={q.error} retry={() => void q.refetch()} />}
      {/* CHG-098 (SME review 2 #29): widen the scope or enable monitoring. */}
      {k && k.monitored === 0 && <EmptyState title="No monitored loops"
        copy="No loop in this plant scope has monitoring enabled. Widen the plant scope above, or onboard and enable loops in the Loop Registry."
        next={[{ label: 'Loop Registry', to: '/cpm/registry' }]} />}
      {k && k.monitored > 0 && (
        <>
          <div className="cpm-kpicards cpm-kpicards--5" role="list" aria-label="Loop KPIs">
            {performance.map(f => <div role="listitem" key={f.key}><Card f={f} k={k} scope={scope} /></div>)}
            {coverage.map(f => (
              <div role="listitem" key={f.key}>
                <Card f={f} k={k} scope={scope}
                  sub={f.key === 'not-assessable' && f.count > 0 ? reasonsText(k) : `${pct(f.count, f.denominator)} % of monitored`} />
              </div>
            ))}
          </div>

          <div className="cpm-op__statebox"><StateBar k={k} scope={scope} /></div>
        </>
      )}
    </section>
  );
};

export default OperatingPicture;
