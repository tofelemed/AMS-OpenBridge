// CHG-032: the detail shows the acknowledgement and the shelf as two facts and offers unshelve exactly when
// there is a shelf to end. CHG-136: Review opens the episode's opening window; one strip; Technical details.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { CpmEventFrame } from '../../../api/cpmApi';

vi.mock('./EpisodeActivity', () => ({ EpisodeActivity: () => null }));   // own fetches, own tests
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean; title?: string }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled, title: p.title }, p.children),
}));
const mutation = () => ({ mutate: vi.fn(), isPending: false, isError: false, isSuccess: false, error: null });
const ackMutate = vi.fn();
const noteMutate = vi.fn();
vi.mock('../../../hooks/useCpm', () => ({
  useAcknowledgeEvent: () => ({ ...mutation(), mutate: ackMutate }),
  useShelveEvent: () => mutation(),
  useUnshelveEvent: () => mutation(),
}));
vi.mock('../../../hooks/useLoopNotes', () => ({ useCreateLoopNote: () => ({ ...mutation(), mutate: noteMutate }) }));
afterEach(() => { cleanup(); ackMutate.mockReset(); noteMutate.mockReset(); });

import { EventDetail, currentOf, severityOf } from './EventDetail';
import { diagnosisLabel } from '../vocabulary';

const frame = (over: Partial<CpmEventFrame>): CpmEventFrame => ({
  id: 833, loop_id: 'FIC10301', window_kind: '12h', family: 'OSCILLATION',
  opened_at: '2026-09-02T07:30:00Z', closed_at: null, peak_diagnosis: 'SUSPECTED_OSCILLATION',
  peak_confidence: 1, last_diagnosis: null, last_confidence: null, severity: null, window_count: 1,
  ack_state: 'UNACKNOWLEDGED', acked_by: null, acked_at: null, shelve_until: null, note: null,
  calculation_version: null, dynamics_profile_version: null, availability_state: 'OBSERVED',
  condition_state: 'OPEN', result_revision: 1, qualified_support_ms: 35_640_000, close_reason: null,
  shelf_state: 'NONE', shelved_by: null, shelved_at: null, shelve_reason: null,
  ...over,
});
const Probe = () => { const l = useLocation(); return <output data-testid="loc">{l.pathname + l.search}</output>; };
const mount = (e: CpmEventFrame, canManage = true) =>
  render(<MemoryRouter><EventDetail event={e} canManage={canManage} policy={{ maxHours: 168 }} /><Probe /></MemoryRouter>);

describe('EventDetail (CHG-032)', () => {
  it('shows the shelf and the ack separately; Unshelve is absent while nothing is shelved', () => {
    mount(frame({ ack_state: 'ACKNOWLEDGED', acked_by: 'eng.a', acked_at: '2026-09-19T10:00:00Z' }));
    expect(screen.getByText('Acknowledged')).toBeTruthy();
    expect(screen.getByText('Not shelved')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Unshelve/ })).toBeNull();
    expect((screen.getByRole('button', { name: /^Acknowledge$/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('offers Unshelve for an active shelf, keeps Acknowledge available, and keeps the shelf reason', async () => {
    const until = new Date(Date.now() + 3 * 3_600_000).toISOString();
    mount(frame({ shelf_state: 'SHELVED', shelve_until: until, shelved_by: 'eng.b', shelve_reason: 'valve overhaul booked' }));
    expect(screen.getByText('valve overhaul booked')).toBeTruthy();
    const unshelve = screen.getByRole('button', { name: /Unshelve/ }) as HTMLButtonElement;
    expect(unshelve.disabled).toBe(false);
    fireEvent.click(unshelve);
    expect(await screen.findByRole('group', { name: 'Unshelve this episode' })).toBeTruthy();   // lazy panel
    const ack = screen.getByRole('button', { name: /^Acknowledge$/ }) as HTMLButtonElement;
    expect(ack.disabled).toBe(false);
    expect(ack.title).toMatch(/the shelf stays/);
    expect(screen.getByRole('button', { name: /Update shelf/ })).toBeTruthy();
  });

  it('opens Shelve… from the actions, which go through the real shelve service', async () => {
    mount(frame({}));
    fireEvent.click(screen.getByRole('button', { name: /^Shelve…$/ }));
    expect(await screen.findByRole('group', { name: 'Shelve this episode' })).toBeTruthy();
  });
});

describe('EventDetail layout (CHG-136)', () => {
  it('titles the panel EVT-n · Episode details and names the peak, with Review at the opening window', () => {
    mount(frame({ last_diagnosis: 'NO_CALL' }));
    expect(screen.getByRole('heading', { name: 'EVT-833 · Episode details' })).toBeTruthy();
    expect(screen.getByText(`Peak · ${diagnosisLabel('SUSPECTED_OSCILLATION')}`)).toBeTruthy();
    expect(screen.getByText('Latest · No fault identified')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Review FIC10301 →' }));
    const url = new URL(screen.getByTestId('loc').textContent!, 'http://x');
    expect(url.pathname).toBe('/cpm/investigation');
    expect(url.searchParams.get('loop')).toBe('FIC10301');
    expect(url.searchParams.get('profile')).toBe('12h');
    expect(url.searchParams.get('window')).toBe('2026-09-02T07:30:00Z');
  });

  it('says the latest diagnosis only when it differs from the peak', () => {
    mount(frame({ last_diagnosis: 'SUSPECTED_OSCILLATION' }));
    expect(screen.queryByText(/^Latest ·/)).toBeNull();
  });

  it('shows peak evidence, qualified support and non-overlap windows as one strip', () => {
    mount(frame({}));
    const strip = screen.getByRole('group', { name: 'Evidence of this episode' });
    expect(strip.textContent).toContain('100');
    expect(strip.textContent).toContain('9.9 h');
    expect(strip.textContent).toMatch(/1\s*Non-overlap windows/);
    // three equal columns, the value above its label
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

  it('removes the old headings and keeps the explanations behind a ?', () => {
    mount(frame({ availability_state: 'UNOBSERVABLE' }));
    for (const gone of ['What happened', 'Episode', 'Evidence', 'Provenance', 'Operator state', 'Review and shelf', 'Loop notes'])
      expect(screen.queryByText(gone)).toBeNull();
    expect(screen.queryByText(/Still open: the newest window could not be judged/)).toBeNull();
    expect(screen.queryByText(/family was reported across/)).toBeNull();
  });

  it('opens the episode period in Historical', () => {
    mount(frame({}));
    fireEvent.click(screen.getByRole('button', { name: 'Episode period ↗' }));
    expect(screen.getByTestId('loc').textContent).toMatch(/^\/cpm\/historical\?loop=FIC10301/);
  });

  it('keeps identifiers behind Technical details', () => {
    mount(frame({ calculation_version: 'calc-9', dynamics_profile_version: 'prof-3' }));
    expect(screen.getByText('Technical details')).toBeTruthy();
    expect(screen.getByText('calc-9')).toBeTruthy();
  });

  it('Save note writes a loop note linked to the episode', () => {
    mount(frame({}));
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'checked the valve' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    expect(noteMutate.mock.calls[0][0]).toMatchObject({ loopId: 'FIC10301', note: 'checked the valve', eventId: 833 });
  });

  it('Acknowledge sends the note and its receipt stays', () => {
    type Opts = { onSuccess?: () => void };
    ackMutate.mockImplementation((_v: unknown, o: Opts) => o.onSuccess?.());
    mount(frame({}));
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'seen' } });
    fireEvent.click(screen.getByRole('button', { name: /^Acknowledge$/ }));
    expect(ackMutate.mock.calls[0][0]).toMatchObject({ id: 833, note: 'seen' });
    expect(screen.getAllByRole('status').map(n => n.textContent).join('|')).toMatch(/Acknowledged at /);
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

// CHG-098 (SME review 2 #27): an action's completion is visible beside the actions, and a failure says why.
describe('EventDetail action receipt (CHG-098)', () => {
  type Opts = { onSuccess?: () => void; onError?: (e: unknown) => void };
  it('reports a failed acknowledge with the server reason', () => {
    ackMutate.mockImplementation((_v: unknown, o: Opts) => o.onError?.(new Error('The episode was already acknowledged.')));
    mount(frame({}));
    fireEvent.click(screen.getByRole('button', { name: /^Acknowledge$/ }));
    expect(screen.getByRole('alert').textContent).toBe('Acknowledge failed — The episode was already acknowledged.');
  });

  it('shows the receipt the page holds for this episode when the page owns it', () => {
    render(<MemoryRouter><EventDetail event={frame({})} canManage policy={{ maxHours: 168 }}
      receipt={{ ok: true, text: 'Shelved until later', key: 833 }} onReceipt={() => undefined} /></MemoryRouter>);
    expect(screen.getAllByRole('status').map(n => n.textContent)).toContain('Shelved until later');
  });
});
