/**
 * Shared registry helpers. Split out of LoopRegistry so the screen, the
 * add-loop wizard and the bulk importer each stay inside the repo's file-size
 * limit — the single file had grown to 1211 lines holding three features.
 */
import type { CpmLoop } from '../../api/cpmApi';

/**
 * Dynamic class DERIVED from loop type.
 *
 * A client-side stand-in, not the engine's answer: the fusion engine resolves a
 * `dynamicsClass` per window and reports it — with whether the profile was
 * INFERRED — in the gate metadata, which is what the Explorer Summary tab
 * shows. The registry list has no per-loop gate payload, so it derives. Every
 * surface showing this must SAY it is a derivation, or it reads as the engine's
 * resolution and can silently disagree with it.
 */
export function dynamicClassOf(loop: CpmLoop): string {
  switch (loop.loopType) {
    case 'LIC': return 'INTEGRATING';
    case 'TIC': return 'SLOW_SELF_REG';
    default: return 'FAST_SELF_REG';
  }
}

export function stateOf(loop: CpmLoop): { label: string; tone: 'good' | 'warn' | 'muted' } {
  if (!loop.isActive) return { label: 'Inactive', tone: 'muted' };
  if (!loop.monitoringEnabled) return { label: 'Registered', tone: 'muted' };
  if (loop.observabilityFlags.includes('NO_UPSTREAM_LINKS')
      || loop.observabilityFlags.includes('NO_VP'))
    return { label: 'Degraded', tone: 'warn' };
  return { label: 'Active', tone: 'good' };
}
