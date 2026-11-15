/**
 * Task 17: what the stored sample under the replay cursor says. PV, SP, OP and Mode come from the historian slice; a value the
 * slice did not store reads "Not recorded" (mode) or a dash (a number), never AUT or 0. The time is the site's.
 * CHG-189 (owner review item 12): the four values read like the Loop Explorer readings (value with its unit, the same boxes),
 * the mode as its word ("Auto"), "Sample 8,639 of 8,639"; the time prints exactly as before (Q5), in the body face, not mono.
 * Stored values take no state colour, as on Investigation's readings at a window end.
 */
import React from 'react';
import type { CpmTrendPoint } from '../../../api/cpm/kpis';
import { modeWord } from '../../../utils/modeVocabulary';
import { formatInZone, zoneLabel } from '../evidence/timezone';
import { SignalReading } from '../explorer/summary/SignalReading';
import { cursorIndex } from './cursorIndex';

const NOT_RECORDED = 'Not recorded';
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : null);
// A numeric mode (a historian that stores the mode code) is a recorded value: it shows as stored, never as Not recorded.
const mode = (v: unknown) => (typeof v === 'string' && v.trim() ? modeWord(v) : typeof v === 'number' && Number.isFinite(v) ? String(v) : NOT_RECORDED);

/** `truncated`: the slice hit the replay budget, so the count is of the samples loaded, not of the window. */
export const CursorReadout: React.FC<{ points: CpmTrendPoint[]; cursorPct: number; timeZone: string; truncated?: boolean; pvUnit?: string }> = ({
  points, cursorPct, timeZone, truncated, pvUnit = '',
}) => {
  const i = cursorIndex(points.length, cursorPct);
  if (i < 0) return null;
  const p = points[i];
  const eu = pvUnit.trim();
  const values: Array<[string, string | null, string]> = [['PV', num(p.pv), eu], ['SP', num(p.sp), eu], ['OP', num(p.op), '%']];
  return (
    <div className="cpm-readout" role="status" aria-label="Values at the replay cursor">
      <div className="cpm-signal-group">
        {values.map(([caption, value, unit]) => <SignalReading key={caption} caption={caption} value={value ?? '—'} unit={value != null ? unit : undefined} />)}
        <SignalReading caption="MODE" value={mode(p.mode)} />
      </div>
      <span className="cpm-readout__at">
        <span>Sample {(i + 1).toLocaleString('en-US')} of {points.length.toLocaleString('en-US')}{truncated ? ' loaded' : ''}</span>
        <span className="cpm-readout__time">{formatInZone(p.ts, timeZone)} {zoneLabel(timeZone, p.ts)}</span>
      </span>
    </div>
  );
};
