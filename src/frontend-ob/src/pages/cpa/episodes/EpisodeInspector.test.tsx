import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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

const COUNTS = { all: 1, open: 1, unobservable: 0, unacknowledged: 1, acknowledged: 0, shelved: 0, shelfExpired: 0, closed: 0 };
const pageOf = (events: CpmEventFrame[]) => ({
  data: { total: events.length, page: 1, pageSize: 20, pageCount: 1, state: 'all', sort: 'triage', counts: COUNTS, shelvePolicy: { maxHours: 168 }, events },
  isLoading: false, isError: false, error: null, refetch: vi.fn(), isPlaceholderData: false, dataUpdatedAt: 0,
});

const open = (over: Partial<CpmEventFrame> = {}, url = '/cpm/events?event=1') => {
  pageHook.mockReturnValue(pageOf([frame({ id: 1, ...over })]));
  return render(<MemoryRouter initialEntries={[url]}><EpisodesPage /></MemoryRouter>);
};

const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;
/** A field of the inspector. The ledger's headings carry the same labels. */
const field = (label: string) => within(document.querySelector('.episode') as HTMLElement)
  .getByRole('button', { name: `About ${label}` }).closest('.episode__field') as HTMLElement;
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

describe('what the inspector shows', () => {
  it('names the episode, its loop and its period in the site zone', () => {
    open({ opened_at: '2026-11-01T07:45:00Z' });
    expect(screen.getByRole('heading', { name: 'Sustained oscillation, peak confirmed' })).toBeTruthy();
    expect(screen.getByText('EVT-1 · FIC1')).toBeTruthy();
    expect(screen.getByText(/Opened 1 Nov 2026, 07:45 UTC · Still open/)).toBeTruthy();
  });

  it('tells what happened', () => {
    open({ window_count: 4, qualified_support_ms: 10_800_000, peak_confidence: 0.9, last_diagnosis: 'SUSPECTED_OSCILLATION' });
    expect(screen.getByText(/The sustained oscillation family was reported across 4 non-overlapping window\(s\) · 3\.0 h of qualified support, peaking at evidence score 90; the latest window reports oscillation suspected\./)).toBeTruthy();
  });

  it('keeps condition, availability and acknowledgement as separate fields, each with its definition', () => {
    open({ condition_state: 'OPEN', availability_state: 'UNOBSERVABLE', ack_state: 'UNACKNOWLEDGED' });
        expect(field('Condition').textContent).toContain('Open');
    expect(field('Condition').textContent).not.toContain('Unobservable');
    expect(field('Availability').textContent).toContain('Unobservable');
    expect(field('Availability').textContent).not.toContain('Open');
    expect(field('Acknowledgement').textContent).toContain('Unacknowledged');
    expect(screen.getByText('Still open: newest window not judged.')).toBeTruthy();
  });

  it('shows severity now and peak apart, and the persistence', () => {
    open({ severity: 'LOW', peak_diagnosis: 'CONFIRMED_OSCILLATION', peak_confidence: 0.9, window_count: 6, qualified_support_ms: 7_200_000 });
        expect(field('Severity now').textContent).toContain('Low');
    expect(field('Peak').textContent).toContain('Confirmed');
    expect(field('Peak evidence score').textContent).toContain('90');
    expect(field('Windows').textContent).toContain('6');
    expect(field('Qualified support').textContent).toContain('2.0 h');
  });

  it('a missing value is not zero; a real zero stays zero', () => {
    open({ qualified_support_ms: null, peak_confidence: null as unknown as number, severity: null, last_diagnosis: null, window_count: 0 });
        expect(field('Qualified support').textContent).toContain('Not recorded');
    expect(field('Peak evidence score').textContent).toContain('Unavailable');
    expect(field('Severity now').textContent).toContain('Not recorded');
    expect(field('Current verdict').textContent).toContain('Not recorded');
    expect(field('Windows').textContent).toContain('0');
  });

  it('shows who acknowledged and who shelved, each on its own', () => {
    open({
      ack_state: 'ACKNOWLEDGED', acked_by: 'eng.b', acked_at: '2026-11-02T08:00:00Z', note: 'Seen on the board',
      shelf_state: 'SHELVED', shelve_until: later(3), shelved_by: 'eng.c', shelve_reason: 'Valve overhaul booked',
    });
    expect(screen.getByText(/eng\.b · 2 Nov 2026, 08:00 UTC/)).toBeTruthy();
    expect(screen.getByText('Seen on the board')).toBeTruthy();
    expect(screen.getByText(/eng\.c · until .* · expires in/)).toBeTruthy();
    expect(screen.getByText('Valve overhaul booked')).toBeTruthy();
  });

  it('keeps provenance behind Technical details and raw codes out of the rest', () => {
    const { container } = open({ family: 'OSCILLATION', calculation_version: 'calc-77', dynamics_profile_version: 'dyn-3', result_revision: 5 });
    const details = container.querySelector('details.ui-technical') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.textContent).toContain('calc-77');
    expect(details.textContent).toContain('dyn-3');
    expect(details.textContent).toContain('CONFIRMED_OSCILLATION');
    const clone = container.querySelector('.episode')?.cloneNode(true) as HTMLElement;
    clone.querySelector('details.ui-technical')?.remove();
    expect(clone.textContent).not.toMatch(/[A-Z]+_[A-Z]+/);
    expect(clone.textContent).not.toContain('calc-77');
  });

  it('flags a closed episode nobody reviewed', () => {
    open({ closed_at: '2026-11-02T08:00:00Z', condition_state: 'CLOSED' });
    expect(screen.getByText('Closed but not acknowledged: this finding is still unreviewed.')).toBeTruthy();
    expect(button('Acknowledge').disabled).toBe(false);
  });
});

describe('links', () => {
  it('Open loop and Open evidence carry the episode and the context', () => {
    open({ opened_at: '2026-11-01T00:00:00.000Z', closed_at: '2026-11-02T00:00:00.000Z', condition_state: 'CLOSED' }, '/cpm/events?event=1&site=hdpe&range=7d');
    const loop = new URL(screen.getByRole('link', { name: 'Open loop' }).getAttribute('href') ?? '', 'http://x');
    expect(loop.pathname).toBe('/cpm/loop');
    expect(Object.fromEntries(loop.searchParams)).toMatchObject({
      loop: 'FIC1', tab: 'diagnosis', range: 'custom', from: '2026-11-01T00:00:00.000Z', to: '2026-11-02T00:00:00.000Z', site: 'hdpe',
    });
    const evidence = new URL(screen.getByRole('link', { name: 'Open evidence' }).getAttribute('href') ?? '', 'http://x');
    expect(evidence.pathname).toBe('/cpm/evidence');
    expect(Object.fromEntries(evidence.searchParams)).toMatchObject({ loop: 'FIC1', kind: '24h', before: '2026-11-02T00:00:00.000Z', site: 'hdpe', range: '7d' });
  });

  it('says the peak window is not recorded', () => {
    open();
    expect(screen.getByText(/Peak window not recorded/)).toBeTruthy();
  });
});

describe('without cpm.manage', () => {
  it('shows every write disabled, says why, and writes nothing', () => {
    perms.manage = false;
    open({ shelf_state: 'SHELVED', shelve_until: later(3) });
    for (const name of ['Acknowledge', 'Update shelf…', 'Unshelve…', 'Add note…']) {
      expect(button(name).disabled).toBe(true);
    }
    expect(screen.getAllByText('Not available for your role. Needs the cpm.manage permission.').length).toBeGreaterThan(0);
    expect((screen.getByLabelText('Review note (optional)') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(button('Acknowledge'));
    expect(ack.mutate).not.toHaveBeenCalled();
    expect(screen.queryByRole('group', { name: 'Shelve this episode' })).toBeNull();
  });

  it('still reads the episode and follows its links', () => {
    perms.manage = false;
    open();
    expect(screen.getByRole('link', { name: 'Open loop' })).toBeTruthy();
    expect(screen.getByText('EVT-1 · FIC1')).toBeTruthy();
  });
});

describe('history', () => {
  const toggle = (label: RegExp) => fireEvent.click(screen.getByText(label));

  it('reads nothing until it is opened', () => {
    open();
    expect(actionsHook).not.toHaveBeenCalled();
    toggle(/^History/);
    expect(actionsHook).toHaveBeenCalledWith(1, true);
  });

  it('lists state changes, acknowledgements, shelving and notes, newest first', () => {
    notes.event = [{ refId: 'n1', note: 'Valve serviced', outcome: 'WORK_COMPLETED', createdBy: 'eng.c', createdAt: '2026-11-03T00:00:00Z', eventId: 1 }];
    actionsHook.mockReturnValue({
      isLoading: false, isError: false, refetch: vi.fn(),
      data: { actions: [
        { id: 2, eventId: 1, action: 'ACKNOWLEDGED', actor: 'eng.a', at: '2026-11-04T00:00:00Z', until: null, reason: null },
        { id: 1, eventId: 1, action: 'SHELVED', actor: 'eng.b', at: '2026-11-02T00:00:00Z', until: '2026-11-02T08:00:00Z', reason: 'parts due' },
      ] },
    });
    open({ opened_at: '2026-11-01T00:00:00Z' });
    toggle(/^History · 1 note$/);
    const items = within(screen.getByRole('list', { name: 'History' })).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0].textContent).toMatch(/Acknowledged.*eng\.a/);
    expect(items[1].textContent).toMatch(/Note.*eng\.c.*Work completed: Valve serviced/);
    expect(items[2].textContent).toMatch(/Shelved.*eng\.b.*until.*parts due/);
    expect(items[3].textContent).toMatch(/Opened/);
  });

  it('shows its loading and error states', () => {
    actionsHook.mockReturnValue({ isLoading: true, isError: false });
    open();
    toggle(/^History/);
    expect(screen.getByText('Loading history')).toBeTruthy();
    cleanup();
    const refetch = vi.fn();
    actionsHook.mockReturnValue({ isLoading: false, isError: true, error: new Error('History down'), refetch });
    open();
    toggle(/^History/);
    expect(screen.getByText('History down')).toBeTruthy();
    fireEvent.click(button('Retry'));
    expect(refetch).toHaveBeenCalled();
  });

  it('says when notes could not be read, rather than showing none', () => {
    notes.eventError = new Error('Notes down');
    open();
    toggle(/^History/);
    expect(screen.getByText('Notes could not be loaded, so none are listed here.')).toBeTruthy();
  });
});
