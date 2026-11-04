/**
 * Add a note to this episode, or link a loop note written before it opened (CHG-058). A note is a
 * record, not an acknowledgement: only the ticked box acknowledges, as a separate write. The form
 * stays mounted until the last write answers, because a `mutate` callback dies with its component.
 */
import React, { useId, useState } from 'react';
import type { CpmEventFrame } from '../../../api/cpmApi';
import { MAX_NOTE_LENGTH, type NoteOutcome } from '../../../api/cpm/investigations';
import { receiptDone, useReceiptUser, type Receipt } from '../../../components/Cpm/ActionReceipt';
import { isAcknowledged } from '../../../components/Cpm/events/shelfState';
import { siteDateTime } from '../../../cpa/siteTime';
import { useAcknowledgeEvent } from '../../../hooks/useCpm';
import { useCreateLoopNote, useLinkLoopNote, useLoopNotes } from '../../../hooks/useLoopNotes';
import { Button } from '../../../ui/Button';
import { Checkbox } from '../../../ui/forms/Checkbox';
import { Select } from '../../../ui/forms/Select';
import { ActionPanel } from './ActionPanel';
import { failed } from './EpisodeBits';
import { byline } from './episodeView';

const OUTCOMES: Array<{ value: NoteOutcome; label: string }> = [
  { value: 'INCONCLUSIVE', label: 'Inconclusive' },
  { value: 'WORK_COMPLETED', label: 'Work completed' },
  { value: 'PERFORMANCE_RESTORED', label: 'Performance restored' },
];

export const EpisodeNoteForm: React.FC<{
  event: CpmEventFrame;
  zoneId: string;
  onReceipt: (r: Receipt) => void;
  onClose: () => void;
}> = ({ event, zoneId, onReceipt, onClose }) => {
  const noteId = useId();
  const user = useReceiptUser();
  const create = useCreateLoopNote();
  const link = useLinkLoopNote();
  const ack = useAcknowledgeEvent();
  const loopNotes = useLoopNotes(event.loop_id);
  const [text, setText] = useState('');
  const [outcome, setOutcome] = useState<NoteOutcome>('INCONCLUSIVE');
  const [alsoAck, setAlsoAck] = useState(false);
  const [pick, setPick] = useState('');

  const trimmed = text.trim();
  const unlinked = (loopNotes.data?.investigations ?? []).filter(n => n.eventId == null);
  const canAck = !isAcknowledged(event);
  const tooLong = trimmed.length > MAX_NOTE_LENGTH;
  const reason = trimmed.length === 0 ? 'Write a note to save it.'
    : tooLong ? `Keep the note under ${MAX_NOTE_LENGTH} characters.` : undefined;
  const pending = create.isPending || ack.isPending;

  const save = () => {
    const acknowledging = canAck && alsoAck;
    create.mutate({ loopId: event.loop_id, note: trimmed, outcome, eventId: event.id }, {
      onSuccess: () => {
        if (!acknowledging) {
          onReceipt(receiptDone(`Note saved on EVT-${event.id} ${byline(user, zoneId)}`, event.id));
          onClose();
          return;
        }
        ack.mutate({ id: event.id, note: `Acknowledged with a loop note: ${trimmed.slice(0, 200)}` }, {
          onSuccess: () => {
            onReceipt(receiptDone(`Note saved and episode acknowledged ${byline(user, zoneId)}`, event.id));
            onClose();
          },
          onError: err => {
            setText('');
            onReceipt(failed('Note saved. Acknowledge', err, event.id));
          },
        });
      },
      onError: err => onReceipt(failed('Saving the note', err, event.id)),
    });
  };

  const linkNote = () => link.mutate({ refId: pick, eventId: event.id }, {
    onSuccess: () => {
      setPick('');
      onReceipt(receiptDone(`Note linked to EVT-${event.id} ${byline(user, zoneId)}`, event.id));
    },
    onError: err => onReceipt(failed('Linking the note', err, event.id)),
  });

  return (
    <ActionPanel label="Add a note to this episode">
      <div className="ui-field">
        <label className="ui-field__label" htmlFor={noteId}>Note</label>
        <textarea
          id={noteId}
          className="ui-input episode__note-input"
          rows={3}
          value={text}
          maxLength={MAX_NOTE_LENGTH + 1}
          onChange={e => setText(e.target.value)}
        />
      </div>
      <Select label="Outcome" options={OUTCOMES} value={outcome} onChange={setOutcome} />
      {canAck && (
        <Checkbox
          label="Also acknowledge this episode"
          checked={alsoAck}
          onChange={setAlsoAck}
          helper={alsoAck ? 'Saving also acknowledges the episode.' : 'Saving does not acknowledge the episode.'}
        />
      )}
      <div className="episode__form-actions">
        <Button variant="accent" disabled={pending || !!reason} reason={reason} onClick={save}>
          {pending ? 'Saving…' : 'Save note'}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={onClose}>Cancel</Button>
      </div>
      {unlinked.length > 0 && (
        <>
          <Select
            label="Link a loop note"
            value={pick}
            onChange={setPick}
            options={[
              { value: '', label: 'Choose a note' },
              ...unlinked.map(n => ({ value: n.refId, label: `${siteDateTime(n.createdAt, zoneId)} · ${n.note.slice(0, 60)}` })),
            ]}
          />
          <Button
            variant="outline"
            disabled={!pick || link.isPending}
            reason={pick ? undefined : 'Choose a note to link.'}
            onClick={linkNote}
          >
            {link.isPending ? 'Linking…' : 'Link to this episode'}
          </Button>
        </>
      )}
    </ActionPanel>
  );
};
