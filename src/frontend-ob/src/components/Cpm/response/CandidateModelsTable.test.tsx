// CHG-193 (owner decision 15 Nov 2026, A2): the candidate models' flags and the delay uncertainty row in words, not kernel codes.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { decoded } from '../evidence/views/fixtures';
import { CandidateModelsTable } from './CandidateModelsTable';

vi.mock('echarts-for-react', () => ({ default: () => React.createElement('div') }));
afterEach(cleanup);

describe('CandidateModelsTable', () => {
  it('names the identifiability flags and the delay uncertainty in words', () => {
    const table = decoded({ gate: 'G12', kind: 'candidate_models', x: [0], y: [0.4], provenance: {
      state: 'ESTIMATED', rows: 'FOPDT(OP: process_gain=1.2,dead_time=30) bounds_hit=true flat_delay=true sign_uncertain=true cond=12.5',
    } });
    const intervals = decoded({ gate: 'G12', kind: 'parameter_intervals', x: [0], y: [0.1], provenance: { parameters: 'process_gain', theta_uncertainty_s: '5' } });
    render(<CandidateModelsTable table={table} delayCurve={undefined} intervals={intervals} rejections={undefined} />);
    for (const word of ['Flat delay', 'Bounds hit', 'Sign uncertain']) expect(screen.getByText(word)).toBeTruthy();
    expect(screen.getByText('Delay uncertainty')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/FLAT_DELAY|BOUNDS_HIT|SIGN_UNCERTAIN|theta_uncertainty_s/);
  });
});

// CHG-197 (owner rule "technical text should be removed", as CHG-193 / CHG-195): Fit quality in plain words; CSV keys unchanged
describe('CandidateModelsTable in plain words', () => {
  const table = decoded({ gate: 'G12', kind: 'candidate_models', x: [0, 1], y: [0.4, 0.9], yUnit: 'PV_EU^2', provenance: {
    state: 'ESTIMATED', rows: 'FOPDT(OP_TO_PV: gain=3.0, theta=4.0, tau=20.0, tau2=NaN, zeta=NaN, wn=NaN) bounds_hit=false flat_delay=false sign_uncertain=false cond=10.5;'
      + 'IPDT(OP_TO_PV: gain=0.004, theta=30.0, tau=NaN, tau2=NaN, zeta=NaN, wn=NaN) bounds_hit=false flat_delay=false sign_uncertain=false cond=3.2',
  } });
  const intervals = decoded({ gate: 'G12', kind: 'parameter_intervals', x: [0, 1], y: [0.1, 2], yUnit: 'parameter_units', provenance: { parameters: 'process_gain;dead_time', method: 'COVARIANCE', theta_uncertainty_s: '5' } });
  const rejections = decoded({ gate: 'G12', kind: 'rejection_reasons', x: [0], y: [0], provenance: { reasons: 'ESTIMATION:NOT_ESTIMATED:NO_EXCITATION' } });
  const curve = decoded({ gate: 'G12', kind: 'delay_objective_curve', x: [0, 10], y: [3, 1] });

  it('names the models, paths, parameters and states in words', () => {
    render(<CandidateModelsTable table={table} delayCurve={curve} intervals={intervals} rejections={rejections} pvUnit="m3/h" />);
    const text = document.body.textContent ?? '';
    for (const words of ['First order with dead time', 'Integrating with dead time', 'OP → PV', 'Gain 3', 'Dead time 4 s', 'Time constant 20 s',
      'Condition number 10.5', 'Estimated', 'Covariance', 'Process gain', 'Standard error', 'Delay search (best candidate)', 'Step D']) expect(text).toContain(words);
    expect(text).not.toMatch(/Subgate|Kernel|ESTIMATED|COVARIANCE|OP_TO_PV|theta=|gain=|cond=|PV_EU|process_gain|parameter_units|std\. error|J\(θ\)/);
    const reasons = screen.getByRole('list', { name: 'Rejection reasons' }).textContent ?? '';
    expect(reasons).not.toMatch(/[A-Z]{2,}_|:/);
  });
});
