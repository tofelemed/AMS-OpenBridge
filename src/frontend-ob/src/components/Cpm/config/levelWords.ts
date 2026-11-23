/** The words the Gate Configuration pages use for a settings level, a version and a change's steps. */
import type { ScopeKind } from '../../../api/cpm/config';
import { codeLabel } from '../vocabulary';
import type { ChangeStep } from './configRoutes';
import type { TabMark } from './lifecycle';
import { CHANGE_STEPS, SETTLED } from './changeStates';

const LEVEL_WORD: Record<ScopeKind | 'FACTORY', string> = {
  LOOP: 'Own settings', PROFILE: 'Type settings', SITE: 'Plant settings', REGIME: 'Regime settings', FACTORY: 'Factory',
};

export const levelWord = (kind: ScopeKind | 'FACTORY'): string => LEVEL_WORD[kind];

/** "Own settings v12". */
export const versionLabel = (b: { scopeKind: ScopeKind; version: number }): string => `${levelWord(b.scopeKind)} v${b.version}`;

/** The loop id, the loop type in words, or "Whole plant". (No `names` parameter: nothing needs one.) */
export const scopeTitle = (kind: ScopeKind, ref: string): string =>
  kind === 'SITE' ? 'Whole plant' : kind === 'PROFILE' ? codeLabel(ref) : ref;

/** How many steps a state has finished (-1: a refused change goes back to Edit). The step after them is the current one. */
const FINISHED: Record<string, number> = {
  DRAFT: 0, VALIDATED: 1, SHADOW_EVALUATED: 2, EXPIRED: 2, REJECTED: -1,
  APPROVED: 3, SCHEDULED: 3, PREPARED: 3, PARTIALLY_ACKNOWLEDGED: 3, ACTIVATION_FAILED: 3,
};

/** Done, current, or nothing, per change step. A state names the step just finished; the next step is the current one.
 * `hasEdits` false (a DRAFT whose own layer differs from its parent in nothing) keeps Edit current. */
export function stepMarks(state: string, hasEdits = true): Record<ChangeStep, TabMark> {
  // a fresh draft whose own layer has no change yet has not finished Edit
  const done = SETTLED.has(state) ? CHANGE_STEPS.length : state === 'DRAFT' && !hasEdits ? 0 : (FINISHED[state] ?? 0) + 1;
  const out = {} as Record<ChangeStep, TabMark>;
  CHANGE_STEPS.forEach((s, i) => { out[s] = i < done ? 'done' : i === done ? 'current' : null; });
  return out;
}

const STATE_WORD: Record<string, string> = {
  ACTIVE_VERIFIED: 'Running', SUPERSEDED: 'Replaced', ROLLED_BACK: 'Rolled back', DRAFT: 'Draft', VALIDATED: 'Checked',
  SHADOW_EVALUATED: 'Tried on past data', APPROVED: 'Approved', SCHEDULED: 'Deploying', PREPARED: 'Deploying', REJECTED: 'Sent back',
  EXPIRED: 'Approval expired', PARTIALLY_ACKNOWLEDGED: 'Partly deployed', ACTIVATION_FAILED: 'Deploy failed',
};

/** A version's state in the words the Gate Configuration pages use. */
export const stateWord = (state: string): string => {
  const w = STATE_WORD[state];
  if (w) return w;
  const t = state.toLowerCase().replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};
