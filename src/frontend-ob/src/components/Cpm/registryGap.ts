/**
 * Loop Registry (CHG-147): the loops behind the two configuration-limit counts, and the one pill an abnormal
 * loop carries. The gap rules are the server summary's (cplm-api FleetRegistrySummarySql): an active loop whose
 * input is EXPECTED and absent (both counts: a monitored one). Peers: the registry's mirror `peerLinksConfigured` is written from the loop's
 * links, so "has no links" is the same set while that mirror is current.
 */
import type { CpmLoop } from '../../api/cpmApi';
import { inputContextOf } from './optionalInputs';
import { stateOf, type LoopState } from './registryShared';

export type RegistryGap = 'vp' | 'peers' | 'degraded';

export const parseGap = (v: string | null): RegistryGap | null => (v === 'vp' || v === 'peers' || v === 'degraded' ? v : null);

export function hasGap(loop: CpmLoop, gap: RegistryGap): boolean {
  if (gap === 'degraded') return stateOf(loop).label === 'Degraded';
  if (!loop.isActive) return false;
  const c = inputContextOf(loop)!;
  // the valve-position count is of monitored loops, the list the Diagnostic capability tile opens (cplm-api FleetRegistrySummarySql)
  return loop.monitoringEnabled && (gap === 'vp' ? c.vp === 'EXPECTED' && !c.vpMapped : c.peers === 'EXPECTED' && loop.links.length === 0);
}

/**
 * Only Not monitored and Retired show on a row: nearly every loop has a readiness gap, so Degraded is a count and a filter,
 * not a pill. CHG-168: the state's glyph and word, muted ("○ Not monitored", "⊘ Retired").
 */
export function abnormalPill(loop: CpmLoop): LoopState | null {
  const st = stateOf(loop);
  return st.label === 'Retired' || st.label === 'Not monitored' ? st : null;
}
