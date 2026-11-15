// CHG-187 (owner review 9, 11): one retention label in the gate head, its detail behind the ?.
import { describe, expect, it } from 'vitest';
import { retentionLabel } from './retention';
import type { GateState } from './GateResultState';

const READY: GateState = { kind: 'READY', title: 'Ready', detail: '', stillValid: '', action: 'NONE', tone: 'good' };
const NOT_RETAINED: GateState = { kind: 'NOT_RETAINED', title: 'Evidence not retained for this run', detail: 'The live path keeps the arrays…',
  stillValid: 'The verdict and every value of this run stand.', action: 'RECONSTRUCT', tone: 'muted' };

describe('retentionLabel', () => {
  it('says "Evidence kept" for retained proof, with what it is behind the ?', () => {
    expect(retentionLabel('COMPLETE', 'RETAINED', READY)).toEqual({ text: 'Evidence kept', tone: 'info', tip: ['The live engine\'s own arrays for this run, kept by the retention policy.'] });
  });

  it('says "Evidence not kept" when nothing is held, the policy and what still stands behind the ?', () => {
    expect(retentionLabel('NONE', 'NONE', NOT_RETAINED)).toEqual({ text: 'Evidence not kept', tone: 'unknown', tip: [NOT_RETAINED.detail, NOT_RETAINED.stillValid] });
    expect(retentionLabel('NONE', 'NONE', READY)?.tip[0]).toMatch(/No arrays are held/);
  });

  it('names a failed or expired set by that state, and a set still arriving as arriving', () => {
    expect(retentionLabel('FAILED', 'NONE', READY)?.text).toBe('Reconstruction failed');
    expect(retentionLabel('EXPIRED', 'NONE', READY)?.text).toBe('Reconstruction expired');
    expect(retentionLabel('PENDING', 'RETAINED', READY)?.text).toBe('Evidence arriving');
  });

  it('says nothing while unknown, or when the evidence-basis line names a rebuild or a reconstruction', () => {
    expect(retentionLabel(undefined, undefined, READY)).toBeNull();
    expect(retentionLabel('COMPLETE', 'REBUILT_LOST', READY)).toBeNull();
    expect(retentionLabel('COMPLETE', 'RECONSTRUCTION', READY)).toBeNull();
  });
});
