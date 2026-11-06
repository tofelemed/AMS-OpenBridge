/**
 * CHG-136: one fast condition (a G10 limit dwell or a G11 freeze, detected within a minute) beside the list, with
 * the two ways on: Review at the loop's short windows, and the Window Inspector for the same windows.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { KvRow, PanelHead, TonePill } from '../shared';
import { investigationHref, windowsHref } from '../cpaHref';
import type { ConditionRow } from './ConditionsPanel';

/** The fast conditions are judged on the 15 minute windows. */
const FAST_WINDOW = '15m';

export const ConditionDetail: React.FC<{ row: ConditionRow }> = ({ row }) => {
  const navigate = useNavigate();
  return (
    <aside className="cpm-surface cpm-panel-enter" aria-label={`Condition ${row.loopId} ${row.gateLabel}`}>
      <PanelHead title={`${row.loopId} · ${row.gateLabel} ${row.label}`}
        right={<TonePill tone={row.open && !row.stale ? 'warn' : 'muted'}>{row.state}</TonePill>} />
      <div className="cpm-episode-review">
        <ObcButton variant="raised" onClick={() => navigate(investigationHref(row.loopId, { kind: FAST_WINDOW }))}>
          {`Review ${row.loopId} →`}
        </ObcButton>
      </div>
      <KvRow label="Condition"><span className="cpm-mono">{row.gateLabel}</span> {row.label}</KvRow>
      <KvRow label="Started"><span title={row.startedAt}>{row.since}</span></KvRow>
      <KvRow label="Duration">{row.duration}</KvRow>
      <KvRow label="Last update">{row.lastUpdate}</KvRow>
      {row.stale && <p className="cpm-field__error" role="status">Open on record but not updated — the engine restarted or the loop&apos;s samples stopped.</p>}
      {row.reason && <KvRow label="Close reason">{row.reason}</KvRow>}
      <div className="cpm-inspector__actions">
        <ObcButton variant="flat" onClick={() => navigate(windowsHref(row.loopId, { profile: FAST_WINDOW }))}>Window Inspector ↗</ObcButton>
      </div>
    </aside>
  );
};

export default ConditionDetail;
