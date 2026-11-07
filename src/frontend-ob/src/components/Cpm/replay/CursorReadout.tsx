/**
 * Task 17: what the stored sample under the replay cursor says. PV, SP, OP and Mode come from the historian slice; a value the
 * slice did not store reads "Not recorded" (mode) or a dash (a number), never AUT or 0. The time is the site's.
 */
import React from 'react';
import type { CpmTrendPoint } from '../../../api/cpm/kpis';
import { formatInZone, zoneLabel } from '../evidence/timezone';
import { cursorIndex } from './cursorIndex';

const NOT_RECORDED = 'Not recorded';
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : '—');
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : NOT_RECORDED);

export const CursorReadout: React.FC<{ points: CpmTrendPoint[]; cursorPct: number; timeZone: string }> = ({ points, cursorPct, timeZone }) => {
  const i = cursorIndex(points.length, cursorPct);
  if (i < 0) return null;
  const p = points[i];
  const items: [string, string][] = [
    ['PV', num(p.pv)], ['SP', num(p.sp)], ['OP', num(p.op)], ['Mode', text(p.mode)],
  ];
  return (
    <div className="cpm-readout" role="status" aria-label="Values at the replay cursor">
      <dl className="cpm-readout__values">
        {items.map(([k, v]) => <div key={k} className="cpm-readout__item"><dt className="cpm-eyebrow">{k}</dt><dd className="cpm-mono">{v}</dd></div>)}
      </dl>
      <span className="cpm-copy">Sample {(i + 1).toLocaleString('en-US')} / {points.length.toLocaleString('en-US')}</span>
      <span className="cpm-mono">{formatInZone(p.ts, timeZone)} {zoneLabel(timeZone, p.ts)}</span>
    </div>
  );
};
