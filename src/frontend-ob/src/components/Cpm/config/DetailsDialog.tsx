/**
 * CHG-169 (owner review): the page's identifier dialogs - Build details (the list foot), Record details (the bundle band) and the
 * Build part of Workers. Each hash shows short and copies whole (CopyableId), as the Technical details disclosures they replace
 * copied every value. The dialog sits on the page body, so a panel or a drawer never clips it.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../../ui/Dialog';
import { KvRow } from '../shared';
import { CopyableId } from '../evidence/CopyableId';
import type { ConfigCatalogue } from '../../../api/cpm/config';

/** A row: a plain value, or (`copy`) an identifier shown short and copied whole. */
export interface DetailRow { label: string; value?: React.ReactNode; copy?: string | null }

export const DetailRows: React.FC<{ rows: DetailRow[] }> = ({ rows }) => (
  <>
    {rows.map(r => (
      <KvRow key={r.label} label={r.label}>
        {r.copy !== undefined ? <CopyableId label={r.label.toLowerCase()} value={r.copy} /> : r.value}
      </KvRow>
    ))}
  </>
);

/** The catalogue's build identifiers (Technical details before CHG-169). */
export const buildRows = (catalogue: ConfigCatalogue | undefined): DetailRow[] => [
  { label: 'Catalogue hash', copy: catalogue?.catalogueHash ?? null },
  ...(catalogue ? [{ label: 'Catalogue properties', value: catalogue.count }, { label: 'Workers announced', value: catalogue.workers.length }] : []),
];

export const DetailsDialog: React.FC<{ title: string; open: boolean; onClose: () => void; rows?: DetailRow[]; children?: React.ReactNode }> = ({ title, open, onClose, rows, children }) =>
  (open ? createPortal(
    <Dialog open title={title} onClose={onClose} footer={<ObcButton variant="flat" onClick={onClose}>Close</ObcButton>}>
      <div className="cpm-config-details">
        {rows && <DetailRows rows={rows} />}
        {children}
      </div>
    </Dialog>, document.body) : null);

export default DetailsDialog;
