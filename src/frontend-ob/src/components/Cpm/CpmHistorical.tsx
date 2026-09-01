'use client';

/**
 * CPLM Phase 7 — U6 Historical explorer (/cpm/historical?loop=&from=&to=&kpi=).
 *
 * Composition only: the toolbar, the chart option and the selected-window panel
 * own their own files under ./historical.
 *
 * The structural change from the CPA-parity version: signals, KPI overlay, mode
 * and verdict now live on ONE shared time axis inside a single chart, with a
 * linked crosshair and a zoom slider. Previously the bands were index-positioned
 * flex segments beside a time-axis chart, so the two could not be read against
 * each other — which is the only reason this screen exists.
 */
import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import {
  EmptyState, PanelHead, QueryError, WorkspaceHeader,
  classifyMode, cpmChartColors, cpmToneColors, diagnosisBand, fmtDateTime, loopTrendHref,
} from './shared';
import { useCpmScope } from './plantScope';
import type { CpmGateMatrix } from '../../api/cpmApi';
import {
  useCpmKpisRange, useCpmLoops, useCpmModeTrack, useCpmTrend, useGateHistory,
} from '../../hooks/useCpm';
import { loopSeries } from '../../utils/loopSeries';
import { useObcTheme } from '../../hooks/useObcTheme';
import RangeToolbar, { SIGNAL_KEYS } from './historical/RangeToolbar';
import SelectedWindowPanel from './historical/SelectedWindowPanel';
import { CHART_HEIGHT, buildChartOption, type Segment } from './historical/chartOption';
import {
  RANGE_PRESETS, activePreset, presetRange, spanOf, stepRange,
} from './historical/timeRange';

/** KPI overlays offered — real stored fields only, each at its own resolution. */
const KPI_OVERLAYS = [
  { key: 'effort_ratio', label: 'Actuator effort ratio', resolution: '15m', unit: 'ratio' },
  { key: 'iae', label: 'Integral absolute error', resolution: '15m', unit: 'EU·s' },
  { key: 'good_error_pct', label: 'Good-error time', resolution: '15m', unit: '% (0-1 fraction)' },
  { key: 'triangularity', label: 'OP triangularity (stiction)', resolution: '24h', unit: 'score' },
  { key: 'harmonic_energy_ratio', label: 'Harmonic energy ratio', resolution: '24h', unit: 'ratio' },
];

/** The KPI endpoint caps at 500 rows, newest-first (~5.2 days at 15m). */
const KPI_ROW_CAP = 500;
/** Gate history is capped at 100 windows (~100 days at 24h). */
const GATE_WINDOW_CAP = 100;

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
  const scope = useCpmScope();

  // No default selection: registry order is arbitrary, so `loops[0]` is a
  // CHOICE presented as a default — the same lie the ?loop=-names-nothing
  // fallback was fixed for, minus the URL. It also fired this page's whole
  // query set for a loop nobody asked for.
  const loopId = params.get('loop') ?? undefined;
  const loop = loops.find(l => l.loopId.toLowerCase() === (loopId ?? '').toLowerCase());
  const kpiKey = params.get('kpi') ?? KPI_OVERLAYS[0].key;
  const overlay = KPI_OVERLAYS.find(k => k.key === kpiKey) ?? KPI_OVERLAYS[0];

  // Signal picker (?signals=pv,op,vp). The historian stores pv/sp/op/vp per loop
  // and /trend takes any measurements CSV — the UI just never asked for more
  // than pv,sp,op, so VP (the direct visual signature of a sticking valve) was
  // invisible on a stiction-diagnosis product.
  const signals = useMemo(() => {
    const parsed = (params.get('signals') ?? '')
      .split(',').map(s => s.trim().toLowerCase())
      .filter((s): s is typeof SIGNAL_KEYS[number] => (SIGNAL_KEYS as readonly string[]).includes(s));
    return parsed.length ? parsed : ['pv', 'sp', 'op'];
  }, [params]);

  // Applied range comes from the URL (deep-linkable, always absolute).
  const { from, to } = useMemo(() => {
    const now = new Date();
    const toIso = params.get('to');
    const fromIso = params.get('from');
    return {
      from: fromIso ? new Date(fromIso) : new Date(now.getTime() - 3 * 24 * 3600_000),
      to: toIso ? new Date(toIso) : now,
    };
  }, [params]);
  const preset = activePreset(from, to);

  const write = (mutate: (p: URLSearchParams) => void) =>
    setParams(p => { mutate(p); return p; }, { replace: true });

  const applyRange = (f: Date, t: Date) => write(p => {
    p.set('from', f.toISOString());
    p.set('to', t.toISOString());
    // A window selected under the old range may not exist in the new one;
    // dropping it beats silently re-pointing at whatever is newest.
    p.delete('window');
  });

  const series = loopId ? loopSeries(loopId) : undefined;
  const trend = useCpmTrend(series, from, to, 300, signals.join(','));
  const modeTrack = useCpmModeTrack(series, from, to, 96);
  const kpis = useCpmKpisRange(loopId, overlay.resolution, from.toISOString(), to.toISOString());
  const history = useGateHistory(loopId, '24h', from.toISOString(), to.toISOString());

  const points = useMemo(() => trend.data?.points ?? [], [trend.data]);
  const kpiRows = useMemo(() => kpis.data?.samples ?? [], [kpis.data]);

  // Oldest → newest so the verdict lane reads left-to-right in time.
  const windows = useMemo(() => {
    const rows = history.data?.windows ?? [];
    return [...rows].sort((a, b) => (a.windowEnd ?? '').localeCompare(b.windowEnd ?? ''));
  }, [history.data]);
  const selectedWindowEnd = params.get('window');
  const selectedWindow: CpmGateMatrix | undefined =
    windows.find(w => w.windowEnd === selectedWindowEnd) ?? windows[windows.length - 1];
  const windowFellBack = !!selectedWindowEnd && windows.length > 0
    && !windows.some(w => w.windowEnd === selectedWindowEnd);

  // ── Lane segments, from real instants.
  const modeSegments = useMemo<Segment[]>(() => {
    const pts = (modeTrack.data?.points ?? [])
      .map(p => ({ ts: p.ts, mode: typeof p.mode === 'string' ? p.mode : null }))
      .filter(p => p.mode != null);
    const out: Segment[] = [];
    for (let i = 0; i < pts.length; i++) {
      // classifyMode mirrors the engine's vocabulary (AUT/CAS/CASCADE are auto).
      const cls = classifyMode(pts[i].mode);
      const tone = cls === 'auto' ? 'good' : cls === 'manual' ? 'warn' : 'muted';
      const endMs = pts[i + 1]?.ts ?? to.getTime();
      const head = out[out.length - 1];
      if (head && head.label === (pts[i].mode ?? '')) { head.endMs = endMs; continue; }
      out.push({ startMs: pts[i].ts, endMs, tone, label: pts[i].mode ?? '' });
    }
    return out;
  }, [modeTrack.data, to]);

  const verdictSegments = useMemo<Segment[]>(() => windows.flatMap(w => {
    if (!w.windowStart || !w.windowEnd) return [];
    const b = diagnosisBand(w.diagnosis);
    return [{
      startMs: Date.parse(w.windowStart),
      endMs: Date.parse(w.windowEnd),
      tone: b.tone,
      label: `${b.label} · ${(w.diagnosis ?? '—').replace(/_/g, ' ')}`,
      windowEnd: w.windowEnd,
    }];
  }), [windows]);

  // H3/H4: both feeds are capped, and a capped answer must say so.
  const kpiTruncatedFrom = useMemo(() => {
    if (kpiRows.length < KPI_ROW_CAP) return null;
    return kpiRows[kpiRows.length - 1]?.window_end ?? null;
  }, [kpiRows]);
  const windowsTruncated = (history.data?.count ?? 0) >= GATE_WINDOW_CAP;

  // The old guard tested whether the historian returned BUCKETS, not whether any
  // bucket carried a value — so an all-null response drew a 380px empty frame
  // with axes and no explanation instead of the empty state.
  const hasPlottableSignal = useMemo(() => points.some(p =>
    signals.some(s => typeof p[s] === 'number' || typeof p[`${s}_avg`] === 'number')),
  [points, signals]);
  // A loop can have verdicts with no stored samples. The bands used to render
  // independently of the chart, so gating the whole chart on signal data would
  // have hidden them — the chart draws if ANY lane has something to say, and the
  // missing-signal case becomes a caption rather than an empty page.
  const hasAnyLane = hasPlottableSignal || verdictSegments.length > 0
    || modeSegments.length > 0 || kpiRows.length > 0;

  const obcTheme = useObcTheme(); // re-derive chart colors on theme switch
  const option = useMemo(() => buildChartOption({
    points, kpiRows, overlay, signals, modeSegments, verdictSegments, from, to,
    pens: cpmChartColors(), tones: cpmToneColors(),
  }),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- obcTheme is a recompute trigger: chart colors are read from CSS vars that change with the theme.
  [points, kpiRows, overlay, signals, modeSegments, verdictSegments, from, to, obcTheme]);

  // Zoom explores; Apply commits. The slider filters what is DRAWN; writing the
  // span back to ?from/?to is what makes the KPI and gate queries refetch at the
  // tighter range.
  const [zoom, setZoom] = useState<{ start: number; end: number } | null>(null);
  const onZoom = (e: { batch?: { start?: number; end?: number }[]; start?: number; end?: number }) => {
    const z = e.batch?.[0] ?? e;
    const s = typeof z.start === 'number' ? z.start : 0;
    const t = typeof z.end === 'number' ? z.end : 100;
    setZoom(s > 0.5 || t < 99.5 ? { start: s, end: t } : null);
  };
  const applyZoom = () => {
    if (!zoom) return;
    const span = spanOf(from, to);
    applyRange(
      new Date(from.getTime() + (zoom.start / 100) * span),
      new Date(from.getTime() + (zoom.end / 100) * span),
    );
    setZoom(null);
  };

  const onChartClick = (e: { seriesName?: string; dataIndex?: number }) => {
    if (e.seriesName !== 'verdict-track' || e.dataIndex == null) return;
    const end = verdictSegments[e.dataIndex]?.windowEnd;
    if (end) write(p => p.set('window', end));
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

  const toggledTags = Object.fromEntries(
    signals.map(s => [s.toUpperCase(), loop?.tags[s.toUpperCase()] ?? ''])
      .filter(([, path]) => path));

  return (
    <div className="cpm-screen">
      <WorkspaceHeader eyebrow="Evidence over time" title="Historical explorer" />

      <section className="cpm-surface">
        <RangeToolbar
          scope={scope}
          loops={loops}
          loopId={loopId ?? ''}
          loop={loop}
          loopsInScope={loops.filter(l => scope.matches(l)).length}
          onLoopChange={id => write(p => { p.set('loop', id); p.delete('window'); })}
          onLoopClear={() => write(p => { p.delete('loop'); p.delete('window'); })}
          from={from}
          to={to}
          preset={preset}
          onPreset={key => {
            const p = RANGE_PRESETS.find(x => x.key === key);
            if (p) { const r = presetRange(p.ms); applyRange(r.from, r.to); }
          }}
          onStep={dir => { const r = stepRange(from, to, dir); applyRange(r.from, r.to); }}
          onNow={() => { const r = presetRange(spanOf(from, to)); applyRange(r.from, r.to); }}
          onApplyCustom={(f, t) => {
            const fd = new Date(f); const td = new Date(t);
            if (Number.isNaN(fd.getTime()) || Number.isNaN(td.getTime())) return 'Enter both dates.';
            // Caught here rather than letting historian-bff answer 400 and the
            // chart render an error for what is simply a backwards range.
            if (td <= fd) return '"To" must be after "From".';
            applyRange(fd, td);
            return null;
          }}
          signals={signals}
          onToggleSignal={key => {
            const next = signals.includes(key)
              ? signals.filter(s => s !== key) : [...signals, key];
            if (next.length === 0) return; // an empty chart answers nothing
            write(p => p.set('signals', SIGNAL_KEYS.filter(k => next.includes(k)).join(',')));
          }}
          overlays={KPI_OVERLAYS}
          overlayKey={overlay.key}
          onOverlay={key => write(p => p.set('kpi', key))}
          seriesPath={series}
          trendHref={loopTrendHref(toggledTags, '8h', { from, to })}
          onOpenTrend={href => navigate(href)}
          exportDisabled={windows.length === 0}
          onExport={exportEvidence}
        />

        <PanelHead
          eyebrow="One time axis"
          title="Signals, overlay, mode and verdict"
          right={
            <span className="cpm-hist-note">
              {windows.length} evaluated window(s)
              {windowsTruncated ? ` · capped at ${GATE_WINDOW_CAP}` : ''}
              {' · click a verdict band to inspect'}
            </span>
          }
        />

        {trend.isLoading && <EmptyState title="Loading trend…" />}
        {/* "Trend unavailable", not "Historian unreachable": the error may be a
            403 or a validation 400, and the QueryError body carries the cause. */}
        {trend.isError && (
          <QueryError title="Trend unavailable" error={trend.error} retry={() => void trend.refetch()} />
        )}
        {!trend.isLoading && !trend.isError && !hasAnyLane && (
          <EmptyState
            title="Nothing recorded in this range"
            copy={series
              ? `No historian samples at ${series}, no KPI rows and no evaluated windows between the selected dates.`
              : 'Select a loop.'}
          />
        )}

        {hasAnyLane && (
          <>
            <ReactECharts
              option={option}
              style={{ height: CHART_HEIGHT }}
              notMerge
              onEvents={{ dataZoom: onZoom, click: onChartClick }}
            />
            {zoom && (
              <div className="cpm-hist-zoom" role="status">
                <span className="cpm-copy">
                  Zoomed view only — the overlay and verdict feeds are still loaded for
                  the applied range.
                </span>
                <ObcButton variant="raised" onClick={applyZoom}>Apply zoom to range ›</ObcButton>
              </div>
            )}
          </>
        )}

        {/* Caption line under the chart, not free paragraphs in the section
            flow — they used to collide with the next panel head. */}
        <div className="cpm-hist-captions">
          {!hasPlottableSignal && hasAnyLane && (
            <p className="cpm-hist-note">
              No values stored at {series} for{' '}
              {signals.map(x => x.toUpperCase()).join(', ')} in this range — the signal lane
              is empty, but the other lanes below it are not.
            </p>
          )}
          {kpis.isError && hasAnyLane && (
            <QueryError title="KPI overlay unavailable" error={kpis.error} retry={() => void kpis.refetch()} />
          )}
          {kpiRows.length === 0 && !kpis.isLoading && !kpis.isError && hasAnyLane && (
            <p className="cpm-hist-note">
              No {overlay.label.toLowerCase()} rows at {overlay.resolution} in this range —
              the overlay lane is empty, not zero.
            </p>
          )}
          {kpiTruncatedFrom && (
            <p className="cpm-hist-note">
              Overlay truncated: this range holds more than {KPI_ROW_CAP} {overlay.resolution}{' '}
              windows, so the overlay covers only {fmtDateTime(kpiTruncatedFrom)} onward — the
              earlier part is cut, not uncomputed.
            </p>
          )}
          {modeTrack.isError && (
            <p className="cpm-hist-note">Mode lane unavailable — the historian read failed.</p>
          )}
          {modeSegments.length === 0 && !modeTrack.isError && hasAnyLane && (
            <p className="cpm-hist-note">
              No controller-mode samples stored in this range, so the mode lane is empty.
            </p>
          )}
          {history.isError && (
            <QueryError title="Diagnosis windows unavailable"
              error={history.error} retry={() => void history.refetch()} />
          )}
        </div>
      </section>

      <SelectedWindowPanel
        window={windows.length > 0 ? selectedWindow : undefined}
        fellBack={windowFellBack}
        noWindows={windows.length === 0 && !history.isLoading && !history.isError}
        onWiden={() => {
          const r = presetRange(30 * 86_400_000);
          applyRange(r.from, r.to);
        }}
        onReplay={windowEnd => {
          const q = new URLSearchParams({ loop: loopId ?? '' });
          if (windowEnd) q.set('window', windowEnd);
          navigate(`/cpm/replay?${q.toString()}`);
        }}
      />
    </div>
  );
};

export default CpmHistorical;
