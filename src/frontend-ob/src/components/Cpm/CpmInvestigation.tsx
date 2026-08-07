'use client';

/**
 * CPLM Phase 7 — U5 Investigation (/cpm/investigation?loop=&window=&case=).
 * CPA-prototype IA parity: analysis-case chips (derived from real fleet
 * verdicts, not a static library), live/historical controls, the
 * final-conclusion card, key-facts tiles, evidence chart, the
 * Eligibility→Evidence→Fusion reasoning chain with the machine reason code,
 * hypothesis comparison from real family scores, next-best action, and the
 * window browser with a PREVIOUS/CURRENT delta table. Case management beyond
 * a note on the event frame is DG-7 and is said so on screen.
 */
import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import {
  EmptyState, KpiTile, KvRow, LoopSelect, PanelHead, TonePill, WorkspaceHeader, toneFor,
} from './shared';
import type { CpmGateMatrix } from '../../api/cpmApi';
import {
  useAcknowledgeEvent, useCpmEvents, useCpmLoops, useCpmTrend,
  useFleetRankings, useGateHistory, useLatestGates,
} from '../../hooks/useCpm';
import { loopSeries } from '../../utils/loopSeries';

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Diagnosis → analysis case, CPA's chip vocabulary grounded in our verdicts. */
function caseFor(diagnosis: string): string {
  const d = diagnosis.toUpperCase();
  if (d.includes('FINAL_ELEMENT') || d.includes('STICTION')) return 'Valve / final element';
  if (d.includes('OSCILLATION')) return 'Oscillation';
  if (d.includes('TUNING')) return 'Tuning';
  if (d.includes('DISTURBANCE')) return 'External disturbance';
  if (d.includes('SENSOR') || d.includes('FREEZE')) return 'Sensor / measurement';
  if (d.startsWith('EXCLUDED') || d.startsWith('INSUFFICIENT')) return 'Not evaluable';
  if (d === 'NORMAL' || d === 'NONE') return 'Healthy';
  return 'Other';
}

/** Key facts — real stored metric fields with honest units. */
const KEY_FACTS: { field: string; label: string; unit: string; scale?: number }[] = [
  { field: 'stiction_score', label: 'Stiction score', unit: '' },
  { field: 'effort_ratio', label: 'Effort ratio', unit: '' },
  { field: 'triangularity', label: 'OP triangularity', unit: '' },
  { field: 'acf_period_s', label: 'Oscillation period', unit: 's' },
  { field: 'freeze_index_s', label: 'Freeze index', unit: 's' },
  // 0..1 fraction from the engine - scaled to percent by KEY_FACTS rendering.
  { field: 'good_error_pct', label: 'Good-error time', unit: '%', scale: 100 },
];

/** Family / detector scores for hypothesis comparison. */
const HYPOTHESES: { field: string; label: string }[] = [
  { field: 'stiction_family_score', label: 'Stiction family' },
  { field: 'effort_family_score', label: 'Actuator effort' },
  { field: 'fft_score', label: 'Spectral (FFT)' },
  { field: 'corner_score', label: 'Phase-portrait corners' },
  { field: 'acf_regularity', label: 'ACF regularity' },
  { field: 'raw_final_element_score', label: 'Weighted final-element' },
];

/** Reasoning-chain stages over the 17 gates. */
const CHAIN: { label: string; gates: string[]; question: string }[] = [
  { label: 'Eligibility', gates: ['G0', 'G1', 'G2', 'G2r'], question: 'Is the window evaluable at all?' },
  { label: 'Performance', gates: ['G3', 'G4'], question: 'Is control effective, and at what actuator cost?' },
  { label: 'Diagnostic evidence', gates: ['G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11'], question: 'What failure signature does the data carry?' },
  { label: 'Confirmation & fusion', gates: ['G12', 'G13', 'G14', 'G15'], question: 'Does context confirm it, and what verdict fuses out?' },
];

function stageTone(matrix: CpmGateMatrix | undefined, gates: string[]): 'good' | 'warn' | 'bad' | 'muted' {
  if (!matrix) return 'muted';
  const statuses = gates.map(g => matrix.gates.find(c => c.key === g)?.status ?? 'NOT_EVALUATED');
  if (statuses.some(s => s === 'FAIL' || s.startsWith('EXCLUDED'))) return 'bad';
  if (statuses.some(s => ['WARN', 'STRONG', 'REVIEW', 'SUSPECTED', 'INSUFFICIENT_EVIDENCE'].includes(s))) return 'warn';
  if (statuses.every(s => s === 'NOT_EVALUATED')) return 'muted';
  return 'good';
}

const fmt = (v: number | undefined, digits = 2) => (v != null ? v.toFixed(digits) : '—');

export const CpmInvestigation: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const loopsQuery = useCpmLoops();
  const rankings = useFleetRankings();

  const caseFilter = params.get('case');
  const allLoops = useMemo(() => loopsQuery.data?.loops ?? [], [loopsQuery.data]);
  const rankedLoops = useMemo(() => rankings.data?.loops ?? [], [rankings.data]);

  // Case chips from the fleet's actual verdicts.
  const cases = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of rankedLoops) counts.set(caseFor(l.diagnosis), (counts.get(caseFor(l.diagnosis)) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [rankedLoops]);

  const filteredLoops = useMemo(() => {
    if (!caseFilter) return allLoops;
    const ids = new Set(rankedLoops.filter(l => caseFor(l.diagnosis) === caseFilter).map(l => l.loopId));
    return allLoops.filter(l => ids.has(l.loopId));
  }, [allLoops, rankedLoops, caseFilter]);

  const loopId = params.get('loop') ?? filteredLoops[0]?.loopId ?? allLoops[0]?.loopId;
  const mode = params.get('mode') === 'historical' ? 'historical' : 'live';
  const windowKind = params.get('profile') === '12h' ? '12h' : '24h';

  const latest = useLatestGates(loopId, windowKind);
  const history = useGateHistory(loopId, windowKind);
  const windows = useMemo(() => {
    const rows = history.data?.windows ?? [];
    return [...rows].sort((a, b) => (b.windowEnd ?? '').localeCompare(a.windowEnd ?? ''));
  }, [history.data]);

  const selectedEnd = params.get('window');
  const matrix: CpmGateMatrix | undefined = mode === 'historical'
    ? (windows.find(w => w.windowEnd === selectedEnd) ?? windows[0])
    : latest.data;
  const previous = matrix
    ? windows[windows.findIndex(w => w.windowEnd === matrix.windowEnd) + 1]
    : undefined;

  // Evidence chart over the verdict's own window.
  const series = loopId ? loopSeries(loopId) : undefined;
  const { start, end } = useMemo(() => {
    if (matrix?.windowStart && matrix.windowEnd)
      return { start: new Date(matrix.windowStart), end: new Date(matrix.windowEnd) };
    const now = new Date();
    return { start: new Date(now.getTime() - 24 * 3600_000), end: now };
  }, [matrix?.windowStart, matrix?.windowEnd]);
  const trend = useCpmTrend(series, start, end, 280);
  const points = useMemo(() => trend.data?.points ?? [], [trend.data]);

  const chartOption = useMemo(() => {
    const good = cssVar('--instrument-enhanced-secondary-color', '#41be95');
    const amber = cssVar('--alert-caution-color', '#d79a40');
    const grey = cssVar('--on-container-neutral-color', '#9aa6af');
    const num = (v: unknown) => (typeof v === 'number' ? v : null);
    return {
      animation: false,
      grid: { left: 48, right: 16, top: 20, bottom: 30 },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'time', axisLabel: { color: grey } },
      yAxis: { type: 'value', scale: true, axisLabel: { color: grey }, splitLine: { lineStyle: { opacity: 0.2 } } },
      series: [
        { name: 'pv-min', type: 'line', stack: 'pv', silent: true, symbol: 'none',
          lineStyle: { width: 0 }, data: points.map(p => [p.ts, num(p.pv_min)]) },
        { name: 'pv-band', type: 'line', stack: 'pv', silent: true, symbol: 'none',
          lineStyle: { width: 0 }, areaStyle: { color: good, opacity: 0.18 },
          data: points.map(p => {
            const lo = num(p.pv_min); const hi = num(p.pv_max);
            return [p.ts, lo != null && hi != null ? hi - lo : null];
          }) },
        { name: 'PV', type: 'line', symbol: 'none', lineStyle: { color: good, width: 2 },
          data: points.map(p => [p.ts, num(p.pv_avg) ?? num(p.pv)]) },
        { name: 'SP', type: 'line', symbol: 'none', lineStyle: { color: grey, width: 1, type: 'dashed' },
          data: points.map(p => [p.ts, num(p.sp)]) },
        { name: 'OP', type: 'line', symbol: 'none', lineStyle: { color: amber, width: 1.5 },
          data: points.map(p => [p.ts, num(p.op_avg) ?? num(p.op)]) },
      ],
    };
  }, [points]);

  const metrics = matrix?.metrics ?? {};
  const machineReason = matrix?.insufficientEvidenceReason
    ?? matrix?.familyDisqualifiers[0]
    ?? matrix?.narrative?.statusReason
    ?? null;

  // Investigation note → the loop's open event frame (full cases are DG-7).
  const events = useCpmEvents({ loopId, openOnly: true, limit: 5 }, 60_000);
  const openFrame = events.data?.events.find(e => e.ack_state === 'UNACKNOWLEDGED');
  const ack = useAcknowledgeEvent();
  const [note, setNote] = useState('');

  const hypothesisRows = HYPOTHESES
    .map(h => ({ ...h, value: metrics[h.field] }))
    .filter(h => h.value != null);

  return (
    <div className="cpm-screen">
      <WorkspaceHeader
        eyebrow="Root-cause workspace"
        title="Investigation"
        copy="Follow one loop's evidence from raw signals through the gate chain to the fused conclusion."
      />

      <section className="cpm-surface">
        <PanelHead eyebrow="Analysis cases" title="What the fleet's verdicts contain"
          right={caseFilter && (
            <ObcButton variant="normal"
              onClick={() => setParams(p => { p.delete('case'); return p; })}>
              Clear filter
            </ObcButton>
          )} />
        {cases.length === 0 && <EmptyState title="No evaluated loops yet" />}
        <div className="cpm-filter-row">
          {cases.map(([c, n]) => (
            <ObcButton key={c} variant={caseFilter === c ? 'raised' : 'normal'}
              onClick={() => setParams(p => { p.set('case', c); p.delete('loop'); return p; })}>
              {c} · {n}
            </ObcButton>
          ))}
        </div>

        <div className="cpm-toolbar" style={{ marginTop: 12 }}>
          <LoopSelect loops={filteredLoops.length ? filteredLoops : allLoops} value={loopId ?? ''}
            onChange={id => setParams(p => { p.set('loop', id); p.delete('window'); return p; })} />
          <div className="cpm-filter-row">
            {(['live', 'historical'] as const).map(m => (
              <ObcButton key={m} variant={mode === m ? 'raised' : 'normal'}
                onClick={() => setParams(p => { p.set('mode', m); return p; })}>
                {m === 'live' ? 'Live (latest verdict)' : 'Historical'}
              </ObcButton>
            ))}
          </div>
          <label className="cpm-field">
            <span className="cpm-field__label">Profile</span>
            <select className="cpm-select" value={windowKind}
              onChange={e => setParams(p => { p.set('profile', e.target.value); p.delete('window'); return p; })}>
              <option value="24h">24h fused</option>
              <option value="12h">12h fused</option>
            </select>
          </label>
          {mode === 'historical' && (
            <label className="cpm-field">
              <span className="cpm-field__label">Evaluated window</span>
              <select className="cpm-select" value={matrix?.windowEnd ?? ''}
                onChange={e => setParams(p => { p.set('window', e.target.value); return p; })}>
                {windows.map(w => (
                  <option key={w.windowEnd ?? ''} value={w.windowEnd ?? ''}>
                    ends {w.windowEnd ? new Date(w.windowEnd).toLocaleString() : '—'}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </section>

      {!matrix && !latest.isLoading && (
        <section className="cpm-surface">
          <EmptyState title="No fused verdict for this loop"
            copy="Verdicts appear once the loop completes a 12h/24h evaluation window, or after a recompute." />
        </section>
      )}

      {matrix && (
        <>
          <div className="cpm-grid-2">
            <section className="cpm-surface">
              <PanelHead eyebrow="Final conclusion" title={(matrix.diagnosis ?? 'NONE').replace(/_/g, ' ')}
                right={<TonePill tone={toneFor(matrix.diagnosis)}>
                  {matrix.confidence != null ? `${(matrix.confidence * 100).toFixed(0)}% confidence` : 'no confidence'}
                </TonePill>} />
              <KvRow label="Window">
                {matrix.windowStart ? new Date(matrix.windowStart).toLocaleString() : '—'} →{' '}
                {matrix.windowEnd ? new Date(matrix.windowEnd).toLocaleString() : '—'} ({matrix.windowKind})
              </KvRow>
              <KvRow label="Severity">{matrix.severity ?? '—'}</KvRow>
              <KvRow label="Selected family">{matrix.narrative?.selectedFamily ?? '—'}</KvRow>
              <KvRow label="Machine reason">
                <span className="cpm-mono">{machineReason ?? '—'}</span>
              </KvRow>
              {matrix.familyDisqualifiers.length > 0 && (
                <KvRow label="Disqualifiers">
                  {matrix.familyDisqualifiers.map(d => (
                    <TonePill key={d} tone="warn">{d}</TonePill>
                  ))}
                </KvRow>
              )}
              {matrix.narrative?.recommendation && (
                <>
                  <PanelHead eyebrow="Next-best action" title="Engine recommendation" />
                  <p className="cpm-copy">{matrix.narrative.recommendation}</p>
                </>
              )}
            </section>

            <section className="cpm-surface">
              <PanelHead eyebrow="Key facts" title="Numeric evidence on this window" />
              <div className="cpm-kpi-row">
                {KEY_FACTS.map(f => (
                  <KpiTile key={f.field} caption={f.label} tone="muted"
                    value={metrics[f.field] != null
                      ? `${fmt(metrics[f.field]! * (f.scale ?? 1))}${f.unit}` : '—'}
                    sub={metrics[f.field] == null ? 'not in this payload' : undefined} />
                ))}
              </div>
            </section>
          </div>

          <section className="cpm-surface">
            <PanelHead eyebrow="Evidence" title="Signals over the evaluated window"
              right={<ObcButton variant="normal" onClick={() => {
                const q = new URLSearchParams({ loop: loopId ?? '' });
                if (matrix.windowEnd) q.set('window', matrix.windowEnd);
                navigate(`/cpm/replay?${q.toString()}`);
              }}>Open in Evidence Replay ›</ObcButton>} />
            {trend.isLoading && <EmptyState title="Loading signals…" />}
            {!trend.isLoading && points.length === 0 && (
              <EmptyState title="No historian data for this window" copy={`Nothing stored at ${series}.`} />
            )}
            {points.length > 0 && <ReactECharts option={chartOption} style={{ height: 260 }} notMerge />}
          </section>

          <div className="cpm-grid-2">
            <section className="cpm-surface">
              <PanelHead eyebrow="Reasoning chain" title="How the engine got there" />
              {CHAIN.map((c, i) => {
                const tone = stageTone(matrix, c.gates);
                return (
                  <div key={c.label} className="cpm-window-row">
                    <strong>{i + 1}. {c.label} <TonePill tone={tone}>{tone.toUpperCase()}</TonePill></strong>
                    <span className="cpm-event-row__sub">{c.question}</span>
                    <span className="cpm-event-row__sub">
                      {c.gates.map(g => `${g}:${(matrix.gates.find(x => x.key === g)?.status ?? '—').replace(/_/g, ' ')}`).join(' · ')}
                    </span>
                  </div>
                );
              })}
              <KvRow label="Machine reason code">
                <span className="cpm-mono">{machineReason ?? 'none — verdict fused cleanly'}</span>
              </KvRow>
            </section>

            <section className="cpm-surface">
              <PanelHead eyebrow="Hypothesis comparison" title="Family and detector scores" />
              {hypothesisRows.length === 0 && (
                <EmptyState title="No family scores on this window"
                  copy="Scores are produced by the long-diagnostics tier; short-only windows carry none." />
              )}
              {hypothesisRows.map(h => (
                <div key={h.field} className="cpm-kv">
                  <span className="cpm-kv__label">{h.label}</span>
                  <span className="cpm-kv__value" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 180 }}>
                    <span style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--container-hover-color, rgba(128,128,128,0.15))', overflow: 'hidden' }}>
                      <span style={{ display: 'block', height: '100%', width: `${Math.min(100, Math.max(0, h.value! * 100))}%`,
                        background: h.value! >= 0.7 ? 'var(--alert-caution-color)' : 'var(--instrument-enhanced-secondary-color)' }} />
                    </span>
                    <span className="cpm-mono">{fmt(h.value)}</span>
                  </span>
                </div>
              ))}

              <PanelHead eyebrow="Record it" title="Investigation note" />
              {openFrame ? (
                <>
                  <textarea className="cpm-textarea" rows={2} value={note}
                    placeholder="Finding, action taken, follow-up owner…"
                    onChange={e => setNote(e.target.value)} />
                  <div className="cpm-filter-row" style={{ marginTop: 8 }}>
                    <ObcButton variant="raised" disabled={note.trim().length === 0 || ack.isPending}
                      onClick={() => ack.mutate(
                        { id: openFrame.id, note: `INVESTIGATION: ${note.trim()}` },
                        { onSuccess: () => setNote('') })}>
                      {ack.isPending ? 'Saving…' : 'Create investigation note ›'}
                    </ObcButton>
                    {ack.isSuccess && <TonePill tone="good">SAVED</TonePill>}
                  </div>
                  <p className="cpm-copy">
                    Saved as a note on the open event frame (acknowledges it). Full case
                    management is not built yet — that is data-gap DG-7, not a hidden feature.
                  </p>
                </>
              ) : (
                <EmptyState title="No open event frame"
                  copy="Notes attach to event frames; this loop has none open right now." />
              )}
            </section>
          </div>

          <section className="cpm-surface">
            <PanelHead eyebrow="Window browser" title={`Recent ${windowKind} windows`}
              right={<span className="cpm-copy">newest first · click to pin as CURRENT</span>} />
            <div className="cpm-filter-row">
              {windows.slice(0, 5).map(w => (
                <ObcButton key={w.windowEnd ?? ''} variant={matrix.windowEnd === w.windowEnd ? 'raised' : 'normal'}
                  onClick={() => setParams(p => {
                    p.set('mode', 'historical');
                    if (w.windowEnd) p.set('window', w.windowEnd);
                    return p;
                  })}>
                  {w.windowEnd ? new Date(w.windowEnd).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}
                  {' · '}{(w.diagnosis ?? '—').replace(/_/g, ' ').slice(0, 22)}
                </ObcButton>
              ))}
            </div>
            {previous ? (
              <div className="cpm-matrix-scroll" style={{ marginTop: 12 }}>
                <table className="cpm-matrix">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Metric</th>
                      <th>PREVIOUS (ends {previous.windowEnd ? new Date(previous.windowEnd).toLocaleDateString() : '—'})</th>
                      <th>CURRENT (ends {matrix.windowEnd ? new Date(matrix.windowEnd).toLocaleDateString() : '—'})</th>
                      <th>Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ textAlign: 'left' }}>Diagnosis</td>
                      <td>{(previous.diagnosis ?? '—').replace(/_/g, ' ')}</td>
                      <td>{(matrix.diagnosis ?? '—').replace(/_/g, ' ')}</td>
                      <td>{previous.diagnosis === matrix.diagnosis ? 'unchanged' : 'changed'}</td>
                    </tr>
                    <tr>
                      <td style={{ textAlign: 'left' }}>Confidence</td>
                      <td>{previous.confidence != null ? (previous.confidence * 100).toFixed(0) + '%' : '—'}</td>
                      <td>{matrix.confidence != null ? (matrix.confidence * 100).toFixed(0) + '%' : '—'}</td>
                      <td>{previous.confidence != null && matrix.confidence != null
                        ? `${((matrix.confidence - previous.confidence) * 100).toFixed(0)} pt` : '—'}</td>
                    </tr>
                    {KEY_FACTS.map(f => {
                      const prev = previous.metrics?.[f.field];
                      const cur = metrics[f.field];
                      if (prev == null && cur == null) return null;
                      return (
                        <tr key={f.field}>
                          <td style={{ textAlign: 'left' }}>{f.label}</td>
                          <td>{fmt(prev)}</td>
                          <td>{fmt(cur)}</td>
                          <td>{prev != null && cur != null ? fmt(cur - prev) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="cpm-copy" style={{ marginTop: 8 }}>
                Only one evaluated window stored — no PREVIOUS to compare against yet.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default CpmInvestigation;
