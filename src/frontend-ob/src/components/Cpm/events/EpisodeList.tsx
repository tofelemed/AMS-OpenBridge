/**
 * CHG-136: the Loop Events list as the reference reads it: Loop / peak diagnosis, Severity, Review, Opened. A row
 * says the tag, the peak diagnosis and "EVT-n · 12h"; one severity word; one review pill with one state line; the
 * time and the date. The latest diagnosis, availability and the loop link live in the detail on the right.
 */
import React from 'react';
import type { CpmEventFrame } from '../../../api/cpmApi';
import { PanelHead, TonePill } from '../shared';
import { fmtWhen } from '../blocks/whenText';
import { diagnosisLabel } from '../vocabulary';
import { reviewView, severityWord, stateLine } from './shelfState';

export const EpisodeList: React.FC<{
  title: string;
  events: CpmEventFrame[];
  selectedId: number | undefined;
  now: number;
  onSelect: (id: number) => void;
  /** Loading, error, empty and off-page notices, above the rows. */
  notices?: React.ReactNode;
  /** The pager, under the rows. */
  footer?: React.ReactNode;
}> = ({ title, events, selectedId, now, onSelect, notices, footer }) => (
  <section className="cpm-surface cpm-episodes" style={{ padding: 0 }}>
    <div className="cpm-episodes__title"><PanelHead title={title} /></div>
    <div className="cpm-event-head cpm-table-head--sticky">
      <span>Loop / peak diagnosis</span>
      <span>Severity</span>
      <span>Review</span>
      <span>Opened</span>
    </div>
    {notices}
    {events.map(e => {
      const sev = severityWord(e);
      const review = reviewView(e, now);
      const isSelected = selectedId === e.id;
      return (
        // CHG-100: the whole row selects (pointer); the button stays the keyboard / screen-reader control
        <div key={e.id} className={`cpm-event-row cpm-event-row--dense cpm-row-click${isSelected ? ' cpm-event-row--selected' : ''}`}
          aria-current={isSelected ? 'true' : undefined} onClick={() => onSelect(e.id)}>
          <button type="button" className="cpm-event-row__select" aria-pressed={isSelected}
            aria-label={`${e.loop_id}. Peak: ${diagnosisLabel(e.peak_diagnosis)}. EVT-${e.id} · ${e.window_kind}. Show this episode`}
            onClick={() => onSelect(e.id)}>
            <span className="cpm-event-row__title">{e.loop_id}</span>
            <span className="cpm-episodes__line">{diagnosisLabel(e.peak_diagnosis)}</span>
            <span className="cpm-event-row__sub cpm-episodes__line">EVT-{e.id} · {e.window_kind}</span>
          </button>
          <span><TonePill tone={sev.tone}>{sev.label}</TonePill></span>
          <span className="cpm-event-row__states">
            <TonePill tone={review.tone}>{review.label}</TonePill>
            <span className="cpm-event-row__sub">{stateLine(e)}</span>
          </span>
          <span className="cpm-event-row__sub">{fmtWhen(e.opened_at)}</span>
        </div>
      );
    })}
    {footer}
  </section>
);

export default EpisodeList;
