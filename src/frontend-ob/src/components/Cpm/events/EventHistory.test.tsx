// CHG-032: every operator action on an episode, newest first. CHG-167 (owner review): a table, Time · UTC, Action (tone +
// glyph + word), By, Until, Reason ("20 Sept 12:24 · ◐ Shelved · admin · 21 Sept 12:24 · —").
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { setActiveZone } from '../../../cpa/activeZone';

const actions = vi.fn();
vi.mock('../../../hooks/useCpm', () => ({ useEventActions: (id: number, on: boolean) => actions(id, on) }));
beforeAll(() => setActiveZone('UTC'));
afterEach(() => { cleanup(); actions.mockReset(); });

import { EventHistory } from './EventHistory';
import { stamp } from './eventTime';

const act = (id: number, action: string, at: string, until: string | null, reason: string | null) =>
  ({ id, eventId: 829, action, actor: 'admin', at, until, reason });

describe('EventHistory (CHG-167)', () => {
  it('lists every action as a table row: time, action, by, until and reason', () => {
    actions.mockReturnValue({ isLoading: false, isError: false, data: { actions: [
      act(2, 'ACKNOWLEDGED', '2026-10-15T07:05:00Z', null, 'seen'),
      act(1, 'SHELVED', '2026-09-20T12:24:27Z', '2026-09-21T12:24:25Z', null),
    ] } });
    render(<EventHistory eventId={829} />);
    expect(actions).toHaveBeenCalledWith(829, true);
    const table = screen.getByRole('table', { name: 'Operator history' });
    expect([...table.querySelectorAll('th')].map(h => h.textContent)).toEqual(['Time · UTC', 'Action', 'By', 'Until', 'Reason']);
    const rows = [...table.querySelectorAll('tbody tr')].map(r => [...r.querySelectorAll('td')].map(c => c.textContent));
    expect(rows).toEqual([
      [stamp('2026-10-15T07:05:00Z'), '✓Acknowledged', 'admin', '—', 'seen'],
      [stamp('2026-09-20T12:24:27Z'), '◐Shelved', 'admin', stamp('2026-09-21T12:24:25Z'), '—'],
    ]);
  });

  it('says when no action is recorded yet, and when the history could not be read', () => {
    actions.mockReturnValue({ isLoading: false, isError: false, data: { actions: [] } });
    render(<EventHistory eventId={829} />);
    expect(screen.getByText('No action recorded yet.')).toBeTruthy();
    cleanup();
    actions.mockReturnValue({ isLoading: false, isError: true, error: new Error('HTTP 500'), data: undefined });
    render(<EventHistory eventId={829} />);
    expect(screen.getByRole('alert').textContent).toBe('HTTP 500');
  });
});
