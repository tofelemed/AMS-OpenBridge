/**
 * CHG-172 (owner review, the approved sample, badge 5): the selected user in the panel beside the list (it was a dialog; a drawer
 * below 1280 px). The user name once, the full name under it, the status; Email, Role (with Permissions ↗ for a role manager)
 * and Created; Delete and Edit in the foot. On your own account Delete is disabled with the reason on screen (it was a toast
 * after the click); the server refuses it as well.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Inspector } from '../../../ui/Inspector';
import { KvRow, TonePill } from '../../Cpm/shared';
import { ReasonedButton } from '../../Cpm/ReasonedButton';
import { adminHref } from '../../Cpm/cpaHref';
import type { AdminUser } from '../../../api/usersApi';
import { dayStamp } from '../adminTime';

export const OWN_DELETE = 'You cannot delete your own account.';

export const UserStatus: React.FC<{ active: boolean }> = ({ active }) =>
  (active ? <TonePill tone="good" glyph="✓">Active</TonePill> : <TonePill tone="muted" glyph="⊘">Inactive</TonePill>);

export const UserPanel: React.FC<{
  user: AdminUser;
  isSelf: boolean;
  canRoles: boolean;
  open: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ user, isSelf, canRoles, open, onClose, onEdit, onDelete }) => {
  const navigate = useNavigate();
  return (
    <Inspector title={user.username} open={open} onClose={onClose} meta={<UserStatus active={user.is_active} />}
      primaryAction={
        <div className="cpm-admin-foot">
          <ReasonedButton variant="flat" disabled={isSelf} reason={OWN_DELETE} onClick={onDelete}>Delete</ReasonedButton>
          <ObcButton variant="raised" onClick={onEdit}>Edit</ObcButton>
        </div>
      }>
      {user.full_name && <p className="cpm-reg-panel__service">{user.full_name}</p>}
      <KvRow label="Email">{user.email}</KvRow>
      <KvRow label="Role">
        <span className="cpm-admin-inline">
          {user.role}
          {canRoles && (
            <ObcButton variant="flat" onClick={() => navigate(`${adminHref('roles')}?role=${encodeURIComponent(user.role)}`)}>
              Permissions {'↗'}
            </ObcButton>
          )}
        </span>
      </KvRow>
      <KvRow label="Created">{dayStamp(user.created_at)}</KvRow>
    </Inspector>
  );
};

export default UserPanel;
