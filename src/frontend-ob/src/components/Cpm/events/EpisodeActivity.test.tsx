// CHG-136: the Activity & notes timeline (newest first, operator actions and loop notes together) and its Full
// history dialog. The history is the CHG-032 operator list; the notes are the CHG-058 loop notes of the episode.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { CpmEventFrame } from '../../../api/cpmApi';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
vi.mock('./EpisodeNotes', () => ({ EpisodeNotes: () => React.createElement('div', null, 'notes and link control') }));
const actions = vi.fn();
const notes = vi.fn();
vi.mock('../../../hooks/useCpm', () => ({ useEventActions: (id: number, on: boolean) => actions(id, on) }));
vi.mock('../../../hooks/useLoopNotes', () => ({ useEventNotes: (id: number) => notes(id) }));
afterEach(() => { cleanup(); actions.mockReset(); notes.mockReset(); });

import { EpisodeActivity, timeline } from './EpisodeActivity';

const act = (id: number, action: string, at: string, reason: string | null = null) =>
  ({ id, eventId: 833, action, actor: 'eng.a', at, until: null, reason });
const note = (refId: string, createdAt: string, text: string) =>
  ({ refId, createdAt, createdBy: 'eng.b', note: text, outcome: 'NO_ACTION_NEEDED', eventId: 833 });
const event = { id: 833, loop_id: 'FIC10301' } as CpmEventFrame;

describe('timeline', () => {
  it('merges actions and notes, newest first', () => {
    const rows = timeline(
      [act(1, 'SHELVED', '2026-09-18T10:00:00Z', 'parts due'), act(2, 'UNSHELVED', '2026-09-20T10:00:00Z')],
      [note('n1', '2026-09-19T10:00:00Z', 'valve checked')] as never);
    expect(rows.map(r => r.key)).toEqual(['a2', 'n1', 'a1']);
    expect(rows[1]).toMatchObject({ who: 'eng.b', text: 'valve checked' });
  });
});

describe('EpisodeActivity', () => {
  it('shows the latest entries and opens the full history in a dialog', () => {
    actions.mockReturnValue({ isLoading: false, isError: false, data: { actions: [act(1, 'SHELVED', '2026-09-18T10:00:00Z', 'parts due')] } });
    notes.mockReturnValue({ isLoading: false, data: { investigations: [note('n1', '2026-09-19T10:00:00Z', 'valve checked')] } });
    render(<EpisodeActivity event={event} />);
    expect(screen.getByText('Activity & notes')).toBeTruthy();
    expect(screen.getByText(/valve checked/)).toBeTruthy();
    expect(screen.getByText(/parts due/)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Full history ↗' }));
    expect(screen.getByRole('dialog', { name: 'EVT-833 · Full history' })).toBeTruthy();
    expect(screen.getByText('notes and link control')).toBeTruthy();
  });

  it('says so when there is no activity yet', () => {
    actions.mockReturnValue({ isLoading: false, isError: false, data: { actions: [] } });
    notes.mockReturnValue({ isLoading: false, data: { investigations: [] } });
    render(<EpisodeActivity event={event} />);
    expect(screen.getByText('No activity yet')).toBeTruthy();
  });
});
