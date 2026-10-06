/**
 * SME review #22 (CHG-058): the loop notes linked to this diagnosis episode, and linking one written before the
 * episode opened. Linking is a record, not an acknowledgement.
 */
import React, { useState } from 'react';
import type { CpmEventFrame } from '../../../api/cpmApi';
import { useEventNotes, useLinkLoopNote, useLoopNotes } from '../../../hooks/useLoopNotes';
import { useAuthStore } from '../../../store/authStore';
import { PanelHead } from '../shared';
import { ReasonedButton } from '../ReasonedButton';
import { fmtInstant } from '../context/LoopContextBar';
import { codeLabel } from '../vocabulary';

export const EpisodeNotes: React.FC<{ event: CpmEventFrame }> = ({ event }) => {
  const canManage = useAuthStore(s => s.hasPermission('cpm.manage'));
  const linked = useEventNotes(event.id);
  const loopNotes = useLoopNotes(event.loop_id);
  const link = useLinkLoopNote();
  const [pick, setPick] = useState('');
  const unlinked = (loopNotes.data?.investigations ?? []).filter(n => n.eventId == null);
  const notes = linked.data?.investigations ?? [];
  return (
    <section className="cpm-episode-notes" data-testid="episode-notes">
      <PanelHead eyebrow="Loop notes" title={`Notes on EVT-${event.id}`} />
      {notes.length === 0
        ? <p className="cpm-metric-na">{linked.isLoading ? 'Loading notes…' : 'No loop note is linked to this episode.'}</p>
        : (
          <ol className="cpm-loop-notes__list">
            {notes.map(n => (
              <li key={n.refId} className="cpm-loop-notes__item">
                <div className="cpm-loop-notes__meta">{n.createdBy ?? 'unknown'} · {fmtInstant(n.createdAt)} · {codeLabel(n.outcome)}</div>
                <p className="cpm-loop-notes__text">{n.note}</p>
              </li>
            ))}
          </ol>
        )}
      {unlinked.length > 0 && (
        <div className="cpm-filter-row">
          <label className="cpm-field cpm-field--compact">
            <span className="cpm-field__label">Link a loop note</span>
            <select className="cpm-select" value={pick} onChange={e => setPick(e.target.value)}>
              <option value="">— choose a note —</option>
              {unlinked.map(n => <option key={n.refId} value={n.refId}>{fmtInstant(n.createdAt)} · {n.note.slice(0, 60)}</option>)}
            </select>
          </label>
          <ReasonedButton variant="normal" disabled={!canManage || !pick || link.isPending}
            reason={!canManage ? 'Needs the cpm.manage permission' : null}
            onClick={() => link.mutate({ refId: pick, eventId: event.id }, { onSuccess: () => setPick('') })}>
            {link.isPending ? 'Linking…' : 'Link to this episode'}
          </ReasonedButton>
        </div>
      )}
    </section>
  );
};

export default EpisodeNotes;
