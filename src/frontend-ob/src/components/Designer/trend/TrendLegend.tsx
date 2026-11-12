'use client';

/**
 * The trend legend (split out of TrendCore): pen name + value-at-cursor + unit
 * (PI Vision reads the cursor, not just the last point); click hides / shows a
 * trace (E1.17). Test ids are load-bearing for the E2E scripts.
 */
import React from 'react';
import type { Pen } from './trendSupport';

export const TrendLegend: React.FC<{
  pens: Pen[];
  hiddenPens: Set<string>;
  penColor: (i: number) => string;
  valueAt: (i: number) => number | undefined;
  onToggle: (path: string) => void;
  onRemovePen?: (path: string) => void;
  /** Shown with no pens. */
  emptyText?: string;
  /**
   * CHG-176: drawn after the value of a pen whose binding is not trusted (the ad-hoc dialog's NE107 badge; on a display
   * the symbol's own badge marks it). The pen's tooltip names the reason either way.
   */
  penMark?: (reason: string) => React.ReactNode;
}> = ({ pens, hiddenPens, penColor, valueAt, onToggle, onRemovePen, emptyText = 'No tags selected', penMark }) => (
  <div className="trend-core__legend" data-testid="trend-legend">
    {pens.map((pen, i) => {
      const v = valueAt(i);
      const isHidden = hiddenPens.has(pen.path);
      return (
        <div
          key={pen.path}
          className="trend-core__pen"
          data-pen={pen.path}
          data-hidden={isHidden || undefined}
          title={`${pen.path} — click to ${isHidden ? 'show' : 'hide'}${pen.trustReason ? ` · ${pen.trustReason}` : ''}`}
          onClick={() => onToggle(pen.path)}
          style={{ cursor: 'pointer', opacity: isHidden ? 0.4 : 1 }}
        >
          <span className="trend-core__swatch" style={{ background: penColor(i) }} />
          <span className="trend-core__pen-label" style={isHidden ? { textDecoration: 'line-through' } : undefined}>{pen.label}</span>
          <span className="trend-core__pen-value" data-testid="pen-value">
            {v === undefined ? '--' : v.toFixed(2)}
          </span>
          {penMark && pen.trustReason && penMark(pen.trustReason)}
          <span className="trend-core__pen-unit">{pen.unit}</span>
          {onRemovePen && (
            <button className="trend-core__pen-x" onClick={(e) => { e.stopPropagation(); onRemovePen(pen.path); }} title="Remove pen">×</button>
          )}
        </div>
      );
    })}
    {pens.length === 0 && emptyText && <div className="trend-core__pen-empty">{emptyText}</div>}
  </div>
);

export default TrendLegend;
