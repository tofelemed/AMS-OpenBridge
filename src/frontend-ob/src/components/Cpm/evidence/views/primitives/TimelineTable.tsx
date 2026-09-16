/**
 * v2.5 Task 2E.4 primitive: a table of episodes / events with their instants in the site zone -
 * dwell episodes, freeze episodes, state intervals, rejected cycles. Rows are the artifact's rows.
 */
import React from 'react';
import { formatInZone } from '../../timezone';

export interface TimelineRow {
  startMs: number | null;
  endMs?: number | null;
  durationS?: number | null;
  label: string;
  detail?: string;
}

export const TimelineTable: React.FC<{ title: string; rows: TimelineRow[]; timeZone: string; empty: string }> = ({ title, rows, timeZone, empty }) => (
  <div className="cpm-timeline-table" data-table={title}>
    <span className="cpm-eyebrow">{title}</span>
    {rows.length === 0 ? <p className="cpm-copy">{empty}</p> : (
      <table className="cpm-table">
        <thead><tr><th>Start</th><th>End</th><th>Duration</th><th>What</th><th>Detail</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="cpm-mono">{r.startMs != null ? formatInZone(r.startMs, timeZone) : '—'}</td>
              <td className="cpm-mono">{r.endMs != null ? formatInZone(r.endMs, timeZone) : '—'}</td>
              <td>{r.durationS != null ? `${r.durationS.toFixed(1)} s` : '—'}</td>
              <td>{r.label}</td>
              <td>{r.detail ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
);
