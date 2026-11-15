/**
 * Task 19: the dialogs behind the selected window's links. Feature flags names the six short-tier flags (it replaced the
 * unexplained string of ticks), Engine & timing the contract the window ran under. Each sits on the page body through a portal.
 * CHG-184 (owner review Q6): Record details (the metric values) went. CHG-192 (owner review item 16): the loop and the window
 * size under each title.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmKpiRow, CpmWindowSpec } from '../../../api/cpmApi';
import { Dialog } from '../../../ui/Dialog';
import { GateBadge } from '../../../ui/GateBadge';
import { Toggletip } from '../../../ui/Toggletip';
import { KvRow, fmtDuration, fmtWindowShape } from '../shared';
import { gateName } from '../gateStatus';
import { SHORT_GATES } from './WindowResults';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** CHG-192: the loop and the window size, under the title. */
  subtitle?: string;
}

const Close: React.FC<{ onClose: () => void }> = ({ onClose }) => <ObcButton variant="flat" onClick={onClose}>Close</ObcButton>;

/**
 * G2r defaults to PASS on a declined window (CplmShortFeatureResult): nothing was evaluated, so it says so rather than show a lone
 * tick. G1, G2, G3 and G4 default to PENDING there, which already reads Pending.
 */
export const flagStatus = (row: CpmKpiRow, key: string, field: string, declined: boolean): string | null => {
  if (declined && key === 'G2r') return 'NOT_EVALUATED';
  const v = row[field];
  return typeof v === 'string' ? v : null;
};

export const FeatureFlagsDialog: React.FC<DialogProps & { row: CpmKpiRow; declined: boolean }> = ({ open, onClose, subtitle, row, declined }) => {
  if (!open) return null;
  return createPortal(
    <Dialog open onClose={onClose} title="Feature flags" subtitle={subtitle} footer={<Close onClose={onClose} />}>
      {SHORT_GATES.map(g => (
        <div key={g.key} className="cpm-kv" data-flag={g.key}>
          <span className="cpm-kv__label"><strong>{g.key}</strong> {gateName(g.key)}</span>
          <span className="cpm-kv__value"><GateBadge status={flagStatus(row, g.key, g.field, declined)} gate={g.key} /></span>
        </div>
      ))}
    </Dialog>, document.body);
};

export const EngineTimingDialog: React.FC<DialogProps & { spec: CpmWindowSpec | undefined; kind: string }> = ({ open, onClose, subtitle, spec, kind }) => {
  if (!open) return null;
  const lateness = spec?.allowedLatenessMs != null
    ? `${fmtDuration(spec.allowedLatenessMs)} (event-time)`
    : spec?.cadenceMs != null ? `Not applicable: recomputed every ${fmtDuration(spec.cadenceMs)} from a retained buffer` : '—';
  return createPortal(
    <Dialog open onClose={onClose} title="Engine & timing" subtitle={subtitle} footer={<Close onClose={onClose} />}>
      <KvRow label="Window">{kind}</KvRow>
      <KvRow label="Size / slide">{spec ? `${fmtWindowShape(spec)}${spec.overlapping ? ', overlapping' : ', no overlap'}` : '—'}</KvRow>
      <KvRow label="Allowed lateness">{lateness}</KvRow>
      {spec?.minSamples != null && <KvRow label="Minimum samples">{spec.minSamples}: a slice below this is not emitted</KvRow>}
      {spec && (
        <KvRow label="At each boundary">
            <Toggletip variant="how-to" label="At each boundary">
              <p><strong>On open.</strong> {spec.assigner === 'sliding'
                ? `Overlaps the previous window by ${fmtDuration(spec.sizeMs - (spec.slideMs ?? 0))}: samples are shared, not dropped.`
                : spec.assigner === 'rolling-buffer' ? 'No open or close: a slice is taken from the retained buffer.'
                  : 'All prior samples are dropped (tumbling).'}</p>
              <p><strong>While open.</strong> Samples accumulate at the loop's publish rate.</p>
              <p><strong>On close.</strong> {spec.cadenceMs != null
                ? `An event-time timer fires every ${fmtDuration(spec.cadenceMs)}.`
                : spec.allowedLatenessMs != null
                  ? `The watermark passes the window end, then ${fmtDuration(spec.allowedLatenessMs)} of lateness is still accepted.`
                  : 'The watermark passes the window end.'}{' '}
                {spec.minSamples != null ? `One result if at least ${spec.minSamples} samples, else nothing.` : 'One result is emitted, nothing retained.'}</p>
            </Toggletip>
        </KvRow>
      )}
    </Dialog>, document.body);
};
