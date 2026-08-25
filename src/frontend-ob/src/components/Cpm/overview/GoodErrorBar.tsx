'use client';

/**
 * Compact good-error micro-bar for a priority-queue row.
 */
import React from 'react';


export const GoodErrorBar: React.FC<{ pct: number | null; mae: number | null }> = ({ pct, mae }) => {
  if (pct == null && mae == null) return null;
  if (pct == null) {
    return <div className="cpm-event-row__sub" style={{ fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>MAE {mae!.toFixed(2)}</div>;
  }
  // goodErrorPct is a 0..1 FRACTION despite the name (see CpmRankedLoop.metrics).
  // This component consumed it as if it were already 0..100, so a healthy loop at
  // 0.88 drew a 0.88%-wide bar labelled "good 1%" — and since the thresholds
  // below are 80/50, EVERY loop in the priority queue rendered red.
  const scaled = pct * 100;
  const clamped = Math.max(0, Math.min(100, scaled));
  // Tone via a class, not an inline token string: the thresholds are the same
  // good/warn/bad vocabulary every other CPM surface uses, and the inline
  // version was one of the places still naming tokens by hand.
  const tone = scaled >= 80 ? 'good' : scaled >= 50 ? 'warn' : 'bad';
  return (
    <div className="cpm-goodbar"
      title={`Good-error ${scaled.toFixed(0)}%${mae != null ? ` · MAE ${mae.toFixed(2)}` : ''}`}>
      <span className="cpm-goodbar__track">
        <span className={`cpm-goodbar__fill cpm-goodbar__fill--${tone}`}
          style={{ width: `${clamped}%` }} />
      </span>
      <span className="cpm-event-row__sub cpm-goodbar__value">good {scaled.toFixed(0)}%</span>
    </div>
  );
};

export default GoodErrorBar;
