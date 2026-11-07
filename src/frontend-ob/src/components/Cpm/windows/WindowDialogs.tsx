/**
 * Task 19: the three dialogs behind the selected window's links. Feature flags names the six short-tier
 * flags (it replaced the unexplained string of ticks), Record details holds the metric values, Engine & timing
 * the contract the window ran under. Each sits on the page body through a portal.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmKpiRow, CpmLoop, CpmWindowSpec } from '../../../api/cpmApi';
import { Dialog } from '../../../ui/Dialog';
import { GateBadge } from '../../../ui/GateBadge';
import { Toggletip } from '../../../ui/Toggletip';
import { KvRow, fmtDuration, fmtWindowShape, loopTrendHref } from '../shared';
import { gateName } from '../gateStatus';
import { fmtInstant } from '../context/LoopContextBar';
import { historicalHref } from '../cpaHref';
import { SHORT_GATES, WindowResults } from './WindowResults';

interface DialogProps { open: boolean; onClose: () => void }

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

export const FeatureFlagsDialog: React.FC<DialogProps & { row: CpmKpiRow; declined: boolean }> = ({ open, onClose, row, declined }) => {
  if (!open) return null;
  return createPortal(
    <Dialog open onClose={onClose} title="Feature flags" footer={<Close onClose={onClose} />}>
      {SHORT_GATES.map(g => (
        <div key={g.key} className="cpm-kv" data-flag={g.key}>
          <span className="cpm-kv__label"><strong>{g.key}</strong> {gateName(g.key)}</span>
          <span className="cpm-kv__value"><GateBadge status={flagStatus(row, g.key, g.field, declined)} gate={g.key} /></span>
        </div>
      ))}
    </Dialog>, document.body);
};

export const RecordDetailsDialog: React.FC<DialogProps & {
  row: CpmKpiRow; loopId: string; loop: CpmLoop | undefined; tier: 'short' | 'long'; timeZone: string;
}> = ({ open, onClose, row, loopId, loop, tier, timeZone }) => {
  const navigate = useNavigate();
  if (!open) return null;
  const range = { from: row.window_start, to: row.window_end };
  // /trend reads the pens from `tags`, so the link is built from the loop's tags, pinned to the window.
  const trend = loop && row.window_start && row.window_end
    ? loopTrendHref(loop.tags, '8h', { from: new Date(row.window_start), to: new Date(row.window_end) }) : null;
  const go = (href: string) => { onClose(); navigate(href); };
  return createPortal(
    <Dialog open onClose={onClose} title="Record details" size="wide" footer={<>
      <ObcButton variant="flat" onClick={() => go(historicalHref(loopId, { ...range, window: row.window_end }))}>Open range in Historical {'↗'}</ObcButton>
      {trend && <ObcButton variant="flat" onClick={() => go(trend)}>Open in Trend {'↗'}</ObcButton>}
      <Close onClose={onClose} />
    </>}>
      <KvRow label="Window">{fmtInstant(row.window_start, timeZone)} {'→'} {fmtInstant(row.window_end, timeZone)}</KvRow>
      <WindowResults row={row} tier={tier} />
    </Dialog>, document.body);
};

export const EngineTimingDialog: React.FC<DialogProps & { spec: CpmWindowSpec | undefined; kind: string }> = ({ open, onClose, spec, kind }) => {
  if (!open) return null;
  const lateness = spec?.allowedLatenessMs != null
    ? `${fmtDuration(spec.allowedLatenessMs)} (event-time)`
    : spec?.cadenceMs != null ? `Not applicable: recomputed every ${fmtDuration(spec.cadenceMs)} from a retained buffer` : '—';
  return createPortal(
    <Dialog open onClose={onClose} title="Engine & timing" footer={<Close onClose={onClose} />}>
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
