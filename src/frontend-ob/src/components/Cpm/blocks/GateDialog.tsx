/**
 * One gate of one loop. Every page opens the same dialog, so a gate reads the same everywhere: its tier and
 * name, its status from `gateMark`, the loop's result and the window. A gate result can differ from the loop's
 * result, so both stay on screen. The page supplies the onward buttons and any extra rows. It sits on the page
 * body, so a sticky band cannot clip it.
 */
import React from 'react';
import { createPortal } from 'react-dom';
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
  loopResult: React.ReactNode;
  assessment: React.ReactNode;
  rows?: Array<{ label: string; value: React.ReactNode }>;
  actions: React.ReactNode;
}> = ({ open, onClose, loop, gate, status, flags, loopResult, assessment, rows, actions }) => {
  if (!open) return null;
  const tier = TIER_GROUPS.find(t => t.keys.includes(gate))?.label;
  return createPortal(
    <Dialog open onClose={onClose} title={`${loop} · ${gate}`} footer={actions}>
      {tier && <span className="cpm-eyebrow">{tier}</span>}
      <p className="cpm-gate-dialog__name">{gateName(gate)}</p>
      <KvRow label="Check status"><GateBadge status={status} gate={gate} inputFlags={flags} /></KvRow>
      <KvRow label="Loop result">{loopResult}</KvRow>
      <KvRow label="Assessment">{assessment}</KvRow>
      {rows?.map(row => <KvRow key={row.label} label={row.label}>{row.value}</KvRow>)}
    </Dialog>,
    document.body,
  );
};

export default GateDialog;
