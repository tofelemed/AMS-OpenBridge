/**
 * v2.5 workbench (audit F15): the gates of the selected window as chips - status, reason and the run to open per gate, in
 * the Performance matrix's own vocabulary (gateMark). Task 15: GateRail draws them (the strip and the GateMenu dropdown
 * are gone); this file keeps the model.
 */
import type { GateCatalogue } from '../../../api/cpm/catalogue';
import { glyphFor, type GateGlyph } from '../gateStatus';
import { GATE_ORDER } from './gateFacts';

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
