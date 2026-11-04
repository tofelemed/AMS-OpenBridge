/**
 * Performance (SPEC §5.2): compare loops gate by gate and see which checks hold the fleet back. The
 * path and URL parameters are the old page's, so links from other pages keep working. This file is
 * the composition: each region owns its file.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cpaHref } from '../../../components/Cpm/cpaHref';
import { DEFAULT_WINDOW_KIND } from '../../../components/Cpm/useWindowKind';
import { useDebounce } from '../../../hooks/useDebounce';
import { useCpaContext } from '../../../cpa/useCpaContext';
import { siteDateTime } from '../../../cpa/siteTime';
import { useAuthStore } from '../../../store/authStore';
import { ContextHeader } from '../../../ui/ContextHeader';
import { DataState } from '../../../ui/DataState';
import { WithInspector } from '../../../ui/Inspector';
import { SegmentedControl } from '../../../ui/SegmentedControl';
import { Toggletip } from '../../../ui/Toggletip';
import { useShellBand } from '../../../ui/shell/shellHooks';
import { useGridFocus } from '../../../ui/useGridFocus';
import { GateGuide } from './GateGuide';
import { GateInspector } from './GateInspector';
import { GateRollupPanel } from './GateRollupPanel';
import { GateTable } from './GateTable';
import { PerformanceFilters } from './PerformanceFilters';
import { PerformanceSummary } from './PerformanceSummary';
import { STALE_AFTER_MS, fmtAge, sameLoop } from './performanceModel';
import { useGateRows } from './useGateRows';
import { usePerformanceData } from './usePerformanceData';
import { usePerformanceUrl } from './usePerformanceUrl';
import './performance.css';

/** A link with a loop and no gate opens on the decision, as "Open evidence" did on the old page. */
const DECISION_GATE = 'G15';

const PerformancePage: React.FC = () => {
  const { scope, window: windowKind, loop, zone } = useCpaContext();
  const url = usePerformanceUrl();
  const kind = windowKind ?? DEFAULT_WINDOW_KIND;
  const data = usePerformanceData(scope.params, kind, url.sort, url.health);
  const canSeePipeline = useAuthStore(s => s.hasPermission('system.manage'));
  const band = useShellBand();

  const [query, setQuery] = useState('');
  const q = useDebounce(query, 250);
  const [guideOpen, setGuideOpen] = useState(false);

  const table = useGateRows(data, url, q, loop);
  const focusKey = [url.view, table.page, url.rows, url.heldBy, q, url.sort].join('|');
  const focus = useGridFocus<HTMLTableSectionElement>(table.visible.length, focusKey);

  const selection = useMemo(() => (loop ? { loopId: loop, gate: url.gate ?? DECISION_GATE } : null), [loop, url.gate]);
  const inRows = table.rows.some(r => sameLoop(r.loopId, loop));
  const selectedRow = data.loops.find(r => sameLoop(r.loopId, loop));

  const { clearSelection } = url;
  const { focusCurrent } = focus;
  const clear = useCallback(() => {
    clearSelection();
    focusCurrent();
  }, [clearSelection, focusCurrent]);

  const { newestWindow } = data;
  const age = newestWindow != null ? Date.now() - newestWindow : null;
  const stale = age != null && age > STALE_AFTER_MS;
  const windowLine = newestWindow != null
    ? `Newest evaluated window ending ${siteDateTime(newestWindow, zone.id)}`
    : data.heatmap.isLoading ? null : 'No evaluated window';

  return (
    <div className="perf">
      <ContextHeader
        title="Performance"
        identity={windowLine && (
          <span className="perf-head">
            {windowLine}
            {newestWindow != null && <Toggletip metric="M-039" label="Newest evaluated window" />}
          </span>
        )}
        controls={(
          <>
            <SegmentedControl
              label="Evaluated window"
              ignoreReselect
              value={data.kinds.includes(kind) ? kind : data.kinds[0]}
              options={data.kinds.map(k => ({ value: k, label: k }))}
              onChange={url.setWindow}
            />
            <Toggletip metric="M-113" label="Evaluated window" />
          </>
        )}
      />

      {stale && (
        <DataState
          kind="stale"
          title="Stale"
          reason={`The newest evaluated window is ${fmtAge(age)} old.`}
          action={canSeePipeline
            ? <Link className="ui-link" to={cpaHref('/cpm/system', url.search, { tab: 'pipeline' })}>Pipeline health</Link>
            : undefined}
        >
          <></>
        </DataState>
      )}

      {data.heatmap.isError && data.heatmap.data && (
        <DataState kind="partial" title="Could not refresh" reason="Showing the last results read." onRetry={() => { void data.heatmap.refetch(); }}>
          <></>
        </DataState>
      )}

      <PerformanceSummary
        performance={data.kpis.data?.performance}
        kpisFailed={data.kpis.isError}
        onRetryKpis={() => { void data.kpis.refetch(); }}
        summary={data.summary.data}
        summaryFailed={data.summary.isError}
        onRetrySummary={() => { void data.summary.refetch(); }}
        kind={kind}
        healthFiltered={!!url.health}
        search={url.search}
      />

      <GateRollupPanel
        loops={data.loops}
        tierGroups={data.tierGroups}
        activeGate={url.heldBy}
        onSelectGate={url.setHeldBy}
        loading={data.heatmap.isLoading}
        error={data.heatmap.isError && !data.heatmap.data ? data.heatmap.error : undefined}
        onRetry={() => { void data.heatmap.refetch(); }}
      />

      <PerformanceFilters
        url={url}
        counts={table.counts}
        query={query}
        onQuery={setQuery}
        rowCount={table.rows.length}
        start={table.start}
        loaded={data.loops.length}
        total={data.total}
        rankingFailed={data.rankings.isError && !data.rankings.data}
        onRetryRanking={() => { void data.rankings.refetch(); }}
        onOpenGuide={band === 'wide' ? undefined : () => setGuideOpen(true)}
      />

      <WithInspector>
        <section className="perf-panel" aria-label="Gate results">
          <GateTable
            url={url}
            data={data}
            table={table}
            kind={kind}
            selection={selection}
            focus={focus}
            q={q}
            onQuery={setQuery}
          />
        </section>
        <div className="perf-inspector-slot" onKeyDown={e => { if (e.key === 'Escape' && selection) clear(); }}>
          {selection
            ? (
              <GateInspector
                loopId={selection.loopId}
                gate={selection.gate}
                kind={kind}
                gateKeys={data.gateKeys}
                row={selectedRow}
                inRows={inRows}
                zoneId={zone.id}
                search={url.search}
                onSelectGate={gate => url.selectCell(selection.loopId, gate)}
                onClear={clear}
                onShowAll={() => { setQuery(''); url.resetFilters(); }}
              />
            )
            : <GateGuide summary={data.summary.data} open={guideOpen} onClose={() => setGuideOpen(false)} />}
        </div>
      </WithInspector>
    </div>
  );
};

export default PerformancePage;
