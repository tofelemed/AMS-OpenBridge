// 2026-09-17 audit F22: the fast G10 limit-dwell / G11 freeze conditions (minutes, not the 4/12/24 h windows) on Loop Events:
// open first with their age and duration, closed ones with their close reason.
// CHG-167 (owner review, the approved sample and answer 4): a search, an All / Open / Closed dropdown with the counts and the
// shared pager (on the client: the conditions read returns every row); rows read "◌ Open · stale" and "Limit high" over
// "G10 · Valve / saturation"; a row only selects; the panel holds Workbench ↗ and Window Inspector ↗, Loop Explorer → in its foot.
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { setActiveZone } from '../../../cpa/activeZone';
import type { CpmCondition } from '../../../api/cpm/conditions';

const { condHook } = vi.hoisted(() => ({ condHook: vi.fn() }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
vi.mock('./useConditions', () => ({ useCpmConditions: (...a: unknown[]) => condHook(...a) }));

import { conditionBadge, conditionRows, filterConditions } from './conditionRows';
import { ConditionsView } from './ConditionsView';
import { ConditionDetail } from './ConditionDetail';
import { stamp } from './eventTime';

beforeAll(() => setActiveZone('UTC'));
afterEach(() => { cleanup(); condHook.mockReset(); });

const NOW = Date.UTC(2026, 8, 17, 12, 0);
const c = (over: Partial<CpmCondition>): CpmCondition => ({
  loopId: 'FIC10301', displayName: 'Flow controller FIC10301', site: 'hdpe', gate: 'G11', kind: 'FREEZE', state: 'UPDATE',
  startMs: NOW - 5 * 60_000, lastMs: NOW - 60_000, endMs: null, durationS: 240, closeReason: '', evidence: {}, updatedAt: '2026-09-17T11:59:00Z', ...over,
});
const answer = (list: CpmCondition[], over: object = {}) =>
  ({ data: { count: list.length, openOnly: false, conditions: list }, isLoading: false, isError: false, error: null, refetch: vi.fn(), ...over });
const Where = () => { const l = useLocation(); return <output data-testid="where">{l.pathname + l.search}</output>; };
const where = () => new URL(screen.getByTestId('where').textContent!, 'http://x');
const mountView = (url = '/cpm/events?view=conditions') =>
  render(<MemoryRouter initialEntries={[url]}><ConditionsView scope={{}} /><Where /></MemoryRouter>);
const rowsOf = () => [...document.querySelectorAll('.cpm-conditions-grid.cpm-event-row')] as HTMLElement[];
/** Eleven open conditions on eleven loops (the newest first), then one closed one. */
const twelve = () => [
  ...Array.from({ length: 11 }, (_, i) => c({ loopId: `TIC${200 + i}`, displayName: `Temperature controller TIC${200 + i} (FCS0102)`, gate: 'G10', kind: 'LIMIT_HIGH', startMs: NOW - (i + 1) * 60_000 })),
  c({ loopId: 'FIC999', state: 'CLOSED', endMs: NOW - 60_000, closeReason: 'RECOVERED', startMs: NOW - 9e6 }),
];

describe('conditionRows', () => {
  it('reads an open condition as open with its age and a closed one with its reason', () => {
    const rows = conditionRows([c({}), c({ gate: 'G10', kind: 'LIMIT_LOW', state: 'CLOSED', endMs: NOW - 3_600_000, closeReason: 'RECOVERED', durationS: 90 })], NOW);
    expect(rows[0]).toMatchObject({ open: true, label: 'Freeze', gateLabel: 'G11', since: '5 min ago', duration: '4 min', reason: '' });
    expect(rows[1]).toMatchObject({ open: false, label: 'Limit low', gateLabel: 'G10', duration: '1.5 min', reason: 'recovered' });
  });

  it('an open condition the engine stopped updating is stale, never live', () => {
    const rows = conditionRows([c({ startMs: NOW - 17 * 3_600_000, lastMs: NOW - 17 * 3_600_000 + 90_000 })], NOW);
    expect(rows[0]).toMatchObject({ open: true, stale: true, lastUpdate: '17 h ago' });
    expect(conditionRows([c({})], NOW)[0].stale).toBe(false);
  });

  it('names the gate, the loop without its tag, and the times as the page writes them', () => {
    const row = conditionRows([c({ gate: 'G10', startMs: Date.UTC(2026, 10, 7, 10, 24), lastMs: Date.UTC(2026, 10, 7, 11, 51) })], NOW)[0];
    expect(row).toMatchObject({ gateTitle: 'G10 · Valve / saturation', description: 'Flow controller', started: '7 Nov 10:24', last: '7 Nov 11:51' });
  });

  it('badges a condition with tone, glyph and word', () => {
    const [open, stale, closed] = conditionRows([c({}), c({ lastMs: NOW - 3_600_000 }), c({ state: 'CLOSED', closeReason: 'RECOVERED' })], NOW);
    expect(conditionBadge(open)).toEqual({ label: 'Open', tone: 'warn', glyph: '●' });
    expect(conditionBadge(stale)).toEqual({ label: 'Open · stale', tone: 'muted', glyph: '◌' });
    expect(conditionBadge(closed)).toEqual({ label: 'Closed', tone: 'muted', glyph: '○' });
  });

  it('finds a condition by loop or description, and by state (stale counts as open)', () => {
    const rows = conditionRows([c({}), c({ loopId: 'TIC20607', displayName: 'Temperature controller (FCS0102)', lastMs: NOW - 3_600_000 }),
      c({ loopId: 'LIC1', displayName: 'Level', state: 'CLOSED' })], NOW);
    expect(filterConditions(rows, 'tic206', 'all').map(r => r.loopId)).toEqual(['TIC20607']);
    expect(filterConditions(rows, 'temperature', 'all').map(r => r.loopId)).toEqual(['TIC20607']);
    expect(filterConditions(rows, '', 'open').map(r => r.loopId)).toEqual(['FIC10301', 'TIC20607']);
    expect(filterConditions(rows, '', 'closed').map(r => r.loopId)).toEqual(['LIC1']);
  });
});

describe('Fast conditions list (CHG-167)', () => {
  it('reads every condition, the filters inside the list: search first, then the state with its counts', () => {
    condHook.mockReturnValue(answer(twelve()));
    mountView();
    expect(condHook.mock.calls[0][1]).toBe(false);
    expect(condHook.mock.calls[0][2]).toBe(2000);
    const find = screen.getByLabelText('Find a condition') as HTMLInputElement;
    expect(find.placeholder).toBe('Loop or description');
    const state = screen.getByLabelText('Condition state') as HTMLSelectElement;
    expect([...state.options].map(o => o.textContent)).toEqual(['All 12', 'Open 11', 'Closed 1']);
    expect(find.compareDocumentPosition(state) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText(/Conditions ·/)).toBeNull();
  });

  it('shows State, Loop, Condition, Started · UTC, Duration and Close reason, the condition over its gate', () => {
    condHook.mockReturnValue(answer([c({ gate: 'G10', kind: 'LIMIT_HIGH', lastMs: NOW - 3_600_000, startMs: Date.UTC(2026, 8, 17, 10, 24) })]));
    const { container } = mountView();
    const head = container.querySelector('.cpm-event-head.cpm-conditions-grid')!;
    expect([...head.children].map(h => h.textContent)).toEqual(['State', 'Loop', 'Condition', 'Started · UTC', 'Duration', 'Close reason']);
    const row = rowsOf()[0];
    expect(row.textContent).toContain('◌Open · stale');
    expect(row.textContent).not.toMatch(/last update|ago/);
    expect(row.textContent).toContain('Limit highG10 · Valve / saturation');
    expect(row.textContent).toContain(stamp(Date.UTC(2026, 8, 17, 10, 24)));
    expect(within(row).queryByRole('link')).toBeNull();   // the row only selects
  });

  it('pages ten rows at a time with the shared pager, and a filter starts again at page 1', () => {
    condHook.mockReturnValue(answer(twelve()));
    mountView();
    expect(rowsOf()).toHaveLength(10);
    expect(screen.getByText('Page 1 of 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(rowsOf().map(r => r.textContent?.match(/[A-Z]{3}\d+/)?.[0])).toEqual(['TIC210', 'FIC999']);
    fireEvent.change(screen.getByLabelText('Condition state'), { target: { value: 'closed' } });
    expect(rowsOf()).toHaveLength(1);
    expect(screen.queryByRole('navigation', { name: /pages/ })).toBeNull();
    fireEvent.change(screen.getByLabelText('Condition state'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('Find a condition'), { target: { value: 'tic201' } });
    expect(rowsOf().map(r => r.textContent?.match(/[A-Z]{3}\d+/)?.[0])).toEqual(['TIC201']);
  });

  it('says no condition matches, with no panel beside an empty list', () => {
    condHook.mockReturnValue(answer(twelve()));
    mountView();
    fireEvent.change(screen.getByLabelText('Find a condition'), { target: { value: 'zzz' } });
    expect(screen.getByText('No condition matches')).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });

  it('a row selects the condition in the address and the panel, and a linked one opens on its page', () => {
    condHook.mockReturnValue(answer(twelve()));
    mountView();
    fireEvent.click(rowsOf()[2]);
    expect(where().searchParams.get('condition')).toMatch(/^TIC202\|G10\|LIMIT_HIGH\|/);
    expect(rowsOf()[2].getAttribute('aria-current')).toBe('true');
    cleanup();
    const key = conditionRows(twelve(), NOW)[11].key;
    mountView(`/cpm/events?view=conditions&condition=${encodeURIComponent(key)}`);
    expect(screen.getByText('Page 2 of 2')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Freeze' })).toBeTruthy();
  });

  it('states loading, an error and an empty plant', () => {
    condHook.mockReturnValue(answer([], { data: undefined, isLoading: true }));
    mountView();
    expect(screen.getByText(/Loading the fast conditions/)).toBeTruthy();
    cleanup();
    condHook.mockReturnValue(answer([], { data: undefined, isError: true, error: new Error('boom') }));
    mountView();
    expect(screen.getByText('boom')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    cleanup();
    condHook.mockReturnValue(answer([]));
    mountView();
    expect(screen.getByText('No fast conditions in scope')).toBeTruthy();
  });
});

describe('ConditionDetail (CHG-167)', () => {
  const mountDetail = (over: Partial<CpmCondition>) => render(<MemoryRouter>
    <ConditionDetail row={conditionRows([c(over)], NOW)[0]} open onClose={() => undefined} /><Where /></MemoryRouter>);

  it('heads the panel with the condition and its state; Gate, Started, Duration, Last update', () => {
    mountDetail({ gate: 'G10', kind: 'LIMIT_HIGH', lastMs: Date.UTC(2026, 8, 17, 11, 0), startMs: Date.UTC(2026, 8, 17, 10, 24) });
    const heading = screen.getByRole('heading', { name: 'Limit high' });
    expect(heading.parentElement?.textContent).toContain('◌Open · stale');
    const labels = [...document.querySelectorAll('.ui-inspector__body .cpm-kv__label')].map(l => l.textContent);
    expect(labels).toEqual(['Gate', 'Started', 'Duration', 'Last update']);
    expect(screen.getByText('G10 · Valve / saturation')).toBeTruthy();
    expect(screen.getByText('not updated for 10 min or more')).toBeTruthy();
    expect(screen.queryByText(/Review /)).toBeNull();
  });

  it('shows the close reason of a closed condition and no stale line', () => {
    mountDetail({ state: 'CLOSED', closeReason: 'RECOVERED', lastMs: NOW - 3_600_000 });
    expect([...document.querySelectorAll('.cpm-kv__label')].map(l => l.textContent)).toContain('Close reason');
    expect(screen.getByText('recovered')).toBeTruthy();
    expect(screen.queryByText('not updated for 10 min or more')).toBeNull();
  });

  it('opens the Workbench and the Window Inspector at 15m, and the Loop Explorer at the gate from its foot', () => {
    mountDetail({});
    fireEvent.click(screen.getByRole('button', { name: 'Workbench ↗' }));
    expect(screen.getByTestId('where').textContent).toBe('/cpm/evidence?loop=FIC10301&kind=15m');
    fireEvent.click(screen.getByRole('button', { name: 'Window Inspector ↗' }));
    expect(screen.getByTestId('where').textContent).toBe('/cpm/windows?loop=FIC10301&profile=15m');
    const foot = document.querySelector('.ui-inspector__foot')!;
    expect(foot.textContent).toContain('FIC10301 · Flow controller');
    fireEvent.click(within(foot as HTMLElement).getByRole('button', { name: 'Loop Explorer →' }));
    const url = where();
    expect(url.pathname).toBe('/cpm/explorer');
    expect(url.searchParams.get('loop')).toBe('FIC10301');
    expect(url.searchParams.get('tab')).toBe('Summary');
    expect(url.searchParams.get('gate')).toBe('G11');
  });
});
