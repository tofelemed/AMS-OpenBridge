/**
 * SME review #24 (CHG-064): a verdict says what it rests on and what it was judged WITHOUT. "Instrument health: Not
 * configured" beside "Oscillation confirmed" is not a contradiction — the oscillation is confirmed from the PV / OP
 * signals — but a sensor fault was never checked, and the screen has to say so (NAMUR NE107: missing diagnostics
 * are not OK; GUM: a result names what was not measured). Same for "No problem found": it covers the checks that
 * ran, not the inputs that were missing. Shared by the Loop summary card and the Investigation conclusion.
 */
import type { CpmGateMatrix } from '../../api/cpm/gates';
import { causeBreakdown } from './causeAnalysis';
import { conditionOf } from './explorer/summary/summaryText';
import { effectiveInputFlags } from './inputLimits';
import type { InputContext } from './optionalInputs';
import { lowerFirst } from './vocabulary';

export interface ConclusionBasis {
  /** "Confirmed from" / "Based on" / "No problem found in". */
  lead: string;
  /** What the conclusion rests on, e.g. "sustained oscillation (G5, G7)". */
  from: string;
  /** Each input the conclusion was judged without, and what that leaves open. */
  notChecked: string[];
}

const HEALTH_GAP: Record<string, string> = {
  'HEALTH NOT CONFIGURED': 'Transmitter health: no NE107 health source is bound, so a sensor fault is not ruled out',
  'HEALTH UNKNOWN': 'Transmitter health: no current health report, so a sensor fault is not ruled out',
  'INSTRUMENT LIMITED': 'Transmitter health is limited: a sensor fault is only partly checked',
};

/** The inputs this window was judged without, as sentences (no duplicates, health first). */
export function notCheckedOf(flags: readonly string[] | null | undefined, healthLabel?: string, inputs?: InputContext): string[] {
  const eff = effectiveInputFlags(flags, inputs);
  const out: string[] = [];
  const health = healthLabel && HEALTH_GAP[healthLabel] ? HEALTH_GAP[healthLabel]
    : eff.includes('HEALTH_NOT_CONFIGURED') ? HEALTH_GAP['HEALTH NOT CONFIGURED']
      : eff.includes('HEALTH_LIMITED') ? HEALTH_GAP['INSTRUMENT LIMITED'] : null;
  if (health) out.push(health);
  if (eff.includes('NO_VP')) {
    out.push(inputs?.vp === 'NOT_INSTALLED'
      ? 'Valve position: no positioner feedback installed, so a valve cause can be suspected but not confirmed'
      : 'Valve position: not available, so a valve (stiction) cause is neither confirmed nor ruled out');
  }
  if (eff.includes('NO_UPSTREAM_LINKS') || eff.includes('NO_PEER_LINKS'))
    out.push('Peer interaction (G13): no peer links, so an upstream disturbance is not ruled out');
  if (eff.includes('NO_STEP_TEST'))
    out.push('Step response (G12): no approved step test, so there is no process model to compare against');
  return out;
}

/** Null when there is no verdict to explain (not evaluated, insufficient data, excluded). */
export function basisOf(
  matrix: Pick<CpmGateMatrix, 'diagnosis' | 'verdictV2' | 'observabilityFlags'> & { gates?: CpmGateMatrix['gates'] },
  ctx: { healthLabel?: string; inputs?: InputContext } = {},
): ConclusionBasis | null {
  const condition = conditionOf(matrix.diagnosis);
  if (condition.kind !== 'finding' && condition.kind !== 'healthy') return null;
  const notChecked = notCheckedOf(matrix.observabilityFlags, ctx.healthLabel, ctx.inputs);
  if (condition.kind === 'healthy')
    return { lead: 'No problem found in', from: 'the performance and symptom checks that ran on this window', notChecked };
  // cited gates are only those that fired on this window (causeBreakdown's `cells`)
  const seen = causeBreakdown(matrix.verdictV2, matrix.observabilityFlags ?? [], ctx.inputs, matrix.gates)?.observed ?? [];
  const from = seen.length
    ? seen.map(o => `${lowerFirst(o.label)}${o.detail ? ` (${o.detail})` : ''}`).join(' · ')
    : 'the gate results on this window';
  const confirmed = (matrix.diagnosis ?? '').toUpperCase().includes('CONFIRMED');
  return { lead: confirmed ? 'Confirmed from' : 'Based on', from, notChecked };
}
