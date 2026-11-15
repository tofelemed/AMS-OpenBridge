// v2.5 workbench: the reading column opens with the answer. CHG-187 (owner review 11.2): the gate's key numbers are KPI cards
// (title, value with its unit, ? tip), each fact once; the sentence went, and a limit on the claim stays as a small flag.
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { VerdictCard } from './VerdictCard';

afterEach(cleanup);

describe('VerdictCard', () => {
  it('draws one KPI card per headline, the unit beside the number and the meaning behind the ?', () => {
    render(<VerdictCard flags={[]}
      headline={[{ label: 'ACF period', value: '290.2', unit: 's', tip: 'Dominant oscillation period, from the autocorrelation.' }, { label: 'Regularity', value: '1.00' }, { label: 'Accepted cycles', value: '33' }]} />);
    expect(screen.getByText('ACF period')).toBeTruthy();
    expect(screen.getByText('290.2 s')).toBeTruthy();
    expect(screen.getByText('33')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'About ACF period' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'About Regularity' })).toBeNull();   // no tip, no ?
    expect(document.querySelectorAll('.cpm-kpicard--headed')).toHaveLength(3);
  });

  it('keeps a limit on the claim as a flag and says no sentence', () => {
    render(<VerdictCard flags={['Limited by the 5 s acquisition grid']} headline={[{ label: 'ACF period', value: '290.2', unit: 's' }]} />);
    expect(screen.getByText('Limited by the 5 s acquisition grid').closest('.ui-badge')).toBeTruthy();
    expect(screen.queryByText(/G5 Oscillation \(ACF\):/)).toBeNull();
  });

  it('reads a word value at text size, not as a figure', () => {
    render(<VerdictCard flags={[]} headline={[{ label: 'Possible cause', value: 'Controller tuning' }]} />);
    expect(screen.getByText('Controller tuning').className).toBe('cpm-kpicard__text');
  });

  it('draws nothing with neither flags nor cards', () => {
    const { container } = render(<VerdictCard flags={[]} headline={[]} />);
    expect(container.textContent).toBe('');
  });
});
