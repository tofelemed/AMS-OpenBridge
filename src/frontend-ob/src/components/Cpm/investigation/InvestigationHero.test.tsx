// @vitest-environment jsdom
// CHG-141: the result card. The title is this window's result; an older verdict is named as older, with its age.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { row } from '../evidence/windowFixtures';
import { InvestigationHero } from './InvestigationHero';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
afterEach(cleanup);

const END = '2026-11-05T10:15:00Z';
const hero = (matrix: ReturnType<typeof row>, over: { latest?: boolean; onStart?: () => void } = {}) => render(
  <MemoryRouter>
    <InvestigationHero matrix={matrix} episode={null} latest={over.latest ?? true} windowKind="12h" timeZone="UTC" onStart={over.onStart ?? (() => {})} />
  </MemoryRouter>);

describe('InvestigationHero', () => {
  it('shows the result, its cause, engine severity and three facts', () => {
    hero(row(END, { diagnosis: 'CONFIRMED_OSCILLATION', severity: 'HIGH', confidence: 1, metrics: { good_error_pct: 0.13 } }));
    expect(screen.getByRole('heading', { level: 2, name: 'Oscillation confirmed' })).toBeTruthy();
    expect(screen.getByText('Not established')).toBeTruthy();
    expect(screen.getByText('Engine severity')).toBeTruthy();
    expect(screen.getByText('High')).toBeTruthy();
    expect(screen.getByText('13 %')).toBeTruthy();
    expect(screen.getByText('No open episode')).toBeTruthy();
    expect(screen.getByText('100')).toBeTruthy();
  });

  it('never titles a window with an older verdict: it names that verdict as older', () => {
    hero(row(END, {
      diagnosis: 'INSUFFICIENT_DATA',
      lastVerdict: { windowKind: '12h', windowStart: null, windowEnd: null, diagnosis: 'CONFIRMED_OSCILLATION', severity: 'HIGH', confidence: 1, ageMs: 48 * 3600_000, insufficientEvidenceReason: null, methodRunIds: {}, computedAt: END },
    }));
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Not evaluated: not enough data');
    expect(screen.getByText(/^Last verdict /).textContent).toMatch(/Oscillation confirmed.*2 days ago/);
  });

  it('names an older verdict as older on an excluded window too', () => {
    hero(row(END, {
      diagnosis: 'EXCLUDED_MODE',
      lastVerdict: { windowKind: '12h', windowStart: null, windowEnd: null, diagnosis: 'CONFIRMED_OSCILLATION', severity: 'HIGH', confidence: 1, ageMs: 48 * 3600_000, insufficientEvidenceReason: null, methodRunIds: {}, computedAt: END },
    }));
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Excluded: loop not in automatic');
    expect(screen.getByText(/^Last verdict /).textContent).toMatch(/Oscillation confirmed.*2 days ago/);
  });

  it('has no eyebrow saying Final conclusion and no no-verdict pill', () => {
    const { container } = hero(row(END, { diagnosis: 'INSUFFICIENT_DATA' }));
    expect(container.textContent).not.toMatch(/final conclusion/i);
    expect(container.textContent).not.toMatch(/no verdict/i);
  });

  it('marks a leading cause as not confirmed', () => {
    hero(row(END, {
      diagnosis: 'SUSPECTED_FINAL_ELEMENT_NONLINEARITY',
      verdictV2: { leadingHypothesis: 'STICTION', confirmation: { state: 'NOT_CONFIRMED' } } as unknown as ReturnType<typeof row>['verdictV2'],
    }));
    expect(screen.getByText(/not confirmed/)).toBeTruthy();
  });

  it('puts the next check in the bar and starts the evidence from it', () => {
    const onStart = vi.fn();
    hero(row(END, { diagnosis: 'CONFIRMED_OSCILLATION', narrative: { selectedFamily: null, statusReason: null, recommendation: 'Retune the controller.' } }), { onStart });
    const bar = screen.getByRole('group', { name: 'Next check' });
    expect(within(bar).getByText('Retune the controller.')).toBeTruthy();
    fireEvent.click(within(bar).getByRole('button', { name: 'Start with evidence ↓' }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('says when the window is an earlier one', () => {
    hero(row(END, { diagnosis: 'CONFIRMED_OSCILLATION' }), { latest: false });
    expect(screen.getByText(/^Earlier window · 12 h · ends /)).toBeTruthy();
  });

  it('keeps the score explanation behind a ?', () => {
    const { container } = hero(row(END, { diagnosis: 'CONFIRMED_OSCILLATION', confidence: 0.9 }));
    expect(screen.getByRole('button', { name: /Evidence score/ })).toBeTruthy();
    expect(container.querySelector('[data-testid="evidence-score-note"]')).toBeNull();
  });
});
