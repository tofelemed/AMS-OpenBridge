// CHG-032: the detail shows the acknowledgement and the shelf as two facts, offers unshelve
// exactly when there is a shelf to end, and loads the history only when asked.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CpmEventFrame } from '../../../api/cpmApi';

vi.mock('./EpisodeNotes', () => ({ EpisodeNotes: () => null }));   // CHG-058: own fetches, own tests
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean; title?: string }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled, title: p.title }, p.children),
}));
const mutation = () => ({ mutate: vi.fn(), isPending: false, isError: false, isSuccess: false, error: null });
const actions = vi.fn();
vi.mock('../../../hooks/useCpm', () => ({
  useAcknowledgeEvent: () => mutation(),
  useShelveEvent: () => mutation(),
  useUnshelveEvent: () => mutation(),
  useEventActions: (id: number, enabled: boolean) => actions(id, enabled),
}));
afterEach(() => { cleanup(); actions.mockReset(); });

import { EventDetail, currentOf, severityOf } from './EventDetail';

const frame = (over: Partial<CpmEventFrame>): CpmEventFrame => ({
  id: 833, loop_id: 'FIC10301', window_kind: '24h', family: 'OSCILLATION',
  opened_at: '2026-09-02T07:30:00Z', closed_at: null, peak_diagnosis: 'SUSPECTED_OSCILLATION',
  peak_confidence: 0.8, last_diagnosis: null, last_confidence: null, severity: null, window_count: 4,
  ack_state: 'UNACKNOWLEDGED', acked_by: null, acked_at: null, shelve_until: null, note: null,
  calculation_version: null, dynamics_profile_version: null, availability_state: 'OBSERVED',
  condition_state: 'OPEN', result_revision: 1, qualified_support_ms: null, close_reason: null,
  shelf_state: 'NONE', shelved_by: null, shelved_at: null, shelve_reason: null,
  ...over,
});
const mount = (e: CpmEventFrame, canManage = true) =>
  render(<MemoryRouter><EventDetail event={e} canManage={canManage} policy={{ maxHours: 168 }} /></MemoryRouter>);

describe('EventDetail (CHG-032)', () => {
  it('shows the shelf and the ack separately and disables Unshelve with a reason when nothing is shelved', () => {
    actions.mockReturnValue({ isLoading: false, isError: false, data: undefined });
    mount(frame({ ack_state: 'ACKNOWLEDGED', acked_by: 'eng.a', acked_at: '2026-09-19T10:00:00Z' }));
    expect(screen.getAllByText('Acknowledged').length).toBeGreaterThan(0);   // header pill + Operator state row
    expect(screen.getByText('Not shelved')).toBeTruthy();
    const unshelve = screen.getByRole('button', { name: /Unshelve/ }) as HTMLButtonElement;
    expect(unshelve.disabled).toBe(true);
    expect(unshelve.title).toBe('The episode is not shelved');
    expect((screen.getByRole('button', { name: /^Acknowledge$/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('offers Unshelve for an active shelf, keeps Acknowledge available, and says the shelf stays', async () => {
    actions.mockReturnValue({ isLoading: false, isError: false, data: undefined });
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

  it('fetches the history only after History is opened, newest first', async () => {
    actions.mockReturnValue({
      isLoading: false, isError: false,
      data: { eventId: 833, count: 2, actions: [
        { id: 2, eventId: 833, action: 'UNSHELVED', actor: 'eng.a', at: '2026-09-19T10:00:00Z', until: null, reason: 'fixed' },
        { id: 1, eventId: 833, action: 'SHELVED', actor: 'eng.b', at: '2026-09-18T10:00:00Z', until: '2026-09-25T10:00:00Z', reason: 'parts due' },
      ] },
    });
    mount(frame({}));
    expect(actions).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /History/ }));
    await waitFor(() => expect(screen.getByRole('list', { name: 'Operator history' })).toBeTruthy());
    expect(actions).toHaveBeenCalledWith(833, true);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toMatch(/Unshelved/);
    expect(items[1].textContent).toMatch(/Shelved.*eng\.b.*until.*parts due/);
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
