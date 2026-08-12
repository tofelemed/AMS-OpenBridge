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

  const summary = useFleetSummary();
  const rankings = useFleetRankings(undefined, windowKind);
  const heatmap = useFleetHeatmap(undefined, windowKind);

  const loops = useMemo(() => rankings.data?.loops ?? [], [rankings.data]);
  const evaluated = loops.filter(l => l.diagnosis !== 'NOT_EVALUATED');

  // Fleet aggregates from real per-loop metrics.
  const medianMae = median(evaluated.map(l => l.metrics.mae).filter((x): x is number => x != null && x > 0));
  const avgGoodError = (() => {
    // goodErrorPct is a 0..1 FRACTION from the engine; scale to percent here.
    const xs = evaluated.map(l => l.metrics.goodErrorPct).filter((x): x is number => x != null);
    return xs.length ? (100 * xs.reduce((a, b) => a + b, 0)) / xs.length : null;
  })();
  const oscillating = evaluated.filter(l =>
    (l.metrics.acfPeriodS ?? 0) > 0 || l.diagnosis.includes('OSCILLATION')
    || l.diagnosis.includes('FINAL_ELEMENT')).length;

  const ranked = useMemo(() => {
    const rows = [...loops];
    if (rankBy === 'confidence') rows.sort((a, b) => (b.confidence ?? -1) - (a.confidence ?? -1));
    // Sentinel above any real fraction so unevaluated loops sink to the bottom.
    else rows.sort((a, b) => (a.metrics.goodErrorPct ?? 1.01) - (b.metrics.goodErrorPct ?? 1.01));
    return rows.slice(0, 8);
  }, [loops, rankBy]);

  const gateKeys = heatmap.data?.gateKeys ?? TIER_GROUPS.flatMap(g => g.keys);
  const selectedRow = heatmap.data?.loops.find(l => l.loopId === selectedLoop);
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
                onClick={() => setParams(p => { p.set('window', w); return p; })}>
                {w}
              </ObcButton>
            ))}
          </div>
        }
      />

      <div className="cpm-kpi-row">
        <KpiTile caption="Good-error time" tone={avgGoodError != null && avgGoodError >= 80 ? 'good' : 'warn'}
          value={avgGoodError != null ? `${avgGoodError.toFixed(1)}%` : '—'}
          sub={avgGoodError != null ? 'fleet average, evaluated loops' : 'no evaluated loops yet'} />
        <KpiTile caption="Median MAE" tone="good"
          value={medianMae != null ? `${medianMae.toFixed(2)} EU` : '—'}
          sub={medianMae != null ? `${evaluated.length} evaluated loop(s)` : 'no evaluated loops yet'} />
        <KpiTile caption="Loops with periodic evidence" tone={oscillating > 0 ? 'warn' : 'good'}
          value={oscillating} sub={`of ${evaluated.length} evaluated`} />
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
                  {TIER_GROUPS.map(g => (
                    <th key={g.label} colSpan={g.keys.length} className="cpm-matrix__tier">{g.label}</th>
                  ))}
                  <th rowSpan={2} className="cpm-matrix__result">Result</th>
                </tr>
                <tr>
                  {gateKeys.map(k => <th key={k} className="cpm-matrix__gate">{k}</th>)}
                </tr>
              </thead>
              <tbody>
                {heatmap.data!.loops.map(row => (
                  <tr key={row.loopId}
                    className={selectedLoop === row.loopId ? 'cpm-matrix__row--selected' : undefined}
                    onClick={() => setParams(p => { p.set('loop', row.loopId); return p; })}>
                    <td className="cpm-matrix__loop">
                      <strong>{row.loopId}</strong>
                      <div className="cpm-event-row__sub">{row.displayName}</div>
                    </td>
                    {gateKeys.map(k => {
                      const g = glyphFor(row.gates[k] ?? 'NOT_EVALUATED');
                      return (
                        <td key={k}>
                          <button
                            type="button"
                            className={`cpm-matrix__cell cpm-tone-${g.tone}`}
                            title={`${row.loopId} · ${k} · ${row.gates[k] ?? 'NOT_EVALUATED'}`}
                            onClick={e => {
                              e.stopPropagation();
                              setParams(p => { p.set('loop', row.loopId); return p; });
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
          {ranked.length === 0 && <EmptyState title="No ranked loops yet" />}
          {ranked.map((l, i) => (
            <div key={l.loopId} className="cpm-kv">
              <span className="cpm-kv__label">#{i + 1} · <strong>{l.loopId}</strong> · {l.displayName}</span>
              <span className="cpm-kv__value">
                <TonePill tone={toneFor(l.diagnosis)}>{l.diagnosis.replace(/_/g, ' ')}</TonePill>
                {l.confidence != null ? ` ${(l.confidence * 100).toFixed(0)}%` : ''}
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
