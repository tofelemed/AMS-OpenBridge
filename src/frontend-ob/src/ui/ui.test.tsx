import React, { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { carriedSearch } from '../cpa/useContextCarry';
import { RequirePermission } from '../app/guards';
import { useAuthStore } from '../store/authStore';
import { DataState } from './DataState';
import { Popover } from './Popover';
import { SegmentedControl } from './SegmentedControl';
import { Tabs, tabPanelProps } from './Tabs';

afterEach(cleanup);

const OPTIONS = [{ value: 'a', label: 'One' }, { value: 'b', label: 'Two' }, { value: 'c', label: 'Three' }];

const Segments: React.FC = () => {
  const [v, setV] = useState('a');
  return <SegmentedControl label="Pick" options={OPTIONS} value={v} onChange={setV} />;
};

const TabSet: React.FC = () => {
  const [v, setV] = useState('a');
  return (
    <>
      <Tabs idBase="t" label="Pages" options={OPTIONS} value={v} onChange={setV} />
      <div {...tabPanelProps('t', v)}>panel {v}</div>
    </>
  );
};

const Pop: React.FC = () => (
  <Popover label="Scope" trigger={t => <button type="button" {...t}>Open</button>}>
    <button type="button">Inside</button>
  </Popover>
);

describe('SegmentedControl', () => {
  it('marks the selected option with aria-pressed', () => {
    render(<Segments />);
    expect(screen.getByRole('button', { name: 'One' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Two' }));
    expect(screen.getByRole('button', { name: 'Two' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'One' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('moves and selects with the arrow keys, wrapping at the ends', () => {
    render(<Segments />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'One' }), { key: 'ArrowLeft' });
    expect(screen.getByRole('button', { name: 'Three' }).getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Three' }));
  });
});

describe('Tabs', () => {
  it('links each tab to its panel and keeps one tab stop', () => {
    render(<TabSet />);
    const tab = screen.getByRole('tab', { name: 'One' });
    expect(tab.getAttribute('aria-selected')).toBe('true');
    expect(tab.getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('tab', { name: 'Two' }).getAttribute('tabindex')).toBe('-1');
    expect(screen.getByRole('tabpanel', { name: 'One' }).textContent).toContain('panel a');
  });

  it('supports arrows, Home and End', () => {
    render(<TabSet />);
    fireEvent.keyDown(screen.getByRole('tab', { name: 'One' }), { key: 'End' });
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Three' }));
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Three' }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'One' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'One' }), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Two' }), { key: 'Home' });
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'One' }));
  });
});

describe('Popover', () => {
  it('opens with focus inside and reports its state', () => {
    render(<Pop />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('group', { name: 'Scope' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Inside' }));
  });

  it('closes on Escape and returns focus to the trigger', () => {
    render(<Pop />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Inside' }), { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Scope' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open' }));
  });

  it('closes on a click outside', () => {
    render(<div><Pop /><p>outside</p></div>);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.pointerDown(screen.getByText('outside'));
    expect(screen.queryByRole('group', { name: 'Scope' })).toBeNull();
  });
});

describe('restricted state', () => {
  const guarded = (permissions: string[], at = '/cpm/system') => {
    useAuthStore.setState({ hasPermission: (p: string) => permissions.includes(p) } as never);
    return render(
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route path="/cpm/system" element={<RequirePermission permission="system.manage"><p>secret</p></RequirePermission>} />
          <Route path="/cpm" element={<p>home</p>} />
        </Routes>
      </MemoryRouter>,
    );
  };

  it('says so instead of redirecting silently (RD13)', () => {
    guarded(['analytics.view']);
    expect(screen.getByText('Not available for your role')).toBeTruthy();
    expect(screen.queryByText('home')).toBeNull();
    expect(screen.queryByText('secret')).toBeNull();
  });

  it('offers the way out only to a role that can use it', () => {
    guarded(['analytics.view']);
    expect(screen.getByRole('link', { name: 'Go to Overview' })).toBeTruthy();
  });

  it('offers no link to a role that cannot open Overview', () => {
    guarded([]);
    expect(screen.queryByRole('link', { name: 'Go to Overview' })).toBeNull();
  });

  it('lets a holder through unchanged', () => {
    guarded(['system.manage']);
    expect(screen.getByText('secret')).toBeTruthy();
  });

  it('never names a raw permission', () => {
    render(<DataState kind="restricted" reason="Your role does not include this page." />);
    expect(screen.getByRole('status').textContent).not.toMatch(/\.manage|\.view/);
  });
});

describe('context carry', () => {
  it('adds scope and range to a link that lacks them', () => {
    const s = carriedSearch('?site=hdpe&area=a&range=7d', '/cpm/performance', '');
    expect(new URLSearchParams(s ?? '').get('site')).toBe('hdpe');
    expect(new URLSearchParams(s ?? '').get('range')).toBe('7d');
  });

  it('never overrides what the link set', () => {
    expect(carriedSearch('?site=hdpe', '/cpm', '?site=other')).toBeNull();
  });

  it('carries the loop to loop pages and not to fleet pages', () => {
    expect(carriedSearch('?loop=A', '/cpm/explorer', '')).toBe('?loop=A');
    expect(carriedSearch('?loop=A', '/cpm/registry', '')).toBeNull();
    expect(carriedSearch('?loop=A', '/cpm/performance', '')).toBeNull();
  });

  it('carries the loop to Trend, with the plant scope and nothing else', () => {
    expect(carriedSearch('?site=hdpe&loop=A&range=7d', '/trend', '')).toBe('?site=hdpe&loop=A');
    expect(carriedSearch('?loop=A', '/trend', '?loop=B')).toBeNull();
  });

  it('carries a window kind under the name the next page reads', () => {
    expect(carriedSearch('?window=24h', '/cpm/performance', '')).toBe('?window=24h');
    expect(carriedSearch('?window=24h', '/cpm/replay', '')).toBe('?kind=24h');
    expect(carriedSearch('?window=24h', '/cpm/historical', '')).toBe('?kind=24h');
    expect(carriedSearch('?window=24h', '/cpm/investigation', '')).toBe('?profile=24h');
    expect(carriedSearch('?profile=24h', '/cpm/explorer', '')).toBe('?window=24h');
  });

  it('never carries an evaluated window END to another page', () => {
    expect(carriedSearch('?window=2026-11-04T12:00:00Z', '/cpm/performance', '')).toBeNull();
    expect(carriedSearch('?window=2026-11-04T12:00:00Z', '/cpm/replay', '')).toBeNull();
  });

  it('moves a kind a link left in `window` on a page that reads `window` as an END', () => {
    expect(carriedSearch('', '/cpm/historical', '?window=24h')).toBe('?kind=24h');
  });

  it('leaves a real window END on a page alone', () => {
    expect(carriedSearch('', '/cpm/historical', '?window=2026-11-04T12:00:00Z')).toBeNull();
  });

  it('carries a custom range whole or not at all', () => {
    const s = new URLSearchParams(carriedSearch('?range=custom&from=a&to=b', '/cpm', '') ?? '');
    expect([s.get('range'), s.get('from'), s.get('to')]).toEqual(['custom', 'a', 'b']);
    expect(carriedSearch('?range=custom&from=a', '/cpm', '')).toBeNull();
  });

  it('leaves a page that has its own period alone', () => {
    expect(carriedSearch('?range=7d', '/cpm/historical', '?from=a&to=b')).toBeNull();
  });

  it('takes only the plant scope to the Tag trend tool, whose range means something else', () => {
    expect(carriedSearch('?site=hdpe&range=7d', '/trend', '')).toBe('?site=hdpe');
    expect(carriedSearch('?range=7d', '/trend', '')).toBeNull();
  });
});
