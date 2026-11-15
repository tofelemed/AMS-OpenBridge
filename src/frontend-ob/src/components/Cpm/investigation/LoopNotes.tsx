/**
 * SME review #22 (CHG-058): loop notes — always available, not only while an episode is open. A note belongs to
 * the loop; it can name the evaluated window it was written on (the window's decision evidence is pinned) and the
 * diagnosis episode it is about, now or later. Acknowledging an open episode is a separate, explicit choice (ISA-18.2:
 * acknowledgement is a deliberate act). Saving a note never changes the engine's result.
 *
 * CHG-189 (owner review item 12): a "Loop notes (n)" button that opens a dialog (the cyan band, subtitle loop tag · name) with
 * the new-note form, "Save note" as its primary action, and the notes as cards (NoteList), each changed through its Edit action.
 * The same button serves Evidence Replay (under the Evidence check card) and Investigation's Review tab. The episodes and the
 * window's evidence list are read only while the dialog is open; the count on the button is the one read on page load.
 */
import React, { useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmEventFrame } from '../../../api/cpmApi';
import { MAX_NOTE_LENGTH } from '../../../api/cpm/investigations';
import { useAcknowledgeEvent, useCpmEvents } from '../../../hooks/useCpm';
import { useCreateLoopNote, useLoopNotes } from '../../../hooks/useLoopNotes';
import { useAuthStore } from '../../../store/authStore';
import { Dialog } from '../../../ui/Dialog';
import { useEvidenceManifest } from '../evidence/useEvidence';
import { TonePill } from '../shared';
import { ReasonedButton } from '../ReasonedButton';
import { NoteForm } from './NoteForm';
import { NoteList } from './NoteList';
import { EMPTY_DRAFT, notesButtonLabel, type NoteDraft } from './noteText';

interface NotesProps {
  loopId: string;
  /** The evaluated window on screen: its decision run (G15) and a short name. */
  window?: { methodRunId?: string | null; label: string } | null;
  /** The loop's open, unacknowledged episode, if any. */
  openFrame?: CpmEventFrame | null;
  /** Under the dialog title: the loop's tag · name. */
  subtitle?: string;
}

const NotesDialog: React.FC<NotesProps & {
  notes: ReturnType<typeof useLoopNotes>;
  draft: NoteDraft;
  onDraft: (d: NoteDraft) => void;
  onClose: () => void;
}> = ({ loopId, window, openFrame, subtitle, notes, draft, onDraft, onClose }) => {
  const canManage = useAuthStore(s => s.hasPermission('cpm.manage'));
  const episodes = useCpmEvents({ loopId, openOnly: false, limit: 20, sort: 'recent' }, 60_000, !!loopId);
  const manifest = useEvidenceManifest(window?.methodRunId ?? undefined);
  const create = useCreateLoopNote();
  const ack = useAcknowledgeEvent();

  const trimmed = draft.text.trim();
  const reason = !canManage ? 'Needs the cpm.manage permission' : trimmed.length > MAX_NOTE_LENGTH ? `Keep the note under ${MAX_NOTE_LENGTH} characters` : null;
  const save = () => {
    const methodRunId = draft.attach ? window?.methodRunId ?? null : null;
    const alsoAck = !!openFrame && draft.alsoAck;
    create.mutate({
      loopId, note: trimmed, outcome: draft.outcome, methodRunId,
      evidenceIds: draft.attach && methodRunId ? (manifest.data?.artifacts ?? []).map(a => a.artifactId) : [],
      eventId: alsoAck ? openFrame!.id : null,
    }, {
      onSuccess: () => {
        if (alsoAck) ack.mutate({ id: openFrame!.id, note: `Acknowledged with a loop note: ${trimmed.slice(0, 200)}` });
        onDraft({ ...draft, text: '', outcome: 'INCONCLUSIVE', alsoAck: false });
      },
    });
  };

  return (
    <Dialog open onClose={onClose} title="Loop notes" subtitle={subtitle} size="wide"
      footer={<>
        <ObcButton variant="normal" onClick={onClose}>Close</ObcButton>
        <ReasonedButton variant="raised" disabled={!canManage || trimmed.length === 0 || !!reason || create.isPending} reason={reason} onClick={save}>
          {create.isPending ? 'Saving…' : 'Save note'}
        </ReasonedButton>
      </>}>
      <NoteForm draft={draft} onDraft={onDraft} window={window} openFrame={openFrame} />
      {(create.isSuccess || create.isError) && (
        <p className="cpm-note-form__status">
          {create.isSuccess && <TonePill tone="good">Saved</TonePill>}
          {create.isError && <span className="cpm-field__error" role="alert">{(create.error as Error)?.message ?? 'The note was not saved.'}</span>}
        </p>
      )}
      <NoteList notes={notes.data?.investigations ?? []} loading={notes.isLoading} error={notes.isError ? notes.error : null}
        episodes={episodes.data?.events ?? []} canManage={canManage} loopId={loopId} />
    </Dialog>
  );
};

export const LoopNotes: React.FC<NotesProps> = props => {
  const notes = useLoopNotes(props.loopId);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<NoteDraft>(EMPTY_DRAFT);
  const count = notes.data?.count ?? notes.data?.investigations.length ?? 0;
  return (
    <>
      <ObcButton variant="normal" aria-haspopup="dialog" onClick={() => setOpen(true)}>{notesButtonLabel(count)}</ObcButton>
      {open && <NotesDialog {...props} notes={notes} draft={draft} onDraft={setDraft} onClose={() => setOpen(false)} />}
    </>
  );
};

export default LoopNotes;
