/**
 * CHG-165 (owner review): two small parts of the System Response tabs. ArraysNote: one note per tab when the run's arrays
 * were not kept (or were removed by retention, or failed verification); it replaces the empty "nothing to draw" panels.
 * The note offers no rebuild: the engine refuses to reconstruct an event-keyed G12 run. CHG-195 (owner review item 19): the note
 * is one plain line, with no retention sentence. ReportedQuantities: the key results the event reported, apart from the model
 * parameters the result row already says, in the standard table (Quantity · Value); the whole catalogue is on Steps & data.
 */
import React from 'react';
import { PanelHead } from '../shared';
import { DataTable, type Column } from '../../../ui/DataTable';
import type { EvidenceManifest } from '../../../api/cpm/evidence';
import type { ResponseQuantity } from '../../../api/cpm/response';
import { keyResults, type KeyResult } from './responseCopy';
import { displayUnit } from './responseSupport';

export type ArraysState = 'NOT_KEPT' | 'EXPIRED' | 'FAILED';

/** Only a run that holds no G12 arrays and is not still receiving them. */
export function arraysState(manifest: EvidenceManifest | undefined): ArraysState | null {
  if (!manifest || manifest.artifacts.some(a => a.gate === 'G12')) return null;
  switch (manifest.readiness) {
    case 'NONE': return 'NOT_KEPT';
    case 'EXPIRED': return 'EXPIRED';
    case 'FAILED': return 'FAILED';
    default: return null;
  }
}

/** CHG-195: what the note says, one plain line each; NOT_FITTED is a censored event on Fit quality. */
const WORDS: Record<ArraysState | 'NOT_FITTED', string> = {
  NOT_KEPT: 'Charts are not available for this event.',
  EXPIRED: 'Charts for this event were removed by retention.',
  FAILED: 'Charts for this event failed verification.',
  NOT_FITTED: 'This event was interrupted before the response finished, so no model was fitted.',
};

export const ArraysNote: React.FC<{ state: ArraysState | 'NOT_FITTED' }> = ({ state }) => (
  <div className="cpm-gate-state cpm-gate-state--note cpm-response-note" role="note">
    <span className="cpm-gate-state__valid">{WORDS[state]}</span>
  </div>
);

const QUANTITY_COLUMNS = (pvUnit?: string | null): Array<Column<KeyResult>> => [
  { key: 'quantity', header: 'Quantity', cell: k => k.label },
  { key: 'value', header: 'Value', cell: k => <span className="cpm-nowrap">{displayUnit(k.text, k.pathId, pvUnit)}</span> },
];

const PARAMETERS = new Set(['process_gain', 'integrating_gain', 'dead_time', 'time_constant', 'time_constant_2', 'damping_ratio', 'natural_frequency']);

export const ReportedQuantities: React.FC<{ metrics: ResponseQuantity[] | undefined; pvUnit?: string | null }> = ({ metrics, pvUnit }) => {
  const all = metrics ?? [];
  const rows = keyResults(all).filter(k => k.applicable && !PARAMETERS.has(k.id));
  const reported = all.filter(q => q.value != null).length;
  return (
    <section className="cpm-surface cpm-response-sub" aria-label="Reported quantities">
      <PanelHead title="Reported quantities" right={<span className="cpm-muted">{reported} of {all.length} reported</span>} />
      {rows.length === 0
        ? <p className="cpm-copy">No other quantity was reported for this event.</p>
        : <DataTable caption="Reported quantities of this event" columns={QUANTITY_COLUMNS(pvUnit)} rows={rows} rowKey={k => k.id} />}
    </section>
  );
};
