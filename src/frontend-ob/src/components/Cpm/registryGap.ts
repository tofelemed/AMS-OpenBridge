/**
 * Loop Registry (CHG-147): the loops behind the two configuration-limit counts, and the one pill an abnormal
 * loop carries. The gap rules are the server summary's (cplm-api FleetRegistrySummarySql): an active loop whose
 * input is EXPECTED and absent. Peers: the registry's mirror `peerLinksConfigured` is written from the loop's
 * links, so "has no links" is the same set while that mirror is current.
 */
import type { CpmLoop } from '../../api/cpmApi';
import { inputContextOf } from './optionalInputs';
import { stateOf } from './registryShared';

export type RegistryGap = 'vp' | 'peers' | 'degraded';

export const parseGap = (v: string | null): RegistryGap | null => (v === 'vp' || v === 'peers' || v === 'degraded' ? v : null);

export function hasGap(loop: CpmLoop, gap: RegistryGap): boolean {
  if (gap === 'degraded') return stateOf(loop).label === 'Degraded';
  if (!loop.isActive) return false;
  const c = inputContextOf(loop)!;
  return gap === 'vp' ? c.vp === 'EXPECTED' && !c.vpMapped : c.peers === 'EXPECTED' && loop.links.length === 0;
}

export const GAP_LABEL: Record<RegistryGap, string> = {
  vp: 'a valve position expected but not mapped',
  peers: 'peer links expected but missing',
  degraded: 'a readiness gap (degraded)',
};

/** Only Not monitored and Retired show on a row: nearly every loop has a readiness gap, so Degraded is a count and a filter, not a pill. */
export function abnormalPill(loop: CpmLoop): string | null {
  const st = stateOf(loop);
  if (st.label === 'Inactive') return 'Retired';
  if (st.label === 'Registered') return 'Not monitored';
  return null;
}
