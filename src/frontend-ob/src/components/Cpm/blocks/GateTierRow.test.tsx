// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { GateTierRow } from './GateTierRow';

afterEach(cleanup);

const ALL = ['G0', 'G1', 'G2', 'G2r', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12', 'G13', 'G14', 'G15'];

describe('GateTierRow', () => {
  it('groups gates under their five tiers', () => {
    render(<GateTierRow gates={ALL} tile={g => <button>{g}</button>} />);
    expect(screen.getAllByRole('heading').map(h => h.textContent)).toEqual([
      'Eligibility', 'Performance', 'Diagnostic evidence', 'Confirmation', 'Fusion',
    ]);
    expect(within(screen.getByRole('group', { name: 'Performance' })).getAllByRole('button').map(b => b.textContent)).toEqual(['G3', 'G4']);
  });

  it('shows all 17 tiles, once each', () => {
    render(<GateTierRow gates={ALL} tile={g => <button>{g}</button>} />);
    expect(screen.getAllByRole('button')).toHaveLength(17);
  });

  it('shows only the tiers the engine served', () => {
    render(<GateTierRow gates={['G3', 'G15']} tile={g => <span>{g}</span>} />);
    expect(screen.getAllByRole('heading').map(h => h.textContent)).toEqual(['Performance', 'Fusion']);
  });

  it('never drops a gate it does not know', () => {
    render(<GateTierRow gates={['G3', 'G99']} tile={g => <span>{g}</span>} />);
    expect(screen.getByText('G99')).toBeTruthy();
  });
});
