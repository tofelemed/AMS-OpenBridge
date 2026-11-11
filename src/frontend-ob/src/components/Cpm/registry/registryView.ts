/**
 * CHG-168 (owner review, answer 1): the list's one dropdown. It merged Show retired and the three configuration-limit counts:
 * Not retired n · With retired n · VP expected, not mapped n · Peer links expected, missing n · Degraded n, the counts as the
 * server gives them (the VP and peer counts from the fleet summary, the rest from the registry list, all within the plant scope,
 * not the search). The choice keeps today's address: ?retired=1 for With retired, ?gap=vp|peers|degraded for a limit.
 */
import type { CpmFleetSummary, CpmLoop } from '../../../api/cpmApi';
import { hasGap, parseGap, type RegistryGap } from '../registryGap';

export type RegistryView = 'current' | 'all' | RegistryGap;

export function viewOf(params: URLSearchParams): RegistryView {
  const gap = parseGap(params.get('gap'));
  if (gap) return gap;
  return params.get('retired') === '1' ? 'all' : 'current';
}

/** Writes the choice into the address; Not retired is the default, so it writes nothing. */
export function setView(p: URLSearchParams, view: RegistryView): void {
  p.delete('gap');
  p.delete('retired');
  if (view === 'all') p.set('retired', '1');
  else if (view !== 'current') p.set('gap', view);
}

export function inView(loop: CpmLoop, view: RegistryView): boolean {
  if (view === 'all') return true;
  if (view === 'current') return loop.isActive;
  return hasGap(loop, view);
}

export interface ViewCounts { current: number; all: number; vp: number | null; peers: number | null; degraded: number }

/** `scoped`: the registry list within the plant scope. The limit counts are null until the summary arrives. */
export function viewCounts(scoped: CpmLoop[], summary: CpmFleetSummary | undefined): ViewCounts {
  return {
    current: scoped.filter(l => l.isActive).length,
    all: scoped.length,
    vp: summary?.capability.loopsCappedByMissingVp ?? null,
    peers: summary?.capability.loopsWithoutDisturbanceContext ?? null,
    degraded: scoped.filter(l => hasGap(l, 'degraded')).length,
  };
}

const LABEL: Record<RegistryView, string> = {
  current: 'Not retired',
  all: 'With retired',
  vp: 'VP expected, not mapped',
  peers: 'Peer links expected, missing',
  degraded: 'Degraded',
};
const ORDER: RegistryView[] = ['current', 'all', 'vp', 'peers', 'degraded'];

export function viewOptions(c: ViewCounts): Array<{ value: RegistryView; label: string }> {
  return ORDER.map(value => {
    const n = c[value];
    return { value, label: n == null ? LABEL[value] : `${LABEL[value]} ${n}` };
  });
}
