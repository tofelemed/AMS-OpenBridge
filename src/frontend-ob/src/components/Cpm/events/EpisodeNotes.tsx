/**
 * SME review #22 (CHG-058; CHG-136 inside the Full history dialog): the loop notes linked to this diagnosis episode, and linking
 * one written before the episode opened. Linking is a record, not an acknowledgement. CHG-167 (owner review): the Notes part of
 * Full history; "No loop note is linked to this episode." when there is none; the control reads "Link a loop note…" · Link.
 */
import React, { useState } from 'react';
import type { CpmEventFrame } from '../../../api/cpmApi';
import { useEventNotes, useLinkLoopNote, useLoopNotes } from '../../../hooks/useLoopNotes';
import { useAuthStore } from '../../../store/authStore';
import { ReasonedButton } from '../ReasonedButton';
import { fmtInstant } from '../context/LoopContextBar';
import { codeLabel } from '../vocabulary';
import { ActionReceipt, byNow, receiptDone, receiptFailed, useReceiptUser, type Receipt } from '../ActionReceipt';
import { stamp } from './eventTime';

export const EpisodeNotes: React.FC<{ event: CpmEventFrame }> = ({ event }) => {
  const canManage = useAuthStore(s => s.hasPermission('cpm.manage'));
  const linked = useEventNotes(event.id);
  const loopNotes = useLoopNotes(event.loop_id);
  const link = useLinkLoopNote();
  const [pick, setPick] = useState('');
  // CHG-098 (SME review 2 #27): the link is confirmed (or its failure explained) beside the control
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const user = useReceiptUser();
  const unlinked = (loopNotes.data?.investigations ?? []).filter(n => n.eventId == null);
  const notes = linked.data?.investigations ?? [];
  return (
    <section className="cpm-episode-notes" data-testid="episode-notes">
      {notes.length > 0 ? (
        <ol className="cpm-loop-notes__list">
          {notes.map(n => (
            <li key={n.refId} className="cpm-loop-notes__item">
              <div className="cpm-loop-notes__meta">{n.createdBy ?? 'unknown'} · {fmtInstant(n.createdAt)} · {codeLabel(n.outcome)}</div>
              <p className="cpm-loop-notes__text">{n.note}</p>
            </li>
          ))}
        </ol>
      ) : <p className="cpm-metric-na">No loop note is linked to this episode.</p>}
      {unlinked.length > 0 && (
        <div className="cpm-filter-row cpm-events-link">
          <select className="cpm-select" aria-label="Link a loop note" value={pick} onChange={e => setPick(e.target.value)}>
            <option value="">Link a loop note…</option>
            {unlinked.map(n => <option key={n.refId} value={n.refId}>{stamp(n.createdAt)} · {n.note.slice(0, 60)}</option>)}
          </select>
          <ReasonedButton variant="normal" disabled={!canManage || !pick || link.isPending}
            reason={!canManage ? 'Needs the cpm.manage permission' : null}
            onClick={() => link.mutate({ refId: pick, eventId: event.id }, {
              onSuccess: () => { setPick(''); setReceipt(receiptDone(`Note linked to EVT-${event.id} ${byNow(user)}`)); },
              onError: err => setReceipt(receiptFailed('Linking the note', err)),
            })}>
            {link.isPending ? 'Linking…' : 'Link'}
          </ReasonedButton>
        </div>
      )}
      <ActionReceipt receipt={receipt} />
    </section>
  );
};

export default EpisodeNotes;
