/**
 * Shared registry helpers. Split out of LoopRegistry so the screen, the
 * add-loop wizard and the bulk importer each stay inside the repo's file-size
 * limit — the single file had grown to 1211 lines holding three features.
 */
import type { CpmLoop } from '../../api/cpmApi';
import { flagsForLoop, inputContextOf } from './optionalInputs';

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

export interface LoopState {
  label: 'Active' | 'Degraded' | 'Not monitored' | 'Retired';
  tone: 'good' | 'warn' | 'muted';
  glyph: string;
}

/**
 * CHG-168 (owner review): one word per state, the same in the list and on the loop's panel (the panel said "Registered" for
 * the loop the list called "Not monitored"); tone + glyph + word.
 */
export function stateOf(loop: CpmLoop): LoopState {
  if (!loop.isActive) return { label: 'Retired', tone: 'muted', glyph: '⊘' };
  if (!loop.monitoringEnabled) return { label: 'Not monitored', tone: 'muted', glyph: '○' };
  // CHG-077: only an input the loop declares can degrade it (also on a server that still stamps NO_VP)
  const flags = flagsForLoop(loop.observabilityFlags, inputContextOf(loop));
  if (flags.includes('NO_UPSTREAM_LINKS') || flags.includes('NO_VP'))
    return { label: 'Degraded', tone: 'warn', glyph: '!' };
  return { label: 'Active', tone: 'good', glyph: '✓' };
}
