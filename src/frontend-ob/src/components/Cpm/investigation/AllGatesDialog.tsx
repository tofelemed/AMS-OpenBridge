/**
 * CHG-141: all 17 gate results of this window under their tiers. A gate opens its Calculation proof. `GateTierRow` keeps a
 * gate the tiers do not know under Other, so nothing the service sends is dropped.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import { Dialog } from '../../../ui/Dialog';
import { GateBadge } from '../../../ui/GateBadge';
import GateTierRow from '../blocks/GateTierRow';
import { gateName } from '../gateStatus';

export const AllGatesDialog: React.FC<{
  loopId: string;
  matrix: CpmGateMatrix;
  flags?: readonly string[] | null;
  onGate: (gate: string) => void;
  onClose: () => void;
}> = ({ loopId, matrix, flags, onGate, onClose }) => createPortal(
  <Dialog open size="wide" title={`All gate results · ${loopId}`} onClose={onClose}>
    <div className="cpm-inv-allgates">
      <GateTierRow gates={matrix.gates.map(c => c.key)} tile={gate => (
        <button type="button" className="cpm-inv-gate__head" onClick={() => onGate(gate)}>
          <span className="cpm-inv-gate__name"><strong>{gate}</strong> · {gateName(gate)}</span>
          <GateBadge status={matrix.gates.find(c => c.key === gate)?.status} gate={gate} inputFlags={flags} />
        </button>
      )} />
    </div>
  </Dialog>,
  document.body,
);

export default AllGatesDialog;
