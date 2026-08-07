'use client';

/**
 * CPLM Phase 7 — U8 Evidence replay (/cpm/replay?loop=&window=&gate=).
 * CPA-prototype IA parity: loop/window/gate toolbar, the transformation
 * stepper, an evidence chart over the real raw historian slice with a replay
 * cursor, a phase-plane variant for the shape gates, the summary aside from
 * the calculations catalogue + stored gate row, the input lineage strip, and
 * the A8 recompute integration (submit → poll → refetch gates). The engineer
 * note is stored honestly: it acknowledges the loop's open event frame with
 * the note attached — there is no other server-side note store.
 */
import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import {
  EmptyState, KvRow, LoopSelect, PanelHead, TonePill, WorkspaceHeader, toneFor,
  fmtDateTime,
} from './shared';
import type { CpmGateMatrix, CpmKpiRow } from '../../api/cpmApi';
import {
  useAcknowledgeEvent, useCpmCalculations, useCpmEvents, useCpmKpisRange,
  useCpmLoops, useGateHistory, useRawWindow, useRecompute,
} from '../../hooks/useCpm';
import { loopSeries } from '../../utils/loopSeries';

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

const GATE_ROLES: Record<string, string> = {
  G0: 'BLOCKING', G1: 'BLOCKING', G11: 'BLOCKING',
  G2: 'ELIGIBILITY', G2r: 'ELIGIBILITY',
  G3: 'PERFORMANCE', G4: 'PERFORMANCE',
  G5: 'PRIMARY', G6: 'PRIMARY', G10: 'PRIMARY',
  G7: 'SUPPORTING', G8: 'SUPPORTING', G9: 'SUPPORTING',
  G12: 'CONTEXT', G13: 'CONTEXT',
  G14: 'CONFIRMATION', G15: 'FUSION',
};

/** Long-tier metric fields relevant per gate (real stored fields only). */
const GATE_METRICS: Record<string, { field: string; label: string }[]> = {
  G0: [{ field: 'completeness', label: 'Completeness' }, { field: 'sample_count', label: 'Sample count' }],
  G1: [{ field: 'auto_pct', label: 'AUTO fraction' }],
  G3: [{ field: 'mae', label: 'MAE' }, { field: 'iae', label: 'IAE' }, { field: 'good_error_pct', label: 'Good-error %' }],
  G4: [{ field: 'effort_ratio', label: 'Effort ratio' }, { field: 'reversals_per_hour', label: 'Reversals/h' }, { field: 'travel_per_day', label: 'Travel/day' }],
  G5: [{ field: 'acf_period_s', label: 'ACF period (s)' }, { field: 'acf_regularity', label: 'ACF regularity' }],
  G6: [{ field: 'harmonic_amplitude_ratio', label: 'Harmonic amplitude ratio' }, { field: 'harmonic_energy_ratio', label: 'Harmonic energy ratio' }],
  G7: [{ field: 'triangularity', label: 'OP triangularity' }],
  G8: [{ field: 'horch_oddness', label: 'Horch oddness' }],
  G9: [{ field: 'corner_score', label: 'Corner score' }],
};

const STAGES = ['Raw historian', 'Normalize (5 s grid)', 'Feature windows', 'Gate evaluation', 'Fusion (G15)'];

/** Gates whose evidence is the PV–OP shape, shown as a phase plane. */
const SHAPE_GATES = new Set(['G7', 'G8', 'G9', 'G10']);

function download(name: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export const CpmReplay: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const loopsQuery = useCpmLoops();
  const loops = useMemo(() => loopsQuery.data?.loops ?? [], [loopsQuery.data]);
  const loopId = params.get('loop') ?? loops[0]?.loopId;
  const gateKey = params.get('gate') ?? 'G15';

  const calc = useCpmCalculations();
  const history = useGateHistory(loopId, '24h');
  const windows = useMemo(() => {
    const rows = history.data?.windows ?? [];
    return [...rows].sort((a, b) => (b.windowEnd ?? '').localeCompare(a.windowEnd ?? ''));
  }, [history.data]);
  const windowEnd = params.get('window');
  const selected: CpmGateMatrix | undefined =
    windows.find(w => w.windowEnd === windowEnd) ?? windows[0];

  // The long-tier KPI row for the same 24h window carries the metric values.
  const kpiRow: CpmKpiRow | undefined = useCpmKpisRange(
    loopId, '24h',
    selected?.windowStart ?? undefined, undefined, 10,
  ).data?.samples.find(r => r.window_end === selected?.windowEnd);

  // Raw slice for the selected window (first page, ascending).
  const series = loopId ? loopSeries(loopId) : undefined;
  const winStart = selected?.windowStart ? new Date(selected.windowStart) : undefined;
  const winEnd = selected?.windowEnd ? new Date(selected.windowEnd) : undefined;
  const raw = useRawWindow(series, winStart, winEnd, 'pv,sp,op', 5000);
  const points = useMemo(() => raw.data?.points ?? [], [raw.data]);

  const [cursorPct, setCursorPct] = useState(100);
  const cursorTs = points.length > 0
    ? points[Math.min(points.length - 1, Math.floor((cursorPct / 100) * (points.length - 1)))].ts
    : null;

  const def = calc.data?.gates.find(g => g.key === gateKey);
  const cell = selected?.gates.find(g => g.key === gateKey);
  const role = GATE_ROLES[gateKey] ?? '—';
  const isShapeGate = SHAPE_GATES.has(gateKey);

  const chartOption = useMemo(() => {
    const good = cssVar('--instrument-enhanced-secondary-color', '#41be95');
    const amber = cssVar('--alert-caution-color', '#d79a40');
    const grey = cssVar('--on-container-neutral-color', '#9aa6af');
    const accent = cssVar('--instrument-enhanced-primary-color', '#5aa8f8');
    const num = (v: unknown) => (typeof v === 'number' ? v : null);
    if (isShapeGate) {
      // Phase plane: PV vs OP over the window, with the cursor-side points highlighted.
      const pairs = points
        .map(p => ({ ts: p.ts, pv: num(p.pv), op: num(p.op) }))
        .filter(p => p.pv != null && p.op != null);
      return {
        animation: false,
        grid: { left: 52, right: 16, top: 20, bottom: 34 },
        tooltip: { trigger: 'item' },
        xAxis: { type: 'value', name: 'OP', scale: true, axisLabel: { color: grey } },
        yAxis: { type: 'value', name: 'PV', scale: true, axisLabel: { color: grey }, splitLine: { lineStyle: { opacity: 0.2 } } },
        series: [
          { name: 'trajectory', type: 'scatter', symbolSize: 3, itemStyle: { color: grey, opacity: 0.35 },
            data: pairs.filter(p => cursorTs == null || p.ts > cursorTs).map(p => [p.op, p.pv]) },
          { name: 'up to cursor', type: 'scatter', symbolSize: 4, itemStyle: { color: accent, opacity: 0.8 },
            data: pairs.filter(p => cursorTs != null && p.ts <= cursorTs).map(p => [p.op, p.pv]) },
        ],
      };
    }
    return {
      animation: false,
      grid: { left: 52, right: 16, top: 20, bottom: 34 },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'time', axisLabel: { color: grey } },
      yAxis: { type: 'value', scale: true, axisLabel: { color: grey }, splitLine: { lineStyle: { opacity: 0.2 } } },
      series: [
        { name: 'PV', type: 'line', symbol: 'none', lineStyle: { color: good, width: 1.5 },
          data: points.map(p => [p.ts, num(p.pv)]),
          markLine: cursorTs != null ? {
            symbol: 'none', label: { show: false },
            lineStyle: { color: accent, width: 2 },
            data: [{ xAxis: cursorTs }],
          } : undefined },
        { name: 'SP', type: 'line', symbol: 'none', lineStyle: { color: grey, width: 1, type: 'dashed' },
          data: points.map(p => [p.ts, num(p.sp)]) },
        { name: 'OP', type: 'line', symbol: 'none', lineStyle: { color: amber, width: 1 },
          data: points.map(p => [p.ts, num(p.op)]) },
      ],
    };
  }, [points, cursorTs, isShapeGate]);

  // A8 recompute round trip.
  const { submit, status, reset } = useRecompute(loopId);
  const recomputeBusy = submit.isPending || (status != null && !status.finished);

  // Engineer note → acknowledge the loop's open event frame with the note.
  const events = useCpmEvents({ loopId, openOnly: true, limit: 5 }, 60_000);
  const openFrame = events.data?.events.find(e => e.ack_state === 'UNACKNOWLEDGED');
  const ack = useAcknowledgeEvent();
  const [note, setNote] = useState('');

  const exportPackage = () => {
    if (!selected) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    download(`cplm-replay-${loopId}-${gateKey}-${stamp}.json`, JSON.stringify({
      loopId,
      gate: gateKey,
      window: { start: selected.windowStart, end: selected.windowEnd, kind: selected.windowKind },
      verdict: {
        diagnosis: selected.diagnosis, severity: selected.severity,
        confidence: selected.confidence, gates: selected.gates,
      },
      metadata: selected.metadata,
      metrics: kpiRow ?? null,
      rawSlice: { series, count: points.length, truncated: raw.data?.hasMore ?? false, points },
    }, null, 2));
  };

  return (
    <div className="cpm-screen">
      <WorkspaceHeader
        eyebrow="Gate-level forensics"
        title="Evidence replay"
        copy="Walk the exact samples a window evaluated, see what the gate concluded, and re-run the computation to prove it."
        actions={<ObcButton variant="normal" onClick={exportPackage}>Export package</ObcButton>}
      />

      <section className="cpm-surface">
        <div className="cpm-toolbar">
          <LoopSelect loops={loops} value={loopId ?? ''}
            onChange={id => setParams(p => { p.set('loop', id); p.delete('window'); return p; })} />
          <label className="cpm-field">
            <span className="cpm-field__label">Evaluated window (24h)</span>
            <select className="cpm-select" value={selected?.windowEnd ?? ''}
              onChange={e => setParams(p => { p.set('window', e.target.value); return p; })}>
              {windows.map(w => (
                <option key={w.windowEnd ?? ''} value={w.windowEnd ?? ''}>
                  ends {w.windowEnd ? fmtDateTime(w.windowEnd) : '—'} · {(w.diagnosis ?? '—').replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="cpm-field">
            <span className="cpm-field__label">Gate</span>
            <select className="cpm-select" value={gateKey}
              onChange={e => setParams(p => { p.set('gate', e.target.value); return p; })}>
              {(calc.data?.gates ?? []).map(g => (
                <option key={g.key} value={g.key}>{g.key} · {g.name}</option>
              ))}
            </select>
          </label>
          <TonePill tone="muted">{role}</TonePill>
          {cell && <TonePill tone={toneFor(cell.status)}>{cell.status.replace(/_/g, ' ')}</TonePill>}
        </div>

        <div className="cpm-wizard-steps" aria-label="Transformation stages">
          {STAGES.map((s, i) => (
            <span key={s} className={`cpm-wizard-step${i < 4 ? ' cpm-wizard-step--done' : ' cpm-wizard-step--active'}`}>
              {i + 1}. {s}
            </span>
          ))}
        </div>
        <p className="cpm-copy">
          Stages are the pipeline's fixed shape; the chart below shows the raw historian
          slice this window drew from{isShapeGate ? ' as a PV–OP phase plane (the shape this gate scores)' : ''}.
        </p>

        {!selected && !history.isLoading && (
          <EmptyState title="No evaluated 24h windows for this loop"
            copy="Replay needs a stored fused result; run the loop long enough to complete a window, or recompute from history." />
        )}
        {raw.isLoading && <EmptyState title="Loading raw slice…" />}
        {selected && !raw.isLoading && points.length === 0 && (
          <EmptyState title="No raw historian data for this window"
            copy={`Nothing stored at ${series} between the window bounds.`} />
        )}
        {points.length > 0 && (
          <>
            <ReactECharts option={chartOption} style={{ height: 300 }} notMerge />
            <div className="cpm-slider-row">
              <span className="cpm-copy">Replay cursor</span>
              <input type="range" min={0} max={100} value={cursorPct}
                onChange={e => setCursorPct(Number(e.target.value))}
                aria-label="Replay cursor position" />
              <span className="cpm-mono">
                {cursorTs != null ? new Date(cursorTs).toLocaleTimeString() : '—'}
              </span>
            </div>
            {raw.data?.hasMore && (
              <p className="cpm-copy">
                Showing the first {points.length.toLocaleString()} raw points of the window — the
                slice is paged; export includes only what is shown.
              </p>
            )}
          </>
        )}
      </section>

      <div className="cpm-grid-2">
        <section className="cpm-surface">
          <PanelHead eyebrow="Summary" title={def ? `${gateKey} · ${def.name}` : gateKey} />
          <KvRow label="Question">{def?.question ?? '—'}</KvRow>
          <KvRow label="Result">
            <TonePill tone={toneFor(cell?.status)}>{(cell?.status ?? 'NOT_EVALUATED').replace(/_/g, ' ')}</TonePill>
          </KvRow>
          {cell?.reason && <KvRow label="Reason">{cell.reason}</KvRow>}
          <KvRow label="Window">
            {selected?.windowStart ? fmtDateTime(selected.windowStart) : '—'} →{' '}
            {selected?.windowEnd ? fmtDateTime(selected.windowEnd) : '—'}
          </KvRow>
          <KvRow label="Samples">{selected?.sampleCount ?? '—'}</KvRow>
          <KvRow label="Calculation">
            v{selected?.metadata.calculationVersion ?? '—'} · profile v{selected?.metadata.dynamicsProfileVersion ?? '—'}
            {selected?.metadata.replayId ? ` · replay ${selected.metadata.replayId}` : ''}
          </KvRow>
          {(GATE_METRICS[gateKey] ?? []).map(m => (
            <KvRow key={m.field} label={m.label}>
              {kpiRow && typeof kpiRow[m.field] === 'number'
                ? (kpiRow[m.field] as number).toFixed(3)
                : '— (no long-tier row for this window)'}
            </KvRow>
          ))}

          <PanelHead eyebrow="Input lineage" title="Where this evidence came from" />
          <div className="cpm-lineage">
            <div className="cpm-lineage__node">
              <span className="cpm-eyebrow">IoTDB raw</span>
              <span className="cpm-mono">{series ?? '—'}</span>
            </div>
            <span className="cpm-lineage__arrow">→</span>
            <div className="cpm-lineage__node">
              <span className="cpm-eyebrow">Normalize</span>
              <span>5 s grid · loop.samples.v1</span>
            </div>
            <span className="cpm-lineage__arrow">→</span>
            <div className="cpm-lineage__node">
              <span className="cpm-eyebrow">Gate tier</span>
              <span>{gateKey} · {role}</span>
            </div>
            <span className="cpm-lineage__arrow">→</span>
            <div className="cpm-lineage__node">
              <span className="cpm-eyebrow">Fused verdict</span>
              <span>{(selected?.diagnosis ?? '—').replace(/_/g, ' ')}</span>
            </div>
          </div>
        </section>

        <section className="cpm-surface">
          <PanelHead eyebrow="Re-run" title="Recompute this loop from history"
            right={status && (
              <TonePill tone={status.finished ? (status.succeeded ? 'good' : 'bad') : 'warn'}>
                {status.finished ? (status.succeeded ? 'FINISHED' : `FAILED (${status.state})`) : status.state}
              </TonePill>
            )} />
          <p className="cpm-copy">
            Submits the A8 historical replay job with this loop's current evidence flags and
            window alignment (~90 s round trip). Gate views refresh automatically when it finishes.
          </p>
          <div className="cpm-filter-row">
            <ObcButton variant="raised" disabled={!loopId || recomputeBusy}
              onClick={() => { reset(); submit.mutate(); }}>
              {recomputeBusy ? 'Recomputing…' : 'Re-run this window'}
            </ObcButton>
            {submit.isError && (
              <span className="cpm-field__error">
                Recompute failed to start: {(submit.error as Error)?.message ?? 'unknown error'}
              </span>
            )}
          </div>

          <PanelHead eyebrow="Engineer note" title="Record your finding" />
          {openFrame ? (
            <>
              <p className="cpm-copy">
                Notes attach by acknowledging the open event frame
                ({openFrame.family.replace(/_/g, ' ')} · opened {fmtDateTime(openFrame.opened_at)}).
              </p>
              <textarea className="cpm-textarea" rows={3} value={note}
                placeholder="What did the evidence show? What action was taken?"
                onChange={e => setNote(e.target.value)} />
              <div className="cpm-filter-row" style={{ marginTop: 8 }}>
                <ObcButton variant="raised" disabled={note.trim().length === 0 || ack.isPending}
                  onClick={() => ack.mutate({ id: openFrame.id, note: note.trim() }, { onSuccess: () => setNote('') })}>
                  {ack.isPending ? 'Saving…' : 'Acknowledge with note'}
                </ObcButton>
                {ack.isSuccess && <TonePill tone="good">SAVED</TonePill>}
                {ack.isError && (
                  <span className="cpm-field__error">
                    Failed: {(ack.error as Error)?.message ?? 'unknown error'}
                  </span>
                )}
              </div>
            </>
          ) : (
            <EmptyState title="No open event frame on this loop"
              copy="Notes are stored on event frames; when this loop has an unacknowledged event, the note box appears here." />
          )}
        </section>
      </div>
    </div>
  );
};

export default CpmReplay;
