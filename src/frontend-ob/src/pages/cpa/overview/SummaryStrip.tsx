/**
 * SPEC §5.1 summary strip. Three figures plus one, each with its window, its ⓘ and a way to the
 * loops behind it. Data coverage folds the three old coverage cards into one figure, and its
 * breakdown goes in the ⓘ. A change against 24 h earlier shows only where the server serves one.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import type { FleetKpiFigure, FleetKpis } from '../../../api/cpm/fleetKpis';
import { kpiDelta } from '../../../components/Cpm/kpi/kpiMeta';
import { reasonsText } from '../../../components/Cpm/kpi/fleetKpiView';
import { helpFor } from '../../../help/registry';
import { fillPlaceholders, Toggletip } from '../../../ui/Toggletip';
import { MetricSummary, type Metric } from '../../../ui/MetricSummary';
import { helpValues } from './helpFill';
import { MetricHelp } from './MetricHelp';
import { kindWords, NO_LOOPS, NOTHING_TO_JUDGE, percentOf, shareText } from './overviewFormat';
import type { ReviewKey } from './reviewFilters';

const COVERAGE_PARTS = [
  { key: 'not-assessable', metric: 'M-013', label: 'Not assessable' },
  { key: 'stale', metric: 'M-015', label: 'Stale' },
  { key: 'never-evaluated', metric: 'M-016', label: 'Never evaluated' },
] as const;

const figureOf = (k: FleetKpis, key: FleetKpiFigure['key']) => k.kpis.find(f => f.key === key);

const changeText = (k: FleetKpis, key: FleetKpiFigure['key'], of: string) => {
  const figure = figureOf(k, key);
  const delta = figure ? kpiDelta(figure, k) : null;
  return delta ? `${delta.text}${of} vs 24 h earlier` : undefined;
};

/** The ⓘ of Data coverage: the population, then each part of what could not be judged. */
const CoverageBreakdown: React.FC<{ k: FleetKpis; hrefOf: (key: ReviewKey) => string }> = ({ k, hrefOf }) => {
  const values = helpValues(k.basis);
  return (
    <>
      <p>{helpFor('M-003')?.what} Shown as a share of the {k.monitored} monitored loops.</p>
      <dl className="ov-coverage">
        {COVERAGE_PARTS.map(part => {
          const count = figureOf(k, part.key)?.count;
          const change = changeText(k, part.key, '');
          return (
            <div key={part.key}>
              <dt><Link to={hrefOf(part.key)}>{part.label}</Link></dt>
              <dd className="ov-coverage__count">
                {count ?? '—'}
                {count != null && ` · ${shareText(count, k.monitored, 'monitored', NO_LOOPS)}`}
                {change && ` · ${change}`}
              </dd>
              {part.key === 'not-assessable' && k.notAssessableByReason.length > 0 && <dd>{reasonsText(k)}</dd>}
              <dd>{fillPlaceholders(helpFor(part.metric)?.what ?? '', values)}</dd>
            </div>
          );
        })}
      </dl>
    </>
  );
};

export const SummaryStrip: React.FC<{
  kpis: FleetKpis | undefined;
  /** Why the KPI figures are missing. */
  unavailable?: string;
  /** Text, because a queue at the server's limit reads "200+". */
  queueCount: string | null;
  shelved: number;
  windowKind: string;
  hrefOf: (key: ReviewKey) => string;
  shelvedHref: string;
}> = ({ kpis: k, unavailable, queueCount, shelved, windowKind, hrefOf, shelvedHref }) => {
  const window = `${kindWords(windowKind)} window`;
  const open = (key: ReviewKey) => <Link to={hrefOf(key)}>Show these loops</Link>;

  const assessed: Metric = !k
    ? { key: 'assessed', label: 'Assessed', value: null, note: unavailable, help: <MetricHelp metric="M-003" label="Assessed" />, window }
    : k.monitored === 0
      ? { key: 'assessed', label: 'Assessed', value: 0, note: NO_LOOPS, help: <MetricHelp metric="M-003" label="Assessed" basis={k.basis} />, window }
      : {
        key: 'assessed', label: 'Assessed', value: k.states.assessed,
        unit: `of ${k.monitored} monitored · ${percentOf(k.states.assessed, k.monitored)} %`,
        help: <MetricHelp metric="M-003" label="Assessed" basis={k.basis} />, window, to: open('assessed'),
      };

  const coverage = k ? percentOf(k.states.assessed, k.monitored) : null;
  const dataCoverage: Metric = {
    key: 'coverage', label: 'Data coverage',
    // A dash, not Unavailable: the service answered, and there is nothing to divide.
    value: !k ? null : coverage ?? '—',
    unit: coverage == null ? undefined : '% assessable',
    note: !k ? unavailable : coverage == null ? NO_LOOPS : undefined,
    window,
    help: k
      ? <Toggletip label="Data coverage" variant="info"><CoverageBreakdown k={k} hrefOf={hrefOf} /></Toggletip>
      : <MetricHelp metric="M-093" label="Data coverage" />,
    to: k && k.monitored > 0 ? <Link to={hrefOf('not-assessable')}>Show what could not be judged</Link> : undefined,
  };

  const acceptable = k ? figureOf(k, 'acceptable') : undefined;
  const hasAssessed = !!k && k.states.assessed > 0;
  const performing: Metric = {
    key: 'acceptable', label: 'Performing acceptably',
    value: acceptable?.count ?? null,
    unit: acceptable && hasAssessed ? `of ${k.states.assessed} assessed · ${percentOf(acceptable.count, k.states.assessed)} %` : undefined,
    note: !k ? unavailable : hasAssessed ? undefined : k.monitored === 0 ? NO_LOOPS : NOTHING_TO_JUDGE,
    window,
    // The served change is a share of monitored loops, so it says so beside a share of assessed ones.
    change: k ? changeText(k, 'acceptable', ' of monitored') : undefined,
    help: <MetricHelp metric="M-005" label="Performing acceptably" basis={k?.basis} calculation="CPLM-014" />,
    to: k && k.monitored > 0 ? open('acceptable') : undefined,
  };

  const needing: Metric = {
    key: 'needing', label: 'Needing review', value: queueCount, window,
    help: <MetricHelp metric="M-027" label="Needing review" basis={k?.basis} />,
    to: (
      <>
        {open('needing')}
        {shelved > 0 && <> · <Link to={shelvedHref}>{shelved} shelved</Link></>}
      </>
    ),
  };

  return <MetricSummary label="Fleet summary" metrics={[assessed, needing, dataCoverage, performing]} />;
};
