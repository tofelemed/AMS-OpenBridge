// SME review #22 (CHG-058): a loop note needs no open episode; saving it never acknowledges an episode unless
// the user ticks that box (ISA-18.2: acknowledgement is deliberate); without the permission the reason shows.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LoopNotes } from './LoopNotes';
import type { CpmEventFrame } from '../../../api/cpmApi';

const create = vi.fn();
const ack = vi.fn();
let canManage = true;

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; disabled?: boolean; onClick?: () => void }) =>
    React.createElement('button', { disabled: p.disabled, onClick: p.onClick }, p.children),
}));
vi.mock('../../../store/authStore', () => ({ useAuthStore: (sel: (s: { hasPermission: () => boolean }) => unknown) => sel({ hasPermission: () => canManage }) }));
vi.mock('../evidence/useEvidence', () => ({ useEvidenceManifest: () => ({ data: { artifacts: [{ artifactId: 'ev-1' }] } }) }));
vi.mock('../../../hooks/useCpm', () => ({
  useCpmEvents: () => ({ data: { events: [] } }),
  useAcknowledgeEvent: () => ({ mutate: ack }),
}));
vi.mock('../../../hooks/useLoopNotes', () => ({
  useLoopNotes: () => ({ data: { count: 0, investigations: [] }, isLoading: false }),
  useCreateLoopNote: () => ({ mutate: (n: unknown, o?: { onSuccess?: () => void }) => { create(n); o?.onSuccess?.(); }, isPending: false, isSuccess: false, isError: false }),
  useLinkLoopNote: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useSetLoopNoteOutcome: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));

const frame = { id: 77, loop_id: 'FIC10401', peak_diagnosis: 'CONFIRMED_OSCILLATION', opened_at: '2026-10-06T10:00:00Z', closed_at: null } as unknown as CpmEventFrame;
const renderNotes = (openFrame: CpmEventFrame | null) => render(
  <MemoryRouter><LoopNotes loopId="FIC10401" openFrame={openFrame} window={{ methodRunId: 'run-15', label: '24 h · ends 6 Oct 10:00' }} /></MemoryRouter>);

beforeEach(() => { create.mockReset(); ack.mockReset(); canManage = true; });
afterEach(cleanup);

describe('LoopNotes', () => {
  it('takes a note on a loop with no open episode, attached to the window and its evidence', () => {
    renderNotes(null);
    expect(screen.queryByText(/Also acknowledge/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Loop note'), { target: { value: 'OP sticky near 30 %' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    expect(create).toHaveBeenCalledWith({ loopId: 'FIC10401', note: 'OP sticky near 30 %', outcome: 'INCONCLUSIVE', methodRunId: 'run-15', evidenceIds: ['ev-1'], eventId: null });
    expect(ack).not.toHaveBeenCalled();
  });

  it('acknowledges the open episode only when asked to, and links the note to it', () => {
    renderNotes(frame);
    fireEvent.change(screen.getByLabelText('Loop note'), { target: { value: 'first look' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    expect(ack).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Loop note'), { target: { value: 'reviewed' } });
    fireEvent.click(screen.getByLabelText(/Also acknowledge the open episode EVT-77/));
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    expect(create).toHaveBeenLastCalledWith(expect.objectContaining({ eventId: 77 }));
    expect(ack).toHaveBeenCalledTimes(1);
  });

  it('says why saving is unavailable without the permission', () => {
    canManage = false;
    renderNotes(null);
    expect(screen.getByText('Needs the cpm.manage permission')).toBeTruthy();
  });
});
