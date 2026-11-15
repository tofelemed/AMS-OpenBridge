// @vitest-environment jsdom
/** CHG-127: the Overview card shows its label, icon and number; the detail waits on hover and the whole card opens the list. */
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { KpiCard } from './KpiCard';
import { trendSourceText } from '../trend/evaluatedWindow';

afterEach(cleanup);

const Icon = () => <i data-testid="icon" />;

const card = (extra: Partial<React.ComponentProps<typeof KpiCard>> = {}) => render(
  <MemoryRouter>
    <KpiCard headed Icon={Icon} value={165} label="Stale" sub="68 % of monitored" tone="warn"
      to="/cpm/kpis/stale" title="Rule." {...extra} />
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

  it('is one link to the drill-down, with the share and rule on hover', () => {
    card();
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/cpm/kpis/stale');
    const tip = screen.getByRole('tooltip', { hidden: true });
    expect(link.getAttribute('aria-describedby')).toBe(tip.id);
    expect(tip.textContent).toContain('68 % of monitored');
    expect(tip.textContent).toContain('Rule.');
  });

  it('shows no change since 24 h ago, on the card or on hover (CHG-155)', () => {
    const { container } = card();
    expect(container.querySelector('.cpm-kpicard__delta')).toBeNull();
    expect(container.textContent).not.toMatch(/\bpp\b/);
  });

  it('colours the icon by what it means', () => {
    const { container } = card({ iconTone: 'warn' });
    expect(container.querySelector('.cpm-kpicard__icon--warn')).not.toBeNull();
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

  // CHG-186 (owner review item 8): with no link and no dialog, the headed card is a plain tile with its explanation behind a ?
  it('is a plain tile without a link or a dialog: title, ? tip, value and bar, and no icon unless given', () => {
    const { container } = render(<MemoryRouter><KpiCard headed value="84 %" label="Good-error time" bar={84} tip={<p>What it means.</p>} /></MemoryRouter>);
    expect(screen.queryByRole('link')).toBeNull();
    expect(container.querySelector('.cpm-kpicard--tile .cpm-kpicard__icon')).toBeNull();
    expect(container.querySelector<HTMLElement>('.cpm-kpicard__bar > span')?.style.width).toBe('84%');
    expect(screen.queryByText('What it means.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'About Good-error time' }));
    expect(screen.getByText('What it means.')).toBeTruthy();
    const text = container.textContent ?? '';
    expect(text.indexOf('Good-error time')).toBeLessThan(text.indexOf('84 %'));
  });

  // CHG-192 (carried from CHG-185): a button is laid out as one box, so a title inside it pushed the ? onto a line of its own
  it('keeps the title as plain text beside its ?, the opener being a card-wide button named by the title', () => {
    const open = vi.fn();
    const { container } = render(<MemoryRouter><KpiCard headed Icon={Icon} value="—" label="Time in normal mode" sub="Share." onOpen={open} /></MemoryRouter>);
    const opener = screen.getByRole('button', { name: 'Time in normal mode' });
    expect(opener.textContent).toBe('');
    expect(opener.getAttribute('aria-haspopup')).toBe('dialog');
    const title = container.querySelector('.cpm-kpicard__title') as HTMLElement;
    expect(title.querySelector('button.cpm-kpicard__opener')).toBeNull();
    expect(title.querySelector('.cpm-kpicard__label')?.textContent).toBe('Time in normal mode?');
    // the last word and the ? never part
    const tail = title.querySelector('.cpm-kpicard__tail') as HTMLElement;
    expect(tail.firstChild?.textContent).toBe('mode');
    expect(tail.lastElementChild?.className).toContain('ui-toggletip');
    // Tab reaches the opener before the ?
    const buttons = Array.from(container.querySelectorAll('button')).map(b => b.getAttribute('aria-label') ?? b.textContent);
    expect(buttons.indexOf('Time in normal mode')).toBe(0);
    expect(buttons.indexOf('About Time in normal mode')).toBe(1);
    fireEvent.click(opener);
    expect(open).toHaveBeenCalled();
  });

  it('never breaks between the last word of the title and its ?, while the title still wraps between words', () => {
    const css = readFileSync(join(__dirname, '../../../styles/cpm-explorer.css'), 'utf8');
    expect(css).toMatch(/\.cpm-kpicard__tail \{ white-space: nowrap; \}/);
    expect(css).toMatch(/\.cpm-kpicard__opener \{[^}]*position: absolute; inset: 0;/);
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
