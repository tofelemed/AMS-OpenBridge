/**
 * v2.5 Task 2E.3 (spec §3.2; NR-031): the workbench's selection is IMMUTABLE and lives in the URL.
 * It names the loop, the method run, the gate and the mode; nothing in it says "latest".
 */
export type SelectionMode = 'FIXED' | 'FROZEN' | 'REPLAY' | 'COMPARE';

export interface EvidenceSelection {
  loopId: string;
  methodRunId: string;
  gate: string;
  mode: SelectionMode;
}

const MODES: SelectionMode[] = ['FIXED', 'FROZEN', 'REPLAY', 'COMPARE'];

export function parseSelection(params: URLSearchParams): EvidenceSelection | null {
  const loopId = params.get('loop')?.trim();
  const methodRunId = params.get('methodRun')?.trim();
  const gate = params.get('gate')?.trim();
  if (!loopId || !methodRunId || !gate) return null;
  const modeRaw = (params.get('mode') ?? 'FIXED').toUpperCase();
  const mode = (MODES as string[]).includes(modeRaw) ? (modeRaw as SelectionMode) : 'FIXED';
  return { loopId, methodRunId, gate, mode };
}

export function selectionSearch(s: EvidenceSelection): string {
  const p = new URLSearchParams();
  p.set('loop', s.loopId);
  p.set('methodRun', s.methodRunId);
  p.set('gate', s.gate);
  p.set('mode', s.mode);
  return p.toString();
}

/** The workbench URL for a gate cell (the cell must carry its method run id; without one there is nothing immutable to open). */
export function workbenchHref(loopId: string, methodRunId: string, gate: string, mode: SelectionMode = 'FIXED'): string {
  return `/cpm/evidence?${selectionSearch({ loopId, methodRunId, gate, mode })}`;
}
