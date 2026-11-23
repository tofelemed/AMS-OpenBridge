import { describe, expect, it } from 'vitest';
import { levelWord, scopeTitle, stateWord, stepMarks, versionLabel } from './levelWords';
import { codeLabel } from '../vocabulary';

describe('levelWords', () => {
  it('names each level', () => {
    expect(versionLabel({ scopeKind: 'LOOP', version: 12 })).toBe('Own settings v12');
    expect(versionLabel({ scopeKind: 'PROFILE', version: 1 })).toBe('Type settings v1');
    expect(versionLabel({ scopeKind: 'SITE', version: 1 })).toBe('Plant settings v1');
    expect(levelWord('FACTORY')).toBe('Factory');
  });
  it('titles a scope', () => {
    expect(scopeTitle('LOOP', 'FIC10302')).toBe('FIC10302');
    expect(scopeTitle('SITE', 'hdpe')).toBe('Whole plant');
    expect(scopeTitle('PROFILE', 'FLOW')).toBe(codeLabel('FLOW'));
  });
  it('marks the steps: a state names the step just finished, the next one is current', () => {
    const D = 'done', C = 'current';
    expect(stepMarks('DRAFT')).toEqual({ edit: D, check: C, try: null, approve: null, deploy: null });
    // retest 12: a draft with no edit yet has Edit as the current step
    expect(stepMarks('DRAFT', false)).toEqual({ edit: C, check: null, try: null, approve: null, deploy: null });
    expect(stepMarks('DRAFT', true)).toEqual(stepMarks('DRAFT'));
    expect(stepMarks('VALIDATED', false)).toEqual(stepMarks('VALIDATED'));
    expect(stepMarks('VALIDATED')).toEqual({ edit: D, check: D, try: C, approve: null, deploy: null });
    expect(stepMarks('SHADOW_EVALUATED')).toEqual({ edit: D, check: D, try: D, approve: C, deploy: null });
    expect(stepMarks('EXPIRED')).toEqual(stepMarks('SHADOW_EVALUATED'));
    expect(stepMarks('REJECTED')).toEqual({ edit: C, check: null, try: null, approve: null, deploy: null });
    for (const st of ['APPROVED', 'SCHEDULED', 'PREPARED', 'PARTIALLY_ACKNOWLEDGED', 'ACTIVATION_FAILED']) {
      expect(stepMarks(st)).toEqual({ edit: D, check: D, try: D, approve: D, deploy: C });
    }
    for (const st of ['ACTIVE_VERIFIED', 'SUPERSEDED', 'ROLLED_BACK']) expect(Object.values(stepMarks(st))).toEqual([D, D, D, D, D]);
  });
});

describe('stateWord', () => {
  it('says a version state in plain words, never "verified"', () => {
    const map: Record<string, string> = {
      ACTIVE_VERIFIED: 'Running', SUPERSEDED: 'Replaced', ROLLED_BACK: 'Rolled back', DRAFT: 'Draft', VALIDATED: 'Checked',
      SHADOW_EVALUATED: 'Tried on past data', APPROVED: 'Approved', SCHEDULED: 'Deploying', PREPARED: 'Deploying', REJECTED: 'Sent back',
      EXPIRED: 'Approval expired', PARTIALLY_ACKNOWLEDGED: 'Partly deployed', ACTIVATION_FAILED: 'Deploy failed', SOME_NEW_STATE: 'Some new state',
    };
    for (const [k, v] of Object.entries(map)) expect(stateWord(k)).toBe(v);
  });
});
