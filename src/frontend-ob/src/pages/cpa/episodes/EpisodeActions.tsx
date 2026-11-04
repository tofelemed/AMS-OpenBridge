/**
 * The inspector's outline actions (SPEC §5.3). The primary, Acknowledge, sits at the inspector's foot.
 * A write needs `cpm.manage`; without it every write stays visible, disabled, and the reason is on
 * screen once. Writing never moves the selection.
 */
import React, { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { CpmEventFrame } from '../../../api/cpmApi';
import { receiptDone, useReceiptUser, type Receipt } from '../../../components/Cpm/ActionReceipt';
import { conditionOf } from '../../../components/Cpm/events/eventsState';
import { shelfState } from '../../../components/Cpm/events/shelfState';
import { siteDateTime } from '../../../cpa/siteTime';
import { useCpaContext } from '../../../cpa/useCpaContext';
import { useShelveEvent, useUnshelveEvent } from '../../../hooks/useCpm';
import { Button } from '../../../ui/Button';
import { EpisodeNoteForm } from './EpisodeNoteForm';
import { NEEDS_MANAGE, byline, openEvidenceHref, openLoopHref } from './episodeView';
import { ShelveForm } from './ShelveForm';
import { UnshelveForm } from './UnshelveForm';

type Panel = 'none' | 'shelve' | 'unshelve' | 'note';

export const EpisodeActions: React.FC<{
  event: CpmEventFrame;
  canManage: boolean;
  maxHours: number;
  onReceipt: (r: Receipt) => void;
}> = ({ event, canManage, maxHours, onReceipt }) => {
  const { zone } = useCpaContext();
  const { search } = useLocation();
  const user = useReceiptUser();
  const shelve = useShelveEvent();
  const unshelve = useUnshelveEvent();
  const [panel, setPanel] = useState<Panel>('none');
  const rowRef = useRef<HTMLDivElement>(null);

  const now = Date.now();
  const open = conditionOf(event) === 'OPEN';
  const shelf = shelfState(event, now);
  const toggle = (next: Panel) => setPanel(current => (current === next ? 'none' : next));
  // The form holds the focus when it closes, so it goes back to the actions.
  const close = () => { setPanel('none'); rowRef.current?.focus(); };

  const onShelve = (until: string, reason: string) => shelve.mutate({ id: event.id, until, reason }, {
    onSuccess: r => {
      close();
      const verb = r.updated ? 'Shelf updated' : 'Shelved';
      onReceipt(receiptDone(`${verb} until ${siteDateTime(r.shelveUntil ?? until, zone.id)}, ${byline(user, zone.id)}`, event.id));
    },
  });

  const onUnshelve = (reason: string | undefined) => unshelve.mutate({ id: event.id, reason }, {
    onSuccess: r => {
      close();
      const lands = r.ackState === 'ACKNOWLEDGED' ? 'It stays acknowledged.' : 'It is back in the Unacknowledged queue.';
      onReceipt(receiptDone(`Unshelved ${byline(user, zone.id)}. ${lands}`, event.id));
    },
  });

  return (
    <div className="episode__actions">
      {!canManage && <p className="ui-meta">{NEEDS_MANAGE}</p>}
      <div ref={rowRef} className="episode__action-row" tabIndex={-1}>
        <Button
          disabled={!canManage || !open || shelve.isPending}
          reason={canManage && !open ? 'A closed episode cannot be shelved.' : undefined}
          onClick={() => toggle('shelve')}
        >
          {shelf === 'ACTIVE' ? 'Update shelf…' : 'Shelve…'}
        </Button>
        <Button
          disabled={!canManage || !shelf || unshelve.isPending}
          reason={canManage && !shelf ? 'The episode is not shelved.' : undefined}
          onClick={() => toggle('unshelve')}
        >
          Unshelve…
        </Button>
        <Button disabled={!canManage} onClick={() => toggle('note')}>Add note…</Button>
        <Link className="ui-control" to={openLoopHref(event, search, now)}>Open loop</Link>
        <Link className="ui-control" to={openEvidenceHref(event, search)}>Open evidence</Link>
      </div>
      <p className="ui-meta">Peak window not recorded. Open evidence shows the newest window of this episode.</p>

      {panel === 'shelve' && canManage && (
        <ShelveForm
          event={event}
          zoneId={zone.id}
          maxHours={maxHours}
          pending={shelve.isPending}
          error={shelve.error}
          onShelve={onShelve}
          onClose={() => { shelve.reset(); close(); }}
        />
      )}
      {panel === 'unshelve' && canManage && (
        <UnshelveForm
          event={event}
          pending={unshelve.isPending}
          error={unshelve.error}
          onUnshelve={onUnshelve}
          onClose={() => { unshelve.reset(); close(); }}
        />
      )}
      {panel === 'note' && canManage && (
        <EpisodeNoteForm event={event} zoneId={zone.id} onReceipt={onReceipt} onClose={close} />
      )}
    </div>
  );
};
