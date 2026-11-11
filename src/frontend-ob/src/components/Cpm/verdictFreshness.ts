/**
 * CHG-170 (owner answer 2): the age of the newest result, by the Overview's rule. GET fleet/kpis carries `newestResultAt`, the
 * newest result of the window kind across the scope (each loop's newest LIVE row, the row the Stale KPI judges); it is Stale
 * once older than `basis.freshSeconds` (60 min by default, KPI-LOGIC.md). Overview, Performance and Pipeline Health read it
 * here, so the three pages agree. Undefined when the answer has not arrived or predates the field (a cplm-api before CHG-170):
 * the caller then keeps its earlier read.
 */
import type { FleetKpis } from '../../api/cpm/fleetKpis';

export interface Freshness {
  /** The newest result's window end (ms), null when the scope has none. */
  at: number | null;
  ageMs: number | null;
  stale: boolean;
  /** The threshold: older than this is Stale. */
  freshMs: number;
}

export function fleetFreshness(k: (Pick<FleetKpis, 'newestResultAt'> & { basis: Pick<FleetKpis['basis'], 'freshSeconds'> }) | undefined,
  now: number = Date.now()): Freshness | undefined {
  if (!k || k.newestResultAt === undefined) return undefined;
  const freshMs = k.basis.freshSeconds * 1000;
  if (k.newestResultAt == null) return { at: null, ageMs: null, stale: false, freshMs };
  const at = Date.parse(k.newestResultAt);
  const ageMs = now - at;
  return { at, ageMs, stale: ageMs > freshMs, freshMs };
}

/** An age the way the verdict tile and the stale lines say it: minutes up to two hours, then hours; never "0 min". */
export const ageText = (ms: number) => (ms < 30_000 ? 'under 1 min'
  : ms < 7_200_000 ? `${Math.round(ms / 60_000)} min` : `${Math.round(ms / 3_600_000)} h`);
