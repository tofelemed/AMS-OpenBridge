/**
 * SME review #22 (CHG-058): loop notes — always available, not only while an episode is open. A note belongs to
 * the loop; it can name the evaluated window it was written on (the window's decision evidence is pinned) and the
 * diagnosis episode it is about, now or later ("Link to episode…"). Acknowledging an open episode is a separate,
 * explicit choice (ISA-18.2: acknowledgement is a deliberate act) — the old box sent the note AS the
 * acknowledgement. Replaces the "Investigation note" card on Investigation and Evidence Replay.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import type { CpmEventFrame } from '../../../api/cpmApi';
import { MAX_NOTE_LENGTH, type LoopNote, type NoteOutcome } from '../../../api/cpm/investigations';
import { useAcknowledgeEvent, useCpmEvents } from '../../../hooks/useCpm';
import { useCreateLoopNote, useLinkLoopNote, useLoopNotes, useSetLoopNoteOutcome } from '../../../hooks/useLoopNotes';
import { useAuthStore } from '../../../store/authStore';
import { useEvidenceManifest } from '../evidence/useEvidence';
import { PanelHead, TonePill, type CpmTone } from '../shared';
import { ReasonedButton } from '../ReasonedButton';
import { diagnosisLabel } from '../vocabulary';
import { fmtInstant } from '../context/LoopContextBar';
import { eventsHref, evidenceHref } from '../cpaHref';

const OUTCOMES: Array<{ value: NoteOutcome; label: string; tone: CpmTone }> = [
  { value: 'INCONCLUSIVE', label: 'Inconclusive', tone: 'muted' },
  { value: 'WORK_COMPLETED', label: 'Work completed', tone: 'warn' },
  { value: 'PERFORMANCE_RESTORED', label: 'Performance restored', tone: 'good' },
];
const outcomeOf = (o: NoteOutcome) => OUTCOMES.find(x => x.value === o) ?? OUTCOMES[0];
const episodeLabel = (e: CpmEventFrame) => `EVT-${e.id} · ${diagnosisLabel(e.peak_diagnosis)} · ${fmtInstant(e.opened_at)}${e.closed_at ? '' : ' (open)'}`;

export const LoopNotes: React.FC<{
  loopId: string;
  /** The evaluated window on screen: its decision run (G15) and a short name. */
  window?: { methodRunId?: string | null; label: string } | null;
  /** The loop's open, unacknowledged episode, if any. */
  openFrame?: CpmEventFrame | null;
}> = ({ loopId, window, openFrame }) => {
  const canManage = useAuthStore(s => s.hasPermission('cpm.manage'));
  const notes = useLoopNotes(loopId);
  const episodes = useCpmEvents({ loopId, openOnly: false, limit: 20, sort: 'recent' }, 60_000, !!loopId);
  const manifest = useEvidenceManifest(window?.methodRunId ?? undefined);
  const create = useCreateLoopNote();
  const ack = useAcknowledgeEvent();
  const [text, setText] = useState('');
  const [outcome, setOutcome] = useState<NoteOutcome>('INCONCLUSIVE');
  const [attach, setAttach] = useState(true);
  const [alsoAck, setAlsoAck] = useState(false);

  const trimmed = text.trim();
  const reason = !canManage ? 'Needs the cpm.manage permission' : trimmed.length === 0 ? null : trimmed.length > MAX_NOTE_LENGTH ? `Keep the note under ${MAX_NOTE_LENGTH} characters` : null;
  const save = () => {
    const methodRunId = attach ? window?.methodRunId ?? null : null;
    create.mutate({
      loopId, note: trimmed, outcome, methodRunId,
      evidenceIds: attach && methodRunId ? (manifest.data?.artifacts ?? []).map(a => a.artifactId) : [],
      eventId: openFrame && alsoAck ? openFrame.id : null,
    }, {
      onSuccess: () => {
        if (openFrame && alsoAck) ack.mutate({ id: openFrame.id, note: `Acknowledged with a loop note: ${trimmed.slice(0, 200)}` });
        setText(''); setOutcome('INCONCLUSIVE'); setAlsoAck(false);
      },
    });
  };

  return (
    <section className="cpm-surface cpm-loop-notes" data-testid="loop-notes">
      <PanelHead eyebrow="Record it" title="Loop notes"
        right={<span className="cpm-copy">{notes.data ? `${notes.data.count} on ${loopId}` : ''}</span>} />
      <textarea className="cpm-textarea" rows={3} value={text} maxLength={MAX_NOTE_LENGTH + 1}
        placeholder="Observation, action taken, follow-up owner… (no episode needed)" aria-label="Loop note"
        onChange={e => setText(e.target.value)} />
      <div className="cpm-loop-notes__options">
        <label className="cpm-field cpm-field--compact">
          <span className="cpm-field__label">Outcome</span>
          <select className="cpm-select" value={outcome} onChange={e => setOutcome(e.target.value as NoteOutcome)}>
            {OUTCOMES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        {window?.methodRunId && (
          <label className="cpm-check">
            <input type="checkbox" checked={attach} onChange={e => setAttach(e.target.checked)} />
            Attach to this evaluated window ({window.label}) — its evidence is kept
          </label>
        )}
        {openFrame && (
          <label className="cpm-check">
            <input type="checkbox" checked={alsoAck} onChange={e => setAlsoAck(e.target.checked)} />
            Also acknowledge the open episode EVT-{openFrame.id} and link the note to it
          </label>
        )}
      </div>
      <div className="cpm-filter-row">
        <ReasonedButton variant="raised" disabled={!canManage || trimmed.length === 0 || !!reason || create.isPending} reason={reason} onClick={save}>
          {create.isPending ? 'Saving…' : 'Save note'}
        </ReasonedButton>
        {create.isSuccess && <TonePill tone="good">Saved</TonePill>}
        {create.isError && <span className="cpm-field__error" role="alert">{(create.error as Error)?.message ?? 'The note was not saved.'}</span>}
      </div>
      <p className="cpm-copy cpm-loop-notes__hint">
        A note stays on the loop. Saving it never acknowledges an episode unless you tick that box; link it to an episode now or later.
      </p>
      <NoteList notes={notes.data?.investigations ?? []} loading={notes.isLoading} episodes={episodes.data?.events ?? []} canManage={canManage} loopId={loopId} />
    </section>
  );
};

const NoteList: React.FC<{ notes: LoopNote[]; loading: boolean; episodes: CpmEventFrame[]; canManage: boolean; loopId: string }> = ({ notes, loading, episodes, canManage, loopId }) => {
  if (loading) return <p className="cpm-copy">Loading notes…</p>;
  if (notes.length === 0) return <p className="cpm-metric-na">No notes on this loop yet.</p>;
  return (
    <ol className="cpm-loop-notes__list">
      {notes.map(n => <NoteRow key={n.refId} n={n} episodes={episodes} canManage={canManage} loopId={loopId} />)}
    </ol>
  );
};

const NoteRow: React.FC<{ n: LoopNote; episodes: CpmEventFrame[]; canManage: boolean; loopId: string }> = ({ n, episodes, canManage, loopId }) => {
  const link = useLinkLoopNote();
  const setOutcome = useSetLoopNoteOutcome();
  const [pick, setPick] = useState('');
  const o = outcomeOf(n.outcome);
  const episode = episodes.find(e => e.id === n.eventId);
  return (
    <li className="cpm-loop-notes__item">
      <div className="cpm-loop-notes__meta">
        <TonePill tone={o.tone}>{o.label}</TonePill>
        <span>{n.createdBy ?? 'unknown'} · {fmtInstant(n.createdAt)}</span>
        {n.methodRunId && <Link className="cpm-link" to={evidenceHref(loopId)}>evaluated window ›</Link>}
        {n.eventId != null && <Link className="cpm-link" to={eventsHref({ loop: loopId, event: n.eventId })}>{episode ? episodeLabel(episode) : `EVT-${n.eventId}`} ›</Link>}
      </div>
      <p className="cpm-loop-notes__text">{n.note || <span className="cpm-metric-na">(no text)</span>}</p>
      {canManage && (
        <div className="cpm-loop-notes__actions">
          <label className="cpm-field cpm-field--compact">
            <span className="cpm-field__label">{n.eventId != null ? 'Linked episode' : 'Link to episode'}</span>
            <select className="cpm-select" value={pick || String(n.eventId ?? '')} disabled={link.isPending}
              onChange={e => { const v = e.target.value; setPick(v); link.mutate({ refId: n.refId, eventId: v ? Number(v) : null }); }}>
              <option value="">{n.eventId != null ? '— unlink —' : '— none —'}</option>
              {episodes.map(e => <option key={e.id} value={e.id}>{episodeLabel(e)}</option>)}
            </select>
          </label>
          <label className="cpm-field cpm-field--compact">
            <span className="cpm-field__label">Outcome</span>
            <select className="cpm-select" value={n.outcome} disabled={setOutcome.isPending}
              onChange={e => setOutcome.mutate({ refId: n.refId, outcome: e.target.value as NoteOutcome })}>
              {OUTCOMES.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
            </select>
          </label>
          {(link.isError || setOutcome.isError) && <span className="cpm-field__error" role="alert">{((link.error ?? setOutcome.error) as Error)?.message}</span>}
        </div>
      )}
    </li>
  );
};

export default LoopNotes;
