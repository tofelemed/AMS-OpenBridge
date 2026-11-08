// @vitest-environment jsdom
// CHG-156: How to read is laid out in two titled parts: the gate symbols as a key (group, then its marks) and the steps,
// with the peer-link note last.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { HowToReadDialog } from './HowToReadDialog';
import type { CpmFleetSummary } from '../../../api/cpmApi';

afterEach(cleanup);

const summary = { capability: { loopsWithoutDisturbanceContext: 239 } } as CpmFleetSummary;

describe('HowToReadDialog', () => {
  it('shows the key and the steps under their own headings', () => {
    render(<HowToReadDialog open onClose={() => {}} summary={summary} />);
    const d = screen.getByRole('dialog', { name: 'How to read' });
    expect(within(d).getByRole('heading', { name: 'Gate symbols' })).toBeTruthy();
    expect(within(d).getByRole('heading', { name: 'Using this page' })).toBeTruthy();
    expect(within(d).getAllByRole('listitem')).toHaveLength(3);
    expect(within(d).getByText(/239 loops have no peer links/)).toBeTruthy();
  });

  it('lays the key out as terms and their marks', () => {
    render(<HowToReadDialog open onClose={() => {}} />);
    const key = screen.getByRole('dialog').querySelector('dl.cpm-gate-legend--key')!;
    expect(Array.from(key.querySelectorAll('dt')).map(t => t.textContent)).toEqual(['Checks', 'Window', 'Symptoms', 'Result', 'No result']);
    expect(key.querySelectorAll('dd')).toHaveLength(5);
  });
});
