// SME review #22 (CHG-058): a loop note needs no open episode; saving it never acknowledges an episode unless
// the user ticks that box (ISA-18.2: acknowledgement is deliberate); without the permission the reason shows.
// CHG-189 (owner review item 12): the notes are a "Loop notes (n)" button that opens a dialog with the form and the notes as
// cards; an existing note changes through its Edit action; no "RECORD IT", no caps labels, "1 note" never "note(s)".
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LoopNotes } from './LoopNotes';
import { noteCount, notesButtonLabel } from './noteText';
import type { CpmEventFrame } from '../../../api/cpmApi';
import type { LoopNote } from '../../../api/cpm/investigations';

const s = vi.hoisted(() => ({
  create: vi.fn(), ack: vi.fn(), link: vi.fn(), outcome: vi.fn(),
  canManage: true, notes: [] as unknown[], episodesAsked: 0,
}));

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; disabled?: boolean; onClick?: () => void; variant?: string }) =>
    React.createElement('button', { disabled: p.disabled, onClick: p.onClick, 'data-variant': p.variant }, p.children),
}));
vi.mock('../../../store/authStore', () => ({ useAuthStore: (sel: (x: { hasPermission: () => boolean }) => unknown) => sel({ hasPermission: () => s.canManage }) }));
vi.mock('../evidence/useEvidence', () => ({ useEvidenceManifest: () => ({ data: { artifacts: [{ artifactId: 'ev-1' }] } }) }));
vi.mock('../../../hooks/useCpm', () => ({
  useCpmEvents: () => { s.episodesAsked += 1; return { data: { events: [
    { id: 77, peak_diagnosis: 'CONFIRMED_OSCILLATION', opened_at: '2026-10-06T10:00:00Z', closed_at: null },
    { id: 12, peak_diagnosis: 'SUSPECTED_STICTION', opened_at: '2026-10-01T10:00:00Z', closed_at: '2026-10-01T12:00:00Z' },
  ] } }; },
  useAcknowledgeEvent: () => ({ mutate: s.ack }),
}));
vi.mock('../../../hooks/useLoopNotes', () => ({
  useLoopNotes: () => ({ data: { count: s.notes.length, investigations: s.notes }, isLoading: false, isError: false }),
  useCreateLoopNote: () => ({ mutate: (n: unknown, o?: { onSuccess?: () => void }) => { s.create(n); o?.onSuccess?.(); }, isPending: false, isSuccess: false, isError: false }),
  useLinkLoopNote: () => ({ mutateAsync: (v: unknown) => { s.link(v); return Promise.resolve(v); }, isPending: false, error: null }),
  useSetLoopNoteOutcome: () => ({ mutateAsync: (v: unknown) => { s.outcome(v); return Promise.resolve(v); }, isPending: false, error: null }),
}));

const frame = { id: 77, loop_id: 'FIC10401', peak_diagnosis: 'CONFIRMED_OSCILLATION', opened_at: '2026-10-06T10:00:00Z', closed_at: null } as unknown as CpmEventFrame;
const note = (refId: string, createdAt: string, over: Partial<LoopNote> = {}): LoopNote => ({
  refId, loopId: 'FIC10401', methodRunId: null, evidenceIds: [], note: `note ${refId}`, outcome: 'INCONCLUSIVE', createdBy: 'admin', createdAt,
  updatedBy: null, updatedAt: createdAt, pinned: false, eventId: null, ...over,
});
const renderNotes = (openFrame: CpmEventFrame | null = null) => render(
  <MemoryRouter><LoopNotes loopId="FIC10401" openFrame={openFrame} subtitle="FIC10401 · Flow controller" window={{ methodRunId: 'run-15', label: '24 h · ends 6 Oct 10:00' }} /></MemoryRouter>);
const openDialog = () => { fireEvent.click(screen.getByRole('button', { name: /^Loop notes/ })); return screen.getByRole('dialog', { name: 'Loop notes' }); };

beforeEach(() => { s.create.mockReset(); s.ack.mockReset(); s.link.mockReset(); s.outcome.mockReset(); s.canManage = true; s.notes = []; s.episodesAsked = 0; });
afterEach(cleanup);

describe('LoopNotes button', () => {
  it('names its count only when there is one: "Loop notes", then "Loop notes (n)"', () => {
    renderNotes();
    expect(screen.getByRole('button', { name: 'Loop notes' })).toBeTruthy();
    cleanup();
    s.notes = [note('a', '2026-10-10T10:06:00Z')];
    renderNotes();
    expect(screen.getByRole('button', { name: 'Loop notes (1)' })).toBeTruthy();
    expect(notesButtonLabel(3)).toBe('Loop notes (3)');
  });

  it('shows no form, list or caps label on the page until it is opened, and reads the episodes only then', () => {
    renderNotes(frame);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByLabelText('Note')).toBeNull();
    expect(screen.queryByText(/record it/i)).toBeNull();
    expect(s.episodesAsked).toBe(0);
    openDialog();
    expect(s.episodesAsked).toBeGreaterThan(0);
  });
});

describe('Loop notes dialog', () => {
  it('opens with the loop under its title, the form, and Save note as its primary action', () => {
    renderNotes(frame);
    const dialog = openDialog();
    expect(within(dialog).getByText('FIC10401 · Flow controller')).toBeTruthy();
    expect(within(dialog).getByLabelText('Note')).toBeTruthy();
    expect(within(dialog).getByLabelText('Outcome')).toBeTruthy();
    expect(within(dialog).getByLabelText('Attach to this window — its evidence is kept')).toBeTruthy();
    expect(within(dialog).getByLabelText(/Also acknowledge the open episode EVT-77/)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Save note' }).getAttribute('data-variant')).toBe('raised');
    // sentence-case labels, no caps eyebrow
    expect(dialog.querySelector('.cpm-field__label, .cpm-eyebrow')).toBeNull();
    expect(within(dialog).queryByText('OUTCOME')).toBeNull();
  });

  it('takes a note on a loop with no open episode, attached to the window and its evidence', () => {
    renderNotes(null);
    const dialog = openDialog();
    expect(within(dialog).queryByText(/Also acknowledge/)).toBeNull();
    fireEvent.change(within(dialog).getByLabelText('Note'), { target: { value: 'OP sticky near 30 %' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save note' }));
    expect(s.create).toHaveBeenCalledWith({ loopId: 'FIC10401', note: 'OP sticky near 30 %', outcome: 'INCONCLUSIVE', methodRunId: 'run-15', evidenceIds: ['ev-1'], eventId: null });
    expect(s.ack).not.toHaveBeenCalled();
    expect((within(dialog).getByLabelText('Note') as HTMLTextAreaElement).value).toBe('');
  });

  it('acknowledges the open episode only when asked to, and links the note to it', () => {
    renderNotes(frame);
    const dialog = openDialog();
    fireEvent.change(within(dialog).getByLabelText('Note'), { target: { value: 'first look' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save note' }));
    expect(s.ack).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText('Note'), { target: { value: 'reviewed' } });
    fireEvent.click(within(dialog).getByLabelText(/Also acknowledge the open episode EVT-77/));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save note' }));
    expect(s.create).toHaveBeenLastCalledWith(expect.objectContaining({ eventId: 77 }));
    expect(s.ack).toHaveBeenCalledTimes(1);
  });

  it('keeps what was typed when the dialog is closed and opened again', () => {
    renderNotes();
    fireEvent.change(within(openDialog()).getByLabelText('Note'), { target: { value: 'half a thought' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((within(openDialog()).getByLabelText('Note') as HTMLTextAreaElement).value).toBe('half a thought');
  });

  it('says why saving is unavailable without the permission, and offers no Edit', () => {
    s.canManage = false;
    s.notes = [note('a', '2026-10-10T10:06:00Z')];
    renderNotes(null);
    const dialog = openDialog();
    expect(within(dialog).getByText('Needs the cpm.manage permission')).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Edit' })).toBeNull();
  });
});

describe('Loop notes as cards', () => {
  it('says "1 note", never "note(s)", and lists the notes newest first with their outcome as a badge', () => {
    s.notes = [note('old', '2026-10-01T08:00:00Z'), note('new', '2026-10-10T10:06:00Z', { outcome: 'WORK_COMPLETED' }), note('mid', '2026-10-05T09:00:00Z')];
    renderNotes();
    const dialog = openDialog();
    expect(within(dialog).getByRole('heading', { level: 3, name: '3 notes' })).toBeTruthy();
    const cards = [...dialog.querySelectorAll('.cpm-note-card')];
    expect(cards.map(c => c.querySelector('.cpm-note-card__text')?.textContent)).toEqual(['note new', 'note mid', 'note old']);
    expect(cards[0].querySelector('.cpm-pill')?.textContent).toBe('Work completed');
    expect(dialog.textContent).not.toMatch(/note\(s\)/);
    expect([noteCount(0), noteCount(1), noteCount(2)]).toEqual(['0 notes', '1 note', '2 notes']);
  });

  it('shows no select on a card until its Edit is pressed', () => {
    s.notes = [note('a', '2026-10-10T10:06:00Z', { eventId: 77 })];
    renderNotes();
    const card = openDialog().querySelector('.cpm-note-card') as HTMLElement;
    expect(card.querySelector('select')).toBeNull();
    expect(within(card).getByRole('link', { name: /EVT-77/ })).toBeTruthy();
  });

  it('changes a note’s episode and outcome through Edit, sending only what changed', async () => {
    s.notes = [note('a', '2026-10-10T10:06:00Z', { eventId: 77 })];
    renderNotes();
    const card = openDialog().querySelector('.cpm-note-card') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: 'Edit' }));
    expect((within(card).getByLabelText('Episode') as HTMLSelectElement).value).toBe('77');
    fireEvent.change(within(card).getByLabelText('Outcome'), { target: { value: 'PERFORMANCE_RESTORED' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(card.querySelector('select')).toBeNull());
    expect(s.outcome).toHaveBeenCalledWith({ refId: 'a', outcome: 'PERFORMANCE_RESTORED' });
    expect(s.link).not.toHaveBeenCalled();
    fireEvent.click(within(card).getByRole('button', { name: 'Edit' }));
    fireEvent.change(within(card).getByLabelText('Episode'), { target: { value: '' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(s.link).toHaveBeenCalledWith({ refId: 'a', eventId: null }));
  });

  it('drops an edit on Cancel, sending nothing', () => {
    s.notes = [note('a', '2026-10-10T10:06:00Z')];
    renderNotes();
    const card = openDialog().querySelector('.cpm-note-card') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: 'Edit' }));
    fireEvent.change(within(card).getByLabelText('Episode'), { target: { value: '12' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Cancel' }));
    expect(card.querySelector('select')).toBeNull();
    expect(s.link).not.toHaveBeenCalled();
    expect(s.outcome).not.toHaveBeenCalled();
  });

  it('says so when the loop has no notes yet', () => {
    renderNotes();
    expect(within(openDialog()).getByText('No notes on this loop yet.')).toBeTruthy();
  });
});
