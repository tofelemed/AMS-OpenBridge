/**
 * CHG-167 (owner review, the approved sample): the selected episode's facts, each once. Latest (only when it differs from the
 * peak the heading names), Condition (condition and availability merged, in the words of the list's line), Review (the
 * acknowledgement; the shelf has its own row), Shelf (its state, until when and how long), Period. Who acted, when and why is
 * in Activity & notes; an episode with no action record of that kind (written before CHG-032) keeps it on the row instead.
 */
import React from 'react';
import type { CpmEventAction } from '../../../api/cpmApi';
import type { CpmEpisode } from '../../../api/cpm/eventPage';
import { Toggletip } from '../../../ui/Toggletip';
import { KvRow, TonePill } from '../shared';
import { diagnosisLabel } from '../vocabulary';
import { conditionOf, conditionView, legacyAvailability } from './eventsState';
import { isAcknowledged, reviewWord, shelfCountdown, shelfState } from './shelfState';
import { stamp } from './eventTime';

/** The episode's operator history as the panel reads it (the `GET /events/{id}/actions` query). */
export interface EpisodeHistory { isLoading: boolean; data?: { actions: CpmEventAction[] } }

const Sub: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="cpm-event-row__sub cpm-episodes__line">{children}</span>
);

export const EpisodeFacts: React.FC<{ event: CpmEpisode; now: number; history: EpisodeHistory }> = ({ event, now, history }) => {
  // While the history loads nothing is moved; a failed or empty read keeps the old rows, so no record is ever hidden.
  const recorded = (...kinds: CpmEventAction['action'][]) =>
    history.isLoading || (history.data?.actions ?? []).some(a => kinds.includes(a.action));
  const ackOnRow = !recorded('ACKNOWLEDGED');
  const shelfOnRow = !recorded('SHELVED', 'SHELVE_UPDATED');
  const condition = conditionView(event);
  const legacy = legacyAvailability(event);
  const review = reviewWord(event);
  const acked = isAcknowledged(event);
  const open = conditionOf(event) === 'OPEN';
  const shelf = shelfState(event, now);
  const by = event.shelved_by ?? event.acked_by ?? 'unknown';
  const countdown = shelfCountdown(event.shelve_until, now);
  const expired = Number.isFinite(Date.parse(event.shelve_until ?? ''))
    ? `expired ${stamp(event.shelve_until)} · ${countdown.replace(/^expired /, '')}` : countdown;
  const byText = shelfOnRow ? ` · by ${by}` : '';

  return (
    <>
      {event.last_diagnosis && event.last_diagnosis !== event.peak_diagnosis && <KvRow label="Latest">{diagnosisLabel(event.last_diagnosis)}</KvRow>}
      <KvRow label="Condition">
        <TonePill tone={condition.tone} glyph={condition.glyph}>{condition.label}</TonePill>
        {legacy && <TonePill tone={legacy.tone} glyph={legacy.glyph}>{legacy.label}</TonePill>}
      </KvRow>
      {/* CHG-032: review and suppression are independent facts, each with its own record. */}
      <KvRow label="Review">
        <TonePill tone={review.tone} glyph={review.glyph}>{review.label}</TonePill>
        {!open && !acked && (
          <Toggletip variant="how-to" label="About an unreviewed closed episode">
            <p>This episode has closed but was never acknowledged — a closed, unacknowledged episode is an unreviewed finding, not a resolved one. It can still be acknowledged; shelving no longer applies.</p>
          </Toggletip>
        )}
        {acked && ackOnRow && <Sub>{event.acked_by ?? 'unknown'} · {stamp(event.acked_at)}</Sub>}
      </KvRow>
      {event.note && ackOnRow && <KvRow label="Review note">{event.note}</KvRow>}
      <KvRow label="Shelf">
        {shelf === 'ACTIVE' && <><TonePill tone="muted" glyph="◐">Shelved</TonePill><Sub>until {stamp(event.shelve_until)} · {countdown}{byText}</Sub></>}
        {shelf === 'EXPIRED' && <><TonePill tone="warn" glyph="!">Returned</TonePill><Sub>{expired}{byText}</Sub></>}
        {!shelf && <span className="cpm-event-row__sub">Not shelved</span>}
      </KvRow>
      {shelf && shelfOnRow && (event.shelve_reason ?? event.note) && <KvRow label="Shelf reason">{event.shelve_reason ?? event.note}</KvRow>}
      <KvRow label="Period">{stamp(event.opened_at)} {'→'} {event.closed_at ? stamp(event.closed_at) : 'now'}</KvRow>
    </>
  );
};

export default EpisodeFacts;
