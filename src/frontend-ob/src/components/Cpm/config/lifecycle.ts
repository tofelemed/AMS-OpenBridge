/**
 * 2026-09-17 audit F18: the bundle lifecycle in words. The steps a version walks (draft → validated →
 * shadow → approved → deploying → active) with the one it is on, the actions in that order with the
 * reason each disabled one is disabled (the state, or the permission), and a deployment's ACK matrix
 * summarised in one line. Pure; the server's state is the only input.
 */
import type { CpmTone } from '../shared';
import type { Deployment } from '../../../api/cpm/config';
import { ApiError } from '../../../api/apiFetch';
import { bundleStateWord } from './configWords';

/** A lifecycle step the server refused, as the column said it: "Refused: …" (403), "Conflict: …" (409), else its message. */
export const errorText = (e: unknown): string | null => {
  if (!e) return null;
  if (e instanceof ApiError) return e.status === 403 ? `Refused: ${e.message}` : e.status === 409 ? `Conflict: ${e.message}` : e.message;
  return e instanceof Error ? e.message : String(e);
};

export type StepKey = 'DRAFT' | 'VALIDATED' | 'SHADOW' | 'APPROVED' | 'DEPLOYING' | 'ACTIVE';
export interface LifecycleStep { key: StepKey; label: string; status: 'done' | 'current' | 'todo'; tone: CpmTone }

const STEPS: Array<[StepKey, string]> = [['DRAFT', 'Draft'], ['VALIDATED', 'Validated'], ['SHADOW', 'Shadow'], ['APPROVED', 'Approved'], ['DEPLOYING', 'Deploying'], ['ACTIVE', 'Active']];

/** Where a bundle state sits on the steps, with the tone and label of that step. */
function positionOf(state: string): { index: number; tone: CpmTone; label?: string } {
  switch (state) {
    case 'DRAFT': return { index: 0, tone: 'muted' };
    case 'VALIDATED': return { index: 1, tone: 'warn' };
    case 'REJECTED': return { index: 1, tone: 'bad', label: 'Rejected' };
    case 'SHADOW_EVALUATED': return { index: 2, tone: 'warn' };
    case 'APPROVED': return { index: 3, tone: 'warn' };
    case 'EXPIRED': return { index: 3, tone: 'bad', label: 'Approval expired' };
    case 'SCHEDULED': case 'PREPARED': return { index: 4, tone: 'warn' };
    case 'PARTIALLY_ACKNOWLEDGED': return { index: 4, tone: 'bad', label: 'Partially acknowledged' };
    case 'ACTIVATION_FAILED': return { index: 4, tone: 'bad', label: 'Activation failed' };
    case 'ACTIVE_VERIFIED': return { index: 5, tone: 'good' };
    case 'ROLLED_BACK': return { index: 5, tone: 'muted', label: 'Rolled back' };
    case 'SUPERSEDED': return { index: 5, tone: 'muted', label: 'Superseded' };
    default: return { index: 0, tone: 'muted' };
  }
}

export function lifecycleSteps(state: string): LifecycleStep[] {
  const pos = positionOf(state);
  return STEPS.map(([key, label], i) => ({
    key,
    label: i === pos.index && pos.label ? pos.label : label,
    status: i < pos.index ? 'done' : i === pos.index ? 'current' : 'todo',
    tone: i === pos.index ? pos.tone : i < pos.index ? 'good' : 'muted',
  }));
}

export type ActionKey = 'validate' | 'shadow' | 'approve' | 'deploy' | 'rollback';
export interface LifecycleAction { key: ActionKey; label: string; enabled: boolean; reason: string | null }
export interface LifecyclePerms { validate: boolean; shadow: boolean; approve: boolean; activate: boolean; rollback: boolean }

const TERMINAL = new Set(['ACTIVE_VERIFIED', 'ROLLED_BACK', 'SUPERSEDED', 'SCHEDULED', 'PREPARED']);
/** The states whose content can still be edited (with cpm.config.draft). */
export const EDITABLE_STATES = new Set(['DRAFT', 'VALIDATED', 'SHADOW_EVALUATED', 'REJECTED']);

/** CHG-169: why a version cannot change, in the state's word ("Active (verified)"); said once, under the bundle's tabs. */
export const frozenSentence = (state: string): string => `This version is ${bundleStateWord(state).label} - create a new version to change it.`;

/** The actions in lifecycle order; a disabled one names the permission or the state that blocks it. */
export function lifecycleActions(bundle: { state: string }, perms: LifecyclePerms, approvalExpired: boolean, hasVerifiedActivation: boolean): LifecycleAction[] {
  const s = bundle.state;
  const frozen = TERMINAL.has(s) ? frozenSentence(s) : null;
  const validate: LifecycleAction = !perms.validate ? { key: 'validate', label: 'Validate', enabled: false, reason: 'Needs cpm.config.validate.' }
    : frozen ? { key: 'validate', label: 'Validate', enabled: false, reason: frozen }
    : s === 'DRAFT' || s === 'REJECTED' ? { key: 'validate', label: 'Validate', enabled: true, reason: null }
    : { key: 'validate', label: 'Validate', enabled: false, reason: 'Already validated; edit the draft to validate again.' };
  const afterValidate = s === 'VALIDATED' || s === 'SHADOW_EVALUATED';
  const shadow: LifecycleAction = !perms.shadow ? { key: 'shadow', label: 'Shadow', enabled: false, reason: 'Needs cpm.config.shadow.' }
    : frozen ? { key: 'shadow', label: 'Shadow', enabled: false, reason: frozen }
    : afterValidate || s === 'APPROVED' ? { key: 'shadow', label: 'Shadow', enabled: true, reason: null }
    : { key: 'shadow', label: 'Shadow', enabled: false, reason: 'Validate the draft first.' };
  const approve: LifecycleAction = !perms.approve ? { key: 'approve', label: 'Approve', enabled: false, reason: 'Needs cpm.config.approve (by someone other than the author).' }
    : frozen ? { key: 'approve', label: 'Approve', enabled: false, reason: frozen }
    : afterValidate ? { key: 'approve', label: 'Approve', enabled: true, reason: null }
    : s === 'APPROVED' || s === 'EXPIRED' ? { key: 'approve', label: 'Approve', enabled: approvalExpired || s === 'EXPIRED', reason: approvalExpired || s === 'EXPIRED' ? null : 'Already approved for this content.' }
    : { key: 'approve', label: 'Approve', enabled: false, reason: 'Validate the draft first.' };
  const deployable = s === 'APPROVED' || s === 'PARTIALLY_ACKNOWLEDGED' || s === 'ACTIVATION_FAILED';
  const deploy: LifecycleAction = !perms.activate ? { key: 'deploy', label: 'Activate', enabled: false, reason: 'Needs cpm.config.activate.' }
    : deployable && approvalExpired ? { key: 'deploy', label: 'Activate', enabled: false, reason: 'The approval expired; approve again before activating.' }
    : deployable ? { key: 'deploy', label: 'Activate', enabled: true, reason: null }
    : frozen ? { key: 'deploy', label: 'Activate', enabled: false, reason: frozen }
    : { key: 'deploy', label: 'Activate', enabled: false, reason: 'Approve the content first.' };
  const rollback: LifecycleAction = !perms.rollback ? { key: 'rollback', label: 'Roll back', enabled: false, reason: 'Needs cpm.config.rollback.' }
    : hasVerifiedActivation ? { key: 'rollback', label: 'Roll back', enabled: true, reason: null }
    : { key: 'rollback', label: 'Roll back', enabled: false, reason: 'Only a verified activation can be rolled back.' };
  return [validate, shadow, approve, deploy, rollback];
}

// ── CHG-169 (owner review): a bundle's five tabs in lifecycle order carry the marks the six-step strip carried ──
export type BundleTab = 'properties' | 'diff' | 'shadow' | 'approval' | 'deployments';
export const BUNDLE_TABS: BundleTab[] = ['properties', 'diff', 'shadow', 'approval', 'deployments'];
export type TabMark = 'done' | 'current' | null;
const TAB_STEPS: Record<BundleTab, StepKey[]> = { properties: ['DRAFT'], diff: ['VALIDATED'], shadow: ['SHADOW'], approval: ['APPROVED'], deployments: ['DEPLOYING', 'ACTIVE'] };
const SETTLED = new Set(['ACTIVE_VERIFIED', 'ROLLED_BACK', 'SUPERSEDED']);

/** ✓ done, ● current, or nothing, per tab, from the server's state as the steps read it; a settled version has walked them all. */
export function tabMarks(state: string): Record<BundleTab, TabMark> {
  const steps = lifecycleSteps(state);
  const status = new Map(steps.map(s => [s.key, s.status]));
  const out = {} as Record<BundleTab, TabMark>;
  for (const tab of BUNDLE_TABS) {
    const own = TAB_STEPS[tab].map(k => status.get(k));
    out[tab] = SETTLED.has(state) ? 'done' : own.includes('current') ? 'current' : own.every(x => x === 'done') ? 'done' : null;
  }
  return out;
}

/** One line for a deployment's ACK matrix: acknowledged per phase, refusals counted. */
export function ackSummary(d: Deployment): { text: string; complete: boolean; nacks: number } {
  const n = d.ackMatrix.length;
  const prepare = d.ackMatrix.filter(m => m.prepare?.status === 'ACK').length;
  const apply = d.ackMatrix.filter(m => m.apply?.status === 'ACK').length;
  const nacks = d.ackMatrix.filter(m => m.prepare?.status === 'NACK' || m.apply?.status === 'NACK').length;
  return { text: `${prepare} of ${n} PREPARE · ${apply} of ${n} APPLY${nacks ? ` · ${nacks} refused` : ''}`, complete: n > 0 && prepare === n && apply === n, nacks };
}
