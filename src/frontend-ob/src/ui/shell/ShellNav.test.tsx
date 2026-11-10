// @vitest-environment jsdom
// The sidebar: six headings, 17 entries, and nothing a role may not open.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ShellNav } from './ShellNav';

let held: string[] = [];
const has = (p: string) => held.includes(p);

vi.mock('../../store/authStore', () => ({
  useAuthStore: (pick: (s: { hasPermission: (p: string) => boolean }) => unknown) => pick({ hasPermission: has }),
}));

const EVERYTHING = ['analytics.view', 'historian.view', 'cpm.config.read', 'system.manage', 'admin.users.edit'];

const nav = (at = '/cpm', rail = false) => render(
  <MemoryRouter initialEntries={[at]}><ShellNav rail={rail} /></MemoryRouter>,
);

afterEach(cleanup);

describe('ShellNav', () => {
  it('shows the six headings in order, each before its entries', () => {
    held = EVERYTHING;
    nav();
    const list = screen.getByRole('navigation');
    expect(within(list).getAllByRole('heading').map(h => h.textContent)).toEqual([
      'Find problems', 'Check a loop', 'Understand the cause', 'Set up', 'Engineering', 'System',
    ]);
    const under = (heading: string) => within(screen.getByRole('group', { name: heading })).getAllByRole('link').map(a => a.textContent);
    expect(under('Find problems')).toEqual(['Overview', 'Performance', 'Loop Events']);
    expect(under('Understand the cause')).toEqual([
      'Investigation', 'Evidence Workbench', 'Evidence Replay', 'Window Inspector', 'Calculations', 'System Response',
    ]);
    expect(under('Engineering')).toEqual(['Trend']);
  });

  it('gives every entry its own page address and an icon', () => {
    held = EVERYTHING;
    nav();
    const links = within(screen.getByRole('navigation')).getAllByRole('link');
    expect(links).toHaveLength(17);
    expect(links.every(a => a.querySelector('.ui-icon svg, .ui-icon obi-placeholder, .ui-icon *'))).toBe(true);
    expect(screen.getByRole('link', { name: 'Evidence Replay' }).getAttribute('href')).toBe('/cpm/replay');
  });

  it('hides a heading with nothing under it', () => {
    held = ['analytics.view'];
    nav();
    expect(screen.getAllByRole('heading').map(h => h.textContent)).toEqual([
      'Find problems', 'Check a loop', 'Understand the cause', 'Set up',
    ]);
    expect(screen.queryByRole('link', { name: 'Pipeline Health' })).toBeNull();
  });

  it('marks the entry that owns a deep link', () => {
    held = EVERYTHING;
    nav('/admin/users');
    expect(screen.getByRole('link', { name: 'Administration' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Overview' }).getAttribute('aria-current')).toBeNull();
  });

  it('drops the headings on the narrow rail, and keeps every entry named', () => {
    held = EVERYTHING;
    nav('/cpm', true);
    expect(screen.queryAllByRole('heading')).toHaveLength(0);
    expect(screen.getByRole('link', { name: 'Governance' })).toBeTruthy();
  });

  it('keeps Trend to the plant scope and the loop, never the range or window', () => {
    held = EVERYTHING;
    nav('/cpm/explorer?loop=A&site=hdpe&window=24h&from=a&to=b&range=custom');
    expect(screen.getByRole('link', { name: 'Trend' }).getAttribute('href')).toBe('/trend?site=hdpe&loop=A');
  });

  // CHG-161 (owner review): on a short screen the collapsed rail did not scroll, so Expand fell off the bottom and the menu stuck
  it('keeps Collapse and Expand outside the scrolling list, so they stay on screen', () => {
    held = EVERYTHING;
    const { rerender } = render(<MemoryRouter><ShellNav rail={false} onToggle={() => {}} /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Collapse navigation' }).closest('.shell-nav__scroll')).toBeNull();
    expect(screen.getByRole('link', { name: 'Overview' }).closest('.shell-nav__scroll')).toBeTruthy();
    rerender(<MemoryRouter><ShellNav rail onToggle={() => {}} /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Expand navigation' }).closest('.shell-nav__scroll')).toBeNull();
    expect(screen.getByRole('link', { name: 'Governance' }).closest('.shell-nav__scroll')).toBeTruthy();
  });

  it('places a rail tip beside its entry, so the list can scroll without clipping it', () => {
    held = EVERYTHING;
    nav('/cpm', true);
    const entry = screen.getByRole('link', { name: 'Overview' }).closest('li')!;
    fireEvent.mouseEnter(entry);
    expect(entry.style.getPropertyValue('--nav-tip-top')).toBe('0px');
  });

  it('opens Loop Registry on its list, not on the selected loop', () => {
    held = EVERYTHING;
    nav('/cpm/explorer?loop=A');
    expect(screen.getByRole('link', { name: 'Loop Registry' }).getAttribute('href')).toBe('/cpm/registry');
    expect(screen.getByRole('link', { name: 'Historical' }).getAttribute('href')).toBe('/cpm/historical?loop=A');
  });
});
