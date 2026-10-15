// CHG-063: Loop Events asks the server for one page (filters, search, scope, page number in the request), shows
// server totals and tab counts, and opens a deep-linked episode that is not on the page by its id.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CpmEventFrame } from '../../api/cpmApi';
import { ApiError } from '../../api/apiFetch';
import { eventPageParams } from '../../api/cpm/eventPage';

const { el, pageHook, byIdHook } = vi.hoisted(() => ({
  el: (tag: string) => (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean; label?: string }) =>
    React.createElement(tag, { onClick: p.onClick, disabled: p.disabled }, p.children ?? p.label),
  pageHook: vi.fn(),
  byIdHook: vi.fn(),
}));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({ ObcButton: el('button') }));
vi.mock('@oicl/openbridge-webcomponents-react/components/input-chip/input-chip', () => ({ ObcInputChip: el('span') }));
vi.mock('@oicl/openbridge-webcomponents-react/components/toggle-button-group/toggle-button-group', () => ({ ObcToggleButtonGroup: el('div') }));
vi.mock('@oicl/openbridge-webcomponents-react/components/toggle-button-option/toggle-button-option', () => ({ ObcToggleButtonOption: el('span') }));
vi.mock('./context/LoopContextBar', () => ({ LoopContextBar: () => null }));
vi.mock('./events/ConditionsPanel', () => ({ ConditionsPanel: () => null }));
vi.mock('./events/useConditions', () => ({ useCpmConditions: () => ({ data: undefined, isLoading: false, isError: false }) }));
vi.mock('./plantScope', () => ({
  PlantScopeFilter: () => null,
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
afterEach(() => { cleanup(); pageHook.mockReset(); byIdHook.mockReset(); });

import { CpmEvents } from './CpmEvents';

const ev = (id: number): CpmEventFrame => ({
  id, loop_id: `FIC${id}`, window_kind: '24h', family: 'OSCILLATION', opened_at: '2026-10-05T07:45:00Z', closed_at: null,
  peak_diagnosis: 'CONFIRMED_OSCILLATION', peak_confidence: 0.9, last_diagnosis: null, last_confidence: null, severity: null,
  window_count: 1, ack_state: 'UNACKNOWLEDGED', acked_by: null, acked_at: null, shelve_until: null, note: null,
  calculation_version: null, dynamics_profile_version: null, availability_state: 'OBSERVED', condition_state: 'OPEN',
  result_revision: 1, qualified_support_ms: null, close_reason: null, shelf_state: 'NONE', shelved_by: null, shelved_at: null, shelve_reason: null,
});
const counts = { all: 500, open: 325, unobservable: 40, unacknowledged: 300, acknowledged: 10, shelved: 2, shelfExpired: 1, closed: 175 };
const page = (ids: number[], total = 500) => ({
  data: { total, page: 1, pageSize: 20, pageCount: Math.ceil(total / 20), state: 'all', sort: 'triage', counts, events: ids.map(ev) },
  isLoading: false, isError: false, error: null, refetch: vi.fn(), isPlaceholderData: false,
});
const mount = (url = '/cpm/events') => render(<MemoryRouter initialEntries={[url]}><CpmEvents /></MemoryRouter>);

describe('Loop Events server paging (CHG-063)', () => {
  it('requests page 1 with the URL filter and shows server totals and tab counts', () => {
    pageHook.mockReturnValue(page([1, 2, 3]));
    byIdHook.mockReturnValue({ data: undefined, isLoading: false, error: null });
    mount('/cpm/events?filter=open&sort=recent&loop=FIC1');
    expect(pageHook.mock.calls[0][0]).toMatchObject({ state: 'open', sort: 'recent', loopId: 'FIC1', page: 1, pageSize: 20 });
    expect(screen.getByText(/^500 event\(s\) for FIC1/)).toBeTruthy();
    expect(screen.getByText('325').closest('span')?.parentElement?.textContent).toBe('Open 325');
    expect(screen.getByText('1–20 of 500 · page 1 of 25')).toBeTruthy();
  });

  it('Next asks the server for page 2', () => {
    pageHook.mockReturnValue(page([1, 2, 3]));
    byIdHook.mockReturnValue({ data: undefined, isLoading: false, error: null });
    mount();
    fireEvent.click(screen.getByText('Next →'));
    expect(pageHook.mock.calls.at(-1)?.[0]).toMatchObject({ page: 2 });
  });

  it('a deep-linked episode not on the page opens by id, under its own number', () => {
    pageHook.mockReturnValue(page([1, 2, 3]));
    byIdHook.mockReturnValue({ data: ev(2213), isLoading: false, error: null });
    mount('/cpm/events?event=2213');
    expect(byIdHook).toHaveBeenCalledWith(2213, true);
    expect(screen.getByText('detail EVT-2213')).toBeTruthy();
    expect(screen.getByText(/EVT-2213 is not on this page/)).toBeTruthy();
  });

  it('an episode on the page needs no lookup; a missing one says so and falls back', () => {
    pageHook.mockReturnValue(page([1, 2213]));
    byIdHook.mockReturnValue({ data: undefined, isLoading: false, error: null });
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

// CHG-098 (SME review 2 #25): the headings sort only by the orders the server pages by; the selected row is marked.
describe('Loop Events headings and selection (CHG-098)', () => {
  it('the Opened heading asks the server for newest first; Severity returns to triage', () => {
    pageHook.mockReturnValue(page([1, 2, 3]));
    byIdHook.mockReturnValue({ data: undefined, isLoading: false, error: null });
    mount();
    expect(screen.getByRole('button', { name: /Severity, sorted triage/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Opened' }));
    expect(pageHook.mock.calls.at(-1)?.[0]).toMatchObject({ sort: 'recent', page: 1 });
    expect(screen.getByRole('button', { name: 'Opened, sorted newest first' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Severity' }));
    expect(pageHook.mock.calls.at(-1)?.[0]).toMatchObject({ sort: 'triage' });
    expect(screen.getByRole('button', { name: 'Sort by Opened' })).toBeTruthy();
  });

  it('marks the selected episode row as current', () => {
    pageHook.mockReturnValue(page([1, 2]));
    byIdHook.mockReturnValue({ data: undefined, isLoading: false, error: null });
    const { container } = mount('/cpm/events?event=2');
    const current = container.querySelectorAll('[aria-current="true"]');
    expect(current.length).toBe(1);
    expect(current[0].textContent).toContain('EVT-2');
  });
});

describe('eventPageParams', () => {
  it('sends only non-blank filters', () => {
    const p = eventPageParams({ state: 'all', sort: 'triage', page: 3, pageSize: 20, q: '  FIC10302 ', site: '', loopId: undefined });
    expect(p.toString()).toBe('state=all&sort=triage&page=3&pageSize=20&q=FIC10302');
  });
});
