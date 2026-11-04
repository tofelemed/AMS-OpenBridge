import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { CpmEventFrame } from '../../../api/cpmApi';
import { frame } from './testFrame';

const { pageHook, byIdHook, conditionsHook, ctx, emptyMutation } = vi.hoisted(() => ({
  pageHook: vi.fn(),
  byIdHook: vi.fn(),
  conditionsHook: vi.fn(),
  ctx: { current: null as unknown },
  emptyMutation: () => ({ mutate: () => undefined, reset: () => undefined, isPending: false, isError: false, error: null }),
}));

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('../../../cpa/useCpaContext', async orig => ({
  ...(await orig<typeof import('../../../cpa/useCpaContext')>()),
  useCpaContext: () => ctx.current,
}));
vi.mock('../../../components/Cpm/events/useEventPage', () => ({
  useEventPage: (q: unknown) => pageHook(q),
  useEventById: (id: number | null, enabled: boolean) => byIdHook(id, enabled),
  useDebounced: <T,>(v: T) => v,
}));
vi.mock('../../../components/Cpm/events/useConditions', () => ({
  useCpmConditions: (...a: unknown[]) => conditionsHook(...a),
}));
vi.mock('../../../hooks/useCpm', () => ({
  useAcknowledgeEvent: emptyMutation,
  useShelveEvent: emptyMutation,
  useUnshelveEvent: emptyMutation,
  useEventActions: () => ({ isLoading: false, isError: false, data: { actions: [] } }),
}));
vi.mock('../../../hooks/useLoopNotes', () => ({
  useEventNotes: () => ({ data: { investigations: [] }, isError: false }),
  useLoopNotes: () => ({ data: { investigations: [] } }),
  useCreateLoopNote: emptyMutation,
  useLinkLoopNote: emptyMutation,
}));
vi.mock('../../../store/authStore', () => ({
  useAuthStore: (f: (s: unknown) => unknown) => f({ hasPermission: () => true, user: { username: 'eng.a' } }),
}));

import EpisodesPage from './EpisodesPage';

const COUNTS = { all: 500, open: 325, unobservable: 40, unacknowledged: 300, acknowledged: 10, shelved: 2, shelfExpired: 1, closed: 175 };

const scopeOf = (site = '') => ({
  site, area: '', unit: '', active: !!site, params: site ? { site } : {}, matches: () => true, set: () => undefined,
});

const pageOf = (events: CpmEventFrame[], over: Record<string, unknown> = {}, total = 500) => ({
  data: {
    total, page: 1, pageSize: 20, pageCount: Math.max(1, Math.ceil(total / 20)), state: 'all', sort: 'triage', counts: COUNTS,
    shelvePolicy: { maxHours: 168 }, events,
  },
  isLoading: false, isError: false, error: null, refetch: vi.fn(), isPlaceholderData: false, dataUpdatedAt: Date.parse('2026-11-04T09:00:00Z'),
  ...over,
});

const noLookup = { data: undefined, isLoading: false, error: null, refetch: vi.fn() };
const noConditions = { data: { conditions: [] }, isLoading: false, isError: false, error: null, refetch: vi.fn() };

const Probe: React.FC = () => <output data-testid="search">{useLocation().search}</output>;
const urlParams = () => new URLSearchParams(screen.getByTestId('search').textContent ?? '');

const mount = (url = '/cpm/events') => render(
  <MemoryRouter initialEntries={[url]}><EpisodesPage /><Probe /></MemoryRouter>,
);

const rowOf = (text: string) => screen.getByText(text).closest('tr') as HTMLTableRowElement;

beforeEach(() => {
  ctx.current = { scope: scopeOf(), range: { key: '24h', from: null, to: null }, window: null, loop: '', zone: { id: 'UTC', abbr: 'UTC' }, setRange: () => undefined };
  pageHook.mockReturnValue(pageOf([frame({ id: 1 }), frame({ id: 2, loop_id: 'TIC2' })]));
  byIdHook.mockReturnValue(noLookup);
  conditionsHook.mockReturnValue(noConditions);
});
afterEach(() => { cleanup(); pageHook.mockReset(); byIdHook.mockReset(); conditionsHook.mockReset(); });

describe('episode ledger', () => {
  const cellsOf = (row: HTMLTableRowElement) => [...row.cells].map(c => c.textContent);

  it('has every column of the specification', () => {
    mount();
    const heads = screen.getAllByRole('columnheader').map(h => h.textContent?.replace(/[↕↑↓]/g, '').trim());
    expect(heads.slice(0, 10)).toEqual([
      'Episode', 'Loop', 'Severity now', 'Peak', 'Current verdict', 'Acknowledgement', 'Availability', 'Opened', 'Duration', 'Shelf',
    ]);
  });

  it('renders a row from the data, with severity now and peak apart (D-37)', () => {
    pageHook.mockReturnValue(pageOf([frame({
      id: 7, loop_id: 'FIC7', severity: 'LOW', peak_diagnosis: 'CONFIRMED_OSCILLATION', peak_confidence: 0.91,
      last_diagnosis: 'INSUFFICIENT_DATA', availability_state: 'UNOBSERVABLE', ack_state: 'ACKNOWLEDGED',
      opened_at: '2026-11-01T07:45:00Z', closed_at: '2026-11-01T09:45:00Z', condition_state: 'CLOSED',
    })]));
    mount();
    const cells = cellsOf(rowOf('FIC7'));
    expect(cells[0]).toBe('Sustained oscillation, peak confirmedEVT-7 · 24h');
    expect(cells[1]).toBe('FIC7');
    expect(cells[2]).toContain('Low');
    expect(cells[3]).toContain('Confirmed');
    expect(cells[3]).toContain('91');
    expect(cells[4]).toContain('Not evaluated: not enough data');
    expect(cells[5]).toContain('Acknowledged');
    expect(cells[6]).toContain('Unobservable');
    expect(cells[7]).toContain('1 Nov 2026, 07:45 UTC');
    expect(cells[8]).toBe('2 h');
  });

  it('reads times in the site zone, with its abbreviation', () => {
    ctx.current = { ...(ctx.current as object), zone: { id: 'Asia/Dubai', abbr: 'GST' } };
    mount();
    expect(cellsOf(rowOf('TIC2'))[7]).toMatch(/1 Nov 2026, 11:45 /);
  });

  it('a missing severity, score or verdict is a dash, never 0', () => {
    pageHook.mockReturnValue(pageOf([frame({ loop_id: 'FIC8', severity: null, peak_confidence: null as unknown as number, last_diagnosis: null })]));
    mount();
    const cells = cellsOf(rowOf('FIC8'));
    expect(cells[2]).toBe('—Not recorded');
    expect(cells[3]).toContain('No evidence score');
    expect(cells[3]).not.toContain('0');
    expect(cells[4]).toBe('—Not recorded');
  });

  it('a real 0 evidence score stays 0', () => {
    pageHook.mockReturnValue(pageOf([frame({ loop_id: 'FIC9', peak_confidence: 0 })]));
    mount();
    expect(cellsOf(rowOf('FIC9'))[3]).toContain('0');
  });

  it('shows the shelf as its own field', () => {
    const until = new Date(Date.now() + 3 * 3_600_000).toISOString();
    pageHook.mockReturnValue(pageOf([frame({ loop_id: 'FIC3', shelf_state: 'SHELVED', shelve_until: until }), frame({ id: 2, loop_id: 'FIC4' })]));
    mount();
    expect(cellsOf(rowOf('FIC3'))[9]).toMatch(/Shelved.*expires in/);
    expect(cellsOf(rowOf('FIC3'))[5]).toContain('Unacknowledged');
    expect(cellsOf(rowOf('FIC4'))[9]).toContain('Not shelved');
  });

  it('marks shelved neutral, unacknowledged warning, acknowledged info', () => {
    const until = new Date(Date.now() + 3_600_000).toISOString();
    pageHook.mockReturnValue(pageOf([frame({ loop_id: 'FIC3', shelf_state: 'SHELVED', shelve_until: until, ack_state: 'ACKNOWLEDGED' }), frame({ id: 2, loop_id: 'FIC4' })]));
    mount();
    const row3 = rowOf('FIC3');
    expect(row3.cells[9].querySelector('.ui-badge--neutral')).toBeTruthy();
    expect(row3.cells[5].querySelector('.ui-badge--info')).toBeTruthy();
    expect(rowOf('FIC4').cells[5].querySelector('.ui-badge--warning')).toBeTruthy();
  });

  it('shows no raw engine code in a row', () => {
    mount();
    expect(rowOf('TIC2').textContent).not.toMatch(/[A-Z]+_[A-Z]+/);
  });
});

describe('ledger states', () => {
  it('loading', () => {
    pageHook.mockReturnValue({ data: undefined, isLoading: true, isError: false, error: null, refetch: vi.fn() });
    mount();
    expect(screen.getByText('Loading Episode ledger')).toBeTruthy();
    expect(screen.getByText('Loading episode counts')).toBeTruthy();
  });

  it('error with a reason and a retry, never with empty text', () => {
    const refetch = vi.fn();
    pageHook.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error(''), refetch });
    mount();
    expect(screen.getByText('The service did not respond.', { selector: '.ui-state__reason' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('filtered empty offers Reset, which clears the filter, the loop and the search', () => {
    ctx.current = { ...(ctx.current as object), loop: 'FIC1' };
    pageHook.mockReturnValue(pageOf([], {}, 0));
    mount('/cpm/events?filter=closed&loop=FIC1');
    expect(screen.getByText('No records match these filters')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(urlParams().get('filter')).toBeNull();
    expect(urlParams().get('loop')).toBeNull();
  });

  it('empty in a plant scope points to the header', () => {
    ctx.current = { ...(ctx.current as object), scope: scopeOf('hdpe') };
    pageHook.mockReturnValue(pageOf([], {}, 0));
    mount('/cpm/events?site=hdpe');
    expect(screen.getByText('No episodes in this plant scope')).toBeTruthy();
    expect(screen.getByText('Choose a wider plant scope in the header.')).toBeTruthy();
  });

  it('nothing recorded at all links to current results, keeping the context', () => {
    pageHook.mockReturnValue(pageOf([], {}, 0));
    mount('/cpm/events?range=7d');
    expect(screen.getByText('No episodes recorded')).toBeTruthy();
    const href = screen.getByRole('link', { name: 'Current results in Performance' }).getAttribute('href');
    expect(href).toBe('/cpm/performance?range=7d');
  });

  it('a failed refresh keeps the rows and labels them stale', () => {
    pageHook.mockReturnValue(pageOf([frame({ id: 1 })], { isError: true, error: new Error('Timeout') }, 1));
    mount();
    expect(screen.getByText('Could not refresh')).toBeTruthy();
    expect(screen.getByText(/Showing the list from 4 Nov 2026, 09:00 UTC/)).toBeTruthy();
    expect(rowOf('FIC1')).toBeTruthy();
  });

  it('counts its rows and states the order', () => {
    ctx.current = { ...(ctx.current as object), loop: 'FIC1' };
    mount('/cpm/events?sort=recent&loop=FIC1');
    expect(screen.getByText('500 episodes for FIC1 · newest first')).toBeTruthy();
  });
});

describe('fast conditions', () => {
  const condition = (over: Record<string, unknown>) => ({
    loopId: 'FIC5', displayName: 'Feed flow', site: 'hdpe', gate: 'G10', kind: 'LIMIT_LOW', state: 'OPEN',
    startMs: Date.now() - 300_000, lastMs: Date.now() - 30_000, endMs: null, durationS: 240, closeReason: '', evidence: {}, updatedAt: '',
    ...over,
  });

  it('asks for the header scope and lists conditions, gate name first', () => {
    ctx.current = { ...(ctx.current as object), scope: scopeOf('hdpe') };
    conditionsHook.mockReturnValue({ ...noConditions, data: { conditions: [condition({})] } });
    mount('/cpm/events?site=hdpe&range=7d');
    expect(conditionsHook.mock.calls[0][0]).toEqual({ site: 'hdpe' });
    expect(screen.getByRole('heading', { name: /Fast conditions · 1 open/ })).toBeTruthy();
    expect(screen.getByText('Limit low')).toBeTruthy();
    expect(screen.getByText('Valve / saturation · G10')).toBeTruthy();
    const href = screen.getByRole('link', { name: 'FIC5' }).getAttribute('href') ?? '';
    const q = new URLSearchParams(href.split('?')[1]);
    expect(href.startsWith('/cpm/evidence?')).toBe(true);
    expect(q.get('loop')).toBe('FIC5');
    expect(q.get('kind')).toBe('15m');
    expect(q.get('site')).toBe('hdpe');
    expect(q.get('range')).toBe('7d');
  });

  it('an open condition with no recent update is stale, never live', () => {
    conditionsHook.mockReturnValue({ ...noConditions, data: { conditions: [condition({ lastMs: Date.now() - 3_600_000 })] } });
    mount();
    expect(screen.getByText('Open, stale')).toBeTruthy();
    expect(screen.getByText(/Last update/)).toBeTruthy();
  });

  it('says when the list may be cut short', () => {
    conditionsHook.mockReturnValue({ ...noConditions, data: { conditions: Array.from({ length: 200 }, (_, i) => condition({ startMs: i })) } });
    mount();
    expect(screen.getByText('First 200 shown.')).toBeTruthy();
  });

  it('has its empty, loading and error states', () => {
    mount();
    expect(screen.getByText('No fast conditions in scope')).toBeTruthy();
    cleanup();
    conditionsHook.mockReturnValue({ data: undefined, isLoading: true, isError: false, error: null, refetch: vi.fn() });
    mount();
    expect(screen.getByText('Loading Fast conditions')).toBeTruthy();
    cleanup();
    const refetch = vi.fn();
    conditionsHook.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error('Conditions down'), refetch });
    mount();
    expect(screen.getByText('Conditions down')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Show open' })).toBeTruthy();
  });
});
