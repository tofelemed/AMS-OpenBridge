'use client';

/**
 * CHG-136: "Activity & notes" — the latest operator actions (acknowledge, shelve, unshelve, expiry) and loop notes of one
 * episode as a single timeline, newest first. CHG-167 (owner review): the one place for who, when and why ("Shelved ·
 * superadmin · until 11 Nov 21:30 — maintenance planned"); Full history is a dialog (so no ↗), titled "Full history", in two
 * parts, Actions (a table) and Notes (with the control that links an earlier loop note). Reads the queries the dialog's parts use.
 */
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmEventAction, CpmEventFrame } from '../../../api/cpmApi';
import type { LoopNote } from '../../../api/cpm/investigations';
import { Dialog } from '../../../ui/Dialog';
import { useEventActions } from '../../../hooks/useCpm';
import { useEventNotes } from '../../../hooks/useLoopNotes';
import { ACTION_VIEW } from './shelfState';
import { stamp } from './eventTime';
import { EpisodeNotes } from './EpisodeNotes';
import EventHistory from './EventHistory';

const LATEST = 3;

export interface TimelineRow { key: string; at: string; label: string; who: string; text: string; until: string | null }

/** Actions and notes in one list, newest first. */
export function timeline(actions: CpmEventAction[], notes: LoopNote[]): TimelineRow[] {
  const rows: TimelineRow[] = [
    ...actions.map(a => ({
      key: `a${a.id}`, at: a.at, who: a.actor, label: ACTION_VIEW[a.action]?.label ?? a.action, text: a.reason ?? '', until: a.until,
    })),
    ...notes.map(n => ({ key: n.refId, at: n.createdAt, who: n.createdBy ?? 'unknown', label: 'Note', text: n.note, until: null })),
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
    <section className="cpm-events-panel__sect cpm-episode-activity" data-testid="episode-activity">
      <div className="cpm-events-panel__head">
        <h3 className="cpm-panel-title">Activity &amp; notes</h3>
        <ObcButton variant="flat" onClick={() => setFull(true)}>Full history</ObcButton>
      </div>
      {loading && rows.length === 0 && <p className="cpm-metric-na">Loading…</p>}
      {actions.isError && <p className="cpm-field__error" role="alert">The history could not be loaded.</p>}
      {!loading && !actions.isError && rows.length === 0 && <p className="cpm-metric-na">No activity yet</p>}
      {rows.length > 0 && (
        <ol className="cpm-episode-activity__list">
          {rows.slice(0, LATEST).map(r => (
            <li key={r.key} className="cpm-episode-activity__item">
              <span className="cpm-event-row__sub">{stamp(r.at)}</span>
              <span>{r.label} · {r.who}{r.until ? ` · until ${stamp(r.until)}` : ''}{r.text ? ` — ${r.text}` : ''}</span>
            </li>
          ))}
        </ol>
      )}
      {full && createPortal(
        <Dialog open onClose={() => setFull(false)} title="Full history" size="wide">
          <div className="cpm-howto">
            <section className="cpm-howto__part" aria-labelledby="cpm-history-actions">
              <h3 id="cpm-history-actions" className="cpm-howto__title">Actions</h3>
              <EventHistory eventId={event.id} />
            </section>
            <section className="cpm-howto__part" aria-labelledby="cpm-history-notes">
              <h3 id="cpm-history-notes" className="cpm-howto__title">Notes</h3>
              <EpisodeNotes event={event} />
            </section>
          </div>
        </Dialog>, document.body)}
    </section>
  );
};

export default EpisodeActivity;
