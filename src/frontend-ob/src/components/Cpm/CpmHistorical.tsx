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
  classifyMode, fmtDateTime, loopTrendHref, QueryError, cpmChartColors } from './shared';
import type { CpmGateMatrix } from '../../api/cpmApi';
import {
  useCpmKpisRange, useCpmLoops, useCpmModeTrack, useCpmTrend, useGateHistory,
} from '../../hooks/useCpm';
import { loopSeries } from '../../utils/loopSeries';
import { useObcTheme } from '../../hooks/useObcTheme';

/** The historian's per-loop numeric series (RawLoopIotDbConsumer.Measurements,
 * minus mode which has its own ribbon). Order is display order. */
const SIGNAL_KEYS = ['pv', 'sp', 'op', 'vp'] as const;

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
  const loop = loops.find(l => l.loopId.toLowerCase() === (loopId ?? '').toLowerCase());
  const kpiKey = params.get('kpi') ?? KPI_OVERLAYS[0].key;
  const overlay = KPI_OVERLAYS.find(k => k.key === kpiKey) ?? KPI_OVERLAYS[0];

  // Signal picker (?signals=pv,op,vp): which historian series the chart draws.
  // The historian stores pv/sp/op/vp per loop (RawLoopIotDbConsumer) and the
  // /trend endpoint takes any measurements CSV — the UI just never asked for more
  // than pv,sp,op, so VP (the direct visual signature of a sticking valve, on a
  // stiction-diagnosis product) was invisible on every screen.
  const signals = useMemo(() => {
    const parsed = (params.get('signals') ?? '')
      .split(',').map(s => s.trim().toLowerCase())
      .filter((s): s is typeof SIGNAL_KEYS[number] => (SIGNAL_KEYS as readonly string[]).includes(s));
    return parsed.length ? parsed : ['pv', 'sp', 'op'];
  }, [params]);
  const toggleSignal = (key: string) => {
    const next = signals.includes(key)
      ? signals.filter(s => s !== key)
      : [...signals, key];
    if (next.length === 0) return; // an empty chart answers nothing
    setParams(p => { p.set('signals', SIGNAL_KEYS.filter(k => next.includes(k)).join(',')); return p; },
      { replace: true });
  };

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
  // Drafts follow the APPLIED range when it changes underneath them — Back/Forward
  // or an episode deep link updates the chart via the URL, and inputs that keep
  // showing the previous range describe a different window than what is plotted.
  // Only applyRange and browser navigation change from/to, so this never stomps
  // on live typing.
  React.useEffect(() => {
    setDraftFrom(toLocalInput(from));
    setDraftTo(toLocalInput(to));
    // Keyed on the instants, not the Date identities — the memo above mints new
    // Date objects on every params change (loop/kpi/window too), and this must
    // only fire when the range itself actually moved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from.getTime(), to.getTime()]);

  const series = loopId ? loopSeries(loopId) : undefined;
  const trend = useCpmTrend(series, from, to, 300, signals.join(','));
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
  // The fallback above silently re-points a stale deep link at the newest window;
  // keep the fallback (a blank panel helps nobody) but SAY it happened.
  const windowFellBack = !!selectedWindowEnd && windows.length > 0
    && !windows.some(w => w.windowEnd === selectedWindowEnd);

  const points = useMemo(() => trend.data?.points ?? [], [trend.data]);
  const kpiRows = useMemo(() => kpis.data?.samples ?? [], [kpis.data]);

  // H3: the KPI endpoint caps at 500 rows, newest-first — at 15m resolution that
  // is ~5.2 days, so a longer range silently loses its OLDEST rows and the early
  // part of the chart reads as "no data". Detect the cap and say what is covered.
  const KPI_ROW_CAP = 500;
  const kpiTruncatedFrom = useMemo(() => {
    if (kpiRows.length < KPI_ROW_CAP) return null;
    const oldest = kpiRows[kpiRows.length - 1]?.window_end;
    return oldest ?? null;
  }, [kpiRows]);

  // H4: gate history is capped at 100 windows (~100 days at 24h). An export that
  // hit the cap is a partial answer and must say so — in the UI and in the file.
  const GATE_WINDOW_CAP = 100;
  const windowsTruncated = (history.data?.count ?? 0) >= GATE_WINDOW_CAP;

  const obcTheme = useObcTheme(); // C: re-derive chart colors on theme switch
  const option = useMemo(() => {
    const { good, amber, grey, accent, pink } = cpmChartColors();
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
      tooltip: {
        trigger: 'axis',
        // 'pv-min'/'pv-band' are the stacked helpers that draw the envelope; their
        // values (min, and max-minus-min) are not signals, but the default axis
        // tooltip listed them as if they were. Filter them and report the bucket's
        // real min–max instead.
        formatter: (params: Array<{ seriesName: string; marker: string; value: [number, number | null]; dataIndex: number }>) => {
          if (!params.length) return '';
          const ts = params[0].value?.[0];
          const p = points.find(pt => pt.ts === ts);
          const rows = params
            .filter(x => x.seriesName !== 'pv-min' && x.seriesName !== 'pv-band')
            .map(x => {
              const v = x.value?.[1];
              return `${x.marker} ${x.seriesName}: ${v == null ? '—' : Number(v).toFixed(2)}`;
            });
          const lo = p && typeof p.pv_min === 'number' ? p.pv_min : null;
          const hi = p && typeof p.pv_max === 'number' ? p.pv_max : null;
          if (lo != null && hi != null) rows.push(`PV range: ${lo.toFixed(2)} – ${hi.toFixed(2)}`);
          return [`<strong>${fmtDateTime(ts)}</strong>`, ...rows].join('<br/>');
        },
      },
      xAxis: [
        { type: 'time', gridIndex: 0, axisLabel: { color: grey } },
        { type: 'time', gridIndex: 1, axisLabel: { color: grey } },
      ],
      yAxis: [
        { type: 'value', gridIndex: 0, scale: true, axisLabel: { color: grey }, splitLine: { lineStyle: { opacity: 0.2 } } },
        { type: 'value', gridIndex: 1, scale: true, name: overlay.unit, axisLabel: { color: grey }, splitLine: { show: false } },
      ],
      // Pens follow the signal picker. PV keeps its envelope (band = the honest
      // rendering of oscillation inside a decimation bucket); VP gets its own pen
      // — VP tracking OP is a healthy valve, VP staircasing against a smooth OP
      // is stiction, which is the comparison this page exists to show.
      series: [
        ...(signals.includes('pv') ? [
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
        ] : []),
        ...(signals.includes('sp') ? [
          { name: 'SP', type: 'line', symbol: 'none', lineStyle: { color: grey, width: 1, type: 'dashed' },
            data: points.map(p => [p.ts, num(p.sp)]) },
        ] : []),
        ...(signals.includes('op') ? [
          { name: 'OP', type: 'line', symbol: 'none', lineStyle: { color: amber, width: 1.5 },
            data: points.map(p => [p.ts, num(p.op_avg) ?? num(p.op)]) },
        ] : []),
        ...(signals.includes('vp') ? [
          { name: 'VP', type: 'line', symbol: 'none', lineStyle: { color: pink, width: 1.5 },
            data: points.map(p => [p.ts, num(p.vp_avg) ?? num(p.vp)]) },
        ] : []),
        { name: overlay.label, type: 'line', xAxisIndex: 1, yAxisIndex: 1, symbol: 'circle',
          symbolSize: 5, lineStyle: { color: accent, width: 1.5 }, itemStyle: { color: accent },
          data: overlayData },
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- obcTheme is a recompute trigger: chart colors are read from CSS vars that change with the theme.
  }, [points, kpiRows, overlay, signals, obcTheme]);

  const [rangeError, setRangeError] = useState<string | null>(null);
  const applyRange = () => {
    const f = new Date(draftFrom); const t = new Date(draftTo);
    if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime())) {
      setRangeError('Enter both dates.');
      return;
    }
    // Catch it here rather than letting historian-bff answer 400 and the chart
    // render "Historian unreachable" for what is a backwards range.
    if (t <= f) {
      setRangeError('"To" must be after "From".');
      return;
    }
    setRangeError(null);
    setParams(p => {
      p.set('from', f.toISOString());
      p.set('to', t.toISOString());
      // A window selected under the old range may not exist in the new one;
      // dropping it beats silently re-pointing at whatever is newest.
      p.delete('window');
      return p;
    }, { replace: true });
  };

  const exportEvidence = (fmt: 'json' | 'csv') => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    if (fmt === 'json') {
      download(`cplm-${loopId}-windows-${stamp}.json`, 'application/json',
        JSON.stringify({
          loopId, from: from.toISOString(), to: to.toISOString(),
          // The cap travels WITH the evidence: a truncated export read later,
          // away from this screen, must not pass as the complete record.
          truncated: windowsTruncated,
          windowCap: windowsTruncated ? GATE_WINDOW_CAP : undefined,
          windows,
        }, null, 2));
      return;
    }
    const head = 'window_start,window_end,diagnosis,severity,confidence,sample_count,calculation_version';
    const rows = windows.map(w => [
      w.windowStart ?? '', w.windowEnd ?? '', w.diagnosis ?? '', w.severity ?? '',
      w.confidence ?? '', w.sampleCount ?? '', w.metadata.calculationVersion ?? '',
    ].join(','));
    const foot = windowsTruncated
      ? [`# TRUNCATED: hit the ${GATE_WINDOW_CAP}-window API cap; older windows in range are not included`]
      : [];
    download(`cplm-${loopId}-windows-${stamp}.csv`, 'text/csv', [head, ...rows, ...foot].join('\n'));
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
            onChange={id => setParams(p => { p.set('loop', id); p.delete('window'); return p; }, { replace: true })} />
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
              onChange={e => setParams(p => { p.set('kpi', e.target.value); return p; }, { replace: true })}>
              {KPI_OVERLAYS.map(k => (
                <option key={k.key} value={k.key}>{k.label} · {k.resolution}</option>
              ))}
            </select>
          </label>
          <ObcButton variant="raised" onClick={applyRange}>Apply range</ObcButton>
          {rangeError && <span className="cpm-copy" role="alert">{rangeError}</span>}
        </div>

        {/* Signal picker: which of the loop's stored series the chart draws.
            Chart truth is the HISTORIAN, not the registry (P2-10) — so VP is
            offered even when the registry has no VP mapping, but the mismatch is
            named on the chip rather than hidden. */}
        <div className="cpm-filter-row" style={{ marginTop: 8 }} role="group" aria-label="Signals">
          <span className="cpm-field__label" style={{ alignSelf: 'center' }}>Signals</span>
          {SIGNAL_KEYS.map(k => {
            const on = signals.includes(k);
            const unmapped = k === 'vp' && loop != null && !loop.tags['VP'];
            return (
              <ObcButton key={k} variant={on ? 'raised' : 'normal'}
                onClick={() => toggleSignal(k)}
                aria-pressed={on}>
                {k.toUpperCase()}{unmapped ? ' (unmapped)' : ''}
              </ObcButton>
            );
          })}
          {(() => {
            // Same signals, standard Trend page: map the toggled keys onto the
            // loop's mapped tag paths (which now resolve through the UNS via the
            // signal-asset projection) and hand them to /trend as pens — PINNED
            // to this page's applied range, since the range is the analysis.
            const toggledTags = Object.fromEntries(
              signals.map(s => [s.toUpperCase(), loop?.tags[s.toUpperCase()] ?? ''])
                .filter(([, p]) => p));
            const href = loopTrendHref(toggledTags, '8h', { from, to });
            return href && (
              <ObcButton variant="normal" onClick={() => navigate(href)}>
                Open in Trend ›
              </ObcButton>
            );
          })()}
          <span className="cpm-filter-count">
            historian series at {series ?? '—'} · PV keeps its min–max envelope
          </span>
        </div>

        {trend.isLoading && <EmptyState title="Loading trend…" />}
        {/* "Trend unavailable", not "Historian unreachable": the error may be a
            403 or a validation 400 — the QueryError body carries the real cause,
            and a title asserting unreachability sent readers to check the wrong
            thing. */}
        {trend.isError && <QueryError title="Trend unavailable" error={trend.error} retry={() => void trend.refetch()} />}
        {!trend.isLoading && !trend.isError && points.length === 0 && (
          <EmptyState title="No historian data in this range"
            copy={series ? `No samples stored at ${series} between the selected dates.` : 'Select a loop.'} />
        )}
        {points.length > 0 && (
          <ReactECharts option={option} style={{ height: 380 }} notMerge />
        )}
        {/* A failed KPI fetch is not an empty overlay — say which it was. */}
        {kpis.isError && points.length > 0 && (
          <QueryError title="KPI overlay unavailable" error={kpis.error} retry={() => void kpis.refetch()} />
        )}
        {kpiRows.length === 0 && !kpis.isLoading && !kpis.isError && points.length > 0 && (
          <p className="cpm-copy">
            No {overlay.label.toLowerCase()} rows at {overlay.resolution} in this range —
            the overlay track is empty, not zero.
          </p>
        )}
        {kpiTruncatedFrom && (
          <p className="cpm-copy">
            Overlay truncated: this range holds more than {KPI_ROW_CAP} {overlay.resolution} windows,
            so the overlay covers only {fmtDateTime(kpiTruncatedFrom)} onward — the earlier part of
            the chart has no overlay because it was cut, not because nothing was computed.
          </p>
        )}

        {/* The mode ribbon is secondary — a failed fetch gets one honest line,
            not a full error card, but it must not just vanish. */}
        {modeTrack.isError && (
          <p className="cpm-copy">Mode track unavailable — the historian read failed.</p>
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
                {modes.map(m => {
                  // classifyMode mirrors the engine's vocabulary (AUT/CAS/CASCADE
                  // are auto). The old test was mode === 'AUTO' — a string the
                  // live data never contains — so every segment rendered amber.
                  const cls = classifyMode(m.mode);
                  const tone = cls === 'auto' ? 'good' : cls === 'manual' ? 'warn' : 'muted';
                  return (
                    <span key={m.ts}
                      className={`cpm-band-seg cpm-band-seg--${tone}`}
                      style={{ cursor: 'default', height: 10 }}
                      title={`${fmtDateTime(m.ts)} · ${m.mode ?? 'no data'}${cls === 'unknown' && m.mode != null ? ' (unrecognized mode)' : ''}`} />
                  );
                })}
              </div>
            </>
          );
        })()}

        <PanelHead eyebrow="Diagnosis bands" title="What each 24h window concluded"
          right={<span className="cpm-copy">
            {windows.length} evaluated window(s)
            {windowsTruncated ? ` (capped at ${GATE_WINDOW_CAP} — narrow the range for the rest)` : ''}
            {' '}· click a band to inspect
          </span>} />
        {history.isError && (
          <QueryError title="Diagnosis windows unavailable"
            error={history.error} retry={() => void history.refetch()} />
        )}
        {windows.length === 0 && !history.isError && !history.isLoading && (
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
                  onClick={() => setParams(p => { if (w.windowEnd) p.set('window', w.windowEnd); return p; }, { replace: true })}
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
          {windowFellBack && (
            <p className="cpm-copy" role="status">
              The window this link pointed at is not in the current range — showing the
              newest evaluated window instead.
            </p>
          )}
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
