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
import React, { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import WindowKindToggle from './explorer/summary/WindowKindToggle';
import { WINDOW_KINDS, useWindowKind } from './useWindowKind';
import ReactECharts from 'echarts-for-react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import {
  EmptyState, PanelHead, QueryError, WorkspaceHeader,
  classifyMode, cpmChartColors, cpmToneColors, diagnosisBand, fmtDateTime, loopTrendHref,
} from './shared';
import { LoopContextBar } from './context/LoopContextBar';
import { useCpmScope } from './plantScope';
import type { CpmGateMatrix } from '../../api/cpmApi';
import {
  useCpmKpisRange, useCpmLoops, useCpmModeTrack, useCpmTrend, useGateHistory,
} from '../../hooks/useCpm';
import { loopSeries } from '../../utils/loopSeries';
import { useHistoryExports } from './historical/useHistoryExports';
import { useObcTheme } from '../../hooks/useObcTheme';
import RangeToolbar, { SIGNAL_KEYS } from './historical/RangeToolbar';
import SelectedWindowPanel from './historical/SelectedWindowPanel';
import { CHART_HEIGHT, buildChartOption, type Segment } from './historical/chartOption';
import { useInstrumentHealthHistory } from './health/useInstrumentHealth';
import { replayHref } from './cpaHref';
import { useBoxZoom, useKeepSelecting } from '../charts/useBoxZoom';
import ChartZoomBar from '../charts/ChartZoomBar';
import { healthSegments as toHealthSegments } from './health/HealthLane';
import {
  parseCustomRange,
  RANGE_PRESETS, activePreset, presetRange, spanOf, stepRange,
} from './historical/timeRange';
import { diagnosisLabel } from './vocabulary';

/** KPI overlays offered — real stored fields only, each at its own resolution. */
const KPI_OVERLAYS = [
  { key: 'effort_ratio', label: 'Actuator effort ratio', resolution: '15m', unit: 'ratio' },
  { key: 'iae', label: 'Integral absolute error', resolution: '15m', unit: 'EU·s' },
  { key: 'good_error_pct', label: 'Good-error time', resolution: '15m', unit: '%', scale: 100 },   // CHG-065: × 100, as everywhere
  { key: 'triangularity', label: 'OP triangularity (stiction)', resolution: '12h', unit: 'score' },
  { key: 'harmonic_energy_ratio', label: 'Harmonic energy ratio', resolution: '12h', unit: 'ratio' },
];

/** The KPI endpoint caps at 500 rows, newest-first (~5.2 days at 15m). */
const KPI_ROW_CAP = 500;
/** Gate history is capped at 100 windows (~100 days at 24h). */
const GATE_WINDOW_CAP = 100;

export const CpmHistorical: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // CHG-089: the fused window kind of the verdict history (?kind=, 12h default; ?window= here is an evaluated END)
  const [windowKind, setWindowKind] = useWindowKind('kind');
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
  // CHG-097 (SME review 2 #16): keyed on the range params only — selecting a window or a signal must not move "now"
  // and refetch the trend, mode track, KPIs and history
  const toIso = params.get('to');
  const fromIso = params.get('from');
  const { from, to } = useMemo(() => {
    const now = new Date();
    return {
      from: fromIso ? new Date(fromIso) : new Date(now.getTime() - 3 * 24 * 3600_000),
      to: toIso ? new Date(toIso) : now,
    };
  }, [fromIso, toIso]);
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
  const history = useGateHistory(loopId, windowKind, from.toISOString(), to.toISOString());

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
      label: `${b.label} · ${diagnosisLabel(w.diagnosis)}`,
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

  // v2.5 (1H.6): the PV instrument's eligibility intervals as a fifth lane. The lane exists
  // whenever the history answered (even empty — a gap is the truthful state); it is omitted only
  // while the request is unanswered so the layout does not jump.
  const healthHistory = useInstrumentHealthHistory(loopId, from, to);
  const healthLane = useMemo(
    () => healthHistory.data ? toHealthSegments(healthHistory.data.intervals, from, to, 'PV') : undefined,
    [healthHistory.data, from, to]);

  const obcTheme = useObcTheme(); // re-derive chart colors on theme switch
  // v2.5 (2E.2, R14): the chart's units and zone come from the registry (PV unit is not declared
  // there yet - 'EU' until 2G adds it); Normalise is an explicit URL choice (?normalize=1).
  const normalize = params.get('normalize') === '1';
  const timeZone = loop?.timezone || 'UTC';
  const focus = params.get('focus');
  const highlight = useMemo(() => {
    const w = params.get('window') ? selectedWindow : undefined;
    if (!w?.windowStart || !w.windowEnd) return null;
    return { startMs: Date.parse(w.windowStart), endMs: Date.parse(w.windowEnd),
      label: `Evaluated ${w.windowKind} window${focus ? ` · ${focus}` : ''}` };
  }, [params, selectedWindow, focus]);
  // Phase 5: rectangle zoom across every lane on x, on the signals grid for y; the
  // slider, the wheel and the box all land in the same state (linked axes).
  const box = useBoxZoom({ hasY: true });
  const option = useMemo(() => buildChartOption({
    points, kpiRows, overlay, signals, modeSegments, verdictSegments, healthSegments: healthLane, from, to,
    pens: cpmChartColors(), tones: cpmToneColors(), pvUnit: loop?.engineering?.pvUnit ?? '', timeZone, normalize, zoom: box.zoom,
    // CHG-097 (SME review 2 #26): a chosen window (verdict lane, KPI card, finding) is shaded where the signals are read
    highlight: highlight,
  }),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- obcTheme is a recompute trigger: chart colors are read from CSS vars that change with the theme.
  [points, kpiRows, overlay, signals, modeSegments, verdictSegments, healthLane, from, to, obcTheme, timeZone, normalize, box.zoom, highlight]);
  useKeepSelecting(box, option);

  // Zoom explores; Apply commits. Any zoom (slider, wheel or box) filters what is
  // DRAWN; writing the x span back to ?from/?to is what makes the KPI and gate
  // queries refetch at the tighter range.
  const xZoom = box.zoom.x.start > 0.5 || box.zoom.x.end < 99.5 ? box.zoom.x : null;
  const applyZoom = () => {
    if (!xZoom) return;
    const span = spanOf(from, to);
    applyRange(
      new Date(from.getTime() + (xZoom.start / 100) * span),
      new Date(from.getTime() + (xZoom.end / 100) * span),
    );
    box.reset();
  };

  const onChartClick = (e: { seriesName?: string; dataIndex?: number }) => {
    if (e.seriesName !== 'verdict-track' || e.dataIndex == null) return;
    const end = verdictSegments[e.dataIndex]?.windowEnd;
    if (end) write(p => p.set('window', end));
  };

  // CHG-097 (SME review 2 #17): labelled downloads — signal samples, evaluated windows, the selected window's evidence
  // package — each with the loop, period, time zone and units (the window cap still travels with the windows export)
  const exporter = useHistoryExports({
    loopId, loop, series, from, to, timeZone, windows, truncated: windowsTruncated, cap: GATE_WINDOW_CAP,
    selected: params.get('window') ? selectedWindow : undefined,
  });

  const toggledTags = Object.fromEntries(
    signals.map(s => [s.toUpperCase(), loop?.tags[s.toUpperCase()] ?? ''])
      .filter(([, path]) => path));

  return (
    <div className="cpm-screen">
      <WorkspaceHeader page="/cpm/historical" title="Historical"
        actions={<WindowKindToggle value={windowKind} kinds={WINDOW_KINDS} onChange={setWindowKind} />} />
      <LoopContextBar loopId={loopId} period={{ label: 'Historical range', start: from.getTime(), end: to.getTime() }} />

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
            const r = parseCustomRange(f, t);
            if (typeof r === 'string') return r;
            applyRange(r.from, r.to);
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
          onExport={k => void exporter.run(k)}
          exportBusy={exporter.busy}
          packageWindow={params.get('window') && selectedWindow?.windowEnd ? fmtDateTime(selectedWindow.windowEnd) : null}
          normalize={normalize}
          onToggleNormalize={() => write(p => { if (normalize) p.delete('normalize'); else p.set('normalize', '1'); })}
        />
        {exporter.error && <p className="cpm-field__error" role="alert">{exporter.error}</p>}

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
              onChartReady={box.onChartReady}
              onEvents={{ datazoom: box.onDataZoom, click: onChartClick }}
            />
            <div className="cpm-hist-zoom" role="status">
              <ChartZoomBar box={box} hasData={hasAnyLane}>
                {xZoom && (
                  <>
                    <span className="cpm-copy">
                      Zoomed view only — the overlay and verdict feeds are still loaded for
                      the applied range.
                    </span>
                    <ObcButton variant="raised" onClick={applyZoom}>Apply zoom to range ›</ObcButton>
                  </>
                )}
              </ChartZoomBar>
            </div>
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

      <SelectedWindowPanel windowKind={windowKind}
        loopId={loopId}
        window={windows.length > 0 ? selectedWindow : undefined}
        fellBack={windowFellBack}
        noWindows={windows.length === 0 && !history.isLoading && !history.isError}
        onWiden={() => {
          const r = presetRange(30 * 86_400_000);
          applyRange(r.from, r.to);
        }}
        onReplay={windowEnd => {
          if (loopId) navigate(replayHref(loopId, { window: windowEnd, kind: windowKind }));
        }}
      />
    </div>
  );
};

export default CpmHistorical;
