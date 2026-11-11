'use client';

/**
 * CHG-167 (owner review, answer 1): "How to read" for Loop Events, beside the view toggle. It replaces the title's ? and the
 * page's toggletips (About availability, About fast conditions, the stale hover text): titled parts, Review, Condition, Rows
 * and Fast conditions, each a key in two aligned columns, a pill (tone + glyph + word) or a term beside what it means.
 */
import React from 'react';
import { Dialog } from '../../../ui/Dialog';
import { TonePill, type CpmTone } from '../shared';
import { gateName } from '../gateStatus';

type Term = { pill: [tone: CpmTone, glyph: string, word: string] } | { term: string };
interface Part { title: string; rows: Array<[Term, string]> }

const gate = (g: string) => `${g} · ${gateName(g)}`;

const PARTS: Part[] = [
  { title: 'Review', rows: [
    [{ pill: ['warn', '!', 'Unacknowledged'] }, 'Open and not reviewed. An active shelf takes it out of this queue.'],
    [{ pill: ['good', '✓', 'Acknowledged'] }, 'Reviewed. A shelf stays until it expires or is unshelved.'],
    [{ pill: ['muted', '◐', 'Shelved · expires in 3.0 h'] }, 'Out of the queue until the expiry. Shelving does not review it.'],
    [{ pill: ['warn', '!', 'Shelf expired · unreviewed'] }, 'Back in the queue: nobody reviewed it.'],
  ] },
  { title: 'Condition', rows: [
    [{ pill: ['warn', '●', 'Open'] }, 'The newest window still carries the finding.'],
    [{ pill: ['warn', '⊘', 'Open · Unobservable'] }, 'The newest window could not be judged (excluded or insufficient data), so the condition has not recovered.'],
    [{ pill: ['muted', '○', 'Closed · recovered'] }, 'An evaluable, fault-free result with enough qualified support.'],
    [{ pill: ['muted', '○', 'Closed · family changed'] }, 'A different fault family took over the loop.'],
    [{ pill: ['muted', '?', 'Availability unknown'] }, 'Recorded before v2.5.'],
  ] },
  { title: 'Rows', rows: [
    [{ term: 'One row' }, 'One episode of one fault family on one window kind (12h or 24h). A change in its evidence score extends it rather than duplicating it.'],
    [{ term: 'Triage · Newest' }, 'Worst first · by the time it opened.'],
  ] },
  { title: 'Fast conditions', rows: [
    [{ term: `${gate('G10')}, ${gate('G11')}` }, 'Limit high, limit low and freeze, detected within a minute, before the next fused window.'],
    [{ pill: ['muted', '◌', 'Stale'] }, 'Open on record but not updated for 10 min: the engine restarted or the loop’s samples stopped.'],
  ] },
];

export const EventsHowToRead: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => (
  <Dialog open={open} onClose={onClose} title="How to read" size="wide">
    <div className="cpm-howto">
      {PARTS.map(part => (
        <section key={part.title} className="cpm-howto__part" aria-label={part.title}>
          <h3 className="cpm-howto__title">{part.title}</h3>
          <dl className="cpm-howto__key">
            {part.rows.map(([t, meaning]) => (
              <div key={meaning} className="cpm-howto__row">
                <dt>{'pill' in t ? <TonePill tone={t.pill[0]} glyph={t.pill[1]}>{t.pill[2]}</TonePill> : t.term}</dt>
                <dd>{meaning}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  </Dialog>
);

export default EventsHowToRead;
