/** The episode's history. Mounted only while open, so selecting an episode costs no extra read. */
import React from 'react';
import type { CpmEventFrame } from '../../../api/cpmApi';
import type { LoopNote } from '../../../api/cpm/investigations';
import { useEventActions } from '../../../hooks/useCpm';
import { DataState } from '../../../ui/DataState';
import { Badge } from './EpisodeBits';
import { historyRows } from './historyRows';

export const EpisodeHistory: React.FC<{
  event: CpmEventFrame;
  notes: LoopNote[];
  notesError: unknown;
  zoneId: string;
}> = ({ event, notes, notesError, zoneId }) => {
  const actions = useEventActions(event.id, true);
  if (actions.isLoading) return <DataState kind="loading" label="Loading history" rows={3} />;
  if (actions.isError) return <DataState kind="error" error={actions.error} onRetry={() => void actions.refetch()} />;

  return (
    <>
      {notesError != null && <p className="ui-meta">Notes could not be loaded, so none are listed here.</p>}
      <ol className="episode__history" aria-label="History">
        {historyRows(event, actions.data?.actions ?? [], notes, zoneId).map(row => (
          <li key={row.key}>
            <span className="ui-meta">{row.time}</span>
            <span className="episode__history-line">
              <Badge view={row} />
              {row.who && <span>{row.who}</span>}
            </span>
            {row.detail && <span className="episode__text">{row.detail}</span>}
          </li>
        ))}
      </ol>
    </>
  );
};
