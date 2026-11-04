/**
 * The filter's daily trend in the inspector (C9). The old drill-down's trend spans and its day pick
 * both stay: 30 days is the SPEC's default, and picking a day lists the loops that day counted.
 */
import React, { useMemo } from 'react';
import { KPI_TREND_RANGES, type FleetKpiScope } from '../../../api/cpm/fleetKpis';
import { plantDayLabel } from '../../../components/Cpm/kpi/kpiTrend';
import { useFleetKpiTrend } from '../../../components/Cpm/kpi/useFleetKpis';
import { DataState } from '../../../ui/DataState';
import { SegmentedControl } from '../../../ui/SegmentedControl';
import { TrendPanel, type TrendSegment } from '../../../ui/trend';
import { dailyTrendModel } from './kpiTrendModel';
import { MetricHelp } from './MetricHelp';
import { filterOf, NEEDING, trendCarries, trendKeyFor, type ReviewKey } from './reviewFilters';

export const TREND_SPANS = [{ days: 30, label: '30 d' }, ...KPI_TREND_RANGES.filter(r => r.days > 30)];
export const DEFAULT_TREND_DAYS = 30;

export const KpiDailyTrend: React.FC<{
  review: ReviewKey;
  scope: FleetKpiScope;
  zoneId: string;
  day: string | null;
  days: number;
  onDays: (days: number) => void;
  onPick: (asOf: string | null) => void;
}> = ({ review, scope, zoneId, day, days, onDays, onPick }) => {
  const trend = useFleetKpiTrend(scope, days);
  const key = trendKeyFor(review);
  const carried = trendCarries(trend.data, key);
  // A filter drawn through its mirror says so, rather than showing one number under another's name.
  const label = key === 'normal-mode' ? 'In auto mode' : filterOf(review).label;
  const model = useMemo(() => (trend.data && key && carried ? dailyTrendModel(trend.data, key, label) : null), [trend.data, key, carried, label]);

  const onSelect = (band: TrendSegment | null) => {
    const picked = band ? model?.days.find(d => d.asOf === band.id) : undefined;
    onPick(picked && !picked.isNow ? picked.asOf : null);
  };

  const spans = (
    <SegmentedControl label="Trend span" value={String(days)} onChange={v => onDays(Number(v))}
      options={TREND_SPANS.map(s => ({ value: String(s.days), label: s.label }))} />
  );

  if (trend.isLoading) return <DataState kind="loading" label="Loading the daily trend" rows={3} />;
  if (trend.isError) return <DataState kind="error" title="Could not load the daily trend" error={trend.error} onRetry={() => void trend.refetch()} />;
  if (!model) {
    return (
      <DataState kind="unavailable" title="No daily trend for this filter"
        reason={review === NEEDING
          ? 'The daily record keeps fixed KPI figures. The review queue is not one of them.'
          : 'The daily record does not keep this figure.'} />
    );
  }

  const plantDay = plantDayLabel(trend.data);
  return (
    <TrendPanel
      compact
      headingLevel={3}
      heading="Daily trend"
      zone={zoneId}
      panes={model.panes}
      lanes={model.lanes}
      plotWindow={model.plotWindow}
      gapStepMs={null}
      source="Fleet KPI record"
      aggregation={`one point per ${plantDay}, at its end`}
      toolbar={spans}
      selectedBandId={day}
      onSelectBand={onSelect}
      state={model.range ? undefined : { kind: 'empty', message: 'No day had anything to judge.' }}
      context={(
        <>
          {label}, last {days} days
          <MetricHelp metric="M-021" label="Daily trend" basis={trend.data?.basis} extra={{ range: `${days} days`, 'plant day': plantDay }} />
          {model.range && <span className="ov-note"> Between {model.range.min} % and {model.range.max} %. Days with nothing kept read no data, not 0 %.</span>}
        </>
      )}
    />
  );
};

