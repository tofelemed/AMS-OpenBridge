'use client';

/**
 * Loop Events › the selected episode's actions (CHG-032, CHG-057, CHG-098; moved out of EventDetail by CHG-167). The note field,
 * Acknowledge (it sends the note), Shelve… / Update shelf…, Unshelve… (only with a shelf) and Save note (a loop note linked to
 * the episode; it does not acknowledge). Every disabled action says why, on screen; the last action's receipt stays beside
 * them. CHG-167 (owner review, answer 1): Shelve and Unshelve open dialogs; the note's label became its placeholder.
 */
import React, { useState } from 'react';
import type { CpmShelvePolicy } from '../../../api/cpmApi';
import type { CpmEpisode } from '../../../api/cpm/eventPage';
import { useAcknowledgeEvent, useShelveEvent, useUnshelveEvent } from '../../../hooks/useCpm';
import { useCreateLoopNote } from '../../../hooks/useLoopNotes';
import { fmtWhen } from '../blocks/whenText';
import { ReasonedButton } from '../ReasonedButton';
import { ActionReceipt, byNow, receiptDone, receiptFailed, useReceiptUser, type Receipt } from '../ActionReceipt';
import { conditionOf } from './eventsState';
import { isAcknowledged, shelfState } from './shelfState';
import { ShelveDialog } from './ShelveDialog';
import { UnshelveDialog } from './UnshelveDialog';

const DEFAULT_MAX_HOURS = 168;

export interface EpisodeActionsProps {
  event: CpmEpisode;
  canManage: boolean;
  /** From the events read; absent on an API that predates CHG-032. */
  policy?: CpmShelvePolicy;
  /**
   * CHG-098 (SME review 2 #27): the last action's receipt for this episode. Held by the page so it survives the detail
   * remounting when the action moves the episode off the current tab; kept locally when no owner is given.
   */
  receipt?: Receipt | null;
  onReceipt?: (r: Receipt) => void;
}

type Open = 'none' | 'shelve' | 'unshelve';

export const EpisodeActions: React.FC<EpisodeActionsProps> = ({ event, canManage, policy, receipt: ownedReceipt, onReceipt }) => {
  const user = useReceiptUser();
  const [localReceipt, setLocalReceipt] = useState<Receipt | null>(null);
  const receipt = onReceipt ? ownedReceipt ?? null : localReceipt;
  const report = onReceipt ?? setLocalReceipt;
  const ack = useAcknowledgeEvent();
  const shelve = useShelveEvent();
  const unshelve = useUnshelveEvent();
  const saveNote = useCreateLoopNote();
  const [dialog, setDialog] = useState<Open>('none');
  const [note, setNote] = useState('');
  const shelf = shelfState(event, Date.now());
  const open = conditionOf(event) === 'OPEN';
  const acked = isAcknowledged(event);
  const maxHours = policy?.maxHours ?? DEFAULT_MAX_HOURS;
  const needs = !canManage ? 'Needs the cpm.manage permission' : null;

  const ackTitle = needs ?? (acked ? 'Already acknowledged'
    : shelf === 'ACTIVE' ? 'Record the review; the shelf stays until it expires or is unshelved'
      : shelf === 'EXPIRED' ? 'Record the review; this also clears the returned-from-shelf flag'
        : 'Record that this finding has been reviewed');
  const shelveTitle = needs ?? (!open ? 'A closed episode cannot be shelved'
    : shelf === 'ACTIVE' ? 'Change the expiry or reason of the current shelf' : `Shelve until a stated expiry (site limit ${maxHours} h)`);
  const unshelveTitle = needs ?? (shelf === 'ACTIVE' ? 'End the shelf now' : 'Clear the returned-from-shelf flag');
  const noteTitle = needs ?? (note.trim() ? 'Write this as a loop note linked to the episode; it does not acknowledge' : 'Write the note first');
  const close = () => setDialog('none');

  return (
    <div className="cpm-events-panel__sect">
      <input className="cpm-input cpm-events-note" aria-label="Note" placeholder="Note (optional)"
        value={note} onChange={e => setNote(e.target.value)} />
      <div className="cpm-inspector__actions">
        <ReasonedButton variant="raised" disabled={!canManage || ack.isPending || acked} title={ackTitle} reason={ack.isPending ? null : ackTitle}
          onClick={() => ack.mutate({ id: event.id, note: note || undefined }, {
            onSuccess: () => { setNote(''); report(receiptDone(`Acknowledged ${byNow(user)}`, event.id)); },
            onError: err => report(receiptFailed('Acknowledge', err, event.id)),
          })}>
          {ack.isPending ? 'Acknowledging…' : 'Acknowledge'}
        </ReasonedButton>
        <ReasonedButton variant="normal" disabled={!canManage || !open || shelve.isPending} title={shelveTitle} reason={shelve.isPending ? null : shelveTitle}
          onClick={() => setDialog('shelve')}>
          {shelf === 'ACTIVE' ? 'Update shelf…' : 'Shelve…'}
        </ReasonedButton>
        {shelf && (
          <ReasonedButton variant="normal" disabled={!canManage || unshelve.isPending} title={unshelveTitle} reason={unshelve.isPending ? null : unshelveTitle}
            onClick={() => setDialog('unshelve')}>
            Unshelve…
          </ReasonedButton>
        )}
        <ReasonedButton variant="normal" disabled={!canManage || !note.trim() || saveNote.isPending} title={noteTitle} reason={needs}
          onClick={() => saveNote.mutate({ loopId: event.loop_id, note: note.trim(), eventId: event.id }, {
            onSuccess: () => { setNote(''); report(receiptDone(`Note saved ${byNow(user)}`, event.id)); },
            onError: err => report(receiptFailed('Saving the note', err, event.id)),
          })}>
          {saveNote.isPending ? 'Saving…' : 'Save note'}
        </ReasonedButton>
      </div>
      {/* CHG-098 (SME review 2 #27): what the last action recorded (or why it failed) stays beside the actions until the next
          one. Shelve / unshelve refusals stay inside their dialog, where the inputs to correct are. */}
      <ActionReceipt receipt={receipt} />
      <ShelveDialog open={dialog === 'shelve'} event={event} canManage={canManage} pending={shelve.isPending} error={shelve.error}
        maxHours={maxHours} onClose={close}
        onShelve={(until, reason) => shelve.mutate({ id: event.id, until, reason }, {
          onSuccess: r => {
            close();
            report(receiptDone(`${r.updated ? 'Shelf updated' : 'Shelved'} until ${fmtWhen(r.shelveUntil ?? until)} — ${byNow(user)}`, event.id));
          },
        })} />
      <UnshelveDialog open={dialog === 'unshelve'} event={event} canManage={canManage} pending={unshelve.isPending} error={unshelve.error}
        onClose={close}
        onUnshelve={reason => unshelve.mutate({ id: event.id, reason }, {
          onSuccess: r => {
            close();
            const lands = r.ackState === 'ACKNOWLEDGED' ? 'it stays acknowledged' : 'it is back in the Unacknowledged queue';
            report(receiptDone(`Unshelved ${byNow(user)} — ${lands}`, event.id));
          },
        })} />
    </div>
  );
};

export default EpisodeActions;
