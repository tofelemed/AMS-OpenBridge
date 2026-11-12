/**
 * SME review #7 (CHG-045): the Overview priority queue. The server orders it
 * (orderBy=priority: criticality × severity level, then control impact, then
 * persistence, then evidence score); each row's ? states that reason, so two
 * loops with the same evidence score no longer look interchangeable.
 *
 * Shelved loops are not in the list (ISA-18.2: removed from the active list, shown
 * in their own list, Loop Events). Acknowledged loops stay, marked.
 *
 * Two controls per row, two jobs (unchanged): the loop id opens the loop (a route);
 * the preview button selects it for the chosen-loop panel. Siblings, never a
 * button inside a button.
 *
 * CHG-177 (owner review, Overview v2, the approved sample and the answers of 12 Nov 2026): one line per row on one column grid
 * — priority, tag →, ✓ Acknowledged (or an expired shelf back in the queue) as on Loop Events, the diagnosis, the in-band bar
 * with its %, the row's ? — with "Priority / Loop / Diagnosis / In band" said once in a heading line above the rows (on a
 * phone the heading hides and the words come back on the row); the loop's name and section went. Empty, the queue is one
 * line. The head's "n shelved ↗" went (owner: "remove shelve link"); View all → is a flat link; the order rule moved from
 * the title's ? into How to read.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmRankedLoop } from '../../../api/cpmApi';
import { QueryError, TonePill, toneFor } from '../shared';
import { Toggletip } from '../../../ui/Toggletip';
import { conditionOf } from '../explorer/summary/summaryText';
import GoodErrorBar from './GoodErrorBar';
import FacetPill from '../FacetPill';
import { priorityBadge, priorityReasons } from './priorityReason';
import { reviewView, reviewWord } from '../events/shelfState';
import { investigationHref } from '../cpaHref';

const QUEUE_SIZE = 6;

/**
 * What the operator has done, in Loop Events' words (CHG-167): ✓ Acknowledged; a SHELVED row here is a shelf that ran out
 * (the server leaves active shelves out). Nothing for an unacknowledged loop: the queue is the unreviewed list.
 */
function rowState(ackState: CpmRankedLoop['ackState']) {
  if (ackState === 'ACKNOWLEDGED') return reviewWord({ ack_state: 'ACKNOWLEDGED' });
  if (ackState === 'SHELVED') return reviewView({ ack_state: 'SHELVED', shelve_until: null } as Parameters<typeof reviewView>[0], Date.now());
  return null;
}

export const PriorityQueue: React.FC<{
  loops: CpmRankedLoop[];
  loading: boolean;
  error: unknown;
  retry: () => void;
  shelvedCount: number;
  selectedId: string | undefined;
  onPreview: (loopId: string) => void;
  windowKind?: string;
  onViewAll: () => void;
}> = ({ loops, loading, error, retry, shelvedCount, selectedId, onPreview, windowKind, onViewAll }) => {
  const navigate = useNavigate();
  const rows = loading || error != null ? [] : loops.slice(0, QUEUE_SIZE);
  const state = loading ? 'Loading…'
    : error != null || rows.length > 0 ? null
      : shelvedCount > 0 ? 'Every current finding is shelved' : 'No current findings';
  return (
    <section className={`cpm-surface cpm-ov-queue${rows.length === 0 ? ' cpm-ov-queue--line' : ''}`} aria-label="Loops requiring review">
      <div className="cpm-panel-head cpm-ov-head">
        <div className="cpm-title-row">
          <h2 className="cpm-panel-title">Loops requiring review</h2>
          {state && <span className="cpm-ov-head__state" role="status">{state}</span>}
        </div>
        <div className="cpm-panel-head__right">
          <ObcButton variant="flat" onClick={onViewAll}>View all →</ObcButton>
        </div>
      </div>
      {error != null && <QueryError title="Priority queue unavailable" error={error} retry={retry} />}
      {rows.length > 0 && (
        // One grid for the heading line and the rows (each a subgrid), so every column fits its widest entry and lines up.
        <div className="cpm-ov-queue__list">
          <div className="cpm-event-head cpm-ov-queue__grid" aria-hidden="true">
            <span>Priority</span><span>Loop</span><span>Diagnosis</span><span>In band</span><span />
          </div>
          {rows.map(l => {
            const isSelected = selectedId === l.loopId;
            const badge = priorityBadge(l.priority);
            const done = rowState(l.ackState);
            return (
              // CHG-100: the whole row previews the loop (pointer); the preview button stays the keyboard control
              <div key={l.loopId} onClick={() => onPreview(l.loopId)}
                className={`cpm-event-row cpm-event-row--dense cpm-queue-row cpm-ov-queue__grid cpm-row-click${isSelected ? ' cpm-event-row--selected' : ''}`}>
                <span>
                  <TonePill tone={badge.tone}>
                    {badge.level}{badge.label !== badge.level && <span className="cpm-ov-word"> priority</span>}
                  </TonePill>
                </span>
                <span onClick={ev => ev.stopPropagation()}>
                  <ObcButton variant="flat" className="cpm-queue-row__loop"
                    title={`Review ${l.loopId} in Investigation`} aria-label={`Review ${l.loopId}`}
                    onClick={() => navigate(investigationHref(l.loopId, { kind: windowKind }))}>
                    {l.loopId} →
                  </ObcButton>
                </span>
                <span className="cpm-ov-queue__dx">
                  {done && <TonePill tone={done.tone} glyph={done.glyph}>{done.label}</TonePill>}
                  <FacetPill facet="diagnosis" tone={toneFor(l.diagnosis)}>{conditionOf(l.diagnosis).label}</FacetPill>
                </span>
                <button type="button" className="cpm-queue-row__preview" aria-pressed={isSelected}
                  onClick={ev => { ev.stopPropagation(); onPreview(l.loopId); }}>
                  <span className="ui-sr">Preview {l.loopId}: </span>
                  <GoodErrorBar pct={l.metrics.goodErrorPct} mae={l.metrics.mae} />
                </button>
                <span className="cpm-ov-queue__why">
                  <Toggletip variant="how-to" label={`Why ${l.loopId} is here`}>
                    <p>{priorityReasons(l, Date.now(), { impact: false }).join(' · ')}</p>
                  </Toggletip>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default PriorityQueue;
