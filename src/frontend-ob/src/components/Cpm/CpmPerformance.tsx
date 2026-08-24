'use client';

/**
 * CPLM Phase 7 — U3 Performance.
 * CPA-prototype IA parity: KPI tiles, gate-status matrix (Loop × G0–G15+G2r
 * with grouped tier headers), selection summary bar, opportunity ranking, and
 * the guide card. Cell click opens the Gate Evidence Drawer. Every figure is
 * real; where a metric has no model yet (savings), the tile says so.
 */
import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import {
  EmptyState, KpiTile, PanelHead, TonePill, WorkspaceHeader, toneFor,
  fmtDateTime, QueryError } from './shared';
import { PlantScopeFilter, useCpmScope } from './plantScope';
import GateEvidenceDrawer from './GateEvidenceDrawer';
import { useFleetHeatmap, useFleetRankings, useFleetSummary } from '../../hooks/useCpm';

const TIER_GROUPS: { label: string; keys: string[] }[] = [
  { label: 'Eligibility', keys: ['G0', 'G1', 'G2', 'G2r'] },
  { label: 'Performance', keys: ['G3', 'G4'] },
  { label: 'Diagnostic evidence', keys: ['G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11'] },
  { label: 'Confirmation', keys: ['G12', 'G13', 'G14'] },
  { label: 'Fusion', keys: ['G15'] },
];

/** CPA glyph vocabulary: ✓ pass · ! attention · × failed · — not evaluated. */
function glyphFor(status: string): { glyph: string; tone: 'good' | 'warn' | 'bad' | 'muted' } {
  const s = status.toUpperCase();
  if (s === 'PASS') return { glyph: '✓', tone: 'good' };
  if (s === 'WARN' || s === 'STRONG' || s === 'REVIEW') return { glyph: '!', tone: 'warn' };
  if (s === 'FAIL' || s.startsWith('EXCLUDED')) return { glyph: '×', tone: 'bad' };
  return { glyph: '—', tone: 'muted' };
}

const median = (xs: number[]) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export const CpmPerformance: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const windowKind = params.get('window') ?? '24h';
  const selectedLoop = params.get('loop');
  const [drawer, setDrawer] = useState<{ loopId: string; gate: string } | null>(null);
  const [rankBy, setRankBy] = useState<'confidence' | 'error'>('confidence');

  // Plant scope (A6.1): the fleet endpoints now filter server-side by
  // site/area/unit, so "which section is worst" is answerable.
  const scope = useCpmScope();
  const summary = useFleetSummary(scope.params, windowKind);
  // The matrix/KPI feed stays confidence-ordered; the bad-actor panel asks the
  // SERVER for its own ordering (P3) instead of re-sorting this page of results.
  const rankings = useFleetRankings(scope.params, windowKind);
  const badActors = useFleetRankings(scope.params, windowKind, rankBy === 'error' ? 'error' : 'confidence', 8);
  const heatmap = useFleetHeatmap(scope.params, windowKind);

  const loops = useMemo(() => rankings.data?.loops ?? [], [rankings.data]);
  const evaluated = loops.filter(l => l.diagnosis !== 'NOT_EVALUATED');

  // Aggregates over the loops actually returned — which is a capped, confidence-
  // ordered page, NOT the fleet. They are labelled accordingly below; `truncated`
  // drives that wording so the tiles never claim a fleet figure they don't have.
  const fleetEvaluated = (summary.data?.diagnoses ?? []).reduce((n, d) => n + d.count, 0);
  const truncated = fleetEvaluated > evaluated.length;

  const medianMae = median(evaluated.map(l => l.metrics.mae).filter((x): x is number => x != null && x > 0));
  const avgGoodError = (() => {
    // goodErrorPct is a 0..1 FRACTION from the engine; scale to percent here.
    const xs = evaluated.map(l => l.metrics.goodErrorPct).filter((x): x is number => x != null);
    return xs.length ? (100 * xs.reduce((a, b) => a + b, 0)) / xs.length : null;
  })();
  // P4: acfPeriodS > 0 is NOT evidence of a problem — ACF returns a period for
  // most signals (it is non-zero on ~58% of stored results, while only ~8% carry
  // an oscillation/final-element diagnosis). Count the diagnosis the engine
  // actually reached; that is what "evidence" means on this screen.
  const oscillating = evaluated.filter(l =>
    l.diagnosis.includes('OSCILLATION') || l.diagnosis.includes('FINAL_ELEMENT')).length;

  const ranked = useMemo(() => badActors.data?.loops ?? [], [badActors.data]);

  const gateKeys = heatmap.data?.gateKeys ?? TIER_GROUPS.flatMap(g => g.keys);

  // P5: the group headers span hardcoded tier widths while the columns come from
  // the API. They agree today (17 keys, same order) — but if the engine ever adds
  // a gate, the header would keep spanning 17 columns while the body grew one, and
  // every glyph would sit under the wrong tier label with nothing to signal it.
  // Intersect the groups with the served keys so the spans always match the body,
  // and collect anything the API sent that no group claims.
  const tierGroups = useMemo(() => {
    const keySet = new Set(gateKeys);
    const groups = TIER_GROUPS
      .map(g => ({ label: g.label, keys: g.keys.filter(k => keySet.has(k)) }))
      .filter(g => g.keys.length > 0);
    const claimed = new Set(groups.flatMap(g => g.keys));
    const ungrouped = gateKeys.filter(k => !claimed.has(k));
    return ungrouped.length ? [...groups, { label: 'Other', keys: ungrouped }] : groups;
  }, [gateKeys]);
  // Render columns in the order the groups declare, so header and body agree.
  const orderedGateKeys = useMemo(() => tierGroups.flatMap(g => g.keys), [tierGroups]);

  // Case-insensitive, like every loop lookup in cplm-api.
  const selectedRow = heatmap.data?.loops.find(
    l => l.loopId.toLowerCase() === (selectedLoop ?? '').toLowerCase());
  const warnCount = selectedRow
    ? Object.values(selectedRow.gates).filter(s => glyphFor(s).tone === 'warn').length : 0;
  const badCount = selectedRow
    ? Object.values(selectedRow.gates).filter(s => glyphFor(s).tone === 'bad').length : 0;

  return (
    <div className="cpm-screen">
      <WorkspaceHeader
        eyebrow="Fleet and loop analytics"
        title="Performance"
        copy="Compare health, control effectiveness, effort, and qualified diagnostic evidence."
        actions={
          <div className="cpm-filter-row">
            {['12h', '24h'].map(w => (
              <ObcButton key={w} variant={windowKind === w ? 'raised' : 'normal'}
                onClick={() => setParams(p => { p.set('window', w); return p; }, { replace: true })}>
                {w}
              </ObcButton>
            ))}
          </div>
        }
      />
      <PlantScopeFilter scope={scope} summary={summary.data ? `${summary.data.loops.total} loop(s) in scope` : null} />

      <div className="cpm-kpi-row">
        {/* These are computed over the loops this page fetched — a capped,
            confidence-ordered page. Saying "fleet average" over a top-50 slice
            was a claim the data could not support, so the caption states the
            actual basis and names the shortfall when the fleet is larger. */}
        <KpiTile caption="Good-error time" tone={avgGoodError != null && avgGoodError >= 80 ? 'good' : 'warn'}
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
        <KpiTile caption="Potential savings" tone="muted" value="—"
          sub="no $/loop model configured" />
      </div>

      <section className="cpm-surface">
        <PanelHead
          eyebrow="Calculation pathway"
          title={`Gate status by loop · latest ${windowKind} window`}
          right={<span className="cpm-copy">✓ Pass · ! Attention · × Failed · — Not evaluated</span>}
        />
        {heatmap.isLoading && <EmptyState title="Loading gate matrix…" />}
        {heatmap.isError && <QueryError title="Gate matrix unavailable" error={heatmap.error} retry={() => void heatmap.refetch()} />}
        {!heatmap.isLoading && !heatmap.isError && (heatmap.data?.loops.length ?? 0) === 0 && (
          <EmptyState title="No monitored loops"
            copy="Onboard loops in the Loop Registry to populate the matrix." />
        )}
        {(heatmap.data?.loops.length ?? 0) > 0 && (
          <div className="cpm-matrix-scroll">
            <table className="cpm-matrix">
              <thead>
                <tr>
                  <th rowSpan={2} className="cpm-matrix__loop">Loop</th>
                  {tierGroups.map(g => (
                    <th key={g.label} colSpan={g.keys.length} className="cpm-matrix__tier">{g.label}</th>
                  ))}
                  <th rowSpan={2} className="cpm-matrix__result">Result</th>
                </tr>
                <tr>
                  {orderedGateKeys.map(k => <th key={k} className="cpm-matrix__gate">{k}</th>)}
                </tr>
              </thead>
              <tbody>
                {heatmap.data!.loops.map(row => (
                  <tr key={row.loopId}
                    className={selectedRow?.loopId === row.loopId ? 'cpm-matrix__row--selected' : undefined}
                    // P8 replace: selecting a row is in-page selection, not a page
                    // visit — clicking through a 20-row matrix left 20 back-steps.
                    // P9: the row was mouse-only; the cells inside are buttons but
                    // the row itself had no role, tab stop or key handler.
                    role="button"
                    tabIndex={0}
                    aria-pressed={selectedRow?.loopId === row.loopId}
                    onClick={() => setParams(p => { p.set('loop', row.loopId); return p; }, { replace: true })}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setParams(p => { p.set('loop', row.loopId); return p; }, { replace: true });
                      }
                    }}>
                    <td className="cpm-matrix__loop">
                      <strong>{row.loopId}</strong>
                      <div className="cpm-event-row__sub">{row.displayName}</div>
                    </td>
                    {orderedGateKeys.map(k => {
                      const g = glyphFor(row.gates[k] ?? 'NOT_EVALUATED');
                      return (
                        <td key={k}>
                          <button
                            type="button"
                            className={`cpm-matrix__cell cpm-tone-${g.tone}`}
                            title={`${row.loopId} · ${k} · ${row.gates[k] ?? 'NOT_EVALUATED'}`}
                            onClick={e => {
                              e.stopPropagation();
                              setParams(p => { p.set('loop', row.loopId); return p; }, { replace: true });
                              setDrawer({ loopId: row.loopId, gate: k });
                            }}
                          >
                            {g.glyph}
                          </button>
                        </td>
                      );
                    })}
                    <td className="cpm-matrix__result">
                      <TonePill tone={toneFor(row.diagnosis)}>
                        {row.diagnosis.replace(/_/g, ' ')}
                      </TonePill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

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
              {warnCount} gate(s) need attention · {badCount} blocking · final diagnosis{' '}
              {selectedRow.diagnosis.replace(/_/g, ' ')}
              {selectedRow.confidence != null ? ` (${(selectedRow.confidence * 100).toFixed(0)}%)` : ''}
            </span>
            <ObcButton variant="raised"
              onClick={() => setDrawer({ loopId: selectedRow.loopId, gate: 'G15' })}>
              Open evidence ›
            </ObcButton>
          </div>
        )}
      </section>

      <div className="cpm-grid-2">
        <section className="cpm-surface">
          <PanelHead
            eyebrow="Opportunity ranking"
            title="Bad actors"
            right={
              <select className="cpm-select" value={rankBy}
                onChange={e => setRankBy(e.target.value as 'confidence' | 'error')}>
                <option value="confidence">By confidence</option>
                <option value="error">By control error</option>
              </select>
            }
          />
          {badActors.isLoading && <EmptyState title="Ranking…" />}
          {badActors.isError && (
            <QueryError title="Ranking unavailable" error={badActors.error}
              retry={() => void badActors.refetch()} />
          )}
          {!badActors.isLoading && !badActors.isError && ranked.length === 0 && (
            <EmptyState title="No ranked loops yet" />
          )}
          {ranked.map((l, i) => (
            <div key={l.loopId} className="cpm-kv">
              <span className="cpm-kv__label">#{i + 1} · <strong>{l.loopId}</strong> · {l.displayName}</span>
              <span className="cpm-kv__value">
                <TonePill tone={toneFor(l.diagnosis)}>{l.diagnosis.replace(/_/g, ' ')}</TonePill>
                {/* Show the metric the ranking is actually by, not always confidence. */}
                {rankBy === 'error'
                  ? (l.metrics.goodErrorPct != null
                      ? ` good ${(l.metrics.goodErrorPct * 100).toFixed(0)}%` : '')
                  : (l.confidence != null ? ` ${(l.confidence * 100).toFixed(0)}%` : '')}
              </span>
            </div>
          ))}
        </section>

        <section className="cpm-surface">
          <PanelHead eyebrow="How to read the views" title="Gates tell you why." />
          <ol className="cpm-copy" style={{ paddingLeft: 18, margin: 0 }}>
            <li>Find an attention or failed cell in the matrix.</li>
            <li>Click the cell to open the evidence behind that gate.</li>
            <li>The result column is the fused verdict those gates produced.</li>
          </ol>
          {summary.data && (
            <p className="cpm-copy" style={{ marginTop: 12 }}>
              {summary.data.capability.loopsCappedByMissingVp} loop(s) are confidence-capped at
              0.89 by a missing VP signal; {summary.data.capability.loopsWithoutDisturbanceContext}{' '}
              cannot distinguish stiction from an upstream disturbance (no peer links).
            </p>
          )}
        </section>
      </div>

      {drawer && (
        <GateEvidenceDrawer
          loopId={drawer.loopId}
          gateKey={drawer.gate}
          windowKind={windowKind}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  );
};

export default CpmPerformance;
