// SME review #22 (CHG-058): the loop notes linked to an episode, and linking an earlier one; a link is a record, not an
// acknowledgement. CHG-167 (owner review): the Notes part of Full history; "Link a loop note…" and "Link".
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { setActiveZone } from '../../../cpa/activeZone';
import type { CpmEventFrame } from '../../../api/cpmApi';

const { s } = vi.hoisted(() => ({ s: { manage: true, linked: [] as unknown[], loop: [] as unknown[], link: vi.fn() } }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('../../../store/authStore', () => ({
  useAuthStore: (f: (st: { hasPermission: () => boolean; user: null }) => unknown) => f({ hasPermission: () => s.manage, user: null }),
}));
vi.mock('../../../hooks/useLoopNotes', () => ({
  useEventNotes: () => ({ data: { investigations: s.linked } }),
  useLoopNotes: () => ({ data: { investigations: s.loop } }),
  useLinkLoopNote: () => ({ mutate: s.link, isPending: false }),
}));
beforeAll(() => setActiveZone('UTC'));
afterEach(() => { cleanup(); s.manage = true; s.linked = []; s.loop = []; s.link.mockReset(); });

import { EpisodeNotes } from './EpisodeNotes';

const event = { id: 833, loop_id: 'FIC10301' } as CpmEventFrame;
const note = (refId: string, text: string, eventId: number | null) =>
  ({ refId, createdAt: '2026-10-03T09:12:00Z', createdBy: 'eng.b', note: text, outcome: 'NO_ACTION_NEEDED', eventId });

describe('EpisodeNotes (CHG-167)', () => {
  it('says when no loop note is linked, and offers no link control without an earlier note', () => {
    render(<EpisodeNotes event={event} />);
    expect(screen.getByText('No loop note is linked to this episode.')).toBeTruthy();
    expect(screen.queryByLabelText('Link a loop note')).toBeNull();
  });

  it('lists the linked notes and links an earlier one to this episode', () => {
    s.linked = [note('n1', 'valve checked', 833)];
    s.loop = [note('n1', 'valve checked', 833), note('n2', 'Valve sticks below 20 % OP, maintenance asked', null)];
    render(<EpisodeNotes event={event} />);
    expect(screen.getByText('valve checked')).toBeTruthy();
    const pick = screen.getByLabelText('Link a loop note') as HTMLSelectElement;
    expect([...pick.options].map(o => o.textContent)).toEqual(['Link a loop note…', '3 Oct 09:12 · Valve sticks below 20 % OP, maintenance asked']);
    const link = screen.getByRole('button', { name: 'Link' }) as HTMLButtonElement;
    expect(link.disabled).toBe(true);
    fireEvent.change(pick, { target: { value: 'n2' } });
    fireEvent.click(link);
    expect(s.link.mock.calls[0][0]).toEqual({ refId: 'n2', eventId: 833 });
  });

  it('says why linking is unavailable without cpm.manage', () => {
    s.manage = false;
    s.loop = [note('n2', 'earlier note', null)];
    render(<EpisodeNotes event={event} />);
    expect(screen.getByText('Needs the cpm.manage permission')).toBeTruthy();
  });
});
