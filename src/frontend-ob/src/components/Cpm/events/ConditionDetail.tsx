/**
 * CHG-136: one fast condition (a G10 limit dwell or a G11 freeze, detected within a minute) beside the list. CHG-167 (owner
 * review, the approved sample and answers 2 and 4): the heading is the condition with its state; Gate, Started, Duration,
 * Last update (with "not updated for 10 min or more" when stale; the cause is in How to read) and the close reason; then
 * Workbench ↗ and Window Inspector ↗ at the 15m windows. The loop is named once, in the foot, beside Loop Explorer → (the
 * Loop Explorer Summary at the condition's gate; it was "Review TIC20607 →"). Below 1280 px the panel is a drawer.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Inspector } from '../../../ui/Inspector';
import { KvRow, TonePill } from '../shared';
import { evidenceHref, explorerHref, windowsHref } from '../cpaHref';
import { conditionBadge, type ConditionRow } from './conditionRows';

/** The fast conditions are judged on the 15 minute windows. */
const FAST_WINDOW = '15m';

export const ConditionDetail: React.FC<{ row: ConditionRow; open: boolean; onClose: () => void }> = ({ row, open, onClose }) => {
  const navigate = useNavigate();
  const badge = conditionBadge(row);
  return (
    <Inspector title={row.label} open={open} onClose={onClose}
      meta={<TonePill tone={badge.tone} glyph={badge.glyph}>{badge.label}</TonePill>}
      primaryAction={
        <div className="cpm-events-foot">
          <span className="cpm-events-foot__id"><strong>{row.loopId}</strong>{row.description ? ` · ${row.description}` : ''}</span>
          <ObcButton variant="raised" onClick={() => navigate(explorerHref(row.loopId, { tab: 'Summary', gate: row.gateLabel }))}>
            Loop Explorer {'→'}
          </ObcButton>
        </div>
      }>
      <KvRow label="Gate">{row.gateTitle}</KvRow>
      <KvRow label="Started">{row.started}</KvRow>
      <KvRow label="Duration">{row.duration}</KvRow>
      <KvRow label="Last update">
        {row.last}
        {row.stale && <span className="cpm-event-row__sub cpm-episodes__line">not updated for 10 min or more</span>}
      </KvRow>
      {row.reason && <KvRow label="Close reason">{row.reason}</KvRow>}
      <div className="cpm-events-links">
        <ObcButton variant="flat" onClick={() => navigate(evidenceHref(row.loopId, { kind: FAST_WINDOW }))}>Workbench {'↗'}</ObcButton>
        <ObcButton variant="flat" onClick={() => navigate(windowsHref(row.loopId, { profile: FAST_WINDOW }))}>Window Inspector {'↗'}</ObcButton>
      </div>
    </Inspector>
  );
};

export default ConditionDetail;
