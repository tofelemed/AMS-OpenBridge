'use client';

/**
 * Loop Events › the selected episode. What happened, the two states (condition /
 * availability), the provenance, and the operator state as two independent facts
 * (CHG-032): the acknowledgement and the shelf, each with who / when / why. Actions:
 * acknowledge, shelve or update the shelf, unshelve, and the history — the three
 * panels are lazy and fetch nothing until opened. The loop id is a route to the hub.
 */
import React, { Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmEventFrame, CpmShelvePolicy } from '../../../api/cpmApi';
import { useAcknowledgeEvent, useShelveEvent, useUnshelveEvent } from '../../../hooks/useCpm';
import { EmptyState, KvRow, PanelHead, TonePill, diagnosisBand, fmtDateTime, toneFor } from '../shared';
import { explorerHref, historicalHref } from '../cpaHref';
import { availabilityCopy, availabilityPill, conditionOf, supportCopy } from './eventsState';
import { isAcknowledged, shelfCountdown, shelfState, stateView } from './shelfState';
import { codeLabel, diagnosisLabel, phrase } from '../vocabulary';
import { EVIDENCE_SCORE_HELP, evidenceScore, evidenceScoreText } from '../evidenceScore';
import { ReasonedButton } from '../ReasonedButton';
import { EpisodeNotes } from './EpisodeNotes';

const ShelvePanel = React.lazy(() => import('./ShelvePanel'));
const UnshelvePanel = React.lazy(() => import('./UnshelvePanel'));
const EventHistory = React.lazy(() => import('./EventHistory'));

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

const fmt = (iso: string | null) => (iso ? fmtDateTime(iso) : '—');

type Panel = 'none' | 'shelve' | 'unshelve';

export interface EventDetailProps {
  event: CpmEventFrame;
  canManage: boolean;
  /** From the events read; absent on an API that predates CHG-032. */
  policy?: CpmShelvePolicy;
}

export const EventDetail: React.FC<EventDetailProps> = ({ event, canManage, policy }) => {
  const navigate = useNavigate();
  const ack = useAcknowledgeEvent();
  const shelve = useShelveEvent();
  const unshelve = useUnshelveEvent();
  const [panel, setPanel] = useState<Panel>('none');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [note, setNote] = useState('');
  const now = Date.now();
  const sev = severityOf(event);
  const cur = currentOf(event);
  const open = conditionOf(event) === 'OPEN';
  const availability = availabilityPill(event);
  const shelf = shelfState(event, now);
  const acked = isAcknowledged(event);
  const state = stateView(event, now);
  const maxHours = policy?.maxHours ?? DEFAULT_MAX_HOURS;
  const needs = !canManage ? 'Needs the cpm.manage permission' : null;

  const ackTitle = needs ?? (acked ? 'Already acknowledged'
    : shelf === 'ACTIVE' ? 'Record the review; the shelf stays until it expires or is unshelved'
      : shelf === 'EXPIRED' ? 'Record the review; this also clears the returned-from-shelf flag'
        : 'Record that this finding has been reviewed');
  const shelveTitle = needs ?? (!open ? 'A closed episode cannot be shelved'
    : shelf === 'ACTIVE' ? 'Change the expiry or reason of the current shelf' : `Shelve until a stated expiry (site limit ${maxHours} h)`);
  const unshelveTitle = needs ?? (shelf === 'ACTIVE' ? 'End the shelf now' : shelf === 'EXPIRED' ? 'Clear the returned-from-shelf flag' : 'The episode is not shelved');
  const toggle = (p: Panel) => setPanel(cur => (cur === p ? 'none' : p));

  return (
    <aside className="cpm-surface">
      <PanelHead
        eyebrow={`EVT-${event.id}`}
        title={`Peak: ${diagnosisLabel(event.peak_diagnosis)}`}
        right={<span className="cpm-filter-row"><TonePill tone={sev.tone}>{sev.label}</TonePill>
          {cur && <TonePill tone={cur.tone}>{cur.label}</TonePill>}<TonePill tone={state.tone}>{state.label}</TonePill></span>}
      />
      <p className="cpm-copy cpm-source-line">
        <ObcButton variant="flat" title={`Open ${event.loop_id} in the Loop Explorer`}
          onClick={() => navigate(explorerHref(event.loop_id, { tab: 'Summary' }))}>
          {event.loop_id} ›
        </ObcButton>
        {/* CHG-097 (SME review 2 #26): the finding opens the period it covers, not only the loop */}
        <ObcButton variant="flat" title="PV, SP, OP and mode over this episode in Historical, with the peak window shaded"
          onClick={() => navigate(historicalHref(event.loop_id, {
            from: event.opened_at, to: event.closed_at ?? new Date().toISOString(),
            kind: event.window_kind, focus: `episode EVT-${event.id}`,
          }))}>
          Episode period ›
        </ObcButton>
        opened {fmt(event.opened_at)}
        {event.closed_at ? ` · closed ${fmt(event.closed_at)}` : ' · still open'}
      </p>

      <PanelHead eyebrow="What happened" title="Episode" />
      <p className="cpm-copy">
        The {phrase(event.family)} family was reported across{' '}
        {supportCopy(event)}, peaking at{' '}
        {evidenceScoreText(event.peak_confidence)}
        {event.last_diagnosis && event.last_diagnosis !== event.peak_diagnosis
          ? `; the latest window reports ${diagnosisLabel(event.last_diagnosis).toLowerCase()}.`
          : '.'}
      </p>
      {/* v2.5 (1F.2, R10): condition and availability are separate facts. */}
      <KvRow label="Condition">
        <TonePill tone={open ? 'warn' : 'muted'}>{open ? 'OPEN' : 'CLOSED'}</TonePill>
        {event.close_reason && <> {phrase(event.close_reason)}</>}
      </KvRow>
      <KvRow label="Availability">
        {availability ? <TonePill tone={availability.tone}>{availability.label}</TonePill> : <TonePill tone="good">Observed</TonePill>}
      </KvRow>
      <p className="cpm-copy">{availabilityCopy(event)}</p>

      <PanelHead eyebrow="Evidence" title="Provenance" />
      <KvRow label="Fault family"><span title={event.family}>{codeLabel(event.family)}</span></KvRow>
      <KvRow label="Peak evidence score"><span title={EVIDENCE_SCORE_HELP}>{evidenceScore(event.peak_confidence)}</span></KvRow>
      <KvRow label="Resolution">{event.window_kind}</KvRow>
      <KvRow label="Calculation version">{event.calculation_version ?? '—'}</KvRow>
      <KvRow label="Dynamics profile">{event.dynamics_profile_version ?? '—'}</KvRow>

      {/* CHG-032: review and suppression are independent facts, each with its own record. */}
      <PanelHead eyebrow="Operator state" title="Review and shelf" />
      <KvRow label="Acknowledgement">
        {acked
          ? <><TonePill tone="good">Acknowledged</TonePill> {event.acked_by ?? 'unknown'} · {fmt(event.acked_at)}</>
          : <TonePill tone="warn">Not yet reviewed</TonePill>}
      </KvRow>
      {event.note && <KvRow label="Review note">{event.note}</KvRow>}
      <KvRow label="Shelf">
        {shelf === 'ACTIVE' && <><TonePill tone="muted">Shelved</TonePill> by {event.shelved_by ?? event.acked_by ?? 'unknown'} · until {fmt(event.shelve_until)} · {shelfCountdown(event.shelve_until, now)}</>}
        {shelf === 'EXPIRED' && <><TonePill tone="warn">Returned</TonePill> shelf by {event.shelved_by ?? event.acked_by ?? 'unknown'} {shelfCountdown(event.shelve_until, now)}</>}
        {!shelf && <span className="cpm-event-row__sub">Not shelved</span>}
      </KvRow>
      {shelf && (event.shelve_reason ?? event.note) && <KvRow label="Shelf reason">{event.shelve_reason ?? event.note}</KvRow>}

      {panel === 'none' && !acked && (
        <label className="cpm-field" style={{ marginTop: 12, minWidth: 0 }}>
          <span className="cpm-field__label">Review note (optional)</span>
          <input className="cpm-input" value={note} onChange={e => setNote(e.target.value)}
            placeholder="Why this was acknowledged" />
        </label>
      )}
      <div className="cpm-inspector__actions">
        {/* SME #21 (CHG-057): the reason an action is unavailable is on screen, not only in the hover title */}
        <ReasonedButton variant="raised" disabled={!canManage || ack.isPending || acked} title={ackTitle} reason={ack.isPending ? null : ackTitle}
          onClick={() => ack.mutate({ id: event.id, note: note || undefined }, { onSuccess: () => setNote('') })}>
          {ack.isPending ? 'Acknowledging…' : 'Acknowledge'}
        </ReasonedButton>
        <ReasonedButton variant="normal" disabled={!canManage || !open || shelve.isPending} title={shelveTitle} reason={shelve.isPending ? null : shelveTitle}
          ariaPressed={panel === 'shelve'} onClick={() => toggle('shelve')}>
          {shelf === 'ACTIVE' ? 'Update shelf…' : 'Shelve…'}
        </ReasonedButton>
        <ReasonedButton variant="normal" disabled={!canManage || !shelf || unshelve.isPending} title={unshelveTitle} reason={unshelve.isPending ? null : unshelveTitle}
          ariaPressed={panel === 'unshelve'} onClick={() => toggle('unshelve')}>
          Unshelve…
        </ReasonedButton>
        <ObcButton variant="flat" aria-pressed={historyOpen} title="Every acknowledge, shelve, unshelve and expiry on this episode"
          onClick={() => setHistoryOpen(h => !h)}>
          History ›
        </ObcButton>
      </div>
      {panel === 'shelve' && (
        <Suspense fallback={<EmptyState title="Loading…" />}>
          <ShelvePanel event={event} canManage={canManage} pending={shelve.isPending} error={shelve.error} maxHours={maxHours}
            onShelve={(until, reason) => shelve.mutate({ id: event.id, until, reason }, { onSuccess: () => setPanel('none') })}
            onClose={() => setPanel('none')} />
        </Suspense>
      )}
      {panel === 'unshelve' && (
        <Suspense fallback={<EmptyState title="Loading…" />}>
          <UnshelvePanel event={event} canManage={canManage} pending={unshelve.isPending} error={unshelve.error}
            onUnshelve={reason => unshelve.mutate({ id: event.id, reason }, { onSuccess: () => setPanel('none') })}
            onClose={() => setPanel('none')} />
        </Suspense>
      )}
      {historyOpen && (
        <Suspense fallback={<EmptyState title="Loading history…" />}>
          <EventHistory eventId={event.id} />
        </Suspense>
      )}
      <EpisodeNotes event={event} />
      {!open && !acked && (
        <p className="cpm-copy" style={{ marginTop: 8 }}>
          This episode has closed but was never acknowledged — a closed, unacknowledged
          episode is an unreviewed finding, not a resolved one. It can still be
          acknowledged; shelving no longer applies.
        </p>
      )}
      {ack.isError && (
        <p className="cpm-field__error" role="alert">
          {(ack.error as Error)?.message ?? 'The action failed.'}
        </p>
      )}
    </aside>
  );
};

export default EventDetail;
