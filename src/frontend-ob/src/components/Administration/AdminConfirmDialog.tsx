/**
 * CHG-172 (owner review): the confirmation every Administration delete (and Reset to default) asks first. The question keeps its
 * words; the last button names the action ("Delete", "Reset to default"), never "Confirm". The dialog sits on the page body, so a
 * panel or its drawer never clips it. While the request runs both buttons wait; a refusal stays in the dialog.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../ui/Dialog';

export const AdminConfirmDialog: React.FC<{
  open: boolean;
  title: string;
  /** The action's name, on the last button. */
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  error?: string | null;
  children: React.ReactNode;
}> = ({ open, title, confirmLabel, onConfirm, onCancel, busy = false, error, children }) => {
  if (!open) return null;
  return createPortal(
    <Dialog open title={title} onClose={() => { if (!busy) onCancel(); }}
      footer={<>
        <ObcButton variant="flat" disabled={busy} onClick={onCancel}>Cancel</ObcButton>
        <ObcButton variant="raised" disabled={busy} onClick={onConfirm}>{confirmLabel}</ObcButton>
      </>}>
      <div className="cpm-admin-confirm">
        {children}
        {error && <p className="cpm-field__error" role="alert">{error}</p>}
      </div>
    </Dialog>, document.body);
};

export default AdminConfirmDialog;
