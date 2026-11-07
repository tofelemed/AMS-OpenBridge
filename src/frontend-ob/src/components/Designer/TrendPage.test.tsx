// @vitest-environment jsdom
/** Task 26: Trend opens from a loop selector. /trend needs only historian.view; the selector needs analytics.view. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { TrendPage } from './TrendPage';

const held: string[] = [];
const LOOPS = [
  { loopId: 'FIC1', tags: { PV: 'root.h.cpm.FIC1.pv', SP: 'root.h.cpm.FIC1.sp', OP: 'root.h.cpm.FIC1.op', VP: 'root.h.cpm.FIC1.vp' } },
  { loopId: 'TIC2', tags: { PV: 'root.h.cpm.TIC2.pv' } },
  { loopId: 'EMPTY', tags: {} },
  { loopId: 'SHARED', tags: { PV: 'root.h.cpm.S.pv', SP: 'root.h.cpm.S.pv' } },
];
let pensSeen: Array<{ path: string; color?: string; label?: string; lineStyle?: string }> = [];
type CoreProps = { pens: typeof pensSeen; onRemovePen?: (p: string) => void; onSampleAge?: (age: number | null, rangeMs: number) => void; emptyLegendText?: string };
let core: CoreProps = { pens: [] };
let loopsState = { loading: false, error: null as Error | null };
const refetch = vi.fn();
vi.mock('../../store/authStore', () => ({
  useAuthStore: (pick: (s: { hasPermission: (p: string) => boolean }) => unknown) => pick({ hasPermission: p => held.includes(p) }),
}));
vi.mock('../../hooks/useCpm', () => ({ useCpmLoops: () => ({ data: loopsState.loading || loopsState.error ? undefined : { loops: LOOPS }, isLoading: loopsState.loading, isError: !!loopsState.error, error: loopsState.error, refetch }) }));
vi.mock('./TrendCore', () => ({
  RANGES: [{ label: '15m', ms: 900000 }, { label: '8h', ms: 28800000 }],
  default: (p: CoreProps) => { pensSeen = p.pens; core = p; return <div data-testid="core" data-empty={p.emptyLegendText} />; },
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

beforeEach(() => { held.length = 0; held.push('historian.view', 'analytics.view'); pensSeen = []; loopsState = { loading: false, error: null }; });
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
    expect(screen.getAllByText('Choose a loop')).toHaveLength(1); // the band's; the chart does not repeat it
    expect(screen.queryByText(/pens?$/)).toBeNull();
    expect(screen.queryByText('LIVE')).toBeNull();
  });

  it('shows LIVE only while samples arrive', () => {
    open('/trend?loop=FIC1');
    expect(screen.queryByText('LIVE')).toBeNull(); // pens, but no samples yet
    act(() => core.onSampleAge?.(5_000, 900_000));
    expect(screen.getByText('LIVE')).toBeTruthy();
    act(() => core.onSampleAge?.(600_000, 900_000)); // newest sample is stale for a 15 m window
    expect(screen.queryByText('LIVE')).toBeNull();
    act(() => core.onSampleAge?.(null, 900_000));
    expect(screen.queryByText('LIVE')).toBeNull();
  });

  it('keeps a loop-driven chart loop-driven when a pen is removed', () => {
    open('/trend?loop=FIC1');
    act(() => core.onRemovePen?.('root.h.cpm.FIC1.pv'));
    expect(screen.getByTestId('where').textContent).toContain('roles=SP%2COP%2CVP');
    expect(screen.getByTestId('where').textContent).not.toContain('tags=');
    expect(pensSeen.map(p => p.label)).toEqual(['SP', 'OP', 'VP']);
    expect(pensSeen[0]).toMatchObject({ color: 'var(--signal-sp)', lineStyle: 'dashed' });
  });

  it('removing the last pen leaves the chart empty, not full again', () => {
    open('/trend?loop=TIC2');
    act(() => core.onRemovePen?.('root.h.cpm.TIC2.pv'));
    expect(screen.getByTestId('where').textContent).toContain('roles=none');
    expect(pensSeen).toEqual([]);
    cleanup();
    open('/trend?loop=TIC2&tags=a.b');
    act(() => core.onRemovePen?.('a.b'));
    expect(pensSeen).toEqual([]);
  });

  it('draws the SP pen when SP and PV share a tag and only SP is asked for', () => {
    open('/trend?loop=SHARED&roles=SP');
    expect(pensSeen.map(p => p.label)).toEqual(['SP']);
  });

  it('says Loop not found for an unknown loop, and nothing new while loading', () => {
    open('/trend?loop=NOPE');
    expect(screen.getByRole('status').textContent).toBe('Loop not found');
    cleanup();
    loopsState = { loading: true, error: null };
    open('/trend?loop=FIC1');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByTestId('trend-page')).toBeTruthy();
  });

  it('shows the read error with a retry, not Loop not found', () => {
    loopsState = { loading: false, error: new Error('loops unavailable') };
    open('/trend?loop=FIC1');
    expect(screen.getByText('loops unavailable')).toBeTruthy();
    expect(screen.queryByText('Loop not found')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('leaves the empty legend to the band with the selector, and to the old text without it', () => {
    open('/trend');
    expect(screen.getByTestId('core').getAttribute('data-empty')).toBe('');
    cleanup();
    held.splice(0, held.length, 'historian.view');
    open('/trend?loop=FIC1');
    expect(screen.getByTestId('core').getAttribute('data-empty')).toBeNull(); // default: No tags selected
    expect(screen.queryByText('Choose a loop')).toBeNull();
    expect(screen.queryByText('Loop not found')).toBeNull();
  });

  it('opens the loop by its registry id, whatever case the link used', () => {
    open('/trend?loop=fic1');
    fireEvent.click(screen.getByRole('button', { name: 'Open loop ↗' }));
    expect(screen.getByTestId('where').textContent).toContain('/cpm/explorer?loop=FIC1');
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
