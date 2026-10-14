// CHG-092 (SME review 2 #6): one band per result on every screen, read from the diagnosis prefix; the G15 cell shows the
// same band (rows written before the engine's CHG-094 said SUSPECTED for every band); NO_CALL / INSUFFICIENT_EVIDENCE
// read "No fault identified" (decision 3) — INSUFFICIENT_EVIDENCE is a verdict, not "not enough data".
import { describe, expect, it } from 'vitest';
import { bandOf, diagnosisLabel, g15StatusFor } from './vocabulary';
import { glyphFor } from './gateStatus';
import { toneFor } from './shared';
import { confirmationProse } from './investigation/confirmationCopy';
import { withBandG15 } from '../../api/cpm/gates';

describe('one diagnosis band everywhere (SME review 2 #6)', () => {
  it('reads the band from the diagnosis prefix', () => {
    expect(bandOf('DETECTED_OSCILLATION')).toBe('DETECTED');
    expect(bandOf('CLASSIFIED_EXCESSIVE_EFFORT')).toBe('CLASSIFIED');
    expect(bandOf('NO_CALL')).toBe('NO_FAULT');
    expect(bandOf('INSUFFICIENT_EVIDENCE')).toBe('NO_FAULT');
    expect(bandOf('INSUFFICIENT_DATA')).toBe('NO_DATA');
    expect(bandOf('EXCLUDED_MODE')).toBe('EXCLUDED');
  });
  it('no fault identified is a verdict; not enough data is not', () => {
    expect(diagnosisLabel('NO_CALL')).toBe('No fault identified');
    expect(diagnosisLabel('INSUFFICIENT_EVIDENCE')).toBe('No fault identified');
    expect(diagnosisLabel('INSUFFICIENT_DATA')).toBe('Not evaluated: not enough data');
    expect(diagnosisLabel('DETECTED_OSCILLATION')).toBe('Oscillation detected');
  });
  it('the G15 cell carries the same band and word as the result', () => {
    expect(g15StatusFor('DETECTED_OSCILLATION', 'SUSPECTED')).toBe('DETECTED');
    expect(g15StatusFor('NO_CALL', 'INSUFFICIENT_EVIDENCE')).toBe('INSUFFICIENT_EVIDENCE');
    expect(g15StatusFor('EXCLUDED_MODE', 'NOT_EVALUATED')).toBe('NOT_EVALUATED');
    expect(glyphFor('DETECTED', 'G15').word).toBe('Detected');
    expect(glyphFor('CLASSIFIED', 'G15').word).toBe('Classified');
    const m = withBandG15({ diagnosis: 'DETECTED_OSCILLATION', gates: [{ key: 'G5', status: 'PASS' }, { key: 'G15', status: 'SUSPECTED' }] });
    expect(m.gates.map(g => g.status)).toEqual(['PASS', 'DETECTED']);
  });
  it('red only for confirmed; a low severity is not green', () => {
    expect(toneFor('CONFIRMED_OSCILLATION')).toBe('bad');
    expect(toneFor('SUSPECTED_OSCILLATION')).toBe('warn');
    expect(toneFor('LOW')).toBe('muted');
  });
});

describe('G14 on a loop without a valve position (SME review 2 #19)', () => {
  it('a valve claim on a no-VP loop is not called a symptom family', () => {
    const c = { claimType: 'FINAL_ELEMENT_NON_FOLLOWING', state: 'NOT_APPLICABLE', reason: 'VP_NOT_APPLICABLE', positiveEvidenceIds: [],
      contradictions: [], scope: '', nonFollowingDwellS: 0, trackingErrorP95Pp: 0, confirmedAtMs: 0 };
    expect(confirmationProse(c)).toMatch(/^This loop has no valve position/);
    expect(confirmationProse({ ...c, reason: 'NOT_A_FINAL_ELEMENT_CLAIM' })).toMatch(/symptom family/);
  });
});
