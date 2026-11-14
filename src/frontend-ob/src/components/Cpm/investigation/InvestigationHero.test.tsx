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
type Over = Partial<Pick<React.ComponentProps<typeof InvestigationHero>, 'latest' | 'basis' | 'limits'>>;
const hero = (matrix: ReturnType<typeof row>, over: Over = {}) => render(
  <MemoryRouter>
    <InvestigationHero matrix={matrix} episode={null} latest={over.latest ?? true} windowKind="12h" timeZone="UTC"
      basis={over.basis ?? null} limits={over.limits ?? { title: 'Limits on this conclusion', lines: [] }} />
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
    // CHG-186: a warning badge beside the cause (tone, glyph and word), no longer " · not confirmed" after it
    const badge = screen.getByText('Not confirmed').closest('.ui-badge')!;
    expect(badge.className).toContain('ui-badge--warning');
    expect(badge.closest('dd')!.textContent).toMatch(/!Not confirmed$/);
  });

  // CHG-160 (owner review): the Result tab; the next check leads the Review tab, and the band names the window
  it('leaves the next check to the Review tab, and names no window', () => {
    const { container } = hero(row(END, { diagnosis: 'CONFIRMED_OSCILLATION', narrative: { selectedFamily: null, statusReason: null, recommendation: 'Retune the controller.' } }));
    expect(screen.queryByText('Retune the controller.')).toBeNull();
    expect(screen.queryByRole('button', { name: /Start with evidence/ })).toBeNull();
    expect(container.textContent).not.toMatch(/Latest window|ends 5 Nov/);
  });

  it('says when the window is an earlier one, in a word', () => {
    hero(row(END, { diagnosis: 'CONFIRMED_OSCILLATION' }), { latest: false });
    expect(screen.getByText('Earlier window')).toBeTruthy();
  });

  it('says what the result rests on, once, and the limits on it', () => {
    hero(row(END, { diagnosis: 'CONFIRMED_OSCILLATION' }), {
      basis: { lead: 'Confirmed from', from: 'sustained oscillation (G5)', items: [{ label: 'sustained oscillation', codes: ['G5'] }], notChecked: ['Something missing'] },
      limits: { title: 'Limits on this conclusion', lines: ['Instrument health not configured'] },
    });
    expect(screen.getByText('sustained oscillation')).toBeTruthy();
    expect(screen.queryByText('Something missing')).toBeNull();
    expect(screen.getByRole('heading', { level: 3, name: 'Limits on this conclusion' })).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Limits on this conclusion' })).getByText('Instrument health not configured')).toBeTruthy();
  });

  // CHG-186 (owner review item 8): "Confirmed from" is a chip per observation: a check, the reason and each gate code apart
  it('shows what confirmed the result as chips, each with its gate codes', () => {
    hero(row(END, { diagnosis: 'CONFIRMED_OSCILLATION' }), {
      basis: {
        lead: 'Confirmed from', from: 'sustained oscillation (G5, G6) · actuator stress', notChecked: [],
        items: [{ label: 'sustained oscillation', codes: ['G5', 'G6'] }, { label: 'actuator stress', codes: [] }],
      },
    });
    const chips = within(screen.getByRole('list', { name: 'Confirmed from' })).getAllByRole('listitem');
    expect(chips.map(c => c.textContent)).toEqual(['✓sustained oscillationG5G6', '✓actuator stress']);
    expect([...chips[0].querySelectorAll('.cpm-inv-chip__code')].map(c => c.textContent)).toEqual(['G5', 'G6']);
    expect(screen.queryByText(/\(G5, G6\)/)).toBeNull();
  });

  it('says the basis as a phrase when there is no observation to list', () => {
    hero(row(END, { diagnosis: 'NORMAL' }), {
      basis: { lead: 'No problem found in', from: 'the performance and symptom checks that ran on this window', items: [], notChecked: [] },
    });
    expect(screen.getByText('No problem found in')).toBeTruthy();
    expect(screen.getByText('the performance and symptom checks that ran on this window')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'No problem found in' })).toBeNull();
  });

  // CHG-186: each limit is a card, its subject the title and the rest the reason, under a heading with the count
  it('shows each thing still unconfirmed as a card with a title and a reason, and counts them', () => {
    hero(row(END, { diagnosis: 'CONFIRMED_OSCILLATION' }), {
      limits: { title: 'What is still unconfirmed', lines: ['Peer interaction (G13): no peer links, so an upstream disturbance is not ruled out', 'Bandwidth limited'] },
    });
    const heading = screen.getByRole('heading', { level: 3, name: 'What is still unconfirmed' });
    expect(heading.parentElement!.textContent).toBe('What is still unconfirmed2');
    const cards = within(screen.getByRole('list', { name: 'What is still unconfirmed' })).getAllByRole('listitem');
    expect(cards.map(c => c.querySelector('.cpm-inv-gap__title')?.textContent)).toEqual(['Peer interaction (G13)', 'Bandwidth limited']);
    expect(cards[0].querySelector('.cpm-inv-gap__reason')?.textContent).toBe('no peer links, so an upstream disturbance is not ruled out');
    expect(cards[1].querySelector('.cpm-inv-gap__reason')).toBeNull();
  });

  // CHG-186: the result and the engine severity each carry their dot, in the tone the rest of the app gives them
  it('puts a dot in the tone of the result before the title, and one in the tone of the severity before it', () => {
    hero(row(END, { diagnosis: 'CONFIRMED_OSCILLATION', severity: 'HIGH' }));
    expect(screen.getByTestId('result-dot').className).toContain('cpm-tone-bad');
    expect(screen.getByTestId('severity-dot').className).toContain('cpm-tone-bad');
    cleanup();
    hero(row(END, { diagnosis: 'INSUFFICIENT_DATA', severity: null }));
    expect(screen.getByTestId('result-dot').className).toContain('cpm-tone-muted');
    expect(screen.queryByTestId('severity-dot')).toBeNull();
  });

  // CHG-186: the three facts are the app's headed tiles (title, then value); Good-error time has its bar
  it('shows the facts as headed tiles, with a bar under Good-error time', () => {
    const { container } = hero(row(END, { diagnosis: 'CONFIRMED_OSCILLATION', confidence: 1, metrics: { good_error_pct: 0.84 } }));
    const tiles = [...container.querySelectorAll('.cpm-inv-hero__facts .cpm-kpicard--headed')];
    expect(tiles.map(t => t.querySelector('.cpm-kpicard__label')?.textContent)).toEqual(['Good-error time', 'Persisting', 'Evidence score']);
    const bar = tiles[0].querySelector<HTMLElement>('.cpm-kpicard__bar > span');
    expect(bar?.style.width).toBe('84%');
    expect(tiles[1].querySelector('.cpm-kpicard__bar')).toBeNull();
  });

  it('shows no limits box when there is nothing to say', () => {
    hero(row(END, { diagnosis: 'CONFIRMED_OSCILLATION' }), { limits: { title: 'What is still unconfirmed', lines: [] } });
    expect(screen.queryByText('What is still unconfirmed')).toBeNull();
  });

  it('keeps the score explanation behind a ?', () => {
    const { container } = hero(row(END, { diagnosis: 'CONFIRMED_OSCILLATION', confidence: 0.9 }));
    expect(container.querySelector('[data-testid="evidence-score-note"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'About Evidence score' }));
    expect(container.querySelector('[data-testid="evidence-score-note"]')).not.toBeNull();
  });
});
