/**
 * CHG-170 (owner answer 3b): the verification's default loop is the loop with the newest verdict in the ranking the page already
 * reads (12 h windows, the server's 200 most confident, which holds every loop with a verdict before those without). A verdict
 * is a row the engine judged: not NOT_EVALUATED, INSUFFICIENT_DATA or PENDING (the same rule as the ranking's own "real verdict").
 */
import type { CpmRankedLoop } from '../../../api/cpmApi';

const NO_VERDICT = new Set(['NOT_EVALUATED', 'INSUFFICIENT_DATA', 'PENDING', '']);

export function newestVerdictLoop(loops: CpmRankedLoop[]): string | undefined {
  let best: { id: string; at: number } | undefined;
  for (const l of loops) {
    if (!l.windowEnd || NO_VERDICT.has((l.diagnosis ?? '').toUpperCase())) continue;
    const at = Date.parse(l.windowEnd);
    if (Number.isNaN(at)) continue;
    if (!best || at > best.at) best = { id: l.loopId, at };
  }
  return best?.id;
}

/** The newest window end in the same ranking (ms): the tile's read before CHG-170, kept for a cplm-api without `newestResultAt`. */
export function rankedNewestEnd(loops: CpmRankedLoop[]): number | null {
  const ends = loops.map(l => (l.windowEnd ? Date.parse(l.windowEnd) : NaN)).filter(t => !Number.isNaN(t));
  return ends.length ? Math.max(...ends) : null;
}
