/**
 * CHG-167 (owner review, the approved sample): the fast conditions as the episode list reads, one grid for the head and every
 * row: State (tone + glyph + word), Loop (the tag over what the loop is), Condition (the kind over its gate), Started · UTC,
 * Duration, Close reason. A row only selects; the Workbench and the Window Inspector are in the panel.
 */
import React from 'react';
import { TonePill } from '../shared';
import { conditionBadge, type ConditionRow } from './conditionRows';
import { zoneTag } from './eventTime';

export const ConditionList: React.FC<{
  rows: ConditionRow[];
  selectedKey: string | undefined;
  onSelect: (key: string) => void;
  /** Loading, error and empty notices, above the rows. */
  notices?: React.ReactNode;
}> = ({ rows, selectedKey, onSelect, notices }) => (
  <>
    <div className="cpm-event-head cpm-conditions-grid cpm-table-head--sticky">
      <span>State</span>
      <span>Loop</span>
      <span>Condition</span>
      <span>Started · {zoneTag()}</span>
      <span>Duration</span>
      <span>Close reason</span>
    </div>
    {notices}
    <div role="list" aria-label="Fast conditions">
      {rows.map(r => {
        const badge = conditionBadge(r);
        const selected = r.key === selectedKey;
        return (
          <div key={r.key} role="listitem" data-open={r.open} data-stale={r.stale || undefined}
            className={`cpm-event-row cpm-conditions-grid cpm-event-row--dense cpm-row-click${selected ? ' cpm-event-row--selected' : ''}`}
            aria-current={selected ? 'true' : undefined} onClick={() => onSelect(r.key)}>
            <span><TonePill tone={badge.tone} glyph={badge.glyph}>{badge.label}</TonePill></span>
            <button type="button" className="cpm-event-row__select" aria-pressed={selected} onClick={() => onSelect(r.key)}>
              <span className="cpm-event-row__title cpm-episodes__line">{r.loopId}</span>
              {r.description && <span className="cpm-event-row__sub cpm-episodes__line">{r.description}</span>}
            </button>
            <span>
              <span className="cpm-episodes__line">{r.label}</span>
              <span className="cpm-event-row__sub cpm-episodes__line">{r.gateTitle}</span>
            </span>
            <span className="cpm-event-row__sub">{r.started}</span>
            <span>{r.duration}</span>
            <span>{r.reason || '—'}</span>
          </div>
        );
      })}
    </div>
  </>
);

export default ConditionList;
