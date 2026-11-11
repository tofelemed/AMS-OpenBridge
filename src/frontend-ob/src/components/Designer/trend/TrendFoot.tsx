'use client';

/**
 * CHG-175 (owner's design): the Trend chart's foot strip. The state as tone, glyph and word (it was LIVE / PAUSED /
 * HISTORICAL / NO NEW SAMPLES in the running colour at the end of the time bar, and PINNED WINDOW in the band), the zone
 * named once, and at the right the notes that apply: a live chart held while zoomed, a pen whose history was not read.
 */
import React from 'react';

export type TrendState = 'live' | 'stale' | 'paused' | 'fixed';

const STATE: Record<TrendState, { glyph: string; word: string; tone?: 'ok' | 'warn' }> = {
  live: { glyph: '●', word: 'Live', tone: 'ok' },
  stale: { glyph: '◐', word: 'No new samples', tone: 'warn' },
  paused: { glyph: '‖', word: 'Paused' },
  fixed: { glyph: '○', word: 'Fixed period' },
};

export const TrendFoot: React.FC<{
  state: TrendState;
  /** The zone's short name, "UTC" or "GST". */
  zoneName: string;
  /** The chart is zoomed (said only while it follows live). */
  zoomed?: boolean;
  /** Pens whose history could not be read. */
  failed?: string[];
}> = ({ state, zoneName, zoomed = false, failed = [] }) => {
  const s = STATE[state];
  const following = state === 'live' || state === 'stale';
  return (
    <div className="trend-core__foot" role="status" data-testid="trend-foot">
      <b className={`trend-core__state${s.tone ? ` trend-core__state--${s.tone}` : ''}`}>
        <span aria-hidden="true">{s.glyph}</span> <span>{s.word}</span>
      </b>
      <span aria-hidden="true">·</span>
      <span>times in {zoneName}</span>
      <span className="trend-core__foot-end">
        {following && zoomed && <span>Zoomed · Reset to follow live</span>}
        {failed.length > 0 && (
          <span>
            <b className="trend-core__state trend-core__state--warn">
              <span aria-hidden="true">◐</span> {failed.join(', ')} not read
            </b> · the values shown may be incomplete
          </span>
        )}
      </span>
    </div>
  );
};

export default TrendFoot;
