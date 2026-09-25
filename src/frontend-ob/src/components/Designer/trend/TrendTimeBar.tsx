'use client';

/**
 * The trend time bar (split out of TrendCore): range presets, step back /
 * pause / step forward / Now, the window clocks and the LIVE · PAUSED ·
 * HISTORICAL mode, plus the rectangle-zoom controls (Phase 5). Test ids are
 * load-bearing for the E2E scripts.
 */
import React from 'react';
import ChartZoomBar from '../../charts/ChartZoomBar';
import type { BoxZoom } from '../../charts/useBoxZoom';
import { RANGES } from './trendSupport';

export const TrendTimeBar: React.FC<{
  windowStart: number;
  windowEnd: number;
  fmtClock: (ms: number) => string;
  rangeMs: number;
  live: boolean;
  playing: boolean;
  onRange: (ms: number) => void;
  onStep: (dir: -1 | 1) => void;
  onTogglePlay: () => void;
  onNow: () => void;
  box: BoxZoom;
  hasData: boolean;
}> = ({ windowStart, windowEnd, fmtClock, rangeMs, live, playing, onRange, onStep, onTogglePlay, onNow, box, hasData }) => (
  <div className="trend-core__bar" data-testid="trend-timebar">
    <span className="trend-core__clock">{fmtClock(windowStart)}</span>
    {RANGES.map(r => (
      <button
        key={r.ms}
        className={`trend-core__rbtn ${rangeMs === r.ms ? 'active' : ''}`}
        data-testid={`range-${r.label}`}
        // A new range means a new window — an old zoom selection no longer means anything.
        onClick={() => onRange(r.ms)}
      >{r.label}</button>
    ))}
    <span className="trend-core__sep" />
    <button className="trend-core__rbtn" data-testid="trend-back" onClick={() => onStep(-1)} title="Step back">◀</button>
    <button className="trend-core__rbtn" data-testid="trend-play" onClick={onTogglePlay} title="Play/Pause" disabled={!live}>
      {playing && live ? '⏸' : '▶'}
    </button>
    <button className="trend-core__rbtn" data-testid="trend-fwd" onClick={() => onStep(1)} title="Step forward">▶▶</button>
    <button
      className={`trend-core__rbtn trend-core__now ${live ? 'active' : ''}`}
      data-testid="trend-now"
      onClick={onNow}
      title="Jump to live"
    >Now</button>
    <span className="trend-core__clock" data-testid="trend-end">{fmtClock(windowEnd)}</span>
    <ChartZoomBar box={box} hasData={hasData} live={live && playing} />
    <span className="trend-core__mode" data-testid="trend-mode">
      {live ? (playing ? 'LIVE' : 'PAUSED') : 'HISTORICAL'}
    </span>
  </div>
);

export default TrendTimeBar;
