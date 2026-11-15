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
