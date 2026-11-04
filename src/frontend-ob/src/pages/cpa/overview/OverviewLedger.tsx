/**
 * SPEC §5.1 ledger. Recent episodes respect the plant scope, on the server, and the header range,
 * here (episodeView.ts says why). The old trail ignored scope. Configuration limits link to Setup.
 */
import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { cpaHref } from '../../../components/Cpm/cpaHref';
import { useEventPage } from '../../../components/Cpm/events/useEventPage';
import { plantFactsCopy } from '../../../components/Cpm/overview/capabilityCopy';
import { diagnosisLabel } from '../../../components/Cpm/vocabulary';
import type { CpmEventFrame, CpmFleetScope, CpmFleetSummary } from '../../../api/cpmApi';
import type { CpaRange } from '../../../cpa/useCpaContext';
import { DataState } from '../../../ui/DataState';
import { DataTable, type Column } from '../../../ui/DataTable';
import { StatusBadge } from '../../../ui/StatusBadge';
import { episodeBadge, RECENT_SCAN, RECENT_SIZE, recentInRange } from './episodeView';
import { nameGates } from './helpFill';
import { MetricHelp } from './MetricHelp';
import { plural, rangeBounds, shortStamp } from './overviewFormat';

const RecentEpisodes: React.FC<{
  scope: CpmFleetScope;
  range: CpaRange;
  zoneId: string;
  search: URLSearchParams;
}> = ({ scope, range, zoneId, search }) => {
  const page = useEventPage({ state: 'all', sort: 'recent', page: 1, pageSize: RECENT_SCAN, ...scope }, 60_000);
  const { dataUpdatedAt, data } = page;
  const recent = useMemo(
    () => recentInRange(data?.events ?? [], rangeBounds(range, dataUpdatedAt || Date.now()), data?.total ?? 0),
    [data, range, dataUpdatedAt],
  );
  const columns: Array<Column<CpmEventFrame>> = [
    { key: 'opened', header: 'Opened', cell: e => shortStamp(e.opened_at, zoneId) },
    { key: 'loop', header: 'Loop', mono: true, cell: e => <Link to={cpaHref('/cpm/loop', search, { loop: e.loop_id })}>{e.loop_id}</Link> },
    { key: 'episode', header: 'Episode', cell: e => diagnosisLabel(e.peak_diagnosis) },
    {
      key: 'state', header: 'State',
      cell: e => {
        const badge = episodeBadge(e, dataUpdatedAt || Date.now());
        return <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>;
      },
    },
    { key: 'open', header: 'Episode record', cell: e => <Link to={cpaHref('/cpm/events', search, { loop: e.loop_id, event: e.id })}>Open episode</Link> },
  ];

  return (
    <section className="ov-panel">
      <div className="ov-panel__head">
        <h2 className="ov-panel__title">Recent episodes</h2>
        {/* The ledger is not narrowed to the selected loop, so its link is not either. */}
        <Link to={cpaHref('/cpm/events', search, { loop: null })}>All episodes in this scope and range</Link>
      </div>
      <DataTable
        caption="Recent episodes"
        density="compact"
        columns={columns}
        rows={recent.rows}
        rowKey={e => String(e.id)}
        loading={page.isLoading}
        error={page.error}
        onRetry={() => void page.refetch()}
        emptyTitle="No episodes in this scope and range"
        emptyReason={recent.partial ? `Only the newest ${RECENT_SCAN} episodes in scope were checked against the range.` : undefined}
      />
      {recent.partial && recent.rows.length > 0 && (
        <p className="ui-meta">
          {recent.rows.length} of up to {RECENT_SIZE}. Only the newest {RECENT_SCAN} episodes in scope were checked against the range.
        </p>
      )}
    </section>
  );
};

const LimitLine: React.FC<{
  count: number;
  mapped: string;
  gap: string;
  effect: string;
  metric: string;
  href: string;
}> = ({ count, mapped, gap, effect, metric, href }) => (
  <li>
    {count > 0
      ? <><Link to={href}>{gap} on {plural(count, 'loop')}</Link> ({effect})</>
      : mapped}
    {' '}<MetricHelp metric={metric} label={gap} />
  </li>
);

const ConfigurationLimits: React.FC<{
  summary: CpmFleetSummary | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  search: URLSearchParams;
}> = ({ summary, loading, error, onRetry, search }) => {
  const facts = summary ? plantFactsCopy(summary.capability) : null;
  const setup = (filter: string) => cpaHref('/cpm/setup', search, { tab: 'loops', loop: null, filter });
  return (
    <section className="ov-panel" aria-label="Configuration limits">
      <div className="ov-panel__head"><h2 className="ov-panel__title">Configuration limits</h2></div>
      {error != null && !summary && <DataState kind="error" title="Could not load the configuration limits" error={error} onRetry={onRetry} />}
      {loading && <DataState kind="loading" label="Loading the configuration limits" rows={2} />}
      {summary && (
        <ul className="ov-limits">
          <LimitLine count={summary.capability.loopsCappedByMissingVp} metric="M-032" href={setup('vp-unmapped')}
            gap="VP not mapped" effect="valve confirmation unavailable" mapped="VP mapped on every loop that expects one" />
          <LimitLine count={summary.capability.loopsWithoutDisturbanceContext} metric="M-033" href={setup('peers-missing')}
            gap="Peer links missing" effect="interaction analysis unavailable" mapped="Peer links set on every loop that expects them" />
        </ul>
      )}
      {facts && <p className="ui-meta">{nameGates(facts)}</p>}
    </section>
  );
};

export const OverviewLedger: React.FC<{
  scope: CpmFleetScope;
  range: CpaRange;
  zoneId: string;
  search: URLSearchParams;
  summary: CpmFleetSummary | undefined;
  summaryLoading: boolean;
  summaryError: unknown;
  retrySummary: () => void;
}> = ({ scope, range, zoneId, search, summary, summaryLoading, summaryError, retrySummary }) => (
  <>
    <RecentEpisodes scope={scope} range={range} zoneId={zoneId} search={search} />
    <ConfigurationLimits summary={summary} loading={summaryLoading} error={summaryError} onRetry={retrySummary} search={search} />
  </>
);
