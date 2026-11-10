// @vitest-environment jsdom
// CHG-141: Why this result. Five cards; the chosen card fills the panel with its gates, each opening to its reason. CHG-160: the Evidence tab; the
// basis and the limits moved to the Result tab.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CpmGateCell } from '../../../api/cpm/gates';
import { row } from '../evidence/windowFixtures';
import { WhyResult } from './WhyResult';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
afterEach(cleanup);

const END = '2026-11-05T10:15:00Z';
const cell = (key: string, status: string, reason: string | null = null): CpmGateCell => ({ key, name: key, tier: 'short', status, reason });
const matrix = row(END, { diagnosis: 'EXCLUDED_MODE', gates: [cell('G0', 'PASS'), cell('G1', 'EXCLUDED', 'MODE_MANUAL'), cell('G2', 'PASS'), cell('G2r', 'PASS')] });

type Props = Partial<React.ComponentProps<typeof WhyResult>>;
const why = (over: Props = {}) => {
  const fn = { onTier: vi.fn(), onGate: vi.fn(), onProof: vi.fn(), onAllGates: vi.fn() };
  render(
    <MemoryRouter>
      <WhyResult matrix={matrix} tier="Eligibility" gate={null} {...fn} {...over}>
        <p>the trend</p>
      </WhyResult>
    </MemoryRouter>);
  return fn;
};

describe('WhyResult', () => {
  it('shows five cards, each with its summary, and marks the chosen one', () => {
    why();
    const cards = within(screen.getByRole('group', { name: 'Evidence groups' })).getAllByRole('button');
    expect(cards).toHaveLength(5);
    expect(cards[0].textContent).toContain('Eligibility');
    expect(cards[0].textContent).toContain('G1 · Excluded');
    expect(cards[0].getAttribute('aria-pressed')).toBe('true');
    expect(cards[1].getAttribute('aria-pressed')).toBe('false');
  });

  it('asks for the card that was clicked', () => {
    const fn = why();
    fireEvent.click(screen.getByRole('button', { name: /^Fusion/ }));
    expect(fn.onTier).toHaveBeenCalledWith('Fusion');
  });

  it('fills the panel with the gates of the chosen card', () => {
    why();
    expect(screen.getByRole('heading', { level: 2, name: 'Eligibility' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^G0 · Data quality/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^G2r · Operating region/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^G5 ·/ })).toBeNull();
  });

  it('opens and closes a gate', () => {
    const fn = why();
    const g1 = screen.getByRole('button', { name: /^G1 · Mode \/ service/ });
    expect(g1.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(g1);
    expect(fn.onGate).toHaveBeenCalledWith('G1');
    cleanup();
    const again = why({ gate: 'G1' });
    fireEvent.click(screen.getByRole('button', { name: /^G1 · Mode \/ service/ }));
    expect(again.onGate).toHaveBeenCalledWith(null);
  });

  it('shows an opened gate\'s reason and its proof', () => {
    const fn = why({ gate: 'G1' });
    const panel = screen.getByRole('region', { name: 'Gates of this group' });
    expect(within(panel).getByText('Mode manual.')).toBeTruthy();
    fireEvent.click(within(panel).getByRole('button', { name: 'G1 proof ↗' }));
    expect(fn.onProof).toHaveBeenCalledWith('G1');
  });

  it('opens Calculation proof on the first gate when none is open', () => {
    const fn = why();
    fireEvent.click(screen.getByRole('button', { name: 'Calculation proof ↗' }));
    expect(fn.onProof).toHaveBeenCalledWith('G0');
  });

  it('opens all the gates, counted', () => {
    const fn = why();
    expect(screen.getByRole('heading', { level: 2, name: 'Gates by stage' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'All 4 gates →' }));
    expect(fn.onAllGates).toHaveBeenCalledTimes(1);
  });

  it('leaves the limits to the Result tab', () => {
    why();
    expect(screen.queryByText('Limits on this conclusion')).toBeNull();
  });

  it('holds the left column it is given', () => {
    why();
    expect(screen.getByText('the trend')).toBeTruthy();
  });
});
