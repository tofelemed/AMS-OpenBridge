/** Task 6: the top-priority finding, the whole card one link to Investigation (the queue's head is the top finding). */
import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import type { CpmRankedLoop } from '../../../api/cpmApi';
import { PanelHead, TonePill } from '../shared';
import { conditionOf } from '../explorer/summary/summaryText';
import { investigationHref } from '../cpaHref';
import { priorityBadge } from './priorityReason';

export const TopFinding: React.FC<{ finding: CpmRankedLoop | undefined; windowKind?: string }> = ({ finding, windowKind }) => (
  <section className="cpm-surface">
    <PanelHead title="Top-priority finding" />
    {finding ? (
      <RouterLink className="cpm-topfinding" to={investigationHref(finding.loopId, { kind: windowKind })}>
        <span className="cpm-topfinding__what">{finding.loopId} · {conditionOf(finding.diagnosis).label}</span>
        <span className="cpm-event-row__sub">{finding.displayName}</span>
        <TonePill tone={priorityBadge(finding.priority).tone}>{priorityBadge(finding.priority).label}</TonePill>
        <span className="cpm-topfinding__go" aria-hidden="true">→</span>
      </RouterLink>
    ) : (
      <p className="cpm-copy">No loop has a current finding. Verdicts appear once a loop completes an evaluation window.</p>
    )}
  </section>
);

export default TopFinding;
