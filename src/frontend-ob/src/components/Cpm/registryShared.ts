/**
 * Shared registry helpers. Split out of LoopRegistry so the screen, the
 * add-loop wizard and the bulk importer each stay inside the repo's file-size
 * limit — the single file had grown to 1211 lines holding three features.
 */
import type { CpmLoop } from '../../api/cpmApi';

/**
 * v2.5 (2G.1, R25): the loop model as the REGISTRY stores it (service family · dynamic class),
 * never a client-side derivation from the tag type. A row the API served without a model
 * (pre-2G.1 service) reads as "not served".
 */
export function modelLabel(loop: CpmLoop): string {
  const m = loop.model;
  if (!m) return 'model not served';
  return `${m.serviceFamily ?? '—'} · ${m.dynamicClass ?? '—'}`;
}

export function stateOf(loop: CpmLoop): { label: string; tone: 'good' | 'warn' | 'muted' } {
  if (!loop.isActive) return { label: 'Inactive', tone: 'muted' };
  if (!loop.monitoringEnabled) return { label: 'Registered', tone: 'muted' };
  if (loop.observabilityFlags.includes('NO_UPSTREAM_LINKS')
      || loop.observabilityFlags.includes('NO_VP'))
    return { label: 'Degraded', tone: 'warn' };
  return { label: 'Active', tone: 'good' };
}
