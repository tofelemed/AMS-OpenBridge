/**
 * One gate of one loop. Every page opens the same dialog, so a gate reads the same everywhere: its name, its status from
 * `gateMark`, the loop's result and the window. A gate result can differ from the loop's result, so both stay on screen.
 * The page supplies the onward buttons and any extra rows. It sits on the page body, so a sticky band cannot clip it.
 *
 * CHG-191 (owner review 2026-11-14, item 3): no caps tier label; the gate's name is the result column's one heading, the
 * window one line under it. With an `aside` (what the gate asks, its effect, its flags) the dialog is wide, with the
 * result on the left and the aside on the right from 1000 px; one column below that. `GateActions` groups the foot:
 * Prev / Next, then the links to other pages, then the one primary.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../../ui/Dialog';
import { GateBadge } from '../../../ui/GateBadge';
import { gateName } from '../gateStatus';
import { KvRow, fmtDateTime } from '../shared';

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
  /** The window the gate was judged on, one line under its name (`gateWindowLine`). Left out where the page names it. */
  windowLine?: React.ReactNode;
  /** CHG-160 (owner review): the page is about this one loop, so the title is the gate and its check, not the loop. */
  loopInView?: boolean;
  rows?: Array<{ label: string; value: React.ReactNode }>;
  actions: React.ReactNode;
  /** More in the result column, under the rows. */
  children?: React.ReactNode;
  /** The second column: what the gate asks, its effect on the verdict and the flags. It makes the dialog wide. */
  aside?: React.ReactNode;
}> = ({ open, onClose, loop, gate, status, flags, loopResult, windowLine, loopInView, rows, actions, children, aside }) => {
  if (!open) return null;
  const result = (
    <>
      {!loopInView && <h3 className="cpm-panel-title cpm-gate-dialog__heading">{gateName(gate)}</h3>}
      {windowLine != null && <p className="cpm-gate-dialog__window">{windowLine}</p>}
      <KvRow label="Check status"><GateBadge status={status} gate={gate} inputFlags={flags} /></KvRow>
      {loopResult != null && <KvRow label="Loop result">{loopResult}</KvRow>}
      {rows?.map(row => <KvRow key={row.label} label={row.label}>{row.value}</KvRow>)}
      {children}
    </>
  );
  return createPortal(
    <Dialog open onClose={onClose} title={loopInView ? `${gate} · ${gateName(gate)}` : `${loop} · ${gate}`} footer={actions}
      size={aside ? 'wide' : 'default'}>
      {aside
        ? (
          <div className="cpm-gate-dialog__cols">
            <div className="cpm-gate-dialog__col">{result}</div>
            <div className="cpm-gate-dialog__col">{aside}</div>
          </div>
        )
        : result}
    </Dialog>,
    document.body,
  );
};

/** "12h window · <from> → <to>", each time exactly as the app prints it elsewhere (owner Q5: no time change here). */
export const gateWindowLine = (kind: string, start: string | null | undefined, end: string | null | undefined): string =>
  start || end ? `${kind} window · ${fmtDateTime(start)} → ${fmtDateTime(end)}` : `${kind} window`;

/** CHG-156: Prev / Next through the gates in tier order, short labels; the gate each opens is named on hover. */
export const GateSteps: React.FC<{ prev: string | null; next: string | null; onSelect: (gate: string) => void }> = ({ prev, next, onSelect }) => (
  <>
    {prev && <span title={`Previous gate ${prev}`}><ObcButton variant="flat" onClick={() => onSelect(prev)}>Prev</ObcButton></span>}
    {next && <span title={`Next gate ${next}`}><ObcButton variant="flat" onClick={() => onSelect(next)}>Next</ObcButton></span>}
  </>
);

/** CHG-191: the foot in three groups, in this order: Prev / Next together, the "↗" links, then the one primary. */
export const GateActions: React.FC<{ steps: React.ReactNode; links: React.ReactNode; primary: React.ReactNode }> = ({ steps, links, primary }) => (
  <div className="cpm-gate-actions">
    <div className="cpm-gate-actions__steps">{steps}</div>
    <div className="cpm-gate-actions__links">{links}</div>
    <div className="cpm-gate-actions__primary">{primary}</div>
  </div>
);

export default GateDialog;
