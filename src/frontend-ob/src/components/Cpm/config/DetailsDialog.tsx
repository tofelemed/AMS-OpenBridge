/**
 * CHG-169 (owner review): a plain dialog on the page body, so a panel or a drawer never clips it (Workers uses it). CHG-184 (owner
 * review item 0, Q6): the identifier rows it held - Build details, Record details and the Build part of Workers, each hash short
 * and copyable - went, and with them the row and copy support.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../../ui/Dialog';

export const DetailsDialog: React.FC<{ title: string; open: boolean; onClose: () => void; children?: React.ReactNode }> = ({ title, open, onClose, children }) =>
  (open ? createPortal(
    <Dialog open title={title} onClose={onClose} footer={<ObcButton variant="flat" onClick={onClose}>Close</ObcButton>}>
      <div className="cpm-config-details">{children}</div>
    </Dialog>, document.body) : null);

export default DetailsDialog;
