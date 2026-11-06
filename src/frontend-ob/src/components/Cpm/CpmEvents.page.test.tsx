// CHG-063: Loop Events asks the server for one page (filters, search, scope, page number in the request), shows
// server totals and tab counts, and opens a deep-linked episode that is not on the page by its id.
// CHG-136: the list reads Loop / peak diagnosis, Severity, Review, Opened; Episodes | Fast conditions is a toggle.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
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

describe('Loop Events server paging (CHG-063)', () => {
  it('requests page 1 with the URL filter and shows server totals and tab counts', () => {
    pageHook.mockReturnValue(page([1, 2, 3]));
    quiet();
    mount('/cpm/events?filter=open&sort=recent&loop=FIC1');
    expect(pageHook.mock.calls[0][0]).toMatchObject({ state: 'open', sort: 'recent', loopId: 'FIC1', page: 1, pageSize: 10 });
    expect(screen.getByText(/^500 event\(s\) for FIC1/)).toBeTruthy();
    expect([...(screen.getByLabelText('Event state') as HTMLSelectElement).options].map(o => o.textContent)).toContain('Open 325');
    expect(screen.getByText('1–10 of 500 · page 1 of 50')).toBeTruthy();
  });

  it('Next asks the server for page 2', () => {
    pageHook.mockReturnValue(page([1, 2, 3]));
    quiet();
    mount();
    fireEvent.click(screen.getByText('Next →'));
    expect(pageHook.mock.calls.at(-1)?.[0]).toMatchObject({ page: 2 });
  });

  it('a deep-linked episode not on the page opens by id, under its own number', () => {
    pageHook.mockReturnValue(page([1, 2, 3]));
    byIdHook.mockReturnValue({ data: ev(2213), isLoading: false, error: null });
    condHook.mockReturnValue(conditions([]));
    mount('/cpm/events?event=2213');
    expect(byIdHook).toHaveBeenCalledWith(2213, true);
    expect(screen.getByText('detail EVT-2213')).toBeTruthy();
    expect(screen.getByText(/EVT-2213 is not on this page/)).toBeTruthy();
  });

  it('an episode on the page needs no lookup; a missing one says so and falls back', () => {
    pageHook.mockReturnValue(page([1, 2213]));
    quiet();
    mount('/cpm/events?event=2213');
    expect(byIdHook).toHaveBeenCalledWith(2213, false);
    expect(screen.getByText('detail EVT-2213')).toBeTruthy();
    cleanup();
    byIdHook.mockReturnValue({ data: undefined, isLoading: false, error: new ApiError(404, 'not found') });
    mount('/cpm/events?event=99999');
    expect(screen.getByText(/Event 99999 does not exist/)).toBeTruthy();
    expect(screen.getByText('detail EVT-1')).toBeTruthy();
  });
});

describe('Loop Events list (CHG-136)', () => {
  it('shows Loop / peak diagnosis, Severity, Review and Opened, tag first in the row', () => {
    pageHook.mockReturnValue(page([7, 8]));
    quiet();
    const { container } = mount();
    const head = container.querySelector('.cpm-event-head')!;
    expect([...head.children].map(c => c.textContent)).toEqual(['Loop / peak diagnosis', 'Severity', 'Review', 'Opened']);
    const row = container.querySelectorAll('.cpm-event-row')[0];
    expect(row.textContent?.startsWith('FIC7')).toBe(true);
    expect(row.textContent).toContain(diagnosisLabel('CONFIRMED_OSCILLATION'));
    expect(row.textContent).toContain('EVT-7 · 12h');
    expect(within(row as HTMLElement).getByText('High')).toBeTruthy();
    expect(row.textContent).toContain('5 Oct');
  });

  it('shows one review pill per row, with one state line', () => {
    pageHook.mockReturnValue(page([7], 1, [{ availability_state: 'UNOBSERVABLE', last_diagnosis: 'NO_CALL' }]));
    quiet();
    const { container } = mount();
    const row = container.querySelector('.cpm-event-row')!;
    expect(row.querySelectorAll('.cpm-pill').length).toBe(2);   // severity + review
    expect(row.textContent).toContain('Unacknowledged');
    expect(row.textContent).toContain('Open · Unobservable');
  });

  it('opens on Open episodes', () => {
    pageHook.mockReturnValue(page([1]));
    quiet();
    mount();
    expect(pageHook.mock.calls[0][0]).toMatchObject({ state: 'open' });
    expect(screen.getByRole('heading', { name: 'Open episodes' })).toBeTruthy();
    expect((screen.getByLabelText('Event state') as HTMLSelectElement).value).toBe('open');
  });

  it('keeps the filters in one row, with the severity dropdown that asks the server', () => {
    pageHook.mockReturnValue(page([1]));
    quiet();
    mount();
    const sev = screen.getByLabelText('Severity') as HTMLSelectElement;
    expect([...sev.options].map(o => o.textContent)).toEqual(['All severity', 'High', 'Medium', 'Low']);
    fireEvent.change(sev, { target: { value: 'HIGH' } });
    expect(pageHook.mock.calls.at(-1)?.[0]).toMatchObject({ severity: 'HIGH', page: 1 });
    fireEvent.change(screen.getByLabelText('Order'), { target: { value: 'recent' } });
    expect(pageHook.mock.calls.at(-1)?.[0]).toMatchObject({ sort: 'recent' });
  });

  it('marks the selected episode row as current', () => {
    pageHook.mockReturnValue(page([1, 2]));
    quiet();
    const { container } = mount('/cpm/events?event=2');
    const current = container.querySelectorAll('[aria-current="true"]');
    expect(current.length).toBe(1);
    expect(current[0].textContent).toContain('EVT-2');
  });
});

describe('Episodes | Fast conditions toggle (CHG-136)', () => {
  it('asks for up to 2000 conditions and counts the open ones in the toggle', () => {
    pageHook.mockReturnValue(page([1]));
    byIdHook.mockReturnValue({ data: undefined, isLoading: false, error: null });
    condHook.mockReturnValue(conditions([cond(), cond({ gate: 'G10', kind: 'LIMIT_LOW', state: 'CLOSED', startMs: NOW - 9e6, closeReason: 'RECOVERED' })]));
    mount();
    expect(condHook.mock.calls[0][2]).toBe(2000);
    expect(screen.getByRole('button', { name: /Fast conditions.*1 open/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Episodes.*325 open/ })).toBeTruthy();
  });

  it('switches to Fast conditions by toggle, and selects a condition', () => {
    pageHook.mockReturnValue(page([1]));
    byIdHook.mockReturnValue({ data: undefined, isLoading: false, error: null });
    condHook.mockReturnValue(conditions([cond(), cond({ loopId: 'FIC20', startMs: NOW - 8 * 60_000 })]));
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Fast conditions/ }));
    expect(screen.getByTestId('loc').textContent).toContain('view=conditions');
    expect(screen.queryByLabelText('Event state')).toBeNull();
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    fireEvent.click(rows[1]);
    const search = new URLSearchParams(screen.getByTestId('loc').textContent ?? '');
    expect(search.get('view')).toBe('conditions');
    expect(search.get('condition')).toMatch(/^FIC20\|G11\|FREEZE\|/);
    expect(screen.getByRole('button', { name: /Window Inspector/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Episodes/ }));
    expect(screen.getByTestId('loc').textContent).not.toContain('view=');
  });
});

describe('eventPageParams', () => {
  it('sends only non-blank filters', () => {
    const p = eventPageParams({ state: 'all', sort: 'triage', page: 3, pageSize: 20, q: '  FIC10302 ', site: '', loopId: undefined, severity: 'HIGH' });
    expect(p.toString()).toBe('state=all&sort=triage&page=3&pageSize=20&q=FIC10302&severity=HIGH');
  });
});
