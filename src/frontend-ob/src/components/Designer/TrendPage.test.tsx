// @vitest-environment jsdom
/** Task 26: Trend opens from a loop selector. /trend needs only historian.view; the selector needs analytics.view. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { TrendPage } from './TrendPage';

const held: string[] = [];
const LOOPS = [
  { loopId: 'FIC1', tags: { PV: 'root.h.cpm.FIC1.pv', SP: 'root.h.cpm.FIC1.sp', OP: 'root.h.cpm.FIC1.op', VP: 'root.h.cpm.FIC1.vp' } },
  { loopId: 'TIC2', tags: { PV: 'root.h.cpm.TIC2.pv' } },
  { loopId: 'EMPTY', tags: {} },
];
let pensSeen: Array<{ path: string; color?: string; label?: string }> = [];
vi.mock('../../store/authStore', () => ({
  useAuthStore: (pick: (s: { hasPermission: (p: string) => boolean }) => unknown) => pick({ hasPermission: p => held.includes(p) }),
}));
vi.mock('../../hooks/useCpm', () => ({ useCpmLoops: () => ({ data: { loops: LOOPS }, isLoading: false, isError: false }) }));
vi.mock('./TrendCore', () => ({
  RANGES: [{ label: '15m', ms: 900000 }, { label: '8h', ms: 28800000 }],
  default: (p: { pens: typeof pensSeen }) => { pensSeen = p.pens; return <div data-testid="core" />; },
}));
vi.mock('../Cpm/context/LoopBand', () => ({
  LoopBand: (p: { loopId?: string | null; onLoop: (id: string) => void; children?: React.ReactNode; end?: React.ReactNode }) => (
    <div data-testid="loop-band"><span>{p.loopId ?? 'Choose a loop'}</span><button onClick={() => p.onLoop('TIC2')}>pick TIC2</button>{p.children}{p.end}</div>
  ),
}));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));

const Where = () => { const l = useLocation(); return <span data-testid="where">{l.pathname + l.search}</span>; };
const open = (url: string) => render(<MemoryRouter initialEntries={[url]}><TrendPage /><Where /></MemoryRouter>);

beforeEach(() => { held.length = 0; held.push('historian.view', 'analytics.view'); pensSeen = []; });
afterEach(cleanup);

describe('TrendPage with a loop', () => {
  it('loads PV, SP, OP and VP pens from the chosen loop', () => {
    open('/trend?loop=FIC1');
    expect(pensSeen.map(p => p.label)).toEqual(['PV', 'SP', 'OP', 'VP']);
  });

  it('opens with ?loop= when no tags are set, and honours roles', () => {
    open('/trend?loop=FIC1&roles=PV,OP');
    expect(pensSeen.map(p => p.path)).toEqual(['root.h.cpm.FIC1.pv', 'root.h.cpm.FIC1.op']);
  });

  it('colours pens by role, not position', () => {
    open('/trend?loop=FIC1');
    expect(pensSeen.find(p => p.label === 'SP')?.color).toBe('var(--signal-sp)');
    expect(pensSeen.find(p => p.label === 'VP')?.color).toBe('var(--signal-vp)');
  });

  it('lets explicit tags decide the pens while the selector shows the loop', () => {
    open('/trend?loop=FIC1&tags=a.b,c.d');
    expect(pensSeen.map(p => p.path)).toEqual(['a.b', 'c.d']);
    expect(screen.getByTestId('loop-band').textContent).toContain('FIC1');
  });

  it('keeps the pinned window of the link', () => {
    open('/trend?loop=FIC1&from=2026-11-01T00:00:00.000Z&to=2026-11-01T08:00:00.000Z');
    expect(screen.getByText('PINNED WINDOW')).toBeTruthy();
  });

  it('choosing a loop replaces the pens and keeps the window', () => {
    open('/trend?loop=FIC1&tags=a.b&from=2026-11-01T00:00:00.000Z&to=2026-11-01T08:00:00.000Z');
    fireEvent.click(screen.getByText('pick TIC2'));
    const url = screen.getByTestId('where').textContent ?? '';
    expect(url).toContain('loop=TIC2');
    expect(url).not.toContain('tags=');
    expect(url).toContain('from=');
  });

  it('opens the loop from the band', () => {
    open('/trend?loop=FIC1');
    fireEvent.click(screen.getByRole('button', { name: 'Open loop ↗' }));
    expect(screen.getByTestId('where').textContent).toContain('/cpm/explorer?loop=FIC1');
  });

  it('draws no VP pen for a loop without one, and says a loop with no tags has none', () => {
    open('/trend?loop=TIC2');
    expect(pensSeen.map(p => p.label)).toEqual(['PV']);
    cleanup();
    open('/trend?loop=EMPTY');
    expect(screen.getByRole('status').textContent).toMatch(/EMPTY has no signal tags/);
  });
});

describe('TrendPage empty and permissions', () => {
  it('shows Choose a loop on an empty chart, and no pen count or LIVE', () => {
    open('/trend');
    expect(screen.getAllByText('Choose a loop').length).toBeGreaterThan(1);
    expect(screen.queryByText(/pens?$/)).toBeNull();
    expect(screen.queryByText('LIVE')).toBeNull();
  });

  it('shows LIVE only with pens on a live chart', () => {
    open('/trend?loop=FIC1');
    expect(screen.getByText('LIVE')).toBeTruthy();
  });

  it('hides the selector without analytics.view and works as today', () => {
    held.splice(0, held.length, 'historian.view');
    open('/trend?tags=a.b');
    expect(screen.queryByTestId('loop-band')).toBeNull();
    expect(pensSeen.map(p => p.path)).toEqual(['a.b']);
    expect(screen.getByTestId('trend-from')).toBeTruthy();
    expect(screen.queryByText('Choose a loop')).toBeNull();
  });
});
