/**
 * The inspector with no loop selected: the active filter's proof and its daily trend. The proof is
 * what the old `/cpm/kpi` page stated: rule, threshold, population and computed time. Formula and
 * the reason for the KPI moved into help (content audit R-14).
 */
import React from 'react';
import type { FleetKpiFigure, FleetKpiLoops, FleetKpis, FleetKpiScope } from '../../../api/cpm/fleetKpis';
import { reasonLabel } from '../../../components/Cpm/kpi/fleetKpiView';
import { basisShort, KPI_META } from '../../../components/Cpm/kpi/kpiMeta';
import { KPI_WHY } from '../../../components/Cpm/kpi/kpiProof';
import { siteDateTime } from '../../../cpa/siteTime';
import { Toggletip } from '../../../ui/Toggletip';
import { nameGates } from './helpFill';
import { KpiDailyTrend } from './KpiDailyTrend';
import { MetricHelp } from './MetricHelp';
import { NO_LOOPS, NOTHING_TO_JUDGE, shareText } from './overviewFormat';
import { filterOf, NEEDING, type ReviewKey } from './reviewFilters';

/** The server's rule (M-027) in plain words: its membership test, with no pattern or raw code. */
export const QUEUE_RULE = 'The newest verdict is a confirmed, suspected, classified or detected condition, inside its window length, and not shelved.';
const QUEUE_THRESHOLD = 'Priority from loop criticality × finding severity';

/** The served rule, with its raw codes taken out (CD17) and gates named first (CD18). */
export const ruleText = (rule: string): string => nameGates(rule.replace(/\s*\(NO_CALL \/ INSUFFICIENT_EVIDENCE\)/, ''));

function populationText(figure: FleetKpiFigure | null | undefined, count: string | number | null, monitored: number | undefined): string {
  if (figure) {
    const share = shareText(figure.count, figure.denominator, figure.denominatorLabel, monitored === 0 ? NO_LOOPS : NOTHING_TO_JUDGE);
    return figure.denominator > 0 ? `${figure.count} · ${share}` : share;
  }
  if (monitored == null) return count == null ? 'Unavailable' : String(count);
  if (monitored === 0) return NO_LOOPS;
  return `${count ?? 'Unavailable'} of ${monitored} monitored loops`;
}

export const FilterProof: React.FC<{
  review: ReviewKey;
  reason: string | null;
  day: string | null;
  kpis: FleetKpis | undefined;
  served: FleetKpiLoops | undefined;
  count: string | number | null;
  scope: FleetKpiScope;
  zoneId: string;
  trendDays: number;
  onTrendDays: (days: number) => void;
  onPickDay: (asOf: string | null) => void;
}> = ({ review, reason, day, kpis, served, count, scope, zoneId, trendDays, onTrendDays, onPickDay }) => {
  const filter = filterOf(review);
  // The list's own figure first: with a picked day, it is the figure as of that day.
  const figure = review === NEEDING ? null : served?.figure ?? kpis?.kpis.find(f => f.key === review) ?? null;
  const basis = served?.basis ?? kpis?.basis;
  const why = review === NEEDING ? undefined : KPI_WHY[review];
  const rule = review === NEEDING ? QUEUE_RULE : figure ? ruleText(figure.rule) : why;
  const metaKey = review === NEEDING ? undefined : KPI_META[review];
  const threshold = review === NEEDING ? QUEUE_THRESHOLD : metaKey && basis ? nameGates(metaKey.threshold(basis)) : 'As listed';
  const computed = siteDateTime(served?.computedAt ?? kpis?.computedAt, zoneId);

  return (
    <div className="ov-inspector">
      <section className="ov-section" aria-label={`${filter.label}: proof`}>
        <h3 className="ov-section__title">
          {filter.label}
          <MetricHelp metric={filter.metric} label={filter.label} basis={basis} calculation={filter.calculation} />
          {figure && why && <Toggletip label={`Why ${filter.label}`} variant="how-to">{why}</Toggletip>}
        </h3>
        <dl className="ov-facts">
          <div><dt>Rule</dt><dd>{rule ?? 'Unavailable'}</dd></div>
          <div><dt>Threshold</dt><dd>{threshold}</dd></div>
          <div><dt>Population</dt><dd>{populationText(figure, count, kpis?.monitored)}</dd></div>
          {reason && <div><dt>Narrowed to</dt><dd>{reasonLabel(reason)}</dd></div>}
          {basis && <div><dt>Basis</dt><dd>{basisShort(basis)}</dd></div>}
          <div><dt>Computed</dt><dd>{computed}</dd></div>
        </dl>
      </section>
      <KpiDailyTrend review={review} scope={scope} zoneId={zoneId} day={day} days={trendDays} onDays={onTrendDays} onPick={onPickDay} />
    </div>
  );
};
