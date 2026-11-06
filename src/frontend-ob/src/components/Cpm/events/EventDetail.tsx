'use client';

/**
 * Loop Events › the selected episode (CHG-136, as the reference reads it): "EVT-n · Episode details", the tag,
 * the severity, the peak, Review at the episode's opening window, then Condition / Availability / Review / Shelf,
 * one strip of evidence, the period, the actions and the activity timeline. The acknowledgement and the shelf stay
 * two independent facts (CHG-032), each with who / when / why. The shelve and unshelve panels are lazy.
 */
import React, { Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmEventFrame, CpmShelvePolicy } from '../../../api/cpmApi';
import type { CpmEpisode } from '../../../api/cpm/eventPage';
import { useAcknowledgeEvent, useShelveEvent, useUnshelveEvent } from '../../../hooks/useCpm';
import { useCreateLoopNote } from '../../../hooks/useLoopNotes';
import { TechnicalDetails } from '../../../ui/TechnicalDetails';
import { Toggletip } from '../../../ui/Toggletip';
import { EmptyState, KvRow, PanelHead, TonePill, diagnosisBand, toneFor } from '../shared';
import { fmtWhen } from '../blocks/whenText';
import { explorerHref, historicalHref, investigationHref } from '../cpaHref';
import { availabilityCopy, availabilityPill, conditionOf, supportText } from './eventsState';
import { isAcknowledged, severityWord, shelfCountdown, shelfState } from './shelfState';
import { diagnosisLabel, phrase } from '../vocabulary';
import { EVIDENCE_SCORE_HELP, evidenceScore } from '../evidenceScore';
import { ReasonedButton } from '../ReasonedButton';
import { EpisodeActivity } from './EpisodeActivity';
import { ActionReceipt, byNow, receiptDone, receiptFailed, useReceiptUser, type Receipt } from '../ActionReceipt';

const ShelvePanel = React.lazy(() => import('./ShelvePanel'));
const UnshelvePanel = React.lazy(() => import('./UnshelvePanel'));

const DEFAULT_MAX_HOURS = 168;

/**
 * The episode's peak, in the engine's own bands (CHG-092, SME review 2 #6/#20): the engine's severity when it wrote one,
 * otherwise the band of the peak diagnosis — never a second set of score thresholds of our own.
 */
export function severityOf(e: CpmEventFrame): { label: string; tone: 'good' | 'warn' | 'bad' | 'muted' } {
  if (e.severity) return { label: e.severity, tone: toneFor(e.severity) };
  const b = diagnosisBand(e.peak_diagnosis);
  return { label: `Peak: ${b.label}`, tone: b.tone === 'good' ? 'muted' : b.tone };
}

/** The window the episode now stands at, when it differs from the peak the title names (null when they match). */
export function currentOf(e: CpmEventFrame): { label: string; tone: 'good' | 'warn' | 'bad' | 'muted' } | null {
  if (!e.last_diagnosis || e.last_diagnosis === e.peak_diagnosis) return null;
  const b = diagnosisBand(e.last_diagnosis);
  return { label: `Now: ${diagnosisLabel(e.last_diagnosis)}`, tone: b.tone === 'good' ? 'muted' : b.tone };
}

const when = (iso: string | null) => fmtWhen(iso);

type Panel = 'none' | 'shelve' | 'unshelve';

export interface EventDetailProps {
  event: CpmEpisode;
  canManage: boolean;
  /** From the events read; absent on an API that predates CHG-032. */
  policy?: CpmShelvePolicy;
  /**
   * CHG-098 (SME review 2 #27): the last action's receipt for this episode. Held by the page so it survives the
   * detail remounting when the action moves the episode off the current tab; kept locally when no owner is given.
   */
  receipt?: Receipt | null;
  onReceipt?: (r: Receipt) => void;
}

export const EventDetail: React.FC<EventDetailProps> = ({ event, canManage, policy, receipt: ownedReceipt, onReceipt }) => {
  const navigate = useNavigate();
  const user = useReceiptUser();
  const [localReceipt, setLocalReceipt] = useState<Receipt | null>(null);
  const receipt = onReceipt ? ownedReceipt ?? null : localReceipt;
  const report = onReceipt ?? setLocalReceipt;
  const ack = useAcknowledgeEvent();
  const shelve = useShelveEvent();
  const unshelve = useUnshelveEvent();
  const saveNote = useCreateLoopNote();
  const [panel, setPanel] = useState<Panel>('none');
  const [note, setNote] = useState('');
  const now = Date.now();
  const sev = severityWord(event);
  const latest = currentOf(event);
  const open = conditionOf(event) === 'OPEN';
  const availability = availabilityPill(event);
  const shelf = shelfState(event, now);
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
  const toggle = (p: Panel) => setPanel(cur => (cur === p ? 'none' : p));

  return (
    <aside className="cpm-surface cpm-panel-enter" aria-label={`Episode EVT-${event.id}`}>
      <PanelHead title={`EVT-${event.id} · Episode details`} />
      <p className="cpm-copy cpm-source-line">
        <ObcButton variant="flat" title={`Open ${event.loop_id} in the Loop Explorer`}
          onClick={() => navigate(explorerHref(event.loop_id, { tab: 'Summary' }))}>
          {event.loop_id} ↗
        </ObcButton>
        <TonePill tone={sev.tone}>{sev.label}</TonePill>
      </p>
      <p className="cpm-copy">Peak · {diagnosisLabel(event.peak_diagnosis)}</p>
      {latest && <p className="cpm-copy">Latest · {diagnosisLabel(event.last_diagnosis)}</p>}
      <div className="cpm-episode-review">
        <ObcButton variant="raised" title="Open Investigation at the window this episode opened on"
          onClick={() => navigate(investigationHref(event.loop_id, { kind: event.window_kind, window: event.opened_at }))}>
          {`Review ${event.loop_id} →`}
        </ObcButton>
      </div>

      {/* v2.5 (1F.2, R10): condition and availability are separate facts. */}
      <KvRow label="Condition">
        <TonePill tone={open ? 'warn' : 'muted'}>{open ? 'OPEN' : 'CLOSED'}</TonePill>
        {event.close_reason && <> {phrase(event.close_reason)}</>}
      </KvRow>
      <KvRow label="Availability">
        {availability ? <TonePill tone={availability.tone}>{availability.label}</TonePill> : <TonePill tone="good">Observed</TonePill>}
        <Toggletip variant="how-to" label="About availability"><p>{availabilityCopy(event)}</p></Toggletip>
      </KvRow>
      {/* CHG-032: review and suppression are independent facts, each with its own record. */}
      <KvRow label="Review">
        {acked
          ? <><TonePill tone="good">Acknowledged</TonePill> {event.acked_by ?? 'unknown'} · {when(event.acked_at)}</>
          : <TonePill tone="warn">Not yet reviewed</TonePill>}
        {!open && !acked && (
          <Toggletip variant="how-to" label="About an unreviewed closed episode">
            <p>This episode has closed but was never acknowledged — a closed, unacknowledged episode is an unreviewed finding, not a resolved one. It can still be acknowledged; shelving no longer applies.</p>
          </Toggletip>
        )}
      </KvRow>
      {event.note && <KvRow label="Review note">{event.note}</KvRow>}
      <KvRow label="Shelf">
        {shelf === 'ACTIVE' && <><TonePill tone="muted">Shelved</TonePill> by {event.shelved_by ?? event.acked_by ?? 'unknown'} · until {when(event.shelve_until)} · {shelfCountdown(event.shelve_until, now)}</>}
        {shelf === 'EXPIRED' && <><TonePill tone="warn">Returned</TonePill> shelf by {event.shelved_by ?? event.acked_by ?? 'unknown'} {shelfCountdown(event.shelve_until, now)}</>}
        {!shelf && <span className="cpm-event-row__sub">Not shelved</span>}
      </KvRow>
      {shelf && (event.shelve_reason ?? event.note) && <KvRow label="Shelf reason">{event.shelve_reason ?? event.note}</KvRow>}

      <div className="cpm-episode-strip" role="group" aria-label="Evidence of this episode">
        <span className="cpm-episode-strip__item" title={EVIDENCE_SCORE_HELP}>
          <span className="cpm-episode-strip__value">{evidenceScore(event.peak_confidence) ?? '—'}</span>
          <span className="cpm-kv__label">Peak evidence</span>
        </span>
        <span className="cpm-episode-strip__item">
          <span className="cpm-episode-strip__value">{supportText(event.qualified_support_ms)}</span>
          <span className="cpm-kv__label">Qualified support</span>
        </span>
        <span className="cpm-episode-strip__item">
          <span className="cpm-episode-strip__value">{event.window_count}</span>
          <span className="cpm-kv__label">Non-overlap windows</span>
        </span>
      </div>
      <p className="cpm-copy cpm-source-line">
        {/* CHG-097 (SME review 2 #26): the finding opens the period it covers, not only the loop */}
        <span>Opened {when(event.opened_at)}{event.closed_at ? ` · closed ${when(event.closed_at)}` : ' · still open'}</span>
        <ObcButton variant="flat" title="PV, SP, OP and mode over this episode in Historical, with the peak window shaded"
          onClick={() => navigate(historicalHref(event.loop_id, {
            from: event.opened_at, to: event.closed_at ?? new Date().toISOString(),
            kind: event.window_kind, focus: `episode EVT-${event.id}`,
          }))}>
          Episode period ↗
        </ObcButton>
      </p>

      {panel === 'none' && (
        <label className="cpm-field" style={{ marginTop: 12, minWidth: 0 }}>
          <span className="cpm-field__label">Note</span>
          <input className="cpm-input" value={note} onChange={e => setNote(e.target.value)} placeholder="Optional" />
        </label>
      )}
      <div className="cpm-inspector__actions">
        {/* SME #21 (CHG-057): the reason an action is unavailable is on screen, not only in the hover title */}
        <ReasonedButton variant="raised" disabled={!canManage || ack.isPending || acked} title={ackTitle} reason={ack.isPending ? null : ackTitle}
          onClick={() => ack.mutate({ id: event.id, note: note || undefined }, {
            onSuccess: () => { setNote(''); report(receiptDone(`Acknowledged ${byNow(user)}`, event.id)); },
            onError: err => report(receiptFailed('Acknowledge', err, event.id)),
          })}>
          {ack.isPending ? 'Acknowledging…' : 'Acknowledge'}
        </ReasonedButton>
        <ReasonedButton variant="normal" disabled={!canManage || !open || shelve.isPending} title={shelveTitle} reason={shelve.isPending ? null : shelveTitle}
          ariaPressed={panel === 'shelve'} onClick={() => toggle('shelve')}>
          {shelf === 'ACTIVE' ? 'Update shelf…' : 'Shelve…'}
        </ReasonedButton>
        {shelf && (
          <ReasonedButton variant="normal" disabled={!canManage || unshelve.isPending} title={unshelveTitle} reason={unshelve.isPending ? null : unshelveTitle}
            ariaPressed={panel === 'unshelve'} onClick={() => toggle('unshelve')}>
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
      {/* CHG-098 (SME review 2 #27): what the last action recorded (or why it failed) stays beside the actions until
          the next one. Shelve / unshelve refusals stay inside their open panel, where the inputs to correct are. */}
      <ActionReceipt receipt={receipt} />
      {panel === 'shelve' && (
        <Suspense fallback={<EmptyState title="Loading…" />}>
          <ShelvePanel event={event} canManage={canManage} pending={shelve.isPending} error={shelve.error} maxHours={maxHours}
            onShelve={(until, reason) => shelve.mutate({ id: event.id, until, reason }, {
              onSuccess: r => {
                setPanel('none');
                report(receiptDone(`${r.updated ? 'Shelf updated' : 'Shelved'} until ${when(r.shelveUntil ?? until)} — ${byNow(user)}`, event.id));
              },
            })}
            onClose={() => setPanel('none')} />
        </Suspense>
      )}
      {panel === 'unshelve' && (
        <Suspense fallback={<EmptyState title="Loading…" />}>
          <UnshelvePanel event={event} canManage={canManage} pending={unshelve.isPending} error={unshelve.error}
            onUnshelve={reason => unshelve.mutate({ id: event.id, reason }, {
              onSuccess: r => {
                setPanel('none');
                const lands = r.ackState === 'ACKNOWLEDGED' ? 'it stays acknowledged' : 'it is back in the Unacknowledged queue';
                report(receiptDone(`Unshelved ${byNow(user)} — ${lands}`, event.id));
              },
            })}
            onClose={() => setPanel('none')} />
        </Suspense>
      )}
      <EpisodeActivity event={event} />
      <TechnicalDetails items={[
        { label: 'Fault family', value: event.family },
        { label: 'Resolution', value: event.window_kind },
        { label: 'Calculation version', value: event.calculation_version },
        { label: 'Dynamics profile', value: event.dynamics_profile_version },
        { label: 'Support until', value: event.support_until },
      ]} />
    </aside>
  );
};

export default EventDetail;
