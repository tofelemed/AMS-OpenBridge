/**
 * SME review #7 (CHG-045): the Overview priority queue. The server orders it
 * (orderBy=priority: criticality × severity level, then control impact, then
 * persistence, then evidence score); each row states that reason in one line, so
 * two loops with the same evidence score no longer look interchangeable.
 *
 * Shelved loops are not in the list (ISA-18.2: removed from the active list, shown
 * in their own list) — the panel names how many and opens them in Loop Events.
 * Acknowledged loops stay, marked.
 *
 * Two controls per row, two jobs (unchanged): the loop id opens the loop (a route);
 * the description previews it in the focus panel (a selection). Siblings, never a
 * button inside a button.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmRankedLoop } from '../../../api/cpmApi';
import { EmptyState, PanelHead, QueryError, TonePill, toneFor } from '../shared';
import { conditionOf } from '../explorer/summary/summaryText';
import GoodErrorBar from './GoodErrorBar';
import FacetPill from '../FacetPill';
import { PRIORITY_RULE, priorityBadge, priorityReasons } from './priorityReason';

const QUEUE_SIZE = 6;

export const PriorityQueue: React.FC<{
  loops: CpmRankedLoop[];
  loading: boolean;
  error: unknown;
  retry: () => void;
  shelvedCount: number;
  selectedId: string | undefined;
  onPreview: (loopId: string) => void;
  onOpenLoop: (loopId: string) => void;
  onViewAll: () => void;
  onShelved: () => void;
}> = ({ loops, loading, error, retry, shelvedCount, selectedId, onPreview, onOpenLoop, onViewAll, onShelved }) => (
  <section className="cpm-surface">
    <PanelHead eyebrow="Priority queue" title="Loops requiring review"
      right={
        <>
          {shelvedCount > 0 && (
            <ObcButton variant="flat" title="Shelved loops are left out of the queue; review them in Loop Events"
              onClick={onShelved}>
              {shelvedCount} shelved ›
            </ObcButton>
          )}
          <ObcButton variant="normal" onClick={onViewAll}>View all ›</ObcButton>
        </>
      } />
    <p className="cpm-queue-rule">{PRIORITY_RULE}</p>
    {loading && <EmptyState title="Loading…" />}
    {error != null && <QueryError title="Priority queue unavailable" error={error} retry={retry} />}
    {!loading && error == null && loops.length === 0 && (
      <EmptyState title="No current findings"
        copy={shelvedCount > 0
          ? `Every current finding is shelved (${shelvedCount}). Shelved loops are reviewed in Loop Events.`
          : 'No loop has a current confirmed or suspected finding. The operating picture above shows the rest of the fleet.'} />
    )}
    {loops.slice(0, QUEUE_SIZE).map(l => {
      const isSelected = selectedId === l.loopId;
      const badge = priorityBadge(l.priority);
      return (
        <div key={l.loopId}
          className={`cpm-event-row cpm-queue-row cpm-queue-row--${badge.tone}${isSelected ? ' cpm-event-row--selected' : ''}`}>
          <div className="cpm-queue-row__head">
            <TonePill tone={badge.tone}>{badge.label}</TonePill>
            <ObcButton variant="flat" className="cpm-queue-row__loop"
              title={`Open ${l.loopId} in the Loop Explorer`}
              onClick={() => onOpenLoop(l.loopId)}>
              {l.loopId} ›
            </ObcButton>
            <span className="cpm-queue-row__diag">
              {l.ackState === 'ACKNOWLEDGED' && <TonePill tone="muted">Acknowledged</TonePill>}
              <FacetPill facet="diagnosis" tone={toneFor(l.diagnosis)}>{conditionOf(l.diagnosis).label}</FacetPill>
            </span>
          </div>
          <button type="button" className="cpm-queue-row__preview"
            aria-pressed={isSelected}
            aria-label={`Preview ${l.loopId} in the focus panel`}
            onClick={() => onPreview(l.loopId)}>
            <span className="cpm-event-row__sub">{l.displayName} · {l.area ?? l.site}</span>
            <span className="cpm-queue-row__reason">
              <span className="cpm-queue-row__why">{priorityReasons(l, Date.now(), { impact: false }).join(' · ')}</span>
              <GoodErrorBar pct={l.metrics.goodErrorPct} mae={l.metrics.mae} />
            </span>
          </button>
        </div>
      );
    })}
  </section>
);

export default PriorityQueue;
