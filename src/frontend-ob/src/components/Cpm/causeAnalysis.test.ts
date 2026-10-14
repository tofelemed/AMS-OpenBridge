// SME review #19 (CHG-055): a confirmed symptom is not a confirmed cause — observed, possible (with what would
// confirm it), ruled out (with the flags that limited the check) and no-evidence are kept apart.
import { describe, expect, it } from 'vitest';
import { causeBreakdown } from './causeAnalysis';
import type { CpmVerdictV2 } from '../../api/cpm/verdict';

const v: CpmVerdictV2 = {
  legacy: false, leadingHypothesis: 'OSCILLATION_TUNING', scoreSemantics: 'EVIDENCE_SCORE_UNCALIBRATED', resultRevision: 1,
  observations: {
    OSCILLATION: { present: true, score: 1, methodId: 'G5.ACF_OSCILLATION|G6.FFT_SPECTRAL', role: 'PRIMARY', basis: 'G5=PASS,G6=PASS' },
    SHAPE_TRIANGULARITY: { present: false, score: 0, methodId: 'G7.SINE_TRIANGLE_SHAPE', role: 'PRIMARY', basis: 'G7=NOT_EVALUATED' },
  },
  hypotheses: {
    OSCILLATION_TUNING: { score: 1, state: 'QUALIFIED', evidenceGroups: ['OSCILLATION'], contradictions: [], disqualifiers: [] },
    STICTION: { score: 0, state: 'DISQUALIFIED', evidenceGroups: [], contradictions: [], disqualifiers: ['NO_SHAPE_EVIDENCE'] },
    ACTUATOR_LIMIT: { score: 0, state: 'QUALIFIED', evidenceGroups: ['LIMIT_OCCUPANCY'], contradictions: [], disqualifiers: [] },
  },
  confirmation: { claimType: 'FINAL_ELEMENT_NON_FOLLOWING', state: 'NOT_APPLICABLE', reason: 'NOT_A_FINAL_ELEMENT_CLAIM', positiveEvidenceIds: [], contradictions: [], scope: '', nonFollowingDwellS: 0, trackingErrorP95Pp: 0, confirmedAtMs: 0 },
};

describe('causeBreakdown', () => {
  it('separates the symptom from the possible cause and says what would confirm it', () => {
    const b = causeBreakdown(v, ['NO_VP', 'NO_VALID_CYCLE'])!;
    expect(b.observed).toEqual([{ id: 'OSCILLATION', label: 'Sustained oscillation', detail: 'G5, G6' }]);
    expect(b.possible).toHaveLength(1);
    expect(b.possible[0]).toMatchObject({ label: 'Controller tuning', leading: true, confirmed: false });
    expect(b.possible[0].detail).toBe('evidence score 100 from sustained oscillation · not confirmed — a tuning review or an approved step test would confirm it');
  });

  it('keeps the engine\u2019s ruling, with the flags that limited the check beside it', () => {
    const b = causeBreakdown(v, ['NO_VP', 'NO_VALID_CYCLE'])!;
    expect(b.ruledOut).toEqual([{ id: 'STICTION', label: 'Valve stiction / nonlinearity',
      detail: 'no stiction-shaped cycles — note: no valve position mapped; no clean oscillation cycle, so it could not be checked fully' }]);
    // CHG-092 (SME 2 #7): a qualified mechanism that scored nothing was not seen — it is not "not assessed"
    expect(b.notAssessed).toEqual([]);
    expect(b.notSeen).toEqual([{ id: 'ACTUATOR_LIMIT', label: 'Actuator at a limit',
      detail: 'its evidence was not present in this window — this is not evidence against it' }]);
  });

  it('a missing input never reads as evidence against (SME review 2 #7)', () => {
    const w: CpmVerdictV2 = { ...v, hypotheses: {
      EXTERNAL_DISTURBANCE: { score: 0, state: 'DISQUALIFIED', evidenceGroups: ['OSCILLATION'], contradictions: [], disqualifiers: [] },
      SENSOR: { score: 0, state: 'DISQUALIFIED', evidenceGroups: [], contradictions: [], disqualifiers: [] },
      EXCESSIVE_EFFORT: { score: 0, state: 'NO_EVIDENCE', evidenceGroups: [], contradictions: [], disqualifiers: [] },
      ACTUATOR_LIMIT: { score: 0, state: 'NOT_ASSESSED', evidenceGroups: [], contradictions: [], disqualifiers: [], missingInputs: ['NO_STEP_TEST'] },
    } };
    const b = causeBreakdown(w, ['NO_UPSTREAM_LINKS'])!;
    expect(b.ruledOut).toEqual([]);
    expect(b.notAssessed.map(i => i.id)).toEqual(['EXTERNAL_DISTURBANCE', 'ACTUATOR_LIMIT']);
    expect(b.notAssessed[0].detail).toMatch(/so it can be neither confirmed nor ruled out$/);
    expect(b.notAssessed[1].detail).toMatch(/^no approved step test/i);
    // SENSOR without a health flag on this window and without reasons: checked, nothing seen
    expect(b.notSeen.map(i => i.id)).toEqual(['SENSOR', 'EXCESSIVE_EFFORT']);
  });

  it('a loop without a valve position is confirmed by a stroke test, not by VP tracking (SME 2 #19)', () => {
    const w: CpmVerdictV2 = { ...v, leadingHypothesis: 'STICTION', hypotheses: {
      STICTION: { score: 0.8, state: 'QUALIFIED', evidenceGroups: ['OSCILLATION'], contradictions: [], disqualifiers: [] } } };
    const b = causeBreakdown(w, [], { vp: 'NOT_APPLICABLE', vpMapped: false, peers: 'EXPECTED' })!;
    expect(b.possible[0].detail).toMatch(/approved stroke \/ bump test would confirm it \(this loop has no valve position\)$/);
  });

  it('has nothing to say for a pre-v2.5 row', () => {
    expect(causeBreakdown({ ...v, legacy: true })).toBeNull();
    expect(causeBreakdown(undefined)).toBeNull();
  });
});
