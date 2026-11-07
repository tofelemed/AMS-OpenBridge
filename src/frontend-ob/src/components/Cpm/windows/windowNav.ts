/**
 * Window Inspector navigation. Rows arrive newest first. The selected window is identified by its `window_end`
 * (the `?window=` URL parameter). The newest loaded row is selected only when none is named. A named window that is not
 * among the rows (not loaded yet, or hidden by the filter) selects nothing: the URL never names one window while the
 * panel shows another.
 */
import type { CpmKpiRow } from '../../../api/cpmApi';
import { historicalHref, replayHref } from '../cpaHref';
import { workbenchHref } from '../evidence/selection';
import { runIdOf } from './windowMath';

export interface WindowView {
  selected: CpmKpiRow;
  /** Position among the loaded rows (0 = newest). */
  index: number;
  /** The next-newer loaded window, or null at the newest. */
  newer: CpmKpiRow | null;
  /** The next-older loaded window, or null at the oldest loaded. */
  older: CpmKpiRow | null;
}

export function resolveWindowView(rows: CpmKpiRow[], selectedEnd: string | null): WindowView | null {
  if (rows.length === 0) return null;
  const index = selectedEnd ? rows.findIndex(r => r.window_end === selectedEnd) : 0;
  if (index < 0) return null;
  return {
    selected: rows[index],
    index,
    newer: index > 0 ? rows[index - 1] : null,
    older: index < rows.length - 1 ? rows[index + 1] : null,
  };
}

export interface WindowRef {
  runId?: string | null;
  gate?: string | null;
  windowStart?: string | null;
  windowEnd?: string | null;
}

/** A served row as the target needs it. */
export const windowRef = (row: CpmKpiRow): WindowRef => ({
  ...(runIdOf(row) ?? { runId: null, gate: null }),
  windowStart: row.window_start,
  windowEnd: row.window_end,
});

const REPLAYED = new Set(['12h', '24h']);

/**
 * Where "Inspect this window" goes. 12h and 24h are fused windows Replay reads. Any other window runs in the
 * Workbench under its own run, never in Replay; with no run to open (written before v2.5) its period opens in Historical.
 */
export function inspectTarget(row: WindowRef, loop: string, kind: string): string {
  if (REPLAYED.has(kind)) return replayHref(loop, { window: row.windowEnd, kind });
  if (row.runId) return workbenchHref(loop, row.runId, row.gate ?? 'G15');
  return historicalHref(loop, { from: row.windowStart, to: row.windowEnd, window: row.windowEnd });
}
