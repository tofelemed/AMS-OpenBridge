/**
 * v2.5 workbench (audit F15): the gates of the selected window as ONE row of status chips, grouped
 * by tier, in the Performance matrix's own vocabulary (✓ pass · ! attention · × failed · — not
 * evaluated). Every chip is a selector - click, or arrow keys over one roving tab stop, Enter to
 * open - so the verdict is read from all seventeen at once and the left column is gone.
 */
import React, { useEffect, useRef, useState } from 'react';
import type { GateCatalogue } from '../../../api/cpm/catalogue';
import { buildTierGroups, glyphFor, type GateGlyph } from '../gateStatus';
import { GATE_ORDER } from './gateFacts';
import { GateLegend } from '../GateLegend';
import { phrase } from '../vocabulary';

export interface GateChip {
  gate: string;
  name: string;
  role: string;
  status: string | null;
  reason: string | null;
  /** The run to open; null when this tier carries no run for the gate (chip disabled). */
  methodRunId: string | null;
  glyph: GateGlyph;
}

const payloadKey = (gate: string, suffix: 'status' | 'reason') => `gate${gate.replace(/^G/, '').toLowerCase()}_${suffix}`;

/** Status and reason per gate: the fused row's cells when present, else the tier payload's gateN_status. */
export function chipsOf(i: {
  siblings: Record<string, string>;
  cells: Array<{ key: string; status: string | null; reason: string | null }> | undefined;
  result: Record<string, unknown> | null;
  catalogue: GateCatalogue | undefined;
  /** CHG-064: the window's effective input flags. */
  inputFlags?: string[];
}): GateChip[] {
  const byKey = new Map((i.cells ?? []).map(c => [c.key, c]));
  return GATE_ORDER.map(gate => {
    const cell = byKey.get(gate);
    const fromPayload = (s: 'status' | 'reason') => { const v = i.result?.[payloadKey(gate, s)]; return typeof v === 'string' && v ? v : null; };
    const status = cell ? (cell.status ?? null) : fromPayload('status');
    const reason = cell ? (cell.reason ?? null) : fromPayload('reason');
    const entry = i.catalogue?.gates.find(g => g.gate === gate);
    return { gate, name: entry?.name ?? gate, role: entry?.role ?? '', status, reason, methodRunId: i.siblings[gate] ?? null, glyph: glyphFor(status, gate, i.inputFlags) };
  });
}

export interface GateChipStripProps {
  chips: GateChip[];
  selected: string;
  onOpen: (gate: string, methodRunId: string) => void;
}

const NAV_KEYS = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];

export const GateChipStrip: React.FC<GateChipStripProps> = ({ chips, selected, onOpen }) => {
  const groups = buildTierGroups(chips.map(c => c.gate));
  const byGate = new Map(chips.map(c => [c.gate, c]));
  const enabled = chips.filter(c => c.methodRunId).map(c => c.gate);
  const [cursor, setCursor] = useState<string>(selected);
  const movedByKey = useRef(false);
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => { setCursor(selected); }, [selected]);
  useEffect(() => {
    if (!movedByKey.current) return;
    movedByKey.current = false;
    rootRef.current?.querySelector<HTMLElement>(`[data-gate="${cursor}"]`)?.focus();
  }, [cursor]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (!NAV_KEYS.includes(e.key) || enabled.length === 0) return;
    e.preventDefault();
    movedByKey.current = true;
    setCursor(cur => {
      const at = Math.max(0, enabled.indexOf(cur));
      if (e.key === 'ArrowLeft') return enabled[Math.max(0, at - 1)];
      if (e.key === 'ArrowRight') return enabled[Math.min(enabled.length - 1, at + 1)];
      if (e.key === 'Home') return enabled[0];
      return enabled[enabled.length - 1];
    });
  };

  return (
    <>
      <nav ref={rootRef} className="cpm-gate-strip" aria-label="Gates of this window" onKeyDown={onKeyDown}>
        {groups.map(g => (
          <div key={g.label} className="cpm-gate-strip__tier" role="group" aria-label={g.label}>
            <span className="cpm-gate-strip__tier-label">{g.label}</span>
            <div className="cpm-gate-strip__chips">
              {g.keys.map(key => {
                const c = byGate.get(key)!;
                const isSelected = c.gate === selected;
                const title = c.methodRunId
                  ? `${c.name} — ${c.status ?? 'no status'}${c.reason ? ` · ${c.reason}` : ''}`
                  : `${c.name} — no run on this tier for ${c.gate}`;
                return (
                  <button
                    key={c.gate}
                    type="button"
                    className={`cpm-gate-chip cpm-matrix__cell--${c.glyph.tone}${isSelected ? ' cpm-gate-chip--selected' : ''}`}
                    data-gate={c.gate}
                    aria-current={isSelected ? 'true' : undefined}
                    aria-label={`${c.gate} ${c.name}: ${c.glyph.label}${c.reason ? `, ${phrase(c.reason)}` : ''}`}
                    title={title}
                    disabled={!c.methodRunId}
                    tabIndex={c.gate === cursor ? 0 : -1}
                    onFocus={() => setCursor(c.gate)}
                    onClick={() => { if (c.methodRunId) onOpen(c.gate, c.methodRunId); }}
                  >
                    <span className="cpm-gate-chip__glyph" aria-hidden data-mark={c.glyph.meaning}>{c.glyph.glyph}</span>
                    <span className="cpm-mono">{c.gate}</span>
                    <span className="cpm-gate-chip__word" aria-hidden>{c.glyph.word}</span>
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
