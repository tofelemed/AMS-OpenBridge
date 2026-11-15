/**
 * CHG-189 (owner review item 12): the loop's notes as tidy cards, newest first, each with its outcome as a badge, its author
 * and time (as they printed before), its text, and its links (the window it was written on, the episode it is about). An
 * existing note's episode and outcome change through its Edit action: the card opens two fields with Cancel and Save, and
 * only what changed is sent (the same PATCH calls as before). No select is open when nothing is being edited.
 * CHG-192 (owner review item 16): the card's Save is secondary, so the dialog's one primary stays "Save note" in its footer.
 */
import React, { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmEventFrame } from '../../../api/cpmApi';
import type { LoopNote, NoteOutcome } from '../../../api/cpm/investigations';
import { useLinkLoopNote, useSetLoopNoteOutcome } from '../../../hooks/useLoopNotes';
import { TonePill } from '../shared';
import { fmtInstant } from '../context/LoopContextBar';
import { eventsHref } from '../cpaHref';
import { workbenchHref } from '../evidence/selection';
import { OUTCOMES, episodeLabel, noteCount, outcomeOf } from './noteText';

const NoteEdit: React.FC<{ n: LoopNote; episodes: CpmEventFrame[]; onDone: () => void }> = ({ n, episodes, onDone }) => {
  const id = useId();
  const link = useLinkLoopNote();
  const setOutcome = useSetLoopNoteOutcome();
  const [eventId, setEventId] = useState(n.eventId == null ? '' : String(n.eventId));
  const [outcome, setOutcomeValue] = useState<NoteOutcome>(n.outcome);
  const busy = link.isPending || setOutcome.isPending;
  // a note linked to an episode older than the recent list still names it
  const unlisted = n.eventId != null && !episodes.some(e => e.id === n.eventId);
  const failure = (link.error ?? setOutcome.error) as Error | null;

  const save = async () => {
    const next = eventId ? Number(eventId) : null;
    try {
      await Promise.all([
        next !== n.eventId ? link.mutateAsync({ refId: n.refId, eventId: next }) : null,
        outcome !== n.outcome ? setOutcome.mutateAsync({ refId: n.refId, outcome }) : null,
      ]);
      onDone();
    } catch { /* the failed call says why, below */ }
  };

  return (
    <div className="cpm-note-card__editor">
      <div className="cpm-run-form">
        <label className="cpm-run-form__label" htmlFor={`${id}-episode`}>Episode</label>
        <div className="cpm-run-form__value">
          <select id={`${id}-episode`} className="cpm-select" value={eventId} disabled={busy} onChange={e => setEventId(e.target.value)}>
            <option value="">No episode</option>
            {episodes.map(e => <option key={e.id} value={e.id}>{episodeLabel(e)}</option>)}
            {unlisted && <option value={String(n.eventId)}>EVT-{n.eventId}</option>}
          </select>
        </div>
        <label className="cpm-run-form__label" htmlFor={`${id}-outcome`}>Outcome</label>
        <div className="cpm-run-form__value">
          <select id={`${id}-outcome`} className="cpm-select" value={outcome} disabled={busy} onChange={e => setOutcomeValue(e.target.value as NoteOutcome)}>
            {OUTCOMES.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
        </div>
      </div>
      <div className="cpm-note-card__actions">
        {failure && <span className="cpm-field__error" role="alert">{failure.message || 'The change was not saved.'}</span>}
        <ObcButton variant="normal" disabled={busy} onClick={onDone}>Cancel</ObcButton>
        <ObcButton variant="normal" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</ObcButton>
      </div>
    </div>
  );
};

const NoteCard: React.FC<{ n: LoopNote; episodes: CpmEventFrame[]; canManage: boolean; loopId: string }> = ({ n, episodes, canManage, loopId }) => {
  const [editing, setEditing] = useState(false);
  const o = outcomeOf(n.outcome);
  const episode = episodes.find(e => e.id === n.eventId);
  return (
    <li className="cpm-note-card">
      <div className="cpm-note-card__head">
        <TonePill tone={o.tone}>{o.label}</TonePill>
        <span className="cpm-note-card__by">{n.createdBy ?? 'unknown'} · {fmtInstant(n.createdAt)}</span>
        {canManage && !editing && <ObcButton variant="normal" onClick={() => setEditing(true)}>Edit</ObcButton>}
      </div>
      <p className="cpm-note-card__text">{n.note || <span className="cpm-metric-na">(no text)</span>}</p>
      {(n.methodRunId || n.eventId != null) && (
        <div className="cpm-note-card__links">
          {n.methodRunId && <Link className="cpm-link" to={workbenchHref(loopId, n.methodRunId, 'G15')}>evaluated window ↗</Link>}
          {n.eventId != null && <Link className="cpm-link" to={eventsHref({ loop: loopId, event: n.eventId, filter: 'all' })}>{episode ? episodeLabel(episode) : `EVT-${n.eventId}`} ↗</Link>}
        </div>
      )}
      {editing && <NoteEdit n={n} episodes={episodes} onDone={() => setEditing(false)} />}
    </li>
  );
};

export const NoteList: React.FC<{
  notes: LoopNote[]; loading: boolean; error: unknown; episodes: CpmEventFrame[]; canManage: boolean; loopId: string;
}> = ({ notes, loading, error, episodes, canManage, loopId }) => {
  if (loading) return <p className="cpm-copy">Loading notes…</p>;
  if (error) return <p className="cpm-field__error" role="alert">The notes could not be loaded: {error instanceof Error ? error.message : 'the service did not respond'}.</p>;
  // CHG-193 (sweep D8): set apart from the form above it, as the list of notes is
  if (notes.length === 0) return <p className="cpm-metric-na cpm-notes__empty">No notes on this loop yet.</p>;
  const newest = [...notes].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return (
    <section className="cpm-notes" aria-label="Notes on this loop">
      <h3 className="cpm-notes__count">{noteCount(notes.length)}</h3>
      <ol className="cpm-notes__list">
        {newest.map(n => <NoteCard key={n.refId} n={n} episodes={episodes} canManage={canManage} loopId={loopId} />)}
      </ol>
    </section>
  );
};

export default NoteList;
