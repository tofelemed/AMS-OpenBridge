/**
 * CHG-136: the Loop Events list as the reference reads it: Loop / peak diagnosis, Severity, Review, Opened. A row says the tag,
 * the peak diagnosis and "EVT-n · 12h"; one severity word; one review pill with one state line; the opening time. CHG-167
 * (owner review, the approved sample): the list title went (the state dropdown says Open); "Opened · UTC" over "5 Oct 07:45",
 * the zone once; the review pill is tone + glyph + word (the severity keeps its dot); the column widths fit "Shelf expired ·
 * unreviewed" (it ran into the date). The rows sit in the list card under its filter row.
 */
import React from 'react';
import type { CpmEventFrame } from '../../../api/cpmApi';
import { TonePill } from '../shared';
import { diagnosisLabel } from '../vocabulary';
import { reviewView, severityWord, stateLine } from './shelfState';
import { stamp, zoneTag } from './eventTime';

export const EpisodeList: React.FC<{
  events: CpmEventFrame[];
  selectedId: number | undefined;
  now: number;
  onSelect: (id: number) => void;
  /** Loading, error, empty and off-page notices, above the rows. */
  notices?: React.ReactNode;
}> = ({ events, selectedId, now, onSelect, notices }) => (
  <>
    <div className="cpm-event-head cpm-events-grid cpm-table-head--sticky">
      <span>Loop / peak diagnosis</span>
      <span>Severity</span>
      <span>Review</span>
      <span>Opened · {zoneTag()}</span>
    </div>
    {notices}
    {events.map(e => {
      const sev = severityWord(e);
      const review = reviewView(e, now);
      const isSelected = selectedId === e.id;
      return (
        // CHG-100: the whole row selects (pointer); the button stays the keyboard / screen-reader control
        <div key={e.id} className={`cpm-event-row cpm-events-grid cpm-event-row--dense cpm-row-click${isSelected ? ' cpm-event-row--selected' : ''}`}
          aria-current={isSelected ? 'true' : undefined} onClick={() => onSelect(e.id)}>
          <button type="button" className="cpm-event-row__select" aria-pressed={isSelected}
            onClick={() => onSelect(e.id)}>
            <span className="cpm-event-row__title">{e.loop_id}</span>
            <span className="cpm-episodes__line">{diagnosisLabel(e.peak_diagnosis)}</span>
            <span className="cpm-event-row__sub cpm-episodes__line">EVT-{e.id} · {e.window_kind}</span>
          </button>
          <span><TonePill tone={sev.tone}>{sev.label}</TonePill></span>
          <span className="cpm-event-row__states">
            <TonePill tone={review.tone} glyph={review.glyph}>{review.label}</TonePill>
            <span className="cpm-event-row__sub">{stateLine(e)}</span>
          </span>
          <span className="cpm-event-row__sub">{stamp(e.opened_at)}</span>
        </div>
      );
    })}
  </>
);

export default EpisodeList;
