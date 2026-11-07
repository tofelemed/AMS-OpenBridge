/** What the user list no longer shows in the row: Email and Created, with Edit and Delete. Both actions keep their own steps (the edit form, the delete confirmation). */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../ui/Dialog';
import { KvRow } from '../Cpm/shared';
import type { AdminUser } from '../../api/usersApi';

export const UserRowDialog: React.FC<{
  user: AdminUser | null;
  deleting: boolean;
  onEdit: (u: AdminUser) => void;
  onDelete: (u: AdminUser) => void;
  onClose: () => void;
}> = ({ user, deleting, onEdit, onDelete, onClose }) => (
  <Dialog
    open={!!user}
    onClose={onClose}
    title={user?.username ?? ''}
    footer={user && (
      <div className="cpm-admin-dialog__actions">
        <ObcButton variant="flat" disabled={deleting} onClick={() => onDelete(user)}>Delete</ObcButton>
        <ObcButton variant="raised" onClick={() => onEdit(user)}>Edit</ObcButton>
      </div>
    )}
  >
    {user && (
      <div className="cpm-admin-dialog__facts">
        <KvRow label="Email">{user.email}</KvRow>
        <KvRow label="Created">{new Date(user.created_at).toLocaleDateString()}</KvRow>
      </div>
    )}
  </Dialog>
);

export default UserRowDialog;
