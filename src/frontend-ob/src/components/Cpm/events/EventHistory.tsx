'use client';

/**
 * The episode's operator history (CHG-032): every acknowledge / shelve / update /
 * unshelve / expiry, newest first, from `GET /events/{id}/actions`. Lazy and
 * fetched only while shown, so opening an event costs nothing extra.
 */
import React from 'react';
import { useEventActions } from '../../../hooks/useCpm';
import { EmptyState, KvRow, TonePill, fmtDateTime } from '../shared';
import { ACTION_VIEW } from './shelfState';

export const EventHistory: React.FC<{ eventId: number }> = ({ eventId }) => {
  const q = useEventActions(eventId, true);
  if (q.isLoading) return <EmptyState title="Loading history…" />;
  if (q.isError) {
    return <p className="cpm-field__error" role="alert">{(q.error as Error)?.message ?? 'The history could not be loaded.'}</p>;
  }
  const rows = q.data?.actions ?? [];
  if (rows.length === 0) return <EmptyState title="No operator action yet" copy="Acknowledgements and shelves will be listed here." />;
  return (
    <div role="list" aria-label="Operator history">
      {rows.map(a => {
        const view = ACTION_VIEW[a.action] ?? { label: a.action, tone: 'muted' as const };
        return (
          <div role="listitem" key={a.id}>
            <KvRow label={fmtDateTime(a.at)}>
              <TonePill tone={view.tone}>{view.label}</TonePill>{' '}
              {a.actor}
              {a.until ? ` · until ${fmtDateTime(a.until)}` : ''}
              {a.reason ? ` · ${a.reason}` : ''}
            </KvRow>
          </div>
        );
      })}
    </div>
  );
};

export default EventHistory;
