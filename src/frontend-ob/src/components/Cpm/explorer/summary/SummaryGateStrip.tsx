'use client';

/**
 * Explorer › Summary › Gate results: the gates of the latest fused window as tiles under their tier, from the cached
 * gates/latest row the workspace already holds, so it costs no request. A tile is the mark over the key; the word is in
 * the spoken label and the gate's dialog. The key to the marks is behind Gate key in the panel head (CHG-158).
 * Marks and words come only from `gateMark`.
 *
 * A tile needs no run identity to be selectable: selecting opens the gate's dialog with the served cell. One roving
 * tab stop; the arrow keys walk the gates in tier order.
 */
import React, { useEffect, useRef, useState } from 'react';
import type { CpmGateCell } from '../../../../api/cpm/gates';
import GateTierRow from '../../blocks/GateTierRow';
import { buildTierGroups, gateMark, gateName } from '../../gateStatus';

export interface SummaryGateStripProps {
  cells: CpmGateCell[];
  selected: string | null;
  onSelect: (gate: string) => void;
  /** CHG-064: the window's effective input flags — a pass without one of its inputs reads "Pass on available data". */
  inputFlags?: string[];
}

const NAV_KEYS = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];

export const SummaryGateStrip: React.FC<SummaryGateStripProps> = ({ cells, selected, onSelect, inputFlags }) => {
  const byKey = new Map(cells.map(c => [c.key, c]));
  const keys = cells.map(c => c.key);
  const order = buildTierGroups(keys).flatMap(g => g.keys);
  const [cursor, setCursor] = useState<string>(selected ?? order[0] ?? '');
  const movedByKey = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (selected) setCursor(selected); }, [selected]);
  useEffect(() => {
    if (!movedByKey.current) return;
    movedByKey.current = false;
    rootRef.current?.querySelector<HTMLElement>(`[data-gate="${cursor}"]`)?.focus();
  }, [cursor]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (!NAV_KEYS.includes(e.key) || order.length === 0) return;
    e.preventDefault();
    movedByKey.current = true;
    setCursor(cur => {
      const at = Math.max(0, order.indexOf(cur));
      if (e.key === 'ArrowLeft') return order[Math.max(0, at - 1)];
      if (e.key === 'ArrowRight') return order[Math.min(order.length - 1, at + 1)];
      if (e.key === 'Home') return order[0];
      return order[order.length - 1];
    });
  };

  return (
    <div ref={rootRef} role="group" aria-label="Gates of the latest fused window" onKeyDown={onKeyDown}>
      <GateTierRow gates={keys} tile={key => {
        const c = byKey.get(key)!;
        const mark = gateMark(c.status, key, inputFlags);
        return (
          <button
            type="button"
            className={`cpm-gate-tile cpm-gate-tile--${mark.tone}${key === selected ? ' cpm-gate-tile--selected' : ''}`}
            data-gate={key}
            data-mark={mark.meaning}
            aria-label={`${key} ${gateName(key)}: ${mark.word}`}
            title={`${gateName(key)} — ${mark.label}`}
            tabIndex={key === cursor ? 0 : -1}
            onFocus={() => setCursor(key)}
            onClick={() => onSelect(key)}
          >
            <span className="cpm-gate-tile__mark" aria-hidden>{mark.glyph}</span>
            <span className="cpm-mono" aria-hidden>{key}</span>
          </button>
        );
      }} />
    </div>
  );
};

export default SummaryGateStrip;
