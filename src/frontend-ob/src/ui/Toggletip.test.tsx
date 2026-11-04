import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { helpFor } from '../help/registry';
import { Toggletip, placeToggletip } from './Toggletip';

vi.mock('../help/registry', async original => {
  const real = await original<typeof import('../help/registry')>();
  return {
    ...real,
    helpFor: (id: string) => (id === 'APPROVED'
      ? { ...real.helpFor('M-001'), id, status: 'approved', unit: '' }
      : real.helpFor(id)),
  };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Read from disk: vitest serves any .css import, ?raw included, as an empty string.
const css = fs.readFileSync(path.resolve('src/ui/toggletip.css'), 'utf8');

const NAME = 'About Time in normal mode';
const renderTip = (ui: React.ReactElement, url = '/cpm') => render(<MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>);
const tip = <Toggletip metric="M-001" label="Time in normal mode" />;
const button = (name = NAME) => screen.getByRole('button', { name });
const panel = () => screen.queryByRole('group', { name: NAME });
const root = () => button().parentElement as HTMLElement;
const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

describe('Toggletip button', () => {
  it('is a real button naming what it explains', () => {
    renderTip(tip);
    const b = button();
    expect(b.tagName).toBe('BUTTON');
    expect(b.getAttribute('type')).toBe('button');
    expect(b.getAttribute('aria-expanded')).toBe('false');
    expect(b.getAttribute('aria-controls')).toBeTruthy();
  });

  it('falls back to the registry name', () => {
    renderTip(<Toggletip metric="M-001" />);
    expect(button('About Monitored loops')).toBeTruthy();
  });

  it('opens on click, ties the panel to aria-controls, and closes on the next click', () => {
    renderTip(tip);
    expect(panel()).toBeNull();
    fireEvent.click(button());
    expect(button().getAttribute('aria-expanded')).toBe('true');
    expect(panel()?.id).toBe(button().getAttribute('aria-controls'));
    expect(document.activeElement).toBe(button());
    fireEvent.click(button());
    expect(button().getAttribute('aria-expanded')).toBe('false');
    expect(panel()).toBeNull();
  });

  it('leaves Enter and Space to the native button, so a browser activates it once', () => {
    renderTip(tip);
    // jsdom does not turn these keys into a click. Not preventing them is what lets a browser do it.
    expect(fireEvent.keyDown(button(), { key: 'Enter' })).toBe(true);
    expect(fireEvent.keyDown(button(), { key: ' ' })).toBe(true);
    expect(panel()).toBeNull();
  });

  it('does not open on focus alone', () => {
    renderTip(tip);
    act(() => button().focus());
    expect(panel()).toBeNull();
  });

  it('renders no button for an unknown id with nothing to show, and does not throw', () => {
    const { container } = renderTip(<Toggletip metric="M-999" label="Ghost" />);
    expect(container.querySelector('button')).toBeNull();
  });

  it('never uses a title attribute, open or closed', () => {
    const { container } = renderTip(tip);
    fireEvent.click(button());
    expect(container.querySelector('[title]')).toBeNull();
  });
});

describe('Toggletip ? variant', () => {
  const howTo = <Toggletip><p>Read the bars left to right.</p></Toggletip>;

  it('takes free content under "How to read this view"', () => {
    renderTip(howTo);
    fireEvent.click(button('How to read this view'));
    const group = screen.getByRole('group', { name: 'How to read this view' });
    expect(group.textContent).toContain('Read the bars left to right.');
    expect(group.querySelector('a')).toBeNull();
    expect(group.textContent).not.toContain('As implemented');
  });

  it('shows free content even when the id is unknown', () => {
    renderTip(<Toggletip metric="M-999"><p>Fallback</p></Toggletip>);
    fireEvent.click(button('How to read this view'));
    expect(screen.getByText('Fallback')).toBeTruthy();
  });

  it('accepts its own label', () => {
    renderTip(<Toggletip label="How the score works"><p>Text</p></Toggletip>);
    expect(button('How the score works')).toBeTruthy();
  });
});

describe('Toggletip hover', () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it('opens after 300 ms and not before', () => {
    renderTip(tip);
    fireEvent.mouseEnter(root());
    wait(299);
    expect(panel()).toBeNull();
    wait(1);
    expect(panel()).toBeTruthy();
  });

  it('does not open when the pointer leaves first', () => {
    renderTip(tip);
    fireEvent.mouseEnter(root());
    wait(200);
    fireEvent.mouseLeave(root());
    wait(1000);
    expect(panel()).toBeNull();
  });

  it('closes after the pointer leaves, with time to cross to the panel', () => {
    renderTip(tip);
    fireEvent.mouseEnter(root());
    wait(300);
    fireEvent.mouseLeave(root());
    expect(panel()).toBeTruthy();
    wait(1000);
    expect(panel()).toBeNull();
  });

  it('stays while the pointer is over the panel', () => {
    renderTip(tip);
    fireEvent.mouseEnter(root());
    wait(300);
    fireEvent.mouseLeave(root());
    wait(50);
    fireEvent.mouseEnter(panel() as HTMLElement);
    wait(5000);
    expect(panel()).toBeTruthy();
  });

  it('stays while focus is inside after the pointer has gone', () => {
    renderTip(tip);
    fireEvent.mouseEnter(root());
    fireEvent.click(button());
    fireEvent.mouseLeave(root());
    wait(5000);
    expect(panel()).toBeTruthy();
    act(() => (panel() as HTMLElement).focus());
    fireEvent.blur(button(), { relatedTarget: panel() });
    wait(5000);
    expect(panel()).toBeTruthy();
  });

  it('closes when focus leaves and the pointer is not over it', () => {
    renderTip(<><input aria-label="Elsewhere" />{tip}</>);
    fireEvent.click(button());
    act(() => screen.getByLabelText('Elsewhere').focus());
    wait(1000);
    expect(panel()).toBeNull();
  });

  it('stays when focus leaves while the pointer is still over it', () => {
    renderTip(<><input aria-label="Elsewhere" />{tip}</>);
    fireEvent.click(button());
    fireEvent.mouseEnter(root());
    act(() => screen.getByLabelText('Elsewhere').focus());
    wait(5000);
    expect(panel()).toBeTruthy();
    fireEvent.mouseLeave(root());
    wait(1000);
    expect(panel()).toBeNull();
  });

  it('treats a click on a hover-opened tip as keeping it, and the next click as closing it', () => {
    renderTip(tip);
    fireEvent.mouseEnter(root());
    wait(300);
    fireEvent.click(button());
    expect(panel()).toBeTruthy();
    fireEvent.click(button());
    expect(panel()).toBeNull();
  });
});

describe('Toggletip dismissal', () => {
  it('closes on Esc and returns focus to the button', () => {
    renderTip(tip);
    fireEvent.click(button());
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(button());
  });

  it('returns focus from inside the panel too', () => {
    renderTip(tip);
    fireEvent.click(button());
    const link = screen.getByRole('link', { name: 'Full calculation ›' });
    act(() => link.focus());
    fireEvent.keyDown(link, { key: 'Escape' });
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(button());
  });

  it('keeps the dialog underneath open: the Esc stops here', () => {
    const dialogEsc = vi.fn();
    document.addEventListener('keydown', dialogEsc);
    renderTip(tip);
    fireEvent.click(button());
    fireEvent.keyDown(button(), { key: 'Escape' });
    expect(dialogEsc).not.toHaveBeenCalled();
    fireEvent.keyDown(button(), { key: 'Escape' });
    expect(dialogEsc).toHaveBeenCalledTimes(1);
    document.removeEventListener('keydown', dialogEsc);
  });

  it('dismisses a hover-opened tip without taking focus from another control', () => {
    vi.useFakeTimers();
    renderTip(<><input aria-label="Elsewhere" />{tip}</>);
    const input = screen.getByLabelText('Elsewhere');
    act(() => input.focus());
    fireEvent.mouseEnter(root());
    wait(300);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it('closes on a press outside and ignores one inside', () => {
    renderTip(tip);
    fireEvent.click(button());
    fireEvent.pointerDown(panel() as HTMLElement);
    expect(panel()).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(panel()).toBeNull();
  });

  it('keeps its own clicks and keys from the row or heading around it', () => {
    const row = vi.fn();
    renderTip(<div role="presentation" onClick={row} onKeyDown={row}>{tip}</div>);
    fireEvent.click(button());
    fireEvent.keyDown(button(), { key: 'Enter' });
    fireEvent.keyDown(button(), { key: ' ' });
    fireEvent.click(panel() as HTMLElement);
    fireEvent.keyDown(screen.getByRole('link'), { key: 'Enter' });
    expect(row).not.toHaveBeenCalled();
  });
});

describe('one open at a time', () => {
  const two = (
    <>
      <Toggletip metric="M-001" label="First" />
      <Toggletip metric="M-003" label="Second" />
    </>
  );

  it('closes the open one when another opens by click', () => {
    renderTip(two);
    fireEvent.click(button('About First'));
    fireEvent.click(button('About Second'));
    expect(button('About First').getAttribute('aria-expanded')).toBe('false');
    expect(button('About Second').getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('group').length).toBe(1);
  });

  it('closes the open one when another opens by hover', () => {
    vi.useFakeTimers();
    renderTip(two);
    fireEvent.click(button('About First'));
    fireEvent.mouseEnter(button('About Second').parentElement as HTMLElement);
    wait(300);
    expect(screen.getAllByRole('group').length).toBe(1);
    expect(screen.getByRole('group', { name: 'About Second' })).toBeTruthy();
  });

  it('forgets a tip that unmounted while open', () => {
    const view = renderTip(tip);
    fireEvent.click(button());
    view.unmount();
    renderTip(<Toggletip metric="M-003" label="Later" />);
    fireEvent.click(button('About Later'));
    expect(screen.getAllByRole('group').length).toBe(1);
  });
});

describe('Toggletip template', () => {
  const entry = helpFor('M-001');

  it('shows the registry text under the five fixed labels, in order', () => {
    renderTip(tip);
    fireEvent.click(button());
    const labels = [...(panel() as HTMLElement).querySelectorAll('dt')].map(d => d.textContent);
    expect(labels).toEqual(['What it measures', 'Formula', 'Window and eligibility', 'Unit', 'Source and version']);
    const values = [...(panel() as HTMLElement).querySelectorAll('dd')].map(d => d.textContent);
    expect(values).toEqual([entry?.what, entry?.formula, entry?.window, entry?.unit, entry?.source]);
  });

  it('says "As implemented, pending approval" once, in one short line', () => {
    renderTip(tip);
    fireEvent.click(button());
    expect(screen.getAllByText('As implemented, pending approval').length).toBe(1);
  });

  it('shows no citation and no register note', () => {
    renderTip(tip);
    fireEvent.click(button());
    const text = (panel() as HTMLElement).textContent ?? '';
    for (const citation of entry?.citations ?? []) expect(text).not.toContain(citation);
    expect(text).not.toContain('.cs:');
    expect(text).not.toContain(entry?.registerStatus);
  });

  it('leaves the status line out when approved, and skips an empty field', () => {
    renderTip(<Toggletip metric="APPROVED" label="Time in normal mode" />);
    fireEvent.click(button());
    const text = (panel() as HTMLElement).textContent ?? '';
    expect(text).not.toContain('As implemented');
    expect(text).not.toContain('Unit');
  });

  it('heads the panel with the page label', () => {
    renderTip(tip);
    fireEvent.click(button());
    expect((panel() as HTMLElement).querySelector('.ui-toggletip__name')?.textContent).toBe('Time in normal mode');
  });

  it('links to Evidence, Calculations with the metric, carrying the page context', () => {
    renderTip(tip, '/cpm/loop?site=hdpe&loop=FIC-1&window=24h&junk=1');
    fireEvent.click(button());
    const href = screen.getByRole('link', { name: 'Full calculation ›' }).getAttribute('href') ?? '';
    const [path, query] = href.split('?');
    const q = new URLSearchParams(query);
    expect(path).toBe('/cpm/evidence');
    expect(q.get('tab')).toBe('calculations');
    expect(q.get('metric')).toBe('M-001');
    expect(q.get('site')).toBe('hdpe');
    expect(q.get('loop')).toBe('FIC-1');
    expect(q.get('window')).toBe('24h');
    expect(q.get('junk')).toBeNull();
  });

  it('can send the id the Calculations tab matches on', () => {
    renderTip(<Toggletip metric="M-001" label="Time in normal mode" calculation="CPLM-001" />);
    fireEvent.click(button());
    expect(screen.getByRole('link').getAttribute('href')).toContain('metric=CPLM-001');
  });

  it('closes when the link is followed', () => {
    renderTip(tip);
    fireEvent.click(button());
    fireEvent.click(screen.getByRole('link'));
    expect(panel()).toBeNull();
  });
});

describe('placeToggletip', () => {
  const view = { width: 1000, height: 800 };
  const panelSize = { width: 400, height: 300 };
  const at = (top: number, left = 100) => ({ top, bottom: top + 40, left });

  it('sits below the button when it fits', () => {
    expect(placeToggletip(at(100), panelSize, view, 8)).toEqual({ top: 148, left: 100 });
  });

  it('flips above near the bottom', () => {
    expect(placeToggletip(at(700), panelSize, view, 8)).toEqual({ top: 392, left: 100 });
  });

  it('stays inside the right and left edges', () => {
    expect(placeToggletip(at(100, 900), panelSize, view, 8).left).toBe(592);
    expect(placeToggletip(at(100, -30), panelSize, view, 8).left).toBe(8);
  });

  it('stays inside the viewport when it fits on neither side', () => {
    const tall = { width: 400, height: 700 };
    const spot = placeToggletip(at(380), tall, view, 8);
    expect(spot.top).toBe(92);
    expect(spot.top + tall.height).toBeLessThanOrEqual(view.height - 8);
    expect(placeToggletip(at(380), { width: 400, height: 790 }, view, 8).top).toBe(8);
  });
});

describe('Toggletip placement on the page', () => {
  const rect = (top: number, left: number, size = 40) =>
    ({ top, bottom: top + size, left, right: left + size, width: size, height: size, x: left, y: top }) as DOMRect;
  const stubButton = (r: DOMRect) => vi.spyOn(button(), 'getBoundingClientRect').mockReturnValue(r);

  it('is placed from the button and follows it on scroll and resize', () => {
    renderTip(tip);
    stubButton(rect(100, 200));
    fireEvent.click(button());
    expect((panel() as HTMLElement).style.top).toBe('140px');
    expect((panel() as HTMLElement).style.left).toBe('200px');
    stubButton(rect(150, 200));
    fireEvent.scroll(window);
    expect((panel() as HTMLElement).style.top).toBe('190px');
    stubButton(rect(150, 260));
    fireEvent(window, new Event('resize'));
    expect((panel() as HTMLElement).style.left).toBe('260px');
  });

  it('follows a scroll inside a nested container', () => {
    const { container } = renderTip(<div data-testid="scroller">{tip}</div>);
    stubButton(rect(100, 200));
    fireEvent.click(button());
    stubButton(rect(60, 200));
    fireEvent.scroll(container.querySelector('[data-testid=scroller]') as Element);
    expect((panel() as HTMLElement).style.top).toBe('100px');
  });

  it('closes when its button scrolls out of view, leaving focus alone', () => {
    renderTip(tip);
    stubButton(rect(100, 200));
    fireEvent.click(button());
    stubButton(rect(-100, 200));
    fireEvent.scroll(window);
    expect(panel()).toBeNull();
  });

  it('stops listening once closed', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    renderTip(tip);
    fireEvent.click(button());
    fireEvent.click(button());
    expect(remove.mock.calls.map(c => c[0])).toEqual(expect.arrayContaining(['scroll', 'resize']));
  });

  it('rises to the top layer where the Popover API exists, in place in the DOM', () => {
    const showPopover = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'showPopover', { value: showPopover, configurable: true });
    renderTip(tip);
    fireEvent.click(button());
    expect(showPopover).toHaveBeenCalledTimes(1);
    expect(panel()?.getAttribute('popover')).toBe('manual');
    expect(panel()?.parentElement).toBe(root());
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).showPopover;
  });

  it('still opens without the Popover API', () => {
    expect(typeof HTMLElement.prototype.showPopover).toBe('undefined');
    renderTip(tip);
    fireEvent.click(button());
    expect(panel()?.hasAttribute('popover')).toBe(false);
  });
});

describe('toggletip.css', () => {
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');

  it('uses Traverse tokens only, with no fallbacks and no literal colours or font sizes', () => {
    expect(rules.length).toBeGreaterThan(500);
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(rules).not.toMatch(/\b(?:rgba?|hsla?|oklch)\(/);
    expect(rules).not.toMatch(/var\([^)]*,/);
    expect(rules).not.toMatch(/font-size:\s*[\d.]/);
    for (const [, name] of rules.matchAll(/var\((--[a-z0-9-]+)\)/g)) expect(name.startsWith('--traverse-')).toBe(true);
  });

  it('sizes the hit area from the 40 px token and the ring from the focus tokens', () => {
    expect(rules).toMatch(/\.ui-toggletip__button \{[^}]*width: var\(--traverse-size-control-min-height\)/);
    expect(rules).toMatch(/\.ui-toggletip__button \{[^}]*height: var\(--traverse-size-control-min-height\)/);
    expect(rules).toContain('outline: var(--traverse-focus-width) solid var(--traverse-focus)');
    expect(rules).toContain('outline-offset: var(--traverse-focus-offset)');
  });

  it('keeps the panel fixed and inside the viewport', () => {
    expect(rules).toMatch(/\.ui-toggletip__panel \{[^}]*position: fixed/);
    expect(rules).toMatch(/\.ui-toggletip__panel \{[^}]*max-height: calc\(100vh/);
    expect(rules).toMatch(/\.ui-toggletip__panel \{[^}]*max-width: calc\(100vw/);
    expect(rules).toMatch(/\.ui-toggletip__panel \{[^}]*overflow: auto/);
  });
});
