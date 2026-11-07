/**
 * Task 15: the Evidence Workbench's left rail. All seventeen gates of the selected window, by tier, each with its code, name
 * and mark (gateMark, through chipsOf), in place of the gate dropdown. One roving tab stop: Up and Down move, Home and End
 * jump, Enter or a click opens; a gate with no run on this tier is disabled and says so. Below 850 px the rail is a native
 * select with the same groups (CSS swaps them; both are in the page). The Key opens in a dialog.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../../ui/Dialog';
import { GateLegend } from '../GateLegend';
import { buildTierGroups } from '../gateStatus';
import { phrase } from '../vocabulary';
import type { GateChip } from './GateChipStrip';

export interface GateRailProps {
  chips: GateChip[];
  selected: string;
  onSelect: (gate: string) => void;
}

const NAV_KEYS = ['ArrowUp', 'ArrowDown', 'Home', 'End'];

export const GateRail: React.FC<GateRailProps> = ({ chips, selected, onSelect }) => {
  const groups = buildTierGroups(chips.map(c => c.gate));
  const byGate = new Map(chips.map(c => [c.gate, c]));
  const enabled = chips.filter(c => c.methodRunId).map(c => c.gate);
  const [cursor, setCursor] = useState<string>(selected);
  const [keyOpen, setKeyOpen] = useState(false);
  const movedByKey = useRef(false);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => { setCursor(selected); }, [selected]);
  useEffect(() => {
    if (!movedByKey.current) return;
    movedByKey.current = false;
    navRef.current?.querySelector<HTMLElement>(`[data-gate="${cursor}"]`)?.focus();
  }, [cursor]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (!NAV_KEYS.includes(e.key) || enabled.length === 0) return;
    e.preventDefault();
    movedByKey.current = true;
    setCursor(cur => {
      const at = Math.max(0, enabled.indexOf(cur));
      if (e.key === 'ArrowUp') return enabled[Math.max(0, at - 1)];
      if (e.key === 'ArrowDown') return enabled[Math.min(enabled.length - 1, at + 1)];
      return e.key === 'Home' ? enabled[0] : enabled[enabled.length - 1];
    });
  };

  return (
    <div className="cpm-rail">
      <nav ref={navRef} className="cpm-rail__list" aria-label="Gates of this window" onKeyDown={onKeyDown}>
        {groups.map(g => (
          <div key={g.label} className="cpm-rail__tier" role="group" aria-label={g.label}>
            <span className="cpm-rail__tier-label">{g.label}</span>
            {g.keys.map(key => {
              const c = byGate.get(key)!;
              const isSelected = c.gate === selected;
              return (
                <button
                  key={c.gate}
                  type="button"
                  className={`cpm-rail__gate cpm-matrix__cell--${c.glyph.tone}${isSelected ? ' cpm-rail__gate--selected' : ''}`}
                  data-gate={c.gate}
                  aria-current={isSelected ? 'true' : undefined}
                  aria-label={`${c.gate} ${c.glyph.word}: ${c.name}, ${c.glyph.label}${c.reason ? `, ${phrase(c.reason)}` : ''}`}
                  title={c.methodRunId ? `${c.name} — ${c.glyph.word}${c.reason ? ` · ${phrase(c.reason)}` : ''}` : `${c.name} — no run on this tier for ${c.gate}`}
                  disabled={!c.methodRunId}
                  tabIndex={c.gate === cursor ? 0 : -1}
                  onFocus={() => setCursor(c.gate)}
                  onClick={() => { if (c.methodRunId) onSelect(c.gate); }}
                >
                  <span className="cpm-rail__mark" aria-hidden data-mark={c.glyph.meaning}>{c.glyph.glyph}</span>
                  <span className="cpm-mono cpm-rail__code">{c.gate}</span>
                  <span className="cpm-rail__name">{c.name}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <select className="cpm-select cpm-rail__picker" aria-label="Gate" value={selected} onChange={e => onSelect(e.target.value)}>
        {groups.map(g => (
          <optgroup key={g.label} label={g.label}>
            {g.keys.map(key => {
              const c = byGate.get(key)!;
              return <option key={c.gate} value={c.gate} disabled={!c.methodRunId}>{`${c.glyph.glyph} ${c.gate} ${c.name}`}</option>;
            })}
          </optgroup>
        ))}
      </select>

      <ObcButton variant="flat" onClick={() => setKeyOpen(true)}>Key</ObcButton>
      <Dialog open={keyOpen} onClose={() => setKeyOpen(false)} title="Gate status key"><GateLegend /></Dialog>
    </div>
  );
};

export default GateRail;
