/**
 * CHG-165 (owner review): two small parts of the System Response tabs. ArraysNote: one note per tab when the run's arrays
 * were not kept (or were removed by retention, or failed verification), with the way to rebuild them; it replaces the empty
 * "nothing to draw" panels. ReportedQuantities: the key results the event reported, apart from the model parameters the
 * result row already says; the whole catalogue is on Steps & data.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { KvRow, PanelHead } from '../shared';
import type { EvidenceManifest } from '../../../api/cpm/evidence';
import type { ResponseQuantity } from '../../../api/cpm/response';
import { workbenchHref } from '../evidence/selection';
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
  NOT_KEPT: 'Arrays not kept for this run',
  EXPIRED: 'Arrays removed by retention',
  FAILED: 'Arrays failed verification',
};

export const ArraysNote: React.FC<{ state: ArraysState; loopId: string; methodRunId: string | undefined }> = ({ state, loopId, methodRunId }) => {
  const navigate = useNavigate();
  return (
    <div className="cpm-gate-state cpm-gate-state--note cpm-response-note" role="note">
      <h3>{WORDS[state]}</h3>
      <span className="cpm-gate-state__valid">The result and every value stand.</span>
      {methodRunId && (
        <ObcButton variant="flat" onClick={() => navigate(workbenchHref(loopId, methodRunId, 'G12'))}>Reconstruct in the Workbench ↗</ObcButton>
      )}
    </div>
  );
};

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
