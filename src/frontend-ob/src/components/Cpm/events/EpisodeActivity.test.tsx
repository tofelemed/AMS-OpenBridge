// CHG-136: the Activity & notes timeline (newest first, operator actions and loop notes together) and its Full history dialog.
// CHG-167 (owner review): Activity is the one place for who, when and why ("Shelved · superadmin · until 11 Nov 21:30 —
// maintenance planned"); Full history is a dialog, so no ↗, titled "Full history", in two parts: Actions (a table) and Notes.
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { setActiveZone } from '../../../cpa/activeZone';
import type { CpmEventFrame } from '../../../api/cpmApi';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
vi.mock('./EpisodeNotes', () => ({ EpisodeNotes: () => React.createElement('div', null, 'notes and link control') }));
const actions = vi.fn();
const notes = vi.fn();
vi.mock('../../../hooks/useCpm', () => ({ useEventActions: (id: number, on: boolean) => actions(id, on) }));
vi.mock('../../../hooks/useLoopNotes', () => ({ useEventNotes: (id: number) => notes(id) }));
beforeAll(() => setActiveZone('UTC'));
afterEach(() => { cleanup(); actions.mockReset(); notes.mockReset(); });

import { EpisodeActivity, timeline } from './EpisodeActivity';
import { stamp } from './eventTime';

const act = (id: number, action: string, at: string, reason: string | null = null, until: string | null = null) =>
  ({ id, eventId: 833, action, actor: 'eng.a', at, until, reason });
const note = (refId: string, createdAt: string, text: string) =>
  ({ refId, createdAt, createdBy: 'eng.b', note: text, outcome: 'NO_ACTION_NEEDED', eventId: 833 });
const event = { id: 833, loop_id: 'FIC10301' } as CpmEventFrame;

describe('timeline', () => {
  it('merges actions and notes, newest first, with the expiry of a shelf', () => {
    const rows = timeline(
      [act(1, 'SHELVED', '2026-09-18T10:00:00Z', 'parts due', '2026-09-18T18:00:00Z'), act(2, 'UNSHELVED', '2026-09-20T10:00:00Z')],
      [note('n1', '2026-09-19T10:00:00Z', 'valve checked')] as never);
    expect(rows.map(r => r.key)).toEqual(['a2', 'n1', 'a1']);
    expect(rows[1]).toMatchObject({ who: 'eng.b', text: 'valve checked' });
    expect(rows[2]).toMatchObject({ label: 'Shelved', until: '2026-09-18T18:00:00Z' });
  });
});

describe('EpisodeActivity', () => {
  it('shows the latest entries with who, when, until and why, and opens the full history in a dialog', () => {
    actions.mockReturnValue({ isLoading: false, isError: false, data: { actions: [act(1, 'SHELVED', '2026-09-18T10:00:00Z', 'parts due', '2026-09-18T18:00:00Z')] } });
    notes.mockReturnValue({ isLoading: false, data: { investigations: [note('n1', '2026-09-19T10:00:00Z', 'valve checked')] } });
    render(<EpisodeActivity event={event} />);
    expect(screen.getByRole('heading', { name: 'Activity & notes' })).toBeTruthy();
    expect(screen.getByText('Note · eng.b — valve checked')).toBeTruthy();
    const shelved = screen.getByText(`Shelved · eng.a · until ${stamp('2026-09-18T18:00:00Z')} — parts due`);
    expect(shelved.previousElementSibling?.textContent).toBe(stamp('2026-09-18T10:00:00Z'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: /↗/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Full history' }));
    const dialog = screen.getByRole('dialog', { name: 'Full history' });
    expect(within(dialog).getByRole('heading', { name: 'Actions' })).toBeTruthy();
    expect(within(dialog).getByRole('heading', { name: 'Notes' })).toBeTruthy();
    expect(within(dialog).getByText('notes and link control')).toBeTruthy();
  });

  it('says so when there is no activity yet', () => {
    actions.mockReturnValue({ isLoading: false, isError: false, data: { actions: [] } });
    notes.mockReturnValue({ isLoading: false, data: { investigations: [] } });
    render(<EpisodeActivity event={event} />);
    expect(screen.getByText('No activity yet')).toBeTruthy();
  });

  it('says when the history could not be read', () => {
    actions.mockReturnValue({ isLoading: false, isError: true, data: undefined });
    notes.mockReturnValue({ isLoading: false, data: { investigations: [] } });
    render(<EpisodeActivity event={event} />);
    expect(screen.getAllByRole('alert').map(a => a.textContent)).toContain('The history could not be loaded.');
  });
});
