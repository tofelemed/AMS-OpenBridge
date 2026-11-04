// @vitest-environment jsdom
/** CHG-119: the Overview card keeps everything the compact card shows, and its drill-down. */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { KpiCard } from './KpiCard';
import { trendSourceText } from '../trend/evaluatedWindow';

afterEach(cleanup);

const Icon = () => <i data-testid="icon" />;

const card = (extra: Partial<React.ComponentProps<typeof KpiCard>> = {}) => render(
  <MemoryRouter>
    <KpiCard headed Icon={Icon} value={165} label="Stale" sub="68 % of monitored" tone="warn"
      to="/cpm/kpis/stale" title="Rule. Open to see every loop and why."
      delta={{ direction: 'up', text: '+4 pp', good: false, title: 'was 64 %', points: 4 }} {...extra} />
  </MemoryRouter>,
);

describe('headed KPI card', () => {
  it('reads label, number, share, change, then the link', () => {
    const { container } = card();
    const text = container.textContent ?? '';
    const order = ['Stale', '165', '68 % of monitored', '+4 pp', 'View loops'].map(t => text.indexOf(t));
    expect(order.every(i => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('is one link to the drill-down, with the rule on hover', () => {
    card();
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/cpm/kpis/stale');
    expect(link.getAttribute('title')).toBe('Rule. Open to see every loop and why.');
  });

  it('keeps the change colour and its spoken direction', () => {
    const { container } = card();
    expect(container.querySelector('.cpm-kpicard__delta--bad')).not.toBeNull();
    expect(container.textContent).toContain('up +4 pp');
  });

  it('keeps the tone edge', () => {
    const { container } = card();
    expect(container.querySelector('.cpm-kpicard--warn.cpm-kpicard--headed')).not.toBeNull();
  });

  it('promises no link when the card has none', () => {
    const { container } = card({ to: undefined });
    expect(screen.queryByRole('link')).toBeNull();
    expect(container.textContent).not.toContain('View loops');
  });

  it('shows no separator without a change', () => {
    const { container } = card({ delta: null });
    expect(container.querySelector('.cpm-kpicard__sub')?.textContent).toBe('68 % of monitored');
  });
});

describe('Explorer source line', () => {
  it('names the evaluated window when the trend is pinned to it', () => {
    expect(trendSourceText(true, 'A', 'B')).toBe('Evaluated window A → B');
  });

  it('says the plain range is not one', () => {
    expect(trendSourceText(false, 'A', 'B')).toBe('Trend range A → B, not an evaluated window');
  });
});
