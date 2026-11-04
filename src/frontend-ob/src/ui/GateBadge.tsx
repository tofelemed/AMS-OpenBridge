/**
 * The gate mark on new pages. Symbol, word and spoken label all come from `gateMark` in
 * components/Cpm/gateStatus.ts, the SME-reviewed vocabulary (CHG-052, CHG-064, CHG-098): one symbol
 * per meaning, the same on every surface. Never write a gate glyph anywhere else.
 */
import React from 'react';
import { GATE_LEGEND, gateMark, type GateGlyph, type GateMeaning } from '../components/Cpm/gateStatus';
import { StatusBadge } from './StatusBadge';
import type { BadgeTone } from './statusTones';

/**
 * The old tone names mapped to status roles. A passed check is neutral: it is a computed check, not
 * a recorded outcome (CD8). A confirmed condition is warning, pending control engineering (CD8).
 */
export function gateBadgeTone(meaning: GateMeaning, tone: GateGlyph['tone']): BadgeTone {
  if (meaning === 'confirmed') return 'warning';
  if (tone === 'bad') return 'danger';
  if (tone === 'warn') return 'warning';
  return tone === 'good' ? 'neutral' : 'unknown';
}

export const GateBadge: React.FC<{
  status: string | null | undefined;
  /** The gate key. A pass means "not seen" on a diagnostic gate, so always give it when known. */
  gate?: string | null;
  inputFlags?: readonly string[] | null;
}> = ({ status, gate, inputFlags }) => {
  const mark = gateMark(status, gate, inputFlags);
  return (
    <StatusBadge tone={gateBadgeTone(mark.meaning, mark.tone)} glyph={mark.glyph}>
      <span className="ui-sr">{mark.label}: </span>
      <span aria-hidden="true">{mark.word}</span>
    </StatusBadge>
  );
};

/** The key to the marks: every symbol, grouped, from the same vocabulary. */
export const GateKey: React.FC = () => {
  const groups = [...new Set(GATE_LEGEND.map(l => l.group))];
  return (
    <div className="ui-gate-key" role="note" aria-label="Gate symbols">
      {groups.map(group => (
        <span key={group} className="ui-gate-key__group">
          <span className="ui-gate-key__name">{group}</span>
          {GATE_LEGEND.filter(l => l.group === group).map(l => (
            <StatusBadge key={l.meaning} tone={gateBadgeTone(l.meaning, l.tone)} glyph={l.glyph}>{l.text}</StatusBadge>
          ))}
        </span>
      ))}
    </div>
  );
};
