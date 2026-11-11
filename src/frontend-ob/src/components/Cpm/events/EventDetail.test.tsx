// CHG-032: the acknowledgement and the shelf are two facts; Unshelve is offered exactly when there is a shelf to end.
// CHG-167 (owner review, the approved sample): the heading is the peak diagnosis with its severity; Latest only when it
// differs; one Condition row; Review; Shelf; Period; the evidence strip; Record details (a dialog) · Historical ↗ · Loop ↗;
// the note and the actions; the foot names the episode once beside Investigation →. The panel's facts are covered here; its
// actions and dialogs in EpisodeActions.test.tsx.
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { setActiveZone } from '../../../cpa/activeZone';
import type { CpmEventAction, CpmEventFrame } from '../../../api/cpmApi';

const { history } = vi.hoisted(() => ({ history: { current: { isLoading: false, isError: false, data: { actions: [] as unknown[] } } } }));
vi.mock('./EpisodeActivity', () => ({ EpisodeActivity: () => null }));   // own fetches, own tests
vi.mock('./EpisodeActions', () => ({ EpisodeActions: () => React.createElement('div', null, 'the actions') }));   // own tests
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean; title?: string }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled, title: p.title }, p.children),
}));
vi.mock('../../../hooks/useCpm', () => ({ useEventActions: () => history.current }));

import { EventDetail, currentOf, severityOf } from './EventDetail';
import { diagnosisLabel } from '../vocabulary';
import { stamp } from './eventTime';

beforeAll(() => setActiveZone('UTC'));
afterEach(() => { cleanup(); history.current = { isLoading: false, isError: false, data: { actions: [] } }; });

const frame = (over: Partial<CpmEventFrame & { support_until: string | null }>): CpmEventFrame => ({
  id: 833, loop_id: 'FIC10301', window_kind: '12h', family: 'OSCILLATION',
  opened_at: '2026-09-02T07:30:00Z', closed_at: null, peak_diagnosis: 'SUSPECTED_OSCILLATION',
  peak_confidence: 1, last_diagnosis: null, last_confidence: null, severity: null, window_count: 1,
  ack_state: 'UNACKNOWLEDGED', acked_by: null, acked_at: null, shelve_until: null, note: null,
  calculation_version: null, dynamics_profile_version: null, availability_state: 'OBSERVED',
  condition_state: 'OPEN', result_revision: 1, qualified_support_ms: 35_640_000, close_reason: null,
  shelf_state: 'NONE', shelved_by: null, shelved_at: null, shelve_reason: null,
  ...over,
});
const action = (kind: CpmEventAction['action'], over: Partial<CpmEventAction> = {}): CpmEventAction =>
  ({ id: 1, eventId: 833, action: kind, actor: 'eng.a', at: '2026-09-19T10:00:00Z', until: null, reason: null, ...over });
const recorded = (...actions: CpmEventAction[]) => { history.current = { isLoading: false, isError: false, data: { actions } }; };
const Probe = () => { const l = useLocation(); return <output data-testid="loc">{l.pathname + l.search}</output>; };
const mount = (e: CpmEventFrame) =>
  render(<MemoryRouter><EventDetail event={e} canManage policy={{ maxHours: 168 }} /><Probe /></MemoryRouter>);
const url = () => new URL(screen.getByTestId('loc').textContent!, 'http://x');
const labels = () => [...document.querySelectorAll('.ui-inspector__body .cpm-kv > .cpm-kv__label')].map(l => l.firstChild?.textContent?.trim());
const valueOf = (label: string) => [...document.querySelectorAll('.ui-inspector__body .cpm-kv')]
  .find(r => r.querySelector('.cpm-kv__label')?.firstChild?.textContent?.trim() === label)?.querySelector('.cpm-kv__value')?.textContent ?? '';

describe('EventDetail head and foot (CHG-167)', () => {
  it('heads the panel with the peak diagnosis and its severity, and names the episode once, in the foot', () => {
    mount(frame({ severity: 'HIGH' }));
    const heading = screen.getByRole('heading', { name: diagnosisLabel('SUSPECTED_OSCILLATION') });
    expect(heading.parentElement?.textContent).toContain('High');
    expect(screen.queryByText(/Episode details/)).toBeNull();
    expect(screen.queryByText(/^Peak ·/)).toBeNull();
    const foot = document.querySelector('.ui-inspector__foot') as HTMLElement;
    expect(foot.textContent).toContain('FIC10301 · EVT-833 · 12h');
    expect(screen.queryByRole('button', { name: /^Review / })).toBeNull();
  });

  it('opens Investigation at the window the episode opened on, from the foot', () => {
    mount(frame({}));
    fireEvent.click(within(document.querySelector('.ui-inspector__foot') as HTMLElement).getByRole('button', { name: 'Investigation →' }));
    expect(url().pathname).toBe('/cpm/investigation');
    expect(url().searchParams.get('loop')).toBe('FIC10301');
    expect(url().searchParams.get('profile')).toBe('12h');
    expect(url().searchParams.get('window')).toBe('2026-09-02T07:30:00Z');
  });
});

describe('EventDetail facts (CHG-167)', () => {
  it('gives Latest only when it differs from the peak, then Condition, Review, Shelf and Period', () => {
    mount(frame({ last_diagnosis: 'NO_CALL' }));
    expect(labels()).toEqual(['Latest', 'Condition', 'Review', 'Shelf', 'Period']);
    expect(valueOf('Latest')).toBe('No fault identified');
    cleanup();
    mount(frame({ last_diagnosis: 'SUSPECTED_OSCILLATION' }));
    expect(labels()).toEqual(['Condition', 'Review', 'Shelf', 'Period']);
  });

  it('merges the condition and the availability into one row, in the words of the list', () => {
    mount(frame({ availability_state: 'UNOBSERVABLE' }));
    expect(valueOf('Condition')).toBe('⊘Open · Unobservable');
    expect(labels()).not.toContain('Availability');
    cleanup();
    mount(frame({ closed_at: '2026-10-05T07:30:00Z', condition_state: 'CLOSED', close_reason: 'RECOVERED' }));
    expect(valueOf('Condition')).toBe('○Closed · recovered');
    cleanup();
    mount(frame({ availability_state: null }));
    expect(valueOf('Condition')).toBe('●Open?Availability unknown');
  });

  it('says the review in the list words; who and when are in Activity when the action is recorded', () => {
    recorded(action('ACKNOWLEDGED', { reason: 'seen' }));
    mount(frame({ ack_state: 'ACKNOWLEDGED', acked_by: 'eng.a', acked_at: '2026-09-19T10:00:00Z', note: 'seen' }));
    expect(valueOf('Review')).toBe('✓Acknowledged');
    expect(labels()).not.toContain('Review note');
    cleanup();
    mount(frame({}));
    expect(valueOf('Review')).toBe('!Unacknowledged');
    expect(screen.queryByText('Not yet reviewed')).toBeNull();
  });

  it('keeps who, when and the note on the rows for an episode with no action record', () => {
    mount(frame({ ack_state: 'ACKNOWLEDGED', acked_by: 'eng.a', acked_at: '2026-09-19T10:00:00Z', note: 'checked on site' }));
    expect(valueOf('Review')).toBe(`✓Acknowledgedeng.a · ${stamp('2026-09-19T10:00:00Z')}`);
    expect(valueOf('Review note')).toBe('checked on site');
  });

  it('keeps the ? on Review for a closed, unacknowledged episode, word for word', () => {
    mount(frame({ closed_at: '2026-10-05T07:30:00Z', condition_state: 'CLOSED' }));
    fireEvent.click(screen.getByRole('button', { name: 'About an unreviewed closed episode' }));
    expect(screen.getByText('This episode has closed but was never acknowledged — a closed, unacknowledged episode is an unreviewed finding, not a resolved one. It can still be acknowledged; shelving no longer applies.')).toBeTruthy();
  });

  it('reads an active shelf with its expiry and countdown; by whom and why are in Activity', () => {
    recorded(action('SHELVED', { actor: 'eng.b', reason: 'valve overhaul booked' }));
    const until = new Date(Date.now() + 3 * 3_600_000).toISOString();
    mount(frame({ shelf_state: 'SHELVED', shelve_until: until, shelved_by: 'eng.b', shelve_reason: 'valve overhaul booked' }));
    expect(valueOf('Shelf')).toBe(`◐Shelveduntil ${stamp(until)} · expires in 3.0 h`);
    expect(labels()).not.toContain('Shelf reason');
  });

  it('reads an expired shelf as Returned, with when it expired and how long ago', () => {
    recorded(action('SHELVED', { actor: 'admin' }));
    mount(frame({ shelf_state: 'EXPIRED', shelve_until: '2026-09-21T12:24:25Z', shelved_by: 'admin', closed_at: '2026-10-05T07:30:00Z' }));
    expect(valueOf('Shelf')).toMatch(new RegExp(`^!Returnedexpired ${stamp('2026-09-21T12:24:25Z')} · [\\d.]+ d ago$`));
  });

  it('keeps by whom and the shelf reason for a shelf with no action record', () => {
    const until = new Date(Date.now() + 3 * 3_600_000).toISOString();
    mount(frame({ shelf_state: 'SHELVED', shelve_until: until, shelved_by: 'eng.b', shelve_reason: 'valve overhaul booked' }));
    expect(valueOf('Shelf')).toContain('· by eng.b');
    expect(valueOf('Shelf reason')).toBe('valve overhaul booked');
  });

  it('gives the period from the opening to now, or to the close', () => {
    mount(frame({}));
    expect(valueOf('Period')).toBe(`${stamp('2026-09-02T07:30:00Z')} → now`);
    cleanup();
    mount(frame({ closed_at: '2026-10-05T07:30:00Z', condition_state: 'CLOSED' }));
    expect(valueOf('Period')).toBe(`${stamp('2026-09-02T07:30:00Z')} → ${stamp('2026-10-05T07:30:00Z')}`);
  });

  it('shows peak evidence, qualified support and non-overlap windows as one strip', () => {
    mount(frame({}));
    const strip = screen.getByRole('group', { name: 'Evidence of this episode' });
    expect(strip.textContent).toContain('100');
    expect(strip.textContent).toContain('9.9 h');
    expect(strip.textContent).toMatch(/1\s*Non-overlap windows/);
    const items = strip.querySelectorAll('.cpm-episode-strip__item');
    expect(items).toHaveLength(3);
    items.forEach(i => {
      expect(i.children[0].className).toContain('cpm-episode-strip__value');
      expect(i.children[1].className).toContain('cpm-kv__label');
    });
  });

  it('prints — for qualified support on a pre-v2.5 row', () => {
    mount(frame({ qualified_support_ms: 0 }));
    expect(screen.getByRole('group', { name: 'Evidence of this episode' }).textContent).toMatch(/—\s*Qualified support/);
  });
});

describe('EventDetail links (CHG-167)', () => {
  it('opens Record details as a dialog: the family, the calculation and profile, support until; no resolution', () => {
    mount(frame({ calculation_version: '3.0.0', dynamics_profile_version: '2.0.0', support_until: '2026-10-06T10:00:00Z' }));
    expect(screen.queryByText('Technical details')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Record details' }));
    const dialog = screen.getByRole('dialog', { name: 'Record details' });
    const rows = [...dialog.querySelectorAll('.cpm-kv')].map(r => [r.querySelector('.cpm-kv__label')?.textContent, r.querySelector('.cpm-kv__value')?.firstChild?.textContent]);
    expect(rows).toEqual([['Fault family', 'Oscillation'], ['Calculation', 'v3.0.0 · profile v2.0.0'], ['Support until', `${stamp('2026-10-06T10:00:00Z')} UTC`]]);
    expect(within(dialog).queryByText('Resolution')).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Copy Support until' })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says Not recorded for a version or an end of support the record lacks', () => {
    mount(frame({}));
    fireEvent.click(screen.getByRole('button', { name: 'Record details' }));
    const dialog = screen.getByRole('dialog', { name: 'Record details' });
    expect(within(dialog).getAllByText('Not recorded')).toHaveLength(2);
  });

  it('opens the episode period in Historical and the loop in the Loop Explorer, named after the pages', () => {
    mount(frame({}));
    expect(screen.queryByRole('button', { name: 'Episode period ↗' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'FIC10301 ↗' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Historical ↗' }));
    expect(url().pathname).toBe('/cpm/historical');
    expect(url().searchParams.get('loop')).toBe('FIC10301');
    expect(url().searchParams.get('from')).toBe('2026-09-02T07:30:00Z');
    expect(url().searchParams.get('focus')).toBe('episode EVT-833');
    fireEvent.click(screen.getByRole('button', { name: 'Loop ↗' }));
    expect(screen.getByTestId('loc').textContent).toBe('/cpm/explorer?loop=FIC10301&tab=Summary');
  });
});

describe('episode peak and current band (CHG-092, SME review 2 #6/#20)', () => {
  it('the pill is the peak in the engine band, not a score threshold of our own', () => {
    expect(severityOf(frame({ peak_confidence: 0.92 }))).toEqual({ label: 'Peak: Suspected', tone: 'warn' });
    expect(severityOf(frame({ peak_diagnosis: 'CONFIRMED_OSCILLATION' }))).toEqual({ label: 'Peak: Confirmed', tone: 'bad' });
    expect(severityOf(frame({ severity: 'HIGH' })).label).toBe('HIGH');
  });
  it('the current window shows only when it differs from the peak', () => {
    expect(currentOf(frame({}))).toBeNull();
    expect(currentOf(frame({ last_diagnosis: 'NO_CALL' }))).toEqual({ label: 'Now: No fault identified', tone: 'muted' });
  });
});
