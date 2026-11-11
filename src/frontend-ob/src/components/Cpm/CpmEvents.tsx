'use client';

/**
 * CPLM Phase 7 — U4 Events. Loop Events: which episodes need a response, and what this one is.
 *
 * CHG-136: a toggle in the header, Episodes | Fast conditions (`?view=conditions&condition=`). CHG-063: the episode list is
 * filtered, searched and paged on the server; a deep-linked episode off the page is read by id (events/EpisodesView).
 *
 * CHG-167 (owner review, the approved sample docs/theme/redesign/samples/loop-events-proposal.html and the owner's answers of
 * 11 Nov 2026): the header is the eyebrow and the title, no ?; top right the toggle, without counts (each count is in its
 * view's state dropdown), and How to read beside it (a dialog that replaced the title's ? and the page's toggletips). Each view
 * is a list card with one filter row and the shared pager, beside the selected item's panel (a drawer below 1280 px).
 */
import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { WorkspaceHeader } from './shared';
import { useCpmScope } from './plantScope';
import { useAuthStore } from '../../store/authStore';
import { ConditionsView } from './events/ConditionsView';
import { EpisodesView } from './events/EpisodesView';
import { EventsHowToRead } from './events/EventsHowToRead';

type View = 'episodes' | 'conditions';
const VIEWS: ReadonlyArray<{ value: View; label: string }> = [
  { value: 'episodes', label: 'Episodes' },
  { value: 'conditions', label: 'Fast conditions' },
];

export const CpmEvents: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const view: View = params.get('view') === 'conditions' ? 'conditions' : 'episodes';
  const canManage = useAuthStore(s => s.hasPermission('cpm.manage'));
  const scope = useCpmScope();
  // Guidance is ephemeral and personal: it does not belong in a shareable URL.
  const [guide, setGuide] = useState(false);
  const setView = (v: View) => setParams(p => {
    if (v === 'conditions') p.set('view', v); else p.delete('view');
    p.delete('condition');
    return p;
  }, { replace: true });

  return (
    <div className="cpm-screen cpm-events">
      <WorkspaceHeader page="/cpm/events" title="Loop Events" copy=""
        actions={<>
          <SegmentedControl<View> label="Loop events view" ignoreReselect value={view} onChange={setView} options={VIEWS} />
          <ObcButton variant="flat" onClick={() => setGuide(true)}>How to read</ObcButton>
        </>} />
      {view === 'conditions'
        ? <ConditionsView scope={scope.params} />
        : <EpisodesView scope={scope.params} canManage={canManage} />}
      <EventsHowToRead open={guide} onClose={() => setGuide(false)} />
    </div>
  );
};

export default CpmEvents;
