'use client';

/**
 * CHG-136: "Activity & notes" — the latest operator actions (acknowledge, shelve, unshelve, expiry) and loop notes
 * of one episode as a single timeline, newest first. "Full history ↗" opens the whole record in a dialog, with the
 * control that links an earlier loop note to the episode. Reads the same two queries the dialog's parts use.
 */
import React, { useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmEventAction, CpmEventFrame } from '../../../api/cpmApi';
import type { LoopNote } from '../../../api/cpm/investigations';
import { Dialog } from '../../../ui/Dialog';
import { useEventActions } from '../../../hooks/useCpm';
import { useEventNotes } from '../../../hooks/useLoopNotes';
import { PanelHead } from '../shared';
import { fmtWhen } from '../blocks/whenText';
import { ACTION_VIEW } from './shelfState';
import { EpisodeNotes } from './EpisodeNotes';
import EventHistory from './EventHistory';

const LATEST = 3;

export interface TimelineRow { key: string; at: string; label: string; who: string; text: string }

/** Actions and notes in one list, newest first. */
export function timeline(actions: CpmEventAction[], notes: LoopNote[]): TimelineRow[] {
  const rows: TimelineRow[] = [
    ...actions.map(a => ({
      key: `a${a.id}`, at: a.at, who: a.actor, label: ACTION_VIEW[a.action]?.label ?? a.action, text: a.reason ?? '',
    })),
    ...notes.map(n => ({ key: n.refId, at: n.createdAt, who: n.createdBy ?? 'unknown', label: 'Note', text: n.note })),
  ];
  return rows.sort((x, y) => Date.parse(y.at) - Date.parse(x.at));
}

export const EpisodeActivity: React.FC<{ event: CpmEventFrame }> = ({ event }) => {
  const [full, setFull] = useState(false);
  const actions = useEventActions(event.id, true);
  const notes = useEventNotes(event.id);
  const rows = timeline(actions.data?.actions ?? [], notes.data?.investigations ?? []);
  const loading = actions.isLoading || notes.isLoading;
  return (
    <section className="cpm-episode-activity" data-testid="episode-activity">
      <PanelHead title="Activity & notes"
        right={<ObcButton variant="flat" onClick={() => setFull(true)}>Full history ↗</ObcButton>} />
      {loading && rows.length === 0 && <p className="cpm-metric-na">Loading…</p>}
      {actions.isError && <p className="cpm-field__error" role="alert">The history could not be loaded.</p>}
      {!loading && !actions.isError && rows.length === 0 && <p className="cpm-metric-na">No activity yet</p>}
      {rows.length > 0 && (
        <ol className="cpm-episode-activity__list">
          {rows.slice(0, LATEST).map(r => (
            <li key={r.key} className="cpm-episode-activity__item">
              <span className="cpm-event-row__sub">{fmtWhen(r.at)}</span>
              <span>{r.label} · {r.who}{r.text ? ` — ${r.text}` : ''}</span>
            </li>
          ))}
        </ol>
      )}
      <Dialog open={full} onClose={() => setFull(false)} title={`EVT-${event.id} · Full history`} size="wide">
        <EventHistory eventId={event.id} />
        <EpisodeNotes event={event} />
      </Dialog>
    </section>
  );
};

export default EpisodeActivity;
