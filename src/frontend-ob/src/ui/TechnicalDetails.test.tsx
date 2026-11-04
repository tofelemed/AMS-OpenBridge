import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TechnicalDetails, type TechnicalDetail } from './TechnicalDetails';

// Read from disk: vitest serves any .css import, ?raw included, as an empty string.
const css = fs.readFileSync(path.resolve('src/ui/technical-details.css'), 'utf8');

const ITEMS: TechnicalDetail[] = [
  { label: 'Run ID', value: 'run-20261104-0007' },
  { label: 'Engine version', value: '2.8.0' },
];

const setClipboard = (value: unknown) =>
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true });

const status = () => screen.getByRole('status', { hidden: true });
const copyButton = (label: string) => screen.getByRole('button', { name: `Copy ${label}`, hidden: true });
const press = async (el: HTMLElement) => { await act(async () => { fireEvent.click(el); }); };

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setClipboard(undefined);
});

describe('TechnicalDetails', () => {
  it('is a native disclosure, collapsed by default and titled "Technical details"', () => {
    const { container } = render(<TechnicalDetails items={ITEMS} />);
    const details = container.querySelector('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    const summary = details.querySelector('summary') as HTMLElement;
    expect(summary.textContent).toBe('Technical details');
    expect(details.firstElementChild).toBe(summary);
  });

  it('lists each label with its value', () => {
    const { container } = render(<TechnicalDetails items={ITEMS} />);
    expect([...container.querySelectorAll('dt')].map(d => d.textContent)).toEqual(['Run ID', 'Engine version']);
    const first = container.querySelector('dd') as HTMLElement;
    expect(first.textContent).toContain('run-20261104-0007');
  });

  it('gives each value a real button named for it, with no title attribute', () => {
    const { container } = render(<TechnicalDetails items={ITEMS} />);
    const b = copyButton('Run ID');
    expect(b.tagName).toBe('BUTTON');
    expect(b.getAttribute('type')).toBe('button');
    expect(copyButton('Engine version')).toBeTruthy();
    expect(container.querySelector('[title]')).toBeNull();
  });

  it('copies the exact value and announces it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    render(<TechnicalDetails items={ITEMS} />);
    await press(copyButton('Run ID'));
    expect(writeText).toHaveBeenCalledWith('run-20261104-0007');
    expect(status().textContent).toBe('Run ID copied');
  });

  it('copies a numeric value as text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    render(<TechnicalDetails items={[{ label: 'Rule version', value: 1 }]} />);
    await press(copyButton('Rule version'));
    expect(writeText).toHaveBeenCalledWith('1');
  });

  it('has the live region in place before anything is copied', () => {
    render(<TechnicalDetails items={ITEMS} />);
    expect(status().getAttribute('aria-live')).toBe('polite');
    expect(status().textContent).toBe('');
  });

  it('says the copy failed where the clipboard API is unavailable', async () => {
    setClipboard(undefined);
    render(<TechnicalDetails items={ITEMS} />);
    await press(copyButton('Run ID'));
    expect(status().textContent).toBe('Copy failed: Run ID');
  });

  it('says the copy failed when the browser refuses it', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    render(<TechnicalDetails items={ITEMS} />);
    await press(copyButton('Engine version'));
    expect(status().textContent).toBe('Copy failed: Engine version');
  });

  it('clears the message after a moment', async () => {
    vi.useFakeTimers();
    setClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });
    render(<TechnicalDetails items={ITEMS} />);
    await press(copyButton('Run ID'));
    expect(status().textContent).toBe('Run ID copied');
    act(() => { vi.advanceTimersByTime(3000); });
    expect(status().textContent).toBe('');
  });

  it('sets values in monospace unless told otherwise', () => {
    render(<TechnicalDetails items={[...ITEMS, { label: 'Stage', value: 'Long', mono: false }]} />);
    expect(screen.getByText('run-20261104-0007').className).toBe('ui-technical__mono');
    expect(screen.getByText('Long').className).toBe('');
  });

  it('says Not available for a missing value and offers nothing to copy, but treats 0 as a value', () => {
    render(<TechnicalDetails items={[{ label: 'Bundle', value: null }, { label: 'Topic', value: '' }, { label: 'Count', value: 0 }]} />);
    expect(screen.getAllByText('Not available').length).toBe(2);
    expect(screen.queryByRole('button', { name: 'Copy Bundle', hidden: true })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy Topic', hidden: true })).toBeNull();
    expect(copyButton('Count')).toBeTruthy();
  });

  it('renders nothing with nothing to list', () => {
    const { container } = render(<TechnicalDetails items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('technical-details.css', () => {
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');

  it('uses Traverse tokens only, with no fallbacks and no literal colours or font sizes', () => {
    expect(rules.length).toBeGreaterThan(500);
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(rules).not.toMatch(/\b(?:rgba?|hsla?|oklch)\(/);
    expect(rules).not.toMatch(/var\([^)]*,/);
    expect(rules).not.toMatch(/font-size:\s*[\d.]/);
    for (const [, name] of rules.matchAll(/var\((--[a-z0-9-]+)\)/g)) expect(name.startsWith('--traverse-')).toBe(true);
  });

  it('gives the summary a 40 px height and the 2 px ring with a 3 px gap, and values the mono font', () => {
    expect(rules).toMatch(/\.ui-technical__summary \{[^}]*min-height: var\(--traverse-size-control-min-height\)/);
    expect(rules).toContain('outline: var(--traverse-focus-width) solid var(--traverse-focus)');
    expect(rules).toContain('outline-offset: var(--traverse-focus-offset)');
    expect(rules).toContain('font-family: var(--traverse-font-mono)');
  });
});
