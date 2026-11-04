/**
 * Overview (SPEC §5.1, CPA01), replacing `/cpm` and `/cpm/kpi`. The URL is the selection: `review`
 * the filter, `reason` a not-assessable cause, `day` a picked trend day, `loop` the selected row.
 * The numbers are the server's. Nothing on this page writes.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { cpaHref } from '../../../components/Cpm/cpaHref';
import { useFleetKpis } from '../../../components/Cpm/kpi/useFleetKpis';
import { DEFAULT_WINDOW_KIND, useWindowKind, WINDOW_KINDS } from '../../../components/Cpm/useWindowKind';
import { useCpaContext } from '../../../cpa/useCpaContext';
import { useFleetRankings, useFleetSummary } from '../../../hooks/useCpm';
import { Button } from '../../../ui/Button';
import { ContextHeader } from '../../../ui/ContextHeader';
import { DataState } from '../../../ui/DataState';
import { TextInput } from '../../../ui/forms/TextInput';
import { Inspector, WithInspector } from '../../../ui/Inspector';
import { SegmentedControl } from '../../../ui/SegmentedControl';
import { useShellBand } from '../../../ui/shell/shellHooks';
import { DistributionBand } from './DistributionBand';
import { FilterProof } from './FilterProof';
import { DEFAULT_TREND_DAYS, TREND_SPANS } from './KpiDailyTrend';
import { LoopDetail } from './LoopDetail';
import { OverviewLedger } from './OverviewLedger';
import { ageWords, clockStamp, kindWords, plural, shortStamp, windowBounds, windowPhrase } from './overviewFormat';
import { NEEDING, readReview, reviewCount, reviewParam, type ReviewKey } from './reviewFilters';
import { ReviewFilterSet } from './ReviewFilterSet';
import { ReviewPanel } from './ReviewPanel';
import { fromKpi, fromRanked, type ReviewRow } from './reviewRows';
import { SummaryStrip } from './SummaryStrip';
import { useFleetRows, useOutOfModeCount } from './useOverviewData';
import { useReviewList } from './useReviewList';
import './overview.css';

/** The server's limit on the priority queue. It has no paging, so a full page may be a cut one. */
const QUEUE_LIMIT = 200;

const errorText = (error: unknown) => (error instanceof Error && error.message.trim() ? error.message : 'The service did not respond.');

const OverviewPage: React.FC = () => {
  const { scope, range, window: servedKind, loop: selectedLoop, zone } = useCpaContext();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [, setWindowKind] = useWindowKind('window');
  const windowKind = servedKind ?? DEFAULT_WINDOW_KIND;
  const band = useShellBand();
  const [proofOpen, setProofOpen] = useState(false);

  const review = readReview(params.get('review'));
  const reason = review === 'not-assessable' ? params.get('reason') : null;
  const day = review === NEEDING ? null : params.get('day');
  const trendDays = TREND_SPANS.find(s => String(s.days) === params.get('days'))?.days ?? DEFAULT_TREND_DAYS;
  const kpiScope = useMemo(() => ({ ...scope.params, windowKind }), [scope.params, windowKind]);

  const kpis = useFleetKpis(kpiScope);
  const k = kpis.data;
  const summary = useFleetSummary(scope.params, windowKind);
  const queue = useFleetRankings(scope.params, windowKind, 'priority', QUEUE_LIMIT);
  const queueLoops = useMemo(() => queue.data?.loops ?? [], [queue.data]);
  const fleet = useFleetRows(kpiScope);
  const outOfMode = useOutOfModeCount(kpiScope);

  const retryQueue = useCallback(() => { void queue.refetch(); }, [queue]);
  const list = useReviewList({
    review, reason, day, scope: kpiScope, windowKind, queue: queueLoops, queueLoading: queue.isLoading,
    queueError: queue.error, retryQueue, fleet: fleet.byLoop,
  });

  const queueCut = queueLoops.length >= QUEUE_LIMIT;
  const queueCount = queue.data ? queueLoops.length : null;
  const queueText = queueCount == null ? null : `${queueCount}${queueCut ? '+' : ''}`;
  const countOf = (key: ReviewKey) => (key === NEEDING ? queueText : reviewCount(key, { kpis: k, queueCount, outOfMode }));
  const shelved = queue.data?.shelvedCount ?? 0;

  const update = (next: Record<string, string | null>, replace = false) => setParams(p => {
    for (const [key, value] of Object.entries(next)) {
      if (value) p.set(key, value); else p.delete(key);
    }
    return p;
  }, { replace });
  const setReview = (key: ReviewKey) => update({ review: reviewParam(key), reason: null, day: null });
  const clearLoop = () => update({ loop: null }, true);
  const hrefOf = (key: ReviewKey) => cpaHref('/cpm', params, { review: reviewParam(key), loop: selectedLoop || null });

  const selected = useMemo((): ReviewRow | null => {
    if (!selectedLoop) return null;
    const id = selectedLoop.toLowerCase();
    const shown = list.rows.find(r => r.loopId.toLowerCase() === id);
    if (shown) return shown;
    const fleetRow = fleet.byLoop.get(id) ?? null;
    const rank = queueLoops.find(r => r.loopId.toLowerCase() === id) ?? null;
    if (rank && (review === NEEDING || !fleetRow)) return fromRanked(rank, fleetRow, windowKind);
    return fleetRow ? fromKpi(fleetRow, rank) : null;
  }, [selectedLoop, list.rows, fleet.byLoop, queueLoops, review, windowKind]);

  /** The evaluated window behind the row, so the Loop page opens on the period this verdict came from. */
  const openLoop = (row: ReviewRow) => {
    const bounds = windowBounds(row.windowEnd, row.windowKind);
    navigate(cpaHref('/cpm/loop', params, {
      loop: row.loopId,
      window: row.windowKind,
      ...(bounds ? { range: 'custom', from: new Date(bounds.from).toISOString(), to: new Date(bounds.to).toISOString() } : {}),
    }));
  };

  const scopeLine = [
    summary.data && `${plural(summary.data.loops.total, 'loop')} in scope`,
    k && `${k.monitored} monitored`,
  ].filter(Boolean).join(' · ');
  const resultsLine = fleet.loading ? null : [
    fleet.newest != null ? `Results from the newest ${windowPhrase(windowKind, fleet.newest, zone.id)}` : `No evaluated ${kindWords(windowKind)} window yet`,
    k && `updated ${clockStamp(k.computedAt, zone.id)}`,
  ].filter(Boolean).join(' · ');

  const age = fleet.newest == null ? null : Date.now() - fleet.newest;
  const stale = !!k && age != null && age > k.basis.freshSeconds * 1000;
  const retryAll = () => { void kpis.refetch(); void queue.refetch(); };
  const shelvedHref = cpaHref('/cpm/events', params, { filter: 'shelved', loop: null });

  const strip = (
    <SummaryStrip kpis={k} unavailable={k ? undefined : 'No response from the KPI service.'} queueCount={queueText}
      shelved={shelved} windowKind={windowKind} hrefOf={hrefOf} shelvedHref={shelvedHref} />
  );

  const closeInspector = () => {
    setProofOpen(false);
    if (selectedLoop) clearLoop();
  };

  const inspectorBody = () => {
    if (!selectedLoop) {
      return (
        <FilterProof review={review} reason={reason} day={day} kpis={k} served={list.served} count={countOf(review)}
          scope={kpiScope} zoneId={zone.id} trendDays={trendDays}
          onTrendDays={days => update({ days: days === DEFAULT_TREND_DAYS ? null : String(days) }, true)}
          onPickDay={asOf => update({ day: asOf })} />
      );
    }
    if (selected) {
      return <LoopDetail key={selected.loopId} row={selected} review={review} zoneId={zone.id} search={params} basis={k?.basis} onClear={clearLoop} />;
    }
    if (fleet.loading || queue.isLoading) return <DataState kind="loading" label="Loading the loop" rows={4} />;
    return (
      <DataState kind="empty" title={`${selectedLoop} is not in this scope`} reason="It may be unmonitored, or outside the plant scope."
        action={<Button onClick={clearLoop}>Clear selection</Button>} />
    );
  };

  return (
    <div className="ov-page">
      <ContextHeader
        title="Overview"
        identity={<>{scopeLine && <span>{scopeLine}</span>}{resultsLine && <span className="ov-results">{resultsLine}</span>}</>}
        controls={(
          <SegmentedControl label="Evaluated window" value={windowKind} onChange={setWindowKind}
            options={WINDOW_KINDS.map(kind => ({ value: kind, label: kindWords(kind) }))} />
        )}
      />

      {kpis.isLoading && <DataState kind="loading" label="Loading the fleet figures" rows={3} />}
      {!kpis.isLoading && kpis.isError && (
        <DataState kind="partial" title="Fleet figures unavailable" reason={errorText(kpis.error)} onRetry={() => void kpis.refetch()}>{strip}</DataState>
      )}
      {!kpis.isLoading && !kpis.isError && stale && (
        <DataState kind="stale" title={`Newest results are ${ageWords(age)} old`} reason={`Last update ${shortStamp(fleet.newest, zone.id)}`} onRetry={retryAll}>
          {strip}
        </DataState>
      )}
      {!kpis.isLoading && !kpis.isError && !stale && strip}

      {k && k.monitored > 0 && <DistributionBand kpis={k} review={review} hrefOf={hrefOf} />}
      {k && k.monitored === 0 && (
        <DataState kind="empty" title="No loops in scope" reason="No loop in this plant scope has monitoring enabled."
          action={<Link to={cpaHref('/cpm/setup', params, { tab: 'loops', loop: null })}>Open Setup › Loops</Link>} />
      )}

      <div className="ov-controls">
        <ReviewFilterSet review={review} countOf={countOf} onChange={setReview} />
        <div className="ov-controls__search">
          <TextInput label="Search loops" hideLabel placeholder="Loop tag or name" clearable value={list.search} onChange={list.setSearch} />
        </div>
      </div>

      <WithInspector>
        <ReviewPanel list={list} review={review} reason={reason} day={day} kpis={k} zoneId={zone.id} selectedLoop={selectedLoop}
          shelved={shelved} queueCut={queueCut} onShowProof={band === 'wide' ? undefined : () => setProofOpen(true)}
          onSelect={row => update({ loop: row.loopId }, true)} onOpen={openLoop} onResetFilter={() => setReview(NEEDING)}
          onReason={next => update({ reason: next })} onBackToNow={() => update({ day: null })}
          emptyAction={shelved > 0
            ? <Link to={shelvedHref}>Review shelved loops</Link>
            : <Link to={hrefOf('all')}>Show all monitored loops</Link>} />
        <Inspector title={selected?.loopId ?? (selectedLoop || 'Select a loop')} open={!!selectedLoop || proofOpen} onClose={closeInspector}
          primaryAction={selected ? <Button variant="primary" onClick={() => openLoop(selected)}>Open loop</Button> : undefined}>
          {inspectorBody()}
        </Inspector>
      </WithInspector>

      <OverviewLedger scope={scope.params} range={range} zoneId={zone.id} search={params} summary={summary.data}
        summaryLoading={summary.isLoading} summaryError={summary.error} retrySummary={() => void summary.refetch()} />
    </div>
  );
};

export default OverviewPage;
