/**
 * The selected episode (SPEC §5.3): identity, what happened, condition and availability as separate
 * fields, persistence, provenance and history. The primary action, Acknowledge, sits at the foot, with
 * the last receipt, which the page holds so it outlives this component. Nothing else is shown in place
 * of an episode the URL names: an operator must never acknowledge one they did not pick.
 */
import React, { useState } from 'react';
import type { CpmEventFrame, CpmShelvePolicy } from '../../../api/cpmApi';
import { receiptDone, useReceiptUser, type Receipt } from '../../../components/Cpm/ActionReceipt';
import { evidenceScore } from '../../../components/Cpm/evidenceScore';
import { isAcknowledged, shelfState } from '../../../components/Cpm/events/shelfState';
import { phrase } from '../../../components/Cpm/vocabulary';
import { siteDateTime } from '../../../cpa/siteTime';
import { useCpaContext } from '../../../cpa/useCpaContext';
import { useAcknowledgeEvent } from '../../../hooks/useCpm';
import { useEventNotes } from '../../../hooks/useLoopNotes';
import { Button } from '../../../ui/Button';
import { DataState } from '../../../ui/DataState';
import { Accordion } from '../../../ui/forms/Accordion';
import { TextInput } from '../../../ui/forms/TextInput';
import { Inspector } from '../../../ui/Inspector';
import { TechnicalDetails } from '../../../ui/TechnicalDetails';
import { EpisodeActions } from './EpisodeActions';
import { Badge, BadgeOrDash, EpisodeReceipt, Field, failed } from './EpisodeBits';
import { EpisodeHistory } from './EpisodeHistory';
import {
  NEEDS_MANAGE, NOT_RECORDED, acknowledgementView, availabilityView, byline, conditionView, episodeTitle, peakView,
  severityView, shelfView, stateLine, summaryText, supportText, verdictView,
} from './episodeView';
import type { EpisodeSelection } from './useEpisodeList';

/** The site limit when the API predates `shelvePolicy`. The server still enforces its own. */
const DEFAULT_MAX_HOURS = 168;

interface DrawerProps {
  /** Below 1280 px the inspector is a drawer, open only while this is true. */
  open: boolean;
  onClose: () => void;
}

const technicalItems = (e: CpmEventFrame) => [
  { label: 'Episode', value: `EVT-${e.id}` },
  { label: 'Fault family', value: e.family },
  { label: 'Peak diagnosis', value: e.peak_diagnosis },
  { label: 'Latest diagnosis', value: e.last_diagnosis },
  { label: 'Resolution', value: e.window_kind },
  { label: 'Calculation version', value: e.calculation_version },
  { label: 'Dynamics profile', value: e.dynamics_profile_version },
  { label: 'Result revision', value: e.result_revision },
  { label: 'Close reason', value: e.close_reason },
];

const Fields: React.FC<{ event: CpmEventFrame; zoneId: string; now: number }> = ({ event, zoneId, now }) => {
  const acked = isAcknowledged(event);
  const shelf = shelfView(event, now);
  const score = evidenceScore(event.peak_confidence);
  const support = supportText(event.qualified_support_ms);
  const shelfReason = shelf ? event.shelve_reason ?? event.note : null;
  return (
    <>
      <dl className="episode__fields">
        <Field label="Condition" metric="M-123">
          <Badge view={conditionView(event)} />
          {event.close_reason && <span>{phrase(event.close_reason)}</span>}
        </Field>
        <Field label="Availability" metric="M-124"><Badge view={availabilityView(event)} /></Field>
      </dl>
      <p className="ui-meta">{stateLine(event)}</p>
      <dl className="episode__fields">
        <Field label="Severity now" metric="M-028"><BadgeOrDash view={severityView(event)} /></Field>
        <Field label="Peak" metric="M-121"><Badge view={peakView(event)} /></Field>
        <Field label="Peak evidence score" metric="M-066">{score ?? 'Unavailable'}</Field>
        <Field label="Current verdict" metric="M-121"><BadgeOrDash view={verdictView(event)} /></Field>
        <Field label="Acknowledgement" metric="M-125">
          <Badge view={acknowledgementView(event)} />
          {acked && <span>{event.acked_by ?? 'Unknown'} · {siteDateTime(event.acked_at, zoneId)}</span>}
        </Field>
        {event.note && <Field label="Review note">{event.note}</Field>}
        <Field label="Shelf" metric="M-125">
          {shelf
            ? (
              <>
                <Badge view={shelf} />
                <span>
                  {event.shelved_by ?? event.acked_by ?? 'Unknown'} · until {siteDateTime(event.shelve_until, zoneId)} · {shelf.detail}
                </span>
              </>
            )
            : 'Not shelved'}
        </Field>
        {shelfReason && <Field label="Shelf reason">{shelfReason}</Field>}
      </dl>
      <h3 className="episode__heading">Persistence</h3>
      <dl className="episode__fields">
        <Field label="Windows" metric="M-122">{event.window_count}</Field>
        <Field label="Qualified support" metric="M-122">{support ?? NOT_RECORDED}</Field>
      </dl>
    </>
  );
};

const Ready: React.FC<DrawerProps & {
  event: CpmEventFrame;
  offPage: boolean;
  canManage: boolean;
  policy?: CpmShelvePolicy;
  receipt: Receipt | null;
  onReceipt: (r: Receipt) => void;
}> = ({ event, offPage, canManage, policy, receipt, onReceipt, open, onClose }) => {
  const { zone } = useCpaContext();
  const user = useReceiptUser();
  const ack = useAcknowledgeEvent();
  const notes = useEventNotes(event.id);
  const [reviewNote, setReviewNote] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);

  const now = Date.now();
  const acked = isAcknowledged(event);
  const shelf = shelfState(event, now);
  const noteCount = notes.data?.investigations.length ?? 0;
  const closedUnreviewed = !!event.closed_at && !acked;

  const acknowledge = () => ack.mutate({ id: event.id, note: reviewNote || undefined }, {
    onSuccess: () => {
      setReviewNote('');
      onReceipt(receiptDone(`Acknowledged ${byline(user, zone.id)}`, event.id));
    },
    onError: err => onReceipt(failed('Acknowledge', err, event.id)),
  });

  const foot = !acked || receipt ? (
    <div className="episode__foot">
      <EpisodeReceipt receipt={receipt} />
      {!acked && (
        <>
          <TextInput
            label="Review note (optional)"
            placeholder="Why this was acknowledged"
            value={reviewNote}
            onChange={setReviewNote}
            disabled={!canManage}
          />
          {shelf === 'ACTIVE' && <p className="ui-meta">The shelf stays until it expires or is unshelved.</p>}
          {shelf === 'EXPIRED' && <p className="ui-meta">This also clears the returned-from-shelf flag.</p>}
          <Button
            variant="primary"
            disabled={!canManage || ack.isPending}
            reason={canManage ? undefined : NEEDS_MANAGE}
            onClick={acknowledge}
          >
            {ack.isPending ? 'Acknowledging…' : 'Acknowledge'}
          </Button>
        </>
      )}
    </div>
  ) : undefined;

  return (
    <Inspector title={episodeTitle(event)} open={open} onClose={onClose} primaryAction={foot}>
      <div className="episode">
        {/* Mounted before the receipt exists, so a screen reader announces it. */}
        <div className="ui-sr" role="status" aria-live="polite">{receipt?.ok ? receipt.text : ''}</div>
        <div className="episode__identity">
          <p className="episode__ids">EVT-{event.id} · {event.loop_id}</p>
          <p className="ui-meta">
            Opened {siteDateTime(event.opened_at, zone.id)}
            {event.closed_at ? ` · Closed ${siteDateTime(event.closed_at, zone.id)}` : ' · Still open'}
          </p>
          <div className="episode__badges">
            <Badge view={conditionView(event)} />
            <Badge view={acknowledgementView(event)} />
            {shelfView(event, now) && <Badge view={shelfView(event, now)!} />}
          </div>
          {offPage && <p className="ui-meta" role="status">EVT-{event.id} is not on this page of the list.</p>}
        </div>

        <EpisodeActions event={event} canManage={canManage} maxHours={policy?.maxHours ?? DEFAULT_MAX_HOURS} onReceipt={onReceipt} />

        <h3 className="episode__heading">What happened</h3>
        <p className="episode__text">{summaryText(event)}</p>
        {closedUnreviewed && <p className="episode__text">Closed but not acknowledged: this finding is still unreviewed.</p>}

        <Fields event={event} zoneId={zone.id} now={now} />

        <Accordion
          label={noteCount > 0 ? `History · ${noteCount} ${noteCount === 1 ? 'note' : 'notes'}` : 'History'}
          open={historyOpen}
          onToggle={setHistoryOpen}
        >
          {historyOpen && (
            <EpisodeHistory
              event={event}
              notes={notes.data?.investigations ?? []}
              notesError={notes.isError ? notes.error : null}
              zoneId={zone.id}
            />
          )}
        </Accordion>

        <TechnicalDetails items={technicalItems(event)} />
      </div>
    </Inspector>
  );
};

export const EpisodeInspector: React.FC<DrawerProps & {
  selection: EpisodeSelection;
  canManage: boolean;
  policy?: CpmShelvePolicy;
  receipt: Receipt | null;
  onReceipt: (r: Receipt) => void;
  onClearSelection: () => void;
}> = ({ selection, canManage, policy, receipt, onReceipt, onClearSelection, open, onClose }) => {
  if (selection.state === 'ready') {
    return (
      <Ready
        key={selection.event.id}
        event={selection.event}
        offPage={selection.offPage}
        canManage={canManage}
        policy={policy}
        receipt={receipt?.key === selection.event.id ? receipt : null}
        onReceipt={onReceipt}
        open={open}
        onClose={onClose}
      />
    );
  }
  return (
    <Inspector title="Episode" open={open && selection.state !== 'none'} onClose={onClose}>
      {selection.state === 'none' && <DataState kind="empty" title="Select an episode" />}
      {selection.state === 'loading' && <DataState kind="loading" label="Loading the episode" rows={6} />}
      {selection.state === 'error' && <DataState kind="error" error={selection.error} onRetry={selection.retry} />}
      {selection.state === 'missing' && (
        <DataState
          kind="empty"
          title={`Episode ${selection.id} not found`}
          reason="It may have been removed by retention."
          action={<button type="button" className="ui-link" onClick={onClearSelection}>Clear selection</button>}
        />
      )}
    </Inspector>
  );
};
