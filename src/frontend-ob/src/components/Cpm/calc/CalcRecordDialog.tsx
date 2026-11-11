/**
 * CHG-166 (owner review, question 4): Record details of the selected calculation as a dialog, as on Window Inspector (it was a
 * closed disclosure that stretched the panel when opened). The rows are recordRows'; the dialog sits on the page body.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../../ui/Dialog';
import { KvRow } from '../shared';

export const CalcRecordDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  rows: Array<[label: string, value: string]>;
}> = ({ open, onClose, rows }) => {
  if (!open) return null;
  return createPortal(
    <Dialog open onClose={onClose} title="Record details" footer={<ObcButton variant="flat" onClick={onClose}>Close</ObcButton>}>
      {rows.map(([label, text]) => <KvRow key={label} label={label}>{text}</KvRow>)}
    </Dialog>, document.body);
};

export default CalcRecordDialog;
