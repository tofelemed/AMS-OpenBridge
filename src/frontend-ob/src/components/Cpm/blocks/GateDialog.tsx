/**
 * One gate of one loop. Every page opens the same dialog, so a gate reads the same everywhere: its tier and
 * name, its status from `gateMark`, the loop's result and the window. A gate result can differ from the loop's
 * result, so both stay on screen. The page supplies the onward buttons and any extra rows. It sits on the page
 * body, so a sticky band cannot clip it.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../../ui/Dialog';
import { GateBadge } from '../../../ui/GateBadge';
import { TIER_GROUPS, gateName } from '../gateStatus';
import { KvRow } from '../shared';

export const GateDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  loop: string;
  gate: string;
  status: string | null | undefined;
  /** The window's input flags: a pass judged without one of them says so. */
  flags?: readonly string[] | null;
  /** Left out where the page already shows the loop's result (CHG-160). */
  loopResult?: React.ReactNode;
  /** Left out where the page already names the window (CHG-160). */
  assessment?: React.ReactNode;
  /** CHG-160 (owner review): the page is about this one loop, so the title is the gate and its check, not the loop. */
  loopInView?: boolean;
  rows?: Array<{ label: string; value: React.ReactNode }>;
  actions: React.ReactNode;
  /** More under the rows, such as a disclosure of the rest of the evidence. */
  children?: React.ReactNode;
}> = ({ open, onClose, loop, gate, status, flags, loopResult, assessment, loopInView, rows, actions, children }) => {
  if (!open) return null;
  const tier = TIER_GROUPS.find(t => t.keys.includes(gate))?.label;
  return createPortal(
    <Dialog open onClose={onClose} title={loopInView ? `${gate} · ${gateName(gate)}` : `${loop} · ${gate}`} footer={actions}>
      {tier && <span className="cpm-eyebrow">{tier}</span>}
      {!loopInView && <p className="cpm-gate-dialog__name">{gateName(gate)}</p>}
      <KvRow label="Check status"><GateBadge status={status} gate={gate} inputFlags={flags} /></KvRow>
      {loopResult != null && <KvRow label="Loop result">{loopResult}</KvRow>}
      {assessment != null && <KvRow label="Assessment">{assessment}</KvRow>}
      {rows?.map(row => <KvRow key={row.label} label={row.label}>{row.value}</KvRow>)}
      {children}
    </Dialog>,
    document.body,
  );
};

/** CHG-156: Prev / Next through the gates in tier order, short labels; the gate each opens is named on hover. */
export const GateSteps: React.FC<{ prev: string | null; next: string | null; onSelect: (gate: string) => void }> = ({ prev, next, onSelect }) => (
  <>
    {prev && <span title={`Previous gate ${prev}`}><ObcButton variant="flat" onClick={() => onSelect(prev)}>Prev</ObcButton></span>}
    {next && <span title={`Next gate ${next}`}><ObcButton variant="flat" onClick={() => onSelect(next)}>Next</ObcButton></span>}
  </>
);

export default GateDialog;
