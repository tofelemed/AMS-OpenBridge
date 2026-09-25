'use client';

/**
 * The operator's zoom controls for a trend: Zoom area (drag a rectangle), Undo
 * and Reset — OpenBridge buttons, so ECharts' own toolbox icons stay off-canvas.
 * Disabled with a reason when there is nothing to zoom; a live chart says that
 * it is holding its viewport while zoomed.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { BoxZoom } from './useBoxZoom';

export interface ChartZoomBarProps {
  box: BoxZoom;
  /** False when the chart has no plottable data (the buttons say why). */
  hasData?: boolean;
  /** A rolling / polling chart: state that the viewport is held while zoomed. */
  live?: boolean;
  /** Extra controls rendered after the zoom buttons (e.g. Historical's Apply). */
  children?: React.ReactNode;
}

export const ChartZoomBar: React.FC<ChartZoomBarProps> = ({ box, hasData = true, live = false, children }) => (
  <div className="chart-zoombar" role="group" aria-label="Chart zoom">
    <ObcButton variant={box.selecting ? 'normal' : 'flat'} disabled={!hasData}
      aria-pressed={box.selecting}
      title={!hasData ? 'Nothing is plotted yet' : box.selecting ? 'Drag a rectangle on the chart to zoom into it; Escape leaves this mode' : 'Zoom into a dragged rectangle'}
      onClick={() => box.toggleSelect()}>
      {box.selecting ? 'Zoom area · on' : 'Zoom area'}
    </ObcButton>
    <ObcButton variant="flat" disabled={!box.canUndo} title={box.canUndo ? 'Back to the previous zoom' : 'No earlier zoom'}
      onClick={box.undo}>
      Undo
    </ObcButton>
    <ObcButton variant="flat" disabled={!box.zoomed} title={box.zoomed ? 'Show the whole loaded range again' : 'The whole loaded range is shown'}
      onClick={box.reset}>
      Reset
    </ObcButton>
    {live && box.zoomed && <span className="chart-zoombar__note">live · viewport held while zoomed, Reset to follow</span>}
    {children}
  </div>
);

export default ChartZoomBar;
