// @vitest-environment jsdom
/**
 * Task 26: Trend opens from a loop selector. /trend needs only historian.view; the selector needs analytics.view.
 * CHG-175 (owner's design): one band card (loop, range, ‹ dates ›, Pause, Now, Loop Explorer ↗, Historical ↗; Custom opens
 * From · To · Apply), the chart's head row (legend, Signals ▾, zoom tools) and foot strip; times in the site zone; the
 * address follows the screen.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { setActiveZone } from '../../cpa/activeZone';
import { TrendPage } from './TrendPage';

const held: string[] = [];
const LOOPS = [
  { loopId: 'FIC1', tags: { PV: 'root.h.cpm.FIC1.pv', SP: 'root.h.cpm.FIC1.sp', OP: 'root.h.cpm.FIC1.op', VP: 'root.h.cpm.FIC1.vp' } },
  { loopId: 'TIC2', tags: { PV: 'root.h.cpm.TIC2.pv', SP: 'root.h.cpm.TIC2.sp' } },
  { loopId: 'EMPTY', tags: {} },
  { loopId: 'SHARED', tags: { PV: 'root.h.cpm.S.pv', SP: 'root.h.cpm.S.pv' } },
];
type Pen = { path: string; color?: string; label?: string; lineStyle?: string; needsModelBinding?: boolean };
type CoreProps = {
  pens: Pen[]; onRemovePen?: (p: string) => void; onSampleAge?: (age: number | null, rangeMs: number) => void;
  emptyLegendText?: string; emptyContent?: React.ReactNode; timeZone?: string; zoomResetKey?: string | number;
  controlledWindow?: { start: number; end: number; live: boolean } | null;
  frame?: { headTools?: React.ReactNode; state: string | null; zoneName: string };
};
let core: CoreProps = { pens: [] };
let loopsState = { loading: false, error: null as Error | null };
const refetch = vi.fn();
vi.mock('../../store/authStore', () => ({
  useAuthStore: (pick: (s: { hasPermission: (p: string) => boolean }) => unknown) => pick({ hasPermission: p => held.includes(p) }),
}));
vi.mock('../../hooks/useCpm', () => ({ useCpmLoops: () => ({ data: loopsState.loading || loopsState.error ? undefined : { loops: LOOPS }, isLoading: loopsState.loading, isError: !!loopsState.error, error: loopsState.error, refetch }) }));
vi.mock('./TrendCore', () => ({
  default: (p: CoreProps) => {
    core = p;
    return <div data-testid="core">{p.frame?.headTools}<div data-testid="core-empty">{p.emptyContent}</div></div>;
  },
}));
vi.mock('../Cpm/context/LoopBand', () => ({
  LoopBand: (p: { loopId?: string | null; onLoop: (id: string) => void; children?: React.ReactNode; end?: React.ReactNode; card?: boolean }) => (
    <div data-testid="loop-band" data-card={p.card ? 'yes' : 'no'}><span>{p.loopId ?? 'Search loops'}</span><button onClick={() => p.onLoop('TIC2')}>pick TIC2</button>{p.children}{p.end}</div>
  ),
}));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean; title?: string; variant?: string }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled, title: p.title, 'data-variant': p.variant }, p.children),
}));

const NOW = Date.parse('2026-11-11T17:48:00Z');
const H = 3_600_000;
const PIN = '&from=2026-11-06T10:45:00.000Z&to=2026-11-06T22:45:00.000Z';
const Where = () => { const l = useLocation(); return <span data-testid="where">{decodeURIComponent(l.pathname + l.search)}</span>; };
const Go = () => { const n = useNavigate(); return <button onClick={() => n('/trend?loop=FIC1&range=1w')}>open a 1w link</button>; };
const open = (url: string) => render(<MemoryRouter initialEntries={[url]}><TrendPage /><Where /><Go /></MemoryRouter>);
const where = () => screen.getByTestId('where').textContent ?? '';
const range = () => screen.getByRole('combobox', { name: 'Range' }) as HTMLSelectElement;
const dates = () => screen.getByTitle('Choose the dates');
const span = () => (core.controlledWindow ? core.controlledWindow.end - core.controlledWindow.start : 0);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  held.length = 0; held.push('historian.view', 'analytics.view');
  core = { pens: [] }; loopsState = { loading: false, error: null };
  setActiveZone('UTC');
});
afterEach(() => { cleanup(); vi.useRealTimers(); setActiveZone(undefined as unknown as string); });

describe('the pens of a loop (Task 26, unchanged)', () => {
  it('loads PV, SP, OP and VP pens from the chosen loop, coloured by role', () => {
    open('/trend?loop=FIC1');
    expect(core.pens.map(p => p.label)).toEqual(['PV', 'SP', 'OP', 'VP']);
    expect(core.pens.find(p => p.label === 'SP')).toMatchObject({ color: 'var(--signal-sp)', lineStyle: 'dashed' });
  });

  it('honours roles, and lets explicit tags decide the pens while the band shows the loop', () => {
    open('/trend?loop=FIC1&roles=PV,OP');
    expect(core.pens.map(p => p.path)).toEqual(['root.h.cpm.FIC1.pv', 'root.h.cpm.FIC1.op']);
    cleanup();
    open('/trend?loop=FIC1&tags=a.b,c.d');
    expect(core.pens.map(p => p.path)).toEqual(['a.b', 'c.d']);
    expect(screen.getByTestId('loop-band').textContent).toContain('FIC1');
  });

  it('reads a loop pen only through the asset model, and leaves tag pens as they were (CHG-175)', () => {
    open('/trend?loop=FIC1');
    expect(core.pens.every(p => p.needsModelBinding === true)).toBe(true);
    cleanup();
    open('/trend?loop=FIC1&tags=a.b');
    expect(core.pens[0].needsModelBinding).toBeUndefined();
  });

  it('choosing a loop replaces the pens and keeps the period', () => {
    open(`/trend?loop=FIC1&tags=a.b${PIN}`);
    fireEvent.click(screen.getByText('pick TIC2'));
    expect(where()).toContain('loop=TIC2');
    expect(where()).not.toContain('tags=');
    expect(where()).toContain('from=2026-11-06T10:45:00.000Z');
  });

  it('keeps a loop-driven chart loop-driven when a pen is removed, and empty when the last one goes', () => {
    open('/trend?loop=FIC1');
    act(() => core.onRemovePen?.('root.h.cpm.FIC1.pv'));
    expect(where()).toContain('roles=SP,OP,VP');
    expect(core.pens[0]).toMatchObject({ label: 'SP', color: 'var(--signal-sp)', lineStyle: 'dashed' });
    cleanup();
    open('/trend?loop=TIC2&roles=PV');
    act(() => core.onRemovePen?.('root.h.cpm.TIC2.pv'));
    expect(where()).toContain('roles=none');
    expect(core.pens).toEqual([]);
  });

  it('draws the SP pen when SP and PV share a tag and only SP is asked for', () => {
    open('/trend?loop=SHARED&roles=SP');
    expect(core.pens.map(p => p.label)).toEqual(['SP']);
  });
});

describe('the band (CHG-175)', () => {
  it('is a card with the range named by its options, the dates, Pause and Now, in 32 px controls', () => {
    open('/trend?loop=FIC1');
    expect(screen.getByTestId('loop-band').getAttribute('data-card')).toBe('yes');
    expect(screen.getByTestId('trend-page').className).toContain('cpm-compact');
    expect([...range().options].map(o => o.textContent)).toEqual(['15m', '1h', '8h', '24h', '7d', 'Custom']);
    expect(range().value).toBe('15m');
    expect(dates().textContent).toBe('11 Nov 17:33 → 17:48');
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Now' }).getAttribute('data-variant')).toBe('normal');
    for (const gone of ['Live ›', 'PINNED WINDOW', 'Apply window', 'Open loop ↗']) expect(screen.queryByText(gone)).toBeNull();
  });

  it('reads every time in the site zone, and hands the chart that zone', () => {
    setActiveZone('Asia/Dubai');
    open(`/trend?loop=FIC1${PIN}`);
    expect(dates().textContent).toBe('6 Nov 14:45 → 7 Nov 02:45');
    expect(core.timeZone).toBe('Asia/Dubai');
    cleanup();
    setActiveZone('UTC');
    open(`/trend?loop=FIC1${PIN}`);
    expect(dates().textContent).toBe('6 Nov 10:45 → 22:45');
    expect(core.frame?.zoneName).toBe('UTC');
  });

  it('shows a fixed period from Historical as Custom, with no Pause, and the foot says Fixed period', () => {
    open(`/trend?loop=FIC1${PIN}`);
    expect(range().value).toBe('custom');
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    expect(core.controlledWindow).toEqual({ start: Date.parse('2026-11-06T10:45:00Z'), end: Date.parse('2026-11-06T22:45:00Z'), live: false });
    expect(core.frame?.state).toBe('fixed');
  });

  it('steps a fixed period half a period earlier, and the address follows', () => {
    open(`/trend?loop=FIC1${PIN}`);
    fireEvent.click(screen.getByTitle('Half a period earlier'));
    expect(where()).toContain('from=2026-11-06T04:45:00.000Z&to=2026-11-06T16:45:00.000Z');
    expect(dates().textContent).toBe('6 Nov 04:45 → 16:45');
  });

  it('never steps into the future: › stops at now, then waits', () => {
    open('/trend?loop=FIC1&from=2026-11-11T04:48:00.000Z&to=2026-11-11T16:48:00.000Z');
    fireEvent.click(screen.getByTitle('Half a period later'));
    expect(where()).toContain('from=2026-11-11T05:48:00.000Z&to=2026-11-11T17:48:00.000Z');
    expect((screen.getByTitle('Half a period later') as HTMLButtonElement).disabled).toBe(true);
  });

  it('offers no › while live', () => {
    open('/trend?loop=FIC1');
    expect((screen.getByTitle('Half a period later') as HTMLButtonElement).disabled).toBe(true);
  });

  it('a range choice writes range and goes live with it', () => {
    open(`/trend?loop=FIC1${PIN}`);
    fireEvent.change(range(), { target: { value: '8h' } });
    expect(where()).toContain('range=8h');
    expect(where()).not.toContain('from=');
    expect(core.controlledWindow?.live).toBe(true);
    expect(span()).toBe(8 * H);
  });

  it('applies a ?range= link opened while already on Trend, old words included', () => {
    open('/trend?loop=FIC1');
    expect(span()).toBe(15 * 60_000);
    fireEvent.click(screen.getByText('open a 1w link'));
    expect(span()).toBe(7 * 24 * H);
    expect(range().value).toBe('7d');
  });

  it('Pause freezes the window and reads Resume; Resume follows live again; the zoom stays', () => {
    open('/trend?loop=FIC1');
    const key = core.zoomResetKey;
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(core.controlledWindow?.live).toBe(false);
    expect(core.frame?.state).toBe('paused');
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(core.controlledWindow?.live).toBe(true);
    expect(core.zoomResetKey).toBe(key);
  });

  it('a step from live writes from and to, keeps the range word and disables Pause; Now returns to live', () => {
    open('/trend?loop=FIC1&range=7d');
    const key = core.zoomResetKey;
    fireEvent.click(screen.getByTitle('Half a period earlier'));
    expect(where()).toContain('from=2026-11-01T05:48:00.000Z&to=2026-11-08T05:48:00.000Z');
    expect(where()).not.toContain('range=');
    expect(range().value).toBe('7d');
    expect((screen.getByRole('button', { name: 'Pause' }) as HTMLButtonElement).disabled).toBe(true);
    expect(core.frame?.state).toBe('fixed');
    expect(core.zoomResetKey).not.toBe(key);
    fireEvent.click(screen.getByRole('button', { name: 'Now' }));
    expect(where()).toContain('range=7d');
    expect(where()).not.toContain('from=');
    expect(core.controlledWindow?.live).toBe(true);
  });

  it('Now resets the zoom even when the range does not change', () => {
    open('/trend?loop=FIC1&range=15m');
    const key = core.zoomResetKey;
    fireEvent.click(screen.getByRole('button', { name: 'Now' }));
    expect(core.zoomResetKey).not.toBe(key);
  });
});

describe('Custom (CHG-175)', () => {
  const field = (name: 'From' | 'To') => screen.getByLabelText(name) as HTMLInputElement;
  const apply = () => fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

  it('opens From, To and Apply in the band, from Custom or from the dates, in the site zone', () => {
    open(`/trend?loop=FIC1${PIN}`);
    expect(screen.queryByLabelText('From')).toBeNull();
    fireEvent.click(dates());
    expect(field('From').value).toBe('2026-11-06T10:45');
    expect(field('To').value).toBe('2026-11-06T22:45');
    fireEvent.click(dates());
    expect(screen.queryByLabelText('From')).toBeNull();
    fireEvent.change(range(), { target: { value: 'custom' } });
    expect(field('From')).toBeTruthy();
  });

  it('keeps the two error lines and writes the period on Apply', () => {
    open('/trend?loop=FIC1');
    fireEvent.change(range(), { target: { value: 'custom' } });
    fireEvent.change(field('From'), { target: { value: '' } });
    apply();
    expect(screen.getByRole('alert').textContent).toBe('Enter both dates.');
    fireEvent.change(field('From'), { target: { value: '2026-11-06T22:45' } });
    fireEvent.change(field('To'), { target: { value: '2026-11-06T10:45' } });
    apply();
    expect(screen.getByRole('alert').textContent).toBe('"To" must be after "From".');
    fireEvent.change(field('From'), { target: { value: '2026-11-06T10:45' } });
    fireEvent.change(field('To'), { target: { value: '2026-11-06T22:45' } });
    apply();
    expect(where()).toContain('from=2026-11-06T10:45:00.000Z&to=2026-11-06T22:45:00.000Z');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByLabelText('From')).toBeNull();
  });
});

describe('the exits (CHG-175)', () => {
  it('Loop Explorer ↗ opens the loop by its registry id', () => {
    open('/trend?loop=fic1');
    fireEvent.click(screen.getByRole('button', { name: 'Loop Explorer ↗' }));
    expect(where()).toBe('/cpm/explorer?loop=FIC1');
  });

  it('Historical ↗ opens Historical on the same loop and period', () => {
    open(`/trend?loop=FIC1${PIN}`);
    expect(screen.getByRole('button', { name: 'Historical ↗' }).getAttribute('data-variant')).toBe('flat');
    fireEvent.click(screen.getByRole('button', { name: 'Historical ↗' }));
    expect(where()).toBe('/cpm/historical?loop=FIC1&from=2026-11-06T10:45:00.000Z&to=2026-11-06T22:45:00.000Z');
  });

  it('Historical ↗ on a live range carries the period on screen', () => {
    open('/trend?loop=FIC1&range=24h');
    fireEvent.click(screen.getByRole('button', { name: 'Historical ↗' }));
    expect(where()).toBe('/cpm/historical?loop=FIC1&from=2026-11-10T17:48:00.000Z&to=2026-11-11T17:48:00.000Z');
  });

  it('are not offered without one loop in the registry', () => {
    open('/trend?loop=NOPE');
    expect(screen.queryByRole('button', { name: 'Loop Explorer ↗' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Historical ↗' })).toBeNull();
    cleanup();
    open('/trend');
    expect(screen.queryByRole('button', { name: 'Historical ↗' })).toBeNull();
  });
});

describe('Signals ▾ (CHG-175)', () => {
  const box = (name: RegExp) => within(screen.getByRole('group', { name: 'Signals' })).getByRole('checkbox', { name }) as HTMLInputElement;

  it('brings a removed pen back', () => {
    open('/trend?loop=FIC1&roles=PV,OP,VP');
    fireEvent.click(screen.getByRole('button', { name: /Signals/ }));
    expect(box(/^SP$/).checked).toBe(false);
    expect(box(/^PV$/).checked).toBe(true);
    fireEvent.click(box(/^SP$/));
    expect(where()).toContain('roles=PV,SP,OP,VP');
    expect(core.pens.map(p => p.label)).toEqual(['PV', 'SP', 'OP', 'VP']);
  });

  it('lists the roles the loop has not mapped as unavailable', () => {
    open('/trend?loop=TIC2');
    fireEvent.click(screen.getByRole('button', { name: /Signals/ }));
    expect(box(/^VP/).disabled).toBe(true);
    expect(box(/^VP/).closest('label')?.textContent).toContain('unmapped');
    expect(box(/^PV$/).disabled).toBe(false);
  });

  it('is offered only for the pens of one loop, never for tags from a link', () => {
    open('/trend?loop=FIC1&tags=a.b');
    expect(screen.queryByRole('button', { name: /Signals/ })).toBeNull();
    cleanup();
    open('/trend');
    expect(screen.queryByRole('button', { name: /Signals/ })).toBeNull();
  });
});

describe('what the chart says (CHG-175)', () => {
  it('says Select a loop on the empty page, with no foot', () => {
    open('/trend');
    expect(screen.getByTestId('core-empty').textContent).toBe('Select a loop');
    expect(core.frame?.state).toBeNull();
  });

  it('leaves Loop not found to the band, and says nothing new while loading', () => {
    open('/trend?loop=NOPE');
    expect(screen.queryByText('Loop not found')).toBeNull();
    expect(screen.getByTestId('core-empty').textContent).toBe('');
    cleanup();
    loopsState = { loading: true, error: null };
    open('/trend?loop=FIC1');
    expect(screen.getByTestId('core-empty').textContent).toBe('');
  });

  it('says once that a loop has no signal tags', () => {
    open('/trend?loop=EMPTY');
    expect(screen.getAllByText('EMPTY has no signal tags mapped.')).toHaveLength(1);
  });

  it('shows the read error with a retry, not Loop not found', () => {
    loopsState = { loading: false, error: new Error('loops unavailable') };
    open('/trend?loop=FIC1');
    expect(screen.getByText('loops unavailable')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('names the state in the foot from the newest sample: Live, or No new samples', () => {
    open('/trend?loop=FIC1');
    expect(core.frame?.state).toBe('stale'); // pens, but no samples yet
    act(() => core.onSampleAge?.(5_000, 15 * 60_000));
    expect(core.frame?.state).toBe('live');
    act(() => core.onSampleAge?.(600_000, 15 * 60_000));
    expect(core.frame?.state).toBe('stale');
    expect(core.emptyLegendText).toBe('');
  });
});

describe('without analytics.view', () => {
  it('keeps the band without the loop field, the rest the same', () => {
    held.splice(0, held.length, 'historian.view');
    open('/trend?tags=a.b');
    expect(screen.queryByTestId('loop-band')).toBeNull();
    expect(core.pens.map(p => p.path)).toEqual(['a.b']);
    expect(range()).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Signals/ })).toBeNull();
    cleanup();
    open('/trend');
    expect(screen.getByTestId('core-empty').textContent).toBe('No tags selected');
    expect(screen.queryByText('Select a loop')).toBeNull();
  });
});
