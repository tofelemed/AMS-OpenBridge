// CHG-032 / CHG-098: Acknowledge, Shelve… / Update shelf…, Unshelve… (only with a shelf) and Save note send the same calls as
// before, every disabled action says why, and the last action's receipt stays beside them. CHG-167 (owner review, answer 1):
// Shelve and Unshelve open as dialogs; their sentences stay word for word, the expired-shelf one included. The dialogs are
// loaded with the panel (no lazy import), so these tests are synchronous and cannot time out under a loaded full run.
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { setActiveZone } from '../../../cpa/activeZone';
import type { CpmEventFrame } from '../../../api/cpmApi';

type Opts = { onSuccess?: (r?: unknown) => void; onError?: (e: unknown) => void };
const { m } = vi.hoisted(() => ({
  m: {
    ack: vi.fn(), shelve: vi.fn(), unshelve: vi.fn(), note: vi.fn(),
    shelveError: null as unknown, unshelveError: null as unknown,
  },
}));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean; title?: string }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled, title: p.title }, p.children),
}));
const mutation = (mutate: unknown, error: unknown = null) => ({ mutate, isPending: false, isError: error != null, isSuccess: false, error });
vi.mock('../../../hooks/useCpm', () => ({
  useAcknowledgeEvent: () => mutation(m.ack),
  useShelveEvent: () => mutation(m.shelve, m.shelveError),
  useUnshelveEvent: () => mutation(m.unshelve, m.unshelveError),
}));
vi.mock('../../../hooks/useLoopNotes', () => ({ useCreateLoopNote: () => mutation(m.note) }));

import { EpisodeActions } from './EpisodeActions';

beforeAll(() => setActiveZone('UTC'));
afterEach(() => {
  cleanup();
  for (const k of ['ack', 'shelve', 'unshelve', 'note'] as const) m[k].mockReset();
  m.shelveError = null; m.unshelveError = null;
});

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
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const shelved = (over: Partial<CpmEventFrame> = {}) => frame({ shelf_state: 'SHELVED', shelve_until: inHours(3), shelved_by: 'eng.b', shelve_reason: 'valve overhaul booked', ...over });
const expired = (over: Partial<CpmEventFrame> = {}) => frame({ shelf_state: 'EXPIRED', shelve_until: '2026-09-21T12:24:25Z', ...over });
const mount = (e: CpmEventFrame, { canManage = true, maxHours = 168 } = {}) =>
  render(<EpisodeActions event={e} canManage={canManage} policy={{ maxHours }} />);
const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;
const statuses = () => screen.getAllByRole('status').map(n => n.textContent).join('|');

describe('EpisodeActions: acknowledge and note (CHG-167)', () => {
  it('puts the note in one field with its placeholder, and Acknowledge sends it; the receipt stays', () => {
    m.ack.mockImplementation((_v: unknown, o: Opts) => o.onSuccess?.());
    mount(frame({}));
    const note = screen.getByLabelText('Note') as HTMLInputElement;
    expect(note.placeholder).toBe('Note (optional)');
    fireEvent.change(note, { target: { value: 'seen' } });
    fireEvent.click(button(/^Acknowledge$/));
    expect(m.ack.mock.calls[0][0]).toEqual({ id: 833, note: 'seen' });
    expect(statuses()).toMatch(/Acknowledged at /);
    expect(note.value).toBe('');
  });

  it('Save note writes a loop note linked to the episode, and says to write it first', () => {
    mount(frame({}));
    expect(button('Save note').disabled).toBe(true);
    expect(button('Save note').title).toBe('Write the note first');
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'checked the valve' } });
    fireEvent.click(button('Save note'));
    expect(m.note.mock.calls[0][0]).toEqual({ loopId: 'FIC10301', note: 'checked the valve', eventId: 833 });
  });

  it('reports a failed acknowledge with the server reason', () => {
    m.ack.mockImplementation((_v: unknown, o: Opts) => o.onError?.(new Error('The episode was already acknowledged.')));
    mount(frame({}));
    fireEvent.click(button(/^Acknowledge$/));
    expect(screen.getByRole('alert').textContent).toBe('Acknowledge failed — The episode was already acknowledged.');
  });

  it('shows the receipt the page holds for this episode when the page owns it', () => {
    render(<EpisodeActions event={frame({})} canManage policy={{ maxHours: 168 }}
      receipt={{ ok: true, text: 'Shelved until later', key: 833 }} onReceipt={() => undefined} />);
    expect(screen.getAllByRole('status').map(n => n.textContent)).toContain('Shelved until later');
  });
});

describe('EpisodeActions: every disabled action says why (CHG-057)', () => {
  it('an acknowledged episode, a closed one and a user without cpm.manage', () => {
    mount(frame({ ack_state: 'ACKNOWLEDGED' }));
    expect(button(/^Acknowledge$/).disabled).toBe(true);
    expect(screen.getByText('Already acknowledged')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Unshelve/ })).toBeNull();
    cleanup();
    mount(frame({ closed_at: '2026-10-05T07:30:00Z', condition_state: 'CLOSED' }));
    expect(button('Shelve…').disabled).toBe(true);
    expect(screen.getByText('A closed episode cannot be shelved')).toBeTruthy();
    cleanup();
    mount(shelved(), { canManage: false });
    for (const name of [/^Acknowledge$/, 'Update shelf…', 'Unshelve…', 'Save note']) expect(button(name).disabled).toBe(true);
    expect(screen.getAllByText('Needs the cpm.manage permission')).toHaveLength(4);
  });

  it('offers Unshelve for an active shelf and keeps Acknowledge, which says the shelf stays', () => {
    mount(shelved());
    expect(button('Unshelve…').disabled).toBe(false);
    expect(button(/^Acknowledge$/).disabled).toBe(false);
    expect(button(/^Acknowledge$/).title).toMatch(/the shelf stays/);
    expect(button('Update shelf…')).toBeTruthy();
  });
});

describe('EpisodeActions: Shelve dialog (CHG-167)', () => {
  it('opens a Shelve dialog with its sentence word for word and sends the stated expiry and the reason', () => {
    m.shelve.mockImplementation((v: { until: string }, o: Opts) => o.onSuccess?.({ updated: false, shelveUntil: v.until }));
    mount(frame({}));
    fireEvent.click(button('Shelve…'));
    const dialog = screen.getByRole('dialog', { name: 'Shelve' });
    expect(within(dialog).getByText('A shelf always expires; the episode returns to the queue afterwards with the acknowledgement it has. Shelving does not review it.')).toBeTruthy();
    const send = within(dialog).getByRole('button', { name: 'Shelve' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    expect(within(dialog).getByRole('status').textContent).toBe('A reason is required.');
    expect(within(dialog).getByRole('button', { name: '8 hours' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'maintenance planned' } });
    expect(within(dialog).getByRole('status').textContent).toMatch(/^Shelved until \d+ \w+ \d\d:\d\d UTC · expires in 8\.0 h$/);
    fireEvent.click(send);
    const sent = m.shelve.mock.calls[0][0] as { id: number; until: string; reason: string };
    expect(sent.id).toBe(833);
    expect(sent.reason).toBe('maintenance planned');
    expect(Math.abs(Date.parse(sent.until) - (Date.now() + 8 * 3_600_000))).toBeLessThan(60_000);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(statuses()).toMatch(/Shelved until .+ — at /);
  });

  it('Update shelf replaces the expiry and the reason of an active shelf, the reason kept in the field', () => {
    mount(shelved());
    fireEvent.click(button('Update shelf…'));
    const dialog = screen.getByRole('dialog', { name: 'Update shelf' });
    expect(within(dialog).getByText('This episode is shelved (expires in 3.0 h). A new expiry and reason replace the current ones; the history keeps both.')).toBeTruthy();
    expect((within(dialog).getByLabelText('Reason') as HTMLInputElement).value).toBe('valve overhaul booked');
    expect((within(dialog).getByRole('button', { name: 'Update shelf' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('offers only the presets within the site limit, and refuses an expiry past it', () => {
    mount(frame({}), { maxHours: 24 });
    fireEvent.click(button('Shelve…'));
    const dialog = screen.getByRole('dialog', { name: 'Shelve' });
    expect(within(dialog).queryByRole('button', { name: '7 days' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Until…' }));
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'maintenance planned' } });
    fireEvent.change(within(dialog).getByLabelText('Until'), { target: { value: '2099-01-01T00:00' } });
    expect(within(dialog).getByRole('status').textContent).toMatch(/^The site limit is 24 h \(until .+\)\.$/);
    expect((within(dialog).getByRole('button', { name: 'Shelve' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps a refused shelve in the dialog, and Cancel closes it without a call', () => {
    m.shelveError = new Error('The expiry is past the site limit.');
    mount(frame({}));
    fireEvent.click(button('Shelve…'));
    const dialog = screen.getByRole('dialog', { name: 'Shelve' });
    expect(within(dialog).getByRole('alert').textContent).toBe('The expiry is past the site limit.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(m.shelve).not.toHaveBeenCalled();
  });
});

describe('EpisodeActions: Unshelve dialog (CHG-167)', () => {
  it('opens an Unshelve dialog that says where the episode lands, and sends the optional reason', () => {
    m.unshelve.mockImplementation((_v: unknown, o: Opts) => o.onSuccess?.({ ackState: 'UNACKNOWLEDGED' }));
    mount(shelved());
    fireEvent.click(button('Unshelve…'));
    const dialog = screen.getByRole('dialog', { name: 'Unshelve' });
    expect(within(dialog).getByText('The shelf (expires in 3.0 h) ends now and the episode returns to the Unacknowledged queue.')).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'disturbance cleared' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Unshelve' }));
    expect(m.unshelve.mock.calls[0][0]).toEqual({ id: 833, reason: 'disturbance cleared' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(statuses()).toMatch(/Unshelved at .+ — it is back in the Unacknowledged queue/);
  });

  it('keeps the expired-shelf sentence word for word, and the acknowledged one', () => {
    mount(expired());
    fireEvent.click(button('Unshelve…'));
    expect(screen.getByText('The shelf already expired; unshelving clears the returned-from-shelf flag and the episode returns to the Unacknowledged queue.')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Unshelve' })).getByRole('button', { name: 'Unshelve' }));
    expect(m.unshelve.mock.calls[0][0]).toEqual({ id: 833, reason: undefined });
    cleanup();
    mount(shelved({ ack_state: 'ACKNOWLEDGED' }));
    fireEvent.click(button('Unshelve…'));
    expect(screen.getByText('The shelf (expires in 3.0 h) ends now and the episode stays acknowledged.')).toBeTruthy();
  });

  it('keeps a refused unshelve in the dialog', () => {
    m.unshelveError = new Error('The episode changed: reload it.');
    mount(shelved());
    fireEvent.click(button('Unshelve…'));
    expect(within(screen.getByRole('dialog', { name: 'Unshelve' })).getByRole('alert').textContent).toBe('The episode changed: reload it.');
  });
});
