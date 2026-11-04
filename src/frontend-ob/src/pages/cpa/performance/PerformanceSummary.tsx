/**
 * SPEC §5.2 summary strip. The figures are the server's, over every assessed loop in scope. A missing
 * value reads Unavailable with its reason, and an empty denominator reads "No loops in scope" (D-39).
 */
import React from 'react';
import { Link } from 'react-router-dom';
import type { CpmFleetSummary } from '../../../api/cpmApi';
import type { FleetPerformance } from '../../../api/cpm/fleetKpis';
import { cpaHref } from '../../../components/Cpm/cpaHref';
import { diagnosticCapabilityCopy } from '../../../components/Cpm/overview/capabilityCopy';
import { basisText } from '../../../components/Cpm/performanceHeadline';
import { MetricSummary, type Metric } from '../../../ui/MetricSummary';
import { Toggletip } from '../../../ui/Toggletip';

const NO_LOOPS = 'No loops in scope';
const NOT_READ = 'Could not be read';
const HEALTH_NOTE = 'Whole scope, health filter not applied';

const pct = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const joined = (...parts: Array<string | null | undefined>) => parts.filter(Boolean).join(' · ');

/** Why a figure has no value: nothing in scope, nothing assessed, or what kept the loops out. */
function missingReason(p: FleetPerformance, lacking: string): string {
  if (p.monitored === 0) return NO_LOOPS;
  return p.assessed === 0 ? `No assessed loop · ${basisText(p, 0)}` : `${lacking} · ${basisText(p, 0)}`;
}

function performanceMetrics(p: FleetPerformance | undefined, failed: boolean): Array<Pick<Metric, 'value' | 'unit' | 'note'>> {
  if (!p) {
    const note = failed ? NOT_READ : undefined;
    return [{ value: null, note }, { value: null, note }, { value: null, note }];
  }
  const g = p.goodError;
  const e = p.errorOfSpan;
  const goodNotes = [g.notMeasured ? `${g.notMeasured} not measured` : ''].filter(Boolean);
  const spanNotes = [e.noSpan ? `${e.noSpan} without a PV span` : '', e.notMeasured ? `${e.notMeasured} not measured` : ''].filter(Boolean);
  return [
    g.medianPct != null
      ? { value: pct(g.medianPct), unit: '%', note: joined(g.meanPct != null ? `Mean ${pct(g.meanPct)} %` : null, basisText(p, g.counted, goodNotes)) }
      : { value: null, note: missingReason(p, 'Not measured') },
    e.medianPct != null
      ? { value: pct(e.medianPct), unit: '% of span', note: basisText(p, e.counted, spanNotes) }
      : { value: null, note: missingReason(p, 'No loop with a registered PV span') },
    p.periodic.of > 0
      ? { value: p.periodic.count, unit: `of ${p.periodic.of}`, note: basisText(p, p.periodic.of) }
      : { value: null, note: missingReason(p, 'No assessed loop') },
  ];
}

function capabilityMetric(summary: CpmFleetSummary | undefined, failed: boolean): Pick<Metric, 'value' | 'unit' | 'note'> {
  const copy = diagnosticCapabilityCopy(summary?.loops.total ?? null, summary?.capability.loopsCappedByMissingVp ?? null, summary?.capability);
  const [able, of] = copy.value.split('/');
  if (of === undefined) return { value: null, note: failed ? NOT_READ : undefined };
  if (of === '0') return { value: null, note: NO_LOOPS };
  // With no mapping gap, the definition in the ⓘ does not say why the two numbers differ, so the reason is shown.
  const gapInHelp = (summary?.capability.loopsCappedByMissingVp ?? 0) > 0;
  return { value: able, unit: `of ${of} loops`, note: gapInHelp ? undefined : copy.sub };
}

export const PerformanceSummary: React.FC<{
  performance: FleetPerformance | undefined;
  kpisFailed: boolean;
  onRetryKpis: () => void;
  summary: CpmFleetSummary | undefined;
  summaryFailed: boolean;
  onRetrySummary: () => void;
  kind: string;
  healthFiltered: boolean;
  search: URLSearchParams;
}> = ({ performance, kpisFailed, onRetryKpis, summary, summaryFailed, onRetrySummary, kind, healthFiltered, search }) => {
  const [good, error, periodic] = performanceMetrics(performance, kpisFailed);
  const capability = capabilityMetric(summary, summaryFailed);
  const window = `Newest ${kind} window`;
  const note = (text: string | undefined) => (healthFiltered ? joined(text, HEALTH_NOTE) : text);
  const assessed = (
    <Link className="ui-link" to={cpaHref('/cpm', search, { review: 'assessed' })}>Assessed loops</Link>
  );
  const retry = (onRetry: () => void) => <button type="button" className="ui-link" onClick={onRetry}>Retry</button>;
  const fleet = kpisFailed && !performance ? retry(onRetryKpis) : assessed;
  const median = performance?.goodError.medianPct;

  const metrics: Metric[] = [
    {
      key: 'good-error', label: 'Good-error time', ...good, note: note(good.note), window, to: fleet,
      help: <Toggletip metric="M-036" label="Good-error time" values={median != null ? { x: `${pct(median)} %` } : undefined} />,
    },
    {
      key: 'median-error', label: 'Median error', ...error, note: note(error.note), window, to: fleet,
      help: <Toggletip metric="M-037" label="Median error" />,
    },
    {
      key: 'periodic', label: 'Loops with periodic diagnosis', ...periodic, note: note(periodic.note), window, to: fleet,
      help: <Toggletip metric="M-038" label="Loops with periodic diagnosis" />,
    },
    {
      key: 'capability', label: 'Diagnostic capability', ...capability, window: 'Loop registry',
      to: summaryFailed && !summary
        ? retry(onRetrySummary)
        : <Link className="ui-link" to={cpaHref('/cpm/setup', search, { tab: 'loops' })}>Loops in Setup</Link>,
      help: <Toggletip metric="M-035" label="Diagnostic capability" values={summary ? { n: summary.capability.loopsCappedByMissingVp } : undefined} />,
    },
  ];

  return <MetricSummary label="Fleet performance" metrics={metrics} />;
};
