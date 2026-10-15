/**
 * SME review #16 (CHG-052): the key to the gate marks, shown once under every gate strip and above the
 * Performance matrix — so a symbol never has to be guessed or a gate opened to learn what it means.
 * CHG-098 (SME review 2 #24): grouped — checks, window, symptoms, result, no result — so a failed check, symptom
 * evidence, an exclusion and "no evaluation" are told apart by group and word as well as by symbol.
 */
import React from 'react';
import { GATE_LEGEND } from './gateStatus';

const GROUPS = [...new Set(GATE_LEGEND.map(l => l.group))];

export const GateLegend: React.FC<{ className?: string }> = ({ className }) => (
  <div className={`cpm-gate-legend${className ? ` ${className}` : ''}`} role="note" aria-label="Gate symbols">
    {GROUPS.map(group => (
      <span key={group} className="cpm-gate-legend__group">
        <span className="cpm-gate-legend__group-label">{group}</span>
        {GATE_LEGEND.filter(l => l.group === group).map(l => (
          <span key={l.meaning} className="cpm-gate-legend__item">
            <span className={`cpm-gate-legend__glyph cpm-matrix__cell--${l.tone}`} aria-hidden data-mark={l.meaning}>{l.glyph}</span>
            {l.text}
          </span>
        ))}
      </span>
    ))}
  </div>
);

export default GateLegend;
