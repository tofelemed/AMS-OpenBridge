// v2.5 Task 1E.2 — the hypothesis panel renders the SERVED verdict v2 and never re-derives
// a score, a cap or a confirmation; a pre-v2.5 row renders as LEGACY family scores.
import React from 'react';
import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { CpmVerdictV2 } from '../../../api/cpm/verdict';
import { HypothesisPanel } from './HypothesisPanel';

const v2: CpmVerdictV2 = {
  legacy: false,
  observations: {
    LAG_ASYMMETRY: { present: true, score: 0.9, methodId: 'XCORR_ASYMMETRY_V1', role: 'SUPPORTING', basis: 'G8=STRONG' },
    SHAPE_TRIANGULARITY: { present: true, score: 0.95, methodId: 'G7.SINE_TRIANGLE_SHAPE', role: 'PRIMARY', basis: 'G7=STRONG' },
  },
  hypotheses: {
    STICTION: { score: 0.95, state: 'QUALIFIED', evidenceGroups: ['SHAPE_TRIANGULARITY', 'LAG_ASYMMETRY'], contradictions: [], disqualifiers: [] },
    OSCILLATION_TUNING: { score: 0.9, state: 'QUALIFIED', evidenceGroups: ['OSCILLATION'], contradictions: [], disqualifiers: [] },
    EXCESSIVE_EFFORT: { score: 0, state: 'DISQUALIFIED', evidenceGroups: ['ACTUATOR_STRESS'], contradictions: [], disqualifiers: [] },
  },
  leadingHypothesis: 'STICTION',
  confirmation: {
    claimType: 'FINAL_ELEMENT_NON_FOLLOWING', state: 'NOT_CONFIRMED', reason: 'NO_VP',
    positiveEvidenceIds: [], contradictions: [], scope: 'VP tracking of OP demand over the evaluated support',
    nonFollowingDwellS: 0, trackingErrorP95Pp: 0, confirmedAtMs: 0,
  },
  scoreSemantics: 'EVIDENCE_SCORE_UNCALIBRATED',
  resultRevision: 1,
};

describe('HypothesisPanel', () => {
  // vitest does not auto-cleanup without the globals flag; each test starts from an empty DOM.
  afterEach(cleanup);

  it('marks the served leading hypothesis and lists each mechanism with its evidence', () => {
    render(<HypothesisPanel verdict={v2} metrics={{}} />);
    const stiction = screen.getByTestId('hypothesis-STICTION');
    expect(stiction.textContent).toContain('LEADING');
    expect(stiction.textContent).toContain('Triangular OP waveform');
    expect(screen.getByTestId('hypothesis-EXCESSIVE_EFFORT').textContent).toContain('DISQUALIFIED');
    expect(screen.getByTestId('hypothesis-OSCILLATION_TUNING').textContent).not.toContain('LEADING');
  });

  it('shows the method behind each observation and its role', () => {
    render(<HypothesisPanel verdict={v2} metrics={{}} />);
    const lag = screen.getByTestId('observation-LAG_ASYMMETRY');
    expect(lag.textContent).toContain('XCORR_ASYMMETRY_V1');
    expect(lag.textContent).toContain('SUPPORTING');
  });

  it('renders the served confirmation state and never a hard-coded cap', () => {
    const { container } = render(<HypothesisPanel verdict={v2} metrics={{}} />);
    expect(screen.getByTestId('confirmation-prose').textContent).toContain('cannot confirm a final-element fault');
    expect(container.textContent).toContain('NOT CONFIRMED');
    expect(container.textContent).not.toContain('0.89');
    expect(container.textContent).toContain('not probabilities');
  });

  it('renders a pre-v2.5 row as LEGACY family scores without inventing hypotheses', () => {
    const legacy: CpmVerdictV2 = {
      ...v2, legacy: true, observations: {}, hypotheses: {}, leadingHypothesis: null,
      confirmation: { ...v2.confirmation, state: 'LEGACY_FLAG_ONLY', reason: 'PRE_V25_ROW' },
      scoreSemantics: 'LEGACY', resultRevision: 0,
    };
    const { container } = render(<HypothesisPanel verdict={legacy} metrics={{ stiction_family_score: 0.8, fft_score: 0.4 }} />);
    expect(container.textContent).toContain('LEGACY');
    expect(container.textContent).toContain('Stiction family');
    expect(container.textContent).toContain('LEGACY_FLAG_ONLY');
    expect(container.querySelector('[data-testid^="hypothesis-"]')).toBeNull();
  });
});
