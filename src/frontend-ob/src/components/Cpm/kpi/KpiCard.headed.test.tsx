// @vitest-environment jsdom
/** CHG-127: the Overview card shows its label, icon and number; the detail waits on hover and the whole card opens the list. */
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
      to="/cpm/kpis/stale" title="Rule."
      delta={{ direction: 'up', text: '+4 pp', good: false, title: 'was 64 %', points: 4 }} {...extra} />
  </MemoryRouter>,
);

describe('headed KPI card', () => {
  it('reads label then number, with no explanation or link text on the card', () => {
    const { container } = card();
    const shown = container.querySelector('a')!.cloneNode(true) as HTMLElement;
    shown.querySelector('.cpm-kpicard__tip')!.remove();
    const text = shown.textContent ?? '';
    expect(text.indexOf('Stale')).toBeLessThan(text.indexOf('165'));
    expect(text).not.toContain('68 % of monitored');
    expect(text).not.toContain('View loops');
  });

  it('is one link to the drill-down, with the share, change and rule on hover', () => {
    card();
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/cpm/kpis/stale');
    const tip = screen.getByRole('tooltip', { hidden: true });
    expect(link.getAttribute('aria-describedby')).toBe(tip.id);
    expect(tip.textContent).toContain('68 % of monitored');
    expect(tip.textContent).toContain('was 64 %');
    expect(tip.textContent).toContain('Rule.');
  });

  it('shows the change on the card only when it moved', () => {
    const { container } = card({ delta: { direction: 'flat', text: '±0 pp', good: null, title: 'no change', points: 0 } });
    expect(container.querySelector('.cpm-kpicard__figure .cpm-kpicard__delta')).toBeNull();
    cleanup();
    const moved = card();
    expect(moved.container.querySelector('.cpm-kpicard__figure .cpm-kpicard__delta')).not.toBeNull();
  });

  it('colours the icon by what it means', () => {
    const { container } = card({ iconTone: 'warn' });
    expect(container.querySelector('.cpm-kpicard__icon--warn')).not.toBeNull();
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

  it('keeps the share on hover when there is no change to report', () => {
    card({ delta: null });
    expect(screen.getByRole('tooltip', { hidden: true }).textContent).toContain('68 % of monitored');
  });
});

describe('Explorer source line', () => {
  it('names the evaluated window when the trend is pinned to it', () => {
    expect(trendSourceText(true, 'A', 'B')).toBe('Evaluated window A → B');
  });

  it('says the plain range is not one', () => {
    expect(trendSourceText(false, 'A', 'B')).toBe('Not an evaluated window');
  });
});
