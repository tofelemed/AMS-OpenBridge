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
import { Link, useSearchParams } from 'react-router-dom';
import { ObcToggleButtonGroup } from '@oicl/openbridge-webcomponents-react/components/toggle-button-group/toggle-button-group';
import { ObcToggleButtonOption } from '@oicl/openbridge-webcomponents-react/components/toggle-button-option/toggle-button-option';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObiHelp } from '@oicl/openbridge-webcomponents-react/icons/icon-help';
import {
  EmptyState, KpiTile, PanelHead, WorkspaceHeader, QueryError, fmtDateTime,
} from './shared';
import { PlantScopeFilter, useCpmScope } from './plantScope';
import GateRollup from './GateRollup';
import GateMatrix, { type MatrixScope } from './GateMatrix';
import GateEvidencePanel, { GateGuidePanel } from './GateEvidencePanel';
import AttentionList, { type RankBy } from './AttentionList';
import { buildTierGroups, isRowFilter, latestWindowEnd } from './gateStatus';
import { useCpmResolutions, useFleetHeatmap, useFleetRankings, useFleetSummary } from '../../hooks/useCpm';
import { useMediaQuery } from '../../hooks/useMediaQuery';

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
  const windowKind = params.get('window') ?? '24h';
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
  const rankings = useFleetRankings(scope.params, windowKind);
  const badActors = useFleetRankings(
    scope.params, windowKind, rankBy === 'error' ? 'error' : 'confidence', 12);
  const heatmap = useFleetHeatmap(scope.params, windowKind);

  const loops = useMemo(() => rankings.data?.loops ?? [], [rankings.data]);
  const evaluated = loops.filter(l => l.diagnosis !== 'NOT_EVALUATED');

  // Aggregates over the loops this page fetched — a capped, confidence-ordered
  // page, NOT the fleet. `truncated` drives the wording so the tiles never claim
  // a fleet figure they do not have.
  const fleetEvaluated = (summary.data?.diagnoses ?? []).reduce((n, d) => n + d.count, 0);
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
        eyebrow="Fleet and loop analytics"
        title="Performance"
        copy="Compare health, control effectiveness, effort, and qualified diagnostic evidence."
        // The group can emit an empty value on its first update (its slot is not
        // assigned yet when willUpdate runs). Writing that to ?window= would send
        // an empty windowKind to every fleet endpoint, so only known kinds pass.
        actions={
          <ObcToggleButtonGroup
            value={windowKind}
            aria-label="Fused evaluation window"
            onValue={(e: CustomEvent<{ value: string }>) => {
              const v = e.detail.value;
              if (fusionKinds.includes(v)) write(p => p.set('window', v));
            }}
          >
            {fusionKinds.map(k => (
              <ObcToggleButtonOption key={k} value={k}>{k}</ObcToggleButtonOption>
            ))}
          </ObcToggleButtonGroup>
        }
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
        <Link to={`/cpm/windows${selectedLoop ? `?loop=${encodeURIComponent(selectedLoop)}` : ''}`}>
          Window Inspector ›
        </Link>
      </p>
      <PlantScopeFilter
        scope={scope}
        summary={fleetTotal != null ? `${fleetTotal} loop(s) in scope` : null}
      />

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
          value={capped != null && fleetTotal != null ? `${fleetTotal - capped}/${fleetTotal}` : '—'}
          sub={capped == null ? 'fleet capability unavailable'
            : capped > 0 ? `${capped} loop(s) capped at 0.89 — no VP signal`
              : 'every loop can reach CONFIRMED'} />
      </div>

      <section className="cpm-surface">
        <PanelHead
          eyebrow="Calculation pathway"
          title={`Gate status by loop · latest ${windowKind} window`}
          right={
            <div className="cpm-pathway-head">
              <span className="cpm-legend">
                <span className="cpm-legend__item"><span className="cpm-legend__chip cpm-matrix__cell--good">✓</span>Pass</span>
                <span className="cpm-legend__item"><span className="cpm-legend__chip cpm-matrix__cell--warn">!</span>Attention</span>
                <span className="cpm-legend__item"><span className="cpm-legend__chip cpm-matrix__cell--bad">×</span>Failed</span>
                <span className="cpm-legend__item"><span className="cpm-legend__chip cpm-matrix__cell--muted">—</span>Not evaluated</span>
              </span>
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
                  onOpenGate={openEvidence}
                  fleetTotal={fleetTotal}
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
                      Final diagnosis {selectedRow.diagnosis.replace(/_/g, ' ')}
                      {selectedRow.confidence != null
                        ? ` (${(selectedRow.confidence * 100).toFixed(0)}%)` : ''}
                    </span>
                    <ObcButton variant="raised"
                      onClick={() => openEvidence(selectedRow.loopId, 'G15')}>
                      Open fused evidence ›
                    </ObcButton>
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
