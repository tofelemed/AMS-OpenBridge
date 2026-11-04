import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { CpmEventFrame } from '../../../api/cpmApi';
import { frame } from './testFrame';

const { pageHook, byIdHook, actionsHook, ack, shelve, unshelve, link, create, perms, notes, ctx } = vi.hoisted(() => {
  const mutation = () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null as unknown });
  return {
    pageHook: vi.fn(),
    byIdHook: vi.fn(),
    actionsHook: vi.fn(),
    ack: mutation(),
    shelve: mutation(),
    unshelve: mutation(),
    link: mutation(),
    create: mutation(),
    perms: { manage: true },
    notes: { event: [] as unknown[], loop: [] as unknown[], eventError: null as unknown },
    ctx: { scope: { site: '', area: '', unit: '', active: false, params: {}, matches: () => true, set: () => undefined }, range: { key: '24h', from: null, to: null }, window: null, loop: '', zone: { id: 'UTC', abbr: 'UTC' }, setRange: () => undefined },
  };
});

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('../../../cpa/useCpaContext', async orig => ({
  ...(await orig<typeof import('../../../cpa/useCpaContext')>()),
  useCpaContext: () => ctx,
}));
vi.mock('../../../components/Cpm/events/useEventPage', () => ({
  useEventPage: (q: unknown) => pageHook(q),
  useEventById: (id: number | null, enabled: boolean) => byIdHook(id, enabled),
  useDebounced: <T,>(v: T) => v,
}));
vi.mock('../../../components/Cpm/events/useConditions', () => ({
  useCpmConditions: () => ({ data: { conditions: [] }, isLoading: false, isError: false, error: null, refetch: () => undefined }),
}));
vi.mock('../../../hooks/useCpm', () => ({
  useAcknowledgeEvent: () => ack,
  useShelveEvent: () => shelve,
  useUnshelveEvent: () => unshelve,
  useEventActions: (id: number, enabled: boolean) => actionsHook(id, enabled),
}));
vi.mock('../../../hooks/useLoopNotes', () => ({
  useEventNotes: () => ({ data: { investigations: notes.event }, isError: !!notes.eventError, error: notes.eventError }),
  useLoopNotes: () => ({ data: { investigations: notes.loop } }),
  useCreateLoopNote: () => create,
  useLinkLoopNote: () => link,
}));
vi.mock('../../../store/authStore', () => ({
  useAuthStore: (f: (s: unknown) => unknown) => f({ hasPermission: () => perms.manage, user: { username: 'eng.a' } }),
}));

import EpisodesPage from './EpisodesPage';

type Callbacks = { onSuccess?: (r: unknown) => void; onError?: (e: unknown) => void };

const COUNTS = { all: 1, open: 1, unobservable: 0, unacknowledged: 1, acknowledged: 0, shelved: 0, shelfExpired: 0, closed: 0 };
const pageOf = (events: CpmEventFrame[]) => ({
  data: { total: events.length, page: 1, pageSize: 20, pageCount: 1, state: 'all', sort: 'triage', counts: COUNTS, shelvePolicy: { maxHours: 168 }, events },
  isLoading: false, isError: false, error: null, refetch: vi.fn(), isPlaceholderData: false, dataUpdatedAt: 0,
});

const Probe: React.FC = () => <output data-testid="search">{useLocation().search}</output>;
const eventParam = () => new URLSearchParams(screen.getByTestId('search').textContent ?? '').get('event');

const open = (over: Partial<CpmEventFrame> = {}, url = '/cpm/events?event=1') => {
  pageHook.mockReturnValue(pageOf([frame({ id: 1, ...over })]));
  return render(<MemoryRouter initialEntries={[url]}><EpisodesPage /><Probe /></MemoryRouter>);
};

const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;
const HOUR = 3_600_000;
const later = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();

beforeEach(() => {
  perms.manage = true;
  notes.event = [];
  notes.loop = [];
  notes.eventError = null;
  byIdHook.mockReturnValue({ data: undefined, isLoading: false, error: null, refetch: vi.fn() });
  actionsHook.mockReturnValue({ isLoading: false, isError: false, data: { actions: [] }, refetch: vi.fn() });
});
afterEach(() => {
  cleanup();
  pageHook.mockReset();
  byIdHook.mockReset();
  actionsHook.mockReset();
  for (const m of [ack, shelve, unshelve, link, create]) { m.mutate.mockReset(); m.reset.mockReset(); m.isPending = false; m.error = null; }
});

describe('acknowledge', () => {
  it('is the primary action while unacknowledged, and sends the review note', () => {
    ack.mutate.mockImplementation((_v: unknown, o: Callbacks) => o.onSuccess?.(undefined));
    open();
    fireEvent.change(screen.getByLabelText('Review note (optional)'), { target: { value: 'Seen it' } });
    fireEvent.click(button('Acknowledge'));
    expect(ack.mutate.mock.calls[0][0]).toEqual({ id: 1, note: 'Seen it' });
  });

  it('shows a receipt and keeps the selection', () => {
    ack.mutate.mockImplementation((_v: unknown, o: Callbacks) => o.onSuccess?.(undefined));
    const { container } = open();
    fireEvent.click(button('Acknowledge'));
    expect(container.querySelector('.episode__receipt')?.textContent).toMatch(/^Acknowledged by eng\.a at .* UTC$/);
    expect(container.querySelector('.ui-sr[role="status"]')?.textContent).toMatch(/^Acknowledged by eng\.a/);
    expect(eventParam()).toBe('1');
  });

  it('reports a failure with the server reason, and keeps the selection', () => {
    ack.mutate.mockImplementation((_v: unknown, o: Callbacks) => o.onError?.(new Error('Already acknowledged')));
    open();
    fireEvent.click(button('Acknowledge'));
    expect(screen.getByRole('alert').textContent).toBe('Acknowledge failed: Already acknowledged');
    expect(eventParam()).toBe('1');
  });

  it('says what acknowledging does to a shelf', () => {
    open({ shelf_state: 'SHELVED', shelve_until: later(3) });
    expect(screen.getByText('The shelf stays until it expires or is unshelved.')).toBeTruthy();
    cleanup();
    open({ shelf_state: 'EXPIRED', shelve_until: later(-3) });
    expect(screen.getByText('This also clears the returned-from-shelf flag.')).toBeTruthy();
  });

  it('is gone once acknowledged', () => {
    open({ ack_state: 'ACKNOWLEDGED', acked_by: 'eng.b', acked_at: '2026-11-02T08:00:00Z' });
    expect(screen.queryByRole('button', { name: 'Acknowledge' })).toBeNull();
  });

  it('keeps the inspector and the receipt when the write moves the episode off this filter', () => {
    ack.mutate.mockImplementation((_v: unknown, o: Callbacks) => o.onSuccess?.(undefined));
    pageHook.mockReturnValue(pageOf([frame({ id: 1 })]));
    const tree = <MemoryRouter initialEntries={['/cpm/events?event=1&filter=unacknowledged']}><EpisodesPage /><Probe /></MemoryRouter>;
    const { container, rerender } = render(tree);
    fireEvent.click(button('Acknowledge'));
    pageHook.mockReturnValue(pageOf([]));
    byIdHook.mockReturnValue({ data: undefined, isLoading: true, error: null, refetch: vi.fn() });
    rerender(tree);
    expect(screen.getByText('EVT-1 · FIC1')).toBeTruthy();
    expect(container.querySelector('.episode__receipt')?.textContent).toMatch(/^Acknowledged by eng\.a/);
    expect(eventParam()).toBe('1');
  });
});

describe('shelve', () => {
  const panel = () => within(screen.getByRole('group', { name: 'Shelve this episode' }));

  it('needs a reason, then sends the expiry and the reason, with a receipt', () => {
    shelve.mutate.mockImplementation((v: { until: string }, o: Callbacks) => o.onSuccess?.({ updated: false, shelveUntil: v.until }));
    const { container } = open();
    fireEvent.click(button('Shelve…'));
    expect(panel().getByText('A reason is required.')).toBeTruthy();
    expect((panel().getByRole('button', { name: 'Shelve' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(panel().getByLabelText('Reason (required)'), { target: { value: 'Valve parts due' } });
    expect(panel().getByText(/Shelved until .* \(expires in 8\.0 h\)\./)).toBeTruthy();
    fireEvent.click(panel().getByRole('button', { name: 'Shelve' }));
    const sent = shelve.mutate.mock.calls[0][0];
    expect(sent.id).toBe(1);
    expect(sent.reason).toBe('Valve parts due');
    expect(Math.abs(Date.parse(sent.until) - (Date.now() + 8 * HOUR))).toBeLessThan(60_000);
    expect(container.querySelector('.episode__receipt')?.textContent).toMatch(/^Shelved until .*, by eng\.a at /);
    expect(screen.queryByRole('group', { name: 'Shelve this episode' })).toBeNull();
    expect(eventParam()).toBe('1');
  });

  it('reads a chosen time in the site zone, never the browser zone', () => {
    ctx.zone = { id: 'Asia/Dubai', abbr: 'GST' };
    shelve.mutate.mockImplementation(() => undefined);
    open();
    fireEvent.click(button('Shelve…'));
    fireEvent.change(panel().getByLabelText('Shelve for'), { target: { value: 'custom' } });
    const until = panel().getByLabelText(/^Until \(/) as HTMLInputElement;
    const target = new Date(Date.now() + 2 * HOUR);
    const wall = new Date(target.getTime() + 4 * HOUR).toISOString().slice(0, 16);
    fireEvent.change(until, { target: { value: wall } });
    fireEvent.change(panel().getByLabelText('Reason (required)'), { target: { value: 'Parts due' } });
    fireEvent.click(panel().getByRole('button', { name: 'Shelve' }));
    expect(Math.abs(Date.parse(shelve.mutate.mock.calls[0][0].until) - target.getTime())).toBeLessThan(60_000);
    ctx.zone = { id: 'UTC', abbr: 'UTC' };
  });

  it('refuses an expiry past the site limit, in place', () => {
    open();
    fireEvent.click(button('Shelve…'));
    fireEvent.change(panel().getByLabelText('Shelve for'), { target: { value: 'custom' } });
    fireEvent.change(panel().getByLabelText(/^Until \(/), { target: { value: later(500).slice(0, 16) } });
    fireEvent.change(panel().getByLabelText('Reason (required)'), { target: { value: 'Parts due' } });
    expect(panel().getByText(/The site limit is 168 h/)).toBeTruthy();
    expect((panel().getByRole('button', { name: 'Shelve' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('updates an active shelf, starting from its reason', () => {
    shelve.mutate.mockImplementation((v: { until: string }, o: Callbacks) => o.onSuccess?.({ updated: true, shelveUntil: v.until }));
    const { container } = open({ shelf_state: 'SHELVED', shelve_until: later(3), shelve_reason: 'Old reason' });
    fireEvent.click(button('Update shelf…'));
    expect((panel().getByLabelText('Reason (required)') as HTMLInputElement).value).toBe('Old reason');
    fireEvent.click(panel().getByRole('button', { name: 'Update shelf' }));
    expect(container.querySelector('.episode__receipt')?.textContent).toMatch(/^Shelf updated until /);
  });

  it('keeps a refusal beside the inputs', () => {
    shelve.error = new Error('Reason too short for this site');
    open();
    fireEvent.click(button('Shelve…'));
    expect(panel().getByRole('alert').textContent).toBe('Reason too short for this site');
  });

  it('Cancel closes without a write and clears the refusal', () => {
    open();
    fireEvent.click(button('Shelve…'));
    fireEvent.click(panel().getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('group', { name: 'Shelve this episode' })).toBeNull();
    expect(shelve.mutate).not.toHaveBeenCalled();
    expect(shelve.reset).toHaveBeenCalled();
  });

  it('is unavailable on a closed episode, with the reason on screen', () => {
    open({ closed_at: '2026-11-02T08:00:00Z', condition_state: 'CLOSED' });
    expect(button('Shelve…').disabled).toBe(true);
    expect(screen.getByText('A closed episode cannot be shelved.')).toBeTruthy();
  });
});

describe('unshelve', () => {
  const panel = () => within(screen.getByRole('group', { name: 'Unshelve this episode' }));

  it('is unavailable when not shelved, with the reason on screen', () => {
    open();
    expect(button('Unshelve…').disabled).toBe(true);
    expect(screen.getByText('The episode is not shelved.')).toBeTruthy();
  });

  it('asks first, then sends, and the receipt names the queue it lands in', () => {
    unshelve.mutate.mockImplementation((_v: unknown, o: Callbacks) => o.onSuccess?.({ ackState: 'UNACKNOWLEDGED' }));
    const { container } = open({ shelf_state: 'SHELVED', shelve_until: later(3) });
    fireEvent.click(button('Unshelve…'));
    expect(unshelve.mutate).not.toHaveBeenCalled();
    expect(panel().getByText(/ends now and the episode returns to the Unacknowledged queue/)).toBeTruthy();
    fireEvent.change(panel().getByLabelText('Reason (optional)'), { target: { value: 'Disturbance cleared' } });
    fireEvent.click(panel().getByRole('button', { name: 'Unshelve' }));
    expect(unshelve.mutate.mock.calls[0][0]).toEqual({ id: 1, reason: 'Disturbance cleared' });
    expect(container.querySelector('.episode__receipt')?.textContent).toMatch(/^Unshelved by eng\.a at .*\. It is back in the Unacknowledged queue\.$/);
    expect(eventParam()).toBe('1');
  });

  it('an empty reason is not sent, and an acknowledged episode stays acknowledged', () => {
    unshelve.mutate.mockImplementation((_v: unknown, o: Callbacks) => o.onSuccess?.({ ackState: 'ACKNOWLEDGED' }));
    const { container } = open({ shelf_state: 'EXPIRED', shelve_until: later(-3), ack_state: 'ACKNOWLEDGED', acked_by: 'eng.b', acked_at: '2026-11-02T08:00:00Z' });
    fireEvent.click(button('Unshelve…'));
    expect(panel().getByText(/already expired/)).toBeTruthy();
    fireEvent.click(panel().getByRole('button', { name: 'Unshelve' }));
    expect(unshelve.mutate.mock.calls[0][0]).toEqual({ id: 1, reason: undefined });
    expect(container.querySelector('.episode__receipt')?.textContent).toMatch(/It stays acknowledged\.$/);
  });
});

describe('add note', () => {
  const panel = () => within(screen.getByRole('group', { name: 'Add a note to this episode' }));
  const write = (text: string) => fireEvent.change(panel().getByLabelText('Note'), { target: { value: text } });

  it('says beside the box that saving does not acknowledge', () => {
    open();
    fireEvent.click(button('Add note…'));
    expect(panel().getByText('Saving does not acknowledge the episode.')).toBeTruthy();
    fireEvent.click(panel().getByLabelText('Also acknowledge this episode'));
    expect(panel().getByText('Saving also acknowledges the episode.')).toBeTruthy();
    expect(panel().queryByText('Saving does not acknowledge the episode.')).toBeNull();
  });

  it('saves on this episode and never acknowledges unless the box is ticked', () => {
    create.mutate.mockImplementation((_v: unknown, o: Callbacks) => o.onSuccess?.(undefined));
    const { container } = open();
    fireEvent.click(button('Add note…'));
    write('  Valve serviced  ');
    fireEvent.click(panel().getByRole('button', { name: 'Save note' }));
    expect(create.mutate.mock.calls[0][0]).toEqual({ loopId: 'FIC1', note: 'Valve serviced', outcome: 'INCONCLUSIVE', eventId: 1 });
    expect(ack.mutate).not.toHaveBeenCalled();
    expect(container.querySelector('.episode__receipt')?.textContent).toMatch(/^Note saved on EVT-1 by eng\.a at /);
    expect(eventParam()).toBe('1');
  });

  it('acknowledges as a second write when the box is ticked', () => {
    create.mutate.mockImplementation((_v: unknown, o: Callbacks) => o.onSuccess?.(undefined));
    ack.mutate.mockImplementation((_v: unknown, o: Callbacks) => o.onSuccess?.(undefined));
    const { container } = open();
    fireEvent.click(button('Add note…'));
    write('Valve serviced');
    fireEvent.change(panel().getByLabelText('Outcome'), { target: { value: 'WORK_COMPLETED' } });
    fireEvent.click(panel().getByLabelText('Also acknowledge this episode'));
    fireEvent.click(panel().getByRole('button', { name: 'Save note' }));
    expect(create.mutate.mock.calls[0][0]).toMatchObject({ outcome: 'WORK_COMPLETED' });
    expect(ack.mutate.mock.calls[0][0]).toEqual({ id: 1, note: 'Acknowledged with a loop note: Valve serviced' });
    expect(container.querySelector('.episode__receipt')?.textContent).toMatch(/^Note saved and episode acknowledged by eng\.a/);
  });

  it('does not acknowledge when the note fails to save', () => {
    create.mutate.mockImplementation((_v: unknown, o: Callbacks) => o.onError?.(new Error('Too long')));
    open();
    fireEvent.click(button('Add note…'));
    write('Valve serviced');
    fireEvent.click(panel().getByLabelText('Also acknowledge this episode'));
    fireEvent.click(panel().getByRole('button', { name: 'Save note' }));
    expect(ack.mutate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('Saving the note failed: Too long');
  });

  it('says so when the note saved but the acknowledge failed', () => {
    create.mutate.mockImplementation((_v: unknown, o: Callbacks) => o.onSuccess?.(undefined));
    ack.mutate.mockImplementation((_v: unknown, o: Callbacks) => o.onError?.(new Error('Already acknowledged')));
    open();
    fireEvent.click(button('Add note…'));
    write('Valve serviced');
    fireEvent.click(panel().getByLabelText('Also acknowledge this episode'));
    fireEvent.click(panel().getByRole('button', { name: 'Save note' }));
    expect(screen.getByRole('alert').textContent).toBe('Note saved. Acknowledge failed: Already acknowledged');
  });

  it('offers no box on an acknowledged episode', () => {
    open({ ack_state: 'ACKNOWLEDGED', acked_by: 'eng.b', acked_at: '2026-11-02T08:00:00Z' });
    fireEvent.click(button('Add note…'));
    expect(panel().queryByLabelText('Also acknowledge this episode')).toBeNull();
  });

  it('needs text, and says so', () => {
    open();
    fireEvent.click(button('Add note…'));
    expect((panel().getByRole('button', { name: 'Save note' }) as HTMLButtonElement).disabled).toBe(true);
    expect(panel().getByText('Write a note to save it.')).toBeTruthy();
  });

  it('links an earlier loop note, without acknowledging, and keeps the selection', () => {
    notes.loop = [
      { refId: 'n1', note: 'Written before the episode', createdAt: '2026-10-30T10:00:00Z', eventId: null },
      { refId: 'n2', note: 'Already linked', createdAt: '2026-10-30T11:00:00Z', eventId: 5 },
    ];
    link.mutate.mockImplementation((_v: unknown, o: Callbacks) => o.onSuccess?.(undefined));
    const { container } = open();
    fireEvent.click(button('Add note…'));
    expect(panel().queryByText(/Already linked/)).toBeNull();
    expect((panel().getByRole('button', { name: 'Link to this episode' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(panel().getByLabelText('Link a loop note'), { target: { value: 'n1' } });
    fireEvent.click(panel().getByRole('button', { name: 'Link to this episode' }));
    expect(link.mutate.mock.calls[0][0]).toEqual({ refId: 'n1', eventId: 1 });
    expect(ack.mutate).not.toHaveBeenCalled();
    expect(container.querySelector('.episode__receipt')?.textContent).toMatch(/^Note linked to EVT-1 by eng\.a/);
  });

  it('reports a failed link', () => {
    notes.loop = [{ refId: 'n1', note: 'Earlier', createdAt: '2026-10-30T10:00:00Z', eventId: null }];
    link.mutate.mockImplementation((_v: unknown, o: Callbacks) => o.onError?.(new Error('Gone')));
    open();
    fireEvent.click(button('Add note…'));
    fireEvent.change(panel().getByLabelText('Link a loop note'), { target: { value: 'n1' } });
    fireEvent.click(panel().getByRole('button', { name: 'Link to this episode' }));
    expect(screen.getByRole('alert').textContent).toBe('Linking the note failed: Gone');
  });
});
