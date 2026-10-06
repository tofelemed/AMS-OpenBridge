'use client';

/**
 * Explorer › Summary: the gates of the loop's latest fused window as one row of
 * status chips grouped by tier — the Workbench strip's vocabulary and CSS
 * (✓ pass · ! attention · × failed · — not evaluated), fed from the cached
 * gates/latest row the workspace already holds, so it costs no request.
 *
 * Unlike the Workbench strip a chip needs no run identity to be selectable:
 * selecting shows the served cell (status, reason, window); the evidence below
 * is fetched only then, and only when the row carries a run id.
 */
import React, { useEffect, useRef, useState } from 'react';
import type { CpmGateCell } from '../../../../api/cpm/gates';
import { buildTierGroups, glyphFor } from '../../gateStatus';
import { codeLabel, phrase } from '../../vocabulary';
import { GateLegend } from '../../GateLegend';

export interface SummaryGateStripProps {
  cells: CpmGateCell[];
  selected: string | null;
  onSelect: (gate: string) => void;
  /** CHG-064: the window's effective input flags — a pass without one of its inputs reads "OK on available data". */
  inputFlags?: string[];
}

const NAV_KEYS = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];

export const SummaryGateStrip: React.FC<SummaryGateStripProps> = ({ cells, selected, onSelect, inputFlags }) => {
  const byKey = new Map(cells.map(c => [c.key, c]));
  const groups = buildTierGroups(cells.map(c => c.key));
  const order = groups.flatMap(g => g.keys);
  // One roving tab stop; arrows walk the gates in tier order.
  const [cursor, setCursor] = useState<string>(selected ?? order[0] ?? '');
  const movedByKey = useRef(false);
  const rootRef = useRef<HTMLElement>(null);

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
    <>
      <nav ref={rootRef} className="cpm-gate-strip" aria-label="Gates of the latest fused window" onKeyDown={onKeyDown}>
        {groups.map(g => (
          <div key={g.label} className="cpm-gate-strip__tier" role="group" aria-label={g.label}>
            <span className="cpm-gate-strip__tier-label">{g.label}</span>
            <div className="cpm-gate-strip__chips">
              {g.keys.map(key => {
                const c = byKey.get(key)!;
                const glyph = glyphFor(c.status, key, inputFlags);
                const isSelected = key === selected;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`cpm-gate-chip cpm-matrix__cell--${glyph.tone}${isSelected ? ' cpm-gate-chip--selected' : ''}`}
                    data-gate={key}
                    aria-pressed={isSelected}
                    aria-label={`${key} ${c.name}: ${glyph.label}${c.reason ? `, ${phrase(c.reason)}` : ''}`}
                    title={`${c.name} — ${codeLabel(c.status)}${c.reason ? ` · ${codeLabel(c.reason)}` : ''}`}
                    tabIndex={key === cursor ? 0 : -1}
                    onFocus={() => setCursor(key)}
                    onClick={() => onSelect(key)}
                  >
                    <span className="cpm-gate-chip__glyph" aria-hidden data-mark={glyph.meaning}>{glyph.glyph}</span>
                    <span className="cpm-mono">{key}</span>
                    <span className="cpm-gate-chip__word" aria-hidden>{glyph.word}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <GateLegend />
    </>
  );
};

export default SummaryGateStrip;
