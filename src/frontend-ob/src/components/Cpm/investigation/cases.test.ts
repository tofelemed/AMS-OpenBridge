// v2.5 Task 1E.2 — analysis cases come from the served leading hypothesis, not from
// string-matching a diagnosis; pre-v2.5 rows fall back to the label family.
import { describe, it, expect } from 'vitest';
import { caseIdFor, caseCounts, caseLabelFor } from './cases';

describe('caseIdFor', () => {
  it('uses the served leading hypothesis when present', () => {
    expect(caseIdFor({ diagnosis: 'SUSPECTED_OSCILLATION', leadingHypothesis: 'EXTERNAL_DISTURBANCE' })).toBe('EXTERNAL_DISTURBANCE');
    expect(caseIdFor({ diagnosis: 'CONFIRMED_FINAL_ELEMENT_NONLINEARITY', leadingHypothesis: 'STICTION' })).toBe('STICTION');
  });

  it('falls back to the label family on a pre-v2.5 row', () => {
    expect(caseIdFor({ diagnosis: 'SUSPECTED_FINAL_ELEMENT_NONLINEARITY', leadingHypothesis: null })).toBe('STICTION');
    expect(caseIdFor({ diagnosis: 'DETECTED_OSCILLATION', leadingHypothesis: null })).toBe('OSCILLATION_TUNING');
    expect(caseIdFor({ diagnosis: 'CLASSIFIED_EXCESSIVE_EFFORT', leadingHypothesis: null })).toBe('EXCESSIVE_EFFORT');
  });

  it('keeps not-evaluable and healthy apart from any mechanism, whatever the hypothesis says', () => {
    expect(caseIdFor({ diagnosis: 'EXCLUDED_DATA_QUALITY', leadingHypothesis: 'STICTION' })).toBe('NOT_EVALUABLE');
    expect(caseIdFor({ diagnosis: 'INSUFFICIENT_EVIDENCE', leadingHypothesis: null })).toBe('NOT_EVALUABLE');
    expect(caseIdFor({ diagnosis: 'NOT_EVALUATED', leadingHypothesis: null })).toBe('NOT_EVALUABLE');
    expect(caseIdFor({ diagnosis: 'NORMAL', leadingHypothesis: 'NONE' })).toBe('HEALTHY');
  });

  it('counts chips most frequent first and labels them', () => {
    const rows = [
      { diagnosis: 'SUSPECTED_OSCILLATION', leadingHypothesis: 'OSCILLATION_TUNING' },
      { diagnosis: 'SUSPECTED_OSCILLATION', leadingHypothesis: 'OSCILLATION_TUNING' },
      { diagnosis: 'EXCLUDED_MODE', leadingHypothesis: null },
    ];
    expect(caseCounts(rows)).toEqual([['OSCILLATION_TUNING', 2], ['NOT_EVALUABLE', 1]]);
    expect(caseLabelFor(rows[0])).toBe('Oscillation — tuning');
  });
});
