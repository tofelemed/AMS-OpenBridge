/**
 * SPEC §6.4 TrendPanel: one echarts instance, several grids on one time axis, lanes that say what
 * they mean, gaps that stay gaps, and every reading reachable without a mouse or a canvas. Option
 * building is pure (trendOption.ts); this component owns the zoom, the cursor and the chrome.
 */
import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import type { ECharts } from 'echarts';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { chartPalette, useChartTheme } from '../../charts/chartTheme';
import { zoomBatch } from '../../components/charts/boxZoom';
import { useBoxZoom, useKeepSelecting } from '../../components/charts/useBoxZoom';
import { siteStamp, windowOf, windowText, xFormat } from './trendFormat';
import { joinTrendGroup } from './trendGroup';
import { zoomAround } from './trendKeyboard';
import { describeTrend, prepareTrend } from './trendModel';
import { buildTrendOption, yZoomAxes } from './trendOption';
import { SAMPLE_ABOVE } from './trendSeries';
import { TrendPlot } from './TrendPlot';
import { TrendValueTable } from './TrendValueTable';
import type { TrendPanelProps, TrendState } from './trendTypes';
import { useTrendCursor } from './useTrendCursor';
import './trend.css';

const READY: TrendState = { kind: 'ready' };

/** A state that replaces the chart. Its text is plain and labelled, and the header stays around it. */
const StateText: React.FC<{ state: Exclude<TrendState, { kind: 'ready' | 'stale' }>; height: number }> = ({ state, height }) => {
  const words = {
    loading: { title: 'Loading', text: state.message ?? 'Fetching the trend for this window.' },
    empty: { title: 'No samples', text: state.message ?? 'Nothing was recorded in this window.' },
    error: { title: 'Could not load the trend', text: state.message ?? 'The service did not respond.' },
  }[state.kind];
  return (
    <div className={`trend__state trend__state--${state.kind}`} style={{ minHeight: height }}
      role={state.kind === 'error' ? 'alert' : 'status'} aria-busy={state.kind === 'loading'} data-testid={`trend-${state.kind}`}>
      <p className="trend__state-title">{words.title}</p>
      <p className="trend__note">{words.text}</p>
      {state.kind !== 'loading' && state.action && <div className="trend__state-action">{state.action}</div>}
    </div>
  );
};

export const TrendPanel: React.FC<TrendPanelProps> = ({
  heading, headingLevel = 2, zone, panes, lanes, plotWindow, x, gapStepMs, noSample, marks, scale, source, aggregation,
  state = READY, context, toolbar, compact, group, selectedBandId, onSelectBand, cursorAt, onCursorChange,
}) => {
  const id = useId();
  const model = useMemo(() => prepareTrend({ panes, lanes, plotWindow, x, gapStepMs, noSample }), [panes, lanes, plotWindow, x, gapStepMs, noSample]);
  const hasY = yZoomAxes(model).length > 0;
  const box = useBoxZoom({ hasY });
  const theme = useChartTheme();
  const [chart, setChart] = useState<ECharts | null>(null);
  const [tableOpen, setTableOpen] = useState(false);

  const { domain } = model;
  const zoomX = box.zoom.x;
  const plotted = useMemo(() => (domain ? windowOf(domain, zoomX) : null), [domain, zoomX]);
  const format = useMemo(() => xFormat(model.x, zone), [model.x, zone]);
  const plottedText = plotted ? `Plotted: ${format.span(plotted)}` : 'Plotted: nothing';
  const description = useMemo(() => describeTrend(model, heading, plottedText), [model, heading, plottedText]);

  const cursor = useTrendCursor({ model, plotted, zone, cursorAt, onCursorChange, selectedBandId, onSelectBand });

  const option = useMemo(
    () => buildTrendOption({ model, zone, palette: chartPalette(), plotted, zoom: box.zoom, description, marks, scale, selectedBandId }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- theme is a recompute trigger: the palette is read from CSS variables that change with it.
    [model, zone, plotted, box.zoom, description, marks, scale, selectedBandId, theme],
  );
  useKeepSelecting(box, option);

  useEffect(() => {
    if (!chart || !group) return;
    return joinTrendGroup(chart, group);
  }, [chart, group]);

  const { onChartReady } = box;
  const onChart = useCallback((instance: ECharts) => {
    setChart(instance);
    onChartReady(instance);
  }, [onChartReady]);

  // Through the chart, so the zoom lands in the same history as a dragged rectangle and Undo reverts it.
  const zoomIn = () => {
    if (!chart || !domain) return;
    chart.dispatchAction({ type: 'dataZoom', batch: zoomBatch(zoomAround(box.zoom, domain, cursor.at), hasY) });
  };

  const showsChart = (state.kind === 'ready' || state.kind === 'stale') && model.hasData;
  const replacement = state.kind === 'ready' || state.kind === 'stale' ? { kind: 'empty' as const } : state;
  const Heading = `h${headingLevel}` as 'h2';

  return (
    <section className={`trend${compact ? ' trend--compact' : ''}`} aria-labelledby={`${id}-heading`}>
      <header className="trend__head">
        <div className="trend__titles">
          <Heading id={`${id}-heading`} className="trend__title">{heading}</Heading>
          {context && <div className="trend__context">{context}</div>}
        </div>
        <div className="trend__tools" role="group" aria-label={`${heading} controls`}>
          {toolbar}
          {showsChart && (
            <>
              {!compact && (
                <>
                  <ObcButton variant="flat" onClick={zoomIn}>Zoom in</ObcButton>
                  <ObcButton variant={box.selecting ? 'normal' : 'flat'} onClick={() => box.toggleSelect()}>
                    {box.selecting ? 'Zoom area: on' : 'Zoom area'}
                  </ObcButton>
                  <ObcButton variant="flat" disabled={!box.canUndo} onClick={box.undo}>Undo zoom</ObcButton>
                  <ObcButton variant="flat" disabled={!box.zoomed} onClick={box.reset}>Reset</ObcButton>
                </>
              )}
              <ObcButton variant={tableOpen ? 'normal' : 'flat'} onClick={() => setTableOpen(v => !v)}>
                {tableOpen ? 'Hide value table' : 'Show value table'}
              </ObcButton>
            </>
          )}
        </div>
      </header>

      {showsChart
        ? (
          <p className="trend__plotted">
            <span data-testid="trend-plotted">{plottedText}</span>
            <span className="trend__note">{box.zoomed ? 'Zoomed view' : 'Full window, nothing to undo'}</span>
          </p>
        )
        : plotWindow && <p className="trend__plotted">Requested: {windowText(plotWindow, zone)}</p>}

      {state.kind === 'stale' && (
        <p className="trend__stale" role="status">Stale since {siteStamp(state.since, zone)}{state.message ? `. ${state.message}` : ''}</p>
      )}

      {showsChart
        ? (
          <TrendPlot id={id} heading={heading} description={description} option={option} model={model} plotted={plotted}
            cursor={cursor} chart={chart} onChart={onChart} onDataZoom={box.onDataZoom} />
        )
        : <StateText state={replacement} height={model.layout.height} />}

      <p className="trend__source">
        Source: {source} · Aggregation: {aggregation}
        {showsChart && model.maxRows > SAMPLE_ABOVE ? ' · Drawn with shape-preserving sampling; the value table lists every point' : ''}
      </p>
      <p className="trend__sr" aria-live="polite" data-testid="trend-live">{cursor.announcement}</p>

      {showsChart && tableOpen && plotted && (
        <TrendValueTable id={`${id}-table`} model={model} plotted={plotted} zone={zone} cursor={cursor.at} plottedText={plottedText} />
      )}
    </section>
  );
};
