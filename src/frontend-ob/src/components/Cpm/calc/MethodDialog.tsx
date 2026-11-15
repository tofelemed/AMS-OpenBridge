/**
 * CHG-190 (owner review item 14): the Method button of the Calculations panel's Details grid. The formula, the unit it gives
 * (in the loop's unit, as the panel's Value row) and how it is computed, in a small dialog; subtitle the calculation's name.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../../ui/Dialog';
import type { CalcMethod } from '../calcMethods';
import { KvRow } from '../shared';

export const MethodDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  /** The calculation's name, under the title. */
  name: string;
  method: CalcMethod;
  /** The unit as the panel writes it (the loop's PV unit where the catalogue says PV units). */
  unit: string;
}> = ({ open, onClose, name, method, unit }) => {
  if (!open) return null;
  return createPortal(
    <Dialog open onClose={onClose} title="Method" subtitle={name}
      footer={<ObcButton variant="flat" onClick={onClose}>Close</ObcButton>}>
      <KvRow label="Formula"><span className="cpm-mono">{method.formula}</span></KvRow>
      <KvRow label="Unit">{unit}</KvRow>
      <p className="cpm-copy cpm-method-dialog__text">{method.text}</p>
    </Dialog>, document.body);
};

export default MethodDialog;
