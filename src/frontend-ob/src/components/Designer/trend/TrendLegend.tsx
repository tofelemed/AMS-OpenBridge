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
}> = ({ pens, hiddenPens, penColor, valueAt, onToggle, onRemovePen }) => (
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
          title={`${pen.path} — click to ${isHidden ? 'show' : 'hide'}`}
          onClick={() => onToggle(pen.path)}
          style={{ cursor: 'pointer', opacity: isHidden ? 0.4 : 1 }}
        >
          <span className="trend-core__swatch" style={{ background: penColor(i) }} />
          <span className="trend-core__pen-label" style={isHidden ? { textDecoration: 'line-through' } : undefined}>{pen.label}</span>
          <span className="trend-core__pen-value" data-testid="pen-value">
            {v === undefined ? '--' : v.toFixed(2)}
          </span>
          <span className="trend-core__pen-unit">{pen.unit}</span>
          {onRemovePen && (
            <button className="trend-core__pen-x" onClick={(e) => { e.stopPropagation(); onRemovePen(pen.path); }} title="Remove pen">×</button>
          )}
        </div>
      );
    })}
    {pens.length === 0 && <div className="trend-core__pen-empty">No tags selected</div>}
  </div>
);

export default TrendLegend;
