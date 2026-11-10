'use client';

/**
 * CPLM Phase 7 — U6 Historical explorer (/cpm/historical?loop=&from=&to=&kpi=&window=).
 *
 * Composition only: the toolbar, the chart option, the lanes, the window list and the selected-window panel own their
 * own files under ./historical. Signals, KPI overlay, mode and result share ONE time axis in a single chart, with a
 * linked crosshair and a zoom slider. Under it, the evaluated windows on the left and the selected window on the right;
 * the list and the Result lane both write the same `?window=` (the window END).
 */
import { sameInstant } from './evidence/useWindowAt';
import React, { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import WindowKindToggle from './explorer/summary/WindowKindToggle';
import { WINDOW_KINDS, useWindowKind } from './useWindowKind';
import ReactECharts from 'echarts-for-react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { EmptyState, PanelHead, QueryError, WorkspaceHeader } from './shared';
import { fmtWhen } from './blocks/whenText';
import { LoopBand } from './context/LoopBand';
import TimeRangeBar from './trend/TimeRangeBar';
import { useCpmKpisRange, useCpmLoops, useCpmModeTrack, useCpmTrend } from '../../hooks/useCpm';
import { loopSeries } from '../../utils/loopSeries';
import { useHistoryExports } from './historical/useHistoryExports';
import { chartPalette, useChartTheme } from '../../charts/chartTheme';
import RangeToolbar, { ExportMenu, SIGNAL_KEYS } from './historical/RangeToolbar';
import SelectedWindowPanel from './historical/SelectedWindowPanel';
import EvaluatedWindows from './historical/EvaluatedWindows';
import ChartFoot from './historical/ChartFoot';
import ChartZoomBar from '../charts/ChartZoomBar';
import ChartCaptions from './historical/ChartCaptions';
import { WINDOW_CAP, packageReason, useWindowKpis } from './historical/useWindowKpis';
import { selectedWindowOf } from './historical/selectWindow';
import { modeSegmentsOf, resultMarkers } from './historical/lanes';
import { CHART_HEIGHT, buildChartOption } from './historical/chartOption';
import { useInstrumentHealthHistory } from './health/useInstrumentHealth';
import { explorerHref, registryHref, replayHref, trendHref } from './cpaHref';
import { useBoxZoom, useKeepSelecting } from '../charts/useBoxZoom';
import { healthSegments as toHealthSegments } from './health/HealthLane';
import { parseCustomRange, RANGE_PRESETS, activePreset, presetRange, spanOf, stepRange } from './historical/timeRange';

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

export const CpmHistorical: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // CHG-089: the fused window kind of the verdict history (?kind=, 12h default; ?window= here is an evaluated END)
  const [windowKind, setWindowKind] = useWindowKind('kind');
  const loopsQuery = useCpmLoops();
  const loops = useMemo(() => loopsQuery.data?.loops ?? [], [loopsQuery.data]);

  // No default selection: registry order is arbitrary, so `loops[0]` would be a CHOICE presented as a default.
  const loopId = params.get('loop') ?? undefined;
  const loop = loops.find(l => l.loopId.toLowerCase() === (loopId ?? '').toLowerCase());
  const kpiKey = params.get('kpi') ?? KPI_OVERLAYS[0].key;
  const overlay = KPI_OVERLAYS.find(k => k.key === kpiKey) ?? KPI_OVERLAYS[0];

  // Signal picker (?signals=pv,op,vp): the historian stores pv/sp/op/vp per loop, so VP (the signature of a sticking valve) is offered.
  const signals = useMemo(() => {
    const parsed = (params.get('signals') ?? '')
      .split(',').map(s => s.trim().toLowerCase())
      .filter((s): s is typeof SIGNAL_KEYS[number] => (SIGNAL_KEYS as readonly string[]).includes(s));
    return parsed.length ? parsed : ['pv', 'sp', 'op'];
  }, [params]);

  // Applied range comes from the URL (deep-linkable, always absolute). CHG-097: keyed on the range params only, so
  // selecting a window or a signal does not move "now" and refetch the trend, mode track, KPIs and history.
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
  const applyRange = (f: Date, t: Date, keepWindow = false) => write(p => {
    p.set('from', f.toISOString());
    p.set('to', t.toISOString());
    // A window selected under the old range may not exist in the new one; dropping it beats re-pointing at the newest.
    if (!keepWindow) p.delete('window');
  });
  /** The list and the Result lane both choose a window this way. */
  const selectWindow = (end: string) => write(p => p.set('window', end));

  const series = loopId ? loopSeries(loopId) : undefined;
  const trend = useCpmTrend(series, from, to, 300, signals.join(','));
  const modeTrack = useCpmModeTrack(series, from, to, 96);
  const kpis = useCpmKpisRange(loopId, overlay.resolution, from.toISOString(), to.toISOString());
  const { windows, full, history, summaries, truncated, fullCapped } = useWindowKpis(loopId, windowKind, from, to);

  const points = useMemo(() => trend.data?.points ?? [], [trend.data]);
  const kpiRows = useMemo(() => kpis.data?.samples ?? [], [kpis.data]);

  const selectedWindowEnd = params.get('window');
  // CHG-140: a window named in the address is that window or is not found, never the newest in its place
  const { window: selectedWindow, notFound: windowFellBack } = selectedWindowOf(windows, selectedWindowEnd);
  const selectedFull = full.find(w => sameInstant(w.windowEnd, selectedWindow?.windowEnd));

  // ── Lane segments, from real instants.
  const modeSegments = useMemo(() => modeSegmentsOf(modeTrack.data?.points ?? [], to.getTime()), [modeTrack.data, to]);
  const { markers: verdictSegments, selected: selectedSpan } = useMemo(
    () => resultMarkers(windows, { from: from.getTime(), to: to.getTime() }, selectedWindow?.windowEnd),
    [windows, from, to, selectedWindow]);

  const kpiTruncatedFrom = kpiRows.length >= KPI_ROW_CAP ? kpiRows[kpiRows.length - 1]?.window_end ?? null : null;
  // An all-null response used to draw an empty frame with axes and no explanation.
  const hasPlottableSignal = useMemo(() => points.some(p =>
    signals.some(s => typeof p[s] === 'number' || typeof p[`${s}_avg`] === 'number')), [points, signals]);
  // The chart draws if ANY lane has something to say; a missing signal becomes a caption, not an empty page.
  const hasAnyLane = hasPlottableSignal || verdictSegments.length > 0 || modeSegments.length > 0 || kpiRows.length > 0;

  // v2.5 (1H.6): the PV instrument's eligibility intervals as a lane; omitted only while the request is unanswered.
  const healthHistory = useInstrumentHealthHistory(loopId, from, to);
  const healthLane = useMemo(
    () => healthHistory.data ? toHealthSegments(healthHistory.data.intervals, from, to, 'PV') : undefined,
    [healthHistory.data, from, to]);

  const theme = useChartTheme();
  const normalize = params.get('normalize') === '1';
  const timeZone = loop?.timezone || 'UTC';
  const focus = params.get('focus');
  // CHG-139: the selected window is shaded by default, where the signals are read.
  const highlight = useMemo(
    () => (selectedSpan ? { ...selectedSpan, label: `Evaluated window${focus ? ` · ${focus}` : ''}` } : null),
    [selectedSpan, focus]);
  const box = useBoxZoom({ hasY: true });
  const option = useMemo(() => buildChartOption({
    points, kpiRows, overlay, signals, modeSegments, verdictSegments, healthSegments: healthLane, from, to,
    palette: chartPalette(), pvUnit: loop?.engineering?.pvUnit ?? '', timeZone, normalize, zoom: box.zoom, highlight,
  }),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- theme is a recompute trigger: the palette is read from CSS variables that change with it.
  [points, kpiRows, overlay, signals, modeSegments, verdictSegments, healthLane, from, to, theme, timeZone, normalize, box.zoom, highlight]);
  useKeepSelecting(box, option);

  // Zoom explores; Apply commits: writing the x span back to ?from/?to is what makes the KPI and window queries refetch.
  const xZoom = box.zoom.x.start > 0.5 || box.zoom.x.end < 99.5 ? box.zoom.x : null;
  const applyZoom = () => {
    if (!xZoom) return;
    const span = spanOf(from, to);
    applyRange(new Date(from.getTime() + (xZoom.start / 100) * span), new Date(from.getTime() + (xZoom.end / 100) * span));
    box.reset();
  };
  const widen = () => { const r = presetRange(30 * 86_400_000); applyRange(r.from, r.to); };
  const fitToWindow = () => {
    if (!selectedWindow) return;
    const endMs = Date.parse(selectedWindow.windowEnd);
    const startMs = selectedWindow.windowStart ? Date.parse(selectedWindow.windowStart) : endMs - (Number.parseInt(windowKind, 10) || 12) * 3_600_000;
    applyRange(new Date(startMs), new Date(endMs), true);
  };

  const onChartClick = (e: { seriesName?: string; dataIndex?: number }) => {
    if (e.seriesName !== 'verdict-track' || e.dataIndex == null) return;
    const end = verdictSegments[e.dataIndex]?.windowEnd;
    if (end) selectWindow(end);
  };

  // CHG-097: labelled downloads. Full rows only: older windows are summaries, which carry no evidence package.
  const exporter = useHistoryExports({
    loopId, loop, series, from, to, timeZone, windows: full, truncated: fullCapped, cap: WINDOW_CAP, selected: selectedFull,
  });

  // The signals on show that the loop maps; Trend draws exactly those pens.
  const toggledRoles = signals.map(s => s.toUpperCase()).filter(r => loop?.tags[r]);
  const windowsError = history.error ?? summaries.error;

  return (
    // CHG-159 (owner review): no ? on the title; the page's buttons and fields are 32 px (cpm-compact)
    <div className="cpm-screen cpm-compact">
      <WorkspaceHeader page="/cpm/historical" title="Historical" copy=""
        actions={<WindowKindToggle value={windowKind} kinds={WINDOW_KINDS} onChange={setWindowKind} />} />
      {/* CHG-159 (owner's design): the band is a card, as on Loop Explorer */}
      <LoopBand card loopId={loopId}
        onLoop={id => write(p => { p.set('loop', id); p.delete('window'); })}
        onClear={() => write(p => { p.delete('loop'); p.delete('window'); })}
        end={(
          <div className="cpm-hist-bandend">
            {loopId && <ObcButton variant="normal" onClick={() => navigate(explorerHref(loopId, { kind: windowKind }))}>Loop Explorer ↗</ObcButton>}
            <ExportMenu loopId={loopId ?? ''} exportDisabled={full.length === 0} onExport={k => void exporter.run(k)} exportBusy={exporter.busy}
              packageWindow={selectedFull?.windowEnd ? fmtWhen(selectedFull.windowEnd) : null}
              packageUnavailable={selectedWindow && !selectedFull ? packageReason(selectedWindow.windowEnd) : null} />
          </div>
        )}>
        <TimeRangeBar from={from} to={to} presets={RANGE_PRESETS} preset={preset}
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
          }} />
      </LoopBand>

      <section className="cpm-surface cpm-hist-chart">
        <RangeToolbar
          loop={loop}
          signals={signals}
          onToggleSignal={key => {
            const next = signals.includes(key) ? signals.filter(s => s !== key) : [...signals, key];
            if (next.length === 0) return; // an empty chart answers nothing
            write(p => p.set('signals', SIGNAL_KEYS.filter(k => next.includes(k)).join(',')));
          }}
          overlays={KPI_OVERLAYS}
          overlayKey={overlay.key}
          onOverlay={key => write(p => p.set('kpi', key))}
          trendHref={loopId && toggledRoles.length > 0 ? trendHref(loopId, { roles: toggledRoles, from: from.toISOString(), to: to.toISOString() }) : null}
          onOpenTrend={href => navigate(href)}
          normalize={normalize}
          onToggleNormalize={() => write(p => { if (normalize) p.delete('normalize'); else p.set('normalize', '1'); })}
          tools={hasAnyLane && (
            <ChartZoomBar box={box} hasData>
              {xZoom && <ObcButton variant="raised" onClick={applyZoom}>Apply zoom to range →</ObcButton>}
            </ChartZoomBar>
          )}
        />
        {exporter.error && <p className="cpm-field__error" role="alert">{exporter.error}</p>}

        {trend.isLoading && <EmptyState level={2} title="Loading trend…" />}
        {/* "Trend unavailable", not "Historian unreachable": the error may be a 403 or a validation 400. */}
        {trend.isError && <QueryError title="Trend unavailable" error={trend.error} retry={() => void trend.refetch()} />}
        {!trend.isLoading && !trend.isError && !hasAnyLane && (
          <EmptyState
            level={2}
            title={series ? 'Nothing recorded in this range' : 'Select a loop'}
            copy={series
              ? "No signal samples, KPI rows or evaluated windows were stored for this loop between the selected dates. Widen the range, or check the loop's signal mapping."
              : 'Pick a loop in the band above to draw its signals, KPI overlay and results.'}
            action={series ? { label: 'Widen to 30 days', onClick: widen } : undefined}
            next={series && loopId ? [{ label: 'Signal mapping in the Loop Registry', to: registryHref(loopId) }] : undefined}
          />
        )}

        {hasAnyLane && (
          <ReactECharts option={option} style={{ height: CHART_HEIGHT }} notMerge
            onChartReady={box.onChartReady} onEvents={{ datazoom: box.onDataZoom, click: onChartClick }} />
        )}

        <ChartCaptions loopId={loop?.loopId ?? loopId} signals={signals} hasAnyLane={hasAnyLane} hasPlottableSignal={hasPlottableSignal} overlay={overlay}
          kpi={{ isError: kpis.isError, isLoading: kpis.isLoading, error: kpis.error, refetch: () => void kpis.refetch(), empty: kpiRows.length === 0, truncatedFrom: kpiTruncatedFrom, cap: KPI_ROW_CAP }}
          mode={{ isError: modeTrack.isError, empty: modeSegments.length === 0 }}
          history={{ isError: !!windowsError, error: windowsError, refetch: () => { void history.refetch(); void summaries.refetch(); } }} />

        {/* CHG-159: the panel's foot strip */}
        {hasAnyLane && <ChartFoot results={windows.length} windowKind={windowKind} capped={truncated} cap={WINDOW_CAP} />}
      </section>

      <div className="cpm-hist-lower">
        <section className="cpm-surface">
          <PanelHead title="Evaluated windows" />
          <EvaluatedWindows windows={windows} selectedEnd={selectedWindow?.windowEnd ?? null} onSelect={selectWindow}
            loading={history.isLoading} />
        </section>
        <SelectedWindowPanel
          loopId={loopId}
          window={selectedWindow}
          fellBack={windowFellBack}
          noWindows={windows.length === 0 && !history.isLoading && !history.isError}
          onWiden={widen}
          onFit={fitToWindow}
          onReplay={end => { if (loopId) navigate(replayHref(loopId, { window: end, kind: windowKind })); }}
          onPackage={() => void exporter.run('package')}
          packageReady={!!selectedFull}
        />
      </div>
    </div>
  );
};

export default CpmHistorical;
