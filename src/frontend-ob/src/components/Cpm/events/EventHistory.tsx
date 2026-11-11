'use client';

/**
 * The episode's operator history (CHG-032): every acknowledge / shelve / update / unshelve / expiry, newest first, from
 * `GET /events/{id}/actions`. Fetched only while shown. CHG-167 (owner review): a table in the Full history dialog, Time · UTC,
 * Action (tone + glyph + word), By, Until, Reason; the zone once, in the heading.
 */
import React from 'react';
import { useEventActions } from '../../../hooks/useCpm';
import { TonePill } from '../shared';
import { ACTION_VIEW } from './shelfState';
import { stamp, zoneTag } from './eventTime';

export const EventHistory: React.FC<{ eventId: number }> = ({ eventId }) => {
  const q = useEventActions(eventId, true);
  if (q.isLoading) return <p className="cpm-metric-na">Loading…</p>;
  if (q.isError) {
    return <p className="cpm-field__error" role="alert">{(q.error as Error)?.message ?? 'The history could not be loaded.'}</p>;
  }
  const rows = q.data?.actions ?? [];
  if (rows.length === 0) return <p className="cpm-metric-na">No action recorded yet.</p>;
  return (
    <div className="cpm-matrix-scroll">
      <table className="cpm-table" aria-label="Operator history">
        <thead>
          <tr><th>Time · {zoneTag()}</th><th>Action</th><th>By</th><th>Until</th><th>Reason</th></tr>
        </thead>
        <tbody>
          {rows.map(a => {
            const view = ACTION_VIEW[a.action] ?? { label: a.action, tone: 'muted' as const, glyph: '·' };
            return (
              <tr key={a.id}>
                <td>{stamp(a.at)}</td>
                <td><TonePill tone={view.tone} glyph={view.glyph}>{view.label}</TonePill></td>
                <td>{a.actor}</td>
                <td>{a.until ? stamp(a.until) : '—'}</td>
                <td>{a.reason || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default EventHistory;
