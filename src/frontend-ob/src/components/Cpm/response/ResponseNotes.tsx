/**
 * CHG-165 (owner review): two small parts of the System Response tabs. ArraysNote: one note per tab when the run's arrays
 * were not kept (or were removed by retention, or failed verification); it replaces the empty "nothing to draw" panels.
 * CHG-178: the note speaks of charts, says how long they are kept (the events answer's retention) and offers no rebuild:
 * the engine refuses to reconstruct an event-keyed G12 run. ReportedQuantities: the key results the event reported, apart
 * from the model parameters the result row already says; the whole catalogue is on Steps & data.
 */
import React from 'react';
import { KvRow, PanelHead } from '../shared';
import type { EvidenceManifest } from '../../../api/cpm/evidence';
import type { ResponseQuantity, ResponseRetention } from '../../../api/cpm/response';
import { keyResults } from './responseCopy';
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

const WORDS: Record<ArraysState, string> = {
  NOT_KEPT: 'Charts not kept',
  EXPIRED: 'Charts removed by retention',
  FAILED: 'Charts failed verification',
};

const days = (n: number | null): string => n == null ? 'for ever' : `${n} ${n === 1 ? 'day' : 'days'}`;

/** How long charts are kept, or that this event has none, from the events answer's retention (absent on older servers). */
function keptLine(retention: ResponseRetention | undefined): string {
  if (!retention) return 'Charts are not stored for this event and cannot be rebuilt.';
  return `Charts are kept ${days(retention.acceptedDays)} for accepted events and ${retention.censoredChartHours} h for censored candidates; they cannot be rebuilt.`;
}

export const ArraysNote: React.FC<{ state: ArraysState; retention?: ResponseRetention }> = ({ state, retention }) => (
  <div className="cpm-gate-state cpm-gate-state--note cpm-response-note" role="note">
    <h3>{WORDS[state]}</h3>
    <span className="cpm-gate-state__valid">The result and every value stand. {keptLine(retention)}</span>
  </div>
);

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
        : <div className="cpm-response-quantities cpm-response-quantities--three">{rows.map(k => <KvRow key={k.id} label={k.label}>{displayUnit(k.text, k.pathId, pvUnit)}</KvRow>)}</div>}
    </section>
  );
};
