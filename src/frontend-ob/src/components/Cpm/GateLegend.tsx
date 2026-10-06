/**
 * SME review #16 (CHG-052): the key to the gate marks, shown once under every gate strip and above the
 * Performance matrix — so a symbol never has to be guessed or a gate opened to learn what it means.
 */
import React from 'react';
import { GATE_LEGEND } from './gateStatus';

export const GateLegend: React.FC<{ className?: string }> = ({ className }) => (
  <p className={`cpm-gate-legend${className ? ` ${className}` : ''}`} aria-label="Gate symbols">
    {GATE_LEGEND.map(l => (
      <span key={l.text} className="cpm-gate-legend__item">
        <span className={`cpm-gate-legend__glyph cpm-matrix__cell--${l.tone}`} aria-hidden data-mark={l.meaning}>{l.glyph}</span>
        {l.text}
      </span>
    ))}
  </p>
);

export default GateLegend;
