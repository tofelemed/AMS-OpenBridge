'use client';

/**
 * CPLM Phase 7 — U6 Historical explorer (/cpm/historical?loop=&from=&to=&kpi=).
 * CPA-prototype IA parity: range toolbar, synchronized PV/SP/OP envelope chart
 * with a KPI overlay, a clickable diagnosis-band track built from real gate
 * windows, the selected-period card ("Replay this period" navigates to U8),
 * the maintenance-correlation panel (DG-3: honest empty state — no CMMS
 * integration), and client-side evidence export.
 */
import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import {
  EmptyState, KvRow, LoopSelect, PanelHead, TonePill, WorkspaceHeader, toneFor,
  fmtDateTime, QueryError } from './shared';
import type { CpmGateMatrix } from '../../api/cpmApi';
import {
  useCpmKpisRange, useCpmLoops, useCpmModeTrack, useCpmTrend, useGateHistory,
} from '../../hooks/useCpm';
import { loopSeries } from '../../utils/loopSeries';
import { useObcTheme } from '../../hooks/useObcTheme';

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** KPI overlays offered — real stored fields only, each at the resolution it exists at. */
const KPI_OVERLAYS = [
  { key: 'effort_ratio', label: 'Actuator effort ratio', resolution: '15m', unit: 'ratio' },
  { key: 'iae', label: 'Integral absolute error', resolution: '15m', unit: 'EU·s' },
  { key: 'good_error_pct', label: 'Good-error time', resolution: '15m', unit: '% (0-1 fraction)' },
  { key: 'triangularity', label: 'OP triangularity (stiction)', resolution: '24h', unit: 'score' },
  { key: 'harmonic_energy_ratio', label: 'Harmonic energy ratio', resolution: '24h', unit: 'ratio' },
];

/** Diagnosis → CPA band vocabulary, from the fused verdict per window. */
function bandFor(diagnosis: string | null): { label: string; tone: 'good' | 'warn' | 'bad' | 'muted' } {
  if (!diagnosis || diagnosis === 'INSUFFICIENT_DATA') return { label: 'Not evaluated', tone: 'muted' };
  const d = diagnosis.toUpperCase();
  if (d.startsWith('CONFIRMED') || d.startsWith('SUSPECTED')) return { label: 'Suspected', tone: 'bad' };
  if (d.startsWith('DETECTED') || d.startsWith('CLASSIFIED')) return { label: 'Developing', tone: 'warn' };
  if (d === 'NORMAL' || d === 'NONE' || d === 'HEALTHY') return { label: 'Normal', tone: 'good' };
  return { label: d.replace(/_/g, ' '), tone: 'warn' };
}

const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function download(name: string, mime: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export const CpmHistorical: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const loopsQuery = useCpmLoops();
  const loops = useMemo(() => loopsQuery.data?.loops ?? [], [loopsQuery.data]);

  const loopId = params.get('loop') ?? loops[0]?.loopId;
  const kpiKey = params.get('kpi') ?? KPI_OVERLAYS[0].key;
  const overlay = KPI_OVERLAYS.find(k => k.key === kpiKey) ?? KPI_OVERLAYS[0];

  // Applied range comes from the URL (deep-linkable); the inputs are a draft.
  const { from, to } = useMemo(() => {
    const now = new Date();
    const toIso = params.get('to');
    const fromIso = params.get('from');
    return {
      from: fromIso ? new Date(fromIso) : new Date(now.getTime() - 3 * 24 * 3600_000),
      to: toIso ? new Date(toIso) : now,
    };
  }, [params]);
  const [draftFrom, setDraftFrom] = useState(() => toLocalInput(from));
  const [draftTo, setDraftTo] = useState(() => toLocalInput(to));

  const series = loopId ? loopSeries(loopId) : undefined;
  const trend = useCpmTrend(series, from, to, 300);
  const modeTrack = useCpmModeTrack(series, from, to, 96);
  const kpis = useCpmKpisRange(loopId, overlay.resolution, from.toISOString(), to.toISOString());
  const history = useGateHistory(loopId, '24h', from.toISOString(), to.toISOString());

  // Oldest → newest so the band track reads left-to-right in time.
  const windows = useMemo(() => {
    const rows = history.data?.windows ?? [];
    return [...rows].sort((a, b) =>
      (a.windowEnd ?? '').localeCompare(b.windowEnd ?? ''));
  }, [history.data]);
  const selectedWindowEnd = params.get('window');
  const selectedWindow: CpmGateMatrix | undefined =
    windows.find(w => w.windowEnd === selectedWindowEnd) ?? windows[windows.length - 1];

  const points = useMemo(() => trend.data?.points ?? [], [trend.data]);
  const kpiRows = useMemo(() => kpis.data?.samples ?? [], [kpis.data]);

  const obcTheme = useObcTheme(); // C: re-derive chart colors on theme switch
  const option = useMemo(() => {
    const good = cssVar('--instrument-enhanced-secondary-color', '#41be95');
    const amber = cssVar('--alert-caution-color', '#d79a40');
    const grey = cssVar('--on-container-neutral-color', '#9aa6af');
    const accent = cssVar('--instrument-enhanced-primary-color', '#5aa8f8');
    const num = (v: unknown) => (typeof v === 'number' ? v : null);
    // Overlay rows joined onto the trend by time (echarts 'time' axis handles alignment).
    const overlayData = kpiRows
      .filter(r => r.window_end && typeof r[overlay.key] === 'number')
      .map(r => [new Date(r.window_end!).getTime(), r[overlay.key] as number]);
    return {
      animation: false,
      grid: [
        { left: 52, right: 52, top: 18, height: 200 },
        { left: 52, right: 52, top: 250, height: 90 },
      ],
      axisPointer: { link: [{ xAxisIndex: 'all' as const }] },
      tooltip: { trigger: 'axis' },
      xAxis: [
        { type: 'time', gridIndex: 0, axisLabel: { color: grey } },
        { type: 'time', gridIndex: 1, axisLabel: { color: grey } },
      ],
      yAxis: [
        { type: 'value', gridIndex: 0, scale: true, axisLabel: { color: grey }, splitLine: { lineStyle: { opacity: 0.2 } } },
        { type: 'value', gridIndex: 1, scale: true, name: overlay.unit, axisLabel: { color: grey }, splitLine: { show: false } },
      ],
      series: [
        { name: 'pv-min', type: 'line', stack: 'pv-band', silent: true, symbol: 'none',
          lineStyle: { width: 0 }, data: points.map(p => [p.ts, num(p.pv_min)]) },
        { name: 'pv-band', type: 'line', stack: 'pv-band', silent: true, symbol: 'none',
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
        { name: overlay.label, type: 'line', xAxisIndex: 1, yAxisIndex: 1, symbol: 'circle',
          symbolSize: 5, lineStyle: { color: accent, width: 1.5 }, itemStyle: { color: accent },
          data: overlayData },
      ],
    };
  }, [points, kpiRows, overlay, obcTheme]);

  const applyRange = () => {
    setParams(p => {
      const f = new Date(draftFrom); const t = new Date(draftTo);
      if (!Number.isNaN(f.getTime())) p.set('from', f.toISOString());
      if (!Number.isNaN(t.getTime())) p.set('to', t.toISOString());
      return p;
    });
  };

  const exportEvidence = (fmt: 'json' | 'csv') => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    if (fmt === 'json') {
      download(`cplm-${loopId}-windows-${stamp}.json`, 'application/json',
        JSON.stringify({ loopId, from: from.toISOString(), to: to.toISOString(), windows }, null, 2));
      return;
    }
    const head = 'window_start,window_end,diagnosis,severity,confidence,sample_count,calculation_version';
    const rows = windows.map(w => [
      w.windowStart ?? '', w.windowEnd ?? '', w.diagnosis ?? '', w.severity ?? '',
      w.confidence ?? '', w.sampleCount ?? '', w.metadata.calculationVersion ?? '',
    ].join(','));
    download(`cplm-${loopId}-windows-${stamp}.csv`, 'text/csv', [head, ...rows].join('\n'));
  };

  return (
    <div className="cpm-screen">
      <WorkspaceHeader
        eyebrow="Evidence over time"
        title="Historical explorer"
        copy="Walk a loop's past: signals, KPI overlays, and the diagnosis each evaluated window produced."
        actions={
          <div className="cpm-filter-row">
            <ObcButton variant="normal" onClick={() => exportEvidence('json')}>Export JSON</ObcButton>
            <ObcButton variant="normal" onClick={() => exportEvidence('csv')}>Export CSV</ObcButton>
          </div>
        }
      />

      <section className="cpm-surface">
        <div className="cpm-toolbar">
          <LoopSelect loops={loops} value={loopId ?? ''}
            onChange={id => setParams(p => { p.set('loop', id); p.delete('window'); return p; })} />
          <label className="cpm-field">
            <span className="cpm-field__label">From</span>
            <input className="cpm-input" type="datetime-local" value={draftFrom}
              onChange={e => setDraftFrom(e.target.value)} />
          </label>
          <label className="cpm-field">
            <span className="cpm-field__label">To</span>
            <input className="cpm-input" type="datetime-local" value={draftTo}
              onChange={e => setDraftTo(e.target.value)} />
          </label>
          <label className="cpm-field">
            <span className="cpm-field__label">KPI overlay</span>
            <select className="cpm-select" value={overlay.key}
              onChange={e => setParams(p => { p.set('kpi', e.target.value); return p; })}>
              {KPI_OVERLAYS.map(k => (
                <option key={k.key} value={k.key}>{k.label} · {k.resolution}</option>
              ))}
            </select>
          </label>
          <ObcButton variant="raised" onClick={applyRange}>Apply range</ObcButton>
        </div>

        {trend.isLoading && <EmptyState title="Loading trend…" />}
        {trend.isError && <QueryError title="Historian unreachable" error={trend.error} retry={() => void trend.refetch()} />}
        {!trend.isLoading && !trend.isError && points.length === 0 && (
          <EmptyState title="No historian data in this range"
            copy={series ? `No samples stored at ${series} between the selected dates.` : 'Select a loop.'} />
        )}
        {points.length > 0 && (
          <ReactECharts option={option} style={{ height: 380 }} notMerge />
        )}
        {kpiRows.length === 0 && !kpis.isLoading && points.length > 0 && (
          <p className="cpm-copy">
            No {overlay.label.toLowerCase()} rows at {overlay.resolution} in this range —
            the overlay track is empty, not zero.
          </p>
        )}

        {(() => {
          const modes = (modeTrack.data?.points ?? [])
            .map(p => ({ ts: p.ts, mode: typeof p.mode === 'string' ? p.mode : null }));
          const known = modes.filter(m => m.mode != null);
          if (known.length === 0) return null;
          return (
            <>
              <PanelHead eyebrow="Mode track" title="Controller mode across the range"
                right={<span className="cpm-copy">
                  last_value per bucket · gaps = no stored samples · no quality series is stored, so no quality ribbon
                </span>} />
              <div className="cpm-band-track" aria-label="Controller mode track">
                {modes.map(m => (
                  <span key={m.ts}
                    className={`cpm-band-seg cpm-band-seg--${m.mode == null ? 'muted' : m.mode === 'AUTO' ? 'good' : 'warn'}`}
                    style={{ cursor: 'default', height: 10 }}
                    title={`${fmtDateTime(m.ts)} · ${m.mode ?? 'no data'}`} />
                ))}
              </div>
            </>
          );
        })()}

        <PanelHead eyebrow="Diagnosis bands" title="What each 24h window concluded"
          right={<span className="cpm-copy">{windows.length} evaluated window(s) · click a band to inspect</span>} />
        {windows.length === 0 && (
          <EmptyState title="No evaluated windows in range"
            copy="Fused verdicts exist only where the loop completed 24h evaluation windows." />
        )}
        {windows.length > 0 && (
          <div className="cpm-band-track" role="listbox" aria-label="Diagnosis bands">
            {windows.map(w => {
              const b = bandFor(w.diagnosis);
              const isSel = selectedWindow?.windowEnd === w.windowEnd;
              return (
                <button key={w.windowEnd ?? w.metadata.computedAt} type="button"
                  className={`cpm-band-seg cpm-band-seg--${b.tone}${isSel ? ' cpm-band-seg--selected' : ''}`}
                  title={`${b.label} · ${w.diagnosis ?? '—'} · ends ${w.windowEnd ? fmtDateTime(w.windowEnd) : '—'}`}
                  onClick={() => setParams(p => { if (w.windowEnd) p.set('window', w.windowEnd); return p; })}
                />
              );
            })}
          </div>
        )}
      </section>

      <div className="cpm-grid-2">
        <section className="cpm-surface">
          <PanelHead eyebrow="Selected period" title={
            selectedWindow?.windowEnd
              ? `24h window ending ${fmtDateTime(selectedWindow.windowEnd)}`
              : 'No window selected'} />
          {!selectedWindow && <EmptyState title="Click a diagnosis band above" />}
          {selectedWindow && (
            <>
              <KvRow label="Verdict">
                <TonePill tone={toneFor(selectedWindow.diagnosis)}>
                  {(selectedWindow.diagnosis ?? 'NONE').replace(/_/g, ' ')}
                </TonePill>
              </KvRow>
              <KvRow label="Confidence">
                {selectedWindow.confidence != null ? `${(selectedWindow.confidence * 100).toFixed(0)}%` : '—'}
              </KvRow>
              <KvRow label="Window">
                {selectedWindow.windowStart ? fmtDateTime(selectedWindow.windowStart) : '—'}
                {' → '}
                {selectedWindow.windowEnd ? fmtDateTime(selectedWindow.windowEnd) : '—'}
              </KvRow>
              <KvRow label="Samples">{selectedWindow.sampleCount ?? '—'}</KvRow>
              <KvRow label="Calculation">
                v{selectedWindow.metadata.calculationVersion ?? '—'} ·
                profile v{selectedWindow.metadata.dynamicsProfileVersion ?? '—'}
              </KvRow>
              {selectedWindow.insufficientEvidenceReason && (
                <p className="cpm-copy">{selectedWindow.insufficientEvidenceReason}</p>
              )}
              <div style={{ marginTop: 12 }}>
                <ObcButton variant="raised" onClick={() => {
                  const q = new URLSearchParams({ loop: loopId ?? '' });
                  if (selectedWindow.windowEnd) q.set('window', selectedWindow.windowEnd);
                  navigate(`/cpm/replay?${q.toString()}`);
                }}>
                  Replay this period ›
                </ObcButton>
              </div>
            </>
          )}
        </section>

        <section className="cpm-surface">
          <PanelHead eyebrow="Maintenance correlation" title="Work orders in this range" />
          <EmptyState title="No CMMS integration configured"
            copy="Maintenance events would be correlated here once a CMMS/work-order source is connected. Nothing is shown because nothing is known — not because nothing happened." />
        </section>
      </div>
    </div>
  );
};

export default CpmHistorical;
