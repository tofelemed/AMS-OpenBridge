import { describe, expect, it } from 'vitest';
import type { CpmGateMatrix } from '../../../../api/cpm/gates';
import {
  ageText, conditionOf, evidenceOf, leadingCauseOf, limitationsOf, nextCheckOf, primaryActionOf, staleAfterMs,
} from './summaryText';

const v2 = (over: Partial<CpmGateMatrix['verdictV2']> = {}) => ({
  verdictV2: {
    legacy: false, hypotheses: {}, leadingHypothesis: null, scoreSemantics: 'EVIDENCE_SCORE_UNCALIBRATED', resultRevision: 1,
    confirmation: { claimType: '', state: '', reason: '', positiveEvidenceIds: [], contradictions: [], scope: '', nonFollowingDwellS: 0, trackingErrorP95Pp: 0, confirmedAtMs: 0 },
    observations: {},
    ...over,
  },
});

describe('conditionOf', () => {
  it('reads a finding as "<family> <band>"', () => {
    expect(conditionOf('CONFIRMED_OSCILLATION')).toMatchObject({ kind: 'finding', label: 'Oscillation confirmed', tone: 'bad' });
    expect(conditionOf('SUSPECTED_FINAL_ELEMENT_NONLINEARITY').label).toBe('Valve nonlinearity (stiction) suspected');
  });
  it('says why a loop was not judged, in muted tone', () => {
    expect(conditionOf('INSUFFICIENT_DATA')).toMatchObject({ kind: 'insufficient', tone: 'muted' });
    expect(conditionOf('EXCLUDED_MODE')).toMatchObject({ kind: 'excluded', label: 'Excluded: loop not in automatic', tone: 'muted' });
    expect(conditionOf(null).kind).toBe('not-evaluated');
    expect(conditionOf('NOT_EVALUATED').kind).toBe('not-evaluated');
  });
  it('treats NORMAL as healthy', () => {
    expect(conditionOf('NORMAL')).toMatchObject({ kind: 'healthy', tone: 'good' });
  });
});

describe('limitationsOf', () => {
  it('states what each flag costs, de-duplicated, unknown flags humanised', () => {
    expect(limitationsOf(['NO_VP', 'NO_UPSTREAM_LINKS', 'NO_PEER_LINKS', 'SOMETHING_NEW'])).toEqual([
      'No valve position mapped: a valve cause cannot be confirmed',
      'No upstream or peer links: interaction with other loops not assessed',
      'Something new',
    ]);
    expect(limitationsOf(undefined)).toEqual([]);
  });
});

describe('evidenceOf', () => {
  it('lists present observations, main first then by score, capped', () => {
    const m = v2({ observations: {
      ACTUATOR_STRESS: { present: true, score: 0.31, methodId: '', role: 'SUPPORTING', basis: '' },
      OSCILLATION: { present: true, score: 1, methodId: '', role: 'PRIMARY', basis: '' },
      FREEZE: { present: false, score: 0.5, methodId: '', role: 'PRIMARY', basis: '' },
      LIMIT_OCCUPANCY: { present: true, score: 0, methodId: '', role: 'SUPPORTING', basis: '' },
    } });
    expect(evidenceOf(m)).toEqual([
      { label: 'Sustained oscillation', main: true },
      { label: 'Actuator stress', main: false },
      { label: 'Output at a limit', main: false },
    ]);
    expect(evidenceOf(m, 1)).toHaveLength(1);
  });
  it('is empty on a legacy row', () => {
    expect(evidenceOf(v2({ legacy: true }))).toEqual([]);
  });
});

describe('leadingCauseOf', () => {
  it('names the leading hypothesis, none for NONE/null', () => {
    expect(leadingCauseOf(v2({ leadingHypothesis: 'OSCILLATION_TUNING' }))).toBe('Controller tuning');
    expect(leadingCauseOf(v2({ leadingHypothesis: 'NONE' }))).toBeNull();
    expect(leadingCauseOf(v2())).toBeNull();
  });
});

describe('nextCheckOf', () => {
  const narrative = (recommendation: string | null) => ({ narrative: { selectedFamily: null, statusReason: null, recommendation } });
  it('uses the engine recommendation when there is one', () => {
    expect(nextCheckOf(narrative('Check VP.'), conditionOf('CONFIRMED_OSCILLATION'))).toBe('Check VP.');
  });
  it('falls back to a check that fits the state', () => {
    expect(nextCheckOf(narrative(''), conditionOf('INSUFFICIENT_DATA'))).toMatch(/Window Inspector/);
    expect(nextCheckOf(narrative(null), conditionOf('EXCLUDED_MODE'))).toMatch(/automatic/);
    expect(nextCheckOf(narrative(null), conditionOf('NORMAL'))).toBe('No action needed.');
  });
});

describe('ageText', () => {
  it('uses minutes, hours, then days', () => {
    expect(ageText(12 * 60_000)).toBe('12 min ago');
    expect(ageText(3 * 3600_000)).toBe('3 h ago');
    expect(ageText(4901636547)).toBe('57 days ago');
  });
});

describe('primaryActionOf', () => {
  it('sends you where the next check is done', () => {
    expect(primaryActionOf(conditionOf('INSUFFICIENT_DATA')).target).toBe('windows');
    expect(primaryActionOf(conditionOf('EXCLUDED_MODE')).target).toBe('historical');
    expect(primaryActionOf(conditionOf('CONFIRMED_OSCILLATION')).target).toBe('investigation');
  });
});

describe('staleAfterMs', () => {
  it('is the window size, 24 h for an unknown kind', () => {
    expect(staleAfterMs('24h')).toBe(24 * 3600_000);
    expect(staleAfterMs('12h')).toBe(12 * 3600_000);
    expect(staleAfterMs('60m')).toBe(3600_000);
    expect(staleAfterMs('weird')).toBe(24 * 3600_000);
  });
});
