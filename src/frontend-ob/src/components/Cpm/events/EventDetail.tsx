'use client';

/**
 * Loop Events › the selected episode. CHG-167 (owner review, the approved sample docs/theme/redesign/samples/loop-events-
 * proposal.html and the owner's answers of 11 Nov): the heading is the peak diagnosis with its severity; the facts (Latest only
 * when it differs, Condition, Review, Shelf, Period); the evidence strip as before; Record details (a dialog, it replaced
 * Technical details) · Historical ↗ · Loop ↗, named after what they open; the note and the actions (EpisodeActions); Activity &
 * notes, the one place for who, when and why. The foot names the episode once ("PIC40102 · EVT-2231 · 24h") beside
 * Investigation → (it was "Review PIC40102 →" under the peak). Below 1280 px the panel is a drawer a row opens.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmEventFrame, CpmShelvePolicy } from '../../../api/cpmApi';
import type { CpmEpisode } from '../../../api/cpm/eventPage';
import { useEventActions } from '../../../hooks/useCpm';
import { Inspector } from '../../../ui/Inspector';
import { TonePill, diagnosisBand, toneFor } from '../shared';
import { explorerHref, historicalHref, investigationHref } from '../cpaHref';
import { supportText } from './eventsState';
import { severityWord } from './shelfState';
import { diagnosisLabel } from '../vocabulary';
import { EVIDENCE_SCORE_HELP, evidenceScore } from '../evidenceScore';
import type { Receipt } from '../ActionReceipt';
import { EpisodeActivity } from './EpisodeActivity';
import { EpisodeActions } from './EpisodeActions';
import { EpisodeFacts } from './EpisodeFacts';
import { EventRecordDialog } from './EventRecordDialog';

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

export interface EventDetailProps {
  event: CpmEpisode;
  canManage: boolean;
  /** From the events read; absent on an API that predates CHG-032. */
  policy?: CpmShelvePolicy;
  /** CHG-098 (SME review 2 #27): the last action's receipt, held by the page (see EpisodeActions). */
  receipt?: Receipt | null;
  onReceipt?: (r: Receipt) => void;
  /** Below 1280 px the panel is a drawer that shows only while open. */
  open?: boolean;
  onClose?: () => void;
}

export const EventDetail: React.FC<EventDetailProps> = ({ event, canManage, policy, receipt, onReceipt, open = true, onClose = () => undefined }) => {
  const navigate = useNavigate();
  const [record, setRecord] = useState(false);
  // the same query Activity & notes reads, so this costs no extra request
  const history = useEventActions(event.id, true);
  const sev = severityWord(event);
  return (
    <>
      <Inspector title={diagnosisLabel(event.peak_diagnosis)} open={open} onClose={onClose}
        meta={<TonePill tone={sev.tone}>{sev.label}</TonePill>}
        primaryAction={
          <div className="cpm-events-foot">
            <span className="cpm-events-foot__id"><strong>{event.loop_id}</strong> · EVT-{event.id} · {event.window_kind}</span>
            <ObcButton variant="raised" title="Open Investigation at the window this episode opened on"
              onClick={() => navigate(investigationHref(event.loop_id, { kind: event.window_kind, window: event.opened_at }))}>
              Investigation {'→'}
            </ObcButton>
          </div>
        }>
        <EpisodeFacts event={event} now={Date.now()} history={history} />
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
        <div className="cpm-events-links">
          <ObcButton variant="flat" onClick={() => setRecord(true)}>Record details</ObcButton>
          {/* CHG-097 (SME review 2 #26): the finding opens the period it covers, not only the loop */}
          <ObcButton variant="flat" title="PV, SP, OP and mode over this episode in Historical, with the peak window shaded"
            onClick={() => navigate(historicalHref(event.loop_id, {
              from: event.opened_at, to: event.closed_at ?? new Date().toISOString(),
              kind: event.window_kind, focus: `episode EVT-${event.id}`,
            }))}>
            Historical {'↗'}
          </ObcButton>
          <ObcButton variant="flat" title={`Open ${event.loop_id} in the Loop Explorer`}
            onClick={() => navigate(explorerHref(event.loop_id, { tab: 'Summary' }))}>
            Loop {'↗'}
          </ObcButton>
        </div>
        <EpisodeActions event={event} canManage={canManage} policy={policy} receipt={receipt} onReceipt={onReceipt} />
        <EpisodeActivity event={event} />
      </Inspector>
      <EventRecordDialog event={event} open={record} onClose={() => setRecord(false)} />
    </>
  );
};

export default EventDetail;
