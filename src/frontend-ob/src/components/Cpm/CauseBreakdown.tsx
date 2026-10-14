/**
 * SME review #19 (CHG-055): observed symptoms, possible causes, causes ruled out, causes not assessed —
 * four rows, so a confirmed SYMPTOM never reads as a confirmed CAUSE.
 */
import React from 'react';
import type { CpmVerdictV2 } from '../../api/cpm/verdict';
import { causeBreakdown, type CauseItem } from './causeAnalysis';
import type { InputContext } from './optionalInputs';

const List: React.FC<{ items: CauseItem[]; empty: string }> = ({ items, empty }) =>
  items.length === 0 ? <span className="cpm-metric-na">{empty}</span> : (
    <ul className="cpm-cause-list">
      {items.map(i => (
        <li key={i.id}><strong>{i.label}</strong>{i.detail ? <span className="cpm-cause-list__detail"> — {i.detail}</span> : null}</li>
      ))}
    </ul>
  );

const Group: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <><dt className="cpm-cause__label">{label}</dt><dd className="cpm-cause__items">{children}</dd></>
);

export const CauseBreakdownRows: React.FC<{ verdict: CpmVerdictV2 | undefined | null; flags?: string[]; inputs?: InputContext;
  /** CHG-064: the window's gate results, so observations cite only gates that fired. */
  cells?: ReadonlyArray<{ key: string; status: string | null }> }> = ({ verdict, flags, inputs, cells }) => {
  const b = causeBreakdown(verdict, flags, inputs, cells);
  if (!b) return null;
  return (
    <dl className="cpm-cause" data-testid="cause-breakdown">
      <Group label="Observed"><List items={b.observed} empty="no symptom present" /></Group>
      <Group label="Possible cause">
        <List items={b.possible.map(p => ({ ...p, label: `${p.label}${p.leading ? ' (leading)' : ''}` }))} empty="no mechanism qualified" />
      </Group>
      {/* SME review 2 #7 (CHG-092): evidence against a cause is not the same fact as a cause that could not be assessed */}
      {b.ruledOut.length > 0 && <Group label="Evidence against"><List items={b.ruledOut} empty="" /></Group>}
      {b.notAssessed.length > 0 && <Group label="Not assessed — input missing"><List items={b.notAssessed} empty="" /></Group>}
      {b.notSeen.length > 0 && <Group label="Not seen in this window"><List items={b.notSeen} empty="" /></Group>}
    </dl>
  );
};

export default CauseBreakdownRows;
