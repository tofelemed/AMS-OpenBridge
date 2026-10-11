'use client';

/**
 * CPLM Phase 7 — U3 Performance.
 *
 * Composition only: KPI tiles, the fleet gate roll-up, the gate matrix, the
 * docked evidence panel and the attention list each own their own file. The
 * screen's job here is the URL contract that ties them together.
 *
 * IA change from the CPA-parity version: the matrix is no longer the entry
 * point. The roll-up answers "where is the fleet failing" in one glance and the
 * matrix is its drill-down, filtered by default to loops that have something to
 * say. Selecting a gate opens evidence beside the matrix rather than on top of
 * it, because reading evidence and scanning the row is one task, not two.
 *
 * Every figure is real; where a metric has no model yet the tile says so.
 */
import React, { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ObcFilterChip } from '@oicl/openbridge-webcomponents-react/components/filter-chip/filter-chip';
import type { CpmHealthFilter } from '../../api/cpmApi';
import WindowKindToggle from './explorer/summary/WindowKindToggle';
import { windowKindOf } from './useWindowKind';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObiHelp } from '@oicl/openbridge-webcomponents-react/icons/icon-help';
import {
  EmptyState, KpiTile, PanelHead, WorkspaceHeader, QueryError, fmtDateTime,
} from './shared';
import { PlantScopeFilter, useCpmScope } from './plantScope';
import GateRollup from './GateRollup';
import GateMatrix, { type MatrixScope } from './GateMatrix';
import GateEvidencePanel, { GateGuidePanel } from './GateEvidencePanel';
import { diagnosticCapabilityCopy } from './overview/capabilityCopy';
import AttentionList, { type RankBy } from './AttentionList';
import { useBadActors } from './useBadActors';
import { buildTierGroups, isRowFilter, latestWindowEnd } from './gateStatus';
import { useCpmLoops, useCpmResolutions, useFleetHeatmap, useFleetRankings, useFleetSummary } from '../../hooks/useCpm';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { explorerHref, pipelineHref, windowsHref } from './cpaHref';
import { diagnosisLabel } from './vocabulary';
import { evidenceScoreText } from './evidenceScore';
import { hasVerdict } from './metricAvailability';
import { effectiveInputFlags } from './inputLimits';
import { inputContextOf } from './optionalInputs';

/** v2.5 (1H.6): the three fleet health filters the server understands (spec §4.7). */
const HEALTH_FILTERS: { id: CpmHealthFilter; label: string }[] = [
  { id: 'missing-binding', label: 'Missing binding' },
  { id: 'stale-collection', label: 'Stale collection' },
  { id: 'active-affected', label: 'Active affected-device condition' },
];

/** Below this the workspace cannot carry a second column; evidence goes modal. */
const DOCK_QUERY = '(min-width: 1200px)';
/** A fused window older than this is called out rather than shown as current. */
const STALE_AFTER_MS = 3 * 3_600_000;

const median = (xs: number[]) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const fmtAge = (ms: number) =>
  ms < 3_600_000 ? `${Math.round(ms / 60_000)} min` : `${(ms / 3_600_000).toFixed(1)} h`;

export const CpmPerformance: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const windowKind = windowKindOf(params.get('window'));   // CHG-089: 12h by default, 24h on request
  const selectedLoop = params.get('loop');
  const openGate = params.get('gate');
  const [rankBy, setRankBy] = React.useState<RankBy>('confidence');
  const docked = useMediaQuery(DOCK_QUERY);

  // ── URL contract. Mode + gate filter are shareable; page follows them.
  const modeParam = params.get('rows');
  const scopeFilter: MatrixScope = {
    mode: isRowFilter(modeParam) ? modeParam : 'attention',
    gate: params.get('fg'),
  };
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);

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

  const setPage = React.useCallback((n: number) => {
    write(p => { if (n <= 1) p.delete('page'); else p.set('page', String(n)); });
  }, [write]);

  const selectLoop = React.useCallback((loopId: string) => {
    write(p => p.set('loop', loopId));
  }, [write]);

  // A loop id is a route (cpa-ui-fix-plan Phase 2): the matrix loop cell and the
  // attention list open the loop hub; selection stays with the gate cells.
  const navigate = useNavigate();
  // The hub opens on the same fused window the matrix was showing (`?window=` is read by both).
  const openLoop = React.useCallback((loopId: string) => {
    navigate(explorerHref(loopId, { tab: 'Summary', kind: windowKind }));
  }, [navigate, windowKind]);

  // Guidance is ephemeral and personal — it does not belong in a shareable URL
  // the way the row filter and the open gate do. Opening evidence takes the
  // column back, so the two can never fight over it.
  const [showGuide, setShowGuide] = React.useState(false);

  const openEvidence = React.useCallback((loopId: string, gate: string) => {
    setShowGuide(false);
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
  const rankings = useFleetRankings(scope.params, windowKind, 'confidence', 50, true, healthFilter);
  // CHG-023 (P0-2): by confidence this is a slice of `rankings` — no second request;
  // only the "error" order (a different server ORDER BY) costs its own call.
  const badActors = useBadActors(scope.params, windowKind, rankBy, healthFilter);
  const heatmap = useFleetHeatmap(scope.params, windowKind, healthFilter);
  // CHG-066: the loops' optional-input context, so the matrix marks a pass judged without an input like the Explorer does
  const registry = useCpmLoops();

  const loops = useMemo(() => rankings.data?.loops ?? [], [rankings.data]);
  // CHG-066: "evaluated" = a real verdict — an excluded or insufficient window is not a performance figure
  const evaluated = loops.filter(l => hasVerdict(l.diagnosis));

  // Aggregates over the loops this page fetched — a capped, confidence-ordered
  // page, NOT the fleet. `truncated` drives the wording so the tiles never claim
  // a fleet figure they do not have.
  // CHG-066: the same population as `evaluated` — monitored loops with a real LIVE verdict; under a health filter the
  // (filtered) matrix rows, since the summary is not health-filtered
  const fleetEvaluated = healthFilter
    ? (heatmap.data?.loops ?? []).filter(l => hasVerdict(l.diagnosis) || hasVerdict(l.lastVerdict?.diagnosis)).length
    : (summary.data?.diagnoses ?? []).filter(d => hasVerdict(d.diagnosis)).reduce((n, d) => n + d.count, 0);
  const truncated = fleetEvaluated > evaluated.length;

  const medianMae = median(
    evaluated.map(l => l.metrics.mae).filter((x): x is number => x != null && x > 0));
  const avgGoodError = (() => {
    // goodErrorPct is a 0..1 FRACTION from the engine; scale to percent here.
    const xs = evaluated.map(l => l.metrics.goodErrorPct).filter((x): x is number => x != null);
    return xs.length ? (100 * xs.reduce((a, b) => a + b, 0)) / xs.length : null;
  })();
  // acfPeriodS > 0 is NOT evidence of a problem — count the diagnosis the engine
  // actually reached; that is what "evidence" means on this screen.
  const oscillating = evaluated.filter(l =>
    l.diagnosis.includes('OSCILLATION') || l.diagnosis.includes('FINAL_ELEMENT')).length;

  const capped = summary.data?.capability.loopsCappedByMissingVp ?? null;
  const fleetTotal = summary.data?.loops.total ?? null;

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
        actions={<WindowKindToggle value={windowKind} kinds={fusionKinds} onChange={v => write(p => p.set('window', v))} />}
      />
      {/* Why only these sizes: this screen shows FUSED verdicts, which fusion
          produces on these windows alone. The finer 1m…60m results exist and
          live in the Window Inspector — say so instead of looking like a
          chart-range picker with two odd choices. */}
      <p className="cpm-copy">
        Verdicts fuse on {fusionKinds.join(' / ')} rolling windows
        {(() => {
          const cadence = resolutions.data?.windows.find(w => fusionKinds.includes(w.kind))?.cadenceMs;
          return cadence ? ` (recomputed every ${Math.round(cadence / 60_000)} min)` : '';
        })()} ·
        per-window 1m–60m features are in the{' '}
        <ObcButton variant="flat"
          title={selectedLoop ? `Per-window results for ${selectedLoop}` : 'Select a loop in the matrix to open its per-window results'}
          disabled={!selectedLoop}
          onClick={() => { if (selectedLoop) navigate(windowsHref(selectedLoop)); }}>
          Window Inspector ›
        </ObcButton>
      </p>
      <PlantScopeFilter
        scope={scope}
        summary={summary.data ? `${summary.data.loops.monitored} monitored loop(s) in scope` : null}
      />

      <div className="cpm-chip-row" role="group" aria-label="Instrument health filter">
        {HEALTH_FILTERS.map(f => (
          <ObcFilterChip
            key={f.id}
            label={f.label}
            checked={healthFilter === f.id}
            onChipToggle={() => setHealthFilter(healthFilter === f.id ? undefined : f.id)}
          />
        ))}
        {healthFilter && (
          <span className="cpm-event-row__sub">
            ranking only loops matching “{HEALTH_FILTERS.find(f => f.id === healthFilter)?.label}” (server-side)
          </span>
        )}
      </div>

      <div className="cpm-kpi-row">
        <KpiTile caption="Good-error time"
          tone={avgGoodError != null && avgGoodError >= 80 ? 'good' : 'warn'}
          value={avgGoodError != null ? `${avgGoodError.toFixed(1)}%` : '—'}
          sub={avgGoodError == null ? 'no evaluated loops yet'
            : truncated ? `mean of top ${evaluated.length} of ${fleetEvaluated} evaluated`
              : `mean of all ${evaluated.length} evaluated loop(s)`} />
        <KpiTile caption="Median MAE" tone="good"
          value={medianMae != null ? medianMae.toFixed(2) : '—'}
          sub={medianMae == null ? 'no evaluated loops yet'
            : truncated ? `top ${evaluated.length} of ${fleetEvaluated} evaluated · PV units`
              : `${evaluated.length} evaluated loop(s) · PV units`} />
        <KpiTile caption="Loops with periodic diagnosis" tone={oscillating > 0 ? 'warn' : 'good'}
          value={oscillating}
          sub={truncated ? `of top ${evaluated.length} of ${fleetEvaluated} evaluated`
            : `of ${evaluated.length} evaluated`} />
        {/* Replaces the "Potential savings —" tile, which spent a quarter of the
            KPI row saying a model was not configured. Diagnostic capability is a
            fleet fact that changes what an engineer does next. */}
        <KpiTile caption="Diagnostic capability"
          tone={capped != null && capped > 0 ? 'warn' : 'good'}
          value={diagnosticCapabilityCopy(fleetTotal ?? null, capped, summary.data?.capability).value}
          sub={diagnosticCapabilityCopy(fleetTotal ?? null, capped, summary.data?.capability).sub} />
      </div>

      <section className="cpm-surface">
        <PanelHead
          eyebrow="Calculation pathway"
          title={`Gate status by loop · latest ${windowKind} window`}
          right={
            <div className="cpm-pathway-head">
              <button
                type="button"
                className="cpm-help-toggle"
                aria-expanded={showGuide}
                aria-controls="cpm-gate-guide"
                onClick={() => setShowGuide(v => !v)}
              >
                <ObiHelp aria-hidden />
                How to read this
              </button>
            </div>
          }
        />

        {windowAgeMs != null && (
          <p className={`cpm-freshness${stale ? ' cpm-freshness--stale' : ''}`} role="status">
            {stale ? 'Stale · ' : ''}Newest fused window emitted {fmtAge(windowAgeMs)} ago
            {newestWindow != null ? ` (${fmtDateTime(new Date(newestWindow).toISOString())})` : ''}
            {/* A5: a verdict's age is explained by the engine, not by this screen. */}
            <ObcButton variant="flat" title="Job states and checkpoint health of the CPLM engines"
              onClick={() => navigate(pipelineHref())}>
              Pipeline Health ›
            </ObcButton>
          </p>
        )}

        {heatmap.isLoading && <EmptyState title="Loading gate matrix…" />}
        {heatmap.isError && (
          <QueryError title="Gate matrix unavailable" error={heatmap.error}
            retry={() => void heatmap.refetch()} />
        )}
        {!heatmap.isLoading && !heatmap.isError && heatmapLoops.length === 0 && (
          <EmptyState title="No monitored loops"
            copy="Onboard loops in the Loop Registry to populate the matrix." />
        )}

        {heatmapLoops.length > 0 && (
          <>
            <GateRollup
              loops={heatmapLoops}
              tierGroups={tierGroups}
              activeGate={scopeFilter.gate}
              onSelectGate={gate => setFilter({ gate })}
            />

            {/* The second column exists only when something occupies it, so an
                idle matrix gets the full width back. */}
            <div className={`cpm-matrix-layout${
              docked && (openGate || showGuide) ? ' cpm-matrix-layout--split' : ''}`}>
              <div className="cpm-matrix-layout__main">
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
                  inputFlagsOf={inputFlagsOf}
                  fleetTotal={heatmap.data?.total ?? fleetTotal}
                />

                {selectedRow && (
                  <div className="cpm-matrix-summary">
                    <div>
                      <strong>{selectedRow.loopId}</strong> · {selectedRow.displayName}
                      <div className="cpm-event-row__sub">
                        Selected row · latest {windowKind} fused result
                        {selectedRow.windowEnd ? ` · ${fmtDateTime(selectedRow.windowEnd)}` : ''}
                      </div>
                    </div>
                    <span className="cpm-copy">
                      Final diagnosis {diagnosisLabel(selectedRow.diagnosis)}
                      {selectedRow.confidence != null
                        ? ` · ${evidenceScoreText(selectedRow.confidence)}` : ''}
                    </span>
                    <div className="cpm-filter-row">
                      <ObcButton variant="raised"
                        onClick={() => openEvidence(selectedRow.loopId, 'G15')}>
                        Open fused evidence ›
                      </ObcButton>
                      <ObcButton variant="normal" title={`Open ${selectedRow.loopId} in the Loop Explorer`}
                        onClick={() => openLoop(selectedRow.loopId)}>
                        Open loop ›
                      </ObcButton>
                    </div>
                  </div>
                )}
              </div>

              {/* One slot, three states: empty, requested guidance, or evidence.
                  Undocked the same slot stacks below the matrix, and evidence
                  goes modal further down instead. */}
              {docked && selectedLoop && openGate ? (
                <GateEvidencePanel
                  loopId={selectedLoop}
                  gateKey={openGate}
                  windowKind={windowKind}
                  gateKeys={orderedGateKeys}
                  onSelectGate={gate => openEvidence(selectedLoop, gate)}
                  onClose={closeEvidence}
                  docked
                />
              ) : showGuide && (
                <GateGuidePanel summary={summary.data} onClose={() => setShowGuide(false)} />
              )}
            </div>
          </>
        )}
      </section>

      <AttentionList
        ranked={badActors.data?.loops ?? []}
        heatmapLoops={heatmapLoops}
        gateKeys={orderedGateKeys}
        rankBy={rankBy}
        onRankByChange={setRankBy}
        isLoading={badActors.isLoading}
        isError={badActors.isError}
        error={badActors.error}
        retry={() => void badActors.refetch()}
        selectedLoopId={selectedLoop}
        onSelectLoop={selectLoop}
        onOpenLoop={openLoop}
        onOpenGate={openEvidence}
      />

      {!docked && selectedLoop && openGate && (
        <GateEvidencePanel
          loopId={selectedLoop}
          gateKey={openGate}
          windowKind={windowKind}
          gateKeys={orderedGateKeys}
          onSelectGate={gate => openEvidence(selectedLoop, gate)}
          onClose={closeEvidence}
          docked={false}
        />
      )}
    </div>
  );
};

export default CpmPerformance;
