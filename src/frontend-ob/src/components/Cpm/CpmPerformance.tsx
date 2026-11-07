'use client';

/**
 * CPLM Phase 7: U3 Performance.
 *
 * Composition only: the KPI tiles, the fleet gate summary and the list each own their own file. The screen's job
 * here is the URL contract that ties them together. The list is one set of loops with a Findings / Gate matrix
 * toggle; a gate opens in a dialog (CHG-135), because reading a gate is one task and a column beside the list
 * only narrowed it.
 *
 * Every figure is real; where a metric has no model yet the tile says so.
 */
import { usePipelineAccess } from './access';
import React, { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Toggletip } from '../../ui/Toggletip';
import type { CpmHealthFilter } from '../../api/cpmApi';
import WindowKindToggle from './explorer/summary/WindowKindToggle';
import { windowKindOf } from './useWindowKind';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import {
  EmptyState, WorkspaceHeader, QueryError, PanelHead, fmtDateTime,
} from './shared';
import { useCpmScope } from './plantScope';
import GateRollup from './GateRollup';
import GateMatrix, { type MatrixScope } from './GateMatrix';
import PerformanceKpis from './performance/PerformanceKpis';
import HowToReadDialog from './performance/HowToReadDialog';
import SelectedLoopBand from './performance/SelectedLoopBand';
import PerformanceGateDialog from './performance/PerformanceGateDialog';
import { loopSortOf, type LoopSort } from './performance/loopSort';
import { useLoopRank } from './performance/useLoopRank';
import { buildTierGroups, isRowFilter, latestWindowEnd, matrixViewOf, type MatrixView } from './gateStatus';
import { useCpmLoops, useCpmResolutions, useFleetHeatmap, useFleetSummary } from '../../hooks/useCpm';
import { useFleetKpis } from './kpi/useFleetKpis';
import { explorerHref, pipelineHref, registryHref, windowsHref } from './cpaHref';
import { effectiveInputFlags } from './inputLimits';
import { inputContextOf } from './optionalInputs';

/** v2.5 (1H.6): the three fleet health filters the server understands (spec §4.7). */
const HEALTH_FILTERS: { id: CpmHealthFilter; label: string }[] = [
  { id: 'missing-binding', label: 'Missing binding' },
  { id: 'stale-collection', label: 'Stale collection' },
  { id: 'active-affected', label: 'Active affected-device condition' },
];

/** A fused window older than this is called out rather than shown as current. */
const STALE_AFTER_MS = 3 * 3_600_000;

const fmtAge = (ms: number) =>
  ms < 3_600_000 ? `${Math.round(ms / 60_000)} min` : `${(ms / 3_600_000).toFixed(1)} h`;

export const CpmPerformance: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const windowKind = windowKindOf(params.get('window'));   // CHG-089: 12h by default, 24h on request
  const selectedLoop = params.get('loop');
  const openGate = params.get('gate');
  const sort = loopSortOf(params.get('sort'));

  // ── URL contract. Mode + gate filter are shareable; page follows them.
  const modeParam = params.get('rows');
  const scopeFilter: MatrixScope = {
    mode: isRowFilter(modeParam) ? modeParam : 'attention',
    gate: params.get('fg'),
  };
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
  // Findings by default; `?view=matrix` is the gate matrix with all 17 gates
  const matrixView = matrixViewOf(params.get('view'));

  const write = React.useCallback((mutate: (p: URLSearchParams) => void) => {
    setParams(p => { mutate(p); return p; }, { replace: true });
  }, [setParams]);

  const setFilter = React.useCallback((next: Partial<MatrixScope>) => {
    write(p => {
      if (next.mode !== undefined) p.set('rows', next.mode);
      if (next.gate !== undefined) { if (next.gate) p.set('fg', next.gate); else p.delete('fg'); }
      p.delete('page'); // a new row-set invalidates the page number
    });
  }, [write]);

  const setMatrixView = React.useCallback((v: MatrixView) => {
    write(p => { if (v === 'matrix') p.set('view', v); else p.delete('view'); });
  }, [write]);

  const setSort = React.useCallback((v: LoopSort) => {
    write(p => { if (v === 'evidence') p.delete('sort'); else p.set('sort', v); p.delete('page'); });
  }, [write]);

  const setPage = React.useCallback((n: number) => {
    write(p => { if (n <= 1) p.delete('page'); else p.set('page', String(n)); });
  }, [write]);

  const selectLoop = React.useCallback((loopId: string) => {
    write(p => p.set('loop', loopId));
  }, [write]);

  // A loop id is a route (cpa-ui-fix-plan Phase 2): the matrix loop cell and the
  // attention list open the loop hub; selection stays with the gate cells.
  const navigate = useNavigate();
  const canPipeline = usePipelineAccess();
  // The hub opens on the same fused window the matrix was showing (`?window=` is read by both).
  const openLoop = React.useCallback((loopId: string) => {
    navigate(explorerHref(loopId, { tab: 'Summary', kind: windowKind }));
  }, [navigate, windowKind]);

  // Guidance is ephemeral and personal — it does not belong in a shareable URL the way the row filter and the open gate do.
  const [showGuide, setShowGuide] = React.useState(false);

  const openEvidence = React.useCallback((loopId: string, gate: string) => {
    write(p => { p.set('loop', loopId); p.set('gate', gate); });
  }, [write]);

  const closeEvidence = React.useCallback(() => {
    write(p => p.delete('gate'));
  }, [write]);

  // ── Data
  const scope = useCpmScope();
  // The toggle options come from the served contract (`fusion.firesOn`), not
  // literals: gate verdicts exist only where fusion fires, and a new trigger
  // added server-side should appear here without a UI release (audit.md §4.1).
  const resolutions = useCpmResolutions();
  const fusionKinds = resolutions.data?.fusion.firesOn ?? ['12h', '24h'];
  const summary = useFleetSummary(scope.params, windowKind);
  // v2.5 (1H.6, spec §4.7): Instrumental health filters are applied by the SERVER (?health=),
  // because the rankings page is LIMITed — filtering a page in the browser would rank a subset.
  const healthFilter = (params.get('health') as CpmHealthFilter | null) ?? undefined;
  const setHealthFilter = (v?: CpmHealthFilter) => setParams(p => {
    const n = new URLSearchParams(p);
    if (v) n.set('health', v); else n.delete('health');
    n.delete('page');
    return n;
  }, { replace: true });
  // CHG-093 (SME review 2 #10/#11): the headline is computed by the server over EVERY assessed loop in the scope (the
  // Overview KPIs' classification), with its exclusions — no longer over the 50 most confident loops of a ranked page
  const fleetKpis = useFleetKpis({ ...scope.params, windowKind });
  const conditionFilter = (
    <select className="cpm-select" aria-label="Instrument health condition" value={healthFilter ?? ''}
      onChange={e => setHealthFilter((e.target.value || undefined) as CpmHealthFilter | undefined)}>
      <option value="">Any condition</option>
      {HEALTH_FILTERS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
    </select>
  );
  const rank = useLoopRank(scope.params, windowKind, sort, healthFilter);
  const heatmap = useFleetHeatmap(scope.params, windowKind, healthFilter);
  // CHG-066: the loops' optional-input context, so the matrix marks a pass judged without an input like the Explorer does
  const registry = useCpmLoops();

  // the capability tile counts the monitored loops: the population its drill-down lists
  const fleetTotal = summary.data?.loops.monitored ?? null;

  const heatmapLoops = useMemo(() => heatmap.data?.loops ?? [], [heatmap.data]);
  const inputFlagsOf = useMemo(() => {
    const byId = new Map((registry.data?.loops ?? []).map(l => [l.loopId.toLowerCase(), l]));
    const flagsById = new Map(heatmapLoops.map(r => [r.loopId.toLowerCase(), r.observabilityFlags ?? []]));
    return (loopId: string) => effectiveInputFlags(flagsById.get(loopId.toLowerCase()), inputContextOf(byId.get(loopId.toLowerCase())));
  }, [registry.data, heatmapLoops]);
  const tierGroups = useMemo(
    () => buildTierGroups(heatmap.data?.gateKeys ?? []), [heatmap.data?.gateKeys]);
  const orderedGateKeys = useMemo(() => tierGroups.flatMap(g => g.keys), [tierGroups]);

  // Staleness: a diagnostic screen that silently shows yesterday's verdicts as
  // current is the dangerous failure mode. The payload already carries the time.
  const newestWindow = useMemo(() => latestWindowEnd(heatmapLoops), [heatmapLoops]);
  const windowAgeMs = newestWindow != null ? Date.now() - newestWindow : null;
  const stale = windowAgeMs != null && windowAgeMs > STALE_AFTER_MS;

  const selectedRow = heatmapLoops.find(
    l => l.loopId.toLowerCase() === (selectedLoop ?? '').toLowerCase());

  return (
    <div className="cpm-screen">
      <WorkspaceHeader
        page="/cpm/performance"
        title="Performance"
        // CHG-089: the shared switch (only a served kind reaches onChange, so an empty first emit never reaches ?window=)
        // Why only these sizes: this screen shows FUSED verdicts, which fusion produces on these windows alone. The finer
        // 1m…60m results live in the Window Inspector, and the ? says so. The reason for a disabled button rides on a
        // wrapping span (ObcButton takes no title) and in the text (CHG-098, SME review 2 #29).
        actions={<>
          <span title={selectedLoop ? `Per-window results for ${selectedLoop}` : 'Select a loop in the list to open its per-window results'}>
            <ObcButton variant="flat" disabled={!selectedLoop}
              onClick={() => { if (selectedLoop) navigate(windowsHref(selectedLoop)); }}>
              Window Inspector ↗
            </ObcButton>
          </span>
          <WindowKindToggle value={windowKind} kinds={fusionKinds} onChange={v => write(p => p.set('window', v))} />
          <Toggletip variant="how-to" label="About these windows">
            <p>
              Verdicts fuse on {fusionKinds.join(' / ')} rolling windows
              {(() => {
                const cadence = resolutions.data?.windows.find(w => fusionKinds.includes(w.kind))?.cadenceMs;
                return cadence ? ` (recomputed every ${Math.round(cadence / 60_000)} min)` : '';
              })()} ·
              per-window 1m–60m features are in the Window Inspector.
            </p>
          </Toggletip>
        </>}
      />

      <PerformanceKpis performance={fleetKpis.data?.performance} failed={fleetKpis.isError} fleetTotal={fleetTotal}
        capability={summary.data?.capability} scope={scope.params} windowKind={windowKind} healthFiltered={Boolean(healthFilter)} />

      <section className="cpm-surface">
        {/* A verdict's age is explained by the engine, not by this screen (A5): the line shows only when the data is stale. */}
        <PanelHead title="Gate summary"
          right={<ObcButton variant="flat" onClick={() => setShowGuide(true)}>How to read</ObcButton>} />
        <div className="cpm-perf-bar">
          {stale && windowAgeMs != null && newestWindow != null && (
            <p className="cpm-freshness cpm-freshness--stale" role="status">
              Stale · Newest fused window emitted {fmtAge(windowAgeMs)} ago ({fmtDateTime(new Date(newestWindow).toISOString())})
              {canPipeline && (
                <ObcButton variant="flat" title="Job states and checkpoint health of the CPLM engines"
                  onClick={() => navigate(pipelineHref())}>
                  Pipeline Health ↗
                </ObcButton>
              )}
            </p>
          )}
        </div>

        {heatmap.isLoading && <EmptyState title="Loading gate matrix…" />}
        {heatmap.isError && (
          <QueryError title="Gate matrix unavailable" error={heatmap.error}
            retry={() => void heatmap.refetch()} />
        )}
        {/* The matrix goes when the condition matches nothing, and the condition must not go with it */}
        {healthFilter && heatmapLoops.length === 0 && <div className="cpm-matrix-toolbar">{conditionFilter}</div>}
        {!heatmap.isLoading && !heatmap.isError && heatmapLoops.length === 0 && healthFilter && (
          <EmptyState title="No loop matches this condition"
            copy={`No monitored loop in this plant scope has “${HEALTH_FILTERS.find(f => f.id === healthFilter)?.label}”.`}
            action={{ label: 'Any condition', onClick: () => setHealthFilter(undefined) }} />
        )}
        {!heatmap.isLoading && !heatmap.isError && heatmapLoops.length === 0 && !healthFilter && (
          // CHG-098 (SME review 2 #29): the route, not only the instruction.
          <EmptyState title="No monitored loops"
            copy="No loop in this plant scope is monitored. Widen the plant scope in the header, or onboard loops in the Loop Registry to populate the matrix."
            next={[{ label: 'Loop Registry', to: registryHref() }]} />
        )}

        {heatmapLoops.length > 0 && (
          <>
            <GateRollup
              loops={heatmapLoops}
              gateKeys={orderedGateKeys}
              activeGate={scopeFilter.gate}
              onSelectGate={gate => setFilter({ gate })}
            />

            <GateMatrix
              loops={heatmapLoops}
              orderedGateKeys={orderedGateKeys}
              tierGroups={tierGroups}
              filter={scopeFilter}
              onFilterChange={setFilter}
              page={page}
              onPageChange={setPage}
              selectedLoopId={selectedLoop}
              onSelectLoop={selectLoop}
              onOpenLoop={openLoop}
              onOpenGate={openEvidence}
              windowKind={windowKind}
              inputFlagsOf={inputFlagsOf}
              view={matrixView}
              onViewChange={setMatrixView}
              sort={sort}
              onSortChange={setSort}
              rank={rank}
              toolbarStart={conditionFilter}
              fleetTotal={heatmap.data?.total ?? fleetTotal}
              band={selectedRow && <SelectedLoopBand row={selectedRow} windowKind={windowKind} onOpenLoop={openLoop} />}
            />
          </>
        )}
      </section>

      <HowToReadDialog open={showGuide} onClose={() => setShowGuide(false)} summary={summary.data} />

      {selectedRow && openGate && (
        <PerformanceGateDialog row={selectedRow} gate={openGate} windowKind={windowKind} gateKeys={orderedGateKeys}
          flags={inputFlagsOf(selectedRow.loopId)} onSelectGate={gate => openEvidence(selectedRow.loopId, gate)} onClose={closeEvidence} />
      )}
    </div>
  );
};

export default CpmPerformance;
