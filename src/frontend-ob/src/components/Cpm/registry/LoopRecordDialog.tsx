/**
 * CHG-168 (owner review): Record details of the selected loop, a dialog as on Calculations and Loop Events. It holds the loop's
 * secondary facts (objective · topology · command, acquisition, how the model was set), which were rows of the loop's page and a
 * ? beside its model. The dialog sits on the page body, so it opens the same from the panel and from the drawer.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../../ui/Dialog';
import { KvRow } from '../shared';
import type { RecordRow } from './loopPanelFacts';

export const LoopRecordDialog: React.FC<{ open: boolean; onClose: () => void; rows: RecordRow[] }> = ({ open, onClose, rows }) => {
  if (!open) return null;
  return createPortal(
    <Dialog open onClose={onClose} title="Record details" footer={<ObcButton variant="flat" onClick={onClose}>Close</ObcButton>}>
      {rows.map(r => (
        <KvRow key={r.label} label={r.label}>
          {r.value}
          {r.sub && <div className="cpm-event-row__sub">{r.sub}</div>}
        </KvRow>
      ))}
    </Dialog>, document.body);
};

export default LoopRecordDialog;
