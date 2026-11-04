import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ApiError } from '../../../api/apiFetch';
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

describe('the list request', () => {
  it('sends the URL filter, order, loop, scope, search and page to the server', () => {
    ctx.current = { ...(ctx.current as object), loop: 'FIC1', scope: scopeOf('hdpe') };
    mount('/cpm/events?filter=open&sort=recent&loop=FIC1');
    expect(pageHook.mock.calls[0][0]).toEqual({ state: 'open', sort: 'recent', loopId: 'FIC1', site: 'hdpe', q: undefined, page: 1, pageSize: 20 });
    fireEvent.change(screen.getByLabelText('Find'), { target: { value: 'stiction' } });
    expect(pageHook.mock.calls.at(-1)?.[0]).toMatchObject({ q: 'stiction', page: 1 });
  });

  it('a bogus filter reads All, and the control agrees', () => {
    mount('/cpm/events?filter=bogus');
    expect(pageHook.mock.calls[0][0]).toMatchObject({ state: 'all' });
    expect(screen.getByRole('button', { name: /^All/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('turns the page on the server, and a changed filter never asks for the old page', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(pageHook.mock.calls.at(-1)?.[0]).toMatchObject({ page: 2 });
    expect(screen.getByText('21–40 of 500')).toBeTruthy();
    pageHook.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /^Closed/ }));
    expect(pageHook.mock.calls.every(c => c[0].page === 1)).toBe(true);
    expect(urlParams().get('filter')).toBe('closed');
  });

  it('a page emptied by a write falls back to the new last page', () => {
    mount();
    pageHook.mockReturnValue(pageOf([], {}, 480));
    fireEvent.click(screen.getByRole('button', { name: 'Last page' }));
    expect(pageHook.mock.calls.at(-1)?.[0]).toMatchObject({ page: 24 });
  });

  it('removing the loop chip clears the URL', () => {
    ctx.current = { ...(ctx.current as object), loop: 'FIC1' };
    mount('/cpm/events?loop=FIC1');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Loop FIC1' }));
    expect(urlParams().get('loop')).toBeNull();
  });
});

describe('the header range (RD3)', () => {
  it('sends no time range, because the endpoint takes none', () => {
    ctx.current = { ...(ctx.current as object), range: { key: 'custom', from: '2026-11-01T00:00:00Z', to: '2026-11-02T00:00:00Z' } };
    mount();
    const sent = pageHook.mock.calls[0][0];
    expect(sent).not.toHaveProperty('from');
    expect(sent).not.toHaveProperty('to');
    expect(sent).not.toHaveProperty('range');
  });

  it('says what the list covers', () => {
    mount();
    expect(screen.getByText(/All plant areas · All retained episodes\. The 24 h range does not filter this list\./)).toBeTruthy();
  });

  it('words a custom range in the site zone', () => {
    ctx.current = {
      ...(ctx.current as object),
      zone: { id: 'Asia/Dubai', abbr: 'GST' },
      range: { key: 'custom', from: '2026-11-01T00:00:00Z', to: '2026-11-02T00:00:00Z' },
    };
    mount();
    expect(screen.getByText(/The 1 Nov 2026, 04:00 .* to 2 Nov 2026, 04:00 .* range does not filter this list/)).toBeTruthy();
  });

  it('never claims a closed-in-range figure: it reads Unavailable and names the all-time count', () => {
    mount();
    const strip = screen.getByLabelText('Episode summary');
    const figure = within(strip).getByText('Closed in range').closest('.ui-metric') as HTMLElement;
    expect(figure.textContent).toContain('Unavailable');
    expect(figure.textContent).toContain('175 closed in all retained episodes.');
    expect(figure.querySelector('.ui-metric__value')).toBeNull();
  });
});

describe('summary strip', () => {
  const figure = (label: string) => within(screen.getByLabelText('Episode summary')).getByText(label).closest('.ui-metric') as HTMLElement;

  it('shows the server counts, each with its definition and drill-down', () => {
    mount('/cpm/events?site=hdpe&range=7d&sort=recent');
    expect(figure('Open').querySelector('.ui-metric__value')?.textContent).toBe('325');
    expect(figure('Unacknowledged').querySelector('.ui-metric__value')?.textContent).toBe('300');
    expect(figure('Shelved').querySelector('.ui-metric__value')?.textContent).toBe('2');
    expect(figure('Shelved').textContent).toContain('1 shelf expired');
    expect(screen.getByRole('button', { name: 'About Open' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'About Shelved' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'About Closed in range' })).toBeTruthy();
    const href = screen.getByRole('link', { name: 'Show unacknowledged' }).getAttribute('href') ?? '';
    const q = new URLSearchParams(href.split('?')[1]);
    expect(href.startsWith('/cpm/events?')).toBe(true);
    expect(q.get('filter')).toBe('unacknowledged');
    expect(q.get('site')).toBe('hdpe');
    expect(q.get('range')).toBe('7d');
    expect(q.get('sort')).toBe('recent');
  });

  it('a real 0 stays 0', () => {
    pageHook.mockReturnValue({ ...pageOf([frame({})]), data: { ...pageOf([frame({})]).data, counts: { ...COUNTS, open: 0, shelfExpired: 0 } } });
    mount();
    expect(figure('Open').querySelector('.ui-metric__value')?.textContent).toBe('0');
    expect(figure('Shelved').textContent).toContain('0 shelf expired');
    expect(screen.getByRole('button', { name: /^Open 0$/ })).toBeTruthy();
  });

  it('a missing count is Unavailable, never 0', () => {
    const counts: Partial<typeof COUNTS> = { ...COUNTS };
    delete counts.open;
    delete counts.shelfExpired;
    pageHook.mockReturnValue({ ...pageOf([frame({})]), data: { ...pageOf([frame({})]).data, counts } });
    mount();
    expect(figure('Open').textContent).toContain('Unavailable');
    expect(figure('Open').querySelector('.ui-metric__value')).toBeNull();
    expect(figure('Shelved').textContent).toContain('Shelf expired: Unavailable');
    expect(screen.getByRole('button', { name: /^Open$/ })).toBeTruthy();
  });

  it('a failed read leaves every figure Unavailable with its reason', () => {
    pageHook.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error('Gateway timeout'), refetch: vi.fn() });
    mount();
    expect(figure('Open').textContent).toContain('Unavailable');
    expect(figure('Open').textContent).toContain('Gateway timeout');
    expect(figure('Closed in range').textContent).toContain('Gateway timeout');
  });
});

describe('filters', () => {
  it('shows every state with its count, and the triage rule behind ⓘ', () => {
    mount();
    for (const name of ['All 500', 'Open 325', 'Unobservable 40', 'Unacknowledged 300', 'Acknowledged 10', 'Shelved 2', 'Shelf expired 1', 'Closed 175']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole('button', { name: 'About Triage order' }));
    expect(screen.getByText('Open first, highest evidence score first.')).toBeTruthy();
  });

  it('Order and the headings ask the server for its two orders', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Newest' }));
    expect(pageHook.mock.calls.at(-1)?.[0]).toMatchObject({ sort: 'recent' });
    expect(urlParams().get('sort')).toBe('recent');
    expect(screen.getByRole('columnheader', { name: /^Opened/ }).getAttribute('aria-sort')).toBe('descending');
    expect(screen.getByRole('columnheader', { name: /^Peak/ }).getAttribute('aria-sort')).toBe('none');
    fireEvent.click(within(screen.getByRole('columnheader', { name: /^Peak/ })).getByRole('button'));
    expect(pageHook.mock.calls.at(-1)?.[0]).toMatchObject({ sort: 'triage' });
    expect(urlParams().get('sort')).toBeNull();
  });
});

describe('selection', () => {
  it('picks nothing by itself, so nothing can be acknowledged unseen', () => {
    mount();
    expect(screen.getByText('Select an episode')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Acknowledge' })).toBeNull();
    expect(document.querySelector('[aria-current="true"]')).toBeNull();
  });

  it('Enter on a focused row selects it, in the URL', () => {
    mount();
    const row = rowOf('TIC2');
    expect(row.getAttribute('tabindex')).toBe('0');
    row.focus();
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(urlParams().get('event')).toBe('2');
    expect(rowOf('TIC2').getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Sustained oscillation, peak confirmed' })).toBeTruthy();
  });

  it('Space selects and the arrows move between rows', () => {
    mount();
    const first = rowOf('FIC1');
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rowOf('TIC2'));
    fireEvent.keyDown(rowOf('TIC2'), { key: ' ' });
    expect(urlParams().get('event')).toBe('2');
  });

  it('a click selects too', () => {
    mount();
    fireEvent.click(rowOf('FIC1'));
    expect(urlParams().get('event')).toBe('1');
  });

  it('a shared link opens that episode with no extra read when it is on the page', () => {
    mount('/cpm/events?event=2');
    expect(byIdHook).toHaveBeenCalledWith(2, false);
    expect(rowOf('TIC2').getAttribute('aria-current')).toBe('true');
    expect(screen.getByText('EVT-2 · TIC2')).toBeTruthy();
  });

  it('a shared link to an episode off this page opens it by id, and says so', () => {
    byIdHook.mockReturnValue({ ...noLookup, data: frame({ id: 2213, loop_id: 'FIC9' }) });
    mount('/cpm/events?event=2213');
    expect(byIdHook).toHaveBeenCalledWith(2213, true);
    expect(screen.getByText('EVT-2213 · FIC9')).toBeTruthy();
    expect(screen.getByText('EVT-2213 is not on this page of the list.')).toBeTruthy();
  });

  it('shows the loading state while an off-page episode is read', () => {
    byIdHook.mockReturnValue({ ...noLookup, isLoading: true });
    mount('/cpm/events?event=2213');
    expect(screen.getByText('Loading the episode')).toBeTruthy();
  });

  it('a removed episode says so and shows no other episode in its place', () => {
    byIdHook.mockReturnValue({ ...noLookup, error: new ApiError(404, 'not found') });
    mount('/cpm/events?event=99999');
    expect(screen.getByText('Episode 99999 not found')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Acknowledge' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(urlParams().get('event')).toBeNull();
  });

  it('a malformed id is not found, with no read', () => {
    mount('/cpm/events?event=abc');
    expect(screen.getByText('Episode abc not found')).toBeTruthy();
    expect(byIdHook).toHaveBeenCalledWith(null, expect.anything());
  });

  it('a failed read of the episode offers a retry', () => {
    const refetch = vi.fn();
    byIdHook.mockReturnValue({ ...noLookup, error: new ApiError(500, 'Service down'), refetch });
    mount('/cpm/events?event=2213');
    expect(screen.getByText('Service down')).toBeTruthy();
    fireEvent.click(within(screen.getByTestId('state-error')).getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });
});
