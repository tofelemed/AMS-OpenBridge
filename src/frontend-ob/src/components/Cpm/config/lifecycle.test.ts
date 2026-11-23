// 2026-09-17 audit F18: the bundle lifecycle as a stepper and the actions in their order, each disabled
// one carrying the reason it is disabled (state or permission) - the reader never guesses why a button
// is grey; a deployment's ACK matrix is summarised in one line before it is unfolded.
import { describe, expect, it } from 'vitest';
import { ackSummary, editableState, frozenSentence, lifecycleActions, lifecycleSteps, tabMarks } from './lifecycle';
import type { Deployment } from '../../../api/cpm/config';

const perms = { validate: true, shadow: true, approve: true, activate: true, rollback: true };
const NONE = { running: false, target: null };
const BACK = { running: true, target: { version: 5 } };

describe('lifecycleSteps', () => {
  it('marks the reached steps and the current one', () => {
    const steps = lifecycleSteps('APPROVED');
    expect(steps.map(s => s.key)).toEqual(['DRAFT', 'VALIDATED', 'SHADOW', 'APPROVED', 'DEPLOYING', 'ACTIVE']);
    expect(steps.map(s => s.status)).toEqual(['done', 'done', 'done', 'current', 'todo', 'todo']);
  });
  it('a rejected draft stops at validation with a bad tone; a failed activation stops at deploying', () => {
    expect(lifecycleSteps('REJECTED').find(s => s.key === 'VALIDATED')).toMatchObject({ status: 'current', tone: 'bad', label: 'Rejected' });
    expect(lifecycleSteps('ACTIVATION_FAILED').find(s => s.key === 'DEPLOYING')).toMatchObject({ status: 'current', tone: 'bad' });
    expect(lifecycleSteps('ACTIVE_VERIFIED').every(s => s.status !== 'todo')).toBe(true);
  });
});

describe('lifecycleActions', () => {
  it('lists the actions in order and says why each disabled one is disabled', () => {
    const a = lifecycleActions({ state: 'DRAFT' }, perms, false, NONE);
    expect(a.map(x => x.key)).toEqual(['validate', 'shadow', 'approve', 'deploy', 'rollback']);
    expect(a[0]).toMatchObject({ enabled: true, reason: null });
    expect(a[1]).toMatchObject({ enabled: false, reason: 'Validate the draft first.' });
    expect(a[2]).toMatchObject({ enabled: false, reason: 'Validate the draft first.' });
    expect(a[3]).toMatchObject({ enabled: false, reason: 'Approve the content first.' });
    expect(a[4]).toMatchObject({ enabled: false, reason: 'Only the version running now can be rolled back.' });
  });
  it('names the missing permission before the state', () => {
    const a = lifecycleActions({ state: 'VALIDATED' }, { ...perms, approve: false }, false, NONE);
    expect(a.find(x => x.key === 'approve')).toMatchObject({ enabled: false, reason: 'Someone other than the author, with permission to approve gate configuration. An Admin or SuperAdmin may approve their own.' });
    expect(a.find(x => x.key === 'shadow')).toMatchObject({ enabled: true });
  });
  it('an expired approval blocks deploy with that reason; a verified activation enables rollback', () => {
    expect(lifecycleActions({ state: 'APPROVED' }, perms, true, NONE).find(x => x.key === 'deploy')).toMatchObject({ enabled: false, reason: 'The approval expired; approve again before activating.' });
    expect(lifecycleActions({ state: 'ACTIVE_VERIFIED' }, perms, false, BACK).find(x => x.key === 'rollback')).toMatchObject({ enabled: true });
    expect(lifecycleActions({ state: 'ACTIVE_VERIFIED' }, perms, false, BACK).find(x => x.key === 'validate')).toMatchObject({ enabled: false, reason: 'This version is Active (verified) - create a new version to change it.' });
  });
});

describe("the viewer's approval rule (CHG-220, gap 5)", () => {
  it("Approve carries the rule's label, and stays off with its reason", () => {
    const own = lifecycleActions({ state: 'VALIDATED' }, perms, false, NONE, { label: 'Approve alone (Admin)', reason: null }).find(x => x.key === 'approve');
    expect(own).toMatchObject({ label: 'Approve alone (Admin)', enabled: true, reason: null });
    const blocked = lifecycleActions({ state: 'SHADOW_EVALUATED' }, perms, false, NONE, { label: 'Approve', reason: 'Needs a second person' }).find(x => x.key === 'approve');
    expect(blocked).toMatchObject({ enabled: false, reason: 'Needs a second person' });
  });
  it('an expired approval can be given again, under the same rule; a valid one cannot', () => {
    expect(lifecycleActions({ state: 'APPROVED' }, perms, true, NONE, { label: 'Approve', reason: 'A plant-wide bundle needs a SuperAdmin to approve it.' }).find(x => x.key === 'approve'))
      .toMatchObject({ enabled: false, reason: 'A plant-wide bundle needs a SuperAdmin to approve it.' });
    expect(lifecycleActions({ state: 'APPROVED' }, perms, true, NONE).find(x => x.key === 'approve')).toMatchObject({ enabled: true });
    expect(lifecycleActions({ state: 'APPROVED' }, perms, false, NONE).find(x => x.key === 'approve')).toMatchObject({ enabled: false, reason: 'Already approved for this content.' });
  });
  it('an approved version opens for edit again only once its approval expired', () => {
    expect(editableState('APPROVED', true)).toBe(true);
    expect(editableState('APPROVED', false)).toBe(false);
    expect(editableState('DRAFT', false)).toBe(true);
    expect(editableState('PREPARED', true)).toBe(false);
  });
});

describe('roll back follows the server (CHG-220, gap 4)', () => {
  it('offers the version the server names, only on the version running now', () => {
    const roll = (back: { running: boolean; target: { version: number } | null }) => lifecycleActions({ state: 'ACTIVE_VERIFIED' }, perms, false, back).find(x => x.key === 'rollback');
    expect(roll(BACK)).toMatchObject({ label: 'Roll back to v5', enabled: true, reason: null });
    expect(roll({ running: true, target: null })).toMatchObject({ enabled: false, reason: 'There is no earlier version to go back to now.' });
    expect(roll(NONE)).toMatchObject({ enabled: false, reason: 'Only the version running now can be rolled back.' });
  });
});

describe('tabMarks (CHG-169)', () => {
  it('marks the tabs from the state: a draft is on Properties, an approved one on Approval, a settled one has done them all', () => {
    expect(tabMarks('DRAFT')).toEqual({ properties: 'current', diff: null, shadow: null, approval: null, deployments: null });
    expect(tabMarks('VALIDATED')).toEqual({ properties: 'done', diff: 'current', shadow: null, approval: null, deployments: null });
    expect(tabMarks('APPROVED')).toEqual({ properties: 'done', diff: 'done', shadow: 'done', approval: 'current', deployments: null });
    expect(tabMarks('SCHEDULED').deployments).toBe('current');
    expect(tabMarks('ACTIVATION_FAILED').deployments).toBe('current');
    expect(tabMarks('REJECTED').diff).toBe('current');
    for (const s of ['ACTIVE_VERIFIED', 'ROLLED_BACK', 'SUPERSEDED']) expect(Object.values(tabMarks(s))).toEqual(['done', 'done', 'done', 'done', 'done']);
  });
  it('the frozen reason names the state in its word', () => {
    expect(frozenSentence('ACTIVE_VERIFIED')).toBe('This version is Active (verified) - create a new version to change it.');
    expect(frozenSentence('APPROVED')).toBe('This version is Approved - create a new version to change it.');
  });
});

describe('ackSummary', () => {
  const HASH = 'a'.repeat(64);
  const ack = { status: 'ACK' as const, bundleHash: HASH, jarSha256: 'j', reason: null, receivedAt: 't' };
  const d = (m: Deployment['ackMatrix']): Deployment => ({
    deploymentId: 'd', bundleId: 'b', contentHash: HASH, kind: 'ACTIVATE', rollbackOf: null, scheduledFor: null, state: 'PREPARING', error: null, epoch: 0, probeResults: null,
    createdBy: 'a', createdAt: 't', updatedAt: 't', requiredMembers: m.map(x => x.jobName), ackMatrix: m, active: false, semantics: '',
  });
  it('counts the acknowledgements per phase and flags a NACK', () => {
    expect(ackSummary(d([{ jobName: 'x', prepare: ack, apply: ack }, { jobName: 'y', prepare: ack, apply: null }])))
      .toEqual({ text: '2 of 2 PREPARE · 1 of 2 APPLY', complete: false, nacks: 0 });
    expect(ackSummary(d([{ jobName: 'x', prepare: ack, apply: ack }]))).toEqual({ text: '1 of 1 PREPARE · 1 of 1 APPLY', complete: true, nacks: 0 });
    expect(ackSummary(d([{ jobName: 'x', prepare: { ...ack, status: 'NACK', reason: 'UNKNOWN_PROPERTY' }, apply: null }])))
      .toEqual({ text: '0 of 1 PREPARE · 0 of 1 APPLY · 1 refused', complete: false, nacks: 1 });
  });
});
