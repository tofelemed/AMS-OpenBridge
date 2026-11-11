// CHG-063: Loop Events asks the server for one page (filters, search, scope, page number in the request) and opens a
// deep-linked episode that is not on the page by its id. CHG-136: Loop / peak diagnosis, Severity, Review, Opened; Episodes |
// Fast conditions is a toggle. CHG-167 (owner review, the approved sample and the answers of 11 Nov): the header is the
// eyebrow and the title (no ?), the toggle without counts beside How to read; one filter row inside the list card, search
// first, the counts only in the state dropdown; no "n event(s)" note and no list title; the shared pager, centred.
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { setActiveZone } from '../../cpa/activeZone';
import type { CpmEventFrame } from '../../api/cpmApi';
import type { CpmCondition } from '../../api/cpm/conditions';
import { ApiError } from '../../api/apiFetch';
import { eventPageParams } from '../../api/cpm/eventPage';
import { diagnosisLabel } from './vocabulary';

const { el, pageHook, byIdHook, condHook } = vi.hoisted(() => ({
  el: (tag: string) => (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean; label?: string }) =>
    React.createElement(tag, { onClick: p.onClick, disabled: p.disabled }, p.children ?? p.label),
  pageHook: vi.fn(),
  byIdHook: vi.fn(),
  condHook: vi.fn(),
}));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({ ObcButton: el('button') }));
vi.mock('./events/useConditions', () => ({ useCpmConditions: (...a: unknown[]) => condHook(...a) }));
vi.mock('./plantScope', () => ({
  useCpmScope: () => ({ site: '', area: '', unit: '', active: false, params: {}, matches: () => true, set: () => undefined }),
}));
vi.mock('../../store/authStore', () => ({ useAuthStore: (f: (s: { hasPermission: () => boolean }) => boolean) => f({ hasPermission: () => true }) }));
vi.mock('./events/EventDetail', () => ({
  default: ({ event }: { event: CpmEventFrame }) => React.createElement('aside', null, `detail EVT-${event.id}`),
  severityOf: () => ({ tone: 'warn', label: 'HIGH' }),
  currentOf: () => null,
}));
vi.mock('./events/useEventPage', () => ({
  useEventPage: (q: unknown) => pageHook(q),
  useEventById: (id: number | null, enabled: boolean) => byIdHook(id, enabled),
  useDebounced: <T,>(v: T) => v,
}));
beforeAll(() => setActiveZone('UTC'));
afterEach(() => { cleanup(); pageHook.mockReset(); byIdHook.mockReset(); condHook.mockReset(); });

import { CpmEvents } from './CpmEvents';

const ev = (id: number): CpmEventFrame => ({
  id, loop_id: `FIC${id}`, window_kind: '12h', family: 'OSCILLATION', opened_at: '2026-10-05T07:45:00Z', closed_at: null,
  peak_diagnosis: 'CONFIRMED_OSCILLATION', peak_confidence: 0.9, last_diagnosis: null, last_confidence: null, severity: 'HIGH',
  window_count: 1, ack_state: 'UNACKNOWLEDGED', acked_by: null, acked_at: null, shelve_until: null, note: null,
  calculation_version: null, dynamics_profile_version: null, availability_state: 'OBSERVED', condition_state: 'OPEN',
  result_revision: 1, qualified_support_ms: null, close_reason: null, shelf_state: 'NONE', shelved_by: null, shelved_at: null, shelve_reason: null,
});
const counts = { all: 500, open: 325, unobservable: 40, unacknowledged: 300, acknowledged: 10, shelved: 2, shelfExpired: 1, closed: 175 };
const page = (ids: number[], total = 500, over: Partial<CpmEventFrame>[] = []) => ({
  data: { total, page: 1, pageSize: 10, pageCount: Math.ceil(total / 10), state: 'all', sort: 'triage', counts,
    events: ids.map((id, i) => ({ ...ev(id), ...(over[i] ?? {}) })) },
  isLoading: false, isError: false, error: null, refetch: vi.fn(), isPlaceholderData: false,
});
const NOW = Date.now();
const cond = (over: Partial<CpmCondition> = {}): CpmCondition => ({
  loopId: 'FIC10301', displayName: 'Flow controller', site: 'hdpe', gate: 'G11', kind: 'FREEZE', state: 'UPDATE',
  startMs: NOW - 5 * 60_000, lastMs: NOW - 60_000, endMs: null, durationS: 240, closeReason: '', evidence: {}, updatedAt: '', ...over,
});
const conditions = (list: CpmCondition[]) => ({ data: { count: list.length, openOnly: false, conditions: list }, isLoading: false, isError: false, error: null, refetch: vi.fn() });
const Probe = () => <output data-testid="loc">{useLocation().search}</output>;
const mount = (url = '/cpm/events') => render(<MemoryRouter initialEntries={[url]}><CpmEvents /><Probe /></MemoryRouter>);
const quiet = () => { byIdHook.mockReturnValue({ data: undefined, isLoading: false, error: null }); condHook.mockReturnValue(conditions([])); };
const search = () => new URLSearchParams(screen.getByTestId('loc').textContent ?? '');

describe('Loop Events header (CHG-167)', () => {
  it('is the eyebrow and the title with no ?, and the toggle without counts beside How to read', () => {
    pageHook.mockReturnValue(page([1]));
    quiet();
    const { container } = mount();
    const header = container.querySelector('.cpm-workspace-header') as HTMLElement;
    expect(within(header).getByText('Find problems')).toBeTruthy();
    expect(within(header).getByRole('heading', { level: 1, name: 'Loop Events' })).toBeTruthy();
    const group = within(header).getByRole('group', { name: 'Loop events view' });
    expect(within(group).getAllByRole('button').map(b => b.textContent)).toEqual(['Episodes', 'Fast conditions']);
    expect(within(header).getAllByRole('button').map(b => b.textContent)).toEqual(['Episodes', 'Fast conditions', 'How to read']);
  });

  it('opens How to read: Review, Condition, Rows and Fast conditions, each in aligned columns', () => {
    pageHook.mockReturnValue(page([1]));
    quiet();
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'How to read' }));
    const dialog = screen.getByRole('dialog', { name: 'How to read' });
    expect(within(dialog).getAllByRole('heading', { level: 3 }).map(h => h.textContent)).toEqual(['Review', 'Condition', 'Rows', 'Fast conditions']);
    expect(within(dialog).getByText('Open and not reviewed. An active shelf takes it out of this queue.')).toBeTruthy();
    expect(within(dialog).getByText('The newest window could not be judged (excluded or insufficient data), so the condition has not recovered.')).toBeTruthy();
    expect(within(dialog).getByText('One episode of one fault family on one window kind (12h or 24h). A change in its evidence score extends it rather than duplicating it.')).toBeTruthy();
    expect(within(dialog).getByText('G10 · Valve / saturation, G11 · Sensor health')).toBeTruthy();
    expect(within(dialog).getByText('Open on record but not updated for 10 min: the engine restarted or the loop’s samples stopped.')).toBeTruthy();
    expect(dialog.querySelectorAll('dl.cpm-howto__key')).toHaveLength(4);
  });
});

describe('Loop Events filters and server paging (CHG-063, CHG-167)', () => {
  it('requests page 1 with the URL filter; the filters sit in one row, search first, the counts only in the state dropdown', () => {
    pageHook.mockReturnValue(page([1, 2, 3]));
    quiet();
    const { container } = mount('/cpm/events?filter=open&sort=recent&loop=FIC1');
    expect(pageHook.mock.calls[0][0]).toMatchObject({ state: 'open', sort: 'recent', loopId: 'FIC1', page: 1, pageSize: 10 });
    const row = container.querySelector('.cpm-events-list .cpm-events-filters') as HTMLElement;
    const controls = [...row.querySelectorAll('input, select, button')].map(c => c.getAttribute('aria-label'));
    expect(controls).toEqual(['Find', 'Event state', 'Severity', 'Order', 'Remove Loop FIC1']);
    expect((screen.getByLabelText('Find') as HTMLInputElement).placeholder).toBe('Loop, EVT, family or diagnosis');
    expect([...(screen.getByLabelText('Event state') as HTMLSelectElement).options].map(o => o.textContent))
      .toEqual(['All 500', 'Open 325', 'Unobservable 40', 'Unacknowledged 300', 'Acknowledged 10', 'Shelved 2', 'Shelf expired 1', 'Closed 175']);
    expect(screen.queryByText(/event\(s\)/)).toBeNull();
    expect(screen.queryByRole('heading', { name: /episodes$/ })).toBeNull();
  });

  it('keeps the severity and order dropdowns that ask the server, and the search', () => {
    pageHook.mockReturnValue(page([1]));
    quiet();
    mount();
    const sev = screen.getByLabelText('Severity') as HTMLSelectElement;
    expect([...sev.options].map(o => o.textContent)).toEqual(['All severities', 'High', 'Medium', 'Low']);
    fireEvent.change(sev, { target: { value: 'HIGH' } });
    expect(pageHook.mock.calls.at(-1)?.[0]).toMatchObject({ severity: 'HIGH', page: 1 });
    expect(search().get('severity')).toBe('HIGH');
    fireEvent.change(screen.getByLabelText('Order'), { target: { value: 'recent' } });
    expect(pageHook.mock.calls.at(-1)?.[0]).toMatchObject({ sort: 'recent' });
    fireEvent.change(screen.getByLabelText('Event state'), { target: { value: 'closed' } });
    expect(pageHook.mock.calls.at(-1)?.[0]).toMatchObject({ state: 'closed' });
    fireEvent.change(screen.getByLabelText('Find'), { target: { value: ' EVT-2231 ' } });
    expect(pageHook.mock.calls.at(-1)?.[0]).toMatchObject({ q: 'EVT-2231', page: 1 });
  });

  it('pages with the shared pager, centred, asking the server for the page', () => {
    pageHook.mockReturnValue(page([1, 2, 3]));
    quiet();
    const { container } = mount();
    const pager = container.querySelector('.cpm-events-pager') as HTMLElement;
    expect(within(pager).getByText('Page 1 of 50')).toBeTruthy();
    expect(screen.queryByText(/1–10 of 500/)).toBeNull();
    fireEvent.click(within(pager).getByRole('button', { name: 'Next page' }));
    expect(pageHook.mock.calls.at(-1)?.[0]).toMatchObject({ page: 2 });
    fireEvent.click(within(pager).getByRole('button', { name: 'Last page' }));
    expect(pageHook.mock.calls.at(-1)?.[0]).toMatchObject({ page: 50 });
  });

  it('the loop chip from a link scopes the request and goes with its ×', () => {
    pageHook.mockReturnValue(page([1]));
    quiet();
    mount('/cpm/events?loop=FIC10401&filter=all');
    expect(pageHook.mock.calls[0][0]).toMatchObject({ loopId: 'FIC10401', state: 'all' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Loop FIC10401' }));
    expect(search().get('loop')).toBeNull();
    expect(pageHook.mock.calls.at(-1)?.[0]).toMatchObject({ loopId: undefined });
  });
});

describe('Loop Events deep links (CHG-063)', () => {
  it('a deep-linked episode not on the page opens by id, under its own number', () => {
    pageHook.mockReturnValue(page([1, 2, 3]));
    byIdHook.mockReturnValue({ data: ev(2213), isLoading: false, error: null });
    condHook.mockReturnValue(conditions([]));
    mount('/cpm/events?event=2213');
    expect(byIdHook).toHaveBeenCalledWith(2213, true);
    expect(screen.getByText('detail EVT-2213')).toBeTruthy();
    expect(screen.getByText('EVT-2213 is not in this list; its details are open.')).toBeTruthy();
  });

  it('an episode on the page needs no lookup; a missing one says so and falls back to the first', () => {
    pageHook.mockReturnValue(page([1, 2213]));
    quiet();
    mount('/cpm/events?event=2213');
    expect(byIdHook).toHaveBeenCalledWith(2213, false);
    expect(screen.getByText('detail EVT-2213')).toBeTruthy();
    cleanup();
    byIdHook.mockReturnValue({ data: undefined, isLoading: false, error: new ApiError(404, 'not found') });
    mount('/cpm/events?event=99999');
    expect(screen.getByText('EVT-99999 does not exist (retention may have removed it). Showing the first episode.')).toBeTruthy();
    expect(screen.getByText('detail EVT-1')).toBeTruthy();
  });

  it('marks the selected episode row as current', () => {
    pageHook.mockReturnValue(page([1, 2]));
    quiet();
    const { container } = mount('/cpm/events?event=2');
    const current = container.querySelectorAll('[aria-current="true"]');
    expect(current.length).toBe(1);
    expect(current[0].textContent).toContain('EVT-2');
    fireEvent.click(container.querySelectorAll('.cpm-event-row')[0]);
    expect(search().get('event')).toBe('1');
  });
});

describe('Loop Events list (CHG-136, CHG-167)', () => {
  it('shows Loop / peak diagnosis, Severity, Review and Opened · UTC, tag first in the row', () => {
    pageHook.mockReturnValue(page([7, 8]));
    quiet();
    const { container } = mount();
    const head = container.querySelector('.cpm-event-head')!;
    expect([...head.children].map(c => c.textContent)).toEqual(['Loop / peak diagnosis', 'Severity', 'Review', 'Opened · UTC']);
    const row = container.querySelectorAll('.cpm-event-row')[0];
    expect(row.textContent?.startsWith('FIC7')).toBe(true);
    expect(row.textContent).toContain(diagnosisLabel('CONFIRMED_OSCILLATION'));
    expect(row.textContent).toContain('EVT-7 · 12h');
    expect(within(row as HTMLElement).getByText('High')).toBeTruthy();
    expect(row.textContent).toContain('!Unacknowledged');
    expect(row.textContent?.endsWith('5 Oct 07:45')).toBe(true);
  });

  it('opens on Open episodes', () => {
    pageHook.mockReturnValue(page([1]));
    quiet();
    mount();
    expect(pageHook.mock.calls[0][0]).toMatchObject({ state: 'open' });
    expect((screen.getByLabelText('Event state') as HTMLSelectElement).value).toBe('open');
  });

  it('says no episode matches a search, with Show all events and no panel beside an empty list', () => {
    pageHook.mockReturnValue(page([], 0));
    quiet();
    mount();
    fireEvent.change(screen.getByLabelText('Find'), { target: { value: 'zzz' } });
    expect(screen.getByRole('heading', { name: 'No episode matches “zzz”' })).toBeTruthy();
    expect(screen.queryByText(/Select an event/)).toBeNull();
    expect(screen.queryByText(/^detail EVT-/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show all events' }));
    expect(search().get('filter')).toBe('all');
    expect((screen.getByLabelText('Find') as HTMLInputElement).value).toBe('');
  });

  it('points to Performance when nothing narrows an empty list', () => {
    pageHook.mockReturnValue(page([], 0));
    quiet();
    mount('/cpm/events?filter=all');
    expect(screen.getByRole('heading', { name: 'No episode matches this filter and plant scope' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Current results in Performance/ })).toBeTruthy();
  });
});

describe('Episodes | Fast conditions toggle (CHG-136, CHG-167)', () => {
  it('reads the conditions only when Fast conditions is open, and switches back', () => {
    pageHook.mockReturnValue(page([1]));
    byIdHook.mockReturnValue({ data: undefined, isLoading: false, error: null });
    condHook.mockReturnValue(conditions([cond(), cond({ loopId: 'FIC20', startMs: NOW - 8 * 60_000 })]));
    mount();
    expect(condHook).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Fast conditions' }));
    expect(search().get('view')).toBe('conditions');
    expect(condHook.mock.calls[0][2]).toBe(2000);
    expect(screen.queryByLabelText('Event state')).toBeNull();
    expect(screen.getByLabelText('Condition state')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('listitem')[1]);
    expect(search().get('condition')).toMatch(/^FIC20\|G11\|FREEZE\|/);
    expect(screen.getByRole('button', { name: 'Loop Explorer →' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Episodes' }));
    expect(search().get('view')).toBeNull();
    expect(search().get('condition')).toBeNull();
  });
});

describe('eventPageParams', () => {
  it('sends only non-blank filters', () => {
    const p = eventPageParams({ state: 'all', sort: 'triage', page: 3, pageSize: 20, q: '  FIC10302 ', site: '', loopId: undefined, severity: 'HIGH' });
    expect(p.toString()).toBe('state=all&sort=triage&page=3&pageSize=20&q=FIC10302&severity=HIGH');
  });
});
