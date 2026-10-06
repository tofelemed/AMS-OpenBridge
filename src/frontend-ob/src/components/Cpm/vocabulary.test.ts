// SME review #14 (CHG-051): every code the engine serves reads as engineering language; unknown codes are
// humanised, never shouted and never hidden.
import { describe, expect, it } from 'vitest';
import { codeLabel, diagnosisLabel, disqualifierLabel, humanise, locationPath, methodLabel } from './vocabulary';

// Every code value found in the lab's analytics.cplm_gate_latest on 2026-10-06 (statuses, reasons, flags,
// disqualifier codes, hypotheses, dynamics and profiles) plus the Flink method ids.
const SERVED = [
  'CONFIRMED', 'FAIL', 'INSUFFICIENT_EVIDENCE', 'NOT_APPLICABLE', 'NOT_EVALUATED', 'PASS', 'PENDING', 'STRONG', 'SUSPECTED', 'WARN',
  'AREA_OUT_OF_BAND', 'NO_PEER_LINKS', 'NO_PV_SPAN', 'NO_VALID_CYCLE', 'PERIOD_OUT_OF_BAND', 'BUNDLE_MISMATCH_FUSION', 'HEALTH_LIMITED',
  'HEALTH_NOT_CONFIGURED', 'INSUFFICIENT_SAMPLES', 'NO_STEP_TEST', 'NO_UPSTREAM_LINKS', 'NO_VP', 'CORNER_NOISE_FLOOR', 'NO_SHAPE_EVIDENCE',
  'FAMILY_DISQUALIFIED', 'OSCILLATION_TUNING', 'STICTION', 'NOT_A_FINAL_ELEMENT_CLAIM', 'LEGACY_FLAG_ONLY', 'NONE_OPEN',
  'EVIDENCE_SCORE_UNCALIBRATED', 'ARGMAX_RANKED', 'FAST_SELF_REG', 'SLOW_SELF_REG', 'FLOW_FAST_SELF_REG', 'PRESSURE_LIQUID_FAST',
  'LEVEL_INTEGRATING', 'OP_TO_VALVE', 'ACTIVE_VERIFIED', 'CANDIDATE_MODEL', 'G5.ACF_OSCILLATION', 'G13.ALIGNED_PEER_ANALYSIS_V1',
  'G15.EVIDENCE_FUSION', 'XCORR_ASYMMETRY_V1', 'SENSOR_FREEZE',
];

describe('vocabulary', () => {
  it('gives every served code a label without underscores or shouting', () => {
    for (const c of SERVED) {
      const l = codeLabel(c);
      expect(l, c).not.toMatch(/_/);
      expect(l, c).not.toBe(c);
      expect(l, c).not.toMatch(/^[A-Z]{2,}(?: [A-Z]{2,})+$/);
    }
  });

  it('humanises an unknown code in sentence case, keeping gate ids and acronyms', () => {
    expect(codeLabel('SOME_NEW_CODE')).toBe('Some new code');
    expect(humanise('G2R_OP_SPAN_V2')).toBe('G2r OP span v2');
    expect(codeLabel('Already readable text')).toBe('Already readable text');
    expect(codeLabel(null)).toBe('—');
  });

  it('reads diagnoses as a finding plus its strength', () => {
    expect(diagnosisLabel('CONFIRMED_OSCILLATION')).toBe('Oscillation confirmed');
    expect(diagnosisLabel('SUSPECTED_FINAL_ELEMENT_NONLINEARITY')).toBe('Valve nonlinearity (stiction) suspected');
    expect(diagnosisLabel('INSUFFICIENT_DATA')).toBe('Not evaluated: not enough data');
    expect(diagnosisLabel('EXCLUDED_MODE')).toBe('Excluded: loop not in automatic');
    expect(diagnosisLabel(null)).toBe('Not evaluated yet');
  });

  it('names disqualifiers and methods', () => {
    expect(disqualifierLabel('stiction:NO_SHAPE_EVIDENCE')).toBe('Stiction ruled out: no stiction-shaped cycles');
    expect(codeLabel('geometry:NO_VALID_CYCLE')).toBe('Phase geometry ruled out: no clean oscillation cycle');
    expect(methodLabel('G5.ACF_OSCILLATION')).toBe('Autocorrelation (oscillation)');
    expect(methodLabel('G9.SOMETHING_NEW')).toBe('Something new');
  });

  it('turns location slugs into names', () => {
    expect(locationPath({ site: 'hdpe', area: 'section_600', unit: 'u6002_pellet_homogenization_ii_silo_4_5' }))
      .toBe('HDPE › Section 600 › U6002 pellet homogenization II silo 4/5');
  });
});
